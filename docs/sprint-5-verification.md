# Sprint 5 — local implementation and verification

Verified 2026-09-18 against loopback Supabase and a production-mode local Next server at `http://localhost:3100`. This is not a production release or owner production sign-off. All final gates passed; no blocking application defect remains from this verification round.

## A. Sprint 4 closure

Sprints 1–4 are **CLOSED / ACCEPTED**. Exact owner evidence appended: `Owner manual production acceptance PASS — 2026-09-17`.

| Exact IDs | Change |
| --- | --- |
| PHOTO-015, SANA-010 | Blocked → Pass, owner evidence |
| REV-014, AUTH-023, WA-001, WA-002, WA-003, WA-004 | Pass → Pass, owner evidence |
| LIFE-013 | Remains Blocked, unchanged; requires Sprint 6 transaction/review linkage |

## B. Tienda duplicate-RUC retry

The first poisoned state was client `Attempt.commitStarted`: it remained true after the server's definitive transaction rejection. Editing RUC changed the fingerprint, so the next attempt was blocked by uncertain-commit protection before a new request could succeed. Reload merely discarded that stale attempt.

The trusted submission route now explicitly labels known noncommitting 4xx failures. The client releases the flag only for such a rejection **and only before any earlier uncertain outcome**. Network/unknown failures, lost success responses and later preflight errors never erase uncertainty. Changed fields after a known rejection clean the old signed folder and start a fresh owner-bound attempt; entered fields/file objects are retained. No reload or bypass of RUC uniqueness is used.

Unit tests exercise known rejection, unclassified errors and an uncertain response followed by a rejection. The actual browser submits a duplicate RUC with a logo, edits only RUC, succeeds, verifies preserved address/description/logo and exactly one application, and confirms focused success scrolls into view. Existing accessible `PageNotice` behavior is reused; smooth-scroll completion is awaited rather than asserted synchronously.

## C. Global shell

One root server layout renders header/categories around home, catalog, detail, store, auth, account and admin routes. Existing account server layout remains nested and trusted, with persistent role navigation. Small hydrated account/favorite context does not turn server children into client implementations. Header Auth/profile/store reads moved off public SSR to one private trusted hydration route.

Desktop uses logo | prominent search | account controls. Narrow mobile keeps search, category disclosure and the account menu without horizontal overflow. Particular/Store Owner header and sidebar distinctions remain; existing-store owners have no stale registration CTA.

## D. Global search

Native GET `/listados?brand=...` reuses the existing brand parser/filter and signed canonical search receipt. No unsupported `q` engine or parallel analytics path was invented. Browser typing emits nothing; Enter with an unknown brand creates exactly one zero-result search, with the canonical URL; revisiting/focusing the header creates no duplicate.

## E. Category navigation

`categoryOptions` and `getInstrumentTypeOptions` are the only taxonomy sources, including `Otro`. Shared desktop disclosures and mobile category disclosures link to encoded existing category/instrument-type filters. No category SEO pages were added.

## F. Favorites

Private `(user_id, listing_id)` relations are unique and authenticated SELECT is own-only RLS. Direct writes are revoked; trusted `set_listing_favorite` derives `auth.uid()` and enforces public approved/active-parent eligibility, self exclusion and idempotent add/remove. Both account types can save others' inventory.

Actual saved state appears on real home/catalog/recommendation/store cards and approved detail controls. Anonymous actions preserve a safe login return path. Shared reads batch listing IDs, including historical seed UUIDs. `/mi-cuenta/favoritos` is stable, 24-item paginated own history. Sold entries remain recognizable; hidden/nonpublic entries retain removable relations but null private title/slug/price/image. Actual browser checks exercise both history states. Relisted copies have new IDs and zero inherited favorites. Sellers see aggregates, never favoriting identities.

## G. In-app price-drop alerts

An AFTER live-price UPDATE trigger reads trusted OLD/NEW values and requires both approved states plus public/active-parent eligibility and a true decrease. It inserts one private transition and fans out to current favorites inside the same domain transaction. Unique transition/recipient delivery and unchanged-price suppression prevent replay duplicates; later genuine drops may alert again.

Favorite mutations share the listing row lock with price changes. Multiple users receive isolated notices; unfavorite stops future notices, refavorite sends no past drop. Pending/rejected/hidden/archived/sold inventory and proposed-only text/photo changes do not alert. Typed metadata records actual prices. Existing private Notifications/read/badge infrastructure is reused; recipient target resolution rechecks current availability. **No email delivery is implemented or claimed.**

