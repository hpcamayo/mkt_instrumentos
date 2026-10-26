import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { checkPhoto, PHOTO_MAX_BYTES } from "@/lib/store-import/photo-check";
import { completePhotoUploads, PHOTO_BUCKET, requestPhotoUploads } from "@/lib/store-import/photos-server";
import { createImportSession, ImportRequestError } from "@/lib/store-import/server";
import { storeReachDb } from "@/lib/store-reach-db";
import {
  fetchCategoryPath,
  fetchDescription,
  fetchItemIds,
  fetchItems,
  fetchPhoto,
  mapLimited,
  MercadoLibreError,
  refreshTokens,
  type Fetcher,
} from "./api";
import type { MercadoLibreConfig } from "./config";
import { decryptToken, encryptToken } from "./crypto";
import {
  ML_IMPORT_MAX_ITEMS,
  ML_ITEM_ID,
  mlCategoryLabel,
  mlImportCsv,
  mlImportPhotos,
  mlImportSummary,
  mlItemRows,
  parseMlSummaryItem,
  type MlImportRow,
} from "./mapping";

// reach-01 "Importar desde Mercado Libre": what the routes do. The owner's own session creates the import, uploads its
// file and asks for photo slots, exactly as the wizard does from the browser; only reading and refreshing the stored
// tokens uses the service role, for the owner the route checked.

type Db = SupabaseClient;

export type Connection = { storeId: string; userId: number; accessToken: string };

// The owner's connection with a usable access token, refreshing it when it is about to expire. Null when not connected.
export async function ownerConnection(config: MercadoLibreConfig, ownerUserId: string, fetcher: Fetcher = fetch): Promise<Connection | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new MercadoLibreError("MERCADOLIBRE_OFF", "La importación desde Mercado Libre no está disponible por ahora.", 503);
  const db = storeReachDb(admin);
  const { data, error } = await db.rpc("get_mercadolibre_tokens", { p_owner_user_id: ownerUserId });
  if (error) throw new MercadoLibreError("MERCADOLIBRE_UNAVAILABLE", "No pudimos leer tu conexión. Intenta de nuevo.", 503);
  const row = data as { store_id?: string; ml_user_id?: number; access_token_enc?: string; refresh_token_enc?: string | null; expires_at?: string } | null;
  if (!row?.store_id || !row.access_token_enc || !row.ml_user_id) return null;
  const accessToken = decryptToken(config.key, row.store_id, row.access_token_enc);
  if (!accessToken) throw new MercadoLibreError("MERCADOLIBRE_AUTH", "Vuelve a conectar tu cuenta de Mercado Libre.", 401);
  if (Date.parse(row.expires_at ?? "") > Date.now() + 5 * 60_000) return { storeId: row.store_id, userId: row.ml_user_id, accessToken };

  const refreshToken = row.refresh_token_enc ? decryptToken(config.key, row.store_id, row.refresh_token_enc) : null;
  if (!refreshToken) throw new MercadoLibreError("MERCADOLIBRE_AUTH", "La conexión con Mercado Libre venció. Vuelve a conectar tu cuenta.", 401);
  const tokens = await refreshTokens(config, refreshToken, fetcher).catch((failure) => {
    if (failure instanceof MercadoLibreError && failure.code === "MERCADOLIBRE_TOKEN_INVALID") {
      throw new MercadoLibreError("MERCADOLIBRE_AUTH", "La conexión con Mercado Libre venció. Vuelve a conectar tu cuenta.", 401);
    }
    throw failure;
  });
  // Mercado Libre's refresh tokens are single use: the new pair replaces the old one, unless another request already did.
  await db.rpc("update_mercadolibre_tokens", {
    p_store_id: row.store_id,
    p_previous_access_token_enc: row.access_token_enc,
    p_access_token_enc: encryptToken(config.key, row.store_id, tokens.accessToken),
    p_refresh_token_enc: tokens.refreshToken ? encryptToken(config.key, row.store_id, tokens.refreshToken) : null,
    p_expires_at: tokens.expiresAt.toISOString(),
  });
  return { storeId: row.store_id, userId: row.ml_user_id, accessToken: tokens.accessToken };
}

