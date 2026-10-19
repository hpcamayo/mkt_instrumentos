-- Effortless Laria, inventory batch (docs/ux-effortless/inventory.md): purchase requests the store can act on.
--   * stock-04 Solicitudes (/mi-cuenta/tienda/solicitudes): the "Solicitar compra" contacts of the store's publications,
--     with what to do next. A request is still only a WhatsApp contact the buyer opened (PAY-1): Laria never sees the
--     conversation, never takes a payment and never reserves stock. The store marks each request answered, sold or
--     not sold; "Vendido" records the sale in Inventario in the same step.
--   * stock-23 the buyer picks how many units to ask for: get_listing_purchase_request also says the most they can
--     ask for (what is available, up to 10). The quantity goes only into the WhatsApp message.
-- The contact event and its metadata ({"intent":"purchase"}) are unchanged.

create table public.store_purchase_request_marks (
  event_id          uuid primary key references public.marketplace_events(id) on delete cascade,
  store_id          uuid not null references public.stores(id) on delete cascade,
  status            text not null check (status in ('answered', 'sold', 'not_sold')),
  quantity          integer check (quantity is null or quantity between 1 and 1000),
  sale_movement_id  uuid references public.store_stock_movements(id) on delete restrict,
  marked_by         uuid,
  marked_at         timestamptz not null default now(),
  check ((status = 'sold') = (quantity is not null))
);
create index store_purchase_request_marks_store_idx on public.store_purchase_request_marks(store_id, marked_at desc);

alter table public.store_purchase_request_marks enable row level security;
revoke all on public.store_purchase_request_marks from public, anon, authenticated;
grant select on public.store_purchase_request_marks to authenticated;
create policy "Store owners can read own purchase request marks" on public.store_purchase_request_marks
  for select to authenticated using (public.is_store_owner(store_id));

-- How long a request stays in the list, and how long an unmarked one counts as waiting.
create or replace function laria_private.purchase_request_window()
returns interval language sql immutable as $$ select interval '60 days' $$;
create or replace function laria_private.purchase_request_waiting_window()
returns interval language sql immutable as $$ select interval '14 days' $$;

-- The caller's store when its payments pilot is on (the only way purchase requests exist), else an error.
create or replace function laria_private.purchase_request_store(p_for_write boolean)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare owner_store_id uuid;
begin
  select s.id into owner_store_id from public.stores s
  where auth.uid() is not null and s.owner_user_id = auth.uid() and public.is_store_owner(s.id);
  if owner_store_id is null then
    perform laria_private.raise_inventory_error('STORE_NOT_FOUND', 'Esta sección es para cuentas de tienda.');
  end if;
  if p_for_write and not exists (select 1 from public.stores s where s.id = owner_store_id and s.status in ('pending', 'active')) then
    perform laria_private.raise_inventory_error('STORE_NOT_WRITABLE', 'Tu tienda no puede registrar cambios ahora.');
  end if;
  return owner_store_id;
end;
$$;

