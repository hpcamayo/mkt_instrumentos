# Sprint 4 local implementation and verification

Verified 2026-09-17. This is the implementation/local-verification handoff, not a production release or manual production acceptance. Sprints 1–2 remain CLOSED / ACCEPTED. Sprint 5 was not started.

## A. Acceptance registry

Canonical source: acceptance/cases.tsv. The original 357 Test IDs and existing requirement/expected/steps fields remain unchanged. Updated 53 existing rows only in status/evidence columns (49 status changes; four evidence-only changes); added 16 cases, producing **373** cases.

Global status counts: **179 Pass, 0 Fail, 3 Blocked, 191 Not Run, 0 Deferred, 0 N/A**. Relevant handoff scope below: **67 Pass, 0 Fail, 3 Blocked, 10 Not Run/deferred by sprint dependency**. These scope counts are not the whole-registry totals.

Owner production evidence was applied exactly to STORE-018, DASH-008, NOTIF-001, NOTIF-002, LIST-013, REV-011, REV-012:
Owner manual production retest PASS — 2026-09-16.
The first four retain Pass with updated evidence; LIST-013, REV-011, REV-012 change Fail → Pass.

Other existing status changes:
- REV-014: Fail → Pass after all nine deterministic closure criteria.
- PHOTO-001, PHOTO-002, PHOTO-003, PHOTO-004, PHOTO-005, PHOTO-006, PHOTO-007, PHOTO-008, PHOTO-009, PHOTO-010, PHOTO-011, PHOTO-012, PHOTO-013, PHOTO-014, PHOTO-016, PHOTO-017: Not Run → Pass.
- WA-001, WA-002, WA-003, WA-004, WA-005, WA-006, WA-007: Not Run → Pass.
- AN-001, AN-002, AN-004, AN-005, AN-006, AN-007, AN-008, AN-009, AN-012, AN-013, AN-015, AN-016: Not Run → Pass.
- SANA-001, SANA-003, SANA-004, SANA-005, SANA-006, SANA-008, SANA-009 and SDASH-009: Not Run → Pass.
- PHOTO-015 and SANA-010: Not Run → Blocked for actual manual checks after release.

New IDs (all locally exercised, not manual production signoff): AUTH-023; PHOTO-018, PHOTO-019, PHOTO-020, PHOTO-021, PHOTO-022, PHOTO-023, PHOTO-024, PHOTO-025, PHOTO-026, PHOTO-027, PHOTO-028, PHOTO-029, PHOTO-030, PHOTO-031; AN-017.
Automated evidence explicitly identifies local SQL/API/component/browser proof on 2026-09-17 and remaining owner QA after release. AUTH-023's earlier 2026-09-16 local provider/unit evidence is retained; the full regression was rerun on 2026-09-17.

Selective retrieval used:

```sh
rg '^4\t' acceptance/sprints.tsv
rg '^(PHOTO|REV|AUTH|WA|AN|SANA|SDASH)-' acceptance/cases.tsv
rg '^REV-014\t' acceptance/cases.tsv
rg '^(STORE-018|DASH-008|NOTIF-001|NOTIF-002|LIST-013|REV-011|REV-012|LIFE-013)\t' acceptance/cases.tsv
rg '^REL-' acceptance/cases.tsv
```

TSV validation PASS; registry tooling ran seven tests: five passed and two dormant workbook tests were skipped. A comparison against HEAD proved the complete original ID set preserved, only authorized existing status/evidence fields changed, exact expected new IDs added, and unrelated rows byte-identical. acceptance/sprints.tsv and acceptance/README.md did not need changes. **No XLSX was read, parsed, generated, or regenerated.**

## B. Photo subsystem

The first failing layer was database photo URL validation: the old double-escaped extension regexp rejected otherwise valid uploaded edit paths, causing LISTING_PHOTO_INVALID and a generic HTTP failure. The literal-dot [.] check fixes the path validation, not merely the error wording. Admin promotion also incorrectly treated the reviewer as the upload owner; retained proposal references now validate against the actual listing owner.

Canonical live/proposed sets are complete, ordered, unique 2–10-photo sets; first photo is primary. New owner/listing/attempt-scoped JPEG/PNG/WebP edit objects (≤5 MB) use a private bucket and durable authorized proxy URLs. Live public photos remain unchanged during Particular/normal-Tienda moderation.

Add/remove/replace/reorder/primary amendments reuse one active revision, retain earlier proposed text/taxonomy, and persist the exact latest order. Successful saves refresh/remount from persisted server state with accessible focus/scroll feedback. Restoring the exact live set removes only the photo difference; other proposed differences survive, or an entirely empty proposal is cancelled.

Latest-version approval atomically promotes exact text/photos without undoing immediate fields. Rejection preserves live photos and private reason/audit references. Stale approval AND rejection fail safely. Current verified-store authority allows direct valid edits; revocation restores moderation. Draft/pending/rejected/owner-hidden cases preserve their proper review/state rules; admin-hidden restrictions remain.

