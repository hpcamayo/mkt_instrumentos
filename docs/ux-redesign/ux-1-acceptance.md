# UX-1 Foundations — acceptance package

Status: **ready for owner acceptance** (30 Sep 2026). Nothing is pushed or merged. Codex review pending.

Branch `ux/redesign`, 9 commits on top of the final Sprint 9 head `49a38e5` (the `main` head when the branch was cut). If `main` has moved by acceptance, the branch is rebased and the checks rerun before anything is pushed.

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
| 9 | this commit | `docs/design-system.md` rewritten, AGENTS.md pointer, "after" captures, this package |

## Checks

- `pnpm lint`, `pnpm typecheck`, `pnpm build`: pass.
- `pnpm test`: 254/254 (241 existing, 13 new in `tests/ux-copy.test.cjs` and `tests/ux-contrast.test.cjs`).
- Integration and browser-smoke scripts that name renamed labels were updated but not run here (they need a hosted or seeded Supabase): `tests/listing-lifecycle.integration.cjs`, `tests/analytics-browser-smoke.cjs`, `tests/photo-browser-smoke.cjs`.

## Acceptance criteria

Automated evidence comes from production builds of `49a38e5` (before) and `ux/redesign` (after) on the same local data: axe-core 4.13 (WCAG 2.1 A/AA) and a keyboard walk of the first 60 tab stops on 8 templates (home, catalog, listing, store, login, sell form, account summary, Admin queue) at 390 and 1440 px.

| # | Criterion | Evidence | Owner check |
| --- | --- | --- | --- |
| 1 | One typeface, ≤3 weights, no uppercase buttons or headlines, new price styles | Computed fonts: Archivo on every template (before: system stack). Weights used: 400, 600, 700 and 750 (before: 400–900, six weights). 750 is the price weight from the approved scale; the spec groups 700–750 as one "titles and prices" weight. If you read the criterion strictly, prices can move to 700 in one line | Look at home, listing, account |
| 2 | Text ≥4.5:1, control boundaries ≥3:1 | axe color-contrast: **0** failing elements after, **381** before (16 template/width runs). `tests/ux-contrast.test.cjs` checks every declared token pair | Spot-check on your phone |
| 3 | Visible, consistent focus; skip link works | Keyboard walk: **0** of 943 tab stops without a visible indicator after (before: 673). First Tab reaches "Saltar al contenido" and Enter moves focus to `#contenido` on all 8 templates (before: no skip link) | Tab through home and the sell form |
| 4 | One implementation of each primitive; legacy styling gone | `components/ui/`: Button, IconButton, Field + Input/Select/Textarea/FileInput/Checkbox/Radio, Tag/StatusTag/CountBadge, Chip/ChipLink/AppliedChip, Notice, EmptyState, PageHeader, Price, VerifiedMark, Skeleton. Raw form controls left outside `components/ui`: the header search (UX-2), the catalog filters (UX-3), the two rules-acceptance checkboxes whose labels contain links (styled like `Checkbox`), and three Admin controls whose markup a Sprint 8 test pins. `brass`, `cedar`, `mist`, `laria.*` and the `--laria-*` aliases are deleted; a grep finds no use | — |
| 5 | One status dictionary; glossary applied; copy test passes | `lib/ui/status.ts` feeds StatusTag, `listingStatusLabel` and the Admin filters ("Aprobada" shows as "Publicada"). `tests/ux-copy.test.cjs` passes: tildes, ¿, no exclamations, no V1 / legacy / Store Owner / metadata / Supabase / CTR / "base de datos", retired glossary names absent. Two exceptions on purpose: G1 and G2 below | Read the account pages |
| 6 | No buyer-facing placeholders; badge never contradicts condition; no "Comprar ahora" | Fake home listings, demo stores and the community block removed; empty home sections show an empty state or hide. Badge = real condition. "Sin foto" and a store cover + monogram replace "Foto / Banner / Logo pendiente". Test-enforced | Home with and without listings |
| 7 | Favicon and emails on brand; one WhatsApp style and label | `app/icon.svg` + `app/apple-icon.png` from the wordmark. Email template on the palette. All three WhatsApp buttons: yellow, glyph, "Contactar por WhatsApp" (test-enforced) | Check the tab icon; send yourself a test email when the worker runs |
| 8 | Before/after at 390 / 768 / 1280 / 1440, public and signed in | 116 + 116 captures (local, gitignored `.ux-snapshots/before` and `after`); 16 + 16 selected frames in `screenshots/ux1-before/` and `screenshots/ux1-after/` | Compare the frames |
| 9 | lint, typecheck, build, test pass; LCP not worse beyond font load; CLS ≤ 0.1 | See Checks and Performance | — |
| 10 | design-system.md rewritten; D1–D12 decided | `docs/design-system.md` rewritten from the spec; AGENTS.md points to it and to this folder. `decisions.md` records D1–D12 as decided | — |

