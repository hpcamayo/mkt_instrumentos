// What a store's import file needs (review fix B1): the accepted formats and which columns create a SKU, which ones a
// publication needs and which are optional. The start page and the template's "Instrucciones" sheet both read it, so
// they say the same thing as the column step (labels come from the import fields).
import { fieldLabel, type ImportFieldKey } from "./mapping";
import { IMPORT_HEADER_SEARCH_ROWS, IMPORT_MAX_DATA_ROWS, IMPORT_MAX_FILE_BYTES } from "./limits";

export type ColumnRequirement = "create" | "publish" | "optional";

export type ColumnGuideEntry = { key: ImportFieldKey; note: string };

export type ColumnGuideGroup = {
  requirement: ColumnRequirement;
  title: string;
  summary: string;
  columns: readonly ColumnGuideEntry[];
  // A requirement that is not a column (photos travel separately).
  extra?: string;
};

const MAX_MB = Math.round(IMPORT_MAX_FILE_BYTES / (1024 * 1024));

export const IMPORT_FILE_RULES: readonly string[] = [
  "Excel (.xlsx) o CSV separado por comas, punto y coma o tabulaciones.",
  `Hasta ${MAX_MB} MB y ${IMPORT_MAX_DATA_ROWS} filas. Del Excel se lee la primera hoja visible.`,
  `Una fila por SKU. Los encabezados van en una sola fila, dentro de las primeras ${IMPORT_HEADER_SEARCH_ROWS}; puede haber un título encima.`,
  "Los encabezados pueden ser los tuyos: en el siguiente paso eliges qué dato tiene cada columna.",
  "No se aceptan .xls antiguos ni archivos con macros (.xlsm). En Excel, usa Guardar como → Libro de Excel (.xlsx).",
  "Las fotos no van dentro del archivo: se suben después, en el paso Fotos.",
  "¿Solo quieres cambiar precios? Exporta tu inventario, cámbialos en Excel y súbelo: Laria no deshace las ventas que registres mientras tanto.",
];

export const IMPORT_COLUMN_GROUPS: readonly ColumnGuideGroup[] = [
  {
    requirement: "create",
    title: "Para crear un SKU",
    summary: "Obligatorias en cada fila nueva. Para actualizar un SKU que ya tienes basta el SKU y las columnas que cambian.",
    columns: [
      { key: "product_name", note: "De 2 a 140 caracteres." },
      { key: "quantity", note: "Total contado de unidades, de 0 a 100000." },
    ],
  },
  {
    requirement: "publish",
    title: "Para publicar",
    summary: "El SKU se importa sin ellas, pero no se puede publicar hasta completarlas. Puedes completarlas después en el resultado.",
    columns: [
      { key: "brand", note: "Por ejemplo Fender o Yamaha." },
      { key: "model", note: "Por ejemplo Stratocaster o P-45." },
      { key: "category", note: "Una categoría de Laria; están en la hoja Valores de la plantilla." },
      { key: "instrument_type", note: "Solo si la categoría tiene varios tipos, como Guitarras." },
      { key: "condition", note: "Nuevo, Usado - buen estado o Usado - con detalles." },
      { key: "description", note: "Al menos 40 caracteres." },
      { key: "unit_price_pen", note: "Soles enteros, sin separador de miles ni céntimos: 1500." },
    ],
    extra: "De 2 a 10 fotos por SKU, que subes en el paso Fotos.",
  },
  {
    requirement: "optional",
    title: "Opcionales",
    summary: "Úsalas si las tienes.",
    columns: [
      { key: "sku", note: "Tu código interno. Si lo dejas vacío, Laria genera uno; recomendado para actualizar después." },
      { key: "variant_label", note: "Color, acabado, medida u otra versión." },
      { key: "low_stock_threshold", note: "Avisa cuando el stock llega a este número." },
      { key: "external_reference", note: "Código de tu sistema o código de barras." },
      { key: "photos", note: "Nombres de las fotos separados por punto y coma, en orden." },
      { key: "listing_id", note: "Solo para vincular publicaciones existentes; viene en la exportación del inventario." },
    ],
    extra: "Atributos de la categoría, como Tipo de cuerpo para guitarras: la plantilla los agrega si eliges una categoría.",
  },
];

const REQUIREMENT_LABELS: Record<ColumnRequirement, string> = {
  create: "Obligatoria para crear un SKU",
  publish: "Necesaria para publicar",
  optional: "Opcional",
};

// "Obligatoria para crear un SKU. De 2 a 140 caracteres." for one column; null for a field the guide does not list.
export function columnGuideText(key: string) {
  for (const group of IMPORT_COLUMN_GROUPS) {
    const entry = group.columns.find((column) => column.key === key);
    if (entry) return `${REQUIREMENT_LABELS[group.requirement]}. ${entry.note}`;
  }
  return null;
}

export function columnGuideLabel(entry: ColumnGuideEntry) {
  return fieldLabel(entry.key);
}
