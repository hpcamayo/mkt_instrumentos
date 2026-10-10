"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { IconButton } from "@/components/ui/button";
import type { ListingPhotoData } from "@/lib/listings";

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

// The photo lightbox (UX-4 L3 A): a native modal <dialog> over frame black at 95% (`.lightbox` in app/globals.css),
// rendered only while open. The photo is fitted to the viewport and loaded at full width only now. The counter is
// announced politely; 44 px arrows and "Cerrar"; Esc, the arrow keys and a sideways swipe work; Tab stays inside, and
// the caller returns focus to the button that opened it. It fades in 120 ms (in place under reduced motion).
export function Lightbox({
  photos,
  title,
  start,
  onClose,
}: {
  photos: ListingPhotoData[];
  title: string;
  start: number;
  onClose: (index: number) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const swipe = useRef<number | null>(null);
  const [index, setIndex] = useState(start);
  const total = photos.length;
  const photo = photos[index] ?? photos[0];
  const move = (step: number) => setIndex((current) => (current + step + total) % total);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = overflow;
      if (dialog.open) dialog.close();
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "ArrowLeft" && total > 1) {
      event.preventDefault();
      move(-1);
    } else if (event.key === "ArrowRight" && total > 1) {
      event.preventDefault();
      move(1);
    } else if (event.key === "Tab") {
      const items = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((item) => item.getClientRects().length > 0);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const from = swipe.current;
    swipe.current = null;
    if (from === null || total < 2) return;
    const distance = event.clientX - from;
    if (Math.abs(distance) > 40) move(distance < 0 ? 1 : -1);
  }

  return (
    <dialog
      ref={ref}
      aria-label={`Fotos de ${title}`}
      aria-modal="true"
      className="lightbox surface-frame"
      onCancel={(event) => {
        event.preventDefault();
        onClose(index);
      }}
      onKeyDown={onKeyDown}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 px-2 py-2 sm:px-4">
          <p aria-live="polite" className="pl-2 t-ui font-semibold tabular-nums text-white">
            Foto {index + 1} de {total}
          </p>
          <IconButton label="Cerrar" icon={<X aria-hidden="true" />} variant="onDark" onClick={() => onClose(index)} />
        </div>
        <div
          className="relative min-h-0 flex-1 touch-pan-y"
          onPointerDown={(event) => { swipe.current = event.clientX; }}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { swipe.current = null; }}
        >
          {photo ? (
            <Image
              key={photo.id ?? photo.image_url}
              fill
              sizes="100vw"
              src={photo.image_url}
              alt={photo.alt_text ?? `${title}, foto ${index + 1}`}
              className="object-contain"
            />
          ) : null}
        </div>
        {total > 1 ? (
          <div className="flex items-center justify-center gap-4 px-4 py-3">
            <IconButton label="Foto anterior" icon={<ChevronLeft aria-hidden="true" />} variant="onDark" onClick={() => move(-1)} />
            <IconButton label="Foto siguiente" icon={<ChevronRight aria-hidden="true" />} variant="onDark" onClick={() => move(1)} />
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
