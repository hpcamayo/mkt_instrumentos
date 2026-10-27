-- Feature ideas, store-floor batch (docs/feature-ideas/store-floor.md): warranty and returns (reach-09), "Por llegar"
-- (reach-08) and try-outs at the store (buy-07). Local/test database only. Every fixture is rolled back.
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
create function pg_temp.owner_a() returns void language sql as $$ select pg_temp.as_user('5f100000-0000-4000-8000-000000000001') $$;
create function pg_temp.owner_b() returns void language sql as $$ select pg_temp.as_user('5f100000-0000-4000-8000-000000000002') $$;
create function pg_temp.buyer() returns void language sql as $$ select pg_temp.as_user('5f100000-0000-4000-8000-000000000003') $$;
create function pg_temp.buyer_2() returns void language sql as $$ select pg_temp.as_user('5f100000-0000-4000-8000-000000000004') $$;

-- Reads that bypass row-level security, for the checks.
create function pg_temp.listing(p_slug text) returns public.listings language sql security definer as $$
  select * from public.listings where slug = p_slug
$$;
create function pg_temp.item(p_sku text) returns public.store_inventory_items language sql security definer as $$
  select * from public.store_inventory_items where merchant_sku = p_sku
$$;
create function pg_temp.notices(p_user uuid, p_type text) returns bigint language sql security definer as $$
  select count(*) from public.notifications where user_id = p_user and event_type = p_type
$$;
create function pg_temp.emails(p_user uuid, p_type text) returns bigint language sql security definer as $$
  select count(*) from laria_private.marketplace_email_deliveries where recipient_user_id = p_user and event_type = p_type
$$;
create function pg_temp.today() returns date language sql security definer as $$ select laria_private.lima_today() $$;
create function pg_temp.email_reason(p_user uuid, p_type text) returns text language sql security definer as $$
  select context->>'reason' from laria_private.marketplace_email_deliveries where recipient_user_id = p_user and event_type = p_type
$$;
create function pg_temp.tryout(p_id uuid) returns public.store_tryouts language sql security definer as $$
  select * from public.store_tryouts where id = p_id
$$;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('5f100000-0000-4000-8000-000000000001','authenticated','authenticated','sf-owner-a@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueña A","phone":"51999994101","city":"Lima","region":"Lima"}'),
 ('5f100000-0000-4000-8000-000000000002','authenticated','authenticated','sf-owner-b@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño B","phone":"51999994102","city":"Lima","region":"Lima"}'),
 ('5f100000-0000-4000-8000-000000000003','authenticated','authenticated','sf-buyer@example.invalid',now(),'{}','{"account_type":"individual","full_name":"Ana Compradora","phone":"51999994103","city":"Lima","region":"Lima"}'),
 ('5f100000-0000-4000-8000-000000000004','authenticated','authenticated','sf-buyer-2@example.invalid',now(),'{}','{"account_type":"individual","full_name":"Luis Comprador","phone":"51999994104","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('5f200000-0000-4000-8000-000000000001','sf-a','Tienda Piso A','Tienda Piso A SAC','20999995701','sf-a@example.invalid','Contacto A','Contacto A','51999994101','Lima','Lima','Av. Prueba 1','5f100000-0000-4000-8000-000000000001','active','free',true),
 ('5f200000-0000-4000-8000-000000000002','sf-b','Tienda Piso B','Tienda Piso B SAC','20999995702','sf-b@example.invalid','Contacto B','Contacto B','51999994102','Lima','Lima','Av. Prueba 2','5f100000-0000-4000-8000-000000000002','pending','free',false);

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at) values
 ('5f300000-0000-4000-8000-000000000001','sf-new','Guitarra nueva','store','approved','guitars','electric_guitar','Fender','Player','Nuevo',3500,'Lima','Lima','Contacto A','51999994101','Descripción de prueba válida con más de cuarenta caracteres.','5f100000-0000-4000-8000-000000000001','5f200000-0000-4000-8000-000000000001','self_service',now()),
 ('5f300000-0000-4000-8000-000000000002','sf-used','Bajo usado','store','approved','basses','electric_bass','Ibanez','SR300','Muy bueno',1200,'Lima','Lima','Contacto A','51999994101','Descripción de prueba válida con más de cuarenta caracteres.','5f100000-0000-4000-8000-000000000001','5f200000-0000-4000-8000-000000000001','self_service',now()),
 ('5f300000-0000-4000-8000-000000000003','sf-pedal','Pedal de chorus','store','approved','pedals','pedals','Boss','CH-1','Nuevo',400,'Lima','Lima','Contacto A','51999994101','Descripción de prueba válida con más de cuarenta caracteres.','5f100000-0000-4000-8000-000000000001','5f200000-0000-4000-8000-000000000001','self_service',now()),
 ('5f300000-0000-4000-8000-000000000004','sf-particular','Teclado de particular','individual','approved','keyboards','synth','Korg','Minilogue','Nuevo',2000,'Lima','Lima','Ana','51999994103','Descripción de prueba válida con más de cuarenta caracteres.','5f100000-0000-4000-8000-000000000003',null,'self_service',now()),
 ('5f300000-0000-4000-8000-000000000005','sf-b-listing','Batería de la tienda B','store','pending','percussion','drum_kit','Pearl','Roadshow','Nuevo',2800,'Lima','Lima','Contacto B','51999994102','Descripción de prueba válida con más de cuarenta caracteres.','5f100000-0000-4000-8000-000000000002','5f200000-0000-4000-8000-000000000002','self_service',now());
insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/' || l.slug || '-' || n || '.jpg', n
from public.listings l cross join generate_series(0, 1) n where l.slug like 'sf-%';

set local role authenticated;

-- ================================================================== reach-09: warranty and returns

-- Nothing is said until the store says it.
select pg_temp.check((pg_temp.listing('sf-new')).warranty_months is null and (pg_temp.listing('sf-new')).store_terms_source is null,
  'listings start without terms');

select pg_temp.owner_a();
do $$
declare result jsonb;
begin
  result := public.set_store_warranty_policy('new', '{"warranty_months":12,"warranty_provider":"brand","returns_days":7,"returns_note":"  con boleta y   empaque original "}');
  perform pg_temp.check((result->>'listings_updated')::int = 2, 'the policy reaches both Nuevo listings');
  perform pg_temp.check(result->'policy'->>'returns_note' = 'con boleta y empaque original', 'the note is trimmed');
end $$;
select pg_temp.check((pg_temp.listing('sf-new')).warranty_months = 12 and (pg_temp.listing('sf-new')).warranty_provider = 'brand'
  and (pg_temp.listing('sf-new')).returns_days = 7 and (pg_temp.listing('sf-new')).store_terms_source = 'store_policy',
  'a Nuevo listing follows the Nuevo policy');
select pg_temp.check((pg_temp.listing('sf-used')).warranty_months is null, 'a used listing is not touched by the Nuevo policy');
-- "Con garantía": the flag follows the warranty (listing flag registry of the listing-details batch).
select pg_temp.check('con_garantia' = any((pg_temp.listing('sf-new')).listing_flags), 'a listing with a warranty carries the flag');
select pg_temp.check(not 'con_garantia' = any((pg_temp.listing('sf-used')).listing_flags), 'a listing without one does not');

select public.set_store_warranty_policy('used', '{"warranty_months":3,"returns_days":0}');
select pg_temp.check((pg_temp.listing('sf-used')).warranty_months = 3 and (pg_temp.listing('sf-used')).warranty_provider = 'store'
  and (pg_temp.listing('sf-used')).returns_days = 0 and (pg_temp.listing('sf-used')).returns_note is null,
  'the used policy applies, the warranty defaults to the store and 0 days means no returns');

-- One listing with its own terms keeps them when the policy changes.
do $$
declare result jsonb;
begin
  result := public.set_listing_store_terms('5f300000-0000-4000-8000-000000000003', '{"warranty_months":24,"warranty_provider":"store"}');
  perform pg_temp.check(result->>'source' = 'listing' and (result->>'warranty_months')::int = 24, 'own terms saved');
end $$;
select public.set_store_warranty_policy('new', '{"warranty_months":6}');
select pg_temp.check((pg_temp.listing('sf-pedal')).warranty_months = 24, 'own terms survive a policy change');
select pg_temp.check((pg_temp.listing('sf-new')).warranty_months = 6 and (pg_temp.listing('sf-new')).returns_days is null,
  'policy followers take the new policy');
select public.set_listing_store_terms('5f300000-0000-4000-8000-000000000003', null);
select pg_temp.check((pg_temp.listing('sf-pedal')).warranty_months = 6 and (pg_temp.listing('sf-pedal')).store_terms_source = 'store_policy',
  'back to the policy');

reset role;
-- Saved searches and alerts take "Con garantía" through the listing-details "options" key, like every registered flag.
select pg_temp.check(laria_private.normalize_saved_search('{"options":["con_garantia"]}') -> 'options' = '["con_garantia"]',
  'a saved search keeps the Con garantía option');
