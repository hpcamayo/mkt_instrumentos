import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

export async function cleanupListingEditUploads(listingId: string, userId: string, paths: string[], bucket = "listing-edit-photos"): Promise<string[] | null> {
  if (!paths.length) return [];
  try {
    const admin = getSupabaseAdminClient();
    if (!admin) return null;
    const { data, error } = await admin.rpc("claim_listing_photo_cleanup", {
      p_listing_id: listingId, p_user_id: userId, p_bucket: bucket, p_paths: [...new Set(paths)],
    });
    if (error) return null;
    if (!data?.length) return [];
    const removed = await admin.storage.from(bucket).remove(data);
    return removed.error ? null : data;
  } catch { return null; }
}
