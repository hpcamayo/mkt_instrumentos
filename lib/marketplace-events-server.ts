import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";
import { isUuid, searchEventMetadata, type EventSource } from "@/lib/marketplace-event-payload";
import type { ListingFilters } from "@/lib/listings";
import type { Json } from "@/lib/supabase/database.types";

const cookieName = "laria-marketplace-session";
const sessionSeconds = 86400;
function sign(domain: string, data: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Event configuration unavailable.");
  return createHmac("sha256", key).update(`${domain}:${data}`).digest("base64url");
}
function readSigned(domain: string, token: string) {
  try {
    const [data, signature, extra] = token.split(".");
    if (!data || !signature || extra) return null;
    const expected = Buffer.from(sign(domain, data)); const supplied = Buffer.from(signature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    return JSON.parse(Buffer.from(data, "base64url").toString());
  } catch { return null; }
}
export function sameOriginEventRequest(request: Request) {
  const origin = request.headers.get("origin");
  return request.headers.get("sec-fetch-site") !== "cross-site" && (!origin || origin === new URL(request.url).origin);
}
export async function getMarketplaceSession() {
  const jar = await cookies();
  const existing = readSigned("marketplace-session", jar.get(cookieName)?.value ?? "");
  const current = Math.floor(Date.now() / 1000);
  if (isUuid(existing?.id) && Number.isInteger(existing?.issuedAt) && existing.issuedAt <= current && current - existing.issuedAt < sessionSeconds) return existing.id as string;
  const id = randomUUID();
  const data = Buffer.from(JSON.stringify({ id, issuedAt: current })).toString("base64url");
  jar.set(cookieName, `${data}.${sign("marketplace-session", data)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: sessionSeconds });
  return id;
}
export async function getMarketplaceActor() {
  const client = await getSupabaseServerClient();
  const { data } = client ? await client.auth.getUser() : { data: null };
  return data?.user?.id ?? null;
}
export function createSearchReceipt(filters: ListingFilters, resultCount: number) {
  try {
    const metadata = searchEventMetadata(filters, resultCount);
    if (Buffer.byteLength(JSON.stringify(metadata)) > 4096) return null;
    const payload = Buffer.from(JSON.stringify({ issuedAt: Date.now(), metadata })).toString("base64url");
    return `${payload}.${sign("marketplace-search", payload)}`;
  } catch { return null; }
}
export function readSearchReceipt(token: string) {
  const receipt = readSigned("marketplace-search", token);
  if (!Number.isInteger(receipt?.issuedAt) || receipt.issuedAt > Date.now() || Date.now() - receipt.issuedAt > 15 * 60 * 1000) return null;
  return receipt.metadata as Json;
}
export async function recordMarketplaceEvent(event: {
  type: string; sessionId: string; eventId: string; actorId: string | null;
  listingId?: string; storeId?: string; submissionId?: string; source?: EventSource; metadata?: Json;
}) {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  const { data, error } = await client.rpc("record_marketplace_event", {
    p_event_type: event.type, p_session_id: event.sessionId, p_event_id: event.eventId,
    p_actor_user_id: event.actorId ?? undefined, p_listing_id: event.listingId ?? undefined,
    p_store_id: event.storeId ?? undefined, p_submission_id: event.submissionId ?? undefined,
    p_source: event.source ?? "other", p_metadata: event.metadata ?? {},
  }).abortSignal(AbortSignal.timeout(1500));
  return error ? null : data as { recorded: boolean; view_count?: number };
}
