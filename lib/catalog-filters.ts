import {
  attributeValueLabel,
  getInstrumentFilterGroup,
  instrumentFilterGroups,
  shortAttributeKeys,
  type InstrumentFilterConfig,
} from "@/lib/instrument-filters";
import { getInstrumentTypeOptions, instrumentTypesByCategory } from "@/lib/listing-submission";
import {
  categoryOptions,
  cityOptions,
  conditionOptions,
  getCategoryLabel,
  getConditionLabel,
  sellerTypeOptions,
  type ListingFilters,
  type ListingSort,
} from "@/lib/listings";
import { formatPrice } from "@/lib/price";

// The catalog's filters as facets, applied chips and URLs (docs/ux-redesign/ux-3-discovery.md § Filters). Pure, so
// the desktop sidebar (links), the phone sheet (a draft applied once) and the tests share one definition. The query
// itself is lib/catalog.ts; parameter names and values are today's, plus F11's repeated condition and location.

// This module reaches the browser (the filter sheet, sort, the price and brand forms): it imports no landing copy or
// shell module.
export const CATALOG_PATH = "/listados";

// A landing (/instrumentos/<slug>) fixes its category (landingScope in lib/category-pages.ts); every other choice
// leads to /listados?category=…, where filtering happens (categoryFilterRedirect). The landing's own category with
// nothing else is the landing itself.
export type CatalogScope = { landing?: { category: string; path: string } };

// The results count's id: after the filter sheet applies, a chip goes or the page changes, focus returns there.
export const RESULTS_STATUS_ID = "resultados-estado";

// A filter option's id, the same on every page, so focus can come back to the option just chosen.
export function filterOptionId(key: string, value: string | null) {
  return `filtro-${key}-${value ?? "todos"}`.replace(/[^A-Za-z0-9_-]+/g, "-");
}

// Parameters in one fixed order, the order the catalog's links used before UX-3, so a one-value URL is unchanged.
export function catalogSearchParams(filters: ListingFilters) {
  const params = new URLSearchParams();
  const add = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== "") params.append(key, String(value));
  };
  add("category", filters.category);
  for (const city of filters.cities) add("location", city);
  for (const condition of filters.conditions) add("condition", condition);
  add("brand", filters.brand);
  add("seller_type", filters.sellerType);
  add("instrument_type", filters.instrumentType);
  add("min_price", filters.minPrice);
  add("max_price", filters.maxPrice);
  if (filters.sort !== "newest") add("sort", filters.sort);
  for (const [key, value] of Object.entries(filters.advanced)) {
    for (const item of Array.isArray(value) ? value : [value]) add(key, String(item));
  }
  return params;
}

export function catalogHref(filters: ListingFilters, scope: CatalogScope = {}) {
  const query = catalogSearchParams(filters).toString();
  if (scope.landing && query === new URLSearchParams({ category: scope.landing.category }).toString()) return scope.landing.path;
  return query ? `${CATALOG_PATH}?${query}` : CATALOG_PATH;
}

// No filter at all: the plain catalog, or the landing with its category.
export function clearedFilters(scope: CatalogScope = {}): ListingFilters {
  return { category: scope.landing?.category, cities: [], conditions: [], advanced: {}, sort: "newest" };
}

const SELLER_TYPES = sellerTypeOptions.map((option) => option.value);
type SellerType = (typeof SELLER_TYPES)[number];
const isSellerType = (value: string | null): value is SellerType => SELLER_TYPES.includes(value as SellerType);

// Adds or removes one value of a several-value facet. Known values follow the facet's option order (one URL per
// choice, whatever the click order); values from older links that the facet does not list keep their place first.
function toggle(current: readonly string[], value: string | null, order: readonly string[]) {
  if (value === null) return [];
  if (current.includes(value)) return current.filter((item) => item !== value);
  const next = [...current, value];
  return [...next.filter((item) => !order.includes(item)), ...order.filter((item) => next.includes(item))];
}

const asList = (value: ListingFilters["advanced"][string] | undefined) =>
  value === undefined ? [] : (Array.isArray(value) ? value : [value]).map(String);

// The filters after choosing one option of a facet. Several-value facets (condition and location, F11, and
// multiselect attributes) toggle the value; one-value facets set it, and null clears the facet. A new category clears
// the type and its attributes; a new type clears the attributes.
export function withFacetValue(filters: ListingFilters, key: string, value: string | null): ListingFilters {
  const next: ListingFilters = { ...filters, advanced: { ...filters.advanced } };
  switch (key) {
    case "category":
      return { ...next, category: value ?? undefined, instrumentType: undefined, advanced: {} };
    case "instrument_type":
      return { ...next, instrumentType: value ?? undefined, advanced: {} };
    case "condition":
      return { ...next, conditions: toggle(filters.conditions, value, conditionOptions) };
    case "location":
      return { ...next, cities: toggle(filters.cities, value, cityOptions) };
    case "seller_type":
      return { ...next, sellerType: isSellerType(value) ? value : undefined };
    default: {
      const filter = attributeConfig(filters, key);
      const values = filter?.type === "multiselect" ? toggle(asList(filters.advanced[key]), value, (filter.options ?? []).map((option) => option.value)) : value === null ? [] : [value];
      if (values.length === 0) delete next.advanced[key];
      else next.advanced[key] = filter?.type === "multiselect" ? values : values[0];
      return next;
    }
  }
}

