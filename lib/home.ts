import { categoryOptions, type ListingCardData } from "@/lib/listings";
import type { getPublicSupabaseClient } from "@/lib/supabase/public-client";

type PublicSupabaseClient = NonNullable<ReturnType<typeof getPublicSupabaseClient>>;

// The home's read-only data (docs/ux-redesign/ux-3-discovery.md § Home data). Every query uses the public client, so
// RLS decides what is public exactly as on the catalog. The only queries the catalog does not already make are the
// owner-approved ones: the vitrina's per-category queries on listing_photo_count (Q12) and the counts (Q10 B).
export const VITRINA_SIZE = 5;
export const VITRINA_MIN_PHOTOS = 3;
// Desktop: two rows of six, eleven cards and the end tile (Q15 B). Phones show the first six.
export const FEED_SIZE = 11;
export const PHONE_FEED_SIZE = 6;
export const HOME_STORE_COUNT = 3;

const CARD_SELECT = `
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
  stores (
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
`;

type Ordered = Pick<ListingCardData, "id" | "published_at" | "created_at">;

// The catalog's default order (lib/catalog.ts): published_at newest first (never-published last), then created_at
// newest first, then id.
export function compareCatalogOrder(a: Ordered, b: Ordered) {
  if (a.published_at !== b.published_at) {
    if (a.published_at === null) return 1;
    if (b.published_at === null) return -1;
    return a.published_at < b.published_at ? 1 : -1;
  }
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// H2, Q12: each category's newest approved listing with 3 photos or more competes; the five most recent show.
export function selectVitrina<T extends Ordered>(winners: readonly (T | null | undefined)[]) {
  return winners.filter((listing): listing is T => Boolean(listing)).sort(compareCatalogOrder).slice(0, VITRINA_SIZE);
}

// "Recién publicados": the newest approved listings, leaving out the vitrina's.
export function selectFeed<T extends Ordered>(newest: readonly T[], vitrina: readonly Ordered[]) {
  const shown = new Set(vitrina.map((listing) => listing.id));
  return [...newest].sort(compareCatalogOrder).filter((listing) => !shown.has(listing.id)).slice(0, FEED_SIZE);
}

export type HomeStore = { id: string; name: string; slug: string; city: string; district: string | null; logo_url: string | null };

// null means the query failed: the page leaves that section out (§ States) and the error goes to the server log.
export type HomeData = {
  vitrina: ListingCardData[] | null;
  feed: ListingCardData[] | null;
  total: number | null;
  categoryCounts: Record<string, number | null>;
  stores: HomeStore[] | null;
};

function logFailure(part: string, error: { message: string } | null) {
  if (error) console.error(`Home: the ${part} query failed: ${error.message}`);
}

function newestApproved(supabase: PublicSupabaseClient) {
  return supabase
    .from("listings")
    .select(CARD_SELECT)
    .eq("status", "approved")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id")
    .order("sort_order", { foreignTable: "listing_photos", ascending: true })
    .limit(1, { foreignTable: "listing_photos" });
}

function approvedCount(supabase: PublicSupabaseClient, category?: string) {
  const query = supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "approved");
  return category ? query.eq("category", category) : query;
}

export async function fetchHomeData(supabase: PublicSupabaseClient): Promise<HomeData> {
  // One round trip: the feed takes the newest FEED_SIZE + VITRINA_SIZE listings, enough to fill it after leaving out
  // the vitrina's, so it does not wait for the vitrina queries.
  const [winners, newest, total, categoryCounts, stores] = await Promise.all([
    Promise.all(
      categoryOptions.map((category) =>
        newestApproved(supabase).eq("category", category.value).gte("listing_photo_count", VITRINA_MIN_PHOTOS).limit(1).returns<ListingCardData[]>(),
      ),
    ),
    newestApproved(supabase).limit(FEED_SIZE + VITRINA_SIZE).returns<ListingCardData[]>(),
    approvedCount(supabase),
    Promise.all(categoryOptions.map((category) => approvedCount(supabase, category.value))),
    supabase
      .from("stores")
      .select("id, name, slug, city, district, logo_url")
      .eq("status", "active")
      .eq("is_verified", true)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(HOME_STORE_COUNT)
      .returns<HomeStore[]>(),
  ]);

  const winnerError = winners.find((result) => result.error)?.error ?? null;
  logFailure("vitrina", winnerError);
  logFailure("feed", newest.error);
  logFailure("count", total.error ?? categoryCounts.find((result) => result.error)?.error ?? null);
  logFailure("verified stores", stores.error);

  const vitrina = winnerError ? null : selectVitrina(winners.map((result) => result.data?.[0]));
  return {
    vitrina,
    feed: newest.error ? null : selectFeed(newest.data ?? [], vitrina ?? []),
    total: total.error ? null : total.count,
    categoryCounts: Object.fromEntries(categoryOptions.map((category, index) => {
      const result = categoryCounts[index];
      return [category.value, result.error ? null : result.count];
    })),
    stores: stores.error ? null : (stores.data ?? []),
  };
}
