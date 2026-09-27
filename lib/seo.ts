import type { Metadata } from "next";
import type { CategoryLandingPage } from "@/lib/category-pages";
import { getCategoryLandingByValue } from "@/lib/category-pages";
import { instrumentFilterGroups } from "@/lib/instrument-filters";
import {
  formatPrice,
  getCategoryLabel,
  normalizeStore,
  type ListingDetailData,
} from "@/lib/listings";
import {
  NOINDEX_FOLLOW_ROBOTS,
  OPEN_GRAPH_BASE,
  SITE_NAME,
  absoluteUrl,
  truncateDescription,
} from "@/lib/site";

type SearchParams = Record<string, string | string[] | undefined>;

// Query keys that change catalog results. Anything else (for example utm_*) is
// ignored for indexing decisions and never forwarded.
export const catalogFilterKeys: ReadonlySet<string> = new Set([
  "category",
  "location",
  "city",
  "condition",
  "brand",
  "seller_type",
  "instrument_type",
  "min_price",
  "max_price",
  "sort",
  ...instrumentFilterGroups.flatMap((group) => group.filters.map((filter) => filter.key)),
]);

function values(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function paged(path: string, page: number) {
  return page > 1 ? `${path}?page=${page}` : path;
}

function activeFilterKeys(searchParams: SearchParams) {
  return Object.keys(searchParams).filter((key) => catalogFilterKeys.has(key) && values(searchParams[key]).length > 0);
}

// Category landing pages list the whole category; refinements belong to /listados.
export function categoryFilterRedirect(landing: CategoryLandingPage, searchParams: SearchParams) {
  const keys = activeFilterKeys(searchParams).filter((key) => key !== "category");
  if (keys.length === 0) return null;
  const params = new URLSearchParams({ category: landing.category });
  for (const key of keys) {
    for (const item of values(searchParams[key])) params.append(key, item);
  }
  return `/listados?${params}`;
}

export function buildCategoryMetadata(landing: CategoryLandingPage, page: number, count: number | null): Metadata {
  const path = `/instrumentos/${landing.slug}`;
  const canonical = paged(path, page);
  const title = page > 1 ? `${landing.heading} – Página ${page}` : landing.heading;
  return {
    title,
    description: landing.description,
    alternates: { canonical },
    // Empty categories stay reachable but are not offered to search engines.
    ...(count && count > 0 ? {} : { robots: NOINDEX_FOLLOW_ROBOTS }),
    openGraph: { ...OPEN_GRAPH_BASE, title: `${title} | ${SITE_NAME}`, description: landing.description, url: canonical },
  };
}

export function buildCatalogMetadata(searchParams: SearchParams, page: number): Metadata {
  const description = "Explora guitarras, bajos, baterías, pedales, amplificadores y equipos de audio de particulares y tiendas en Perú. Contacto directo por WhatsApp.";
  const keys = activeFilterKeys(searchParams);
  const base: Metadata = {
    title: page > 1 ? `Instrumentos musicales en venta en Perú – Página ${page}` : "Instrumentos musicales en venta en Perú",
    description,
    openGraph: { ...OPEN_GRAPH_BASE, title: `Instrumentos musicales en venta en Perú | ${SITE_NAME}`, description, url: "/listados" },
  };
  if (keys.length === 0) return { ...base, alternates: { canonical: paged("/listados", page) } };

  const category = values(searchParams.category)[0];
  const landing = keys.length === 1 && keys[0] === "category" ? getCategoryLandingByValue(category) : null;
  // A category-only catalog URL duplicates its landing page.
  if (landing && page === 1) return { ...base, title: landing.heading, alternates: { canonical: `/instrumentos/${landing.slug}` } };
  return { ...base, robots: NOINDEX_FOLLOW_ROBOTS };
}

function listingImages(listing: ListingDetailData) {
  return listing.listing_photos
    .map((photo) => photo.image_url)
    .filter((url) => typeof url === "string" && url.length > 0)
    .slice(0, 4)
    .map((url) => absoluteUrl(url));
}

export function listingSummary(listing: ListingDetailData) {
  const location = [listing.city, listing.region].filter(Boolean).join(", ");
  const facts = [
    listing.price_pen !== null ? formatPrice(listing.price_pen) : null,
    listing.condition,
    `${getCategoryLabel(listing.category)}${location ? ` en ${location}` : ""}`,
  ].filter(Boolean).join(" · ");
  const prefix = listing.status === "sold" ? "Vendido. " : "";
  const detail = listing.description ? ` ${listing.description}` : " Contacta al vendedor directo por WhatsApp.";
  return truncateDescription(`${prefix}${facts}.${detail}`);
}

export function buildListingMetadata(listing: ListingDetailData): Metadata {
  const canonical = `/instrumentos/${listing.slug}`;
  const title = listing.status === "sold" ? `${listing.title} (vendido)` : listing.title;
  const description = listingSummary(listing);
  const images = listingImages(listing).slice(0, 1);
  return {
    title,
    description,
    alternates: { canonical },
    // Sold listings remain at their direct URL as history but leave the index.
    ...(listing.status === "sold" ? { robots: NOINDEX_FOLLOW_ROBOTS } : {}),
    openGraph: {
      ...OPEN_GRAPH_BASE,
      title: `${title} | ${SITE_NAME}`,
      description,
      url: canonical,
      ...(images.length ? { images: images.map((url) => ({ url, alt: listing.title })) } : {}),
    },
    twitter: { card: images.length ? "summary_large_image" : "summary", title, description },
  };
}

export function buildListingJsonLd(listing: ListingDetailData) {
  const url = absoluteUrl(`/instrumentos/${listing.slug}`);
  const store = listing.seller_type === "store" ? normalizeStore(listing) : null;
  const images = listingImages(listing);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.title,
    url,
    category: getCategoryLabel(listing.category),
    ...(listing.description ? { description: truncateDescription(listing.description, 500) } : {}),
    ...(images.length ? { image: images } : {}),
    ...(listing.brand ? { brand: { "@type": "Brand", name: listing.brand } } : {}),
    ...(listing.model ? { model: listing.model } : {}),
    ...(listing.price_pen !== null
      ? {
          offers: {
            "@type": "Offer",
            url,
            price: listing.price_pen,
            priceCurrency: "PEN",
            availability: listing.status === "sold" ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
            itemCondition: listing.condition === "Nuevo" ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition",
            // Individual sellers are not named in structured data; stores are public businesses.
            ...(store ? { seller: { "@type": "Organization", name: store.name } } : {}),
          },
        }
      : {}),
  };
}

