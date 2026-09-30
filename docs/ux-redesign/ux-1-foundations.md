# UX-1 Foundations — pre-implementation package

Status: **approved by the owner** (D1–D12 as recommended; confirmed 2026-09-30). Implemented on branch `ux/redesign`, based on the final Sprint 9 head `49a38e5`; acceptance package in `ux-1-acceptance.md`. The implemented system is documented in `docs/design-system.md`. Visual concepts: "Laria Redesign" canvas, page "UX-1 Fundamentos".

## Sub-sprint

**UX-1 Foundations: one visual and content language, applied through shared primitives.**

Every later sub-sprint composes pages from what UX-1 defines. Without it, each page redesign would invent its own type, colors and controls again; that is how the current three-layer UI happened. UX-1 changes how everything looks and reads, and fixes contrast and focus product-wide. It deliberately leaves page layouts alone.

## Problems solved (evidence in `audit.md`)

- **P3 contrast.** Blue as text 146× (2.46:1 on white). Grey #9DA3AF as text 30× (2.53:1). Yellow as text 24× (1.27:1 where on light). Input borders 1.60:1. Focus rings ≈1.2–2.5:1.
- **P5 typography.** System font stack; weight 900 is the most used (234); 70 uppercase strings; 14 bespoke shadows.
- **P10 systems.** Two token systems, 9 field implementations, ~15 page headers, 6 status dictionaries, `window.confirm` ×5.
- **P11 copy.** Missing tildes and ¿ on public pages; 16 concepts with 2+ names; jargon (V1, legacy, Store Owner, CTR, metadata, "base de datos").
- **P4/P8 (credibility subset).**
  - Placeholders shown to buyers: "Banner pendiente", "Logo pendiente", "Bloque visual temporal…".
  - "NUEVO" badge on used listings; "COMPRAR AHORA" implies checkout; "Destacados para ti" is not personalised.
