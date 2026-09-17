# Sprint 4 production release verification

Verified 2026-09-17. Sprint 4 is deployed and automated production verification passed. This is not owner/manual acceptance. Sprint 5 was not started. The historical local gate and full implementation file list remain in [sprint-4-verification.md](sprint-4-verification.md).

## Source and coordinated release

- Application commit: `427ac8e8aa514ae10a47c0a4d2eee3dfe827ccaa` — `Implement Sprint 4 photos and marketplace analytics`.
- All 67 intended implementation files were reviewed and committed; no release-time application changes, environment files, service-role credentials, generated Supabase temp changes or historical migration rewrites were included. Secret-literal scan returned zero findings. Existing acceptance-process commits were preserved.
- Push to `origin/main` succeeded. Post-release `git ls-remote` confirmed that exact application commit. The source working tree was clean throughout deployment and production fixture-writing verification.
- Vercel deployment: `dpl_3hH4ha3CNEJwHeCVCUZJZ5WHHgPz`, READY, production, with `meta.githubCommitSha` equal to the exact application commit and branch `main`.
- Candidate: `https://mkt-instrumentos-dtzk98h47-henri-camayos-projects.vercel.app`.
- Authoritative alias API confirmed the candidate for `laria.audio`, `www.laria.audio`, `laria.pro`, `www.laria.pro`, `mkt-instrumentos.vercel.app`, `mkt-instrumentos-henri-camayos-projects.vercel.app`, and the existing main-branch alias. Existing domain redirects were preserved. The main-branch alias was explicitly aligned after promotion.
- To prevent Git auto-deployment before schema coordination, the project's ignore-build command was temporarily set to `exit 0`. The automatic Git build was confirmed canceled; a forced CLI production candidate built with production environment configuration before schema application. Both migrations were then applied in order and the READY candidate immediately promoted. The ignore-build command was restored to the empty/default setting and verified.
- Release documentation/TSV evidence is a separate local documentation-only commit, not pushed: this avoids an unnecessary production build and keeps `origin/main` and the live application source hash identical. The final handoff reports its commit hash. No uncommitted application diff is deployed.

## Migrations, compatibility and permissions

| Gate | Result |
| --- | --- |
| Only pending production migrations were the two Sprint 4 versions | PASS |
| `20260916180000_sprint_4_photos.sql` applied first | PASS |
| `20260916200000_sprint_4_events.sql` applied second | PASS |
| All 15 local/hosted migration versions synchronized afterward | PASS |
| Historical listings/photos/ownership/stores/notifications/view caches retained | PASS |
| New tables, event taxonomy, indexes and expected policies/functions present | PASS |
| Private edit bucket remains private; no ordinary global Storage-read policy | PASS |
| Raw events and direct trusted recorder denied to ordinary/anonymous callers | PASS |
| Cleanup/internal edit and old direct view-increment RPC authority restricted | PASS |
| Exact revoked-function `42501` and owner/admin `P0001` denials, not database outages | PASS |

The local `supautils#214` workaround is only a Docker cluster diagnostic-hint setting; no migration depends on it and no grants/RLS were weakened. Hosted `supautils.hint_roles` remained `anon, authenticated, service_role` before and after release. A revoked moderation RPC denied an anonymous request correctly before migration, and restricted RPCs/raw events denied callers correctly after migration. No hosted permission-hint crash was observed; no production workaround was applied. A shared-preload library need not appear as a SQL extension, so extension metadata alone was not treated as proof of a fixed version.

## Production integrations and actual browser results

Verification used isolated random-UUID `@example.invalid` accounts and exact-ID/path cleanup. Repository integration guards remain local-only; disposable authorized release harnesses in the OS temporary directory adapted target guards in memory to exactly `https://laria.audio` and the linked hosted project. No broad production cleanup, real-user mutations, auth emails to real inboxes or source changes were performed. The corrupt historical one-pixel test PNG was replaced in memory with a browser-decodable test image. Global search deltas allowed genuine concurrent production traffic; individual QA receipts/identity assertions remained exact.