export function withPrice(filters: ListingFilters, minPrice: number | undefined, maxPrice: number | undefined): ListingFilters {
  return { ...filters, minPrice, maxPrice };
}

export function withBrand(filters: ListingFilters, brand: string | undefined): ListingFilters {
  return { ...filters, brand: brand?.trim() || undefined };
}

export function withSort(filters: ListingFilters, sort: ListingSort): ListingFilters {
  return { ...filters, sort };
}

// A price field's text as a filter value: a whole, non-negative number, or nothing.
export function parsePriceInput(value: string) {
  const text = value.replace(/[\s,]/g, "");
  if (!/^\d+$/.test(text)) return undefined;
  const number = Number(text);
  return Number.isSafeInteger(number) ? number : undefined;
}

export type FacetOption = { value: string; label: string };
export type ChoiceFacet = {
  kind: "choice";
  // The URL parameter.
  key: string;
  title: string;
  // Checkbox rows ("any of" for condition and location, "all of" for multiselect attributes) or radio rows.
  multiple: boolean;
  // Short attribute values ("22\"", "5 piezas") are chips.
  chips: boolean;
  // One-value rows start with the option that clears the facet.
  allLabel?: string;
  options: FacetOption[];
  selected: string[];
};
export type Facet = ChoiceFacet | { kind: "price"; title: string } | { kind: "brand"; title: string };

const specificTypes = (category?: string) => (category ? (instrumentTypesByCategory[category] ?? []).filter((type) => type !== "other") : []);

// The attributes shown: the chosen type's, or those of a category with a single type (drums, basses…).
function attributeGroup(filters: Pick<ListingFilters, "category" | "instrumentType">) {
  if (filters.instrumentType) return getInstrumentFilterGroup(filters.instrumentType);
  const types = specificTypes(filters.category);
  return types.length === 1 ? getInstrumentFilterGroup(types[0]) : null;
}

function attributeConfig(filters: Pick<ListingFilters, "category" | "instrumentType">, key: string): InstrumentFilterConfig | undefined {
  const own = attributeGroup(filters)?.filters.find((filter) => filter.key === key);
  if (own) return own;
  for (const group of instrumentFilterGroups) {
    const filter = group.filters.find((item) => item.key === key);
    if (filter) return filter;
  }
  return undefined;
}

// The facets in the decided order: Categoría (catalog without a category), Tipo (a category with several types),
// Condición, Precio, Ubicación, Vendedor, Marca, then the type's attributes. The phone sheet keeps Categoría while its
// draft changes the category (`categoryFacet`); the sidebar drops it once a category is chosen (its chip removes it).
export function catalogFacets(filters: ListingFilters, scope: CatalogScope = {}, options: { categoryFacet?: boolean } = {}): Facet[] {
  const facets: Facet[] = [];
  const choice = (facet: Omit<ChoiceFacet, "kind" | "chips"> & { chips?: boolean }) => facets.push({ kind: "choice", chips: false, ...facet });
  if (options.categoryFacet ?? (!scope.landing && !filters.category)) {
    choice({ key: "category", title: "Categoría", multiple: false, allLabel: "Todas", options: categoryOptions.map(({ value, label }) => ({ value, label })), selected: filters.category ? [filters.category] : [] });
  }
  if (filters.category && specificTypes(filters.category).length > 1) {
    choice({ key: "instrument_type", title: "Tipo", multiple: false, allLabel: "Todos", options: getInstrumentTypeOptions(filters.category), selected: filters.instrumentType ? [filters.instrumentType] : [] });
  }
  choice({ key: "condition", title: "Condición", multiple: true, options: conditionOptions.map((value) => ({ value, label: getConditionLabel(value) })), selected: filters.conditions });
  facets.push({ kind: "price", title: "Precio" });
  choice({ key: "location", title: "Ubicación", multiple: true, options: cityOptions.map((value) => ({ value, label: value })), selected: filters.cities });
  choice({ key: "seller_type", title: "Vendedor", multiple: false, allLabel: "Todos", options: sellerTypeOptions.map(({ value, label }) => ({ value, label })), selected: filters.sellerType ? [filters.sellerType] : [] });
  facets.push({ kind: "brand", title: "Marca" });
  for (const filter of attributeGroup(filters)?.filters ?? []) {
    const options = (filter.options ?? []).map((option) => ({ value: option.value, label: attributeValueLabel(filter, filter.key, option.value) }));
    if (options.length === 0) continue;
    const multiple = filter.type === "multiselect";
    const chips = shortAttributeKeys.has(filter.key);
    choice({ key: filter.key, title: filter.label, multiple, chips, allLabel: multiple || chips ? undefined : "Todos", options, selected: asList(filters.advanced[filter.key]) });
  }
  return facets;
}

