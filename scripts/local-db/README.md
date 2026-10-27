# Local database for Laria's SQL tests (no Docker)

A plain Postgres 16 with pg_cron and a small Supabase shim. Every migration replays on it, and every `tests/*.sql`
suite and every database integration test passes. CI (`.github/workflows/ci.yml`, `docs/operations/ci.md`) runs it on
each pull request; cloud sessions, which have no Docker, use it for the same checks. It is local only: nothing here
reads hosted Supabase settings or touches production.

## Use

From the repository root, as root (the cloud container default; `sudo` elsewhere):

```sh
bash scripts/local-db/setup-local-db.sh setup     # install, create, start, load shim + migrations
bash scripts/local-db/setup-local-db.sh reset     # clean replay after you add or edit a migration
bash scripts/local-db/setup-local-db.sh test      # every tests/*.sql, then the store concurrency suite
bash scripts/local-db/safeupdate/build.sh         # once: the pg_safeupdate stand-in tests/api-safeupdate needs
bash scripts/local-db/run-db-integration.sh       # every database-only tests/*.integration.cjs
bash scripts/local-db/setup-local-db.sh start     # after the container restarts
```

- Connect with `psql -h 127.0.0.1 -p 54322 -U postgres` (trust auth, no password). That is the address local Supabase
  uses, so the integration tests find it with no arguments.
- Run one suite with `psql -h 127.0.0.1 -p 54322 -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null -f tests/<suite>.sql`.
- The integration tests need `node_modules/pg`: run `pnpm install` first.
- `setup` and `reset` install `postgresql-16` and `postgresql-16-cron` with apt only if they are missing. `reset`
  deletes and rebuilds the cluster in `/var/lib/postgresql/laria` (override with `LARIA_PGDATA`; port with
  `LARIA_PGPORT`).
- A database integration test is one whose usage line reads `// Usage: node tests/<name> [postgresql://...]`;
  `run-db-integration.sh` picks those up by that line, so a new one runs in CI with no other change.
- The same files are in the project's shared folder (`/mnt/project-files/store-operations/local-db-setup/`) for
  sessions that work on an older branch; this copy is the one CI uses.

## What the shim provides

`supabase-shim.sql` runs before the migrations and creates only what they and the SQL suites need:

- Roles `anon`, `authenticated`, `service_role` (bypasses RLS) and `authenticator`, with Supabase-like default grants
  on `public`.
- Schema `extensions` with `pgcrypto` and `uuid-ossp`; the migrations add `pg_trgm`, `unaccent`, `fuzzystrmatch` and
  `pg_cron`.
- `auth.users`, and `auth.uid()`, `auth.role()` and `auth.jwt()`, which read `request.jwt.claims` like Supabase does.
- `storage.buckets` and `storage.objects`, both with RLS on as in Supabase, `storage.foldername()` and
  `storage.filename()`. Buckets have no policies, so `anon` and `authenticated` see no bucket rows: read bucket
  settings after `reset role`.

`safeupdate/laria_safeupdate.c` stands in for Supabase's pg_safeupdate, which refuses an UPDATE or DELETE without a
WHERE clause on API connections. A session runs `LOAD 'laria_safeupdate'` to see what an API call would be refused.

Act as a user in a test the way the existing suites do (`tests/listing-sprint-3.sql`):

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
-- Admin: add "app_metadata":{"role":"admin"} and "aal":"aal2" to the claims. Anonymous: set role anon and '{"role":"anon"}'.
```

## Limits

- There is no PostgREST, GoTrue, Storage API or Realtime. Browser checks, `supabase-js` calls and anything that needs
  the API keys cannot run here.
- Tables owned by Supabase internals that the migrations do not reference are absent. If a new migration needs one
  (for example another `auth` or `storage` column), add the smallest stand-in to the shim and note it here.
- `fsync` is off: fine for tests, never for data you want to keep.
