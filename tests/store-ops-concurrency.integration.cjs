// Explicit local integration test for STORE-1a stock concurrency (docs/store-operations/design.md §14). Every race
// runs on separate database connections released together from an advisory-lock barrier, so the database really
// interleaves them. The lock-order cases (review fixes A3 and A4) instead hold each connection at a chosen lock and
// check where the others wait. Creates isolated QA rows and removes them at the end, ledger included (see cleanup()).
// Usage: node tests/store-ops-concurrency.integration.cjs [postgresql://postgres:postgres@127.0.0.1:54322/postgres]
// The URL may also come from LARIA_TEST_DATABASE_URL. Hosted databases are refused. LARIA_RACE_ROUNDS sets the
// last-unit repetitions (default 200, as in the design); LARIA_ONLY=<text> runs only the checks whose name contains it.
// --mutation (review fix A5) checks the harness itself: it removes the SKU row lock from the shared lock helpers, shows
// that the unlinked last-unit race catches the oversell while the linked one stays masked by the listing lock, and
// puts the functions back. Run it on a local database that nothing else is using.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { Client } = require("pg");

const url =
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ||
  process.env.LARIA_TEST_DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) {
  throw new Error("Local database URL required.");
}

const BARRIER = 357_001; // advisory lock key shared by every worker
const WORKERS = 20;
const LAST_UNIT_ROUNDS = Number(process.env.LARIA_RACE_ROUNDS) || 200;
const suffix = randomUUID().slice(0, 8);
const ownerId = randomUUID();
const storeId = randomUUID();
const MUTATION = process.argv.includes("--mutation");
const listings = {};
const items = {};
let control;
const workers = [];
const pids = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const code = (result) => (result.ok ? "ok" : result.error.message.split(":")[0]);

async function connect() {
  const client = new Client({ connectionString: url, statement_timeout: 20_000 });
  await client.connect();
  return client;
}

// One owner call in its own transaction. With `barrier`, the transaction first waits on the shared barrier lock, so
// every racing worker starts its call at the same moment.
async function asOwner(client, sql, params, barrier = true) {
  await client.query("begin");
  try {
    if (barrier) await client.query("select pg_advisory_xact_lock_shared($1)", [BARRIER]);
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: ownerId, role: "authenticated" }),
    ]);
    const result = await client.query(sql, params);
    await client.query("commit");
    return { ok: true, value: result.rows[0] && Object.values(result.rows[0])[0] };
  } catch (error) {
    await client.query("rollback");
    if (error.code === "40P01") throw new Error(`Deadlock: ${error.message}`);
    return { ok: false, error };
  }
}

// Runs task(worker) on separate connections, held at the barrier until all of them are waiting, then released.
async function race(tasks) {
  await control.query("select pg_advisory_lock($1)", [BARRIER]);
  const running = tasks.map((task, index) => task(workers[index]));
  for (let attempt = 0; ; attempt += 1) {
    const { rows } = await control.query(
      "select count(*)::int as waiting from pg_locks where locktype = 'advisory' and objid = $1 and objsubid = 1 and not granted",
      [BARRIER],
    );
    if (rows[0].waiting === tasks.length) break;
    if (attempt > 1000) throw new Error("Workers never reached the barrier.");
    await sleep(5);
  }
  await control.query("select pg_advisory_unlock($1)", [BARRIER]);
  return Promise.all(running);
}

// Opens a transaction on `client` as the owner (or the service role) and leaves it open, for the lock-order cases.
async function open(client, as = "owner") {
  await client.query("begin");
  await client.query(as === "service" ? "set local role service_role" : "set local role authenticated");
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify(as === "service" ? { role: "service_role" } : { sub: ownerId, role: "authenticated" }),
  ]);
}
const settle = (pending) =>
  pending.then((result) => ({ ok: true, value: result.rows[0] && Object.values(result.rows[0])[0] }), (error) => ({ ok: false, error }));
const waitingOnLock = async (pid) =>
  (await control.query("select wait_event_type from pg_stat_activity where pid = $1", [pid])).rows[0]?.wait_event_type === "Lock";
async function waitFor(condition, what) {
  for (let attempt = 0; attempt < 2000; attempt += 1) {
    if (await condition()) return;
    await sleep(5);
  }
  throw new Error(`Timed out waiting for ${what}.`);
}
// Ends each open transaction as soon as its call returns (in the order given, so a call waiting on an earlier one can
// go on), then fails on a deadlock in any of them.
async function finish(...pairs) {
  const results = [];
  for (const [client, pending] of pairs) {
    const result = await pending;
    await client.query(result.ok ? "commit" : "rollback");
    results.push(result);
  }
  const deadlocked = results.find((result) => !result.ok && result.error.code === "40P01");
  if (deadlocked) throw new Error(`Deadlock: ${deadlocked.error.message}`);
  return results;
}

const owner = (sql, params) => asOwner(control, sql, params, false);
const item = async (id) =>
  (await control.query("select * from public.store_inventory_items where id = $1", [id])).rows[0];
