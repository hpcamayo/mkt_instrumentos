# Effortless Laria maybes: "Reservado" and "Hacer una oferta" (talk-06, talk-07)

Two of the five ideas Henri left as "maybe" on the approval page; he said "go ahead" in the Quality-of-life thread on
2026-10-27, read as yes to building all five. Branch `ux/maybes-reservado`, migration slot 20261120100000, acceptance
range EASE-800 to EASE-829 (proposed in `maybes-reservado-acceptance.tsv`, Not Run). Screenshots:
`/mnt/project-files/ux-ideas/screens/maybes/reservado/`. Nothing here is applied to a hosted database.

## talk-06 "Reservado"

### What changed

A Particular seller who agreed to hold an instrument for a buyer can say so, so other buyers stop asking whether it is
still available, and the seller is asked afterwards whether it sold.

- **Reserving** (Mis publicaciones): a published listing has "Reservar"; it opens "¿Por cuántos días la reservas?" with
  1 día, 2, 3 and 5 días and Cancelar. One tap reserves from now; the toast reads "Reservada hasta el jueves 29 de
  octubre a las 6:30 p. m.". The row then shows the tag "Reservada hasta el jue 29 oct.", how many people asked to be
  told ("2 personas pidieron que les avisemos si se libera."), and "Cambiar reserva" (a new period replaces the old one)
  and "Quitar reserva" (it is free again now, and the people waiting hear so).
- **The listing page**: the stock tag "Reservado" next to the title and the line "Quien vende lo reservó para otra
  persona hasta el jueves 29 de octubre a las 6:30 p. m. Puedes pedir que te avisemos si se libera, o escribirle igual."
  "Avísame si se libera" becomes the main action; the WhatsApp button stays as the secondary one, and its message reads
  "… Vi que está reservado. Si se libera, ¿me avisas?". Signed-out visitors get "Ingresa para que te avisemos si se
  libera", which comes back to the listing; the owner sees no alert button.
- **Cards**: the catalog (`/listados`), the category pages and "Ver 24 más" show the "Reservado" badge on reserved
  cards. The read is optional, like the catalog's counts: the recovery switch skips it, it gives up at the optional
  budget, and three failures in ten seconds pause it for thirty; without it the cards show no badge.
- **The end of the period**: a job runs every minute. When a period runs out, the badge goes and the seller gets one
  "¿Se vendió «título»?" (in-app notification, e-mail "¿Se vendió “título”?" with "Responder", and a Pendientes item on
  the account home with "Sí, se vendió" and "No, sigue disponible"). Mis publicaciones shows "Terminó la reserva · ¿Se
  vendió?" with "Se vendió", "Sigue disponible" and "Reservar otra vez", and hides "Marcar vendida" (the same action).
  - "Se vendió" (after a confirmation) is the ordinary sold flow and opens the buyer choice
    (`/mi-cuenta/transacciones/<id>`); the people waiting hear "Se vendió: …" in the app.
  - "Sigue disponible" counts as the seller's availability confirmation (mine-08), and the people waiting hear "Ya no
    está reservado: …" in the app and by e-mail.
  - No answer 24 hours after the end: the listing reads as available again, the people waiting hear so, and the
    Pendientes item goes.
- **The people waiting** hear once, then their request ends. A listing that leaves Published (sold from anywhere,
  hidden, archived, hidden by an admin) takes its period with it within a minute: if it sold the people waiting hear it
  in the app; otherwise their requests end quietly.
- **Cached pages** (launch audit A19): starting, changing or ending the period of a shown listing records a page change,
  so the listing page and the cards follow within a minute. The manage route also refreshes the listing's page at once.
- **Privacy**: who the listing was held for is never recorded. The seller sees how many people wait, never who.
  Anonymizing an account removes its requests (launch audit A20).

### Files

- `supabase/migrations/20261120100000_ux_maybes_reservado.sql`: tables, functions, the job, the page-change and
  anonymization triggers, the two e-mail kinds' age and priority, the three event types.
