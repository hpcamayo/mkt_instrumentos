# Laria UX-4–UX-8 production release gate

**2026-10-14 (America/Lima): PASS — read-only production release gate; keep the site live.** UX-4–UX-8 and the ten categories shipped together with their migration, followed by the owner-authorized sitemap and hydration corrections. `5e66fb0` resolves the original React #418 and the first correction’s HTTP-redirect regression. Steps 13–22 now pass with only the documented Admin-session waiver. Earlier failures and investigation evidence are retained below; no authenticated/write production acceptance is inferred.

## Release identity and boundaries

- Requested source: `ux/redesign` at `b37aaddc8f7858de9cf45e982c5668261f69f687`, containing PR #2. At the start, remote `main` was exactly `568b07af4229be3c52c379966cb897692909a81a`; the release was 13 commits ahead and a plain fast-forward. GitHub marked PR #1 merged without title/body edits.
- Coordinated production deployment: `dpl_F45gEzgKRCg6vPEXsGhUgtkYbrRx`, READY, source `b37aadd`. All four public domains were confirmed against it immediately after promotion.
- Migration: `20261022120000_marketplace_categories.sql`. Hosted project `hswkjandadscduodejig` moved from 44 applied migrations through `20261021120000` to **45/45 synchronized**. The dry-run listed only this migration. No down migration or manual production SQL was run.
- Owner-authorized fix-forward: `4b6b2edd4a24b03af8f60d8e470b91438e1ae147`, deployment `dpl_AE97HP37zxYdc1Z9gUx14XsFUsRT`. It adds all ten category URLs to the sitemap even without inventory; empty pages retain `noindex` until inventory exists. The matching SEO harness distinguishes empty pages from their rendered metadata/ItemList instead of sitemap membership. READY and exact SHA were reverified through all four public domains; the live sitemap contains all ten categories, no retired landing, and the updated SEO smoke exits 0 with only the Admin-session waiver.
- Owner-authorized hydration correction: `0a8af92e69296f5e94eb0eee2b37864944448834`, READY deployment `dpl_4WrXsUVZkM1wnVxMzuNLsLfMKFpQ`. All four domains resolve to it. The read-only retest below records both the successful hydration checks and the HTTP-redirect regression.
- Final owner-authorized application correction: `5e66fb0c19b11d770fcc84fb18118e57f5563307`, READY as `dpl_sGfrRUN8VrUEuuhnvBcDB6hFnzhL`, verified on all four domains. The final docs-only deployment carries identical application code; its final SHA/ID and required GETs are reported in the handoff after it reaches READY.
- Pre-release rollback target: `dpl_H777E1P45pMVrrNBYkfrGZ3LuZS5`, source `568b07af4229be3c52c379966cb897692909a81a`. No rollback was performed. The database stays migrated if an app rollback is ever required.
- PR #3 (Jev/autofill), PR #4 (catalog audit), catalog builds/loaders/extracts and catalog-table changes were excluded. Production retains the previously loaded reduced catalog (20,386 products / 170 brands); this gate did not reload or query catalog tables directly.
- No hosted environment variables, cron, Auth settings or email templates changed. Neither seed.sql nor db reset nor any loader was run. No force-push occurred.

## Pre-flight

Fresh managed worktree at the exact source, clean before and after checks. The Supabase diff contained only the categories migration and `seed.sql`. Frozen install, lint, typecheck, **355/355 tests**, production build, canonical TSV validation (**403 cases**) and `git diff --check 568b07a b37aadd` passed. Builds/tests used no database: only `.env.example` existed in the worktree, and `env -i` excluded production credentials. The sitemap correction separately passed lint, typecheck, **355/355 tests**, build without a DB and diff-check.

Baseline GETs before release: `/` 200 / 1.648 s; `/listados` 200 / 1.109 s; `/instrumentos/guitarras` 200 / 0.739 s; `/instrumentos/baterias` 200 / 0.706 s.

## Before/after data — original migration snapshot

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

## Initial decision, limits and follow-ups

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

## Initial local hydration follow-up — subsequently released as 0a8af92

