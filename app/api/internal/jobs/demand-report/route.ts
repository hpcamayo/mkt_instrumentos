import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { storeReachDb } from "@/lib/store-reach-db";
import { cronAuthorized } from "@/lib/store-reach-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// reach-06 "Lo que buscan en Laria" (docs/feature-ideas/store-reach.md): builds last month's demand report when it is
// missing and drops reports older than 13 months. pg_cron runs the same job every day at 10:30 UTC
// (demand-report-monthly); this route is for a scheduler outside the database or a manual run. Idempotent.
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ message: "Configuración incompleta." }, { status: 503 });
  const { data, error } = await storeReachDb(client).rpc("run_demand_report_job");
  if (error) {
    console.error("demand_report_job_failure", error.message.slice(0, 200));
    return NextResponse.json({ message: "No se pudo preparar el reporte." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  console.info("demand_report_job", JSON.stringify(data));
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
