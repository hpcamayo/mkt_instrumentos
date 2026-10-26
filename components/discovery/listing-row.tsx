import Link from "next/link";
import { ListingCard } from "@/components/listing-card";
import { formatNumber } from "@/lib/catalog-filters";
import type { ListingCardData } from "@/lib/listings";
import { LISTING_GRID_SIZES } from "@/lib/ui/listing-grid";

// The discovery pages' rows (docs/feature-ideas/discovery.md): a heading, up to four cards and "Ver todo" to the
// catalog with the same filters. Two columns on phones, four from 1024 px. No feed: the row ends, the link continues.
export const DISCOVERY_ROW_GRID = "grid grid-cols-2 gap-x-3 gap-y-6 md:gap-x-5 lg:grid-cols-4";

export function DiscoveryListingRow({
  id,
  title,
  listings,
  total,
  href,
  empty,
}: {
  id: string;
  title: string;
  // null: the read failed (the row says so instead of looking empty).
  listings: ListingCardData[] | null;
  total?: number | null;
  href?: string;
  empty?: string;
}) {
  return (
    <section aria-labelledby={id} className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id={id} className="t-section text-ink">{title}</h2>
        {href && listings?.length ? (
          <Link href={href} className="link shrink-0 t-ui font-semibold">
            {typeof total === "number" && total > listings.length ? `Ver las ${formatNumber(total)}` : "Ver en el catálogo"}
          </Link>
        ) : null}
      </div>
      {listings === null ? (
        <p className="t-ui text-ink-2">No pudimos cargar estas publicaciones. Vuelve a intentarlo en unos minutos.</p>
      ) : listings.length ? (
        <ul className={DISCOVERY_ROW_GRID}>
          {listings.map((listing) => (
            <li key={listing.id} className="min-w-0">
              <ListingCard listing={listing} headingLevel={3} sizes={LISTING_GRID_SIZES} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-ui text-ink-2">
          {empty ?? "Por ahora no hay publicaciones aquí."}{" "}
          {href ? <Link href={href} className="link font-semibold">Ver en el catálogo</Link> : null}
        </p>
      )}
    </section>
  );
}
