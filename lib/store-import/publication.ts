// Publication from an import (design §7.7): turns one applied row into the fields the publish form would send, with
// the publish form's own rules (lib/listing-submission.ts), so an imported listing is held to the same contract as one
// typed by hand. Price, photos and store contact data are not built here: the database takes them from the SKU, the
// row's validated photos and the store.
import { getInstrumentFilterGroup, type InstrumentFilterConfig } from "@/lib/instrument-filters";
import { instrumentTypesByCategory, isInstrumentTypeValid, sanitizeListingAttributes, type ListingSubmissionAttributes } from "@/lib/listing-submission";
import { categoryOptions, conditionOptions } from "@/lib/listings";
import { normalizeHeader } from "./mapping";
import type { ParsedImportRow } from "./rows";

export const PUBLISH_CHUNK_ROWS = 20;
const MIN_DESCRIPTION = 40;
const MAX_DESCRIPTION = 10000;
const MAX_FIELD = 500;
const MAX_TITLE = 140;

export type PublicationItem = {
  product_name: string;
  variant_label: string | null;
  unit_price_pen: number | null;
};

export type PublicationFields = {
  title: string;
  brand: string;
  model: string;
  category: string;
  instrument_type: string;
  condition: string;
  description: string;
  attributes: ListingSubmissionAttributes;
};

// What a row still lacks, by key ("Completar datos" opens the matching fields) and by name (the list shown in the row).
export type MissingField = "name" | "brand" | "model" | "category" | "instrument_type" | "condition" | "description" | "price";

export type PublicationPlan = { fields: PublicationFields | null; missing: string[]; missingFields: MissingField[]; warnings: string[] };

// The values the owner typed with "Completar datos" (review fix B5), stored on the staged row as publish_fields.
export type PublishFieldOverrides = Partial<Record<"brand" | "model" | "category" | "instrument_type" | "condition" | "description", string>>;

export const PUBLISH_FIELD_KEYS = ["brand", "model", "category", "instrument_type", "condition", "description"] as const;

// The row's values with the owner's completed fields laid over them. A new category drops a type that does not belong
// to it, so the type is asked for again (or defaulted for single-type categories).
export function applyPublishFields(parsed: ParsedImportRow, overrides: PublishFieldOverrides | null | undefined): ParsedImportRow {
  if (!overrides) return parsed;
  const next: ParsedImportRow = { ...parsed };
  for (const key of PUBLISH_FIELD_KEYS) {
    const value = overrides[key];
    if (typeof value === "string" && value.trim()) next[key] = value.trim();
  }
  if (next.category && next.instrument_type && !isInstrumentTypeValid(next.category, next.instrument_type)) {
    next.instrument_type = null;
  }
  return next;
}

// The listing title is the SKU's current name, with the variant when the name does not already say it.
export function publicationTitle(item: PublicationItem) {
  const name = item.product_name.replace(/\s+/g, " ").trim();
  const variant = item.variant_label?.replace(/\s+/g, " ").trim();
  const title = variant && !normalizeHeader(name).includes(normalizeHeader(variant)) ? `${name} - ${variant}` : name;
  return title.slice(0, MAX_TITLE).trim();
}

// A category with exactly one specific instrument type (Bajos → bajo, Pedales → pedal…) does not need the column.
export function defaultInstrumentType(category: string): string | null {
  const specific = (instrumentTypesByCategory[category] ?? []).filter((type) => type !== "other");
  return specific.length === 1 ? specific[0] : null;
}

const YES = new Set(["si", "sí", "yes", "x", "true", "verdadero", "1"]);
const NO = new Set(["no", "false", "falso", "0"]);

function optionFor(filter: InstrumentFilterConfig, raw: string): string | null {
  const wanted = normalizeHeader(raw);
  if (filter.type === "boolean") {
    if (YES.has(wanted)) return "yes";
    if (NO.has(wanted)) return "no";
  }
  const option = filter.options?.find((item) => normalizeHeader(item.value) === wanted || normalizeHeader(item.label) === wanted);
  return option?.value ?? null;
}

