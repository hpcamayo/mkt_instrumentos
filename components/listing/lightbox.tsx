"use client";

import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { IconButton } from "@/components/ui/button";
import type { ListingPhotoData } from "@/lib/listings";
import {
  IDENTITY,
  MAX_ZOOM,
  MIN_ZOOM,
  distance,
  fittedSize,
  midpoint,
  panZoom,
  pinchZoom,
  stepZoom,
  toggleZoom,
  wheelScale,
  zoomAt,
  zoomPercent,
  type Point,
  type Size,
  type Zoom,
} from "@/lib/photo-zoom";

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
const DOUBLE_TAP_MS = 300;
const TAP_SLOP = 10;
const SWIPE_DISTANCE = 40;

type Gesture =
  | { kind: "swipe"; from: Point }
  | { kind: "pan"; from: Point; start: Zoom }
  | { kind: "pinch"; fromMid: Point; fromDistance: number; start: Zoom };

// The photo lightbox (UX-4 L3 A): a native modal <dialog> over frame black at 95% (`.lightbox` in app/globals.css),
// rendered only while open. The photo is fitted to the viewport and loaded at full width only now; the next and the
// previous photos load hidden behind it so moving is instant. The counter is announced politely; 44 px arrows and
// "Cerrar"; Esc, the arrow keys and a sideways swipe work; Tab stays inside, and the caller returns focus to the button
// that opened it. It fades in 120 ms (in place under reduced motion).
// Zoom (Effortless list-01, math in lib/photo-zoom.ts): pinch, double tap / double click, the wheel or a trackpad
// pinch, and "Acercar" / "Alejar" (+ and - keys, 0 resets) up to 4x; drag pans while zoomed, a sideways swipe changes
// photo only at 1x, and the zoom resets when the photo changes.
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
  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ at: number; point: Point } | null>(null);
  const downAt = useRef<{ time: number; point: Point } | null>(null);
  const natural = useRef<Size | null>(null);
  const [index, setIndex] = useState(start);
  const [zoom, setZoomState] = useState<Zoom>(IDENTITY);
  const zoomRef = useRef<Zoom>(IDENTITY);
  // Buttons, keys and double taps glide (not under reduced motion, see .lightbox-photo); pinch and drag follow the
  // fingers without delay.
  const [animate, setAnimate] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  // The widest zoom reached on this photo, in whole steps: the photo is asked again at that many viewport widths so a
  // zoomed photo stays sharp (the browser picks the bigger srcset candidate; it never steps back down).
  const [detail, setDetail] = useState(1);
  const total = photos.length;
  const photo = photos[index] ?? photos[0];
  const zoomed = zoom.scale > MIN_ZOOM;

  function setZoom(next: Zoom, glide: boolean, announce = false) {
    zoomRef.current = next;
    setAnimate(glide);
    setZoomState(next);
    setDetail((current) => Math.max(current, Math.ceil(next.scale)));
    if (announce) setAnnouncement(next.scale > MIN_ZOOM ? `Foto ampliada al ${zoomPercent(next)} %` : "Foto sin ampliar");
  }

  const move = (step: number) => {
    natural.current = null;
    zoomRef.current = IDENTITY;
    setZoomState(IDENTITY);
    setDetail(1);
    setAnnouncement("");
    setIndex((current) => (current + step + total) % total);
  };

  function stage(): { size: Size; photo: Size; rect: DOMRect | null } {
    const rect = stageRef.current?.getBoundingClientRect() ?? null;
    const size = { width: rect?.width ?? 0, height: rect?.height ?? 0 };
    return { size, photo: fittedSize(size, natural.current), rect };
  }

  // A pointer position measured from the stage centre.
  function local(clientX: number, clientY: number): Point {
    const { rect } = stage();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  }

  function step(direction: 1 | -1) {
    const { size, photo: fitted } = stage();
    setZoom(stepZoom(zoomRef.current, direction, size, fitted), true, true);
  }

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

  // The wheel needs a non-passive listener to keep the page from scrolling or the browser from zooming.
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const rect = element!.getBoundingClientRect();
      const size = { width: rect.width, height: rect.height };
      const at = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const current = zoomRef.current;
      const next = zoomAt(current, wheelScale(current.scale, delta, event.ctrlKey), at, size, fittedSize(size, natural.current));
      zoomRef.current = next;
      setAnimate(false);
      setZoomState(next);
      setDetail((current) => Math.max(current, Math.ceil(next.scale)));
    }
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "ArrowLeft" && total > 1) {
      event.preventDefault();
      move(-1);
    } else if (event.key === "ArrowRight" && total > 1) {
      event.preventDefault();
      move(1);
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      step(1);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "0" && zoomRef.current.scale > MIN_ZOOM) {
      event.preventDefault();
      setZoom(IDENTITY, true, true);
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

  function beginGesture() {
    const points = [...pointers.current.values()];
    if (points.length >= 2) {
      const [a, b] = points;
      gesture.current = { kind: "pinch", fromMid: midpoint(a, b), fromDistance: Math.max(1, distance(a, b)), start: zoomRef.current };
    } else if (points.length === 1) {
      gesture.current = zoomRef.current.scale > MIN_ZOOM
        ? { kind: "pan", from: points[0], start: zoomRef.current }
        : { kind: "swipe", from: points[0] };
    } else {
      gesture.current = null;
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = local(event.clientX, event.clientY);
    pointers.current.set(event.pointerId, point);
    downAt.current = pointers.current.size === 1 ? { time: event.timeStamp, point } : null;
    beginGesture();
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, local(event.clientX, event.clientY));
    const current = gesture.current;
    if (!current || current.kind === "swipe") return;
    const { size, photo: fitted } = stage();
    if (current.kind === "pinch") {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      setZoom(pinchZoom(current.start, current.fromMid, midpoint(a, b), distance(a, b) / current.fromDistance, size, fitted), false);
    } else {
      const point = pointers.current.get(event.pointerId)!;
      setZoom(panZoom(current.start, point.x - current.from.x, point.y - current.from.y, size, fitted), false);
    }
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const point = pointers.current.get(event.pointerId) ?? local(event.clientX, event.clientY);
    const current = gesture.current;
    const down = downAt.current;
    pointers.current.delete(event.pointerId);
    if (current?.kind === "swipe" && pointers.current.size === 0 && total > 1) {
      const dx = point.x - current.from.x;
      const dy = point.y - current.from.y;
      if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy)) {
        lastTap.current = null;
        gesture.current = null;
        move(dx < 0 ? 1 : -1);
        return;
      }
    }
    // A tap: quick and nearly still. Two taps close together toggle the zoom at that point.
    const isTap = down !== null && pointers.current.size === 0 && distance(down.point, point) < TAP_SLOP && event.timeStamp - down.time < 400;
    if (isTap) {
      const previous = lastTap.current;
      if (previous && event.timeStamp - previous.at < DOUBLE_TAP_MS && distance(previous.point, point) < TAP_SLOP * 3) {
        lastTap.current = null;
        const { size, photo: fitted } = stage();
        setZoom(toggleZoom(zoomRef.current, point, size, fitted), true, true);
      } else {
        lastTap.current = { at: event.timeStamp, point };
      }
    }
    // A pinch that ends near 1x settles at 1x; one finger left on the photo keeps panning.
    if (current?.kind === "pinch" && zoomRef.current.scale < 1.05) setZoom(IDENTITY, true);
    downAt.current = null;
    beginGesture();
  }

  function onPointerCancel(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    downAt.current = null;
    beginGesture();
  }

  // The next and the previous photo, loaded hidden at the lightbox's size so moving shows them at once.
  const neighbours = total > 1 ? [...new Set([(index + 1) % total, (index - 1 + total) % total])].filter((n) => n !== index) : [];

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
          <p aria-live="polite" className="sr-only">{announcement}</p>
          <IconButton label="Cerrar" icon={<X aria-hidden="true" />} variant="onDark" onClick={() => onClose(index)} />
        </div>
        <div
          ref={stageRef}
          data-zoomed={zoomed ? "" : undefined}
          className="lightbox-stage relative min-h-0 flex-1 touch-none select-none overflow-hidden"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          {neighbours.map((n) => (
            <div key={`preload-${photos[n].id ?? photos[n].image_url}`} aria-hidden="true" className="pointer-events-none invisible absolute inset-0">
              <Image fill sizes="100vw" src={photos[n].image_url} alt="" loading="eager" className="object-contain" />
            </div>
          ))}
          {photo ? (
            <div
              className="lightbox-photo absolute inset-0"
              data-animate={animate ? "" : undefined}
              style={{ transform: `translate3d(${zoom.x}px, ${zoom.y}px, 0) scale(${zoom.scale})` }}
            >
              <Image
                key={photo.id ?? photo.image_url}
                fill
                sizes={detail > 1 ? `${detail * 100}vw` : "100vw"}
                src={photo.image_url}
                alt={photo.alt_text ?? `${title}, foto ${index + 1}`}
                draggable={false}
                onLoad={(event) => {
                  const image = event.currentTarget;
                  natural.current = { width: image.naturalWidth, height: image.naturalHeight };
                }}
                className="object-contain"
              />
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-center gap-4 px-4 py-3">
          {total > 1 ? (
            <IconButton label="Foto anterior" icon={<ChevronLeft aria-hidden="true" />} variant="onDark" onClick={() => move(-1)} />
          ) : null}
          <IconButton
            label="Alejar"
            icon={<ZoomOut aria-hidden="true" />}
            variant="onDark"
            aria-disabled={zoomed ? undefined : "true"}
            aria-keyshortcuts="-"
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
            onClick={() => (zoomed ? step(-1) : undefined)}
          />
          <IconButton
            label="Acercar"
            icon={<ZoomIn aria-hidden="true" />}
            variant="onDark"
            aria-disabled={zoom.scale >= MAX_ZOOM ? "true" : undefined}
            aria-keyshortcuts="+"
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
            onClick={() => (zoom.scale < MAX_ZOOM ? step(1) : undefined)}
          />
          {total > 1 ? (
            <IconButton label="Foto siguiente" icon={<ChevronRight aria-hidden="true" />} variant="onDark" onClick={() => move(1)} />
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
