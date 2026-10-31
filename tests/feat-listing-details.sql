-- Feature ideas, batch listing-details (docs/feature-ideas/listing-details.md): the condition scale (sell-10), the
-- listing flags and detail-writer registries, sale terms (sell-07, buy-02, sell-06), combos (buy-01) and store map
-- pins (buy-08). Local/test database only. Every fixture is rolled back.
begin;

create function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_code in sqlerrm) > 0 then return; end if;
    raise exception 'Expected % from [%], got: % (%)', p_code, p_sql, sqlerrm, sqlstate;
  end;
  raise exception 'Expected % from [%], but it succeeded', p_code, p_sql;
end $$;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;

create function pg_temp.id(p_name text) returns uuid language sql as $$ select current_setting('qa.' || p_name)::uuid $$;
create function pg_temp.remember(p_name text, p_id uuid) returns void language plpgsql as $$
begin perform set_config('qa.' || p_name, p_id::text, true); end $$;
create function pg_temp.as_user(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(p_name), 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.listing(p_name text) returns public.listings language sql security definer as $$
  select * from public.listings where id = pg_temp.id(p_name)
$$;
create function pg_temp.matches(p_alert uuid, p_listing uuid) returns bigint language sql security definer as $$
  select count(*) from laria_private.search_alert_matches where alert_id = p_alert and listing_id = p_listing
$$;
create function pg_temp.photos(p_listing uuid) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('image_url', 'https://example.invalid/' || p_listing || '-0.jpg', 'alt_text', 'Frente'),
    jsonb_build_object('image_url', 'https://example.invalid/' || p_listing || '-1.jpg', 'alt_text', 'Espalda'))
$$;
create function pg_temp.fields(p_owner uuid, p_store uuid, p_slug text, p_condition text) returns jsonb language sql as $$
  select jsonb_build_object('owner_user_id', p_owner, 'store_id', p_store, 'slug', p_slug, 'title', 'Guitarra ' || p_slug,
    'category', 'guitars', 'instrument_type', 'electric_guitar', 'brand', 'Fender', 'model', 'Stratocaster',
    'condition', p_condition, 'price_pen', 2500, 'city', 'Lima', 'region', 'Lima',
    'description', 'Guitarra en buen estado, con estuche y cable. Se entrega probada y afinada.',
    'marketplace_rules_accepted', true)
$$;

select pg_temp.remember('owner', 'd1100000-0000-4000-8000-000000000001'),
       pg_temp.remember('seller', 'd1100000-0000-4000-8000-000000000002'),
       pg_temp.remember('other', 'd1100000-0000-4000-8000-000000000003'),
       pg_temp.remember('buyer', 'd1100000-0000-4000-8000-000000000004'),
       pg_temp.remember('store', 'd1200000-0000-4000-8000-000000000001'),
       pg_temp.remember('store_other', 'd1200000-0000-4000-8000-000000000002'),
       pg_temp.remember('lp', 'd1300000-0000-4000-8000-000000000001'),
       pg_temp.remember('ls1', 'd1300000-0000-4000-8000-000000000002'),
       pg_temp.remember('ls2', 'd1300000-0000-4000-8000-000000000003'),
       pg_temp.remember('ls3', 'd1300000-0000-4000-8000-000000000004'),
       pg_temp.remember('lo', 'd1300000-0000-4000-8000-000000000005'),
       pg_temp.remember('sub_p', 'd1300000-0000-4000-8000-000000000006'),
       pg_temp.remember('sub_s', 'd1300000-0000-4000-8000-000000000007'),
       pg_temp.remember('sub_s2', 'd1300000-0000-4000-8000-000000000008');

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('d1100000-0000-4000-8000-000000000001','authenticated','authenticated','ld-owner@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Detalles","phone":"51999994001","city":"Lima","region":"Lima"}'),
 ('d1100000-0000-4000-8000-000000000002','authenticated','authenticated','ld-seller@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Particular Detalles","phone":"51999994002","city":"Lima","region":"Lima"}'),
 ('d1100000-0000-4000-8000-000000000003','authenticated','authenticated','ld-other@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Otro Dueño","phone":"51999994003","city":"Lima","region":"Lima"}'),
 ('d1100000-0000-4000-8000-000000000004','authenticated','authenticated','ld-buyer@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Comprador Detalles","phone":"51999994004","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,district,address,owner_user_id,status,listing_plan,is_verified) values
 ('d1200000-0000-4000-8000-000000000001','ld-tienda','Tienda Detalles','Tienda Detalles SAC','20999994001','ld-a@example.invalid','Contacto','Contacto','51999994001','Lima','Lima','Miraflores','Av. Larco 100','d1100000-0000-4000-8000-000000000001','active','free',true),
 ('d1200000-0000-4000-8000-000000000002','ld-tienda-otra','Otra Tienda','Otra Tienda SAC','20999994002','ld-b@example.invalid','Contacto B','Contacto B','51999994003','Lima','Lima','Surco','Av. QA 2','d1100000-0000-4000-8000-000000000003','active','free',true);

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at) values
 ('d1300000-0000-4000-8000-000000000001','ld-lp','Guitarra particular','individual','approved','guitars','electric_guitar','QA','Uno','Usado - buen estado',1000,'Lima','Lima','Particular Detalles','51999994002','Descripción de publicación válida con más de cuarenta caracteres.','d1100000-0000-4000-8000-000000000002',null,'self_service',now()),
 ('d1300000-0000-4000-8000-000000000002','ld-ls1','Guitarra tienda','store','approved','guitars','electric_guitar','QA','Dos','Exhibición o caja abierta',2000,'Lima','Lima','Contacto','51999994001','Descripción de publicación válida con más de cuarenta caracteres.','d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000001','self_service',now()),
 ('d1300000-0000-4000-8000-000000000003','ld-ls2','Estuche tienda','store','approved','guitars','other','QA','Tres','Nuevo',300,'Lima','Lima','Contacto','51999994001','Descripción de publicación válida con más de cuarenta caracteres.','d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000001','self_service',now()),
 ('d1300000-0000-4000-8000-000000000004','ld-ls3','Cable tienda','store','approved','audio','other','QA','Cuatro','Nuevo',50,'Lima','Lima','Contacto','51999994001','Descripción de publicación válida con más de cuarenta caracteres.','d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000001','self_service',now()),
 ('d1300000-0000-4000-8000-000000000005','ld-lo','Pedal otra tienda','store','approved','pedals','pedals','QA','Cinco','Nuevo',400,'Lima','Lima','Contacto B','51999994003','Descripción de publicación válida con más de cuarenta caracteres.','d1100000-0000-4000-8000-000000000003','d1200000-0000-4000-8000-000000000002','self_service',now());

