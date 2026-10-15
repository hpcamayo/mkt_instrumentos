# UX-4–UX-8 closure review — 14 October 2026

**State: U10/U15/U18 published with owner approval; read-only production gate PASS. Owner/manual acceptance remains pending.** This is an observation and review package, not owner acceptance. No canonical acceptance status or functional-spec wording was changed.

## Production publication — 14 October 2026

Henri explicitly answered **“Publicar el parche”** after reviewing the implementation and local proof. A normal fast-forward moved `main` from `4e5ba95` to **`7a50f060fd73306ca26ebf8123125ab7556cc190`**. Vercel automatically built **`dpl_EdziuxY3chGeioMEvumzN7d1bk6c`**, READY; the Git metadata names that exact SHA, repo and `main` branch. `laria.audio`, `www.laria.audio`, `laria.pro` and `www.laria.pro` all resolved to it. The pre-push rollback target was `dpl_D1FaMpnG81unBp1CjhAosE5UzbqV` (`4e5ba95`). No rollback was needed.

**Decision: PASS for the read-only production gate; keep live.** U10/U15/U18 are shipped. Formal owner acceptance and manual checks remain open; authenticated/write-flow proof is local only. No production session, form submission, publishing, favorite, alert, report, Admin action or WhatsApp navigation occurred.

| Check | Result | Production evidence |
| --- | --- | --- |
| 13. Migration synchronization | Pass | 45/45 through `20261022120000`; this patch applies no migration |
| 14. Categories/data | Pass | Privileged GET-only PostgREST exact counts; identical to the last verified snapshot. Listings 55 → 55, revisions 2 → 2, live alerts 2 → 2; no retired values |
| 15. Rendered SEO | Pass; Admin waived | CLI exit 0; both crawlers, seven populated and three empty categories, public sold listing, structured data. Only `admin-records` waived for the absent Admin session. The first invocation lacked the required sold-listing argument; it was corrected and rerun with the existing public URL |
| 16. Pages/layout | Pass | 46/46 navigations at 390/1440; 42 HTML visits with one main/h1, Spanish UI, no overflow, broken completed image, page error, unexpected console error or failed application GET. Ten required screenshots inspected |
| 17. Legacy URLs/sitemap | Pass | Exact permanent redirects, legacy filtered catalog noindex, all ten new sitemap landings and no retired landing; 21 HTTP checks across browser/Googlebot/Bingbot user agents |
| 18. Navigation | Pass | Ten panels at both widths, phone category menu, one row at 1280 including Teclados; desktop home tiles two rows of five |
| 19. Listing hydration | Pass | Ten fresh contexts, zero React #418 or other page errors |
| 20. Signed-out guards | Pass | Account, publish and Admin end at login; no 500 |
| 21. WhatsApp | Pass | Listing/store anchors use wa.me with Spanish text naming the rendered listing/store; never clicked |
| 22. Runtime health | Pass, bounded window | 2026-10-15 00:42:40Z–00:46:25Z: 50 returned records, separate error/fatal/5xx queries each zero |
| Signup hydration | Pass | 20 fresh contexts / 100 full-document visits at 390/1440, normal/delayed account and JavaScript timing; zero page errors |
| Production writes | None | 80 attempted `POST /api/events/session` calls aborted before leaving the browser; zero completed non-GET/HEAD requests |

The comparison above uses the last verified pre-patch release snapshot (2026-10-14 19:12:30Z) and the new GET-only snapshot (2026-10-15 00:42:25Z); it is not an atomic database snapshot around the push. Both contain: guitars 20, basses 3, percussion 11, pedals 5, amplifiers 6, microphones 5, audio 5; keyboards/winds/strings zero. Both revisions retain null category. Alerts are one basses and one percussion. No duplicate alert was deleted by this patch. The original migration's 54-listing snapshot and the intervening owner activity remain in the prior release record.

