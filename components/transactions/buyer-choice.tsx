"use client";

import { MessageCircle } from "lucide-react";
import type { EligibleBuyer } from "@/lib/transactions";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";

// The eligible buyers as radio cards (mine-09), with the details a seller recognises from their chats: the name,
// the day they wrote and the end of their WhatsApp number. Native radios: one tab stop, arrow keys between cards.
export function BuyerChoice({
  candidates,
  selected,
  onSelect,
  disabled = false,
}: {
  candidates: EligibleBuyer[];
  selected: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="mt-4 grid min-w-0 gap-2" disabled={disabled}>
      <legend className="mb-1.5 t-ui font-semibold text-ink">¿Quién te lo compró?</legend>
      {candidates.map((candidate) => (
        <label
          key={candidate.buyer_user_id}
          className={cn(
            "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-panel border border-line-strong bg-surface p-3 transition-colors duration-120 hover:bg-canvas",
            "has-[:checked]:border-ink has-[:checked]:shadow-[inset_0_0_0_1px_var(--ink)]",
            "has-[:disabled]:cursor-not-allowed",
          )}
        >
          <input
            type="radio"
            name="atribucion-comprador"
            value={candidate.buyer_user_id}
            checked={selected === candidate.buyer_user_id}
            onChange={() => onSelect(candidate.buyer_user_id)}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-ink"
          />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="t-ui font-semibold text-ink">{candidate.display_name || "Cuenta de Laria"}</span>
              {candidate.reported_purchase ? <Tag tone="accent">Dice que te lo compró</Tag> : null}
            </span>
            <span className="mt-0.5 block t-meta">Te escribió el {formatDate(candidate.last_contact_at)}</span>
            {candidate.phone_last3 ? (
              <span className="mt-0.5 flex items-center gap-1 t-meta">
                <MessageCircle aria-hidden className="h-3.5 w-3.5 shrink-0" />
                <span>
                  WhatsApp terminado en <span aria-hidden>···</span>
                  {candidate.phone_last3}
                </span>
              </span>
            ) : null}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

const date = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Lima" });
function formatDate(value: string) {
  return date.format(new Date(value));
}
