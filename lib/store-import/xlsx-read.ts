// Bounded XLSX reader for the store import (design §7.4; Codex review item §17.3).
//
// An XLSX file is a ZIP of XML parts, so this is an archive reader for untrusted input:
//   * only an allowlist of parts is ever inflated; everything else (macros, external links, embedded objects, images)
//     is skipped without decompressing it;
//   * the central directory says what each part will inflate to, so the total (40 MB) and per-part ratio (100:1 past
//     the first MB) budgets refuse a ZIP bomb before inflating it, data-descriptor entries included. Local headers
//     must agree with the directory. Compressed bytes are then fed to the inflater in 1 KB slices and the output is
//     checked after each one: it may never pass the declared size, nor the ratio of the compressed bytes actually fed,
//     so a lying header is caught within ~1 MB (Codex review 3 finding 2);
//   * the XML is scanned with a small single-pass tokenizer (linear in the part's size, Codex review 3 finding 1) that
//     refuses unterminated comments, instructions, CDATA sections and tags, and knows the handful of SpreadsheetML
//     elements it needs. Documents with a DTD are refused, and only the five predefined entities and numeric
//     references are decoded, so there is no entity expansion or external fetch of any kind;
//   * formulas are never evaluated: a formula cell contributes its cached value and is flagged; one with no cached
//     value is flagged with an empty value, which validation refuses (Codex review 3 finding 5).
import { Inflate } from "fflate";
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

export type XlsxBudget = { maxUncompressedBytes?: number; maxEntryRatio?: number; onInflate?: (bytes: number) => void };

const invalid = () => new ImportFileError("IMPORT_FILE_INVALID", "No pudimos leer el archivo como Excel (.xlsx). Guárdalo otra vez como .xlsx o .csv.");

export function sniffSpreadsheet(bytes: Uint8Array): "zip" | "ole" | "other" {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return "zip";
  if (bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return "ole";
  return "other";
}

type ZipEntry = { name: string; flags: number; method: number; compressedSize: number; size: number; localOffset: number };

// The central directory, which is what Excel itself reads (APPNOTE 4.3.12-16). Its sizes are known before anything
// is inflated, so a data-descriptor entry (sizes only after its data) is checked like any other, and the local
// headers are then cross-checked against it.
function readCentralDirectory(bytes: Uint8Array): { entries: ZipEntry[]; directoryOffset: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at: number) => view.getUint16(at, true);
  const u32 = (at: number) => view.getUint32(at, true);
  const u64 = (at: number) => Number(view.getBigUint64(at, true));
  // End record: the last one whose comment runs exactly to the end of the file.
  let end = -1;
  for (let at = bytes.length - 22; at >= 0 && at >= bytes.length - 22 - 0xffff; at -= 1) {
    if (u32(at) === 0x06054b50 && at + 22 + u16(at + 20) === bytes.length) {
      end = at;
      break;
    }
  }
  if (end < 0 || u16(end + 4) !== 0 || u16(end + 6) !== 0 || u16(end + 8) !== u16(end + 10)) throw invalid();
  let count = u16(end + 10);
  let directorySize = u32(end + 12);
  let directoryOffset = u32(end + 16);
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    // ZIP64 end record, found through the locator just before the classic one.
    const record = end >= 20 && u32(end - 20) === 0x07064b50 ? u64(end - 12) : -1;
    if (record < 0 || record + 56 > end - 20 || u32(record) !== 0x06064b50) throw invalid();
    count = u64(record + 32);
    directorySize = u64(record + 40);
    directoryOffset = u64(record + 48);
  }
  if (count > XLSX_MAX_ENTRIES || directoryOffset + directorySize > end) throw invalid();

  const entries: ZipEntry[] = [];
  const decoder = new TextDecoder();
  let at = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (at + 46 > directoryOffset + directorySize || u32(at) !== 0x02014b50) throw invalid();
    const nameLength = u16(at + 28);
    const extraEnd = at + 46 + nameLength + u16(at + 30);
    if (extraEnd + u16(at + 32) > directoryOffset + directorySize) throw invalid();
    const entry: ZipEntry = {
      name: decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)),
      flags: u16(at + 8),
      method: u16(at + 10),
      compressedSize: u32(at + 20),
      size: u32(at + 24),
      localOffset: u32(at + 42),
    };
    // ZIP64 extra field: the saturated values, in this order, as 8-byte numbers.
    for (let extra = at + 46 + nameLength; extra + 4 <= extraEnd; extra += 4 + u16(extra + 2)) {
      const fieldsEnd = extra + 4 + u16(extra + 2);
      if (fieldsEnd > extraEnd) throw invalid();
      if (u16(extra) !== 0x0001) continue;
      let field = extra + 4;
      for (const key of ["size", "compressedSize", "localOffset"] as const) {
        if (entry[key] !== 0xffffffff) continue;
        if (field + 8 > fieldsEnd) throw invalid();
        entry[key] = u64(field);
        field += 8;
      }
    }
    entries.push(entry);
    at = extraEnd + u16(at + 32);
  }
  return { entries, directoryOffset };
}

