// Explicit local integration test for launch audit A25's claim fence (supabase/migrations/20261114160000_launch_audit_
// email_backlog.sql, Codex's third review). A claim that began with the old function before the migration committed, and
// waited for the queue's lock, goes on with the old function's body after the commit, without the 23-hour window, the
// expiry or the daily limit. Three connections replay it: the migration holds the queue's lock while it puts the fence
// in place; the old body, its plans already cached, waits for that lock; after the commit its hand-out fails with
// EMAIL_CLAIM_OUTDATED and changes nothing, and the new claim then hands the e-mail out.
// Usage: node tests/launch-audit-email-backlog.integration.cjs [postgresql://postgres:postgres@127.0.0.1:54322/postgres]
// The URL may also come from LARIA_TEST_DATABASE_URL. Hosted databases are refused. The database needs every
// migration applied (setup-local-db.sh reset); the fixtures it commits and the old body's copy are removed at the end.
const assert = require("node:assert/strict");
const { Client } = require("pg");

const url =
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ||
  process.env.LARIA_TEST_DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) {
  throw new Error("Local database URL required.");
}

const recipient = "a2530000-0000-4000-8000-000000000001";
const delivery = "a2530000-0000-4000-8000-000000000002";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = (promise) =>
  promise.then(
    (result) => ({ ok: true, rows: result.rows }),
    (error) => ({ ok: false, code: error.code, message: error.message }),
  );
// Resolves to null when the promise is still waiting after ms.
const within = (promise, ms) => Promise.race([promise, sleep(ms).then(() => null)]);

async function connect() {
  const client = new Client({ connectionString: url, statement_timeout: 30_000 });
  await client.connect();
  return client;
}

// The claim as production ran it before this migration (20261029120200_review_fixes_alerts_and_import.sql), without its
// service-role check, which this test's connection doesn't need.
const oldClaim = `
create or replace function laria_private.qa_a25_old_claim(p_worker_id uuid, p_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private, auth
as $$
declare result jsonb;
begin
  update laria_private.marketplace_email_deliveries
  set status = case when attempt_count >= 5 then 'failed' else 'retry' end,
      next_attempt_at = clock_timestamp(), locked_at = null, locked_by = null,
      failure_category = coalesce(failure_category, 'transport'),
      failure_code = coalesce(failure_code, 'stale_worker_lock')
  where status = 'processing' and locked_at < clock_timestamp() - interval '15 minutes';

  update laria_private.search_alert_matches match
  set delivery_id = null, suppressed_at = clock_timestamp(), suppression_reason = 'listing_out_of_stock'
  from laria_private.marketplace_email_deliveries delivery, public.listings listing
  where match.delivery_id = delivery.id and delivery.status in ('pending', 'retry')
    and delivery.event_type = 'search_alert_daily'
    and listing.id = match.listing_id and listing.stock_state = 'out_of_stock';
  update laria_private.marketplace_email_deliveries delivery
  set status = 'cancelled', failure_code = 'listing_out_of_stock'
  where delivery.status in ('pending', 'retry')
    and ((delivery.event_type in ('listing_price_drop', 'search_alert_immediate')
          and exists (select 1 from public.listings listing
                      where listing.id = delivery.listing_id and listing.stock_state = 'out_of_stock'))
      or (delivery.event_type = 'search_alert_daily'
          and not exists (select 1 from laria_private.search_alert_matches match where match.delivery_id = delivery.id)));

  with candidates as (
    select delivery.id
    from laria_private.marketplace_email_deliveries delivery
    left join public.saved_search_alerts alert on alert.id = delivery.search_alert_id
    where delivery.status in ('pending','retry')
      and delivery.next_attempt_at <= clock_timestamp()
      and delivery.attempt_count < 5
      and (delivery.search_alert_id is null or alert.status = 'active')
    order by delivery.created_at, delivery.id
    for update of delivery skip locked
    limit p_limit
  ), updated as (
    update laria_private.marketplace_email_deliveries delivery
    set status = 'processing', attempt_count = attempt_count + 1,
        last_attempt_at = clock_timestamp(), locked_at = clock_timestamp(), locked_by = p_worker_id,
        recipient_email = auth_user.email, failure_category = null, failure_code = null
    from candidates, auth.users auth_user
    where delivery.id = candidates.id and auth_user.id = delivery.recipient_user_id
    returning delivery.*
  )
  select coalesce(jsonb_agg(laria_private.marketplace_email_payload(updated) order by updated.created_at, updated.id), '[]'::jsonb)
  into result from updated;
  return result;
end;
$$`;

