import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const path = segments.join("/");
  // Two private sources, each mapped to its own bucket and nothing else: Sprint 4 edit photos, and import photos
  // (STORE-3a, design §8.4) whose URL segment "import-photos" names store-import-photos, never the spreadsheet bucket.
  const importPhoto = IMPORT_PHOTO_PATH.exec(path);
  if (!importPhoto && !/^[0-9a-f-]{36}\/listing-edits\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9]{1,2}\.(jpg|png|webp)$/.test(path)) return missing();
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
    // Admin only with the authenticator code entered (launch audit A15): public.is_admin() checks the session.
    const isAdmin = data.user.app_metadata?.role === "admin" && (await supabase!.rpc("is_admin")).data === true;
    if (!isAdmin && !rows.some((listing) => listing!.owner_user_id === data.user.id)) {
      const revisions = await admin.from("listing_revision_photos").select("listing_revisions(owner_user_id)").eq("image_url", url);
      if (!revisions.data?.some((photo) => photo.listing_revisions?.owner_user_id === data.user.id)) return missing();
    } else if (isAdmin && !rows.length) {
      const revision = await admin.from("listing_revision_photos").select("id").eq("image_url", url).limit(1);
      if (!revision.data?.length) return missing();
    }
  }
  if (importPhoto) return serveImportPhoto(admin, importPhoto);
  const { data, error } = await admin.storage.from("listing-edit-photos").download(path);
  if (error || !data) return missing();
  return new Response(data, { headers: { "Content-Type": data.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

const IMPORT_PHOTO_PATH = /^([0-9a-f-]{36})\/import-photos\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.(jpg|png|webp)$/;

// The asset must still be a validated photo of that owner and import; the bytes come from store-import-photos at the
// path the database generated, and the type is the one the server check found.
async function serveImportPhoto(admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>, match: RegExpExecArray) {
  const [, ownerId, sessionId, assetId, extension] = match;
  const db = admin as unknown as import("@supabase/supabase-js").SupabaseClient;
  const { data: asset } = await db
    .from("store_import_photo_assets")
    .select("object_path,mime_type,status,created_by,session_id,file_ext")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset || asset.status !== "validated" || asset.created_by !== ownerId || asset.session_id !== sessionId
    || asset.file_ext !== extension || !asset.mime_type) return missing();
  const { data, error } = await admin.storage.from("store-import-photos").download(asset.object_path);
  if (error || !data) return missing();
  return new Response(data, {
    headers: {
      "Content-Type": asset.mime_type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

function missing() { return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } }); }
