// Effortless Laria, inventory batch (docs/ux-effortless/inventory.md): the pure parts of the counter (big-10), the
// reorder file (stock-07), the purchase quantity (stock-23), the ready replies (stock-05), saved views and
// "Exportar esta vista" (stock-16, stock-17) and the list position (stock-19). The database side is tests/ux-inventory.sql.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const counter = require(path.resolve("lib/inventory-counter.ts"));
const reorder = require(path.resolve("lib/inventory-reorder.ts"));
const payments = require(path.resolve("lib/payment-methods.ts"));
const inventory = require(path.resolve("lib/store-inventory.ts"));

const source = (file) => fs.readFileSync(path.resolve(file), "utf8");

const item = (overrides = {}) => ({
  id: "i1", merchant_sku: "GT-001", external_reference: "7501234567890", product_name: "Guitarra acústica Yamaha F310",
  variant_label: null, quantity_available: 3, unit_price_pen: 599, version: 1, listing_title: null, ...overrides,
});

test("big-10: a scanned or typed code matches the SKU or the barcode exactly, in any case; words find candidates", () => {
  const items = [item(), item({ id: "i2", merchant_sku: "GT-002", external_reference: null, product_name: "Guitarra eléctrica Fender" })];
  assert.equal(counter.matchCode(items, "gt-001").exact.id, "i1");
  assert.equal(counter.matchCode(items, " 7501234567890 ").exact.id, "i1");
  assert.deepEqual(counter.matchCode(items, "guitarra electrica").options.map((entry) => entry.id), ["i2"]);
  assert.equal(counter.matchCode(items, "").exact, null);
  const twins = [item(), item({ id: "i3", merchant_sku: "OTRO", external_reference: "GT-001" })];
  assert.deepEqual(counter.matchCode(twins, "GT-001").options.map((entry) => entry.id), ["i1", "i3"]);
});

test("big-10: the cart never goes past what is available, and drops a line at zero", () => {
  let { cart, limited } = counter.addToCart([], item());
  assert.equal(limited, false);
  ({ cart, limited } = counter.addToCart(cart, item(), 5));
  assert.equal(cart[0].quantity, 3);
  assert.equal(limited, true);
  assert.equal(counter.cartUnits(cart), 3);
  assert.equal(counter.cartTotal(cart), 1797);
  ({ cart } = counter.addToCart(cart, item(), -3));
  assert.deepEqual(cart, []);
  assert.equal(counter.cartTotal([{ item: item({ unit_price_pen: null }), quantity: 1 }]), null);
});

test("big-10: one sale is one bulk call; only connection problems stay queued for retry", () => {
  const operations = counter.saleOperations({ channel: "tienda_fisica", lines: [{ item_id: "i1", merchant_sku: "GT-001", quantity: 2 }] });
  assert.deepEqual(operations, [{ item_id: "i1", type: "sale", quantity: 2, channel: "tienda_fisica", reference: "Mostrador" }]);
  assert.equal(counter.isConnectionFailure("NETWORK"), true);
  assert.equal(counter.isConnectionFailure("INVENTORY_INSUFFICIENT_STOCK"), false);
  assert.equal(counter.QUEUE_KEY("s1"), "laria:mostrador:cola:s1");
  const storage = { getItem: () => "{no json", setItem: () => { throw new Error("full"); } };
  assert.deepEqual(counter.readJson(storage, "k", []), []);
  assert.doesNotThrow(() => counter.writeJson(storage, "k", [1]));
});

const cells = (...values) => values.map((v) => ({ v: String(v) }));

test("stock-07: the reorder file has the suggestion and an empty received column; re-importing reads it by name", () => {
  const rows = reorder.reorderRows([{ id: "i1", merchant_sku: "GT-001", product_name: "Guitarra", variant_label: null, external_reference: null, quantity_available: 0, low_stock_threshold: 2, sales_30d: 4, suggested: 4, unit_price_pen: 599 }]);
  assert.equal(rows[0].length, reorder.REORDER_HEADERS.length);
  assert.equal(reorder.REORDER_HEADERS.at(-1), "Cantidad recibida");
  assert.equal(rows[0].at(-1), null);

  const headers = ["Cantidad recibida", "Producto", "sku"];
  const parsed = reorder.parseReorderFile(headers, [
    { rowNumber: 2, cells: cells(5, "Guitarra", "GT-001") },
    { rowNumber: 3, cells: cells("", "Bajo", "BJ-001") },
    { rowNumber: 4, cells: cells("dos", "Pedal", "PD-001") },
    { rowNumber: 5, cells: cells(1, "Guitarra", "gt-001") },
  ]);
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.lines, [{ row: 2, sku: "GT-001", quantity: 5 }]);
  assert.deepEqual(parsed.problems.map((problem) => problem.row), [4, 5]);
  assert.match(reorder.parseReorderFile(["SKU"], []).error, /Cantidad recibida/);
  const formula = reorder.parseReorderFile(["SKU", "Cantidad recibida"], [{ rowNumber: 2, cells: [{ v: "GT-001" }, { v: "3", f: 1 }] }]);
  assert.equal(formula.lines.length, 0);
});

