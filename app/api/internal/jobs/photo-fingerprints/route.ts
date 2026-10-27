import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { fingerprintListing, parsePhotoRefs } from "@/lib/photo-fingerprint";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Feature ideas, accounts batch (safe-05, safe-02): hashes the photos of listings in review or live whose photo set
// changed since the last pass, pending ones first, until its time budget runs out. The database then flags copies
// between sellers for Admin and checks the photos against stolen-gear reports. Idempotent: a listing is hashed again
// only when its photos change. CRON_SECRET-protected like the other internal jobs; meant to run daily (Admin also
// hashes a listing when opening it for review).
const BUDGET_MS = 45_000;

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  const admin = getSupabaseAdminClient();
  if (!admin) return NextResponse.json({ message: "Configuración incompleta." }, { status: 503 });
  const started = Date.now();
  let listings = 0;
  let flags = 0;
  try {
    while (Date.now() - started < BUDGET_MS) {
      const { data, error } = await admin.rpc("listings_needing_fingerprints", { p_limit: 20 });
      if (error) throw new Error(error.message);
      const batch = Array.isArray(data) ? (data as { listing_id?: unknown; photos?: unknown }[]) : [];
      if (!batch.length) break;
      let progressed = false;
      for (const item of batch) {
        if (Date.now() - started >= BUDGET_MS) break;
        if (typeof item.listing_id !== "string") continue;
        const result = await fingerprintListing(admin, item.listing_id, parsePhotoRefs(item.photos));
        if (!result) continue;
        progressed = true;
        listings += 1;
        flags += Number(result.flags) || 0;
      }
      if (!progressed || batch.length < 20) break;
    }
    console.info("photo_fingerprints", JSON.stringify({ listings, flags }));
    return NextResponse.json({ listings, flags }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("photo_fingerprints_failure", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    return NextResponse.json({ message: "No se pudo completar el paso.", listings, flags }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  if (!expected || authorization.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authorization), Buffer.from(expected));
}
