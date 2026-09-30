# UX-1 Foundations — acceptance package

Status: **ready for owner acceptance** (30 Sep 2026), **audited and corrected the same day** (§ Audit, 30 Sep). Nothing is pushed or merged. Codex review pending.

Branch `ux/redesign`: the 9 Cowork commits on top of the final Sprint 9 head `49a38e5`, imported into the owner's repository from `laria-ux-redesign-ux1.bundle` as a local branch (checked out in the worktree `../mkt_instrumentos-ux`, so the catalog checkout is untouched), plus the audit commits. `origin/main` has since moved one docs-only commit (`f04e909`, Sprint 9 records; no file overlaps this branch). Rebase and rerun the checks before anything is pushed.

| # | Commit | Content |
| --- | --- | --- |
| 1 | `06f0d42` docs(ux) | Redesign workspace, screenshot harness `scripts/ux-snapshots.cjs`, "before" captures |
| 2 | `8fa616f` feat(ui) | Role tokens, Archivo, type classes, focus ring, skip link, one `<main>` |
| 3 | `6525abb` feat(ui) | `components/ui/` primitives and the status dictionary `lib/ui/status.ts` |
| 4 | `444ac25` refactor(ui) | Class migration across app, components and components_v0 |
| 5 | `816a3db` refactor(ui) | Every form on `Field` and `Button`; legacy palette removed |
| 6 | `2d647ef` feat(copy) | Glossary, orthography, jargon removal, status labels; copy and contrast tests |
| 7 | `54eb761` feat(ui) | Credibility fixes (D11), wordmark favicon, on-palette emails (D9) |
| 8 | `e639118` fix(ui) | Home cards without a photo get the same "Sin foto" treatment |
| 9 | `e466bc1` docs(ux) | `docs/design-system.md` rewritten, AGENTS.md pointer, "after" captures, this package |
| 10 | `f751a1f` fix(ui) | Primitives adopted across pages; one status dictionary for Admin, Compras y ventas and store standing; micro-label case; `tests/ux-primitives.test.cjs` |
| 11 | `740c725` docs(ux) | This package corrected, design-system components section, concept comparisons in `screenshots/ux1-audit/` |
| 12 | this commit, fix(copy) | Owner-approved glossary follow-up: "artículo"/"producto" replaced by the glossary words in UI, emails and SEO descriptions; copy test extended |

## Checks (after the audit)

- `pnpm lint`, `pnpm typecheck`, `pnpm build`: pass.
- `pnpm test`: 258/258 (254 before the audit; new: the dictionary and object-word tests in `tests/ux-copy.test.cjs` and two tests in `tests/ux-primitives.test.cjs`).
- Integration and browser-smoke scripts that name renamed labels were updated in Cowork but not run (they need a hosted or seeded Supabase): `tests/listing-lifecycle.integration.cjs`, `tests/analytics-browser-smoke.cjs`, `tests/photo-browser-smoke.cjs`.

## Acceptance criteria

Evidence from the audit: a production build of `ux/redesign` after the fixes, on the Mac, against the local Supabase stack (repo migrations, the local seed listings and stores, a local Particular test account and the local Admin; no Store Owner account exists locally). axe-core 4.11.4 (WCAG 2.1 A/AA) and a focus sweep of every visible focusable element ran on the 8 checked templates at 390 and 1440 px. Cowork's numbers (before/after axe counts, LCP) are kept where the audit did not redo them and are marked as such.

