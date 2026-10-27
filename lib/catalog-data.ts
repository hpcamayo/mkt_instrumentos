import "server-only";
import { cache } from "react";
import { countCatalog, fetchCatalogPage } from "@/lib/catalog";
import { requestCatalogFacets, type CatalogFacetData } from "@/lib/catalog-facets";
import { appliedFilters, catalogSearchParams, type AppliedFilter } from "@/lib/catalog-filters";
import { catalogEnrichmentDisabled } from "@/lib/catalog-guard";
import { parseListingFilters, type ListingCardData, type ListingFilters } from "@/lib/listings";
import { READ_BUDGETS, budgetSignal, type Deadline } from "@/lib/request-deadline";
import { createBreaker, sharedAggregate } from "@/lib/shared-aggregate";
import { createPublicReadClient, getRequestReads } from "@/lib/supabase/public-read-client";

// Reads of the catalog for one server render. The listings page is request-scoped (React cache), so generateMetadata
// and the page, or the view and a landing, share one query per set of filters; it is core data, bounded by the
// render's deadline (lib/request-deadline.ts). Facet counts and the empty-search rescue are optional: shared between
// requests for a minute per canonical filter set (lib/shared-aggregate.ts), bounded by the optional budget, and
// skipped by the recovery switch or after repeated failures.
const key = (filters: ListingFilters) => `${catalogSearchParams(filters)}`;
export const filtersFromKey = (value: string) => parseListingFilters(Object.fromEntries([...new URLSearchParams(value)].reduce((map, [name, item]) => {
  const current = map.get(name);
  map.set(name, current === undefined ? item : Array.isArray(current) ? [...current, item] : [current, item]);
  return map;
}, new Map<string, string | string[]>())));

// One breaker for every optional per-filter read: three failures within ten seconds pause them all for thirty.
const optionalBreaker = createBreaker({ failures: 3, windowMs: 10_000, openMs: 30_000 });
// One empty search asks up to eight rescue counts at once; they get their own breaker so a single slow search cannot
// count as three failures and pause every visitor's facets.
const rescueCountBreaker = createBreaker({ failures: 3, windowMs: 10_000, openMs: 30_000 });

const facets = sharedAggregate<[string], CatalogFacetData>({
  key: "catalog-facets-v2",
  revalidateSeconds: 60,
  memoryFreshMs: 60_000,
  persist: false,
  maxEntries: 500,
  loadBudgetMs: READ_BUDGETS.optionalMs,
  breaker: optionalBreaker,
  async load(deadline: Deadline, value: string) {
    const supabase = createPublicReadClient(deadline, READ_BUDGETS.optionalMs);
    if (!supabase) throw new Error("Supabase is not configured");
    return requestCatalogFacets(supabase, filtersFromKey(value));
  },
});

// Facet counts for a canonical filter key (also the browser endpoint's); null when unavailable or switched off.
export function getFacetsForKey(value: string, signal: AbortSignal) {
  if (catalogEnrichmentDisabled()) return Promise.resolve(null);
  return facets.get(signal, value);
}

// The sort does not change counts, so every sort shares the "newest" key (the one the browser endpoint uses).
export function getCatalogFacets(filters: ListingFilters) {
  if (catalogEnrichmentDisabled()) return Promise.resolve(null);
  const { deadline } = getRequestReads();
  return getFacetsForKey(key({ ...filters, sort: "newest" }), budgetSignal(deadline, READ_BUDGETS.optionalMs));
}

const pageByKey = cache(async (value: string, page: number) => {
  const { supabase } = getRequestReads();
  if (!supabase) return null;
  return fetchCatalogPage(supabase, filtersFromKey(value), page);
});

export function getCatalogPage(filters: ListingFilters, page: number) {
  return pageByKey(key(filters), page);
}

// FIND 04: when a search finds nothing, one-tap ways out with their counts ("Sin “Arequipa” hay 12") and the closest
// listings: the same search without the text, or the category alone, or the newest.
export type RescueWay = { chip: AppliedFilter; count: number };
export type CatalogRescue = { ways: RescueWay[]; closest: ListingCardData[]; closestLabel: string };
type RescueScope = { landing?: { category: string; path: string } };

