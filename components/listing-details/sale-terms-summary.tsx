import { ArrowLeftRight, Hand, MapPin, Package, Truck } from "lucide-react";
import { getCategoryLabel } from "@/lib/listings";
import { saleTermLines, type ListingSaleTerms, type SaleTermLine } from "@/lib/sale-terms";
import { cn } from "@/lib/utils";

// buy-02 "Cómo se entrega" and sell-06 "Acepta cambios" on the listing page: the seller's own terms, one line each,
// with whose word it is. Nothing when the seller said nothing.
const ICONS: Record<SaleTermLine["key"], typeof Truck> = { pickup: MapPin, try: Hand, lima: Truck, provinces: Package, trades: ArrowLeftRight };

export function SaleTermsSummary({ terms, className }: { terms: ListingSaleTerms; className?: string }) {
  const lines = saleTermLines(terms, getCategoryLabel);
  if (!lines.length) return null;
  const trades = lines.some((line) => line.key === "trades");
  const delivery = lines.some((line) => line.key !== "trades");
  return (
    <section aria-labelledby="como-se-entrega" className={cn("grid gap-2", className)}>
      <h2 id="como-se-entrega" className="t-ui font-semibold text-ink">{delivery ? (trades ? "Entrega y cambios" : "Cómo se entrega") : "Cambios"}</h2>
      <ul className="grid gap-2">
        {lines.map((line) => {
          const Icon = ICONS[line.key];
          return (
            <li key={line.key} className="flex items-start gap-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink" aria-hidden />
              <span className="min-w-0">
                <span className="block t-ui font-semibold text-ink">{line.title}</span>
                {line.detail ? <span className="block break-words t-meta">{line.detail}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="t-meta">Lo indica quien vende. Laria no gestiona envíos, pagos ni cambios.</p>
    </section>
  );
}
