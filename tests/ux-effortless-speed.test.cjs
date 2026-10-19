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

test("only taps that change Laria's page start the navigation feedback (fast-01)", () => {
  const { linkNavigationTarget, formNavigationTarget } = load("lib/navigation-feedback.ts");
  const here = new URL("https://laria.pe/listados?category=guitars");
  const target = (href, extra = {}) => linkNavigationTarget({ href, ...extra }, here)?.href ?? null;
  assert.equal(target("/instrumentos/fender-stratocaster"), "https://laria.pe/instrumentos/fender-stratocaster");
  assert.equal(target("/listados?category=basses"), "https://laria.pe/listados?category=basses");
  // The same page, a section of it, another site, a new tab, a download, a file or an API route: no feedback.
  for (const href of ["/listados?category=guitars", "/listados?category=guitars#resultados", "#resultados", "https://wa.me/51987654321", "/api/store/inventory/export", "/muestras/plantilla.xlsx", "/manifest.webmanifest"]) {
    assert.equal(target(href), null, href);
  }
  assert.equal(target("/tiendas/laria-demo-musica", { target: "_blank" }), null);
  assert.equal(target("/tiendas/laria-demo-musica", { target: "_self" }), "https://laria.pe/tiendas/laria-demo-musica");
  assert.equal(target("/mi-cuenta/tienda/inventario", { download: true }), null);
  // GET forms (the brand search) change the page; POST forms and repeated searches do not.
  const search = (method, query, action = "https://laria.pe/listados") => formNavigationTarget({ method, action }, new URLSearchParams(query), here)?.href ?? null;
  assert.equal(search("get", "brand=Fender"), "https://laria.pe/listados?brand=Fender");
  assert.equal(search("post", "brand=Fender"), null);
  assert.equal(search("get", "category=guitars"), null);
  assert.equal(search("get", "q=1", "https://otro.pe/buscar"), null);
});

test("slow page changes show the skeleton of the page on its way, never inside the account frame (fast-01)", () => {
  const { skeletonKindFor, NAVIGATION_BAR_DELAY_MS, SLOW_NAVIGATION_MS } = load("lib/navigation-feedback.ts");
  assert.equal(NAVIGATION_BAR_DELAY_MS, 100);
  assert.equal(SLOW_NAVIGATION_MS, 1000);
  assert.equal(skeletonKindFor("/instrumentos/fender-stratocaster", "/listados"), "listing");
  assert.equal(skeletonKindFor("/instrumentos/guitarras", "/"), null, "a category landing is a catalog page");
  assert.equal(skeletonKindFor("/tiendas/laria-demo-musica", "/instrumentos/demo-boss-ds-1"), "store");
  assert.equal(skeletonKindFor("/tiendas", "/"), null);
  assert.equal(skeletonKindFor("/mi-cuenta/favoritos", "/listados"), "account");
  assert.equal(skeletonKindFor("/vender", "/"), "account");
  assert.equal(skeletonKindFor("/mi-cuenta/favoritos", "/mi-cuenta"), null, "the rail stays; the bar is enough");
  assert.equal(skeletonKindFor("/listados?brand=Yamaha", "/"), null);
});

test("the feedback is one bar, one polite status and skeletons built from the Skeleton primitive (fast-01)", () => {
  const navigation = { usePathname: () => "/listados", useSearchParams: () => new URLSearchParams("category=guitars"), useRouter: () => ({}) };
  const { NavigationFeedback } = load("components/navigation-feedback.tsx", { "next/navigation": navigation });
  const idle = renderToStaticMarkup(React.createElement(NavigationFeedback));
  assert.equal(idle, '<div class="navigation-bar" data-state="idle" aria-hidden="true"></div><p role="status" class="sr-only"></p>');
  const { NavigationSkeleton } = load("components/navigation-skeletons.tsx");
  for (const kind of ["listing", "store", "account"]) {
    const html = renderToStaticMarkup(React.createElement(NavigationSkeleton, { kind }));
    assert.match(html, /animate-pulse rounded-control bg-subtle/, kind);
    assert.doesNotMatch(html, /<(a|button|input|h[1-6])\b/, kind);
  }
  const source = fs.readFileSync(path.join(root, "components/navigation-feedback.tsx"), "utf8");
  assert.match(source, /"Cargando la página…"/);
  assert.match(source, /closest\("a\[href\], button, input, select, textarea, label, summary, \[role='button'\]"\)/);
  // No route-level loading boundary anywhere (owner decision Q1 A).
  const loadingFiles = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name === "loading.tsx") loadingFiles.push(file);
  });
  walk(path.join(root, "app"));
  assert.deepEqual(loadingFiles, []);
  const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
  assert.match(css, /\.navigation-bar \{[^}]*background: var\(--accent\);/);
  assert.match(css, /html:has\(\[data-bottom-bar\]\) \{\s*scroll-padding-bottom/);
});