const listing = async (id) =>
  (await control.query("select status, stock_state, price_pen from public.listings where id = $1", [id])).rows[0];
const movement = (id, type, quantity, key, extra = {}) => [
  "select public.record_stock_movement($1, $2, $3, $4, null, null, $5, $6)",
  [id, type, quantity, extra.channel ?? (type === "sale" ? "tienda_fisica" : null), extra.version ?? null, key],
];

async function setStock(id, quantity) {
  const current = await item(id);
  const result = await owner(...movement(id, "stock_count", quantity, `qa-conc-${suffix}-set-${randomUUID()}`, { version: current.version }));
  assert.equal(code(result), "ok", result.error?.message);
}

async function assertConsistent(id) {
  const row = await item(id);
  const { rows } = await control.query(
    "select coalesce(sum(on_hand_delta), 0)::int as total, count(*)::int as count from public.store_stock_movements where item_id = $1",
    [id],
  );
  assert.equal(rows[0].total, row.quantity_on_hand, "ledger must sum to quantity_on_hand");
  assert.ok(row.quantity_on_hand >= 0 && row.quantity_reserved === 0);
  if (row.listing_id) {
    const linked = await listing(row.listing_id);
    assert.equal(linked.stock_state, row.quantity_available > 0 ? "in_stock" : "out_of_stock", "stock_state must follow the item");
    assert.equal(linked.price_pen, row.unit_price_pen, "listing and item prices must match");
  }
}

// Plays one import to a publishable row on the control connection (the steps tests/store-ops-3b.sql takes): staged,
// mapped, planned, photos uploaded and checked, inventory applied.
const PUBLICATION_HELPERS = `
create or replace function pg_temp.qa_ready_import(p_sku text, p_price integer) returns uuid language plpgsql as $$
declare sid uuid; token uuid; result jsonb; upload jsonb;
begin
  sid := (public.create_store_import_session('publicar.csv', 'csv', 1000) #>> '{session,id}')::uuid;
  token := (public.claim_store_import_step(sid)->>'lock_token')::uuid;
  perform public.begin_store_import_parse(sid, token, repeat('a', 64), 1000);
  perform public.stage_store_import_rows(sid, token, jsonb_build_array(jsonb_build_object('row_number', 2,
    'raw', jsonb_build_array(jsonb_build_object('v', p_sku, 'k', 's')))));
  perform public.finish_store_import_parse(sid, token, jsonb_build_object('headers', '["SKU","Nombre","Stock","Precio"]'::jsonb,
    'header_row', 1, 'row_count', 1, 'sheet_name', null));
  perform public.release_store_import_step(sid, token);
  perform public.confirm_store_import_mapping(sid, '{"sku":0,"product_name":1,"quantity":2,"unit_price_pen":3}',
    (select version from public.store_import_sessions where id = sid));
  token := (public.claim_store_import_step(sid)->>'lock_token')::uuid;
  perform public.plan_store_import_rows(sid, token, jsonb_build_array(jsonb_build_object('row_number', 2,
    'parsed', jsonb_build_object('sku', p_sku, 'product_name', 'Pedal ' || p_sku, 'quantity', 3, 'unit_price_pen', p_price))));
  perform public.finish_store_import_validation(sid, token);
  perform public.release_store_import_step(sid, token);
  result := public.request_store_import_photo_uploads(sid, jsonb_build_array(
    jsonb_build_object('name', p_sku || '__01.jpg', 'type', 'image/jpeg', 'bytes', 200000),
    jsonb_build_object('name', p_sku || '__02.jpg', 'type', 'image/jpeg', 'bytes', 200000)));
  for upload in select value from jsonb_array_elements(result->'uploads') loop
    insert into storage.objects(bucket_id, name, owner, owner_id, metadata)
    values ('store-import-photos', upload->>'path', auth.uid(), auth.uid()::text, '{"size":200000,"mimetype":"image/jpeg"}');
  end loop;
  return sid;
end $$;
create or replace function pg_temp.qa_photo_checks(p_session uuid) returns jsonb language sql security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('asset_id', id, 'ok', true, 'mime_type', 'image/jpeg', 'bytes', 200000,
    'width', 1200, 'height', 900, 'sha256', encode(sha256(convert_to(id::text, 'UTF8')), 'hex')) order by request_order), '[]')
  from public.store_import_photo_assets where session_id = p_session and status = 'awaiting_upload'
$$;
create or replace function pg_temp.qa_commit_import(p_session uuid) returns void language plpgsql as $$
declare token uuid;
begin
  perform public.start_store_import_commit(p_session, (select version from public.store_import_sessions where id = p_session));
  token := (public.claim_store_import_step(p_session)->>'lock_token')::uuid;
  perform public.commit_store_import_chunk(p_session, token, array[2]);
  perform public.finish_store_import_commit(p_session, token);
end $$;
`;

