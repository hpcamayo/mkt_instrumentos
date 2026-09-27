# Sprint 8 failed-gate hotfix

Application candidate: `0bda8e07bb811d6aa914c054f76b3d45cd772654`.
Production remains at `db83a128ab9935dd5f75c990e44708f49c86e3b5`.
The hotfix is ready for a separate commit and production gate retry. The
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
must be checked at the next release gate.

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
  for this retry. Vercel will build the exact committed application.

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

## Next release gate

Use an authenticated Admin browser to open Transacciones and exercise desktop
and mobile navigation. A passive GET/prefetch of `/logout` must return 405 and
leave the session authenticated. Each explicit logout control must send POST,
clear the session, and reach `/login` through a GET. Check the same controls for
Particular and Tienda accounts and the store-registration account gate. Inspect
browser logging for React hydration errors, including date-bearing Admin rows.

The next release gate owns the hotfix commit and deployment. No additional
migration is needed for these changes.
