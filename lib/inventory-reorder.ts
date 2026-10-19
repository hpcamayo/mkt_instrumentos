import { csvDocument } from "@/lib/spreadsheet/csv-write";
import type { XlsxCell, XlsxSheet } from "@/lib/spreadsheet/xlsx-write";
import type { ReorderRow } from "@/lib/store-inventory";

// Effortless Laria, inventory batch, stock-07 (docs/ux-effortless/inventory.md): the reorder file. The store sends it
// to a supplier, fills "Cantidad recibida" when the goods arrive and uploads it again; each filled row becomes one
// "Reponer stock" movement. Pure functions, unit-tested in tests/ux-inventory.test.cjs.

export const REORDER_HEADERS = [
  "SKU",
  "Nombre",
  "Variante",
  "Referencia externa",
  "Disponible",
  "Avisar con stock bajo desde",
  "Vendidas en 30 días",
  "Cantidad sugerida",
  "Cantidad recibida",
] as const;

const SKU_COLUMN = 0;
const RECEIVED_COLUMN = REORDER_HEADERS.length - 1;

// More than one restock file at once is a different job (an import); the limit matches the bulk limit.
export const REORDER_MAX_LINES = 2000;

export function reorderRows(rows: ReorderRow[]): (string | number | null)[][] {
  return rows.map((row) => [
    row.merchant_sku,
    row.product_name,
    row.variant_label,
    row.external_reference,
    row.quantity_available,
    row.low_stock_threshold,
    row.sales_30d,
    row.suggested,
    null,
  ]);
}

export function reorderCsv(rows: ReorderRow[]) {
  return csvDocument([REORDER_HEADERS, ...reorderRows(rows)]);
}

export function reorderXlsxSheet(rows: ReorderRow[]): XlsxSheet {
  return {
    name: "Reposición",
    rows: [[...REORDER_HEADERS], ...reorderRows(rows)] as XlsxCell[][],
    textColumns: [0, 3],
    widths: [16, 40, 18, 18, 10, 14, 12, 12, 14],
  };
}

export function reorderFilename(storeSlug: string, format: "csv" | "xlsx", now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(now);
  const slug = storeSlug.replace(/[^a-z0-9-]/gi, "").slice(0, 60) || "tienda";
  return `reposicion-${slug}-${day}.${format}`;
}

export type ReorderLine = { row: number; sku: string; quantity: number };
export type ReorderProblem = { row: number; sku: string; message: string };

function normalize(header: string) {
  return header.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Reads a filled reorder file (already parsed into headers and rows by lib/store-import/sheet.ts). Columns are found
// by name, so a supplier who moved or deleted columns still works; rows with "Cantidad recibida" empty are skipped.
export function parseReorderFile(headers: string[], rows: { rowNumber: number; cells: { v: string; f?: number }[] }[]):
  { lines: ReorderLine[]; problems: ReorderProblem[]; error: string | null } {
  const names = headers.map(normalize);
  const skuIndex = names.indexOf(normalize(REORDER_HEADERS[SKU_COLUMN]));
  const receivedIndex = names.indexOf(normalize(REORDER_HEADERS[RECEIVED_COLUMN]));
  if (skuIndex < 0 || receivedIndex < 0) {
    return { lines: [], problems: [], error: "El archivo necesita las columnas “SKU” y “Cantidad recibida”. Descarga la lista de reposición y llénala." };
  }
  const lines: ReorderLine[] = [];
  const problems: ReorderProblem[] = [];
  const seen = new Map<string, number>();
  for (const row of rows) {
    const sku = (row.cells[skuIndex]?.v ?? "").trim();
    const cell = row.cells[receivedIndex];
    const raw = (cell?.v ?? "").trim().replace(/\s+/g, "");
    if (!raw && !cell?.f) continue;
    if (!sku) {
      problems.push({ row: row.rowNumber, sku: "", message: "Falta el SKU." });
      continue;
    }
    if (cell?.f || !/^\d{1,7}$/.test(raw) || Number(raw) < 1 || Number(raw) > 1000000) {
      problems.push({ row: row.rowNumber, sku, message: "La cantidad recibida debe ser un número entero mayor que cero." });
      continue;
    }
    const key = sku.toUpperCase();
    if (seen.has(key)) {
      problems.push({ row: row.rowNumber, sku, message: `El SKU ya aparece en la fila ${seen.get(key)}.` });
      continue;
    }
    seen.set(key, row.rowNumber);
    lines.push({ row: row.rowNumber, sku, quantity: Number(raw) });
  }
  if (lines.length > REORDER_MAX_LINES) {
    return { lines: [], problems, error: `El archivo tiene más de ${REORDER_MAX_LINES} SKU con cantidad. Divídelo en dos.` };
  }
  return { lines, problems, error: null };
}
