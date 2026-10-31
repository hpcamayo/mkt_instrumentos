// Selling tools batch of the feature ideas (docs/feature-ideas/selling-tools.md): Mi equipo (sell-01), offers from
// stores (sell-02), consignment (sell-03), price steps (sell-04), private offers (sell-05), gear reminders (buy-06) and
// part payment (run-04). The database side is tests/feat-selling-tools.sql.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

// Server modules import "server-only", which Next provides at build time; here it is an empty module.
{
  const Module = require("node:module");
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function resolveServerOnly(request, ...rest) {
    return request === "server-only" ? "server-only-stub" : resolve.call(this, request, ...rest);
  };
  require.cache["server-only-stub"] = { id: "server-only-stub", filename: "server-only-stub", loaded: true, exports: {} };
}

const source = (file) => fs.readFileSync(file, "utf8");
const selling = require("@/lib/selling-tools");

test("sell-04: the schedule shown before saving is the one the job follows", () => {
  // Same rounding as public.listing_price_step_next: whole soles, down, never under the floor.
  assert.equal(selling.priceStepNext(2000, 1700, 5), 1900);
  assert.equal(selling.priceStepNext(1999, 1700, 5), 1899);
  assert.equal(selling.priceStepNext(1750, 1700, 10), 1700);
  assert.deepEqual(selling.priceStepSchedule(2000, 1700, 5), [1900, 1805, 1714, 1700]);
  assert.deepEqual(selling.priceStepSchedule(2000, 2000, 5), []);
  assert.equal(selling.priceStepSchedule(100000, 20000, 5, 8).length, 8);
  const sql = source("supabase/migrations/20261204120400_feat_price_steps.sql");
  assert.match(sql, /greatest\(p_floor, floor\(p_price::numeric \* \(100 - p_percent\) \/ 100\)::integer\)/);
  assert.equal(selling.priceStepsStatusLabel({ status: "finished", finished_reason: "floor" }), "Llegó a tu precio mínimo");
});

test("sell-01 and buy-06: reminders fit the instrument and warranties say when they end", () => {
  assert.equal(selling.reminderKind("electric_guitar"), "strings");
  assert.equal(selling.reminderKind("drums"), "drumheads");
  assert.equal(selling.reminderKind("winds"), "reeds");
  assert.equal(selling.reminderKind("synthesizer"), null);
  assert.equal(selling.warrantyStatus(null, "2026-10-26"), null);
  assert.equal(selling.warrantyStatus("2026-10-01", "2026-10-26").tone, "muted");
  assert.equal(selling.warrantyStatus("2026-11-10", "2026-10-26").tone, "warning");
  assert.equal(selling.warrantyStatus("2027-10-26", "2026-10-26").tone, "neutral");
});

test("sell-02: trade photos live in the person's folder for that request, jpg only", () => {
  const user = "11111111-1111-4111-8111-111111111111";
  const request = "22222222-2222-4222-8222-222222222222";
  const path = selling.tradePhotoPath(user, request, 3);
  assert.equal(path, `${user}/${request}/3.jpg`);
  assert.ok(selling.TRADE_PHOTO_PATH.test(path));
  for (const bad of [`${user}/${request}/7.jpg`, `${user}/${request}/1.png`, `../${request}/1.jpg`, `${user}/${request}/1.jpg/..`]) {
    assert.equal(selling.TRADE_PHOTO_PATH.test(bad), false, bad);
  }
  assert.equal(selling.tradePhotoUrl(path), `/api/trade-photos/${path}`);
  // The route checks the viewer as themselves before the admin client reads the private bucket.
  const route = source("app/api/trade-photos/[...path]/route.ts");
  assert.ok(route.indexOf('rpc("can_view_trade_photo"') < route.indexOf('storage.from("trade-photos").download'));
  assert.match(route, /"Cache-Control": "private, no-store"/);
  assert.match(route, /if \(!TRADE_PHOTO_PATH\.test\(path\)\) return missing\(\);/);
});

