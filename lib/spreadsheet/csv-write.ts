// The one CSV writer for files Laria hands to merchants: inventory export (STORE-1b), import template and import
// report (STORE-2). RFC 4180 fields, CRLF, and a UTF-8 BOM so Excel opens the accents correctly.
//
// OWASP CSV injection guidance: a text cell that a spreadsheet could read as a formula (=, +, -, @, tab, CR) gets a
// leading apostrophe. Genuine numbers (stock, price) are written as plain digits and are never prefixed. Fields with
// a semicolon are quoted too, because Excel with a Spanish locale splits on ";".
export type CsvCell = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function formulaSafe(value: string) {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

export function csvCell(value: CsvCell) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const safe = formulaSafe(value);
  return /[",;\r\n]/.test(safe) || safe !== safe.trim() ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvLine(cells: readonly CsvCell[]) {
  return cells.map(csvCell).join(",");
}

export function csvDocument(rows: readonly (readonly CsvCell[])[]) {
  return "﻿" + rows.map(csvLine).join("\r\n") + "\r\n";
}
