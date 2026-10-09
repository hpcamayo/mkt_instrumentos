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
  // Picked on the server for every request: the page is dynamic and picks inside the request.
  const page = source("app/page.tsx");
  assert.match(page, /export const dynamic = "force-dynamic";/);
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
  // Fixed heights: the 300 px band from 768 px; the 390×150 strip and the 40 px fade into frame black on phones.
  assert.match(html, /<section aria-labelledby="inicio-titulo" class="surface-frame relative bg-frame text-surface md:h-\[300px\]"/);
  assert.match(html, /class="relative aspect-\[390\/150\] w-full overflow-hidden md:absolute md:inset-0 md:aspect-auto md:h-full"/);
  assert.match(html, /<div aria-hidden="true" class="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-frame\/0 to-frame md:hidden"><\/div>/);
});

test("the banner text and search: H6 headline, the lead, the brand search with Explorar and no event of its own (N8)", () => {
  const { html } = renderBanner(banners.HOME_BANNERS[0]);
  assert.match(html, /<h1 id="inicio-titulo" class="t-display max-md:text-\[28px\] max-md:leading-8">El mercado de instrumentos del Perú<\/h1>/);
  assert.match(html, /text-line-deco[^"]*">Nuevos y usados, de músicos y tiendas de todo el país\.<\/p>/);
  // A GET form to /listados with the brand only (attribute order is React's).
  const form = html.match(/<form [^>]*>/)[0];
  for (const attribute of ['role="search"', 'action="/listados"', 'method="get"', "max-w-[640px]"]) assert.ok(form.includes(attribute), attribute);
  assert.match(html, /<label class="sr-only" for="busqueda-inicio">Buscar por marca en el catálogo<\/label>/);
  const input = html.match(/<input [^>]*>/)[0];
  for (const attribute of ['id="busqueda-inicio"', 'name="brand"', 'type="search"', 'placeholder="Busca por marca: Yamaha, Fender…"']) assert.ok(input.includes(attribute), attribute);
  assert.equal((html.match(/<input /g) ?? []).length, 1);
  assert.match(html, /<div class="surface-light flex h-14 [^"]*md:h-16[^"]*">/);
  // "Explorar": 52 px (lg) at a 6 px inset from 768 px, 44 px on phones.
  assert.match(html, /<button type="submit" class="[^"]*h-\[52px\][^"]*bg-action[^"]*max-md:h-11[^"]*">Explorar<\/button>/);
  assert.match(html, /pr-1\.5/);
  assert.doesNotMatch(source("components/home/home-banner.tsx"), /useMarketplaceEvents|trackEvent|sendEvent|"use client"/);
  // The header search shares the placeholder and the label (one plain module, readable from server code).
  assert.match(source("components/global-search.tsx"), /import \{ SEARCH_LABEL, SEARCH_PLACEHOLDER \} from "@\/lib\/shell";/);
});

test("vitrina: the newest listing with 3 photos or more per category, the five most recent of them (H2, Q12)", () => {
  const winners = [
    listing("g", "guitars", "2026-04-19T17:00:00Z"),
    null,
    listing("d", "drums", "2026-04-24T13:40:00Z"),
    listing("c", "cymbals", null),
    listing("m", "microphones", "2026-04-24T20:30:00Z"),
    listing("p", "pedals", "2026-04-21T18:20:00Z"),
    listing("a", "amplifiers", "2026-04-22T21:45:00Z"),
    listing("i", "audio interfaces", "2026-04-24T13:40:00Z", { created_at: "2026-02-01T00:00:00Z" }),
  ];
  // Catalog order: published_at newest first, never-published last, then created_at, then id.
  assert.deepEqual(home.selectVitrina(winners).map((item) => item.id), ["m", "i", "d", "a", "p"]);
  assert.deepEqual(home.selectVitrina([null, null]), []);
  assert.equal(home.VITRINA_SIZE, 5);
  assert.equal(home.VITRINA_MIN_PHOTOS, 3);
});

test("the feed is the newest approved listings without the vitrina's, eleven at most (Q15 B)", () => {
  const newest = Array.from({ length: 16 }, (_, index) => listing(`l${String(index).padStart(2, "0")}`, "guitars", `2026-04-${String(28 - index).padStart(2, "0")}T00:00:00Z`));
  const vitrina = [newest[0], newest[3], newest[7]];
  const feed = home.selectFeed(newest, vitrina);
  assert.equal(feed.length, 11);
  assert.ok(feed.every((item) => !vitrina.some((shown) => shown.id === item.id)));
  assert.deepEqual(feed.map((item) => item.id), ["l01", "l02", "l04", "l05", "l06", "l08", "l09", "l10", "l11", "l12", "l13"]);
  assert.deepEqual(home.selectFeed(newest.slice(0, 2), newest.slice(0, 2)), []);
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

const LOCAL = {
  winners: { guitars: listing("g", "guitars", "2026-04-19T17:00:00Z"), basses: listing("b", "basses", "2026-04-24T14:05:00Z"), drums: listing("d", "drums", "2026-04-24T13:40:00Z"),
    microphones: listing("m", "microphones", "2026-04-24T20:30:00Z"), pedals: listing("p", "pedals", "2026-04-21T18:20:00Z"), amplifiers: listing("a", "amplifiers", "2026-04-22T21:45:00Z"),
    "audio interfaces": listing("i", "audio interfaces", "2026-04-23T15:25:00Z") },
};
function respondLocal({ failing } = {}) {
  return (query) => {
    if (query.table === "stores") return { data: [{ id: "s1", name: "Casa Musical Grau", slug: "casa-musical-grau", city: "Lima", district: null, logo_url: null }], error: null };
    if (called(query, "select", "id")) return { data: null, count: valueOf(query, "eq", "category") ? 2 : 12, error: null };
    const category = valueOf(query, "eq", "category");
    if (category !== undefined) {
      if (category === failing) return { data: null, error: { message: "boom" } };
      return { data: LOCAL.winners[category] ? [LOCAL.winners[category]] : [], error: null };
    }
    const all = [...Object.values(LOCAL.winners), listing("x", "cymbals", "2026-04-23T19:10:00Z"), listing("y", "guitars", "2026-04-20T15:00:00Z")];
    return { data: all.sort(home.compareCatalogOrder), error: null };
  };
}

test("home data: eight per-category vitrina queries on listing_photo_count, one feed query, nine head counts, three stores", async () => {
  const client = fakeClient(respondLocal());
  const data = await home.fetchHomeData(client);
  const listingQueries = client.queries.filter((query) => query.table === "listings");
  const vitrina = listingQueries.filter((query) => called(query, "gte", "listing_photo_count"));
  assert.equal(vitrina.length, 8);
  for (const query of vitrina) {
    assert.ok(called(query, "eq", "status", "approved"));
    assert.ok(called(query, "gte", "listing_photo_count", 3));
    assert.ok(called(query, "order", "published_at", { ascending: false, nullsFirst: false }));
    assert.ok(called(query, "order", "created_at", { ascending: false }));
    assert.ok(called(query, "limit", 1, { foreignTable: "listing_photos" }), "first photo only");
    assert.ok(called(query, "limit", 1) && query.calls.filter(([name]) => name === "limit").length === 2);
    assert.match(query.calls.find(([name]) => name === "select")[1], /photo_count:listing_photo_count/);
  }
  assert.deepEqual(vitrina.map((query) => valueOf(query, "eq", "category")), ["guitars", "basses", "drums", "cymbals", "microphones", "pedals", "amplifiers", "audio interfaces"]);
  const counts = listingQueries.filter((query) => called(query, "select", "id", { count: "exact", head: true }));
  assert.equal(counts.length, 9);
  assert.ok(counts.every((query) => called(query, "eq", "status", "approved")));
  const feed = listingQueries.filter((query) => !vitrina.includes(query) && !counts.includes(query));
  assert.equal(feed.length, 1);
  assert.ok(called(feed[0], "limit", 16));
  const stores = client.queries.find((query) => query.table === "stores");
  assert.ok(called(stores, "eq", "status", "active") && called(stores, "eq", "is_verified", true) && called(stores, "limit", 3));
  assert.ok(called(stores, "order", "created_at", { ascending: false }));

  assert.deepEqual(data.vitrina.map((item) => item.id), ["m", "b", "d", "i", "a"]);
  assert.deepEqual(data.feed.map((item) => item.id), ["x", "p", "y", "g"]);
  assert.equal(data.total, 12);
  assert.equal(data.categoryCounts.drums, 2);
  assert.equal(data.stores.length, 1);
});

test("a failed vitrina query leaves the vitrina out and is logged; the feed then excludes nothing", async () => {
  const errors = [];
  const original = console.error;
  console.error = (message) => errors.push(message);
  try {
    const data = await home.fetchHomeData(fakeClient(respondLocal({ failing: "pedals" })));
    assert.equal(data.vitrina, null);
    assert.equal(data.feed.length, 9);
    assert.deepEqual(errors, ["Home: the vitrina query failed: boom"]);
  } finally {
    console.error = original;
  }
});

async function renderHome(data, random = 0) {
  const preloads = [];
  const { default: HomePage } = load("app/page.tsx", {
    "next/link": linkMock,
    "react-dom": { preload: (href) => preloads.push(href) },
    "@/components/listing-card": cardMock,
    "@/components/marketplace-image": { MarketplaceImage: (props) => React.createElement("img", { src: props.src, alt: props.alt }) },
    "@/lib/supabase/public-client": { getPublicSupabaseClient: () => ({}), warnMissingSupabaseEnv() {} },
    "@/lib/home": { ...home, fetchHomeData: async () => data },
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
  vitrina: ["m", "b", "d", "i", "a"].map((id) => LOCAL.winners[Object.keys(LOCAL.winners).find((key) => LOCAL.winners[key].id === id)]),
  feed: Array.from({ length: 11 }, (_, index) => listing(`f${index}`, "guitars", "2026-04-01T00:00:00Z")),
  total: 262,
  categoryCounts: { guitars: 86, basses: 21, drums: 38, cymbals: 1, microphones: 24, pedals: 45, amplifiers: 19, "audio interfaces": 12 },
  stores: [
    { id: "s1", name: "Casa Musical Grau", slug: "casa-musical-grau", city: "Lima", district: "Cercado", logo_url: null },
    { id: "s2", name: "Andes Sonido", slug: "andes-sonido", city: "Huancayo", district: null, logo_url: null },
  ],
};
const headings = (html) => [...html.matchAll(/<h2 [^>]*>([^<]+)<\/h2>/g)].map((match) => match[1]);

test("the home: banner, then the sections in the decided order, one h1, the Organization JSON-LD (§ Home)", async () => {
  const { html, preloads } = await renderHome(FULL, 0.99);
  assert.deepEqual(headings(html), ["En vitrina", "Explora por categoría", "Recién publicados", "Cómo funciona Laria", "Tiendas verificadas", "¿Tienes equipo que ya no usas?"]);
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
  assert.match(html, /<script type="application\/ld\+json">\{"@context":"https:\/\/schema.org","@type":"Organization"/);
  assert.match(html, /data-banner="guitarra-amplificador"/);
  assert.equal(preloads.length, 2);
  // Spacing: 24 then 32 px on phones, 32 then 48 px from 768 px (audit item 7).
  assert.match(html, /class="mx-auto w-full max-w-page px-4 sm:px-6 lg:px-8 flex flex-col gap-8 pb-8 pt-6 md:gap-12 md:pb-12 md:pt-8"/);
  // The metadata helper is unchanged (canonical and og:url the site root).
  assert.match(source("app/page.tsx"), /export const metadata: Metadata = buildHomeMetadata\(\);/);
});

test("vitrina and feed: showcase tiles, eleven grid cards and the end tile, six on phones; counts in the links (Q10 B, Q15 B)", async () => {
  const { html } = await renderHome(FULL);
  const vitrina = html.slice(html.indexOf('aria-labelledby="vitrina-titulo"'), html.indexOf('aria-labelledby="categorias-titulo"'));
  assert.equal((vitrina.match(/<article data-variant="showcase" data-source="home" data-heading="3" data-eager="">/g) ?? []).length, 5);
  assert.match(vitrina, /Lo más reciente de cada categoría\. Se actualiza sola\./);
  assert.match(vitrina, /<a href="\/listados" class="link [^"]*">Ver las 262 publicaciones<\/a>/);
  // A sideways row inside the section below 1024 px (160 px tiles on phones, 192 px on tablets), five columns from 1024 px.
  assert.match(vitrina, /<ul class="scrollbar-none -mx-4 flex gap-3 overflow-x-auto[^"]*lg:grid[^"]*lg:grid-cols-5">/);
  assert.match(vitrina, /<li class="w-40 shrink-0 md:w-48 lg:w-auto">/);
  const feed = html.slice(html.indexOf('aria-labelledby="recientes-titulo"'), html.indexOf('id="como-funciona"'));
  assert.doesNotMatch(feed.slice(0, feed.indexOf("</h2>") + 40), /<a /, "no link in the feed's header (audit item 16)");
  assert.equal((feed.match(/<article data-variant="grid" data-source="home" data-heading="3">/g) ?? []).length, 11);
  assert.equal((feed.match(/<li class="min-w-0 max-md:hidden">/g) ?? []).length, 5, "phones show the first six cards");
  assert.match(feed, /<ul class="grid grid-cols-2 [^"]*md:grid-cols-3 [^"]*lg:grid-cols-4 xl:grid-cols-6">/);
  assert.match(feed, /<li class="max-md:hidden"><div class="flex aspect-square flex-col justify-center rounded-panel bg-canvas p-5"><p class="t-section text-ink">262 publicaciones<\/p><p class="mt-1 t-meta">Guitarras, baterías, pedales, amplificadores y más\.<\/p><a href="\/listados"[^>]*>Ver todo el catálogo<\/a>/);
  assert.match(feed, /<a href="\/listados" class="[^"]*w-full[^"]*md:hidden">Ver las 262 publicaciones<\/a>/);
  const categories = html.slice(html.indexOf('aria-labelledby="categorias-titulo"'), html.indexOf('aria-labelledby="recientes-titulo"'));
  assert.match(categories, /<a href="\/instrumentos\/guitarras"[^>]*><span[^>]*>Guitarras<\/span><span[^>]*><span>86 publicaciones<\/span>/);
  assert.match(categories, />Platillos<\/span><span[^>]*><span>1 publicación<\/span>/);
  assert.match(categories, /grid-cols-2 [^"]*md:grid-cols-4 [^"]*xl:grid-cols-8/);
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
  assert.match(stores, /<a href="\/listados\?seller_type=verified_store" class="link [^"]*">Ver todas<\/a>/);
  assert.equal((stores.match(/<a href="\/tiendas\//g) ?? []).length, 2);
  assert.match(stores, /<span aria-hidden="true" class="grid h-10 w-10 shrink-0 place-items-center rounded-tag bg-frame-2 [^"]*text-white">CM<\/span>/);
  assert.match(stores, />Cercado, Lima</);
  assert.match(stores, /Tienda verificada/);
  assert.doesNotMatch(stores, /publicaciones|ventas/);
  assert.match(stores, /¿Tienes una tienda\?[\s\S]*Publica tu inventario, recibe consultas por WhatsApp y muestra tu verificación\.[\s\S]*href="\/registrar-tienda"/);
});

test("states: failed listing queries leave their sections out; an empty marketplace shows the empty feed; no stores hides them", async () => {
  const failed = (await renderHome({ vitrina: null, feed: null, total: null, categoryCounts: {}, stores: null })).html;
  assert.deepEqual(headings(failed), ["Explora por categoría", "Cómo funciona Laria", "¿Tienes equipo que ya no usas?"]);
  assert.doesNotMatch(failed, /publicaciones<\/span>/, "no counts without the count query");
  const noCounts = (await renderHome({ ...FULL, total: null })).html;
  assert.match(noCounts, /<a href="\/listados" class="link [^"]*">Ver todo el catálogo<\/a>/);
  const empty = (await renderHome({ vitrina: [], feed: [], total: 0, categoryCounts: {}, stores: [] })).html;
  assert.deepEqual(headings(empty), ["Explora por categoría", "Recién publicados", "Cómo funciona Laria", "¿Tienes equipo que ya no usas?"]);
  assert.match(empty, /<h3 class="t-section text-ink">Aún no hay publicaciones<\/h3>[\s\S]*Las primeras publicaciones aparecerán aquí\.[\s\S]*<a href="\/vender"[^>]*>Publicar un instrumento<\/a>/);
  // Every listing already in the vitrina: the feed has nothing to add and is left out, without an empty state.
  const allShown = (await renderHome({ ...FULL, feed: [] })).html;
  assert.ok(headings(allShown).includes("En vitrina") && !headings(allShown).includes("Recién publicados"));
});
