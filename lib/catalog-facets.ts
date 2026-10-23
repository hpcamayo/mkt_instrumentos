import { getInstrumentFilterGroup } from "@/lib/instrument-filters";
import { instrumentTypesByCategory } from "@/lib/listing-submission";
import type { ListingFilters } from "@/lib/listings";
import type { Json } from "@/lib/supabase/database.types";

// FIND 05, 07 and 08 (Effortless Laria): what the catalog's filters count. public.catalog_facets counts each facet
// without its own filter, so an option says how many results choosing it gives, and the phone sheet's button can say
// "Ver 12 resultados" before it is pressed. This module reaches the browser (the sheet fetches counts for its draft).

export type FacetLocation = { city: string; region: string | null; count: number };
export type PriceSpread = { min: number; max: number; low: number; high: number; count: number };

export type CatalogFacetData = {
  total: number;
  category: Record<string, number>;
  instrument_type: Record<string, number>;
  condition: Record<string, number>;
  seller_type: Record<string, number>;
  locations: FacetLocation[];
  brands: { brand: string; count: number }[];
  price: PriceSpread | null;
  advanced: Record<string, Record<string, number>>;
};

// The attributes the facets show: the chosen type's, or those of a category with a single type.
export function facetAttributeKeys(filters: Pick<ListingFilters, "category" | "instrumentType">) {
  const types = filters.category ? (instrumentTypesByCategory[filters.category] ?? []).filter((type) => type !== "other") : [];
  const type = filters.instrumentType ?? (types.length === 1 ? types[0] : undefined);
  return (type ? getInstrumentFilterGroup(type)?.filters ?? [] : []).map((filter) => filter.key);
}

// The filters as public.catalog_facets reads them.
export function facetFiltersJson(filters: ListingFilters): Json {
  const json: Record<string, Json> = {};
  if (filters.category) json.category = filters.category;
  if (filters.instrumentType) json.instrument_type = filters.instrumentType;
  if (filters.conditions.length) json.conditions = filters.conditions;
  if (filters.cities.length) json.cities = filters.cities;
  if (filters.brand) json.brand = filters.brand;
  if (filters.sellerType) json.seller_type = filters.sellerType;
  if (filters.minPrice !== undefined) json.min_price = filters.minPrice;
  if (filters.maxPrice !== undefined) json.max_price = filters.maxPrice;
  if (Object.keys(filters.advanced).length) json.advanced = filters.advanced as Json;
  return json;
}

const record = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, count]) => typeof count === "number")) as Record<string, number>;
};

// The RPC's JSON, checked: anything malformed counts as "no counts" and the filters show without numbers.
export function readCatalogFacets(value: unknown): CatalogFacetData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.total !== "number") return null;
  const price = data.price && typeof data.price === "object" ? (data.price as Record<string, unknown>) : null;
  return {
    total: data.total,
    category: record(data.category),
    instrument_type: record(data.instrument_type),
    condition: record(data.condition),
    seller_type: record(data.seller_type),
    locations: Array.isArray(data.locations)
      ? data.locations.flatMap((item) => (item && typeof item.city === "string" && typeof item.count === "number" ? [{ city: item.city, region: typeof item.region === "string" ? item.region : null, count: item.count }] : []))
      : [],
    brands: Array.isArray(data.brands)
      ? data.brands.flatMap((item) => (item && typeof item.brand === "string" && typeof item.count === "number" ? [{ brand: item.brand, count: item.count }] : []))
      : [],
    price: price && typeof price.count === "number" && price.count > 0 && typeof price.min === "number" && typeof price.max === "number"
      ? { min: price.min, max: price.max, low: Number(price.low ?? price.min), high: Number(price.high ?? price.max), count: price.count }
      : null,
    advanced: Object.fromEntries(
      Object.entries(data.advanced && typeof data.advanced === "object" && !Array.isArray(data.advanced) ? data.advanced : {}).map(([key, counts]) => [key, record(counts)]),
    ),
  };
}

type RpcClient = { rpc: (name: "catalog_facets", args: { p_filters: Json; p_q?: string; p_attribute_keys?: string[] }) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

export async function fetchCatalogFacets(supabase: RpcClient, filters: ListingFilters): Promise<CatalogFacetData | null> {
  // Incident recovery: optional counts must be removable before issuing the expensive RPC.
  if (process.env.LARIA_CATALOG_ENRICHMENT_DISABLED === "true") return null;
  const { data, error } = await supabase.rpc("catalog_facets", {
    p_filters: facetFiltersJson(filters),
    ...(filters.q ? { p_q: filters.q } : {}),
    p_attribute_keys: facetAttributeKeys(filters),
  });
  if (error) {
    console.error(`Catalog: the facet counts failed: ${error.message}`);
    return null;
  }
  return readCatalogFacets(data);
}

// Price shortcuts tuned to what is on sale (FIND 08): the spread's thirds, rounded to round numbers ("Hasta S/ 500",
// "S/ 500 – 1,500", "Más de S/ 1,500"). None when there are too few prices or they are all alike.
export function roundPrice(value: number) {
  if (value <= 0) return 0;
  const step = value < 200 ? 10 : value < 1000 ? 50 : value < 5000 ? 100 : value < 20000 ? 500 : 1000;
  return Math.max(step, Math.round(value / step) * step);
}

export type PriceShortcut = { label: string; min?: number; max?: number };

export function priceShortcuts(spread: PriceSpread | null, format: (value: number) => string): PriceShortcut[] {
  if (!spread || spread.count < 3) return [];
  const low = roundPrice(spread.low);
  const high = roundPrice(spread.high);
  if (low <= 0 || high <= low) return [];
  return [
    { label: `Hasta ${format(low)}`, max: low },
    { label: `${format(low)} – ${format(high).replace(/^S\/\s?/, "")}`, min: low, max: high },
    { label: `Más de ${format(high)}`, min: high },
  ];
}
