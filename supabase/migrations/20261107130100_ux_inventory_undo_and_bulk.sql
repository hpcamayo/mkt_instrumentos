-- Effortless Laria, inventory batch (docs/ux-effortless/inventory.md): undo (stock-03), price campaigns (stock-15),
-- whole-selection bulk actions (stock-14), the SKU category (stock-20) and the store's low-stock default and daily
-- summary (stock-06).
--
-- Rules kept from Store Operations (docs/store-operations/design.md §4.3):
--   * Lock order on every path: idempotency key (advisory lock) → linked listings → inventory items, each in id order.
--   * The ledger stays append-only. An undo never edits or deletes a movement: it appends a `correction` movement that
--     points at the movement it cancels (one correction per movement), so history shows both and sales totals skip
--     the cancelled sale.
--   * Every bulk change is all-or-nothing and replays its first result when retried with the same key.

-- ------------------------------------------------------------------ shared helpers

-- A bulk receipt: serializes on the key, then returns the earlier result (marked replayed) or null for a new request.
create or replace function laria_private.inventory_receipt(p_store_id uuid, p_key text, p_operation text, p_fingerprint text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare receipt laria_private.store_inventory_batch_receipts;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_key, 23));
  select * into receipt from laria_private.store_inventory_batch_receipts r
  where r.store_id = p_store_id and r.batch_key = p_key;
  if not found then return null; end if;
  if receipt.operation <> p_operation or receipt.request_fingerprint <> p_fingerprint then
    perform laria_private.raise_inventory_error('IDEMPOTENCY_KEY_REUSED', 'Esta solicitud ya se usó con otros datos.');
  end if;
  return receipt.result || jsonb_build_object('replayed', true);
end;
$$;

