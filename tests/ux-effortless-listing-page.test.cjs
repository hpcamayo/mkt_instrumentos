// Effortless Laria, batch "listing" (docs/ux-effortless/listing.md): the listing page's helpers and parts. Dates said
// the way people say them (list-04), "Antes" only for a real recent drop (list-05), the review breakdown (list-06),
// similar listings without the catalog (list-07), the seller's verified facts (list-10, trust-03), the opening
// WhatsApp message and quick questions (talk-01/02) and the one-time safety sheet (talk-04).
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
const mocks = {
  "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", without(props, "prefetch"), children) },
  "@/components/marketplace-image": { MarketplaceImage: (image) => React.createElement("img", { src: image.src, alt: image.alt, "data-sizes": image.sizes, "data-priority": image.priority ? "" : undefined, loading: image.loading }) },
  "@/components/content-report": { ContentReport: ({ targetType, label }) => React.createElement("button", { "data-report": targetType }, label) },
  "@/components/listing-card": { ListingCard: ({ listing, source: from }) => React.createElement("article", { "data-source": from }, listing.title) },
};
const html = (element) => renderToStaticMarkup(element);
const page = load("lib/listing-page.ts");
const message = load("lib/contact-message.ts");
const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-10-19T12:00:00Z");
const ago = (days) => new Date(now - days * DAY).toISOString();

test("list-04: times read the way people say them, and 'Actualizado' only for a real later change", () => {
  assert.equal(page.timeAgo(ago(0), now), "hoy");
  assert.equal(page.timeAgo(ago(1), now), "ayer");
  assert.equal(page.timeAgo(ago(5), now), "hace 5 días");
  assert.equal(page.timeAgo(ago(20), now), "hace 2 semanas");
  assert.equal(page.timeAgo(ago(65), now), "hace 2 meses");
  assert.equal(page.timeAgo(ago(400), now), "hace 1 año");
  assert.equal(page.timeAgo("nope", now), null);
  assert.equal(page.formatPublishedAgo(ago(3), now), "Publicado hace 3 días");
  assert.equal(page.formatUpdatedAgo(ago(2), ago(10), now), "Actualizado hace 2 días");
  assert.equal(page.formatUpdatedAgo(ago(10), ago(10), now), null);
  assert.equal(page.formatUpdatedAgo(null, ago(10), now), null);
  assert.equal(page.isQuietListing(ago(100), null, now), true);
  assert.equal(page.isQuietListing(ago(100), ago(10), now), false);
  assert.equal(page.isQuietListing(ago(30), null, now), false);
});

test("list-05: 'Antes' shows a real drop for 30 days and never on a sold listing or an increase", () => {
  const listing = { price_pen: 800, previous_price_pen: 950, price_dropped_at: ago(3), status: "approved" };
  assert.equal(page.visiblePreviousPrice(listing, now), 950);
  assert.equal(page.visiblePreviousPrice({ ...listing, price_dropped_at: ago(31) }, now), null);
  assert.equal(page.visiblePreviousPrice({ ...listing, status: "sold" }, now), null);
  assert.equal(page.visiblePreviousPrice({ ...listing, previous_price_pen: 700 }, now), null);
  assert.equal(page.visiblePreviousPrice({ ...listing, previous_price_pen: null }, now), null);
  const { Price } = load("components/ui/price.tsx");
  assert.match(html(React.createElement(Price, { value: 800, previous: 950 })), /Antes[\s\S]*<s[^>]*>S\/\s?950/);
});

test("list-06: the review page is read defensively and the breakdown counts each star", () => {
  const review = { id: "r1", rating: 5, comment: null, submitted_at: "2026-09-01T00:00:00Z", reviewer_name: null };
  const read = page.readReviewPage({ review_count: 3, breakdown: { 5: 2, 4: 1, 3: "x" }, items: [review, { id: "bad", rating: 9 }] });
  assert.deepEqual(read.breakdown, { 5: 2, 4: 1, 3: 0, 2: 0, 1: 0 });
  assert.deepEqual(read.items, [review]);
  assert.equal(page.readReviewPage({ review_count: -1, breakdown: {}, items: [] }), null);
  assert.equal(page.readReviewPage(null), null);
  const { ReputationSection } = load("components/listing/reputation-section.tsx", mocks);
  const markup = html(React.createElement(ReputationSection, {
    reputation: { review_count: 3, average_rating: 4.7, items: [review] },
    title: "Reseñas de Ana",
    breakdown: read.breakdown,
    subject: { user: "u1" },
  }));
  assert.match(markup, /5 estrellas[\s\S]*2/);
  assert.match(markup, /Ver las 3 reseñas/);
});

test("list-07: similar listings rank brand, then a price within 30%, then the city, newest among equals", () => {
  const source = { id: "s", brand: "Fender", price_pen: 1000, city: "Lima", published_at: ago(5), created_at: ago(5) };
  const make = (id, extra) => ({ id, brand: null, price_pen: 5000, city: "Cusco", published_at: ago(1), created_at: ago(1), ...extra });
  const ranked = page.rankSimilarListings([
    make("city", { city: "lima" }),
    make("price", { price_pen: 1250 }),
    make("brand", { brand: "fénder" }),
    make("none"),
    make("brand-old", { brand: "Fender", published_at: ago(40) }),
    source,
  ], source).map((item) => item.id);
  assert.deepEqual(ranked, ["brand", "brand-old", "price", "city", "none"]);
  assert.equal(page.rankSimilarListings([make("a"), make("b")], source, 1).length, 1);
});

