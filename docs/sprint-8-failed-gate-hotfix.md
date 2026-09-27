# Sprint 8 production gate and owner acceptance

Application candidate: `0bda8e07bb811d6aa914c054f76b3d45cd772654`.
Prior application rollback: `db83a128ab9935dd5f75c990e44708f49c86e3b5`.
Production hotfix: `bb16e319540a9d6721e990bc1e9900825c7473ac`.
The reviewed hotfix was committed separately and pushed normally to `main`. The
already-applied production migration is unchanged. Read-only hosted migration
verification at this retry confirms all 19 local/remote versions synchronized.

## Logout

The Admin desktop/mobile logout links allowed Next.js prefetching of `/logout`.
Its GET handler called Supabase `auth.signOut()`, so discovering a link could
terminate the session. Account and store-registration logout also used GET.

All logout controls now share a native POST form and submit button. GET returns
405 with `Allow: POST` without accessing Supabase. POST requires an exact
same-origin `Origin` header and rejects `Sec-Fetch-Site: cross-site` before
accessing Supabase. Successful logout preserves global Supabase sign-out and SSR
cookie cleanup, then redirects to `/login` with HTTP 303 (a subsequent GET).

## Hydration

The new Admin workbench date formatter omitted `timeZone`. For identical props
containing `2026-09-26T02:30:00Z`, UTC rendered
`26 set. 2026, 2:30 a. m.` and Lima rendered `25 set. 2026, 9:30 p. m.`.
The formatter now explicitly uses `America/Lima`.

Regression fixtures reproduce the old difference in complete workbench and
transaction-domain markup, then require identical initial markup in UTC, Lima,
and Tokyo after the fix. Navigation markup is also compared. This proves a
deterministic rendering defect; it does not establish that this was the only
cause of the production React #418 incident. Real production browser hydration
passed the production retry described below without a React #418 error.

## Changed files

- `app/logout/route.ts`
- `app/registrar-tienda/page.tsx`
- `components/logout-button.tsx`
- `components/admin-navigation.tsx`
- `components/account-navigation.tsx`
- `components/admin-workbench.tsx`
- `tests/logout-navigation.test.cjs`
- `tests/account-shell.test.cjs`
- `tests/performance.test.cjs`
- `tests/favorites-browser-smoke.cjs`
- `docs/sprint-8-failed-gate-hotfix.md`

## Production gate retry verification

- `node --test tests/logout-navigation.test.cjs`: 7 passed.
- Targeted account shell/logout cases in `tests/account-shell.test.cjs` and
  `tests/performance.test.cjs`: 2 passed.
- `python3 -B acceptance/validate.py`: valid, 403 cases; 321 Pass, 3 Blocked,
  79 Not Run. No acceptance statuses changed.
- `git diff --check`: passed.
- `supabase migration list --linked`: 19/19 synchronized; no migrations applied.
- The known migration swap file remains untracked and is excluded by explicit
  staging. No full test, lint, typecheck, build or integration suite was rerun
  for this retry. Vercel built the exact committed application.

## Prior local verification (before this retry)

- `node --test tests/logout-navigation.test.cjs`: 7 passed. Includes passive
  GET/prefetch/crawler requests, explicit logout, Origin rejection, all five
  rendered logout controls, and date rendering across time zones.
- The Supabase SSR cleanup regression uses the real client and cookie adapter
  with a stubbed auth transport. It verifies global revocation and cookie
  expiration without contacting hosted auth or the database.
- Relevant auth/navigation/Admin subset: 23 passed.
- `npm test`: 166 passed.
- `npm run lint`, `npm run typecheck`, `npm run build`: passed.
- `git diff --check`: passed.

No SQL/RLS/migration integration suites were run. The updated Favorites browser
helper was not run because its full flow requires database-backed integration
fixtures. At that earlier verification, no production browser checks, commits, deployments,
acceptance-status changes, or Sprint 9 work were performed.

## Production retry result — 2026-09-27 UTC

- Exact Git SHA `bb16e319540a9d6721e990bc1e9900825c7473ac` built READY as
  `dpl_EJDgtZ1utKjtMQeKAFsyGnCTFV9S` and was explicitly promoted. The
  independent `laria.audio` alias lookup confirms this deployment.
- Hosted migrations remain 19/19 synchronized. No migration was reapplied,
  altered, repaired or rolled back.
- Actual desktop Chromium password login and client navigation passed all nine
  Admin sections. Transacciones and Reportes loaded without ending the session.
- All six moderation queues loaded; counts: publicaciones 16, revisiones 0,
  tiendas 2, verificacion 0, reportes 0, resenas 0.
- No passive `/logout` requests occurred during Admin navigation. Browser
  recording and Vercel request logs show exactly four explicit POST logouts;
  server responses were 303. Admin, Particular, Store Owner and the
  store-registration Particular gate all reached `/login`; protected routes
  subsequently redirected to login, confirming session removal.
- No browser page errors or React hydration #418 appeared throughout navigation.
- Public homepage/catalog passed browser and HTTP checks. Existing listing and
  store detail HTTP checks also passed.
- Final error-level Vercel runtime scan scoped to this deployment returned zero
  entries. This is bounded release-smoke evidence, not ongoing monitoring.
- All three disposable QA Auth accounts, their profiles and attributable
  marketplace events were removed and independently checked absent. Existing
  listing/photo/store/report/audit/transaction/review counts are unchanged.
- No moderation decisions, real inventory changes, acceptance-status changes or
  Sprint 9 work occurred. The known swap file remains untracked and excluded.

The production deployment evidence is recorded with owner acceptance in an
evidence-only documentation commit. The verified application release SHA is
the separately committed hotfix above. Browser HAR
recording omitted redirect response metadata (status 0); actual 303 responses
were independently verified in Vercel logs, with successful browser redirects
and protected-route logout checks.

## Owner production QA and Sprint 8 closure — 2026-09-27

The owner explicitly confirmed successful production QA for application SHA
`bb16e319540a9d6721e990bc1e9900825c7473ac`.

- ADMIN-023: Pass with owner production evidence for mobile/collapsed Admin
  navigation, keyboard focus/tab navigation, moderation actions and useful
  state on return from detail.
- TX-018: Pass with explicit owner production acceptance of Compras UX.
- ADMIN-005: Pass retained; owner-confirmed Sprint 8 production smoke appended
  to existing evidence. Pending-revision photo/attribute inspection is
  conditional on revision availability; the earlier automated retry had none.
- ALERT-005: unchanged, Blocked pending the natural production daily-email test.
- Canonical acceptance: 323 Pass / 1 Blocked / 79 Not Run / 403 total.

Sprint 8 is **CLOSED / ACCEPTED**. The remaining ALERT-005 blocker is the
separate Sprint 7 natural daily-email acceptance gate. This closure records
owner evidence and the completed deployment; it changes no implementation,
performs no deployment or Supabase operation, and does not start Sprint 9.

This evidence-only closure runs only `python3 -B acceptance/validate.py` and
`git diff --check` as verification. The known swap file is excluded from staging.

## How to repeat the hotfix smoke

Use an authenticated Admin browser to open Transacciones and exercise desktop
and mobile navigation. A passive GET/prefetch of `/logout` must return 405 and
leave the session authenticated. Each explicit logout control must send POST,
clear the session, and reach `/login` through a GET. Check the same controls for
Particular and Tienda accounts and the store-registration account gate. Inspect
browser logging for React hydration errors, including date-bearing Admin rows.

The hotfix release gate and owner Sprint 8 QA are complete. No additional
migration is needed for these changes.
