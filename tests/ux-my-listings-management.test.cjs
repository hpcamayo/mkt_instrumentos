// Effortless Laria, batch "my-listings" (docs/ux-effortless/my-listings.md): Mis publicaciones that scales (mine-04),
// undo instead of confirm (mine-13), "Ya lo vendí" from any state (mine-07), drafts from a listing (mine-10, shop-08),
// the private preview (mine-06) and the vacation-mode line (mine-12).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(source, mocks = {}) {
  const filename = path.resolve(source);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  const original = mod.require.bind(mod);
  mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
  return mod.exports;
}

const source = (file) => fs.readFileSync(file, "utf8");
const Link = ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children);
const Img = ({ src, alt, className }) => React.createElement("img", { src, alt, className });
const lib = load("lib/my-listings.ts");
const tableMocks = {
  "next/link": { __esModule: true, default: Link },
  "next/image": { __esModule: true, default: Img },
  "next/navigation": { useRouter: () => ({ refresh() {}, push() {} }) },
};
const { ListingManagementTable } = load("components/listing-management-table.tsx", tableMocks);

const base = { title: "Guitarra", slug: "guitarra", price_pen: 900, created_at: "2026-09-01T12:00:00Z", published_at: null, sold_at: null, rejection_reason: null, hidden_source: null, hidden_reason: null, revisionStatus: null, revisionReason: null };
const row = (id, overrides = {}) => ({ ...base, id, status: "approved", ...overrides });
const render = (listings, props = {}) => renderToStaticMarkup(React.createElement(ListingManagementTable, { listings, emptyMessage: "Vacío", ...props }));
// One row's markup: the table body splits on "<tr", after the header row.
const rows = (html) => html.split("<tr").slice(2);

test("status tabs: each listing lands in its tabs and the counts follow the search", () => {
  const listings = [
    row("a"),
    row("b", { revisionStatus: "pending" }),
    row("c", { revisionStatus: "rejected" }),
    row("d", { status: "pending" }),
    row("e", { status: "rejected" }),
    row("f", { status: "hidden", hidden_source: "admin" }),
    row("g", { status: "hidden", hidden_source: "owner" }),
    row("h", { status: "draft", title: "Batería Pearl" }),
    row("i", { status: "sold" }),
    row("j", { status: "archived" }),
  ];
  assert.deepEqual(lib.MY_LISTINGS_VIEWS.map((view) => view.label), ["Todas", "Requieren acción", "Activas", "En revisión", "Ocultas", "Borradores", "Vendidas"]);
  assert.deepEqual(lib.countListingViews(listings), { todas: 10, accion: 3, activas: 3, revision: 2, ocultas: 1, borradores: 1, vendidas: 2 });
  assert.deepEqual(lib.listingViews(listings[1]), ["todas", "activas", "revision"]);
  assert.deepEqual(lib.listingViews(listings[5]), ["todas", "accion"]);
  const searched = lib.selectMyListingsPage(listings, { vista: "todas", q: "bateria", orden: "recientes", pagina: 1 });
  assert.deepEqual(searched.items.map((item) => item.id), ["h"]);
  assert.equal(searched.counts.borradores, 1);
  assert.equal(searched.counts.activas, 0);
  const action = lib.selectMyListingsPage(listings, { vista: "accion", q: "", orden: "recientes", pagina: 1 });
  assert.deepEqual(action.items.map((item) => item.id).sort(), ["c", "e", "f"]);
});

