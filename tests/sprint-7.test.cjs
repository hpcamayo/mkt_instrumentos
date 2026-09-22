const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

function load(filename, mocks = {}) {
  const source = path.resolve(filename);
  const compiled = ts.transpileModule(fs.readFileSync(source, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = new Module(source, module);
  mod.filename = source;
  mod.paths = module.paths;
  const original = mod.require.bind(mod);
  mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  mod._compile(compiled, source);
  return mod.exports;
}

const filterGroups = [{ instrumentType: "electric_guitar", label: "Guitarras eléctricas", filters: [
  { key: "body_type", label: "Tipo de cuerpo", type: "select", options: [{ value: "solid_body", label: "Solid body" }] },
  { key: "pickups", label: "Pastillas", type: "multiselect", options: [{ value: "single_coil", label: "Single coil" }] },
] }];
const listingMocks = {
  categoryOptions: [{ value: "guitars", label: "Guitarras" }],
  conditionOptions: ["Nuevo", "Usado - buen estado"],
  sellerTypeOptions: [{ value: "individual", label: "Particular" }, { value: "verified_store", label: "Tienda verificada" }],
};
const searchAlerts = load("lib/search-alerts.ts", {
  "@/lib/instrument-filters": { instrumentFilterGroups: filterGroups },
  "@/lib/listings": listingMocks,
  "@/lib/supabase/database.types": {},
});

test("saved searches serialize canonical supported state and render readable Spanish summaries", () => {
  const filters = searchAlerts.listingFiltersToSearchAlert({
    category: "guitars", city: "Lima", condition: "Usado - buen estado", brand: " Fender ", sellerType: "individual",
    instrumentType: "electric_guitar", minPrice: 1000, maxPrice: 3000,
    advanced: { body_type: "solid_body", pickups: ["single_coil"] }, sort: "price_asc",
  });
  assert.deepEqual(filters, {
    category: "guitars", location: "Lima", condition: "Usado - buen estado", brand: "Fender", seller_type: "individual",
    instrument_type: "electric_guitar", min_price: 1000, max_price: 3000,
    advanced: { body_type: "solid_body", pickups: ["single_coil"] },
  });
  const pathValue = searchAlerts.searchAlertPath(filters);
  assert.match(pathValue, /^\/listados\?/);
  assert.match(pathValue, /category=guitars/);
  assert.match(pathValue, /pickups=single_coil/);
  assert.doesNotMatch(pathValue, /sort=/);
  const summary = searchAlerts.searchAlertSummary(filters);
  for (const text of ["Guitarras", "Guitarras eléctricas", "Marca: Fender", "Lima", "S/ 1,000–S/ 3,000", "Solid body", "Single coil"]) assert.match(summary, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("alert parsing rejects malformed/private shapes", () => {
  const valid = { id: "71000000-0000-4000-8000-000000000002", search_filters: { category: "guitars" }, frequency: "daily", status: "active", active_since: "2026-09-21T12:00:00Z", created_at: "2026-09-21T12:00:00Z" };
  assert.deepEqual(searchAlerts.parseSavedSearchAlerts([valid]), [valid]);
  assert.deepEqual(searchAlerts.parseSavedSearchAlerts([{ ...valid, status: "deleted" }]), []);
  assert.deepEqual(searchAlerts.parseSavedSearchAlerts([{ ...valid, search_filters: { external_url: "https://evil.invalid" } }]), []);
});

test("both account roles expose Compras and Alertas with canonical transaction badge state", () => {
  const navigation = load("lib/account-navigation.ts");
  for (const [role, hasStore] of [["seller", false], ["store_owner", false], ["store_owner", true]]) {
    const items = navigation.getAccountNavigationItems(role, hasStore);
    assert.equal(items.filter((item) => item.label === "Compras").length, 1);
    assert.equal(items.filter((item) => item.label === "Alertas").length, 1);
    assert.equal(items.find((item) => item.label === "Compras").href, "/mi-cuenta/transacciones");
    assert.equal(items.find((item) => item.label === "Alertas").href, "/mi-cuenta/alertas");
  }
  const layout = fs.readFileSync("app/mi-cuenta/layout.tsx", "utf8");
  const menu = fs.readFileSync("components/account-navigation.tsx", "utf8");
  const center = fs.readFileSync("components/transaction-center.tsx", "utf8");
  assert.match(layout, /get_pending_buyer_confirmation_count/);
  assert.doesNotMatch(layout.slice(layout.indexOf("pendingBuyerConfirmations")), /read_at.*pendingBuyerConfirmations/);
  assert.match(menu, /compras requieren tu confirmación/);
  assert.match(menu, /Menú de cuenta móvil/);
  assert.match(center, /Requiere tu confirmación/);
  assert.match(center, /¿Compraste este artículo\?/);
  assert.match(center, /Tienes una reseña pendiente/);
});

test("marketplace templates are branded, safe and preserve transaction/review limitations", () => {
  const templates = load("lib/email/templates.ts", {
    "@/lib/price": { formatPrice: (value) => `S/ ${value}` },
    "@/lib/search-alerts": { searchAlertPath: () => "/listados?category=guitars", searchAlertSummary: () => "Guitarras · Lima" },
  });
  const base = {
    delivery_id: "delivery", attempt_count: 1, recipient_email: "buyer@example.invalid", recipient_name: "Buyer", context: {}, store: null, search_alert: null,
    listing: { title: "Guitarra <QA>", slug: "guitarra-qa", price_pen: 1000 }, transaction: null,
  };
  const approved = templates.renderMarketplaceEmail({ ...base, event_type: "listing_approved" }, "https://laria.audio");
  assert.match(approved.html, /Laria/);
  assert.match(approved.html, /Guitarra &lt;QA&gt;/);
  assert.match(approved.destination, /^https:\/\/laria\.audio\/mi-cuenta\/publicaciones$/);
  assert.doesNotMatch(approved.html, /<img|tracking|buyer@example\.invalid/i);
  const review = templates.renderMarketplaceEmail({ ...base, event_type: "review_revealed", listing: null, transaction: { reference_id: "transaction", listing_title: "Pedal", review_deadline: null } }, "https://laria.audio");
  assert.match(review.text, /no procesa pagos|no verifica pago/i);
  assert.doesNotMatch(review.text, /rating|comment|calificación de la otra parte/i);
  const price = templates.renderMarketplaceEmail({ ...base, event_type: "listing_price_drop", context: { old_price_pen: 1200, new_price_pen: 1100 } }, "https://laria.audio");
  assert.equal(price.subject, "Bajó de precio un producto que guardaste");
  assert.equal(price.destination, "https://laria.audio/instrumentos/guitarra-qa");
  assert.throws(() => templates.renderMarketplaceEmail({ ...base, event_type: "search_alert_daily", listing: null, search_alert: { id: "alert", filters: {}, frequency: "daily", matches: [] } }, "https://laria.audio"), /EMAIL_EMPTY_DIGEST/);
});

test("Resend adapter supplies provider idempotency and classifies retryable failures", async () => {
  const providerModule = load("lib/email/provider.ts", { "server-only": {} });
  const calls = [];
  const adapter = new providerModule.ResendMarketplaceEmailProvider("secret", "Laria <notificaciones@laria.audio>", async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: "resend-message" }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const result = await adapter.send({ to: "qa@example.invalid", subject: "QA", html: "<p>QA</p>", text: "QA", idempotencyKey: "delivery-id" });
  assert.equal(result.messageId, "resend-message");
  assert.equal(calls[0].init.headers["Idempotency-Key"], "delivery-id");
  assert.equal(JSON.parse(calls[0].init.body).to[0], "qa@example.invalid");
  const limited = new providerModule.ResendMarketplaceEmailProvider("secret", "from", async () => new Response("{}", { status: 429, headers: { "content-type": "application/json" } }));
  await assert.rejects(() => limited.send({ to: "qa@example.invalid", subject: "QA", html: "", text: "", idempotencyKey: "id" }), (error) => error.retryable && error.category === "rate_limit");
  const unauthorized = new providerModule.ResendMarketplaceEmailProvider("secret", "from", async () => new Response("{}", { status: 401, headers: { "content-type": "application/json" } }));
  await assert.rejects(() => unauthorized.send({ to: "qa@example.invalid", subject: "QA", html: "", text: "", idempotencyKey: "id" }), (error) => !error.retryable && error.category === "configuration");
});

test("email worker retries provider failure, completes success, and replays a bounded Lima digest window", async () => {
  const providerError = class extends Error { constructor() { super("temporary"); this.retryable = true; this.category = "transport"; this.code = "timeout"; } };
  const payload = { delivery_id: "delivery-one", event_type: "listing_approved", attempt_count: 1, recipient_email: "qa@example.invalid", recipient_name: null, context: {}, listing: { title: "Guitarra", slug: "guitarra", price_pen: 100 }, store: null, transaction: null, search_alert: null };
  const calls = [];
  const client = { rpc: async (name, args) => {
    calls.push([name, args]);
    if (name === "claim_marketplace_email_deliveries") return { data: [payload], error: null };
    if (name === "prepare_daily_search_alert_emails") return { data: 2, error: null };
    if (name === "fail_marketplace_email_delivery") return { data: "retry", error: null };
    return { data: true, error: null };
  } };
  const marketplace = load("lib/email/marketplace-email.ts", {
    "server-only": {},
    "@/lib/email/provider": { createMarketplaceEmailProvider: () => null, MarketplaceEmailProviderError: providerError },
    "@/lib/email/templates": { parseMarketplaceEmailPayload: (value) => value, renderMarketplaceEmail: () => ({ subject: "QA", html: "<p>QA</p>", text: "QA" }) },
    "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => null },
  });
  const success = await marketplace.processMarketplaceEmailBatch({ client, provider: { send: async () => ({ messageId: "provider-id" }) }, baseUrl: "https://laria.audio", workerId: "worker", limit: 1 });
  assert.deepEqual(success, { claimed: 1, sent: 1, retried: 0, failed: 0, invalid: 0 });
  assert.ok(calls.some(([name, args]) => name === "complete_marketplace_email_delivery" && args.p_delivery_id === "delivery-one"));
  calls.length = 0;
  const original = console.error;
  console.error = () => {};
  try {
    const failed = await marketplace.processMarketplaceEmailBatch({ client, provider: { send: async () => { throw new providerError(); } }, baseUrl: "https://laria.audio", workerId: "worker", limit: 1 });
    assert.equal(failed.retried, 1);
  } finally { console.error = original; }
  assert.ok(calls.some(([name, args]) => name === "fail_marketplace_email_delivery" && args.p_retryable === true && args.p_failure_category === "transport"));
  calls.length = 0;
  assert.equal(await marketplace.prepareDueLimaDayDigests(client, new Date("2026-09-22T13:15:00Z")), 14);
  assert.equal(calls.length, 7);
  assert.equal(calls[0][1].p_digest_date, "2026-09-21");
  assert.equal(calls[6][1].p_digest_date, "2026-09-15");
  calls.length = 0;
  assert.equal(await marketplace.prepareDueLimaDayDigests(client, new Date("2026-09-22T12:59:00Z")), 0);
  assert.equal(calls.length, 0);
});

test("alert API binds ownership to session RPCs", async () => {
  const rpcCalls = [];
  const client = { auth: { getUser: async () => ({ data: { user: { id: "actual-user" } } }) }, rpc: async (name, args) => { rpcCalls.push([name, args]); return { data: { id: "alert" }, error: null }; } };
  const route = load("app/api/alerts/route.ts", {
    "next/server": { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } }) } },
    "@/lib/marketplace-events-server": { sameOriginEventRequest: () => true },
    "@/lib/search-alerts": { searchAlertFiltersAsJson: (value) => value },
    "@/lib/supabase/server-client": { getSupabaseServerClient: async () => client },
  });
  const response = await route.POST(new Request("http://localhost/api/alerts", { method: "POST", body: JSON.stringify({ action: "create", filters: { category: "guitars" }, frequency: "immediate", user_id: "forged", recipient: "evil@example.invalid" }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(rpcCalls[0], ["create_saved_search_alert", { p_filters: { category: "guitars" }, p_frequency: "immediate" }]);
});

test("protected manual worker rejects untrusted callers and accepts only CRON_SECRET", async () => {
  let prepared = 0;
  let processed = 0;
  const route = load("app/api/internal/email/process/route.ts", {
    "next/server": { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } }) } },
    "@/lib/email/marketplace-email": {
      prepareDueLimaDayDigests: async () => { prepared += 1; return 2; },
      processMarketplaceEmailBatch: async () => { processed += 1; return { claimed: 0, sent: 0, retried: 0, failed: 0, invalid: 0 }; },
    },
    "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => ({ rpc: async () => ({ data: null, error: null }) }) },
  });
  const before = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "local-scheduler-secret";
  try {
    assert.equal((await route.GET(new Request("http://localhost/api/internal/email/process"))).status, 401);
    assert.equal((await route.GET(new Request("http://localhost/api/internal/email/process", { headers: { Authorization: "Bearer ordinary-user-token" } }))).status, 401);
    const response = await route.GET(new Request("http://localhost/api/internal/email/process", { headers: { Authorization: "Bearer local-scheduler-secret" } }));
    assert.equal(response.status, 200);
    assert.equal(prepared, 1);
    assert.equal(processed, 1);
  } finally {
    if (before === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = before;
  }
  const source = fs.readFileSync("app/api/internal/email/process/route.ts", "utf8");
  assert.match(source, /CRON_SECRET/);
  assert.match(source, /timingSafeEqual/);
  assert.match(source, /Authorization|authorization/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY.*NextResponse/);
  assert.equal(fs.existsSync("vercel.json"), false, "pre-go-live Hobby release must not register an unsupported frequent cron");
});

test("Sprint 7 migration is prospective, indexed, private and database-deduplicated", () => {
  const sql = fs.readFileSync("supabase/migrations/20260921120000_sprint_7_marketplace_email_alerts.sql", "utf8");
  assert.match(sql, /saved_search_alerts_active_identity_idx/);
  assert.match(sql, /saved_search_alerts_match_candidates_idx/);
  assert.match(sql, /unique\(alert_id, listing_id\)/);
  assert.match(sql, /listing_alert_publications/);
  assert.match(sql, /Baseline the catalog before enabling transition capture/);
  assert.match(sql, /search_immediate:' \|\| alert_record\.id/);
  assert.match(sql, /search_daily:' \|\| alert_record\.id/);
  assert.match(sql, /for update skip locked/);
  assert.match(sql, /attempt_count between 0 and 5/);
  assert.match(sql, /interval '5 minutes'/);
  assert.match(sql, /interval '8 hours'/);
  assert.match(sql, /auth\.role\(\) is distinct from 'service_role'/);
  assert.match(sql, /America\/Lima/);
  assert.match(sql, /insert into laria_private\.listing_alert_publications[\s\S]*select listing\.id, coalesce\(listing\.published_at, listing\.created_at, clock_timestamp\(\)\)[\s\S]*from public\.listings listing/);
  assert.doesNotMatch(sql, /Baseline the catalog[\s\S]*insert into laria_private\.search_alert_matches/);
});
