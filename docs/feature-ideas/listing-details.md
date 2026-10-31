# Feature ideas: listing-details batch

Ideas sell-10 (detailed condition), sell-07 (fixed or negotiable price), sell-06 ("Acepto cambios por…"), buy-02 ("Cómo
se entrega"), buy-01 (combos) and buy-08 (results on a map). All six were marked Yes by Henri on 2026-10-26. Branch
`claude/project-thread-nomg6x`: the database and search foundation went in with PR #37 (merged into
`features/marketplace`); the forms, pages, map and combo settings follow in PR #40.

Nothing here is applied to a hosted database. Proposed decisions are numbered FD-listing-details-n; acceptance proposals
are in `listing-details-acceptance.tsv` (GROW-100 to GROW-139, Not Run). Database notes: `docs/database.md`, section
"Feature ideas: listing details". Screenshots and the accessibility report:
`/mnt/project-files/feature-ideas/screens/listing-details/`.

## Migrations (slot 20261202)

| File | What | Redefines |
| --- | --- | --- |
| `20261202120000_feat_listing_condition_scale.sql` | The condition scale, its check and the old values mapped everywhere they are stored | none |
| `20261202120100_feat_listing_flags_and_details.sql` | `listing_flags` and its registry; the listing detail writers registry, `complete_listing_submission`, `update_owned_listing_details` | none |
| `20261202120200_feat_listing_sale_terms.sql` | Price mode, delivery and trade columns, their writer and flags | none |
| `20261202120300_feat_listing_details_shared_patches.sql` | Find-and-replace patches (anchor checked) of `normalize_saved_search`, `listing_matches_saved_search`, `record_marketplace_event_service`, `sanitize_listing_details`, `set_store_import_row_publish_fields`, `copy_owned_listing` | patches in place |
| `20261202120400_feat_catalog_facets_options.sql` | `catalog_facets` with the yes/no filters | `public.catalog_facets` |
| `20261202120500_feat_listing_combos.sql` | `seller_bundle_offers`, `listing_companions` and their RPCs | none |
| `20261202120600_feat_store_map_pins.sql` | A store's map pin, public only with its address | none |
| `20261202120700_feat_listing_maker_writer.sql` | Discovery's maker marks as a listing detail writer (`maker`) | none |
| `20261202120800_feat_trade_categories_follow_catalog.sql` | Trade categories are the catalog's (andean included) | patches this batch's own writer |

Discovery's `20261207120300` patches `normalize_saved_search` after this batch and keeps `andean` and `andean_type`;
store-floor rebuilds the saved-search and facet functions after this batch with its `with_warranty` key.

## Shared pieces other batches build on

- **Yes/no filters** (`lib/listing-flags.ts`, `laria_private.listing_flag_filters`). One entry per flag; the filter
  sidebar, the sheet, the chips, saved alerts and facet counts follow. store-floor's "Con garantía" is the second
  user. See `docs/database.md` for the trigger naming rule.
- **Listing detail writers** (`lib/listing-details.ts`, `laria_private.listing_detail_writers`). A batch's extra
  listing fields travel as one JSON key, checked by the site and then written by the batch's own definer function
  inside the submission. The sell and edit forms render them through `components/listing-details/detail-fields.tsx`
  (marked block). Keys today: `sale_terms` (this batch) and `maker` (discovery).

## sell-10: detailed condition

**What changed.** Condition is one step of a scale, best to worst, each with a one-line definition: Nuevo, Exhibición o
caja abierta (stores only), Como nuevo, Excelente, Muy bueno, Bueno, Regular, Para reparar. The sell and edit forms show
the scale as one column of cards with the definitions; the listing page shows the condition as a tag that opens its
definition and the whole scale with the current step checked. Old values are mapped everywhere: stored listings,
revisions, drafts, SKU details, store defaults, saved alerts, links, store imports and SEO (`itemCondition`: Nuevo is
new, Para reparar damaged, every other step used).

