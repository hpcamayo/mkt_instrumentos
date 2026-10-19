-- Effortless Laria, batch "stores" (docs/ux-effortless/stores.md): list-12 (show_address, opening_hours), find-13
-- (get_public_store_directory) and find-14 (get_store_listing_categories), migration
-- 20261106140000_ux_store_location.sql. Local/test database only. Every fixture is rolled back.
--
-- What the database enforces and this file checks: the new columns' defaults and check; that owners (and only owners)
-- can change them through the existing store update path; that a store that is not active, address included, is
-- unreadable by anon; that the directory lists active stores only and returns no address or business data; that the
-- category counts follow row-level security. What it does not enforce: hiding the raw address column of an active
-- store from the API when show_address is false (anon keeps the table-level SELECT it had before); the application
-- renders the address only through publicStoreLocation (tests/ux-stores-storefront.test.cjs).
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
create function pg_temp.as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', '{"role":"anon"}', true); end $$;

-- Reads a store row as the superuser, whatever the current role can see.
create function pg_temp.store(p_id uuid) returns public.stores language sql security definer as $$
  select * from public.stores where id = p_id
$$;

select pg_temp.remember('owner_a', 'e5600000-0000-4000-8000-000000000001'),
       pg_temp.remember('owner_b', 'e5600000-0000-4000-8000-000000000002'),
       pg_temp.remember('owner_c', 'e5600000-0000-4000-8000-000000000003'),
       pg_temp.remember('store_a', 'e6600000-0000-4000-8000-000000000001'),
       pg_temp.remember('store_b', 'e6600000-0000-4000-8000-000000000002'),
       pg_temp.remember('store_c', 'e6600000-0000-4000-8000-000000000003');

-- ------------------------------------------------------------------ fixtures

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e5600000-0000-4000-8000-000000000001','authenticated','authenticated','ssf-owner-a@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueña Tienda A","phone":"51999995001","city":"Lima","region":"Lima"}'),
 ('e5600000-0000-4000-8000-000000000002','authenticated','authenticated','ssf-owner-b@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Tienda B","phone":"51999995002","city":"Arequipa","region":"Arequipa"}'),
 ('e5600000-0000-4000-8000-000000000003','authenticated','authenticated','ssf-owner-c@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Tienda C","phone":"51999995003","city":"Cusco","region":"Cusco"}');

-- A: active and verified. B: in review. C: active, not verified.
insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,district,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('e6600000-0000-4000-8000-000000000001','ssf-tienda-a','SSF Tienda A','SSF Tienda A SAC','20999996601','ssf-a@example.invalid','Contacto A','Contacto A','51999995001','Lima','Miraflores','Lima','Av. Larco 101','e5600000-0000-4000-8000-000000000001','active','free',true),
 ('e6600000-0000-4000-8000-000000000002','ssf-tienda-b','SSF Tienda B','SSF Tienda B SAC','20999996602','ssf-b@example.invalid','Contacto B','Contacto B','51999995002','Arequipa','Cercado','Arequipa','Calle Mercaderes 202','e5600000-0000-4000-8000-000000000002','pending','free',false),
 ('e6600000-0000-4000-8000-000000000003','ssf-tienda-c','SSF Tienda C','SSF Tienda C SAC','20999996603','ssf-c@example.invalid','Contacto C','Contacto C','51999995003','Cusco',null,'Cusco','Av. Sol 303','e5600000-0000-4000-8000-000000000003','active','free',false);

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at) values
 ('e7600000-0000-4000-8000-000000000001','ssf-a1','Guitarra SSF uno','store','approved','guitars','electric_guitar','Fender','Uno','Nuevo',3000,'Lima','Lima','Contacto A','51999995001','Descripción de inventario válida con más de cuarenta caracteres.','e5600000-0000-4000-8000-000000000001','e6600000-0000-4000-8000-000000000001','self_service',now()),
 ('e7600000-0000-4000-8000-000000000002','ssf-a2','Guitarra SSF dos','store','approved','guitars','acoustic_guitar','Yamaha','Dos','Nuevo',900,'Lima','Lima','Contacto A','51999995001','Descripción de inventario válida con más de cuarenta caracteres.','e5600000-0000-4000-8000-000000000001','e6600000-0000-4000-8000-000000000001','self_service',now()),
 ('e7600000-0000-4000-8000-000000000003','ssf-a3','Pedal SSF tres','store','approved','pedals','pedals','Boss','Tres','Nuevo',400,'Lima','Lima','Contacto A','51999995001','Descripción de inventario válida con más de cuarenta caracteres.','e5600000-0000-4000-8000-000000000001','e6600000-0000-4000-8000-000000000001','self_service',now()),
 ('e7600000-0000-4000-8000-000000000004','ssf-a4','Bajo SSF cuatro','store','pending','basses','bass','Ibanez','Cuatro','Nuevo',1500,'Lima','Lima','Contacto A','51999995001','Descripción de inventario válida con más de cuarenta caracteres.','e5600000-0000-4000-8000-000000000001','e6600000-0000-4000-8000-000000000001','self_service',now()),
 ('e7600000-0000-4000-8000-000000000005','ssf-b1','Teclado SSF cinco','store','approved','keyboards','keyboard','Roland','Cinco','Nuevo',2500,'Arequipa','Arequipa','Contacto B','51999995002','Descripción de inventario válida con más de cuarenta caracteres.','e5600000-0000-4000-8000-000000000002','e6600000-0000-4000-8000-000000000002','self_service',now());

