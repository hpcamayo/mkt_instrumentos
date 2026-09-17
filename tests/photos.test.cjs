const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const compiled = ts.transpileModule(fs.readFileSync("lib/submission-token.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", compiled)(require, mod, mod.exports);
const tokens = mod.exports;

test("edit capabilities are domain-separated and bound to owner, listing and attempt", () => {
  const owner = crypto.randomUUID(); const listing = crypto.randomUUID();
  const edit = tokens.createListingEditToken(listing, owner, "qa-key");
  assert.equal(tokens.readListingEditToken(edit.token, listing, owner, "qa-key"), edit.attemptId);
  for (const [token, id, user, key] of [[edit.token, crypto.randomUUID(), owner, "qa-key"], [edit.token, listing, crypto.randomUUID(), "qa-key"], [edit.token, listing, owner, "wrong-key"], [edit.token + "x", listing, owner, "qa-key"], [tokens.createSubmissionToken("listing", "qa-key", owner).token, listing, owner, "qa-key"]]) {
    assert.equal(tokens.readListingEditToken(token, id, user, key), null);
  }
  assert.equal(tokens.readSubmissionToken(edit.token, "qa-key"), null);
});

test("photo editor retains persisted proposal state rather than stale local files", () => {
  const editor = fs.readFileSync("components/listing-edit-form.tsx", "utf8");
  const page = fs.readFileSync("app/mi-cuenta/publicaciones/[id]/editar/page.tsx", "utf8");
  assert.match(page, /key=.*updated_at.*version/);
  assert.match(editor, /prepared request|attempt\.prepared/);
  assert.match(editor, /restoreLivePhotos/);
  assert.match(editor, /fieldset disabled=\{busy\}/);
  assert.match(editor, /min-h-11/);
  assert.match(editor, /altText: photo\.alt_text \?\? ""/);
});

test("private proposed images require references and cleanup is serialized with attachment", () => {
  const migration = fs.readFileSync("supabase/migrations/20260916180000_sprint_4_photos.sql", "utf8");
  const image = fs.readFileSync("app/api/listing-images/[...path]/route.ts", "utf8");
  assert.match(migration, /'listing-edit-photos', 'listing-edit-photos', false/);
  assert.match(migration, /for update/);
  assert.match(migration, /listing_photo_cleanup_claims/);
  assert.match(migration, /listing_revision_photos where/);
  assert.match(migration, /sha256\(convert_to/);
  assert.match(migration, /release_empty_revision_photos/);
  assert.match(image, /listing_revision_photos/);
  assert.match(image, /stores\?\.status === "active"/);
  assert.match(image, /no-store/);
});
