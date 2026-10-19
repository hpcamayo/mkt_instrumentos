// Effortless Laria, accounts batch (docs/ux-effortless/accounts.md).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("fix-01: Peruvian mobiles typed without +51 are stored and linked with the country code", () => {
  const { normalizePeruPhone, isValidWhatsAppPhone, formatPhoneForDisplay, buildWhatsAppHref } = require("@/lib/phone");
  assert.equal(normalizePeruPhone("987 654 321"), "51987654321");
  assert.equal(normalizePeruPhone("+51 987-654-321"), "51987654321");
  assert.equal(normalizePeruPhone("0051987654321"), "51987654321");
  assert.equal(normalizePeruPhone("+1 415 555 0100"), "14155550100");
  assert.equal(normalizePeruPhone("812345678"), "812345678");
  assert.equal(isValidWhatsAppPhone("987654321"), true);
  assert.equal(isValidWhatsAppPhone("812345678"), false, "nine digits that are not a mobile cannot open WhatsApp");
  assert.equal(formatPhoneForDisplay("51987654321"), "+51 987 654 321");
  assert.equal(formatPhoneForDisplay("987654321"), "+51 987 654 321");
  assert.equal(formatPhoneForDisplay("14155550100"), "+14155550100");
  assert.equal(buildWhatsAppHref("987 654 321", "Hola"), "https://wa.me/51987654321?text=Hola");
  const { normalizeProfilePhone } = require("@/lib/auth/profile");
  assert.equal(normalizeProfilePhone("987 654 321"), "51987654321");
  assert.equal(normalizeProfilePhone("12345"), null);
  // The database applies the same rule to every writer and fixes stored numbers.
  const migration = source("supabase/migrations/20261103120000_ux_phone_normalization.sql");
  for (const trigger of ["profiles_normalize_phone", "listings_normalize_whatsapp_phone", "stores_normalize_whatsapp_phone"]) assert.match(migration, new RegExp(`create trigger ${trigger}`));
  assert.ok("listings_normalize_whatsapp_phone" < "listings_protect_admin_fields", "normalizes before the protected-field check");
});

test("fix-01 / auth-03: PhoneInput shows the +51 prefix and the number buyers will see", () => {
  const { PhoneInput } = require("@/components/ui/phone-input");
  const empty = renderToStaticMarkup(React.createElement(PhoneInput, { name: "phone", id: "p" }));
  assert.match(empty, /\+51/);
  assert.match(empty, /type="tel"/);
  assert.match(empty, /inputMode="tel"|inputmode="tel"/i);
  assert.doesNotMatch(empty, /Así te contactarán/);
  const filled = renderToStaticMarkup(React.createElement(PhoneInput, { name: "phone", id: "p", defaultValue: "987654321" }));
  assert.match(filled, /Así te contactarán: <strong[^>]*>\+51 987 654 321<\/strong>/);
  assert.match(filled, /href="https:\/\/wa\.me\/51987654321"/);
  assert.match(filled, /Probar en WhatsApp/);
  // The sign-up form no longer asks for WhatsApp (auth-02); the profile and the invitation forms do.
  for (const file of ["components/profile-edit-form.tsx", "components/invite-profile-setup-form.tsx"]) {
    assert.match(source(file), /<PhoneInput name="phone"/, file);
  }
});

