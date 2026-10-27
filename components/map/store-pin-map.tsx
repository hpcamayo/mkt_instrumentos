"use client";

import { Crosshair } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Marker, createMap, webGlAvailable, type MapLibreMap } from "@/components/map/maplibre";
import type { StorePin } from "@/components/map/store-pin-field";
import { Button } from "@/components/ui/button";
import { districtPlace, isInPeru } from "@/lib/places";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// buy-08: the owner moves the map until the cross sits on the shop's door, then sets the pin there. Moving the map has
// buttons (zoom) and the keyboard (arrows) besides the gestures; the pin is set by a button, never by a tap alone.

type Status = { kind: "idle" | "saving" | "saved" | "error"; message: string };

export default function StorePinMap({ storeId, pin, district, city, region, onSaved }: {
  storeId: string;
  pin: StorePin;
  district: string | null;
  city: string | null;
  region: string | null;
  onSaved: (pin: StorePin) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [unavailable, setUnavailable] = useState(false);
  const [draft, setDraft] = useState<StorePin>(pin);
  const [status, setStatus] = useState<Status>({ kind: "idle", message: "" });
  const start = useMemo(() => pin ?? (() => {
    const place = districtPlace(district, city, region);
    return place ? { latitude: place.latitude, longitude: place.longitude } : null;
  })(), [pin, district, city, region]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!webGlAvailable()) {
      setUnavailable(true);
      return;
    }
    let map: MapLibreMap;
    try {
      map = createMap(container, start ? { center: [start.longitude, start.latitude], zoom: pin ? 16 : 14 } : {});
    } catch {
      setUnavailable(true);
      return;
    }
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // The map is made once; later pins move the marker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!draft) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const element = document.createElement("div");
      element.className = "h-7 w-7 rounded-full border-4 border-surface bg-ink shadow-level-1";
      element.setAttribute("aria-hidden", "true");
      markerRef.current = new Marker({ element }).setLngLat([draft.longitude, draft.latitude]).addTo(map);
    } else {
      markerRef.current.setLngLat([draft.longitude, draft.latitude]);
    }
  }, [draft]);

  function placeAtCenter() {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    if (!isInPeru(center.lat, center.lng)) {
      setStatus({ kind: "error", message: "Ubica el pin dentro del Perú." });
      return;
    }
    setDraft({ latitude: Number(center.lat.toFixed(6)), longitude: Number(center.lng.toFixed(6)) });
    setStatus({ kind: "idle", message: "Pin puesto en el centro del mapa. Guárdalo para que se use." });
  }

  async function save(next: StorePin) {
    if (!supabase) {
      setStatus({ kind: "error", message: "No se pudo conectar con Laria. Intenta nuevamente." });
      return;
    }
    setStatus({ kind: "saving", message: "Guardando…" });
    const { error } = await supabase.rpc("set_own_store_map_pin", {
      p_store_id: storeId,
      p_latitude: next?.latitude ?? null,
      p_longitude: next?.longitude ?? null,
    });
    if (error) {
      setStatus({ kind: "error", message: /STORE_MAP_PIN_INVALID/.test(error.message) ? "Ubica el pin dentro del Perú." : "No pudimos guardar el pin. Intenta nuevamente." });
      return;
    }
    setDraft(next);
    onSaved(next);
    setStatus({ kind: "saved", message: next ? "Pin guardado." : "Quitamos el pin." });
  }

  return (
    <div className="grid gap-3">
      {unavailable ? (
        <p className="t-ui text-ink">Este dispositivo no puede mostrar el mapa. Puedes ubicar tu tienda desde otro dispositivo.</p>
      ) : (
        <div className="relative">
          <div
            ref={containerRef}
            role="region"
            aria-label="Mapa para ubicar tu tienda. Muévelo con las flechas del teclado o con los botones de acercar y alejar."
            className="h-80 w-full overflow-hidden rounded-panel border border-line-strong bg-canvas"
          />
          <Crosshair aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-ink" />
        </div>
      )}
      <p className="t-meta">Mueve el mapa hasta que la cruz quede sobre la puerta de tu tienda.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={placeAtCenter} disabled={unavailable}>
          Poner el pin en la cruz
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => save(draft)} disabled={!draft || status.kind === "saving"} loading={status.kind === "saving"} loadingLabel="Guardando…">
          Guardar el pin
        </Button>
        {pin || draft ? (
          <Button type="button" variant="danger" size="sm" onClick={() => save(null)} disabled={status.kind === "saving"}>
            Quitar el pin
          </Button>
        ) : null}
      </div>
      <p role="status" className={status.kind === "error" ? "t-ui font-semibold text-danger" : "t-ui text-ink"}>{status.message}</p>
    </div>
  );
}
