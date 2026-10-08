# UX-3a Discovery, part 1 — acceptance package

Status: **built and checked, waiting for the owner's acceptance** (review page: https://claude.ai/artifact/NpxKr4FfUSLH65RZooTwdB). Built 8 Oct 2026 on `ux/redesign` against the approved brief `ux-3-discovery.md` and the owner's answers Q1–Q20. Nothing is pushed, merged or deployed. 3b (the home) starts only after the owner accepts 3a (Q2).

## What changed

| # | Commit | Content |
| --- | --- | --- |
| 1 | `5f4bdd1` fix(catalog) | **The stall fix (Q1 A).** `app/listados/loading.tsx` deleted; navigation feedback moves into the page (`components/catalog-navigation.tsx`); `ShellLink`/`isCatalogHref` and `AppliedChip`'s plain link retired; `scripts/ux-transition-trials.cjs`; a regression test; `docs/architecture.md` |
| 2 | `4ddf8cc` feat(card) | **The one card**, grid variant (Q3–Q5), adopted by the catalog and the landings; the 2 / 3 / 4-column grid; `t-card-title` 600 (Q17) |
| 3 | `6651815` feat(catalog) | **The catalog page and filters**: the shared `CatalogView`, the desktop filter column, the phone and tablet sheets (`Sheet`, `Chip`, `Checkbox`, `Radio`), **F11** (several conditions and locations), applied chips, sort, numbered pagination, the landings and the states; tests; `docs/design-system.md` § Discovery |
| 4 | this commit, docs/chore(ux) | Evidence scripts (`ux-audit.cjs` extended, `ux-snapshots.cjs` frames, `ux-discovery-rerun.cjs`), captures in `screenshots/ux3-before|after/`, this package, README, roadmap, decisions, review guide |

No schema, migration, RLS, auth, moderation or lifecycle change. The only query change is F11's: `condition` and `location` use `in` when they have several values (one value is today's `eq`).

## Checks

- `pnpm lint`, `pnpm typecheck`, `pnpm build`: pass.
- `pnpm test`: **290/290** (275 before 3a). New: `tests/ux-discovery.test.cjs` (14 tests: the card, F11 parsing, query, URLs, chips and alerts, filter URLs, titles and the alert rule, pagination, the sidebar, the phone controls, the states) and the stall regression test in `tests/ux-shell.test.cjs`.
- SEO: `tests/seo-smoke.test.cjs` passes in the suite; `tests/seo-rendered-metadata-smoke.cjs` **passes** on the local 3a build (`--site=http://localhost:3000`, the local `NEXT_PUBLIC_SITE_URL`; Admin records with a local Admin session). Two data-dependent surfaces were waived with their reason: no sold listing and no empty category exist in the local data.

## Evidence setup

