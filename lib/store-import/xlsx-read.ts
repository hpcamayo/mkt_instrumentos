// Bounded XLSX reader for the store import (design §7.4; Codex review item §17.3).
//
// An XLSX file is a ZIP of XML parts, so this is an archive reader for untrusted input:
//   * only an allowlist of parts is ever inflated; everything else (macros, external links, embedded objects, images)
//     is skipped without decompressing it;
//   * compressed bytes are fed to the inflater in small slices and the output is counted as it arrives, so the total
//     (40 MB) and per-part ratio (100:1 past the first MB) budgets stop a ZIP bomb before it can allocate much;
//   * the XML is scanned with a small tokenizer that knows the handful of SpreadsheetML elements it needs. Documents
//     with a DTD are refused, and only the five predefined entities and numeric references are decoded, so there is
//     no entity expansion or external fetch of any kind;
//   * formulas are never evaluated: a formula cell contributes its cached value and is flagged.
import { Unzip, UnzipInflate, type UnzipFile } from "fflate";
import {
  IMPORT_HEADER_SEARCH_ROWS,
  IMPORT_MAX_CELL_CHARS,
  IMPORT_MAX_COLUMNS,
  IMPORT_MAX_DATA_ROWS,
  XLSX_INFLATE_SLICE_BYTES,
  XLSX_MAX_ENTRIES,
  XLSX_MAX_ENTRY_RATIO,
  XLSX_MAX_UNCOMPRESSED_BYTES,
} from "./limits";
import { ImportFileError, type ImportCell, type ImportRow } from "./types";

const FIXED_PARTS = new Set([
  "[Content_Types].xml",
  "xl/workbook.xml",
  "xl/_rels/workbook.xml.rels",
  "xl/sharedStrings.xml",
  "xl/styles.xml",
]);
const WORKSHEET_PART = /^xl\/worksheets\/sheet[0-9]{1,4}\.xml$/;
const RATIO_FREE_BYTES = 1024 * 1024;

export type XlsxReadResult = { sheetName: string; rows: ImportRow[]; warnings: string[] };

export type XlsxBudget = { maxUncompressedBytes?: number; maxEntryRatio?: number };

const invalid = () => new ImportFileError("IMPORT_FILE_INVALID", "No pudimos leer el archivo como Excel (.xlsx). Guárdalo otra vez como .xlsx o .csv.");

