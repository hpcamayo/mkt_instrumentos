-- Effortless Laria, inventory batch fixes (docs/ux-effortless/inventory.md): fix-06, the Inventario search matches
-- what its box promises; fix-09, the "En revisión" filter opens what the tile counts. Local/test database only. Every
-- fixture is rolled back.
begin;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;

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

create function pg_temp.as_user(p_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.skus(p_filters jsonb) returns text[] language sql as $$
  select coalesce(array_agg(value->>'merchant_sku' order by value->>'merchant_sku'), '{}')
  from jsonb_array_elements(public.get_inventory_page(p_filters)->'items')
$$;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e5600000-0000-4000-8000-000000000001','authenticated','authenticated','uxinv-owner-a@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Inventario A","phone":"51999995001","city":"Lima","region":"Lima"}'),
 ('e5600000-0000-4000-8000-000000000002','authenticated','authenticated','uxinv-owner-b@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Inventario B","phone":"51999995002","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('e6600000-0000-4000-8000-000000000001','uxinv-a','Inventario UX A','Inventario UX A SAC','20999996601','uxinv-a@example.invalid','Contacto A','Contacto A','51999995001','Lima','Lima','Av. QA 1','e5600000-0000-4000-8000-000000000001','active','free',true),
 ('e6600000-0000-4000-8000-000000000002','uxinv-b','Inventario UX B','Inventario UX B SAC','20999996602','uxinv-b@example.invalid','Contacto B','Contacto B','51999995002','Lima','Lima','Av. QA 2','e5600000-0000-4000-8000-000000000002','active','free',true);

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at) values
 ('e7600000-0000-4000-8000-000000000001','uxinv-l1','Pedal de distorsión clásico','store','approved','pedals','pedals','Boss','DS-1','Nuevo',300,'Lima','Lima','Contacto A','51999995001','Descripción de inventario válida con más de cuarenta caracteres.','e5600000-0000-4000-8000-000000000001','e6600000-0000-4000-8000-000000000001','self_service',now()),
 ('e7600000-0000-4000-8000-000000000002','uxinv-l2','Bajo eléctrico de cuatro cuerdas','store','approved','basses','bass','Ibanez','SR300E','Nuevo',2100,'Lima','Lima','Contacto A','51999995001','Descripción de inventario válida con más de cuarenta caracteres.','e5600000-0000-4000-8000-000000000001','e6600000-0000-4000-8000-000000000001','self_service',now()),
 ('e7600000-0000-4000-8000-000000000003','uxinv-l3','Teclado en revisión','store','pending','keyboards','keyboard','Yamaha','PSR-E373','Nuevo',1200,'Lima','Lima','Contacto A','51999995001','Descripción de inventario válida con más de cuarenta caracteres.','e5600000-0000-4000-8000-000000000001','e6600000-0000-4000-8000-000000000001','self_service',now()),
 ('e7600000-0000-4000-8000-000000000004','uxinv-l4','Pedal con otra marca','store','approved','pedals','pedals','Boss','TU-3','Nuevo',350,'Lima','Lima','Contacto B','51999995002','Descripción de inventario válida con más de cuarenta caracteres.','e5600000-0000-4000-8000-000000000002','e6600000-0000-4000-8000-000000000002','self_service',now());

insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/uxinv-' || l.slug || '-' || n || '.jpg', n
from public.listings l cross join generate_series(0, 1) n
where l.slug like 'uxinv-%';

-- A pending change on the approved bass (fix-09: "changes in review" belongs in the tile and its filter).
insert into public.listing_revisions (listing_id, owner_user_id, store_id, status, changed_fields, brand)
values ('e7600000-0000-4000-8000-000000000002', 'e5600000-0000-4000-8000-000000000001', 'e6600000-0000-4000-8000-000000000001',
  'pending', array['brand'], 'Ibanez');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}', true);
select public.admin_set_store_inventory_enabled('e6600000-0000-4000-8000-000000000001', true, 'Piloto UX');
select public.admin_set_store_inventory_enabled('e6600000-0000-4000-8000-000000000002', true, 'Piloto UX');

