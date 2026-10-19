// STORE-1b inventory screens (docs/store-operations/store-1b.md): export formula safety and column contract, the
// action allowlist, URL filters and cursors, error mapping, the data table and the D-15 listing actions.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { unzipSync, strFromU8 } = require("fflate");

const root = path.resolve(__dirname, "..");
const load = (file) => require(path.join(root, file));

function withMocks(mocks, run) {
  const Module = require("node:module");
  const original = Module._load;
  Module._load = function mocked(request, ...rest) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return original.call(this, request, ...rest);
  };
  try {
    return run();
  } finally {
    Module._load = original;
  }
}

const routerMock = { "next/navigation": { useRouter: () => ({ refresh() {}, push() {} }) } };

// ------------------------------------------------------------------ export

test("export prefixes formula-like text in CSV and never touches genuine numbers", () => {
  const { formulaSafe, toCsv, exportRows, EXPORT_HEADERS } = load("lib/inventory-export.ts");
  for (const value of ["=HYPERLINK(\"http://x\",\"y\")", "+51999", "-2+3", "@SUM(A1)", "\tTab", "\rCR"]) {
    assert.equal(formulaSafe(value), `'${value}`, value);
  }
  for (const value of ["Guitarra", "SKU-001", "1=1", " =espacio"]) assert.equal(formulaSafe(value), value, value);

  const rows = exportRows([
    {
      merchant_sku: "00123",
      product_name: "=HYPERLINK(\"http://evil\",\"clic\")",
      variant_label: "Rojo, \"edición\"",
      quantity_on_hand: 7,
      quantity_available: 7,
      unit_price_pen: 1500,
      low_stock_threshold: null,
      external_reference: "@ref",
      inventory_status: "active",
      listing: { id: "11111111-1111-4111-8111-111111111111", slug: "boss-ds-1", status: "approved", brand: "Boss", model: "DS-1", category: "pedals" },
    },
  ]);
  assert.equal(rows[0].length, EXPORT_HEADERS.length);
  const csv = toCsv(rows);
  assert.ok(csv.startsWith("﻿SKU,Nombre,Variante,Marca,Modelo,Categoría,Stock,Disponible,Precio (PEN),Umbral de stock bajo,Referencia externa,Estado del SKU,ID de publicación,Estado de la publicación,Enlace,Exportado el\r\n"));
  const line = csv.split("\r\n")[1];
  assert.match(line, /^00123,"'=HYPERLINK\(""http:\/\/evil"",""clic""\)","Rojo, ""edición""",Boss,DS-1,/);
  assert.match(line, /,7,7,1500,,'@ref,Activo,11111111-1111-4111-8111-111111111111,Publicada,https?:\/\/[^,]+\/instrumentos\/boss-ds-1,\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test("export prefixes text that starts with a line feed before a formula (Codex review 3, finding 3)", () => {
  const { formulaSafe, toCsv, exportRows } = load("lib/inventory-export.ts");
  assert.equal(formulaSafe("\n=HYPERLINK(\"http://x\")"), "'\n=HYPERLINK(\"http://x\")");
  assert.equal(formulaSafe("\r\n=1+1"), "'\r\n=1+1");
  assert.equal(formulaSafe("Pedal\n=1"), "Pedal\n=1", "only a leading line feed matters");
  const rows = exportRows([
    { merchant_sku: "A-1", product_name: "\n=HYPERLINK(\"http://evil\",\"clic\")", variant_label: null, quantity_on_hand: 2,
      quantity_available: 2, unit_price_pen: 10, low_stock_threshold: null, external_reference: "\n@ref", inventory_status: "active", listing: null },
  ]);
  const csv = toCsv(rows);
  assert.ok(csv.includes('"\'\n=HYPERLINK(""http://evil"",""clic"")"'), csv);
  assert.ok(csv.includes('"\'\n@ref"'), csv);
  assert.match(csv, /,2,2,10,,/, "genuine numbers stay unprefixed");
});

test("XLSX export stores text as inline strings, numbers as numbers, identifiers as text, and never a formula", () => {
  const { exportRows, toXlsxSheet } = load("lib/inventory-export.ts");
  const { writeXlsx } = load("lib/spreadsheet/xlsx-write.ts");
  const rows = exportRows([
    { merchant_sku: "00123", product_name: "=1+1", variant_label: null, quantity_on_hand: 3, quantity_available: 3, unit_price_pen: 99, low_stock_threshold: 1, external_reference: "000045", inventory_status: "archived", listing: null },
  ]);
  const files = unzipSync(writeXlsx([toXlsxSheet(rows)]));
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  assert.doesNotMatch(sheet, /<f>/);
  assert.match(sheet, /<c r="B2" t="inlineStr"><is><t xml:space="preserve">=1\+1<\/t><\/is><\/c>/);
  assert.match(sheet, /<c r="A2" s="1" t="inlineStr"><is><t xml:space="preserve">00123<\/t>/);
  assert.match(sheet, /<c r="K2" s="1" t="inlineStr"><is><t xml:space="preserve">000045<\/t>/);
  assert.match(sheet, /<c r="G2"><v>3<\/v><\/c>/);
  assert.match(sheet, /<c r="I2"><v>99<\/v><\/c>/);
  assert.match(sheet, />Archivado</);
});

test("the export route is owner-scoped, bounded and downloads without caching", () => {
  const route = fs.readFileSync(path.join(root, "app/api/store/inventory/export/route.ts"), "utf8");
  assert.match(route, /\.eq\("owner_user_id", userData\.user\.id\)/);
  assert.match(route, /\.eq\("store_id", store\.id\)/);
  // Effortless Laria, inventory batch, stock-14: a selection can be the whole view, up to the bulk limit (2000).
  assert.match(route, /ids\.length > INVENTORY_BULK_LIMIT/);
  assert.match(route, /MAX_ROWS = 10000/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
  assert.match(route, /Content-Disposition/);
});

test("the export fails clearly instead of downloading blank columns when a lookup fails (Codex review 3, finding 7)", async () => {
  // A Supabase client whose queries resolve to fixed { data, error } results per table.
  let results = null;
  const fakeSupabase = () => ({
    auth: { getUser: async () => ({ data: { user: { id: "owner-1" } }, error: null }) },
    from(table) {
      const result = results[table];
      const query = {
        select: () => query, eq: () => query, in: () => query, order: () => query, range: () => query,
        maybeSingle: async () => result,
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
      };
      return query;
    },
  });
  const { GET } = withMocks({ "@/lib/supabase/server-client": { getSupabaseServerClient: async () => fakeSupabase() } },
    () => load("app/api/store/inventory/export/route.ts"));
  const listingId = "11111111-1111-4111-8111-111111111111";
  const ok = {
    stores: { data: { id: "store-1", slug: "mi-tienda" }, error: null },
    store_inventory_items: { data: [{ merchant_sku: "A-1", product_name: "Pedal", variant_label: null, quantity_on_hand: 1, quantity_available: 1,
      unit_price_pen: 10, low_stock_threshold: null, external_reference: null, inventory_status: "active", listing_id: listingId }], error: null },
    listings: { data: [{ id: listingId, slug: "pedal", status: "approved", brand: "Boss", model: "DS-1", category: "pedals" }], error: null },
  };
  const timeout = { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } };
  const download = async (overrides) => {
    results = { ...ok, ...overrides };
    const logged = [];
    const original = console.error;
    console.error = (...args) => logged.push(args.join(" "));
    try {
      const response = await GET(new Request("http://localhost/api/store/inventory/export?format=csv"));
      return { response, body: await response.text(), logged };
    } finally {
      console.error = original;
    }
  };

  const fine = await download({});
  assert.equal(fine.response.status, 200);
  assert.match(fine.body, /^\uFEFF?SKU,/, "a CSV download (Response.text() drops the BOM)");
  assert.match(fine.body, /A-1,Pedal,,Boss,DS-1,Pedales,1,1,10,,,Activo,11111111/);

  for (const table of ["listings", "stores", "store_inventory_items"]) {
    const failed = await download({ [table]: timeout });
    assert.equal(failed.response.status, 500, `${table}: ${failed.response.status} ${failed.body.slice(0, 80)}`);
    assert.match(failed.response.headers.get("content-type") ?? "", /application\/json/, table);
    assert.equal(failed.response.headers.get("content-disposition"), null, `${table}: no download`);
    assert.deepEqual(JSON.parse(failed.body), { message: "No se pudo preparar la exportación." }, table);
    assert.ok(failed.logged.some((line) => line.includes("57014")), `${table}: the failure is logged`);
  }
});

// ------------------------------------------------------------------ actions

test("only the allowlisted inventory functions can be called, with shaped arguments", () => {
  const { inventoryCall } = load("lib/inventory-actions.ts");
  const item = "22222222-2222-4222-8222-222222222222";
  assert.equal(inventoryCall({ action: "drop_table" }), null);
  assert.equal(inventoryCall({ action: "movement", item_id: "not-a-uuid", type: "sale", key: "mov-12345678" }), null);
  assert.equal(inventoryCall({ action: "movement", item_id: item, type: "sale", key: "short" }), null, "keys are at least 8 characters");
  // Effortless Laria, inventory batch, stock-14: the bulk limit is 2000 (a whole view).
  assert.equal(inventoryCall({ action: "price_bulk", item_ids: Array(2001).fill(item), mode: "set", value: 10, key: "precio-12345678" }), null);
  const movement = inventoryCall({ action: "movement", item_id: item, type: "sale", quantity: 2, channel: "tienda_fisica", key: "mov-12345678", extra: "ignored", expected_version: 4 });
  assert.equal(movement.fn, "record_stock_movement");
  assert.deepEqual(Object.keys(movement.args).sort(), ["p_channel", "p_expected_version", "p_idempotency_key", "p_item_id", "p_quantity", "p_reason", "p_reference", "p_type"]);
  assert.equal(movement.args.p_quantity, 2);
  assert.equal(inventoryCall({ action: "movement", item_id: item, type: "sale", quantity: 1.5, key: "mov-12345678" }).args.p_quantity, null, "decimals reach the database as null and are refused there");
  const allowed = new Set();
  const samples = [
    { action: "create", fields: {}, key: "sku-12345678" },
    { action: "movement", item_id: item, type: "sale", key: "mov-12345678" },
    { action: "bulk_stock", operations: [], key: "stock-12345678" },
    { action: "price_preview", item_ids: [item], mode: "set" },
    { action: "price_bulk", item_ids: [item], mode: "set", key: "precio-12345678" },
    { action: "threshold_bulk", item_ids: [item], threshold: null, key: "umbral-12345678" },
    { action: "hide_bulk", item_ids: [item], key: "ocultar-12345678" },
    { action: "update", item_id: item, fields: {} },
    { action: "change_sku", item_id: item, sku: "X" },
    { action: "link", item_id: item, listing_id: item },
    { action: "unlink", item_id: item },
    { action: "archive", item_id: item },
    { action: "unarchive", item_id: item },
  ];
  for (const sample of samples) allowed.add(inventoryCall(sample).fn);
  assert.deepEqual([...allowed].sort(), [
    "apply_bulk_stock_operations", "archive_inventory_item", "change_inventory_sku", "create_inventory_item",
    "hide_inventory_listings_bulk", "link_inventory_listing", "preview_inventory_price_bulk", "record_stock_movement",
    "set_inventory_price_bulk", "set_inventory_threshold_bulk", "unarchive_inventory_item", "unlink_inventory_listing",
    "update_inventory_item",
  ]);
});

test("database error codes keep their Spanish message; anything else is generic", () => {
  const { inventoryError } = load("lib/store-inventory.ts");
  assert.deepEqual(inventoryError("STOCK_INSUFFICIENT: No hay stock disponible suficiente."), { code: "STOCK_INSUFFICIENT", message: "No hay stock disponible suficiente." });
  assert.equal(inventoryError("INVENTORY_CONCURRENT_CHANGE: Un SKU cambió mientras se guardaba. Intenta de nuevo.").code, "INVENTORY_CONCURRENT_CHANGE");
  assert.deepEqual(inventoryError('duplicate key value violates unique constraint "x"'), { code: "UNKNOWN", message: "No se pudo guardar el cambio. Intenta de nuevo." });
  assert.equal(inventoryError(null).code, "UNKNOWN");
});

// ------------------------------------------------------------------ filters and cursors

test("filters live in the URL, unknown values fall back, and tampered cursors restart the list", () => {
  const { parseInventoryFilters, inventoryHref, decodeCursor, encodeCursor, decodeMovementCursor, encodeMovementCursor, stockLevel } = load("lib/store-inventory.ts");
  const { filters, cursor } = parseInventoryFilters({ q: " ds-1 ", stock: "low", publicacion: "published", catalogo: "nope", orden: "price_desc" });
  assert.deepEqual(filters, { q: "ds-1", stock: "low", publication: "published", catalog: "", category: "", price: "", sort: "price_desc" });
  assert.equal(cursor, null);
  const next = { value: "1500", id: "33333333-3333-4333-8333-333333333333" };
  const href = inventoryHref(filters, next);
  assert.match(href, /^\/mi-cuenta\/tienda\/inventario\?q=ds-1&stock=low&publicacion=published&orden=price_desc&despues=/);
  const roundTrip = parseInventoryFilters(Object.fromEntries(new URL(href, "http://x").searchParams));
  assert.deepEqual(roundTrip.cursor, next);
  assert.equal(inventoryHref(parseInventoryFilters({}).filters), "/mi-cuenta/tienda/inventario");
  assert.equal(decodeCursor("not-base64-json"), null);
  assert.equal(decodeCursor(Buffer.from(JSON.stringify(["1", "x' or 1=1"])).toString("base64url")), null);
  assert.equal(decodeCursor(encodeCursor(next)).id, next.id);
  const movement = { createdAt: "2026-10-15T08:05:34.123456+00:00", id: next.id };
  assert.deepEqual(decodeMovementCursor(encodeMovementCursor(movement)), movement, "microseconds are kept for an exact keyset");
  assert.equal(decodeMovementCursor(Buffer.from(JSON.stringify(["2026-10-15),id.gt.(0", next.id])).toString("base64url")), null);
  // Same rule as laria_private.inventory_stock_level.
  assert.deepEqual([stockLevel(0, 2), stockLevel(2, 2), stockLevel(3, 2), stockLevel(1, null)], ["out", "low", "in_stock", "in_stock"]);
});

// ------------------------------------------------------------------ screens

test("the data table is a captioned semantic table with labelled checkboxes and phone labels", () => {
  const { DataTable } = load("components/ui/data-table.tsx");
  const rows = [{ id: "a", name: "Uno", stock: 3 }, { id: "b", name: "Dos", stock: 0 }];
  const markup = renderToStaticMarkup(React.createElement(DataTable, {
    caption: "SKU de tu inventario",
    rows,
    rowKey: (row) => row.id,
    columns: [
      { key: "name", header: "SKU", primary: true, cell: (row) => row.name },
      { key: "stock", header: "Stock", label: "Stock", cell: (row) => String(row.stock) },
    ],
    selection: { selected: new Set(["b"]), onToggle() {}, onToggleAll() {}, rowLabel: (row) => `Seleccionar ${row.name}` },
  }));
  assert.match(markup, /<table[^>]*><caption class="sr-only">SKU de tu inventario<\/caption>/);
  assert.match(markup, /<th scope="col"[^>]*md:sticky md:top-0/);
  assert.match(markup, /aria-label="Seleccionar todos los de esta página"/);
  // fast-04: phones get "select all" as a visible row (the header is for screen readers there); one shows at each width.
  assert.match(markup, /<label class="[^"]*md:hidden"><input type="checkbox"[^>]*aria-label="Seleccionar todos los de esta página"/);
  assert.match(markup, /<span class="max-md:hidden"><input type="checkbox"[^>]*aria-label="Seleccionar todos los de esta página"/);
  assert.match(markup, /aria-label="Seleccionar Uno"/);
  assert.match(markup, /aria-label="Seleccionar Dos" checked=""/);
  assert.equal((markup.match(/<tr tabindex="0"/g) ?? []).length, 2, "one keyboard stop per row");
  assert.equal((markup.match(/data-label="Stock"/g) ?? []).length, 2);
});

test("a stock-managed listing hides Marcar vendida (D-15); an unlinked one offers Controlar stock (design §6.1)", () => {
  const { ListingManagementTable } = withMocks(routerMock, () => load("components/listing-management-table.tsx"));
  const base = { title: "Pedal", status: "approved", slug: "pedal", price_pen: 100, created_at: "2026-09-01T12:00:00Z", published_at: "2026-09-02T12:00:00Z", sold_at: null, rejection_reason: null, hidden_source: null, hidden_reason: null, revisionStatus: null, revisionReason: null };
  const html = renderToStaticMarkup(React.createElement(ListingManagementTable, {
    emptyMessage: "Vacío",
    canControlStock: true,
    listings: [
      { ...base, id: "linked", inventoryItemId: "44444444-4444-4444-8444-444444444444" },
      { ...base, id: "plain", inventoryItemId: null },
    ],
  }));
  const [linked, plain] = html.split("<tr").slice(2);
  assert.doesNotMatch(linked, /Marcar vendida/);
  assert.match(linked, /Stock controlado en Inventario\./);
  assert.match(linked, /href="\/mi-cuenta\/tienda\/inventario\/44444444-4444-4444-8444-444444444444"[^>]*>Ver SKU</);
  assert.match(plain, /Marcar vendida/);
  assert.match(plain, />Controlar stock</);
  // Particulares (and stores without the pilot) never see the inventory actions.
  const particular = renderToStaticMarkup(React.createElement(ListingManagementTable, { emptyMessage: "Vacío", listings: [{ ...base, id: "p" }] }));
  assert.doesNotMatch(particular, /Controlar stock|Ver SKU/);
  assert.match(particular, /Marcar vendida/);
});

test("the stock sheet creates its idempotency key once, and counts carry the version the merchant saw", () => {
  const sheet = fs.readFileSync(path.join(root, "components/inventory/stock-action-sheet.tsx"), "utf8");
  assert.match(sheet, /const \[requestKey\] = useState\(\(\) => newRequestKey\("mov"\)\)/);
  assert.match(sheet, /expected_version: type === "stock_count" \? item\.version : null/);
  for (const file of ["components/inventory/bulk-actions.tsx", "components/inventory/sku-forms.tsx"]) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    assert.doesNotMatch(text, /newRequestKey\([^)]*\)\s*[,;]\s*$/m, `${file}: keys are created in useState, not per render`);
    assert.match(text, /useState\(\(\) => newRequestKey\(/, file);
  }
  const client = fs.readFileSync(path.join(root, "lib/inventory-client.ts"), "utf8");
  assert.match(client, /code === "INVENTORY_CONCURRENT_CHANGE" && attempt === 0\) continue;/, "a lock conflict is retried once with the same body");
});

test("inventory pages keep the V1 table for stores outside the pilot and never call RPCs from the page", () => {
  const page = fs.readFileSync(path.join(root, "app/mi-cuenta/tienda/inventario/page.tsx"), "utf8");
  assert.match(page, /summary\?\.inventory_enabled && params\.vista !== "publicaciones"/);
  assert.doesNotMatch(page, /\.rpc\(/);
  assert.match(page, /const IMPORT_HREF = "\/mi-cuenta\/tienda\/inventario\/importar";/, "Importar opens the STORE-2 wizard");
  assert.match(page, /importErrors=\{lastImport\?\.errors \?\? null\}/, "the import-errors tile reads the latest finished import");
  const item = fs.readFileSync(path.join(root, "app/mi-cuenta/tienda/inventario/[itemId]/page.tsx"), "utf8");
  assert.match(item, /if \(!item \|\| item\.store_id !== store\.id\) notFound\(\);/);
});
