// CSV reader for the store import (design §7.4). Every cell stays text; nothing is coerced here.
import { IMPORT_MAX_CELL_CHARS, IMPORT_MAX_COLUMNS, IMPORT_MAX_DATA_ROWS, IMPORT_HEADER_SEARCH_ROWS } from "./limits";
import { ImportFileError, type ImportCell, type ImportRow } from "./types";

export type CsvDecodeResult = { text: string; encoding: "utf-8" | "utf-16le" | "windows-1252" };

// UTF-8 (with or without BOM), UTF-16 LE with BOM (Excel's "Texto Unicode"), else Windows-1252, which is what Excel on
// Windows writes for "CSV (delimitado por comas)" in Spanish locales.
export function decodeCsv(bytes: Uint8Array): CsvDecodeResult {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-16le" };
  }
  const start = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(start)), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" };
  }
}

// The delimiter that appears most often outside quotes on the first non-empty line, among comma, semicolon and tab.
export function detectDelimiter(text: string): "," | ";" | "\t" {
  // Count separators on the first line that has any, looking past a title line or blank lines above the headings.
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  let lines = 0;
  for (let index = 0; index < text.length && index < 64 * 1024 && lines < IMPORT_HEADER_SEARCH_ROWS; index += 1) {
    const char = text[index];
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) {
      if (counts[","] + counts[";"] + counts["\t"] > 0) break;
      if (char === "\n") lines += 1;
    } else if (!quoted && (char === "," || char === ";" || char === "\t")) counts[char] += 1;
  }
  if (counts[";"] > counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] > counts[","] && counts["\t"] > counts[";"]) return "\t";
  return ",";
}

// RFC 4180 with the usual leniencies: CRLF, LF or CR line ends, quotes doubled inside quoted cells, a stray quote in
// an unquoted cell kept as text. Bounded: a cell longer than the limit is cut and flagged (the row then fails
// validation), and reading stops with an error once there are more rows than any import may hold.
export function parseCsv(text: string, delimiter: string): ImportRow[] {
  const rows: ImportRow[] = [];
  const maxRows = IMPORT_MAX_DATA_ROWS + IMPORT_HEADER_SEARCH_ROWS;
  let cells: ImportCell[] = [];
  let cell = "";
  let truncated = false;
  let quoted = false;
  let atCellStart = true;
  let record = 1;

  const pushCell = () => {
    if (cells.length >= IMPORT_MAX_COLUMNS) {
      if (cell.trim()) {
        throw new ImportFileError("IMPORT_TOO_MANY_COLUMNS", `El archivo tiene más de ${IMPORT_MAX_COLUMNS} columnas.`);
      }
    } else {
      cells.push(truncated ? { v: cell, t: 1 } : { v: cell });
    }
    cell = "";
    truncated = false;
    atCellStart = true;
  };
  const pushRow = () => {
    pushCell();
    if (cells.some((item) => item.v.trim())) {
      if (rows.length >= maxRows) {
        throw new ImportFileError("IMPORT_TOO_MANY_ROWS", `El archivo tiene más de ${IMPORT_MAX_DATA_ROWS} filas.`);
      }
      rows.push({ rowNumber: record, cells });
    }
    cells = [];
    record += 1;
  };
  const append = (char: string) => {
    if (cell.length < IMPORT_MAX_CELL_CHARS + 1) cell += char;
    else truncated = true;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          append('"');
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        append(char);
      }
      continue;
    }
    if (char === '"' && atCellStart) {
      quoted = true;
      atCellStart = false;
    } else if (char === delimiter) {
      pushCell();
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      pushRow();
    } else {
      append(char);
      atCellStart = false;
    }
  }
  if (cell || cells.length) pushRow();
  return rows;
}
