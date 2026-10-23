import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { StatusTag } from "@/components/ui/tag";
import { listingEditHref, listingTips, type ListingStatisticsRow } from "@/lib/account-analytics";
import { countLabel, listingRowHref } from "@/components/statistics/listing-ranking";

// Published listings first; the RPC order (most viewed first) stays within each group.
export function sortPublishedFirst(listings: ListingStatisticsRow[]) {
  return [...listings].sort((a, b) => Number(b.status === "approved") - Number(a.status === "approved"));
}

// Each listing with its period numbers and up to two next steps, each a link to its edit page.
export function ListingTipsList({ listings, days }: { listings: ListingStatisticsRow[]; days: number }) {
  return (
    <ul className="space-y-3" aria-label="Publicaciones del periodo">
      {sortPublishedFirst(listings).map((listing) => {
        const tips = listingTips(listing);
        const href = listingRowHref(listing);
        return (
          <li key={listing.id} className="rounded-panel border border-subtle bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="min-w-0 t-card-title text-ink">{href ? <Link href={href} className="link">{listing.title}</Link> : listing.title}</h3>
              <StatusTag domain="listing" status={listing.status} />
            </div>
            <p className="mt-2 t-meta text-ink-2">
              <span className="sr-only">{`Últimos ${days} días: `}</span>
              {[countLabel(listing.views, ["vista", "vistas"]), `${countLabel(listing.contacts, ["contacto", "contactos"])} por WhatsApp`, countLabel(listing.saves, ["guardado", "guardados"])].join(" · ")}
            </p>
            {tips.length ? (
              <ul className="mt-3 space-y-2" aria-label="Sugerencias">
                {tips.map((tip) => (
                  <li key={tip} className="flex items-start gap-2 t-ui text-ink">
                    <Lightbulb aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" />
                    <Link href={listingEditHref(listing.id)} className="link">{tip}</Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
