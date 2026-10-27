# Feature ideas: store-floor batch

Ideas reach-08 ("Por llegar"), reach-09 ("Garantía y cambios" and the "Con garantía" filter), reach-10 (price labels
and the "Encuéntranos en Laria" poster) and buy-07 ("Reservar una prueba"). Henri marked all four Yes on 2026-10-26.
buy-09 ("Cuotas") was marked "next wave" and ships as this batch's second PR, after wave 1 (PR #43) merged. Branch
`claude/project-thread-ajrihw`, PRs into `features/marketplace`.

Nothing here is applied to a hosted database, no e-mail or WhatsApp is sent, and Laria still handles no money. Proposed
decisions are numbered FD-store-floor-n. Acceptance proposals are in `store-floor-acceptance.tsv` (GROW-500 to
GROW-541, Not Run).

## Migrations (slot 20261206)

| File | What | Redefines |
| --- | --- | --- |
| `20261206120000_feat_store_terms.sql` | `store_warranty_policies`, five listing columns, the trigger that copies a policy to listings, `set_store_warranty_policy`, `set_listing_store_terms` | none |
| `20261206120100_feat_stock_arrivals.sql` | `store_inventory_items.expected_arrival_on`, `listings.restock_expected_on`, the triggers that keep both honest, `set_inventory_arrival`, the daily expiry | none |
| `20261206120200_feat_store_tryouts.sql` | `store_tryout_settings`, `store_tryouts`, slots, booking, answers, settings, the daily try-out job, notice and e-mail types | none |
| `20261206120300_feat_warranty_flag.sql` | The `con_garantia` row in `laria_private.listing_flag_filters` and its `listings_flags_store_floor` trigger | none |
| `20261206120400_feat_store_installments.sql` | buy-09: `store_installment_offers` and its history, `listings.installments_max`, the `acepta_cuotas` flag and its own trigger, the refresh triggers, owner, Admin and public functions | none |

No shared function is redefined. The build plan expected store-floor to add `with_warranty` to the saved-search
functions; that is no longer needed, because listing-details' `options` key takes every registered listing flag, so
saved searches and alerts accept `con_garantia` as they are (checked in `tests/store-floor.sql`).

