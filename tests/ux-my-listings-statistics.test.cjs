// mine-11 (Particular statistics with next steps) and shop-07 (store statistics that point somewhere).
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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
  return mod.exports;
}

function row(overrides = {}) {
  return { id: "listing-1", title: "Guitarra Fender", slug: "guitarra-fender", status: "approved", price_pen: 2500, published_at: "2026-09-16T12:00:00Z", views: 40, impressions: 120, contacts: 3, purchase_requests: 0, saves: 2, favorites: 4, photos: 6, description_length: 400, ...overrides };
}

function weeks() {
  return Array.from({ length: 12 }, (_, index) => ({ week_start: new Date(Date.UTC(2026, 6, 27 + index * 7)).toISOString().slice(0, 10), views: index * 3, contacts: index % 3, purchase_requests: index === 11 ? 1 : 0 }));
}

function statistics(days = 30, listings = [row()]) {
  return { days, listings, weekly: weeks(), contacts_without_sale: { count: 1, contacts: 3, items: [{ id: "listing-1", title: "Guitarra Fender", contacts: 3 }] } };
}

function helper(context = {}, response = { data: statistics(), error: null }) {
  const calls = [];
  const supabase = { rpc: async (...args) => { calls.push(args); return typeof response === "function" ? response() : response; } };
  return { calls, ...load("lib/account-analytics.ts", { "@/lib/account-context": { getAccountContext: async () => ({ profile: { account_type: "seller" }, supabase, ...context }) } }) };
}

const lib = helper();
const { parseListingStatistics, parseStatisticsWindow, listingTips, topListings } = lib;
const Link = ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children);
const ranking = load("components/statistics/listing-ranking.tsx", { "next/link": { default: Link }, "@/lib/account-analytics": lib });
const tipsList = load("components/statistics/listing-tips-list.tsx", { "next/link": { default: Link }, "@/lib/account-analytics": lib, "@/components/statistics/listing-ranking": ranking });
const trend = load("components/statistics/weekly-trend.tsx");
const { AccountAnalyticsMetrics } = load("components/account-analytics.tsx");

test("statistics periods are the RPC's 7, 30 and 90 days, 30 by default", () => {
  for (const period of [7, 30, 90]) {
    assert.equal(parseStatisticsWindow(period), period);
    assert.equal(parseStatisticsWindow(String(period)), period);
  }
  for (const period of [0, "0", null, undefined, 365, "30 OR 1=1", ["7"], "07"]) assert.equal(parseStatisticsWindow(period), 30);
});

test("statistics parser accepts real payloads and genuine zeros", () => {
  assert.deepEqual(parseListingStatistics(statistics()), statistics());
  const zero = statistics(7, [row({ views: 0, impressions: 0, contacts: 0, saves: 0, favorites: 0, photos: 0, description_length: 0, slug: null, price_pen: null, published_at: null })]);
  zero.weekly = [];
  zero.contacts_without_sale = { count: 0, contacts: 0, items: [] };
  assert.deepEqual(parseListingStatistics(zero), zero);
});

test("statistics parser returns null for malformed payloads instead of a zero dashboard", () => {
  for (const value of [null, [], "x", { ...statistics(), days: 0 }, { ...statistics(), days: "30" }, { ...statistics(), listings: null }, { ...statistics(), weekly: {} }]) {
    assert.equal(parseListingStatistics(value), null);
  }
  for (const key of Object.keys(row())) {
    if (["slug", "price_pen", "published_at"].includes(key)) continue;
    const value = statistics();
    delete value.listings[0][key];
    assert.equal(parseListingStatistics(value), null, key);
  }
  for (const invalid of [-1, "3", 1.5, NaN, Infinity]) assert.equal(parseListingStatistics(statistics(30, [row({ contacts: invalid })])), null);
  assert.equal(parseListingStatistics(statistics(30, [row(), row()])), null, "duplicated listing");
  assert.equal(parseListingStatistics(statistics(30, [row({ status: "invented" })])), null);
  const badWeek = statistics();
  badWeek.weekly[0].week_start = "13 oct";
  assert.equal(parseListingStatistics(badWeek), null);
  const badStale = statistics();
  badStale.contacts_without_sale.items = [{ id: "", title: "x", contacts: 1 }];
  assert.equal(parseListingStatistics(badStale), null);
  assert.equal(parseListingStatistics({ ...statistics(), contacts_without_sale: undefined }), null);
});

