-- Feature ideas, batch listing-details (docs/feature-ideas/listing-details.md), buy-08 "Ver en mapa".
--
-- The catalog can show its results on a map (MapLibre GL with OpenFreeMap tiles; no key). A store may drop a pin on
-- its shop. The pin is public only while the store shows its street address (show_address, list-12), the same
-- consent: public_map_latitude/longitude are generated columns that are null otherwise, and only they are granted to
-- the public. A store without a public pin, and every Particular, shows as an approximate area around its city or
-- district (worked out by the site from lib/places.ts, never stored). Laria gives no directions: a store pin offers
-- "Abrir en Google Maps" and "Abrir en Waze".

alter table public.stores
  add column if not exists map_latitude double precision,
  add column if not exists map_longitude double precision;

-- Peru's bounding box, with a small margin; both or neither.
alter table public.stores
  add constraint stores_map_pin_check check (
    (map_latitude is null and map_longitude is null)
    or (map_latitude between -18.5 and 0.1 and map_longitude between -81.5 and -68.5)
  );

alter table public.stores
  add column if not exists public_map_latitude double precision
    generated always as (case when show_address then map_latitude end) stored,
  add column if not exists public_map_longitude double precision
    generated always as (case when show_address then map_longitude end) stored;

comment on column public.stores.map_latitude is
  'buy-08: the shop''s pin as the store placed it. Private; the public reads public_map_latitude.';
comment on column public.stores.public_map_latitude is
  'buy-08: map_latitude while show_address is true, otherwise null. Public pages and the map read this.';

-- Column grants add to a table-level grant (see 20261022130000_store_public_columns.sql): readable either way.
grant select (public_map_latitude, public_map_longitude) on public.stores to anon, authenticated;

-- The owner's pin, or null to remove it. The store form's own save keeps working as before; this is the pin field's.
create or replace function public.set_own_store_map_pin(p_store_id uuid, p_latitude double precision, p_longitude double precision)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.stores where id = p_store_id and owner_user_id = auth.uid() and status in ('pending', 'active')
  ) then
    raise exception using errcode = '42501', message = 'STORE_NOT_OWNED: No puedes cambiar esta tienda.';
  end if;
  if (p_latitude is null) <> (p_longitude is null)
    or (p_latitude is not null and not (p_latitude between -18.5 and 0.1 and p_longitude between -81.5 and -68.5)) then
    raise exception 'STORE_MAP_PIN_INVALID: Ubica el pin dentro del Perú.';
  end if;
  update public.stores
  set map_latitude = round(p_latitude::numeric, 6)::double precision,
      map_longitude = round(p_longitude::numeric, 6)::double precision
  where id = p_store_id;
end;
$$;

revoke all on function public.set_own_store_map_pin(uuid, double precision, double precision) from public, anon;
grant execute on function public.set_own_store_map_pin(uuid, double precision, double precision) to authenticated;
