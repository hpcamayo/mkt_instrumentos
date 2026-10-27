-- Effortless Laria, find batch (docs/ux-effortless/find.md): the free-text search (catalog_search), the facet counts
-- (catalog_facets), the suggestions, the listing counts for menus, the price-drop and verified-first orders, the
-- gone-listing hint and the alerts' text query. Local/test database only. Every fixture is rolled back.
begin;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
 ('7f000000-0000-4000-8000-000000000001','authenticated','authenticated','find-owner@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Dueño Find","phone":"51999998001","city":"Lima","region":"Lima"}'),
 ('7f000000-0000-4000-8000-000000000002','authenticated','authenticated','find-buyer@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Comprador Find","phone":"51999998002","city":"Lima","region":"Lima"}');

insert into public.listings(id,slug,title,seller_type,status,category,instrument_type,attributes,brand,model,condition,price_pen,city,region,whatsapp_phone,description,owner_user_id,marketplace_rules_accepted_at) values
 ('7f100000-0000-4000-8000-000000000001','find-strat','Fender Stratocaster Player Zzqx','individual','pending','guitars','electric_guitar','{}','Fender','Stratocaster','Usado - buen estado',3200,'Lima','Lima','51999998001','Descripción válida y suficientemente extensa para la prueba del buscador.','7f000000-0000-4000-8000-000000000001',now()),
 ('7f100000-0000-4000-8000-000000000002','find-cajon','Cajón peruano Zzqx','individual','pending','percussion','hand_percussion','{}','Zzqxmarca','Festejo','Nuevo',450,'Arequipa','Arequipa','51999998001','Descripción válida y suficientemente extensa para la prueba del buscador.','7f000000-0000-4000-8000-000000000001',now()),
 ('7f100000-0000-4000-8000-000000000003','find-bajo','Bajo Ibanez cinco cuerdas Zzqx','individual','pending','basses','bass','{"strings":"5"}','Ibanez','SR305','Nuevo',2300,'Lima','Lima','51999998001','Descripción válida y suficientemente extensa para la prueba del buscador.','7f000000-0000-4000-8000-000000000001',now()),
 ('7f100000-0000-4000-8000-000000000004','find-hidden','Fender Stratocaster oculta Zzqx','individual','pending','guitars','electric_guitar','{}','Fender','Stratocaster','Nuevo',2500,'Lima','Lima','51999998001','Descripción válida y suficientemente extensa para la prueba del buscador.','7f000000-0000-4000-8000-000000000001',now());
insert into public.listing_photos(listing_id,image_url,sort_order)
select listing_id, 'https://example.invalid/'||listing_id||'-'||photo||'.jpg', photo
from (values('7f100000-0000-4000-8000-000000000001'::uuid),('7f100000-0000-4000-8000-000000000002'::uuid),('7f100000-0000-4000-8000-000000000003'::uuid),('7f100000-0000-4000-8000-000000000004'::uuid)) items(listing_id)
cross join generate_series(0,1) photo;
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set status='approved', published_at=now() where id::text like '7f100000-%';
update public.listings set status='hidden' where id='7f100000-0000-4000-8000-000000000004';
-- A real drop (list-05, at least 5% below a price the approved listing kept): what "Bajaron de precio" orders by.
update public.listings set price_pen = 1900 where id = '7f100000-0000-4000-8000-000000000003';
select set_config('app.allow_listing_admin_fields', '', true);

-- As a visitor.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);

-- BIG 03: brand, model, type and title; accents ignored; typos and slang forgiven; hidden listings never found.
select pg_temp.check((select count(*) from public.catalog_search('stratocaster zzqx')) = 1, 'model search finds the public listing only');
select pg_temp.check((select count(*) from public.catalog_search('strato zzqx')) = 1, 'slang "strato" finds Stratocaster');
select pg_temp.check((select count(*) from public.catalog_search('cajon zzqx')) = 1, 'accents are ignored');
select pg_temp.check((select count(*) from public.catalog_search('stratocastr zzqx')) = 1, 'a typo is forgiven');
select pg_temp.check((select count(*) from public.catalog_search('bass zzqx')) = 1, 'bass finds bajos');
select pg_temp.check((select count(*) from public.catalog_search('guitarra zzqx')) = 1, 'category words find their listings');
select pg_temp.check((select count(*) from public.catalog_search('violin zzqx')) = 0, 'every word must match');
select pg_temp.check((select count(*) from public.catalog_search('oculta zzqx')) = 0, 'a hidden listing is not found');

