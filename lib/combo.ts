// buy-01 "Combo" (docs/feature-ideas/listing-details.md): a buyer's list of one seller's listings, kept on the device
// only (no account, nothing sent to Laria), sent to the seller as one WhatsApp message (lib/contact-message.ts
// comboContactMessage). A seller may declare a discount for buying several (seller_bundle_offers); Laria only shows
// it, the seller honours it. Pure, so the listing page, the store page and the tests share it.

export type ComboItem = { id: string; title: string; slug: string; price_pen: number | null; addedAt: string };
export type ComboSeller = { name: string; items: ComboItem[] };
export type Combos = Record<string, ComboSeller>;
export type BundleOffer = { discount_percent: number; min_items: number };

export const COMBO_STORAGE_KEY = "laria:combos:v1";
export const COMBO_MAX_ITEMS = 10;
// A list left alone for a month is old news: the gear may be sold.
export const COMBO_MAX_AGE_DAYS = 30;

// One seller, one list: a store by its id, a Particular by their account.
export function comboSellerKey(listing: { store_id?: string | null; owner_user_id?: string | null }) {
  if (listing.store_id) return `tienda:${listing.store_id}`;
  if (listing.owner_user_id) return `persona:${listing.owner_user_id}`;
  return null;
}

// The stored lists, read leniently: unknown shapes dropped, items older than COMBO_MAX_AGE_DAYS left out.
export function parseCombos(raw: string | null, now = Date.now()): Combos {
  if (!raw) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const combos: Combos = {};
  const oldest = now - COMBO_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const seller = entry as { name?: unknown; items?: unknown };
    const items = (Array.isArray(seller.items) ? seller.items : [])
      .filter((item): item is ComboItem =>
        item && typeof item === "object" && typeof item.id === "string" && typeof item.title === "string" && typeof item.slug === "string" &&
        (item.price_pen === null || typeof item.price_pen === "number") && typeof item.addedAt === "string" && Date.parse(item.addedAt) >= oldest)
      .slice(0, COMBO_MAX_ITEMS);
    if (items.length) combos[key] = { name: typeof seller.name === "string" ? seller.name : "", items };
  }
  return combos;
}

export function inCombo(combos: Combos, sellerKey: string, listingId: string) {
  return Boolean(combos[sellerKey]?.items.some((item) => item.id === listingId));
}

// Adds or removes one listing. Adding to a full list is refused (the caller says so); the list keeps the order added.
export function toggleComboItem(combos: Combos, sellerKey: string, sellerName: string, item: Omit<ComboItem, "addedAt">, now = new Date()): { combos: Combos; full: boolean } {
  const current = combos[sellerKey]?.items ?? [];
  if (current.some((entry) => entry.id === item.id)) return { combos: withItems(combos, sellerKey, sellerName, current.filter((entry) => entry.id !== item.id)), full: false };
  if (current.length >= COMBO_MAX_ITEMS) return { combos, full: true };
  return { combos: withItems(combos, sellerKey, sellerName, [...current, { ...item, addedAt: now.toISOString() }]), full: false };
}

export function removeComboItem(combos: Combos, sellerKey: string, listingId: string) {
  const seller = combos[sellerKey];
  if (!seller) return combos;
  return withItems(combos, sellerKey, seller.name, seller.items.filter((item) => item.id !== listingId));
}

function withItems(combos: Combos, sellerKey: string, name: string, items: ComboItem[]): Combos {
  const next = { ...combos };
  if (items.length) next[sellerKey] = { name, items };
  else delete next[sellerKey];
  return next;
}

// The sum of published prices, or null when any item has none.
export function comboTotal(items: readonly { price_pen: number | null }[]) {
  return items.every((item) => item.price_pen !== null) ? items.reduce((total, item) => total + (item.price_pen ?? 0), 0) : null;
}

// "10% de descuento llevando 2 o más": the seller's words, never a price Laria computes as owed.
export function bundleOfferText(offer: BundleOffer) {
  return `${offer.discount_percent}% de descuento llevando ${offer.min_items} o más`;
}

export function readBundleOffer(value: unknown): BundleOffer | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const { discount_percent, min_items } = row as Record<string, unknown>;
  if (typeof discount_percent !== "number" || typeof min_items !== "number") return null;
  if (discount_percent < 5 || discount_percent > 30 || min_items < 2 || min_items > 5) return null;
  return { discount_percent, min_items };
}
