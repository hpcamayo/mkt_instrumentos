// Effortless Laria, batch "find" (docs/ux-effortless/find.md): search, browse, the home and the catalog.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

// FIX 07: choosing a filter keeps the page where it is; the results come into view only when they are off-screen.
test("FIX 07: catalog navigations do not jump to the top", () => {
  const navigation = source("components/catalog-navigation.tsx");
  assert.match(navigation, /router\.push\(href, \{ scroll: false \}\)/);
  assert.match(navigation, /id=\{RESULTS_REGION_ID\}/);
  assert.match(source("components/pagination.tsx"), /resultsScroll="start"/);
});

test("FIX 07: the results scroll target", () => {
  const { resultsScrollTarget } = require("@/components/catalog-navigation");
  // A filter low in the column: the results are still on screen, so nothing moves.
  assert.equal(resultsScrollTarget({ top: -900, bottom: 1400 }, 800, "visible"), null);
  // The new results are shorter and end above the screen: their top comes into view.
  assert.equal(resultsScrollTarget({ top: -1200, bottom: -100 }, 800, "visible"), -1216);
  // Below the screen (phones, after the sheet): brought up.
  assert.equal(resultsScrollTarget({ top: 900, bottom: 2000 }, 800, "visible"), 884);
  // A page link at the end of the grid: the first row comes back up.
  assert.equal(resultsScrollTarget({ top: -2000, bottom: 300 }, 800, "start"), -2016);
  assert.equal(resultsScrollTarget({ top: 120, bottom: 2000 }, 800, "start"), null);
});

const { parseListingFilters } = require("@/lib/listings");
const parse = (query) => {
  const params = new URLSearchParams(query);
  return parseListingFilters(Object.fromEntries([...new Set(params.keys())].map((key) => [key, params.getAll(key)])));
};
const catalog = require("@/lib/catalog-filters");

// BIG 03: a plain phrase becomes filters the visitor can see and edit; the rest stays as the text search.
test("BIG 03: phrases become filters, idempotently, keeping the visitor's spelling for the rest", () => {
  const { applySearchPhrase, foldText } = require("@/lib/catalog-query");
  const href = (query) => catalog.catalogHref(applySearchPhrase(parse(query)).filters);
  assert.equal(href("q=bajo 5 cuerdas menos de 2000 en Lima"), "/listados?category=basses&location=Lima&instrument_type=bass&max_price=2000&strings=5");
  assert.equal(href("q=Fender Stratocaster usada en Arequipa"), "/listados?q=Fender+Stratocaster&location=Arequipa&condition=Usado+-+buen+estado&condition=Usado+-+con+detalles");
  assert.equal(href("q=guitarra eléctrica entre 500 y 1.500 soles"), "/listados?category=guitars&instrument_type=electric_guitar&min_price=500&max_price=1500");
  assert.equal(href("q=amplificador hasta 2k tienda verificada"), "/listados?category=amplifiers&seller_type=verified_store&max_price=2000");
  assert.equal(href("q=cajón más de 300"), "/listados?category=percussion&instrument_type=hand_percussion&min_price=300");
  // Nothing to read: unchanged, so the page does not redirect.
  assert.equal(applySearchPhrase(parse("q=strato")).changed, false);
  const once = applySearchPhrase(parse("q=yamaha nuevo en lima")).filters;
  assert.equal(applySearchPhrase(once).changed, false, "a second pass changes nothing");
  assert.equal(once.q, "yamaha");
  // A phrase naming another category than the page's keeps the page's category and the words.
  assert.equal(applySearchPhrase(parse("category=guitars&q=bajo")).changed, false);
  assert.equal(foldText("Percusión ÑANDÚ"), "percusion nandu");
});

