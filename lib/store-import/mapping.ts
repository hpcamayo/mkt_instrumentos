// Import fields and column mapping (design §7.3). Headers are matched to fields by normalized Spanish/English
// synonyms; the merchant confirms or corrects the proposal once. Attribute columns map to the existing attribute keys
// of lib/instrument-filters.ts, so there is no second taxonomy.
import { instrumentFilterGroups } from "@/lib/instrument-filters";

export type ImportFieldKey =
  | "sku"
  | "product_name"
  | "brand"
  | "model"
  | "category"
  | "instrument_type"
  | "variant_label"
  | "unit_price_pen"
  | "quantity"
  | "condition"
  | "description"
  | "low_stock_threshold"
  | "external_reference"
  | "photos"
  | "listing_id"
  | "exported_at";

export type ImportField = {
  key: ImportFieldKey;
  label: string;
  help: string;
  synonyms: readonly string[];
};

// Synonyms are matched after normalizeHeader, so a hyphen stands for a space (it keeps the copy scan off them).
// Template order (owner brief §9). "Nombre" rather than "Nombre del producto" (glossary, D-13); the brief's heading is
// still recognized.
export const IMPORT_FIELDS: readonly ImportField[] = [
  { key: "sku", label: "SKU", help: "Tu código interno. Si lo dejas vacío, Laria genera uno.", synonyms: ["sku", "código", "cód.", "cod", "código interno", "código-de-producto", "item", "ref", "referencia"] },
  { key: "product_name", label: "Nombre", help: "Obligatorio para crear un SKU nuevo.", synonyms: ["nombre", "nombre-del-producto", "producto", "descripción corta", "artículo", "name", "product name", "title", "título"] },
  { key: "brand", label: "Marca", help: "Recomendado.", synonyms: ["marca", "brand", "fabricante"] },
  { key: "model", label: "Modelo", help: "Recomendado.", synonyms: ["modelo", "model"] },
  { key: "category", label: "Categoría", help: "Necesaria para publicar.", synonyms: ["categoría", "category", "rubro", "familia", "línea"] },
  { key: "instrument_type", label: "Tipo de instrumento", help: "Opcional.", synonyms: ["tipo de instrumento", "tipo", "subcategoría", "type", "instrument type"] },
  { key: "variant_label", label: "Variante", help: "Color, acabado, medida u otra versión.", synonyms: ["variante", "variant", "color", "acabado", "versión"] },
  { key: "unit_price_pen", label: "Precio (PEN)", help: "En soles enteros, sin decimales. Necesario para publicar.", synonyms: ["precio (pen)", "precio pen", "precio", "precio de venta", "precio venta", "p. venta", "pvp", "price", "precio s/", "precio s/.", "precio unitario"] },
  { key: "quantity", label: "Stock", help: "Total contado de unidades, de 0 a 100000.", synonyms: ["stock", "cantidad", "cant", "existencias", "unidades", "qty", "quantity", "stock actual", "inventario", "saldo"] },
  { key: "condition", label: "Condición", help: "Nuevo, Como nuevo, Muy bueno, Bueno… (la escala está en la hoja Valores). Necesaria para publicar.", synonyms: ["condición", "estado", "condition"] },
  { key: "description", label: "Descripción", help: "Al menos 40 caracteres para publicar.", synonyms: ["descripción", "description", "detalle", "detalles"] },
  { key: "low_stock_threshold", label: "Umbral de stock bajo", help: "Opcional: avisa cuando el stock llega a este número.", synonyms: ["umbral de stock bajo", "umbral", "stock mínimo", "mínimo", "min", "punto de reorden"] },
  { key: "external_reference", label: "Referencia externa", help: "Opcional: código de tu sistema o código de barras.", synonyms: ["referencia externa", "ref externa", "código externo", "código de barras", "código de barra", "código barras", "cód. barras", "cód. de barras", "ean", "upc", "barcode"] },
  { key: "photos", label: "Foto(s)", help: "Opcional: nombres de archivo separados por punto y coma.", synonyms: ["foto(s)", "fotos", "foto", "imágenes", "imagen", "photos", "images"] },
  { key: "listing_id", label: "ID de publicación", help: "Solo para vincular publicaciones existentes (viene en la exportación).", synonyms: ["id de publicación", "id publicación", "listing id", "listing_id"] },
];

// fix-04: a Laria export says when it was made, so a re-import can tell which stock cells predate sales recorded since.
// It is a mapping target but not a template column (a store never types it).
export const EXPORTED_AT_FIELD: ImportField = {
  key: "exported_at",
  label: "Exportado el",
  help: "Viene en la exportación de Laria: evita deshacer ventas registradas después.",
  synonyms: ["exportado el", "exportado", "fecha de exportación", "exported at"],
};

export const IMPORT_FIELD_KEYS = [...IMPORT_FIELDS, EXPORTED_AT_FIELD].map((field) => field.key);

// fix-04: what the file updates on SKU that already exist. New SKU always take the row's stock and price.
export type ImportUpdateScope = "prices" | "stock" | "both";