**Files.** `lib/listing-condition.ts`, `lib/listings.ts`, `lib/catalog-filters.ts`, `lib/catalog-query.ts`,
`lib/sell-draft.ts`, `lib/seo.ts`, `components/selling/choice-fields.tsx`, `components/listing-details/condition-explainer.tsx`,
`app/instrumentos/[slug]/page.tsx`, `20261202120000`, `20261202120300`.

**How to test.** Publish as a Particular (no open box offered) and as a store (open box offered). Open
`/listados?condition=Usado%20-%20buen%20estado`: it shows the steps that value covered. Tap the condition on a listing.

- **FD-listing-details-1.** Old values map to one step each: "Usado - buen estado" → Muy bueno, "Usado - con detalles"
  → Bueno. An old search value stands for every step it covered (buen estado: open box, Como nuevo, Excelente, Muy
  bueno; con detalles: Bueno, Regular, Para reparar), so saved alerts and links keep finding what they found. A bare
  "usado" is no step: search reads it as any used step, the import asks the store to choose.
- **FD-listing-details-2.** "Exhibición o caja abierta" is for store listings only (the database refuses it for a
  Particular), and it is sold as used in structured data.

**Limitations.** Admin's listing editor offers the whole scale; saving open box on a Particular's listing is refused
with the database's message.

## sell-07: fixed or negotiable price

**What changed.** Under the price, an optional choice "Precio fijo" or "Precio conversable" (with "No indicarlo"). The
listing shows it beside the price; cards show "Precio fijo" or "Conversable". When it is set, the contact module stops
offering "¿El precio es negociable?".

**Files.** `components/listing-details/sale-terms-fields.tsx` (`PriceModeField`), `components/listing-details/price-mode-mark.tsx`,
`components/listing-card.tsx`, `components/selling/listing-preview.tsx`, `lib/sale-terms.ts`, the listing page.

- **FD-listing-details-3.** Nothing is chosen for the seller: the price mode starts empty and stays optional.

## buy-02: "Cómo se entrega", and sell-06: "Acepto cambios por…"

**What changed.** The sell and edit forms have an optional "Entrega y cambios" section: recojo en persona, se puede
probar (with a district or zone, never an address), delivery in Lima and who pays it (or none), shipping to provinces
by Shalom, Olva or another agency and whether it is paid on sending or at the agency, and "Acepto cambios" with what
the seller would take and for which categories. "Usar lo de tu última publicación" copies the last published delivery
terms (kept on the device, per account). The listing shows "Cómo se entrega", "Entrega y cambios" or "Cambios" with one
line per term and "Lo indica quien vende. Laria no gestiona envíos, pagos ni cambios." A listing that accepts trades
adds the WhatsApp chip "Te propongo un cambio" ("Les propongo un cambio" for a store), and the chips a listing already
answers (shipping, try-out) are not offered. Three filters, "Envía a provincia", "Se puede probar" and "Acepta
cambios", work in the sidebar, the filter sheet, the applied chips, the facet counts and saved alerts
(`?opciones=envia-provincia`).

**Files.** `lib/sale-terms.ts`, `lib/listing-details.ts`, `lib/listing-flags.ts`, `lib/catalog.ts`,
`lib/catalog-filters.ts`, `lib/catalog-facets.ts`, `lib/search-alerts.ts`, `lib/contact-message.ts` (`tradeQuestion`),
`components/listing-details/{detail-fields,sale-terms-fields,sale-terms-summary}.tsx`, `components/sell-listing-form.tsx`,
`components/listing-edit-form.tsx`, `app/api/submissions/route.ts`, `app/api/listings/[id]/manage/route.ts` (action
`details`), `20261202120100`–`20261202120400`, `20261202120800`.

**How to test.** On the prototype, `/instrumentos/demo-particular-squier-bullet` shows trades and the trade chip; filter
`/listados` by "Envía a provincia"; save an alert with it. Edit a listing's terms: they go live at once.

