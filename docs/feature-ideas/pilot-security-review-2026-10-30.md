# PR #54: pilot security fixes and verification

PR: https://github.com/hpcamayo/mkt_instrumentos/pull/54

Reviewed feature head: `a64bb9ceb78406b901317998e4c3e374989779ba`.
Main integrated into the feature branch: `c72951547eff92b1e38d96737850f3fc0b94c16a` (through PR #87).
The PR remains a draft; no production migration or deployment is part of this repair.

## Changes

1. Recovery revokes all Auth sessions before removing Admin's factors. The API pre-request guard and Storage policies
   also refuse already-issued tokens whose Auth session was revoked. Recovery clears the remaining backup codes,
   push subscriptions and device records; Auth failures are reported instead of returning success.
2. Service-contact events check the verified session before a service-role write. An Admin who owes a code cannot
   persist the contact. Anonymous contacts and non-Admin pilot accounts keep working.
3. Counter-purchase confirmation serializes by buyer before checking the per-store and global daily limits, even
   when concurrent requests use different QR codes at different stores.
4. Anonymous help submissions go through the app with a server-derived client hash. The anonymous database RPC is
   closed; the service-only writer checks the client limit, while the authenticated RPC enforces the account limit
   independently of caller-supplied e-mail addresses or hashes. Both writers use the same lock order.

The owner's pilot policy supersedes the older optional enrollment/store-payment requirement: only Admin uses two-step
verification. Other users see no enrollment section or code prompt. Existing non-Admin factors are retired at sign-in,
recovery-link sign-in and Seguridad, because Supabase Auth otherwise still demands a code for a password change.
Admin's factors are preserved. A wider rollout waits for paying users and a later explicit owner release; it does not
switch on automatically. The canonical policy is in `docs/functional-spec.md`, with the decision in `docs/decisions.md`.

The main integration preserves its offline counter queue flusher, inventory Undo behavior, nullable RPC types,
store trust badges and owner-aware follow controls. The generated types come from the combined local schema.

## Verification

Run on disposable local databases and accounts on 30 Oct 2026:

| Check | Result |
|---|---|
| `pnpm test` | 1,031 passed; none failed or skipped |
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | Passed |
| Fresh migration replay | All 168 migrations applied on both the minimal database and full local Supabase |
| SQL suites | 70 passed |
| Database integration suites | 10 passed, including the new buyer-limit race and the safeupdate checks |
| Stock concurrency suite | All 17 scenarios passed, including 200 linked and 200 unlinked last-unit rounds |
| Full local stack | All 12 HTTP suites passed, including real Auth, PostgREST and Storage recovery checks |
| `python3 -B acceptance/validate.py` | Valid: 882 cases; acceptance TSV matches integrated main |
| Conflict/whitespace checks | No unresolved merge entries; `git diff --check` passed |

The full-stack run used `LARIA_TEST_APP_PORT=32154` to avoid another local app. Run the standard commands above,
`bash scripts/local-db/setup-local-db.sh test`, `bash scripts/local-db/run-db-integration.sh`, and
`bash scripts/acceptance/full-stack.sh /tmp/laria-acceptance` in a disposable checkout to reproduce the checks.
Database-only tests run before integration fixtures that create page-refresh invalidations.

The new regression coverage is in `tests/pilot-security.test.cjs`, `tests/pilot-security.sql`,
`tests/pilot-security.integration.cjs` and `tests/pilot-counter-limits.integration.cjs`; both CI runners include it.

## Release limitations

- `20261210120800_feat_pilot_security_fixes.sql` must ship with this branch's code. The preview/production database
  was not migrated here; the existing coordinated migration gate in `docs/feature-ideas/setup.md` still applies.
- Legal review, provider setup and the Nubefact demo remain the PR's existing release gates. The checks above do not
  verify live external providers or replace manual visual/legal acceptance.
- Recovery spans the Auth API and Postgres. If a later cleanup call fails after sessions are revoked, the endpoint
  reports failure and the account must sign in again or use support; it does not restore those sessions.
