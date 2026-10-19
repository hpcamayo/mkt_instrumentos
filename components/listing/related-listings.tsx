import Link from "next/link";
import { ListingCard } from "@/components/listing-card";
import { ScrollRow } from "@/components/listing/scroll-row";
import { Skeleton } from "@/components/ui/skeleton";
import type { ListingCardData } from "@/lib/listings";

// The related grids (UX-4 L12 A): the catalog card in two columns on phones, three from 768 px and four from 1024 px,
// gaps 12 / 20 px. Four cards at most.
export const RELATED_GRID = "grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 md:gap-x-5 md:gap-y-8 lg:grid-cols-4";
export const RELATED_ROW_MAX = 8;
export const RELATED_SIZES = "(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 320px";

// "Publicaciones similares" and "Más de esta tienda / este vendedor": the title, a link at the right, four cards. A
// section without listings is left out, unless the page links to it (a sold listing's "Ver publicaciones similares",
// fix-09): then it stays as a short line pointing at the catalog, so the link never lands on nothing.
export function RelatedListings({
  id,
  title,
  link,
  listings,
  emptyText,
  layout = "grid",
}: {
  id: string;
  title: string;
  link: { href: string; label: string } | null;
  listings: ListingCardData[];
  emptyText?: string;
  // "row" (list-07, "Publicaciones similares"): up to eight cards in a sideways row.
  layout?: "grid" | "row";
}) {
  if (listings.length === 0) {
    if (!emptyText || !link) return null;
    return (
      <section id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-4">
        <h2 id={`${id}-titulo`} className="t-section text-ink">{title}</h2>
        <p className="mt-2 t-ui text-ink-2">
          {emptyText}{" "}
          <Link href={link.href} className="link font-semibold">Explorar el catálogo</Link>
        </p>
      </section>
    );
  }
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={`${id}-titulo`} className="t-section text-ink">{title}</h2>
        {link ? (
          <Link href={link.href} className="link -my-3 inline-flex min-h-11 shrink-0 items-center t-ui font-semibold md:min-h-0">
            {link.label}
          </Link>
        ) : null}
      </div>
      {layout === "row" ? (
        <div className="mt-4">
          <ScrollRow label={title}>
            {listings.slice(0, RELATED_ROW_MAX).map((item) => (
              <div key={item.id} role="listitem" className="w-[44%] shrink-0 snap-start md:w-[calc((100%-40px)/3)] lg:w-[calc((100%-60px)/4)]">
                <ListingCard listing={item} source="recommendations" headingLevel={3} sizes={RELATED_SIZES} />
              </div>
            ))}
          </ScrollRow>
        </div>
      ) : (
        <div className={`mt-4 ${RELATED_GRID}`}>
          {listings.slice(0, 4).map((item) => (
            <ListingCard key={item.id} listing={item} source="recommendations" headingLevel={3} sizes={RELATED_SIZES} />
          ))}
        </div>
      )}
    </section>
  );
}

// While a related section streams, skeleton cards hold its place (P3), so nothing shifts.
export function RelatedListingsSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="h-[26px] w-56" />
      <div className={`mt-4 ${RELATED_GRID}`}>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className={index === 3 ? "hidden lg:block" : index === 2 ? "hidden md:block" : undefined}>
            <Skeleton className="aspect-square w-full rounded-panel" />
            <Skeleton className="mt-2 h-4 w-4/5" />
            <Skeleton className="mt-2 h-5 w-2/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