-- ------------------------------------------------------------------ list-12: columns and check

select pg_temp.check((pg_temp.store(pg_temp.id('store_a'))).show_address = false, 'show_address is off by default');
select pg_temp.check((pg_temp.store(pg_temp.id('store_a'))).opening_hours is null, 'opening_hours starts empty');
select pg_temp.expect_error($$update public.stores set show_address = null where slug = 'ssf-tienda-a'$$, 'null value in column "show_address"');
select pg_temp.expect_error($$update public.stores set opening_hours = '' where slug = 'ssf-tienda-a'$$, 'stores_opening_hours_length');
select pg_temp.expect_error($$update public.stores set opening_hours = '   ' where slug = 'ssf-tienda-a'$$, 'stores_opening_hours_length');
select pg_temp.expect_error($$update public.stores set opening_hours = repeat('a', 301) where slug = 'ssf-tienda-a'$$, 'stores_opening_hours_length');
update public.stores set opening_hours = repeat('a', 300) where slug = 'ssf-tienda-a';
select pg_temp.check(char_length((pg_temp.store(pg_temp.id('store_a'))).opening_hours) = 300, '300 characters are accepted');
update public.stores set opening_hours = null where slug = 'ssf-tienda-a';

-- ------------------------------------------------------------------ list-12: who can change them

set local role authenticated;
select pg_temp.as_user('owner_a');
with changed as (
  update public.stores set show_address = true, opening_hours = 'Lun a sáb de 10 a. m. a 7 p. m.' where id = pg_temp.id('store_a') returning 1
)
select pg_temp.check((select count(*) from changed) = 1, 'the owner updates both columns through the store profile path');
select pg_temp.check((pg_temp.store(pg_temp.id('store_a'))).show_address, 'show_address saved');
select pg_temp.check((pg_temp.store(pg_temp.id('store_a'))).opening_hours = 'Lun a sáb de 10 a. m. a 7 p. m.', 'opening_hours saved');
-- The owner of a store in review can set them before approval too.
select pg_temp.as_user('owner_b');
with changed as (update public.stores set opening_hours = 'Lun a vie de 9 a 6' where id = pg_temp.id('store_b') returning 1)
select pg_temp.check((select count(*) from changed) = 1, 'a pending store owner saves opening hours');
-- Another owner changes nothing.
with changed as (update public.stores set show_address = false, opening_hours = 'Cerrado' where id = pg_temp.id('store_a') returning 1)
select pg_temp.check((select count(*) from changed) = 0, 'another owner cannot change the columns');
-- The protected fields stay protected in the same update path.
select pg_temp.as_user('owner_a');
select pg_temp.expect_error($$update public.stores set show_address = false, is_verified = false where slug = 'ssf-tienda-a'$$, 'Only controlled server functions');

