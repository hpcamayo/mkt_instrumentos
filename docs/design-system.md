# Laria Design System

The canonical reference for Laria UI work. Read it before changing visuals, layout, Tailwind classes, copy or shared components. It describes what the code implements after UX-1 (Foundations) and UX-2 (Shell and navigation). The decisions behind it (D1–D12, N1–N8, G1), the audits and the roadmap are in `docs/ux-redesign/`.

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
- Focus: 2 px ink outline with a 2 px offset everywhere (global `:focus-visible`); 2 px blue on frame surfaces; back to ink on light panels inside the frame (`surface-light`). Never remove it.
- Status tones: neutral; blue for published or positive; yellow tint for pending; red for rejected, errors and destructive actions. No green.

Never: yellow or blue text on light surfaces, `muted-dark` on light surfaces, `line-deco` as a control border, off-palette hex values in components, green success colors.

## Typography

Archivo (variable, weight 100–900, width 62–125) is self-hosted from `app/fonts/archivo-latin-wdth-normal.woff2` through `next/font/local` (variable `--font-archivo`, metric-matched Arial fallback, OFL license in `app/fonts/OFL.txt`).

- Weights: 400 reading, 600 interface and labels, 700–750 titles and prices (`font-strong` = 750). No 800 or 900.
- Width: titles, model names and prices are semi-condensed (87.5%); reading text is normal width.
- Uppercase only for micro labels of three words or fewer. No uppercase buttons or headlines.
- Inputs and body text are 16 px (no iOS zoom). Keep reading text under about 68 characters per line.
- Line breaks (audit item 14): headings (`h1`–`h4`, `t-page`, `t-section`, `t-display`) and lead paragraphs (`.text-lead`: the `PageHeader` summary, the `EmptyState` description, the introduction under a page title) use `text-wrap: balance`; other paragraphs, list items and definitions use `text-wrap: pretty`. Both are set globally in `app/globals.css` as a progressive enhancement; add `.text-lead` to a new lead paragraph instead of forcing breaks.

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
- Motion: 120 ms for color and opacity (`duration-120`), 200 ms for sheets; nothing moves under `prefers-reduced-motion`. Shell menus appear with `.menu-fade` (a 120 ms opacity change) and never slide.
- Targets: 44 px for primary controls (`h-11` or `min-h-11`), 36 px for compact desktop controls, never below 24 px.

## Layout and page structure

- One `<main id="contenido">` per page: `components/site-shell.tsx` renders it for public and account pages, `app/admin/layout.tsx` for Admin (so the skip link lands after the Admin sidebar). A 404 or error that renders outside the Admin layout (an unmatched `/admin/…` URL, a crash in the layout) gets its `<main>` from `FallbackMain`. Pages and layouts use `section`, `div` or `PageContainer as="section"`, never a second `main`.
- The first focusable element is the "Saltar al contenido" skip link.
- Page content (filters, grids, listing and store pages, account and Admin content) is redesigned per template in UX-3 to UX-7; until then keep existing layouts and only use the tokens and components here.

## Shell and navigation (UX-2)

`lib/shell.ts` decides the frame for each route (`getShellLayout`); `tests/ux-shell.test.cjs` pins it. Nothing in the shell is sticky: the header, strip, rails and sidebars scroll with the page on every device (N3). Phones get a compact header and no bottom bar (N4).

| Route | Header | Category strip | Phone search | Footer |
| --- | --- | --- | --- | --- |
| Home `/` | standard (until the UX-3 banner search) | every width (until the UX-3 home header) | row | full |
| Browse: `/listados`, category landings, `/tiendas/…` | standard | every width | row | slim |
| Listing `/instrumentos/<listing>` | standard | every width | icon that opens the row | slim |
| Other public pages (legal, sign-in, 404, 500) | standard | every width | none | slim |
| Account `/mi-cuenta…` | standard | every width | none | slim |
| Publishing `/mi-cuenta/publicar`, `/mi-cuenta/tienda/publicar` | phones: logo and account only | 768 px and up | none | slim |
| Admin `/admin…` | none (Admin frame) | none ("Explorar categorías" in the Admin navigation) | none | none |

The strip column follows the 3 Oct amendment (N12): the strip with its category menus sits under the public header everywhere except the publishing pages on phones; the UX-2 brief had it on public pages only, and only on browse pages on phones.

### Logo

- `app/logo-clear.svg`, 1400×980 artboard. The stray 1-unit hairline at its left edge (a stroked bar and its fill) was removed (N2); the letters, color and proportions are unchanged. `app/icon.svg` and `app/apple-icon.png` never had it.
- Render it with `BrandLogo` (`components/brand-logo.tsx`), never with raw sizes. Sizes are boxes of about 1.9:1 as the logo is drawn on the design canvas; `object-cover` crops the artboard's empty band. Header: 32 px tall (61 px wide) on phones, 36 px (68 px) from 768 px, about 56% of the 56 / 64 px bar. Full footer: 24 px (45 px) on phones, 28 px (53 px) from 768 px. Admin: 28 px (53 px).

