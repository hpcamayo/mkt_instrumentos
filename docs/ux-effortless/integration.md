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
  My listings' `ux_add_check_values` is gone and accounts' two event-type lists use the shared helper (its own reader
  stays for the e-mail context keys). `tests/ux-effortless-integration.sql` copies each check onto a scratch table and
  inserts every known type, so a batch that drops one fails the suite whatever form the list is printed in.
- **Files.** `supabase/migrations/20261102120500_ux_listing_registry.sql`, `20261103130000_ux_accounts_saving.sql`,
  `20261105120000_ux_my_listings_lifecycle.sql`, `20261105120100_ux_my_listings_reminders.sql`,
  `tests/ux-effortless-integration.sql`, `docs/database.md`.

## Fixed at integration

- **Selling's migrations drop their helper.** `20261104120100` and `20261104120200` each created
  `pg_temp.selling_fix` without dropping it. The local replay runs every migration in its own session, so it passed;
  the Supabase CLI applies them all over one connection, where the second `create` fails. Both now drop it after use,
  like the review-fix migrations. A one-session replay of every migration is part of the integration checks.
