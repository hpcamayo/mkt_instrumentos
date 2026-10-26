import { NextResponse, type NextRequest } from "next/server";
import { fetchCatalogMap } from "@/lib/catalog";
import { catalogEnrichmentDisabled } from "@/lib/catalog-guard";
import { MAP_LISTING_LIMIT, groupMapPlaces } from "@/lib/catalog-map";
import { parseListingFilters } from "@/lib/listings";
import { READ_BUDGETS, createDeadline } from "@/lib/request-deadline";
import { createPublicReadClient } from "@/lib/supabase/public-read-client";

export const maxDuration = 30;

// buy-08 "Ver en mapa": the catalog's current results as places (lib/catalog-map.ts), for the map the visitor opens.
// Public data through the public read client, the same filters as the catalog page, bounded by the route's deadline.
// The map is optional: the recovery switch (lib/catalog-guard.ts) turns it off before any read.
export async function GET(request: NextRequest) {
  if (catalogEnrichmentDisabled()) return NextResponse.json({ places: [], shown: 0, total: 0, unplaced: 0 }, { status: 503 });
  const params = request.nextUrl.searchParams;
  const record = Object.fromEntries([...new Set(params.keys())].map((key) => [key, params.getAll(key)]));
  const supabase = createPublicReadClient(createDeadline(READ_BUDGETS.routeMs, request.signal));
  if (!supabase) return NextResponse.json({ places: [], shown: 0, total: 0, unplaced: 0 }, { status: 503 });
  const { data, count, error } = await fetchCatalogMap(supabase, parseListingFilters(record), MAP_LISTING_LIMIT);
  if (error) return NextResponse.json({ places: [], shown: 0, total: 0, unplaced: 0 }, { status: 502 });
  // Only what the map and its list show.
  const listings = (data ?? []).map((row) => ({
    id: row.id, title: row.title, slug: row.slug, price_pen: row.price_pen, condition: row.condition, city: row.city, region: row.region,
    seller_type: row.seller_type, photo: row.listing_photos?.[0]?.image_url ?? null, store: (Array.isArray(row.stores) ? row.stores[0] : row.stores) ?? null,
  }));
  return NextResponse.json(groupMapPlaces(listings, count ?? listings.length), { headers: { "cache-control": "public, max-age=60" } });
}