// The entry's compressed bytes, after a local header that must agree with the central directory: same name and
// method, the same sizes unless they come in a data descriptor, and data that ends before the directory starts.
function entryData(bytes: Uint8Array, entry: ZipEntry, directoryOffset: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const at = entry.localOffset;
  if (at + 30 > directoryOffset || view.getUint32(at, true) !== 0x04034b50) throw invalid();
  const flags = view.getUint16(at + 6, true);
  const nameLength = view.getUint16(at + 26, true);
  const start = at + 30 + nameLength + view.getUint16(at + 28, true);
  const localSizes = [view.getUint32(at + 18, true), view.getUint32(at + 22, true)];
  const sizesAgree = (flags & 8) !== 0 || localSizes.includes(0xffffffff)
    || (localSizes[0] === entry.compressedSize && localSizes[1] === entry.size);
  const name = bytes.subarray(at + 30, at + 30 + nameLength);
  if (view.getUint16(at + 8, true) !== entry.method || !sizesAgree || new TextDecoder().decode(name) !== entry.name
    || start + entry.compressedSize > directoryOffset) {
    throw invalid();
  }
  return bytes.subarray(start, start + entry.compressedSize);
}

const tooBig = () => new ImportFileError("IMPORT_FILE_TOO_BIG_UNCOMPRESSED",
  "El archivo es demasiado grande al descomprimirlo. Divide el inventario en archivos más pequeños.");

// Inflates the allowlisted parts of the archive within the budget. Exported for tests; `onInflate` (tests only) sees
// the size of every block the inflater hands over.
export function extractXlsxParts(bytes: Uint8Array, budget: XlsxBudget = {}) {
  try {
    return extractParts(bytes, budget);
  } catch (error) {
    // A field pointing outside the file makes DataView throw: that is a damaged archive too.
    throw error instanceof ImportFileError ? error : invalid();
  }
}

function extractParts(bytes: Uint8Array, budget: XlsxBudget) {
  const maxTotal = budget.maxUncompressedBytes ?? XLSX_MAX_UNCOMPRESSED_BYTES;
  const maxRatio = budget.maxEntryRatio ?? XLSX_MAX_ENTRY_RATIO;
  const { entries, directoryOffset } = readCentralDirectory(bytes);
  const parts = new Map<string, Uint8Array>();
  let total = 0;
  for (const entry of entries) {
    if (!FIXED_PARTS.has(entry.name) && !WORKSHEET_PART.test(entry.name)) continue;
    // Encrypted, or neither stored nor deflated, or listed twice.
    if ((entry.flags & 1) !== 0 || (entry.method !== 0 && entry.method !== 8) || parts.has(entry.name)) throw invalid();
    const data = entryData(bytes, entry, directoryOffset);
    // The declared size is checked before anything is allocated; what the inflater produces may never exceed it.
    total += entry.size;
    if (total > maxTotal || (entry.size > RATIO_FREE_BYTES && entry.size > entry.compressedSize * maxRatio)) throw tooBig();
    if (entry.method === 0) {
      if (entry.size !== entry.compressedSize) throw invalid();
      parts.set(entry.name, data);
      continue;
    }
    parts.set(entry.name, inflateEntry(data, entry.size, maxRatio, budget.onInflate));
  }
  return { parts, entryNames: entries.map((entry) => entry.name) };
}

