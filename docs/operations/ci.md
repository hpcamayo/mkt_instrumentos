# Continuous integration

Launch audit A30. `.github/workflows/ci.yml` runs on every pull request, on every push to `main` and by hand
(Actions > CI > Run workflow). It reads no secret and never reaches hosted Supabase or Vercel.

| Job | What it runs |
| --- | --- |
| Tests, types, lint and build | `pnpm test` (every `tests/*.test.cjs`), `pnpm typecheck`, `pnpm lint`, `pnpm build` |
| Migrations, SQL suites and database integration tests | a clean Postgres 16 with pg_cron and the Supabase shim (`scripts/local-db`), every migration in order, every `tests/*.sql` suite, the store concurrency suite, then every database-only `tests/*.integration.cjs` with the pg_safeupdate stand-in built |

Both run on Ubuntu 24.04 with Node 22 and pnpm 10.28 (`pnpm install --frozen-lockfile`, so a lockfile out of step with
`package.json` fails the run). Together they take about five minutes.

## What it doesn't cover

- The integration tests that need the running app or the Supabase API (`favorites`, `analytics`, `photos`,
  `submissions`, `listing-lifecycle`, `sprint-3-1`, `alerts`, `transactions`, `sprint-8-admin-reports`) and browser
  checks still run by hand against a local stack (`scripts/prototype/README.md`).
- A merge to `main` deploys to production through Vercel whether or not CI passed. Making the CI checks required
  (GitHub > Settings > Branches > `main` > Require status checks: both jobs above) is what stops a red pull request
  from being merged.
- Migrations reach production only through `supabase db push`, never through CI.

## When a run fails

Open the run from the pull request's checks. The database job prints `FAIL tests/<suite>.sql` with the first lines of
the error, or the failing integration test's assertion. Reproduce it locally with the commands in
`scripts/local-db/README.md`.