// Spreadsheet text → stored attribute values for the chosen type. A value Laria does not recognize, or a column that
// does not apply to the type, is left out with a warning: attributes are optional, so they never block publication.
export function publicationAttributes(instrumentType: string, raw: Record<string, string>) {
  const warnings: string[] = [];
  const group = getInstrumentFilterGroup(instrumentType);
  if (!group) return { attributes: {} as ListingSubmissionAttributes, warnings };
  const output: Record<string, unknown> = {};
  for (const [key, text] of Object.entries(raw)) {
    const filter = group.filters.find((item) => item.key === key);
    if (!filter) {
      warnings.push(`El atributo de la columna «${key}» no corresponde a este tipo de instrumento y no se publica.`);
      continue;
    }
    // No attribute is numeric today; the branch keeps the publish form's number rule if one is added.
    if ((filter.type as string) === "number") {
      const match = /^\s*(\d+(?:[.,]\d+)?)/.exec(text);
      if (match) output[key] = Number(match[1].replace(",", "."));
      else warnings.push(`${filter.label}: «${text}» no es un número; no se publica.`);
    } else if (filter.type === "multiselect") {
      const values = text.split(/[;,/]/).map((part) => part.trim()).filter(Boolean).map((part) => optionFor(filter, part));
      if (values.length && values.every((value): value is string => value !== null)) output[key] = [...new Set(values)];
      else warnings.push(`${filter.label}: «${text}» no coincide con las opciones de Laria; no se publica.`);
    } else {
      const value = optionFor(filter, text);
      if (value) output[key] = value;
      else warnings.push(`${filter.label}: «${text}» no coincide con las opciones de Laria; no se publica.`);
    }
  }
  return { attributes: sanitizeListingAttributes(instrumentType, output) ?? {}, warnings };
}

export function planPublication(parsed: ParsedImportRow, item: PublicationItem): PublicationPlan {
  const missing: string[] = [];
  const missingFields: MissingField[] = [];
  const lack = (key: MissingField, label: string) => {
    missingFields.push(key);
    missing.push(label);
  };
  const title = publicationTitle(item);
  const brand = parsed.brand?.trim() ?? "";
  const model = parsed.model?.trim() ?? "";
  const category = parsed.category && categoryOptions.some((option) => option.value === parsed.category) ? parsed.category : "";
  const condition = parsed.condition && conditionOptions.some((value) => value === parsed.condition) ? parsed.condition : "";
  const description = parsed.description?.trim() ?? "";
  let instrumentType = parsed.instrument_type ?? "";
  if (!instrumentType && category) instrumentType = defaultInstrumentType(category) ?? "";

  if (title.length < 2) lack("name", "nombre");
  if (!brand || brand.length > MAX_FIELD) lack("brand", "marca");
  if (!model || model.length > MAX_FIELD) lack("model", "modelo");
  if (!category) lack("category", "categoría");
  else if (!instrumentType || !isInstrumentTypeValid(category, instrumentType)) lack("instrument_type", "tipo de instrumento");
  if (!condition) lack("condition", "condición");
  if (description.length < MIN_DESCRIPTION || description.length > MAX_DESCRIPTION) lack("description", "descripción de 40 caracteres");
  if (!item.unit_price_pen || item.unit_price_pen <= 0) lack("price", "precio");

  const { attributes, warnings } = instrumentType && category && isInstrumentTypeValid(category, instrumentType)
    ? publicationAttributes(instrumentType, parsed.attributes ?? {})
    : { attributes: {}, warnings: [] };
  if (missing.length) return { fields: null, missing, missingFields, warnings };
  return {
    fields: { title, brand, model, category, instrument_type: instrumentType, condition, description, attributes },
    missing,
    missingFields,
    warnings,
  };
}
