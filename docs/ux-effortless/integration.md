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

## Fixed at integration

- **Selling's migrations drop their helper.** `20261104120100` and `20261104120200` each created
  `pg_temp.selling_fix` without dropping it. The local replay runs every migration in its own session, so it passed;
  the Supabase CLI applies them all over one connection, where the second `create` fails. Both now drop it after use,
  like the review-fix migrations. A one-session replay of every migration is part of the integration checks.