-- FIND 05, 07, 08: counts per option, each facet without its own filter; places from the listings; price spread.
do $$ declare facets jsonb; begin
  facets := public.catalog_facets('{"category":"guitars"}'::jsonb, 'zzqx', array[]::text[]);
  perform pg_temp.check((facets->>'total')::int = 1, 'facet total');
  perform pg_temp.check((facets->'category'->>'percussion')::int = 1 and (facets->'category'->>'basses')::int = 1, 'the category facet ignores the chosen category');
  perform pg_temp.check(facets->'locations' @> '[{"city":"Lima","count":1}]', 'places come from the listings');
  perform pg_temp.check((facets->'price'->>'min')::numeric = 3200, 'price spread');
  facets := public.catalog_facets('{"cities":["Arequipa"]}'::jsonb, 'zzqx', array['strings']);
  perform pg_temp.check((facets->>'total')::int = 1 and facets->'locations' @> '[{"city":"Lima","count":2}]', 'the place facet counts other places');
  perform pg_temp.check(facets->'seller_type' ? 'individual', 'seller counts');
end $$;

-- FIND 03 and 06: suggestions and menu counts only name what has listings.
select pg_temp.check(exists(select 1 from public.catalog_suggest('zzqxmar', 6) where brand = 'Zzqxmarca' and listings = 1), 'brand suggestion with its count');
select pg_temp.check(exists(select 1 from public.catalog_brand_counts() where brand = 'Zzqxmarca' and category = 'percussion'), 'brand counts per category');
select pg_temp.check(exists(select 1 from public.catalog_type_counts() where category = 'basses' and instrument_type = 'bass' and listings >= 1), 'type counts');

-- FIND 10: the price-drop and verified-first orders and the "Antes" price. Visitors read them on public_listings rows,
-- as the catalog does (launch audit A27: a whole listings row is not theirs to read).
select pg_temp.check((select l.previous_price_pen = 2300 and public.recent_price_drop_at(l) = l.price_dropped_at from public.public_listings l where id = '7f100000-0000-4000-8000-000000000003'), 'price before the drop, and its date for the order');
select pg_temp.check((select public.recent_price_drop_at(l) from public.public_listings l where id = '7f100000-0000-4000-8000-000000000001') is null, 'no drop, no date');
select pg_temp.check((select public.seller_verified_rank(l) from public.public_listings l where id = '7f100000-0000-4000-8000-000000000001') = 0, 'individual sellers rank after verified stores');

-- FIND 16: a listing that was public and no longer is gives only its category and type; others give nothing.
select pg_temp.check((select row(category, instrument_type)::text from public.listing_gone_hint('find-hidden')) = '(guitars,electric_guitar)', 'gone hint');
select pg_temp.check(not exists(select 1 from public.listing_gone_hint('find-strat')), 'a public listing is not gone');
select pg_temp.check(not exists(select 1 from public.listing_gone_hint('never-existed')), 'unknown address');

-- BIG 03 alerts: a saved search keeps the text query and matches with the same rule.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"7f000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.create_saved_search_alert('{"query":"strato zzqx","category":"guitars"}','immediate');
do $$ declare denied boolean := false; begin
  begin perform public.create_saved_search_alert('{"query":"STRATO zzqx","category":"guitars"}','daily'); exception when others then denied := sqlerrm like '%ALERT_ALREADY_EXISTS%'; end;
  perform pg_temp.check(denied, 'the query is compared without case');
end $$;
reset role;
select pg_temp.check(laria_private.listing_matches_saved_search((select l from public.listings l where id = '7f100000-0000-4000-8000-000000000001'), '{"query":"strato zzqx","category":"guitars"}'::jsonb), 'alert query matches');
select pg_temp.check(not laria_private.listing_matches_saved_search((select l from public.listings l where id = '7f100000-0000-4000-8000-000000000003'), '{"query":"strato zzqx"}'::jsonb), 'alert query does not match others');

rollback;
