import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { parseCampaignEntry } from "@/lib/campaigns";
import { CAMPAIGNS_CACHE_TAG } from "@/lib/campaigns-server";
import { isEntityId } from "@/lib/marketplace-event-payload";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { parseWholeSolPrice } from "@/lib/price";
import { storeReachDb, storeReachErrorMessage } from "@/lib/store-reach-db";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// reach-05 "Campañas Laria": the store opts one publication into a campaign (its campaign price and its explicit choice
// for the end) or takes one out. The database binds the store to the signed-in owner and checks the reference price.
export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return failure("Solicitud inválida.", 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return failure("Solicitud inválida.");
  const supabase = await getSupabaseServerClient();
  if (!supabase) return failure("No se pudo validar tu cuenta.", 503);
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return failure("Ingresa a tu cuenta.", 401);
  const db = storeReachDb(supabase);

  if (body.action === "join") {
    if (Object.keys(body).some((key) => !["action", "campaignId", "listingId", "price", "after"].includes(key))
      || !isEntityId(body.campaignId) || !isEntityId(body.listingId)) return failure("Solicitud inválida.");
    if (body.after !== "restore" && body.after !== "keep") return failure("Elige qué pasa con el precio cuando termine la campaña.");
    const price = parseWholeSolPrice(body.price);
    if (price === null) return failure("Escribe el precio de campaña en soles, sin decimales.");
    const { data, error } = await db.rpc("join_campaign", {
      p_campaign_id: body.campaignId,
      p_listing_id: body.listingId,
      p_campaign_price: price,
      p_after_campaign: body.after,
    });
    if (error) return failure(storeReachErrorMessage(error, "No se pudo inscribir la publicación. Intenta nuevamente."));
    const entry = parseCampaignEntry(data);
    if (entry?.status === "live") revalidateTag(CAMPAIGNS_CACHE_TAG);
    return NextResponse.json({ ok: true, entry }, { headers: { "Cache-Control": "no-store" } });
  }

  if (body.action === "withdraw") {
    if (Object.keys(body).some((key) => !["action", "entryId"].includes(key)) || !isEntityId(body.entryId)) return failure("Solicitud inválida.");
    const { data, error } = await db.rpc("withdraw_campaign_entry", { p_entry_id: body.entryId });
    if (error) return failure(storeReachErrorMessage(error, "No se pudo retirar la publicación. Intenta nuevamente."));
    revalidateTag(CAMPAIGNS_CACHE_TAG);
    return NextResponse.json({ ok: true, entry: parseCampaignEntry(data) }, { headers: { "Cache-Control": "no-store" } });
  }

  return failure("Solicitud inválida.");
}

function failure(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}
