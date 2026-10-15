# Store Operations & Assisted Commerce: implementation design

Status: **proposed, awaiting owner approval.** Nothing here is implemented. No migration, deploy, production data
change or payment enablement follows from this document. Each sub-sprint in §16 needs its own approval before work
starts and acceptance after.

Scope: the "Laria Store Operations & Assisted Commerce" program (owner brief, 2026-10-15), answering its §37.
Baseline: `main` at `a6b8ae3` (2026-10-14), 45 migrations, latest `20261022120000_marketplace_categories.sql`.

How to read: §1 is what exists today and where it constrains the design. §2–§6 are the inventory domain (STORE-1).
§7–§9 are import, photos and catalog autofill (STORE-2/3). §10 is quota. §11–§12 are payments and sync. §13 is UI.
§14–§15 are tests and acceptance. §16 is the sub-sprint plan with estimates. §17 lists what needs Codex review. §18
lists the owner decisions, each with a recommended default.

---

## 1. What exists today and where it constrains the design

### 1.1 A store "product" is a listing, and nothing else

There is no inventory concept. `app/mi-cuenta/tienda/inventario/page.tsx` is a list of `listings` rows where
`store_id = store.id`, rendered by `components/listing-management-table.tsx`. Every store item is created through
`complete_public_submission(kind='store_listing')` (`20260910190000_store_sprint_2.sql:564`), which inserts one
`listings` row with the store's city/region/contact/WhatsApp copied in, plus 2–10 `listing_photos`, and approves it
directly only when the store is `active` and `is_verified`.

Coupling points the program has to work around:

| Where | What it does today | Consequence for inventory |
| --- | --- | --- |
| `listings.status` | One lifecycle for availability *and* moderation: `pending → approved → hidden/sold` | Stock-out cannot be a status. It must be a separate, derived fact. |
| `protect_listing_admin_fields()` (`20260913120000_listing_sprint_3.sql:275`) | `sold` rows are immutable; approved rows can only change through controlled functions (`app.allow_listing_admin_fields`) | Any listing column the inventory writes must go through the same guard. |
| `set_owned_listing_lifecycle('sold')` | Owner can mark any approved store listing sold; it becomes immutable history and feeds `transaction_claims` | A multi-unit SKU must not go through this path (§5.3). |
| `enforce_store_inventory_cap()` (`store_sprint_2.sql:112`) | Hard-coded 50 concurrent `pending`/`approved` per store, serialized by a per-store advisory lock | Quota becomes a per-store value read by the same trigger (§10). |
| `listing_is_public()` (`store_sprint_2.sql:162`) | The RLS predicate for listings and photos: approved + active parent store | Must **not** change for stock-outs, or out-of-stock pages and their photos would 404 and favorites would break. |
| `capture_listing_alert_publication()` (`sprint_7…alerts.sql:581`) | First time a listing becomes public it is recorded once and matched against saved searches | Restock never re-alerts (good, already). A listing first approved at zero stock must wait until it is in stock (§5.4). |
| `notify_favorite_price_drop()` (Sprint 5) | Fires on a lower `listings.price_pen` for a public listing | Inventory price must write through to `listings.price_pen` so this keeps working (§3.4). |
| `fetchCatalogPage()` (`lib/catalog.ts:9`) and `app/sitemap.ts:52` | Public discovery = `status='approved'` | Discovery needs one extra predicate for stock-outs (§5.2). |
| Store listings snapshot store contact fields | `city`, `region`, `contact_name`, `whatsapp_phone` copied at insert | Import must create listings through the same insert, not its own (§8.5). |
| Photos | Initial store photos go to the public `listing-photos` bucket; edits since Sprint 4 go to the private `listing-edit-photos` bucket served by `/api/listing-images/[...path]` | Import photos follow the Sprint 4 private pattern (§8). |
| UI glossary (`docs/design-system.md` §Content language, enforced by `tests/ux-copy.test.cjs`) | Rejects "producto", "artículo", "ítem", "Agregar inventario", etc. | Several labels in the brief need a glossary decision before UI work (§13.5, D-13). |
| Acceptance registry | `STORE-` (19 cases) and `PHOTO-` (31 cases) prefixes already exist | The brief's new `PHOTOS` family would collide visually with `PHOTO`; proposed prefixes in §15. |

### 1.2 Catalog autofill exists only on a prototype branch

`main` has the catalog tables and the matching RPCs (`catalog_lookup`, `catalog_match`, `catalog_jev_inputs`), but no
application code calls them. The autofill logic lives on `proto/catalog-autofill-jev-bvvvxm` (21 commits behind `main`,
not merged): `lib/catalog-intelligence/{catalog-resolver,autofill,…}.ts`, admin-only behind
`CATALOG_AUTOFILL_PROTOTYPE=1`, with `buildAutofillSuggestion()` and `buildProvenance()` producing exactly the
suggested / accepted / modified / rejected record the brief asks the importer to preserve. That prototype proposes,
but does not create, `listing_catalog_links`. It does not touch the store form, and "does Tienda inventory use the
same autofill" is its open question #1.

Consequence: the importer cannot reuse autofill until that code is on `main`. §9 makes STORE-3's catalog step depend
on the autofill sprint landing first, and adds only a batched wrapper so the importer does not make one round trip
per row. Nothing in this program edits the prototype branch.

### 1.3 Infrastructure facts that shape the processing model

- Vercel Hobby: one daily cron; function duration is bounded (the email worker sets `maxDuration = 60`).
- `pg_cron` is already used (`catalog-search-log-prune`). There is no queue.
- No spreadsheet or archive library in `package.json`.
- The service-role client exists server-only (`lib/supabase/admin-client.ts`). The established write style is
  owner-scoped `security definer` RPCs bound to `auth.uid()`, with browser roles having no table DML.
- Test style: SQL fixture files run in a rolled-back transaction (`tests/*.sql`), plus `*.integration.cjs` against
  local Supabase and `node --test` unit tests.

### 1.4 Branches

`ux/redesign`, `ui/laria-visual-refresh`, `ux/catalog-category-nav-0ueck4` and `claude/project-thread-kpug87` are
fully merged into `main`; the completed UX work *is* `main`. `proto/catalog-autofill-jev-bvvvxm` (Jev) and
`audit/catalog-quality-iypo95` (docs) are unmerged and are not touched. All work for this program happens on
`store-ops/*` branches cut from `main` (this document is on `design/store-operations`).

---

## 2. Domain separation

```
catalog_products / catalog_product_variants        (what the product is; read-only reference)
        │ optional
        ▼
store_inventory_items ──► store_stock_movements    (what the store counts; append-only ledger)
        │ optional, 1:1                ▲
        ▼                              │
listings (+ listing_photos, revisions)  │          (what is advertised; existing moderation)
                                        │
store_import_sessions / rows ───────────┘          (how stock arrived; staged, idempotent)
store_payment_methods                               (what the store accepts; PAY-1)
store_external_* (future)                           (where stock comes from; SYNC-1)
```

Rules that hold everywhere:

1. Stock never changes `listings.status`. Moderation never changes stock.
2. A stock movement never creates a `transaction_claims` / `verified_transactions` row, a review, or a `listing_sold`
   event.
3. Inventory rows without a listing are invisible to the public and consume no listing slot.
4. All writes go through `security definer` RPCs that bind the store from `auth.uid()`. Browser roles get `SELECT`
   on their own rows at most, never `INSERT/UPDATE/DELETE`.

---

## 3. Schema (STORE-1)

One migration, `2026102312xxxx_store_inventory_foundation.sql`, purely additive.

### 3.1 `public.store_operation_settings`

Per-store operational settings, kept off `stores` because active `stores` rows are publicly readable.

```sql
create table public.store_operation_settings (
  store_id            uuid primary key references public.stores(id) on delete cascade,
  inventory_enabled   boolean not null default false,  -- pilot gate (D-2)
  listing_allowance   integer not null default 50
                      check (listing_allowance between 1 and 2000),
  next_generated_sku  integer not null default 1 check (next_generated_sku > 0),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.profiles(id)
);
```

