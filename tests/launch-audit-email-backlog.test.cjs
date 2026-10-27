// Launch audit A25 (supabase/migrations/20261114160000_launch_audit_email_backlog.sql): Vercel Cron runs the e-mail,
// push and import cleanup jobs, and the claim expires, orders and limits what it sends. The claim itself is checked on
// the database (tests/launch-audit-email-backlog.sql).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migrationFile = "supabase/migrations/20261114160000_launch_audit_email_backlog.sql";

function load(file, mocks) {
  const Module = require("node:module");
  const ts = require("typescript");
  const source = path.join(root, file);
  const compiled = ts.transpileModule(fs.readFileSync(source, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = new Module(source, module);
  mod.filename = source;
  mod.paths = module.paths;
  const original = mod.require.bind(mod);
  mod.require = (name) => (Object.hasOwn(mocks, name) ? mocks[name] : original(name));
  mod._compile(compiled, source);
  return mod.exports;
}

test("A25: Vercel Cron runs the e-mail and push workers every 5 minutes and the import cleanup daily", () => {
  const crons = JSON.parse(read("vercel.json")).crons;
  for (const [cronPath, schedule] of [
    ["/api/internal/email/process", "*/5 * * * *"],
    ["/api/internal/push/process", "*/5 * * * *"],
    ["/api/internal/store-imports/cleanup", "15 8 * * *"],
  ]) {
    assert.deepEqual(crons.find((cron) => cron.path === cronPath), { path: cronPath, schedule });
    assert.match(read(`app${cronPath}/route.ts`), /export async function GET\(request: Request\)[\s\S]*CRON_SECRET[\s\S]*timingSafeEqual/, cronPath);
  }
  assert.equal(new Set(crons.map((cron) => cron.path)).size, crons.length, "each job once");
});

test("A25: every kind the claim names for age or order is a kind the e-mails know", () => {
  const migration = read(migrationFile);
  const templates = read("lib/email/templates.ts");
  const known = new Set([...templates.matchAll(/case "([a-z_]+)":/g)].map((match) => match[1]));
  for (const name of ["email_max_age", "email_priority"]) {
    const body = migration.match(new RegExp(`function laria_private\\.${name}\\(p_event_type text\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`));
    assert.ok(body, name);
    const kinds = [...body[1].matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    assert.ok(kinds.length >= 5, name);
    for (const kind of kinds) assert.ok(known.has(kind), `${name}: ${kind} has no e-mail template`);
  }
});

test("A25: the claim keeps its signature and checks, and the migration its place and lock step", () => {
  const migration = read(migrationFile);
  assert.match(migration, /create or replace function public\.claim_marketplace_email_deliveries\(p_worker_id uuid, p_limit integer default 25\)\nreturns jsonb/);
  assert.match(migration, /auth\.role\(\) is distinct from 'service_role' or p_worker_id is null or p_limit not between 1 and 100/);
  assert.match(migration, /failure_code = 'listing_out_of_stock'/, "review fix A7 stays");
  assert.match(migration, /revoke all on function laria_private\.set_email_daily_limit\(integer, text\) from public, anon, authenticated, service_role;/);
  assert.ok(path.basename(migrationFile) < "20261201000000", "below the features/marketplace migrations");
  assert.match(migration, /^set lock_timeout = '10s';$/m);
  assert.match(migration, /^reset lock_timeout;$/m);
});

test("A25: a failure Resend may have accepted is the kind the claim retries first and gives up after 23 hours", async () => {
  const migration = read(migrationFile);
  const listed = migration.match(/uncertain_since = case when p_failure_category in \(([^)]+)\)/);
  assert.ok(listed, "fail_marketplace_email_delivery marks uncertain sends");
  const uncertain = [...listed[1].matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
  assert.deepEqual(uncertain, ["transport", "provider"]);
  assert.match(migration, /uncertain_since = coalesce\(uncertain_since, last_attempt_at, locked_at\)/, "a worker that stopped while sending");
  assert.match(migration, /set status = 'failed', failure_code = 'retry_window_closed'\n  where status in \('pending', 'retry'\) and uncertain_since < clock_timestamp\(\) - interval '23 hours';/);
  assert.match(migration, /order by delivery\.uncertain_since is null, laria_private\.email_priority/);

  const { ResendMarketplaceEmailProvider } = load("lib/email/provider.ts", { "server-only": {} });
  const failure = async (respond) => {
    const adapter = new ResendMarketplaceEmailProvider("key", "Laria <notificaciones@laria.audio>", respond);
    try {
      await adapter.send({ to: "qa@example.invalid", subject: "QA", html: "", text: "", idempotencyKey: "delivery-id" });
    } catch (error) {
      return error;
    }
    throw new Error("the send was expected to fail");
  };
  const reply = (status, body = {}) => async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  // May have been accepted: Resend could have sent it before the answer was lost or broke.
  for (const [label, respond] of [
    ["timeout", async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); }],
    ["connection lost", async () => { throw new TypeError("fetch failed"); }],
    ["408", reply(408)], ["409", reply(409)], ["500", reply(500)], ["503", reply(503)], ["no id", reply(200, {})],
  ]) {
    const error = await failure(respond);
    assert.ok(error.retryable && uncertain.includes(error.category), `${label}: ${error.category}`);
  }
  // Not sent: a rate limit or a refusal.
  for (const [label, status] of [["429", 429], ["422", 422], ["401", 401]]) {
    const error = await failure(reply(status));
    assert.ok(!uncertain.includes(error.category), `${label}: ${error.category}`);
  }
});

test("A25: e-mails the old worker already tried count as uncertain from when they were queued", () => {
  const migration = read(migrationFile);
  // Codex's second review: their earlier failures can't be told apart, so none may be resent after Resend forgets them.
  const backfill = "update laria_private.marketplace_email_deliveries\nset uncertain_since = created_at\n"
    + "where uncertain_since is null and attempt_count > 0 and status in ('pending', 'retry', 'processing');";
  const at = migration.indexOf(backfill);
  assert.ok(at > 0, "the migration marks them");
  assert.ok(at > migration.indexOf("add column if not exists uncertain_since timestamptz;"), "after the column exists");
  assert.ok(at < migration.indexOf("create or replace function public.claim_marketplace_email_deliveries"), "before the new claim");
});

test("A25: only the claim hands an e-mail out, and a send Resend may have accepted keeps its place in the day's limit", () => {
  const migration = read(migrationFile);
  // Codex's third review: a claim that runs the old body across the migration's commit must hand nothing out.
  assert.match(migration, /create trigger marketplace_email_deliveries_claim_fence\nbefore update of status on laria_private\.marketplace_email_deliveries\nfor each row when \(new\.status = 'processing' and old\.status is distinct from 'processing'\)\nexecute function laria_private\.marketplace_email_claim_fence\(\);/);
  assert.match(migration, /if current_setting\('laria\.email_claim', true\) is distinct from 'a25' then\n\s+raise exception using errcode = '55000', message = 'EMAIL_CLAIM_OUTDATED'/);
  assert.ok(migration.indexOf("create trigger marketplace_email_deliveries_claim_fence") > migration.indexOf("add column if not exists uncertain_since timestamptz;"),
    "created while the column's lock is held");
  const claim = migration.slice(migration.indexOf("create or replace function public.claim_marketplace_email_deliveries"));
  const fence = claim.indexOf("perform set_config('laria.email_claim', 'a25', true);");
  assert.ok(fence > 0 && fence < claim.indexOf("set status = 'processing'"), "the claim sets the fence, for its transaction, before its hand-out");
  assert.match(claim, /where maybe\.uncertain_since is not null and maybe\.status not in \('sent', 'processing'\)\n\s+and maybe\.last_attempt_at >= day_start\)\)\)/,
    "the allowance keeps the places of sends Resend may have accepted today");
  assert.match(migration, /create index if not exists marketplace_email_uncertain_idx on laria_private\.marketplace_email_deliveries \(last_attempt_at\)\n  where uncertain_since is not null and status not in \('sent', 'processing'\);/);
});
