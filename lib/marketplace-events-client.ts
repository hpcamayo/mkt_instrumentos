"use client";

import type { ClientEvent } from "@/lib/marketplace-event-payload";

type Receipt = { recorded: boolean; view_count?: number };
type Pending = { event: ClientEvent; resolve: (receipt: Receipt | null) => void };
let sessionPromise: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
const pending: Pending[] = [];
const seen = new Map<string, { at: number; result: Promise<Receipt | null> }>();
const browsingWindow = 30 * 60 * 1000;

export function ensureMarketplaceSession() {
  if (!sessionPromise) {
    sessionPromise = fetch("/api/events/session", { method: "POST", signal: AbortSignal.timeout(8000) })
      .then((response) => { if (!response.ok) throw new Error("Session unavailable."); })
      .catch((error) => { sessionPromise = null; throw error; });
  }
  return sessionPromise;
}

export function sendMarketplaceEvent(event: Omit<ClientEvent, "eventId">) {
  return new Promise<Receipt | null>((resolve) => {
    if (pending.length >= 200) { resolve(null); return; }
    pending.push({ event: { ...event, eventId: crypto.randomUUID() }, resolve });
    if (!timer && !flushing) timer = setTimeout(() => { void flush(); }, 80);
  });
}

async function flush() {
  timer = null;
  if (flushing) return;
  flushing = true;
  const batch = pending.splice(0, 20);
  let receipts: (Receipt & { eventId: string })[] = [];
  try {
    await ensureMarketplaceSession();
    // A lost response retries the same event IDs, never a new logical event.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: batch.map((item) => item.event) }), signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error("Events unavailable.");
        receipts = (await response.json()).events ?? [];
        break;
      } catch { /* Telemetry cannot prevent browsing. */ }
    }
  } catch { /* A future interaction may establish a new first-party session. */ }
  for (const item of batch) item.resolve(receipts.find((receipt) => receipt.eventId === item.event.eventId) ?? null);
  flushing = false;
  if (pending.length) timer = setTimeout(() => { void flush(); }, 80);
}

export function sendBrowsingEvent(event: Omit<ClientEvent, "eventId">, entityId: string) {
  const key = `${event.type}:${entityId}`;
  const previous = seen.get(key);
  if (previous && Date.now() - previous.at < browsingWindow) return previous.result;
  const result = sendMarketplaceEvent(event);
  seen.set(key, { at: Date.now(), result });
  if (seen.size > 500) seen.delete(seen.keys().next().value!);
  return result;
}
