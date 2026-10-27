import { NextResponse } from "next/server";
import { isEntityId } from "@/lib/marketplace-event-payload";
import { storeReachDb } from "@/lib/store-reach-db";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// reach-04 "Distribuidor oficial": Admin opens a store's authorization. The database checks the Admin role and returns
// the path; the service role signs a one-minute download link on the storage domain (never served from Laria's own
// origin, so a document cannot run anything in Laria's pages).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isEntityId(id)) return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  const supabase = await getSupabaseServerClient();
  const admin = getSupabaseAdminClient();
  if (!supabase || !admin) return NextResponse.json({ message: "No disponible en este momento." }, { status: 503 });
  const { data, error } = await storeReachDb(supabase).rpc("admin_get_dealer_document", { p_id: id });
  if (error) return NextResponse.json({ message: "No encontramos ese documento." }, { status: error.code === "42501" ? 403 : 404 });
  const document = data as { bucket?: unknown; path?: unknown; name?: unknown } | null;
  if (document?.bucket !== "store-dealer-documents" || typeof document.path !== "string") {
    return NextResponse.json({ message: "No encontramos ese documento." }, { status: 404 });
  }
  const { data: signed, error: signError } = await storeReachDb(admin).storage.from("store-dealer-documents")
    .createSignedUrl(document.path, 60, { download: typeof document.name === "string" ? document.name : true });
  if (signError || !signed?.signedUrl) return NextResponse.json({ message: "No disponible en este momento." }, { status: 503 });
  return NextResponse.redirect(signed.signedUrl, { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
