// Explicit local integration test for STORE-3a cleanup safety (docs/store-operations/design.md §8.5, §17 item 4): a
// photo that is being attached to a listing must never be discarded, and a discarded photo must never be attached.
// Attachment (listing_photos insert, guarded by a trigger that takes FOR SHARE on the asset) and discard
// (laria_private.discard_import_photo_assets, FOR UPDATE then a reference check) run on separate connections: first in
// both fixed orders, then released together from an advisory-lock barrier many times.
// Usage: node tests/store-ops-3a-race.integration.cjs [postgresql://postgres:postgres@127.0.0.1:54322/postgres]
// The URL may also come from LARIA_TEST_DATABASE_URL. Hosted databases are refused. Creates isolated QA rows and
// removes them at the end. LARIA_RACE_ROUNDS sets the barrier repetitions (default 100).
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { Client } = require("pg");

const url =
  process.argv[2] ||
  process.env.LARIA_TEST_DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) {
  throw new Error("Local database URL required.");
}

const BARRIER = 357_301;
const ROUNDS = Number(process.env.LARIA_RACE_ROUNDS) || 100;
const ownerId = randomUUID();
const storeId = randomUUID();
const listingId = randomUUID();
const suffix = ownerId.slice(0, 8);
const sessions = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect() {
  const client = new Client({ connectionString: url, statement_timeout: 20_000 });
  await client.connect();
  return client;
}

async function setup(db) {
  await db.query(
    `insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
     values ($1, 'authenticated', 'authenticated', $2, now(), '{}', $3)`,
    [ownerId, `race3a-${suffix}@example.invalid`, JSON.stringify({ account_type: "store_owner", full_name: "Carrera 3A", phone: "51999995001", city: "Lima", region: "Lima" })],
  );
  await db.query(
    `insert into public.stores (id, slug, name, razon_social, ruc, email, contact_person, contact_name, whatsapp_phone, city, region,
       address, owner_user_id, status, listing_plan, is_verified)
     values ($1, $2, 'Carrera 3A', 'Carrera 3A SAC', '20999995001', $3, 'QA', 'QA', '51999995001', 'Lima', 'Lima', 'Av. QA', $4, 'active', 'free', true)`,
    [storeId, `race3a-${suffix}`, `race3a-${suffix}@example.invalid`, ownerId],
  );
  await db.query(
    `insert into public.listings (id, slug, title, seller_type, status, category, instrument_type, brand, model, condition, price_pen,
       city, region, contact_name, whatsapp_phone, description, owner_user_id, store_id, created_by_source, marketplace_rules_accepted_at)
     values ($1, $2, 'Pedal carrera 3A', 'store', 'approved', 'pedals', 'pedals', 'QA', 'Carrera', 'Nuevo', 300, 'Lima', 'Lima', 'QA',
       '51999995001', 'Descripción de inventario válida con más de cuarenta caracteres.', $3, $4, 'self_service', now())`,
    [listingId, `race3a-${suffix}`, ownerId, storeId],
  );
}

// A closed import with one validated photo, its storage object, and the URL a listing would store.
async function photo(db) {
  const sessionId = randomUUID();
  const assetId = randomUUID();
  sessions.push(sessionId);
  await db.query(
    `insert into public.store_import_sessions (id, store_id, created_by, status, file_format, file_name, file_path, file_bytes, closed_at)
     values ($1, $2, $3, 'committed', 'csv', 'carrera.csv', $4, 10, now())`,
    [sessionId, storeId, ownerId, `${ownerId}/${sessionId}/source.csv`],
  );
  const path = `${ownerId}/${sessionId}/${assetId}.jpg`;
  await db.query(
    `insert into public.store_import_photo_assets (id, session_id, store_id, created_by, original_name, file_ext, object_path,
       declared_bytes, claim_source, status, validated_at, mime_type, bytes, width, height, sha256)
     values ($1, $2, $3, $4, 'RACE__01.jpg', 'jpg', $5, 1000, 'filename', 'validated', now(), 'image/jpeg', 1000, 800, 800, repeat('a', 64))`,
    [assetId, sessionId, storeId, ownerId, path],
  );
  await db.query(
    `insert into storage.objects (bucket_id, name, owner_id, metadata) values ('store-import-photos', $1, $2, '{"size":1000,"mimetype":"image/jpeg"}')`,
    [path, ownerId],
  );
  return { sessionId, assetId, url: `/api/listing-images/${ownerId}/import-photos/${sessionId}/${assetId}.jpg` };
}