- **P12 touchpoints.** Favicon is not the brand; emails use another yellow (#ffd43b).
- **A11y gaps.** No skip link; nested `<main>`; no `aria-invalid` / `aria-describedby`.

## Proposed direction

### Typography (D1, D5, D6)
- **Archivo** variable, self-hosted with `next/font/google`, `subsets: ['latin']`, axes `wght` + `wdth`. One file, ≈87 KB, tabular figures available, Spanish complete.
- Weights: 400 reading, 600 UI and labels, 700–750 titles and prices. No 800/900.
- Width: titles, model names and prices at semi-condensed (`font-stretch: 87.5%`); reading text at 100%.
- Scale (px, size/line):

| Token | Size | Weight / width | Use |
| --- | --- | --- | --- |
| micro | 12/16 | 600, uppercase +0.04em | Labels of ≤3 words |
| meta | 13/18 | 400, ink-2 | Metadata |
| ui | 14/20 | 400/600 | Controls, table cells |
| body | 16/24 | 400 | Reading text and inputs; max 68 characters per line |
| card-title | 15/19 | 700 semicond. | Card titles, 2 lines max |
| card-price | 18/22 | 750 semicond., tabular | Card prices |
| section | 20/26 | 700 semicond. | Section headings |
| page | 28/32 → 34/38 at ≥1024 | 700 semicond. | Page titles |
| price-detail | 32/36 → 40/44 | 750 semicond., tabular | Detail price |
| display | 40/44 | 700 semicond. | Category covers only |

- Alternatives shown on the canvas: B Barlow + Barlow Semi Condensed (DIN/signage character, 5 static files ≈105 KB); C IBM Plex Sans (engineered, 63 KB, but no `tnum` in the variable build).

### Color roles (D2, D3)

Core palette unchanged. Roles:

| Role | Token | Value | Rule |
| --- | --- | --- | --- |
| Frame | `frame`, `frame-2` | #050608, #1A1D24 | Header, footer, Admin chrome |
| Action | `action`, on `action` text #050608 | #F1EA16 | One primary action per view, plus the logo. Never text on light surfaces |
| Indicator | `accent` | #6BA6FF | Fills, marks, underlines, selection. As text only on frame (8.23:1) |
| Ink | `ink`, `ink-2` | #101217, #4B5563 | All text on light (18.7:1, 7.56:1) |
| Light grey | `muted-dark` | #9DA3AF | Text on frame only (8.0:1), or disabled |
| Surfaces | `surface`, `canvas`, `subtle` | #FFFFFF, #F1F3F5, #E9EDF3 | Content, app background, dividers and soft fills |
| Decorative line | `line-deco` | #C8CDD6 | Never the only boundary of a control |

Derived functional tones (D3; not brand colors):

| Token | Value | Use |
| --- | --- | --- |
| `action-hover` | #E3DC22 | The logo artwork's yellow, used for hover |
| `accent-tint` | #E6F0FF | Informational tint |
| `line-strong` | #7D8694 | Control borders, 3.68:1 |
| `ink-3` | #6B7280 | Placeholders on white only, 4.83:1 |
| `danger`, `danger-tint` | #B42318, #FDECEA | Errors and destructive actions, 6.57:1 |
| `warning-tint` | #FBF8CC | Pending and attention tint |

Patterns:
- Links: ink with a 2 px blue underline.
- Selected chip: blue fill, ink text and a check icon (state never by color alone).
- Verified: blue disc with an ink check (7.6:1) plus the text "Tienda verificada".
- Focus: 2 px ink outline, 2 px offset. On frame surfaces, 2 px blue.
- Status tones: neutral; blue for positive or selected; yellow tint for pending; red for rejected, error or destructive. No green.

### Shape, elevation, spacing, motion (D4)
- Radius: 4 px tags, 6 px controls, 8 px panels; circles only for icons and avatars. No pill badges.
- Elevation: cards flat with a border; level 1 for menus and popovers; level 2 for dialogs and sheets. Replaces the 14 bespoke shadows.
- Spacing on a 4 px base (4–64). Public container max 1440 px (today 1600). Gutters 16 / 24 / 32.
- Motion: 120 ms for color and opacity, 200 ms for sheets, no hover lift, nothing under `prefers-reduced-motion`.
- Targets: 44 px for primary controls, 36 px for compact desktop controls, never below 24 px.

### Primitives (new `components/ui/`)

Server components unless interactive. Each replaces its duplicates:

- `Button`: primary, secondary, quiet, danger, onDark; sizes sm 36, md 44, lg 52; icon, loading and disabled states; renders as `Link` when given `href`.
- `IconButton`: requires `label`.
- `Field`: label, hint, error and optional, wiring `id`, `aria-describedby` and `aria-invalid`. Controls: `Input`, `Select`, `Textarea` (with counter), `Checkbox`, `Radio`.
- `Tag` (neutral, accent, warning, danger, solid, line), plus `StatusTag`, which reads the single dictionary in `lib/ui/status.ts`.
- `Chip` (selected, applied with remove), `Notice` (info, success, warning, danger; keeps the PageNotice focus behavior), `EmptyState`, `PageHeader`, `Price` (S/ formatting, tabular), `VerifiedMark`, `Skeleton`.

Page layouts keep their current structure in UX-1. They only swap to primitives and roles.

### Content language (D8)
- Glossary (canvas "Lenguaje"):
  - publicación; instrumento/equipo; Particular; Tienda / Tienda verificada.
  - "Vender" is the entry point and "Publicar" the action verb.
  - Condición is the physical state; Estado is the publication lifecycle.
  - One contact label: "Contactar por WhatsApp". "Compras y ventas"; "Cambios en revisión"; "Resumen".
- Status labels come from one dictionary. "Aprobada" is shown as "Publicada"; meanings and transitions stay as in `functional-spec.md`.
- Full orthography sweep (tildes, ¿¡) and removal of system jargon from user-visible strings, plus a lint that flags common unaccented words in JSX strings.
- Tone: tú, short sentences, no exclamation marks or slogans in UI; musician vocabulary welcome.

### Credibility fixes (D11)
- Store page without banner or logo: a neutral cover with the store name. No "pendiente" text.
- Home:
  - Remove the "Bloque visual temporal" community block and the "Vista previa…" store fallback copy.
  - Card badge shows real condition (or nothing) instead of a hard-coded "NUEVO".
  - "COMPRAR AHORA" → "Ver instrumentos"; "Destacados para ti" → "Recién publicados".
- The home layout itself is redesigned in UX-3. These are minimal edits to `components_v0`.

### Accessibility baseline
- "Saltar al contenido" skip link.
- One `<main>` per page (Admin layout nests a second one).
- Focus ring on every interactive element; field errors wired as above.
- Reduced-motion rule; contrast rules enforced by an automated test on token pairs.

### Brand touchpoints (D9)
- Favicon derived from the wordmark (yellow LARIA on black, no redrawing).
- Email template colors moved to the palette (#F1EA16, ink, accent underline).
- Canonical UI yellow stays #F1EA16. The logo artwork file (#E3DC22) is not edited.

### Tooling (D10)
- `scripts/ux-snapshots.cjs` uses the existing `agent-browser` CLI (no new dependency). It captures a fixed route list at 390 / 768 / 1280 / 1440 against local or preview, plus signed-in routes with the local test accounts. Output goes to a gitignored folder; selected frames are copied into `docs/ux-redesign/screenshots/`.
- `tests/ux-contrast.test.cjs` asserts every declared text/background token pair and control border.
- `tests/ux-copy.test.cjs` flags common unaccented Spanish words and banned jargon in UI strings.

## Scope

In scope:
- `app/globals.css`, `tailwind.config.ts`, `app/layout.tsx` (font, skip link).
- New `components/ui/*` and `lib/ui/status.ts`.
- Class-level migration in all `app/`, `components/`, `components_v0/` files (roles, weights, shadows, pills, uppercase).
- Legacy-token forms: login, seller signup, invites, confirmation, location fields.
- Copy sweep and test/acceptance label updates; favicon; email template colors.
- `docs/design-system.md` rewrite; `AGENTS.md` pointer.

Out of scope (later sub-sprints):
- Header and navigation structure; home, catalog, filter, card, listing, store, sell and account layouts; Admin IA.
- Any product rule. Dark mode (not planned; D12).

## Decisions requested

| # | Decision | Recommendation | Why |
| --- | --- | --- | --- |
| D1 | Typeface | **A · Archivo** (B Barlow, C IBM Plex Sans) | One 87 KB variable file. Semi-condensed widths fit long model names and prices. Tabular figures. LatAm foundry. Less "startup" than Plex and less signage than Barlow. |
| D2 | Blue as text on light surfaces | **No.** Blue marks, fills and underlines; text only on black | Keeps the palette pure and removes the failing blue-text uses (146 today, mostly on light surfaces). Alternative: add a darker text blue (#1F5FC4, 6.0:1), which effectively adds a brand color. |
| D3 | Derived functional tones | **Yes**, the 7 tones above, documented as non-brand | Error, pending and control-border states cannot pass WCAG with the core palette alone. |
| D4 | Shape language | **4 / 6 / 8 px, flat cards, no pill badges** | More technical and less generic; fewer competing shapes. |
| D5 | Base size | **16 px body and inputs; 13–14 px metadata** | Readability, and no iOS zoom on inputs. |
| D6 | Uppercase | **Only micro labels of ≤3 words**; no uppercase buttons or headlines | Readability; removes the "shouting" register. |
| D7 | WhatsApp CTA | **Laria yellow + WhatsApp glyph, one label "Contactar por WhatsApp"** | Brand consistency; one label everywhere. Alternative: WhatsApp green (stronger recognition, off-palette). |
| D8 | Glossary and status labels | **As on the canvas "Lenguaje"** | 16 concepts have 2+ names today. |
| D9 | Brand touchpoints | **Favicon from the wordmark; emails on palette; #F1EA16 canonical for UI** | The favicon today is a generic icon. |
| D10 | Screenshot harness | **agent-browser, no new dependency** | Matches existing browser smoke tests. |
| D11 | Credibility fixes inside UX-1 | **Yes** | Cheap, visible, and valuable before go-live even if UX-3 is weeks away. |
| D12 | Dark mode | **Out of scope for the engagement** | Light marketplace with a black frame; doubles QA for little gain. |

## Risks and mitigations

- **Global visual shift while layouts stay old.** New type and colors land on pages that UX-2–UX-7 will restructure. Mitigation: layouts untouched; a before/after harness sweep of all templates before acceptance.
- **Wide diff, merge conflicts** with Sprint 9 hotfixes or other branches. Mitigation: start from the accepted Sprint 9 head; one concern per commit (tokens → primitives → migration → copy); rebase before the review package.
- **Tests and acceptance pin labels and copy** (`tests/account-shell.test.cjs`, `sprint-*.test.cjs`, `acceptance/cases.tsv`). Mitigation: change labels only through the glossary; update assertions to the new labels without weakening them; list every changed acceptance ID in the acceptance package.
- **Font cost.** +≈87 KB, one request. Mitigation: `next/font` preload with metric-matched fallback; measure LCP/CLS before and after on home, catalog and listing.
- **Missed legacy classes** leave unstyled or low-contrast spots. Mitigation: remove legacy aliases (`brass`, `cedar`, `mist`, `laria-muted` as text) so the build and a grep check catch leftovers.
- **Email rendering.** Inline styles only; test in the local email preview.

## Acceptance criteria (owner-visible)

1. Every page renders in the chosen typeface with at most three weights. No uppercase buttons or headlines; prices use the new price styles.
2. No text below 4.5:1 (3:1 for ≥24 px) and no control boundary below 3:1 on the checked templates (home, catalog, listing, store, login, sell form, account summary, Admin queue), verified by the contrast test and a manual pass.
3. Keyboard walk on those templates shows a visible, consistent focus indicator on every interactive element. The skip link works.
4. One implementation each of Button, Field, Tag/StatusTag, Chip, Notice, EmptyState and PageHeader is used across the product; legacy brass/ink/slate styling is gone.
5. Status labels come from one dictionary. Glossary terms are applied. The copy test passes: no missing tildes or ¿¡ in the flagged vocabulary, no V1 / legacy / Store Owner / metadata / Supabase / CTR / "base de datos" in UI.
6. No buyer-facing placeholder text. The home badge never contradicts condition. No "Comprar ahora".
7. Favicon and emails use the brand. Every WhatsApp contact button shares one style and label.
8. Harness before/after screenshots at 390 / 768 / 1280 / 1440 for public templates and signed-in templates (with local test accounts).
9. `npm run lint`, `typecheck`, `build` and `test` pass. LCP not worse than baseline beyond font load; CLS ≤ 0.1.
10. `docs/design-system.md` is rewritten from this spec; `docs/ux-redesign/decisions.md` records D1–D12 as decided.

## Test plan

- Targeted: new unit tests (contrast, copy, status dictionary); existing tests touching changed labels.
- Once at integration: full `npm test`, `lint`, `typecheck`, `build`.
- Manual: keyboard walk, 200% zoom on phone width, VoiceOver spot check of Field errors and StatusTag.
- Harness sweep before and after.

## Commit plan

1. Docs workspace + harness script + "before" captures.
2. Tokens, font, base styles, focus, skip link.
3. Primitives + status dictionary.
4. Class migration (roles, weights, shadows, tags).
5. Legacy-token forms onto primitives.
6. Copy and glossary sweep, with tests updated.
7. Credibility fixes + favicon + email colors.
8. `design-system.md` rewrite + "after" captures + acceptance package.
