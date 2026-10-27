import { instrumentFilterGroups } from "@/lib/instrument-filters";
import { listingContactMessage } from "@/lib/contact-message";
import { resolveContactPhone, whatsAppUrl } from "@/lib/seller-contact";

export { resolveContactPhone, resolveParticularSeller, whatsAppNumber } from "@/lib/seller-contact";

// The ten marketplace categories (owner decision, 12 Oct 2026; docs/ux-redesign/category-restructure.md), in menu
// order. Baterías and Platillos became types of Percusión, and Interfaces de audio a type of Audio.
export const categoryOptions = [
  { value: "guitars", label: "Guitarras" },
  { value: "basses", label: "Bajos" },
  { value: "keyboards", label: "Teclados y pianos" },
  { value: "percussion", label: "Percusión" },
  { value: "winds", label: "Vientos" },
  { value: "strings", label: "Cuerdas" },
  { value: "pedals", label: "Pedales" },
  { value: "amplifiers", label: "Amplificadores" },
  { value: "microphones", label: "Micrófonos" },
  { value: "audio", label: "Audio" },
] as const;

// Category values retired on 12 Oct 2026 → the category and type they became. Old links, bookmarks and alert e-mails
// keep working: the catalog reads them as the new category with the old type (the migration moved stored rows).
export const legacyCategories: Readonly<Record<string, { category: string; instrumentType: string }>> = {
  drums: { category: "percussion", instrumentType: "drums" },
  cymbals: { category: "percussion", instrumentType: "cymbals" },
  "audio interfaces": { category: "audio", instrumentType: "audio_interface" },
};

export const cityOptions = ["Lima", "Ayacucho", "Huancayo", "Arequipa"] as const;

export const conditionOptions = [
  "Nuevo",
  "Usado - buen estado",
  "Usado - con detalles",
] as const;

export const sellerTypeOptions = [
  { value: "individual", label: "Particular" },
  { value: "store", label: "Tienda" },
  { value: "verified_store", label: "Tienda verificada" },
] as const;

// FIND 10 (Effortless Laria) adds "Bajaron de precio" (a lower price in the past 30 days first) and "Tiendas verificadas
// primero". "Más cerca" waits until places are reliable.
export const sortOptions = [
  { value: "newest", label: "Más recientes" },
  { value: "price_asc", label: "Menor precio" },
  { value: "price_desc", label: "Mayor precio" },
  { value: "price_drop", label: "Bajaron de precio" },
  { value: "verified_first", label: "Tiendas verificadas primero" },
] as const;

export type ListingSort = (typeof sortOptions)[number]["value"];
export type ListingAttributes = Record<string, unknown>;
export type ListingPhotoData = {
  id?: string;
  listing_id?: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
};

export type ListingFilters = {
  // BIG 03 (Effortless Laria): the free-text search, over title, brand, model, type and category (lib/catalog.ts).
  q?: string;
  category?: string;
  // F11 (owner, 8 Oct): condition and location take several values, matched as "any of"; none means all. One value
  // keeps today's URL (?condition=Nuevo); more repeat the parameter (?location=Lima&location=Arequipa).
  cities: string[];
  conditions: string[];
  brand?: string;
  sellerType?: "individual" | "store" | "verified_store";
  instrumentType?: string;
  minPrice?: number;
  maxPrice?: number;
  advanced: Record<string, string | string[] | number | boolean>;
  sort: ListingSort;
};

type StoreSummary = {
  name: string;
  slug: string;
  status: "pending" | "active" | "hidden";
  is_verified: boolean | null;
  description?: string | null;
  city?: string | null;
  district?: string | null;
  whatsapp_phone?: string | null;
  logo_url?: string | null;
  created_at?: string | null;
};

export type ParticularProfileSummary = {
  full_name: string | null;
  phone: string | null;
  city: string | null;
  region: string;
  created_at: string;
};

export type ListingCardData = {
  id: string;
  store_id?: string | null;
  title: string;
  slug: string;
  category: string;
  brand: string | null;
  model: string | null;
  condition: string | null;
  price_pen: number | null;
  instrument_type: string | null;
  attributes: ListingAttributes | null;
  published_at: string | null;
  view_count: number | null;
  city: string;
  region: string;
  seller_type: "individual" | "store";
  created_at: string;
  photo_count?: number;
  // Null unless a store links the listing to an inventory item (STORE-1a).
  stock_state?: StockState | null;
  // list-05: a real price drop, kept by the database (listings_track_content_change); shown for 30 days.
  previous_price_pen?: number | null;
  price_dropped_at?: string | null;
  stores: StoreSummary | StoreSummary[] | null;
  listing_photos: ListingPhotoData[];
};

export type StockState = "in_stock" | "out_of_stock";

