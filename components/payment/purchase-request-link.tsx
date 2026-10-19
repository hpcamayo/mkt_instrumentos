"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { WhatsAppContactLink } from "@/components/whatsapp-contact-link";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { withPurchaseQuantity } from "@/lib/payment-methods";
import { cn } from "@/lib/utils";

// Effortless Laria, inventory batch, stock-23: "Solicitar compra" with how many units, for listings that have more
// than one available. The stepper stops at what the buyer may ask for (available units, up to 10) without saying
// how many the store has (D-14). The quantity goes into the WhatsApp message only; nothing is reserved or charged.
export function PurchaseRequestLink({ href, listingId, maxQuantity, className }: { href: string; listingId: string; maxQuantity: number; className?: string }) {
  const [quantity, setQuantity] = useState(1);
  const step = "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line-strong bg-surface text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4";
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 lg:w-full lg:flex-none">
      <div role="group" aria-label="Cantidad" className="flex shrink-0 items-center gap-1">
        <button type="button" className={step} aria-label="Una unidad menos" disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))}>
          <Minus aria-hidden />
        </button>
        <output aria-live="polite" aria-label={`Cantidad: ${quantity}`} className="min-w-6 text-center t-ui font-semibold tabular-nums text-ink">{quantity}</output>
        <button type="button" className={step} aria-label="Una unidad más" disabled={quantity >= maxQuantity} onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}>
          <Plus aria-hidden />
        </button>
      </div>
      <WhatsAppContactLink href={withPurchaseQuantity(href, quantity)} listingId={listingId} intent="purchase" quantity={quantity} className={cn(className, "lg:flex-1")}>
        <WhatsAppGlyph />
        Solicitar compra
      </WhatsAppContactLink>
    </div>
  );
}
