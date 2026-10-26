-- Feature ideas, batch "store-reach" (docs/feature-ideas/store-reach.md): reach-02 "Catálogo para redes".
--
-- A product feed per store that the store connects once to Meta Commerce Manager (Instagram, Facebook and the WhatsApp
-- Business catalog) or Google Merchant Center, and one feed for all of Laria. The feeds are routes
-- (app/api/feeds/tiendas/[slug] and app/api/feeds/laria) that read the functions below with the anonymous key. A
-- store's feed exists only while the store has turned it on (off by default) and the store is active. Each item is a
-- public publication: approved, of an active store or a Particular, with a price and at least one photo; an item out of
-- stock stays with availability "out of stock", and a sold, paused-by-Admin or hidden one leaves the feed. Price and
-- stock come from the publication itself, so the feed is in sync whenever a platform reads it.
--
-- Additive: one table, five functions. No existing function is redefined.

create table public.store_feed_settings (
  store_id    uuid primary key references public.stores(id) on delete cascade,
  enabled     boolean not null default false,
  enabled_at  timestamptz,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null,
  constraint store_feed_settings_enabled_check check (not enabled or enabled_at is not null)
);

comment on table public.store_feed_settings is
  'reach-02: whether a store publishes its feed for Meta and Google. Written only by set_store_feed_enabled().';

alter table public.store_feed_settings enable row level security;
revoke all on public.store_feed_settings from public, anon, authenticated;

-- The caller's own store, for the batch's owner functions. p_active: the store must be active.
create or replace function laria_private.reach_caller_store(p_active boolean)
returns public.stores
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_store public.stores;
begin
  select s.* into caller_store from public.stores s where auth.uid() is not null and s.owner_user_id = auth.uid();
  if caller_store.id is null then
    raise exception using errcode = '42501', message = 'STORE_REQUIRED: Necesitas una tienda para usar esta sección.';
  end if;
  if p_active and caller_store.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'STORE_NOT_ACTIVE: Tu tienda debe estar activa para usar esta sección.';
  end if;
  return caller_store;
end;
$$;

-- A publication the feeds can show: public, with a price and a photo.
create or replace function laria_private.feed_listing_ready(p_listing public.listings)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_listing.status = 'approved'
    and p_listing.price_pen is not null and p_listing.price_pen > 0
    and public.listing_is_public(p_listing.id)
    and exists (select 1 from public.listing_photos p where p.listing_id = p_listing.id)
$$;

-- The owner's view: whether the feed is on, and how many publications it carries or leaves out (and why).
create or replace function public.get_store_feed_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_store public.stores := laria_private.reach_caller_store(false);
  settings public.store_feed_settings;
begin
  select * into settings from public.store_feed_settings f where f.store_id = caller_store.id;
  return jsonb_build_object(
    'store_slug', caller_store.slug,
    'store_name', caller_store.name,
    'store_active', caller_store.status = 'active',
    'enabled', coalesce(settings.enabled, false),
    'enabled_at', settings.enabled_at,
    'items', (select count(*) from public.listings l where l.store_id = caller_store.id and laria_private.feed_listing_ready(l)),
    'out_of_stock', (select count(*) from public.listings l
      where l.store_id = caller_store.id and l.stock_state = 'out_of_stock' and laria_private.feed_listing_ready(l)),
    'without_photo', (select count(*) from public.listings l
      where l.store_id = caller_store.id and l.status = 'approved'
        and not exists (select 1 from public.listing_photos p where p.listing_id = l.id)),
    'without_price', (select count(*) from public.listings l
      where l.store_id = caller_store.id and l.status = 'approved' and (l.price_pen is null or l.price_pen <= 0)),
    'without_brand', (select count(*) from public.listings l
      where l.store_id = caller_store.id and nullif(btrim(l.brand), '') is null and laria_private.feed_listing_ready(l))
  );
end;
$$;

-- Turns the store's feed on (active stores only) or off (always). Returns the owner's view.
create or replace function public.set_store_feed_enabled(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_store public.stores := laria_private.reach_caller_store(coalesce(p_enabled, false));
begin
  if p_enabled is null then
    raise exception using errcode = 'P0001', message = 'FEED_INVALID: Indica si el catálogo queda activo.';
  end if;
  insert into public.store_feed_settings as f (store_id, enabled, enabled_at, updated_at, updated_by)
  values (caller_store.id, p_enabled, case when p_enabled then now() end, now(), auth.uid())
  on conflict (store_id) do update set
    enabled = excluded.enabled,
    -- Keeps the first time it was turned on while it stays on.
    enabled_at = case when excluded.enabled then coalesce(case when f.enabled then f.enabled_at end, now()) end,
    updated_at = now(),
    updated_by = auth.uid();
  return public.get_store_feed_settings();
end;
$$;

-- The store a feed URL names, when its feed is on and it is active; null otherwise (the route answers 404).
create or replace function public.get_store_feed_header(p_store_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('slug', s.slug, 'name', s.name)
  from public.stores s
  join public.store_feed_settings f on f.store_id = s.id and f.enabled
  where s.slug = p_store_slug and s.status = 'active'
$$;

-- One page of feed items, in id order (keyset: pass the last id as p_after). p_store_slug null: all of Laria.
-- seller_key identifies the seller to Google (external_seller_id) without exposing an account: "tienda-<slug>" for a
-- store, "p-" and 16 hex characters of a hash for a Particular.
create or replace function public.get_feed_items(p_store_slug text default null, p_after uuid default null, p_limit integer default 500)
returns table (
  id uuid, slug text, title text, description text, brand text, model text, condition text, price_pen numeric,
  out_of_stock boolean, category text, instrument_type text, seller_key text, photos text[], updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.slug, l.title, l.description, nullif(btrim(l.brand), ''), nullif(btrim(l.model), ''), l.condition,
    l.price_pen, coalesce(l.stock_state = 'out_of_stock', false), l.category, l.instrument_type,
    case when l.store_id is not null then 'tienda-' || s.slug
         else 'p-' || left(encode(sha256(convert_to('laria-feed:' || l.owner_user_id::text, 'UTF8')), 'hex'), 16) end,
    array(select p.image_url from public.listing_photos p where p.listing_id = l.id order by p.sort_order, p.created_at limit 10),
    l.updated_at
  from public.listings l
  left join public.stores s on s.id = l.store_id
  where l.status = 'approved'
    and (p_after is null or l.id > p_after)
    and (p_store_slug is null or (s.slug = p_store_slug and s.status = 'active'
      and exists (select 1 from public.store_feed_settings f where f.store_id = s.id and f.enabled)))
    and laria_private.feed_listing_ready(l)
  order by l.id
  limit greatest(1, least(coalesce(p_limit, 500), 1000))
$$;

revoke all on function laria_private.reach_caller_store(boolean) from public, anon, authenticated;
revoke all on function laria_private.feed_listing_ready(public.listings) from public, anon, authenticated;
revoke all on function public.get_store_feed_settings() from public, anon, authenticated;
revoke all on function public.set_store_feed_enabled(boolean) from public, anon, authenticated;
revoke all on function public.get_store_feed_header(text) from public, anon, authenticated;
revoke all on function public.get_feed_items(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.get_store_feed_settings() to authenticated;
grant execute on function public.set_store_feed_enabled(boolean) to authenticated;
grant execute on function public.get_store_feed_header(text) to anon, authenticated;
grant execute on function public.get_feed_items(text, uuid, integer) to anon, authenticated;
