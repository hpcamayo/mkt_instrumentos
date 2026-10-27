# Continuous integration

Launch audit A30. `.github/workflows/ci.yml` runs on every pull request, on every push to `main` and by hand
(Actions > CI > Run workflow). It reads no secret and never reaches hosted Supabase or Vercel.

| Job | What it runs |
| --- | --- |
| Tests, types, lint and build | `pnpm test` (every `tests/*.test.cjs`), `pnpm typecheck`, `pnpm lint`, `pnpm build` |
| Migrations, SQL suites and database integration tests | a clean Postgres 16 with pg_cron and the Supabase shim (`scripts/local-db`), every migration in order, every `tests/*.sql` suite, the store concurrency suite, then every database `tests/*.integration.cjs` with the pg_safeupdate stand-in built |

Both run on Ubuntu 24.04 with Node 22 and pnpm 10.28 (`pnpm install --frozen-lockfile`, so a lockfile out of step with
`package.json` fails the run). Together they take about five minutes.

## Which integration tests run

`scripts/local-db/run-db-integration.sh` runs each `tests/*.integration.cjs` whose usage line reads
`// Usage: node tests/<its own name> [postgresql://...]`, so a new database test runs with no other change. The ones it
leaves out are listed in the script, each with why: those that need the running app and the Supabase API, which the
Acceptance workflow runs (below), and the store concurrency suite, which the step before runs. The step fails, before
running anything, on a file that is neither, on a listed file that is gone, on an app test whose usage line turns to a
`postgresql://` URL, when it finds no database test at all, or when neither safeupdate nor the stand-in loads. It also
fails a test that prints a line starting with `SKIP`: a test may skip a check where something it needs is missing, but
here nothing is.

## The Acceptance workflow

`.github/workflows/acceptance.yml` runs on the same events: it starts a full local Supabase (Postgres 17, Auth,
PostgREST, Storage), builds and starts the app, and runs the integration tests that need both
(`acceptance-release-gate`, `submissions`, `listing-lifecycle`, `sprint-3-1`, `photos`, `analytics`, `favorites`,
`alerts`, `transactions`, `sprint-8-admin-reports`) and the public pages check. It reads no repository secret either.
`docs/acceptance/full-stack.md` has the details.

## What it doesn't cover

- Browser checks still run by hand against a local stack (`scripts/prototype/README.md`).
- Time limits. Supabase cancels an API request that runs longer than its role's limit (by default 3 s for `anon` and
  8 s for `authenticated`, which PostgREST applies to each request). The shim sets none, and the tests connect directly,
  so a query too slow for the API still passes here. Query speed has its own checks (`tests/catalog-performance.sql`,
  `tests/marketplace-performance.sql`, `docs/performance.md`).
- A merge to `main` deploys to production through Vercel whether or not CI passed. Making the checks required
  (GitHub > Settings > Branches > `main` > Require status checks: CI's two jobs above and Acceptance's
  `Release-gate cases on a full local stack`) is what stops a red pull request from being merged.
- Migrations reach production only through `supabase db push`, never through CI.

## When a run fails

Open the run from the pull request's checks. The database job prints `FAIL tests/<suite>.sql` with the first lines of
the error, the failing integration test's assertion, or what it couldn't place among the integration tests. Reproduce it
locally with the commands in `scripts/local-db/README.md`.

## Actions

Each action is pinned to a commit, the one its `v5` tag pointed to on 27 Oct 2026, so a moved tag can't change what
runs: `actions/checkout` `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09` and `actions/setup-node`
`a0853c24544627f65ddf259abe73b1d18a591444`. The checkout keeps no credentials (`persist-credentials: false`); nothing
in the jobs pushes. To update one, take the new version's commit from its release page, check the diff, and change
both jobs together.