Sold inventory is immutable; relisted copies cannot overwrite sold source rows or delete shared historical bytes. Cleanup is owner-bound/service-controlled and reference-aware across every live/revision/history reference. Under the same listing lock, permanent retired-path claims prevent attachment after the reference check. Failed claim/Storage cleanup returns an explicit retryable failure, not false empty success. Rejected/sold/superseded audit references remain protected.

The photo SQL/API/component/actual-browser gate passed BEFORE analytics implementation began. All nine REV-014 criteria were exercised, including a pre-existing title proposal, subsequent real uploads/repeated operations, one pending revision, retained prior text/latest photos, unchanged public set, latest admin preview and exact promotion.

## C. Password reset

Root cause: the shared password form discarded the known safe provider same_password condition as an unknown failure. It now displays:
**La nueva contraseña debe ser diferente de tu contraseña actual.**
Only the structured safe code maps to this wording; unknown/raw provider messages remain generic. No plaintext old password is retrieved, persisted or compared. Recovery cookies remain usable after rejection; valid different-password reset works, new login succeeds and old-password login fails. Invalid recovery behavior remains safe.

## D. Analytics architecture

Postgres is the canonical durable first-party event source, not Google Analytics. Extensible text/FK taxonomy begins with 16 types:
listing_impression, listing_view, store_view, whatsapp_contact, store_contact, search, filter_applied, listing_creation_started, listing_submitted, listing_approved, listing_rejected, listing_sold, store_application_started, store_application_submitted, store_approved, store_verified.

Rows support event UUID/time/type, canonical listing/store/seller, verified actor, random session, source, bounded typed metadata, submission and dedupe keys. No historical events are synthesized.

Actor IDs come from server Auth validation. Anonymous identity is a random signed first-party HttpOnly/SameSite=Lax cookie lasting 24 hours (Secure in production), not IP/device/UA/canvas/font fingerprinting. Anonymous session identity stays conceptually separate from account identity. No passwords, auth tokens, IPs, raw UAs, or WhatsApp content are product telemetry.

Impressions/detail/store views use rolling 30-minute identity/type/entity dedupe, with a DB advisory lock; authenticated identity takes precedence and survives cookie rotation. Event UUIDs dedupe transport retries. Real WhatsApp clicks remain separate; actual lifecycle changes use trusted transactional triggers and replay keys. Owners/admins are excluded from commercial inspection metrics. Creation/application starts come from the signed trusted submission path; completion/moderation transitions are written in the domain transaction.

## E. WhatsApp

A real anchor retains its canonical fallback URL. On click, POST /api/contact resolves current public target/contact details and verifies Auth actor; trusted recording precedes navigation when it succeeds. Anonymous contact remains allowed and events retain canonical targets without claiming buyer eligibility. Logged-in contact events preserve exact buyer/listing/seller-or-store/timestamp for the later Sprint 6 eligibility foundation; no eligible-buyer UI or transaction workflow is implemented now.

A 900 ms deadline covers session/logging; telemetry failure, timeout or popup failure cannot permanently trap contact. Contact event payloads accept only identity/source/event keys, not incoming drafts/messages or arbitrary URLs. DB contact metadata is empty. Actual browser tests intercept the final destination to avoid opening external WhatsApp during QA; they prove the click/fallback path, not a real WhatsApp app conversation.

## F. Tracking

Card impressions require ≥50% real IntersectionObserver intersection AND document visibility. An actual initially offscreen card recorded no impression, then recorded one on entering view without re-entry inflation. Detail/store opens require actual visible client effects; GET, HEAD, SSR and valid RSC prefetch recorded none. Auth/anonymous isolation, owner/admin exclusions and four concurrent requests → one accepted detail view passed.

Search/filter telemetry uses short-lived signed receipts from the EXISTING parsed filters and actual result count. No new query system or invented freeform query was added. Existing brand input is the bounded query context. Zero results derive from the same search event; client-forged counts/receipt tampering fail. Canonical client signatures ignore pagination and suppress rerender/refresh inflation; actual new search/filter actions may be distinct.

Listing creation/submission/approval/rejection/sold and store application/submission/approval/verification transitions reconcile with actual domain state; idempotent retries cannot duplicate the logical transition, and invalid atomic verification rolls back rather than half-writing events.

## G. Seller analytics

Particular summary aggregates ALL owned rows, not just the recent-five presentation query. Management tables show actual per-listing views/WhatsApp contacts/status/first publication/sold metadata. Summary exposes current public-active inventory, total views, contacts and owner-marked sold count.

One grouped indexed owner RPC is request-cached privately, never shared across owners. Supported periods: lifetime, last 7 days and last 30 days; Particular existing summary/table uses clearly labeled lifetime values. Current active/sold counts are inventory state, NOT period sale conversions. An unavailable/malformed aggregate shows unavailable, not invented zero. No fake favorite count or revenue.

## H. Store analytics

