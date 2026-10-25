import "server-only";
import { aggregateCatalogBrands, brandsWithListings, type CatalogBrandsByCategory } from "@/lib/catalog-brands-aggregate";
import { catalogEnrichmentDisabled } from "@/lib/catalog-guard";
import { READ_BUDGETS, createDeadline, type Deadline } from "@/lib/request-deadline";
import { sharedAggregate } from "@/lib/shared-aggregate";
import { createPublicReadClient } from "@/lib/supabase/public-read-client";

// The brands of each marketplace category, read from the canonical instrument catalog (docs/database.md § Canonical
// instrument catalog): its current model-level products, each placed in a marketplace category by its catalog category
// (lib/catalog-brands-aggregate.ts), and each product's manufacturer. Reference tables are public read-only, so the anon key reads
// them; nothing is written. The catalog changes only when the loader runs, so the result is shared for a day
// (lib/shared-aggregate.ts). `lib/supabase/database.types.ts` does not describe the catalog tables yet, hence the
// untyped queries and the local row types below.

const PAGE_SIZE = 1000; // PostgREST's default max rows on Supabase
const REVALIDATE_SECONDS = 60 * 60 * 24;
// The whole reference read (every page of both tables) gets this long; it runs once per instance per day.
const CATALOG_LOAD_MS = 8000;

type ProductRow = { id: string; category_id: string | null; manufacturer_id: string };
type ManufacturerRow = { id: string; canonical_name: string };

async function loadCatalogBrands(deadline: Deadline): Promise<CatalogBrandsByCategory> {
  const supabase = createPublicReadClient(deadline, CATALOG_LOAD_MS);
  if (!supabase) return {};
  const untyped = supabase as unknown as { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any -- tables not in database.types.ts

  // Every page of a query ordered by id. The first page also returns the row count, so the rest load together.
  type Page<Row> = PromiseLike<{ data: Row[] | null; error: { message: string } | null; count: number | null }>;
  async function readAll<Row>(page: (from: number, withCount: boolean) => Page<Row>): Promise<Row[]> {
    const first = await page(0, true);
    if (first.error) throw new Error(first.error.message);
    const offsets = [];
    for (let from = PAGE_SIZE; from < (first.count ?? 0); from += PAGE_SIZE) offsets.push(from);
    const rest = await Promise.all(offsets.map((from) => page(from, false)));
    for (const result of rest) if (result.error) throw new Error(result.error.message);
    return [first, ...rest].flatMap((result) => result.data ?? []);
  }
  const range = (from: number) => [from, from + PAGE_SIZE - 1] as const;
  const count = (withCount: boolean) => (withCount ? { count: "exact" as const } : undefined);

  const [products, manufacturers] = await Promise.all([
    // Current, model-level products that are not quarantined: what the catalog lookup offers as a product.
    readAll<ProductRow>((from, withCount) =>
      untyped
        .from("catalog_products")
        .select("id, category_id, manufacturer_id", count(withCount))
        .is("superseded_at", null)
        .eq("entity_level", "model")
        .neq("quality_status", "quarantined")
        .not("category_id", "is", null)
        .order("id")
        .range(...range(from)),
    ),
    readAll<ManufacturerRow>((from, withCount) =>
      untyped.from("catalog_manufacturers").select("id, canonical_name", count(withCount)).order("id").range(...range(from)),
    ),
  ]);

  return aggregateCatalogBrands(products, manufacturers);
}

const catalogBrands = sharedAggregate<[], CatalogBrandsByCategory>({
  key: "catalog-brands-by-category-v3",
  revalidateSeconds: REVALIDATE_SECONDS,
  load: loadCatalogBrands,
  loadBudgetMs: CATALOG_LOAD_MS,
  cooldownMs: 5 * 60_000,
  maxStaleMs: 7 * 24 * 60 * 60_000,
});

// FIND 06 (Effortless Laria): the brands that have listings in each category right now (public.catalog_brand_counts)
// and how many listings each category and type has (public.catalog_type_counts), each shared for two minutes.
const LISTING_AGGREGATE_SECONDS = 120;

async function loadListingBrands(deadline: Deadline) {
  const supabase = createPublicReadClient(deadline);
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.rpc("catalog_brand_counts");
  if (error) throw new Error(error.message);
  return (data ?? []) as { category: string; brand: string; listings: number }[];
}

const listingBrands = sharedAggregate<[], { category: string; brand: string; listings: number }[]>({
  key: "catalog-listing-brands-v2",
  revalidateSeconds: LISTING_AGGREGATE_SECONDS,
  load: loadListingBrands,
  loadBudgetMs: READ_BUDGETS.coreMs,
});

async function loadTypeCounts(deadline: Deadline) {
  const supabase = createPublicReadClient(deadline);
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.rpc("catalog_type_counts");
  if (error) throw new Error(error.message);
  return (data ?? []) as { category: string; instrument_type: string | null; listings: number }[];
}

const typeCounts = sharedAggregate<[], { category: string; instrument_type: string | null; listings: number }[]>({
  key: "catalog-type-counts-v2",
  revalidateSeconds: LISTING_AGGREGATE_SECONDS,
  load: loadTypeCounts,
  loadBudgetMs: READ_BUDGETS.coreMs,
});

const optionalSignal = (signal?: AbortSignal) => signal ?? createDeadline(READ_BUDGETS.optionalMs).signal;

// The reference catalog's brands per category, most catalog models first: the sell form's suggestions (POST 06). Not
// a live-listing aggregate, so the recovery switch leaves it on; an unavailable catalog gives no suggestions and the
// brand field stays free text.
export async function getReferenceBrandsByCategory(signal?: AbortSignal): Promise<CatalogBrandsByCategory> {
  return (await catalogBrands.get(optionalSignal(signal))) ?? {};
}

// The menus and landings: the catalog's brands kept to those with listings, most listings first. Without listing
// counts (unavailable), the catalog's brands as before; with the recovery switch, none.
export async function getCatalogBrandsByCategory(signal?: AbortSignal): Promise<CatalogBrandsByCategory> {
  if (catalogEnrichmentDisabled()) return {};
  const wait = optionalSignal(signal);
  const [catalog, listings] = await Promise.all([catalogBrands.get(wait), listingBrands.get(wait)]);
  return listings ? brandsWithListings(catalog ?? {}, listings) : (catalog ?? {});
}

export type ListingCounts = { categories: Record<string, number>; types: Record<string, number>; total: number };

// How many public listings with stock each category and type has. Null when unavailable or switched off, so callers
// show everything without numbers.
export async function getListingCounts(signal?: AbortSignal): Promise<ListingCounts | null> {
  if (catalogEnrichmentDisabled()) return null;
  const rows = await typeCounts.get(optionalSignal(signal));
  if (!rows) return null;
  const counts: ListingCounts = { categories: {}, types: {}, total: 0 };
  for (const row of rows) {
    counts.categories[row.category] = (counts.categories[row.category] ?? 0) + Number(row.listings);
    counts.total += Number(row.listings);
    if (row.instrument_type) counts.types[`${row.category}:${row.instrument_type}`] = Number(row.listings);
  }
  return counts;
}

// The rows themselves, for the search box's suggestions (FIND 01).
export async function getTypeCountRows(signal?: AbortSignal) {
  if (catalogEnrichmentDisabled()) return null;
  return typeCounts.get(optionalSignal(signal));
}

export function resetCatalogAggregatesForTests() {
  catalogBrands.reset();
  listingBrands.reset();
  typeCounts.reset();
}
