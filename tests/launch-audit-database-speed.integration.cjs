// Explicit local integration test for the locks of the two A34 migrations (launch audit,
// supabase/migrations/20261114190000_launch_audit_foreign_key_indexes.sql and
// 20261114191000_launch_audit_policy_checks_once.sql). An index build takes a SHARE lock on its table and a policy
// change an ACCESS EXCLUSIVE one, held until the migration commits, and writers take these tables in many orders. So
// each migration's first statement takes all its locks at once without waiting. For each table of each migration, a
// writer holds it, the migration runs on another connection, and the writer then takes every other table of that
// migration: the writer must get them at once, both must finish, and nobody may be stopped for a deadlock. The harness
// checks itself on each migration without its first statement, where the same writer, holding the last table the
// migration reaches, must end in a deadlock.
// Each migration runs as a second run inside a transaction that is rolled back, so the database is left as it was.
// Usage: node tests/launch-audit-database-speed.integration.cjs [postgresql://postgres:postgres@127.0.0.1:54322/postgres]
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

function load(file, mode, last) {
  const sql = fs.readFileSync(path.join(__dirname, "../supabase/migrations", file), "utf8");
  const tables = sql
    .match(new RegExp(`^\\s*lock table ([\\s\\S]*?)\\n\\s*in ${mode} mode nowait;`, "m"))[1]
    .split(",")
    .map((table) => table.trim());
  const stepStart = sql.indexOf("\ndo $$\n");
  const withoutStep = sql.slice(0, stepStart) + sql.slice(sql.indexOf("\n$$;\n", stepStart) + 4);
  assert.ok(stepStart > 0 && !/^\s*lock table /m.test(withoutStep), `${file}: its first statement takes the locks`);
  return { file, sql, tables, withoutStep, last };
}

const migrations = [
  load("20261114190000_launch_audit_foreign_key_indexes.sql", "share", "laria_private.search_alert_matches"),
  load("20261114191000_launch_audit_policy_checks_once.sql", "access exclusive", "storage.objects"),
];

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
async function replay(sql, tables, first) {
  const writer = await connect();
  const migrator = await connect();
  try {
    await writer.query("begin");
    await writer.query(`lock table ${first} in row exclusive mode`);
    await migrator.query("begin");
    const applying = settle(migrator.query(sql));
    await sleep(250);
    const asked = Date.now();
    const wrote = await settle(
      writer.query(`lock table ${tables.filter((table) => table !== first).join(", ")} in row exclusive mode`),
    );
    let committed = null;
    if (wrote.ok) {
      await sleep(150);
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
  const control = await connect();
  const state = async () =>
    (
      await control.query(`
        select (select count(*) from pg_indexes where indexname in ('notifications_listing_idx', 'search_alert_matches_user_idx'))::int as indexes,
          (select count(*) from pg_policies where qual like '%( SELECT auth.uid() AS uid)%' or with_check like '%( SELECT auth.uid() AS uid)%')::int as policies`)
    ).rows[0];
  const before = await state();
  assert.equal(before.indexes, 2, "apply every migration first (setup-local-db.sh reset)");

  for (const migration of migrations) {
    for (const first of migration.tables) {
      const result = await replay(migration.sql, migration.tables, first);
      assert.ok(result.wrote.ok, `${migration.file}, ${first}: the writer was stopped: ${result.wrote.message}`);
      assert.ok(result.waited < 1000, `${migration.file}, ${first}: the writer waited ${result.waited} ms for the migration`);
      assert.ok(result.applied.ok, `${migration.file}, ${first}: the migration failed: ${result.applied.message}`);
      assert.ok(result.applied.at >= result.committed, `${migration.file}, ${first}: the migration finished before the writer let go`);
    }
    console.log(`PASS ${migration.file}: with a writer holding any of its ${migration.tables.length} tables, the writer got the rest at once and the migration finished after it`);

    const mutated = await replay(migration.withoutStep, migration.tables, migration.last);
    const stopped = [mutated.wrote, mutated.applied].find((side) => !side.ok);
    assert.equal(stopped && stopped.code, "40P01", `${migration.file}: without the first statement the writer must deadlock with it`);
    console.log(`PASS self-check: without its first statement, a writer holding ${migration.last} deadlocks with it (${stopped.message})`);
  }

  assert.deepEqual(await state(), before);
  await control.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