Real Estadísticas route: /mi-cuenta/tienda/estadisticas, only for Store Owners with their owner-bound store, within desktop/mobile shell. Default 30 days; real 0/7/30 period links expose current active/sold, product impressions/views/contacts, store visits/contacts.

CTR = recorded product detail views / recorded product impressions.
Contact rate = recorded product WhatsApp intents / recorded product detail views.
Both use the SAME event period, exclude undecomposable historical cache values, and show Sin datos for zero denominator. Ratios can exceed 100% from direct opens/repeated contacts; they are event ratios, not unique-buyer conversion probabilities. No sold-price revenue or verified paid-sales claim.

SDASH-008's nonfavorite totals were tested, but the complete case includes favorites and remains Not Run/deferred until that feature exists.

## I. Legacy view_count

Compatibility strategy A: event table is canonical for future activity; view_count remains preserved historical-plus-new accepted detail-view cache. Accepted deduplicated views increment once; owner direct writes and the old undeduplicated public RPC are denied. Detail/admin/lifetime dashboard use that same cache. Seven/thirty-day views and ratio denominators use recorded events only. Historical cache is neither reset nor converted into invented history.

## J. Security/RLS

Raw events/taxonomy have RLS and no browser-role table access; recorder is service-only and checks its trusted role. Browser schemas reject forged buyer/actor/seller/session/admin/lifecycle claims. SQL derives canonical ownership and public target eligibility, requiring approved listing AND active parent store.

Account aggregate defaults to auth.uid(); only trusted admin can request another owner/global aggregates. Output exposes no buyer directory. Actual RPC/table permission failures were verified, not mistaken for schema-cache outages.

Photo private uploads are append-only, exact owner/listing/attempt paths. Foreign/missing/invalid/oversized/duplicate/retired paths fail. Unattached bytes return 404 even to uploader; retained proposal bytes require owner/admin; public live/sold references require parent eligibility. Browser overwrite/delete and direct protected photo/listing table mutations remain denied. Existing Sprint 1–3.1 RLS/authority behavior is preserved.

## K. Performance

Existing 24-item stable pagination/filter preservation, database photo counts, responsive optimized public images/lazy thumbnails, recommendation Suspense streaming, first-publication timestamps, targeted email checks, signed atomic retries and cap locks remain intact.

Telemetry is post-hydration POST, not an extra SSR auth/event dependency. Queue: ≤200 pending events, ≤20/batch, 80 ms flush, 8-second transport bound, one SAME-ID retry, bounded 500-entry client browsing cache. Server recorder has a 1.5-second transport bound. WhatsApp has separate 900 ms fail-open navigation. Aggregate SQL is grouped with recent/listing/store/seller/identity/contact indexes, not per-listing event scans.

Final local build: home 111 kB first-load JS versus historical measured production baseline 110 kB; catalog 119 kB, listing detail 120 kB, store 117 kB, server-rendered store stats 105 kB. These are build sizes, not invented production latency measurements. Actual browser image delivery/rendering checks passed.

