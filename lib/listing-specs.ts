import {
  getInstrumentFilterGroup,
  type InstrumentFilterConfig,
} from "@/lib/instrument-filters";
import {
  getCategoryLabel,
  normalizeStore,
  type ListingAttributes,
  type ListingDetailData,
} from "@/lib/listings";

export type ListingSpec = {
  label: string;
  value: string;
};

const fallbackAttributeLabels: Record<string, string> = {
  pickup_config: "Configuración de pastillas",
  body_shape: "Forma del cuerpo",
  mic_type: "Tipo de micrófono",
  polar_pattern: "Patrón polar",
  string_material: "Material de cuerdas",
  usage: "Uso",
  amp_type: "Tipo de amplificador",
};

const fallbackAttributeValues: Record<string, string> = {
  right: "Diestro",
  left: "Zurdo",
  right_handed: "Diestro",
  left_handed: "Zurdo",
  yes: "Sí",
  no: "No",
  true: "Sí",
  false: "No",
};

export function getKeyListingSpecs(
  listing: ListingDetailData,
  sellerName?: string | null,
) {
  return [
    ...getBaseListingSpecs(listing, sellerName).filter(
      (spec) => spec.label !== "Publicado",
    ),
    ...getAttributeSpecs(listing).slice(0, 3),
  ].slice(0, 8);
}

export function getFullListingSpecs(
  listing: ListingDetailData,
  sellerName?: string | null,
) {
  const instrumentLabel = listing.instrument_type
    ? getInstrumentFilterGroup(listing.instrument_type)?.label
    : null;

  return [
    ...(instrumentLabel ? [{ label: "Instrumento", value: instrumentLabel }] : []),
    ...getBaseListingSpecs(listing, sellerName),
    ...getAttributeSpecs(listing),
  ].filter((spec) => spec.value.trim() !== "");
}

function getBaseListingSpecs(
  listing: ListingDetailData,
  sellerName?: string | null,
): ListingSpec[] {
  const store = normalizeStore(listing);

  return [
    {
      label: "Publicado",
      value: formatPublishedDate(listing.published_at ?? listing.created_at),
    },
    { label: "Condición", value: listing.condition || "No indicada" },
    { label: "Categoría", value: getCategoryLabel(listing.category) },
    { label: "Marca", value: listing.brand || "No indicada" },
    { label: "Modelo", value: listing.model || "No indicado" },
    { label: "Ciudad", value: `${listing.city}, ${listing.region}` },
    {
      label: listing.seller_type === "store" ? "Tienda" : "Vendedor",
      value:
        listing.seller_type === "store"
          ? store?.name || sellerName || "Tienda"
          : sellerName || "Vendedor particular",
    },
  ];
}

function getAttributeSpecs(listing: ListingDetailData): ListingSpec[] {
  const attributes = normalizeAttributes(listing.attributes);
  const entries = Object.entries(attributes);

  if (entries.length === 0) {
    return [];
  }

  const group = listing.instrument_type
    ? getInstrumentFilterGroup(listing.instrument_type)
    : null;
  const filters = new Map<string, InstrumentFilterConfig>(
    group?.filters.map((filter) => [filter.key, filter] as const) ?? [],
  );

  return entries
    .map(([key, value]) => {
      const filter = filters.get(key);
      return {
        label: filter?.label ?? formatAttributeLabel(key),
        value: formatAttributeValue(value, filter),
      };
    })
    .filter((spec) => spec.value !== "");
}

function normalizeAttributes(attributes: ListingAttributes | null) {
  if (!attributes || Array.isArray(attributes)) {
    return {};
  }

  return attributes;
}

function formatAttributeValue(
  value: unknown,
  filter?: InstrumentFilterConfig,
) {
  const values = Array.isArray(value) ? value : [value];

  return values
    .map((item) => {
      if (item === null || item === undefined || item === "") {
        return "";
      }

      const stringValue = String(item);
      return (
        filter?.options?.find((option) => option.value === stringValue)
          ?.label ??
        fallbackAttributeValues[stringValue] ??
        formatAttributeLabel(stringValue)
      );
    })
    .filter(Boolean)
    .join(", ");
}

function formatAttributeLabel(value: string) {
  return (
    fallbackAttributeLabels[value] ??
    value
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

function formatPublishedDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "No disponible";
  }

  return new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
