import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processPushBatch } from "@/lib/push/push-worker";
import { createPushSender, type PushSender } from "@/lib/push/web-push";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

// big-12 (docs/ux-effortless/speed.md): sends pending push notices. CRON_SECRET-protected like the e-mail worker
// and, like it, run by Vercel Cron every 5 minutes (vercel.json, launch audit A25).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  const client = getSupabaseAdminClient();
  let sender: PushSender;
  try {
    sender = createPushSender();
  } catch {
    return NextResponse.json({ message: "Configuración incompleta." }, { status: 503 });
  }
  if (!client) return NextResponse.json({ message: "Configuración incompleta." }, { status: 503 });
  const requestId = crypto.randomUUID();
  try {
    const totals = { quiet: false, people: 0, sent: 0, retried: 0, failed: 0, skipped: 0 };
    for (let index = 0; index < 4; index += 1) {
      const batch = await processPushBatch({ client, sender });
      totals.quiet = batch.quiet;
      totals.people += batch.people;
      totals.sent += batch.sent;
      totals.retried += batch.retried;
      totals.failed += batch.failed;
      totals.skipped += batch.skipped;
      if (batch.quiet || batch.people < 50) break;
    }
    console.info("push_batch", JSON.stringify({ request_id: requestId, mode: sender.mode, ...totals }));
    return NextResponse.json({ requestId, mode: sender.mode, ...totals }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("push_batch_failure", JSON.stringify({ request_id: requestId, failure_code: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
    return NextResponse.json({ requestId, message: "No se pudo procesar el lote." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  if (!expected || authorization.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authorization), Buffer.from(expected));
}