Sample response times (390 / 1440): home 1576 / 1355 ms, catalog 621 / 600 ms, Percusión 516 / 509 ms. These are sampled navigation times, not field Core Web Vitals. Existing seller-supplied test text, mismatched photos and placeholders remain untouched.

Production-changing actions in order: **(1)** authorized `git push origin 7a50f06:main`, triggering the automatic application deployment; **(2)** a later docs-only fast-forward publishes this record and current release boundaries, triggering the same application code again. That final deployment SHA/ID and final GET checks are verified in the handoff, avoiding a recursive documentation deployment. No production setting, environment variable, auth/email/cron configuration, catalog table or data was changed, and no production SQL write was executed. All acceptance TSV and XLSX files remain untouched.

Raw evidence: `/private/tmp/laria-ux-closure-release-7a50f06/` (not committed). Local U10/U15/U18 proof remains below.

## Implementation and local verification boundary

- Pre-follow-up verified production release: `4e5ba95c249a784f7b80eccc2c55c2b31a4ddd0e`, deployment `dpl_D1FaMpnG81unBp1CjhAosE5UzbqV`. Its read-only release gate passed; the signup hydration and redirect failures are closed. See `../ux-4-8-production-release-gate.md`.
- This follow-up starts from that commit. The implementation and corrections below shipped as `7a50f06`, verified above.
- A separate local Supabase project, `laria_ux8_closure`, runs on API `127.0.0.1:55421` and DB port `55422`; the compiled app runs at `http://localhost:3108`. It has all 45 committed migrations and marketplace seed fixtures. No catalog build, loader or catalog data was used.
- Local catalog tables contain no loaded catalog; this audit does not re-prove production brand-list contents. The already-passed release gate covers that surface.
- The pre-existing local stack on ports 54321/54322 was at 44 migrations. It was not upgraded or reset. The photo suite's initial hard-coded container selection failed to prepare its draft fixture in the isolated stack; the harness now accepts an explicit container and fails unless the exact fixture exists and is updated.
- During the implementation/local-verification phase, production requests, data writes, deployments, settings changes and GitHub pushes were **none**; subsequent authorized publication is recorded above. Auth, storage and marketplace mutations below occurred only in the isolated local stack. No external email provider credentials were configured.

## Owner-authorized implementation

Henri answered **“Implementar ambos ahora”** for U10/U15 and **“Implementar U18 ahora”** for U18. These answers supersede the overnight deferrals in the briefs; Henri subsequently authorized publication separately, recorded above. Neither decision implies formal owner acceptance.

| Item | Implemented locally | Preserved boundary |
| --- | --- | --- |
| U10 — listing edit | Field errors, linked summary focused on failed submit, error clearing on field changes and an accessible photo-error destination | Existing photo attempts/retry/cleanup, 2–10 photos, immediate price/description/location versus moderated identity fields, expected revision version |
| U15 — onboarding | Sign-in, Particular/store signup, profile, invitations, password recovery/update and store applications share field errors and summaries. Duplicate email, RUC and same-password feedback attach to the relevant field | Existing auth/API calls, role separation, validation and optional media. Signup still permits six characters; password updates require eight |
| U18 — Admin | At ≥1280 px: pending list plus one selected detail; below: list → detail → return with focus. Four-checkbox guide, current-page previous/next and decision footer | Six existing queues and bounded payloads; no extra reads. The guide is temporary, resets with a different record/payload and never becomes an approval requirement. Existing reasons, confirmations and RPC/version checks remain |

The Verification queue is deliberately empty in the committed database function: no canonical verification-request state exists. Verification/revocation still lives under Tiendas. This follow-up keeps that rule. Reported-review details were tested with real local paired reviews and reports; no fabricated public review or verification request was introduced.

## Findings corrected locally