insert into public.listing_photos (listing_id, image_url, sort_order)
select id, 'https://example.invalid/' || id || '-' || n || '.jpg', n
from public.listings, generate_series(0, 1) n
where id in (select pg_temp.id(name) from unnest(array['lp', 'ls1', 'ls2', 'ls3', 'lo']) name);

-- ------------------------------------------------------------------ sell-10: the condition scale

-- Direct edits of an approved listing's content need the controlled-edit switch, as Admin's editor has.
select set_config('app.allow_listing_admin_fields', 'true', true);
do $$ begin
  perform pg_temp.check((pg_temp.listing('lp')).condition = 'Muy bueno', 'an old value written by any path is mapped');
  perform pg_temp.check((pg_temp.listing('ls1')).condition = 'Exhibición o caja abierta', 'a store listing takes open box');
  perform pg_temp.expect_error($q$update public.listings set condition = 'Exhibición o caja abierta' where slug = 'ld-lp'$q$, 'LISTING_CONDITION_INVALID');
  perform pg_temp.expect_error($q$update public.listings set condition = 'Usado' where slug = 'ld-lp'$q$, 'LISTING_CONDITION_INVALID');
  perform pg_temp.expect_error($q$update public.listings set condition = 'Casi nuevo' where slug = 'ld-ls2'$q$, 'LISTING_CONDITION_INVALID');
  update public.listings set condition = 'Para reparar' where id = pg_temp.id('lp');
  perform pg_temp.check((pg_temp.listing('lp')).condition = 'Para reparar', 'every step of the scale is accepted');
  update public.listings set condition = 'Usado - con detalles' where id = pg_temp.id('lp');
  perform pg_temp.check((pg_temp.listing('lp')).condition = 'Bueno', 'an old value on update is mapped');
  perform pg_temp.check(laria_private.current_condition('Usado - buen estado') = 'Muy bueno', 'single-value map');
  perform pg_temp.check(laria_private.expand_search_conditions('"Usado - con detalles"')
    = '["Bueno", "Para reparar", "Regular"]'::jsonb, 'search map: con detalles');
  perform pg_temp.check(laria_private.expand_search_conditions('["Nuevo", "Usado - buen estado"]')
    = '["Como nuevo", "Excelente", "Exhibición o caja abierta", "Muy bueno", "Nuevo"]'::jsonb, 'search map: buen estado plus Nuevo');
  perform pg_temp.check(laria_private.expand_search_conditions('"Nuevo"') = '"Nuevo"'::jsonb, 'one value stays a string');
  perform pg_temp.check(laria_private.sanitize_listing_details('{"condition":"Usado - buen estado"}') = '{"condition":"Muy bueno"}', 'SKU details map');
  perform pg_temp.check(laria_private.sanitize_listing_details('{"condition":"Usado"}') = '{}', 'SKU details drop odd values');
