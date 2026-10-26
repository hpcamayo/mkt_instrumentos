-- Feature ideas, store-floor batch (docs/feature-ideas/store-floor.md): reach-08 "Por llegar".
--
-- A SKU with no units available can carry the date the store expects more ("Por llegar, fecha estimada 15/12"). Its
-- listing keeps showing, with the date, at its address, on the store page and in favorites; buyers tap "Avísame cuando
-- llegue" (the list-11 stock watch, unchanged) and the restock notifies them once.
--
-- The listing stays 'out_of_stock'. "Por llegar" is that state plus a date, so every rule already written for a
-- listing without units holds: no "Solicitar compra", no price-drop e-mails, search alerts wait for the first units,
-- noindex, and the marketplace search keeps showing only what can be bought today. Nothing shared is redefined.
--
--   store_inventory_items.expected_arrival_on  the owner's date (Inventario)
--   listings.restock_expected_on               its public copy, only while the listing is out of stock
--
-- Both clear themselves when units arrive (or the SKU is archived or unlinked), and a daily job clears dates that
-- passed (laria_private.expire_arrival_estimates, run by public.run_store_floor_daily).

alter table public.store_inventory_items add column expected_arrival_on date;
alter table public.listings add column restock_expected_on date;

comment on column public.store_inventory_items.expected_arrival_on is
  'reach-08: the date the store expects units of this SKU, set while it has none available. Cleared on arrival.';
comment on column public.listings.restock_expected_on is
  'reach-08: the linked SKU''s expected arrival date, shown as "Por llegar". Only while the listing is out_of_stock.';

alter table public.store_inventory_items
  add constraint store_inventory_items_arrival_when_out check (
    expected_arrival_on is null or (quantity_on_hand - quantity_reserved <= 0 and inventory_status = 'active')
  );
alter table public.listings
  add constraint listings_restock_expected_out_of_stock check (restock_expected_on is null or stock_state = 'out_of_stock');

-- Daily expiry reads the dates that passed.
create index store_inventory_items_arrival_idx on public.store_inventory_items (expected_arrival_on)
  where expected_arrival_on is not null;

-- "Por llegar" has its own change type in the SKU's history.
select laria_private.ux_extend_text_check(
  'public.store_inventory_changes', 'store_inventory_changes_change_type_check', 'change_type', array['arrival']
);

-- ------------------------------------------------------------------ keeping both dates honest

-- On the SKU: units available again, or an archived SKU, end the estimate.
create or replace function laria_private.clear_arrival_on_stock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.expected_arrival_on is not null
     and (new.quantity_on_hand - new.quantity_reserved > 0 or new.inventory_status <> 'active') then
    new.expected_arrival_on := null;
  end if;
  return new;
end;
$$;

revoke all on function laria_private.clear_arrival_on_stock() from public, anon, authenticated;

create trigger store_inventory_items_clear_arrival
before update on public.store_inventory_items
for each row execute function laria_private.clear_arrival_on_stock();

-- On the listing: whenever its stock state is written, the date follows the linked SKU while it is out of stock and
-- is cleared otherwise (back in stock, or unlinked). Runs inside the inventory functions, which hold the listing lock.
create or replace function laria_private.sync_restock_estimate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stock_state = 'out_of_stock' then
    select i.expected_arrival_on into new.restock_expected_on
    from public.store_inventory_items i
    where i.listing_id = new.id and i.inventory_status = 'active';
  else
    new.restock_expected_on := null;
  end if;
  return new;
end;
$$;

revoke all on function laria_private.sync_restock_estimate() from public, anon, authenticated;

create trigger listings_restock_estimate
before insert or update of stock_state on public.listings
for each row execute function laria_private.sync_restock_estimate();

-- The SKU's date changed, or it was linked to a listing: copy the date to the listing (the caller locked it first).
create or replace function laria_private.push_arrival_to_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.listing_id is not null then
    update public.listings set restock_expected_on = new.expected_arrival_on
    where id = new.listing_id and stock_state = 'out_of_stock'
      and restock_expected_on is distinct from new.expected_arrival_on;
  end if;
  return null;
end;
$$;

revoke all on function laria_private.push_arrival_to_listing() from public, anon, authenticated;

create trigger store_inventory_items_push_arrival
after update of expected_arrival_on, listing_id on public.store_inventory_items
for each row
when (new.listing_id is not null
      and (new.expected_arrival_on is distinct from old.expected_arrival_on or new.listing_id is distinct from old.listing_id))
execute function laria_private.push_arrival_to_listing();

-- ------------------------------------------------------------------ the owner's action

-- Today in Lima, the calendar every date here follows.
create or replace function laria_private.lima_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Lima')::date
$$;

revoke all on function laria_private.lima_today() from public, anon, authenticated;

