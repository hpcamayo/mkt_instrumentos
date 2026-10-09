# Laria UX release audit — independent findings

**Date:** 2026-10-09 (America/Lima)

**Decision:** **GO for owner authorization to push**, subject to the release procedure below.

**Audited commit:** `d993f5d46186f4d9b40f4e5605be54b871c74e6d`

**Production base:** `313fb7e158a8f4b9c96139de2832e97de0b03158`

## Scope and method

I audited the full `git diff 313fb7e d993f5d` (486 changed paths) against `AGENTS.md`, the functional specification, design system, architecture, acceptance registry, and the binding UX principles, owner decisions and approved briefs. I read the changed server routes and queries, reviewed the client flows, ran the project gates, and used a production build against **local** Supabase for independent browser and SQL/API probes. The release has **no changed Supabase migration, dependency lockfile or `next.config.ts`**. `package.json` changes only the test runner setup. The eight changed rows in `acceptance/cases.tsv` append evidence; all 403 IDs, statuses and other fields are unchanged.

These findings were written **before** opening the prior builder's acceptance packages, reconciliation, review guide, reviews or before/after screenshots. Builder-owned `scripts/ux-*.cjs` were inspected as source and used only for local account setup; the observations below come from independent checks and the project's existing gates.

## Environment

- Detached clean checkout: `/Users/henricamayoguillermo/.codex/worktrees/ux-release` at `d993f5d`; `pnpm install --frozen-lockfile` succeeded.
- The audit checkout's `.env.local` was copied from `mkt_instrumentos-ux`. I verified `NEXT_PUBLIC_SUPABASE_URL` resolves to **127.0.0.1:54321**, and `NEXT_PUBLIC_SITE_URL` to **localhost:3000**, before build. The main checkout's production `.env.local` was never used.
- Existing local Supabase in OrbStack, with catalog migrations, seed rows and local photo fixture; no engine restart. Local generated Particular, verified Store Owner and Admin accounts were used. No passwords appear in this report. All account, listing, alert, favorite, contact-event and moderation writes below went to local Supabase.
- Next.js production build served at `http://localhost:3000`; browser widths 390, 768, 1280 and 1440 px. External WhatsApp URL was opened only to inspect the contact flow; no message was sent.

## Blocking findings

**None found.** The observed V1 browse, contact, sign-in, sign-up, publish, account and Admin flows work in the local production build. No changed path was found that writes to hosted Supabase during build or deploy. Production differences still require the read-only post-push smoke specified by Henri.

## Gates and independent checks

| Check | Result | Evidence / qualification |
| --- | --- | --- |
| `pnpm lint` | Pass | Exit 0. |
| `pnpm typecheck` | Pass | Removed generated `.next` first; exit 0. |
| `pnpm test` | Pass | 305/305 tests. |
| `pnpm build` | Pass | Local Supabase URL checked immediately beforehand; home first-load JS 127 kB, catalog 141 kB, Admin 196 kB. |
| `python3 -B acceptance/validate.py` | Pass | 403 valid cases: 332 Pass, 70 Not Run, 1 Blocked; the release did not change those statuses. |
| Rendered SEO smoke against `http://localhost:3000` | Pass | Googlebot/Bingbot metadata, home/catalog/legal/auth, robots/sitemap, category/listing/store URLs, filtered/paged URLs, sold listing and Admin noindex. `empty-category` only was waived because all eight local categories contain listings. |

The first SEO smoke invocation could not reach loopback under the shell sandbox (`EPERM`); the same command with permitted local loopback access passed. This was an environment restriction, not an application failure.

### Product and data boundaries

- The changed API routes are presentation/copy changes except account-navigation response enrichment and the event entity-ID fix. `app/api/contact/route.ts`, `app/api/listings/[id]/view/route.ts` and `lib/marketplace-event-payload.ts` now accept UUID-shaped listing/store IDs used by seed data while retaining strict generated event IDs. The unchanged event RPC and public RLS still reject nonpublic listings, inactive stores and forged attribution. Independent local requests recorded one valid listing contact, store contact and view, rejected a both-target contact (400), and stored the correct listing/store source without WhatsApp message text. Clicking the listing's WhatsApp action in the browser increased that listing's local `whatsapp_contact` count by one.
- `lib/catalog.ts` retains the public approved listing query and deterministic pagination. Repeated `condition` and `location` values now use `in` (owner F11); one value keeps `eq`. In a 390 px browser, two conditions plus two cities produced the expected URL and seven results. The saved-alert UI correctly declined that multivalue search; a one-value category alert saved and appeared in the account.
- `lib/home.ts` adds anonymous, read-only queries for newest listings, per-category photo-qualified vitrina candidates, counts and active verified stores. Its `listing_photo_count` function and public RLS exist in the catalog migrations already in the local database. The release contains no migration or change to moderation, store approval/verification, transaction review authority, favorites, alerts, auth authorization or listing lifecycle.
- I independently recomputed the photo-qualified per-category winners through a read-only local `anon` SQL query. The five resulting slugs matched the home vitrina DOM in order (CAD microphones, Ibanez bass, Pearl drums, Behringer interface, Fender amplifier). The seven home feed links had no overlap with those five.
- A new Particular signed up, submitted a used listing with two photos, saw it awaiting review; Admin approved it; the owner then hid, restored and marked it sold through the UI. The external-sale path correctly said it cannot enable verified reviews. A verified Store Owner reached its store publishing form; Admin used its own frame and moderation queue. Signed-out favorites and alerts led to login with a return URL, while a signed-in favorite and a one-value alert saved and appeared in the account.
- An independent home-banner search for a unique brand created **one** `search` event and one `filter_applied` event, with none before submission. Local impression rows joined to public listings showed the expected listing IDs and `home`/`catalog` sources. Five catalog client transitions completed without a stalled loading state.
- No visible copy or email-template change claims that Laria handles payment, shipping, escrow, authenticity or transaction guarantees. The changed functional-spec passage documents shell presentation and destinations, not a new V1 capability.

