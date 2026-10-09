"use client";

import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { ImageOff } from "lucide-react";
import Link from "next/link";
import { FavoriteButton } from "@/components/favorite-button";
import { useListingImpression } from "@/components/marketplace-telemetry";
import type { EventSource } from "@/lib/marketplace-event-payload";
import { getCardSpecLine } from "@/lib/listing-specs";
import { formatPrice } from "@/lib/price";
import { Price } from "@/components/ui/price";
import { VerifiedIcon } from "@/components/ui/verified-mark";
import {
  getCategoryLabel,
  getListingDisplayTitle,
  normalizeStore,
  type ListingCardData,
} from "@/lib/listings";

// Pages that have not adopted the catalog grid (lib/ui/listing-grid.ts) keep today's image sizes: store inventory and
// listing recommendations (UX-4).
const DEFAULT_SIZES = "(max-width: 459px) 100vw, (max-width: 767px) 50vw, (max-width: 1279px) 33vw, 320px";

type ListingCardProps = {
  listing: ListingCardData;
  // "grid": the catalog, the landings and the home feed. "showcase": the home's vitrina tile.
  variant?: "grid" | "showcase";
  source?: EventSource;
  // h2 in the catalog and the landings; h3 under a section heading.
  headingLevel?: 2 | 3;
  // The first row of a grid loads its photos eagerly.
  eager?: boolean;
  sizes?: string;
};

// The one listing card (docs/ux-redesign/ux-3-discovery.md § The one listing card). Grid variant: a square photo,
// then the title, price, a spec line and a seller line. One link, the title, stretched over the whole card, and the
// favourite above it: two tab stops. Showcase variant (the vitrina): a bordered box with the square photo, the ink price
// tag on it (H3) and a caption with the category, a one-line title and the seller line; no favourite, one tab stop.
export function ListingCard({ listing, variant = "grid", source = "catalog", headingLevel = 2, eager = false, sizes = DEFAULT_SIZES }: ListingCardProps) {
  const impressionRef = useListingImpression(listing.id, source);
  const photo = listing.listing_photos[0];
  const photoCount = listing.photo_count ?? listing.listing_photos.length;
  const displayTitle = getListingDisplayTitle(listing);
  const specLine = getCardSpecLine(listing);
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const titleLink = (
    <Link
      href={`/instrumentos/${listing.slug}`}
      className="decoration-accent decoration-2 underline-offset-[3px] after:absolute after:inset-0 group-hover:underline"
    >
      {displayTitle}
    </Link>
  );

  if (variant === "showcase") {
    return (
      <article ref={impressionRef} className="group relative flex min-w-0 flex-col overflow-hidden rounded-panel border border-subtle bg-surface transition-colors duration-120 hover:border-line-strong">
        <div className="relative aspect-square border-b border-subtle bg-canvas">
          <CardPhoto photo={photo} title={listing.title} sizes={sizes} eager={eager} />
          {/* The only price on the tile: ink fill, white text, a 1.5 px white edge (H3). */}
          <span className="absolute left-2 top-2 rounded-tag border-[1.5px] border-white bg-ink px-1.5 py-0.5 text-[14px] font-strong leading-5 tabular-nums text-white [font-stretch:87.5%]">
            {formatPrice(listing.price_pen)}
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 p-3">
          <p className="truncate t-micro text-ink-2">{getCategoryLabel(listing.category)}</p>
          <Heading className="truncate t-card-title text-ink">{titleLink}</Heading>
          <SellerLine listing={listing} stacked />
        </div>
      </article>
    );
  }

  return (
    <article ref={impressionRef} className="group relative flex min-w-0 flex-col">
      <div className="relative aspect-square overflow-hidden rounded-panel border border-subtle bg-canvas transition-colors duration-120 group-hover:border-line-strong">
        <CardPhoto photo={photo} title={listing.title} sizes={sizes} eager={eager} />
        {photoCount > 1 ? (
          <span className="absolute bottom-2 left-2 rounded-tag bg-frame/75 px-1.5 py-0.5 text-[12px] font-semibold leading-4 text-white">
            {photoCount} fotos
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex min-w-0 flex-col gap-1">
        <Heading className="line-clamp-2 min-h-[38px] t-card-title text-ink">{titleLink}</Heading>
        <p>
          <Price value={listing.price_pen} />
        </p>
        {specLine ? <p className="truncate t-meta">{specLine}</p> : null}
        <SellerLine listing={listing} />
      </div>

      <div className="absolute right-1 top-1 z-10">
        <FavoriteButton listingId={listing.id} variant="overlay" />
      </div>
    </article>
  );
}

function CardPhoto({ photo, title, sizes, eager }: { photo: ListingCardData["listing_photos"][number] | undefined; title: string; sizes: string; eager: boolean }) {
  if (!photo) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <ImageOff className="h-8 w-8 text-ink-3" aria-hidden="true" />
        <span className="t-meta font-semibold">Sin foto</span>
      </div>
    );
  }
  return (
    <Image
      width={600}
      height={600}
      sizes={sizes}
      src={photo.image_url}
      alt={photo.alt_text ?? title}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className="h-full w-full object-cover"
    />
  );
}

// The city, which truncates first, then the seller words with the verified mark after them. In the vitrina tiles
// (stacked) the words alone nearly fill the line below 1280 px, so there the city takes its own line above them.
function SellerLine({ listing, stacked = false }: { listing: ListingCardData; stacked?: boolean }) {
  const seller = getSellerLabel(listing);
  return (
    <p className={`flex min-w-0 items-center gap-1 t-meta${stacked ? " max-xl:flex-wrap max-xl:gap-y-0" : ""}`}>
      <span className={`min-w-0 truncate${stacked ? " max-xl:basis-full" : ""}`}>{listing.city}</span>
      <span aria-hidden="true" className={stacked ? "max-xl:hidden" : undefined}>·</span>
      <span className="shrink-0">{seller.label}</span>
      {seller.verified ? <VerifiedIcon className="h-3.5 w-3.5" /> : null}
    </p>
  );
}

// Seller words, never a mark alone (VERIFY-001/012): "Particular", "Tienda" or "Tienda verificada".
function getSellerLabel(listing: ListingCardData) {
  if (listing.seller_type !== "store") return { label: "Particular", verified: false };
  const verified = normalizeStore(listing)?.is_verified === true;
  return { label: verified ? "Tienda verificada" : "Tienda", verified };
}