| Production check | Result / evidence |
| --- | --- |
| Creation with 2 photos; edit min 2/max 10; unsupported MIME/size/duplicates/foreign or missing paths | PASS — real HTTP/Storage/DB boundary checks; 10 succeeds and 1/11 fail |
| Approved Particular/normal Tienda add/remove/replace/reorder/primary | PASS — live set unchanged while pending |
| Existing text proposal followed by repeated photo amendments | PASS automated — same combined revision, retained text, latest complete photo set; owner `REV-014` retest still required |
| Latest approval/rejection and stale approve/reject refusal | PASS — exact latest order promoted atomically; immediate price retained; rejected live set unchanged |
| Reversion | PASS — only photo difference removed, unrelated text retained, empty proposal canceled safely |
| Private staging delivery and Storage | PASS — owner/admin intended access; anonymous/unrelated/unattached and public-bucket URL attempts denied |
| Signed idempotent edits and partial-upload recovery | PASS — same receipt retry, no duplicate/version change; changed payload/owner/byte overwrite refused |
| Reference-safe cleanup and retained audit | PASS — live/sold/shared/retained-history references protected; unattached retirement/removal replay-safe; retired paths cannot reattach |
| Draft/pending/rejected/owner-hidden/admin-hidden behavior | PASS — nonpublic state and appropriate authority preserved |
| Normal/verified/revoked store editing | PASS — normal moderation; verified direct edits without revision; hidden parent blocks public media; revocation restores moderation |
| Sold/relisted-copy isolation | PASS — new listing identity, independent edits, immutable original photo order/history/shared objects |
| Actual desktop/mobile photo editor | PASS — JPEG add, WebP replacement, reorder/removal, persisted remount, success focus/scroll, admin private-byte preview, mobile menu/no overflow; zero uncaught browser errors |
| Impressions/detail/store views | PASS — offscreen card records zero; >=50% visible card records; no reentry/rerender/refresh inflation; SSR/HEAD/RSC prefetch records zero; owner/admin/nonpublic excluded |
| Rolling dedupe/session rotation and concurrent views | PASS — authenticated identity survives signed-session rotation; four simultaneous eligible view requests produce one accepted event |
| Search/filter/zero-result/pagination semantics | PASS — signed canonical supported filter/result receipts, replay dedupe, tampered or forged counts rejected; no pagination-only payload accepted as search |
| Trusted listing/store lifecycle funnels | PASS — submission/rejection/approval/sold and application/approval/verification events reconcile; repeated finalization/verification does not duplicate events |
| WhatsApp intent | PASS automated — anonymous/authenticated canonical URL, exact buyer/listing/seller/store/time/source, repeated real clicks, no message/draft content; actual browser click and failed-tracking fallback verified |
| Spoof/RLS and aggregate privacy | PASS — forged actor/ownership/lifecycle/draft/cross-origin payloads refused; raw-log/recorder access denied; Particular A/B and two actual Store A/B applications isolated both directions; no buyer directory |
| Particular analytics | PASS — seven-row owned inventory, active/views/contacts/sold totals, per-listing publication/sold metadata, preserved cache vs event windows, real/empty rendering |
| Store analytics | PASS — lifetime/7/30 metrics/ratios reconcile with controlled events; zero denominators are null/`Sin datos`; event-window shifts affect only QA rows and were restored; mobile active menu preserved |
| Password recovery | PASS automated — valid generated token-hash callback establishes usable reset session; current password yields specific safe Spanish guidance; different password succeeds/new login works/old login fails; consumed/invalid/expired tokens fail safely |
| Real recovery-email receipt/delivery and external WhatsApp app | BLOCKED for owner/manual verification — no real-inbox or conversation claim |

Photo verification was completed in two successful sets: all HTTP/DB/security/retry/state/tier phases, then targeted actual-browser/history continuation. Initial harness attempts stopped on local-versus-hosted draft-fixture setup, replacement-string SQL escaping, and an upload interaction before React's input handler was attached. Fixture cleanup succeeded after each attempt. Corrected hosted setup validates the exact temporary owner/listing/title/status, and the browser waits for actual handler readiness rather than an arbitrary delay. Final production phases passed without modifying deployed application code. No Sprint 4 product defect was identified or patched during the release gate.

