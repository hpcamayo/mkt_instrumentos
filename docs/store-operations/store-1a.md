# STORE-1a: inventory core

Status: implemented on branch `store-ops/store-1a-inventory-core`, local tests green, **not applied to production and
not accepted yet**. STORE-1b (the Inventario screens) needs its own approval. The design is
[`design.md`](design.md) (§3–§6, §14, §17); owner decisions D-1…D-15 are at their accepted defaults.

## What it adds

One migration, `supabase/migrations/20261023120000_store_inventory_foundation.sql`, purely additive:

| Object | Purpose |
| --- | --- |
| `store_operation_settings` | Per-store pilot gate (`inventory_enabled`, default off), future listing allowance, generated-SKU counter. Missing row = V1 defaults. |
| `store_inventory_items` | One row per SKU: stock (`quantity_on_hand`, `quantity_reserved` = 0, generated `quantity_available`), price, threshold, catalog references, optional link to one store listing (composite FK `(listing_id, store_id)`). |
| `store_stock_movements` | Append-only stock ledger with before/after, idempotency key and request fingerprint. |
| `store_inventory_changes` | Append-only audit of SKU, price, detail, link/unlink and archive changes. |
| `laria_private.store_inventory_batch_receipts` | One receipt per bulk request, so a retried batch returns its first result. |
| `listings.stock_state` | `null` (not managed, every existing row), `in_stock` or `out_of_stock`. Controlled field. |

Owner functions (all `security definer`, bound to `auth.uid()`, owner-only per D-8): `create_inventory_item`,
`update_inventory_item`, `change_inventory_sku`, `record_stock_movement`, `apply_bulk_stock_operations`,
`preview_inventory_price_bulk`, `set_inventory_price_bulk`, `link_inventory_listing`, `unlink_inventory_listing`,
`archive_inventory_item`, `unarchive_inventory_item`, `get_inventory_page`, `get_inventory_summary`. Admin:
`admin_set_store_inventory_enabled(store, enabled, reason)`, audited in `admin_audit_actions`.

Listing integration:

- `protect_listing_admin_fields()` protects `stock_state`; a new insert guard stops a listing from arriving with one.
- `laria_private.guard_inventory_managed_listing()`: a linked listing can never become `sold`, on any path (owner,
  Admin, any future function). Message: `INVENTORY_MANAGED_LISTING: Registra la venta desde Inventario.` (D-15).
- `laria_private.sync_inventory_price_from_listing()`: a controlled listing price edit (owner edit, Admin editor,
  approved revision) is copied to the linked item and audited.
- `notify_favorite_price_drop()` skips out-of-stock listings; `capture_listing_alert_publication()` treats an
  out-of-stock listing as not yet "first public" and now also fires on `stock_state`; store reactivation
  (`capture_store_alert_publication()`) skips out-of-stock listings too.
- `complete_public_submission('store_listing')` accepts `inventory_item_id` and links the item before a verified
  store's direct approval. The submissions route does not pass it yet (STORE-1b wires the form).

Application (design §5.2): the catalog, category landings, home feed/vitrina/counts, sitemap and the related strips on
a listing page leave out `out_of_stock` listings. The store page shows them after the available ones with an
"Agotado" tag. The detail page stays reachable with "Agotado" beside the price, a short note, a restock-question
WhatsApp message, `noindex, follow` and `OutOfStock` structured data. The listing management route maps the sold
guard to Spanish copy. The copy is provisional until the D-13 copy review in STORE-1b.

## Where it differs from the design, and why

