// Downloadable import template (design §7.3): Spanish headings from the owner brief §9, two sample rows, the
// attribute columns of the chosen category (from lib/instrument-filters.ts), and a sheet with the accepted values.
import { getInstrumentFilterGroup } from "@/lib/instrument-filters";
import { instrumentTypesByCategory } from "@/lib/listing-submission";
import { categoryOptions } from "@/lib/listings";
import { conditionScale } from "@/lib/listing-condition";
import { writeXlsx, type XlsxCell } from "@/lib/spreadsheet/xlsx-write";
import { columnGuideText } from "./columns-guide";
import { IMPORT_FIELDS } from "./mapping";
import { csvRow } from "./report";

const SAMPLE_ROWS: Record<string, XlsxCell>[] = [
  {
    sku: "DS1-004", product_name: "Pedal Boss DS-1 Distortion", brand: "Boss", model: "DS-1", category: "Pedales",
    instrument_type: "Pedales", variant_label: "", unit_price_pen: 349, quantity: 8, condition: "Nuevo",
    description: "Pedal de distorsión clásico, nuevo en caja sellada, con garantía de la tienda.",
    low_stock_threshold: 2, external_reference: "", photos: "DS1-004__01.jpg; DS1-004__02.jpg", listing_id: "",
  },
  {
    sku: "00123", product_name: "Micrófono Shure SM57", brand: "Shure", model: "SM57", category: "Micrófonos",
    instrument_type: "", variant_label: "", unit_price_pen: 520, quantity: 3, condition: "Nuevo",
    description: "Micrófono dinámico para instrumentos y voz, nuevo, con pinza y bolsa.",
    low_stock_threshold: 1, external_reference: "042406069232", photos: "", listing_id: "",
  },
];

function attributeColumns(category: string | null) {
  if (!category) return [];
  const seen = new Set<string>();
  const columns: { key: string; label: string }[] = [];
  for (const type of instrumentTypesByCategory[category] ?? []) {
    for (const filter of getInstrumentFilterGroup(type)?.filters ?? []) {
      if (seen.has(filter.key)) continue;
      seen.add(filter.key);
      columns.push({ key: filter.key, label: filter.label });
    }
  }
  return columns;
}

export function templateColumns(category: string | null) {
  const validCategory = categoryOptions.some((option) => option.value === category) ? category : null;
  return [
    ...IMPORT_FIELDS.map((field) => ({ key: field.key as string, label: field.label, help: columnGuideText(field.key) ?? field.help })),
    ...attributeColumns(validCategory).map((column) => ({ key: `attribute:${column.key}`, label: column.label, help: "Atributo opcional." })),
  ];
}

export function buildTemplateXlsx(category: string | null) {
  const columns = templateColumns(category);
  const textColumns = columns
    .map((column, index) => (["sku", "external_reference", "listing_id"].includes(column.key) ? index : -1))
    .filter((index) => index >= 0);
  const types = Object.entries(instrumentTypesByCategory).flatMap(([value, list]) =>
    list.filter((type) => type !== "other").map((type) => [categoryOptions.find((option) => option.value === value)?.label ?? value,
      getInstrumentFilterGroup(type)?.label ?? type]));
  return writeXlsx([
    {
      name: "Inventario",
      rows: [columns.map((column) => column.label), ...SAMPLE_ROWS.map((sample) => columns.map((column) => sample[column.key] ?? ""))],
      textColumns,
      widths: columns.map((column) => (column.key === "description" ? 48 : column.key === "product_name" ? 32 : 16)),
    },
    {
      name: "Instrucciones",
      rows: [
        ["Columna", "Cómo llenarla"],
        ...columns.map((column) => [column.label, column.help]),
        ["", ""],
        ["Stock", "Es el total contado. Si hoy tienes 12 y escribes 9, Laria registra un ajuste de −3."],
        ["Filas que faltan", "Un SKU que no aparece en el archivo no se borra ni se pone en cero."],
        ["Celdas vacías", "Una celda vacía no cambia el valor actual."],
        ["Fotos", "Nombra las fotos SKU__01.jpg, SKU__02.jpg… (doble guion bajo)."],
      ],
      widths: [26, 90],
    },
    {
      name: "Valores",
      rows: [["Categoría", "Tipo de instrumento"], ...types, ["", ""], ["Condición", "Qué significa"], ...conditionScale.map((step) => [step.value, step.definition])],
      widths: [26, 60],
    },
  ]);
}

export function buildTemplateCsv(category: string | null) {
  const columns = templateColumns(category);
  const lines = [csvRow(columns.map((column) => column.label)), ...SAMPLE_ROWS.map((sample) =>
    csvRow(columns.map((column) => sample[column.key] ?? "")))];
  // BOM so Excel opens the accents correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}
