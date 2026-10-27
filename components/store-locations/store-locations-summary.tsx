import type { SupabaseClient } from "@supabase/supabase-js";
import { StoreLocationsPanel } from "@/components/store-locations/store-locations-panel";
import { getOwnLocations } from "@/lib/store-locations-server";

// Loads what Mi tienda's "Locales y comprobantes" card says.
export async function StoreLocationsSummary({ supabase }: { supabase: SupabaseClient }) {
  const [locations, settings] = await Promise.all([getOwnLocations(supabase), supabase.rpc("get_einvoice_settings")]);
  const connected = Boolean((settings.data as { connected?: boolean } | null)?.connected);
  return <StoreLocationsPanel locations={locations.length} receiptsConnected={connected} />;
}