test("auth-03: PriceInput groups thousands and the server reads the grouped text", () => {
  const { formatPriceDigits, parseWholeSolPrice } = require("@/lib/price");
  assert.equal(formatPriceDigits("1250"), "1,250");
  assert.equal(formatPriceDigits("S/ 0012500"), "12,500");
  assert.equal(parseWholeSolPrice("1,250"), 1250);
  assert.equal(parseWholeSolPrice("S/ 1,250"), 1250);
  assert.equal(parseWholeSolPrice("1250"), 1250);
  assert.equal(parseWholeSolPrice("12,50"), null);
  assert.equal(parseWholeSolPrice("1250.50"), null);
  const { PriceInput } = require("@/components/ui/price-input");
  const html = renderToStaticMarkup(React.createElement(PriceInput, { name: "price_pen", defaultValue: 2500 }));
  assert.match(html, /S\//);
  assert.match(html, /value="2,500"/);
  assert.match(html, /inputMode="numeric"|inputmode="numeric"/i);
});

test("fix-08: an unconfirmed e-mail says so and offers to resend the link", () => {
  const { isEmailNotConfirmedError } = require("@/lib/auth/confirmation");
  assert.equal(isEmailNotConfirmedError({ code: "email_not_confirmed" }), true);
  assert.equal(isEmailNotConfirmedError({ message: "Email not confirmed" }), true);
  assert.equal(isEmailNotConfirmedError({ code: "invalid_credentials" }), false);
  assert.match(source("app/api/auth/login/route.ts"), /code: EMAIL_NOT_CONFIRMED/);
  const resend = source("app/api/auth/resend-confirmation/route.ts");
  assert.match(resend, /auth\.resend\(\{\s*type: "signup"/);
  assert.match(resend, /return NextResponse\.json\(\{ ok: true \}\);/, "same answer for every address");
  assert.match(source("components/login-form.tsx"), /<ResendConfirmation email=\{unconfirmedEmail\}/);
  assert.match(source("components/seller-signup-form.tsx"), /<ResendConfirmation email=\{sentTo\}/);
  assert.match(source("components/auth/resend-confirmation.tsx"), /RESEND_CONFIRMATION_WAIT_SECONDS/);
});

// Server modules import "server-only", which Next provides at build time; here it is an empty module.
{
  const Module = require("node:module");
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function resolveServerOnly(request, ...rest) {
    return request === "server-only" ? "server-only-stub" : resolve.call(this, request, ...rest);
  };
  require.cache["server-only-stub"] = { id: "server-only-stub", filename: "server-only-stub", loaded: true, exports: {} };
}

const browserStorage = () => {
  const store = new Map();
  global.window = {
    localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key) },
    dispatchEvent: () => true,
  };
  global.Event = global.Event ?? class { constructor(type) { this.type = type; } };
  return store;
};

test("big-04 / save-01 / save-06: device saves, a pending intent used once, and repeated searches", () => {
  browserStorage();
  const saves = require("@/lib/device-saves");
  const id = "6b1f4f8e-1111-4c43-9d49-1d3f64f9c2aa";
  saves.setDeviceFavorite(id, true);
  assert.equal(saves.isDeviceFavorite(id), true);
  saves.setDeviceFavorite("../etc", true);
  assert.equal(saves.getDeviceFavorites().length, 1);
  saves.setDeviceFavorite(id, false);
  assert.equal(saves.isDeviceFavorite(id), false);
  for (let index = 0; index < 40; index += 1) saves.recordViewed(`guitarra-${index}`);
  assert.equal(saves.getViewed().length, saves.MAX_VIEWED);
  assert.equal(saves.getViewed()[0].slug, "guitarra-39");
  saves.savePendingIntent({ kind: "report", path: "/instrumentos/a", targetType: "listing", targetId: id });
  assert.equal(saves.takePendingIntent("alert", "/instrumentos/a"), null, "another kind does not take it");
  assert.equal(saves.takePendingIntent("report", "/instrumentos/a", (intent) => intent.targetType === "review"), null, "another target leaves it");
  assert.equal(saves.takePendingIntent("report", "/instrumentos/a").targetId, id);
  assert.equal(saves.takePendingIntent("report", "/instrumentos/a"), null, "used once");
  const start = Date.UTC(2026, 9, 19, 12);
  assert.equal(saves.recordSearch("/listados?brand=Fender", start), 1);
  assert.equal(saves.recordSearch("/listados?brand=Fender", start + 60_000), 1, "a refresh is the same occasion");
  saves.recordSearch("/listados?brand=Gibson", start + 120_000);
  assert.equal(saves.recordSearch("/listados?brand=Fender", start + 180_000), 2, "back after another search is a second occasion");
  saves.dismissAlertPrompt("/listados?brand=Fender");
  assert.equal(saves.alertPromptDismissed("/listados?brand=Fender"), true);
  assert.equal(saves.parsePreviousVisit("abc"), null);
  assert.equal(saves.parsePreviousVisit(String(start)).getTime(), start);
  delete global.window;
});

test("save-05: alerts save several values, have a name and say when they last matched", () => {
  const alerts = require("@/lib/search-alerts");
  const filters = { category: "guitars", location: ["Lima", "Arequipa"], condition: "Nuevo" };
  assert.equal(alerts.searchAlertPath(filters), "/listados?category=guitars&location=Lima&location=Arequipa&condition=Nuevo");
  assert.match(alerts.searchAlertSummary(filters), /Lima o Arequipa/);
  assert.deepEqual(alerts.parseSearchAlertFilters(filters), filters);
  assert.equal(alerts.parseSearchAlertFilters({ location: [] }), null);
  assert.equal(alerts.parseSearchAlertFilters({ location: [1] }), null);
  assert.equal(alerts.searchAlertTitle({ name: " Strato para mi hijo ", search_filters: filters }), "Strato para mi hijo");
  assert.match(alerts.searchAlertTitle({ name: null, search_filters: filters }), /Guitarras/);
  const now = Date.parse("2026-10-19T12:00:00Z");
  assert.equal(alerts.searchAlertActivity({ match_count: 7, last_match_at: "2026-10-17T12:00:00Z" }, now), "Última coincidencia hace 2 días · 7 en total");
  assert.equal(alerts.searchAlertActivity({ match_count: 0, last_match_at: null }, now), "Sin coincidencias todavía");
  const parsed = alerts.parseSavedSearchAlerts([{ id: "71000000-0000-4000-8000-000000000002", name: "Mi alerta", match_count: 3, new_count: 1, last_match_at: "2026-10-17T12:00:00Z", search_filters: filters, frequency: "daily", status: "active", active_since: "2026-10-01T12:00:00Z", created_at: "2026-10-01T12:00:00Z" }]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].new_count, 1);
  // Daily is offered first, in the creation panel and in the editor.
  const panel = source("components/create-search-alert.tsx");
  assert.match(panel, /useState<SearchAlertFrequency>\("daily"\)/);
  assert.ok(panel.indexOf('label="Resumen diario"') < panel.indexOf('label="Al instante"'));
  assert.match(source("components/saved-search-alerts.tsx"), /action: "update"/);
});