export function sniffSpreadsheet(bytes: Uint8Array): "zip" | "ole" | "other" {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return "zip";
  if (bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return "ole";
  return "other";
}

// Inflates the allowlisted parts of the archive within the budget. Exported for tests.
export function extractXlsxParts(bytes: Uint8Array, budget: XlsxBudget = {}) {
  const maxTotal = budget.maxUncompressedBytes ?? XLSX_MAX_UNCOMPRESSED_BYTES;
  const maxRatio = budget.maxEntryRatio ?? XLSX_MAX_ENTRY_RATIO;
  const parts = new Map<string, Uint8Array>();
  const seen: string[] = [];
  let total = 0;
  let failure: ImportFileError | null = null;

  const unzipper = new Unzip();
  unzipper.register(UnzipInflate);
  unzipper.onfile = (file: UnzipFile) => {
    if (failure) return;
    seen.push(file.name);
    if (seen.length > XLSX_MAX_ENTRIES) {
      failure = invalid();
      return;
    }
    if (!FIXED_PARTS.has(file.name) && !WORKSHEET_PART.test(file.name)) return;
    if (parts.has(file.name)) {
      failure = invalid();
      return;
    }
    const chunks: Uint8Array[] = [];
    let produced = 0;
    file.ondata = (error, data, final) => {
      if (failure) return;
      if (error) {
        failure = invalid();
        return;
      }
      produced += data.length;
      total += data.length;
      const ratioExceeded = file.size !== undefined && file.size > 0 && produced > RATIO_FREE_BYTES
        && produced > file.size * maxRatio;
      if (total > maxTotal || ratioExceeded) {
        failure = new ImportFileError("IMPORT_FILE_TOO_BIG_UNCOMPRESSED",
          "El archivo es demasiado grande al descomprimirlo. Divide el inventario en archivos más pequeños.");
        file.terminate();
        return;
      }
      chunks.push(data);
      if (final) parts.set(file.name, concat(chunks, produced));
    };
    try {
      file.start();
    } catch {
      // Unsupported compression method (only stored and deflate are registered).
      failure = invalid();
    }
  };

  try {
    for (let offset = 0; offset < bytes.length && !failure; offset += XLSX_INFLATE_SLICE_BYTES) {
      const end = Math.min(offset + XLSX_INFLATE_SLICE_BYTES, bytes.length);
      unzipper.push(bytes.subarray(offset, end), end === bytes.length);
    }
  } catch {
    if (!failure) failure = invalid();
  }
  if (failure) throw failure;
  return { parts, entryNames: seen };
}

function concat(chunks: Uint8Array[], length: number) {
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function xmlText(part: Uint8Array | undefined) {
  if (!part) return null;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(part);
  } catch {
    throw invalid();
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw invalid();
  return text;
}

const ENTITY = /&(lt|gt|amp|quot|apos|#[0-9]{1,7}|#x[0-9a-fA-F]{1,6});/g;
// Excel escapes control characters as _xHHHH_ inside strings.
const EXCEL_ESCAPE = /_x([0-9A-Fa-f]{4})_/g;

export function decodeXmlText(value: string) {
  return value
    .replace(ENTITY, (_, name: string) => {
      switch (name) {
        case "lt": return "<";
        case "gt": return ">";
        case "amp": return "&";
        case "quot": return '"';
        case "apos": return "'";
        default: {
          const code = name[1] === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
          return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
        }
      }
    })
    .replace(EXCEL_ESCAPE, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function attribute(attributes: string, name: string) {
  const match = new RegExp(`(?:^|\\s)${name.replace(":", "\\:")}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(attributes);
  return match ? decodeXmlText(match[2] ?? match[3] ?? "") : null;
}

// Tag or text tokens. Comments, processing instructions and CDATA are skipped (CDATA text is kept).
const TOKEN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;

type Token = { kind: "open" | "close" | "self"; name: string; attributes: string } | { kind: "text"; text: string };

function* tokens(xml: string): Generator<Token> {
  TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN.exec(xml))) {
    if (match[1] !== undefined) {
      yield { kind: "text", text: match[1] };
    } else if (match[3]) {
      const name = match[3].includes(":") ? match[3].slice(match[3].indexOf(":") + 1) : match[3];
      yield { kind: match[2] ? "close" : match[5] ? "self" : "open", name, attributes: match[4] ?? "" };
    } else if (match[6] !== undefined) {
      yield { kind: "text", text: decodeXmlText(match[6]) };
    }
  }
}

function readSharedStrings(xml: string | null) {
  const strings: string[] = [];
  if (!xml) return strings;
  let current: string | null = null;
  let inText = false;
  let phonetic = 0;
  for (const token of tokens(xml)) {
    if (token.kind === "open" || token.kind === "self") {
      if (token.name === "si" && token.kind === "self") strings.push("");
      else if (token.name === "si") current = "";
      else if (token.name === "rPh") phonetic += token.kind === "open" ? 1 : 0;
      else if (token.name === "t" && token.kind === "open") inText = true;
    } else if (token.kind === "close") {
      if (token.name === "si" && current !== null) {
        strings.push(current);
        current = null;
      } else if (token.name === "rPh") phonetic = Math.max(0, phonetic - 1);
      else if (token.name === "t") inText = false;
    } else if (token.kind === "text" && inText && current !== null && phonetic === 0) {
      current += token.text;
    }
  }
  return strings;
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

export function isDateFormatCode(code: string) {
  // Drop quoted literals, bracketed parts (colors, locales, elapsed time) and escaped characters before looking for
  // date/time tokens.
  const stripped = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
  return /[dmyhs]/i.test(stripped) && !/^general$/i.test(stripped.trim());
}

function readDateStyles(xml: string | null) {
  const custom = new Map<number, string>();
  const dateStyles = new Set<number>();
  if (!xml) return dateStyles;
  let inCellXfs = false;
  let xfIndex = 0;
  for (const token of tokens(xml)) {
    if (token.kind === "text") continue;
    if (token.name === "numFmt" && token.kind !== "close") {
      const id = Number(attribute(token.attributes, "numFmtId"));
      const code = attribute(token.attributes, "formatCode") ?? "";
      if (Number.isInteger(id)) custom.set(id, code);
    } else if (token.name === "cellXfs") {
      inCellXfs = token.kind === "open";
    } else if (inCellXfs && token.name === "xf" && token.kind !== "close") {
      const id = Number(attribute(token.attributes, "numFmtId") ?? "0");
      if (BUILTIN_DATE_FORMATS.has(id) || (custom.has(id) && isDateFormatCode(custom.get(id) ?? ""))) dateStyles.add(xfIndex);
      xfIndex += 1;
    }
  }
  return dateStyles;
}

function firstVisibleSheet(workbookXml: string, relsXml: string | null) {
  const sheets: { name: string; relId: string; hidden: boolean }[] = [];
  for (const token of tokens(workbookXml)) {
    if (token.kind !== "text" && token.name === "sheet" && token.kind !== "close") {
      sheets.push({
        name: attribute(token.attributes, "name") ?? "Hoja",
        relId: attribute(token.attributes, "r:id") ?? attribute(token.attributes, "id") ?? "",
        hidden: (attribute(token.attributes, "state") ?? "visible") !== "visible",
      });
    }
  }
  const targets = new Map<string, string>();
  for (const token of relsXml ? tokens(relsXml) : []) {
    if (token.kind !== "text" && token.name === "Relationship" && token.kind !== "close") {
      targets.set(attribute(token.attributes, "Id") ?? "", attribute(token.attributes, "Target") ?? "");
    }
  }
  const visible = sheets.filter((sheet) => !sheet.hidden);
  const chosen = visible[0];
  if (!chosen) throw new ImportFileError("IMPORT_SHEET_MISSING", "El archivo no tiene hojas visibles.");
  const target = targets.get(chosen.relId) ?? "";
  // Targets are relative to xl/ ("worksheets/sheet1.xml") or absolute ("/xl/worksheets/sheet1.xml").
  const part = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  return { name: chosen.name, part, visibleCount: visible.length };
}

export function columnIndex(reference: string) {
  const letters = /^([A-Z]{1,3})/.exec(reference)?.[1];
  if (!letters) return -1;
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function readSheet(xml: string, sharedStrings: string[], dateStyles: Set<number>) {
  const rows: ImportRow[] = [];
  const maxRows = IMPORT_MAX_DATA_ROWS + IMPORT_HEADER_SEARCH_ROWS;
  let formulas = 0;
  let row: ImportRow | null = null;
  let nextRowNumber = 1;
  let nextColumn = 0;
  let cell: { column: number; type: string; style: number; value: string; inline: string; formula: boolean } | null = null;
  let inValue = false;
  let inInlineText = false;
  let phonetic = 0;

  const finishCell = () => {
    if (!row || !cell) return;
    const raw = cell.type === "inlineStr" ? cell.inline : cell.value;
    let out: ImportCell | null = null;
    if (cell.type === "s") {
      const index = Number(raw);
      if (!Number.isInteger(index) || index < 0 || index >= sharedStrings.length) throw invalid();
      out = { v: sharedStrings[index] };
    } else if (cell.type === "inlineStr" || cell.type === "str") {
      out = { v: raw };
    } else if (cell.type === "b") {
      out = { v: raw.trim() === "1" ? "1" : "0", k: "b" };
    } else if (cell.type === "e") {
      out = { v: raw, k: "e" };
    } else if (cell.type === "d") {
      out = { v: raw, k: "d" };
    } else if (raw.trim() !== "") {
      out = { v: raw.trim(), k: dateStyles.has(cell.style) ? "d" : "n" };
    }
    if (out && out.v !== "") {
      if (cell.formula) {
        out.f = 1;
        formulas += 1;
      }
      if (out.v.length > IMPORT_MAX_CELL_CHARS) {
        out.v = out.v.slice(0, IMPORT_MAX_CELL_CHARS + 1);
        out.t = 1;
      }
      if (cell.column >= IMPORT_MAX_COLUMNS) {
        throw new ImportFileError("IMPORT_TOO_MANY_COLUMNS", `El archivo tiene más de ${IMPORT_MAX_COLUMNS} columnas.`);
      }
      while (row.cells.length < cell.column) row.cells.push({ v: "" });
      row.cells[cell.column] = out;
    }
    nextColumn = cell.column + 1;
    cell = null;
  };

  for (const token of tokens(xml)) {
    if (token.kind === "text") {
      if (cell && inValue) cell.value += token.text;
      else if (cell && inInlineText && phonetic === 0) cell.inline += token.text;
      continue;
    }
    const { name, kind } = token;
    if (name === "row") {
      if (kind === "close") {
        if (row && row.cells.some((item) => item.v.trim())) {
          if (rows.length >= maxRows) {
            throw new ImportFileError("IMPORT_TOO_MANY_ROWS", `El archivo tiene más de ${IMPORT_MAX_DATA_ROWS} filas.`);
          }
          rows.push(row);
        }
        row = null;
      } else {
        const declared = Number(attribute(token.attributes, "r"));
        const rowNumber = Number.isInteger(declared) && declared >= nextRowNumber ? declared : nextRowNumber;
        nextRowNumber = rowNumber + 1;
        nextColumn = 0;
        row = kind === "self" ? null : { rowNumber, cells: [] };
      }
    } else if (name === "c" && row) {
      if (kind === "close") {
        finishCell();
      } else {
        const reference = attribute(token.attributes, "r");
        const column = reference ? columnIndex(reference) : nextColumn;
        cell = {
          column: column >= 0 ? column : nextColumn,
          type: attribute(token.attributes, "t") ?? "n",
          style: Number(attribute(token.attributes, "s") ?? "0"),
          value: "",
          inline: "",
          formula: false,
        };
        if (kind === "self") finishCell();
      }
    } else if (cell) {
      if (name === "v") inValue = kind === "open";
      else if (name === "f") cell.formula = true;
      else if (name === "rPh") phonetic = kind === "open" ? phonetic + 1 : Math.max(0, phonetic - 1);
      else if (name === "t") inInlineText = kind === "open";
    }
  }
  return { rows, formulas };
}

export function readXlsx(bytes: Uint8Array, budget: XlsxBudget = {}): XlsxReadResult {
  const kind = sniffSpreadsheet(bytes);
  if (kind === "ole") {
    throw new ImportFileError("IMPORT_XLS_UNSUPPORTED", "Los archivos .xls antiguos no se pueden leer. Guarda el archivo como .xlsx o .csv.");
  }
  if (kind !== "zip") throw invalid();

  const { parts, entryNames } = extractXlsxParts(bytes, budget);
  const contentTypes = xmlText(parts.get("[Content_Types].xml"));
  if (entryNames.some((name) => /vbaProject\.bin$/i.test(name)) || /macroEnabled/i.test(contentTypes ?? "")) {
    throw new ImportFileError("IMPORT_XLSX_MACROS", "El archivo tiene macros. Guárdalo como .xlsx sin macros o como .csv.");
  }
  const workbook = xmlText(parts.get("xl/workbook.xml"));
  if (!contentTypes || !workbook) throw invalid();

  const warnings: string[] = [];
  const sheet = firstVisibleSheet(workbook, xmlText(parts.get("xl/_rels/workbook.xml.rels")));
  const sheetXml = xmlText(parts.get(sheet.part));
  if (!sheetXml) throw invalid();
  if (sheet.visibleCount > 1) warnings.push(`El archivo tiene varias hojas; leímos solo la primera, «${sheet.name}».`);
  if (entryNames.some((name) => name.startsWith("xl/externalLinks/"))) {
    warnings.push("El archivo tiene vínculos a otros libros; no se abrieron y se usaron los valores guardados.");
  }

  const { rows, formulas } = readSheet(sheetXml, readSharedStrings(xmlText(parts.get("xl/sharedStrings.xml"))),
    readDateStyles(xmlText(parts.get("xl/styles.xml"))));
  if (formulas > 0) warnings.push("Algunas celdas tienen fórmulas; se usó el último valor calculado que guardó Excel.");
  return { sheetName: sheet.name, rows, warnings };
}