### UX, accessibility, SEO and performance

- Public home, catalog, category landing, listing, store, login, legal and 404 pages were checked at 390/768/1280/1440. Each had one main and H1, no completed broken image, and **zero horizontal document overflow at 390 px**. Home/catalog screenshots and account/Admin/mobile detail views were visually inspected. The 54 banner files have the expected 9-piece × phone/desktop × 1x/2x WebP/JPEG matrix and all dimensions match the manifest rules.
- Header/home category menus, catalog category strip and signed-in account menu were exercised with pointer and keyboard. Escape closed the menu and restored focus to its button; outside press, destination choice and route change closed it. In a separate keyboard session, Tab → Enter opened the home category menu, Tab reached its first link, and Escape restored focus. The 390 px filter and sort sheets exposed labeled controls, applied URL changes, closed and returned focus to the results status. The mobile catalog remained within its viewport.
- A 390 px home reload fetched one `/banners/*-phone.webp` asset for its selected piece, with decorative `alt=""`. A signed-in deep Admin 404 (`/admin/no-existe/de-verdad`) retained one main and H1, the Admin menu, no public footer and no overflow. The account-navigation API returned `Cache-Control: private, no-store`; signed-out data contained no identity or count, while the local Admin response carried its authorized role and counts.
- Independent axe-core 4.12 scans at 390 and 1440 of the public home, catalog, listing, store, login and signup found no violations. The filter sheet also had none. A transient `duplicate-id-aria` *incomplete* result while a listing streamed did not recur, and a DOM duplicate-ID check found no duplicates. Some image/nav overlap contrast cases remain axe *incomplete*; the repository's contrast tests pass.
- The rendered SEO smoke confirmed canonical/noindex, robots, sitemap and structured-data behavior in the local build. A local sold listing created through the UI was used for the sold/noindex check. This is not a production-data check.
- One unthrottled 390 px home browser sample recorded FCP 112 ms, LCP 112 ms (phone banner image), CLS 0 and TTFB 74 ms. The banner has fixed dimensions. These are diagnostic samples, not field percentiles or slow-device evidence. The 127 kB home first-load JS is within the owner's accepted P10 decision.

## Non-blocking findings and recommendations

1. **Admin semantics:** axe reports a moderate `region` violation for the Admin logo in the 390 px frame (`components/admin-navigation.tsx:107-109`); the same scan flags an `aria-prohibited-attr` *incomplete* result for `aria-label` on a plain `div` (`components/admin-workbench.tsx:642-648`). Give the mobile logo a landmark and make the pending-summary label semantically valid in the next UI pass. Admin navigation and moderation were usable by keyboard and pointer; this does not meet Henri's severe-accessibility blocking threshold.
2. **Home data load:** each uncached home request starts 19 public Supabase reads in parallel (`lib/home.ts:106-127`). Local TTFB was low, but hosted latency and query load have not been measured. Monitor the first production deployment and use the required read-only smoke. Do not treat the single local vitals sample as a performance guarantee.
3. **Catalog JS budget:** the approved UX-3a brief targeted at most 140 kB first-load JS. The final release build reports **141 kB** for `/listados` (the earlier UX-3a build reported 140 kB; `ux-3b-acceptance.md` acknowledges the measurement drift). This is a 1 kB diagnostic-budget miss, with no observed browse failure or blocking performance regression. Record the final measurement and reduce it during the planned lighter-card follow-up.

## Checks that remain limited

- This was a local audit by instruction. Hosted Supabase data shapes, Vercel environment values, CDN image delivery, production performance percentiles and the deployed URL cannot be proven until the post-push read-only smoke. The production vitrina can legitimately shrink or disappear with fewer three-photo listings.
- No actual email delivery, WhatsApp message, buyer-side verified-transaction confirmation/review window, or production write was exercised. Existing automated tests passed; the local browser covered the seller-facing external-sale path, not a full verified-review pair.
- Browser coverage sampled representative listing/store/category pages and seeded data, not all 403 acceptance cases or all combinations of role × route × viewport. Axe's incomplete contrast checks need human review where relevant.
- The `500` error boundary was reviewed in `app/error.tsx`, `app/admin/error.tsx` and `components/error-page.tsx`; a live server exception was not deliberately introduced. The 404 path was exercised.