## H. Analytics

Current relation counts are independent of period. Favorite additions/removals are action counts in the selected lifetime/7/30-day window; favorite rate = additions / recorded detail views in that same window, null for zero denominator. Positive, zero and mixed-window fixtures prove these are not interchangeable. No historical favorites/events are backfilled.

Particular summary/management and Store statistics display real grouped favorite metrics alongside existing views/contacts/status/dates. Actual analytics browser verifies rendered summary/rate values and per-row counts; no buyer directory, revenue or verified transaction implication is introduced. Search receipts and event replay remain compatible.

## I. Security/RLS

Actual Auth claims and unrelated users exercise own reads, foreign denial, forged owner DML denial, anonymous denial, self/private listing rejection and recipient-specific notification/read/destination access. Browser API validates origin and derives users through trusted `getUser()`. Buyers cannot emit trusted favorite lifecycle events or forge price-drop notifications. Renamed internal aggregate implementations have no ordinary execute grant; wrappers retain existing owner/admin authorization.

Sold store direct-detail URLs now also require an active parent, closing a private-parent history leak. Existing ownership, publication, revision, photo and admin authority remain enforced.

## J. Performance

Shared mounted-ID registration coalesces reads after 25 ms into batches ≤100 IDs, never one request per card. Unknown state stays disabled, not fabricated false data. Header hydration adds no public SSR Auth lookup, and the global provider no longer imports the large browser Auth SDK. Atomic fan-out is an indexed SQL operation; no asynchronous half-notified commit exists. Fan-out is linear in recipients, not claimed constant-time or load-benchmarked.

Final local build first-load JS: home **113 kB**, catalog/detail **121 kB**, store **119 kB**, favorites **113 kB**. Sprint 4 comparison: 111/119/120/117 kB for home/catalog/detail/store. Intermediate SDK-heavy bundle growth was removed before final verification. These are build sizes, not production latency claims. Pagination, computed photo counts, optimized/lazy images, recommendation streaming, timestamps, signed retries and cap locking remain preserved.

## K. Implementation

New forward-only migration: `20260917120000_sprint_5_favorites.sql`, **local only**. Clean reset applied all **16** migrations and seed. Final history and both new lookup indexes were verified. Generated `lib/supabase/database.types.ts` matches freshly generated local types. Historical migrations/seed and environment files are unchanged. Eight implementation-state/decision documents, this report and the selective sprint retrieval guide were reconciled; frozen functional contract before the implementation matrix is byte-identical. No XLSX was read/generated.

The complete changed-file inventory is below.

## L. Final tests

| Gate | Result |
| --- | --- |
| Clean local reset, all migrations, seed | PASS, 16 migrations |
| Particular ownership/RLS | PASS |
| Store Sprint 2/RLS | PASS |
| Listing Sprint 3 lifecycle/revision/RLS | PASS |
| Sprint 3.1 amendments/notifications | PASS |
| Sprint 4 photos SQL | PASS |
| Sprint 4 events/analytics SQL | PASS |
| Marketplace performance/reliability SQL | PASS |
| Sprint 5 favorites/price-drop SQL | PASS |
| Submission/auth/store integration | PASS, including token-hash signup/magic/recovery sessions and exact signed retries |
| Lifecycle integration | PASS |
| Sprint 3.1 integration | PASS |
| Photos integration + actual browser | PASS |
| Analytics integration + actual browser | PASS |
| Favorites/price-drop/RUC integration + actual browser | PASS, including hidden/sold history |
| Concurrency | PASS: duplicate-RUC race, 49→50 competing submissions/relist, four favorite adds→one relation, four views→one accepted view |
| npm test | PASS, 124/124, no skipped unit tests |
| lint / typecheck / build / diff check | PASS, no warnings |
| acceptance validator | PASS, 378 unique cases |
| Acceptance tooling unit tests | PASS, 5 executed; 2 dormant XLSX tests skipped intentionally |
| Machine preservation audit | PASS: original IDs/order/requirements and unrelated rows preserved |