end $$;
select set_config('app.allow_listing_admin_fields', '', true);

-- ------------------------------------------------------------------ the flags

do $$ begin
  update public.listings set ships_provinces = true, shipping_carriers = '{shalom}', can_try = true where id = pg_temp.id('ls1');
  perform pg_temp.check((pg_temp.listing('ls1')).listing_flags @> '{envia_provincia,se_puede_probar}'
    and not (pg_temp.listing('ls1')).listing_flags @> '{acepta_cambios}', 'flags follow the columns');
  update public.listings set listing_flags = '{acepta_cambios,con_garantia}' where id = pg_temp.id('ls1');
  perform pg_temp.check((pg_temp.listing('ls1')).listing_flags @> '{envia_provincia,se_puede_probar}'
    and not (pg_temp.listing('ls1')).listing_flags && '{acepta_cambios,con_garantia}', 'a written flag list is recomputed');
  update public.listings set ships_provinces = false, shipping_carriers = '{}' where id = pg_temp.id('ls1');
  perform pg_temp.check((pg_temp.listing('ls1')).listing_flags = '{se_puede_probar}', 'a flag leaves with its column');
end $$;

-- ------------------------------------------------------------------ sale terms: the writer

do $$ begin
  perform laria_private.write_listing_sale_terms(pg_temp.id('lp'), '{"price_mode":"negotiable","pickup":true,"pickup_area":"  San   Borja ","can_try":true,
    "lima_delivery":"buyer","ships_provinces":true,"carriers":["olva","shalom","olva"],"shipping_payment":"destination",
    "accepts_trades":true,"trade_wants":"Un pedal de delay o un ampli pequeño","trade_categories":["pedals","amplifiers"]}');
  perform pg_temp.check(row(l.price_mode, l.delivery_pickup, l.pickup_area, l.can_try, l.lima_delivery, l.ships_provinces, l.shipping_carriers,
      l.shipping_payment, l.accepts_trades, l.trade_wants, l.trade_categories)
    is not distinct from row('negotiable'::text, true, 'San Borja'::text, true, 'buyer'::text, true, '{olva,shalom}'::text[], 'destination'::text, true,
      'Un pedal de delay o un ampli pequeño'::text, '{amplifiers,pedals}'::text[]), 'the writer stores every term')
  from pg_temp.listing('lp') l;
  perform pg_temp.check((pg_temp.listing('lp')).listing_flags @> '{envia_provincia,se_puede_probar,acepta_cambios}', 'the terms set the flags');

  -- Absent keys keep their value; a switch turned off clears what depends on it.
  perform laria_private.write_listing_sale_terms(pg_temp.id('lp'), '{"ships_provinces":false,"accepts_trades":false,"price_mode":null}');
  perform pg_temp.check(row(l.price_mode, l.can_try, l.pickup_area, l.ships_provinces, l.shipping_carriers, l.shipping_payment, l.accepts_trades, l.trade_wants, l.trade_categories)
    is not distinct from row(null::text, true, 'San Borja'::text, false, '{}'::text[], null::text, false, null::text, '{}'::text[]), 'partial update and dependent fields')
  from pg_temp.listing('lp') l;

  perform pg_temp.expect_error(format($q$select laria_private.write_listing_sale_terms(%L, '{"price_mode":"auction"}')$q$, pg_temp.id('lp')), 'SALE_TERMS_INVALID');
  perform pg_temp.expect_error(format($q$select laria_private.write_listing_sale_terms(%L, '{"ships_provinces":true,"carriers":["dhl"]}')$q$, pg_temp.id('lp')), 'SALE_TERMS_INVALID');
  perform pg_temp.expect_error(format($q$select laria_private.write_listing_sale_terms(%L, '{"lima_delivery":"laria"}')$q$, pg_temp.id('lp')), 'SALE_TERMS_INVALID');
  perform pg_temp.expect_error(format($q$select laria_private.write_listing_sale_terms(%L, '{"accepts_trades":true,"trade_categories":["cars"]}')$q$, pg_temp.id('lp')), 'SALE_TERMS_INVALID');
  -- The categories are the catalog's, a later category included (discovery's andean, 20261207120000).
  perform laria_private.write_listing_sale_terms(pg_temp.id('lp'), '{"accepts_trades":true,"trade_categories":["andean","winds"]}');
  perform pg_temp.check((pg_temp.listing('lp')).trade_categories = '{andean,winds}', 'trade categories follow the catalog');
  perform laria_private.write_listing_sale_terms(pg_temp.id('lp'), '{"accepts_trades":false}');
  perform pg_temp.expect_error(format($q$select laria_private.write_listing_sale_terms(%L, '{"pickup":"maybe"}')$q$, pg_temp.id('lp')), 'SALE_TERMS_INVALID');
  perform pg_temp.expect_error(format($q$select laria_private.write_listing_sale_terms(%L, '{"price":1}')$q$, pg_temp.id('lp')), 'SALE_TERMS_INVALID');
  perform pg_temp.expect_error(format($q$select laria_private.write_listing_sale_terms(%L, '{"accepts_trades":true,"trade_wants":"Escríbeme al 999 888 777"}')$q$, pg_temp.id('lp')), 'SALE_TERMS_CONTACT_DETAILS');
  perform pg_temp.expect_error(format($q$select laria_private.write_listing_sale_terms(%L, '{"accepts_trades":true,"trade_wants":"%s"}')$q$, pg_temp.id('lp'), repeat('x', 201)), 'SALE_TERMS_INVALID');
  -- The same checks hold for a direct write.
  perform pg_temp.expect_error($q$update public.listings set shipping_carriers = '{olva}' where slug = 'ld-ls2'$q$, 'listings_shipping_carriers_check');
  perform pg_temp.expect_error($q$update public.listings set trade_wants = 'Algo' where slug = 'ld-ls2'$q$, 'listings_trade_wants_check');