// What a one-value facet reads in the sheet's disclosure rows: "Todas", "Lima", "2 ubicaciones".
export function facetSummary(facet: ChoiceFacet) {
  if (facet.selected.length === 0) return facet.key === "location" || facet.key === "category" ? "Todas" : "Todos";
  if (facet.selected.length === 1) return facet.options.find((option) => option.value === facet.selected[0])?.label ?? facet.selected[0];
  const noun = facet.key === "location" ? "ubicaciones" : facet.key === "condition" ? "condiciones" : "opciones";
  return `${facet.selected.length} ${noun}`;
}

export type AppliedFilter = {
  key: string;
  // The facet and value, for the chip's accessible name: "Quitar filtro: Ubicación: Lima".
  facet: string;
  value: string;
  // What the chip shows: the value ("Acústica", "S/ 500 – 1,500", "Marca: Yamaha").
  text: string;
  // The page without this value; the other values of the facet stay.
  href: string;
};

export function appliedFilters(filters: ListingFilters, scope: CatalogScope = {}): AppliedFilter[] {
  const chips: AppliedFilter[] = [];
  const add = (key: string, facet: string, value: string, next: ListingFilters, text = value) =>
    chips.push({ key, facet, value, text, href: catalogHref({ ...next, sort: filters.sort }, scope) });
  if (filters.category && !scope.landing) add("category", "Categoría", getCategoryLabel(filters.category), { ...filters, category: undefined });
  if (filters.instrumentType) {
    const label = getInstrumentFilterGroup(filters.instrumentType)?.label ?? filters.instrumentType;
    add("instrument_type", "Tipo", label, { ...filters, instrumentType: undefined });
  }
  for (const condition of filters.conditions) {
    add(`condition:${condition}`, "Condición", getConditionLabel(condition), { ...filters, conditions: filters.conditions.filter((item) => item !== condition) });
  }
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    add("price", "Precio", priceRangeLabel(filters.minPrice, filters.maxPrice), withPrice(filters, undefined, undefined));
  }
  for (const city of filters.cities) {
    add(`location:${city}`, "Ubicación", city, { ...filters, cities: filters.cities.filter((item) => item !== city) });
  }
  if (filters.sellerType) {
    add("seller_type", "Vendedor", sellerTypeOptions.find((option) => option.value === filters.sellerType)?.label ?? filters.sellerType, { ...filters, sellerType: undefined });
  }
  if (filters.brand) add("brand", "Marca", filters.brand, withBrand(filters, undefined), `Marca: ${filters.brand}`);
  for (const [key, raw] of Object.entries(filters.advanced)) {
    const config = attributeConfig(filters, key);
    const label = config?.label ?? key;
    for (const item of asList(raw)) {
      const value = attributeValueLabel(config, key, item);
      const next = config?.type === "multiselect" ? withFacetValue(filters, key, item) : withFacetValue(filters, key, null);
      add(`${key}:${item}`, label, value, next, config?.type === "boolean" ? `${label}: ${value}` : value);
    }
  }
  return chips;
}

export function priceRangeLabel(minPrice: number | undefined, maxPrice: number | undefined) {
  if (minPrice !== undefined && maxPrice !== undefined) return `${formatPrice(minPrice)} – ${formatNumber(maxPrice)}`;
  if (minPrice !== undefined) return `Desde ${formatPrice(minPrice)}`;
  return `Hasta ${formatPrice(maxPrice ?? 0)}`;
}

// A filter or a category narrows the search (sort does not): the alert entry is offered then (Q11 A).
export function narrowsSearch(filters: ListingFilters) {
  return Boolean(filters.category) || appliedFilters(filters).length > 0;
}

// The catalog's h1: "Instrumentos", the category's name, or "Tiendas verificadas" for N7's entry alone.
export function catalogTitle(filters: ListingFilters) {
  if (filters.category) return getCategoryLabel(filters.category);
  const applied = appliedFilters(filters);
  if (applied.length === 1 && applied[0].key === "seller_type" && filters.sellerType === "verified_store") return "Tiendas verificadas";
  return "Instrumentos";
}

export const sortShortLabels: Record<ListingSort, string> = {
  newest: "Recientes",
  price_asc: "Menor precio",
  price_desc: "Mayor precio",
};

export function formatNumber(value: number) {
  return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 }).format(value);
}

export function resultsLabel(count: number) {
  return `${formatNumber(count)} ${count === 1 ? "resultado" : "resultados"}`;
}
