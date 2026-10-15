// A store's listing allowance (docs/store-operations/design.md §10, decision D-1): 50 concurrent pending or published
// listings unless Admin set another value. The database enforces it (enforce_store_inventory_cap); this module only
// reads it for the screens and turns the database message into the screens' wording.
import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_LISTING_ALLOWANCE = 50;

export type StoreListingQuota = { allowance: number; used: number; remaining: number };

// The signed-in owner's quota, or the default when it cannot be read (the database still enforces the real value).
export async function getStoreListingQuota(supabase: SupabaseClient | null, used: number): Promise<StoreListingQuota> {
  if (supabase) {
    const { data, error } = await supabase.rpc("get_store_listing_quota", {});
    const quota = data as { allowance?: unknown } | null;
    if (!error && typeof quota?.allowance === "number") {
      return { allowance: quota.allowance, used, remaining: Math.max(quota.allowance - used, 0) };
    }
  }
  return { allowance: DEFAULT_LISTING_ALLOWANCE, used, remaining: Math.max(DEFAULT_LISTING_ALLOWANCE - used, 0) };
}

// "STORE_INVENTORY_LIMIT_REACHED: La tienda ya tiene 500 publicaciones concurrentes." → the owner-facing sentence.
export function listingLimitMessage(databaseMessage: string | null | undefined) {
  const allowance = /ya tiene (\d+) publicaciones/.exec(databaseMessage ?? "")?.[1] ?? String(DEFAULT_LISTING_ALLOWANCE);
  return `Tu tienda alcanzó el límite de ${allowance} publicaciones concurrentes.`;
}