Investigation baseline: `25e089167c3060a224faf07388cebee7866cd189`, then live as `dpl_5JmL5H6ECsrMrFLBADA9q1RWPrYY`. The following local evidence preceded owner approval and release of `0a8af92`; the later production retest supersedes its pending-release status.

The compiled local production build reproduced React #418 during anonymous full-document navigation through `/login`, `/registro/vendedor` and `/registro/tienda`. One bounded comparison recorded four errors across twelve fresh contexts / twenty-four visits, including with the account-navigation request blocked. Temporary diagnostics in the generated local React bundle showed `<main id="contenido">` completing with no child fiber while its server-rendered page `<section>` remained unclaimed. The failure also appeared on `/listados` when the candidate boundary was limited to auth pages. The development build did not reproduce it; this evidence identifies a shared streamed-route hydration boundary, without claiming an upstream framework defect.

The proposed correction gives `{children}` its own `Suspense` boundary inside the existing main in `components/site-shell.tsx`. It preserves server-rendered content, the single main, header/footer, forms and account behavior; it adds no route-level `loading.tsx`, environment variable, dependency or database change. The initial same-condition comparison after this change recorded zero errors in twenty-four visits. One early catalog-navigation timeout was recorded during investigation; the final candidate is checked on catalog transitions as well as auth pages.

Local verification:

- Frozen installed dependencies; lint, TypeScript, all **355/355 tests**, production build and diff whitespace check pass. Canonical TSV validation remains **403 cases**, with no acceptance changes.
- `scripts/ux-auth-hydration-smoke.cjs` is a repeatable local-only Playwright regression. It uses fresh contexts at 390/1440 px, normal/instant/delayed account responses and delayed JavaScript, checks HTTP 200, one main/H1 and interactive login/signup forms, records page errors with the actual URL/stack, and blocks all non-GET/HEAD and non-local-origin requests before navigation. It submits no form.
- The final shared-boundary build passes **10/10 contexts, 50/50 visits**, including 30 auth-page visits, with zero page errors. This run used five trials per width; the script defaults to ten per width.
- Home, catalog, Percusión and store signup retain their server-rendered main/H1 and HTTP 200 at both widths. Four client transitions from catalog to verified-store filtering complete with zero page errors. Signup screenshots at both widths were inspected.
- The first expanded harness recorded zero hydration errors but counted one canceled prefetch as a failure. Resource console entries are now excluded only when they match a recorded canceled request; diagnostics are retained. Local middleware redirects use `localhost`, so the final harness consistently uses that origin rather than mixing it with `127.0.0.1` and creating a prefetch CORS error.

To repeat, start the compiled local build using a local Supabase stack or placeholder localhost public credentials, never a production `.env.local`, then run:

```sh
LARIA_PLAYWRIGHT_MODULE=<installed-playwright-module> \
  node scripts/ux-auth-hydration-smoke.cjs http://localhost:3013 5
```

Set `LARIA_CHROME_EXECUTABLE` only if Playwright needs an existing Chrome executable. Playwright remains an optional verification tool; no package/lockfile change is required.

Limits: this proof used placeholder localhost public credentials and no database. It verifies anonymous hydration and interactivity, not account creation, authenticated workflows or real hosted catalog data. No production data, settings, auth, migration or catalog was touched. Temporary diagnostics were removed by a clean rebuild and are not part of the patch. Raw local evidence: `/private/tmp/laria-signup-hydration/`; browser evidence paths are printed by the regression script.

Henri subsequently replied “yes please” to publishing this specific patch and running the read-only production retest. The next section records that release. No additional migration was applied.


## Production hydration retest — 0a8af92, FIX-FORWARD for redirects

Henri authorized the tested hydration commit. [GITHUB PUSH → PRODUCTION] Fast-forwarded `main` from `25e0891` to `0a8af92`, triggering the automatic Git deployment. No other production-changing action was performed in this follow-up. `dpl_4WrXsUVZkM1wnVxMzuNLsLfMKFpQ` reached READY with that exact SHA and was confirmed on `laria.audio`, `www.laria.audio`, `laria.pro`, `www.laria.pro`.