select pg_temp.check(laria_private.listing_matches_saved_search(pg_temp.listing('sf-new'), '{"options":["con_garantia"]}')
  and not laria_private.listing_matches_saved_search(pg_temp.listing('sf-particular'), '{"options":["con_garantia"]}'),
  'an alert for Con garantía matches only listings with a warranty');
-- Condition groups survive the new condition scale (sell-10).
select pg_temp.check(laria_private.listing_condition_group('Nuevo') = 'new'
  and laria_private.listing_condition_group('Exhibición o caja abierta') = 'open_box'
  and laria_private.listing_condition_group('Como nuevo') = 'used'
  and laria_private.listing_condition_group('Usado - con detalles') = 'used'
  and laria_private.listing_condition_group(null) is null, 'condition groups');

-- A condition change moves the listing to the other group's policy (as an approved revision would).
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set condition = 'Bueno' where slug = 'sf-new';
select pg_temp.check((pg_temp.listing('sf-new')).warranty_months = 3, 'a re-conditioned listing follows its new group');
update public.listings set condition = 'Nuevo' where slug = 'sf-new';
select set_config('app.allow_listing_admin_fields', '', true);
-- A new store listing is born with the policy; a Particular listing never carries terms.
insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source)
values ('5f300000-0000-4000-8000-000000000006','sf-born','Pedal nuevo','store','pending','pedals','pedals','Boss','DD-8','Nuevo',700,'Lima','Lima','Contacto A','51999994101','Descripción de prueba válida con más de cuarenta caracteres.','5f100000-0000-4000-8000-000000000001','5f200000-0000-4000-8000-000000000001','self_service');
select pg_temp.check((pg_temp.listing('sf-born')).warranty_months = 6, 'a new store listing starts with the policy');
select pg_temp.check((pg_temp.listing('sf-particular')).warranty_months is null, 'a Particular listing has no terms');
select pg_temp.expect_error($$update public.listings set warranty_months = 12 where slug = 'sf-particular'$$, 'new row for relation "listings" violates check constraint');
set local role authenticated;

-- Validation and ownership.
select pg_temp.owner_a();
select pg_temp.expect_error($$select public.set_store_warranty_policy('new', '{"warranty_months":61}')$$, 'STORE_TERMS_WARRANTY_RANGE');
select pg_temp.expect_error($$select public.set_store_warranty_policy('new', '{"returns_days":31}')$$, 'STORE_TERMS_RETURNS_RANGE');
select pg_temp.expect_error($$select public.set_store_warranty_policy('new', '{"warranty_months":1.5}')$$, 'STORE_TERMS_INVALID');
select pg_temp.expect_error($$select public.set_store_warranty_policy('new', '{"warranty_months":"doce"}')$$, 'STORE_TERMS_INVALID');
select pg_temp.expect_error($$select public.set_store_warranty_policy('nuevo', '{"warranty_months":1}')$$, 'STORE_TERMS_INVALID');
select pg_temp.expect_error($$select public.set_store_warranty_policy('new', '{"garantia":1}')$$, 'STORE_TERMS_INVALID');
select pg_temp.expect_error($$select public.set_listing_store_terms('5f300000-0000-4000-8000-000000000004', '{"warranty_months":1}')$$, 'STORE_TERMS_LISTING_NOT_OWNED');
select pg_temp.owner_b();
select pg_temp.expect_error($$select public.set_listing_store_terms('5f300000-0000-4000-8000-000000000001', '{"warranty_months":1}')$$, 'STORE_TERMS_LISTING_NOT_OWNED');
select public.set_store_warranty_policy('new', '{"warranty_months":12}');
select pg_temp.buyer();
select pg_temp.expect_error($$select public.set_store_warranty_policy('new', '{"warranty_months":1}')$$, 'STORE_TERMS_STORE_REQUIRED');

-- An empty policy is deleted and its listings lose the line.
select pg_temp.owner_a();
select public.set_store_warranty_policy('used', '{}');
select pg_temp.check((pg_temp.listing('sf-used')).warranty_months is null and (pg_temp.listing('sf-used')).store_terms_source is null,
  'removing a policy clears its followers');
select public.set_store_warranty_policy('used', '{"warranty_months":0,"returns_days":7}');
select pg_temp.check((pg_temp.listing('sf-used')).warranty_months = 0 and not 'con_garantia' = any((pg_temp.listing('sf-used')).listing_flags),
  '"Sin garantía adicional" is said, without the flag');
select public.set_store_warranty_policy('used', '{}');

