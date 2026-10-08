// UX-3 discovery (docs/ux-redesign/ux-3-discovery.md): the one listing card, the catalog filters and their URLs
// (with F11's multi-value condition and location), applied chips, sort, numbered pagination, the landings and states.
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
const linkMock = { __esModule: true, default: ({ children, ...props }) => React.createElement("a", without(props, "prefetch", "onNavigate"), children) };
const navigationMock = (pathname = "/listados", search = "") => ({ usePathname: () => pathname, useSearchParams: () => new URLSearchParams(search), useRouter: () => ({ push() {}, refresh() {} }) });
const account = (state = {}) => ({ useMarketplaceAccount: () => ({ ready: true, authenticated: true, favorites: {}, register: () => () => {}, setFavorite: async () => {}, ...state }) });

const listing = (overrides = {}) => ({
  id: "6b1f4f8e-1111-4c43-9d49-1d3f64f9c2aa",
  title: "Batería Pearl Export usada",
  slug: "bateria-pearl-export-usada-6b1f4f8e",
  category: "drums",
  brand: "Pearl",
  model: "Export",
  condition: "Usado - buen estado",
  price_pen: 1800,
  instrument_type: "drums",
  attributes: { configuration: "shell_pack", kick_size: "22", pieces: "5" },
  published_at: "2026-09-20T10:00:00Z",
  view_count: 3,
  city: "Arequipa",
  region: "Arequipa",
  seller_type: "individual",
  created_at: "2026-09-20T10:00:00Z",
  photo_count: 5,
  stores: null,
  listing_photos: [{ id: "p1", image_url: "/foto.jpg", alt_text: null, sort_order: 0 }],
  ...overrides,
});

function renderCard(props, state) {
  const { ListingCard } = load("components/listing-card.tsx", {
    "next/link": linkMock,
    "next/navigation": navigationMock(),
    "@/components/marketplace-image": { MarketplaceImage: (image) => React.createElement("img", without(image, "width", "height", "sizes", "decoding")) },
    "@/components/marketplace-telemetry": { useListingImpression: () => ({ current: null }) },
    "@/components/marketplace-account-provider": account(state),
  });
  return renderToStaticMarkup(React.createElement(ListingCard, { listing: listing(), ...props }));
}
const focusables = (html) => (html.match(/<a |<button /g) ?? []).length;

test("the card has two tab stops: the title link stretched over the card and the favourite (Q5)", () => {
  for (const state of [{}, { authenticated: false }]) {
    const html = renderCard({}, state);
    assert.equal(focusables(html), 2, JSON.stringify(state));
    assert.match(html, /^<article class="group relative flex min-w-0 flex-col">/);
    assert.match(html, /<h2 class="line-clamp-2 min-h-\[38px\] t-card-title text-ink"><a href="\/instrumentos\/bateria-pearl-export-usada-6b1f4f8e" class="[^"]*after:absolute after:inset-0[^"]*">Batería Pearl Export usada<\/a><\/h2>/);
  }
  // No carousel controls, no category tag, no store link.
  const html = renderCard({ listing: listing({ seller_type: "store", stores: { name: "Tienda QA", slug: "tienda-qa", status: "active", is_verified: true } }) });
  assert.doesNotMatch(html, /Foto anterior|Foto siguiente|Ver foto|href="\/tiendas\//);
  assert.equal(focusables(html), 2);
});

test("the card photo is square with the favourite and the photo count over it; the first row loads eagerly (Q4, Q5, PHOTO-016)", () => {
  const html = renderCard({ eager: true });
  assert.match(html, /<div class="relative aspect-square overflow-hidden rounded-panel border border-subtle bg-canvas[^"]*group-hover:border-line-strong">/);
  assert.match(html, /<img src="\/foto\.jpg" alt="Batería Pearl Export usada" loading="eager" class="h-full w-full object-cover"\/>/);
  assert.match(renderCard(), /loading="lazy"/);
  assert.match(html, />5 fotos<\/span>/);
  assert.doesNotMatch(renderCard({ listing: listing({ photo_count: 1 }) }), /fotos</);
  assert.match(renderCard({ listing: listing({ listing_photos: [], photo_count: 0 }) }), /Sin foto/);
  // The favourite: a 36 px white circle inside a 44 px hit area.
  assert.match(html, /<button type="button" aria-pressed="false" aria-label="Guardar en favoritos"[^>]*class="[^"]*h-11 w-11[^"]*rounded-full[^"]*"><span class="flex h-9 w-9 items-center justify-center rounded-full border border-subtle bg-surface">/);
  assert.match(renderCard({}, { authenticated: false }), /<a href="\/login\?next=%2Flistados" aria-label="Ingresa para guardar en favoritos" class="[^"]*h-11 w-11/);
});

