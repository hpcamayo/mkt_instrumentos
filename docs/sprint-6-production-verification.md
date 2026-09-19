# Sprint 6 — production release and automated acceptance

Release completed: **2026-09-19**. Application source `9ea8e88a342edc4fb54d873e85974d576e42863f` and migration `20260918120000_sprint_6_transactions_reviews.sql` are deployed to production. Sprint 7 was not started.

## Coordinated release

- Pre-release checks passed on the exact committed source: 131/131 unit/component tests, lint, typecheck, production build, canonical acceptance validation and `git diff --check`.
- The Vercel automatic build was temporarily disabled before pushing the migration-dependent commit. The generated Git deployment was cancelled intentionally.
- A clean archive of the exact commit was built as deployment `dpl_6LLyygQyCZJs34iQCqcJSbAjgBVk`.
- The database migration was applied first, then the ready deployment was promoted immediately. The temporary build-ignore setting was restored.
- `laria.audio`, `www.laria.audio`, `laria.pro`, `www.laria.pro`, and the production Vercel aliases resolve to that deployment.
- Production and local migration histories contain the same 17 versions through `20260918120000`.

## Production data and authorization

Before release, production assumptions were checked without mutation: one sold listing, one relisted listing, no historical contact events or authenticated candidates, nine profiles, six stores, eight notifications, two favorites and seven owned listings. The migration performed no historical backfill and preserved those records.

All five Sprint 6 tables have RLS enabled and no anonymous/authenticated raw-table DML grants. Private implementation/reputation/visibility helpers remain non-executable by browser roles. Public entry RPCs remain guarded by authenticated participant/admin authority. Partial/unique indexes enforce one active claim, one transaction per listing/claim, one directional review, typed notification dedupe and indexed exact-contact eligibility.

## Controlled production acceptance

A disposable exact-ID fixture set exercised:

- authenticated exact-listing, pre-sale WhatsApp eligibility; dedupe; anonymous, self, other-listing and post-sale exclusion; and minimal candidate fields;
- pending claim, buyer-only confirmation, idempotent repeat, external sale, decline, cancel, eligible reselection, one-active uniqueness and immutable verified buyer;
- Particular and store seller identity, relist isolation, participant-scoped transaction centers and direct sold-history continuity;
- 1–5 rating/comment bounds, one review per direction, double-blind non-leakage, paired reveal, exact database-owned ten-day reveal/submission boundary and escaped user text;
- Particular/store reputation ownership, public store/detail display and exclusion of hidden reviews from aggregates;
- fixed-reason review reporting, ordinary-user queue denial, mandatory-reason admin hide/restore, immutable review content and append-only moderation evidence;
- typed participant notifications, owner-only visibility/read state/dedupe and real transaction/review destinations;
- exact verified-transaction aggregates and contact-to-verified rate without revenue, payment, delivery or product-guarantee claims;
- anonymous/unrelated raw-table and participant-detail/cancel denial.

Actual production browser checks covered desktop/mobile category navigation, route/outside/Escape close behavior, role-specific transaction centers, mobile account navigation, notifications, Favorites, public store reputation, sold listing history, Store Owner identity, admin transaction/review queues and moderation-only controls. Browser console inspection was clean and the checked desktop/narrow layouts had no horizontal overflow.

## Logs and cleanup

A bounded deployment log review found:

- zero error-level entries;
- zero 5xx or 503 responses;
- zero `marketplace_event_failure` entries;
- no temporary QA account marker in log messages;
- observed `/api/events` and `/api/events/session` requests returned 200.

Cleanup removed the temporary Auth users and all linked profiles, stores, listings/photos, claims, verified transactions, reviews, reports, moderation actions, notifications, events and favorites. A separate release-window audit identified the two anonymous catalog search/filter events from the controlled mobile mega-menu session; those exact event IDs were also removed and rechecked at zero. No binary QA storage objects were created. The exact post-cleanup residue audit returned zero for every controlled table.

## Acceptance state

Canonical production evidence is appended only to the 53 exact Sprint 6 rows exercised in `acceptance/cases.tsv`; no status or test content changed. Registry totals remain **384 cases: 265 Pass, 2 Blocked, 4 Deferred, 113 Not Run**.

- **BLOCKED:** `TX-013`, `REVW-020` require owner production wording acceptance.
- **DEFERRED:** `PDA-009` remains Sprint 7; `REP-008`, `REP-009`, and `ADMIN-006` remain Sprint 8.

No production defect was discovered. The test harness was corrected only for two expectations: self-contact is intentionally recorded as ineligible, and the account heading is the Spanish `Compras y ventas`. Application source was not changed after release.

**Sprint 7 was not started.**
