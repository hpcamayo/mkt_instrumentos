// The recovery switch (LARIA_CATALOG_ENRICHMENT_DISABLED, docs/operations/catalog-recovery.md): every optional
// live-listing aggregate stops before it reaches the database, on server renders and browser endpoints alike, and the
// core catalog, search and the sell form's reference brands keep working.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const { parseListingFilters } = require("@/lib/listings");

const root = path.resolve(__dirname, "..");
const filters = parseListingFilters({ category: "guitars", location: "Lima", brand: "Fender" });

async function withRecoveryFlag(value, run) {
  const previous = process.env.LARIA_CATALOG_ENRICHMENT_DISABLED;
  if (value === undefined) delete process.env.LARIA_CATALOG_ENRICHMENT_DISABLED;
  else process.env.LARIA_CATALOG_ENRICHMENT_DISABLED = value;
  try { await run(); }
  finally {
    if (previous === undefined) delete process.env.LARIA_CATALOG_ENRICHMENT_DISABLED;
    else process.env.LARIA_CATALOG_ENRICHMENT_DISABLED = previous;
  }
}

// Loads a server module (and, freshly, the project modules it imports) with the given modules replaced.
function loadServer(file, mocks = {}) {
  const original = Module._load;
  const fresh = new Set();
  Module._load = function (name, parent, ...args) {
    if (name === "server-only") return {};
    if (name === "next/cache") return { unstable_cache: (fn) => fn };
    if (Object.hasOwn(mocks, name)) return mocks[name];
    return original.call(this, name, parent, ...args);
  };
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(path.join(root, "lib")) || key.startsWith(path.join(root, "app"))) {
      fresh.add(key);
      delete require.cache[key];
    }
  }
  try { return require(path.resolve(root, file)); }
  finally { Module._load = original; }
}

const noClient = {
  createPublicReadClient() { assert.fail("no database client may be created"); },
  getRequestReads() { assert.fail("no database client may be created"); },
  optionalReadSignal: () => AbortSignal.timeout(1000),
};

test("catalog recovery skips the facet RPC before it can reach the database", async () => {
  const { fetchCatalogFacets } = loadServer("lib/catalog-facets.ts");
  await withRecoveryFlag("true", async () => {
    const data = await fetchCatalogFacets({ rpc() { assert.fail("optional RPC must not run"); } }, filters);
    assert.equal(data, null);
  });
});

test("normal operation still fetches real facet counts with the chosen filters", async () => {
  const { fetchCatalogFacets } = loadServer("lib/catalog-facets.ts");
  await withRecoveryFlag(undefined, async () => {
    let calls = 0;
    const data = await fetchCatalogFacets({ async rpc(name, args) {
      calls += 1;
      assert.equal(name, "catalog_facets");
      assert.deepEqual(args.p_filters, { category: "guitars", cities: ["Lima"], brand: "Fender" });
      return { data: { total: 2, category: { guitars: 2 } }, error: null };
    } }, filters);
    assert.equal(calls, 1);
    assert.equal(data.total, 2);
    assert.deepEqual(data.category, { guitars: 2 });
  });
});

test("catalog recovery skips server-rendered facets and the empty-search rescue before creating a database client", async () => {
  const { getCatalogFacets, getCatalogRescue, getFacetsForKey } = loadServer("lib/catalog-data.ts", { "@/lib/supabase/public-read-client": noClient });
  await withRecoveryFlag("true", async () => {
    assert.equal(await getCatalogFacets(filters), null);
    assert.equal(await getFacetsForKey("category=guitars", AbortSignal.timeout(1000)), null);
    assert.equal(await getCatalogRescue(filters), null);
  });
});

test("catalog recovery skips the menu, landing and home aggregates before creating a database client", async () => {
  const { getCatalogBrandsByCategory, getListingCounts, getTypeCountRows } = loadServer("lib/catalog-brands.ts", { "@/lib/supabase/public-read-client": noClient });
  await withRecoveryFlag("true", async () => {
    assert.deepEqual(await getCatalogBrandsByCategory(), {});
    assert.equal(await getListingCounts(), null);
    assert.equal(await getTypeCountRows(), null);
  });
});

// The reference catalog is not a live-listing aggregate: the sell form keeps its brand suggestions.
function catalogTablesClient(calls) {
  const rows = {
    catalog_products: [{ id: "p1", category_id: "instruments.guitars.electric", manufacturer_id: "m1" }, { id: "p2", category_id: "effects.drive", manufacturer_id: "m2" }],
    catalog_manufacturers: [{ id: "m1", canonical_name: "Fender" }, { id: "m2", canonical_name: "Boss" }],
  };
  return {
    from(table) {
      calls.push(table);
      const result = { data: rows[table], count: rows[table].length, error: null };
      const builder = new Proxy({}, { get: (_, name) => (name === "then" ? (resolve) => resolve(result) : () => builder) });
      return builder;
    },
    rpc(name) { assert.fail(`no listing aggregate (${name}) for the sell form`); },
  };
}

