import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export const dynamic = "force-dynamic";

const PHOTO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REVIEW_PHOTO_BUCKET = "review-photos";

// A review photo (safe-06). The bucket is private: get_review_photo_object, read with the visitor's own session, says
// whether this photo may be shown to them (an approved photo of a visible review to anyone; a pending or hidden one
// only to its author and to Admin), and only then the server reads the object. Public photos are cached briefly, the
// rest never; the response can't run anything (nosniff, a sandboxed CSP).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!PHOTO_ID.test(id)) return missing();
  const supabase = await getSupabaseServerClient();
  const admin = getSupabaseAdminClient();
  if (!supabase || !admin) return missing();
  const { data, error } = await (supabase as unknown as SupabaseClient).rpc("get_review_photo_object", { p_photo_id: id });
  if (error || !data || typeof data !== "object") return missing();
  const { path, access } = data as { path?: unknown; access?: unknown };
  if (typeof path !== "string" || (access !== "public" && access !== "private")) return missing();
  const { data: blob, error: downloadError } = await admin.storage.from(REVIEW_PHOTO_BUCKET).download(path);
  if (downloadError || !blob) return missing();
  const type = ["image/jpeg", "image/png", "image/webp"].includes(blob.type) ? blob.type : "image/jpeg";
  return new Response(blob, {
    headers: {
      "Content-Type": type,
      "Cache-Control": access === "public" ? "public, max-age=300, s-maxage=300" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function missing() {
  return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}
