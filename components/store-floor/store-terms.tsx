import { RefreshCcw, ShieldCheck } from "lucide-react";
import { returnsLine, warrantyLine, type StoreTerms } from "@/lib/store-floor/warranty";
import { cn } from "@/lib/utils";

// reach-09: the store's warranty and returns on its listing, side by side, said as the store's promise. Nothing renders
// when the store said nothing.
export function StoreTermsLine({ terms, storeName, className }: { terms: Partial<StoreTerms>; storeName: string | null; className?: string }) {
  const warranty = warrantyLine(terms);
  const returns = returnsLine(terms);
  if (!warranty && !returns) return null;
  return (
    <section aria-label="Garantía y cambios" className={cn("grid gap-1.5 rounded-panel border border-subtle p-3", className)}>
      {warranty ? (
        <p className="flex items-start gap-2 t-ui font-semibold text-ink">
          <ShieldCheck aria-hidden className="mt-0.5 h-[18px] w-[18px] shrink-0" />
          {warranty}
        </p>
      ) : null}
      {returns ? (
        <p className="flex items-start gap-2 t-ui text-ink">
          <RefreshCcw aria-hidden className="mt-0.5 h-[18px] w-[18px] shrink-0" />
          {returns}
        </p>
      ) : null}
      <p className="t-meta">Lo ofrece {storeName ?? "la tienda"}, no Laria. Confirma las condiciones y pide tu boleta al comprar.</p>
    </section>
  );
}