// Adjacent empty searches often ask the same "without this filter" question. Share only these optional counts;
// the primary catalog result and its visibility remain request-scoped. No persistent entry per arbitrary URL.
const rescueCounts = sharedAggregate<[string], number>({
  key: "catalog-rescue-count-v1",
  revalidateSeconds: 60,
  memoryFreshMs: 60_000,
  maxStaleMs: 60_000,
  persist: false,
  maxEntries: 500,
  loadBudgetMs: READ_BUDGETS.optionalMs,
  breaker: rescueCountBreaker,
  async load(deadline: Deadline, value: string) {
    const supabase = createPublicReadClient(deadline, READ_BUDGETS.optionalMs);
    if (!supabase) throw new Error("Supabase is not configured");
    const count = await countCatalog(supabase, filtersFromKey(value));
    if (count === null) throw new Error("the rescue count failed");
    return count;
  },
});

// Every count and fallback read draws on one optional deadline: the counts run together, the fallbacks one after the
// other, and none gets a fresh budget. A failed count leaves its way out; a failed fallback tries the next one.
async function loadRescue(deadline: Deadline, value: string, scopeValue: string): Promise<CatalogRescue> {
  const supabase = createPublicReadClient(deadline, READ_BUDGETS.optionalMs);
  if (!supabase) throw new Error("Supabase is not configured");
  const filters = filtersFromKey(value);
  const scope = JSON.parse(scopeValue) as RescueScope;
  const chips = appliedFilters(filters, scope).slice(0, 8);
  const counts = await Promise.all(
    chips.map((chip) => {
      const url = new URL(chip.href, "https://laria.local");
      const next = parseListingFilters(Object.fromEntries([...url.searchParams.keys()].map((name) => [name, url.searchParams.getAll(name)])));
      const scoped = scope.landing && url.pathname === scope.landing.path ? { ...next, category: scope.landing.category } : next;
      return rescueCounts.get(deadline.signal, key({ ...scoped, sort: "newest" }));
    }),
  );
  const ways = chips.flatMap((chip, index) => (counts[index] ? [{ chip, count: counts[index] as number }] : [])).sort((a, b) => b.count - a.count).slice(0, 4);

  const tries: { filters: ListingFilters; label: string }[] = [];
  const base: ListingFilters = { cities: [], conditions: [], advanced: {}, sort: "newest" };
  if (filters.q && (filters.category || filters.instrumentType)) tries.push({ filters: { ...base, category: filters.category, instrumentType: filters.instrumentType }, label: "Lo más parecido" });
  if (filters.category) tries.push({ filters: { ...base, category: filters.category }, label: "Lo más parecido" });
  tries.push({ filters: base, label: "Lo más nuevo en Laria" });
  const attempted = new Set<string>();
  for (const attempt of tries) {
    if (deadline.signal.aborted) break;
    const attemptKey = key(attempt.filters);
    if (attempted.has(attemptKey)) continue;
    attempted.add(attemptKey);
    const { data, error } = await fetchCatalogPage(supabase, attempt.filters, 1, 4);
    if (!error && data && data.length > 0) return { ways, closest: data, closestLabel: attempt.label };
  }
  // Nothing at all when every read failed, so the failure is not cached as "no ways out".
  if (ways.length === 0 && counts.some((count) => count === null)) throw new Error("the rescue reads failed");
  return { ways, closest: [], closestLabel: "" };
}

const rescues = sharedAggregate<[string, string], CatalogRescue>({
  key: "catalog-rescue-v1",
  revalidateSeconds: 60,
  memoryFreshMs: 60_000,
  persist: false,
  maxEntries: 300,
  loadBudgetMs: READ_BUDGETS.optionalMs,
  breaker: optionalBreaker,
  load: loadRescue,
});

export async function getCatalogRescue(filters: ListingFilters, scope: RescueScope = {}): Promise<CatalogRescue | null> {
  // An empty crawled search can otherwise fan out into eight count queries and several fallback reads.
  if (catalogEnrichmentDisabled()) return null;
  const { deadline } = getRequestReads();
  const landing = scope.landing ? { category: scope.landing.category, path: scope.landing.path } : undefined;
  return rescues.get(budgetSignal(deadline, READ_BUDGETS.optionalMs), key(filters), JSON.stringify(landing ? { landing } : {}));
}

export function resetCatalogDataForTests() {
  facets.reset();
  rescues.reset();
  rescueCounts.reset();
  optionalBreaker.reset();
  rescueCountBreaker.reset();
}

