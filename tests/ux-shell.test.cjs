// UX-2 shell and navigation (docs/ux-redesign/ux-2-shell.md): the frame per route, the header, the category strip,
// the account menu, breadcrumbs, footers, 404/500, the logo file and the text-wrap rule.
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
const imageMock = { __esModule: true, default: (props) => React.createElement("img", { ...without(props, "priority"), src: props.src.src ?? props.src }) };
const navigationMock = (pathname, search = "") => ({ usePathname: () => pathname, useSearchParams: () => new URLSearchParams(search), useRouter: () => ({}) });
const shell = load("lib/shell.ts");

const SIGNED_OUT = { authenticated: false, storeOwner: false, hasStore: false, admin: false, name: null, unreadNotifications: 0, pendingBuyerConfirmations: 0, ready: true, settled: true };

function renderHeader(pathname, account = {}) {
  const state = { ...SIGNED_OUT, ...account };
  const { SiteHeader } = load("components/site-header.tsx", {
    "next/link": linkMock,
    "next/image": imageMock,
    "next/navigation": navigationMock(pathname),
    "@/components/marketplace-account-provider": { useMarketplaceAccount: () => state },
  });
  return renderToStaticMarkup(React.createElement(SiteHeader, { layout: shell.getShellLayout(pathname) }));
}

test("each route gets its frame: header, strip, phone search and footer (N3–N5)", () => {
  const expectations = {
    "/": { header: "standard", strip: "none", phoneSearch: "row", footer: "full" },
    "/listados": { header: "standard", strip: "all", phoneSearch: "row", footer: "slim" },
    "/instrumentos/baterias": { header: "standard", strip: "all", phoneSearch: "row", footer: "slim" },
    "/tiendas/casa-musical-grau": { header: "standard", strip: "all", phoneSearch: "row", footer: "slim" },
    "/instrumentos/bateria-pearl-roadshow-0b6f4a1e-6a3d-4c43-9d49-1d3f64f9c2aa": { header: "standard", strip: "wide", phoneSearch: "toggle", footer: "slim" },
    "/terminos": { header: "standard", strip: "wide", phoneSearch: "none", footer: "slim" },
    "/login": { header: "standard", strip: "wide", phoneSearch: "none", footer: "slim" },
    "/pagina-que-no-existe": { header: "standard", strip: "wide", phoneSearch: "none", footer: "slim" },
    "/mi-cuenta": { header: "standard", strip: "none", phoneSearch: "none", footer: "slim" },
    "/mi-cuenta/favoritos": { header: "standard", strip: "none", phoneSearch: "none", footer: "slim" },
    "/mi-cuenta/publicar": { header: "publishing", strip: "none", phoneSearch: "none", footer: "slim" },
    "/mi-cuenta/tienda/publicar": { header: "publishing", strip: "none", phoneSearch: "none", footer: "slim" },
    "/admin": { header: "none", strip: "none", phoneSearch: "none", footer: "none" },
    "/admin/tiendas": { header: "none", strip: "none", phoneSearch: "none", footer: "none" },
  };
  for (const [pathname, expected] of Object.entries(expectations)) assert.deepEqual(shell.getShellLayout(pathname), expected, pathname);
  // Admin owns its <main>; everywhere else the shell renders the only one.
  assert.match(source("components/site-shell.tsx"), /if \(layout\.header === "none"\) return <>\{children\}<\/>;/);
  assert.match(source("components/site-shell.tsx"), /<main id="contenido" tabIndex=\{-1\}/);
  assert.match(source("app/admin/layout.tsx"), /<main id="contenido" tabIndex=\{-1\}/);
  assert.doesNotMatch(source("app/layout.tsx"), /\n\s*<main id=/);
});

test("nothing in the shell is sticky (N3) and there is no bottom bar (N4)", () => {
  for (const file of ["components/site-shell.tsx", "components/site-header.tsx", "components/global-categories.tsx", "components/account-navigation.tsx", "components/admin-navigation.tsx", "components/site-footer.tsx"]) {
    assert.doesNotMatch(source(file), /\b(sticky|fixed)\b/, file);
  }
});

