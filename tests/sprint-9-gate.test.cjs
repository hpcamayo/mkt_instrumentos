// Regressions for the failed Sprint 9 production gate (2026-09-27).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");

function load(file, mocks = {}, transform = (value) => value, cache = new Map()) {
  const resolved = path.resolve(root, file);
  if (cache.has(resolved)) return cache.get(resolved).exports;
  const compiled = ts.transpileModule(transform(fs.readFileSync(resolved, "utf8")), {
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
        if (fs.existsSync(path.join(root, relative + ext))) return load(relative + ext, mocks, (value) => value, cache);
      }
    }
    return original(name);
  };
  mod._compile(compiled, resolved);
  return mod.exports;
}

const linkMock = { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) };

function renderAdminDomain(domain, item, transform) {
  const editorProps = [];
  const editor = (kind) => function EditorStub(props) {
    editorProps.push({ kind, ...props });
    return React.createElement("div", { "data-editor": kind, "data-status": props.status });
  };
  const { AdminDomainView } = load("components/admin-domain-view.tsx", {
    "next/link": linkMock,
    "next/navigation": { useRouter: () => ({ push() {}, refresh() {} }), usePathname: () => `/admin/${domain}` },
    "next/image": (props) => React.createElement("img", props),
    "@/lib/supabase/browser-client": { getSupabaseBrowserClient: () => null },
    "@/components/admin-invite-user": { AdminInviteUser: () => null },
    "@/components/admin-record-editors": { AdminListingEditor: editor("listing"), AdminStoreEditor: editor("store") },
  }, transform);
  const html = renderToStaticMarkup(React.createElement(AdminDomainView, {
    domain, payload: { items: [item], total: 30, page: 1, page_size: 24 },
    search: "", status: "pending", ownerType: "", targetType: "", reason: "", userSearch: "", userPage: 1, loadError: null,
  }));
  return { html, editorProps };
}

const store = { id: "11111111-1111-4111-8111-111111111111", name: "Tienda QA", slug: "tienda-qa", status: "active", is_verified: true, created_at: "2026-09-20T12:00:00Z" };
const listing = { id: "22222222-2222-4222-8222-222222222222", title: "Guitarra QA", slug: "guitarra-qa", status: "approved", created_at: "2026-09-20T12:00:00Z" };

test("/admin/tiendas and /admin/publicaciones server-render cards with each record's own status", () => {
  assert.equal(typeof globalThis.status, "undefined", "Node has no window.status, exactly like production SSR");
  const stores = renderAdminDomain("tiendas", store);
  assert.match(stores.html, /Tienda QA/);
  assert.match(stores.html, /data-editor="store" data-status="active"/);
  assert.deepEqual(stores.editorProps.map(({ kind, storeId, status, isVerified }) => ({ kind, storeId, status, isVerified })), [{ kind: "store", storeId: store.id, status: "active", isVerified: true }]);
  // The filter prop (`pending`) must not leak into the record editor.
  const listings = renderAdminDomain("publicaciones", listing);
  assert.match(listings.html, /data-editor="listing" data-status="approved"/);
  // Filters and pagination keep working: 30 results at 24 per page, filter state preserved.
  assert.match(listings.html, /Página 1 de 2/);
  assert.match(listings.html, /href="\/admin\/publicaciones\?estado=pending&amp;pagina=2"/);
});

test("the pre-fix DomainCard reproduces the production ReferenceError", () => {
  const prefix = (value) => value.replace(/\n\s*\/\/ Current record status[^\n]*\n[^\n]*\n\s*const status = adminString\(item, "status"\);/, "");
  assert.throws(() => renderAdminDomain("tiendas", store, prefix), /status is not defined/);
});

test("bare browser globals are lint errors in server-rendered source", () => {
  const config = fs.readFileSync(path.join(root, "eslint.config.mjs"), "utf8");
  assert.match(config, /"no-restricted-globals"/);
  assert.match(config, /"status", "name", "event"/);
});

test("homepage and representative public pages declare an absolute og:url matching their canonical", () => {
  const seo = load("lib/seo.ts");
  const home = seo.buildHomeMetadata();
  assert.equal(home.openGraph.url, "https://laria.audio/");
  assert.equal(home.alternates.canonical, "https://laria.audio/");
  assert.equal(home.openGraph.siteName, "Laria");
  assert.ok(home.openGraph.title && home.openGraph.description);
  const homePage = fs.readFileSync(path.join(root, "app/page.tsx"), "utf8");
  assert.match(homePage, /export const metadata: Metadata = buildHomeMetadata\(\);/);
  const categories = load("lib/category-pages.ts");
  const guitars = categories.getCategoryLandingBySlug("guitarras");
  const pages = [
    seo.buildCatalogMetadata({}, 1),
    seo.buildCategoryMetadata(guitars, 1, 3),
    seo.buildStoreMetadata({ name: "Tienda QA", slug: "tienda-qa", description: null, city: "Lima", district: null, logo_url: null }, 1),
    ...["terminos", "privacidad", "articulos-prohibidos", "consejos-de-seguridad"].map((route) => load(`app/${route}/page.tsx`, { "next/link": linkMock }).metadata),
  ];
  for (const metadata of pages) {
    assert.ok(metadata.openGraph?.url, JSON.stringify(metadata.alternates));
    assert.equal(metadata.openGraph.url, metadata.alternates.canonical);
  }
  // The root layout must not set a site-wide og:url that every page would inherit.
  assert.doesNotMatch(fs.readFileSync(path.join(root, "app/layout.tsx"), "utf8"), /url:/);
});

