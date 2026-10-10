import Link from "next/link";
import { ListingCard } from "@/components/listing-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ListingCardData } from "@/lib/listings";

// The related grids (UX-4 L12 A): the catalog card in two columns on phones, three from 768 px and four from 1024 px,
// gaps 12 / 20 px. Four cards at most.
export const RELATED_GRID = "grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 md:gap-x-5 md:gap-y-8 lg:grid-cols-4";
export const RELATED_SIZES = "(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 320px";

// "Publicaciones similares" and "Más de esta tienda / este vendedor": the title, a link at the right, four cards. A
// section without listings is left out.
export function RelatedListings({
  id,
  title,
  link,
  listings,
}: {
  id: string;
  title: string;
  link: { href: string; label: string } | null;
  listings: ListingCardData[];
}) {
  if (listings.length === 0) return null;
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
      <div className={`mt-4 ${RELATED_GRID}`}>
        {listings.slice(0, 4).map((item) => (
          <ListingCard key={item.id} listing={item} source="recommendations" headingLevel={3} sizes={RELATED_SIZES} />
        ))}
      </div>
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
