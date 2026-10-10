// UX-4, the listing and store pages (docs/ux-redesign/ux-4-listing-store.md): the spec strip and table (L9), the
// reviewer's name (L11), reviews left out when the reputation call fails, seller figures left out when empty, the
// related sections left out when empty, the gallery (thumbnails, "+N", counter, lightbox entry), the one contact
// module, the report form loaded on demand (L15), the strip's current item (L13) and the store page's socials.
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
const specs = load("lib/listing-specs.ts");
const page = load("lib/listing-page.ts");

const guitar = {
  category: "guitars", instrument_type: "electric_guitar", brand: "Fender", model: "Player Stratocaster", condition: "Usado - buen estado",
  attributes: { handedness: "right", frets: "22", shape: "strat", strings: "6", pickups: "hss", body_type: "solid_body" },
};

test("L9: the strip shows up to four of the type's attributes, the card's two first", () => {
  const strip = specs.getSpecStrip(guitar);
  assert.equal(strip.length, 4);
  assert.deepEqual(strip.slice(0, 2).map((spec) => spec.value), ["HSS", "6 cuerdas"]);
  assert.ok(!strip.some((spec) => /Condición|Marca|Modelo/.test(spec.label)));
  assert.deepEqual(specs.getSpecStrip({ instrument_type: "electric_guitar", attributes: null }), []);
});

test("L9: the table lists Tipo, Marca, Modelo, Condición and every attribute, without empty rows or repeats", () => {
  const table = specs.getSpecTable(guitar);
  assert.deepEqual(table.slice(0, 4), [
    { label: "Tipo", value: "Guitarras eléctricas" },
    { label: "Marca", value: "Fender" },
    { label: "Modelo", value: "Player Stratocaster" },
    { label: "Condición", value: "Usado · buen estado" },
  ]);
  assert.equal(table.length, 4 + Object.keys(guitar.attributes).length);
  for (const label of ["Publicado", "Ciudad", "Vendedor", "Tienda", "Categoría"]) assert.ok(!table.some((spec) => spec.label === label), label);
  const bare = specs.getSpecTable({ category: "pedals", instrument_type: null, attributes: null, brand: null, model: "", condition: null });
  assert.deepEqual(bare, [{ label: "Tipo", value: "Pedales" }]);
  assert.ok(!JSON.stringify(bare).includes("No indicad"));
});

test("L11: reviewers show as first name and initial; dates and figures read in words", () => {
  assert.equal(page.reviewerDisplayName("Rodrigo Castañeda Ríos"), "Rodrigo C.");
  assert.equal(page.reviewerDisplayName("  lucía   ñuñez "), "lucía Ñ.");
  assert.equal(page.reviewerDisplayName("Carlos"), "Carlos");
  assert.equal(page.reviewerDisplayName(null), "Comprador de Laria");
  assert.equal(page.formatMonthYear("2026-09-15T12:00:00Z"), "set. 2026");
  // Lima is UTC−5: the first hours of a UTC month still belong to the previous month.
  assert.equal(page.formatMonthYear("2026-08-01T03:00:00Z"), "jul. 2026");
  assert.equal(page.formatMonthYear("nope"), null);
  assert.equal(page.formatRating(4.78), "4.8");
  assert.equal(page.reviewCountLabel(1), "1 reseña");
  assert.equal(page.listingCountLabel(9), "9 publicaciones");
  assert.equal(page.formatPublishedAgo("2026-10-07T00:00:00Z", Date.parse("2026-10-10T01:00:00Z")), "Publicado hace 3 días");
});

