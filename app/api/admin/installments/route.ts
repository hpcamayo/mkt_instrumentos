import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isEntityId } from "@/lib/marketplace-event-payload";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { paymentErrorMessage } from "@/lib/payment-methods";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// store-floor, buy-09: an Admin approves, rejects or disables a store's interest-free installments. The database
// checks the Admin role, the store's live verification and the revision the Admin saw; every decision is audited.
export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return failure("Solicitud inválida.", 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some((key) => !["storeId", "decision", "reason", "expectedRevision"].includes(key))
    || !isEntityId(body.storeId) || !["approve", "reject", "disable"].includes(body.decision)
    || typeof body.reason !== "string" || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1) {
    return failure("Solicitud inválida.");
  }

  const client = await getSupabaseServerClient();
  if (!client) return failure("No se pudo validar tu cuenta.", 503);
  // The installment functions are newer than the generated database types.
  const supabase = client as unknown as SupabaseClient;
  const { data, error } = await supabase.rpc("admin_review_store_installments", {
    p_store_id: body.storeId,
    p_decision: body.decision,
    p_reason: body.reason.slice(0, 400),
    p_expected_revision: body.expectedRevision,
  });
  if (error) {
    if (!paymentErrorMessage(error, "")) console.error("admin_installments_failure", error.code ?? "rpc_error");
    return failure(paymentErrorMessage(error, "No se pudo guardar la decisión. Intenta nuevamente."), error.code === "42501" ? 403 : 400);
  }
  return NextResponse.json({ ok: true, offer: data }, { headers: { "Cache-Control": "no-store" } });
}

function failure(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}