test("Googlebot receives blocking <head> metadata while Next's default HTML-limited bots are kept", () => {
  const config = load("next.config.ts").default;
  const { HTML_LIMITED_BOT_UA_RE } = require("next/dist/shared/lib/router/utils/html-bots");
  const { shouldServeStreamingMetadata } = require("next/dist/server/lib/streaming-metadata");
  assert.ok(config.htmlLimitedBots instanceof RegExp);
  assert.ok(config.htmlLimitedBots.source.includes(HTML_LIMITED_BOT_UA_RE.source), "every Next.js default bot stays HTML-limited");
  const userAgents = {
    googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    googlebotSmartphone: "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    bingbot: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    facebook: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  };
  // Next.js serializes the setting to its source and rebuilds it case-insensitively at runtime.
  for (const [name, userAgent] of Object.entries(userAgents)) {
    assert.equal(shouldServeStreamingMetadata(userAgent, config.htmlLimitedBots.source), false, `${name} gets blocking metadata`);
  }
  const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
  assert.equal(shouldServeStreamingMetadata(chrome, config.htmlLimitedBots.source), true, "visitors keep streamed metadata and the loading skeleton");
  assert.equal(shouldServeStreamingMetadata(userAgents.googlebot, undefined), true, "without the setting Next streams Googlebot's metadata (the original defect)");
});

test("catalog og:url always names the same page as its canonical (pagination, category aliases, filters)", () => {
  const seo = load("lib/seo.ts");
  const { categoryLandingPages } = load("lib/category-pages.ts");
  const cases = [
    [{}, 1, "/listados"],
    [{ page: "2" }, 2, "/listados?page=2"],
    [{ utm_source: "ig", brand: "" }, 1, "/listados"],
    [{ sort: "" }, 3, "/listados?page=3"],
    ...categoryLandingPages.flatMap((landing) => [
      [{ category: landing.category }, 1, `/instrumentos/${landing.slug}`],
      [{ category: landing.category, page: "2", utm_campaign: "x" }, 2, `/instrumentos/${landing.slug}?page=2`],
    ]),
  ];
  for (const [params, page, expected] of cases) {
    const metadata = seo.buildCatalogMetadata(params, page);
    assert.equal(metadata.alternates?.canonical, expected, JSON.stringify(params));
    assert.equal(metadata.openGraph.url, expected, `og:url for ${JSON.stringify(params)}`);
    assert.equal(metadata.robots, undefined);
  }
  const drums = seo.buildCatalogMetadata({ category: "drums" }, 1);
  assert.equal(drums.title, "Baterías en venta en Perú");
  assert.match(drums.openGraph.title, /^Baterías en venta en Perú \| Laria$/);
  const filtered = seo.buildCatalogMetadata({ category: "guitars", brand: "Fender", pickups: ["hss", "sss"], utm_source: "ig" }, 2);
  assert.deepEqual(filtered.robots, { index: false, follow: true });
  assert.equal(filtered.alternates, undefined, "filtered combinations have no canonical");
  assert.equal(filtered.openGraph.url, "/listados?category=guitars&brand=Fender&pickups=hss&pickups=sss&page=2");
  assert.equal(seo.buildCatalogMetadata({ category: "unknown" }, 1).openGraph.url, "/listados?category=unknown");
});

test("the SEO smoke's category list matches lib/category-pages.ts", () => {
  const { categoryLandingPages } = load("lib/category-pages.ts");
  const { CATEGORY_LANDINGS } = require("./seo-rendered-metadata-smoke.cjs");
  assert.deepEqual(
    CATEGORY_LANDINGS,
    categoryLandingPages.map((landing) => ({ category: landing.category, slug: landing.slug })),
  );
});

test("top-level categories link to their Spanish landing and type links never repeat the category", () => {
  const categories = load("lib/category-pages.ts");
  const { instrumentTypesByCategory } = load("lib/listing-submission.ts");
  const expected = {
    guitars: "guitarras", basses: "bajos", drums: "baterias", cymbals: "platillos",
    microphones: "microfonos", pedals: "pedales", amplifiers: "amplificadores", "audio interfaces": "interfaces-de-audio",
  };
  assert.deepEqual(Object.fromEntries(categories.categoryLandingPages.map((page) => [page.category, page.slug])), expected);
  for (const [category, slug] of Object.entries(expected)) {
    assert.equal(categories.categoryLandingPath(category), `/instrumentos/${slug}`);
  }

  // UX-3b: the home's "Explora por categoría" tiles (components/home/home-sections.tsx) link every landing.
  const { CategoryTiles } = load("components/home/home-sections.tsx", {
    "next/link": linkMock,
    "@/components/listing-card": { ListingCard: () => null },
    "@/components/marketplace-image": { MarketplaceImage: () => null },
  });
  const { categoryOptions } = load("lib/listings.ts");
  const home = renderToStaticMarkup(React.createElement(CategoryTiles, { counts: { cymbals: 3 } }));
  assert.match(home, /href="\/instrumentos\/platillos"/);
  assert.doesNotMatch(home, /href="\/listados\?/);
  assert.deepEqual([...home.matchAll(/href="([^"]+)"/g)].map((match) => match[1]), Object.values(expected).map((slug) => `/instrumentos/${slug}`));

  // Mirror types resolve to the landing; narrower types keep instrument_type.
  assert.equal(categories.categoryTypePath("cymbals", "cymbals"), "/instrumentos/platillos");
  assert.equal(categories.categoryTypePath("audio interfaces", "audio_interface"), "/instrumentos/interfaces-de-audio");
  assert.equal(categories.categoryTypePath("guitars", "electric_guitar"), "/listados?category=guitars&instrument_type=electric_guitar");
  assert.equal(categories.categoryTypePath("cymbals", "other"), "/listados?category=cymbals&instrument_type=other");
  for (const [category, types] of Object.entries(instrumentTypesByCategory)) {
    for (const type of types) {
      const href = categories.categoryTypePath(category, type);
      if (href.startsWith("/listados?")) {
        const params = new URLSearchParams(href.split("?")[1]);
        assert.notEqual(params.get("instrument_type"), params.get("category"), href);
      }
    }
  }

  // The category strip (UX-2), the listing breadcrumbs and the landing type chips build category and type links
  // only through the shared helpers.
  const shell = load("lib/shell.ts");
  for (const option of categoryOptions) {
    assert.equal(shell.stripItems.find((item) => item.key === option.value).href, categories.categoryLandingPath(option.value), option.value);
    // The restored category menus (N12) offer every canonical type through the same helper.
    const menu = shell.categoryMenus.find((item) => item.key === option.value);
    assert.equal(menu.href, categories.categoryLandingPath(option.value), option.value);
    assert.deepEqual(menu.types.map((type) => type.href), instrumentTypesByCategory[option.value].map((type) => categories.categoryTypePath(option.value, type)), option.value);
  }
  assert.deepEqual(
    shell.listingBreadcrumbs({ category: "guitars", instrument_type: "electric_guitar" }, "Fender Stratocaster").map((crumb) => crumb.href ?? null),
    ["/", "/listados", "/instrumentos/guitarras", "/listados?category=guitars&instrument_type=electric_guitar", null],
  );
  // A type that mirrors its category (or "other") adds no level that would repeat the category.
  for (const [category, type] of [["cymbals", "cymbals"], ["drums", "drums"], ["guitars", "other"]]) {
    assert.deepEqual(shell.listingBreadcrumbs({ category, instrument_type: type }, "X").length, 4, `${category}/${type}`);
  }
  const nav = fs.readFileSync(path.join(root, "components/global-categories.tsx"), "utf8");
  const shellSource = fs.readFileSync(path.join(root, "lib/shell.ts"), "utf8");
  const landing = fs.readFileSync(path.join(root, "components/category-landing.tsx"), "utf8");
  assert.match(shellSource, /categoryTypePath\(listing\.category, type\)/);
  assert.match(landing, /href=\{categoryTypePath\(landing\.category, type\.value\)\}/);
  for (const source of [nav, shellSource]) assert.doesNotMatch(source, /URLSearchParams|instrument_type=/);
  assert.doesNotMatch(landing, /instrument_type:/);

  // Catalog category filtering keeps the internal enum and its canonical/noindex behavior.
  const seo = load("lib/seo.ts");
  assert.equal(`/listados?${new URLSearchParams({ category: "cymbals" })}`, "/listados?category=cymbals");
  assert.equal(seo.buildCatalogMetadata({ category: "cymbals" }, 1).alternates.canonical, "/instrumentos/platillos");
  const narrowed = seo.buildCatalogMetadata({ category: "guitars", instrument_type: "electric_guitar" }, 1);
  assert.deepEqual(narrowed.robots, { index: false, follow: true });
  assert.equal(narrowed.openGraph.url, "/listados?category=guitars&instrument_type=electric_guitar");
});