### Header

- Black bar (`surface-frame bg-frame`), 64 px from 768 px, 56 px on phones, page gutters. Logo, search, then the actions 8 px apart (4 px on phones, 44 px targets).
- Search: 44 px field up to 680 px wide, 28 px after the logo, 36 px icon submit button inside the field. It searches the brand only, so its placeholder says so: "Busca por marca: Yamaha, Fender…" (N8; the same placeholder goes on the home banner in UX-3). It submits `brand` to `/listados`; no suggestions. On phones the search is a row under the bar on browse pages and the home, behind a search icon on listing pages, and absent elsewhere; the phone row follows the actions in the markup so Tab follows the visual order.
- **Header button rule (N1):** "Vender" is `buttonClasses({ variant: "onDark", size: "sm" })`, the 36 px outline button on dark; yellow stays for each page's own action. On phones its hit area grows to 44 px without changing its look. Store owners keep their labels ("Publicar", "Solicitud de tienda"); `getSellEntry` holds the destinations. "Para tiendas" is not a header entry (the footer's "Registrar mi tienda" is).
- Account entry: signed out, "Ingresar" (icon + text); signed in, a bell to Notificaciones with a `CountBadge` of unread notifications, and an avatar with initials + "Mi cuenta" that opens the account menu. Below 900 px both labels become icons with accessible names. The entry keeps its place, invisible, until the first account check settles (no "Ingresar" flash for a signed-in visitor).
- The last item's visible edge sits on the right gutter, like the logo on the left: pull out its side padding with a negative margin.
- Header data comes from `/api/account-navigation` (signed in, account type, store, admin check, name and the two counts the account rail shows; N6).

### Menus

- Disclosure buttons (`aria-expanded`, `aria-controls`), not ARIA menus, through `useDisclosure` (`components/use-disclosure.ts`): Enter and Space open them, Esc closes and returns focus to the button, an outside press or a route change closes them, and opening one closes any other. `useDisclosureGroup` does the same for a row of buttons sharing one panel (the category strip). A component nested inside a menu that handles Esc itself (the Admin category accordion) calls `preventDefault`, and the menu then leaves Esc to it: React and the menus listen on `document`, so `stopPropagation` alone cannot separate them.
- Account menu (header): the rail's sections, order and counts (`AccountSectionLinks`), "Admin" for admins, a divider and "Cerrar sesión". White panel with `surface-light` (ink focus ring inside the dark frame), `rounded-panel`, `shadow-level-1`, 44 px rows on phones and 36 px from 768 px.
- Closed panels stay in the markup with `hidden`.

### Category strip

- `components/global-categories.tsx`, built from `stripItems` and `categoryMenus` in `lib/shell.ts`: "Instrumentos" (`/listados`), the eight categories in taxonomy order, and "Tiendas verificadas" (the catalog filtered to verified stores, N7; at the right on desktop).
- "Instrumentos" and "Tiendas verificadas" are links. Each category is a disclosure button (with a 12 px chevron) that opens its menu panel (the hybrid of the 3 Oct amendment, N12).
- White, 48 px from 768 px and 44 px on phones, 1 px `line-deco` bottom border. 14 px / 600; 26 px apart from 768 px, 20 px on phones. It scrolls sideways (no visible bar) when it does not fit.
- Current item: a 3 px blue underline (`shadow-[inset_0_-3px_0_var(--accent)]`) in ink, with `aria-current="page"` on a link and `aria-current="true"` on a category button; an open category has a 3 px ink underline. On phones the other items are ink-2. Focus rings are inset so the scroll container does not clip them.
- Category panel (`CategoryPanel`): "Ver todos" (the category landing) and "Tipos", every canonical instrument type of the category (`categoryMenus`: the listing form's and catalog filters' values through `categoryTypePath`). It renders after its button, positioned across the page under the strip, with `shadow-level-1`, a `line-deco` border and `.menu-fade`. From 768 px: the category as a micro label, types in 180–220 px columns, 36 px rows. Phones: a stacked list with 44 px rows. One panel at a time; the closing rules of every shell menu.
- Links into the catalog (`/listados`, with or without a query) are native links that load the page (`ShellLink`, `isCatalogHref`): a client transition between two catalog URLs does not complete, and the catalog's filter form is uncontrolled. Category landings stay client links.

### Breadcrumbs

