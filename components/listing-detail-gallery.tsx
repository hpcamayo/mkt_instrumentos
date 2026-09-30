"use client";

import { MarketplaceImage as Image } from "@/components/marketplace-image";

import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import type { ListingPhotoData } from "@/lib/listings";

type ListingDetailGalleryProps = {
  photos: ListingPhotoData[];
  title: string;
};

export function ListingDetailGallery({
  photos,
  title,
}: ListingDetailGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const hasPhotos = photos.length > 0;
  const hasMultiplePhotos = photos.length > 1;
  const activePhoto = photos[activeIndex] ?? photos[0];

  function showPreviousPhoto() {
    if (!hasMultiplePhotos) {
      return;
    }

    setActiveIndex((currentIndex) =>
      currentIndex === 0 ? photos.length - 1 : currentIndex - 1,
    );
  }

  function showNextPhoto() {
    if (!hasMultiplePhotos) {
      return;
    }

    setActiveIndex((currentIndex) =>
      currentIndex === photos.length - 1 ? 0 : currentIndex + 1,
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showPreviousPhoto();
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      showNextPhoto();
    }
  }

  return (
    <div className="space-y-3">
      <div
        tabIndex={hasMultiplePhotos ? 0 : -1}
        onKeyDown={handleKeyDown}
        className="group relative overflow-hidden rounded-panel border border-subtle bg-white"
      >
        {hasPhotos && activePhoto ? (
          <div className="flex aspect-[4/3] items-center justify-center bg-surface">
            <Image
              width={800}
              height={600}
              sizes="(max-width: 1023px) 100vw, 45vw"
              key={activePhoto.id ?? activePhoto.image_url}
              src={activePhoto.image_url}
              alt={activePhoto.alt_text ?? title}
              loading={activeIndex === 0 ? "eager" : "lazy"}
              decoding="async"
              className="h-full w-full object-contain"
            />
          </div>
        ) : (
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 bg-canvas px-4 text-center t-ui font-semibold text-ink-2">
            <ImageIcon
              className="h-9 w-9 text-ink-3"
              aria-hidden="true"
            />
            <span>Foto pendiente</span>
          </div>
        )}

        {hasMultiplePhotos ? (
          <>
            <button
              type="button"
              onClick={showPreviousPhoto}
              aria-label="Foto anterior"
              className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-control border border-line-strong bg-white/95 text-ink transition-colors duration-120 hover:bg-canvas"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={showNextPhoto}
              aria-label="Foto siguiente"
              className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-control border border-line-strong bg-white/95 text-ink transition-colors duration-120 hover:bg-canvas"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="absolute bottom-3 right-3 rounded-tag bg-frame/80 px-2 py-0.5 t-meta font-semibold tabular-nums text-white">
              {activeIndex + 1} / {photos.length}
            </span>
          </>
        ) : null}
      </div>

      {hasMultiplePhotos ? (
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          aria-label="Miniaturas de fotos"
        >
          {photos.map((photo, index) => (
            <button
              key={photo.id ?? photo.image_url}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`Ver foto ${index + 1}`}
              aria-current={index === activeIndex ? "true" : undefined}
              className={
                index === activeIndex
                  ? "h-16 w-16 shrink-0 overflow-hidden rounded-control bg-white ring-2 ring-accent ring-offset-2 ring-offset-white"
                  : "h-16 w-16 shrink-0 overflow-hidden rounded-control bg-white ring-1 ring-subtle transition hover:ring-accent"
              }
            >
              <Image
                width={64}
                height={64}
                sizes="64px"
                src={photo.image_url}
                alt={photo.alt_text ?? `${title} foto ${index + 1}`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