test("search, order and page parsing fall back to safe defaults", () => {
  assert.deepEqual(lib.parseMyListingsQuery({}), { vista: "todas", q: "", orden: "recientes", pagina: 1 });
  assert.deepEqual(lib.parseMyListingsQuery({ vista: "accion", q: "  Fender   Strat ", orden: "vistas", pagina: "3" }), { vista: "accion", q: "Fender Strat", orden: "vistas", pagina: 3 });
  for (const pagina of ["0", "-1", "2.5", "abc", "999999"]) assert.equal(lib.parseMyListingsQuery({ pagina }).pagina, 1, pagina);
  assert.equal(lib.parseMyListingsQuery({ vista: "otra", orden: "precio' OR 1=1" }).vista, "todas");
  assert.equal(lib.parseMyListingsQuery({ orden: ["contactos", "vistas"] }).orden, "contactos");
  assert.equal(lib.parseMyListingsQuery({ q: "x".repeat(200) }).q.length, 80);
  assert.equal(lib.myListingsHref("/mi-cuenta/publicaciones", { vista: "todas", q: "", orden: "recientes", pagina: 1 }), "/mi-cuenta/publicaciones");
  assert.equal(lib.myListingsHref("/mi-cuenta/publicaciones", { vista: "ocultas", q: "amp", orden: "precio", pagina: 2 }), "/mi-cuenta/publicaciones?vista=ocultas&q=amp&orden=precio&pagina=2");
  assert.ok(lib.matchesTitle("Batería acústica Pearl", "BATERIA pearl"));
  assert.ok(!lib.matchesTitle("Batería acústica Pearl", "yamaha"));
});

test("sort orders and pages of 50", () => {
  const listings = [
    row("old", { created_at: "2026-01-01T00:00:00Z", price_pen: 50, analytics: { views: 9, contacts: 1, favorites: 0 } }),
    row("new", { created_at: "2026-05-01T00:00:00Z", price_pen: null, analytics: { views: 2, contacts: 5, favorites: 0 } }),
    row("mid", { created_at: "2026-03-01T00:00:00Z", price_pen: 10 }),
  ];
  const ids = (orden) => lib.sortListings(listings, orden).map((item) => item.id);
  assert.deepEqual(ids("recientes"), ["new", "mid", "old"]);
  assert.deepEqual(ids("vistas"), ["old", "new", "mid"]);
  assert.deepEqual(ids("contactos"), ["new", "old", "mid"]);
  assert.deepEqual(ids("precio"), ["mid", "old", "new"]);
  const many = Array.from({ length: 120 }, (_, index) => row(`l${index}`, { created_at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString() }));
  const third = lib.selectMyListingsPage(many, { vista: "todas", q: "", orden: "recientes", pagina: 3 });
  assert.equal(lib.MY_LISTINGS_PAGE_SIZE, 50);
  assert.deepEqual([third.page, third.pageCount, third.from, third.to, third.items.length], [3, 3, 101, 120, 20]);
  assert.equal(lib.selectMyListingsPage(many, { vista: "todas", q: "", orden: "recientes", pagina: 9 }).page, 3, "a page past the end shows the last one");
});

test("the page wires tabs, a GET search form, the order select and the shared loaders", () => {
  const page = source("app/mi-cuenta/publicaciones/page.tsx");
  assert.match(page, /<form action=\{BASE\} method="get"/);
  assert.match(page, /name="q"/);
  assert.match(page, /name="orden"/);
  assert.match(page, /<ChipLink /);
  assert.match(page, /\{view\.label\} · \{counts\[view\.key\]\}/);
  assert.match(page, /selectMyListingsPage\(managedListings, query\)/);
  assert.match(page, /listing_photos\(image_url,sort_order\)/);
  assert.match(page, /\.limit\(1, \{ foreignTable: "listing_photos" \}\)/);
  assert.match(page, /paused_until/);
  assert.match(page, /Páginas de mis publicaciones/);
  assert.match(page, /redirect\("\/mi-cuenta\/tienda\/inventario"\)/);
});