end $$;

-- A change of terms is a change a buyer reads.
do $$ declare before timestamptz; begin
  update public.listings set content_changed_at = null where id = pg_temp.id('ls2');
  perform laria_private.write_listing_sale_terms(pg_temp.id('ls2'), '{"price_mode":"fixed"}');
  perform pg_temp.check((pg_temp.listing('ls2')).content_changed_at is not null, 'terms change bumps content_changed_at');
end $$;

-- ------------------------------------------------------------------ the detail registry

do $$ begin
  perform pg_temp.expect_error(format($q$select laria_private.apply_listing_details(%L, '{"warranty":{}}')$q$, pg_temp.id('lp')), 'LISTING_DETAILS_INVALID');
  perform pg_temp.expect_error(format($q$select laria_private.apply_listing_details(%L, '[]')$q$, pg_temp.id('lp')), 'LISTING_DETAILS_INVALID');
  perform laria_private.apply_listing_details(pg_temp.id('lp'), null);
  perform laria_private.apply_listing_details(pg_temp.id('lp'), '{"sale_terms":{"price_mode":"fixed"}}');
  perform pg_temp.check((pg_temp.listing('lp')).price_mode = 'fixed', 'the dispatcher runs the writer');
end $$;

-- update_owned_listing_details: the owner only, on a listing still editable.
set local role authenticated;
select pg_temp.as_user('other');
do $$ begin
  perform pg_temp.expect_error(format($q$select public.update_owned_listing_details(%L, '{"sale_terms":{"can_try":false}}')$q$, pg_temp.id('lp')), 'LISTING_NOT_OWNED');
  perform pg_temp.expect_error(format($q$select laria_private.apply_listing_details(%L, '{}')$q$, pg_temp.id('lp')), 'permission denied');
  perform pg_temp.expect_error(format($q$select public.complete_listing_submission(%L, 'listing', '{}', '[]', '{}')$q$, pg_temp.id('sub_p')), 'permission denied');
end $$;
select pg_temp.as_user('seller');
do $$ begin
  perform public.update_owned_listing_details(pg_temp.id('lp'), '{"sale_terms":{"can_try":false,"pickup":false}}');
  perform pg_temp.check(not (pg_temp.listing('lp')).can_try and (pg_temp.listing('lp')).pickup_area is null, 'the owner edits the terms');
  -- A direct owner update cannot forge a flag.
  update public.listings set listing_flags = '{acepta_cambios}' where id = pg_temp.id('lp');
  perform pg_temp.check(not ((pg_temp.listing('lp')).listing_flags @> '{acepta_cambios}'), 'owner cannot forge a flag');
end $$;
reset role;
-- The trade categories check runs as whoever writes the row (here the service role, as a submission does).
set local role service_role;
do $$ begin
  update public.listings set accepts_trades = true, trade_categories = '{andean}' where id = pg_temp.id('lp');
  perform pg_temp.check((pg_temp.listing('lp')).trade_categories = '{andean}', 'an API role passes the category check');
  perform pg_temp.expect_error(format($q$update public.listings set trade_categories = '{cars}' where id = %L$q$, pg_temp.id('lp')), 'listings_trade_categories_check');
  update public.listings set accepts_trades = false, trade_categories = '{}' where id = pg_temp.id('lp');
