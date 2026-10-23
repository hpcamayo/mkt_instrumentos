import { createHash } from "node:crypto";
import { catalogCardSelect } from "@/lib/catalog";
import { DISCOVERABLE_STOCK_FILTER, categoryOptions, type ListingCardData } from "@/lib/listings";
import type { getPublicSupabaseClient } from "@/lib/supabase/public-client";

type PublicSupabaseClient = NonNullable<ReturnType<typeof getPublicSupabaseClient>>;

// The home's read-only data (docs/ux-redesign/ux-3-discovery.md § Home data; Effortless Laria BIG 01). Every query uses
// the public client, so RLS decides what is public exactly as on the catalog: the newest listings "Para ti" ranks on
// the device, the recent price drops, the counts (Q10 B) and the verified stores. The vitrina's per-category queries
// went with the vitrina (UXD-find).
// "Para ti" shows twelve on desktop and six on phones (BIG 01).
export const PHONE_FEED_SIZE = 6;
export const HOME_STORE_COUNT = 3;

// The catalog card's columns (lib/catalog.ts), so the home cards show the same "Antes S/" and district.
const CARD_SELECT = catalogCardSelect();

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

export type HomeStore = { id: string; name: string; slug: string; city: string; district: string | null; logo_url: string | null };

// BIG 01 (Effortless Laria): the listings "Para ti" ranks on the device, newest first. Each carries seller_key, a short
// hash of its store or owner, so the ranking can keep two listings of one seller apart without learning who sells.
export const FOR_YOU_POOL = 48;
export const FOR_YOU_SIZE = 12;
export const PRICE_DROP_SIZE = 6;
export type HomeListing = ListingCardData & { seller_key: string };

export function sellerKey(listing: { id: string; store_id?: string | null; owner_user_id?: string | null }) {
  return createHash("sha256").update(`laria-seller:${listing.store_id ?? listing.owner_user_id ?? listing.id}`).digest("hex").slice(0, 12);
}

// null means the query failed: the page leaves that section out (§ States) and the error goes to the server log.
export type HomeData = {
  pool: HomeListing[] | null;
  priceDrops: ListingCardData[] | null;
  total: number | null;
  categoryCounts: Record<string, number | null>;
  stores: HomeStore[] | null;
};

function logFailure(part: string, error: { message: string } | null) {
  if (error) console.error(`Home: the ${part} query failed: ${error.message}`);
}

function approvedListings(supabase: PublicSupabaseClient, select: string) {
  return supabase
    .from("listings")
    .select(select)
    .eq("status", "approved")
    .or(DISCOVERABLE_STOCK_FILTER);
}

function approvedCount(supabase: PublicSupabaseClient, category?: string) {
  const query = supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .or(DISCOVERABLE_STOCK_FILTER);
  return category ? query.eq("category", category) : query;
}

type PoolRow = ListingCardData & { owner_user_id?: string | null };

export async function fetchHomeData(supabase: PublicSupabaseClient): Promise<HomeData> {
  const [newest, drops, total, categoryCounts, stores] = await Promise.all([
    approvedListings(supabase, `${CARD_SELECT}, owner_user_id`)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id")
      .order("sort_order", { foreignTable: "listing_photos", ascending: true })
      .limit(1, { foreignTable: "listing_photos" })
      .limit(FOR_YOU_POOL)
      .returns<PoolRow[]>(),
    // FIND 10: "Bajaron de precio", the real drops of the past 30 days (list-05), the latest first.
    approvedListings(supabase, `${CARD_SELECT}, recent_price_drop_at`)
      .not("recent_price_drop_at", "is", null)
      .order("recent_price_drop_at", { ascending: false })
      .order("id")
      .order("sort_order", { foreignTable: "listing_photos", ascending: true })
      .limit(1, { foreignTable: "listing_photos" })
      .limit(PRICE_DROP_SIZE)
      .returns<ListingCardData[]>(),
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

  logFailure("for-you", newest.error);
  logFailure("price drop", drops.error);
  logFailure("count", total.error ?? categoryCounts.find((result) => result.error)?.error ?? null);
  logFailure("verified stores", stores.error);

  return {
    // The owner's id never leaves the server: only its hash does.
    pool: newest.error ? null : [...(newest.data ?? [])].sort(compareCatalogOrder).map(({ owner_user_id, ...listing }) => ({ ...listing, seller_key: sellerKey({ ...listing, owner_user_id }) })),
    priceDrops: drops.error ? null : (drops.data ?? []),
    total: total.error ? null : total.count,
    categoryCounts: Object.fromEntries(categoryOptions.map((category, index) => {
      const result = categoryCounts[index];
      return [category.value, result.error ? null : result.count];
    })),
    stores: stores.error ? null : (stores.data ?? []),
  };
}
