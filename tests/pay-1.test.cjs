// PAY-1 assisted commerce, Pilot A (docs/store-operations/pay-1.md): payment-method helpers, the purchase message, the
// pilot switch and the boundaries the routes and pages must keep. Database behavior is in tests/pay-1.sql.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const payments = require(path.resolve("lib/payment-methods.ts"));
const read = (file) => fs.readFileSync(file, "utf8");

function withPilot(value, run) {
  const previous = process.env.LARIA_ASSISTED_COMMERCE;
  if (value === undefined) delete process.env.LARIA_ASSISTED_COMMERCE;
  else process.env.LARIA_ASSISTED_COMMERCE = value;
  try { return run(); } finally {
    if (previous === undefined) delete process.env.LARIA_ASSISTED_COMMERCE;
    else process.env.LARIA_ASSISTED_COMMERCE = previous;
  }
}

test("the pilot is off unless the deployment sets LARIA_ASSISTED_COMMERCE=1", () => {
  assert.equal(withPilot(undefined, () => payments.assistedCommerceEnabled()), false);
  assert.equal(withPilot("true", () => payments.assistedCommerceEnabled()), false);
  assert.equal(withPilot("0", () => payments.assistedCommerceEnabled()), false);
  assert.equal(withPilot(" 1 ", () => payments.assistedCommerceEnabled()), true);
});

test("public method rows are read strictly and in the canonical order", () => {
  assert.deepEqual(payments.readPublicPaymentMethods(null), []);
  assert.deepEqual(
    payments.readPublicPaymentMethods([
      { method: "yape_plin", provider_label: "Yape" },
      { method: "bitcoin", provider_label: "X" },
      { method: "efectivo_al_recoger", provider_label: "" },
      "link_de_pago",
    ]),
    [{ method: "efectivo_al_recoger", provider_label: null }, { method: "yape_plin", provider_label: "Yape" }],
  );
  assert.equal(payments.paymentMethodText({ method: "yape_plin", provider_label: "Plin" }), "Yape o Plin (Plin)");
  assert.equal(payments.readPurchaseRequest({ methods: [], sku: "A" }), null, "no method, no purchase request");
  assert.deepEqual(payments.readPurchaseRequest({ methods: [{ method: "link_de_pago", provider_label: null }], sku: null }), {
    methods: [{ method: "link_de_pago", provider_label: null }],
    sku: null,
  });
});