export type StoreSeoData = {
  name: string;
  slug: string;
  description: string | null;
  city: string;
  district: string | null;
  logo_url: string | null;
};

export function buildStoreMetadata(store: StoreSeoData, page: number): Metadata {
  const canonical = paged(`/tiendas/${store.slug}`, page);
  const location = [store.district, store.city].filter(Boolean).join(", ");
  const title = page > 1 ? `${store.name} – Página ${page}` : `${store.name}${store.city ? ` – Tienda de instrumentos en ${store.city}` : ""}`;
  const description = truncateDescription(
    store.description?.trim()
      ? store.description
      : `Productos de ${store.name}${location ? ` en ${location}` : ""}. Revisa su inventario en Laria y contacta a la tienda directo por WhatsApp.`,
  );
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      ...OPEN_GRAPH_BASE,
      title: `${title} | ${SITE_NAME}`,
      description,
      url: canonical,
      ...(store.logo_url ? { images: [{ url: absoluteUrl(store.logo_url), alt: store.name }] } : {}),
    },
  };
}

export function buildStoreJsonLd(store: StoreSeoData) {
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    name: store.name,
    url: absoluteUrl(`/tiendas/${store.slug}`),
    ...(store.description ? { description: truncateDescription(store.description, 500) } : {}),
    ...(store.logo_url ? { image: absoluteUrl(store.logo_url) } : {}),
    address: {
      "@type": "PostalAddress",
      addressLocality: store.city,
      addressCountry: "PE",
    },
  };
}

export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/icon.svg"),
  };
}
