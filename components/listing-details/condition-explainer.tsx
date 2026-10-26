"use client";

import { Check, Info } from "lucide-react";
import { useId, useState } from "react";
import { CONDITION_VALUES, PARTICULAR_CONDITION_VALUES, conditionDefinition, currentCondition } from "@/lib/listing-condition";
import { cn } from "@/lib/utils";

// sell-10: the listing's condition as a tag a buyer can tap to read what it means, with the whole scale beside it so
// "Muy bueno" reads as a place on a scale. The step is marked by a check and bold text, never by color alone. Place it
// in a wrapping flex row: the panel takes a full line below the tag.
export function ConditionExplainer({ condition, className }: { condition: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const current = currentCondition(condition);
  const definition = conditionDefinition(current);
  if (!definition) return <span className={cn("inline-flex h-6 items-center rounded-tag bg-subtle px-2 t-meta font-semibold text-ink", className)}>{current}</span>;
  const scale = current === "Exhibición o caja abierta" ? CONDITION_VALUES : PARTICULAR_CONDITION_VALUES;
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-6 items-center gap-1 rounded-tag bg-subtle px-2 t-meta font-semibold text-ink hover:bg-canvas"
      >
        {current}
        <Info className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">: qué significa</span>
      </button>
      <div id={panelId} hidden={!open} className={cn("w-full basis-full rounded-panel bg-canvas p-3", className)}>
        <p className="t-ui text-ink"><strong>{current}:</strong> {definition}</p>
        <p className="mt-2 t-meta">Escala de Laria, de mejor a peor:</p>
        <ol className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 t-meta">
          {scale.map((step) => (
            <li key={step} className={cn("inline-flex items-center gap-0.5", step === current && "font-semibold text-ink")} aria-current={step === current ? "true" : undefined}>
              {step === current ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
              {step}
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