test("the category strip lists Instrumentos, the categories in taxonomy order and Tiendas verificadas (G1, N7)", () => {
  assert.deepEqual(shell.stripItems.map((item) => item.label), [
    "Instrumentos", "Guitarras", "Bajos", "Baterías", "Platillos", "Micrófonos", "Pedales", "Amplificadores", "Interfaces de audio", "Tiendas verificadas",
  ]);
  assert.equal(shell.stripItems[0].href, "/listados");
  assert.equal(shell.stripItems.at(-1).href, "/listados?seller_type=verified_store");
  const current = (pathname, search = "") => shell.currentStripKey(pathname, new URLSearchParams(search));
  assert.equal(current("/listados"), "catalog");
  assert.equal(current("/listados", "brand=Yamaha"), "catalog");
  assert.equal(current("/listados", "category=drums&instrument_type=drums"), "drums");
  assert.equal(current("/listados", "seller_type=verified_store"), "verified_stores");
  assert.equal(current("/instrumentos/baterias"), "drums");
  assert.equal(current("/instrumentos/bateria-pearl-0b6f4a1e"), null);
  assert.equal(current("/terminos"), null);

  const { GlobalCategories } = load("components/global-categories.tsx", { "next/link": linkMock, "next/navigation": navigationMock("/instrumentos/baterias") });
  const html = renderToStaticMarkup(React.createElement(GlobalCategories, { visibility: "all" }));
  assert.match(html, /<nav aria-label="Categorías"/);
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  assert.match(html, /href="\/instrumentos\/baterias" aria-current="page"[^>]*shadow-\[inset_0_-3px_0_var\(--accent\)\]/);
  assert.match(renderToStaticMarkup(React.createElement(GlobalCategories, { visibility: "wide" })), /hidden md:block/);
});

test("header: outline Vender, honest brand search, no Para tiendas, Ingresar when signed out (N1, N8)", () => {
  const html = renderHeader("/listados");
  assert.match(html, /<header class="surface-frame bg-frame/);
  const vender = html.match(/<a href="\/vender" class="([^"]*)"/)[1];
  assert.match(vender, /\bh-9\b/);
  assert.match(vender, /border border-white\/40 bg-transparent text-surface/);
  assert.doesNotMatch(html, /bg-action/);
  assert.doesNotMatch(html, /Para tiendas|Crear cuenta|Listados/);
  assert.match(html, /href="\/login"[^>]*>.*Ingresar/);
  assert.match(html, /aria-label="Laria inicio"/);
  // Brand search with the placeholder that says so: inline from 768 px, and a row under the bar on phones that
  // comes after the bar's actions in the markup, so Tab follows the visual order at both sizes.
  assert.equal((html.match(/role="search"/g) ?? []).length, 2);
  for (const id of ["global-marketplace-search", "busqueda-movil-campo"]) {
    const input = html.match(new RegExp(`<input id="${id}"[^>]*>`))[0];
    assert.match(input, /name="brand"/);
    assert.match(input, /placeholder="Busca por marca: Yamaha, Fender…"/);
  }
  assert.match(html, /<div class="col-start-2 row-start-1 ml-7 hidden max-w-\[680px\] md:block">/);
  assert.ok(html.indexOf('href="/login"') < html.indexOf('id="busqueda-movil"'));
  assert.equal((renderHeader("/terminos").match(/role="search"/g) ?? []).length, 1);
  // Before the first account check settles, the entry keeps its place but shows no state.
  const pending = renderHeader("/listados", { settled: false });
  assert.match(pending, /<span aria-hidden="true" class="invisible flex">/);
  assert.match(pending, /<noscript>/);
});

test("header: bell, avatar and an account menu with the rail's sections, counts, Admin and Cerrar sesión", () => {
  const html = renderHeader("/listados", { authenticated: true, name: "Diego Martínez", unreadNotifications: 3, pendingBuyerConfirmations: 1, admin: true });
  assert.match(html, /href="\/mi-cuenta\/notificaciones" aria-label="Notificaciones: 3 sin leer"/);
  assert.match(html, /aria-expanded="false" aria-controls="menu-cuenta"/);
  assert.match(html, />DM</);
  assert.match(html, /Mi cuenta/);
  const menu = html.slice(html.indexOf('id="menu-cuenta"'));
  assert.match(menu, /^id="menu-cuenta" hidden=""/);
  const labels = [...menu.matchAll(/<a href="([^"]+)"[^>]*><span[^>]*>([^<]+)<\/span>/g)].map((match) => match[2]);
  assert.deepEqual(labels, ["Resumen", "Mis publicaciones", "Publicar", "Favoritos", "Alertas", "Notificaciones", "Compras y ventas", "Perfil y seguridad"]);
  assert.match(menu, /3 notificaciones sin leer/);
  assert.match(menu, /1 compras requieren tu confirmación/);
  assert.match(menu, /href="\/admin"[^>]*>Admin</);
  assert.match(menu, /<form action="\/logout" method="post"><button type="submit"[^>]*>Cerrar sesión/);
  assert.doesNotMatch(renderHeader("/listados", { authenticated: true }), /href="\/admin"/);
  // Store owners keep their labels on the sell entry.
  assert.match(renderHeader("/listados", { authenticated: true, storeOwner: true, hasStore: true }), /href="\/mi-cuenta\/tienda\/publicar"[^>]*>Publicar</);
});

