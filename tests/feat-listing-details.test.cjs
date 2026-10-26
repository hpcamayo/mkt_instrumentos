// Feature ideas, listing-details batch (docs/feature-ideas/listing-details.md): the pure rules behind the condition
// scale (sell-10), the price mode and delivery and trade terms (sell-07, buy-02, sell-06), the combo (buy-01), the map
// (buy-08) and discovery's maker marks in the sell form. The database side is tests/feat-listing-details.sql.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

const condition = require("@/lib/listing-condition");
const saleTerms = require("@/lib/sale-terms");
const maker = require("@/lib/maker-details");
const details = require("@/lib/listing-details");
const flags = require("@/lib/listing-flags");
const combo = require("@/lib/combo");
const contact = require("@/lib/contact-message");
const places = require("@/lib/places");
const catalogMap = require("@/lib/catalog-map");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("sell-10: old conditions map to one step, open box is for stores only", () => {
  assert.equal(condition.currentCondition("Usado - buen estado"), "Muy bueno");
  assert.equal(condition.currentCondition("Usado - con detalles"), "Bueno");
  assert.equal(condition.currentCondition("Excelente"), "Excelente");
  assert.equal(condition.isValidCondition("Exhibición o caja abierta", true), true);
  assert.equal(condition.isValidCondition("Exhibición o caja abierta", false), false);
  assert.equal(condition.isValidCondition("Usado", false), false);
  assert.ok(condition.PARTICULAR_CONDITION_VALUES.every((value) => condition.conditionDefinition(value)));
});

test("buy-02 and sell-06: terms drop what a switch turned off and refuse contact details", () => {
  const clean = saleTerms.cleanSaleTerms({
    price_mode: "negotiable", pickup: false, can_try: false, pickup_area: "Surco", ships_provinces: false, carriers: ["olva"],
    accepts_trades: true, trade_wants: "  Un   pedal  de delay ", trade_categories: ["pedals", "cars", "pedals"],
  });
  assert.equal(clean.ok, true);
  assert.equal(clean.value.pickup_area, "");
  assert.deepEqual(clean.value.carriers, []);
  assert.equal(clean.value.trade_wants, "Un pedal de delay");
  assert.deepEqual(clean.value.trade_categories, ["pedals"]);

  const phone = saleTerms.cleanSaleTerms({ accepts_trades: true, trade_wants: "Escríbeme al 999 888 777" });
  assert.equal(phone.ok, false);
  assert.equal(phone.field, "trade_wants");
  const area = saleTerms.cleanSaleTerms({ pickup: true, pickup_area: "x".repeat(61) });
  assert.equal(area.ok, false);
  assert.equal(area.field, "pickup_area");
});

test("trade categories are the catalog's, a later category included", () => {
  const categories = require("@/lib/listings").categoryOptions.map((option) => option.value);
  assert.deepEqual([...saleTerms.TRADE_CATEGORIES], categories);
  assert.ok(saleTerms.TRADE_CATEGORIES.includes("andean"));
});

test("a draft's terms read leniently, copy without the price, and round-trip through the listing's columns", () => {
  const draft = saleTerms.readSaleTerms({ price_mode: "fixed", pickup: true, pickup_area: "Mira", carriers: ["shalom", 3, "dhl"], extra: 1 });
  assert.equal(draft.pickup_area, "Mira");
  assert.deepEqual(draft.carriers, ["shalom"]);
  assert.equal(saleTerms.deliveryTermsOnly(draft).price_mode, null);
  assert.equal(saleTerms.deliveryTermsOnly(draft).pickup, true);
  const full = saleTerms.cleanSaleTerms({ price_mode: "fixed", pickup: true, pickup_area: "Miraflores", can_try: true, lima_delivery: "seller", ships_provinces: true, carriers: ["olva"], shipping_payment: "origin" }).value;
  assert.ok(saleTerms.sameSaleTerms(saleTerms.saleTermsFromListing(saleTerms.saleTermsColumns(full)), full));
  assert.equal(saleTerms.lastSaleTermsKey("u1", "listing"), "laria:entrega:u1:listing");
});

