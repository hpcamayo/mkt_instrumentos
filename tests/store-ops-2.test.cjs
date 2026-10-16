// STORE-2 import parsing: CSV and XLSX readers (including hostile files), header detection, column mapping, row
// validation of Excel coercions, the template and the formula-safe report. Runs with `pnpm test`.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { zipSync, deflateSync, strToU8 } = require("fflate");

const { decodeCsv, detectDelimiter, parseCsv } = require("@/lib/store-import/csv");
const { readXlsx, extractXlsxParts, isDateFormatCode, columnIndex, decodeXmlText } = require("@/lib/store-import/xlsx-read");
const { readSpreadsheet, findHeaderRow, compactCells } = require("@/lib/store-import/sheet");
const { proposeMapping, mappingProblems, normalizeHeader, IMPORT_FIELDS } = require("@/lib/store-import/mapping");
const { parseImportRow, parsePriceCell } = require("@/lib/store-import/rows");
const { buildReportCsv, csvSafeCell, describeChanges } = require("@/lib/store-import/report");
const { buildTemplateXlsx, buildTemplateCsv, templateColumns } = require("@/lib/store-import/template");
const { writeXlsx } = require("@/lib/spreadsheet/xlsx-write");
const { ImportFileError } = require("@/lib/store-import/types");
const { XLSX_INFLATE_OVERSHOOT_BYTES, XLSX_MAX_UNCOMPRESSED_BYTES } = require("@/lib/store-import/limits");

// ------------------------------------------------------------------ fixtures

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>';
const WORKBOOK = (sheets = '<sheet name="Inventario" sheetId="1" r:id="rId1"/>') =>
  `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`;