- `Breadcrumbs` (`components/breadcrumbs.tsx`) on the catalog, the category landings and the listing page: "Inicio / Instrumentos / Guitarras / Guitarras eléctricas / <title>" (the type level appears only when it narrows the category; `listingBreadcrumbs` in `lib/shell.ts`).
- From 768 px: 13 px, links in ink-2 with a `line-deco` underline, the current page in ink with `aria-current="page"` and no link; 12 px above the page title block. On phones only a back link to the parent ("‹ Guitarras eléctricas", with "Volver a" for screen readers).
- The breadcrumb structured data keeps its shape; the catalog is named "Instrumentos" (G1).

### Page frames

- Public: `PageContainer` (1440 px, gutters 16 / 24 / 32).
- Account (`AccountNavigation`): from 1024 px a 248 px rail, 40 px gap, content on the right, on white. The rail holds the name, "role · city", the sections (`aria-current`; the active row on `canvas` with a 3 px blue bar; counts with `CountBadge`), a divider and "Cerrar sesión". Below 1024 px a switcher row under the header ("Mi cuenta · <section>") opens the same list. Account page content is UX-6.
- Admin (`AdminNavigation`): from 1024 px a 240 px black sidebar with the logo at 28 px and an "ADMIN" micro label, the sections ("Moderación" carries the pending total), and the admin's name and role at the bottom of the first screen; below 1024 px a black bar with a "Menú" button that discloses the same list. After the sections, "Explorar categorías" (`CategoryAccordion`) expands in place to "Instrumentos", each category ("Ver todos" and its types) and "Tiendas verificadas", in white on the frame; Esc closes the innermost open level and returns focus to its button. Admin never shows the public header or footer. Content on `canvas`. The workbench is UX-7.

### Footers

- Full (home only, N5): four columns: logo (28 px) with the promise ("…Laria no cobra comisiones, no procesa pagos, no retiene dinero, no gestiona envíos ni garantiza el equipo ni las transacciones."), Explora, Vende, Ayuda y legal (micro-label headings, 14 px links), then "© 2026 Laria" / "Hecho en Perú". Phones: the logo at 24 px, six links in two columns, and "© 2026 Laria · No cobramos comisiones ni procesamos pagos.".
- Slim (every other public and account page): "© 2026 Laria · No cobramos comisiones ni procesamos pagos." and "Consejos de seguridad · Términos y reglas · Privacidad"; one row, two lines on phones (12 px small print on phones, 13 px from 640 px).
- None in Admin. Footers link only to pages that exist.

### 404 and 500

- `ErrorPage` (`components/error-page.tsx`) inside the standard header and slim footer: a centred 560 px column with a `t-page` title, one line, the search field and "Ir al inicio" · "Ver instrumentos". No illustration.
- 404 (`app/not-found.tsx`): "No encontramos esta página" / "Puede que la dirección esté mal o que la publicación ya no esté disponible." 500 (`app/error.tsx`): "Algo salió mal" / "Vuelve a intentarlo en unos minutos."; the error goes to the console, never to the page. The copy lives once in `NOT_FOUND_COPY` / `SERVER_ERROR_COPY`.
- Inside Admin, `app/admin/not-found.tsx` and `app/admin/error.tsx` render the same body within the Admin frame. An unmatched deeper `/admin/…` URL reaches that 404 through `app/admin/[section]/[...rest]/page.tsx`; the root fallback still covers errors above the Admin layout.

## Components (`components/ui/`)

Use these instead of writing new markup for the same job.

- `Button` / `buttonClasses()`: variants `primary` (yellow, one per view), `secondary`, `quiet`, `danger`, `onDark`; sizes `sm` 36, `md` 44, `lg` 52; `loading` + `loadingLabel` keep the primary yellow; with `href` it renders a link. `IconButton` requires a `label`.
- `Field` with `Input`, `Select`, `Textarea`, `FileInput`, `Checkbox`, `Radio`: every control has a visible label; `Field` wires `id`, `aria-describedby` (hint and error) and `aria-invalid`. `Textarea` with `maxLength` shows an "n / max" counter. Give each field a unique `id` (use `useId()` in repeated components).
- `Tag` and `StatusTag`: status labels and tones come from `lib/ui/status.ts`, the single dictionary (domains: `listing`, `revision`, `store`, `claim` for Compras y ventas, `transaction` for the Admin sale records, `report`, `review`, `alert`). `StatusEntryTag` renders a status already resolved to an entry, such as `storeStatusEntry()` ("Tienda verificada" for an active verified store). Admin shows a report's target and the audit history through `adminTargetStatusLabel()`. Never write a second label map. `CountBadge` for counts.
- `Chip`, `ChipLink`, `AppliedChip`: filters and period selectors; selected state has a check and `aria-pressed` or `aria-current`. `AppliedChip` is a plain link on purpose: the full page load also resets the catalog's uncontrolled filter form.
- `Notice` (`info`, `success`, `warning`, `danger`, icon + text): danger is an alert, others a status; use `role="note"` for static explanations. Its body underlines every link, so a notice that holds buttons, or that receives focus through a ref, composes `noticeClassName()` + `NoticeIcon` instead (as `PageNotice` does). `PageNotice` moves focus to page-level results; do not use that movement for field errors.
- `PageHeader`: the page's only `h1`, with an optional eyebrow, a one-line summary (`meta`, 13 px) and the page's actions; a longer 16 px introduction stays a paragraph after it. Light surfaces only: headers on the black frame keep their own markup.
- `EmptyState` (any list or section with nothing to show; `headingLevel={3}` under a section heading), `Price` (S/ with tabular figures; `card`, `detail`, `inline`), `VerifiedMark` / `VerifiedIcon`, `Skeleton`, `IconButton`, `WhatsAppGlyph`.
- Shell components (UX-2): `BrandLogo`, `Breadcrumbs`, `ErrorPage`, `AccountSectionLinks`, `CategoryPanel`, `CategoryAccordion`, `ShellLink`, `useDisclosure`, `useDisclosureGroup`; see "Shell and navigation".
- `tests/ux-primitives.test.cjs` fails when a primitive loses its last consumer or a hand-rolled copy (error box, pulse placeholder, price class, count pill) comes back. `Chip` (toggle) and `Radio` have no consumer yet: the filters are redesigned in UX-3, and the only radios (Admin legacy linking) keep markup that `tests/sprint-8.test.cjs` pins.

