// Explicit local integration test for the cap on kinds of error (launch audit A13,
// supabase/migrations/20261114170000_launch_audit_monitoring.sql). public.record_app_error keeps at most 25 kinds per
// source in each 10 minutes and counts the rest in one overflow row. Two new kinds reported at the same moment, when
// one place is left, must not both get it: the second waits for the first and goes to the overflow row. A kind already
// counted, or the other source, must not wait. Two connections replay it with the server's errors, whose messages make
// kinds; a browser's message is one of a fixed list, so made-up ones are all one kind.
// Usage: node tests/launch-audit-monitoring.integration.cjs [postgresql://postgres:postgres@127.0.0.1:54322/postgres]
// The URL may also come from LARIA_TEST_DATABASE_URL. Hosted databases are refused. The database needs every
// migration applied (setup-local-db.sh reset); the counts it commits are removed at the end.
const assert = require("node:assert/strict");
const { Client } = require("pg");

const url =
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ||
  process.env.LARIA_TEST_DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) {
  throw new Error("Local database URL required.");
}

const MARK = "Carrera A13";
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

// Opens a transaction as the service role and counts one error, leaving the transaction open.
async function record(client, source, message, name = "Error") {
  await client.query("begin");
  await client.query("set local role service_role");
  await client.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
  return client.query("select public.record_app_error($1, 'error', '/', $3, $2, '', null) as fingerprint", [source, message, name]);
}

const bucketNow = "date_bin(interval '10 minutes', clock_timestamp(), timestamptz '2001-01-01 00:00:00+00')";

// The browser kinds the test made, by fingerprint: their message is no longer the one sent.
const browserKinds = [];

async function cleanup(control) {
  await control.query(
    `delete from laria_private.app_errors
     where message like $1 or fingerprint = any($2::text[])
       or (fingerprint like 'overflow-%' and bucket >= ${bucketNow} - interval '10 minutes')`,
    [`${MARK}%`, browserKinds],
  );
}

async function main() {
  const control = await connect();
  const first = await connect();
  const second = await connect();
  try {
    await cleanup(control);
    // All of it must happen in one 10-minute bucket: wait out a boundary that is less than 20 seconds away.
    const { rows } = await control.query(`select extract(epoch from ${bucketNow} + interval '10 minutes' - clock_timestamp()) as left`);
    if (Number(rows[0].left) < 20) await sleep((Number(rows[0].left) + 1) * 1000);
    const { rows: existing } = await control.query(
      `select count(*)::integer as kinds from laria_private.app_errors where source = 'server' and bucket = ${bucketNow}`,
    );
    assert.ok(existing[0].kinds < 24, `the bucket has room for the fixtures (${existing[0].kinds} server kinds)`);
    // 24 server kinds: one place left.
    await control.query("begin");
    await control.query("set local role service_role");
    await control.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
    for (let n = existing[0].kinds + 1; n <= 24; n += 1) {
      await control.query("select public.record_app_error('server', 'error', '/', 'Error', $1, '', null)", [`${MARK} ${String.fromCharCode(64 + n)}`]);
    }
    await control.query("commit");

    // 1. Two new kinds at once: the first takes the last place, the second waits for it and goes to the overflow row.
    const taken = await record(first, "server", `${MARK} nueva uno`);
    const started = Date.now();
    const waiting = settle(record(second, "server", `${MARK} nueva dos`));
    assert.equal(await within(waiting, 500), null, "the second new kind waits for the first");
    await first.query("commit");
    const committedAt = Date.now();
    const result = await waiting;
    await second.query("commit");
    assert.ok(result.ok, `the second goes in: ${result.message ?? ""}`);
    assert.ok(result.at >= committedAt, "only after the first committed");
    assert.match(taken.rows[0].fingerprint, /^[0-9a-f]{32}$/, "the first took the last place");
    assert.equal(result.rows[0].fingerprint, "overflow-server", "the second is counted in the overflow row");
    const { rows: kinds } = await control.query(
      `select count(*) filter (where fingerprint <> 'overflow-server')::integer as kinds,
         count(*) filter (where fingerprint = 'overflow-server')::integer as overflow
       from laria_private.app_errors where source = 'server' and bucket = ${bucketNow}`,
    );
    assert.deepEqual(kinds[0], { kinds: 25, overflow: 1 }, "25 kinds and the overflow row");
    console.log(`PASS two new kinds at once with one place left: the second waited ${committedAt - started} ms, then went to the overflow row`);

    // 2. While a new kind is being counted, a kind already counted and the browsers' errors don't wait.
    await record(first, "server", `${MARK} nueva tres`);
    const again = Date.now();
    const known = await settle(record(second, "server", `${MARK} A`));
    const knownTook = known.at - again;
    await second.query("commit");
    const browser = await settle(record(second, "browser", `${MARK} navegador`, "EvalError"));
    const browserTook = browser.at - known.at;
    if (browser.ok) browserKinds.push(browser.rows[0].fingerprint);
    await second.query("commit");
    await first.query("commit");
    assert.ok(known.ok && knownTook < 500, `a kind already counted doesn't wait (${knownTook} ms)`);
    assert.ok(browser.ok && browserTook < 500, `the browsers' own cap doesn't wait for the server's (${browserTook} ms)`);
    console.log(`PASS a known kind (${knownTook} ms) and a browser (${browserTook} ms) don't wait`);
  } finally {
    for (const client of [first, second]) await client.query("rollback").catch(() => undefined);
    await cleanup(control).catch((error) => console.error("cleanup failed:", error.message));
    await Promise.all([control.end(), first.end(), second.end()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
