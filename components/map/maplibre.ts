"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { AttributionControl, Map as MapLibreMap, NavigationControl, setWorkerUrl, type MapOptions } from "maplibre-gl";
import { PERU_BOUNDS, PERU_CENTER } from "@/lib/places";

// buy-08: MapLibre GL with OpenFreeMap's tiles (no key, no account). Only the map components import this file, and
// they load on demand (next/dynamic), so the catalog's own pages never carry the library.
//
// Content Security Policy: the style, tiles, glyphs and sprites come from tiles.openfreemap.org (connect-src and
// img-src); the library's worker is a file of this site (worker-src 'self' blob:). See docs/feature-ideas/listing-details.md.

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

let workerReady = false;

// The worker ships as its own file next to the page's chunks.
function prepareWorker() {
  if (workerReady) return;
  setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
  workerReady = true;
}

// The library's own labels, in Spanish.
const MAP_LOCALE: Record<string, string> = {
  "AttributionControl.ToggleAttribution": "Mostrar u ocultar los créditos del mapa",
  "AttributionControl.MapFeedback": "Reportar un error del mapa",
  "LogoControl.Title": "Logo de MapLibre",
  "Map.Title": "Mapa",
  "Marker.Title": "Marcador",
  "NavigationControl.ResetBearing": "Volver a orientar al norte",
  "NavigationControl.ZoomIn": "Acercar",
  "NavigationControl.ZoomOut": "Alejar",
  "Popup.Close": "Cerrar",
  "CooperativeGesturesHandler.WindowsHelpText": "Usa Ctrl y la rueda del mouse para acercar el mapa",
  "CooperativeGesturesHandler.MacHelpText": "Usa ⌘ y la rueda del mouse para acercar el mapa",
  "CooperativeGesturesHandler.MobileHelpText": "Usa dos dedos para mover el mapa",
};

// A map of Peru with the zoom buttons (every gesture has a button) and the tiles' credits always reachable. On phones
// one finger scrolls the page and two move the map, so the map never traps the scroll.
export function createMap(container: HTMLElement, options: Partial<MapOptions> = {}) {
  prepareWorker();
  const map = new MapLibreMap({
    container,
    style: MAP_STYLE_URL,
    center: [PERU_CENTER.longitude, PERU_CENTER.latitude],
    zoom: 4.3,
    minZoom: 3.5,
    maxZoom: 17,
    maxBounds: [[PERU_BOUNDS.west - 4, PERU_BOUNDS.south - 4], [PERU_BOUNDS.east + 4, PERU_BOUNDS.north + 4]],
    attributionControl: false,
    cooperativeGestures: true,
    dragRotate: false,
    pitchWithRotate: false,
    locale: MAP_LOCALE,
    ...options,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(new NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new AttributionControl({ compact: false }), "bottom-right");
  return map;
}

export function webGlAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export { LngLatBounds, Marker } from "maplibre-gl";
export type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
