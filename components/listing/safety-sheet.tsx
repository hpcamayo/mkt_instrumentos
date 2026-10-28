"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { TRUST_COPY } from "@/components/listing/trust-note";
import { buttonClasses } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";

// "Cómo comprar seguro" (list-02, talk-04): the safety advice where it is read, at the moment of contact, instead of
// repeated footnotes. Opened from the one line beside the contact button, and once (per browser) before the first
// contact about something expensive or a purchase request. With `continueHref` it ends in "Continuar a WhatsApp", a
// plain link, so the contact still opens straight away. Descubrir (big-02) has no link yet when the sheet opens: with
// `onContinue` alone the same button calls it, inside the press, and Descubrir opens WhatsApp from there.
// Copy pending the legal review (list-02).
export const SAFETY_TIPS = [
  "Prueba el equipo antes de pagar: en la tienda o en un lugar público y concurrido.",
  "No pagues por adelantado a alguien que no conoces, aunque el precio parezca una oportunidad.",
  "Si recibes un pago por Yape o Plin, confírmalo en tu propia app: las capturas de pago falsas son una estafa común. En Yape, pide el código de seguridad de 3 dígitos.",
] as const;

export function SafetySheet({
  onDismiss,
  continueHref,
  onContinue,
  continueLabel = "Continuar a WhatsApp",
}: {
  onDismiss: () => void;
  continueHref?: string;
  onContinue?: () => void;
  continueLabel?: string;
}) {
  const footer: ReactNode = continueHref ? (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="button" className={buttonClasses({ variant: "secondary" })} onClick={onDismiss}>Volver</button>
      <a
        href={continueHref}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClasses()}
        onClick={() => {
          onContinue?.();
          onDismiss();
        }}
      >
        <WhatsAppGlyph />
        {continueLabel}
      </a>
    </div>
  ) : onContinue ? (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="button" className={buttonClasses({ variant: "secondary" })} onClick={onDismiss}>Volver</button>
      <button
        type="button"
        className={buttonClasses()}
        onClick={() => {
          onContinue();
          onDismiss();
        }}
      >
        <WhatsAppGlyph />
        {continueLabel}
      </button>
    </div>
  ) : (
    <div className="flex justify-end">
      <button type="button" className={buttonClasses({ variant: "secondary" })} onClick={onDismiss}>Entendido</button>
    </div>
  );

  return (
    <Sheet title="Cómo comprar seguro" closeLabel="Cerrar" onDismiss={onDismiss} layout="responsive" footer={footer}>
      <ul className="mt-3 grid list-disc gap-2 pl-5 t-body text-ink">
        {SAFETY_TIPS.map((tip) => <li key={tip}>{tip}</li>)}
      </ul>
      <p className="mt-4 t-meta">{TRUST_COPY.listing}</p>
      <p className="mt-3 t-meta">
        <Link href="/consejos-de-seguridad" className="link font-semibold">Más consejos de seguridad</Link>
      </p>
    </Sheet>
  );
}
