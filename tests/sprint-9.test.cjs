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

// Minimal TS loader that resolves the "@/..." alias; `mocks` replace modules by specifier.
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

function withEnv(values, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  try {
    const result = fn();
    if (result && typeof result.then === "function") return result.finally(restore);
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

const linkMock = { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) };
const listings = load("lib/listings.ts");
const categories = load("lib/category-pages.ts");
const seo = load("lib/seo.ts");
const site = load("lib/site.ts");

test("SEO-001/SEO-007: category landing pages come from the canonical taxonomy with unique, collision-free slugs", () => {
  assert.deepEqual(categories.categoryLandingPages.map((page) => page.category), listings.categoryOptions.map((option) => option.value));
  assert.deepEqual(categories.categoryLandingPages.map((page) => page.label), listings.categoryOptions.map((option) => option.label));
  const slugs = categories.categoryLandingPages.map((page) => page.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const slug of slugs) assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.equal(categories.getCategoryLandingBySlug("guitarras").category, "guitars");
  assert.equal(categories.getCategoryLandingBySlug("baterias").category, "drums");
  assert.equal(categories.getCategoryLandingBySlug("microfonos").category, "microphones");
  assert.equal(categories.getCategoryLandingBySlug("fender-stratocaster-0b6f4a1e-6a3d-4c43-9d49-1d3f64f9c2aa"), null);
  assert.equal(categories.categoryLandingPath("guitars"), "/instrumentos/guitarras");
  assert.equal(categories.categoryLandingPath("unknown"), "/listados?category=unknown");
  for (const page of categories.categoryLandingPages) {
    assert.ok(page.description.length >= 70 && page.description.length <= 160, `${page.slug} description length`);
    assert.doesNotMatch(`${page.heading} ${page.description} ${page.intro}`, /garantiz|mejor precio|envío gratis|pago seguro/i);
  }
});

test("SEO-001: listing slugs can never equal a reserved category slug and the route dispatches categories first", () => {
  const submissions = source("app/api/submissions/route.ts");
  assert.match(submissions, /fields\.slug = `\$\{slug\}-\$\{id\}`;/);
  assert.match(source("supabase/migrations/20260913120000_listing_sprint_3.sql"), /original\.slug \|\| '-republicado-'/);
  const detail = source("app/instrumentos/[slug]/page.tsx");
  const page = detail.slice(detail.indexOf("export default async function ListingDetailPage"));
  assert.ok(page.indexOf("getCategoryLandingBySlug(slug)") < page.indexOf("loadPublicListing(slug)"));
  const metadata = detail.slice(detail.indexOf("export async function generateMetadata"), detail.indexOf("export default async function ListingDetailPage"));
  assert.ok(metadata.indexOf("getCategoryLandingBySlug(slug)") < metadata.indexOf("loadPublicListing(slug)"));
  // One cached detail lookup is shared by metadata and page rendering.
  assert.match(detail, /const loadPublicListing = cache\(/);
  assert.match(detail, /const loadCategoryPage = cache\(/);
});

test("SEO-002..SEO-005: category pages use the shared catalog query, 24-item stable pages and URL-driven filters", () => {
  const catalog = source("lib/catalog.ts");
  assert.match(catalog, /\.eq\("status", "approved"\)/);
  assert.match(catalog, /\.order\("id"\)\s*\.range\(\(page - 1\) \* LISTINGS_PAGE_SIZE, page \* LISTINGS_PAGE_SIZE - 1\)/);
  assert.match(source("app/listados/page.tsx"), /fetchCatalogPage\(supabase, filters, page\)/);
  const detail = source("app/instrumentos/[slug]/page.tsx");
  assert.match(detail, /parseListingFilters\(\{ category \}\)[\s\S]*fetchCatalogPage\(supabase, filters, page\)/);
  assert.match(detail, /getPageRedirect\(page, result\.count, result\.error\)/);
  const landing = source("components/category-landing.tsx");
  assert.match(landing, /<ListingFilters filters=\{filters\} \/>/);
  assert.match(landing, /<Pagination page=\{page\} total=\{totalCount\} path=\{path\} \/>/);
  assert.match(landing, /<ListingCard key=\{listing\.id\} listing=\{listing\} \/>/);
  assert.match(landing, /<SearchTelemetry/);
  assert.doesNotMatch(landing, /placehold|lorem|Ejemplo/i);

  const guitars = categories.getCategoryLandingBySlug("guitarras");
  assert.equal(seo.categoryFilterRedirect(guitars, {}), null);
  assert.equal(seo.categoryFilterRedirect(guitars, { page: "3" }), null);
  assert.equal(seo.categoryFilterRedirect(guitars, { utm_source: "ig" }), null);
  assert.equal(seo.categoryFilterRedirect(guitars, { brand: "" }), null);
  assert.equal(seo.categoryFilterRedirect(guitars, { brand: "Fender", page: "2", utm_source: "ig" }), "/listados?category=guitars&brand=Fender");
  assert.equal(seo.categoryFilterRedirect(guitars, { category: "drums", pickups: ["hss", "sss"] }), "/listados?category=guitars&pickups=hss&pickups=sss");
});

test("SEO-006: category metadata is category-specific, canonical and indexable only with inventory", () => {
  const guitars = categories.getCategoryLandingBySlug("guitarras");
  const populated = seo.buildCategoryMetadata(guitars, 1, 12);
  assert.equal(populated.title, "Guitarras en venta en Perú");
  assert.equal(populated.alternates.canonical, "/instrumentos/guitarras");
  assert.equal(populated.robots, undefined);
  assert.equal(populated.openGraph.siteName, "Laria");
  assert.equal(seo.buildCategoryMetadata(guitars, 2, 40).alternates.canonical, "/instrumentos/guitarras?page=2");
  assert.deepEqual(seo.buildCategoryMetadata(guitars, 1, 0).robots, { index: false, follow: true });
  assert.deepEqual(seo.buildCategoryMetadata(guitars, 1, null).robots, { index: false, follow: true });
});

test("catalog metadata canonicalizes unfiltered pages and keeps filtered combinations out of the index", () => {
  assert.equal(seo.buildCatalogMetadata({}, 1).alternates.canonical, "/listados");
  assert.equal(seo.buildCatalogMetadata({ page: "2" }, 2).alternates.canonical, "/listados?page=2");
  assert.equal(seo.buildCatalogMetadata({ utm_source: "ig", brand: "" }, 1).alternates.canonical, "/listados");
  assert.equal(seo.buildCatalogMetadata({ category: "drums" }, 1).alternates.canonical, "/instrumentos/baterias");
  assert.deepEqual(seo.buildCatalogMetadata({ category: "drums", brand: "Pearl" }, 1).robots, { index: false, follow: true });
  assert.deepEqual(seo.buildCatalogMetadata({ sort: "price_asc" }, 1).robots, { index: false, follow: true });
});

const baseListing = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "approved",
  sold_at: null,
  store_id: null,
  owner_user_id: "22222222-2222-4222-8222-222222222222",
  title: "Fender Stratocaster 2019",
  slug: "fender-stratocaster-2019-11111111-1111-4111-8111-111111111111",
  description: "Guitarra en muy buen estado. </script><script>alert(1)</script>",
  category: "guitars",
  brand: "Fender",
  model: "Stratocaster",
  condition: "Usado - buen estado",
  price_pen: 3500,
  instrument_type: "electric_guitar",
  attributes: {},
  published_at: "2026-09-20T12:00:00Z",
  view_count: 4,
  city: "Lima",
  region: "Lima",
  seller_type: "individual",
  contact_name: "Ana Pérez",
  whatsapp_phone: "51999999999",
  created_at: "2026-09-20T12:00:00Z",
  profiles: { full_name: "Ana Pérez", phone: "51999999999", city: "Lima", region: "Lima", created_at: "2026-01-01T00:00:00Z" },
  stores: null,
  listing_photos: [{ id: "p", listing_id: "l", image_url: "https://cdn.example.test/foto.webp", alt_text: null, sort_order: 0 }],
};

test("listing metadata/structured data: canonical detail, sold history not indexed, individuals not named", () => {
  const approved = seo.buildListingMetadata(baseListing);
  assert.equal(approved.title, "Fender Stratocaster 2019");
  assert.equal(approved.alternates.canonical, `/instrumentos/${baseListing.slug}`);
  assert.equal(approved.robots, undefined);
  assert.match(approved.description, /S\/.*3.?500/);
  assert.ok(approved.description.length <= 158);
  assert.equal(approved.openGraph.images[0].url, "https://cdn.example.test/foto.webp");

  const sold = seo.buildListingMetadata({ ...baseListing, status: "sold" });
  assert.deepEqual(sold.robots, { index: false, follow: true });
  assert.match(sold.title, /vendido/);

  const jsonLd = seo.buildListingJsonLd(baseListing);
  assert.equal(jsonLd["@type"], "Product");
  assert.equal(jsonLd.offers.priceCurrency, "PEN");
  assert.equal(jsonLd.offers.availability, "https://schema.org/InStock");
  assert.equal(jsonLd.offers.itemCondition, "https://schema.org/UsedCondition");
  assert.equal(jsonLd.offers.seller, undefined);
  assert.doesNotMatch(JSON.stringify(jsonLd), /Ana Pérez|51999999999/);
  assert.equal(seo.buildListingJsonLd({ ...baseListing, status: "sold" }).offers.availability, "https://schema.org/SoldOut");
  const storeLd = seo.buildListingJsonLd({ ...baseListing, seller_type: "store", stores: { name: "Tienda QA", slug: "tienda-qa", status: "active", is_verified: true } });
  assert.deepEqual(storeLd.offers.seller, { "@type": "Organization", name: "Tienda QA" });
  assert.equal(seo.buildListingJsonLd({ ...baseListing, price_pen: null }).offers, undefined);

  const serialized = site.serializeJsonLd(jsonLd);
  assert.doesNotMatch(serialized, /<|>/);
  assert.deepEqual(JSON.parse(serialized), JSON.parse(JSON.stringify(jsonLd)));
});

test("store metadata is canonical and uses public store identity only", () => {
  const store = { name: "Tienda QA", slug: "tienda-qa", description: null, city: "Lima", district: "Miraflores", logo_url: null };
  const metadata = seo.buildStoreMetadata(store, 1);
  assert.equal(metadata.alternates.canonical, "/tiendas/tienda-qa");
  assert.match(metadata.title, /Tienda QA/);
  assert.match(metadata.description, /Miraflores, Lima/);
  assert.equal(seo.buildStoreMetadata(store, 3).alternates.canonical, "/tiendas/tienda-qa?page=3");
  const jsonLd = seo.buildStoreJsonLd(store);
  assert.equal(jsonLd["@type"], "Store");
  assert.equal(jsonLd.url, "https://laria.audio/tiendas/tienda-qa");
});

test("site URL defaults to laria.audio and preview deployments are never indexable", () => {
  withEnv({ NEXT_PUBLIC_SITE_URL: undefined }, () => assert.equal(site.getSiteUrl(), "https://laria.audio"));
  withEnv({ NEXT_PUBLIC_SITE_URL: "https://staging.example.test/" }, () => assert.equal(site.absoluteUrl("/listados"), "https://staging.example.test/listados"));
  withEnv({ NEXT_PUBLIC_SITE_URL: "not a url" }, () => assert.equal(site.getSiteUrl(), "https://laria.audio"));
  withEnv({ VERCEL_ENV: "production" }, () => assert.equal(site.isIndexableDeployment(), true));
  withEnv({ VERCEL_ENV: undefined }, () => assert.equal(site.isIndexableDeployment(), true));
  withEnv({ VERCEL_ENV: "preview" }, () => assert.equal(site.isIndexableDeployment(), false));
  assert.equal(site.truncateDescription("a ".repeat(200)).length <= 158, true);
});

test("robots.txt blocks private, account, Admin, API and auth routes and advertises the sitemap", () => {
  const robots = load("app/robots.ts").default;
  withEnv({ VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: undefined }, () => {
    const result = robots();
    for (const path of ["/mi-cuenta", "/admin", "/api/", "/login", "/logout", "/auth", "/vender", "/restablecer-contrasena", "/registro/vendedor", "/registro/tienda"]) assert.ok(result.rules.disallow.includes(path), path);
    for (const path of ["/registro/vendedor/invitacion", "/registro/tienda/invitacion"]) assert.ok(result.rules.disallow.some((rule) => path.startsWith(rule)), path);
    for (const path of ["/listados", "/instrumentos", "/tiendas", "/terminos"]) assert.equal(result.rules.disallow.some((rule) => path.startsWith(rule)), false, path);
    assert.equal(result.sitemap, "https://laria.audio/sitemap.xml");
  });
  withEnv({ VERCEL_ENV: "preview" }, () => assert.deepEqual(robots().rules, { userAgent: "*", disallow: "/" }));
});

function fakeSupabase({ counts, stores, listings: rows }) {
  const calls = [];
  return {
    calls,
    from(table) {
      const state = { table, filters: [], range: null, head: false };
      calls.push(state);
      const builder = {
        select(_columns, options) { state.head = Boolean(options?.head); return builder; },
        eq(column, value) { state.filters.push([column, value]); return builder; },
        order() { return builder; },
        range(from, to) { state.range = [from, to]; return builder; },
        then(resolve) {
          if (state.head) {
            const category = state.filters.find(([column]) => column === "category")?.[1];
            return resolve({ count: counts[category] ?? 0, error: null });
          }
          const all = table === "stores" ? stores : rows;
          return resolve({ data: all.slice(state.range[0], state.range[1] + 1), error: null });
        },
      };
      return builder;
    },
  };
}

test("sitemap lists public pages, non-empty categories and bounded public inventory only", async () => {
  const client = fakeSupabase({
    counts: { guitars: 3, drums: 0 },
    stores: [{ id: "s", slug: "tienda-qa", updated_at: "2026-09-01T00:00:00Z" }],
    listings: [{ id: "l", slug: "pedal-qa-l", updated_at: "2026-09-02T00:00:00Z" }],
  });
  const sitemap = load("app/sitemap.ts", { "@/lib/supabase/public-client": { getPublicSupabaseClient: () => client } }).default;
  const urls = await withEnv({ VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: undefined }, async () => (await sitemap()).map((entry) => entry.url));
  for (const expected of ["/", "/listados", "/terminos", "/privacidad", "/articulos-prohibidos", "/consejos-de-seguridad", "/instrumentos/guitarras", "/tiendas/tienda-qa", "/instrumentos/pedal-qa-l"]) {
    assert.ok(urls.includes(`https://laria.audio${expected}`), expected);
  }
  assert.equal(urls.includes("https://laria.audio/instrumentos/baterias"), false);
  assert.equal(urls.some((url) => /mi-cuenta|admin|login|api/.test(url)), false);
  for (const call of client.calls) {
    if (call.table === "listings") assert.ok(call.filters.some(([column, value]) => column === "status" && value === "approved"));
    if (call.table === "stores") assert.ok(call.filters.some(([column, value]) => column === "status" && value === "active"));
    if (call.range) assert.ok(call.range[1] - call.range[0] < 1000);
  }
  const preview = await withEnv({ VERCEL_ENV: "preview" }, () => sitemap());
  assert.deepEqual(preview, []);
});

test("private account/Admin/auth surfaces are noindex by metadata and X-Robots-Tag", () => {
  for (const file of ["app/mi-cuenta/layout.tsx", "app/admin/layout.tsx", "app/login/page.tsx", "app/recuperar-contrasena/page.tsx", "app/restablecer-contrasena/page.tsx", "app/confirmacion-correo/page.tsx", "app/vender/page.tsx", "app/registrar-tienda/page.tsx", "app/registro/vendedor/invitacion/page.tsx", "app/registro/tienda/invitacion/page.tsx", "app/registro/vendedor/page.tsx", "app/registro/tienda/page.tsx", "app/not-found.tsx"]) {
    assert.match(source(file), /robots: NOINDEX_ROBOTS/, file);
  }
  const config = source("next.config.ts");
  assert.match(config, /NON_INDEXABLE_PATH_PREFIXES\.flatMap/);
  assert.match(config, /X-Robots-Tag", value: "noindex, nofollow"/);
  for (const prefix of ["/mi-cuenta", "/admin", "/api", "/auth", "/login"]) assert.ok(site.NON_INDEXABLE_PATH_PREFIXES.includes(prefix), prefix);
  const layout = source("app/layout.tsx");
  assert.match(layout, /metadataBase: new URL\(getSiteUrl\(\)\)/);
  assert.match(layout, /isIndexableDeployment\(\)/);
  assert.doesNotMatch(layout, /Instrumentos Perú|instrumentos-peru/);
});

const legalRoutes = [
  ["app/terminos/page.tsx", "Términos y reglas del marketplace"],
  ["app/privacidad/page.tsx", "Política de privacidad"],
  ["app/articulos-prohibidos/page.tsx", "Artículos prohibidos y restringidos"],
  ["app/consejos-de-seguridad/page.tsx", "Consejos de seguridad para comprar y vender"],
];

function renderLegal(file) {
  const mocks = { "next/link": linkMock };
  const page = load(file, mocks);
  return { html: renderToStaticMarkup(React.createElement(page.default)), metadata: page.metadata };
}

test("LEGAL-001..LEGAL-004: dedicated Terms, Privacy, prohibited-items and safety pages render with canonical metadata", () => {
  for (const [file, heading] of legalRoutes) {
    const { html, metadata } = renderLegal(file);
    const route = `/${path.basename(path.dirname(file))}`;
    assert.match(html, new RegExp(`<h1[^>]*>${heading}</h1>`), file);
    assert.equal(metadata.alternates.canonical, route);
    assert.match(html, new RegExp(`href="${route}" aria-current="page"`));
    assert.match(html, /Última actualización/);
    assert.equal(metadata.robots, undefined);
  }
  const privacy = renderLegal("app/privacidad/page.tsx").html;
  assert.match(privacy, /Ley N\.° 29733/);
  assert.match(privacy, /contenido de tus conversaciones de WhatsApp/);
  assert.match(privacy, /fingerprinting/);
  const prohibited = renderLegal("app/articulos-prohibidos/page.tsx").html;
  assert.match(prohibited, /robados/);
  assert.match(prohibited, /Falsificaciones/);
});

test("LEGAL-005/LEGAL-006: safety and trust copy states the limitations and never promises guarantees", () => {
  for (const file of ["app/terminos/page.tsx", "app/consejos-de-seguridad/page.tsx"]) {
    const { html } = renderLegal(file);
    assert.match(html, /no procesa pagos/);
    assert.match(html, /escrow/);
    assert.match(html, /no gestiona envíos ni entregas/);
    assert.match(html, /no garantiza la autenticidad/);
    assert.match(html, /no garantiza que una transacción se concrete/);
  }
  const trustSurfaces = [
    "components/legal-page.tsx", "components/site-footer.tsx", "components/category-landing.tsx", "components_v0/trust-section.tsx",
    "components/sell-listing-form.tsx", "components/seller-signup-form.tsx", "app/instrumentos/[slug]/page.tsx", "app/tiendas/[slug]/page.tsx",
    "components/reputation-summary.tsx", ...legalRoutes.map(([file]) => file),
  ];
  const forbidden = /(garantizamos|te garantiza|compra (protegida|segura) con laria|pago (protegido|seguro) (en|con) laria|protección al comprador|devolución garantizada|autenticidad garantizada|envío gratis)/i;
  for (const file of trustSurfaces) assert.doesNotMatch(source(file), forbidden, file);
  // UX-2: the full footer (home) keeps the whole limitation next to "no cobra comisiones"; the slim footer states
  // commissions and payments on every other page (docs/ux-redesign/ux-2-shell.md).
  assert.match(source("components/site-footer.tsx"), /Laria no cobra comisiones, no procesa pagos, no\s+retiene dinero, no gestiona envíos ni garantiza el equipo ni las transacciones/);
  assert.match(source("components/site-footer.tsx"), /No cobramos comisiones ni procesamos pagos\./);
  assert.match(source("app/instrumentos/[slug]/page.tsx"), /href="\/consejos-de-seguridad"/);
});

test("public footer, forms and navigation link to legal/safety pages and category landings", () => {
  const { SiteFooter } = load("components/site-footer.tsx", { "next/link": linkMock });
  // UX-2 (N5): the full footer on the home, the slim footer on every other public and account page.
  const footer = renderToStaticMarkup(React.createElement(SiteFooter, { variant: "full" }));
  for (const href of ["/terminos", "/privacidad", "/articulos-prohibidos", "/consejos-de-seguridad", "/listados", "/registrar-tienda", "/instrumentos/guitarras"]) assert.match(footer, new RegExp(`href="${href}"`), href);
  const slim = renderToStaticMarkup(React.createElement(SiteFooter, { variant: "slim" }));
  for (const href of ["/terminos", "/privacidad", "/consejos-de-seguridad"]) assert.match(slim, new RegExp(`href="${href}"`), href);
  assert.match(slim, /No cobramos comisiones ni procesamos pagos\./);
  assert.match(source("components/sell-listing-form.tsx"), /href="\/terminos"[\s\S]*href="\/articulos-prohibidos"/);
  assert.match(source("components/seller-signup-form.tsx"), /href="\/terminos"[\s\S]*href="\/privacidad"/);
  assert.match(source("components/store-owner-signup-form.tsx"), /href="\/terminos"[\s\S]*href="\/privacidad"/);
  assert.match(source("components/global-categories.tsx"), /stripItems/);
  assert.match(source("lib/shell.ts"), /href: categoryLandingPath\(category\.value\)/);
  assert.match(source("components_v0/categories-section.tsx"), /href=\{categoryLandingPath\(category\.value\)\}/);
  assert.doesNotMatch(source("components_v0/hero-section.tsx"), /\/listados\?category=/);
  assert.match(source("app/instrumentos/[slug]/page.tsx"), /<Breadcrumbs items=\{listingBreadcrumbs\(listing, displayTitle\)\} phoneBackLink \/>/);
  assert.match(source("lib/shell.ts"), /href: categoryLandingPath\(listing\.category\)|const categoryHref = categoryLandingPath\(listing\.category\)/);
  assert.doesNotMatch(source("lib/listings.ts"), /Instrumentos Perú/);
});

test("account navigation follows the frozen IA on desktop and mobile with precise active states", () => {
  const navigation = load("lib/account-navigation.ts");
  const particular = navigation.getAccountNavigationItems("seller", false);
  assert.deepEqual(particular.map((item) => item.label), ["Resumen", "Mis publicaciones", "Publicar", "Favoritos", "Alertas", "Notificaciones", "Compras y ventas", "Perfil y seguridad"]);
  const store = navigation.getAccountNavigationItems("store_owner", true);
  assert.deepEqual(store.map((item) => item.label), ["Resumen", "Mi tienda", "Inventario", "Publicar", "Estadísticas", "Favoritos", "Alertas", "Notificaciones", "Compras y ventas", "Perfil y seguridad"]);
  for (const items of [particular, store, navigation.getAccountNavigationItems("store_owner", false)]) {
    const hrefs = items.map((item) => item.href);
    assert.equal(new Set(hrefs).size, hrefs.length);
    for (const pathname of ["/mi-cuenta", "/mi-cuenta/perfil", "/mi-cuenta/seguridad", "/mi-cuenta/favoritos", "/mi-cuenta/transacciones/abc"]) {
      assert.equal(items.filter((item) => navigation.accountItemIsActive(pathname, item)).length, 1, pathname);
    }
  }
  const settings = particular.at(-1);
  assert.equal(settings.href, "/mi-cuenta/perfil");
  assert.equal(navigation.accountItemIsActive("/mi-cuenta/seguridad", settings), true);
  assert.equal(navigation.accountItemIsActive("/mi-cuenta/seguridadx", settings), false);
  for (const [file, current] of [["app/mi-cuenta/perfil/page.tsx", "/mi-cuenta/perfil"], ["app/mi-cuenta/seguridad/page.tsx", "/mi-cuenta/seguridad"]]) {
    assert.match(source(file), new RegExp(`<AccountSettingsTabs current="${current}" />`));
  }
  const { AccountSettingsTabs } = load("components/account-settings-tabs.tsx", { "next/link": linkMock });
  const tabs = renderToStaticMarkup(React.createElement(AccountSettingsTabs, { current: "/mi-cuenta/seguridad" }));
  assert.match(tabs, /href="\/mi-cuenta\/seguridad" aria-current="page"/);
  assert.match(tabs, /href="\/mi-cuenta\/perfil"/);
});

test("signup routes are noindex via metadata, X-Robots-Tag and robots.txt without touching public routes", async () => {
  for (const file of ["app/registro/vendedor/page.tsx", "app/registro/tienda/page.tsx"]) {
    const { metadata } = load(file, { "next/link": linkMock, "@/components/seller-signup-form": { SellerSignupForm: () => null }, "@/components/store-owner-signup-form": { StoreOwnerSignupForm: () => null } });
    assert.deepEqual(metadata.robots, { index: false, follow: false }, file);
  }
  const config = load("next.config.ts").default;
  const headerSources = (entries) => entries.filter((entry) => entry.headers.some((header) => header.key === "X-Robots-Tag" && header.value === "noindex, nofollow")).map((entry) => entry.source);
  const production = await withEnv({ VERCEL_ENV: "production" }, () => config.headers());
  const sources = headerSources(production);
  for (const source of ["/registro/vendedor", "/registro/vendedor/:path*", "/registro/tienda", "/registro/tienda/:path*", "/mi-cuenta/:path*", "/admin/:path*"]) assert.ok(sources.includes(source), source);
  assert.equal(sources.includes("/:path*"), false);
  for (const source of sources) assert.doesNotMatch(source, /^\/(instrumentos|listados|tiendas|terminos|privacidad|articulos-prohibidos|consejos-de-seguridad)?(\/|$)/, source);
  const preview = await withEnv({ VERCEL_ENV: "preview" }, () => config.headers());
  assert.ok(headerSources(preview).includes("/:path*"));
  const robots = load("app/robots.ts").default;
  withEnv({ VERCEL_ENV: "preview" }, () => assert.deepEqual(robots().rules, { userAgent: "*", disallow: "/" }));
});

test("filtered category metadata skips the inventory query that the redirect would discard", () => {
  const detail = source("app/instrumentos/[slug]/page.tsx");
  const metadata = detail.slice(detail.indexOf("export async function generateMetadata"), detail.indexOf("export default async function ListingDetailPage"));
  assert.ok(metadata.indexOf("categoryFilterRedirect(landing, resolvedSearchParams)") < metadata.indexOf("loadCategoryPage("));
});
