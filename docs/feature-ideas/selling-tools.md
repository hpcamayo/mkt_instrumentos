# Feature ideas: selling-tools batch

Ideas sell-01 (Mi equipo, without the estimated value), sell-02 (sell it to a store today), sell-03 (consignment),
sell-04 (price steps), sell-05 (a private offer to people who saved it), buy-06 (a reminder to change strings) and
run-04 (your old gear as part payment). Henri marked all seven Yes on 2026-10-26; the estimated value of sell-01 is on
the deferred list (`deferred.md`). Branch `features/selling-tools`, draft PR into `features/marketplace`.

Nothing here is applied to a hosted database and nothing calls an outside service: e-mails go to the existing queue,
WhatsApp is a link the person opens. Laria never charges, holds money or values gear: every amount on these pages is
what a store offered or a seller asked. Proposed decisions are numbered FD-selling-tools-n; acceptance proposals are in
`selling-tools-acceptance.tsv` (40 cases between GROW-300 and GROW-357, grouped by idea, Not Run).

## Migrations (slot 20261204)

| File | What | Redefines |
| --- | --- | --- |
| `20261204120000_feat_selling_registry.sql` | Eight notification types and six e-mail types (additive), the `selling` key of the e-mail context, a `gear_%` branch on the notification target check, `laria_private.selling_notify`, `laria_private.selling_own_store_id` | none: the checks are extended with `ux_extend_text_check` and a new helper `laria_private.feat_add_check_branch` |
| `20261204120100_feat_gear.sql` | `gear_items`, `gear_reminders`, the purchase trigger and their RPCs | none |
| `20261204120200_feat_trade_offers.sql` | `store_trade_settings`, `listings.accepts_part_payment`, the `trade-photos` bucket, `trade_requests`, `trade_offers` and their RPCs | none |
| `20261204120300_feat_consignment.sql` | `listing_consignments`, its RPCs, and the trigger `listings_selling_consignment_close` | none |
| `20261204120400_feat_price_steps.sql` | `listing_price_steps` and its RPCs, `laria_private.run_listing_price_steps` | none |
| `20261204120500_feat_private_offers.sql` | `listing_private_offers`, recipients, RPCs, `get_listing_selling_tools`, `get_listing_selling_public` | none |
| `20261204120600_feat_selling_jobs.sql` | The daily jobs behind `public.run_selling_job` | none |
| `20261204120700_feat_part_payment_detail.sql` | `part_payment` in the listing-details writer registry, with its writer and copier | none (adds one registry row) |

No shared function is redefined. The batch adds triggers on `listings` (after update of `status`) and on
`verified_transactions` (after insert or update), both new. Direct writes to every new table are revoked; people read
and write through definer functions that check who they are. Suite: `tests/feat-selling-tools.sql`.

## sell-01: Mi equipo

**What changed.** Mi cuenta → **Mi equipo** (`/mi-cuenta/equipo`, Particular accounts) is a private list of what a
person owns: brand, model, category and type, serial number, purchase date, warranty end and a note. A purchase both
sides confirmed (a verified transaction) adds the instrument by itself, once, with the listing's details; anything
else is added by hand. Each item shows its warranty ("Garantía hasta el 12 de marzo", amber in the last 30 days), its
reminder (buy-06) and three actions: **Vender esto** creates a sell draft with the item's details and opens the sell
form (a second tap continues the same draft, and a published listing is linked), **Pedir ofertas a tiendas** (sell-02)
and **Quitar de Mi equipo**. Nobody else sees the list; stores see only what a person sends them in a request.

**Files.** `app/mi-cuenta/equipo/page.tsx`, `nuevo/page.tsx`, `[id]/page.tsx`, `components/gear/gear-item-form.tsx`,
`gear-actions.tsx`, `gear-reminder-panel.tsx`, `lib/selling-tools.ts`, migration `20261204120100`.

- **FD-selling-tools-1.** No estimated value (deferred: it needs typical prices). The serial number is stored as typed
  and as `serial_key` (upper-case letters and digits) for accounts' stolen-gear matching; it is never shown to anyone
  else.
- **FD-selling-tools-2.** Mi equipo is for Particular accounts. A store owner who opens it is sent to Ofertas: a
  store's stock lives in Inventario.
- **FD-selling-tools-3.** Up to 200 items per person.

## sell-02: ¿Prefieres vender ya?

