# Sprint 5 — production release and automated verification

Release and verification date: **2026-09-18**. **Sprint 5 DEPLOYED / OWNER ACCEPTANCE PENDING.** Sprints 1–4 remain CLOSED / ACCEPTED. Sprint 6 was not started. Automated evidence below is not owner usability sign-off or real-inbox evidence.

## A. Release

| Item | Result |
| --- | --- |
| Application source | `516bf4591512b99748f14795f384e594143d1268` — `Implement Sprint 5 favorites and price-drop alerts` |
| Preserved parent | `6b608dd680d79c183a3bf3b134b289a43358560c`, intentional Sprint 4 documentation/evidence |
| Push | `origin/main` advanced from `427ac8e8aa514ae10a47c0a4d2eee3dfe827ccaa` to the exact application commit |
| Deployment | `dpl_7gQ2qVuCgSMQdbyCndjTzDyMTyGu`, READY, production; metadata matches the full application SHA |
| Candidate URL | `https://mkt-instrumentos-erruy1t8c-henri-camayos-projects.vercel.app` |
| Supabase | Linked project `hswkjandadscduodejig`; sole pending migration `20260917120000_sprint_5_favorites.sql` applied successfully |
| Migration history | All 16 local/remote versions match; latest `20260917120000`; no pending migration |
| Normal deployment behavior | Restored original blank ignore-build command, verified after release |

All seven production/main aliases resolve to this deployment: `laria.audio`, `www.laria.audio`, `laria.pro`, `www.laria.pro`, `mkt-instrumentos.vercel.app`, `mkt-instrumentos-henri-camayos-projects.vercel.app`, and `mkt-instrumentos-git-main-henri-camayos-projects.vercel.app`. The historical visual-branch alias remains unchanged, as do unrelated projects.

The established Sprint 4 procedure was reused: temporarily suppress automatic Git builds (`exit 0`), push exact committed source, create a forced `--prod --skip-domain` candidate from `git archive` of that SHA, verify READY/metadata, apply the sole migration, immediately promote, align the main-branch alias, then restore normal builds. The automatic Git deployment was CANCELED rather than serving schema-dependent source early. The CLI assigned its generic project alias during candidate creation; the primary `laria.audio` alias stayed on Sprint 4 until promotion. No uncommitted application source was uploaded.

Preflight reviewed all 48 intended files, scanned for secrets/noise, preserved historical migrations and environment files, and checked production users, stores, listings, notification compatibility and grants. Neither new favorites nor price-drop records existed before migration. Existing seven notifications were preserved; no historical favorites, drops or alerts were synthesized.

## B. Tienda duplicate-RUC retry

**Automated actual-browser PASS.** A disposable Store Owner filled required business fields and a logo, received an explicit duplicate-RUC alert, changed only RUC without reload, and successfully submitted. Name/address/description/logo were retained; exactly one owner-bound application existed. The success state received focus and became visible after scrolling. The header subsequently showed the existing store rather than `Registra tienda`; allowed profile editing remained accessible. Owner `STORE-019` retest is still required.

## C. Global shell

**PASS.** Actual browser checks covered home, catalog, approved detail, public store, login, both signup paths, admin, both account types, Favorites, Notifications, Particular publication/edit/profile, Store inventory/publication/statistics and pending/normal/verified store summaries. One global header, canonical categories/search and nested protected account navigation remained available. Particular navigation differed correctly from Store Owner navigation; existing owners had no stale registration CTA.

Desktop `1280×900` and mobile `390×844` checks found no horizontal overflow. Mobile category and account disclosures exposed the real destinations, including Favorites and Notifications. Anonymous protected routes retained safe login redirects. Public legacy/detail/store pages remained available.

## D. Search and categories

**PASS.** Actual submitted searches were exercised from all seven required origins: home, catalog, detail, store, Favorites, account and mobile. Enter produced canonical `/listados?brand=...`; typing/focus alone created zero searches. Each unique controlled query produced exactly one signed search event with `zero_results=true`; subsequent focus did not duplicate it. These browser searches were reconciled against their exact QA actor/query rows.

Desktop category/subtype links reached real Guitars/electric-guitar results; mobile categories reached actual Guitars results with no overflow. Existing taxonomy/filter parsing was reused. Public page-two pagination also passed. Search remains brand-based, not a new general text-search engine.

