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

function aggregate(days = 0) {
  return {
    days,
    tracking_started_at: "2026-09-16T12:00:00Z",
    summary: { active: 12, sold: 6, views: 321, recorded_views: 30, impressions: 100, contacts: 9, store_views: 11, store_contacts: 2, ctr: 0.3, contact_rate: 0.3 },
    listings: [{ id: "listing-1", title: "Guitarra", status: "approved", published_at: "2026-09-16T12:00:00Z", sold_at: null, views: 321, recorded_views: 30, impressions: 100, contacts: 9, ctr: 0.3, contact_rate: 0.3 }],
  };
}

function helper(context = {}, response = { data: aggregate(), error: null }) {
  const calls = [];
  const supabase = { rpc: async (...args) => { calls.push(args); return typeof response === "function" ? response() : response; } };
  return {
    calls,
    ...load("lib/account-analytics.ts", { "@/lib/account-context": { getAccountContext: async () => ({ profile: { account_type: "seller" }, supabase, ...context }) } }),
  };
}

const { parseAccountAnalytics, parseAnalyticsWindow } = helper();
const { AccountAnalyticsMetrics } = load("components/account-analytics.tsx");
const Link = ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children);

test("analytics periods allow only lifetime, seven and thirty days", () => {
  for (const period of [0, 7, 30]) {
    assert.equal(parseAnalyticsWindow(period), period);
    assert.equal(parseAnalyticsWindow(String(period)), period);
  }
  for (const period of [null, undefined, -7, 365, "30 OR 1=1", ["7"], "07"]) assert.equal(parseAnalyticsWindow(period), 30);
  assert.equal(parseAnalyticsWindow(undefined, 0), 0);
});

test("aggregate parser accepts genuine zeros and null denominators without inventing data", () => {
  const value = aggregate();
  for (const key of Object.keys(value.summary)) value.summary[key] = key === "ctr" || key === "contact_rate" ? null : 0;
  value.tracking_started_at = null;
  value.listings = [];
  assert.deepEqual(parseAccountAnalytics(value), value);
});

