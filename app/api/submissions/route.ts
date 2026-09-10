import { NextResponse } from "next/server";
import {
  MAX_LISTING_PHOTOS,
  MIN_LISTING_PHOTOS,
  isInstrumentTypeValid,
  sanitizeListingAttributes,
} from "@/lib/listing-submission";
import { categoryOptions, conditionOptions } from "@/lib/listings";
import { normalizePeruRegion } from "@/lib/location";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";
import type { Json } from "@/lib/supabase/database.types";
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
    if (body.kind === "store") {
      const started = createSubmissionToken(body.kind, secret);
      return NextResponse.json({ ...started, folder: `pending/${started.id}` });
    }

    const account = await getListingAccount();
    if (!account.ok) return failure(account.message, account.status);
    const started = createSubmissionToken(body.kind, secret, account.userId);
    return NextResponse.json({
      ...started,
      folder: `${account.userId}/${started.id}`,
    });
  }
  const submission =
    typeof body.token === "string"
      ? readSubmissionToken(body.token, secret)
      : null;
  if (!submission) return failure("El envío no es válido.", 403);
  const { id, kind, ownerUserId } = submission;
  if (kind === "listing") {
    const account = await getListingAccount();
    if (!account.ok) return failure(account.message, account.status);
    if (!ownerUserId || ownerUserId !== account.userId) {
      return failure("Este envío pertenece a otra cuenta.", 403);
    }
  }
  const table = kind === "listing" ? "listings" : "stores";
  const bucket = kind === "listing" ? "listing-photos" : "store-assets";
  const folder =
    kind === "listing" && ownerUserId
      ? `${ownerUserId}/${id}`
      : `pending/${id}`;
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
  const fields: Record<string, unknown> = {};
  const names =
    kind === "listing"
      ? [
          "title",
          "category",
          "brand",
          "model",
          "condition",
          "city",
          "region",
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
  if (
    kind === "store" &&
    !/^\d{9,15}$/.test(String(fields.whatsapp_phone))
  ) {
    return failure("Ingresa un WhatsApp válido.");
  }
  if (kind === "listing") {
    const account = await getListingAccount();
    if (!account.ok) return failure(account.message, account.status);
    if (
      !categoryOptions.some((option) => option.value === fields.category) ||
      !conditionOptions.some((value) => value === fields.condition) ||
      !normalizePeruRegion(String(fields.region))
    )
      return failure("Revisa la categoría, condición y ubicación.");
    const instrumentType =
      typeof input.instrument_type === "string"
        ? input.instrument_type.trim()
        : "";
    if (!isInstrumentTypeValid(String(fields.category), instrumentType)) {
      return failure("Selecciona un tipo de instrumento válido.");
    }
    const attributes = sanitizeListingAttributes(
      instrumentType,
      input.attributes,
    );
    if (!attributes) return failure("Revisa los atributos del instrumento.");
    const price = Number(input.price_pen);
    if (!Number.isSafeInteger(price) || price <= 0 || price > 2147483647)
      return failure("Ingresa un precio válido en soles enteros.");
    if (String(fields.description).length < 40)
      return failure("La descripción debe tener al menos 40 caracteres.");
    if (input.marketplace_rules_accepted !== true)
      return failure("Debes aceptar las reglas del marketplace.");
    fields.price_pen = price;
    fields.region = normalizePeruRegion(String(fields.region))!;
    fields.instrument_type = instrumentType;
    fields.attributes = attributes;
    fields.owner_user_id = account.userId;
    fields.contact_name = account.profile.full_name;
    fields.whatsapp_phone = normalizePhone(String(account.profile.phone));
    fields.marketplace_rules_accepted = true;
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
      ? paths.length < MIN_LISTING_PHOTOS || paths.length > MAX_LISTING_PHOTOS
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
      !new RegExp(
        `^${escapeRegExp(folder)}/(?:[0-9])\\.(jpg|png|webp)$`,
      ).test(path)
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
    p_fields: fields as Json,
    p_photos: photos,
  });
  if (error)
    return failure(
      "No se pudo guardar el envío. Reintenta sin cerrar esta página.",
      503,
    );
  return NextResponse.json({ ok: true, completed: true });
}

async function getListingAccount() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return { ok: false as const, message: "No se pudo validar tu cuenta.", status: 503 };
  }
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false as const, message: "Ingresa a tu cuenta para publicar.", status: 401 };
  }
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name,phone,city,region,account_type")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (
    profileError ||
    !profile ||
    profile.account_type !== "seller" ||
    !profile.full_name?.trim() ||
    !profile.phone?.trim() ||
    !/^\d{9,15}$/.test(normalizePhone(profile.phone)) ||
    !profile.city?.trim() ||
    !normalizePeruRegion(profile.region)
  ) {
    return {
      ok: false as const,
      message: "Completa tu perfil de Particular antes de publicar.",
      status: 422,
    };
  }
  return { ok: true as const, userId: userData.user.id, profile };
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function failure(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}
