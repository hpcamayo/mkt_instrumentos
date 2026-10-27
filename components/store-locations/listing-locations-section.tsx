import type { SupabaseClient } from "@supabase/supabase-js";
import { ListingLocations } from "@/components/store-locations/listing-locations";
import { getListingLocations } from "@/lib/store-locations-server";

// Loads the listing's locations (a store with two or more, with units of this listing) for the listing page.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ListingLocationsSection({ supabase, listingId, className }: { supabase: SupabaseClient<any, any, any>; listingId: string; className?: string }) {
  const locations = await getListingLocations(supabase, listingId);
  if (!locations.length) return null;
  return <ListingLocations listingId={listingId} locations={locations} className={className} />;
}