| Finding | Reproduction | Correction | Verification |
| --- | --- | --- | --- |
| UX8-A11Y-01: revision comparison could not receive keyboard focus | `/admin/revisiones`, 390 px; axe `scrollable-region-focusable` | Named, focusable region around the existing comparison table, with the global visible outline | Axe clean, 2 px focus outline and real horizontal scroll from arrow keys; Chromium, Firefox and WebKit |
| UX8-A11Y-02: confirmation Tab escaped to browser chrome | Open `Ocultar`, start on `Cancelar`, Tab through both buttons; also reproduced at 1440 px | Explicit forward/backward focus loop over visible enabled controls, retaining native modal semantics, Escape and the existing focus restoration | 16 Tab/Shift+Tab presses per confirmation, Escape and restored opener focus; all three engines at both widths |
| Duplicate RUC update was reduced to a generic notice | Supabase returns a plain PostgREST error object when an existing store is updated | Recognize both Error exceptions and plain objects; retain generic handling for unknown errors | Regression test plus real duplicate-RUC browser update on the final build; summary focuses and names RUC |
| Integration harness expected retired UI copy | Publication/lifecycle suites still expected `Solicitud pendiente`, `requiere moderación`, `0 listados activos` and `Vendido` | Assert the approved `En revisión`, current moderation/visibility sentence, `0 publicaciones` and `Vendida` | Both integration suites pass; data-state, ownership, cap and no-contact checks remain |

The browser regression uses keyboard activation of the opener. The initial headless WebKit mouse-activation check did not restore focus to the clicked opener; the keyboard regression now activates the focused opener with Enter. Native Safari mouse-focus behavior remains a manual review item, not an inferred pass. In this headless WebKit run, a minimal HTML reproduction also activated the scroll container on the first arrow and scrolled on the second; the regression requires actual movement after two arrows in every engine. Evidence is retained rather than treating these harness differences as product waivers.

## Verification of U10/U15/U18

Raw follow-up evidence: `/private/tmp/laria-ux-implementation/` (not committed). Logs and screenshots contain no test passwords or environment credentials. The browser fixtures use local placeholder photos.

| Check | Result | Evidence / limit |
| --- | --- | --- |
| Lint, typecheck, unit tests, production build | Pass | `lint-complete.log`, `typecheck-complete.log`, `tests-final-359.log`: **359/359**; `build-final.log`, using only local Supabase |
| Chromium field validation and Admin | Pass | `forms-admin.json`: **66 checks**, **73 page/state scans**, zero page errors, zero axe violations and no page overflow. Invalid forms send no workflow request; summary/field focus, described errors and clearing checked |
| Real browser → API → local DB | Pass | Signup for both roles with six-character passwords; invitation/profile save; optional-media-free store request remains pending; immediate price versus moderated title; approve with unchecked guide, reject with reason; stale revision blocked, refresh resets guide and current version approves |
| Admin responsive behavior | Pass | All six queues at 320/390/768/1280/1440; master/detail, next record, checklist reset and return focus. Four populated queues plus two truthful empty queues during this run |
| Reported review detail and action | Pass | `reported-reviews.json`: actual paired transaction reviews and reports, 390/1440; next/reset behavior and browser hide persisted. Two temporary users, transaction/listing, two reviews and reports removed |
| Firefox and WebKit | Pass, headless | Repeatable `scripts/ux-form-admin-smoke.cjs`; **72 checks / 80 scans**, zero page errors, axe violations or overflow; evidence copied to `forms-cross-browser-final/`. This script blocks browser non-GET/HEAD requests after explicit local login |
| Provider field errors | Pass | `provider-errors-final.log` and `provider-errors.json`: same password and duplicate RUC both inline on final build; temporary account/store removed |
| Hydration regression | Pass | `hydration.log`: **20/20 new contexts**, five full-document visits each at 390/1440, including instant/delayed account state and delayed JavaScript. Zero page errors. The later RUC-error-only change does not alter the anonymous shell |
| Eight integration suites | Pass | `integration-results.json`: photos, submissions, listing-lifecycle, analytics, favorites, alerts, transactions, sprint-8-admin-reports. Exact local fixture cleanup; submissions rerun after the RUC presentation correction |
| Final keyboard regression | Pass | `keyboard-final.log`: all three engines × two widths × confirmation/revision. Each page explicitly foregrounded before keyboard input |
| Acceptance registry | Valid, unchanged | `python3 -B acceptance/validate.py`: 403 valid cases. No row marked by this task |
| Production authenticated/write QA | Not run | Production was untouched; N16 remains open |
| Owner/manual acceptance | Pending | Agent observations do not mark an owner review Pass |

