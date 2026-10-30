# PR #54: second review fixes

The four findings reviewed on `c82c87bf` are addressed by this follow-up. The branch retains the Admin-only two-step
pilot policy. No production migration, PR merge or production deployment is included.

- Location stock reads paginate each group of item IDs in deterministic item/location order. The first response's
  exact count detects a server row cap, including one below the requested page size. A failed or prematurely empty
  page fails the export instead of producing false zero stock. CSV and Excel use the same complete stock map.
- A private receipt binds each location stock movement's key to its original item, location, type, quantity, channel,
  reference and reason. It is written atomically with the movement under the existing key lock. A count stores its
  per-location target, so later changes do not alter a legitimate retry. The expected version remains a precondition
  on the first write. Older non-count movements can be checked against their original fingerprint; an older count
  without a recoverable target is refused on replay rather than guessed.
- Try-out requests lock the buyer before looking up a replay, taking a store lock or counting the open/daily limits.
  Different stores therefore share the same buyer limit while the store lock continues to protect slot capacity.
- Personal downloads retain listing and counter transactions, authored reviews and visible received reviews. They
  now include the owned feature records and settings documented in `accounts.md`. Queries bind each dataset to the
  caller or the caller's store. Other buyers' identities/contact details, unrevealed or hidden received reviews,
  audience members, invite secrets and Mercado Libre/Nubefact credentials stay out.

Apply `20261210120900_feat_review_followup.sql` with the branch's other migrations at the coordinated release.
Public RPC signatures are unchanged; the new receipt table is private, with no API-role access.

## Reproduction and checks

Run `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm build`. On a fresh disposable database, run the migration
replay and SQL suites in `scripts/local-db/README.md`, then `scripts/local-db/run-db-integration.sh`. The new
`tests/tryout-limits.integration.cjs` verifies that a concurrent third/fourth open booking and tenth/eleventh daily
request produce one success and one refusal; it also checks identical booking replay.

Run `LARIA_TEST_APP_PORT=32154 bash scripts/acceptance/full-stack.sh /tmp/laria-followup` in a clean disposable
checkout for the full local Auth/PostgREST/Storage/app run. It now includes `tests/review-followup.integration.cjs`.
`tests/review-followup.test.cjs` covers truncated and failed stock pages; `tests/store-locations.sql` covers changed
movement payloads and count replay after a later movement; `tests/feat-account-privacy.sql` exercises the expanded
download with foreign data, credentials and unrevealed reviews present.

Validation on 30 Oct 2026:

| Check | Result |
|---|---|
| Unit tests | 1,034 passed; none failed or skipped |
| TypeScript, lint, production build | Passed |
| Fresh migration replay | All 169 applied on the minimal database and full local Supabase |
| SQL suites | All 70 passed, including the expanded export privacy and replay checks |
| Database integration | All 11 suites passed |
| Stock concurrency | All 17 scenarios passed, including 200 linked and 200 unlinked last-unit rounds |
| Clean full-stack run | All 13 HTTP suites passed; new fixtures were removed successfully |
| Canonical acceptance TSV | Valid: 882 cases; no registry changes |

No canonical acceptance status or XLSX is changed. Live providers and production load were not tested; the existing
release gates remain. Production still needs the coordinated schema/application release, and this PR stays unmerged.
