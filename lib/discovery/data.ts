import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { catalogCardSelect, fetchCatalogPage } from "@/lib/catalog";
import { parseCollection, parseCollections, type Collection } from "@/lib/discovery/collections";
import {
  parseGiftExchangeStores,
  parseListingMarks,
  parsePublicArtists,
  parsePublicMakers,
  type GiftExchangeStore,
  type ListingMark,
  type PublicArtist,
  type PublicMaker,
} from "@/lib/discovery/makers";
import { DISCOVERABLE_STOCK_FILTER, type ListingCardData, type ListingFilters } from "@/lib/listings";
import { withStoreExchangeTerms } from "@/lib/store-floor/exchange";
import { getRequestReads } from "@/lib/supabase/public-read-client";

// Public reads for the discovery pages (docs/feature-ideas/discovery.md), through the render's deadline-bound anonymous
// client (lib/supabase/public-read-client.ts). Each returns null when the read failed, so a page can say so instead of
// looking empty; nothing here depends on who is asking.

function client() {
  return getRequestReads().supabase as unknown as SupabaseClient | null;
}

function logFailure(part: string, error: { message: string } | null) {
  if (error) console.error(`Discovery: the ${part} read failed: ${error.message}`);
}

async function rpc<T>(name: string, args: Record<string, unknown>, parse: (value: unknown) => T): Promise<T | null> {
  const supabase = client();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc(name, args);
  logFailure(name, error);
  return error ? null : parse(data);
}

export function getListingMarks(listingIds: string[]): Promise<ListingMark[] | null> {
  if (listingIds.length === 0) return Promise.resolve([]);
  return rpc("get_listing_marks", { p_listing_ids: listingIds.slice(0, 120) }, parseListingMarks);
}

export function getPublicMakers(listingsPerMaker = 4): Promise<PublicMaker[] | null> {
  return rpc("get_public_makers", { p_listings_per_maker: listingsPerMaker }, parsePublicMakers);
}

export function getPublicArtists(listingsPerArtist = 4): Promise<PublicArtist[] | null> {
  return rpc("get_public_artists", { p_listings_per_artist: listingsPerArtist }, parsePublicArtists);
}

export async function getGiftExchangeStores(limit = 12): Promise<GiftExchangeStore[] | null> {
  const stores = await rpc("get_gift_exchange_stores", { p_limit: limit }, parseGiftExchangeStores);
  // store-floor: a store's own returns terms win over its gift policy (lib/store-floor/exchange.ts).
  return stores ? withStoreExchangeTerms(client(), stores) : stores;
}

// Catalog cards for listings named by id, in the order given, through the catalog's own query (RLS decides what is
// public; out-of-stock listings are left out like in the catalog).
export async function getCardsByIds(listingIds: string[]): Promise<ListingCardData[] | null> {
  const supabase = getRequestReads().supabase;
  if (!supabase) return null;
  if (listingIds.length === 0) return [];
  const { data, error } = await supabase
    // public_listings: the card's photo_count reads a row of public columns (lib/catalog.ts).
    .from("public_listings")
    .select(catalogCardSelect())
    .in("id", listingIds.slice(0, 120))
    .eq("status", "approved")
    .or(DISCOVERABLE_STOCK_FILTER)
    .order("sort_order", { foreignTable: "listing_photos", ascending: true })
    .limit(1, { foreignTable: "listing_photos" })
    .returns<ListingCardData[]>();
  logFailure("cards", error);
  if (error) return null;
  const byId = new Map((data ?? []).map((listing) => [listing.id, listing]));
  return listingIds.flatMap((id) => byId.get(id) ?? []);
}

// The first listings of one filter set, newest first, with the set's total (for "Ver las N").
export async function getSetListings(filters: ListingFilters, limit: number): Promise<{ listings: ListingCardData[]; total: number } | null> {
  const supabase = getRequestReads().supabase;
  if (!supabase) return null;
  const { data, error, count } = await fetchCatalogPage(supabase, { ...filters, sort: "newest" }, 1, limit);
  logFailure("set listings", error);
  return error ? null : { listings: data ?? [], total: count ?? (data ?? []).length };
}

// The collections inside their dates, in Admin's order (RLS keeps the rest out for the anonymous client).
export async function getCurrentCollections(): Promise<Collection[] | null> {
  const supabase = client();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("collections")
    .select("id, slug, title, intro, sets, starts_on, ends_on, published, sort_order")
    .order("sort_order")
    .order("title")
    .limit(24);
  logFailure("collections", error);
  return error ? null : parseCollections(data);
}

// One current collection, null when it does not exist or is outside its dates; undefined when the read failed.
export async function getCollection(slug: string): Promise<Collection | null | undefined> {
  const supabase = client();
  if (!supabase) return undefined;
  const { data, error } = await supabase
    .from("collections")
    .select("id, slug, title, intro, sets, starts_on, ends_on, published, sort_order")
    .eq("slug", slug)
    .maybeSingle();
  logFailure("collection", error);
  return error ? undefined : parseCollection(data);
}
