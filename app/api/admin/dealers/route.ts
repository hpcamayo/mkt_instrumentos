import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { parseDealerAuthorization } from "@/lib/dealers";
import { DEALERS_CACHE_TAG } from "@/lib/dealers-server";
import { isEntityId } from "@/lib/marketplace-event-payload";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { storeReachDb, storeReachErrorMessage } from "@/lib/store-reach-db";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// reach-04 "Distribuidor oficial": Admin approves, rejects or revokes one authorization. The database checks the Admin
// role and the revision Admin saw, audits the decision and notifies the store; the public marks refresh at once.
export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return failure("Solicitud inválida.", 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some((key) => !["id", "decision", "reason", "expectedRevision", "validUntil"].includes(key))
    || !isEntityId(body.id) || !["approve", "reject", "revoke"].includes(body.decision)
    || (body.reason !== undefined && typeof body.reason !== "string")
    || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1
    || (body.validUntil !== undefined && body.validUntil !== null && !(typeof body.validUntil === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.validUntil)))) {
    return failure("Solicitud inválida.");
  }
  const supabase = await getSupabaseServerClient();
  if (!supabase) return failure("No se pudo validar tu cuenta.", 503);
  const { data, error } = await storeReachDb(supabase).rpc("admin_review_dealer_authorization", {
    p_id: body.id,
    p_decision: body.decision,
    p_expected_revision: body.expectedRevision,
    p_reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : null,
    p_valid_until: body.validUntil ?? null,
  });
  if (error) return failure(storeReachErrorMessage(error, "No se pudo guardar la decisión. Intenta nuevamente."), error.code === "42501" ? 403 : 400);
  revalidateTag(DEALERS_CACHE_TAG);
  return NextResponse.json({ ok: true, authorization: parseDealerAuthorization(data) }, { headers: { "Cache-Control": "no-store" } });
}

function failure(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}