const RELS = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="worksheet" Target="/xl/worksheets/sheet2.xml"/></Relationships>';
const STYLES = '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="49"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>';
const SHARED = '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>SKU</t></si><si><t>Nombre</t></si><si><t>Stock</t></si><si><r><t>Pedal </t></r><r><rPr><b/></rPr><t>Boss &amp; co</t></r><rPh><t>ペダル</t></rPh></si><si><t>00123</t></si><si><t xml:space="preserve">línea_x000D_dos</t></si></sst>';
const sheet = (rows) => `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;

function xlsx(parts, options) {
  return zipSync(Object.fromEntries(Object.entries({
    "[Content_Types].xml": CONTENT_TYPES,
    "xl/workbook.xml": WORKBOOK(),
    "xl/_rels/workbook.xml.rels": RELS,
    "xl/styles.xml": STYLES,
    "xl/sharedStrings.xml": SHARED,
    ...parts,
  }).filter(([, value]) => value !== null).map(([name, value]) => [name, typeof value === "string" ? strToU8(value) : value])), options);
}

const BASIC_SHEET = sheet(
  '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
  '<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>8</v></c></row>' +
  '<row r="4"><c r="A4"><v>1.23456789012E+17</v></c><c r="B4" t="inlineStr"><is><t>Inline</t></is></c><c r="C4"><f>SUM(1,2)</f><v>3</v></c><c r="E4" s="2"><v>45000</v></c></row>' +
  '<row r="5"><c r="A5" t="e"><v>#N/A</v></c><c r="B5" t="s"><v>5</v></c><c r="C5" s="3"><v>12</v></c></row>' +
  '<row r="6" spans="1:3"><c r="A6" s="1"/><c r="B6"/></row>');

// A ZIP written field by field (APPNOTE 4.3) for layouts zipSync never writes: data descriptors (flag bit 3, as
// LibreOffice and Go writers do), ZIP64 fields, bytes padded after an entry's data, and headers that lie. `central`
// overrides the sizes the central directory claims; `localName`, `localMethod` and `localSizes` the local header's.
function handZip(files, { zip64 = false } = {}) {
  const out = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const data = typeof file.data === "string" ? strToU8(file.data) : file.data;
    const body = Buffer.concat([file.store ? data : deflateSync(data), file.padding ?? Buffer.alloc(0)]);
    const name = Buffer.from(file.name);
    const localName = Buffer.from(file.localName ?? file.name);
    const flags = file.descriptor ? 8 : 0;
    const method = file.store ? 0 : 8;
    const claimed = { compressed: body.length, size: data.length, ...file.central };
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(file.localMethod ?? method, 8);
    local.writeUInt32LE(file.descriptor ? 0 : file.localSizes?.compressed ?? claimed.compressed, 18);
    local.writeUInt32LE(file.descriptor ? 0 : file.localSizes?.size ?? claimed.size, 22);
    local.writeUInt16LE(localName.length, 26);
    const descriptor = Buffer.alloc(file.descriptor ? 16 : 0);
    if (file.descriptor) {
      descriptor.writeUInt32LE(0x08074b50, 0);
      descriptor.writeUInt32LE(body.length, 8);
      descriptor.writeUInt32LE(data.length, 12);
    }
    out.push(local, localName, body, descriptor);
    const extra = Buffer.alloc(zip64 ? 28 : 0);
    if (zip64) {
      extra.writeUInt16LE(1, 0);
      extra.writeUInt16LE(24, 2);
      extra.writeBigUInt64LE(BigInt(claimed.size), 4);
      extra.writeBigUInt64LE(BigInt(claimed.compressed), 12);
      extra.writeBigUInt64LE(BigInt(offset), 20);
    }
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(flags, 8);
    header.writeUInt16LE(method, 10);
    header.writeUInt32LE(zip64 ? 0xffffffff : claimed.compressed, 20);
    header.writeUInt32LE(zip64 ? 0xffffffff : claimed.size, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt16LE(extra.length, 30);
    header.writeUInt32LE(zip64 ? 0xffffffff : offset, 42);
    central.push(header, name, extra);
    offset += local.length + localName.length + body.length + descriptor.length;
  }
  const directory = Buffer.concat(central);
  const tail = [];
  if (zip64) {
    const record = Buffer.alloc(56);
    record.writeUInt32LE(0x06064b50, 0);
    record.writeBigUInt64LE(44n, 4);
    record.writeUInt16LE(45, 12);
    record.writeUInt16LE(45, 14);
    record.writeBigUInt64LE(BigInt(files.length), 24);
    record.writeBigUInt64LE(BigInt(files.length), 32);
    record.writeBigUInt64LE(BigInt(directory.length), 40);
    record.writeBigUInt64LE(BigInt(offset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(BigInt(offset + directory.length), 8);
    locator.writeUInt32LE(1, 16);
    tail.push(record, locator);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(zip64 ? 0xffff : files.length, 8);
  end.writeUInt16LE(zip64 ? 0xffff : files.length, 10);
  end.writeUInt32LE(zip64 ? 0xffffffff : directory.length, 12);
  end.writeUInt32LE(zip64 ? 0xffffffff : offset, 16);
  return new Uint8Array(Buffer.concat([...out, directory, ...tail, end]));
}

// The fixture workbook through handZip; `sheetEntry` changes the worksheet's entry.
function handXlsx(sheetEntry = {}, { descriptor = true, zip64 = false } = {}) {
  const parts = [["[Content_Types].xml", CONTENT_TYPES], ["xl/workbook.xml", WORKBOOK()], ["xl/_rels/workbook.xml.rels", RELS],
    ["xl/styles.xml", STYLES], ["xl/sharedStrings.xml", SHARED]];
  return handZip([...parts.map(([name, data]) => ({ name, data, descriptor })),
    { name: "xl/worksheets/sheet1.xml", data: BASIC_SHEET, descriptor, ...sheetEntry }], { zip64 });
}

function expectFileError(fn, code) {
  assert.throws(fn, (error) => error instanceof ImportFileError && error.code === code, `expected ${code}`);
}

// ------------------------------------------------------------------ CSV

test("CSV decoding: UTF-8 with BOM, UTF-16 LE and the Windows-1252 fallback", () => {
  assert.equal(decodeCsv(new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from("Categoría")])).text, "Categoría");
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Condición\tStock", "utf16le")]);
  assert.deepEqual(decodeCsv(new Uint8Array(utf16)), { text: "Condición\tStock", encoding: "utf-16le" });
  const latin = decodeCsv(new Uint8Array([0x43, 0x6f, 0x6e, 0x64, 0x69, 0x63, 0x69, 0xf3, 0x6e])); // "Condición" in 1252
  assert.deepEqual(latin, { text: "Condición", encoding: "windows-1252" });
});

test("CSV delimiter detection prefers the separator Peruvian Excel writes", () => {
  assert.equal(detectDelimiter("SKU;Nombre;Precio\n1;\"a,b\";3"), ";");
  assert.equal(detectDelimiter('"SKU,raro";Nombre;Stock\n'), ";");
  assert.equal(detectDelimiter("SKU,Nombre,Stock\n"), ",");
  assert.equal(detectDelimiter("SKU\tNombre\tStock\n"), "\t");
});

test("CSV parsing keeps text, quotes, embedded newlines and record numbers", () => {
  const rows = parseCsv('SKU,Nombre,Stock\r\n00123,"Pedal ""DS-1"", negro",8\n\n,"dos\nlíneas",=1+1\n', ",");
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], { rowNumber: 2, cells: [{ v: "00123" }, { v: 'Pedal "DS-1", negro' }, { v: "8" }] });
  assert.equal(rows[2].rowNumber, 4, "the blank record keeps the numbering");
  assert.equal(rows[2].cells[1].v, "dos\nlíneas");
  assert.equal(rows[2].cells[2].v, "=1+1", "a formula in a CSV is plain text");
});

test("CSV: a quote left open at the end of the file refuses the file instead of swallowing rows", () => {
  // Codex review 3 finding 4: this read as one row named "Pedal\nB,Cable,2" with a blank stock.
  assert.throws(() => parseCsv('SKU,Nombre,Stock\nA,"Pedal\nB,Cable,2\n', ","), (error) => error instanceof ImportFileError
    && error.code === "IMPORT_CSV_UNCLOSED_QUOTE" && /comillas sin cerrar desde la fila 2\b/.test(error.userMessage));
  expectFileError(() => parseCsv('SKU;Nombre\r\n"A;Pedal', ";"), "IMPORT_CSV_UNCLOSED_QUOTE");
  expectFileError(() => parseCsv('SKU,Nombre\nA,"dos\nlíneas"\nB,"""', ","), "IMPORT_CSV_UNCLOSED_QUOTE");
  expectFileError(() => readSpreadsheet(new Uint8Array(Buffer.from('SKU,Nombre,Stock\nA,"Pedal\nB,Cable,2\n')), "csv"), "IMPORT_CSV_UNCLOSED_QUOTE");
  // Closed quotes still hold separators, line breaks and doubled quotes, up to the very last character.
  assert.deepEqual(parseCsv('SKU,Nombre\nA,"dos\nlíneas, ""y"" más"\nB,"fin"', ",").map((row) => row.cells.map((cell) => cell.v)),
    [["SKU", "Nombre"], ["A", 'dos\nlíneas, "y" más'], ["B", "fin"]]);
});

test("CSV limits: columns, rows and a 5 MB single-line cell", () => {
  expectFileError(() => parseCsv(`${Array.from({ length: 81 }, (_, i) => `c${i}`).join(",")}\n`, ","), "IMPORT_TOO_MANY_COLUMNS");
  // Empty trailing columns beyond the limit are fine (Excel pads rows).
  assert.equal(parseCsv(`a,b${",".repeat(200)}\n`, ",")[0].cells.length, 80);
  expectFileError(() => parseCsv("h1,h2\n" + "a,b\n".repeat(2025), ","), "IMPORT_TOO_MANY_ROWS");
  const huge = parseCsv(`SKU,Nota\nA,${"x".repeat(5 * 1024 * 1024)}\n`, ",");
  assert.equal(huge[1].cells[1].t, 1, "an oversized cell is cut and flagged");
  assert.equal(huge[1].cells[1].v.length, 2001);
});

// ------------------------------------------------------------------ XLSX

test("XLSX reading: shared, rich and inline strings, numbers, formulas, dates, errors, gaps", () => {
  const result = readXlsx(xlsx({ "xl/worksheets/sheet1.xml": BASIC_SHEET }));
  assert.equal(result.sheetName, "Inventario");
  assert.deepEqual(result.rows.map((row) => row.rowNumber), [1, 2, 4, 5], "empty rows are skipped, numbers kept");
  assert.deepEqual(result.rows[1].cells, [{ v: "00123" }, { v: "Pedal Boss & co" }, { v: "8", k: "n" }], "phonetic runs ignored");
  const row4 = result.rows[2].cells;
  assert.deepEqual(row4[0], { v: "1.23456789012E+17", k: "n" });
  assert.deepEqual(row4[1], { v: "Inline" });
  assert.deepEqual(row4[2], { v: "3", k: "n", f: 1 });
  assert.deepEqual(row4[3], { v: "" }, "a gap column is padded");
  assert.deepEqual(row4[4], { v: "45000", k: "d" }, "built-in date format");
  assert.deepEqual(result.rows[3].cells, [{ v: "#N/A", k: "e" }, { v: "línea\rdos" }, { v: "12", k: "d" }], "custom date format, Excel escapes");
  assert.ok(result.warnings.some((warning) => warning.includes("fórmulas")));
});

test("a formula cell without a cached value is flagged, survives staging and is refused for its field", () => {
  // Codex review 3 finding 5: <c><f>2+2</f></c> was dropped before its formula flag was recorded, so the stock read as
  // a blank (keep the current value) with no warning at all.
  const inline = (ref, text) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
  const bytes = xlsx({ "xl/worksheets/sheet1.xml": sheet(
    `<row r="1">${inline("A1", "SKU")}${inline("B1", "Nombre")}${inline("C1", "Stock")}${inline("D1", "Precio")}</row>` +
    `<row r="2">${inline("A2", "A")}${inline("B2", "Pedal")}<c r="C2"><f>2+2</f></c><c r="D2"><f t="shared" si="0"/><v></v></c>` +
    '<c r="CC2"><f>1</f></c></row>' +
    `<row r="3">${inline("A3", "B")}<c r="B3" t="str"><f>IF(1,"","x")</f><v></v></c><c r="C3"><f>1+1</f><v>2</v></c></row>`) });
  const result = readXlsx(bytes);
  assert.ok(result.warnings.some((warning) => /fórmulas sin valor calculado/.test(warning)), "file-level warning");
  assert.ok(result.warnings.some((warning) => /último valor calculado/.test(warning)), "C3 still has its cached value");
  assert.deepEqual(result.rows[1].cells, [{ v: "A" }, { v: "Pedal" }, { v: "", f: 1 }, { v: "", f: 1 }], "flagged; past the column limit ignored");
  assert.deepEqual(result.rows[2].cells, [{ v: "B" }, { v: "" }, { v: "2", k: "n", f: 1 }], "a cached empty string is a real blank");

  // Staging drops trailing empty cells but keeps the flag; validation then refuses the field instead of keeping the
  // current stock.
  const staged = compactCells(result.rows[1].cells);
  assert.deepEqual(staged, result.rows[1].cells);
  const mapping = { sku: 0, product_name: 1, quantity: 2, unit_price_pen: 3 };
  const { parsed, issues } = parseImportRow(staged, mapping);
  assert.equal(parsed.quantity, null);
  for (const field of ["quantity", "unit_price_pen"]) {
    const found = issues.find((item) => item.field === field);
    assert.equal(found?.code, "IMPORT_FORMULA_NO_VALUE", field);
    assert.equal(found.severity, "error");
    assert.match(found.message, /fórmula sin valor calculado\. Abre el archivo en Excel, guárdalo y vuelve a subirlo\./);
  }
  const computed = parseImportRow(compactCells(result.rows[2].cells), mapping);
  assert.equal(computed.parsed.quantity, 2);
  assert.equal(computed.parsed.product_name, null, "a formula that computed an empty string is an ordinary blank");
  assert.deepEqual(computed.issues.map((item) => item.code).filter((code) => code.startsWith("IMPORT_FORMULA")), ["IMPORT_FORMULA"]);
  assert.deepEqual(compactCells([{ v: "A" }, { v: "" }, { v: "", k: "n" }]), [{ v: "A" }], "plain trailing blanks still go");
  assert.ok(readSpreadsheet(bytes, "xlsx").warnings.some((warning) => /sin valor calculado/.test(warning)));
});

test("XLSX: first visible sheet only, absolute relationship targets", () => {
  const result = readXlsx(xlsx({
    "xl/workbook.xml": WORKBOOK('<sheet name="Oculta" sheetId="1" r:id="rId1" state="hidden"/><sheet name="Stock" sheetId="2" r:id="rId2"/><sheet name="Otra" sheetId="3" r:id="rId1"/>'),
    "xl/worksheets/sheet1.xml": BASIC_SHEET,
    "xl/worksheets/sheet2.xml": sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>Hoja dos</t></is></c></row>'),
  }));
  assert.equal(result.sheetName, "Stock");
  assert.equal(result.rows[0].cells[0].v, "Hoja dos");
  assert.ok(result.warnings.some((warning) => warning.includes("varias hojas")));
});

test("XLSX hostile files are refused or bounded with a clear message", () => {
  expectFileError(() => readXlsx(xlsx({ "xl/worksheets/sheet1.xml": BASIC_SHEET, "xl/vbaProject.bin": new Uint8Array(10) })), "IMPORT_XLSX_MACROS");
  expectFileError(() => readXlsx(xlsx({
    "[Content_Types].xml": CONTENT_TYPES.replace("sheet.main+xml", "sheet.macroEnabled.main+xml"), "xl/worksheets/sheet1.xml": BASIC_SHEET,
  })), "IMPORT_XLSX_MACROS");
  expectFileError(() => readXlsx(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])), "IMPORT_XLS_UNSUPPORTED");
  expectFileError(() => readXlsx(zipSync({ "hola.txt": strToU8("no soy excel") })), "IMPORT_FILE_INVALID");
  expectFileError(() => readXlsx(strToU8("SKU,Stock\n1,2")), "IMPORT_FILE_INVALID");
  expectFileError(() => readXlsx(xlsx({
    "xl/worksheets/sheet1.xml": '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><worksheet><sheetData><row r="1"><c t="inlineStr"><is><t>&a;</t></is></c></row></sheetData></worksheet>',
  })), "IMPORT_FILE_INVALID");
  expectFileError(() => readXlsx(xlsx({ "xl/worksheets/sheet1.xml": sheet('<row r="1"><c r="A1" t="s"><v>99</v></c></row>') })), "IMPORT_FILE_INVALID");
  expectFileError(() => readXlsx(xlsx({ "xl/worksheets/sheet1.xml": sheet('<row r="1"><c r="CC1" t="inlineStr"><is><t>x</t></is></c></row>') })), "IMPORT_TOO_MANY_COLUMNS");

  // External links are never opened; their cached values are used.
  const linked = readXlsx(xlsx({ "xl/worksheets/sheet1.xml": BASIC_SHEET, "xl/externalLinks/externalLink1.xml": "<externalLink/>" }));
  assert.ok(linked.warnings.some((warning) => warning.includes("vínculos")));
});

test("XLSX decompression budget stops ZIP bombs before inflating them", () => {
  // 60 MB of zeros compresses to ~60 KB: over the 40 MB total budget.
  const bomb = xlsx({ "xl/worksheets/sheet1.xml": new Uint8Array(60 * 1024 * 1024) });
  assert.ok(bomb.length < 200 * 1024, `bomb is small (${bomb.length} bytes)`);
  expectFileError(() => readXlsx(bomb), "IMPORT_FILE_TOO_BIG_UNCOMPRESSED");
  // 8 MB from ~8 KB: under the total budget but far past 100:1 for one part.
  expectFileError(() => readXlsx(xlsx({ "xl/worksheets/sheet1.xml": new Uint8Array(8 * 1024 * 1024) })), "IMPORT_FILE_TOO_BIG_UNCOMPRESSED");
  // A bomb in a part the reader does not need is never inflated.
  const ignored = extractXlsxParts(xlsx({ "xl/worksheets/sheet1.xml": BASIC_SHEET, "xl/media/bomb.bin": new Uint8Array(200 * 1024 * 1024) }));
  assert.ok(!ignored.parts.has("xl/media/bomb.bin"));
  // A tighter budget is respected exactly.
  expectFileError(() => extractXlsxParts(xlsx({ "xl/worksheets/sheet1.xml": BASIC_SHEET }), { maxUncompressedBytes: 100 }), "IMPORT_FILE_TOO_BIG_UNCOMPRESSED");
});

test("XLSX entries with data descriptors or ZIP64 fields read like any other", () => {
  const expected = readXlsx(xlsx({ "xl/worksheets/sheet1.xml": BASIC_SHEET }));
  assert.deepEqual(readXlsx(handXlsx()), expected, "every entry with a data descriptor");
  assert.deepEqual(readXlsx(handXlsx({ store: true })), expected, "a stored entry with a data descriptor");
  assert.deepEqual(readXlsx(handXlsx({}, { descriptor: false, zip64: true })), expected, "ZIP64 sizes and end record");
});

test("a data-descriptor ZIP bomb is refused from the central directory, before inflating", () => {
  // Codex review 3 finding 2: 8 MB of zeros in an ~8 KB descriptor entry was accepted (no ratio check), and a 50 MB
  // one inflated all 50 MB, in blocks over 16 MB, before the 40 MB budget refused it.
  for (const size of [8 * 1024 * 1024, 50 * 1024 * 1024]) {
    const bomb = handXlsx({ data: new Uint8Array(size) });
    assert.ok(bomb.length < 64 * 1024, `bomb is small (${bomb.length} bytes)`);
    let inflated = 0;
    assert.throws(() => extractXlsxParts(bomb, { onInflate: (bytes) => { inflated += bytes; } }),
      (error) => error instanceof ImportFileError && error.code === "IMPORT_FILE_TOO_BIG_UNCOMPRESSED", `${size} bytes`);
    assert.ok(inflated > 0 && inflated < 16 * 1024, `only the small parts before it were inflated (${inflated} bytes)`);
  }
});

test("XLSX headers that lie are refused, and inflation stops within the documented overshoot", () => {
  const code = (fn) => {
    try {
      fn();
      return "accepted";
    } catch (error) {
      return error instanceof ImportFileError ? error.code : String(error);
    }
  };
  const lying = {
    "local name differs from the directory": { localName: "xl/worksheets/sheet9.xml" },
    "local method differs from the directory": { localMethod: 0 },
    "local sizes differ from the directory": { descriptor: false, localSizes: { compressed: 10, size: 10 } },
    "declared size too big": { central: { size: BASIC_SHEET.length + 1 } },
    "declared size too small": { central: { size: 10 } },
    "data runs into the central directory": { central: { compressed: 100000 } },
  };
  for (const [label, entry] of Object.entries(lying)) {
    assert.equal(code(() => readXlsx(handXlsx(entry))), "IMPORT_FILE_INVALID", label);
  }
  const truncated = handXlsx();
  assert.equal(code(() => readXlsx(truncated.subarray(0, truncated.length - 10))), "IMPORT_FILE_INVALID", "no end record");

  // Bombs whose central directory lies stop within one inflater push (XLSX_INFLATE_OVERSHOOT_BYTES) of a limit:
  // the declared size, the ratio measured on compressed bytes actually fed, or the budget.
  const zeros = new Uint8Array(50 * 1024 * 1024);
  const bombs = [
    ["declares 1 KB, inflates 50 MB", { data: zeros, central: { size: 1024 } }, {}, "IMPORT_FILE_INVALID", 1024],
    ["declares its true 30 MB but pads its compressed size past 100:1", { data: zeros.subarray(0, 30 * 1024 * 1024),
      padding: Buffer.alloc(400 * 1024, 0xff) }, {}, "IMPORT_FILE_TOO_BIG_UNCOMPRESSED", 1024 * 1024],
    ["declares 2 MB under a 2 MB budget with no ratio limit, inflates 50 MB", { data: zeros, central: { size: 2 * 1024 * 1024 } },
      { maxUncompressedBytes: 2 * 1024 * 1024 + 4096, maxEntryRatio: 1e9 }, "IMPORT_FILE_INVALID", 2 * 1024 * 1024 + 4096],
  ];
  for (const [label, entry, budget, expected, limit] of bombs) {
    let inflated = 0;
    let largest = 0;
    const result = code(() => extractXlsxParts(handXlsx(entry), { ...budget, onInflate: (bytes) => {
      inflated += bytes;
      largest = Math.max(largest, bytes);
    } }));
    assert.equal(result, expected, label);
    assert.ok(inflated > limit / 2, `${label}: inflation started (${inflated} bytes)`);
    assert.ok(inflated <= limit + XLSX_INFLATE_OVERSHOOT_BYTES, `${label}: ${inflated} bytes inflated`);
    assert.ok(largest <= XLSX_INFLATE_OVERSHOOT_BYTES, `${label}: largest block ${largest} bytes`);
  }
  assert.ok(XLSX_INFLATE_OVERSHOOT_BYTES <= 1.1 * 1024 * 1024 && XLSX_INFLATE_OVERSHOOT_BYTES < XLSX_MAX_UNCOMPRESSED_BYTES / 32);
});

test("the XML tokenizer is linear and refuses unterminated comments, instructions, CDATA and tags", () => {
  // Stored (not deflated) so the parts are big without tripping the decompression budget.
  const stored = (parts) => xlsx({ "xl/worksheets/sheet1.xml": BASIC_SHEET, ...parts }, { level: 0 });
  const hostile = {
    comment: "<!--",
    instruction: "<?",
    cdata: "<![CDATA[",
    "open tag": "<si ",
    "attribute quote": '<si a="',
    "unknown markup": "<!x",
    "stray bracket": "< ",
  };
  const invalid = (error) => error instanceof ImportFileError && error.code === "IMPORT_FILE_INVALID";
  for (const [label, opener] of Object.entries(hostile)) {
    for (const count of [4000, 8000]) {
      const repeated = opener.repeat(count);
      assert.throws(() => readXlsx(stored({ "xl/sharedStrings.xml": SHARED.replace("</sst>", `${repeated}</sst>`) })), invalid, `${label} × ${count} in shared strings`);
      assert.throws(() => readXlsx(stored({ "xl/worksheets/sheet1.xml": sheet(repeated) })), invalid, `${label} × ${count} in the sheet`);
    }
  }
  // Well-formed XML still reads: comments, instructions, CDATA text, prefixes, either quote, spaces around "=", and an
  // attribute value that looks like another attribute.
  const valid = readXlsx(stored({ "xl/worksheets/sheet1.xml": sheet(
    '<!-- nota --><x:row r = \'1\' spans="1:2"><?pi x?><x:c r="A1" t="inlineStr" ><is><t><![CDATA[<b>&amp;]]></t></is></x:c>' +
    '<c x=\' r="Z1"\' t="inlineStr" r="B1"><is><t>B</t></is></c></x:row >') }));
  assert.deepEqual(valid.rows[0].cells, [{ v: "<b>&amp;" }, { v: "B" }]);
  expectFileError(() => readXlsx(stored({ "xl/worksheets/sheet1.xml": sheet('<row r="1"></row  x>') })), "IMPORT_FILE_INVALID");
  expectFileError(() => readXlsx(stored({ "xl/worksheets/sheet1.xml": sheet('<row r="1" r2>') })), "IMPORT_FILE_INVALID");

  // ~4 MB of openers, and ~4 MB of well-formed constructs ending in one opener: both refused in well under a second.
  const big = 4 * 1024 * 1024;
  for (const body of ["<!--".repeat(big / 4), "<!--x--><?p?><![CDATA[y]]><b c='d'/>".repeat(big / 36) + "<!--"]) {
    const bytes = stored({ "xl/sharedStrings.xml": SHARED.replace("</sst>", `${body}</sst>`) });
    const started = performance.now();
    expectFileError(() => readXlsx(bytes), "IMPORT_FILE_INVALID");
    const elapsed = performance.now() - started;
    assert.ok(elapsed < 1500, `parsed ${bytes.length} bytes in ${Math.round(elapsed)} ms`);
  }
});

test("XLSX helpers: column letters, date format codes, entity decoding", () => {
  assert.equal(columnIndex("A1"), 0);
  assert.equal(columnIndex("Z9"), 25);
  assert.equal(columnIndex("AB12"), 27);
  assert.ok(isDateFormatCode("dd/mm/yyyy"));
  assert.ok(isDateFormatCode("[$-280A]d \"de\" mmmm"));
  assert.ok(!isDateFormatCode('"S/" #,##0'));
  assert.ok(!isDateFormatCode("[Red]0.00"));
  assert.equal(decodeXmlText("a &lt;b&gt; &amp; &#241; &#xF1; &unknown;"), "a <b> & ñ ñ &unknown;");
});

test("the XLSX writer's files read back through the bounded reader", () => {
  const bytes = writeXlsx([{ name: "Inventario", rows: [["SKU", "Nombre", "Stock"], ["00123", "=HYPERLINK(\"x\")", 4]], textColumns: [0] }]);
  const result = readXlsx(bytes);
  assert.deepEqual(result.rows[1].cells, [{ v: "00123" }, { v: '=HYPERLINK("x")' }, { v: "4", k: "n" }]);
});

// ------------------------------------------------------------------ whole-file reading

test("readSpreadsheet detects the format from bytes and finds the header under a title", () => {
  const csv = Buffer.from("Inventario de octubre\n\nSKU;Nombre;Stock\n00123;Pedal;8\n");
  const result = readSpreadsheet(new Uint8Array(csv), "csv");
  assert.equal(result.headerRow, 3);
  assert.deepEqual(result.headers, ["SKU", "Nombre", "Stock"]);
  assert.equal(result.rows.length, 1);
  assert.ok(result.warnings.some((warning) => warning.includes("fila 3")));
  expectFileError(() => readSpreadsheet(new Uint8Array(csv), "xlsx"), "IMPORT_FORMAT_MISMATCH");
  expectFileError(() => readSpreadsheet(xlsx({ "xl/worksheets/sheet1.xml": BASIC_SHEET }), "csv"), "IMPORT_FORMAT_MISMATCH");
  expectFileError(() => readSpreadsheet(new Uint8Array([0x53, 0, 0x4b, 0x55]), "csv"), "IMPORT_FILE_INVALID");
  expectFileError(() => readSpreadsheet(new Uint8Array(Buffer.from("SKU,Stock\n")), "csv"), "IMPORT_FILE_EMPTY");
  expectFileError(() => readSpreadsheet(new Uint8Array(5 * 1024 * 1024 + 1), "csv"), "IMPORT_FILE_TOO_LARGE");
  const unnamed = readSpreadsheet(new Uint8Array(Buffer.from("SKU,,Stock\nA,x,1\n")), "csv");
  assert.deepEqual(unnamed.headers, ["SKU", "Columna B", "Stock"]);
  assert.equal(findHeaderRow([{ rowNumber: 1, cells: [{ v: "1", k: "n" }, { v: "2", k: "n" }] }]), 0);
});

// ------------------------------------------------------------------ mapping

test("mapping proposes fields from Spanish and English headers, once each", () => {
  const headers = ["Código", "Descripción", "Cant.", "P. Venta", "MARCA", "Stock", "Tipo de cuerpo", "Categoria", "Precio"];
  const mapping = proposeMapping(headers);
  assert.equal(mapping.sku, 0);
  assert.equal(mapping.description, 1);
  assert.equal(mapping.unit_price_pen, 3, "the leftmost price column wins");
  assert.equal(mapping.brand, 4);
  assert.equal(mapping.quantity, 2, "\"Cant.\" is the leftmost stock column");
  assert.equal(mapping["attribute:body_type"], 6, "attribute columns map to existing attribute keys");
  assert.equal(mapping.category, 7);
  assert.equal(Object.values(mapping).length, new Set(Object.values(mapping)).size);
  assert.equal(normalizeHeader("  Condición  "), "condicion");
  // A saved mapping wins over synonyms.
  assert.equal(proposeMapping(["Cód", "Saldo"], { "cód": "external_reference" }).external_reference, 0);
  assert.deepEqual(mappingProblems({ sku: 0 }, 2).map((problem) => problem.field), ["quantity"]);
  assert.deepEqual(mappingProblems({ quantity: 0 }, 2).map((problem) => problem.field), ["sku"]);
  assert.ok(mappingProblems({ quantity: 0, sku: 0 }, 2).some((problem) => problem.field === null));
  assert.equal(IMPORT_FIELDS[0].label, "SKU");
});

test("barcode headings map to Referencia externa (owner walkthrough note n-barcode)", () => {
  for (const heading of ["cód. barras", "cod. barras", "código de barras", "Cód. Barras", "codigo de barras", "cod barras",
    "COD.BARRAS", "Cód. de barras", "Código barras", "Código de barra"]) {
    assert.deepEqual(proposeMapping([heading]), { external_reference: 0 }, heading);
  }
  // The messy POS export sample: "Cód." is the SKU, "Cód. barras" the barcode.
  const pos = proposeMapping(["Cód.", "Artículo", "Marca", "Familia", "P. Venta", "Existencias", "Estado", "Detalle", "Cód. barras", "Imágenes"]);
  assert.equal(pos.sku, 0);
  assert.equal(pos.external_reference, 8);
});

// ------------------------------------------------------------------ row validation

const MAPPING = { sku: 0, product_name: 1, quantity: 2, unit_price_pen: 3, category: 4, instrument_type: 5, condition: 6, external_reference: 7, listing_id: 8, low_stock_threshold: 9, description: 10, photos: 11, "attribute:body_type": 12 };
const row = (values) => values.map((value) => (typeof value === "object" && value !== null ? value : { v: value ?? "" }));
const codes = (issues) => issues.map((issue) => issue.code);

test("a complete row parses into typed values", () => {
  const { parsed, issues } = parseImportRow(row(["00123", " Pedal  Boss DS-1 ", "8", "S/ 1500", "Pedales", "", "nuevo", "042406069232", "E7000000-0000-4000-8000-000000000001", "2", "Pedal de distorsión clásico, nuevo en caja sellada con garantía.", "a/DS1__01.jpg; DS1__02.jpg", "Cuerpo sólido"]), MAPPING);
  assert.deepEqual(issues, []);
  assert.equal(parsed.sku, "00123");
  assert.equal(parsed.product_name, "Pedal Boss DS-1");
  assert.equal(parsed.quantity, 8);
  assert.equal(parsed.unit_price_pen, 1500);
  assert.equal(parsed.category, "pedals");
  assert.equal(parsed.condition, "Nuevo");
  assert.equal(parsed.listing_id, "e7000000-0000-4000-8000-000000000001");
  assert.equal(parsed.low_stock_threshold, 2);
  assert.deepEqual(parsed.photos, ["DS1__01.jpg", "DS1__02.jpg"]);
  assert.deepEqual(parsed.attributes, { body_type: "Cuerpo sólido" });
});

test("Excel coercions of identifiers are caught, never repaired", () => {
  assert.deepEqual(codes(parseImportRow(row([{ v: "1.23456789012E+17", k: "n" }, "Nombre", "1"]), MAPPING).issues).slice(0, 1), ["IMPORT_IDENTIFIER_SCIENTIFIC"]);
  assert.deepEqual(codes(parseImportRow(row(["1,23E+17", "Nombre", "1"]), MAPPING).issues).slice(0, 1), ["IMPORT_IDENTIFIER_SCIENTIFIC"]);
  const numeric = parseImportRow(row([{ v: "123", k: "n" }, "Nombre", "1"]), MAPPING);
  assert.equal(numeric.parsed.sku, "123");
  assert.ok(codes(numeric.issues).includes("IMPORT_IDENTIFIER_NUMBER"), "numeric SKU warns about leading zeros");
  assert.ok(codes(parseImportRow(row([{ v: "45000", k: "d" }, "Nombre", "1"]), MAPPING).issues).includes("IMPORT_IDENTIFIER_DATE"));
  assert.ok(codes(parseImportRow(row([{ v: "123456789012345680", k: "n" }, "Nombre", "1"]), MAPPING).issues).includes("IMPORT_IDENTIFIER_SCIENTIFIC"), "more than 15 digits lost precision");
  assert.ok(codes(parseImportRow(row(["SKU CON ESPACIO", "Nombre", "1"]), MAPPING).issues).includes("IMPORT_SKU_INVALID"));
  assert.ok(codes(parseImportRow(row(["A", "Nombre", "1", "", "", "", "", { v: "7.5E+12", k: "n" }]), MAPPING).issues).includes("IMPORT_IDENTIFIER_SCIENTIFIC"));
});

test("prices: whole soles only, ambiguous separators refused", () => {
  assert.deepEqual(parsePriceCell({ v: "1500" }), { value: 1500 });
  assert.deepEqual(parsePriceCell({ v: "S/. 1500" }), { value: 1500 });
  assert.deepEqual(parsePriceCell({ v: "PEN 99" }), { value: 99 });
  assert.deepEqual(parsePriceCell({ v: "1500.00" }), { value: 1500 });
  assert.deepEqual(parsePriceCell({ v: "1500", k: "n" }), { value: 1500 });
  assert.match(parsePriceCell({ v: "1.500" }).error, /ambiguo/);
  assert.match(parsePriceCell({ v: "1,500" }).error, /ambiguo/);
  assert.match(parsePriceCell({ v: "1500.50" }).error, /céntimos/);
  assert.match(parsePriceCell({ v: "1499.99", k: "n" }).error, /enteros/);
  assert.match(parsePriceCell({ v: "$ 400" }).error, /monedas/);
  assert.match(parsePriceCell({ v: "0" }).error, /mayor que cero/);
  assert.match(parsePriceCell({ v: "gratis" }).error, /enteros/);
});

test("stock and threshold: non-negative whole numbers up to 100000", () => {
  const stock = (cell) => parseImportRow(row(["A", "Nombre", cell]), MAPPING);
  assert.equal(stock("0").parsed.quantity, 0);
  assert.equal(stock({ v: "12", k: "n" }).parsed.quantity, 12);
  for (const bad of ["-1", "2.5", "1,000", "diez", "100001", { v: "2.5", k: "n" }, { v: "45000", k: "d" }, { v: "1", k: "b" }]) {
    const result = stock(bad);
    assert.equal(result.parsed.quantity, null, JSON.stringify(bad));
    assert.ok(result.issues.some((issue) => issue.field === "quantity" && issue.severity === "error"), JSON.stringify(bad));
  }
  assert.equal(stock("").parsed.quantity, null, "blank stock means unchanged");
  assert.ok(codes(parseImportRow(row(["A", "N", "1", "", "", "", "", "", "", "-2"]), MAPPING).issues).includes("IMPORT_NUMBER_INVALID"));
});

test("categories, types and conditions map to Laria values; unknown ones warn", () => {
  const parse = (category, type, condition) => parseImportRow(row(["A", "Nombre", "1", "100", category, type, condition]), MAPPING);
  assert.equal(parse("Guitarras", "Guitarras eléctricas", "Usado - buen estado").parsed.instrument_type, "electric_guitar");
  assert.equal(parse("", "Guitarras eléctricas", "").parsed.category, "guitars", "type implies the category");
  assert.equal(parse("drums", "", "").parsed.category, "percussion", "retired categories still map");
  assert.equal(parse("", "", "usado con detalles").parsed.condition, "Usado - con detalles");
  assert.ok(codes(parse("Juguetes", "", "").issues).includes("IMPORT_CATEGORY_UNKNOWN"));
  assert.ok(codes(parse("Pedales", "Guitarras eléctricas", "").issues).includes("IMPORT_TYPE_MISMATCH"));
  assert.ok(codes(parse("", "", "usado").issues).includes("IMPORT_CONDITION_UNKNOWN"));
});

test("cell problems: Excel errors, oversized cells, formulas, publication readiness", () => {
  assert.ok(codes(parseImportRow(row(["A", { v: "#REF!", k: "e" }, "1"]), MAPPING).issues).includes("IMPORT_CELL_ERROR"));
  assert.ok(codes(parseImportRow(row(["A", { v: "x".repeat(2001), t: 1 }, "1"]), MAPPING).issues).includes("IMPORT_CELL_TOO_LONG"));
  assert.ok(codes(parseImportRow(row(["A", "x".repeat(141), "1"]), MAPPING).issues).includes("IMPORT_FIELD_TOO_LONG"));
  const formula = parseImportRow(row(["A", "Nombre", { v: "3", k: "n", f: 1 }, { v: "10", k: "n", f: 1 }]), MAPPING);
  assert.equal(formula.parsed.quantity, 3);
  assert.equal(codes(formula.issues).filter((code) => code === "IMPORT_FORMULA").length, 1, "one formula warning per row");
  const incomplete = parseImportRow(row(["A", "Nombre", "1"]), MAPPING);
  assert.match(incomplete.issues.find((issue) => issue.code === "IMPORT_PUBLICATION_MISSING").message, /precio, condición, categoría/);
  assert.ok(codes(parseImportRow(row(["A", "Nombre", "1", "", "", "", "", "", "no-es-uuid"]), MAPPING).issues).includes("IMPORT_LISTING_INVALID"));
});

// ------------------------------------------------------------------ report and template

test("the report CSV neutralizes formulas and explains each row", () => {
  assert.equal(csvSafeCell('=HYPERLINK("http://x")'), '"\'=HYPERLINK(""http://x"")"');
  assert.equal(csvSafeCell("+51 999"), "'+51 999");
  assert.equal(csvSafeCell("-3"), "'-3");
  assert.equal(csvSafeCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvSafeCell("\tx"), "'\tx");
  assert.equal(csvSafeCell("\n=1+1"), '"\'\n=1+1"', "a leading line feed (Codex review 3 finding 3)");
  assert.equal(csvSafeCell(-3), "-3", "real numbers stay numbers");
  assert.equal(csvSafeCell("a;b"), '"a;b"');
  assert.deepEqual(describeChanges({ quantity_on_hand: { from: 12, to: 9 }, unit_price_pen: { from: null, to: 300 } }),
    ["Stock: 12 → 9 (−3)", "Precio: — → 300"]);
  const csv = buildReportCsv([
    { row_number: 2, sku_normalized: "A", parsed: { sku: "=cmd", product_name: "Pedal" }, planned_action: "update", owner_decision: "include",
      commit_status: "applied", commit_message: null, issues: [], changes: { quantity_on_hand: { from: 1, to: 3 } } },
    { row_number: 3, sku_normalized: null, parsed: { sku: null }, planned_action: "error", owner_decision: "include",
      commit_status: "pending", commit_message: null, issues: [{ severity: "error", message: "Falta el nombre." }], changes: {} },
    { row_number: 4, sku_normalized: "B", parsed: { sku: "B", product_name: "\n=HYPERLINK(\"http://x\")" }, planned_action: "create",
      owner_decision: "include", commit_status: "applied", commit_message: null, issues: [], changes: {} },
  ]);
  const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lines[0], "Fila,SKU,Nombre,Acción,Resultado,Cambios,Mensajes");
  assert.equal(lines[1], "2,'=cmd,Pedal,Actualizar,Aplicada,Stock: 1 → 3 (+2),");
  assert.equal(lines[2], "3,,,Con errores,No aplicada,,Falta el nombre.");
  assert.equal(lines[3], '4,B,"\'\n=HYPERLINK(""http://x"")",Crear SKU,Aplicada,,', "a name starting with a line feed is prefixed");
});

test("the template has the brief's headings, category attributes and text identifier columns", () => {
  const base = templateColumns(null).map((column) => column.label);
  assert.deepEqual(base.slice(0, 4), ["SKU", "Nombre", "Marca", "Modelo"]);
  assert.ok(base.includes("Precio (PEN)") && base.includes("Stock") && base.includes("ID de publicación"));
  assert.ok(templateColumns("guitars").some((column) => column.label === "Tipo de cuerpo"));
  assert.equal(templateColumns("no-existe").length, base.length);
  const read = readXlsx(buildTemplateXlsx("pedals"));
  assert.equal(read.rows[0].cells[0].v, "SKU");
  assert.equal(read.rows[2].cells[0].v, "00123", "leading zeros survive the template round trip");
  // Reading the template back proposes a complete mapping.
  const mapping = proposeMapping(read.rows[0].cells.map((cell) => cell.v));
  for (const field of ["sku", "product_name", "quantity", "unit_price_pen", "listing_id", "photos", "low_stock_threshold"]) {
    assert.ok(mapping[field] !== undefined, field);
  }
  const csv = buildTemplateCsv(null);
  assert.ok(csv.startsWith("﻿SKU,Nombre,"));
  const parsed = readSpreadsheet(new Uint8Array(Buffer.from(csv)), "csv");
  assert.equal(parsed.rows.length, 2);
});