Production builds (`next build` + `next start`, stopped by port) against the local Supabase stack (127.0.0.1:54321; the worktree's `.env.local`), with the accounts from `scripts/ux-local-accounts.cjs`. Chromium through agent-browser, axe-core 4.11.4.
- **3a**: the worktree at `6651815`, port 3300.
- **Before**: a scratch `git archive` of `375a213` (the last commit before 3a), port 3100.
- **Paged scratch builds** (`LISTINGS_PAGE_SIZE` lowered to 2 so that pagination exists with the 12 public local listings): `375a213` (before), `5f4bdd1` (the fix) and `6651815` (3a), each `next build` in the session scratchpad.
- **States**: a scratch copy of `6651815` whose `lib/catalog.ts` can force a query error or an empty result through an environment variable (never committed), for the error, empty-catalog and empty-landing frames.

## Acceptance criteria (3a)

| # | Criterion | Evidence | Verdict |
| --- | --- | --- | --- |
| 1 | Card, catalog, sidebar and sheet, chips, sort, pagination, landings and states match the brief and the answers at 390 / 768 / 1280 / 1440, signed out and as a Particular | Captures `screenshots/ux3-after/` (selected) and `.ux-snapshots/ux3-after/` (104 frames: public and Particular, four widths); the deviations below | For the owner (review page) |
| 2 | The stall is gone; catalog links are client links | § Transition trials: **before 32 stalls in 120 trials, after the fix 0 in 120, on the final 3a build 0 in 120**, every move of the criterion plus the two F11 moves. `ShellLink`/`isCatalogHref` deleted; strip, chips, pagination and filter links are client links (tests) | Met |
| 3 | Product rules hold (rows re-run as observations) | § Acceptance rows re-run | Observations for the owner; no status written |
| 4 | Audit: axe 0 (also with the sheet and the sort menu open); focus, Tab order, two tab stops per card; closed panels invisible; no overflow at 390 with two columns; 200% zoom; no layout shift | § Audit | Met |
| 5 | First-load JS: catalog ≤ 140 kB | **140 kB** (before: 136 kB measured the same way on `375a213`; the brief's 135 kB was a `pnpm build` of `6fafbed`) | Met, at the limit |
| 6 | SEO smokes pass | § Checks | Met |
| 7 | Tests updated, never weakened; lint, typecheck, test, build pass | § Tests | Met |
| 8 | F11 works as decided | Unit tests (parse, `in`, URLs, chips, alerts, pagination, forwarding, metadata); browser: the sheet applies two conditions to `?condition=Nuevo&condition=Usado+-+buen+estado` with one chip each and the alert line (audit `filter-sheet-apply-f11`); two locations keep both across page 2 on the paged build (rows REL-003); one-value URLs round-trip byte for byte (test); saved alerts and their database functions untouched (no migration; ALERT-001/002 re-run) | Met |

## Transition trials

`scripts/ux-transition-trials.cjs` (the brief's appendix method): each trial in a fresh agent-browser session opens the start page, waits 2 s, calls `window.next.router.push(target)`, waits 6 s, then reads `location` and the App Router's own state (through webpack's module registry). A trial completes when `location` shows the target. Ten trials per move, paged scratch builds. Reports: `.ux-snapshots/ux3-trials-before|fix|after/transitions.json` (gitignored).

| Move | Before (`375a213`) | Fix (`5f4bdd1`) | 3a (`6651815`) |
| --- | --- | --- | --- |
| `/listados` → `?seller_type=verified_store` | 3/10 | 0/10 | 0/10 |
| `/listados` → `?category=guitars` | 3/10 | 0/10 | 0/10 |
| `/listados` → `?condition=Nuevo` | 8/10 | 0/10 | 0/10 |
| `/listados` → `?page=2` | 0/10 | 0/10 | 0/10 |
| `?seller_type=verified_store` → `/listados` | 0/10 | 0/10 | 0/10 |
| `?category=guitars` → `/listados` | 0/10 | 0/10 | 0/10 |
| `?condition=Nuevo` → `/listados` | 1/10 | 0/10 | 0/10 |
| `?page=2` → `/listados` | 0/10 | 0/10 | 0/10 |
| `/instrumentos/guitarras` → `/listados?category=guitars&condition=Nuevo` | 0/10 | 0/10 | 0/10 |
| `?category=guitars` → `?category=guitars&condition=Nuevo` | 3/10 | 0/10 | 0/10 |
| F11: `?condition=Nuevo` → `?condition=Nuevo&condition=Usado+-+buen+estado` | 7/10 | 0/10 | 0/10 |
| F11: `?location=Lima` → `?location=Lima&location=Arequipa` | 7/10 | 0/10 | 0/10 |
| **Total** | **32/120** | **0/120** | **0/120** |

In every stalled "before" trial the router's state already held the target URL while `location` and the page stayed on the start page, as the brief describes. The 3a run ran while the screenshot harness was capturing on other ports (more load can only make the race more likely).

## Audit

`scripts/ux-audit.cjs` on the 3a build at 390 / 768 / 1280 / 1440 (report `.ux-snapshots/ux3a-audit/audit.json`, gitignored). New templates: the multi-value catalog (`?category=guitars&condition=Nuevo&condition=Usado+-+buen+estado&location=Lima&location=Arequipa`), no results (`?brand=zzzz`) and the Baterías landing. New checks: § Discovery below.

| Check | Result |
| --- | --- |
| axe-core WCAG 2.1 A/AA on 68 template runs (17 templates × 4 widths, signed out, Particular, Store Owner, Admin) and with each shell menu open | **0 violations** |
| Focus sweep | 2,513 focusable elements, **0 without a 2 px ring** |
| Skip link, Tab order in the header and strip, one `<main>` and one `<h1>`, public/Admin frame | 0 failures |
| Horizontal overflow (also 640 / 720 px, the 200% zoom stand-in, on 8 routes including the multi-value catalog and a landing) | **0 pages** |
| Category menus (N12) | 34 checks, 0 failures (the "type destination" check now reads the chosen type from the filter column) |
| Layout shift (home, catalog, a landing, a listing; signed out and Particular, 390 and 1440) | max **0.0016** (the signed-in header's account entry, as in UX-2); 0 signed out |

**Discovery checks (25, all pass):**
- Filter sheet at 390 and 768: opens as a modal dialog labelled "Filtros" (`aria-modal`), focus inside, the page does not scroll, **axe 0 with it open**; 40 Tab presses never leave it; Esc and the close button close it without applying and return focus to "Filtrar"; choosing two conditions and "Ver resultados" lands on `?category=guitars&condition=Nuevo&condition=Usado+-+buen+estado` with focus on the results count, one chip per value and the one-value line.
- Sort: the sheet at 390 / 768 (axe 0 open; a choice applies at once); the menu at 1280 / 1440 (closed until pressed, three options, **axe 0 open**, a choice applies, closes and returns focus to the button; Esc closes and returns focus).
- Pending state at 1280 / 1440 (the router's data request held 1.5 s in the page): at 100 ms `aria-busy` and full opacity; at 550 ms 50% and "Cargando resultados…"; after the move, idle and full opacity with the new results.
- Focus after a facet (1280 / 1440): Enter on "Nuevo" lands on `?condition=Nuevo` with focus on the same option, now `aria-current`.
- Cards at 390 / 768 / 1440: every card has exactly **two tab stops**; **2 / 3 / 4 columns** (173 / 227 / 253 px cards), no overflow.
- The alert panel (Particular) at 1440 and 390: opens with the frequency field, axe 0, no overflow.
- Closed sheets and menus are not in the page (they render only while open; checked as zero visible dialogs and no menu node after closing).

## First-load JS

`next build` output, same machine and method for both columns.

| Route | Before (`375a213`) | 3a (`6651815`) |
| --- | --- | --- |
| `/` (home) | 114 kB | 114 kB |
| `/listados` | 136 kB | **140 kB** |
| `/instrumentos/[slug]` (landings and listings) | 203 kB | 208 kB |
| `/tiendas/[slug]` | 197 kB | 195 kB |
| Shared by all | 102 kB | 101 kB |

Two things kept the catalog at the limit: `FavoriteButton` stopped importing `cn` (it had pulled tailwind-merge into the home's first load, 114 → 121 kB, in a first build), and the browser-side filter module (`lib/catalog-filters.ts`) imports neither the shell module nor the landing copy. The landing route grew 5 kB; it shares the listing page's route and the brief sets no limit for it.

## Acceptance rows re-run (observations; no status written)

`scripts/ux-discovery-rerun.cjs` on the 3a build (and the paged scratch build for the pagination rows), signed out and as the local Particular, counting rows and events in the local Postgres before and after each step. Report: `.ux-snapshots/ux3a-rows/rows.json` (gitignored). Observations only: the owner records any status.

| Row | Observed on the 3a build | Same as before 3a? |
| --- | --- | --- |
| PUB-001 | `/` signed out: no sign-in, the header and the strip | Yes (the home is 3b's) |
| PUB-002 | `/listados` signed out: 12 cards, "12 resultados", "Mostrando 1–12 de 12" (14 approved rows, 12 public: two belong to stores that are not active) | Yes |
| PUB-005 | Catalog, a listing and a store page open signed out, no redirect | Yes |
| PUB-006 | The catalog and no-results copy carry no payment, delivery or guarantee words; the landing keeps "Laria no procesa pagos, no retiene dinero, no gestiona envíos ni garantiza la transacción." | Yes (Not Run; the owner's) |
| PUB-009 | Typing "MarcaQueNoExiste" without submitting: 0 search events; Enter: `/listados?brand=MarcaQueNoExiste`, exactly 1 event with `zero_results`; focusing the search again: 0 | Yes |
| SEO-001 | `/instrumentos/guitarras` is the landing; a listing slug is its listing | Yes |
| SEO-002–004 | Guitarras, Baterías, Micrófonos: real cards, `index, follow`, canonical to the landing, BreadcrumbList and ItemList JSON-LD | Yes |
| SEO-005 | Choosing "Nuevo" on a landing goes to `/listados?category=guitars&condition=Nuevo` (`noindex, follow`); a landing URL with a filter is forwarded there; landing pagination: `?page=2` past the last page redirects to page 1 (every local category fits one page even at 2 per page) | Yes |
| SEO-006 | Landing title, description, canonical and `og:url` the landing, `index, follow` | Yes (Not Run; needs production) |
| SEO-007 | The landing's heading, introduction, real cards, "Otras categorías" and "Compra con cuidado" | Yes (Not Run; the owner's) |
| REL-001 | Paged build: 2 cards per page, "Mostrando 1–2 de 12", pages 1, 2 … 6 | Yes, at the lowered page size |
| REL-003 | Paged build: `?condition=Nuevo` → page 2 keeps the filter (`?condition=Nuevo&page=2`) and back; F11: `?location=Lima&location=Arequipa&page=2` keeps both, "Mostrando 3–4 de 7" | Yes; F11 new |
| REL-004 | Paged build: every page walked twice: 12 listings, 12 distinct, the same order both times | Yes |
| PHOTO-010 | Each card's photo is its listing's first photo by `sort_order` (12 of 12) | Yes |
| PHOTO-016 | The first row loads eagerly, the rest lazily, through the unchanged `MarketplaceImage`; the local seed photos are `placehold.co` placeholders, which that component serves unoptimized by design, so the optimized path cannot be seen locally | Unchanged component; not observable locally |
| LIFE-007 | No sold listing in the local data; the query still filters `status = approved` | Not observable locally (Not Run) |
| FAV-003 | The card's heart signed out goes to `/login?next=%2Flistados`; no favourite row | Yes |
| FAV-007 | The heart on a card as the Particular; after a reload the card shows "Quitar de favoritos" pressed (removed again afterwards) | Yes |
| ALERT-001 | On `/listados?category=guitars&condition=Nuevo&location=Lima&min_price=100`, the panel saves `{"category":"guitars","location":"Lima","condition":"Nuevo","min_price":100}`, daily, with the success line (deleted again through the app). On a two-condition search there is no alert entry and the one-value line shows | Yes for one value; F11 as decided |
| ALERT-002 | Signed out, "Crear alerta" links to `/login?next=` with the search | Yes |
| AN-001 | The cards send `listing_impression` events with their own listing ids and source `catalog`; the local event API rejects them (below) | Client unchanged; recording not observable locally |
| AN-004 | `?brand=Fender&condition=Nuevo`: one search event with the actual state; F11 with no cards on screen: `"city": ["Lima", "Arequipa"]` recorded | Yes; F11 lists as decided |
| AN-006 | The same search records one `filter_applied` | Yes |

**A local-data limit found while re-running AN-001 and AN-004.** The local seed listings have ids like `20000000-0000-0000-0000-000000000008`, which are not RFC 4122 (version digit 0), so the event API rejects every impression with HTTP 400 on both builds; no impression was ever recorded on this stack. The browser sends events in batches, and a batch with one rejected event is rejected whole. Before 3a, in the 1280 × 720 window of this check, the cards sat below the fold when the catalog loaded, so the first batch held only the search; on 3a the compact title row puts cards in view, their impressions join the search's batch, and locally that batch fails (observed: `search, filter_applied, listing_impression ×N → 400` on 3a, `search, filter_applied → 200` before). With real listing ids (v4, `gen_random_uuid()`) every impression is valid, so production is not affected; searches without cards on screen record correctly on 3a, F11 lists included. The batch policy and the seed ids are outside 3a; flagged for a separate task.

## Deviations and choices for the owner

Logged as pending in `decisions.md` (P1–P4) and asked on the review page (I01–I04): item 1 is P1, item 2 is P2, items 8 and 9 are P3, items 3 to 7 are P4.

1. **One card everywhere.** `components/listing-card.tsx` is the only card, so the store inventory and the listing page's recommendations show the new card now, in their existing grids (the store page's three columns make the square photos large at 1440). Their grids are UX-4's. The shared `Pagination` also gives the store page numbered pages and the "Mostrando" line. Asked on the review page.
2. **The alert rule's scope.** "One value per filter" (Q19) is applied to condition and location, the F11 facets. Multiselect attributes (pickups, microphone use) already had several values before 3a and saved alerts accept them (`normalize_saved_search` takes arrays for attributes), so the alert stays offered there.
3. **"Todos"/"Todas" rows.** One-value facets (Categoría, Tipo, Vendedor, select attributes) start with a "Todos"/"Todas" row, the radio that clears them; short attribute chips clear when pressed again.
4. **Focus after a navigation.** Next focuses the new page's first node, which is not focusable, so keyboard focus would fall to the page. The page puts it back on the option just chosen (filter options keep their ids), the sort button, or the results count (after the sheet, a chip, "Limpiar todo" or a page number), without scrolling.
5. **Catalog links are not prefetched.** Without a loading boundary a prefetch of a catalog URL brings only the layout, and the filter column holds dozens of links.
6. **Shell links into the catalog** (the strip's "Instrumentos", "Tiendas verificadas", a type link, the header search) navigate as ordinary client links: the in-page pending state covers the page's own controls only.
7. **Small calls:** a reversed price range is read the way it was meant (500–100 becomes 100–500); the verified mark follows the words on the card's seller line ("Tienda verificada ✓", as in the concept); the phone count line abbreviates the sort ("Recientes"); the error state's "Reintentar" is a full load of the same URL.
8. **`Skeleton` has no consumer** since `loading.tsx` went; it stays (one exemption in `tests/ux-primitives.test.cjs`) for the listing page's streamed sections in UX-4. Deleting it is the alternative.
9. **`/api/listings/[id]/photos`** fed the old card's carousel; no page calls it now. It is left in place (an API removal is outside a visual task).

## Spec and acceptance rows touched (not edited)

`docs/functional-spec.md` and `acceptance/cases.tsv` are unchanged. The functional spec's catalog text describes no particular layout. The rows above were re-run as observations. N12 is still the owner's to record.

## Tests

| Test | Before | After |
| --- | --- | --- |
| `ux-shell.test.cjs` (strip, category menus) | Catalog destinations are native links | Client links (`data-client-link`), all three type links counted |
| `ux-shell.test.cjs` (new) | — | No `loading.tsx` in the catalog or landing routes; `ShellLink`/`isCatalogHref` gone; `CatalogResults` busy and idle markup and the 200 ms dim rule; chips and pagination are reporting client links; the shared view is wrapped in the provider |
| `ux-shell.test.cjs` (breadcrumbs) | The pages render `<Breadcrumbs items={[{ label: "Inicio"…` | The pages pass that trail to `CatalogView`, which renders it; still no phone back link |
| `ux-primitives.test.cjs` | `Chip` and `Radio` exempt as unused | Both consumed and checked; `Sheet` added; `Skeleton` is the one exemption (deviation 8) |
| `sprint-9.test.cjs:110–113` | The landing renders `ListingFilters`, `Pagination`, `ListingCard`, `SearchTelemetry` | The landing renders `CatalogView` with its filters, scope, listings, count, page and path; `CatalogView` renders `ListingFilters` with the filters, `Pagination` with page/total/path/params, one card per listing keyed by id; telemetry stays in the landing |
| `sprint-7.test.cjs` | `listingFiltersToSearchAlert` with `city`/`condition` | The same output from `cities`/`conditions`, plus null for two locations or two conditions |
| `analytics.test.cjs` | Search metadata from `city` | From `cities`/`conditions`: one value stays a string; several are a list bounded to 20 × 100 characters |
| `sprint-3-1.test.cjs:50`, `marketplace-tracking.test.cjs:301–308`, `favorites-browser-smoke.cjs` | — | Unchanged and passing (the card renders `{displayTitle}`; the catalog keeps its `searchReceipt` declaration; the card stays an `article`, the no-results title keeps "No encontramos resultados") |
| `ux-copy.test.cjs:144–146` (the home's featured card) | — | Unchanged in 3a: the home's card goes in 3b, where the check moves to the one card. The one card already has its own real-condition check in `ux-discovery.test.cjs` |

## Known limitations

- Chromium only. Safari, a screen reader and real phones are the owner's pass (N14) or UX-8.
- The local data has 12 public listings, so the 24-item pages and pagination were observed on paged scratch builds (2 per page); no sold listing exists locally (LIFE-007 is observed through the query and the catalog's contents only).
- The empty-catalog, empty-landing and error frames come from a scratch copy that forces those results.
- The brief's 135 kB catalog baseline was measured with `pnpm build` on `6fafbed`; the same-method baseline here is 136 kB.

## What still needs the owner

1. The review page https://claude.ai/artifact/NpxKr4FfUSLH65RZooTwdB: Correct/Wrong per check, and the accept / not-yet answer.
2. Recording N12 (unchanged from UX-2).

## How to review

Read `ux-3-discovery.md` (§ Proposed design 3a parts, § Filters with F11, § Owner answers), then this package; the frames are in `screenshots/ux3-after/` (before: `ux3-before/`). Reproduce: `review-guide.md` § UX-3a.
