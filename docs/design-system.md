# Laria Design System

The canonical reference for Laria UI work. Read it before changing visuals, layout, Tailwind classes, copy or shared components. It describes what the code implements after UX-1 (Foundations), UX-2 (Shell and navigation), UX-3a (Discovery: the card, the catalog, its filters and the category landings), UX-3b (Discovery: the home) and UX-4 (listing and store pages). The decisions behind it (D1–D12, N1–N14, G1, Q1–Q20, F10–F12), the audits and the roadmap are in `docs/ux-redesign/`.

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
| `t-card-title` | 15/19 | 600, semi-condensed | Card titles, two lines max (600 confirmed in UX-3, Q17) |
| `t-card-price` | 18/22 | 750, semi-condensed, tabular | Card prices |
| `t-section` | 20/26 | 700, semi-condensed | Section headings |
| `t-page` | 28/32, 34/38 from 1024 px | 700, semi-condensed | Page titles |
| `t-price-detail` | 32/36, 40/44 from 1024 px | 750, semi-condensed, tabular | Listing price |
| `t-display` | 40/44 | 700, semi-condensed | Covers and category heroes only |

## Shape, elevation, spacing, motion

- Radius: `rounded-tag` 4 px, `rounded-control` 6 px, `rounded-panel` 8 px. Circles only for icons and avatars. No pill badges.
- Elevation: cards are flat with a border. `shadow-level-1` for menus and popovers, `shadow-level-2` for dialogs and sheets. No other shadows, no hover lift.
- Spacing on a 4 px base. Public pages use `PageContainer` (`max-w-page`, 1440 px, gutters 16 / 24 / 32).
- Motion: 120 ms for color and opacity (`duration-120`), 200 ms for sheets (`.sheet` slides up); nothing moves under `prefers-reduced-motion`. Shell menus appear with `.menu-fade` (a 120 ms opacity change) and never slide.
- Targets: 44 px for primary controls (`h-11` or `min-h-11`), 36 px for compact desktop controls, never below 24 px.

## Layout and page structure

- One `<main id="contenido">` per page: `components/site-shell.tsx` renders it for public and account pages, `app/admin/layout.tsx` for Admin (so the skip link lands after the Admin sidebar). A 404 or error that renders outside the Admin layout (an unmatched `/admin/…` URL, a crash in the layout) gets its `<main>` from `FallbackMain`. Pages and layouts use `section`, `div` or `PageContainer as="section"`, never a second `main`.
- The first focusable element is the "Saltar al contenido" skip link.
- Page content is redesigned per template in UX-3 to UX-7: the catalog and the category landings in UX-3a ("Discovery" below); the home in UX-3b ("Home" below); listing and store pages in UX-4 ("Listing and store pages" below); account and Admin content later. Until a template is redesigned, keep its layout and only use the tokens and components here.

## Shell and navigation (UX-2)

`lib/shell.ts` decides the frame for each route (`getShellLayout`); `tests/ux-shell.test.cjs` pins it. Nothing in the shell is sticky: the header, strip, rails and sidebars scroll with the page on every device (N3). Phones get a compact header and no bottom bar (N4).

