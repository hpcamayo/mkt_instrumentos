import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

// Deal-trust nightly job (docs/feature-ideas/deal-trust.md), once a day (02:30 Lima suggested), CRON_SECRET-protected
// like the other internal routes and safe to run more than once a day:
// - run_deal_trust_nightly: grants and lifts «Vendedor destacado» / «Tienda destacada» (sell-08) and sends the
//   counter-purchase review reminders (reach-11); both deduplicate their notices.
// - removes review photo uploads that never got attached to a review (safe-06), two days after the upload.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ORPHAN_BATCH = 200;
const BUCKET = "review-photos";

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ message: "Configuración incompleta." }, { status: 503 });
  const db = client as unknown as SupabaseClient;
  const requestId = crypto.randomUUID();
  try {
    const nightly = await db.rpc("run_deal_trust_nightly");
    if (nightly.error) throw new Error(nightly.error.message);
    const orphans = await db.rpc("list_orphan_review_photos", { p_limit: ORPHAN_BATCH });
    if (orphans.error) throw new Error(orphans.error.message);
    const paths = Array.isArray(orphans.data) ? orphans.data.filter((path): path is string => typeof path === "string") : [];
    let removed = 0;
    if (paths.length) {
      const { data, error } = await db.storage.from(BUCKET).remove(paths);
      if (error) throw new Error(error.message);
      removed = data?.length ?? 0;
    }
    const result = { requestId, nightly: nightly.data, orphanPhotosRemoved: removed };
    console.info("deal_trust_job", JSON.stringify(result));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("deal_trust_job_failure", JSON.stringify({ request_id: requestId, failure_code: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
    return NextResponse.json({ requestId, message: "No se pudo completar el trabajo." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  if (!expected || authorization.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authorization), Buffer.from(expected));
}
