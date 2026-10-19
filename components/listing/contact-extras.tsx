"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";
import { toggleQuestion, useQuestions } from "@/components/listing/contact-state";
import { SafetySheet } from "@/components/listing/safety-sheet";
import { Chip } from "@/components/ui/chip";
import type { QuickQuestion } from "@/lib/contact-message";
import { cn } from "@/lib/utils";

// "Laria no procesa pagos · Cómo comprar seguro" (list-02): the one limitation line beside the contact button, on every
// width. The full statement and the safety tips open in a sheet instead of repeating under every section.
export function SafetyLine({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <p className={cn("t-meta", className)}>
      Laria no procesa pagos ni envíos ·{" "}
      <button ref={opener} type="button" className="link inline min-h-6 font-semibold" onClick={() => setOpen(true)}>
        Cómo comprar seguro
      </button>
      {open ? <SafetySheet onDismiss={() => { setOpen(false); opener.current?.focus(); }} /> : null}
    </p>
  );
}

// Optional first questions (talk-02): each chip adds its question to the WhatsApp message; pressing the button alone
// still works. Nothing is preselected.
export function QuickQuestions({ listingId, questions, className }: { listingId: string; questions: QuickQuestion[]; className?: string }) {
  const selected = useQuestions(listingId);
  return (
    <div className={cn("grid gap-2", className)}>
      <p id={`preguntas-rapidas-${listingId}`} className="t-meta">Agrega preguntas a tu mensaje (opcional)</p>
      <div role="group" aria-labelledby={`preguntas-rapidas-${listingId}`} className="flex flex-wrap gap-2">
        {questions.map((question) => (
          <Chip key={question.id} selected={selected.includes(question.text)} onClick={() => toggleQuestion(listingId, question.text)}>
            {question.text}
          </Chip>
        ))}
      </div>
    </div>
  );
}

// "Ingresa antes de escribir" (talk-05): one quiet line for visitors, never blocking. Contacting while signed in is what
// later lets them confirm the purchase and review the seller.
export function SignInHint({ className }: { className?: string }) {
  const account = useMarketplaceAccount();
  const pathname = usePathname();
  if (!account.ready || account.authenticated) return null;
  return (
    <p className={cn("t-meta", className)}>
      <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="link font-semibold">Ingresa antes de escribir</Link>
      {" "}para luego confirmar la compra y dejar una reseña.
    </p>
  );
}