| Step | Current result | Evidence |
| --- | --- | --- |
| 13. Migration synchronization | **Pass** | Read-only linked history: 45/45 synchronized through `20261022120000`; no new migration. |
| 14. Data migration | **Pass** | Privileged GET-only PostgREST counts remain identical to the after column above: 54 listings, 2 null-category revisions, 2 live alerts; zero retired category values and zero duplicate alert deletions. |
| 15. Rendered SEO | **Pass; Admin waived** | Exit 0; both crawlers, 7 populated / 3 empty categories, public sold listing and JSON-LD exercised. Only Admin records waived for no authenticated production session. This script did not expose the separate ordinary-user-agent HTTP redirect regression in step 17. |
| 16. Public pages, layout and hydration | **Pass for this retest** | 46/46 page visits return 200 at 390/1440 px; 42 HTML visits have one main/H1, Spanish interface, no overflow, broken completed images, page errors, unexpected console errors or failed application GETs. Ten required screenshots inspected. Separate real-production account/JS timing trials: 20/20 fresh contexts, 100 visits including 60 auth visits, zero page errors; login and signup forms become interactive without submission. No mocked production API response. |
| 17. Legacy URLs and sitemap | **Fail — HTTP status regression** | Ordinary GETs to all three retired landings now return HTTP 200 with a refresh meta tag, no Location header, instead of the required 308. Browser navigation still reaches the expected destination. Legacy drums filter remains Percusión / Baterías + noindex; sitemap still has all ten new landings and no retired landing. |
| 18. Navigation | **Pass** | All ten category panels at both widths, mobile home menu, catalog brand lists, one-row strip at 1280 including Teclados, and two home rows of five pass. |
| 19. Listing React #418 | **Pass** | Same approved Particular listing, 10 new contexts: 0/10 React #418 and zero page errors. |
| 20. Signed-out guards | **Fail for HTTP semantics; browser guard passes** | All three anonymous browser visits reach `/login` without 500. `/mi-cuenta`, `/vender` and `/admin` retain HTTP 307 from middleware; `/publicar` now returns HTTP 200 + refresh meta tag for its `/vender` hop. This streamed redirect is included in the pending correction. |
| 21. WhatsApp | **Pass** | Listing/store wa.me anchors and Spanish messages verified at both widths; never opened. |
| 22. Runtime health | **Pass for queried window** | `2026-10-14T02:47:20Z`–`02:53:00Z`, this deployment: 50 returned request-log records, zero error, fatal and 5xx matches in separate bounded queries. |

Sample response times (390/1440 px): home **951/857 ms**, catalog **456/506 ms**, Percusión **460/480 ms**, approved listing **550/602 ms**, store **554/437 ms**.

Production smoke writes: **none**. Every browser context installed a GET/HEAD-only interceptor before navigation and blocked service workers. **80 attempted POST /api/events/session requests were aborted**, with zero completed non-GET/HEAD requests. No sign-in, form submission, publishing, favorites, alerts, reports, Admin actions or WhatsApp navigation. Across the whole release, the authorized categories migration and its triggers remain the only production data writes.

**Decision: FIX-FORWARD; keep live, no rollback.** Core pages work and the original signup hydration failure was absent in the bounded retest. The global Suspense fallback added by this patch allows the response to start before a page redirect resolves, changing HTTP semantics. Next.js documents this client-side meta redirect behavior in a streaming context: https://nextjs.org/docs/app/api-reference/functions/permanentRedirect. The first patch's local checks missed HTTP statuses; that omission is corrected in the regression script below. Do not mark the gate Pass or infer acceptance-row changes.

### Redirect-preserving correction — local proof before release

Replace the new streaming Suspense fallback with a small `RouteContent` component inside main. Its own component fiber separates lazy RSC reconciliation from the host main without introducing a streaming fallback or extra DOM. The existing page redirects and route data logic remain intact; no Next.js routing/configuration, database, dependencies, environment or auth changes are needed.

Local compiled-build evidence (placeholder localhost credentials; no production database):