// PostgREST filter for discovery (catalog, home, sitemap, related strips): a listing without inventory, or one with
// units available. An approved listing at zero stock stays reachable at its URL and on its store page (design §5.2).
export const DISCOVERABLE_STOCK_FILTER = "stock_state.is.null,stock_state.eq.in_stock";

export function isOutOfStock(listing: { stock_state?: StockState | null }) {
  return listing.stock_state === "out_of_stock";
}

export type ListingDetailData = ListingCardData & {
  status: "approved" | "sold";
  // list-04: when the seller last changed what a buyer reads (never a view count).
  content_changed_at?: string | null;
  sold_at: string | null;
  description: string | null;
  contact_name: string | null;
  whatsapp_phone: string;
  owner_user_id: string | null;
  // ux my-listings (mine-12): the seller's vacation return date, or null.
  paused_until?: string | null;
  // mine-08: when the seller last answered "Sí, sigue disponible".
  availability_confirmed_at?: string | null;
  profiles: ParticularProfileSummary | ParticularProfileSummary[] | null;
};

// "Usado - buen estado" reads "Usado · buen estado" on cards, filters and chips; the stored value is unchanged.
export function getConditionLabel(condition: string) {
  return condition.split(" - ").join(" · ");
}

export function getCategoryLabel(category: string) {
  return (
    categoryOptions.find((option) => option.value === category)?.label ?? category
  );
}

export { formatPrice } from "@/lib/price";

export function normalizeStore(listing: ListingCardData) {
  if (Array.isArray(listing.stores)) {
    return listing.stores[0] ?? null;
  }

  return listing.stores;
}

export function getSellerTypeLabel(sellerType: "individual" | "store") {
  return sellerType === "store" ? "Tienda" : "Particular";
}

export function getListingDisplayTitle(listing: {
  brand: string | null;
  model: string | null;
  title: string;
}) {
  return listing.title;
}

export function getListingSecondaryTitle(listing: {
  brand: string | null;
  model: string | null;
  title: string;
}) {
  const productName = [listing.brand, listing.model].filter(Boolean).join(" ");
  return productName && productName !== listing.title ? productName : null;
}

export function buildWhatsAppUrl(listing: ListingDetailData) {
  return whatsAppUrl(resolveContactPhone(listing), listingContactMessage(listing, { outOfStock: isOutOfStock(listing) }));
}

export function buildStoreWhatsAppUrl(store: {
  name: string;
  whatsapp_phone: string;
}) {
  return whatsAppUrl(
    store.whatsapp_phone,
    `Hola, vi la tienda "${store.name}" en Laria. Quisiera consultar por sus instrumentos.`,
  );
}

const MAX_FILTER_VALUES = 20;
// Longer than any real value (docs/operations/catalog-performance.md § Input limits): a longer one is dropped, so a
// crafted address cannot make the filters, their cache keys or the database's work arbitrarily large.
const MAX_FILTER_VALUE_LENGTH = 80;

export function parseListingFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ListingFilters {
  return readListingFilters(searchParams).filters;
}

// True when the address carries a filter value the catalog does not offer (an unknown option, category, type, sort or
// seller type, a price that is not a number, an overlong value, a free-text value with "="). Those values are dropped; /listados redirects to the cleaned
// address so a malformed link (some crawlers mangle "&microphone_type" into "µphone_type") cannot seed endless new URLs.
export function hasRejectedFilterValues(searchParams: Record<string, string | string[] | undefined>) {
  return readListingFilters(searchParams).rejected;
}

// A "=" never belongs in a brand or a city: it is a pasted or mangled query string.
const isFreeTextValue = (value: string) => !value.includes("=");
const knownCategories = new Set<string>(categoryOptions.map((option) => option.value));
const knownInstrumentTypes = new Set<string>([...instrumentFilterGroups.map((group) => group.instrumentType), "other"]);
const knownConditions = new Set<string>(conditionOptions);