Trigger order on `listings` (Postgres fires BEFORE triggers by name): `listings_a_store_installments` sets the
installments, `listings_a_store_terms` fills the terms, `listings_flags_a_reset` empties `listing_flags`, the
`listings_flags_*` triggers append theirs (this batch's add `con_garantia` and `acepta_cuotas`),
`listings_restock_estimate` keeps the arrival date, and `listings_track_content_change` runs last.

The installments migration sorts in this batch's slot, before discovery's and services' (20261207, 20261208), which
were merged earlier. No hosted database has any of them, so the order only matters for a local database that already
ran those: replay it (`setup-local-db.sh reset`).

The daily job is `GET /api/internal/jobs/store-floor` (`CRON_SECRET`, like the other internal jobs). It calls
`public.run_store_floor_daily()`, which clears arrival dates that passed and then runs the try-out day (expire,
remind, purge). It is idempotent. Suggested schedule: once a day at 13:00 UTC (08:00 in Lima), so reminders arrive in
the morning.

## reach-08: "Por llegar"

**What changed.** In Inventario, a SKU without units available can carry the date the store expects more. Its listing
keeps its address, shows "Por llegar" instead of "Agotado" with "la tienda espera unidades para el 15 de diciembre
(fecha estimada)", and the list-11 button reads "Avísame cuando llegue". When units arrive the date clears itself and
the existing back-in-stock notice goes out once. The store page and listing cards show the "Por llegar" tag; Inventario
shows "Por llegar · 15/12" under the SKU's status.

The owner sets it from the SKU page ("Fecha estimada de llegada", with "En 1 semana", "En 2 semanas" and "En 1 mes",
or any date)
or for several ticked rows at once from the bulk bar ("Por llegar"). Rows with units available are skipped and counted.
A date that passes is removed by the daily job, and the store gets one in-app notice ("Pasó una fecha de llegada")
naming how many SKUs to update.

**Files.** `supabase/migrations/20261206120100_feat_stock_arrivals.sql`, `lib/store-floor/arrivals.ts`,
`lib/store-floor/dates.ts`, `components/store-floor/arrival-control.tsx`, `lib/inventory-actions.ts` (the `arrival`
action), `lib/store-inventory.ts`, `components/inventory/inventory-table.tsx`,
`app/mi-cuenta/tienda/inventario/[itemId]/page.tsx`, `app/instrumentos/[slug]/page.tsx`, `components/listing-card.tsx`,
`components/listing/listing-viewer.tsx`, `lib/ui/status.ts`, `app/tiendas/[slug]/page.tsx`.

**How to test.** As `demo-tienda@laria.test`, open Inventario → Agotados, open Boss TU-3, set a date. Open
`/instrumentos/demo-boss-tu-3`: "Por llegar", the date and "Avísame cuando llegue". Record a restock: the date is gone.

- **FD-store-floor-1.** "Por llegar" is the listing's `out_of_stock` state plus a date, not a new stock state. Every
  rule for a listing without units still holds: no "Solicitar compra", out of search and the index, no price-drop
  e-mails, and search alerts wait for the first units. It shows on the listing, the store page and listing cards.
- **FD-store-floor-2.** Dates go from today to a year ahead, in Lima's calendar. A date that passes is removed, never
  shown as late, and the store is told once.
- **FD-store-floor-3.** The bulk action works on ticked rows (up to 200), like "Ajustar stock", not on "todos los que
  coinciden".

## reach-09: "Garantía y cambios" and "Con garantía"

**What changed.** Mi tienda → "Garantía y cambios" (`/mi-cuenta/tienda/garantia`): the store states its warranty
(months, from the store or the brand) and its exchange terms (days, with a short note such as "con boleta") once per
condition group: Nuevos, Exhibición o caja abierta, Usados. Every store listing of that group shows the lines next to
the price ("Garantía de 12 meses de la marca", "Cambios hasta 7 días después de la compra: con boleta"), with "Lo
ofrece {tienda}, no Laria. Confirma las condiciones y pide tu boleta al comprar." Saying nothing shows nothing; 0 shows
"Sin garantía adicional de la tienda" or "No acepta cambios ni devoluciones".

On the same page, the store can give one listing its own terms, and send it back to the policy later. Changing a
listing's condition moves it to the new group's policy.

A listing with a warranty (store or brand, above 0 months) carries the listing flag `con_garantia`, so "Con garantía"
appears with the other yes/no filters in the catalog, filter sheet and saved alerts.

**One exchange promise per store.** Discovery's gift-exchange policy (`store_gift_policies`) and these terms could say
two things. Following the integrator's decision, the store's own terms win where they accept exchanges: the store page
hides the gift-exchange line, and `/regalos` shows the days from the terms. One helper decides for both pages
(`lib/store-floor/exchange.ts`): new gear's terms first, then the longest; terms that refuse exchanges leave the gift
policy in place, because that one is only about gifts.

**Files.** `supabase/migrations/20261206120000_feat_store_terms.sql`, `20261206120300_feat_warranty_flag.sql`,
`lib/store-floor/warranty.ts`, `lib/store-floor/exchange.ts`, `components/store-floor/warranty-forms.tsx`,
`components/store-floor/store-terms.tsx`, `app/mi-cuenta/tienda/garantia/page.tsx`, `lib/listing-flags.ts`,
`app/instrumentos/[slug]/page.tsx`, `lib/listings.ts`, `components/discovery/store-discovery-section.tsx`,
`lib/discovery/data.ts`.

**How to test.** As the demo store, set Nuevos to 12 months (marca) and 7 days. Open any of its new listings: both
lines and "Lo ofrece…". Open `/listados?opciones=con-garantia`: only those listings. Give one listing its own terms,
then send it back.

- **FD-store-floor-4.** Three condition groups, matching the condition scale: Nuevo; Exhibición o caja abierta (stores
  only); every other value is Usados. A per-listing exception lives on the Garantía page, not in the shared edit form.
- **FD-store-floor-5.** Terms apply at once and are not moderated, like the price. Changing them does not bump
  `content_changed_at`, so it does not resurface the listing or notify anyone.
- **FD-store-floor-6.** "Con garantía" means more than 0 months, from the store or the brand.
- **FD-store-floor-7.** The store's returns terms win over its gift-exchange policy on the store page and `/regalos`
  (integrator's decision), as described above.

## reach-10: price labels and the "Encuéntranos en Laria" poster

**What changed.** "Imprimir etiquetas" in Inventario's bulk bar (ticked rows, or every SKU of the view), "Imprimir
etiqueta" on a SKU page and "Etiquetas" under the table open `/mi-cuenta/tienda/etiquetas`. Each label carries the
name, the variant, the price, a Code 128 barcode of the SKU (what Mostrador reads with the camera or a USB reader) and
a QR to the listing. The store picks the paper (A4 with 24 labels of 70 × 37 mm, 14 of 99.1 × 38.1 mm, 40 of
52.5 × 29.7 mm, or a 50 × 30 mm thermal roll), which parts to print, one label per SKU or one per available unit, and
the first free label of a started sheet. The sheet is built in the browser as SVG and printed with the browser's
dialog; nothing is saved.

`/mi-cuenta/tienda/etiquetas/cartel` prints an A4 or A5 poster with the store's name and a QR to its store page, and,
when the store takes try-outs, a line saying so (the store can untick it).

QR (byte mode, level M, versions 1 to 10) and Code 128 (sets B and C) are written in `lib/labels/`, with no new
dependency. Their output was decoded with zxing-cpp for every version, every mask and mixed SKUs.

**Files.** `lib/labels/qr.ts`, `lib/labels/code128.ts`, `lib/labels/sheets.ts`, `components/store-floor/label-sheet.tsx`,
`components/store-floor/store-poster.tsx`, `app/mi-cuenta/tienda/etiquetas/page.tsx`,
`app/mi-cuenta/tienda/etiquetas/cartel/page.tsx`, `components/inventory/inventory-table.tsx`,
`app/mi-cuenta/tienda/inventario/page.tsx`, `app/mi-cuenta/tienda/inventario/[itemId]/page.tsx`.

**How to test.** Tick a few SKUs in Inventario → "Imprimir etiquetas" → Imprimir (A4, 100 %, margins "Ninguno"). Scan a
barcode in Mostrador and a QR with a phone.

- **FD-store-floor-8.** Labels are drawn in the browser, not as a server PDF: no new dependency, works offline once the
  page is open, and nothing about the store's stock leaves it.
- **FD-store-floor-9.** Limits: 200 SKUs per print, 50 copies per SKU and 1,000 labels. A SKU Code 128 cannot carry
  (accents, ñ, over 48 characters) prints without a barcode and the page says so; a SKU without a visible listing
  prints without a QR. The QR uses the shorter of the listing's slug and id address.
- **FD-store-floor-10.** The poster's QR goes to the store page (`/tiendas/<slug>`), where buyers follow and browse.

## buy-07: "Reservar una prueba"

**What changed.** Stores switch try-outs on in Mi tienda → Pruebas → "Horario y ajustes": hours per weekday (up to two
ranges a day, on the quarter hour, 06:00 to 23:00), slot length (15 to 90 minutes), how many people at once (1 to 5),
minimum notice (1 to 72 hours), how far ahead (1 to 30 days) and a short note. Try-outs start off.

On a store's listing with units available, "Reservar una prueba" opens a sheet with the free days and times. A
signed-in buyer adds a name, a WhatsApp number (only the store sees it) and an optional message. The store gets a
notice and an e-mail, and confirms or answers "No puedo" (with an optional reason) in one tap on its agenda; the buyer
is told either way. Either side can cancel. Both screens open WhatsApp with the details already written. A confirmed
try-out gets one reminder, the day before or the same morning. Unanswered requests expire at their time and the buyer
is told.

Buyers see their try-outs in `/mi-cuenta/pruebas` (linked from Compras y ventas), with "Cancelar", "Agregar al
calendario" (an .ics file) and "Coordinar por WhatsApp". Stores see "Pruebas de hoy" on Mi tienda and the whole agenda
in Pruebas (a new store menu entry).

**Files.** `supabase/migrations/20261206120200_feat_store_tryouts.sql`, `lib/store-floor/tryouts.ts`,
`lib/store-floor/tryouts-server.ts`, `components/store-floor/tryout-booking.tsx`, `tryout-entry.tsx`,
`tryout-agenda.tsx`, `tryout-settings-form.tsx`, `store-floor-panel.tsx`, `app/mi-cuenta/tienda/pruebas/*`,
`app/mi-cuenta/pruebas/page.tsx`, `app/api/internal/jobs/store-floor/route.ts`, `lib/email/templates.ts`,
`lib/notifications.ts`, `lib/account-navigation.ts`, `app/mi-cuenta/transacciones/page.tsx`.

**How to test.** Load `scripts/prototype/store-floor-seed.sql` (try-outs on, one confirmed for today, one waiting). As
`comprador@laria.test`, open `/instrumentos/demo-shure-sm58` → "Reservar una prueba". As the store, confirm it in
Pruebas. Run the job: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/internal/jobs/store-floor`.

- **FD-store-floor-11.** A try-out holds a time, never the instrument: stock, listings and purchase requests are
  untouched (talk-06 "Reservado" is still a Maybe). It is offered only on store listings with units available (or not
  stock-managed) of a store that switched try-outs on.
- **FD-store-floor-12.** Try-out hours are their own weekly schedule, because the store profile's opening hours are free
  text. The form suggests Monday to Friday 10:00 to 19:00 and Saturday 10:00 to 14:00.
- **FD-store-floor-13.** "Both get the details by WhatsApp" is done with prefilled WhatsApp links on both screens plus
  Laria's notices and transactional e-mails. Laria sends no WhatsApp message itself.
- **FD-store-floor-14.** Booking needs an account (so the store knows who is coming and the buyer can be told). Limits
  per buyer: one open try-out per listing, three open in all, ten requests a day.
- **FD-store-floor-15.** One reminder, sent by the daily job for confirmed try-outs of today and tomorrow, skipped when
  the try-out starts within the hour. Requests the store never answered expire at their start time.
- **FD-store-floor-16.** A try-out, with the buyer's name and number, is deleted 90 days after its date.
- **FD-store-floor-17.** Buyers reach their try-outs from Compras y ventas (and every notice), with no new buyer menu
  entry. Stores get "Pruebas" in the store menu.
- **FD-store-floor-18.** listing-details' "Se puede probar" flag (a seller's yes/no) stays separate from booking. A store
  listing can show both; the flag says trying is possible, the button books a time.

## buy-09: "Cuotas"

A verified store that takes credit cards says it offers interest-free installments, and its listings show what each
installment would be. Laria still processes no payment: the store's card provider runs the installments.

- **Store (Mi tienda > Pagos).** Under the payment methods, "Cuotas sin intereses": "Ofrecer cuotas" opens a sheet with
  how many (2 to 12, 18, 24 or 36), the credit cards (optional, from a fixed list), from what price (optional), a note
  for Laria and a box the owner must tick: "Confirmo que el comprador no paga intereses ni recargos por pagar en
  cuotas". The sheet shows the line a S/ 3,000 listing would get. Every save goes to Laria's review; "Dejar de
  ofrecerlas" stops them at once. The button appears only once the store has a card method (POS al recoger or enlace
  de pago) proposed or approved.
- **Admin (Medios de pago).** A "Cuotas sin intereses" section under the methods, in the same state filter: the
  sentence buyers will read, the store's card methods and their state, the note, and Aprobar / Rechazar / Desactivar
  with a reason, on the revision shown. Every decision is audited (`store_installments_<state>`).
- **Buyers.** Under the price on the listing page and on cards: "o 12 cuotas sin intereses de S/ 358.25". In the
  "Medios de pago que acepta la tienda" box (listing and store page): "Hasta 12 cuotas sin intereses con tarjetas de
  crédito BCP, BBVA o Interbank, en compras desde S/ 500. Las cobra el proveedor de tarjetas de la tienda." The
  filters get "Acepta cuotas", offered only when results carry it; saved alerts accept it through the `options` key.
- **When it shows.** Only while the pilot is on (both switches), the offer is approved, the store is active and
  verified, it has an approved card method, the listing is a store listing at or above the minimum price, and it has
  units. `listings.installments_max` holds the number; triggers recompute it when the offer, a card method, the
  store's verification or status, or the pilot switch changes, and a written value never sticks.

Decisions:

- **FD-store-floor-19.** Only interest-free offers exist. With interest, the TCEA would have to be shown, which Laria
  does not do; the owner confirms "sin intereses" on every save (the box starts unticked and the database refuses a
  save without it), and the confirmation is kept in the offer's history.
- **FD-store-floor-20.** One offer per store, not per listing or card: the most common shape ("hasta 12 cuotas sin
  intereses con …"), and what the Admin can check against the provider. A minimum price covers "desde S/ 500".
- **FD-store-floor-21.** The amount is the price divided evenly, rounded to the cent, written without Intl so the
  server and the browser print the same text. Cents show only when there are any ("S/ 250", "S/ 358.25").
- **FD-store-floor-22.** The offer follows PAY-1 Pilot A: same review states, revision check, error style, both pilot
  switches, and safe-08's second step for owners once a method is approved. It needs a card method: proposing
  requires one proposed or approved, and buyers see nothing until one is approved.
- **FD-store-floor-23.** The card list is fixed (BCP, BBVA, Interbank, Scotiabank, BanBif, Banco Pichincha, Diners
  Club, American Express, Banco Falabella, Banco Ripley, Tarjeta Oh), so no free text reaches buyers. "Tarjeta Oh"
  drops the brand's "!" because the interface has no exclamations.
- **FD-store-floor-24.** "Acepta cuotas" is hidden from the filters while no result carries it (a new `onlyWhenListed`
  mark in `lib/listing-flags.ts`), so the filter does not sit at zero for as long as the pilot is off.
- **FD-store-floor-25.** Sold listings keep the value they had (a sold listing cannot change), and nothing shows them:
  the line needs an approved, in-stock listing.

## Changes to other batches' and shared files

Marked with a `store-floor` comment in each file.

- Shared registries: `lib/notifications.ts` (seven types), `lib/email/templates.ts` (six try-out e-mails),
  `lib/account-navigation.ts` ("Pruebas" for stores and its icon; Garantía highlights Mi tienda and Etiquetas
  highlights Inventario; `/mi-cuenta/pruebas` highlights Compras y ventas), `docs/database.md`,
  `docs/functional-spec.md`.
- listing-details: `app/instrumentos/[slug]/page.tsx` (terms lines, "Por llegar", the try-out entry),
  `components/listing-card.tsx` (the "Por llegar" tag), `components/listing/listing-viewer.tsx` (the `arriving`
  wording), `lib/listings.ts` (two types), `lib/listing-flags.ts` (the `con_garantia` entry),
  `tests/ux-effortless-find.test.cjs` (the facet test now expects the new option).
- discovery: `components/discovery/store-discovery-section.tsx` and `lib/discovery/data.ts` (one exchange promise).
- Others: `app/tiendas/[slug]/page.tsx` (one selected column), `app/mi-cuenta/transacciones/page.tsx` (a link to Mis
  pruebas), `lib/ui/status.ts` (the "Por llegar" tag), `tests/account-shell.test.cjs`, `tests/sprint-9.test.cjs` and `tests/store-ops-review-ux.test.cjs` (menus now list
  "Pruebas"), `scripts/prototype/a11y-audit.cjs` (this batch's pages).
- buy-09 (second PR): `lib/listing-flags.ts` (the `acepta_cuotas` entry and the `onlyWhenListed` mark),
  `lib/catalog-filters.ts` (one line: such a flag is offered only with results), `lib/catalog.ts` and
  `app/tiendas/[slug]/page.tsx` (`installments_max` in the card columns while the pilot is on),
  `components/listing-card.tsx` (the line), `lib/listings.ts` (one type), `app/instrumentos/[slug]/page.tsx` (the
  line and the offer read, next to listing-details' combo read), `app/admin/medios-de-pago/page.tsx` (the section).
  Owned by this batch: `lib/payment-methods.ts`, `components/payment/*`, `app/mi-cuenta/tienda/pagos`.

## How to test

- `pnpm typecheck`, `pnpm lint`, `pnpm test` (`tests/store-floor.test.cjs`, `tests/store-installments.test.cjs`), `pnpm build`.
- `bash /mnt/project-files/store-operations/local-db-setup/setup-local-db.sh reset` then `… test`
  (`tests/store-floor.sql`: policies, terms, the flag and alerts, arrival dates and expiry, try-out slots, booking
  limits, answers, RLS, the daily job; `tests/store-installments.sql`: proposals, review, every condition of the
  public offer, the listing column and flag, alerts, history, second step).
- Local prototype: `bash scripts/prototype/start-docker-free.sh seed`, then
  `psql "$PGURL" -f scripts/prototype/store-floor-seed.sql`, `pnpm build && pnpm start`.
- The seed also gives Laria Demo Música 12 interest-free installments with BCP, BBVA or Interbank from S/ 500.
- `node scripts/prototype/a11y-audit.cjs` covers this batch's pages (140 page checks with "Acepta cuotas", no
  violations).
- Screenshots at 390 and 1366 px: `/mnt/project-files/feature-ideas/screens/store-floor/`.

## Limitations

- Favorites (`get_account_favorites`) still show "Agotado" for a "Por llegar" listing; the date shows on the listing.
- Inventario's "Por llegar" bulk action needs ticked rows; it is not offered for "todos los que coinciden".
- The try-out agenda shows 30 days back; older try-outs remain until the 90-day purge.
- A store that refuses exchanges in its terms but offers gift exchanges keeps showing the gift line (FD-store-floor-7).
- Printing depends on the browser's dialog (scale 100 %, no margins); the page says so, but it cannot set them.
- Cuotas: the related-listing strips on a listing page have their own columns and show no installments line; the
  Admin section lists the 50 oldest offers in a state; owners are not notified of Admin decisions (as with methods).
- Seen while testing, not caused by this batch: at 390 px a listing page whose "Publicaciones similares" has three or
  more cards with a long spec line is wider than the screen (the sections need `min-width: 0`), and Inventario logs a
  hydration warning from the date format of "Último movimiento". Both are reported to the integrator.

## Copy that needs legal review

- "Sin garantía adicional de la tienda" and "No acepta cambios ni devoluciones": the legal warranty under Peru's
  consumer code applies regardless; the Garantía page tells the store so, but the buyer-facing wording should be
  checked.
- "Lo ofrece {tienda}, no Laria. Confirma las condiciones y pide tu boleta al comprar." under every warranty line.
- "Cambios hasta N días después de la compra: {nota}" as the store's exchange promise.
- Cuotas: "o N cuotas sin intereses de S/ X" without a TCEA (only interest-free offers exist), the store's line "Las
  cobra el proveedor de tarjetas de la tienda", and the owner's confirmation "Confirmo que el comprador no paga
  intereses ni recargos por pagar en cuotas".
- The buyer's WhatsApp number shared with the store for a try-out ("Solo lo ve la tienda, para coordinar la prueba")
  and kept for 90 days after the date.
