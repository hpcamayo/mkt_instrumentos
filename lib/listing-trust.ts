import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { readListingTrust, readStoreTrust } from "@/lib/deal-trust";
import { getRequestReads, optionalReadSignal } from "@/lib/supabase/public-read-client";

// One get_listing_trust per publication per render (React cache): the seller card's mark, the meetup entry and the
// history card all read it. An optional read with the short budget: a slow or failed call leaves the marks out, it
// never holds the page. The functions are this batch's, not in database.types.ts, hence the untyped client.
export const getListingTrust = cache(async (listingId: string) => {
  const { supabase, deadline } = getRequestReads();
  if (!supabase) return null;
  try {
    const { data, error } = await (supabase as unknown as SupabaseClient)
      .rpc("get_listing_trust", { p_listing_id: listingId })
      .abortSignal(optionalReadSignal(deadline));
    return error ? null : readListingTrust(data);
  } catch {
    return null;
  }
});

export const getStoreTrust = cache(async (storeId: string) => {
  const { supabase, deadline } = getRequestReads();
  if (!supabase) return null;
  try {
    const { data, error } = await (supabase as unknown as SupabaseClient)
      .rpc("get_store_trust", { p_store_id: storeId })
      .abortSignal(optionalReadSignal(deadline));
    return error ? null : readStoreTrust(data);
  } catch {
    return null;
  }
});
