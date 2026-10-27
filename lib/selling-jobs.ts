import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { TRADE_PHOTO_PATH } from "@/lib/selling-tools";

export type SellingJob = "price-steps" | "gear-reminders" | "trade-offers";

// The selling tools' daily jobs (docs/feature-ideas/selling-tools.md § Jobs): CRON_SECRET-protected like the e-mail
// worker, idempotent and safe to run more than once a day. Each one is a single database call (run_selling_job) that
// claims rows with skip-locked; the trade job also removes the photos the database lists through the Storage API.
export async function runSellingJob(request: Request, job: SellingJob) {
  if (!isAuthorized(request)) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  const admin = getSupabaseAdminClient();
  if (!admin) return NextResponse.json({ message: "Configuración incompleta." }, { status: 503 });
  const db = admin as unknown as SupabaseClient;
  try {
    const { data, error } = await db.rpc("run_selling_job", { p_job: job });
    if (error) throw new Error(error.message);
    const result = { ...((data ?? {}) as Record<string, unknown>) };
    if (job === "trade-offers") {
      const paths = (Array.isArray(result.orphan_photos) ? result.orphan_photos : []).filter((path): path is string => typeof path === "string" && TRADE_PHOTO_PATH.test(path));
      if (paths.length) {
        const { error: removeError } = await db.storage.from("trade-photos").remove(paths);
        if (removeError) throw new Error(removeError.message);
      }
      delete result.orphan_photos;
      result.photos_removed = paths.length;
    }
    console.info("selling_job", JSON.stringify({ job, ...result }));
    return NextResponse.json({ job, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("selling_job_failure", JSON.stringify({ job, failure_code: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
    return NextResponse.json({ job, message: "No se pudo completar el trabajo." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  if (!expected || authorization.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authorization), Buffer.from(expected));
}