A missing row means the V1 defaults (`inventory_enabled=false`, allowance 50), so no backfill is needed. Owner:
`SELECT` own row via `is_store_owner(store_id)`. Writes: admin RPCs only, audited (§10).

### 3.2 `public.store_inventory_items`

```sql
create type public.inventory_status as enum ('active', 'archived');
create type public.stock_source     as enum ('manual', 'import', 'external');

create table public.store_inventory_items (
  id                   uuid primary key default gen_random_uuid(),
  store_id             uuid not null references public.stores(id) on delete restrict,
  merchant_sku         text not null,
  sku_normalized       text not null,
  sku_generated        boolean not null default false,
  catalog_product_id   uuid references public.catalog_products(id) on delete set null,
  catalog_variant_id   uuid references public.catalog_product_variants(id) on delete set null,
  listing_id           uuid unique,
  product_name         text not null check (char_length(btrim(product_name)) between 2 and 140),
  variant_label        text check (variant_label is null or char_length(variant_label) <= 80),
  quantity_on_hand     integer not null default 0 check (quantity_on_hand >= 0),
  quantity_reserved    integer not null default 0 check (quantity_reserved >= 0),
  quantity_available   integer generated always as (quantity_on_hand - quantity_reserved) stored,
  low_stock_threshold  integer check (low_stock_threshold is null or low_stock_threshold between 0 and 100000),
  unit_price_pen       integer check (unit_price_pen is null or unit_price_pen > 0),
  inventory_status     public.inventory_status not null default 'active',
  stock_source         public.stock_source not null default 'manual',
  external_reference   text check (external_reference is null or char_length(external_reference) <= 120),
  version              integer not null default 1,
  last_movement_at     timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint inventory_reserved_le_on_hand check (quantity_reserved <= quantity_on_hand),
  constraint inventory_sku_display check (merchant_sku ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  constraint inventory_sku_normalized check (sku_normalized = upper(merchant_sku)),
  constraint inventory_variant_needs_product check (catalog_variant_id is null or catalog_product_id is not null),
  constraint inventory_listing_same_store
    foreign key (listing_id, store_id) references public.listings(id, store_id) on delete restrict
);

create unique index store_inventory_items_sku_idx on public.store_inventory_items(store_id, sku_normalized);
create index store_inventory_items_store_updated_idx on public.store_inventory_items(store_id, updated_at desc, id);
create index store_inventory_items_store_available_idx on public.store_inventory_items(store_id, quantity_available, id)
  where inventory_status = 'active';
create index store_inventory_items_name_trgm_idx on public.store_inventory_items
  using gin (lower(product_name || ' ' || merchant_sku) gin_trgm_ops);   -- pg_trgm already installed
```

Notes:

- **Composite FK** `(listing_id, store_id) → listings(id, store_id)` makes "the linked listing belongs to the same
  store" a database fact. It needs `create unique index listings_id_store_idx on listings(id, store_id)`, which is
  trivially unique and cheap. `listings.store_id` is already protected against change by
  `protect_listing_admin_fields()`. `on delete restrict` means a listing with inventory cannot be deleted silently
  (there is no user hard-delete today anyway).
- **SKU rules.** Display value is kept as typed (trimmed); uniqueness is on `upper()`, so `ds1-004` and `DS1-004`
  collide. The allowed set is letters, digits, `.`, `_`, `-`, up to 64 characters, starting with a letter or digit.
  That excludes spaces and `/` so a SKU can always be a filename (§8.2). Leading zeros are preserved because the column
  is text and every parser reads the SKU column as text (§7.4). If a pilot store's SKUs contain `/` or spaces we widen
  the pattern and those SKUs use the photo manifest instead (D-9).
- **Generated SKU.** `LAR-` + six digits from `store_operation_settings.next_generated_sku`, incremented under the
  settings row lock. Generated SKUs are flagged (`sku_generated`) so the UI can suggest replacing them.
- **Price.** Whole soles, integer, same contract as `listings.price_pen`. Nullable because an unpublished item may
  have no price yet; publication requires it (§3.4).
- **No `quantity_reserved` writer in STORE-1.** The column and its constraint exist so PAY-1B can add reservations
  without a table rewrite; until then every RPC leaves it at zero (D-4).
- **Catalog references.** The FKs to `catalog_products`/`catalog_product_variants` assume catalog ids are stable
  across catalog reloads. `catalog/scripts/ops/load_production.sh` (on the catalog branch) must be checked before
  STORE-1a: if it truncates or re-creates products, these become plain uuid columns validated at write time instead
  of FKs, so a catalog reload can never fail or silently null merchant data.
- **Variants.** One SKU per sellable variant. `variant_label` is the merchant's text ("Negro", "Zurdo");
  `catalog_variant_id` is set only when the variant was resolved (§9).

### 3.3 `public.store_stock_movements` (append-only ledger)

```sql
create type public.stock_movement_type as enum (
  'opening_balance', 'manual_adjustment', 'stock_count', 'sale', 'return', 'restock',
  'damage_or_loss', 'import_reconciliation', 'reservation', 'reservation_release', 'external_sync'
);
create type public.stock_channel as enum (
  'tienda_fisica', 'whatsapp_laria', 'redes_sociales', 'otro',      -- sales channels in the brief
  'panel', 'importacion', 'administracion', 'sistema', 'integracion' -- origins of non-sale movements
);

create table public.store_stock_movements (
  id                   uuid primary key default gen_random_uuid(),
  store_id             uuid not null references public.stores(id) on delete restrict,
  item_id              uuid not null references public.store_inventory_items(id) on delete restrict,
  movement_type        public.stock_movement_type not null,
  channel              public.stock_channel not null,
  on_hand_delta        integer not null,
  reserved_delta       integer not null default 0,
  on_hand_before       integer not null,
  on_hand_after        integer not null check (on_hand_after >= 0),
  reserved_before      integer not null,
  reserved_after       integer not null check (reserved_after >= 0),
  actor_user_id        uuid references public.profiles(id) on delete set null,
  actor_kind           text not null check (actor_kind in ('owner', 'admin', 'system')),
  import_session_id    uuid,          -- FK added in STORE-2
  import_row_number    integer,
  external_event_ref   text check (external_event_ref is null or char_length(external_event_ref) <= 200),
  reference            text check (reference is null or char_length(reference) <= 120),
  reason               text check (reason is null or char_length(reason) <= 280),
  idempotency_key      text not null check (char_length(idempotency_key) between 8 and 200),
  request_fingerprint  text not null,     -- sha256 of the normalized request
  item_version_after   integer not null,
  created_at           timestamptz not null default now(),

  constraint movement_math check (on_hand_after = on_hand_before + on_hand_delta
                                  and reserved_after = reserved_before + reserved_delta),
  constraint movement_nonzero check (on_hand_delta <> 0 or reserved_delta <> 0 or movement_type = 'stock_count'),
  constraint movement_sale_sign check (movement_type <> 'sale' or on_hand_delta < 0)
);

create unique index store_stock_movements_idem_idx on public.store_stock_movements(store_id, idempotency_key);
create index store_stock_movements_item_idx on public.store_stock_movements(item_id, created_at desc, id desc);
create index store_stock_movements_store_idx on public.store_stock_movements(store_id, created_at desc, id desc);
```

Append-only is enforced three ways: no table grants to browser roles, a `before update or delete` trigger that
raises unconditionally, and `on delete restrict` from the item. Corrections are new movements. `stock_count` is an
absolute count; a zero-delta count is allowed and records "counted, matched".

`stock_count` is one addition to the brief's list: it separates "I counted and there are 9" (absolute, needs the
version the merchant saw) from "+2 found in the back" (`manual_adjustment`, relative). The import snapshot mode uses
`import_reconciliation`, which is also absolute.

### 3.4 Changes to `listings`

One nullable column:

