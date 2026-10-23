import "server-only";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { aggregateCatalogBrands, brandsWithListings, type CatalogBrandsByCategory } from "@/lib/catalog-brands-aggregate";

// The brands of each marketplace category, read from the canonical instrument catalog (docs/database.md § Canonical
// instrument catalog): its current model-level products, each placed in a marketplace category by its catalog category
// (lib/catalog-brands-aggregate.ts), and each product's manufacturer. Reference tables are public read-only, so the anon key reads
// them; nothing is written. The catalog changes only when the loader runs, so the result is cached for a day.
// `lib/supabase/database.types.ts` does not describe the catalog tables yet, hence the untyped client and the local row
// types below.

const PAGE_SIZE = 1000; // PostgREST's default max rows on Supabase
const REVALIDATE_SECONDS = 60 * 60 * 24;
const REQUEST_TIMEOUT_MS = 4000;

type ProductRow = { id: string; category_id: string | null; manufacturer_id: string };
type ManufacturerRow = { id: string; canonical_name: string };

async function loadCatalogBrands(): Promise<CatalogBrandsByCategory> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return {};
  // A catalog that does not answer must not hold up the page: each request gives up after a few seconds.
  const supabase = createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }) },
  });

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
      supabase
        .from("catalog_products")
        .select("id, category_id, manufacturer_id", count(withCount))
        .is("superseded_at", null)
        .eq("entity_level", "model")
        .neq("quality_status", "quarantined")
        .not("category_id", "is", null)
        .order("id")
        .range(...range(from))
        .returns<ProductRow[]>(),
    ),
    readAll<ManufacturerRow>((from, withCount) =>
      supabase.from("catalog_manufacturers").select("id, canonical_name", count(withCount)).order("id").range(...range(from)).returns<ManufacturerRow[]>(),
    ),
  ]);

  return aggregateCatalogBrands(products, manufacturers);
}

// A failed read throws inside the cache, so it is not stored; the caller gets no brands and the menus show the
// subtypes only.
const cachedCatalogBrands = unstable_cache(loadCatalogBrands, ["catalog-brands-by-category-v2"], { revalidate: REVALIDATE_SECONDS });

// FIND 06 (Effortless Laria): the brands that have listings in each category right now (public.catalog_brand_counts),
// cached for five minutes. The menus and landings offer only these, so no brand link leads to an empty page.
async function loadListingBrands() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const supabase = createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }) },
  });
  const { data, error } = await supabase.rpc("catalog_brand_counts");
  if (error) throw new Error(error.message);
  return (data ?? []) as { category: string; brand: string; listings: number }[];
}
const cachedListingBrands = unstable_cache(loadListingBrands, ["catalog-listing-brands-v1"], { revalidate: 300 });

export async function getCatalogBrandsByCategory(): Promise<CatalogBrandsByCategory> {
  if (process.env.LARIA_CATALOG_ENRICHMENT_DISABLED === "true") return {};
  const [catalog, listings] = await Promise.all([
    cachedCatalogBrands().catch((error) => {
      console.warn("Catalog brands are unavailable:", error instanceof Error ? error.message : error);
      return {} as CatalogBrandsByCategory;
    }),
    cachedListingBrands().catch((error) => {
      console.warn("Listing brands are unavailable:", error instanceof Error ? error.message : error);
      return null;
    }),
  ]);
  // Without listing counts, the catalog's brands as before.
  return listings ? brandsWithListings(catalog, listings) : catalog;
}

// FIND 06: how many listings each category and type has right now (public.catalog_type_counts), cached for five
// minutes. Null when the count fails, so callers show everything as before.
async function loadTypeCounts() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("catalog_type_counts");
  if (error) throw new Error(error.message);
  return (data ?? []) as { category: string; instrument_type: string | null; listings: number }[];
}
const cachedTypeCounts = unstable_cache(loadTypeCounts, ["catalog-type-counts-v1"], { revalidate: 300 });

export type ListingCounts = { categories: Record<string, number>; types: Record<string, number> };

export async function getListingCounts(): Promise<ListingCounts | null> {
  if (process.env.LARIA_CATALOG_ENRICHMENT_DISABLED === "true") return null;
  try {
    const rows = await cachedTypeCounts();
    if (!rows) return null;
    const counts: ListingCounts = { categories: {}, types: {} };
    for (const row of rows) {
      counts.categories[row.category] = (counts.categories[row.category] ?? 0) + Number(row.listings);
      if (row.instrument_type) counts.types[`${row.category}:${row.instrument_type}`] = Number(row.listings);
    }
    return counts;
  } catch (error) {
    console.warn("Listing counts are unavailable:", error instanceof Error ? error.message : error);
    return null;
  }
}