create or replace function laria_private.inventory_receipt_save(
  p_store_id uuid, p_key text, p_operation text, p_fingerprint text, p_result jsonb
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  insert into laria_private.store_inventory_batch_receipts(store_id, batch_key, operation, request_fingerprint, result, actor_user_id)
  values (p_store_id, p_key, p_operation, p_fingerprint, p_result, auth.uid());
  select p_result || jsonb_build_object('replayed', false);
$$;

-- The bulk size used across Inventario (stock-14: "select everything that matches"). Was 200 per call.
create or replace function laria_private.inventory_bulk_limit()
returns integer
language sql
immutable
as $$ select 2000 $$;

-- 1–2000 distinct ids of the caller's store, or an error.
create or replace function laria_private.inventory_owned_ids(p_store_id uuid, p_item_ids uuid[])
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_item_ids is null or cardinality(p_item_ids) not between 1 and laria_private.inventory_bulk_limit()
    or array_position(p_item_ids, null) is not null
    or (select count(distinct id) from unnest(p_item_ids) id) <> cardinality(p_item_ids) then
    perform laria_private.raise_inventory_error('INVENTORY_BULK_INVALID',
      'Elige entre 1 y ' || laria_private.inventory_bulk_limit() || ' SKU distintos.');
  end if;
  if (select count(*) from public.store_inventory_items i where i.id = any(p_item_ids) and i.store_id = p_store_id)
     <> cardinality(p_item_ids) then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_NOT_OWNED', 'No puedes administrar uno de estos SKU.');
  end if;
end;
$$;

-- ------------------------------------------------------------------ stock-14: the 200-SKU limit becomes 2000

-- Same technique as 20261029120100_review_fixes_lock_order.sql: each function is rewritten from its current
-- definition with exact replacements that must match exactly once.
create function pg_temp.patch(p_function regprocedure, variadic p_edits text[])
returns void
language plpgsql
as $$
declare
  definition text := pg_get_functiondef(p_function);
  edit integer;
begin
  for edit in 1 .. cardinality(p_edits) by 2 loop
    if (length(definition) - length(replace(definition, p_edits[edit], ''))) / length(p_edits[edit]) <> 1 then
      raise exception 'patch(%): expected exactly one occurrence of %', p_function, p_edits[edit];
    end if;
    definition := replace(definition, p_edits[edit], p_edits[edit + 1]);
  end loop;
  execute definition;
end;
$$;

select pg_temp.patch('laria_private.validate_bulk_price_args(uuid[],text,integer)',
  'cardinality(p_item_ids) not between 1 and 200', 'cardinality(p_item_ids) not between 1 and laria_private.inventory_bulk_limit()',
  '''Elige entre 1 y 200 SKU distintos.''', '''Elige entre 1 y '' || laria_private.inventory_bulk_limit() || '' SKU distintos.''');
select pg_temp.patch('public.apply_bulk_stock_operations(jsonb,text)',
  'jsonb_array_length(p_operations) not between 1 and 200', 'jsonb_array_length(p_operations) not between 1 and laria_private.inventory_bulk_limit()',
  '''Elige entre 1 y 200 SKU.''', '''Elige entre 1 y '' || laria_private.inventory_bulk_limit() || '' SKU.''');
select pg_temp.patch('public.set_inventory_threshold_bulk(uuid[],integer,text)',
  'cardinality(p_item_ids) not between 1 and 200', 'cardinality(p_item_ids) not between 1 and laria_private.inventory_bulk_limit()',
  '''Elige entre 1 y 200 SKU distintos.''', '''Elige entre 1 y '' || laria_private.inventory_bulk_limit() || '' SKU distintos.''');
select pg_temp.patch('public.hide_inventory_listings_bulk(uuid[],text)',
  'cardinality(p_item_ids) not between 1 and 200', 'cardinality(p_item_ids) not between 1 and laria_private.inventory_bulk_limit()',
  '''Elige entre 1 y 200 SKU distintos.''', '''Elige entre 1 y '' || laria_private.inventory_bulk_limit() || '' SKU distintos.''');

drop function pg_temp.patch(regprocedure, text[]);

-- ------------------------------------------------------------------ stock-03: undo a stock movement

alter table public.store_stock_movements
  add column corrects_movement_id uuid references public.store_stock_movements(id) on delete restrict;
create unique index store_stock_movements_corrects_idx on public.store_stock_movements(corrects_movement_id)
  where corrects_movement_id is not null;
-- A correction cancels exactly one earlier movement and nothing else carries the pointer.
alter table public.store_stock_movements add constraint movement_correction_target check (
  (movement_type = 'correction') = (corrects_movement_id is not null));

-- How long the server accepts an undo. The screens offer "Deshacer" for ten seconds; the server allows longer so a
-- slow connection never turns a pressed "Deshacer" into an error.
create or replace function laria_private.inventory_undo_window()
returns interval
language sql
immutable
as $$ select interval '15 minutes' $$;

-- Appends the correction for one movement to an item the caller has locked (listing first). Mirrors the update and
-- insert of apply_stock_movement; the table checks stay the last line of defence against negative stock.
create or replace function laria_private.apply_stock_correction(
  p_original public.store_stock_movements,
  p_idempotency_key text,
  p_fingerprint text,
  p_reason text
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
  select * into item from public.store_inventory_items where id = p_original.item_id;
  before_item := item;
  if item.inventory_status = 'archived' then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_ARCHIVED', 'Reactiva el SKU antes de deshacer un movimiento.');
  end if;
  new_on_hand := item.quantity_on_hand - p_original.on_hand_delta;
  if new_on_hand < item.quantity_reserved or new_on_hand < 0 then
    perform laria_private.raise_inventory_error('STOCK_UNDO_INSUFFICIENT',
      'No se puede deshacer: el SKU ' || item.merchant_sku || ' ya no tiene esas unidades. Registra un conteo si el stock real es distinto.',
      jsonb_build_object('item_id', item.id, 'quantity_available', item.quantity_available));
  end if;
  if new_on_hand > 1000000 then
    perform laria_private.raise_inventory_error('STOCK_QUANTITY_INVALID', 'El stock no puede superar 1000000 unidades.');
  end if;

  update public.store_inventory_items
  set quantity_on_hand = new_on_hand, version = version + 1, last_movement_at = now()
  where id = item.id
  returning * into item;

  insert into public.store_stock_movements (
    store_id, item_id, movement_type, channel, on_hand_delta, reserved_delta,
    on_hand_before, on_hand_after, reserved_before, reserved_after,
    actor_user_id, actor_kind, reference, reason, idempotency_key, request_fingerprint, item_version_after,
    corrects_movement_id
  ) values (
    item.store_id, item.id, 'correction', 'panel', new_on_hand - before_item.quantity_on_hand, 0,
    before_item.quantity_on_hand, new_on_hand, before_item.quantity_reserved, item.quantity_reserved,
    auth.uid(), 'owner', null, p_reason, p_idempotency_key, p_fingerprint, item.version,
    p_original.id
  ) returning * into movement;

  if item.listing_id is not null then
    perform laria_private.write_listing_stock_state(item.listing_id, laria_private.stock_state_for(item.quantity_available));
  end if;
  return movement;
end;
$$;

-- "Deshacer" for one or more movements the store recorded by hand (a row's −1/+1, a sale at the counter, a bulk stock
-- change). All or nothing. Refused: movements of another store, older than the undo window, already undone,
-- corrections themselves, opening balances, import reconciliations and anything Laria or an Admin recorded.
create or replace function public.undo_stock_movements(p_movement_ids uuid[], p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_caller_store(true);
  request_key text := laria_private.inventory_request_key(p_idempotency_key, 160);
  fingerprint text;
  replay jsonb;
  original public.store_stock_movements;
  item_ids uuid[];
  corrections jsonb := '[]'::jsonb;
  correction public.store_stock_movements;
begin
  if p_movement_ids is null or cardinality(p_movement_ids) not between 1 and laria_private.inventory_bulk_limit()
    or array_position(p_movement_ids, null) is not null
    or (select count(distinct id) from unnest(p_movement_ids) id) <> cardinality(p_movement_ids) then
    perform laria_private.raise_inventory_error('INVENTORY_BULK_INVALID', 'No hay movimientos que deshacer.');
  end if;
  fingerprint := laria_private.inventory_fingerprint(jsonb_build_array(
    'undo_stock_movements', (select jsonb_agg(id order by id) from unnest(p_movement_ids) id)));
  replay := laria_private.inventory_receipt(owner_store_id, request_key, 'undo', fingerprint);
  if replay is not null then return replay; end if;

  if (select count(*) from public.store_stock_movements m
      where m.id = any(p_movement_ids) and m.store_id = owner_store_id) <> cardinality(p_movement_ids) then
    perform laria_private.raise_inventory_error('STOCK_UNDO_NOT_FOUND', 'No encontramos ese movimiento en tu inventario.');
  end if;
  select array_agg(distinct item_id) into item_ids from public.store_stock_movements where id = any(p_movement_ids);
  perform laria_private.lock_inventory_items(item_ids);

  for original in select * from public.store_stock_movements where id = any(p_movement_ids) order by item_id, created_at, id loop
    if original.actor_kind <> 'owner'
      or original.movement_type not in ('sale', 'return', 'restock', 'damage_or_loss', 'manual_adjustment', 'stock_count') then
      perform laria_private.raise_inventory_error('STOCK_UNDO_NOT_ALLOWED',
        'Este movimiento no se puede deshacer. Si el stock no es correcto, registra un conteo.');
    end if;
    if original.created_at < now() - laria_private.inventory_undo_window() then
      perform laria_private.raise_inventory_error('STOCK_UNDO_EXPIRED',
        'Ya pasó el tiempo para deshacer este movimiento. Si el stock no es correcto, registra un conteo.');
    end if;
    if original.on_hand_delta = 0 then
      perform laria_private.raise_inventory_error('STOCK_UNDO_NOT_ALLOWED', 'Este movimiento no cambió el stock; no hay nada que deshacer.');
    end if;
    if exists (select 1 from public.store_stock_movements c where c.corrects_movement_id = original.id) then
      perform laria_private.raise_inventory_error('STOCK_UNDO_DONE', 'Este movimiento ya se deshizo.');
    end if;
    correction := laria_private.apply_stock_correction(original, request_key || ':' || original.id::text,
      laria_private.inventory_fingerprint(jsonb_build_array('undo_stock_movements', request_key, original.id)),
      'Deshecho por la tienda');
    corrections := corrections || jsonb_build_array(laria_private.stock_movement_json(correction));
  end loop;

  return laria_private.inventory_receipt_save(owner_store_id, request_key, 'undo', fingerprint, jsonb_build_object(
    'corrections', corrections,
    'items', (select jsonb_agg(laria_private.inventory_item_json(i) order by i.id)
              from public.store_inventory_items i where i.id = any(item_ids))));
end;
$$;

-- Movements a store's sales figures count: sales and returns that were not undone (stock-03: an undone sale is not a
-- sale). Used by the summary, the reorder list and the counter.
create or replace function laria_private.store_net_sales(p_store_id uuid, p_since timestamptz)
returns table(item_id uuid, units bigint, sales bigint)
language sql
stable
security definer
set search_path = public
as $$
  select m.item_id,
         coalesce(sum(-m.on_hand_delta) filter (where m.movement_type = 'sale'), 0)
           - coalesce(sum(m.on_hand_delta) filter (where m.movement_type = 'return'), 0) as units,
         count(*) filter (where m.movement_type = 'sale') as sales
  from public.store_stock_movements m
  where m.store_id = p_store_id
    and m.movement_type in ('sale', 'return')
    and m.created_at >= p_since
    and not exists (select 1 from public.store_stock_movements c where c.corrects_movement_id = m.id)
  group by m.item_id;
$$;

-- get_inventory_summary as in 20261024120000_store_inventory_ui.sql with three changes: sales skip undone movements
-- (stock-03), recent movements carry whether they were undone, and the store's low-stock preferences are returned
-- for the Inventario screens (stock-06).
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
  totals jsonb;
  sales jsonb;
  recent jsonb;
  preferences jsonb;
begin
  select * into store_record from public.stores where id = owner_store_id;
  select coalesce(settings.inventory_enabled, false) into enabled
  from (select 1) one left join public.store_operation_settings settings on settings.store_id = owner_store_id;

  select jsonb_build_object(
      'skus', count(*) filter (where i.inventory_status = 'active'),
      'archived', count(*) filter (where i.inventory_status = 'archived'),
      'units', coalesce(sum(i.quantity_on_hand) filter (where i.inventory_status = 'active'), 0),
      'available_units', coalesce(sum(i.quantity_available) filter (where i.inventory_status = 'active'), 0),
      'low_stock', count(*) filter (where i.inventory_status = 'active'
        and laria_private.inventory_stock_level(i.quantity_available, i.low_stock_threshold) = 'low'),
      'out_of_stock', count(*) filter (where i.inventory_status = 'active' and i.quantity_available = 0),
      'unlinked', count(*) filter (where i.inventory_status = 'active' and i.listing_id is null),
      'no_price', count(*) filter (where i.inventory_status = 'active' and i.unit_price_pen is null),
      'published', count(*) filter (where l.status = 'approved'),
      'hidden', count(*) filter (where l.status = 'hidden'),
      'in_review', count(*) filter (where l.status = 'pending' or exists (
        select 1 from public.listing_revisions r where r.listing_id = l.id and r.status = 'pending')),
      'rejected', count(*) filter (where l.status = 'rejected'))
  into totals
  from public.store_inventory_items i
  left join public.listings l on l.id = i.listing_id
  where i.store_id = owner_store_id;

  select jsonb_build_object('sales_30d_units', coalesce(sum(net.units), 0), 'sales_30d_count', coalesce(sum(net.sales), 0))
  into sales
  from laria_private.store_net_sales(owner_store_id, now() - interval '30 days') net;

  select coalesce(jsonb_agg(row_value order by created_at desc, id desc), '[]'::jsonb) into recent
  from (
    select m.id, m.created_at, jsonb_build_object(
        'id', m.id, 'item_id', m.item_id, 'merchant_sku', i.merchant_sku, 'product_name', i.product_name,
        'movement_type', m.movement_type, 'channel', m.channel, 'on_hand_delta', m.on_hand_delta,
        'on_hand_after', m.on_hand_after, 'actor_kind', m.actor_kind, 'created_at', m.created_at,
        'undone', exists (select 1 from public.store_stock_movements c where c.corrects_movement_id = m.id)) as row_value
    from public.store_stock_movements m
    join public.store_inventory_items i on i.id = m.item_id
    where m.store_id = owner_store_id
    order by m.created_at desc, m.id desc
    limit 5
  ) latest;

  select jsonb_build_object(
      'default_low_stock_threshold', p.default_low_stock_threshold,
      'daily_stock_summary', coalesce(p.daily_stock_summary, false),
      'pickup_hours', p.pickup_hours)
  into preferences
  from (select 1) one left join public.store_inventory_preferences p on p.store_id = owner_store_id;

  return jsonb_build_object(
      'inventory_enabled', enabled,
      'can_write', enabled and store_record.status in ('pending', 'active'),
      'store_status', store_record.status,
      'recent_movements', recent,
      'preferences', preferences)
    || totals || sales;
end;
$$;

-- ------------------------------------------------------------------ stock-06: the store's low-stock default

-- Owner-editable Inventario preferences (store_operation_settings stays Admin-only). A missing row means: no default,
-- no daily summary. pickup_hours feeds the ready-made WhatsApp replies (stock-05).
create table public.store_inventory_preferences (
  store_id                     uuid primary key references public.stores(id) on delete cascade,
  default_low_stock_threshold  integer check (default_low_stock_threshold is null or default_low_stock_threshold between 0 and 100000),
  daily_stock_summary          boolean not null default false,
  pickup_hours                 text check (pickup_hours is null or char_length(pickup_hours) between 1 and 120),
  updated_at                   timestamptz not null default now()
);

create trigger store_inventory_preferences_set_updated_at
before update on public.store_inventory_preferences
for each row execute function public.set_updated_at();

alter table public.store_inventory_preferences enable row level security;
revoke all on public.store_inventory_preferences from public, anon, authenticated;
grant select on public.store_inventory_preferences to authenticated;
create policy "Store owners can read own inventory preferences" on public.store_inventory_preferences
  for select to authenticated using (public.is_store_owner(store_id));

-- A new SKU with no threshold of its own takes the store's default, whichever path creates it (Nuevo SKU, variants,
-- "Controlar stock", an import). The owner can still clear it on the SKU.
create or replace function laria_private.inventory_item_default_threshold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.low_stock_threshold is null then
    select p.default_low_stock_threshold into new.low_stock_threshold
    from public.store_inventory_preferences p where p.store_id = new.store_id;
  end if;
  return new;
end;
$$;

create trigger store_inventory_items_default_threshold
before insert on public.store_inventory_items
for each row execute function laria_private.inventory_item_default_threshold();

-- Saves the preferences present in p_fields (default_low_stock_threshold, daily_stock_summary, pickup_hours; null
-- clears). With p_apply_to_unset, active SKUs that have no threshold take the new default in the same transaction,
-- each change audited like a bulk threshold.
create or replace function public.set_inventory_preferences(p_fields jsonb, p_apply_to_unset boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner_store_id uuid := laria_private.inventory_caller_store(true);
  current_row public.store_inventory_preferences;
  next_threshold integer;
  next_summary boolean;
  next_hours text;
  target_ids uuid[];
  item public.store_inventory_items;
  applied integer := 0;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_fields) key
    where key not in ('default_low_stock_threshold', 'daily_stock_summary', 'pickup_hours')) then
    perform laria_private.raise_inventory_error('INVENTORY_FIELD_NOT_ALLOWED', 'Se recibió un campo no editable.');
  end if;
  insert into public.store_inventory_preferences(store_id) values (owner_store_id) on conflict (store_id) do nothing;
  select * into current_row from public.store_inventory_preferences where store_id = owner_store_id for update;

  next_threshold := case when p_fields ? 'default_low_stock_threshold'
    then laria_private.inventory_json_int(p_fields, 'default_low_stock_threshold') else current_row.default_low_stock_threshold end;
  if next_threshold is not null and next_threshold not between 0 and 100000 then
    perform laria_private.raise_inventory_error('INVENTORY_FIELD_INVALID', 'El aviso de stock bajo va de 0 a 100000.',
      jsonb_build_object('field', 'default_low_stock_threshold'));
  end if;
  if p_fields ? 'daily_stock_summary' and jsonb_typeof(p_fields->'daily_stock_summary') <> 'boolean' then
    perform laria_private.raise_inventory_error('INVENTORY_FIELD_INVALID', 'Revisa el resumen diario.',
      jsonb_build_object('field', 'daily_stock_summary'));
  end if;
  next_summary := coalesce((p_fields->>'daily_stock_summary')::boolean, current_row.daily_stock_summary);
  next_hours := case when p_fields ? 'pickup_hours'
    then laria_private.inventory_json_text(p_fields, 'pickup_hours', 120) else current_row.pickup_hours end;

  update public.store_inventory_preferences
  set default_low_stock_threshold = next_threshold, daily_stock_summary = next_summary, pickup_hours = next_hours
  where store_id = owner_store_id
  returning * into current_row;

  if p_apply_to_unset and next_threshold is not null then
    select array_agg(id order by id) into target_ids from public.store_inventory_items
    where store_id = owner_store_id and inventory_status = 'active' and low_stock_threshold is null;
    if target_ids is not null then
      perform laria_private.lock_inventory_items(target_ids);
      for item in select * from public.store_inventory_items where id = any(target_ids) order by id loop
        continue when item.low_stock_threshold is not null;
        perform laria_private.record_inventory_change(item, 'details',
          jsonb_build_object('low_stock_threshold', null), jsonb_build_object('low_stock_threshold', next_threshold),
          caller, 'owner', 'Aviso de stock bajo de la tienda');
        update public.store_inventory_items set low_stock_threshold = next_threshold, version = version + 1 where id = item.id;
        applied := applied + 1;
      end loop;
    end if;
  end if;

  return jsonb_build_object('preferences', jsonb_build_object(
      'default_low_stock_threshold', current_row.default_low_stock_threshold,
      'daily_stock_summary', current_row.daily_stock_summary,
      'pickup_hours', current_row.pickup_hours),
    'applied', applied);