## E. Favorites and lifecycle

**PASS.** Anonymous attempts led to login with a safe return URL. Card/detail saved state synchronized; Favorites and refresh persisted it; remove and repeated add/remove were safe. Four competing favorite adds produced one relation. Both Particular and Store Owner buyer accounts could favorite eligible others' inventory; own listing/own-store favorites were denied.

Sold history remained recognizable, with honest `Vendido` state. Hidden listing or nonpublic-parent history retained removable relations but redacted title/slug/price/image. Publicly approved inventory under a pending/hidden parent remained inaccessible. Direct sold-store detail was 404 after the parent became hidden. Relisting created a new ID with zero inherited favorites, and only a subsequent independent favorite made the buyer eligible for that copy's future drop.

## F. Price-drop transitions

**PASS, in-app only.** Two eligible buyers (Particular and Store Owner) favorited a live S/ 1,200 listing. `1200→1100` delivered one typed notice each; retry/unchanged `1100→1100` and increase `1100→1150` delivered none; later `1150→1000` delivered one new notice each. Unfavorite stopped that buyer's subsequent notice; refavorite created no retrospective notice. A later genuine drop notified the current eligible relations.

Pending/rejected/hidden price edits and proposed-only text changes generated no public price-drop notice. Sold ordinary price edits were rejected. A relisted copy's initial decrease did not notify the original listing's favorites; independent favoriting of the approved copy enabled its next decrease. Active-parent visibility was rechecked throughout. Store verification, atomic pending-inventory approval, signed verified direct publication, revocation and subsequent pending submission also passed; expensive 50-listing stress was not repeated because its mechanism was unchanged.

## G. Notifications

**PASS.** Notices retained trusted typed old/new prices, newest-first ordering, recipient-specific access, unread counts and read transitions. Targets resolved through the current safe favorite/listing path, not stale private links. Existing listing approval and store approval/verification/revocation notifications remained compatible. No email delivery or real-inbox behavior is claimed.

## H. Analytics

**PASS.** Controlled current favorite totals reconciled with canonical relations; historical add/remove actions remained distinct. Store fixtures demonstrated a positive add/recorded-view rate and subsequent current-count reduction without erasing prior action counts. Own-store actions did not pollute metrics. Particular/store aggregate endpoints exposed no buyer directory, revenue, GMV or verified-sale claim. Existing SQL/browser analytics and window/zero-denominator regressions are documented in the unchanged-source local report.

## I. Security and database

**PASS.** Anonymous/private favorite reads, unrelated-owner favorite/notification access, foreign analytics and raw event access were denied with working database authorization codes (`42501` or trusted `P0001`), not outage-as-denial. Cross-origin favorite mutation was 403. Forged client favorite lifecycle events were 400. Forged OLD/NEW/recipient fields and foreign live-price writes were rejected; direct forged notification insertion was denied.

Post-migration checks verified favorites/price-drop RLS, the `(user_id, listing_id)` favorite primary key, recent/listing lookups, price-transition/recipient indexes, typed notification constraint/FK and trusted wrapper/internal-function privileges. Direct favorite/drop writes and ordinary execution of internal aggregate/capture functions were unavailable. **The legacy authenticated notifications INSERT ACL remains present, but no INSERT RLS policy permits direct client inserts; the actual forged request failed.** No broader grant claim is implied.

Hosted `supautils.hint_roles` remains `anon, authenticated, service_role`. The documented local-only diagnostic workaround was not applied to production; no hosted permissions or hint settings were weakened. Sequential hosted CLI checks passed. A parallel read-only CLI preflight rotated its temporary login-role password and hit `28P01`; sequential retry resolved that tooling race, with no application/schema failure or permission change.

## J. Regression and performance

