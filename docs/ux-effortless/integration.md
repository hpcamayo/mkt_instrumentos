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

## Fixed at integration

- **Store columns the public cannot read.** The store-details fix (#30) closes the stores table to the public except
  for the columns public pages use. The inventory batch's purchase requests page read the street address through the
  table; it now reads the owner's own row, which `get_own_store()` already gives the account pages.
- **Selling's migrations drop their helper.** `20261104120100` and `20261104120200` each created
  `pg_temp.selling_fix` without dropping it. The local replay runs every migration in its own session, so it passed;
  the Supabase CLI applies them all over one connection, where the second `create` fails. Both now drop it after use,
  like the review-fix migrations. A one-session replay of every migration is part of the integration checks.
