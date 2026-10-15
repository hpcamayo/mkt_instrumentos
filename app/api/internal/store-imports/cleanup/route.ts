import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily import retention (design §7.9): runs the database retention (expire idle sessions, drop staged rows 30 days
// after close) and deletes the queued source files through the Storage API. CRON_SECRET-protected like the email
// worker; it never applies anything to inventory. Not scheduled yet (no vercel.json before go-live): the scheduler
// that calls the email worker calls this too.
export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ message: "Configuración incompleta." }, { status: 503 });
  const db = client as unknown as import("@supabase/supabase-js").SupabaseClient;
  let deleted = 0;
  try {
    for (let batch = 0; batch < 5; batch += 1) {
      const { data, error } = await db.rpc("claim_store_import_file_deletions", { p_limit: 100 });
      if (error) throw new Error(error.message);
      const paths = ((data ?? []) as { bucket: string; path: string }[]).filter((row) => row.bucket === "store-imports").map((row) => row.path);
      if (!paths.length) break;
      const { error: removeError } = await db.storage.from("store-imports").remove(paths);
      if (removeError) throw new Error(removeError.message);
      const { data: done, error: completeError } = await db.rpc("complete_store_import_file_deletions", { p_paths: paths });
      if (completeError) throw new Error(completeError.message);
      deleted += Number(done ?? 0);
      if (paths.length < 100) break;
    }
    console.info("store_import_cleanup", JSON.stringify({ deleted }));
    return NextResponse.json({ deleted }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("store_import_cleanup_failure", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    return NextResponse.json({ message: "No se pudo completar la limpieza." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  if (!expected || authorization.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authorization), Buffer.from(expected));
}