async function outcome(db, target) {
  const asset = (await db.query("select status from public.store_import_photo_assets where id = $1", [target.assetId])).rows[0];
  const referenced = (await db.query("select count(*)::int as n from public.listing_photos where image_url = $1", [target.url])).rows[0].n;
  return { status: asset.status, referenced };
}

const attach = (db, target) => db.query("insert into public.listing_photos (listing_id, image_url, sort_order) values ($1, $2, 9)", [listingId, target.url]);
const discard = (db, target) => db.query("select laria_private.discard_import_photo_assets($1)", [target.sessionId]);

async function waitUntilBlocked(control, pid) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const { rows } = await control.query("select wait_event_type from pg_stat_activity where pid = $1", [pid]);
    if (rows[0]?.wait_event_type === "Lock") return;
    await sleep(5);
  }
  throw new Error("The second transaction never waited on the first.");
}

async function main() {
  const control = await connect();
  const a = await connect();
  const b = await connect();
  const pidB = (await b.query("select pg_backend_pid() as pid")).rows[0].pid;
  try {
    await setup(control);

    // Attachment first: the discard waits, then sees the reference and keeps the photo.
    {
      const target = await photo(control);
      await a.query("begin");
      await attach(a, target);
      await b.query("begin");
      const pending = discard(b, target);
      await waitUntilBlocked(control, pidB);
      await a.query("commit");
      await pending;
      await b.query("commit");
      assert.deepEqual(await outcome(control, target), { status: "validated", referenced: 1 }, "attached photo kept");
      console.log("PASS attach first, then discard");
    }

    // Discard first: the attachment waits, then sees the photo discarded and fails.
    {
      const target = await photo(control);
      const pidA = (await a.query("select pg_backend_pid() as pid")).rows[0].pid;
      await b.query("begin");
      await discard(b, target);
      await a.query("begin");
      const pending = attach(a, target).then(() => null, (error) => error);
      await waitUntilBlocked(control, pidA);
      await b.query("commit");
      const error = await pending;
      await a.query("rollback");
      assert.match(error?.message ?? "", /LISTING_PHOTO_INVALID/, "attachment refused after discard");
      assert.deepEqual(await outcome(control, target), { status: "discarded", referenced: 0 }, "discarded photo never attached");
      console.log("PASS discard first, then attach");
    }

    // Both at once, many times: never discarded while referenced, never both lost.
    let kept = 0;
    let dropped = 0;
    for (let round = 0; round < ROUNDS; round += 1) {
      const target = await photo(control);
      await control.query("select pg_advisory_lock($1)", [BARRIER]);
      const run = (db, work) => (async () => {
        await db.query("begin");
        try {
          await db.query("select pg_advisory_xact_lock_shared($1)", [BARRIER]);
          await work(db, target);
          await db.query("commit");
        } catch (error) {
          await db.query("rollback");
          if (!/LISTING_PHOTO_INVALID/.test(error.message)) throw error;
        }
      })();
      const running = [run(a, attach), run(b, discard)];
      for (let attempt = 0; ; attempt += 1) {
        const { rows } = await control.query(
          "select count(*)::int as waiting from pg_locks where locktype = 'advisory' and objid = $1 and objsubid = 1 and not granted",
          [BARRIER],
        );
        if (rows[0].waiting === 2) break;
        if (attempt > 1000) throw new Error("Workers never reached the barrier.");
        await sleep(2);
      }
      await control.query("select pg_advisory_unlock($1)", [BARRIER]);
      await Promise.all(running);
      const result = await outcome(control, target);
      assert.ok(
        (result.status === "validated" && result.referenced === 1) || (result.status === "discarded" && result.referenced === 0),
        `round ${round}: ${JSON.stringify(result)}`,
      );
      if (result.referenced) kept += 1;
      else dropped += 1;
    }
    console.log(`PASS attach versus discard (${ROUNDS} rounds: ${kept} attached, ${dropped} discarded)`);
  } finally {
    await control.query("delete from public.listing_photos where listing_id = $1", [listingId]);
    await control.query("delete from storage.objects where bucket_id = 'store-import-photos' and name like $1", [`${ownerId}/%`]);
    await control.query("delete from public.store_import_photo_assets where store_id = $1", [storeId]);
    await control.query("delete from public.store_import_sessions where id = any($1::uuid[])", [sessions]);
    await control.query("delete from public.listings where id = $1", [listingId]);
    await control.query("delete from public.store_members where store_id = $1", [storeId]);
    await control.query("delete from public.stores where id = $1", [storeId]);
    await control.query("delete from public.profiles where id = $1", [ownerId]);
    await control.query("delete from auth.users where id = $1", [ownerId]);
    await Promise.all([control.end(), a.end(), b.end()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