test("the purchase message carries title, SKU, quantity and link, and never a payment link or amount", () => {
  const message = payments.buildPurchaseMessage({ title: 'Boss DS-1 "Distortion"', slug: "boss-ds-1" }, "STORE01-DS1");
  const lines = message.split("\n");
  assert.equal(lines[0], 'Hola, quiero comprar "Boss DS-1 "Distortion"" que vi en Laria.');
  assert.equal(lines[1], "SKU: STORE01-DS1");
  assert.equal(lines[2], "Cantidad: 1");
  assert.match(lines[3], /\/instrumentos\/boss-ds-1$/);
  assert.match(lines[4], /^¿Me confirmas la disponibilidad/);
  assert.doesNotMatch(message, /S\/ ?\d|pag(a|o) aquí/i);
  assert.equal((message.match(/https?:\/\//g) ?? []).length, 1, "the only link is the listing");
  assert.doesNotMatch(payments.buildPurchaseMessage({ title: "Sin SKU", slug: "sin-sku" }, null), /SKU:/);
  const url = payments.buildPurchaseWhatsAppUrl("+51 999 111 222", { title: "T", slug: "t" }, null);
  assert.match(url, /^https:\/\/wa\.me\/51999111222\?text=/);
  assert.equal(decodeURIComponent(url.split("?text=")[1]), payments.buildPurchaseMessage({ title: "T", slug: "t" }, null));
});

test("only the database's own Spanish messages reach the person", () => {
  assert.equal(payments.paymentErrorMessage({ message: "PAYMENT_HOLDER_REQUIRED: Indica el titular." }, "x"), "Indica el titular.");
  assert.equal(payments.paymentErrorMessage({ message: "ADMIN_REQUIRED" }, "x"), "No tienes permisos para revisar medios de pago.");
  assert.equal(payments.paymentErrorMessage({ message: "permission denied for function set_store_payment_method" }, "x"), "x");
  assert.equal(payments.paymentErrorMessage(null, "x"), "x");
});

test("the contact route upgrades to a purchase request only through the database check", () => {
  const route = read("app/api/contact/route.ts");
  assert.match(route, /body\.intent === "purchase" && assistedCommerceEnabled\(\) && data\.seller_type === "store"/);
  assert.match(route, /client\.rpc\("get_listing_purchase_request", \{ p_listing_id: body\.listingId \}\)/);
  assert.match(route, /metadata: purchase \? \{ intent: "purchase" \} : undefined/);
  // An unknown intent is a bad request, never a silent upgrade.
  assert.match(route, /body\.intent !== undefined && \(body\.intent !== "purchase" \|\| !body\.listingId\)/);
});

test("pages show methods and Solicitar compra only through the pilot switch and the public read functions", () => {
  const listing = read("app/instrumentos/[slug]/page.tsx");
  assert.match(listing, /!assistedCommerceEnabled\(\) \|\| listing\.status !== "approved" \|\| listing\.seller_type !== "store" \|\| isOutOfStock\(listing\)/);
  assert.match(listing, /supabase\.rpc\("get_listing_purchase_request"/);
  const store = read("app/tiendas/[slug]/page.tsx");
  assert.match(store, /assistedCommerceEnabled\(\) && store\.is_verified/);
  assert.match(store, /supabase\.rpc\("get_store_payment_methods"/);
  // No page reads the private table for buyers, and no holder name reaches a public component.
  for (const file of ["app/instrumentos/[slug]/page.tsx", "app/tiendas/[slug]/page.tsx", "components/payment/accepted-payment-methods.tsx"]) {
    assert.doesNotMatch(read(file), /from\("store_payment_methods"\)|holder_name/, file);
  }
  assert.match(read("components/payment/accepted-payment-methods.tsx"), /Laria no procesa pagos/);
});

test("owner screens are hidden while the pilot is off; Admin review is always guarded", () => {
  assert.match(read("app/mi-cuenta/tienda/medios-de-pago/page.tsx"), /if \(!assistedCommerceEnabled\(\)\) notFound\(\);/);
  assert.match(read("app/api/store/payment-methods/route.ts"), /if \(!assistedCommerceEnabled\(\)\) return failure/);
  assert.match(read("app/admin/medios-de-pago/page.tsx"), /requireAdmin\("\/admin\/medios-de-pago"\)/);
  for (const file of ["app/api/store/payment-methods/route.ts", "app/api/admin/payment-methods/route.ts"]) {
    assert.match(read(file), /sameOriginEventRequest\(request\)/, file);
  }
});

// Review fix A2: the provider is chosen from a list, the same one the database enforces.
test("the provider choices match the database's list for each method", () => {
  const sql = read("supabase/migrations/20261029120000_review_fixes_payment_methods.sql");
  const body = /function laria_private\.payment_provider_options[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql)[1];
  const database = Object.fromEntries(
    [...body.matchAll(/when '([a-z_]+)' then array\[([^\]]*)\]/g)].map(([, method, list]) => [method, [...list.matchAll(/'([^']+)'/g)].map((m) => m[1])]),
  );
  for (const method of payments.PAYMENT_METHODS) {
    assert.deepEqual([...payments.PAYMENT_PROVIDER_OPTIONS[method]], database[method] ?? [], method);
  }
  assert.equal(payments.isPaymentProvider("yape_plin", "Plin"), true);
  assert.equal(payments.isPaymentProvider("pos_tarjeta_al_recoger", "PayPal"), false);
  assert.equal(payments.isPaymentProvider("efectivo_al_recoger", "Izipay"), false);
});

// Review fix A14: the Admin decides on the revision they saw, not on a timestamp two changes can share.
test("Admin decisions carry the method's revision", () => {
  const route = read("app/api/admin/payment-methods/route.ts");
  assert.match(route, /p_expected_revision: body\.expectedRevision/);
  assert.match(route, /Number\.isSafeInteger\(body\.expectedRevision\)/);
  assert.doesNotMatch(route, /expectedUpdatedAt|p_expected_updated_at/);
});

test("the Terms and Privacy drafts render only with the pilot and stay marked for legal review", () => {
  const legal = read("components/legal/assisted-commerce-legal.tsx");
  assert.match(legal, /DRAFT PENDING LEGAL REVIEW/);
  assert.equal((legal.match(/if \(!assistedCommerceEnabled\(\)\) return null;/g) ?? []).length, 2);
  assert.match(read("app/terminos/page.tsx"), /<TermsAssistedCommerceSection \/>/);
  assert.match(read("app/privacidad/page.tsx"), /<PrivacyAssistedCommerceSection \/>/);
  // Review fix A14: the owner sees the holder they entered too.
  assert.match(legal, /solo tú y el equipo autorizado de Laria pueden verlo/);
  assert.doesNotMatch(legal, /solo lo ve el equipo de Laria/);
});