test("undo notice: polite status, a real Deshacer button, no focus moves, and the inverse of each action", () => {
  assert.deepEqual(lib.INVERSE_ACTION, { hide: "restore", restore: "hide" });
  assert.equal(lib.UNDO_MESSAGES.hide, "Publicación ocultada.");
  assert.equal(lib.UNDO_MESSAGES.restore, "Publicación restaurada.");
  assert.equal(lib.UNDO_MESSAGES.price, "Precio actualizado.");
  assert.equal(lib.bulkResultMessage("hide", 3, 0), "3 publicaciones ocultadas.");
  assert.equal(lib.bulkResultMessage("restore", 1, 0), "1 publicación restaurada.");
  assert.equal(lib.bulkResultMessage("hide", 3, 1), "3 cambiadas, 1 no se pudo cambiar.");
  assert.equal(lib.bulkResultMessage("restore", 1, 2), "1 cambiada, 2 no se pudieron cambiar.");
  assert.deepEqual(lib.parseBulkResult({ changed: ["a", "b"], failed: [{ id: "c", code: "LISTING_HIDE_INVALID" }] }), { changed: ["a", "b"], failed: 1 });
  assert.deepEqual(lib.parseBulkResult(null), { changed: [], failed: 0 });

  const { UndoToast, UNDO_TOAST_MS } = load("components/undo-toast.tsx");
  assert.equal(UNDO_TOAST_MS, 10000);
  const html = renderToStaticMarkup(React.createElement(UndoToast, { toast: { id: 1, message: "Publicación ocultada.", onUndo() {} }, onDismiss() {} }));
  assert.match(html, /^<div role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /Publicación ocultada\.<\/p><button type="button"[^>]*>Deshacer<\/button>/);
  assert.match(html, /aria-label="Cerrar aviso"/);
  const empty = renderToStaticMarkup(React.createElement(UndoToast, { toast: null, onDismiss() {} }));
  assert.match(empty, /^<div role="status" aria-live="polite"[^>]*><\/div>$/, "the live region stays in the page");
  const toast = source("components/undo-toast.tsx");
  assert.doesNotMatch(toast, /\.focus\(/, "the notice never takes focus");
  assert.match(toast, /window\.setTimeout\(onDismiss, UNDO_TOAST_MS\)/, "the timer only closes the notice");

  const table = source("components/listing-management-table.tsx");
  assert.match(table, /notify\(UNDO_MESSAGES\[action\], \(\) => undo\(\(\) => manage\(listing\.id, \{ action: INVERSE_ACTION\[action\] \}\)\)\)/);
  assert.match(table, /undo\(\(\) => manage\(listing\.id, \{ action: "price", price_pen: previous \}\)\)/, "Deshacer restores the previous price");
  assert.match(table, /runBulk\(INVERSE_ACTION\[action\], changed\)/, "a bulk change is undone only for the listings that changed");
  assert.match(table, /rpc\("set_owned_listings_lifecycle_bulk", \{ p_listing_ids: ids, p_action: action \}\)/);
});

test("hide and restore ask nothing first; the sale and the withdrawal keep their confirmation", () => {
  const table = source("components/listing-management-table.tsx");
  const lifecycle = table.slice(table.indexOf("async function runLifecycle"), table.indexOf("async function runConfirmed"));
  assert.doesNotMatch(lifecycle, /confirm\(/);
  assert.doesNotMatch(table, /¿Ocultar esta publicación/);
  const confirmations = table.slice(table.indexOf("const CONFIRMATIONS"), table.indexOf("type ManageResult"));
  assert.deepEqual([...confirmations.matchAll(/^\s+(\w+): \{ title/gm)].map(([, key]) => key), ["sold", "withdraw_sold"]);
  assert.match(table, /if \(!\(await confirm\(CONFIRMATIONS\[action\]\)\)\) return;/);
  assert.match(table, /router\.push\(`\/mi-cuenta\/transacciones\/\$\{listing\.id\}`\)/);
});

test("Ya lo vendí, Lo vendí retirar and Vista previa appear by status; stock-managed rows keep sales and price in Inventario", () => {
  const status = (value, extra = {}) => lib.rowActions({ status: value, hidden_source: null, inventoryItemId: null, ...extra });
  assert.equal(status("hidden", { hidden_source: "owner" }).soldFromHidden, true);
  assert.equal(status("hidden", { hidden_source: "admin" }).soldFromHidden, false);
  for (const value of ["pending", "draft", "rejected"]) {
    assert.equal(status(value).withdrawSold, true, value);
    assert.equal(status(value).preview, true, value);
  }
  for (const value of ["approved", "sold", "archived", "hidden"]) assert.equal(status(value).withdrawSold, false, value);
  const linked = { inventoryItemId: "sku" };
  for (const value of ["approved", "pending", "draft", "rejected"]) {
    const actions = status(value, linked);
    assert.equal(actions.markSold || actions.withdrawSold || actions.price, false, value);
  }
  assert.equal(status("hidden", { hidden_source: "owner", ...linked }).soldFromHidden, false);

  const html = render([
    row("hidden", { status: "hidden", hidden_source: "owner" }),
    row("pending", { status: "pending" }),
    row("approved"),
    row("linked", { inventoryItemId: "44444444-4444-4444-8444-444444444444" }),
  ], { canControlStock: true });
  const [hidden, pending, approved, linkedRow] = rows(html);
  assert.match(hidden, />Ya lo vendí</);
  assert.match(hidden, />Restaurar</);
  assert.doesNotMatch(hidden, /Cambiar precio/);
  assert.match(pending, />Lo vendí, retirar</);
  assert.match(pending, /href="\/mi-cuenta\/publicaciones\/pending\/vista-previa"[^>]*>Vista previa</);
  assert.match(pending, />Cambiar precio</);
  assert.match(approved, />Marcar vendida</);
  assert.match(approved, />Ocultar</);
  assert.doesNotMatch(approved, /Vista previa/);
  assert.doesNotMatch(linkedRow, /Marcar vendida|Cambiar precio|Lo vendí/);
  assert.match(linkedRow, />Ocultar</);
});

test("bulk selection: labelled checkboxes for rows that can be hidden or restored, nothing pre-ticked", () => {
  const html = render([row("a", { title: "Bajo" }), row("b", { status: "hidden", hidden_source: "owner", title: "Pedal" }), row("c", { status: "sold", title: "Amplificador" })]);
  assert.match(html, /aria-label="Seleccionar Bajo"/);
  assert.match(html, /aria-label="Seleccionar Pedal"/);
  assert.doesNotMatch(html, /Seleccionar Amplificador/);
  assert.doesNotMatch(html, /checked=""/);
  assert.match(html, />Seleccionar todas las de esta página</);
  assert.match(html, /<button type="button" disabled=""[^>]*>Ocultar seleccionadas<\/button>/);
  assert.match(html, /<button type="button" disabled=""[^>]*>Restaurar seleccionadas<\/button>/);
  assert.match(html, /aria-label="Cambiar precio de Bajo"[^>]*>Cambiar precio</);
  // No selection bar when no row can be hidden or restored.
  assert.doesNotMatch(render([row("d", { status: "draft" })]), /Seleccionar todas/);
});

test("Republicar and Duplicar open a prefilled draft through copy_owned_listing", () => {
  const route = source("app/api/listings/[id]/manage/route.ts");
  assert.match(route, /body\.action === "relist" \|\| body\.action === "duplicate"/);
  assert.match(route, /rpc\("copy_owned_listing", \{\s*p_listing_id: id,\s*p_mode: body\.action,/);
  assert.match(route, /NextResponse\.json\(\{ ok: true, id: data\.id, listing: data \}\)/);
  assert.doesNotMatch(route, /relist_sold_listing/);
  assert.match(route, /\["hide", "restore", "sold", "withdraw_sold"\]\.includes\(body\.action\)/);
  assert.match(route, /rpc\("set_owned_listing_price", \{\s*p_listing_id: id,\s*p_price_pen: price,/);
  assert.match(route, /LISTING_COPY_INVALID/);
  const table = source("components/listing-management-table.tsx");
  assert.match(table, /router\.push\(`\/mi-cuenta\/publicaciones\/\$\{newId\}\/editar`\)/);
  const [sold, approved, adminHidden] = rows(render([row("s", { status: "sold" }), row("a"), row("h", { status: "hidden", hidden_source: "admin" })]));
  assert.match(sold, />Republicar</);
  assert.doesNotMatch(sold, /Duplicar/);
  assert.match(approved, />Duplicar</);
  assert.doesNotMatch(adminHidden, /Duplicar|Republicar/);
});

test("the paused line shows only while the pause runs, with its return date", () => {
  const now = new Date("2026-10-19T15:00:00Z");
  assert.equal(lib.pausedLabel("2026-11-03", now), "Pausada hasta el 3 nov. 2026");
  assert.equal(lib.pausedLabel("2026-10-19", now), null);
  assert.equal(lib.pausedLabel(null, now), null);
  assert.equal(lib.pausedLabel("mañana", now), null);
  const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  assert.match(render([row("p", { paused_until: future })]), /Pausada hasta el /);
  assert.doesNotMatch(render([row("q", { paused_until: "2020-01-01" })]), /Pausada/);
});

test("thumbnails: the first photo, or a no-photo mark; private uploads skip the optimizer", () => {
  assert.equal(lib.firstPhotoUrl([{ image_url: "b", sort_order: 1 }, { image_url: "a", sort_order: 0 }]), "a");
  assert.equal(lib.firstPhotoUrl([]), null);
  assert.ok(lib.isPrivatePhoto("/api/listing-images/x/listing-edits/y/z/0.jpg"));
  const html = render([row("a", { photoUrl: "https://example.supabase.co/a.jpg" }), row("b", { photoUrl: null })]);
  assert.match(html, /<img src="https:\/\/example\.supabase\.co\/a\.jpg" alt=""/);
  assert.match(html, /Sin foto/);
  assert.doesNotMatch(render([row("c")]), /<img|Sin foto/, "pages that load no photos show no thumbnail");
});

test("the private preview is for the owner only, noindex, with the banner and its links", async () => {
  const preview = "app/mi-cuenta/publicaciones/[id]/vista-previa/page.tsx";
  const text = source(preview);
  assert.match(text, /robots: NOINDEX_ROBOTS/);
  assert.match(text, /\.eq\("owner_user_id", user\.id\)/);
  assert.match(text, /notFound\(\)/);
  const listing = { id: "l1", owner_user_id: "owner", status: "draft", title: "Bajo Fender Jazz", category: "bajos", instrument_type: null, attributes: null, brand: "Fender", model: "Jazz", condition: "Usado - Buen estado", price_pen: 2500, city: "Miraflores", region: "Lima", description: "Bajo en buen estado, con estuche.", store_id: null, hidden_source: null, listing_photos: [{ image_url: "/api/listing-images/a", alt_text: null, sort_order: 0 }] };
  const supabaseFor = () => ({
    from(table) {
      const filters = {};
      const query = {
        select: () => query,
        eq: (column, value) => { filters[column] = value; return query; },
        maybeSingle: async () => {
          if (table === "listing_revisions") return { data: null };
          return { data: filters.id === listing.id && filters.owner_user_id === listing.owner_user_id ? listing : null };
        },
      };
      return query;
    },
  });
  const notFoundError = new Error("NEXT_NOT_FOUND");
  const pageFor = (userId) => load(preview, {
    "next/link": { __esModule: true, default: Link },
    "next/image": { __esModule: true, default: Img },
    "next/navigation": { notFound: () => { throw notFoundError; }, redirect: () => { throw new Error("redirect"); } },
    "@/lib/account-context": { getAccountContext: async () => ({ user: { id: userId }, supabase: supabaseFor() }) },
  }).default;
  const html = renderToStaticMarkup(await pageFor("owner")({ params: Promise.resolve({ id: "l1" }) }));
  assert.match(html, /Vista previa: así se verá tu publicación\. Solo tú la ves\./);
  assert.match(html, /<h1[^>]*>Bajo Fender Jazz<\/h1>/);
  assert.match(html, /href="\/mi-cuenta\/publicaciones\/l1\/editar"[^>]*>Editar</);
  assert.match(html, /href="\/mi-cuenta\/publicaciones"[^>]*>Volver a mis publicaciones</);
  assert.match(html, /Descripción/);
  await assert.rejects(pageFor("someone-else")({ params: Promise.resolve({ id: "l1" }) }), notFoundError);
});
