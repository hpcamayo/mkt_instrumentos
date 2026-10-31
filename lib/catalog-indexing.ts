import { getCategoryLandingByValue } from "@/lib/category-pages";
import { instrumentFilterGroups } from "@/lib/instrument-filters";

type SearchParams = Record<string, string | string[] | undefined>;

// Shared by metadata and the early crawler guard. Page numbers, attribution and unknown keys do not make a filter.
export const catalogFilterKeys: ReadonlySet<string> = new Set([
  "q", "category", "location", "city", "condition", "brand", "seller_type", "instrument_type",
  "min_price", "max_price", "sort",
  // listing-details (features/marketplace): "Envía a provincia", "Se puede probar", "Acepta cambios" (lib/listing-flags.ts).
  "opciones",
  ...instrumentFilterGroups.flatMap((group) => group.filters.map((filter) => filter.key)),
]);

export function catalogParamValues(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

export function activeCatalogFilterKeys(searchParams: SearchParams) {
  return Object.keys(searchParams).filter((key) => catalogFilterKeys.has(key) && catalogParamValues(searchParams[key]).length > 0);
}

export function catalogIndexing(searchParams: SearchParams) {
  const keys = activeCatalogFilterKeys(searchParams);
  // Category-only catalog aliases, including pagination, have a canonical landing rather than noindex.
  const landing = keys.length === 1 && keys[0] === "category"
    ? getCategoryLandingByValue(catalogParamValues(searchParams.category)[0]) : null;
  return { keys, landing, filtered: keys.length > 0 && !landing };
}
