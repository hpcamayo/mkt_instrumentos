# Feature ideas: deal-trust batch

Ideas safe-03 («Encuentro seguro» and «Punto seguro Laria»), safe-06 (review photos), safe-07 («Comprador con
historial»), safe-11 («Historial en Laria»), sell-08 («Vendedor destacado» / «Tienda destacada»), sell-09 (the seller
page) and reach-11 («Compra en tienda verificada»). All seven were marked Yes by Henri on 2026-10-26. Branch
`claude/project-thread-hdmpd5`, PR into `features/marketplace`.

Nothing here is applied to a hosted database. Proposed decisions are numbered FD-deal-trust-n; acceptance proposals are
in `deal-trust-acceptance.tsv` (GROW-200 to GROW-238, Not Run). Laria still never charges, holds money, checks an
instrument or guarantees a deal, and every new screen says so where it matters.

## Migrations (slot 20261203)

| File | What | Redefines |
| --- | --- | --- |
| `20261203100000_feat_trust_foundation.sql` | Helpers `laria_private.extend_or_check` and `patch_function_text`; eight notification types; `trust_notify_once`, `trust_first_name` | none |
| `20261203100100_feat_counter_purchases.sql` | Counter sale codes, `verified_transactions.counter_sale_id`, claim and lists (reach-11) | none |
| `20261203100200_feat_review_photos.sql` | Private bucket `review-photos`, `transaction_review_photos`, moderation (safe-06) | none |
| `20261203100300_feat_seller_pages.sql` | `seller_pages`, `seller_levels`, `buyer_track_records` (sell-09, sell-08, safe-07) | none |
| `20261203100400_feat_listing_provenance.sql` | `listing_provenance` (safe-11) | none |
| `20261203100500_feat_safe_meetups.sql` | `store_safe_spots`, the page reads `get_listing_trust` / `get_store_trust`, the nightly job (safe-03) | none |
| `20261203110000_feat_trust_patch_submit_transaction_review.sql` | Counter purchases notify `store_counter_review_revealed` | patches `public.submit_transaction_review` |
| `20261203110100_feat_trust_patch_get_reputation.sql` | Review items gain `photos` | patches `public.get_reputation` |
| `20261203110200_feat_trust_patch_get_public_review_page.sql` | Review items gain `photos` | patches `public.get_public_review_page` |
| `20261203110300_feat_trust_patch_get_admin_domain_page.sql` | Admin > Reseñas shows counter-purchase reviews | patches `public.get_admin_domain_page` |
| `20261203110400_feat_trust_patch_get_admin_moderation_queue.sql` | Reported counter-purchase reviews reach the queue | patches `public.get_admin_moderation_queue` |
| `20261203110500_feat_trust_patch_get_account_pendientes.sql` | Pending counter-purchase reviews on the account home | patches `public.get_account_pendientes` |
| `20261203110600_feat_trust_patch_publish_held_review.sql` | A held counter-purchase review that Admin publishes notifies `store_counter_review_revealed` (launch audit A17) | patches `public.publish_held_review` |

- **FD-deal-trust-1.** Shared functions are patched, not copied. `laria_private.patch_function_text(fn, old[], new[])`
  reads the live definition (`pg_get_functiondef`), replaces each exact piece and raises unless every piece occurs
  exactly once; the result is executed as the same `create or replace`, so owner and grants stay. Each patch is alone
  in its own migration. If another batch changes one of these functions first, the patch either still applies (its
  anchors are intact) or stops the migration with "matched 0 times", never silently overwriting the other change.
  `laria_private.extend_or_check(table, constraint, branch)` adds one `or` branch to a check constraint once (it
  normalizes the branch through a scratch `not valid` constraint, so running it again is a no-op). The accounts batch
  also touches `get_admin_moderation_queue` and `get_account_pendientes`; whichever merges second must keep the left
  join described below.

## reach-11: «Compra en tienda verificada»

