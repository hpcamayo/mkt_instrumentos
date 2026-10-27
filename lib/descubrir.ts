import { catalogHref, catalogSearchParams, catalogTitle, formatNumber } from "@/lib/catalog-filters";
import { timeAgo } from "@/lib/listing-page";
import { MAX_LISTING_PHOTOS } from "@/lib/listing-submission";
import { parseListingFilters, type ListingCardData, type ListingFilters } from "@/lib/listings";
import { LISTINGS_PAGE_SIZE } from "@/lib/pagination";

// Descubrir (big-02, maybes batch, docs/ux-effortless/maybes-descubrir.md): one listing per screen, swipe up for the
// next and sideways for its photos, every gesture also a button. Two feeds: "Lo nuevo" from the home (the listings
// published in the last days, newest first, with a stop after today's) and "Ver en Descubrir" from any results list
// (that list, in its order, to its end). Pure, so the page, the feed, the route and the tests share one definition.

export const DESCUBRIR_PATH = "/descubrir";
export type DescubrirMode = "nuevo" | "resultados";

// A card's data with every photo, up to the listing form's ten. `reserved` is the reservation batch's flag: optional,
// so the feed shows "Reservado" as soon as the catalog query returns it, and nothing until then.
export type DescubrirItem = ListingCardData & { reserved?: boolean };

export const DESCUBRIR_PHOTOS = MAX_LISTING_PHOTOS;
export const DESCUBRIR_PAGE_SIZE = LISTINGS_PAGE_SIZE;
// A pause every 48 listings in a long list: how far you are, and the way out.
export const CHECKPOINT_EVERY = 48;
// "Lo nuevo": the last 7 Lima days; when they hold fewer than 12 listings, the last 30, so a quiet week still has a
// feed. The route refuses a start further back than 31 days.
export const NEW_WINDOW_DAYS = 7;
export const SPARSE_WINDOW_DAYS = 30;
export const SPARSE_MINIMUM = 12;
export const MAX_WINDOW_DAYS = 31;

const NEWEST: ListingFilters = { cities: [], conditions: [], advanced: {}, sort: "newest" };
const DAY_MS = 86_400_000;
const limaDays = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" });

// The calendar day in Lima, "2026-10-27".
export function limaDay(time: number | Date) {
  return limaDays.format(time);
}