test("aggregate parser rejects missing, invalid and duplicated values", () => {
  for (const key of Object.keys(aggregate().summary)) {
    const value = aggregate();
    delete value.summary[key];
    assert.equal(parseAccountAnalytics(value), null, key);
  }
  for (const invalid of [-1, "0", NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const value = aggregate();
    value.summary.views = invalid;
    assert.equal(parseAccountAnalytics(value), null);
  }
  const duplicate = aggregate();
  duplicate.listings.push({ ...duplicate.listings[0] });
  assert.equal(parseAccountAnalytics(duplicate), null);
  const invalidDate = aggregate();
  invalidDate.listings[0].published_at = "not-a-date";
  assert.equal(parseAccountAnalytics(invalidDate), null);
  assert.equal(parseAccountAnalytics({ ...aggregate(), days: "0" }), null);
  assert.equal(parseAccountAnalytics({ ...aggregate(), listings: [{ ...aggregate().listings[0], status: "invented" }] }), null);
});

test("owned drafts remain valid analytics rows and display a Spanish status", () => {
  const value = aggregate();
  value.listings[0].status = "draft";
  value.listings[0].published_at = null;
  assert.deepEqual(parseAccountAnalytics(value), value);
  const { listingStatusLabel } = load("lib/account-ui.ts");
  assert.equal(listingStatusLabel("draft"), "Borrador");
});

test("request aggregate uses trusted account context and no arbitrary owner parameter", async () => {
  const subject = helper();
  assert.deepEqual(await subject.getAccountAnalytics(0), aggregate());
  assert.deepEqual(subject.calls, [["get_account_analytics", { p_days: 0 }]]);
  const source = fs.readFileSync("lib/account-analytics.ts", "utf8");
  assert.match(source, /cache\(async function getAccountAnalytics/);
  assert.doesNotMatch(source, /p_owner_id|unstable_cache/);
});

test("missing profile or database never creates fictional aggregate", async () => {
  for (const context of [{ profile: null }, { profile: { account_type: "buyer" } }, { supabase: null }]) {
    const subject = helper(context);
    assert.equal(await subject.getAccountAnalytics(), null);
    assert.equal(subject.calls.length, 0);
  }
});

test("RPC errors, thrown requests, malformed data and wrong periods show unavailable", async () => {
  const responses = [
    { data: aggregate(), error: { message: "denied" } },
    { data: null, error: null },
    { data: aggregate(7), error: null },
    () => { throw new Error("network"); },
  ];
  for (const response of responses) assert.equal(await helper({}, response).getAccountAnalytics(0), null);
});

test("Particular cards render all-owned actual metrics, not a truncated recent-list count", () => {
  const html = renderToStaticMarkup(React.createElement(AccountAnalyticsMetrics, { analytics: aggregate() }));
  assert.match(html, /Publicaciones activas/);
  assert.match(html, /Estado actual: aprobadas y públicas/);
  assert.match(html, />12</);
  assert.match(html, />321</);
  assert.match(html, />9</);
  assert.match(html, />6</);
  assert.match(html, /incluidas las vistas históricas/);
  assert.match(html, /no mensajes ni ventas/);
  assert.doesNotMatch(html, /Favoritos|Ingresos|CTR de productos/);
});

test("Store metrics distinguish current inventory, recorded events, ratios and historical views", () => {
  const html = renderToStaticMarkup(React.createElement(AccountAnalyticsMetrics, { analytics: aggregate(30), store: true }));
  assert.match(html, /últimos 30 días/);
  assert.match(html, /estado actual de todo tu inventario/);
  assert.match(html, /30/);
  assert.match(html, /CTR de productos/);
  assert.match(html, /Tasa de contacto/);
  assert.match(html, /excluyen las vistas históricas sin evento/);
  assert.match(html, /no conversaciones, compradores únicos ni transacciones/);
  assert.match(html, /no calcula ingresos ni garantiza/);
});

test("undefined rates are not displayed as zero and unavailable is not a zero dashboard", () => {
  const value = aggregate();
  value.summary.ctr = null;
  value.summary.contact_rate = null;
  const html = renderToStaticMarkup(React.createElement(AccountAnalyticsMetrics, { analytics: value, store: true }));
  assert.equal((html.match(/>Sin datos</g) ?? []).length, 2);
  const unavailable = renderToStaticMarkup(React.createElement(AccountAnalyticsMetrics, { analytics: null, store: true }));
  assert.match(unavailable, /no están disponibles/);
  assert.doesNotMatch(unavailable, /Publicaciones activas|>0</);
});

function statisticsPage(context, metrics = aggregate(30)) {
  const calls = [];
  return {
    calls,
    page: load("app/mi-cuenta/tienda/estadisticas/page.tsx", {
      "next/link": { default: Link },
      "next/navigation": { redirect: (destination) => { throw new Error(`redirect:${destination}`); } },
      "@/lib/account-context": { getAccountContext: async () => context },
      "@/lib/account-analytics": { parseAnalyticsWindow, getAccountAnalytics: async (days) => { calls.push(days); return metrics; } },
      "@/components/account-analytics": { AccountAnalyticsMetrics },
    }).default,
  };
}

test("Store stats are server role-guarded and require an owned store", async () => {
  for (const [context, destination] of [
    [{ profile: { account_type: "seller" }, store: { id: "other" } }, "/mi-cuenta"],
    [{ profile: { account_type: "store_owner" }, store: null }, "/mi-cuenta/tienda"],
  ]) {
    const subject = statisticsPage(context);
    await assert.rejects(subject.page({ searchParams: Promise.resolve({}) }), { message: `redirect:${destination}` });
    assert.equal(subject.calls.length, 0);
  }
});

test("Store stats render one aggregate and genuine period links with active state", async () => {
  const subject = statisticsPage({ profile: { account_type: "store_owner" }, store: { name: "Tienda real" } }, aggregate(7));
  const html = renderToStaticMarkup(await subject.page({ searchParams: Promise.resolve({ periodo: "7" }) }));
  assert.deepEqual(subject.calls, [7]);
  assert.match(html, /href="\/mi-cuenta\/tienda\/estadisticas\?periodo=7" aria-current="page"/);
  assert.match(html, /periodo=0/);
  assert.match(html, /periodo=30/);
  assert.match(html, /href="\/mi-cuenta\/tienda\/inventario"/);
});

test("Particular dashboard queries recent five but displays complete owner RPC summary", async () => {
  const queries = [];
  const query = new Proxy({}, { get: (_, name) => (...args) => {
    queries.push([name, ...args]);
    return name === "limit" ? Promise.resolve({ data: Array.from({ length: 5 }, (_, i) => ({ id: `recent-${i}`, title: `Reciente ${i}`, status: "pending" })) }) : query;
  } });
  let aggregates = 0;
  const page = load("app/mi-cuenta/page.tsx", {
    "next/link": { default: Link },
    "lucide-react": { AlertTriangle: () => null, CheckCircle2: () => null, ExternalLink: () => null },
    "@/lib/account-context": { getAccountContext: async () => ({ user: { id: "owner", email: "owner@example.test" }, profile: { account_type: "seller", full_name: "Dueño" }, store: null, supabase: { from: () => query } }) },
    "@/lib/account-ui": { listingStatusLabel: (value) => value },
    "@/lib/auth/profile": { isSellerProfileComplete: () => true },
    "@/lib/account-analytics": { getAccountAnalytics: async (days) => { assert.equal(days, 0); aggregates++; return aggregate(); } },
    "@/components/account-analytics": { AccountAnalyticsMetrics },
  }).default;
  const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({}) }));
  assert.equal(aggregates, 1);
  assert.ok(queries.some(([method, value]) => method === "limit" && value === 5));
  assert.match(html, />12</);
  assert.equal((html.match(/Reciente \d/g) ?? []).length, 5);
  assert.doesNotMatch(html, />En revisión</);
});

