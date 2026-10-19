// ux my-listings batch (EASE-400..499): Pendientes, rejection reasons, edit form, reminders, check-ins, vacation mode.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = (file) => fs.readFileSync(file, "utf8");
const { buildPendientes, parsePendientes, dueLabel, storeChecklist } = require(path.resolve("lib/pendientes.ts"));
const { REJECTION_REASONS, parseRejectionCodes, fieldsForRejection, rejectionNote } = require(path.resolve("lib/rejection-reasons.ts"));
const { renderMarketplaceEmail } = require(path.resolve("lib/email/templates.ts"));

const NOW = new Date("2026-10-19T15:00:00Z");

function payload() {
  return {
    buyer: {
      pending_claims: [{ reference_id: "c1", title: "Fender" }],
      reviews_due: [{ reference_id: "t1", title: "Yamaha", deadline: "2026-10-20T20:00:00Z" }],
      purchase_checks: [{ listing_id: "l3", title: "Pedal", slug: "pedal", contacted_at: "2026-10-14T12:00:00Z" }],
      price_drops: 2,
      alert_matches: 1,
    },
    seller: {
      rejected: [{ listing_id: "l1", title: "Bajo", reason: "Pocas fotos o fotos poco claras.", kind: "listing" }],
      admin_hidden: [{ listing_id: "l2", title: "Amp", reason: "Duplicada" }],
      drafts: [{ listing_id: "d1", title: "Borrador" }],
      buyer_reports: [{ checkin_id: "k1", listing_id: "l4", title: "Teclado", buyer_name: "Ana", stock_managed: false }],
      availability: [{ listing_id: "l5", title: "Batería", slug: "bateria", price_pen: 900 }],
      unattributed: [{ listing_id: "l6", title: "Ukelele", eligible: 3 }],
      paused_until: null,
    },
    store: { store_id: "s1", inventory_enabled: true, out_of_stock_saved: 2, low_stock: 1, unlinked_skus: 4, open_import: { id: "imp", file_name: "stock.xlsx", status: "review", expires_at: "2026-10-22T12:00:00Z" }, purchase_requests_today: 1, listings: 3, payment_methods: 0 },
  };
}

test("Pendientes are ordered by urgency and each one is a single tap from done", () => {
  const items = buildPendientes(parsePendientes(payload()), { now: NOW });
  assert.deepEqual(items.map((item) => item.key), [
    "claim:c1", "report:k1", "review:t1", "rejected:l1:listing", "hidden:l2", "check:l3", "available:l5", "sale:l6",
    "store:requests", "store:saved-out", "store:low", "store:import:imp", "store:unlinked",
    "draft:d1", "buyer:price-drops", "buyer:alerts",
  ]);
  const byKey = Object.fromEntries(items.map((item) => [item.key, item]));
  assert.equal(byKey["review:t1"].title, "Tu reseña vence mañana");
  assert.equal(byKey["rejected:l1:listing"].action.href, "/mi-cuenta/publicaciones/l1/editar");
  assert.equal(byKey["store:requests"].action.href, "/mi-cuenta/tienda/solicitudes");
  assert.equal(byKey["store:import:imp"].action.href, "/mi-cuenta/tienda/inventario/importar/imp");
  assert.equal(byKey["store:saved-out"].action.href, "/mi-cuenta/tienda/inventario?stock=out");
  assert.deepEqual(byKey["check:l3"].action, { kind: "purchase_check", listingId: "l3" });
  assert.deepEqual(byKey["report:k1"].action, { kind: "buyer_report", checkinId: "k1", stockManaged: false });
  assert.deepEqual(byKey["available:l5"].action, { kind: "availability", listingId: "l5", price: 900 });
  assert.match(byKey["sale:l6"].detail, /3 personas te escribieron/);
  for (const item of items) assert.doesNotMatch(`${item.title} ${item.detail ?? ""}`, /!|¡|artículo|producto/i);
});

test("a malformed or failed read is null, and bad rows are dropped rather than shown", () => {
  assert.equal(parsePendientes(null), null);
  assert.equal(parsePendientes({ buyer: {} }), null);
  const value = payload();
  value.seller.rejected.push({ listing_id: 4, title: null });
  value.buyer.price_drops = -3;
  value.store = null;
  const parsed = parsePendientes(value);
  assert.equal(parsed.seller.rejected.length, 1);
  assert.equal(parsed.buyer.price_drops, 0);
  assert.ok(!buildPendientes(parsed, { now: NOW }).some((item) => item.key.startsWith("store:")));
});