reset role;
set local role anon;
select pg_temp.as_anon();
with changed as (update public.stores set show_address = false where id = pg_temp.id('store_a') returning 1)
select pg_temp.check((select count(*) from changed) = 0, 'anon cannot change the columns');
-- A store that is not active is not readable at all, its address included.
select pg_temp.check(not exists (select 1 from public.stores where id = pg_temp.id('store_b')), 'anon cannot read a pending store or its address');
select pg_temp.check(exists (select 1 from public.stores where id = pg_temp.id('store_a')), 'anon reads an active store');

-- ------------------------------------------------------------------ find-13: the directory

select pg_temp.check((select count(*) from public.get_public_store_directory() d where d.id = pg_temp.id('store_b')) = 0, 'a pending store is not in the directory');
select pg_temp.check((select count(*) from public.get_public_store_directory() d where d.id in (pg_temp.id('store_a'), pg_temp.id('store_c'))) = 2, 'active stores are listed');
select pg_temp.check((select listing_count from public.get_public_store_directory() d where d.id = pg_temp.id('store_a')) = 3, 'approved listings only are counted');
select pg_temp.check((select listing_count from public.get_public_store_directory() d where d.id = pg_temp.id('store_c')) = 0, 'a store without listings counts zero');
select pg_temp.check((select review_count = 0 and average_rating is null from public.get_public_store_directory() d where d.id = pg_temp.id('store_a')), 'no reviews: no rating');
-- Verified stores come first.
select pg_temp.check(
  (select bool_and(not (later.is_verified and not earlier.is_verified))
   from (select row_number() over () as n, d.is_verified from public.get_public_store_directory() d) earlier
   join (select row_number() over () as n, d.is_verified from public.get_public_store_directory() d) later on later.n > earlier.n),
  'verified stores are listed before the others');
-- Public columns only.
select pg_temp.check(
  (select array_agg(attname::text order by attname) from (
     select unnest(p.proargnames[1:]) as attname, unnest(p.proargmodes) as mode from pg_proc p where p.oid = 'public.get_public_store_directory()'::regprocedure
   ) a where mode = 't')
  = array['average_rating','city','district','id','is_verified','listing_count','logo_url','name','region','review_count','slug'],
  'the directory returns no address, contact or business data');

-- ------------------------------------------------------------------ find-14: the store's categories

select pg_temp.check(
  (select jsonb_object_agg(category, listing_count) from public.get_store_listing_categories(pg_temp.id('store_a'))) = '{"guitars": 2, "pedals": 1}'::jsonb,
  'a visitor counts the approved listings per category; the pending bass is left out');
select pg_temp.check((select count(*) from public.get_store_listing_categories(pg_temp.id('store_b'))) = 0, 'a pending store has no public categories');

reset role;
set local role authenticated;
select pg_temp.as_user('owner_b');
select pg_temp.check(
  (select jsonb_object_agg(category, listing_count) from public.get_store_listing_categories(pg_temp.id('store_b'))) = '{"keyboards": 1}'::jsonb,
  'the owner previewing a store in review counts their own approved listings');
select pg_temp.check((select count(*) from public.get_store_listing_categories(pg_temp.id('store_a'))) = 2, 'another signed-in user counts store A''s public categories');
select pg_temp.as_user('owner_a');
select pg_temp.check((select count(*) from public.get_store_listing_categories(pg_temp.id('store_b'))) = 0, 'another owner sees nothing of a pending store');
-- shop-04: the owner reads their own store in review (the preview); nobody else does.
select pg_temp.check(not exists (select 1 from public.stores where id = pg_temp.id('store_b')), 'another owner cannot open a store in review');
select pg_temp.as_user('owner_b');
select pg_temp.check(exists (select 1 from public.stores where id = pg_temp.id('store_b') and slug = 'ssf-tienda-b'), 'the owner reads their store in review by slug');

reset role;
rollback;