| Route | Header | Category strip | Phone search | Footer |
| --- | --- | --- | --- | --- |
| Home `/` | home (logo, "Categorías", "Tiendas verificadas" from 768 px, "Cómo funciona" from 1024 px; no search) | none (the home header's "Categorías" menu) | none (the banner has the search) | full |
| Browse: `/listados`, category landings, `/tiendas/…` | standard | every width | row | slim |
| Listing `/instrumentos/<listing>` | standard | every width | icon that opens the row | slim |
| Other public pages (legal, sign-in, 404, 500) | standard | every width | none | slim |
| Account `/mi-cuenta…` | standard | every width | none | slim |
| Publishing `/mi-cuenta/publicar`, `/mi-cuenta/tienda/publicar` | phones: logo and account only | 768 px and up | none | slim |
| Admin `/admin…` | none (Admin frame) | none ("Explorar categorías" in the Admin navigation) | none | none |

The strip column follows the 3 Oct amendment (N12): the strip with its category menus sits under the public header everywhere except the home (UX-3b, Q14: its header's "Categorías" menu gives the same destinations) and the publishing pages on phones; the UX-2 brief had it on public pages only, and only on browse pages on phones.

### Logo

- `app/logo-clear.svg`, 1400×980 artboard. The stray 1-unit hairline at its left edge (a stroked bar and its fill) was removed (N2); the letters, color and proportions are unchanged. `app/icon.svg` and `app/apple-icon.png` never had it.
- Render it with `BrandLogo` (`components/brand-logo.tsx`), never with raw sizes. Sizes are boxes of about 1.9:1 as the logo is drawn on the design canvas; `object-cover` crops the artboard's empty band. Header: 32 px tall (61 px wide) on phones, 36 px (68 px) from 768 px, about 56% of the 56 / 64 px bar. Full footer: 24 px (45 px) on phones, 28 px (53 px) from 768 px. Admin: 28 px (53 px).

### Header

- Black bar (`surface-frame bg-frame`), 64 px from 768 px, 56 px on phones, page gutters. Logo, search, then the actions 8 px apart (4 px on phones, 44 px targets).
- Search: 44 px field up to 680 px wide, 28 px after the logo, 36 px icon submit button inside the field. It searches the brand only, so its placeholder says so: "Busca por marca: Yamaha, Fender…" (N8; the home banner's search uses the same placeholder and label, `SEARCH_PLACEHOLDER` and `SEARCH_LABEL` in `lib/shell.ts`). It submits `brand` to `/listados`; no suggestions. On phones the search is a row under the bar on browse pages, behind a search icon on listing pages, and absent elsewhere (on the home the banner has it); the phone row follows the actions in the markup so Tab follows the visual order.
- **Header button rule (N1, N9):** "Vender" is `buttonClasses({ variant: "onDark", size: "sm" })`, the 36 px outline button on dark, its border white at 40% (about 3.7:1 on the frame; N9 kept it over N1's #4B5563, which is 2.6:1); yellow stays for each page's own action. On phones its hit area grows to 44 px without changing its look. Store owners keep their labels ("Publicar", "Solicitud de tienda"); `getSellEntry` holds the destinations. "Para tiendas" is not a header entry (the footer's "Registrar mi tienda" is).
- Account entry: signed out, "Ingresar" (icon + text); signed in, a bell to Notificaciones with a `CountBadge` of unread notifications, and an avatar with initials + "Mi cuenta" that opens the account menu. Below 900 px both labels become icons with accessible names. The entry keeps its place, invisible, until the first account check settles (no "Ingresar" flash for a signed-in visitor).
- The last item's visible edge sits on the right gutter, like the logo on the left: pull out its side padding with a negative margin.
- Header data comes from `/api/account-navigation` (signed in, account type, store, admin check, name and the two counts the account rail shows; N6).

### Menus

- Disclosure buttons (`aria-expanded`, `aria-controls`), not ARIA menus, through `useDisclosure` (`components/use-disclosure.ts`): Enter and Space open them, Esc closes and returns focus to the button, an outside press or a route change closes them, and opening one closes any other. `useDisclosureGroup` does the same for a row of buttons sharing one panel (the category strip). A component nested inside a menu that handles Esc itself (the Admin category accordion) calls `preventDefault`, and the menu then leaves Esc to it: React and the menus listen on `document`, so `stopPropagation` alone cannot separate them.
- A panel toggled with the `hidden` attribute carries no display utility (`grid`, `flex`, `md:block`…): the class would override `hidden` and leave the closed panel on screen. Panels that need a display class render only while open. `tests/ux-shell.test.cjs` enforces it.
- Account menu (header): the rail's sections, order and counts (`AccountSectionLinks`), "Admin" for admins, a divider and "Cerrar sesión". White panel with `surface-light` (ink focus ring inside the dark frame), `rounded-panel`, `shadow-level-1`, 44 px rows on phones and 36 px from 768 px.
- Closed panels stay in the markup with `hidden`.

### Category strip

- `components/global-categories.tsx`, built from `stripItems` and `categoryMenus` in `lib/shell.ts`: "Instrumentos" (`/listados`), the eight categories in taxonomy order, and "Tiendas verificadas" (the catalog filtered to verified stores, N7; at the right on desktop).
- "Instrumentos" and "Tiendas verificadas" are links. Each category is a disclosure button (with a 12 px chevron) that opens its menu panel (the hybrid of the 3 Oct amendment, N12).
- White, 48 px from 768 px and 44 px on phones, 1 px `line-deco` bottom border. 14 px / 600; 26 px apart from 768 px, 20 px on phones. It scrolls sideways (no visible bar) when it does not fit.
- Current item: a 3 px blue underline (`shadow-[inset_0_-3px_0_var(--accent)]`) in ink, with `aria-current="page"` on a link and `aria-current="true"` on a category button; an open category has a 3 px ink underline. On phones the other items are ink-2. Focus rings are inset so the scroll container does not clip them.
- Category panel (`CategoryPanel`): "Ver todos" (the category landing) and "Tipos", every canonical instrument type of the category (`categoryMenus`: the listing form's and catalog filters' values through `categoryTypePath`). Branch `ux/catalog-category-nav-0ueck4` (provisional, `ux-redesign/category-navigation.md`) adds, from 768 px, a micro-labelled column of subtypes per type ("Explora" for single-type categories) and, at every width, a "Marcas" column of the category's leading catalog brands (five on phones, eight from 768 px) with "Ver todas las marcas" (the landing's `#marcas`). The landings add an "Explora <categoría>" section of subtype and brand chips. It renders after its button, positioned across the page under the strip, with `shadow-level-1`, a `line-deco` border and `.menu-fade`. From 768 px: the category as a micro label, types in 180–220 px columns, 36 px rows. Phones: a stacked list with 44 px rows. One panel at a time; the closing rules of every shell menu.
- Every strip link, including those into the catalog (`/listados`, with or without a query), is a client link. Until UX-3 the catalog links were native, because some client transitions between two catalog URLs never completed; UX-3 removed the cause (`app/listados/loading.tsx`, owner decision Q1 A) and the workaround (`ShellLink`, `isCatalogHref`).

### Home header (UX-3b)

- `HomeHeader` (`components/site-header.tsx`), chosen by `SiteShell` when `getShellLayout("/")` returns `header: "home"`: the same black bar (64 px from 768 px, 56 px on phones), the logo, then 28 px later "Categorías ⌄" (a disclosure button, `aria-controls="menu-categorias"`), "Tiendas verificadas" (N7) from 768 px and "Cómo funciona" (a link to `#como-funciona`) from 1024 px, 14 px / 600 white in `nav` "Navegación principal"; on the right "Vender" (N1, N9) and the account entry, as on every page. No search in the bar and no phone search row: the banner has the search. No category strip on the home (Q14).
- The "Categorías" panel: "Todos los instrumentos" (`/listados`), every category (its name opens its landing) with its canonical types (`categoryMenus`, the strip's destinations), then "Tiendas verificadas". From 768 px a white panel across the page under the bar (`surface-light`, `shadow-level-1`, `line-deco` bottom border, `.menu-fade`), the categories in four columns of two rows, 36 px rows. Phones: one stacked list with 44 px rows, the types indented, scrolling inside the panel (up to the viewport height under the bar). It follows its button in the markup, renders only while open, and follows the shell menu rules (`useDisclosure`).

### Breadcrumbs

- `Breadcrumbs` (`components/breadcrumbs.tsx`) on the catalog, the category landings and the listing page: "Inicio / Instrumentos / Guitarras / Guitarras eléctricas / <title>" (the type level appears only when it narrows the category; `listingBreadcrumbs` in `lib/shell.ts`).
- From 768 px: 13 px, links in ink-2 with a `line-deco` underline, the current page in ink with `aria-current="page"` and no link; 12 px above the page title block. On phones only the listing page shows the trail, as a back link to the parent ("‹ Guitarras eléctricas", with "Volver a" for screen readers; `phoneBackLink`); the catalog and the category landings show none on phones, where the strip starts with "Instrumentos" and the logo leads home (N11).
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

## Discovery (UX-3a)

The catalog (`/listados`) and the category landings (`/instrumentos/<categoría>`) share one page, `CatalogView` (`components/catalog-view.tsx`); the brief is `docs/ux-redesign/ux-3-discovery.md`. Facets, applied chips and catalog URLs come from one pure module, `lib/catalog-filters.ts`, so the sidebar, the sheet and the tests agree; the query is `lib/catalog.ts`.

### The listing card

- `components/listing-card.tsx` is the only listing card, in two variants: `grid` (below) and `showcase` (the home's vitrina tile, "Home" below). An `<article>` with one link, the title, stretched over the whole card, and the favourite above it: two tab stops.
- Photo: square, `object-fit: cover`, in an 8 px frame with a 1 px `subtle` border on `canvas`; responsive optimized image; the first grid row eager (`eager`), the rest lazy. Over it, 8 px in: the favourite (`FavoriteButton variant="overlay"`: a 36 px white circle in a 44 px hit area, top right) and "N fotos" when there is more than one photo (12/16 600, white on `frame` at 75%, bottom left). No arrows, dots, carousel or category tag.
- Caption, 8 px under the frame: the title (`t-card-title`, two lines reserved so prices line up), the price (`t-card-price`), a spec line (`t-meta`, one line: the condition and up to two key attributes of the type, `getCardSpecLine`), a seller line (`t-meta`: the city, which truncates first, then "Particular", "Tienda" or "Tienda verificada" with the 14 px verified mark). No store link on the card.
- Hover: the frame's border turns `line-strong` and the title gets the 2 px blue underline. No lift, no zoom.
- Headings: `h2` in the catalog and the landings, `h3` under a section heading (`headingLevel`).
- Grid (`lib/ui/listing-grid.ts`): two columns on phones, three from 768 px, four from 1280 px beside the filters; column gaps 12 / 20 px, row gaps 24 / 32 px. Store inventory and recommendations use the same card in their own grids (UX-4, below).

### Catalog and landing page

- White page in `PageContainer`. The breadcrumb from 768 px (none on phones, N11), then the title row: the `h1` (`t-page`: "Instrumentos", the category, or "Tiendas verificadas" for N7's entry; on a landing its heading) and the count ("262 resultados", `t-meta`, `id="resultados-estado"`). From 1024 px the alert entry and the sort menu sit at the right; on phones and tablets the count reads "6 resultados · Recientes" at the right, and two 44 px secondary buttons follow, "Filtrar" (with a `CountBadge` of applied filters) and "Ordenar".
- A landing adds its introduction as one lead paragraph (16/24 `ink-2`, 68 characters a line) and its type chips (`ChipLink`). At the end: "Otras categorías" (`ChipLink`s) and "Compra con cuidado".
- Applied chips under the title row: "Filtros activos:", one `AppliedChip` per value (several locations or conditions are one chip each), "Limpiar todo" (quiet; the plain catalog, or the landing). The category is a chip on `/listados`, never on its landing; sort is never a chip. Then a 1 px `line-deco` rule.
- From 1024 px two columns: the 272 px filter column (not sticky), 32 px gap, the results.
- Results: the grid, then "Mostrando 1–24 de 262" (`t-meta`, centred) and the pagination. When a filter or a category narrows the search, the last page ends with a tile on `canvas` spanning two columns: "¿No está lo que buscas?" and the alert entry.

### Filters

- Facets, in order: Categoría (on `/listados` without a category), Tipo (a category with several types: guitars), Condición, Precio, Ubicación, Vendedor, Marca, then the type's attributes (shown for a chosen type, or a category with a single type).
- Desktop (1024 px and up, `ListingFilters`): live facets. Each option is a link to the catalog with that value set or cleared (`aria-current="true"` on the chosen one), so the column works without JavaScript and filtered URLs stay `noindex`. One-value facets are radio rows (a circle with an ink dot, "Todos"/"Todas" first); condition and location are checkbox rows (a square with an ink fill and a white check); short attribute values ("22\"", "5 piezas") are 36 px `ChipLink`s, pressed again to clear. Rows are 36 px; each facet has an `h2` (14/20 600); facets are separated by 1 px `line-deco` rules. Price and brand are small GET forms with "Aplicar" (secondary, 36 px) that keep every other filter in hidden fields.
- Phones and tablets (`FilterSheetButton`): "Filtrar" opens the `Sheet` "Filtros". Tipo as `Chip` toggles; Condición as `Checkbox` rows; Precio as two fields with an "S/" prefix; then disclosure rows that show the current value ("Todas ⌄", "2 ubicaciones ⌄") and open in place: Categoría, Ubicación (`Checkbox`), Vendedor (`Radio`), Marca, each attribute. Footer: "Limpiar" (quiet, resets the sheet) and "Ver resultados" (primary, 52 px). The sheet is controlled and starts from the URL each time it opens; applying runs one navigation and focus goes to the results count; dismissing discards the changes and returns focus to "Filtrar".
- Several values (F11): condition and location are "any of"; the parameter repeats (`?location=Lima&location=Arequipa`), and one value keeps today's URL. Saved alerts keep one value per filter, so on such a search every alert entry gives way to "Para crear una alerta, elige un solo valor en cada filtro."

### Sort and pagination

- Sort is never a form field. Desktop: `SortMenu`, a disclosure button "Ordenar: Más recientes ⌄" (secondary, 36 px) whose menu lists the three orders as links with a check on the chosen one (shell menu rules). Phones and tablets: "Ordenar" opens a `Sheet` with the same three links; a choice applies at once.
- `Pagination`: "Mostrando a–b de N", then `nav` "Páginas de resultados": "Anterior", the numbers with ellipses (1 … 4 5 6 … 11) and "Siguiente". The current page is an ink square with white text and `aria-current="page"`. 40 px targets from 768 px; on phones 44 px numbers and icon-only arrows ("Página anterior", "Página siguiente"). Crawlable `?page=N` links that keep the filters; page 1 has no `page` parameter.

### Navigation and states

- No route-level `loading.tsx` (it made some catalog transitions never commit; Q1 A). The page's links, chips, pagination and forms navigate inside a transition (`CatalogNavigation`, `CatalogLink`): the results stay on screen with `aria-busy`, dim to 50% after 200 ms (`.catalog-results`), and a polite "Cargando resultados…" is announced; the filters stay usable. After the move, focus returns to the option just chosen (filter options keep their ids), the sort button or the results count. Catalog links are not prefetched.
- Error: a danger notice "No pudimos cargar las publicaciones. Vuelve a intentarlo en unos minutos." with "Reintentar" (secondary, the same URL); filters and sort stay.
- Empty catalog (nothing published, no filter): `EmptyState` "Aún no hay publicaciones" / "Las primeras publicaciones aparecerán aquí." / "Publicar un instrumento".
- No results: `EmptyState` "No encontramos resultados" / "Prueba quitar un filtro o buscar otra marca." / "Limpiar filtros" and the alert entry; the chips stay above.
- Empty landing: "Aún no hay publicaciones de <categoría>", the alert entry, "Ver todo el catálogo", "Publicar un instrumento"; `noindex`.
- The alert entry (`CreateSearchAlert`): "Crear alerta" in the title row (secondary, 36 px), a chip-styled button among the chips on phones, the end tile and the no-results state; only when a filter or a category narrows the search. It opens a panel with what the alert saves, its frequency and "Crear alerta"; signed out it leads to sign-in and back. Success: "Alerta creada. Te avisaremos por correo solo sobre publicaciones nuevas que coincidan."

## Home (UX-3b)

The home (`app/page.tsx`) is the decided "Inicio · versión final"; the brief is `docs/ux-redesign/ux-3-discovery.md` § Home. Order: the home header, the banner, "En vitrina", "Explora por categoría", "Recién publicados", "Cómo funciona Laria", "Tiendas verificadas", the sell block, the full footer. Data: `lib/home.ts` (read-only, the public client, so RLS decides what is public); banner pieces: `lib/home-banner.ts`; sections: `components/home/`.

### Banner

- One of the nine decided pieces (`public/banners/`, sources and rules in `docs/ux-redesign/art/rotation/`) per request, picked on the server (`pickHomeBanner`; the page is dynamic). Only that piece is preloaded (`preload` with `media`: the desktop file from 768 px, the phone file below) and loaded, through `<picture>`: WebP 1x/2x with the JPEG fallback. Decorative: `alt=""`. No carousel, no motion (H11).
- From 768 px: a 300 px band, the art `object-fit: cover; object-position: center` behind the text, centred on the page axis and lifted 13 px above the middle: `h1` "El mercado de instrumentos del Perú" (`t-display` 40/44, white), the lead "Nuevos y usados, de músicos y tiendas de todo el país." (16/24, `line-deco`), then the search.
- Phones: the 390×150 art strip (fixed aspect ratio), then the text on frame black (`h1` 28/32, lead 14/20); a 40 px CSS gradient fades the art's bottom into the frame (Q16 A; the art files are unchanged).
- The search is the header search's GET form (`brand` to `/listados`, the N8 placeholder, the label "Buscar por marca en el catálogo"): a white box, radius 8, 64 px tall and up to 640 px wide from 768 px with "Explorar" (primary, 52 px) at a 6 px inset; 56 px with a 44 px "Explorar" on phones. It records nothing itself; the catalog records the search. Every height is fixed, so the image never shifts the page.
- The art may leave the brand palette; the interface over it does not (H10).

### Sections

- Spacing (audit item 7): 32 px under the banner, then 48 px between sections from 768 px; 24, then 32 on phones. Section titles are `h2` `t-section`, subtitles `t-meta`; a section's link sits on the title's line, right-aligned (item 15), with its hit area grown to 44 px on phones. Eight type sizes on desktop: 40, 20, 18, 16, 15, 14, 13, 12.
- **En vitrina** (H2, H3, Q12): "Lo más reciente de cada categoría. Se actualiza sola." and "Ver las N publicaciones" (the total, Q10 B). The newest approved listing of each category with 3 photos or more (`listing_photo_count`), the five most recent of them (`selectVitrina`). The **showcase tile**: a bordered 8 px box (1 px `subtle`, `line-strong` on hover) with the square photo and, on it, 8 px in, the ink price tag (`ink` fill, white 14 px / 750 tabular text, a 1.5 px white edge, 4 px radius), the tile's only price; under it, 12 px in, the category micro label (`t-micro`, `ink-2`), the title on one line (`t-card-title`, truncated, `h3`) and the seller line (below 1280 px the city takes its own line above the seller words). No favourite, no photo count, no spec line: one tab stop. Five columns from 1024 px; below, a row that scrolls sideways inside the section (160 px tiles on phones, 192 px on tablets, 12 / 20 px gaps). Hidden when no category qualifies.
- **Explora por categoría**: eight tiles in taxonomy order, each a link to its landing (SEO-002), with the name (`t-card-title`), "N publicaciones" (`t-meta`, Q10 B) and a chevron; bordered like the cards; two columns on phones (44 px minimum), four from 768 px, eight from 1280 px.
- **Recién publicados** (Q15 B): the newest approved listings without the vitrina's (`selectFeed`), as grid cards with `h3` titles: eleven and the end tile on desktop (`HOME_FEED_GRID`: 2 / 3 / 4 / 6 columns at 0 / 768 / 1024 / 1280 px, about 213 px cards at 1440), the first six on phones and then "Ver las N publicaciones" (secondary, full width). No link in its header (item 16). The end tile, on `canvas` without border, square: "N publicaciones" (`t-section`), "Guitarras, baterías, pedales, amplificadores y más." and "Ver todo el catálogo". Empty marketplace: `EmptyState` "Aún no hay publicaciones" / "Las primeras publicaciones aparecerán aquí." / "Publicar un instrumento".
- **Cómo funciona Laria** (`id="como-funciona"`, H4, H5): a `canvas` panel without border; on the left the title, "Laria conecta a quien compra con quien vende. No procesa pagos ni envíos: eso lo acuerdan ustedes." and "Consejos de seguridad" (after the safety line on phones); on the right the four promises (H4 2–5), each with an 18 px line icon (the verified mark drawn at the same 18 px, item 12), a 16 px / 600 title and a 14 px `ink-2` line; under them, after a `line-deco` rule, the safety line. The home makes no email promise (H4).
- **Tiendas verificadas** (Q18 A, N7): "Ver todas" opens the catalog filtered to verified stores. Up to three active verified stores, newest first, each a link to its page: the logo or white initials on a 40 px `frame-2` square (item 11), the name, the place, `VerifiedMark`; no stats. Then the `canvas` tile "¿Tienes una tienda?" with "Registrar mi tienda" (`/registrar-tienda`, N10). Four columns from 1024 px, a sideways row below (256 px tiles). Hidden when there is no verified store.
- **Sell block** (H4, item 9): a `canvas` panel without border, "¿Tienes equipo que ya no usas?", "Publicar es gratis. Revisamos tu publicación antes de mostrarla." and "Vender mi equipo" (primary, 52 px, full width on phones), the page's other yellow action, far from "Explorar".

### States

- The home is server-rendered; there is no loading state of its own.
- A failed listing query (the vitrina's, the feed's) leaves its section out, the rest renders and the error goes to the server log; a failed count leaves the counts out ("Ver todo el catálogo" instead of "Ver las N publicaciones"); a failed stores query hides the stores section. Without the public Supabase keys every listing section is left out.
- Empty marketplace: no vitrina; "Recién publicados" shows the empty state. When the vitrina already holds every listing, "Recién publicados" is left out. No verified store: no stores section.

## Listing and store pages (UX-4)

The brief is `docs/ux-redesign/ux-4-listing-store.md` (answers L1–L21, provisional until the 4a/4b reviews; build choices U1–U8 in `decisions.md`). Components: `components/listing/` and `components/store/`.

### Listing page (`app/instrumentos/[slug]`)

- White page in `PageContainer`. From 1024 px a 12-column grid: the gallery (7 columns), then "Especificaciones", "Descripción" and the reviews under it; the decision column (5 columns, spanning both rows, nothing sticky): `StatusTag` "Vendida" when sold, the `h1` (`t-page`), "Marca Modelo" (`t-ui` ink-2), the price (`Price size="detail"`), the condition `Tag` and "Miraflores, Lima · Publicado hace 3 días" (`t-meta`, composed on the server), the spec strip, the contact module, the trust statement, the seller card and "Reportar publicación". Below 1024 px the column wrappers are `display: contents` and each block takes an `order`: gallery, identity, a compact seller row (links to `#vendedor`), strip, trust statement, specifications, description, seller card, report, reviews.
- **Gallery** (`ListingGallery`): one sideways track of 4:3 frames (photo contained on white, 1 px `subtle` border, radius 8); phones swipe it (scroll snap), from 1024 px two 44 px round arrows move it; the counter "1 / 8" (13 px / 600 white on `frame` at 75%, polite) shows with two photos or more. Each frame is a button "Ampliar foto N de M". The first photo is eager with high fetch priority (the LCP); the rest lazy. Thumbnails in `role="group"` "Miniaturas de fotos": square, cover, 56 px on phones and 72 px from 1024 px (`sizes="(max-width: 1023px) 56px, 72px"`), the chosen one with a 2 px ink ring and `aria-current`; four on phones and six wide, then a "+N" tile that opens the lightbox at the next photo. No photo: "Sin foto".
- **Lightbox** (`Lightbox`): a native modal `<dialog class="lightbox surface-frame">` over frame black at 95%, rendered only while open; the photo fitted to the viewport (`sizes="100vw"`, loaded only now), "Foto N de M" (polite), 44 px "Cerrar" and arrows, Esc, arrow keys and a sideways swipe; Tab wraps inside; focus returns to the opener. A 120 ms fade, none under reduced motion.
- **Contact module** (`ContactModule`): "Contactar por WhatsApp" (primary, 52 px, `source` detail) and "Guardar" (`FavoriteButton variant="module"`: full-width secondary 44 px with its label from 1024 px, "Guardada" with `aria-pressed` when saved; a 44 px square on phones). Below 1024 px and at least 560 px tall the same element is the bar at the bottom of the screen (`.contact-bar` in `app/globals.css`: white, 1 px `line-deco` top border, safe area), with "Laria no procesa pagos ni envíos · Consejos de seguridad" under the buttons; the page ends with `.contact-bar-spacer` and the document gets a matching `scroll-padding-bottom`, so the bar never hides focus. On shorter viewports it stays in the page after the identity block. One WhatsApp button per page; none, and no bar, on a sold listing (its text and "Ver publicaciones similares" take the module's place).
- **Trust texts** (`TrustNote`, `TRUST_COPY`): every limitation text of these pages lives there. One trust statement per page next to its contact button (a 16 px shield, `t-meta`, "Consejos de seguridad"); the reviews, a sold listing and the store's verification have their own lines.
- **Spec strip** (`SpecStrip`): up to four of the type's attributes, the card's two first, in bordered cells (label `t-meta`, value `t-ui` 600), three a row on phones. **Specifications** (`SpecTable`): Tipo, Marca, Modelo, Condición, then every attribute; empty rows left out; 44 px rows with `line-deco` separators, two columns from 1024 px.
- **Seller card** (`SellerCard`, `id="vendedor"`): a 40 px square (store logo, white initials on `frame-2`, or a Particular's initials on `canvas`), the name, `VerifiedMark` or the `Tag` "Tienda"/"Particular", the place, then real figures only: "4.8 ★ · 9 reseñas" (read as "4.8 de 5"), "N publicaciones" (streamed), "En Laria desde jul. 2026" (America/Lima). A store adds "Ver la tienda" (secondary, 36 px). No contact button.
- **Reviews** (`ReputationSection`, shared with the store page): the average "4.8 de 5 · 9 reseñas", the five latest (reviewer "Rodrigo C.", stars plus "5 de 5", the month, the comment, "Reportar reseña"), "Mostrando las 5 más recientes de 9", "Aún no tiene reseñas." and the closing line "Solo se reseña después de una compra que comprador y vendedor confirmaron en Laria. Laria no procesó el pago ni la entrega." A failed reputation call leaves the section out.
- **Related** (`RelatedListings`): "Publicaciones similares" ("Ver todo") and "Más de esta tienda" ("Ver la tienda") / "Más de este vendedor", four cards in a 2 / 3 / 4 column grid (gaps 12 / 20), left out when empty; `Skeleton` cards hold their place while they stream.
- **Report**: `ContentReport` keeps its flow; its form (`content-report-form.tsx`, with the Supabase browser client) loads with `next/dynamic` on the first press. First-load JS: listing 146 kB, store 132 kB (208 and 195 before).
- **Strip**: the page renders `<StripCurrent value=…>`; the strip marks it after hydration (`useStripCurrent`).

### Store page (`app/tiendas/[slug]`)

- `StoreHeader` on a `canvas` band: the breadcrumb from 768 px ("Inicio / Tiendas verificadas / <tienda>" for a verified store, "Inicio / <tienda>" otherwise); the uploaded banner as a 120 px strip (96 px on phones, decorative), nothing when there is none; the 96 px logo or white initials (64 px on phones), the `h1`, `VerifiedMark` or `Tag` "Tienda", the place, the description (68 characters a line), the figures (rating, "N publicaciones", "En Laria desde …"); at the right (full width on phones) "Contactar por WhatsApp" (52 px, `source` store) and the trust statement.
- `StoreSectionLinks`: `nav` "Secciones de la tienda" with "Publicaciones 24", "Reseñas 9" and "Sobre la tienda", links to sections on the page (not tabs), 44 px on phones.
- "Publicaciones": the card in a 2 / 3 / 4 / 5 column grid, numbered pages of 24. "Reseñas" and "Sobre la tienda" side by side from 1024 px. `StoreAboutSection`: Ubicación, Redes (only `http(s)` URLs, `rel="noopener noreferrer nofollow"`), Fotos del local (up to five, opening the lightbox), Verificación ("Laria revisó a mano…" or "Laria aprobó esta tienda…"), "Reportar tienda". No street address or contact person. The strip marks "Tiendas verificadas" on a verified store's page.

## Selling (UX-5)

- **One page, numbered sections** (`FormSection`): 1 Fotos, 2 El instrumento, 3 Condición y precio, 4 Ubicación, 5 Descripción, 6 Características (only when the type has attributes), then Publicar. Sections are separated by a `subtle` rule; the heading is `t-section` with its number in `ink-2`.
- **Photos first**, with a four-item checklist (`PHOTO_GUIDANCE`). Each photo card: preview 4:3, "Principal" on the first, "Foto N de M", then Anterior / Siguiente / Reemplazar / Quitar named "Mover foto N antes/después", "Reemplazar foto N", "Quitar foto N" (create and edit alike).
- **Type** is `TypeChips`: native radios inside 44 px chip labels (accent fill and check when chosen). **Condition** is `ConditionCards`: three radio cards with a one-line definition; the stored values do not change.
- **Errors**: the form validates itself (`noValidate`). Each field shows its error under the label (`Field error`, `aria-invalid`, `aria-describedby`); `ErrorSummary` sits at the top of the form, takes focus on every failed submit, titles "Revisa N datos antes de publicar" and lists links that focus each field. An error clears when its field changes. Server errors stay in `PageNotice`.
- **Sending**: the button reads "Publicando…" and a status line says "Subiendo foto N de M…", then "Enviando la publicación…".
- **After sending**: the form is replaced by a `PageNotice` that says what happens next; listings that go to review promise the email, never a speed.

## Accounts (UX-6)

- **Inventory** (`ListingManagementTable`, Mis publicaciones and Inventario): a table from 768 px; below it each row is a card: the title, then one row per value with its column name on the left (`data-label`), then the actions. No sideways scroll.
- Store names are never uppercase eyebrows: the eyebrow is "Mi tienda"; the name goes in the summary line.

## Admin (UX-7)

- Queue cards show photos inline (4:3 thumbnails, two columns on phones, four from 640 px), each opening full size in a new tab.
- Decisions: reject, hide, dismiss, revoke and hiding a review use the `danger` button; approve, restore, verify and resolve the `secondary` one. No yellow in the queue (several cards share a view).
- Verify and revoke ask first with the consequence; reasons stay required for reject, hide, resolve and dismiss.
- Admin times are always America/Lima. Identifiers sit on their own "Identificador" line, never in a title line.

## Components (`components/ui/`)

Use these instead of writing new markup for the same job.

- `Button` / `buttonClasses()`: variants `primary` (yellow, one per view), `secondary`, `quiet`, `danger`, `onDark`; sizes `sm` 36, `md` 44, `lg` 52; `loading` + `loadingLabel` keep the primary yellow; with `href` it renders a link. `IconButton` requires a `label`.
- `Field` with `Input`, `Select`, `Textarea`, `FileInput`, `Checkbox`, `Radio`: every control has a visible label; `Field` wires `id`, `aria-describedby` (hint and error) and `aria-invalid`. `Textarea` with `maxLength` shows an "n / max" counter. Give each field a unique `id` (use `useId()` in repeated components).
- `Tag` and `StatusTag`: status labels and tones come from `lib/ui/status.ts`, the single dictionary (domains: `listing`, `revision`, `store`, `claim` for Compras y ventas, `transaction` for the Admin sale records, `report`, `review`, `alert`). `StatusEntryTag` renders a status already resolved to an entry, such as `storeStatusEntry()` ("Tienda verificada" for an active verified store). Admin shows a report's target and the audit history through `adminTargetStatusLabel()`. Never write a second label map. `CountBadge` for counts.
- `Chip`, `ChipLink`, `AppliedChip`: filters and period selectors; selected state has a check and `aria-pressed` (`Chip`, a toggle button: the filter sheet's type and short values) or `aria-current` (`ChipLink`, a link: short filter values, types, other categories, periods). `AppliedChip` removes a filter: it shows the value ("Lima") and is named for what pressing does ("Quitar filtro: Ubicación: Lima"). `ChipLink` and `AppliedChip` are `CatalogLink`s: inside the catalog they report to its pending state, elsewhere they are plain client links.
- `Sheet` (`components/ui/sheet.tsx`): a bottom sheet over a native modal `<dialog>`, rendered only while open. White, 8 px top corners, `shadow-level-2`, up to 88% of the viewport, over frame black at 55% (`.sheet` in `app/globals.css`); a header with the title (`t-section`) and a 44 px close button, a scrolling body and an optional footer above a 1 px rule. It slides up in 200 ms (in place under reduced motion). The page behind is inert and does not scroll; Tab wraps inside; Esc, the close button and a press on the backdrop call `onDismiss`, and the caller returns focus to the button that opened it.
- `ConfirmDialog` / `useConfirm` (UX-6): the in-page confirmation for actions that need one (never `window.confirm`). A modal `<dialog role="alertdialog">`, 440 px max, title as a question, one-line body, "Cancelar" (focused first) and a verb button (`danger` for deleting or cancelling); Esc and the backdrop cancel; focus returns to the control.
- `ErrorSummary` (UX-5): a form's failed checks at the top of the form, focused on each failed submit, links that focus each field; renders nothing without errors.
- `Notice` (`info`, `success`, `warning`, `danger`, icon + text): danger is an alert, others a status; use `role="note"` for static explanations. Its body underlines every link, so a notice that holds buttons, or that receives focus through a ref, composes `noticeClassName()` + `NoticeIcon` instead (as `PageNotice` does). `PageNotice` moves focus to page-level results; do not use that movement for field errors.
- `PageHeader`: the page's only `h1`, with an optional eyebrow, a one-line summary (`meta`, 13 px) and the page's actions; a longer 16 px introduction stays a paragraph after it. Light surfaces only: headers on the black frame keep their own markup.
- `EmptyState` (any list or section with nothing to show; `headingLevel={3}` under a section heading), `Price` (S/ with tabular figures; `card`, `detail`, `inline`), `VerifiedMark` / `VerifiedIcon`, `Skeleton`, `IconButton`, `WhatsAppGlyph`.
- Shell components (UX-2): `BrandLogo`, `Breadcrumbs`, `ErrorPage`, `AccountSectionLinks`, `CategoryPanel`, `CategoryAccordion`, `useDisclosure`, `useDisclosureGroup`, and since UX-3b `HomeHeader`; see "Shell and navigation". Catalog navigation (UX-3): `CatalogNavigation`, `CatalogLink`, `CatalogResults` (`components/catalog-navigation.tsx`). Home (UX-3b): `HomeBanner` (`components/home/home-banner.tsx`) and the sections in `components/home/home-sections.tsx`; see "Home".
- `tests/ux-primitives.test.cjs` fails when a primitive loses its last consumer or a hand-rolled copy (error box, pulse placeholder, price class, count pill) comes back. `Chip` and `Radio` found their first consumer in the filter sheet (UX-3). `Skeleton` holds the listing page's streamed sections (UX-4); no primitive is exempt.

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
