import { ShieldCheck } from "lucide-react";
import type { SafeSpotMark as SafeSpot } from "@/lib/deal-trust";
import { cn } from "@/lib/utils";

// «Punto seguro Laria» (safe-03) on a store's page and its seller card: the store offered its premises as a place where
// buyers and sellers can meet. A native disclosure says what it means and what it doesn't; it never promises safety.
export function SafeSpotMark({ spot, className }: { spot: SafeSpot; className?: string }) {
  return (
    <details className={cn("group w-fit max-w-full", className)}>
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 rounded-control [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1.5 rounded-control border border-line-strong px-2 py-1 t-ui font-semibold text-ink">
          <ShieldCheck aria-hidden className="h-4 w-4 shrink-0" />
          Punto seguro Laria
        </span>
        <span className="t-meta underline decoration-line-deco underline-offset-[3px]">¿Qué es?</span>
      </summary>
      <div className="mt-2 grid max-w-[60ch] gap-2 rounded-control bg-canvas p-3 t-meta text-ink">
        <p>
          Esta tienda verificada acepta que compradores y vendedores de Laria se vean en su local, durante su horario, para
          revisar un instrumento.
        </p>
        {spot.note ? <p><span className="font-semibold">La tienda dice:</span> {spot.note}</p> : null}
        <p>La tienda no revisa el instrumento, no recibe pagos y no participa en el trato. Laria no puede garantizar cómo resulta un encuentro.</p>
      </div>
    </details>
  );
}
