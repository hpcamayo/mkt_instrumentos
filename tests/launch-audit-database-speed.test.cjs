// Launch audit A34 (supabase/migrations/20261114190000_launch_audit_foreign_key_indexes.sql and
// 20261114191000_launch_audit_policy_checks_once.sql): each migration takes every lock it needs in its first
// statement, so it never waits on a writer while holding another table. What the indexes and policies do is checked on
// the database (tests/launch-audit-database-speed.sql).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const indexFile = "supabase/migrations/20261114190000_launch_audit_foreign_key_indexes.sql";
const policyFile = "supabase/migrations/20261114191000_launch_audit_policy_checks_once.sql";

// The tables of the first statement's `lock table ... in <mode> mode nowait`, and the mode.
function lockedTables(sql) {
  const match = sql.match(/lock table ([\s\S]*?)\s+in (share|access exclusive) mode nowait;/);
  assert.ok(match, "the migration starts by locking its tables");
  return { mode: match[2], tables: new Set(match[1].split(",").map((name) => name.trim())) };
}

const withoutComments = (sql) => sql.replace(/--.*$/gm, "");

test("A34: the index migration locks every table it indexes first, without waiting, and nothing else", () => {
  const sql = withoutComments(source(indexFile));
  const { mode, tables } = lockedTables(sql);
  assert.equal(mode, "share");
  const indexed = [...sql.matchAll(/create index if not exists \w+\s+on (\w+\.\w+) \(/g)].map((match) => match[1]);
  assert.equal(indexed.length, 47);
  assert.deepEqual([...tables].sort(), [...new Set(indexed)].sort());
  assert.match(sql, /set lock_timeout = '10s';[\s\S]*reset lock_timeout;\s*$/);
  assert.doesNotMatch(sql, /concurrently/i, "a migration runs in a transaction, where concurrently can't");
});

test("A34: the policy migration locks every table it changes or reads first, and wraps both calls in each policy", () => {
  const sql = withoutComments(source(policyFile));
  const { mode, tables } = lockedTables(sql);
  assert.equal(mode, "access exclusive");
  const statements = sql.split(/;\s*\n/).filter((statement) => /^\s*alter policy/.test(statement));
  assert.equal(statements.length, 60);
  const changed = new Set(statements.map((statement) => statement.match(/^\s*alter policy "[^"]+" on (\w+\.\w+)/)[1]));
  // Parsing a policy that reads another table locks that one too, so it must be in the first statement as well.
  const read = new Set(statements.flatMap((statement) => [...statement.matchAll(/\b(?:from|join) \(?(\w+\.\w+)/g)].map((match) => match[1])));
  assert.deepEqual([...tables].sort(), [...new Set([...changed, ...read])].sort());
  for (const statement of statements) {
    const bare = statement.replace(/\(select auth\.uid\(\)\)|\(select public\.is_admin\(\)\)/g, "");
    assert.doesNotMatch(bare, /auth\.uid\(\)|is_admin\(\)/, statement.split("\n")[0]);
  }
  assert.match(sql, /set lock_timeout = '10s';[\s\S]*reset lock_timeout;\s*$/);
});

test("A34: both migrations come after the analytics one, the indexes first, and before features/marketplace's", () => {
  const files = fs.readdirSync(path.join(root, "supabase/migrations")).sort();
  const indexAt = files.indexOf(path.basename(indexFile));
  const policyAt = files.indexOf(path.basename(policyFile));
  assert.ok(indexAt > 0 && policyAt === indexAt + 1, "the policies follow the indexes");
  assert.ok(path.basename(indexFile) > "20261114180000" && path.basename(policyFile) < "20261201");
});
