# Effortless Laria: integration

How the eight batches of the Effortless Laria program (build plan `/mnt/project-files/ux-ideas/build-plan.md`) came
together on `ux/effortless`. Each batch has its own write-up next to this one; this page records only what changed when
they met: the same idea built twice, a rule two batches needed to share, a file both edited. Proposed decisions are
numbered UXD-integration-n, like the batches' own.

Merge order (by migration slot): find (#27), listing (#24), accounts (#28), selling (#25), my listings (#23), stores
(#26, then the store-columns fix #30), inventory (#29), speed. Integration migration: `20261109120000`.

## UXD-integration-1: one rule for a price drop

- **What met.** The find batch's "Bajaron de precio" order, its home row and the card's "Antes S/" (FIND 10) read every
  recorded drop of the past 30 days. The listing batch's "Antes S/" on the listing page and the card (list-05) shows only
  a real drop: at least 5% below a price the approved listing kept for 7 days, the first "Antes" kept through a second
  drop, cleared by any rise. Both computed a field called `price_dropped_at`, one as a column and one as a function.
- **Decision.** The listing batch's rule everywhere, so a listing never sits under "Bajaron de precio" without the
  "Antes" its page shows, and a raise-then-drop cannot put it there. The find batch's `price_dropped_at` and
  `price_drop_from` computed fields are gone; `public.recent_price_drop_at(listings)` (the real drop's date while it
  shows, else null) gives the order and the home's row. The card uses `visiblePreviousPrice`, like the listing page.
- **Files.** `supabase/migrations/20261101120000_ux_find_search.sql` (the two functions removed),
  `supabase/migrations/20261109120000_ux_effortless_integration.sql`, `lib/catalog.ts`, `lib/home.ts`,
  `lib/listings.ts`, `components/listing-card.tsx`, `lib/supabase/database.types.ts`, `tests/ux-find-search.sql`,
  `tests/ux-home.test.cjs`.

## UXD-integration-2: one Duplicar

- **What met.** Both batches built "Duplicar" on the owner's listing table. The my-listings batch (shop-08) copies the
  listing, photos, specs and text, into a draft and opens it on the edit page, like its "Republicar" (mine-10). The
  selling batch (POST 13) opened the sell form from the listing (`?desde=`) with its category, brand, condition, place,
  description and specs, but never its photos, price or title.
- **Decision.** The full copy. Henri approved shop-08 as "photos, specs and text copied into a new draft", for stores
  that sell many near-identical items, and it behaves like Republicar next to it. Removing a copied photo is one tap;
  adding it back means finding the file again. "Publicar uno parecido" after sending (POST 13) keeps the selling
  batch's rule, because there the next item is a different one. The sell form's `?desde=` start had no other entry
  point, so it is gone.
- **Files.** `components/listing-management-table.tsx` (my-listings' version), `app/mi-cuenta/publicaciones/page.tsx`,
  `app/mi-cuenta/tienda/inventario/page.tsx`, `lib/sell-page-data.ts`, `app/mi-cuenta/publicar/page.tsx`,
  `app/mi-cuenta/tienda/publicar/page.tsx`, `components/sell-listing-form.tsx`,
  `tests/ux-my-listings-management.test.cjs`, EASE-315 and EASE-423.

## UXD-integration-3: one way to add a notice type

- **What met.** Listing, accounts and my listings each add notification and e-mail types to the same two check
  constraints, each with its own helper that reads the allowed values, adds its own and recreates the check. Postgres
  prints a list as `ARRAY['a'::text, …]` when written as `in (…)`, and as `'{a,…}'::text[]` once a helper rewrote it.
  My listings' pattern read the second form as one value, so after the three batches ran in slot order the checks
  allowed only my listings' five types and one nonsense value: every other notification and e-mail would have failed.
- **Decision.** One helper for every batch: the listing batch's `laria_private.ux_extend_text_check(table,
  constraint, column, values)`, which now evaluates the list instead of reading its text, so both forms read the same.
  My listings' `ux_add_check_values` is gone, accounts' two event-type lists use the shared helper (its own reader
  stays for the e-mail context keys), and so does inventory's `store_stock_summary`, whose rebuild expected the
  `ARRAY[` form and stopped the migration on the other one. `tests/ux-effortless-integration.sql` copies each check onto a scratch table and
  inserts every known type, so a batch that drops one fails the suite whatever form the list is printed in.
- **Files.** `supabase/migrations/20261102120500_ux_listing_registry.sql`, `20261103130000_ux_accounts_saving.sql`,
  `20261105120000_ux_my_listings_lifecycle.sql`, `20261105120100_ux_my_listings_reminders.sql`,
  `20261107130100_ux_inventory_undo_and_bulk.sql`, `tests/ux-effortless-integration.sql`, `docs/database.md`.

## UXD-integration-4: "Solicitar compra" with a quantity opens WhatsApp at once

- **What met.** The listing batch made the contact button a plain link to the message the server already wrote, so
  WhatsApp opens on the press and the contact is recorded in the background (talk-03), with the safety sheet first
  when it applies (talk-04). The inventory batch's quantity stepper (stock-23) still opened a blank tab and waited up
  to 0.9 s for the contact route to write the message with the quantity.
- **Decision.** The listing batch's link everywhere. The stepper already rewrites the quantity in the message on the
  page (`withPurchaseQuantity`), so nothing needs the route's answer; the quantity still goes to the route, which
  clamps it as before, and the stepper's button shows the safety sheet like the plain one.
- **Files.** `components/whatsapp-contact-link.tsx`, `components/listing/contact-module.tsx`,
  `components/payment/purchase-request-link.tsx`, `app/instrumentos/[slug]/page.tsx`, `lib/payment-methods.ts`.

## UXD-integration-5: a store types its hours once

- **What met.** The stores batch added the opening hours a store shows on its page (list-12, `stores.opening_hours`).
  The inventory batch added pickup hours for the ready-made WhatsApp replies (stock-05,
  `store_inventory_preferences.pickup_hours`).
- **Decision.** The replies use the pickup hours when the store wrote them, otherwise its opening hours; the pickup
  field says so. Pickup hours can still differ, so the field stays.
- **Files.** `app/mi-cuenta/tienda/solicitudes/page.tsx`, `components/payment/purchase-requests.tsx`.

## UXD-integration-6: what a SKU remembers, shown where it is used

- **What met.** The selling batch's "Datos para publicar" panel (STOCK 09) was meant for the SKU page but rendered
  nowhere, and it carried its own category field next to the inventory batch's "Categoría del SKU" (stock-20), both
  writing the same column.
- **Decision.** The SKU page shows the panel in Publicación, above "Publicar este SKU", while the SKU has no
  publication (a linked SKU's data is its publication's). The category is edited once, in "Categoría del SKU"; the
  panel follows it to offer the instrument types.
- **Files.** `app/mi-cuenta/tienda/inventario/[itemId]/page.tsx`, `components/inventory/sku-listing-details.tsx`,
  `lib/store-inventory.ts` (`getSkuListingDetails`, also used by the store publish page).

## UXD-integration-7: smaller meetings

- **Seguir in the owner's preview.** The accounts batch's "Seguir" (save-12) sits in the store header; the stores
  batch's owner preview (shop-04) shows a store that is not public. The preview leaves "Seguir" out.
- **One name for the allowance.** My listings' new account home kept the old words for the listing limit; it now uses
  the stores batch's "Cupo de publicaciones" and points to Mi tienda at the limit (shop-05).
- **Publicar seleccionados.** The stores batch's button (stock-10) joins the inventory batch's new bulk bar, for rows
  the owner ticked only, like "Ajustar stock": a whole filter across pages is not sent.

## UXD-integration-8: one set of notice labels and pages

- **What met.** The speed batch's push notices (big-12) kept their own copy of the notifications list's labels and
  pages, taken before the other batches added notice types: questions, alert matches, the my-listings check-ins, the
  stock summary. A push for one of those read "Actualización de tu cuenta" and opened Mis publicaciones.
- **Decision.** One module, `lib/notifications.ts`, names each notice and picks its page; the list and the push both
  use it, so a push reads and opens like its row, and a new notice type is added in one place. The list links an alert
  match by the address it looked up; a push links listings by id, which the listing page forwards to the address.
- **Files.** `lib/notifications.ts`, `components/notifications-list.tsx`, `lib/push/notice.ts`, and the tests that
  read the labels.

## UXD-integration-9: one "Vistos recientemente" and one "last visit"

- **What met.** The find batch (FIND 11) and the accounts batch (big-04) each built "Vistos recientemente" on the same
  device key, `laria:vistos`, in two shapes: find kept a card's worth of each listing opened from a card, accounts kept
  the address of every listing page opened. Each overwrote the other, so the home's row drew tiles with no title or
  price (the not-found page showed empty links). Both batches also kept a "last visit": find for the home's "Nuevo
  desde tu última visita" (on the device), accounts for what is new in Favoritos and Alertas (a cookie the server
  reads), with different rules for when a visit starts.
- **Decision.** One list: every listing page opened, however it was reached, in `lib/device-saves.ts`. Both rows draw
  it from today's public cards (`lib/viewed-listings.ts`), so a listing taken down drops out and a sold one says
  "Vendido"; "Borrar" on the row forgets the list, and "Borrar lo guardado en este dispositivo" forgets it with the
  rest. One last visit: the cookie, moved on every page change, with one rule (`previousVisitFrom`) that gives the
  same answer before and after the page marks a new visit; the home, Favoritos and Alertas all read it. Opening a
  listing from a card still feeds "Para ti" (BIG 01).
- **Files.** `lib/device-saves.ts`, `lib/viewed-listings.ts` (new), `components/catalog-recently-viewed.tsx`,
  `components/saving/device-favorites.tsx`, `components/listing-card.tsx`, `components/home/home-for-you.tsx`,
  `components/marketplace-account-provider.tsx`, `lib/catalog-device.ts`, `app/mi-cuenta/{alertas,favoritos}/page.tsx`.

## UXD-integration-10: what the accounts batch left for the others

The accounts batch (#28) shipped shared pieces and listed where the other batches should use them. At integration:

- **Followed arrivals on the home (save-12).** For a signed-in person who follows stores or brands, the home shows
  "Nuevo de lo que sigues" above "Para ti": up to eight listings from the past two weeks, each saying which follow
  brought it. It is read after the page loads (`/api/follows`, action `arrivals`), because the home is rendered
  without the person's session; visitors ask for nothing. The brand "Seguir" under the catalog title and the store
  header's were already in.
- **Inputs that fit the keyboard (auth-03).** Every price a seller or store types is the shared `PriceInput` ("S/" in
  front, "1,250" while typing, numeric keypad): the sell form, the edit form, the inline price on Mis publicaciones,
  "Bajar precio" in Pendientes, a missing price in an import row, and the SKU's price in Inventario. `PriceInput` can
  now be kept in a form's own state (`value` and `onValueChange`), which the sell form and the inline price need. The
  SKU forms read the grouped text with `parseWholeSolPrice`, like the server. Brand and model are never autocorrected
  (sell form, edit form, import row). The store's "WhatsApp para compradores" and the store sign-up's WhatsApp use
  `PhoneInput`, so both show "+51" and the number buyers will see with "Probar en WhatsApp". Stock fields already used
  the numeric keypad.
- **The password eye on the store sign-up (auth-01).** It was the one password field left without it.
- **The profile notice on the account home (auth-02).** It showed to every new account, buyers included. It now shows
  only to someone with publications, whose buyers see those details; Publicar asks for WhatsApp and city the first
  time.
- **Files.** `app/page.tsx`, `components/home/home-followed.tsx` (new), `app/api/follows/route.ts`,
  `components/following/followed-arrivals.tsx`, `components/ui/price-input.tsx`, `components/sell-listing-form.tsx`,
  `components/listing-edit-form.tsx`, `components/listing-management-table.tsx`, `components/pendientes-list.tsx`,
  `components/store-import/complete-row-sheet.tsx`, `components/inventory/sku-forms.tsx`,
  `components/inventory/item-detail.tsx`, `components/store-registration-form.tsx`,
  `components/store-owner-signup-form.tsx`, `app/mi-cuenta/page.tsx`.

## Fixed at integration

- **Store columns the public cannot read.** The store-details fix (#30) closes the stores table to the public except
  for the columns public pages use. The inventory batch's purchase requests page read the street address through the
  table; it now reads the owner's own row, which `get_own_store()` already gives the account pages.
- **The Laria card on every shared page.** The listing batch's link previews (list-09) left two edits to other
  batches' files: `/listados`, the stores directory, a store without a logo, the legal pages and the Libro de
  Reclamaciones set their own `openGraph` without images, so a link to them showed no picture. They now name the Laria
  card (`DEFAULT_OG_IMAGES` in `lib/site.ts`), a shared favorites list without photos uses it too, and X shows the
  large card everywhere. The home, listings and categories keep their own cards, and a store with a logo shows it.
- **"Antes S/" on store pages.** The store page's cards did not select the two price-drop columns, so a store's
  dropped prices showed no "Antes" there while the catalog and the home showed it.
- **Selling's migrations drop their helper.** `20261104120100` and `20261104120200` each created
  `pg_temp.selling_fix` without dropping it. The local replay runs every migration in its own session, so it passed;
  the Supabase CLI applies them all over one connection, where the second `create` fails. Both now drop it after use,
  like the review-fix migrations. A one-session replay of every migration is part of the integration checks.
- **Push functions only for their callers.** The speed batch had granted the worker's `claim_push_deliveries` and
  `finish_push_deliveries` to every role, as the older e-mail worker does, relying on the role check inside. They are
  now granted to `service_role` only, and the device functions to `authenticated` only; the checks inside stay.
- **Acceptance files the registry refused.** The find batch's three P3 rows (EASE-012, EASE-020, EASE-023) are P2,
  the registry's lowest level, and the inventory batch's escaped quotes are plain quotes.

## Acceptance cases

All 260 proposed cases, EASE-001 to EASE-765 and all Not Run, are in `acceptance-proposal.tsv`, built from the
batches' files and checked with `python3 -B acceptance/validate.py --cases docs/ux-effortless/acceptance-proposal.tsv`.
They join `acceptance/cases.tsv` only after Henri's review. The integration's own cases are EASE-750 to EASE-765
(`integration-acceptance.tsv`).