test("save-07: one-click links are signed, expire, and cannot be changed", () => {
  const before = process.env.EMAIL_LINK_SECRET;
  process.env.EMAIL_LINK_SECRET = "a-local-test-secret-that-is-long-enough-for-hmac";
  try {
    const links = require("@/lib/email/links");
    const user = "11111111-1111-4111-8111-111111111111";
    const alert = "22222222-2222-4222-8222-222222222222";
    const token = links.createEmailLinkToken({ user, action: "pause_alert", alert }, 1000);
    assert.deepEqual(links.readEmailLinkToken(token, 2000), { user, action: "pause_alert", alert, expires: 1000 + 180 * 24 * 60 * 60 * 1000 });
    assert.equal(links.readEmailLinkToken(token, 1000 + 181 * 24 * 60 * 60 * 1000), null, "expired");
    const [body, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "33333333-3333-4333-8333-333333333333", a: "pause_alert", l: alert, e: 9e15 })).toString("base64url");
    assert.equal(links.readEmailLinkToken(`${forged}.${signature}`, 2000), null, "another person's link");
    assert.equal(links.readEmailLinkToken(`${body}.x${signature.slice(1)}`, 2000), null);
    assert.equal(links.createEmailLinkToken({ user, action: "pause_alert" }), null, "pausing needs the alert");
    assert.equal(links.createEmailLinkToken({ user: "nobody", action: "no_price_drops" }), null);
  } finally {
    if (before === undefined) delete process.env.EMAIL_LINK_SECRET;
    else process.env.EMAIL_LINK_SECRET = before;
  }
});

