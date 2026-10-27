import { MapPin } from "lucide-react";
import { getPublicStoreLocations } from "@/lib/store-locations-server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequestReads } from "@/lib/supabase/public-read-client";
import { locationPlace } from "@/lib/store-locations";

// run-02 on the store page: "Sedes", when the store has two or more. Street addresses only with each location's
// consent; never stock. Laria gives no directions: a shown address links to Google Maps.
export async function StoreLocationsSection({ storeId }: { storeId: string }) {
  const supabase = getRequestReads().supabase as unknown as SupabaseClient | null;
  if (!supabase) return null;
  const locations = await getPublicStoreLocations(supabase, storeId);
  if (locations.length < 2) return null;
  return (
    <section aria-labelledby="sedes-titulo" className="grid gap-3">
      <h2 id="sedes-titulo" className="t-section text-ink">Sedes</h2>
      <ul className="grid gap-3">
        {locations.map((location) => (
          <li key={location.id} className="grid gap-0.5 rounded-panel border border-subtle bg-white p-4">
            <p className="flex items-center gap-2 t-ui font-semibold text-ink"><MapPin aria-hidden className="h-4 w-4 shrink-0" />{location.name}{location.is_primary ? <span className="t-meta font-normal">Principal</span> : null}</p>
            <p className="t-meta">{locationPlace(location)}</p>
            {location.public_address ? (
              <p className="t-meta">
                {location.public_address}{" · "}
                <a className="link font-semibold" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([location.public_address, location.district, location.city].filter(Boolean).join(", "))}`} target="_blank" rel="noopener noreferrer">Abrir en Google Maps</a>
              </p>
            ) : null}
            {location.opening_hours ? <p className="t-meta">{location.opening_hours}</p> : null}
            {location.pickup_enabled ? null : <p className="t-meta">No se recoge en esta sede.</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
