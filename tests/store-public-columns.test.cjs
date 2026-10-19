const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Store columns the public API key cannot read (supabase/migrations/20261022130000_store_public_columns.sql).
// A select or embed that names one of them fails for visitors and signed-in users alike.
const PRIVATE_STORE_COLUMNS = ["ruc", "razon_social", "email", "contact_person", "contact_name", "address", "rejection_reason", "listing_plan"];

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}

function usesAdminClient(code) {
  return /getSupabaseAdminClient/.test(code);
}

test("store reads through the public API never name a private store column", () => {
  const offenders = [];
  for (const file of ["app", "lib", "components"].flatMap(files)) {
    const code = fs.readFileSync(file, "utf8");
    if (usesAdminClient(code)) continue;
    // .from("stores").select("..."), up to the first closing parenthesis of the select.
    for (const match of code.matchAll(/\.from\("stores"\)\s*\.select\(\s*([`"'])([\s\S]*?)\1/g)) {
      const named = PRIVATE_STORE_COLUMNS.filter((column) => new RegExp(`\\b${column}\\b`).test(match[2]));
      if (named.length) offenders.push(`${file}: ${named.join(", ")}`);
    }
    // Embeds such as stores ( name, slug ) or stores!inner ( ... ) inside a listings select.
    for (const match of code.matchAll(/\bstores(?:!inner)?\s*\(([^()]*)\)/g)) {
      const named = PRIVATE_STORE_COLUMNS.filter((column) => new RegExp(`\\b${column}\\b`).test(match[1]));
      if (named.length) offenders.push(`${file}: ${named.join(", ")}`);
    }
  }
  assert.deepEqual(offenders, [], "Use get_own_store() or admin_get_store() for private store fields");
});

test("the owner's account context reads private store fields through get_own_store", () => {
  const context = fs.readFileSync("lib/account-context.ts", "utf8");
  assert.match(context, /\.rpc\("get_own_store"\)\s*\.select\(/);
  assert.doesNotMatch(context, /\.from\("stores"\)/);
});

test("the migration grants the public only the columns public pages use", () => {
  const sql = fs.readFileSync("supabase/migrations/20261022130000_store_public_columns.sql", "utf8");
  assert.match(sql, /revoke select on public\.stores from anon, authenticated;/);
  const grant = sql.match(/grant select \(([^)]*)\) on public\.stores to anon, authenticated;/);
  assert.ok(grant, "column grant for anon and authenticated");
  const granted = grant[1].split(",").map((column) => column.trim());
  for (const column of PRIVATE_STORE_COLUMNS.concat("owner_user_id")) assert.ok(!granted.includes(column), `${column} must stay private`);
  assert.match(sql, /grant select \(owner_user_id\) on public\.stores to authenticated;/);
  assert.match(sql, /function public\.admin_get_store[\s\S]*if not public\.is_admin\(\) then/);
  assert.match(sql, /revoke all on function public\.get_own_store\(\) from public, anon;/);
});
