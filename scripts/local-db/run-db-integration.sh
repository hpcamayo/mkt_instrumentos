#!/usr/bin/env bash
# Runs every database integration test against the database setup-local-db.sh built. Each tests/*.integration.cjs is
# either a database test, whose usage line reads `// Usage: node tests/<its own name> [postgresql://...]`, or one of the
# tests left out below. Any other file, a listed one that is gone, or no database test at all fails the run, so a test
# can't drop out of CI unnoticed; so does a test that prints SKIP, since everything these tests need is here.
# tests/api-safeupdate.integration.cjs needs the pg_safeupdate stand-in built once first (safeupdate/build.sh).
# Usage: run-db-integration.sh [repo-dir]
set -euo pipefail

REPO="$(cd "${1:-$PWD}" && pwd)"
URL="postgresql://postgres@127.0.0.1:${LARIA_PGPORT:-54322}/postgres"

# Left out because they need the running app and the Supabase API (docs/operations/ci.md).
APP_TESTS=(alerts analytics favorites listing-lifecycle photos sprint-3-1 sprint-8-admin-reports submissions
  transactions)
# Left out because `setup-local-db.sh test` runs it.
RUN_ELSEWHERE=(store-ops-concurrency)

left_out() {
  case " ${APP_TESTS[*]} ${RUN_ELSEWHERE[*]} " in *" $1 "*) return 0 ;; esac
  return 1
}
database_test() {
  grep -qs "^// Usage: node tests/$1\.integration\.cjs \[postgresql://" "$REPO/tests/$1.integration.cjs"
}

problems=()
for name in "${APP_TESTS[@]}" "${RUN_ELSEWHERE[@]}"; do
  if [ ! -f "$REPO/tests/$name.integration.cjs" ]; then
    problems+=("tests/$name.integration.cjs is left out here, but there is no such file")
  fi
done
for name in "${APP_TESTS[@]}"; do
  if database_test "$name"; then
    problems+=("tests/$name.integration.cjs takes a postgresql:// URL, but is left out here as an app test")
  fi
done
selected=()
for t in "$REPO"/tests/*.integration.cjs; do
  [ -f "$t" ] || continue
  name="$(basename "$t" .integration.cjs)"
  if left_out "$name"; then continue; fi
  if database_test "$name"; then
    selected+=("$t")
  else
    problems+=("tests/$name.integration.cjs has no usage line taking a postgresql:// URL and isn't left out here")
  fi
done
if [ "${#selected[@]}" -eq 0 ]; then
  problems+=("no database integration test in $REPO/tests")
fi
# tests/api-safeupdate.integration.cjs runs the page refresh job with pg_safeupdate's check on, or prints SKIP when
# neither safeupdate nor the stand-in loads.
runs() { psql -X -q "$URL" -c "$1" > /dev/null 2>&1; }
if ! runs "select 1"; then
  problems+=("no database at $URL: run setup-local-db.sh setup, or start after a restart")
elif ! runs "load 'laria_safeupdate'" && ! runs "load 'safeupdate'"; then
  problems+=("neither safeupdate nor laria_safeupdate loads: build the stand-in with safeupdate/build.sh")
fi
if [ "${#problems[@]}" -gt 0 ]; then
  printf 'FAIL %s\n' "${problems[@]}"
  exit 1
fi

failed=0
ran=0
output="$(mktemp)"
trap 'rm -f "$output"' EXIT
for t in "${selected[@]}"; do
  name="$(basename "$t")"
  echo "== tests/$name"
  if (cd "$REPO" && node "$t" "$URL") 2>&1 | tee "$output"; then
    if grep -q "^SKIP" "$output"; then
      echo "FAIL tests/$name skipped a check (above)"
      failed=1
    else
      ran=$((ran + 1))
    fi
  else
    echo "FAIL tests/$name"
    failed=1
  fi
done
echo "$ran of ${#selected[@]} database integration tests passed"
exit $failed
