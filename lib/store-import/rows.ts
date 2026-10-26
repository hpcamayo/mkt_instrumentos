// Turns one staged row's cells into typed values and issues, using the confirmed mapping (design §7.4). This is the
// merchant-facing validation: the database checks the inventory fields again when it plans and commits the row.
import { categoryOptions, conditionOptions, legacyCategories } from "@/lib/listings";
import { instrumentTypesByCategory } from "@/lib/listing-submission";
import { instrumentFilterGroups } from "@/lib/instrument-filters";
import { MAX_PRICE_PEN } from "@/lib/price";
import { IMPORT_MAX_CELL_CHARS } from "./limits";
import { fieldLabel, normalizeHeader, type ImportMapping } from "./mapping";
import type { ImportCell, ImportIssue } from "./types";

export type ParsedImportRow = {
  sku: string | null;
  product_name: string | null;
  brand: string | null;
  model: string | null;
  category: string | null;
  instrument_type: string | null;
  variant_label: string | null;
  unit_price_pen: number | null;
  quantity: number | null;
  condition: string | null;
  description: string | null;
  low_stock_threshold: number | null;
  external_reference: string | null;
  photos: string[] | null;
  listing_id: string | null;
  exported_at: string | null;
  attributes: Record<string, string>;
};

const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SCIENTIFIC = /^[+-]?\d+(?:[.,]\d+)?[eE][+-]?\d+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_STOCK = 100000;
// What a Laria export writes in "Exportado el" (lib/inventory-export.ts). The database checks it again.
const EXPORTED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?Z$/;

const CATEGORY_BY_NAME: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const option of categoryOptions) {
    map.set(normalizeHeader(option.value), option.value);
    map.set(normalizeHeader(option.label), option.value);
  }
  for (const [legacy, target] of Object.entries(legacyCategories)) map.set(normalizeHeader(legacy), target.category);
  // disc-04: the names stores commonly give the Andean category in their own sheets.
  for (const name of ["Andinos", "Instrumentos andinos", "Andino", "Tradicionales", "Instrumentos tradicionales", "Folklore", "Folclore", "Folklórico", "Folclórico"]) {
    map.set(normalizeHeader(name), "andean");
  }
  return map;
})();

const TYPE_BY_NAME: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const group of instrumentFilterGroups) {
    map.set(normalizeHeader(group.instrumentType), group.instrumentType);
    map.set(normalizeHeader(group.label), group.instrumentType);
  }
  map.set("otro", "other");
  map.set("other", "other");
  return map;
})();

// The type that implies a category (every type except "other" belongs to exactly one).
const CATEGORY_OF_TYPE: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [category, types] of Object.entries(instrumentTypesByCategory)) {
    for (const type of types) if (type !== "other") map.set(type, category);
  }
  return map;
})();

const CONDITION_BY_NAME: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const condition of conditionOptions) map.set(normalizeHeader(condition).replace(/[^a-z]+/g, " ").trim(), condition);
  map.set("nuevo", "Nuevo");
  map.set("nueva", "Nuevo");
  map.set("new", "Nuevo");
  map.set("buen estado", "Usado - buen estado");
  map.set("usado buen estado", "Usado - buen estado");
  map.set("con detalles", "Usado - con detalles");
  map.set("usado con detalles", "Usado - con detalles");
  return map;
})();

type Context = { issues: ImportIssue[]; formulaWarned: boolean };

function issue(context: Context, field: string | null, code: string, severity: ImportIssue["severity"], message: string) {
  context.issues.push({ code, field, severity, message });
}