Seven new screenshots were visually inspected: Particular signup errors at 390, store errors at 1440, listing-edit errors at 390, Admin publications/revisions at 390 and publications/stores at 1440. Additional reported-review screenshots are retained. The pictures use local placeholder media.

Earlier harness failures were corrected without weakening product assertions: use existing field names, target the validation form rather than account logout forms, and wait for the scheduled focus callback. One headless WebKit keyboard-scroll attempt did not move; its isolated repetition passed. The final run foregrounds each page before keyboard input and retains both the earlier failure and final evidence. Native Safari, including mouse-focus behavior, still requires manual review.

## Initial closure baseline (before the U10/U15/U18 expansion)

Raw local evidence: `/private/tmp/laria-ux8-closure/` (not committed). This directory contains the scripts, browser reports, logs, fixture manifest and 34 screenshots. Test credentials remain only in the ignored `.ux-accounts.local.json` and local environment files.

| Check | Result | Evidence / limit |
| --- | --- | --- |
| Lint, typecheck, unit tests, production build | Pass | `final-checks.json`; 355/355 unit tests; build uses only the isolated local database |
| Photo lifecycle integration | Pass | `photos-integration-retest.log`; real private uploads, amendment, stale decisions, privacy, direct/normal-store paths, sold/relist and zero test residue |
| Seven additional integration suites | Pass | `integration-results.json`: submissions, listing-lifecycle, analytics, favorites, alerts, transactions, sprint-8-admin-reports; each suite cleans its fixtures |
| HTML/a11y/skip link/frame/layout baseline | Pass after correction | 31 templates × 390/1440 = 62 visits; 61 initial passes, one Admin revision failure; affected pages passed in `audit-retest.json`. One main/h1, Spanish language, no page errors, no page overflow or completed broken images |
| Harness baseline refresh | Pass, captured | Exact routes/actions loaded from `scripts/ux-snapshots.cjs` using a temporary Playwright adapter: 160 screenshots across all four visitors at 390/768/1280/1440, 4 controls correctly inapplicable at their widths, 0 page/layout/broken-image failures. Ignored `.ux-snapshots/ux8-closure-baseline/`; `baseline-refresh.json` |
| Reflow | Pass, bounded | 39 checks at 320/360/640 CSS px, covering public, account, selling/editing, store and Admin templates. This is automated reflow, not a manual 200–400% browser-zoom or assistive-technology pass |
| Firefox and WebKit templates | Pass, bounded | 26 visits across public, Particular, store and Admin; both engines headless. This is not native Safari or a real phone |
| Modal / validation / lightbox interactions | Pass | 12 affected-build interaction checks: empty-submit sends no submission, summary focus/links, dialog Tab/Escape and lightbox arrow/Escape, alert cancellation; axe clean |
| Persistent keyboard regression | Pass | `scripts/ux-closure-keyboard-smoke.cjs`: 12 cases, 3 engines × 2 widths × confirmation/revision. Final artifacts copied to the raw-evidence directory |
| Browser → API → local DB flows | Pass | `flows.json`, 9 checks: Particular publication pending, verified-store publication approved, 3 photos each, all upload-progress messages, one finalization each, fresh form, hide/restore, alert pause/resume/delete, revoke/verify and table scrolling |
| Performance | Local measurements only | `performance.json`: 8 cold browser contexts, LCP 56–136 ms, CLS 0, TTFB 28–86 ms on localhost. No field CWV, real-device network/CPU or INP claim |
| Production authenticated/write QA | Not run | The release's read-only boundary is unchanged; N16 remains open |
| Owner/manual acceptance | Pending | This package records agent observations only |

