import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const path = segments.join("/");
  if (!/^[0-9a-f-]{36}\/listing-edits\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9]{1,2}\.(jpg|png|webp)$/.test(path)) return missing();
  const admin = getSupabaseAdminClient();
  if (!admin) return missing();
  const url = `/api/listing-images/${path}`;
  const live = await admin.from("listing_photos").select("listings(owner_user_id,status,store_id,stores(status))").eq("image_url", url);
  const rows = live.data?.map((photo) => photo.listings).filter(Boolean) ?? [];
  const publiclyVisible = rows.some((listing) => ["approved", "sold"].includes(listing!.status) && (!listing!.store_id || listing!.stores?.status === "active"));
  if (!publiclyVisible) {
    const supabase = await getSupabaseServerClient();
    const { data } = supabase ? await supabase.auth.getUser() : { data: null };
    if (!data?.user) return missing();
    const isAdmin = data.user.app_metadata.role === "admin";
    if (!isAdmin && !rows.some((listing) => listing!.owner_user_id === data.user.id)) {
      const revisions = await admin.from("listing_revision_photos").select("listing_revisions(owner_user_id)").eq("image_url", url);
      if (!revisions.data?.some((photo) => photo.listing_revisions?.owner_user_id === data.user.id)) return missing();
    } else if (isAdmin && !rows.length) {
      const revision = await admin.from("listing_revision_photos").select("id").eq("image_url", url).limit(1);
      if (!revision.data?.length) return missing();
    }
  }
  const { data, error } = await admin.storage.from("listing-edit-photos").download(path);
  if (error || !data) return missing();
  return new Response(data, { headers: { "Content-Type": data.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

function missing() { return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } }); }
