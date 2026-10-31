# PR #54: final reliability fixes

The two findings reviewed on `a9e6f22` are addressed by this follow-up. Two-step verification stays Admin-only during
the pilot. This change does not merge the PR or apply migrations to hosted Supabase.

## Counter after an offline sale

`get_counter_index` returns both the aggregate SKU index and the owner's per-location stock in one database snapshot.
The counter replaces its location map on each successful index read and accepts updated page props. A queued sale
is removed only after that authoritative read succeeds. If the read fails, the queue keeps the same idempotency key
and its pending-stock deduction for the next retry. It never blindly subtracts the offline sale a second time.

The browser regression used one SKU with one unit at Centro and one at Norte: disconnect, queue Centro's sale,
reconnect and replay, then scan again without reloading. Centro correctly reports no units and leaves the cart empty;
Norte still offers its one unit. Direct database reads confirm Centro 0 / Norte 1. The HTTP regression also simulates
a lost successful sale response by submitting the same operation twice and checking the resulting snapshot.

## Mercado Libre refresh

The server claims a connection through a service-only database function before calling the provider. The private
claim binds the source ciphertext and a worker's claim ID for 60 seconds. Concurrent workers wait briefly and re-read
the saved connection; a slower peer produces a temporary error instead of falsely asking the owner to reconnect.

Saving a replacement pair checks both RPC errors and its boolean result. Four bounded attempts reuse identical
encrypted values, and an already-committed save is acknowledged after a lost response. A failed save returns 503;
the worker retains the encrypted replacement for a later retry. Reconnects/disconnects take precedence, stale workers
cannot overwrite them, and an expired claim can be reclaimed. Ordinary accounts cannot claim, finish, release or read
the private claim table.

The production function was exercised with real local service RPCs and a single-use provider stand-in: parallel
requests made one provider call and both returned the saved access token; a failed save retried the same pair.
Unit cases also cover committed-save response loss, longer outages with a warm retry, reconnect/disconnect races,
invalid tokens and a bounded wait for another worker.

A database transaction cannot atomically include a third-party token rotation. If a worker terminates after the
provider rotates but before any save succeeds (or the provider's successful response is lost), reconnecting may still
be necessary. The retry buffer survives only on the same worker. Live Mercado Libre behavior and production load were
not tested; the provider activation gate remains.

## Changed files and how to test

- `components/inventory/counter.tsx`: consume complete stock snapshots before clearing replayed sales.
- `lib/mercadolibre/server.ts`: claim, re-read, retry and verify token persistence.
- `supabase/migrations/20261210121000_feat_final_reliability.sql`: snapshot reader, private lease and service-only RPCs.
- `lib/supabase/database.types.ts`: the three new RPC definitions generated from the local schema; existing generator
  metadata/formatting retained.
- `tests/final-reliability.test.cjs`, `tests/store-reach-mercadolibre.sql`, `tests/review-followup.integration.cjs`:
  lifecycle, authorization, replay and concurrency regressions, including test-fixture cleanup.

Run `pnpm test`, `pnpm typecheck` and `pnpm lint`. Replay the migrations and run SQL/database tests as described in
`scripts/local-db/README.md`. Run `LARIA_TEST_APP_PORT=32154 bash scripts/acceptance/full-stack.sh /tmp/pr54-final`
in a clean disposable checkout for the production build and HTTP suites. Repeat the browser sequence above using a
throwaway two-location store. Use only the documented local test environments.

Validation on 30 Oct 2026 (America/Lima):

| Check | Result |
|---|---|
| Unit tests | 1,042 passed; none failed or skipped |
| TypeScript, lint, production build | Passed |
| Fresh migration replay | All 170 applied on a minimal database and full local Supabase |
| SQL suites | All 70 passed |
| Database integration | All 11 suites passed, including safeupdate |
| Stock concurrency | All 17 scenarios passed, including 200 linked and 200 unlinked last-unit rounds |
| Full-stack HTTP | All 13 suites passed; the expanded follow-up suite passed after its fixture cleanup was corrected |
| Browser | Offline replay refreshes Centro to 0 and preserves Norte at 1 without a reload |
| Canonical acceptance TSV | Valid: 882 cases; no status changes |

The new migration is additional to the previous 169. Ship it with the branch's coordinated schema/application release;
never apply it early to production. No acceptance status or XLSX is changed. Hosted migrations, production deployment,
legal acceptance and live providers remain outside this verification.
