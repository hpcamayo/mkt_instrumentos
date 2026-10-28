"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DescubrirScreen, isFeedKey, prefersReducedMotion, type PhotoLoading } from "@/components/descubrir/descubrir-screen";
import { DescubrirStop } from "@/components/descubrir/descubrir-stop";
import { IconButton } from "@/components/ui/button";
import { RESULTS_KEY, readStore, writeStore } from "@/lib/catalog-device";
import { CATALOG_PATH } from "@/lib/catalog-filters";
import { useReducedData } from "@/lib/data-saver";
import {
  DESCUBRIR_PAGE_SIZE,
  NEW_WINDOW_DAYS,
  SPARSE_MINIMUM,
  SPARSE_WINDOW_DAYS,
  counterLabel,
  feedPageUrl,
  feedSlots,
  hiddenNote,
  markReserved,
  slotAnnouncement,
  stopCopy,
  windowDays,
  windowStart,
  type DescubrirItem,
  type DescubrirMode,
  type DescubrirSlot,
} from "@/lib/descubrir";
import { DEVICE_SAVES_EVENT, getHiddenListings, setListingHidden, showHiddenListings } from "@/lib/device-saves";
import type { ListingFilters } from "@/lib/listings";
import type { EventSource } from "@/lib/marketplace-event-payload";

// Where the feed was when a listing opened from it, for this tab: back from the listing, the feed opens there again.
const PLACE_KEY = "laria:descubrir-lugar";
const PLACE_TTL_MS = 30 * 60 * 1000;
type Place = { url: string; id: string; pages: number; at: number };

export type FeedPage = { listings: DescubrirItem[]; total: number | null };

// Null when the route fails; a fetch that fails offline throws, and the feed treats both the same.
async function fetchFeedPage(filters: ListingFilters, since: string | null, page: number): Promise<FeedPage | null> {
  const response = await fetch(feedPageUrl({ filters, since, page }));
  if (!response.ok) return null;
  const body = (await response.json()) as { listings?: unknown; total?: unknown; reserved?: unknown };
  const listings = Array.isArray(body.listings) ? (body.listings as DescubrirItem[]) : [];
  // The reservation batch's route names the page's reserved listings in `reserved`; without it, none is.
  const reserved = Array.isArray(body.reserved) ? body.reserved.filter((id): id is string => typeof id === "string") : [];
  return { listings: markReserved(listings, reserved), total: typeof body.total === "number" ? body.total : null };
}

// A newer listing can push one already shown onto the next page; it is shown once.
function merge(current: DescubrirItem[], next: DescubrirItem[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...next.filter((item) => !seen.has(item.id))];
}

const headingId = (slot: DescubrirSlot) => `descubrir-${slot.key}`;
const currentUrl = () => `${window.location.pathname}${window.location.search}`;

type FeedProps = {
  mode: DescubrirMode;
  filters: ListingFilters;
  // The top bar's name for the list: "Lo nuevo" or the results' heading.
  title: string;
  // "Salir": the home, or the results list.
  exit: string;
  today: string;
  now: number;
  // "Lo nuevo": the window's first Lima day.
  since: string | null;
  // The first page, read by the server; null when that read failed (the feed then asks for it).
  initial: FeedPage | null;
};