export async function listItems(connection: Connection, offset: number, fetcher: Fetcher = fetch) {
  const page = await fetchItemIds(connection.accessToken, connection.userId, offset, fetcher);
  const items = await fetchItems(connection.accessToken, page.ids, connection.userId, fetcher);
  const byId = new Map(items.map((item) => [item.id, item]));
  return {
    total: page.total,
    offset: page.offset,
    items: page.ids.map((id) => parseMlSummaryItem(byId.get(id))).filter((item) => item !== null),
  };
}

// Reads the chosen publications, builds the import file and starts the import with it. Returns the session to open in
// the wizard and what the store will have to complete there.
export async function prepareImport(db: Db, connection: Connection, itemIds: string[], fetcher: Fetcher = fetch) {
  const ids = [...new Set(itemIds.filter((id) => ML_ITEM_ID.test(id)))].slice(0, ML_IMPORT_MAX_ITEMS);
  if (!ids.length) throw new MercadoLibreError("MERCADOLIBRE_SELECTION_EMPTY", "Elige al menos una publicación.", 400);
  const items = await fetchItems(connection.accessToken, ids, connection.userId, fetcher);
  if (!items.length) throw new MercadoLibreError("MERCADOLIBRE_SELECTION_EMPTY", "No encontramos esas publicaciones en tu cuenta de Mercado Libre.", 400);

  const categories = [...new Set(items.map((item) => item.category_id).filter((id): id is string => Boolean(id)))];
  const paths = new Map(await mapLimited(categories, 6, async (id) => [id, await fetchCategoryPath(id, fetcher)] as const));
  const descriptions = await mapLimited(items, 8, (item) => fetchDescription(connection.accessToken, item.id, fetcher));

  const taken = new Set<string>();
  const rows: MlImportRow[] = items.flatMap((item, index) =>
    mlItemRows(item, descriptions[index], mlCategoryLabel(paths.get(item.category_id ?? "") ?? []), taken));
  const csv = Buffer.from(mlImportCsv(rows), "utf8");
  const date = new Date().toISOString().slice(0, 10);

  let created: Awaited<ReturnType<typeof createImportSession>>;
  try {
    created = await createImportSession(db, { fileName: `mercado-libre-${date}.csv`, format: "csv", bytes: csv.byteLength });
  } catch (error) {
    if (error instanceof ImportRequestError) throw new MercadoLibreError(error.code, error.userMessage, error.status);
    throw error;
  }
  // Photos first, while the import still waits for its file: record_mercadolibre_import_photos only accepts it then.
  const photos = mlImportPhotos(rows);
  if (photos.length) {
    const { error } = await storeReachDb(db).rpc("record_mercadolibre_import_photos", { p_session_id: created.session.id, p_photos: photos });
    if (error) throw new MercadoLibreError("MERCADOLIBRE_UNAVAILABLE", "No pudimos preparar las fotos. Intenta de nuevo.", 503);
  }
  const { error: uploadError } = await db.storage.from(created.upload.bucket).upload(created.upload.path, csv, { contentType: "text/csv", upsert: false });
  if (uploadError) throw new MercadoLibreError("MERCADOLIBRE_UNAVAILABLE", "No pudimos preparar la importación. Intenta de nuevo.", 503);
  return { sessionId: created.session.id, summary: mlImportSummary(rows) };
}

type ClaimedPhoto = { id: string; sku: string; order: number; url: string };
const PHOTOS_PER_CALL = 4;

const FAILURES: Record<string, string> = {
  download: "No pudimos descargarla de Mercado Libre.",
  PHOTO_NOT_IMAGE: "No es una foto JPG, PNG o WebP completa.",
  PHOTO_TOO_LARGE: "Pesa más de 5 MB.",
  PHOTO_DIMENSIONS: "Mide menos de 400 px de lado.",
  PHOTO_SUSPICIOUS: "Laria no pudo aceptar el archivo.",
  upload: "No pudimos guardarla. Vuelve a intentarlo.",
};