```sql
alter table public.listings add column stock_state text
  check (stock_state is null or stock_state in ('in_stock', 'out_of_stock'));
create index listings_public_in_stock_idx on public.listings(published_at desc, id)
  where status = 'approved' and stock_state is distinct from 'out_of_stock';
```

- `null` = not inventory-managed. Every existing row stays `null`, so nothing changes for Particulares, legacy rows,
  sold history or any store listing that is not linked.
- Written only by the inventory functions, in the same transaction as the movement that changes availability.
  `protect_listing_admin_fields()` gains `new.stock_state is distinct from old.stock_state` in its protected list.
- It is a denormalized copy of `store_inventory_items.quantity_available > 0` for linked listings. Denormalizing is
  deliberate: public discovery queries go through PostgREST with RLS, and a join to a private table on every catalog
  page would cost more and expose more than a column the public may already see as a label.
- **Price write-through.** For a linked listing, `unit_price_pen` and `listings.price_pen` are kept equal by one
  internal function, `laria_private.apply_inventory_price(item_id, price)`, called both by the inventory price RPC and
  by `update_owned_listing()` when the edited listing is linked. It updates the listing through the existing controlled
  path, so `notify_favorite_price_drop()` fires exactly as it does for a manual price edit today.

### 3.5 `public.store_inventory_changes` (non-stock audit)

SKU changes, price changes, threshold changes, link/unlink, archive/unarchive and admin overrides are not stock
movements but must be audited (brief §3, §29). One small append-only table:
`(id, store_id, item_id, change_type, before jsonb, after jsonb, actor_user_id, actor_kind, reason, created_at)`, same
protection as the ledger. Admin actions on inventory also write `admin_audit_actions` like every other privileged
action.

---

## 4. RPCs and RLS (STORE-1)

### 4.1 Authorization helper

```sql
-- true when auth.uid() owns the store, the store is pending/active, and inventory is enabled for it
laria_private.can_operate_store_inventory(p_store_id uuid) returns boolean
```

Uses the existing `is_store_owner()`; admin uses separate `admin_*` RPCs that check `is_admin()` (Auth
`app_metadata`). A pending store may use inventory and stage imports; it still cannot make anything public, because
publication keeps going through the existing store-status rules (brief §16). A `rejected` or `hidden` store gets
read-only access.

### 4.2 Owner RPCs

| RPC | Behavior |
| --- | --- |
| `create_inventory_item(p_fields jsonb, p_opening_quantity int, p_idempotency_key text)` | Validates fields, generates a SKU when blank, inserts the item and an `opening_balance` movement (even for 0) in one transaction. Idempotent on the key. |
| `update_inventory_item(p_item_id, p_fields jsonb, p_expected_version int)` | Name, variant label, threshold, external reference, catalog ids. Price goes through `apply_inventory_price`. Rejects stale versions. Writes `store_inventory_changes`. |
| `change_inventory_sku(p_item_id, p_new_sku, p_reason, p_expected_version)` | The only way a SKU changes. Reason required. Uniqueness enforced by the index. |
| `record_stock_movement(p_item_id, p_type, p_quantity, p_channel, p_reference, p_reason, p_expected_version, p_idempotency_key)` | See §4.3. |
| `apply_bulk_stock_operations(p_operations jsonb, p_batch_key text)` | Up to 200 operations, all-or-nothing. Locks linked listings, then items, each in `id` order (§4.3). Each operation gets the key `p_batch_key || ':' || item_id`. |
| `set_inventory_price_bulk(p_item_ids uuid[], p_mode, p_value, p_batch_key)` | Absolute price or whole-sol increment/decrement, up to 200 items, same locking. Each price goes through `apply_inventory_price`. Percent changes are rounded to whole soles in SQL with an explicit rounding rule shown in the preview. |
| `link_inventory_listing(p_item_id, p_listing_id, p_expected_version)` | Listing must be same store, not `sold`/`archived`, not already linked. Sets `stock_state` and aligns price (the merchant chooses which price wins in the UI; the RPC takes the chosen value). |
| `unlink_inventory_listing(p_item_id, p_reason)` | Clears the link and sets `listings.stock_state = null`, returning the listing to plain V1 behavior. |
| `archive_inventory_item(p_item_id, p_reason)` | Allowed only when the linked listing is not `pending`/`approved`. Stock is kept; archived items are hidden from the default table. |
| `get_inventory_page(p_filters jsonb, p_cursor jsonb, p_limit int)` | Keyset-paginated read (§4.5). |
| `get_inventory_summary()` | One grouped aggregate for the dashboard tiles. |

Publishing a new listing from an item reuses `complete_public_submission(kind='store_listing')` with one extra field,
`inventory_item_id`. When present, the function verifies the item is the caller's, active and unlinked, and links it
inside the same transaction, setting `stock_state` from the item. Normal Tienda → `pending`; active Tienda Verificada
→ `approved` when publication requirements pass. Nothing else in that flow changes.

### 4.3 `record_stock_movement`, the concurrency-critical path

```
1. pg_advisory_xact_lock(hashtextextended(store_id || ':' || p_idempotency_key, 0))
2. If a movement with (store_id, key) exists:
      same request_fingerprint  → return it (no second decrement)
      different fingerprint     → raise IDEMPOTENCY_KEY_REUSED
3. Read the item's listing_id (no lock); if linked, SELECT … FROM listings WHERE id = listing_id FOR UPDATE;
   then SELECT … FROM store_inventory_items WHERE id = p_item_id FOR UPDATE and re-check listing_id is unchanged
   (retry once if it changed)
   - not found / not operable → raise INVENTORY_ITEM_NOT_OWNED (same error for both; no existence leak)
4. If p_expected_version is given and differs → raise INVENTORY_VERSION_CONFLICT (returns current values)
   (required for stock_count; optional for relative movements, where the row lock is enough)
5. Compute delta from type:
      sale, damage_or_loss          → −q, requires q ≤ quantity_available
      restock, return               → +q
      manual_adjustment             → ±q (sign given), result ≥ reserved
      stock_count                   → counted − on_hand, result ≥ reserved
   q is an integer 1…100000 (0 only for stock_count).
6. UPDATE item SET quantity_on_hand, version = version + 1, last_movement_at = now()
   (table CHECKs are the last line of defense against negatives)
7. INSERT movement with before/after, fingerprint, item_version_after
8. If the item is linked and (available > 0) changed → UPDATE listings.stock_state under the controlled flag
9. Return the movement and the new item state
```

Two concurrent sales of the last unit: both pass step 1 (different keys), the second blocks at step 3 until the first
commits, then sees `quantity_available = 0` at step 5 and fails with `STOCK_INSUFFICIENT`. Two retries with the same
key: the second blocks at step 1 and returns the first result at step 2.

Lock order is the same on every path: idempotency key → linked listing → inventory item. `update_owned_listing()`
already locks the listing first, and its price write-through (`apply_inventory_price`) then locks the item, which
matches. Bulk operations and import chunks lock all affected listings in `id` order, then all items in `id` order.
Locking the listing before the item is what prevents a deadlock between a stock movement (which must update
`stock_state`) and a concurrent listing edit (which must update the item price). Codex review item (§17).

No negative stock or backorders exist (brief §5). A sale that would go below zero fails and tells the merchant to
record a count first.

### 4.4 RLS and grants

| Object | anon | authenticated | Notes |
| --- | --- | --- | --- |
| `store_operation_settings` | none | `SELECT` own (`is_store_owner`) | admin RPCs write |
| `store_inventory_items` | none | `SELECT` own | all writes through RPCs |
| `store_stock_movements` | none | `SELECT` own | update/delete trigger raises |
| `store_inventory_changes` | none | `SELECT` own | append-only |
| `listings.stock_state` | readable with the row (public label) | same | protected column |

RPCs are `security definer`, `set search_path = public` (or `public, laria_private`), and `revoke execute … from
public, anon` with explicit `grant execute … to authenticated`. Internal helpers live in `laria_private` with no
browser execute. Admin variants re-check `is_admin()` inside the function, as Sprint 8 does.

