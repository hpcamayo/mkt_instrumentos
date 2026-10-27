import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dropCachedListingPages } from "@/lib/listing-cache";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

// Launch audit A19: runs every minute (vercel.json), CRON_SECRET-protected like the e-mail worker. Every change to
// something a public page shows (a public listing, its photos, an active store), whichever path made it, is recorded
// in the database (supabase/migrations/20261112130000_launch_audit_page_refresh.sql). While changes wait, each run
// claims them, drops every cached listing page and the home (lib/listing-cache.ts), so a listing's card goes from
// other pages even when their rebuild fails, and reports back. A change is done after its second drop; a run that
// fails before reporting back leaves it to the next run. A quiet minute drops nothing.
export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ message: "No autorizado." }, { status: 401, headers: NO_STORE });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ message: "Configuración incompleta." }, { status: 503, headers: NO_STORE });
  const db = client as unknown as import("@supabase/supabase-js").SupabaseClient;

  const claim = await db.rpc("claim_public_page_changes");
  if (claim.error) return failure("claim", claim.error.message);
  if (!claim.data) return NextResponse.json({ refreshed: false }, { headers: NO_STORE });

  if (!dropCachedListingPages()) return failure("drop", "revalidatePath failed");
  const done = await db.rpc("complete_public_page_changes", { p_claim: claim.data });
  // The pages were dropped; the changes stay claimed and the next run drops them again.
  if (done.error) return failure("complete", done.error.message);
  console.info("public_pages_refreshed", JSON.stringify({ done: Number(done.data ?? 0) }));
  return NextResponse.json({ refreshed: true }, { headers: NO_STORE });
}

function failure(step: string, message: string) {
  console.error("public_pages_refresh_failure", JSON.stringify({ step, message: message.slice(0, 200) }));
  return NextResponse.json({ message: "No se pudieron actualizar las páginas." }, { status: 503, headers: NO_STORE });
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Compared as bytes: a header of the same length in characters can still differ in bytes.
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