| # | Criterion | Evidence | Verdict |
| --- | --- | --- | --- |
| 1 | One typeface, ≤3 weights, no uppercase buttons or headlines, new price styles | Archivo on every template. No `font-extrabold`/`black`, no `uppercase` outside `.t-micro`. Weights in use: 400, 600, 700 and 750 (price). **Audit fix:** the metric cards showed labels of four words as uppercase micro labels (D6 allows ≤3); all metric labels are sentence case now. Prices render through `Price` (card, detail, table, favorites, home) | Met, with the owner question on 750 (a strict reading moves prices to 700 in one line) |
| 2 | Text ≥4.5:1, control boundaries ≥3:1 | Audit: **0** axe violations on all 16 template/width runs. `tests/ux-contrast.test.cjs` checks every declared token pair. Cowork: 381 failing elements before UX-1 | Met |
| 3 | Visible, consistent focus; skip link works | Audit: **682** focusable elements across the 16 runs, **0** without a 2 px ring (ink on light, blue on the frame). First Tab reaches "Saltar al contenido"; Enter moves focus to `#contenido` | Met |
| 4 | One implementation of each primitive; legacy styling gone | **Not met before the audit** (the Cowork row overstated it): `PageHeader`, `Price`, `Chip`, `AppliedChip`, `IconButton`, `Radio`, `CountBadge` and `Skeleton` had no consumer, `EmptyState` had one; about 35 page titles, 20 notices, 12 empty states, a pulse skeleton, a count badge (twice) and several tag spans were hand-written. **After:** `PageHeader` in 32 files, `EmptyState` 13, `Notice` (or `noticeClassName` + `NoticeIcon` where a ref moves focus or the notice holds buttons) 26, `Price` 5, `Tag`/`StatusTag` 14, and `CountBadge`, `AppliedChip`, `ChipLink`, `IconButton`, `Skeleton` in use. `tests/ux-primitives.test.cjs` fails if a primitive loses its last consumer or a hand-written copy comes back. Legacy `brass`/`cedar`/`mist`/`laria.*` classes: none | Met, with the exceptions listed below |
| 5 | One status dictionary; glossary applied; copy test passes | **Partly met before the audit:** three more status vocabularies were live. Admin labelled a report's target and the audit history with `adminValueLabel` ("Pendiente" for a listing in review, "Tienda" for an active store) and printed raw `declined`, `external`, `superseded` and `visible` in the transactions and reviews views; Compras y ventas used its own map (`transactionStateLabel`) while the dictionary's `claim` domain was unused; the store owner saw "Solicitud en revisión", "Tienda no pública". **After:** all read `lib/ui/status.ts` (new domains `transaction` and `review`, `storeStatusEntry`, `statusDomainForTarget`/`adminTargetStatusLabel`); the copy test checks them. **Owner-approved follow-up (30 Sep):** "artículo" and "producto" no longer name the object in the interface or the emails ("¿Compraste este equipo?", "Bajó de precio una publicación que guardaste", the trust lines); the defined term "Artículos prohibidos" and the legal pages (G2) keep theirs; a copy test enforces it | Met (two database strings remain, see open items) |
| 6 | No buyer-facing placeholders; badge never contradicts condition; no "Comprar ahora" | Test-enforced (`tests/ux-copy.test.cjs`); seen on the captures | Met |
| 7 | Favicon and emails on brand; one WhatsApp style and label | `app/icon.svg`, `app/apple-icon.png`; email template on the palette (muted grey only on the black header). All three WhatsApp buttons: yellow, glyph, "Contactar por WhatsApp" (test-enforced) | Met |
| 8 | Before/after at 390 / 768 / 1280 / 1440, public and signed in | Cowork's 116 + 116 local captures are not in the bundle; the repo holds 16 + 16 selected frames at 390 and 1440 only, and the "after" frames predate the audit fixes. Audit: 96 "after" captures at all four widths (public, Particular, Admin) in the local, gitignored `.ux-snapshots/ux1-audit/`, and the 16 concept comparisons in `screenshots/ux1-audit/` | Partly evidenced: no "before" set at 768 and 1280 in the repo, and no Store Owner captures |
| 9 | lint, typecheck, build, test pass; LCP not worse beyond font load; CLS ≤ 0.1 | Checks above. LCP/CLS: Cowork's lab numbers (below), not re-measured in the audit | Met (performance per Cowork) |
| 10 | design-system.md rewritten; D1–D12 decided | Rewritten in Cowork; the audit updated its components section (dictionary domains, `StatusEntryTag`, `PageHeader` rules, notice composition, the new test). `decisions.md` records D1–D12 as decided | Met |

Criterion 4 exceptions (deliberate, each owned by a later sub-sprint or pinned by a test):
- Raw form controls: the header search (UX-2), the catalog filters (UX-3), the two rules checkboxes whose labels contain links, and the Admin legacy-link radios and confirmation checkbox, whose markup `tests/sprint-8.test.cjs` pins. `Chip` (toggle) and `Radio` therefore have no consumer yet; the concepts use them in the sell form (UX-5) and the filter sheet (UX-3).
- Page titles that keep their own markup: headers on the black frame (store summary, store cover), the listing's product title, and the home hero (UX-3).
- Photo overlays (category, photo count, photo dots) and navigation active states are not tags or chips.

## Audit, 30 Sep (Claude Code)

The branch was checked against `ux-1-foundations.md` and its 10 criteria, from the code and a running build. Findings and what happened:

