// Detailed category navigation (docs/ux-redesign/category-navigation.md): subtypes per instrument type, the
// instrument catalog's brands per category, the strip panel and the landing's "Explora" section.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const nav = require("../lib/category-nav.ts");
const { aggregateCatalogBrands, brandsAlphabetical, marketplaceCategoryOf } = require("../lib/catalog-brands-aggregate.ts");
const { instrumentTypesByCategory } = require("../lib/listing-submission.ts");
const { parseListingFilters } = require("../lib/listings.ts");
const shell = require("../lib/shell.ts");

const query = (href) => {
  const params = new URL(href, "https://laria.pe").searchParams;
  const record = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    record[key] = values.length > 1 ? values : values[0];
  }
  return record;
};

test("every type except Otro has subtypes, and each subtype link is a filter the catalog applies", () => {
  for (const [category, types] of Object.entries(instrumentTypesByCategory)) {
    for (const type of types) {
      const links = nav.subtypeLinks(category, type);
      if (type === "other") {
        assert.deepEqual(links, [], `${category}/other`);
        continue;
      }
      assert.ok(links.length >= 4, `${category}/${type} has ${links.length} subtypes`);
      assert.equal(new Set(links.map((link) => link.label)).size, links.length, `${category}/${type}: labels are unique`);
      for (const link of links) {
        assert.match(link.href, /^\/listados\?/);
        const filters = parseListingFilters(query(link.href));
        assert.equal(filters.category, category, link.href);
        assert.equal(filters.instrumentType, type, link.href);
        // The attribute survives parsing: the catalog query (lib/catalog.ts) filters on it.
        assert.equal(Object.keys(filters.advanced).length, 1, link.href);
      }
    }
  }
});

test("subtype labels read as Spanish menu entries", () => {
  const labels = (category, type) => nav.subtypeLinks(category, type).map((link) => link.label);
  assert.deepEqual(labels("guitars", "electric_guitar"), ["Strat", "Tele", "Les Paul", "SG", "Offset", "Superstrat", "Semihuecas", "Huecas", "Para zurdos"]);
  assert.deepEqual(labels("guitars", "acoustic_guitar").slice(0, 3), ["Clásicas", "Acústicas", "Electroacústicas"]);
  assert.deepEqual(labels("basses", "bass").slice(0, 3), ["4 cuerdas", "5 cuerdas", "6 cuerdas"]);
  assert.ok(labels("pedals", "pedals").includes("Distorsión"));
  assert.deepEqual(labels("audio", "audio_interface").slice(0, 2), ["1 entrada", "2 entradas"]);
  // The categories added on 12 Oct 2026.
  assert.deepEqual(labels("percussion", "hand_percussion").slice(0, 3), ["Cajones", "Congas", "Bongós"]);
  assert.deepEqual(labels("keyboards", "keyboards").slice(0, 2), ["Pianos digitales", "Pianos de escenario"]);
  assert.ok(labels("keyboards", "keyboards").includes("De 88 teclas"));
  assert.deepEqual(labels("winds", "winds").slice(0, 2), ["Saxofones", "Trompetas"]);
  assert.deepEqual(labels("strings", "string_instrument").slice(0, 2), ["Ukeleles", "Violines"]);
  assert.deepEqual(labels("audio", "audio_gear").slice(0, 2), ["Mezcladoras", "Parlantes"]);
  assert.equal(nav.subtypeLinks("guitars", "electric_guitar")[0].href, "/listados?category=guitars&instrument_type=electric_guitar&shape=strat");
});

test("brand links use the catalog's brand filter inside the category", () => {
  assert.equal(nav.categoryBrandHref("guitars", "Fender"), "/listados?category=guitars&brand=Fender");
  assert.equal(nav.categoryBrandHref("audio", "Focusrite"), "/listados?category=audio&brand=Focusrite");
  const filters = parseListingFilters(query(nav.categoryBrandHref("pedals", "Boss")));
  assert.equal(filters.brand, "Boss");
  assert.equal(filters.category, "pedals");
});

