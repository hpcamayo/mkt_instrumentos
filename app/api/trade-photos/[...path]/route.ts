import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";
import { TRADE_PHOTO_PATH } from "@/lib/selling-tools";

export const dynamic = "force-dynamic";

// Photos of a sell or part-payment request (sell-02, run-04) are private: the person who sent it, and the stores that
// may see the request, read them here. The check runs as the signed-in person (can_view_trade_photo); only then the
// admin client downloads the bytes from the private trade-photos bucket.
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const path = segments.join("/");
  if (!TRADE_PHOTO_PATH.test(path)) return missing();
  const supabase = await getSupabaseServerClient();
  if (!supabase) return missing();
  const { data: allowed } = await (supabase as unknown as SupabaseClient).rpc("can_view_trade_photo", { p_path: path });
  if (allowed !== true) return missing();
  const admin = getSupabaseAdminClient();
  if (!admin) return missing();
  const { data, error } = await admin.storage.from("trade-photos").download(path);
  if (error || !data) return missing();
  return new Response(data, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

function missing() { return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } }); }