create or replace function laria_private.purchase_request_rows(p_store_id uuid)
returns table(event_id uuid, created_at timestamptz, listing_id uuid, actor_user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.created_at, e.listing_id, e.actor_user_id
  from public.marketplace_events e
  where e.store_id = p_store_id
    and e.event_type = 'whatsapp_contact'
    and e.metadata = '{"intent":"purchase"}'::jsonb
    and e.created_at >= now() - laria_private.purchase_request_window();
$$;

-- The list, newest first. p_status: 'waiting' (unmarked, last 14 days), 'all'. A signed-in buyer's name is shown, as
-- it would be in the WhatsApp chat they opened; a visitor is only "sin cuenta".
create or replace function public.get_store_purchase_requests(p_status text default 'waiting', p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare owner_store_id uuid := laria_private.purchase_request_store(false);
begin
  if coalesce(p_status, '') not in ('waiting', 'all') then
    perform laria_private.raise_inventory_error('INVENTORY_FILTER_INVALID', 'Revisa los filtros.');
  end if;
  return jsonb_build_object(
    'waiting', (select count(*) from laria_private.purchase_request_rows(owner_store_id) r
                where r.created_at >= now() - laria_private.purchase_request_waiting_window()
                  and not exists (select 1 from public.store_purchase_request_marks m where m.event_id = r.event_id)),
    'requests', (
      select coalesce(jsonb_agg(row_value order by created_at desc, event_id desc), '[]'::jsonb)
      from (
        select r.created_at, r.event_id, jsonb_build_object(
            'id', r.event_id, 'created_at', r.created_at, 'signed_in', r.actor_user_id is not null, 'buyer_name', buyer.full_name,
            'listing_id', l.id, 'listing_title', l.title, 'listing_slug', l.slug, 'listing_price_pen', l.price_pen,
            'item', case when i.id is not null then jsonb_build_object(
              'id', i.id, 'merchant_sku', i.merchant_sku, 'quantity_available', i.quantity_available,
              'version', i.version, 'inventory_status', i.inventory_status) end,
            'status', coalesce(m.status, 'waiting'), 'quantity', m.quantity, 'marked_at', m.marked_at) as row_value
        from laria_private.purchase_request_rows(owner_store_id) r
        join public.listings l on l.id = r.listing_id
        left join public.store_inventory_items i on i.listing_id = l.id and i.store_id = owner_store_id
        left join public.store_purchase_request_marks m on m.event_id = r.event_id
        left join public.profiles buyer on buyer.id = r.actor_user_id
        where p_status = 'all'
           or (m.event_id is null and r.created_at >= now() - laria_private.purchase_request_waiting_window())
        order by r.created_at desc, r.event_id desc
        limit least(greatest(coalesce(p_limit, 50), 1), 200)
      ) latest));
end;
$$;

-- The number on the "Solicitudes" menu item: requests waiting for an answer. Zero for accounts without a store.
create or replace function public.get_store_purchase_request_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select count(*)::integer
    from public.stores s
    cross join lateral laria_private.purchase_request_rows(s.id) r
    where auth.uid() is not null and s.owner_user_id = auth.uid() and public.is_store_owner(s.id)
      and r.created_at >= now() - laria_private.purchase_request_waiting_window()
      and not exists (select 1 from public.store_purchase_request_marks m where m.event_id = r.event_id)), 0);
$$;