| Gate | Result / evidence |
| --- | --- |
| Fresh release `npm test` | PASS, 124/124, no skipped unit tests; also passed through the local environment runner |
| Fresh lint / typecheck / build / diff check | PASS; build emitted nonblocking webpack cache-serialization warnings (101/231 KiB) |
| Clean reset / 16 migrations / seed | PASS, reused unchanged-source canonical local evidence; no redundant expensive reset |
| Eight SQL suites | PASS, reused local Particular, Store Sprint 2, lifecycle Sprint 3, Sprint 3.1, photos, events/analytics, marketplace reliability and favorites/price-drop suites |
| Six local integration suites | PASS, reused auth/submission, lifecycle, Sprint 3.1, photos+browser, analytics+browser, favorites/RUC/price-drop+browser evidence |
| Concurrency | Existing RUC/cap/view/favorite proofs retained; production repeated favorite idempotency, not unchanged cap stress |
| Generated database types | Retained locally verified match; migration/source unchanged during release |
| Production automated API/RLS/browser | PASS for the deterministic flows above, with the telemetry warning in K |

The exact production build retained first-load JS reference sizes: home 113 kB, catalog/detail 121 kB, store 119 kB, Favorites 113 kB, shared 101 kB. Actual catalog network inspection found **24 favorite controls and one shared state request**, not one request per card. Optimized responsive/lazy image delivery and recommendation Suspense streaming passed. Legacy SSR view count stayed unchanged. These are smoke/build observations, **not production latency SLOs or a load benchmark**.

Production harness corrections fixed malformed event envelopes, omitted photo roles and an early favorite-network probe; they did not alter application code or bypass committed local test guards. Required RUC/browser proofs passed before the continuation run; the continuation exercised remaining origins/role shells with fresh fixtures. Each run used exact resource cleanup.

## K. Bounded production logs — qualified result

The initial scan `19:30:56.082Z–20:00:56.081Z` found zero 5xx/error-level entries. The final broader scan `19:40:18.632Z–20:10:18.632Z` found **two `/api/events` 503s**, at `20:05:40.351Z` and `20:06:00.687Z`, and zero error-level entries. Their runtime records contain no internal message. No favorite, RLS/storage, price-drop fan-out, notification or hydration error was observed; expected authorization 4xx and deliberate private-route 404s were not classified as defects.

All controlled browser searches nonetheless reconciled exactly once. The unchanged best-effort telemetry transport has a 1.5-second RPC bound and one same-ID client retry; the available logs **do not prove the internal cause or identify the failed batches**, so neither timeout nor recovered retry is asserted as the cause of these specific responses.

Follow-up `20:17:54.507Z–20:18:01.648Z` exercised three fresh server-signed search/filter batches and their exact-ID replay: all six HTTP requests returned 200 (384–614 ms), exactly six events were recorded, and replay created zero duplicates. Those exact session events were removed. The later log window `20:12:00Z–20:18:27.351Z` contained zero 5xx or error-level entries. **No reproducible blocking regression was found, but the entire release window is not claimed clean: the earlier two unexplained telemetry 503s remain a known observation.** No timeout, RLS or application changes were made to mask them.

## L. QA cleanup

**Zero unintended QA residue.** Independent final manifest audit covered nine QA users, three unique stores, eleven listings and one anonymous browser session; each earlier harness run additionally asserted its own exact cleanup. The telemetry follow-up created only six events and independently removed them by its separate exact session.

| QA resource | Remaining |
| --- | --- |
| Auth users / profiles / stores / store photos | 0 / 0 / 0 / 0 |
| Listings / listing photos / revisions | 0 / 0 / 0 |
| Favorites / price drops / notifications | 0 / 0 / 0 |
| Attributable actor/listing/store/session events | 0 |
| Owned listing/store storage assets | 0 |

The release-QA Auth email-prefix audit also found zero remaining accounts across runs. Final real production totals remained 10 Auth users, 9 profiles, 6 stores, 39 listings, 71 listing photos, 7 existing notifications, 0 favorites and 0 price drops. No real account/store/listing/notification was deleted. Fixture deletions were intentional and are not recoverable through this test harness; real data was preserved.

## M. Canonical acceptance registry

Only evidence column 8 was appended on these **33 existing automated Pass rows**; no status or requirement changed and no owner PASS was inferred:

