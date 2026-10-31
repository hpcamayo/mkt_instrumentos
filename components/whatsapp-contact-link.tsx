"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { getQuestions, markSafetySheetSeen, safetySheetSeen } from "@/components/listing/contact-state";
import { SafetySheet } from "@/components/listing/safety-sheet";
import { trackRecordLineFor } from "@/components/trust/track-record-state";
import { withQuestions } from "@/lib/contact-message";
import { ensureMarketplaceSession } from "@/lib/marketplace-events-client";
import type { EventSource } from "@/lib/marketplace-event-payload";

// The WhatsApp contact (talk-03): a normal link that opens WhatsApp at once. The contact is recorded in the background
// (`keepalive`), never holding the buyer; a failed record never blocks contact. The server already built the right
// link, including "Solicitar compra" (PAY-1), so nothing waits for the route. On a listing, the quick questions the
// visitor picked (talk-02) are added to the message at the moment of the press. `safety` shows the one-time safety
// sheet before the first such contact (talk-04); "Continuar a WhatsApp" there is itself a plain link.
// `intent="purchase"` (PAY-1) tells the contact route to record the purchase intent; the route checks eligibility.
// `quantity` (stock-23) is already in a purchase request's message (withPurchaseQuantity); the route clamps it too.
// `addQuestions={false}`: an offer (talk-07) sends its own message, without the quick questions.
type ContactTarget = { listingId?: string; storeId?: string; intent?: "purchase"; quantity?: number; source: EventSource };

// The event the contact route records: identity and source only, never the message.
export function contactRequestBody(target: ContactTarget, eventId: string) {
  return {
    eventId,
    ...(target.listingId ? { listingId: target.listingId } : { storeId: target.storeId }),
    ...(target.listingId && target.intent ? { intent: target.intent } : {}),
    ...(target.listingId && target.intent && target.quantity && target.quantity > 1 ? { quantity: target.quantity } : {}),
    source: target.source,
  };
}

// Fire and forget: the page stays open (the link opens a new tab), and `keepalive` lets the request finish anyway.
export async function recordContact(target: ContactTarget) {
  try {
    await ensureMarketplaceSession();
    await fetch("/api/contact", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(contactRequestBody(target, crypto.randomUUID())) });
  } catch { /* Recording is best effort; the contact already opened. */ }
}

// What a press does: the link with the chosen questions, and whether the safety sheet comes first.
export function planContact({ href, questions, safety, modified, seen }: { href: string; questions: string[]; safety: boolean; modified: boolean; seen: boolean }) {
  return { destination: withQuestions(href, questions), sheet: safety && !modified && !seen };
}

export function WhatsAppContactLink({ href, listingId, storeId, intent, quantity, source = "detail", safety = false, addQuestions = true, className, children }: { href: string; listingId?: string; storeId?: string; intent?: "purchase"; quantity?: number; source?: EventSource; safety?: boolean; addQuestions?: boolean; className?: string; children: ReactNode }) {
  const [pending, setPending] = useState<string | null>(null);

  const record = () => void recordContact({ listingId, storeId, intent, quantity, source });

  function contact(event: MouseEvent<HTMLAnchorElement>) {
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    // deal-trust (safe-07): the buyer's track record line, when they turned it on and left it in for this listing. An
    // offer (talk-07) leaves the quick questions out but keeps this line, like every other message to a seller.
    const track = listingId ? trackRecordLineFor(listingId) : null;
    const questions = [...(listingId && addQuestions ? getQuestions(listingId) : []), ...(track ? [track] : [])];
    const { destination, sheet } = planContact({ href, questions, safety, modified, seen: safety ? safetySheetSeen() : true });
    if (sheet) {
      event.preventDefault();
      setPending(destination);
      return;
    }
    event.currentTarget.href = destination;
    record();
  }

  return (
    <>
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={contact}>{children}</a>
      {pending ? (
        <SafetySheet
          continueHref={pending}
          continueLabel={intent === "purchase" ? "Continuar con la solicitud" : "Continuar a WhatsApp"}
          onContinue={() => {
            markSafetySheetSeen();
            record();
          }}
          onDismiss={() => setPending(null)}
        />
      ) : null}
    </>
  );
}
