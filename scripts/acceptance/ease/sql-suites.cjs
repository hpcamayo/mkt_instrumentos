"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

// The SQL-only companion to the real local Supabase/browser run. Its Auth and Storage tables are stand-ins;
// PostgreSQL executes the migrations, functions and RLS. It never reads a hosted project's settings.
if (process.env.LIVE === "1") throw new Error("SQL suites only run locally");
const repo = path.resolve(__dirname, "../../..");
const output = process.argv[2] || "/tmp/laria-ease-sql.json";
const container = `laria-ease-sql-${process.pid}`;
const image = process.env.E_REPLAY_IMAGE || "public.ecr.aws/supabase/postgres:17.6.1.106";
const migrations = fs.readdirSync(path.join(repo, "supabase/migrations")).filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
const suites = fs.readdirSync(path.join(repo, "tests")).filter((name) => /^(ux-|maybes-).*\.sql$/.test(name)).sort();
const sql = ["\\set ON_ERROR_STOP 1", "\\i /workspace/scripts/local-db/supabase-shim.sql"];
for (const name of migrations) {
  sql.push("begin;");
  if (name === "20261103120000_ux_phone_normalization.sql") {
    sql.push(`insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
      ('e2010000-0000-4000-8000-000000000001','authenticated','authenticated','ease-backfill@example.invalid','{}',
       '{"account_type":"seller","full_name":"Legacy phone","phone":"987654321","city":"Lima","region":"Lima"}'),
      ('e2010000-0000-4000-8000-000000000002','authenticated','authenticated','ease-foreign@example.invalid','{}',
       '{"account_type":"seller","full_name":"Foreign phone","phone":"14155550100","city":"Lima","region":"Lima"}'),
      ('e2010000-0000-4000-8000-000000000003','authenticated','authenticated','ease-correct@example.invalid','{}',
       '{"account_type":"seller","full_name":"Correct phone","phone":"51912345678","city":"Lima","region":"Lima"}');`);
  }
  sql.push(`\\i /workspace/supabase/migrations/${name}`);
  if (name === "20261103120000_ux_phone_normalization.sql") {
    sql.push(`do $$ begin
      if (select phone from public.profiles where id='e2010000-0000-4000-8000-000000000001') <> '51987654321'
        or (select phone from public.profiles where id='e2010000-0000-4000-8000-000000000002') <> '14155550100'
        or (select phone from public.profiles where id='e2010000-0000-4000-8000-000000000003') <> '51912345678'
      then raise exception 'EASE-201 backfill failed'; end if;
    end $$;`, "\\echo BACKFILL PASS EASE-201");
  }
  sql.push("commit;");
}
const script = ["set -e", "initdb -D /tmp/ease-sql -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null",
  "pg_ctl -D /tmp/ease-sql -l /tmp/pg.log -o '-c shared_preload_libraries=pg_cron -c cron.database_name=postgres -c cron.launch_active_jobs=off' -w start >/dev/null",
  "psql -h 127.0.0.1 -U postgres -d postgres -X -q -At > /tmp/migrations.log 2>&1 <<'MIGRATIONS'", ...sql, "MIGRATIONS",
  "grep 'BACKFILL PASS' /tmp/migrations.log"];
for (const name of suites) {
  script.push(`if psql -h 127.0.0.1 -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 -f /workspace/tests/${name} > /tmp/suite.log 2>&1; then echo 'SUITE PASS ${name}'; else echo 'SUITE FAIL ${name}'; tail -10 /tmp/suite.log; fi`);
}
try {
  const log = execFileSync("docker", ["run", "--rm", "--name", container, "--user", "postgres", "-i", "-v", `${repo}:/workspace:ro`,
    "--entrypoint", "bash", image, "-s"], { input: script.join("\n"), encoding: "utf8", maxBuffer: 64 << 20, timeout: 600_000 });
  process.stdout.write(log);
  const report = { image, migrations: migrations.length, phoneBackfill: log.includes("BACKFILL PASS EASE-201"), suites: suites.map((name) => ({
    file: `tests/${name}`, status: log.includes(`SUITE PASS ${name}`) ? "Pass" : "Fail",
    sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(repo, "tests", name))).digest("hex"),
  })) };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  if (!report.phoneBackfill || report.suites.some((suite) => suite.status !== "Pass")) process.exitCode = 1;
} catch (error) {
  console.error(`${error.stdout || ""}${error.stderr || ""}`.slice(-3000));
  process.exitCode = 1;
} finally {
  try { execFileSync("docker", ["rm", "-f", container], { stdio: "ignore" }); } catch {}
}
