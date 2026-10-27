"use client";

import { MapPin } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { buttonClasses } from "@/components/ui/button";

// buy-08: where a store's shop is, for the catalog's map. Optional and saved on its own (set_own_store_map_pin), apart
// from the store form. The pin is public only while the store shows its address; otherwise the map shows the
// store's district as an approximate area. The map loads only when the owner opens it.

export type StorePin = { latitude: number; longitude: number } | null;

const StorePinMap = dynamic(() => import("@/components/map/store-pin-map"), {
  ssr: false,
  loading: () => <p className="t-ui text-ink" role="status">Cargando el mapa…</p>,
});

export function StorePinField({ storeId, pin, district, city, region }: {
  storeId: string;
  pin: StorePin;
  district: string | null;
  city: string | null;
  region: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<StorePin>(pin);
  return (
    <div className="grid gap-3 rounded-panel border border-subtle p-4" id="tienda-reg-mapa">
      <div>
        <h3 className="t-ui font-semibold text-ink">Tu tienda en el mapa (opcional)</h3>
        <p className="mt-1 t-meta">
          Si muestras tu dirección, tu tienda aparece como un pin en el mapa del catálogo, con enlaces para abrirla en Google Maps o
          Waze. Si no la muestras, aparece como una zona aproximada de tu distrito. El pin se guarda con su propio botón.
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 t-meta font-semibold text-ink">
          <MapPin aria-hidden="true" className="h-4 w-4" />
          {saved ? "Tienes un pin guardado." : "Aún no tienes un pin."}
        </p>
      </div>
      {open ? (
        <StorePinMap storeId={storeId} pin={saved} district={district} city={city} region={region} onSaved={setSaved} />
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={buttonClasses({ variant: "secondary", size: "sm", className: "justify-self-start" })}>
          {saved ? "Cambiar el pin" : "Ubicar mi tienda en el mapa"}
        </button>
      )}
    </div>
  );
}
