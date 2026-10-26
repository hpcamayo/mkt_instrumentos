// Deadlines, cancellation, retries, shared aggregates and the catalog's failure states
// (docs/operations/catalog-performance.md). The database side (same results, visibility) is tests/catalog-performance.sql.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// AbortSignal.timeout timers do not hold the event loop open; this keeps it alive while a test waits on one.
const keepAlive = setInterval(() => {}, 1000);
require("node:test").after(() => clearInterval(keepAlive));

function loadServer(file, mocks = {}) {
  const original = Module._load;
  Module._load = function (name, ...args) {
    if (name === "server-only") return {};
    if (name === "next/cache") return { unstable_cache: (fn) => fn };
    if (Object.hasOwn(mocks, name)) return mocks[name];
    return original.call(this, name, ...args);
  };
  for (const key of Object.keys(require.cache)) if (key.startsWith(path.join(root, "lib")) || key.startsWith(path.join(root, "app"))) delete require.cache[key];
  try { return require(path.resolve(root, file)); }
  finally { Module._load = original; }
}

const deadlines = require("@/lib/request-deadline");

test("budgets: optional reads give up before core reads, and a render stays far below Vercel's limit", () => {
  const { READ_BUDGETS } = deadlines;
  assert.ok(READ_BUDGETS.optionalMs < READ_BUDGETS.coreMs);
  // Core reads outlast the database's own 3 s anon statement limit, so its error arrives first.
  assert.ok(READ_BUDGETS.coreMs > 3000 && READ_BUDGETS.coreMs < READ_BUDGETS.pageMs);
  assert.ok(READ_BUDGETS.pageMs <= 10_000 && READ_BUDGETS.routeMs <= READ_BUDGETS.pageMs);
  for (const page of ["app/page.tsx", "app/listados/page.tsx", "app/instrumentos/[slug]/page.tsx", "app/tiendas/page.tsx", "app/tiendas/[slug]/page.tsx", "app/api/catalog/facets/route.ts", "app/api/catalog/suggest/route.ts", "app/api/catalog/page/route.ts", "app/api/catalog/gone/route.ts"]) {
    assert.match(source(page), /export const maxDuration = 30;/, page);
  }
});

test("a call's signal fires at its own budget, never after the deadline, and follows the caller's signal", async () => {
  const deadline = deadlines.createDeadline(60);
  const started = Date.now();
  const signal = deadlines.budgetSignal(deadline, 10_000);
  await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
  assert.ok(Date.now() - started < 1000, "the deadline caps a longer budget");

  const caller = new AbortController();
  const followed = deadlines.budgetSignal(deadlines.createDeadline(10_000), 10_000, caller.signal);
  caller.abort();
  assert.equal(followed.aborted, true);

  // A child deadline cannot outlive its parent, and sequential work only gets what is left.
  const parent = deadlines.createDeadline(100);
  await sleep(60);
  const child = deadlines.createDeadline(10_000, parent);
  assert.ok(deadlines.remainingMs(child) <= 45);
});

test("settleWithin gives up at the signal with the fallback, and a rejection becomes the fallback", async () => {
  const slow = new Promise((resolve) => setTimeout(() => resolve("late"), 200));
  assert.equal(await deadlines.settleWithin(slow, AbortSignal.timeout(20), "fallback"), "fallback");
  assert.equal(await deadlines.settleWithin(Promise.resolve("value"), AbortSignal.timeout(1000), "fallback"), "value");
  assert.equal(await deadlines.settleWithin(Promise.reject(new Error("boom")), AbortSignal.timeout(1000), "fallback"), "fallback");
  const aborted = AbortSignal.abort();
  assert.equal(await deadlines.settleWithin(Promise.reject(new Error("unhandled?")), aborted, "fallback"), "fallback");
});

