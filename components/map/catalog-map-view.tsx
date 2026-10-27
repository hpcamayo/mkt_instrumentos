"use client";

import { CircleDashed, ExternalLink, ImageOff, Layers, Maximize2, Store } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { LngLatBounds, Marker, createMap, webGlAvailable, type GeoJSONSource, type MapLibreMap } from "@/components/map/maplibre";
import { buttonClasses } from "@/components/ui/button";
import { NoticeIcon, noticeClassName } from "@/components/ui/notice";
import { Price } from "@/components/ui/price";
import { VerifiedIcon } from "@/components/ui/verified-mark";
import { circleRing, googleMapsUrl, placeCountLabel, wazeUrl, type CatalogMap, type MapListing, type MapPlace } from "@/lib/catalog-map";
import { currentCondition } from "@/lib/listing-condition";
import { cn } from "@/lib/utils";

// buy-08 "Ver en mapa": the catalog's results as places. A store that shows its address is a pin with "Abrir en
// Google Maps" and "Abrir en Waze"; everyone else is an approximate area (a dashed circle), never a point. The list
// beside the map holds every place as a button, so the map is never the only way in: the zoom buttons, the list and the
// keyboard do all a gesture does. Loaded on demand by CatalogMapSwitch.

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; data: CatalogMap };

const AREA_SOURCE = "laria-zonas";
const PANEL_LISTINGS = 12;

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

type PlaceGroup = { key: string; places: MapPlace[]; latitude: number; longitude: number };

// Places whose markers would overlap at this zoom (closer than GROUP_PX on screen) become one group, anchored on its
// first place: stores first, then the busiest.
const GROUP_PX = 40;

function groupOnScreen(map: MapLibreMap, places: readonly MapPlace[]): PlaceGroup[] {
  const ordered = [...places].sort((a, b) => Number(b.kind === "store") - Number(a.kind === "store") || b.listings.length - a.listings.length);
  const groups: { x: number; y: number; places: MapPlace[] }[] = [];
  for (const place of ordered) {
    const point = map.project([place.longitude, place.latitude]);
    const near = groups.find((group) => Math.hypot(group.x - point.x, group.y - point.y) < GROUP_PX);
    if (near) near.places.push(place);
    else groups.push({ x: point.x, y: point.y, places: [place] });
  }
  return groups.map(({ places: members }) => ({
    key: members.map((place) => place.key).join("|"),
    places: members,
    latitude: members[0].latitude,
    longitude: members[0].longitude,
  }));
}

function placeBounds(places: readonly MapPlace[]) {
  const bounds = new LngLatBounds();
  for (const place of places) {
    if (place.kind === "area") for (const point of circleRing(place.latitude, place.longitude, place.radiusKm, 8)) bounds.extend(point);
    else bounds.extend([place.longitude, place.latitude]);
  }
  return bounds;
}

