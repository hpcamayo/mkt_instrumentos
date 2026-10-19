// Effortless Laria, batch "stores" (docs/ux-effortless/stores.md): the stores directory (find-13), search and sort
// inside a store (find-14), where the store is and when it opens (list-12) and the owner's private preview (shop-04).
// The database side (columns, check, directory and category functions, who can update what) is
// tests/ux-stores-storefront.sql.
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
  "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", without(props, "prefetch", "onNavigate"), children) },
  "next/navigation": { usePathname: () => "/tiendas/casa-musical-grau", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push() {} }) },
  "@/components/marketplace-image": { MarketplaceImage: (image) => React.createElement("img", { src: image.src, alt: image.alt }) },
  "@/components/content-report": { ContentReport: ({ targetType, label }) => React.createElement("button", { "data-report": targetType }, label) },
  "@/components/whatsapp-contact-link": { WhatsAppContactLink: ({ children, href }) => React.createElement("a", { href, "data-contact": "" }, children) },
  "@/components/store/store-photos": { StorePhotos: ({ photos }) => React.createElement("ul", { "data-photos": photos.length }) },
};
const html = (element) => renderToStaticMarkup(element);
const storefront = load("lib/store-storefront.ts");
const catalog = load("lib/catalog-filters.ts");

const casaGrau = {
  id: "s1", name: "Casa Musical Grau", slug: "casa-musical-grau", description: null, city: "Lima", district: "Cercado de Lima", region: "Lima",
  whatsapp_phone: "51999999999", logo_url: null, banner_url: null, is_verified: true, created_at: "2026-07-01T00:00:00Z",
  instagram_url: null, facebook_url: null, tiktok_url: null, website_url: null, store_photos: [],
};

test("list-12: the address is public only when the store agreed; the map link searches address, district and city", () => {
  // public_address is computed by the database: the street address while show_address is true, otherwise null.
  const row = { public_address: null, district: "Cercado de Lima", city: "Lima", opening_hours: "  Lun a sáb de 10 a. m. a 7 p. m.  " };
  assert.deepEqual(storefront.publicStoreLocation(row), { address: null, mapsHref: null, hours: "Lun a sáb de 10 a. m. a 7 p. m." });
  assert.equal(storefront.publicStoreLocation({ ...row, public_address: undefined }).address, null, "an older row without the column shows no address");
  const shown = storefront.publicStoreLocation({ ...row, public_address: "Jr. Ica 455" });
  assert.equal(shown.address, "Jr. Ica 455");
  assert.equal(shown.mapsHref, "https://www.google.com/maps/search/?api=1&query=Jr.%20Ica%20455%2C%20Cercado%20de%20Lima%2C%20Lima%2C%20Per%C3%BA");
  // A repeated part (district equal to the city) is searched once.
  assert.equal(storefront.mapsSearchUrl({ address: "Av. Ejército 101", district: "Arequipa", city: "Arequipa" }), "https://www.google.com/maps/search/?api=1&query=Av.%20Ej%C3%A9rcito%20101%2C%20Arequipa%2C%20Per%C3%BA");
  assert.deepEqual(storefront.publicStoreLocation({ public_address: "  ", opening_hours: "" }), { address: null, mapsHref: null, hours: null });
  // The address leaves the row before it is rendered.
  const clean = storefront.withoutPrivateStoreFields({ ...casaGrau, public_address: "Jr. Ica 455", status: "active" });
  assert.equal("public_address" in clean, false);
  assert.equal(clean.status, "active");
});

