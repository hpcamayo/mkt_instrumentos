import Link from "next/link";
import { Sparkles } from "lucide-react";
import { AppliedChip } from "@/components/ui/chip";
import { STORE_GAP_TEXT, type Understood } from "@/lib/ai/store-question";
import { cn } from "@/lib/utils";

// stock-24: what a question to "Pregúntale a tu tienda" became, on the page it opened. Each filter is a chip that
// removes it; what the question asked that no filter covers is said plainly, next to the closest filters it used.
export function UnderstoodPanel({ understood, className }: { understood: Understood; className?: string }) {
  const { summary, chips, gaps, closeHref, sectionHref, sectionLabel } = understood;
  return (
    <section aria-labelledby="asi-lo-entendi" className={cn("grid gap-3 bg-accent-tint p-4 md:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <h2 id="asi-lo-entendi" className="flex items-start gap-1.5 t-ui font-semibold text-ink">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Así lo entendí{summary ? `: ${summary}.` : ":"}</span>
        </h2>
        <Link href={closeHref} scroll={false} className="link shrink-0 t-meta font-semibold">Cerrar</Link>
      </div>
      {chips.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Filtros que usé">
          {chips.map((chip) => <li key={chip.label} className="max-w-full"><AppliedChip href={chip.href} text={chip.text} label={chip.label} /></li>)}
        </ul>
      ) : null}
      {gaps.length ? (
        <p className="t-meta text-ink">{gaps.map((gap) => STORE_GAP_TEXT[gap]).join(" ")} Te muestro lo más cercano.</p>
      ) : null}
      {sectionHref ? <a href={sectionHref} className="link w-fit t-meta font-semibold">{sectionLabel}</a> : null}
    </section>
  );
}
