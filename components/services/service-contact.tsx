"use client";

import { useEffect, type ReactNode } from "react";
import { ensureMarketplaceSession } from "@/lib/marketplace-events-client";

// bet-02: a view or a contact of a service, recorded by /api/services/events in the background (`keepalive`). The page
// and WhatsApp never wait for it, and a failed record never blocks the contact.
export async function recordServiceEvent(serviceId: string, kind: "view" | "contact") {
  try {
    await ensureMarketplaceSession();
    await fetch("/api/services/events", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: crypto.randomUUID(), serviceId, kind }),
    });
  } catch { /* Recording is best effort. */ }
}

export const SERVICE_CONTACTED_EVENT = "laria:service-contacted";

// Counts the page view once per load (the database keeps one per person every 30 minutes). A preview by its owner or
// Admin is never counted.
export function ServiceViewRecorder({ serviceId, enabled }: { serviceId: string; enabled: boolean }) {
  useEffect(() => {
    if (enabled) void recordServiceEvent(serviceId, "view");
  }, [enabled, serviceId]);
  return null;
}

// The WhatsApp contact: a normal link that opens WhatsApp at once, with the contact recorded in the background. The
// record is what later lets a signed-in client confirm the hire and leave a review.
export function ServiceWhatsAppLink({ href, serviceId, className, children }: { href: string; serviceId: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => {
        void recordServiceEvent(serviceId, "contact").then(() => window.dispatchEvent(new CustomEvent(SERVICE_CONTACTED_EVENT, { detail: serviceId })));
      }}
    >
      {children}
    </a>
  );
}
