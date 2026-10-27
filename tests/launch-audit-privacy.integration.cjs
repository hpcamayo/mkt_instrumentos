// Explicit local integration test for the upload sweep's locks (launch audit A18,
// supabase/migrations/20261114120000_launch_audit_privacy.sql). A file is queued for removal only when nothing points
// at it, and every place that points at a file takes the same per-file lock first. Two connections replay both orders:
// a listing taking a file while the sweep claims (the claim skips the file, then finds it in use), and the sweep
// claiming a file while a listing takes it (the listing waits for the claim, then is told the file is gone). Neither
// may deadlock, and the claim never waits. A third connection has two listings take the same two files in opposite
// orders at once, as two copies of listings that share photos do: neither may wait for the other.
// Usage: node tests/launch-audit-privacy.integration.cjs [postgresql://postgres:postgres@127.0.0.1:54322/postgres]
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

const owner = "e1600000-0000-4000-8000-000000000001";
const listing = "e1620000-0000-4000-8000-000000000001";
const listingTwo = "e1620000-0000-4000-8000-000000000002";
const folder = `${owner}/e1630000-0000-4000-8000-000000000001`;
const paths = { attachedFirst: `${folder}/0.jpg`, claimedFirst: `${folder}/1.jpg` };
// Files two listings share; the sweep never sees them (no stored object).
const shared = { first: `${folder}/2.jpg`, second: `${folder}/3.jpg` };
const address = (path) => `http://127.0.0.1:54321/storage/v1/object/public/listing-photos/${path}`;

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

async function claim(client) {
  await client.query("begin");
  await client.query("set local role service_role");
  await client.query(`set local request.jwt.claims = '{"role":"service_role"}'`);
  const started = Date.now();
  const { rows } = await client.query("select bucket, path from public.claim_upload_removals(100) where path like $1", [`${owner}/%`]);
  return { paths: rows.map((row) => row.path), took: Date.now() - started };
}

const attach = (client, path, order, to = listing) =>
  client.query("insert into public.listing_photos (listing_id, image_url, sort_order) values ($1, $2, $3)", [to, address(path), order]);

async function cleanup(control) {
  await control.query("begin");
  await control.query("select set_config('app.allow_listing_admin_fields', 'true', true)");
  await control.query("delete from public.listing_photos where listing_id = any ($1::uuid[])", [[listing, listingTwo]]);
  await control.query("delete from public.listings where id = any ($1::uuid[])", [[listing, listingTwo]]);
  await control.query("delete from laria_private.upload_removals where path like $1", [`${owner}/%`]);
  await control.query("delete from storage.objects where name like $1", [`${owner}/%`]);
  await control.query("delete from auth.users where id = $1", [owner]);
  await control.query("commit");
}