test("catalog categories map to the marketplace categories by their dotted id, longest prefix first", () => {
  const cases = {
    "instruments.guitars.electric": "guitars",
    "instruments.bass.electric": "basses",
    "instruments.keyboards.digital_piano": "keyboards",
    "studio.midi_controllers": "keyboards",
    "instruments.drums.cymbal": "percussion",
    "instruments.drums.latin_percussion": "percussion",
    "instruments.folk.cajon": "percussion",
    "instruments.wind.saxophone": "winds",
    "instruments.strings.ukulele": "strings",
    "effects.guitar_pedal": "pedals",
    "amplification.bass_amp": "amplifiers",
    "pro_audio.microphones.dynamic": "microphones",
    "pro_audio.wireless": "microphones",
    "pro_audio.interfaces": "audio",
    "pro_audio.mixers": "audio",
    "pro_audio.monitoring.headphones": "audio",
  };
  for (const [id, category] of Object.entries(cases)) assert.equal(marketplaceCategoryOf(id), category, id);
  // No marketplace category covers these, and a prefix only matches whole id segments.
  for (const id of ["dj.controllers", "studio.samplers", "accessories.tuners", "instruments.folk.charango", "instruments", "instruments.bassoon", "pro_audiox"]) {
    assert.equal(marketplaceCategoryOf(id), null, id);
  }
});

test("catalog brands are grouped by marketplace category, most catalog models first", () => {
  const manufacturers = [
    { id: "m1", canonical_name: "Fender" },
    { id: "m2", canonical_name: "Gibson" },
    { id: "m3", canonical_name: "Boss" },
    { id: "m4", canonical_name: "Ibanez" },
    { id: "m5", canonical_name: "Yamaha" },
  ];
  const products = [
    { category_id: "instruments.guitars.electric", manufacturer_id: "m2" },
    { category_id: "instruments.guitars.electric", manufacturer_id: "m1" },
    { category_id: "instruments.guitars.acoustic", manufacturer_id: "m1" },
    { category_id: "instruments.guitars.acoustic", manufacturer_id: "m4" },
    { category_id: "effects.guitar_pedal", manufacturer_id: "m3" },
    { category_id: "instruments.keyboards.synthesizer", manufacturer_id: "m5" },
    { category_id: "instruments.drums.cymbal", manufacturer_id: "m5" },
    { category_id: "instruments.drums.kit", manufacturer_id: "m5" },
    { category_id: "dj.controllers", manufacturer_id: "m3" }, // no marketplace category
    { category_id: null, manufacturer_id: "m1" },
    { category_id: "effects.guitar_pedal", manufacturer_id: "unknown" },
  ];
  const brands = aggregateCatalogBrands(products, manufacturers);
  assert.deepEqual(Object.keys(brands).sort(), ["guitars", "keyboards", "pedals", "percussion"]);
  assert.deepEqual(brands.guitars, [{ name: "Fender", models: 2 }, { name: "Gibson", models: 1 }, { name: "Ibanez", models: 1 }]);
  assert.deepEqual(brands.pedals, [{ name: "Boss", models: 1 }]);
  assert.deepEqual(brands.keyboards, [{ name: "Yamaha", models: 1 }]);
  assert.deepEqual(brands.percussion, [{ name: "Yamaha", models: 2 }]);
  assert.deepEqual(brandsAlphabetical([{ name: "ibanez", models: 1 }, { name: "Fender", models: 3 }, { name: "Álvarez", models: 1 }]).map((brand) => brand.name), ["Álvarez", "Fender", "ibanez"]);
});

