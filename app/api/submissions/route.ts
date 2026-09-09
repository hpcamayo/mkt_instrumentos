import { NextResponse } from "next/server";
import { categoryOptions, cityOptions, conditionOptions } from "@/lib/listings";
import { normalizePeruRegion } from "@/lib/location";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import {
  createSubmissionToken,
  readSubmissionToken,
} from "@/lib/submission-token";

export async function POST(request: Request) {
  const client = getSupabaseAdminClient();
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!client || !secret) return failure("No se pudo iniciar el envío.", 503);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return failure("Solicitud inválida.");
  if (
    body.action === "start" &&
    (body.kind === "listing" || body.kind === "store")
  ) {
    return NextResponse.json(createSubmissionToken(body.kind, secret));
  }
  const submission =
    typeof body.token === "string"
      ? readSubmissionToken(body.token, secret)
      : null;
  if (!submission) return failure("El envío no es válido.", 403);
  const { id, kind } = submission;
  const table = kind === "listing" ? "listings" : "stores";
  const bucket = kind === "listing" ? "listing-photos" : "store-assets";
  const folder = `pending/${id}`;
  const { data: existing, error: lookupError } = await client
    .from(table)
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (lookupError)
    return failure("No se pudo verificar el envío. Intenta nuevamente.", 503);
  // A lost success response must never cause cleanup of a completed submission.
  if (existing) return NextResponse.json({ ok: true, completed: true });
  if (body.action === "cleanup") {
    const { data: objects, error } = await client.storage
      .from(bucket)
      .list(folder, { limit: 100 });
    if (error)
      return failure(
        "No se pudieron limpiar las fotos. Puedes reintentar.",
        503,
      );
    const paths = (objects ?? []).map((object) => `${folder}/${object.name}`);
    if (paths.length) {
      const { error: removeError } = await client.storage
        .from(bucket)
        .remove(paths);
      if (removeError)
        return failure(
          "No se pudieron limpiar las fotos. Puedes reintentar.",
          503,
        );
    }
    return NextResponse.json({ ok: true });
  }
  if (body.action !== "complete") return failure("Solicitud inválida.");
  const input = body.fields;
  if (!input || typeof input !== "object" || Array.isArray(input))
    return failure("Datos inválidos.");
  const fields: Record<string, string | number> = {};
  const names =
    kind === "listing"
      ? [
          "title",
          "category",
          "brand",
          "model",
          "condition",
          "city",
          "contact_name",
          "whatsapp_phone",
          "description",
        ]
      : [
          "name",
          "city",
          "region",
          "district",
          "address",
          "whatsapp_phone",
          "description",
        ];
  for (const name of names) {
    const value = typeof input[name] === "string" ? input[name].trim() : "";
    if (!value || value.length > (name === "description" ? 10000 : 500))
      return failure("Completa los campos obligatorios.");
    fields[name] = value;
  }
  if (!/^\d{9,15}$/.test(String(fields.whatsapp_phone)))
    return failure("Ingresa un WhatsApp válido.");
  if (kind === "listing") {
    if (
      !categoryOptions.some((option) => option.value === fields.category) ||
      !conditionOptions.some((value) => value === fields.condition) ||
      !cityOptions.some((value) => value === fields.city)
    )
      return failure("Revisa la categoría, condición y ciudad.");
    const price = Number(input.price_pen);
    if (!Number.isSafeInteger(price) || price < 0 || price > 2147483647)
      return failure("Ingresa un precio válido en soles enteros.");
    fields.price_pen = price;
    fields.region = fields.city === "Huancayo" ? "Junín" : fields.city;
  } else {
    const region = normalizePeruRegion(String(fields.region));
    if (!region) return failure("Selecciona una región válida.");
    fields.region = region;
    for (const name of ["instagram_url", "facebook_url"])
      fields[name] =
        typeof input[name] === "string" ? input[name].trim().slice(0, 500) : "";
  }
  const title = String(fields.title ?? fields.name);
  const slug =
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100)
      .replace(/-$/, "") || "publicacion";
  fields.slug = `${slug}-${id}`;
  const paths: unknown = body.paths;
  if (
    !Array.isArray(paths) ||
    (kind === "listing"
      ? paths.length < 1 || paths.length > 6
      : paths.length !== 2)
  )
    return failure("Revisa las fotos del envío.");
  const { data: objects, error: storageError } = await client.storage
    .from(bucket)
    .list(folder, { limit: 100 });
  if (storageError) return failure("No se pudieron verificar las fotos.", 503);
  const photos: { image_url: string; alt_text: string }[] = [];
  for (const path of paths) {
    if (
      typeof path !== "string" ||
      !new RegExp(`^pending/${id}/[0-5]\\.(jpg|png|webp)$`).test(path)
    )
      return failure("Foto inválida.");
    if (!objects?.some((object) => `${folder}/${object.name}` === path))
      return failure("Falta subir una foto. Intenta nuevamente.");
    photos.push({
      image_url: client.storage.from(bucket).getPublicUrl(path).data.publicUrl,
      alt_text: `Foto de ${title}`,
    });
  }
  if (new Set(paths).size !== paths.length) return failure("Fotos duplicadas.");
  const { error } = await client.rpc("complete_public_submission", {
    p_id: id,
    p_kind: kind,
    p_fields: fields,
    p_photos: photos,
  });
  if (error)
    return failure(
      "No se pudo guardar el envío. Reintenta sin cerrar esta página.",
      503,
    );
  return NextResponse.json({ ok: true, completed: true });
}

function failure(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}
