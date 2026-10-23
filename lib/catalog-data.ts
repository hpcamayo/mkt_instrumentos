import "server-only";
import { cache } from "react";
import { countCatalog, fetchCatalogPage } from "@/lib/catalog";
import { fetchCatalogFacets } from "@/lib/catalog-facets";
import { appliedFilters, catalogSearchParams, type AppliedFilter } from "@/lib/catalog-filters";
import { parseListingFilters, type ListingCardData, type ListingFilters } from "@/lib/listings";
import { getPublicSupabaseClient } from "@/lib/supabase/public-client";

// Request-scoped reads of the catalog (React cache), so generateMetadata and the page, or the view and a landing, share
// one query per set of filters.
const key = (filters: ListingFilters) => `${catalogSearchParams(filters)}`;
const fromKey = (value: string) => parseListingFilters(Object.fromEntries([...new URLSearchParams(value)].reduce((map, [name, item]) => {
  const current = map.get(name);
  map.set(name, current === undefined ? item : Array.isArray(current) ? [...current, item] : [current, item]);
  return map;
}, new Map<string, string | string[]>())));

const facetsByKey = cache(async (value: string) => {
  const supabase = getPublicSupabaseClient();
  return supabase ? fetchCatalogFacets(supabase, fromKey(value)) : null;
});

export function getCatalogFacets(filters: ListingFilters) {
  return facetsByKey(key(filters));
}

const pageByKey = cache(async (value: string, page: number) => {
  const supabase = getPublicSupabaseClient();
  if (!supabase) return null;
  return fetchCatalogPage(supabase, fromKey(value), page);
});

export function getCatalogPage(filters: ListingFilters, page: number) {
  return pageByKey(key(filters), page);
}

// FIND 04: when a search finds nothing, one-tap ways out with their counts ("Sin “Arequipa” hay 12") and the closest
// listings: the same search without the text, or the category alone, or the newest.
export type RescueWay = { chip: AppliedFilter; count: number };
export type CatalogRescue = { ways: RescueWay[]; closest: ListingCardData[]; closestLabel: string };

export async function getCatalogRescue(filters: ListingFilters, scope: { landing?: { category: string; path: string } } = {}): Promise<CatalogRescue | null> {
  const supabase = getPublicSupabaseClient();
  if (!supabase) return null;
  const chips = appliedFilters(filters, scope).slice(0, 8);
  const counts = await Promise.all(
    chips.map((chip) => {
      const url = new URL(chip.href, "https://laria.local");
      const next = parseListingFilters(Object.fromEntries([...url.searchParams.keys()].map((name) => [name, url.searchParams.getAll(name)])));
      return countCatalog(supabase, scope.landing && url.pathname === scope.landing.path ? { ...next, category: scope.landing.category } : next);
    }),
  );
  const ways = chips.flatMap((chip, index) => (counts[index] ? [{ chip, count: counts[index] as number }] : [])).sort((a, b) => b.count - a.count).slice(0, 4);

  const tries: { filters: ListingFilters; label: string }[] = [];
  const base: ListingFilters = { cities: [], conditions: [], advanced: {}, sort: "newest" };
  if (filters.q && (filters.category || filters.instrumentType)) tries.push({ filters: { ...base, category: filters.category, instrumentType: filters.instrumentType }, label: "Lo más parecido" });
  if (filters.category) tries.push({ filters: { ...base, category: filters.category }, label: "Lo más parecido" });
  tries.push({ filters: base, label: "Lo más nuevo en Laria" });
  for (const attempt of tries) {
    const { data, error } = await fetchCatalogPage(supabase, attempt.filters, 1, 4);
    if (!error && data && data.length > 0) return { ways, closest: data, closestLabel: attempt.label };
  }
  return { ways, closest: [], closestLabel: "" };
}
