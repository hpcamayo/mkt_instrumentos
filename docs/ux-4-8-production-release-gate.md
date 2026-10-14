# Laria UX-4–UX-8 production release gate

**2026-10-13 (America/Lima): FIX-FORWARD; keep the site live.** Henri authorized the coordinated release with “go” after the pre-flight checkpoint. A sitemap correction was then explicitly authorized. One intermittent React #418 on the public store-signup page remains open; this gate is not Pass.

## Release identity and boundaries

- Requested source: `ux/redesign` at `b37aaddc8f7858de9cf45e982c5668261f69f687`, containing PR #2. At the start, remote `main` was exactly `568b07af4229be3c52c379966cb897692909a81a`; the release was 13 commits ahead and a plain fast-forward. GitHub marked PR #1 merged without title/body edits.
- Coordinated production deployment: `dpl_F45gEzgKRCg6vPEXsGhUgtkYbrRx`, READY, source `b37aadd`. All four public domains were confirmed against it immediately after promotion.
- Migration: `20261022120000_marketplace_categories.sql`. Hosted project `hswkjandadscduodejig` moved from 44 applied migrations through `20261021120000` to **45/45 synchronized**. The dry-run listed only this migration. No down migration or manual production SQL was run.
- Owner-authorized fix-forward: `4b6b2edd4a24b03af8f60d8e470b91438e1ae147`, deployment `dpl_AE97HP37zxYdc1Z9gUx14XsFUsRT`. It adds all ten category URLs to the sitemap even without inventory; empty pages retain `noindex` until inventory exists. The matching SEO harness distinguishes empty pages from their rendered metadata/ItemList instead of sitemap membership. READY and exact SHA were reverified through all four public domains; the live sitemap contains all ten categories, no retired landing, and the updated SEO smoke exits 0 with only the Admin-session waiver.
- Pre-release rollback target: `dpl_H777E1P45pMVrrNBYkfrGZ3LuZS5`, source `568b07af4229be3c52c379966cb897692909a81a`. No rollback was performed. The database stays migrated if an app rollback is ever required.
- PR #3 (Jev/autofill), PR #4 (catalog audit), catalog builds/loaders/extracts and catalog-table changes were excluded. Production retains the previously loaded reduced catalog (20,386 products / 170 brands); this gate did not reload or query catalog tables directly.
- No hosted environment variables, cron, Auth settings or email templates changed. Neither seed.sql nor db reset nor any loader was run. No force-push occurred.

## Pre-flight

Fresh managed worktree at the exact source, clean before and after checks. The Supabase diff contained only the categories migration and `seed.sql`. Frozen install, lint, typecheck, **355/355 tests**, production build, canonical TSV validation (**403 cases**) and `git diff --check 568b07a b37aadd` passed. Builds/tests used no database: only `.env.example` existed in the worktree, and `env -i` excluded production credentials. The sitemap correction separately passed lint, typecheck, **355/355 tests**, build without a DB and diff-check.

Baseline GETs before release: `/` 200 / 1.648 s; `/listados` 200 / 1.109 s; `/instrumentos/guitarras` 200 / 0.739 s; `/instrumentos/baterias` 200 / 0.706 s.

## Before/after data

Existing project service-role access was used only for GETs to PostgREST with `Prefer: count=exact`. Counts include every status, rather than only approved public inventory. No credentials were copied into the build environment. Revisions with null category remain null.

| Category | Listings before → after | Revisions before → after | Live alerts before → after |
| --- | ---: | ---: | ---: |
| guitars | 19 → 19 | 0 → 0 | 0 → 0 |
| basses | 3 → 3 | 0 → 0 | 1 → 1 |
| drums | 9 → 0 | 0 → 0 | 1 → 0 |
| cymbals | 2 → 0 | 0 → 0 | 0 → 0 |
| percussion | 0 → 11 | 0 → 0 | 0 → 1 |
| keyboards | 0 → 0 | 0 → 0 | 0 → 0 |
| winds | 0 → 0 | 0 → 0 | 0 → 0 |
| strings | 0 → 0 | 0 → 0 | 0 → 0 |
| pedals | 5 → 5 | 0 → 0 | 0 → 0 |
| amplifiers | 6 → 6 | 0 → 0 | 0 → 0 |
| microphones | 5 → 5 | 0 → 0 | 0 → 0 |
| audio interfaces | 5 → 0 | 0 → 0 | 0 → 0 |
| audio | 0 → 5 | 0 → 0 | 0 → 0 |
| (null) | 0 → 0 | 2 → 2 | 0 → 0 |
| **Total** | **54 → 54** | **2 → 2** | **2 → 2** |

**Zero** rows retain `drums`, `cymbals` or `audio interfaces` in listings, revisions or saved alerts (including deleted alerts). Percussion listings are 9 drums + 2 cymbals = **11**; Audio listings are **5**. Every other category is unchanged. **Zero duplicate alerts were deleted**; both alerts remain live.

## Read-only production smoke