function cellFor(cells: ImportCell[], mapping: ImportMapping, field: string, context: Context): ImportCell | null {
  const column = mapping[field];
  if (column === undefined) return null;
  const cell = cells[column];
  // A formula with no cached value is unknown, not blank: a blank would keep the SKU's current value.
  if (cell?.f && cell.v === "") {
    issue(context, field, "IMPORT_FORMULA_NO_VALUE", "error",
      `${fieldLabel(field)}: la celda tiene una fórmula sin valor calculado. Abre el archivo en Excel, guárdalo y vuelve a subirlo.`);
    return null;
  }
  if (!cell || !cell.v.trim()) return null;
  if (cell.f && !context.formulaWarned) {
    context.formulaWarned = true;
    issue(context, field, "IMPORT_FORMULA", "warning", "La fila tiene fórmulas: se usó el valor calculado que guardó Excel.");
  }
  if (cell.k === "e") {
    issue(context, field, "IMPORT_CELL_ERROR", "error", `${fieldLabel(field)}: la celda tiene un error de Excel (${cell.v.slice(0, 20)}).`);
    return null;
  }
  if (cell.t || cell.v.length > IMPORT_MAX_CELL_CHARS) {
    issue(context, field, "IMPORT_CELL_TOO_LONG", "error", `${fieldLabel(field)}: la celda supera ${IMPORT_MAX_CELL_CHARS} caracteres.`);
    return null;
  }
  return cell;
}

function text(cells: ImportCell[], mapping: ImportMapping, field: string, context: Context, max: number) {
  const cell = cellFor(cells, mapping, field, context);
  if (!cell) return null;
  if (cell.k === "d") {
    issue(context, field, "IMPORT_DATE_COERCED", "warning", `${fieldLabel(field)}: Excel guardó este valor como fecha; revisa que sea correcto.`);
  }
  const value = cell.v.replace(/\s+/g, " ").trim();
  if (value.length > max) {
    issue(context, field, "IMPORT_FIELD_TOO_LONG", "error", `${fieldLabel(field)}: admite hasta ${max} caracteres.`);
    return null;
  }
  return value;
}

// SKU and Referencia externa: text identifiers. A number is accepted with a warning (leading zeros may be gone);
// scientific notation or a date means Excel already changed the value, so the row is refused rather than guessed.
function identifier(cells: ImportCell[], mapping: ImportMapping, field: "sku" | "external_reference", context: Context) {
  const cell = cellFor(cells, mapping, field, context);
  if (!cell) return null;
  const value = cell.v.trim();
  const label = field === "sku" ? "el SKU" : "la referencia externa";
  if (cell.k === "d") {
    issue(context, field, "IMPORT_IDENTIFIER_DATE", "error", `Excel convirtió ${label} en una fecha. Guarda esa columna como texto.`);
    return null;
  }
  if (SCIENTIFIC.test(value)) {
    issue(context, field, "IMPORT_IDENTIFIER_SCIENTIFIC", "error",
      `Excel convirtió ${label} a notación científica (${value}) y el valor original se perdió. Guarda esa columna como texto.`);
    return null;
  }
  // A spreadsheet number keeps 15 significant digits; a longer numeric code has already lost its last digits.
  if (cell.k === "n" && value.replace(/^0+|\D/g, "").length > 15) {
    issue(context, field, "IMPORT_IDENTIFIER_SCIENTIFIC", "error",
      `Excel guardó ${label} como número y perdió los últimos dígitos (${value}). Guarda esa columna como texto.`);
    return null;
  }
  if (cell.k === "n" || cell.k === "b") {
    issue(context, field, "IMPORT_IDENTIFIER_NUMBER", "warning", `Excel guardó ${label} como número; revisa los ceros a la izquierda.`);
  }
  return value;
}

// Whole non-negative numbers only: "12" or a numeric cell holding 12. Decimals, negatives, thousands separators and
// words are errors, never rounded.
function wholeNumber(cells: ImportCell[], mapping: ImportMapping, field: string, context: Context, max: number, message: string) {
  const cell = cellFor(cells, mapping, field, context);
  if (!cell) return null;
  const value = cell.v.trim();
  if (cell.k === "b") {
    issue(context, field, "IMPORT_NUMBER_INVALID", "error", `${fieldLabel(field)}: el valor es VERDADERO o FALSO. ${message}`);
    return null;
  }
  if (cell.k === "d") {
    issue(context, field, "IMPORT_NUMBER_DATE", "error", `${fieldLabel(field)}: Excel guardó el valor como fecha. ${message}`);
    return null;
  }
  const number = cell.k === "n" ? Number(value) : /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(number) || number < 0 || number > max) {
    issue(context, field, "IMPORT_NUMBER_INVALID", "error", message);
    return null;
  }
  return number;
}

