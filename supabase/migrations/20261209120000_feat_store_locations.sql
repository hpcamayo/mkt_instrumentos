-- Feature ideas, batch store-locations (docs/feature-ideas/store-locations.md), run-02 "Sedes".
--
-- A store with several shops keeps its stock per location. Purely additive and opt-in: a store without locations
-- works exactly as before, and nothing below redefines an existing function.
--
-- How stock per location stays honest without touching the existing stock functions:
--   * store_inventory_items.quantity_on_hand stays the store's total. Every existing path (Inventario, Mostrador,
--     imports, purchase requests, undo, Admin) keeps writing the total exactly as before.
--   * store_location_stock splits that total across the store's active locations. A store with no active location
--     has no rows.
--   * Every stock movement is still inserted by laria_private.apply_stock_movement or apply_stock_correction. A BEFORE
--     INSERT trigger on store_stock_movements gives the movement's delta to a location: the one the caller chose
--     (the new location-aware functions set it for their own transaction in the setting `laria.stock_location`),
--     else the reverse of the movement being undone, else, for an increase, the main location and, for a decrease,
--     the main location first and then the others in their order. The movement records where it went
--     (location_id when one location, location_split always).
--   * A deferred constraint trigger checks at commit that the split adds up to the total, for every item touched.
--   * Transfers between locations do not change the total, so they are not stock movements: they have their own
--     append-only ledger, store_stock_transfers.
--   * Lock order is unchanged (idempotency key, then listing, then item). Location rows belong to one item and are
--     only written while that item is locked.

-- ------------------------------------------------------------------ locations

create table public.store_locations (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 2 and 60),
  region           text not null check (char_length(btrim(region)) between 2 and 60),
  city             text not null check (char_length(btrim(city)) between 2 and 60),
  district         text check (district is null or char_length(btrim(district)) between 2 and 60),
  address          text check (address is null or char_length(btrim(address)) between 5 and 160),
  -- The same consent as the store's own address (list-12): the street address is public only while the store says so.
  show_address     boolean not null default false,
  public_address   text generated always as (case when show_address then nullif(btrim(address), '') end) stored,
  opening_hours    text check (opening_hours is null or char_length(btrim(opening_hours)) between 1 and 300),
  pickup_enabled   boolean not null default true,
  is_primary       boolean not null default false,
  position         integer not null default 0 check (position between 0 and 1000),
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Lets stock and transfers say "this location belongs to the same store" as a database fact.
  constraint store_locations_id_store unique (id, store_id),
  constraint store_locations_archived_not_primary check (archived_at is null or not is_primary)
);

create unique index store_locations_primary_idx on public.store_locations(store_id)
  where is_primary and archived_at is null;
create unique index store_locations_name_idx on public.store_locations(store_id, lower(btrim(name)))
  where archived_at is null;
create index store_locations_store_idx on public.store_locations(store_id, position, created_at)
  where archived_at is null;

create trigger store_locations_set_updated_at
before update on public.store_locations
for each row execute function public.set_updated_at();

comment on table public.store_locations is
  'run-02: a store''s locations (sedes). Optional; a store without active locations keeps one stock total per SKU.';

-- ------------------------------------------------------------------ stock per location

create table public.store_location_stock (
  location_id      uuid not null,
  item_id          uuid not null references public.store_inventory_items(id) on delete cascade,
  store_id         uuid not null,
  quantity_on_hand integer not null default 0 check (quantity_on_hand between 0 and 1000000),
  updated_at       timestamptz not null default now(),
  primary key (location_id, item_id),
  constraint store_location_stock_location foreign key (location_id, store_id)
    references public.store_locations(id, store_id) on delete restrict
);

create index store_location_stock_item_idx on public.store_location_stock(item_id);
create index store_location_stock_store_idx on public.store_location_stock(store_id, location_id);

-- ------------------------------------------------------------------ movements and transfers

alter table public.store_stock_movements
  add column location_id uuid references public.store_locations(id) on delete restrict,
  add column location_split jsonb check (location_split is null or jsonb_typeof(location_split) = 'object');

comment on column public.store_stock_movements.location_id is
  'run-02: the location the movement changed, when it changed exactly one. Null for stores without locations.';
comment on column public.store_stock_movements.location_split is
  'run-02: {location_id: delta} for every location the movement changed; the deltas add up to on_hand_delta.';

create index store_stock_movements_location_idx on public.store_stock_movements(location_id, created_at desc)
  where location_id is not null;

create table public.store_stock_transfers (
  id                   uuid primary key default gen_random_uuid(),
  store_id             uuid not null references public.stores(id) on delete restrict,
  item_id              uuid not null references public.store_inventory_items(id) on delete restrict,
  from_location_id     uuid not null references public.store_locations(id) on delete restrict,
  to_location_id       uuid not null references public.store_locations(id) on delete restrict,
  quantity             integer not null check (quantity between 1 and 1000000),
  reason               text check (reason is null or char_length(reason) <= 280),
  actor_user_id        uuid,
  actor_kind           text not null check (actor_kind in ('owner', 'admin', 'system')),
  idempotency_key      text not null check (char_length(idempotency_key) between 8 and 200),
  request_fingerprint  text not null,
  created_at           timestamptz not null default now(),
  constraint store_stock_transfers_distinct check (from_location_id <> to_location_id)
);

