// Crawlers that re-decode "&microphone_type" as "µphone_type" produced endless new /listados addresses: the catalog kept
// any value for a known key and carried it into every filter link. Values the catalog does not offer are now dropped,
// /listados redirects to the cleaned address, and filter links are nofollow.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseListingFilters, hasRejectedFilterValues } = require("@/lib/listings");
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

test("/listados redirects a rejected address to the cleaned one, and filter links are nofollow", () => {
  const page = read("app/listados/page.tsx");
  assert.match(page, /hasRejectedFilterValues\(resolvedSearchParams\)[\s\S]{0,200}permanentRedirect\(/);
  assert.match(read("components/ui/chip.tsx"), /href=\{href\} rel="nofollow" aria-label/);
  assert.match(read("components/listing-filters.tsx"), /href=\{href\}\s+rel="nofollow"/);
  assert.match(read("components/sort-control.tsx"), /scope\)\}\s+rel="nofollow"/);
});
