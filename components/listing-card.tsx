"use client";

import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { ImageOff } from "lucide-react";
import Link from "next/link";
import { FavoriteButton } from "@/components/favorite-button";
import { useListingImpression } from "@/components/marketplace-telemetry";
import type { EventSource } from "@/lib/marketplace-event-payload";
import { getCardSpecLine } from "@/lib/listing-specs";
import { Price } from "@/components/ui/price";
import { VerifiedIcon } from "@/components/ui/verified-mark";
import {
  getListingDisplayTitle,
  normalizeStore,
  type ListingCardData,
} from "@/lib/listings";

// Pages that have not adopted the catalog grid (lib/ui/listing-grid.ts) keep today's image sizes: store inventory and
// listing recommendations (UX-4).
const DEFAULT_SIZES = "(max-width: 459px) 100vw, (max-width: 767px) 50vw, (max-width: 1279px) 33vw, 320px";

type ListingCardProps = {
  listing: ListingCardData;
  source?: EventSource;
  // h2 in the catalog and the landings; h3 under a section heading.
  headingLevel?: 2 | 3;
  // The first row of a grid loads its photos eagerly.
  eager?: boolean;
  sizes?: string;
};

// The one listing card (docs/ux-redesign/ux-3-discovery.md § The one listing card, grid variant): a square photo,
// then the title, price, a spec line and a seller line. One link, the title, stretched over the whole card, and the
// favourite above it: two tab stops.
export function ListingCard({ listing, source = "catalog", headingLevel = 2, eager = false, sizes = DEFAULT_SIZES }: ListingCardProps) {
  const impressionRef = useListingImpression(listing.id, source);
  const photo = listing.listing_photos[0];
  const photoCount = listing.photo_count ?? listing.listing_photos.length;
  const displayTitle = getListingDisplayTitle(listing);
  const specLine = getCardSpecLine(listing);
  const seller = getSellerLabel(listing);
  const Heading = headingLevel === 3 ? "h3" : "h2";

  return (
    <article ref={impressionRef} className="group relative flex min-w-0 flex-col">
      <div className="relative aspect-square overflow-hidden rounded-panel border border-subtle bg-canvas transition-colors duration-120 group-hover:border-line-strong">
        {photo ? (
          <Image
            width={600}
            height={600}
            sizes={sizes}
            src={photo.image_url}
            alt={photo.alt_text ?? listing.title}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <ImageOff className="h-8 w-8 text-ink-3" aria-hidden="true" />
            <span className="t-meta font-semibold">Sin foto</span>
          </div>
        )}
        {photoCount > 1 ? (
          <span className="absolute bottom-2 left-2 rounded-tag bg-frame/75 px-1.5 py-0.5 text-[12px] font-semibold leading-4 text-white">
            {photoCount} fotos
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex min-w-0 flex-col gap-1">
        <Heading className="line-clamp-2 min-h-[38px] t-card-title text-ink">
          <Link
            href={`/instrumentos/${listing.slug}`}
            className="decoration-accent decoration-2 underline-offset-[3px] after:absolute after:inset-0 group-hover:underline"
          >
            {displayTitle}
          </Link>
        </Heading>
        <p>
          <Price value={listing.price_pen} />
        </p>
        {specLine ? <p className="truncate t-meta">{specLine}</p> : null}
        <p className="flex min-w-0 items-center gap-1 t-meta">
          <span className="min-w-0 truncate">{listing.city}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{seller.label}</span>
          {seller.verified ? <VerifiedIcon className="h-3.5 w-3.5" /> : null}
        </p>
      </div>

      <div className="absolute right-1 top-1 z-10">
        <FavoriteButton listingId={listing.id} variant="overlay" />
      </div>
    </article>
  );
}

// Seller words, never a mark alone (VERIFY-001/012): "Particular", "Tienda" or "Tienda verificada".
function getSellerLabel(listing: ListingCardData) {
  if (listing.seller_type !== "store") return { label: "Particular", verified: false };
  const verified = normalizeStore(listing)?.is_verified === true;
  return { label: verified ? "Tienda verificada" : "Tienda", verified };
}
