// Import result report (design §7.6) and the CSV writing it needs. Cells that a spreadsheet could read as a formula
// (starting with =, +, -, @, tab or carriage return) are prefixed with an apostrophe (OWASP CSV injection guidance);
// genuine numbers are written as plain digits.
import type { XlsxCell } from "@/lib/spreadsheet/xlsx-write";

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvSafeCell(value: XlsxCell) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n;]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(cells: XlsxCell[]) {
  return cells.map(csvSafeCell).join(",");
}

export type ReportRow = {
  row_number: number;
  sku_normalized: string | null;
  parsed: { sku?: string | null; product_name?: string | null } | null;
  planned_action: string | null;
  owner_decision: string;
  commit_status: string;
  commit_message: string | null;
  issues: { severity: string; message: string }[];
  changes: Record<string, { from: unknown; to: unknown }> | null;
};

export const ACTION_LABELS: Record<string, string> = {
  create: "Crear SKU",
  update: "Actualizar",
  adopt_listing: "Vincular publicación",
  unchanged: "Sin cambios",
  error: "Con errores",
};

export const CHANGE_LABELS: Record<string, string> = {
  merchant_sku: "SKU",
  product_name: "Nombre",
  variant_label: "Variante",
  quantity_on_hand: "Stock",
  unit_price_pen: "Precio",
  low_stock_threshold: "Umbral",
  external_reference: "Referencia externa",
  listing_id: "Publicación",
};

export function resultLabel(row: Pick<ReportRow, "planned_action" | "owner_decision" | "commit_status">) {
  if (row.commit_status === "applied") return "Aplicada";
  if (row.commit_status === "conflict") return "Conflicto";
  if (row.commit_status === "failed") return "No se pudo aplicar";
  if (row.planned_action === "error") return "No aplicada";
  if (row.planned_action === "unchanged") return "Sin cambios";
  if (row.owner_decision === "exclude") return "Excluida";
  return "Pendiente";
}

function formatChange(key: string, change: { from: unknown; to: unknown }) {
  const label = CHANGE_LABELS[key] ?? key;
  if (key === "listing_id") return `${label}: vinculada`;
  if (key === "quantity_on_hand" && typeof change.from === "number" && typeof change.to === "number") {
    const delta = change.to - change.from;
    return `${label}: ${change.from} → ${change.to} (${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)})`;
  }
  return `${label}: ${change.from ?? "—"} → ${change.to ?? "—"}`;
}

export function describeChanges(changes: ReportRow["changes"]) {
  return Object.entries(changes ?? {}).map(([key, change]) => formatChange(key, change));
}

export function buildReportCsv(rows: ReportRow[]) {
  const lines = [csvRow(["Fila", "SKU", "Nombre", "Acción", "Resultado", "Cambios", "Mensajes"])];
  for (const row of rows) {
    const messages = [
      row.commit_message,
      ...row.issues.filter((issue) => issue.severity !== "info" || row.planned_action !== "error").map((issue) => issue.message),
    ].filter(Boolean);
    lines.push(csvRow([
      row.row_number,
      row.parsed?.sku ?? row.sku_normalized ?? "",
      row.parsed?.product_name ?? "",
      ACTION_LABELS[row.planned_action ?? ""] ?? "",
      resultLabel(row),
      describeChanges(row.changes).join("; "),
      messages.join(" "),
    ]));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}