async function main() {
  const control = await connect();
  const sweep = await connect();
  const seller = await connect();
  const copier = await connect();
  try {
    await cleanup(control);
    await control.query("begin");
    await control.query(
      `insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values ($1, 'authenticated',
        'authenticated', 'lapvi@example.invalid', '{}', '{"account_type":"seller","full_name":"Barrido","phone":"51999998001","city":"Lima","region":"Lima"}')`,
      [owner],
    );
    await control.query("select set_config('app.allow_listing_admin_fields', 'true', true)");
    await control.query(
      `insert into public.listings (id, seller_type, status, title, slug, description, category, instrument_type, brand, model,
        condition, price_pen, city, region, contact_name, whatsapp_phone, owner_user_id, marketplace_rules_accepted_at)
       values ($1, 'individual', 'pending', 'Guitarra del barrido', 'lapvi-barrido', repeat('Descripción de prueba ', 3),
        'guitars', 'electric_guitar', 'Fender', 'Strat', 'Muy bueno', 1500, 'Lima', 'Lima', 'Barrido', '51999998001', $2, now()),
        ($3, 'individual', 'pending', 'Guitarra copiada', 'lapvi-copia', repeat('Descripción de prueba ', 3),
        'guitars', 'electric_guitar', 'Fender', 'Strat', 'Muy bueno', 1500, 'Lima', 'Lima', 'Barrido', '51999998001', $2, now())`,
      [listing, owner, listingTwo],
    );
    await control.query(
      `insert into storage.objects (bucket_id, name, owner, created_at)
       select 'listing-photos', unnest($1::text[]), $2, now() - interval '3 days'`,
      [Object.values(paths), owner],
    );
    await control.query("commit");

    // A listing takes a file while the sweep claims: the claim skips it without waiting, and once the listing has it
    // the next claim leaves it too.
    await seller.query("begin");
    await attach(seller, paths.attachedFirst, 0);
    const during = await claim(sweep);
    await sweep.query("commit");
    assert.ok(!during.paths.includes(paths.attachedFirst), "the claim queued a file a listing was taking");
    assert.ok(during.paths.includes(paths.claimedFirst), "the claim left a file nothing points at");
    assert.ok(during.took < 1000, `the claim waited ${during.took} ms`);
    await seller.query("commit");
    console.log(`PASS a listing taking a file while the sweep claims: the claim skips it, in ${during.took} ms`);
    await control.query("delete from laria_private.upload_removals where path like $1", [`${owner}/%`]);
    const after = await claim(sweep);
    await sweep.query("commit");
    assert.deepEqual(after.paths, [paths.claimedFirst], "once the listing has it, a later claim leaves it");
    await control.query("delete from laria_private.upload_removals where path like $1", [`${owner}/%`]);
    console.log("PASS and once the listing has the file, the next claim leaves it");

    // The sweep claims a file while a listing takes it: the listing waits for the claim and is then told the file is
    // gone, so no listing ever shows a removed file.
    const claimed = await claim(sweep);
    assert.deepEqual(claimed.paths, [paths.claimedFirst]);
    await seller.query("begin");
    const taking = settle(attach(seller, paths.claimedFirst, 1));
    await sleep(300);
    const early = await Promise.race([taking, sleep(10).then(() => null)]);
    assert.equal(early, null, "the listing must wait for the claim");
    await sweep.query("commit");
    const taken = await taking;
    await seller.query("rollback");
    assert.equal(taken.ok, false, "the listing took a file the sweep had queued");
    assert.match(taken.message, /UPLOAD_REMOVED/);
    const { rows } = await control.query("select count(*)::int as n from public.listing_photos where image_url = $1", [address(paths.claimedFirst)]);
    assert.equal(rows[0].n, 0);
    console.log("PASS the sweep claiming a file while a listing takes it: the listing waits, then gets UPLOAD_REMOVED");

    // Two listings take the same two files in opposite orders at once: each holds the file it took first while it
    // takes the other. The places that point at a file share its lock, so neither waits and nothing deadlocks.
    await seller.query("begin");
    await copier.query("begin");
    await attach(seller, shared.first, 2);
    await attach(copier, shared.second, 0, listingTwo);
    const started = Date.now();
    const crossed = await Promise.all([
      settle(attach(seller, shared.second, 3)),
      settle(attach(copier, shared.first, 1, listingTwo)),
    ]);
    const took = Math.max(...crossed.map((result) => result.at)) - started;
    assert.ok(crossed.every((result) => result.ok), `a listing was stopped: ${crossed.map((result) => result.code ?? "ok").join(", ")}`);
    assert.ok(took < 500, `a listing waited ${took} ms for the other`);
    await Promise.all([seller.query("commit"), copier.query("commit")]);
    const { rows: both } = await control.query(
      "select count(*)::int as n from public.listing_photos where listing_id = any ($1::uuid[]) and image_url = any ($2::text[])",
      [[listing, listingTwo], [address(shared.first), address(shared.second)]],
    );
    assert.equal(both[0].n, 4);
    console.log(`PASS two listings taking the same files in opposite orders: neither waits (${took} ms), no deadlock`);
  } finally {
    await Promise.all([
      sweep.query("rollback").catch(() => {}),
      seller.query("rollback").catch(() => {}),
      copier.query("rollback").catch(() => {}),
    ]);
    await cleanup(control);
    await Promise.all([control.end(), sweep.end(), seller.end(), copier.end()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
