// UX-3b, the home (docs/ux-redesign/ux-3-discovery.md § Home): the banner pick (one of nine, chosen per request, only
// its image preloaded, decorative), the vitrina selection (H2, Q12), the feed exclusion, the counts (Q10 B), the
// sections in order, the H4 promises and the states (§ States, home column).
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
// The cards are client components with their own tests (ux-discovery.test.cjs); here they show what the home passes.
const cardMock = {
  ListingCard: ({ listing, variant = "grid", source: from, headingLevel, eager }) =>
    React.createElement("article", { "data-variant": variant, "data-source": from, "data-heading": headingLevel, "data-eager": eager ? "" : undefined }, listing.title),
};
const banners = load("lib/home-banner.ts");
const home = load("lib/home.ts");

const listing = (id, category, published_at, overrides = {}) => ({
  id, title: `Publicación ${id}`, slug: `publicacion-${id}`, category, brand: null, model: null, condition: "Nuevo", price_pen: 100,
  instrument_type: null, attributes: null, published_at, view_count: 0, city: "Lima", region: "Lima", seller_type: "individual",
  created_at: "2026-01-01T00:00:00Z", photo_count: 3, stores: null, listing_photos: [], ...overrides,
});

test("the banner is one of the nine decided pieces, picked uniformly per request (H7, H11)", () => {
  const manifest = JSON.parse(source("docs/ux-redesign/art/rotation/manifest.json"));
  const ids = (manifest.banners ?? manifest.items ?? manifest.pieces ?? Object.values(manifest).find(Array.isArray)).map((piece) => piece.id);
  assert.deepEqual(banners.HOME_BANNERS.map((banner) => banner.id), ids);
  assert.equal(ids.length, 9);
  for (const banner of banners.HOME_BANNERS) {
    for (const file of [...Object.values(banner.desktop), ...Object.values(banner.phone)]) {
      assert.ok(fs.existsSync(path.join(root, "public", file)), file);
    }
  }
  assert.equal(banners.pickHomeBanner(0).id, "diablada");
  assert.equal(banners.pickHomeBanner(0.9999999).id, "guitarra-amplificador");
  assert.deepEqual(new Set(Array.from({ length: 9 }, (_, index) => banners.pickHomeBanner((index + 0.5) / 9).id)), new Set(ids));
  // Picked on the server each time the cached page is rebuilt (launch audit A19: at most once a minute).
  const page = source("app/page.tsx");
  assert.match(page, /export const revalidate = 60;/);
  assert.doesNotMatch(page, /force-dynamic/);
  assert.match(page, /export default async function HomePage\(\) \{\s*const banner = pickHomeBanner\(\);/);
});

function renderBanner(banner) {
  const preloads = [];
  const { HomeBanner } = load("components/home/home-banner.tsx", { "react-dom": { preload: (href, options) => preloads.push({ href, ...options }) } });
  return { html: renderToStaticMarkup(React.createElement(HomeBanner, { banner })), preloads };
}

test("only the chosen piece is preloaded and loaded, one file per viewport; the art is decorative (P11 exception, H11)", () => {
  const banner = banners.pickHomeBanner(4.5 / 9);
  const { html, preloads } = renderBanner(banner);
  assert.deepEqual(preloads, [
    { href: banner.desktop.webp1x, as: "image", type: "image/webp", imageSrcSet: `${banner.desktop.webp1x} 1x, ${banner.desktop.webp2x} 2x`, media: "(min-width: 768px)", fetchPriority: "high" },
    { href: banner.phone.webp1x, as: "image", type: "image/webp", imageSrcSet: `${banner.phone.webp1x} 1x, ${banner.phone.webp2x} 2x`, media: "(max-width: 767px)", fetchPriority: "high" },
  ]);
  assert.equal((html.match(/<img /g) ?? []).length, 1);
  assert.match(html, /<img src="\/banners\/05-tarola-clarinetes-desktop@2x\.jpg" alt="" width="1440" height="300" fetchPriority="high"[^>]*class="h-full w-full object-cover object-center"\/>/);
  for (const other of banners.HOME_BANNERS.filter((item) => item.id !== banner.id)) assert.doesNotMatch(html, new RegExp(other.id), other.id);
  assert.match(html, /<source media="\(min-width: 768px\)" type="image\/webp" srcSet="\/banners\/05-tarola-clarinetes-desktop\.webp 1x, \/banners\/05-tarola-clarinetes-desktop@2x\.webp 2x"\/>/);
  assert.match(html, /<source media="\(max-width: 767px\)" srcSet="\/banners\/05-tarola-clarinetes-phone@2x\.jpg"\/>/);
  // Fixed heights: the 300 px band from 768 px; on phones the strip is cut to 390×72 (Effortless Laria BIG 01) with the
  // 40 px fade into frame black.
  assert.match(html, /<section aria-labelledby="inicio-titulo" class="surface-frame relative bg-frame text-surface md:h-\[300px\]"/);
  assert.match(html, /class="relative aspect-\[390\/72\] w-full overflow-hidden md:absolute md:inset-0 md:aspect-auto md:h-full"/);
  assert.match(html, /<div aria-hidden="true" class="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-frame\/0 to-frame md:hidden"><\/div>/);
});

test("the banner text and search: H6 headline, the lead from 768 px, the free-text search with Explorar and no event of its own", () => {
  const { html } = renderBanner(banners.HOME_BANNERS[0]);
  assert.match(html, /<h1 id="inicio-titulo" class="t-display max-md:text-\[28px\] max-md:leading-8">El mercado de instrumentos del Perú<\/h1>/);
  // BIG 01: the lead is left out on phones, so the search and the first instruments come sooner.
  assert.match(html, /text-line-deco max-md:hidden[^"]*">Nuevos y usados, de músicos y tiendas de todo el país\.<\/p>/);
  const form = html.match(/<form [^>]*>/)[0];
  for (const attribute of ['role="search"', 'action="/listados"', 'method="get"', "max-w-[640px]"]) assert.ok(form.includes(attribute), attribute);
  assert.match(html, /<label class="sr-only" for="busqueda-inicio">Buscar en el catálogo<\/label>/);
  // BIG 03: one free-text box (q); without JavaScript it is a plain GET form.
  const input = html.match(/<input [^>]*>/)[0];
  for (const attribute of ['id="busqueda-inicio"', 'name="q"', 'type="search"', 'placeholder="Busca guitarras, marcas, modelos…"']) assert.ok(input.includes(attribute), attribute);
  assert.match(html, /<div class="surface-light flex h-14 [^"]*md:h-16[^"]*">/);
  assert.match(html, /<button type="submit" class="[^"]*h-\[52px\][^"]*bg-action[^"]*max-md:h-11[^"]*">Explorar<\/button>/);
  assert.doesNotMatch(source("components/home/home-banner.tsx"), /useMarketplaceEvents|trackEvent|sendEvent|"use client"/);
  assert.match(source("components/global-search.tsx"), /import \{ SEARCH_LABEL, SEARCH_PLACEHOLDER \} from "@\/lib\/shell";/);
});

test("seller keys: a short hash of the store or owner, never the id itself (BIG 01)", () => {
  const a = home.sellerKey({ id: "l1", store_id: "s1", owner_user_id: "u1" });
  assert.equal(a, home.sellerKey({ id: "l2", store_id: "s1", owner_user_id: "u2" }), "same store, same key");
  assert.notEqual(a, home.sellerKey({ id: "l3", store_id: "s2" }));
  assert.equal(home.sellerKey({ id: "l4", owner_user_id: "u9" }), home.sellerKey({ id: "l5", owner_user_id: "u9" }));
  assert.match(a, /^[0-9a-f]{12}$/);
  assert.ok(!a.includes("s1"));
});

// A stand-in for the public Supabase client that records each query's calls and answers through `respond`.
function fakeClient(respond) {
  const queries = [];
  return {
    queries,
    from(table) {
      const query = { table, calls: [] };
      queries.push(query);
      const builder = new Proxy({}, {
        get(_, name) {
          if (name === "then") return (resolve, reject) => Promise.resolve(respond(query)).then(resolve, reject);
          return (...args) => { query.calls.push([name, ...args]); return builder; };
        },
      });
      return builder;
    },
  };
}
const called = (query, name, ...args) => query.calls.some(([callName, ...callArgs]) => callName === name && JSON.stringify(callArgs.slice(0, args.length)) === JSON.stringify(args));
const valueOf = (query, name, column) => query.calls.find(([callName, key]) => callName === name && key === column)?.[2];

function respondLocal({ failing } = {}) {
  return (query) => {
    if (query.table === "stores") return { data: [{ id: "s1", name: "Casa Musical Grau", slug: "casa-musical-grau", city: "Lima", district: null, logo_url: null }], error: null };
    if (called(query, "select", "id")) return { data: null, count: valueOf(query, "eq", "category") ? 2 : 12, error: null };
    if (called(query, "not", "recent_price_drop_at", "is", null)) return failing === "drops" ? { data: null, error: { message: "boom" } } : { data: [listing("d1", "basses", "2026-04-20T00:00:00Z")], error: null };
    if (failing === "pool") return { data: null, error: { message: "boom" } };
    return { data: [listing("a", "guitars", "2026-04-19T17:00:00Z", { owner_user_id: "u1" }), listing("b", "basses", "2026-04-24T14:05:00Z", { store_id: "s1", owner_user_id: "u2" })], error: null };
  };
}

test("home data: the newest 48 for Para ti with hashed sellers, the price drops, the shared counts, three stores", async () => {
  const client = fakeClient(respondLocal());
  // docs/operations/catalog-performance.md: the counts come from the shared type counts, not eleven exact counts.
  const shared = { categories: { guitars: 10, percussion: 2 }, types: {}, total: 12 };
  const data = await home.fetchHomeData(client, Promise.resolve(shared));
  const listingQueries = client.queries.filter((query) => query.table === "listings");
  assert.equal(listingQueries.filter((query) => called(query, "select", "id", { count: "exact", head: true })).length, 0, "no per-category counts");
  assert.equal(listingQueries.length, 2);
  const pool = listingQueries.find((query) => called(query, "limit", 48));
  assert.ok(pool && called(pool, "eq", "status", "approved") && called(pool, "order", "published_at", { ascending: false, nullsFirst: false }));
  assert.match(pool.calls.find(([name]) => name === "select")[1], /owner_user_id/);
  const drops = listingQueries.find((query) => called(query, "not", "recent_price_drop_at", "is", null));
  assert.ok(called(drops, "limit", 6) && called(drops, "order", "recent_price_drop_at", { ascending: false }));
  const stores = client.queries.find((query) => query.table === "stores");
  assert.ok(called(stores, "eq", "status", "active") && called(stores, "eq", "is_verified", true) && called(stores, "limit", 3));

  assert.deepEqual(data.pool.map((item) => item.id), ["b", "a"], "catalog order");
  assert.ok(data.pool.every((item) => /^[0-9a-f]{12}$/.test(item.seller_key) && !("owner_user_id" in item)), "only the hash leaves the server");
  assert.equal(data.pool[0].seller_key, home.sellerKey({ id: "b", store_id: "s1" }));
  assert.deepEqual(data.priceDrops.map((item) => item.id), ["d1"]);
  assert.equal(data.total, 12);
  assert.equal(data.categoryCounts.percussion, 2);
  assert.equal(data.categoryCounts.basses, 0, "a category the counts do not name has no listings");
  assert.equal(data.stores.length, 1);
  const unknown = await home.fetchHomeData(fakeClient(respondLocal()), null);
  assert.equal(unknown.total, null);
  assert.deepEqual(unknown.categoryCounts, {}, "unavailable counts show no numbers, never zeros");
});

test("a failed query leaves its section's data null and is logged", async () => {
  const errors = [];
  const original = console.error;
  console.error = (message) => errors.push(message);
  try {
    const data = await home.fetchHomeData(fakeClient(respondLocal({ failing: "drops" })), null);
    assert.equal(data.priceDrops, null);
    assert.equal(data.pool.length, 2);
    assert.deepEqual(errors, ["Home: the price drop query failed: boom"]);
  } finally {
    console.error = original;
  }
});

async function renderHome(data, random = 0, cacheBuild = { renderPerRequestIfBuilding: async () => {} }) {
  const preloads = [];
  const { default: HomePage } = load("app/page.tsx", {
    "@/lib/cache-build": cacheBuild,
    "next/link": linkMock,
    "react-dom": { preload: (href) => preloads.push(href) },
    "@/components/listing-card": cardMock,
    "@/components/marketplace-image": { MarketplaceImage: (props) => React.createElement("img", { src: props.src, alt: props.alt }) },
    "@/lib/supabase/public-client": { warnMissingSupabaseEnv() {} },
    "@/lib/supabase/public-read-client": { getRequestReads: () => ({ supabase: {}, deadline: {} }), optionalReadSignal: () => undefined },
    "@/lib/catalog-brands": { getListingCounts: async () => null },
    "@/lib/home": { ...home, fetchHomeData: async () => data },
    // The discovery batch's collections row (docs/feature-ideas/discovery.md); none here, so only the gift card shows.
    "@/lib/discovery/data": { getCurrentCollections: async () => null },
    // feature-ideas services (bet-02): no services here, so the teaser stays out (tests/services.test.cjs renders it).
    "@/lib/services-counts": { getServiceKindCounts: async () => null },
    // Signed-in only, read after load (save-12, UXD-integration-10): nothing in the server render.
    "@/components/home/home-followed": { HomeFollowedArrivals: () => null },
  });
  const realRandom = Math.random;
  Math.random = () => random;
  try {
    return { html: renderToStaticMarkup(await HomePage()), preloads };
  } finally {
    Math.random = realRandom;
  }
}
const FULL = {
  pool: Array.from({ length: 14 }, (_, index) => ({ ...listing(`f${index}`, "guitars", `2026-04-${String(28 - index).padStart(2, "0")}T00:00:00Z`), seller_key: `k${index % 3}` })),
  priceDrops: [listing("d1", "basses", "2026-04-20T00:00:00Z")],
  total: 262,
  categoryCounts: { guitars: 86, basses: 21, keyboards: 7, percussion: 39, winds: 1, strings: 0, pedals: 45, amplifiers: 19, microphones: 24, audio: 12, andean: 0 },
  stores: [
    { id: "s1", name: "Casa Musical Grau", slug: "casa-musical-grau", city: "Lima", district: "Cercado", logo_url: null },
    { id: "s2", name: "Andes Sonido", slug: "andes-sonido", city: "Huancayo", district: null, logo_url: null },
  ],
};
const headings = (html) => [...html.matchAll(/<h2 [^>]*>([^<]+)<\/h2>/g)].map((match) => match[1]);

test("the home: banner, category chips, then instruments right away, then the decided sections; one h1 (BIG 01)", async () => {
  const { html, preloads } = await renderHome(FULL, 0.99);
  // Before the device is read (and without JavaScript) "Para ti" is the plain newest first.
  assert.deepEqual(headings(html), ["Categorías", "Lo más nuevo", "Bajaron de precio", "Ideas para buscar", "Cómo funciona Laria", "Tiendas verificadas", "¿Tienes equipo que ya no usas?"]);
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
  assert.match(html, /<script type="application\/ld\+json">\{"@context":"https:\/\/schema.org","@type":"Organization"/);
  assert.match(html, /data-banner="guitarra-amplificador"/);
  assert.equal(preloads.length, 2);
  assert.match(html, /class="mx-auto w-full max-w-page px-4 sm:px-6 lg:px-8 flex flex-col gap-8 pb-8 pt-4 md:gap-12 md:pb-12 md:pt-6"/);
  assert.match(source("app/page.tsx"), /export const metadata: Metadata = buildHomeMetadata\(\);/);
});

test("Para ti, price drops and category chips: twelve cards, six on phones, empty categories left out (BIG 01, FIND 06, FIND 10)", async () => {
  const { html } = await renderHome(FULL);
  const forYou = html.slice(html.indexOf('aria-labelledby="para-ti-titulo"'), html.indexOf('aria-labelledby="bajaron-titulo"'));
  assert.equal((forYou.match(/<article data-variant="grid" data-source="home" data-heading="3"/g) ?? []).length, 12);
  assert.equal((forYou.match(/<li class="min-w-0 max-md:hidden">/g) ?? []).length, 6, "phones show the first six cards");
  assert.match(forYou, /<a href="\/listados" class="[^"]*">Ver las 262 publicaciones<\/a>/);
  assert.match(forYou, /Lo más reciente primero\. Se ordena según lo que mires\./);
  const drops = html.slice(html.indexOf('aria-labelledby="bajaron-titulo"'), html.indexOf('id="como-funciona"'));
  assert.match(drops, /href="\/listados\?sort=price_drop"/);
  assert.equal((drops.match(/<article /g) ?? []).length, 1);
  const categories = html.slice(html.indexOf('aria-labelledby="categorias-titulo"'), html.indexOf('aria-labelledby="para-ti-titulo"'));
  assert.match(categories, /href="\/instrumentos\/guitarras"[^>]*>.*Guitarras.*86.* publicaciones/);
  assert.doesNotMatch(categories, /instrumentos\/cuerdas/, "Cuerdas has no listings");
  assert.equal((categories.match(/href="\/instrumentos\//g) ?? []).length, 9);
});

test("Cómo funciona Laria carries H4 promises 2–5 and the safety line, with no email promise on the home (H4)", async () => {
  const { html } = await renderHome(FULL);
  assert.match(html, /<section id="como-funciona" aria-labelledby="como-funciona-titulo" class="rounded-panel bg-canvas/);
  for (const text of [
    "Laria conecta a quien compra con quien vende. No procesa pagos ni envíos: eso lo acuerdan ustedes.",
    "Cada publicación la revisa Laria o viene de una tienda verificada.",
    "Antes de darles la insignia, Laria revisa a mano su RUC, dirección y contacto.",
    "Solo se reseña después de una compra que comprador y vendedor confirmaron en Laria.",
    "Hablas con quien vende y acuerdan pago y entrega. Laria no cobra comisión.",
    "Si puedes, revisa el equipo en persona antes de pagar. No adelantes pagos por Yape o Plin a quien no conoces.",
    "Publicar es gratis. Revisamos tu publicación antes de mostrarla.",
  ]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /correo|email|te avisamos/i);
  assert.match(html, /href="\/consejos-de-seguridad"/);
  // The sell block's yellow action, and the stores without stats (Q18 A) with the "¿Tienes una tienda?" tile.
  assert.match(html, /<a href="\/vender" class="[^"]*h-\[52px\][^"]*bg-action[^"]*">Vender mi equipo<\/a>/);
  const stores = html.slice(html.indexOf('aria-labelledby="tiendas-titulo"'), html.indexOf('aria-labelledby="vender-titulo"'));
  // find-13: "Ver todas" opens the stores directory (was N7's catalog filtered to verified stores).
  assert.match(stores, /<a href="\/tiendas" class="link [^"]*">Ver todas<\/a>/);
  assert.equal((stores.match(/<a href="\/tiendas\//g) ?? []).length, 2);
  assert.match(stores, /<span aria-hidden="true" class="grid h-10 w-10 shrink-0 place-items-center rounded-tag bg-frame-2 [^"]*text-white">CM<\/span>/);
  assert.match(stores, />Cercado, Lima</);
  assert.match(stores, /Tienda verificada/);
  assert.doesNotMatch(stores, /publicaciones|ventas/);
  assert.match(stores, /¿Tienes una tienda\?[\s\S]*Publica tu inventario, recibe consultas por WhatsApp y muestra tu verificación\.[\s\S]*href="\/registrar-tienda"/);
});

test("states: failed listing queries leave their sections out; an empty marketplace shows the empty feed; no stores hides them", async () => {
  const none = { pool: null, priceDrops: null, total: null, categoryCounts: {}, stores: null };
  // Launch audit A19: a failed feed is never cached. The page throws, so visitors keep the last good copy; during the
  // deploy it first gives up being prerendered (lib/cache-build.ts), so that deployment renders the home per request.
  const asked = [];
  await assert.rejects(renderHome(none, 0, { renderPerRequestIfBuilding: async (page) => { asked.push(page); } }), /The home feed could not be read/);
  assert.deepEqual(asked, ["/"]);
  const building = { renderPerRequestIfBuilding: async () => { throw new Error("Dynamic server usage: connection"); } };
  await assert.rejects(renderHome(none, 0, building), /Dynamic server usage/);
  assert.doesNotMatch(source("app/page.tsx"), /FeedUnavailable|role="alert"/, "no failure state that a cache could keep");
  const noCounts = (await renderHome({ ...FULL, total: null })).html;
  assert.match(noCounts, /<a href="\/listados" class="[^"]*">Ver todo el catálogo<\/a>/);
  const empty = (await renderHome({ pool: [], priceDrops: [], total: 0, categoryCounts: {}, stores: [] })).html;
  assert.deepEqual(headings(empty), ["Categorías", "Recién publicados", "Ideas para buscar", "Cómo funciona Laria", "¿Tienes equipo que ya no usas?"]);
  assert.match(empty, /<h3 class="t-section text-ink">Aún no hay publicaciones<\/h3>[\s\S]*Las primeras publicaciones aparecerán aquí\.[\s\S]*<a href="\/vender"[^>]*>Publicar un instrumento<\/a>/);
});

