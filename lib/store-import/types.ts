// Shared shapes of the store spreadsheet import (STORE-2, docs/store-operations/design.md §7).

// One spreadsheet cell as read from the file, stored verbatim in store_import_rows.raw. `v` is always text: the
// importer never trusts a spreadsheet's own idea of numbers. `k` says what the file claimed the cell was:
// absent = text, "n" = number, "b" = boolean, "e" = Excel error, "d" = date. `f` = the cell had a formula (its cached
// value is used, the formula is never evaluated); `f` with an empty `v` = a formula with no cached value, which is not
// a blank. `t` = the text was cut at the cell limit.
export type ImportCell = { v: string; k?: "n" | "b" | "e" | "d"; f?: 1; t?: 1 };

export type ImportRow = { rowNumber: number; cells: ImportCell[] };

export type IssueSeverity = "error" | "warning" | "info";
export type ImportIssue = { code: string; field: string | null; severity: IssueSeverity; message: string };

export type SpreadsheetFormat = "csv" | "xlsx";

export type ReadSpreadsheetResult = {
  sheetName: string | null;
  headerRow: number;
  headers: string[];
  rows: ImportRow[];
  warnings: string[];
};

// A file-level failure: the whole file is refused with a Spanish message the wizard shows as is.
export class ImportFileError extends Error {
  constructor(public readonly code: string, public readonly userMessage: string) {
    super(code);
  }
}