async function importedSku(sku, price) {
  await open(control);
  const sessionId = (await control.query("select pg_temp.qa_ready_import($1, $2) as id", [sku, price])).rows[0].id;
  const checks = (await control.query("select pg_temp.qa_photo_checks($1) as checks", [sessionId])).rows[0].checks;
  await control.query("commit");
  await open(control, "service");
  await control.query("select public.record_store_import_photo_checks($1, $2, $3)", [ownerId, sessionId, JSON.stringify(checks)]);
  await control.query("commit");
  await open(control);
  await control.query("select pg_temp.qa_commit_import($1)", [sessionId]);
  await control.query("commit");
  const { rows } = await control.query(
    "select applied_item_id, photo_state from public.store_import_rows where session_id = $1 and row_number = 2",
    [sessionId],
  );
  assert.equal(rows[0].photo_state, "ready", "fixture row has its photos");
  return { sessionId, itemId: rows[0].applied_item_id };
}

const publishRows = (title) => JSON.stringify([{
  row_number: 2,
  fields: {
    title, brand: "Boss", model: "DS-1", category: "pedals", instrument_type: "pedals", condition: "Nuevo",
    description: "Pedal de distorsión nuevo, en caja, con garantía de la tienda por un año.", attributes: { pedal_type: "distortion" },
  },
}]);

async function setup() {
  await control.query("begin");
  await control.query(
    `insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
     values ($1, 'authenticated', 'authenticated', $2, now(), '{}', $3)`,
    [ownerId, `qa-conc-${suffix}@example.invalid`, JSON.stringify({ account_type: "store_owner", full_name: "Dueño QA concurrencia", phone: "51999995001", city: "Lima", region: "Lima" })],
  );
  await control.query(
    `insert into public.stores (id, slug, name, razon_social, ruc, email, contact_person, contact_name, whatsapp_phone, city, region, address, owner_user_id, status, listing_plan)
     values ($1, $2, 'Tienda QA concurrencia', 'Tienda QA SAC', $3, $4, 'Contacto', 'Contacto', '51999995001', 'Lima', 'Lima', 'Av. QA', $5, 'active', 'free')`,
    [storeId, `qa-conc-${suffix}`, `20${String(Date.now()).slice(-9)}`, `qa-conc-${suffix}@example.invalid`, ownerId],
  );
  await control.query("insert into public.store_operation_settings(store_id, inventory_enabled) values ($1, true)", [storeId]);
  // s1 sorts before s2, so a bulk operation over both locks s1 first (the stale-link case needs that order).
  [listings.s1, listings.s2] = [randomUUID(), randomUUID()].sort();
  for (const name of ["a", "b", "c", "d1", "d2", "d3", "d4", "d5", "h1", "h2", "s1", "s2", "e"]) {
    listings[name] ??= randomUUID();
    await control.query(
      `insert into public.listings (id, slug, title, seller_type, status, category, instrument_type, brand, model, condition, price_pen, city, region, contact_name, whatsapp_phone, description, owner_user_id, store_id, created_by_source, marketplace_rules_accepted_at)
       values ($1, $2, $3, 'store', 'approved', 'guitars', 'electric_guitar', 'QA', $4, 'Nuevo', 1000, 'Lima', 'Lima', 'Contacto', '51999995001', 'Descripción de inventario válida con más de cuarenta caracteres.', $5, $6, 'self_service', now())`,
      [listings[name], `qa-conc-${suffix}-${name}`, `Guitarra concurrencia ${name}`, name, ownerId, storeId],
    );
    await control.query(
      "insert into public.listing_photos (listing_id, image_url, sort_order) values ($1, $2, 0), ($1, $3, 1)",
      [listings[name], `https://example.invalid/${suffix}-${name}-0.jpg`, `https://example.invalid/${suffix}-${name}-1.jpg`],
    );
  }
  await control.query("commit");

  for (const name of ["a", "b", "c", "h1", "h2", "s2"]) {
    const created = await owner("select public.create_inventory_item($1, $2, $3)", [
      { merchant_sku: `QA-${name.toUpperCase()}`, product_name: `Guitarra ${name}`, listing_id: listings[name] },
      1,
      `qa-conc-${suffix}-create-${name}`,
    ]);
    assert.equal(code(created), "ok", created.error?.message);
    items[name] = created.value.item.id;
  }
  // d1..d5 are linked during the run; u1, u2 and s stay unlinked SKU (review fix A5).
  for (const name of ["d1", "d2", "d3", "d4", "d5", "u1", "u2", "s"]) {
    const created = await owner("select public.create_inventory_item($1, $2, $3)", [
      { merchant_sku: `QA-${name.toUpperCase()}`, product_name: `Guitarra ${name}`, unit_price_pen: 1000 },
      0,
      `qa-conc-${suffix}-create-${name}`,
    ]);
    assert.equal(code(created), "ok", created.error?.message);
    items[name] = created.value.item.id;
  }
  await control.query(PUBLICATION_HELPERS);
}