export default function CatalogMapView({ query }: { query: string }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [mapState, setMapState] = useState<"starting" | "ready" | "unavailable">("starting");
  const [backgroundFailed, setBackgroundFailed] = useState(false);
  const [hosts, setHosts] = useState<Record<string, HTMLElement>>({});
  const [groups, setGroups] = useState<PlaceGroup[]>([]);
  const [picked, setPicked] = useState<PlaceGroup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const detailRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoad({ state: "loading" });
    setSelected(null);
    setPicked(null);
    fetch(`/api/catalog/map${query ? `?${query}` : ""}`, { headers: { accept: "application/json" }, signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: CatalogMap) => setLoad({ state: "ready", data }))
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ state: "error" });
      });
    return () => controller.abort();
  }, [query, attempt]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!webGlAvailable()) {
      setMapState("unavailable");
      return;
    }
    let map: MapLibreMap;
    try {
      map = createMap(container);
    } catch {
      setMapState("unavailable");
      return;
    }
    mapRef.current = map;
    let styled = false;
    map.once("load", () => {
      styled = true;
    });
    // The style or its tiles could not load (offline, blocked): the pins and the list keep working on a plain ground.
    map.on("error", () => {
      if (!styled) setBackgroundFailed(true);
    });
    setMapState("ready");
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const places = useMemo(() => (load.state === "ready" ? load.data.places : []), [load]);

  const showAll = useCallback(() => {
    const map = mapRef.current;
    if (!map || places.length === 0) return;
    map.fitBounds(placeBounds(places), { padding: 56, maxZoom: 13, animate: !reducedMotion() });
  }, [places]);

  // The places drawn: the areas as dashed circles, the view fitted to them, and the markers grouped again at each zoom.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapState !== "ready") return;
    const areas: Parameters<GeoJSONSource["setData"]>[0] = {
      type: "FeatureCollection",
      features: places.flatMap((place) =>
        place.kind === "area"
          ? [{ type: "Feature" as const, properties: { key: place.key }, geometry: { type: "Polygon" as const, coordinates: [circleRing(place.latitude, place.longitude, place.radiusKm)] } }]
          : [],
      ),
    };
    const drawAreas = () => {
      const source = map.getSource(AREA_SOURCE) as GeoJSONSource | undefined;
      if (source) {
        source.setData(areas);
        return;
      }
      map.addSource(AREA_SOURCE, { type: "geojson", data: areas });
      map.addLayer({ id: `${AREA_SOURCE}-relleno`, type: "fill", source: AREA_SOURCE, paint: { "fill-color": "#6BA6FF", "fill-opacity": 0.16 } });
      map.addLayer({ id: `${AREA_SOURCE}-borde`, type: "line", source: AREA_SOURCE, paint: { "line-color": "#4B5563", "line-width": 1.5, "line-dasharray": [2, 2] } });
    };
    if (map.isStyleLoaded()) drawAreas();
    else map.once("load", drawAreas);
    if (places.length) map.fitBounds(placeBounds(places), { padding: 56, maxZoom: 13, animate: false });
    const regroup = () => setGroups(groupOnScreen(map, places));
    regroup();
    map.on("zoomend", regroup);
    return () => {
      map.off("load", drawAreas);
      map.off("zoomend", regroup);
    };
  }, [places, mapState]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = groups.map((group) => {
      const element = document.createElement("div");
      // Clusters above store pins above areas, so a shop is never hidden behind an area's badge.
      element.style.zIndex = group.places.length > 1 ? "3" : group.places[0].kind === "store" ? "2" : "1";
      const anchor = group.places.length === 1 && group.places[0].kind === "store" ? "bottom" : "center";
      const marker = new Marker({ element, anchor }).setLngLat([group.longitude, group.latitude]).addTo(map);
      return { key: group.key, element, marker };
    });
    setHosts(Object.fromEntries(markers.map(({ key, element }) => [key, element])));
    return () => {
      for (const { marker } of markers) marker.remove();
      setHosts({});
    };
  }, [groups]);

  // A cluster opens up by zooming in; when it cannot (the places share a point), the panel lists them.
  function openGroup(group: PlaceGroup) {
    const map = mapRef.current;
    if (!map) return;
    // The centres only: an area's circle may hold the others.
    const bounds = placeBounds(group.places.map((place) => (place.kind === "area" ? { ...place, radiusKm: 0.05 } : place)));
    const camera = map.cameraForBounds(bounds, { padding: 80, maxZoom: 16 });
    if (!camera || camera.zoom === undefined || camera.zoom <= map.getZoom() + 0.25) {
      setPicked(group);
      setSelected(null);
      requestAnimationFrame(() => detailRef.current?.focus());
      return;
    }
    setPicked(null);
    if (reducedMotion()) map.jumpTo(camera);
    else map.easeTo({ ...camera, duration: 500 });
  }

  function choose(place: MapPlace, from: "map" | "list") {
    setSelected(place.key);
    setPicked(null);
    const map = mapRef.current;
    if (map) {
      const zoom = place.kind === "store" ? 15 : place.radiusKm <= 2 ? 13 : place.radiusKm <= 5 ? 11.5 : 10;
      const target = { center: [place.longitude, place.latitude] as [number, number], zoom: Math.max(map.getZoom(), zoom) };
      if (reducedMotion()) map.jumpTo(target);
      else map.easeTo({ ...target, duration: 500 });
    }
    // From the list, the details take focus so the next Tab reads them; on the map the pin keeps it.
    if (from === "list") requestAnimationFrame(() => detailRef.current?.focus());
  }

  const current = places.find((place) => place.key === selected) ?? null;
  const data = load.state === "ready" ? load.data : null;

  return (
    <section aria-labelledby="mapa-resultados" className="grid gap-4">
      <h2 id="mapa-resultados" className="sr-only">Resultados en el mapa</h2>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="grid gap-2">
          {mapState === "unavailable" ? (
            <div className={noticeClassName("info")}>
              <NoticeIcon tone="info" />
              <p className="min-w-0 flex-1">Este dispositivo no puede mostrar el mapa. Tienes los mismos lugares en la lista.</p>
            </div>
          ) : (
            <div className="relative">
              <div
                ref={containerRef}
                role="region"
                aria-label="Mapa de resultados. Usa los botones de acercar y alejar, o la lista de lugares."
                className="h-[60vh] min-h-80 w-full overflow-hidden rounded-panel border border-line-strong bg-canvas lg:h-[560px]"
              />
              {places.length ? (
                <button type="button" onClick={showAll} className={buttonClasses({ variant: "secondary", size: "sm", className: "absolute left-2 top-2 shadow-level-1" })}>
                  <Maximize2 aria-hidden="true" />
                  Ver todos
                </button>
              ) : null}
              {load.state === "loading" ? <p className="absolute inset-x-0 top-1/2 text-center t-ui font-semibold text-ink" role="status">Cargando el mapa…</p> : null}
              {/* Phones: the details sit below the map, so the chosen place says so at the map's foot. */}
              {current ? (
                <div className="absolute inset-x-2 bottom-9 flex items-center gap-2 rounded-panel border border-line-strong bg-surface p-2 pl-3 shadow-level-2 lg:hidden">
                  <PlaceIcon place={current} />
                  <p className="min-w-0 flex-1 t-ui text-ink">
                    <span className="block truncate font-semibold">{current.label}</span>
                    <span className="block t-meta">{placeCountLabel(current.listings.length)}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      detailRef.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
                      detailRef.current?.focus({ preventScroll: true });
                    }}
                    className={buttonClasses({ variant: "secondary", size: "sm" })}
                  >
                    Ver publicaciones
                  </button>
                </div>
              ) : null}
            </div>
          )}
          {backgroundFailed && mapState === "ready" ? <p className="t-meta">No pudimos cargar el fondo del mapa. Los lugares siguen marcados.</p> : null}
          <MapLegend />
        </div>

        <div className="grid gap-4 lg:max-h-[600px] lg:overflow-y-auto lg:pr-1">
          {load.state === "error" ? (
            <div role="alert" className={noticeClassName("danger")}>
              <NoticeIcon tone="danger" />
              <div className="min-w-0 flex-1">
                <p>No pudimos cargar los lugares. Vuelve a intentarlo en unos minutos.</p>
                <button type="button" onClick={() => setAttempt((value) => value + 1)} className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-3" })}>
                  Reintentar
                </button>
              </div>
            </div>
          ) : null}
          {data ? <MapSummary data={data} /> : null}
          {current ? <PlaceDetail place={current} headingRef={detailRef} onClose={() => setSelected(null)} /> : null}
          {picked && !current ? (
            <section aria-labelledby="mapa-varios" className="rounded-panel border border-line-strong bg-surface p-4">
              <div className="flex items-start gap-2">
                <h3 id="mapa-varios" ref={detailRef} tabIndex={-1} className="min-w-0 flex-1 t-section text-ink">Varios lugares aquí</h3>
                <button type="button" onClick={() => setPicked(null)} className={buttonClasses({ variant: "quiet", size: "sm" })}>
                  Cerrar
                </button>
              </div>
              <ul className="mt-2 grid gap-1.5">
                {picked.places.map((place) => (
                  <li key={place.key}>
                    <PlaceButton place={place} pressed={false} onChoose={() => choose(place, "list")} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {data && data.places.length ? (
            <nav aria-label="Lugares en el mapa">
              <h3 className="t-ui font-semibold text-ink">Lugares</h3>
              <ul className="mt-2 grid gap-1.5">
                {data.places.map((place) => (
                  <li key={place.key}>
                    <PlaceButton place={place} pressed={place.key === selected} onChoose={() => choose(place, "list")} />
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
      </div>

      {Object.entries(hosts).map(([key, element]) => {
        const group = groups.find((item) => item.key === key);
        if (!group) return null;
        const [first] = group.places;
        return createPortal(
          group.places.length === 1 ? (
            <MarkerButton place={first} pressed={first.key === selected} onChoose={() => choose(first, "map")} />
          ) : (
            <ClusterButton group={group} onOpen={() => openGroup(group)} />
          ),
          element,
          key,
        );
      })}
    </section>
  );
}

function PlaceButton({ place, pressed, onChoose }: { place: MapPlace; pressed: boolean; onChoose: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onChoose}
      className={cn(
        "flex min-h-11 w-full items-center gap-2 rounded-control border px-3 py-2 text-left t-ui text-ink hover:bg-canvas",
        pressed ? "border-ink bg-accent-tint font-semibold" : "border-line-strong bg-surface",
      )}
    >
      <PlaceIcon place={place} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{place.label}</span>
        <span className="block t-meta">{place.kind === "store" ? "Tienda" : "Zona aproximada"} · {placeCountLabel(place.listings.length)}</span>
      </span>
    </button>
  );
}

// Places closer on screen than a marker's width share one round badge with the sum; it zooms in to part them.
function ClusterButton({ group, onOpen }: { group: PlaceGroup; onOpen: () => void }) {
  const count = group.places.reduce((sum, place) => sum + place.listings.length, 0);
  return (
    <button
      type="button"
      aria-label={`${group.places.length} lugares cerca: ${placeCountLabel(count)}. Acercar para verlos`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-full border-2 border-ink bg-surface px-2.5 t-meta font-semibold text-ink shadow-level-1 outline outline-2 outline-offset-1 outline-surface hover:bg-canvas"
    >
      <Layers aria-hidden="true" className="h-3.5 w-3.5" />
      <span className="tabular-nums">{count}</span>
    </button>
  );
}

function PlaceIcon({ place, className }: { place: MapPlace; className?: string }) {
  return place.kind === "store" ? <Store aria-hidden="true" className={cn("h-4 w-4 shrink-0", className)} /> : <CircleDashed aria-hidden="true" className={cn("h-4 w-4 shrink-0", className)} />;
}

// On the map: a solid pin for a store's shop, a dashed badge for an area. Each says its kind in words to assistive
// technology and by shape on screen, and the chosen one is inverted, never told by color alone.
function MarkerButton({ place, pressed, onChoose }: { place: MapPlace; pressed: boolean; onChoose: () => void }) {
  const count = place.listings.length;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={`${place.label}, ${place.kind === "store" ? "tienda" : "zona aproximada"}: ${placeCountLabel(count)}`}
      onClick={(event) => {
        event.stopPropagation();
        onChoose();
      }}
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center gap-1 px-2 t-meta font-semibold shadow-level-1",
        place.kind === "store" ? "rounded-control border-2 border-ink" : "rounded-full border-2 border-dashed border-ink",
        pressed ? "bg-ink text-surface outline outline-2 outline-offset-2 outline-ink" : "bg-surface text-ink hover:bg-canvas",
      )}
    >
      <PlaceIcon place={place} className="h-3.5 w-3.5" />
      <span className="tabular-nums">{count}</span>
    </button>
  );
}

function MapLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 t-meta" aria-label="Qué significa cada marca">
      <li className="inline-flex items-center gap-1.5">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-tag border-2 border-ink bg-surface text-ink"><Store aria-hidden="true" className="h-3 w-3" /></span>
        Tienda con dirección publicada
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-dashed border-ink bg-surface text-ink"><CircleDashed aria-hidden="true" className="h-3 w-3" /></span>
        Zona aproximada: la ciudad o el distrito, nunca una dirección
      </li>
    </ul>
  );
}

function MapSummary({ data }: { data: CatalogMap }) {
  if (data.shown === 0) return <p className="t-ui text-ink" role="status">No hay resultados para mostrar en el mapa.</p>;
  return (
    <div className="grid gap-1 t-ui text-ink" role="status">
      <p>
        {placeCountLabel(data.shown)} en {data.places.length === 1 ? "1 lugar" : `${data.places.length} lugares`}.
      </p>
      {data.total > data.shown ? <p className="t-meta">Mostramos las {data.shown} más recientes de {data.total}. Usa los filtros para acotar.</p> : null}
      {data.unplaced > 0 ? <p className="t-meta">{data.unplaced === 1 ? "1 publicación no tiene" : `${data.unplaced} publicaciones no tienen`} una ciudad que podamos ubicar.</p> : null}
    </div>
  );
}

function PlaceDetail({ place, headingRef, onClose }: { place: MapPlace; headingRef: RefObject<HTMLHeadingElement | null>; onClose: () => void }) {
  const [all, setAll] = useState(false);
  const listings = all ? place.listings : place.listings.slice(0, PANEL_LISTINGS);
  return (
    <section aria-labelledby="mapa-lugar" className="rounded-panel border border-line-strong bg-surface p-4">
      <div className="flex items-start gap-2">
        <PlaceIcon place={place} className="mt-1" />
        <div className="min-w-0 flex-1">
          <h3 id="mapa-lugar" ref={headingRef} tabIndex={-1} className="t-section text-ink">
            {place.label}
            {place.kind === "store" && place.verified ? <VerifiedIcon className="ml-1 inline h-4 w-4 align-[-2px]" /> : null}
          </h3>
          <p className="t-meta">{place.kind === "store" ? place.detail ?? "Tienda" : "Zona aproximada. El lugar exacto lo acuerdas con quien vende."}</p>
        </div>
        <button type="button" onClick={onClose} className={buttonClasses({ variant: "quiet", size: "sm" })}>
          Cerrar
        </button>
      </div>
      {place.kind === "store" ? (
        <div className="mt-3 grid gap-2">
          <div className="flex flex-wrap gap-2">
            <ExternalMapLink href={googleMapsUrl(place.latitude, place.longitude)} label="Abrir en Google Maps" />
            <ExternalMapLink href={wazeUrl(place.latitude, place.longitude)} label="Abrir en Waze" />
          </div>
          <p className="t-meta">Tu app de mapas te muestra cómo llegar. <Link href={`/tiendas/${place.storeSlug}`} className="link font-semibold">Ver la tienda</Link></p>
        </div>
      ) : null}
      <ul className="mt-3 grid gap-2">
        {listings.map((listing) => (
          <li key={listing.id}>
            <MapListingRow listing={listing} />
          </li>
        ))}
      </ul>
      {place.listings.length > PANEL_LISTINGS && !all ? (
        <button type="button" onClick={() => setAll(true)} className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-3" })}>
          Ver las {place.listings.length}
        </button>
      ) : null}
    </section>
  );
}

function ExternalMapLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "sm" })}>
      {label}
      <ExternalLink aria-hidden="true" />
      <span className="sr-only"> (se abre en otra pestaña)</span>
    </a>
  );
}

function MapListingRow({ listing }: { listing: MapListing }) {
  return (
    <Link href={`/instrumentos/${listing.slug}`} className="flex min-h-11 gap-3 rounded-control p-1 hover:bg-canvas">
      <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-control bg-canvas">
        {listing.photo ? <Image src={listing.photo} alt="" width={64} height={64} sizes="64px" className="h-full w-full object-cover" /> : <ImageOff aria-hidden="true" className="h-5 w-5 text-ink-3" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 t-ui font-semibold text-ink">{listing.title}</span>
        <span className="flex flex-wrap items-baseline gap-x-2">
          <Price value={listing.price_pen} size="inline" className="t-ui" />
          <span className="t-meta">{currentCondition(listing.condition)}</span>
        </span>
      </span>
    </Link>
  );
}