test("statistics request uses the caller's session, the chosen window and never an owner parameter", async () => {
  const subject = helper();
  assert.deepEqual(await subject.getListingStatistics(30), statistics());
  assert.deepEqual(subject.calls, [["get_listing_statistics", { p_days: 30 }]]);
  assert.equal(await helper({}, { data: statistics(7), error: null }).getListingStatistics(30), null, "wrong window");
  assert.equal(await helper({}, { data: null, error: { message: "ANALYTICS_WINDOW_INVALID" } }).getListingStatistics(30), null);
  assert.equal(await helper({}, () => { throw new Error("network"); }).getListingStatistics(30), null);
  for (const context of [{ profile: null }, { profile: { account_type: "buyer" } }, { supabase: null }]) {
    const denied = helper(context);
    assert.equal(await denied.getListingStatistics(30), null);
    assert.equal(denied.calls.length, 0);
  }
  assert.doesNotMatch(fs.readFileSync("lib/account-analytics.ts", "utf8"), /p_owner_id/);
});

test("tips: plain next steps, most useful first, at most two", () => {
  assert.deepEqual(listingTips(row()), []);
  assert.deepEqual(listingTips(row({ views: 0, contacts: 0 })), ["Sin vistas en este periodo: mejora el título o la primera foto"]);
  assert.deepEqual(listingTips(row({ views: 100, contacts: 1 })), ["Muchas vistas y pocos contactos: revisa el precio"]);
  // Exactly 2 % is not "few"; fewer than 30 views is too little to judge.
  assert.deepEqual(listingTips(row({ views: 100, contacts: 2 })), []);
  assert.deepEqual(listingTips(row({ views: 29, contacts: 0 })), []);
  // A purchase request is interest too.
  assert.deepEqual(listingTips(row({ views: 100, contacts: 1, purchase_requests: 1 })), []);
  assert.deepEqual(listingTips(row({ photos: 2 })), ["Solo 2 fotos: agrega el reverso y los detalles"]);
  assert.deepEqual(listingTips(row({ photos: 1 })), ["Solo 1 foto: agrega el reverso y los detalles"]);
  assert.deepEqual(listingTips(row({ photos: 0 })), ["Sin fotos: agrega el frente, el reverso y los detalles"]);
  assert.deepEqual(listingTips(row({ description_length: 119 })), ["Descripción breve: cuenta el estado real y qué incluye"]);
  assert.deepEqual(listingTips(row({ description_length: 120 })), []);
  assert.deepEqual(listingTips(row({ contacts: 5 })), ["Varios contactos sin venta: ¿sigue disponible?"]);
  assert.deepEqual(listingTips(row({ views: 0, contacts: 0, photos: 1, description_length: 10 })), ["Sin vistas en este periodo: mejora el título o la primera foto", "Solo 1 foto: agrega el reverso y los detalles"]);
  assert.equal(listingTips(row({ views: 300, contacts: 5, photos: 1, description_length: 10 })).length, 2);
});

test("tips: period numbers only judge published listings; sold and archived get none", () => {
  for (const status of ["pending", "hidden", "rejected"]) {
    assert.deepEqual(listingTips(row({ status, views: 0, contacts: 9 })), [], status);
    assert.deepEqual(listingTips(row({ status, photos: 1 })), ["Solo 1 foto: agrega el reverso y los detalles"], status);
  }
  for (const status of ["sold", "archived"]) assert.deepEqual(listingTips(row({ status, views: 0, photos: 0, description_length: 0 })), [], status);
});

test("rankings keep the top five with a real number and leave out zeros", () => {
  const listings = Array.from({ length: 7 }, (_, index) => row({ id: `l-${index}`, views: index, contacts: index % 2, purchase_requests: 0 }));
  assert.deepEqual(topListings(listings, "views").map((listing) => listing.id), ["l-6", "l-5", "l-4", "l-3", "l-2"]);
  assert.deepEqual(topListings(listings, "contacts").map((listing) => listing.id), ["l-1", "l-3", "l-5"]);
  assert.deepEqual(topListings(listings, "purchase_requests"), []);
});