- The exact original timing comparison: 12 contexts / 24 visits, **0 errors**, versus four #418 errors on the baseline.
- Additional normal/instant/delayed account and delayed-JS trials: **20/20 contexts, 100 visits**, zero page errors, forms interactive without submission.
- Home, catalog, Percusión and signup preserve server-rendered main/H1, with **four successful client catalog transitions** across 390/1440 px and zero page errors.
- Ordinary GET with manual redirect handling: all three required **308** responses and exact destinations; `/publicar` **307 → /vender**; unknown page **404**.
- `scripts/ux-auth-hydration-smoke.cjs` now asserts these five raw HTTP responses before launching its browser. Updated script validation: five HTTP checks + **4/4 contexts / 20 visits** pass.
- Lint, TypeScript, **355/355 tests** and production build pass. No production environment file was loaded. Canonical TSV remains untouched.

Henri explicitly approved this correction with “yes”. It was released as `5e66fb0`, and the following production retest supersedes the earlier pending-release/FIX-FORWARD status. UX-5–UX-7 write flows remain proven locally only.

Changed files for this follow-up: `components/site-shell.tsx`, `scripts/ux-auth-hydration-smoke.cjs`, this release record, `docs/architecture.md`, `docs/ux-redesign/README.md`. Raw production and local-correction evidence: `/private/tmp/laria-hydration-release-0a8af92/` (not committed/uploaded).


## Final production retest — 5e66fb0, 14 October 2026

[GITHUB PUSH → PRODUCTION] Fast-forwarded main `0a8af92 → 5e66fb0` after Henri’s explicit approval. Vercel’s automatic build reached READY as `dpl_sGfrRUN8VrUEuuhnvBcDB6hFnzhL`; Git metadata and the deployment URL were matched to the exact approved SHA, and all four public domains were confirmed against it. No migration, hosted setting, environment variable, auth/email template or catalog operation was performed.

The application now keeps streamed route reconciliation in `RouteContent` without a new streaming fallback. Production confirms both successful hydration and the original HTTP redirect semantics. No code change was made after the previously reported local lint, TypeScript, **355/355 tests**, production build and 308/307/404 regression proof.

| Step | Final result | Evidence |
| --- | --- | --- |
| 13. Migration synchronization | **Pass** | Read-only linked history: 45/45 synchronized through `20261022120000`; no additional migration. |
| 14. Data migration | **Pass; pre-push activity reconciled** | Zero retired values in all three tables. Percussion remains 11 listings and 1 live alert, audio 5 listings; 2 null-category revisions and 2 live alerts remain. Current all-status listings total 55: the extra guitar was created before this push, as detailed below. |
| 15. Rendered SEO | **Pass; Admin waived** | CLI exit 0; Googlebot/Bingbot, 7 populated / 3 empty categories, public sold listing, pagination, filtered catalog, category aliases and JSON-LD exercised. Only `admin-records` waived because this gate has no authenticated production Admin session. |
| 16. Public pages and layout | **Pass** | Complete final run: 46/46 navigations return 200 at 390/1440 px; all 42 HTML visits have one main/H1, Spanish UI, no horizontal overflow, broken completed image, page error, unexpected console error or failed application GET. All ten required screenshots inspected. Auth regression: 20/20 new contexts, 100 visits (60 auth), zero page errors, forms interactive without submission, real production responses. |
| 17. Retired URLs and sitemap | **Pass** | All three exact 308 destinations restored for ordinary browser, Googlebot and Bingbot user agents. Legacy `category=drums` renders Percusión / Baterías with noindex. Sitemap has all ten new landings and no retired landing. |
| 18. Navigation | **Pass** | Ten category panels at both widths with catalog brands, ten phone-home destinations, all items including Teclados on one row at 1280, and two home tile rows of five. |
| 19. Listing React #418 | **Pass** | Ten fresh listing contexts: HTTP 200, 0/10 #418 and zero page errors. |
| 20. Signed-out guards | **Pass** | `/mi-cuenta` and `/admin` return 307 to login; `/publicar` returns 307 to `/vender`, which routes anonymously to login. Browser visits confirm login without 500. |
| 21. WhatsApp | **Pass** | Listing/store wa.me URLs and Spanish messages name their corresponding heading, checked at both widths. No link was opened. |
| 22. Runtime health | **Pass for queried window** | Window and bounded log results below: zero error/fatal/5xx records. |

Raw HTTP regression: **21/21 checks pass** (seven routes × ordinary browser / Googlebot / Bingbot), including the three 308s, anonymous redirects and an unknown-page 404, with no refresh-meta redirect in those responses.

### Current counts and pre-push activity