- `lib/listing-reservations.ts`: every call to the feature (until the generated types know it), parsers, the period and
  its words in Lima. `lib/listing-reservations-server.ts`: `reservedCardIds` for public lists of cards.
- `app/api/listings/[id]/manage/route.ts`: actions `reserve {days}` and `end_reservation {outcome: "available" | "sold"}`.
- `app/api/listing-viewer/route.ts`: `POST {listingId, reserved: true}` adds `releaseWatching`; `PUT {listingId, watch,
  kind: "release"}` turns "Avísame si se libera" on or off.
- `app/instrumentos/[slug]/page.tsx`, `components/listing/listing-viewer.tsx` (`ReleaseAlert`),
  `components/listing/contact-module.tsx` (`reserved`), `lib/contact-message.ts`, `lib/listings.ts`
  (`buildWhatsAppUrl(listing, {reserved})`), `lib/ui/status.ts` (stock `reserved`).
- `components/listing-card.tsx` (`reserved`), `components/catalog-view.tsx`, `components/catalog-load-more.tsx`,
  `app/api/catalog/page/route.ts` (`{listings, reserved}`), `lib/catalog-guard.ts`, `docs/operations/catalog-recovery.md`.
- `app/mi-cuenta/publicaciones/page.tsx`, `components/listing-management-table.tsx` (`canReserve`, `ReservationPicker`),
  `lib/my-listings.ts` (`reservation`, `rowActions(…).reserve`), `app/mi-cuenta/page.tsx`, `lib/pendientes.ts`,
  `components/pendientes-list.tsx`, `lib/notifications.ts`, `lib/email/templates.ts`.
- Tests: `tests/maybes-reservado.sql`, `tests/maybes-reservado.test.cjs`, two cases in `tests/catalog-recovery.test.cjs`;
  `tests/launch-audit-page-refresh-locks.integration.cjs` now counts only the A19 migration's own triggers.

### How to test

1. `LARIA_PGDATA=… LARIA_PGPORT=… bash scripts/local-db/setup-local-db.sh reset`, then
   `psql -h 127.0.0.1 -p <port> -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null -f tests/maybes-reservado.sql` and
   `LARIA_PGPORT=<port> bash scripts/local-db/run-db-integration.sh`.
2. `node --require ./tests/setup-alias.cjs --test tests/maybes-reservado.test.cjs tests/catalog-recovery.test.cjs`.
3. In the app with the demo data: as particular@laria.test open Mis publicaciones, press "Reservar" on a published
   listing and pick 2 días. Open the listing as comprador@laria.test (the tag, the line, "Avísame si se libera") and in
   the catalog (the badge). Press "Quitar reserva" as the seller: the buyer's Notificaciones shows "Se liberó una
   reserva". To see the end without waiting, reserve again and run
   `update public.listing_reservations set reserved_at = now() - interval '2 days', reserved_until = now() - interval '1 minute' where listing_id = '<id>';`
   then `select laria_private.run_listing_reservations();`: the seller's account home shows "¿Se vendió «…»?".

### Defaults picked

- Particular listings only. A store holds units through Inventario and purchase requests, so a store listing is
  refused (`RESERVATION_STORE_LISTING`) and the store tables never offer it.
- 1, 2, 3 or 5 days from the tap, not to the end of a day; no free date. A new period replaces a running one and the
  people waiting keep waiting.
- The listing stays public and contactable while reserved; "Hacer una oferta" is hidden on it.
- The end reads as a date and time in Lima ("el jueves 29 de octubre a las 6:30 p. m."), never "mañana", because the
  page is cached and a relative day would be wrong after midnight.
- The badge goes at the end itself; the seller is asked once per period (the key is the listing and the end).
- "Quitar reserva" before the end and "Sigue disponible" after it are the same action and count as an availability
  confirmation; the automatic release after 24 hours does not.
