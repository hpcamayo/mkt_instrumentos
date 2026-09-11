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
    ["listing", "store", "store_listing"].includes(body.kind)
  ) {
    const account =
      body.kind === "listing"
        ? await getListingAccount()
        : await getStoreOwnerAccount(body.kind === "store_listing");
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
  if (kind === "listing" || kind === "store" || kind === "store_listing") {
    const account =
      kind === "listing"
        ? await getListingAccount()
        : await getStoreOwnerAccount(
            kind === "store_listing",
            kind === "store" ? id : undefined,
          );
    if (!account.ok) return failure(account.message, account.status);
    if (!ownerUserId || ownerUserId !== account.userId) {
      return failure("Este envío pertenece a otra cuenta.", 403);
    }
  }
  const table = kind === "store" ? "stores" : "listings";
  const bucket = kind === "store" ? "store-assets" : "listing-photos";
  const folder = `${ownerUserId}/${id}`;
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
  const isListing = kind === "listing" || kind === "store_listing";
  const names =
    isListing
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
          "razon_social",
          "ruc",
          "email",
          "city",
          "region",
          "address",
          "whatsapp_phone",
          "contact_person",
        ];
  for (const name of names) {
    const value = typeof input[name] === "string" ? input[name].trim() : "";
    if (!value || value.length > (name === "description" ? 10000 : 500))
      return failure("Completa los campos obligatorios.");
    fields[name] = value;
  }
  if (
    kind === "store" &&
    !/^\d{9,15}$/.test(normalizePhone(String(fields.whatsapp_phone)))
  ) {
    return failure("Ingresa un WhatsApp válido.");
  }
  if (kind === "store" && !/^\d{11}$/.test(normalizePhone(String(fields.ruc)))) {
    return failure("Ingresa un RUC válido de 11 dígitos.");
  }
  if (kind === "store" && !isEmail(String(fields.email))) {
    return failure("Ingresa un correo comercial válido.");
  }
  if (isListing) {
    const account =
      kind === "listing"
        ? await getListingAccount()
        : await getStoreOwnerAccount(true);
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
    if (kind === "listing") {
      fields.contact_name = account.profile.full_name;
      fields.whatsapp_phone = normalizePhone(String(account.profile.phone));
    } else {
      const storeAccount = await getStoreOwnerAccount(true);
      if (!storeAccount.ok) return failure(storeAccount.message, storeAccount.status);
      fields.owner_user_id = storeAccount.userId;
      fields.store_id = storeAccount.store.id;
    }
    fields.marketplace_rules_accepted = true;
  } else {
    const region = normalizePeruRegion(String(fields.region));
    if (!region) return failure("Selecciona una región válida.");
    fields.region = region;
    fields.ruc = normalizePhone(String(fields.ruc));
    fields.whatsapp_phone = normalizePhone(String(fields.whatsapp_phone));
    fields.owner_user_id = ownerUserId;
    fields.district = optionalText(input.district);
    fields.description = optionalText(input.description, 10000);
    for (const name of ["instagram_url", "facebook_url", "tiktok_url", "website_url"]) {
      const value = optionalText(input[name]);
      if (value && !isHttpUrl(value)) return failure("Revisa los enlaces de la tienda.");
      fields[name] = value;
    }
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
  const roles: unknown = body.roles;
  if (
    !Array.isArray(paths) ||
    (isListing
      ? paths.length < MIN_LISTING_PHOTOS || paths.length > MAX_LISTING_PHOTOS
      : paths.length > 7) ||
    !Array.isArray(roles) ||
    roles.length !== paths.length
  )
    return failure("Revisa las fotos del envío.");
  const { data: objects, error: storageError } = await client.storage
    .from(bucket)
    .list(folder, { limit: 100 });
  if (storageError) return failure("No se pudieron verificar las fotos.", 503);
  const photos: { image_url: string; alt_text: string; role?: string }[] = [];
  for (const [index, path] of paths.entries()) {
    if (
      typeof path !== "string" ||
      !new RegExp(
        `^${escapeRegExp(folder)}/(?:[0-9]|[1-9][0-9])\\.(jpg|png|webp)$`,
      ).test(path)
    )
      return failure("Foto inválida.");
    if (!objects?.some((object) => `${folder}/${object.name}` === path))
      return failure("Falta subir una foto. Intenta nuevamente.");
    const role = roles[index];
    if (
      kind === "store" &&
      role !== "logo" &&
      role !== "banner" &&
      role !== "store_photo"
    ) return failure("Tipo de imagen de tienda inválido.");
    if (isListing && role !== null) return failure("Foto inválida.");
    photos.push({
      image_url: client.storage.from(bucket).getPublicUrl(path).data.publicUrl,
      alt_text: `Foto de ${title}`,
      ...(kind === "store" ? { role } : {}),
    });
  }
  if (new Set(paths).size !== paths.length) return failure("Fotos duplicadas.");
  if (kind === "store") {
    const storeRoles = roles as string[];
    if (storeRoles.filter((role) => role === "logo").length > 1 ||
        storeRoles.filter((role) => role === "banner").length > 1 ||
        storeRoles.filter((role) => role === "store_photo").length > 5) {
      return failure("Revisa las imágenes opcionales de la tienda.");
    }
  }
  const { error } = await client.rpc("complete_public_submission", {
    p_id: id,
    p_kind: kind,
    p_fields: fields as Json,
    p_photos: photos,
  });
  if (error?.message.includes("stores_ruc_unique_idx"))
    return failure("Ya existe una tienda registrada con este RUC.", 409);
  if (error?.message.includes("stores_owner_user_unique_idx"))
    return failure("Esta cuenta ya tiene una solicitud de tienda.", 409);
  if (error?.message.includes("STORE_INVENTORY_LIMIT_REACHED"))
    return failure("Tu tienda alcanzó el límite de 50 publicaciones concurrentes.", 409);
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

async function getStoreOwnerAccount(requireStore: boolean, allowedStoreId?: string) {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return { ok: false as const, message: "No se pudo validar tu cuenta.", status: 503 };
  }
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false as const, message: "Ingresa con tu cuenta de Tienda.", status: 401 };
  }
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name,phone,city,region,account_type")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError || !profile || profile.account_type !== "store_owner") {
    return {
      ok: false as const,
      message: "Usa una cuenta de Tienda separada de tu cuenta Particular.",
      status: 403,
    };
  }
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id,status,is_verified")
    .eq("owner_user_id", userData.user.id)
    .maybeSingle();
  if (storeError) {
    return { ok: false as const, message: "No se pudo validar tu tienda.", status: 503 };
  }
  if (!requireStore && store && store.id !== allowedStoreId) {
    return {
      ok: false as const,
      message: "Esta cuenta ya tiene una solicitud de tienda.",
      status: 409,
    };
  }
  if (requireStore && (!store || !["pending", "active"].includes(store.status))) {
    return {
      ok: false as const,
      message: store?.status === "rejected"
        ? "Corrige la solicitud rechazada antes de enviar inventario."
        : "Necesitas una solicitud de tienda pendiente o aprobada.",
      status: 422,
    };
  }
  return {
    ok: true as const,
    userId: userData.user.id,
    profile,
    store: store!,
  };
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function optionalText(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function failure(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}
