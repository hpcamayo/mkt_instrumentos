import Link from "next/link";
import { History } from "lucide-react";
import { SellerLevelMark } from "@/components/trust/seller-level-mark";
import { SafeSpotMark } from "@/components/trust/safe-spot-mark";
import { buttonClasses } from "@/components/ui/button";
import { monthYearLong, provenanceSummary } from "@/lib/deal-trust";
import { getSpecTable } from "@/lib/listing-specs";
import { getListingTrust, getStoreTrust } from "@/lib/listing-trust";
import { cn } from "@/lib/utils";

// The deal-trust parts of the listing page, each streamed on its own (the page wraps them in Suspense with no fallback)
// from one get_listing_trust read. Nothing shows when the read fails or is slow: these add trust, they never hold the
// page.

// In the seller card: «Vendedor destacado» or «Tienda destacada» (sell-08), a store's «Punto seguro Laria» (safe-03)
// and, for a Particular, "Ver perfil" (sell-09).
export async function SellerTrust({ listingId }: { listingId: string }) {
  const trust = await getListingTrust(listingId);
  if (!trust || (!trust.level && !trust.sellerPageSlug && !trust.safeSpot)) return null;
  return (
    <div className="mt-3 grid gap-2">
      {trust.level ? <SellerLevelMark level={trust.level} /> : null}
      {trust.safeSpot ? <SafeSpotMark spot={trust.safeSpot} /> : null}
      {trust.sellerPageSlug ? (
        <Link href={`/vendedores/${trust.sellerPageSlug}`} className={buttonClasses({ variant: "secondary", size: "sm", className: "w-fit" })}>
          Ver perfil
        </Link>
      ) : null}
    </div>
  );
}

// «Historial en Laria» (safe-11): when the person who bought this instrument in Laria linked it to their purchase. It
// says when it was bought here, how many owners it had in Laria and how it was first described, never who sold it.
export async function ListingProvenance({ listingId, className }: { listingId: string; className?: string }) {
  const trust = await getListingTrust(listingId);
  const provenance = trust?.provenance;
  if (!provenance) return null;
  const original = provenance.original;
  const specs = original.category
    ? getSpecTable({
        category: original.category,
        instrument_type: original.instrumentType,
        attributes: original.attributes,
        brand: original.brand,
        model: original.model,
        condition: original.condition,
      } as Parameters<typeof getSpecTable>[0])
    : [];
  const firstPublished = monthYearLong(original.publishedAt);
  return (
    <section aria-labelledby="historial-laria" className={cn("rounded-panel border border-subtle p-4 sm:p-5", className)}>
      <h2 id="historial-laria" className="flex items-center gap-2 t-section text-ink">
        <History aria-hidden className="h-5 w-5 shrink-0" />
        Historial en Laria
      </h2>
      <p className="mt-2 t-body text-ink">{provenanceSummary(provenance)}.</p>
      {specs.length > 0 ? (
        <details className="mt-2">
          <summary className="flex min-h-11 cursor-pointer items-center t-ui font-semibold text-ink">
            Cómo se describió {firstPublished ? `en ${firstPublished}` : "la primera vez"}
          </summary>
          <dl className="mt-1 grid t-ui sm:grid-cols-2 sm:gap-x-6">
            {specs.map((spec) => (
              <div key={spec.label} className="flex min-h-11 items-center justify-between gap-4 border-b border-line-deco py-2">
                <dt className="text-ink-2">{spec.label}</dt>
                <dd className="min-w-0 break-words text-right font-semibold text-ink">{spec.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
      <p className="mt-2 t-meta">
        Quien lo compró en Laria eligió mostrar este historial. Viene de compras que ambas partes confirmaron; Laria no
        revisa el instrumento ni su estado actual.
      </p>
    </section>
  );
}

// On a store's page, under its address: «Tienda destacada» (sell-08) and «Punto seguro Laria» (safe-03).
export async function StoreTrustMarks({ storeId }: { storeId: string }) {
  const trust = await getStoreTrust(storeId);
  if (!trust || (!trust.level && !trust.safeSpot)) return null;
  return (
    <div className="mt-2 flex flex-wrap items-start gap-x-4 gap-y-1">
      {trust.level ? <SellerLevelMark level={trust.level} /> : null}
      {trust.safeSpot ? <SafeSpotMark spot={trust.safeSpot} /> : null}
    </div>
  );
}