create unique index store_stock_transfers_idem_idx on public.store_stock_transfers(store_id, idempotency_key);
create index store_stock_transfers_item_idx on public.store_stock_transfers(item_id, created_at desc);

create trigger store_stock_transfers_append_only
before update or delete on public.store_stock_transfers
for each row execute function laria_private.reject_inventory_ledger_change();
create trigger store_stock_transfers_no_truncate
before truncate on public.store_stock_transfers
for each statement execute function laria_private.reject_inventory_ledger_change();

-- A Mostrador batch key belongs to one location, so a retried sale can never land in another one.
create table laria_private.store_location_batch_keys (
  store_id     uuid not null references public.stores(id) on delete cascade,
  batch_key    text not null,
  location_id  uuid not null,
  created_at   timestamptz not null default now(),
  primary key (store_id, batch_key)
);

-- ------------------------------------------------------------------ RLS and grants

alter table public.store_locations enable row level security;
alter table public.store_location_stock enable row level security;
alter table public.store_stock_transfers enable row level security;
alter table laria_private.store_location_batch_keys enable row level security;

revoke all on public.store_locations, public.store_location_stock, public.store_stock_transfers
  from public, anon, authenticated;
revoke all on laria_private.store_location_batch_keys from public, anon, authenticated;
grant select on public.store_locations, public.store_location_stock, public.store_stock_transfers to authenticated;

create policy "Store owners can read own locations" on public.store_locations
  for select to authenticated using (public.is_store_owner(store_id));
create policy "Admins can read locations" on public.store_locations
  for select to authenticated using (public.is_admin());
create policy "Store owners can read own location stock" on public.store_location_stock
  for select to authenticated using (public.is_store_owner(store_id));
create policy "Admins can read location stock" on public.store_location_stock
  for select to authenticated using (public.is_admin());
create policy "Store owners can read own stock transfers" on public.store_stock_transfers
  for select to authenticated using (public.is_store_owner(store_id));
create policy "Admins can read stock transfers" on public.store_stock_transfers
  for select to authenticated using (public.is_admin());

-- ------------------------------------------------------------------ helpers

-- The store's active locations in the order stock is taken from them: the main one first, then by position.
create or replace function laria_private.store_has_locations(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.store_locations where store_id = p_store_id and archived_at is null);
$$;

create or replace function laria_private.active_store_location(p_store_id uuid, p_location_id uuid)
returns public.store_locations
language plpgsql
stable
security definer
set search_path = public
as $$
declare location public.store_locations;
begin
  select * into location from public.store_locations
  where id = p_location_id and store_id = p_store_id and archived_at is null;
  if not found then
    perform laria_private.raise_inventory_error('STORE_LOCATION_NOT_FOUND', 'Esa sede no existe o está archivada.');
  end if;
  return location;
end;
$$;

