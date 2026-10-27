# Effortless Laria: Descubrir, one listing per screen (maybe big-02)

Ideas: `/mnt/project-files/ux-ideas/ideas.json`. Henri marked big-02 "maybe" on 2026-10-19, with no note, and said
"go ahead" on 2026-10-27. Branch `ux/maybes-descubrir`. Migration slot 20261120110000 is left unused: Descubrir reads
the catalog's public data and needs no database change. Acceptance range EASE-830 to EASE-859, proposed in
`maybes-descubrir-acceptance.tsv`. Screenshots: `/mnt/project-files/ux-ideas/screens/maybes/descubrir/`.

Descubrir is a second way to look through listings, not a replacement: the grid stays the default everywhere, and
nothing sends anyone to Descubrir on its own. It is built for phones and works on a computer (a column of 520 px, the
keyboard and the bar's buttons).

## Entry points

- **Home**: "Descubrir lo nuevo", a secondary button under the heading of the home's listings ("Lo más nuevo", or "Para
  ti" once the device has a taste), beside its controls. It is a plain link, the same for everyone, so the cached home
  (#42) stays one page for all.
- **Results lists** (`/listados` and the category landings): "Ver en Descubrir", a secondary button beside "Ordenar"
  on desktop and a text link under the filter and sort buttons on phones. It carries the list's filters and order, and
  shows only when the list has results and no read error.

## The two feeds

- **Lo nuevo** (`/descubrir`): the listings published in the last 7 Lima days, newest first. When those days hold fewer
  than 12 listings, the window becomes the last 30 days, so a quiet week still has a feed. The window is whole Lima
  calendar days (UTC-5, no daylight saving), the same days the "Publicado hoy / ayer" lines use.
- **A results list** (`/descubrir?modo=resultados&…`, the catalog's own parameters): that list in its order, to its end.
  No date window.

## A listing's screen

The photos fill the frame (contained, so a whole instrument shows whatever the photo's shape), then a white panel:

- the price, with the previous one when it dropped (list-05), "Agotado" for out-of-stock listings, "Reservado"
  when the reservation batch flags the listing, and "Publicado hoy", "Publicado ayer", "Publicado hace N días" (under
  14 days) or the listing page's wording beyond;
- the title, the key specs line (list-03), the place and the seller ("Particular", "Tienda" or "Tienda verificada" with
  its mark);
- **WhatsApp** (the one primary button), **♥** (the existing favorites, device or account), **No me interesa** and
  **Ver publicación**.

Photos move sideways by swipe (one photo a flick), by the two 44 px arrows ("Foto anterior", "Foto siguiente") or by ← →;
a counter reads "Foto 2 / 4". The photos are a focusable group ("Fotos de …"), so the keyboard reaches them like any
scrolling region. No wrap-around: the last photo is the last. A listing without photos shows "Sin foto".

## Moving through the feed

- A vertical scroll-snap track, one screen per listing: swipe up or down, or the wheel.
- The top bar: "Salir de Descubrir" (back to the home, or to the results list), the heading "Descubrir", the feed's name
  with the position ("Lo nuevo · 3 de 24", or the list's own heading), and "Anterior" / "Siguiente" (44 px). On a
  computer ↑ ↓ and PageUp / PageDown move too, and a hint at the bottom left says so.
- Nothing moves on its own: no autoplay, no sound (listings have no audio or video), no endless loop. Swipes never give a
  verdict: ♥ and "No me interesa" are buttons.
- Only the screen in view and its two neighbours are drawn; the others are empty frames of the same height, so a long
  list stays light.

## Stops and the end

Each stop is its own screen, says what is true and offers one primary way on:

| Stop | When | Title | Body | Actions |
| --- | --- | --- | --- | --- |
| Today | Lo nuevo, after the last listing published today, when earlier days follow | Viste todo lo nuevo de hoy | Sigue para ver N más de los últimos 7 días. | Ver los de días anteriores; Volver al inicio |
| Pause | every 48 listings | Llevas 48 de 120 | Sigue para ver más, o vuelve a la lista para cambiar los filtros. (Lo nuevo: "…o vuelve al inicio.") | Seguir; Volver a la lista (Lo nuevo: Volver al inicio) |
| End, Lo nuevo | after the last listing | Viste todo lo nuevo | Las N publicaciones de los últimos 7 días. | Ver todo el catálogo; Volver al inicio |
| End, results | after the last listing | Viste todos los resultados | N publicaciones en Fender en Guitarras. | Volver a la lista; Volver al inicio |
| Empty, Lo nuevo | nothing in the window | No hay publicaciones nuevas | No se publicó nada en los últimos 30 días. | Ver todo el catálogo |
| Empty, results | the list is empty (a link kept from before) | Esta lista no tiene publicaciones | Vuelve a la lista para cambiar los filtros. | Volver a la lista; Volver al inicio |
| Loading | the next page is on its way | Cargando publicaciones… | | |
| Error | a page could not be read | No pudimos cargar las publicaciones (later pages: …cargar más publicaciones) | Revisa tu conexión y vuelve a intentarlo. | Reintentar; Volver a la lista or al inicio |

The end also says "Omitimos N que marcaste con “No me interesa”." with "Volver a mostrarlas" when this device hid some of
the feed's listings.

## No me interesa

- Kept on this device only (`localStorage` key `laria:descubrir-ocultos`, newest first, at most 200 listings), and read
  only by Descubrir: the catalog, the home and the account are unchanged.
- The listing leaves the feed at once and the next one takes its place; a notice reads "Listo, no volverás a ver “…” en
  Descubrir." with "Deshacer" while that next listing is in view.
- "Volver a mostrarlas" on the end screen brings back this feed's hidden listings and moves to the first of them.
- "Borrar lo guardado en este dispositivo" on `/favoritos` clears them with the rest; its confirmation now says so.

## WhatsApp, ♥ and Ver publicación

- **WhatsApp** goes through the listing page's contact path (talk-03): one press posts to `/api/contact`, which records
  the contact and answers with the wa.me link. Phones never travel with the feed (launch audit A27), so a blank tab opens
  inside the press and goes to WhatsApp when the route answers; with the popup blocked, this page goes there instead.
  For S/ 1,000 or more the one-time safety sheet (talk-04) comes first, and its "Continuar a WhatsApp" is the press. If
  no link comes back: "No pudimos abrir WhatsApp. Abre la publicación para escribir desde ahí."
- **♥** is the existing `FavoriteButton`: on the device without an account, in the account when signed in (big-04).
- **Ver publicación** opens the listing page. The feed remembers its place for this tab for 30 minutes, so the browser's
  back returns to the same listing, loading the pages it needs on the way. The listing page's "Volver a resultados" and
  its arrows belong to a catalog search, so opening from Descubrir clears that trail.

## Loading

- The server reads the first page (24 listings, each with up to 10 photo addresses) as core data on the render's
  deadline, so the first screen draws at once. A failed read leaves the first page to the browser, which shows the
  error stop with "Reintentar".
- Later pages come from the catalog's page route, three screens before the last one in hand:
  `/api/catalog/page?…&fotos=todas[&desde=YYYY-MM-DD][&page=N]`. `fotos=todas` brings up to 10 photos per listing,
  `desde` is the window's first Lima day (at most 31 days back, else 400), and the answer now carries `total`.
  A newer listing that pushes one already shown onto the next page is shown once.
- Images: the screen in view loads its first two photos (the first with priority on the page's first screen); only the
  next listing's first photo loads ahead, and not when the phone asks to save data; the rest load when swiped to.

## Accessibility

- Every screen is a `section` named by its heading; screens out of view are `inert`. Focus moves to the new screen's
  heading when the move came from the keyboard or a button, or when focus was on the screen that left.
- A polite live region says "3 de 24: Fender Player Telecaster" or the stop's title; the photo counter is polite too.
- `prefers-reduced-motion` turns the smooth scrolls into jumps. Every control is at least 44 px, and every label is in
  Spanish. The keys are declared with `aria-keyshortcuts`, and none apply while a field or a dialog has them.

## Analytics

Main's events, unchanged: a screen at least half in view counts a `listing_impression` with source `home` (Lo nuevo)
or `catalog` (a results list), as the card would; WhatsApp counts the contact with the same source through `/api/contact`.
Descubrir never counts a listing view: that happens on the listing page when "Ver publicación" opens it.

## Search engines and crawlers

`/descubrir` is `noindex` (`NON_INDEXABLE_PATH_PREFIXES`); the listings and the catalog are the pages to index. The
middleware's catalog branch refuses the bulk crawlers (Amazonbot, Reflectionbot, MJ12bot) on `/descubrir` as on
`/listados`, with the same 403.

## Room for Reservado (talk-06)

`DescubrirItem` is `ListingCardData & { reserved?: boolean }`; with `reserved: true` the screen shows the "Reservado"
tag (warning tone, clock icon) beside the price. `markReserved(items, ids)` (`lib/descubrir.ts`) sets it from a set or
list of ids, and the feed already applies the page route's `reserved` list when the route sends one. At integration:

1. `app/api/catalog/page/route.ts`: keep both batches' changes, and give the Descubrir branch the same `reserved` list
   as the catalog's (`reservedCardIds(data ?? [], deadline)`), so the answer is `{ listings, total, reserved }`.
2. `app/descubrir/page.tsx`: mark the server's first page,
   `initial.listings = markReserved(listings, await reservedCardIds(listings, getRequestReads().deadline))`.

## Files

- `lib/descubrir.ts`: windows and Lima days, hrefs, the feed's screens and stops, their copy, `markReserved`.
- `app/descubrir/page.tsx`: the page (noindex, dynamic, `maxDuration` 30), the first page and the sparse-week widening.
- `components/descubrir/descubrir-feed.tsx`, `descubrir-screen.tsx`, `descubrir-stop.tsx`, `descubrir-contact.tsx`.
- `app/api/catalog/page/route.ts`, `lib/catalog.ts` (`fetchDescubrirPage`), `lib/catalog-data.ts` (`getDescubrirPage`).
- Entry points: `components/home/home-for-you.tsx`, `components/catalog-view.tsx`.
- `lib/device-saves.ts` (the hidden list), `components/saving/device-favorites.tsx` (the clear text),
  `components/listing/safety-sheet.tsx` (`onContinue` without a link).
- `lib/shell.ts` (no header, footer or phone search), `lib/site.ts` (noindex), `lib/catalog-crawlers.ts` and
  `middleware.ts` (the crawler guard).
- Tests: `tests/maybes-descubrir.test.cjs`; `tests/ux-shell.test.cjs` gains `/descubrir`.
- Local demo: `scripts/prototype/maybes-descubrir-seed.sql` (16 listings published relative to when it runs: 5 today, 3
  yesterday, 6 over the days before, 2 older), `scripts/prototype/make-descubrir-photos.py` (drawn photos, portrait
  and landscape) and `scripts/prototype/maybes-descubrir-walk.cjs` (the browser walk-through: 37 checks, axe-core and
  the screenshots).

## How to test

1. `node --require ./tests/setup-alias.cjs --test tests/maybes-descubrir.test.cjs`.
2. Local stack (any free ports): reset the database, load `supabase/seed.sql` and `scripts/prototype/demo-seed.sql`,
   then
   `python3 scripts/prototype/make-descubrir-photos.py "$STORAGE_DIR/listing-photos/descubrir"` and
   `psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -v photo_base="$GATEWAY_URL/storage/v1/object/public/listing-photos/descubrir" -f scripts/prototype/maybes-descubrir-seed.sql`.
3. `BASE=http://localhost:3000 node scripts/prototype/maybes-descubrir-walk.cjs` runs the walk-through below with touch
   on a phone and the keyboard on a computer, axe-core at both widths and the screenshots.
4. By hand, on a phone-sized window: the home's "Descubrir lo nuevo"; swipe through today's listings, the "de hoy" stop,
   the earlier days and the end; swipe photos sideways; "No me interesa" then "Deshacer"; "Ver publicación" and back;
   the catalog's "Ver en Descubrir" with a filter and a sort, to "Viste todos los resultados". On a computer, the same
   with ↑ ↓ ← →.

## Defaults picked

- Lo nuevo is 7 Lima days, widened to 30 below 12 listings; the route refuses a start more than 31 days back.
- The "de hoy" stop shows only when today has listings and earlier days follow; with none today the feed starts with
  the earlier days and says nothing about today.
- A pause every 48 listings, with the count and the way back.
- Only the next listing's first photo loads ahead (not all its photos), and nothing under data saving.
- "No me interesa" is per device, kept for 200 listings, and changes no order elsewhere (the home's "Para ti" still
  learns from views on the device, not from Descubrir's skips).
- The place is remembered for this tab only, for 30 minutes, up to 40 pages back.
- The results feed starts at the list's first listing, whichever page of the grid it was opened from.

## Limitations

- The bar's total leaves out this device's hidden listings from the pages already read; hidden listings further on
  count until their page is in, so the total can drop by a few on the way.
- Each page is read in the catalog's order at that moment: a listing published while the feed is open repeats the last
  one on the next page, and the feed shows it once; a listing withdrawn meanwhile shifts the pages the other way, and
  one listing can be missed.
- A screen reader reads the screen in view only (the others are inert); "Anterior" and "Siguiente" in the bar move
  through the feed.

## For docs/functional-spec.md

### Descubrir (Effortless Laria maybe big-02)

`/descubrir` shows listings one per screen, as a second way to browse; the grid stays the default. From the home,
"Descubrir lo nuevo" shows the listings published in the last 7 Lima days, newest first (30 days when the week holds
fewer than 12), with a stop after today's listings. From any results list, "Ver en Descubrir" shows that list, with its
filters and order, to its end. Each screen has the photos (swipe or arrows), the price, the title, the key specs, the
place and the seller, WhatsApp, ♥, "No me interesa" and "Ver publicación"; every gesture has a button and the keyboard
works on a computer. No autoplay, no endless loop and no swipe verdicts; every feed ends with a screen that says what was
seen. "No me interesa" is kept on the device and only hides listings in Descubrir. The page is not indexed, and the bulk
catalog crawlers are refused there as on `/listados`. Analytics: impressions with the home or catalog source; contacts
through `/api/contact`; no listing view.

## For docs/database.md

None. No migration, table, column, function or policy: Descubrir reads `public_listings` (and `catalog_search` for a
text search) through the catalog's own query. For the launch audit's A13 list, `laria_private.app_error_route_patterns()`
needs `/descubrir` (the integrator's A13 migration; `tests/launch-audit-monitoring.test.cjs` names it until then). No new
error message: Descubrir throws none of its own.

## Decisions

- UXD-maybes-descubrir-1: Descubrir is an extra mode reached from the home and the results lists; the grid stays the
  default and nothing redirects to it.
- UXD-maybes-descubrir-2: "Lo nuevo" is the last 7 Lima days, or 30 when the week holds fewer than 12 listings; a results
  feed is the list itself, in its order.
- UXD-maybes-descubrir-3: Verdicts are buttons (♥, "No me interesa"), never swipe directions; every gesture has a button
  and a key.
- UXD-maybes-descubrir-4: No autoplay and no endless loop: stops after today's listings and every 48, and a visible end
  that counts what was seen.
- UXD-maybes-descubrir-5: "No me interesa" is per device, only for Descubrir, and cleared with the device's other saves.
- UXD-maybes-descubrir-6: Only the next listing's first photo is fetched ahead, and nothing under data saving.
- UXD-maybes-descubrir-7: WhatsApp from Descubrir is the listing page's contact path, with the same safety sheet; the
  phone never travels with the feed.
- UXD-maybes-descubrir-8: Descubrir counts impressions as the list it comes from (home or catalog) and never a view.
- UXD-maybes-descubrir-9: `/descubrir` is not indexed and refuses the bulk catalog crawlers.