- "Avísame si se libera" is accepted only while the period runs and never on one's own listing.
- Release notices are e-mailed (like "Volvió a estar disponible"); the "sold" notice is in the app only. Both e-mail
  kinds are transactional (no "Elegir qué correos recibo" link): the release lasts two days in the queue with priority 2
  (with the alerts), the seller's question three days with priority 1 (with the reminders).
- The periods live in their own table, not a column of `listings`: features/marketplace redefines
  `public.public_listings` (20261210120500), and `listings` carries the edit triggers.

### Limitations

- The badge is on the catalog, the category pages and "Ver 24 más" only. The home sections, Similares, Comparar and the
  store pages show none (store listings cannot be reserved); the listing page always says it. Descubrir reads it with
  `reservedCardIds` (below).
- Nothing tells the buyer the listing was held for: Laria never knows who that is.
- Once a period closes its row is deleted: there is no history of reservations.
- The job needs pg_cron (`listing-reservations`, every minute), like the other jobs.
- Until the integration migration adds the ten codes below to A13's own-messages list, the error log keeps them as
  "Otro mensaje (no se guarda el texto)"; people see the messages either way.

## talk-07 "Hacer una oferta"

### What changed

On a Particular's published listing with a price, "Hacer una oferta" (secondary, under the quick questions) opens a
sheet: "Precio publicado: S/ 2,000", the field "Tu oferta" in soles, "O elige un monto" with three round amounts under
the price (S/ 1,900, S/ 1,800, S/ 1,700), "Tu mensaje" with the text as it will be sent ("Hola, te ofrezco S/ 1,900 por
tu Fender Stratocaster publicado en Laria: <link>") and the note "Se abre WhatsApp con este mensaje para que lo envíes.
Laria no guarda el monto." "Enviar oferta por WhatsApp" opens WhatsApp the way the main button does: the seller's
number from the page's own link, the one-time safety sheet before a contact from S/ 1,000, and the same recorded
contact. An amount at or over the price says "también puedes escribir sin oferta"; one under 60 % says it "suele
quedarse sin respuesta"; neither blocks. The sheet is a bottom sheet on phones and a centered dialog from 768 px; it
stays open after sending, so the visitor can come back and change the amount.

### Files

- `components/listing/offer-sheet.tsx` (`OfferButton`, the sheet), `app/instrumentos/[slug]/page.tsx` (where it shows).
- `lib/contact-message.ts`: `offerContactMessage`, `offerSuggestions`, `withMessage`.
- `components/whatsapp-contact-link.tsx`: `addQuestions={false}`, so the offer is sent without the quick questions.
- Tests: `tests/maybes-reservado.test.cjs`.

### How to test

1. `node --require ./tests/setup-alias.cjs --test tests/maybes-reservado.test.cjs`.
2. In the app: open a published Particular listing with a price, press "Hacer una oferta", pick an amount, check the
   message, press "Enviar oferta por WhatsApp" (the wa.me link opens with that text). Reserve the listing as its seller:
   the button goes. A store listing never shows it.

### Defaults picked

- Particular listings only (a store's price is its price, and stores have "Solicitar compra"); not on a sold or
  reserved listing, one without a price, or a purchase request.
- "Hacer una oferta" rather than "Ofrecer" (features/marketplace has "Ofrecer mi equipo").
- The amounts are 95, 90 and 85 % of the price rounded down to S/ 100 from S/ 2,000, S/ 50 from S/ 500, S/ 10 from
  S/ 100 and S/ 5 below, without repeats and always under the price.
- The offer replaces the opening message entirely; the quick questions are not added.
- The amount stays in the visitor's message: no request, event or log carries it, and the contact is recorded like the
  main button's (identity and source only).

### Limitations

- Offers cannot be counted apart from other WhatsApp contacts (by design: nothing about them is stored).
- Laria does not know whether the seller accepted; the sold flow and reviews work as for any contact.

## For Descubrir (big-02)

`reservedCardIds(listings: {id, seller_type}[], deadline)` in `lib/listing-reservations-server.ts` returns the ids that
say "Reservado" for a public list of cards; it is optional (recovery switch, budget, breaker) and asks nothing for
store listings. Pass the result to `ListingCard reserved={ids.has(listing.id)}`. Outside a render,
`reservedListingIds(client, ids, signal?)` in `lib/listing-reservations.ts` reads with any client (200 ids a call) and
returns `null` when a read failed.

## For the integration migration (A13)

The functions' own messages, for `laria_private.app_error_own_messages()`:

| Code | Message |
| --- | --- |
| `RESERVATION_AUTH_REQUIRED` | Ingresa a tu cuenta. |
| `RESERVATION_DAYS_INVALID` | Elige 1, 2, 3 o 5 días. |
| `RESERVATION_NOT_OWNED` | No puedes administrar esta publicación. |
| `RESERVATION_STORE_LISTING` | Las tiendas separan unidades desde Inventario. |
| `RESERVATION_NOT_PUBLISHED` | Solo puedes reservar una publicación publicada. |
| `RESERVATION_OUTCOME_INVALID` | Acción no compatible. |
| `RESERVATION_NOT_FOUND` | Esta publicación ya no está reservada. |
| `RELEASE_WATCH_AUTH_REQUIRED` | Ingresa para recibir el aviso. |
| `RELEASE_WATCH_UNAVAILABLE` | Esta publicación ya no está reservada. |
| `RELEASE_WATCH_OWN_LISTING` | Es tu propia publicación. |

No new route: the actions go through `/api/listings/[id]/manage` and `/api/listing-viewer`. New e-mail kinds:
`listing_reservation_ended`, `listing_released`; new notification types: those two and `listing_reservation_sold`. New
schedule: pg_cron `listing-reservations`, every minute. No new environment variable.

## For docs/database.md

```markdown
<!-- ux-effortless:maybes reservado -->
## Effortless Laria maybes: "Reservado" (talk-06)

Migration `20261120100000_ux_maybes_reservado.sql` (not applied to any hosted database). SQL suite:
`tests/maybes-reservado.sql`.

- `public.listing_reservations`: one row per reserved listing (`listing_id` primary key → listings, cascade;
  `reserved_at`; `reserved_until`, at most 5 days after `reserved_at`; `ended_at`, set when the job asked the seller,
  never before `reserved_until`). Partial indexes on `reserved_until` for running and ended periods. RLS on, no
  policies, nothing granted to `anon`/`authenticated`. A row lives while the period runs and, after its end, until the
  seller answers or 24 hours pass.
- `public.listing_release_watches`: "Avísame si se libera" (`user_id` → profiles, cascade; `listing_id` → listings,
  cascade; primary key `(user_id, listing_id)`, index on `listing_id`). RLS on, no policies, no grants.
- Public functions (errors read `RESERVATION_…` or `RELEASE_WATCH_…: mensaje en español`):
  - `get_reserved_listings(p_listing_ids uuid[]) → (listing_id, reserved_until)` (anon, authenticated): the running
    periods of published Particular listings among the first 200 ids.
  - `get_my_listing_reservations() → (listing_id, title, slug, reserved_until, ended_at, watchers)` (authenticated): the
    caller's periods of published listings, running or waiting for an answer, with how many people wait.
  - `set_listing_reservation(p_listing_id uuid, p_days integer) → timestamptz` (authenticated): the owner's published
    Particular listing, 1, 2, 3 or 5 days from now; a new period replaces the old one; marks earlier
    `listing_reservation_ended` notifications read.
  - `end_listing_reservation(p_listing_id uuid, p_outcome text) → integer` (authenticated): `available`
    (`confirm_listing_available`) or `sold` (`set_owned_listing_lifecycle(…, 'sold')`); deletes the period, tells the
    people waiting and returns how many were told.
  - `set_listing_release_watch(p_listing_id uuid, p_watch boolean) → boolean` and
    `get_listing_release_watch(p_listing_id uuid) → boolean` (authenticated): only while the period runs, never on
    one's own listing.
- `laria_private.run_listing_reservations() → jsonb {closed, asked, released}`, pg_cron `listing-reservations` every
  minute: closes the periods of listings that left `approved` (watchers told in the app if sold, otherwise their
  requests deleted); marks run-out periods ended and asks the seller once through
  `ux_notify_once('reservation_ended:<listing>:<end>', …, 'listing_reservation_ended', …)` (notification and e-mail);
  deletes periods ended 24 hours ago and tells the people waiting. `laria_private.tell_release_watchers(listing,
  'released' | 'sold')` deletes the requests and writes `listing_released` (with an e-mail, key `released:<notification>`)
  or `listing_reservation_sold` (in the app) notifications.
- Event types added with `ux_extend_text_check`: notifications `listing_reservation_ended`, `listing_released`,
  `listing_reservation_sold`; e-mail deliveries `listing_reservation_ended`, `listing_released`.
  `laria_private.email_max_age` / `email_priority`: `listing_released` 2 days, priority 2; `listing_reservation_ended`
  3 days, priority 1.
- Launch audit A19: statement triggers `listing_reservations_public_page_changes_{insert,update,delete}` record a page
  change when a shown listing's period starts, changes, ends or closes while running.
- Launch audit A20: trigger `account_anonymizations_release_watches` (before insert on
  `laria_private.account_anonymizations`) deletes the account's requests and adds `release_watches` to the counts.
<!-- /ux-effortless:maybes reservado -->
```

## For docs/functional-spec.md

Under "Listing Lifecycle", after "Sold and relisting":

```markdown
<!-- Effortless Laria maybes (docs/ux-effortless/maybes-reservado.md): Reservado -->
### Reserved listings

A Particular can mark a published listing "Reservado" for 1, 2, 3 or 5 days when they agreed to hold it for a buyer.
It stays public and contactable: the listing page and the catalog cards say "Reservado" with the end date, and a
signed-in buyer can ask "Avísame si se libera". Laria never records who it was held for. When the period ends the
seller is asked once, in the app, by e-mail and in Pendientes, whether it sold: "Se vendió" is the ordinary sold flow,
"Sigue disponible" confirms availability; without an answer it reads as available after 24 hours. The people waiting
are told once, when it is free again or (in the app) when it sold, and their request then ends. Store listings are not
reserved this way; stores hold units through Inventario.
<!-- end maybes: Reservado -->
```

Under "WhatsApp Contact Tracking", after the paragraph on the opening message:

```markdown
<!-- Effortless Laria maybes: Hacer una oferta -->
On a Particular's published listing with a price that is not reserved, "Hacer una oferta" lets the buyer name an
amount in soles (with three round amounts under the price as suggestions) and opens WhatsApp with "Hola, te ofrezco
S/ … por tu … publicado en Laria: <link>". The amount lives only in the buyer's message: Laria records the contact as
any other and never stores the offer.
<!-- end maybes: Hacer una oferta -->
```

## Decisions

- UXD-reservado-1: A Particular can mark a published listing "Reservado" for 1, 2, 3 or 5 days; it stays public and
  contactable, and stores hold units through Inventario instead (talk-06).
- UXD-reservado-2: Reservations live in their own table, reachable only through functions; the public reads running
  periods of published Particular listings, and who a listing was held for is never recorded (talk-06).
- UXD-reservado-3: When a period ends the seller is asked "¿Se vendió?" once (app, e-mail, Pendientes); "Sigue
  disponible" counts as an availability confirmation, and 24 hours without an answer release the listing without one
  (talk-06).
- UXD-reservado-4: "Avísame si se libera" works only while the period runs and notifies once: in the app and by e-mail
  when the listing is free again, in the app when it sold (talk-06).
- UXD-reservado-5: "Hacer una oferta" is offered on Particular listings only; the amount is written into the buyer's
  WhatsApp message and never stored, and the contact is recorded like any other (talk-07).
