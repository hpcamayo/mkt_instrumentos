// Effortless Laria, inventory batch (docs/ux-effortless/inventory.md): the Inventario fixes and ideas that can be
// checked without a database. The SQL rules are in tests/ux-inventory-fixes.sql and tests/ux-inventory.sql.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const load = (file) => require(path.join(root, file));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const summary = {
  inventory_enabled: true, can_write: true, store_status: "active", skus: 10, archived: 0, units: 40, available_units: 40,
  low_stock: 1, out_of_stock: 2, unlinked: 3, published: 5, hidden: 0, in_review: 2, rejected: 1,
  sales_30d_units: 4, sales_30d_count: 3, recent_movements: [],
};

// ------------------------------------------------------------------ fixes

test("fix-06: the search box filters as the owner types and names what it searches", () => {
  const source = read("components/inventory/inventory-toolbar.tsx");
  assert.match(source, /onChange=\{\(event\) => searchAsYouType\(event\.target\.value\)\}/);
  assert.match(source, /router\.replace\(inventoryHref\(\{ \.\.\.filters, q \}\)/, "typing replaces the URL instead of stacking history");
  assert.match(source, /placeholder="SKU, marca, modelo, nombre o código"/);
  const sql = read("supabase/migrations/20261107120000_ux_inventory_search.sql");
  for (const field of ["i.variant_label", "i.external_reference", "l.title", "l.brand", "l.model"]) assert.ok(sql.includes(field), field);
});

test("fix-09: the catalog filter is hidden and ignored until catalog matching exists", () => {
  const inventory = load("lib/store-inventory.ts");
  assert.equal(inventory.CATALOG_MATCHING_AVAILABLE, false);
  const { filters } = inventory.parseInventoryFilters({ catalogo: "matched" });
  assert.equal(filters.catalog, "", "an old catalogo= link no longer filters silently");
  assert.equal(inventory.activeFilterCount(filters), 0);
  assert.doesNotMatch(read("app/mi-cuenta/tienda/inventario/[itemId]/page.tsx"), /La coincidencia con el catálogo llega/);
});

test("fix-09: the En revisión tile opens what it counts, and rejected publications have their own tile", () => {
  const { InventorySummaryTiles } = load("components/inventory/inventory-summary.tsx");
  const html = renderToStaticMarkup(React.createElement(InventorySummaryTiles, { summary }));
  assert.match(html, /href="\/mi-cuenta\/tienda\/inventario\?publicacion=in_review"/);
  assert.match(html, /href="\/mi-cuenta\/tienda\/inventario\?publicacion=rejected"/);
  assert.doesNotMatch(html, /publicacion=pending/);
  const none = renderToStaticMarkup(React.createElement(InventorySummaryTiles, { summary: { ...summary, rejected: 0 } }));
  assert.doesNotMatch(none, /Rechazadas/, "no rejected tile when there is nothing to fix");
  const { parseInventoryFilters } = load("lib/store-inventory.ts");
  assert.equal(parseInventoryFilters({ publicacion: "in_review" }).filters.publication, "in_review");
});
