// Feature ideas, batch "store-reach" (docs/feature-ideas/store-reach.md), reach-01 "Importar desde Mercado Libre".
// Pure: turns Mercado Libre publications (the items API, read with the store's own authorization) into the rows of an
// ordinary Laria import file, with the template's own headings, so the existing wizard maps, reviews and commits them.
// Laria never guesses what Mercado Libre does not say: a price in dollars, a used condition (Laria's scale is finer)
// and a category it cannot tell are left empty for the store to fill in the review.
import { foldText } from "@/lib/catalog-query";
import { categoryOptions } from "@/lib/listings";
import { csvDocument } from "@/lib/spreadsheet/csv-write";
import { IMPORT_FIELDS, type ImportFieldKey } from "@/lib/store-import/mapping";
import { IMPORT_MAX_CELL_CHARS } from "@/lib/store-import/limits";

export const ML_PAGE_SIZE = 50;
export const ML_IMPORT_MAX_ITEMS = 100;
export const ML_MAX_PHOTOS_PER_ROW = 10;
export const ML_ITEM_ID = /^[A-Z]{3}\d{6,15}$/;

// The import's SKU and manifest rule (store_import_photo_assets and record_mercadolibre_import_photos check the same).
const SKU = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const PHOTO_URL = /^https:\/\/[a-z0-9-]+\.mlstatic\.com\/[A-Za-z0-9._~/%-]+$/;

export type MlPicture = { id?: string; secure_url?: string; url?: string };
export type MlAttribute = { id?: string; value_name?: string | null };
export type MlVariation = {
  id?: number | string;
  price?: number;
  available_quantity?: number;
  attribute_combinations?: { name?: string; value_name?: string | null }[];
  picture_ids?: string[];
  seller_custom_field?: string | null;
  attributes?: MlAttribute[];
};
export type MlItem = {
  id: string;
  title?: string;
  price?: number | null;
  currency_id?: string;
  available_quantity?: number;
  condition?: string;
  pictures?: MlPicture[];
  attributes?: MlAttribute[];
  seller_custom_field?: string | null;
  category_id?: string;
  variations?: MlVariation[];
  permalink?: string;
  status?: string;
};

export type MlSummaryItem = {
  id: string;
  title: string;
  price: number | null;
  currency: string | null;
  quantity: number;
  variations: number;
  permalink: string | null;
};

export type MlImportRow = {
  sku: string;
  name: string;
  brand: string;
  model: string;
  category: string;
  variant: string;
  price: number | null;
  quantity: number;
  condition: string;
  description: string;
  externalReference: string;
  photos: string[];
  notes: MlRowNote[];
};

export type MlRowNote = "price_not_pen" | "condition_used" | "category_unknown";

const CSV_FIELDS: readonly ImportFieldKey[] = [
  "sku", "product_name", "brand", "model", "category", "variant_label", "unit_price_pen", "quantity", "condition", "description", "external_reference",
];

function attribute(attributes: MlAttribute[] | undefined, id: string) {
  const value = attributes?.find((item) => item.id === id)?.value_name;
  return typeof value === "string" ? value.trim() : "";
}

function validSku(value: string | null | undefined) {
  const text = (value ?? "").trim();
  return SKU.test(text) ? text : null;
}