### 4.5 Reads at scale

The inventory table never loads all items. `get_inventory_page` uses keyset pagination on the chosen sort
(`(updated_at, id)`, `(product_name, id)`, `(quantity_available, id)`, `(unit_price_pen, id)`), 50 rows per page,
filters for stock state (in stock / low / out / archived), publication state (no listing / pending / published /
hidden / rejected / changes pending), catalog match (yes/no) and category, plus a trigram search on name and SKU.
Target, to be benchmarked in STORE-4: p95 < 300 ms for a store with 5,000 items on the production database tier.

---

## 5. Stock-outs and the listing lifecycle

### 5.1 Public result table (brief §7), as implemented

| Item available | `listings.status` | `stock_state` | Public result |
| --- | --- | --- | --- |
| > 0 | approved | in_stock | Visible everywhere, as today |
| 0 | approved | out_of_stock | Detail page reachable with "Agotado"; discovery per D-5 |
| any | pending / rejected / draft | any | Not public (unchanged) |
| any | hidden (owner or admin) | any | Not public; restock never restores it |
| > 0 again | approved | in_stock | Visible again, same id/slug/history; no new publication event, no alert |
| — | sold | — | Unchanged V1 history; never linked |

### 5.2 Discovery (recommended default for D-5)

- `fetchCatalogPage()` and category landing pages add `.or('stock_state.is.null,stock_state.eq.in_stock')`. The new
  partial index covers it.
- Store page (`app/tiendas/[slug]`) shows out-of-stock items after in-stock ones, labeled "Agotado", so the store's
  range stays visible.
- Detail page: reachable, "Agotado" tag beside the price, WhatsApp button relabeled to ask about restock (copy to be
  set in UX review), `robots: noindex, follow` while out of stock, and excluded from `app/sitemap.ts`. When stock
  returns it becomes indexable again with the same URL.
- Favorites keep working because `listing_is_public()` is unchanged. Price-drop alerts are not sent while out of
  stock (extra predicate in `notify_favorite_price_drop()`), because a price drop on something not purchasable is
  noise. The next lower price after restock alerts normally.

### 5.3 Marking sold

For a listing linked to inventory, `set_owned_listing_lifecycle('sold')` raises
`INVENTORY_MANAGED_LISTING: Registra la venta desde Inventario.` The UI hides the "Marcar vendida" action for linked
listings. A store that sells a one-off piece and wants the V1 sold/verified-transaction flow unlinks the listing first
(`unlink_inventory_listing`) and marks it sold as today. Admin's existing mark-sold path in `review_listing()` gets the
same guard. That keeps sold history and review eligibility exactly on the current contract (brief §28).

### 5.4 Alerts and first publication

`capture_listing_alert_publication()` gains one condition: a listing whose `stock_state = 'out_of_stock'` is not yet
"first public". The trigger also fires on `update of stock_state`, so the first transition to in-stock of an approved
listing records the first publication and matches saved searches once. Because the first-public marker is unique per
listing, every later restock is a no-op. `published_at` is not touched by stock changes.

### 5.5 Analytics

Existing listing analytics are unchanged. Stock movements do not create marketplace events. The store dashboard gets
its own labeled figures from the ledger ("Ventas registradas por la tienda", never revenue verified by Laria;
brief §8). If D-6 picks a purchase-request button, one event type `purchase_request_started` is added to the
taxonomy in PAY-1.

---

## 6. Existing data and the migration plan

### 6.1 Mapping existing store data

Nothing is converted automatically (brief §7):

- Existing store listings stay unlinked (`stock_state = null`) and behave exactly as today.
- `sold` listings are never linked; the RPC rejects it.
- A merchant adopts an existing listing explicitly, one at a time ("Controlar stock" on the listing row: enter SKU and
  quantity → item + `opening_balance` + link), or in bulk through the import (§7.6): export the current listings with
  their listing id column, fill SKU and stock, reimport. The preview shows each adoption before commit.

### 6.2 Migration sequence

| Sub-sprint | Migration | Contents | Changes existing behavior? |
| --- | --- | --- | --- |
| STORE-1 | `…_store_inventory_foundation.sql` | §3 tables, enums, indexes; `listings.stock_state`; `listings(id, store_id)` unique index; RPCs §4; updated `protect_listing_admin_fields`, `complete_public_submission`, `set_owned_listing_lifecycle`, `review_listing`, `update_owned_listing`, `capture_listing_alert_publication`, `notify_favorite_price_drop` | Only for listings an operator links. All existing rows have `stock_state = null`. |
| STORE-2 | `…_store_inventory_import.sql` | Import tables §7.2, private `store-imports` bucket and policies, commit RPCs, ledger FK to sessions, retention job | No |
| STORE-3 | `…_store_import_photos_quota.sql` | Photo asset/assignment tables, private `store-import-photos` bucket, photo-reference validator extension, `enforce_store_inventory_cap` reads `listing_allowance`, admin quota RPC | Cap message text only; value stays 50 for every store |
| PAY-1 | `…_store_payment_methods.sql` | §11 tables and RPCs | No |

Each migration is replayable from a clean `supabase db reset`, comes with a `tests/store-ops-N.sql` rolled-back
fixture, and is applied to production only after owner approval, following `docs/database.md` §Manual Migration
Reminder (CLI `migration list` first, schema before code).

### 6.3 Rollback

Because every change is additive and gated by `inventory_enabled`, rolling the application back leaves linked
listings with a `stock_state` that the old code ignores; an out-of-stock listing would then look available. The
rollback runbook therefore has one SQL step: `update listings set stock_state = null` under the controlled flag
(logged), before or with the code rollback. Schema rollback is not planned; dropped tables would lose ledger history.

---

## 7. Bulk import (STORE-2)

### 7.1 Processing model

Constraints: Vercel Hobby (no long-running workers, daily cron only), no queue. The design avoids long requests by
making every step small, checkpointed and idempotent, and lets the merchant's open import page drive progress:

```
Browser                                  Server route (Node, ≤60 s)            Postgres
──────                                   ──────────────────────────            ────────
1. POST /api/store/imports               create session (owner-bound) ───────► store_import_sessions
   ◄─ session id + signed upload target
2. PUT file → private bucket store-imports/{uid}/{session}/source.{csv|xlsx}  (≤5 MB, storage policy)
3. loop: POST /api/store/imports/{id}/step
                                         lease session (locked_until, 90 s)
                                         do ONE bounded unit:
                                           parse  ≤ 1,000 rows
                                           validate/match ≤ 100 rows
                                           commit ≤ 50 rows (one RPC = one tx)
                                         checkpoint + release lease ──────────► rows, session.progress
   ◄─ progress, next action
4. merchant maps columns / reviews preview / confirms (UI)
5. loop step again for commit, then for publication
```

- If the page closes, the session stops at its last checkpoint and resumes when reopened. The lease prevents two tabs
  processing the same session; a stale lease expires.
- A daily cron (the existing Hobby cron slot, or `pg_cron`) expires abandoned sessions and deletes their files. It
  never commits anything on the merchant's behalf.
- If imports grow past what this handles (D-3 limits), the same step function can be driven by Supabase Queues or a
  paid-tier cron without changing the data model.

### 7.2 Tables

`store_import_sessions`: `id, store_id, created_by, status, mode ('snapshot'), file_format, file_path, file_sha256,
file_bytes, sheet_name, header_row int, headers jsonb, column_mapping jsonb, mapping_confirmed_at, row_count,
counts jsonb, options jsonb (update_listings bool, publish_after bool), locked_until, lock_token, version,
error_code, expires_at, created_at, updated_at, committed_at, cancelled_at`.

Status flow: `uploaded → parsing → mapping_required → validating → ready → committing → committed`, with
`partially_committed`, `failed`, `cancelled`, `expired`. Only the server route transitions status, through RPCs that
check `lock_token`.