**What changed.** A store opts in from **Ofertas → Qué recibimos**: "Compramos usados" with the categories it buys
(guitars, basses, amplifiers, pedals, keyboards; verified stores only). A Particular sees "¿Prefieres vender ya?" on the
sell page (only when stores of their region buy something, with the real categories), on a listing's selling tools
page and on each Mi equipo item. They describe the gear (category, type, brand, model, the condition scale, how it is,
what they hope for), add 2 to 6 photos and see, before sending, how many stores will receive it ("3 tiendas
verificadas de tu región lo verán durante 24 horas"). Every qualifying store of their region (up to 30) gets the request in its inbox, a
notification and an e-mail, and has **24 hours** to send one offer with a note. The person sees the offers side by
side as they arrive and has **3 more days** to choose one, or none. Choosing shares their WhatsApp with that store only
and says "Lleva el equipo a la tienda hasta el <fecha>" (5 days); the other stores are told and their offers close.
The store checks the gear, confirms the final price and pays directly; afterwards it records "Lo compramos, S/ …" or
what happened. Requests nobody chose expire; accepted ones the store never closes are closed 30 days after drop-off.

**Files.** `app/mi-cuenta/equipo/ofertas/*`, `app/mi-cuenta/tienda/ofertas/*` (inbox, request, Qué recibimos),
`components/offers/trade-request-form.tsx`, `trade-request-view.tsx`, `trade-photos.tsx`, `store-trade-offer.tsx`,
`store-trade-settings-form.tsx`, `sell-to-store-prompt.tsx`, `app/api/trade-photos/[...path]/route.ts`, migration
`20261204120200`.

- **FD-selling-tools-4.** The store sees no name or phone until it is chosen; then only that store gets the person's
  WhatsApp, which they confirm on the accept screen.
- **FD-selling-tools-5.** Photos go to a private bucket under `<person>/<request>/<n>.jpg`, uploaded before the request
  is sent (the request id is made in the browser). They are served only through `/api/trade-photos`, after
  `can_view_trade_photo` as the signed-in viewer. Photos of requests never sent go after 2 days; photos of requests
  closed more than 90 days ago go too (the request keeps its text).
- **FD-selling-tools-6.** Limits: 5 open requests per person, 10 a day, descriptions without phone numbers or links.
  "Todavía no hay tiendas…" is said before the person writes anything; a request is never sent to nobody.
- **FD-selling-tools-7.** Which stores receive it: active, verified, same region, the category in their list. No
  ranking, no paid placement.

## sell-03: consignment

**What changed.** A verified store with "Recibimos en consignación" on publishes the gear as an ordinary store listing
(it counts in the store's allowance) and, from the listing's selling tools page, creates a link for the owner, shared
by WhatsApp or copied. The link is shown once and lasts 7 days. The owner (a Particular account) opens it, sees the
listing and the store, and accepts. From then on the listing reads "En consignación en <Tienda>", the owner sees its
views, WhatsApp contacts and saves in Mi equipo, and either side can end it. When the store marks it sold, the owner
gets a notification and an e-mail ("Coordina con ella el pago acordado"); archiving it ends the consignment.

**Files.** `app/mi-cuenta/equipo/consignacion/[token]/page.tsx`, `components/offers/consignment-store-panel.tsx`,
`consignment-accept.tsx`, `consignment-owner-actions.tsx`, `listing-selling-extras.tsx`, migration `20261204120300`.

- **FD-selling-tools-8.** The commission and the payment are agreed between the store and the owner; Laria shows
  neither. Only the link's hash is stored. A stock-managed listing (Inventario) cannot be in consignment.

## run-04: part payment

**What changed.** A store sets a default in Qué recibimos ("Aceptamos equipos como parte de pago") and can override it
per listing on the listing's selling tools page ("Como mi tienda", "Sí", "No"). A listing that accepts it shows
"Aceptamos tu equipo como parte de pago" with **Ofrecer mi equipo**: the buyer picks an item from Mi equipo or
describes it, adds photos and sends it to that store only. The store answers with an estimate within 72 hours ("sujeto
a revisarlo"), the buyer has 7 more days to accept it, and they settle the difference at the store. The flow and the
store inbox are the ones of sell-02, labelled "Parte de pago".

**Files.** `app/mi-cuenta/equipo/parte-de-pago/page.tsx`, `components/offers/part-payment-toggle.tsx`,
`part-payment-field.tsx`, `listing-selling-extras.tsx`, migrations `20261204120200` and `20261204120700`.

- **FD-selling-tools-9.** The setting is `listings.accepts_part_payment` (null follows the store). It is also the key
  `part_payment` of the listing-details writer registry, so a duplicated or relisted listing keeps it and the sell and
  edit forms can send it: `components/offers/part-payment-field.tsx` is the controlled input for those forms (not
  placed yet; see Overlaps).
- **FD-selling-tools-10.** A Particular's "Acepto cambios por…" (sell-06, listing-details) is a different thing and
  stays as it is.

## sell-04: Bajada automática

**What changed.** On a listing's selling tools page (Mis publicaciones → **Herramientas de venta**), the owner sets a
price floor (below the price and at least 20 % of it), 5 % or 10 % per step and every 7 or 14 days, and whether to
skip a step when someone wrote by WhatsApp since the last one (on by default). The page shows the steps before saving
("Así iría: S/ 2,000 → S/ 1,900 → …"). A daily job lowers due prices in whole soles, never below the floor; each step
is an ordinary price change, so people who saved the listing get the usual price-drop alert, and the owner gets a
notification. The rule stops at the floor, when the listing is sold or no longer public, and can be paused, changed or
removed. A paused or out-of-stock listing is skipped.

**Files.** `components/offers/price-steps-panel.tsx`, `app/mi-cuenta/publicaciones/[id]/herramientas/page.tsx`,
migrations `20261204120400` and `20261204120600`.

- **FD-selling-tools-11.** Not for a listing whose price Inventario controls (a store changes it there).
- **FD-selling-tools-12.** Buyers see nothing new: no "the price will drop" banner, no countdown.

## sell-05: Oferta a interesados

**What changed.** On the same page the owner sees how many people saved the listing and can send them one private
price (below the public price, at least 20 % of it) for 1 to 7 days, with an optional short message. Each person who
saved it gets a notification and an e-mail (unless they turned price-drop e-mails off: then only the notification).
On the listing page they see "Oferta para ti: S/ 1,800" with the date it ends and **Pedir este precio por WhatsApp**,
which opens the listing's usual WhatsApp with a message quoting the offer. The public price does not change. Once per
listing per 7 days; the owner can withdraw it.

**Files.** `components/offers/private-offer-panel.tsx`, `listing-selling-extras.tsx`, migration `20261204120500`.

- **FD-selling-tools-13.** The e-mail follows the price-drop choice and its one-click link is "No más bajas de
  precio": it is the same kind of news for the same people.
- **FD-selling-tools-14.** The owner and the listing's store owner are never recipients.

## buy-06: ¿Toca cambiar cuerdas?

**What changed.** A Mi equipo item whose type uses strings, reeds or drumheads offers one reminder ("Cada 3 meses",
1 to 12 months, from the date of the last change). It is off until the person turns it on. When due, a daily job sends
one notification and one e-mail ("¿Toca cambiar las cuerdas de tu Fender Telecaster?") naming up to three active
stores of the person's region that said they sell them (their city first, verified first). **Ya las cambié hoy** moves
the next date; **Dejar de recordar** stops it; the e-mail's "No más recordatorios" stops every reminder in one click.
Stores declare the consumables they sell in Qué recibimos.

**Files.** `components/gear/gear-reminder-panel.tsx`, migrations `20261204120100` and `20261204120600`,
`lib/email/links.ts` (`no_gear_reminders`).

- **FD-selling-tools-15.** Stores are listed by region and city only, never paid placement.

## Jobs

Each is `GET /api/internal/jobs/<name>` with `Authorization: Bearer $CRON_SECRET` (`lib/selling-jobs.ts`), one call to
`public.run_selling_job` (service role only), idempotent and safe to run more than once a day.

| Route | Does | Suggested schedule |
| --- | --- | --- |
| `/api/internal/jobs/price-steps` | sell-04 due steps, up to 200 a run | daily, 14:00 UTC (9:00 Lima) |
| `/api/internal/jobs/gear-reminders` | buy-06 due reminders, up to 500 a run | daily, 15:00 UTC (10:00 Lima) |
| `/api/internal/jobs/trade-offers` | expires unanswered requests, closes stale accepted ones, removes unused photos | daily, any hour; hourly is fine |

Environment variables: only the existing `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` and the e-mail settings. No Vercel
setting was changed.

## Changes to other batches' and shared files

- `lib/account-navigation.ts`: "Mi equipo" (Particular) and "Ofertas" (store) in marked blocks; four navigation tests
  list them (`account-shell`, `sprint-9`, `ux-shell`, `store-ops-review-ux`).
- `lib/notifications.ts`: eight labels and `sellingNotificationHref`, marked.
- `lib/email/templates.ts`: six cases in `sellingTemplate`, two optional types, `whyText` lines, marked.
- `lib/email/links.ts`, `lib/email/marketplace-email.ts`, `app/api/email/unsubscribe/route.ts`: the
  `no_gear_reminders` action, which calls `stop_gear_reminders_by_link` (the shared `apply_email_link_action` is not
  redefined).
- `lib/listing-details.ts`: the `part_payment` check in the marked block.
- `app/instrumentos/[slug]/page.tsx`: one import and `<ListingSellingExtras …>` after the contact module.
- `app/mi-cuenta/publicar/page.tsx`: one import and `<SellToStorePrompt …>` above the form (not when continuing a
  draft).
- `app/mi-cuenta/tienda/page.tsx`: a "Qué recibimos" link in a marked block.
- `components/listing-management-table.tsx` and `lib/my-listings.ts` (owned): tags and "Herramientas de venta".
- `docs/database.md`, `docs/functional-spec.md`: marked sections.

## Overlaps for other batches

- **Listing forms.** `PartPaymentField` (`components/offers/part-payment-field.tsx`) is ready for the store sell form
  and the edit form, sending `details.part_payment`. It is not placed: the forms have no details section yet.
- **Stolen gear (accounts).** `gear_items.serial` and `serial_key` are there to read; this batch does no matching.
- **WhatsApp messages (deal-trust).** The private offer message lives in `lib/selling-tools.ts`, not in
  `lib/contact-message.ts`, and replaces only the text of the listing's own WhatsApp link.
- **Mi tienda (store-floor).** One link in a marked block; the settings themselves live in Ofertas → Qué recibimos.

## How to test

1. `bash /mnt/project-files/store-operations/local-db-setup/setup-local-db.sh reset .` then `test .`
   (`tests/feat-selling-tools.sql`), and `pnpm test` (`tests/feat-selling-tools.test.cjs`).
2. Prototype (`bash scripts/prototype/start-docker-free.sh seed`, then
   `psql "postgresql://postgres@127.0.0.1:54322/postgres" -f scripts/prototype/selling-tools-seed.sql`, which makes the
   buyer save the Particular's Squier, and `pnpm dev`), as a Particular (`particular@laria.test`):
   Mi cuenta → Mi equipo → add a guitar with a serial and warranty, turn on the strings reminder, "Vender esto".
3. As a verified store owner: Ofertas → Qué recibimos → "Compramos usados" (Guitarras), consignment, part payment,
   Cuerdas. Back as the Particular: Mi equipo → "Pedir ofertas a tiendas" with two photos. As the store: Ofertas → the
   request → send an offer. As the Particular: choose it. As the store: "Contactar por WhatsApp", then record the result.
4. Mis publicaciones → Herramientas de venta on an approved listing: set a floor, send an offer to people who saved it.
   Run the jobs locally: `select public.run_selling_job('price-steps')` as `service_role`, or call the route with
   the local `CRON_SECRET`.
5. A store listing → Herramientas de venta → consignment link; open it as the Particular and accept; the listing page
   shows "En consignación en …".

Screens: `/mnt/project-files/feature-ideas/screens/selling-tools/` (390 px and 1366 px).

## Limitations

- No estimated value in Mi equipo (deferred).
- Part payment is set on the selling tools page and in Qué recibimos; the sell and edit forms do not show it until
  `PartPaymentField` is placed.
- Trade requests are by region only (no distance), and a region with no buying store gets no request.
- Stores cannot stop the e-mail of a single request; they turn "Compramos usados" off in Qué recibimos.
- The jobs have no schedule until one is configured (`CRON_SECRET` plus the routes above).
- The store inbox lists the requests of the last 60 days.

## Copy that needs legal review

- sell-02 and run-04: "Laria no compra ni paga: la tienda revisa el equipo, confirma el precio final y te paga
  directamente." "Al elegirla, <Tienda> verá tu nombre y tu WhatsApp, tú verás su dirección…" The privacy policy should mention that the
  person's WhatsApp goes to the store they choose, and that request photos are kept until 90 days after the request
  closes.
- sell-03: "La comisión y el pago los acuerdan ustedes; Laria no interviene." and the consignment accept screen.
- sell-05: "Oferta para ti … el precio publicado sigue en …" (a private price is not a public discount).
- buy-06: stores named in reminders ("Las tienen: …") are listed by region, not endorsed.
