const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const migration = fs.readFileSync(
  "supabase/migrations/20260913120000_listing_sprint_3.sql",
  "utf8",
);

test("Sprint 3 keeps moderated proposals separate from the live listing", () => {
  assert.match(migration, /create table public\.listing_revisions/);
  assert.match(migration, /create table public\.listing_revision_photos/);
  assert.match(migration, /listing_revisions_one_pending_idx/);
  assert.match(migration, /where status = 'pending'/);
  assert.match(migration, /defer_attributes/);
  assert.match(migration, /changed_fields <@ array\[[^\]]*'condition'/);
  assert.match(migration, /condition = case when 'condition' = any\(revision\.changed_fields\)/);
  assert.match(migration, /listing_photo_set_is_valid/);
  assert.match(migration, /new\.title is distinct from old\.title/);
  assert.match(migration, /patch only|set title = case when 'title' = any/i);
});

test("sold lifecycle is immutable and relisting always creates a new identity", () => {
  assert.match(migration, /SOLD_LISTING_IMMUTABLE/);
  assert.match(migration, /create or replace function public\.relist_sold_listing/);
  assert.match(migration, /new_id uuid := gen_random_uuid\(\)/);
  assert.match(migration, /relisted_from_listing_id/);
  assert.match(migration, /status = 'cancelled'.*publication was marked as sold|status = 'cancelled'[\s\S]*marcada como vendida/i);
});

test("restore and relist use the existing database cap trigger", () => {
  assert.match(migration, /set status = 'approved'.*hidden_source = null/s);
  assert.match(migration, /insert into public\.listings[\s\S]*new_id/);
  assert.doesNotMatch(migration, /select count\(\*\)[\s\S]*if.*<\s*50/i);
  const sprintTwo = fs.readFileSync(
    "supabase/migrations/20260910190000_store_sprint_2.sql",
    "utf8",
  );
  assert.match(sprintTwo, /pg_advisory_xact_lock/);
  assert.match(sprintTwo, /listings_enforce_store_inventory_cap/);
});

test("public sold detail is server-only and contact actions are removed", () => {
  const detail = fs.readFileSync("app/instrumentos/[slug]/page.tsx", "utf8");
  assert.match(detail, /getSupabaseAdminClient/);
  assert.match(detail, /\.in\("status", \["approved", "sold"\]\)/);
  assert.match(detail, /data\.status === "approved"[\s\S]*listing_is_public/);
  assert.match(detail, /const isSold = listing\.status === "sold"/);
  assert.match(detail, /ya no está disponible para consultas de compra/);
  assert.match(detail, /trackView={!isSold}/);
  assert.match(detail, /listing\.status === "approved" \? 1 : 0/);
  const sprintTwo = fs.readFileSync(
    "supabase/migrations/20260910190000_store_sprint_2.sql",
    "utf8",
  );
  assert.match(sprintTwo, /Public can read publicly eligible listings/);
});

test("account management exposes lifecycle and pending-revision states", () => {
  const table = fs.readFileSync("components/listing-management-table.tsx", "utf8");
  const edit = fs.readFileSync("components/listing-edit-form.tsx", "utf8");
  assert.match(table, /Cambios en revisión/);
  assert.match(table, /Ocultada por moderación/);
  assert.match(table, /Marcar vendida/);
  assert.match(table, /Republicar copia/);
  assert.match(table, /Enviar nuevamente/);
  assert.match(edit, /la versión pública anterior sigue visible/);
  assert.match(edit, /\["title", "category", "instrument_type", "brand", "model", "condition"\]/);
  assert.doesNotMatch(edit, /\["price_pen", "description", "city", "region", "condition", "attributes"\]/);
  assert.match(edit, /listing-edits/);
  assert.match(edit, /scrollIntoView/);
  assert.match(edit, /storage\.from\("listing-photos"\)\.remove\(uploadedPaths\)/);
  assert.doesNotMatch(edit, /Promise\.all\(photos\.map/);
});

test("admin moderation uses trusted lifecycle and revision RPCs", () => {
  const admin = fs.readFileSync("components/admin-panel.tsx", "utf8");
  assert.match(admin, /rpc\("review_listing"/);
  assert.match(admin, /rpc\("review_listing_revision"/);
  assert.match(admin, /Motivo obligatorio/);
  assert.match(admin, /Actual:/);
  assert.match(admin, /Propuesto:/);
  assert.match(admin, /Fotos propuestas/);
  assert.match(admin, /Historial reciente de revisiones/);
  assert.match(admin, /resolution_reason/);
});

test("listing edit uploads are owner-scoped and old objects are not deleted", () => {
  const route = fs.readFileSync("app/api/listings/[id]/manage/route.ts", "utf8");
  assert.match(route, /listing-edits/);
  assert.match(route, /allowedUrls/);
  assert.match(route, /cleanupUploads\(photoResult\.newPaths\)/);
  assert.doesNotMatch(route, /remove\(.*existing/i);
  assert.match(migration, /drop policy if exists "Authenticated users can delete listing photos under own folder"/);
});
