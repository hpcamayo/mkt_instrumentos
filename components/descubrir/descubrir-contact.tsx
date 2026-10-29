"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { markSafetySheetSeen, safetySheetSeen } from "@/components/listing/contact-state";
import { SafetySheet } from "@/components/listing/safety-sheet";
import { buttonClasses } from "@/components/ui/button";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { contactRequestBody } from "@/components/whatsapp-contact-link";
import { needsSafetySheet } from "@/lib/contact-message";
import { ensureMarketplaceSession } from "@/lib/marketplace-events-client";
import type { EventSource } from "@/lib/marketplace-event-payload";

// WhatsApp in one press, through the listing page's contact path (talk-03): /api/contact records the contact and
// answers with the wa.me link. Phones never travel with the feed (launch audit A27), so the link arrives only after
// the press: a blank tab opens inside the press, where the browser allows it, and goes to WhatsApp when the route
// answers; with no tab (a blocked popup) this page goes there instead. The one-time safety sheet comes first for
// S/ 1,000 or more (talk-04), and its "Continuar a WhatsApp" is itself the press.
export async function openWhatsApp(listingId: string, source: EventSource) {
  let tab: Window | null = null;
  try {
    tab = window.open("", "_blank");
    if (tab) {
      tab.opener = null;
      tab.document.title = "Abriendo WhatsApp…";
      tab.document.body.textContent = "Abriendo WhatsApp…";
    }
  } catch {
    // A blocked or cross-origin tab: this page opens WhatsApp itself.
  }
  try {
    await ensureMarketplaceSession().catch(() => undefined);
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contactRequestBody({ listingId, source }, crypto.randomUUID())),
    });
    const body = response.ok ? ((await response.json()) as { url?: unknown }) : null;
    const url = typeof body?.url === "string" && body.url.startsWith("https://wa.me/") ? body.url : null;
    if (url) {
      if (tab && !tab.closed) tab.location.replace(url);
      else window.location.assign(url);
      return true;
    }
  } catch {
    // Offline: the same as a refused contact, below.
  }
  tab?.close();
  return false;
}

export function DescubrirContact({ listingId, slug, pricePen, source, className }: { listingId: string; slug: string; pricePen: number | null; source: EventSource; className?: string }) {
  const [sheet, setSheet] = useState(false);
  const [failed, setFailed] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  const contact = () => {
    setFailed(false);
    void openWhatsApp(listingId, source).then((opened) => setFailed(!opened));
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className={buttonClasses({ className })}
        onClick={() => {
          if (needsSafetySheet(pricePen, false) && !safetySheetSeen()) setSheet(true);
          else contact();
        }}
      >
        <WhatsAppGlyph />
        WhatsApp
      </button>
      {failed ? (
        <p role="alert" className="basis-full t-meta text-danger">
          No pudimos abrir WhatsApp. <Link href={`/instrumentos/${slug}`} className="link font-semibold">Abre la publicación</Link> para escribir desde ahí.
        </p>
      ) : null}
      {sheet ? (
        <SafetySheet
          onContinue={() => {
            markSafetySheetSeen();
            contact();
          }}
          onDismiss={() => {
            setSheet(false);
            requestAnimationFrame(() => button.current?.focus({ preventScroll: true }));
          }}
        />
      ) : null}
    </>
  );
}
