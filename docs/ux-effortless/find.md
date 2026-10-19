# Effortless Laria, batch "find": search, browse and the home

Write-up of the find batch of the Effortless Laria program (build plan `/mnt/project-files/ux-ideas/build-plan.md`,
ideas in `/mnt/project-files/ux-ideas/ideas.json`, Henri's verdicts of 2026-10-19). Proposed decisions are numbered
UXD-find-n; the integrator moves them into `docs/decisions.md`. Proposed acceptance cases are in
`docs/ux-effortless/find-acceptance.tsv` (EASE-001 to EASE-099, all Not Run).

## FIX 07: choosing a filter keeps your place

- **What changed.** Every catalog navigation (filter rows and chips, applied chips, sort, the phone sheet, the price and
  brand forms, pagination) runs `router.push(href, { scroll: false })` inside the existing transition. Once the next page
  commits, the results come into view only when they are entirely off-screen (a much shorter result list), and a page
  link brings the first row back up when it is above the screen. Focus handling is unchanged.
- **Files.** `components/catalog-navigation.tsx` (`resultsScrollTarget`, `RESULTS_REGION_ID`), `components/pagination.tsx`
  (`resultsScroll="start"`), `tests/ux-effortless-find.test.cjs`, `tests/ux-shell.test.cjs` (the results region now has
  `id="resultados"`), `docs/design-system.md` § Navigation and states.
- **How to test.** On `/listados` at 1366 px, scroll down to "Ubicación" and tick "Lima": the page stays where it was
  (checked in Chromium: 883 px before, 939 px after, the difference being the applied-chip row that appears above).
  On a phone, apply the sheet: the results stay in view. Page 2 from the bottom of the grid shows its first row.
- **Defaults picked.** A store page's pagination is outside the catalog provider and keeps the browser's normal jump to
  the top.
- **Limitations.** None known.

## Shared pieces

- **Database.** `supabase/migrations/20261101120000_ux_find_search.sql` (never applied to a hosted database): the search,
  facet counts, suggestions, menu counts, the price-drop and verified-first fields, the gone-listing hint and the alerts'
  text query. `docs/database.md` § Effortless Laria: search and browse. Tests: `tests/ux-find-search.sql`.
- **Device memory.** `lib/catalog-device.ts`: what this device remembers (recently viewed, taste, "¿Qué tocas?", "Sin
  personalizar", last visit, the comparison, the results trail). Nothing is sent to Laria. Every read and write
  tolerates blocked storage.
- **Request cache.** `lib/catalog-data.ts` dedupes the catalog page, facets and rescue between `generateMetadata` and
  the page (React `cache`).
- **Public JSON routes** (read-only, short cache headers): `/api/catalog/facets`, `/api/catalog/suggest`,
  `/api/catalog/page` ("Ver 24 más"), `/api/catalog/gone`.

## BIG 03: one search box that understands musicians

- **What changed.** The header, home and not-found search send `q` (free text) instead of `brand`. `catalog_search`
  matches brand, model, type, category words and title, folded (no accents, lowercase); each word must match directly,
  through `search_synonyms` (about 60 slang rows: strato, tele, LP, ampli, bass, batería, teclado…) or by trigram
  similarity for words of four letters or more ("guitara", "stratocastr"). A phrase becomes filters before searching
  (`lib/catalog-query.ts` `applySearchPhrase`): price ("menos de 2000", "entre 500 y 1.500", "hasta 2k"), condition
  ("nuevo", "usado"), "tienda verificada", category and type words, "N cuerdas", and a known place; the page redirects
  once to the URL with those filters as chips, and the rest stays as `q` in the visitor's spelling. A search chip
  “strato” is removable like any filter. Search alerts keep `query`.
- **Files.** `components/global-search.tsx`, `components/home/home-banner.tsx`, `lib/catalog-query.ts`, `lib/catalog.ts`,
  `lib/listings.ts` (`q`), `lib/catalog-filters.ts`, `lib/seo.ts` (`q` is a filter key, so `noindex`), `app/listados/page.tsx`,
  `lib/marketplace-event-payload.ts` (the search event's query is `q`, else the brand), `lib/search-alerts.ts`, the migration.
- **How to test.** Search "strato", "guitara", "cajon", "bass"; then "bajo 5 cuerdas menos de 2000 en Lima": the chips
  read Bajos, Bajos eléctricos, Número de cuerdas: 5, Hasta S/ 2,000, Lima.
- **Defaults picked.** Postgres only (pg_trgm, unaccent-style folding, a curated table), no external service. Results stay
  newest first (no relevance sort). A phrase naming a different category than the page's keeps the page's category.
- **Limitations.** No relevance ranking; synonyms are a hand-kept list; the phrase reader knows Spanish forms only.

## FIND 01: the header search keeps your filters

- **What changed.** On `/listados` the search keeps every filter but the old text and the page (hidden fields); on a
  category page it keeps the category. The suggestion list ends with "Buscar “…” en todo el catálogo", and the results
  line says "Buscando “q” en Guitarras. Buscar en todo el catálogo".
- **Files.** `components/global-search.tsx` (`keptSearchFields`), `components/catalog-view.tsx`.
- **How to test.** On `/listados?category=guitars&location=Lima` search "fender": `?category=guitars&location=Lima&q=fender`.

## FIND 02: results say what you searched

- **What changed.** The h1 and the tab title: “strato” en Guitarras eléctricas · Lima (2); "Fender en Guitarras".
- **Files.** `lib/catalog-filters.ts` (`catalogTitle`, `catalogTabTitle`), `app/listados/page.tsx` (`generateMetadata`).

## FIND 03: suggestions as you type, accents ignored

- **What changed.** An accessible combobox (`role="combobox"`, listbox, arrow keys, Enter, Escape) suggests categories,
  types, brands and models that have listings, with counts, after two letters (150 ms debounce). Nothing is fetched
  until the box is used.
- **Files.** `components/global-search.tsx`, `lib/catalog-suggest.ts`, `app/api/catalog/suggest/route.ts`.

## FIND 04: zero results that rescue the search

- **What changed.** Up to four one-tap ways out with their counts ("Sin “Arequipa” hay 4"), the closest listings ("Lo
  más parecido", or "Lo más nuevo en Laria"), and "¿Lo quieres igual? Te avisamos cuando aparezca." with the alert.
- **Files.** `lib/catalog-data.ts` (`getCatalogRescue`), `lib/catalog.ts` (`countCatalog`), `components/catalog-view.tsx`.

## FIND 05: locations from real listings, plus regions

- **What changed.** With counts loaded, "Ubicación" lists every place that has listings, by zone (Lima y Callao, Norte,
  Centro, Sur, Oriente), largest first, each zone with "Todo …" when it has several places. Cards show the store's
  district before the city.
- **Files.** `lib/location.ts` (`locationZones`, `regionOfLocation`, `zoneOfLocation`), `lib/catalog-filters.ts`
  (`withZone`), `components/listing-filters.tsx`, `components/filter-sheet.tsx`, `components/listing-card.tsx`.
- **Limitations.** Individual sellers have no district, so their cards show the city.

## FIND 06: no links that lead to nothing

- **What changed.** Menu and landing brands are those with listings (`catalog_brand_counts`, 5-minute cache), most
  listings first, with counts on landing chips; landing type chips and "Otras categorías" leave out empty ones; the
  home's category chips hide categories known to have none. When the counts fail, everything shows as before.
- **Files.** `lib/catalog-brands.ts`, `lib/catalog-brands-aggregate.ts` (`brandsWithListings`), `components/category-landing.tsx`,
  `components/home/home-sections.tsx`.
- **Limitations.** Subtype chips (attribute values) are not counted yet.

## FIND 07: counts on filters, and a button that says how many

- **What changed.** `catalog_facets` counts each option without its own filter; the sidebar and the sheet show the
  counts; options with none are dimmed, not links. The sheet refetches counts for its draft (250 ms debounce) and the
  button reads "Ver 12 resultados" / "Sin resultados".
- **Files.** `lib/catalog-facets.ts`, `app/api/catalog/facets/route.ts`, `components/listing-filters.tsx`, `components/filter-sheet.tsx`.

## FIND 08: price shortcuts

- **What changed.** Three chips from the prices on sale (the thirds, rounded: "Hasta S/ 700", "S/ 700 – 1,200", "Más de
  S/ 1,200") and the range as a hint ("De S/ 459 a S/ 4,299"); none with fewer than three prices.
- **Files.** `lib/catalog-facets.ts` (`priceShortcuts`, `roundPrice`), `components/listing-filters.tsx`, `components/filter-sheet.tsx`.

## FIND 09: back to your results, exactly where you were

- **What changed.** Opening a card remembers the results (this tab only): URL, order, titles and scroll. The listing
  shows "Volver a resultados" with "Anterior" / "N de M" / "Siguiente". Opened straight from the results, it is the
  browser's back (instant, place restored); after the arrows it opens the results and scrolls to the saved place.
- **Files.** `components/catalog-trail.tsx`, `components/catalog-results-return.tsx`, `components/breadcrumbs.tsx`.
- **Limitations.** The arrows cover the results that were on screen (including those "Ver 24 más" added), not later pages.

## FIND 10: more useful sort orders

- **What changed.** "Bajaron de precio" (a lower price in the past 30 days first) and "Tiendas verificadas primero";
  cards with a recent drop show the previous price struck through.
- **Files.** `lib/listings.ts` (`sortOptions`), `lib/catalog.ts`, `components/listing-card.tsx`, the migration.
- **At integration** (UXD-integration-1 in `integration.md`): a drop is the listing batch's real drop (list-05), so the
  order, the home's row, the card and the listing page agree. This batch's `price_dropped_at` and `price_drop_from`
  computed fields gave way to `recent_price_drop_at` (20261109120000).
- **Defaults picked.** "Más cerca" waits until places are reliable, as the idea says.

## FIND 11: recently viewed

- **What changed.** "Vistos recientemente" (up to 12, newest first, "Solo en este dispositivo.", "Borrar") on the home,
  the catalog and the not-found page.
- **Files.** `components/catalog-recently-viewed.tsx`, `components/listing-card.tsx` (`rememberOpened`).

## FIND 12: compare instruments side by side

- **What changed.** Desktop cards carry a "Comparar" checkbox (up to three); a tray gathers them and opens `/comparar`
  (noindex), a table with price, the spec table rows, location and "Distinto" on rows that differ. Phones compare from
  "Mis favoritos" ("Comparar favoritas").
- **Files.** `components/catalog-compare.tsx`, `lib/catalog-compare.ts`, `app/comparar/page.tsx`,
  `app/mi-cuenta/favoritos/page.tsx` (one line, accounts batch's file).

## FIND 15: "Ver 24 más" on phones

- **What changed.** Below 768 px the numbered pages give way to "Ver N más", which adds the next page below and
  restores what was added when coming back. The numbered links stay in the HTML for search engines (hidden on phones).
- **Files.** `components/catalog-load-more.tsx`, `app/api/catalog/page/route.ts`, `components/pagination.tsx` (`phoneLoadMore`).
- **Limitations.** Without JavaScript, phones see no paging control (the links are hidden by CSS).

## FIND 16: a listing that's gone points to similar ones

- **What changed.** On a listing address that no longer opens and was once public, the not-found page says "Esta
  publicación ya no está disponible" and shows up to four live listings of its type (or category). Nothing else about
  the old listing is read or shown.
- **Files.** `components/error-page.tsx`, `components/not-found-extras.tsx`, `app/api/catalog/gone/route.ts`.

## FAST 02: instant next page and instant back

- **What changed.** The first cards prefetch their listing when shown; the others prefetch on hover or focus (a full
  prefetch, since the listing page has no loading boundary). Catalog navigations use client transitions, so the
  browser's back is instant.
- **Files.** `components/listing-card.tsx`.

## BIG 01: "Para ti", a home that starts with instruments

- **What changed.** Phones: a 72 px art strip and no lead, then the search; then the category chips (with counts, empty
  ones hidden). "¿Qué tocas?" appears on a first visit (optional; "Saltar"). "Para ti" ranks the 48 newest listings on
  the device by types, brands, places and price band opened (half-life 14 days) and the "¿Qué tocas?" answer, with a
  little freshness and views; never two of one seller in a row (the server sends only a hash of the seller). "¿Por qué
  veo esto?" lists the reasons; "Empezar de cero" forgets them; "Sin personalizar" shows plain newest first. Without
  signals the section is "Lo más nuevo". "Nuevo desde tu última visita" (after 30 minutes away), "Bajaron de precio" and
  "Vistos recientemente" follow. The server renders the plain order, so the home works without JavaScript.
- **Files.** `app/page.tsx`, `lib/home.ts`, `components/home/home-for-you.tsx`, `components/home/home-sections.tsx`,
  `components/home/home-empty.tsx`, `components/home/home-banner.tsx`, `lib/catalog-device.ts`.
- **Defaults picked.** The vitrina and the category tiles are retired (instruments come first); "near them" is not used
  for the first visit, since the device has no place until the visitor opens listings.
- **Limitations.** The ranking applies right after the page loads, so the order can change once on the first paint.

## Proposed decisions

- UXD-find-1: The catalog has one free-text search parameter, `q`, matched in Postgres (folding, curated synonyms,
  trigram similarity); `brand` stays as a filter. Supersedes N8's brand-only search.
- UXD-find-2: A plain phrase becomes filters through one redirect; the remainder stays as `q`.
- UXD-find-3: Searching from the catalog or a category page keeps the current filters; "Buscar en todo el catálogo" escapes.
- UXD-find-4: Filter options show counts computed without their own facet; empty options are dimmed, not hidden.
- UXD-find-5: Locations come from listings and group into five zones; cards show the store's district.
- UXD-find-6: Menus and landings offer only brands, types and categories with listings; failure falls back to all.
- UXD-find-7: Two new sorts, "Bajaron de precio" (30 days) and "Tiendas verificadas primero".
- UXD-find-8: Personal signals (recently viewed, taste, "¿Qué tocas?", comparison, last visit, results trail) stay on the
  device; each surface says so and can be cleared.
- UXD-find-9: The home leads with instruments; the vitrina and the category tiles are retired.
- UXD-find-10: "Para ti" never shows two listings of the same seller in a row; the server exposes only a hashed seller key.
- UXD-find-11: Phones use "Ver 24 más"; numbered pages remain in the HTML for search engines.
- UXD-find-12: A listing opened from the results offers "Volver a resultados" and previous and next.
- UXD-find-13: The comparison holds up to three public listings, desktop from cards, phones from favorites; `/comparar` is noindex.
- UXD-find-14: A gone listing's page reveals only that it is gone and its type, with live similar listings.
- UXD-find-15: Search alerts can keep the text query, compared without case.
- UXD-find-16: The search placeholder is "Busca guitarras, marcas, modelos…" and the label "Buscar en el catálogo".

## Edits outside the find batch's files

- `lib/shell.ts` (stores batch): `SEARCH_PLACEHOLDER` and `SEARCH_LABEL` only.
- `lib/search-alerts.ts` (accounts batch): the additive `query` key, marked.
- `app/mi-cuenta/favoritos/page.tsx` (accounts batch): one `CompareFromFavorites` line.
- `lib/supabase/database.types.ts` (shared): one marked block of the new functions.
- `lib/listings.ts` (shared with the listing batch): `q` and the new sorts.
- `lib/marketplace-event-payload.ts`: the search event's query is `q`.
- The alert SQL functions (`normalize_saved_search`, `saved_search_hash`, `listing_matches_saved_search`) are patched by
  text replacement in this batch's migration; a later migration that redefines them must keep `query`.
