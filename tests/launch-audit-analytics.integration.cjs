// Explicit local integration test for the card impression rollup and the event retention (launch audit A33,
// supabase/migrations/20261114180000_launch_audit_analytics.sql, and A18's marketplace-event-retention). The two jobs
// work on the same old events: they must take turns, never hold the same events at once. And a rollup step must never
// wait for an account anonymization or a listing deletion: it skips an impression another transaction holds, or whose
// listing or seller another transaction holds (they hold it before they reach the events), and leaves that day for the
// next step. Those then wait only for the step, so the two can't deadlock. Five connections replay it, with the real
// deletion and laria_private.anonymize_account_core.
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
// Another account, and the listings of scenarios 4 (deleted) and 5 (its seller anonymized).
const seller2 = "a3310000-0000-4000-8000-000000000003";
const listing2 = "a3310000-0000-4000-8000-000000000004";
const listing3 = "a3310000-0000-4000-8000-000000000005";
const listings = [listing, listing2, listing3];
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
  await control.query("delete from laria_private.listing_impression_days where listing_id = any ($1::uuid[])", [listings]);
  await control.query("delete from public.marketplace_events where listing_id = any ($1::uuid[])", [listings]);
  await control.query("delete from public.listings where id = any ($1::uuid[])", [listings]);
  await control.query("delete from laria_private.account_anonymizations where user_id = any ($1::uuid[])", [[seller, seller2]]);
  await control.query("delete from auth.users where id = any ($1::uuid[])", [[seller, seller2]]);
  await control.query("commit");
}

async function createSeller(control, id, email, phone) {
  await control.query(
    `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, raw_app_meta_data, raw_user_meta_data)
     values ($1, 'authenticated', 'authenticated', $2, '', now(), now(), '{}', $3)`,
    [id, email, JSON.stringify({ account_type: "seller", full_name: "Rollup A33", phone, city: "Lima", region: "Lima" })],
  );
}

// An approved listing, written directly (inside the caller's transaction).
async function createListing(control, id, owner, slug, phone) {
  await control.query("set local session_replication_role = replica");
  await control.query(
    `insert into public.listings (id, owner_user_id, seller_type, status, title, slug, description, category, instrument_type,
       brand, model, condition, price_pen, city, region, contact_name, whatsapp_phone, published_at)
     values ($1, $2, 'individual', 'approved', 'Guitarra rollup A33', $3, 'Guitarra de prueba para el rollup y la retención.',
       'guitars', 'electric_guitar', 'QA', 'A33', 'Usado - buen estado', 1000, 'Lima', 'Lima', 'Rollup A33', $4, now())`,
    [id, owner, slug, phone],
  );
  await control.query("set local session_replication_role = origin");
}

// Impression n of a listing, daysAgo days ago at noon in Lima, recorded for its seller.
async function addImpression(control, daysAgo, n, listingId, sellerId) {
  await control.query(
    `insert into public.marketplace_events (id, event_type, created_at, listing_id, seller_user_id, session_id, source)
     values ($1, 'listing_impression', (((now() at time zone 'America/Lima')::date - $2::integer) + time '12:00') at time zone 'America/Lima',
       $3, $4, gen_random_uuid(), 'catalog')`,
    [eventId(daysAgo, n), daysAgo, listingId, sellerId],
  );
}

async function setClockDaysAgo(control, daysAgo) {
  await control.query(
    `insert into laria_private.listing_impression_rollup_clock (next_day) values ((now() at time zone 'America/Lima')::date - $1::integer)
     on conflict (id) do update set next_day = excluded.next_day`,
    [daysAgo],
  );
}

// The day the rollup has reached, as days before today in Lima.
async function clockDaysAgo(control) {
  const { rows } = await control.query(
    "select (now() at time zone 'America/Lima')::date - next_day as days from laria_private.listing_impression_rollup_clock",
  );
  return rows[0].days;
}

async function moved(control, daysAgo, listingId = listing) {
  const { rows } = await control.query(
    `select coalesce(sum(impressions), 0)::integer as impressions from laria_private.listing_impression_days
     where listing_id = $1 and day = (now() at time zone 'America/Lima')::date - $2::integer`,
    [listingId, daysAgo],
  );
  return rows[0].impressions;
}