export const IMPORT_UPDATE_SCOPES: readonly { value: ImportUpdateScope; label: string; hint: string }[] = [
  { value: "prices", label: "Precios", hint: "El stock de tus SKU no cambia, aunque el archivo tenga una columna de stock." },
  { value: "stock", label: "Stock", hint: "Los precios de tus SKU no cambian. El stock del archivo reemplaza al de hoy." },
  { value: "both", label: "Ambos", hint: "Cambian el stock y los precios de tus SKU." },
];

// The question is asked only when the mapping leaves a real choice: without a stock column the file can only update
// prices, without a price column only stock.
export function impliedUpdateScope(mapping: ImportMapping): ImportUpdateScope | null {
  if (mapping.quantity === undefined) return "prices";
  if (mapping.unit_price_pen === undefined) return "stock";
  return null;
}

export type AttributeField = { key: `attribute:${string}`; attribute: string; label: string };

// One mapping target per attribute key; a label shared by several instrument types maps to the first key found.
export const IMPORT_ATTRIBUTE_FIELDS: readonly AttributeField[] = (() => {
  const seen = new Set<string>();
  const fields: AttributeField[] = [];
  for (const group of instrumentFilterGroups) {
    for (const filter of group.filters) {
      if (seen.has(filter.key)) continue;
      seen.add(filter.key);
      fields.push({ key: `attribute:${filter.key}`, attribute: filter.key, label: filter.label });
    }
  }
  return fields;
})();

export type ImportMapping = Record<string, number>;

export function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/()_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loose(value: string) {
  return normalizeHeader(value).replace(/[^a-z0-9]+/g, "");
}

const SYNONYMS: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const field of [...IMPORT_FIELDS, EXPORTED_AT_FIELD]) {
    for (const synonym of [field.label, ...field.synonyms]) {
      if (!map.has(loose(synonym))) map.set(loose(synonym), field.key);
    }
  }
  for (const field of IMPORT_ATTRIBUTE_FIELDS) {
    for (const synonym of [field.label, field.attribute]) {
      if (!map.has(loose(synonym))) map.set(loose(synonym), field.key);
    }
  }
  return map;
})();

export function fieldLabel(key: string) {
  return [...IMPORT_FIELDS, EXPORTED_AT_FIELD].find((field) => field.key === key)?.label
    ?? IMPORT_ATTRIBUTE_FIELDS.find((field) => field.key === key)?.label
    ?? key;
}

export function isMappableField(key: string) {
  return (IMPORT_FIELD_KEYS as readonly string[]).includes(key) || IMPORT_ATTRIBUTE_FIELDS.some((field) => field.key === key);
}

// Proposes a mapping: the store's saved mapping first (by exact normalized header), then synonyms. Each field and
// each column is used once; the leftmost column wins.
export function proposeMapping(headers: readonly string[], saved?: Record<string, string> | null): ImportMapping {
  const mapping: ImportMapping = {};
  const usedColumns = new Set<number>();
  const assign = (field: string, column: number) => {
    if (mapping[field] !== undefined || usedColumns.has(column) || !isMappableField(field)) return;
    mapping[field] = column;
    usedColumns.add(column);
  };
  if (saved) {
    headers.forEach((header, column) => {
      const field = saved[header.trim().toLowerCase()];
      if (field) assign(field, column);
    });
  }
  headers.forEach((header, column) => {
    const field = SYNONYMS.get(loose(header));
    if (field) assign(field, column);
  });
  return mapping;
}

export type MappingProblem = { field: string | null; message: string };

// Mirrors the checks of confirm_store_import_mapping so the wizard can explain them before submitting. Without a scope
// (an older caller) the file updates both, as before fix-04.
export function mappingProblems(mapping: ImportMapping, columnCount: number, scope: ImportUpdateScope | null = "both"): MappingProblem[] {
  const problems: MappingProblem[] = [];
  const columns = Object.values(mapping);
  if (new Set(columns).size !== columns.length) problems.push({ field: null, message: "Cada columna se puede usar una sola vez." });
  if (columns.some((column) => !Number.isInteger(column) || column < 0 || column >= columnCount)) {
    problems.push({ field: null, message: "Revisa las columnas elegidas." });
  }
  const effective = scope ?? impliedUpdateScope(mapping);
  if (!scope && mapping.quantity === undefined && mapping.unit_price_pen === undefined) {
    problems.push({ field: "quantity", message: "Elige la columna de stock o la de precio." });
  } else if (!effective) {
    problems.push({ field: "scope", message: "Elige qué actualiza este archivo." });
  } else if (effective !== "prices" && mapping.quantity === undefined) {
    problems.push({ field: "quantity", message: "Elige la columna de stock." });
  } else if (effective === "prices" && mapping.unit_price_pen === undefined) {
    problems.push({ field: "unit_price_pen", message: "Elige la columna de precio." });
  }
  if (mapping.sku === undefined && mapping.product_name === undefined && mapping.listing_id === undefined) {
    problems.push({ field: "sku", message: "Elige la columna de SKU o de nombre." });
  }
  return problems;
}