// The ledger is append-only, so its rows can only be removed by briefly disabling the guard triggers inside one
// transaction (table owner, local database only). A failure rolls everything back, triggers included.
async function cleanup() {
  await control.query("rollback").catch(() => {});
  await control.query("begin");
  try {
    for (const table of ["store_stock_movements", "store_inventory_changes"]) {
      await control.query(`alter table public.${table} disable trigger ${table}_append_only`);
      await control.query(`delete from public.${table} where store_id = $1`, [storeId]);
      await control.query(`alter table public.${table} enable trigger ${table}_append_only`);
    }
    await control.query("delete from laria_private.store_inventory_batch_receipts where store_id = $1", [storeId]);
    await control.query("delete from storage.objects where bucket_id = 'store-import-photos' and name like $1", [`${ownerId}/%`]);
    await control.query("delete from public.store_import_sessions where store_id = $1", [storeId]);
    await control.query("delete from public.store_inventory_items where store_id = $1", [storeId]);
    await control.query(
      `delete from public.listing_revision_photos where revision_id in
         (select r.id from public.listing_revisions r join public.listings l on l.id = r.listing_id where l.store_id = $1)`,
      [storeId],
    );
    await control.query("delete from public.listing_revisions where listing_id in (select id from public.listings where store_id = $1)", [storeId]);
    await control.query("delete from public.listings where store_id = $1", [storeId]);
    await control.query("delete from public.stores where id = $1", [storeId]);
    await control.query("delete from auth.users where id = $1", [ownerId]);
    await control.query("commit");
  } catch (error) {
    await control.query("rollback");
    throw error;
  }
}

// 2 to 20 buyers race for the last unit, LAST_UNIT_ROUNDS times: on a linked SKU (a), where the listing lock also
// serializes, and on an unlinked one (u1), where only the SKU row lock does (review fix A5).
async function lastUnit(name = "a", rounds = LAST_UNIT_ROUNDS) {
  const id = items[name];
  const linkedListing = (await item(id)).listing_id;
  for (let round = 0; round < rounds; round += 1) {
    await setStock(id, 1);
    const results = await race(
      workers.slice(0, 2 + (round % 19)).map((_, index) => (client) =>
        asOwner(client, ...movement(id, "sale", 1, `qa-conc-${suffix}-last-${name}-${round}-${index}`))),
    );
    const codes = results.map(code);
    assert.equal(codes.filter((value) => value === "ok").length, 1, `${name} round ${round}: ${codes}`);
    assert.ok(codes.every((value) => value === "ok" || value === "STOCK_INSUFFICIENT"), `${name} round ${round}: ${codes}`);
    assert.equal((await item(id)).quantity_on_hand, 0);
    if (linkedListing) {
      assert.equal((await listing(linkedListing)).stock_state, "out_of_stock");
      assert.equal((await listing(linkedListing)).status, "approved", "stock must never change listing status");
    }
  }
  await assertConsistent(id);
  return [`${rounds} rounds`];
}

async function sameKeyRetries() {
  await setStock(items.a, 5);
  const key = `qa-conc-${suffix}-retry`;
  const results = await race(workers.slice(0, 10).map(() => (client) => asOwner(client, ...movement(items.a, "sale", 1, key))));
  assert.ok(results.every((result) => result.ok), results.map(code).join());
  assert.equal(results.filter((result) => result.value.replayed === false).length, 1, "exactly one call applies the movement");
  assert.equal(new Set(results.map((result) => result.value.movement.id)).size, 1, "every call returns the same movement");
  const { rows } = await control.query("select count(*)::int as n from public.store_stock_movements where idempotency_key = $1", [key]);
  assert.equal(rows[0].n, 1);
  assert.equal((await item(items.a)).quantity_on_hand, 4);
  await assertConsistent(items.a);
}

async function sameKeyDifferentPayload() {
  const before = (await item(items.a)).quantity_on_hand;
  const key = `qa-conc-${suffix}-reused`;
  const results = await race([1, 2].map((quantity) => (client) => asOwner(client, ...movement(items.a, "sale", quantity, key))));
  const codes = results.map(code).sort();
  assert.deepEqual(codes, ["IDEMPOTENCY_KEY_REUSED", "ok"]);
  const applied = [1, 2][results.findIndex((result) => result.ok)];
  assert.equal((await item(items.a)).quantity_on_hand, before - applied);
  await assertConsistent(items.a);
}