| Design | Implemented | Why |
| --- | --- | --- |
| `catalog_variant_id` FK to `catalog_product_variants` (§3.2 open question) | Product keeps its FK (`on delete set null`); variant is a plain uuid validated on write | The production loader upserts products by stable id and never deletes them (it marks them superseded), but it deletes variants missing from a new build. An FK would make a catalog reload fail or silently null merchant data. |
| `updated_by` / `actor_user_id` reference `profiles` | Plain uuids | Admin authority comes from the JWT and an Admin may have no profile; `on delete set null` can never run on an append-only ledger. |
| `update_owned_listing()`, `set_owned_listing_lifecycle()`, `review_listing()` edited | Untouched; two listing triggers instead (sold guard, price write-through) | One place covers every present and future path. Lock order is still listing → item: the trigger runs after the listing row is locked. |
| "Retry once" if the item is linked between read and lock (§4.3 step 3) | The newly linked listing is locked `NOWAIT`; if busy, `INVENTORY_CONCURRENT_CHANGE` (SQLSTATE 40001) and the client retries with the same key | Waiting on a listing while holding the item would invert the lock order. |
| `version` default 1 | Default 0; the opening balance makes a new item version 1 | Every item is created through the opening movement, so its first visible version is still 1. |
| Movement checks: non-zero except `stock_count`; sale sign | Non-zero except the four absolute types; sign checks for sale, damage/loss, restock, return; opening only from zero; on hand ≤ 1,000,000 | Absolute types may match what was there; the table enforces each type's direction. |
| `link_inventory_listing(item, listing, version)` | Adds `p_unit_price_pen`; `INVENTORY_PRICE_CHOICE_REQUIRED` when the prices differ and none was chosen | §4.2 says the merchant chooses which price wins; the RPC refuses to guess. |
| Bulk idempotency per movement key | Plus a batch receipt (`store_inventory_batch_receipts`) | A retried batch returns its first result, including the price batch, which writes no movements. |
| Owner movement types | `sale`, `return`, `restock`, `damage_or_loss`, `manual_adjustment`, `stock_count` only | Opening balances come from creation, reconciliation from imports (STORE-2), reservations from PAY-1B (D-4), external sync from SYNC-1. |
| — | `unarchive_inventory_item`, `preview_inventory_price_bulk` | The archive is reversible and §4.2 asks for the rounding rule to be shown before a percent change. |

Errors use `CODE: mensaje en español` with SQLSTATE `P0001` (or `40001` for the retryable lock case); "does not exist"
and "not yours" are the same `INVENTORY_ITEM_NOT_OWNED` so ids cannot be probed.

## How to test

Local only. With local Supabase running (`supabase start`, or any local Postgres with the migrations applied):

```sh
supabase db reset                                  # applies every migration, including this one
node tests/run-local.cjs sql tests/store-ops-1.sql # rolled-back fixture: gate, RLS, ledger, links, alerts, reads
node tests/run-local.cjs sql tests/*.sql            # existing suites, unchanged
node tests/store-ops-concurrency.integration.cjs   # separate connections; refuses non-local URLs
pnpm test && pnpm typecheck && pnpm lint && pnpm build
```

The concurrency suite connects to `postgresql://postgres:postgres@127.0.0.1:54322/postgres` by default (argument or
`LARIA_TEST_DATABASE_URL` to override, `LARIA_RACE_ROUNDS` for the last-unit repetitions, default 200). It creates its
own store, removes everything at the end (it disables the ledger's append-only triggers inside one transaction to do
so) and prints one `PASS` line per case:

| Case (design §14.1) | What it asserts |
| --- | --- |
| Last unit | 2–20 sales of the last unit, 200 rounds: exactly one succeeds, the rest `STOCK_INSUFFICIENT`, listing goes `out_of_stock` and stays `approved` |
| Same-key retries | 10 identical calls: one movement, every call returns it |
| Same key, different payload | One applies, the other `IDEMPOTENCY_KEY_REUSED` |
| Stale count | Four counts on one version: one wins. A count racing a sale never erases the sale |
| Bulk and single | Bulk batches in opposite orders, singles and a bulk price change: no deadlock, ledger sums match |
| Stock vs listing edits | Sales, losses, restocks, bulk price and `update_owned_listing` price edits on one linked listing: no deadlock, prices end equal, one price-drop record per actual decrease |
| Link vs sold | Link, mark-sold and a movement on a fresh listing: never both linked and sold |

Evidence for this branch (2026-10-15, local Postgres 16 with the Supabase roles, no Docker available in the build
session): all 11 existing SQL suites and `store-ops-1.sql` pass; the concurrency suite passes repeatedly and fails, as
it should, against a mutant `lock_inventory_item` without row locks (two buyers got the last unit); `pnpm test`
359/359, typecheck, lint and build pass. Not run: browser checks of the store and detail pages against a real
PostgREST (no local Supabase API in that session).

## Rollback

Every change is additive and gated per store, so nothing changes until an Admin enables a store and its owner links a
listing. If the application must be rolled back after stores have linked listings, unlink everything first so the old
code (which ignores `stock_state` and offers "Marcar vendida") sees plain V1 listings. Run it as one transaction:

```sql
begin;
-- Review first: these approved listings are out of stock and will look available again.
select l.id, l.slug, l.stock_state from public.listings l where l.stock_state is not null;

insert into public.store_inventory_changes(store_id, item_id, change_type, before, after, actor_kind, reason)
select store_id, id, 'unlink', jsonb_build_object('listing_id', listing_id), '{}', 'system', 'Rollback de la aplicación'
from public.store_inventory_items where listing_id is not null;
update public.store_inventory_items set listing_id = null, version = version + 1 where listing_id is not null;
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set stock_state = null where stock_state is not null;
commit;
```

An approved listing that was out of stock since its approval becomes "first public" at that moment and matches saved
searches once, exactly as if it had been restocked. Item stock and the ledger stay; relinking later is a normal link.
Schema rollback is not planned: dropping the tables would lose ledger history.

## Independent review (design §17, items 1 and 2)

Codex (or another independent reviewer) should check these before the code merges. Everything is in the migration
unless noted.

1. **Stock concurrency.** `record_stock_movement` (advisory lock on store + key, replay or `IDEMPOTENCY_KEY_REUSED`,
   then `laria_private.lock_inventory_item`, then `laria_private.apply_stock_movement`), `apply_bulk_stock_operations`
   and `set_inventory_price_bulk` (`laria_private.lock_inventory_items`: listings then items, each in id order, then a
   re-check for items linked meanwhile), `laria_private.apply_inventory_price` against `update_owned_listing` plus the
   `listings_sync_inventory_price` trigger, `link_inventory_listing` and the `NOWAIT` branch. Questions: is the order
   advisory key → listing → item really universal; can any path wait on a listing while holding an item; can a retry
   with the same key ever apply twice; is the harness (`tests/store-ops-concurrency.integration.cjs`, its barrier and
   its assertions) a real race? A quick check of the harness: replace `lock_inventory_item` with a version without
   `for update` and the "last unit" case fails.
2. **Schema and listing invariants.** Composite FK `inventory_listing_same_store`; `stock_state` in
   `protect_listing_admin_fields()` and the insert guard; the sold guard trigger; `write_listing_stock_state` saving
   and restoring `app.allow_listing_admin_fields`; the `capture_listing_alert_publication`, `capture_store_alert_publication`
   and `notify_favorite_price_drop` changes; `complete_public_submission` linking before direct approval; grants
   (`revoke` from `public, anon, authenticated`, `grant execute` to `authenticated`, no browser access to
   `laria_private`). Question: does any Particular, legacy or unlinked store listing behave differently? The SQL
   suite's "Particular listings are untouched" and "unlinked listing returns to V1 behavior" blocks cover the main
   paths; `tests/store-sprint-2.sql`, `listing-sprint-3.sql`, `sprint-5-favorites.sql` and `sprint-7-email-alerts.sql`
   run unchanged.

### Codex result (2026-10-16)

Codex reviewed this item on PR #12 at `2524829`. Every finding below was reproduced locally and fixed on
`store-ops/review-fixes-core` with a regression test; details and defaults are in [`review-fixes.md`](review-fixes.md).

- Item 1, finding 1: the `KEY SHARE` lock that ledger, audit and receipt inserts take on the store row deadlocked
  with publication, the publish form and the Admin store settings, which held the store `FOR UPDATE`. Fixed in
  `d216841` (store rows locked `FOR NO KEY UPDATE`; publication locks an unlinked SKU before reading its price).
- Item 1, finding 2: a stale `link_inventory_listing` could lock a second listing out of order. Fixed in `d216841`
  (the SKU is locked directly; a linked SKU is refused without touching its listing).
- Item 1, finding 3: the races only exercised linked inventory. Fixed in `d216841`: unlinked last-unit, stale count
  and bulk races, threshold and hide races, deterministic lock-order cases. The quick check above was wrong: with the
  SKU lock removed, the linked case stays masked by the listing lock; `--mutation` now shows the unlinked case
  catching it.
- Item 2, finding 1: price-drop and search e-mails queued while in stock went out after stock ran out. Fixed in
  `7ae601d` (cancelled at claim, digests drop the listing, empty digests are cancelled).
- Item 2, finding 2: an import row that gave a listing its first stock and a new price matched saved searches with
  the old price. Fixed in `7ae601d`.

## Acceptance proposal (not in `acceptance/cases.tsv`)