test("with the switch on, the sell form still gets the reference catalog's brands, and no listing aggregate runs", async () => {
  const calls = [];
  const { loadSellBrands } = loadServer("lib/sell-page-data.ts", {
    "@/lib/supabase/public-read-client": { createPublicReadClient: () => catalogTablesClient(calls) },
  });
  await withRecoveryFlag("true", async () => {
    assert.deepEqual(await loadSellBrands(), { guitars: ["Fender"], pedals: ["Boss"] });
  });
  assert.deepEqual(calls.sort(), ["catalog_manufacturers", "catalog_products"]);
});

test("the sell form works without brand suggestions when the reference catalog is unavailable", async () => {
  const { loadSellBrands } = loadServer("lib/sell-page-data.ts", {
    "@/lib/supabase/public-read-client": { createPublicReadClient: () => ({ from() {
      const builder = new Proxy({}, { get: (_, name) => (name === "then" ? (resolve) => resolve({ data: null, count: null, error: { message: "timeout" } }) : () => builder) });
      return builder;
    } }) },
  });
  const warn = console.warn;
  console.warn = () => {};
  try { assert.deepEqual(await loadSellBrands(), {}); }
  finally { console.warn = warn; }
  // The brand stays a free-text field with optional suggestions.
  const form = fs.readFileSync(path.join(root, "components/sell-listing-form.tsx"), "utf8");
  assert.match(form, /brandsByCategory/);
});

test("the disabled facet endpoint returns a cacheable empty fallback without database access", async () => {
  const { GET } = loadServer("app/api/catalog/facets/route.ts", { "@/lib/supabase/public-read-client": noClient });
  await withRecoveryFlag("true", async () => {
    const response = await GET({ nextUrl: new URL("https://laria.audio/api/catalog/facets?category=guitars") });
    assert.equal(response.status, 200);
    assert.equal(await response.json(), null);
    assert.match(response.headers.get("cache-control"), /s-maxage=60/);
  });
});

test("the disabled suggestion endpoint answers an empty list without database access", async () => {
  const { GET } = loadServer("app/api/catalog/suggest/route.ts", { "@/lib/supabase/public-read-client": noClient });
  await withRecoveryFlag("true", async () => {
    const response = await GET({ nextUrl: new URL("https://laria.audio/api/catalog/suggest?q=fender"), signal: new AbortController().signal });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  });
});

test("catalog recovery preserves the core listing query, filters and pagination", async () => {
  const client = {};
  const expected = { data: [{ id: "public-listing" }], count: 25, error: null };
  let calls = 0;
  const { getCatalogPage } = loadServer("lib/catalog-data.ts", {
    "@/lib/supabase/public-read-client": { getRequestReads: () => ({ supabase: client, deadline: { signal: new AbortController().signal, expiresAt: Date.now() + 8000 } }) },
    "@/lib/catalog": { async fetchCatalogPage(actualClient, actualFilters, page) {
      calls += 1;
      assert.equal(actualClient, client);
      assert.deepEqual(actualFilters, filters);
      assert.equal(page, 2);
      return expected;
    } },
  });
  await withRecoveryFlag("true", async () => {
    assert.equal(await getCatalogPage(filters, 2), expected);
    assert.equal(calls, 1);
  });
});

// Every direct caller of an optional aggregate function is one of the guarded modules above.
test("every direct caller of an optional catalog aggregate checks the switch", () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const relative = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(relative);
      else if (/\.(ts|tsx)$/.test(entry.name) && !relative.endsWith("database.types.ts")) files.push(relative);
    }
  };
  for (const dir of ["app", "components", "lib"]) walk(dir);
  const callers = files.filter((file) => /\.rpc\(\s*"(catalog_facets|catalog_brand_counts|catalog_type_counts|catalog_suggest)"/.test(fs.readFileSync(path.join(root, file), "utf8")));
  assert.deepEqual(callers.sort(), ["lib/catalog-brands.ts", "lib/catalog-facets.ts", "lib/catalog-suggest-data.ts"]);
  for (const file of callers) assert.match(fs.readFileSync(path.join(root, file), "utf8"), /catalogEnrichmentDisabled\(\)/, file);
  // The rescue's counts and fallbacks are ordinary listing reads, guarded where they start.
  assert.match(fs.readFileSync(path.join(root, "lib/catalog-data.ts"), "utf8"), /export async function getCatalogRescue[\s\S]*?if \(catalogEnrichmentDisabled\(\)\) return null;/);
});