select pg_temp.as_user('e5600000-0000-4000-8000-000000000001');
select public.create_inventory_item('{"merchant_sku":"PED-001","product_name":"Distorsión naranja","listing_id":"e7600000-0000-4000-8000-000000000001","external_reference":"4957054010202"}'::jsonb, 4, 'qa-uxinv-1');
select public.create_inventory_item('{"merchant_sku":"BAJ-002","product_name":"Bajo 4 cuerdas","listing_id":"e7600000-0000-4000-8000-000000000002"}'::jsonb, 1, 'qa-uxinv-2');
select public.create_inventory_item('{"merchant_sku":"TEC-003","product_name":"Teclado portátil","listing_id":"e7600000-0000-4000-8000-000000000003"}'::jsonb, 2, 'qa-uxinv-3');
select public.create_inventory_item('{"merchant_sku":"CUE-004","product_name":"Cuerdas para guitarra","variant_label":"Calibre 10-46"}'::jsonb, 30, 'qa-uxinv-4');

-- ------------------------------------------------------------------ fix-06: search

do $$ begin
  perform pg_temp.check(pg_temp.skus('{"q":"PED-001"}') = array['PED-001'], 'the SKU still matches');
  perform pg_temp.check(pg_temp.skus('{"q":"naranja"}') = array['PED-001'], 'the name still matches');
  perform pg_temp.check(pg_temp.skus('{"q":"boss"}') = array['PED-001'], 'the linked publication''s brand matches');
  perform pg_temp.check(pg_temp.skus('{"q":"sr300e"}') = array['BAJ-002'], 'the model matches, in any case');
  perform pg_temp.check(pg_temp.skus('{"q":"4957054010202"}') = array['PED-001'], 'a barcode kept as external reference matches');
  perform pg_temp.check(pg_temp.skus('{"q":"10-46"}') = array['CUE-004'], 'the variant matches');
  perform pg_temp.check(pg_temp.skus('{"q":"distorsion"}') = array['PED-001'], 'accents do not matter');
  perform pg_temp.check(pg_temp.skus('{"q":"clásico"}') = array['PED-001'], 'the publication title matches');
  perform pg_temp.check(pg_temp.skus('{"q":"boss  ds-1"}') = array['PED-001'], 'several words, extra spaces, all must appear');
  perform pg_temp.check(pg_temp.skus('{"q":"ds-1 boss"}') = array['PED-001'], 'word order does not matter');
  perform pg_temp.check(pg_temp.skus('{"q":"boss yamaha"}') = '{}', 'every word must appear');
  perform pg_temp.check(pg_temp.skus('{"q":"%"}') = '{}' and pg_temp.skus('{"q":"_"}') = '{}', 'wildcards are plain characters');
  perform pg_temp.check(pg_temp.skus('{"q":"tu-3"}') = '{}', 'another store''s publications never match');
  perform pg_temp.check(pg_temp.skus('{"q":"cuerdas","stock":"in_stock"}') = array['BAJ-002', 'CUE-004'], 'search combines with filters');
end $$;

-- ------------------------------------------------------------------ fix-09: the review filter follows the tile

do $$ declare summary jsonb := public.get_inventory_summary(); expected text[] := array['BAJ-002', 'TEC-003']; begin
  perform pg_temp.check(pg_temp.skus('{"publication":"in_review"}') = expected,
    'in_review selects pending publications and publications with changes in review: ' || pg_temp.skus('{"publication":"in_review"}')::text);
  perform pg_temp.check((summary->>'in_review')::integer = cardinality(expected), 'the tile counts exactly what the filter opens');
  perform pg_temp.check(pg_temp.skus('{"publication":"pending"}') = array['TEC-003'], 'pending alone is unchanged');
  perform pg_temp.expect_error($q$select public.get_inventory_page('{"publication":"nope"}')$q$, 'INVENTORY_FILTER_INVALID');
end $$;

-- ------------------------------------------------------------------ boundaries

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform pg_temp.expect_error($q$select laria_private.inventory_search_matches('a', 'a')$q$, 'permission denied');
end $$;
reset role;

rollback;
