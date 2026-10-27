import { catalogHref, catalogSearchParams } from "@/lib/catalog-filters";
import { hasRejectedFilterValues, parseListingFilters, type ListingFilters } from "@/lib/listings";
import { parsePage } from "@/lib/pagination";

export type CatalogRequestParams = Record<string, string | string[] | undefined>;

// Preserve repeated fields without carrying arbitrary keys into the next search or page.
export function searchParamsRecord(params: URLSearchParams): CatalogRequestParams {
  return Object.fromEntries([...new Set(params.keys())].map((key) => [key, params.getAll(key)]));
}

export function catalogFilterParams(filters: ListingFilters): CatalogRequestParams {
  return searchParamsRecord(catalogSearchParams(filters));
}

// Shared by the early routing guard and both page exports, so direct renders have the same protection.
export function parseCatalogRequest(params: CatalogRequestParams) {
  const filters = parseListingFilters(params);
  const page = parsePage(params.page);
  let redirectHref: string | null = null;
  if (hasRejectedFilterValues(params)) {
    const cleaned = catalogSearchParams(filters);
    if (page > 1) cleaned.set("page", String(page));
    redirectHref = cleaned.size ? `/listados?${cleaned}` : catalogHref(filters);
  }
  return { filters, page, redirectHref };
}