test("maker marks: discovery's limits, from the form or the writer's shape", () => {
  assert.deepEqual(maker.cleanMakerDetails({ handmade: true, to_order: true, weeks: "6", artist_note: "" }), { ok: true, value: { handmade: true, made_to_order_weeks: 6, artist_note: null } });
  assert.deepEqual(maker.cleanMakerDetails({ handmade: true, made_to_order_weeks: null, artist_note: "  Usado  en la gira 2024 " }), { ok: true, value: { handmade: true, made_to_order_weeks: null, artist_note: "Usado en la gira 2024" } });
  assert.equal(maker.cleanMakerDetails({ to_order: true, weeks: "27" }).field, "weeks");
  assert.equal(maker.cleanMakerDetails({ to_order: true, weeks: "" }).field, "weeks");
  assert.equal(maker.cleanMakerDetails({ artist_note: "ok" }).field, "artist_note");
});

test("listing details: known keys only, the failing key and field named, writer errors in the seller's words", () => {
  assert.deepEqual(details.checkListingDetails(undefined, { isStore: false }), { ok: true, details: {} });
  assert.equal(details.checkListingDetails({ warranty: {} }, { isStore: true }).ok, false);
  const failed = details.checkListingDetails({ maker: { to_order: true, weeks: "0" } }, { isStore: true });
  assert.deepEqual([failed.ok, failed.key, failed.field], [false, "maker", "weeks"]);
  assert.equal(details.detailFieldId("vender", "maker", "weeks"), "vender-maker-weeks");
  assert.equal(details.detailWriterError("SALE_TERMS_CONTACT_DETAILS: x"), "Quita teléfonos, correos o enlaces de la entrega o de los cambios.");
  assert.equal(details.detailWriterError("ARTIST_REQUIRED: Solo un artista verificado por Laria puede agregar esta nota."), "Solo un artista verificado por Laria puede agregar esta nota.");
  assert.equal(details.detailWriterError("LISTING_NOT_FOUND: x"), null);
});

test("yes/no filters: one URL whatever the click order, unknown values flagged", () => {
  assert.deepEqual(flags.parseListingOptions(["se-puede-probar,envia-provincia", "nada"]), ["envia_provincia", "se_puede_probar"]);
  assert.equal(flags.hasUnknownListingOption(["envia-provincia"]), false);
  assert.equal(flags.hasUnknownListingOption(["envia-provincia,con-garantia"]), true);
  assert.deepEqual(flags.toggleListingOption(["acepta_cambios"], "envia_provincia"), ["envia_provincia", "acepta_cambios"]);
  assert.deepEqual(flags.toggleListingOption(["acepta_cambios"], "acepta_cambios"), []);
});