| Exact IDs receiving production evidence | Automated result |
| --- | --- |
| PUB-001, PUB-002, PUB-003, PUB-004, PUB-005 | PASS |
| FAV-001, FAV-002, FAV-003, FAV-004, FAV-005, FAV-006, FAV-007, FAV-008, FAV-009, FAV-010 | PASS |
| PDA-001, PDA-002, PDA-003, PDA-004, PDA-005, PDA-006, PDA-007, PDA-008 | PASS, in-app only |
| AN-003, AN-014, SANA-002, SANA-007, SDASH-008 | PASS |
| STORE-019, PUB-008, PUB-009, PUB-010, NOTIF-003 | PASS, automated, owner retest pending |
| LIFE-013 | BLOCKED, unchanged, Sprint 6 dependency |
| PDA-009 | DEFERRED, unchanged, Sprint 7 email delivery |

Final totals: **378 cases: 214 Pass, 1 Blocked, 1 Deferred, 162 Not Run; 0 Fail.** TSV validator and five active tooling unit tests passed (two dormant XLSX tests intentionally skipped). Preservation audit verified unchanged IDs/order/statuses, unchanged non-evidence fields, exactly 33 evidence edits, byte-identical unrelated rows and all eight Sprint 4 owner closure entries. No XLSX was read/generated.

## N. Owner manual acceptance — exact IDs

Only these **21 existing owner-facing IDs** remain requested for Sprint 5 usability acceptance:

| Area | Exact manual IDs |
| --- | --- |
| Tienda retry | STORE-019 |
| Global shell/navigation | PUB-008, PUB-009, PUB-010 |
| Favorites | FAV-001, FAV-002, FAV-003, FAV-005, FAV-006, FAV-007, FAV-008, FAV-009 |
| In-app price drop / destination | PDA-001, PDA-002, PDA-004, PDA-005, NOTIF-003 |
| Analytics | SANA-002, SANA-007, AN-014, SDASH-008 |

Use the row-specific workflows in `docs/owner-manual.md` and exact expectations in `acceptance/cases.tsv`, with your own real accounts/listings. Do not repeat SQL/RLS attacks, cap races or deterministic database proofs as owner QA.

Entry URLs: `https://laria.audio/`, `https://laria.audio/listados`, `https://laria.audio/login`, `https://laria.audio/registro/tienda`, `https://laria.audio/mi-cuenta`, `https://laria.audio/mi-cuenta/tienda`, `https://laria.audio/mi-cuenta/favoritos`, `https://laria.audio/mi-cuenta/notificaciones`, `https://laria.audio/mi-cuenta/publicaciones`, `https://laria.audio/mi-cuenta/tienda/inventario`, `https://laria.audio/mi-cuenta/tienda/estadisticas`. Use your actual `/instrumentos/{slug}` and `/tiendas/{slug}`; all disposable fixtures were removed.

## O. Known limitations

- Brand-based search only; no newly invented text-search engine.
- No centralized marketplace email delivery or price-drop email evidence; `PDA-009` remains deferred.
- No saved-search alerts.
- No production/load benchmark; bundles and network smoke are not latency guarantees.
- Two earlier unexplained best-effort event 503s remain recorded in K; the later controlled follow-up and bounded window passed.
- Owner usability acceptance remains pending. Automated Pass statuses are not substituted for that sign-off.

## P. Source, documentation and reproducibility

Production migration history, the deployed metadata and `origin/main` correspond to application SHA `516bf4591512b99748f14795f384e594143d1268`. The application commit contains the complete 48-file Sprint 5 state; its exact changed-file inventory and local reproduction commands are in `docs/sprint-5-verification.md`.

This release additionally updates only `acceptance/cases.tsv` evidence and implementation-state documentation: `docs/architecture.md`, `docs/context.md`, `docs/database.md`, `docs/decisions.md`, `docs/features.md`, the implementation matrix/status in `docs/functional-spec.md`, `docs/owner-manual.md`, `docs/performance.md`, `docs/sprint-5-verification.md`, and this report. Frozen requirements before `## Implementation Status` are byte-identical. No application, test or migration patch was required during the release.

These post-release documentation/evidence changes are committed separately **locally only**, intentionally not pushed, to avoid an unnecessary documentation-only production build. Thus local HEAD may be one documentation commit ahead of deployed `origin/main`; executable/schema source is identical to the deployed application commit. Final working tree is clean. A later explicitly authorized push may include that evidence commit.

## Q. Sprint boundary

**Sprint 6 was not started.** This task only released Sprint 5, performed scoped automated production checks/cleanup, preserved acceptance status boundaries and prepared owner QA. No later-sprint functionality or production monitoring infrastructure was added.