test("sell-05: the WhatsApp link quotes the private offer and never leaves wa.me", () => {
  const offer = { price_pen: 1600, valid_until: "2026-10-30T04:59:00Z" };
  const message = selling.privateOfferMessage("Fender Telecaster", offer);
  assert.match(message, /^Hola, recibí tu oferta en Laria por “Fender Telecaster”: S\/\s1,600 hasta el /);
  const href = selling.withWhatsAppMessage("https://wa.me/51999888777?text=Hola", message);
  assert.equal(new URL(href).searchParams.get("text"), message);
  assert.equal(selling.withWhatsAppMessage("https://example.invalid/?text=a", message), "https://example.invalid/?text=a");
  assert.equal(selling.withWhatsAppMessage("not a url", message), "not a url");
});

test("database errors reach people as their Spanish sentence, anything else as the caller's", () => {
  assert.equal(selling.sellingErrorMessage({ message: "TRADE_NO_STORES: Todavía no hay tiendas que compren esto en tu región." }, "x"), "Todavía no hay tiendas que compren esto en tu región.");
  assert.equal(selling.sellingErrorMessage({ message: "permission denied for table gear_items" }, "No pudimos guardar."), "No pudimos guardar.");
  assert.equal(selling.sellingErrorCode({ message: "GEAR_LIMIT: Llegaste al límite." }), "GEAR_LIMIT");
});

test("Mis publicaciones: tags and the selling tools link", () => {
  assert.deepEqual(selling.sellingToolTags({ price_steps: "active", private_offer: "active", consignment: null, part_payment: null, trade_requests: 2, saves: 3 }),
    ["Bajada automática", "Oferta enviada", "2 pedidos de parte de pago"]);
  assert.deepEqual(selling.sellingToolTags(undefined), []);
  const lib = require("@/lib/my-listings");
  const actions = (status, extra = {}) => lib.rowActions({ status, hidden_source: null, inventoryItemId: null, ...extra });
  assert.equal(actions("approved").tools, true);
  assert.equal(actions("hidden", { hidden_source: "owner" }).tools, true);
  for (const status of ["draft", "rejected", "sold", "archived"]) assert.equal(actions(status).tools, false, status);
  assert.equal(actions("hidden", { hidden_source: "admin" }).tools, false);
  assert.match(source("components/listing-management-table.tsx"), /href=\{sellingToolsPath\(listing\.id\)\}[^>]*>Herramientas de venta</);
});

test("store opt-ins start off: nothing is pre-ticked", () => {
  assert.deepEqual(selling.EMPTY_TRADE_SETTINGS, { buys_used: false, buy_categories: [], consignment: false, part_payment: false, consumables: [], note: null });
  const sql = source("supabase/migrations/20261204120200_feat_trade_offers.sql");
  for (const column of ["buys_used", "consignment", "part_payment"]) assert.match(sql, new RegExp(`${column} boolean not null default false`));
});

test("account navigation: Mi equipo for a Particular, Ofertas for a store", () => {
  const { getAccountNavigationItems, accountItemIsActive } = require("@/lib/account-navigation");
  const particular = getAccountNavigationItems("seller", false);
  const gear = particular.find((item) => item.label === "Mi equipo");
  assert.equal(gear.href, "/mi-cuenta/equipo");
  assert.equal(accountItemIsActive("/mi-cuenta/equipo/ofertas/nueva", gear), true);
  const store = getAccountNavigationItems("store_owner", true);
  const offers = store.find((item) => item.label === "Ofertas");
  assert.equal(offers.href, "/mi-cuenta/tienda/ofertas");
  assert.equal(accountItemIsActive("/mi-cuenta/tienda/ofertas/ajustes", offers), true);
  assert.equal(getAccountNavigationItems("store_owner", false).some((item) => item.label === "Ofertas"), false);
  assert.equal(store.some((item) => item.label === "Mi equipo"), false);
});

