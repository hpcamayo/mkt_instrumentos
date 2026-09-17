"use client";

import type { MouseEvent, ReactNode } from "react";
import { ensureMarketplaceSession } from "@/lib/marketplace-events-client";
import type { EventSource } from "@/lib/marketplace-event-payload";

export function WhatsAppContactLink({ href, listingId, storeId, source = "detail", className, children }: { href: string; listingId?: string; storeId?: string; source?: EventSource; className?: string; children: ReactNode }) {
  async function contact(event: MouseEvent<HTMLAnchorElement>) {
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    let tab: Window | null = null;
    if (!modified) {
      event.preventDefault();
      tab = window.open("about:blank", "_blank");
      if (tab) tab.opener = null;
    }
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 900);
    let destination = href;
    try {
      const record = async () => {
        await ensureMarketplaceSession();
        const response = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ eventId: crypto.randomUUID(), ...(listingId ? { listingId } : { storeId }), source }) });
        if (!response.ok) return;
        const payload = await response.json();
        if (typeof payload.url === "string" && payload.url.startsWith("https://wa.me/")) destination = payload.url;
      };
      // Even a delayed session request must not strand the contact action.
      await Promise.race([record(), new Promise<void>((resolve) => controller.signal.addEventListener("abort", () => resolve(), { once: true }))]);
    } catch { /* The existing contact URL is always the safe fallback. */ }
    finally { clearTimeout(deadline); }
    if (!modified) {
      if (tab && !tab.closed) tab.location.href = destination;
      else window.location.assign(destination);
    }
  }
  return <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={contact}>{children}</a>;
}
