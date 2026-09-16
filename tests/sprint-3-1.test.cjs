const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

function load(source) {
  const filename = path.resolve(source);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  mod._compile(compiled, filename);
  return mod.exports;
}

const migration = fs.readFileSync(
  "supabase/migrations/20260916120000_sprint_3_1_acceptance_fixes.sql",
  "utf8",
);

test("whole-sol prices round-trip exactly and display without arithmetic", () => {
  const { parseWholeSolPrice, formatPrice } = load("lib/price.ts");
  assert.equal(parseWholeSolPrice("1200"), 1200);
  assert.equal(parseWholeSolPrice(1200), 1200);
  assert.equal(parseWholeSolPrice("1197.00"), null);
  assert.equal(parseWholeSolPrice("1200.5"), null);
  assert.equal(parseWholeSolPrice("-1200"), null);
  assert.match(formatPrice(1200), /1[,.]200/);

  for (const file of ["components/sell-listing-form.tsx", "components/listing-edit-form.tsx"]) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /parseWholeSolPrice/);
    assert.doesNotMatch(source, /type="number"/);
    assert.match(source, /inputMode="numeric"/);
  }
  assert.match(fs.readFileSync("app/api/submissions/route.ts", "utf8"), /parseWholeSolPrice/);
  assert.match(fs.readFileSync("app/api/listings/[id]/manage/route.ts", "utf8"), /parseWholeSolPrice/);
});

test("the seller Title field is the canonical primary public title", () => {
  const listings = fs.readFileSync("lib/listings.ts", "utf8");
  const card = fs.readFileSync("components/listing-card.tsx", "utf8");
  const detail = fs.readFileSync("app/instrumentos/[slug]/page.tsx", "utf8");
  assert.match(listings, /getListingDisplayTitle[\s\S]*return listing\.title/);
  assert.match(listings, /getListingSecondaryTitle[\s\S]*listing\.brand, listing\.model/);
  assert.match(card, /\{displayTitle\}/);
  assert.match(detail, /<h1[\s\S]*\{displayTitle\}/);
});

test("one pending proposal is amended in place and empty proposals are cancelled", () => {
  assert.match(migration, /listing_revisions[\s\S]*where listing_id = p_listing_id and status = 'pending'[\s\S]*for update/);
  assert.match(migration, /version = version \+ 1/);
  assert.match(migration, /'mode', case when has_pending then 'revision_amended' else 'revision' end/);
  assert.match(migration, /El propietario restauró todos los valores aprobados/);
  assert.match(migration, /listing_revision_photos[\s\S]*delete from public\.listing_revision_photos where revision_id = target_revision_id/);
  assert.match(fs.readFileSync("app/mi-cuenta/publicaciones/[id]/editar/page.tsx", "utf8"), /proposedFields\.has\("title"\)/);
});

test("stale moderation actions require the exact proposal version", () => {
  assert.match(migration, /p_expected_version integer/);
  assert.match(migration, /revision\.version <> p_expected_version/);
  assert.match(migration, /LISTING_REVISION_STALE/);
});

test("duplicate RUC errors remain private and actionable", () => {
  const form = fs.readFileSync("components/store-registration-form.tsx", "utf8");
  const route = fs.readFileSync("app/api/submissions/route.ts", "utf8");
  assert.match(form, /Este RUC ya está registrado en Laria\./);
  assert.match(route, /Este RUC ya está registrado en Laria\./);
  assert.doesNotMatch(form, /owner_user_id.*RUC/);
});

test("notifications are typed, owner-readable, indexed, and read through a constrained RPC", () => {
  assert.match(migration, /create table public\.notifications/);
  assert.match(migration, /notifications_event_type_check/);
  assert.match(migration, /notifications_user_unread_idx/);
  assert.match(migration, /listing_id uuid references public\.listings\(id\) on delete cascade/);
  assert.match(migration, /store_id uuid references public\.stores\(id\) on delete cascade/);
  assert.match(migration, /create policy "Users can read own notifications"/);
  assert.match(migration, /using \(user_id = auth\.uid\(\)\)/);
  assert.match(migration, /mark_notification_read/);
  assert.match(migration, /and user_id = auth\.uid\(\)/);
  assert.doesNotMatch(migration, /grant update on public\.notifications/);

  const list = fs.readFileSync("components/notifications-list.tsx", "utf8");
  assert.match(list, /mark_notification_read/);
  assert.match(list, /Ver detalle/);
  assert.match(list, /Cambios rechazados/);
});
