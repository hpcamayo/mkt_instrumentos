// Explicit local integration test for the card impression rollup and the event retention (launch audit A33,
// supabase/migrations/20261114180000_launch_audit_analytics.sql, and A18's marketplace-event-retention). The two jobs
// work on the same old events: they must take turns, never hold the same events at once. And a rollup step must skip
// an impression another transaction holds (an account being anonymized, a listing being deleted) rather than wait for
// it, leaving that day for the next step. Three connections replay it.
// Usage: node tests/launch-audit-analytics.integration.cjs [postgresql://postgres:postgres@127.0.0.1:54322/postgres]
// The URL may also come from LARIA_TEST_DATABASE_URL. Hosted databases are refused. The database needs every
// migration applied (setup-local-db.sh reset); the fixtures it commits are removed and both clocks put back at the end.
const assert = require("node:assert/strict");
const { Client } = require("pg");

const url =
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ||
  process.env.LARIA_TEST_DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) {
  throw new Error("Local database URL required.");
}

const seller = "a3310000-0000-4000-8000-000000000001";
const listing = "a3310000-0000-4000-8000-000000000002";
// Impressions n of each fixture day: id(day, n).
const eventId = (daysAgo, n) => `a3310000-0000-4000-8${String(daysAgo).padStart(3, "0")}-${String(n).padStart(12, "0")}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = (promise) =>
  promise.then(
    (result) => ({ ok: true, rows: result.rows, at: Date.now() }),
    (error) => ({ ok: false, code: error.code, message: error.message, at: Date.now() }),
  );
// Resolves to null when the promise is still waiting after ms.
const within = (promise, ms) => Promise.race([promise, sleep(ms).then(() => null)]);

async function connect() {
  const client = new Client({ connectionString: url, statement_timeout: 30_000 });
  await client.connect();
  return client;
}

async function cleanup(control) {
  await control.query("begin");
  await control.query("select set_config('app.allow_listing_admin_fields', 'true', true)");
  await control.query("delete from laria_private.listing_impression_days where listing_id = $1", [listing]);
  await control.query("delete from public.marketplace_events where listing_id = $1", [listing]);
  await control.query("delete from public.listings where id = $1", [listing]);
  await control.query("delete from auth.users where id = $1", [seller]);
  await control.query("commit");
}

// The day the rollup has reached, as days before today in Lima.
async function clockDaysAgo(control) {
  const { rows } = await control.query(
    "select (now() at time zone 'America/Lima')::date - next_day as days from laria_private.listing_impression_rollup_clock",
  );
  return rows[0].days;
}

async function moved(control, daysAgo) {
  const { rows } = await control.query(
    `select coalesce(sum(impressions), 0)::integer as impressions from laria_private.listing_impression_days
     where listing_id = $1 and day = (now() at time zone 'America/Lima')::date - $2::integer`,
    [listing, daysAgo],
  );
  return rows[0].impressions;
}

async function main() {
  const control = await connect();
  const retention = await connect();
  const rollup = await connect();
  let clocks;
  try {
    await cleanup(control);
    // Both clocks as they were, to put back at the end.
    clocks = {
      rollup: (await control.query("select next_day from laria_private.listing_impression_rollup_clock")).rows[0],
      scrub: (await control.query("select * from laria_private.marketplace_event_scrub_clock")).rows[0],
    };
    await control.query("begin");
    await control.query(
      `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, raw_app_meta_data, raw_user_meta_data)
       values ($1, 'authenticated', 'authenticated', 'a33-rollup@example.invalid', '', now(), now(), '{}', $2)`,
      [seller, JSON.stringify({ account_type: "seller", full_name: "Rollup A33", phone: "51911133101", city: "Lima", region: "Lima" })],
    );
    await control.query("set local session_replication_role = replica");
    await control.query(
      `insert into public.listings (id, owner_user_id, seller_type, status, title, slug, description, category, instrument_type,
         brand, model, condition, price_pen, city, region, contact_name, whatsapp_phone, published_at)
       values ($1, $2, 'individual', 'approved', 'Guitarra rollup A33', 'a33-rollup', 'Guitarra de prueba para el rollup y la retención.',
         'guitars', 'electric_guitar', 'QA', 'A33', 'Usado - buen estado', 1000, 'Lima', 'Lima', 'Rollup A33', '51911133101', now())`,
      [listing, seller],
    );
    await control.query("set local session_replication_role = origin");
    // Two impressions 100 days ago, two 99 days ago and three 98 days ago, at noon in Lima.
    for (const [daysAgo, count] of [[100, 2], [99, 2], [98, 3]]) {
      for (let n = 1; n <= count; n += 1) {
        await control.query(
          `insert into public.marketplace_events (id, event_type, created_at, listing_id, seller_user_id, session_id, source)
           values ($1, 'listing_impression', (((now() at time zone 'America/Lima')::date - $2::integer) + time '12:00') at time zone 'America/Lima',
             $3, $4, gen_random_uuid(), 'catalog')`,
          [eventId(daysAgo, n), daysAgo, listing, seller],
        );
      }
    }
    await control.query(
      `insert into laria_private.listing_impression_rollup_clock (next_day) values ((now() at time zone 'America/Lima')::date - 100)
       on conflict (id) do update set next_day = excluded.next_day`,
    );
    await control.query("commit");

    // 1. The retention is running when a rollup step starts: the step waits for it, then moves the impressions.
    await retention.query("begin");
    await retention.query("select laria_private.scrub_marketplace_events(5000)");
    const stepStarted = Date.now();
    const step = settle(rollup.query("select laria_private.roll_up_listing_impressions(2) as moved"));
    assert.equal(await within(step, 500), null, "a rollup step waits while the retention runs");
    await retention.query("commit");
    const retentionDone = Date.now();
    const stepResult = await step;
    assert.ok(stepResult.ok, `the step goes on once the retention commits: ${stepResult.message ?? ""}`);
    assert.ok(stepResult.at >= retentionDone, "it finished only after the retention committed");
    assert.equal(await moved(control, 100), 2, "and moved the day's impressions");
    console.log(`PASS the retention first: the rollup step waited ${retentionDone - stepStarted} ms, then moved its impressions`);

    // 2. A rollup step is running when the retention starts: the retention waits for it.
    await rollup.query("begin");
    await rollup.query("select laria_private.roll_up_listing_impressions(2)");
    const retentionStarted = Date.now();
    const run = settle(retention.query("select laria_private.scrub_marketplace_events(5000) as read"));
    assert.equal(await within(run, 500), null, "the retention waits while a rollup step runs");
    await rollup.query("commit");
    const stepDone = Date.now();
    const runResult = await run;
    assert.ok(runResult.ok, `the retention goes on once the step commits: ${runResult.message ?? ""}`);
    assert.ok(runResult.at >= stepDone, "it finished only after the step committed");
    assert.equal(await moved(control, 99), 2, "the step moved its day");
    console.log(`PASS the rollup first: the retention waited ${stepDone - retentionStarted} ms`);

    // 3. Another transaction holds one impression of the next day (as an account anonymization does while it unlinks
    // its events): the step skips it at once, moves the rest and keeps the day for the next step.
    await retention.query("begin");
    await retention.query("update public.marketplace_events set session_id = null where id = $1", [eventId(98, 1)]);
    const skipStarted = Date.now();
    const skipped = await settle(rollup.query("select laria_private.roll_up_listing_impressions(10000) as moved"));
    const took = skipped.at - skipStarted;
    assert.ok(skipped.ok, `the step goes in: ${skipped.message ?? ""}`);
    assert.ok(took < 500, `the step doesn't wait for the held impression (${took} ms)`);
    assert.equal(await moved(control, 98), 2, "it moved the two impressions nobody held");
    assert.equal(await clockDaysAgo(control), 98, "and the day stays for the next step");
    await retention.query("commit");
    await rollup.query("select laria_private.roll_up_listing_impressions(10000)");
    assert.equal(await moved(control, 98), 3, "the next step moves the last one");
    assert.ok((await clockDaysAgo(control)) < 98, "and the clock moves on");
    const left = await control.query("select count(*)::integer as count from public.marketplace_events where listing_id = $1", [listing]);
    assert.equal(left.rows[0].count, 0, "no impression is left behind or counted twice");
    console.log(`PASS a held impression: the step skipped it in ${took} ms, and the next step moved it`);
  } finally {
    for (const client of [retention, rollup]) await client.query("rollback").catch(() => undefined);
    await cleanup(control).catch((error) => console.error("cleanup failed:", error.message));
    if (clocks) {
      await control.query("begin");
      if (clocks.rollup) {
        await control.query("update laria_private.listing_impression_rollup_clock set next_day = $1 where id", [clocks.rollup.next_day]);
      } else {
        await control.query("delete from laria_private.listing_impression_rollup_clock where id");
      }
      if (clocks.scrub) {
        await control.query(
          `update laria_private.marketplace_event_scrub_clock set browsing_at = $1, browsing_id = $2, other_at = $3, other_id = $4 where id`,
          [clocks.scrub.browsing_at, clocks.scrub.browsing_id, clocks.scrub.other_at, clocks.scrub.other_id],
        );
      } else {
        await control.query("delete from laria_private.marketplace_event_scrub_clock where id");
      }
      await control.query("commit");
    }
    await Promise.all([control.end(), retention.end(), rollup.end()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
