import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocationStock, PublicLocation, StoreLocation } from "@/lib/store-locations";

// Feature ideas, store-locations batch, run-02: reads. The owner's own rows come through RLS (or get_store_locations);
// the public ones through the definer functions, which never show stock counts or a street address without consent.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export async function getOwnLocations(supabase: AnyClient): Promise<StoreLocation[]> {
  const { data, error } = await (supabase as unknown as SupabaseClient).rpc("get_store_locations");
  if (error || !data) return [];
  return ((data as { locations?: StoreLocation[] }).locations ?? []);
}

// Stock per location for some SKU (or all of a store's, when itemIds is null), in pages the API accepts.
export async function getLocationStock(supabase: AnyClient, storeId: string, itemIds: string[] | null): Promise<LocationStock[] | null> {
  const db = supabase as unknown as SupabaseClient;
  const rows: LocationStock[] = [];
  if (itemIds) {
    for (let start = 0; start < itemIds.length; start += 200) {
      const { data, error } = await db.from("store_location_stock").select("location_id,item_id,quantity_on_hand")
        .eq("store_id", storeId).in("item_id", itemIds.slice(start, start + 200));
      if (error) return null;
      rows.push(...((data ?? []) as LocationStock[]));
    }
    return rows;
  }
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await db.from("store_location_stock").select("location_id,item_id,quantity_on_hand")
      .eq("store_id", storeId).order("item_id").order("location_id").range(from, from + 999);
    if (error) return null;
    rows.push(...((data ?? []) as LocationStock[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export async function getListingLocations(supabase: AnyClient, listingId: string): Promise<PublicLocation[]> {
  const { data, error } = await (supabase as unknown as SupabaseClient).rpc("get_listing_locations", { p_listing_id: listingId });
  return error || !data ? [] : (data as PublicLocation[]);
}

export async function getPublicStoreLocations(supabase: AnyClient, storeId: string): Promise<(PublicLocation & { region: string; is_primary: boolean })[]> {
  const { data, error } = await (supabase as unknown as SupabaseClient).rpc("get_public_store_locations", { p_store_id: storeId });
  return error || !data ? [] : (data as (PublicLocation & { region: string; is_primary: boolean })[]);
}
