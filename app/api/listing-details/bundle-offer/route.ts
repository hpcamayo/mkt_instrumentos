import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// buy-01: the seller's combo discount ("10% de descuento llevando 2 o más"), or none. A store sets its store's, a
// Particular their own (set_bundle_offer, 20261202120500). Laria only shows it; the price is agreed on WhatsApp.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return failure("Solicitud inválida.");
  const { discountPercent, minItems } = body as Record<string, unknown>;
  const discount = discountPercent === null ? null : Number(discountPercent);
  const items = minItems === undefined || minItems === null ? 2 : Number(minItems);
  if (discount !== null && (!Number.isInteger(discount) || discount < 5 || discount > 30)) return failure("Elige un descuento de 5% a 30%.");
  if (!Number.isInteger(items) || items < 2 || items > 5) return failure("Elige desde 2 hasta 5 publicaciones.");

  const supabase = await getSupabaseServerClient();
  if (!supabase) return failure("No se pudo validar tu cuenta.", 503);
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return failure("Ingresa a tu cuenta.", 401);
  const { data: profile } = await supabase.from("profiles").select("account_type").eq("id", userData.user.id).maybeSingle();
  const { data: store } = profile?.account_type === "store_owner" ? await supabase.rpc("get_own_store").select("id").maybeSingle() : { data: null };
  if (profile?.account_type === "store_owner" && !store) return failure("Necesitas una tienda pendiente o aprobada.", 409);

  const { error } = await supabase.rpc("set_bundle_offer", { p_store_id: store?.id ?? null, p_discount_percent: discount, p_min_items: items });
  if (error) {
    if (error.message.includes("BUNDLE_OFFER_INVALID")) return failure("Elige un descuento de 5% a 30%, desde 2 hasta 5 publicaciones.", 409);
    if (error.message.includes("BUNDLE_OFFER_NOT_ALLOWED")) return failure("Tu cuenta no puede ofrecer un descuento por combo.", 403);
    return failure("No se pudo guardar. Intenta nuevamente.", 409);
  }
  return NextResponse.json({ ok: true, offer: discount === null ? null : { discount_percent: discount, min_items: items } });
}

function failure(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}
