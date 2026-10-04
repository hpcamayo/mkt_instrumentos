import { categoryLandingPath, categoryTypePath, getCategoryLandingByValue, reservedCategorySlugs } from "@/lib/category-pages";
import { getInstrumentTypeOptions } from "@/lib/listing-submission";
import { categoryOptions, getCategoryLabel } from "@/lib/listings";

// Site shell per route (docs/ux-redesign/ux-2-shell.md). Pure so tests can pin every template.
export type ShellLayout = {
  // "publishing" keeps only the logo and the account entry on phones.
  header: "standard" | "publishing" | "none";
  // The category strip with its menus. "all": every width; "wide": 768 px and up; "none": no strip.
  strip: "all" | "wide" | "none";
  // Below 768 px: a search row under the bar, a search icon that opens it, or no search.
  phoneSearch: "row" | "toggle" | "none";
  footer: "full" | "slim" | "none";
};

const PUBLISHING_PATHS = new Set(["/mi-cuenta/publicar", "/mi-cuenta/tienda/publicar"]);

function under(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// The category strip, with its category menus, sits under the header on every page that has the public header (owner,
// 3 Oct, N12: restore the mega-menu inside the UX-2 design). Two exceptions: the publishing pages keep their focused
// phone frame (strip from 768 px only), and Admin reaches the categories from its own navigation.
export function getShellLayout(pathname: string): ShellLayout {
  // Admin draws its own frame (sidebar, <main>) and has no footer.
  if (under(pathname, "/admin")) return { header: "none", strip: "none", phoneSearch: "none", footer: "none" };
  // The home keeps the standard header until the UX-3 banner search ships, so search is never missing.
  if (pathname === "/") return { header: "standard", strip: "all", phoneSearch: "row", footer: "full" };
  if (PUBLISHING_PATHS.has(pathname)) return { header: "publishing", strip: "wide", phoneSearch: "none", footer: "slim" };
  if (under(pathname, "/mi-cuenta")) return { header: "standard", strip: "all", phoneSearch: "none", footer: "slim" };
  if (isBrowsePath(pathname)) return { header: "standard", strip: "all", phoneSearch: "row", footer: "slim" };
  if (isListingPath(pathname)) return { header: "standard", strip: "all", phoneSearch: "toggle", footer: "slim" };
  return { header: "standard", strip: "all", phoneSearch: "none", footer: "slim" };
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

// "link" items go straight to their page; "category" items open that category's menu.
export type StripItem = { key: string; label: string; href: string; kind: "link" | "category" };

// "Instrumentos" first, the categories in taxonomy order, "Tiendas verificadas" last (at the right on desktop).
export const stripItems: readonly StripItem[] = [
  { key: "catalog", label: "Instrumentos", href: CATALOG_PATH, kind: "link" },
  ...categoryOptions.map((category) => ({ key: category.value, label: category.label, href: categoryLandingPath(category.value), kind: "category" as const })),
  { key: "verified_stores", label: "Tiendas verificadas", href: VERIFIED_STORES_PATH, kind: "link" },
];

export type CategoryMenu = { key: string; label: string; href: string; types: { value: string; label: string; href: string }[] };

// One menu per category, from the canonical taxonomy: "Ver todos" opens the category landing, then every instrument
// type the listing form and the catalog filters accept, through the same helpers (a type that mirrors its category
// resolves to the landing). The pre-UX-2 mega-menu offered the same destinations.
export const categoryMenus: readonly CategoryMenu[] = categoryOptions.map((category) => ({
  key: category.value,
  label: category.label,
  href: categoryLandingPath(category.value),
  types: getInstrumentTypeOptions(category.value).map((type) => ({ ...type, href: categoryTypePath(category.value, type.value) })),
}));

// Links into the catalog (/listados with a query) need a full page load: a client transition between two catalog
// URLs does not complete, and the catalog's filter form is uncontrolled (the same reason as AppliedChip).
export function isCatalogHref(href: string) {
  return href === CATALOG_PATH || href.startsWith(`${CATALOG_PATH}?`);
}

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
