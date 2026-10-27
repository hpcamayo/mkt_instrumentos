import "server-only";

// Import photos, server side (design §8). The owner's own session asks for upload slots and arranges photos; only the
// completion step uses the service role, to read the stored bytes and record the check, because an owner must not be
// able to mark their own upload as valid.
import type { DatabaseClient, FunctionCall } from "@/lib/supabase/database";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { checkPhoto, PHOTO_MAX_BYTES, type PhotoCheck } from "./photo-check";
import { ImportRequestError, importErrorFrom } from "./server";

type Db = DatabaseClient;

export const PHOTO_BUCKET = "store-import-photos";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PhotoCounts = Partial<Record<
  "total" | "awaiting_upload" | "validated" | "rejected" | "assigned" | "set_aside" | "rows_with_photos" | "rows_ready"
  | "rows_too_few" | "rows_too_many" | "rows_blocked", number>>;

export type PhotoSummary = { session_id: string; version: number; photo_counts: PhotoCounts };

export type PhotoAsset = {
  id: string;
  original_name: string;
  status: "awaiting_upload" | "validated" | "rejected" | "discarded";
  reject_code: string | null;
  match_issue: string | null;
  match_note: string | null;
  match_source: string | null;
  placement: "auto" | "manual";
  target_row_number: number | null;
  width: number | null;
  height: number | null;
  row_number: number | null;
  sort_order: number | null;
};

export type PhotoRow = {
  row_number: number;
  sku: string | null;
  name: string | null;
  planned_action: string | null;
  owner_decision: string;
  photo_state: string | null;
  photo_count: number;
};

export type PhotoView = { assets: PhotoAsset[]; rows: PhotoRow[]; counts: PhotoCounts; accepting: boolean };

export type UploadSlot = { asset_id: string; bucket: string; path: string; name: string };

export type PhotoFileRequest = { name: string; type: string; bytes: number; manifest_sku?: string | null; manifest_order?: number | null };

async function call<T>(db: Db, ...[fn, args]: FunctionCall): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw importErrorFrom(error);
  return data as T;
}

export function parsePhotoFiles(body: unknown): PhotoFileRequest[] | null {
  const files = (body as { files?: unknown } | null)?.files;
  if (!Array.isArray(files) || files.length < 1 || files.length > 25) return null;
  const parsed: PhotoFileRequest[] = [];
  for (const file of files) {
    if (!file || typeof file !== "object") return null;
    const { name, type, bytes, manifest_sku: sku, manifest_order: order } = file as Record<string, unknown>;
    if (typeof name !== "string" || typeof type !== "string" || typeof bytes !== "number" || !Number.isInteger(bytes)) return null;
    parsed.push({
      name: name.slice(0, 400),
      type,
      bytes,
      manifest_sku: typeof sku === "string" ? sku.slice(0, 80) : null,
      manifest_order: typeof order === "number" && Number.isInteger(order) ? order : null,
    });
  }
  return parsed;
}

export async function requestPhotoUploads(db: Db, sessionId: string, files: PhotoFileRequest[]) {
  return call<PhotoSummary & { uploads: UploadSlot[] }>(db, "request_store_import_photo_uploads", {
    p_session_id: sessionId,
    p_files: files,
  });
}

const CHECK_BUDGET_MS = 30_000;

// Reads each uploaded object (≤ 25, one at a time so at most one photo is in memory), checks its bytes and records the
// outcome. Objects that are not there yet are left waiting. Rejected objects are deleted right away; if that fails,
// the daily cleanup picks them up.
//
// The check reads each photo's image data through (Codex re-check R3): under a second for a real photo, up to about
// 2 s for a file crafted to be slow. No new check starts after CHECK_BUDGET_MS, so 25 such files cannot run the
// request past its 60 s limit; the photos left unchecked stay waiting, like ones not uploaded yet.
//
// Each object is read as a stream and never past the 5 MB photo limit: a larger object is reported as too large as
// soon as it passes the limit, without being held in memory. The bucket's own 5 MB limit is the first bound; this
// one does not rely on it.
export async function completePhotoUploads(db: Db, ownerUserId: string, sessionId: string, assetIds: string[]) {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new ImportRequestError("IMPORT_UNAVAILABLE", "No pudimos revisar las fotos. Intenta de nuevo.", 503);
  const ids = [...new Set(assetIds.filter((id) => UUID.test(id)))].slice(0, 25);
  if (!ids.length) throw new ImportRequestError("IMPORT_PHOTO_REQUEST_INVALID", "Solicitud de fotos inválida.", 400);

  // The owner's own read decides which assets are theirs (RLS); the service role only reads those paths.
  const { data, error } = await db
    .from("store_import_photo_assets")
    .select("id,object_path,status")
    .eq("session_id", sessionId)
    .in("id", ids);
  if (error) throw importErrorFrom(error);
  const waiting = ((data ?? []) as { id: string; object_path: string; status: string }[]).filter((asset) => asset.status === "awaiting_upload");

  const started = Date.now();
  const results: (PhotoCheck & { asset_id: string })[] = [];
  for (const asset of waiting) {
    if (Date.now() - started > CHECK_BUDGET_MS) break;
    const check = await checkStoredPhoto(admin, asset.object_path);
    if (check) results.push({ asset_id: asset.id, ...check });
  }

  const recorded = await call<PhotoSummary & { validated: number; rejected: { asset_id: string; path: string; code: string }[] }>(
    admin, "record_store_import_photo_checks", { p_owner_user_id: ownerUserId, p_session_id: sessionId, p_results: results },
  );
  if (recorded.rejected?.length) await deleteRejected(admin, sessionId);
  return { ...recorded, waiting: waiting.length - results.length };
}

