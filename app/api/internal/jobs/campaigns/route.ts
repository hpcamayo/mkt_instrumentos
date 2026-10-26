import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { CAMPAIGNS_CACHE_TAG } from "@/lib/campaigns-server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { storeReachDb } from "@/lib/store-reach-db";
import { cronAuthorized } from "@/lib/store-reach-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// reach-05 "Campañas Laria" (docs/feature-ideas/store-reach.md): starts the entries of campaigns that began (setting
// the campaign prices the stores chose), closes those of campaigns that ended or were cancelled (restoring prices the
// stores asked for) and takes out publications whose store changed the price. pg_cron runs the same job every 10
// minutes (laria-campaigns); this route is for a scheduler outside the database or a manual run. Idempotent.
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ message: "Configuración incompleta." }, { status: 503 });
  const { data, error } = await storeReachDb(client).rpc("run_campaign_job");
  if (error) {
    console.error("campaign_job_failure", error.message.slice(0, 200));
    return NextResponse.json({ message: "No se pudo ejecutar el trabajo de campañas." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  revalidateTag(CAMPAIGNS_CACHE_TAG);
  console.info("campaign_job", JSON.stringify(data));
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
