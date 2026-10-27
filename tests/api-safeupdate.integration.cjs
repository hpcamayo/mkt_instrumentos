// Supabase refuses, on every API call, an UPDATE or DELETE without a WHERE clause (pg_safeupdate, loaded for the
// authenticator role), and that covers the statements the functions and triggers of the call run too. Local Postgres
// and the migration connection don't load it, so a function can pass every suite and still fail in production, as
// the page refresh job's claim did on 27 Oct 2026. This test reads every function of public and laria_private from
// the database, with the SQL inside its strings (run by EXECUTE), and fails on any UPDATE or DELETE without a WHERE
// clause of its own (`where true` when every row is meant). When the session can load a library with the same check
// (safeupdate, or the local stand-in laria_safeupdate), it also runs the page refresh job's two functions with the
// check on, and checks itself on the claim as it was before the fix.
// Usage: node tests/api-safeupdate.integration.cjs [postgresql://postgres:postgres@127.0.0.1:54322/postgres]
// The URL may also come from LARIA_TEST_DATABASE_URL. Hosted databases are refused. The database needs every
// migration applied (setup-local-db.sh reset); the second part leaves it as it was (each case is rolled back).
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

// The function's code with comments dropped and every literal blanked, and the text of each string literal.
function splitLiterals(source) {
  let code = "";
  const strings = [];
  let i = 0;
  while (i < source.length) {
    if (source.startsWith("--", i)) {
      const end = source.indexOf("\n", i);
      i = end < 0 ? source.length : end;
      code += " ";
    } else if (source.startsWith("/*", i)) {
      let depth = 0;
      do {
        if (source.startsWith("/*", i)) {
          depth += 1;
          i += 2;
        } else if (source.startsWith("*/", i)) {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      } while (depth > 0 && i < source.length);
      code += " ";
    } else if (source[i] === "'") {
      const escapes = /(^|[^A-Za-z0-9_$])[eE]$/.test(code);
      let text = "";
      i += 1;
      while (i < source.length) {
        if (escapes && source[i] === "\\") {
          text += source.slice(i, i + 2);
          i += 2;
        } else if (source[i] === "'" && source[i + 1] === "'") {
          text += "'";
          i += 2;
        } else if (source[i] === "'") {
          i += 1;
          break;
        } else {
          text += source[i];
          i += 1;
        }
      }
      strings.push(text);
      code += "''";
    } else if (source[i] === '"') {
      const end = source.indexOf('"', i + 1);
      i = end < 0 ? source.length : end + 1;
      code += " quoted_name ";
    } else if (source[i] === "$" && !/[A-Za-z0-9_$]$/.test(code) && /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.test(source.slice(i))) {
      const tag = source.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)[0];
      const end = source.indexOf(tag, i + tag.length);
      strings.push(source.slice(i + tag.length, end < 0 ? source.length : end));
      i = end < 0 ? source.length : end + tag.length;
      code += "''";
    } else {
      code += source[i];
      i += 1;
    }
  }
  return { code, strings };
}

// Words that, right before UPDATE or DELETE, make it something else: FOR [NO KEY] UPDATE, ON CONFLICT DO UPDATE,
// trigger events, foreign key actions, privileges.
const notAStatement = new Set(["for", "key", "do", "or", "on", "before", "after", "of", "instead", "grant", "revoke", ","]);

// Each UPDATE or DELETE in `source` without a WHERE of its own: one at its own depth, before its statement ends with a
// semicolon or with the parenthesis that closes its WITH query.
function unfiltered(source) {
  const { code, strings } = splitLiterals(source);
  const tokens = code.toLowerCase().match(/[a-z_][a-z0-9_$]*|\d+|\S/g) || [];
  const found = [];
  tokens.forEach((token, start) => {
    if ((token !== "update" && token !== "delete") || notAStatement.has(tokens[start - 1])) return;
    let depth = 0;
    let end = start + 1;
    let where = false;
    for (; end < tokens.length; end += 1) {
      const next = tokens[end];
      if (next === "(") depth += 1;
      else if (next === ")" && depth === 0) break;
      else if (next === ")") depth -= 1;
      else if (next === ";" && depth === 0) break;
      else if (next === "where" && depth === 0) where = true;
    }
    if (!where) found.push(tokens.slice(start, Math.min(end, start + 14)).join(" "));
  });
  // A string is SQL run by EXECUTE when it reads like a statement; 'UPDATE' alone is a trigger's tg_op.
  for (const text of strings) {
    if (/\bdelete\s+from\b|\bupdate\b[\s\S]*\bset\b/i.test(text)) {
      found.push(...unfiltered(text).map((statement) => `EXECUTE: ${statement}`));
    }
  }
  return found;
}