test("stock-23: the purchase quantity stays between 1 and what may be asked, and only changes the message", () => {
  assert.equal(payments.clampPurchaseQuantity(4, 3), 3);
  assert.equal(payments.clampPurchaseQuantity(0, 3), 1);
  assert.equal(payments.clampPurchaseQuantity("2", 3), 1);
  assert.equal(payments.clampPurchaseQuantity(50, 99), payments.PURCHASE_MAX_QUANTITY);
  assert.match(payments.buildPurchaseMessage({ title: "Bajo", slug: "bajo" }, "BJ-1", 2), /Cantidad: 2/);
  const href = `https://wa.me/51999999999?text=${encodeURIComponent(payments.buildPurchaseMessage({ title: "Bajo", slug: "bajo" }, null))}`;
  assert.match(payments.withPurchaseQuantity(href, 3), /Cantidad%3A%203/);
  assert.doesNotMatch(source("components/payment/purchase-request-link.tsx"), /quantity_available|disponibles/);
});

test("stock-05: ready replies name approved methods, the holder and pickup details, never numbers or links", () => {
  const replies = payments.readyReplies(
    { name: "Música Lima", address: "Av. Arequipa 100", district: "Miraflores", city: "Lima", pickup_hours: "Lun a sáb, 10 a. m. a 7 p. m." },
    [{ method: "yape_plin", provider_label: null, holder_name: "Ana Pérez" }, { method: "efectivo_al_recoger", provider_label: null, holder_name: null }],
  );
  const shortcuts = replies.map((reply) => reply.shortcut);
  assert.ok(shortcuts.includes("/disponible") && shortcuts.includes("/recojo") && shortcuts.includes("/yape"));
  const text = replies.map((reply) => reply.text).join("\n");
  assert.match(text, /Ana Pérez/);
  assert.match(text, /Av\. Arequipa 100, Miraflores, Lima/);
  assert.doesNotMatch(text, /https?:\/\/|wa\.me|\b\d{6,}\b/);
  assert.ok(!payments.readyReplies({ name: "X", address: null, district: null, city: null, pickup_hours: null }, []).some((reply) => reply.shortcut === "/yape"));
});

test("stock-16 and stock-17: a view's export link carries its filters; saved views compare by filters", () => {
  const filters = inventory.viewFilters({ stock: "out", publication: "published", q: "fender" });
  const vista = new URL(`https://laria.test${inventory.exportViewHref(filters, "xlsx", true)}`).searchParams;
  assert.equal(vista.get("publicacion"), "1");
  assert.deepEqual(JSON.parse(Buffer.from(vista.get("vista"), "base64url").toString("utf8")), inventory.filtersForRpc(filters));
  assert.deepEqual(inventory.filtersFromRpc(inventory.filtersForRpc(filters)), { ...filters, catalog: "" });
  assert.ok(inventory.sameFilters(filters, { ...filters, q: " fender " }));
  assert.ok(!inventory.sameFilters(filters, inventory.DEFAULT_FILTERS));
  assert.ok(inventory.BUILT_IN_VIEWS.some((view) => view.name === "Sin precio" && view.filters.price === "none"));
});

test("stock-19: the list says where you are", () => {
  assert.equal(inventory.pageRange({ items: new Array(50), total: 312, offset: 50 }), "51–100 de 312");
  assert.equal(inventory.pageRange({ items: [], total: 0, offset: 0 }), "0 de 0");
});

test("stock-04 and stock-06: the new screens and notification are reachable", () => {
  assert.match(source("lib/account-navigation.ts"), /\/mi-cuenta\/tienda\/solicitudes/);
  assert.match(source("components/notifications-list.tsx"), /store_stock_summary: "Resumen de stock"/);
  assert.match(source("app/mi-cuenta/tienda/inventario/page.tsx"), /InventorySettingsButton/);
  for (const page of ["mostrador", "reponer", "precios"]) assert.ok(fs.existsSync(path.resolve(`app/mi-cuenta/tienda/inventario/${page}/page.tsx`)), page);
});