test("due labels count calendar days in Lima", () => {
  assert.equal(dueLabel("2026-10-19T23:00:00Z", NOW), "vence hoy");
  assert.equal(dueLabel("2026-10-20T04:30:00Z", NOW), "vence hoy");
  assert.equal(dueLabel("2026-10-20T06:00:00Z", NOW), "vence mañana");
  assert.equal(dueLabel("2026-10-23T12:00:00Z", NOW), "vence en 4 días");
});

test("shop-02 store checklist ticks itself and shows payments only with the pilot", () => {
  const store = { status: "pending", slug: "t", logo_url: "x", banner_url: null, description: "Hola", instagram_url: "i", facebook_url: null, tiktok_url: null, website_url: null };
  const steps = storeChecklist(store, { listings: 0, paymentMethods: 0, payments: false });
  assert.deepEqual(steps.map((step) => [step.key, step.done]), [["application", true], ["images", false], ["profile", true], ["first", false], ["page", false]]);
  assert.ok(storeChecklist(store, { listings: 1, paymentMethods: 1, payments: true }).some((step) => step.key === "payments" && step.done));
  assert.equal(storeChecklist(null, { listings: 0, paymentMethods: 0, payments: false })[0].done, false);
});

test("rejection reasons match the database labels and map to the fields to fix", () => {
  const sql = source("supabase/migrations/20261105120000_ux_my_listings_lifecycle.sql");
  for (const reason of REJECTION_REASONS) assert.ok(sql.includes(`when '${reason.code}' then '${reason.label}'`), reason.code);
  assert.deepEqual(parseRejectionCodes(["pocas_fotos", "otro", 3, "pocas_fotos", "marca_modelo"]), ["pocas_fotos", "marca_modelo"]);
  assert.deepEqual([...fieldsForRejection(["marca_modelo", "pocas_fotos"])].sort(), ["brand", "model", "photos"]);
  assert.equal(rejectionNote("Pocas fotos o fotos poco claras. Nota: falta el mástil"), "falta el mástil");
  assert.equal(rejectionNote("Texto libre"), null);
});

test("mine-03 moderators pick reasons; the note becomes optional with one", () => {
  const admin = source("components/admin-workbench.tsx");
  assert.match(admin, /REJECTION_REASONS\.map/);
  assert.match(admin, /p_reason_codes: codes\?\.length \? codes : undefined/);
  assert.equal((admin.match(/^\s+reasonCodes$/gm) ?? []).length, 2);
  assert.match(admin, /Elige al menos un motivo o escribe uno de al menos 3 caracteres\./);
  const checklist = admin.slice(admin.indexOf("REJECTION_REASONS.map"), admin.indexOf("REJECTION_REASONS.map") + 200);
  assert.doesNotMatch(checklist, /defaultChecked|checked=/);
});

test("mine-01/02 the edit form opens on what to fix, in the sell-form order, with one send button", () => {
  const form = source("components/listing-edit-form.tsx");
  const page = source("app/mi-cuenta/publicaciones/[id]/editar/page.tsx");
  assert.match(form, /RejectionChecklist/);
  assert.match(form, /Por qué no se aprobó tu publicación/);
  assert.match(form, /<Tag tone="danger">Revisar<\/Tag>/);
  assert.match(form, /"Guardar y enviar a revisión"/);
  assert.match(form, /"Guardar y publicar"/);
  assert.match(form, /"Se publica al instante"/);
  assert.match(form, /"Pasa por revisión"/);
  assert.match(form, /action: "resubmit"/);
  const order = ["edit-photo-heading", "editar-instrumento", "editar-condicion", "editar-ubicacion", "editar-descripcion"].map((id) => form.indexOf(`"${id}"`));
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])), `order ${order}`);
  assert.ok(form.indexOf('name="brand"') < form.indexOf('name="title"'));
  assert.match(page, /rejection_codes/);
  assert.match(page, /parseRejectionCodes/);
  // Checklist ticks are the owner's own notes: never pre-ticked, never submitted.
  assert.doesNotMatch(form.slice(form.indexOf("function RejectionChecklist")), /defaultChecked/);
  assert.match(form, /name="checklist"[^>]*form=""/);
});