**What changed.** After "Registrar venta" in the Mostrador (sales channel Tienda física), the notice offers "Mostrar
código al cliente". It opens a sheet with a QR, a link to copy or send by WhatsApp and the sale's lines. The customer
scans it, signs in or creates an account (`/compra-en-tienda/<code>` keeps them on the page through `next=`), sees
"Compraste en <Tienda>: <items>" and confirms "Sí, compré en <Tienda>". That creates a verified transaction for the
store with the usual double-blind reviews (10 days). The Mostrador sheet notices the confirmation within a few seconds
("Carlos C. confirmó la compra"). Both sides find it in Compras y ventas, tagged "En tienda", and the store's reviews
count it.

**Files.** `supabase/migrations/20261203100100_feat_counter_purchases.sql`, the patches `…110000`, `…110300` to
`…110500`, `components/trust/counter-purchase-code.tsx`, `components/trust/claim-counter-purchase.tsx`,
`app/compra-en-tienda/[token]/page.tsx`, `components/inventory/counter.tsx`,
`app/mi-cuenta/tienda/inventario/mostrador/page.tsx`, `app/mi-cuenta/transacciones/*`, `components/transaction-center.tsx`,
`components/transaction-detail.tsx`, `lib/transactions.ts`.

- **FD-deal-trust-2.** This changes two earlier rules on purpose, as the idea asked: V1's "only a WhatsApp contact
  becomes a verified buyer" (a customer who confirms a counter code is one too) and store operations D-12 "stock sales
  never unlock reviews" (a stock movement still creates nothing; only the customer's confirmation does). A counter
  purchase has no claim and no publication: `verified_transactions.claim_id` and `listing_id` became nullable, with a
  check that a row is either listing-based (both set) or a counter sale (`counter_sale_id` set, store seller).
- **FD-deal-trust-3.** A code belongs to one Mostrador sale, works once and expires 24 hours after the sale. Showing
  it again replaces the previous QR; "Cerrar sin confirmar" cancels it; undoing the sale cancels it. Only the SHA-256
  of the code is stored. Once the customer confirmed, the sale can't be undone from the Mostrador (a return is recorded
  as a return), so the transaction and its reviews stay.
- **FD-deal-trust-4.** Limits against a store confirming its own sales: never at one's own store, one counter purchase
  per store per customer a day, five a day in all. Admin > Confianza > Compras en tienda lists the latest ones with how
  many times the same customer confirmed at the same store in 30 days. Readers that joined each transaction to its
  publication were checked; four now left-join it and title such a row "Compra en tienda · <Tienda>". Counter purchases
  get their own review reminder (two days before the end, nightly job) because `run_my_listings_reminders` joins
  publications.
- **FD-deal-trust-5.** The QR is drawn with store-floor's encoder (`lib/labels/qr.ts`, byte mode, level M, versions 1
  to 10), with no library. This batch's unit tests decode its output with an independent decoder (format and version
  words, finder and timing patterns, Reed-Solomon syndromes, data), so the claim link is checked end to end.

**How to test.** As `demo-tienda@laria.test`, Mi tienda > Inventario > Mostrador: add `BOSS-DS1`, "Registrar venta",
"Mostrar código al cliente". Open the link in another browser, sign in as `comprador@laria.test`, confirm. Check the
Mostrador sheet, both accounts' Compras y ventas, the review form, a second confirmation at the same store the same day
(refused) and Admin > Confianza > Compras en tienda. `tests/feat-deal-trust.sql` covers limits, expiry, replacement,
undo and that the transaction appears everywhere a review can.

**Defaults.** 24-hour code, 1 per store per customer a day, 5 a day, poll every 4 seconds while the sheet is open.

## safe-06: review photos

**What changed.** A buyer reviewing the seller can add up to three photos of what they received ("Fotos de lo que
recibiste", optional). Each photo goes through the listing photo preparation (redrawn as a JPEG of at most 2400 px, so
EXIF and GPS never leave the phone), uploads to the private `review-photos` bucket and waits for Admin. A photo shows
under its review (listing, store and seller pages, "Ver más reseñas") only when Admin approved it and the review itself
is visible. The buyer sees each photo's state ("En revisión", "Publicada", "No se publicó") on the transaction page and
can add missing ones for a day after sending.

**Files.** `…100200_feat_review_photos.sql`, patches `…110100` and `…110200`, `app/api/review-photos/[id]/route.ts`,
`components/trust/review-photos.tsx`, `components/trust/review-photo-strip.tsx`, `components/listing/review-list.tsx`,
`components/transaction-detail.tsx`, `app/admin/confianza/page.tsx`, `components/trust/admin-trust-actions.tsx`.