WhatsApp contact: every contact button is the primary yellow button with the WhatsApp glyph and the label "Contactar por WhatsApp". No WhatsApp green.

## Content language

Spanish for Peru, tú, short sentences. No exclamation marks and no slogans in the interface. Musician vocabulary is welcome (pastillas, cuerpo sólido, crash de 16", interfaz de audio). Formats: S/ 1,200 · 27 set. 2026 · Miraflores, Lima.

Glossary (one name per concept; `tests/ux-copy.test.cjs` rejects the retired names):

| Concept | Use | Avoid |
| --- | --- | --- |
| What is published | publicación | listado, aviso, anuncio, producto, registro |
| The object | instrumento, equipo | artículo, ítem, producto (except the defined name "Artículos prohibidos") |
| Individual account | Particular | vendedor particular, cuenta de vendedor |
| Business account | Tienda · Tienda verificada | Store Owner, propietario de tienda |
| Catalog page | Instrumentos (the URL stays `/listados`) | Listados |
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

Open items (`docs/ux-redesign/decisions.md`): the legal pages keep their approved wording (G2). The catalog page is "Instrumentos" since UX-2 (G1); the copy test rejects "Listado" and "Para tiendas" in any case.

## Placeholders and empty states

- Prefer omission over a placeholder. Never show fake listings, stores, counts or reviews.
- A home section with no real content shows an `EmptyState` or is hidden.
- Missing listing photo: an icon and "Sin foto". Missing store banner or logo: a frame cover with the store name and a two-letter monogram (`storeInitials`).
- If a placeholder is unavoidable during development, comment it in code and keep it out of buyer-facing pages.

## Brand touchpoints

- Logo: `app/logo-clear.svg` (its yellow is #E3DC22), edited once in UX-2 to remove a stray hairline (N2); sizes and rendering in "Shell and navigation". The canonical interface yellow is #F1EA16.
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

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` for every change. `tests/ux-copy.test.cjs`, `tests/ux-contrast.test.cjs`, `tests/ux-primitives.test.cjs` and `tests/ux-shell.test.cjs` enforce the content, color, component and shell rules.
- Screenshots: `node scripts/ux-snapshots.cjs --label <name>` captures the route list at 390 / 768 / 1280 / 1440, anonymous and signed in with local test accounts (see the script header). Local by default; `--allow-remote` for a preview deployment only.
- Local test accounts: `node scripts/ux-local-accounts.cjs` creates the Particular, Store Owner (with a store) and Admin on a local Supabase and writes `.ux-accounts.local.json`.
- Audit: `node scripts/ux-audit.cjs --axe <axe.min.js>` runs axe-core (WCAG 2.1 A/AA), the focus sweep, the skip link, shell Tab order, one `<main>` and `<h1>`, overflow (also at 200% zoom), axe with each menu open, and layout shift. How to set all of this up: `docs/ux-redesign/review-guide.md`.

## Checklist for UI work

Before: read this file, the relevant page and component code, and `docs/functional-spec.md` for the behavior involved. Confirm the task is visual-only or get the product change approved.

While: compose from `components/ui/`; roles, not hex values; one yellow action per view; glossary terms; no new product behavior; no changes to queries, filters, routes, auth or business logic in visual tasks.

After: run the checks, look at 390 px and desktop, and report changed files, checks run and known limitations.