async function eventsLeft(control, listingId) {
  const { rows } = await control.query("select count(*)::integer as count from public.marketplace_events where listing_id = $1", [listingId]);
  return rows[0].count;
}

async function main() {
  const control = await connect();
  const retention = await connect();
  const rollup = await connect();
  const deleter = await connect();
  const anonymizer = await connect();
  let clocks;
  try {
    await cleanup(control);
    // Both clocks as they were, to put back at the end.
    clocks = {
      rollup: (await control.query("select next_day from laria_private.listing_impression_rollup_clock")).rows[0],
      scrub: (await control.query("select * from laria_private.marketplace_event_scrub_clock")).rows[0],
    };
    await control.query("begin");
    await createSeller(control, seller, "a33-rollup@example.invalid", "51911133101");
    await createListing(control, listing, seller, "a33-rollup", "51911133101");
    // Two impressions 100 days ago, two 99 days ago and three 98 days ago, at noon in Lima.
    for (const [daysAgo, count] of [[100, 2], [99, 2], [98, 3]]) {
      for (let n = 1; n <= count; n += 1) await addImpression(control, daysAgo, n, listing, seller);
    }
    await setClockDaysAgo(control, 100);
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
    assert.equal(await eventsLeft(control, listing), 0, "no impression is left behind or counted twice");
    console.log(`PASS a held impression: the step skipped it in ${took} ms, and the next step moved it`);

    // 4. A listing is being deleted: its row is held (a DELETE holds it before it reaches the listing's events) when a
    // step takes the day. The step skips that listing's impressions at once and moves the rest. The deletion then waits
    // only for the impressions the step still holds, and goes on when the step commits: neither waits for the other.
    await control.query("begin");
    await createListing(control, listing2, seller, "a33-rollup-2", "51911133101");
    await addImpression(control, 97, 1, listing, seller);
    await addImpression(control, 97, 11, listing2, seller);
    await addImpression(control, 97, 12, listing2, seller);
    await setClockDaysAgo(control, 97);
    await control.query("commit");
    await deleter.query("begin");
    await deleter.query("select set_config('app.allow_listing_admin_fields', 'true', true)");
    await deleter.query("select 1 from public.listings where id = $1 for update", [listing2]);
    await rollup.query("begin");
    const pastDeletion = await within(settle(rollup.query("select laria_private.roll_up_listing_impressions(10000) as moved")), 500);
    assert.ok(pastDeletion, "the step doesn't wait for the listing being deleted");
    assert.ok(pastDeletion.ok, `the step goes in: ${pastDeletion.message ?? ""}`);
    assert.equal(pastDeletion.rows[0].moved, 1, "it moved only the other listing's impression");
    const deletion = settle(deleter.query("delete from public.listings where id = $1", [listing2]));
    assert.equal(await within(deletion, 300), null, "the deletion waits for the impressions the step holds");
    await rollup.query("commit");
    const deleted = await deletion;
    assert.ok(deleted.ok, `the deletion goes on once the step commits: ${deleted.message ?? ""}`);
    await deleter.query("commit");
    assert.equal(await moved(control, 97), 1, "the other listing's impression was moved");
    assert.equal(await moved(control, 97, listing2), 0, "the deleted listing has no daily count");
    assert.equal(await eventsLeft(control, listing2), 0, "and its impressions went with it");
    assert.equal(await clockDaysAgo(control), 97, "the day stayed for the next step");
    await control.query("select laria_private.roll_up_listing_impressions(10000)");
    assert.ok((await clockDaysAgo(control)) < 97, "which finds it done and moves on");
    console.log("PASS a listing being deleted: the step skipped its impressions without waiting, and the deletion waited only for the step");

    // 5. An account is being anonymized: laria_private.anonymize_account_core holds its profile first, then unlinks its
    // events. A step that takes the day in between skips that seller's impressions at once; the anonymization waits only
    // for the impressions the step holds, then unlinks them, and the next step moves them without the seller.
    await control.query("begin");
    await createSeller(control, seller2, "a33-rollup-2@example.invalid", "51911133102");
    await createListing(control, listing3, seller2, "a33-rollup-3", "51911133102");
    await addImpression(control, 96, 1, listing, seller);
    await addImpression(control, 96, 21, listing3, seller2);
    await addImpression(control, 96, 22, listing3, seller2);
    await setClockDaysAgo(control, 96);
    await control.query("commit");
    await anonymizer.query("begin");
    await anonymizer.query("select 1 from public.profiles where id = $1 for update", [seller2]);
    await rollup.query("begin");
    const pastAnonymization = await within(settle(rollup.query("select laria_private.roll_up_listing_impressions(10000) as moved")), 500);
    assert.ok(pastAnonymization, "the step doesn't wait for the account being anonymized");
    assert.ok(pastAnonymization.ok, `the step goes in: ${pastAnonymization.message ?? ""}`);
    assert.equal(pastAnonymization.rows[0].moved, 1, "it moved only the other seller's impression");
    const anonymization = settle(anonymizer.query("select laria_private.anonymize_account_core($1, 'Prueba A33', null)", [seller2]));
    assert.equal(await within(anonymization, 300), null, "the anonymization waits for the impressions the step holds");
    await rollup.query("commit");
    const anonymized = await anonymization;
    assert.ok(anonymized.ok, `the anonymization goes on once the step commits: ${anonymized.message ?? ""}`);
    await anonymizer.query("commit");
    assert.equal(await moved(control, 96), 1, "the other seller's impression was moved");
    assert.equal(await moved(control, 96, listing3), 0, "the anonymized seller's impressions waited");
    const next = await control.query("select laria_private.roll_up_listing_impressions(10000) as moved");
    assert.equal(next.rows[0].moved, 2, "the next step moves them");
    const unlinked = await control.query(
      "select seller_user_id, impressions from laria_private.listing_impression_days where listing_id = $1",
      [listing3],
    );
    assert.deepEqual(unlinked.rows, [{ seller_user_id: null, impressions: 2 }], "without the anonymized seller");
    assert.equal(await eventsLeft(control, listing3), 0, "and none is left behind");
    console.log("PASS an account being anonymized: the step skipped its impressions without waiting, the anonymization waited only for the step");

    // 6. The other way round: a step holds a seller's impressions, and the seller, when the anonymization starts. The
    // anonymization waits for the step, then clears the seller from every daily count, the ones just written included.
    await control.query("begin");
    await addImpression(control, 95, 1, listing, seller);
    await addImpression(control, 95, 2, listing, seller);
    await setClockDaysAgo(control, 95);
    await control.query("commit");
    await rollup.query("begin");
    const first = await settle(rollup.query("select laria_private.roll_up_listing_impressions(10000) as moved"));
    assert.ok(first.ok && first.rows[0].moved === 2, `the step moves the seller's impressions: ${first.message ?? ""}`);
    const waiting = settle(anonymizer.query("select laria_private.anonymize_account_core($1, 'Prueba A33', null)", [seller]));
    assert.equal(await within(waiting, 300), null, "the anonymization waits for the step");
    await rollup.query("commit");
    const after = await waiting;
    assert.ok(after.ok, `the anonymization goes on once the step commits: ${after.message ?? ""}`);
    const linked = await control.query(
      "select count(*)::integer as count from laria_private.listing_impression_days where seller_user_id = $1",
      [seller],
    );
    assert.equal(linked.rows[0].count, 0, "no daily count keeps the anonymized seller");
    assert.equal(await moved(control, 95), 2, "and the counts stay");
    console.log("PASS a step before an anonymization: the anonymization waited for it, then cleared the seller from every daily count");
  } finally {
    // The connections that may hold rows first: the step waiting on them, if any, can then end.
    for (const client of [deleter, anonymizer, retention, rollup]) await client.query("rollback").catch(() => undefined);
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
    await Promise.all([control.end(), retention.end(), rollup.end(), deleter.end(), anonymizer.end()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
