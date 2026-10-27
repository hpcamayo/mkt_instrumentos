#!/usr/bin/env bash
# Runs every database-only integration test against the database setup-local-db.sh built: each tests/*.integration.cjs
# whose usage line takes a postgresql:// URL. The ones that need the running app or the Supabase API are left out, and
# so is the store concurrency suite, which `setup-local-db.sh test` already runs. tests/api-safeupdate.integration.cjs
# needs the pg_safeupdate stand-in built once first (safeupdate/build.sh).
# Usage: run-db-integration.sh [repo-dir]
set -euo pipefail

REPO="$(cd "${1:-$PWD}" && pwd)"
URL="postgresql://postgres@127.0.0.1:${LARIA_PGPORT:-54322}/postgres"
failed=0
ran=0
for t in "$REPO"/tests/*.integration.cjs; do
  name="$(basename "$t")"
  grep -q "^// Usage: node tests/$name \[postgresql://" "$t" || continue
  [ "$name" = store-ops-concurrency.integration.cjs ] && continue
  echo "== tests/$name"
  if (cd "$REPO" && node "$t" "$URL"); then ran=$((ran + 1)); else echo "FAIL tests/$name"; failed=1; fi
done
echo "$ran database integration tests passed"
exit $failed
