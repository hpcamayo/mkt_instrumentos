# UX-3 · Discovery — brief

**Status: approved by the owner on 8 Oct 2026**, with the answers in § Owner answers (8 Oct). The owner took every recommendation except Q8: condition and location become multi-choice (flag F11), as amended in § Filters. Build order: 3a, then 3b (Q2). The stall fix (Q1 A) is built first in 3a. Where this brief and the concept screenshots differ, this brief wins.

UX-3 makes discovery fast: one listing card everywhere, a catalog that works like a discovery tool, category landings that share it, and the decided marketplace home. It changes no schema, migration, RLS, auth, moderation, lifecycle or seller-contact rule. The only query changes are the flags the owner approved:
- F10, part B: the home's total and per-category counts;
- F11: several values for condition and location in the catalog.

**Visual references**
- `screenshots/home-final/`: `R-Inicio-1440`, `R-Inicio-390` (the decided home, "Inicio · versión final"), `R-Rotacion` (the nine banners).
- `screenshots/page-concepts/`:
  - `Catalogo-1440` (title, alert, sort, applied chips, facets, cards, end-of-results alert tile);
  - `Catalogo-390` (title, "Filtrar"/"Ordenar", chips, two columns);
  - `Filtros-390` (the phone sheet);
  - `Inicio-1440` and `Inicio-390` (superseded by `home-final`).
- `art/rotation/`: nine pieces at 1440×300 / 2880×600 (desktop) and 390×150 / 780×300 (phone), WebP with JPEG fallbacks, `manifest.json`, rules in its README.
- The concepts predate N1/N9, N8, N11 and N12. Where they differ, the decisions win:
  - "Vender" is the outline button on dark;
  - the search placeholder is "Busca por marca: Yamaha, Fender…";
  - no breadcrumb on phones for the catalog and landings;
  - the category menus restored by N12.

## Decided inputs

| Source | What it fixes for UX-3 |
| --- | --- |
| H1, H5 | The home's first screen is the vitrina: banner with headline and search, then "En vitrina"; guarantees go lower ("Cómo funciona Laria") |
| H2 | Vitrina tiles are automatic: the newest approved listing of each category with 3 photos or more; each tile names its category; it refreshes by itself |
| H3 | Vitrina prices are ink tags: #101217 fill, white text, 1.5 px white edge |
| H4 | Promises 1–5 as written ("Publicar es gratis", "Laria no cobra comisión", "Cada publicación la revisa Laria o viene de una tienda verificada", "Laria revisa a mano su RUC, dirección y contacto", "Solo se reseña después de una compra que comprador y vendedor confirmaron en Laria"); no email promise on the home; sell block "Publicar es gratis. Revisamos tu publicación antes de mostrarla." |
| H6 | Headline "El mercado de instrumentos del Perú" |
| H7, H9, H10, H11 | One of the nine `art/rotation/` pieces per visit, chosen where the page renders, no carousel and no motion; text and search centred; art may leave the brand palette, the interface does not; decorative (`alt=""`) |
| N1, N9 | Header "Vender" is the outline button on dark, also in the home header |
| N3, N4, N5 | Nothing sticky in the shell; no bottom bar on phones; full footer on the home only |
| N7 | "Tiendas verificadas" opens `/listados?seller_type=verified_store`; there is no stores directory |
| N8 | The search matches the brand only; one placeholder, "Busca por marca: Yamaha, Fender…", in the header and the banner |
| N11 | No breadcrumb on phones on the catalog and the landings |
| N12 | The home header's "Categorías" menu replaces the strip on the home and gives the same category and type access |
| G1 | The catalog is "Instrumentos"; the URL stays `/listados` |
| Home visual audit | Items 2, 3, 6, 7, 8, 9, 11, 12, 15, 16, 17 as written there; 4 and 13 are questions (Q15, Q16); the design-system confirmations are Q17 |

## The catalog transition stall

The roadmap's first task. A client navigation between two catalog URLs fetches its data and never shows it.

**What happens**
- A client move from `/listados` to `/listados?<query>` gets the RSC payload (HTTP 200, about 25 ms locally, every row present).
- Then nothing: no error, no further request.
- The URL and the page stay on the old catalog, also after 65 s. That rules out React's 60 s wait for stylesheets, the only commit delay in this React build.
- It is not specific to the verified-store filter. On today's head:
  - `?condition=Nuevo`: 10 of 10 stall;
  - `?seller_type=verified_store`: 9 of 10;
  - `?category=guitars`: 5 of 10;
  - `?page=2`: 1 of 10.

**Where it came from.** Bisect of UX-1 (`49a38e5..3da7afa`) on scratch production builds. Method in § Appendix: stall measurements.

| Build | Stalls (`/listados` → `?seller_type=verified_store`) |
| --- | --- |
| `49a38e5` `main` | 0 of 16 (7 Oct), and 0 of 12 to `?condition=Nuevo` (8 Oct) |
| `8fa616f` (tokens, Archivo, skip link) | 0 of 10 |
| `6525abb` (primitives) | 0 of 12 |
| **`444ac25` (class migration)** | **6 of 10**, the first bad commit |
| `2d647ef` (glossary) | 7 of 10 |
| `645d51e` (UX-1 complete) | 3 of 7 (7 Oct) |
| head `6fafbed` | 9 of 10 (14 of 18 on 7 Oct) |

**Cause**
- **What Next does here.** Next.js 15.5.18's router has no prefetch entry for the exact target URL. It falls back to an "aliased" entry: the one it seeded for the first page load, `/listados`, the same path without the query. It does this only because the route has a `loading.tsx`.
  - It renders the new page with the loading boundary and no page data.
  - The layout router fetches the page lazily: the one request seen.
  - It patches the router state with the result (`ACTION_SERVER_PATCH`).
- **What a stalled trial shows.** The router's own state, read in the page through webpack's module registry:
  - it already holds the new URL and the patched page data;
  - the seeded `/listados` entry is marked as used;
  - React never renders that state.
- **Inferred, not instrumented:**
  - The layout router has a rule for a segment that has no data and whose lazy fetch has already finished: it suspends on Next's never-resolving `unresolvedThenable` (`layout-router.js:312`).
  - Only a later router update can end that, and none comes.