// A stand-in for the network: counts requests, keeps each open until it answers or its signal aborts.
function fakeNetwork(respond) {
  const state = { calls: 0, open: 0, headers: [] };
  const fetch = (input, init) => {
    state.calls += 1;
    state.open += 1;
    state.headers.push(new Headers(init?.headers));
    return new Promise((resolve, reject) => {
      const done = () => { state.open -= 1; };
      const onAbort = () => { done(); reject(init.signal.reason ?? new DOMException("aborted", "AbortError")); };
      if (init?.signal?.aborted) return onAbort();
      init?.signal?.addEventListener("abort", onAbort, { once: true });
      Promise.resolve(respond(state.calls)).then((response) => {
        if (!response) return; // hang
        init?.signal?.removeEventListener("abort", onAbort);
        done();
        if (response instanceof Error) reject(response);
        else resolve(response);
      });
    });
  };
  return { state, fetch };
}

async function withNetwork(network, run) {
  const original = globalThis.fetch;
  const env = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  globalThis.fetch = network.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  try { return await run(); }
  finally {
    globalThis.fetch = original;
    if (env.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
    if (env.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.key;
  }
}

const readClient = () => loadServer("lib/supabase/public-read-client.ts", { react: { cache: (fn) => fn } });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "content-range": "0-0/*" } });

test("a hung read is cancelled at its budget, reported as an error, and leaves no request open", async () => {
  const network = fakeNetwork(() => null);
  await withNetwork(network, async () => {
    const { createPublicReadClient } = readClient();
    const client = createPublicReadClient(deadlines.createDeadline(5000), 80);
    const started = Date.now();
    const { data, error } = await client.from("listings").select("id").eq("status", "approved");
    assert.equal(data, null);
    assert.match(error.message, /Timeout|Abort/);
    assert.ok(Date.now() - started < 1500, "gave up near the 80 ms budget");
    assert.equal(network.state.calls, 1, "not retried");
    assert.equal(network.state.open, 0, "the request was cancelled, not abandoned");
  });
});

test("no automatic retries on 503, 520 or a network failure (postgrest-js would retry GET three times)", async () => {
  for (const failure of [() => json({ message: "schema cache" }, 503), () => json({ message: "cf" }, 520), () => new TypeError("fetch failed")]) {
    const network = fakeNetwork(failure);
    await withNetwork(network, async () => {
      const { createPublicReadClient } = readClient();
      const client = createPublicReadClient(deadlines.createDeadline(5000));
      const started = Date.now();
      const { error } = await client.from("listings").select("id");
      assert.ok(error, "the failure is an error");
      assert.equal(network.state.calls, 1, "one request only");
      assert.ok(Date.now() - started < 900, "no back-off sleep");
    });
  }
});

test("a caller's own abort signal still cancels the read; RPC calls share the same rules", async () => {
  const network = fakeNetwork(() => null);
  await withNetwork(network, async () => {
    const { createPublicReadClient } = readClient();
    const client = createPublicReadClient(deadlines.createDeadline(5000));
    const caller = new AbortController();
    setTimeout(() => caller.abort(), 30);
    const { error } = await client.rpc("catalog_type_counts").abortSignal(caller.signal);
    assert.ok(error);
    assert.equal(network.state.open, 0);
  });
});

