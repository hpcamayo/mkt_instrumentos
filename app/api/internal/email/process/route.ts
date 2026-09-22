import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prepareDueLimaDayDigests, processMarketplaceEmailBatch } from "@/lib/email/marketplace-email";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ message: "Configuración incompleta." }, { status: 503 });
  const requestId = crypto.randomUUID();
  try {
    const prepared = await prepareDueLimaDayDigests(client as never);
    const batches = [];
    for (let index = 0; index < 4; index += 1) {
      const result = await processMarketplaceEmailBatch({ client: client as never, limit: 25 });
      batches.push(result);
      if (result.claimed < 25) break;
    }
    const totals = batches.reduce((sum, batch) => ({
      claimed: sum.claimed + batch.claimed,
      sent: sum.sent + batch.sent,
      retried: sum.retried + batch.retried,
      failed: sum.failed + batch.failed,
      invalid: sum.invalid + batch.invalid,
    }), { claimed: 0, sent: 0, retried: 0, failed: 0, invalid: 0 });
    console.info("marketplace_email_batch", JSON.stringify({ request_id: requestId, prepared_digests: prepared, ...totals }));
    return NextResponse.json({ requestId, prepared, ...totals }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("marketplace_email_batch_failure", JSON.stringify({ request_id: requestId, failure_code: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
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
