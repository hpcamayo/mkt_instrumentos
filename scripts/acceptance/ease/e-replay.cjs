// EASE-764: every migration over one database connection, as the Supabase CLI applies them (each in its own
// transaction, one after the other, in one session), on a scratch cluster of its own. It never touches the local stack's
// cluster: a separate data directory and port, the same Postgres 16 + pg_cron settings as scripts/local-db, and the
// cluster is stopped and deleted at the end. The repository's own replay (setup-local-db.sh) opens a session per file.
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const REPO = path.join(__dirname, "..", "..", "..");
const PGBIN = "/usr/lib/postgresql/16/bin";
const PORT = Number(process.env.E_REPLAY_PORT || 54391);
const DATA = process.env.E_REPLAY_DATA || "/var/lib/postgresql/ease-e-replay";

const sh = (command, options = {}) => execFileSync("bash", ["-c", command], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, ...options });
const ready = () => {
  try {
    sh(`${PGBIN}/pg_isready -q -h 127.0.0.1 -p ${PORT}`);
    return true;
  } catch {
    return false;
  }
};

function stop() {
  if (fs.existsSync(path.join(DATA, "PG_VERSION")) && ready()) sh(`su postgres -c "${PGBIN}/pg_ctl -D '${DATA}' -m fast -w stop"`);
}

async function run() {
  const result = { ok: false, migrations: 0, applied: 0, leftovers: [], cleaned: false, error: null, log: "" };
  if (PORT === 54322 || !DATA.includes("ease-e-replay")) throw new Error("the replay only runs on its own scratch cluster");
  const migrations = fs.readdirSync(path.join(REPO, "supabase", "migrations")).filter((name) => name.endsWith(".sql")).sort();
  result.migrations = migrations.length;
  const script = path.join(os.tmpdir(), `ease-e-replay-${process.pid}.sql`);
  try {
    if (ready()) throw new Error(`something already listens on ${PORT}`);
    if (fs.existsSync(DATA)) {
      if (!fs.existsSync(path.join(DATA, "PG_VERSION"))) throw new Error(`${DATA} exists and is not a cluster`);
      stop();
      fs.rmSync(DATA, { recursive: true, force: true });
    }
    fs.mkdirSync(DATA, { recursive: true });
    sh(`chown postgres:postgres '${DATA}' && mkdir -p /var/run/postgresql && chown postgres:postgres /var/run/postgresql`);
    sh(`su postgres -c "${PGBIN}/initdb -D '${DATA}' -U postgres --auth=trust -E UTF8 --locale=C.UTF-8"`);
    fs.appendFileSync(path.join(DATA, "postgresql.conf"), [
      `port = ${PORT}`, "listen_addresses = '127.0.0.1'", "unix_socket_directories = '/var/run/postgresql'",
      "shared_preload_libraries = 'pg_cron'", "cron.database_name = 'postgres'", "max_connections = 50",
      "fsync = off", "synchronous_commit = off", "full_page_writes = off", "",
    ].join("\n"));
    sh(`su postgres -c "${PGBIN}/pg_ctl -D '${DATA}' -l '${DATA}/server.log' -w start"`);
    // One psql session: the shim, then each migration in its own transaction, then what the session still holds.
    const lines = ["\\set ON_ERROR_STOP 1", `\\i '${path.join(REPO, "scripts", "local-db", "supabase-shim.sql")}'`];
    for (const name of migrations) lines.push("begin;", `\\i '${path.join(REPO, "supabase", "migrations", name)}'`, "commit;", `\\echo EASE-APPLIED ${name}`);
    lines.push("\\echo EASE-SESSION-END",
      "select 'EASE-LEFTOVER function ' || proname from pg_proc where pronamespace = pg_my_temp_schema()" +
      " union all select 'EASE-LEFTOVER relation ' || relname from pg_class where relnamespace = pg_my_temp_schema();",
      "select 'EASE-BACKENDS ' || count(*) from pg_stat_activity where backend_type = 'client backend' and datname = current_database();");
    fs.writeFileSync(script, `${lines.join("\n")}\n`);
    let out = "";
    try {
      out = sh(`PGOPTIONS='-c client_min_messages=warning' psql -h 127.0.0.1 -p ${PORT} -U postgres -X -q -At -f '${script}' 2>&1`);
    } catch (error) {
      out = `${error.stdout || ""}${error.stderr || ""}`;
      result.error = (out.split("\n").find((line) => /ERROR/.test(line)) || error.message).slice(0, 400);
    }
    result.applied = (out.match(/^EASE-APPLIED /gm) || []).length;
    result.leftovers = (out.match(/^EASE-LEFTOVER .+$/gm) || []).map((line) => line.replace("EASE-LEFTOVER ", ""));
    const failedAfter = result.applied < migrations.length ? migrations[result.applied] : null;
    if (failedAfter) result.error = `${result.error || "stopped"} (at ${failedAfter})`;
    result.ok = !result.error && result.applied === migrations.length && /EASE-SESSION-END/.test(out);
    result.log = out.split("\n").filter((line) => !/^EASE-APPLIED /.test(line)).join("\n").trim().slice(-3000) +
      `\napplied ${result.applied} of ${migrations.length} migrations in one session on 127.0.0.1:${PORT}`;
  } catch (error) {
    result.error = String(error.stderr || error.message).slice(0, 400);
  } finally {
    try {
      stop();
      fs.rmSync(DATA, { recursive: true, force: true });
      fs.rmSync(script, { force: true });
      result.cleaned = !fs.existsSync(DATA) && !ready();
    } catch (error) {
      result.error = result.error || `cleanup: ${error.message}`;
    }
  }
  return result;
}

module.exports = { run, PORT, DATA };

if (require.main === module) {
  run().then((result) => {
    console.log(JSON.stringify({ ...result, log: undefined }, null, 2));
    console.log(result.log);
    process.exit(result.ok ? 0 : 1);
  });
}
