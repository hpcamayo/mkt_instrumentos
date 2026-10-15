import { categoryOptions } from "@/lib/listings";
import { absoluteUrl } from "@/lib/site";
import type { XlsxCell, XlsxSheet } from "@/lib/spreadsheet/xlsx-write";
import { statusLabel } from "@/lib/ui/status";

// Inventory export (design §7.8). Pure functions, so the formula guard and the column contract are unit-tested
// (tests/store-ops-1b.test.cjs). The headers match what the spreadsheet import (STORE-2) maps back, and "ID de
// publicación" lets a merchant adopt existing publications by reimporting the file (§6.1, §7.6).

export const EXPORT_HEADERS = [
  "SKU",
  "Nombre",
  "Variante",
  "Marca",
  "Modelo",
  "Categoría",
  "Stock",
  "Disponible",
  "Precio (PEN)",
  "Umbral de stock bajo",
  "Referencia externa",
  "Estado del SKU",
  "ID de publicación",
  "Estado de la publicación",
  "Enlace",
] as const;

// Identifier columns are stored as text in XLSX so Excel keeps leading zeros (§7.3).
export const EXPORT_TEXT_COLUMNS = [0, 10, 12];

export type ExportItem = {
  merchant_sku: string;
  product_name: string;
  variant_label: string | null;
  quantity_on_hand: number;
  quantity_available: number;
  unit_price_pen: number | null;
  low_stock_threshold: number | null;
  external_reference: string | null;
  inventory_status: string;
  listing: { id: string; slug: string; status: string; brand: string | null; model: string | null; category: string | null } | null;
};

export type ExportCell = string | number | null;

export function exportRows(items: ExportItem[]): ExportCell[][] {
  return items.map((item) => [
    item.merchant_sku,
    item.product_name,
    item.variant_label,
    item.listing?.brand ?? null,
    item.listing?.model ?? null,
    item.listing?.category ? categoryOptions.find((option) => option.value === item.listing!.category)?.label ?? item.listing.category : null,
    item.quantity_on_hand,
    item.quantity_available,
    item.unit_price_pen,
    item.low_stock_threshold,
    item.external_reference,
    item.inventory_status === "archived" ? "Archivado" : "Activo",
    item.listing?.id ?? null,
    item.listing ? statusLabel("listing", item.listing.status) : null,
    item.listing?.status === "approved" ? absoluteUrl(`/instrumentos/${item.listing.slug}`) : null,
  ]);
}

// OWASP CSV injection guidance: a text cell that a spreadsheet could read as a formula (=, +, -, @, tab, CR) gets a
// leading apostrophe. Genuine numbers (stock, price) are written as plain digits and are never prefixed.
const FORMULA_START = /^[=+\-@\t\r]/;

export function formulaSafe(value: string) {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

function csvField(value: ExportCell) {
  if (value === null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const safe = formulaSafe(value);
  return /[",\r\n]/.test(safe) || safe !== safe.trim() ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// RFC 4180 with CRLF and a UTF-8 BOM, so Excel opens the tildes correctly.
export function toCsv(rows: ExportCell[][], headers: readonly string[] = EXPORT_HEADERS) {
  return "﻿" + [headers as readonly ExportCell[], ...rows].map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

// XLSX cells are inline strings or numbers (lib/spreadsheet/xlsx-write.ts never writes a formula), so text keeps the
// merchant's exact value there; the apostrophe guard is only needed where a reader could evaluate it, the CSV.
export function toXlsxSheet(rows: ExportCell[][]): XlsxSheet {
  return {
    name: "Inventario",
    rows: [[...EXPORT_HEADERS], ...rows] as XlsxCell[][],
    textColumns: EXPORT_TEXT_COLUMNS,
    widths: [16, 40, 18, 16, 18, 18, 8, 10, 12, 12, 18, 12, 38, 18, 48],
  };
}

export function exportFilename(storeSlug: string, format: "csv" | "xlsx", now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(now);
  const slug = storeSlug.replace(/[^a-z0-9-]/gi, "").slice(0, 60) || "tienda";
  return `inventario-${slug}-${day}.${format}`;
}