test("the catalog read is server-only, read-only, cached and fails soft", () => {
  const reader = source("lib/catalog-brands.ts");
  assert.match(reader, /^import "server-only";/);
  assert.doesNotMatch(reader, /\.(insert|update|upsert|delete|rpc)\(/);
  assert.match(reader, /unstable_cache\(loadCatalogBrands, \["catalog-brands-by-category-v2"\], \{ revalidate: REVALIDATE_SECONDS \}\)/);
  assert.match(reader, /catch \(error\) \{[\s\S]*return \{\};/);
  assert.match(source("app/layout.tsx"), /const brands = await getCatalogBrandsByCategory\(\);/);
});

function loadPanel() {
  const Module = require("node:module");
  const resolved = require.resolve("../components/global-categories.tsx");
  delete require.cache[resolved];
  const linkMock = { __esModule: true, default: ({ children, ...props }) => React.createElement("a", Object.fromEntries(Object.entries(props).filter(([key]) => key !== "prefetch")), children) };
  const mocks = { "next/link": linkMock, "next/navigation": { usePathname: () => "/", useSearchParams: () => new URLSearchParams() } };
  const original = Module._load;
  Module._load = function load(request, ...rest) {
    return Object.hasOwn(mocks, request) ? mocks[request] : original.call(this, request, ...rest);
  };
  try {
    return require(resolved);
  } finally {
    Module._load = original;
  }
}

test("the strip panel shows subtypes per type and the leading brands with Ver todas las marcas", () => {
  const { CategoryPanel } = loadPanel();
  const guitars = shell.categoryMenus.find((menu) => menu.key === "guitars");
  const html = renderToStaticMarkup(React.createElement(CategoryPanel, { menu: guitars, brands: ["Fender", "Gibson", "Ibanez", "Yamaha", "Epiphone", "Squier"] }));
  // One section per detailed type, named by the type, visible from 768 px.
  assert.match(html, /<section aria-label="Guitarras eléctricas" class="hidden md:block"><p class="t-micro text-ink-2">Guitarras eléctricas<\/p>/);
  assert.match(html, /<section aria-label="Guitarras acústicas" class="hidden md:block">/);
  assert.match(html, /href="\/listados\?category=guitars&amp;instrument_type=electric_guitar&amp;shape=les_paul"[^>]*>Les Paul<\/a>/);
  assert.doesNotMatch(html, /aria-label="Otro"/);
  // Brands: every one links to the category with the brand; phones show the first five.
  assert.match(html, /<section aria-label="Marcas de guitarras"><p class="t-micro text-ink-2">Marcas<\/p>/);
  assert.match(html, /href="\/listados\?category=guitars&amp;brand=Fender"[^>]*>Fender<\/a>/);
  assert.equal((html.match(/<li class="hidden md:block"><a href="\/listados\?category=guitars&amp;brand=/g) ?? []).length, 1);
  assert.match(html, /<a href="\/instrumentos\/guitarras#marcas"[^>]*>Ver todas las marcas<\/a>/);
  // Without catalog brands the panel has no brand section, and phones keep the compact list.
  const plain = renderToStaticMarkup(React.createElement(CategoryPanel, { menu: shell.categoryMenus.find((menu) => menu.key === "pedals") }));
  assert.doesNotMatch(plain, /Marcas|Ver todas las marcas/);
  assert.match(plain, /<div class="hidden md:grid gap-3/);
  // A single-type category names its subtype column "Explora".
  assert.match(plain, /<section aria-label="Pedales" class="hidden md:block"><p class="t-micro text-ink-2">Explora<\/p>/);
});

test("the landing lists every subtype and every catalog brand under Explora", () => {
  const landing = source("components/category-landing.tsx");
  assert.match(landing, /<CategoryExplore landing=\{landing\} brands=\{brands\} \/>/);
  assert.match(landing, /<h2 id="explora" className="t-section text-ink">Explora \{label\}<\/h2>/);
  assert.match(landing, /<div id=\{BRANDS_ANCHOR\}/);
  assert.match(landing, /brandsAlphabetical\(brands\)\.map/);
  assert.match(source("app/instrumentos/[slug]/page.tsx"), /brands=\{catalogBrands\[landing\.category\] \?\? \[\]\}/);
});