Actual expiry was separately exercised by aging only one disposable QA user's recovery timestamp beyond validity after generating its recovery token. The callback safely refused it and redirected to login. The exact user/profile/events were removed; no global Auth expiry configuration was changed.

Production screenshot directories were created in the OS temporary directory (`laria-s4-photo-browser-adpxmn` and `laria-s4-analytics-browser-GFZxiB`), not committed or uploaded as marketplace assets.

## Regression, browsing and bounded logs

- Final unchanged-source local gate: 114/114 npm tests passed, lint and typecheck passed, seven SQL/RLS suites passed (Particular, store, listing lifecycle, Sprint 3.1, photos, analytics, marketplace performance), TSV validator and whitespace checks passed. Fresh deterministic clean-reset/all-15-migrations/seed/five-integration/build/cap-race proof is retained in the local report; unnecessary expensive unchanged scenarios were not duplicated.
- Exact-source remote production build passed compile, lint/types, route generation and trace collection. First-load JS: home 111 kB, catalog 119 kB, detail 120 kB, store 117 kB, Store statistics 105 kB. The historical September homepage baseline remains 110 kB.
- Read-only HTTP smoke passed `/`, `/login`, `/registro/vendedor`, `/registro/tienda`, `/listados`, `/listados?page=2`, existing legacy detail `/instrumentos/microfono-shure-sm58-usado-arequipa`, and existing store `/tiendas/casa-musical-grau`.
- Account, Particular publication and Store statistics anonymous access redirects safely to login. Existing `/admin` retains its client-auth access gate: initial HTML shows only access checking, not moderation data. Actual admin private proposal preview passed under a trusted disposable admin account.
- Existing real Storage-backed images returned optimized image bytes; actual card/detail images decoded with responsive sizing and lazy thumbnails. External historical placeholder images intentionally retain their compatibility behavior rather than being rewritten.
- Recommendation Suspense/streaming-boundary markup, stable pagination, account role isolation, mobile active navigation/no overflow and interactive photo feedback passed. One-off smoke timings are not production load benchmarks or a new latency SLO.
- Final bounded Vercel scans (`--since 30m --limit 100 --no-follow --no-branch`) returned zero error-level entries and zero 5xx entries. Actual photo/analytics/recovery browsers returned zero uncaught errors. Expected authorization/privacy 4xx tests were not mistaken for product failures. This is a bounded observation, not a claim about all historical logs.

## Final database and QA cleanup audit

| Resource | Preserved final production count |
| --- | ---: |
| Auth users / profiles | 10 / 9 |
| Stores / listings / legacy unowned listings | 5 / 36 / 33 |
| Listing photos / revisions / revision photos | 62 / 1 / 0 |
| Notifications | 3 |
| Historical summed `view_count` | 2643 |
| Existing listing/store Storage objects | 42 / 2 |
| New private edit Storage objects | 0 |
| Marketplace events / edit receipts / cleanup claims | 0 / 0 / 0 |
| Temporary QA users/profiles/stores/listings/revisions/photos/events/notifications/Storage | 0 |

Original records and shared/historical bytes were preserved. No synthetic historical events were generated. Every integration's exact fixture cleanup and an independent hosted count audit completed; no intentional QA events were left behind.

## Acceptance evidence only

Production automated evidence was appended to the following 60 already-Pass rows. No status, Test ID, requirement, expected result, step, ownership or unrelated evidence was changed; owner production evidence was preserved.

| Evidence block | Exact Test IDs |
| --- | --- |
| Photos | PHOTO-001, PHOTO-002, PHOTO-003, PHOTO-004, PHOTO-005, PHOTO-006, PHOTO-007, PHOTO-008, PHOTO-009, PHOTO-010, PHOTO-011, PHOTO-012, PHOTO-013, PHOTO-014, PHOTO-016, PHOTO-017, PHOTO-018, PHOTO-019, PHOTO-020, PHOTO-021, PHOTO-022, PHOTO-023, PHOTO-024, PHOTO-025, PHOTO-026, PHOTO-027, PHOTO-028, PHOTO-029, PHOTO-030, PHOTO-031 |
| Revision | REV-014 |
| Contact | WA-001, WA-002, WA-003, WA-004, WA-005, WA-006, WA-007 |
| Events/analytics | AN-001, AN-002, AN-004, AN-005, AN-006, AN-007, AN-008, AN-009, AN-012, AN-013, AN-015, AN-016, AN-017 |
| Particular metrics | SANA-001, SANA-003, SANA-004, SANA-005, SANA-006, SANA-008, SANA-009 |
| Store ratios | SDASH-009 |
| Recovery guidance | AUTH-023 |

