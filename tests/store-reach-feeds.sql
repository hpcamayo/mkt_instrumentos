-- Feature ideas, batch "store-reach" (docs/feature-ideas/store-reach.md): reach-02 "Catálogo para redes".
-- Covers the store's switch (off by default, active stores only), what a feed carries and leaves out, the Laria-wide
-- feed, keyset paging and who may call what. Local/test database only; rolled back.
begin;

create function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_code in sqlerrm) = 1 then return; end if;
    raise exception 'Expected % from [%], got: % (%)', p_code, p_sql, sqlerrm, sqlstate;
  end;
  raise exception 'Expected % from [%], but it succeeded', p_code, p_sql;
end $$;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;

create function pg_temp.as_user(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e7410000-0000-4000-8000-0000000000a1','authenticated','authenticated','reach-feed-owner@example.invalid',now(),'{}','{"account_type":"store_owner"}'),
 ('e7410000-0000-4000-8000-0000000000a2','authenticated','authenticated','reach-feed-hidden@example.invalid',now(),'{}','{"account_type":"store_owner"}'),
 ('e7410000-0000-4000-8000-0000000000a3','authenticated','authenticated','reach-feed-particular@example.invalid',now(),'{}','{}');
insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('e7410000-0000-4000-8000-000000000001','reach-feed-tienda','Tienda Catálogo','Catálogo SAC','20999995001','cat@example.invalid','Contacto','Contacto','51999995001','Lima','Lima','Av. 1','e7410000-0000-4000-8000-0000000000a1','active','free',true),
 ('e7410000-0000-4000-8000-000000000002','reach-feed-oculta','Tienda Oculta','Oculta SAC','20999995002','ocu@example.invalid','Contacto','Contacto','51999995002','Lima','Lima','Av. 2','e7410000-0000-4000-8000-0000000000a2','hidden','free',true);

-- 01 ready; 02 out of stock; 03 no photo; 04 no price; 05 pending; 06 sold; 07 hidden store; 08 a Particular's.
insert into public.listings (id, slug, title, seller_type, status, category, brand, model, condition, city, region, whatsapp_phone, owner_user_id, store_id, price_pen, description)
select ('e7410000-0000-4000-8000-0000000001' || n)::uuid, 'reach-feed-' || n, 'Instrumento ' || n,
  (case when n = '08' then 'individual' else 'store' end)::seller_type,
  (case n when '05' then 'pending' when '06' then 'sold' else 'approved' end)::listing_status,
  'guitars', case when n = '01' then 'Fender' end, 'Modelo ' || n, case when n = '08' then 'Usado - buen estado' else 'Nuevo' end,
  'Lima', 'Lima', '51999995001',
  case n when '07' then 'e7410000-0000-4000-8000-0000000000a2'::uuid when '08' then 'e7410000-0000-4000-8000-0000000000a3'::uuid
    else 'e7410000-0000-4000-8000-0000000000a1'::uuid end,
  case n when '07' then 'e7410000-0000-4000-8000-000000000002'::uuid when '08' then null else 'e7410000-0000-4000-8000-000000000001'::uuid end,
  case when n = '04' then null else 1500 end, 'Descripción ' || n
from unnest(array['01', '02', '03', '04', '05', '06', '07', '08']) n;
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set stock_state = 'out_of_stock' where id = 'e7410000-0000-4000-8000-000000000102';
select set_config('app.allow_listing_admin_fields', '', true);
insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/' || l.slug || '-' || g || '.jpg', g
from public.listings l cross join generate_series(1, 2) g
where l.slug like 'reach-feed-%' and l.slug <> 'reach-feed-03';

set local role authenticated;

-- ------------------------------------------------------------------ the store's switch

select pg_temp.as_user('e7410000-0000-4000-8000-0000000000a3');
select pg_temp.expect_error($$select public.get_store_feed_settings()$$, 'STORE_REQUIRED');
select pg_temp.expect_error($$select public.set_store_feed_enabled(true)$$, 'STORE_REQUIRED');

select pg_temp.as_user('e7410000-0000-4000-8000-0000000000a1');
do $$ declare settings jsonb; begin
  settings := public.get_store_feed_settings();
  perform pg_temp.check((settings->>'enabled')::boolean = false, 'off by default');
  perform pg_temp.check((settings->>'items')::integer = 2, format('two publications ready, got %s', settings->>'items'));
  perform pg_temp.check((settings->>'out_of_stock')::integer = 1, 'one of them out of stock');
  perform pg_temp.check((settings->>'without_photo')::integer = 1 and (settings->>'without_price')::integer = 1, 'left out and why');
  perform pg_temp.check((settings->>'without_brand')::integer = 1, 'ready but without brand');
end $$;
select pg_temp.expect_error($$select public.set_store_feed_enabled(null)$$, 'FEED_INVALID');
select pg_temp.expect_error($$select * from public.store_feed_settings$$, 'permission denied');
select pg_temp.expect_error($$insert into public.store_feed_settings (store_id, enabled, enabled_at)
  values ('e7410000-0000-4000-8000-000000000001', true, now())$$, 'permission denied');

-- Off: no feed.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.check(public.get_store_feed_header('reach-feed-tienda') is null, 'no header while off');
select pg_temp.check(not exists (select 1 from public.get_feed_items('reach-feed-tienda')), 'no items while off');

set local role authenticated;
select pg_temp.as_user('e7410000-0000-4000-8000-0000000000a1');
do $$ declare first jsonb; again jsonb; begin
  first := public.set_store_feed_enabled(true);
  perform pg_temp.check((first->>'enabled')::boolean and first->>'enabled_at' is not null, 'turned on');
  again := public.set_store_feed_enabled(true);
  perform pg_temp.check(again->>'enabled_at' = first->>'enabled_at', 'turning it on again keeps the date');
end $$;

-- The hidden store's owner can turn it off but not on.
select pg_temp.as_user('e7410000-0000-4000-8000-0000000000a2');
select pg_temp.expect_error($$select public.set_store_feed_enabled(true)$$, 'STORE_NOT_ACTIVE');
select pg_temp.check((public.set_store_feed_enabled(false)->>'enabled')::boolean = false, 'off is always allowed');

-- ------------------------------------------------------------------ what a feed carries

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ declare header jsonb; ids text[]; first record; begin
  header := public.get_store_feed_header('reach-feed-tienda');
  perform pg_temp.check(header->>'name' = 'Tienda Catálogo', 'header names the store');
  perform pg_temp.check(public.get_store_feed_header('reach-feed-oculta') is null, 'a hidden store has no feed');

  select array_agg(slug order by id) into ids from public.get_feed_items('reach-feed-tienda');
  perform pg_temp.check(ids = array['reach-feed-01', 'reach-feed-02'], format('store feed: ready ones only, got %s', ids));
  select * into first from public.get_feed_items('reach-feed-tienda') where slug = 'reach-feed-01';
  perform pg_temp.check(first.brand = 'Fender' and first.price_pen = 1500 and not first.out_of_stock, 'item fields');
  perform pg_temp.check(first.seller_key = 'tienda-reach-feed-tienda', 'store seller key');
  perform pg_temp.check(first.photos = array['https://example.invalid/reach-feed-01-1.jpg', 'https://example.invalid/reach-feed-01-2.jpg'], 'photos in order');
  perform pg_temp.check((select out_of_stock from public.get_feed_items('reach-feed-tienda') where slug = 'reach-feed-02'), 'out of stock flagged');

  -- All of Laria: every public, ready publication, the Particular's included; the hidden store's left out.
  select array_agg(slug order by id) into ids from public.get_feed_items(null) where slug like 'reach-feed-%';
  perform pg_temp.check(ids = array['reach-feed-01', 'reach-feed-02', 'reach-feed-08'], format('laria feed, got %s', ids));
  perform pg_temp.check((select seller_key from public.get_feed_items(null) where slug = 'reach-feed-08') ~ '^p-[0-9a-f]{16}$',
    'a Particular is a hash, never an id');
  perform pg_temp.check(not exists (select 1 from public.get_feed_items(null) where seller_key like '%e7410000%'), 'no account ids');

  -- Keyset paging.
  perform pg_temp.check((select count(*) from public.get_feed_items('reach-feed-tienda', null, 1)) = 1, 'page size');
  perform pg_temp.check((select slug from public.get_feed_items('reach-feed-tienda', 'e7410000-0000-4000-8000-000000000101', 10)) = 'reach-feed-02',
    'next page after the last id');
end $$;
select pg_temp.expect_error($$select public.get_store_feed_settings()$$, 'permission denied');

-- Sold publications leave the feed at once; so does a store that turns it off.
reset role;
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set status = 'sold', sold_at = now() where id = 'e7410000-0000-4000-8000-000000000101';
select set_config('app.allow_listing_admin_fields', '', true);
select pg_temp.check(not exists (select 1 from public.get_feed_items('reach-feed-tienda') where slug = 'reach-feed-01'), 'sold leaves');
set local role authenticated;
select pg_temp.as_user('e7410000-0000-4000-8000-0000000000a1');
select public.set_store_feed_enabled(false);
select pg_temp.check(public.get_store_feed_header('reach-feed-tienda') is null, 'off again');

rollback;
