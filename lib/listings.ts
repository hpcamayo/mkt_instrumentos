export const categoryOptions = [
  { value: "guitars", label: "Guitarras" },
  { value: "basses", label: "Bajos" },
  { value: "drums", label: "Baterías" },
  { value: "cymbals", label: "Platillos" },
  { value: "microphones", label: "Micrófonos" },
  { value: "pedals", label: "Pedales" },
  { value: "amplifiers", label: "Amplificadores" },
  { value: "audio interfaces", label: "Interfaces de audio" },
] as const;

export const cityOptions = ["Lima", "Ayacucho", "Huancayo", "Arequipa"] as const;

export const conditionOptions = [
  "Nuevo",
  "Usado - buen estado",
  "Usado - con detalles",
] as const;

export const sellerTypeOptions = [
  { value: "individual", label: "Particular" },
  { value: "store", label: "Tienda" },
] as const;

export const sortOptions = [
  { value: "newest", label: "Más recientes" },
  { value: "price_asc", label: "Menor precio" },
  { value: "price_desc", label: "Mayor precio" },
] as const;

export type ListingSort = (typeof sortOptions)[number]["value"];

export type ListingFilters = {
  category?: string;
  city?: string;
  condition?: string;
  sellerType?: "individual" | "store";
  minPrice?: number;
  maxPrice?: number;
  sort: ListingSort;
};

type StoreSummary = {
  name: string;
  slug: string;
  status: "pending" | "active" | "hidden";
  is_verified: boolean | null;
};

export type ListingCardData = {
  id: string;
  title: string;
  slug: string;
  category: string;
  brand: string | null;
  model: string | null;
  condition: string | null;
  price_pen: number | null;
  city: string;
  region: string;
  seller_type: "individual" | "store";
  created_at: string;
  stores: StoreSummary | StoreSummary[] | null;
  listing_photos: {
    image_url: string;
    alt_text: string | null;
  }[];
};

export type ListingDetailData = ListingCardData & {
  description: string | null;
  contact_name: string | null;
  whatsapp_phone: string;
};

export function getCategoryLabel(category: string) {
  return (
    categoryOptions.find((option) => option.value === category)?.label ?? category
  );
}

export function formatPrice(price: number | null) {
  if (price === null) {
    return "Precio a consultar";
  }

  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    maximumFractionDigits: 0,
  }).format(price);
}

export function normalizeStore(listing: ListingCardData) {
  if (Array.isArray(listing.stores)) {
    return listing.stores[0] ?? null;
  }

  return listing.stores;
}

export function getSellerTypeLabel(sellerType: "individual" | "store") {
  return sellerType === "store" ? "Tienda" : "Particular";
}

export function buildWhatsAppUrl(listing: ListingDetailData) {
  const phone = listing.whatsapp_phone.replace(/\D/g, "");
  const message = encodeURIComponent(
    `Hola, vi tu publicación "${listing.title}" en Instrumentos Perú. ¿Sigue disponible?`,
  );

  return `https://wa.me/${phone}?text=${message}`;
}

export function buildStoreWhatsAppUrl(store: {
  name: string;
  whatsapp_phone: string;
}) {
  const phone = store.whatsapp_phone.replace(/\D/g, "");
  const message = encodeURIComponent(
    `Hola, vi la tienda "${store.name}" en Instrumentos Perú. Quisiera consultar por sus instrumentos.`,
  );

  return `https://wa.me/${phone}?text=${message}`;
}

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

  const sellerType = readString("seller_type");
  const sort = readString("sort");

  return {
    category: readString("category") || undefined,
    city: readString("city") || undefined,
    condition: readString("condition") || undefined,
    sellerType:
      sellerType === "individual" || sellerType === "store"
        ? sellerType
        : undefined,
    minPrice: readNumber("min_price"),
    maxPrice: readNumber("max_price"),
    sort:
      sort === "price_asc" || sort === "price_desc" || sort === "newest"
        ? sort
        : "newest",
  };
}
