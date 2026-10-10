import {
  attributeValueLabel,
  getInstrumentFilterGroup,
  type InstrumentFilterConfig,
} from "@/lib/instrument-filters";
import {
  getCategoryLabel,
  getConditionLabel,
  type ListingAttributes,
  type ListingCardData,
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

// Up to two key attributes per type on the listing card (UX-3 Q3 A), in this order. An electric guitar shows its
// number of strings only when it is not 6.
const cardAttributeKeys: Record<string, readonly string[]> = {
  electric_guitar: ["pickups", "strings"],
  acoustic_guitar: ["acoustic_type", "body_shape"],
  bass: ["strings", "bass_type"],
  drums: ["configuration", "kick_size"],
  cymbals: ["cymbal_type", "size"],
  microphones: ["microphone_type", "polar_pattern"],
  audio_interface: ["inputs", "connection"],
  pedals: ["pedal_type", "format"],
  amplifiers: ["technology", "power"],
};

// The card's spec line: the condition, then the type's key attributes ("Usado · buen estado · Shell pack · 22\"").
// Missing attributes are left out; a listing without them shows the condition alone.
export function getCardSpecLine(listing: Pick<ListingCardData, "condition" | "instrument_type" | "attributes">) {
  const parts = listing.condition ? [getConditionLabel(listing.condition)] : [];
  const type = listing.instrument_type ?? "";
  const filters = getInstrumentFilterGroup(type)?.filters ?? [];
  const attributes = normalizeAttributes(listing.attributes);
  for (const key of cardAttributeKeys[type] ?? []) {
    const raw = attributes[key];
    const values = (Array.isArray(raw) ? raw : [raw]).filter((item) => item !== null && item !== undefined && item !== "").map(String);
    if (values.length === 0 || (type === "electric_guitar" && key === "strings" && values.join() === "6")) continue;
    const filter: InstrumentFilterConfig | undefined = filters.find((item) => item.key === key);
    parts.push(values.map((value) => attributeValueLabel(filter, key, value)).join(", "));
  }
  return parts.join(" · ");
}

// The listing page's spec strip (UX-4 L9 A): up to four of the type's attributes, starting with the card's two, then
// the rest in the type's filter order. The condition, brand and model are in the identity block already.
export function getSpecStrip(listing: Pick<ListingDetailData, "instrument_type" | "attributes">): ListingSpec[] {
  const specs = getAttributeSpecs(listing);
  const first = cardAttributeKeys[listing.instrument_type ?? ""] ?? [];
  const ranked = [
    ...first.flatMap((key) => specs.filter((spec) => spec.key === key)),
    ...specs.filter((spec) => !first.includes(spec.key)),
  ];
  return ranked.slice(0, 4).map(({ label, value }) => ({ label, value }));
}

// "Especificaciones" (UX-4 L9 A): Tipo (the instrument type, or the category when there is none), Marca, Modelo,
// Condición, then every attribute with its label (LIST-011). Rows without a value are left out, and nothing repeats
// the page's other blocks (no publication date, city or seller).
export function getSpecTable(
  listing: Pick<ListingDetailData, "category" | "instrument_type" | "attributes" | "brand" | "model" | "condition">,
): ListingSpec[] {
  const typeLabel = listing.instrument_type ? getInstrumentFilterGroup(listing.instrument_type)?.label : undefined;
  return [
    { label: "Tipo", value: typeLabel ?? getCategoryLabel(listing.category) },
    { label: "Marca", value: listing.brand ?? "" },
    { label: "Modelo", value: listing.model ?? "" },
    { label: "Condición", value: listing.condition ? getConditionLabel(listing.condition) : "" },
    ...getAttributeSpecs(listing).map(({ label, value }) => ({ label, value })),
  ].filter((spec) => spec.value.trim() !== "");
}

type AttributeSpec = ListingSpec & { key: string };

// Every attribute with its label and value: the type's known attributes first, in its filter order, then any other.
function getAttributeSpecs(listing: Pick<ListingDetailData, "instrument_type" | "attributes">): AttributeSpec[] {
  const attributes = normalizeAttributes(listing.attributes);
  const group = listing.instrument_type ? getInstrumentFilterGroup(listing.instrument_type) : null;
  const order: string[] = group?.filters.map((filter) => filter.key) ?? [];
  const keys = [
    ...order.filter((key) => Object.hasOwn(attributes, key)),
    ...Object.keys(attributes).filter((key) => !order.includes(key)),
  ];
  return keys
    .map((key) => {
      const filter = group?.filters.find((item) => item.key === key);
      return { key, label: filter?.label ?? formatAttributeLabel(key), value: formatAttributeValue(attributes[key], key, filter) };
    })
    .filter((spec) => spec.value !== "");
}

function normalizeAttributes(attributes: ListingAttributes | null) {
  if (!attributes || Array.isArray(attributes)) {
    return {};
  }

  return attributes;
}

// Known option values read as their labels with the card's units ("22\""); unknown values keep a readable fallback.
function formatAttributeValue(value: unknown, key: string, filter?: InstrumentFilterConfig) {
  const values = Array.isArray(value) ? value : [value];

  return values
    .map((item) => {
      if (item === null || item === undefined || item === "") {
        return "";
      }

      const stringValue = String(item);
      if (filter && (!filter.options || filter.options.some((option) => option.value === stringValue))) {
        return attributeValueLabel(filter, key, stringValue);
      }
      return fallbackAttributeValues[stringValue] ?? formatAttributeLabel(stringValue);
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
