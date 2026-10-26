// Feature ideas, store-floor batch (docs/feature-ideas/store-floor.md): labels (reach-10), "Por llegar" (reach-08),
// warranty and returns (reach-09) and try-outs (buy-07). Database behavior is in tests/store-floor.sql; the QR and
// Code 128 output was also checked with a real decoder (zxing) for every version and mask, see the write-up.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const load = (file) => require(path.resolve(file));
const read = (file) => fs.readFileSync(file, "utf8");
const { qrModules, qrVersionFor, qrSvgPath, QR_MAX_BYTES } = load("lib/labels/qr.ts");
const { code128Values, code128Widths, canEncodeCode128 } = load("lib/labels/code128.ts");
const { LABEL_FORMATS, labelFormat, labelsPerPage, paginate, layoutLabel, wrapText } = load("lib/labels/sheets.ts");
const dates = load("lib/store-floor/dates.ts");
const arrivals = load("lib/store-floor/arrivals.ts");
const warranty = load("lib/store-floor/warranty.ts");
const tryouts = load("lib/store-floor/tryouts.ts");

// ------------------------------------------------------------------ reach-10 labels

test("QR: the smallest version that fits, finder patterns in three corners, nothing past 213 bytes", () => {
  assert.equal(qrVersionFor("A"), 1);
  assert.equal(qrVersionFor("https://laria.audio/tiendas/sf-a"), 3);
  assert.equal(qrVersionFor("x".repeat(QR_MAX_BYTES)), 10);
  assert.equal(qrVersionFor("x".repeat(QR_MAX_BYTES + 1)), null);
  assert.throws(() => qrModules("x".repeat(QR_MAX_BYTES + 1)), /QR_TOO_LONG/);
  for (const text of ["A", "https://laria.audio/instrumentos/0a1b2c3d-0000-4000-8000-000000000001", "ñandú 🎸", "y".repeat(150)]) {
    const modules = qrModules(text);
    const size = modules.length;
    assert.equal(size, qrVersionFor(text) * 4 + 17);
    assert.ok(modules.every((row) => row.length === size));
    for (const [x, y] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
      const ring = [0, 1, 2, 3, 4, 5, 6].map((i) => modules[y][x + i]);
      assert.deepEqual(ring, [true, true, true, true, true, true, true], `finder at ${x},${y}`);
      assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((i) => modules[y + 1][x + i]), [true, false, false, false, false, false, true]);
      assert.equal(modules[y + 3][x + 3], true);
    }
    // The dark module next to the bottom-left finder.
    assert.equal(modules[size - 8][8], true);
  }
  const { path: svgPath, size } = qrSvgPath(qrModules("A"));
  assert.equal(size, 29);
  assert.match(svgPath, /^M4 4h7v1h-7z/);
});

test("Code 128: set B for text, set C for digit runs, the standard checksum and the stop bar", () => {
  assert.deepEqual(code128Values("SF-GTR"), [104, 51, 38, 13, 39, 52, 50, 59]);
  assert.deepEqual(code128Values("1234567890"), [105, 12, 34, 56, 78, 90, 85]);
  // A long run of digits switches to C (keeping the odd digit in B); a short one stays in B.
  assert.deepEqual(code128Values("A1234567").slice(0, 4), [104, 33, 17, 99]);
  assert.deepEqual(code128Values("A12").slice(0, 4), [104, 33, 17, 18]);
  for (const text of ["SF-GTR", "1234567890", "GTR-001/rojo", "~!@# $%^&*()_+{}|:<>?"]) {
    const widths = code128Widths(text);
    // Every symbol is 11 modules, the stop 13.
    assert.equal(widths.reduce((sum, value) => sum + value, 0), (code128Values(text).length) * 11 + 13);
    assert.equal(widths.length % 2, 1, "starts and ends with a bar");
  }
  assert.equal(canEncodeCode128("GUITARRA-ÑANDÚ"), false);
  assert.equal(canEncodeCode128(""), false);
  assert.throws(() => code128Values("Ñ"), /CODE128_UNSUPPORTED/);
});

