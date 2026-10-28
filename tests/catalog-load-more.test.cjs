const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function loadMore({ extra = [], state = "idle", saved = null } = {}) {
  const effects = [];
  const updates = [];
  const original = Module._load;
  const target = path.resolve(__dirname, "../components/catalog-load-more.tsx");
  Module._load = function (name, ...args) {
    if (name === "react") return {
      ...React,
      useState: (initial) => [Array.isArray(initial) ? extra : state, (value) => updates.push(value)],
      useRef: () => ({ current: false }),
      useEffect: (effect) => effects.push(effect),
    };
    if (name === "@/components/listing-card") return { ListingCard: ({ listing, reserved }) => React.createElement("span", { "data-card": listing.id, "data-reserved": String(reserved) }) };
    if (name === "@/lib/catalog-device") return { readStore: () => saved, writeStore: () => {} };
    return original.call(this, name, ...args);
  };
  delete require.cache[target];
  try {
    const { CatalogLoadMore } = require(target);
    const element = CatalogLoadMore({ filters: { cities: [], conditions: [], advanced: {}, sort: "newest" }, page: 1, total: 100 });
    return { html: renderToStaticMarkup(element), effects, updates };
  } finally {
    delete require.cache[target];
    Module._load = original;
  }
}

const rows = (length) => Array.from({ length }, (_, i) => ({ id: `loaded-${i}` }));
const visible = (html) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

test("mobile pagination counts real returned cards and stops at an empty or partial page", () => {
  const empty = loadMore({ extra: [{ listings: [], total: null, reserved: [] }] });
  assert.match(visible(empty.html), /Mostrando 24$/);
  assert.doesNotMatch(empty.html, /<button|No pudimos cargar|de 100/);

  const partial = loadMore({ extra: [{ listings: rows(3), total: 27, reserved: ["loaded-1"] }] });
  assert.match(visible(partial.html), /Mostrando 27 de 27/);
  assert.doesNotMatch(partial.html, /<button|No pudimos cargar/);
  assert.equal((partial.html.match(/data-card=/g) ?? []).length, 3);
  assert.match(partial.html, /data-card="loaded-1" data-reserved="true"/);

  const full = loadMore({ extra: [{ listings: rows(24), total: 100, reserved: [] }] });
  assert.match(visible(full.html), /Mostrando 48 de 100Ver 24 más/);
  assert.equal((full.html.match(/data-card=/g) ?? []).length, 24);
  assert.match(loadMore({ state: "error" }).html, /No pudimos cargar más/);
});

test("returning to saved results stops replaying pages at the first exhausted response", async () => {
  const previous = { fetch: global.fetch, window: global.window, raf: global.requestAnimationFrame };
  const calls = [];
  global.window = { location: { pathname: "/listados", search: "" }, scrollTo: () => {} };
  global.requestAnimationFrame = (fn) => fn();
  global.fetch = async (url) => {
    calls.push(url);
    return Response.json({ listings: calls.length === 1 ? rows(24) : [], total: calls.length === 1 ? 100 : null, reserved: [] });
  };
  try {
    const restored = loadMore({ saved: { href: "/listados", pages: 5, scrollY: 400, at: Date.now() } });
    restored.effects[0]();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls.map((url) => new URL(url, "https://laria.audio").searchParams.get("page")), ["2", "3"]);
    assert.equal(restored.updates[0].length, 2, "no retry or pages four/five after the empty success");
  } finally {
    global.fetch = previous.fetch;
    if (previous.window === undefined) delete global.window; else global.window = previous.window;
    if (previous.raf === undefined) delete global.requestAnimationFrame; else global.requestAnimationFrame = previous.raf;
  }
});