// Descubrir's feed (big-02): a vertical scroll-snap track with one screen per listing (lib/descubrir.ts feedSlots for
// the order and the stops). Only the screen in view and its two neighbours are drawn; the others are empty frames of
// the same height, so a long list stays light. Moving: a swipe or the wheel, "Anterior" / "Siguiente" in the bar, or
// ↑ ↓ (PageUp / PageDown). Focus follows the listing, the position is announced politely, and nothing moves on its
// own: no autoplay, no endless loop, a visible end.
export function DescubrirFeed({ mode, filters, title, exit, today, now, since: initialSince, initial }: FeedProps) {
  const [items, setItems] = useState<DescubrirItem[]>(initial?.listings ?? []);
  const [serverTotal, setServerTotal] = useState<number | null>(initial?.total ?? null);
  const [pages, setPages] = useState(initial ? 1 : 0);
  const [exhausted, setExhausted] = useState(initial ? initial.listings.length < DESCUBRIR_PAGE_SIZE : false);
  const [since, setSince] = useState(initialSince);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [hidden, setHidden] = useState<string[]>([]);
  const [hiddenRead, setHiddenRead] = useState(false);
  const [active, setActive] = useState(0);
  const [undo, setUndo] = useState<DescubrirItem | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const feed = useRef<HTMLDivElement>(null);
  const loading = useRef(false);
  const focusNext = useRef(false);
  const announced = useRef<string | null>(null);
  const scrollingTo = useRef<{ index: number; until: number } | null>(null);
  const frame = useRef(0);
  const jumpTo = useRef<{ id: string; pages: number } | null>(null);
  const placeRead = useRef(false);
  const reducedData = useReducedData();
  const source: EventSource = mode === "nuevo" ? "home" : "catalog";

  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const visible = useMemo(() => items.filter((item) => !hiddenSet.has(item.id)), [items, hiddenSet]);
  const skipped = items.filter((item) => hiddenSet.has(item.id));
  const complete = exhausted || (serverTotal !== null && items.length >= serverTotal);
  // The feed's own count: the list's, less what this device hid. Exact once every page is in.
  const total = complete ? visible.length : serverTotal === null ? null : Math.max(visible.length, serverTotal - skipped.length);
  const slots = useMemo(() => feedSlots({ items: visible, mode, today, total, complete }), [visible, mode, today, total, complete]);
  const position = Math.min(active, slots.length - 1);
  const slot = slots[position];
  const days = since ? windowDays(since, today) : NEW_WINDOW_DAYS;
  const context = { mode, windowDays: days, listTitle: title };

  // "No me interesa" lives on this device (lib/device-saves.ts); read once the page is in the browser.
  useEffect(() => {
    const read = () => setHidden(getHiddenListings());
    read();
    setHiddenRead(true);
    window.addEventListener(DEVICE_SAVES_EVENT, read);
    return () => window.removeEventListener(DEVICE_SAVES_EVENT, read);
  }, []);

  const load = useCallback(async (page: number) => {
    if (loading.current) return;
    loading.current = true;
    setStatus("loading");
    try {
      let from = since;
      let result = await fetchFeedPage(filters, from, page);
      // A quiet week: "Lo nuevo" reaches back 30 days, as the server's first screens do.
      if (result && page === 1 && mode === "nuevo" && from === windowStart(today, NEW_WINDOW_DAYS) && result.total !== null && result.total < SPARSE_MINIMUM) {
        from = windowStart(today, SPARSE_WINDOW_DAYS);
        result = await fetchFeedPage(filters, from, 1);
        if (result) setSince(from);
      }
      if (!result) {
        setStatus("error");
        return;
      }
      setItems((current) => merge(current, result.listings));
      setServerTotal((current) => result.total ?? current);
      setPages(page);
      if (result.listings.length < DESCUBRIR_PAGE_SIZE) setExhausted(true);
      setStatus("idle");
    } catch {
      setStatus("error");
    } finally {
      loading.current = false;
    }
  }, [filters, mode, since, today]);

  // The server could not read the first page: ask for it from here.
  useEffect(() => {
    if (pages === 0 && status === "idle") void load(1);
  }, [pages, status, load]);

  // The next page loads three screens before the last one in hand.
  useEffect(() => {
    if (complete || status !== "idle" || pages === 0 || jumpTo.current) return;
    if (position >= slots.length - 4) void load(pages + 1);
  }, [complete, status, pages, position, slots.length, load]);

  const scrollToSlot = useCallback((index: number, smooth: boolean) => {
    const node = feed.current;
    if (!node) return;
    scrollingTo.current = { index, until: Date.now() + 1000 };
    node.scrollTo({ top: index * node.clientHeight, behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto" });
  }, []);

  const go = useCallback((index: number, focus: boolean) => {
    const target = Math.max(0, Math.min(index, slots.length - 1));
    focusNext.current = focus;
    setActive(target);
    scrollToSlot(target, true);
  }, [slots.length, scrollToSlot]);

  function onScroll() {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const node = feed.current;
      if (!node || node.clientHeight === 0) return;
      const index = Math.round(node.scrollTop / node.clientHeight);
      const moving = scrollingTo.current;
      // While "Siguiente" glides, the screens it passes are not "in view".
      if (moving) {
        if (index !== moving.index && Date.now() < moving.until) return;
        scrollingTo.current = null;
      }
      setActive(index);
    });
  }

  // ↑ ↓ and PageUp / PageDown move one screen; the photos take ← → (components/descubrir/descubrir-screen.tsx).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isFeedKey(event)) return;
      const delta = event.key === "ArrowDown" || event.key === "PageDown" ? 1 : event.key === "ArrowUp" || event.key === "PageUp" ? -1 : 0;
      if (!delta) return;
      event.preventDefault();
      go(position + delta, true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, position]);

  // A new screen in view: say where we are, and bring focus along when it was on the screen that left (or the move
  // came from the keyboard or a button inside a screen). The first screen is the page itself: nothing to announce.
  useEffect(() => {
    if (!slot) return;
    const key = `${position}:${slot.key}`;
    if (announced.current === null || announced.current === key) {
      announced.current = key;
      return;
    }
    announced.current = key;
    setAnnouncement(slotAnnouncement(slot, total, context));
    const focused = document.activeElement;
    const screen = feed.current?.querySelector(`[data-slot="${position}"]`);
    // Nowhere in particular (the page, or <main> after the route change), or on the screen that left.
    const stray = !focused || focused === document.body || focused.contains(feed.current) || (feed.current?.contains(focused) && !screen?.contains(focused));
    if (focusNext.current || stray) document.getElementById(headingId(slot))?.focus({ preventScroll: true });
    focusNext.current = false;
    // `total` and `context` only change the words, never which screen is in view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, slot?.key]);

  // "Deshacer" is offered while the next listing is in view.
  const undoAt = useRef(position);
  useEffect(() => {
    if (undoAt.current !== position) setUndo(null);
    undoAt.current = position;
  }, [position]);

  // Back from a listing opened here, or "Volver a mostrarlas": the feed opens at that listing, loading the pages it
  // needs on the way.
  useEffect(() => {
    if (!hiddenRead) return;
    if (!placeRead.current) {
      placeRead.current = true;
      const place = readStore<Place | null>(PLACE_KEY, null, "session");
      if (place && place.url === currentUrl() && typeof place.id === "string" && Date.now() - place.at < PLACE_TTL_MS) {
        jumpTo.current = { id: place.id, pages: Math.max(1, Math.min(place.pages, 40)) };
      }
      writeStore(PLACE_KEY, null, "session");
    }
    const target = jumpTo.current;
    if (!target) return;
    const index = slots.findIndex((candidate) => candidate.kind === "listing" && candidate.item.id === target.id);
    if (index >= 0) {
      jumpTo.current = null;
      focusNext.current = true;
      setActive(index);
      scrollToSlot(index, false);
      return;
    }
    if (complete || status === "error" || pages >= target.pages + 1) {
      jumpTo.current = null;
      return;
    }
    if (status === "idle" && pages > 0) void load(pages + 1);
  }, [hiddenRead, slots, complete, status, pages, load, scrollToSlot]);

  const hide = (item: DescubrirItem) => {
    setHidden(setListingHidden(item.id, true));
    setUndo(item);
    focusNext.current = true;
  };

  const restore = () => {
    if (!undo) return;
    setHidden(setListingHidden(undo.id, false));
    setUndo(null);
    focusNext.current = true;
  };

  const showSkipped = () => {
    const ids = skipped.map((item) => item.id);
    if (ids.length === 0) return;
    jumpTo.current = { id: ids[0], pages };
    setHidden(showHiddenListings(ids));
  };

  const open = () => {
    const current = slot?.kind === "listing" ? slot.item.id : null;
    if (current) writeStore(PLACE_KEY, { url: currentUrl(), id: current, pages, at: Date.now() } satisfies Place, "session");
    // The listing page's "Volver a resultados" and its arrows belong to a catalog search; from here, back is the
    // browser's own back, which returns to this place.
    writeStore(RESULTS_KEY, null, "session");
  };

  function renderSlot(item: DescubrirSlot, index: number) {
    const current = index === position;
    const id = headingId(item);
    if (item.kind === "listing") {
      const loadingMode: PhotoLoading = current ? (index === 0 ? "first" : "current") : index === position + 1 && !reducedData ? "next" : "idle";
      return <DescubrirScreen item={item.item} headingId={id} current={current} loading={loadingMode} today={today} now={now} source={source} onHide={hide} onOpen={open} />;
    }
    const copy = stopCopy(item, context);
    const home = { label: "Volver al inicio", href: "/" };
    const list = { label: "Volver a la lista", href: exit };
    const next = { label: mode === "nuevo" && item.kind === "today" ? "Ver los de días anteriores" : "Seguir", onClick: () => go(index + 1, true) };
    switch (item.kind) {
      case "today":
        return <DescubrirStop headingId={id} current={current} tone="done" title={copy!.title} body={copy!.body} primary={item.rest === 0 ? undefined : next} secondary={home} />;
      case "checkpoint":
        return <DescubrirStop headingId={id} current={current} tone="pause" title={copy!.title} body={copy!.body} primary={next} secondary={mode === "nuevo" ? home : list} />;
      case "end": {
        const note = hiddenNote(skipped.length);
        return (
          <DescubrirStop
            headingId={id}
            current={current}
            tone="done"
            title={copy!.title}
            body={copy!.body}
            note={note ? (
              <div className="flex flex-col items-center">
                <p className="max-w-[34ch] t-ui text-muted-dark">{note}</p>
                <button type="button" onClick={showSkipped} className="link-on-frame inline-flex min-h-11 items-center font-semibold underline decoration-accent decoration-2 underline-offset-[3px]">
                  Volver a mostrarlas
                </button>
              </div>
            ) : null}
            primary={mode === "nuevo" ? { label: "Ver todo el catálogo", href: CATALOG_PATH } : list}
            secondary={home}
          />
        );
      }
      case "empty":
        return <DescubrirStop headingId={id} current={current} tone="empty" title={copy!.title} body={copy!.body} primary={mode === "nuevo" ? { label: "Ver todo el catálogo", href: CATALOG_PATH } : list} secondary={mode === "nuevo" ? undefined : home} />;
      case "more":
        return status === "error" ? (
          <DescubrirStop
            headingId={id}
            current={current}
            tone="error"
            title={pages === 0 ? "No pudimos cargar las publicaciones" : "No pudimos cargar más publicaciones"}
            body="Revisa tu conexión y vuelve a intentarlo."
            primary={{ label: "Reintentar", onClick: () => void load(pages + 1) }}
            secondary={mode === "nuevo" ? home : list}
          />
        ) : (
          <DescubrirStop headingId={id} current={current} tone="loading" title="Cargando publicaciones…" />
        );
    }
  }

  const atStart = position <= 0;
  const atEnd = position >= slots.length - 1;

  return (
    <div className="relative mx-auto h-full w-full max-w-[520px]">
      <div className="absolute inset-x-0 top-0 z-20 flex h-14 items-center gap-1 bg-frame/90 px-1.5">
        <Link href={exit} aria-label="Salir de Descubrir" title="Salir" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-surface transition-colors duration-120 hover:bg-white/10">
          <X className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate t-ui font-semibold text-surface">Descubrir</h1>
          <p className="truncate text-[13px] leading-[18px] text-muted-dark">
            {title}
            {slot?.kind === "listing" ? <span className="tabular-nums"> · {counterLabel(slot.position, total)}</span> : null}
          </p>
        </div>
        <IconButton
          label="Anterior"
          icon={<ChevronUp aria-hidden="true" />}
          variant="onDark"
          aria-disabled={atStart ? "true" : undefined}
          aria-keyshortcuts="ArrowUp"
          onClick={() => (atStart ? undefined : go(position - 1, false))}
          className="aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
        />
        <IconButton
          label="Siguiente"
          icon={<ChevronDown aria-hidden="true" />}
          variant="onDark"
          aria-disabled={atEnd ? "true" : undefined}
          aria-keyshortcuts="ArrowDown"
          onClick={() => (atEnd ? undefined : go(position + 1, false))}
          className="aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
        />
      </div>

      <div ref={feed} onScroll={onScroll} className="scrollbar-none h-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain [overflow-anchor:none]">
        {slots.map((item, index) => (
          <div key={item.key} data-slot={index} className="h-full snap-start snap-always">
            {Math.abs(index - position) <= 1 ? renderSlot(item, index) : null}
          </div>
        ))}
      </div>

      {undo ? (
        <div className="pointer-events-none absolute inset-x-3 top-16 z-30 flex justify-center">
          <p role="status" className="pointer-events-auto flex max-w-md flex-wrap items-center gap-x-3 rounded-panel border border-white/20 bg-ink px-4 py-1.5 t-ui text-surface shadow-level-1">
            <span className="py-1.5">Listo, no volverás a ver “{undo.title}” en Descubrir.</span>
            <button type="button" onClick={restore} className="inline-flex min-h-11 items-center font-semibold text-surface underline decoration-accent decoration-2 underline-offset-[3px]">
              Deshacer
            </button>
          </p>
        </div>
      ) : null}

      <p aria-live="polite" className="sr-only">{announcement}</p>
      <p className="pointer-events-none fixed bottom-6 left-6 hidden max-w-[24ch] t-meta text-muted-dark xl:block">
        Usa ↑ ↓ para cambiar de publicación y ← → para ver sus fotos.
      </p>
    </div>
  );
}