async function cleanup(control) {
  await control.query("drop function if exists laria_private.qa_a25_old_claim(uuid, integer)");
  await control.query("delete from laria_private.marketplace_email_deliveries where recipient_user_id = $1", [recipient]);
  await control.query("delete from auth.users where id = $1", [recipient]);
}

async function deliveryRow(control) {
  const { rows } = await control.query(
    "select status, attempt_count, locked_by from laria_private.marketplace_email_deliveries where id = $1",
    [delivery],
  );
  return rows[0];
}

async function main() {
  const control = await connect();
  const migration = await connect();
  const worker = await connect();
  try {
    await cleanup(control);
    await control.query(
      `insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
       values ($1, 'authenticated', 'authenticated', 'la25-fence@example.invalid', now(), '{}',
         '{"account_type":"seller","full_name":"Persona A25","phone":"51999992531","city":"Lima","region":"Lima"}')`,
      [recipient],
    );
    // Queued an hour ago, not due yet.
    await control.query(
      `insert into laria_private.marketplace_email_deliveries (id, event_type, recipient_user_id, dedupe_key, created_at, next_attempt_at)
       values ($1, 'store_approved', $2, 'la25-fence', now() - interval '1 hour', now() + interval '1 day')`,
      [delivery, recipient],
    );
    await control.query(oldClaim);

    // The worker's connection has run the old claim before, so its plans are cached. That run hands out nothing it
    // keeps: it sets the fence and is rolled back.
    await worker.query("begin");
    await worker.query("select set_config('laria.email_claim', 'a25', true)");
    await worker.query("select laria_private.qa_a25_old_claim(gen_random_uuid(), 25)");
    await worker.query("rollback");

    // The e-mail is due. The migration holds the queue's lock (its column change takes ACCESS EXCLUSIVE) while it puts
    // the fence in place, replayed here by dropping the fence's trigger and creating it again in one transaction.
    await control.query("update laria_private.marketplace_email_deliveries set next_attempt_at = now() - interval '1 minute' where id = $1", [delivery]);
    const { rows: trigger } = await control.query(
      `select pg_get_triggerdef(oid) as definition from pg_trigger
       where tgrelid = 'laria_private.marketplace_email_deliveries'::regclass and tgname = 'marketplace_email_deliveries_claim_fence'`,
    );
    assert.equal(trigger.length, 1, "the fence's trigger exists");
    await migration.query("begin");
    await migration.query("lock table laria_private.marketplace_email_deliveries in access exclusive mode");
    await migration.query("drop trigger marketplace_email_deliveries_claim_fence on laria_private.marketplace_email_deliveries");

    // The old claim starts now, with the old body, and waits for the queue's lock.
    const { rows: [{ pid }] } = await worker.query("select pg_backend_pid() as pid");
    const oldRun = settle(worker.query("select laria_private.qa_a25_old_claim(gen_random_uuid(), 25)"));
    assert.equal(await within(oldRun, 700), null, "the old claim waits for the migration");
    const { rows: waiting } = await control.query("select wait_event_type from pg_stat_activity where pid = $1", [pid]);
    assert.equal(waiting[0]?.wait_event_type, "Lock", "it waits for the queue's lock");

    await migration.query(trigger[0].definition);
    await migration.query("commit");

    const outcome = await oldRun;
    assert.equal(outcome.ok, false, "the old body's hand-out is refused");
    assert.equal(outcome.code, "55000");
    assert.match(outcome.message, /EMAIL_CLAIM_OUTDATED/);
    assert.deepEqual(await deliveryRow(control), { status: "pending", attempt_count: 0, locked_by: null }, "nothing was handed out");

    // The next run uses the new claim, which sets the fence. Rolled back, so no other queued e-mail is touched.
    await worker.query("begin");
    await worker.query("set local role service_role");
    await worker.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    const { rows: [{ claim }] } = await worker.query(
      "select public.claim_marketplace_email_deliveries(gen_random_uuid(), 100) as claim",
    );
    assert.ok(claim.some((row) => row.delivery_id === delivery), "the new claim hands the e-mail out");
    await worker.query("rollback");
    console.log("PASS A25 fence: an old claim waiting across the migration's commit hands nothing out; the new claim does.");
  } finally {
    await migration.query("rollback").catch(() => {});
    await worker.query("rollback").catch(() => {});
    await cleanup(control).catch((error) => console.error("cleanup", error.message));
    await Promise.all([control.end(), migration.end(), worker.end()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
