"use client";

import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { Lightbox } from "@/components/listing/lightbox";
import { IconButton } from "@/components/ui/button";
import type { ListingPhotoData } from "@/lib/listings";
import { cn } from "@/lib/utils";

// Thumbnails before the "+N" tile: six from 1024 px, four on phones (UX-4 L3 A).
export const THUMBS_WIDE = 6;
export const THUMBS_PHONE = 4;
export const MAIN_PHOTO_SIZES = "(max-width: 1023px) 100vw, 58vw";
export const THUMB_SIZES = "(max-width: 1023px) 56px, 72px";

// The listing gallery (docs/ux-redesign/ux-4-listing-store.md § Gallery and lightbox). One sideways track of 4:3
// frames, photo contained on white: phones swipe it (scroll snap; the counter follows), and from 1024 px two 44 px
// arrows move it. Each frame is a button that opens the lightbox. The first photo is the page's LCP: eager with high
// priority; the rest lazy. Thumbnails (PHOTO-017) choose the photo; past six (four on phones) a "+N" tile opens the
// lightbox at the next photo.
export function ListingGallery({ photos, title }: { photos: ListingPhotoData[]; title: string }) {
  const [active, setActive] = useState(0);
  const [lightboxAt, setLightboxAt] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const total = photos.length;

  const show = useCallback((index: number) => {
    const track = trackRef.current;
    const next = (index + total) % total;
    setActive(next);
    track?.scrollTo({ left: next * track.clientWidth, behavior: "auto" });
  }, [total]);

  function onScroll() {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    const index = Math.round(track.scrollLeft / track.clientWidth);
    if (index !== active && index >= 0 && index < total) setActive(index);
  }

  function openLightbox(index: number, opener: HTMLElement) {
    openerRef.current = opener;
    setLightboxAt(index);
  }

  if (total === 0) {
    return (
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-panel border border-subtle bg-canvas px-4 text-center t-ui font-semibold text-ink-2">
        <ImageOff className="h-9 w-9 text-ink-3" aria-hidden="true" />
        <span>Sin foto</span>
      </div>
    );
  }

  const thumbs = photos.slice(0, THUMBS_WIDE);

  return (
    <div className="grid gap-3">
      <div className="relative overflow-hidden rounded-panel border border-subtle bg-surface">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="scrollbar-none flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto overscroll-x-contain lg:overflow-x-hidden"
        >
          {photos.map((photo, index) => (
            <button
              key={photo.id ?? photo.image_url}
              type="button"
              aria-label={`Ampliar foto ${index + 1} de ${total}`}
              onClick={(event) => openLightbox(index, event.currentTarget)}
              className="relative h-full w-full shrink-0 snap-center focus-visible:outline-offset-[-4px]"
            >
              <Image
                fill
                sizes={MAIN_PHOTO_SIZES}
                src={photo.image_url}
                alt={photo.alt_text ?? title}
                priority={index === 0}
                fetchPriority={index === 0 ? "high" : undefined}
                loading={index === 0 ? undefined : "lazy"}
                className="object-contain"
              />
            </button>
          ))}
        </div>
        {total > 1 ? (
          <>
            <IconButton
              label="Foto anterior"
              icon={<ChevronLeft aria-hidden="true" />}
              onClick={() => show(active - 1)}
              className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-surface/95 lg:inline-flex"
            />
            <IconButton
              label="Foto siguiente"
              icon={<ChevronRight aria-hidden="true" />}
              onClick={() => show(active + 1)}
              className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-surface/95 lg:inline-flex"
            />
          </>
        ) : null}
        {total > 1 ? (
          <span aria-live="polite" className="pointer-events-none absolute bottom-3 right-3 rounded-tag bg-frame/75 px-2 py-0.5 text-[13px] font-semibold leading-[18px] tabular-nums text-white">
            <span className="sr-only">Foto </span>{active + 1} / {total}
          </span>
        ) : null}
      </div>

      {total > 1 ? (
        <div role="group" aria-label="Miniaturas de fotos" className="flex flex-wrap gap-2">
          {thumbs.map((photo, index) => (
            <button
              key={photo.id ?? photo.image_url}
              type="button"
              onClick={() => show(index)}
              aria-label={`Ver foto ${index + 1} de ${total}`}
              aria-current={index === active ? "true" : undefined}
              className={cn(
                "relative h-14 w-14 shrink-0 overflow-hidden rounded-control bg-surface lg:h-[72px] lg:w-[72px]",
                index >= THUMBS_PHONE && "hidden lg:block",
                index === active ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : "ring-1 ring-subtle hover:ring-line-strong",
              )}
            >
              <Image
                fill
                sizes={THUMB_SIZES}
                src={photo.image_url}
                alt=""
                loading="lazy"
                className="object-cover"
              />
            </button>
          ))}
          <MoreTile count={total - THUMBS_PHONE} at={THUMBS_PHONE} className="flex lg:hidden" onOpen={openLightbox} />
          <MoreTile count={total - THUMBS_WIDE} at={THUMBS_WIDE} className="hidden lg:flex" onOpen={openLightbox} />
        </div>
      ) : null}

      {lightboxAt !== null ? (
        <Lightbox
          photos={photos}
          title={title}
          start={lightboxAt}
          onClose={(index) => {
            setLightboxAt(null);
            show(index);
            openerRef.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

function MoreTile({ count, at, className, onOpen }: { count: number; at: number; className: string; onOpen: (index: number, opener: HTMLElement) => void }) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={(event) => onOpen(at, event.currentTarget)}
      aria-label={`Ver ${count} ${count === 1 ? "foto más" : "fotos más"}`}
      className={cn("h-14 w-14 shrink-0 items-center justify-center rounded-control bg-canvas t-ui font-semibold text-ink ring-1 ring-subtle hover:ring-line-strong lg:h-[72px] lg:w-[72px]", className)}
    >
      +{count}
    </button>
  );
}
