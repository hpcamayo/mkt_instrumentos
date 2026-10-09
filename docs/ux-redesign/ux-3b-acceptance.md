# UX-3b Discovery, part 2 (the home) — acceptance package

Status: **accepted by the owner, 9 Oct 2026** (review page https://claude.ai/artifact/EYTr4nHqS4u1GHLZeoaAM1: 37 of 37 checks Correct; § Owner acceptance (9 Oct)). Built 9 Oct 2026 on `ux/redesign` against the approved brief `ux-3-discovery.md`, the owner's answers Q1–Q20 and the 3a acceptance. Nothing is pushed, merged or deployed. The review page also carried N12, refreshed for the shell as it ships (§ N12, ready to record): all ten items marked Correct, option A for PUB-008, PUB-010 and PUB-015; recorded the same day at the owner's request, status Pass.

## What changed

| # | Commit | Content |
| --- | --- | --- |
| 1 | `eeeb7ad` chore(ux) | **The local photo fixture**, `scripts/ux-local-photos.cjs`: ten seed listings get 2 to 5 photos on a local Supabase only (it refuses other URLs; fixed ids, idempotent, `--remove` undoes it). Seven categories then qualify for the vitrina, so its rules show: the five most recent winners, an older guitar winning over a newer one-photo guitar, cymbals below the threshold (2 photos), a pending store's guitar never public |
| 2 | `7806053` feat(home) | **The home.** The home header and its "Categorías" panel (`getShellLayout("/")`: home header, no strip, no phone search row, full footer); the banner (one of nine pieces per request, only its image preloaded, `<picture>` WebP 1x/2x and JPEG, `alt=""`, fixed heights, the brand search); the card's showcase variant and "En vitrina" (Q12); "Explora por categoría" with counts (Q10 B); "Recién publicados" (Q15 B); "Cómo funciona Laria" (H4); "Tiendas verificadas" (Q18 A); the sell block. `components_v0/` and the old home query removed; `buildHomeMetadata` and the Organization JSON-LD kept. The banner files moved from `art/rotation/` to `public/banners/`. Tests; `docs/design-system.md` § Home |
| 3 | docs/chore(ux), the commit that adds this package | Evidence: `scripts/ux-audit.cjs` (home checks), `scripts/ux-snapshots.cjs` (the home's menu frame), `scripts/ux-home-rerun.cjs` (new), `scripts/ux-pub-rerun.cjs` (the 3b shell), captures in `screenshots/ux3b-before|after/`, this package, `ux-2-reconciliation.md` (N12 refreshed), README, roadmap, decisions, review guide |

No schema, migration, RLS, auth, moderation or lifecycle change. The only new queries are the read-only ones the owner approved: the vitrina's eight per-category queries on `listing_photo_count` (Q12) and the nine head counts (Q10 B). The feed and the stores reuse the old home's two queries with new limits (the newest 16 approved listings, the newest 3 active verified stores).

## Checks

- `pnpm lint`, `pnpm typecheck`, `pnpm build`: pass.
- `pnpm test`: **305/305** (291 before 3b). New: `tests/ux-home.test.cjs` (11 tests: the banner pick, preload and markup, the banner search, the vitrina selection, the feed exclusion, the queries with a recording client, a failed vitrina query, the page's sections and order, vitrina and feed markup, the promises and the stores, the states); in `tests/ux-shell.test.cjs` the home header and its panel (2 tests); in `tests/ux-discovery.test.cjs` the showcase tile (1 test).
- SEO: `tests/seo-smoke.test.cjs` passes in the suite; `tests/seo-rendered-metadata-smoke.cjs` **passes** on the 3b build (`--site=http://localhost:3000`, the local `NEXT_PUBLIC_SITE_URL`; Admin records with a local Admin session; home JSON-LD verified). Waived, as in 3a, for lack of local data: a sold listing and an empty category.

## Evidence setup

Production builds (`next build` + `next start`, stopped by port) against the local Supabase stack (127.0.0.1:54321; the worktree's `.env.local`), with the accounts from `scripts/ux-local-accounts.cjs` and the photo fixture applied. Chromium through agent-browser, axe-core 4.11.4.
- **3b**: the worktree at `7806053`, port 3300.
- **Before**: a scratch `git archive` of `d08a135` (3a accepted, the last commit before 3b), port 3100.

## Acceptance criteria (3b)

| # | Criterion | Evidence | Verdict |
| --- | --- | --- | --- |
| 1 | The home matches the brief, H1–H11, N8, N12 and audit items 2, 3, 6, 7, 8, 9, 11, 12, 15, 16, 17 (4, 13 as answered) at the four widths | Captures `screenshots/ux3b-after/` (the home and its open menu at 390 / 768 / 1280 / 1440, signed out; the signed-in home at 390 and 1440); § The home as built; the deviations below | For the owner (review page) |
| 2 | One banner per visit, chosen on the server; only its image loads; decorative; no layout shift; LCP reported | § Banner, layout shift and LCP: one banner file requested at 390, 768 and 1440 (the one for the viewport), `alt=""`, a fixed 300 px band (art 150 px + text on phones), layout shift 0 signed out; LCP is the banner art, median 80 ms locally (tests: one of nine, two media-scoped preloads of the same piece) | Met |
| 3 | Vitrina and feed rules hold on local fixture data | § Acceptance rows re-run, "3b-3": seven categories qualify; the five most recent winners show; the vitrina and the feed recomputed in SQL as the anon role equal the page exactly; no overlap; the pending store's 3-photo guitar never appears; phones show six feed cards | Met |
| 4 | The "Categorías" menu passes the shell menu checks and gives every category and type destination | § Audit, home checks (24 menu checks at 390 / 768 / 1440, 0 failures, axe 0 open); PUB-012: its 27 destinations equal `categoryMenus` for every visitor; one type link per category followed from it lands on the catalog with both chips | Met |
| 5 | 3a's criteria 3–7 hold for the home: product rules (rows re-run), the audit, first-load JS, the SEO smokes, tests | Rows: same behaviour (observations below). Audit: axe 0, focus, Tab order, one `<main>`/`<h1>`, closed panels absent, no overflow (also at 640 / 720), no layout shift signed out. First-load JS: no limit for the home in the brief; 114 → 127 kB in the build table, +3.6 kB downloaded (§ First-load JS, P10). SEO smokes pass. Tests 305/305, none weakened | Met, with P10 for the owner |

## The home as built

`docs/design-system.md` § Home is the reference; the brief is `ux-3-discovery.md` § Home. In short:
- **Home header**: logo; "Categorías ⌄" (a disclosure: "Todos los instrumentos", the eight categories each with its types, "Tiendas verificadas"; four columns of two rows from 768 px, one stacked list scrolling inside the panel on phones; rendered only while open); "Tiendas verificadas" from 768 px; "Cómo funciona" from 1024 px; "Vender" and the account entry. No search in the bar, no strip, no phone search row.
- **Banner**: one of the nine pieces per request; desktop a 300 px band with the centred `h1` (40/44), the lead and the 640 px search with "Explorar" (52 px); phones the 390×150 art strip fading over 40 px into frame black, then the text (28/32) and a 56 px search with a 44 px "Explorar".
- **En vitrina**: five showcase tiles (bordered box, square photo, ink price tag, category, one-line title, seller words; no favourite), "Ver las 12 publicaciones" on the title line.
- **Explora por categoría**: eight landing tiles with counts ("2 publicaciones", "1 publicación").
- **Recién publicados**: grid cards (`h3`), eleven and the end tile on desktop (six columns from 1280 px), six and "Ver las 12 publicaciones" on phones; the vitrina's listings left out.
- **Cómo funciona Laria** (`#como-funciona`), **Tiendas verificadas** (three stores, no stats, "¿Tienes una tienda?"), the **sell block**, the full footer.

## Audit

`scripts/ux-audit.cjs` on the 3b build at 390 / 768 / 1280 / 1440 (report `.ux-snapshots/ux3b-audit/audit.json`, gitignored). Templates: the home (signed out and, new, as the Particular), the catalog, the multi-value catalog, no results, two landings, a listing, a store, sign-in, 404, the account summary, the publishing page, Admin and its two 404s.

| Check | Result |
| --- | --- |
| axe-core WCAG 2.1 A/AA on 72 template runs (18 templates × 4 widths) and with each shell menu open | **0 violations** |
| Focus sweep | 2,698 focusable elements, **0 without a 2 px ring**; the home: 48–58 per width, 0 without a ring, 0 Tab-order problems in the header |
| Skip link, Tab order, one `<main>` and one `<h1>`, public/Admin frame | 0 failures (the home's `h1` is the banner headline) |
| Horizontal overflow (also 640 / 720 px, the 200% zoom stand-in, on 8 routes including the home) | **0 pages** |
| Category menus (N12) and discovery checks (3a) | 34 and 25 checks, 0 failures |
| Layout shift (home, catalog, a landing, a listing, account; signed out and Particular, 390 and 1440) | home **0** signed out; max **0.0016** signed in on every page (the signed-in header's account entry, as in UX-2 and 3a) |

**Home checks (29, all pass):**
- "Categorías" at 390 / 768 / 1440: closed, it is not in the page (`aria-expanded="false"`, no panel node); open, it shows 27 destinations, axe 0 with it open, no overflow, and at 390 it scrolls inside itself.
- Keyboard (own sessions): Enter opens it, Tab lands on "Todos los instrumentos", Esc closes it with focus back on "Categorías".
- Closing: an outside press closes it; a client route change (to `/listados` and back) leaves it closed.
- Destinations at each width: "Todos los instrumentos" → `/listados`, "Baterías" → `/instrumentos/baterias`, "Guitarras eléctricas" → `/listados?category=guitars&instrument_type=electric_guitar` (the type marked current in the filter column at 1440), "Tiendas verificadas" → `/listados?seller_type=verified_store`; no menu left open on arrival.
- One menu at a time (Particular, 390 and 1440): opening the account menu closes "Categorías" and opening "Categorías" closes the account menu.
- "Cómo funciona" (1440) lands on `/#como-funciona` with the section at the top.
- The banner at 390 / 768 / 1440 and LCP: § Banner, layout shift and LCP.

## Banner, layout shift and LCP

From the audit's home checks (fresh browser per load) and a separate comparison of both builds on a quiet machine (`lcp`: seven cold loads per width, a fresh browser each).

| | 390 px | 768 px | 1440 px |
| --- | --- | --- | --- |
| Banner files requested | 1 (`…-phone.webp`) | 1 (`…-desktop.webp`) | 1 (`…-desktop.webp`) |
| Preloads | 2 of the same piece, `media` `(min-width: 768px)` and `(max-width: 767px)` | same | same |
| Band height | 346 px (150 art + text) | 300 px | 300 px |
| Image loaded, `alt=""` | yes | yes | yes |
| Layout shift (signed out) | 0 | 0 | 0 |

| LCP, cold loads, local build | 390 px | 1440 px |
| --- | --- | --- |
| Before (`d08a135`), the stock hero photo through `/_next/image` | median 44 ms (40–68) | median 56 ms (44–72) |
| 3b, the banner art (`/banners/<piece>-phone.webp` / `-desktop.webp`) | median 80 ms (76–100) | median 80 ms (68–96) |

- The LCP element is an image in both builds: before the stock concert photo, now the decided art (P11's owner-approved exception, H7, H9).
- Locally the home answers its first byte later: median 25 ms against 16 ms (curl, seven requests each), because it runs 19 read queries in parallel (8 vitrina, 1 feed, 9 counts, 1 stores) where the old home ran 2. The rest of the difference is the image itself: the banner's 1x files average 21 KB.
- These are loopback numbers with no network: they show what the largest element is and that it is preloaded, not field performance. A real connection adds the file's transfer and the server's distance to Supabase.

## First-load JS

`next build` output, same machine and method for both columns.

| Route | Before (`d08a135`) | 3b (`7806053`) |
| --- | --- | --- |
| `/` (home) | 114 kB | **127 kB** |
| `/listados` | 141 kB | 141 kB |
| `/instrumentos/[slug]` (landings and listings) | 209 kB | 208 kB |
| `/tiendas/[slug]` | 196 kB | 195 kB |
| Shared by all | 102 kB | 101 kB |

The home's column rose 13 kB, but what a browser downloads rose 3.6 kB:
- **Cold load of the home** (every script the page fetched, measured in the browser at 390 and 1440): 204.8 kB before, 208.4 kB after (gzip, the same at both widths).
- **The build's own chunks for the home** (layout and page together, gzip): 136.1 kB before, 139.7 kB after.
- **Why the column jumps:** the home now renders the one card, whose modules (tailwind-merge through `Price` and `VerifiedMark`, the type labels for the spec line, next/image) the layout and the catalog already load. The build table now counts them for the page too. A lighter card (its static parts rendered on the server, the favourite and the impression as small client parts) would lower every grid page; that is proposed for UX-8, not done here (P10).
- **The catalog's 141 kB** is the 3a head (`d08a135`), unchanged by 3b. The 3a package measured 140 kB at `6651815`; the same commit rebuilt in this session also prints 141 kB, so the difference lies between the two measurements, not in the code (neither the 9 Oct id fix nor 3b). 3a's limit of 140 kB is therefore met only by its own measurement; the catalog sits at the limit either way.

## Acceptance rows re-run (observations; no status written)

`scripts/ux-home-rerun.cjs` on the 3b build, signed out, counting rows and events in the local Postgres before and after its own steps; the vitrina and the feed recomputed in SQL as the anon role (RLS applies, as on the site). Report: `.ux-snapshots/ux3b-rows/rows.json` (gitignored). Observations only: the owner records any status.

| Row | Observed on the 3b build | Same as before 3b? |
| --- | --- | --- |
| 3b-3 (criterion 3) | Seven categories qualify (cymbals stop at 2 photos); the five most recent winners show: micrófonos CAD, bajo Ibanez, batería Pearl, interfaz Behringer, amplificador Fender; NUX (pedals) and Yamaha F310 (guitars) qualify but are older. The anon SQL and the page agree exactly; the newer one-photo Squier does not win guitars; the 3-photo guitar of the pending store "Ritmo Sur Music" never appears. The feed is the other seven public listings in catalog order, with no overlap. Phones: 160 px tiles scrolling sideways, six feed cards, "Ver las 12 publicaciones", no overflow | New in 3b |
| PUB-001 | `/` signed out: no sign-in; the home header (logo, "Categorías", "Tiendas verificadas", "Cómo funciona", "Ingresar"), the banner search, the six sections, the full footer; "Categorías" offers the 27 category and type destinations | Yes: public, with marketplace navigation (the menu replaces the strip, N12/Q14) |
| PUB-006 | Payment, delivery, guarantee and email words on the home (main and footer): only "No procesa pagos ni envíos: eso lo acuerdan ustedes.", "Hablas con quien vende y acuerdan pago y entrega. Laria no cobra comisión.", the Yape/Plin safety line and the footer's "…no procesa pagos, no retiene dinero, no gestiona envíos ni garantiza el equipo ni las transacciones."; no email promise | Yes (Not Run; the owner's) |
| SEO-002 (home links) | "Explora por categoría": the eight landings in taxonomy order with counts equal to the anon SQL (2, 2, 1, 1, 2, 1, 2, 1; total 12); no `/listados?` link. Followed "Guitarras": `/instrumentos/guitarras`, "Guitarras en venta en Perú", 2 real cards, canonical the landing, `index, follow`, BreadcrumbList and ItemList | Yes |
| AN-001 (home) | Loading the home and bringing the feed into view at 1440: 12 `listing_impression` events, one per card on the page (5 vitrina tiles, 7 feed cards), every one with source `home` and its own listing; none for a listing not on the page | Yes (the old home recorded `home` too, through `ListingImpressionBoundary`) |
| PUB-009 (banner) | The banner search at 1440: typing "MarcaInexistenteUX3b": 0 search events; Enter: `/listados?brand=MarcaInexistenteUX3b`, "0 resultados", exactly 1 search event (`zero_results: true`); back on the home and focusing the field: 0. Also at 390 and for the header search on `/listados` (§ N12) | Yes: the banner search records nothing itself |

`ListingImpressionBoundary` (`components/marketplace-telemetry.tsx`) wrapped the old home's cards; no page uses it now (the card records its own impressions). It stays, since `tests/marketplace-tracking.test.cjs` exercises the impression hook through it; removing it is a small follow-up.

## N12, ready to record

`ux-2-reconciliation.md` is refreshed for the shell after 3a and 3b and is on the review page as group G, one check per item: the spec paragraph, the optional legal-pages line, and PUB-008 to PUB-015, each with the exact evidence text to record (`<result>` left for the owner's status word) and its observation; options A and B for PUB-008, PUB-010 and PUB-015.

What changed since the 8 Oct approval:
- The home has its "Categorías" menu and the banner search instead of the strip and the header search; the spec paragraph says so and every row was re-run on it.
- PUB-012's evidence cites the applied chips and the filter column, not the filter selects 3a removed.
- PUB-013's gap note goes: catalog links are client links since 3a.
- The phone search sentence no longer says "a row on the home".

Re-run on this build (`scripts/ux-pub-rerun.cjs`, updated for the 3b shell) at 1440, 768 and 390, signed out and as the Particular, the Store Owner and the Admin: every observation matches the proposed texts (51 shell snapshots with one `<main>` and no overflow; 27 home destinations equal to the taxonomy for every visitor; 24 type links followed, all landing with both chips; every menu closing on Esc, outside press, destination and route change). After the owner marks the page, the owner records N12, or Claude Code writes exactly the texts marked Correct when asked in the session.

## Deviations and choices for the owner

Logged as pending in `decisions.md` (P6–P10) and asked on the review page.

1. **P6. The vitrina and store rows below 1024 px.** The brief puts five vitrina tiles in one row from 768 px; there a tile is 128 px and its category, title and city truncate to almost nothing. Built: both rows scroll sideways inside their sections below 1024 px (160 px vitrina tiles on phones, 192 px on tablets; 256 px store tiles), five and four columns from 1024 px.
2. **P7. The showcase tile.** The photo fills the top of the bordered box edge to edge, as in the concept, and the caption has the 12 px padding. Below 1280 px the city takes its own line above "Tienda verificada ✓": the words and the mark alone fill a 160–203 px tile, and on one line the city was cut to a letter.
3. **P8. Fallbacks.** When the vitrina holds every listing, "Recién publicados" is left out (its empty state is for a marketplace with nothing published). When the counts fail, the links read "Ver todo el catálogo" and the tiles show no count. One listing reads "1 publicación" and "Ver la publicación".
4. **P9. Files and one colour.** The 54 banner files moved from `art/rotation/` to `public/banners/` (a git rename, so the repository holds them once); the manifest, rules, rotation sheet and generators stay in `art/rotation/`. The phone lead uses `line-deco` (#C8CDD6) as on desktop, not the manifest's #D5D9E2, which is not a token.
5. **P10. First-load JS** (§ First-load JS): accepted as is; a lighter card proposed for UX-8.
6. **Small calls** (listed on the review page with P10):
   - In the "Categorías" panel the category name itself opens its landing (no "Ver todos"), and a type that mirrors its category repeats its name ("Bajos" under "Bajos"), as in the strip's menus (the same `categoryMenus`).
   - The header's links sit in a `nav` named "Navegación principal".
   - "Explora por categoría" has eight columns from 1280 px and four from 768 px (at 1024 px eight would make 100 px tiles).
   - A section link's hit area grows to 44 px on phones without moving the title line.
   - A store with a logo shows it instead of the initials.
   - On a 390 px phone the banner search shows "Busca por marca: Yamaha," before the field cuts the placeholder (the field is about 200 px wide beside "Explorar").
   - The vitrina tiles load eagerly (they are in the first screen at 1440); the feed cards load lazily.
   - `ListingImpressionBoundary` has no page left using it (§ Acceptance rows re-run); it stays for its tests.

## Spec and acceptance rows touched (not edited)

`docs/functional-spec.md` and `acceptance/cases.tsv` are unchanged. The functional spec's home row ("Public homepage… exist") describes no layout. The rows above were re-run as observations. N12 was recorded afterwards at the owner's request (§ Owner acceptance).

## Tests

| Test | Before | After |
| --- | --- | --- |
| `sprint-9.test.cjs:369–370` | `components_v0/categories-section.tsx` links the landings; the hero has no `/listados?category=` | `components/home/home-sections.tsx` links the landings through `categoryLandingPath`; neither it nor the banner has `/listados?category=` |
| `sprint-9.test.cjs` (LEGAL-005/006 trust surfaces) | `components_v0/trust-section.tsx` among the surfaces checked for guarantee claims | `components/home/home-sections.tsx` and `components/home/home-banner.tsx` |
| `sprint-9-gate.test.cjs:185–189` | `CategoriesSection` renders landing hrefs and no `/listados?` | `CategoryTiles` renders exactly the eight landing hrefs in taxonomy order and no `/listados?` |
| `ux-copy.test.cjs:144–146` | The featured card renders `{listing.condition}` and no literal "Nuevo" | The one card computes its spec line with `getCardSpecLine`, which starts with the listing's own condition; no literal "Nuevo"/"Usado"; the home renders only the one card (two uses) |
| `ux-shell.test.cjs:63` | `/`: standard header, strip, phone search row, full footer | `/`: home header, no strip, no phone search row, full footer; `SiteShell` picks `HomeHeader` |
| `ux-shell.test.cjs` (new) | — | The home header (Categorías closed and absent from the page, Tiendas verificadas from 768 px, Cómo funciona from 1024 px, no search, the outline "Vender"); the panel's 27 destinations in order equal `categoryMenus`, all client links, 44/36 px rows, types indented on phones |
| `ux-copy`, `ux-contrast`, `ux-primitives` | Walk `components_v0` | Walk `app` and `components` (the folder is gone; `components/home` is inside `components`) |
| `ux-discovery.test.cjs` (new) | — | The showcase tile: one tab stop, no favourite, the ink tag as the only price, the category, the one-line `h3`, the seller words with the city on its own line below 1280 px, no photo count or spec line |
| `ux-home.test.cjs` (new) | — | See § Checks |

## Known limitations

- Chromium only. Safari, a screen reader and real phones are the owner's pass (N14) or UX-8.
- Local seed photos are `placehold.co` placeholders (grey with text), so the vitrina shows no real photography; the 3+ photos come from the fixture.
- The local data has 12 public listings, so the feed shows seven cards on desktop (eleven fit) and the "two rows of six" are seen only in the tests.
- Failed and empty states are covered by the tests (§ Checks); no scratch build forced them in a browser.
- LCP is measured on a local production build over loopback, without network throttling: it shows the order of events (what is the largest element, that the banner is preloaded), not field performance.

## Owner acceptance (9 Oct)

The owner marked the review page on 9 Oct: **37 of 37 checks Correct**. Claude Code read the answers from the page's store (collection `checks`); no answer was inferred. With it the owner:
- accepted the home header and its "Categorías" menu (A01–A04), the banner and its search (B01–B04), the vitrina and its rules (C01–C03), the other sections, spacing and states (D01–D06) and the evidence (E01–E04), H01 included: **UX-3b is accepted**;
- kept the five choices as built (`decisions.md` P6–P10): the vitrina and store rows scroll sideways below 1024 px (F01); the showcase tile's edge-to-edge photo and the city on its own line below 1280 px (F02); the fallbacks (F03); the banner files in `public/banners/` and the phone lead in `line-deco` (F04); the home's first-load JS as is, with a lighter card proposed for UX-8, and the small calls (F05);
- marked every N12 item Correct (G01–G10): the spec paragraph and the optional legal-pages line as written, and the PUB-008 to PUB-015 evidence texts as written, with **option A** (keep the row's words, add the evidence) for PUB-008, PUB-010 and PUB-015. The notes gave no status word for the `<result>` placeholders; in the session the owner then asked to "mark n12 as pass", and Claude Code recorded exactly those texts with Pass (`ux-2-reconciliation.md`).

**Still open (none blocks UX-4):**
1. ~~Recording N12.~~ Recorded 9 Oct at the owner's request: status Pass for PUB-008–PUB-015, the clarification and the legal-pages line in the functional spec.
2. A lighter card for every grid page (P10), proposed for UX-8.
3. `ListingImpressionBoundary` has no page left using it (a small follow-up).

## How to review

Read `ux-3-discovery.md` (§ Home, § States, § Owner answers), then this package; the frames are in `screenshots/ux3b-after/` (before: `ux3b-before/`). Reproduce: `review-guide.md` § UX-3b.