async function staleCount(name = "a") {
  const id = items[name];
  const { version } = await item(id);
  const results = await race(
    [10, 11, 12, 13].map((quantity, index) => (client) =>
      asOwner(client, ...movement(id, "stock_count", quantity, `qa-conc-${suffix}-count-${name}-${index}`, { version }))),
  );
  const codes = results.map(code);
  assert.equal(codes.filter((value) => value === "ok").length, 1, codes.join());
  assert.ok(codes.every((value) => value === "ok" || value === "INVENTORY_VERSION_CONFLICT"), codes.join());

  // A count against version v racing a sale: either the count lands first and the sale follows it, or the sale lands
  // first and the count is refused. A count never silently erases a sale it did not see.
  for (let round = 0; round < 20; round += 1) {
    const current = await item(id);
    const [count, sale] = await race([
      (client) => asOwner(client, ...movement(id, "stock_count", 30, `qa-conc-${suffix}-vs-count-${name}-${round}`, { version: current.version })),
      (client) => asOwner(client, ...movement(id, "sale", 1, `qa-conc-${suffix}-vs-sale-${name}-${round}`)),
    ]);
    assert.equal(code(sale), "ok");
    if (count.ok) {
      assert.ok(sale.value.movement.item_version_after > count.value.movement.item_version_after, "sale was overwritten by a count");
      assert.equal((await item(id)).quantity_on_hand, 29);
    } else {
      assert.equal(code(count), "INVENTORY_VERSION_CONFLICT");
    }
  }
  await assertConsistent(id);
}

// Bulk paths lock listings, then items, each in id order; single paths lock listing then item. Opposite request orders
// must never deadlock.
async function bulkAndSingle(first = "a", second = "b") {
  const [a, b] = [items[first], items[second]];
  await setStock(a, 50);
  await setStock(b, 50);
  for (let round = 0; round < 15; round += 1) {
    const forward = [a, b].map((id) => ({ item_id: id, type: "restock", quantity: 1 }));
    const backward = [b, a].map((id) => ({ item_id: id, type: "sale", quantity: 1, channel: "otro" }));
    const results = await race([
      (client) => asOwner(client, "select public.apply_bulk_stock_operations($1, $2)", [JSON.stringify(forward), `qa-conc-${suffix}-bulk-f-${first}-${round}`]),
      (client) => asOwner(client, "select public.apply_bulk_stock_operations($1, $2)", [JSON.stringify(backward), `qa-conc-${suffix}-bulk-b-${first}-${round}`]),
      (client) => asOwner(client, ...movement(b, "sale", 1, `qa-conc-${suffix}-bulk-sb-${first}-${round}`)),
      (client) => asOwner(client, ...movement(a, "restock", 2, `qa-conc-${suffix}-bulk-sa-${first}-${round}`)),
      (client) => asOwner(client, "select public.set_inventory_price_bulk($1, 'add', $2, $3)", [[b, a], round % 2 ? 5 : -5, `qa-conc-${suffix}-bulk-p-${first}-${round}`]),
    ]);
    assert.ok(results.every((result) => result.ok), results.map(code).join());
  }
  await assertConsistent(a);
  await assertConsistent(b);
}

// Stock and price writes from the inventory side race listing-side price edits (update_owned_listing locks the listing,
// then the write-through trigger locks the item). Prices must end equal and nothing may deadlock.
async function stockVersusListingEdits() {
  await setStock(items.c, 40);
  for (let round = 0; round < 15; round += 1) {
    const results = await race([
      (client) => asOwner(client, ...movement(items.c, "sale", 1, `qa-conc-${suffix}-edit-sale-${round}`)),
      (client) => asOwner(client, "select public.update_owned_listing($1, $2, '{}', null, $3)", [listings.c, { price_pen: 900 + round }, randomUUID()]),
      (client) => asOwner(client, "select public.set_inventory_price_bulk($1, 'set', $2, $3)", [[items.c], 1100 + round, `qa-conc-${suffix}-edit-price-${round}`]),
      (client) => asOwner(client, ...movement(items.c, "damage_or_loss", 1, `qa-conc-${suffix}-edit-loss-${round}`)),
      (client) => asOwner(client, ...movement(items.c, "restock", 1, `qa-conc-${suffix}-edit-restock-${round}`)),
    ]);
    assert.ok(results.every((result) => result.ok), results.map(code).join());
    await assertConsistent(items.c);
  }
  // Every price change of a linked item is audited once, from whichever side made it. Since the accounts batch
  // (save-08) a decrease alerts favorites only when it is 5% or more and at most once a day per listing, so the races
  // leave at least one drop record, never more than the decreases, and never two within a day.
  const { rows } = await control.query(
    `select
       (select count(*)::int from public.store_inventory_changes
        where item_id = $1 and change_type = 'price' and (after->>'unit_price_pen')::int < (before->>'unit_price_pen')::int) as decreases,
       (select count(*)::int from public.listing_price_drops where listing_id = $2) as drops`,
    [items.c, listings.c],
  );
  assert.ok(rows[0].decreases > 0);
  assert.ok(rows[0].drops >= 1 && rows[0].drops <= rows[0].decreases, "price-drop records must come from actual decreases");
  assert.equal(rows[0].drops, 1, "at most one price-drop alert per listing per day");
}

