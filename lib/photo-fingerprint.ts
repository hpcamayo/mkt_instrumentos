import "server-only";

import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";

// Feature ideas, accounts batch (safe-05 photo copies, safe-02 stolen-gear photos): a 64-bit difference hash of a photo,
// computed here with sharp (no outside service). The picture is turned to grey and shrunk to 9×8; each bit says
// whether a pixel is brighter than its right neighbour. Re-encoded, resized or slightly cropped copies of one photo
// differ in a few bits; different photos differ in about half. The database compares them (bit_count(a # b) <= 5).

const MAX_BYTES = 12 * 1024 * 1024;

export async function photoDHash(input: ArrayBuffer | Buffer | Uint8Array): Promise<string | null> {
  try {
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input instanceof ArrayBuffer ? new Uint8Array(input) : input);
    if (!buffer.length || buffer.length > MAX_BYTES) return null;
    const { data, info } = await sharp(buffer, { failOn: "error", limitInputPixels: 64_000_000 })
      .rotate()
      .removeAlpha()
      .greyscale()
      .resize(9, 8, { fit: "fill", kernel: "lanczos3" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const step = info.channels;
    let bits = "";
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const left = data[(y * 9 + x) * step];
        const right = data[(y * 9 + x + 1) * step];
        bits += left > right ? "1" : "0";
      }
    }
    return bits;
  } catch {
    return null;
  }
}

const LISTING_EDIT_PATH = /^[0-9a-f-]{36}\/listing-edits\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9]{1,2}\.(jpg|png|webp)$/;
const IMPORT_PHOTO_PATH = /^[0-9a-f-]{36}\/import-photos\/[0-9a-f-]{36}\/([0-9a-f-]{36})\.(jpg|png|webp)$/;
const PUBLIC_OBJECT = /^\/storage\/v1\/object\/public\/([a-z0-9-]+)\/(.+)$/;
const READABLE_BUCKETS = new Set(["listing-photos", "listing-edit-photos", "store-import-photos"]);

// Where a listing photo's bytes live, from its image_url: a public Storage URL of this project, or one of the private
// /api/listing-images paths. Anything else (an outside URL, a legacy link) is not fetched.
export async function photoLocation(
  admin: SupabaseClient<Database>,
  imageUrl: string,
): Promise<{ bucket: string; path: string } | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (imageUrl.startsWith("/api/listing-images/")) {
    const path = imageUrl.slice("/api/listing-images/".length);
    if (LISTING_EDIT_PATH.test(path)) return { bucket: "listing-edit-photos", path };
    const importPhoto = IMPORT_PHOTO_PATH.exec(path);
    if (!importPhoto) return null;
    const db = admin as unknown as SupabaseClient;
    const { data } = await db.from("store_import_photo_assets").select("object_path,status").eq("id", importPhoto[1]).maybeSingle();
    return data?.status === "validated" && typeof data.object_path === "string" ? { bucket: "store-import-photos", path: data.object_path } : null;
  }
  if (!supabaseUrl) return null;
  try {
    const url = new URL(imageUrl);
    if (url.origin !== new URL(supabaseUrl).origin) return null;
    const match = PUBLIC_OBJECT.exec(url.pathname);
    if (!match || !READABLE_BUCKETS.has(match[1])) return null;
    return { bucket: match[1], path: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

export async function fingerprintStoredPhoto(admin: SupabaseClient<Database>, bucket: string, path: string) {
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data || data.size > MAX_BYTES) return null;
  return photoDHash(await data.arrayBuffer());
}

type PhotoRef = { key: string; sort_order: number };

// Hashes a listing's photos and hands them to the database, which raises the copy flags (safe-05) and checks them
// against stolen-gear reports (safe-02). Photos that cannot be read are left out.
export async function fingerprintListing(admin: SupabaseClient<Database>, listingId: string, photos: PhotoRef[]) {
  const items: { key: string; sort_order: number; dhash: string }[] = [];
  for (const photo of photos.slice(0, 30)) {
    const location = await photoLocation(admin, photo.key);
    const dhash = location ? await fingerprintStoredPhoto(admin, location.bucket, location.path) : null;
    if (dhash) items.push({ key: photo.key, sort_order: photo.sort_order, dhash });
  }
  const { data, error } = await admin.rpc("service_record_listing_fingerprints", { p_listing_id: listingId, p_items: items });
  if (error) return null;
  return data as { hashed?: number; flags?: number } | null;
}

export function parsePhotoRefs(value: unknown): PhotoRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { key, sort_order: sortOrder } = item as { key?: unknown; sort_order?: unknown };
    return typeof key === "string" && key ? [{ key, sort_order: typeof sortOrder === "number" ? sortOrder : 0 }] : [];
  });
}