Local test-environment defect: installed Postgres image 17.6.1.111 crashed on the permission-error hint path, before a revoked function body could run. This matches the official [supautils issue #214](https://github.com/supabase/supautils/issues/214). The local-only mitigation disables diagnostic hints, NOT permission enforcement:

```sh
docker exec supabase_db_mkt_instrumentos sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c "alter system set supautils.hint_roles = '\'''\'';" -c "select pg_reload_conf();"'
```

Use only against this local container; no secrets are printed. The local setting remains empty for repeatable denied-access testing. Prefer upgrading to a fixed local image; afterward restore the default with ALTER SYSTEM RESET supautils.hint_roles and pg_reload_conf(). This does not belong in any application migration or production rollout. The successful rerun asserted exact 42501 privileges or exact P0001 owner/admin guard contracts, then successful aggregate reads; no database recovery/schema-cache outage counted as PASS. No grants were weakened.

## L. Implementation

Two new forward-only migrations, applied locally and pending the separate production release gate:
- 20260916180000_sprint_4_photos.sql
- 20260916200000_sprint_4_events.sql

Historical migrations were not rewritten. Generated lib/supabase/database.types.ts was refreshed against local schema. Seven implementation-state docs were reconciled; frozen rules were not changed. No environment files, hosted Auth templates or production settings changed. Tool-generated supabase/.temp/cli-latest was restored to its original bytes.

#### Application routes

- [app/api/contact/route.ts](/Users/henricamayoguillermo/code/mkt_instrumentos/app/api/contact/route.ts)
- [app/api/events/route.ts](/Users/henricamayoguillermo/code/mkt_instrumentos/app/api/events/route.ts)
- [app/api/events/session/route.ts](/Users/henricamayoguillermo/code/mkt_instrumentos/app/api/events/session/route.ts)
- [app/api/listing-images/[...path]/route.ts](/Users/henricamayoguillermo/code/mkt_instrumentos/app/api/listing-images/[...path]/route.ts)
- [app/api/listings/[id]/manage/route.ts](/Users/henricamayoguillermo/code/mkt_instrumentos/app/api/listings/[id]/manage/route.ts)
- [app/api/listings/[id]/photo-cleanup/route.ts](/Users/henricamayoguillermo/code/mkt_instrumentos/app/api/listings/[id]/photo-cleanup/route.ts)
- [app/api/listings/[id]/view/route.ts](/Users/henricamayoguillermo/code/mkt_instrumentos/app/api/listings/[id]/view/route.ts)
- [app/api/submissions/route.ts](/Users/henricamayoguillermo/code/mkt_instrumentos/app/api/submissions/route.ts)
- [app/instrumentos/[slug]/page.tsx](/Users/henricamayoguillermo/code/mkt_instrumentos/app/instrumentos/[slug]/page.tsx)
- [app/listados/page.tsx](/Users/henricamayoguillermo/code/mkt_instrumentos/app/listados/page.tsx)
- [app/mi-cuenta/page.tsx](/Users/henricamayoguillermo/code/mkt_instrumentos/app/mi-cuenta/page.tsx)
- [app/mi-cuenta/publicaciones/[id]/editar/page.tsx](/Users/henricamayoguillermo/code/mkt_instrumentos/app/mi-cuenta/publicaciones/[id]/editar/page.tsx)
- [app/mi-cuenta/publicaciones/page.tsx](/Users/henricamayoguillermo/code/mkt_instrumentos/app/mi-cuenta/publicaciones/page.tsx)
- [app/mi-cuenta/tienda/estadisticas/page.tsx](/Users/henricamayoguillermo/code/mkt_instrumentos/app/mi-cuenta/tienda/estadisticas/page.tsx)
- [app/mi-cuenta/tienda/inventario/page.tsx](/Users/henricamayoguillermo/code/mkt_instrumentos/app/mi-cuenta/tienda/inventario/page.tsx)
- [app/tiendas/[slug]/page.tsx](/Users/henricamayoguillermo/code/mkt_instrumentos/app/tiendas/[slug]/page.tsx)

#### Components

- [components/account-analytics.tsx](/Users/henricamayoguillermo/code/mkt_instrumentos/components/account-analytics.tsx)
- [components/account-navigation.tsx](/Users/henricamayoguillermo/code/mkt_instrumentos/components/account-navigation.tsx)
- [components/admin-panel.tsx](/Users/henricamayoguillermo/code/mkt_instrumentos/components/admin-panel.tsx)
- [components/listing-card.tsx](/Users/henricamayoguillermo/code/mkt_instrumentos/components/listing-card.tsx)
- [components/listing-detail-metadata.tsx](/Users/henricamayoguillermo/code/mkt_instrumentos/components/listing-detail-metadata.tsx)
- [components/listing-edit-form.tsx](/Users/henricamayoguillermo/code/mkt_instrumentos/components/listing-edit-form.tsx)
- [components/listing-management-table.tsx](/Users/henricamayoguillermo/code/mkt_instrumentos/components/listing-management-table.tsx)
- [components/marketplace-telemetry.tsx](/Users/henricamayoguillermo/code/mkt_instrumentos/components/marketplace-telemetry.tsx)
- [components/password-form.tsx](/Users/henricamayoguillermo/code/mkt_instrumentos/components/password-form.tsx)
- [components/whatsapp-contact-link.tsx](/Users/henricamayoguillermo/code/mkt_instrumentos/components/whatsapp-contact-link.tsx)
- [components_v0/featured-listings.tsx](/Users/henricamayoguillermo/code/mkt_instrumentos/components_v0/featured-listings.tsx)

#### Libraries and generated types

- [lib/account-analytics.ts](/Users/henricamayoguillermo/code/mkt_instrumentos/lib/account-analytics.ts)
- [lib/account-navigation.ts](/Users/henricamayoguillermo/code/mkt_instrumentos/lib/account-navigation.ts)
- [lib/account-ui.ts](/Users/henricamayoguillermo/code/mkt_instrumentos/lib/account-ui.ts)
- [lib/auth/password.ts](/Users/henricamayoguillermo/code/mkt_instrumentos/lib/auth/password.ts)
- [lib/listing-photo-cleanup.ts](/Users/henricamayoguillermo/code/mkt_instrumentos/lib/listing-photo-cleanup.ts)
- [lib/marketplace-event-payload.ts](/Users/henricamayoguillermo/code/mkt_instrumentos/lib/marketplace-event-payload.ts)
- [lib/marketplace-events-client.ts](/Users/henricamayoguillermo/code/mkt_instrumentos/lib/marketplace-events-client.ts)
- [lib/marketplace-events-server.ts](/Users/henricamayoguillermo/code/mkt_instrumentos/lib/marketplace-events-server.ts)
- [lib/submission-token.ts](/Users/henricamayoguillermo/code/mkt_instrumentos/lib/submission-token.ts)
- [lib/supabase/database.types.ts](/Users/henricamayoguillermo/code/mkt_instrumentos/lib/supabase/database.types.ts)

#### Migrations

- [supabase/migrations/20260916180000_sprint_4_photos.sql](/Users/henricamayoguillermo/code/mkt_instrumentos/supabase/migrations/20260916180000_sprint_4_photos.sql)
- [supabase/migrations/20260916200000_sprint_4_events.sql](/Users/henricamayoguillermo/code/mkt_instrumentos/supabase/migrations/20260916200000_sprint_4_events.sql)

#### Tests and local verification

- [tests/account-analytics.test.cjs](/Users/henricamayoguillermo/code/mkt_instrumentos/tests/account-analytics.test.cjs)
- [tests/account-shell.test.cjs](/Users/henricamayoguillermo/code/mkt_instrumentos/tests/account-shell.test.cjs)
- [tests/analytics-browser-smoke.cjs](/Users/henricamayoguillermo/code/mkt_instrumentos/tests/analytics-browser-smoke.cjs)
- [tests/analytics.integration.cjs](/Users/henricamayoguillermo/code/mkt_instrumentos/tests/analytics.integration.cjs)
- [tests/analytics.test.cjs](/Users/henricamayoguillermo/code/mkt_instrumentos/tests/analytics.test.cjs)
- [tests/listing-lifecycle.integration.cjs](/Users/henricamayoguillermo/code/mkt_instrumentos/tests/listing-lifecycle.integration.cjs)
- [tests/listing-lifecycle.test.cjs](/Users/henricamayoguillermo/code/mkt_instrumentos/tests/listing-lifecycle.test.cjs)
- [tests/marketplace-tracking.test.cjs](/Users/henricamayoguillermo/code/mkt_instrumentos/tests/marketplace-tracking.test.cjs)
- [tests/password-reset.test.cjs](/Users/henricamayoguillermo/code/mkt_instrumentos/tests/password-reset.test.cjs)
- [tests/photo-browser-smoke.cjs](/Users/henricamayoguillermo/code/mkt_instrumentos/tests/photo-browser-smoke.cjs)
- [tests/photo-cleanup.test.cjs](/Users/henricamayoguillermo/code/mkt_instrumentos/tests/photo-cleanup.test.cjs)
- [tests/photo-editor.test.cjs](/Users/henricamayoguillermo/code/mkt_instrumentos/tests/photo-editor.test.cjs)
- [tests/photos.integration.cjs](/Users/henricamayoguillermo/code/mkt_instrumentos/tests/photos.integration.cjs)
- [tests/photos.test.cjs](/Users/henricamayoguillermo/code/mkt_instrumentos/tests/photos.test.cjs)
- [tests/run-local.cjs](/Users/henricamayoguillermo/code/mkt_instrumentos/tests/run-local.cjs)
- [tests/sprint-3-1.integration.cjs](/Users/henricamayoguillermo/code/mkt_instrumentos/tests/sprint-3-1.integration.cjs)
- [tests/sprint-4-analytics.sql](/Users/henricamayoguillermo/code/mkt_instrumentos/tests/sprint-4-analytics.sql)
- [tests/sprint-4-photos.sql](/Users/henricamayoguillermo/code/mkt_instrumentos/tests/sprint-4-photos.sql)
- [tests/submissions.integration.cjs](/Users/henricamayoguillermo/code/mkt_instrumentos/tests/submissions.integration.cjs)

#### Acceptance and documentation

- [acceptance/cases.tsv](/Users/henricamayoguillermo/code/mkt_instrumentos/acceptance/cases.tsv)
- [docs/architecture.md](/Users/henricamayoguillermo/code/mkt_instrumentos/docs/architecture.md)
- [docs/context.md](/Users/henricamayoguillermo/code/mkt_instrumentos/docs/context.md)
- [docs/database.md](/Users/henricamayoguillermo/code/mkt_instrumentos/docs/database.md)
- [docs/features.md](/Users/henricamayoguillermo/code/mkt_instrumentos/docs/features.md)
- [docs/functional-spec.md](/Users/henricamayoguillermo/code/mkt_instrumentos/docs/functional-spec.md)
- [docs/owner-manual.md](/Users/henricamayoguillermo/code/mkt_instrumentos/docs/owner-manual.md)
- [docs/performance.md](/Users/henricamayoguillermo/code/mkt_instrumentos/docs/performance.md)
- [docs/sprint-4-verification.md](/Users/henricamayoguillermo/code/mkt_instrumentos/docs/sprint-4-verification.md)

Git: branch main; HEAD **6c3d150871053434b6d411950dea1e6a16f821cb**. Working tree intentionally dirty with **67** implementation/docs/test/registry files (36 tracked modifications, 31 new files including this report). No new commit, push, reset, rebase or history rewrite. Intentional acceptance-registry commits are preserved.

## M. Test results

| Check | Result |
| --- | --- |
| Clean local Supabase reset, all 15 migrations and seed | PASS |
| Particular ownership/RLS SQL | PASS |
| Store Sprint 2 ownership/RUC/verification/cap/RLS SQL | PASS |
| Sprint 3 lifecycle/revision SQL | PASS |
| Sprint 3.1 amendments/stale decisions/notifications SQL | PASS |
| Sprint 4 photo SQL | PASS |
| Sprint 4 analytics SQL | PASS |
| Marketplace performance/reliability SQL | PASS |
| Auth/submission integration | PASS |
| Listing lifecycle/revision integration | PASS |
| Sprint 3.1 API integration | PASS |
| Photo API + actual-browser integration | PASS |
| Analytics HTTP/DB + actual-browser integration | PASS |
| Cap concurrency: competing submissions/relist for last slot | PASS: final count 50, never 51 |
| Concurrent detail dedupe: four requests | PASS: one accepted event |
| Exact signed submission/edit replay, changed retry, partial upload recovery | PASS |
| Cleanup references/failure retry + teardown residue audit | PASS |
| Password reset unit/provider/recovery-session/new-versus-old login | PASS |
| npm test | PASS: 114/114, zero failures/skips |
| npm run lint | PASS |
| npm run typecheck | PASS, sequential after build |
| npm run build | PASS |
| TSV validate | PASS: 373 unique cases |
| Acceptance tooling tests | PASS: 5 passed, 2 dormant workbook tests skipped (7 total) |
| git diff --check | PASS |

Re-run locally with Docker/Supabase CLI and a separate installed agent-browser binary. The runner checks loopback Supabase and overrides inherited hosted credentials internally; it never pulls hosted environment configuration. If the affected old Postgres image is still installed, use the diagnostic-only local mitigation above before exercising revoked RPCs.

```sh
supabase db reset --local
node tests/run-local.cjs sql tests/particular-ownership.sql tests/store-sprint-2.sql tests/listing-sprint-3.sql tests/sprint-3-1.sql tests/sprint-4-photos.sql tests/sprint-4-analytics.sql tests/marketplace-performance.sql
node tests/run-local.cjs npm run build
node tests/run-local.cjs npm run start -- --port 3100
```

In a second terminal while that local app runs:

```sh
node tests/run-local.cjs node tests/submissions.integration.cjs http://localhost:3100
node tests/run-local.cjs node tests/listing-lifecycle.integration.cjs http://localhost:3100
node tests/run-local.cjs node tests/sprint-3-1.integration.cjs http://localhost:3100
LARIA_PHOTO_BROWSER=1 node tests/run-local.cjs node tests/photos.integration.cjs http://localhost:3100
LARIA_ANALYTICS_BROWSER=1 node tests/run-local.cjs node tests/analytics.integration.cjs http://localhost:3100
npm test
npm run lint
npm run typecheck
python3 -B acceptance/validate.py
python3 -B -m unittest discover -s acceptance -p 'test_*.py'
git diff --check
```

Set `LARIA_AGENT_BROWSER_BIN` to the installed browser executable if it is not on PATH. Run fixture-writing integrations sequentially; do not reset the local database while an integration/browser session is active, or build while a server uses the same `.next` directory.

All integration fixtures are explicitly local. Final local audit: Auth users 0, profiles 0, marketplace events 0, edit receipts 0, cleanup claims 0, Storage objects 0, revisions 0, notifications 0, QA stores/listings 0. Original seed: 3 stores and 20 listings preserved.

REL-001, REL-002, REL-003, REL-004, REL-005, REL-006, REL-007, REL-008, REL-009, REL-010, REL-011, REL-012, REL-013, REL-014, REL-015 were covered by the existing unit/SQL/submission/browser/build regression block; their previously accepted TSV rows remained unchanged.

Browser artifacts:
- Final photo workflow: /private/var/folders/bx/rbr8tb0j09j9glrq092zzypc0000gn/T/laria-s4-photo-browser-g2ksKe
- Final analytics workflow: /private/var/folders/bx/rbr8tb0j09j9glrq092zzypc0000gn/T/laria-s4-analytics-browser-pFqVTo
- Home gut-check: /private/tmp/laria-sprint-4-final-home.png
Screenshots were visually inspected; no uncaught browser errors/overflow in exercised flows.

## N. Exact acceptance results

### PASS — 67 relevant cases

The seven owner rows are production-manual evidence; all other rows here are local automated evidence, not owner production acceptance.

| Test ID | Status | Scenario / scope |
| --- | --- | --- |
| AN-001 | Pass | Listing impression event is attributable to listing — local automated |
| AN-002 | Pass | Listing detail view is counted correctly — local automated |
| AN-004 | Pass | Search event captures supported search state — local automated |
| AN-005 | Pass | Zero-result search is identified — local automated |
| AN-006 | Pass | Filter application is attributable — local automated |
| AN-007 | Pass | Store page view is attributable — local automated |
| AN-008 | Pass | Listing creation funnel start/submission/approval/rejection states reconcile — local automated |
| AN-009 | Pass | Store application funnel states reconcile — local automated |
| AN-012 | Pass | Listing CTR calculation is correct — local automated |
| AN-013 | Pass | Contact rate calculation is correct — local automated |
| AN-015 | Pass | Zero-result rate calculation is correct — local automated |
| AN-016 | Pass | No invasive fingerprinting is required for anonymous analytics — local automated |
| AN-017 | Pass | Raw event access and buyer/owner identity forgery are denied — local automated |
| AUTH-023 | Pass | Resetting to the current password gives safe specific guidance — local automated |
| DASH-008 | Pass | Page-level action notice receives focus and is scrolled into view — owner production retest |
| LIST-013 | Pass | Price accepts valid positive value — owner production retest |
| NOTIF-001 | Pass | Notification visibility, RLS and read state are owner-scoped — owner production retest |
| NOTIF-002 | Pass | Revision rejection notification leads to its reason — owner production retest |
| PHOTO-001 | Pass | Exactly 2 valid photos is accepted — local automated |
| PHOTO-002 | Pass | 1 photo is rejected — local automated |
| PHOTO-003 | Pass | Exactly 10 photos is accepted — local automated |
| PHOTO-004 | Pass | 11 photos is rejected — local automated |
| PHOTO-005 | Pass | Supported JPEG upload works — local automated |
| PHOTO-006 | Pass | Supported PNG upload works — local automated |
| PHOTO-007 | Pass | Supported WebP upload works — local automated |
| PHOTO-008 | Pass | Unsupported file type is rejected — local automated |
| PHOTO-009 | Pass | Oversized file is rejected — local automated |
| PHOTO-010 | Pass | Photo reorder changes primary image — local automated |
| PHOTO-011 | Pass | Photo replacement preserves valid listing — local automated |
| PHOTO-012 | Pass | Photo removal allowed while >=2 remain — local automated |
| PHOTO-013 | Pass | Photo removal blocked below minimum — local automated |
| PHOTO-014 | Pass | Partial upload failure is recoverable — local automated |
| PHOTO-016 | Pass | Card uses optimized responsive image rather than eager original — local automated |
| PHOTO-017 | Pass | Detail thumbnails are lazy/responsive — local automated |
| PHOTO-018 | Pass | Adding a photo amends an existing pending text revision — local automated |
| PHOTO-019 | Pass | Removing a proposed photo amends the same pending revision — local automated |
| PHOTO-020 | Pass | Replacing a proposed photo preserves the evolving proposal — local automated |
| PHOTO-021 | Pass | Repeated proposed photo reorder persists exactly — local automated |
| PHOTO-022 | Pass | Proposed primary remains private until approval — local automated |
| PHOTO-023 | Pass | Restoring approved photos removes only the photo difference — local automated |
| PHOTO-024 | Pass | Approval atomically promotes the latest combined ordered proposal — local automated |
| PHOTO-025 | Pass | Photo proposal rejection preserves live photos and private audit — local automated |
| PHOTO-026 | Pass | Verified store photo operations apply directly under current authority — local automated |
| PHOTO-027 | Pass | Relisted copy edits cannot mutate sold photo history — local automated |
| PHOTO-028 | Pass | Staged cleanup protects all live and retained historical references — local automated |
| PHOTO-029 | Pass | Photo amendment invalidates stale admin approval and rejection — local automated |
| PHOTO-030 | Pass | Mobile photo editor supports operations and visible feedback — local automated |
| PHOTO-031 | Pass | Signed photo edit retry is idempotent and recovers partial upload — local automated |
| REV-011 | Pass | Mixed immediate + moderated edit is handled consistently — owner production retest |
| REV-012 | Pass | Admin approves pending revision — owner production retest |
| REV-014 | Pass | Additional moderated edits safely amend the existing pending proposal — local automated |
| SANA-001 | Pass | Per-listing view count is displayed — local automated |
| SANA-003 | Pass | Per-listing WhatsApp contact count is displayed — local automated |
| SANA-004 | Pass | Per-listing publication date/status/sold state display correctly — local automated |
| SANA-005 | Pass | Account active-listing aggregate is correct — local automated |
| SANA-006 | Pass | Account total views aggregate is correct — local automated |
| SANA-008 | Pass | Account WhatsApp contacts aggregate is correct — local automated |
| SANA-009 | Pass | Sold listings aggregate is correct — local automated |
| SDASH-009 | Pass | Store conversion ratios use meaningful denominators — local automated |
| STORE-018 | Pass | Duplicate RUC shows an explicit private reason — owner production retest |
| WA-001 | Pass | Anonymous WhatsApp click still launches contact — local automated |
| WA-002 | Pass | Authenticated WhatsApp click launches contact and records buyer intent — local automated |
| WA-003 | Pass | Store WhatsApp event attributes store correctly — local automated |
| WA-004 | Pass | Particular WhatsApp event attributes seller correctly — local automated |
| WA-005 | Pass | Contact event records timestamp — local automated |
| WA-006 | Pass | Useful source/context can be recorded without corrupting core identity — local automated |
| WA-007 | Pass | WhatsApp message content is never recorded — local automated |

### BLOCKED — 3 relevant cases

| Test ID | Status | Scenario / scope |
| --- | --- | --- |
| LIFE-013 | Blocked | Verified-transaction/review dependency; unchanged |
| PHOTO-015 | Blocked | Actual browser close mid-upload/manual public-state inspection not executed; controlled recovery passed |
| SANA-010 | Blocked | Owner production visual no-revenue acceptance of new metrics after release |

### DEFERRED / Not Run — 10 relevant cases

TSV statuses are preserved as Not Run, not silently rewritten to Deferred.

| Test ID | Status | Scenario / scope |
| --- | --- | --- |
| AN-003 | Not Run | Sprint 5 favorites |
| AN-010 | Not Run | Sprint 6 buyer-confirmed transaction event |
| AN-011 | Not Run | Sprint 6 canonical review event |
| AN-014 | Not Run | Sprint 5 favorite rate |
| SANA-002 | Not Run | Sprint 5 per-listing favorites |
| SANA-007 | Not Run | Sprint 5 favorite aggregate |
| SDASH-008 | Not Run | Full case includes Sprint 5 favorites; implemented nonfavorite totals were exercised but cannot complete this case |
| WA-008 | Not Run | Sprint 6 verified-transaction eligible-buyer workflow |
| WA-009 | Not Run | Sprint 6 verified-transaction eligible-buyer workflow |
| WA-010 | Not Run | Sprint 6 eligible-buyer dedupe workflow |

## O. Owner manual QA after production release

Only after a separate release gate applies BOTH migrations and deploys matching source. Use real owned listings/stores, not disposable public QA pollution. No request to rerun deterministic RLS attacks, raw-log authorization or cap stress.

| Browser/manual focus | Exact Test IDs |
| --- | --- |
| Same-password recovery/security guidance | AUTH-023 |
| Add/remove/replace/reorder/primary and minimum rule | PHOTO-010, PHOTO-011, PHOTO-012, PHOTO-013, PHOTO-018, PHOTO-019, PHOTO-020, PHOTO-021, PHOTO-022 |
| Existing text proposal, repeated photo amendments and reversion | REV-014, PHOTO-018, PHOTO-019, PHOTO-020, PHOTO-021, PHOTO-023 |
| Latest combined approval/rejection and public/private presentation | PHOTO-024, PHOTO-025 |
| Verified direct edit and sold/relisted-copy visual isolation | PHOTO-026, PHOTO-027 |
| Mobile editor, focus/scroll, optimized public cards/lazy thumbnails | PHOTO-030, PHOTO-016, PHOTO-017 |
| Real browser close mid-upload, no invalid public listing | PHOTO-015 |
| Actual external WhatsApp launch, anonymous/authenticated and store/seller context | WA-001, WA-002, WA-003, WA-004 |
| Genuine browse activity and rendered ratios | AN-001, AN-002, AN-007, AN-012, AN-013, SDASH-009 |
| Particular real per-listing/summary metrics and no fabricated revenue | SANA-001, SANA-003, SANA-004, SANA-005, SANA-006, SANA-008, SANA-009, SANA-010 |

Account paths for the later retest: /mi-cuenta, /mi-cuenta/publicaciones, /mi-cuenta/publicaciones/{id}/editar, /mi-cuenta/tienda/inventario, /mi-cuenta/tienda/estadisticas?periodo=0|7|30, /mi-cuenta/seguridad. Public comparisons: /listados, /instrumentos/{slug}, /tiendas/{slug}; admin photo review at /admin. These path descriptions do not claim new production availability now.

## P. Known limitations

- Closing during upload can leave unreferenced Storage bytes; no major background collector was introduced.
- Rejected/superseded/sold/history references intentionally retain audit objects; they are not indiscriminately garbage-collected.
- Existing public initial/legacy listing and store asset URLs are not retroactively privatized; previously public optimized renditions may also remain cached. Database visibility/private new staging is not pixel revocation of already-public history.
- Best-effort browsing telemetry may be lost on transport/navigation failure. Contact remains usable when logging fails; a failed/unrecorded click cannot later be assumed eligible.
- Events are not proof of conversation/payment/delivery/product condition. Owner-marked sold inventory is not a verified transaction.
- Historic view caches cannot be decomposed into historic event windows. Ratios use recorded events only and may exceed 100%.
- Full SDASH-008, favorite analytics, eligible-buyer UI, transaction/review events, alerts/reports/email/full hub remain later-sprint work.
- Local Postgres diagnostic-hint workaround remains runtime-only; upgrade/reset guidance above. No hosted behavior was inferred from the local workaround.
- No production performance or real-inbox/real-WhatsApp manual behavior was claimed.

## Q. Production status

**No production migration applied. No Sprint 4 app deployed. No production alias changed. No hosted Supabase schema/data/configuration/template changed. No push used to trigger deployment.**
Only the two new migrations/source await the dedicated production release gate.

## R. Sprint boundary

**Sprint 5 was not started.** No favorites, alerts, transaction/review/report workflow, centralized marketplace emails, SEO/legal expansion, paid plans, checkout/payment/escrow/shipping, employee UI or SUNAT integration was introduced.
