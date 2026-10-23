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

// ------------------------------------------------------------------ shop-01 and shop-03

const { storeApplicationPrefill, normalizeSocialInput } = require("@/lib/store-profile");

test("shop-01: the application starts from what the invitation and the signup already said", () => {
  const metadata = { store_name: " Música Sur ", full_name: "Ana", phone: "51999000111", city: "Arequipa", region: "Arequipa" };
  assert.deepEqual(storeApplicationPrefill(metadata, null), {
    name: "Música Sur", contact_person: "Ana", whatsapp_phone: "51999000111", city: "Arequipa", region: "Arequipa",
  });
  // The profile wins (the person may have corrected it); empty values are left out.
  assert.deepEqual(storeApplicationPrefill({ phone: "51911" }, { full_name: "Ana Pérez", phone: "51999", city: "", region: null }),
    { contact_person: "Ana Pérez", whatsapp_phone: "51999" });
  assert.deepEqual(storeApplicationPrefill(undefined, null), {});
});

test("shop-03: a social field takes the handle or the link", () => {
  assert.equal(normalizeSocialInput("instagram_url", "@musicasur"), "https://www.instagram.com/musicasur");
  assert.equal(normalizeSocialInput("tiktok_url", "musicasur"), "https://www.tiktok.com/@musicasur");
  assert.equal(normalizeSocialInput("facebook_url", "facebook.com/musicasur"), "https://facebook.com/musicasur");
  assert.equal(normalizeSocialInput("website_url", "musicasur.pe"), "https://musicasur.pe");
  assert.equal(normalizeSocialInput("website_url", "https://musicasur.pe/"), "https://musicasur.pe/");
  assert.equal(normalizeSocialInput("instagram_url", "  "), "");
});

test("shop-03: Mi tienda splits the public profile from the company data and warns before a RUC change", () => {
  const form = read("components/store-registration-form.tsx");
  assert.match(form, /Perfil público/);
  assert.match(form, /Datos de la empresa/);
  assert.match(form, /hasPaymentMethods/);
  const page = read("app/mi-cuenta/tienda/page.tsx");
  assert.match(page, /storeApplicationPrefill\(user\.user_metadata, profile\)/);
  assert.match(page, /"approved", "pending_review"/, "only methods a RUC change sends back to review count");
  assert.match(page, /Ver mi página/);
  assert.match(page, /\/mi-cuenta\/tienda\/valores-por-defecto/);
});

// ------------------------------------------------------------------ shop-05 and stock-21

const { listingLimitMessage, allowanceLevel, ALLOWANCE_NAME } = require("@/lib/store-allowance");

test("shop-05: one name for the allowance, and the limit message says what to do", () => {
  assert.equal(ALLOWANCE_NAME, "Cupo de publicaciones");
  assert.match(listingLimitMessage("STORE_INVENTORY_LIMIT_REACHED: La tienda ya tiene 80 publicaciones concurrentes."), /cupo de publicaciones \(80\).*pedir más cupo/);
  assert.equal(allowanceLevel(10, 50), "ok");
  assert.equal(allowanceLevel(40, 50), "near");
  assert.equal(allowanceLevel(50, 50), "full");
  assert.equal(allowanceLevel(3, 0), "full");
  for (const file of ["app/mi-cuenta/page.tsx", "app/mi-cuenta/tienda/publicar/page.tsx", "app/mi-cuenta/tienda/inventario/page.tsx"]) {
    assert.doesNotMatch(read(file), /publicaciones concurrentes|Inventario concurrente|posiciones concurrentes/, file);
  }
  const meter = read("components/store-allowance-meter.tsx");
  assert.match(meter, /role="meter"/);
  assert.match(meter, /hide_out_of_stock_store_listings/);
  assert.match(meter, /Pedir más cupo/);
});

test("stock-21: a store without inventory can ask for it, from Mi tienda and from the import page", () => {
  const access = read("components/store-inventory-access.tsx");
  assert.match(access, /Lleva tu stock en Laria/);
  assert.match(access, /Solicitar acceso/);
  assert.match(access, /request_store_admin_help/);
  assert.match(read("app/mi-cuenta/tienda/inventario/importar/page.tsx"), /<StoreInventoryAccess/);
  assert.match(read("components/admin-store-requests.tsx"), /admin_set_store_inventory_enabled/);
});

// ------------------------------------------------------------------ stock-12, stock-13, stock-22, stock-10

const { importExpiresAt, importExpiryText } = require("@/lib/store-import/labels");

test("stock-22: an open import says when it expires, and can be discarded from the notice", () => {
  assert.equal(importExpiresAt("2026-10-19T10:00:00Z").toISOString(), "2026-10-26T10:00:00.000Z");
  assert.equal(importExpiryText("2026-10-19T10:00:00Z"), "Vence el 26 de octubre si no la continúas.");
  assert.match(read("app/mi-cuenta/tienda/inventario/importar/page.tsx"), /<ImportDiscardButton/);
  assert.match(read("components/store-import/import-discard.tsx"), /Descartar y empezar otra/);
});

test("stock-12: a failing cell is corrected in the review, and a whole filter can be excluded", () => {
  assert.deepEqual(parseImportAction({ action: "edit_cell", row: 4, field: "unit_price_pen", value: "120", version: 3 }),
    { action: "edit_cell", row: 4, field: "unit_price_pen", value: "120", version: 3 });
  assert.equal(parseImportAction({ action: "edit_cell", row: 4, field: "unit_price_pen", value: "120" }), null, "needs the version");
  assert.equal(parseImportAction({ action: "edit_cell", row: 0, field: "sku", value: "x", version: 1 }), null);
  assert.equal(parseImportAction({ action: "edit_cell", row: 2, field: "SKU; drop", value: "x", version: 1 }), null);
  assert.equal(parseImportAction({ action: "edit_cell", row: 2, field: "sku", value: "x".repeat(2001), version: 1 }), null);
  const wizard = read("components/store-import/import-wizard.tsx");
  assert.match(wizard, /function CellFixer/);
  assert.match(wizard, /Excluir todas estas filas/);
  assert.match(read("app/api/store/imports/[id]/rows/route.ts"), /numbers/);
});

test("stock-13: the photo session opens the phone camera and attaches each shot to the SKU on screen", () => {
  const photos = read("components/store-import/import-photos.tsx");
  assert.match(photos, /capture="environment"/);
  assert.match(photos, /accept="image\/\*"/);
  assert.match(photos, /action: "place", assetId, row/);
  assert.match(photos, /Empezar sesión de fotos/);
});

test("stock-10: Inventario's bulk bar publishes the selected SKU through the import's publication step", () => {
  assert.match(read("components/inventory/inventory-table.tsx"), /<PublishSelectedButton itemIds=\{selectedItems\.filter\(\(item\) => !item\.listing/);
  assert.match(read("app/api/store/imports/publish-selection/route.ts"), /create_inventory_publish_selection/);
  // A selection batch is not an import: it stays out of the history and the import-errors tile.
  assert.match(read("app/mi-cuenta/tienda/inventario/importar/page.tsx"), /\.is\("options->>source", null\)/);
  assert.match(read("lib/store-inventory.ts"), /\.is\("options->>source", null\)/);
});
