import Link from "next/link";
import type { ReactNode } from "react";
import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { TRUST_COPY } from "@/components/listing/trust-note";
import { StoreVisitLines } from "@/components/store/store-visit";
import { buttonClasses } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { VerifiedMark } from "@/components/ui/verified-mark";
import { VerifiedExplainer } from "@/components/listing/verified-explainer";
import { FEW_REVIEWS, formatRating, isNewMember, lastActiveLabel, reviewCountLabel, verifiedSalesLabel, type SellerFacts } from "@/lib/listing-page";
import type { PublicStoreLocation } from "@/lib/store-storefront";
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
  // list-10: the other verified facts (get_public_seller_facts); null when the call failed.
  facts?: SellerFacts | null;
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
// Effortless Laria (list-10, trust-03): facts that predict a good deal, all recorded by Laria: when the seller was last
// active (coarse), sales both sides confirmed in Laria, "Nuevo en Laria" said plainly, and a confirmed e-mail. Until a
// seller has about ten reviews those facts lead and the rating follows. A verified store's badge opens what Laria
// checked. Phone checks and reply times are not recorded, so they are not claimed.
export function SellerCard({
  seller,
  listingCount,
  visit,
  sold = false,
  now = Date.now(),
  trust,
  className,
}: {
  seller: SellerSummary;
  // deal-trust: the seller level, «Punto seguro Laria» and a Particular's "Ver perfil" (components/trust/listing-trust).
  trust?: ReactNode;
  // list-12: a store's shown address with "Cómo llegar" and its opening hours (publicStoreLocation).
  visit?: PublicStoreLocation;
  // The seller's active publications, streamed (null renders nothing).
  listingCount: ReactNode;
  sold?: boolean;
  now?: number;
  className?: string;
}) {
  const facts = seller.facts ?? null;
  const fewReviews = !seller.rating || seller.rating.count < FEW_REVIEWS;
  const active = lastActiveLabel(facts?.lastActive);
  const newMember = isNewMember(facts?.memberSince, now);
  const verified: ReactNode[] = [
    active ? <li key="active">{active}</li> : null,
    facts && facts.verifiedSales > 0 ? <li key="sales">{verifiedSalesLabel(facts.verifiedSales)}</li> : null,
    newMember ? <li key="new">Nuevo en Laria</li> : seller.since ? <li key="since">En Laria desde {seller.since}</li> : null,
    facts?.emailConfirmed && seller.kind === "particular" ? <li key="email">Correo confirmado</li> : null,
  ].filter(Boolean);
  const rating = seller.rating ? <li key="rating"><RatingFigure rating={seller.rating} /></li> : null;
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
            {seller.kind === "verified" ? null : <SellerKindMark kind={seller.kind} />}
            {seller.place ? <span className="t-meta">{seller.place}</span> : null}
          </div>
        </div>
      </div>
      {seller.kind === "verified" ? <VerifiedExplainer checks={facts?.store ?? null} className="mt-3" /> : null}
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 t-meta text-ink [&>li+li]:before:mr-3 [&>li+li]:before:text-ink-3 [&>li+li]:before:content-['·']">
        {fewReviews ? <>{verified}{rating}</> : <>{rating}{verified}</>}
        {listingCount}
      </ul>
      {trust}
      {visit ? <StoreVisitLines location={visit} className="mt-3" /> : null}
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