-- "Por llegar" for one or several SKU (up to 200): p_expected_on between today and a year ahead, or null to remove the
-- date. SKUs with units available (or archived) are skipped and counted, so a mixed selection still works. Locks the
-- linked listings, then the SKUs, in id order (design §4.3).
create or replace function public.set_inventory_arrival(p_item_ids uuid[], p_expected_on date)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  owner_store_id uuid := laria_private.inventory_caller_store(true);
  ids uuid[];
  today date := laria_private.lima_today();
  item public.store_inventory_items;
  previous date;
  updated integer := 0;
  skipped integer := 0;
begin
  select coalesce(array_agg(distinct id), '{}') into ids from unnest(coalesce(p_item_ids, '{}')) id where id is not null;
  if cardinality(ids) = 0 or cardinality(ids) > 200 then
    perform laria_private.raise_inventory_error('INVENTORY_ARRIVAL_INVALID', 'Elige entre 1 y 200 SKU.');
  end if;
  if p_expected_on is not null and (p_expected_on < today or p_expected_on > today + 365) then
    perform laria_private.raise_inventory_error('INVENTORY_ARRIVAL_DATE_INVALID',
      'Elige una fecha desde hoy y hasta dentro de un año.');
  end if;
  if exists (select 1 from public.store_inventory_items where id = any(ids) and store_id <> owner_store_id)
     or (select count(*) from public.store_inventory_items where id = any(ids)) <> cardinality(ids) then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_NOT_OWNED', 'No puedes administrar este SKU.');
  end if;

  perform laria_private.lock_inventory_items(ids);

  for item in select * from public.store_inventory_items where id = any(ids) order by id loop
    if p_expected_on is not null and (item.quantity_available > 0 or item.inventory_status <> 'active') then
      skipped := skipped + 1;
      continue;
    end if;
    if item.expected_arrival_on is not distinct from p_expected_on then continue; end if;
    previous := item.expected_arrival_on;
    update public.store_inventory_items set expected_arrival_on = p_expected_on where id = item.id returning * into item;
    perform laria_private.record_inventory_change(item, 'arrival',
      jsonb_build_object('expected_arrival_on', previous), jsonb_build_object('expected_arrival_on', p_expected_on),
      auth.uid(), 'owner', null);
    updated := updated + 1;
  end loop;

  return jsonb_build_object('updated', updated, 'skipped', skipped, 'expected_arrival_on', p_expected_on);
end;
$$;

revoke all on function public.set_inventory_arrival(uuid[], date) from public, anon;
grant execute on function public.set_inventory_arrival(uuid[], date) to authenticated;

-- ------------------------------------------------------------------ daily expiry

-- Dates that passed are removed, store by store (listings then SKUs, in id order), and each store's owner gets one
-- in-app notice naming how many SKUs to update. Safe to run more than once a day: a second run finds nothing.
create or replace function laria_private.expire_arrival_estimates()
returns integer
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  today date := laria_private.lima_today();
  store_row record;
  item public.store_inventory_items;
  previous date;
  store_expired integer;
  expired integer := 0;
begin
  for store_row in
    select i.store_id, s.owner_user_id, array_agg(i.id order by i.id) as item_ids
    from public.store_inventory_items i
    join public.stores s on s.id = i.store_id
    where i.expected_arrival_on < today
    group by i.store_id, s.owner_user_id
  loop
    perform laria_private.lock_inventory_items(store_row.item_ids);
    store_expired := 0;
    -- Re-read under the locks: a restock may have cleared a date meanwhile.
    for item in
      select * from public.store_inventory_items
      where id = any(store_row.item_ids) and expected_arrival_on < today order by id
    loop
      previous := item.expected_arrival_on;
      update public.store_inventory_items set expected_arrival_on = null where id = item.id returning * into item;
      perform laria_private.record_inventory_change(item, 'arrival',
        jsonb_build_object('expected_arrival_on', previous), jsonb_build_object('expected_arrival_on', null),
        null, 'system', 'Pasó la fecha estimada');
      store_expired := store_expired + 1;
    end loop;
    if store_row.owner_user_id is not null and store_expired > 0 then
      insert into public.notifications (user_id, event_type, message, store_id)
      values (store_row.owner_user_id, 'store_arrival_estimate_passed',
        case when store_expired = 1
          then 'Pasó la fecha estimada de llegada de 1 SKU. Si aún no llega, pon una fecha nueva.'
          else 'Pasó la fecha estimada de llegada de ' || store_expired || ' SKU. Si aún no llegan, pon fechas nuevas.'
        end,
        store_row.store_id);
    end if;
    expired := expired + store_expired;
  end loop;
  return expired;
end;
$$;

revoke all on function laria_private.expire_arrival_estimates() from public, anon, authenticated;

select laria_private.ux_extend_text_check(
  'public.notifications', 'notifications_event_type_check', 'event_type', array['store_arrival_estimate_passed']
);