-- Who reads policies: the public for active stores, the owner always.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.check((select count(*) from public.store_warranty_policies where store_id = '5f200000-0000-4000-8000-000000000001') = 1, 'the public reads an active store''s policy');
select pg_temp.check((select count(*) from public.store_warranty_policies where store_id = '5f200000-0000-4000-8000-000000000002') = 0, 'a store in review keeps its policy private');
select pg_temp.expect_error($$select public.set_store_warranty_policy('new', '{"warranty_months":1}')$$, 'permission denied');
reset role;
set local role authenticated;
select pg_temp.owner_b();
select pg_temp.check((select count(*) from public.store_warranty_policies where store_id = '5f200000-0000-4000-8000-000000000002') = 1, 'the owner reads their own');

-- ================================================================== reach-08: "Por llegar"

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal2","app_metadata":{"role":"admin"}}', true);
select public.admin_set_store_inventory_enabled('5f200000-0000-4000-8000-000000000001', true, 'Piloto store-floor');

select pg_temp.owner_a();
select public.create_inventory_item('{"merchant_sku":"SF-GTR","product_name":"Guitarra nueva","listing_id":"5f300000-0000-4000-8000-000000000001","unit_price_pen":3500}'::jsonb, 0, 'qa-sf-gtr');
select public.create_inventory_item('{"merchant_sku":"SF-PED","product_name":"Pedal de chorus","listing_id":"5f300000-0000-4000-8000-000000000003","unit_price_pen":400}'::jsonb, 4, 'qa-sf-ped');
select public.create_inventory_item('{"merchant_sku":"SF-CAB","product_name":"Cable"}'::jsonb, 0, 'qa-sf-cab');

select pg_temp.check((pg_temp.listing('sf-new')).stock_state = 'out_of_stock', 'the guitar is out of stock');

do $$
declare result jsonb;
begin
  result := public.set_inventory_arrival(array[(pg_temp.item('SF-GTR')).id, (pg_temp.item('SF-PED')).id, (pg_temp.item('SF-CAB')).id],
    pg_temp.today() + 20);
  perform pg_temp.check((result->>'updated')::int = 2 and (result->>'skipped')::int = 1, 'the SKU with units is skipped');
end $$;
select pg_temp.check((pg_temp.item('SF-GTR')).expected_arrival_on = pg_temp.today() + 20, 'the SKU has the date');
select pg_temp.check((pg_temp.listing('sf-new')).restock_expected_on = pg_temp.today() + 20, 'its listing shows the date');
select pg_temp.check((pg_temp.item('SF-PED')).expected_arrival_on is null and (pg_temp.listing('sf-pedal')).restock_expected_on is null,
  'a SKU with units never gets a date');
select pg_temp.check((select count(*) from public.store_inventory_changes where item_id = (pg_temp.item('SF-GTR')).id and change_type = 'arrival') = 1,
  'the date is in the SKU history');
select pg_temp.check((select (public.get_inventory_page('{"stock":"out","sort":"name"}'::jsonb, null, 50)->'items'->0->>'expected_arrival_on')) is not null,
  'Inventario reads the date');

select pg_temp.expect_error(format('select public.set_inventory_arrival(array[%L]::uuid[], %L::date)', (pg_temp.item('SF-GTR')).id, pg_temp.today() - 1), 'INVENTORY_ARRIVAL_DATE_INVALID');
select pg_temp.expect_error(format('select public.set_inventory_arrival(array[%L]::uuid[], %L::date)', (pg_temp.item('SF-GTR')).id, pg_temp.today() + 366), 'INVENTORY_ARRIVAL_DATE_INVALID');
select pg_temp.expect_error('select public.set_inventory_arrival(array[]::uuid[], null)', 'INVENTORY_ARRIVAL_INVALID');
select pg_temp.owner_b();
select pg_temp.expect_error(format('select public.set_inventory_arrival(array[%L]::uuid[], null)', (pg_temp.item('SF-GTR')).id), 'INVENTORY_');

-- A buyer asks to hear when it arrives (the list-11 watch accepts a "Por llegar" listing as it is out of stock).
select pg_temp.buyer();
select pg_temp.check(public.set_listing_stock_watch('5f300000-0000-4000-8000-000000000001', true), 'the buyer asks for the arrival notice');

-- Units arrive: both dates clear, and the buyer hears once.
select pg_temp.owner_a();
select public.record_stock_movement((pg_temp.item('SF-GTR')).id, 'restock', 2, 'panel', null, null, null, 'qa-sf-restock');
select pg_temp.check((pg_temp.item('SF-GTR')).expected_arrival_on is null, 'the SKU date clears on arrival');
select pg_temp.check((pg_temp.listing('sf-new')).restock_expected_on is null and (pg_temp.listing('sf-new')).stock_state = 'in_stock',
  'the listing is available again, without the date');