test("public reads carry only the anonymous key: no session, no cookies, so shared caches cannot mix users", async () => {
  const network = fakeNetwork(() => json([]));
  await withNetwork(network, async () => {
    const { createPublicReadClient } = readClient();
    await createPublicReadClient(deadlines.createDeadline(5000)).from("listings").select("id");
    assert.equal(network.state.headers[0].get("authorization"), "Bearer anon-key");
  });
  for (const file of ["lib/supabase/public-read-client.ts", "lib/shared-aggregate.ts", "lib/catalog-data.ts", "lib/catalog-brands.ts", "lib/catalog-suggest-data.ts"]) {
    assert.doesNotMatch(source(file), /next\/headers|cookies\(|getSupabaseServerClient|getSupabaseAdminClient|SERVICE_ROLE/, file);
  }
});

function aggregates() {
  return loadServer("lib/shared-aggregate.ts");
}

test("shared aggregates: concurrent misses share one load (single flight)", async () => {
  const { sharedAggregate } = aggregates();
  let loads = 0;
  const counts = sharedAggregate({ key: "t1", revalidateSeconds: 60, async load() { loads += 1; await sleep(30); return { n: 1 }; } });
  const results = await Promise.all(Array.from({ length: 25 }, () => counts.get(AbortSignal.timeout(1000))));
  assert.equal(loads, 1);
  assert.ok(results.every((result) => result.n === 1));
});

test("shared aggregates: a fresh result is reused, an expired one reloads once for simultaneous requests", async () => {
  const { sharedAggregate } = aggregates();
  let loads = 0;
  const counts = sharedAggregate({ key: "t2", revalidateSeconds: 60, memoryFreshMs: 40, async load() { loads += 1; await sleep(20); return loads; } });
  assert.equal(await counts.get(AbortSignal.timeout(1000)), 1);
  assert.equal(await counts.get(AbortSignal.timeout(1000)), 1, "fresh: no load");
  await sleep(60);
  const after = await Promise.all(Array.from({ length: 10 }, () => counts.get(AbortSignal.timeout(1000))));
  assert.equal(loads, 2, "one refresh for ten requests");
  assert.ok(after.every((value) => value === 2));
});

test("shared aggregates: a failure is not cached, is not retried during the cool-down, and the last good result is served", async () => {
  const { sharedAggregate } = aggregates();
  let loads = 0;
  let failing = false;
  const warn = console.warn;
  console.warn = () => {};
  try {
    const counts = sharedAggregate({ key: "t3", revalidateSeconds: 60, memoryFreshMs: 0, cooldownMs: 80, async load() { loads += 1; if (failing) throw new Error("statement timeout"); return "good"; } });
    assert.equal(await counts.get(AbortSignal.timeout(1000)), "good");
    failing = true;
    assert.equal(await counts.get(AbortSignal.timeout(1000)), "good", "the last good result while the refresh fails");
    const before = loads;
    for (let i = 0; i < 20; i += 1) assert.equal(await counts.get(AbortSignal.timeout(1000)), "good");
    assert.equal(loads, before, "no new database call during the cool-down");
    await sleep(100);
    failing = false;
    assert.equal(await counts.get(AbortSignal.timeout(1000)), "good");
    assert.equal(loads, before + 1, "one try after the cool-down");

    const cold = sharedAggregate({ key: "t3b", revalidateSeconds: 60, cooldownMs: 1000, async load() { throw new Error("down"); } });
    assert.equal(await cold.get(AbortSignal.timeout(1000)), null, "nothing cached yet: unavailable, never an invented value");
  } finally {
    console.warn = warn;
  }
});

test("shared aggregates: a request stops waiting at its signal; the load keeps only its own bounded deadline", async () => {
  const { sharedAggregate } = aggregates();
  let loadDeadline = null;
  let finished = false;
  const counts = sharedAggregate({ key: "t4", revalidateSeconds: 60, loadBudgetMs: 150, async load(deadline) {
    loadDeadline = deadline;
    await new Promise((resolve) => deadline.signal.addEventListener("abort", resolve, { once: true }));
    finished = true;
    throw new Error("aborted at its own deadline");
  } });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const started = Date.now();
    assert.equal(await counts.get(AbortSignal.timeout(30)), null);
    assert.ok(Date.now() - started < 120, "the request gave up at its own 30 ms");
    assert.ok(loadDeadline && deadlines.remainingMs(loadDeadline) <= 150);
    await sleep(200);
    assert.equal(finished, true, "the shared load ended at its 150 ms deadline, not later");
  } finally {
    console.warn = warn;
  }
});