// Linking, a stock movement and the V1 sold flow race on a fresh listing. Sold and linked are mutually exclusive; a
// movement may be asked to retry (INVENTORY_CONCURRENT_CHANGE) but never deadlocks.
async function linkVersusSold() {
  const outcomes = [];
  for (const name of ["d1", "d2", "d3", "d4", "d5"]) {
    const { version } = await item(items[name]);
    const results = await race([
      (client) => asOwner(client, "select public.link_inventory_listing($1, $2, $3, null)", [items[name], listings[name], version]),
      (client) => asOwner(client, "select public.set_owned_listing_lifecycle($1, 'sold')", [listings[name]]),
      (client) => asOwner(client, ...movement(items[name], "restock", 2, `qa-conc-${suffix}-link-${name}`)),
    ]);
    const [link, sold, move] = results.map(code);
    // The movement may land first and make the link's version stale; otherwise exactly one of link and sold wins.
    assert.ok(
      (link === "ok" && sold === "INVENTORY_MANAGED_LISTING") ||
        (sold === "ok" && ["INVENTORY_LISTING_INVALID", "INVENTORY_VERSION_CONFLICT"].includes(link)),
      `${name}: link=${link} sold=${sold}`,
    );
    assert.ok(["ok", "INVENTORY_CONCURRENT_CHANGE"].includes(move), `${name}: movement=${move}`);
    const row = await listing(listings[name]);
    assert.equal(row.status, link === "ok" ? "approved" : "sold");
    assert.equal(row.stock_state === null, link !== "ok", "stock_state is set exactly when linked");
    await assertConsistent(items[name]);
    outcomes.push(link === "ok" ? "linked" : "sold");
  }
  return outcomes;
}

// Review fix A3 (Codex items 1 and 5, finding 1). Publication takes the store row, then the allowance lock, then the
// SKU. An owner's stock or price change on that SKU inserts a ledger or audit row, whose foreign-key check needs a
// KEY SHARE lock on the same store row. With the store taken FOR UPDATE that check waited for publication while holding
// the SKU publication needed next: a deadlock. The control connection holds the allowance lock so publication stops
// right after taking the store row; the owner's change then runs, and must not wait for the store.
async function publicationVersus(kind) {
  const target = await importedSku(`QA-P${kind.toUpperCase()}`, 450);
  const [publisher, changer] = workers;
  const gate = ["select pg_advisory_lock(hashtextextended($1::text, 0))", [storeId]];
  await control.query(...gate);
  let gated = true;
  try {
    await open(publisher, "service");
    const publishing = settle(publisher.query("select public.publish_store_import_rows($1, $2, $3, true)",
      [ownerId, target.sessionId, publishRows(`Pedal ${kind} QA`)]));
    await waitFor(() => waitingOnLock(pids[0]), "publication to hold the store row");

    await open(changer);
    let done = false;
    const changing = settle(kind === "stock"
      ? changer.query(...movement(target.itemId, "restock", 2, `qa-conc-${suffix}-pub-${kind}`))
      : changer.query("select public.set_inventory_price_bulk($1, 'set', 1234, $2)", [[target.itemId], `qa-conc-${suffix}-pub-${kind}`]),
    ).then((result) => { done = true; return result; });
    await waitFor(async () => done || (await waitingOnLock(pids[1])), "the owner's change to finish or wait");
    const waitedForStore = !done;

    await control.query("select pg_advisory_unlock(hashtextextended($1::text, 0))", [storeId]);
    gated = false;
    // Publication now reaches the SKU the owner still holds, and waits for it (it reads the price only after that).
    if (!waitedForStore) await waitFor(() => waitingOnLock(pids[0]), "publication to wait for the SKU");
    const [change, published] = await finish([changer, changing], [publisher, publishing]);
    assert.equal(waitedForStore, false, "the owner's change waited for the store row held by publication");
    assert.ok(change.ok, change.error?.message);
    assert.ok(published.ok, published.error?.message);
    const [outcome] = published.value.results;
    assert.equal(outcome.outcome, "published", JSON.stringify(outcome));
    const row = await item(target.itemId);
    assert.equal(row.listing_id, outcome.listing_id);
    if (kind === "price") {
      assert.equal(row.unit_price_pen, 1234, "the owner's new price was overwritten by publication");
      assert.equal((await listing(outcome.listing_id)).price_pen, 1234, "publication used the price from before the change");
    } else {
      assert.equal(row.quantity_on_hand, 5);
    }
    await assertConsistent(target.itemId);
  } finally {
    if (gated) await control.query("select pg_advisory_unlock(hashtextextended($1::text, 0))", [storeId]);
  }
}