## Owner review — Correct / Wrong / Follow-up

Use the local build and screenshots. A check below remains pending until Henri records an answer; no box is inferred from automation.

| ID | Review | Local observation | Owner answer |
| --- | --- | --- | --- |
| R01 | UX-4 listing hierarchy, photo gallery and phone contact bar | Listing screenshots at 390/1440; gallery arrows/Escape and one contact module verified | Pending |
| R02 | UX-4 seller/store identity, trust wording and public information | Store/listing screenshots; no guarantee or Laria-managed payment/delivery claim added | Pending |
| R03 | UX-4 sold listing has clear history and no WhatsApp contact action | Lifecycle/photo integrations pass | Pending |
| R04 | UX-5 photos-first numbered form and Spanish category/type/condition labels | Publishing screenshots; Percusión / Baterías persisted correctly | Pending |
| R05 | UX-5 create/edit error summary, field focus and upload/confirmation copy | U10 edit errors, invalid-submit no-write and immediate/moderated save verified; create and upload evidence retained | Pending |
| R06 | UX-5 editing and review preserve the public approved version | Photo/lifecycle integrations pass; edit screenshots available | Pending |
| R07 | UX-6 onboarding errors, inventory cards and account hierarchy | U15 forms, valid signup/profile/invitation/store request and provider errors verified locally; inventory evidence retained | Pending |
| R08 | UX-6 confirmations start safely, retain keyboard focus and cancel/return correctly | Three-engine keyboard regression passes | Pending |
| R09 | UX-6 alert controls and hide/restore communicate the persisted result | Actual local browser actions pass | Pending |
| R10 | UX-7 master-detail, checklist, decision footer and comparison | U18 responsive/focus behavior, reasons, selected-record decisions and stale revisions verified locally | Pending |
| R11 | UX-7 verification consequence appears before mutation | Opening confirmation does not mutate; explicit confirm revokes/verifies in local DB | Pending |
| R12 | UX-7 Lima dates and visible identifiers | Existing source/unit evidence plus rendered Admin screenshots | Pending |
| R13 | UX-8 real Safari/Firefox, real iPhone/Android and touch behavior | Headless engines supplement, not replace, the manual pass | Pending |
| R14 | UX-8 VoiceOver/TalkBack/NVDA, keyboard and actual 200–400% zoom | Automated axe/keyboard/reflow complete; real assistive technology remains | Pending |
| R15 | UX-8 performance and legal language | Local measurements available; field CWV and owner/legal reading remain | Pending |

Ten selected screenshots were visually inspected for hierarchy, Spanish UI copy, controls and mobile/desktop layout; this is agent review, not owner acceptance. Populated store inventory also passed axe and overflow checks at 390/1440 (`filled-inventory.json`).

Selected screenshots: `screenshots/particular-publicar-390.png`, `particular-editar-1440.png`, `particular-publicaciones-390.png`, `store-inventario-filled-1440.png`, `admin-revisiones-390.png`, `confirm-hide-390.png`, `published-particular-390.png`, `published-store-390.png`, `admin-confirm-false-390.png` and `admin-confirm-true-390.png` under the raw-evidence directory. Images use explicitly local placeholder photo fixtures, not real instrument photos.

## Decisions and closure checks still needed

| ID | Current implementation | Closure proposal, not an owner decision |
| --- | --- | --- |
| U16/U17 | Summary is not a to-do list; favorites keep their availability-aware card | Confirm these existing choices at UX-6 review |
| N16 | UX-5–UX-7 write-flow proof is local only | Owner decides the standing production-test-account policy; no production account is created here |