end;
$$;

-- ------------------------------------------------------------------ stock-06: the optional daily summary

-- One in-app notification a day for stores that turned it on, only when there is something to say:
-- "Stock bajo: 6 · Agotados hoy: 2", sent at closing time (20:00 Lima) so "hoy" is the day that just ended. Off by
-- default; it goes to the owner's Notificaciones, never by e-mail.
-- The event type is added through the shared laria_private.ux_extend_text_check (20261102120500), which keeps every
-- type other batches added whatever form Postgres prints the list in (docs/ux-effortless/integration.md,
-- UXD-integration-3).
select laria_private.ux_extend_text_check('public.notifications', 'notifications_event_type_check', 'event_type',
  array['store_stock_summary']);

create or replace function laria_private.send_inventory_daily_summaries(p_day date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  lima_day date := coalesce(p_day, (now() at time zone 'America/Lima')::date);
  day_start timestamptz := lima_day::timestamp at time zone 'America/Lima';
  target record;
  sent integer := 0;
begin
  for target in
    select s.id as store_id, s.owner_user_id,
      (select count(*) from public.store_inventory_items i where i.store_id = s.id and i.inventory_status = 'active'
         and laria_private.inventory_stock_level(i.quantity_available, i.low_stock_threshold) = 'low') as low,
      (select count(*) from public.store_inventory_items i where i.store_id = s.id and i.inventory_status = 'active'
         and i.quantity_available = 0 and exists (
           select 1 from public.store_stock_movements m where m.item_id = i.id and m.on_hand_delta < 0
             and m.created_at >= day_start and m.created_at < day_start + interval '1 day')) as out_today
    from public.stores s
    join public.store_inventory_preferences p on p.store_id = s.id and p.daily_stock_summary
    join public.store_operation_settings o on o.store_id = s.id and o.inventory_enabled
    where s.status in ('pending', 'active') and s.owner_user_id is not null
  loop
    continue when target.low = 0 and target.out_today = 0;
    continue when exists (select 1 from public.notifications n where n.user_id = target.owner_user_id
      and n.event_type = 'store_stock_summary' and n.store_id = target.store_id and n.created_at >= day_start);
    insert into public.notifications(user_id, event_type, message, store_id)
    values (target.owner_user_id, 'store_stock_summary',
      'Stock bajo: ' || target.low || ' · Agotados hoy: ' || target.out_today, target.store_id);
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

-- 20:00 Lima (01:00 UTC) every day. cron.schedule() with a job name replaces the job of that name.
select cron.schedule('inventory-daily-summary', '0 1 * * *', $$select laria_private.send_inventory_daily_summaries()$$);

-- ------------------------------------------------------------------ stock-15: price campaigns you can undo

-- Every bulk price change from Inventario is a campaign: what changed, from what to what, so "Volver a precios
-- anteriores" can put back exactly the prices it set. Read by the owner only.
create table public.store_price_campaigns (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  mode          text not null check (mode in ('set', 'add', 'percent')),
  value         integer not null,
  rounding      text not null default 'none' check (rounding in ('none', 'nine')),
  item_count    integer not null check (item_count > 0),
  changes       jsonb not null check (jsonb_typeof(changes) = 'array'),
  batch_key     text not null,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  reverted_at   timestamptz,
  reverted_by   uuid,
  revert_result jsonb,
  unique (store_id, batch_key)
);
create index store_price_campaigns_store_idx on public.store_price_campaigns(store_id, created_at desc);

alter table public.store_price_campaigns enable row level security;
revoke all on public.store_price_campaigns from public, anon, authenticated;
grant select on public.store_price_campaigns to authenticated;
create policy "Store owners can read own price campaigns" on public.store_price_campaigns
  for select to authenticated using (public.is_store_owner(store_id));

-- "Redondear a …9": the nearest whole-sol price ending in 9; a tie goes down, the buyer-friendly side.
create or replace function laria_private.inventory_round_price(p_price bigint, p_rounding text)
returns bigint
language sql
immutable
as $$
  select case
    when p_price is null or p_rounding is distinct from 'nine' then p_price
    when p_price < 9 then 9
    else (select case when up - p_price < p_price - down or down < 1 then up else down end
          from (select p_price - (p_price % 10) + 9 as up, p_price - (p_price % 10) - 1 as down) candidates)
  end;
$$;

create or replace function laria_private.inventory_campaign_price(p_price integer, p_mode text, p_value integer, p_rounding text)
returns bigint
language sql
immutable
as $$ select laria_private.inventory_round_price(laria_private.inventory_bulk_price(p_price, p_mode, p_value), p_rounding) $$;

create or replace function public.preview_inventory_price_campaign(p_item_ids uuid[], p_mode text, p_value integer, p_rounding text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare owner_store_id uuid := laria_private.inventory_caller_store(false);
begin
  perform laria_private.validate_bulk_price_args(p_item_ids, p_mode, p_value);
  if coalesce(p_rounding, '') not in ('none', 'nine') then
    perform laria_private.raise_inventory_error('INVENTORY_PRICE_INVALID', 'Revisa el redondeo.');
  end if;
  perform laria_private.inventory_owned_ids(owner_store_id, p_item_ids);
  return (
    select jsonb_build_object(
      'rule', case when p_rounding = 'nine'
        then 'Precios en soles enteros, redondeados al número terminado en 9 más cercano.'
        else 'Precios en soles enteros; los porcentajes se redondean al sol más cercano.' end,
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
    cross join lateral (select laria_private.inventory_campaign_price(i.unit_price_pen, p_mode, p_value, p_rounding) as value) computed
    where i.id = any(p_item_ids)
  );
end;
$$;

-- Applies a campaign, all or nothing, and records it. Each price goes through apply_inventory_price, so linked
-- publications change too and favorites' price-drop notices behave as for a manual edit.
create or replace function public.apply_inventory_price_campaign(
  p_item_ids uuid[], p_mode text, p_value integer, p_rounding text, p_name text, p_batch_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner_store_id uuid := laria_private.inventory_caller_store(true);
  request_key text := laria_private.inventory_request_key(p_batch_key, 160);
  campaign_name text := coalesce(laria_private.inventory_short_text(p_name, 80, 'name'),
    'Cambio de precio del ' || to_char(now() at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI'));
  fingerprint text;
  replay jsonb;
  target record;
  changes jsonb := '[]'::jsonb;
  campaign public.store_price_campaigns;
begin
  perform laria_private.validate_bulk_price_args(p_item_ids, p_mode, p_value);
  if coalesce(p_rounding, '') not in ('none', 'nine') then
    perform laria_private.raise_inventory_error('INVENTORY_PRICE_INVALID', 'Revisa el redondeo.');
  end if;
  fingerprint := laria_private.inventory_fingerprint(jsonb_build_array('apply_inventory_price_campaign',
    (select jsonb_agg(id order by id) from unnest(p_item_ids) id), p_mode, p_value, p_rounding, p_name));
  replay := laria_private.inventory_receipt(owner_store_id, request_key, 'campaign', fingerprint);
  if replay is not null then return replay; end if;
  perform laria_private.inventory_owned_ids(owner_store_id, p_item_ids);
  perform laria_private.lock_inventory_items(p_item_ids);

  for target in
    select i.id, i.merchant_sku, i.unit_price_pen as before_price,
           laria_private.inventory_campaign_price(i.unit_price_pen, p_mode, p_value, p_rounding) as after_price
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
    perform laria_private.apply_inventory_price(target.id, target.after_price::integer, caller, 'owner', campaign_name);
    changes := changes || jsonb_build_array(jsonb_build_object('id', target.id, 'before', target.before_price, 'after', target.after_price));
  end loop;

  insert into public.store_price_campaigns(store_id, name, mode, value, rounding, item_count, changes, batch_key, created_by)
  values (owner_store_id, campaign_name, p_mode, p_value, p_rounding, cardinality(p_item_ids), changes, request_key, caller)
  returning * into campaign;
  return laria_private.inventory_receipt_save(owner_store_id, request_key, 'campaign', fingerprint,
    jsonb_build_object('campaign_id', campaign.id, 'name', campaign.name, 'changes', changes));
end;
$$;

-- "Volver a precios anteriores": every SKU whose price is still the one the campaign set goes back to its earlier
-- price; SKUs changed since are left alone and listed. One revert per campaign; a repeat returns the first result.
create or replace function public.revert_inventory_price_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner_store_id uuid := laria_private.inventory_caller_store(true);
  campaign public.store_price_campaigns;
  item_ids uuid[];
  change jsonb;
  item public.store_inventory_items;
  restored jsonb := '[]'::jsonb;
  kept jsonb := '[]'::jsonb;
  result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(owner_store_id::text || ':campaign:' || coalesce(p_campaign_id::text, ''), 23));
  select * into campaign from public.store_price_campaigns where id = p_campaign_id and store_id = owner_store_id;
  if not found then
    perform laria_private.raise_inventory_error('INVENTORY_CAMPAIGN_NOT_FOUND', 'No encontramos ese cambio de precio.');
  end if;
  if campaign.reverted_at is not null then
    return campaign.revert_result || jsonb_build_object('replayed', true);
  end if;

  select array_agg((value->>'id')::uuid) into item_ids from jsonb_array_elements(campaign.changes)
  where exists (select 1 from public.store_inventory_items i where i.id = (value->>'id')::uuid);
  if item_ids is not null then perform laria_private.lock_inventory_items(item_ids); end if;

  for change in select value from jsonb_array_elements(campaign.changes) order by value->>'id' loop
    select * into item from public.store_inventory_items where id = (change->>'id')::uuid;
    if not found then continue; end if;
    if item.unit_price_pen is distinct from (change->>'after')::integer or (change->>'before') is null then
      kept := kept || jsonb_build_array(jsonb_build_object('id', item.id, 'merchant_sku', item.merchant_sku));
      continue;
    end if;
    perform laria_private.apply_inventory_price(item.id, (change->>'before')::integer, caller, 'owner',
      'Vuelta a precios anteriores: ' || campaign.name);
    restored := restored || jsonb_build_array(jsonb_build_object('id', item.id, 'price', (change->>'before')::integer));
  end loop;

  result := jsonb_build_object('restored', restored, 'kept', kept);
  update public.store_price_campaigns
  set reverted_at = now(), reverted_by = caller, revert_result = result
  where id = campaign.id;
  return result || jsonb_build_object('replayed', false);
end;
$$;

-- ------------------------------------------------------------------ stock-20: a SKU's category

-- The SKU's own category (until now set only by imports). A linked publication keeps its own category; Inventario
-- shows the publication's first, as before.
create or replace function laria_private.apply_inventory_category(p_item public.store_inventory_items, p_category text, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_item.category is not distinct from p_category then return false; end if;
  perform laria_private.record_inventory_change(p_item, 'details', jsonb_build_object('category', p_item.category),
    jsonb_build_object('category', p_category), auth.uid(), 'owner', p_reason);
  update public.store_inventory_items set category = p_category, version = version + 1 where id = p_item.id;
  return true;
end;
$$;

create or replace function laria_private.inventory_valid_category(p_category text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare category text := nullif(btrim(coalesce(p_category, '')), '');
begin
  if category is not null and not public.listing_taxonomy_is_valid(category, 'other') then
    perform laria_private.raise_inventory_error('INVENTORY_CATEGORY_INVALID', 'Elige una categoría de Laria.');
  end if;
  return category;
end;
$$;

create or replace function public.set_inventory_item_category(p_item_id uuid, p_category text, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_item_store_for_write(p_item_id);
  category text := laria_private.inventory_valid_category(p_category);
  item public.store_inventory_items;
begin
  if p_expected_version is null then
    perform laria_private.raise_inventory_error('INVENTORY_VERSION_REQUIRED', 'Vuelve a cargar el SKU antes de editarlo.');
  end if;
  item := laria_private.lock_inventory_item(p_item_id);
  if item.version <> p_expected_version then
    perform laria_private.raise_inventory_error('INVENTORY_VERSION_CONFLICT',
      'El SKU cambió mientras lo editabas. Vuelve a cargar los datos.', jsonb_build_object('current_version', item.version));
  end if;
  if item.inventory_status = 'archived' then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_ARCHIVED', 'Reactiva el SKU antes de cambiarlo.');
  end if;
  perform laria_private.apply_inventory_category(item, category, null);
  select * into item from public.store_inventory_items where id = p_item_id;
  return jsonb_build_object('item', laria_private.inventory_item_json(item));
end;
$$;

-- ------------------------------------------------------------------ stock-14: more bulk actions

-- p_action: 'category' (p_value: a category, or null to clear), 'archive', 'unarchive' or 'restore' (show again
-- publications the store itself hid). All or nothing for the changes it makes; SKUs where the action does not apply
-- (already archived, a publication still public, nothing hidden by the store) are skipped and listed, never an error.
create or replace function public.apply_inventory_bulk_action(p_item_ids uuid[], p_action text, p_value text, p_reason text, p_batch_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner_store_id uuid := laria_private.inventory_caller_store(true);
  request_key text := laria_private.inventory_request_key(p_batch_key, 160);
  reason text := laria_private.inventory_short_text(p_reason, 280, 'reason');
  category text;
  fingerprint text;
  replay jsonb;
  item public.store_inventory_items;
  listing_record public.listings;
  changed jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
begin
  if p_action is null or p_action not in ('category', 'archive', 'unarchive', 'restore') then
    perform laria_private.raise_inventory_error('INVENTORY_BULK_INVALID', 'Acción no compatible.');
  end if;
  if p_action = 'category' then category := laria_private.inventory_valid_category(p_value); end if;
  perform laria_private.inventory_owned_ids(owner_store_id, p_item_ids);
  fingerprint := laria_private.inventory_fingerprint(jsonb_build_array('apply_inventory_bulk_action',
    (select jsonb_agg(id order by id) from unnest(p_item_ids) id), p_action, category, reason));
  replay := laria_private.inventory_receipt(owner_store_id, request_key, 'bulk_' || p_action, fingerprint);
  if replay is not null then return replay; end if;
  perform laria_private.lock_inventory_items(p_item_ids);

  for item in select * from public.store_inventory_items where id = any(p_item_ids) order by id loop
    select * into listing_record from public.listings where id = item.listing_id;
    if p_action = 'category' then
      if item.inventory_status = 'archived' then
        skipped := skipped || jsonb_build_array(jsonb_build_object('id', item.id, 'merchant_sku', item.merchant_sku, 'reason', 'archived'));
      elsif laria_private.apply_inventory_category(item, category, 'Cambio de categoría masivo') then
        changed := changed || jsonb_build_array(jsonb_build_object('id', item.id, 'before', item.category, 'after', category));
      end if;
    elsif p_action = 'archive' then
      if item.inventory_status = 'archived' then
        continue;
      elsif listing_record.status in ('pending', 'approved') then
        skipped := skipped || jsonb_build_array(jsonb_build_object('id', item.id, 'merchant_sku', item.merchant_sku, 'reason', 'listing_public'));
      else
        perform laria_private.record_inventory_change(item, 'archive', jsonb_build_object('inventory_status', 'active'),
          jsonb_build_object('inventory_status', 'archived'), caller, 'owner', coalesce(reason, 'Archivado masivo'));
        update public.store_inventory_items set inventory_status = 'archived', version = version + 1 where id = item.id;
        changed := changed || jsonb_build_array(jsonb_build_object('id', item.id));
      end if;
    elsif p_action = 'unarchive' then
      if item.inventory_status = 'active' then continue; end if;
      perform laria_private.record_inventory_change(item, 'unarchive', jsonb_build_object('inventory_status', 'archived'),
        jsonb_build_object('inventory_status', 'active'), caller, 'owner', coalesce(reason, 'Reactivación masiva'));
      update public.store_inventory_items set inventory_status = 'active', version = version + 1 where id = item.id;
      changed := changed || jsonb_build_array(jsonb_build_object('id', item.id));
    else
      if listing_record.id is null or listing_record.status <> 'hidden' or listing_record.hidden_source is distinct from 'owner' then
        skipped := skipped || jsonb_build_array(jsonb_build_object('id', item.id, 'merchant_sku', item.merchant_sku,
          'reason', case when listing_record.id is null then 'not_linked' else 'not_hidden_by_store' end));
        continue;
      end if;
      begin
        perform public.set_owned_listing_lifecycle(listing_record.id, 'restore');
        changed := changed || jsonb_build_array(jsonb_build_object('id', item.id, 'listing_id', listing_record.id));
      exception
        -- A concurrent change fails the whole batch, so the owner retries it rather than reading "requirements".
        when serialization_failure or deadlock_detected or lock_not_available then raise;
        when others then
        -- The listing no longer meets the publication requirements or the store is not public: leave it hidden.
        skipped := skipped || jsonb_build_array(jsonb_build_object('id', item.id, 'merchant_sku', item.merchant_sku, 'reason', 'requirements'));
      end;
    end if;
  end loop;

  return laria_private.inventory_receipt_save(owner_store_id, request_key, 'bulk_' || p_action, fingerprint,
    jsonb_build_object('batch_key', request_key, 'action', p_action, 'changed', changed, 'skipped', skipped));
end;
$$;

-- "Deshacer" for a bulk threshold, category, archive or reactivation (stock-03): puts back the earlier value on every
-- SKU that still has the value the batch set. Stock batches use undo_stock_movements and prices their campaign.
create or replace function public.undo_inventory_batch(p_batch_key text, p_undo_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner_store_id uuid := laria_private.inventory_caller_store(true);
  target_key text := laria_private.inventory_request_key(p_batch_key, 160);
  undo_key text := laria_private.inventory_request_key(p_undo_key, 160);
  receipt laria_private.store_inventory_batch_receipts;
  fingerprint text;
  replay jsonb;
  entries jsonb;
  entry jsonb;
  item_ids uuid[];
  item public.store_inventory_items;
  restored integer := 0;
  kept integer := 0;
begin
  fingerprint := laria_private.inventory_fingerprint(jsonb_build_array('undo_inventory_batch', target_key));
  replay := laria_private.inventory_receipt(owner_store_id, undo_key, 'undo_batch', fingerprint);
  if replay is not null then return replay; end if;
  select * into receipt from laria_private.store_inventory_batch_receipts r
  where r.store_id = owner_store_id and r.batch_key = target_key;
  if not found or receipt.operation not in ('threshold', 'bulk_category', 'bulk_archive', 'bulk_unarchive') then
    perform laria_private.raise_inventory_error('STOCK_UNDO_NOT_ALLOWED', 'Este cambio no se puede deshacer.');
  end if;
  if receipt.created_at < now() - laria_private.inventory_undo_window() then
    perform laria_private.raise_inventory_error('STOCK_UNDO_EXPIRED', 'Ya pasó el tiempo para deshacer este cambio.');
  end if;
  if exists (select 1 from laria_private.store_inventory_batch_receipts r
             where r.store_id = owner_store_id and r.operation = 'undo_batch' and r.result->>'undone' = target_key) then
    perform laria_private.raise_inventory_error('STOCK_UNDO_DONE', 'Este cambio ya se deshizo.');
  end if;
  entries := case when receipt.operation = 'threshold' then receipt.result->'changes' else receipt.result->'changed' end;
  select array_agg((value->>'id')::uuid) into item_ids from jsonb_array_elements(entries);
  if item_ids is not null then perform laria_private.lock_inventory_items(item_ids); end if;

  for entry in select value from jsonb_array_elements(entries) loop
    select * into item from public.store_inventory_items where id = (entry->>'id')::uuid and store_id = owner_store_id;
    continue when not found;
    if receipt.operation = 'threshold' then
      if item.low_stock_threshold is distinct from (entry->>'after')::integer then kept := kept + 1; continue; end if;
      perform laria_private.record_inventory_change(item, 'details', jsonb_build_object('low_stock_threshold', item.low_stock_threshold),
        jsonb_build_object('low_stock_threshold', (entry->>'before')::integer), caller, 'owner', 'Deshecho por la tienda');
      update public.store_inventory_items set low_stock_threshold = (entry->>'before')::integer, version = version + 1 where id = item.id;
    elsif receipt.operation = 'bulk_category' then
      if item.category is distinct from entry->>'after' then kept := kept + 1; continue; end if;
      perform laria_private.apply_inventory_category(item, entry->>'before', 'Deshecho por la tienda');
    elsif receipt.operation = 'bulk_archive' then
      if item.inventory_status <> 'archived' then kept := kept + 1; continue; end if;
      perform laria_private.record_inventory_change(item, 'unarchive', jsonb_build_object('inventory_status', 'archived'),
        jsonb_build_object('inventory_status', 'active'), caller, 'owner', 'Deshecho por la tienda');
      update public.store_inventory_items set inventory_status = 'active', version = version + 1 where id = item.id;
    else
      if item.inventory_status <> 'active' or exists (select 1 from public.listings l where l.id = item.listing_id and l.status in ('pending', 'approved')) then
        kept := kept + 1; continue;
      end if;
      perform laria_private.record_inventory_change(item, 'archive', jsonb_build_object('inventory_status', 'active'),
        jsonb_build_object('inventory_status', 'archived'), caller, 'owner', 'Deshecho por la tienda');
      update public.store_inventory_items set inventory_status = 'archived', version = version + 1 where id = item.id;
    end if;
    restored := restored + 1;
  end loop;

  return laria_private.inventory_receipt_save(owner_store_id, undo_key, 'undo_batch', fingerprint,
    jsonb_build_object('undone', target_key, 'restored', restored, 'kept', kept));
end;
$$;

-- ------------------------------------------------------------------ privileges

revoke all on function laria_private.inventory_receipt(uuid, text, text, text) from public, anon, authenticated;
revoke all on function laria_private.inventory_receipt_save(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function laria_private.inventory_bulk_limit() from public, anon, authenticated;
revoke all on function laria_private.inventory_owned_ids(uuid, uuid[]) from public, anon, authenticated;
revoke all on function laria_private.inventory_undo_window() from public, anon, authenticated;
revoke all on function laria_private.apply_stock_correction(public.store_stock_movements, text, text, text) from public, anon, authenticated;
revoke all on function laria_private.store_net_sales(uuid, timestamptz) from public, anon, authenticated;
revoke all on function laria_private.inventory_item_default_threshold() from public, anon, authenticated;
revoke all on function laria_private.send_inventory_daily_summaries(date) from public, anon, authenticated;
revoke all on function laria_private.inventory_round_price(bigint, text) from public, anon, authenticated;
revoke all on function laria_private.inventory_campaign_price(integer, text, integer, text) from public, anon, authenticated;
revoke all on function laria_private.apply_inventory_category(public.store_inventory_items, text, text) from public, anon, authenticated;
revoke all on function laria_private.inventory_valid_category(text) from public, anon, authenticated;

revoke all on function public.undo_stock_movements(uuid[], text) from public, anon, authenticated;
revoke all on function public.set_inventory_preferences(jsonb, boolean) from public, anon, authenticated;
revoke all on function public.preview_inventory_price_campaign(uuid[], text, integer, text) from public, anon, authenticated;
revoke all on function public.apply_inventory_price_campaign(uuid[], text, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.revert_inventory_price_campaign(uuid) from public, anon, authenticated;
revoke all on function public.set_inventory_item_category(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.apply_inventory_bulk_action(uuid[], text, text, text, text) from public, anon, authenticated;
revoke all on function public.undo_inventory_batch(text, text) from public, anon, authenticated;
grant execute on function public.undo_stock_movements(uuid[], text) to authenticated;
grant execute on function public.set_inventory_preferences(jsonb, boolean) to authenticated;
grant execute on function public.preview_inventory_price_campaign(uuid[], text, integer, text) to authenticated;
grant execute on function public.apply_inventory_price_campaign(uuid[], text, integer, text, text, text) to authenticated;
grant execute on function public.revert_inventory_price_campaign(uuid) to authenticated;
grant execute on function public.set_inventory_item_category(uuid, text, integer) to authenticated;
grant execute on function public.apply_inventory_bulk_action(uuid[], text, text, text, text) to authenticated;
grant execute on function public.undo_inventory_batch(text, text) to authenticated;