| Step | Result | Evidence and limits |
| --- | --- | --- |
| 13. Migration synchronization | **Pass** | 45 local/remote versions match through `20261022120000`. |
| 14. Data migration | **Pass** | Exact all-status counts above; zero retired values; unchanged totals; zero duplicate alert deletions. |
| 15. Rendered SEO | **Pass; Admin waived** | Original release and sitemap correction: CLI exit 0, Googlebot/Bingbot metadata, robots, pagination, aliases, filtered catalog, 7 populated / 3 empty categories, public sold listing, JSON-LD. Only `admin-records` waived because this gate has no Admin session. Sold and empty-category surfaces were exercised, not waived. |
| 16. Pages, layout and runtime | **Fail — intermittent signup hydration** | 46/46 navigations returned 200 at 390 and 1440 px; all 42 HTML visits had exactly one main and H1, Spanish interface copy, no overflow, no completed broken image, no unexpected console error and no failed application GET. One mobile `/registro/tienda` visit raised React #418. Ten additional fresh-context signup trials (five direct, five after seller signup) returned 200 without page errors; the original failure remains open. Ten required screenshots were visually inspected. |
| 17. Legacy URLs and sitemap | **Pass after authorized fix-forward** | All three old landings returned exact 308 destinations. Legacy `category=drums` rendered Percusión / Baterías with noindex. No old landing appeared in sitemap. Initial sitemap omitted the three empty categories; Henri rejected a waiver and authorized including all ten. Live 4b6b2ed now submits all ten category URLs, none of the three retired URLs; updated SEO exits 0 and verifies the three empty categories remain noindex. |
| 18. Navigation | **Pass** | Ten panels opened at 1440 and 390 px; each exposed catalog brands (8 desktop / 5 phone). Home phone menu reached all ten landings. At 1280 px, the strip measured clientWidth=scrollWidth=1280, one row, with Teclados. Home tiles measured two rows of five. |
| 19. Listing React #418 | **Pass** | Same fresh approved Particular listing in ten new contexts: 0/10 React #418 and no page error. This does not waive the separate signup error. |
| 20. Signed-out guards | **Pass** | `/mi-cuenta`, `/publicar` (through `/vender`) and `/admin` redirected to `/login?next=…`; final pages returned 200, no 500. |
| 21. WhatsApp | **Pass** | Listing/store anchors used wa.me and Spanish messages naming Test 44422 / Casa Musical Grau, checked at both widths. Links were never opened. |
| 22. Runtime health | **Pass for queried window** | Deployment `dpl_F45gEzgKRCg6vPEXsGhUgtkYbrRx`, 2026-10-13T23:49:30Z–2026-10-14T00:05:00Z: 50 returned request-log records, zero error/fatal matches and zero 5xx matches in separate bounded queries. The browser-only hydration error is still recorded above. |

Routes at both widths: `/`, `/listados`, `/instrumentos/{guitarras,bajos,teclados,percusion,vientos,cuerdas,pedales,amplificadores,microfonos,audio}`, the approved listing and store below, `/login`, `/registro/vendedor`, `/registro/tienda`, `/terminos`, `/privacidad`, `/articulos-prohibidos`, `/consejos-de-seguridad`, `/robots.txt`, `/sitemap.xml`. Main/H1/overflow checks apply to HTML, not browser-native text/XML viewers.

- Approved Particular listing: `/instrumentos/test-444-0146bca8-6ff9-4f35-85da-f8c15ccbb737`.
- Store: `/tiendas/casa-musical-grau`.
- Public sold listing: `/instrumentos/cort-555-ce71d959-27cd-49d1-9980-1f31c79535ae-republicado-80dd4abf-republicado-3c490006-republicado-da328802`.

| Sampled route | 390 px response | 1440 px response |
| --- | ---: | ---: |
| `/` | 1080 ms | 996 ms |
| `/listados` | 604 ms | 529 ms |
| `/instrumentos/percusion` | 520 ms | 586 ms |
| `/instrumentos/test-444-0146bca8-6ff9-4f35-85da-f8c15ccbb737` | 904 ms | 676 ms |
| `/tiendas/casa-musical-grau` | 790 ms | 557 ms |

The first harness stopped on an ambiguous mobile link selector; it also initially treated normal canceled Next.js prefetches and unrequested offscreen lazy images as failures. Those harness expectations were corrected and the complete smoke rerun. The retained diagnostic confirms `next-router-prefetch: 1` on canceled prefetches. The rerun records 242 such cancellations separately; nine later phone-navigation cancellations were attached to the XML-viewer monitor after route sampling. They are not failed rendered-page GETs. Expected browser console entries caused by the write guard are counted separately, not hidden as application errors.

Production contains existing test-like listing titles, English seller-supplied QA description text and photo/category mismatches, plus placeholder product photos. These are pre-existing content-quality follow-ups; the app UI is Spanish. No content was edited during this gate.

## Writes and production-changing actions

Production smoke writes: **none**. Every browser context installed a route interceptor before navigation and aborted every method except GET/HEAD; service workers were blocked. Across the initial run, rerun and diagnostics, **115 attempted POST /api/events/session calls** were blocked, with no completed forbidden request. No sign-in, signup, publishing, favorites, alerts, reporting, Admin action, form submission or WhatsApp navigation was performed.