Local Postgres image `17.6.1.111` reproduced the already documented supautils permission-hint crash (`signal 11` / `PGRST001`) on revoked anonymous execution. The diagnostic-only local `supautils.hint_roles=''` workaround from Sprint 4 was reapplied with the local container administrator. No grant/RLS/migration/hosted setting was weakened. The successful analytics rerun asserted exact `42501` or trusted `P0001` denials and a working database, not an outage as PASS. See `docs/sprint-4-verification.md` for workaround/restoration commands.

Browser harness corrections scope description to the textarea rather than the metadata tag, await smooth scroll, renew fixture cookies after global logout, and target the account disclosure rather than the newly first global disclosure. SQL assertions now count only their fixture listing, not concurrent unrelated notifications. These were verification-isolation fixes, not product bypasses.

Reproduction from a local-only shell:

```sh
supabase db reset --local
node tests/run-local.cjs sql tests/particular-ownership.sql tests/store-sprint-2.sql tests/listing-sprint-3.sql tests/sprint-3-1.sql tests/sprint-4-photos.sql tests/sprint-4-analytics.sql tests/marketplace-performance.sql tests/sprint-5-favorites.sql
npm test
npm run lint
npm run typecheck
node tests/run-local.cjs npm run build
node tests/run-local.cjs npm run start -- --port 3100
```

Run integrations sequentially against that local server: `tests/submissions.integration.cjs`, `tests/listing-lifecycle.integration.cjs`, `tests/sprint-3-1.integration.cjs`, `tests/photos.integration.cjs`, `tests/analytics.integration.cjs`, `tests/favorites.integration.cjs`, each through `node tests/run-local.cjs node <suite> http://localhost:3100`. Enable actual helpers with `LARIA_PHOTO_BROWSER=1`, `LARIA_ANALYTICS_BROWSER=1`, `LARIA_FAVORITES_BROWSER=1` and provide `LARIA_AGENT_BROWSER_BIN` if not on PATH. Do not run fixtures during a reset or concurrently with global-baseline SQL suites. A clean reset restores the image's diagnostic setting; reapply the documented local workaround if still using the affected image.

Then run `python3 -B acceptance/validate.py`, `python3 -B -m unittest discover -s acceptance -p 'test_*.py'` and `git diff --check`. No final-gate XLSX flags are enabled.

## M. Acceptance registry

| Exact IDs | Previous → new |
| --- | --- |
| FAV-001, FAV-002, FAV-003, FAV-004, FAV-005, FAV-006, FAV-007, FAV-008, FAV-009, FAV-010 | Not Run → Pass |
| PDA-001, PDA-002, PDA-003, PDA-004, PDA-005, PDA-006, PDA-007, PDA-008 | Not Run → Pass, in-app/local evidence only |
| PUB-001, PUB-002, PUB-003, PUB-004, PUB-005 | Not Run → Pass, anonymous local browser |
| AN-003, AN-014, SANA-002, SANA-007, SDASH-008 | Not Run → Pass, real favorite aggregates |
| PDA-009 | Not Run → Deferred, Sprint 7 email delivery |
| REL-001, REL-002, REL-003, REL-004, REL-005, REL-006, REL-007, REL-008, REL-009, REL-010, REL-011, REL-012, REL-013, REL-014, REL-015 | Pass → Pass, latest regression evidence |
| STORE-019, PUB-008, PUB-009, PUB-010, NOTIF-003 | New → Pass, genuinely new retry/global-shell/search/mobile/in-app-target coverage |
| LIFE-013 | Blocked → Blocked, unchanged |

Sprint 5 exercised scope: **48 automated local Pass, 0 Fail**; email case PDA-009 is **Deferred**, not exercised. LIFE-013 is the unchanged later-sprint **Blocked** carry-over. The eight owner closure cases are recorded separately in section A, not claimed as automated execution.

Evidence is dated **2026-09-18**, explicitly local automatic SQL/API/component/actual-browser proof; in-app evidence does not prove real email delivery. Whole registry: **378 cases — 214 Pass, 0 Fail, 1 Blocked, 1 Deferred, 162 Not Run, 0 N/A**. All 373 prior IDs/order retained; **52 existing rows** changed only status/evidence; **321 unrelated original rows byte-identical**. Five new IDs appended, no renumbering or requirement rewrite. `sprints.tsv` is retrieval guidance only, not bulk PASS authorization.

## N. Owner manual QA after the future release

The concise workflow checklist in `docs/owner-manual.md` covers exact IDs:

- RUC retry: STORE-019.
- Desktop/mobile global navigation and canonical search: PUB-008, PUB-009, PUB-010.
- Save/remove/login/cards/detail/history: FAV-001, FAV-002, FAV-003, FAV-005, FAV-006, FAV-007, FAV-008, FAV-009.
- In-app live-price workflow/unchanged/later drop/current target: PDA-001, PDA-002, PDA-004, PDA-005, NOTIF-003.
- Real aggregate usability: SANA-002, SANA-007, AN-014, SDASH-008.

Production owner retest is not requested until the separate release gate. These local automated PASS rows are not owner manual production sign-offs. Do not ask the owner to repeat deterministic RLS, concurrency or database-only tests. PDA-009 remains deferred, not a Sprint 5 inbox checklist item.

## O. Known limitations and cleanup

Search intentionally remains existing brand search, not a new full-text engine. No price-drop email/provider, saved-search alerts, transaction/review model, full admin hub or asynchronous fan-out worker is added. Legacy public storage limitations remain documented. No fan-out/load benchmark or production latency claim is made. The affected local database image requires the diagnostic workaround until upgraded.

Final local residue audit: **0 Auth users, profiles, favorites, drops, notifications, revisions, events, Storage objects, edit attempts and cleanup claims**. Seed data preserved: **3 stores, 20 listings, 20 photo rows**. Temporary fixture accounts/business/listing assets were removed; screenshots remain only in temporary local directories as evidence, not database/storage QA residue. Local Next test server was stopped after verification.

## P. Production/Git status

Sprint 5 migration **not applied to production**, application **not deployed**, aliases/configuration **untouched**. No hosted Auth/email setting changed. Production source remains the ticket's Sprint 4 `427ac8e8aa514ae10a47c0a4d2eee3dfe827ccaa` baseline; this task did not query/mutate hosted state or push Git.

Intentional local HEAD `6b608dd680d79c183a3bf3b134b289a43358560c` preserved on main, one commit ahead of origin/main. Sprint 5 remains uncommitted working-tree changes for review/release; nothing was reset/rebased/discarded. Tool-generated CLI cache was restored to its original bytes. No environment file or dependency change is included.

## Q. Sprint boundary

**Sprint 6 was not started.** No transactions/reviews, saved searches, centralized email infrastructure or unrelated later-sprint functionality was implemented.

## Changed-file inventory

- `acceptance/cases.tsv`
- `acceptance/sprints.tsv`
- `app/api/account-navigation/route.ts`
- `app/api/favorites/route.ts`
- `app/api/submissions/route.ts`
- `app/instrumentos/[slug]/page.tsx`
- `app/layout.tsx`
- `app/mi-cuenta/favoritos/[id]/page.tsx`
- `app/mi-cuenta/favoritos/page.tsx`
- `app/mi-cuenta/notificaciones/page.tsx`
- `components/account-analytics.tsx`
- `components/account-navigation.tsx`
- `components/favorite-button.tsx`
- `components/global-categories.tsx`
- `components/global-search.tsx`
- `components/listing-card.tsx`
- `components/listing-management-table.tsx`
- `components/marketplace-account-provider.tsx`
- `components/notifications-list.tsx`
- `components/site-header-controls.tsx`
- `components/site-header.tsx`
- `components_v0/featured-listings.tsx`
- `docs/architecture.md`
- `docs/context.md`
- `docs/database.md`
- `docs/decisions.md`
- `docs/features.md`
- `docs/functional-spec.md`
- `docs/owner-manual.md`
- `docs/performance.md`
- `docs/sprint-5-verification.md`
- `lib/account-analytics.ts`
- `lib/account-navigation.ts`
- `lib/favorites.ts`
- `lib/public-submission.ts`
- `lib/supabase/database.types.ts`
- `supabase/migrations/20260917120000_sprint_5_favorites.sql`
- `tests/account-analytics.test.cjs`
- `tests/account-shell.test.cjs`
- `tests/analytics-browser-smoke.cjs`
- `tests/analytics.integration.cjs`
- `tests/favorites-browser-smoke.cjs`
- `tests/favorites.integration.cjs`
- `tests/favorites.test.cjs`
- `tests/performance.test.cjs`
- `tests/photo-browser-smoke.cjs`
- `tests/sprint-4-analytics.sql`
- `tests/sprint-5-favorites.sql`