test("buy-01: the combo list on the device, its sum and the seller's discount", () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  const raw = JSON.stringify({
    "tienda:s1": { name: "Tienda", items: [{ id: "a", title: "A", slug: "a", price_pen: 100, addedAt: "2026-10-20T00:00:00Z" }, { id: "old", title: "Old", slug: "old", price_pen: 1, addedAt: "2026-08-01T00:00:00Z" }, { id: 3 }] },
    "persona:x": "nope",
  });
  const combos = combo.parseCombos(raw, now);
  assert.deepEqual(Object.keys(combos), ["tienda:s1"]);
  assert.deepEqual(combos["tienda:s1"].items.map((item) => item.id), ["a"]);
  assert.deepEqual(combo.parseCombos("{", now), {});

  let state = {};
  for (let index = 0; index < combo.COMBO_MAX_ITEMS; index += 1) state = combo.toggleComboItem(state, "k", "S", { id: `i${index}`, title: "t", slug: "s", price_pen: 10 }).combos;
  const full = combo.toggleComboItem(state, "k", "S", { id: "extra", title: "t", slug: "s", price_pen: 10 });
  assert.equal(full.full, true);
  assert.equal(combo.toggleComboItem(state, "k", "S", { id: "i0", title: "t", slug: "s", price_pen: 10 }).combos.k.items.length, combo.COMBO_MAX_ITEMS - 1);
  assert.deepEqual(combo.removeComboItem({ k: { name: "S", items: [{ id: "a" }] } }, "k", "a"), {});
  assert.equal(combo.comboTotal([{ price_pen: 100 }, { price_pen: 50 }]), 150);
  assert.equal(combo.comboTotal([{ price_pen: 100 }, { price_pen: null }]), null);
  assert.equal(combo.comboSellerKey({ store_id: "s1", owner_user_id: "u" }), "tienda:s1");
  assert.equal(combo.comboSellerKey({ store_id: null, owner_user_id: "u" }), "persona:u");
  assert.deepEqual(combo.readBundleOffer([{ discount_percent: 10, min_items: 2 }]), { discount_percent: 10, min_items: 2 });
  assert.equal(combo.readBundleOffer({ discount_percent: 40, min_items: 2 }), null);
  assert.equal(combo.bundleOfferText({ discount_percent: 10, min_items: 3 }), "10% de descuento llevando 3 o más");
});

test("the combo's WhatsApp message lists every item and asks for the discount only when it applies", () => {
  const items = [{ title: "Boss DS-1", slug: "boss-ds-1", price_pen: 299 }, { title: "Boss TU-3", slug: "boss-tu-3", price_pen: 429 }];
  const message = contact.comboContactMessage(items, "store", { discount_percent: 10, min_items: 2 });
  assert.match(message, /^Hola, vi estas publicaciones de su tienda en Laria/);
  assert.match(message, /• Boss DS-1, S\/\s299: .*\/instrumentos\/boss-ds-1/);
  assert.match(message, /Suma de precios publicados: S\/\s728\./);
  assert.match(message, /ofrecen 10% de descuento llevando 2 o más/);
  assert.doesNotMatch(contact.comboContactMessage(items, "individual", { discount_percent: 10, min_items: 3 }), /descuento/);
  assert.equal(contact.tradeQuestion("individual").text, "Te propongo un cambio.");
  assert.equal(contact.tradeQuestion("store").text, "Les propongo un cambio.");
});

test("buy-08: places come from a district, a city or a region, never closer than an area", () => {
  assert.equal(places.districtPlace("surco", "Lima").label, "Santiago de Surco, Lima");
  assert.equal(places.districtPlace("Miraflores", "Arequipa").label, "Arequipa");
  assert.equal(places.cityPlace("Lima").radiusKm, places.AREA_RADIUS_KM.lima);
  assert.equal(places.cityPlace("Cusco").key, "ciudad:cusco");
  const region = places.cityPlace("Quillabamba", "Cusco");
  assert.equal(region.key, "region:cusco");
  assert.equal(region.radiusKm, places.AREA_RADIUS_KM.region);
  assert.equal(places.cityPlace("Atlantis", "Nowhere"), null);
  assert.equal(places.isInPeru(-12.1, -77), true);
  assert.equal(places.isInPeru(40.4, -3.7), false);
});

