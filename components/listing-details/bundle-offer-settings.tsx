import type { SupabaseClient } from "@supabase/supabase-js";
import { BundleOfferForm } from "@/components/listing-details/bundle-offer-form";
import { readBundleOffer } from "@/lib/combo";

// buy-01 on the seller's side: the combo discount, for a store (by store) or a Particular (by account). Reads the
// current offer and hands it to the form.
export async function BundleOfferSettings({ supabase, storeId, userId }: { supabase: unknown; storeId?: string | null; userId?: string }) {
  const client = supabase as SupabaseClient;
  const query = client.from("seller_bundle_offers").select("discount_percent,min_items");
  if (!storeId && !userId) return null;
  const { data } = await (storeId ? query.eq("store_id", storeId) : query.eq("owner_user_id", userId!)).maybeSingle();
  return <BundleOfferForm initial={readBundleOffer(data)} isStore={Boolean(storeId)} />;
}
