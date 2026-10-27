// Explicit local integration test for the locks of the page refresh migration (launch audit A19, Codex's seventh review
// of #42). Writers take the nine tables the migration adds triggers to in many orders (a listing's price edit updates
// its inventory item, an inventory price edit its listing, a new listing its photos), so the migration's first
// statement takes all nine at once without waiting. For each of the nine, a writer holds it, the migration runs on
// another connection, and the writer then takes the other eight and the record's tables, as a writer does whose
// triggers reach them: the writer must get them at once, both must finish, and nobody may be stopped for a deadlock.
// The harness checks itself on the listing price edit: without the first statement, each trigger waits for its own
// table in turn, as the version Codex reviewed did, and the same writer must end in a deadlock.
// The migration runs as a second run inside a transaction that is rolled back, so the database is left as it was.
// Usage: node tests/launch-audit-page-refresh-locks.integration.cjs [postgresql://postgres:postgres@127.0.0.1:54322/postgres]
// The URL may also come from LARIA_TEST_DATABASE_URL. Hosted databases are refused. The database needs every
// migration applied (setup-local-db.sh reset).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const url =
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ||
  process.env.LARIA_TEST_DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) {
  throw new Error("Local database URL required.");
}

const migration = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/20261113130000_launch_audit_page_refresh.sql"),
  "utf8",
);
const tables = migration
  .match(/^\s*lock table ([\s\S]*?)\n\s*in share row exclusive mode nowait;/m)[1]
  .split(",")
  .map((table) => table.trim());
const record = ["laria_private.public_page_changes", "laria_private.public_page_deployment", "laria_private.public_page_clock"];
const stepStart = migration.indexOf("\ndo $$\n");
const withoutStep = migration.slice(0, stepStart) + migration.slice(migration.indexOf("\n$$;\n", stepStart) + 4);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = (promise) =>
  promise.then(
    () => ({ ok: true, at: Date.now() }),
    (error) => ({ ok: false, code: error.code, message: error.message, at: Date.now() }),
  );

async function connect() {
  const client = new Client({ connectionString: url, statement_timeout: 60_000 });
  await client.connect();
  return client;
}

// The writer holds `first`, the migration starts, and the writer then takes the other tables. Without a deadlock the
// writer commits after a short hold and the migration finishes after it.
async function replay(sql, first) {
  const writer = await connect();
  const migrator = await connect();
  try {
    await writer.query("begin");
    await writer.query(`lock table ${first} in row exclusive mode`);
    await migrator.query("begin");
    const applying = settle(migrator.query(sql));
    await sleep(300);
    const asked = Date.now();
    const wrote = await settle(
      writer.query(`lock table ${[...tables.filter((table) => table !== first), ...record].join(", ")} in row exclusive mode`),
    );
    let committed = null;
    if (wrote.ok) {
      await sleep(200);
      await writer.query("commit");
      committed = Date.now();
    } else {
      await writer.query("rollback");
    }
    const applied = await applying;
    await migrator.query("rollback");
    return { wrote, waited: wrote.at - asked, committed, applied };
  } finally {
    await Promise.all([writer.end(), migrator.end()]);
  }
}

async function main() {
  assert.deepEqual([...tables].sort(), [
    "laria_private.assisted_commerce_settings", "public.listing_photos", "public.listing_sound_clips", "public.listings",
    "public.profiles", "public.store_inventory_items", "public.store_payment_methods", "public.stores",
    "public.transaction_reviews",
  ]);
  assert.ok(stepStart > 0 && !/^\s*lock table /m.test(withoutStep));
  const control = await connect();
  // The migration's own triggers on its nine tables: a later table with page-change triggers of its own (talk-06's
  // public.listing_reservations) is not this migration's.
  const triggers = async () =>
    (await control.query("select count(*)::int as n from pg_trigger where tgname like '%\\_public\\_page\\_changes\\_%' and not tgisinternal and tgrelid = any($1::regclass[])", [tables])).rows[0].n;
  const before = await triggers();
  assert.equal(before, 24, "apply every migration first (setup-local-db.sh reset)");

  for (const first of tables) {
    const result = await replay(migration, first);
    assert.ok(result.wrote.ok, `${first}: the writer was stopped: ${result.wrote.message}`);
    assert.ok(result.waited < 1000, `${first}: the writer waited ${result.waited} ms for the migration`);
    assert.ok(result.applied.ok, `${first}: the migration failed: ${result.applied.message}`);
    assert.ok(result.applied.at >= result.committed, `${first}: the migration finished before the writer let go`);
    console.log(`PASS writer holding ${first}: got the other tables in ${result.waited} ms; the migration finished ${result.applied.at - result.committed} ms after the writer`);
  }

  const mutated = await replay(withoutStep, "public.listings");
  const stopped = [mutated.wrote, mutated.applied].find((side) => !side.ok);
  assert.equal(stopped && stopped.code, "40P01", "without the first statement the price edit's writer must deadlock with the migration");
  console.log(`PASS self-check: without the first statement, a writer holding public.listings deadlocks with the migration (${stopped.message})`);

  assert.equal(await triggers(), before);
  await control.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