- **FD-deal-trust-6.** Photos only on the buyer's review of the seller, pre-moderated, never public by default. Uploads
  are allowed only to `<buyer>/<transaction>/<uuid>.jpg` of the caller's own purchase while its review window is open,
  at most twelve objects per purchase. Admin approves or hides (with a reason), audited as `review_photo_*`.
- **FD-deal-trust-7.** The image is served by `/api/review-photos/<id>`, which asks `get_review_photo_object` with the
  visitor's session who may see it; public photos are cached five minutes, others never; responses carry `nosniff`,
  a sandboxing CSP and `no-referrer`. Uploads never attached to a review are removed by the nightly job after two days.

**How to test.** Confirm a purchase (above), pick a photo in the review form and send. Admin > Confianza > Fotos de
reseñas: approve. The photo appears under the review once both reviews are in or the window closed. The seeded
amplifier review already has an approved photo (`/vendedores/<Lucía's page>`).

## sell-09: the seller page

**What changed.** Every Particular who has published gets `/vendedores/<first-name>-<6 random characters>`: first name,
city, member since, buyers who confirmed a purchase (launch audit A17), the level mark, reviews (with photos) and active publications. The listing page's
seller card and "Más de este vendedor" link to it ("Ver perfil"). Compras y ventas > "Tu perfil en Laria" shows the
link, copy and WhatsApp buttons and "Ocultar mi página".

**Files.** `…100300_feat_seller_pages.sql`, `app/vendedores/[slug]/page.tsx`, `components/trust/listing-trust.tsx`,
`components/trust/account-trust.tsx`, `components/listing/seller-card.tsx` (a `trust` slot),
`app/instrumentos/[slug]/page.tsx`.

- **FD-deal-trust-8.** A person's page is `noindex` and stays out of the sitemap: it is for the people they send it
  to. It never shows a phone, surname, e-mail or anyone they sold to. The slug does not spell out the person (first
  name plus random characters). Hiding it stops the page and the "Ver perfil" links at once; the publications stay.

## sell-08: «Vendedor destacado» and «Tienda destacada»

**What changed.** A mark next to the seller on listings, the seller page and the store page, with "¿Por qué?" listing
the public criteria. Nobody applies and nobody pays: the nightly job grants it and takes it away, and sends a notice
either way. Compras y ventas shows the seller's progress on each criterion.

**Files.** `…100300_feat_seller_pages.sql` (`seller_levels`, `refresh_seller_levels`), `components/trust/seller-level-mark.tsx`,
`components/trust/account-trust.tsx`, `app/api/internal/jobs/deal-trust/route.ts`, `lib/notifications.ts`.

- **FD-deal-trust-9.** Criteria: at least 5 buyers who confirmed a purchase (launch audit A17: each buyer once, only once
  their account is a week old with a confirmed e-mail, `laria_private.counted_buyers`), at least 3 visible reviews from
  buyers averaging 4.5 or more, no report upheld in the last 90 days, no public question left unanswered for more than 7
  days (questions up to 90 days old), and for a store, the store is active. They live only in `seller_level_facts` and
  `seller_level_meets`.
- **FD-deal-trust-10.** Stores get the same mark as «Tienda destacada», counting both listing purchases confirmed
  through WhatsApp and counter purchases (reach-11), which are how most of a store's sales can become verified.

## safe-07: «Comprador con historial»

**What changed.** Off by default. In Compras y ventas the buyer can turn on a small card (`/comprador/<code>`): first
name, buying in Laria since, verified purchases and the average rating sellers gave them. Once on, a chip
"Incluir mi historial de comprador" under the quick questions adds one line to the WhatsApp message:
"Compro en Laria desde 2026 · 3 compras verificadas: <link>". The buyer can take it out for any listing. Without a
verified purchase there is nothing to show and the chip doesn't appear.

**Files.** `…100300_feat_seller_pages.sql` (`buyer_track_records`), `app/comprador/[token]/page.tsx`,
`components/trust/track-record-chip.tsx`, `components/trust/track-record-state.ts`, `lib/contact-message.ts`
(`trackRecordLine`, `buyerCardUrl`), `components/whatsapp-contact-link.tsx`.