end $$;
reset role;
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set status = 'sold', sold_at = now() where id = pg_temp.id('ls3');
select set_config('app.allow_listing_admin_fields', '', true);
set local role authenticated;
select pg_temp.as_user('owner');
do $$ begin
  perform pg_temp.expect_error(format($q$select public.update_owned_listing_details(%L, '{"sale_terms":{"can_try":true}}')$q$, pg_temp.id('ls3')), 'LISTING_NOT_EDITABLE');
end $$;
reset role;
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set status = 'approved', sold_at = null where id = pg_temp.id('ls3');
select set_config('app.allow_listing_admin_fields', '', true);

-- ------------------------------------------------------------------ saved searches and the catalog

do $$ begin
  perform pg_temp.check(laria_private.normalize_saved_search('{"options":["se_puede_probar","envia_provincia","se_puede_probar"]}')
    = '{"options":["envia_provincia","se_puede_probar"]}', 'options are sorted and deduplicated');
  perform pg_temp.check(laria_private.normalize_saved_search('{"options":"acepta_cambios"}') = '{"options":["acepta_cambios"]}', 'one option');
  perform pg_temp.check(laria_private.normalize_saved_search('{"options":[]}') = '{}', 'no option');
  perform pg_temp.expect_error($q$select laria_private.normalize_saved_search('{"options":["con_descuento"]}')$q$, 'ALERT_FILTERS_INVALID');
  perform pg_temp.expect_error($q$select laria_private.normalize_saved_search('{"options":[1]}')$q$, 'ALERT_FILTERS_INVALID');
  perform pg_temp.expect_error($q$select laria_private.normalize_saved_search('{"condition":"Usado"}')$q$, 'ALERT_FILTERS_INVALID');
  perform pg_temp.check(laria_private.normalize_saved_search('{"condition":"Usado - con detalles"}')
    = '{"condition":["Bueno","Para reparar","Regular"]}', 'an old condition in a new alert expands');
  perform pg_temp.check(laria_private.normalize_saved_search('{"condition":"Exhibición o caja abierta"}')
    = '{"condition":"Exhibición o caja abierta"}', 'open box is searchable');

  perform pg_temp.check(laria_private.listing_matches_saved_search(pg_temp.listing('ls1'), '{"options":["se_puede_probar"]}'), 'flag matches');
  perform pg_temp.check(not laria_private.listing_matches_saved_search(pg_temp.listing('ls1'), '{"options":["se_puede_probar","acepta_cambios"]}'), 'options are all-of');
  perform pg_temp.check(laria_private.listing_matches_saved_search(pg_temp.listing('ls1'), '{"condition":["Como nuevo","Exhibición o caja abierta"]}'), 'condition list matches');

  perform pg_temp.check((public.catalog_facets('{}')->'options'->>'se_puede_probar')::int >= 1, 'facets count a flag');
  perform pg_temp.check((public.catalog_facets('{"options":["se_puede_probar"]}')->>'total')::int
    = (public.catalog_facets('{}')->'options'->>'se_puede_probar')::int, 'a flag''s count is the total once chosen');
  perform pg_temp.check((public.catalog_facets('{"options":["se_puede_probar","envia_provincia"]}')->>'total')::int
    <= (public.catalog_facets('{"options":["se_puede_probar"]}')->>'total')::int, 'flags narrow');
  perform pg_temp.check((public.catalog_facets('{"conditions":["Usado - buen estado"]}')->>'total')::int
    = (public.catalog_facets('{"conditions":["Exhibición o caja abierta","Como nuevo","Excelente","Muy bueno"]}')->>'total')::int,
    'an old condition in a link counts as its part of the scale');
end $$;

-- An alert on a flag finds a store listing that goes public at once, because its details are stored first.
set local role authenticated;
select pg_temp.as_user('buyer');
do $$ declare alert public.saved_search_alerts; begin
  alert := public.create_saved_search_alert('{"options":["envia_provincia"],"category":"guitars"}', 'daily');
  perform pg_temp.remember('alert', alert.id);
  perform pg_temp.expect_error($q$select public.create_saved_search_alert('{"options":["no_existe"]}', 'daily')$q$, 'ALERT_FILTERS_INVALID');
