import { NextResponse } from "next/server";
import { parseClientEvent } from "@/lib/marketplace-event-payload";
import { getMarketplaceActor, getMarketplaceSession, readSearchReceipt, recordMarketplaceEvent, sameOriginEventRequest } from "@/lib/marketplace-events-server";

export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return failure(403);
  if (Number(request.headers.get("content-length")) > 65536) return failure(413);
  const body = await request.json().catch(() => null);
  if (!body || Object.keys(body).some((key) => key !== "events") || !Array.isArray(body.events) || body.events.length < 1 || body.events.length > 20) return failure(400);
  const events = body.events.map(parseClientEvent);
  if (events.some((event: ReturnType<typeof parseClientEvent>) => !event)) return failure(400);
  const prepared = (events as NonNullable<ReturnType<typeof parseClientEvent>>[]).map((event) => ({ event, metadata: event.searchReceipt ? readSearchReceipt(event.searchReceipt) : {} }));
  if (prepared.some((item) => !item.metadata)) return failure(400);
  try {
    const [actorId, sessionId] = await Promise.all([getMarketplaceActor(), getMarketplaceSession()]);
    const results = [];
    for (const { event, metadata } of prepared) {
      const result = await recordMarketplaceEvent({ type: event.type, actorId, sessionId, eventId: event.eventId, listingId: event.listingId, storeId: event.storeId, source: event.source, metadata });
      if (!result) return failure(503);
      results.push({ eventId: event.eventId, ...result });
    }
    return NextResponse.json({ events: results }, { headers: { "Cache-Control": "no-store" } });
  } catch { return failure(503); }
}
function failure(status: number) { return NextResponse.json({ error: "No se pudo registrar la actividad." }, { status, headers: { "Cache-Control": "no-store" } }); }