Final canonical registry: **373 cases — 179 Pass, 0 Fail, 3 Blocked, 191 Not Run**. Blocked rows remain exactly `PHOTO-015`, `SANA-010`, `LIFE-013`; the latter awaits Sprint 6. Full `SDASH-008` and favorite-dependent/transaction/review cases remain incomplete/deferred, not passed by scaffolding. No XLSX was read or generated.

Post-evidence verification: `python3 -B acceptance/validate.py`, TSV-only registry tests and `git diff --check`; a field-by-field comparison to the application commit verifies exactly those 60 evidence fields changed, with the Test ID set/status counts/all other acceptance content unchanged.

## Exact remaining owner/manual QA

| IDs | Required owner action / production entry point |
| --- | --- |
| REV-014 | On your approved listing, create pending title/condition, add/save a photo, amend/reorder/remove/replace/save; verify one combined proposal, old anonymous public set, latest admin preview and exact latest promotion. Start at `https://laria.audio/mi-cuenta/publicaciones`, edit your listing, moderate at `https://laria.audio/admin`. |
| PHOTO-015 | Actually close during upload before finalization; inspect public state at `https://laria.audio/listados`. The exact row requires no finalized/public invalid listing and explicitly permits the known orphan-storage limitation; guaranteed orphan collection is not a condition of PASS. |
| SANA-010 | Visually inspect `https://laria.audio/mi-cuenta`, publications and `https://laria.audio/mi-cuenta/tienda/estadisticas?periodo=30`: no invented revenue/GMV, no implication of verified paid sales. |
| AUTH-023 | Request and receive a real email at `https://laria.audio/recuperar-contrasena`; test same-password guidance, then a different password and login. Production automation used generated tokens, not inbox delivery. |
| WA-001, WA-002, WA-003, WA-004 | Actual external WhatsApp app/web launch anonymously and authenticated, for Particular/store contacts on your public detail/store page. Canonical URLs/events/failure fallback were automated; conversations were not. |

Desktop/mobile account navigation, metrics reconciliation, visible image activity and optimized rendering already have deterministic production browser evidence; no unnecessary manual RLS/cap stress request is included. Temporary QA users/slugs are deleted: use real owned content for manual acceptance.

## Known limitations and exclusions

- Browser abandonment can leave unreferenced upload bytes; no scheduled orphan collector was added. Retained audit/sold/shared references are intentional, not garbage to delete indiscriminately.
- Existing public initial/legacy URLs and already-public optimized caches are not retroactively revoked. New private staging and current database visibility are enforced.
- Best-effort telemetry can be lost on transport/navigation failure; contact navigation remains usable. An unrecorded intent is not future transaction eligibility, and recorded events are not proof of conversation/payment/delivery/product condition.
- Historical view caches are preserved but cannot be decomposed into historical event windows. Recorded-event ratios may exceed 100%; zero denominators are `Sin datos`.
- Real-inbox recovery delivery, external WhatsApp launch and explicit owner acceptance remain manual as listed above. No Supabase hosted Auth templates or redirect formats changed in Sprint 4.
- The local permission-hint workaround remains diagnostic-only; it was not applied to hosted production.
- Favorites, alerts, verified transactions/reviews, reports, centralized marketplace email, full admin analytics/moderation hub and other later-sprint features remain absent. **Sprint 5 was not started.**

Release follow-up files: `acceptance/cases.tsv` evidence and implementation-state updates in `docs/functional-spec.md`, `docs/context.md`, `docs/architecture.md`, `docs/database.md`, `docs/features.md`, `docs/owner-manual.md`, `docs/performance.md`, `docs/sprint-4-verification.md`, and this report. Frozen product requirements were not modified.