end $$;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
do $$ declare result uuid; begin
  result := public.complete_listing_submission(pg_temp.id('sub_s'), 'store_listing',
    pg_temp.fields(pg_temp.id('owner'), pg_temp.id('store'), 'ld-sub-s', 'Excelente'), pg_temp.photos(pg_temp.id('sub_s')),
    '{"sale_terms":{"ships_provinces":true,"carriers":["shalom"],"shipping_payment":"origin","price_mode":"fixed"}}');
  perform pg_temp.check(result = pg_temp.id('sub_s'), 'submission returns its id');
  perform pg_temp.check((pg_temp.listing('sub_s')).status = 'approved' and (pg_temp.listing('sub_s')).ships_provinces, 'verified store listing is public with its terms');
  perform pg_temp.check(pg_temp.matches(pg_temp.id('alert'), pg_temp.id('sub_s')) = 1, 'the alert on a flag found it');

  -- A retry returns the listing untouched.
  result := public.complete_listing_submission(pg_temp.id('sub_s'), 'store_listing',
    pg_temp.fields(pg_temp.id('owner'), pg_temp.id('store'), 'ld-sub-s', 'Excelente'), pg_temp.photos(pg_temp.id('sub_s')),
    '{"sale_terms":{"ships_provinces":false}}');
  perform pg_temp.check((pg_temp.listing('sub_s')).ships_provinces, 'a retry does not reapply details');

  -- A store listing without the flag is not matched.
  perform public.complete_listing_submission(pg_temp.id('sub_s2'), 'store_listing',
    pg_temp.fields(pg_temp.id('owner'), pg_temp.id('store'), 'ld-sub-s2', 'Nuevo'), pg_temp.photos(pg_temp.id('sub_s2')), '{}');
  perform pg_temp.check(pg_temp.matches(pg_temp.id('alert'), pg_temp.id('sub_s2')) = 0, 'no flag, no match');

  -- A Particular's listing is pending, with its terms; open box is for stores.
  perform pg_temp.expect_error(format($q$select public.complete_listing_submission(%L, 'listing', %L, %L, '{}')$q$, pg_temp.id('sub_p'),
    pg_temp.fields(pg_temp.id('seller'), null, 'ld-sub-p', 'Exhibición o caja abierta'), pg_temp.photos(pg_temp.id('sub_p'))), 'LISTING_CONDITION_INVALID');
  perform public.complete_listing_submission(pg_temp.id('sub_p'), 'listing',
    pg_temp.fields(pg_temp.id('seller'), null, 'ld-sub-p', 'Regular'), pg_temp.photos(pg_temp.id('sub_p')),
    '{"sale_terms":{"accepts_trades":true,"trade_wants":"Un bajo de 4 cuerdas"}}');
  perform pg_temp.check((pg_temp.listing('sub_p')).status = 'pending' and (pg_temp.listing('sub_p')).accepts_trades, 'particular listing keeps its terms');
  perform pg_temp.expect_error(format($q$select public.complete_listing_submission(%L, 'store', '{}', '[]', '{}')$q$, gen_random_uuid()), 'Invalid submission kind');
  -- Details that fail roll the whole submission back.
  perform pg_temp.expect_error(format($q$select public.complete_listing_submission(%L, 'listing', %L, %L, '{"sale_terms":{"accepts_trades":true,"trade_wants":"wa.me/51999999999"}}')$q$,
    'd1300000-0000-4000-8000-000000000009', pg_temp.fields(pg_temp.id('seller'), null, 'ld-sub-x', 'Bueno'), pg_temp.photos('d1300000-0000-4000-8000-000000000009')), 'SALE_TERMS_CONTACT_DETAILS');
end $$;
reset role;
do $$ begin
  perform pg_temp.check(not exists (select 1 from public.listings where id = 'd1300000-0000-4000-8000-000000000009'), 'the failed submission left nothing');
end $$;

-- Duplicating a listing keeps its terms.
set local role authenticated;
select pg_temp.as_user('owner');
do $$ declare copy public.listings; begin
  copy := public.copy_owned_listing(pg_temp.id('sub_s'), 'duplicate');
  perform pg_temp.check(copy.ships_provinces and copy.shipping_carriers = '{shalom}' and copy.price_mode = 'fixed'
    and copy.listing_flags @> '{envia_provincia}', 'the copy keeps the terms and flags');
end $$;

-- Search events may carry the options.
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ begin
  perform laria_private.record_marketplace_event_service('search', gen_random_uuid(), gen_random_uuid(), null, null, null, 'catalog',
    '{"query":"guitarra","filters":{"options":["envia_provincia"]},"result_count":3}');
  perform pg_temp.expect_error($q$select laria_private.record_marketplace_event_service('search', gen_random_uuid(), gen_random_uuid(), null, null, null, 'catalog',
    '{"query":"guitarra","filters":{"colour":"red"},"result_count":3}')$q$, 'Invalid search metadata');
end $$;

-- ------------------------------------------------------------------ buy-01: combos