function readListingFilters(
  searchParams: Record<string, string | string[] | undefined>,
): { filters: ListingFilters; rejected: boolean } {
  let rejected = false;
  const accept = (value: string | undefined, valid: (value: string) => boolean) => {
    if (!value) return value;
    if (valid(value)) return value;
    rejected = true;
    return undefined;
  };
  const readString = (key: string) => {
    const value = searchParams[key];
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined && first.length > MAX_FILTER_VALUE_LENGTH && key !== "q") {
      rejected = true;
      return undefined;
    }
    return first;
  };

  // A blank price is a form left empty. "1,500" or "S/ 1500" (typed into the no-JavaScript form) reads as 1500 and
  // is reported, so the redirect writes it the way our links do; anything else is dropped and reported.
  const readNumber = (key: string) => {
    const value = readString(key)?.trim();
    if (!value) {
      return undefined;
    }

    const numberValue = Number(value);
    if (Number.isFinite(numberValue) && numberValue >= 0) return numberValue;
    rejected = true;
    const digits = value.replace(/^S\/\s*/i, "").replace(/[\s,]/g, "");
    return /^\d+(\.\d+)?$/.test(digits) ? Number(digits) : undefined;
  };

  // Repeated parameters, in URL order, without blanks or repeats (capped: they become an `in` list).
  const readList = (key: string) => {
    const value = searchParams[key];
    const items = (Array.isArray(value) ? value : [value]).map((item) => item?.trim()).filter((item): item is string => Boolean(item));
    const bounded = items.filter((item) => item.length <= MAX_FILTER_VALUE_LENGTH);
    if (bounded.length !== items.length) rejected = true;
    return [...new Set(bounded)].slice(0, MAX_FILTER_VALUES);
  };

  // Blank means "any" (the form's first option); a value we do not offer is dropped and reported.
  const sellerType = accept(readString("seller_type"), (value) => sellerTypeOptions.some((option) => option.value === value));
  const sort = accept(readString("sort"), (value) => sortOptions.some((option) => option.value === value));
  const freeTextList = (key: string) => {
    const items = readList(key);
    const kept = items.filter(isFreeTextValue);
    if (kept.length !== items.length) rejected = true;
    return kept;
  };
  const locations = freeTextList("location");
  const legacyCities = freeTextList("city");
  const legacy = legacyCategories[readString("category") ?? ""];
  const instrumentType = accept(readString("instrument_type"), (value) => knownInstrumentTypes.has(value)) || legacy?.instrumentType;
  const { advanced, rejected: advancedRejected } = parseAdvancedFilters(searchParams, instrumentType);
  if (advancedRejected) rejected = true;
  const category = legacy?.category ?? accept(readString("category"), (value) => knownCategories.has(value));
  const brand = accept(readString("brand"), isFreeTextValue);
  const conditions = readList("condition");
  const acceptedConditions = conditions.filter((value) => knownConditions.has(value));
  if (acceptedConditions.length !== conditions.length) rejected = true;

  const q = readString("q")?.replace(/\s+/g, " ").trim().slice(0, 200);

  const filters: ListingFilters = {
    ...(q ? { q } : {}),
    category: category || undefined,
    cities: locations.length ? locations : legacyCities,
    conditions: acceptedConditions,
    brand: brand || undefined,
    sellerType: (sellerType || undefined) as ListingFilters["sellerType"],
    instrumentType: instrumentType || undefined,
    minPrice: readNumber("min_price"),
    maxPrice: readNumber("max_price"),
    advanced,
    sort: (sort || "newest") as ListingSort,
  };
  return { filters, rejected };
}

function parseAdvancedFilters(
  searchParams: Record<string, string | string[] | undefined>,
  instrumentType?: string,
) {
  const groups = instrumentType
    ? instrumentFilterGroups.filter(
        (group) => group.instrumentType === instrumentType,
      )
    : instrumentFilterGroups;
  const filterTypes = new Map<
    string,
    "select" | "multiselect" | "boolean" | "number"
  >();
  // The values each select/multiselect key offers (a key shared by several types offers all of theirs).
  const filterOptions = new Map<string, Set<string>>();

  for (const group of groups) {
    for (const filter of group.filters) {
      const currentType = filterTypes.get(filter.key);
      filterTypes.set(
        filter.key,
        currentType === "multiselect" ? currentType : filter.type,
      );
      if (filter.options) {
        const options = filterOptions.get(filter.key) ?? new Set<string>();
        for (const option of filter.options) options.add(option.value);
        filterOptions.set(filter.key, options);
      }
    }
  }
  const advancedFilters: ListingFilters["advanced"] = {};
  let rejected = false;

  for (const [key, type] of filterTypes) {
    const rawValue = searchParams[key];
    if (rawValue === undefined) {
      continue;
    }

    const items = (Array.isArray(rawValue) ? rawValue : [rawValue])
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean);
    const bounded = items.filter((value) => value.length <= MAX_FILTER_VALUE_LENGTH);
    if (bounded.length !== items.length) rejected = true;
    const given = bounded.slice(0, MAX_FILTER_VALUES);
    const options = filterOptions.get(key);
    const values =
      type === "number"
        ? given
        : given.filter((value) => (type === "boolean" && (value === "true" || value === "false")) || !options || options.has(value));
    if (values.length !== given.length) rejected = true;

    if (values.length === 0) {
      continue;
    }

    if (type === "number") {
      const numberValue = Number(values[0]);
      if (Number.isFinite(numberValue)) {
        advancedFilters[key] = numberValue;
      }
      continue;
    }

    if (type === "boolean") {
      const value = values[0];
      advancedFilters[key] =
        value === "true" ? true : value === "false" ? false : value;
      continue;
    }

    advancedFilters[key] = type === "multiselect" ? values : values[0];
  }

  return { advanced: advancedFilters, rejected };
}
