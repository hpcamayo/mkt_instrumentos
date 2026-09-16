import { NextResponse } from "next/server";
import {
  MAX_LISTING_PHOTOS,
  MIN_LISTING_PHOTOS,
  isInstrumentTypeValid,
  sanitizeListingAttributes,
} from "@/lib/listing-submission";
import { categoryOptions, conditionOptions } from "@/lib/listings";
import { normalizePeruRegion } from "@/lib/location";
import { parseWholeSolPrice } from "@/lib/price";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import type { Json } from "@/lib/supabase/database.types";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

type RouteContext = { params: Promise<{ id: string }> };

type PhotoInput = {
  image_url?: unknown;
  path?: unknown;
  alt_text?: unknown;
};

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return failure("Solicitud inválida.");
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) return failure("No se pudo validar tu cuenta.", 503);
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return failure("Ingresa a tu cuenta.", 401);

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select(
      "id,owner_user_id,status,title,category,instrument_type,brand,model,condition,price_pen,city,region,description,attributes,listing_photos(image_url,alt_text,sort_order)",
    )
    .eq("id", id)
    .maybeSingle();
  if (listingError || !listing || listing.owner_user_id !== userData.user.id) {
    return failure("No encontramos una publicación administrable.", 404);
  }

  if (["hide", "restore", "sold"].includes(body.action)) {
    const { data, error } = await supabase.rpc("set_owned_listing_lifecycle", {
      p_listing_id: id,
      p_action: body.action,
    });
    if (error) return rpcFailure(error.message);
    return NextResponse.json({ ok: true, listing: data });
  }

  if (body.action === "relist") {
    const { data, error } = await supabase.rpc("relist_sold_listing", {
      p_listing_id: id,
    });
    if (error) return rpcFailure(error.message);
    return NextResponse.json({ ok: true, listing: data });
  }

  if (body.action === "resubmit") {
    const { data, error } = await supabase.rpc("submit_listing_for_publication", {
      p_listing_id: id,
    });
    if (error) return rpcFailure(error.message);
    return NextResponse.json({ ok: true, listing: data });
  }

  if (body.action !== "edit") return failure("Acción no compatible.");

  const { data: pendingRevision, error: pendingRevisionError } = await supabase
    .from("listing_revisions")
    .select("changed_fields,category,instrument_type,listing_revision_photos(image_url,alt_text,sort_order)")
    .eq("listing_id", id)
    .eq("status", "pending")
    .maybeSingle();
  if (pendingRevisionError) {
    return failure("No se pudo cargar la propuesta pendiente.", 409);
  }

  const pendingFields = new Set(pendingRevision?.changed_fields ?? []);
  const validation = validateEdit(body.immediate, body.moderated, {
    ...listing,
    category: pendingFields.has("category")
      ? pendingRevision?.category ?? listing.category
      : listing.category,
    instrument_type: pendingFields.has("instrument_type")
      ? pendingRevision?.instrument_type ?? listing.instrument_type
      : listing.instrument_type,
  });
  if (!validation.ok) return failure(validation.message);

  const photoResult = await resolvePhotos(
    body.photos,
    [
      ...(listing.listing_photos ?? []),
      ...(pendingRevision?.listing_revision_photos ?? []),
    ],
    userData.user.id,
    id,
  );
  if (!photoResult.ok) {
    await cleanupUploads(photoResult.newPaths);
    return failure(photoResult.message);
  }

  const { data, error } = await supabase.rpc("update_owned_listing", {
    p_listing_id: id,
    p_immediate: validation.immediate as Json,
    p_moderated: validation.moderated as Json,
    p_photos: photoResult.photos as Json | null,
  });
  if (error) {
    await cleanupUploads(photoResult.newPaths);
    return rpcFailure(error.message);
  }

  return NextResponse.json({ ok: true, result: data });
}

