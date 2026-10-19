// Effortless Laria, batch "stores" (docs/ux-effortless/stores.md). Unit checks for each idea the batch builds; the
// database rules are in tests/ux-stores-import.sql. Runs with `pnpm test`.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const load = Module._load;
Module._load = function stubServerOnly(request, ...rest) {
  if (request === "server-only") return {};
  return load.call(this, request, ...rest);
};

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const { mappingProblems, impliedUpdateScope, proposeMapping, IMPORT_FIELDS, IMPORT_UPDATE_SCOPES } = require("@/lib/store-import/mapping");
const { parseImportRow } = require("@/lib/store-import/rows");
const { parseImportAction } = require("@/lib/store-import/server");
const { EXPORT_HEADERS, exportRows, exportTimestamp } = require("@/lib/inventory-export");
const { templateColumns } = require("@/lib/store-import/template");

// ------------------------------------------------------------------ fix-04

test("fix-04: the scope decides which column the mapping needs", () => {
  assert.deepEqual(IMPORT_UPDATE_SCOPES.map((scope) => scope.label), ["Precios", "Stock", "Ambos"]);
  assert.equal(impliedUpdateScope({ sku: 0, unit_price_pen: 1 }), "prices");
  assert.equal(impliedUpdateScope({ sku: 0, quantity: 1 }), "stock");
  assert.equal(impliedUpdateScope({ sku: 0, quantity: 1, unit_price_pen: 2 }), null);

  const fields = (mapping, scope) => mappingProblems(mapping, 4, scope).map((problem) => problem.field);
  assert.deepEqual(fields({ sku: 0, unit_price_pen: 1 }, null), [], "a price-only file needs no stock column");
  assert.deepEqual(fields({ sku: 0, quantity: 1, unit_price_pen: 2 }, null), ["scope"], "stock and price: ask");
  assert.deepEqual(fields({ sku: 0, quantity: 1, unit_price_pen: 2 }, "prices"), []);
  assert.deepEqual(fields({ sku: 0 }, null), ["quantity"], "neither column");
  assert.deepEqual(fields({ sku: 0, quantity: 1 }, "prices"), ["unit_price_pen"]);
  assert.deepEqual(fields({ sku: 0, unit_price_pen: 1 }, "both"), ["quantity"]);
  // Older callers (no scope argument) keep STORE-2's rule.
  assert.deepEqual(mappingProblems({ sku: 0 }, 2).map((problem) => problem.field), ["quantity"]);
});

test("fix-04: the export carries a parseable export time that the import maps back", () => {
  assert.equal(EXPORT_HEADERS.at(-1), "Exportado el");
  assert.equal(exportTimestamp(new Date("2026-10-19T14:05:09.123Z")), "2026-10-19T14:05:09Z");
  const [row] = exportRows([{ merchant_sku: "A", product_name: "Afinador", variant_label: null, quantity_on_hand: 3, quantity_available: 3,
    unit_price_pen: 100, low_stock_threshold: null, external_reference: null, inventory_status: "active", listing: null }], "2026-10-19T14:05:09Z");
  assert.equal(row.length, EXPORT_HEADERS.length);
  assert.equal(row.at(-1), "2026-10-19T14:05:09Z");

  const mapping = proposeMapping([...EXPORT_HEADERS]);
  assert.equal(mapping.exported_at, EXPORT_HEADERS.length - 1);
  assert.equal(mapping.quantity, EXPORT_HEADERS.indexOf("Stock"));
  assert.ok(!templateColumns(null).some((column) => column.key === "exported_at"), "never a template column");
  assert.ok(!IMPORT_FIELDS.some((field) => field.key === "exported_at"));
});

test("fix-04: the row parser keeps a clean export time and drops one Excel changed", () => {
  const mapping = { sku: 0, quantity: 1, exported_at: 2 };
  const ok = parseImportRow([{ v: "A" }, { v: "3" }, { v: "2026-10-19T14:05:09Z" }], mapping);
  assert.equal(ok.parsed.exported_at, "2026-10-19T14:05:09Z");
  assert.ok(!ok.issues.some((issue) => issue.code === "IMPORT_EXPORTED_AT_UNREADABLE"));
  for (const cell of [{ v: "46314.5", k: "d" }, { v: "19/10/2026 09:05" }, { v: "46314.5", k: "n" }]) {
    const parsed = parseImportRow([{ v: "A" }, { v: "3" }, cell], mapping);
    assert.equal(parsed.parsed.exported_at, null);
    const note = parsed.issues.find((issue) => issue.code === "IMPORT_EXPORTED_AT_UNREADABLE");
    assert.equal(note?.severity, "info", "a changed export time never blocks the row");
  }
});

test("fix-04: the mapping action carries the scope and the stale-stock choice, and refuses anything else", () => {
  assert.deepEqual(parseImportAction({ action: "mapping", mapping: { sku: 0 }, version: 2, updateScope: "prices", staleStock: "apply" }),
    { action: "mapping", mapping: { sku: 0 }, version: 2, saveDefault: false, updateScope: "prices", staleStock: "apply" });
  assert.equal(parseImportAction({ action: "mapping", mapping: { sku: 0 }, version: 2 }).updateScope, undefined);
  assert.equal(parseImportAction({ action: "mapping", mapping: { sku: 0 }, version: 2, updateScope: "todo" }), null);
  assert.equal(parseImportAction({ action: "mapping", mapping: { sku: 0 }, version: 2, staleStock: "maybe" }), null);
});

test("fix-04: the migration keeps one plan_import_row and passes the session options to both callers", () => {
  const sql = read("supabase/migrations/20261106120000_ux_import_update_scope.sql");
  assert.match(sql, /drop function laria_private\.plan_import_row\(uuid, jsonb, jsonb\);/);
  assert.match(sql, /plan_import_row\(session\.store_id, parsed, issues, session\.options\)/);
  assert.match(sql, /plan_import_row\(p_session\.store_id, p_row\.parsed, ''\[\]''::jsonb, p_session\.options\)/);
  assert.match(sql, /grant execute on function public\.confirm_store_import_mapping\(uuid, jsonb, integer, boolean, text, text\) to authenticated/);
  const wizard = read("components/store-import/import-wizard.tsx");
  assert.match(wizard, /¿Qué actualiza este archivo en los SKU que ya tienes\?/);
  assert.match(wizard, /Usar el stock del archivo/);
  assert.match(wizard, /Mantener el stock de hoy/);
});

// ------------------------------------------------------------------ fix-09 (the store invitation)

test("fix-09: the store invitation no longer says a store can't publish before approval", () => {
  const page = read("app/registro/tienda/invitacion/page.tsx");
  assert.doesNotMatch(page, /aprobación antes de publicar/);
  assert.doesNotMatch(page, /permitir publicaciones/);
  assert.match(page, /Puedes\s+publicar desde el primer día/);
  assert.match(page, /la página pública de tu tienda no se\s+muestra/);
});