test("data-saving images ask the same srcset for about 1.5 device pixels per CSS pixel (fast-03)", () => {
  const { dataSavingScale, scaleImageSizes } = load("lib/data-saver.ts");
  assert.equal(dataSavingScale(1), 1);
  assert.equal(dataSavingScale(1.5), 1);
  assert.equal(dataSavingScale(3), 0.5);
  assert.equal(dataSavingScale(2), 0.75);
  assert.equal(
    scaleImageSizes("(max-width: 767px) 50vw, (max-width: 1023px) 33vw, (max-width: 1279px) 25vw, 270px", 0.5),
    "(max-width: 767px) calc(50vw * 0.5), (max-width: 1023px) calc(33vw * 0.5), (max-width: 1279px) calc(25vw * 0.5), calc(270px * 0.5)",
  );
  assert.equal(scaleImageSizes("100vw", 0.75), "calc(100vw * 0.75)");
  assert.equal(scaleImageSizes("(min-width: 1024px) calc(100vw - 64px), 100vw", 0.5), "(min-width: 1024px) calc(100vw - 64px), calc(100vw * 0.5)");
  assert.equal(scaleImageSizes("50vw", 1), "50vw");
  const image = fs.readFileSync(path.join(root, "components/marketplace-image.tsx"), "utf8");
  // Fixed at the first render: hydrated images keep what the server sent.
  assert.match(image, /const reducedNow = useReducedData\(\);\s*const \[reduced\] = useState\(reducedNow\);/);
  assert.match(image, /^"use client";/);
});

// public/sw.js runs in its own global scope; this gives it one with the browser APIs it uses, recording what it does.
function runServiceWorker() {
  const vm = require("node:vm");
  const listeners = {};
  const store = new Map();
  const deleted = [];
  const shown = [];
  const opened = [];
  const origin = "https://laria.pe";
  // Node's Response.redirect needs an absolute address; in the worker a relative one resolves against its own.
  class WorkerResponse extends Response {
    static redirect(url, status) {
      return Response.redirect(new URL(url, `${origin}/sw.js`).href, status);
    }
  }
  const self = {
    location: new URL(`${origin}/sw.js`),
    addEventListener: (type, listener) => { listeners[type] = listener; },
    skipWaiting: () => {},
    clients: { claim: async () => {}, openWindow: async (url) => { opened.push(url); } },
    registration: { showNotification: async (title, options) => { shown.push({ title, options }); } },
  };
  const caches = {
    delete: async (name) => { deleted.push(name); store.clear(); return true; },
    open: async (name) => ({ name, put: async (url, response) => { store.set(url, response); } }),
  };
  vm.runInNewContext(source("public/sw.js"), { self, caches, Response: WorkerResponse, URL, File, String, Date, Promise, encodeURIComponent });
  const dispatch = async (type, event) => {
    let response;
    const pending = [];
    listeners[type]({ ...event, respondWith: (value) => { response = value; }, waitUntil: (value) => pending.push(value) });
    await Promise.all(pending);
    return response === undefined ? undefined : await response;
  };
  return { listeners, store, deleted, shown, opened, origin, dispatch };
}

