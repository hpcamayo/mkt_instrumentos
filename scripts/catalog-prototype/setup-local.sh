#!/usr/bin/env bash
# Local-only: a plain Postgres database with the 24 catalog migrations (the pg_cron schedule is skipped) and the
# hand-written fixture rows, for scripts/catalog-prototype/benchmark.cjs --source=local. Refuses non-local hosts.
set -euo pipefail
DB="${CATALOG_PROTO_DB:-catalog_proto}"
if [[ -n "${PGHOST:-}" && "$PGHOST" != "localhost" && "$PGHOST" != "127.0.0.1" && "$PGHOST" != /* ]]; then
  echo "PGHOST must be local" >&2; exit 1
fi
cd "$(dirname "$0")/../.."
dropdb --if-exists "$DB"
createdb "$DB"
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f scripts/catalog-prototype/local-stubs.sql
for file in supabase/migrations/202609271*_canonical_catalog.sql supabase/migrations/2026092[89]*.sql supabase/migrations/2026093*.sql supabase/migrations/20261*.sql; do
  [[ "$file" == *prune_schedule* ]] && continue
  psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$file" > /dev/null
done
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f scripts/catalog-prototype/local-fixture.sql
# Stock Postgres JIT-compiles the lookup plans (about 5 s per catalog_match call on 7 rows); the prototype turns it off.
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -c "alter database \"$DB\" set jit = off"
echo "catalog prototype database '$DB' ready"
