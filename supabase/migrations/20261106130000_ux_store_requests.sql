-- Effortless Laria, batch "stores" (docs/ux-effortless/stores.md): shop-05 and stock-21.
--
-- shop-05: the listing allowance gets one name ("Cupo de publicaciones"), a meter with what uses it, a way to free
--          slots held by out-of-stock listings, and "Pedir más cupo".
-- stock-21: a store without inventory can raise its hand ("Solicitar acceso") instead of finding no explanation.
--
-- Both requests land in one small table an Admin reads and closes. A request changes nothing by itself: the allowance
-- and the inventory switch stay Admin decisions (admin_set_store_listing_allowance, admin_set_store_inventory_enabled).
-- Additive: one table, five functions.

create table public.store_admin_requests (
  id                   uuid primary key default gen_random_uuid(),
  store_id             uuid not null references public.stores(id) on delete cascade,
  kind                 text not null check (kind in ('listing_allowance', 'inventory_access')),
  status               text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  message              text check (message is null or char_length(message) between 1 and 500),
  requested_allowance  integer check (requested_allowance is null or requested_allowance between 1 and 2000),
  created_by           uuid not null,
  created_at           timestamptz not null default now(),
  resolved_at          timestamptz,
  resolved_by          uuid,
  resolution_note      text check (resolution_note is null or char_length(resolution_note) between 1 and 500),
  constraint store_admin_request_closed_shape check ((status = 'open') = (resolved_at is null))
);

-- One open request per store and kind: asking again shows the open one instead of piling up.
create unique index store_admin_requests_one_open_idx on public.store_admin_requests(store_id, kind) where status = 'open';
create index store_admin_requests_open_idx on public.store_admin_requests(created_at) where status = 'open';

alter table public.store_admin_requests enable row level security;
revoke all on public.store_admin_requests from public, anon, authenticated;
grant select on public.store_admin_requests to authenticated;

create policy store_admin_requests_owner_read on public.store_admin_requests
for select to authenticated
using (exists (select 1 from public.stores s where s.id = store_id and s.owner_user_id = auth.uid()) or public.is_admin());

create or replace function laria_private.store_admin_request_json(p_request public.store_admin_requests)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object('id', p_request.id, 'kind', p_request.kind, 'status', p_request.status,
    'message', p_request.message, 'requested_allowance', p_request.requested_allowance,
    'created_at', p_request.created_at, 'resolved_at', p_request.resolved_at, 'resolution_note', p_request.resolution_note);
$$;