Actions in order:

1. [PRODUCTION] Set Ignored Build Step from exact original `""` to `exit 0`.
2. [GITHUB PUSH] Fast-forward main from 568b07a to b37aadd. Vercel automatically canceled the Git deployment `dpl_5TXDChk2mTbMrxU9SsjRYN74mSkZ`; production domains remained on the rollback deployment.
3. [PRODUCTION, not live yet] Build b37aadd as READY staged production deployment `dpl_F45gEzgKRCg6vPEXsGhUgtkYbrRx` with skip-domain; verify its SHA and the four unchanged public domains.
4. [PRODUCTION] After the single-migration dry-run, apply `20261022120000_marketplace_categories.sql`.
5. [PRODUCTION] Immediately promote the READY deployment and verify `laria.audio`, `www.laria.audio`, `laria.pro`, `www.laria.pro`.
6. [PRODUCTION] Restore Ignored Build Step exactly to `""`.
7. [GITHUB PUSH → PRODUCTION] Publish the separately owner-authorized sitemap correction 4b6b2ed; no additional migration.
8. [GITHUB PUSH → PRODUCTION] This release record and the README/architecture updates form a later docs-only fast-forward, which redeploys the same corrected application code. The final deployment identity is verified after that push.

**No production data was written except by the authorized migration and its triggers.** No production setting other than the temporary build-ignore value changed.

## Decision, limits and follow-ups

**Fix-forward, keep live; no rollback.** Core home, catalog and listing pages return 200 with visible content. Henri authorized the sitemap fix after seeing the discrepancy. React #418 on `/registro/tienda` remains a release-gate failure, observed once and not reproduced in ten further trials. No hydration patch was invented or pushed without a reproducible cause; next investigation should capture the development hydration diff and streamed shell/form timing before a narrowly scoped correction and read-only production retest.

Write flows for UX-5 to UX-7 were proven only on the local build, not in production. N16 still has no production test account; no production role/authenticated/write acceptance is inferred. This smoke does not measure field Core Web Vitals, all devices, assistive technology or every hosted data shape.

Remaining follow-ups:

- Re-run **SEO-001–SEO-007, PUB-011/PUB-012, LIST-* and ALERT-*** after release as named in `ux-redesign/category-restructure.md`. Do not infer manual/owner Pass from this gate. `acceptance/cases.tsv` was not edited and no XLSX was read or generated.
- Owner text in `functional-spec.md` still uses `/instrumentos/baterias` and says keyboards/pianos/synthesizers are not listed today; the specification was left untouched. Its earlier non-empty sitemap wording is also superseded only by Henri’s explicit sitemap decision for this release, recorded here.
- Catalog-build / PR #3 follow-up: write the ten marketplace category values and matching instrument types into catalog category metadata. No catalog build, loader, extract, table update or PR #3/#4 change ships here.
- Complete `go-live-checklist.md`: supported 5–15 minute marketplace-email scheduler, protected automatic-worker / Immediate / retry / daily-window tests and natural `ALERT-005` evidence, deliverability review, owner SEO/legal checks (`SEO-006`, `SEO-007`, `LEGAL-005`, `LEGAL-006`), Search Console registration/submission and canonical-secondary-domain checks. No scheduler or setting was changed by this release.

Local raw evidence and ten screenshots: `/private/tmp/laria-ux-release-gate-b37aadd/` (not committed or uploaded). The inline results/counts above are the durable release record.

## Sitemap fix verification and documentation handoff

`4b6b2edd4a24b03af8f60d8e470b91438e1ae147` is READY as `dpl_AE97HP37zxYdc1Z9gUx14XsFUsRT` and was verified on all four domains. Live sitemap inspection finds Guitarras, Bajos, Teclados, Percusión, Vientos, Cuerdas, Pedales, Amplificadores, Micrófonos and Audio, and none of Baterías, Platillos or Interfaces de audio. The updated rendered SEO command exits 0: 7 populated / 3 empty categories, a public sold listing and JSON-LD verified; only Admin records waived. After correction, `/` returned 200 in 1.080 s and `/instrumentos/percusion` returned 200 in 0.920 s.

The documentation commit contains only this file, `docs/ux-redesign/README.md` and the release boundary in `docs/architecture.md`; its automatic deployment carries identical application code to 4b6b2ed. The final docs-only deployment ID/SHA and the two required final GETs are reported to Henri after Vercel reaches READY, avoiding a recursive extra documentation deployment.

Changed files in this gate:

- `app/sitemap.ts`.
- `tests/seo-rendered-metadata-smoke.cjs`.
- `tests/seo-smoke.test.cjs`.
- `tests/sprint-9.test.cjs`.
- `docs/ux-4-8-production-release-gate.md`.
- `docs/ux-redesign/README.md`.
- `docs/architecture.md`.

Verification: frozen dependency install; lint, typecheck, 355/355 tests and build without production env; TSV-only acceptance validation; diff-check; guarded GET/HEAD-only production browser smoke and rendered SEO before/after the sitemap correction. No acceptance, specification, schema, lockfile or hosted configuration edits accompanied the correction.