const settle = (promise) =>
  promise.then(
    (result) => ({ ok: true, rows: result.rows }),
    (error) => ({ ok: false, code: error.code, message: error.message }),
  );

async function loadCheck(client) {
  for (const library of ["safeupdate", "laria_safeupdate"]) {
    const loaded = await settle(client.query(`load '${library}'`));
    if (loaded.ok) return library;
  }
  return null;
}

// The page refresh job's two calls as the job makes them, with a waiting row, in a transaction that is rolled back.
async function runRefreshJob(client, claimFunction) {
  await client.query("begin");
  try {
    if (claimFunction) await client.query(claimFunction);
    await client.query("insert into laria_private.public_page_changes default values");
    await client.query("set local role service_role");
    await client.query(`set local request.jwt.claims = '{"role":"service_role"}'`);
    const claimed = await settle(client.query("select public.claim_public_page_changes('dpl_safeupdate_check') as claim"));
    if (!claimed.ok) return { claimed };
    const claim = claimed.rows[0].claim;
    const completed = await settle(
      client.query("select public.complete_public_page_changes($1, 'nonce-safeupdate', 'dpl_safeupdate_check')", [claim]),
    );
    return { claimed, claim, completed };
  } finally {
    await client.query("rollback");
  }
}

async function main() {
  // The scanner catches what the check refuses, and nothing else.
  assert.deepEqual(unfiltered("begin update t set a = 1; end"), ["update t set a = 1"]);
  assert.deepEqual(unfiltered("delete from t using u where t.id = u.id; update t set a = (select 1 where true);"), [
    "update t set a = ( select 1 where true )",
  ]);
  assert.deepEqual(unfiltered("with x as (delete from t returning id) select count(*) from x"), ["delete from t returning id"]);
  assert.deepEqual(unfiltered("select 1 from t for update; insert into t values (1) on conflict (id) do update set a = 2;"), []);
  assert.deepEqual(unfiltered("execute format('update %I set a = 1', 't'); -- update t set a = 1\nupdate t set a = 1 where true;"), [
    "EXECUTE: update % i set a = 1",
  ]);
  assert.deepEqual(unfiltered("perform 1; /* delete from t */ execute $q$delete from t where id = $1$q$ using 1;"), []);
  assert.deepEqual(unfiltered("if tg_op = 'UPDATE' or tg_op = 'DELETE' then return old; end if;"), []);

  const client = new Client({ connectionString: url, statement_timeout: 60_000 });
  await client.connect();
  try {
    const functions = (
      await client.query(`
        select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as name, p.prosrc
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        join pg_language l on l.oid = p.prolang
        where n.nspname in ('public', 'laria_private') and l.lanname in ('plpgsql', 'sql')
          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
        order by 1`)
    ).rows;
    assert.ok(
      functions.some((fn) => fn.name === "public.claim_public_page_changes(p_deployment text)"),
      "apply every migration first (setup-local-db.sh reset)",
    );
    const findings = functions.flatMap((fn) => unfiltered(fn.prosrc).map((statement) => `${fn.name}: ${statement}`));
    assert.deepEqual(findings, [], `UPDATE or DELETE without a WHERE clause, which Supabase refuses on API calls:\n${findings.join("\n")}`);
    console.log(`PASS ${functions.length} functions: every UPDATE and DELETE has a WHERE clause`);

    const library = await loadCheck(client);
    if (!library) {
      console.log("SKIP the run with the check on: neither safeupdate nor laria_safeupdate can be loaded here");
      return;
    }
    const refused = await settle(client.query("begin; update laria_private.public_page_clock set checked_at = now(); rollback"));
    await client.query("rollback");
    assert.equal(refused.message, "UPDATE requires a WHERE clause", `${library} must refuse a bare update`);

    const run = await runRefreshJob(client, null);
    assert.ok(run.claimed.ok, `the claim failed with the check on: ${run.claimed.message}`);
    assert.ok(run.claim, "the claim took no row");
    assert.ok(run.completed.ok, `the finish failed with the check on: ${run.completed.message}`);
    console.log(`PASS with ${library} loaded: the page refresh job claims and finishes`);

    const original = fs.readFileSync(
      path.join(__dirname, "../supabase/migrations/20261113130000_launch_audit_page_refresh.sql"),
      "utf8",
    );
    const claimFunction = original.match(/create or replace function public\.claim_public_page_changes[\s\S]*?\n\$\$;\n/)[0];
    assert.match(claimFunction, /update laria_private\.public_page_changes set claim_id = claim;/);
    const before = await runRefreshJob(client, claimFunction);
    assert.equal(before.claimed.message, "UPDATE requires a WHERE clause", "the claim before the fix must be refused");
    console.log(`PASS self-check: with ${library} loaded, the claim as first applied is refused (${before.claimed.message})`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