| Finding | Criterion | Fix |
| --- | --- | --- |
| Eight primitives unused, `EmptyState` used once; hand-written titles, notices, empty states, tags, prices, count badges and skeletons across account, Admin, auth, catalog, listing and store pages | 4 | Replaced with the primitives, layouts unchanged; regression test added |
| Admin: raw English statuses in transactions and reviews; report target and audit history on a second label map | 5 | Dictionary domains `transaction`, `review`; `adminTargetStatusLabel` |
| Compras y ventas state labels in their own map; dictionary `claim` domain unused | 5 | `transactionStateLabel` reads the dictionary; the state renders as a `StatusTag` |
| Store standing labels written three times ("Solicitud en revisión", "Tienda no pública", "Tienda") | 5 | `storeStatusEntry` on the account summary, the store page and Admin |
| Account summary rendered two `<h1>` when the profile was incomplete | a11y | The notice heading is an `<h2>` |
| Uppercase metric labels of four words | 1 (D6) | Sentence case |
| Favorites pagination links had no link styling; favorites and store errors were unstyled `<p role="alert">` | 4 | `.link`; `Notice` |
| Criterion 4 and 5 rows of this package overstated | — | Rewritten above |
| "artículo" and "producto" still named the object in about a dozen strings; the copy test did not check them | 5 (D8) | Owner approved the change: glossary words in the UI, emails, SEO store description and site description; Sprint 7 pins updated to the new wording; copy test extended |

Nothing in the audit changed a product rule, a query, a route or an open decision in `decisions.md`.

## Layout differences against the concepts

UX-1 changes type, color, components and copy, not layouts, so the page concepts and the final home differ from the build by design. `screenshots/ux1-audit/` holds 16 side-by-side images (concept left, build right, same width); open `screenshots/ux1-audit/index.html` for the notes per pair. In short:

| Page | Main differences | Owner |
| --- | --- | --- |
| Home (`01`–`05`) | Build keeps the photo hero with stats and icon category tiles; the final home has the art banner rotation, "En vitrina" with ink price tags, compact categories, "Cómo funciona Laria" and the sell block. The frame's yellow action is "Buscar" in the build, "Vender" in the concepts | UX-2, UX-3 |
| Catalog and filters (`06`–`08`) | Concept: compact title with count, inline alert and sort, checkbox facets with counts, two columns on phones, filter sheet with chips and a sticky "Ver N resultados". Build: intro panel, native selects with "Aplicar filtros", one column at 390 | UX-3 |
| Listing (`09`–`11`) | Concept: thumbnails, spec strip, Guardar/Compartir, seller card with ratings, sticky WhatsApp bar on phones. Build: two yellow WhatsApp buttons in one phone screen, seller panel separate, no sticky bar | UX-4 |
| Store (`12`) | Concept: compact identity header with stats, tabs, in-store search and chips, five columns. Build: black cover, three columns | UX-4 |
| Account (`13`, `14`) | Concept: light sidebar, status tabs with counts, row actions, bell and avatar in the header. Build: black account card, page header panel (test account has no listings) | UX-2, UX-6 |
| Sell (`15`) | Concept: photos first, type chips, condition radio cards with definitions, grouped sections, error summary. Build: single column in the old order, photos last | UX-5 |
| Admin (`16`) | Concept: own full-height sidebar, master-detail queue, review checklist, sticky decision bar. Build: public header, one card per item | UX-7 |

## Performance (Cowork, local lab, median of runs, production builds)

| Page | Width | LCP before → after (ms) | CLS after | Font |
| --- | --- | --- | --- | --- |
| Home | 390 / 1440 | 176 → 152 / 188 → 180 | 0 / 0 | +88 KB, one request |
| Catalog | 390 / 1440 | 308 → 296 / 408 → 432 | 0.002 / 0 | |
| Listing | 390 / 1440 | 156 → 136 / 176 → 152 | 0 / 0 | |
| Throttled 390 (1.6 Mbps, 150 ms RTT, CPU ×4): home, catalog, listing | | 596 → 684, 868 → 760, 564 → 708 | ≤ 0.033 | |

Localhost numbers only show direction: LCP moves within about 150 ms, which is the font download; CLS stays far under 0.1 thanks to the metric-matched fallback. Real-network numbers need a preview deployment.

## Changed labels, tests and acceptance rows

