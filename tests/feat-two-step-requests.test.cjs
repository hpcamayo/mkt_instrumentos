// Feature ideas, integration (20261210120700, safe-08): a session that still owes its authenticator code may use
// nothing but the code step. The database side is tests/feat-two-step-requests.sql; these check the app around it.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/20261210120700_feat_two_step_requests.sql");

test("safe-08: the pre-request check lets through exactly the calls of signing in and the code step", () => {
  const list = migration.match(/coalesce\(current_setting\('request\.path', true\), ''\) in \(\n([^)]*)\)/);
  assert.ok(list, "the check's list of paths");
  const allowed = [...list[1].matchAll(/'\/rpc\/([a-z_]+)'/g)].map((match) => match[1]).sort();
  assert.deepEqual(allowed, ["my_two_step_owed", "my_two_step_requirement", "record_sign_in_device", "use_my_recovery_code"]);
  // Each is called where a session that owes its code is: the guard below, Seguridad and the middleware, the sign-in
  // routes, and "No tengo mi teléfono".
  assert.match(read("lib/auth/complete-session.ts"), /\.rpc\("my_two_step_owed"\)/);
  assert.match(read("app/mi-cuenta/seguridad/page.tsx"), /\.rpc\("my_two_step_requirement"\)/);
  assert.match(read("lib/auth/two-step-gate.ts"), /\.rpc\("my_two_step_requirement"\)/);
  assert.match(read("lib/auth/devices.ts"), /\.rpc\("record_sign_in_device"/);
  assert.match(read("app/api/account/two-step/recovery/route.ts"), /\.rpc\("use_my_recovery_code"/);
  assert.match(migration, /^alter role authenticator set pgrst\.db_pre_request = 'public\.check_two_step_request';$/m);
  assert.match(migration, /^notify pgrst, 'reload config';$/m);
});

// The service role skips the database's check, so every file that uses it says why a session that owes its code gets
// nothing through it. A new one fails here until it is added.
const SERVICE_ROLE_USES = {
  "app/api/listing-images/[...path]/route.ts": "guarded",
  "app/api/listings/refresh/route.ts": "guarded",
  "app/api/store/mercado-libre/callback/route.ts": "guarded (mlOwner)",
  "lib/mercadolibre/server.ts": "called by the Mercado Libre routes after mlOwner, which is guarded",
  "app/api/account/delete/route.ts": "the account's own my_account_deletion_check comes first",
  "app/api/account/two-step/recovery/route.ts": "the code step itself (use_my_recovery_code)",
  "app/api/listings/[id]/manage/route.ts": "the owner's own listing read comes first",
  "app/api/review-photos/[id]/route.ts": "the caller's own get_review_photo_object comes first",
  "app/api/trade-photos/[...path]/route.ts": "the caller's own can_view_trade_photo comes first",
  "app/api/store/dealers/[id]/complete/route.ts": "the owner's own get_store_dealer_authorizations comes first",
  "app/api/store/receipts/route.ts": "every read and change goes through the owner's own client",
  "app/api/submissions/route.ts": "the account's own profile or draft read comes first on every action",
  "lib/store-import/photos-server.ts": "the owner's own read of the import comes first",
  "lib/store-import/publication-server.ts": "the owner's own read of the import comes first",
  "app/admin/equipos-reportados/page.tsx": "Admin: is_admin() needs aal2 (launch audit A15)",
  "app/admin/fotos-repetidas/page.tsx": "Admin: is_admin() needs aal2",
  "app/api/admin/dealers/[id]/document/route.ts": "Admin: is_admin() needs aal2",
  "app/api/admin/invite-user/route.ts": "Admin: is_admin() needs aal2",
  "app/api/admin/listing-flags/route.ts": "Admin: is_admin() needs aal2",
  "app/api/contact/route.ts": "a public listing's contact for anyone; reads nothing of the account",
  "app/api/services/events/route.ts": "records a view or contact; reads nothing of the account",
  "lib/marketplace-events-server.ts": "records events; reads nothing of the account",
  "app/instrumentos/[slug]/page.tsx": "the public listing page",
  "lib/share-image.tsx": "public share images",
  "app/api/auth/check-email/route.ts": "before signing in",
  "app/api/email/unsubscribe/route.ts": "a signed e-mail link, no session",
  "lib/rate-limit.ts": "counters only",
  "app/api/health/route.ts": "no session",
  "lib/email/marketplace-email.ts": "jobs (CRON_SECRET)",
  "lib/listing-photo-cleanup.ts": "jobs and routes above, after their checks",
  "lib/selling-jobs.ts": "jobs (CRON_SECRET)",
};

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, files);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(file);
  }
  return files;
}

test("safe-08: every use of the service role says why a session that owes its code gets nothing through it", () => {
  const users = [...walk("app"), ...walk("lib")]
    .filter((file) => file !== "lib/supabase/admin-client.ts" && /getSupabaseAdminClient\(\)/.test(read(file)))
    .filter((file) => !file.startsWith("app/api/internal/"));
  const unlisted = users.filter((file) => !SERVICE_ROLE_USES[file]);
  assert.deepEqual(unlisted, [], "say in SERVICE_ROLE_USES why these are safe, or ask sessionOwesTwoStep first");
  const gone = Object.keys(SERVICE_ROLE_USES).filter((file) => !users.includes(file));
  assert.deepEqual(gone, [], "listed, but no longer use the service role");
  for (const [file, why] of Object.entries(SERVICE_ROLE_USES)) {
    if (why === "guarded") assert.match(read(file), /await sessionOwesTwoStep\(/, file);
    if (why.startsWith("Admin")) assert.match(read(file), /requireAdmin\(|rpc\("is_admin"\)|admin_get_dealer_document/, file);
  }
  assert.match(read("lib/mercadolibre/routes.ts"), /if \(await sessionOwesTwoStep\(client\)\) return \{ response:/);
  // A failed check counts as owing the code.
  assert.match(read("lib/auth/complete-session.ts"), /return Boolean\(error\) \|\| data !== false;/);
});
