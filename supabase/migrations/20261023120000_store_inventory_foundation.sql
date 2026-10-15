-- STORE-1a: store inventory core (docs/store-operations/design.md §3–§6, owner decisions D-2, D-4, D-5, D-8, D-9,
-- D-14, D-15 at their accepted defaults).
--
-- Purely additive. A listing behaves exactly as before until its store owner links it to an inventory item, and only a
-- store an Admin has enabled (store_operation_settings.inventory_enabled) can do that. Every write goes through a
-- security definer function bound to the caller; browser roles can only read their own rows.
--
-- Invariants this migration maintains:
--   * Stock never changes listings.status, and moderation never changes stock.
--   * listings.stock_state is null exactly when no inventory item is linked; only the functions below write it.
--   * A linked listing cannot become `sold` (D-15); the store unlinks it first to use the V1 sold flow.
--   * Lock order on every path: idempotency key (advisory lock) → linked listing → inventory item. Bulk paths lock all
--     listings, then all items, each in id order.
--   * store_stock_movements and store_inventory_changes are append-only.
--   * quantity_reserved has no writer yet (D-4); every function leaves it at zero.

-- ------------------------------------------------------------------ types

create type public.inventory_status as enum ('active', 'archived');
create type public.stock_source as enum ('manual', 'import', 'external');
create type public.stock_movement_type as enum (
  'opening_balance', 'manual_adjustment', 'stock_count', 'sale', 'return', 'restock',
  'damage_or_loss', 'import_reconciliation', 'reservation', 'reservation_release', 'external_sync'
);
create type public.stock_channel as enum (
  'tienda_fisica', 'whatsapp_laria', 'redes_sociales', 'otro',       -- where a sale or return happened
  'panel', 'importacion', 'administracion', 'sistema', 'integracion' -- where any other movement came from
);

-- ------------------------------------------------------------------ settings

-- Per-store operational settings, kept off `stores` because active stores are publicly readable. A missing row means
-- the V1 defaults (inventory disabled), so no backfill is needed. Only Admin functions write it.
create table public.store_operation_settings (
  store_id            uuid primary key references public.stores(id) on delete cascade,
  inventory_enabled   boolean not null default false,
  listing_allowance   integer not null default 50 check (listing_allowance between 1 and 2000),
  next_generated_sku  integer not null default 1 check (next_generated_sku > 0),
  updated_at          timestamptz not null default now(),
  -- Admin authority comes from the Auth JWT and an Admin may have no profile row (see admin_audit_actions).
  updated_by          uuid
);

create trigger store_operation_settings_set_updated_at
before update on public.store_operation_settings
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------ inventory items

-- Lets an inventory item reference (listing id, store id) so "the linked listing belongs to the same store" is a
-- database fact. Trivially unique because id is the primary key.
create unique index listings_id_store_idx on public.listings(id, store_id);

create table public.store_inventory_items (
  id                   uuid primary key default gen_random_uuid(),
  store_id             uuid not null references public.stores(id) on delete restrict,
  merchant_sku         text not null,
  sku_normalized       text not null,
  sku_generated        boolean not null default false,
  -- Catalog products are upserted by stable id and never deleted by the catalog loader (it marks them superseded),
  -- so a foreign key is safe. Variants absent from a new catalog build are deleted, so the variant is a plain uuid
  -- checked when it is written; a catalog reload can never fail on, or silently change, merchant data.
  catalog_product_id   uuid references public.catalog_products(id) on delete set null,
  catalog_variant_id   uuid,
  listing_id           uuid unique,
  product_name         text not null check (char_length(btrim(product_name)) between 2 and 140),
  variant_label        text check (variant_label is null or char_length(variant_label) between 1 and 80),
  quantity_on_hand     integer not null default 0 check (quantity_on_hand between 0 and 1000000),
  quantity_reserved    integer not null default 0 check (quantity_reserved >= 0),
  quantity_available   integer generated always as (quantity_on_hand - quantity_reserved) stored,
  low_stock_threshold  integer check (low_stock_threshold is null or low_stock_threshold between 0 and 100000),
  unit_price_pen       integer check (unit_price_pen is null or unit_price_pen > 0),
  inventory_status     public.inventory_status not null default 'active',
  stock_source         public.stock_source not null default 'manual',
  external_reference   text check (external_reference is null or char_length(external_reference) between 1 and 120),
  version              integer not null default 0 check (version >= 0),
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
create index store_inventory_items_store_updated_idx on public.store_inventory_items(store_id, updated_at desc, id desc);
create index store_inventory_items_store_available_idx on public.store_inventory_items(store_id, quantity_available, id)
  where inventory_status = 'active';
create index store_inventory_items_name_trgm_idx on public.store_inventory_items
  using gin (lower(product_name || ' ' || merchant_sku) extensions.gin_trgm_ops);
create index store_inventory_items_catalog_product_idx on public.store_inventory_items(catalog_product_id)
  where catalog_product_id is not null;

create trigger store_inventory_items_set_updated_at
before update on public.store_inventory_items
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------ stock ledger

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
  -- Plain uuids: the ledger is append-only, so an `on delete set null` reference could never be applied.
  actor_user_id        uuid,
  actor_kind           text not null check (actor_kind in ('owner', 'admin', 'system')),
  import_session_id    uuid,          -- foreign key added with the import tables (STORE-2)
  import_row_number    integer,
  external_event_ref   text check (external_event_ref is null or char_length(external_event_ref) <= 200),
  reference            text check (reference is null or char_length(reference) <= 120),
  reason               text check (reason is null or char_length(reason) <= 280),
  idempotency_key      text not null check (char_length(idempotency_key) between 8 and 200),
  request_fingerprint  text not null,
  item_version_after   integer not null,
  created_at           timestamptz not null default now(),

  constraint movement_math check (on_hand_after = on_hand_before + on_hand_delta
                                  and reserved_after = reserved_before + reserved_delta),
  -- Absolute movements ("I counted 9") may match what was there; relative ones must change something.
  constraint movement_nonzero check (on_hand_delta <> 0 or reserved_delta <> 0
    or movement_type in ('opening_balance', 'stock_count', 'import_reconciliation', 'external_sync')),
  constraint movement_opening_from_zero check (movement_type <> 'opening_balance' or on_hand_before = 0),
  constraint movement_decrease_sign check (movement_type not in ('sale', 'damage_or_loss') or on_hand_delta < 0),
  constraint movement_increase_sign check (movement_type not in ('restock', 'return') or on_hand_delta > 0)
);

create unique index store_stock_movements_idem_idx on public.store_stock_movements(store_id, idempotency_key);
create index store_stock_movements_item_idx on public.store_stock_movements(item_id, created_at desc, id desc);
create index store_stock_movements_store_idx on public.store_stock_movements(store_id, created_at desc, id desc);

-- ------------------------------------------------------------------ non-stock audit

-- SKU, price, detail, link and archive changes are not stock movements but are audited the same way.
create table public.store_inventory_changes (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete restrict,
  item_id        uuid not null references public.store_inventory_items(id) on delete restrict,
  change_type    text not null check (change_type in
                   ('created', 'details', 'sku', 'price', 'link', 'unlink', 'archive', 'unarchive')),
  before         jsonb not null default '{}'::jsonb check (jsonb_typeof(before) = 'object'),
  after          jsonb not null default '{}'::jsonb check (jsonb_typeof(after) = 'object'),
  actor_user_id  uuid,
  actor_kind     text not null check (actor_kind in ('owner', 'admin', 'system')),
  reason         text check (reason is null or char_length(reason) <= 280),
  created_at     timestamptz not null default now()
);

create index store_inventory_changes_item_idx on public.store_inventory_changes(item_id, created_at desc, id desc);
create index store_inventory_changes_store_idx on public.store_inventory_changes(store_id, created_at desc, id desc);

create or replace function laria_private.reject_inventory_ledger_change()
returns trigger
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001',
    message = 'INVENTORY_LEDGER_APPEND_ONLY: El historial de inventario no se puede modificar; registra una corrección.';
end;
$$;

create trigger store_stock_movements_append_only
before update or delete on public.store_stock_movements
for each row execute function laria_private.reject_inventory_ledger_change();
create trigger store_stock_movements_no_truncate
before truncate on public.store_stock_movements
for each statement execute function laria_private.reject_inventory_ledger_change();
create trigger store_inventory_changes_append_only
before update or delete on public.store_inventory_changes
for each row execute function laria_private.reject_inventory_ledger_change();
create trigger store_inventory_changes_no_truncate
before truncate on public.store_inventory_changes
for each statement execute function laria_private.reject_inventory_ledger_change();

-- One receipt per bulk request, so a retried batch returns its first result instead of applying twice.
create table laria_private.store_inventory_batch_receipts (
  store_id             uuid not null references public.stores(id) on delete cascade,
  batch_key            text not null check (char_length(batch_key) between 8 and 160),
  operation            text not null,
  request_fingerprint  text not null,
  result               jsonb not null,
  actor_user_id        uuid,
  created_at           timestamptz not null default now(),
  primary key (store_id, batch_key)
);

-- ------------------------------------------------------------------ listings

-- Null: not inventory-managed (every existing row). Otherwise a denormalized copy of "the linked item has available
-- units", written in the same transaction as the movement that changes it. Public: it backs the "Agotado" label.
alter table public.listings add column stock_state text
  check (stock_state is null or stock_state in ('in_stock', 'out_of_stock'));

create index listings_public_in_stock_idx on public.listings(published_at desc, id)
  where status = 'approved' and stock_state is distinct from 'out_of_stock';

-- ------------------------------------------------------------------ RLS and grants

alter table public.store_operation_settings enable row level security;
alter table public.store_inventory_items enable row level security;
alter table public.store_stock_movements enable row level security;
alter table public.store_inventory_changes enable row level security;
alter table laria_private.store_inventory_batch_receipts enable row level security;

revoke all on public.store_operation_settings, public.store_inventory_items,
  public.store_stock_movements, public.store_inventory_changes from public, anon, authenticated;
revoke all on laria_private.store_inventory_batch_receipts from public, anon, authenticated;
grant select on public.store_operation_settings, public.store_inventory_items,
  public.store_stock_movements, public.store_inventory_changes to authenticated;

create policy "Store owners can read own operation settings" on public.store_operation_settings
  for select to authenticated using (public.is_store_owner(store_id));
create policy "Admins can read operation settings" on public.store_operation_settings
  for select to authenticated using (public.is_admin());
create policy "Store owners can read own inventory" on public.store_inventory_items
  for select to authenticated using (public.is_store_owner(store_id));
create policy "Admins can read inventory" on public.store_inventory_items
  for select to authenticated using (public.is_admin());
create policy "Store owners can read own stock movements" on public.store_stock_movements
  for select to authenticated using (public.is_store_owner(store_id));
create policy "Admins can read stock movements" on public.store_stock_movements
  for select to authenticated using (public.is_admin());
create policy "Store owners can read own inventory changes" on public.store_inventory_changes
  for select to authenticated using (public.is_store_owner(store_id));
create policy "Admins can read inventory changes" on public.store_inventory_changes
  for select to authenticated using (public.is_admin());

-- ------------------------------------------------------------------ internal helpers

create or replace function laria_private.raise_inventory_error(p_code text, p_message text, p_detail jsonb default null)
returns void
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001', message = p_code || ': ' || p_message,
    detail = coalesce(p_detail::text, '');
end;
$$;

create or replace function laria_private.inventory_fingerprint(p_request jsonb)
returns text
language sql
immutable
as $$ select encode(sha256(convert_to(p_request::text, 'UTF8')), 'hex'); $$;