select pg_temp.check(pg_temp.notices('5f100000-0000-4000-8000-000000000003', 'listing_back_in_stock') = 1, 'the watcher gets one notice');

-- Selling out again, a new date, then unlinking: the listing drops the date with its stock state.
select public.record_stock_movement((pg_temp.item('SF-GTR')).id, 'sale', 2, 'tienda_fisica', null, null, null, 'qa-sf-sale');
select public.set_inventory_arrival(array[(pg_temp.item('SF-GTR')).id], pg_temp.today() + 5);
select pg_temp.check((pg_temp.listing('sf-new')).restock_expected_on = pg_temp.today() + 5, 'a new date after selling out');
select public.set_inventory_arrival(array[(pg_temp.item('SF-GTR')).id], null);
select pg_temp.check((pg_temp.listing('sf-new')).restock_expected_on is null, 'removing the date');
select public.set_inventory_arrival(array[(pg_temp.item('SF-GTR')).id], pg_temp.today() + 5);
select public.unlink_inventory_listing((pg_temp.item('SF-GTR')).id, 'Prueba', (pg_temp.item('SF-GTR')).version);
select pg_temp.check((pg_temp.listing('sf-new')).restock_expected_on is null and (pg_temp.listing('sf-new')).stock_state is null,
  'an unlinked listing has no date');
select pg_temp.check((pg_temp.item('SF-GTR')).expected_arrival_on = pg_temp.today() + 5, 'the SKU keeps its own date');
-- Linking again brings the date back to the listing.
select public.link_inventory_listing((pg_temp.item('SF-GTR')).id, '5f300000-0000-4000-8000-000000000001', (pg_temp.item('SF-GTR')).version, 3500);
select pg_temp.check((pg_temp.listing('sf-new')).restock_expected_on = pg_temp.today() + 5, 'linking copies the date');

-- A date that passed is cleared by the daily job, and the owner gets one notice.
reset role;
update public.store_inventory_items set expected_arrival_on = pg_temp.today() - 1 where merchant_sku in ('SF-GTR', 'SF-CAB');
do $$
begin
  perform pg_temp.check((public.run_store_floor_daily()->>'arrivals_expired')::int = 2, 'the job clears two dates');
  perform pg_temp.check((pg_temp.item('SF-GTR')).expected_arrival_on is null and (pg_temp.listing('sf-new')).restock_expected_on is null,
    'both copies are gone');
  perform pg_temp.check(pg_temp.notices('5f100000-0000-4000-8000-000000000001', 'store_arrival_estimate_passed') = 1, 'one notice for the owner');
  perform pg_temp.check((public.run_store_floor_daily()->>'arrivals_expired')::int = 0
    and pg_temp.notices('5f100000-0000-4000-8000-000000000001', 'store_arrival_estimate_passed') = 1, 'a second run does nothing');
end $$;
set local role authenticated;
select pg_temp.buyer();
select pg_temp.expect_error('select public.run_store_floor_daily()', 'permission denied');

-- ================================================================== buy-07: try-outs

-- Settings: validation and the owner only.
select pg_temp.owner_a();
select pg_temp.expect_error($$select public.set_store_tryout_settings('{"enabled":true}')$$, 'TRYOUT_HOURS_REQUIRED');
select pg_temp.expect_error($$select public.set_store_tryout_settings('{"weekly_hours":{"8":[["10:00","12:00"]]}}')$$, 'TRYOUT_HOURS_INVALID');
select pg_temp.expect_error($$select public.set_store_tryout_settings('{"weekly_hours":{"1":[["12:00","10:00"]]}}')$$, 'TRYOUT_HOURS_INVALID');
select pg_temp.expect_error($$select public.set_store_tryout_settings('{"weekly_hours":{"1":[["10:10","12:00"]]}}')$$, 'TRYOUT_HOURS_INVALID');
select pg_temp.expect_error($$select public.set_store_tryout_settings('{"weekly_hours":{"1":[["10:00","13:00"],["12:00","15:00"]]}}')$$, 'TRYOUT_HOURS_INVALID');
select pg_temp.expect_error($$select public.set_store_tryout_settings('{"slot_minutes":20}')$$, 'TRYOUT_SETTINGS_INVALID');
select pg_temp.expect_error($$select public.set_store_tryout_settings('{"horario":1}')$$, 'TRYOUT_SETTINGS_INVALID');

