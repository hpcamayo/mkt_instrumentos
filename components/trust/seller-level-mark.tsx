import { Award, ChevronDown } from "lucide-react";
import { LEVEL_CRITERIA, levelName, monthYearLong, type SellerLevel } from "@/lib/deal-trust";
import { cn } from "@/lib/utils";

// «Vendedor destacado» / «Tienda destacada» (sell-08): an automatic mark that explains itself. Pressing it opens "¿Por
// qué?": the public criteria, that it is checked every night and lapses by itself, and what it doesn't mean. A native
// <details>, like "Tienda verificada", so it works before scripts load. Shown on the seller page, the store page and
// next to the seller on publications.
export function SellerLevelMark({ level, className }: { level: SellerLevel | null; className?: string }) {
  if (!level) return null;
  const name = levelName(level.kind);
  const since = monthYearLong(level.since);
  return (
    <details className={cn("group w-full", className)}>
      <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1.5 rounded-control t-ui font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <Award aria-hidden="true" className="h-4 w-4 shrink-0" />
        {name}
        <span className="t-meta font-semibold underline decoration-accent decoration-2 underline-offset-[3px]">¿Por qué?</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2 rounded-control bg-canvas p-3 t-meta text-ink">
        <p className="font-semibold">Laria da esta marca sola{since ? ` (la tiene desde ${since})` : ""} a quien cumple todo esto:</p>
        <ul className="mt-1 grid list-disc gap-1 pl-4">
          {LEVEL_CRITERIA.map((criterion) => <li key={criterion}>{criterion}</li>)}
        </ul>
        <p className="mt-2 text-ink-2">
          Se revisa cada noche y se quita sola si deja de cumplir algo. Nadie puede pagarla ni pedirla. Cuenta lo que pasó en
          Laria; no revisa instrumentos ni pagos, y no garantiza una compra.
        </p>
      </div>
    </details>
  );
}