test("header per template: search icon on listings, logo and account only while publishing", () => {
  const listing = renderHeader("/instrumentos/bateria-pearl-0b6f4a1e");
  assert.match(listing, /aria-expanded="false" aria-controls="busqueda-movil" aria-label="Buscar"/);
  assert.match(listing, /id="busqueda-movil" class="col-span-3 row-start-2 pb-3 md:hidden hidden"/);
  const browse = renderHeader("/listados");
  assert.doesNotMatch(browse, /aria-controls="busqueda-movil"/);
  assert.match(browse, /id="busqueda-movil" class="col-span-3 row-start-2 pb-3 md:hidden"/);
  const publishing = renderHeader("/mi-cuenta/publicar", { authenticated: true });
  assert.match(publishing, /href="\/mi-cuenta\/publicar" class="[^"]*hidden md:inline-flex/);
  assert.match(publishing, /href="\/mi-cuenta\/notificaciones"[^>]*class="[^"]*hidden md:inline-flex/);
  assert.match(publishing, /aria-controls="menu-cuenta"/);
});

test("header state endpoint returns the rail's counts, the admin check and the name, degrading to none (N6)", () => {
  const route = source("app/api/account-navigation/route.ts");
  for (const field of ["admin:", "name:", "unreadNotifications:", "pendingBuyerConfirmations:"]) assert.match(route, new RegExp(field));
  assert.match(route, /client\.rpc\("is_admin"\)/);
  assert.match(route, /\.from\("notifications"\)\.select\("id", \{ count: "exact", head: true \}\)\.is\("read_at", null\)/);
  assert.match(route, /client\.rpc\("get_pending_buyer_confirmation_count"\)/);
  assert.match(route, /admin: !adminResult\.error && adminResult\.data === true/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
});

test("breadcrumbs: full trail from 768 px with the current page unlinked; a back link to the parent on phones", () => {
  const { Breadcrumbs } = load("components/breadcrumbs.tsx", { "next/link": linkMock });
  const items = shell.listingBreadcrumbs({ category: "guitars", instrument_type: "electric_guitar" }, "Fender Stratocaster");
  assert.deepEqual(items.map((item) => item.label), ["Inicio", "Instrumentos", "Guitarras", "Guitarras eléctricas", "Fender Stratocaster"]);
  const html = renderToStaticMarkup(React.createElement(Breadcrumbs, { items }));
  assert.match(html, /<nav aria-label="Ruta de navegación"/);
  assert.match(html, /<ol class="hidden [^"]*md:flex">/);
  assert.match(html, /<span aria-current="page" class="[^"]*text-ink">Fender Stratocaster<\/span>/);
  assert.doesNotMatch(html, /<a [^>]*>Fender Stratocaster/);
  assert.match(html, /href="\/listados"[^>]*decoration-line-deco[^>]*>Instrumentos</);
  assert.match(html, /<a href="\/listados\?category=guitars&amp;instrument_type=electric_guitar" class="[^"]*md:hidden">.*Volver a <\/span>Guitarras eléctricas/);
  // Structured data keeps its shape; only the catalog's name changes (G1).
  assert.match(source("components/category-landing.tsx"), /position: 2, name: "Instrumentos", item: absoluteUrl\("\/listados"\)/);
});

test("footers: full on the home with four columns, slim everywhere else (N5)", () => {
  const { SiteFooter } = load("components/site-footer.tsx", { "next/link": linkMock, "next/image": imageMock });
  const full = renderToStaticMarkup(React.createElement(SiteFooter, { variant: "full" }));
  for (const heading of ["Explora", "Vende", "Ayuda y legal"]) assert.match(full, new RegExp(`<nav aria-label="${heading}" class="hidden md:block"><p class="t-micro`));
  assert.match(full, /class="block object-cover h-6 w-\[45px\] md:h-7 md:w-\[53px\]"/);
  assert.match(full, /© 2026 Laria/);
  assert.match(full, /Hecho en Perú/);
  assert.match(full, /href="\/listados"[^>]*>Instrumentos</);
  assert.match(full, /href="\/listados\?seller_type=verified_store"[^>]*>Tiendas verificadas</);
  // Only pages that exist.
  for (const href of full.matchAll(/href="([^"]+)"/g)) assert.doesNotMatch(href[1], /como-funciona|consejos-para-vender/);
  const slim = renderToStaticMarkup(React.createElement(SiteFooter, { variant: "slim" }));
  assert.match(slim, /© 2026 Laria · No cobramos comisiones ni procesamos pagos\./);
  assert.deepEqual([...slim.matchAll(/<a href="([^"]+)"/g)].map((match) => match[1]), ["/consejos-de-seguridad", "/terminos", "/privacidad"]);
});

test("404 and 500 share one body: title, one line, the search and two links", () => {
  const mocks = { "next/link": linkMock, "next/navigation": navigationMock("/x") };
  const notFound = renderToStaticMarkup(React.createElement(load("app/not-found.tsx", mocks).default));
  assert.match(notFound, /<h1 class="t-page text-ink">No encontramos esta página<\/h1>/);
  assert.match(notFound, /Puede que la dirección esté mal o que la publicación ya no esté disponible\./);
  assert.match(notFound, /max-w-\[560px\]/);
  assert.match(notFound, /role="search"[\s\S]*id="busqueda-no-encontrada"/);
  assert.match(notFound, /href="\/"[^>]*>Ir al inicio<[\s\S]*href="\/listados"[^>]*>Ver instrumentos</);
  assert.doesNotMatch(notFound, /<img|<svg(?![^>]*aria-hidden)/);
  const { SERVER_ERROR_COPY } = load("components/error-page.tsx", mocks);
  assert.deepEqual(SERVER_ERROR_COPY, { title: "Algo salió mal", message: "Vuelve a intentarlo en unos minutos." });
  for (const file of ["app/error.tsx", "app/admin/error.tsx"]) {
    assert.match(source(file), /^"use client";/, file);
    assert.match(source(file), /<ErrorPage \{\.\.\.SERVER_ERROR_COPY\}/, file);
  }
});

test("404 and 500 always have exactly one <main>, inside Admin too", () => {
  // Unknown nested Admin routes call notFound inside the Admin layout, which owns the frame and <main>.
  assert.match(source("app/admin/[section]/[...rest]/page.tsx"), /notFound\(\)/);
  assert.match(source("app/admin/layout.tsx"), /<AdminNavigation/);
  for (const file of ["app/admin/not-found.tsx", "app/admin/error.tsx"]) assert.doesNotMatch(source(file), /<FallbackMain>|<main id=/, file);
  // A failure in the Admin layout itself can still reach the root boundary; its fallback supplies one <main>.
  for (const file of ["app/not-found.tsx", "app/error.tsx"]) assert.match(source(file), /<FallbackMain>/, file);
  const render = (pathname) => {
    const { default: NotFound } = load("app/not-found.tsx", { "next/link": linkMock, "next/navigation": navigationMock(pathname) });
    return renderToStaticMarkup(React.createElement(NotFound));
  };
  assert.equal((render("/admin/no-existe/de-verdad").match(/<main id="contenido"/g) ?? []).length, 1);
  for (const pathname of ["/pagina-que-no-existe", "/mi-cuenta/no-existe", "/instrumentos/x"]) assert.doesNotMatch(render(pathname), /<main/, pathname);
});

test("the logo file has no stray hairline and the header and footer use the decided sizes (N2, audit items 1 and 1b)", () => {
  for (const file of ["app/logo-clear.svg", "app/icon.svg"]) assert.doesNotMatch(source(file), /M 0\.00 830\.00/, file);
  assert.match(source("app/logo-clear.svg"), /viewBox="0 0 1400 980"/);
  const logo = source("components/brand-logo.tsx");
  assert.match(logo, /header: "h-8 w-\[61px\] md:h-9 md:w-\[68px\]"/);
  assert.match(logo, /footer: "h-6 w-\[45px\] md:h-7 md:w-\[53px\]"/);
  assert.match(logo, /admin: "h-7 w-\[53px\]"/);
});

test("headings and leads balance, paragraphs avoid widows (audit item 14)", () => {
  const css = source("app/globals.css");
  assert.match(css, /h1,\s*h2,\s*h3,\s*h4,\s*\.t-page,\s*\.t-section,\s*\.t-display,\s*\.text-lead \{\s*text-wrap: balance;/);
  assert.match(css, /p,\s*li,\s*dd,\s*figcaption \{\s*text-wrap: pretty;/);
  assert.match(source("components/ui/page-header.tsx"), /text-lead t-meta/);
});