function validateEdit(
  immediateInput: unknown,
  moderatedInput: unknown,
  listing: {
    category: string;
    instrument_type: string | null;
  },
) {
  const immediateSource = asObject(immediateInput);
  const moderatedSource = asObject(moderatedInput);
  if (!immediateSource || !moderatedSource) {
    return { ok: false as const, message: "Los cambios enviados no son válidos." };
  }

  const immediate: Record<string, Json> = {};
  const moderated: Record<string, Json> = {};
  const price = parseWholeSolPrice(immediateSource.price_pen);
  if (immediateSource.price_pen !== undefined) {
    if (price === null) {
      return { ok: false as const, message: "Ingresa un precio válido en soles enteros." };
    }
    immediate.price_pen = price;
  }

  for (const key of ["description", "city", "region"] as const) {
    if (immediateSource[key] === undefined) continue;
    const value = readText(immediateSource[key], key === "description" ? 10000 : 500);
    if (!value) return { ok: false as const, message: "Completa los campos obligatorios." };
    if (key === "description" && value.length < 40) {
      return { ok: false as const, message: "La descripción debe tener al menos 40 caracteres." };
    }
    if (key === "region") {
      const region = normalizePeruRegion(value);
      if (!region) return { ok: false as const, message: "Selecciona una región válida." };
      immediate.region = region;
    } else {
      immediate[key] = value;
    }
  }

  const category =
    moderatedSource.category === undefined
      ? listing.category
      : readText(moderatedSource.category);
  const instrumentType =
    moderatedSource.instrument_type === undefined
      ? listing.instrument_type ?? ""
      : readText(moderatedSource.instrument_type);
  if (!categoryOptions.some((option) => option.value === category)) {
    return { ok: false as const, message: "Selecciona una categoría válida." };
  }
  if (!isInstrumentTypeValid(category, instrumentType)) {
    return { ok: false as const, message: "Selecciona un tipo de instrumento válido." };
  }

  for (const key of ["title", "category", "instrument_type", "brand", "model", "condition"] as const) {
    if (moderatedSource[key] === undefined) continue;
    const value = readText(moderatedSource[key]);
    if (!value) return { ok: false as const, message: "Completa los campos principales." };
    if (key === "condition" && !conditionOptions.some((option) => option === value)) {
      return { ok: false as const, message: "Selecciona una condición válida." };
    }
    moderated[key] = value;
  }

  if (immediateSource.attributes !== undefined) {
    const attributes = sanitizeListingAttributes(
      instrumentType,
      immediateSource.attributes,
    );
    if (!attributes) {
      return { ok: false as const, message: "Revisa los atributos del instrumento." };
    }
    immediate.attributes = attributes as Json;
  }

  return { ok: true as const, immediate, moderated };
}

async function resolvePhotos(
  input: unknown,
  existingPhotos: { image_url: string; alt_text: string | null; sort_order: number }[],
  userId: string,
  listingId: string,
) {
  if (input === undefined || input === null) {
    return { ok: true as const, photos: null, newPaths: [] as string[] };
  }
  if (!Array.isArray(input) || input.length < MIN_LISTING_PHOTOS || input.length > MAX_LISTING_PHOTOS) {
    return { ok: false as const, message: `Agrega entre ${MIN_LISTING_PHOTOS} y ${MAX_LISTING_PHOTOS} fotos.`, newPaths: [] as string[] };
  }

  const allowedUrls = new Set(existingPhotos.map((photo) => photo.image_url));
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false as const, message: "No se pudieron verificar las fotos.", newPaths: [] as string[] };
  const photos: { image_url: string; alt_text: string }[] = [];
  const newPaths: string[] = [];

  for (const raw of input as PhotoInput[]) {
    if (!raw || typeof raw !== "object") {
      return { ok: false as const, message: "Foto inválida.", newPaths };
    }
    const altText = readText(raw.alt_text) || "Foto de la publicación";
    if (typeof raw.image_url === "string" && allowedUrls.has(raw.image_url)) {
      photos.push({ image_url: raw.image_url, alt_text: altText });
      continue;
    }
    if (
      typeof raw.path !== "string" ||
      !new RegExp(
        `^${escapeRegExp(userId)}/listing-edits/${escapeRegExp(listingId)}/[0-9a-f-]{36}/(?:[0-9]|[1-9][0-9])\\.(jpg|png|webp)$`,
      ).test(raw.path)
    ) {
      return { ok: false as const, message: "Foto inválida.", newPaths };
    }
    const segments = raw.path.split("/");
    const folder = segments.slice(0, -1).join("/");
    const filename = segments.at(-1)!;
    const { data: objects, error } = await admin.storage
      .from("listing-photos")
      .list(folder, { limit: 20 });
    if (error || !objects?.some((object) => object.name === filename)) {
      return { ok: false as const, message: "Falta subir una foto. Intenta nuevamente.", newPaths };
    }
    newPaths.push(raw.path);
    photos.push({
      image_url: admin.storage.from("listing-photos").getPublicUrl(raw.path).data.publicUrl,
      alt_text: altText,
    });
  }

  if (new Set(photos.map((photo) => photo.image_url)).size !== photos.length) {
    return { ok: false as const, message: "No repitas la misma foto.", newPaths };
  }
  return { ok: true as const, photos, newPaths };
}

async function cleanupUploads(paths: string[]) {
  if (!paths.length) return;
  const admin = getSupabaseAdminClient();
  if (admin) await admin.storage.from("listing-photos").remove(paths);
}

function rpcFailure(message: string) {
  if (message.includes("STORE_INVENTORY_LIMIT_REACHED")) {
    return failure("Tu tienda alcanzó el límite de 50 publicaciones concurrentes.", 409);
  }
  if (message.includes("LISTING_REVISION_STALE")) return failure("La propuesta cambió. Recarga la página e intenta nuevamente.", 409);
  if (message.includes("ADMIN_HIDDEN_LISTING")) {
    return failure("Esta publicación fue ocultada por moderación y no puede modificarse.", 409);
  }
  if (message.includes("SOLD_LISTING_IMMUTABLE")) {
    return failure("La publicación vendida es un registro histórico y no puede modificarse.", 409);
  }
  return failure("No se pudo completar la acción. Revisa el estado e intenta nuevamente.", 409);
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readText(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function failure(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}
