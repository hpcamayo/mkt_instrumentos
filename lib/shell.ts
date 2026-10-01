import { categoryLandingPath, categoryTypePath, getCategoryLandingByValue, reservedCategorySlugs } from "@/lib/category-pages";
import { getInstrumentTypeOptions } from "@/lib/listing-submission";
import { categoryOptions, getCategoryLabel } from "@/lib/listings";

// Site shell per route (docs/ux-redesign/ux-2-shell.md). Pure so tests can pin every template.
export type ShellLayout = {
  // "publishing" keeps only the logo and the account entry on phones.
  header: "standard" | "publishing" | "none";
  // "all": every width; "wide": 768 px and up; "none": no strip.
  strip: "all" | "wide" | "none";
  // Below 768 px: a search row under the bar, a search icon that opens it, or no search.
  phoneSearch: "row" | "toggle" | "none";
  footer: "full" | "slim" | "none";
};

const PUBLISHING_PATHS = new Set(["/mi-cuenta/publicar", "/mi-cuenta/tienda/publicar"]);

function under(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getShellLayout(pathname: string): ShellLayout {
  // Admin draws its own frame (sidebar, <main>) and has no footer.
  if (under(pathname, "/admin")) return { header: "none", strip: "none", phoneSearch: "none", footer: "none" };
  // The home keeps the standard header until the UX-3 banner search ships, so search is never missing.
  if (pathname === "/") return { header: "standard", strip: "none", phoneSearch: "row", footer: "full" };
  if (PUBLISHING_PATHS.has(pathname)) return { header: "publishing", strip: "none", phoneSearch: "none", footer: "slim" };
  if (under(pathname, "/mi-cuenta")) return { header: "standard", strip: "none", phoneSearch: "none", footer: "slim" };
  if (isBrowsePath(pathname)) return { header: "standard", strip: "all", phoneSearch: "row", footer: "slim" };
  if (isListingPath(pathname)) return { header: "standard", strip: "wide", phoneSearch: "toggle", footer: "slim" };
  return { header: "standard", strip: "wide", phoneSearch: "none", footer: "slim" };
}

// Browse pages: the catalog (including search results), the category landings and the store pages.
export function isBrowsePath(pathname: string) {
  if (pathname === "/listados" || under(pathname, "/tiendas")) return true;
  const slug = instrumentSlug(pathname);
  return slug !== null && reservedCategorySlugs.has(slug);
}

// /instrumentos/<slug> is a listing unless the slug names a category landing.
export function isListingPath(pathname: string) {
  const slug = instrumentSlug(pathname);
  return slug !== null && !reservedCategorySlugs.has(slug);
}

function instrumentSlug(pathname: string) {
  const match = /^\/instrumentos\/([^/]+)\/?$/.exec(pathname);
  return match ? match[1] : null;
}

export const CATALOG_PATH = "/listados";
// No stores directory exists: "Tiendas verificadas" opens the catalog filtered to verified stores (decision N7).
export const VERIFIED_STORES_PATH = "/listados?seller_type=verified_store";

export type StripItem = { key: string; label: string; href: string };

// "Instrumentos" first, the categories in taxonomy order, "Tiendas verificadas" last (at the right on desktop).
export const stripItems: readonly StripItem[] = [
  { key: "catalog", label: "Instrumentos", href: CATALOG_PATH },
  ...categoryOptions.map((category) => ({ key: category.value, label: category.label, href: categoryLandingPath(category.value) })),
  { key: "verified_stores", label: "Tiendas verificadas", href: VERIFIED_STORES_PATH },
];

// The strip item for the current page, or null when none applies (listing and store pages, legal pages).
export function currentStripKey(pathname: string, params: { get(name: string): string | null }): string | null {
  const slug = instrumentSlug(pathname);
  if (slug !== null) return categoryOptions.find((category) => getCategoryLandingByValue(category.value)?.slug === slug)?.value ?? null;
  if (pathname !== CATALOG_PATH) return null;
  const category = params.get("category");
  if (category && categoryOptions.some((option) => option.value === category)) return category;
  if (params.get("seller_type") === "verified_store") return "verified_stores";
  return "catalog";
}

export type Crumb = { label: string; href?: string };

// Listing breadcrumbs: Inicio / Instrumentos / <category> / <type> / <title>. The type level appears only when it
// narrows the category (guitars: eléctricas, acústicas); single-type categories and "other" skip it.
export function listingBreadcrumbs(listing: { category: string; instrument_type: string | null }, title: string): Crumb[] {
  const categoryHref = categoryLandingPath(listing.category);
  const crumbs: Crumb[] = [
    { label: "Inicio", href: "/" },
    { label: "Instrumentos", href: CATALOG_PATH },
    { label: getCategoryLabel(listing.category), href: categoryHref },
  ];
  const type = listing.instrument_type;
  if (type && type !== "other") {
    const typeHref = categoryTypePath(listing.category, type);
    const label = getInstrumentTypeOptions(listing.category).find((option) => option.value === type)?.label;
    if (label && typeHref !== categoryHref) crumbs.push({ label, href: typeHref });
  }
  crumbs.push({ label: title });
  return crumbs;
}
