// Launch audit A17 (supabase/migrations/20261114150000_launch_audit_review_trust.sql): the seller card counts buyers,
// held reviews say they wait for Laria, and Admin's Reseñas queue shows why a review waits and publishes it. The rules
// themselves are checked on the database (tests/launch-audit-review-trust.sql).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migrationFile = "supabase/migrations/20261114150000_launch_audit_review_trust.sql";

function loadWorkbench() {
  const load = Module._load;
  Module._load = function mockClient(request, ...rest) {
    if (request === "next/navigation") return { useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => "/admin" };
    if (request === "@/lib/supabase/browser-client") return { getSupabaseBrowserClient: () => null };
    return load.call(this, request, ...rest);
  };
  try {
    return require(path.join(root, "components/admin-workbench.tsx"));
  } finally {
    Module._load = load;
  }
}

const heldItem = {
  id: "r1", transaction_id: "t1", direction: "buyer_to_seller", rating: 5, comment: "Todo perfecto",
  submitted_at: "2026-10-27T12:00:00Z", listing_title: "Guitarra", open_report_count: 0,
  held_at: "2026-10-27T12:00:00Z", hold_reasons: ["first_reviews", "same_browser"],
  reviewer_name: "Ana", reviewed_name: "Tienda Grau", reviewer_since: "2026-10-25T12:00:00Z",
  reviewer_email_confirmed: false,
};

test("A17: the seller card counts the buyers who confirmed a purchase", () => {
  const page = require(path.join(root, "lib/listing-page.ts"));
  assert.equal(page.verifiedSalesLabel(1), "1 comprador confirmó su compra en Laria");
  assert.equal(page.verifiedSalesLabel(4), "4 compradores confirmaron su compra en Laria");
});

test("A17: the transaction detail carries a held review's state and rejects a malformed one", () => {
  const transactions = require(path.join(root, "lib/transactions.ts"));
  const review = { id: "r", direction: "buyer_to_seller", rating: 5, comment: null, submitted_at: "2026-10-27T12:00:00Z" };
  const detail = {
    reference_id: "t", listing_id: "l", listing_title: "Guitarra", listing_slug: "guitarra", sold_at: "2026-10-26T12:00:00Z",
    role: "buyer", state: "verified", claim_id: "c", transaction_id: "t", buyer_user_id: null, buyer_name: null,
    seller_name: "Tienda", store_id: null, verified_at: "2026-10-26T12:00:00Z", review_deadline: "2026-11-05T12:00:00Z",
    review_window_open: true, own_review: { ...review, held_at: "2026-10-27T12:00:00Z" }, visible_reviews: [],
    counterpart_review_held: false,
  };
  assert.equal(transactions.parseTransactionDetail(detail).own_review.held_at, "2026-10-27T12:00:00Z");
  assert.ok(transactions.parseTransactionDetail({ ...detail, own_review: { ...review, held_at: null } }));
  assert.ok(transactions.parseTransactionDetail({ ...detail, counterpart_review_held: undefined }), "the site before the migration");
  assert.equal(transactions.parseTransactionDetail({ ...detail, counterpart_review_held: "yes" }), null);
  assert.equal(transactions.parseTransactionDetail({ ...detail, own_review: { ...review, held_at: "mañana" } }), null);

  const page = source("components/transaction-detail.tsx");
  assert.match(page, /detail\.own_review\.held_at \? <p[^>]*>El equipo de Laria la revisará antes de mostrarla\.<\/p>/);
  assert.match(page, /detail\.counterpart_review_held \?/);
  assert.match(page, /"La reseña del comprador" : "La reseña del vendedor"\} se publicará cuando el equipo de Laria la revise\./);
});

test("A17: the Terms say that some buyers' reviews are checked before they show", () => {
  assert.match(source("app/terminos/page.tsx"), /<li>Laria revisa algunas reseñas de compradores antes de mostrarlas, por ejemplo las primeras de cada vendedor o las de cuentas recién creadas, y no muestra las que no corresponden a una compra real\.<\/li>/);
});

test("A17: every reason the database gives has an Admin label", () => {
  const { REVIEW_HOLD_REASON_LABELS, reviewHoldReasonLabel } = require(path.join(root, "lib/admin.ts"));
  const listed = source(migrationFile).match(/reasons <@ array\[([^\]]+)\]/);
  assert.ok(listed, "the migration lists the reasons");
  const reasons = [...listed[1].matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
  assert.deepEqual(reasons, ["first_reviews", "new_account", "email_unconfirmed", "repeat_buyer", "same_browser", "same_phone"]);
  assert.deepEqual(Object.keys(REVIEW_HOLD_REASON_LABELS).sort(), [...reasons].sort());
  assert.equal(new Set(Object.values(REVIEW_HOLD_REASON_LABELS)).size, reasons.length, "each label says something different");
  assert.equal(reviewHoldReasonLabel("first_reviews"), "Una de las primeras 3 reseñas del vendedor");
});

test("A17: a held review in the Reseñas queue shows why it waits and can be published or hidden", () => {
  const { QueueActions, HeldReview, isNegativeMutation } = loadWorkbench();
  const actions = (item) => renderToStaticMarkup(React.createElement(QueueActions, { queue: "resenas", item, onComplete() {} }));
  const held = actions(heldItem);
  assert.match(held, /Publicar reseña/);
  assert.match(held, /Ocultar reseña/);
  const reported = actions({ ...heldItem, held_at: null, hold_reasons: null, open_report_count: 1 });
  assert.doesNotMatch(reported, /Publicar reseña/);
  assert.match(reported, /Ocultar reseña/);
  assert.equal(isNegativeMutation({ kind: "publish_review", id: "r1" }), false, "publishing is not a negative decision");

  const details = renderToStaticMarkup(React.createElement(HeldReview, { item: heldItem }));
  assert.match(details, /Retenida porque:/);
  assert.match(details, /Una de las primeras 3 reseñas del vendedor/);
  assert.match(details, /Comprador y vendedor usaron el mismo navegador/);
  assert.match(details, /Ana/);
  assert.match(details, /Tienda Grau/);
  assert.match(details, /Sin confirmar/);
  assert.equal(renderToStaticMarkup(React.createElement(HeldReview, { item: { ...heldItem, held_at: null } })), "");

  const workbench = source("components/admin-workbench.tsx");
  assert.match(workbench, /supabase\.rpc\("publish_held_review", \{ p_review_id: mutation\.id \}\)/);
  assert.match(workbench, /\{adminString\(item, "held_at"\) \? <Tag tone="warning" className="w-fit">Retenida<\/Tag> : null\}/);
});

test("A17: the migration keeps the lines features/marketplace patches in place, and its place in the history", () => {
  const migration = source(migrationFile);
  // The deal-trust batch (20261203110000, 20261203110400) patches these with laria_private.patch_function_text, which
  // stops when a text is missing or repeated.
  for (const text of [
    "select recipient,'review_revealed','Ambas reseñas fueron enviadas y ya están visibles.',transaction_record.listing_id,transaction_record.store_id,transaction_record.id",
    "vt.id = tr.transaction_id\n      join public.listings l on l.id = vt.listing_id",
    "tr.submitted_at, tr.admin_hidden_at, tr.admin_hidden_reason,\n        l.id listing_id, l.title listing_title,",
  ]) {
    assert.equal(migration.split(text).length - 1, 1, text);
  }
  assert.ok(path.basename(migrationFile) < "20261201000000", "below the features/marketplace migrations");
  assert.match(migration, /^set lock_timeout = '10s';$/m);
  assert.match(migration, /^reset lock_timeout;$/m);
});
