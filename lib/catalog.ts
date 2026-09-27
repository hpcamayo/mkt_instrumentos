import { LISTINGS_PAGE_SIZE } from "@/lib/pagination";
import type { ListingCardData, ListingFilters } from "@/lib/listings";
import type { getPublicSupabaseClient } from "@/lib/supabase/public-client";

type PublicSupabaseClient = NonNullable<ReturnType<typeof getPublicSupabaseClient>>;

// Shared public catalog query used by /listados and category landing pages so
// both keep the same filters, 24-item pages and deterministic ordering.
export async function fetchCatalogPage(supabase: PublicSupabaseClient, filters: ListingFilters, page: number) {
  const storeRelation = filters.sellerType === "verified_store" ? "stores!inner" : "stores";

  let query = supabase
    .from("listings")
    .select(
      `
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
        ${storeRelation} (
          name,
          slug,
          status,
          is_verified
        ),
        photo_count:listing_photo_count,
        listing_photos (
          id,
          listing_id,
          image_url,
          alt_text,
          sort_order
        )
      `,
      { count: "exact" },
    )
    .eq("status", "approved");

  if (filters.category) {
    query = query.eq("category", filters.category);
  }

  if (filters.city) {
    query = query.eq("city", filters.city);
  }

  if (filters.brand) {
    query = query.ilike("brand", `%${filters.brand}%`);
  }

  if (filters.condition) {
    query = query.eq("condition", filters.condition);
  }

  if (filters.sellerType === "verified_store") {
    query = query.eq("seller_type", "store").eq("stores.is_verified", true);
  } else if (filters.sellerType) {
    query = query.eq("seller_type", filters.sellerType);
  }

  if (filters.instrumentType) {
    query = query.eq("instrument_type", filters.instrumentType);
  }

  if (filters.minPrice !== undefined) {
    query = query.gte("price_pen", filters.minPrice);
  }

  if (filters.maxPrice !== undefined) {
    query = query.lte("price_pen", filters.maxPrice);
  }

  for (const [key, value] of Object.entries(filters.advanced)) {
    query = query.contains("attributes", { [key]: value });
  }

  if (filters.sort === "price_asc") {
    query = query.order("price_pen", { ascending: true, nullsFirst: false });
  } else if (filters.sort === "price_desc") {
    query = query.order("price_pen", { ascending: false, nullsFirst: false });
  } else {
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
    .range((page - 1) * LISTINGS_PAGE_SIZE, page * LISTINGS_PAGE_SIZE - 1)
    .returns<ListingCardData[]>();
}
