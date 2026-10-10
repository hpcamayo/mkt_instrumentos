import "server-only";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { aggregateCatalogBrands, type CatalogBrandsByCategory } from "@/lib/catalog-brands-aggregate";

// The brands of each marketplace category, read from the canonical instrument catalog (docs/database.md § Canonical
// instrument catalog): the catalog categories mapped to a listing category (`laria_category`), their current
// model-level products and each product's manufacturer. Reference tables are public read-only, so the anon key reads
// them; nothing is written. The catalog changes only when the loader runs, so the result is cached for a day.
// `lib/supabase/database.types.ts` does not describe the catalog tables yet, hence the untyped client and the local row
// types below.

const PAGE_SIZE = 1000; // PostgREST's default max rows on Supabase
const REVALIDATE_SECONDS = 60 * 60 * 24;
const REQUEST_TIMEOUT_MS = 4000;

type CategoryRow = { id: string; laria_category: string | null };
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

  const categories = await supabase.from("catalog_categories").select("id, laria_category").not("laria_category", "is", null);
  if (categories.error) throw new Error(categories.error.message);
  const categoryRows = (categories.data ?? []) as CategoryRow[];
  if (categoryRows.length === 0) return {};

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

  return aggregateCatalogBrands(categoryRows, products, manufacturers);
}

// A failed read throws inside the cache, so it is not stored; the caller gets no brands and the menus show the
// subtypes only.
const cachedCatalogBrands = unstable_cache(loadCatalogBrands, ["catalog-brands-by-category-v1"], { revalidate: REVALIDATE_SECONDS });

export async function getCatalogBrandsByCategory(): Promise<CatalogBrandsByCategory> {
  try {
    return await cachedCatalogBrands();
  } catch (error) {
    console.warn("Catalog brands are unavailable:", error instanceof Error ? error.message : error);
    return {};
  }
}
