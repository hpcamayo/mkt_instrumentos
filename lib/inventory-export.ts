import { categoryOptions } from "@/lib/listings";
import { absoluteUrl } from "@/lib/site";
import type { XlsxCell, XlsxSheet } from "@/lib/spreadsheet/xlsx-write";
import { csvDocument } from "@/lib/spreadsheet/csv-write";
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
  listing: {
    id: string; slug: string; status: string; brand: string | null; model: string | null; category: string | null;
    // Only read for "con datos de la publicación" (stock-16).
    title?: string | null; price_pen?: number | null; condition?: string | null; city?: string | null; description?: string | null;
  } | null;
};

// stock-16 "Exportar esta vista", optionally with the publication's own fields after the usual columns, so the file
// still imports back: the import ignores columns it does not map.
export const LISTING_EXPORT_HEADERS = ["Título de la publicación", "Precio publicado (PEN)", "Condición", "Ciudad", "Descripción"] as const;

export function listingColumns(item: ExportItem): ExportCell[] {
  return [item.listing?.title ?? null, item.listing?.price_pen ?? null, item.listing?.condition ?? null, item.listing?.city ?? null, item.listing?.description ?? null];
}

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

// CSV writing (formula guard, quoting, BOM) is shared with the import template and report: lib/spreadsheet/csv-write.ts.
export { formulaSafe } from "@/lib/spreadsheet/csv-write";

export function toCsv(rows: ExportCell[][], headers: readonly string[] = EXPORT_HEADERS) {
  return csvDocument([headers, ...rows]);
}

export function exportHeaders(withListing: boolean): string[] {
  return withListing ? [...EXPORT_HEADERS, ...LISTING_EXPORT_HEADERS] : [...EXPORT_HEADERS];
}

// XLSX cells are inline strings or numbers (lib/spreadsheet/xlsx-write.ts never writes a formula), so text keeps the
// merchant's exact value there; the apostrophe guard is only needed where a reader could evaluate it, the CSV.
export function toXlsxSheet(rows: ExportCell[][], headers: readonly string[] = EXPORT_HEADERS): XlsxSheet {
  return {
    name: "Inventario",
    rows: [[...headers], ...rows] as XlsxCell[][],
    textColumns: EXPORT_TEXT_COLUMNS,
    widths: [16, 40, 18, 16, 18, 18, 8, 10, 12, 12, 18, 12, 38, 18, 48, 40, 12, 12, 14, 60].slice(0, headers.length),
  };
}

export function exportFilename(storeSlug: string, format: "csv" | "xlsx", now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(now);
  const slug = storeSlug.replace(/[^a-z0-9-]/gi, "").slice(0, 60) || "tienda";
  return `inventario-${slug}-${day}.${format}`;
}