test("label sheets: four formats, a started sheet skips its used labels, and SKUs that cannot be barcodes say so", () => {
  assert.deepEqual(LABEL_FORMATS.map((format) => labelsPerPage(format)), [24, 14, 40, 1]);
  for (const format of LABEL_FORMATS) {
    const right = format.margin.left + format.columns * format.label.width + (format.columns - 1) * format.gap.x;
    const bottom = format.margin.top + format.rows * format.label.height + (format.rows - 1) * format.gap.y;
    assert.ok(right <= format.page.width + 0.01 && bottom <= format.page.height + 0.01, `${format.key} fits its page`);
  }
  assert.equal(labelFormat("nada").key, "a4-24");
  const pages = paginate(Array.from({ length: 30 }, (_, i) => i), labelFormat("a4-24"), 5);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[0].slice(0, 6), [null, null, null, null, null, 0]);
  assert.equal(pages[1].length, 11);
  const item = { name: "Fender Player Stratocaster HSS Sunburst con funda", detail: "Sunburst", price: "S/ 3,500", sku: "SF-GTR", url: "https://laria.audio/instrumentos/fender-player" };
  for (const format of LABEL_FORMATS) {
    const layout = layoutLabel(item, format, { price: true, barcode: true, qr: true });
    assert.ok(layout.barcode && layout.qr && layout.price, format.key);
    assert.ok(layout.barcode.module >= 0.19, `${format.key}: bars wide enough to scan`);
    assert.ok(layout.qr.x + layout.qr.size <= format.label.width && layout.price.y <= layout.barcode.y, `${format.key}: nothing overlaps`);
  }
  const accented = layoutLabel({ ...item, sku: "GUITARRA-ÑANDÚ" }, labelFormat("a4-24"), { price: true, barcode: true, qr: false });
  assert.equal(accented.barcode, null);
  assert.equal(accented.barcodeSkipped, true);
  assert.match(accented.detail.text, /GUITARRA-ÑANDÚ/);
  assert.deepEqual(wrapText("Guitarra eléctrica Fender Player", 30, 3, 2), ["Guitarra eléctrica", "Fender Player"]);
  assert.deepEqual(wrapText("Guitarra eléctrica Fender Player", 20, 3, 2), ["Guitarra", "eléctrica…"]);
});

