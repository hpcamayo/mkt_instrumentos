import { discoveryErrorMessage, discoveryFailure, discoverySuccess, isPlainObject, optionalInteger, optionalText } from "@/lib/discovery/api";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// disc-04 and buy-05: the store owner saves the maker profile (Fabricante or Taller, its city and story) or the gift
// exchange policy. The database checks the owner, the store's state and every value (set_store_maker_profile,
// set_store_gift_policy).
export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return discoveryFailure("Solicitud inválida.", 403);
  const body = await request.json().catch(() => null);
  if (!isPlainObject(body) || (body.action !== "maker" && body.action !== "gift")) return discoveryFailure("Solicitud inválida.");

  const supabase = await getSupabaseServerClient();
  if (!supabase) return discoveryFailure("No se pudo validar tu cuenta.", 503);
  const db = supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }> };

  let result;
  if (body.action === "maker") {
    const kind = body.kind === null ? null : body.kind === "fabricante" || body.kind === "taller" ? body.kind : undefined;
    const craftCity = optionalText(body.craftCity, 60);
    const story = optionalText(body.story, 1500);
    const sinceYear = optionalInteger(body.sinceYear, 1900, 2100);
    if (kind === undefined || craftCity === undefined || story === undefined || sinceYear === undefined) return discoveryFailure("Revisa los datos del taller.");
    result = await db.rpc("set_store_maker_profile", { p_kind: kind, p_craft_city: craftCity, p_story: story, p_since_year: sinceYear });
  } else {
    const days = optionalInteger(body.days, 3, 60);
    const note = optionalText(body.note, 200);
    if (days === undefined || note === undefined) return discoveryFailure("Indica entre 3 y 60 días.");
    result = await db.rpc("set_store_gift_policy", { p_days: days, p_note: note });
  }
  if (result.error) {
    if (!discoveryErrorMessage(result.error, "")) console.error("discovery_store_failure", result.error.code ?? "rpc_error");
    return discoveryFailure(discoveryErrorMessage(result.error, "No se pudo guardar. Intenta nuevamente."));
  }
  return discoverySuccess(result.data);
}
