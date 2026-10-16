"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { PHOTO_MAX_FILE_BYTES, type ManifestEntry, type PhotoMimeType } from "@/lib/store-import/photo-files";
import type { UploadSlot } from "@/lib/store-import/photos-server";

// Sending import photos from the browser (design §8.1), shared by the Fotos step and "Completar datos" on the result
// (review fix B5): ask the server for upload slots, upload to the paths it issued, then let it check each photo.

const NETWORK_MESSAGE = "No pudimos conectar con Laria. Revisa tu conexión y vuelve a intentarlo.";
const MAX_SIDE = 2400;

export type PendingPhoto = { name: string; type: PhotoMimeType; data: Blob };

async function post<T>(path: string, body: unknown): Promise<{ ok: true; body: T } | { ok: false; message: string }> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, message: json?.message ?? NETWORK_MESSAGE };
    return { ok: true, body: json as T };
  } catch {
    return { ok: false, message: NETWORK_MESSAGE };
  }
}

// Re-encodes in the browser when it can decode the photo: JPEG, white background, longest side ≤ 2400 px. This drops
// EXIF (including location) and shrinks uploads. The server does not rely on it.
export async function preparePhoto(data: Blob, type: PhotoMimeType): Promise<{ data: Blob; type: PhotoMimeType }> {
  if (typeof createImageBitmap !== "function") return { data, type };
  try {
    const bitmap = await createImageBitmap(data);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return { data, type };
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (encoded && encoded.size <= PHOTO_MAX_FILE_BYTES) return { data: encoded, type: "image/jpeg" };
  } catch {
    // Not decodable here (for example HEIC on some browsers): send as is; the server decides.
  }
  return { data, type };
}

// Sends one batch (≤ PHOTO_SLOT_BATCH): slots, uploads (three at a time), then the server check. Returns the assets
// that reached storage and those the check refused. Throws with a message the page can show.
export async function sendPhotoBatch(sessionId: string, batch: PendingPhoto[], manifest: Map<string, ManifestEntry>) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error(NETWORK_MESSAGE);
  const prepared = await Promise.all(batch.map(async (item) => ({ ...item, ...(await preparePhoto(item.data, item.type)) })));
  const slots = await post<{ uploads: UploadSlot[] }>(`/api/store/imports/${sessionId}/photo-uploads`, {
    files: prepared.map((item) => {
      const listed = manifest.get(item.name.toLowerCase());
      return { name: item.name, type: item.type, bytes: item.data.size, manifest_sku: listed?.sku ?? null, manifest_order: listed?.order ?? null };
    }),
  });
  if (!slots.ok) throw new Error(slots.message);
  const uploads = slots.body.uploads;
  const uploaded: string[] = [];
  let next = 0;
  async function worker() {
    while (next < prepared.length) {
      const index = next++;
      const slot = uploads[index];
      if (!slot) continue;
      const item = prepared[index];
      const { error } = await supabase!.storage.from(slot.bucket).upload(slot.path, await item.data.arrayBuffer(), {
        contentType: item.type,
        upsert: false,
      });
      if (!error || /exists|duplicate/i.test(error.message)) uploaded.push(slot.asset_id);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  let rejected: string[] = [];
  if (uploaded.length) {
    const checked = await post<{ rejected?: { asset_id: string }[] }>(`/api/store/imports/${sessionId}/photo-uploads/complete`, { assetIds: uploaded });
    if (!checked.ok) throw new Error(checked.message);
    rejected = (checked.body.rejected ?? []).map((item) => item.asset_id);
  }
  // Keep the order the files were chosen in.
  const order = new Map(uploads.map((slot, index) => [slot.asset_id, index]));
  uploaded.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return { uploaded, rejected };
}
