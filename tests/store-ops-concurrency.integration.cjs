// Explicit local integration test for STORE-1a stock concurrency (docs/store-operations/design.md §14). Every race
// runs on separate database connections released together from an advisory-lock barrier, so the database really
// interleaves them. Creates isolated QA rows and removes them at the end, ledger included (see cleanup()).
// Usage: node tests/store-ops-concurrency.integration.cjs [postgresql://postgres:postgres@127.0.0.1:54322/postgres]
// The URL may also come from LARIA_TEST_DATABASE_URL. Hosted databases are refused. LARIA_RACE_ROUNDS sets the
// last-unit repetitions (default 200, as in the design).
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

const BARRIER = 357_001; // advisory lock key shared by every worker
const WORKERS = 20;
const LAST_UNIT_ROUNDS = Number(process.env.LARIA_RACE_ROUNDS) || 200;
const suffix = randomUUID().slice(0, 8);
const ownerId = randomUUID();
const storeId = randomUUID();
const listings = {};
const items = {};
let control;
const workers = [];

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
  for (const name of ["a", "b", "c", "d1", "d2", "d3", "d4", "d5"]) {
    listings[name] = randomUUID();
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

  for (const name of ["a", "b", "c"]) {
    const created = await owner("select public.create_inventory_item($1, $2, $3)", [
      { merchant_sku: `QA-${name.toUpperCase()}`, product_name: `Guitarra ${name}`, listing_id: listings[name] },
      1,
      `qa-conc-${suffix}-create-${name}`,
    ]);
    assert.equal(code(created), "ok", created.error?.message);
    items[name] = created.value.item.id;
  }
  for (const name of ["d1", "d2", "d3", "d4", "d5"]) {
    const created = await owner("select public.create_inventory_item($1, $2, $3)", [
      { merchant_sku: `QA-${name.toUpperCase()}`, product_name: `Guitarra ${name}`, unit_price_pen: 1000 },
      0,
      `qa-conc-${suffix}-create-${name}`,
    ]);
    assert.equal(code(created), "ok", created.error?.message);
    items[name] = created.value.item.id;
  }
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
    await control.query("delete from public.store_inventory_items where store_id = $1", [storeId]);
    await control.query("delete from public.listings where store_id = $1", [storeId]);
    await control.query("delete from public.stores where id = $1", [storeId]);
    await control.query("delete from auth.users where id = $1", [ownerId]);
    await control.query("commit");
  } catch (error) {
    await control.query("rollback");
    throw error;
  }
}