-- Open every day 06:00–23:00 for three days, so there are slots whatever the hour the suite runs.
do $$
declare saved jsonb;
begin
  saved := public.set_store_tryout_settings(jsonb_build_object(
    'enabled', true, 'slot_minutes', 60, 'capacity', 1, 'min_notice_hours', 1, 'max_days_ahead', 3,
    'note', 'Tenemos sala de pruebas.',
    'weekly_hours', (select jsonb_object_agg(d::text, '[["06:00","23:00"]]'::jsonb) from generate_series(1, 7) d)));
  perform pg_temp.check((saved->>'enabled')::boolean and saved->'weekly_hours'->'3'->0->>1 = '23:00', 'settings saved');
end $$;

-- Anyone can see the free slots of an available listing; nobody sees them for an out-of-stock one.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.check((public.get_listing_tryout_slots('5f300000-0000-4000-8000-000000000003')->>'available')::boolean, 'an available listing takes bookings');
select pg_temp.check(jsonb_array_length(public.get_listing_tryout_slots('5f300000-0000-4000-8000-000000000003')->'slots') >= 17,
  'at least a full day of hourly slots');
select pg_temp.check(not (public.get_listing_tryout_slots('5f300000-0000-4000-8000-000000000001')->>'available')::boolean,
  'an out-of-stock listing takes no bookings');
select pg_temp.check(not (public.get_listing_tryout_slots('5f300000-0000-4000-8000-000000000004')->>'available')::boolean,
  'a Particular listing takes no bookings');