// Feeds the compressed bytes in XLSX_INFLATE_SLICE_BYTES slices, so one push yields at most
// XLSX_INFLATE_OVERSHOOT_BYTES. After each push the output must still fit the declared size, and past the first MB
// it must stay within the ratio of the compressed bytes actually fed so far (not what a header claims).
function inflateEntry(data: Uint8Array, size: number, maxRatio: number, onInflate?: (bytes: number) => void) {
  const out = new Uint8Array(size);
  let produced = 0;
  let fed = 0;
  const inflater = new Inflate((chunk) => {
    onInflate?.(chunk.length);
    if (produced + chunk.length > size) throw invalid();
    out.set(chunk, produced);
    produced += chunk.length;
    if (produced > RATIO_FREE_BYTES && produced > fed * maxRatio) throw tooBig();
  });
  for (let offset = 0; offset < data.length; offset += XLSX_INFLATE_SLICE_BYTES) {
    fed = Math.min(offset + XLSX_INFLATE_SLICE_BYTES, data.length);
    inflater.push(data.subarray(offset, fed), fed === data.length);
  }
  if (data.length === 0) inflater.push(new Uint8Array(0), true);
  if (produced !== size) throw invalid();
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

// XML whitespace, and the name characters SpreadsheetML uses (letters, digits, "_", ".", "-" and the ":" of a prefix).
const isSpace = (code: number) => code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
const isNameStart = (code: number) => (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a) || code === 0x5f;
const isNameChar = (code: number) => isNameStart(code) || (code >= 0x30 && code <= 0x3a) || code === 0x2e || code === 0x2d;

// One attribute of a tag the tokenizer already checked (name="value" pairs separated by whitespace). Walks the pairs
// in order, so a value that happens to contain ` r="…"` is never mistaken for an attribute, and never reads a
// character twice.
function attribute(attributes: string, name: string) {
  let index = 0;
  while (index < attributes.length) {
    const equals = attributes.indexOf("=", index);
    if (equals === -1) return null;
    let quoteAt = equals + 1;
    while (isSpace(attributes.charCodeAt(quoteAt))) quoteAt += 1;
    const quote = attributes[quoteAt];
    const end = quote === '"' || quote === "'" ? attributes.indexOf(quote, quoteAt + 1) : -1;
    if (end === -1) return null;
    if (attributes.slice(index, equals).trim() === name) return decodeXmlText(attributes.slice(quoteAt + 1, end));
    index = end + 1;
  }
  return null;
}

type Token = { kind: "open" | "close" | "self"; name: string; attributes: string } | { kind: "text"; text: string };

// Tag or text tokens, in one forward pass: each terminator is found with indexOf from the current position and the
// scan resumes after it, so no character is read twice whatever the document holds (a regex tokenizer rescans the
// rest of the file for every unterminated "<!--"). Comments and processing instructions are skipped, CDATA text is
// kept, and anything that is not a complete comment, instruction, CDATA section or tag refuses the file.
function* tokens(xml: string): Generator<Token> {
  let index = 0;
  while (index < xml.length) {
    const open = xml.indexOf("<", index);
    const textEnd = open === -1 ? xml.length : open;
    if (textEnd > index) yield { kind: "text", text: decodeXmlText(xml.slice(index, textEnd)) };
    if (open === -1) return;
    if (xml.startsWith("<!--", open)) {
      index = after(xml, "-->", open + 4);
    } else if (xml.startsWith("<?", open)) {
      index = after(xml, "?>", open + 2);
    } else if (xml.startsWith("<![CDATA[", open)) {
      index = after(xml, "]]>", open + 9);
      yield { kind: "text", text: xml.slice(open + 9, index - 3) };
    } else {
      const tag = readTag(xml, open);
      index = tag.end;
      yield tag.token;
    }
  }
}

function after(xml: string, terminator: string, from: number) {
  const at = xml.indexOf(terminator, from);
  if (at === -1) throw invalid();
  return at + terminator.length;
}

// The tag starting at `start` ("<"): <name a="v" …>, <name …/> or </name>. A namespace prefix is dropped from the
// name; the attributes are returned as their source text for attribute().
function readTag(xml: string, start: number): { token: Token; end: number } {
  let index = start + 1;
  const close = xml.charCodeAt(index) === 0x2f;
  if (close) index += 1;
  const nameStart = index;
  if (!isNameStart(xml.charCodeAt(index))) throw invalid();
  while (isNameChar(xml.charCodeAt(index))) index += 1;
  const qualified = xml.slice(nameStart, index);
  const name = qualified.includes(":") ? qualified.slice(qualified.indexOf(":") + 1) : qualified;
  const attributesStart = index;
  let attributesEnd = index;
  for (;;) {
    const spaceStart = index;
    while (isSpace(xml.charCodeAt(index))) index += 1;
    const code = xml.charCodeAt(index);
    if (code === 0x3e) {
      const attributes = xml.slice(attributesStart, attributesEnd);
      return { token: { kind: close ? "close" : "open", name, attributes }, end: index + 1 };
    }
    if (code === 0x2f && xml.charCodeAt(index + 1) === 0x3e && !close) {
      return { token: { kind: "self", name, attributes: xml.slice(attributesStart, attributesEnd) }, end: index + 2 };
    }
    // An attribute: only in start tags, after whitespace, as name="value" or name='value'.
    if (close || index === spaceStart) throw invalid();
    const keyStart = index;
    while (index < xml.length && !isSpace(xml.charCodeAt(index)) && !"=<>/\"'".includes(xml[index])) index += 1;
    if (index === keyStart) throw invalid();
    while (isSpace(xml.charCodeAt(index))) index += 1;
    if (xml[index] !== "=") throw invalid();
    index += 1;
    while (isSpace(xml.charCodeAt(index))) index += 1;
    const quote = xml[index];
    if (quote !== '"' && quote !== "'") throw invalid();
    const valueEnd = xml.indexOf(quote, index + 1);
    if (valueEnd === -1) throw invalid();
    index = valueEnd + 1;
    attributesEnd = index;
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
  let uncached = 0;
  let row: ImportRow | null = null;
  let nextRowNumber = 1;
  let nextColumn = 0;
  let cell: {
    column: number; type: string; style: number; value: string; inline: string; formula: boolean; cached: boolean;
  } | null = null;
  let inValue = false;
  let inInlineText = false;
  let phonetic = 0;

  const finishCell = () => {
    if (!row || !cell) return;
    const raw = cell.type === "inlineStr" ? cell.inline : cell.value;
    let out: ImportCell | null = null;
    // A formula with no cached value (written by a program that does not calculate): kept as an empty value with the
    // flag, so validation refuses it instead of reading a blank. A string formula whose cached result is "" (t="str"
    // with an empty <v>) is an ordinary blank.
    const noCachedValue = cell.formula && raw.trim() === "" && !(cell.type === "str" && cell.cached);
    if (noCachedValue) {
      if (cell.column < IMPORT_MAX_COLUMNS) {
        out = { v: "", f: 1 };
        uncached += 1;
      }
    } else if (cell.type === "s") {
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
    if (out && (out.v !== "" || noCachedValue)) {
      if (cell.formula && !noCachedValue) {
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
          cached: false,
        };
        if (kind === "self") finishCell();
      }
    } else if (cell) {
      if (name === "v") {
        inValue = kind === "open";
        cell.cached = true;
      }
      else if (name === "f") cell.formula = true;
      else if (name === "rPh") phonetic = kind === "open" ? phonetic + 1 : Math.max(0, phonetic - 1);
      else if (name === "t") inInlineText = kind === "open";
    }
  }
  return { rows, formulas, uncached };
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

  const { rows, formulas, uncached } = readSheet(sheetXml, readSharedStrings(xmlText(parts.get("xl/sharedStrings.xml"))),
    readDateStyles(xmlText(parts.get("xl/styles.xml"))));
  if (formulas > 0) warnings.push("Algunas celdas tienen fórmulas; se usó el último valor calculado que guardó Excel.");
  if (uncached > 0) {
    warnings.push("Algunas celdas tienen fórmulas sin valor calculado y no se pueden importar. Abre el archivo en Excel, guárdalo y vuelve a subirlo.");
  }
  return { sheetName: sheet.name, rows, warnings };
}
