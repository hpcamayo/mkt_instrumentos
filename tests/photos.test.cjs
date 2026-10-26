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

test("launch audit A35: draft and edit capabilities expire and use their own key", () => {
  const owner = crypto.randomUUID(); const listing = crypto.randomUUID();
  const now = Date.UTC(2026, 9, 26, 12);
  const edit = tokens.createListingEditToken(listing, owner, "qa-key", now);
  assert.equal(tokens.readListingEditToken(edit.token, listing, owner, "qa-key", now + 23 * 3600e3), edit.attemptId);
  assert.equal(tokens.readListingEditToken(edit.token, listing, owner, "qa-key", now + 24 * 3600e3), null);
  const draft = tokens.createSubmissionToken("listing", "qa-key", owner, undefined, now);
  assert.equal(tokens.readSubmissionToken(draft.token, "qa-key", now + 6 * 86400e3)?.id, draft.id);
  assert.equal(tokens.readSubmissionToken(draft.token, "qa-key", now + 7 * 86400e3), null);
  // A token from before expiry existed (no exp) is refused.
  const crypto_ = require("node:crypto");
  const legacy = Buffer.from(JSON.stringify({ id: crypto.randomUUID(), kind: "listing" })).toString("base64url");
  const signature = crypto_.createHmac("sha256", "qa-key").update(`marketplace-submission:${legacy}`).digest("base64url");
  assert.equal(tokens.readSubmissionToken(`${legacy}.${signature}`, "qa-key"), null);
  // The signing key is derived from the service role key unless SUBMISSION_TOKEN_SECRET is set, never the key itself.
  const saved = { own: process.env.SUBMISSION_TOKEN_SECRET, service: process.env.SUPABASE_SERVICE_ROLE_KEY };
  try {
    delete process.env.SUBMISSION_TOKEN_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-for-tests";
    const derived = tokens.submissionTokenSecret();
    assert.ok(derived && derived !== "service-role-key-for-tests");
    process.env.SUBMISSION_TOKEN_SECRET = "short";
    assert.equal(tokens.submissionTokenSecret(), derived);
    process.env.SUBMISSION_TOKEN_SECRET = "x".repeat(32);
    assert.equal(tokens.submissionTokenSecret(), "x".repeat(32));
    delete process.env.SUBMISSION_TOKEN_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal(tokens.submissionTokenSecret(), null);
  } finally {
    if (saved.own === undefined) delete process.env.SUBMISSION_TOKEN_SECRET; else process.env.SUBMISSION_TOKEN_SECRET = saved.own;
    if (saved.service === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = saved.service;
  }
});