test("Particular list: published first, period numbers and every tip links to the edit page", () => {
  const listings = [row({ id: "draft-one", status: "pending", title: "Pedal en revisión", photos: 1 }), row({ id: "pub", title: "Bajo publicado", views: 0, contacts: 0 }), row({ id: "sold", status: "sold", title: "Batería vendida", slug: "bateria" })];
  const html = renderToStaticMarkup(React.createElement(tipsList.ListingTipsList, { listings, days: 30 }));
  assert.ok(html.indexOf("Bajo publicado") < html.indexOf("Pedal en revisión"));
  assert.match(html, /href="\/mi-cuenta\/publicaciones\/pub\/editar"[^>]*>Sin vistas en este periodo/);
  assert.match(html, /href="\/mi-cuenta\/publicaciones\/draft-one\/editar"[^>]*>Solo 1 foto/);
  assert.match(html, /href="\/instrumentos\/bateria"/);
  assert.doesNotMatch(html, /\/mi-cuenta\/publicaciones\/sold\/editar/);
  assert.match(html, /0 vistas · 0 contactos por WhatsApp · 2 guardados/);
  assert.match(html, /Publicada/);
});

test("weekly trend: two single-series charts, a text title and a table with every week", () => {
  const html = renderToStaticMarkup(React.createElement(trend.WeeklyTrend, { weekly: weeks(), purchaseRequests: true }));
  assert.equal((html.match(/<svg[^>]*role="img"/g) ?? []).length, 2, "small multiples, never a dual axis");
  assert.match(html, /Vistas por semana, últimas 12 semanas: 198 vistas en total, 33 vistas en la semana en curso/);
  assert.match(html, /<details/);
  assert.equal((html.match(/<tr>/g) ?? []).length, 13, "a header and twelve weeks");
  assert.match(html, /Solicitudes de compra/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(trend.WeeklyTrend, { weekly: weeks() })), /Solicitudes de compra/);
  assert.equal(trend.niceMax(0), 1);
  assert.equal(trend.niceMax(33), 50);
  assert.equal(trend.niceMax(100), 100);
  assert.equal(trend.formatWeek("2026-10-12").startsWith("12"), true);
});

test("contacts without sale shows the count, up to five listings and a next step", () => {
  const html = renderToStaticMarkup(React.createElement(ranking.ContactsWithoutSale, { data: statistics().contacts_without_sale }));
  assert.match(html, /1 publicación recibió 3 contactos por WhatsApp y sigue publicada/);
  assert.match(html, /revisa el precio o confirma que sigue disponible/);
  assert.match(html, /href="\/mi-cuenta\/publicaciones\/listing-1\/editar"/);
  const none = renderToStaticMarkup(React.createElement(ranking.ContactsWithoutSale, { data: { count: 0, contacts: 0, items: [] } }));
  assert.match(none, /Ninguna publicación activa/);
});

function lifetime() {
  return { days: 0, tracking_started_at: null, summary: { active: 1, sold: 0, verified_transactions: 0, contact_to_verified_rate: null, views: 77, recorded_views: 0, impressions: 0, contacts: 0, favorites: 0, favorite_additions: 0, favorite_removals: 0, favorite_rate: null, store_views: 0, store_contacts: 0, ctr: null, contact_rate: null }, listings: [] };
}

function pageMocks(context, data, calls) {
  return {
    "next/link": { default: Link },
    "next/navigation": { redirect: (destination) => { throw new Error(`redirect:${destination}`); } },
    "@/lib/account-context": { getAccountContext: async () => context },
    "@/lib/account-analytics": { ...lib, getListingStatistics: async (days) => { calls.push(["statistics", days]); return data; }, getAccountAnalytics: async (days) => { calls.push(["analytics", days]); return { ...lifetime(), days }; } },
    "@/components/account-analytics": { AccountAnalyticsMetrics },
    "@/components/statistics/listing-ranking": ranking,
    "@/components/statistics/listing-tips-list": tipsList,
    "@/components/statistics/weekly-trend": trend,
  };
}

