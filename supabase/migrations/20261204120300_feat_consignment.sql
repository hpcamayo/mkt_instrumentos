-- Selling tools, sell-03 "Consignación" (docs/feature-ideas/selling-tools.md). A verified store that takes gear in
-- consignment publishes it as one of its own listings (so it counts against the store's allowance) and links the
-- owner with a one-time invite it sends by WhatsApp. The listing then says "En consignación en <Tienda>", and the owner
-- follows its views, WhatsApp contacts and saves from Mi equipo. The commission is agreed privately between them;
-- Laria records none of it.

create table public.listing_consignments (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  owner_user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'invited' check (status in ('invited', 'active', 'sold', 'ended')),
  -- SHA-256 of the invite's secret; the secret itself is shown once to the store and never stored.
  invite_token_hash text unique,
  invite_expires_at timestamptz,
  accepted_at timestamptz,
  ended_at timestamptz,
  ended_by text check (ended_by is null or ended_by in ('store', 'owner', 'listing')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_consignments_invite_check check (
    (status = 'invited') = (invite_token_hash is not null and invite_expires_at is not null)
  ),
  constraint listing_consignments_owner_check check (status = 'invited' or status = 'ended' or owner_user_id is not null)
);

create unique index listing_consignments_open_idx on public.listing_consignments(listing_id) where status in ('invited', 'active');
create index listing_consignments_owner_idx on public.listing_consignments(owner_user_id, created_at desc) where owner_user_id is not null;
create index listing_consignments_store_idx on public.listing_consignments(store_id, created_at desc);

create trigger listing_consignments_set_updated_at
before update on public.listing_consignments
for each row execute function public.set_updated_at();

alter table public.listing_consignments enable row level security;
revoke all on public.listing_consignments from anon, authenticated;

-- The store creates (or renews) the invite for one of its listings. Returns the secret for the link, once.
create or replace function public.create_consignment_invite(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  v_store public.stores%rowtype;
  v_listing public.listings%rowtype;
  v_secret text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expires timestamptz := now() + interval '7 days';
  v_open public.listing_consignments%rowtype;
begin
  select * into v_store from public.stores where id = laria_private.selling_own_store_id();
  if not found then
    raise exception using errcode = '42501', message = 'STORE_REQUIRED: Esta opción es para tiendas.';
  end if;
  if v_store.status <> 'active' or not v_store.is_verified
    or not exists (select 1 from public.store_trade_settings ts where ts.store_id = v_store.id and ts.consignment) then
    raise exception 'CONSIGNMENT_NOT_ENABLED: Activa «Recibimos en consignación» en Ofertas › Qué recibimos (tiendas verificadas).';
  end if;
  select * into v_listing from public.listings where id = p_listing_id and store_id = v_store.id for update;
  if not found then
    raise exception 'LISTING_NOT_FOUND: No encontramos esa publicación en tu tienda.';
  end if;
  if v_listing.status in ('sold', 'archived', 'rejected') then
    raise exception 'LISTING_CLOSED: Esa publicación ya no está activa.';
  end if;
  if exists (select 1 from public.store_inventory_items i where i.listing_id = v_listing.id) then
    raise exception 'CONSIGNMENT_STOCK_MANAGED: Una publicación con stock de Inventario no puede ir en consignación.';
  end if;
  select * into v_open from public.listing_consignments where listing_id = v_listing.id and status in ('invited', 'active') for update;
  if found and v_open.status = 'active' then
    raise exception 'CONSIGNMENT_ACTIVE: Esta publicación ya está vinculada a su dueño.';
  end if;
  if found then
    update public.listing_consignments
    set invite_token_hash = encode(sha256(convert_to(v_secret, 'UTF8')), 'hex'), invite_expires_at = v_expires
    where id = v_open.id;
  else
    insert into public.listing_consignments(listing_id, store_id, invite_token_hash, invite_expires_at)
    values (v_listing.id, v_store.id, encode(sha256(convert_to(v_secret, 'UTF8')), 'hex'), v_expires);
  end if;
  return jsonb_build_object('token', v_secret, 'expires_at', v_expires);
end;
$$;

create or replace function laria_private.consignment_by_token(p_token text)
returns public.listing_consignments
language sql
stable
security definer
set search_path = public
as $$
  select c.* from public.listing_consignments c
  where p_token ~ '^[0-9a-f]{64}$'
    and c.invite_token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and c.status = 'invited' and c.invite_expires_at > now();
$$;

revoke all on function laria_private.consignment_by_token(text) from public, anon, authenticated;

-- What the invite page shows before the owner accepts.
create or replace function public.get_consignment_invite(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, laria_private
as $$
  select jsonb_build_object(
    'listing', jsonb_build_object('id', l.id, 'title', l.title, 'slug', l.slug, 'price_pen', l.price_pen, 'status', l.status),
    'store', jsonb_build_object('name', s.name, 'slug', s.slug, 'city', s.city, 'is_verified', s.is_verified),
    'expires_at', c.invite_expires_at
  )
  from laria_private.consignment_by_token(p_token) c
  join public.listings l on l.id = c.listing_id
  join public.stores s on s.id = c.store_id
  where auth.uid() is not null and c.id is not null;
$$;

create or replace function public.accept_consignment_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  uid uuid := laria_private.gear_require_owner();
  v_found public.listing_consignments%rowtype;
  v_store public.stores%rowtype;
  v_title text;
begin
  v_found := laria_private.consignment_by_token(p_token);
  if v_found.id is null then
    raise exception 'CONSIGNMENT_INVITE_INVALID: El enlace venció o ya se usó. Pide uno nuevo a la tienda.';
  end if;
  select * into v_found from public.listing_consignments where id = v_found.id for update;
  if v_found.status <> 'invited' then
    raise exception 'CONSIGNMENT_INVITE_INVALID: El enlace venció o ya se usó. Pide uno nuevo a la tienda.';
  end if;
  select * into v_store from public.stores where id = v_found.store_id;
  if v_store.owner_user_id = uid then
    raise exception 'CONSIGNMENT_OWN_STORE: Este enlace es para la persona dueña del equipo.';
  end if;
  update public.listing_consignments
  set status = 'active', owner_user_id = uid, accepted_at = now(), invite_token_hash = null, invite_expires_at = null
  where id = v_found.id;
  select title into v_title from public.listings where id = v_found.listing_id;
  perform laria_private.selling_notify(
    v_store.owner_user_id, 'listing_consignment_update',
    format('La persona dueña de “%s” vinculó su cuenta. Ya ve las visitas y contactos.', v_title),
    v_found.listing_id, v_store.id
  );
  return v_found.id;
end;
$$;

-- Either side ends it. The store decides what happens to its listing.
create or replace function public.end_consignment(p_consignment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  uid uuid := auth.uid();
  v_row public.listing_consignments%rowtype;
  v_store public.stores%rowtype;
  v_title text;
  v_by text;
begin
  select * into v_row from public.listing_consignments where id = p_consignment_id for update;
  if not found then
    raise exception 'CONSIGNMENT_NOT_FOUND: No encontramos esa consignación.';
  end if;
  select * into v_store from public.stores where id = v_row.store_id;
  v_by := case when v_store.owner_user_id = uid then 'store' when v_row.owner_user_id = uid then 'owner' else null end;
  if uid is null or v_by is null then
    raise exception 'CONSIGNMENT_NOT_FOUND: No encontramos esa consignación.';
  end if;
  if v_row.status not in ('invited', 'active') then
    return false;
  end if;
  update public.listing_consignments
  set status = 'ended', ended_at = now(), ended_by = v_by, invite_token_hash = null, invite_expires_at = null
  where id = v_row.id;
  if v_row.status = 'active' then
    select title into v_title from public.listings where id = v_row.listing_id;
    if v_by = 'store' then
      perform laria_private.selling_notify(v_row.owner_user_id, 'listing_consignment_update',
        format('%s terminó la consignación de “%s”.', v_store.name, v_title), v_row.listing_id, null);
    else
      perform laria_private.selling_notify(v_store.owner_user_id, 'listing_consignment_update',
        format('La persona dueña de “%s” terminó la consignación. Revisa si la publicación debe seguir activa.', v_title),
        v_row.listing_id, v_store.id);
    end if;
  end if;
  return true;
end;
$$;

-- The label on the listing page: only while the consignment is active and the listing is public.
create or replace function public.get_listing_consignment(p_listing_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('store_name', s.name, 'store_slug', s.slug)
  from public.listing_consignments c
  join public.stores s on s.id = c.store_id and s.status = 'active'
  where c.listing_id = p_listing_id and c.status = 'active' and public.listing_is_public(p_listing_id)
  limit 1;
$$;

-- The owner's list: each item with its store, price, status and how it is doing.
create or replace function public.get_my_consignments()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'status', c.status, 'accepted_at', c.accepted_at, 'ended_at', c.ended_at,
    'listing', jsonb_build_object('id', l.id, 'title', l.title, 'slug', l.slug, 'price_pen', l.price_pen,
      'status', l.status, 'published_at', l.published_at, 'sold_at', l.sold_at),
    'store', jsonb_build_object('name', s.name, 'slug', s.slug, 'city', s.city, 'whatsapp_phone', s.whatsapp_phone),
    'views', coalesce(l.view_count, 0),
    'contacts', (select count(*) from public.marketplace_events e where e.listing_id = l.id and e.event_type = 'whatsapp_contact'
                   and e.created_at >= coalesce(l.published_at, l.created_at)),
    'saves', (select count(*) from public.favorites f where f.listing_id = l.id)
  ) order by c.created_at desc), '[]'::jsonb)
  from public.listing_consignments c
  join public.listings l on l.id = c.listing_id
  join public.stores s on s.id = c.store_id
  where c.owner_user_id = auth.uid() and auth.uid() is not null;
$$;

-- The store's view of one listing's consignment, for its selling tools page.
create or replace function public.get_store_listing_consignment(p_listing_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, laria_private
as $$
  select jsonb_build_object(
    'id', c.id, 'status', c.status, 'invite_expires_at', c.invite_expires_at, 'accepted_at', c.accepted_at,
    'owner_name', case when c.status in ('active', 'sold') then coalesce(nullif(p.full_name, ''), 'Particular') else null end
  )
  from public.listing_consignments c
  left join public.profiles p on p.id = c.owner_user_id
  where c.listing_id = p_listing_id and c.store_id = laria_private.selling_own_store_id()
  order by (c.status in ('invited', 'active')) desc, c.created_at desc
  limit 1;
$$;

revoke all on function public.create_consignment_invite(uuid), public.get_consignment_invite(text),
  public.accept_consignment_invite(text), public.end_consignment(uuid), public.get_my_consignments(),
  public.get_store_listing_consignment(uuid) from public, anon;
grant execute on function public.create_consignment_invite(uuid), public.get_consignment_invite(text),
  public.accept_consignment_invite(text), public.end_consignment(uuid), public.get_my_consignments(),
  public.get_store_listing_consignment(uuid) to authenticated;
grant execute on function public.get_listing_consignment(uuid) to anon, authenticated;

-- A sold listing closes its consignment and tells the owner; an archived one ends it.
create or replace function laria_private.close_consignment_on_listing_change()
returns trigger
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare v_row public.listing_consignments%rowtype;
begin
  if new.status = old.status or new.status not in ('sold', 'archived') then
    return new;
  end if;
  select * into v_row from public.listing_consignments where listing_id = new.id and status in ('invited', 'active') for update;
  if not found then
    return new;
  end if;
  if new.status = 'sold' and v_row.status = 'active' then
    update public.listing_consignments set status = 'sold', ended_at = now(), ended_by = 'listing' where id = v_row.id;
    perform laria_private.enqueue_marketplace_email(
      'listing_consignment_update', v_row.owner_user_id, 'consignment_sold:' || v_row.id::text,
      laria_private.selling_notify(v_row.owner_user_id, 'listing_consignment_update',
        format('La tienda marcó “%s” como vendida. Coordina con ella lo acordado.', new.title), new.id, null),
      new.id, v_row.store_id,
      p_context => jsonb_build_object('selling', jsonb_build_object('outcome', 'sold', 'title', new.title))
    );
  else
    update public.listing_consignments
    set status = 'ended', ended_at = now(), ended_by = 'listing', invite_token_hash = null, invite_expires_at = null
    where id = v_row.id;
    if v_row.status = 'active' then
      perform laria_private.selling_notify(v_row.owner_user_id, 'listing_consignment_update',
        format('La publicación de “%s” se cerró y terminó la consignación.', new.title), new.id, null);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function laria_private.close_consignment_on_listing_change() from public, anon, authenticated;

create trigger listings_selling_consignment_close
after update of status on public.listings
for each row execute function laria_private.close_consignment_on_listing_change();
