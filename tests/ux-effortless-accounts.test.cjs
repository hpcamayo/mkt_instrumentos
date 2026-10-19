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
  for (const file of ["components/seller-signup-form.tsx", "components/profile-edit-form.tsx", "components/invite-profile-setup-form.tsx"]) {
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
