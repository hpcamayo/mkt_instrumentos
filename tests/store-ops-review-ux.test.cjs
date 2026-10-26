// Store Operations review fixes, store screens (docs/store-operations/review-fixes.md, section B): the import guide (B1),
// the publish result (B2), category chips (B3, B4), "Completar datos" (B5), Pagos (B6) and the linked-SKU hint (B7).
// The database side is tests/store-ops-review-ux.sql. Runs with `pnpm test`.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const load = Module._load;
Module._load = function stubServerOnly(request, ...rest) {
  if (request === "server-only") return {};
  if (request === "@/lib/supabase/admin-client") return { getSupabaseAdminClient: () => null };
  return load.call(this, request, ...rest);
};

const read = (file) => fs.readFileSync(file, "utf8");
const { IMPORT_COLUMN_GROUPS, IMPORT_FILE_RULES, columnGuideText } = require("@/lib/store-import/columns-guide");
const { IMPORT_FIELDS } = require("@/lib/store-import/mapping");
const { IMPORT_MAX_DATA_ROWS } = require("@/lib/store-import/limits");
const { templateColumns } = require("@/lib/store-import/template");
const { IMPORT_NO_CATEGORY, importCategoryChips } = require("@/lib/store-import/labels");
const { planPublication, applyPublishFields } = require("@/lib/store-import/publication");
const { parsePublishFieldsRequest } = require("@/lib/store-import/publication-server");
const { getAccountNavigationItems, accountItemIsActive } = require("@/lib/account-navigation");
const { PAYMENT_PROVIDER_OPTIONS } = require("@/lib/payment-methods");

const migration = read("supabase/migrations/20261030120000_store_review_fixes_ux.sql");

// ------------------------------------------------------------------ B1

test("B1: the import guide names every column once, in one of three groups", () => {
  const listed = IMPORT_COLUMN_GROUPS.flatMap((group) => group.columns.map((column) => column.key));
  assert.deepEqual([...listed].sort(), IMPORT_FIELDS.map((field) => field.key).sort());
  assert.equal(new Set(listed).size, listed.length);
  const byGroup = Object.fromEntries(IMPORT_COLUMN_GROUPS.map((group) => [group.requirement, group.columns.map((column) => column.key)]));
  assert.deepEqual(byGroup.create, ["product_name", "quantity"]);
  assert.deepEqual(byGroup.publish, ["brand", "model", "category", "instrument_type", "condition", "description", "unit_price_pen"]);
  assert.match(IMPORT_COLUMN_GROUPS.find((group) => group.requirement === "publish").extra, /De 2 a 10 fotos/);
});

test("B1: the file rules state formats, size, rows and what is not accepted", () => {
  const rules = IMPORT_FILE_RULES.join(" ");
  assert.match(rules, /Excel \(\.xlsx\) o CSV/);
  assert.match(rules, new RegExp(`Hasta \\d+ MB y ${IMPORT_MAX_DATA_ROWS} filas`));
  assert.match(rules, /No se aceptan \.xls antiguos ni archivos con macros \(\.xlsm\)/);
  assert.match(rules, /Las fotos no van dentro del archivo/);
});

test("B1: the template's instructions sheet says the same as the page", () => {
  assert.equal(columnGuideText("quantity"), "Obligatoria para crear un SKU. Total contado de unidades, de 0 a 100000.");
  assert.match(columnGuideText("brand"), /^Necesaria para publicar\./);
  assert.match(columnGuideText("sku"), /^Opcional\./);
  assert.equal(columnGuideText("attribute:body_type"), null);
  for (const column of templateColumns(null)) assert.equal(column.help, columnGuideText(column.key), column.key);
});

test("B1: the start page leads with the template download, then the file, then the guide", () => {
  const page = read("app/mi-cuenta/tienda/inventario/importar/page.tsx");
  const order = ["<ImportTemplatePanel", "Sube tu archivo", "<ImportFileGuide"].map((marker) => page.indexOf(marker));
  assert.ok(order.every((index) => index > 0), order.join(","));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  const guide = read("components/store-import/import-guide.tsx");
  assert.match(guide, /action="\/api\/store\/imports\/template" method="get"/);
  assert.match(guide, /Descargar plantilla Excel \(\.xlsx\)/);
});

// ------------------------------------------------------------------ B2, B3