// Copies a few photos into the import (the browser calls again until none are left): each is downloaded from
// Mercado Libre's image hosts, checked like any uploaded photo, put in an upload slot with the owner's session, and
// checked again by the import itself, which matches it to its SKU and order.
export async function copyPhotos(db: Db, ownerUserId: string, sessionId: string, fetcher: Fetcher = fetch) {
  const reach = storeReachDb(db);
  const { data, error } = await reach.rpc("claim_mercadolibre_import_photos", { p_session_id: sessionId, p_limit: PHOTOS_PER_CALL });
  if (error) throw new MercadoLibreError("MERCADOLIBRE_IMPORT_NOT_FOUND", "No encontramos esa importación.", 404);
  const claimed = ((data as { photos?: ClaimedPhoto[] } | null)?.photos ?? []).filter((photo) => typeof photo.id === "string");

  const finish = (photo: ClaimedPhoto, status: "done" | "failed" | "pending", failure: string | null, assetId: string | null = null) =>
    reach.rpc("finish_mercadolibre_import_photo", { p_id: photo.id, p_status: status, p_asset_id: assetId, p_failure: failure });

  const ready: { photo: ClaimedPhoto; bytes: Uint8Array; mime: string }[] = [];
  for (const photo of claimed) {
    const bytes = await fetchPhoto(photo.url, PHOTO_MAX_BYTES, fetcher);
    if (!bytes) {
      await finish(photo, "failed", FAILURES.download);
      continue;
    }
    const check = checkPhoto(bytes);
    if (!check.ok) {
      await finish(photo, "failed", FAILURES[check.code] ?? FAILURES.PHOTO_NOT_IMAGE);
      continue;
    }
    ready.push({ photo, bytes, mime: check.mime_type });
  }

  if (ready.length) {
    const extension = (mime: string) => (mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg");
    let slots: { asset_id: string; bucket: string; path: string }[] = [];
    try {
      const requested = await requestPhotoUploads(db, sessionId, ready.map(({ photo, bytes, mime }) => ({
        name: `${photo.sku}__${String(photo.order).padStart(2, "0")}.${extension(mime)}`,
        type: mime,
        bytes: bytes.byteLength,
        manifest_sku: photo.sku,
        manifest_order: photo.order,
      })));
      slots = requested.uploads;
    } catch (failure) {
      // The import stopped accepting photos (or hit its limit): put them back and say why.
      for (const { photo } of ready) await finish(photo, "pending", null);
      throw failure;
    }
    const uploaded: string[] = [];
    for (const [index, { photo, bytes, mime }] of ready.entries()) {
      const slot = slots[index];
      if (!slot || slot.bucket !== PHOTO_BUCKET) {
        await finish(photo, "failed", FAILURES.upload);
        continue;
      }
      const { error: uploadError } = await db.storage.from(PHOTO_BUCKET).upload(slot.path, bytes, { contentType: mime, upsert: false });
      if (uploadError) {
        await finish(photo, "failed", FAILURES.upload);
        continue;
      }
      uploaded.push(slot.asset_id);
      await finish(photo, "done", null, slot.asset_id);
    }
    if (uploaded.length) await completePhotoUploads(db, ownerUserId, sessionId, uploaded);
  }
  return photoCounts(db, sessionId);
}

export async function photoCounts(db: Db, sessionId: string) {
  const { data, error } = await storeReachDb(db).rpc("get_mercadolibre_import_photos", { p_session_id: sessionId });
  if (error) throw new MercadoLibreError("MERCADOLIBRE_IMPORT_NOT_FOUND", "No encontramos esa importación.", 404);
  const value = (data ?? {}) as Record<string, unknown>;
  const number = (key: string) => (typeof value[key] === "number" ? (value[key] as number) : 0);
  return { total: number("total"), pending: number("pending"), done: number("done"), failed: number("failed"), accepting: value.accepting === true };
}
