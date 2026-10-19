export type AccountFavorite = {
  listing_id: string;
  created_at: string;
  availability: "approved" | "sold" | "unavailable";
  title: string | null;
  slug: string | null;
  price_pen: number | null;
  image_url: string | null;
  // Accounts batch (save-08, save-09, save-11): the price when it was saved, what similar listings share, a note.
  saved_price_pen?: number | null;
  category?: string | null;
  instrument_type?: string | null;
  brand?: string | null;
  note?: string | null;
};
// Entity IDs include historical/seed UUIDs, not only newly generated v4 events.
export const isFavoriteListingId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const optionalText = (value: unknown) => value === undefined || value === null || typeof value === "string";
const optionalNumber = (value: unknown) => value === undefined || value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
export function parseAccountFavorites(value: unknown): { total: number; items: AccountFavorite[] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (!Number.isSafeInteger(data.total) || Number(data.total) < 0 || !Array.isArray(data.items) || data.items.length > 24) return null;
  for (const row of data.items) {
    if (!row || typeof row !== "object" || typeof row.listing_id !== "string" || typeof row.created_at !== "string" || !["approved", "sold", "unavailable"].includes(row.availability)) return null;
    if (!optionalText(row.note)) return null;
    if (row.availability === "unavailable") {
      if ([row.title, row.slug, row.price_pen, row.image_url, row.saved_price_pen, row.category, row.instrument_type, row.brand].some((field) => field !== null && field !== undefined)) return null;
    } else if (typeof row.title !== "string" || typeof row.slug !== "string" || typeof row.price_pen !== "number" || !Number.isFinite(row.price_pen) || row.price_pen < 0 || (row.image_url !== null && typeof row.image_url !== "string")
      || !optionalNumber(row.saved_price_pen) || !optionalText(row.category) || !optionalText(row.instrument_type) || !optionalText(row.brand)) return null;
  }
  return data as { total: number; items: AccountFavorite[] };
}

// save-08: "Antes S/ 2,500 → S/ 2,100" when the price is lower than when the favorite was saved.
export function favoritePriceDrop(item: Pick<AccountFavorite, "price_pen" | "saved_price_pen">) {
  return typeof item.saved_price_pen === "number" && typeof item.price_pen === "number" && item.price_pen < item.saved_price_pen
    ? item.saved_price_pen
    : null;
}

// big-04: public cards for device favorites and recently viewed listings.
export type PublicListingCard = {
  id: string;
  slug: string;
  title: string;
  price_pen: number | null;
  availability: "approved" | "sold";
  category: string | null;
  instrument_type: string | null;
  brand: string | null;
  city: string | null;
  condition: string | null;
  stock_state: string | null;
  image_url: string | null;
};
export function parsePublicListingCards(value: unknown): PublicListingCard[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is PublicListingCard => Boolean(row) && typeof row === "object"
    && isFavoriteListingId(row.id) && typeof row.slug === "string" && typeof row.title === "string"
    && (row.availability === "approved" || row.availability === "sold") && optionalNumber(row.price_pen)
    && optionalText(row.image_url) && optionalText(row.category) && optionalText(row.city));
}

// save-11: what the shared list page shows.
export type SharedFavoriteList = {
  owner_name: string | null;
  items: Array<{ id: string; slug: string; title: string; price_pen: number | null; note: string | null; city: string | null; condition: string | null; image_url: string | null }>;
};
export function parseSharedFavoriteList(value: unknown): SharedFavoriteList | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (!optionalText(data.owner_name) || !Array.isArray(data.items)) return null;
  const items = data.items.filter((row) => row && typeof row === "object" && isFavoriteListingId(row.id) && typeof row.slug === "string" && typeof row.title === "string" && optionalText(row.note) && optionalNumber(row.price_pen));
  return { owner_name: (data.owner_name as string | null) ?? null, items: items as SharedFavoriteList["items"] };
}

// A sold favorite offers similar listings: same type (or category) and brand, in the catalog.
export function similarListingsPath(item: { category?: string | null; instrument_type?: string | null; brand?: string | null }) {
  const params = new URLSearchParams();
  if (item.category) params.set("category", item.category);
  if (item.instrument_type) params.set("instrument_type", item.instrument_type);
  if (item.brand) params.set("brand", item.brand);
  return params.size ? `/listados?${params.toString()}` : "/listados";
}
