import { PHOTO_BUCKET } from "@/lib/store-import/photos-server";
import { photoOwner } from "@/lib/store-import/photo-routes";
import { isImportSessionId } from "@/lib/store-import/route-helpers";

export const dynamic = "force-dynamic";

// A thumbnail for the Fotos step: the owner's own validated photo, read with the owner's session (storage policy), and
// served with the type the server check found, never the stored one.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await params;
  if (!isImportSessionId(assetId)) return missing();
  const auth = await photoOwner(request, id, false);
  if ("response" in auth) return missing();
  const { data } = await auth.db
    .from("store_import_photo_assets")
    .select("object_path,mime_type,status")
    .eq("id", assetId)
    .eq("session_id", id)
    .maybeSingle();
  if (!data || data.status !== "validated" || !data.mime_type) return missing();
  const { data: blob, error } = await auth.db.storage.from(PHOTO_BUCKET).download(data.object_path);
  if (error || !blob) return missing();
  return new Response(blob, {
    headers: {
      "Content-Type": data.mime_type,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

function missing() {
  return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}
