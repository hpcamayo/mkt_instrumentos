// Effortless Laria, speed batch (docs/ux-effortless/speed.md): the error page's "Reintentar" (fix-09), and in the
// batch PR the navigation feedback (fast-01), data saving (fast-03), accessibility (fast-04) and the installable app
// (big-12).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

function load(file, mocks = {}, cache = new Map()) {
  const resolved = path.resolve(root, file);
  if (cache.has(resolved)) return cache.get(resolved).exports;
  const compiled = ts.transpileModule(fs.readFileSync(resolved, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = new Module(resolved, module);
  mod.filename = resolved;
  mod.paths = module.paths;
  cache.set(resolved, mod);
  const original = mod.require.bind(mod);
  mod.require = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    const relative = name.startsWith("@/") ? name.slice(2) : name.startsWith(".") ? path.relative(root, path.resolve(path.dirname(resolved), name)) : null;
    if (relative !== null) {
      for (const ext of [".ts", ".tsx"]) {
        if (fs.existsSync(path.join(root, relative + ext))) return load(relative + ext, mocks, cache);
      }
    }
    return original(name);
  };
  mod._compile(compiled, resolved);
  return mod.exports;
}

const without = (props, ...keys) => Object.fromEntries(Object.entries(props).filter(([key]) => !keys.includes(key)));
const linkMock = { __esModule: true, default: ({ children, ...props }) => React.createElement("a", without(props, "prefetch"), children) };
const navigationMock = (pathname, router = {}) => ({ usePathname: () => pathname, useSearchParams: () => new URLSearchParams(), useRouter: () => router });

test("the 500 page offers “Reintentar”, which refreshes the server payload and resets the boundary (fix-09)", () => {
  const { default: ErrorBoundaryPage } = load("app/error.tsx", { "next/link": linkMock, "next/navigation": navigationMock("/instrumentos/x") });
  const html = renderToStaticMarkup(React.createElement(ErrorBoundaryPage, { error: new Error("boom"), reset: () => {} }));
  assert.match(html, /<h1 class="t-page text-ink">Algo salió mal<\/h1>/);
  // The retry button sits under the line, before the search, and is the page's one primary action.
  assert.match(html, /Vuelve a intentarlo en unos minutos\.<\/p><div class="mt-6 flex justify-center"><button type="button" class="[^"]*bg-action[^"]*">Reintentar<\/button><\/div>/);
  assert.doesNotMatch(html, /boom/);
  const file = source("app/error.tsx");
  assert.match(file, /startRetry\(\(\) => \{\s*router\.refresh\(\);\s*reset\(\);\s*\}\)/);
  assert.match(file, /loadingLabel="Reintentando…"/);
  // The 404 keeps no action of its own.
  const { default: NotFound } = load("app/not-found.tsx", { "next/link": linkMock, "next/navigation": navigationMock("/x") });
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(NotFound)), /Reintentar|<button type="button"/);
});

test("data saving follows Save-Data and slow connections, and is off on the server (fast-03)", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const withConnection = (connection) => {
    Object.defineProperty(globalThis, "navigator", { value: connection === undefined ? {} : { connection }, configurable: true });
    return load("lib/data-saver.ts").prefersReducedData();
  };
  try {
    assert.equal(withConnection(undefined), false);
    assert.equal(withConnection({ saveData: true, effectiveType: "4g" }), true);
    for (const type of ["slow-2g", "2g", "3g"]) assert.equal(withConnection({ saveData: false, effectiveType: type }), true, type);
    assert.equal(withConnection({ saveData: false, effectiveType: "4g" }), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else delete globalThis.navigator;
  }
  // The hook's server snapshot is false, so hydration never mismatches.
  assert.match(source("lib/data-saver.ts"), /useSyncExternalStore\(subscribe, prefersReducedData, \(\) => false\)/);
});

test("shared photos come back once, in order, and stale shares are dropped (big-12)", async () => {
  const { SHARE_CACHE, SHARED_PHOTO_HEADERS, takeSharedPhotos, peekSharedPhotos } = load("lib/share-target.ts");
  const store = new Map();
  const now = Date.now();
  const put = (url, name, order, sharedAt) => store.set(url, new Response(new Blob([name], { type: "image/jpeg" }), {
    headers: { [SHARED_PHOTO_HEADERS.name]: encodeURIComponent(name), [SHARED_PHOTO_HEADERS.order]: String(order), [SHARED_PHOTO_HEADERS.sharedAt]: String(sharedAt) },
  }));
  put("/compartir/foto/1", "trasera.jpg", 1, now);
  put("/compartir/foto/0", "guitarra frente.jpg", 0, now);
  put("/compartir/foto/9", "vieja.jpg", 9, now - 2 * 24 * 60 * 60 * 1000);
  const cache = {
    keys: async () => [...store.keys()].map((url) => ({ url })),
    match: async (request) => store.get(request.url)?.clone(),
    delete: async (request) => store.delete(request.url),
  };
  globalThis.caches = { open: async (name) => { assert.equal(name, SHARE_CACHE); return cache; } };
  try {
    const peeked = await peekSharedPhotos();
    assert.deepEqual(peeked.map((file) => file.name), ["guitarra frente.jpg", "trasera.jpg"]);
    assert.equal(store.size, 2, "a peek keeps fresh photos and drops the stale one");
    const first = await takeSharedPhotos();
    assert.deepEqual(first.map((file) => file.name), ["guitarra frente.jpg", "trasera.jpg"]);
    assert.equal(first[0].type, "image/jpeg");
    assert.equal(store.size, 0, "taking deletes the device copy");
    assert.equal(await takeSharedPhotos(), first, "a second call in the same page load gets the same files");
  } finally {
    delete globalThis.caches;
  }
});