// Whole soles (lib/price.ts contract). "S/ 1500", "1500", "1500.00" pass; "1.500" or "1,500" could be a thousand
// and a half or fifteen hundred, so they are refused with a message instead of guessed (design §7.4).
export function parsePriceCell(cell: ImportCell): { value: number } | { error: string } {
  const raw = cell.v.trim();
  if (cell.k === "n") {
    const number = Number(raw);
    if (Number.isSafeInteger(number) && number > 0 && number <= MAX_PRICE_PEN) return { value: number };
    return { error: "El precio debe estar en soles enteros, mayor que cero." };
  }
  const value = raw.replace(/^(s\/\.?|pen)\s*/i, "").replace(/\s+/g, "");
  if (/^\d+$/.test(value)) {
    const number = Number(value);
    return number > 0 && number <= MAX_PRICE_PEN ? { value: number } : { error: "El precio debe ser mayor que cero." };
  }
  if (/^\d+[.,]0{1,2}$/.test(value)) {
    const number = Number(value.split(/[.,]/)[0]);
    return number > 0 && number <= MAX_PRICE_PEN ? { value: number } : { error: "El precio debe ser mayor que cero." };
  }
  if (/^\d{1,3}([.,]\d{3})+$/.test(value)) {
    return { error: `Precio ambiguo (${raw}): escríbelo sin separadores de miles, por ejemplo 1500.` };
  }
  if (/^\d+[.,]\d+$/.test(value)) return { error: "El precio debe estar en soles enteros, sin céntimos." };
  if (/[$€]|usd|us\$/i.test(raw)) return { error: "El precio debe estar en soles (PEN); no convertimos monedas." };
  return { error: "El precio debe estar en soles enteros, por ejemplo 1500." };
}