- Labels that tests pinned, updated in Cowork to the new wording without weakening: account navigation ("Compras y ventas", store "Publicar"), header ("Publicar"), Admin navigation ("Publicaciones históricas"), analytics ("Vistas por impresión"), the review filter call `statusText(item, domain)`.
- Glossary follow-up (owner-approved): "¿Compraste este artículo?" → "¿Compraste este equipo?" (Compras y ventas and its email); the price-drop email subject "Bajó de precio un producto que guardaste" → "Bajó de precio una publicación que guardaste"; trust lines say "el equipo" instead of "productos"; the store SEO description opens "Instrumentos y equipo de …"; the site description says "equipo de tiendas". `tests/sprint-7.test.cjs` follows the new wording with the same assertions.
- Audit label changes (dictionary only, meanings unchanged): the store owner's standing reads En revisión / Activa / Rechazada / Oculta / Tienda verificada (was "Solicitud en revisión", "Tienda", "Solicitud rechazada", "Tienda no pública"); a sold favorite reads "Vendida" (was "Vendido"); Admin reports and audit history read the dictionary ("En revisión" for a listing in review, "Activa" for a store); Admin transactions read "Rechazada por comprador", "Fuera de Laria", "Reemplazada" instead of raw values.
- No row of `acceptance/cases.tsv` was edited. Rows whose wording names an old label; the behavior is unchanged: TX-018 ("Compras" navigation), AN-012 ("CTR", now "Vistas por impresión"). Old names used as concepts, not labels: ADMIN-024, ADMIN-025, AN-017, STORE-019 (Store Owner); LIFE-012, REV-016, VERIFY-003, VERIFY-012 ("Tienda Verificada"). ADMIN-008 ("correct transaction confirmation state visible") is better served after the audit: declined and external records no longer show raw values.

## Deviations from the spec

- Archivo is self-hosted with `next/font/local` (the same variable file committed under `app/fonts/`, OFL) instead of `next/font/google`, so builds need no network.
- The home got two decided lines early: the H6 headline and the H4 sell-block copy, replacing slogans (D8 tone). The home layout itself is still UX-3.
- Admin "legacy" is now "Publicaciones históricas" (labels only; route `/admin/legacy` unchanged).
- The empty-state and "Sin foto" wording are new copy, within D8 and D11.
- `AppliedChip` renders a plain link, not `next/link`: the full page load also resets the catalog's uncontrolled filter form (the catalog used plain links for the same reason).

## Open items and findings

Owner questions (in `decisions.md`):
- **G1** Catalog page name: "Listados" stays in the header, footer, breadcrumb and SEO title until UX-2. Proposal: "Instrumentos".
- **G2** Legal pages keep "anuncios" and the defined term "Tienda Verificada" until a legal read.
- **G3** Password minimum is 6 at sign-up and 8 when resetting. Product rule, unchanged.

Found in the audit, not fixed (outside UX-1's reach without a layout change, or pinned wording):
- Photo dots on listing cards are 6 px buttons; the spec says targets are never below 24 px. They cannot grow without the card layout (UX-3). axe did not flag them because the local listings have one photo each.
- Two database strings still say "artículo"/"producto" and need a migration (not a UI change): the in-app notification written when a seller asks for purchase confirmation ("El vendedor indicó que compraste este artículo…", shown verbatim in Notificaciones) and the `LISTING_FIELD_REQUIRED` error text ("estado del producto"). For UX-5/UX-6, with owner approval.
- Store names appear as uppercase eyebrows on the store inventory and statistics pages; a name longer than three words breaks D6 (UX-6).
- The frame's yellow action is "Buscar" and the header keeps "Para tiendas" as an entry (UX-2, with G1).
- The listing page shows two yellow WhatsApp buttons in one phone screen (UX-4).

Found during UX-1 in Cowork, present on `49a38e5` too, not fixed (outside UX-1 scope):
- Listing detail logs an intermittent React hydration error (#418) in the browser.
- Admin and purchase dates can hydrate differently between Node and Chromium (ICU spacing in "12:29 a. m.").
- `/api/events` answers 400 on a local `http://` production build because the session cookie is `Secure`; production uses HTTPS.

## How to review

1. Read `docs/design-system.md` (the canonical reference).
2. Look at `screenshots/ux1-audit/` (concept vs build) and compare `screenshots/ux1-before/` with `screenshots/ux1-after/` (same file names; the "after" frames predate the audit fixes).
3. Run `pnpm test`; for a visual pass, run the app and `node scripts/ux-snapshots.cjs --label after` (the script header explains accounts and flags; `LARIA_AGENT_BROWSER_BIN` points it at an agent-browser that is not on the PATH).
