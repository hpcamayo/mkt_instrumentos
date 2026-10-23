const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { parseListingFilters } = require("@/lib/listings");

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

function loadServer(file, mocks = {}) {
  const original = Module._load;
  Module._load = function (name, ...args) {
    if (name === "server-only") return {};
    if (name === "next/cache") return { unstable_cache: (fn) => fn };
    if (Object.hasOwn(mocks, name)) return mocks[name];
    return original.call(this, name, ...args);
  };
  const resolved = path.resolve(__dirname, "..", file);
  delete require.cache[resolved];
  try { return require(resolved); }
  finally { Module._load = original; }
}

test("catalog recovery skips the facet RPC before it can reach the database", async () => {
  const { fetchCatalogFacets } = require("@/lib/catalog-facets");
  await withRecoveryFlag("true", async () => {
    const data = await fetchCatalogFacets({ rpc() { assert.fail("optional RPC must not run"); } }, filters);
    assert.equal(data, null);
  });
});

test("normal operation still fetches real facet counts with the chosen filters", async () => {
  const { fetchCatalogFacets } = require("@/lib/catalog-facets");
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

test("catalog recovery suppresses empty-search fan-out before creating a database client", async () => {
  const { getCatalogRescue } = loadServer("lib/catalog-data.ts", {
    "@/lib/supabase/public-client": { getPublicSupabaseClient() { assert.fail("rescue client must not be created"); } },
  });
  await withRecoveryFlag("true", async () => assert.equal(await getCatalogRescue(filters), null));
});

test("catalog recovery skips optional menu aggregates before creating a database client", async () => {
  const { getCatalogBrandsByCategory, getListingCounts } = loadServer("lib/catalog-brands.ts", {
    "@supabase/supabase-js": { createClient() { assert.fail("aggregate client must not be created"); } },
  });
  await withRecoveryFlag("true", async () => {
    assert.deepEqual(await getCatalogBrandsByCategory(), {});
    assert.equal(await getListingCounts(), null);
  });
});

test("the disabled facet endpoint returns a cacheable empty fallback without database access", async () => {
  const { GET } = loadServer("app/api/catalog/facets/route.ts", {
    "@/lib/supabase/public-client": { getPublicSupabaseClient() { assert.fail("facet endpoint must not connect"); } },
  });
  await withRecoveryFlag("true", async () => {
    const response = await GET({ nextUrl: new URL("https://laria.audio/api/catalog/facets?category=guitars") });
    assert.equal(response.status, 200);
    assert.equal(await response.json(), null);
    assert.match(response.headers.get("cache-control"), /s-maxage=60/);
  });
});

test("catalog recovery preserves the core listing query, filters and pagination", async () => {
  const client = {};
  const expected = { data: [{ id: "public-listing" }], count: 25, error: null };
  let calls = 0;
  const { getCatalogPage } = loadServer("lib/catalog-data.ts", {
    "@/lib/supabase/public-client": { getPublicSupabaseClient: () => client },
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