// Review fix A4 (Codex item 1, finding 2). A link request for SKU s to listing s2 waits behind an unlink holding s2.
// Meanwhile s is linked to s1, and a bulk operation over s and the SKU on s2 locks s1, then waits for s2. When the
// unlink commits, the stale request takes s2 and must not then wait for s1 (held by the bulk operation): it locks the
// SKU directly, sees it is already linked and gives up.
async function staleLink() {
  const [unlinker, stale, linker, bulk] = workers;
  const sku = items.s;
  const other = items.s2;

  await open(unlinker);
  const unlinked = await settle(unlinker.query("select public.unlink_inventory_listing($1, null, $2)", [other, (await item(other)).version]));
  assert.ok(unlinked.ok, unlinked.error?.message);

  await open(stale);
  const staleLinking = settle(stale.query("select public.link_inventory_listing($1, $2, $3, null)", [sku, listings.s2, (await item(sku)).version]));
  await waitFor(() => waitingOnLock(pids[1]), "the stale link to wait for s2");

  const linked = await asOwner(linker, "select public.link_inventory_listing($1, $2, $3, null)", [sku, listings.s1, (await item(sku)).version], false);
  assert.ok(linked.ok, linked.error?.message);

  await open(bulk);
  const operations = [sku, other].map((id) => ({ item_id: id, type: "restock", quantity: 1 }));
  const bulkRunning = settle(bulk.query("select public.apply_bulk_stock_operations($1, $2)", [JSON.stringify(operations), `qa-conc-${suffix}-stale-bulk`]));
  await waitFor(() => waitingOnLock(pids[3]), "the bulk operation to wait for s2");

  await unlinker.query("commit");
  const [staleResult, bulkResult] = await finish([stale, staleLinking], [bulk, bulkRunning]);
  assert.equal(code(staleResult), "INVENTORY_ITEM_ALREADY_LINKED");
  assert.ok(bulkResult.ok, bulkResult.error?.message);
  assert.equal((await item(sku)).listing_id, listings.s1);
  assert.equal((await item(other)).listing_id, null);
  await assertConsistent(sku);
  await assertConsistent(other);
}

// Review fix A5: bulk threshold and hide race stock, price and restore on the same linked SKU. Nothing deadlocks, every
// call succeeds, the hide or restore lands, and stock and price stay consistent.
async function thresholdAndHide() {
  const [first, second] = [items.h1, items.h2];
  await setStock(first, 40);
  await setStock(second, 40);
  for (let round = 0; round < 10; round += 1) {
    const hiding = round % 2 === 0;
    const results = await race([
      (client) => asOwner(client, "select public.set_inventory_threshold_bulk($1, $2, $3)", [[second, first], round, `qa-conc-${suffix}-th-${round}`]),
      (client) => asOwner(client, ...movement(first, "sale", 1, `qa-conc-${suffix}-th-sale-${round}`)),
      (client) => asOwner(client, "select public.set_inventory_price_bulk($1, 'add', $2, $3)", [[first, second], hiding ? -5 : 5, `qa-conc-${suffix}-th-p-${round}`]),
      (client) => asOwner(client, "select public.apply_bulk_stock_operations($1, $2)",
        [JSON.stringify([second, first].map((id) => ({ item_id: id, type: "restock", quantity: 1 }))), `qa-conc-${suffix}-th-b-${round}`]),
      ...(hiding
        ? [(client) => asOwner(client, "select public.hide_inventory_listings_bulk($1, $2)", [[second, first], `qa-conc-${suffix}-hide-${round}`])]
        : ["h1", "h2"].map((name) => (client) => asOwner(client, "select public.set_owned_listing_lifecycle($1, 'restore')", [listings[name]]))),
    ]);
    assert.ok(results.every((result) => result.ok), `round ${round}: ${results.map(code).join()}`);
    for (const name of ["h1", "h2"]) {
      assert.equal((await listing(listings[name])).status, hiding ? "hidden" : "approved", `round ${round}: ${name}`);
      assert.equal((await item(items[name])).low_stock_threshold, round);
      await assertConsistent(items[name]);
    }
  }
}

