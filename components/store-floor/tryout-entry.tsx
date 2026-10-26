import type { SupabaseClient } from "@supabase/supabase-js";
import { TryoutBooking } from "@/components/store-floor/tryout-booking";

// buy-07: "Reservar una prueba" shows only when the store takes try-outs (store_tryout_settings, public for active
// stores). The slots themselves load when the buyer opens the sheet.
export async function TryoutEntry({
  supabase,
  storeId,
  storeName,
  listingId,
  className,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>;
  storeId: string;
  storeName: string;
  listingId: string;
  className?: string;
}) {
  const { data } = await (supabase as unknown as SupabaseClient)
    .from("store_tryout_settings")
    .select("enabled")
    .eq("store_id", storeId)
    .maybeSingle();
  if (!(data as { enabled?: boolean } | null)?.enabled) return null;
  return <TryoutBooking listingId={listingId} storeName={storeName} className={className} />;
}
