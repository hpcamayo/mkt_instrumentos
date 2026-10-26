import { discoveryErrorMessage, discoveryFailure, discoverySuccess, isPlainObject, optionalInteger, optionalText } from "@/lib/discovery/api";
import { isEntityId } from "@/lib/marketplace-event-payload";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// disc-04 and disc-05: the seller saves a listing's marks: "Hecho a mano", "Se hace a pedido" (maker stores) and the
// verified artist's note. The database checks who sells it and who may use each mark (set_listing_maker_details).
export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return discoveryFailure("Solicitud inválida.", 403);
  const body = await request.json().catch(() => null);
  if (!isPlainObject(body) || Object.keys(body).some((key) => !["listingId", "handmade", "madeToOrderWeeks", "artistNote"].includes(key))) {
    return discoveryFailure("Solicitud inválida.");
  }
  const weeks = optionalInteger(body.madeToOrderWeeks, 1, 26);
  const note = optionalText(body.artistNote, 140);
  if (!isEntityId(body.listingId) || typeof body.handmade !== "boolean" || weeks === undefined || note === undefined) {
    return discoveryFailure("Revisa los datos de la publicación.");
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) return discoveryFailure("No se pudo validar tu cuenta.", 503);
  const db = supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }> };
  const { data, error } = await db.rpc("set_listing_maker_details", {
    p_listing_id: body.listingId,
    p_handmade: body.handmade,
    p_made_to_order_weeks: weeks,
    p_artist_note: note,
  });
  if (error) {
    if (!discoveryErrorMessage(error, "")) console.error("discovery_listing_failure", error.code ?? "rpc_error");
    return discoveryFailure(discoveryErrorMessage(error, "No se pudo guardar. Intenta nuevamente."));
  }
  return discoverySuccess(data);
}