- **FD-listing-details-4.** Delivery and trade terms are not moderated, like the price: they go live when saved. The
  site and the database refuse phone numbers, e-mails and links in the two free-text fields.
- **FD-listing-details-5.** The pickup or try-out place is a district or zone, never an address.
- **FD-listing-details-6.** The yes/no filters are "all of" and are derived by the database from the listing's own
  columns; nobody can set a flag directly. Unknown `opciones` values send the visitor to the cleaned URL, like other
  filters.
- **FD-listing-details-7.** Trade categories are the catalog's own (a category added later, like Andinos, is accepted
  without changes here), at most 12.
- **FD-listing-details-8.** The last published terms are remembered on the device only and applied only when the seller
  presses the button; the price mode is never copied.

**Limitations.** Who pays the delivery and the shipping options are the seller's words; Laria books nothing
(money-02 stays deferred).

## buy-01: combos

**What changed.** On a listing, "Agregar al combo" keeps a list per seller on the device (up to 10 listings, for 30
days). With two or more, "Pedir el combo por WhatsApp" sends one message with every title, price and link, the sum of
published prices and, when the seller declared one, their discount ("Vi que ofrecen 10% de descuento llevando 2 o
más"). Each listing in it counts as a contact for its seller. Sellers declare the discount (5% to 30%, from 2 to 5
listings) in "Descuento por combo": stores in Mi tienda → Valores por defecto, Particulares in Mis publicaciones.
Stores can attach up to six of their listings to one as "Lo que suele acompañarlo" from its edit page; they show under
the description with "Agregar al combo" (out-of-stock ones are left out).

**Files.** `lib/combo.ts`, `lib/contact-message.ts` (`comboContactMessage`), `components/listing-details/{combo,companions,bundle-offer-settings,bundle-offer-form,companion-settings,companion-picker}.tsx`,
`app/api/listing-details/bundle-offer/route.ts`, `app/api/listings/[id]/manage/route.ts` (action `companions`),
`app/mi-cuenta/tienda/valores-por-defecto/page.tsx`, `app/mi-cuenta/publicaciones/page.tsx`,
`app/mi-cuenta/publicaciones/[id]/editar/page.tsx`, `20261202120500`.

**How to test.** As a visitor, add the Squier and another Particular listing to a combo; check the message. As
`demo-tienda@laria.test`, set a discount in Valores por defecto and companions on the Stratocaster's edit page.

- **FD-listing-details-9.** The combo list lives on the device only: no account, no server copy.
- **FD-listing-details-10.** The discount is the seller's declared offer. Laria shows it and puts it in the message,
  but never computes or shows a price owed; the message carries the sum of published prices only.
- **FD-listing-details-11.** The combo is not offered on sold or out-of-stock listings, nor while a listing is in the
  assisted-purchase pilot ("Solicitar compra"), so a listing never shows two ways to buy.