test("the card caption: title, price, the real condition with the type's key attributes, then city and seller words (Q3)", () => {
  const html = renderCard();
  assert.match(html, /S\/\s?1,800/);
  assert.match(html, /<p class="truncate t-meta">Usado · buen estado · Shell pack · 22&quot;<\/p>/);
  assert.match(html, /<span class="min-w-0 truncate">Arequipa<\/span><span aria-hidden="true">·<\/span><span class="shrink-0">Particular<\/span><\/p>/);
  const store = (verified) => renderCard({ listing: listing({ seller_type: "store", stores: { name: "Tienda QA", slug: "tienda-qa", status: "active", is_verified: verified } }) });
  assert.match(store(false), /<span class="shrink-0">Tienda<\/span><\/p>/);
  assert.match(store(true), /<span class="shrink-0">Tienda verificada<\/span><svg[^>]*aria-hidden="true"/);
  // The condition is the listing's own value, never a literal (D11).
  assert.match(renderCard({ listing: listing({ condition: "Nuevo" }) }), />Nuevo · Shell pack · 22&quot;</);
  assert.doesNotMatch(source("components/listing-card.tsx"), /"Nuevo"|"Usado/);
  assert.match(renderCard({ headingLevel: 3 }), /<h3 class="line-clamp-2 min-h-\[38px\] t-card-title/);
});

test("the spec line names up to two key attributes per type, with units, and skips missing ones (Q3 A)", () => {
  const { getCardSpecLine } = load("lib/listing-specs.ts");
  const line = (instrument_type, attributes, condition = "Usado - buen estado") => getCardSpecLine({ instrument_type, attributes, condition });
  assert.equal(line("electric_guitar", { pickups: ["sss", "single_coil"], strings: "6" }), "Usado · buen estado · SSS, Single coil");
  assert.equal(line("electric_guitar", { pickups: ["hh"], strings: "7" }), "Usado · buen estado · HH · 7 cuerdas");
  assert.equal(line("acoustic_guitar", { acoustic_type: "electro_acoustic", body_shape: "dreadnought" }), "Usado · buen estado · Electroacústica · Dreadnought");
  assert.equal(line("bass", { strings: "5", bass_type: "jazz_bass" }), "Usado · buen estado · 5 cuerdas · Jazz Bass");
  assert.equal(line("drums", { configuration: "complete", kick_size: "20" }, "Nuevo"), "Nuevo · Completa · 20\"");
  assert.equal(line("cymbals", { cymbal_type: "crash", size: "16" }), "Usado · buen estado · Crash · 16\"");
  assert.equal(line("microphones", { microphone_type: "dynamic", polar_pattern: "cardioid" }), "Usado · buen estado · Dinámico · Cardioide");
  assert.equal(line("audio_interface", { inputs: "2", connection: "usb_c" }), "Usado · buen estado · 2 entradas · USB-C");
  assert.equal(line("pedals", { pedal_type: "delay", format: "compact" }), "Usado · buen estado · Delay · Compacto");
  assert.equal(line("amplifiers", { technology: "tube", power: "16_50w", amplifier_type: "combo" }), "Usado · buen estado · Tubos · 16–50W");
  assert.equal(line("amplifiers", {}), "Usado · buen estado");
  assert.equal(line("other", { anything: "x" }, "Usado - con detalles"), "Usado · con detalles");
  assert.equal(line(null, null, null), "");
});

const { parseListingFilters } = load("lib/listings.ts");
const catalog = load("lib/catalog-filters.ts");
const parse = (query) => parseListingFilters(Object.fromEntries([...new URLSearchParams(query).keys()].map((key) => {
  const values = new URLSearchParams(query).getAll(key);
  return [key, values.length > 1 ? values : values[0]];
})));
const href = (query, scope) => catalog.catalogHref(parse(query), scope);

test("F11: condition and location repeat, parse in URL order without repeats, and one value keeps today's URL", () => {
  assert.deepEqual(parse("condition=Nuevo&condition=Usado+-+buen+estado&condition=Nuevo").conditions, ["Nuevo", "Usado - buen estado"]);
  assert.deepEqual(parse("location=Lima&location=Arequipa").cities, ["Lima", "Arequipa"]);
  assert.deepEqual(parse("city=Cusco").cities, ["Cusco"], "the legacy city parameter still reads");
  assert.deepEqual(parse("location=&condition=").conditions, []);
  // One-value URLs in today's parameter order come back byte for byte (links, alert emails, sitemap).
  for (const url of [
    "/listados",
    "/listados?condition=Nuevo",
    "/listados?location=Lima",
    "/listados?seller_type=verified_store",
    "/listados?category=guitars&instrument_type=electric_guitar",
    "/listados?category=guitars&location=Lima&condition=Usado+-+buen+estado&brand=Fender&seller_type=individual&instrument_type=electric_guitar&min_price=1000&max_price=3000&sort=price_asc&body_type=solid_body&pickups=hss&pickups=sss",
  ]) assert.equal(href(url.split("?")[1] ?? ""), url);
  // The alert path of a one-value search is unchanged too.
  const { listingFiltersToSearchAlert, searchAlertPath } = load("lib/search-alerts.ts");
  assert.equal(searchAlertPath(listingFiltersToSearchAlert(parse("category=drums&location=Arequipa&condition=Nuevo"))), "/listados?category=drums&location=Arequipa&condition=Nuevo");
  // Several values repeat the parameter.
  assert.equal(href("location=Lima&location=Arequipa&condition=Nuevo"), "/listados?location=Lima&location=Arequipa&condition=Nuevo");
});

test("F11: one value is queried with eq, several with in; the rest of the catalog query is unchanged", async () => {
  const calls = [];
  const builder = new Proxy({}, { get: (_, name) => name === "then" ? undefined : (...args) => { calls.push([name, ...args]); return builder; } });
  const { fetchCatalogPage } = load("lib/catalog.ts");
  await fetchCatalogPage({ from: () => builder }, parse("condition=Nuevo&location=Lima"), 1);
  assert.ok(calls.some((call) => call[0] === "eq" && call[1] === "condition" && call[2] === "Nuevo"));
  assert.ok(calls.some((call) => call[0] === "eq" && call[1] === "city" && call[2] === "Lima"));
  assert.ok(!calls.some((call) => call[0] === "in"));
  calls.length = 0;
  await fetchCatalogPage({ from: () => builder }, parse("condition=Nuevo&condition=Usado+-+con+detalles&location=Lima&location=Arequipa"), 2);
  assert.deepEqual(calls.filter((call) => call[0] === "in"), [["in", "city", ["Lima", "Arequipa"]], ["in", "condition", ["Nuevo", "Usado - con detalles"]]]);
  assert.ok(!calls.some((call) => call[0] === "eq" && (call[1] === "city" || call[1] === "condition")));
  assert.ok(calls.some((call) => call[0] === "eq" && call[1] === "status" && call[2] === "approved"));
  assert.ok(calls.some((call) => call[0] === "range" && call[1] === 24 && call[2] === 47));
});

test("F11: several values survive pagination, the landing's forwarding and the SEO normalization", () => {
  const { pageHref } = load("lib/pagination.ts");
  assert.equal(pageHref("/listados", { condition: ["Nuevo", "Usado - buen estado"], location: ["Lima", "Arequipa"] }, 2), "/listados?condition=Nuevo&condition=Usado+-+buen+estado&location=Lima&location=Arequipa&page=2");
  const seo = load("lib/seo.ts");
  const { getCategoryLandingBySlug } = load("lib/category-pages.ts");
  assert.equal(seo.categoryFilterRedirect(getCategoryLandingBySlug("guitarras"), { location: ["Lima", "Arequipa"] }), "/listados?category=guitars&location=Lima&location=Arequipa");
  const metadata = seo.buildCatalogMetadata({ condition: ["Nuevo", "Usado - buen estado"] }, 1);
  assert.equal(metadata.robots.index, false);
  assert.equal(metadata.openGraph.url, "/listados?condition=Nuevo&condition=Usado+-+buen+estado");
});

test("F11: each value is its own chip, and removing one keeps the others; sort is never a chip", () => {
  const chips = catalog.appliedFilters(parse("location=Lima&location=Arequipa&condition=Nuevo&min_price=500&max_price=1500&brand=Yamaha&seller_type=verified_store&sort=price_asc"));
  assert.deepEqual(chips.map((chip) => chip.text), ["Nuevo", "S/ 500 – 1,500", "Lima", "Arequipa", "Tienda verificada", "Marca: Yamaha"]);
  const lima = chips.find((chip) => chip.key === "location:Lima");
  assert.equal(`${lima.facet}: ${lima.value}`, "Ubicación: Lima");
  assert.equal(lima.href, "/listados?location=Arequipa&condition=Nuevo&brand=Yamaha&seller_type=verified_store&min_price=500&max_price=1500&sort=price_asc");
  assert.equal(chips.find((chip) => chip.key === "price").href, "/listados?location=Lima&location=Arequipa&condition=Nuevo&brand=Yamaha&seller_type=verified_store&sort=price_asc");
  // The category is a chip on /listados, never on its landing.
  const { landingScope } = load("lib/category-pages.ts");
  const guitars = landingScope("guitars");
  assert.deepEqual(catalog.appliedFilters(parse("category=guitars&instrument_type=acoustic_guitar")).map((chip) => chip.text), ["Guitarras", "Guitarras acústicas"]);
  assert.deepEqual(catalog.appliedFilters(parse("category=guitars"), guitars), []);
  // Attributes: one chip per multiselect value; booleans name their attribute.
  assert.deepEqual(catalog.appliedFilters(parse("instrument_type=electric_guitar&pickups=hss&pickups=sss")).map((chip) => chip.text), ["Guitarras eléctricas", "HSS", "SSS"]);
  assert.deepEqual(catalog.appliedFilters(parse("category=pedals&true_bypass=yes")).map((chip) => chip.text), ["Pedales", "True bypass: Sí"]);
});

test("filter URLs: each option sets or clears its value; landings lead to /listados?category=…", () => {
  const facets = (query, scope) => catalog.catalogFacets(parse(query), scope);
  const option = (filters, key, value, scope) => catalog.catalogHref(catalog.withFacetValue(parse(filters), key, value), scope);
  assert.deepEqual(facets("").map((facet) => facet.title), ["Categoría", "Condición", "Precio", "Ubicación", "Vendedor", "Marca"]);
  assert.deepEqual(facets("category=guitars").map((facet) => facet.title), ["Tipo", "Condición", "Precio", "Ubicación", "Vendedor", "Marca"]);
  assert.deepEqual(facets("category=guitars&instrument_type=acoustic_guitar").slice(6).map((facet) => facet.title), ["Tipo", "Cuerpo", "Cuerdas", "Mano", "Incluye preamp"]);
  // A single-type category shows its attributes at once; short values are chips; the type facet is absent.
  const drums = facets("category=drums");
  assert.deepEqual(drums.map((facet) => facet.title), ["Condición", "Precio", "Ubicación", "Vendedor", "Marca", "Tipo", "Configuración", "Número de piezas", "Material", "Incluye hardware", "Incluye platillos", "Medida de bombo"]);
  assert.equal(drums.find((facet) => facet.key === "kick_size").chips, true);
  assert.deepEqual(drums.find((facet) => facet.key === "pieces").options.map((item) => item.label), ["4 piezas", "5 piezas", "6 piezas", "7+ piezas"]);
  // Several-value facets toggle, in option order whatever the click order.
  assert.equal(option("condition=Usado+-+con+detalles", "condition", "Nuevo"), "/listados?condition=Nuevo&condition=Usado+-+con+detalles");
  assert.equal(option("condition=Nuevo&condition=Usado+-+con+detalles", "condition", "Nuevo"), "/listados?condition=Usado+-+con+detalles");
  assert.equal(option("location=Cusco", "location", "Lima"), "/listados?location=Cusco&location=Lima");
  // One-value facets set or clear; a new category or type clears what depends on it; page always resets.
  assert.equal(option("seller_type=store&page=3", "seller_type", "individual"), "/listados?seller_type=individual");
  assert.equal(option("seller_type=store", "seller_type", null), "/listados");
  assert.equal(option("category=guitars&instrument_type=electric_guitar&pickups=hss", "instrument_type", "acoustic_guitar"), "/listados?category=guitars&instrument_type=acoustic_guitar");
  assert.equal(option("instrument_type=electric_guitar&location=Lima", "category", "drums"), "/listados?category=drums&location=Lima");
  assert.equal(option("category=drums&kick_size=22", "kick_size", null), "/listados?category=drums");
  // On a landing, options lead to the catalog with the category; nothing else chosen is the landing itself.
  const landing = load("lib/category-pages.ts").landingScope("drums");
  assert.deepEqual(landing, { landing: { category: "drums", path: "/instrumentos/baterias" } });
  assert.equal(option("category=drums", "condition", "Nuevo", landing), "/listados?category=drums&condition=Nuevo");
  assert.equal(option("category=drums&condition=Nuevo", "condition", "Nuevo", landing), "/instrumentos/baterias");
  assert.equal(catalog.catalogHref(catalog.withSort(parse("category=drums"), "price_asc"), landing), "/listados?category=drums&sort=price_asc");
  assert.equal(catalog.catalogHref(catalog.clearedFilters(landing), landing), "/instrumentos/baterias");
  assert.equal(catalog.catalogHref(catalog.clearedFilters()), "/listados");
});

test("titles, counts and the alert rule: a filter or a category narrows; several values cannot be saved (Q11, Q19)", () => {
  assert.equal(catalog.catalogTitle(parse("")), "Instrumentos");
  assert.equal(catalog.catalogTitle(parse("category=microphones&location=Lima")), "Micrófonos");
  assert.equal(catalog.catalogTitle(parse("seller_type=verified_store&sort=price_desc")), "Tiendas verificadas");
  assert.equal(catalog.catalogTitle(parse("seller_type=verified_store&location=Lima")), "Instrumentos");
  assert.equal(catalog.resultsLabel(1), "1 resultado");
  assert.equal(catalog.resultsLabel(1262), "1,262 resultados");
  assert.equal(catalog.narrowsSearch(parse("sort=price_asc")), false);
  assert.equal(catalog.narrowsSearch(parse("category=guitars")), true);
  const { listingFiltersToSearchAlert } = load("lib/search-alerts.ts");
  assert.equal(listingFiltersToSearchAlert(parse("location=Lima&location=Arequipa")), null);
  assert.deepEqual(listingFiltersToSearchAlert(parse("location=Lima&condition=Nuevo")), { location: "Lima", condition: "Nuevo" });
  const { CreateSearchAlert } = load("components/create-search-alert.tsx", { "next/link": linkMock, "next/navigation": navigationMock(), "@/components/marketplace-account-provider": account({ authenticated: false }) });
  assert.equal(renderToStaticMarkup(React.createElement(CreateSearchAlert, { filters: null, variant: "button" })), '<p class="t-meta">Para crear una alerta, elige un solo valor en cada filtro.</p>');
  assert.match(renderToStaticMarkup(React.createElement(CreateSearchAlert, { filters: { location: "Lima" }, variant: "chip" })), /^<a href="\/login\?next=%2Flistados%3Flocation%3DLima" class="[^"]*">.*Crear alerta<\/a>$/);
  // Every alert entry of the view gets the same single-value filters, or null.
  const view = source("components/catalog-view.tsx");
  assert.match(view, /const alertFilters = listingFiltersToSearchAlert\(filters\);/);
  assert.equal((view.match(/<CreateSearchAlert filters=\{alertFilters\}/g) ?? []).length, 4);
  assert.match(view, /narrowed && alertFilters && lastPage \?/);
});

test("numbered pagination: Mostrando, the numbers with gaps, the current page and crawlable links (Q9, REL-001, REL-003)", () => {
  const { Pagination, pageItems } = load("components/pagination.tsx", { "next/link": linkMock });
  assert.deepEqual(pageItems(5, 11), [1, "gap", 4, 5, 6, "gap", 11]);
  assert.deepEqual(pageItems(1, 3), [1, 2, 3]);
  assert.deepEqual(pageItems(4, 7), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(pageItems(1, 11), [1, 2, "gap", 11]);
  const html = renderToStaticMarkup(React.createElement(Pagination, { page: 2, total: 262, path: "/listados", params: { condition: ["Nuevo", "Usado - buen estado"], page: "2" } }));
  assert.match(html, /<p class="text-center t-meta">Mostrando 25–48 de 262<\/p>/);
  assert.match(html, /<nav aria-label="Páginas de resultados">/);
  assert.match(html, /<span aria-current="page" class="[^"]*bg-ink text-white"><span class="sr-only">Página <\/span>2<\/span>/);
  const links = [...html.matchAll(/<a href="([^"]+)"/g)].map((match) => match[1].replace(/&amp;/g, "&"));
  assert.deepEqual(links, [
    "/listados?condition=Nuevo&condition=Usado+-+buen+estado",
    "/listados?condition=Nuevo&condition=Usado+-+buen+estado",
    "/listados?condition=Nuevo&condition=Usado+-+buen+estado&page=3",
    "/listados?condition=Nuevo&condition=Usado+-+buen+estado&page=11",
    "/listados?condition=Nuevo&condition=Usado+-+buen+estado&page=3",
  ]);
  assert.match(html, /<span class="sr-only md:hidden">Página anterior<\/span><span class="hidden md:inline">Anterior<\/span>/);
  assert.match(html, /h-11 min-w-11[^"]*md:h-10 md:min-w-10/);
  assert.equal(renderToStaticMarkup(React.createElement(Pagination, { page: 1, total: 6, path: "/listados" })), '<div class="mt-8 flex flex-col items-center gap-3"><p class="text-center t-meta">Mostrando 1–6 de 6</p></div>');
  assert.equal(renderToStaticMarkup(React.createElement(Pagination, { page: 1, total: 0, path: "/listados" })), "");
});

test("the desktop sidebar: live option links with aria-current, small GET forms that keep every other filter (Q7 A)", () => {
  const { ListingFilters } = load("components/listing-filters.tsx", { "next/link": linkMock, "next/navigation": navigationMock() });
  const html = renderToStaticMarkup(React.createElement(ListingFilters, { filters: parse("category=guitars&condition=Nuevo&sort=price_asc") }));
  assert.match(html, /^<section aria-label="Filtros" class="hidden lg:block">/);
  assert.match(html, /<h2 id="filtro-condition-titulo" class="t-ui font-semibold text-ink">Condición<\/h2>/);
  // A chosen checkbox row removes its value; the others add theirs; the chosen radio row is "Todos" when none is set.
  assert.match(html, /<a href="\/listados\?category=guitars&amp;sort=price_asc" id="filtro-condition-Nuevo" aria-current="true"[^>]*><span aria-hidden="true" class="[^"]*rounded-\[3px\][^"]*bg-ink"><svg/);
  assert.match(html, /<a href="\/listados\?category=guitars&amp;condition=Nuevo&amp;condition=Usado\+-\+buen\+estado&amp;sort=price_asc" id="filtro-condition-Usado---buen-estado" class=/);
  assert.match(html, /<a href="\/listados\?category=guitars&amp;condition=Nuevo&amp;sort=price_asc" id="filtro-seller_type-todos" aria-current="true"[^>]*><span aria-hidden="true" class="[^"]*rounded-full border-ink"><span class="h-2 w-2 rounded-full bg-ink">/);
  // Price and brand are GET forms to /listados with every other filter as hidden fields.
  const price = html.match(/<form class="mt-2" action="\/listados" method="get">([\s\S]*?)<\/form>/)[1];
  assert.deepEqual([...price.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]+)"\/>/g)].map((match) => `${match[1]}=${match[2]}`), ["category=guitars", "condition=Nuevo", "sort=price_asc"]);
  assert.match(price, /name="min_price"[\s\S]*name="max_price"[\s\S]*>Aplicar<\/button>/);
  assert.doesNotMatch(html, /<select|Aplicar filtros/);
});

test("phone and tablet controls: Filtrar with the applied count and Ordenar open sheets; sort has no form field", () => {
  const mocks = { "next/link": linkMock, "next/navigation": navigationMock() };
  const { FilterSheetButton } = load("components/filter-sheet.tsx", mocks);
  const button = renderToStaticMarkup(React.createElement(FilterSheetButton, { filters: parse("condition=Nuevo&location=Lima"), scope: {}, appliedCount: 2 }));
  assert.match(button, /^<button type="button" aria-haspopup="dialog" aria-expanded="false" class="[^"]*h-11[^"]*w-full[^"]*">.*Filtrar<span class="[^"]*" aria-label="2 filtros aplicados">2<\/span><\/button>$/);
  assert.doesNotMatch(button, /<dialog/, "the sheet renders only while open");
  const { SortMenu, SortSheetButton } = load("components/sort-control.tsx", mocks);
  assert.match(renderToStaticMarkup(React.createElement(SortMenu, { filters: parse("sort=price_asc"), scope: {} })), /^<div class="relative"><button id="orden-boton" type="button" aria-expanded="false" aria-controls="menu-orden" class="[^"]*h-9[^"]*"><span class="font-normal text-ink-2">Ordenar:<\/span>Menor precio<svg/);
  assert.match(renderToStaticMarkup(React.createElement(SortSheetButton, { filters: parse(""), scope: {} })), /aria-haspopup="dialog"[^>]*>Ordenar<svg/);
  // The sheet: a native modal dialog labelled by its title, a 200 ms slide that reduced motion turns off.
  const sheet = source("components/ui/sheet.tsx");
  assert.match(sheet, /dialog\.showModal\(\)/);
  assert.match(sheet, /<dialog[\s\S]*aria-labelledby=\{titleId\}[\s\S]*aria-modal="true"[\s\S]*className="sheet"/);
  assert.match(sheet, /root\.style\.overflow = "hidden"/);
  assert.match(source("app/globals.css"), /\.sheet \{[\s\S]*max-height: 88dvh;[\s\S]*animation: sheet-up 200ms ease-out;[\s\S]*\.sheet::backdrop \{\s*background: rgb\(5 6 8 \/ 0\.55\);/);
  // The old filter form is gone: no native selects, no sort field, no second sort sheet.
  for (const file of ["components/listing-filters.tsx", "components/filter-sheet.tsx", "components/catalog-view.tsx"]) assert.doesNotMatch(source(file), /<select|name="sort"/, file);
});

test("catalog states: error with Reintentar, empty catalog, no results with the alert, the landing's empty state", () => {
  const view = source("components/catalog-view.tsx");
  assert.match(view, /No pudimos cargar las publicaciones\. Vuelve a intentarlo en unos minutos\./);
  assert.match(view, /<a href=\{retryHref\}[^>]*>\s*Reintentar\s*<\/a>/);
  assert.match(view, /title="No encontramos resultados"\s*description="Prueba quitar un filtro o buscar otra marca\."/);
  assert.match(source("app/listados/page.tsx"), /title="Aún no hay publicaciones"\s*description="Las primeras publicaciones aparecerán aquí\."[\s\S]*Publicar un instrumento/);
  assert.doesNotMatch(source("app/listados/page.tsx"), /con esos filtros/);
  const landing = source("components/category-landing.tsx");
  assert.match(landing, /Aún no hay publicaciones de \$\{landing\.label\.toLowerCase\(\)\}/);
  assert.match(landing, /Ver todo el catálogo[\s\S]*Publicar un instrumento/);
  assert.doesNotMatch(landing, /Buscas algo más específico/);
  assert.match(source("components/create-search-alert.tsx"), /Alerta creada\. Te avisaremos por correo solo sobre publicaciones nuevas que coincidan\./);
});