export function mlPhotoUrl(picture: MlPicture | undefined) {
  const raw = picture?.secure_url || picture?.url?.replace(/^http:\/\//, "https://") || "";
  return PHOTO_URL.test(raw) ? raw : null;
}

export function isMlPhotoUrl(value: string) {
  return PHOTO_URL.test(value);
}

function clean(value: string | null | undefined, max: number) {
  return (value ?? "").replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

// Whole soles: Laria's prices have no cents, so S/ 1,299.90 becomes S/ 1,300 (the store sees it in the review).
export function mlPricePen(price: number | null | undefined, currency: string | null | undefined) {
  if (currency !== "PEN" || typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
  const rounded = Math.round(price);
  return rounded > 0 && rounded <= 2_147_483_647 ? rounded : null;
}

function quantity(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 100000) : 0;
}

// Only "Nuevo" maps: Mercado Libre's "usado" covers several steps of Laria's scale, so the store picks the one.
export function mlCondition(condition: string | undefined) {
  return condition === "new" ? "Nuevo" : "";
}

const CATEGORY_LABEL = new Map<string, string>(categoryOptions.map((option) => [option.value, option.label]));
const NOT_AN_INSTRUMENT = /\b(accesorios?|repuestos?|estuches?|fundas?|soportes?|atriles?|cables?|puas?|correas?|afinadores?|metronomos?|partituras?|libros?|baquetas?)\b/;
// Tried from the most specific name of Mercado Libre's category path to the most general; the first match wins.
const CATEGORY_RULES: readonly [RegExp, string][] = [
  [/\b(charangos?|quenas?|zamponas?|sikus?|andinos?|bombos? legueros?)\b/, "andean"],
  [/\bpedal(es|eras?)?\b|\bmultiefectos?\b|\bprocesadores? de efectos\b/, "pedals"],
  [/\bbajos?\b/, "basses"],
  [/\bguitarras?\b/, "guitars"],
  [/\b(teclados?|pianos?|sintetizadores?|organos?)\b/, "keyboards"],
  [/\b(baterias?|percusion|platillos?|cajon(es)?|tambores?|timbales?|bongos?|congas?)\b/, "percussion"],
  [/\b(vientos?|saxofon(es)?|saxos?|trompetas?|flautas?|clarinetes?|trombon(es)?|armonicas?)\b/, "winds"],
  [/\b(violin(es)?|violas?|violonchelos?|cellos?|contrabajos?|arpas?|mandolinas?|ukeleles?|ukuleles?)\b/, "strings"],
  [/\bamplificador(es)?\b/, "amplifiers"],
  [/\bmicrofonos?\b/, "microphones"],
  [/\b(interfaces? de audio|interfaz de audio|consolas?|mezcladoras?|monitores? de estudio|parlantes?|audifonos?|grabacion)\b/, "audio"],
];

// The Laria category (its label, as the import file writes it) for a Mercado Libre category path, or "" when unsure.
export function mlCategoryLabel(path: readonly string[]) {
  const names = path.map((name) => foldText(name));
  const leaf = names.at(-1) ?? "";
  // A leaf that names an accessory is not an instrument, whatever its parents say (pedals are an instrument here).
  if (NOT_AN_INSTRUMENT.test(leaf) && !CATEGORY_RULES[1][0].test(leaf)) return "";
  for (const name of [...names].reverse()) {
    const rule = CATEGORY_RULES.find(([pattern]) => pattern.test(name));
    if (rule) return CATEGORY_LABEL.get(rule[1]) ?? "";
  }
  return "";
}

function variantLabel(variation: MlVariation) {
  return (variation.attribute_combinations ?? [])
    .filter((item) => item.name && item.value_name)
    .map((item) => `${item.name}: ${item.value_name}`)
    .join(", ")
    .slice(0, 120);
}

// One row per publication, or one per variation. SKUs: the store's own (seller_custom_field or SELLER_SKU) when the
// import accepts it and it is not repeated; otherwise the Mercado Libre code, so a second import updates the same SKU.
export function mlItemRows(item: MlItem, description: string, categoryLabel: string, taken: Set<string> = new Set()): MlImportRow[] {
  if (!ML_ITEM_ID.test(item.id)) return [];
  const photosById = new Map((item.pictures ?? []).map((picture) => [picture.id ?? "", mlPhotoUrl(picture)]));
  const allPhotos = (item.pictures ?? []).map(mlPhotoUrl).filter((url): url is string => Boolean(url));
  const base = {
    name: clean(item.title, 140),
    brand: clean(attribute(item.attributes, "BRAND"), 60),
    model: clean(attribute(item.attributes, "MODEL"), 80),
    category: categoryLabel,
    condition: mlCondition(item.condition),
    description: clean(description, IMPORT_MAX_CELL_CHARS),
    externalReference: item.id,
  };
  const variations = (item.variations ?? []).filter((variation) => variation.id !== undefined && /^\d{1,20}$/.test(String(variation.id)));
  const sources = variations.length ? variations : [null];
  return sources.map((variation) => {
    const fallback = variation ? `${item.id}-${variation.id}` : item.id;
    const own = validSku(variation?.seller_custom_field) ?? validSku(attribute(variation?.attributes, "SELLER_SKU"))
      ?? (variations.length ? null : validSku(item.seller_custom_field) ?? validSku(attribute(item.attributes, "SELLER_SKU")));
    const sku = own && !taken.has(own.toUpperCase()) ? own : fallback;
    taken.add(sku.toUpperCase());
    const ids = variation?.picture_ids?.length ? variation.picture_ids : null;
    const photos = (ids ? ids.map((id) => photosById.get(id) ?? null).filter((url): url is string => Boolean(url)) : allPhotos).slice(0, ML_MAX_PHOTOS_PER_ROW);
    const price = mlPricePen(variation?.price ?? item.price, item.currency_id);
    const notes: MlRowNote[] = [];
    if (price === null) notes.push("price_not_pen");
    if (!base.condition) notes.push("condition_used");
    if (!categoryLabel) notes.push("category_unknown");
    return {
      ...base,
      sku,
      variant: variation ? variantLabel(variation) : "",
      price,
      quantity: quantity(variation?.available_quantity ?? item.available_quantity),
      photos,
      notes,
    };
  });
}

// The import file: the template's headings (lib/store-import/mapping.ts), so the wizard proposes the mapping itself.
export function mlImportCsv(rows: MlImportRow[]) {
  const label = (key: ImportFieldKey) => IMPORT_FIELDS.find((field) => field.key === key)?.label ?? key;
  const value = (row: MlImportRow, key: ImportFieldKey) => {
    switch (key) {
      case "sku": return row.sku;
      case "product_name": return row.name;
      case "brand": return row.brand;
      case "model": return row.model;
      case "category": return row.category;
      case "variant_label": return row.variant;
      case "unit_price_pen": return row.price ?? "";
      case "quantity": return row.quantity;
      case "condition": return row.condition;
      case "description": return row.description;
      case "external_reference": return row.externalReference;
      default: return "";
    }
  };
  return csvDocument([CSV_FIELDS.map(label), ...rows.map((row) => CSV_FIELDS.map((key) => value(row, key)))]);
}

export function mlImportPhotos(rows: MlImportRow[]) {
  return rows.flatMap((row) => row.photos.map((url, index) => ({ sku: row.sku, order: index + 1, url })));
}

export function mlImportSummary(rows: MlImportRow[]) {
  const count = (note: MlRowNote) => rows.filter((row) => row.notes.includes(note)).length;
  return {
    rows: rows.length,
    photos: rows.reduce((total, row) => total + row.photos.length, 0),
    withoutPrice: count("price_not_pen"),
    withoutCondition: count("condition_used"),
    withoutCategory: count("category_unknown"),
  };
}

export function parseMlSummaryItem(body: unknown): MlSummaryItem | null {
  if (!body || typeof body !== "object") return null;
  const item = body as MlItem;
  if (typeof item.id !== "string" || !ML_ITEM_ID.test(item.id)) return null;
  return {
    id: item.id,
    title: clean(item.title, 200) || item.id,
    price: typeof item.price === "number" && Number.isFinite(item.price) ? item.price : null,
    currency: typeof item.currency_id === "string" ? item.currency_id : null,
    quantity: quantity(item.available_quantity),
    variations: Array.isArray(item.variations) ? item.variations.length : 0,
    permalink: typeof item.permalink === "string" && /^https:\/\/[a-z0-9.-]*mercadolibre\.com\.pe\//.test(item.permalink) ? item.permalink : null,
  };
}

export function formatMlPrice(price: number | null, currency: string | null) {
  if (price === null) return "Sin precio";
  if (currency === "PEN") return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 2 }).format(price);
  if (currency === "USD") return `US$ ${new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(price)}`;
  return `${price} ${currency ?? ""}`.trim();
}