test("buy-08: a store pin only when the store shows it; Particulares by city; unknown places counted apart", () => {
  const store = (extra) => ({ name: "Laria Demo", slug: "laria-demo", is_verified: true, district: "Miraflores", city: "Lima", region: "Lima", public_address: null, public_map_latitude: null, public_map_longitude: null, ...extra });
  const listing = (id, extra) => ({ id, title: id, slug: id, price_pen: 100, condition: "Nuevo", city: "Lima", region: "Lima", seller_type: "individual", photo: null, store: null, ...extra });
  const map = catalogMap.groupMapPlaces([
    listing("pin1", { seller_type: "store", store: store({ public_address: "Av. Larco 345", public_map_latitude: -12.1219, public_map_longitude: -77.03 }) }),
    listing("pin2", { seller_type: "store", store: store({ public_address: "Av. Larco 345", public_map_latitude: -12.1219, public_map_longitude: -77.03 }) }),
    listing("nopin", { seller_type: "store", store: store({ slug: "otra", district: "Barranco" }) }),
    listing("particular"),
    listing("lejos", { city: "Atlantis", region: "Nowhere" }),
  ], 9);
  assert.deepEqual(map.places.map((place) => [place.kind, place.key, place.listings.length]), [
    ["store", "tienda:laria-demo", 2],
    ["area", "zona:distrito:barranco", 1],
    ["area", "zona:ciudad:lima", 1],
  ]);
  assert.equal(map.places[0].detail, "Av. Larco 345");
  assert.deepEqual([map.shown, map.total, map.unplaced], [5, 9, 1]);
  assert.equal(catalogMap.googleMapsUrl(-12.1219, -77.03), "https://www.google.com/maps/search/?api=1&query=-12.1219%2C-77.03");
  assert.equal(catalogMap.wazeUrl(-12.1219, -77.03), "https://www.waze.com/ul?ll=-12.1219%2C-77.03");
  const ring = catalogMap.circleRing(-12, -77, 4, 12);
  assert.equal(ring.length, 13);
  assert.deepEqual(ring[0], ring[12]);
});

test("buy-08: the map's route stops before any read when the recovery switch is on", async () => {
  const original = Module._load;
  Module._load = function (name, parent, ...args) {
    if (name === "@/lib/supabase/public-read-client") return { createPublicReadClient() { assert.fail("no database client may be created"); } };
    return original.call(this, name, parent, ...args);
  };
  const file = path.join(root, "app/api/catalog/map/route.ts");
  delete require.cache[file];
  const previous = process.env.LARIA_CATALOG_ENRICHMENT_DISABLED;
  process.env.LARIA_CATALOG_ENRICHMENT_DISABLED = "true";
  try {
    const { GET } = require(file);
    const response = await GET({ nextUrl: new URL("http://localhost/api/catalog/map?category=guitars") });
    assert.equal(response.status, 503);
  } finally {
    Module._load = original;
    if (previous === undefined) delete process.env.LARIA_CATALOG_ENRICHMENT_DISABLED;
    else process.env.LARIA_CATALOG_ENRICHMENT_DISABLED = previous;
  }
});

test("buy-08: the map library loads only with the map, and the map never gives directions itself", () => {
  const importers = ["app", "components", "lib"].flatMap(function walk(dir) {
    return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(file) : /\.(tsx?)$/.test(entry.name) && /from "maplibre-gl"/.test(read(file)) ? [file] : [];
    });
  });
  assert.deepEqual(importers, [path.join("components", "map", "maplibre.ts")]);
  for (const file of ["components/map/catalog-map-switch.tsx", "components/map/store-pin-field.tsx"]) {
    assert.match(read(file), /dynamic\(\(\) => import\("@\/components\/map\//, file);
  }
  const view = read("components/map/catalog-map-view.tsx");
  assert.doesNotMatch(view, /dir\/|directions|navigate=yes/);
  assert.match(read("components/map/maplibre.ts"), /new NavigationControl/);
  assert.match(read("components/map/maplibre.ts"), /new AttributionControl/);
});

test("nothing is chosen for the seller: the combo discount starts off and the terms start empty", () => {
  assert.match(read("components/listing-details/bundle-offer-form.tsx"), /useState\(initial \? String\(initial\.discount_percent\) : "none"\)/);
  const empty = saleTerms.emptySaleTerms();
  assert.deepEqual([empty.price_mode, empty.pickup, empty.can_try, empty.lima_delivery, empty.ships_provinces, empty.accepts_trades], [null, false, false, null, false, false]);
});
