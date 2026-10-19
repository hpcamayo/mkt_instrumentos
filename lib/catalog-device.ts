import type { ListingCardData } from "@/lib/listings";

// What Laria remembers on this device only (Effortless Laria, find batch): the listings recently opened (FIND 11), the
// taste signals behind "Para ti" (BIG 01), the optional "¿Qué tocas?" answer, the last visit, the comparison tray
// (FIND 12) and the results a listing was opened from (FIND 09). Nothing here is sent to Laria's servers; every read
// and write tolerates storage being unavailable (private windows, blocked site data). Browser-only helpers, pure
// ranking functions.

export const RECENT_KEY = "laria:vistos";
export const TASTE_KEY = "laria:gustos";
export const INTEREST_KEY = "laria:que-tocas";
export const PERSONALIZE_KEY = "laria:sin-personalizar";
export const LAST_VISIT_KEY = "laria:ultima-visita";
export const COMPARE_KEY = "laria:comparar";
export const RESULTS_KEY = "laria:resultados";
export const RESTORE_KEY = "laria:volver-a";
export const RECENT_LIMIT = 12;
export const COMPARE_LIMIT = 3;
export const DEVICE_EVENT = "laria:device";

// A card's worth of a listing: enough to draw it again without asking the server.
export type RememberedListing = {
  id: string;
  slug: string;
  title: string;
  price_pen: number | null;
  category: string;
  instrument_type: string | null;
  brand: string | null;
  city: string;
  seller_type: "individual" | "store";
  verified: boolean;
  photo: string | null;
  at: number;
};