test("list-12: 'Sobre la tienda', the header and the seller card show the address with Cómo llegar and the hours", () => {
  const location = storefront.publicStoreLocation({ public_address: "Jr. Ica 455", district: "Cercado de Lima", city: "Lima", opening_hours: "Lun a vie 10–19\nSáb 10–14" });
  const sections = load("components/store/store-sections.tsx", mocks);
  const about = html(React.createElement(sections.StoreAboutSection, { store: casaGrau, location }));
  assert.match(about, /Dirección<\/dt><dd[^>]*><span class="break-words">Jr\. Ica 455<\/span>/);
  assert.match(about, /<a href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=[^"]+" target="_blank" rel="noopener noreferrer" class="link[^"]*">Cómo llegar<span class="sr-only"> \(abre Google Maps en otra pestaña\)<\/span><\/a>/);
  assert.match(about, /Horario de atención<\/dt><dd[^>]*><span class="whitespace-pre-line break-words">Lun a vie 10–19\nSáb 10–14<\/span>/);
  assert.match(about, /data-report="store"/);
  // Not agreed: no address and no map link, the hours still show.
  const hidden = html(React.createElement(sections.StoreAboutSection, { store: casaGrau, location: storefront.publicStoreLocation({ public_address: null, opening_hours: "Lun a vie 10–19" }) }));
  assert.doesNotMatch(hidden, /Jr\. Ica|Dirección|Cómo llegar|google/);
  assert.match(hidden, /Horario de atención/);
  // Without either, "Sobre la tienda" is as before.
  const plain = html(React.createElement(sections.StoreAboutSection, { store: casaGrau }));
  assert.doesNotMatch(plain, /Dirección|Horario/);

  const { StoreHeader } = load("components/store/store-header.tsx", mocks);
  const header = html(React.createElement(StoreHeader, { store: casaGrau, total: 12, rating: null, location }));
  assert.match(header, /<span class="sr-only">Dirección: <\/span><span class="break-words">Jr\. Ica 455<\/span>/);
  assert.match(header, />Cómo llegar</);
  assert.match(header, /<span class="sr-only">Horario de atención: <\/span>Lun a vie 10–19/);

  const { SellerCard } = load("components/listing/seller-card.tsx", mocks);
  const seller = { name: "Casa Musical Grau", kind: "verified", place: "Cercado de Lima, Lima", storeHref: "/tiendas/casa-musical-grau", rating: null, since: null };
  const card = html(React.createElement(SellerCard, { seller, listingCount: null, visit: location }));
  assert.match(card, /Jr\. Ica 455/);
  assert.match(card, /target="_blank" rel="noopener noreferrer"[^>]*>Cómo llegar/);
  assert.doesNotMatch(html(React.createElement(SellerCard, { seller, listingCount: null })), /Cómo llegar|Horario/);
  // The listing page passes the store row through the same gate.
  const listingPage = source("app/instrumentos/[slug]/page.tsx");
  assert.match(listingPage, /visit=\{isStore && store \? publicStoreLocation\(store\) : undefined\}/);
  // Public reads name public_address, never the raw address, its flag or the owner (the public cannot read them).
  const storeColumns = [
    ...[...listingPage.matchAll(/\bstores \(([^()]*)\)/g)].map((match) => match[1]),
    source("app/tiendas/[slug]/page.tsx").match(/const STORE_SELECT = `([^`]*)`/)[1],
  ].join(",");
  assert.match(storeColumns, /\bpublic_address\b/);
  assert.doesNotMatch(storeColumns, /^\s*(address|show_address|owner_user_id),?$/m);
});

test("find-14: the store page reads category, brand and sort only, and its links stay on the store page", () => {
  const filters = storefront.storeListingFilters({ category: "guitars", brand: " Fender ", sort: "price_asc", location: "Lima", condition: "Nuevo", seller_type: "individual" });
  assert.deepEqual(filters, { category: "guitars", brand: "Fender", cities: [], conditions: [], advanced: {}, sort: "price_asc" });
  assert.deepEqual(storefront.storeListingFilters({ category: "spaceships", sort: "random" }), { category: undefined, brand: undefined, cities: [], conditions: [], advanced: {}, sort: "newest" });
  assert.deepEqual(storefront.storeFilterParams(filters), { category: "guitars", brand: "Fender", sort: "price_asc" });
  assert.equal(storefront.storeFiltersActive({ ...filters, category: undefined, brand: undefined }), false, "sort alone is not a filter");
  // The catalog's own helpers build the URLs with the store as their base path; the catalog is unchanged.
  const scope = { path: "/tiendas/casa-musical-grau" };
  assert.equal(catalog.catalogHref(filters, scope), "/tiendas/casa-musical-grau?category=guitars&brand=Fender&sort=price_asc");
  assert.equal(catalog.catalogHref(catalog.clearedFilters(), scope), "/tiendas/casa-musical-grau");
  assert.equal(catalog.catalogHref(filters), "/listados?category=guitars&brand=Fender&sort=price_asc");
  // Chips: only the categories the store has, in taxonomy order, with their counts.
  assert.deepEqual(storefront.storeCategoryChips([{ category: "pedals", listing_count: 3 }, { category: "guitars", listing_count: 12 }, { category: "basses", listing_count: 0 }]), [
    { value: "guitars", label: "Guitarras", count: 12 },
    { value: "pedals", label: "Pedales", count: 3 },
  ]);
});

test("find-14: chips, brand box and sort render as links and a GET form to the store page", () => {
  const { StoreListingFilters, StoreSortMenu } = load("components/store/store-listing-filters.tsx", mocks);
  const scope = { path: "/tiendas/casa-musical-grau" };
  const filters = storefront.storeListingFilters({ category: "pedals" });
  const categories = storefront.storeCategoryChips([{ category: "guitars", listing_count: 12 }, { category: "pedals", listing_count: 3 }]);
  const markup = html(React.createElement(StoreListingFilters, { filters, scope, categories }));
  assert.match(markup, /<nav aria-label="Categorías de la tienda"/);
  assert.match(markup, /<a href="\/tiendas\/casa-musical-grau" id="filtro-tienda-categoria-todos" class="[^"]*"><span class="truncate">Todas <span class="t-meta tabular-nums">15<\/span>/);
  assert.match(markup, /href="\/tiendas\/casa-musical-grau\?category=guitars"/);
  // The chosen chip has the check and aria-current, and pressing it again clears it.
  assert.match(markup, /<a href="\/tiendas\/casa-musical-grau" id="filtro-tienda-categoria-pedals" aria-current="true" class="[^"]*bg-accent[^"]*"><svg/);
  assert.match(markup, /<form class="mt-2" action="\/tiendas\/casa-musical-grau" method="get"><input type="hidden" name="category" value="pedals"\/><input id="tienda-marca" [^>]*name="brand"\/>/);
  assert.match(markup, /id="tienda-marca-titulo"[^>]*>Buscar por marca en esta tienda</);
  assert.match(markup, /Filtros activos:/);
  assert.match(markup, /aria-label="Quitar filtro: Categoría: Pedales"/);
  assert.match(markup, />Ordenar<svg/, "the phone sort sheet button");
  assert.match(html(React.createElement(StoreSortMenu, { filters, scope })), /Ordenar:<\/span>Más recientes/);
  // One category and no filter: no chip row.
  const single = html(React.createElement(StoreListingFilters, { filters: storefront.storeListingFilters({}), scope, categories: categories.slice(0, 1) }));
  assert.doesNotMatch(single, /Categorías de la tienda|Filtros activos/);
  // The page keeps 24 a page, the filters in the URL and the old decision's note points to find-14.
  const page = source("app/tiendas/[slug]/page.tsx");
  assert.match(page, /<Pagination page=\{page\} total=\{total\} path=\{path\} params=\{storeFilterParams\(filters\)\} \/>/);
  assert.match(page, /LISTINGS_PAGE_SIZE/);
  assert.match(page, /find-14 \(docs\/ux-effortless\/stores\.md\) replaces L16's "no\s+\/\/ in-store search, chips or sort"/);
  assert.match(page, /storeFiltersActive\(storeListingFilters\(resolved\)\)\) return \{ \.\.\.buildStoreMetadata\(store, 1\), robots: NOINDEX_FOLLOW_ROBOTS \}/);
});

test("find-13: the directory's tabs, city chips, URLs and metadata", () => {
  assert.equal(storefront.storeDirectoryHref(), "/tiendas");
  assert.equal(storefront.storeDirectoryHref({ city: "Arequipa" }), "/tiendas?ciudad=Arequipa");
  assert.equal(storefront.storeDirectoryHref({ view: "publicaciones", page: 2 }), "/tiendas?vista=publicaciones&page=2");
  assert.equal(storefront.storeDirectoryHref({ view: "publicaciones", city: "Lima" }), "/tiendas?vista=publicaciones", "the city belongs to the stores tab");
  assert.equal(storefront.storeDirectoryView({ vista: "publicaciones" }), "publicaciones");
  assert.equal(storefront.storeDirectoryView({ vista: "otra" }), "tiendas");
  const stores = [{ city: "Lima" }, { city: "Arequipa" }, { city: "Lima" }, { city: "Cusco" }];
  assert.deepEqual(storefront.storeDirectoryCities(stores), [{ city: "Lima", count: 2 }, { city: "Arequipa", count: 1 }, { city: "Cusco", count: 1 }]);
  assert.equal(storefront.filterStoresByCity(stores, "lima").length, 2);
  assert.equal(storefront.filterStoresByCity(stores, undefined).length, 4);
  // Only the plain stores tab is indexed, with its canonical.
  assert.deepEqual(storefront.buildStoreDirectoryMetadata({ view: "tiendas", page: 1 }).alternates, { canonical: "/tiendas" });
  for (const variant of [{ view: "tiendas", city: "Lima", page: 1 }, { view: "publicaciones", page: 1 }, { view: "publicaciones", page: 3 }]) {
    const metadata = storefront.buildStoreDirectoryMetadata(variant);
    assert.deepEqual(metadata.robots, { index: false, follow: true }, JSON.stringify(variant));
    assert.equal(metadata.alternates, undefined);
  }

  const directory = load("components/store/store-directory.tsx", mocks);
  const tabs = html(React.createElement(directory.StoreDirectoryTabs, { view: "publicaciones" }));
  assert.match(tabs, /<nav aria-label="Vista de tiendas"/);
  assert.match(tabs, /<a href="\/tiendas" class="[^"]*border-transparent[^"]*">Tiendas<\/a>/);
  assert.match(tabs, /<a href="\/tiendas\?vista=publicaciones" aria-current="page" class="[^"]*border-ink[^"]*">Publicaciones de tiendas verificadas<\/a>/);
  assert.match(tabs, /min-h-11/);
  const chips = html(React.createElement(directory.StoreCityChips, { cities: storefront.storeDirectoryCities(stores), current: "Lima", total: 4 }));
  assert.match(chips, /<a href="\/tiendas" aria-current="page"|href="\/tiendas"[^>]*>Todas/);
  assert.match(chips, /<a href="\/tiendas" aria-current="page" class="[^"]*bg-accent[^"]*"><svg[^>]*>.*?<span class="truncate">Lima <span/);
  assert.match(chips, /href="\/tiendas\?ciudad=Arequipa"/);
  assert.equal(html(React.createElement(directory.StoreCityChips, { cities: [{ city: "Lima", count: 3 }], total: 3 })), "", "one city: no chips");

  const card = (store) => html(React.createElement(directory.StoreDirectoryCard, { store }));
  const base = { id: "s1", name: "Casa Musical Grau", slug: "casa-musical-grau", city: "Lima", district: "Cercado de Lima", region: "Lima", logo_url: null, is_verified: true, listing_count: 12, review_count: 0, average_rating: null };
  const verified = card(base);
  assert.match(verified, /^<a href="\/tiendas\/casa-musical-grau"/);
  assert.match(verified, /Tienda verificada/);
  assert.match(verified, />CM</);
  assert.match(verified, /Cercado de Lima, Lima/);
  assert.match(verified, /12 publicaciones/);
  assert.doesNotMatch(verified, /★|reseña/, "no rating without visible reviews");
  const rated = card({ ...base, is_verified: false, listing_count: 1, review_count: 9, average_rating: 4.83 });
  assert.match(rated, /4\.8 ★/);
  assert.match(rated, /4\.8 de 5/);
  assert.match(rated, /9 reseñas/);
  assert.match(rated, /1 publicación/);
  assert.match(rated, />Tienda</);
});

test("find-13: the shell, the footer, the home and the sitemap point to /tiendas", () => {
  const shell = load("lib/shell.ts");
  assert.equal(shell.VERIFIED_STORES_PATH, "/tiendas");
  assert.equal(shell.getShellLayout("/tiendas").phoneSearch, "row");
  assert.match(source("components/site-footer.tsx"), /\{ href: VERIFIED_STORES_PATH, label: "Tiendas verificadas" \}/);
  assert.match(source("app/sitemap.ts"), /absoluteUrl\("\/tiendas"\)/);
  const page = source("app/tiendas/page.tsx");
  assert.match(page, /supabase\.rpc\("get_public_store_directory"\)/);
  assert.match(page, /fetchCatalogPage\(supabase, VERIFIED_LISTINGS, page\)/);
  assert.match(page, /sellerType: "verified_store"/);
  assert.match(page, /<Pagination page=\{page\} total=\{total\} path="\/tiendas" params=\{\{ vista: "publicaciones" \}\} \/>/);
  assert.doesNotMatch(page, /getSupabaseAdminClient|service_role/);
});

test("shop-04: only the owner sees a store that is not active, as a noindex preview without contact or visit records", () => {
  assert.deepEqual(storefront.ownerNotice("pending"), { preview: true, title: "Vista previa: solo tú ves esta página", text: "Será pública cuando Laria apruebe tu tienda." });
  assert.equal(storefront.ownerNotice("active").preview, false);
  assert.equal(storefront.ownerNotice("rejected").preview, true);
  assert.equal(storefront.ownerNotice("hidden").preview, true);
  assert.equal(storefront.hasSupabaseAuthCookie(["sb-abc-auth-token"]), true);
  assert.equal(storefront.hasSupabaseAuthCookie(["sb-127-auth-token.0", "theme"]), true);
  assert.equal(storefront.hasSupabaseAuthCookie(["laria_session", "sb-abc-auth-token-code-verifier"]), false);

  const { StoreOwnerNotice } = load("components/store/store-owner-notice.tsx", mocks);
  const notice = html(React.createElement(StoreOwnerNotice, { status: "pending" }));
  assert.match(notice, /Vista previa: solo tú ves esta página\.<\/strong> Será pública cuando Laria apruebe tu tienda\./);
  assert.match(notice, /<a href="\/mi-cuenta\/tienda" class="[^"]*">Editar perfil<\/a>/);
  assert.match(html(React.createElement(StoreOwnerNotice, { status: "active" })), /Esta es tu tienda\.<\/strong> Así ven tu página los compradores\..*Editar perfil/);

  // The header in preview draws the contact button inert: no contact link, nothing recorded.
  const { StoreHeader } = load("components/store/store-header.tsx", mocks);
  const header = html(React.createElement(StoreHeader, { store: casaGrau, total: 0, rating: null, preview: true }));
  assert.doesNotMatch(header, /data-contact/);
  assert.match(header, /<span aria-disabled="true" class="[^"]*pointer-events-none[^"]*">.*Contactar por WhatsApp<\/span>/);
  assert.match(header, /En la vista previa este botón no abre WhatsApp/);
  assert.match(html(React.createElement(StoreHeader, { store: casaGrau, total: 0, rating: null })), /data-contact=""/);
  const sections = load("components/store/store-sections.tsx", mocks);
  const previewAbout = html(React.createElement(sections.StoreAboutSection, { store: casaGrau, preview: true }));
  assert.doesNotMatch(previewAbout, /data-report/);
  // A store that is not active was not approved: the preview never says it was.
  assert.match(previewAbout, /Laria aún no aprueba esta tienda\./);
  assert.doesNotMatch(previewAbout, /Laria aprobó|Laria revisó a mano/);

  const page = source("app/tiendas/[slug]/page.tsx");
  // The owner's store is read with the signed-in user's session, never the service role.
  assert.match(page, /const supabase = await getSupabaseServerClient\(\);[\s\S]*?\.eq\("slug", slug\)\s*\.eq\("owner_user_id", viewerId\)/);
  assert.doesNotMatch(page, /getSupabaseAdminClient|service_role/);
  // Everyone else gets the 404; the preview is noindex and records no visit or contact.
  assert.match(page, /if \(!row\) notFound\(\);/);
  assert.match(page, /if \(owned\) return \{ title: `Vista previa de \$\{owned\.store\.name\}`, robots: NOINDEX_ROBOTS \};/);
  assert.match(page, /\{preview \? null : <StoreVisitTelemetry storeId=\{store\.id\} \/>\}/);
  assert.match(page, /\{preview \? null : <JsonLd data=\{buildStoreJsonLd\(publicStore\)\} \/>\}/);
  assert.match(page, /\{isOwner \? <StoreOwnerNotice status=\{status\} \/> : null\}/);
  // The sitemap lists active stores only, so a preview is never in it.
  assert.match(source("app/sitemap.ts"), /\.from\("stores"\)\s*\.select\("id,slug,updated_at"\)\s*\.eq\("status", "active"\)/);
});

test("the migration adds the two store columns and the read functions, additively", () => {
  const sql = source("supabase/migrations/20261106140000_ux_store_location.sql");
  assert.match(sql, /add column show_address boolean not null default false/);
  assert.match(sql, /add column opening_hours text/);
  assert.match(sql, /char_length\(opening_hours\) between 1 and 300/);
  assert.match(sql, /create or replace function public\.get_public_store_directory\(\)[\s\S]*security definer[\s\S]*where s\.status = 'active'/);
  assert.doesNotMatch(sql.slice(sql.indexOf("get_public_store_directory()"), sql.indexOf("get_store_listing_categories")), /s\.address|contact_person|ruc|email/);
  assert.match(sql, /create or replace function public\.get_store_listing_categories\(p_store_id uuid\)[\s\S]*security invoker/);
  assert.doesNotMatch(sql, /drop |alter column|revoke select/i);
});