## Performance (local lab, median of runs, production builds)

| Page | Width | LCP before → after (ms) | CLS after | Font |
| --- | --- | --- | --- | --- |
| Home | 390 / 1440 | 176 → 152 / 188 → 180 | 0 / 0 | +88 KB, one request |
| Catalog | 390 / 1440 | 308 → 296 / 408 → 432 | 0.002 / 0 | |
| Listing | 390 / 1440 | 156 → 136 / 176 → 152 | 0 / 0 | |
| Throttled 390 (1.6 Mbps, 150 ms RTT, CPU ×4): home, catalog, listing | | 596 → 684, 868 → 760, 564 → 708 | ≤ 0.033 | |

Localhost numbers only show direction: LCP moves within about 150 ms, which is the font download; CLS stays far under 0.1 thanks to the metric-matched fallback. Real-network numbers need a preview deployment.

## Changed labels, tests and acceptance rows

- Labels that tests pinned, updated to the new wording without weakening: account navigation ("Compras y ventas", store "Publicar"), header ("Publicar"), Admin navigation ("Publicaciones históricas"), analytics ("Vistas por impresión"), the review filter call `statusText(item, domain)`.
- No row of `acceptance/cases.tsv` was edited. These rows describe behavior under an old label; the behavior is unchanged: TX-018 ("Compras" navigation), AN-012 ("CTR", now "Vistas por impresión"). These use old names as concepts, not labels: ADMIN-024, ADMIN-025, AN-017, STORE-019 (Store Owner); LIFE-012, REV-016, VERIFY-003, VERIFY-012 ("Tienda Verificada").

## Deviations from the spec

- Archivo is self-hosted with `next/font/local` (the same variable file committed under `app/fonts/`, OFL) instead of `next/font/google`, so builds need no network.
- The home got two decided lines early: the H6 headline and the H4 sell-block copy, replacing slogans (D8 tone). The home layout itself is still UX-3.
- Admin "legacy" is now "Publicaciones históricas" (labels only; route `/admin/legacy` unchanged).
- The empty-state and "Sin foto" wording are new copy, within D8 and D11.

## Open items and findings

Owner questions (in `decisions.md`):
- **G1** Catalog page name: "Listados" stays in the header, footer, breadcrumb and SEO title until UX-2. Proposal: "Instrumentos".
- **G2** Legal pages keep "anuncios" and the defined term "Tienda Verificada" until a legal read.
- **G3** Password minimum is 6 at sign-up and 8 when resetting. Product rule, unchanged.

Found during UX-1, present on `49a38e5` too, not fixed (outside UX-1 scope):
- Listing detail logs an intermittent React hydration error (#418) in the browser.
- Admin and purchase dates can hydrate differently between Node and Chromium (ICU spacing in "12:29 a. m.").
- `/api/events` answers 400 on a local `http://` production build because the session cookie is `Secure`; production uses HTTPS.
- The price-drop email subject says "producto"; a Sprint 7 test pins it. For UX-6.

## How to review

1. Read `docs/design-system.md` (the new canonical reference).
2. Compare `screenshots/ux1-before/` with `screenshots/ux1-after/`, same file names.
3. Run `pnpm test`; for a visual pass, run the app and `node scripts/ux-snapshots.cjs --label after` (header of the script explains accounts and flags).