`store_import_rows`: `session_id, row_number (pk with session), raw jsonb (≤ 8 KB), parsed jsonb, sku_normalized,
planned_action ('create' | 'update' | 'adopt_listing' | 'unchanged' | 'error' | 'excluded'), issues jsonb
(code + field + Spanish message), catalog jsonb (§9), target_item_id, target_item_version, payload_fingerprint,
owner_decision ('include' | 'exclude'), commit_status ('pending' | 'applied' | 'conflict' | 'failed'),
applied_item_id, applied_movement_id, applied_at`. Unique `(session_id, sku_normalized)` where `planned_action <>
'error'` enforces "one SKU once per file".

Both tables: owner `SELECT` through RLS on `store_id`, no browser DML, cascade from session, deleted by retention.

### 7.3 Template and column mapping

- `GET /api/store/imports/template?format=xlsx|csv`: Spanish headings from the brief §9 plus the attribute columns for
  the chosen category, generated from `lib/instrument-filters.ts` (no second taxonomy), with two sample rows. In the
  XLSX template, SKU and Referencia externa columns are formatted as text so Excel keeps leading zeros.
- Mapping: headers are matched to fields by normalized Spanish/English synonyms (`sku`, `codigo`, `código`, `cod`,
  `stock`, `cantidad`, `existencias`, `precio`, `p. venta`, …). The merchant confirms or corrects the proposed mapping
  once; unknown columns are ignored and listed. The confirmed mapping is stored on the session and can be saved as the
  store's default for the next import.

### 7.4 Parsing untrusted spreadsheets

- **CSV**: UTF-8 (with or without BOM), falling back to Windows-1252 when the bytes are not valid UTF-8. Delimiter
  detected from the header line among `,`, `;` and tab (Peruvian Excel often writes `;`). RFC 4180 quoting. All cells
  read as strings.
- **XLSX**: an XLSX is a ZIP, so the server parser is itself an archive reader. Recommended: inflate with `fflate`
  using an entry allowlist (`[Content_Types].xml`, `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`,
  `xl/sharedStrings.xml`, `xl/styles.xml`, the one selected `xl/worksheets/sheetN.xml`), a running byte budget
  (≤ 40 MB uncompressed total, ≤ 100:1 ratio per entry, abort on exceed), and a SAX parser over the sheet. Cells are
  read as their stored value; a cell with a formula uses its cached value and gets a "Fórmula" warning; macros
  (`.xlsm`), external links and embedded objects are never read; `.xls` (binary) is rejected with a "Guarda como
  .xlsx o .csv" message. A mainstream library (SheetJS, ExcelJS) is the alternative; the deciding factor is whether
  it lets us bound decompression. Library choice is a Codex review item.
- **Identifiers**: SKU and Referencia externa are taken as text. If Excel stored them as numbers the row gets a
  warning ("Excel guardó el SKU como número; revisa ceros a la izquierda"). A value matching scientific notation
  (`^\d(\.\d+)?E[+-]?\d+$`) in an identifier column is an error, never coerced.
- **Prices**: whole soles only, using the existing `lib/price.ts` parser rules. `1.500` and `1,500` are ambiguous in
  Peru and are rejected with a message rather than guessed; `S/ 1500` and `1500` pass. No currency conversion.
- **Stock**: non-negative integer ≤ 100,000; decimals, negatives and text are row errors.
- **Dates**: not part of the template; if a mapped column contains Excel serial dates where text was expected, the row
  is flagged.
- Limits (D-3 defaults): 5 MB file, 2,000 data rows, 80 columns, 2,000 characters per cell (description follows the
  existing listing limit), one sheet per import.

### 7.5 Preview

Grouped counts with drill-down, exactly the brief's §10 list: new items, updates to existing SKUs (with
current → new for each changed field, including stock 12 → 9 shown as "−3"), unchanged, adoptions of existing
listings, catalog matches to confirm, rows missing publication requirements, invalid values, duplicate SKUs in the
file, photo problems (STORE-3), and rows that would exceed the listing allowance. The merchant can exclude rows. The
confirm button states exactly what will happen ("Crear 120, actualizar 34, sin cambios 210").

### 7.6 Update semantics and commit

- Lookup key `(store_id, sku_normalized)`. Missing SKUs in a later file are ignored (never zeroed, never archived).
- **Snapshot mode only** in STORE-2: the spreadsheet's Stock is the counted total. On commit the delta is
  `snapshot − on_hand` and is recorded as `import_reconciliation` with the session and row number.
