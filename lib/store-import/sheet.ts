// Reads an uploaded spreadsheet into a header row and data rows, whatever its format. The format comes from the
// file's bytes, not from its name or declared type.
import { decodeCsv, detectDelimiter, parseCsv } from "./csv";
import { IMPORT_HEADER_SEARCH_ROWS, IMPORT_MAX_DATA_ROWS, IMPORT_MAX_FILE_BYTES } from "./limits";
import { ImportFileError, type ImportRow, type ReadSpreadsheetResult, type SpreadsheetFormat } from "./types";
import { columnLetter } from "@/lib/spreadsheet/xlsx-write";
import { readXlsx, sniffSpreadsheet } from "./xlsx-read";

export function detectFormat(bytes: Uint8Array): SpreadsheetFormat {
  const kind = sniffSpreadsheet(bytes);
  if (kind === "zip") return "xlsx";
  if (kind === "ole") {
    throw new ImportFileError("IMPORT_XLS_UNSUPPORTED", "Los archivos .xls antiguos no se pueden leer. Guarda el archivo como .xlsx o .csv.");
  }
  // A text file: refuse anything with NUL bytes in its first KB (binary data renamed to .csv), except UTF-16.
  const head = bytes.subarray(0, 1024);
  const utf16 = head.length >= 2 && head[0] === 0xff && head[1] === 0xfe;
  if (!utf16 && head.includes(0)) {
    throw new ImportFileError("IMPORT_FILE_INVALID", "No pudimos leer el archivo. Sube un .xlsx o un .csv.");
  }
  return "csv";
}

// The header is the first row, among the first 20 non-empty ones, with at least two text cells and nothing but text;
// a title line above the table is skipped. Falls back to the first non-empty row.
export function findHeaderRow(rows: ImportRow[]) {
  const window = rows.slice(0, IMPORT_HEADER_SEARCH_ROWS);
  const index = window.findIndex((row) => {
    const filled = row.cells.filter((cell) => cell.v.trim());
    return filled.length >= 2 && filled.every((cell) => !cell.k);
  });
  return index >= 0 ? index : 0;
}

export function readSpreadsheet(bytes: Uint8Array, expected: SpreadsheetFormat): ReadSpreadsheetResult & { format: SpreadsheetFormat } {
  if (bytes.length === 0) throw new ImportFileError("IMPORT_FILE_EMPTY", "El archivo está vacío.");
  if (bytes.length > IMPORT_MAX_FILE_BYTES) {
    throw new ImportFileError("IMPORT_FILE_TOO_LARGE", "El archivo debe pesar como máximo 5 MB.");
  }
  const format = detectFormat(bytes);
  if (format !== expected) {
    throw new ImportFileError("IMPORT_FORMAT_MISMATCH",
      expected === "xlsx" ? "El archivo no es un Excel (.xlsx) válido." : "El archivo no es un CSV de texto.");
  }

  const warnings: string[] = [];
  let rows: ImportRow[];
  let sheetName: string | null = null;
  if (format === "xlsx") {
    const result = readXlsx(bytes);
    rows = result.rows;
    sheetName = result.sheetName;
    warnings.push(...result.warnings);
  } else {
    const decoded = decodeCsv(bytes);
    if (decoded.encoding === "windows-1252") {
      warnings.push("El archivo no estaba en UTF-8; lo leímos como Windows-1252 (Excel en Windows). Revisa tildes y ñ.");
    }
    rows = parseCsv(decoded.text, detectDelimiter(decoded.text));
  }
  if (rows.length === 0) throw new ImportFileError("IMPORT_FILE_EMPTY", "El archivo no tiene filas.");

  const headerIndex = findHeaderRow(rows);
  const headerRow = rows[headerIndex];
  const dataRows = rows.slice(headerIndex + 1);
  if (dataRows.length === 0) throw new ImportFileError("IMPORT_FILE_EMPTY", "El archivo solo tiene encabezados.");
  if (dataRows.length > IMPORT_MAX_DATA_ROWS) {
    throw new ImportFileError("IMPORT_TOO_MANY_ROWS", `El archivo tiene más de ${IMPORT_MAX_DATA_ROWS} filas.`);
  }
  const columnCount = Math.max(headerRow.cells.length, ...dataRows.map((row) => row.cells.length));
  const headers = Array.from({ length: columnCount }, (_, index) =>
    headerRow.cells[index]?.v.replace(/\s+/g, " ").trim().slice(0, 200) || `Columna ${columnLetter(index)}`);
  if (headerIndex > 0) warnings.push(`Usamos la fila ${headerRow.rowNumber} como encabezados.`);
  return { format, sheetName, headerRow: headerRow.rowNumber, headers, rows: dataRows, warnings };
}
