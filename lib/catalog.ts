import { LISTINGS_PAGE_SIZE } from "@/lib/pagination";
import { DISCOVERABLE_STOCK_FILTER, type ListingCardData, type ListingFilters } from "@/lib/listings";
import type { getPublicSupabaseClient } from "@/lib/supabase/public-client";

type PublicSupabaseClient = NonNullable<ReturnType<typeof getPublicSupabaseClient>>;

// The card's columns. status and stock_state are listed because PostgREST only filters on the columns a function's
// result selects (the free-text search runs through public.catalog_search); price_drop_from is a computed field
// (FIND 10, "Antes S/").
const CARD_COLUMNS = `
        id,
        title,
        slug,
        category,
        brand,
        model,
        condition,
        price_pen,
        instrument_type,
        attributes,
        published_at,
        view_count,
        city,
        region,
        seller_type,
        created_at,
        status,
        stock_state,
        store_id,
        price_drop_from,
      `;
const STORE_AND_PHOTO_COLUMNS = ` (
          name,
          slug,
          status,
          is_verified,
          district
        ),
        photo_count:listing_photo_count,
        listing_photos (
          id,
          listing_id,
          image_url,
          alt_text,
          sort_order
        )
      `;

export function catalogCardSelect(storeRelation: "stores" | "stores!inner" = "stores") {
  return CARD_COLUMNS + storeRelation + STORE_AND_PHOTO_COLUMNS;
}

// The listings a search starts from: every listing, or those matching the free-text query (BIG 03).
function source(supabase: PublicSupabaseClient, filters: ListingFilters, select: string, options: { count?: "exact"; head?: boolean }) {
  return filters.q
    ? supabase.rpc("catalog_search", { p_q: filters.q }, options).select(select)
    : supabase.from("listings").select(select, options);
}

// The catalog's filters on a query, the same for the page, its count and the rescue counts (FIND 04).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the table query and the RPC share PostgREST's filter builder
function applyFilters<Q extends { eq: any; in: any; or: any; ilike: any; gte: any; lte: any; contains: any }>(query: Q, filters: ListingFilters): Q {
  let result = query.eq("status", "approved").or(DISCOVERABLE_STOCK_FILTER);
  if (filters.category) result = result.eq("category", filters.category);
  // F11: one value is today's eq; several are "any of" (in).
  if (filters.cities.length === 1) result = result.eq("city", filters.cities[0]);
  else if (filters.cities.length > 1) result = result.in("city", filters.cities);
  if (filters.brand) result = result.ilike("brand", `%${filters.brand}%`);
  if (filters.conditions.length === 1) result = result.eq("condition", filters.conditions[0]);
  else if (filters.conditions.length > 1) result = result.in("condition", filters.conditions);
  if (filters.sellerType === "verified_store") result = result.eq("seller_type", "store").eq("stores.is_verified", true);
  else if (filters.sellerType) result = result.eq("seller_type", filters.sellerType);
  if (filters.instrumentType) result = result.eq("instrument_type", filters.instrumentType);
  if (filters.minPrice !== undefined) result = result.gte("price_pen", filters.minPrice);
  if (filters.maxPrice !== undefined) result = result.lte("price_pen", filters.maxPrice);
  for (const [key, value] of Object.entries(filters.advanced)) result = result.contains("attributes", { [key]: value });
  return result;
}

// Shared public catalog query used by /listados and category landing pages so
// both keep the same filters, 24-item pages and deterministic ordering.
export async function fetchCatalogPage(supabase: PublicSupabaseClient, filters: ListingFilters, page: number, pageSize = LISTINGS_PAGE_SIZE) {
  const storeRelation = filters.sellerType === "verified_store" ? "stores!inner" : "stores";
  const select = filters.sort === "price_drop" ? `${catalogCardSelect(storeRelation)}, price_dropped_at` : filters.sort === "verified_first" ? `${catalogCardSelect(storeRelation)}, seller_verified_rank` : catalogCardSelect(storeRelation);
  let query = applyFilters(source(supabase, filters, select, { count: "exact" }), filters);

  if (filters.sort === "price_asc") {
    query = query.order("price_pen", { ascending: true, nullsFirst: false });
  } else if (filters.sort === "price_desc") {
    query = query.order("price_pen", { ascending: false, nullsFirst: false });
  } else {
    // FIND 10: a lower price in the past 30 days first, or verified stores first; then the usual newest first.
    if (filters.sort === "price_drop") query = query.order("price_dropped_at", { ascending: false, nullsFirst: false });
    if (filters.sort === "verified_first") query = query.order("seller_verified_rank", { ascending: false });
    query = query
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
  }

  query = query.order("sort_order", {
    foreignTable: "listing_photos",
    ascending: true,
  });
  query = query.limit(1, { foreignTable: "listing_photos" });

  return query
    .order("id")
    .range((page - 1) * pageSize, page * pageSize - 1)
    .returns<ListingCardData[]>();
}

// How many results a set of filters gives (FIND 04's one-tap ways out). Null when the count fails.
export async function countCatalog(supabase: PublicSupabaseClient, filters: ListingFilters) {
  const storeRelation = filters.sellerType === "verified_store" ? "stores!inner" : "stores";
  const select = `id, category, city, brand, condition, seller_type, instrument_type, price_pen, attributes, status, stock_state, ${storeRelation} (is_verified)`;
  const { count, error } = await applyFilters(source(supabase, filters, select, { count: "exact", head: true }), filters);
  return error ? null : count;
}
