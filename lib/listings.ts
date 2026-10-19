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

export function parseListingFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ListingFilters {
  const readString = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const readNumber = (key: string) => {
    const value = readString(key);
    if (!value) {
      return undefined;
    }

    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue >= 0
      ? numberValue
      : undefined;
  };

  // Repeated parameters, in URL order, without blanks or repeats (capped: they become an `in` list).
  const readList = (key: string) => {
    const value = searchParams[key];
    const items = (Array.isArray(value) ? value : [value]).map((item) => item?.trim()).filter((item): item is string => Boolean(item));
    return [...new Set(items)].slice(0, MAX_FILTER_VALUES);
  };

  const sellerType = readString("seller_type");
  const sort = readString("sort");
  const locations = readList("location");
  const legacy = legacyCategories[readString("category") ?? ""];
  const instrumentType = readString("instrument_type") || legacy?.instrumentType;
  const advanced = parseAdvancedFilters(searchParams, instrumentType);

  const q = readString("q")?.replace(/\s+/g, " ").trim().slice(0, 200);

  return {
    ...(q ? { q } : {}),
    category: legacy?.category ?? (readString("category") || undefined),
    cities: locations.length ? locations : readList("city"),
    conditions: readList("condition"),
    brand: readString("brand") || undefined,
    sellerType:
      sellerType === "individual" ||
      sellerType === "store" ||
      sellerType === "verified_store"
        ? sellerType
        : undefined,
    instrumentType: instrumentType || undefined,
    minPrice: readNumber("min_price"),
    maxPrice: readNumber("max_price"),
    advanced,
    sort: sortOptions.some((option) => option.value === sort) ? (sort as ListingSort) : "newest",
  };
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

  for (const group of groups) {
    for (const filter of group.filters) {
      const currentType = filterTypes.get(filter.key);
      filterTypes.set(
        filter.key,
        currentType === "multiselect" ? currentType : filter.type,
      );
    }
  }
  const advancedFilters: ListingFilters["advanced"] = {};

  for (const [key, type] of filterTypes) {
    const rawValue = searchParams[key];
    if (rawValue === undefined) {
      continue;
    }

    const values = (Array.isArray(rawValue) ? rawValue : [rawValue])
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean);

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

  return advancedFilters;
}
