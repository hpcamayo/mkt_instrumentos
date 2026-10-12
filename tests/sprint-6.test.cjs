const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

function load(filename, mocks = {}) {
  const source = path.resolve(filename);
  const compiled = ts.transpileModule(fs.readFileSync(source, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = new Module(source, module);
  mod.filename = source;
  mod.paths = module.paths;
  const original = mod.require.bind(mod);
  mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  mod._compile(compiled, source);
  return mod.exports;
}

const transactions = load("lib/transactions.ts");

test("transaction JSON parsers reject malformed/private shapes and preserve valid state", () => {
  const item = {
    reference_id: "tx", claim_id: "claim", transaction_id: "tx", listing_id: "listing",
    title: "Guitarra", slug: "guitarra", sold_at: "2026-09-18T12:00:00Z",
    status: "verified", attribution_type: "laria", role: "buyer", seller_name: "Vendedor",
    buyer_name: null, verified_at: "2026-09-18T12:00:00Z", review_deadline: "2026-09-28T12:00:00Z",
    own_review_submitted: false, reviews_revealed: false,
  };
  assert.deepEqual(transactions.parseTransactionCenter([item]), [item]);
  assert.deepEqual(transactions.parseTransactionCenter([{ ...item, status: "paid" }]), []);
  assert.deepEqual(transactions.parseTransactionCenter({ items: [item] }), []);
  assert.equal(transactions.transactionStateLabel("external"), "Venta fuera de Laria");
});

test("public reputation parser never fabricates a default rating", () => {
  assert.deepEqual(transactions.parsePublicReputation(null), { review_count: 0, average_rating: null, items: [] });
  const value = { review_count: 1, average_rating: 4.5, items: [{ id: "r", rating: 5, comment: null, submitted_at: "2026-09-18T12:00:00Z", reviewer_name: "Comprador" }] };
  assert.deepEqual(transactions.parsePublicReputation(value), value);
  assert.equal(transactions.parsePublicReputation({ ...value, items: [{ ...value.items[0], rating: 8 }] }).review_count, 0);
});

test("mega-menu is driven by canonical taxonomy and closes on every required interaction", () => {
  // UX-2 hybrid (owner, 3 Oct, N12): the strip's categories open a one-category panel with "Ver todos" and that
  // category's canonical instrument types, built in lib/shell.ts from the same taxonomy helpers as before UX-2.
  const strip = fs.readFileSync("components/global-categories.tsx", "utf8");
  const shell = fs.readFileSync("lib/shell.ts", "utf8");
  assert.match(strip, /stripItems/);
  assert.match(strip, /categoryMenus\.find\(\(menu\) => menu\.key === group\.openKey\)/, "one category panel at a time");
  assert.match(strip, /aria-expanded=\{isOpen\}/);
  assert.match(strip, /aria-controls=\{panelId\(item\.key\)\}/);
  assert.match(strip, /onClick=\{onChoose\}/, "choosing a destination closes the panel");
  assert.match(shell, /href: categoryLandingPath\(category\.value\), kind: "category" as const/);
  assert.match(shell, /getInstrumentTypeOptions\(category\.value\)\.map\(\(type\) => \(\{\s+\.\.\.type,\s+href: categoryTypePath\(category\.value, type\.value\),/);
  assert.doesNotMatch(strip, /Popular|Recomendad|Colecciones/);
  // Every shell menu closes on route change, outside press and Escape, which returns focus to its button; opening one
  // closes the others. The strip uses the group form of the same disclosure.
  const disclosure = fs.readFileSync("components/use-disclosure.ts", "utf8");
  assert.match(disclosure, /usePathname\(\)/);
  assert.match(disclosure, /useEffect\(\(\) => \{ setOpen\(false\); \}, \[pathname\]\);/);
  assert.match(disclosure, /useEffect\(\(\) => \{ setOpenKey\(null\); \}, \[pathname\]\);/);
  assert.equal((disclosure.match(/pointerdown/g) ?? []).length, 4, "both forms listen for outside presses");
  // An Esc already handled inside (preventDefault, the Admin accordion) does not also close the outer menu.
  assert.equal((disclosure.match(/event\.key === "Escape" && !event\.defaultPrevented\) close\(true\)/g) ?? []).length, 2);
  assert.match(disclosure, /buttonRef\.current\?\.focus\(\)/);
  assert.match(disclosure, /buttons\.current\.get\(key\)\?\.focus\(\)/);
  assert.match(strip, /useDisclosureGroup\("category-strip"\)/);
  for (const file of ["components/site-header.tsx", "components/account-navigation.tsx", "components/admin-navigation.tsx"]) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /useDisclosure\(/, file);
    assert.match(source, /aria-expanded=/, file);
  }
  // Admin: the same destinations from its own navigation, an accordion that handles Esc itself.
  const accordion = fs.readFileSync("components/category-accordion.tsx", "utf8");
  assert.match(accordion, /categoryMenus\.map/);
  assert.match(accordion, /aria-expanded=\{expanded\}/);
});

test("verified transaction UI uses account shell routes and preserves off-platform limitation", () => {
  const navigation = fs.readFileSync("lib/account-navigation.ts", "utf8");
  const detail = fs.readFileSync("components/transaction-detail.tsx", "utf8");
  const management = fs.readFileSync("components/listing-management-table.tsx", "utf8");
  const notifications = fs.readFileSync("components/notifications-list.tsx", "utf8");
  // Compras y ventas is declared once in the shared account items used by both roles.
  assert.equal((navigation.match(/label: "Compras y ventas"/g) ?? []).length, 1);
  assert.equal((navigation.match(/\.\.\.sharedAccountItems/g) ?? []).length, 2);
  assert.match(detail, /Sí, lo compré/);
  assert.match(detail, /No, no fui yo/);
  assert.match(detail, /No verifica pago, entrega, envío, autenticidad ni condición/);
  assert.match(detail, /no podrás editarla ni eliminarla libremente/);
  assert.match(management, /Atribuir venta/);
  assert.match(management, /router\.push\(\x60\/mi-cuenta\/transacciones/);
  assert.match(notifications, /transactionReference/);
});

test("migration makes tables RPC-only and database constraints own all critical uniqueness", () => {
  const sql = fs.readFileSync("supabase/migrations/20260918120000_sprint_6_transactions_reviews.sql", "utf8");
  assert.match(sql, /transaction_claims_one_active_idx[\s\S]*status in \('pending','confirmed','external'\)/);
  assert.match(sql, /listing_id uuid not null unique references public\.listings/);
  assert.match(sql, /constraint transaction_reviews_direction_unique unique\(transaction_id,direction\)/);
  assert.match(sql, /review_deadline=verified_at\+interval '10 days'/);
  assert.match(sql, /clock_timestamp\(\)>=transaction_record\.review_deadline/);
  assert.match(sql, /'review_window_open',transaction_record\.id is not null and transaction_record\.review_deadline>clock_timestamp\(\)/);
  assert.match(sql, /for update/);
  assert.match(sql, /created_at<=item\.sold_at/);
  assert.match(sql, /revoke all on public\.transaction_claims,public\.verified_transactions,public\.transaction_reviews/);
  assert.match(sql, /review_moderation_actions/);
  assert.match(sql, /get_public_reputation/);
});

test("event failure telemetry is structured, correlated and excludes event payload fields", () => {
  const server = load("lib/marketplace-events-server.ts", {
    "server-only": {},
    "next/headers": { cookies: async () => ({}) },
    "@/lib/marketplace-event-payload": { isUuid: () => false, searchEventMetadata: () => ({}) },
    "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => null },
    "@/lib/supabase/server-client": { getSupabaseServerClient: async () => null },
  });
  const calls = [];
  const original = console.error;
  console.error = (...args) => calls.push(args);
  try {
    server.logMarketplaceEventFailure({ requestId: "request-id", type: "whatsapp_contact", category: "database_rpc", code: "XX001" });
  } finally {
    console.error = original;
  }
  assert.equal(calls[0][0], "marketplace_event_failure");
  const record = JSON.parse(calls[0][1]);
  assert.deepEqual(Object.keys(record).sort(), ["event_type", "failure_category", "failure_code", "request_id"]);
  assert.deepEqual(record, { request_id: "request-id", event_type: "whatsapp_contact", failure_category: "database_rpc", failure_code: "XX001" });
  for (const forbidden of ["message", "buyer", "email", "phone", "token", "password"]) assert.equal(Object.hasOwn(record, forbidden), false);
  const contact = fs.readFileSync("app/api/contact/route.ts", "utf8");
  const events = fs.readFileSync("app/api/events/route.ts", "utf8");
  assert.match(contact, /X-Request-Id/);
  assert.match(contact, /category: "request_context"/);
  assert.match(contact, /return NextResponse\.json\(\{ url, recorded \}/);
  assert.match(events, /type: "event_batch"/);
  assert.match(events, /category: "request_context"/);
});

test("review moderation UI exposes hide/restore but no review rewrite inputs", () => {
  const source = fs.readFileSync("components/admin-domain-view.tsx", "utf8");
  assert.match(source, /title: "Transacciones"/);
  assert.match(source, /adminString\(item, "transaction_id"\)/);
  assert.match(source, /statusText\(item, domain\)/);
  assert.match(source, /Ocultar reseña/);
  assert.match(source, /Restaurar reseña/);
  assert.match(source, /La calificación y el comentario son inmutables/);
  assert.doesNotMatch(source, /updateReview|saveReview|name="rating"|name="comment"/);
});