- **FD-deal-trust-11.** Turning it on is consent shown in a sheet ("Nunca muestra tu teléfono, tu correo ni qué
  compraste…"). Each time it is turned on the card gets a new address, so links shared before turning it off stay
  dead. The card is `noindex` with `no-referrer`.
- **FD-deal-trust-12.** The card shows the average of the ratings sellers gave the buyer, which V1 kept private. Only
  the average and only with this opt-in; the comments stay private.
- **FD-deal-trust-13.** Once on, the line is included by default in every WhatsApp message to a seller or store (the
  first contact and "Solicitar compra" alike) and can be removed per listing with the chip.

## safe-11: «Historial en Laria»

**What changed.** Someone who bought through a verified transaction (not a counter purchase) and later publishes the
same instrument can link the new publication to that purchase from the transaction page. The publication then shows
"Historial en Laria": "Comprado en Laria en mayo de 2026 · 1 dueño anterior en Laria" and the original publication's
specs.

**Files.** `…100400_feat_listing_provenance.sql`, `components/trust/provenance-link.tsx`,
`components/trust/listing-trust.tsx` (`ListingProvenance`), `components/transaction-detail.tsx`.

- **FD-deal-trust-14.** Only the new owner links, which is their consent; the purchase and the publication must both
  be theirs, one publication per purchase. Nothing about the previous seller (name, city, the old publication's
  address) is shown.
- **FD-deal-trust-15.** Previous owners are counted by following earlier links, at most ten. Unlinking is immediate.

## safe-03: «Encuentro seguro» and «Punto seguro Laria»

**What changed.** On a Particular's publication, under the contact button, "Encuentro seguro" opens a sheet: the
stores in the same city (then region) that offer themselves as «Punto seguro Laria», a short list of large shopping
centers, the nearest police station (each a map search), "Avisar a alguien" (place, day and time become a WhatsApp
message to a friend with the publication and the seller's first name) and "Qué revisar al probarlo" (the type's
try-out checklist from the discovery batch's guides, or the new section of Consejos de seguridad). In Mi tienda, a
verified, active store that shows its street address can turn on «Punto seguro Laria» with a short note; its page then
shows the mark. Admin can turn a spot off with a reason (the store is notified and can't turn it back on until Admin
allows it). Consejos de seguridad has a new section "Si se encuentran en persona".

**Files.** `…100500_feat_safe_meetups.sql`, `components/trust/safe-meetup.tsx`, `lib/safe-meetup-places.ts`,
`lib/contact-message.ts` (`meetupNoticeMessage`, `meetupWhen`, `shareTextUrl`), `components/trust/safe-spot-mark.tsx`,
`components/trust/safe-spot-settings.tsx`, `app/mi-cuenta/tienda/page.tsx`, `components/store/store-header.tsx` (a
`trust` slot), `app/tiendas/[slug]/page.tsx`, `app/consejos-de-seguridad/page.tsx`, `components/legal-page.tsx`.

- **FD-deal-trust-16.** Only on Particulars' publications that are not sold; a store's own address is already on its
  page. The copy never promises safety: "Laria no revisa estos lugares ni a las personas, y no puede garantizar cómo
  resulta un encuentro."
- **FD-deal-trust-17.** The public places are a hand-picked list per city in `lib/safe-meetup-places.ts` (Lima, Callao,
  Arequipa, Trujillo, Chiclayo, Piura, Cusco, Huancayo), opened as map searches, never fixed addresses. Someone in Lima
  should confirm the names before launch. Laria has no agreement with these places.
- **FD-deal-trust-18.** A store can be a spot only while active, verified and showing its street address; the check
  runs again on every read, so a store that hides its address drops out at once.

## The nightly job

`GET /api/internal/jobs/deal-trust` with `Authorization: Bearer $CRON_SECRET`, once a day (02:30 Lima suggested). It
calls `run_deal_trust_nightly` (levels, counter-purchase review reminders) and removes up to 200 unattached review
photo uploads. Every step deduplicates, so running it twice is harmless. There is no pg_cron job; the integrator
collects schedules for Henri. Env: `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (the route and the photo route fail
closed without them: 401, 503 or 404).

## Changes to other batches' and shared files

All small and marked with a deal-trust comment where they are not obvious:

- `components/listing/seller-card.tsx`, `components/store/store-header.tsx`: an optional `trust` slot.
- `app/instrumentos/[slug]/page.tsx`: the chip, the meetup entry, the seller marks, the history card, "Ver perfil" in
  "Más de este vendedor".
- `app/tiendas/[slug]/page.tsx`: the store's marks in the header (not in preview).
- `components/whatsapp-contact-link.tsx`: appends the track record line to the chosen questions.
- `components/listing/review-list.tsx`: the photo strip under a review. `lib/listing-page.ts`: `ReviewItem.photos`.
- `lib/transactions.ts`, `components/transaction-center.tsx`, `components/transaction-detail.tsx`,
  `app/mi-cuenta/transacciones/*`: counter purchases, photos, provenance, "Tu perfil en Laria".
- `components/inventory/counter.tsx`, `app/mi-cuenta/tienda/inventario/mostrador/page.tsx`: the code offer after a
  sale; the Mostrador note now says how a sale becomes a verified purchase.
- `app/mi-cuenta/tienda/page.tsx`: the Punto seguro card after the discovery card.
- `app/consejos-de-seguridad/page.tsx`, `components/legal-page.tsx` (an optional section `id`).
- `lib/notifications.ts`: labels and links for the eight new types. `components/admin-navigation.tsx`: "Confianza".
- `lib/contact-message.ts` (owned by this batch per the build plan): the track record line and the meetup message.

## Overlaps for other batches

- **store-floor:** the Mostrador sale QR uses `qrModules` and `qrSvgPath` from `lib/labels/qr.ts` (FD-deal-trust-5).
- **accounts:** `get_admin_moderation_queue` and `get_account_pendientes` are patched here (left join to listings).
- **discovery:** the meetup sheet uses `guidesForListing()` for "Qué revisar al probarlo".
- **selling-tools:** a "Ver mi página" line in Mis publicaciones was left to that batch (see Limitations).
- Anyone joining `verified_transactions` to `listings`: use a left join, counter purchases have no publication.

## How to test

1. `bash /mnt/project-files/store-operations/local-db-setup/setup-local-db.sh reset` then `… test`
   (`tests/feat-deal-trust.sql` among the suites).
2. `bash scripts/prototype/start-docker-free.sh seed`, then the discovery and deal-trust seeds
   (`scripts/prototype/README.md` § Deal-trust), `pnpm dev`.
3. Follow each idea's "How to test" above with the demo accounts. Screenshots at 390 and 1366 px:
   `/mnt/project-files/feature-ideas/screens/deal-trust/`.
4. `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## Limitations

- A sale queued offline in the Mostrador gets no code: the offer appears only after a sale the server recorded, and
  only while the page is open (a code can't be shown again from the sale history).
- The seller page link is in Compras y ventas, not yet in Mis publicaciones (selling-tools owns that page).
- Approved photos are cached up to five minutes, so hiding one can take that long to disappear everywhere.
- Levels and counter-purchase reminders run only when the job route is scheduled; until then nobody earns a mark.
- At 390 px the listing page scrolls sideways by about 40 px because of the "Relacionados" row (`.snap-x` scroller),
  on `features/marketplace` too; not changed here.

## Copy that needs legal review

- The meetup sheet: "Laria no revisa estos lugares ni a las personas, y no puede garantizar cómo resulta un encuentro."
  and the Punto seguro explanation ("La tienda no revisa el instrumento, no recibe pagos y no participa en el trato…").
- Consejos de seguridad: the new section "Si se encuentran en persona" and the paragraph on «Vendedor destacado»,
  «Tienda destacada» and review photo moderation.
- The counter purchase notice: "La tienda registró esta venta en su mostrador y tú la confirmaste con el código de la
  tienda. No verifica pago, garantía, autenticidad ni condición." and the Mostrador note.
- The buyer card consent and the card itself (it shows the average rating sellers gave, FD-deal-trust-12).
- The seller page's closing line and the level's "¿Por qué?" text.
- "Laria las revisa antes de mostrarlas. Evita que se vean rostros, documentos o placas." (review photos).