test("notifications: each selling tools notice has a name and opens its page", () => {
  const { notificationLabel, notificationHref, DEFAULT_NOTIFICATION_LABEL } = require("@/lib/notifications");
  const listing = "33333333-3333-4333-8333-333333333333";
  const store = "44444444-4444-4444-8444-444444444444";
  const cases = [
    [{ event_type: "gear_trade_offer", listing_id: null, store_id: null }, "/mi-cuenta/equipo/ofertas"],
    [{ event_type: "gear_trade_update", listing_id: null, store_id: null }, "/mi-cuenta/equipo/ofertas"],
    [{ event_type: "store_trade_request", listing_id: null, store_id: store }, "/mi-cuenta/tienda/ofertas"],
    [{ event_type: "store_trade_update", listing_id: listing, store_id: store }, "/mi-cuenta/tienda/ofertas"],
    [{ event_type: "gear_reminder_due", listing_id: null, store_id: null }, "/mi-cuenta/equipo"],
    [{ event_type: "listing_price_step", listing_id: listing, store_id: null }, `/mi-cuenta/publicaciones/${listing}/herramientas`],
    [{ event_type: "listing_private_offer", listing_id: listing, store_id: null }, `/instrumentos/${listing}`],
    [{ event_type: "listing_consignment_update", listing_id: listing, store_id: null }, "/mi-cuenta/equipo"],
    [{ event_type: "listing_consignment_update", listing_id: listing, store_id: store }, `/mi-cuenta/publicaciones/${listing}/herramientas`],
  ];
  for (const [notification, href] of cases) {
    assert.equal(notificationHref(notification), href, notification.event_type);
    assert.notEqual(notificationLabel(notification.event_type), DEFAULT_NOTIFICATION_LABEL, notification.event_type);
  }
  // Every type the database accepts has a label here.
  const sql = source("supabase/migrations/20261204120000_feat_selling_registry.sql");
  for (const type of ["listing_price_step", "listing_private_offer", "listing_consignment_update", "store_trade_request", "store_trade_update", "gear_trade_offer", "gear_trade_update", "gear_reminder_due"]) {
    assert.match(sql, new RegExp(`'${type}'`), type);
  }
});