set local role authenticated;
select pg_temp.as_user('seller');
do $$ declare offer public.seller_bundle_offers; begin
  offer := public.set_bundle_offer(null, 10, 2);
  perform pg_temp.check(offer.owner_user_id = pg_temp.id('seller') and offer.discount_percent = 10, 'a Particular declares an offer');
  offer := public.set_bundle_offer(null, 15, 3);
  perform pg_temp.check((select count(*) from public.seller_bundle_offers where owner_user_id = pg_temp.id('seller')) = 1, 'one offer per seller');
  perform pg_temp.expect_error($q$select public.set_bundle_offer(null, 50, 2)$q$, 'BUNDLE_OFFER_INVALID');
  perform pg_temp.expect_error(format($q$select public.set_bundle_offer(%L, 10, 2)$q$, pg_temp.id('store')), 'BUNDLE_OFFER_NOT_ALLOWED');
  perform pg_temp.expect_error($q$insert into public.seller_bundle_offers(owner_user_id, discount_percent) values (auth.uid(), 20)$q$, 'permission denied');
end $$;
select pg_temp.as_user('owner');
do $$ begin
  perform public.set_bundle_offer(pg_temp.id('store'), 10, 2);
  perform pg_temp.expect_error($q$select public.set_bundle_offer(null, 10, 2)$q$, 'BUNDLE_OFFER_NOT_ALLOWED');

  perform pg_temp.check(public.set_listing_companions(pg_temp.id('ls1'), array[pg_temp.id('ls2'), pg_temp.id('ls3'), pg_temp.id('ls2')]) = 2, 'companions set, duplicates once');
  perform pg_temp.expect_error(format($q$select public.set_listing_companions(%L, array[%L]::uuid[])$q$, pg_temp.id('ls1'), pg_temp.id('lo')), 'COMPANIONS_INVALID');
  perform pg_temp.expect_error(format($q$select public.set_listing_companions(%L, array[%L]::uuid[])$q$, pg_temp.id('ls1'), pg_temp.id('ls1')), 'COMPANIONS_INVALID');
  perform pg_temp.expect_error(format($q$select public.set_listing_companions(%L, array[%L]::uuid[])$q$, pg_temp.id('lo'), pg_temp.id('ls2')), 'LISTING_NOT_OWNED');
  perform pg_temp.check((select array_agg(companion_id order by sort_order) from public.listing_companions where listing_id = pg_temp.id('ls1'))
    = array[pg_temp.id('ls2'), pg_temp.id('ls3')], 'companions keep their order');
end $$;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform pg_temp.check((select count(*) from public.seller_bundle_offers) >= 2, 'anyone reads offers');
  perform pg_temp.check((select count(*) from public.listing_companions where listing_id = pg_temp.id('ls1')) = 2, 'anyone reads public companions');
end $$;
reset role;
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set status = 'hidden', hidden_source = 'owner', hidden_at = now() where id = pg_temp.id('ls3');
select set_config('app.allow_listing_admin_fields', '', true);
set local role anon;
do $$ begin
  perform pg_temp.check((select count(*) from public.listing_companions where listing_id = pg_temp.id('ls1')) = 1, 'a hidden companion is not shown');
end $$;

-- ------------------------------------------------------------------ buy-08: store map pins

reset role;
set local role authenticated;
select pg_temp.as_user('owner');
do $$ begin
  perform public.set_own_store_map_pin(pg_temp.id('store'), -12.1211234567, -77.0297);
  perform pg_temp.expect_error(format($q$select public.set_own_store_map_pin(%L, 40.4, -3.7)$q$, pg_temp.id('store')), 'STORE_MAP_PIN_INVALID');
  perform pg_temp.expect_error(format($q$select public.set_own_store_map_pin(%L, -12.1, null)$q$, pg_temp.id('store')), 'STORE_MAP_PIN_INVALID');
  perform pg_temp.expect_error(format($q$select public.set_own_store_map_pin(%L, -12.1, -77.0)$q$, pg_temp.id('store_other')), 'STORE_NOT_OWNED');
end $$;
reset role;
do $$ begin
  perform pg_temp.check((select map_latitude = -12.121123 and public_map_latitude is null from public.stores where id = pg_temp.id('store')),
    'the pin is private until the store shows its address');
  update public.stores set show_address = true where id = pg_temp.id('store');
  perform pg_temp.check((select public_map_latitude = -12.121123 and public_map_longitude = -77.0297 from public.stores where id = pg_temp.id('store')),
    'the pin is public with the address');
end $$;
set local role anon;
do $$ begin
  perform pg_temp.check((select public_map_latitude from public.stores where id = pg_temp.id('store')) = -12.121123, 'anon reads the public pin');
  perform pg_temp.expect_error($q$select map_latitude from public.stores$q$, 'permission denied');
end $$;

-- ------------------------------------------------------------------ discovery's maker marks, saved with the listing

reset role;
insert into public.store_maker_profiles(store_id, kind, craft_city) values (pg_temp.id('store'), 'taller', 'Ayacucho');
select pg_temp.remember('sub_m', 'd1300000-0000-4000-8000-000000000010'),
       pg_temp.remember('sub_m2', 'd1300000-0000-4000-8000-000000000011'),
       pg_temp.remember('sub_a', 'd1300000-0000-4000-8000-000000000012');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