test("shared aggregates: after repeated failures the breaker pauses every key without database calls", async () => {
  const { sharedAggregate, createBreaker } = aggregates();
  const breaker = createBreaker({ failures: 3, windowMs: 1000, openMs: 100 });
  let loads = 0;
  const warn = console.warn;
  console.warn = () => {};
  try {
    const facets = sharedAggregate({ key: "t5", revalidateSeconds: 60, persist: false, breaker, async load(_, key) { loads += 1; throw new Error(`down ${key}`); } });
    for (const key of ["a", "b", "c"]) await facets.get(AbortSignal.timeout(1000), key);
    assert.equal(loads, 3);
    for (const key of ["d", "e", "f", "g"]) assert.equal(await facets.get(AbortSignal.timeout(1000), key), null);
    assert.equal(loads, 3, "open breaker: no calls");
    await sleep(120);
    await facets.get(AbortSignal.timeout(1000), "h");
    assert.equal(loads, 4, "closed again after the pause");
  } finally {
    console.warn = warn;
  }
});

test("shared aggregates: per-key memory is bounded", async () => {
  const { sharedAggregate } = aggregates();
  let loads = 0;
  const facets = sharedAggregate({ key: "t6", revalidateSeconds: 60, persist: false, maxEntries: 3, async load(_, key) { loads += 1; return key; } });
  for (const key of ["a", "b", "c", "d"]) await facets.get(AbortSignal.timeout(1000), key);
  await facets.get(AbortSignal.timeout(1000), "d");
  assert.equal(loads, 4, "d still remembered");
  await facets.get(AbortSignal.timeout(1000), "a");
  assert.equal(loads, 5, "the oldest key was dropped");
});

test("the empty-search rescue shares one optional deadline: counts together, fallbacks stop when it is spent", async () => {
  const { parseListingFilters } = require("@/lib/listings");
  const calls = [];
  const slow = (what, ms, value) => async () => { calls.push(what); await sleep(ms); return value; };
  const data = loadServer("lib/catalog-data.ts", {
    "@/lib/supabase/public-read-client": {
      createPublicReadClient: () => ({}),
      getRequestReads: () => ({ deadline: deadlines.createDeadline(8000), supabase: {} }),
    },
    "@/lib/catalog": {
      countCatalog: slow("count", 50, 0),
      fetchCatalogPage: async (...args) => slow("page", 900, { data: [], error: null })(...args),
    },
  });
  const started = Date.now();
  const rescue = await data.getCatalogRescue(parseListingFilters({ q: "zzz", category: "guitars", location: "Lima" }));
  const elapsed = Date.now() - started;
  assert.ok(elapsed < deadlines.READ_BUDGETS.optionalMs + 400, `bounded by the optional budget (${elapsed} ms)`);
  assert.ok(calls.filter((call) => call === "count").length >= 2, "the counts ran");
  assert.ok(calls.filter((call) => call === "page").length <= 2, "the third fallback never started");
  assert.ok(rescue === null || rescue.closest.length === 0);
});

test("related empty searches reuse removal counts, preserve current sort links and skip duplicate fallback queries", async () => {
  const { parseListingFilters } = require("@/lib/listings");
  const counts = [];
  const pages = [];
  const data = loadServer("lib/catalog-data.ts", {
    "@/lib/supabase/public-read-client": {
      createPublicReadClient: () => ({}),
      getRequestReads: () => ({ deadline: deadlines.createDeadline(8000), supabase: {} }),
    },
    "@/lib/catalog": {
      countCatalog: async (_, filters) => { counts.push(filters); return 12; },
      fetchCatalogPage: async (_, filters) => { pages.push(filters); return { data: [], error: null }; },
    },
  });
  for (const params of [{ location: "Lima" }, { location: "Arequipa" }, { location: "Lima", sort: "price_asc" }]) {
    const result = await data.getCatalogRescue(parseListingFilters({ q: "zzz", category: "guitars", ...params }));
    assert.equal(result.ways.length, 3);
    assert.ok(result.ways.every((way) => way.count === 12));
    for (const way of result.ways) assert.equal(new URL(way.chip.href, "https://laria.audio").searchParams.get("sort"), params.sort ?? null);
  }
  assert.equal(counts.length, 5, "five calls rather than nine: shared removal questions ignore sort");
  assert.equal(pages.length, 6, "category and newest once each, rather than repeating category three times");
  assert.equal(counts.filter((filters) => filters.q === "zzz" && filters.category === "guitars" && filters.cities.length === 0).length, 1);
  data.resetCatalogDataForTests();
  await data.getCatalogRescue(parseListingFilters({ q: "zzz", category: "guitars", location: "Lima" }));
  assert.equal(counts.length, 8, "reset forgets the shared optional counts too");
});