export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function shiftDay(day: string, days: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

// Whole calendar days from one day to another: 0 the same day, 1 the next.
export function dayDistance(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

// The first day of a window of `days` days that ends today.
export function windowStart(today: string, days: number) {
  return shiftDay(today, -(days - 1));
}

export function windowDays(since: string, today: string) {
  return dayDistance(since, today) + 1;
}

// Midnight in Lima. Peru keeps UTC-5 all year (no daylight saving time since 1994).
export function limaMidnight(day: string) {
  return `${day}T00:00:00-05:00`;
}

// The route's "desde": absent (no window), a Lima day from 31 days ago to today, or refused.
export function readSince(value: string | null | undefined, now: number): string | null | "invalid" {
  if (value === null || value === undefined) return null;
  if (!isDayKey(value)) return "invalid";
  const distance = dayDistance(value, limaDay(now));
  return distance >= 0 && distance < MAX_WINDOW_DAYS ? value : "invalid";
}

// "Ver en Descubrir" from a results list carries its filters and sort; the home's entry carries nothing.
export function descubrirHref(filters?: ListingFilters) {
  if (!filters) return DESCUBRIR_PATH;
  return `${DESCUBRIR_PATH}?${new URLSearchParams([["modo", "resultados"], ...catalogSearchParams(filters)])}`;
}

export function readDescubrirRequest(params: Record<string, string | string[] | undefined>): { mode: DescubrirMode; filters: ListingFilters } {
  const mode = Array.isArray(params.modo) ? params.modo[0] : params.modo;
  if (mode !== "resultados") return { mode: "nuevo", filters: NEWEST };
  return { mode: "resultados", filters: parseListingFilters(params) };
}

// A further page of the feed: the catalog's own page route, with every photo and the window's first day.
export function feedPageUrl({ filters, since, page }: { filters: ListingFilters; since: string | null; page: number }) {
  const params = catalogSearchParams(filters);
  params.set("fotos", "todas");
  if (since) params.set("desde", since);
  if (page > 1) params.set("page", String(page));
  return `/api/catalog/page?${params}`;
}

// "Salir" leads back where the feed came from: the home, or the results list (its first page).
export function exitHref(mode: DescubrirMode, filters: ListingFilters) {
  return mode === "nuevo" ? "/" : catalogHref(filters);
}

// The top bar's name for the feed: "Lo nuevo", or the results list's own heading ("Fender en Guitarras · Lima").
export function feedTitle(mode: DescubrirMode, filters: ListingFilters) {
  return mode === "nuevo" ? "Lo nuevo" : catalogTitle(filters);
}

export function dayOf(item: Pick<ListingCardData, "published_at">) {
  if (!item.published_at) return null;
  const time = Date.parse(item.published_at);
  return Number.isFinite(time) ? limaDay(time) : null;
}

// Calendar days, so "hoy" means the same here as in "Viste todo lo nuevo de hoy"; older dates read as on the listing
// page (list-04).
export function publishedLabel(item: Pick<ListingCardData, "published_at">, today: string, now: number) {
  const day = dayOf(item);
  if (!day || !item.published_at) return null;
  const days = dayDistance(day, today);
  if (days <= 0) return "Publicado hoy";
  if (days === 1) return "Publicado ayer";
  if (days < 14) return `Publicado hace ${days} días`;
  return `Publicado ${timeAgo(item.published_at, now)}`;
}

export function counterLabel(position: number, total: number | null) {
  return total === null ? formatNumber(position) : `${formatNumber(position)} de ${formatNumber(total)}`;
}

const publications = (count: number) => (count === 1 ? "1 publicación" : `${formatNumber(count)} publicaciones`);

export type DescubrirSlot =
  | { kind: "listing"; key: string; item: DescubrirItem; position: number }
  // "Lo nuevo" after its last listing of today, when earlier days follow.
  | { kind: "today"; key: string; seen: number; rest: number | null }
  | { kind: "checkpoint"; key: string; seen: number; total: number | null }
  // Waiting for the next page (or offering to try again).
  | { kind: "more"; key: string }
  | { kind: "end"; key: string; seen: number }
  | { kind: "empty"; key: string };

// The screens in order: one per listing, the stop after today's listings, a pause every 48, then the end (or the next
// page on its way). `items` are the listings to show (those hidden with "No me interesa" already left out) and
// `total` how many the whole feed shows, when known.
export function feedSlots({ items, mode, today, total, complete }: { items: DescubrirItem[]; mode: DescubrirMode; today: string; total: number | null; complete: boolean }): DescubrirSlot[] {
  if (complete && items.length === 0) return [{ kind: "empty", key: "vacio" }];
  const slots: DescubrirSlot[] = [];
  const firstEarlier = mode === "nuevo" ? items.findIndex((item) => dayOf(item) !== today) : -1;
  items.forEach((item, index) => {
    if (index > 0 && index === firstEarlier) slots.push({ kind: "today", key: "hoy", seen: index, rest: total === null ? null : Math.max(0, total - index) });
    else if (index > 0 && index % CHECKPOINT_EVERY === 0) slots.push({ kind: "checkpoint", key: `pausa-${index}`, seen: index, total });
    slots.push({ kind: "listing", key: item.id, item, position: index + 1 });
  });
  slots.push(complete ? { kind: "end", key: "fin", seen: items.length } : { kind: "more", key: "mas" });
  return slots;
}

export type StopCopy = { title: string; body: string };

// Every stop says what is true: what was seen, of what, and what follows.
export function stopCopy(slot: DescubrirSlot, context: { mode: DescubrirMode; windowDays: number; listTitle: string }): StopCopy | null {
  const window = `los últimos ${context.windowDays} días`;
  switch (slot.kind) {
    case "today":
      return {
        title: "Viste todo lo nuevo de hoy",
        body: slot.rest === null ? `Sigue para ver lo de ${window}.` : slot.rest === 0 ? "No hay más." : `Sigue para ver ${slot.rest === 1 ? "1 más" : `${formatNumber(slot.rest)} más`} de ${window}.`,
      };
    case "checkpoint":
      return {
        title: slot.total === null ? `Llevas ${formatNumber(slot.seen)}` : `Llevas ${formatNumber(slot.seen)} de ${formatNumber(slot.total)}`,
        body: context.mode === "nuevo" ? "Sigue para ver más, o vuelve al inicio." : "Sigue para ver más, o vuelve a la lista para cambiar los filtros.",
      };
    case "end":
      return context.mode === "nuevo"
        ? { title: "Viste todo lo nuevo", body: slot.seen === 0 ? `Nada más de ${window}.` : `${slot.seen === 1 ? "La publicación" : `Las ${formatNumber(slot.seen)} publicaciones`} de ${window}.` }
        : { title: "Viste todos los resultados", body: `${publications(slot.seen)} en ${context.listTitle}.` };
    case "empty":
      return context.mode === "nuevo"
        ? { title: "No hay publicaciones nuevas", body: `No se publicó nada en ${window}.` }
        : { title: "Esta lista no tiene publicaciones", body: "Vuelve a la lista para cambiar los filtros." };
    default:
      return null;
  }
}

// What a screen reader hears when the screen changes: "3 de 24: Fender Stratocaster", or the stop's title.
export function slotAnnouncement(slot: DescubrirSlot, total: number | null, context: { mode: DescubrirMode; windowDays: number; listTitle: string }) {
  if (slot.kind === "listing") return `${counterLabel(slot.position, total)}: ${slot.item.title}`;
  if (slot.kind === "more") return "Cargando más publicaciones";
  return stopCopy(slot, context)?.title ?? "";
}

// "Volver a mostrarlas" on the end screen: how many of this feed's listings were left out with "No me interesa".
export function hiddenNote(count: number) {
  if (count <= 0) return null;
  return count === 1 ? "Omitimos 1 que marcaste con “No me interesa”." : `Omitimos ${formatNumber(count)} que marcaste con “No me interesa”.`;
}