test("e-mails: every selling tools type renders, says Laria is not in the payment, and the optional ones stop in one click", () => {
  const before = process.env.EMAIL_LINK_SECRET;
  process.env.EMAIL_LINK_SECRET = "a-local-test-secret-that-is-long-enough-for-hmac";
  try {
    const { renderMarketplaceEmail, parseMarketplaceEmailPayload, OPTIONAL_EMAIL_TYPES } = require("@/lib/email/templates");
    const { emailLinks, emailLinkAction } = require("@/lib/email/marketplace-email");
    const links = require("@/lib/email/links");
    const base = { delivery_id: "d", attempt_count: 1, recipient_email: "qa@example.invalid", recipient_name: null, recipient_user_id: "11111111-1111-4111-8111-111111111111", transaction: null, search_alert: null };
    const listing = { title: "Fender Telecaster", slug: "fender-telecaster", price_pen: 1750, image_url: null };
    const store = { name: "Tienda Uno", slug: "tienda-uno" };
    const request = "22222222-2222-4222-8222-222222222222";
    const payloads = {
      store_trade_request: { listing: null, store, context: { selling: { kind: "sell", title: "Fender Telecaster", place: "Lima, Lima", request_id: request, offers_until: "2026-10-27T20:00:00Z" } } },
      store_trade_update: { listing: null, store, context: { selling: { kind: "sell", title: "Fender Telecaster", amount_pen: 1200, request_id: request } } },
      gear_trade_offer: { listing: null, store, context: { selling: { kind: "part_payment", title: "Ibanez SR300", amount_pen: 800, request_id: request, decide_until: "2026-11-02T20:00:00Z" } } },
      listing_consignment_update: { listing, store, context: { selling: { outcome: "sold", title: "Fender Telecaster" } } },
      listing_private_offer: { listing, store: null, context: { selling: { price_pen: 1600, public_price_pen: 1750, valid_until: "2026-10-30T04:59:00Z", message: "Solo esta semana" } } },
      gear_reminder_due: { listing: null, store: null, context: { selling: { kind: "strings", title: "Fender Telecaster", months: 3, gear_id: request, stores: [{ name: "Tienda Uno", slug: "tienda-uno", city: "Lima", district: "Miraflores", is_verified: true }] } } },
    };
    const paths = {
      store_trade_request: `/mi-cuenta/tienda/ofertas/${request}`,
      store_trade_update: `/mi-cuenta/tienda/ofertas/${request}`,
      gear_trade_offer: `/mi-cuenta/equipo/ofertas/${request}`,
      listing_consignment_update: "/mi-cuenta/equipo",
      listing_private_offer: "/instrumentos/fender-telecaster",
      gear_reminder_due: `/mi-cuenta/equipo/${request}`,
    };
    for (const [type, extra] of Object.entries(payloads)) {
      const payload = parseMarketplaceEmailPayload({ ...base, event_type: type, ...extra });
      assert.ok(payload, type);
      const optional = OPTIONAL_EMAIL_TYPES.includes(type);
      const rendered = renderMarketplaceEmail(payload, "https://laria.audio", emailLinks(payload, "https://laria.audio").links);
      assert.equal(rendered.destination, `https://laria.audio${paths[type]}`, type);
      assert.match(rendered.text, /Laria no procesa pagos/, type);
      assert.doesNotMatch(rendered.subject + rendered.text, /!/, type);
      assert.equal(/correo transaccional/.test(rendered.text), !optional, type);
    }
    assert.deepEqual(emailLinkAction(parseMarketplaceEmailPayload({ ...base, event_type: "listing_private_offer", ...payloads.listing_private_offer })), { action: "no_price_drops" });
    const reminder = parseMarketplaceEmailPayload({ ...base, event_type: "gear_reminder_due", ...payloads.gear_reminder_due });
    assert.deepEqual(emailLinkAction(reminder), { action: "no_gear_reminders" });
    const reminderMail = renderMarketplaceEmail(reminder, "https://laria.audio", emailLinks(reminder, "https://laria.audio").links);
    assert.match(reminderMail.text, /No más recordatorios/);
    assert.match(reminderMail.text, /Tienda Uno · Miraflores, Lima · Tienda verificada/);
    assert.match(reminderMail.text, /activaste este recordatorio en Mi equipo/);
    const token = links.createEmailLinkToken({ user: base.recipient_user_id, action: "no_gear_reminders" }, 1000);
    assert.equal(links.readEmailLinkToken(token, 2000).action, "no_gear_reminders");
    // The unsubscribe route stops reminders with their own function; the shared one is not redefined.
    const route = source("app/api/email/unsubscribe/route.ts");
    assert.match(route, /payload\.action === "no_gear_reminders"[\s\S]*rpc\("stop_gear_reminders_by_link"/);
    for (const file of fs.readdirSync("supabase/migrations").filter((name) => name.startsWith("20261204"))) {
      assert.doesNotMatch(source(`supabase/migrations/${file}`), /function [\w.]*apply_email_link_action/, file);
    }
  } finally {
    if (before === undefined) delete process.env.EMAIL_LINK_SECRET;
    else process.env.EMAIL_LINK_SECRET = before;
  }
});

test("jobs: CRON_SECRET-protected, one database call each, and photo removal stays inside trade-photos", async () => {
  for (const job of ["price-steps", "gear-reminders", "trade-offers"]) {
    assert.match(source(`app/api/internal/jobs/${job}/route.ts`), new RegExp(`return runSellingJob\\(request, "${job}"\\);`));
  }
  const jobs = source("lib/selling-jobs.ts");
  assert.match(jobs, /timingSafeEqual/);
  assert.match(jobs, /TRADE_PHOTO_PATH\.test\(path\)/);
  const before = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const { runSellingJob } = require("@/lib/selling-jobs");
    const response = await runSellingJob(new Request("https://laria.audio/api/internal/jobs/price-steps", { headers: { authorization: "Bearer " } }), "price-steps");
    assert.equal(response.status, 401, "no secret configured, no job");
  } finally {
    if (before !== undefined) process.env.CRON_SECRET = before;
  }
});

test("guardrails: no money handled, no valuation, contact through the listing's WhatsApp", () => {
  const page = source("app/instrumentos/[slug]/page.tsx");
  assert.match(page, /<ListingSellingExtras listingId=\{listing\.id\} title=\{displayTitle\} contactHref=\{contactHref\}/);
  assert.match(source("components/offers/listing-selling-extras.tsx"), /<WhatsAppContactLink\s/);
  const gearFiles = fs.readdirSync("components/gear").map((name) => source(`components/gear/${name}`)).join("\n");
  assert.doesNotMatch(gearFiles, /valor estimado|vale aproximadamente|tasación/i, "Mi equipo shows no estimated values");
  for (const file of ["components/offers/trade-request-form.tsx", "components/offers/store-trade-offer.tsx", "components/offers/consignment-store-panel.tsx"]) {
    assert.match(source(file), /Laria no (interviene|procesa|cobra|recibe|compra)/, file);
  }
});
