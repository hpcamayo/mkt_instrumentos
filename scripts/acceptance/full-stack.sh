#!/usr/bin/env bash
# Launch audit A14: the release-gate cases of acceptance/cases.tsv end to end, on a full local Supabase (Postgres 17,
# Auth, PostgREST, Storage) and the production build of the app on http://localhost:3100, with throwaway accounts only.
# Nothing here reads hosted Supabase or production. CI runs it (.github/workflows/acceptance.yml); elsewhere it needs
# Docker and the Supabase CLI, and a clean worktree: it writes supabase/config.toml and .env.local, so it refuses a
# folder that already has either. docs/acceptance/full-stack.md explains it.
# Usage: scripts/acceptance/full-stack.sh [results-dir]
set -euo pipefail
cd "$(dirname "$0")/../.."
REPO="$PWD"
mkdir -p "${1:-acceptance-results}"
RESULTS="$(cd "${1:-acceptance-results}" && pwd)"
BASE=http://localhost:3100
DB_CONTAINER=supabase_db_mkt_instrumentos

for file in supabase/config.toml .env.local; do
  if [ -e "$file" ]; then
    echo "$file exists: run this from a clean worktree, so your own setup is never replaced." >&2
    exit 1
  fi
done

APP_PID=""
cleanup() {
  if [ -n "$APP_PID" ]; then kill "$APP_PID" 2>/dev/null || true; fi
  # On a developer's machine, leave nothing behind; a CI runner is discarded anyway.
  if [ -z "${CI:-}" ]; then
    supabase stop --no-backup >/dev/null 2>&1 || true
    rm -f "$REPO/supabase/config.toml" "$REPO/.env.local"
  fi
}
trap cleanup EXIT

cp scripts/acceptance/supabase-config.toml supabase/config.toml
# The CLI pulls its images in parallel, and a registry sometimes refuses them (toomanyrequests, or public.ecr.aws's data
# limit for the address), on some runs every try. The same images are on Docker Hub, ghcr.io and public.ecr.aws, so
# each try takes them from the next of these in turn, starting with the one SUPABASE_INTERNAL_IMAGE_REGISTRY names (the
# CLI's own default is public.ecr.aws). Each try starts from an empty database.
registries=()
for registry in "${SUPABASE_INTERNAL_IMAGE_REGISTRY:-public.ecr.aws}" docker.io ghcr.io public.ecr.aws; do
  case " ${registries[*]} " in *" $registry "*) ;; *) registries+=("$registry") ;; esac
done
tries=6
started=""
for attempt in $(seq 1 "$tries"); do
  registry="${registries[(attempt - 1) % ${#registries[@]}]}"
  export SUPABASE_INTERNAL_IMAGE_REGISTRY="$registry"
  echo "== Starting Supabase from $registry, try $attempt of $tries (every migration, then supabase/seed.sql)"
  if supabase start 2>&1 | tee -a "$RESULTS/supabase-start.log"; then
    started=1
    break
  fi
  supabase stop --no-backup >/dev/null 2>&1 || true
  if [ "$attempt" -lt "$tries" ]; then
    echo "Supabase did not start from $registry; trying again in $((attempt * 20)) seconds." >&2
    sleep $((attempt * 20))
  fi
done
[ -n "$started" ] || { echo "Supabase did not start from any registry." >&2; exit 1; }

# The local stack's keys are the CLI's fixed development keys; the cron secret is new on every run.
CRON_SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(24).toString("hex"))')"
supabase status -o json 2>/dev/null | CRON_SECRET="$CRON_SECRET" BASE="$BASE" node -e '
  const status = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  for (const key of ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY"]) if (!status[key]) throw new Error(`supabase status has no ${key}`);
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.BASE,
    MARKETPLACE_EMAIL_PROVIDER: "log",
    MARKETPLACE_EMAIL_FROM: "Laria <notificaciones@laria.test>",
    MARKETPLACE_EMAIL_BASE_URL: process.env.BASE,
    CRON_SECRET: process.env.CRON_SECRET,
  };
  require("node:fs").writeFileSync(".env.local", Object.entries(env).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
'

echo "== Building the app"
pnpm build > "$RESULTS/build.log" 2>&1 || { tail -40 "$RESULTS/build.log"; exit 1; }
pnpm start -p 3100 > "$RESULTS/app.log" 2>&1 &
APP_PID=$!
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "$BASE/terminos"; then break; fi
  sleep 1
done
curl -fsS -o /dev/null "$BASE/terminos" || { echo "The app did not start." >&2; tail -40 "$RESULTS/app.log"; exit 1; }

# Each test signs in several accounts from this one address; the app's per-visitor limits (launch audit A16) start
# from zero for each test file, as they would for different visitors.
reset_limits() {
  docker exec "$DB_CONTAINER" psql -U postgres -d postgres -qc "truncate laria_private.rate_limit_hits" >/dev/null
}

# acceptance-release-gate and public-pages print one "PASS <case id>" line per release-gate case, and "NOTE <case id>"
# where only the owner can settle the case; the older suites prove the flows they were written for
# (docs/acceptance/full-stack.md maps them to cases). Checks that read laria_private go through the database container.
export ACCEPTANCE_DB_CONTAINER="$DB_CONTAINER"
TESTS=(
  "tests/acceptance-release-gate.integration.cjs"
  "scripts/acceptance/public-pages.cjs"
  "tests/submissions.integration.cjs"
  "tests/listing-lifecycle.integration.cjs"
  "tests/sprint-3-1.integration.cjs"
  "tests/photos.integration.cjs"
  "tests/analytics.integration.cjs"
  "tests/favorites.integration.cjs"
  "tests/alerts.integration.cjs"
  "tests/transactions.integration.cjs"
  "tests/sprint-8-admin-reports.integration.cjs"
)
failed=()
: > "$RESULTS/summary.txt"
for test in "${TESTS[@]}"; do
  name="$(basename "$test" .cjs)"
  echo "== $test"
  reset_limits
  if node --require ./tests/setup-alias.cjs "$test" "$BASE" 2>&1 | tee "$RESULTS/$name.log"; then
    echo "PASS $test" >> "$RESULTS/summary.txt"
  else
    echo "FAIL $test" >> "$RESULTS/summary.txt"
    failed+=("$test")
  fi
done

grep -hoE "^PASS [A-Z]+-[0-9]+[^ ]* .*" "$RESULTS"/*.log | sort -u > "$RESULTS/cases.txt" || true
grep -hoE "^NOTE [A-Z]+-[0-9]+[^ ]* .*" "$RESULTS"/*.log | sort -u > "$RESULTS/notes.txt" || true
echo "== Summary"
cat "$RESULTS/summary.txt"
echo "$(wc -l < "$RESULTS/cases.txt") release-gate checks passed (cases.txt)"
cat "$RESULTS/notes.txt"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Acceptance run"; echo; sed 's/^/- /' "$RESULTS/summary.txt"; echo
    echo "Release-gate checks passed:"; echo; sed 's/^/- /' "$RESULTS/cases.txt"; echo
    echo "For the owner:"; echo; sed 's/^/- /' "$RESULTS/notes.txt"
  } >> "$GITHUB_STEP_SUMMARY"
fi
if [ "${#failed[@]}" -gt 0 ]; then
  echo "Failed: ${failed[*]}" >&2
  exit 1
fi
