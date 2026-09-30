# Laria Design System

The canonical reference for Laria UI work. Read it before changing visuals, layout, Tailwind classes, copy or shared components. It describes what the code implements after UX-1 (Foundations). The decisions behind it (D1–D12), the audit and the roadmap are in `docs/ux-redesign/`.

Product behavior is defined by `docs/functional-spec.md`. Nothing here changes a product rule; visual work keeps listing lifecycle, moderation, verification, reviews, favorites, alerts, authorization and seller contact exactly as specified.

## Principles

- Laria is a marketplace for instruments and pro audio in Peru. Buyers contact sellers directly by WhatsApp; Laria does not process payments, shipping or guarantees, and the interface never implies that it does.
- Trust comes from honest signals only: moderation, verified stores and reviews backed by a verified transaction. No fake counts, badges or guarantees.
- Mobile first, with dense but calm desktop layouts.
- One visual language: every page is composed from the tokens and components below.

## Color roles

Colors are named by role, not by hue. Tailwind (`tailwind.config.ts`) and the CSS variables in `app/globals.css` define the same values; `tests/ux-contrast.test.cjs` keeps them in sync and checks the pairs below.

| Role | Tailwind | Value | Rule |
| --- | --- | --- | --- |
| Frame | `frame`, `frame-2` | #050608, #1A1D24 | Header, footer, Admin chrome, dark covers. Mark frame containers with `surface-frame` so focus rings turn blue |
| Action | `action` (text `action-ink` #050608) | #F1EA16 | One primary action per view, and the logo. Never text on light surfaces |
| Accent | `accent` | #6BA6FF | Fills, marks, underlines, selection. As text only on frame (8.2:1) |
| Ink | `ink`, `ink-2` | #101217, #4B5563 | All text on light surfaces (18.7:1, 7.6:1) |
| Muted | `muted-dark` | #9DA3AF | Text on frame only (8.0:1), or disabled |
| Surfaces | `surface`, `canvas`, `subtle` | #FFFFFF, #F1F3F5, #E9EDF3 | Content, app background, dividers and soft fills |
| Decorative line | `line-deco` | #C8CDD6 | Separators only; never the only boundary of a control |

Derived functional tones (not brand colors):

| Tailwind | Value | Use |
| --- | --- | --- |
| `action-hover` | #E3DC22 | Primary hover; it is the logo artwork's yellow |
| `accent-tint` | #E6F0FF | Informational and success tint, selected rows |
| `line-strong` | #7D8694 | Control borders (3.7:1) |
| `ink-3` | #6B7280 | Placeholders on white only (4.8:1) |
| `danger`, `danger-tint` | #B42318, #FDECEA | Errors and destructive actions (6.6:1) |
| `warning-tint` | #FBF8CC | Pending and attention tint |

Patterns:
- Links: ink text with a 2 px blue underline (`.link`); on frame, white text (`.link-on-frame` or inside `surface-frame`).
- Selected chip: blue fill, ink text and a check; state is never shown by color alone.
- Verified store: blue disc with an ink check plus the words "Tienda verificada" (`VerifiedMark`).
- Focus: 2 px ink outline with a 2 px offset everywhere (global `:focus-visible`); 2 px blue on frame surfaces. Never remove it.
- Status tones: neutral; blue for published or positive; yellow tint for pending; red for rejected, errors and destructive actions. No green.

Never: yellow or blue text on light surfaces, `muted-dark` on light surfaces, `line-deco` as a control border, off-palette hex values in components, green success colors.

## Typography

Archivo (variable, weight 100–900, width 62–125) is self-hosted from `app/fonts/archivo-latin-wdth-normal.woff2` through `next/font/local` (variable `--font-archivo`, metric-matched Arial fallback, OFL license in `app/fonts/OFL.txt`).

- Weights: 400 reading, 600 interface and labels, 700–750 titles and prices (`font-strong` = 750). No 800 or 900.
- Width: titles, model names and prices are semi-condensed (87.5%); reading text is normal width.
- Uppercase only for micro labels of three words or fewer. No uppercase buttons or headlines.
- Inputs and body text are 16 px (no iOS zoom). Keep reading text under about 68 characters per line.

| Class | Size / line | Weight, width | Use |
| --- | --- | --- | --- |
| `t-micro` | 12/16 | 600, uppercase +0.04em | Eyebrows and labels of ≤3 words |
| `t-meta` | 13/18 | 400, ink-2 | Metadata, hints, counters |
| `t-ui` | 14/20 | 400/600 | Controls, table cells, dense copy |
| `t-body` | 16/24 | 400 | Reading text |
| `t-card-title` | 15/19 | 700, semi-condensed | Card titles, two lines max |
| `t-card-price` | 18/22 | 750, semi-condensed, tabular | Card prices |
| `t-section` | 20/26 | 700, semi-condensed | Section headings |
| `t-page` | 28/32, 34/38 from 1024 px | 700, semi-condensed | Page titles |
| `t-price-detail` | 32/36, 40/44 from 1024 px | 750, semi-condensed, tabular | Listing price |
| `t-display` | 40/44 | 700, semi-condensed | Covers and category heroes only |

## Shape, elevation, spacing, motion

- Radius: `rounded-tag` 4 px, `rounded-control` 6 px, `rounded-panel` 8 px. Circles only for icons and avatars. No pill badges.
- Elevation: cards are flat with a border. `shadow-level-1` for menus and popovers, `shadow-level-2` for dialogs and sheets. No other shadows, no hover lift.
- Spacing on a 4 px base. Public pages use `PageContainer` (`max-w-page`, 1440 px, gutters 16 / 24 / 32).
- Motion: 120 ms for color and opacity (`duration-120`), 200 ms for sheets; nothing moves under `prefers-reduced-motion`.
- Targets: 44 px for primary controls (`h-11` or `min-h-11`), 36 px for compact desktop controls, never below 24 px.

## Layout and page structure

- One `<main id="contenido">` per page, in `app/layout.tsx`. Pages and layouts use `section`, `div` or `PageContainer as="section"`, never a second `main`.
- The first focusable element is the "Saltar al contenido" skip link.
- Page structure (headers, filters, grids) is being redesigned per template in UX-2 to UX-7; until then keep existing layouts and only use the tokens and components here.

## Components (`components/ui/`)

Use these instead of writing new markup for the same job.

- `Button` / `buttonClasses()`: variants `primary` (yellow, one per view), `secondary`, `quiet`, `danger`, `onDark`; sizes `sm` 36, `md` 44, `lg` 52; `loading` + `loadingLabel` keep the primary yellow; with `href` it renders a link. `IconButton` requires a `label`.
- `Field` with `Input`, `Select`, `Textarea`, `FileInput`, `Checkbox`, `Radio`: every control has a visible label; `Field` wires `id`, `aria-describedby` (hint and error) and `aria-invalid`. `Textarea` with `maxLength` shows an "n / max" counter. Give each field a unique `id` (use `useId()` in repeated components).
- `Tag` and `StatusTag`: status labels and tones come from `lib/ui/status.ts`, the single dictionary (domains: `listing`, `revision`, `store`, `claim` for Compras y ventas, `transaction` for the Admin sale records, `report`, `review`, `alert`). `StatusEntryTag` renders a status already resolved to an entry, such as `storeStatusEntry()` ("Tienda verificada" for an active verified store). Admin shows a report's target and the audit history through `adminTargetStatusLabel()`. Never write a second label map. `CountBadge` for counts.
- `Chip`, `ChipLink`, `AppliedChip`: filters and period selectors; selected state has a check and `aria-pressed` or `aria-current`. `AppliedChip` is a plain link on purpose: the full page load also resets the catalog's uncontrolled filter form.
- `Notice` (`info`, `success`, `warning`, `danger`, icon + text): danger is an alert, others a status; use `role="note"` for static explanations. Its body underlines every link, so a notice that holds buttons, or that receives focus through a ref, composes `noticeClassName()` + `NoticeIcon` instead (as `PageNotice` does). `PageNotice` moves focus to page-level results; do not use that movement for field errors.
- `PageHeader`: the page's only `h1`, with an optional eyebrow, a one-line summary (`meta`, 13 px) and the page's actions; a longer 16 px introduction stays a paragraph after it. Light surfaces only: headers on the black frame keep their own markup.
- `EmptyState` (any list or section with nothing to show; `headingLevel={3}` under a section heading), `Price` (S/ with tabular figures; `card`, `detail`, `inline`), `VerifiedMark` / `VerifiedIcon`, `Skeleton`, `IconButton`, `WhatsAppGlyph`.
- `tests/ux-primitives.test.cjs` fails when a primitive loses its last consumer or a hand-rolled copy (error box, pulse placeholder, price class, count pill) comes back. `Chip` (toggle) and `Radio` have no consumer yet: the filters are redesigned in UX-3, and the only radios (Admin legacy linking) keep markup that `tests/sprint-8.test.cjs` pins.

WhatsApp contact: every contact button is the primary yellow button with the WhatsApp glyph and the label "Contactar por WhatsApp". No WhatsApp green.

## Content language

Spanish for Peru, tú, short sentences. No exclamation marks and no slogans in the interface. Musician vocabulary is welcome (pastillas, cuerpo sólido, crash de 16", interfaz de audio). Formats: S/ 1,200 · 27 set. 2026 · Miraflores, Lima.

Glossary (one name per concept; `tests/ux-copy.test.cjs` rejects the retired names):

| Concept | Use | Avoid |
| --- | --- | --- |
| What is published | publicación | listado, aviso, anuncio, producto, registro |
| The object | instrumento, equipo | artículo, ítem |
| Individual account | Particular | vendedor particular, cuenta de vendedor |
| Business account | Tienda · Tienda verificada | Store Owner, propietario de tienda |
| Entry point to sell | Vender | "Para tiendas" as a sell entry |
| Action | Publicar | Agregar inventario, Publicar producto, Publicar inventario, Enviar para revisión |
| Physical state | Condición | Estado, estado del producto |
| Publication lifecycle | Estado | Condición |
| Contact | Contactar por WhatsApp | Preguntar / Escribir por WhatsApp, Escribir a la tienda |
| Purchases and sales | Compras y ventas | Transacciones, Atribuciones |
| Pending edit | Cambios en revisión | propuesta, Cambio de publicación |
| Account home | Resumen | panel, dashboard, "Mi cuenta" as a page title |

Status labels (from `lib/ui/status.ts`; only the visible label changes, meanings stay as in the functional spec): Borrador, En revisión, Publicada (stored as `approved`), Cambios en revisión, Rechazada, Oculta, Vendida, Archivada. A store reads En revisión, Activa, Rechazada, Oculta or Tienda verificada everywhere (account summary, store page and Admin).

Orthography: tildes, ñ and opening ¿ are required; the copy test checks the common misses. No system jargon in the interface: V1, legacy, Store Owner, metadata, Supabase, CTR, "base de datos". Internal errors stay in logs.

Open items (`docs/ux-redesign/decisions.md`): the catalog page is still named "Listados" (G1, with UX-2) and the legal pages keep their approved wording (G2).

## Placeholders and empty states

- Prefer omission over a placeholder. Never show fake listings, stores, counts or reviews.
- A home section with no real content shows an `EmptyState` or is hidden.
- Missing listing photo: an icon and "Sin foto". Missing store banner or logo: a frame cover with the store name and a two-letter monogram (`storeInitials`).
- If a placeholder is unavoidable during development, comment it in code and keep it out of buyer-facing pages.

## Brand touchpoints

- Logo: `app/logo-clear.svg`, unedited (its yellow is #E3DC22). The canonical interface yellow is #F1EA16.
- Favicon `app/icon.svg` and `app/apple-icon.png`: the wordmark on the frame color.
- Emails (`lib/email/templates.ts`): inline styles on the palette (frame header, #F1EA16 button with #050608 text, ink text, blue underline on the fallback link, 8/6 px radii).

## Accessibility

- Visible focus on every interactive element; never `outline-none` without a replacement.
- Color is never the only signal: statuses carry text, selection carries a check, verification carries words.
- Contrast: text 4.5:1, control boundaries and meaningful marks 3:1 (enforced for the token pairs by `tests/ux-contrast.test.cjs`).
- Semantic HTML: links navigate, buttons act, tables hold tabular data. Labels and alt text in Spanish; decorative images and icons are hidden from assistive technology.
- Page-level success and error notices receive focus and scroll into view (`PageNotice`); field errors stay next to their field.
- No horizontal scroll at 390 px; layouts hold at 200% zoom.

## Checks and tools

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` for every change. `tests/ux-copy.test.cjs`, `tests/ux-contrast.test.cjs` and `tests/ux-primitives.test.cjs` enforce the content, color and component rules.
- Screenshots: `node scripts/ux-snapshots.cjs --label <name>` captures the route list at 390 / 768 / 1280 / 1440, anonymous and signed in with local test accounts (see the script header). Local by default; `--allow-remote` for a preview deployment only.

## Checklist for UI work

Before: read this file, the relevant page and component code, and `docs/functional-spec.md` for the behavior involved. Confirm the task is visual-only or get the product change approved.

While: compose from `components/ui/`; roles, not hex values; one yellow action per view; glossary terms; no new product behavior; no changes to queries, filters, routes, auth or business logic in visual tasks.

After: run the checks, look at 390 px and desktop, and report changed files, checks run and known limitations.
