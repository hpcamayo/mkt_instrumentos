"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getInstrumentFilterGroup } from "@/lib/instrument-filters";
import {
  formatPrice,
  getCategoryLabel,
  normalizeStore,
  type ListingCardData,
  type ListingPhotoData,
} from "@/lib/listings";

type ListingCardProps = {
  listing: ListingCardData;
};

export function ListingCard({ listing }: ListingCardProps) {
  const store = normalizeStore(listing);
  const initialPhotos = listing.listing_photos;
  const [photos, setPhotos] = useState<ListingPhotoData[]>(initialPhotos);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [hasLoadedRemainingPhotos, setHasLoadedRemainingPhotos] = useState(
    initialPhotos.length > 1,
  );
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const photoCount = listing.photo_count ?? photos.length;
  const activePhoto = photos[activePhotoIndex] ?? photos[0];
  const sellerLabel = getSellerBadgeLabel(listing, store);
  const sellerBadgeClass =
    sellerLabel === "Tienda verificada"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-slate-100 text-slate-700";
  const displayTitle = getDisplayTitle(listing);
  const categoryLabel = getListingTagLabel(listing);
  const conditionLabel = formatCondition(listing.condition);
  const hasMultiplePhotos = photoCount > 1;

  useEffect(() => {
    setPhotos(listing.listing_photos);
    setActivePhotoIndex(0);
    setHasLoadedRemainingPhotos(listing.listing_photos.length > 1);
  }, [listing.id, listing.listing_photos]);

  async function loadRemainingPhotos() {
    if (hasLoadedRemainingPhotos || isLoadingPhotos) {
      return photos;
    }

    setIsLoadingPhotos(true);

    try {
      const params = new URLSearchParams();
      const firstPhotoId = photos[0]?.id;

      if (firstPhotoId) {
        params.set("exclude_id", firstPhotoId);
      }

      const query = params.toString();
      const response = await fetch(
        `/api/listings/${listing.id}/photos${query ? `?${query}` : ""}`,
      );

      if (!response.ok) {
        return photos;
      }

      const payload = (await response.json()) as {
        photos?: ListingPhotoData[];
      };
      const mergedPhotos = mergePhotos(photos, payload.photos ?? []);

      setPhotos(mergedPhotos);
      setHasLoadedRemainingPhotos(true);

      return mergedPhotos;
    } finally {
      setIsLoadingPhotos(false);
    }
  }

  async function showPhoto(index: number) {
    if (index === 0 || hasLoadedRemainingPhotos) {
      setActivePhotoIndex(Math.min(index, Math.max(photos.length - 1, 0)));
      return;
    }

    const loadedPhotos = await loadRemainingPhotos();
    setActivePhotoIndex(Math.min(index, Math.max(loadedPhotos.length - 1, 0)));
  }

  async function showPreviousPhoto() {
    if (!hasMultiplePhotos) {
      return;
    }

    if (activePhotoIndex > 0) {
      setActivePhotoIndex(activePhotoIndex - 1);
      return;
    }

    const loadedPhotos = await loadRemainingPhotos();
    setActivePhotoIndex(Math.max(loadedPhotos.length - 1, 0));
  }

  async function showNextPhoto() {
    if (!hasMultiplePhotos) {
      return;
    }

    const nextIndex = activePhotoIndex + 1;

    if (nextIndex < photos.length) {
      setActivePhotoIndex(nextIndex);
      return;
    }

    const loadedPhotos = await loadRemainingPhotos();
    setActivePhotoIndex(nextIndex < loadedPhotos.length ? nextIndex : 0);
  }

  return (
    <article className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-[4/3] bg-slate-100">
        {activePhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={activePhoto.image_url}
            alt={activePhoto.alt_text ?? listing.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-slate-500">
            Foto pendiente
          </div>
        )}

        <span className="absolute left-2 top-2 max-w-[calc(100%-4rem)] truncate rounded bg-white/95 px-2 py-1 text-[11px] font-semibold text-ink shadow-sm">
          {categoryLabel}
        </span>

        {hasMultiplePhotos ? (
          <>
            <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={showPreviousPhoto}
                aria-label="Foto anterior"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-950/70 text-sm font-bold text-white transition hover:bg-slate-950"
              >
                ‹
              </button>
              <div className="flex items-center gap-1.5 rounded-full bg-slate-950/55 px-2 py-1">
                {Array.from({ length: Math.min(photoCount, 5) }).map(
                  (_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => showPhoto(index)}
                      aria-label={`Ver foto ${index + 1}`}
                      className={
                        index === activePhotoIndex
                          ? "h-1.5 w-4 rounded-full bg-white"
                          : "h-1.5 w-1.5 rounded-full bg-white/55"
                      }
                    />
                  ),
                )}
              </div>
              <button
                type="button"
                onClick={showNextPhoto}
                aria-label="Foto siguiente"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-950/70 text-sm font-bold text-white transition hover:bg-slate-950"
              >
                ›
              </button>
            </div>
            <span className="absolute right-2 top-2 rounded bg-slate-950/75 px-2 py-1 text-[11px] font-semibold text-white">
              {activePhotoIndex + 1} / {photoCount}
            </span>
          </>
        ) : null}
      </div>

      <div className="space-y-3 p-3">
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <h2 className="line-clamp-2 min-w-0 text-sm font-semibold leading-5 text-ink">
              <Link
                href={`/instrumentos/${listing.slug}`}
                className="underline-offset-4 hover:underline"
              >
                {displayTitle}
              </Link>
            </h2>
            <span
              className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${sellerBadgeClass}`}
            >
              {sellerLabel}
            </span>
          </div>

          {conditionLabel ? (
            <p className="line-clamp-1 text-xs text-slate-500">
              {conditionLabel}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <p className="text-base font-bold leading-5 text-ink">
            {formatPrice(listing.price_pen)}
          </p>
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
            <p className="min-w-0 truncate">
              {listing.city}, {listing.region}
            </p>
            {store ? (
              <Link
                href={`/tiendas/${store.slug}`}
                className="max-w-[45%] shrink-0 truncate text-right font-semibold text-slate-600 underline-offset-4 hover:underline"
              >
                {store.name}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function getDisplayTitle(listing: ListingCardData) {
  const productName = [listing.brand, listing.model].filter(Boolean).join(" ");

  return productName || listing.title;
}

function getListingTagLabel(listing: ListingCardData) {
  if (listing.instrument_type) {
    return (
      getInstrumentFilterGroup(listing.instrument_type)?.label ??
      getCategoryLabel(listing.category)
    );
  }

  return getCategoryLabel(listing.category);
}

function getSellerBadgeLabel(
  listing: ListingCardData,
  store: ReturnType<typeof normalizeStore>,
) {
  if (listing.seller_type === "store" && store?.is_verified === true) {
    return "Tienda verificada";
  }

  return listing.seller_type === "store" ? "Tienda" : "Particular";
}

function formatCondition(condition: string | null) {
  if (!condition) {
    return null;
  }

  const parts = condition
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return condition;
  }

  return parts.map(capitalizeFirst).join(" · ");
}

function capitalizeFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function mergePhotos(
  currentPhotos: ListingPhotoData[],
  nextPhotos: ListingPhotoData[],
) {
  const photosByKey = new Map<string, ListingPhotoData>();

  for (const photo of [...currentPhotos, ...nextPhotos]) {
    photosByKey.set(photo.id ?? photo.image_url, photo);
  }

  return [...photosByKey.values()].sort(
    (photoA, photoB) => photoA.sort_order - photoB.sort_order,
  );
}