## Prior builder claims comparison

I opened `ux-1-acceptance.md`, `ux-2-acceptance.md`, `ux-3a-acceptance.md`, `ux-3b-acceptance.md`, `ux-2-reconciliation.md`, `review-guide.md` and `reviews/ux-2-external-review.md` only after saving the findings above. Their release-relevant claims about working navigation, the event entity-ID fix, F11 filters, local vitrina order, the one-banner request, SEO and gates are consistent with my independent probes. The previously reported deep Admin 404 defect is fixed in the route I tried.

**Current-build difference:** `ux-3a-acceptance.md` criterion 5 records 140 kB for the 3a build; this final release build reports 141 kB. `ux-3b-acceptance.md` § First-load JS also reports 141 kB and explicitly attributes the change to measurement drift. I did not rebuild the historical 3a commit, so this is a present-release budget difference rather than proof its earlier measurement was false.

**Accessibility scope difference:** `ux-2-acceptance.md` and the 3a/3b packages report zero axe **WCAG 2.1 A/AA** violations with axe 4.11.4. My default axe 4.12.1 scan of the current 390 px Admin page reports one **moderate best-practice** `region` violation on the logo and one **incomplete**, not a violation, for `aria-prohibited-attr` on the pending-summary div. Those results do not disprove a WCAG-tagged zero-violation run; they show an issue outside that reported violation count. The package's unqualified wording “axe 0” for all template runs should be read with its stated WCAG tag/version limits.

**Builder claims not independently reproduced in this audit** (the original numbers and artifacts remain builder evidence, not my measurements):

1. `ux-1-acceptance.md` §§ Acceptance criteria and Performance: the 16-template/682-focusable full-ring sweep, 381 pre-UX-1 axe failures, 116+116 earlier captures and 96 later captures, and before/after/throttled LCP and CLS medians. I inspected the current build and ran present-day axe, but did not rebuild UX-1's baseline or enumerate every focusable element.
2. `ux-2-acceptance.md` §§ Acceptance criteria, Measurements and Review preparation, plus `review-guide.md` §§ 6.3–6.7: the historical 132-capture sets, exact header geometry at every intermediate width, 541/852/885/1,011 focusable sweeps, the 200% zoom samples, historical CLS improvement, temporary 500-throw route and layout-failure path, and clean-stack comparisons against older commits. I checked representative current widths, menus and the deep Admin 404; I did not recreate those historical stacks or induce a 500.
3. `ux-3a-acceptance.md` §§ Transition trials, Audit and Acceptance rows re-run: the 32/120 stalled transitions before the fix and 0/120 on each later build, 2,513-element focus sweep, every 68-template/menu axe scan, all 25 discovery checks, held-request pending-state timing, paged scratch build with page size two (REL-001/003/004 and two-location page 2), forced error/empty states, and 200% zoom probes. My five current real client transitions, filter/sort sheet, local data queries and automated suite support the working release flow but do not reproduce those counts or manipulated builds.
4. `ux-3b-acceptance.md` §§ Audit, Banner and First-load JS: all 72 template/menu axe runs, 2,698-element focus sweep, all 29 home checks, seven-load before/after LCP medians, median 25 vs 16 ms historical TTFB, and 204.8 vs 208.4 kB compressed browser downloads. I checked one current local vitals sample, one selected banner request at 390, all asset dimensions, and current vitrina/feed membership; those historical distributions and full matrices remain unverified.
5. `ux-2-reconciliation.md` § Rows and `ux-3b-acceptance.md` § N12: the script's 51 role/viewport snapshots, 27-destination equality for every visitor, and 24 followed type links were not all repeated. I checked the canonical source in code and representative category/type paths, signed-out and signed-in menus, close/focus behavior and lack of 390 px overflow. The prior acceptance evidence in `acceptance/cases.tsv` was preserved unchanged by this audit.
6. The acceptance packages' claimed owner review-page check totals (22/22, 31/31 and 37/37), the archived before/after screenshot counts, and the statement that production seed rows previously rejected event calls were not checked from their original remote sources. Owner decisions recorded in `decisions.md` remain binding; no production endpoint was called during this local audit.

No builder claim I checked was contradicted on a core product flow. The unverified historical measurements above do not change the release gate, because the final commit's current functional gates and representative user journeys passed. They remain limits on the strength of this audit, especially performance and non-Chromium accessibility.

## Release gate

**Go/no-go: GO for Henri's explicit “push” instruction.** No blocking finding was observed. Do not push on this report alone. At that instruction, fetch origin and require `origin/main` still equals `313fb7e` and local `main` equals audited `d993f5d` plus this report commit; otherwise stop. After deployment, complete the specified read-only production smoke and rollback in Vercel if a blocking regression appears. Production release recording remains separate docs-only work after that smoke.