Proposed `INV-` cases for STORE-1a, for Henri's review. They are added to `acceptance/cases.tsv` only after that
review; no existing ID changes. STORE-1b will propose the screen cases.

| Proposed ID | Requirement | Expected | Automated evidence |
| --- | --- | --- | --- |
| INV-001 | Inventory is off until an Admin enables it per store | Owner writes fail with `INVENTORY_NOT_ENABLED`; enabling needs a reason and is audited | `store-ops-1.sql` pilot gate |
| INV-002 | Only the store owner reads and writes its inventory | Other owners, Particulares and anonymous visitors see nothing; Admin reads; writes only through functions | `store-ops-1.sql` RLS block |
| INV-003 | A SKU is unique per store, case-insensitively, and changes only with a reason | `INVENTORY_SKU_TAKEN`, `INVENTORY_REASON_REQUIRED`; change audited | `store-ops-1.sql` items, SKU block |
| INV-004 | A blank SKU gets a generated `LAR-000001`-style code that is never reused | Counter advances per store | `store-ops-1.sql` |
| INV-005 | Every stock change is a ledger movement with before/after and author | Ledger sums to on-hand; ledger rows cannot be edited or deleted | `store-ops-1.sql` ledger integrity |
| INV-006 | Stock can never go below zero | Oversell and negative adjustments fail with `STOCK_INSUFFICIENT` | `store-ops-1.sql`, concurrency "last unit" |
| INV-007 | Two buyers cannot get the last unit | Exactly one of N concurrent sales succeeds | concurrency "last unit" |
| INV-008 | A retried request never applies twice | Same key returns the first result; same key with other data is refused | `store-ops-1.sql`, concurrency "same-key" cases |
| INV-009 | A count needs the version the merchant saw | Stale count refused; a count never erases a sale it did not see | concurrency "stale count" |
| INV-010 | Bulk stock and price changes are all-or-nothing | One failing row cancels the batch; retry returns the receipt | `store-ops-1.sql` bulk blocks |
| INV-011 | Linking keeps listing and item prices equal from either side | Price edits write through and are audited; favorites get one price-drop notice per decrease while in stock | `store-ops-1.sql`, concurrency "stock vs listing edits" |
| INV-012 | Stock never changes a listing's status, and moderation never changes stock | Sell-out keeps `approved`; hide/restore keeps the link | `store-ops-1.sql` stock-out block |
| INV-013 | An out-of-stock listing keeps its URL with "Agotado", leaves discovery and the index | Catalog, home, sitemap and related strips skip it; store page lists it last; detail `noindex, follow` | `tests/sprint-9.test.cjs` (sitemap filter); manual page check pending |
| INV-014 | Restock does not re-send alerts; a listing approved at zero stock alerts once when first stocked | Saved-search matches and first-public markers counted | `store-ops-1.sql` alerts blocks |
| INV-015 | A linked listing cannot be marked sold; unlinking returns it to the V1 sold flow | `INVENTORY_MANAGED_LISTING`; after unlink the sold flow works | `store-ops-1.sql`, concurrency "link vs sold" |
| INV-016 | Particular and unlinked store listings behave exactly as before | Lifecycle, sold, price drop and alerts unchanged; `stock_state` null | `store-ops-1.sql`, existing suites unchanged |
| INV-017 | A hidden or rejected store keeps read-only access | Writes fail with `INVENTORY_STORE_READ_ONLY`; reads work | `store-ops-1.sql` |
| INV-018 | Publishing from an item links it in the same transaction | Verified store at zero stock: approved, out of stock, no alert until stocked; another store's item aborts the submission | `store-ops-1.sql` publication block |

## Known limitations

- No screens yet: everything is reachable only through the functions above (STORE-1b).
- The submissions route does not forward `inventory_item_id` yet.
- `quantity_reserved` has no writer (D-4); `listing_allowance` is stored but `enforce_store_inventory_cap()` still uses
  50 (STORE-3b).
- The seller card's listing count on a detail page follows its strip, so it leaves out the store's out-of-stock
  listings while the store page header counts them.
- `get_inventory_page` searches with `like` on the trigram-indexed `lower(name || ' ' || SKU)` expression; the §14.5
  benchmark (5,000 items) is STORE-4 work.
- Copy ("Agotado", the detail note, the WhatsApp message, the sold-guard message) is provisional until D-13.
