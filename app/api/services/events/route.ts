import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { isUuid } from "@/lib/marketplace-event-payload";
import { getMarketplaceSession, sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { sessionOwesTwoStep } from "@/lib/auth/complete-session";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";
import { servicesDb } from "@/lib/services-db";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

// bet-02: a service page view or a press of its WhatsApp button. Recorded by the server (service role) with the signed
// browsing session and the signed-in account, never the message. The database counts a view once per person or
// session per 30 minutes, ignores the owner and Admin, and keeps the contact that later lets a client confirm the
// hire. Recording is best effort: the page and WhatsApp never wait for it.
export async function POST(request: Request) {
  const requestId = randomUUID();
  if (!sameOriginEventRequest(request)) return reply(403, { recorded: false }, requestId);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Object.keys(body).some((key) => !["eventId", "serviceId", "kind"].includes(key))
    || !isUuid(body.eventId) || !isUuid(body.serviceId) || (body.kind !== "view" && body.kind !== "contact")) {
    return reply(400, { recorded: false }, requestId);
  }
  const admin = getSupabaseAdminClient();
  if (!admin) return reply(503, { recorded: false }, requestId);
  try {
    const supabase = await getSupabaseServerClient();
    if (!supabase) return reply(503, { recorded: false }, requestId);
    const [{ data: auth }, sessionId] = await Promise.all([supabase.auth.getUser(), getMarketplaceSession()]);
    const actorId = auth.user?.id ?? null;
    if (actorId && await sessionOwesTwoStep(supabase)) return reply(403, { recorded: false }, requestId);
    const { data, error } = await servicesDb(admin).rpc("record_service_event", {
      p_event_id: body.eventId,
      p_service_id: body.serviceId,
      p_kind: body.kind,
      p_actor_user_id: actorId,
      p_session_id: sessionId,
    });
    if (error) {
      console.error("Service event failed", { requestId, code: error.code });
      return reply(503, { recorded: false }, requestId);
    }
    return reply(200, { recorded: (data as { recorded?: boolean } | null)?.recorded === true }, requestId);
  } catch (error) {
    console.error("Service event failed", { requestId, code: error instanceof Error ? error.name : "unknown_error" });
    return reply(503, { recorded: false }, requestId);
  }
}

function reply(status: number, body: { recorded: boolean }, requestId: string) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}