create or replace function laria_private.inventory_request_key(p_key text, p_max_length integer default 200)
returns text
language plpgsql
immutable
as $$
declare key text := btrim(coalesce(p_key, ''));
begin
  if char_length(key) < 8 or char_length(key) > p_max_length or key !~ '^[A-Za-z0-9:._-]+$' then
    perform laria_private.raise_inventory_error('IDEMPOTENCY_KEY_INVALID',
      'La solicitud no tiene un identificador válido. Vuelve a intentarlo.');
  end if;
  return key;
end;
$$;

create or replace function laria_private.inventory_json_text(p_fields jsonb, p_key text, p_max_length integer)
returns text
language plpgsql
immutable
as $$
declare value jsonb := p_fields -> p_key; result text;
begin
  if value is null or value = 'null'::jsonb then return null; end if;
  if jsonb_typeof(value) <> 'string' then
    perform laria_private.raise_inventory_error('INVENTORY_FIELD_INVALID', 'Revisa el campo ' || p_key || '.',
      jsonb_build_object('field', p_key));
  end if;
  result := nullif(btrim(value #>> '{}'), '');
  if char_length(result) > p_max_length then
    perform laria_private.raise_inventory_error('INVENTORY_FIELD_INVALID', 'El campo ' || p_key || ' es demasiado largo.',
      jsonb_build_object('field', p_key, 'max_length', p_max_length));
  end if;
  return result;
end;
$$;

-- Whole numbers only: a JSON integer or a string of digits. "12.5", "1e3" and "12,0" are rejected, not rounded.
create or replace function laria_private.inventory_json_int(p_fields jsonb, p_key text)
returns integer
language plpgsql
immutable
as $$
declare value jsonb := p_fields -> p_key; raw text;
begin
  if value is null or value = 'null'::jsonb then return null; end if;
  if jsonb_typeof(value) = 'number' then raw := value::text;
  elsif jsonb_typeof(value) = 'string' then raw := btrim(value #>> '{}');
  else raw := 'invalid';
  end if;
  if raw = '' then return null; end if;
  if raw !~ '^-?[0-9]{1,10}$' or raw::bigint not between -2147483648 and 2147483647 then
    perform laria_private.raise_inventory_error('INVENTORY_FIELD_INVALID', 'Revisa el campo ' || p_key || '.',
      jsonb_build_object('field', p_key));
  end if;
  return raw::integer;
end;
$$;

create or replace function laria_private.inventory_json_uuid(p_fields jsonb, p_key text)
returns uuid
language plpgsql
immutable
as $$
declare value jsonb := p_fields -> p_key; raw text;
begin
  if value is null or value = 'null'::jsonb then return null; end if;
  raw := case when jsonb_typeof(value) = 'string' then btrim(value #>> '{}') else 'invalid' end;
  if raw = '' then return null; end if;
  if raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    perform laria_private.raise_inventory_error('INVENTORY_FIELD_INVALID', 'Revisa el campo ' || p_key || '.',
      jsonb_build_object('field', p_key));
  end if;
  return raw::uuid;
end;
$$;

create or replace function laria_private.inventory_short_text(p_value text, p_max_length integer, p_field text)
returns text
language plpgsql
immutable
as $$
declare result text := nullif(btrim(coalesce(p_value, '')), '');
begin
  if char_length(result) > p_max_length then
    perform laria_private.raise_inventory_error('INVENTORY_FIELD_INVALID', 'El campo ' || p_field || ' es demasiado largo.',
      jsonb_build_object('field', p_field, 'max_length', p_max_length));
  end if;
  return result;
end;
$$;

create or replace function laria_private.inventory_valid_sku(p_sku text)
returns text
language plpgsql
immutable
as $$
declare sku text := btrim(coalesce(p_sku, ''));
begin
  if sku !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' then
    perform laria_private.raise_inventory_error('INVENTORY_SKU_INVALID',
      'El SKU admite letras, números, punto, guion y guion bajo, sin espacios, hasta 64 caracteres.');
  end if;
  return sku;
end;
$$;

create or replace function laria_private.inventory_stock_level(p_available integer, p_threshold integer)
returns text
language sql
immutable
as $$
  select case
    when p_available <= 0 then 'out'
    when p_threshold is not null and p_available <= p_threshold then 'low'
    else 'in_stock'
  end;
$$;

create or replace function laria_private.stock_state_for(p_available integer)
returns text
language sql
immutable
as $$ select case when p_available > 0 then 'in_stock' else 'out_of_stock' end; $$;

create or replace function laria_private.inventory_item_json(p_item public.store_inventory_items)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when p_item.id is null then null else
    to_jsonb(p_item)
    || jsonb_build_object(
      'stock_level', laria_private.inventory_stock_level(p_item.quantity_available, p_item.low_stock_threshold),
      'listing', (
        select jsonb_build_object(
          'id', l.id, 'slug', l.slug, 'title', l.title, 'status', l.status, 'stock_state', l.stock_state,
          'category', l.category, 'price_pen', l.price_pen,
          'has_pending_revision', exists (
            select 1 from public.listing_revisions r where r.listing_id = l.id and r.status = 'pending'))
        from public.listings l where l.id = p_item.listing_id))
  end;
$$;

create or replace function laria_private.stock_movement_json(p_movement public.store_stock_movements)
returns jsonb
language sql
immutable
as $$ select to_jsonb(p_movement) - 'request_fingerprint'; $$;

-- Raises unless p_owner_user_id owns p_store_id (store row and owner membership), inventory is enabled for it (D-2),
-- and the store is pending or active. A rejected or hidden store keeps read access only.
create or replace function laria_private.require_inventory_write(p_store_id uuid, p_owner_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare store_status public.store_status; enabled boolean;
begin
  select s.status, coalesce(settings.inventory_enabled, false)
  into store_status, enabled
  from public.stores s
  left join public.store_operation_settings settings on settings.store_id = s.id
  where s.id = p_store_id
    and p_owner_user_id is not null
    and s.owner_user_id = p_owner_user_id
    and exists (
      select 1 from public.store_members member
      where member.store_id = s.id and member.user_id = p_owner_user_id and member.role = 'owner'
    );
  if not found then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_NOT_OWNED', 'No puedes administrar este inventario.');
  end if;
  if not enabled then
    perform laria_private.raise_inventory_error('INVENTORY_NOT_ENABLED', 'Inventario aún no está habilitado para tu tienda.');
  end if;
  if store_status not in ('pending', 'active') then
    perform laria_private.raise_inventory_error('INVENTORY_STORE_READ_ONLY',
      'Tu tienda no puede registrar cambios de inventario en este momento.');
  end if;
end;
$$;

-- The caller's own store (owner-only, D-8). Each Store Owner has at most one store (stores_owner_user_unique_idx).
create or replace function laria_private.inventory_caller_store(p_for_write boolean)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare store_id uuid;
begin
  select s.id into store_id
  from public.stores s
  where auth.uid() is not null and s.owner_user_id = auth.uid() and public.is_store_owner(s.id);
  if store_id is null then
    perform laria_private.raise_inventory_error('INVENTORY_STORE_REQUIRED', 'Necesitas una tienda para usar Inventario.');
  end if;
  if p_for_write then perform laria_private.require_inventory_write(store_id, auth.uid()); end if;
  return store_id;
end;
$$;

-- Same error for "does not exist" and "not yours", so ids cannot be probed.
create or replace function laria_private.inventory_item_store_for_write(p_item_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare store_id uuid;
begin
  select item.store_id into store_id from public.store_inventory_items item where item.id = p_item_id;
  if store_id is null or not exists (
    select 1 from public.stores s
    where s.id = store_id and auth.uid() is not null and s.owner_user_id = auth.uid() and public.is_store_owner(s.id)
  ) then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_NOT_OWNED', 'No puedes administrar este SKU.');
  end if;
  perform laria_private.require_inventory_write(store_id, auth.uid());
  return store_id;
end;
$$;

-- Locks the item's linked listing (if any) and then the item, the order every path uses. If the item was linked to a
-- different listing between the read and the lock, the new listing is taken without waiting, so this path can never
-- wait on a listing while holding the item; a busy listing makes the caller retry with the same idempotency key.
create or replace function laria_private.lock_inventory_item(p_item_id uuid)
returns public.store_inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare listing_id_seen uuid; item public.store_inventory_items;
begin
  select listing_id into listing_id_seen from public.store_inventory_items where id = p_item_id;
  if listing_id_seen is not null then
    perform 1 from public.listings where id = listing_id_seen for update;
  end if;
  select * into item from public.store_inventory_items where id = p_item_id for update;
  if not found then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_NOT_OWNED', 'No puedes administrar este SKU.');
  end if;
  if item.listing_id is not null and item.listing_id is distinct from listing_id_seen then
    begin
      perform 1 from public.listings where id = item.listing_id for update nowait;
    exception when lock_not_available then
      raise exception using errcode = '40001',
        message = 'INVENTORY_CONCURRENT_CHANGE: El SKU cambió mientras se guardaba. Intenta de nuevo.';
    end;
  end if;
  return item;
end;
$$;

-- Bulk variant: locks every linked listing in id order, then every item in id order. The caller has checked that all
-- items belong to its store.
create or replace function laria_private.lock_inventory_items(p_item_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare listing_ids uuid[];
begin
  select coalesce(array_agg(distinct listing_id), '{}') into listing_ids
  from public.store_inventory_items where id = any(p_item_ids) and listing_id is not null;
  perform 1 from public.listings where id = any(listing_ids) order by id for update;
  perform 1 from public.store_inventory_items where id = any(p_item_ids) order by id for update;
  if exists (
    select 1 from public.store_inventory_items
    where id = any(p_item_ids) and listing_id is not null and not (listing_id = any(listing_ids))
  ) then
    raise exception using errcode = '40001',
      message = 'INVENTORY_CONCURRENT_CHANGE: Un SKU cambió mientras se guardaba. Intenta de nuevo.';
  end if;
end;
$$;

-- Writes listings.stock_state through the controlled-field flag, restoring the flag afterwards so a caller that had
-- set it (e.g. update_owned_listing) keeps its own state. The caller holds the listing lock.
create or replace function laria_private.write_listing_stock_state(p_listing_id uuid, p_state text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare previous_flag text := current_setting('app.allow_listing_admin_fields', true);
begin
  perform set_config('app.allow_listing_admin_fields', 'true', true);
  update public.listings set stock_state = p_state
  where id = p_listing_id and stock_state is distinct from p_state;
  perform set_config('app.allow_listing_admin_fields', coalesce(previous_flag, ''), true);
end;
$$;

create or replace function laria_private.record_inventory_change(
  p_item public.store_inventory_items,
  p_change_type text,
  p_before jsonb,
  p_after jsonb,
  p_actor_user_id uuid,
  p_actor_kind text,
  p_reason text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.store_inventory_changes(store_id, item_id, change_type, before, after, actor_user_id, actor_kind, reason)
  values (p_item.store_id, p_item.id, p_change_type, coalesce(p_before, '{}'::jsonb), coalesce(p_after, '{}'::jsonb),
          p_actor_user_id, p_actor_kind, p_reason);
$$;

-- The one place an inventory price is written (design §3.4). Keeps the item and its linked listing equal; the listing
-- update goes through the controlled path, so notify_favorite_price_drop() fires exactly as for a manual price edit.
-- The caller holds the linked listing lock (if any) and then the item lock.
create or replace function laria_private.apply_inventory_price(
  p_item_id uuid,
  p_price integer,
  p_actor_user_id uuid,
  p_actor_kind text,
  p_reason text
)
returns public.store_inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare item public.store_inventory_items; previous_flag text;
begin
  if p_price is null or p_price < 1 then
    perform laria_private.raise_inventory_error('INVENTORY_PRICE_INVALID', 'Ingresa un precio en soles mayor que cero.');
  end if;
  select * into item from public.store_inventory_items where id = p_item_id;
  if item.unit_price_pen is distinct from p_price then
    perform laria_private.record_inventory_change(item, 'price',
      jsonb_build_object('unit_price_pen', item.unit_price_pen), jsonb_build_object('unit_price_pen', p_price),
      p_actor_user_id, p_actor_kind, p_reason);
    update public.store_inventory_items set unit_price_pen = p_price, version = version + 1
    where id = p_item_id returning * into item;
  end if;
  if item.listing_id is not null then
    previous_flag := current_setting('app.allow_listing_admin_fields', true);
    perform set_config('app.allow_listing_admin_fields', 'true', true);
    update public.listings set price_pen = p_price where id = item.listing_id and price_pen is distinct from p_price;
    perform set_config('app.allow_listing_admin_fields', coalesce(previous_flag, ''), true);
  end if;
  return item;
end;
$$;

-- Applies one movement to an item the caller has already locked (listing first). Computes the delta from the type,
-- updates the item, appends the ledger row and, for a linked listing, keeps stock_state in step. Table CHECKs are the
-- last line of defence against negative stock.
create or replace function laria_private.apply_stock_movement(
  p_item_id uuid,
  p_type public.stock_movement_type,
  p_quantity integer,
  p_channel public.stock_channel,
  p_reference text,
  p_reason text,
  p_expected_version integer,
  p_idempotency_key text,
  p_fingerprint text,
  p_actor_user_id uuid,
  p_actor_kind text,
  p_import_session_id uuid default null,
  p_import_row_number integer default null,
  p_external_event_ref text default null
)
returns public.store_stock_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.store_inventory_items;
  before_item public.store_inventory_items;
  new_on_hand integer;
  movement public.store_stock_movements;
begin
  select * into item from public.store_inventory_items where id = p_item_id;
  before_item := item;
  if item.inventory_status = 'archived' then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_ARCHIVED', 'Reactiva el SKU antes de registrar stock.');
  end if;
  if p_expected_version is not null and p_expected_version <> item.version then
    perform laria_private.raise_inventory_error('INVENTORY_VERSION_CONFLICT',
      'El stock cambió mientras lo revisabas. Vuelve a cargar los datos.',
      jsonb_build_object('current_version', item.version, 'quantity_on_hand', item.quantity_on_hand,
                         'quantity_available', item.quantity_available));
  end if;
  if p_quantity is null then
    perform laria_private.raise_inventory_error('STOCK_QUANTITY_INVALID', 'Ingresa una cantidad.');
  end if;

  if p_type in ('sale', 'damage_or_loss') then
    if p_quantity not between 1 and 100000 then
      perform laria_private.raise_inventory_error('STOCK_QUANTITY_INVALID', 'Ingresa una cantidad entre 1 y 100000.');
    end if;
    if p_quantity > item.quantity_available then
      perform laria_private.raise_inventory_error('STOCK_INSUFFICIENT',
        'No hay stock disponible suficiente. Si el stock real es distinto, registra un conteo.',
        jsonb_build_object('quantity_available', item.quantity_available));
    end if;
    new_on_hand := item.quantity_on_hand - p_quantity;
  elsif p_type in ('restock', 'return') then
    if p_quantity not between 1 and 100000 then
      perform laria_private.raise_inventory_error('STOCK_QUANTITY_INVALID', 'Ingresa una cantidad entre 1 y 100000.');
    end if;
    new_on_hand := item.quantity_on_hand + p_quantity;
  elsif p_type = 'manual_adjustment' then
    if p_quantity = 0 or abs(p_quantity) > 100000 then
      perform laria_private.raise_inventory_error('STOCK_QUANTITY_INVALID',
        'Ingresa un ajuste distinto de cero, hasta 100000 unidades.');
    end if;
    new_on_hand := item.quantity_on_hand + p_quantity;
  elsif p_type in ('stock_count', 'opening_balance', 'import_reconciliation', 'external_sync') then
    if p_quantity not between 0 and 100000 then
      perform laria_private.raise_inventory_error('STOCK_QUANTITY_INVALID', 'Ingresa una cantidad entre 0 y 100000.');
    end if;
    new_on_hand := p_quantity;
  else
    perform laria_private.raise_inventory_error('STOCK_MOVEMENT_TYPE_INVALID', 'Este tipo de movimiento no está disponible.');
  end if;

  if new_on_hand < item.quantity_reserved then
    perform laria_private.raise_inventory_error('STOCK_INSUFFICIENT',
      'El stock no puede quedar por debajo de cero. Si el stock real es distinto, registra un conteo.',
      jsonb_build_object('quantity_available', item.quantity_available));
  end if;
  if new_on_hand > 1000000 then
    perform laria_private.raise_inventory_error('STOCK_QUANTITY_INVALID', 'El stock no puede superar 1000000 unidades.');
  end if;

  update public.store_inventory_items
  set quantity_on_hand = new_on_hand, version = version + 1, last_movement_at = now()
  where id = p_item_id
  returning * into item;

  insert into public.store_stock_movements (
    store_id, item_id, movement_type, channel, on_hand_delta, reserved_delta,
    on_hand_before, on_hand_after, reserved_before, reserved_after,
    actor_user_id, actor_kind, import_session_id, import_row_number, external_event_ref,
    reference, reason, idempotency_key, request_fingerprint, item_version_after
  ) values (
    item.store_id, item.id, p_type, p_channel, new_on_hand - before_item.quantity_on_hand, 0,
    before_item.quantity_on_hand, new_on_hand, before_item.quantity_reserved, item.quantity_reserved,
    p_actor_user_id, p_actor_kind, p_import_session_id, p_import_row_number, p_external_event_ref,
    p_reference, p_reason, p_idempotency_key, p_fingerprint, item.version
  ) returning * into movement;

  if item.listing_id is not null then
    perform laria_private.write_listing_stock_state(item.listing_id, laria_private.stock_state_for(item.quantity_available));
  end if;
  return movement;
end;
$$;

-- Validates the movement types and channels a store owner may record. Opening balances come only from item creation,
-- reconciliation from imports (STORE-2), reservations from purchase requests (D-4), external sync from SYNC-1.
create or replace function laria_private.owner_movement_args(
  p_type text,
  p_channel text,
  p_expected_version integer,
  out movement_type public.stock_movement_type,
  out channel public.stock_channel
)
language plpgsql
immutable
as $$
begin
  if p_type is null or p_type not in ('sale', 'return', 'restock', 'damage_or_loss', 'manual_adjustment', 'stock_count') then
    perform laria_private.raise_inventory_error('STOCK_MOVEMENT_TYPE_INVALID', 'Este tipo de movimiento no está disponible.');
  end if;
  movement_type := p_type::public.stock_movement_type;
  if movement_type in ('sale', 'return') then
    if p_channel is null or p_channel not in ('tienda_fisica', 'whatsapp_laria', 'redes_sociales', 'otro') then
      perform laria_private.raise_inventory_error('STOCK_CHANNEL_INVALID', 'Elige dónde se hizo la venta o la devolución.');
    end if;
    channel := p_channel::public.stock_channel;
  else
    if p_channel is not null and p_channel <> 'panel' then
      perform laria_private.raise_inventory_error('STOCK_CHANNEL_INVALID', 'Este movimiento no lleva canal de venta.');
    end if;
    channel := 'panel';
  end if;
  -- A count states an absolute quantity, so it must name the version the merchant saw.
  if movement_type = 'stock_count' and p_expected_version is null then
    perform laria_private.raise_inventory_error('INVENTORY_VERSION_REQUIRED', 'Vuelve a cargar el stock antes de registrar el conteo.');
  end if;
end;
$$;

-- Bulk price rule shown in the preview and applied on commit: whole soles; percentages round half away from zero.
create or replace function laria_private.inventory_bulk_price(p_price integer, p_mode text, p_value integer)
returns bigint
language sql
immutable
as $$
  select case p_mode
    when 'set' then p_value::bigint
    when 'add' then p_price::bigint + p_value
    when 'percent' then round(p_price::numeric * (100 + p_value) / 100)::bigint
  end;
$$;

create or replace function laria_private.validate_bulk_price_args(p_item_ids uuid[], p_mode text, p_value integer)
returns void
language plpgsql
immutable
as $$
begin
  if p_item_ids is null or cardinality(p_item_ids) not between 1 and 200
    or array_position(p_item_ids, null) is not null
    or (select count(distinct id) from unnest(p_item_ids) id) <> cardinality(p_item_ids) then
    perform laria_private.raise_inventory_error('INVENTORY_BULK_INVALID', 'Elige entre 1 y 200 SKU distintos.');
  end if;
  if p_mode is null or p_mode not in ('set', 'add', 'percent') or p_value is null
    or (p_mode = 'set' and p_value < 1)
    or (p_mode = 'add' and (p_value = 0 or abs(p_value) > 1000000))
    or (p_mode = 'percent' and (p_value = 0 or p_value not between -90 and 500)) then
    perform laria_private.raise_inventory_error('INVENTORY_PRICE_INVALID', 'Revisa el cambio de precio.');
  end if;
end;
$$;

create or replace function laria_private.inventory_catalog_ids_valid(p_product_id uuid, p_variant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (p_product_id is null and p_variant_id is null)
    or (p_product_id is not null
        and exists (select 1 from public.catalog_products where id = p_product_id)
        and (p_variant_id is null or exists (
          select 1 from public.catalog_product_variants where id = p_variant_id and product_id = p_product_id)));
$$;

-- Next "LAR-000001"-style SKU, taken under the settings row lock and skipped past any SKU the merchant already uses.
create or replace function laria_private.next_generated_sku(p_store_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare next_number integer; sku text;
begin
  loop
    update public.store_operation_settings
    set next_generated_sku = next_generated_sku + 1
    where store_id = p_store_id
    returning next_generated_sku - 1 into next_number;
    if next_number is null then
      perform laria_private.raise_inventory_error('INVENTORY_NOT_ENABLED', 'Inventario aún no está habilitado para tu tienda.');
    end if;
    sku := 'LAR-' || case when next_number < 1000000 then lpad(next_number::text, 6, '0') else next_number::text end;
    exit when not exists (
      select 1 from public.store_inventory_items where store_id = p_store_id and sku_normalized = upper(sku));
  end loop;
  return sku;
end;
$$;

-- Links an inventory item to a store listing created in the same transaction by complete_public_submission. The price
-- the merchant submitted on the publication form wins and is copied to the item.
create or replace function laria_private.link_new_store_listing(
  p_listing_id uuid,
  p_item_id uuid,
  p_store_id uuid,
  p_owner_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare item public.store_inventory_items; listing_price integer;
begin
  perform laria_private.require_inventory_write(p_store_id, p_owner_user_id);
  select * into item from public.store_inventory_items where id = p_item_id for update;
  if not found or item.store_id <> p_store_id then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_NOT_OWNED', 'No puedes administrar este SKU.');
  end if;
  if item.inventory_status = 'archived' then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_ARCHIVED', 'Reactiva el SKU antes de publicarlo.');
  end if;
  if item.listing_id is not null then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_ALREADY_LINKED', 'Este SKU ya tiene una publicación.');
  end if;

  update public.store_inventory_items set listing_id = p_listing_id, version = version + 1
  where id = p_item_id returning * into item;
  perform laria_private.record_inventory_change(item, 'link', '{}'::jsonb, jsonb_build_object('listing_id', p_listing_id),
    p_owner_user_id, 'owner', null);

  select price_pen into listing_price from public.listings where id = p_listing_id;
  if listing_price > 0 and item.unit_price_pen is distinct from listing_price then
    perform laria_private.record_inventory_change(item, 'price',
      jsonb_build_object('unit_price_pen', item.unit_price_pen), jsonb_build_object('unit_price_pen', listing_price),
      p_owner_user_id, 'owner', 'Precio de la publicación');
    update public.store_inventory_items set unit_price_pen = listing_price, version = version + 1 where id = p_item_id;
  end if;

  perform laria_private.write_listing_stock_state(p_listing_id, laria_private.stock_state_for(item.quantity_available));
end;
$$;

-- ------------------------------------------------------------------ owner functions

create or replace function public.create_inventory_item(
  p_fields jsonb,
  p_opening_quantity integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner_store_id uuid := laria_private.inventory_caller_store(true);
  request_key text := laria_private.inventory_request_key(p_idempotency_key);
  fingerprint text;
  existing public.store_stock_movements;
  listing public.listings;
  adopt_listing_id uuid;
  sku text;
  generated boolean := false;
  product_name text;
  variant_label text;
  threshold integer;
  price integer;
  external_reference text;
  product_id uuid;
  variant_id uuid;
  item public.store_inventory_items;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    perform laria_private.raise_inventory_error('INVENTORY_FIELD_INVALID', 'Los datos del SKU no son válidos.');
  end if;
  if exists (select 1 from jsonb_object_keys(p_fields) key where key not in (
    'merchant_sku', 'product_name', 'variant_label', 'low_stock_threshold', 'unit_price_pen',
    'external_reference', 'catalog_product_id', 'catalog_variant_id', 'listing_id')) then
    perform laria_private.raise_inventory_error('INVENTORY_FIELD_NOT_ALLOWED', 'Se recibió un campo no editable.');
  end if;

  fingerprint := laria_private.inventory_fingerprint(jsonb_build_array('create_inventory_item', p_fields, p_opening_quantity));
  perform pg_advisory_xact_lock(hashtextextended(owner_store_id::text || ':' || request_key, 23));
  select * into existing from public.store_stock_movements m
  where m.store_id = owner_store_id and m.idempotency_key = request_key;
  if found then
    if existing.request_fingerprint <> fingerprint then
      perform laria_private.raise_inventory_error('IDEMPOTENCY_KEY_REUSED', 'Esta solicitud ya se usó con otros datos.');
    end if;
    select * into item from public.store_inventory_items where id = existing.item_id;
    return jsonb_build_object('item', laria_private.inventory_item_json(item), 'replayed', true);
  end if;

  product_name := laria_private.inventory_json_text(p_fields, 'product_name', 140);
  if product_name is null or char_length(product_name) < 2 then
    perform laria_private.raise_inventory_error('INVENTORY_FIELD_INVALID', 'Ingresa un nombre de al menos 2 caracteres.',
      jsonb_build_object('field', 'product_name'));
  end if;
  variant_label := laria_private.inventory_json_text(p_fields, 'variant_label', 80);
  external_reference := laria_private.inventory_json_text(p_fields, 'external_reference', 120);
  threshold := laria_private.inventory_json_int(p_fields, 'low_stock_threshold');
  if threshold is not null and threshold not between 0 and 100000 then
    perform laria_private.raise_inventory_error('INVENTORY_FIELD_INVALID', 'El umbral de stock bajo va de 0 a 100000.',
      jsonb_build_object('field', 'low_stock_threshold'));
  end if;
  price := laria_private.inventory_json_int(p_fields, 'unit_price_pen');
  if price is not null and price < 1 then
    perform laria_private.raise_inventory_error('INVENTORY_PRICE_INVALID', 'Ingresa un precio en soles mayor que cero.');
  end if;
  product_id := laria_private.inventory_json_uuid(p_fields, 'catalog_product_id');
  variant_id := laria_private.inventory_json_uuid(p_fields, 'catalog_variant_id');
  if not laria_private.inventory_catalog_ids_valid(product_id, variant_id) then
    perform laria_private.raise_inventory_error('INVENTORY_CATALOG_INVALID', 'La referencia del catálogo no es válida.');
  end if;
  if p_opening_quantity is null or p_opening_quantity not between 0 and 100000 then
    perform laria_private.raise_inventory_error('STOCK_QUANTITY_INVALID', 'Ingresa un stock inicial entre 0 y 100000.');
  end if;

  -- Adopting an existing listing ("Controlar stock", design §6.1): listing lock first, as on every path.
  adopt_listing_id := laria_private.inventory_json_uuid(p_fields, 'listing_id');
  if adopt_listing_id is not null then
    select * into listing from public.listings where id = adopt_listing_id for update;
    if not found or listing.store_id is distinct from owner_store_id then
      perform laria_private.raise_inventory_error('INVENTORY_LISTING_INVALID', 'No puedes vincular esta publicación.');
    end if;
    if listing.status in ('sold', 'archived') then
      perform laria_private.raise_inventory_error('INVENTORY_LISTING_INVALID',
        'Una publicación vendida o archivada no se puede vincular al inventario.');
    end if;
    if exists (select 1 from public.store_inventory_items where listing_id = adopt_listing_id) then
      perform laria_private.raise_inventory_error('INVENTORY_LISTING_ALREADY_LINKED', 'Esta publicación ya está vinculada a un SKU.');
    end if;
    if price is null and listing.price_pen > 0 then price := listing.price_pen; end if;
  end if;

  sku := laria_private.inventory_json_text(p_fields, 'merchant_sku', 200);
  if sku is null then
    sku := laria_private.next_generated_sku(owner_store_id);
    generated := true;
  else
    sku := laria_private.inventory_valid_sku(sku);
    if exists (select 1 from public.store_inventory_items i
               where i.store_id = owner_store_id and i.sku_normalized = upper(sku)) then
      perform laria_private.raise_inventory_error('INVENTORY_SKU_TAKEN', 'Ya tienes un SKU con ese código.');
    end if;
  end if;

  insert into public.store_inventory_items (
    store_id, merchant_sku, sku_normalized, sku_generated, catalog_product_id, catalog_variant_id, listing_id,
    product_name, variant_label, low_stock_threshold, unit_price_pen, external_reference
  ) values (
    owner_store_id, sku, upper(sku), generated, product_id, variant_id, adopt_listing_id,
    product_name, variant_label, threshold, price, external_reference
  ) returning * into item;

  perform laria_private.record_inventory_change(item, 'created', '{}'::jsonb,
    jsonb_strip_nulls(jsonb_build_object('merchant_sku', sku, 'product_name', product_name, 'variant_label', variant_label,
      'low_stock_threshold', threshold, 'unit_price_pen', price, 'external_reference', external_reference,
      'catalog_product_id', product_id, 'catalog_variant_id', variant_id)),
    caller, 'owner', null);
  if adopt_listing_id is not null then
    perform laria_private.record_inventory_change(item, 'link', '{}'::jsonb,
      jsonb_build_object('listing_id', adopt_listing_id), caller, 'owner', null);
  end if;

  -- Writes stock_state for an adopted listing before any price change, so an out-of-stock adoption never sends a
  -- price-drop notification.
  perform laria_private.apply_stock_movement(item.id, 'opening_balance', p_opening_quantity, 'panel', null, null, null,
    request_key, fingerprint, caller, 'owner');
  if adopt_listing_id is not null and listing.price_pen is distinct from price then
    perform laria_private.apply_inventory_price(item.id, price, caller, 'owner', 'Precio elegido al vincular');
  end if;

  select * into item from public.store_inventory_items where id = item.id;
  return jsonb_build_object('item', laria_private.inventory_item_json(item), 'replayed', false);
end;
$$;

create or replace function public.record_stock_movement(
  p_item_id uuid,
  p_type text,
  p_quantity integer,
  p_channel text default null,
  p_reference text default null,
  p_reason text default null,
  p_expected_version integer default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_item_store_for_write(p_item_id);
  request_key text := laria_private.inventory_request_key(p_idempotency_key);
  args record;
  reference text := laria_private.inventory_short_text(p_reference, 120, 'reference');
  reason text := laria_private.inventory_short_text(p_reason, 280, 'reason');
  fingerprint text;
  existing public.store_stock_movements;
  item public.store_inventory_items;
  movement public.store_stock_movements;
begin
  args := laria_private.owner_movement_args(p_type, p_channel, p_expected_version);
  fingerprint := laria_private.inventory_fingerprint(jsonb_build_array(
    'record_stock_movement', p_item_id, args.movement_type, p_quantity, args.channel, reference, reason, p_expected_version));

  -- 1–2: serialize on the key; a retry with the same request returns the first result, never a second movement.
  perform pg_advisory_xact_lock(hashtextextended(owner_store_id::text || ':' || request_key, 23));
  select * into existing from public.store_stock_movements m
  where m.store_id = owner_store_id and m.idempotency_key = request_key;
  if found then
    if existing.request_fingerprint <> fingerprint then
      perform laria_private.raise_inventory_error('IDEMPOTENCY_KEY_REUSED', 'Esta solicitud ya se usó con otros datos.');
    end if;
    select * into item from public.store_inventory_items where id = existing.item_id;
    return jsonb_build_object('movement', laria_private.stock_movement_json(existing),
      'item', laria_private.inventory_item_json(item), 'replayed', true);
  end if;

  -- 3–9: listing then item locks, version check, delta, ledger, stock_state.
  perform laria_private.lock_inventory_item(p_item_id);
  movement := laria_private.apply_stock_movement(p_item_id, args.movement_type, p_quantity, args.channel, reference, reason,
    p_expected_version, request_key, fingerprint, auth.uid(), 'owner');
  select * into item from public.store_inventory_items where id = p_item_id;
  return jsonb_build_object('movement', laria_private.stock_movement_json(movement),
    'item', laria_private.inventory_item_json(item), 'replayed', false);
end;
$$;

-- All-or-nothing, up to 200 operations on distinct items: [{item_id, type, quantity, channel?, reference?, reason?,
-- expected_version?}]. Each movement's key is p_batch_key || ':' || item_id.
create or replace function public.apply_bulk_stock_operations(p_operations jsonb, p_batch_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner_store_id uuid := laria_private.inventory_caller_store(true);
  request_batch_key text := laria_private.inventory_request_key(p_batch_key, 160);
  fingerprint text;
  receipt laria_private.store_inventory_batch_receipts;
  item_ids uuid[];
  operation jsonb;
  op_item_id uuid;
  op_quantity integer;
  op_expected integer;
  op_reference text;
  op_reason text;
  args record;
  movement public.store_stock_movements;
  movements jsonb := '[]'::jsonb;
  result jsonb;
begin
  if p_operations is null or jsonb_typeof(p_operations) <> 'array' or jsonb_array_length(p_operations) not between 1 and 200 then
    perform laria_private.raise_inventory_error('INVENTORY_BULK_INVALID', 'Elige entre 1 y 200 SKU.');
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_operations) element
    where jsonb_typeof(element) <> 'object'
      or exists (select 1 from jsonb_object_keys(element) key where key not in
        ('item_id', 'type', 'quantity', 'channel', 'reference', 'reason', 'expected_version'))
  ) then
    perform laria_private.raise_inventory_error('INVENTORY_BULK_INVALID', 'Revisa las operaciones de stock.');
  end if;
  select array_agg(laria_private.inventory_json_uuid(element, 'item_id')) into item_ids
  from jsonb_array_elements(p_operations) element;
  if array_position(item_ids, null) is not null
    or (select count(distinct id) from unnest(item_ids) id) <> cardinality(item_ids) then
    perform laria_private.raise_inventory_error('INVENTORY_BULK_INVALID', 'Cada SKU puede aparecer una sola vez.');
  end if;

  fingerprint := laria_private.inventory_fingerprint(jsonb_build_array('apply_bulk_stock_operations', p_operations));
  perform pg_advisory_xact_lock(hashtextextended(owner_store_id::text || ':' || request_batch_key, 23));
  select * into receipt from laria_private.store_inventory_batch_receipts r
  where r.store_id = owner_store_id and r.batch_key = request_batch_key;
  if found then
    if receipt.operation <> 'stock' or receipt.request_fingerprint <> fingerprint then
      perform laria_private.raise_inventory_error('IDEMPOTENCY_KEY_REUSED', 'Esta solicitud ya se usó con otros datos.');
    end if;
    return receipt.result || jsonb_build_object('replayed', true);
  end if;

  if (select count(*) from public.store_inventory_items i
      where i.id = any(item_ids) and i.store_id = owner_store_id) <> cardinality(item_ids) then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_NOT_OWNED', 'No puedes administrar uno de estos SKU.');
  end if;
  perform laria_private.lock_inventory_items(item_ids);

  for operation in
    select element from jsonb_array_elements(p_operations) element
    order by laria_private.inventory_json_uuid(element, 'item_id')
  loop
    op_item_id := laria_private.inventory_json_uuid(operation, 'item_id');
    op_quantity := laria_private.inventory_json_int(operation, 'quantity');
    op_expected := laria_private.inventory_json_int(operation, 'expected_version');
    op_reference := laria_private.inventory_json_text(operation, 'reference', 120);
    op_reason := laria_private.inventory_json_text(operation, 'reason', 280);
    args := laria_private.owner_movement_args(operation->>'type', operation->>'channel', op_expected);
    movement := laria_private.apply_stock_movement(op_item_id, args.movement_type, op_quantity, args.channel,
      op_reference, op_reason, op_expected, request_batch_key || ':' || op_item_id::text,
      laria_private.inventory_fingerprint(jsonb_build_array('apply_bulk_stock_operations', request_batch_key, operation)),
      caller, 'owner');
    movements := movements || jsonb_build_array(laria_private.stock_movement_json(movement));
  end loop;

  result := jsonb_build_object('batch_key', request_batch_key, 'movements', movements,
    'items', (select jsonb_agg(laria_private.inventory_item_json(i) order by i.id)
              from public.store_inventory_items i where i.id = any(item_ids)));
  insert into laria_private.store_inventory_batch_receipts(store_id, batch_key, operation, request_fingerprint, result, actor_user_id)
  values (owner_store_id, request_batch_key, 'stock', fingerprint, result, caller);
  return result || jsonb_build_object('replayed', false);
end;
$$;

create or replace function public.preview_inventory_price_bulk(p_item_ids uuid[], p_mode text, p_value integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare owner_store_id uuid := laria_private.inventory_caller_store(false);
begin
  perform laria_private.validate_bulk_price_args(p_item_ids, p_mode, p_value);
  if (select count(*) from public.store_inventory_items i
      where i.id = any(p_item_ids) and i.store_id = owner_store_id) <> cardinality(p_item_ids) then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_NOT_OWNED', 'No puedes administrar uno de estos SKU.');
  end if;
  return (
    select jsonb_build_object('rule', 'Precios en soles enteros; los porcentajes se redondean al sol más cercano.',
      'items', jsonb_agg(jsonb_build_object(
        'id', i.id, 'merchant_sku', i.merchant_sku, 'product_name', i.product_name,
        'before', i.unit_price_pen,
        'after', case when computed.value between 1 and 2147483647 then computed.value end,
        'problem', case
          when computed.value is null then 'missing_price'
          when computed.value < 1 then 'below_minimum'
          when computed.value > 2147483647 then 'too_high'
        end) order by i.merchant_sku, i.id))
    from public.store_inventory_items i
    cross join lateral (select laria_private.inventory_bulk_price(i.unit_price_pen, p_mode, p_value) as value) computed
    where i.id = any(p_item_ids)
  );
end;
$$;

-- Absolute price ('set') or a whole-sol ('add') or percentage ('percent') change, up to 200 items, all-or-nothing.
create or replace function public.set_inventory_price_bulk(p_item_ids uuid[], p_mode text, p_value integer, p_batch_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner_store_id uuid := laria_private.inventory_caller_store(true);
  request_batch_key text := laria_private.inventory_request_key(p_batch_key, 160);
  fingerprint text;
  receipt laria_private.store_inventory_batch_receipts;
  target record;
  changes jsonb := '[]'::jsonb;
  result jsonb;
begin
  perform laria_private.validate_bulk_price_args(p_item_ids, p_mode, p_value);
  fingerprint := laria_private.inventory_fingerprint(jsonb_build_array(
    'set_inventory_price_bulk', (select jsonb_agg(id order by id) from unnest(p_item_ids) id), p_mode, p_value));
  perform pg_advisory_xact_lock(hashtextextended(owner_store_id::text || ':' || request_batch_key, 23));
  select * into receipt from laria_private.store_inventory_batch_receipts r
  where r.store_id = owner_store_id and r.batch_key = request_batch_key;
  if found then
    if receipt.operation <> 'price' or receipt.request_fingerprint <> fingerprint then
      perform laria_private.raise_inventory_error('IDEMPOTENCY_KEY_REUSED', 'Esta solicitud ya se usó con otros datos.');
    end if;
    return receipt.result || jsonb_build_object('replayed', true);
  end if;

  if (select count(*) from public.store_inventory_items i
      where i.id = any(p_item_ids) and i.store_id = owner_store_id) <> cardinality(p_item_ids) then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_NOT_OWNED', 'No puedes administrar uno de estos SKU.');
  end if;
  perform laria_private.lock_inventory_items(p_item_ids);

  for target in
    select i.id, i.merchant_sku, i.unit_price_pen as before_price,
           laria_private.inventory_bulk_price(i.unit_price_pen, p_mode, p_value) as after_price
    from public.store_inventory_items i where i.id = any(p_item_ids) order by i.id
  loop
    if target.after_price is null then
      perform laria_private.raise_inventory_error('INVENTORY_PRICE_MISSING',
        'El SKU ' || target.merchant_sku || ' no tiene precio; asígnale uno antes de un ajuste relativo.',
        jsonb_build_object('item_id', target.id));
    end if;
    if target.after_price not between 1 and 2147483647 then
      perform laria_private.raise_inventory_error('INVENTORY_PRICE_INVALID',
        'El nuevo precio del SKU ' || target.merchant_sku || ' quedaría fuera de rango.',
        jsonb_build_object('item_id', target.id));
    end if;
    perform laria_private.apply_inventory_price(target.id, target.after_price::integer, caller, 'owner', 'Cambio de precio masivo');
    changes := changes || jsonb_build_array(jsonb_build_object('id', target.id, 'before', target.before_price, 'after', target.after_price));
  end loop;

  result := jsonb_build_object('batch_key', request_batch_key, 'changes', changes);
  insert into laria_private.store_inventory_batch_receipts(store_id, batch_key, operation, request_fingerprint, result, actor_user_id)
  values (owner_store_id, request_batch_key, 'price', fingerprint, result, caller);
  return result || jsonb_build_object('replayed', false);
end;
$$;

-- Name, variant label, threshold, external reference, catalog ids and price. Fields present with null clear the value
-- (except the name). Rejects a stale version.
create or replace function public.update_inventory_item(p_item_id uuid, p_fields jsonb, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner_store_id uuid := laria_private.inventory_item_store_for_write(p_item_id);
  item public.store_inventory_items;
  next_name text;
  next_variant text;
  next_threshold integer;
  next_external text;
  next_product uuid;
  next_variant_id uuid;
  next_price integer;
  before_values jsonb;
  after_values jsonb;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    perform laria_private.raise_inventory_error('INVENTORY_FIELD_INVALID', 'Los datos del SKU no son válidos.');
  end if;
  if exists (select 1 from jsonb_object_keys(p_fields) key where key not in (
    'product_name', 'variant_label', 'low_stock_threshold', 'unit_price_pen', 'external_reference',
    'catalog_product_id', 'catalog_variant_id')) then
    perform laria_private.raise_inventory_error('INVENTORY_FIELD_NOT_ALLOWED', 'Se recibió un campo no editable.');
  end if;
  if p_expected_version is null then
    perform laria_private.raise_inventory_error('INVENTORY_VERSION_REQUIRED', 'Vuelve a cargar el SKU antes de editarlo.');
  end if;

  item := laria_private.lock_inventory_item(p_item_id);
  if item.version <> p_expected_version then
    perform laria_private.raise_inventory_error('INVENTORY_VERSION_CONFLICT',
      'El SKU cambió mientras lo editabas. Vuelve a cargar los datos.',
      jsonb_build_object('current_version', item.version));
  end if;

  next_name := case when p_fields ? 'product_name' then laria_private.inventory_json_text(p_fields, 'product_name', 140) else item.product_name end;
  if next_name is null or char_length(next_name) < 2 then
    perform laria_private.raise_inventory_error('INVENTORY_FIELD_INVALID', 'Ingresa un nombre de al menos 2 caracteres.',
      jsonb_build_object('field', 'product_name'));
  end if;
  next_variant := case when p_fields ? 'variant_label' then laria_private.inventory_json_text(p_fields, 'variant_label', 80) else item.variant_label end;
  next_external := case when p_fields ? 'external_reference' then laria_private.inventory_json_text(p_fields, 'external_reference', 120) else item.external_reference end;
  next_threshold := case when p_fields ? 'low_stock_threshold' then laria_private.inventory_json_int(p_fields, 'low_stock_threshold') else item.low_stock_threshold end;
  if next_threshold is not null and next_threshold not between 0 and 100000 then
    perform laria_private.raise_inventory_error('INVENTORY_FIELD_INVALID', 'El umbral de stock bajo va de 0 a 100000.',
      jsonb_build_object('field', 'low_stock_threshold'));
  end if;
  next_product := case when p_fields ? 'catalog_product_id' then laria_private.inventory_json_uuid(p_fields, 'catalog_product_id') else item.catalog_product_id end;
  next_variant_id := case when p_fields ? 'catalog_variant_id' then laria_private.inventory_json_uuid(p_fields, 'catalog_variant_id') else item.catalog_variant_id end;
  if (p_fields ? 'catalog_product_id' or p_fields ? 'catalog_variant_id')
    and not laria_private.inventory_catalog_ids_valid(next_product, next_variant_id) then
    perform laria_private.raise_inventory_error('INVENTORY_CATALOG_INVALID', 'La referencia del catálogo no es válida.');
  end if;

  before_values := jsonb_build_object('product_name', item.product_name, 'variant_label', item.variant_label,
    'low_stock_threshold', item.low_stock_threshold, 'external_reference', item.external_reference,
    'catalog_product_id', item.catalog_product_id, 'catalog_variant_id', item.catalog_variant_id);
  after_values := jsonb_build_object('product_name', next_name, 'variant_label', next_variant,
    'low_stock_threshold', next_threshold, 'external_reference', next_external,
    'catalog_product_id', next_product, 'catalog_variant_id', next_variant_id);
  if before_values <> after_values then
    perform laria_private.record_inventory_change(item, 'details',
      (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(before_values) where after_values->key <> value),
      (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(after_values) where before_values->key <> value),
      caller, 'owner', null);
    update public.store_inventory_items
    set product_name = next_name, variant_label = next_variant, low_stock_threshold = next_threshold,
        external_reference = next_external, catalog_product_id = next_product, catalog_variant_id = next_variant_id,
        version = version + 1
    where id = p_item_id returning * into item;
  end if;

  if p_fields ? 'unit_price_pen' then
    next_price := laria_private.inventory_json_int(p_fields, 'unit_price_pen');
    if next_price is null then
      if item.listing_id is not null then
        perform laria_private.raise_inventory_error('INVENTORY_PRICE_INVALID', 'Un SKU publicado necesita precio.');
      end if;
      if item.unit_price_pen is not null then
        perform laria_private.record_inventory_change(item, 'price', jsonb_build_object('unit_price_pen', item.unit_price_pen),
          jsonb_build_object('unit_price_pen', null), caller, 'owner', null);
        update public.store_inventory_items set unit_price_pen = null, version = version + 1 where id = p_item_id;
      end if;
    else
      perform laria_private.apply_inventory_price(p_item_id, next_price, caller, 'owner', null);
    end if;
  end if;

  select * into item from public.store_inventory_items where id = p_item_id;
  return jsonb_build_object('item', laria_private.inventory_item_json(item));
end;
$$;

-- The only way a SKU changes (D-9). Reason required.
create or replace function public.change_inventory_sku(p_item_id uuid, p_new_sku text, p_reason text, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_item_store_for_write(p_item_id);
  sku text := laria_private.inventory_valid_sku(p_new_sku);
  reason text := laria_private.inventory_short_text(p_reason, 280, 'reason');
  item public.store_inventory_items;
begin
  if reason is null or char_length(reason) < 3 then
    perform laria_private.raise_inventory_error('INVENTORY_REASON_REQUIRED', 'Indica por qué cambias el SKU.');
  end if;
  if p_expected_version is null then
    perform laria_private.raise_inventory_error('INVENTORY_VERSION_REQUIRED', 'Vuelve a cargar el SKU antes de editarlo.');
  end if;
  item := laria_private.lock_inventory_item(p_item_id);
  if item.version <> p_expected_version then
    perform laria_private.raise_inventory_error('INVENTORY_VERSION_CONFLICT',
      'El SKU cambió mientras lo editabas. Vuelve a cargar los datos.', jsonb_build_object('current_version', item.version));
  end if;
  if item.merchant_sku = sku then
    return jsonb_build_object('item', laria_private.inventory_item_json(item));
  end if;
  if exists (select 1 from public.store_inventory_items i
             where i.store_id = owner_store_id and i.sku_normalized = upper(sku) and i.id <> p_item_id) then
    perform laria_private.raise_inventory_error('INVENTORY_SKU_TAKEN', 'Ya tienes un SKU con ese código.');
  end if;
  perform laria_private.record_inventory_change(item, 'sku', jsonb_build_object('merchant_sku', item.merchant_sku),
    jsonb_build_object('merchant_sku', sku), auth.uid(), 'owner', reason);
  update public.store_inventory_items
  set merchant_sku = sku, sku_normalized = upper(sku), sku_generated = false, version = version + 1
  where id = p_item_id returning * into item;
  return jsonb_build_object('item', laria_private.inventory_item_json(item));
end;
$$;

-- Links an unlinked item to a store listing of the same store that is not sold or archived. When the item and the
-- listing disagree on price, the merchant chooses (p_unit_price_pen) and that price is applied to both.
create or replace function public.link_inventory_listing(
  p_item_id uuid,
  p_listing_id uuid,
  p_expected_version integer,
  p_unit_price_pen integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner_store_id uuid := laria_private.inventory_item_store_for_write(p_item_id);
  listing public.listings;
  listing_price integer;
  chosen_price integer;
  item public.store_inventory_items;
begin
  if p_expected_version is null then
    perform laria_private.raise_inventory_error('INVENTORY_VERSION_REQUIRED', 'Vuelve a cargar el SKU antes de vincularlo.');
  end if;
  if exists (select 1 from public.store_inventory_items where id = p_item_id and listing_id is not null) then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_ALREADY_LINKED', 'Este SKU ya tiene una publicación.');
  end if;

  select * into listing from public.listings where id = p_listing_id for update;
  if not found or listing.store_id is distinct from owner_store_id then
    perform laria_private.raise_inventory_error('INVENTORY_LISTING_INVALID', 'No puedes vincular esta publicación.');
  end if;
  if listing.status in ('sold', 'archived') then
    perform laria_private.raise_inventory_error('INVENTORY_LISTING_INVALID',
      'Una publicación vendida o archivada no se puede vincular al inventario.');
  end if;
  if exists (select 1 from public.store_inventory_items where listing_id = p_listing_id) then
    perform laria_private.raise_inventory_error('INVENTORY_LISTING_ALREADY_LINKED', 'Esta publicación ya está vinculada a un SKU.');
  end if;

  item := laria_private.lock_inventory_item(p_item_id);
  if item.listing_id is not null then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_ALREADY_LINKED', 'Este SKU ya tiene una publicación.');
  end if;
  if item.version <> p_expected_version then
    perform laria_private.raise_inventory_error('INVENTORY_VERSION_CONFLICT',
      'El SKU cambió mientras lo editabas. Vuelve a cargar los datos.', jsonb_build_object('current_version', item.version));
  end if;
  if item.inventory_status = 'archived' then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_ARCHIVED', 'Reactiva el SKU antes de vincularlo.');
  end if;

  listing_price := case when listing.price_pen > 0 then listing.price_pen end;
  if p_unit_price_pen is not null then
    chosen_price := p_unit_price_pen;
  elsif item.unit_price_pen is null or item.unit_price_pen = listing_price then
    chosen_price := listing_price;
  elsif listing_price is null then
    chosen_price := item.unit_price_pen;
  else
    perform laria_private.raise_inventory_error('INVENTORY_PRICE_CHOICE_REQUIRED',
      'El SKU y la publicación tienen precios distintos; elige cuál se mantiene.',
      jsonb_build_object('item_price_pen', item.unit_price_pen, 'listing_price_pen', listing_price));
  end if;
  if chosen_price is null or chosen_price < 1 then
    perform laria_private.raise_inventory_error('INVENTORY_PRICE_INVALID', 'Ingresa un precio en soles mayor que cero.');
  end if;

  update public.store_inventory_items set listing_id = p_listing_id, version = version + 1
  where id = p_item_id returning * into item;
  perform laria_private.record_inventory_change(item, 'link', '{}'::jsonb, jsonb_build_object('listing_id', p_listing_id),
    caller, 'owner', null);
  -- stock_state first: an out-of-stock link must not send a price-drop notification.
  perform laria_private.write_listing_stock_state(p_listing_id, laria_private.stock_state_for(item.quantity_available));
  perform laria_private.apply_inventory_price(p_item_id, chosen_price, caller, 'owner', 'Precio elegido al vincular');

  select * into item from public.store_inventory_items where id = p_item_id;
  return jsonb_build_object('item', laria_private.inventory_item_json(item));
end;
$$;

-- Returns the listing to plain V1 behavior (stock_state null). Needed before using the V1 sold flow (D-15).
create or replace function public.unlink_inventory_listing(p_item_id uuid, p_reason text default null, p_expected_version integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_item_store_for_write(p_item_id);
  reason text := laria_private.inventory_short_text(p_reason, 280, 'reason');
  item public.store_inventory_items;
  previous_listing uuid;
begin
  item := laria_private.lock_inventory_item(p_item_id);
  if item.listing_id is null then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_NOT_LINKED', 'Este SKU no tiene una publicación vinculada.');
  end if;
  if p_expected_version is not null and item.version <> p_expected_version then
    perform laria_private.raise_inventory_error('INVENTORY_VERSION_CONFLICT',
      'El SKU cambió mientras lo editabas. Vuelve a cargar los datos.', jsonb_build_object('current_version', item.version));
  end if;
  previous_listing := item.listing_id;
  update public.store_inventory_items set listing_id = null, version = version + 1
  where id = p_item_id returning * into item;
  perform laria_private.record_inventory_change(item, 'unlink', jsonb_build_object('listing_id', previous_listing),
    '{}'::jsonb, auth.uid(), 'owner', reason);
  perform laria_private.write_listing_stock_state(previous_listing, null);
  return jsonb_build_object('item', laria_private.inventory_item_json(item));
end;
$$;

-- Allowed only while the linked listing (if any) is not pending or approved. Stock is kept.
create or replace function public.archive_inventory_item(p_item_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_item_store_for_write(p_item_id);
  reason text := laria_private.inventory_short_text(p_reason, 280, 'reason');
  item public.store_inventory_items;
begin
  item := laria_private.lock_inventory_item(p_item_id);
  if item.inventory_status = 'archived' then
    return jsonb_build_object('item', laria_private.inventory_item_json(item));
  end if;
  if exists (select 1 from public.listings where id = item.listing_id and status in ('pending', 'approved')) then
    perform laria_private.raise_inventory_error('INVENTORY_ARCHIVE_BLOCKED',
      'Oculta o desvincula la publicación antes de archivar el SKU.');
  end if;
  perform laria_private.record_inventory_change(item, 'archive', jsonb_build_object('inventory_status', 'active'),
    jsonb_build_object('inventory_status', 'archived'), auth.uid(), 'owner', reason);
  update public.store_inventory_items set inventory_status = 'archived', version = version + 1
  where id = p_item_id returning * into item;
  return jsonb_build_object('item', laria_private.inventory_item_json(item));
end;
$$;

create or replace function public.unarchive_inventory_item(p_item_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_item_store_for_write(p_item_id);
  reason text := laria_private.inventory_short_text(p_reason, 280, 'reason');
  item public.store_inventory_items;
begin
  item := laria_private.lock_inventory_item(p_item_id);
  if item.inventory_status = 'active' then
    return jsonb_build_object('item', laria_private.inventory_item_json(item));
  end if;
  perform laria_private.record_inventory_change(item, 'unarchive', jsonb_build_object('inventory_status', 'archived'),
    jsonb_build_object('inventory_status', 'active'), auth.uid(), 'owner', reason);
  update public.store_inventory_items set inventory_status = 'active', version = version + 1
  where id = p_item_id returning * into item;
  return jsonb_build_object('item', laria_private.inventory_item_json(item));
end;
$$;

-- Keyset-paginated read of the caller's inventory (design §4.5); never loads every item.
-- p_filters: {stock: all|in_stock|low|out|archived (default: every active item), publication: none|pending|published|
--   hidden|rejected|changes_pending, catalog: matched|unmatched, category, q, sort: updated|name|available_asc|
--   available_desc|price_asc|price_desc}. p_cursor is the next_cursor of the previous page.
create or replace function public.get_inventory_page(p_filters jsonb default '{}'::jsonb, p_cursor jsonb default null, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_caller_store(false);
  filters jsonb := coalesce(p_filters, '{}'::jsonb);
  page_size integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  sort text := coalesce(nullif(filters->>'sort', ''), 'updated');
  stock text := coalesce(nullif(filters->>'stock', ''), 'all');
  publication text := nullif(filters->>'publication', '');
  catalog text := nullif(filters->>'catalog', '');
  category text := nullif(btrim(coalesce(filters->>'category', '')), '');
  search text := nullif(btrim(coalesce(filters->>'q', '')), '');
  sort_expression text;
  sort_type text;
  descending boolean;
  cursor_value text;
  cursor_id uuid;
  page_rows jsonb;
  has_more boolean;
  last_row jsonb;
begin
  case sort
    when 'updated' then sort_expression := 'i.updated_at'; sort_type := 'timestamptz'; descending := true;
    when 'name' then sort_expression := 'i.product_name'; sort_type := 'text'; descending := false;
    when 'available_asc' then sort_expression := 'i.quantity_available'; sort_type := 'integer'; descending := false;
    when 'available_desc' then sort_expression := 'i.quantity_available'; sort_type := 'integer'; descending := true;
    when 'price_asc' then sort_expression := 'coalesce(i.unit_price_pen, 2147483647)'; sort_type := 'integer'; descending := false;
    when 'price_desc' then sort_expression := 'coalesce(i.unit_price_pen, -1)'; sort_type := 'integer'; descending := true;
    else perform laria_private.raise_inventory_error('INVENTORY_FILTER_INVALID', 'Orden no compatible.');
  end case;
  if stock not in ('all', 'in_stock', 'low', 'out', 'archived')
    or coalesce(publication, 'none') not in ('none', 'pending', 'published', 'hidden', 'rejected', 'changes_pending')
    or coalesce(catalog, 'matched') not in ('matched', 'unmatched')
    or char_length(search) > 100 or char_length(category) > 80 then
    perform laria_private.raise_inventory_error('INVENTORY_FILTER_INVALID', 'Revisa los filtros.');
  end if;
  if p_cursor is not null and p_cursor <> 'null'::jsonb then
    cursor_value := p_cursor->>'value';
    cursor_id := laria_private.inventory_json_uuid(p_cursor, 'id');
    if cursor_id is null or cursor_value is null then
      perform laria_private.raise_inventory_error('INVENTORY_FILTER_INVALID', 'La página solicitada no es válida.');
    end if;
  end if;

  execute format($query$
    with page as (
      select i.*, %1$s as sort_value
      from public.store_inventory_items i
      left join public.listings l on l.id = i.listing_id
      where i.store_id = $1
        and case $2
          when 'archived' then i.inventory_status = 'archived'
          when 'all' then i.inventory_status = 'active'
          else i.inventory_status = 'active'
            and laria_private.inventory_stock_level(i.quantity_available, i.low_stock_threshold) = $2
        end
        and ($3::text is null or case $3
          when 'none' then i.listing_id is null
          when 'pending' then l.status = 'pending'
          when 'published' then l.status = 'approved'
          when 'hidden' then l.status = 'hidden'
          when 'rejected' then l.status = 'rejected'
          when 'changes_pending' then exists (
            select 1 from public.listing_revisions r where r.listing_id = i.listing_id and r.status = 'pending')
        end)
        and ($4::text is null or ($4 = 'matched') = (i.catalog_product_id is not null))
        and ($5::text is null or l.category = $5)
        and ($6::text is null or lower(i.product_name || ' ' || i.merchant_sku)
             like '%%' || replace(replace(replace(lower($6), '\', '\\'), '%%', '\%%'), '_', '\_') || '%%')
        and ($8::uuid is null or (%1$s, i.id) %2$s ($7::%3$s, $8))
      order by %1$s %4$s, i.id %4$s
      limit $9 + 1
    )
    select coalesce(jsonb_agg(laria_private.inventory_item_json(
             (select x from public.store_inventory_items x where x.id = page.id))
             || jsonb_build_object('sort_value', page.sort_value)
           order by page.sort_value %4$s, page.id %4$s), '[]'::jsonb)
    from page
  $query$,
    sort_expression,
    case when descending then '<' else '>' end,
    sort_type,
    case when descending then 'desc' else 'asc' end)
  into page_rows
  using owner_store_id, stock, publication, catalog, category, search, cursor_value, cursor_id, page_size;

  has_more := jsonb_array_length(page_rows) > page_size;
  if has_more then
    page_rows := page_rows - page_size;
    last_row := page_rows -> (page_size - 1);
  end if;
  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(element - 'sort_value'), '[]'::jsonb) from jsonb_array_elements(page_rows) element),
    'next_cursor', case when has_more then jsonb_build_object('value', last_row->>'sort_value', 'id', last_row->>'id') end
  );
end;
$$;

create or replace function public.get_inventory_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_caller_store(false);
  store_record public.stores;
  enabled boolean;
begin
  select * into store_record from public.stores where id = owner_store_id;
  select coalesce(settings.inventory_enabled, false) into enabled
  from (select 1) one left join public.store_operation_settings settings on settings.store_id = owner_store_id;
  return (
    select jsonb_build_object(
      'inventory_enabled', enabled,
      'can_write', enabled and store_record.status in ('pending', 'active'),
      'store_status', store_record.status,
      'skus', count(*) filter (where i.inventory_status = 'active'),
      'archived', count(*) filter (where i.inventory_status = 'archived'),
      'units', coalesce(sum(i.quantity_on_hand) filter (where i.inventory_status = 'active'), 0),
      'available_units', coalesce(sum(i.quantity_available) filter (where i.inventory_status = 'active'), 0),
      'low_stock', count(*) filter (where i.inventory_status = 'active'
        and laria_private.inventory_stock_level(i.quantity_available, i.low_stock_threshold) = 'low'),
      'out_of_stock', count(*) filter (where i.inventory_status = 'active' and i.quantity_available = 0),
      'unlinked', count(*) filter (where i.inventory_status = 'active' and i.listing_id is null),
      'published', count(*) filter (where l.status = 'approved'),
      'in_review', count(*) filter (where l.status = 'pending' or exists (
        select 1 from public.listing_revisions r where r.listing_id = l.id and r.status = 'pending')),
      'rejected', count(*) filter (where l.status = 'rejected'))
    from public.store_inventory_items i
    left join public.listings l on l.id = i.listing_id
    where i.store_id = owner_store_id
  );
end;
$$;

-- ------------------------------------------------------------------ admin

-- Pilot gate (D-2). Reason required; audited like every other privileged action.
create or replace function public.admin_set_store_inventory_enabled(p_store_id uuid, p_enabled boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
  previous boolean;
  settings public.store_operation_settings;
begin
  perform laria_private.assert_admin();
  if p_enabled is null or reason is null or char_length(reason) not between 3 and 280 then
    perform laria_private.raise_inventory_error('INVENTORY_REASON_REQUIRED', 'Indica el motivo del cambio.');
  end if;
  perform 1 from public.stores where id = p_store_id for update;
  if not found then
    perform laria_private.raise_inventory_error('STORE_NOT_FOUND', 'La tienda no existe.');
  end if;
  select inventory_enabled into previous from public.store_operation_settings where store_id = p_store_id;
  insert into public.store_operation_settings(store_id, inventory_enabled, updated_by)
  values (p_store_id, p_enabled, auth.uid())
  on conflict (store_id) do update set inventory_enabled = excluded.inventory_enabled, updated_by = excluded.updated_by
  returning * into settings;
  if coalesce(previous, false) is distinct from p_enabled then
    perform laria_private.record_admin_audit(
      case when p_enabled then 'store_inventory_enabled' else 'store_inventory_disabled' end,
      'store', p_store_id, jsonb_build_object('from', coalesce(previous, false), 'to', p_enabled, 'reason', reason));
  end if;
  return to_jsonb(settings);
end;
$$;

-- ------------------------------------------------------------------ listing integration

-- stock_state joins the fields only controlled functions may change.
create or replace function public.protect_listing_admin_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.allow_listing_admin_fields', true) = 'true' then
    return new;
  end if;

  if old.status = 'sold' then
    raise exception 'SOLD_LISTING_IMMUTABLE: Una publicación vendida no se puede modificar.';
  end if;

  if new.status is distinct from old.status
    or new.published_at is distinct from old.published_at
    or new.sold_at is distinct from old.sold_at
    or new.archived_at is distinct from old.archived_at
    or new.hidden_at is distinct from old.hidden_at
    or new.hidden_source is distinct from old.hidden_source
    or new.hidden_reason is distinct from old.hidden_reason
    or new.rejection_reason is distinct from old.rejection_reason
    or new.view_count is distinct from old.view_count
    or new.created_by_source is distinct from old.created_by_source
    or new.owner_user_id is distinct from old.owner_user_id
    or new.store_id is distinct from old.store_id
    or new.seller_type is distinct from old.seller_type
    or new.relisted_from_listing_id is distinct from old.relisted_from_listing_id
    or new.stock_state is distinct from old.stock_state then
    raise exception 'Only controlled server functions can change protected listing fields.';
  end if;

  if not public.is_admin()
    and old.status in ('approved', 'hidden')
    and (
      new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.category is distinct from old.category
      or new.instrument_type is distinct from old.instrument_type
      or new.attributes is distinct from old.attributes
      or new.brand is distinct from old.brand
      or new.model is distinct from old.model
      or new.condition is distinct from old.condition
      or new.price_pen is distinct from old.price_pen
      or new.city is distinct from old.city
      or new.region is distinct from old.region
      or new.contact_name is distinct from old.contact_name
      or new.whatsapp_phone is distinct from old.whatsapp_phone
    ) then
    raise exception 'APPROVED_LISTING_REQUIRES_CONTROLLED_EDIT: Usa el flujo de edición de la publicación.';
  end if;

  return new;
end;
$$;

-- A new listing never arrives with a stock_state, and a linked listing never becomes sold on any path (owner, Admin or
-- a future one): the store records the sale in Inventario, or unlinks first to use the V1 sold flow (D-15).
create or replace function laria_private.guard_inventory_managed_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.stock_state is not null and coalesce(current_setting('app.allow_listing_admin_fields', true), '') <> 'true' then
      raise exception 'Only controlled server functions can change protected listing fields.';
    end if;
    return new;
  end if;
  if new.status = 'sold' and old.status is distinct from 'sold'
    and exists (select 1 from public.store_inventory_items where listing_id = new.id) then
    raise exception using errcode = 'P0001',
      message = 'INVENTORY_MANAGED_LISTING: Registra la venta desde Inventario.';
  end if;
  return new;
end;
$$;

create trigger listings_guard_inventory_managed
before insert or update of status on public.listings
for each row execute function laria_private.guard_inventory_managed_listing();

-- Price write-through from the listing side (design §3.4): any controlled listing price edit (update_owned_listing,
-- Admin editor) is copied to the linked item. Runs after the listing row is locked, so the order stays listing → item.
-- A write from apply_inventory_price finds the item already equal and does nothing.
create or replace function laria_private.sync_inventory_price_from_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare item public.store_inventory_items; next_price integer := case when new.price_pen > 0 then new.price_pen end;
begin
  if new.store_id is null then return null; end if;
  select * into item from public.store_inventory_items where listing_id = new.id for update;
  if not found or item.unit_price_pen is not distinct from next_price then return null; end if;
  perform laria_private.record_inventory_change(item, 'price',
    jsonb_build_object('unit_price_pen', item.unit_price_pen), jsonb_build_object('unit_price_pen', next_price),
    auth.uid(), case when public.is_admin() then 'admin' when auth.uid() is null then 'system' else 'owner' end,
    'Precio editado en la publicación');
  update public.store_inventory_items set unit_price_pen = next_price, version = version + 1 where id = item.id;
  return null;
end;
$$;

create trigger listings_sync_inventory_price
after update of price_pen on public.listings
for each row when (old.price_pen is distinct from new.price_pen)
execute function laria_private.sync_inventory_price_from_listing();

-- Price drops on something not purchasable are noise (design §5.2); the next lower price after restock alerts.
create or replace function public.notify_favorite_price_drop()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare transition_id uuid;
begin
 if old.status<>'approved' or new.status<>'approved' or new.price_pen>=old.price_pen
  or new.stock_state is not distinct from 'out_of_stock'
  or not ((old.seller_type='individual' and old.store_id is null) or (old.seller_type='store' and exists(select 1 from public.stores where id=old.store_id and status='active')))
  or not public.listing_is_public(new.id) then return new; end if;
 insert into public.listing_price_drops(listing_id,old_price_pen,new_price_pen)
 values(new.id,old.price_pen,new.price_pen) returning id into transition_id;
 insert into public.notifications(user_id,event_type,message,listing_id,store_id,price_drop_id,old_price_pen,new_price_pen)
 select user_id,'listing_price_drop','Una publicación de tus favoritos bajó de S/ '||old.price_pen::bigint::text||' a S/ '||new.price_pen::bigint::text||'.',
 new.id,new.store_id,transition_id,old.price_pen,new.price_pen from public.favorites where listing_id=new.id
 on conflict do nothing;
 return new;
end $$;

-- A listing approved while out of stock is not "first public" yet (design §5.4). Its first transition to in stock
-- records the publication and matches saved searches once; the unique marker makes every later restock a no-op.
create or replace function laria_private.capture_listing_alert_publication()
returns trigger
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare public_at timestamptz := clock_timestamp(); inserted_id uuid;
begin
  if new.status <> 'approved'
    or new.stock_state is not distinct from 'out_of_stock'
    or not public.listing_is_public(new.id) then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.status = 'approved'
    and old.store_id is not distinct from new.store_id
    and old.stock_state is distinct from 'out_of_stock' then
    return new;
  end if;
  insert into laria_private.listing_alert_publications(listing_id, first_public_at)
  values(new.id, public_at)
  on conflict do nothing
  returning listing_id into inserted_id;
  if inserted_id is not null then perform laria_private.capture_saved_search_matches(new.id, public_at); end if;
  return new;
end;
$$;

drop trigger listings_saved_search_publication on public.listings;
create trigger listings_saved_search_publication
after insert or update of status, store_id, stock_state on public.listings
for each row execute function laria_private.capture_listing_alert_publication();

-- Store (re)activation records its approved listings as public, except the ones out of stock.
create or replace function laria_private.capture_store_alert_publication()
returns trigger
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare listing_record record; public_at timestamptz := clock_timestamp(); inserted_id uuid;
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then return new; end if;
  for listing_record in
    select id from public.listings
    where store_id = new.id and status = 'approved' and stock_state is distinct from 'out_of_stock'
    order by id
  loop
    inserted_id := null;
    insert into laria_private.listing_alert_publications(listing_id, first_public_at)
    values(listing_record.id, public_at)
    on conflict do nothing
    returning listing_id into inserted_id;
    if inserted_id is not null then perform laria_private.capture_saved_search_matches(listing_record.id, public_at); end if;
  end loop;
  return new;
end;
$$;

-- Publishing a new listing from an inventory item: p_fields may carry inventory_item_id for kind 'store_listing'. The
-- item is linked inside the same transaction, before a verified store's direct approval, so a listing published at
-- zero stock is approved as out of stock and sends no saved-search alert. Nothing else in this function changes.
create or replace function public.complete_public_submission(p_id uuid, p_kind text, p_fields jsonb, p_photos jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
  profile_record public.profiles;
  store_record public.stores;
  inventory_item_id uuid;
begin
  if p_kind = 'listing' then
    if coalesce(jsonb_array_length(p_photos), 0) not between 2 and 10 then
      raise exception 'A listing requires 2 to 10 photos.';
    end if;

    select * into profile_record
    from public.profiles
    where id = (p_fields->>'owner_user_id')::uuid
      and account_type = 'seller'
      and nullif(trim(coalesce(full_name, '')), '') is not null
      and nullif(trim(coalesce(phone, '')), '') is not null
      and nullif(trim(coalesce(city, '')), '') is not null
      and nullif(trim(coalesce(region, '')), '') is not null;

    if not found or coalesce((p_fields->>'marketplace_rules_accepted')::boolean, false) is not true then
      raise exception 'A complete Particular profile and rules acceptance are required.';
    end if;

    insert into public.listings (
      id, slug, title, category, instrument_type, attributes, brand, model,
      condition, price_pen, city, region, contact_name, whatsapp_phone,
      description, seller_type, status, owner_user_id, store_id,
      created_by_source, marketplace_rules_accepted_at
    ) values (
      p_id, p_fields->>'slug', p_fields->>'title', p_fields->>'category',
      p_fields->>'instrument_type', coalesce(p_fields->'attributes', '{}'::jsonb),
      p_fields->>'brand', p_fields->>'model', p_fields->>'condition',
      (p_fields->>'price_pen')::integer, p_fields->>'city', p_fields->>'region',
      profile_record.full_name, profile_record.phone, p_fields->>'description',
      'individual', 'pending', profile_record.id, null, 'self_service', now()
    ) on conflict (id) do nothing returning id into inserted_id;

    if inserted_id is not null then
      insert into public.listing_photos (listing_id, image_url, alt_text, sort_order)
      select p_id, photo->>'image_url', photo->>'alt_text', (ordinality - 1)::integer
      from jsonb_array_elements(p_photos) with ordinality as photos(photo, ordinality);
    end if;
  elsif p_kind = 'store' then
    select * into profile_record
    from public.profiles
    where id = (p_fields->>'owner_user_id')::uuid
      and account_type = 'store_owner';

    if not found then
      raise exception 'A separate Store Owner account is required.';
    end if;

    insert into public.stores (
      id, slug, name, description, status, listing_plan, contact_name,
      whatsapp_phone, city, region, district, address, instagram_url,
      facebook_url, logo_url, banner_url, owner_user_id, razon_social, ruc,
      contact_person, email, tiktok_url, website_url
    ) values (
      p_id, p_fields->>'slug', trim(p_fields->>'name'), nullif(trim(p_fields->>'description'), ''),
      'pending', 'free', trim(p_fields->>'contact_person'),
      regexp_replace(coalesce(p_fields->>'whatsapp_phone', ''), '[^0-9]', '', 'g'),
      trim(p_fields->>'city'), trim(p_fields->>'region'), nullif(trim(p_fields->>'district'), ''),
      trim(p_fields->>'address'), nullif(trim(p_fields->>'instagram_url'), ''),
      nullif(trim(p_fields->>'facebook_url'), ''),
      (select photo->>'image_url' from jsonb_array_elements(p_photos) photo where photo->>'role' = 'logo' limit 1),
      (select photo->>'image_url' from jsonb_array_elements(p_photos) photo where photo->>'role' = 'banner' limit 1),
      profile_record.id, trim(p_fields->>'razon_social'),
      regexp_replace(coalesce(p_fields->>'ruc', ''), '[^0-9]', '', 'g'),
      trim(p_fields->>'contact_person'), lower(trim(p_fields->>'email')),
      nullif(trim(p_fields->>'tiktok_url'), ''), nullif(trim(p_fields->>'website_url'), '')
    ) on conflict (id) do nothing returning id into inserted_id;

    if inserted_id is not null then
      if not public.store_application_is_complete(p_id) then
        raise exception 'Store application is incomplete.';
      end if;

      insert into public.store_photos (store_id, image_url, alt_text, sort_order)
      select p_id, photo->>'image_url', photo->>'alt_text', (ordinality - 1)::integer
      from jsonb_array_elements(p_photos) with ordinality as photos(photo, ordinality)
      where photo->>'role' = 'store_photo';
    end if;
  elsif p_kind = 'store_listing' then
    if coalesce(jsonb_array_length(p_photos), 0) not between 2 and 10 then
      raise exception 'A listing requires 2 to 10 photos.';
    end if;

    select s.* into store_record
    from public.stores s
    join public.profiles p on p.id = s.owner_user_id
    where s.id = (p_fields->>'store_id')::uuid
      and s.owner_user_id = (p_fields->>'owner_user_id')::uuid
      and p.account_type = 'store_owner'
      and s.status in ('pending', 'active')
    for update;

    if not found then
      raise exception 'An eligible owner-bound store is required.';
    end if;
    if coalesce((p_fields->>'marketplace_rules_accepted')::boolean, false) is not true then
      raise exception 'Marketplace rules acceptance is required.';
    end if;
    inventory_item_id := laria_private.inventory_json_uuid(p_fields, 'inventory_item_id');

    insert into public.listings (
      id, slug, title, category, instrument_type, attributes, brand, model,
      condition, price_pen, city, region, contact_name, whatsapp_phone,
      description, seller_type, status, owner_user_id, store_id,
      created_by_source, marketplace_rules_accepted_at
    ) values (
      p_id, p_fields->>'slug', p_fields->>'title', p_fields->>'category',
      p_fields->>'instrument_type', coalesce(p_fields->'attributes', '{}'::jsonb),
      p_fields->>'brand', p_fields->>'model', p_fields->>'condition',
      (p_fields->>'price_pen')::integer, store_record.city, store_record.region,
      store_record.contact_person, store_record.whatsapp_phone, p_fields->>'description',
      'store', 'pending', store_record.owner_user_id, store_record.id,
      'self_service', now()
    ) on conflict (id) do nothing returning id into inserted_id;

    if inserted_id is not null then
      insert into public.listing_photos (listing_id, image_url, alt_text, sort_order)
      select p_id, photo->>'image_url', photo->>'alt_text', (ordinality - 1)::integer
      from jsonb_array_elements(p_photos) with ordinality as photos(photo, ordinality);

      if inventory_item_id is not null then
        perform laria_private.link_new_store_listing(p_id, inventory_item_id, store_record.id, store_record.owner_user_id);
      end if;

      if store_record.status = 'active' and store_record.is_verified then
        if not public.listing_meets_publish_requirements(p_id) then
          raise exception 'Listing does not meet publication requirements.';
        end if;
        perform set_config('app.allow_listing_admin_fields', 'true', true);
        update public.listings
        set status = 'approved', published_at = coalesce(published_at, now())
        where id = p_id;
      end if;
    end if;
  else
    raise exception 'Invalid submission kind';
  end if;

  return p_id;
end;
$$;

-- ------------------------------------------------------------------ function privileges

revoke all on function public.complete_public_submission(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.complete_public_submission(uuid, text, jsonb, jsonb) to service_role;

revoke all on function public.create_inventory_item(jsonb, integer, text) from public, anon, authenticated;
revoke all on function public.record_stock_movement(uuid, text, integer, text, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.apply_bulk_stock_operations(jsonb, text) from public, anon, authenticated;
revoke all on function public.preview_inventory_price_bulk(uuid[], text, integer) from public, anon, authenticated;
revoke all on function public.set_inventory_price_bulk(uuid[], text, integer, text) from public, anon, authenticated;
revoke all on function public.update_inventory_item(uuid, jsonb, integer) from public, anon, authenticated;
revoke all on function public.change_inventory_sku(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.link_inventory_listing(uuid, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.unlink_inventory_listing(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.archive_inventory_item(uuid, text) from public, anon, authenticated;
revoke all on function public.unarchive_inventory_item(uuid, text) from public, anon, authenticated;
revoke all on function public.get_inventory_page(jsonb, jsonb, integer) from public, anon, authenticated;
revoke all on function public.get_inventory_summary() from public, anon, authenticated;
revoke all on function public.admin_set_store_inventory_enabled(uuid, boolean, text) from public, anon, authenticated;

grant execute on function public.create_inventory_item(jsonb, integer, text) to authenticated;
grant execute on function public.record_stock_movement(uuid, text, integer, text, text, text, integer, text) to authenticated;
grant execute on function public.apply_bulk_stock_operations(jsonb, text) to authenticated;
grant execute on function public.preview_inventory_price_bulk(uuid[], text, integer) to authenticated;
grant execute on function public.set_inventory_price_bulk(uuid[], text, integer, text) to authenticated;
grant execute on function public.update_inventory_item(uuid, jsonb, integer) to authenticated;
grant execute on function public.change_inventory_sku(uuid, text, text, integer) to authenticated;
grant execute on function public.link_inventory_listing(uuid, uuid, integer, integer) to authenticated;
grant execute on function public.unlink_inventory_listing(uuid, text, integer) to authenticated;
grant execute on function public.archive_inventory_item(uuid, text) to authenticated;
grant execute on function public.unarchive_inventory_item(uuid, text) to authenticated;
grant execute on function public.get_inventory_page(jsonb, jsonb, integer) to authenticated;
grant execute on function public.get_inventory_summary() to authenticated;
grant execute on function public.admin_set_store_inventory_enabled(uuid, boolean, text) to authenticated;

-- Internal helpers: no browser execute (laria_private also has no browser schema usage).
do $$
declare fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'laria_private' and p.proname in (
      'reject_inventory_ledger_change', 'raise_inventory_error', 'inventory_fingerprint', 'inventory_request_key',
      'inventory_json_text', 'inventory_json_int', 'inventory_json_uuid', 'inventory_short_text', 'inventory_valid_sku',
      'inventory_stock_level', 'stock_state_for', 'inventory_item_json', 'stock_movement_json', 'require_inventory_write',
      'inventory_caller_store', 'inventory_item_store_for_write', 'lock_inventory_item', 'lock_inventory_items',
      'write_listing_stock_state', 'record_inventory_change', 'apply_inventory_price', 'apply_stock_movement',
      'owner_movement_args', 'inventory_bulk_price', 'validate_bulk_price_args', 'inventory_catalog_ids_valid',
      'next_generated_sku', 'link_new_store_listing', 'guard_inventory_managed_listing',
      'sync_inventory_price_from_listing', 'capture_listing_alert_publication', 'capture_store_alert_publication')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end;
$$;
