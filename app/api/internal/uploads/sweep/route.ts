import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };
const BATCH = 100;
// At most 2,000 files a run, and no new batch after 45 seconds, so the last one ends well inside maxDuration.
const MAX_BATCHES = 20;
const TIME_BUDGET_MS = 45_000;

type Removal = { bucket: string; path: string };

// Launch audit A18: runs daily (vercel.json), CRON_SECRET-protected like the other jobs. Removes the uploaded files
// nothing uses: supabase/migrations/20261114120000_launch_audit_privacy.sql says which, and how a listing published
// meanwhile keeps its file. Each batch is claimed in the database, removed through the Storage API and reported done;
// a batch that fails anywhere stays queued, and the next run hands it out again before anything new. The analytics
// event retention of the same migration runs in the database (pg_cron), not here.
export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ message: "No autorizado." }, { status: 401, headers: NO_STORE });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ message: "Configuración incompleta." }, { status: 503, headers: NO_STORE });

  const stopAt = Date.now() + TIME_BUDGET_MS;
  let removed = 0;
  for (let batch = 0; batch < MAX_BATCHES && Date.now() < stopAt; batch += 1) {
    const claim = await client.rpc("claim_upload_removals", { p_limit: BATCH });
    if (claim.error) return failure("claim", claim.error.message, removed);
    const rows = (claim.data ?? []) as Removal[];
    if (!rows.length) break;
    for (const [bucket, paths] of byBucket(rows)) {
      // Storage leaves out a file that is gone already, so a batch removed before a failed report removes cleanly again.
      const { error: removeError } = await client.storage.from(bucket).remove(paths);
      if (removeError) return failure("remove", removeError.message, removed, bucket);
      const done = await client.rpc("complete_upload_removals", { p_bucket: bucket, p_paths: paths });
      if (done.error) return failure("complete", done.error.message, removed, bucket);
      removed += Number(done.data ?? 0);
    }
  }
  console.info("uploads_sweep", JSON.stringify({ removed }));
  return NextResponse.json({ removed }, { headers: NO_STORE });
}

function byBucket(rows: Removal[]) {
  const groups = new Map<string, string[]>();
  for (const row of rows) groups.set(row.bucket, [...(groups.get(row.bucket) ?? []), row.path]);
  return groups;
}

function failure(step: string, message: string, removed: number, bucket?: string) {
  console.error("uploads_sweep_failure", JSON.stringify({ step, bucket, removed, message: message.slice(0, 200) }));
  return NextResponse.json({ message: "No se pudo completar la limpieza." }, { status: 503, headers: NO_STORE });
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Compared as bytes: a header of the same length in characters can still differ in bytes.
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
