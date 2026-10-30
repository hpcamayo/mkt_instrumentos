"use client";

import { HandCoins } from "lucide-react";
import { useRef, useState } from "react";
import { WhatsAppContactLink } from "@/components/whatsapp-contact-link";
import { buttonClasses } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { PriceInput } from "@/components/ui/price-input";
import { Sheet } from "@/components/ui/sheet";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { offerContactMessage, offerSuggestions, withMessage } from "@/lib/contact-message";
import { formatPrice, formatPriceDigits, parseWholeSolPrice } from "@/lib/price";

type OfferListing = { title: string; slug: string; price_pen: number };

// An offer far under the price rarely gets an answer; the sheet says so, and still lets the visitor send it.
const LOW_OFFER_SHARE = 0.6;

// talk-07 "Hacer una oferta" (docs/ux-effortless/maybes-reservado.md): on a Particular's published listing, a small sheet
// to name an amount in soles, with three round amounts under the price and the message as it will read. "Enviar oferta
// por WhatsApp" opens WhatsApp the way the main button does (the seller's number from the page's own link, the safety
// sheet once before something expensive) and is recorded as the same contact. The amount stays in the visitor's
// message: no event, request or log carries it. The sheet stays open, so the visitor can come back from WhatsApp and
// change the amount.
export function OfferButton({ listingId, href, listing, safety, className }: { listingId: string; href: string; listing: OfferListing; safety: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={opener} type="button" className={buttonClasses({ variant: "secondary", className })} onClick={() => setOpen(true)}>
        <HandCoins aria-hidden />Hacer una oferta
      </button>
      {open ? (
        <OfferSheet
          listingId={listingId}
          href={href}
          listing={listing}
          safety={safety}
          onDismiss={() => {
            setOpen(false);
            requestAnimationFrame(() => opener.current?.focus());
          }}
        />
      ) : null}
    </>
  );
}

function OfferSheet({ listingId, href, listing, safety, onDismiss }: { listingId: string; href: string; listing: OfferListing; safety: boolean; onDismiss: () => void }) {
  const [amountText, setAmountText] = useState("");
  const amount = parseWholeSolPrice(amountText);
  const suggestions = offerSuggestions(listing.price_pen);
  const message = amount === null ? null : offerContactMessage(listing, amount);
  const send = (
    <>
      <WhatsAppGlyph />
      Enviar oferta por WhatsApp
    </>
  );
  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="button" className={buttonClasses({ variant: "secondary" })} onClick={onDismiss}>Cerrar</button>
      {message ? (
        <WhatsAppContactLink href={withMessage(href, message)} listingId={listingId} safety={safety} addQuestions={false} className={buttonClasses()}>
          {send}
        </WhatsAppContactLink>
      ) : (
        <button type="button" disabled className={buttonClasses()}>{send}</button>
      )}
    </div>
  );

  return (
    <Sheet title="Hacer una oferta" closeLabel="Cerrar" onDismiss={onDismiss} layout="responsive" footer={footer}>
      <p className="mt-3 t-ui text-ink-2">
        Precio publicado: <span className="font-semibold tabular-nums text-ink">{formatPrice(listing.price_pen)}</span>
      </p>
      <Field id={`oferta-${listingId}`} label="Tu oferta" className="mt-4">
        <PriceInput value={amountText} onValueChange={setAmountText} />
      </Field>
      {suggestions.length ? (
        <div className="mt-3 grid gap-2">
          <p id={`oferta-montos-${listingId}`} className="t-meta">O elige un monto</p>
          <div role="group" aria-labelledby={`oferta-montos-${listingId}`} className="flex flex-wrap gap-2">
            {suggestions.map((value) => (
              <Chip key={value} selected={amount === value} onClick={() => setAmountText(formatPriceDigits(String(value)))}>
                {formatPrice(value)}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
      {amount !== null && amount >= listing.price_pen ? (
        <p className="mt-3 t-meta">Es el precio publicado o más: también puedes escribir sin oferta.</p>
      ) : amount !== null && amount < listing.price_pen * LOW_OFFER_SHARE ? (
        <p className="mt-3 t-meta">Una oferta muy por debajo del precio suele quedarse sin respuesta.</p>
      ) : null}
      <div className="mt-4 rounded-panel bg-canvas p-3">
        <p className="t-meta font-semibold text-ink">Tu mensaje</p>
        <p className="mt-1 break-words t-ui text-ink">{message ?? "Escribe un monto para ver tu mensaje."}</p>
      </div>
      <p className="mt-3 t-meta">Se abre WhatsApp con este mensaje para que lo envíes. Laria no guarda el monto.</p>
    </Sheet>
  );
}