create temporary table sf_slots on commit drop as
  select (value #>> '{}')::timestamptz as starts_at, ordinality
  from jsonb_array_elements(public.get_listing_tryout_slots('5f300000-0000-4000-8000-000000000003')->'slots') with ordinality;
select pg_temp.check((select bool_and(starts_at >= now() + interval '1 hour') from sf_slots), 'no slot before the notice period');
select pg_temp.check((select bool_and(extract(minute from starts_at at time zone 'America/Lima') = 0) from sf_slots), 'slots on the hour');
select pg_temp.expect_error($$select public.request_store_tryout('5f300000-0000-4000-8000-000000000003', now(), 'Ana', '987654321', null, 'qa-sf-anon-1')$$, 'permission denied');
reset role;
grant select on sf_slots to authenticated;
set local role authenticated;

-- A booking, a replay of the same request, and the store's notice.
select pg_temp.buyer();
create temporary table sf_booked (id uuid) on commit drop;
do $$
declare
  first_slot timestamptz := (select starts_at from sf_slots where ordinality = 1);
  booked jsonb;
  replay jsonb;
begin
  booked := public.request_store_tryout('5f300000-0000-4000-8000-000000000003', first_slot, '  Ana   Compradora ', '987 654 321', 'Quiero probarlo con mi guitarra.', 'qa-sf-try-1');
  perform pg_temp.check(booked->>'status' = 'requested' and booked->>'buyer_phone' = '51987654321'
    and booked->>'buyer_name' = 'Ana Compradora' and booked->'store'->>'name' = 'Tienda Piso A', 'the request is booked');
  perform pg_temp.check(not (booked ? 'request_key') and booked->>'when_label' like '%, %', 'the reply has a readable time and no key');
  replay := public.request_store_tryout('5f300000-0000-4000-8000-000000000003', first_slot, 'Ana', '987654321', null, 'qa-sf-try-1');
  perform pg_temp.check(replay->>'id' = booked->>'id' and (replay->>'replayed')::boolean, 'a retried request returns the first booking');
  insert into sf_booked values ((booked->>'id')::uuid);
end $$;
select pg_temp.check(pg_temp.notices('5f100000-0000-4000-8000-000000000001', 'store_tryout_requested') = 1
  and pg_temp.emails('5f100000-0000-4000-8000-000000000001', 'store_tryout_requested') = 1, 'the store gets a notice and an e-mail');
select pg_temp.expect_error(format('select public.request_store_tryout(%L, %L, %L, %L, null, %L)', '5f300000-0000-4000-8000-000000000003',
  (select starts_at from sf_slots where ordinality = 2), 'Ana', '987654321', 'qa-sf-try-2'), 'TRYOUT_ALREADY_BOOKED');
-- The slot is now full (capacity 1) and leaves the list.
select pg_temp.check(not exists (
  select 1 from jsonb_array_elements_text(public.get_listing_tryout_slots('5f300000-0000-4000-8000-000000000003')->'slots') s
  where s::timestamptz = (select starts_at from sf_slots where ordinality = 1)), 'a full slot is not offered');

select pg_temp.buyer_2();
select pg_temp.expect_error(format('select public.request_store_tryout(%L, %L, %L, %L, null, %L)', '5f300000-0000-4000-8000-000000000003',
  (select starts_at from sf_slots where ordinality = 1), 'Luis', '987654322', 'qa-sf-try-3'), 'TRYOUT_SLOT_TAKEN');
select pg_temp.expect_error(format('select public.request_store_tryout(%L, %L, %L, %L, null, %L)', '5f300000-0000-4000-8000-000000000003',
  (select starts_at from sf_slots where ordinality = 1) + interval '7 minutes', 'Luis', '987654322', 'qa-sf-try-4'), 'TRYOUT_SLOT_INVALID');
select pg_temp.expect_error(format('select public.request_store_tryout(%L, %L, %L, %L, null, %L)', '5f300000-0000-4000-8000-000000000003',
  (select starts_at from sf_slots where ordinality = 2), 'Luis', '123', 'qa-sf-try-5'), 'TRYOUT_PHONE_INVALID');
select pg_temp.expect_error(format('select public.request_store_tryout(%L, %L, %L, %L, null, %L)', '5f300000-0000-4000-8000-000000000003',
  (select starts_at from sf_slots where ordinality = 2), 'L', '987654322', 'qa-sf-try-6'), 'TRYOUT_NAME_INVALID');
select pg_temp.expect_error(format('select public.request_store_tryout(%L, %L, %L, %L, null, %L)', '5f300000-0000-4000-8000-000000000001',
  (select starts_at from sf_slots where ordinality = 2), 'Luis', '987654322', 'qa-sf-try-7'), 'TRYOUT_UNAVAILABLE');
-- Another slot works for the second buyer.
select public.request_store_tryout('5f300000-0000-4000-8000-000000000003', (select starts_at from sf_slots where ordinality = 2), 'Luis', '987654322', null, 'qa-sf-try-8');

-- The owner cannot book their own listing.
select pg_temp.owner_a();
select pg_temp.expect_error(format('select public.request_store_tryout(%L, %L, %L, %L, null, %L)', '5f300000-0000-4000-8000-000000000003',
  (select starts_at from sf_slots where ordinality = 3), 'Dueña', '987654323', 'qa-sf-try-9'), 'TRYOUT_OWN_LISTING');

-- Who reads what: the buyer their own, the store its own, nobody else.
select pg_temp.buyer();
select pg_temp.check((select count(*) from public.store_tryouts) = 1, 'the buyer reads only their own try-out');
select pg_temp.owner_a();
select pg_temp.check((select count(*) from public.store_tryouts) = 2, 'the store reads its try-outs');
select pg_temp.owner_b();
select pg_temp.check((select count(*) from public.store_tryouts) = 0, 'another store reads none');
select pg_temp.expect_error(format('select public.respond_store_tryout(%L, %L)', (select id from sf_booked), 'confirm'), 'TRYOUT_NOT_FOUND');

-- The store confirms (twice is harmless); the buyer is told once.
select pg_temp.owner_a();
select public.respond_store_tryout((select id from sf_booked), 'confirm');
select public.respond_store_tryout((select id from sf_booked), 'confirm');
select pg_temp.check((pg_temp.tryout((select id from sf_booked))).status = 'confirmed', 'confirmed');
select pg_temp.check(pg_temp.notices('5f100000-0000-4000-8000-000000000003', 'listing_tryout_confirmed') = 1
  and pg_temp.emails('5f100000-0000-4000-8000-000000000003', 'listing_tryout_confirmed') = 1, 'the buyer is told once');
select pg_temp.expect_error(format('select public.respond_store_tryout(%L, %L)', (select id from sf_booked), 'decline'), 'TRYOUT_NOT_PENDING');
select pg_temp.expect_error(format('select public.respond_store_tryout(%L, %L)', (select id from sf_booked), 'archive'), 'TRYOUT_INVALID');

-- The second request is declined with a reason that reaches the buyer.
select public.respond_store_tryout((select id from public.store_tryouts where buyer_name = 'Luis'), 'decline', 'Ese día cerramos temprano.');
select pg_temp.check(pg_temp.notices('5f100000-0000-4000-8000-000000000004', 'listing_tryout_declined') = 1, 'the declined buyer is told');
select pg_temp.check(pg_temp.email_reason('5f100000-0000-4000-8000-000000000004', 'listing_tryout_declined') like '%Motivo: Ese día cerramos temprano.',
  'the e-mail carries the time and the reason');

-- The buyer cancels; the store is told; cancelling again is harmless.
select pg_temp.buyer();
select public.cancel_my_tryout((select id from sf_booked));
select public.cancel_my_tryout((select id from sf_booked));
select pg_temp.check((pg_temp.tryout((select id from sf_booked))).cancelled_by = 'buyer', 'cancelled by the buyer');
select pg_temp.check(pg_temp.notices('5f100000-0000-4000-8000-000000000001', 'store_tryout_cancelled') = 1, 'the store is told');
select pg_temp.buyer_2();
select pg_temp.expect_error(format('select public.cancel_my_tryout(%L)', (select id from sf_booked)), 'TRYOUT_NOT_FOUND');

-- Daily work: unanswered past requests expire, confirmed try-outs of today or tomorrow get one reminder, and try-outs
-- older than 90 days are deleted.
reset role;
insert into public.store_tryouts (id, store_id, listing_id, listing_title, buyer_user_id, buyer_name, buyer_phone, starts_at, ends_at, status, request_key, created_at) values
 ('5f400000-0000-4000-8000-000000000001','5f200000-0000-4000-8000-000000000001','5f300000-0000-4000-8000-000000000003','Pedal de chorus','5f100000-0000-4000-8000-000000000004','Luis','51987654322', now() - interval '2 hours', now() - interval '1 hour','requested','qa-sf-past-1', now() - interval '1 day'),
 ('5f400000-0000-4000-8000-000000000002','5f200000-0000-4000-8000-000000000001','5f300000-0000-4000-8000-000000000003','Pedal de chorus','5f100000-0000-4000-8000-000000000004','Luis','51987654322',
   ((pg_temp.today() + 1) + time '15:00') at time zone 'America/Lima', ((pg_temp.today() + 1) + time '16:00') at time zone 'America/Lima','confirmed','qa-sf-soon-1', now()),
 ('5f400000-0000-4000-8000-000000000003','5f200000-0000-4000-8000-000000000001','5f300000-0000-4000-8000-000000000003','Pedal de chorus','5f100000-0000-4000-8000-000000000004','Luis','51987654322',
   ((pg_temp.today() + 5) + time '15:00') at time zone 'America/Lima', ((pg_temp.today() + 5) + time '16:00') at time zone 'America/Lima','confirmed','qa-sf-later-1', now()),
 ('5f400000-0000-4000-8000-000000000004','5f200000-0000-4000-8000-000000000001','5f300000-0000-4000-8000-000000000003','Pedal de chorus','5f100000-0000-4000-8000-000000000004','Luis','51987654322', now() - interval '91 days', now() - interval '91 days' + interval '1 hour','confirmed','qa-sf-old-1', now() - interval '92 days');
do $$
declare result jsonb := public.run_store_floor_daily();
begin
  perform pg_temp.check((result->>'expired')::int = 1 and (pg_temp.tryout('5f400000-0000-4000-8000-000000000001')).status = 'expired',
    'an unanswered past request expires');
  perform pg_temp.check((result->>'reminded')::int = 1 and (pg_temp.tryout('5f400000-0000-4000-8000-000000000002')).reminded_at is not null
    and (pg_temp.tryout('5f400000-0000-4000-8000-000000000003')).reminded_at is null, 'only tomorrow''s try-out is reminded');
  perform pg_temp.check(pg_temp.emails('5f100000-0000-4000-8000-000000000004', 'listing_tryout_reminder') = 1, 'the reminder e-mail is queued');
  perform pg_temp.check((result->>'purged')::int = 1 and (pg_temp.tryout('5f400000-0000-4000-8000-000000000004')).id is null,
    'old try-outs are deleted');
  result := public.run_store_floor_daily();
  perform pg_temp.check((result->>'expired')::int = 0 and (result->>'reminded')::int = 0, 'a second run does nothing');
  perform pg_temp.check(pg_temp.emails('5f100000-0000-4000-8000-000000000004', 'listing_tryout_declined') = 1,
    'expiry is an in-app notice, without a second e-mail');
end $$;

-- Turning try-outs off stops new bookings and keeps those already made.
set local role authenticated;
select pg_temp.owner_a();
select public.set_store_tryout_settings('{"enabled":false}');
select pg_temp.check(not (public.get_listing_tryout_slots('5f300000-0000-4000-8000-000000000003')->>'available')::boolean, 'off means no slots');
select pg_temp.check((select count(*) from public.store_tryouts where status = 'confirmed') = 2, 'confirmed try-outs stay');

-- The time label reads as people say it.
reset role;
select pg_temp.check(laria_private.tryout_when_label('2026-12-12 16:00:00+00') = 'sábado 12 de diciembre, 11:00 a. m.', 'a morning label');
select pg_temp.check(laria_private.tryout_when_label('2026-09-14 20:30:00+00') = 'lunes 14 de setiembre, 3:30 p. m.', 'an afternoon label');
select pg_temp.check(laria_private.tryout_when_label('2026-09-14 17:00:00+00') = 'lunes 14 de setiembre, 12:00 p. m.', 'noon');

rollback;