test("management table renders actual per-listing counts, first publication and sold history", () => {
  const { ListingManagementTable } = load("components/listing-management-table.tsx", {
    "next/link": { default: Link },
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/components/page-notice": { PageNotice: () => null },
    "@/lib/account-ui": { listingStatusLabel: (value) => value === "sold" ? "Vendida" : value },
    "@/lib/listings": { formatPrice: () => "S/ 100" },
  });
  const listing = { id: "one", title: "Historial", status: "sold", slug: "historial", price_pen: 100, created_at: "2026-09-01T12:00:00Z", published_at: "2026-09-02T12:00:00Z", sold_at: "2026-09-16T12:00:00Z", rejection_reason: null, hidden_source: null, hidden_reason: null, revisionStatus: null, revisionReason: null, analytics: { views: 123, contacts: 7 } };
  const html = renderToStaticMarkup(React.createElement(ListingManagementTable, { listings: [listing], emptyMessage: "Vacío" }));
  assert.match(html, /Primera publicación/);
  assert.match(html, /Marcada vendida:/);
  assert.match(html, />123</);
  assert.match(html, />7</);
  assert.match(html, /Republicar copia/);
  const missing = renderToStaticMarkup(React.createElement(ListingManagementTable, { listings: [{ ...listing, published_at: null, analytics: undefined }], emptyMessage: "Vacío" }));
  assert.match(missing, /Aún no publicada/);
  assert.equal((missing.match(/>No disponible</g) ?? []).length, 2);
});

test("both inventory pages use one grouped owner aggregate rather than per-listing RPCs", () => {
  for (const filename of ["app/mi-cuenta/publicaciones/page.tsx", "app/mi-cuenta/tienda/inventario/page.tsx"]) {
    const source = fs.readFileSync(filename, "utf8");
    assert.equal((source.match(/getAccountAnalytics\(0\)/g) ?? []).length, 1);
    assert.match(source, /Promise\.all/);
    assert.match(source, /new Map\(analytics\?\.listings/);
    assert.match(source, /published_at,sold_at/);
    assert.doesNotMatch(source, /p_owner_id|\.rpc\(/);
  }
});

test("analytics section is only exposed for Store Owners with a store", () => {
  const { getAccountNavigationItems } = load("lib/account-navigation.ts");
  assert.equal(getAccountNavigationItems("seller", false).some((item) => item.icon === "analytics"), false);
  assert.equal(getAccountNavigationItems("store_owner", false).some((item) => item.icon === "analytics"), false);
  assert.equal(getAccountNavigationItems("store_owner", true).filter((item) => item.icon === "analytics").length, 1);
});