test("labels are reachable from Inventario (bulk bar, SKU page, footer) and the poster from Mi tienda", () => {
  assert.match(read("components/inventory/inventory-table.tsx"), /\/mi-cuenta\/tienda\/etiquetas\?ids=/);
  assert.match(read("components/inventory/inventory-table.tsx"), /\/mi-cuenta\/tienda\/etiquetas\?lista=/);
  assert.match(read("app/mi-cuenta/tienda/inventario/[itemId]/page.tsx"), /Imprimir etiqueta/);
  assert.match(read("app/mi-cuenta/tienda/inventario/page.tsx"), /\/mi-cuenta\/tienda\/etiquetas"/);
  assert.match(read("components/store-floor/store-floor-panel.tsx"), /\/mi-cuenta\/tienda\/etiquetas\/cartel/);
});

// ------------------------------------------------------------------ dates

test("dates follow Lima's calendar and read as people say them", () => {
  assert.equal(dates.limaToday(Date.UTC(2026, 11, 15, 3, 0)), "2026-12-14");
  assert.equal(dates.addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(dates.shortDate("2026-12-15", "2026-10-26"), "15/12");
  assert.equal(dates.shortDate("2027-01-05", "2026-10-26"), "5/01/2027");
  assert.equal(dates.longDate("2026-09-14", "2026-01-01"), "14 de setiembre");
  assert.equal(dates.dayLabel("2026-10-27", "2026-10-26"), "mañana");
  assert.equal(dates.whenLabel("2026-12-12T16:00:00Z"), "sábado 12 de diciembre, 11:00 a. m.");
  assert.equal(dates.whenLabel("2026-09-14T17:00:00Z"), "lunes 14 de setiembre, 12:00 p. m.");
  assert.equal(dates.isIsoDate("2026-02-30"), false);
});

// ------------------------------------------------------------------ reach-08 Por llegar

test("Por llegar: dates from today to a year ahead, and the listing says it is an estimate", () => {
  assert.equal(arrivals.validArrivalDate("2026-10-26", "2026-10-26"), true);
  assert.equal(arrivals.validArrivalDate("2026-10-25", "2026-10-26"), false);
  assert.equal(arrivals.validArrivalDate("2027-10-27", "2026-10-26"), false);
  assert.equal(arrivals.arrivalTag("2026-12-15", "2026-10-26"), "Por llegar · 15/12");
  assert.match(arrivals.restockNote("2026-12-15", "2026-10-26"), /15 de diciembre \(fecha estimada\)/);
  assert.match(arrivals.restockNote(null), /^Sin unidades disponibles/);
  assert.deepEqual(arrivals.arrivalPresets("2026-10-26").map((preset) => preset.value), ["2026-11-02", "2026-11-09", "2026-11-25"]);
  const { inventoryCall } = load("lib/inventory-actions.ts");
  const id = "5f100000-0000-4000-8000-000000000001";
  assert.deepEqual(inventoryCall({ action: "arrival", item_ids: [id], expected_on: "2026-12-15" }), { fn: "set_inventory_arrival", args: { p_item_ids: [id], p_expected_on: "2026-12-15" } });
  assert.deepEqual(inventoryCall({ action: "arrival", item_ids: [id], expected_on: null }).args.p_expected_on, null);
  assert.equal(inventoryCall({ action: "arrival", item_ids: [id], expected_on: "15/12" }), null);
  const listing = read("app/instrumentos/[slug]/page.tsx");
  assert.match(listing, /restock_expected_on,/);
  assert.match(listing, /arriving=\{Boolean\(listing\.restock_expected_on\)\}/);
  assert.match(read("components/listing/listing-viewer.tsx"), /Avísame cuando llegue/);
});

// ------------------------------------------------------------------ reach-09 warranty and returns

test("warranty and returns read as the store's promise, and only what the store said is shown", () => {
  assert.equal(warranty.conditionGroup("Nuevo"), "new");
  assert.equal(warranty.conditionGroup("Exhibición o caja abierta"), "open_box");
  assert.equal(warranty.conditionGroup("Muy bueno"), "used");
  assert.equal(warranty.conditionGroup(null), null);
  assert.equal(warranty.warrantyLine({ warranty_months: 12, warranty_provider: "brand" }), "Garantía de 12 meses de la marca");
  assert.equal(warranty.warrantyLine({ warranty_months: 1, warranty_provider: "store" }), "Garantía de 1 mes de la tienda");
  assert.equal(warranty.warrantyLine({ warranty_months: 0 }), "Sin garantía adicional de la tienda");
  assert.equal(warranty.warrantyLine({ warranty_months: null }), null);
  assert.equal(warranty.returnsLine({ returns_days: 7, returns_note: "con boleta" }), "Cambios hasta 7 días después de la compra: con boleta");
  assert.equal(warranty.returnsLine({ returns_days: 0 }), "No acepta cambios ni devoluciones");
  assert.equal(warranty.hasWarranty({ warranty_months: 0 }), false);
  assert.equal(warranty.termsSummary({ warranty_months: 12, warranty_provider: "brand", returns_days: 7 }), "Garantía 12 meses (marca) · cambios 7 días");
  assert.deepEqual(warranty.termsPayload({ warranty: "12", provider: "brand", returns: "7", note: "  con   boleta " }), { warranty_months: 12, warranty_provider: "brand", returns_days: 7, returns_note: "con boleta" });
  assert.deepEqual(warranty.termsPayload({ warranty: "0", provider: "brand", returns: "0", note: "x" }), { warranty_months: 0, returns_days: 0 });
  assert.deepEqual(warranty.termsPayload({ warranty: "", provider: "store", returns: "", note: "" }), {});
  assert.equal(warranty.termsErrorMessage("STORE_TERMS_WARRANTY_RANGE: La garantía va de 0 a 60 meses."), "La garantía va de 0 a 60 meses.");
  assert.equal(warranty.termsErrorMessage("boom"), "No pudimos guardar. Intenta nuevamente.");
  assert.match(read("components/store-floor/store-terms.tsx"), /no Laria/);
  const { listingFlagFilters } = load("lib/listing-flags.ts");
  assert.ok(listingFlagFilters.some((filter) => filter.flag === "con_garantia" && filter.label === "Con garantía"));
});

// ------------------------------------------------------------------ buy-07 try-outs

test("try-outs: slots grouped by Lima day, hours summarized, a second range never overlaps", () => {
  const days = tryouts.groupSlots(["2026-10-26T15:00:00Z", "2026-10-26T15:30:00Z", "2026-10-27T04:30:00Z", "2026-10-27T14:00:00Z"], "2026-10-26");
  assert.deepEqual(days.map((day) => [day.label, day.times.map((time) => time.label)]), [
    ["hoy", ["10:00 a. m.", "10:30 a. m.", "11:30 p. m."]],
    ["mañana", ["9:00 a. m."]],
  ]);
  const hours = { "1": [["10:00", "19:00"]], "2": [["10:00", "19:00"]], "3": [["10:00", "19:00"]], "6": [["10:00", "14:00"]] };
  assert.equal(tryouts.hoursSummary(hours), "Lun a mié 10:00 a. m. – 7:00 p. m. · Sáb 10:00 a. m. – 2:00 p. m.");
  assert.equal(tryouts.hoursSummary({}), "Sin horario");
  assert.deepEqual(tryouts.splitForSecondRange(["10:00", "19:00"]), [["10:00", "13:00"], ["15:00", "19:00"]]);
  assert.deepEqual(tryouts.splitForSecondRange(["09:00", "12:00"]), [["09:00", "12:00"], ["13:00", "15:00"]]);
  assert.deepEqual(tryouts.splitForSecondRange(["15:00", "23:00"]), [["15:00", "23:00"]]);
  assert.equal(tryouts.QUARTER_HOURS[0], "06:00");
  assert.equal(tryouts.QUARTER_HOURS.at(-1), "23:00");
  assert.equal(tryouts.tryoutStatusLabel({ status: "cancelled", cancelled_by: "buyer" }, "store"), "Cancelada por el cliente");
  assert.equal(tryouts.tryoutErrorMessage("TRYOUT_SLOT_TAKEN: Alguien acaba de reservar ese horario. Elige otro."), "Alguien acaba de reservar ese horario. Elige otro.");
  assert.equal(tryouts.tryoutErrorCode("TRYOUT_SLOT_TAKEN: x"), "TRYOUT_SLOT_TAKEN");
  const key = tryouts.newTryoutKey();
  assert.ok(key.length >= 8 && key.length <= 100);
});

test("try-outs: prefilled WhatsApp messages and a calendar file for a confirmed try-out", () => {
  const tryout = {
    id: "5f400000-0000-4000-8000-000000000001", store_id: "s", listing_id: "l", listing_title: "Pedal de chorus", listing_slug: "pedal-de-chorus",
    buyer_user_id: "b", buyer_name: "Ana", buyer_phone: "51987654321", buyer_note: null, starts_at: "2026-12-12T16:00:00Z", ends_at: "2026-12-12T16:30:00Z",
    status: "confirmed", cancelled_by: null, store_reason: null, created_at: "2026-12-01T00:00:00Z", when_label: "",
    store: { name: "Tienda Piso A", slug: "sf-a", whatsapp_phone: "51999994101", public_address: "Av. Prueba 1", district: "Miraflores", city: "Lima" },
  };
  const toBuyer = decodeURIComponent(tryouts.storeWhatsAppHref(tryout));
  assert.match(toBuyer, /^https:\/\/wa\.me\/51987654321\?text=Hola Ana, te esperamos el sábado 12 de diciembre, 11:00 a\. m\. en Tienda Piso A/);
  assert.match(decodeURIComponent(tryouts.buyerWhatsAppHref(tryout)), /^https:\/\/wa\.me\/51999994101\?text=Hola, reservé en Laria una prueba de Pedal de chorus/);
  const ics = decodeURIComponent(tryouts.tryoutCalendarHref(tryout, "https://laria.audio").replace(/^data:text\/calendar;charset=utf-8,/, ""));
  assert.match(ics, /VERSION:2\.0/);
  assert.match(ics, /DTSTART:20261212T160000Z/);
  assert.match(ics, /LOCATION:Av\. Prueba 1\\, Miraflores\\, Lima/);
  assert.equal(tryouts.storePlace(tryout.store), "Av. Prueba 1, Miraflores, Lima");
});

test("try-outs: notices open each side's list, and every try-out e-mail has a template", () => {
  const { notificationHref, notificationLabel } = load("lib/notifications.ts");
  assert.equal(notificationHref({ event_type: "listing_tryout_confirmed", listing_id: "l", store_id: "s" }), "/mi-cuenta/pruebas");
  assert.equal(notificationHref({ event_type: "store_tryout_requested", listing_id: "l", store_id: "s" }), "/mi-cuenta/tienda/pruebas");
  assert.equal(notificationHref({ event_type: "store_arrival_estimate_passed", listing_id: null, store_id: "s" }), "/mi-cuenta/tienda/inventario?stock=out");
  for (const type of ["store_tryout_requested", "store_tryout_cancelled", "listing_tryout_confirmed", "listing_tryout_declined", "listing_tryout_cancelled", "listing_tryout_reminder", "store_arrival_estimate_passed"]) {
    assert.notEqual(notificationLabel(type), "Actualización de tu cuenta", type);
  }
  const { renderMarketplaceEmail } = load("lib/email/templates.ts");
  const base = { delivery_id: "d", attempt_count: 0, recipient_email: "a@example.invalid", recipient_name: "Ana", listing: { title: "Pedal de chorus", slug: "pedal-de-chorus", price_pen: 400 }, store: { name: "Tienda Piso A", slug: "sf-a" }, transaction: null, search_alert: null };
  for (const type of ["store_tryout_requested", "store_tryout_cancelled", "listing_tryout_confirmed", "listing_tryout_declined", "listing_tryout_cancelled", "listing_tryout_reminder"]) {
    const email = renderMarketplaceEmail({ ...base, event_type: type, context: { reason: "sábado 12 de diciembre, 11:00 a. m. · Motivo: Cerramos temprano." } }, "https://laria.audio");
    assert.match(email.text, /sábado 12 de diciembre, 11:00 a\. m\./, type);
    assert.match(email.text, /Este es un correo transaccional/, type);
  }
  const declined = renderMarketplaceEmail({ ...base, event_type: "listing_tryout_declined", context: { reason: "sábado 12 de diciembre, 11:00 a. m. · Motivo: Cerramos temprano." } }, "https://laria.audio");
  assert.match(declined.text, /Motivo de la tienda: Cerramos temprano\./);
  assert.match(declined.destination, /\/instrumentos\/pedal-de-chorus#prueba$/);
});

test("try-outs: the booking only shows on a store's available listing, and the job is behind CRON_SECRET", () => {
  const listing = read("app/instrumentos/[slug]/page.tsx");
  assert.match(listing, /isStore && store && listing\.store_id && !outOfStock \? \(\s*<Suspense fallback=\{null\}>\s*<TryoutEntry/);
  assert.match(read("components/store-floor/tryout-entry.tsx"), /\.from\("store_tryout_settings"\)/);
  const job = read("app/api/internal/jobs/store-floor/route.ts");
  assert.match(job, /CRON_SECRET/);
  assert.match(job, /timingSafeEqual/);
  assert.match(job, /rpc\("run_store_floor_daily"\)/);
  const { getAccountNavigationItems, accountItemIsActive } = load("lib/account-navigation.ts");
  const store = getAccountNavigationItems("store_owner", true);
  assert.ok(store.some((item) => item.href === "/mi-cuenta/tienda/pruebas" && item.label === "Pruebas"));
  const purchases = getAccountNavigationItems("seller", false).find((item) => item.href === "/mi-cuenta/transacciones");
  assert.equal(accountItemIsActive("/mi-cuenta/pruebas", purchases), true);
});

// ------------------------------------------------------------------ store page and /regalos: one exchange promise

test("a store's returns terms win over its gift exchange policy, on the store page and on /regalos", () => {
  const { storeExchange } = load("lib/store-floor/exchange.ts");
  const gift = { exchange_days: 30, note: "Con boleta de regalo" };
  assert.deepEqual(storeExchange(null, gift), { days: 30, note: "Con boleta de regalo", source: "gift" });
  assert.deepEqual(storeExchange([{ condition_group: "new", returns_days: 0, returns_note: null }], gift).source, "gift");
  assert.deepEqual(storeExchange([
    { condition_group: "used", returns_days: 15, returns_note: null },
    { condition_group: "new", returns_days: 7, returns_note: "Con boleta" },
  ], gift), { days: 7, note: "Con boleta", source: "terms" });
  assert.deepEqual(storeExchange([
    { condition_group: "used", returns_days: 3, returns_note: null },
    { condition_group: "open_box", returns_days: 10, returns_note: null },
  ], null), { days: 10, note: null, source: "terms" });
  assert.equal(storeExchange([], null), null);
  assert.match(read("components/discovery/store-discovery-section.tsx"), /exchange\?\.source === "gift"/);
  assert.match(read("lib/discovery/data.ts"), /withStoreExchangeTerms\(client\(\), stores\)/);
});
