import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocationStock, PublicLocation, StoreLocation } from "@/lib/store-locations";

// Feature ideas, store-locations batch, run-02: reads. The owner's own rows come through RLS (or get_store_locations);
// the public ones through the definer functions, which never show stock counts or a street address without consent.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export async function getOwnLocations(supabase: AnyClient): Promise<StoreLocation[]> {
  try {
    const { data, error } = await (supabase as unknown as SupabaseClient).rpc("get_store_locations");
    if (error || !data) return [];
    return ((data as { locations?: StoreLocation[] }).locations ?? []);
  } catch {
    // A store without sedes reads as before if the read itself fails.
    return [];
  }
}

// Stock per location for some SKU (or all of a store's, when itemIds is null), in pages the API accepts.
export async function getLocationStock(supabase: AnyClient, storeId: string, itemIds: string[] | null): Promise<LocationStock[] | null> {
  const db = supabase as unknown as SupabaseClient;
  const rows: LocationStock[] = [];
  const batches: (string[] | null)[] = [];
  if (itemIds) {
    const distinctIds = [...new Set(itemIds)];
    for (let start = 0; start < distinctIds.length; start += 200) batches.push(distinctIds.slice(start, start + 200));
  } else batches.push(null);
  for (const ids of batches) {
    let from = 0;
    let total = 0;
    do {
      // One SKU can have 20 location rows. Even a 200-SKU chunk needs pagination; use the exact first-page count
      // so a server-side row cap cannot turn a truncated response into a successful export with false zeroes.
      let query = db.from("store_location_stock").select("location_id,item_id,quantity_on_hand", from === 0 ? { count: "exact" } : undefined)
        .eq("store_id", storeId).order("item_id").order("location_id").range(from, from + 999);
      if (ids) query = query.in("item_id", ids);
      const { data, error, count } = await query;
      if (error) return null;
      if (from === 0) {
        if (count === null) return null;
        total = count;
      }
      if (!data?.length && from < total) return null;
      rows.push(...((data ?? []) as LocationStock[]));
      from += data?.length ?? 0;
    } while (from < total);
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
