import Link from "next/link";
import type { ReactNode } from "react";
import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { TRUST_COPY } from "@/components/listing/trust-note";
import { buttonClasses } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { VerifiedMark } from "@/components/ui/verified-mark";
import { formatRating, reviewCountLabel } from "@/lib/listing-page";
import { initials } from "@/lib/ui/initials";
import { cn } from "@/lib/utils";

export type SellerKind = "particular" | "store" | "verified";

export type SellerSummary = {
  name: string;
  kind: SellerKind;
  place: string | null;
  logoUrl?: string | null;
  storeHref?: string | null;
  // From the verified-transaction reputation; null when there are no visible reviews or the call failed.
  rating: { average: number; count: number } | null;
  // "En Laria desde jul. 2026", or null when the date is unknown.
  since: string | null;
};

export function sellerKindLabel(kind: SellerKind) {
  return kind === "particular" ? "Particular" : kind === "store" ? "Tienda" : "Tienda verificada";
}

export function SellerKindMark({ kind }: { kind: SellerKind }) {
  return kind === "verified" ? <VerifiedMark /> : <Tag>{sellerKindLabel(kind)}</Tag>;
}

// "4.8 de 5 · 9 reseñas": the figure carries words, not only a star.
export function RatingFigure({ rating }: { rating: { average: number; count: number } }) {
  return (
    <span>
      <span aria-hidden="true">{formatRating(rating.average)} ★</span>
      <span className="sr-only">{formatRating(rating.average)} de 5</span> · {reviewCountLabel(rating.count)}
    </span>
  );
}

// The seller card (UX-4 L10 A, L20 A): who sells, with real figures only. No contact button (the page has one). A
// figure without a value, or whose query failed, is left out. A store links to its page; a Particular has none.
export function SellerCard({
  seller,
  listingCount,
  sold = false,
  className,
}: {
  seller: SellerSummary;
  // The seller's active publications, streamed (null renders nothing).
  listingCount: ReactNode;
  sold?: boolean;
  className?: string;
}) {
  return (
    <section id="vendedor" aria-labelledby="vendedor-titulo" className={cn("scroll-mt-4 rounded-panel border border-subtle bg-surface p-4 sm:p-5", className)}>
      <div className="flex items-start gap-3">
        <SellerAvatar seller={seller} />
        <div className="min-w-0 flex-1">
          <h2 id="vendedor-titulo" className="break-words text-[16px] font-semibold leading-6 text-ink">
            <span className="sr-only">Vendido por </span>
            {seller.name}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <SellerKindMark kind={seller.kind} />
            {seller.place ? <span className="t-meta">{seller.place}</span> : null}
          </div>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 t-meta text-ink [&>li+li]:before:mr-3 [&>li+li]:before:text-ink-3 [&>li+li]:before:content-['·']">
        {seller.rating ? <li><RatingFigure rating={seller.rating} /></li> : null}
        {listingCount}
        {seller.since ? <li>En Laria desde {seller.since}</li> : null}
      </ul>
      {seller.storeHref ? (
        <Link href={seller.storeHref} className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-4" })}>
          Ver la tienda
        </Link>
      ) : null}
      {sold ? <p className="mt-4 rounded-control bg-canvas p-3 t-meta">{TRUST_COPY.sold}</p> : null}
    </section>
  );
}

// A 40 px square: the store's logo, white initials on frame-2 for a store without one, or the Particular's initials on
// canvas. Decorative: the name follows.
export function SellerAvatar({ seller, size = 40 }: { seller: Pick<SellerSummary, "name" | "kind" | "logoUrl">; size?: 40 | 64 | 96 }) {
  const box = size === 96 ? "h-16 w-16 text-[22px] md:h-24 md:w-24 md:text-[30px]" : size === 64 ? "h-16 w-16 text-[22px]" : "h-10 w-10 text-[13px]";
  if (seller.kind !== "particular" && seller.logoUrl) {
    return <Image src={seller.logoUrl} alt="" width={size} height={size} sizes={size === 96 ? "(max-width: 767px) 64px, 96px" : `${size}px`} className={cn("shrink-0 rounded-panel border border-subtle object-cover", box)} />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-panel font-bold",
        box,
        seller.kind === "particular" ? "bg-canvas text-ink" : "bg-frame-2 text-white",
      )}
    >
      {initials(seller.name)}
    </span>
  );
}