- **FD-listing-details-12.** Companions are for stores only (a Particular's few listings rarely go together), up to six,
  from the same store, and only ones still for sale.

## buy-08: results on a map

**What changed.** The catalog and category pages have a "Lista | Mapa" switch above the results. The map (MapLibre GL
with OpenFreeMap's Positron tiles; no key, credits always shown) uses the same filters. A store that shows its street
address and placed its pin appears as a pin with "Abrir en Google Maps", "Abrir en Waze" and "Ver la tienda"; every
other result appears as an approximate area, a dashed circle around a Lima or Callao district (stores that name one) or
a city (everyone else), or the region's capital when the city is unknown. Nearby markers merge into one badge that
zooms in to part them; places that share a point open as a list. A list of places beside the map does everything the
map does, and the zoom buttons and the keyboard move it. Choosing a place shows its listings. The choice of view stays
for the visit and in the address (`?vista=mapa`). Stores place their pin from Mi tienda → "Tu tienda en el mapa":
move the map until the cross sits on the door, "Poner el pin en la cruz", "Guardar el pin".

**Files.** `lib/places.ts`, `lib/catalog-map.ts`, `lib/catalog.ts` (`fetchCatalogMap`), `app/api/catalog/map/route.ts`,
`components/map/{maplibre,catalog-map-switch,catalog-map-view,store-pin-field,store-pin-map}.tsx`,
`components/catalog-view.tsx`, `components/store-registration-form.tsx`, `lib/account-context.ts`, `20261202120600`;
dependency `maplibre-gl` 6.14.0.

**How to test.** `/listados`, then "Mapa": Laria Demo Música is a pin in Miraflores; Casa Musical Grau an area in the
Cercado; Particulares areas by city. As `demo-tienda@laria.test`, move the pin in Mi tienda.

- **FD-listing-details-13.** A store is a pin only while it shows its address (the same consent as list-12); otherwise
  it is an area around its district. A Particular is never closer than their city.
- **FD-listing-details-14.** Laria gives no directions: a store pin opens the point in Google Maps or Waze, and the
  buyer's app does the rest.
- **FD-listing-details-15.** The list stays the default view; the map shows the 300 newest results that match and says
  when there are more.
- **FD-listing-details-16.** No address search for the pin: it would need a geocoding service. The pin starts on the
  store's district.
- **FD-listing-details-17.** The map library and its worker load only when the map is opened; the recovery switch
  (`LARIA_CATALOG_ENRICHMENT_DISABLED`) also turns the map's data off.

**Content Security Policy.** When audit PR #36 is on `features/marketplace`, add `https://tiles.openfreemap.org` to
`EXTRA_SOURCES` in `lib/security-headers.ts` for `connect-src` and `img-src`, and make sure `worker-src` allows `'self'`
and `blob:` (MapLibre's worker is a file of this site). Until then the map needs no CSP change.

**Limitations.** Areas come from a short list of districts and cities (`lib/places.ts`); a city outside it falls back to
its region's capital, or the listing is counted under "no tienen una ciudad que podamos ubicar". The build sandbox cannot reach
the tile server, so the screenshots show the map without its streets.

## Discovery's maker marks in the sell form

**What changed.** At the integrator's request, a maker store's sell form has discovery's "Lo hizo mi taller" and "Se
hace a pedido: N semanas", and a verified artist's has "Cómo usaste este equipo". They are saved with the listing
through the writer `maker` (`laria_private.write_listing_maker_details`), which checks the listing's own seller and
raises discovery's errors (MAKER_REQUIRED, MADE_TO_ORDER_INVALID, ARTIST_NOTE_LENGTH, ARTIST_REQUIRED); a failure rolls
back the whole submission. Discovery's own form stays on the edit page.

**Files.** `lib/maker-details.ts`, `lib/listing-detail-access.ts`, `components/listing-details/maker-fields.tsx`, both
sell pages, `20261202120700`.

- **FD-listing-details-18.** A duplicate or relisted copy keeps "Hecho a mano" and "a pedido" while the store still
  shows its maker profile; the artist's note, about one physical instrument, is not copied.

## Copy for legal review

- "Lo indica quien vende. Laria no gestiona envíos, pagos ni cambios." (listing page, under the terms)
- "Es tu oferta: el precio final lo acuerdan ustedes." (Descuento por combo)
- "Junta varias publicaciones de este vendedor y escríbele una sola vez. Se guarda solo en este dispositivo." (combo)
- "Zona aproximada. El lugar exacto lo acuerdas con quien vende." and "Tu app de mapas te muestra cómo llegar." (map)

## Environment and schedules

None. No environment variable, no scheduled job, no outside account. The map's tiles come from OpenFreeMap's public
server with no key.

## Prototype

`scripts/prototype/listing-details-seed.sql` (loaded by `start-docker-free.sh seed`) adds terms, a combo discount,
companions and a store pin to the demo data.
