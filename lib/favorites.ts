export type AccountFavorite = { listing_id: string; created_at: string; availability: "approved" | "sold" | "unavailable"; title: string | null; slug: string | null; price_pen: number | null; image_url: string | null };
// Entity IDs include historical/seed UUIDs, not only newly generated v4 events.
export const isFavoriteListingId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function parseAccountFavorites(value: unknown): { total: number; items: AccountFavorite[] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (!Number.isSafeInteger(data.total) || Number(data.total) < 0 || !Array.isArray(data.items) || data.items.length > 24) return null;
  for (const row of data.items) {
    if (!row || typeof row !== "object" || typeof row.listing_id !== "string" || typeof row.created_at !== "string" || !["approved", "sold", "unavailable"].includes(row.availability)) return null;
    if (row.availability === "unavailable") {
      if ([row.title, row.slug, row.price_pen, row.image_url].some((field) => field !== null)) return null;
    } else if (typeof row.title !== "string" || typeof row.slug !== "string" || typeof row.price_pen !== "number" || !Number.isFinite(row.price_pen) || row.price_pen < 0 || (row.image_url !== null && typeof row.image_url !== "string")) return null;
  }
  return data as { total: number; items: AccountFavorite[] };
}
