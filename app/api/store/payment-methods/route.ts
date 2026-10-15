import { NextResponse } from "next/server";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { assistedCommerceEnabled, isPaymentMethod, paymentErrorMessage } from "@/lib/payment-methods";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// PAY-1: a store owner proposes, changes or stops offering one accepted payment method. The database binds the store to
// the signed-in owner, requires verification and sends every change to Admin review.
export async function POST(request: Request) {
  if (!assistedCommerceEnabled()) return failure("Esta función aún no está disponible.", 404);
  if (!sameOriginEventRequest(request)) return failure("Solicitud inválida.", 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some((key) => !["action", "method", "holderName", "providerLabel", "note"].includes(key))
    || !isPaymentMethod(body.method) || (body.action !== "save" && body.action !== "withdraw")) {
    return failure("Solicitud inválida.");
  }
  const text = (value: unknown) => (typeof value === "string" ? value.slice(0, 400) : undefined);

  const supabase = await getSupabaseServerClient();
  if (!supabase) return failure("No se pudo validar tu cuenta.", 503);
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return failure("Ingresa a tu cuenta.", 401);

  const { data, error } = body.action === "save"
    ? await supabase.rpc("set_store_payment_method", {
        p_method: body.method,
        p_holder_name: text(body.holderName),
        p_provider_label: text(body.providerLabel),
        p_note: text(body.note),
      })
    : await supabase.rpc("withdraw_store_payment_method", { p_method: body.method });
  if (error) {
    if (!paymentErrorMessage(error, "")) console.error("store_payment_method_failure", error.code ?? "rpc_error");
    return failure(paymentErrorMessage(error, "No se pudo guardar el medio de pago. Intenta nuevamente."));
  }
  return NextResponse.json({ ok: true, method: data }, { headers: { "Cache-Control": "no-store" } });
}

function failure(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}
