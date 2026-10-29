# Effortless Laria acceptance checks (EASE)

The registry contains **343 EASE IDs**. The recovered browser harness implements **222**: A 48, B 20, C 18,
D 37 and E 99. `coverage.cjs` lists the missing 121 IDs; `--strict` fails while any are missing. Supporting
unit/SQL evidence covers some automated gaps. Manual and owner acceptance requires observed workflows.

## Local execution

Install repository dependencies and Playwright or playwright-core with compatible Chromium. The checks need
PostgreSQL, Auth and Storage. Both the prototype gateway (`scripts/prototype/README.md`) and a disposable local
Supabase stack are supported. Use a dedicated database and app, seed demo and Mis publicaciones data, and provide
JPEG fixtures in `PHOTO_DIR`, uploaded at `PHOTO_BASE`. Never point local checks at a hosted database.

Environment: `BASE`, `PGURL`, `PHOTO_DIR`, `PHOTO_BASE`, `OUT`, and optionally `CHANNEL=chrome`, `CHROMIUM`,
`CHROMIUM_ARGS`, `NODE_PATH`, `AXE` and the local `CRON_SECRET`. A containerized database can use a `psql`
wrapper on PATH forwarding arguments to that container. Real GoTrue fixtures include identities and empty token
fields. Optional pilot checks use `PILOT_BASE` with `LARIA_ASSISTED_COMMERCE=1`. AI checks use `AI_BASE` with
`LARIA_AI_HELPERS=1 LARIA_AI_FAKE=1` and a dummy local key. Never use a paid AI key for these checks.

```sh
node scripts/acceptance/ease/coverage.cjs
node scripts/acceptance/ease/run.cjs scripts/acceptance/ease/checks-a.cjs --results=/tmp/ease/local/results-a.jsonl
# Repeat for b, c, d, e. For one case, add --only=EASE-301.
node --require ./tests/setup-alias.cjs --test --test-reporter=tap tests/*.test.cjs > /tmp/ease/local/unit-final.tap
node scripts/acceptance/ease/sql-suites.cjs /tmp/ease/local/sql-final.json
node scripts/prototype/a11y-audit.cjs /tmp/ease/local/a11y-pages.json
node scripts/prototype/a11y-states.cjs /tmp/ease/local/a11y-states.json
```

The SQL companion runs 18 suites with real PostgreSQL migrations/functions/RLS in a disposable Docker container;
Auth and Storage tables are stand-ins. It executes actual negative authorization calls. The installed local
Supabase image crashed on certain revoked-function calls, so browser helpers check effective grants first and
the companion supplies separate database execution evidence. EASE-764 replays migrations in one session in
another disposable container (`E_REPLAY_IMAGE` on macOS); leftover temporary objects fail that case.

## Live execution on laria.audio

Use an explicitly authorized run. Accounts mode needs a linked Supabase CLI checkout (`SUPABASE_WORKDIR`,
project `hswkjandadscduodejig`) and environment variables `LIVE_SUPABASE_URL`, `LIVE_SUPABASE_ANON_KEY`,
`LIVE_STORAGE_SERVICE_ROLE_KEY`. Never put credentials in logs or committed evidence. The service credential
inspects and removes only run-owned Storage objects; user tokens cannot reliably delete these bucket objects.

```sh
scripts/acceptance/ease/live-run.sh visitor
scripts/acceptance/ease/live-run.sh accounts scripts/acceptance/ease/live-smoke.cjs
scripts/acceptance/ease/live-run.sh accounts
# Recovery after interruption, with the same environment:
node scripts/acceptance/ease/live.cjs --clean-up
```

Visitor mode refuses writes before they leave the browser except known read actions `cards` and `states` on
`/api/favorites`. Node fetch and Playwright API requests are read-only. WhatsApp opens are intercepted. Navigation
is paced at three seconds and catalog traffic at at most 20 requests/minute per runner. Run one catalog runner
at a time or lower `LIVE_CATALOG_LIMIT`. Sign-in pacing is configurable through `LIVE_SIGN_INS` (20 per 5 minutes).

Accounts mode creates `delivered+ease-<run>-<n>@resend.dev` fixtures with random passwords. Browser writes naming
someone else's listing, store, profile or question are refused. Fixture SQL refuses global background jobs and
rolls back publication if a real saved-search alert could match. Authenticated upload setup, resume, renew and
cleanup are allowed; final publication and imports stay local. Demo/Admin sign-in, email workers and local fake
AI workflows stop as Not Run. No complaint-book entries are filed.

Queued fixture email/push work is cancelled every ten seconds. Case data and uploads are removed after each case;
Auth accounts are removed at the end. Cleanup deletes dependent revision photos, notifications, imports and owned
inventory ledgers before their parents. Append-only ledger deletion uses a transaction-local replication setting
around only the run's ledger rows, restored before ordinary cascades. No hosted schema or triggers are changed.
Storage deletion is verified against actual objects; fixture IDs are retained to check leftovers after account
deletion. Cleanup failure stops the run as Blocked. Require every `left` count in `accounts-cleanup.json` to be zero.

## Recording evidence

JSONL is append-only. The latest timestamp per ID/environment wins on reruns. Local and live verdicts combine
conservatively: Fail, Blocked, Pass, then Not Run. A guard stop is inconclusive; a local pass may coexist with a live
Not Run. Raw partial records retain failed assertions for triage. Production inventory prerequisites and transient
errors may fail checks; investigate before calling every failure a confirmed product defect.

`update_registry.py` reads `local/results-?.jsonl`, `local/reruns*.jsonl`, `live/visitor.jsonl`, `live/accounts.jsonl`,
TAP unit output, SQL output and both accessibility audits. Explicit automated mappings live in
`supplemental-coverage.json`; source assertions cannot accept manual workflows. Accessibility failures count, but
partial focus coverage cannot grant a pass. Reports remove ANSI codes, JWTs and checkout paths.

```sh
python3 -B scripts/acceptance/ease/update_registry.py /tmp/ease --report docs/acceptance/ease-2026-10-29/results.json
# Review dry-run counts, then repeat with --write.
python3 -B acceptance/validate.py
python3 -B -m unittest discover -s acceptance -p 'test_*.py'
git diff -- acceptance/cases.tsv
```

Pass `--application-revision` with the source commit actually served by the local test app; otherwise the report
says the revision was not recorded. It may differ from the checkout HEAD.

Only status and evidence fields of executed EASE IDs change; all other registry bytes are preserved. No XLSX is
regenerated. The dated report records the exact scope and remaining gaps.