export function readStore<T>(key: string, fallback: T, storage: "local" | "session" = "local"): T {
  try {
    const raw = (storage === "local" ? window.localStorage : window.sessionStorage).getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStore(key: string, value: unknown, storage: "local" | "session" = "local") {
  try {
    const target = storage === "local" ? window.localStorage : window.sessionStorage;
    if (value === null) target.removeItem(key);
    else target.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(DEVICE_EVENT, { detail: key }));
  } catch {
    // Storage unavailable: nothing is remembered, and nothing breaks.
  }
}

export function rememberable(listing: ListingCardData): RememberedListing {
  const store = Array.isArray(listing.stores) ? listing.stores[0] : listing.stores;
  return {
    id: listing.id,
    slug: listing.slug,
    title: listing.title,
    price_pen: listing.price_pen,
    category: listing.category,
    instrument_type: listing.instrument_type,
    brand: listing.brand,
    city: listing.city,
    seller_type: listing.seller_type,
    verified: listing.seller_type === "store" && store?.is_verified === true,
    photo: listing.listing_photos[0]?.image_url ?? null,
    at: Date.now(),
  };
}

// Newest first, one entry per listing, capped.
export function addRecent(list: readonly RememberedListing[], item: RememberedListing, limit = RECENT_LIMIT) {
  return [item, ...list.filter((entry) => entry.id !== item.id)].slice(0, limit);
}

// Taste: counts of what this person opened, decayed so recent interest weighs more. Keys are "c:<category>",
// "t:<type>", "b:<brand>", "l:<city>"; prices keep a running median band.
export type Taste = { weights: Record<string, number>; prices: number[]; updated: number };
export const EMPTY_TASTE: Taste = { weights: {}, prices: [], updated: 0 };

export function addTaste(taste: Taste, item: Pick<RememberedListing, "category" | "instrument_type" | "brand" | "city" | "price_pen">, now = Date.now()): Taste {
  const days = taste.updated ? Math.max(0, (now - taste.updated) / 86_400_000) : 0;
  const decay = Math.pow(0.5, days / 14);
  const weights: Record<string, number> = {};
  for (const [key, value] of Object.entries(taste.weights)) {
    const next = value * decay;
    if (next >= 0.05) weights[key] = next;
  }
  const bump = (key: string | null | undefined) => {
    if (key) weights[key] = (weights[key] ?? 0) + 1;
  };
  bump(`c:${item.category}`);
  if (item.instrument_type && item.instrument_type !== "other") bump(`t:${item.instrument_type}`);
  if (item.brand) bump(`b:${item.brand.trim().toLowerCase()}`);
  bump(`l:${item.city}`);
  const prices = item.price_pen ? [...taste.prices, item.price_pen].slice(-20) : taste.prices;
  return { weights, prices, updated: now };
}

export function tasteIsEmpty(taste: Taste, interest: readonly string[] = []) {
  return Object.keys(taste.weights).length === 0 && interest.length === 0;
}

type Rankable = Pick<ListingCardData, "id" | "category" | "instrument_type" | "brand" | "city" | "price_pen" | "published_at" | "view_count"> & { seller_key?: string };

function median(values: readonly number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// "Para ti" (BIG 01): how well a listing fits what this person opened (types, brands, place, price band) and their
// "¿Qué tocas?" answer (categories), plus a little freshness. With no signals, newest first and most viewed.
export function scoreListing(listing: Rankable, taste: Taste, interest: readonly string[], now = Date.now()) {
  const w = taste.weights;
  let score = 0;
  score += (w[`c:${listing.category}`] ?? 0) * 1;
  if (listing.instrument_type) score += (w[`t:${listing.instrument_type}`] ?? 0) * 1.5;
  if (listing.brand) score += (w[`b:${listing.brand.trim().toLowerCase()}`] ?? 0) * 1.2;
  score += (w[`l:${listing.city}`] ?? 0) * 0.6;
  if (interest.includes(listing.category)) score += 3;
  const center = median(taste.prices);
  if (center && listing.price_pen) {
    const ratio = listing.price_pen / center;
    if (ratio >= 0.5 && ratio <= 2) score += 1;
  }
  const ageDays = listing.published_at ? Math.max(0, (now - Date.parse(listing.published_at)) / 86_400_000) : 60;
  score += Math.max(0, 1 - ageDays / 30) * 1.5;
  score += Math.min(1, (listing.view_count ?? 0) / 200) * 0.5;
  return score;
}

// Never two listings from the same seller in a row: each next pick is the best one whose seller differs from the
// previous pick's, when there is one.
export function spreadSellers<T extends { seller_key?: string }>(items: readonly T[]) {
  const pool = [...items];
  const result: T[] = [];
  while (pool.length > 0) {
    const previous = result.at(-1)?.seller_key;
    const index = previous ? pool.findIndex((item) => item.seller_key !== previous) : 0;
    result.push(...pool.splice(index === -1 ? 0 : index, 1));
  }
  return result;
}

export function rankForYou<T extends Rankable>(items: readonly T[], taste: Taste, interest: readonly string[], now = Date.now()) {
  const scored = items.map((item) => ({ item, score: scoreListing(item, taste, interest, now) }));
  scored.sort((a, b) => b.score - a.score || (b.item.published_at ?? "").localeCompare(a.item.published_at ?? "") || a.item.id.localeCompare(b.item.id));
  return spreadSellers(scored.map((entry) => entry.item));
}

// Why the order is what it is, in words ("¿Por qué veo esto?").
export function forYouReasons(taste: Taste, interest: readonly string[], labels: { category: (value: string) => string; type: (value: string) => string }) {
  const top = Object.entries(taste.weights).sort((a, b) => b[1] - a[1]);
  const pick = (prefix: string) => top.filter(([key]) => key.startsWith(prefix)).slice(0, 2).map(([key]) => key.slice(2));
  const reasons: string[] = [];
  const types = pick("t:").map(labels.type);
  const categories = [...new Set([...interest, ...pick("c:")])].slice(0, 3).map(labels.category);
  if (types.length) reasons.push(`Tipos que miraste: ${types.join(", ")}`);
  else if (categories.length) reasons.push(`Categorías: ${categories.join(", ")}`);
  const brands = pick("b:");
  if (brands.length) reasons.push(`Marcas que miraste: ${brands.map((brand) => brand.replace(/\b\w/g, (letter) => letter.toUpperCase())).join(", ")}`);
  const places = pick("l:");
  if (places.length) reasons.push(`Lugares: ${places.join(", ")}`);
  const center = median(taste.prices);
  if (center) reasons.push(`Precios cerca de lo que miraste`);
  return reasons;
}

// FIND 09: the results a listing was opened from, so its page can lead back to them and to the next and previous one.
// opened: the listing opened straight from the results (going back is then the browser's back).
export type ResultsTrail = { href: string; label: string; slugs: string[]; titles: Record<string, string>; scrollY: number; at: number; opened?: string | null };

export function neighbours(trail: ResultsTrail | null, slug: string) {
  if (!trail) return null;
  const index = trail.slugs.indexOf(slug);
  if (index === -1) return null;
  return {
    index,
    total: trail.slugs.length,
    previous: index > 0 ? trail.slugs[index - 1] : null,
    next: index < trail.slugs.length - 1 ? trail.slugs[index + 1] : null,
  };
}