-- Adds a (possibly negative) delta to one location's stock of one item. The caller holds the item lock.
create or replace function laria_private.add_location_stock(p_store_id uuid, p_location_id uuid, p_item_id uuid, p_delta integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare quantity integer;
begin
  if p_delta < 0 then
    update public.store_location_stock
    set quantity_on_hand = quantity_on_hand + p_delta, updated_at = now()
    where location_id = p_location_id and item_id = p_item_id
    returning quantity_on_hand into quantity;
    if not found then
      perform laria_private.raise_inventory_error('STORE_LOCATION_STOCK_SHORT', 'Esa sede no tiene unidades suficientes.');
    end if;
    return quantity;
  end if;
  insert into public.store_location_stock as stock (location_id, item_id, store_id, quantity_on_hand)
  values (p_location_id, p_item_id, p_store_id, p_delta)
  on conflict (location_id, item_id) do update
    set quantity_on_hand = stock.quantity_on_hand + p_delta, updated_at = now()
  returning stock.quantity_on_hand into quantity;
  return quantity;
exception when check_violation then
  perform laria_private.raise_inventory_error('STORE_LOCATION_STOCK_SHORT', 'Esa sede no tiene unidades suficientes.');
  return null;
end;
$$;

-- ------------------------------------------------------------------ allocation trigger

create or replace function laria_private.allocate_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta integer := new.on_hand_delta;
  chosen text := nullif(current_setting('laria.stock_location', true), '');
  target uuid;
  original public.store_stock_movements;
  split jsonb := '{}'::jsonb;
  entry record;
  remaining integer;
  available integer;
  take integer;
  reversible boolean;
begin
  if not laria_private.store_has_locations(new.store_id) then
    new.location_id := null;
    new.location_split := null;
    return new;
  end if;

  target := coalesce(new.location_id, chosen::uuid);
  if target is not null then
    perform laria_private.active_store_location(new.store_id, target);
  end if;

  if delta = 0 then
    new.location_id := coalesce(target, (select id from public.store_locations
      where store_id = new.store_id and is_primary and archived_at is null));
    new.location_split := '{}'::jsonb;
    return new;
  end if;

  -- An undo puts the units back where the movement it cancels took them from, when that is still possible.
  if target is null and new.corrects_movement_id is not null then
    select * into original from public.store_stock_movements where id = new.corrects_movement_id;
    if found and original.location_split is not null and original.location_split <> '{}'::jsonb
       and original.on_hand_delta = -delta then
      reversible := true;
      for entry in select key::uuid as location_id, value::integer as moved from jsonb_each_text(original.location_split) loop
        if not exists (select 1 from public.store_locations l
                       where l.id = entry.location_id and l.store_id = new.store_id and l.archived_at is null) then
          reversible := false;
        elsif entry.moved > 0 and coalesce((select s.quantity_on_hand from public.store_location_stock s
              where s.location_id = entry.location_id and s.item_id = new.item_id), 0) < entry.moved then
          reversible := false;
        end if;
      end loop;
      if reversible then
        for entry in select key::uuid as location_id, value::integer as moved from jsonb_each_text(original.location_split) loop
          perform laria_private.add_location_stock(new.store_id, entry.location_id, new.item_id, -entry.moved);
          split := split || jsonb_build_object(entry.location_id::text, -entry.moved);
        end loop;
        new.location_split := split;
        new.location_id := original.location_id;
        return new;
      end if;
    end if;
  end if;

  if delta > 0 then
    target := coalesce(target, (select id from public.store_locations
      where store_id = new.store_id and is_primary and archived_at is null));
    perform laria_private.add_location_stock(new.store_id, target, new.item_id, delta);
    new.location_id := target;
    new.location_split := jsonb_build_object(target::text, delta);
    return new;
  end if;

  if target is not null then
    select s.quantity_on_hand into available from public.store_location_stock s
    where s.location_id = target and s.item_id = new.item_id;
    if coalesce(available, 0) < -delta then
      perform laria_private.raise_inventory_error('STORE_LOCATION_STOCK_SHORT',
        format('En %s %s.', (select name from public.store_locations where id = target),
          case coalesce(available, 0) when 0 then 'no hay unidades de este SKU'
            when 1 then 'solo hay 1 unidad de este SKU' else 'solo hay ' || available || ' unidades de este SKU' end),
        jsonb_build_object('location_id', target, 'location_available', coalesce(available, 0)));
    end if;
    perform laria_private.add_location_stock(new.store_id, target, new.item_id, delta);
    new.location_id := target;
    new.location_split := jsonb_build_object(target::text, delta);
    return new;
  end if;

  remaining := -delta;
  for entry in
    select s.location_id, s.quantity_on_hand
    from public.store_location_stock s
    join public.store_locations l on l.id = s.location_id
    where s.item_id = new.item_id and s.quantity_on_hand > 0
    order by l.archived_at is not null, l.is_primary desc, l.position, l.created_at, l.id
  loop
    exit when remaining = 0;
    take := least(remaining, entry.quantity_on_hand);
    perform laria_private.add_location_stock(new.store_id, entry.location_id, new.item_id, -take);
    split := split || jsonb_build_object(entry.location_id::text, -take);
    remaining := remaining - take;
  end loop;
  if remaining > 0 then
    perform laria_private.raise_inventory_error('STORE_LOCATION_STOCK_MISMATCH',
      'El stock por sede no coincide con el total. Registra un conteo por sede.');
  end if;
  new.location_split := split;
  new.location_id := case when (select count(*) from jsonb_object_keys(split)) = 1
    then (select key::uuid from jsonb_object_keys(split) key) end;
  return new;
end;
$$;

create trigger store_stock_movements_allocate_location
before insert on public.store_stock_movements
for each row execute function laria_private.allocate_stock_movement();

-- ------------------------------------------------------------------ the invariant, checked at commit

create or replace function laria_private.check_location_stock_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  checked_item uuid;
  item public.store_inventory_items;
  split_total integer;
begin
  if tg_table_name = 'store_inventory_items' then
    checked_item := new.id;
  elsif tg_op = 'DELETE' then
    checked_item := old.item_id;
  else
    checked_item := new.item_id;
  end if;
  select * into item from public.store_inventory_items where id = checked_item;
  if not found then return null; end if;
  select coalesce(sum(quantity_on_hand), 0) into split_total from public.store_location_stock where item_id = checked_item;
  if laria_private.store_has_locations(item.store_id) then
    if split_total <> item.quantity_on_hand then
      perform laria_private.raise_inventory_error('STORE_LOCATION_STOCK_MISMATCH',
        'El stock por sede no coincide con el total. Registra un conteo por sede.',
        jsonb_build_object('item_id', checked_item, 'total', item.quantity_on_hand, 'by_location', split_total));
    end if;
  elsif split_total <> 0 then
    perform laria_private.raise_inventory_error('STORE_LOCATION_STOCK_MISMATCH',
      'Hay stock en sedes archivadas. Muévelo antes de archivar la última sede.');
  end if;
  return null;
end;
$$;

create constraint trigger store_inventory_items_location_total
after insert or update of quantity_on_hand on public.store_inventory_items
deferrable initially deferred
for each row execute function laria_private.check_location_stock_total();

create constraint trigger store_location_stock_total
after insert or update or delete on public.store_location_stock
deferrable initially deferred
for each row execute function laria_private.check_location_stock_total();

-- ------------------------------------------------------------------ owner: locations

create or replace function laria_private.store_location_json(p_location public.store_locations)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_location.id, 'name', p_location.name, 'region', p_location.region, 'city', p_location.city,
    'district', p_location.district, 'address', p_location.address, 'show_address', p_location.show_address,
    'opening_hours', p_location.opening_hours, 'pickup_enabled', p_location.pickup_enabled,
    'is_primary', p_location.is_primary, 'position', p_location.position, 'archived_at', p_location.archived_at,
    'units', (select coalesce(sum(quantity_on_hand), 0) from public.store_location_stock where location_id = p_location.id),
    'skus', (select count(*) from public.store_location_stock where location_id = p_location.id and quantity_on_hand > 0));
