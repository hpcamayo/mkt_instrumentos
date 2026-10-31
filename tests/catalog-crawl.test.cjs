// Crawlers that re-decode "&microphone_type" as "µphone_type" produced endless new /listados addresses: the catalog kept
// any value for a known key and carried it into every filter link. Values the catalog does not offer are now dropped,
// /listados redirects to the cleaned address, and filter links are nofollow.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const { parseListingFilters, hasRejectedFilterValues, conditionOptions, legacyCategories } = require("@/lib/listings");
const { catalogHref } = require("@/lib/catalog-filters");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("mangled filter values are dropped and reported", () => {
  const params = { category: "microphones", location: "Arequipa", brand: "JDRµphone_type=dynamic", use_case: "voiceµphone_type=condenserµphone_type=ribbon" };
  const filters = parseListingFilters(params);
  assert.equal(filters.category, "microphones");
  assert.deepEqual(filters.cities, ["Arequipa"]);
  assert.equal(filters.brand, undefined);
  assert.equal(filters.advanced.use_case, undefined);
  assert.equal(hasRejectedFilterValues(params), true);
  assert.equal(catalogHref(filters), "/listados?category=microphones&location=Arequipa");
});

test("real filter values are kept and not reported", () => {
  const params = { category: "microphones", instrument_type: "microphones", microphone_type: "dynamic", use_case: ["voice", "instrument"], brand: "Shure", location: ["Lima", "Cusco"], condition: "Nuevo", sort: "price_asc" };
  const filters = parseListingFilters(params);
  assert.equal(hasRejectedFilterValues(params), false);
  assert.equal(filters.advanced.microphone_type, "dynamic");
  assert.deepEqual(filters.advanced.use_case, ["voice", "instrument"]);
  assert.equal(filters.brand, "Shure");
  assert.equal(hasRejectedFilterValues({}), false);
  assert.equal(hasRejectedFilterValues({ q: "les paul = barata" }), false, "the free-text search is not a filter value");
});

test("legacy category links still work", () => {
  const params = { category: "drums" };
  assert.equal(hasRejectedFilterValues(params), false);
  assert.equal(parseListingFilters(params).category, "percussion");
});

test("unknown categories, types and options, and '=' in places, are rejected", () => {
  for (const params of [{ category: "spaceships" }, { instrument_type: "theremin_x" }, { microphone_type: "dynamicx" }, { location: "Lima=1" }, { city: "a=b" }]) {
    assert.equal(hasRejectedFilterValues(params), true, JSON.stringify(params));
  }
  assert.equal(parseListingFilters({ category: "spaceships" }).category, undefined);
});

test("filter links remain nofollow", () => {
  assert.match(read("components/ui/chip.tsx"), /href=\{href\} rel="nofollow" aria-label/);
  assert.match(read("components/listing-filters.tsx"), /href=\{href\}\s+rel="nofollow"/);
  assert.match(read("components/sort-control.tsx"), /scope\)\}\s+rel="nofollow"/);
});

test("malformed conditions are removed without losing real repeated conditions", () => {
  const params = { category: "microphones", condition: ["Nuevo", "Nuevoµphone_type=dynamic", "Usado - buen estado"] };
  assert.equal(hasRejectedFilterValues(params), true);
  // sell-10 (feature ideas): an old condition in a link stays valid and reads as its part of the new scale.
  assert.deepEqual(parseListingFilters(params).conditions, ["Nuevo", "Exhibición o caja abierta", "Como nuevo", "Excelente", "Muy bueno"]);
  assert.equal(hasRejectedFilterValues({ condition: [...conditionOptions] }), false);
});

const overlong = "JDR" + "µphone_type=dynamic".repeat(6);
const rejectedCases = [
  { brand: "JDRµphone_type=dynamic" },
  { condition: "Nuevoµphone_type=dynamic" },
  { brand: overlong },
  { category: overlong },
  { instrument_type: overlong },
  { location: overlong },
  { city: overlong },
  { use_case: overlong },
  { sort: "price_ascµphone_type=dynamic" },
  { seller_type: "storeµphone_type=dynamic" },
  { min_price: "100µphone_type=dynamic" },
  { max_price: "-5" },
];

test("sort, seller type and prices that the catalog does not offer are reported; blanks from the form are not", () => {
  assert.equal(hasRejectedFilterValues({ sort: "price_desc", seller_type: "verified_store", min_price: "100", max_price: "5000" }), false);
  assert.equal(hasRejectedFilterValues({ sort: "", seller_type: "", min_price: "", max_price: " " }), false);
  assert.equal(parseListingFilters({ sort: "bogus" }).sort, "newest");
  assert.equal(parseListingFilters({ seller_type: "bogus" }).sellerType, undefined);
  // Typed into the no-JavaScript price form: kept, written the way our links write it.
  for (const typed of ["1,500", "S/ 1500", "1 500"]) {
    assert.equal(hasRejectedFilterValues({ min_price: typed }), true, typed);
    assert.equal(parseListingFilters({ min_price: typed }).minPrice, 1500, typed);
  }
  assert.equal(parseListingFilters({ min_price: "abc" }).minPrice, undefined);
});

test("length limits still report values that need a cleanup redirect", () => {
  for (const params of rejectedCases) {
    assert.equal(hasRejectedFilterValues(params), true, JSON.stringify(params));
    const cleaned = Object.fromEntries(new URLSearchParams(catalogHref(parseListingFilters(params)).split("?")[1]));
    assert.equal(hasRejectedFilterValues(cleaned), false, "the cleanup destination is accepted");
  }
});