test("the installable app: manifest, icons and share target agree with the service worker (big-12)", () => {
  const { default: manifest } = load("app/manifest.ts");
  const app = manifest();
  assert.equal(app.display, "standalone");
  assert.equal(app.start_url, "/");
  assert.equal(app.lang, "es-PE");
  assert.equal(app.short_name, "Laria");
  assert.equal(app.prefer_related_applications, false);
  // Each icon exists at the size it claims (a PNG's IHDR holds width and height at bytes 16 and 20).
  for (const icon of [...app.icons, { src: "/icons/badge-96.png", sizes: "96x96" }]) {
    const png = fs.readFileSync(path.join(root, "public", icon.src));
    assert.equal(png.toString("latin1", 1, 4), "PNG", icon.src);
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes, icon.src);
  }
  assert.ok(app.icons.some((icon) => icon.purpose === "maskable" && icon.sizes === "512x512"));
  assert.deepEqual(app.shortcuts.map((shortcut) => shortcut.url), ["/vender", "/mi-cuenta/favoritos"]);
  // The share sheet posts photos as "fotos" to the address only the worker answers, inside its scope.
  assert.deepEqual(
    { action: app.share_target.action, method: app.share_target.method, enctype: app.share_target.enctype, files: app.share_target.params.files.map((file) => file.name) },
    { action: "/compartir/recibir", method: "POST", enctype: "multipart/form-data", files: ["fotos"] },
  );
  const registration = source("components/service-worker-registration.tsx");
  assert.match(registration, /export const SERVICE_WORKER_SCOPE = "\/compartir\/";/);
  assert.match(registration, /register\("\/sw\.js", \{ scope: SERVICE_WORKER_SCOPE, updateViaCache: "none" \}\)/);
  assert.match(registration, /process\.env\.NODE_ENV !== "production"/);
  assert.ok(app.share_target.action.startsWith("/compartir/"));
  const sw = source("public/sw.js");
  const { SHARE_CACHE, SHARED_PHOTO_HEADERS } = load("lib/share-target.ts");
  assert.ok(sw.includes(`const SHARE_CACHE = "${SHARE_CACHE}";`), "the worker writes the cache the page reads");
  for (const header of Object.values(SHARED_PHOTO_HEADERS)) assert.ok(sw.includes(`"${header}"`), header);
  const layout = source("app/layout.tsx");
  assert.match(layout, /<ServiceWorkerRegistration \/>/);
  assert.match(layout, /themeColor: "#050608"/);
  assert.match(layout, /appleWebApp: \{ capable: true, title: SITE_NAME, statusBarStyle: "black" \}/);
});