-- The owner asks. Returns the open request (new or already there). Inventory access is refused when inventory is
-- already on; an allowance request may say how many slots the store needs.
create or replace function public.request_store_admin_help(p_kind text, p_message text default null, p_requested_allowance integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  target public.stores;
  request public.store_admin_requests;
  clean_message text := nullif(btrim(coalesce(p_message, '')), '');
begin
  select * into target from public.stores s where caller is not null and s.owner_user_id = caller;
  if target.id is null then
    raise exception using errcode = 'P0001', message = 'STORE_REQUIRED: Necesitas una tienda para enviar esta solicitud.';
  end if;
  if target.status not in ('pending', 'active') then
    raise exception using errcode = 'P0001', message = 'STORE_NOT_WRITABLE: Tu tienda no puede enviar solicitudes en este momento.';
  end if;
  if p_kind is null or p_kind not in ('listing_allowance', 'inventory_access') then
    raise exception using errcode = 'P0001', message = 'REQUEST_INVALID: Esta solicitud no existe.';
  end if;
  if clean_message is not null and char_length(clean_message) > 500 then
    raise exception using errcode = 'P0001', message = 'REQUEST_INVALID: El mensaje admite hasta 500 caracteres.';
  end if;
  if p_requested_allowance is not null and (p_kind <> 'listing_allowance' or p_requested_allowance not between 1 and 2000) then
    raise exception using errcode = 'P0001', message = 'REQUEST_INVALID: Indica un cupo entre 1 y 2000.';
  end if;
  if p_kind = 'inventory_access' and exists (select 1 from public.store_operation_settings o
                                             where o.store_id = target.id and o.inventory_enabled) then
    raise exception using errcode = 'P0001', message = 'INVENTORY_ALREADY_ENABLED: Tu tienda ya tiene Inventario.';
  end if;

  select * into request from public.store_admin_requests r where r.store_id = target.id and r.kind = p_kind and r.status = 'open';
  if request.id is null then
    begin
      insert into public.store_admin_requests(store_id, kind, message, requested_allowance, created_by)
      values (target.id, p_kind, clean_message, p_requested_allowance, caller)
      returning * into request;
    exception when unique_violation then
      select * into request from public.store_admin_requests r where r.store_id = target.id and r.kind = p_kind and r.status = 'open';
    end;
  end if;
  return laria_private.store_admin_request_json(request);
end;
$$;

-- shop-05: what uses the caller's allowance. out_of_stock counts published listings an inventory SKU marks "Agotado":
-- they still hold a slot, and hiding them frees it (restorable from the listing, like any owner hide).
create or replace function public.get_store_listing_allowance_detail()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare target uuid; detail jsonb;
begin
  select s.id into target from public.stores s where auth.uid() is not null and s.owner_user_id = auth.uid();
  if target is null then
    raise exception using errcode = 'P0001', message = 'STORE_REQUIRED: Necesitas una tienda.';
  end if;
  select laria_private.store_listing_quota_json(target) || jsonb_build_object(
    'pending', count(*) filter (where l.status = 'pending'),
    'approved', count(*) filter (where l.status = 'approved'),
    'out_of_stock', count(*) filter (where l.status = 'approved' and l.stock_state = 'out_of_stock'),
    'open_request', (select laria_private.store_admin_request_json(r) from public.store_admin_requests r
                     where r.store_id = target and r.kind = 'listing_allowance' and r.status = 'open'))
  into detail
  from public.listings l
  where l.store_id = target and l.status in ('pending', 'approved');
  return detail;
end;
$$;

-- shop-05 "Ocultarlas": hides the caller's published out-of-stock listings that an inventory SKU controls, through the
-- inventory's own bulk hide (owner hide, restorable, idempotent per batch key). At most 200 per call.
create or replace function public.hide_out_of_stock_store_listings(p_batch_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_caller_store(true);
  request_batch_key text := laria_private.inventory_request_key(p_batch_key, 160);
  receipt laria_private.store_inventory_batch_receipts;
  ids uuid[];
begin
  -- A retried click replays what the first one hid (the listings it picked are no longer out of stock and published).
  select * into receipt from laria_private.store_inventory_batch_receipts r
  where r.store_id = owner_store_id and r.batch_key = request_batch_key and r.operation = 'hide';
  if found then
    return receipt.result || jsonb_build_object('replayed', true);
  end if;
  select array_agg(i.id order by i.id) into ids
  from (select i.id from public.store_inventory_items i
        join public.listings l on l.id = i.listing_id
        where i.store_id = owner_store_id and l.status = 'approved' and l.stock_state = 'out_of_stock'
        order by i.id limit 200) i;
  if ids is null then
    return jsonb_build_object('hidden', '[]'::jsonb, 'skipped', '[]'::jsonb, 'replayed', false);
  end if;
  return public.hide_inventory_listings_bulk(ids, request_batch_key);
end;
$$;

-- Admin: open (or all) requests, newest first, with the store's name and current allowance.
create or replace function public.get_admin_store_requests(p_status text default 'open', p_store_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED: Solo un administrador puede ver estas solicitudes.';
  end if;
  return coalesce((
    select jsonb_agg(laria_private.store_admin_request_json(r) || jsonb_build_object(
      'store_id', s.id, 'store_name', s.name, 'store_slug', s.slug,
      'allowance', laria_private.store_listing_allowance(s.id),
      'inventory_enabled', coalesce((select o.inventory_enabled from public.store_operation_settings o where o.store_id = s.id), false))
      order by r.created_at desc)
    from public.store_admin_requests r join public.stores s on s.id = r.store_id
    where (p_status is null or r.status = p_status) and (p_store_id is null or r.store_id = p_store_id)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_close_store_request(p_request_id uuid, p_status text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare request public.store_admin_requests; clean_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED: Solo un administrador puede cerrar solicitudes.';
  end if;
  if p_status is null or p_status not in ('resolved', 'dismissed') or (clean_note is not null and char_length(clean_note) > 500) then
    raise exception using errcode = 'P0001', message = 'REQUEST_INVALID: Revisa la decisión y la nota.';
  end if;
  update public.store_admin_requests
  set status = p_status, resolved_at = now(), resolved_by = auth.uid(), resolution_note = clean_note
  where id = p_request_id and status = 'open'
  returning * into request;
  if request.id is null then
    raise exception using errcode = 'P0001', message = 'REQUEST_NOT_FOUND: La solicitud ya no está abierta.';
  end if;
  return laria_private.store_admin_request_json(request);
end;
$$;

revoke all on function laria_private.store_admin_request_json(public.store_admin_requests) from public, anon, authenticated;
revoke all on function public.request_store_admin_help(text, text, integer) from public, anon, authenticated;
revoke all on function public.get_store_listing_allowance_detail() from public, anon, authenticated;
revoke all on function public.hide_out_of_stock_store_listings(text) from public, anon, authenticated;
revoke all on function public.get_admin_store_requests(text, uuid) from public, anon, authenticated;
revoke all on function public.admin_close_store_request(uuid, text, text) from public, anon, authenticated;
grant execute on function public.request_store_admin_help(text, text, integer) to authenticated;
grant execute on function public.get_store_listing_allowance_detail() to authenticated;
grant execute on function public.hide_out_of_stock_store_listings(text) to authenticated;
grant execute on function public.get_admin_store_requests(text, uuid) to authenticated;
grant execute on function public.admin_close_store_request(uuid, text, text) to authenticated;
