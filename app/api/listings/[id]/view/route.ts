import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getMarketplaceActor, getMarketplaceSession, recordMarketplaceEvent, sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { isUuid } from "@/lib/marketplace-event-payload";

type ListingViewRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  request: Request,
  { params }: ListingViewRouteContext,
) {
  const { id } = await params;
  if (!sameOriginEventRequest(request) || !isUuid(id)) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  try {
    const [actorId, sessionId] = await Promise.all([getMarketplaceActor(), getMarketplaceSession()]);
    const result = await recordMarketplaceEvent({ type: "listing_view", listingId: id, eventId: randomUUID(), actorId, sessionId, source: "detail" });
    return result ? NextResponse.json(result, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "No se pudo registrar la visita." }, { status: 503 });
  } catch { return NextResponse.json({ error: "No se pudo registrar la visita." }, { status: 503 }); }
}
