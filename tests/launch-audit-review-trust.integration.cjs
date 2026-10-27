// Explicit local integration test for two reviews sent at once (launch audit A17,
// supabase/migrations/20261114150000_launch_audit_review_trust.sql). A buyer who already reviewed a seller is held
// (repeat_buyer); two reviews of one seller by one buyer sent at the same time must not both pass as first ones. Two
// connections replay it: the first review is submitted and not yet committed when the second arrives, which must wait
// for it and then be held. Reviews of the same seller by two different buyers must not wait for each other.
// Usage: node tests/launch-audit-review-trust.integration.cjs [postgresql://postgres:postgres@127.0.0.1:54322/postgres]
// The URL may also come from LARIA_TEST_DATABASE_URL. Hosted databases are refused. The database needs every
// migration applied (setup-local-db.sh reset); the fixtures it commits are removed at the end.
const assert = require("node:assert/strict");
const { Client } = require("pg");

const url =
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ||
  process.env.LARIA_TEST_DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) {
  throw new Error("Local database URL required.");
}

const id = (group, n) => `a179${group}000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const seller = id(0, 1);
// Three earlier buyers with published reviews, so the seller is past their first three.
const earlier = [id(0, 2), id(0, 3), id(0, 4)];
const buyer = id(0, 5);
const otherBuyers = [id(0, 6), id(0, 7)];
const users = [seller, ...earlier, buyer, ...otherBuyers];
// Sale n: listing id(1, n), claim and sale id(2, n). 1 to 3 the earlier buyers', 4 and 5 the buyer's, 6 and 7 the
// other buyers'.
const buyers = [...earlier, buyer, buyer, ...otherBuyers];
const sale = (n) => id(2, n);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = (promise) =>
  promise.then(
    (result) => ({ ok: true, rows: result.rows, at: Date.now() }),
    (error) => ({ ok: false, code: error.code, message: error.message, at: Date.now() }),
  );

async function connect() {
  const client = new Client({ connectionString: url, statement_timeout: 30_000 });
  await client.connect();
  return client;
}

// Opens a transaction as the buyer and submits their review of the sale, leaving the transaction open.
async function review(client, buyerId, saleId) {
  await client.query("begin");
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: buyerId, role: "authenticated" })]);
  return client.query("select public.submit_transaction_review($1, 5, 'Reseña de prueba A17.') as review_id", [saleId]);
}

async function cleanup(control, markersFrom) {
  await control.query("begin");
  await control.query("select set_config('app.allow_listing_admin_fields', 'true', true)");
  const sales = buyers.map((_, index) => sale(index + 1));
  const listings = buyers.map((_, index) => id(1, index + 1));
  await control.query("delete from laria_private.review_holds where review_id in (select id from public.transaction_reviews where transaction_id = any ($1::uuid[]))", [sales]);
  await control.query("delete from public.transaction_reviews where transaction_id = any ($1::uuid[])", [sales]);
  await control.query("delete from public.verified_transactions where id = any ($1::uuid[])", [sales]);
  await control.query("delete from public.transaction_claims where id = any ($1::uuid[])", [sales]);
  await control.query("delete from public.marketplace_events where actor_user_id = any ($1::uuid[]) or listing_id = any ($2::uuid[])", [users, listings]);
  await control.query("delete from public.notifications where user_id = any ($1::uuid[])", [users]);
  await control.query("delete from public.listings where id = any ($1::uuid[])", [listings]);
  await control.query("delete from auth.users where id = any ($1::uuid[])", [users]);
  // The page refresh record (launch audit A19) notes every review; these fixtures' notes go too.
  if (markersFrom !== undefined) await control.query("delete from laria_private.public_page_changes where id > $1", [markersFrom]);
  await control.query("commit");
}

async function main() {
  const control = await connect();
  const first = await connect();
  const second = await connect();
  let markersFrom;
  try {
    await cleanup(control);
    markersFrom = Number((await control.query("select coalesce(max(id), 0) as id from laria_private.public_page_changes")).rows[0].id);
    await control.query("begin");
    for (const [index, user] of users.entries()) {
      await control.query(
        `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, raw_app_meta_data, raw_user_meta_data)
         values ($1, 'authenticated', 'authenticated', $2, '', now() - interval '60 days', now() - interval '60 days', '{}', $3)`,
        [user, `a17-race-${index}@example.invalid`, JSON.stringify({ account_type: "seller", full_name: `Carrera A17 ${index}`, phone: `5191117${String(index).padStart(4, "0")}`, city: "Lima", region: "Lima" })],
      );
    }
    // Rows as the database holds them, without the publication triggers.
    await control.query("set local session_replication_role = replica");
    for (const [index, buyerId] of buyers.entries()) {
      const n = index + 1;
      await control.query(
        `insert into public.listings (id, owner_user_id, seller_type, status, title, slug, description, category, instrument_type,
           brand, model, condition, price_pen, city, region, contact_name, whatsapp_phone, published_at, sold_at)
         values ($1, $2, 'individual', 'sold', $3, $4, 'Guitarra de prueba para reseñas a la vez.', 'guitars', 'electric_guitar',
           'QA', 'A17', 'Usado - buen estado', 1000, 'Lima', 'Lima', 'Carrera A17', '51911170000', now() - interval '5 days', now() - interval '1 day')`,
        [id(1, n), seller, `Guitarra carrera A17 ${n}`, `a17-carrera-${n}`],
      );
      await control.query(
        `insert into public.transaction_claims (id, listing_id, seller_user_id, store_id, buyer_user_id, attribution_type, status, responded_at)
         values ($1, $2, $3, null, $4, 'laria', 'confirmed', now())`,
        [sale(n), id(1, n), seller, buyerId],
      );
      await control.query(
        `insert into public.verified_transactions (id, claim_id, listing_id, seller_user_id, store_id, buyer_user_id, seller_identity_type,
           sold_at, verified_at, review_deadline)
         values ($1, $1, $2, $3, null, $4, 'particular', now() - interval '1 day', now(), now() + interval '10 days')`,
        [sale(n), id(1, n), seller, buyerId],
      );
    }
    for (const [index, earlierBuyer] of earlier.entries()) {
      await control.query(
        `insert into public.transaction_reviews (transaction_id, direction, reviewer_user_id, subject_user_id, rating, comment)
         values ($1, 'buyer_to_seller', $2, $3, 5, 'Reseña publicada antes.')`,
        [sale(index + 1), earlierBuyer, seller],
      );
    }
    await control.query("commit");

    // 1. The buyer reviews sale 4 and has not committed when their review of sale 5 arrives.
    const firstReview = await review(first, buyer, sale(4));
    const started = Date.now();
    const secondReview = settle(review(second, buyer, sale(5)));
    const early = await Promise.race([secondReview, sleep(500).then(() => null)]);
    assert.equal(early, null, "the second review of the same seller waits for the first");
    await first.query("commit");
    const committedAt = Date.now();
    const result = await secondReview;
    assert.ok(result.ok, `the second review goes in once the first is committed: ${result.message ?? ""}`);
    assert.ok(result.at >= committedAt, "it finished only after the first committed");
    await second.query("commit");
    const held = await control.query(
      `select r.transaction_id, r.held_at is not null as held, h.reasons
       from public.transaction_reviews r left join laria_private.review_holds h on h.review_id = r.id
       where r.id = any ($1::uuid[])`,
      [[firstReview.rows[0].review_id, result.rows[0].review_id]],
    );
    const byId = Object.fromEntries(held.rows.map((row) => [row.transaction_id, row]));
    assert.deepEqual([byId[sale(4)].held, byId[sale(4)].reasons], [false, null], "the first review shows");
    assert.deepEqual([byId[sale(5)].held, byId[sale(5)].reasons], [true, ["repeat_buyer"]], "the second is held as a repeat");
    console.log(`PASS one buyer, two reviews of one seller at once (the second waited ${committedAt - started} ms, then was held as repeat_buyer)`);

    // 2. Two buyers review the same seller at once: neither waits.
    await review(first, otherBuyers[0], sale(6));
    const otherStarted = Date.now();
    const other = await settle(review(second, otherBuyers[1], sale(7)));
    const took = other.at - otherStarted;
    assert.ok(other.ok, `another buyer's review goes in: ${other.message ?? ""}`);
    assert.ok(took < 500, `another buyer's review doesn't wait (${took} ms)`);
    await second.query("commit");
    await first.query("commit");
    const both = await control.query(
      "select count(*)::integer as count from public.transaction_reviews where transaction_id = any ($1::uuid[]) and held_at is null",
      [[sale(6), sale(7)]],
    );
    assert.equal(both.rows[0].count, 2, "neither is held");
    console.log(`PASS two buyers, one seller at once (the second took ${took} ms, neither held)`);
  } finally {
    for (const client of [first, second]) await client.query("rollback").catch(() => undefined);
    await cleanup(control, markersFrom).catch((error) => console.error("cleanup failed:", error.message));
    await Promise.all([control.end(), first.end(), second.end()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
