"use client";

import { ChevronLeft, ChevronRight, Clock, EyeOff, ImageOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DescubrirContact } from "@/components/descubrir/descubrir-contact";
import { FavoriteButton } from "@/components/favorite-button";
import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { useListingImpression } from "@/components/marketplace-telemetry";
import { IconButton, buttonClasses } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { StatusTag, Tag } from "@/components/ui/tag";
import { VerifiedIcon } from "@/components/ui/verified-mark";
import { publishedLabel, type DescubrirItem } from "@/lib/descubrir";
import { visiblePreviousPrice } from "@/lib/listing-page";
import { getCardSpecLine } from "@/lib/listing-specs";
import { isOutOfStock, normalizeStore, type ListingPhotoData } from "@/lib/listings";
import type { EventSource } from "@/lib/marketplace-event-payload";

export const PHOTO_SIZES = "(max-width: 520px) 100vw, 520px";

// What a screen loads (big-02: only the next listing's photos load ahead of time):
// "first"   the screen the page opens on: its first photo with high priority, the second too, the rest when swiped;
// "current" the screen in view: its first two photos, the rest when swiped;
// "next"    the next screen: its first photo, ahead of time (left out when the phone saves data);
// "idle"    anything else: what is already loaded stays, nothing new loads until it comes into view.
export type PhotoLoading = "first" | "current" | "next" | "idle";

function photoLoading(mode: PhotoLoading, index: number): "eager" | "lazy" {
  if (index === 0) return mode === "idle" ? "lazy" : "eager";
  if (index === 1) return mode === "first" || mode === "current" ? "eager" : "lazy";
  return "lazy";
}

export function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// The keys Descubrir answers: none while a field, a dialog or a modifier is involved.
export function isFeedKey(event: KeyboardEvent) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return false;
  if (document.querySelector("dialog[open]")) return false;
  const target = event.target as HTMLElement | null;
  return !target?.closest("input, textarea, select, [contenteditable='true']");
}

// "Reservado" (the reservation batch's flag), told by word and icon like every status.
export function ReservedTag() {
  return <Tag tone="warning" icon={<Clock aria-hidden />}>Reservado</Tag>;
}

