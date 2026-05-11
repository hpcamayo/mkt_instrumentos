# Advanced Filter System

Laria's listings page is designed for musicians, not generic ecommerce browsing. The goal is to let buyers search by meaningful gear attributes while keeping seller onboarding simple enough for an MVP.

## Technical Architecture

Advanced filters are driven by:

```text
listings.instrument_type
listings.attributes jsonb
```

Current code locations:
- `lib/instrument-filters.ts`: actual filter groups, keys, labels, and options.
- `lib/listing-specs.ts`: reuses the filter groups to render listing detail attribute labels and option values.
- `lib/listings.ts`: URL query parsing into `ListingFilters`.
- `components/listing-filters.tsx`: desktop and mobile filter UI.
- `app/listados/page.tsx`: Supabase query application.

UI labels are Spanish. Internal values are stable English/snake_case where practical.
Detail pages should render friendly labels/values and never expose raw `attributes` JSON or ugly snake_case keys to buyers.

## Core Filters

Always visible in the UI:
- Categoria
- Instrumento
- Condicion
- Marca
- Ubicacion
- Vendedor
- Precio desde / hasta
- Ordenar

Conceptual core filters from the business docs:
- Condicion
- Marca
- Precio
- Ubicacion

The UI also keeps category for compatibility with the existing marketplace taxonomy.

## Seller Type

Supported URL values:
- `individual`: Particular.
- `store`: Tienda.
- `verified_store`: Tienda verificada.

Implementation:
- `individual` filters `seller_type = 'individual'`.
- `store` filters `seller_type = 'store'`.
- `verified_store` uses `stores!inner`, filters `seller_type = 'store'`, and filters `stores.is_verified = true`.

## Sort Values

URL values:
- `newest`: Mas recientes.
- `price_asc`: Menor precio.
- `price_desc`: Mayor precio.

Implementation:
- `newest`: orders by `published_at desc nulls last`, then `created_at desc`.
- `price_asc`: orders by `price_pen asc nulls last`.
- `price_desc`: orders by `price_pen desc nulls last`.

## Current Instrument Groups and Actual Keys

These are the actual keys currently implemented in `lib/instrument-filters.ts`. If older planning docs use different names, prefer the current code unless intentionally migrating data and filters.

### `electric_guitar` / Guitarras electricas

- `body_type`: Solid body, Semi-hollow, Hollow body.
- `shape`: Strat, Tele, Les Paul, SG, Offset, Superstrat, Explorer, Flying V, Otro.
- `strings`: 6, 7, 8, 12.
- `bridge`: Fijo, Tremolo, Floyd Rose, Bigsby.
- `pickups`: Single coil, Humbucker, P90, HSS, SSS, HH, HSH.
- `handedness`: Diestro, Zurdo.
- `frets`: 21, 22, 24.

### `bass` / Bajos

- `strings`: 4, 5, 6.
- `bass_type`: Jazz Bass, Precision, StingRay, Moderno, Hollow, Otro.
- `pickups`: J, P, PJ, Humbucker, Activas, Pasivas.
- `scale_length`: Corta, Media, Larga.
- `handedness`: Diestro, Zurdo.

### `acoustic_guitar` / Guitarras acusticas

- `acoustic_type`: Clasica, Acustica, Electroacustica.
- `body_shape`: Dreadnought, Jumbo, Concert, Parlor, Grand Auditorium, Cutaway.
- `strings_material`: Nylon, Acero.
- `handedness`: Diestro, Zurdo.
- `has_preamp`: Si, No.

### `drums` / Baterias

- `drum_type`: Acustica, Electronica.
- `configuration`: Shell pack, Completa, Solo cuerpos.
- `pieces`: 4, 5, 6, 7+.
- `material`: Maple, Birch, Poplar, Mahogany, Otro.
- `includes_hardware`: Si, No.
- `includes_cymbals`: Si, No.
- `kick_size`: 18, 20, 22, 24.

### `cymbals` / Platillos

- `cymbal_type`: Hi-hat, Crash, Ride, China, Splash, Stack.
- `size`: 8, 10, 12, 14, 16, 18, 20, 22.
- `alloy`: B20, B12, B8, Brass, Otro.
- `finish`: Traditional, Brilliant, Dry, Dark.

### `microphones` / Microfonos

