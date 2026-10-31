// reach-02 "Catálogo para redes": the owner's view of the store's feed (get_store_feed_settings) and whether Laria's own
// Google Merchant Center account is live. LARIA_GOOGLE_SHOPPING_ACTIVE=true only once Laria's account reads
// /api/feeds/laria; until then the store page says it is not active yet.

export type FeedSettings = {
  enabled: boolean;
  enabledAt: string | null;
  storeActive: boolean;
  items: number;
  outOfStock: number;
  withoutPhoto: number;
  withoutPrice: number;
  withoutBrand: number;
};

function count(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

export function parseFeedSettings(value: unknown): FeedSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.enabled !== "boolean") return null;
  return {
    enabled: record.enabled,
    enabledAt: typeof record.enabled_at === "string" ? record.enabled_at : null,
    storeActive: record.store_active === true,
    items: count(record.items),
    outOfStock: count(record.out_of_stock),
    withoutPhoto: count(record.without_photo),
    withoutPrice: count(record.without_price),
    withoutBrand: count(record.without_brand),
  };
}

export function googleShoppingActive() {
  return process.env.LARIA_GOOGLE_SHOPPING_ACTIVE === "true";
}