test("the reviews: verified-only wording, five latest, left out when the reputation call fails", () => {
  const { ReputationSection } = load("components/listing/reputation-section.tsx", mocks);
  assert.equal(html(React.createElement(ReputationSection, { reputation: null, title: "Reseñas de Ana" })), "");
  const items = Array.from({ length: 5 }, (_, n) => ({ id: `r${n}`, rating: 5 - (n % 2), comment: n ? null : "Todo bien", submitted_at: "2026-09-15T12:00:00Z", reviewer_name: n ? null : "Lucía Fernández" }));
  const markup = html(React.createElement(ReputationSection, { reputation: { review_count: 9, average_rating: 4.78, items }, title: "Reseñas de Ana" }));
  assert.match(markup, /4\.8 de 5<\/span> · 9 reseñas/);
  assert.match(markup, /Lucía F\./);
  assert.doesNotMatch(markup, /Fernández/);
  assert.match(markup, /5 de 5/);
  assert.match(markup, /set\. 2026/);
  assert.equal((markup.match(/data-report="review"/g) ?? []).length, 5);
  assert.match(markup, /Mostrando las 5 más recientes de 9/);
  assert.match(markup, /Solo se reseña después de una compra que comprador y vendedor confirmaron en Laria\. Laria no procesó el pago ni la entrega\./);
  const none = html(React.createElement(ReputationSection, { reputation: { review_count: 0, average_rating: null, items: [] }, title: "Reseñas de Ana" }));
  assert.match(none, /Aún no tiene reseñas\./);
  assert.doesNotMatch(none, /Mostrando/);
  // The page reads a failed call as null (no "no reviews" claim).
  const listing = source("app/instrumentos/[slug]/page.tsx");
  assert.match(listing, /reputationResult && !reputationResult\.error \? readPublicReputation\(reputationResult\.data\) : null/);
  assert.equal(load("lib/transactions.ts").readPublicReputation({ review_count: "x" }), null);
});

test("L10: the seller card shows real figures only, no contact button, and links a store", () => {
  const { SellerCard } = load("components/listing/seller-card.tsx", mocks);
  const base = { name: "Rodrigo Castañeda", kind: "particular", place: "Miraflores, Lima", rating: null, since: null };
  const bare = html(React.createElement(SellerCard, { seller: base, listingCount: null }));
  assert.match(bare, /id="vendedor"/);
  assert.match(bare, /Particular/);
  assert.doesNotMatch(bare, /★|reseña|En Laria desde|Ver la tienda|wa\.me|WhatsApp/);
  const store = html(React.createElement(SellerCard, {
    seller: { ...base, name: "Casa Musical Grau", kind: "verified", rating: { average: 4.8, count: 9 }, since: "jul. 2026", storeHref: "/tiendas/casa-musical-grau" },
    listingCount: React.createElement("li", null, "12 publicaciones"),
  }));
  assert.match(store, /Tienda verificada/);
  assert.match(store, /4\.8 de 5/);
  assert.match(store, /9 reseñas/);
  assert.match(store, /12 publicaciones/);
  assert.match(store, /En Laria desde jul\. 2026/);
  assert.match(store, /href="\/tiendas\/casa-musical-grau"[^>]*>Ver la tienda/);
  assert.match(store, />CM</);
  const sold = html(React.createElement(SellerCard, { seller: base, listingCount: null, sold: true }));
  assert.match(sold, /Este registro se conserva como historial\. Laria no procesó ni garantizó la transacción\./);
});

test("L12: related sections show four cards in the catalog grid and are left out when empty", () => {
  const { RelatedListings, RELATED_GRID } = load("components/listing/related-listings.tsx", mocks);
  assert.equal(html(React.createElement(RelatedListings, { id: "similares", title: "Publicaciones similares", link: null, listings: [] })), "");
  const listings = Array.from({ length: 6 }, (_, n) => ({ id: `l${n}`, title: `Guitarra ${n}` }));
  const markup = html(React.createElement(RelatedListings, { id: "similares", title: "Publicaciones similares", link: { href: "/listados?category=guitars", label: "Ver todo" }, listings }));
  assert.equal((markup.match(/<article data-source="recommendations"/g) ?? []).length, 4);
  assert.match(markup, />Ver todo</);
  assert.match(RELATED_GRID, /grid-cols-2[\s\S]*md:grid-cols-3[\s\S]*lg:grid-cols-4/);
  assert.doesNotMatch(source("app/instrumentos/[slug]/page.tsx"), /emptyMessage|Todavía no hay publicaciones similares/);
});

