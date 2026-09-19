import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { eventSources, isUuid, type EventSource } from "@/lib/marketplace-event-payload";
import { getMarketplaceActor, getMarketplaceSession, logMarketplaceEventFailure, recordMarketplaceEvent, sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { buildStoreWhatsAppUrl, buildWhatsAppUrl, type ListingDetailData } from "@/lib/listings";
import { getPublicSupabaseClient } from "@/lib/supabase/public-client";

export async function POST(request: Request) {
  const requestId = randomUUID();
  if (!sameOriginEventRequest(request)) return failure(403, requestId);
  const body = await request.json().catch(() => null);
  if (!body || Object.keys(body).some((key) => !["eventId", "listingId", "storeId", "source"].includes(key)) || !isUuid(body.eventId)
    || (body.source !== undefined && !eventSources.includes(body.source))
    || (isUuid(body.listingId) === isUuid(body.storeId))
    || (body.listingId !== undefined && !isUuid(body.listingId)) || (body.storeId !== undefined && !isUuid(body.storeId))) return failure(400, requestId);
  const client = getPublicSupabaseClient();
  if (!client) return failure(503, requestId);
  let url: string;
  if (body.listingId) {
    const { data, error } = await client.from("listings").select("id,title,seller_type,owner_user_id,contact_name,whatsapp_phone,city,region,created_at,profiles!listings_owner_user_id_fkey(full_name,phone,city,region,created_at)").eq("id", body.listingId).eq("status", "approved").maybeSingle();
    if (error || !data) return failure(404, requestId);
    url = buildWhatsAppUrl(data as unknown as ListingDetailData);
  } else {
    const { data } = await client.from("stores").select("name,whatsapp_phone").eq("id", body.storeId).eq("status", "active").maybeSingle();
    if (!data) return failure(404, requestId);
    url = buildStoreWhatsAppUrl(data);
  }
  let recorded = false;
  try {
    const [actorId, sessionId] = await Promise.all([getMarketplaceActor(), getMarketplaceSession()]);
    recorded = (await recordMarketplaceEvent({ type: body.listingId ? "whatsapp_contact" : "store_contact", actorId, sessionId, eventId: body.eventId, listingId: body.listingId, storeId: body.storeId, source: (body.source ?? "detail") as EventSource, requestId }))?.recorded ?? false;
  } catch (error) {
    logMarketplaceEventFailure({
      requestId,
      type: body.listingId ? "whatsapp_contact" : "store_contact",
      category: "request_context",
      code: error instanceof Error ? error.name : "unknown_error",
    });
    // Contact stays available if event storage or session setup is temporarily unavailable.
  }
  return NextResponse.json({ url, recorded }, { headers: responseHeaders(requestId) });
}
function responseHeaders(requestId: string) { return { "Cache-Control": "no-store", "X-Request-Id": requestId }; }
function failure(status: number, requestId: string) { return NextResponse.json({ error: "Este contacto no está disponible." }, { status, headers: responseHeaders(requestId) }); }
