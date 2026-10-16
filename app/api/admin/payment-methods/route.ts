import { NextResponse } from "next/server";
import { isEntityId } from "@/lib/marketplace-event-payload";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { isPaymentMethod, paymentErrorMessage } from "@/lib/payment-methods";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// PAY-1: an Admin approves, rejects or disables one store payment method. The database checks the Admin role, the
// store's live verification and that the method (or the store's RUC and razón social) did not change since the Admin
// saw it, by its revision; every decision is audited.
export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return failure("Solicitud inválida.", 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some((key) => !["storeId", "method", "decision", "reason", "expectedRevision"].includes(key))
    || !isEntityId(body.storeId) || !isPaymentMethod(body.method)
    || !["approve", "reject", "disable"].includes(body.decision)
    || typeof body.reason !== "string" || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1) {
    return failure("Solicitud inválida.");
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) return failure("No se pudo validar tu cuenta.", 503);
  const { data, error } = await supabase.rpc("admin_review_store_payment_method", {
    p_store_id: body.storeId,
    p_method: body.method,
    p_decision: body.decision,
    p_reason: body.reason.slice(0, 400),
    p_expected_revision: body.expectedRevision,
  });
  if (error) {
    if (!paymentErrorMessage(error, "")) console.error("admin_payment_method_failure", error.code ?? "rpc_error");
    return failure(paymentErrorMessage(error, "No se pudo guardar la decisión. Intenta nuevamente."), error.code === "42501" ? 403 : 400);
  }
  return NextResponse.json({ ok: true, method: data }, { headers: { "Cache-Control": "no-store" } });
}

function failure(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}