$$;

create or replace function public.get_store_locations()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare owner_store_id uuid := laria_private.inventory_caller_store(false);
begin
  return jsonb_build_object('locations', coalesce((
    select jsonb_agg(laria_private.store_location_json(l) order by l.is_primary desc, l.position, l.created_at)
    from public.store_locations l where l.store_id = owner_store_id and l.archived_at is null), '[]'::jsonb));
end;
$$;

-- Creates (p_location_id null) or updates a location. The first location becomes the main one and receives every
-- unit the store has, so turning locations on never changes a total.
create or replace function public.save_store_location(p_location_id uuid, p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_caller_store(true);
  location public.store_locations;
  first_location boolean;
  item_ids uuid[];
  v_name text;
  v_region text;
  v_city text;
  v_district text;
  v_address text;
  v_hours text;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_fields) key where key not in
      ('name', 'region', 'city', 'district', 'address', 'show_address', 'opening_hours', 'pickup_enabled', 'position')
  ) then
    perform laria_private.raise_inventory_error('STORE_LOCATION_INVALID', 'Revisa los datos de la sede.');
  end if;
  v_name := nullif(btrim(p_fields->>'name'), '');
  v_region := nullif(btrim(p_fields->>'region'), '');
  v_city := nullif(btrim(p_fields->>'city'), '');
  v_district := nullif(btrim(p_fields->>'district'), '');
  v_address := nullif(btrim(p_fields->>'address'), '');
  v_hours := nullif(btrim(p_fields->>'opening_hours'), '');
  if v_name is null or char_length(v_name) not between 2 and 60 then
    perform laria_private.raise_inventory_error('STORE_LOCATION_NAME', 'Ponle a la sede un nombre de 2 a 60 caracteres, por ejemplo "Miraflores".');
  end if;
  if v_region is null or v_city is null then
    perform laria_private.raise_inventory_error('STORE_LOCATION_PLACE', 'Indica la región y la ciudad de la sede.');
  end if;
  if coalesce((p_fields->>'show_address')::boolean, false) and v_address is null then
    perform laria_private.raise_inventory_error('STORE_LOCATION_ADDRESS', 'Escribe la dirección para mostrarla.');
  end if;

  -- Serialize location changes of one store (the first location's stock hand-over in particular).
  perform pg_advisory_xact_lock(hashtextextended(owner_store_id::text || ':store_locations', 23));

  begin
    if p_location_id is null then
      if (select count(*) from public.store_locations where store_id = owner_store_id and archived_at is null) >= 20 then
        perform laria_private.raise_inventory_error('STORE_LOCATION_LIMIT', 'Una tienda puede tener hasta 20 sedes.');
      end if;
      first_location := not laria_private.store_has_locations(owner_store_id);
      insert into public.store_locations (store_id, name, region, city, district, address, show_address, opening_hours,
        pickup_enabled, is_primary, position)
      values (owner_store_id, v_name, v_region, v_city, v_district, v_address,
        coalesce((p_fields->>'show_address')::boolean, false), v_hours,
        coalesce((p_fields->>'pickup_enabled')::boolean, true), first_location,
        coalesce((p_fields->>'position')::integer,
          (select coalesce(max(position), -1) + 1 from public.store_locations where store_id = owner_store_id and archived_at is null)))
      returning * into location;
      if first_location then
        select coalesce(array_agg(id), '{}') into item_ids from public.store_inventory_items
        where store_id = owner_store_id and quantity_on_hand > 0;
        perform laria_private.lock_inventory_items(item_ids);
        insert into public.store_location_stock (location_id, item_id, store_id, quantity_on_hand)
        select location.id, i.id, owner_store_id, i.quantity_on_hand
        from public.store_inventory_items i where i.id = any(item_ids);
      end if;
    else
      update public.store_locations set
        name = v_name, region = v_region, city = v_city, district = v_district, address = v_address,
        show_address = coalesce((p_fields->>'show_address')::boolean, show_address),
        opening_hours = v_hours,
        pickup_enabled = coalesce((p_fields->>'pickup_enabled')::boolean, pickup_enabled),
        position = coalesce((p_fields->>'position')::integer, position)
      where id = p_location_id and store_id = owner_store_id and archived_at is null
      returning * into location;
      if not found then
        perform laria_private.raise_inventory_error('STORE_LOCATION_NOT_FOUND', 'Esa sede no existe o está archivada.');
      end if;
    end if;
  exception
    when unique_violation then
      perform laria_private.raise_inventory_error('STORE_LOCATION_NAME_TAKEN', 'Ya tienes una sede con ese nombre.');
    when check_violation or invalid_text_representation then
      perform laria_private.raise_inventory_error('STORE_LOCATION_INVALID', 'Revisa los datos de la sede.');
  end;
  return jsonb_build_object('location', laria_private.store_location_json(location));
end;
$$;

create or replace function public.set_primary_store_location(p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare owner_store_id uuid := laria_private.inventory_caller_store(true);
begin
  perform pg_advisory_xact_lock(hashtextextended(owner_store_id::text || ':store_locations', 23));
  perform laria_private.active_store_location(owner_store_id, p_location_id);
  update public.store_locations set is_primary = false where store_id = owner_store_id and is_primary;
  update public.store_locations set is_primary = true where id = p_location_id;
  return public.get_store_locations();
end;
$$;

-- Moves one SKU's units between two locations of the caller's store.
create or replace function laria_private.apply_location_transfer(
  p_store_id uuid, p_item_id uuid, p_from uuid, p_to uuid, p_quantity integer, p_reason text,
  p_key text, p_fingerprint text, p_actor uuid, p_actor_kind text
)
returns public.store_stock_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  available integer;
  transfer public.store_stock_transfers;
begin
  if p_from = p_to then
    perform laria_private.raise_inventory_error('STORE_LOCATION_TRANSFER_SAME', 'Elige dos sedes distintas.');
  end if;
  select quantity_on_hand into available from public.store_location_stock where location_id = p_from and item_id = p_item_id;
  if p_quantity is null or p_quantity < 1 then
    perform laria_private.raise_inventory_error('STOCK_QUANTITY_INVALID', 'Ingresa cuántas unidades mueves.');
  end if;
  if coalesce(available, 0) < p_quantity then
    perform laria_private.raise_inventory_error('STORE_LOCATION_STOCK_SHORT',
      format('En %s hay %s %s.', (select name from public.store_locations where id = p_from), coalesce(available, 0),
        case coalesce(available, 0) when 1 then 'unidad' else 'unidades' end),
      jsonb_build_object('location_id', p_from, 'location_available', coalesce(available, 0)));
  end if;
  perform laria_private.add_location_stock(p_store_id, p_from, p_item_id, -p_quantity);
  perform laria_private.add_location_stock(p_store_id, p_to, p_item_id, p_quantity);
  insert into public.store_stock_transfers (store_id, item_id, from_location_id, to_location_id, quantity, reason,
    actor_user_id, actor_kind, idempotency_key, request_fingerprint)
  values (p_store_id, p_item_id, p_from, p_to, p_quantity, p_reason, p_actor, p_actor_kind, p_key, p_fingerprint)
  returning * into transfer;
  return transfer;
end;
$$;

-- Archives a location. Its units move to p_move_to (required while it has any). If it was the main location,
-- p_move_to becomes the main one. Archiving the last location turns locations off: the totals stay as they are.
create or replace function public.archive_store_location(p_location_id uuid, p_move_to uuid, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_caller_store(true);
  request_key text := laria_private.inventory_request_key(p_idempotency_key, 160);
  location public.store_locations;
  destination public.store_locations;
  remaining integer;
  item_ids uuid[];
  stock record;
  moved integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(owner_store_id::text || ':' || request_key, 23));
  perform pg_advisory_xact_lock(hashtextextended(owner_store_id::text || ':store_locations', 23));
  select * into location from public.store_locations where id = p_location_id and store_id = owner_store_id;
  if not found then
    perform laria_private.raise_inventory_error('STORE_LOCATION_NOT_FOUND', 'Esa sede no existe.');
  end if;
  if location.archived_at is not null then
    return jsonb_build_object('archived', location.id, 'moved_units', 0, 'replayed', true);
  end if;
  select count(*) into remaining from public.store_locations
  where store_id = owner_store_id and archived_at is null and id <> location.id;

  select coalesce(array_agg(item_id), '{}') into item_ids from public.store_location_stock
  where location_id = location.id and quantity_on_hand > 0;

  if remaining = 0 then
    -- Back to one total per SKU: the split rows go, the totals stay.
    select coalesce(array_agg(item_id), '{}') into item_ids from public.store_location_stock where store_id = owner_store_id;
    perform laria_private.lock_inventory_items(item_ids);
    update public.store_locations set is_primary = false, archived_at = now() where id = location.id;
    delete from public.store_location_stock where store_id = owner_store_id;
    return jsonb_build_object('archived', location.id, 'moved_units', 0, 'locations_off', true, 'replayed', false);
  end if;

  if p_move_to is null and (cardinality(item_ids) > 0 or location.is_primary) then
    perform laria_private.raise_inventory_error('STORE_LOCATION_MOVE_TO', 'Elige a qué sede pasan sus unidades.');
  end if;
  if p_move_to is not null then
    destination := laria_private.active_store_location(owner_store_id, p_move_to);
    if destination.id = location.id then
      perform laria_private.raise_inventory_error('STORE_LOCATION_TRANSFER_SAME', 'Elige otra sede.');
    end if;
  end if;

  perform laria_private.lock_inventory_items(item_ids);
  for stock in
    select item_id, quantity_on_hand from public.store_location_stock
    where location_id = location.id and quantity_on_hand > 0 order by item_id
  loop
    perform laria_private.apply_location_transfer(owner_store_id, stock.item_id, location.id, destination.id,
      stock.quantity_on_hand, 'Sede archivada', request_key || ':' || stock.item_id::text,
      laria_private.inventory_fingerprint(jsonb_build_array('archive_store_location', location.id, destination.id)),
      auth.uid(), 'owner');
    moved := moved + stock.quantity_on_hand;
  end loop;
  delete from public.store_location_stock where location_id = location.id;
  if location.is_primary then
    update public.store_locations set is_primary = false, archived_at = now() where id = location.id;
    update public.store_locations set is_primary = true where id = destination.id;
  else
    update public.store_locations set archived_at = now() where id = location.id;
  end if;
  return jsonb_build_object('archived', location.id, 'moved_units', moved, 'locations_off', false, 'replayed', false);
end;
$$;

-- ------------------------------------------------------------------ owner: stock per location

create or replace function public.transfer_location_stock(
  p_item_id uuid, p_from uuid, p_to uuid, p_quantity integer, p_reason text default null, p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_item_store_for_write(p_item_id);
  request_key text := laria_private.inventory_request_key(p_idempotency_key);
  reason text := laria_private.inventory_short_text(p_reason, 280, 'reason');
  fingerprint text := laria_private.inventory_fingerprint(jsonb_build_array('transfer_location_stock', p_item_id, p_from, p_to, p_quantity, reason));
  existing public.store_stock_transfers;
  transfer public.store_stock_transfers;
begin
  perform pg_advisory_xact_lock(hashtextextended(owner_store_id::text || ':' || request_key, 23));
  select * into existing from public.store_stock_transfers where store_id = owner_store_id and idempotency_key = request_key;
  if found then
    if existing.request_fingerprint <> fingerprint then
      perform laria_private.raise_inventory_error('IDEMPOTENCY_KEY_REUSED', 'Esta solicitud ya se usó con otros datos.');
    end if;
    return jsonb_build_object('transfer', to_jsonb(existing), 'replayed', true);
  end if;
  perform laria_private.active_store_location(owner_store_id, p_from);
  perform laria_private.active_store_location(owner_store_id, p_to);
  perform laria_private.lock_inventory_item(p_item_id);
  if (select inventory_status from public.store_inventory_items where id = p_item_id) = 'archived' then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_ARCHIVED', 'Reactiva el SKU antes de mover stock.');
  end if;
  if p_quantity is null or p_quantity not between 1 and 100000 then
    perform laria_private.raise_inventory_error('STOCK_QUANTITY_INVALID', 'Ingresa una cantidad entre 1 y 100000.');
  end if;
  transfer := laria_private.apply_location_transfer(owner_store_id, p_item_id, p_from, p_to, p_quantity, reason,
    request_key, fingerprint, auth.uid(), 'owner');
  return jsonb_build_object('transfer', to_jsonb(transfer), 'replayed', false);
end;
$$;

-- One stock movement at one location: the same arguments as record_stock_movement plus the location. A count
-- ("stock_count") is the units counted at that location; the store's total moves by the difference.
create or replace function public.record_location_stock_movement(
  p_location_id uuid,
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
  existing public.store_stock_movements;
  item public.store_inventory_items;
  at_location integer;
  quantity integer := p_quantity;
  result jsonb;
begin
  if p_type not in ('sale', 'return', 'restock', 'damage_or_loss', 'manual_adjustment', 'stock_count') then
    perform laria_private.raise_inventory_error('STOCK_MOVEMENT_TYPE_INVALID', 'Este tipo de movimiento no está disponible por sede.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_store_id::text || ':' || request_key, 23));
  select * into existing from public.store_stock_movements where store_id = owner_store_id and idempotency_key = request_key;
  if found then
    if existing.location_id is distinct from p_location_id then
      perform laria_private.raise_inventory_error('IDEMPOTENCY_KEY_REUSED', 'Esta solicitud ya se usó con otros datos.');
    end if;
    select * into item from public.store_inventory_items where id = existing.item_id;
    return jsonb_build_object('movement', laria_private.stock_movement_json(existing),
      'item', laria_private.inventory_item_json(item), 'replayed', true);
  end if;
  perform laria_private.active_store_location(owner_store_id, p_location_id);
  item := laria_private.lock_inventory_item(p_item_id);
  if p_type = 'stock_count' then
    if p_quantity is null or p_quantity not between 0 and 100000 then
      perform laria_private.raise_inventory_error('STOCK_QUANTITY_INVALID', 'Ingresa una cantidad entre 0 y 100000.');
    end if;
    select coalesce(sum(quantity_on_hand), 0) into at_location from public.store_location_stock
    where location_id = p_location_id and item_id = p_item_id;
    quantity := item.quantity_on_hand - at_location + p_quantity;
  end if;
  perform set_config('laria.stock_location', p_location_id::text, true);
  result := public.record_stock_movement(p_item_id, p_type, quantity, p_channel, p_reference, p_reason,
    p_expected_version, request_key);
  perform set_config('laria.stock_location', '', true);
  return result;
end;
$$;

-- Mostrador at one location: apply_bulk_stock_operations with every unit taken from (or put back in) that location.
create or replace function public.apply_location_bulk_stock_operations(p_location_id uuid, p_operations jsonb, p_batch_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_caller_store(true);
  request_batch_key text := laria_private.inventory_request_key(p_batch_key, 160);
  bound uuid;
  result jsonb;
begin
  if p_operations is null or jsonb_typeof(p_operations) <> 'array' or exists (
    select 1 from jsonb_array_elements(p_operations) element
    where jsonb_typeof(element) <> 'object'
      or coalesce(element->>'type', '') not in ('sale', 'return', 'restock', 'damage_or_loss', 'manual_adjustment')
  ) then
    perform laria_private.raise_inventory_error('INVENTORY_BULK_INVALID', 'Revisa las operaciones de stock.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_store_id::text || ':' || request_batch_key, 23));
  select location_id into bound from laria_private.store_location_batch_keys
  where store_id = owner_store_id and batch_key = request_batch_key;
  if found and bound <> p_location_id then
    perform laria_private.raise_inventory_error('IDEMPOTENCY_KEY_REUSED', 'Esta solicitud ya se usó con otros datos.');
  end if;
  if not found then
    perform laria_private.active_store_location(owner_store_id, p_location_id);
    insert into laria_private.store_location_batch_keys (store_id, batch_key, location_id)
    values (owner_store_id, request_batch_key, p_location_id);
  end if;
  perform set_config('laria.stock_location', p_location_id::text, true);
  result := public.apply_bulk_stock_operations(p_operations, request_batch_key);
  perform set_config('laria.stock_location', '', true);
  return result || jsonb_build_object('location_id', p_location_id);
end;
$$;

-- Counts at one location, up to 200 SKU at once ("Stock por sede" upload): [{item_id, quantity}]. All or nothing,
-- replayed by its key. SKU whose count matches are skipped.
create or replace function public.set_location_stock_counts(p_location_id uuid, p_counts jsonb, p_batch_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner_store_id uuid := laria_private.inventory_caller_store(true);
  request_batch_key text := laria_private.inventory_request_key(p_batch_key, 160);
  fingerprint text := laria_private.inventory_fingerprint(jsonb_build_array('set_location_stock_counts', p_location_id, p_counts));
  receipt laria_private.store_inventory_batch_receipts;
  item_ids uuid[];
  entry jsonb;
  entry_item uuid;
  counted integer;
  item public.store_inventory_items;
  at_location integer;
  changed integer := 0;
  unchanged integer := 0;
  result jsonb;
begin
  if p_counts is null or jsonb_typeof(p_counts) <> 'array' or jsonb_array_length(p_counts) not between 1 and 200 then
    perform laria_private.raise_inventory_error('INVENTORY_BULK_INVALID', 'Envía entre 1 y 200 SKU por vez.');
  end if;
  select array_agg(laria_private.inventory_json_uuid(element, 'item_id')) into item_ids from jsonb_array_elements(p_counts) element;
  if array_position(item_ids, null) is not null
    or (select count(distinct id) from unnest(item_ids) id) <> cardinality(item_ids) then
    perform laria_private.raise_inventory_error('INVENTORY_BULK_INVALID', 'Cada SKU puede aparecer una sola vez.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_store_id::text || ':' || request_batch_key, 23));
  select * into receipt from laria_private.store_inventory_batch_receipts r
  where r.store_id = owner_store_id and r.batch_key = request_batch_key;
  if found then
    if receipt.operation <> 'location_count' or receipt.request_fingerprint <> fingerprint then
      perform laria_private.raise_inventory_error('IDEMPOTENCY_KEY_REUSED', 'Esta solicitud ya se usó con otros datos.');
    end if;
    return receipt.result || jsonb_build_object('replayed', true);
  end if;
  perform laria_private.active_store_location(owner_store_id, p_location_id);
  if (select count(*) from public.store_inventory_items i where i.id = any(item_ids) and i.store_id = owner_store_id)
     <> cardinality(item_ids) then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_NOT_OWNED', 'No puedes administrar uno de estos SKU.');
  end if;
  perform laria_private.lock_inventory_items(item_ids);
  perform set_config('laria.stock_location', p_location_id::text, true);
  for entry in select element from jsonb_array_elements(p_counts) element order by laria_private.inventory_json_uuid(element, 'item_id') loop
    entry_item := laria_private.inventory_json_uuid(entry, 'item_id');
    counted := laria_private.inventory_json_int(entry, 'quantity');
    if counted is null or counted not between 0 and 100000 then
      perform laria_private.raise_inventory_error('STOCK_QUANTITY_INVALID', 'Cada conteo debe estar entre 0 y 100000.',
        jsonb_build_object('item_id', entry_item));
    end if;
    select * into item from public.store_inventory_items where id = entry_item;
    select coalesce(sum(quantity_on_hand), 0) into at_location from public.store_location_stock
    where location_id = p_location_id and item_id = entry_item;
    if at_location = counted then
      unchanged := unchanged + 1;
      continue;
    end if;
    perform laria_private.apply_stock_movement(entry_item, 'stock_count', item.quantity_on_hand - at_location + counted,
      'panel', 'Conteo por sede', null, null, request_batch_key || ':' || entry_item::text,
      laria_private.inventory_fingerprint(jsonb_build_array('set_location_stock_counts', request_batch_key, entry)),
      caller, 'owner');
    changed := changed + 1;
  end loop;
  perform set_config('laria.stock_location', '', true);
  result := jsonb_build_object('batch_key', request_batch_key, 'location_id', p_location_id,
    'changed', changed, 'unchanged', unchanged);
  insert into laria_private.store_inventory_batch_receipts(store_id, batch_key, operation, request_fingerprint, result, actor_user_id)
  values (owner_store_id, request_batch_key, 'location_count', fingerprint, result, caller);
  return result || jsonb_build_object('replayed', false);
end;
$$;

-- ------------------------------------------------------------------ public reads

-- A store's active locations for its public page: no stock, the street address only with the location's consent.
create or replace function public.get_public_store_locations(p_store_id uuid)
returns table (
  id uuid, name text, region text, city text, district text, public_address text, opening_hours text,
  pickup_enabled boolean, is_primary boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.name, l.region, l.city, l.district, l.public_address, l.opening_hours, l.pickup_enabled, l.is_primary
  from public.store_locations l
  join public.stores s on s.id = l.store_id
  where l.store_id = p_store_id and l.archived_at is null and s.status = 'active'
  order by l.is_primary desc, l.position, l.created_at;
$$;

-- "Disponible en Miraflores y en el Centro": the locations that have units of a public, stock-managed listing of a
-- store with two or more locations. Names only, never how many (D-14).
create or replace function public.get_listing_locations(p_listing_id uuid)
returns table (
  id uuid, name text, district text, city text, public_address text, opening_hours text, pickup_enabled boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.name, l.district, l.city, l.public_address, l.opening_hours, l.pickup_enabled
  from public.listings listing
  join public.stores s on s.id = listing.store_id and s.status = 'active'
  join public.store_inventory_items i on i.listing_id = listing.id and i.inventory_status = 'active'
  join public.store_location_stock stock on stock.item_id = i.id and stock.quantity_on_hand > 0
  join public.store_locations l on l.id = stock.location_id and l.archived_at is null
  where listing.id = p_listing_id and listing.status = 'approved'
    and (select count(*) from public.store_locations other where other.store_id = s.id and other.archived_at is null) >= 2
  order by l.is_primary desc, l.position, l.created_at;
$$;

-- ------------------------------------------------------------------ grants

revoke all on function public.get_store_locations() from public, anon, authenticated;
revoke all on function public.save_store_location(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.set_primary_store_location(uuid) from public, anon, authenticated;
revoke all on function public.archive_store_location(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.transfer_location_stock(uuid, uuid, uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.record_location_stock_movement(uuid, uuid, text, integer, text, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.apply_location_bulk_stock_operations(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.set_location_stock_counts(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.get_public_store_locations(uuid) from public;
revoke all on function public.get_listing_locations(uuid) from public;

grant execute on function public.get_store_locations() to authenticated;
grant execute on function public.save_store_location(uuid, jsonb) to authenticated;
grant execute on function public.set_primary_store_location(uuid) to authenticated;
grant execute on function public.archive_store_location(uuid, uuid, text) to authenticated;
grant execute on function public.transfer_location_stock(uuid, uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.record_location_stock_movement(uuid, uuid, text, integer, text, text, text, integer, text) to authenticated;
grant execute on function public.apply_location_bulk_stock_operations(uuid, jsonb, text) to authenticated;
grant execute on function public.set_location_stock_counts(uuid, jsonb, text) to authenticated;
grant execute on function public.get_public_store_locations(uuid) to anon, authenticated;
grant execute on function public.get_listing_locations(uuid) to anon, authenticated;

do $$
declare fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'laria_private' and p.proname in (
      'store_has_locations', 'active_store_location', 'add_location_stock', 'allocate_stock_movement',
      'check_location_stock_total', 'store_location_json', 'apply_location_transfer')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end;
$$;
