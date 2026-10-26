import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { dealersForBrand, formatDealerDate, storeDealerBrands, type ActiveDealer } from "@/lib/dealers";
import { getActiveDealers } from "@/lib/dealers-server";

// reach-04 "Distribuidor oficial" (docs/feature-ideas/store-reach.md): the public marks. Each slot wraps its own
// Suspense, so a host page adds one line and never waits for it; the list behind them is shared (lib/dealers-server.ts).
// The copy says what Laria checked (a document) and what it did not (each instrument, the warranty).

export function DealerMark({ dealer }: { dealer: ActiveDealer }) {
  return (
    <details className="group mt-3 rounded-panel border border-subtle bg-surface">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 t-ui font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <BadgeCheck className="h-5 w-5 shrink-0" aria-hidden />
        <span>Distribuidor oficial {dealer.brand}</span>
        <span className="ml-auto t-meta font-normal underline decoration-accent decoration-2 underline-offset-[3px]">Qué revisó Laria</span>
      </summary>
      <div className="space-y-2 border-t border-subtle px-3 py-3 t-meta text-ink-2">
        <p>
          Laria revisó un documento de {dealer.brand} o de su representante en Perú que autoriza a {dealer.storeName} como distribuidor
          {dealer.validUntil ? `, vigente hasta el ${formatDealerDate(dealer.validUntil)}` : ""}.
        </p>
        <p>
          Laria no revisa cada instrumento ni da garantía. La garantía del fabricante la ofrece la tienda con {dealer.brand}: pide a la tienda
          la boleta o factura y las condiciones antes de comprar.
        </p>
      </div>
    </details>
  );
}

async function StoreDealerBrands({ storeId }: { storeId: string }) {
  const brands = storeDealerBrands(await getActiveDealers(), storeId);
  if (!brands.length) return null;
  return (
    <section aria-labelledby="distribuidor-oficial-titulo" className="grid gap-1">
      <h2 id="distribuidor-oficial-titulo" className="t-meta">Distribuidor oficial de</h2>
      <p className="flex items-start gap-2 t-ui font-semibold text-ink">
        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <span>{brands.join(", ")}</span>
      </p>
      <p className="t-meta text-ink-2">Laria revisó la autorización de cada marca; no revisa cada instrumento ni da garantía.</p>
    </section>
  );
}

export function StoreDealerBrandsSlot({ storeId }: { storeId: string }) {
  return (
    <Suspense fallback={null}>
      <StoreDealerBrands storeId={storeId} />
    </Suspense>
  );
}

async function BrandDealers({ brand }: { brand: string }) {
  const dealers = dealersForBrand(await getActiveDealers(), brand);
  if (!dealers.length) return null;
  const name = dealers[0].brand;
  return (
    <aside aria-label={`Distribuidores oficiales de ${name}`} className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 t-ui text-ink">
      <BadgeCheck className="h-5 w-5 shrink-0" aria-hidden />
      <span className="font-semibold">Distribuidores oficiales de {name} en Laria:</span>
      {dealers.map((dealer, index) => (
        <span key={dealer.storeId}>
          <Link href={`/tiendas/${dealer.storeSlug}`} className="link font-semibold">{dealer.storeName}</Link>
          {dealer.storeCity ? <span className="text-ink-2"> ({dealer.storeCity})</span> : null}
          {index < dealers.length - 1 ? "," : ""}
        </span>
      ))}
    </aside>
  );
}

// The catalog filtered by one brand names that brand's official dealers above the results. It does not reorder them.
export function BrandDealersSlot({ brand }: { brand: string | undefined }) {
  if (!brand?.trim()) return null;
  return (
    <Suspense fallback={null}>
      <BrandDealers brand={brand.trim()} />
    </Suspense>
  );
}