// Exercise the actual page and metadata exports. Only rendering and external reads are replaced, so redirects,
// parsing, URL serialization, search-phrase handling and SEO metadata run as they do in the application.
function loadCatalogRoute() {
  const reads = [];
  let clients = 0;
  const original = Module._load;
  const mocks = {
    "@/lib/catalog-data": {
      getCatalogPage: async (filters, page) => { reads.push({ filters, page }); return { data: [], count: 100, error: null }; },
      getCatalogFacets: async () => null,
    },
    "@/lib/supabase/public-read-client": { getRequestReads: () => { clients += 1; return { supabase: {} }; } },
    "@/lib/marketplace-events-server": { createSearchReceipt: () => null },
    "next/navigation": {
      permanentRedirect: (location) => { throw Object.assign(new Error("redirect"), { status: 308, location }); },
      redirect: (location) => { throw Object.assign(new Error("redirect"), { status: 307, location }); },
    },
  };
  Module._load = function (name, ...args) {
    if (name.startsWith("@/components/")) return new Proxy({}, { get: () => () => null });
    if (Object.hasOwn(mocks, name)) return mocks[name];
    return original.call(this, name, ...args);
  };
  const file = path.join(root, "app/listados/page.tsx");
  delete require.cache[file];
  try { return { route: require(file), reads, clients: () => clients }; }
  finally { Module._load = original; delete require.cache[file]; }
}

test("page and metadata redirect malformed URLs before catalog reads and preserve the valid state", async () => {
  const { route, reads, clients } = loadCatalogRoute();
  for (const rejected of rejectedCases) {
    const params = { category: "microphones", location: ["Lima", "Cusco"], condition: ["Nuevo", "Usado - buen estado"], min_price: "100", max_price: "5000", sort: "price_asc", page: "2", ...rejected };
    const expected = new URL(catalogHref(parseListingFilters(params)), "https://laria.audio");
    expected.searchParams.set("page", "2");
    for (const render of [route.default, route.generateMetadata]) {
      await assert.rejects(render({ searchParams: Promise.resolve(params) }), (error) => error.status === 308 && error.location === expected.pathname + expected.search, JSON.stringify(params));
    }
  }
  assert.equal(reads.length, 0, "neither metadata nor the page queries the catalog before redirecting");
  assert.equal(clients(), 0, "invalid URLs do not even initialize the page read client");
});

test("valid searches, repeated filters, arbitrary brands and places, and legacy links still render", async () => {
  const { route, reads } = loadCatalogRoute();
  const valid = [
    {},
    { category: "microphones", instrument_type: "microphones", microphone_type: "dynamic", use_case: ["voice", "instrument"], location: ["Lima", "Cusco"], condition: [...conditionOptions], min_price: "100", max_price: "5000", sort: "price_asc", page: "2" },
    { q: "les paul = barata", brand: "Marca nueva & personalizada", location: "San Juan de Miraflores" },
    { q: "x".repeat(150) },
    ...Object.keys(legacyCategories).map((category) => ({ category })),
  ];
  for (const params of valid) {
    assert.equal(hasRejectedFilterValues(params), false);
    await route.default({ searchParams: Promise.resolve(params) });
    await route.generateMetadata({ searchParams: Promise.resolve(params) });
  }
  assert.equal(reads.length, valid.length * 2);
  assert.deepEqual(reads[2].filters.cities, ["Lima", "Cusco"]);
  assert.deepEqual(reads[2].filters.conditions, [...conditionOptions]);
  assert.equal(reads[2].page, 2);
});

test("catalog SEO preserves category aliases, pagination and noindex-follow on valid filtered searches", async () => {
  const { route } = loadCatalogRoute();
  const metadata = (params) => route.generateMetadata({ searchParams: Promise.resolve(params) });
  assert.equal((await metadata({})).alternates.canonical, "/listados");
  assert.equal((await metadata({ page: "2" })).alternates.canonical, "/listados?page=2");
  assert.equal((await metadata({ category: "guitars" })).alternates.canonical, "/instrumentos/guitarras");
  const filtered = await metadata({ category: "microphones", condition: "Nuevo" });
  assert.deepEqual(filtered.robots, { index: false, follow: true });
  assert.equal(filtered.alternates, undefined);
});

test("the page passes normalized filter state to pagination, retry and return-to-results links", async () => {
  const { route } = loadCatalogRoute();
  const tree = await route.default({ searchParams: Promise.resolve({ category: "microphones", condition: ["Nuevo", "Usado - buen estado"], location: ["Lima", "Cusco"], page: "2", utm_source: "email", "µphone_type": "dynamic", _rsc: "abc" }) });
  const view = tree.props.children.find((child) => child?.props?.params);
  // sell-10 (feature ideas): an old condition in a link is carried forward as its part of the new scale.
  assert.deepEqual(view.props.params, { category: ["microphones"], location: ["Lima", "Cusco"], condition: ["Nuevo", "Exhibición o caja abierta", "Como nuevo", "Excelente", "Muy bueno"] });
  const retry = new URL(view.props.retryHref, "https://laria.audio");
  assert.equal(retry.searchParams.get("page"), "2");
  for (const key of ["utm_source", "µphone_type", "_rsc"]) assert.equal(retry.searchParams.has(key), false);
});
