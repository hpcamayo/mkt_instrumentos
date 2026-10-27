import type { Metadata } from "next";
import type { ListingFilters, ListingSort } from "@/lib/listings";
import { categoryOptions, sortOptions } from "@/lib/listings";
import { DEFAULT_OG_IMAGES, NOINDEX_FOLLOW_ROBOTS, OPEN_GRAPH_BASE, SITE_NAME } from "@/lib/site";

// Pure helpers for the storefront ideas of the "stores" batch (docs/ux-effortless/stores.md): the stores directory
// (find-13), search and sort inside a store (find-14), where the store is and when it opens (list-12) and the owner's
// preview (shop-04). Server pages and the tests share them.

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() || undefined;

// ------------------------------------------------------------------ list-12: address, map link, hours

export type StoreLocationSource = {
  // The street address only when the store agreed to show it (show_address), computed by the database; the raw
  // address is not readable through the public API.
  public_address?: string | null;
  district?: string | null;
  city?: string | null;
  region?: string | null;
  opening_hours?: string | null;
};

export type PublicStoreLocation = {
  // The street address, only when the store agreed to show it (show_address).
  address: string | null;
  // A Google Maps search for the address, district and city; null without a shown address.
  mapsHref: string | null;
  hours: string | null;
};

// A Google Maps search URL (https://developers.google.com/maps/documentation/urls/get-started#search-action): the
// street address, the district and the city, then the country so a short address does not land abroad.
export function mapsSearchUrl(parts: { address: string; district?: string | null; city?: string | null }) {
  const query = [parts.address, parts.district, parts.city, "Perú"]
    .map((part) => part?.trim())
    .filter((part, index, all): part is string => Boolean(part) && all.findIndex((other) => other?.toLowerCase() === part!.toLowerCase()) === index)
    .join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// Where the store is and when it opens, from public_address (null unless the store agreed to show its address).
export function publicStoreLocation(store: StoreLocationSource): PublicStoreLocation {
  const address = store.public_address?.trim() || null;
  const hours = store.opening_hours?.trim() || null;
  return {
    address,
    mapsHref: address ? mapsSearchUrl({ address, district: store.district, city: store.city }) : null,
    hours,
  };
}

// Drops the address from a store row once publicStoreLocation has read it.
export function withoutPrivateStoreFields<T extends StoreLocationSource>(store: T) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { public_address, ...rest } = store;
  return rest;
}

// ------------------------------------------------------------------ find-14: filters inside a store

// The store page keeps the catalog's parameter names (category, brand, sort, page) so its URLs read like the
// catalog's, and ignores every other catalog filter.
export function storeListingFilters(searchParams: SearchParams): ListingFilters {
  const category = first(searchParams.category);
  const sort = first(searchParams.sort);
  return {
    category: category && categoryOptions.some((option) => option.value === category) ? category : undefined,
    brand: first(searchParams.brand)?.slice(0, 200),
    cities: [],
    conditions: [],
    advanced: {},
    sort: sortOptions.some((option) => option.value === sort) ? (sort as ListingSort) : "newest",
  };
}

// The URL parameters the store page's pagination keeps.
export function storeFilterParams(filters: ListingFilters): Record<string, string> {
  return {
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.brand ? { brand: filters.brand } : {}),
    ...(filters.sort !== "newest" ? { sort: filters.sort } : {}),
  };
}

export function storeFiltersActive(filters: ListingFilters) {
  return Boolean(filters.category || filters.brand);
}

export type StoreCategoryCount = { category: string; listing_count: number };

// The category chips: only categories the store has, in taxonomy order, with their real counts.
export function storeCategoryChips(counts: readonly StoreCategoryCount[]) {
  const byCategory = new Map(counts.map((row) => [row.category, Number(row.listing_count)]));
  return categoryOptions
    .filter((option) => (byCategory.get(option.value) ?? 0) > 0)
    .map((option) => ({ value: option.value as string, label: option.label as string, count: byCategory.get(option.value)! }));
}

// ------------------------------------------------------------------ find-13: the stores directory

export const STORES_PATH = "/tiendas";
export const STORE_LISTINGS_VIEW = "publicaciones";

export type StoreDirectoryView = "tiendas" | "publicaciones";

export function storeDirectoryView(searchParams: SearchParams): StoreDirectoryView {
  return first(searchParams.vista) === STORE_LISTINGS_VIEW ? "publicaciones" : "tiendas";
}