- **A timing race, not a line of code:**
  - `main` takes the same aliased path (its seeded entry is used too) and completes every time.
  - `444ac25` is where it starts stalling, but neither half of that commit is enough on its own:
    - its shell files back at `6525abb`: 0 of 10;
    - its catalog files back at `6525abb`: 0 of 10;
    - only its footer back: 4 of 10;
    - only its new footer, added to `6525abb`: 1 of 10.
  - So `444ac25` did not add a defective line. It changed the render work enough to expose a race in Next's aliased navigation, and later commits made it more frequent.
- **Two checks confirm the path:**
  - with the target prefetched first (`router.prefetch`), the same move stalls 0 of 10;
  - head without `app/listados/loading.tsx` stalls 0 of 42. The four moves are in § Appendix: stall measurements.

**The fix (Q1 A, decided 8 Oct; built first in 3a)**
- **Remove `app/listados/loading.tsx`, the app's only route-level loading boundary.**
  - Without it Next fetches the exact URL instead of aliasing (0 of 42 trials on head).
- **Navigation feedback moves into the page.** While a catalog navigation is pending (`useTransition`), the current results stay on screen at 50% opacity after 200 ms, with `aria-busy` and a polite "Cargando resultados…".
- **Cost:** a full page load of the catalog sends its first byte only after the catalog query. This is option A of the Sprint 9 Googlebot investigation (`docs/sprint-9-production-release-gate.md`), which chose to keep the skeleton at the time.
- **What stays:**
  - `htmlLimitedBots` in `next.config.ts` (harmless; `sprint-9-gate` checks it).
  - Category landings and listing pages had no loading boundary and are unaffected.
- **Then the workaround goes.**
  - `ShellLink`'s native-link rule for catalog URLs (`isCatalogHref`, UX-2) and `AppliedChip`'s plain link become client links again.
  - The filter form stops being uncontrolled (§ Filters).
- **Alternatives** (in the review page):
  - an in-page `<Suspense>` keyed by the query, which keeps a streamed skeleton (not measured);
  - prefetching every catalog URL before navigating (a workaround that leaves the race in place);
  - upgrading Next.js (a dependency change; whether a later 15.5 release fixes it was not checked, as the registry was not reachable from this session).

## Split (Q2)

Recommended: **3a** first, then **3b**, each with its own build, evidence, acceptance package and review page, under this one brief.
- **3a:** the stall fix, the one card, the catalog, filters and sheet, chips, sort, pagination, landings and states.
- **3b:** the home, whose tiles reuse the 3a card.

3b starts when the owner accepts 3a.

## Proposed design

### The one listing card (3a)

`components/listing-card.tsx` becomes the only listing card. The home's second card (`components_v0/featured-listings.tsx:74`) goes. Two variants: `grid` (catalog, landings, the home feed, later store grids and Favoritos) and `showcase` (the vitrina tile).

**Grid card** (Catalogo-1440, "Recién publicados" in R-Inicio):
- **Markup:** an `<article>` with one link, the title, stretched over the whole card (the card is clickable, one tab stop), and the favourite button above it. Two tab stops instead of up to ten (`listing-card.tsx:161–239`).
- **Photo:** square (Q4), `object-fit: cover`, in an 8 px rounded frame with a 1 px `subtle` border, on `canvas`.
  - Responsive image, as today (PHOTO-016).
  - First row eager, the rest lazy.
- **Overlays**, one 8 px inset:
  - the favourite, a 36 px white circle with a 44 px hit area, top right;
  - "5 fotos" when there is more than one photo, bottom left, white 12/16 600 on `frame` at 75%.
  - No arrows, dots or in-card carousel (Q5). The category tag on the photo goes: the page or the tile already says it.
- **Caption** under the frame, flush left, 8 px below:
  - title `t-card-title` (15/19, **600**), two lines reserved (38 px) so prices line up (audit item 3);
  - price `t-card-price` (18/22, 750);
  - a spec line (`t-meta`, one line, truncated): the condition and up to two key attributes of the type (Q3). Example: "Usado · buen estado · Shell pack · 22"";
  - a seller line (`t-meta`): city, then "Particular", "Tienda" or "Tienda verificada" with the 14 px verified mark. Verification carries words, so the concept's "Tienda ✓" becomes "Tienda verificada"; the city truncates first.
  - No store name link on the card (one link per card); the store is on the listing page.
- **Hover:** the frame's border turns `line-strong` and the title gets the 2 px blue underline. No lift, no zoom.
- **Headings:** `h2` in the catalog and landings, `h3` under a home section heading (a `headingLevel` prop).
- **Unchanged:**
  - impressions (`useListingImpression`, AN-001, source `catalog` or `home`);
  - the favourite (`FavoriteButton`: FAV-003, FAV-007);
  - `getListingDisplayTitle` (`sprint-3-1`).

**Key attributes per type** (Q3 option A; existing `attributes`, labels from `lib/instrument-filters.ts`; none when absent):

| Type | Up to two attributes |
| --- | --- |
| Guitarras eléctricas | Pastillas; Número de cuerdas when it is not 6 |
| Guitarras acústicas | Tipo; Cuerpo |
| Bajos | Número de cuerdas; Tipo |
| Baterías | Configuración; Medida de bombo |
| Platillos | Tipo; Medida |
| Micrófonos | Tipo; Patrón polar |
| Interfaces de audio | Entradas; Conexión |
| Pedales | Tipo; Formato |
| Amplificadores | Tecnología; Potencia |

**Showcase tile** (vitrina, home only):
- A bordered 8 px box with the photo (square) and the caption inside, 12 px padding.
- On the photo, top left: the ink price tag (H3). It is the only price on the tile.
- Caption:
  - the category as a micro label ("GUITARRAS", `t-micro`, `ink-2`);
  - the title on one line (600, truncated);
  - the seller line.
- No favourite, as in the concept (FAV-007 covers the cards that support favourites).

**Grid sizes** (audit items 3 and 4): radius 8; column gap 20 px from 768 px and 12 px below; row gap 32 / 24 px.
- Catalog and landings: 4 columns from 1280 px (with the sidebar), 3 from 768 px, 2 on phones (about 173 px at 390, no overflow).

