// PAY-1 assisted commerce, Pilot A (docs/store-operations/pay-1.md): payment-method helpers, the purchase message, the
// pilot switch and the boundaries the routes and pages must keep. Database behavior is in tests/pay-1.sql.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

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
    // Effortless Laria, inventory batch, stock-23: how many units "Solicitar compra" may ask for (1 without a SKU).
    maxQuantity: 1,
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

// Loads a module with some imports replaced and some browser globals given, so the Admin form and the route it
// posts to run together.
function load(filename, mocks = {}, globals = {}) {
  const compiled = ts.transpileModule(read(filename), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", ...Object.keys(globals), compiled)(
    (name) => (Object.hasOwn(mocks, name) ? mocks[name] : require(name)),
    mod,
    mod.exports,
    ...Object.values(globals),
  );
  return mod.exports;
}

function findElement(node, matches) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, matches);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;
  return matches(node) ? node : findElement(node.props?.children, matches);
}

// The latest definition of the Admin decision function; PostgREST finds it by these argument names.
function decisionParameters() {
  const migrations = fs.readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort().reverse();
  for (const name of migrations) {
    const match = /create or replace function public\.admin_review_store_payment_method\(([\s\S]*?)\)\s*returns/.exec(read(path.join("supabase/migrations", name)));
    if (match) return match[1].split(",").map((parameter) => parameter.trim().split(/\s+/));
  }
  return [];
}

// Codex re-check: the form once sent a field the route no longer accepted, and only text matches covered either side.
// Here the form's own request goes through the route to the database call.
function adminDecisionHarness(row) {
  const origin = "https://laria.audio";
  const calls = { rpc: [], responses: [], refreshes: 0 };
  const database = {
    rpc: async (name, args) => {
      calls.rpc.push([name, args]);
      return { data: { method: args.p_method, revision: args.p_expected_revision + 1 }, error: null };
    },
  };
  const events = load("lib/marketplace-events-server.ts", {
    "server-only": {},
    "next/headers": { cookies: async () => ({ get: () => undefined, set() {} }) },
    "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => null },
    "@/lib/supabase/server-client": { getSupabaseServerClient: async () => null },
  });
  const route = load("app/api/admin/payment-methods/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/marketplace-events-server": events,
    "@/lib/supabase/server-client": { getSupabaseServerClient: async () => database },
  });
  // What the browser does with the form's fetch: a same-origin POST to the route.
  async function fetchRoute(url, init) {
    const request = new Request(new URL(url, origin), { ...init, headers: { ...init.headers, origin, "sec-fetch-site": "same-origin" } });
    const response = await route.POST(request);
    calls.responses.push(response.status);
    return response;
  }
  const state = [];
  let hook = 0;
  const { AdminPaymentMethodRow } = load("components/payment/admin-payment-methods-review.tsx", {
    react: {
      useId: () => "fila",
      useState(initial) {
        const index = hook++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => { state[index] = value; }];
      },
    },
    "next/link": { __esModule: true, default: () => null },
    "next/navigation": { useRouter: () => ({ refresh: () => { calls.refreshes += 1; } }) },
    "@/components/ui/button": { Button: () => null },
    "@/components/ui/field": { Field: () => null, Input: () => null },
    "@/components/ui/notice": { Notice: () => null },
    "@/components/ui/tag": { StatusEntryTag: () => null, StatusTag: () => null },
  }, {
    fetch: fetchRoute,
    FormData: class {
      constructor(form) { this.form = form; }
      get(name) { return this.form[name] ?? null; }
    },
  });
  function render() {
    hook = 0;
    return AdminPaymentMethodRow({ row });
  }
  return {
    calls,
    route,
    origin,
    decisions: () => {
      const form = findElement(render(), (element) => element.type === "form");
      const buttons = [];
      findElement(form, (element) => { if (element.props?.type === "submit") buttons.push(element.props.value); return false; });
      return buttons;
    },
    async decide(decision, reason) {
      const form = findElement(render(), (element) => element.type === "form");
      const field = findElement(form, (element) => element.props?.name === "reason");
      const button = findElement(form, (element) => element.props?.type === "submit" && element.props.value === decision);
      assert.ok(field && button, `the form has the reason field and the ${decision} button`);
      form.props.onSubmit({ preventDefault() {}, nativeEvent: { submitter: button.props }, currentTarget: { [field.props.name]: reason } });
      for (let tick = 0; state[0] !== null; tick += 1) {
        assert.ok(tick < 1000, "the decision finished");
        await new Promise((resolve) => setImmediate(resolve));
      }
      return state[1];
    },
  };
}