// FIND 07 and FIND 08: counts on the options and price shortcuts from the prices on sale.
test("FIND 07, FIND 08: facet counts, data-driven places and zones, price shortcuts", () => {
  const { priceShortcuts, roundPrice, readCatalogFacets, facetFiltersJson } = require("@/lib/catalog-facets");
  assert.deepEqual([roundPrice(123), roundPrice(720), roundPrice(1460), roundPrice(7300), roundPrice(0)], [120, 700, 1500, 7500, 0]);
  const format = (value) => `S/ ${value.toLocaleString("en-US")}`;
  assert.deepEqual(priceShortcuts({ min: 100, max: 5000, low: 480, high: 1530, count: 12 }, format).map((item) => item.label), ["Hasta S/ 500", "S/ 500 – 1,500", "Más de S/ 1,500"]);
  assert.deepEqual(priceShortcuts({ min: 100, max: 5000, low: 480, high: 1530, count: 2 }, format), [], "too few prices");
  assert.equal(readCatalogFacets({ nope: 1 }), null);
  const data = readCatalogFacets({
    total: 9, category: { guitars: 9 }, instrument_type: {}, condition: { Nuevo: 6, "Usado - buen estado": 3 }, seller_type: { individual: 2, store: 7, verified_store: 5 },
    locations: [{ city: "Lima", region: "Lima", count: 5 }, { city: "Callao", region: "Callao", count: 1 }, { city: "Cusco", region: "Cusco", count: 3 }], brands: [{ brand: "Fender", count: 4 }], price: { min: 300, max: 4000, low: 600, high: 1200, count: 9 }, advanced: {},
  });
  const facets = catalog.catalogFacets(parse("category=guitars"), {}, {}, data);
  const condition = facets.find((facet) => facet.key === "condition");
  assert.deepEqual(condition.options.map((option) => [option.value, option.count]), [["Nuevo", 6], ["Usado - buen estado", 3], ["Usado - con detalles", 0]]);
  const location = facets.find((facet) => facet.key === "location");
  assert.deepEqual(location.options.map((option) => option.value), ["Lima", "Callao", "Cusco"], "the places that have listings, by zone, largest first");
  const lima = location.zones.find((zone) => zone.label === "Lima y Callao");
  assert.deepEqual([lima.cities, lima.count], [["Lima", "Callao"], 6]);
  // "Todo Lima y Callao" adds both, and a second tap removes both.
  const zoned = catalog.withZone(parse("location=Cusco"), lima.cities);
  assert.deepEqual(zoned.cities, ["Callao", "Cusco", "Lima"]);
  assert.deepEqual(catalog.withZone(zoned, lima.cities).cities, ["Cusco"]);
  assert.deepEqual(facetFiltersJson(parse("category=guitars&location=Lima&min_price=100&strings=6")), { category: "guitars", cities: ["Lima"], min_price: 100, advanced: { strings: "6" } });
  const { regionOfLocation, zoneOfLocation } = require("@/lib/location");
  assert.equal(regionOfLocation("Huancayo", null), "Junín");
  assert.equal(regionOfLocation("Lima", null), "Lima");
  assert.equal(zoneOfLocation("Trujillo", "La Libertad").label, "Norte");
});

// FIND 01 and FIND 03: the search keeps the filters already chosen; suggestions with counts that never lead nowhere.
test("FIND 01, FIND 03: kept filters and suggestions", () => {
  const { buildSuggestions } = require("@/lib/catalog-suggest");
  const { keptSearchFields } = require("@/components/global-search");
  assert.deepEqual(keptSearchFields("/listados", new URLSearchParams("q=old&category=guitars&location=Lima&page=3")), [["category", "guitars"], ["location", "Lima"]]);
  assert.deepEqual(keptSearchFields("/instrumentos/guitarras", new URLSearchParams()), [["category", "guitars"]]);
  assert.deepEqual(keptSearchFields("/instrumentos/fender-stratocaster", new URLSearchParams()), []);
  assert.deepEqual(keptSearchFields("/", new URLSearchParams("q=x")), []);
  const types = [{ category: "guitars", instrument_type: "electric_guitar", listings: 3 }, { category: "guitars", instrument_type: "acoustic_guitar", listings: 0 }];
  const brands = [{ kind: "brand", brand: "Yamaha", model: null, listings: 4 }, { kind: "model", brand: "Yamaha", model: "C40", listings: 1 }];
  const items = buildSuggestions("guit", types, []);
  assert.deepEqual(items.map((item) => [item.label, item.count]), [["Guitarras", 3], ["Guitarras eléctricas", 3]], "no suggestion without listings");
  assert.equal(items[0].href, "/instrumentos/guitarras");
  assert.deepEqual(buildSuggestions("yam", types, brands).map((item) => item.href), ["/listados?brand=Yamaha", "/listados?q=Yamaha+C40"]);
  assert.deepEqual(buildSuggestions("g", types, brands), [], "two letters at least");
  assert.deepEqual(buildSuggestions("percusión", [{ category: "percussion", instrument_type: "drums", listings: 2 }], []).map((item) => item.label).slice(0, 1), ["Percusión"]);
});

// BIG 01: "Para ti" ranks by what this device opened, never two of one seller in a row, and says why.
test("BIG 01: taste, ranking, seller spread and the reasons", () => {
  const device = require("@/lib/catalog-device");
  const now = Date.parse("2026-10-19T00:00:00Z");
  const opened = { category: "basses", instrument_type: "bass", brand: "Ibanez", city: "Lima", price_pen: 1200 };
  let taste = device.addTaste(device.EMPTY_TASTE, opened, now);
  taste = device.addTaste(taste, opened, now);
  assert.equal(taste.weights["t:bass"], 2);
  // Interest halves every 14 days.
  assert.equal(device.addTaste(taste, { ...opened, brand: null }, now + 14 * 86_400_000).weights["b:ibanez"], 1);
  const item = (id, category, seller, overrides = {}) => ({ id, category, instrument_type: null, brand: null, city: "Cusco", price_pen: 100, published_at: "2026-10-10T00:00:00Z", view_count: 0, seller_key: seller, ...overrides });
  const pool = [item("g1", "guitars", "a"), item("b1", "basses", "s", { instrument_type: "bass", brand: "Ibanez" }), item("b2", "basses", "s", { instrument_type: "bass" }), item("b3", "basses", "t", { instrument_type: "bass" })];
  const ranked = device.rankForYou(pool, taste, [], now).map((listing) => listing.id);
  assert.equal(ranked[0], "b1");
  assert.notEqual(pool.find((listing) => listing.id === ranked[1]).seller_key, "s", "never the same seller twice in a row");
  assert.deepEqual(device.spreadSellers([{ seller_key: "a" }, { seller_key: "a" }, { seller_key: "b" }]).map((entry) => entry.seller_key), ["a", "b", "a"]);
  assert.ok(device.tasteIsEmpty(device.EMPTY_TASTE) && !device.tasteIsEmpty(device.EMPTY_TASTE, ["guitars"]));
  const reasons = device.forYouReasons(taste, [], { category: (value) => value, type: () => "Bajos eléctricos" });
  assert.deepEqual(reasons, ["Tipos que miraste: Bajos eléctricos", "Marcas que miraste: Ibanez", "Lugares: Lima", "Precios cerca de lo que miraste"]);
});