### Catalog `/listados` (3a)

**Desktop (1024 px and up)**, white page, `PageContainer`:
- The breadcrumb "Inicio / Instrumentos" (UX-2), 12 px above the title.
- **Title row:**
  - `h1` (`t-page`):
    - "Instrumentos";
    - the category label when a category is set;
    - "Tiendas verificadas" when only `seller_type=verified_store` is set (N7's entry);
  - the count right after it (`t-meta`, "262 resultados", "1 resultado");
  - on the right, the alert entry (Q11 A: only when a filter or a category is set, and each filter has at most one value) and the sort menu.
  - The eyebrow "Catálogo" and the intro paragraph go (the concept's compact title).
- **Applied chips** under the title row (§ Applied chips), then a 1 px `line-deco` rule.
- **Two columns:** the 272 px filter sidebar (§ Filters), 32 px gap, the results. The sidebar is not sticky.
- **Results:** the grid, then "Mostrando 1–24 de 262" and the pagination (§ Pagination). The end-of-results alert tile (Q11 A) sits as the last grid cell when filters are applied. The same rule applies: no alert entry when a filter has several values.

**Tablet (768–1023 px)**: the phone controls ("Filtrar", "Ordenar") above three columns; no sidebar.

**Phones (below 768 px)**, Catalogo-390:
- No breadcrumb (N11).
- Title row: `h1` (28/32) on the left; "6 resultados · Recientes" (`t-meta`) on the right.
- Two 44 px secondary buttons, side by side:
  - "Filtrar", with a `CountBadge` of applied filters;
  - "Ordenar".
- The applied chips, wrapping, and the alert entry as a chip-styled button (Q11 A; hidden when a filter has several values).
- Two columns, then the pagination.

### Filters: sidebar and phone sheet (3a)

The filters keep today's query (`lib/catalog.ts`), parameter names and values, with one owner-approved change.

**F11 (Q8 B, Q19, Q20; owner, 8 Oct)**
- **Several values:** condition and location accept several values each, matched as "any of".
  - The parameter repeats: `?condition=Nuevo&condition=Usado+-+buen+estado`, `?location=Lima&location=Arequipa`.
  - One value keeps today's URL exactly, so existing links, alert emails and sitemap URLs stay valid.
  - The query uses `in` for those two columns (`eq` is the one-value case).
- **One value:** seller type, category, type, price and brand stay single choice, as today (Q20). Seller type's options overlap: a verified store is also a store.
- **Code only:**
  - Saved alerts still hold one value per filter. Their validation and matching live in the database (Sprint 7 migration), and the owner chose not to change them now (Q19).
  - So the alert entry is hidden on any search where a filter has more than one value. In its place: "Para crear una alerta, elige un solo valor en cada filtro."
  - The search event's metadata already accepts a list for a filter: the database validates the keys, not the value types. So analytics need no migration.
  - `parseListingFilters`, `ListingFilters`, `searchEventMetadata`, `listingFiltersToSearchAlert` (only for single-value searches), the catalog's canonical/`og:url` normalization and the landing's forwarding learn the repeated parameters.

**Facets, in order:**
1. **Categoría:** only on `/listados` without a category. The eight categories.
2. **Tipo:** the category's instrument types when there is more than one (guitars: eléctricas, acústicas, otro).
3. **Condición** (several values): Nuevo · Usado · buen estado · Usado · con detalles; none chosen means all.
4. **Precio:** "S/ Desde", "S/ Hasta".
5. **Ubicación** (several values): Lima · Ayacucho · Huancayo · Arequipa (`cityOptions`); none chosen means all.
6. **Vendedor** (one value): Todos · Particular · Tienda · Tienda verificada.
7. **Marca:** a text field. It combines with the other filters, unlike the header search, which submits the brand alone.
8. **The type's attributes**, from `instrumentFilterGroups`, with today's semantics:
   - shown when a type is chosen, or on a category with a single type (drums, basses, cymbals, microphones, pedals, amplifiers, interfaces);
   - today's parser already accepts attribute parameters without `instrument_type`, so the query does not change;
   - select-type attributes are single choice; multiselect attributes keep today's "all of" match; booleans read "Sí"/"No".

**Desktop sidebar (live, Q7 option A)**
- Each option is a link to the catalog URL with that value set or cleared:
  - one-value facets look like a radio row (a circle with an ink dot when chosen);
  - Condición and Ubicación look like checkbox rows (a square with a check), and each link adds or removes its own value;
  - short attribute values ("22"", "5 piezas") are `ChipLink`s.
- The chosen option carries `aria-current="true"` and its check or dot, so state never relies on colour.
- Rows are 36 px (compact desktop controls). Each facet has an `h2` (14/20 600). Facets are separated by 1 px `line-deco` rules.
- Price and Marca are small GET forms with "Aplicar" (secondary, 36 px). They keep every other parameter through hidden fields.
- Works without JavaScript. Filtered URLs stay `noindex, follow` (SEO-003/004).

**Phone and tablet sheet (apply once, Q7 option A)**, Filtros-390:
- **Container:** a dialog (`role="dialog"`, `aria-modal`, labelled "Filtros") from the bottom.
  - White, 8 px top corners, `shadow-level-2`, backdrop `frame` at 55%, up to 88% of the viewport.
  - It slides up in 200 ms; under reduced motion it appears in place.
  - Focus is trapped; Esc and the close button (44 px, "Cerrar filtros") discard changes and return focus to "Filtrar"; the page behind does not scroll.
- **Header:** "Filtros" (`t-section`) and the close button.
- **Body:**
  - Tipo as `Chip` toggles (single choice, `aria-pressed`);
  - Condición as `Checkbox` rows (44 px, several values);
  - Precio as two fields with an "S/" prefix;
  - then each of these as a disclosure row showing its current value ("Todas ⌄", "2 ubicaciones ⌄") that opens in place:
    - Ubicación (`Checkbox` rows);
    - Vendedor (`Radio` rows);
    - Marca;
    - each attribute.
  - These are the first consumers of `Chip` and `Radio` (`tests/ux-primitives.test.cjs:28`).
- **Footer**, fixed inside the sheet with a 1 px top rule:
  - "Limpiar" (quiet), which resets the sheet's choices;
  - "Ver resultados" (primary, 52 px). No live count: Q10 B approved home counts only.
  - Applying runs one navigation and closes the sheet; focus goes to the results status ("6 resultados").
- **State:** the sheet is controlled. It initialises from the URL each time it opens, so it never shows stale values.

**Ordenar (phones and tablet):** the same sheet pattern with the three options as links ("Más recientes", "Menor precio", "Mayor precio"; the chosen one with `aria-current` and a check). Choosing applies at once.

### Applied chips (3a)

- One row under the title: "Filtros activos:" (`t-meta`), then one `AppliedChip` per applied value, then "Limpiar todo" (text link) to the unfiltered catalog. On a landing it goes to the landing.
- With several locations or conditions, each value has its own chip and removing it keeps the others ("Lima ×", "Arequipa ×").
- **Chip text** is the value ("Acústica", "Nuevo", "Tienda verificada", "S/ 500 – 1,500", "Marca: Yamaha"). The accessible name stays "Quitar filtro: <facet>: <value>".
- **The category:**
  - on `/listados` it is a chip like the others;
  - on a landing the page itself is the category, so it has no chip.
- **Sort** is not a chip; it shows in the sort control.
- Chips wrap; nothing scrolls sideways.
- After the stall fix, chips are client links (Q1).

### Sort (3a)

- **Desktop:** a disclosure button "Ordenar: Más recientes ⌄" (secondary, 36 px) opening a menu of the three options as links, with the shell menu rules (`useDisclosure`: Esc, outside press, one menu at a time).
- **Phones:** the "Ordenar" button and sheet above.
- **Removed:** the sort field inside the filter form (`listing-filters.tsx:243`) and today's second sort sheet (`:119`).
- `sort` values and order are unchanged (REL-004).

### Pagination (3a, Q9)

- **Under the grid:**
  - "Mostrando 1–24 de 262" (`t-meta`, centred);
  - then `nav` "Páginas de resultados":
    - "Anterior" and "Siguiente";
    - page numbers with ellipses (1 … 4 **5** 6 … 11). The current page is an ink square with white text and `aria-current="page"`.
- **Sizes:** 40 px targets on desktop. On phones, 44 px numbers with icon-only "‹" "›" ("Página anterior", "Página siguiente").
- **Links:** crawlable `?page=N` built by `pageHref`, so filters are preserved (REL-003). Page 1 has no `page` parameter. 24 per page (REL-001). The redirect past the last page is unchanged.
- **Unchanged:** canonicals and `og:url` (SEO-002) and the landing's `?page=N` ItemList positions.

### Category landings `/instrumentos/<categoría>` (3a)

Same layout and components as the catalog. What is the landing's own:
- the breadcrumb "Inicio / Instrumentos / Guitarras";
- the `h1` stays the landing heading ("Guitarras en venta en Perú"), with the count;
- the landing intro as one lead paragraph (16/24, `ink-2`, up to 68 characters a line). It is the page's real content, not a doorway;
- type chips ("Guitarras eléctricas", "Guitarras acústicas"…) as `ChipLink`s to `categoryTypePath`, as today.
- **Filters:**
  - the sidebar and sheet are the same component, with the category fixed;
  - every option, price, brand and sort leads to `/listados?category=<value>&…`;
  - filtering happens in the canonical catalog, as today (`categoryFilterRedirect`).
- **Results:** the same grid and card, and pagination on the landing's path (`/instrumentos/guitarras?page=2`).
- **At the end:**
  - "Otras categorías" as `ChipLink`s;
  - "Compra con cuidado" as written. UX-4 owns the single trust statement.
- The line "¿Buscas algo más específico? Filtra … por marca, precio o ubicación" goes: the facets are on the page.
- **Unchanged:** canonical, BreadcrumbList and ItemList JSON-LD, `noindex` while empty, the sitemap (SEO-001–005). The landing route keeps no loading boundary.

### States (3a for catalog and landings, 3b for the home)

| State | Catalog and landings | Home |
| --- | --- | --- |
| Loading, client navigation | Current results stay, at 50% opacity after 200 ms, `aria-busy="true"`, polite "Cargando resultados…"; filters stay usable | Not applicable (server-rendered) |
| Loading, full page load | Server-rendered (no skeleton once `loading.tsx` goes, Q1) | Server-rendered |
| Error (query fails) | `Notice` danger "No pudimos cargar las publicaciones. Vuelve a intentarlo en unos minutos." and "Reintentar" (secondary, same URL); facets and sort stay | The listing sections are left out; the rest of the page renders; the error goes to the server log |
| Empty (no approved listing at all, no filters) | `EmptyState` "Aún no hay publicaciones" / "Las primeras publicaciones aparecerán aquí." / "Publicar un instrumento" (secondary). Today it wrongly says "con esos filtros" | Vitrina hidden; "Recién publicados" shows the same `EmptyState` |
| No results (filters or brand) | `EmptyState` "No encontramos resultados" / "Prueba quitar un filtro o buscar otra marca." / "Limpiar filtros" and the alert entry (or, when a filter has several values, the line asking for one value per filter); the applied chips stay above to remove one at a time | Not applicable |
| Empty landing | As today: "Aún no hay publicaciones de <categoría>", alert entry, "Ver todo el catálogo", "Publicar un instrumento"; `noindex` | Not applicable |
| Server crash | `app/error.tsx` (UX-2) | Same |

The alert's success copy says how it notifies: "Alerta creada. Te avisaremos por correo solo sobre publicaciones nuevas que coincidan." H4's rule for email notices in context lists alert creation.

### Home `/` (3b)

Order: home header, banner, "En vitrina", "Explora por categoría", "Recién publicados", "Cómo funciona Laria", "Tiendas verificadas", the sell block, the full footer.

Spacing (audit item 7): 32 px under the banner, then 48 px between sections on desktop; 24, then 32 on phones. Section titles are `t-section` (20/26, item 8), subtitles `t-meta`. A section's link sits on the title's line, right-aligned (item 15). The page uses eight type sizes (40, 20, 18, 16, 15, 14, 13, 12; item 8).

**Home header** (`ux-2-shell.md` § Home header, N12), the black bar:
- Bar: 64 px from 768 px, 56 px on phones.
- Logo (36 / 32 px), then 28 px.
- "Categorías ⌄", a disclosure. From 768 px, "Tiendas verificadas" (link, N7). From 1024 px, "Cómo funciona" (link to `#como-funciona`). These are 14/600 white.
- Right: "Vender" (outline on dark, N1/N9) and the account entry, as on every page.
- No search in the bar: the banner has it. No category strip on the home (Q14).
- **The "Categorías" panel:**
  - Contents: "Todos los instrumentos" (`/listados`), then every category (its name links to its landing) with its types (`categoryMenus`, the same destinations as the strip's menus, PUB-011–015), then "Tiendas verificadas".
  - From 768 px: a white panel across the page under the bar (`shadow-level-1`, `line-deco` border, `.menu-fade`), the categories in four columns of two rows, 36 px rows.
  - Phones: one stacked list under the bar, 44 px rows, types indented under their category, scrolling inside the panel.
  - Behaviour: the shell menu rules (Enter/Space, Esc returns focus, outside press, route change, one menu at a time). It renders only while open (the `hidden` + display-class rule).
- `getShellLayout("/")` gains a home header: no strip, no phone search row, full footer.

**Banner** (H6, H7, H9–H11, N8; audit items 2, 6, 13, 17):
- **Choosing the piece:** one of the nine pieces, chosen at random on the server per request (the home is dynamic). Only that piece's image is preloaded and loaded. Images are served from `public/` as the delivered WebP (1x/2x) through `<picture>`, with the JPEG fallback; they are decorative (`alt=""`).
- **Desktop (768 px and up):**
  - Band: 300 px tall, full width. The art uses `object-fit: cover; object-position: center` (item 2's build note).
  - Text, centred, on one axis:
    - `h1` "El mercado de instrumentos del Perú" at `t-display` 40/44 white (item 2);
    - the lead "Nuevos y usados, de músicos y tiendas de todo el país." 16/24 in `line-deco`. The manifest's #C8CDD6 is that token.
  - The search: a white 640 px box, 64 px tall, radius 8, with:
    - a 20 px search icon;
    - the 16 px field with the placeholder "Busca por marca: Yamaha, Fender…" (N8, item 17);
    - "Explorar" (primary, 52 px) at a 6 px inset (item 6).
- **Phones:**
  - The 390×150 art strip (phone files, full width, fixed aspect ratio).
  - Then the text block: `h1` 28/32, lead 14/20, and a 56 px search box with a 44 px "Explorar".
  - Under the art, the text block is the frame black (#050608) on all nine. A 40 px CSS gradient fades the bottom of the art into it (Q16 A); no art file changes.
- **Search behaviour:** a GET form to `/listados` with `brand`, exactly like the header search. It emits no search event itself; the catalog records one per real search (PUB-009, AN-004). Its label (screen readers) is "Buscar por marca en el catálogo".
- **No layout shift:** fixed heights.

**"En vitrina"** (H2, H3; item 15):
- **Section header:** the title, the subtitle "Lo más reciente de cada categoría. Se actualiza sola.", and the catalog link "Ver las N publicaciones" (the total count, Q10 B).
- **Which tiles:** up to five showcase tiles, the five most recently published of the per-category winners (the newest approved listing of each category with 3 photos or more, Q12).
- **Layout:**
  - desktop: one row of five;
  - phones: the same tiles in a row that scrolls sideways inside the section, 160 px tiles, 12 px gap, the third one showing at the edge, no page overflow.
- The section is hidden when no category qualifies.

**"Explora por categoría"**:
- Eight tiles in taxonomy order, each a link to its landing (SEO-002; `sprint-9-gate:185` keeps checking those hrefs).
- Each tile: the name (`t-card-title`), "N publicaciones" (Q10 B), and a chevron.
- Desktop: one row of eight. Phones: two columns, 44 px minimum height.

**"Recién publicados"**:
- **Which listings:** the newest approved listings (catalog order: `published_at`, then `created_at`, then `id`), leaving out the vitrina's.
- **Cards:** grid cards (headings `h3`).
  - Desktop: two rows of six, eleven cards and the end tile, about 213 px each at 1440 (Q15 B).
  - Phones: six cards in two columns, then "Ver las N publicaciones" (secondary, full width).
- **No link in the section header** (item 16).
- **The end tile:**
  - Contents: "N publicaciones", "Guitarras, baterías, pedales, amplificadores y más.", and "Ver todo el catálogo".
  - Look: on `canvas`, no border.
- **Empty:** "Aún no hay publicaciones" with "Publicar un instrumento".

**"Cómo funciona Laria"** (`id="como-funciona"`; H4, H5; items 8, 12):
- A `canvas` panel without border.
- **Left:**
  - the title (20/26);
  - "Laria conecta a quien compra con quien vende. No procesa pagos ni envíos: eso lo acuerdan ustedes.";
  - the link "Consejos de seguridad".
- **Right, four promises with 18 px line icons:**
  - "Publicaciones revisadas — Cada publicación la revisa Laria o viene de una tienda verificada." (H4-3);
  - "Tiendas verificadas — Antes de darles la insignia, Laria revisa a mano su RUC, dirección y contacto." (H4-4, the verified mark drawn at 18 px, item 12);
  - "Reseñas de compras confirmadas — Solo se reseña después de una compra que comprador y vendedor confirmaron en Laria." (H4-5);
  - "Trato directo por WhatsApp — Hablas con quien vende y acuerdan pago y entrega. Laria no cobra comisión." (H4-2).
- **Under them, after a rule:** "Si puedes, revisa el equipo en persona antes de pagar. No adelantes pagos por Yape o Plin a quien no conoces."

**"Tiendas verificadas"** (items 11, 15):
- Header link "Ver todas" to `/listados?seller_type=verified_store` (N7). The concept's "Qué verificamos" has no page to open, so it is not built.
- Up to three active verified stores (newest first, as today), each a link to `/tiendas/<slug>`:
  - a 40 px `frame-2` square with white initials (item 11) or the store logo;
  - the name (`t-card-title`), the place (`t-meta`) and the `VerifiedMark`;
  - no stats (Q18 A; revisit with UX-4's store page).
- Then the tile "¿Tienes una tienda?":
  - "Publica tu inventario, recibe consultas por WhatsApp y muestra tu verificación.";
  - "Registrar mi tienda" (`/registrar-tienda`, N10).
- Phones: one sideways row.
- Hidden when there is no verified store.

**Sell block** (H4, item 9):
- A `canvas` panel without border.
- "¿Tienes equipo que ya no usas?" and "Publicar es gratis. Revisamos tu publicación antes de mostrarla."
- "Vender mi equipo" (primary, 52 px) to `/vender`. It is far from the banner's "Explorar", so there is one yellow action per screen.

**Home data** (3b, read-only):
- **Vitrina:** eight small parallel queries, one per category: approved, at least 3 photos (`listing_photo_count`, Q12), newest first, `limit 1`, first photo. Then the five most recent.
- **Feed:** the newest approved listings not in the vitrina.
- **Stores:** active verified stores, newest three.
- **Counts** (Q10 B): the total and one per category, as `count: exact, head: true`.
- **Removed:** the `components_v0/` sections and today's home query.
- **Kept:** the Organization JSON-LD and `buildHomeMetadata()`.

## Behaviour and accessibility

- **Per page:** one `<main>` and one `h1`; the skip link first; Tab order follows the visual order.
- **Cards:** two tab stops (the title link, the favourite).
- **Menus and sheet:** the shell's disclosure rules. The sheet is a modal dialog with a focus trap. Closed panels are invisible (checked by visibility, not only `aria-expanded`).
- **State without colour:** the chosen facet option shows a dot or a check; the current page shows ink fill and `aria-current`.
- **Targets:** 44 px on phones; 36 px compact desktop controls; nothing below 24 px.
- **Layout:** no horizontal page scroll at 390 px (only the vitrina and stores rows and the strip scroll inside themselves); 200% zoom holds; no layout shift from the banner, the grid or the sheet.
- **Motion:** 120 ms colour and opacity changes, 200 ms for the sheet, none under reduced motion.

## Product rules it must not change

- **The catalog query** (`lib/catalog.ts`):
  - approved and visible listings only (sold ones never; LIFE-007);
  - deterministic order (REL-004);
  - 24 per page (REL-001);
  - filters kept across pages (REL-003);
  - parameter names and values (`category`, `instrument_type`, `condition`, `location`, `seller_type`, `brand`, `min_price`, `max_price`, `sort`, attributes). F11's one change: `condition` and `location` may repeat;
  - brand-only search (N8), unless F9 is decided.
- **Events:**
  - one search event per real search and the filter event (PUB-009, AN-004, AN-006; the catalog's `searchReceipt` declaration keeps its shape for `marketplace-tracking:301`);
  - impressions (AN-001).
- **Favourites:** anonymous users are sent to sign in (FAV-003); state on cards (FAV-007).
- **Alerts:** creation saves the exact search state (ALERT-001/002); signed out it goes to `/login?next=`. Alerts and their database functions are unchanged; the entry is only offered for searches an alert can save (one value per filter).
- **SEO:** category slugs and routing, canonical URLs, `og:url`, JSON-LD, `noindex` for filtered pages and empty landings, the sitemap (SEO-001–007); `htmlLimitedBots`.
- **Labels and copy:**
  - "Tienda" and "Tienda verificada" only (VERIFY-001/012);
  - no copy that implies payment, escrow, delivery or guarantees (PUB-006);
  - H4's promises as decided.
- **Data:** no schema, migration, RLS, auth, moderation or lifecycle change.

## Out of scope

- Listing and store pages (UX-4), except that the card is built to be reused there.
- React #418 on fresh listing pages (UX-4).
- Favoritos and inventory grids (UX-6 adopts the card).
- Admin.
- Search suggestions; a stores directory.
- Not built, as the owner decided on 8 Oct:
  - free-text search (F9, left for later);
  - saved alerts with several values per filter (Q19);
  - multi-choice seller type (Q20);
  - facet counts and a live sheet count (Q10);
  - store stats (F12).
- Recording N12 (the owner's).

## Questions

Answered by the owner on 8 Oct (§ Owner answers (8 Oct)); kept here as asked. The visual ones were rendered on the review page, https://claude.ai/artifact/7DCnPzHDMrXRSfBx7mueG4 (private). Answers are saved in its db collection `answers`. Logged in `decisions.md` as pending.

| ID | Question | Options | Recommendation |
| --- | --- | --- | --- |
| Q1 | Stall fix | A remove `app/listados/loading.tsx`, pending state in the page, catalog links back to client links · B in-page `<Suspense>` keyed by the query (keeps a streamed skeleton; unmeasured) · C prefetch before every catalog navigation · D upgrade Next.js | **A** (0 of 42 stalls measured) |
| Q2 | Split | A 3a (card, catalog, filters, landings, states, fix) then 3b (home), each with its own acceptance · B one pass | **A** |
| Q3 | Card fields | A condition + up to two key attributes per type + city · seller type · B condition + city · seller type · C A plus a brand/model line | **A** |
| Q4 | Photo aspect ratio | A 1:1 cover (concept) · B 4:3 cover (today) · C 1:1 contain on white | **A** |
| Q5 | Photo browsing on cards | A first photo and "N fotos", no arrows or dots (2 tab stops) · B keep arrows and dots, enlarged to 24 px | **A** |
| Q6 | Grid or list | A grid only · B grid with a list toggle | **A** |
| Q7 | Live filters or an apply button | A desktop live (each option is a link), the phone sheet applies once · B apply button everywhere · C live everywhere | **A** |
| Q8 (F11) | Single- or multi-choice facets (the concept's checkboxes) | A single choice, today's query and alerts · B multi-choice for condition, location, seller (query and saved-alert change) | **A**; B logged as F11 for later |
| Q9 | Pagination | A numbered pages · B "Ver más" (appends; `?page=N` links kept for crawlers) · C both | **A** |
| Q10 (F10) | Counts | A no new count queries · B home only: total + per category (9 head counts) · C B plus facet counts and a live "Ver N resultados" | **B** |
| Q11 | Alert entry | A "Crear alerta" in the title row when a filter or category is set, an end-of-results tile, and in no-results; none on the plain catalog · B end tile and no-results only · C a panel above the results (today) | **A** |
| Q12 | `photo_count` on the home (H2) | A read `listing_photo_count` (8 per-category queries) · B drop the 3-photo condition · C any listing with a photo | **A** |
| Q13 (F9) | Free-text search | A leave for later (brand-only, N8 placeholder) · B decide now: brand, model and title (its own change after UX-3) | **A** |
| Q14 | Categories in the phone home header | A "Categorías" in the phone bar, no strip on the home (concept) · B keep the strip under the phone home header | **A** |
| Q15 | Audit item 4: "Recién publicados" density | A as decided, four cards and the end tile · B six per row, eleven cards and the end tile | **B** |
| Q16 | Audit item 13: the phone banner | A frame black text block and a 40 px CSS fade at the art's bottom (no art files change) · B each piece's own ground colour (rotation README) · C frame black, hard edge | **A** |
| Q17 | Design-system confirmations | `t-card-title` 600; buttons 36/44/52 only; gutters 20/12 and radius 8; section spacing 32→48 / 24→32; white monograms. Confirm all, or name the exception | **Confirm all** |
| Q18 (F12) | Store tile stats on the home | A name, place, "Tienda verificada" only · B + "N publicaciones" · C + "N ventas confirmadas" (public reputation) | **A**, revisit with UX-4's store page |

## Owner answers (8 Oct)

Given on the review page (all 18 answered, no notes), then Q19 and Q20 in the session. Recorded in `decisions.md`.

| ID | Decision |
| --- | --- |
| Q1 | A: remove `app/listados/loading.tsx`; pending state in the page; catalog links back to client links. Built first in 3a |
| Q2 | A: 3a (fix, card, catalog, filters, landings, states), then 3b (home), each with its own acceptance and review page |
| Q3 | A: condition + up to two key attributes per type + city · seller type |
| Q4 | A: square photos, cover |
| Q5 | A: first photo and "N fotos"; no arrows or dots (two tab stops) |
| Q6 | A: grid only |
| Q7 | A: desktop live (options are links), the phone sheet applies once |
| Q8 | **B: multi-choice facets** (flag F11), shaped by Q19 and Q20 |
| Q9 | A: numbered pages |
| Q10 | B: home counts only (total + per category); no facet counts, no live sheet count (flag F10, part B) |
| Q11 | A: title-row button when a filter or category is set, end-of-results tile, no-results state; none on the plain catalog |
| Q12 | A: the home reads `listing_photo_count` |
| Q13 | A: free-text search left for later (F9); brand-only search and the N8 placeholder stay |
| Q14 | A: "Categorías" in the phone home bar; no strip on the home |
| Q15 | B: "Recién publicados" six per row (eleven cards + end tile on desktop) |
| Q16 | A: frame black text block and a 40 px CSS fade on the phone banner |
| Q17 | A: all five design-system confirmations |
| Q18 | A: no stats on the home's store tiles (flag F12 not taken; revisit with UX-4) |
| Q19 | Alerts keep one value per filter, with no migration. The alert entry is hidden on searches where a filter has several values, with "Para crear una alerta, elige un solo valor en cada filtro." |
| Q20 | Seller type stays single choice; condition and location are the multi-choice facets |

## Acceptance criteria

**3a**
1. **Matches the brief:** card, catalog, sidebar and sheet, applied chips, sort, pagination, landings and states match this brief and the owner's answers at 390 / 768 / 1280 / 1440, signed out and as a Particular.
2. **The stall is gone.** On the production build, ≥10 `router.push` trials each give 0 stalls for:
   - `/listados` to `?seller_type=verified_store`, `?category=guitars`, `?condition=Nuevo`, `?page=2`;
   - the reverse;
   - a landing to its filtered catalog;
   - a filtered catalog to another filter.
   - Catalog links are client links again (Q1 A).
3. **Product rules hold:** the rows below, re-run on the build, show the same behaviour as before (observations only).
4. **Audit:**
   - axe 0 violations, also with the sheet and the sort menu open;
   - focus visible, Tab order, two tab stops per card;
   - closed panels invisible;
   - no overflow at 390 with two-column grids;
   - 200% zoom holds;
   - no layout shift.
5. **First-load JS:** catalog at or below 140 kB (135 kB today on a `pnpm build` of `6fafbed`), reported per route.
6. **SEO smokes pass** (`seo-smoke.test.cjs`; `seo-rendered-metadata-smoke.cjs` on the local build).
7. **Tests updated, never weakened;** lint, typecheck, test and build pass.
8. **F11 works as decided.**
   - Several conditions or locations narrow the catalog to "any of" those values. They survive pagination, sort and landings' forwarding, and show one chip each.
   - One-value URLs are byte-for-byte today's.
   - The alert entry is hidden, with its line, whenever a filter has several values.
   - Saved alerts and their database functions are untouched (ALERT-001/002 re-run as observations).

**3b**
1. **Matches the brief:** the home matches this brief, H1–H11, N8, N12 and audit items 2, 3, 6, 7, 8, 9, 11, 12, 15, 16, 17 (and 4, 13 as answered) at the four widths.
2. **One banner per visit,** chosen on the server; only its image loads; decorative; no layout shift; LCP reported.
3. **Vitrina and feed rules hold** on local fixture data (listings with ≥3 photos in at least five categories; the feed skips them).
4. **The "Categorías" menu** passes the shell menu checks and gives every category and type destination.
5. **3a's criteria 3–7** hold for the home.

**Both:** `docs/design-system.md` updated (card, filters, sheet, chips, sort, pagination, states, banner, home sections, Q17); `ux-3-acceptance.md` and a review page per part; `roadmap.md`, `README.md`, `decisions.md`, and `review-guide.md` when the review scope changes.

## Evidence plan

All on production builds (`next build` + `next start`, stopped by port) against local Supabase only.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- **Transitions:** a `scripts/ux-transition-trials.cjs` (the method in the appendix) with the moves of criterion 2, ≥10 trials each. Run on the build before and after the fix.
- **Captures:** `scripts/ux-snapshots.cjs` before and after; selected WebP frames in `screenshots/ux3-before|after/`:
  - catalog, landing, sheet open, no-results;
  - the home in 3b.
- **Audit:** `scripts/ux-audit.cjs` extended:
  - the sheet (dialog, focus trap, Esc, return focus);
  - the sort menu and the home's "Categorías";
  - card tab stops;
  - phone grid overflow;
  - banner layout shift.
- **Performance:**
  - first-load JS per route against today (`pnpm build` of `6fafbed`: home 113 kB, catalog 135 kB, landing 202 kB: the landing shares the listing route);
  - home LCP with the banner.
- **Acceptance rows** re-run as observations (no status written): PUB-001, PUB-002, PUB-005, PUB-006 (Not Run), PUB-009, PUB-011–015 (home menu, 3b), SEO-001–007, REL-001, REL-003, REL-004, PHOTO-010, PHOTO-016, FAV-003, FAV-007, ALERT-001, ALERT-002, AN-001, AN-004, AN-006, LIFE-007 (Not Run).
- **3b fixtures:** local listings with ≥3 photos, created by a local-only script like `scripts/ux-local-accounts.cjs`. All 12 local approved listings have one photo today, so the vitrina would be empty.

## Tests expected to change (update, never weaken)

| Test | Today | After |
| --- | --- | --- |
| `sprint-9.test.cjs:110–113` | The landing renders `<ListingFilters filters={filters} />`, `<Pagination page={page} total={totalCount} path={path} />`, `<ListingCard key={listing.id} listing={listing} />`, `<SearchTelemetry` | Same contracts on the new components: filters get the parsed filters, pagination gets page/total/path, one card per listing keyed by id, telemetry present |
| `sprint-9.test.cjs:369–370` | `components_v0/categories-section.tsx` links landings; the hero has no `/listados?category=` | Moves to the home's category tiles and banner; same assertions |
| `sprint-9-gate.test.cjs:185–189` | `CategoriesSection` renders landing hrefs and no `/listados?` | Same, on the new home component |
| `sprint-3-1.test.cjs:50` | The card renders `{displayTitle}` | Unchanged |
| `marketplace-tracking.test.cjs:301–308` | AST check of the catalog's `searchReceipt` | Unchanged; the page keeps the declaration |
| `ux-copy.test.cjs:144–146` | The featured card renders `{listing.condition}` and no literal "Nuevo" | Retargeted to the one card |
| `ux-shell.test.cjs:63` | `/`: standard header, strip, phone search row, full footer | Home header, no strip (Q14), no phone row, full footer; plus "Categorías" menu checks and the hidden-panel rule |
| `ux-shell.test.cjs` (catalog links) | `ShellLink` native for catalog URLs | Client links (Q1 A), with a regression check that `app/listados` has no route-level `loading.tsx` |
| `ux-primitives.test.cjs:28` | `Chip` and `Radio` exempt as unused | Exemption removed (both consumed) |
| `favorites-browser-smoke.cjs:21, :43` | `main article` on the catalog; "No encontramos resultados" | Unchanged (the card stays an `article`; the no-results title keeps the phrase) |
| `seo-smoke.test.cjs`, `seo-rendered-metadata-smoke.cjs` | `?page=2` canonical, landing ItemList | Unchanged; re-run |
| New | — | Card (two tab stops, reserved title lines, seller words, attributes per type); filter URLs (set and clear each facet, landings to `/listados`); F11: repeated `condition`/`location` parsed, queried with `in`, kept across pages, one chip per value, alert entry hidden on multi-value searches, one-value URLs unchanged; numbered pagination; banner pick (one of nine, one preload, `alt=""`); vitrina selection and feed exclusion |

`docs/architecture.md` loses the `listados/loading.tsx` line if Q1 is A.

## Appendix: stall measurements

**Method.**
- **Builds:** `git archive <sha>` into the session scratchpad; the worktree's `node_modules` symlinked and its `.env.local` (local Supabase) copied; `LISTINGS_PAGE_SIZE` set to 2 so pagination appears with the 12 local approved listings; `./node_modules/.bin/next build`; `next start` on its own port.
- **Trials:** each in a fresh agent-browser session:
  1. open `/listados`;
  2. wait 2 s;
  3. `window.next.router.push(target)`;
  4. wait 6 s;
  5. a trial completes when `location` shows the target.
- **Router state** was read in the page with `self.webpackChunk_N_E.push([[Symbol()], {}, r => …])` and the module exporting `getCurrentAppRouterState`.

| Build | Move | Stalls |
| --- | --- | --- |
| head `6fafbed` | `/listados` → `?seller_type=verified_store` | 9/10 |
| head | `/listados` → `?condition=Nuevo` | 10/10 |
| head | `/listados` → `?category=guitars` | 5/10 |
| head | `/listados` → `?page=2` | 1/10 |
| head, target prefetched first | `/listados` → `?seller_type=verified_store` | 0/10 |
| head, three trials watched at 6 / 30 / 65 s | `?seller_type=verified_store` | 2 stalled; neither committed by 65 s |
| `49a38e5` (main) | `?condition=Nuevo` | 0/12 |
| `8fa616f` | `?seller_type=verified_store` | 0/10 |
| `6525abb` | same | 0/12 |
| `444ac25` | same | 6/10 |
| `444ac25` with its shell files from `6525abb` | same | 0/10 |
| `444ac25` with its catalog files from `6525abb` | same | 0/10 |
| `444ac25` with only `site-footer.tsx` from `6525abb` | same | 4/10 |
| `6525abb` with only `444ac25`'s `site-footer.tsx` | same | 1/10 |
| `2d647ef` | same | 7/10 |
| head without `app/listados/loading.tsx` | `?condition=Nuevo` | 0/12 |
| same | `?seller_type=verified_store` | 0/10 |
| same | `?category=guitars` | 0/10 |
| same | `?seller_type=verified_store` → `/listados` | 0/10 |

**Not covered:**
- other browsers (Chromium only);
- the dev server;
- a deployment.