test("the service worker keeps up to 10 shared photos on the phone and opens /compartir (big-12)", async () => {
  const worker = runServiceWorker();
  const jpeg = (name) => new File([Buffer.from(`jpeg:${name}`)], name, { type: "image/jpeg" });
  const form = new FormData();
  form.append("fotos", jpeg("frente.jpg"));
  form.append("fotos", new File(["nota"], "nota.txt", { type: "text/plain" }));
  form.append("fotos", jpeg("mástil y clavijas.jpg"));
  form.append("titulo", "Mi guitarra");
  const response = await worker.dispatch("fetch", { request: new Request(`${worker.origin}/compartir/recibir`, { method: "POST", body: form }) });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${worker.origin}/compartir?fotos=2`);
  assert.deepEqual(worker.deleted, ["laria-compartido-v1"], "a new share replaces the previous one");
  assert.deepEqual([...worker.store.keys()], ["/compartir/foto/0", "/compartir/foto/1"]);

  // What the worker wrote is what the listing form takes.
  const { takeSharedPhotos } = load("lib/share-target.ts");
  globalThis.caches = { open: async () => ({
    keys: async () => [...worker.store.keys()].map((url) => ({ url })),
    match: async (request) => worker.store.get(request.url)?.clone(),
    delete: async (request) => worker.store.delete(request.url),
  }) };
  try {
    const files = await takeSharedPhotos();
    assert.deepEqual(files.map((file) => [file.name, file.type]), [["frente.jpg", "image/jpeg"], ["mástil y clavijas.jpg", "image/jpeg"]]);
    assert.equal(await files[1].text(), "jpeg:mástil y clavijas.jpg");
  } finally {
    delete globalThis.caches;
  }

  const many = new FormData();
  for (let index = 0; index < 12; index += 1) many.append("fotos", jpeg(`foto-${index}.jpg`));
  const capped = await worker.dispatch("fetch", { request: new Request(`${worker.origin}/compartir/recibir`, { method: "POST", body: many }) });
  assert.equal(capped.headers.get("location"), `${worker.origin}/compartir?fotos=10`);
  assert.equal(worker.store.size, 10);

  // Everything else goes to the network untouched: pages, images, a GET of the share address, other sites.
  for (const request of [
    new Request(`${worker.origin}/compartir/recibir`),
    new Request(`${worker.origin}/compartir`),
    new Request(`${worker.origin}/api/listings/x/photos`, { method: "POST", body: "x" }),
    new Request("https://otro.pe/compartir/recibir", { method: "POST", body: "x" }),
  ]) {
    assert.equal(await worker.dispatch("fetch", { request }), undefined, `${request.method} ${request.url}`);
  }
});

test("push notices show one Laria notice at a time and open only Laria pages (big-12)", async () => {
  const worker = runServiceWorker();
  await worker.dispatch("push", { data: { json: () => ({ title: "Bajó de precio", body: "Fender Stratocaster ahora S/ 3,200", url: "/instrumentos/fender-strat" }) } });
  await worker.dispatch("push", { data: null });
  assert.deepEqual(worker.shown.map(({ title, options }) => [title, options.body, options.tag, options.renotify, options.data.url]), [
    ["Bajó de precio", "Fender Stratocaster ahora S/ 3,200", "laria-avisos", false, "/instrumentos/fender-strat"],
    ["Laria", "Tienes un aviso nuevo.", "laria-avisos", false, "/mi-cuenta/notificaciones"],
  ]);
  assert.equal(worker.shown[0].options.icon, "/icons/icon-192.png");
  assert.equal(worker.shown[0].options.badge, "/icons/badge-96.png");
  const tap = (url) => worker.dispatch("notificationclick", { notification: { data: { url }, close: () => {} } });
  await tap("/instrumentos/fender-strat");
  await tap("https://otro.pe/estafa");
  assert.deepEqual(worker.opened, [`${worker.origin}/instrumentos/fender-strat`]);
});

test("/compartir opens the right listing form, waits for sign-in and is never indexed (big-12)", async () => {
  const site = load("lib/site.ts");
  assert.ok(site.NON_INDEXABLE_PATH_PREFIXES.includes("/compartir"));
  const page = load("app/compartir/page.tsx", { "@/components/share-receiver": { ShareReceiver: () => null } });
  assert.deepEqual(page.metadata.robots, site.NOINDEX_ROBOTS);
  // Without the worker (the first share right after installing), the share address says nothing arrived.
  const fallback = load("app/compartir/recibir/route.ts");
  const posted = await fallback.POST(new Request("https://laria.pe/compartir/recibir", { method: "POST" }));
  assert.equal(posted.status, 303);
  assert.equal(posted.headers.get("location"), "https://laria.pe/compartir?fotos=0");
  // A store owner gets the store's form, as /vender does; everyone else the Particular form.
  const receiver = source("components/share-receiver.tsx");
  assert.match(receiver, /\$\{account\.storeOwner \? "\/mi-cuenta\/tienda\/publicar" : "\/mi-cuenta\/publicar"\}\?\$\{SHARED_PHOTOS_PARAM\}=1/);
  assert.match(receiver, /const opening = ready && count > 0 && account\.authenticated;/);
  assert.match(receiver, /getLoginPath\("\/compartir"\)/);
  assert.match(receiver, /peekSharedPhotos\(\)/);
  assert.doesNotMatch(receiver, /takeSharedPhotos/, "only the form takes the photos");
  // Before the photos are counted the page says it is receiving them.
  const { ShareReceiver } = load("components/share-receiver.tsx", {
    "next/link": linkMock,
    "next/navigation": navigationMock("/compartir", { replace: () => {} }),
    "@/components/marketplace-account-provider": { useMarketplaceAccount: () => ({ settled: false, authenticated: false, storeOwner: false }) },
  });
  assert.match(renderToStaticMarkup(React.createElement(ShareReceiver)), /<h1 class="t-page text-ink">Recibiendo tus fotos…<\/h1><p role="status"[^>]*><\/p>/);
});
