const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

// Render the actual routes with pending upstream reads: a sequential implementation never reaches the optional
// reads before inventory resolves. No timing threshold or implementation-text assertion is needed.
function loadRoute(file, { configured = true } = {}) {
  const core = deferred();
  const facets = deferred();
  const counts = deferred();
  const brands = deferred();
  const started = [];
  const deadline = { expiresAt: Date.now() + 8000, signal: AbortSignal.timeout(8000) };
  const original = Module._load;
  const mocks = {
    "server-only": {},
    "@/lib/catalog-data": {
      getCatalogPage: () => { started.push("core"); return core.promise; },
      getCatalogFacets: () => { started.push("facets"); return facets.promise; },
    },
    "@/lib/catalog": { fetchCatalogPage: () => { started.push("core"); return core.promise; } },
    "@/lib/catalog-brands": {
      getListingCounts: () => { started.push("counts"); return counts.promise; },
      getCatalogBrandsByCategory: () => { started.push("brands"); return brands.promise; },
    },
    "@/lib/supabase/public-read-client": {
      getRequestReads: () => ({ supabase: configured ? {} : null, deadline }),
      optionalReadSignal: () => deadline.signal,
    },
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
  const target = path.join(root, file);
  delete require.cache[target];
  try { return { route: require(target), started, core, facets, counts, brands }; }
  finally { Module._load = original; delete require.cache[target]; }
}

test("catalog starts facets while inventory is pending and passes the same read to the view", async () => {
  const state = loadRoute("app/listados/page.tsx");
  const render = state.route.default({ searchParams: Promise.resolve({ brand: "Shure" }) });
  await tick();
  assert.deepEqual(state.started.sort(), ["core", "facets"]);
  state.core.resolve({ data: [{ id: "live" }], count: 100, error: null });
  const tree = await render;
  const view = tree.props.children.find((child) => child?.props?.facets);
  assert.equal(view.props.facets, state.facets.promise, "no second read is started by the view");
  assert.equal(view.props.listings[0].id, "live");
  state.facets.resolve(null); // optional failure remains unavailable, never a zero count
  assert.equal(await view.props.facets, null);
  assert.equal(view.props.totalCount, 100);
});

test("category starts inventory, facets, type counts and brands together", async () => {
  const state = loadRoute("app/instrumentos/[slug]/page.tsx");
  const render = state.route.default({ params: Promise.resolve({ slug: "guitarras" }), searchParams: Promise.resolve({}) });
  await tick();
  assert.deepEqual(state.started.sort(), ["brands", "core", "counts", "facets"]);
  state.core.resolve({ data: [{ id: "live" }], count: 100, error: null });
  state.brands.resolve({ guitars: [] });
  const landing = await render;
  assert.equal(landing.props.facets, state.facets.promise);
  assert.equal(landing.props.counts, state.counts.promise);
  state.facets.resolve(null);
  state.counts.resolve(null);
});

test("malformed URLs, interpreted phrases and forwarded category filters start no speculative reads", async () => {
  for (const params of [{ brand: "Shureµphone_type=dynamic" }, { q: "bajo 5 cuerdas menos de 2000 en Lima" }]) {
    const state = loadRoute("app/listados/page.tsx");
    await assert.rejects(state.route.default({ searchParams: Promise.resolve(params) }), (error) => [307, 308].includes(error.status));
    assert.deepEqual(state.started, []);
  }
  const category = loadRoute("app/instrumentos/[slug]/page.tsx");
  await assert.rejects(category.route.default({ params: Promise.resolve({ slug: "guitarras" }), searchParams: Promise.resolve({ brand: "Fender" }) }), (error) => error.status === 307);
  assert.deepEqual(category.started, []);
});

test("a missing client starts no optional reads", async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const file of ["app/listados/page.tsx", "app/instrumentos/[slug]/page.tsx"]) {
      const state = loadRoute(file, { configured: false });
      await state.route.default({ params: Promise.resolve({ slug: "guitarras" }), searchParams: Promise.resolve({}) });
      assert.deepEqual(state.started, []);
    }
  } finally { console.warn = warn; }
});

test("core failures stay errors and overflow redirects do not wait for optional reads", async () => {
  const failed = loadRoute("app/listados/page.tsx");
  const render = failed.route.default({ searchParams: Promise.resolve({}) });
  failed.core.resolve({ data: null, count: null, error: { message: "database unavailable" } });
  const tree = await render;
  assert.equal(tree.props.children.find((child) => child?.props?.facets).props.error, true);
  failed.facets.resolve(null);

  const overflow = loadRoute("app/listados/page.tsx");
  const moved = overflow.route.default({ searchParams: Promise.resolve({ page: "99" }) });
  overflow.core.resolve({ data: [], count: 100, error: null });
  await assert.rejects(moved, (error) => error.status === 307 && error.location === "/listados?page=5");
  overflow.facets.resolve(null);
});