export function parseImportRow(cells: ImportCell[], mapping: ImportMapping): { parsed: ParsedImportRow; issues: ImportIssue[] } {
  const context: Context = { issues: [], formulaWarned: false };

  const sku = identifier(cells, mapping, "sku", context);
  if (sku !== null && !SKU_PATTERN.test(sku)) {
    issue(context, "sku", "IMPORT_SKU_INVALID", "error", "El SKU admite letras, números, punto, guion y guion bajo, sin espacios, hasta 64 caracteres.");
  }

  const productName = text(cells, mapping, "product_name", context, 140);
  if (productName !== null && productName.length < 2) {
    issue(context, "product_name", "IMPORT_NAME_INVALID", "error", "El nombre debe tener entre 2 y 140 caracteres.");
  }

  let unitPrice: number | null = null;
  const priceCell = cellFor(cells, mapping, "unit_price_pen", context);
  if (priceCell) {
    const price = parsePriceCell(priceCell);
    if ("value" in price) unitPrice = price.value;
    else issue(context, "unit_price_pen", "IMPORT_PRICE_INVALID", "error", price.error);
  }

  const quantity = wholeNumber(cells, mapping, "quantity", context, MAX_STOCK, "El stock debe ser un número entero entre 0 y 100000.");
  const threshold = wholeNumber(cells, mapping, "low_stock_threshold", context, MAX_STOCK,
    "El umbral de stock bajo debe ser un número entero entre 0 y 100000.");

  let category: string | null = null;
  const categoryText = text(cells, mapping, "category", context, 80);
  if (categoryText) {
    category = CATEGORY_BY_NAME.get(normalizeHeader(categoryText)) ?? null;
    if (!category) issue(context, "category", "IMPORT_CATEGORY_UNKNOWN", "warning", `Categoría no reconocida: «${categoryText}».`);
  }
  let instrumentType: string | null = null;
  const typeText = text(cells, mapping, "instrument_type", context, 80);
  if (typeText) {
    instrumentType = TYPE_BY_NAME.get(normalizeHeader(typeText)) ?? null;
    if (!instrumentType) {
      issue(context, "instrument_type", "IMPORT_TYPE_UNKNOWN", "warning", `Tipo de instrumento no reconocido: «${typeText}».`);
    } else if (!category && CATEGORY_OF_TYPE.has(instrumentType)) {
      category = CATEGORY_OF_TYPE.get(instrumentType) ?? null;
    } else if (category && !(instrumentTypesByCategory[category] ?? []).includes(instrumentType)) {
      issue(context, "instrument_type", "IMPORT_TYPE_MISMATCH", "warning", `«${typeText}» no corresponde a la categoría elegida.`);
      instrumentType = null;
    }
  }

  let condition: string | null = null;
  const conditionText = text(cells, mapping, "condition", context, 60);
  if (conditionText) {
    condition = CONDITION_BY_NAME.get(normalizeHeader(conditionText).replace(/[^a-z]+/g, " ").trim()) ?? null;
    if (!condition) {
      issue(context, "condition", "IMPORT_CONDITION_UNKNOWN", "warning",
        `Condición no reconocida: «${conditionText}». Usa Nuevo, Usado - buen estado o Usado - con detalles.`);
    }
  }

  let listingId: string | null = null;
  const listingCell = cellFor(cells, mapping, "listing_id", context);
  if (listingCell) {
    const value = listingCell.v.trim();
    if (UUID.test(value)) listingId = value.toLowerCase();
    else issue(context, "listing_id", "IMPORT_LISTING_INVALID", "error", "El ID de publicación no es válido.");
  }

  const photosText = text(cells, mapping, "photos", context, IMPORT_MAX_CELL_CHARS);
  const photos = photosText
    ? [...new Set(photosText.split(/[;,\n]/).map((name) => name.trim().split(/[\\/]/).pop() ?? "").filter(Boolean))].slice(0, 20)
    : null;

  const attributes: Record<string, string> = {};
  for (const field of Object.keys(mapping)) {
    if (!field.startsWith("attribute:")) continue;
    const value = text(cells, mapping, field, context, 200);
    if (value) attributes[field.slice("attribute:".length)] = value;
  }

  // fix-04: the export time is only a hint for the stock check, so a value Excel changed is dropped with a note
  // instead of failing the row.
  let exportedAt: string | null = null;
  const exportedCell = cellFor(cells, mapping, "exported_at", context);
  if (exportedCell) {
    const value = exportedCell.v.trim();
    if (exportedCell.k !== "d" && exportedCell.k !== "n" && EXPORTED_AT.test(value)) exportedAt = value;
    else {
      issue(context, "exported_at", "IMPORT_EXPORTED_AT_UNREADABLE", "info",
        "No pudimos leer la fecha de exportación, así que no se comparó el stock con las ventas registradas después.");
    }
  }

  const description = text(cells, mapping, "description", context, IMPORT_MAX_CELL_CHARS);
  const parsed: ParsedImportRow = {
    sku,
    product_name: productName,
    brand: text(cells, mapping, "brand", context, 80),
    model: text(cells, mapping, "model", context, 80),
    category,
    instrument_type: instrumentType,
    variant_label: text(cells, mapping, "variant_label", context, 80),
    unit_price_pen: unitPrice,
    quantity,
    condition,
    description,
    low_stock_threshold: threshold,
    external_reference: identifier(cells, mapping, "external_reference", context),
    photos,
    listing_id: listingId,
    exported_at: exportedAt,
    attributes,
  };
  if (parsed.external_reference && parsed.external_reference.length > 120) {
    issue(context, "external_reference", "IMPORT_FIELD_TOO_LONG", "error", "Referencia externa: admite hasta 120 caracteres.");
  }

  // Publication needs more than inventory does; these rows import fine and stay unpublished until completed.
  const missing = [
    !parsed.unit_price_pen && "precio",
    !parsed.condition && "condición",
    !parsed.category && "categoría",
    (!parsed.description || parsed.description.length < 40) && "descripción de 40 caracteres",
  ].filter(Boolean);
  if (missing.length && !context.issues.some((item) => item.severity === "error")) {
    issue(context, null, "IMPORT_PUBLICATION_MISSING", "info", `Para publicar falta: ${missing.join(", ")}.`);
  }
  return { parsed, issues: context.issues };
}