test("concurrent empty searches share an in-flight removal count without sharing scope or other filters", async () => {
  const { parseListingFilters } = require("@/lib/listings");
  const counts = [];
  const data = loadServer("lib/catalog-data.ts", {
    "@/lib/supabase/public-read-client": {
      createPublicReadClient: () => ({}),
      getRequestReads: () => ({ deadline: deadlines.createDeadline(8000), supabase: {} }),
    },
    "@/lib/catalog": {
      countCatalog: async (_, filters) => { counts.push(filters); await sleep(20); return 0; },
      fetchCatalogPage: async () => ({ data: [], error: null }),
    },
  });
  await Promise.all(["Lima", "Cusco"].map((location) => data.getCatalogRescue(parseListingFilters({ q: "zzz", category: "guitars", location }))));
  assert.equal(counts.length, 5, "the shared 'without location' read is issued once");
  await data.getCatalogRescue(parseListingFilters({ q: "zzz", category: "guitars", location: "Lima" }), { landing: { category: "guitars", path: "/instrumentos/guitarras" } });
  assert.ok(counts.every((filters) => filters.sort === "newest"));
});

test("the facet endpoint: one canonical address per filter set, shared by the CDN; unavailable is not a zero", async () => {
  const keys = [];
  const facets = { total: 3, category: { guitars: 3 }, instrument_type: {}, condition: {}, seller_type: {}, locations: [], brands: [], price: null, advanced: {} };
  let answer = facets;
  const { GET } = loadServer("app/api/catalog/facets/route.ts", {
    "@/lib/catalog-data": { getFacetsForKey: async (key) => { keys.push(key); return answer; } },
  });
  const request = (query) => ({ nextUrl: new URL(`https://laria.audio/api/catalog/facets?${query}`), signal: new AbortController().signal });
  const moved = await GET(request("brand=Fender&category=guitars&sort=price_asc&utm=1"));
  assert.equal(moved.status, 308);
  assert.equal(new URL(moved.headers.get("location")).search, "?category=guitars&brand=Fender");
  const ok = await GET(request("category=guitars&brand=Fender"));
  assert.equal(ok.status, 200);
  assert.deepEqual(keys, ["category=guitars&brand=Fender"]);
  assert.match(ok.headers.get("cache-control"), /public, max-age=30, s-maxage=60, stale-while-revalidate=300/);
  answer = null;
  const unavailable = await GET(request("category=guitars&brand=Fender"));
  assert.equal(unavailable.status, 503);
  assert.equal(await unavailable.json(), null);
  assert.match(unavailable.headers.get("cache-control"), /s-maxage=10/);
});

test("server-rendered facets ignore the sort, so every order shares one count", async () => {
  const { parseListingFilters } = require("@/lib/listings");
  const keys = [];
  const data = loadServer("lib/catalog-data.ts", {
    "@/lib/supabase/public-read-client": {
      createPublicReadClient: () => ({ rpc: (name, args) => { keys.push(args.p_filters); return Promise.resolve({ data: { total: 1 }, error: null }); } }),
      getRequestReads: () => ({ deadline: deadlines.createDeadline(8000), supabase: {} }),
    },
  });
  await data.getCatalogFacets(parseListingFilters({ category: "guitars", sort: "price_asc" }));
  await data.getCatalogFacets(parseListingFilters({ category: "guitars", sort: "newest" }));
  assert.equal(keys.length, 1);
});