const reviewRow = {
  store_id: "76000000-0000-4000-8000-000000000002",
  method: "yape_plin",
  status: "pending_review",
  holder_name: "Música Lima S.A.C.",
  provider_label: "Yape",
  owner_note: null,
  review_reason: null,
  updated_at: "2026-10-20T12:00:00Z",
  revision: 7,
  store_name: "Música Lima",
  store_slug: "musica-lima",
  store_status: "active",
  store_is_verified: true,
  razon_social: "Música Lima S.A.C.",
  ruc: "20123456789",
};

test("the Admin form's own request passes the route and reaches the database with the revision it showed", async () => {
  const parameters = decisionParameters();
  assert.deepEqual(parameters.map(([name]) => name), ["p_store_id", "p_method", "p_decision", "p_reason", "p_expected_revision"]);
  assert.equal(parameters.at(-1)[1], "integer");
  for (const [row, decision] of [[reviewRow, "approve"], [reviewRow, "reject"], [{ ...reviewRow, status: "approved", revision: 12 }, "disable"]]) {
    const admin = adminDecisionHarness(row);
    const message = await admin.decide(decision, "  El titular coincide con la razón social.  ");
    assert.deepEqual(admin.calls.responses, [200], decision);
    assert.deepEqual(admin.calls.rpc, [["admin_review_store_payment_method", {
      p_store_id: row.store_id,
      p_method: row.method,
      p_decision: decision,
      p_reason: "El titular coincide con la razón social.",
      p_expected_revision: row.revision,
    }]], decision);
    assert.deepEqual(Object.keys(admin.calls.rpc[0][1]), parameters.map(([name]) => name), "named as the function's parameters");
    assert.deepEqual(message, { tone: "success", text: "Decisión guardada." });
    assert.equal(admin.calls.refreshes, 1);
  }
  assert.deepEqual(adminDecisionHarness(reviewRow).decisions(), ["approve", "reject"]);
  assert.deepEqual(adminDecisionHarness({ ...reviewRow, status: "approved" }).decisions(), ["disable"]);

  // The route takes the revision and nothing else in its place, so the request above is not passing by chance.
  const admin = adminDecisionHarness(reviewRow);
  const body = { storeId: reviewRow.store_id, method: reviewRow.method, decision: "approve", reason: "Comprobado.", expectedRevision: reviewRow.revision };
  const post = (fields, headers = { origin: admin.origin, "sec-fetch-site": "same-origin" }) =>
    admin.route.POST(new Request(`${admin.origin}/api/admin/payment-methods`, { method: "POST", headers, body: JSON.stringify(fields) }));
  const { expectedRevision, ...withoutRevision } = body;
  for (const fields of [
    withoutRevision,
    { ...withoutRevision, expectedUpdatedAt: reviewRow.updated_at },
    { ...body, expectedUpdatedAt: reviewRow.updated_at },
    { ...body, expectedRevision: String(expectedRevision) },
    { ...body, expectedRevision: 0 },
    { ...body, expectedRevision: 7.5 },
  ]) {
    assert.equal((await post(fields)).status, 400, JSON.stringify(fields));
  }
  assert.equal((await post(body, { origin: "https://otro.example", "sec-fetch-site": "cross-site" })).status, 403);
  assert.deepEqual(admin.calls.rpc, []);
  assert.deepEqual(await admin.decide("approve", "ok"), { tone: "danger", text: "Indica el motivo o lo que comprobaste." });
  assert.deepEqual(admin.calls.responses, [], "a reason under three characters stays in the form");
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