export function storeDirectoryCity(searchParams: SearchParams) {
  return first(searchParams.ciudad)?.slice(0, 80);
}

export function storeDirectoryHref({ view = "tiendas", city, page }: { view?: StoreDirectoryView; city?: string; page?: number } = {}) {
  const params = new URLSearchParams();
  if (view === "publicaciones") params.set("vista", STORE_LISTINGS_VIEW);
  if (view === "tiendas" && city) params.set("ciudad", city);
  if (page && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${STORES_PATH}?${query}` : STORES_PATH;
}

export type DirectoryStore = {
  id: string;
  name: string;
  slug: string;
  city: string;
  district: string | null;
  region: string | null;
  logo_url: string | null;
  is_verified: boolean;
  listing_count: number;
  review_count: number;
  average_rating: number | null;
};

// City chips: every city that has a store, the one with most stores first, then alphabetical.
export function storeDirectoryCities(stores: readonly Pick<DirectoryStore, "city">[]) {
  const counts = new Map<string, number>();
  for (const store of stores) {
    const city = store.city?.trim();
    if (city) counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .map(([city, count]) => ({ city, count }));
}

export function filterStoresByCity<T extends Pick<DirectoryStore, "city">>(stores: readonly T[], city: string | undefined) {
  if (!city) return [...stores];
  const wanted = city.toLocaleLowerCase("es-PE");
  return stores.filter((store) => store.city?.trim().toLocaleLowerCase("es-PE") === wanted);
}

export function storeRating(store: Pick<DirectoryStore, "review_count" | "average_rating">) {
  return store.review_count > 0 && store.average_rating !== null ? { average: Number(store.average_rating), count: store.review_count } : null;
}

// /tiendas is indexed; a city filter, the listings tab and later pages are noindex (follow), like the catalog's
// filtered URLs.
export function buildStoreDirectoryMetadata({ view, city, page }: { view: StoreDirectoryView; city?: string; page: number }): Metadata {
  const listings = view === "publicaciones";
  const title = listings ? "Publicaciones de tiendas verificadas" : city ? `Tiendas de instrumentos en ${city}` : "Tiendas de instrumentos en Perú";
  const titled = page > 1 ? `${title} – Página ${page}` : title;
  const description = listings
    ? "Instrumentos y equipo de las tiendas que Laria verificó a mano. Contacta a cada tienda directo por WhatsApp."
    : "Tiendas de instrumentos y audio en Perú: dónde están, cuántas publicaciones tienen y sus reseñas. Contacta a cada tienda directo por WhatsApp.";
  const url = storeDirectoryHref({ view, city, page });
  const plain = !listings && !city && page === 1;
  return {
    title: titled,
    description,
    ...(plain ? { alternates: { canonical: STORES_PATH } } : { robots: NOINDEX_FOLLOW_ROBOTS }),
    openGraph: { ...OPEN_GRAPH_BASE, title: `${titled} | ${SITE_NAME}`, description, url: plain ? STORES_PATH : url, images: DEFAULT_OG_IMAGES },
  };
}

// ------------------------------------------------------------------ shop-04: the owner's preview

export type StoreStatus = "pending" | "active" | "hidden" | "rejected";

// The notice above a store page its owner is looking at. Only the owner ever sees it.
export function ownerNotice(status: StoreStatus) {
  switch (status) {
    case "active":
      return { preview: false, title: "Esta es tu tienda", text: "Así ven tu página los compradores." };
    case "rejected":
      return {
        preview: true,
        title: "Vista previa: solo tú ves esta página",
        text: "Laria no aprobó tu solicitud. Revisa el motivo en Mi tienda, corrige los datos y vuelve a enviarla.",
      };
    case "hidden":
      return {
        preview: true,
        title: "Vista previa: solo tú ves esta página",
        text: "Laria ocultó tu tienda y por ahora nadie más la ve. Revisa los detalles en Mi tienda.",
      };
    default:
      return {
        preview: true,
        title: "Vista previa: solo tú ves esta página",
        text: "Será pública cuando Laria apruebe tu tienda.",
      };
  }
}

// A signed-in visitor carries a Supabase auth cookie. Without one the page skips the session lookup, so anonymous store
// visits cost no extra auth call.
export { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";
