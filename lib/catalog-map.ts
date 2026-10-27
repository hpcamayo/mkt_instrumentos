import { cityPlace, districtPlace } from "@/lib/places";

// buy-08 "Ver en mapa": the catalog's results as places on a map. A store that placed its pin and shows its address
// (stores.public_map_latitude/longitude, 20261202120600) is a pin with "Abrir en Google Maps" and "Abrir en Waze".
// Everyone else is an approximate area (lib/places.ts): a Particular by city, never closer; a store without a public
// pin by district. Laria gives no directions of its own. Pure, so the route, the map and the tests share it.

export const MAP_LISTING_LIMIT = 300;

export type MapListing = {
  id: string;
  title: string;
  slug: string;
  price_pen: number | null;
  condition: string;
  city: string;
  region: string | null;
  seller_type: "individual" | "store";
  photo: string | null;
  store: {
    name: string;
    slug: string;
    is_verified: boolean;
    district: string | null;
    city: string | null;
    region: string | null;
    public_address: string | null;
    public_map_latitude: number | null;
    public_map_longitude: number | null;
  } | null;
};

export type MapPlace =
  | {
      kind: "store";
      key: string;
      label: string;
      detail: string | null;
      latitude: number;
      longitude: number;
      verified: boolean;
      storeSlug: string;
      listings: MapListing[];
    }
  | {
      kind: "area";
      key: string;
      label: string;
      latitude: number;
      longitude: number;
      radiusKm: number;
      listings: MapListing[];
    };

export type CatalogMap = { places: MapPlace[]; shown: number; total: number; unplaced: number };

function storePin(listing: MapListing) {
  const store = listing.store;
  if (listing.seller_type !== "store" || !store) return null;
  const { public_map_latitude: latitude, public_map_longitude: longitude } = store;
  return typeof latitude === "number" && typeof longitude === "number" ? { latitude, longitude } : null;
}

// One place per store pin and per area, in order of how many results each holds (then by name), so the list beside
// the map reads from the busiest place.
export function groupMapPlaces(listings: readonly MapListing[], total = listings.length): CatalogMap {
  const places = new Map<string, MapPlace>();
  let unplaced = 0;
  for (const listing of listings) {
    const pin = storePin(listing);
    if (pin && listing.store) {
      const key = `tienda:${listing.store.slug}`;
      const place = places.get(key) ?? {
        kind: "store" as const,
        key,
        label: listing.store.name,
        detail: listing.store.public_address ?? ([listing.store.district, listing.store.city].filter(Boolean).join(", ") || null),
        ...pin,
        verified: listing.store.is_verified,
        storeSlug: listing.store.slug,
        listings: [],
      };
      place.listings.push(listing);
      places.set(key, place);
      continue;
    }
    const area = listing.seller_type === "store" && listing.store
      ? districtPlace(listing.store.district, listing.store.city ?? listing.city, listing.store.region ?? listing.region)
      : cityPlace(listing.city, listing.region);
    if (!area) {
      unplaced += 1;
      continue;
    }
    const key = `zona:${area.key}`;
    const place = places.get(key) ?? { kind: "area" as const, key, label: area.label, latitude: area.latitude, longitude: area.longitude, radiusKm: area.radiusKm, listings: [] };
    place.listings.push(listing);
    places.set(key, place);
  }
  const ordered = [...places.values()].sort((a, b) => b.listings.length - a.listings.length || a.label.localeCompare(b.label, "es"));
  return { places: ordered, shown: listings.length, total: Math.max(total, listings.length), unplaced };
}

// The outside apps a store pin opens. Both only show the point; the buyer asks their app for a route if they want one.
export function googleMapsUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps/search/?api=1&query=${latitude}%2C${longitude}`;
}

export function wazeUrl(latitude: number, longitude: number) {
  return `https://www.waze.com/ul?ll=${latitude}%2C${longitude}`;
}

// An area as a polygon (a circle on the ground) for the map's fill and outline layers: [longitude, latitude] pairs.
export function circleRing(latitude: number, longitude: number, radiusKm: number, steps = 48): [number, number][] {
  const ring: [number, number][] = [];
  const latDegrees = radiusKm / 110.574;
  const lngDegrees = radiusKm / (111.32 * Math.cos((latitude * Math.PI) / 180));
  for (let step = 0; step <= steps; step += 1) {
    const angle = (step / steps) * 2 * Math.PI;
    ring.push([Number((longitude + lngDegrees * Math.cos(angle)).toFixed(6)), Number((latitude + latDegrees * Math.sin(angle)).toFixed(6))]);
  }
  return ring;
}

// The place's line in the list and on its marker: "Miraflores, Lima · 3 publicaciones".
export function placeCountLabel(count: number) {
  return count === 1 ? "1 publicación" : `${count} publicaciones`;
}