test("list-03: the key spec line reads yes as the label, drops no, and keeps five", () => {
  const line = page.keySpecLine([
    { label: "Tipo", value: "Overdrive" },
    { label: "Incluye fuente", value: "Sí" },
    { label: "True bypass", value: "No" },
    { label: "Formato", value: "Compacto" },
    { label: "a", value: "1" }, { label: "b", value: "2" }, { label: "c", value: "3" },
  ]);
  assert.equal(line, "Overdrive · Incluye fuente · Compacto · 1 · 2");
  assert.equal(page.keySpecLine([{ label: "x", value: "no" }]), null);
});

test("list-10, trust-03: the seller card leads with verified facts and explains a verified store", () => {
  const facts = page.readSellerFacts({
    member_since: ago(20), last_active: "week", verified_sales: 3, email_confirmed: true,
    store: { ruc: "20123456789", razon_social: "Casa Grau SAC", address: "Av. Grau 123", district: "Barranco", city: "Lima", phone_on_file: true, verified_since: "2026-07-01T00:00:00Z" },
  });
  assert.equal(facts.verifiedSales, 3);
  assert.equal(facts.store.phoneOnFile, true);
  assert.equal(page.readSellerFacts({ verified_sales: -2 }).verifiedSales, 0);
  assert.equal(page.readSellerFacts([]), null);
  assert.equal(page.lastActiveLabel("today"), "Activo hoy");
  assert.equal(page.lastActiveLabel("year"), null);
  assert.equal(page.verifiedSalesLabel(1), "1 venta confirmada en Laria");
  assert.equal(page.isNewMember(ago(20), now), true);
  assert.equal(page.isNewMember(ago(90), now), false);

  const { SellerCard } = load("components/listing/seller-card.tsx", mocks);
  const particular = html(React.createElement(SellerCard, {
    now, listingCount: null,
    seller: { name: "Ana", kind: "particular", place: "Lima", rating: null, since: null, facts: { ...facts, store: null } },
  }));
  assert.match(particular, /Activo esta semana/);
  assert.match(particular, /3 ventas confirmadas en Laria/);
  assert.match(particular, /Nuevo en Laria/);
  assert.match(particular, /Correo confirmado/);
  const store = html(React.createElement(SellerCard, {
    now, listingCount: null,
    seller: { name: "Casa Grau", kind: "verified", place: "Lima", rating: null, since: null, facts, storeHref: "/tiendas/casa-grau" },
  }));
  assert.match(store, /<details/);
  // A store's RUC and razón social are public business data; the phone is only said to be on file.
  assert.match(store, /RUC 20123456789/);
  assert.match(store, /Razón social: Casa Grau SAC/);
  assert.match(store, /Un teléfono de contacto/);
  assert.match(store, /verificada desde/);
});

test("talk-01/02: the opening message names the item, price and link; questions are optional and appended", () => {
  const listing = { title: "Boss DS-1", slug: "boss-ds-1", price_pen: 299, seller_type: "individual" };
  const text = message.listingContactMessage(listing);
  assert.match(text, /^Hola, vi tu Boss DS-1 en Laria a S\/\s?299: https?:\/\/\S+\/instrumentos\/boss-ds-1 ¿Sigue disponible\?$/);
  assert.match(message.listingContactMessage({ ...listing, seller_type: "store", price_pen: null }), /^Hola, vi su Boss DS-1 en Laria: /);
  assert.match(message.listingContactMessage(listing, { outOfStock: true }), /Aparece agotado/);
  assert.deepEqual(message.quickQuestions("store").map((q) => q.id), ["probar", "envio", "estuche", "precio"]);
  const href = `https://wa.me/51987654321?text=${encodeURIComponent("Hola")}`;
  assert.equal(message.withQuestions(href, []), href);
  const withTwo = message.withQuestions(href, ["¿Puedo probarlo?", "¿Incluye estuche o funda?"]);
  assert.doesNotMatch(withTwo, /\+/);
  assert.equal(new URL(withTwo).searchParams.get("text"), "Hola ¿Puedo probarlo? ¿Incluye estuche o funda?");
  assert.equal(message.withQuestions("https://example.com/?text=a", ["b"]), "https://example.com/?text=a");
  // No chip is selected on load.
  assert.doesNotMatch(source("components/listing/contact-extras.tsx"), /defaultChecked|aria-pressed=\{true\}/);
});

test("talk-04: the safety sheet comes before an expensive first contact or a purchase request", () => {
  assert.equal(message.needsSafetySheet(999, false), false);
  assert.equal(message.needsSafetySheet(1000, false), true);
  assert.equal(message.needsSafetySheet(null, true), true);
  assert.equal(message.needsSafetySheet(null, false), false);
});
