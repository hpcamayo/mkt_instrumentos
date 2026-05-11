"use client";

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
        className="group relative overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-ink"
      >
        {hasPhotos && activePhoto ? (
          <div className="flex aspect-[4/3] items-center justify-center bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={activePhoto.id ?? activePhoto.image_url}
              src={activePhoto.image_url}
              alt={activePhoto.alt_text ?? title}
              loading={activeIndex === 0 ? "eager" : "lazy"}
              decoding="async"
              className="h-full w-full object-contain"
            />
          </div>
        ) : (
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 bg-slate-100 px-4 text-center text-sm text-slate-500">
            <ImageIcon className="h-8 w-8 text-slate-400" aria-hidden="true" />
            <span>Foto pendiente</span>
          </div>
        )}

        {hasMultiplePhotos ? (
          <>
            <button
              type="button"
              onClick={showPreviousPhoto}
              aria-label="Foto anterior"
              className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm ring-1 ring-slate-200 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-ink"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={showNextPhoto}
              aria-label="Foto siguiente"
              className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm ring-1 ring-slate-200 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-ink"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="absolute bottom-3 right-3 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-semibold text-white">
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
                  ? "h-16 w-16 shrink-0 overflow-hidden rounded-md bg-white ring-2 ring-ink ring-offset-2 ring-offset-white focus:outline-none"
                  : "h-16 w-16 shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-slate-200 transition hover:ring-slate-400 focus:outline-none focus:ring-2 focus:ring-ink focus:ring-offset-2 focus:ring-offset-white"
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.image_url}
                alt={photo.alt_text ?? `${title} foto ${index + 1}`}
                loading={index < 4 ? "eager" : "lazy"}
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
