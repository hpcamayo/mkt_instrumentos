# Marketplace categories: ten instead of eight (owner decision, 12 Oct 2026)

Henri asked for a separate Percusión (drums, cymbals, Latin percussion…), Vientos and Audio, and confirmed the full
proposed set on 12 Oct 2026. Built on `ux/marketplace-categories`, on top of the detailed category navigation
(`category-navigation.md`), for review before it is merged into `ux/redesign`.

## The taxonomy

| Category (value / label / landing) | Instrument types | "What is it" attribute |
| --- | --- | --- |
| `guitars` Guitarras `/instrumentos/guitarras` | electric_guitar, acoustic_guitar, other | unchanged |
| `basses` Bajos `/instrumentos/bajos` | bass, other | unchanged |
| `keyboards` Teclados y pianos `/instrumentos/teclados` (new) | keyboards, other | `keyboard_type` (piano digital, de escenario, acústico, sintetizador, arreglista, portátil, workstation, órgano, controlador MIDI), `keys`, `weighted_keys` |
| `percussion` Percusión `/instrumentos/percusion` (new) | drums, cymbals, hand_percussion, other | drums and cymbals unchanged; `percussion_type` (cajón, congas, bongós, timbales, djembé, pandereta, shaker / maraca, cencerro, percusión orquestal) |
| `winds` Vientos `/instrumentos/vientos` (new) | winds, other | `wind_type` (saxofón, trompeta, trombón, clarinete, flauta traversa, flauta dulce, tuba / bombardino, corno, oboe / fagot, armónica, acordeón) |
| `strings` Cuerdas `/instrumentos/cuerdas` (new) | string_instrument, other | `string_type` (ukelele, violín, viola, violonchelo, contrabajo, mandolina, banjo) |
| `pedals` Pedales `/instrumentos/pedales` | pedals, other | unchanged |
| `amplifiers` Amplificadores `/instrumentos/amplificadores` | amplifiers, other | unchanged |
| `microphones` Micrófonos `/instrumentos/microfonos` | microphones, other | unchanged |
| `audio` Audio `/instrumentos/audio` (new) | audio_interface, audio_gear, other | audio_interface unchanged; `audio_type` (mezcladora, parlante, subwoofer, amplificador de potencia, monitor de piso, monitor de estudio, audífonos, in-ear, procesador, grabadora) |

The new values follow the instrument catalog's own subcategories (`catalog_categories`), so the menu's subtypes and
its brand lists line up. The hand-percussion type is `hand_percussion`, not `percussion`, so no type repeats its
category in a URL.

## What changes for existing data and links

- **Migration** `supabase/migrations/20261022120000_marketplace_categories.sql`: the database validators
  (`listing_taxonomy_is_valid`, `listing_attribute_keys_are_valid`, the two publication checks, which now call the
  taxonomy function, and the saved-search normaliser) accept the new categories; then listings and pending revisions in
  `drums` and `cymbals` move to `percussion`, `audio interfaces` to `audio` (the type and attributes are kept); saved
  searches move to the new category plus the old type, with their hash and match bucket recomputed. A moved search that
  becomes identical to another live search of the same user is deleted the way the app deletes one. Moved listings get
  a new `updated_at` (the usual trigger).
- **Old URLs:** `/instrumentos/baterias`, `/instrumentos/platillos` and `/instrumentos/interfaces-de-audio` answer with a
  permanent redirect to the new category filtered to the old type (query strings are not carried over). Old catalog
  links (`/listados?category=drums…`, e-mails, bookmarks) read as the new category and type; they stay noindex.
- **Brand lists:** the menu maps the catalog's categories to the ten marketplace categories by the catalog category id
  (`lib/catalog-brands-aggregate.ts`), instead of `catalog_categories.laria_category`, which the catalog build still
  writes with the eight old values. DJ, studio (except MIDI controllers, under Teclados) and accessories have no
  marketplace category. The brand cache key moved to `v2`.
- The home tiles become two rows of five; the footer's "Baterías" link became "Percusión".
- The strip shows "Teclados" (the panel, landing and forms keep "Teclados y pianos") and its items sit 16 px apart
  instead of 18 px, so the ten categories still fit one row at 1280 px (measured: 1280 of 1280 px); below that the
  row scrolls sideways, as it already did at 1024 px.

## Release

Apply the migration and deploy this app in the same release: after the migration the database rejects the retired
values the current app's forms still submit, and before it the new app would label old rows by their raw value.

## Tested

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. `tests/marketplace-categories.test.cjs` pins the
  migration's lists to the app's taxonomy (categories, types, attribute keys, saved-search keys).
- A production build against the local catalog filtered to the production export (20,386 products): all ten panels
  on desktop and phone, the home tiles and the Percusión landing, no horizontal page overflow. Screenshots were shared
  in the project thread, not committed.
- The migration on a throwaway Postgres 17.6 with this schema and the pre-change `supabase/seed.sql` plus test-only
  fixtures (a publishable approved drum listing, a sold audio interface, a pending cymbal revision, five saved searches
  including two that collide): every row moved as described, the publishable listing still met its requirements,
  the colliding search was deleted and its pending match suppressed, the hashes match the normaliser, a drum listing
  still matches the moved drums alert, a second run changes nothing, and the sprint 8 trigger still refuses to move an
  approved listing to a retired category.

## Follow-ups (not in this branch)

- **Catalog build** (`catalog/canonical-catalog`): write the ten values into `catalog_categories.laria_category` and
  `laria_instrument_type`, so the autofill prototype (PR #3) proposes the new category and type.
- **Functional spec** (owner's text): § Category SEO Pages names `/instrumentos/baterias` as an example, and § Planned
  after V1 lists keyboards, pianos and synthesizers as categories "Laria does not list today".
- **Acceptance rows to re-run** after release: SEO-001 to SEO-007 (landings, sitemap, canonical), PUB-011/PUB-012
  (menus), LIST-* (sell form category and type), ALERT-* (saved searches in moved categories). Nothing was marked in
  `acceptance/cases.tsv`.