test("L3: the gallery has a button per photo, six thumbnails (four on phones), +N tiles and an eager first photo", () => {
  const { ListingGallery } = load("components/listing/listing-gallery.tsx", { ...mocks, "@/components/listing/lightbox": { Lightbox: () => null } });
  const photos = Array.from({ length: 8 }, (_, n) => ({ id: `p${n}`, image_url: `/p${n}.jpg`, alt_text: null, sort_order: n }));
  const markup = html(React.createElement(ListingGallery, { photos, title: "Strat" }));
  assert.equal((markup.match(/aria-label="Ampliar foto \d de 8"/g) ?? []).length, 8);
  assert.match(markup, /role="group" aria-label="Miniaturas de fotos"/);
  assert.equal((markup.match(/aria-label="Ver foto \d de 8"/g) ?? []).length, 6);
  assert.match(markup, /aria-label="Ver foto 1 de 8" aria-current="true"/);
  assert.match(markup, /aria-label="Ver 4 fotos más"[^>]*lg:hidden[^>]*>\+4</);
  assert.match(markup, /aria-label="Ver 2 fotos más"[^>]*hidden lg:flex[^>]*>\+2</);
  assert.match(markup, /Foto <\/span>1 \/ 8/);
  const images = [...markup.matchAll(/<img [^>]*>/g)].map(([tag]) => tag);
  assert.match(images[0], /data-priority=""/);
  assert.ok(images.slice(1).every((tag) => /loading="lazy"/.test(tag)));
  assert.ok(images.slice(8).every((tag) => /data-sizes="\(max-width: 1023px\) 56px, 72px"/.test(tag)));
  assert.match(html(React.createElement(ListingGallery, { photos: [], title: "Strat" })), /Sin foto/);
  const one = html(React.createElement(ListingGallery, { photos: photos.slice(0, 1), title: "Strat" }));
  assert.doesNotMatch(one, /Miniaturas|1 \/ 1|Foto siguiente/);
  const lightbox = source("components/listing/lightbox.tsx");
  for (const rule of [/showModal\(\)/, /onCancel=/, /ArrowLeft/, /ArrowRight/, /event\.key === "Tab"/, /aria-live="polite"/, /label="Cerrar"/, /sizes="100vw"/]) assert.match(lightbox, rule);
  assert.match(source("components/listing/listing-gallery.tsx"), /openerRef\.current\?\.focus\(\)/);
});

test("L4: one contact module, the phone bar is the same element, and sold pages have none", () => {
  const contact = source("components/listing/contact-module.tsx");
  assert.match(contact, /contact-bar/);
  assert.match(contact, /<FavoriteButton listingId=\{listingId\} variant="module" \/>/);
  const css = source("app/globals.css");
  assert.match(css, /@media \(max-width: 1023px\) and \(min-height: 560px\) \{\s*\.contact-bar \{\s*position: fixed;/);
  assert.match(css, /html:has\(\.contact-bar\) \{\s*scroll-padding-bottom/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  const listing = source("app/instrumentos/[slug]/page.tsx");
  assert.match(listing, /\{isSold \? \([\s\S]*ya no está disponible para consultas de compra[\s\S]*Ver publicaciones similares[\s\S]*\) : \(\s*<ContactModule/);
  assert.match(listing, /\{isSold \? null : <TrustNote surface="listing"/);
  assert.match(listing, /\{isSold \? null : <div aria-hidden="true" className="contact-bar-spacer" \/>\}/);
  // No public view count (L6 A).
  assert.doesNotMatch(listing, /initialViewCount|Visto/);
});

test("L15: the report form and its Supabase client are not in the pages' first load", () => {
  const trigger = source("components/content-report.tsx");
  assert.match(trigger, /dynamic\(\(\) => import\("@\/components\/content-report-form"\), \{\s*ssr: false/);
  assert.doesNotMatch(trigger, /import .*browser-client/);
  for (const file of ["app/instrumentos/[slug]/page.tsx", "app/tiendas/[slug]/page.tsx", "components/listing/reputation-section.tsx"]) {
    assert.doesNotMatch(source(file), /content-report-form|browser-client/, file);
  }
  assert.match(source("components/content-report-form.tsx"), /getSupabaseBrowserClient/);
});

test("L13: listing pages mark their category in the strip after hydration", () => {
  const strip = source("components/strip-current.tsx");
  assert.match(strip, /useSyncExternalStore\(subscribe, \(\) => current, \(\) => null\)/);
  assert.match(source("components/global-categories.tsx"), /pageCurrent \?\? currentStripKey\(pathname, params\)/);
  assert.match(source("app/instrumentos/[slug]/page.tsx"), /<StripCurrent value=\{listing\.category\} \/>/);
});

test("store socials are links only for http(s) URLs", () => {
  assert.equal(page.safeExternalUrl("https://instagram.com/casagrau"), "https://instagram.com/casagrau");
  assert.equal(page.safeExternalUrl("http://casagrau.pe"), "http://casagrau.pe/");
  assert.equal(page.safeExternalUrl("javascript:alert(1)"), null);
  assert.equal(page.safeExternalUrl("instagram.com/casagrau"), null);
  assert.equal(page.safeExternalUrl(""), null);
  assert.equal(page.safeExternalUrl(null), null);
});