- **Adoption**: a row carrying an existing listing id (from Laria's export) creates or updates the item and links it,
  after the same checks as `link_inventory_listing`.
- **Listing content**: by default the import updates inventory fields only (name, stock, price, threshold, external
  reference). If the merchant ticks "Actualizar también las publicaciones", changes to linked listings go through
  `update_owned_listing()` exactly like a manual edit: price/description/attributes apply immediately, and moderated
  fields (title, category, type, brand, model, condition, photos) create or amend a pending revision for a normal
  Tienda, or apply directly for an active Tienda Verificada.
- **Commit RPC** `commit_store_import_chunk(p_session_id, p_lock_token, p_row_numbers int[])`, ≤ 50 rows, one
  transaction, called with the owner's session (not the service role) so `auth.uid()` binds ownership. Linked listings
  and then items are locked in id order (§4.3). Per row:
  - idempotency key `import:{session_id}:{row_number}` and the row's `payload_fingerprint`;
  - `target_item_version` must still match; otherwise the row becomes `conflict` and is not applied (stale preview
    guard); the merchant can refresh those rows, which re-reads current values and re-plans them;
  - a row already `applied` is skipped, so retrying a chunk after a timeout cannot double-apply.
- **Partial failure**: chunks commit independently; the session ends `committed` or `partially_committed` with a
  per-row report. Rerunning the commit step only processes `pending`/`failed` rows.
- **Result report**: on screen and downloadable as CSV (formula-safe, §7.8).

### 7.7 Publication from an import

A separate, explicit step ("Publicar seleccionados") after inventory is committed. Eligible rows (complete fields,
2–10 assigned photos, price, condition, category/type) are published in chunks of ≤ 20 through the same internal
insert as `complete_public_submission(kind='store_listing')`, extracted into
`laria_private.insert_store_listing(...)` so both paths share one implementation. Each chunk respects the allowance
trigger; rows over the allowance stay unpublished with "Sin cupo de publicaciones". Normal Tienda rows enter `pending`;
the Admin queue therefore grows by the number published, which matters for moderation capacity (D-1). Verified
active stores publish directly when requirements pass. A pending store's rows enter `pending` and stay private.

### 7.8 Export

`GET /api/store/inventory/export?format=csv|xlsx[&ids=…]`. Cells starting with `=`, `+`, `-`, `@`, tab or CR are
prefixed with `'` (OWASP CSV injection guidance); numbers that are genuinely numeric (stock, price) are written as
numbers in XLSX and plain digits in CSV. The export includes the listing id column used for adoption.

### 7.9 Retention

Source files and staged rows: deleted 30 days after commit or cancellation; uncommitted sessions expire after 7 days of
inactivity. Committed effects live in the ledger and the change log, which are permanent. The import result report is
kept as a compact JSON summary on the session row.

---

## 8. Bulk photos (STORE-3)

### 8.1 Where the archive is opened

The server never decompresses a merchant ZIP. The browser opens the ZIP (`fflate`, streamed, one entry at a time) or
accepts a multi-file selection (easier on phones), and uploads each image individually to a server-issued path. The
server's security boundary is per-object validation, so a ZIP bomb or traversal path can at worst break the
merchant's own tab:

1. Browser lists entries; ignores directories, `__MACOSX/`, dotfiles and non-image extensions; uses only the base
   name for matching, never the archive path; caps at 600 entries and 5 MB declared and actual per entry (decoder
   aborts beyond the cap).
2. Browser asks `POST /api/store/imports/{id}/photo-uploads` for up to 25 upload slots. The server creates
   `store_import_photo_assets` rows (`id`, session, store, sanitized original name for display, parsed SKU and
   sequence, `status='awaiting_upload'`) and returns signed upload URLs for
   `store-import-photos/{uid}/{session}/{asset_id}.{ext}`. Names are server-generated, so an archive name cannot
   overwrite anything.
3. After upload, `POST …/photo-uploads/complete` validates each object server-side: size ≤ 5 MB, magic bytes match
   JPEG/PNG/WebP and the declared type, dimensions read from the header (no full decode) within 400–8000 px per side,
   SHA-256 recorded. Failures are marked `rejected` with a reason and the object is deleted.
4. Optional, recommended: the browser re-encodes to JPEG/WebP at ≤ 2400 px before upload, which strips EXIF location
   data and cuts upload size. The server does not trust that this happened.

### 8.2 Matching

- Filename convention `SKU__NN.ext`: split on the **last** `__`; `NN` must be 1–2 digits (1–10); the SKU part is
  normalized like `sku_normalized` and matched only against SKUs in this session and this store's items.
- Alternatives: a manifest CSV (`archivo;SKU;orden`) or the spreadsheet's `Foto(s)` column with file names separated
  by `;`. When both are present, the explicit mapping wins and the conflict is shown.
- Statuses shown in the preview: assigned, unmatched SKU, duplicate sequence, duplicate image (same hash), more than 10,
  fewer than 2 (item stays unpublishable), rejected file. Ambiguous cases block publication of that item until the
  merchant resolves them. No visual guessing.
- Manual correction: thumbnails per item with drag to reorder, move to another SKU (same session only), remove.

### 8.3 Tables

`store_import_photo_assets` (described above) and `store_import_photo_assignments (session_id, row_number, asset_id
unique, sort_order, unique (session_id, row_number, sort_order))`.

### 8.4 From staged photo to listing photo

Publication writes `listing_photos.image_url = /api/listing-images/{uid}/store-imports/{session}/{asset}.{ext}` and
extends the two existing places that already do this for Sprint 4 edits:

- `listing_photo_set_is_valid()` accepts the new path pattern only when the asset row is `validated`, belongs to the
  same store and owner, and (for a new listing) to the session that is publishing it;
- `/api/listing-images/[...path]` resolves the new prefix with the same reference check (public only when the listing
  is public, owner/admin otherwise).

No bytes are copied. Performance of proxied images for an entire store catalog is a STORE-4 benchmark item; if it is
too slow, the fallback is to copy objects into the public `listing-photos` bucket at approval time.

### 8.5 Cleanup

Unassigned and rejected assets are deleted when the session is committed, cancelled or expired, using a claim table in
the style of `listing_photo_cleanup_claims` so an object referenced by any listing or revision is never deleted.

---

## 9. Catalog autofill in the importer

The rule from the brief: one resolution service, no second algorithm.

- **Dependency**: the importer uses `lib/catalog-intelligence/autofill.ts` (`buildAutofillSuggestion`,
  `buildProvenance`) and `catalog-resolver.ts` once the autofill sprint has merged them into `main`, and the
  persistence table that sprint introduces (proposed there as `listing_catalog_links`). STORE-3's catalog step is
  scheduled after that merge. If STORE-3 must ship first, it ships without catalog matching rather than with a copy.
- **Batching**: the resolver calls `catalog_match` and `catalog_lookup` per query. For imports, add one SQL wrapper,
  `catalog_match_many(p_queries jsonb)` (≤ 100 `{brand, model}` pairs), which runs the existing functions per element
  in one statement (`lateral`) and returns the same row shape. It adds no matching logic; the resolver gets a
  `resolveMany()` that calls it. Identical brand+model pairs within a file are resolved once.
- **Per-row record**: `store_import_rows.catalog` stores the merchant input, the lookup summary, the suggested fields,
  and later the merchant's accepted/overridden values, in the prototype's `AutofillProvenance` shape. When an item is
  created, `catalog_product_id`/`catalog_variant_id` go on the item; when a listing is published, the same provenance
  is written to the autofill sprint's link table so Jev later sees store listings exactly like Particular ones.
- **Confirmation**: only an exact, `AUTO`-tier match pre-selects; `REVIEW`, family, conflicting and ambiguous results
  are shown as "Requiere revisión" with candidates; insufficient results leave the row as typed. Variant-dependent
  attributes fill only when the row names the variant (prototype rule).
- **Moderation**: autofill never changes publication authority. Jev auto-approval is not used by imports.

---

## 10. Listing allowance (STORE-3)

- `enforce_store_inventory_cap()` reads `coalesce(store_operation_settings.listing_allowance, 50)` inside the
  existing advisory lock. Everything else about the trigger (what counts, transitions that consume capacity) stays.
- `admin_set_store_listing_allowance(p_store_id, p_allowance, p_reason)`: admin only, reason required, writes
  `admin_audit_actions` with before/after. Lowering below the current count is allowed and only blocks new
  capacity-consuming transitions; nothing is hidden automatically.
- UI reads the allowance instead of the literal 50 (`inventario/page.tsx` meta line and the "Publicar" gate).
- Inventory items, stock units and unpublished staged rows never count.
- Recommended for D-1: keep 50 by default; Admin grants pilot stores an explicit higher allowance (e.g. 500). Decide
  a standard verified-store allowance after the pilot shows moderation load.

---

## 11. Assisted commerce (PAY-1)

### 11.1 Recommendation for Pilot A (D-6, D-7)

Start with the smallest thing that is honest:

- Verified stores declare which **methods** they accept: `efectivo_al_recoger`, `yape_plin`, `pos_tarjeta_al_recoger`,
  `link_de_pago`. Laria shows these as plain facts on the store page and the store's listing pages ("Medios de pago
  que acepta la tienda"), with the disclaimer that payment is made directly to the store.
- "Solicitar compra" opens WhatsApp with a prefilled message (listing title, SKU, quantity, link). The existing
  `whatsapp_contact` event records it, with `metadata.intent = 'purchase'` (or the new event type in §5.5).
- **Payment links are not displayed on Laria in Pilot A.** The merchant sends their provider's link in WhatsApp. This
  removes the link-validation, phishing and "Laria checkout" ambiguity entirely while still delivering "the buyer can
  pay remotely". If the pilot shows that buyers need the link on the page, Pilot A.2 adds a provider registry with
  hostname allowlists, server-side validation and no shorteners, as in the brief §22.
- No paid state, no reservation, no order record. Stock is reduced when the merchant records the sale.

### 11.2 Schema

```sql
create type public.store_payment_method as enum
  ('efectivo_al_recoger', 'yape_plin', 'pos_tarjeta_al_recoger', 'link_de_pago');

create table public.store_payment_methods (
  store_id        uuid not null references public.stores(id) on delete cascade,
  method          public.store_payment_method not null,
  status          text not null default 'pending_review'
                  check (status in ('pending_review', 'approved', 'disabled')),
  holder_name     text check (holder_name is null or char_length(holder_name) <= 140),
  provider_label  text check (provider_label is null or char_length(provider_label) <= 60),
  owner_note      text check (owner_note is null or char_length(owner_note) <= 280),
  reviewed_by     uuid references public.profiles(id),
  reviewed_at     timestamptz,
  review_reason   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (store_id, method)
);
```

- Owner proposes through `set_store_payment_method(method, holder_name, provider_label, note)`; it becomes
  `pending_review`. Admin approves with `admin_review_store_payment_method(...)` after confirming the account holder
  matches the verified business (RUC/razón social); audited.
- Public read through a function `get_store_payment_methods(store_id)` that returns approved methods **only** when
  the store is `active` and `is_verified` at read time. Revoking verification hides them immediately without
  touching the rows.
- No Yape numbers, account numbers, card data or provider secrets are stored. Holder name is shown to Admin only.

### 11.3 Pilot B (structured purchase requests), sketch only

Built only if Pilot A shows demand (brief §20): `purchase_requests` and `purchase_request_lines` with a price snapshot,
the brief's lifecycle, and `payment_status_source in ('merchant_assertion')` as the only source until a provider
callback exists. Reservations arrive here, using the `reservation` / `reservation_release` movement types and
`quantity_reserved` already in place, with a bounded `expires_at` and a cron release. This needs its own design and
approval.

### 11.4 Legal and copy

Terms and Privacy currently state that Laria does not process payments. Pilot A keeps that true; the update adds that
verified stores may list accepted methods, that payment, receipts (comprobantes), refunds and complaints (Libro de
Reclamaciones) are the store's, and what purchase-intent data Laria records. The brief's §22 compliance review
(consumer protection, Ley 29733 personal data, electronic invoicing responsibility, provider referral terms) is a
gate before the public pilot; it is a human/legal task, not code.

---

## 12. External synchronization (SYNC-1, contract only)

Nothing is built until a pilot merchant's system is known (brief §23). The schema already leaves room:

- `stock_source = 'external'`, `external_reference`, the `external_sync` movement type and `external_event_ref`.
- Future tables: `store_external_connections (store_id, provider, direction, field_authority jsonb, credentials_ref,
  cursor, last_success_at, status, last_error)`, `store_external_item_mappings (connection_id, external_id, item_id,
  location)`, `store_sync_events (connection_id, external_event_id unique, source_revision, received_at,
  outcome)`.
- Reconciliation rule when the external system owns stock: an event with an older `source_revision` than the last
  applied one is rejected as stale; a newer one becomes an absolute `external_sync` movement (like a stock count), so a
  POS saying 7 when Laria says 9 produces a logged −2 with the source revision. Laria-side sales in between are
  visible as separate movements, so the difference is explainable.
- First connector expected to be a scheduled CSV pull, reusing the STORE-2 parser and snapshot semantics.

---

## 13. UI surfaces

All in Spanish, composed from `components/ui/` and `lib/ui/status.ts`, one yellow action per view, 390 px first.

### 13.1 Inventario (`/mi-cuenta/tienda/inventario`)

- Summary tiles: SKUs, publicadas, unidades, stock bajo, agotados, en revisión / rechazadas, errores de importación.
- Toolbar: search (SKU, marca, modelo, nombre), filters in the existing `Sheet` on mobile, sort, "Importar" and
  "Nuevo SKU" actions.
- Table on desktop (new `components/ui/data-table.tsx`: semantic `<table>`, sticky header, row checkbox, keyboard
  focus per row; there is no table primitive today), stacked rows on phones (the current UX-6a card pattern).
- Columns per brief §8. Stock column shows "Disponible 7 · En tienda 7" (reserved appears only once reservations
  exist).
- Row actions: Registrar venta, Reponer stock, Ajustar, Editar, Ver publicación, Ocultar.
- Bulk bar: ajustar precio, umbral de stock bajo, ocultar, ajustar stock, exportar. Bulk confirmations list the
  affected SKUs.
- The current listing management table remains reachable as "Publicaciones" for listings not linked to inventory.

### 13.2 Item page (`/mi-cuenta/tienda/inventario/[itemId]`)

Stock card, movement history (newest first, keyset paged, each line with who, channel and reference), linked
publication with its status and pending changes, catalog match, SKU change (with reason), archive.

### 13.3 Stock actions (Sheet on mobile, dialog on desktop)

One component with a type switch: Registrar venta (cantidad, canal, referencia), Reponer stock, Devolución, Daño o
pérdida, Conteo (shows the quantity the merchant saw and fails clearly if it changed). The client generates the
idempotency key when the sheet opens, so a double tap or retry is safe.

### 13.4 Import wizard (`/mi-cuenta/tienda/inventario/importar`)

Steps: Subir archivo → Columnas → Revisar → Fotos → Confirmar → Resultado, with a progress bar driven by the step
loop, an error summary (`ErrorSummary`), and "Puedes cerrar esta página; la importación continúa cuando vuelvas" kept
honest by the checkpoint model.

### 13.5 Copy decisions needed (D-13)

The glossary rejects "producto", "artículo" and "ítem", and "Publicar" is the only publication verb. Proposed: the
inventory row is a **SKU** in tables and "referencia" in sentences; keep "Publicar seleccionados"; add glossary entries
for Inventario, Stock disponible, Agotado, Stock bajo, Registrar venta, Reponer stock, Ajustar stock, Importar desde
Excel, Asignar fotos, Requiere revisión; and add an `inventory` domain to `lib/ui/status.ts` (Disponible, Stock bajo,
Agotado, Archivado). "Registrar venta" sits close to "Compras y ventas" (verified transactions); the label should make
clear it is the store's own record. Public copy: "Agotado" and "Disponibilidad informada por la tienda". Exact counts
are not shown publicly by default (D-14).

---

## 14. Test plans

Each sub-sprint ships a rolled-back SQL fixture (`tests/store-ops-N.sql`), unit tests (`tests/store-ops-*.test.cjs`)
and integration tests against local Supabase (`tests/store-ops-*.integration.cjs`). Concurrency tests use separate
database connections (two `pg` clients or two authenticated Supabase clients), not `Promise.all` on one connection.

### 14.1 Concurrency (STORE-1, STORE-2)

| Case | Method | Expected |
| --- | --- | --- |
| Last-unit race | Item with 1 unit; 2–20 parallel `sale` calls, distinct keys, separate connections, repeated 200× | Exactly one succeeds; others `STOCK_INSUFFICIENT`; ledger sum equals on-hand |
| Same-key retry race | 10 parallel calls, same key and payload | One movement; all return the same id |
| Same key, different payload | Second call with different quantity | `IDEMPOTENCY_KEY_REUSED`, no change |
| Stale count | Count with version v while a sale commits v→v+1 | `INVENTORY_VERSION_CONFLICT` |
| Bulk vs single | Bulk on items A,B,C while singles hit C then A | No deadlock (lock order), all consistent |
| Stock vs listing edit | Sale on a linked item while the owner edits the listing price | No deadlock (listing → item order on both paths) |
| Import commit vs manual sale | Commit chunk with preview version while merchant sells | Row becomes `conflict`; sale preserved |
| Chunk retry | Kill the request after commit, retry same chunk | No duplicate items, movements or photos |
| Cap race | Two publications at allowance − 1 | One succeeds (existing advisory lock) |
| Price write-through vs listing edit | Concurrent `update_owned_listing` price edit and bulk price | Final listing price equals item price; one price-drop notification per actual decrease |

### 14.2 Security and tenancy

- RLS matrix per table for anon, Particular, other store owner, own store owner, admin: select/insert/update/delete,
  including direct PostgREST attempts on `quantity_on_hand`, `stock_state`, ledger rows and settings.
- Every RPC called with another store's item/listing/session id returns the same not-owned error.
- `stock_state` cannot be changed by the owner through `listings` update or `update_owned_listing` payloads.
- Admin RPCs reject a user whose profile says `admin` but whose Auth `app_metadata` does not.
- Import: CSV with `=HYPERLINK(...)` cells round-trips through export prefixed; XLSX with formulas, external links,
  `xl/vbaProject.bin`, a 1 GB-inflating sheet, a 10,000:1 entry, a non-XLSX ZIP renamed `.xlsx`, a CSV of 5 MB on one
  line: all rejected or bounded with a clear message and no worker crash.
- Photos: path-traversal names (`../../x.jpg`, absolute, backslash, Unicode lookalikes) cannot influence storage
  paths; polyglot files (JPEG header + HTML), SVG, HEIC, oversize dimensions are rejected; uploading to another
  session's or store's slot fails at the storage policy and at registration; a validated asset of store A cannot be
  attached to a listing of store B.
- No service-role key in any client bundle (`grep` in the built `.next/static`).

### 14.3 Failure modes

| Failure | Expected behavior |
| --- | --- |
| Step request times out mid-parse | Lease expires; next step resumes from the last checkpointed row |
| Two tabs on one import | Second gets "La importación está en curso en otra ventana" |
| Browser closed during commit | Committed chunks stay; session resumes; no double apply |
| Storage upload fails | Asset stays `awaiting_upload`, retried or expired; never assigned |
| Catalog RPC slow/unavailable | Rows marked "Sin coincidencia por ahora"; import continues without autofill |
| Store hidden/rejected mid-import | Commit and publication refuse; staged data kept read-only |
| Verification revoked mid-publication | Remaining rows enter `pending` (decided per row at insert, as today) |
| Allowance reached mid-publication | Remaining rows stay unpublished with reason |
| Linked listing admin-hidden, then restock | Stays hidden; `stock_state` updates silently |
| Code rollback with linked listings | Runbook step resets `stock_state` (§6.3) |

### 14.4 Mandatory regressions (brief §34)

Run the existing suites unchanged at every gate: `tests/store-sprint-2.sql`, `listing-sprint-3.sql`, `sprint-3-1.sql`,
`sprint-4-photos.sql`, `sprint-5-favorites.sql`, `sprint-6-transactions-reviews.sql`, `sprint-7-email-alerts.sql`,
`sprint-8-admin-reports.sql`, `marketplace-performance.sql`, all `*.test.cjs` and `*.integration.cjs`, plus
`tests/ux-copy.test.cjs` and `tests/ux-contrast.test.cjs`. New explicit regressions: an unlinked store listing behaves
byte-for-byte as before (lifecycle, sold, relist, cap, alerts, price drop); a Particular listing is untouched by every
new trigger branch.

### 14.5 Performance

Seed a store with 5,000 items and 20,000 movements; measure `get_inventory_page` p95 for each sort and filter, the
catalog page query with the new predicate, a 2,000-row import end to end (parse, match, commit) on Vercel, and proxied
image throughput for a 24-card store page. Targets are set from these numbers in STORE-4, not promised now.

---

## 15. Acceptance families

New IDs are added to `acceptance/cases.tsv` only after owner review, never renumbering existing ones. Proposed
prefixes, to avoid the existing `STORE-` and `PHOTO-`:

| Prefix | Covers | Approx. cases |
| --- | --- | --- |
| `INV-` | Brief §33 STOCK list + §5 public result table + quota | 20 |
| `IMP-` | Brief §33 IMPORT list | 16 |
| `IPH-` | Brief §33 PHOTOS list (import photos) | 12 |
| `PAY-` | Brief §33 PAY list, scoped to Pilot A | 12 |
| `SYNC-` | Brief §33 SYNC list, written when SYNC-1 is scoped | 10 |

`acceptance/sprints.tsv` gets rows for STORE-1…4 and PAY-1 naming these prefixes plus the regression prefixes they
must re-run (`STORE, CAP, LIFE, REV, PHOTO, FAV, PDA, ALERT, TX, SEO`).

---

## 16. Sub-sprints, estimates and dependencies

Estimates are relative effort for one implementer including tests and docs: S ≈ 2–3 days, M ≈ 1 week, L ≈ 2 weeks.

| Sub-sprint | Contents | Size | Depends on | Exit |
| --- | --- | --- | --- | --- |
| **STORE-1a** Inventory core | §3, §4 RPCs, ledger, adoption of one listing, `stock_state`, §5 lifecycle/discovery/alerts, settings gate | L | Owner decisions D-2, D-4, D-5, D-8, D-9, D-14 | SQL + concurrency suite green locally |
| **STORE-1b** Inventory UI | §13.1–13.3, export, dashboard tiles | M | STORE-1a, D-13 copy | Merchant can run stock in Laria on local/staging |
| **STORE-2** Import | §7 (CSV/XLSX, mapping, preview, snapshot commit, adoption, report) | L | STORE-1a, D-3 | Spreadsheet import and safe reimport |
| **STORE-3a** Photos | §8 | M | STORE-2 | ZIP/multi-file assignment with correction |
| **STORE-3b** Publication + quota | §7.7, §10 | M | STORE-3a, D-1 | Batch publication through existing moderation |
| **STORE-3c** Catalog in import | §9 | S–M | Autofill sprint merged to `main` | Import rows carry provenance |
| **STORE-4** Pilot hardening | Real merchant files, §14.5 benchmarks, fixes | M (open-ended) | STORE-1…3, pilot stores | Selected stores operate on Laria |
| **PAY-1** Pilot A | §11.1–11.2, legal copy | S–M (code) + legal review | STORE-1, D-6, D-7, compliance review | Verified stores show accepted methods and purchase requests |
| **SYNC-1** | §12 for one merchant | Unknown until discovery | STORE-2 parser, merchant data | One feed reconciled |

Critical path: STORE-1a → STORE-2 → STORE-3a → STORE-3b. PAY-1 can run in parallel after STORE-1a. STORE-3c waits on
the autofill sprint. Each box is approved before it starts and accepted before the next box that depends on it.

---

## 17. Independent Codex review points

Codex is not available in this cloud session. These items should go to Codex (or another independent reviewer) before
the corresponding code is merged; each is self-contained:

1. **Stock concurrency** (STORE-1a): `record_stock_movement`, `apply_bulk_stock_operations`, the lock order between
   item and listing in `apply_inventory_price` vs `update_owned_listing`, and the concurrency test harness itself.
2. **Schema and listing invariants** (STORE-1a): composite FK, `stock_state` protection in
   `protect_listing_admin_fields`, the sold guard, alert-publication change, price-drop change; confirm no path lets a
   Particular or unlinked listing behave differently.
3. **Import security** (STORE-2): XLSX reader choice and decompression bounds, CSV parsing, formula handling,
   export sanitization, lease/idempotency of the step model.
4. **Photo pipeline** (STORE-3a): storage policies for the new buckets, server-side validation, the photo-reference
   validator and image proxy extensions, cleanup claims.
5. **Quota** (STORE-3b): allowance read inside the existing advisory lock, admin RPC and audit.
6. **Payment boundary** (PAY-1): method eligibility tied to live verification, no money state, public read function,
   Terms/Privacy diff.

---

## 18. Owner decisions (brief §36) with recommended defaults

Implementation can proceed on the defaults for anything not overruled.

| # | Decision | Recommended default |
| --- | --- | --- |
| D-1 | Store quota | Keep 50; Admin grants explicit pilot allowances (e.g. 500), audited. Revisit a verified-store standard after the pilot. |
| D-2 | Inventory scope | All approved Tiendas may use inventory, but enable it per store (`inventory_enabled`) during the pilot. Payments only for Tienda Verificada. |
| D-3 | Import limits | 5 MB file, 2,000 rows, 80 columns; 600 photos per session, 5 MB each. Adjust after real merchant files. |
| D-4 | Reservations | Deferred until purchase requests exist (column kept at 0). |
| D-5 | Stock-out visibility | Detail page reachable with "Agotado", `noindex`, out of sitemap and catalog; listed last on the store page; no alerts until in stock. |
| D-6 | Pilot A UX | WhatsApp-only "Solicitar compra"; no structured requests yet. |
| D-7 | Payment providers | No links shown on Laria in Pilot A; methods only. Provider registry only if Pilot A.2 is needed. |
| D-8 | Store personnel | Owner-only. `store_members` roles stay unused. |
| D-9 | SKU policy | Letters, digits, `.`, `_`, `-`, ≤ 64, case-insensitive unique; `LAR-000001` generated; changes only through the audited SKU-change action. |
| D-10 | Multiple locations | Deferred. |
| D-11 | Pricing | No subscription or commission in the pilot. |
| D-12 | Order-based reviews | Deferred; stock sales never unlock reviews. |
| D-13 | Glossary for inventory | "SKU" / "referencia" instead of "producto"; new labels per §13.5. Needs the UX owner's sign-off. |
| D-14 | Public stock counts | Show only Disponible / Agotado (optionally "Últimas unidades" under the threshold), not exact counts. |
| D-15 | Marking sold on a linked listing | Blocked; unlink first to use the V1 sold/verified-transaction flow (§5.3). |