-- Marks a request answered or not sold, or clears the mark (p_status null). A request marked sold keeps its sale;
-- undo the sale from the SKU's history instead.
create or replace function public.mark_store_purchase_request(p_event_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.purchase_request_store(true);
  existing public.store_purchase_request_marks;
begin
  if p_status is not null and p_status not in ('answered', 'not_sold') then
    perform laria_private.raise_inventory_error('INVENTORY_FIELD_INVALID', 'Estado no compatible.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_store_id::text || ':purchase-request:' || coalesce(p_event_id::text, ''), 23));
  if not exists (select 1 from laria_private.purchase_request_rows(owner_store_id) r where r.event_id = p_event_id) then
    perform laria_private.raise_inventory_error('PURCHASE_REQUEST_NOT_FOUND', 'No encontramos esa solicitud.');
  end if;
  select * into existing from public.store_purchase_request_marks where event_id = p_event_id;
  if existing.status = 'sold' then
    perform laria_private.raise_inventory_error('PURCHASE_REQUEST_SOLD',
      'Esta solicitud ya tiene una venta registrada. Si no se concretó, deshaz la venta desde el historial del SKU.');
  end if;
  if p_status is null then
    delete from public.store_purchase_request_marks where event_id = p_event_id;
  else
    insert into public.store_purchase_request_marks(event_id, store_id, status, marked_by)
    values (p_event_id, owner_store_id, p_status, auth.uid())
    on conflict (event_id) do update set status = excluded.status, marked_by = excluded.marked_by, marked_at = now();
  end if;
  return jsonb_build_object('id', p_event_id, 'status', coalesce(p_status, 'waiting'));
end;
$$;

-- "Vendido": records the sale of p_quantity units of the publication's SKU (channel "WhatsApp de Laria") and marks
-- the request sold, in one transaction. Lock order: the request, then record_stock_movement's own order (idempotency
-- key, listing, item). Retrying with the same key returns the first result.
create or replace function public.record_purchase_request_sale(p_event_id uuid, p_quantity integer, p_expected_version integer, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.purchase_request_store(true);
  request_key text := laria_private.inventory_request_key(p_idempotency_key, 120);
  request record;
  existing public.store_purchase_request_marks;
  item_id uuid;
  result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(owner_store_id::text || ':purchase-request:' || coalesce(p_event_id::text, ''), 23));
  select r.* into request from laria_private.purchase_request_rows(owner_store_id) r where r.event_id = p_event_id;
  if request.event_id is null then
    perform laria_private.raise_inventory_error('PURCHASE_REQUEST_NOT_FOUND', 'No encontramos esa solicitud.');
  end if;
  select * into existing from public.store_purchase_request_marks where event_id = p_event_id;
  if existing.status = 'sold' then
    -- A retry of the same "Vendido" (or a second tab): the sale is already recorded once.
    return jsonb_build_object('id', p_event_id, 'status', 'sold', 'quantity', existing.quantity,
      'movement_id', existing.sale_movement_id, 'replayed', true);
  end if;
  select i.id into item_id from public.store_inventory_items i
  where i.listing_id = request.listing_id and i.store_id = owner_store_id;
  if item_id is null then
    perform laria_private.raise_inventory_error('PURCHASE_REQUEST_NO_SKU',
      'Esta publicación no tiene un SKU en Inventario. Márcala como respondida y registra la venta en la publicación.');
  end if;

  result := public.record_stock_movement(item_id, 'sale', p_quantity, 'whatsapp_laria', null,
    'Solicitud de compra', p_expected_version, request_key);

  insert into public.store_purchase_request_marks(event_id, store_id, status, quantity, sale_movement_id, marked_by)
  values (p_event_id, owner_store_id, 'sold', p_quantity, (result->'movement'->>'id')::uuid, auth.uid())
  on conflict (event_id) do update set status = 'sold', quantity = excluded.quantity,
    sale_movement_id = excluded.sale_movement_id, marked_by = excluded.marked_by, marked_at = now();
  return jsonb_build_object('id', p_event_id, 'status', 'sold', 'quantity', p_quantity,
    'movement_id', (result->'movement'->>'id')::uuid, 'item', result->'item', 'replayed', false);
end;
$$;

-- stock-23: get_listing_purchase_request as in 20261028120000_pay_1_store_payment_methods.sql, plus max_quantity:
-- what the SKU has available, up to 10 (1 for a publication without inventory). Public: it only says "up to N".
create or replace function public.get_listing_purchase_request(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  listing_record public.listings;
  methods jsonb;
  sku text;
  available integer;
begin
  select * into listing_record from public.listings where id = p_listing_id;
  if listing_record.id is null or listing_record.status <> 'approved' or listing_record.store_id is null
    or listing_record.seller_type <> 'store' or listing_record.stock_state is not distinct from 'out_of_stock'
    or not public.listing_is_public(p_listing_id) then
    return null;
  end if;
  methods := laria_private.public_payment_methods(listing_record.store_id);
  if jsonb_array_length(methods) = 0 then return null; end if;
  select i.merchant_sku, i.quantity_available into sku, available
  from public.store_inventory_items i
  where i.listing_id = p_listing_id and i.store_id = listing_record.store_id and i.inventory_status = 'active';
  return jsonb_build_object('methods', methods, 'sku', sku,
    'max_quantity', case when available is null then 1 else least(greatest(available, 1), 10) end);
end;
$$;

revoke all on function laria_private.purchase_request_window() from public, anon, authenticated;
revoke all on function laria_private.purchase_request_waiting_window() from public, anon, authenticated;
revoke all on function laria_private.purchase_request_store(boolean) from public, anon, authenticated;
revoke all on function laria_private.purchase_request_rows(uuid) from public, anon, authenticated;
revoke all on function public.get_store_purchase_requests(text, integer) from public, anon, authenticated;
revoke all on function public.get_store_purchase_request_count() from public, anon, authenticated;
revoke all on function public.mark_store_purchase_request(uuid, text) from public, anon, authenticated;
revoke all on function public.record_purchase_request_sale(uuid, integer, integer, text) from public, anon, authenticated;
grant execute on function public.get_store_purchase_requests(text, integer) to authenticated;
grant execute on function public.get_store_purchase_request_count() to authenticated;
grant execute on function public.mark_store_purchase_request(uuid, text) to authenticated;
grant execute on function public.record_purchase_request_sale(uuid, integer, integer, text) to authenticated;