// The listing's photos, side by side: a swipe, the two 44 px arrows or ← → move them; the counter follows. Contained on
// the frame, so a whole instrument shows whatever the photo's shape. No wrap-around: the last photo is the last.
function Photos({ photos, title, loading, current }: { photos: ListingPhotoData[]; title: string; loading: PhotoLoading; current: boolean }) {
  const [at, setAt] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const total = photos.length;

  const show = (index: number) => {
    const node = track.current;
    const next = Math.max(0, Math.min(total - 1, index));
    setAt(next);
    node?.scrollTo({ left: next * node.clientWidth, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  useEffect(() => {
    if (!current || total < 2) return;
    const onKey = (event: KeyboardEvent) => {
      if (!isFeedKey(event) || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
      event.preventDefault();
      show(at + (event.key === "ArrowRight" ? 1 : -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (total === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-muted-dark">
        <ImageOff className="h-9 w-9" aria-hidden="true" />
        <span className="t-ui font-semibold">Sin foto</span>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={track}
        onScroll={() => {
          const node = track.current;
          if (!node || node.clientWidth === 0) return;
          const index = Math.round(node.scrollLeft / node.clientWidth);
          if (index !== at && index >= 0 && index < total) setAt(index);
        }}
        className="scrollbar-none flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      >
        {photos.map((photo, index) => (
          <div key={photo.id ?? photo.image_url} className="relative h-full w-full shrink-0 snap-center">
            <Image
              fill
              sizes={PHOTO_SIZES}
              src={photo.image_url}
              alt={photo.alt_text ?? `${title}, foto ${index + 1}`}
              priority={loading === "first" && index === 0}
              loading={loading === "first" && index === 0 ? undefined : photoLoading(loading, index)}
              draggable={false}
              className="object-contain"
            />
          </div>
        ))}
      </div>
      {total > 1 ? (
        <>
          <IconButton
            label="Foto anterior"
            icon={<ChevronLeft aria-hidden="true" />}
            variant="onDark"
            aria-disabled={at === 0 ? "true" : undefined}
            aria-keyshortcuts="ArrowLeft"
            onClick={() => show(at - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-frame/70 aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
          />
          <IconButton
            label="Foto siguiente"
            icon={<ChevronRight aria-hidden="true" />}
            variant="onDark"
            aria-disabled={at === total - 1 ? "true" : undefined}
            aria-keyshortcuts="ArrowRight"
            onClick={() => show(at + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-frame/70 aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
          />
          <span aria-live="polite" className="pointer-events-none absolute bottom-3 right-3 rounded-tag bg-frame/75 px-2 py-0.5 text-[13px] font-semibold leading-[18px] tabular-nums text-white">
            <span className="sr-only">Foto </span>{at + 1} / {total}
          </span>
        </>
      ) : null}
    </div>
  );
}

type ScreenProps = {
  item: DescubrirItem;
  headingId: string;
  current: boolean;
  loading: PhotoLoading;
  today: string;
  now: number;
  source: EventSource;
  onHide: (item: DescubrirItem) => void;
  onOpen: (item: DescubrirItem) => void;
};

// One listing on the whole screen: its photos on the frame, then a white panel with the price, the title, the key
// specs, where and who sells it, and four plain buttons: WhatsApp (the one primary), the heart, "No me interesa" and
// "Ver publicación". Shown as a card impression of the list it comes from (the home or the catalog), never as a view.
export function DescubrirScreen({ item, headingId, current, loading, today, now, source, onHide, onOpen }: ScreenProps) {
  const impression = useListingImpression<HTMLElement>(item.id, source);
  const store = item.seller_type === "store" ? normalizeStore(item) : null;
  const verified = store?.is_verified === true;
  const seller = item.seller_type !== "store" ? "Particular" : verified ? "Tienda verificada" : "Tienda";
  const place = store?.district ? `${store.district}, ${item.city}` : item.city;
  const spec = getCardSpecLine(item);
  const published = publishedLabel(item, today, now);

  return (
    <section ref={impression} aria-labelledby={headingId} inert={!current} className="flex h-full flex-col pt-14">
      <Photos photos={item.listing_photos} title={item.title} loading={loading} current={current} />
      <div className="surface-light shrink-0 rounded-t-panel bg-surface px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Price value={item.price_pen} previous={visiblePreviousPrice(item, now)} />
          {isOutOfStock(item) ? <StatusTag domain="stock" status="out_of_stock" /> : null}
          {item.reserved ? <ReservedTag /> : null}
          {published ? <span className="ml-auto t-meta">{published}</span> : null}
        </div>
        <h2 id={headingId} tabIndex={-1} className="mt-1 line-clamp-2 text-[18px] font-semibold leading-[23px] text-ink [font-stretch:87.5%]">
          {item.title}
        </h2>
        {spec ? <p className="mt-0.5 truncate t-meta">{spec}</p> : null}
        <p className="mt-0.5 flex min-w-0 items-center gap-1 t-meta">
          <span className="min-w-0 truncate">{place}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{seller}</span>
          {verified ? <VerifiedIcon className="h-3.5 w-3.5" /> : null}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <DescubrirContact listingId={item.id} slug={item.slug} pricePen={item.price_pen} source={source} className="min-w-0 flex-1" />
          <FavoriteButton listingId={item.id} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" className={buttonClasses({ variant: "secondary", className: "px-2" })} onClick={() => onHide(item)}>
            <EyeOff aria-hidden="true" />
            No me interesa
          </button>
          <Link href={`/instrumentos/${item.slug}`} onClick={() => onOpen(item)} className={buttonClasses({ variant: "secondary", className: "px-2" })}>
            Ver publicación
          </Link>
        </div>
      </div>
    </section>
  );
}
