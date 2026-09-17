// Explicit local-only runner. Never pulls or mutates hosted environment settings.
const { spawnSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const status = spawnSync("supabase", ["status", "-o", "json"], { encoding: "utf8" });
if (status.status !== 0) throw new Error("Local Supabase must be running.");
const local = JSON.parse(status.stdout);
if (new URL(local.API_URL).hostname !== "127.0.0.1") throw new Error("Local Supabase URL required.");
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY };
if (args[0] === "sql") {
  for (const filename of args.slice(1)) {
    if (path.dirname(filename) !== "tests" || !filename.endsWith(".sql")) throw new Error("Explicit tests/*.sql paths required.");
    const result = spawnSync("docker", ["exec", "-i", "supabase_db_mkt_instrumentos", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: fs.readFileSync(filename), encoding: "utf8" });
    console.log(filename, result.status === 0 ? "PASS" : "FAIL");
    if (result.status !== 0) { console.error(result.stderr, result.stdout); process.exit(1); }
  }
} else {
  if (!["npm", "node"].includes(args[0])) throw new Error("Only local npm/node test commands supported.");
  const child = spawn(args[0], args.slice(1), { env, stdio: "inherit" });
  child.on("exit", (code) => { process.exitCode = code ?? 1; });
}