// 2 to 20 buyers race for the last unit, LAST_UNIT_ROUNDS times.
async function lastUnit() {
  for (let round = 0; round < LAST_UNIT_ROUNDS; round += 1) {
    await setStock(items.a, 1);
    const results = await race(
      workers.slice(0, 2 + (round % 19)).map((_, index) => (client) =>
        asOwner(client, ...movement(items.a, "sale", 1, `qa-conc-${suffix}-last-${round}-${index}`))),
    );
    const codes = results.map(code);
    assert.equal(codes.filter((value) => value === "ok").length, 1, `round ${round}: ${codes}`);
    assert.ok(codes.every((value) => value === "ok" || value === "STOCK_INSUFFICIENT"), `round ${round}: ${codes}`);
    assert.equal((await item(items.a)).quantity_on_hand, 0);
    assert.equal((await listing(listings.a)).stock_state, "out_of_stock");
    assert.equal((await listing(listings.a)).status, "approved", "stock must never change listing status");
  }
  await assertConsistent(items.a);
  return [`${LAST_UNIT_ROUNDS} rounds`];
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

async function staleCount() {
  const { version } = await item(items.a);
  const results = await race(
    [10, 11, 12, 13].map((quantity, index) => (client) =>
      asOwner(client, ...movement(items.a, "stock_count", quantity, `qa-conc-${suffix}-count-${index}`, { version }))),
  );
  const codes = results.map(code);
  assert.equal(codes.filter((value) => value === "ok").length, 1, codes.join());
  assert.ok(codes.every((value) => value === "ok" || value === "INVENTORY_VERSION_CONFLICT"), codes.join());

  // A count against version v racing a sale: either the count lands first and the sale follows it, or the sale lands
  // first and the count is refused. A count never silently erases a sale it did not see.
  for (let round = 0; round < 20; round += 1) {
    const current = await item(items.a);
    const [count, sale] = await race([
      (client) => asOwner(client, ...movement(items.a, "stock_count", 30, `qa-conc-${suffix}-vs-count-${round}`, { version: current.version })),
      (client) => asOwner(client, ...movement(items.a, "sale", 1, `qa-conc-${suffix}-vs-sale-${round}`)),
    ]);
    assert.equal(code(sale), "ok");
    if (count.ok) {
      assert.ok(sale.value.movement.item_version_after > count.value.movement.item_version_after, "sale was overwritten by a count");
      assert.equal((await item(items.a)).quantity_on_hand, 29);
    } else {
      assert.equal(code(count), "INVENTORY_VERSION_CONFLICT");
    }
  }
  await assertConsistent(items.a);
}

// Bulk paths lock listings, then items, each in id order; single paths lock listing then item. Opposite request orders
// must never deadlock.
async function bulkAndSingle() {
  await setStock(items.a, 50);
  await setStock(items.b, 50);
  for (let round = 0; round < 15; round += 1) {
    const forward = [items.a, items.b].map((id) => ({ item_id: id, type: "restock", quantity: 1 }));
    const backward = [items.b, items.a].map((id) => ({ item_id: id, type: "sale", quantity: 1, channel: "otro" }));
    const results = await race([
      (client) => asOwner(client, "select public.apply_bulk_stock_operations($1, $2)", [JSON.stringify(forward), `qa-conc-${suffix}-bulk-f-${round}`]),
      (client) => asOwner(client, "select public.apply_bulk_stock_operations($1, $2)", [JSON.stringify(backward), `qa-conc-${suffix}-bulk-b-${round}`]),
      (client) => asOwner(client, ...movement(items.b, "sale", 1, `qa-conc-${suffix}-bulk-sb-${round}`)),
      (client) => asOwner(client, ...movement(items.a, "restock", 2, `qa-conc-${suffix}-bulk-sa-${round}`)),
      (client) => asOwner(client, "select public.set_inventory_price_bulk($1, 'add', $2, $3)", [[items.b, items.a], round % 2 ? 5 : -5, `qa-conc-${suffix}-bulk-p-${round}`]),
    ]);
    assert.ok(results.every((result) => result.ok), results.map(code).join());
  }
  await assertConsistent(items.a);
  await assertConsistent(items.b);
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
  // Exactly one price-drop record per actual decrease: every price change of a linked item is audited once, from
  // whichever side made it.
  const { rows } = await control.query(
    `select
       (select count(*)::int from public.store_inventory_changes
        where item_id = $1 and change_type = 'price' and (after->>'unit_price_pen')::int < (before->>'unit_price_pen')::int) as decreases,
       (select count(*)::int from public.listing_price_drops where listing_id = $2) as drops`,
    [items.c, listings.c],
  );
  assert.ok(rows[0].decreases > 0);
  assert.equal(rows[0].drops, rows[0].decreases, "price-drop records must match actual decreases");
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

(async () => {
  control = await connect();
  for (let index = 0; index < WORKERS; index += 1) workers.push(await connect());
  let failed = false;
  try {
    await setup();
    const checks = [
      ["last unit", lastUnit],
      ["same-key retries", sameKeyRetries],
      ["same key, different payload", sameKeyDifferentPayload],
      ["stale count", staleCount],
      ["bulk and single, opposite orders", bulkAndSingle],
      ["stock versus listing edits", stockVersusListingEdits],
      ["link versus sold", linkVersusSold],
    ];
    for (const [name, check] of checks) {
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