// FIND 09, FIND 11, FIND 12: the results trail, the recently viewed list and the comparison's address.
test("FIND 09, FIND 11, FIND 12: neighbours, recent list, compare slugs", () => {
  const device = require("@/lib/catalog-device");
  const trail = { href: "/listados?location=Lima", label: "Instrumentos", slugs: ["a", "b", "c"], titles: {}, scrollY: 0, at: 0 };
  assert.deepEqual(device.neighbours(trail, "b"), { index: 1, total: 3, previous: "a", next: "c" });
  assert.deepEqual(device.neighbours(trail, "a"), { index: 0, total: 3, previous: null, next: "b" });
  assert.equal(device.neighbours(trail, "z"), null);
  const one = (id) => ({ id, slug: id, title: id, price_pen: 1, category: "guitars", instrument_type: null, brand: null, city: "Lima", seller_type: "individual", verified: false, photo: null, at: 0 });
  let recent = [];
  for (const id of ["a", "b", "a", ...Array.from({ length: 14 }, (_, index) => `x${index}`)]) recent = device.addRecent(recent, one(id));
  assert.equal(recent.length, device.RECENT_LIMIT);
  assert.equal(recent[0].id, "x13");
  assert.equal(new Set(recent.map((entry) => entry.id)).size, recent.length);
  const { compareSlugs } = require("@/lib/catalog-compare");
  assert.deepEqual(compareSlugs("a-b,c,a-b,../x,d,e"), ["a-b", "c", "d"]);
  assert.deepEqual(compareSlugs(undefined), []);
});

// FIND 06: menus and landings offer only brands that have listings.
test("FIND 06: brands with listings, the catalog's spelling, most listings first", () => {
  const { brandsWithListings } = require("@/lib/catalog-brands-aggregate");
  const result = brandsWithListings({ guitars: [{ name: "Fender", models: 40 }, { name: "Gibson", models: 30 }] }, [
    { category: "guitars", brand: "fender ", listings: 2 },
    { category: "guitars", brand: "Vogel", listings: 5 },
  ]);
  assert.deepEqual(result, { guitars: [{ name: "Vogel", models: 0, listings: 5 }, { name: "Fender", models: 40, listings: 2 }] });
});

// FIND 04 (alerts): a search alert keeps the free-text query.
test("BIG 03: alerts keep the text search", () => {
  const alerts = require("@/lib/search-alerts");
  const saved = alerts.listingFiltersToSearchAlert(parse("q=strato&category=guitars"));
  assert.deepEqual(saved, { query: "strato", category: "guitars" });
  assert.equal(alerts.searchAlertPath(saved), "/listados?q=strato&category=guitars");
  assert.match(alerts.searchAlertSummary(saved), /^“strato” · Guitarras/);
  const parsed = alerts.parseSavedSearchAlerts([{ id: "00000000-0000-4000-8000-000000000001", search_filters: saved, frequency: "daily", status: "active", active_since: "2026-10-19T00:00:00Z", created_at: "2026-10-19T00:00:00Z" }]);
  assert.equal(parsed[0].search_filters.query, "strato");
});

// FIND 02, FIND 10, FIND 16: the heading, the new sorts, and the gone page's safe hint.
test("FIND 02, FIND 10, FIND 16: headings, sorts and the gone-listing route", () => {
  assert.equal(catalog.catalogTitle(parse("brand=Fender&category=guitars&location=Lima")), "Fender en Guitarras · Lima");
  assert.equal(catalog.catalogTitle(parse("q=strato&instrument_type=electric_guitar&category=guitars")), "“strato” en Guitarras eléctricas");
  assert.deepEqual(require("@/lib/listings").sortOptions.map((option) => option.label).slice(3), ["Bajaron de precio", "Tiendas verificadas primero"]);
  assert.equal(parse("sort=price_drop").sort, "price_drop");
  const route = source("app/api/catalog/gone/route.ts");
  assert.match(route, /rpc\("listing_gone_hint", \{ p_slug: slug \}\)/);
  assert.doesNotMatch(route, /from\("listings"\)|owner/, "the old listing is never read, only its category and type");
  assert.match(route, /gone: true,\s*label,\s*href:/);
  const migration = source("supabase/migrations/20261101120000_ux_find_search.sql");
  assert.match(migration, /create or replace function public\.listing_gone_hint/);
});