test("save-07: alert, price-drop and weekly e-mails carry photos, prices, a reason and the unsubscribe header", () => {
  const before = process.env.EMAIL_LINK_SECRET;
  process.env.EMAIL_LINK_SECRET = "a-local-test-secret-that-is-long-enough-for-hmac";
  try {
    const { renderMarketplaceEmail, parseMarketplaceEmailPayload } = require("@/lib/email/templates");
    const { emailLinks, emailLinkAction, prepareDueWeeklyFollowEmails } = require("@/lib/email/marketplace-email");
    const base = { delivery_id: "d", attempt_count: 1, recipient_email: "qa@example.invalid", recipient_name: null, recipient_user_id: "11111111-1111-4111-8111-111111111111", store: null, transaction: null };
    const drop = parseMarketplaceEmailPayload({ ...base, event_type: "listing_price_drop", context: { old_price_pen: 2500, new_price_pen: 2100 }, listing: { title: "Fender Stratocaster", slug: "fender-strat", price_pen: 2100, image_url: "https://cdn.example.invalid/strat.jpg" }, search_alert: null });
    assert.ok(drop);
    const extras = emailLinks(drop, "https://laria.audio");
    assert.equal(extras.links[0].label, "No más bajas de precio");
    assert.match(extras.headers["List-Unsubscribe"], /^<https:\/\/laria\.audio\/api\/email\/unsubscribe\?token=/);
    assert.equal(extras.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    const rendered = renderMarketplaceEmail(drop, "https://laria.audio", extras.links);
    assert.match(rendered.html, /<img src="https:\/\/cdn\.example\.invalid\/strat\.jpg"/);
    assert.match(rendered.html, /line-through">S\/\s2,500<\/span> S\/\s2,100/);
    assert.match(rendered.html, /Recibes este correo porque guardaste esta publicación en favoritos/);
    assert.match(rendered.html, /No más bajas de precio/);
    assert.match(rendered.html, /\/mi-cuenta\/correos/);
    assert.doesNotMatch(rendered.html, /correo transaccional/);
    const daily = parseMarketplaceEmailPayload({ ...base, event_type: "search_alert_daily", context: {}, listing: null, search_alert: { id: "22222222-2222-4222-8222-222222222222", name: "Strato", filters: { brand: "Fender" }, frequency: "daily", matches: [{ title: "Strato 1", slug: "s1", price_pen: 1000, image_url: "http://insecure.invalid/a.jpg" }] } });
    assert.deepEqual(emailLinkAction(daily), { action: "pause_alert", alert: "22222222-2222-4222-8222-222222222222" });
    const dailyHtml = renderMarketplaceEmail(daily, "https://laria.audio", emailLinks(daily, "https://laria.audio").links).html;
    assert.match(dailyHtml, /«Strato»/);
    assert.match(dailyHtml, /Pausar esta alerta/);
    assert.doesNotMatch(dailyHtml, /insecure\.invalid/, "only https photos");
    const weekly = parseMarketplaceEmailPayload({ ...base, event_type: "follow_weekly", context: { week_start: "2026-10-19", items: [{ title: "Bajo", slug: "bajo", price_pen: 900, image_url: null, reason_label: "Fender" }] }, listing: null, search_alert: null });
    const weeklyText = renderMarketplaceEmail(weekly, "https://laria.audio").text;
    assert.match(weeklyText, /Bajo · S\/\s900 · De Fender/);
    const approved = parseMarketplaceEmailPayload({ ...base, event_type: "listing_approved", context: {}, listing: { title: "Bajo", slug: "bajo", price_pen: 900 }, search_alert: null });
    assert.equal(emailLinks(approved, "https://laria.audio").headers, undefined, "transactional mail has no unsubscribe");
    assert.match(renderMarketplaceEmail(approved, "https://laria.audio").html, /correo transaccional/);
    // The weekly digest is prepared for the Monday that last reached 8:00 in Lima.
    const calls = [];
    const client = { rpc: async (name, args) => { calls.push(args.p_week_start); return { data: 1, error: null }; } };
    return Promise.all([
      prepareDueWeeklyFollowEmails(client, new Date("2026-10-19T13:30:00Z")),
      prepareDueWeeklyFollowEmails(client, new Date("2026-10-19T12:30:00Z")),
      prepareDueWeeklyFollowEmails(client, new Date("2026-10-22T20:00:00Z")),
    ]).then(() => assert.deepEqual(calls, ["2026-10-19", "2026-10-12", "2026-10-19"]));
  } finally {
    if (before === undefined) delete process.env.EMAIL_LINK_SECRET;
    else process.env.EMAIL_LINK_SECRET = before;
  }
});

test("auth-01 / auth-02 / save-02 / save-03: passwords, a short sign-up, the way back and a page that says why", () => {
  const { PasswordInput } = require("@/components/ui/password-input");
  const html = renderToStaticMarkup(React.createElement(PasswordInput, { id: "clave", name: "password" }));
  assert.match(html, /type="password"/);
  assert.match(html, /aria-label="Mostrar contraseña"/);
  assert.match(html, /aria-pressed="false"/);
  const { PASSWORD_MIN_LENGTH, getPasswordValidationMessage } = require("@/lib/auth/password");
  assert.equal(PASSWORD_MIN_LENGTH, 8);
  assert.equal(getPasswordValidationMessage("1234567", "1234567"), "Usa al menos 8 caracteres.");
  for (const file of ["components/login-form.tsx", "components/seller-signup-form.tsx", "components/password-form.tsx"]) assert.match(source(file), /<PasswordInput/, file);
  assert.doesNotMatch(source("components/seller-signup-form.tsx"), /minLength=\{6\}|PhoneInput|LocationFields/);
  assert.match(source("components/login-form.tsx"), /¿Prefieres un enlace\?/);
  const { profileFieldErrors } = require("@/lib/form-validation");
  assert.deepEqual(profileFieldErrors({ fullName: "Ana", phone: "", city: "", region: "" }, true), {});
  assert.deepEqual(Object.keys(profileFieldErrors({ fullName: "Ana", phone: "12", city: "", region: "" }, true)), ["phone"]);
  assert.deepEqual(Object.keys(profileFieldErrors({ fullName: "Ana", phone: "", city: "", region: "" })).sort(), ["city", "phone", "region"]);
  const { getSafeAuthRedirect } = require("@/lib/auth/redirects");
  assert.equal(getSafeAuthRedirect("/listados?brand=Fender"), "/listados?brand=Fender");
  assert.equal(getSafeAuthRedirect("/\\evil.example"), "/mi-cuenta");
  assert.equal(getSafeAuthRedirect("//evil.example"), "/mi-cuenta");
  assert.match(source("middleware.ts"), /getLoginPath\(request\.nextUrl\.pathname \+ request\.nextUrl\.search\)/);
  const { loginReason } = require("@/lib/auth/login-reason");
  assert.equal(loginReason("favorito", "Fender Stratocaster").title, "Ingresa para guardar «Fender Stratocaster»");
  assert.equal(loginReason("alerta", null).title, "Ingresa para crear tu alerta");
  assert.equal(loginReason(null, null).title, "Ingresar");
});

test("save-10 / save-12: notifications name the listing, and follows explain themselves", () => {
  const list = source("components/notifications-list.tsx");
  assert.match(list, /mark_all_notifications_read/);
  assert.match(list, /listing_alert_match: "Nueva coincidencia de tu alerta"/);
  assert.doesNotMatch(source("app/mi-cuenta/notificaciones/page.tsx"), /\.limit\(100\)/);
  const follows = require("@/lib/follows");
  assert.equal(follows.arrivalReason({ reason_label: "Fender" }), "Porque sigues Fender");
  assert.equal(follows.parseFollowedArrivals([{ id: "a", slug: "b", title: "c", price_pen: 1, reason: "brand", reason_label: "Fender", image_url: null }]).length, 1);
  assert.equal(follows.parseFollowedArrivals([{ id: "a", slug: "b", title: "c", price_pen: 1, reason: "spam" }]).length, 0);
  assert.equal(follows.followLabel({ kind: "store", store_name: "Musical Lima", brand: null }), "Musical Lima");
});