test("Particular statistics page: store owners and buyers are redirected before any query", async () => {
  for (const [context, destination] of [[{ profile: { account_type: "store_owner" } }, "/mi-cuenta/tienda/estadisticas"], [{ profile: { account_type: "buyer" } }, "/mi-cuenta"], [{ profile: null }, "/mi-cuenta"]]) {
    const calls = [];
    const page = load("app/mi-cuenta/estadisticas/page.tsx", pageMocks(context, statistics(), calls)).default;
    await assert.rejects(page({ searchParams: Promise.resolve({}) }), { message: `redirect:${destination}` });
    assert.equal(calls.length, 0);
  }
});

test("Particular statistics page: 30 days by default, period chips, totals, tips and the lifetime metrics", async () => {
  const calls = [];
  const page = load("app/mi-cuenta/estadisticas/page.tsx", pageMocks({ profile: { account_type: "seller" } }, statistics(30, [row({ views: 12, contacts: 2, saves: 3, photos: 2 }), row({ id: "two", views: 8, contacts: 1, saves: 0 })]), calls)).default;
  const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({}) }));
  assert.deepEqual(calls.sort(), [["analytics", 0], ["statistics", 30]]);
  assert.match(html, /<a(?=[^>]*href="\/mi-cuenta\/estadisticas\?periodo=30")(?=[^>]*aria-current="page")[^>]*>/);
  assert.match(html, /periodo=7/);
  assert.match(html, /periodo=90/);
  assert.match(html, /Últimos 30 días/);
  assert.match(html, />20</, "views summed over listings");
  assert.match(html, />3</);
  assert.match(html, /Solo 2 fotos: agrega el reverso y los detalles/);
  assert.match(html, /Todo el historial/);
  assert.match(html, />77</, "lifetime totals stay available");
  assert.doesNotMatch(html, /Ingresos|S\/ 2/);
});

test("Particular statistics page: unavailable and empty are not zero dashboards", async () => {
  const unavailable = load("app/mi-cuenta/estadisticas/page.tsx", pageMocks({ profile: { account_type: "seller" } }, null, [])).default;
  const html = renderToStaticMarkup(await unavailable({ searchParams: Promise.resolve({ periodo: "7" }) }));
  assert.match(html, /no están disponibles/);
  assert.doesNotMatch(html, /Por publicación/);
  const empty = load("app/mi-cuenta/estadisticas/page.tsx", pageMocks({ profile: { account_type: "seller" } }, statistics(30, []), [])).default;
  assert.match(renderToStaticMarkup(await empty({ searchParams: Promise.resolve({}) })), /href="\/mi-cuenta\/publicar"/);
});

test("store statistics: trend, rankings with purchase requests apart, contacts without sale, and the 0 → 30 default", async () => {
  const calls = [];
  const listings = [row({ id: "a", title: "Más vista", views: 90, contacts: 1, purchase_requests: 0 }), row({ id: "b", title: "Más consultada", views: 10, contacts: 8, purchase_requests: 0 }), row({ id: "c", title: "Con solicitud", views: 5, contacts: 0, purchase_requests: 2 })];
  const page = load("app/mi-cuenta/tienda/estadisticas/page.tsx", pageMocks({ profile: { account_type: "store_owner" }, store: { name: "Tienda real" } }, statistics(30, listings), calls)).default;
  const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ periodo: "0" }) }));
  assert.deepEqual(calls.sort(), [["analytics", 0], ["statistics", 30]]);
  assert.match(html, /Últimas 12 semanas/);
  assert.match(html, /Lo más visto/);
  assert.match(html, /Lo más consultado/);
  assert.match(html, /Más solicitudes de compra/);
  assert.match(html, /href="\/mi-cuenta\/publicaciones\/c\/editar"[^>]*>Con solicitud<\/a>[\s\S]*?2 solicitudes/);
  assert.match(html, /Contactos sin venta en 30 días/);
  assert.match(html, /las solicitudes de compra se cuentan aparte/);
  assert.doesNotMatch(html, /en tu <a[^>]*inventario/, "the inventory has no per-listing numbers");
  const source = fs.readFileSync("app/mi-cuenta/tienda/estadisticas/page.tsx", "utf8");
  assert.match(source, /days === 0 \? 30 : days/);
});
