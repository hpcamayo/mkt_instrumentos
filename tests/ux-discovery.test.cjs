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