do $$ begin
  perform public.complete_listing_submission(pg_temp.id('sub_m'), 'store_listing',
    pg_temp.fields(pg_temp.id('owner'), pg_temp.id('store'), 'ld-sub-m', 'Nuevo'), pg_temp.photos(pg_temp.id('sub_m')),
    '{"maker":{"handmade":true,"made_to_order_weeks":6,"artist_note":null}}');
  perform pg_temp.check((select handmade and made_to_order_weeks = 6 from public.listing_maker_details where listing_id = pg_temp.id('sub_m')),
    'a maker store saves its marks with the listing');
  -- Discovery's rules and errors, before anything is saved.
  perform pg_temp.expect_error(format($q$select public.complete_listing_submission(%L, 'store_listing', %L, %L, '{"maker":{"handmade":false,"made_to_order_weeks":30,"artist_note":null}}')$q$,
    pg_temp.id('sub_m2'), pg_temp.fields(pg_temp.id('owner'), pg_temp.id('store'), 'ld-sub-m2', 'Nuevo'), pg_temp.photos(pg_temp.id('sub_m2'))), 'MADE_TO_ORDER_INVALID');
  perform pg_temp.expect_error(format($q$select public.complete_listing_submission(%L, 'store_listing', %L, %L, '{"maker":{"handmade":false,"made_to_order_weeks":null,"artist_note":"Usado en la gira"}}')$q$,
    pg_temp.id('sub_m2'), pg_temp.fields(pg_temp.id('owner'), pg_temp.id('store'), 'ld-sub-m2', 'Nuevo'), pg_temp.photos(pg_temp.id('sub_m2'))), 'ARTIST_REQUIRED');
  perform pg_temp.expect_error(format($q$select public.complete_listing_submission(%L, 'listing', %L, %L, '{"maker":{"handmade":true}}')$q$,
    pg_temp.id('sub_a'), pg_temp.fields(pg_temp.id('seller'), null, 'ld-sub-a', 'Bueno'), pg_temp.photos(pg_temp.id('sub_a'))), 'MAKER_REQUIRED');
  perform pg_temp.expect_error(format($q$select public.complete_listing_submission(%L, 'listing', %L, %L, '{"maker":{"handmade":"yes"}}')$q$,
    pg_temp.id('sub_a'), pg_temp.fields(pg_temp.id('seller'), null, 'ld-sub-a', 'Bueno'), pg_temp.photos(pg_temp.id('sub_a'))), 'LISTING_DETAILS_INVALID');
end $$;
reset role;
do $$ begin
  perform pg_temp.check(not exists (select 1 from public.listings where id in (pg_temp.id('sub_m2'), pg_temp.id('sub_a'))), 'refused marks leave no listing');
end $$;
insert into public.artist_profiles(user_id, slug, display_name, verified_by) values (pg_temp.id('seller'), 'ld-artista', 'Artista Detalles', pg_temp.id('owner'));
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
do $$ begin
  perform public.complete_listing_submission(pg_temp.id('sub_a'), 'listing',
    pg_temp.fields(pg_temp.id('seller'), null, 'ld-sub-a', 'Bueno'), pg_temp.photos(pg_temp.id('sub_a')),
    '{"maker":{"handmade":false,"made_to_order_weeks":null,"artist_note":"  Usado en la   gira 2024 "}}');
  perform pg_temp.check((select artist_note = 'Usado en la gira 2024' and not handmade from public.listing_maker_details where listing_id = pg_temp.id('sub_a')),
    'a verified artist saves the note, spaces tidied');
end $$;
reset role;
-- A duplicate keeps the maker's marks; the owner clears them through the same writer.
set local role authenticated;
select pg_temp.as_user('owner');
do $$ declare copy public.listings; begin
  copy := public.copy_owned_listing(pg_temp.id('sub_m'), 'duplicate');
  perform pg_temp.check((select handmade and made_to_order_weeks = 6 from public.listing_maker_details where listing_id = copy.id), 'the copy keeps the marks');
  perform public.update_owned_listing_details(pg_temp.id('sub_m'), '{"maker":{"handmade":false,"made_to_order_weeks":null,"artist_note":null}}');
  perform pg_temp.check(not exists (select 1 from public.listing_maker_details where listing_id = pg_temp.id('sub_m')), 'clearing every mark removes the row');
end $$;
select pg_temp.as_user('seller');
do $$ declare copy public.listings; begin
  copy := public.copy_owned_listing(pg_temp.id('sub_a'), 'duplicate');
  perform pg_temp.check(not exists (select 1 from public.listing_maker_details where listing_id = copy.id), 'an artist note is not copied');
end $$;

reset role;
rollback;
