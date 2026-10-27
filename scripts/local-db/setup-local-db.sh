#!/usr/bin/env bash
# Local Postgres 16 + pg_cron + a small Supabase shim for running Laria's SQL tests without Docker: in a cloud session,
# and in CI (.github/workflows/ci.yml). Local only: it never reads hosted Supabase settings or connects anywhere but
# 127.0.0.1. scripts/local-db/README.md explains it.
#
# Usage: setup-local-db.sh [setup|start|stop|reset|test] [repo-dir]
#   setup  install packages if missing, create the cluster if missing, start it, load shim + migrations (default)
#   start  start an existing cluster (a new container has to do this after it wakes)
#   stop   stop the cluster
#   reset  delete the cluster and rebuild it from the shim and every migration (a clean replay)
#   test   run every tests/*.sql suite, then the store-ops concurrency suite if present
# repo-dir defaults to the current directory. LARIA_PGDATA and LARIA_PGPORT override the data dir and port.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMD="${1:-setup}"
REPO="$(cd "${2:-$PWD}" && pwd)"
PGBIN=/usr/lib/postgresql/16/bin
DATA="${LARIA_PGDATA:-/var/lib/postgresql/laria}"
PORT="${LARIA_PGPORT:-54322}"
export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)

[ "$(id -u)" = 0 ] || { echo "Run as root (the cloud container default)." >&2; exit 1; }

install_packages() {
  if [ -x "$PGBIN/postgres" ] && [ -f /usr/share/postgresql/16/extension/pg_cron.control ]; then return; fi
  echo "Installing postgresql-16 and postgresql-16-cron"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-16 postgresql-16-cron >/dev/null
}

running() { "$PGBIN/pg_isready" -q -h 127.0.0.1 -p "$PORT"; }

start_server() {
  mkdir -p /var/run/postgresql && chown postgres:postgres /var/run/postgresql
  running && return
  su postgres -c "$PGBIN/pg_ctl -D '$DATA' -l '$DATA/server.log' -w start" >/dev/null
  echo "Postgres running on 127.0.0.1:$PORT (data in $DATA)"
}

stop_server() {
  [ -f "$DATA/PG_VERSION" ] && running && su postgres -c "$PGBIN/pg_ctl -D '$DATA' -w stop" >/dev/null
  return 0
}

init_cluster() {
  mkdir -p "$DATA" && chown postgres:postgres "$DATA"
  su postgres -c "$PGBIN/initdb -D '$DATA' -U postgres --auth=trust -E UTF8 --locale=C.UTF-8" >/dev/null
  # fsync and friends are off for speed: this cluster holds nothing worth keeping.
  cat >> "$DATA/postgresql.conf" <<EOF
port = $PORT
listen_addresses = '127.0.0.1'
unix_socket_directories = '/var/run/postgresql'
shared_preload_libraries = 'pg_cron'
cron.database_name = 'postgres'
max_connections = 200
fsync = off
synchronous_commit = off
full_page_writes = off
EOF
}

load_schema() {
  [ -d "$REPO/supabase/migrations" ] || { echo "No supabase/migrations in $REPO" >&2; exit 1; }
  "${PSQL[@]}" -f "$HERE/supabase-shim.sql" >/dev/null
  local n=0
  for m in "$REPO"/supabase/migrations/*.sql; do
    # Each migration in one transaction, like supabase db reset.
    "${PSQL[@]}" -1 -f "$m" >/dev/null || { echo "Migration failed: $m" >&2; exit 1; }
    n=$((n + 1))
  done
  echo "Applied the shim and $n migrations from $REPO/supabase/migrations"
}

setup() {
  install_packages
  if [ -f "$DATA/PG_VERSION" ]; then
    start_server
    echo "Cluster already exists; run '$0 reset' to rebuild it from the current migrations."
    return
  fi
  init_cluster
  start_server
  load_schema
}

run_tests() {
  running || { echo "Postgres is not running; run '$0 start' first." >&2; exit 1; }
  local failed=0
  for t in "$REPO"/tests/*.sql; do
    if "${PSQL[@]}" -o /dev/null -f "$t" >/dev/null 2>"$DATA/last-test-error.txt"; then
      echo "PASS ${t#$REPO/}"
    else
      echo "FAIL ${t#$REPO/}"; sed 's/^/    /' "$DATA/last-test-error.txt" | head -5; failed=1
    fi
  done
  local race="$REPO/tests/store-ops-concurrency.integration.cjs"
  if [ -f "$race" ]; then
    if [ -d "$REPO/node_modules/pg" ]; then
      (cd "$REPO" && node "$race" "postgresql://postgres@127.0.0.1:$PORT/postgres") || failed=1
    else
      echo "SKIP concurrency suite: install dependencies first (pnpm install) so node_modules/pg exists"
    fi
  fi
  return $failed
}

case "$CMD" in
  setup) setup ;;
  start) start_server ;;
  stop) stop_server ;;
  reset)
    install_packages
    stop_server
    if [ -e "$DATA" ] && [ ! -f "$DATA/PG_VERSION" ]; then echo "$DATA exists but is not a Postgres cluster; not deleting it." >&2; exit 1; fi
    rm -rf "$DATA"
    init_cluster
    start_server
    load_schema
    ;;
  test) run_tests ;;
  *) echo "Usage: $0 [setup|start|stop|reset|test] [repo-dir]" >&2; exit 2 ;;
esac
