// Minimal XLSX writer (one or more sheets, inline strings, no formulas). Used by the import template (STORE-2) and
// available to the inventory export (STORE-1b). It never writes a formula: every string cell is an inline string,
// so a value such as "=HYPERLINK(...)" is stored as text and Excel shows it literally. Callers exporting merchant
// data should still apply formula-safe prefixing for CSV, where that guarantee does not exist.
import { strToU8, zipSync } from "fflate";

export type XlsxCell = string | number | null | undefined;

export type XlsxSheet = {
  name: string;
  rows: XlsxCell[][];
  /** Zero-based column indexes stored with the Text (@) number format, so Excel keeps leading zeros on edit. */
  textColumns?: number[];
  /** Column widths in characters, by zero-based index. */
  widths?: number[];
  /** Bold first row and freeze it. Default true. */
  header?: boolean;
};

// XML 1.0 forbids most C0 control characters; drop them instead of producing a file Excel refuses to open.
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(value: string) {
  return value
    .replace(INVALID_XML_CHARS, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function columnLetter(index: number) {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

// Excel sheet names: ≤ 31 characters, none of []:*?/\ and not blank.
export function safeSheetName(name: string, fallback: string) {
  const cleaned = name.replace(/[[\]:*?/\\]/g, " ").replace(INVALID_XML_CHARS, "").trim().slice(0, 31);
  return cleaned || fallback;
}

// Style indexes defined in STYLES_XML: 0 default, 1 text format, 2 bold header, 3 bold header with text format.
function cellStyle(isHeader: boolean, isText: boolean) {
  if (isHeader) return isText ? 3 : 2;
  return isText ? 1 : 0;
}

function sheetXml(sheet: XlsxSheet) {
  const header = sheet.header !== false;
  const textColumns = new Set(sheet.textColumns ?? []);
  const columnCount = Math.max(0, ...sheet.rows.map((row) => row.length), ...(sheet.widths ? [sheet.widths.length] : []));
  const cols: string[] = [];
  for (let index = 0; index < columnCount; index += 1) {
    const width = sheet.widths?.[index];
    const isText = textColumns.has(index);
    if (width === undefined && !isText) continue;
    cols.push(
      `<col min="${index + 1}" max="${index + 1}" width="${width ?? 14}" customWidth="1"${isText ? ' style="1"' : ""}/>`,
    );
  }

  const rows = sheet.rows.map((row, rowIndex) => {
    const isHeader = header && rowIndex === 0;
    const cells = row.map((value, columnIndex) => {
      if (value === null || value === undefined || value === "") return "";
      const ref = `${columnLetter(columnIndex)}${rowIndex + 1}`;
      const style = cellStyle(isHeader, textColumns.has(columnIndex));
      const styleAttr = style ? ` s="${style}"` : "";
      if (typeof value === "number") {
        if (!Number.isFinite(value)) return "";
        return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
      }
      return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
    });
    return `<row r="${rowIndex + 1}">${cells.join("")}</row>`;
  });

  const pane = header
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : "";
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    pane +
    (cols.length ? `<cols>${cols.join("")}</cols>` : "") +
    `<sheetData>${rows.join("")}</sheetData>` +
    "</worksheet>"
  );
}

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="4">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>' +
  "</cellXfs>" +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

export function writeXlsx(sheets: XlsxSheet[]): Uint8Array {
  if (sheets.length === 0) throw new Error("writeXlsx needs at least one sheet");
  const names = sheets.map((sheet, index) => safeSheetName(sheet.name, `Hoja${index + 1}`));

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        names
          .map(
            (_, index) =>
              `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("") +
        "</Types>",
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>",
    ),
    "xl/workbook.xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        "<sheets>" +
        names.map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("") +
        "</sheets></workbook>",
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        names
          .map(
            (_, index) =>
              `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
          )
          .join("") +
        `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        "</Relationships>",
    ),
    "xl/styles.xml": strToU8(STYLES_XML),
  };
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheetXml(sheet));
  });
  return zipSync(files, { level: 6 });
}

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
