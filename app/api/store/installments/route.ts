import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { assistedCommerceEnabled, paymentErrorMessage } from "@/lib/payment-methods";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// store-floor, buy-09: a store owner proposes, changes or stops offering interest-free installments. The database
// binds the store to the signed-in owner, requires verification and a card method, and sends every change to review.
export async function POST(request: Request) {
  if (!assistedCommerceEnabled()) return failure("Esta función aún no está disponible.", 404);
  if (!sameOriginEventRequest(request)) return failure("Solicitud inválida.", 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some((key) => !["action", "maxInstallments", "cards", "minPricePen", "note", "interestFree"].includes(key))
    || (body.action !== "save" && body.action !== "withdraw")) {
    return failure("Solicitud inválida.");
  }
  if (body.action === "save" && (!Number.isSafeInteger(body.maxInstallments)
    || (body.cards !== undefined && (!Array.isArray(body.cards) || body.cards.length > 20 || body.cards.some((card: unknown) => typeof card !== "string")))
    || (body.minPricePen !== undefined && body.minPricePen !== null && !Number.isSafeInteger(body.minPricePen))
    || typeof body.interestFree !== "boolean")) {
    return failure("Solicitud inválida.");
  }

  const client = await getSupabaseServerClient();
  if (!client) return failure("No se pudo validar tu cuenta.", 503);
  // The installment functions are newer than the generated database types.
  const supabase = client as unknown as SupabaseClient;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return failure("Ingresa a tu cuenta.", 401);

  const { data, error } = body.action === "save"
    ? await supabase.rpc("set_store_installments", {
        p_max_installments: body.maxInstallments,
        p_cards: (body.cards ?? []).map((card: string) => card.slice(0, 60)),
        p_min_price_pen: body.minPricePen ?? null,
        p_note: typeof body.note === "string" ? body.note.slice(0, 400) : null,
        p_interest_free: body.interestFree,
      })
    : await supabase.rpc("withdraw_store_installments");
  if (error) {
    if (!paymentErrorMessage(error, "")) console.error("store_installments_failure", error.code ?? "rpc_error");
    return failure(paymentErrorMessage(error, "No se pudieron guardar las cuotas. Intenta nuevamente."));
  }
  return NextResponse.json({ ok: true, offer: data }, { headers: { "Cache-Control": "no-store" } });
}

function failure(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}