test("suggestions: type counts are shared, not one call per keystroke; a failed part is left out", async () => {
  const rpcs = [];
  const warn = console.warn;
  console.warn = () => {};
  try {
    const client = { rpc: (name) => {
      rpcs.push(name);
      if (name === "catalog_type_counts") return Promise.resolve({ data: [{ category: "guitars", instrument_type: "electric_guitar", listings: 4 }], error: null });
      return Promise.resolve({ data: null, error: { message: "statement timeout" } });
    } };
    const { GET } = loadServer("app/api/catalog/suggest/route.ts", { "@/lib/supabase/public-read-client": { createPublicReadClient: () => client } });
    for (const q of ["gu", "gui", "guit"]) {
      const response = await GET({ nextUrl: new URL(`https://laria.audio/api/catalog/suggest?q=${q}`), signal: new AbortController().signal });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.ok(body.some((item) => item.kind === "category" && item.label === "Guitarras"), "categories still suggested");
      assert.match(response.headers.get("cache-control"), /s-maxage=120/);
    }
    assert.equal(rpcs.filter((name) => name === "catalog_type_counts").length, 1);
  } finally {
    console.warn = warn;
  }
});

test("filter input is bounded: over-long values and too many values are dropped", () => {
  const { parseListingFilters } = require("@/lib/listings");
  const long = "x".repeat(81);
  const filters = parseListingFilters({ brand: long, category: long, location: [long, "Lima"], instrument_type: "microphones", microphone_type: Array.from({ length: 40 }, (_, i) => `v${i}`) });
  assert.equal(filters.brand, undefined);
  assert.equal(filters.category, undefined);
  assert.deepEqual(filters.cities, ["Lima"]);
  assert.ok(!filters.advanced.microphone_type || [].concat(filters.advanced.microphone_type).length <= 20);
  assert.equal(parseListingFilters({ q: "y".repeat(500) }).q.length, 200, "the text search keeps its own 200-character cut");
});

test("a failed core read is never shown as missing or empty", () => {
  const listing = source("app/instrumentos/[slug]/page.tsx");
  assert.match(listing, /if \(error\) throw new Error\(`The listing could not be read/);
  assert.match(listing, /if \(publicError\) throw new Error/);
  const store = source("app/tiendas/[slug]/page.tsx");
  assert.match(store, /if \(storeError\) throw new Error\(`The store could not be read/);
  // The catalog keeps its "No pudimos cargar las publicaciones" + Reintentar state for a failed page read.
  assert.match(source("components/catalog-view.tsx"), /\{error \? \([\s\S]*No pudimos cargar las publicaciones\. Vuelve a intentarlo en unos minutos\./);
  assert.match(source("app/error.tsx"), /Reintentar/);
});

test("without counts, a chosen city outside the predefined list stays in the location options and still filters", () => {
  const { parseListingFilters } = require("@/lib/listings");
  const { catalogFacets, catalogSearchParams } = require("@/lib/catalog-filters");
  const filters = parseListingFilters({ location: ["Chimbote", "Lima"] });
  const location = catalogFacets(filters, {}, {}, null).find((facet) => facet.key === "location");
  const values = location.options.map((option) => option.value);
  assert.ok(values.includes("Chimbote") && values.includes("Lima") && values.includes("Arequipa"));
  assert.ok(location.options.every((option) => option.count === undefined), "no invented counts");
  assert.deepEqual(location.selected, ["Chimbote", "Lima"]);
  assert.equal(catalogSearchParams(filters).toString(), "location=Chimbote&location=Lima");
});

// Public reads go through the deadline-bound client. The contact endpoint keeps its own (WhatsApp behavior unchanged).
test("no public server read uses the default client without a deadline", () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const relative = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(relative);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(relative);
    }
  };
  for (const dir of ["app", "components", "lib"]) walk(dir);
  const callers = files.filter((file) => /getPublicSupabaseClient\(\)/.test(source(file)) && file !== path.join("lib", "supabase", "public-client.ts"));
  assert.deepEqual(callers, [path.join("app", "api", "contact", "route.ts")]);
});
