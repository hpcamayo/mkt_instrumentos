import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { parseClientEvent } from "@/lib/marketplace-event-payload";
import { getMarketplaceActor, getMarketplaceSession, logMarketplaceEventFailure, readSearchReceipt, recordMarketplaceEvent, sameOriginEventRequest } from "@/lib/marketplace-events-server";

export async function POST(request: Request) {
  const requestId = randomUUID();
  if (!sameOriginEventRequest(request)) return failure(403, requestId);
  if (Number(request.headers.get("content-length")) > 65536) return failure(413, requestId);
  const body = await request.json().catch(() => null);
  if (!body || Object.keys(body).some((key) => key !== "events") || !Array.isArray(body.events) || body.events.length < 1 || body.events.length > 20) return failure(400, requestId);
  const events = body.events.map(parseClientEvent);
  if (events.some((event: ReturnType<typeof parseClientEvent>) => !event)) return failure(400, requestId);
  const prepared = (events as NonNullable<ReturnType<typeof parseClientEvent>>[]).map((event) => ({ event, metadata: event.searchReceipt ? readSearchReceipt(event.searchReceipt) : {} }));
  if (prepared.some((item) => !item.metadata)) return failure(400, requestId);
  try {
    const [actorId, sessionId] = await Promise.all([getMarketplaceActor(), getMarketplaceSession()]);
    const results = [];
    for (const { event, metadata } of prepared) {
      const result = await recordMarketplaceEvent({ type: event.type, actorId, sessionId, eventId: event.eventId, listingId: event.listingId, storeId: event.storeId, source: event.source, metadata, requestId });
      if (!result) return failure(503, requestId);
      results.push({ eventId: event.eventId, ...result });
    }
    return NextResponse.json({ events: results }, { headers: responseHeaders(requestId) });
  } catch (error) {
    logMarketplaceEventFailure({
      requestId,
      type: "event_batch",
      category: "request_context",
      code: error instanceof Error ? error.name : "unknown_error",
    });
    return failure(503, requestId);
  }
}
function responseHeaders(requestId: string) { return { "Cache-Control": "no-store", "X-Request-Id": requestId }; }
function failure(status: number, requestId: string) { return NextResponse.json({ error: "No se pudo registrar la actividad." }, { status, headers: responseHeaders(requestId) }); }