The original migration snapshot above remains the migration’s before/after proof (54 → 54 listings). The follow-up initially compared today’s inventory against that historical snapshot and correctly flagged one extra guitar; it was investigated rather than erased from the ledger. A privileged GET selecting only category and created_at found exactly one listing created after the previous verification: `guitars`, `2026-10-14T14:27:22.652706+00:00` (**09:27 Lima**). The correction push occurred at `2026-10-14T18:58:37+00:00` (**13:58 Lima**). The new row therefore predates this release; it was not created by the gate.

Current privileged GET-only counts at `2026-10-14T19:12:30Z`:

| Table | Current counts |
| --- | --- |
| listings | **55**: guitars 20, basses 3, percussion 11, pedals 5, amplifiers 6, microphones 5, audio 5; all other categories 0 |
| listing_revisions | **2**, both category null |
| live saved_search_alerts | **2**: basses 1, percussion 1 |

Retired values remain zero; duplicate alert deletions remain zero. Every difference from the original post-migration snapshot is accounted for by the single pre-push guitar. The source is existing project service-role access used internally for read-only PostgREST GETs with exact counts; no credential was copied into a local build or published.

### Browser transport evidence and writes

Two attempts using the installed Google Chrome reported recurring `net::ERR_NETWORK_CHANGED`; those incomplete/failed attempts are preserved as `browser-smoke-initial-network.json`, `browser-smoke-native-chrome.json` and corresponding auth folders/logs. They were not counted as passing or waived. The complete successful retest used Playwright’s matching **Chrome for Testing / headless Chromium 151.0.7922.34**, downloaded only to `/private/tmp/laria-browser-runtime`. Assertions, real server responses and the non-GET/HEAD interception were preserved; no application or system network setting was changed to obtain the result. The final successful run has zero failed application GETs or unexpected console/page errors.

Production smoke writes: **none**. All contexts block service workers and install the write interceptor before navigation. Final successful run: **80 attempted POST /api/events/session calls aborted**, zero completed forbidden requests. Including the two retained transport-interrupted browser attempts, this correction’s verification blocked **135** such POSTs (26 + 29 + 80). Earlier evidence records 115 in the initial gate and 80 in the first hydration retest, for **330 recorded blocked analytics POST attempts across this release**. Auth regressions attempted no write. No form was submitted and no WhatsApp link was opened.

Across the release, **the authorized categories migration and its triggers are the only production data writes performed by the agent**. The observed guitar creation predates this correction and is distinct from agent verification.

### Final decision and release record

**GO / PASS for this read-only production gate; keep live.** The original signup hydration failure and the intermediate HTTP-redirect regression are closed by the final bounded production evidence. This does not mark owner/manual acceptance rows, authenticate a production account or prove UX-5–UX-7 write flows in production. N16, the listed acceptance reruns, owner functional-spec text, PR #3 catalog-category follow-up and `go-live-checklist.md` items above remain open.

This final release-record update changes only this file, `docs/architecture.md` and `docs/ux-redesign/README.md`. [GITHUB PUSH → PRODUCTION] Its fast-forward redeploys identical application code to `5e66fb0`; the final deployment SHA/ID, domain confirmation and last GETs of `/` and `/instrumentos/percusion` are verified after READY and reported in the handoff. No additional code patch, migration or rollback is part of that documentation step.

Raw evidence and inspected screenshots: `/private/tmp/laria-hydration-release-5e66fb0/` (local only, not committed/uploaded). The initial and intermediate failures remain in this record for traceability; the final table is the current decision.

Runtime window: `2026-10-14T19:07:02Z`–`2026-10-14T19:39:24Z`, deployment `dpl_sGfrRUN8VrUEuuhnvBcDB6hFnzhL`: 50 returned request-log records, separate error/fatal/5xx queries each return zero. Logs are bounded by the provider’s returned results.


| Sampled route | 390 px | 1440 px |
| --- | ---: | ---: |
| `/` | 1168 ms | 865 ms |
| `/listados` | 592 ms | 565 ms |
| `/instrumentos/percusion` | 697 ms | 536 ms |
| approved listing | 765 ms | 693 ms |
| Casa Musical Grau | 625 ms | 627 ms |