U10/U15/U18 scope decisions are resolved and implemented above. Henri separately authorized and completed publication; the read-only production result is above. Formal UX acceptance, U16/U17 and the manual checks remain open.

## Acceptance and launch follow-ups

- Re-run and reconcile the exact UX-4–UX-7 row groups in `ux-8-coherence.md`; category follow-ups are SEO-001–007, PUB-011/PUB-012, LIST-* and ALERT-* (`category-restructure.md`). This bounded run is not proof of every row or owner/manual Pass.
- `acceptance/cases.tsv`, `docs/functional-spec.md` and all XLSX remain untouched. Owner wording still needs category examples, labels and confirmation-text reconciliation.
- Real devices, screen readers, native Safari mouse-focus behavior, actual zoom, field CWV and the external review listed in UX-8 remain separate closure checks. The full local screenshot baseline has been generated; only the selected screenshots received visual inspection.
- Email scheduling/deliverability, natural ALERT-005, Search Console and owner SEO/legal checks remain in `../go-live-checklist.md`.
- The catalog category-metadata / PR #3 follow-up remains separate; no catalog work ships here.

## Reproduce the keyboard regression

Against a local compiled production build with the documented local accounts, an owned approved listing and a pending revision:

```sh
LARIA_PLAYWRIGHT_MODULE=<installed-playwright-module> \
LARIA_AXE_PATH=<axe-core-4.11.0/axe.min.js> \
LARIA_UX_BROWSERS=chromium,firefox,webkit \
node scripts/ux-closure-keyboard-smoke.cjs http://localhost:3108

LARIA_PLAYWRIGHT_MODULE=<installed-playwright-module> \
LARIA_AXE_PATH=<axe-core-4.11.0/axe.min.js> \
LARIA_UX_BROWSERS=chromium,firefox,webkit \
node scripts/ux-form-admin-smoke.cjs http://localhost:3108

LARIA_TEST_DB_CONTAINER=supabase_db_laria_ux8_closure \
node tests/photos.integration.cjs http://localhost:3108
```

The keyboard script refuses non-local app and database URLs, permits only browser GET/HEAD requests after an explicit local login, opens/cancels confirmations and never confirms a mutation. Fixture setup and the separate browser write-flow proof are local-only and preserved in the raw-evidence directory.

## Changed files

- Listing edit, auth/onboarding/profile/password/store form components; new `components/use-form-errors.tsx`, `lib/form-validation.ts` and updated `components/ui/error-summary.tsx`: U10/U15 and RUC error presentation.
- `components/admin-workbench.tsx`, `components/ui/confirm-dialog.tsx`: U18 and the two accessibility corrections.
- `scripts/ux-closure-keyboard-smoke.cjs`, `scripts/ux-form-admin-smoke.cjs`: persistent local-only cross-browser regressions.
- `tests/ux-form-validation.test.cjs`, `tests/password-reset.test.cjs`: validation-boundary, guide, provider-error and password-harness regression coverage.
- `tests/photos.integration.cjs`, `tests/submissions.integration.cjs`, `tests/listing-lifecycle.integration.cjs`: isolated-container selection and current UX wording assertions.
- `docs/design-system.md`, UX-5/6/7 briefs and `decisions.md`: owner-authorized interaction rules and scope.
- `docs/ux-redesign/README.md`, `roadmap.md`, `ux-4a-acceptance.md`, `ux-4b-acceptance.md`, `ux-5-acceptance.md`, `ux-6-acceptance.md`, `ux-7-acceptance.md`, `ux-8-coherence.md` and this review package: current release/local evidence boundary and owner checklist.

## Decision

U10/U15/U18 and the accessibility corrections are published with Henri's explicit approval. **Read-only production gate PASS; keep live. UX-4–UX-8 are not marked formally accepted.** Authenticated/write flows remain proven locally only, and the owner/manual checks above still apply.
