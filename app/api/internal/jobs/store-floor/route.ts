import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The store-floor daily job (docs/feature-ideas/store-floor.md): clears "Por llegar" dates that passed (one notice per
// store), expires try-out requests nobody answered, sends the one reminder for confirmed try-outs of today or tomorrow
// and deletes try-outs 90 days after their date. CRON_SECRET-protected like the other internal jobs; idempotent, so a
// second run the same day changes nothing. The e-mails it queues go out with the e-mail worker.
export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ message: "Configuración incompleta." }, { status: 503 });
  const db = client as unknown as import("@supabase/supabase-js").SupabaseClient;
  const { data, error } = await db.rpc("run_store_floor_daily");
  if (error) {
    console.error("store_floor_daily_failure", error.message.slice(0, 200));
    return NextResponse.json({ message: "No se pudo completar el trabajo diario." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  console.info("store_floor_daily", JSON.stringify(data));
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  if (!expected || authorization.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authorization), Buffer.from(expected));
}