// null: the object cannot be read right now (not uploaded yet, or the read failed); it stays waiting.
async function checkStoredPhoto(admin: Db, path: string): Promise<PhotoCheck | null> {
  const { data: stream, error } = await admin.storage.from(PHOTO_BUCKET).download(path).asStream();
  if (error || !stream) return null;
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > PHOTO_MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, code: "PHOTO_TOO_LARGE", bytes };
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  return checkPhoto(Buffer.concat(chunks, bytes));
}

async function deleteRejected(admin: Db, sessionId: string) {
  try {
    const { data } = await admin.rpc("claim_store_import_photo_deletions", { p_limit: 100, p_session_id: sessionId });
    const paths = ((data ?? []) as { bucket: string; path: string }[]).map((row) => row.path);
    if (!paths.length) return;
    const { error } = await admin.storage.from(PHOTO_BUCKET).remove(paths);
    if (!error) await admin.rpc("complete_store_import_photo_deletions", { p_paths: paths });
  } catch (error) {
    console.error("store_import_photo_delete_failure", error instanceof Error ? error.message.slice(0, 200) : "unknown");
  }
}

export type PhotoAction =
  | { action: "place"; assetId: string; row: number | null }
  | { action: "order"; row: number; assetIds: string[] }
  | { action: "reset" };

export function parsePhotoAction(body: unknown): PhotoAction | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  const row = typeof value.row === "number" && Number.isInteger(value.row) && value.row > 0 ? value.row : null;
  if (value.action === "place" && typeof value.assetId === "string" && UUID.test(value.assetId) && (row !== null || value.row === null)) {
    return { action: "place", assetId: value.assetId, row };
  }
  if (value.action === "order" && row !== null && Array.isArray(value.assetIds) && value.assetIds.length <= 10
    && value.assetIds.every((id) => typeof id === "string" && UUID.test(id))) {
    return { action: "order", row, assetIds: value.assetIds as string[] };
  }
  if (value.action === "reset") return { action: "reset" };
  return null;
}

export async function applyPhotoAction(db: Db, sessionId: string, action: PhotoAction) {
  if (action.action === "place") {
    return call<PhotoSummary>(db, "place_store_import_photo", { p_session_id: sessionId, p_asset_id: action.assetId, p_row_number: action.row });
  }
  if (action.action === "order") {
    return call<PhotoSummary>(db, "order_store_import_photos", { p_session_id: sessionId, p_row_number: action.row, p_asset_ids: action.assetIds });
  }
  return call<PhotoSummary>(db, "reset_store_import_photo_matching", { p_session_id: sessionId });
}

const ACCEPTING = new Set(["ready", "committing", "committed", "partially_committed"]);

// Everything the Fotos step shows: every photo of the import (≤ 600) and every staged row (≤ 2,000, read in pages of
// 1,000 because that is the API's page size).
export async function readPhotoView(db: Db, sessionId: string): Promise<PhotoView | null> {
  const { data: session, error } = await db
    .from("store_import_sessions")
    .select("id,status,photo_counts,rows_purged_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw importErrorFrom(error);
  if (!session) return null;

  const [assets, assignments] = await Promise.all([
    db.from("store_import_photo_assets")
      .select("id,original_name,status,reject_code,match_issue,match_note,match_source,placement,target_row_number,width,height")
      .eq("session_id", sessionId)
      .neq("status", "discarded")
      .order("request_order", { ascending: true })
      .limit(1000),
    db.from("store_import_photo_assignments").select("asset_id,row_number,sort_order").eq("session_id", sessionId).limit(1000),
  ]);
  if (assets.error) throw importErrorFrom(assets.error);
  if (assignments.error) throw importErrorFrom(assignments.error);
  const placed = new Map(((assignments.data ?? []) as { asset_id: string; row_number: number; sort_order: number }[])
    .map((row) => [row.asset_id, row]));

  const rows: (PhotoRow & { applied_item_id: string | null })[] = [];
  for (let from = 0; from < 3000; from += 1000) {
    const page = await db
      .from("store_import_rows")
      .select("row_number,sku:parsed->>sku,name:parsed->>product_name,sku_normalized,planned_action,owner_decision,photo_state,photo_count,applied_item_id")
      .eq("session_id", sessionId)
      .order("row_number", { ascending: true })
      .range(from, from + 999);
    if (page.error) throw importErrorFrom(page.error);
    const batch = (page.data ?? []) as unknown as (PhotoRow & { sku_normalized: string | null; applied_item_id: string | null })[];
    rows.push(...batch.map(({ sku_normalized: normalized, ...row }) => ({ ...row, sku: row.sku ?? normalized })));
    if (batch.length < 1000) break;
  }

  // Rows without a SKU in the file get one when the import is applied; show it.
  const generated = rows.filter((row) => !row.sku && row.applied_item_id).map((row) => row.applied_item_id!);
  if (generated.length) {
    const items = await db.from("store_inventory_items").select("id,merchant_sku").in("id", generated.slice(0, 500));
    const skus = new Map(((items.data ?? []) as { id: string; merchant_sku: string }[]).map((item) => [item.id, item.merchant_sku]));
    for (const row of rows) if (!row.sku && row.applied_item_id) row.sku = skus.get(row.applied_item_id) ?? null;
  }

  return {
    assets: ((assets.data ?? []) as Omit<PhotoAsset, "row_number" | "sort_order">[]).map((asset) => ({
      ...asset,
      row_number: placed.get(asset.id)?.row_number ?? null,
      sort_order: placed.get(asset.id)?.sort_order ?? null,
    })),
    rows: rows.map(({ applied_item_id: _item, ...row }) => {
      void _item;
      return row;
    }),
    counts: (session.photo_counts ?? {}) as PhotoCounts,
    accepting: ACCEPTING.has(session.status) && !session.rows_purged_at,
  };
}
