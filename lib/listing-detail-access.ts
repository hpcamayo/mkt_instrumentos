import type { SupabaseClient } from "@supabase/supabase-js";
import type { MakerAccess } from "@/lib/maker-details";

// listing-details: which optional listing fields this seller may fill in the sell form. Each batch whose field depends
// on the seller adds its part here. Read with the seller's own session (RLS shows them their own rows only); a failed
// read hides the field, never blocks selling.
export type ListingDetailAccess = { maker?: MakerAccess };

export async function loadListingDetailAccess(supabase: unknown, seller: { userId: string; storeId?: string | null }): Promise<ListingDetailAccess> {
  const client = supabase as SupabaseClient;
  // BEGIN listing detail access (additive: one read per batch, run together)
  const [makerProfile, artistProfile] = await Promise.all([
    seller.storeId ? client.from("store_maker_profiles").select("store_id").eq("store_id", seller.storeId).is("hidden_at", null).maybeSingle() : null,
    client.from("artist_profiles").select("user_id").eq("user_id", seller.userId).is("revoked_at", null).maybeSingle(),
  ]);
  return {
    maker: { handmade: Boolean(makerProfile && !makerProfile.error && makerProfile.data), artistNote: Boolean(!artistProfile.error && artistProfile.data) },
  };
  // END listing detail access
}