test("rejection e-mails open the edit form; the five reminder e-mails render", () => {
  const base = { delivery_id: "d", attempt_count: 0, recipient_email: "a@laria.test", recipient_name: null, store: null, transaction: null, search_alert: null };
  const listing = { title: "Bajo", slug: "bajo-1", price_pen: 100 };
  const rejected = renderMarketplaceEmail({ ...base, event_type: "listing_revision_rejected", context: { reason: "Marca o modelo incorrectos." }, listing }, "https://laria.test");
  assert.equal(rejected.destination, "https://laria.test/mi-cuenta/publicaciones/editar/bajo-1");
  assert.match(rejected.text, /Motivo: Marca o modelo incorrectos\./);
  assert.equal(renderMarketplaceEmail({ ...base, event_type: "listing_rejected", context: {}, listing }, "https://laria.test").destination, "https://laria.test/mi-cuenta/publicaciones/editar/bajo-1");
  const transaction = { reference_id: "t1", listing_title: "Bajo", review_deadline: null };
  for (const event_type of ["listing_purchase_check", "listing_buyer_reported_purchase", "listing_availability_checkin", "listing_purchase_confirmation_reminder", "listing_review_reminder"]) {
    const email = renderMarketplaceEmail({ ...base, event_type, context: {}, listing, transaction }, "https://laria.test");
    assert.doesNotMatch(email.text, /!|¡/, event_type);
    assert.match(email.destination, /^https:\/\/laria\.test\/mi-cuenta/, event_type);
  }
  assert.ok(fs.existsSync("app/mi-cuenta/publicaciones/editar/[slug]/page.tsx"));
  assert.match(source("app/mi-cuenta/publicaciones/editar/[slug]/page.tsx"), /\.eq\("owner_user_id", user\.id\)/);
});

test("notifications for the new reminders have labels and open the place they are answered", () => {
  const list = source("components/notifications-list.tsx");
  for (const type of ["listing_purchase_check", "listing_buyer_reported_purchase", "listing_availability_checkin", "listing_purchase_confirmation_reminder", "listing_review_reminder"]) assert.match(list, new RegExp(`${type}: "`));
  assert.match(list, /MY_LISTINGS_HOME_EVENTS\.has/);
});

test("big-08 the listing page asks the buyer once, and only a signed-in buyer who wrote", () => {
  const checkin = source("components/purchase-checkin.tsx");
  assert.match(checkin, /auth\.getSession/);
  assert.match(checkin, /get_purchase_checkin/);
  assert.match(checkin, /¿Cómo te fue\?/);
  assert.match(checkin, /Sí, lo compré/);
  assert.match(checkin, /No lo compré/);
  assert.match(source("app/instrumentos/[slug]/page.tsx"), /<PurchaseCheckin listingId=\{listing\.id\} \/>/);
});

test("mine-12 vacation mode pauses contact with a return date and ends in one tap", () => {
  const vacation = source("components/vacation-mode.tsx");
  assert.match(vacation, /set_owned_listings_pause/);
  assert.match(vacation, /Ya volví/);
  assert.match(vacation, /max=\{addDays\(today, 90\)\}/);
  const listing = source("app/instrumentos/[slug]/page.tsx");
  assert.match(listing, /paused_until/);
  assert.match(listing, /Vuelve el \{formatPausedUntil\(paused\)\}/);
  assert.match(listing, /\) : paused \? \(/);
});

test("big-09 the account home renders Pendientes inline actions without pre-selection", () => {
  const list = source("components/pendientes-list.tsx");
  for (const rpc of ["answer_purchase_checkin", "decide_purchase_checkin", "confirm_listing_available", "set_owned_listing_price", "set_owned_listing_lifecycle"]) assert.match(list, new RegExp(`"${rpc}"`));
  assert.match(list, /Sí, sigue disponible/);
  assert.match(list, /Bajar precio/);
  assert.match(list, /Cuando algo necesite tu atención, aparecerá aquí primero\./);
  const home = source("app/mi-cuenta/page.tsx");
  assert.match(home, /get_account_pendientes/);
  assert.match(home, /title="Hoy en tu tienda"/);
  assert.match(home, /StoreChecklist/);
  assert.match(home, /No pudimos cargar tus pendientes/);
});