- `microphone_type`: Dinamico, Condensador, Ribbon, Lavalier, Shotgun.
- `use_case`: Voz, Instrumento, Bateria, Podcast, Camara.
- `polar_pattern`: Cardioide, Supercardioide, Omnidireccional, Figura 8.
- `connection`: XLR, USB, 3.5mm.

### `audio_interface` / Interfaces / audio

- `inputs`: 1, 2, 4, 8+.
- `connection`: USB, USB-C, Thunderbolt.
- `phantom_power`: Si, No.
- `midi`: Si, No.

### `pedals` / Pedales

- `pedal_type`: Overdrive, Distortion, Fuzz, Delay, Reverb, Chorus, Wah, Compressor, Tuner, Multi-FX.
- `format`: Compacto, Doble, Multiefecto.
- `true_bypass`: Si, No.

### `amplifiers` / Amplificadores

- `amplifier_type`: Combo, Cabezal, Cabinet.
- `technology`: Tubos, Transistores, Modelado, Hibrido.
- `power`: 1-15W, 16-50W, 51-100W, 100W+.
- `use_case`: Guitarra, Bajo, Teclado.

## Planning Docs vs Current Code Differences

Older Laria planning docs suggested some alternate keys:
- `body_shape` for electric guitar shape; current code uses `shape`.
- `pickup_config`; current code uses `pickups`.
- `scale`; current code uses `scale_length`.
- `string_material`; current code uses `strings_material`.
- `mic_type`; current code uses `microphone_type`.
- `usage`; current code often uses `use_case`.
- `amp_type`; current code uses `amplifier_type`.
- Singular instrument types like `microphone`, `pedal`, `amplifier`; current code uses `microphones`, `pedals`, `amplifiers` for those groups.

Do not change these lightly. A key migration requires:
- updating `lib/instrument-filters.ts`
- updating seed/current database `attributes`
- updating URL parsing expectations
- confirming existing URLs do not break or adding compatibility

## URL Parsing

`parseListingFilters()` reads route `searchParams` and returns:
- core filter fields
- `advanced: Record<string, string | string[] | number | boolean>`
- `sort`

Advanced filters are parsed for the selected instrument group when `instrument_type` exists. Without an instrument type, known filter keys across all groups can be parsed.

Multiselect query params can be repeated or comma-separated:

```text
/listados?instrument_type=electric_guitar&pickups=humbucker&pickups=single_coil
```

Boolean-type filters currently use `yes` and `no` option values in the UI and seed data. The parser only converts literal `true` and `false` to booleans; otherwise it leaves the value as a string. This is intentional for current data such as:

```json
{
  "has_preamp": "no",
  "phantom_power": "yes",
  "true_bypass": "yes"
}
```

## Supabase Query Behavior

Core filters:
- `category`: `.eq("category", value)`
- `location` / `city`: `.eq("city", value)`
- `brand`: `.ilike("brand", "%value%")`
- `condition`: `.eq("condition", value)`
- `seller_type`: `.eq("seller_type", value)` or verified-store join/filter
- `instrument_type`: `.eq("instrument_type", value)`
- `min_price`: `.gte("price_pen", value)`
- `max_price`: `.lte("price_pen", value)`

Advanced filters:

```ts
query = query.contains("attributes", { [key]: value });
```

This maps to JSONB containment. Examples:
- `attributes @> {"shape":"strat"}`
- `attributes @> {"pickups":["humbucker"]}` when values are arrays.

Important: JSONB values must match both key and stored shape. If an attribute is stored as a string, query with a string. If stored as an array, query with an array.

## Active Chips and Shareability

Active filter chips are built from `ListingFilters` in `app/listados/page.tsx`.

Each chip links to the same URL with one filter omitted. `Limpiar filtros` links to `/listados`.

Because forms submit with GET and sort links preserve query params, filter combinations are shareable and reload-safe.

## Mobile and Desktop UI

Desktop:
- Sidebar is sticky and about `260px`.
- Core filters and selected advanced filters are shown in a form.

Mobile:
- Sidebar is hidden.
- `Filtrar` opens a bottom sheet with the same filter form.
- `Ordenar` opens a bottom sheet with sort options.

The same URL params drive both layouts.

## Current Gap

The public listing submission form does not yet collect `instrument_type` or `attributes`. Advanced filters work for seeded/admin-populated data, but new public submissions may not match advanced filters until those fields are captured or edited by admin.
