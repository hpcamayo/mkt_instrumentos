import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { eventSources, isEntityId, isUuid, type EventSource } from "@/lib/marketplace-event-payload";
import { getMarketplaceActor, getMarketplaceSession, logMarketplaceEventFailure, recordMarketplaceEvent, sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { reservedCardIds } from "@/lib/listing-reservations-server";
import { buildStoreWhatsAppUrl, buildWhatsAppUrl, resolveContactPhone, type ListingDetailData } from "@/lib/listings";
import { assistedCommerceEnabled, buildPurchaseWhatsAppUrl, clampPurchaseQuantity, readPurchaseRequest } from "@/lib/payment-methods";
import { READ_BUDGETS, createDeadline } from "@/lib/request-deadline";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getPublicSupabaseClient } from "@/lib/supabase/public-client";

export async function POST(request: Request) {
  const requestId = randomUUID();
  if (!sameOriginEventRequest(request)) return failure(403, requestId);
  const body = await request.json().catch(() => null);
  if (!body || Object.keys(body).some((key) => !["eventId", "listingId", "storeId", "source", "intent", "quantity"].includes(key)) || !isUuid(body.eventId)
    || (body.intent !== undefined && (body.intent !== "purchase" || !body.listingId))
    || (body.quantity !== undefined && (body.intent !== "purchase" || !Number.isInteger(body.quantity)))
    || (body.source !== undefined && !eventSources.includes(body.source))
    || (isEntityId(body.listingId) === isEntityId(body.storeId))
    || (body.listingId !== undefined && !isEntityId(body.listingId)) || (body.storeId !== undefined && !isEntityId(body.storeId))) return failure(400, requestId);
  const client = getPublicSupabaseClient();
  if (!client) return failure(503, requestId);
  let url: string;
  // PAY-1: a purchase request only when the pilot is on and the listing allows it right now; otherwise the ordinary
  // contact, so a stale page never strands the buyer.
  let purchase = false;
  if (body.listingId) {
    // Launch audit A27: the public API key may not read a listing's contact or a seller's profile. The listing comes
    // through the public key, so row-level security still decides it is public; its contact comes with the service
    // role, and is used only when the listing is.
    // talk-06: a reserved listing's message says so, as on its page ("Vi que está reservado…"); Descubrir's button
    // takes its link from here. Read beside the listing, and optional: when that read is off, slow or failed, the
    // message is the usual one. Only Particular listings can be reserved, so a store's listing is never in the answer.
    const admin = getSupabaseAdminClient();
    if (!admin) return failure(503, requestId);
    const [listing, contact, reserved] = await Promise.all([
      client.from("listings").select("id,title,slug,price_pen,stock_state,seller_type,owner_user_id,city,region,created_at,stores(whatsapp_phone)").eq("id", body.listingId).eq("status", "approved").maybeSingle(),
      admin.from("listings").select("contact_name,whatsapp_phone,profiles!listings_owner_user_id_fkey(full_name,phone,city,region,created_at)").eq("id", body.listingId).maybeSingle(),
      reservedCardIds([{ id: body.listingId, seller_type: "individual" }], createDeadline(READ_BUDGETS.optionalMs, request.signal)).catch(() => new Set<string>()),
    ]);
    if (listing.error || contact.error || !listing.data || !contact.data) return failure(404, requestId);
    const data = { ...listing.data, ...contact.data };
    url = buildWhatsAppUrl(data as unknown as ListingDetailData, { reserved: data.seller_type === "individual" && reserved.has(body.listingId) });
    if (body.intent === "purchase" && assistedCommerceEnabled() && data.seller_type === "store") {
      const { data: context } = await client.rpc("get_listing_purchase_request", { p_listing_id: body.listingId });
      const request = readPurchaseRequest(context);
      if (request) {
        url = buildPurchaseWhatsAppUrl(resolveContactPhone(data as unknown as ListingDetailData), data, request.sku, clampPurchaseQuantity(body.quantity, request.maxQuantity));
        purchase = true;
      }
    }
  } else {
    const { data } = await client.from("stores").select("name,whatsapp_phone").eq("id", body.storeId).eq("status", "active").maybeSingle();
    if (!data) return failure(404, requestId);
    url = buildStoreWhatsAppUrl(data);
  }
  let recorded = false;
  try {
    const [actorId, sessionId] = await Promise.all([getMarketplaceActor(), getMarketplaceSession()]);
    recorded = (await recordMarketplaceEvent({ type: body.listingId ? "whatsapp_contact" : "store_contact", actorId, sessionId, eventId: body.eventId, listingId: body.listingId, storeId: body.storeId, source: (body.source ?? "detail") as EventSource, metadata: purchase ? { intent: "purchase" } : undefined, requestId }))?.recorded ?? false;
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