test("B2: the publish result is a larger notice that takes focus and scrolls into view", () => {
  const publish = read("components/store-import/import-publish.tsx");
  assert.match(publish, /element\.focus\(\{ preventScroll: true \}\)/);
  assert.match(publish, /scrollIntoView\(\{ behavior: reduce \? "auto" : "smooth", block: "center" \}\)/);
  assert.match(publish, /prefers-reduced-motion: reduce/);
  assert.match(publish, /noticeClassName\(tone, "gap-4 p-5 sm:p-6/);
});

test("B3: category chips follow the taxonomy order, with Sin categoría last", () => {
  assert.deepEqual(importCategoryChips({ pedals: 3, none: 2, guitars: 5 }), [
    { value: "guitars", label: "Guitarras", count: 5 },
    { value: "pedals", label: "Pedales", count: 3 },
    { value: IMPORT_NO_CATEGORY, label: "Sin categoría", count: 2 },
  ]);
  assert.deepEqual(importCategoryChips({ pedals: 12 }), [], "a single group needs no chips");
  assert.deepEqual(importCategoryChips({ theremins: 4, pedals: 2 }), [], "unknown values are not chips");
  assert.deepEqual(importCategoryChips({}), []);
});

test("B3: the rows route accepts only Laria categories or Sin categoría", () => {
  const route = read("app/api/store/imports/[id]/rows/route.ts");
  assert.match(route, /requested === IMPORT_NO_CATEGORY \|\| categoryOptions\.some\(\(option\) => option\.value === requested\) \? requested : null/);
  const wizard = read("components/store-import/import-wizard.tsx");
  assert.match(wizard, /counts\.total \?\? 0\) > 10 \? actions : null/);
});

// ------------------------------------------------------------------ B4

test("B4: Inventario shows category chips as links that keep the other filters", () => {
  const { InventoryCategoryChips } = require("@/components/inventory/inventory-category-chips");
  const filters = { q: "boss", stock: "all", publication: "", catalog: "", category: "", sort: "updated" };
  const html = renderToStaticMarkup(React.createElement(InventoryCategoryChips, { filters, counts: { pedals: 2, guitars: 1, none: 1 } }));
  assert.match(html, /aria-label="Categorías del inventario"/);
  assert.match(html, /Todas \(4\)/);
  assert.ok(html.indexOf("Guitarras (1)") < html.indexOf("Pedales (2)") && html.indexOf("Pedales (2)") < html.indexOf("Sin categoría (1)"));
  assert.match(html, /href="[^"]*categoria=pedals[^"]*"/);
  assert.match(html, /href="[^"]*q=boss[^"]*categoria=none|href="[^"]*categoria=none[^"]*q=boss/);
  assert.equal(renderToStaticMarkup(React.createElement(InventoryCategoryChips, { filters, counts: { pedals: 4 } })), "", "one group, no chips");
});

test("B4: the SKU's category is a non-key column filled on apply, and the page filter uses it", () => {
  assert.match(migration, /add column category text check \(category is null or public\.listing_taxonomy_is_valid\(category, 'other'\)\)/);
  assert.match(migration, /after update of commit_status on public\.store_import_rows/);
  assert.match(migration, /coalesce\(l\.category, i\.category, 'none'\) = \$5/);
  assert.doesNotMatch(migration, /create index[^;]*category/i);
});

// ------------------------------------------------------------------ B5

const item = { product_name: "Fender Player", variant_label: null, unit_price_pen: null };
const parsed = {
  sku: "GTR-1", product_name: "Fender Player", brand: null, model: "", category: null, instrument_type: null, variant_label: null,
  unit_price_pen: null, quantity: 1, condition: null, description: "Corta", low_stock_threshold: null, external_reference: null,
  photos: null, listing_id: null, attributes: {},
};

test("B5: what is missing comes by field as well as by name, in the same order", () => {
  const plan = planPublication(parsed, item);
  assert.deepEqual(plan.missing, ["marca", "modelo", "categoría", "condición", "descripción de 40 caracteres", "precio"]);
  assert.deepEqual(plan.missingFields, ["brand", "model", "category", "condition", "description", "price"]);
  assert.deepEqual(planPublication({ ...parsed, category: "guitars" }, item).missingFields.includes("instrument_type"), true);
});

test("B5: completed values go over the file's, and the row is held to the same rules", () => {
  const completed = applyPublishFields(parsed, {
    brand: "Fender", model: "Player", category: "guitars", instrument_type: "electric_guitar", condition: "Nuevo",
    description: "Guitarra eléctrica nueva, con funda acolchada y garantía de un año.",
  });
  const plan = planPublication(completed, { ...item, unit_price_pen: 3200 });
  assert.deepEqual(plan.missing, []);
  assert.equal(plan.fields.brand, "Fender");
  assert.equal(plan.fields.instrument_type, "electric_guitar");
  assert.equal(applyPublishFields(parsed, null), parsed);
  assert.equal(applyPublishFields(parsed, { brand: "   " }).brand, null, "blank values do not replace the file's");
  // A new category drops a type that does not belong to it; single-type categories fill it in again.
  const moved = applyPublishFields({ ...parsed, category: "guitars", instrument_type: "electric_guitar" }, { category: "basses" });
  assert.equal(moved.instrument_type, null);
  assert.equal(planPublication({ ...moved, brand: "Fender", model: "P", condition: "Nuevo", description: "x".repeat(40) }, { ...item, unit_price_pen: 1 }).fields.instrument_type, "bass");
});

test("B5: the save request takes known fields, and a price only with the SKU's version", () => {
  assert.deepEqual(parsePublishFieldsRequest({ row: 4, fields: { brand: "Fender" } }), { row: 4, fields: { brand: "Fender" }, price: null, itemVersion: null });
  assert.deepEqual(parsePublishFieldsRequest({ row: 4, price: 1500, itemVersion: 3 }), { row: 4, fields: null, price: 1500, itemVersion: 3 });
  assert.equal(parsePublishFieldsRequest({ row: 4, price: 1500 }), null, "a price needs the version");
  assert.equal(parsePublishFieldsRequest({ row: 4, fields: { title: "Otra" } }), null);
  assert.equal(parsePublishFieldsRequest({ row: 4, fields: { brand: 7 } }), null);
  assert.equal(parsePublishFieldsRequest({ row: 4, fields: {} }), null);
  assert.equal(parsePublishFieldsRequest({ row: 4 }), null, "nothing to save");
  assert.equal(parsePublishFieldsRequest({ row: 0, fields: { brand: "x" } }), null);
  assert.equal(parsePublishFieldsRequest({ row: 4, price: 0, itemVersion: 1 }), null);
  assert.equal(parsePublishFieldsRequest({ row: 4, price: 12.5, itemVersion: 1 }), null);
  assert.equal(parsePublishFieldsRequest(null), null);
});

test("B5: the publish route and the view both read the owner's values; the database stores only text fields", () => {
  const server = read("lib/store-import/publication-server.ts");
  assert.match(server, /applyPublishFields\(parseImportRow\(row\.raw \?\? \[\], session\.column_mapping \?\? \{\}\)\.parsed, row\.publish_fields\)/);
  assert.match(server, /select\("row_number,raw,publish_fields,applied_item_id/);
  assert.match(server, /db\.rpc\("update_inventory_item", \{/);
  assert.match(server, /db\.rpc\("set_store_import_row_publish_fields", \{/);
  assert.match(migration, /limits constant jsonb := '\{"brand":80,"model":80,"category":80,"instrument_type":80,"condition":60,"description":2000\}'/);
  assert.match(migration, /grant execute on function public\.set_store_import_row_publish_fields\(uuid, integer, jsonb\) to authenticated;/);
  const route = read("app/api/store/imports/[id]/publication/fields/route.ts");
  assert.match(route, /photoOwner\(request, id, true\)/);
});

test("B5: Completar datos sits next to Faltan datos and sends photos to that row", () => {
  const publish = read("components/store-import/import-publish.tsx");
  assert.match(publish, /onComplete=\{view\.open && row\.state === "incomplete" && !publishing/);
  assert.match(publish, />\s*Completar datos\s*</);
  const sheet = read("components/store-import/complete-row-sheet.tsx");
  assert.match(sheet, /action: "place", assetId, row/);
  assert.match(sheet, /sendPhotoBatch\(sessionId, batch, new Map\(\)\)/);
  assert.equal(read("components/store-import/import-photos.tsx").includes("sendPhotoBatch(sessionId, batch, manifest)"), true);
});

// ------------------------------------------------------------------ B6

test("B6: Pagos is a store menu entry only while the pilot is on", () => {
  const labels = (items) => items.map((item) => item.label);
  assert.deepEqual(labels(getAccountNavigationItems("store_owner", true)),
    ["Resumen", "Mi tienda", "Inventario", "Publicar", "Pruebas", "Estadísticas", "Favoritos", "Alertas", "Notificaciones", "Compras y ventas", "Perfil y seguridad"]);
  const withPayments = getAccountNavigationItems("store_owner", true, { payments: true });
  assert.deepEqual(labels(withPayments),
    // Effortless Laria, inventory batch (stock-04): "Solicitudes" comes and goes with the pilot too.
    ["Resumen", "Mi tienda", "Inventario", "Publicar", "Pruebas", "Solicitudes", "Pagos", "Estadísticas", "Favoritos", "Alertas", "Notificaciones", "Compras y ventas", "Perfil y seguridad"]);
  assert.equal(labels(getAccountNavigationItems("store_owner", false, { payments: true })).includes("Pagos"), false, "no store, no Pagos");
  assert.equal(labels(getAccountNavigationItems("seller", false, { payments: true })).includes("Pagos"), false);
  const pagos = withPayments.find((item) => item.label === "Pagos");
  assert.equal(accountItemIsActive("/mi-cuenta/tienda/pagos", pagos), true);
  assert.equal(accountItemIsActive("/mi-cuenta/tienda/medios-de-pago", pagos), true);
  assert.equal(accountItemIsActive("/mi-cuenta/tienda/medios-de-pago", withPayments.find((item) => item.label === "Mi tienda")), false);
});

test("B6: the menus read the pilot switch on the server", () => {
  assert.match(read("app/mi-cuenta/layout.tsx"), /const payments = accountType === "store_owner" && Boolean\(store\) && assistedCommerceEnabled\(\);/);
  assert.match(read("app/mi-cuenta/layout.tsx"), /payments=\{payments\}/);
  assert.match(read("app/api/account-navigation/route.ts"), /payments: hasStore && assistedCommerceEnabled\(\)/);
  assert.match(read("components/site-header.tsx"), /getAccountNavigationItems\(accountType, account\.hasStore, \{ payments: account\.payments \}\)/);
});

test("B6: Pagos is hidden with the switch off and the old address forwards to it", () => {
  assert.match(read("app/mi-cuenta/tienda/pagos/page.tsx"), /if \(!assistedCommerceEnabled\(\)\) notFound\(\);/);
  const old = read("app/mi-cuenta/tienda/medios-de-pago/page.tsx");
  assert.ok(old.indexOf("notFound()") < old.indexOf('redirect("/mi-cuenta/tienda/pagos")'));
  assert.match(read("app/mi-cuenta/tienda/page.tsx"), /href="\/mi-cuenta\/tienda\/pagos"/);
});

test("B6: Agregar medio de pago lists the methods not added yet and picks the provider from the database's list", () => {
  const form = read("components/payment/store-payment-methods-form.tsx");
  assert.match(form, /Agregar medio de pago/);
  assert.match(form, /const available = PAYMENT_METHODS\.filter\(\(method\) => !added\.some\(\(row\) => row\.method === method\)\)/);
  assert.match(form, /PAYMENT_PROVIDER_OPTIONS\[method\]/);
  assert.match(form, /<option value="">Sin proveedor<\/option>/);
  assert.doesNotMatch(form, /<Input name="providerLabel"/, "no free-text provider");
  assert.match(form, /Solo lo ven tú y el equipo autorizado de Laria/);
  assert.equal(PAYMENT_PROVIDER_OPTIONS.efectivo_al_recoger.length, 0, "cash has no provider field");
});

test("B6: the Admin decision applies to the revision it was shown", () => {
  const review = read("components/payment/admin-payment-methods-review.tsx");
  assert.match(review, /expectedRevision: row\.revision/);
  assert.doesNotMatch(review, /expectedUpdatedAt/);
});

// ------------------------------------------------------------------ B7

test("B7: the hint is dropped only for rows with nothing to publish", () => {
  assert.match(migration, /new\.planned_action in \('update', 'unchanged', 'adopt_listing'\)/);
  assert.match(migration, /when \(new\.issues @> '\[\{"code":"IMPORT_PUBLICATION_MISSING"\}\]'::jsonb\)/);
  assert.match(migration, /before update of issues, planned_action, target_item_id, target_listing_id on public\.store_import_rows/);
  assert.match(migration, /revoke all on function laria_private\.import_row_drop_linked_publication_hint\(\) from public, anon, authenticated;/);
});
