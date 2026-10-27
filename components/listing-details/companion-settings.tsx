import type { SupabaseClient } from "@supabase/supabase-js";
import { CompanionPicker, type CompanionOption } from "@/components/listing-details/companion-picker";

// buy-01 on the edit page of a store's listing: "Lo que suele acompañarlo", chosen from the store's other listings
// still for sale. Nothing for a Particular's listing.
export async function ListingCompanionSettings({ supabase, listingId, storeId }: { supabase: unknown; listingId: string; storeId: string | null }) {
  if (!storeId) return null;
  const client = supabase as SupabaseClient;
  const [{ data: listings }, { data: chosen }] = await Promise.all([
    client
      .from("listings")
      .select("id,title,price_pen,status")
      .eq("store_id", storeId)
      .not("status", "in", "(sold,archived)")
      .neq("id", listingId)
      .order("title")
      .limit(300),
    client.from("listing_companions").select("companion_id,sort_order").eq("listing_id", listingId).order("sort_order"),
  ]);
  const options = (listings ?? []) as CompanionOption[];
  if (!options.length) return null;
  const known = new Set(options.map((option) => option.id));
  const initial = ((chosen ?? []) as { companion_id: string }[]).map((row) => row.companion_id).filter((id) => known.has(id));
  return <CompanionPicker listingId={listingId} options={options} initial={initial} />;
}