// Review fix A6 (Codex item 5, finding 2): publishing an import row races an edit that proposes one of the same photos
// for another listing. In both orders the second one waits for the photo and is refused: the photo ends up on exactly
// one listing.
async function photoPublicationVersusEdit() {
  const outcomes = [];
  for (const editFirst of [false, true]) {
    const target = await importedSku(`QA-F${editFirst ? "E" : "P"}`, 300);
    const { rows } = await control.query(
      "select laria_private.import_photo_url(a) as url from public.store_import_photo_assets a where a.session_id = $1 order by a.request_order",
      [target.sessionId],
    );
    const photo = rows[0].url;
    const [publisher, editor] = workers;
    const publish = () => settle(publisher.query("select public.publish_store_import_rows($1, $2, $3, true)",
      [ownerId, target.sessionId, publishRows(`Pedal foto ${editFirst ? "E" : "P"}`)]));
    const edit = () => settle(editor.query("select public.update_owned_listing($1, '{}', '{}', $2, $3)", [
      listings.e,
      JSON.stringify([{ image_url: `https://example.invalid/${suffix}-e-0.jpg` }, { image_url: photo }]),
      randomUUID(),
    ]));
    await open(publisher, "service");
    await open(editor);
    const firstClient = editFirst ? editor : publisher;
    const [secondClient, secondPid] = editFirst ? [publisher, pids[0]] : [editor, pids[1]];
    const first = await (editFirst ? edit() : publish());
    assert.ok(first.ok, first.error?.message);
    let done = false;
    const pending = (editFirst ? publish() : edit()).then((result) => { done = true; return result; });
    await waitFor(async () => done || (await waitingOnLock(secondPid)), "the second attachment to finish or wait");
    const waited = !done;
    await firstClient.query("commit");
    const [second] = await finish([secondClient, pending]);
    const { rows: users } = await control.query(
      `select count(distinct listing_id)::int as listings from (
         select listing_id from public.listing_photos where image_url = $1
         union all
         select r.listing_id from public.listing_revision_photos rp join public.listing_revisions r on r.id = rp.revision_id where rp.image_url = $1) used`,
      [photo],
    );
    assert.equal(users[0].listings, 1, `${editFirst ? "edit" : "publication"} first: the photo is used by ${users[0].listings} listings`);
    assert.ok(waited, `${editFirst ? "edit" : "publication"} first: the second attachment did not wait for the photo`);
    if (editFirst) {
      assert.ok(second.ok, second.error?.message);
      assert.equal(second.value.results[0].outcome, "failed", "publication went ahead with a photo the edit uses");
    } else {
      assert.match(second.error?.message ?? "", /LISTING_PHOTO_INVALID/, "the edit went ahead with a published photo");
    }
    outcomes.push(editFirst ? "edit kept the photo" : "publication kept the photo");
  }
  return outcomes;
}

// --mutation: drop the SKU row lock from the shared helpers (laria_private.lock_inventory_item and lock_inventory_items)
// and keep the listing locks. The linked last-unit race stays green (the listing lock still serializes it); the unlinked
// one must catch the oversell. The original functions are restored afterwards, also on failure.
async function itemLockMutation() {
  const helpers = ["laria_private.lock_inventory_item(uuid)", "laria_private.lock_inventory_items(uuid[])"];
  const originals = [];
  for (const signature of helpers) {
    originals.push((await control.query("select pg_get_functiondef($1::regprocedure) as def", [signature])).rows[0].def);
  }
  const mutated = [
    originals[0].replace("from public.store_inventory_items where id = p_item_id for update;", "from public.store_inventory_items where id = p_item_id;"),
    originals[1].replace("perform 1 from public.store_inventory_items where id = any(p_item_ids) order by id for update;", ""),
  ];
  assert.ok(mutated.every((def, index) => def !== originals[index]), "mutation did not apply");
  try {
    for (const def of mutated) await control.query(def);
    await lastUnit("a", 40);
    let caught = null;
    try {
      await lastUnit("u1", 200);
    } catch (error) {
      caught = error;
    }
    assert.ok(caught, "the unlinked last-unit race did not notice the missing SKU lock");
    return [`linked race masked, unlinked race failed: ${caught.message.split("\n")[0]}`];
  } finally {
    for (const def of originals) await control.query(def);
  }
}

(async () => {
  control = await connect();
  for (let index = 0; index < WORKERS; index += 1) workers.push(await connect());
  for (const worker of workers) pids.push((await worker.query("select pg_backend_pid() as pid")).rows[0].pid);
  let failed = false;
  try {
    await setup();
    const checks = MUTATION ? [["mutation: SKU lock removed", itemLockMutation]] : [
      ["last unit", () => lastUnit("a")],
      ["last unit, unlinked SKU", () => lastUnit("u1")],
      ["same-key retries", sameKeyRetries],
      ["same key, different payload", sameKeyDifferentPayload],
      ["stale count", () => staleCount("a")],
      ["stale count, unlinked SKU", () => staleCount("u1")],
      ["bulk and single, opposite orders", () => bulkAndSingle("a", "b")],
      ["bulk and single, unlinked SKU", () => bulkAndSingle("u1", "u2")],
      ["stock versus listing edits", stockVersusListingEdits],
      ["threshold and hide versus stock and price", thresholdAndHide],
      ["link versus sold", linkVersusSold],
      ["stale link request versus bulk", staleLink],
      ["stock versus publication", () => publicationVersus("stock")],
      ["price versus publication", () => publicationVersus("price")],
      ["photo: publication versus edit", photoPublicationVersusEdit],
    ];
    // LARIA_ONLY=<text> runs only the checks whose name contains it.
    for (const [name, check] of checks.filter(([name]) => !process.env.LARIA_ONLY || name.includes(process.env.LARIA_ONLY))) {
      const detail = await check();
      console.log(`PASS ${name}${detail ? ` (${detail.join(", ")})` : ""}`);
    }
  } catch (error) {
    failed = true;
    console.error(error);
  } finally {
    try {
      await cleanup();
    } catch (error) {
      failed = true;
      console.error("Cleanup failed:", error);
    }
    await Promise.all([control, ...workers].map((client) => client.end()));
  }
  process.exitCode = failed ? 1 : 0;
})();
