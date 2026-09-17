import type { ListingFilters } from "@/lib/listings";

export const eventSources = ["home", "catalog", "recommendations", "detail", "seller_panel", "store", "account", "submission", "other"] as const;
export type EventSource = typeof eventSources[number];
export type ClientEvent = {
  type: "listing_impression" | "listing_view" | "store_view" | "search" | "filter_applied";
  eventId: string;
  listingId?: string;
  storeId?: string;
  source?: EventSource;
  searchReceipt?: string;
};
export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function parseClientEvent(value: unknown): ClientEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (Object.keys(event).some((key) => !["type", "eventId", "listingId", "storeId", "source", "searchReceipt"].includes(key))) return null;
  if (!isUuid(event.eventId) || (event.source !== undefined && !eventSources.includes(event.source as EventSource))) return null;
  if (event.type === "listing_view" || event.type === "listing_impression") {
    if (!isUuid(event.listingId) || event.storeId !== undefined || event.searchReceipt !== undefined) return null;
  } else if (event.type === "store_view") {
    if (!isUuid(event.storeId) || event.listingId !== undefined || event.searchReceipt !== undefined) return null;
  } else if (event.type === "search" || event.type === "filter_applied") {
    if (event.listingId !== undefined || event.storeId !== undefined || typeof event.searchReceipt !== "string" || event.searchReceipt.length > 8192) return null;
  } else return null;
  return event as ClientEvent;
}

export function searchEventMetadata(filters: ListingFilters, resultCount: number) {
  // Only fields consumed by the actual catalog; there is no free-text q search.
  const supported: Record<string, string | number | Record<string, string | number | boolean | string[]>> = { sort: filters.sort };
  for (const [key, value] of Object.entries({ category: filters.category, city: filters.city, brand: filters.brand, condition: filters.condition, seller_type: filters.sellerType, instrument_type: filters.instrumentType, min_price: filters.minPrice, max_price: filters.maxPrice })) {
    if (value !== undefined) supported[key] = typeof value === "string" ? value.slice(0, 200) : value;
  }
  const advanced: Record<string, string | number | boolean | string[]> = {};
  for (const [key, value] of Object.entries(filters.advanced)) {
    advanced[key] = Array.isArray(value) ? value.slice(0, 20).map((item) => item.slice(0, 100)) : typeof value === "string" ? value.slice(0, 100) : value;
  }
  if (Object.keys(advanced).length) supported.advanced = advanced;
  return { query: (filters.brand ?? "").slice(0, 200), filters: supported, result_count: Math.min(10000000, Math.max(0, Math.trunc(resultCount))), zero_results: resultCount === 0 };
}
