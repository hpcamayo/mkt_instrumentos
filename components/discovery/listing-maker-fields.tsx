import type { SupabaseClient } from "@supabase/supabase-js";
import { ListingMakerForm, type ListingMakerFormState } from "@/components/discovery/listing-maker-form";

// disc-04 and disc-05 on the listing's edit page: the marks this seller may use. Nothing for a seller who is neither a
// maker store nor a verified artist, so the edit page stays as it is for everyone else.
export async function ListingMakerFields({ supabase, listingId }: { supabase: unknown; listingId: string }) {
  const { data, error } = await (supabase as SupabaseClient).rpc("get_listing_maker_form", { p_listing_id: listingId });
  const state = !error && data && typeof data === "object" ? (data as ListingMakerFormState) : null;
  if (!state || (!state.can_mark_handmade && !state.can_add_artist_note)) return null;
  return <ListingMakerForm listingId={listingId} initial={state} />;
}
