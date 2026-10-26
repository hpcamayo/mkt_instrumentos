-- Selling tools batch of the feature ideas (docs/feature-ideas/selling-tools.md): Mi equipo (sell-01), offers from
-- stores (sell-02), consignment (sell-03), price steps (sell-04), private offers (sell-05), gear reminders (buy-06) and
-- part payment (run-04). Migrations 20261204120000..120600. Local/test database only. Every fixture is rolled back.
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

select pg_temp.remember('seller', 'f3000000-0000-4000-8000-000000000001'),
       pg_temp.remember('buyer', 'f3000000-0000-4000-8000-000000000002'),
       pg_temp.remember('other', 'f3000000-0000-4000-8000-000000000003'),
       pg_temp.remember('owner_a', 'f3000000-0000-4000-8000-000000000011'),
       pg_temp.remember('owner_b', 'f3000000-0000-4000-8000-000000000012'),
       pg_temp.remember('owner_c', 'f3000000-0000-4000-8000-000000000013'),
       pg_temp.remember('owner_d', 'f3000000-0000-4000-8000-000000000014'),
       pg_temp.remember('store_a', 'f3100000-0000-4000-8000-000000000001'),
       pg_temp.remember('store_b', 'f3100000-0000-4000-8000-000000000002'),
       pg_temp.remember('store_c', 'f3100000-0000-4000-8000-000000000003'),
       pg_temp.remember('store_d', 'f3100000-0000-4000-8000-000000000004'),
       pg_temp.remember('l_seller', 'f3200000-0000-4000-8000-000000000001'),
       pg_temp.remember('l_store', 'f3200000-0000-4000-8000-000000000002'),
       pg_temp.remember('l_sold', 'f3200000-0000-4000-8000-000000000003'),
       pg_temp.remember('l_store_b', 'f3200000-0000-4000-8000-000000000004'),
       pg_temp.remember('trade_1', 'f3300000-0000-4000-8000-000000000001'),
       pg_temp.remember('trade_2', 'f3300000-0000-4000-8000-000000000002'),
       pg_temp.remember('trade_pp', 'f3300000-0000-4000-8000-000000000003');

-- ------------------------------------------------------------------ anonymous callers

set local role anon;
do $$ declare denied integer := 0; probe uuid := 'f3999999-0000-4000-8000-000000000000'; begin
  begin perform public.save_gear_item(null, '{}'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.start_gear_sale(probe); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.set_gear_reminder(probe, 3, current_date); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.set_store_trade_settings('{}'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.create_trade_request(probe, '{}'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.save_trade_offer(probe, 100, null); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.get_store_trade_inbox(); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.create_consignment_invite(probe); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.set_listing_price_steps(probe, 1, 5, 7, true); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.send_private_offer(probe, 1, 1, null); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.get_listing_selling_tools(array[probe]); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.run_selling_job('price-steps', 1); exception when insufficient_privilege then denied := denied + 1; end;
  if denied <> 12 then raise exception 'Anonymous selling-tools RPC guard failed: %', denied; end if;
  -- The public reads stay open.
  perform public.get_listing_consignment(probe);
  perform public.listing_accepts_part_payment(probe);
end $$;
reset role;

-- ------------------------------------------------------------------ fixtures

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('f3000000-0000-4000-8000-000000000001','authenticated','authenticated','st-seller@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Vendedora ST","phone":"51999993001","city":"Lima","region":"Lima"}'),
 ('f3000000-0000-4000-8000-000000000002','authenticated','authenticated','st-buyer@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Comprador ST","phone":"51999993002","city":"Lima","region":"Lima"}'),
 ('f3000000-0000-4000-8000-000000000003','authenticated','authenticated','st-other@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Otra ST","city":"Arequipa","region":"Arequipa"}'),
 ('f3000000-0000-4000-8000-000000000011','authenticated','authenticated','st-owner-a@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueña A","phone":"51999993011","city":"Lima","region":"Lima"}'),
 ('f3000000-0000-4000-8000-000000000012','authenticated','authenticated','st-owner-b@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño B","phone":"51999993012","city":"Lima","region":"Lima"}'),
 ('f3000000-0000-4000-8000-000000000013','authenticated','authenticated','st-owner-c@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño C","phone":"51999993013","city":"Arequipa","region":"Arequipa"}'),
 ('f3000000-0000-4000-8000-000000000014','authenticated','authenticated','st-owner-d@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño D","phone":"51999993014","city":"Lima","region":"Lima"}');

-- A and B: Lima, verified. C: Arequipa, verified. D: Lima, not verified.
insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,district,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('f3100000-0000-4000-8000-000000000001','st-tienda-a','ST Tienda A','ST A SAC','20999993001','st-a@example.invalid','Contacto A','Contacto A','51999993011','Lima','Miraflores','Lima','Av. Larco 101','f3000000-0000-4000-8000-000000000011','active','free',true),
 ('f3100000-0000-4000-8000-000000000002','st-tienda-b','ST Tienda B','ST B SAC','20999993002','st-b@example.invalid','Contacto B','Contacto B','51999993012','Lima','Surco','Lima','Av. Primavera 202','f3000000-0000-4000-8000-000000000012','active','free',true),
 ('f3100000-0000-4000-8000-000000000003','st-tienda-c','ST Tienda C','ST C SAC','20999993003','st-c@example.invalid','Contacto C','Contacto C','51999993013','Arequipa','Cercado','Arequipa','Calle Mercaderes 303','f3000000-0000-4000-8000-000000000013','active','free',true),
 ('f3100000-0000-4000-8000-000000000004','st-tienda-d','ST Tienda D','ST D SAC','20999993004','st-d@example.invalid','Contacto D','Contacto D','51999993014','Lima','Lince','Lima','Av. Arequipa 404','f3000000-0000-4000-8000-000000000014','active','free',false);

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at,published_at) values
 ('f3200000-0000-4000-8000-000000000001','st-l1','Guitarra ST uno','individual','approved','guitars','electric_guitar','Fender','Stratocaster','Usado - buen estado',2000,'Lima','Lima','Vendedora ST','51999993001','Descripción de la guitarra válida con más de cuarenta caracteres.','f3000000-0000-4000-8000-000000000001',null,'self_service',now(),now()-interval '20 days'),
 ('f3200000-0000-4000-8000-000000000002','st-l2','Guitarra ST tienda','store','approved','guitars','electric_guitar','Gibson','Les Paul','Usado - buen estado',6000,'Lima','Lima','Contacto A','51999993011','Descripción de la guitarra válida con más de cuarenta caracteres.','f3000000-0000-4000-8000-000000000011','f3100000-0000-4000-8000-000000000001','self_service',now(),now()-interval '20 days'),
 ('f3200000-0000-4000-8000-000000000003','st-l3','Bajo ST vendido','individual','approved','basses','bass','Ibanez','SR300','Usado - buen estado',1500,'Lima','Lima','Vendedora ST','51999993001','Descripción del bajo válida con más de cuarenta caracteres siempre.','f3000000-0000-4000-8000-000000000001',null,'self_service',now(),now()-interval '20 days'),
 ('f3200000-0000-4000-8000-000000000004','st-l4','Teclado ST tienda B','store','approved','keyboards','keyboards','Roland','FP-30','Nuevo',3000,'Lima','Lima','Contacto B','51999993012','Descripción del teclado válida con más de cuarenta caracteres siempre.','f3000000-0000-4000-8000-000000000012','f3100000-0000-4000-8000-000000000002','self_service',now(),now()-interval '20 days');

-- ------------------------------------------------------------------ shared registry

do $$ begin
  -- gear_ notices need no listing or store; the other new types keep their targets.
  insert into public.notifications(user_id, event_type, message) values (pg_temp.id('seller'), 'gear_reminder_due', 'probe');
  perform pg_temp.expect_error(format($q$insert into public.notifications(user_id, event_type, message) values (%L, 'listing_price_step', 'x')$q$, pg_temp.id('seller')), 'notifications_target_check');
  perform pg_temp.expect_error(format($q$insert into public.notifications(user_id, event_type, message) values (%L, 'store_trade_request', 'x')$q$, pg_temp.id('seller')), 'notifications_target_check');
  -- Types other batches registered before still work.
  insert into public.notifications(user_id, event_type, message, listing_id) values (pg_temp.id('seller'), 'listing_approved', 'probe', pg_temp.id('l_seller'));
  -- The e-mail context accepts "selling" and still refuses unknown keys.
  perform laria_private.enqueue_marketplace_email('gear_reminder_due', pg_temp.id('seller'), 'st-probe', p_context => '{"selling":{"kind":"strings"}}');
  perform pg_temp.expect_error($q$select laria_private.enqueue_marketplace_email('gear_reminder_due', 'f3000000-0000-4000-8000-000000000001', 'st-probe-2', p_context => '{"other":1}')$q$, 'marketplace_email_context_check');
  -- The helper is idempotent.
  perform laria_private.feat_add_check_branch('public.notifications', 'notifications_target_check', 'gear\_%', 'event_type ~~ ''gear\_%''::text');
  perform pg_temp.check((select count(*) from regexp_matches(pg_get_constraintdef((select oid from pg_constraint where conname = 'notifications_target_check')), 'gear', 'g')) = 1, 'gear branch added once');
  delete from public.notifications where message = 'probe';
  delete from laria_private.marketplace_email_deliveries where dedupe_key = 'st-probe';
end $$;

-- ------------------------------------------------------------------ sell-01 Mi equipo

set local role authenticated;
select pg_temp.as_user('seller');
do $$ declare item uuid; second uuid; sale jsonb; again jsonb; draft public.listing_drafts; begin
  perform pg_temp.expect_error($q$select public.save_gear_item(null, '{"category":"guitars","instrument_type":"bass","brand":"Fender"}')$q$, 'GEAR_CATEGORY_INVALID');
  perform pg_temp.expect_error($q$select public.save_gear_item(null, '{"category":"guitars","instrument_type":"electric_guitar","brand":""}')$q$, 'GEAR_BRAND_REQUIRED');
  perform pg_temp.expect_error(format($q$select public.save_gear_item(null, '{"category":"guitars","instrument_type":"electric_guitar","brand":"Fender","purchased_on":"%s"}')$q$, current_date + 5), 'GEAR_PURCHASE_DATE_INVALID');
  perform pg_temp.expect_error($q$select public.save_gear_item(null, '{"category":"guitars","instrument_type":"electric_guitar","brand":"Fender","purchased_on":"2024-05-01","warranty_until":"2024-01-01"}')$q$, 'GEAR_WARRANTY_DATE_INVALID');
  item := public.save_gear_item(null, '{"category":"guitars","instrument_type":"electric_guitar","brand":"Fender","model":"Telecaster","serial":"mx-21 004512","purchased_on":"2024-05-01","warranty_until":"2026-05-01","note":"Con estuche"}');
  perform pg_temp.remember('gear_tele', item);
  perform pg_temp.check((select serial_key from public.gear_items where id = item) = 'MX21004512', 'serial key normalized');
  perform pg_temp.check((select title from public.gear_items where id = item) = 'Fender Telecaster', 'title from brand and model');
  second := public.save_gear_item(null, '{"category":"pedals","instrument_type":"pedals","brand":"Boss","model":"DS-1"}');
  perform public.save_gear_item(second, '{"category":"pedals","instrument_type":"pedals","brand":"Boss","model":"DS-2"}');
  perform pg_temp.check((select model from public.gear_items where id = second) = 'DS-2', 'item updated');
  perform pg_temp.check(public.delete_gear_item(second), 'item deleted');
  -- Direct writes are closed.
  perform pg_temp.expect_error(format($q$insert into public.gear_items(user_id, category, instrument_type, brand, title) values (%L, 'guitars', 'other', 'X', 'X')$q$, pg_temp.id('seller')), 'permission denied');
  perform pg_temp.expect_error(format($q$update public.gear_items set serial = 'changed' where id = %L$q$, item), 'permission denied');

  -- "Vender esto" opens a prefilled draft without a price, once.
  sale := public.start_gear_sale(item);
  perform pg_temp.check(sale ? 'draft_id', 'sale returns a draft');
  select * into draft from public.listing_drafts where id = (sale->>'draft_id')::uuid;
  perform pg_temp.check(draft.form->>'brand' = 'Fender' and draft.form->>'model' = 'Telecaster' and draft.form->>'price' = ''
    and draft.form->>'city' = 'Lima' and draft.kind = 'listing', 'draft form prefilled');
  again := public.start_gear_sale(item);
  perform pg_temp.check(again->>'draft_id' = sale->>'draft_id', 'second tap opens the same draft');
end $$;

-- Another person sees nothing; a store owner cannot use Mi equipo.
select pg_temp.as_user('buyer');
do $$ begin
  perform pg_temp.check((select count(*) from public.gear_items) = 0, 'other person reads no gear');
  perform pg_temp.expect_error(format('select public.start_gear_sale(%L)', pg_temp.id('gear_tele')), 'GEAR_NOT_FOUND');
  perform pg_temp.check(not public.delete_gear_item(pg_temp.id('gear_tele')), 'other person cannot delete it');
end $$;
select pg_temp.as_user('owner_a');
select pg_temp.expect_error($q$select public.save_gear_item(null, '{"category":"guitars","instrument_type":"other","brand":"X"}')$q$, 'GEAR_PARTICULAR_ONLY');
reset role;

-- A purchase both sides confirmed lands in the buyer's Mi equipo, once.
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set status = 'sold', sold_at = now() where id = pg_temp.id('l_sold');
select set_config('app.allow_listing_admin_fields', '', true);
insert into public.transaction_claims(id, listing_id, seller_user_id, buyer_user_id, attribution_type, status)
values ('f3400000-0000-4000-8000-000000000001', pg_temp.id('l_sold'), pg_temp.id('seller'), pg_temp.id('buyer'), 'laria', 'confirmed');
insert into public.verified_transactions(id, claim_id, listing_id, seller_user_id, buyer_user_id, seller_identity_type, sold_at, verified_at, review_deadline)
values ('f3400000-0000-4000-8000-000000000002', 'f3400000-0000-4000-8000-000000000001', pg_temp.id('l_sold'), pg_temp.id('seller'), pg_temp.id('buyer'), 'particular', now(), now(), now() + interval '10 days');
do $$ begin
  perform pg_temp.check((select count(*) from public.gear_items where user_id = pg_temp.id('buyer') and source = 'purchase'
    and transaction_id = 'f3400000-0000-4000-8000-000000000002' and brand = 'Ibanez' and model = 'SR300' and category = 'basses') = 1, 'purchase added to Mi equipo');
end $$;

-- ------------------------------------------------------------------ buy-06 reminders

set local role authenticated;
select pg_temp.as_user('buyer');
do $$ declare bass uuid; pedal uuid; due date; begin
  bass := (select id from public.gear_items where user_id = auth.uid() and source = 'purchase');
  perform pg_temp.remember('gear_bass', bass);
  pedal := public.save_gear_item(null, '{"category":"pedals","instrument_type":"pedals","brand":"Boss","model":"DS-1"}');
  perform pg_temp.expect_error(format('select public.set_gear_reminder(%L, 3, current_date)', pedal), 'GEAR_REMINDER_NOT_APPLICABLE');
  perform pg_temp.expect_error(format('select public.set_gear_reminder(%L, 13, current_date)', bass), 'GEAR_REMINDER_INTERVAL_INVALID');
  -- Changed four months ago, every three months: due tomorrow at the earliest.
  due := public.set_gear_reminder(bass, 3, ((now() at time zone 'America/Lima')::date - 120));
  perform pg_temp.check(due = (now() at time zone 'America/Lima')::date + 1, 'overdue reminder starts tomorrow');
  perform pg_temp.check((select kind from public.gear_reminders where gear_item_id = bass) = 'strings', 'bass reminder is strings');
end $$;
reset role;

-- Store A stocks strings; the job sends once per day and names it.
insert into public.store_trade_settings(store_id, consumables) values (pg_temp.id('store_a'), array['strings']);
update public.gear_reminders set next_due_on = (now() at time zone 'America/Lima')::date where gear_item_id = pg_temp.id('gear_bass');
do $$ declare first_run integer; second_run integer; msg text; begin
  first_run := laria_private.run_gear_reminders(100);
  second_run := laria_private.run_gear_reminders(100);
  perform pg_temp.check(first_run = 1 and second_run = 0, format('reminders sent once (%s, %s)', first_run, second_run));
  select message into msg from public.notifications where user_id = pg_temp.id('buyer') and event_type = 'gear_reminder_due';
  perform pg_temp.check(msg like '%cuerdas%' and msg like '%ST Tienda A%', 'reminder names the store: ' || coalesce(msg, 'null'));
  perform pg_temp.check((select count(*) from laria_private.marketplace_email_deliveries where recipient_user_id = pg_temp.id('buyer') and event_type = 'gear_reminder_due'
    and context #>> '{selling,stores,0,slug}' = 'st-tienda-a') = 1, 'reminder e-mail queued with the store');
  perform pg_temp.check((select next_due_on from public.gear_reminders where gear_item_id = pg_temp.id('gear_bass')) > (now() at time zone 'America/Lima')::date, 'next reminder moved forward');
end $$;

set local role authenticated;
select pg_temp.as_user('buyer');
do $$ begin
  perform public.mark_gear_reminder_done(pg_temp.id('gear_bass'));
  perform pg_temp.check((select last_changed_on from public.gear_reminders where gear_item_id = pg_temp.id('gear_bass')) = (now() at time zone 'America/Lima')::date, 'done resets the date');
  perform pg_temp.check(public.stop_gear_reminder(pg_temp.id('gear_bass')), 'reminder stopped');
  perform pg_temp.check((select count(*) from public.gear_reminders) = 0, 'no reminder left');
  perform pg_temp.expect_error(format('select public.stop_gear_reminders_by_link(%L)', auth.uid()), 'permission denied');
end $$;
reset role;

-- ------------------------------------------------------------------ store settings

set local role authenticated;
select pg_temp.as_user('owner_d');
select pg_temp.expect_error($q$select public.set_store_trade_settings('{"buys_used":true,"buy_categories":["guitars"]}')$q$, 'STORE_NOT_VERIFIED');
select public.set_store_trade_settings('{"part_payment":true,"consumables":["strings"]}');
select pg_temp.as_user('seller');
select pg_temp.expect_error($q$select public.set_store_trade_settings('{"part_payment":true}')$q$, 'STORE_REQUIRED');
select pg_temp.as_user('owner_a');
select pg_temp.expect_error($q$select public.set_store_trade_settings('{"buys_used":true,"buy_categories":[]}')$q$, 'TRADE_CATEGORIES_REQUIRED');
select pg_temp.expect_error($q$select public.set_store_trade_settings('{"buys_used":true,"buy_categories":["guitars"],"note":"Llama al 999888777"}')$q$, 'TRADE_NOTE_INVALID');
select public.set_store_trade_settings('{"buys_used":true,"buy_categories":["guitars","amplifiers"],"consignment":true,"consumables":["strings"],"note":"Revisamos en tienda"}');
select pg_temp.as_user('owner_b');
select public.set_store_trade_settings('{"buys_used":true,"buy_categories":["guitars"]}');
select pg_temp.as_user('owner_c');
select public.set_store_trade_settings('{"buys_used":true,"buy_categories":["guitars"]}');
reset role;
set local role anon;
select pg_temp.check((select count(*) from public.store_trade_settings where buys_used) = 3, 'public reads what stores buy');
reset role;

-- ------------------------------------------------------------------ sell-02 offers from stores

-- Photos: the person uploads into their own folder for a request that does not exist yet.
set local role authenticated;
select pg_temp.as_user('seller');
insert into storage.objects(bucket_id, name, owner, owner_id) values
 ('trade-photos', pg_temp.id('seller')::text || '/' || pg_temp.id('trade_1')::text || '/1.jpg', pg_temp.id('seller'), pg_temp.id('seller')::text),
 ('trade-photos', pg_temp.id('seller')::text || '/' || pg_temp.id('trade_1')::text || '/2.jpg', pg_temp.id('seller'), pg_temp.id('seller')::text);
select pg_temp.expect_error(format($q$insert into storage.objects(bucket_id, name, owner_id) values ('trade-photos', %L, %L)$q$,
  pg_temp.id('buyer')::text || '/' || pg_temp.id('trade_2')::text || '/1.jpg', pg_temp.id('seller')::text), 'row-level security');
select pg_temp.expect_error(format($q$insert into storage.objects(bucket_id, name, owner_id) values ('trade-photos', %L, %L)$q$,
  pg_temp.id('seller')::text || '/' || pg_temp.id('trade_2')::text || '/7.jpg', pg_temp.id('seller')::text), 'row-level security');

do $$ declare result jsonb; fields jsonb; begin
  perform pg_temp.check(public.count_trade_stores('guitars', 'Lima') = 2, 'two Lima stores buy guitars');
  perform pg_temp.check(public.count_trade_stores('keyboards', 'Lima') = 0, 'nobody buys keyboards');
  perform pg_temp.check((public.count_trade_stores_by_category('Lima')->>'guitars')::int = 2
    and (public.count_trade_stores_by_category('Lima')->>'keyboards')::int = 0, 'sell page counts stores by category');
  fields := jsonb_build_object('kind', 'sell', 'category', 'guitars', 'instrument_type', 'electric_guitar', 'brand', 'Fender',
    'model', 'Telecaster', 'condition', 'Usado - buen estado', 'description', 'Telecaster mexicana con estuche, trastes en buen estado.',
    'city', 'Lima', 'region', 'Lima', 'asking_price_pen', 2500, 'gear_item_id', pg_temp.id('gear_tele'),
    'photos', jsonb_build_array(pg_temp.id('seller')::text || '/' || pg_temp.id('trade_1')::text || '/1.jpg',
                                pg_temp.id('seller')::text || '/' || pg_temp.id('trade_1')::text || '/2.jpg'));
  perform pg_temp.expect_error(format('select public.create_trade_request(%L, %L)', pg_temp.id('trade_2'), fields), 'TRADE_PHOTO_MISSING');
  perform pg_temp.expect_error(format('select public.create_trade_request(%L, %L)', pg_temp.id('trade_1'), fields || '{"description":"Llámame al 999 888 777 por favor"}'), 'TRADE_CONTACT_DETAILS');
  perform pg_temp.expect_error(format('select public.create_trade_request(%L, %L)', pg_temp.id('trade_1'), fields || '{"category":"keyboards","instrument_type":"keyboards"}'), 'TRADE_NO_STORES');
  result := public.create_trade_request(pg_temp.id('trade_1'), fields);
  perform pg_temp.check((result->>'stores')::int = 2, 'request reached two stores');
  -- Sending it twice is harmless.
  perform pg_temp.check((public.create_trade_request(pg_temp.id('trade_1'), fields)->>'repeated')::boolean, 'repeat is recognised');
  perform pg_temp.check(public.can_view_trade_photo(pg_temp.id('seller')::text || '/' || pg_temp.id('trade_1')::text || '/1.jpg'), 'requester views own photo');
  perform pg_temp.check(jsonb_array_length(public.get_my_trade_requests()) = 1, 'request listed');
  -- The photo folder of a sent request is closed.
  perform pg_temp.expect_error(format($q$insert into storage.objects(bucket_id, name, owner_id) values ('trade-photos', %L, %L)$q$,
    pg_temp.id('seller')::text || '/' || pg_temp.id('trade_1')::text || '/3.jpg', pg_temp.id('seller')::text), 'row-level security');
end $$;
reset role;

do $$ begin
  perform pg_temp.check((select count(*) from public.notifications where event_type = 'store_trade_request'
    and user_id in (pg_temp.id('owner_a'), pg_temp.id('owner_b'))) = 2, 'both Lima stores notified');
  perform pg_temp.check((select count(*) from public.notifications where event_type = 'store_trade_request' and user_id in (pg_temp.id('owner_c'), pg_temp.id('owner_d'))) = 0, 'other stores not notified');
  perform pg_temp.check((select count(*) from laria_private.marketplace_email_deliveries where event_type = 'store_trade_request') = 2, 'two store e-mails');
end $$;

set local role authenticated;
-- Store C (another region) and D (not verified) see nothing; A sees it without the person's contact.
select pg_temp.as_user('owner_c');
select pg_temp.check(jsonb_array_length(public.get_store_trade_inbox()) = 0, 'store C inbox empty');
select pg_temp.check(public.get_store_trade_request(pg_temp.id('trade_1')) is null, 'store C cannot read the request');
select pg_temp.check(not public.can_view_trade_photo(pg_temp.id('seller')::text || '/' || pg_temp.id('trade_1')::text || '/1.jpg'), 'store C cannot view photos');
select pg_temp.expect_error(format('select public.save_trade_offer(%L, 2000, null)', pg_temp.id('trade_1')), 'TRADE_NOT_FOUND');
select pg_temp.as_user('owner_d');
select pg_temp.check(jsonb_array_length(public.get_store_trade_inbox()) = 0, 'unverified store inbox empty');
select pg_temp.as_user('owner_a');
do $$ declare detail jsonb; begin
  perform pg_temp.check(jsonb_array_length(public.get_store_trade_inbox()) = 1, 'store A inbox has the request');
  detail := public.get_store_trade_request(pg_temp.id('trade_1'));
  perform pg_temp.check(detail->'contact' = 'null'::jsonb and detail::text not like '%999993001%' and detail::text not like '%Vendedora%', 'no contact before acceptance');
  perform pg_temp.check(public.can_view_trade_photo(pg_temp.id('seller')::text || '/' || pg_temp.id('trade_1')::text || '/1.jpg'), 'store A views photos');
  perform pg_temp.expect_error(format('select public.save_trade_offer(%L, 2100, %L)', pg_temp.id('trade_1'), 'escríbeme a tienda@correo.com'), 'TRADE_NOTE_INVALID');
  perform pg_temp.remember('offer_a', public.save_trade_offer(pg_temp.id('trade_1'), 2100, 'Pagamos en efectivo o transferencia'));
  perform public.save_trade_offer(pg_temp.id('trade_1'), 2200, 'Pagamos en efectivo o transferencia');
  perform pg_temp.expect_error('select count(*) from public.trade_offers', 'permission denied');
end $$;
select pg_temp.as_user('owner_b');
select pg_temp.remember('offer_b', public.save_trade_offer(pg_temp.id('trade_1'), 2000, null));
reset role;

do $$ begin
  perform pg_temp.check((select count(*) from public.notifications where user_id = pg_temp.id('seller') and event_type = 'gear_trade_offer') = 3, 'seller told of each offer and change');
  perform pg_temp.check((select count(*) from laria_private.marketplace_email_deliveries where recipient_user_id = pg_temp.id('seller') and event_type = 'gear_trade_offer') = 1, 'one e-mail for the first offer');
end $$;

set local role authenticated;
select pg_temp.as_user('buyer');
select pg_temp.expect_error(format('select public.accept_trade_offer(%L, null)', pg_temp.id('offer_a')), 'TRADE_OFFER_NOT_FOUND');
select pg_temp.check(public.get_my_trade_request(pg_temp.id('trade_1')) is null, 'other person cannot read the request');
select pg_temp.as_user('seller');
do $$ declare detail jsonb; begin
  detail := public.get_my_trade_request(pg_temp.id('trade_1'));
  perform pg_temp.check(jsonb_array_length(detail->'offers') = 2 and (detail #>> '{offers,0,amount_pen}')::int = 2200, 'offers sorted by amount');
  perform pg_temp.check(detail #> '{offers,0,contact}' = 'null'::jsonb, 'no store address before choosing');
  perform public.accept_trade_offer(pg_temp.id('offer_a'), null);
  detail := public.get_my_trade_request(pg_temp.id('trade_1'));
  perform pg_temp.check(detail->>'status' = 'accepted' and detail->>'drop_off_by' is not null, 'request accepted with a drop-off date');
  perform pg_temp.check(detail #>> '{offers,0,contact,address}' = 'Av. Larco 101' or detail #>> '{offers,0,contact,whatsapp_phone}' = '51999993011', 'store contact shown after choosing');
  perform pg_temp.check(detail #>> '{offers,1,status}' = 'declined', 'other offer declined');
  perform pg_temp.expect_error(format('select public.accept_trade_offer(%L, null)', pg_temp.id('offer_b')), 'TRADE_OFFER_CLOSED');
end $$;
select pg_temp.as_user('owner_b');
select pg_temp.check(public.get_store_trade_request(pg_temp.id('trade_1'))->'contact' = 'null'::jsonb, 'store B never sees the contact');
select pg_temp.expect_error(format('select public.close_trade_request(%L, true, 2000, null)', pg_temp.id('trade_1')), 'TRADE_NOT_FOUND');
select pg_temp.as_user('owner_a');
do $$ declare detail jsonb; begin
  detail := public.get_store_trade_request(pg_temp.id('trade_1'));
  perform pg_temp.check(detail #>> '{contact,whatsapp_phone}' = '51999993001' and detail #>> '{contact,name}' = 'Vendedora ST', 'store A sees the contact');
  perform pg_temp.expect_error(format('select public.close_trade_request(%L, true, null, null)', pg_temp.id('trade_1')), 'TRADE_AMOUNT_INVALID');
  perform pg_temp.check(public.close_trade_request(pg_temp.id('trade_1'), true, 2150, null), 'store closes the deal');
end $$;
reset role;
select pg_temp.check((select status from public.trade_requests where id = pg_temp.id('trade_1')) = 'completed', 'request completed');
select pg_temp.check((select count(*) from public.notifications where user_id = pg_temp.id('seller') and event_type = 'gear_trade_update') = 1, 'seller told of the result');

-- ------------------------------------------------------------------ run-04 part payment

set local role anon;
select pg_temp.check(not public.listing_accepts_part_payment(pg_temp.id('l_store')), 'part payment off by default');
reset role;
set local role authenticated;
select pg_temp.as_user('owner_a');
select public.set_store_trade_settings('{"buys_used":true,"buy_categories":["guitars","amplifiers"],"consignment":true,"part_payment":true,"consumables":["strings"]}');
select pg_temp.check(public.listing_accepts_part_payment(pg_temp.id('l_store')), 'store default turns it on');
select pg_temp.check(public.get_listing_selling_public(pg_temp.id('l_store')) @> '{"part_payment":false,"is_owner":true}', 'the owner is not offered part payment');
select pg_temp.check(not public.set_listing_part_payment(pg_temp.id('l_store'), false), 'listing can say no');
select pg_temp.check(public.set_listing_part_payment(pg_temp.id('l_store'), null), 'listing follows the store again');
select pg_temp.expect_error(format('select public.set_listing_part_payment(%L, true)', pg_temp.id('l_seller')), 'LISTING_NOT_FOUND');
select pg_temp.as_user('buyer');
select pg_temp.check(public.get_listing_selling_public(pg_temp.id('l_store')) @> '{"part_payment":true,"is_owner":false}', 'a buyer sees part payment');
insert into storage.objects(bucket_id, name, owner, owner_id) values
 ('trade-photos', pg_temp.id('buyer')::text || '/' || pg_temp.id('trade_pp')::text || '/1.jpg', pg_temp.id('buyer'), pg_temp.id('buyer')::text),
 ('trade-photos', pg_temp.id('buyer')::text || '/' || pg_temp.id('trade_pp')::text || '/2.jpg', pg_temp.id('buyer'), pg_temp.id('buyer')::text);
do $$ declare fields jsonb; begin
  fields := jsonb_build_object('kind', 'part_payment', 'listing_id', pg_temp.id('l_store'), 'gear_item_id', pg_temp.id('gear_bass'),
    'category', 'basses', 'instrument_type', 'bass', 'brand', 'Ibanez', 'model', 'SR300', 'condition', 'Usado - buen estado',
    'description', 'Bajo en buen estado, cuerdas nuevas.', 'city', 'Lima', 'region', 'Lima',
    'photos', jsonb_build_array(pg_temp.id('buyer')::text || '/' || pg_temp.id('trade_pp')::text || '/1.jpg',
                                pg_temp.id('buyer')::text || '/' || pg_temp.id('trade_pp')::text || '/2.jpg'));
  perform pg_temp.expect_error(format('select public.create_trade_request(%L, %L)', pg_temp.id('trade_pp'),
    fields || jsonb_build_object('listing_id', pg_temp.id('l_store_b'))), 'TRADE_LISTING_INVALID');
  perform pg_temp.check((public.create_trade_request(pg_temp.id('trade_pp'), fields)->>'stores')::int = 1, 'part payment goes to one store');
end $$;
select pg_temp.as_user('owner_b');
select pg_temp.check(public.get_store_trade_request(pg_temp.id('trade_pp')) is null, 'another store cannot see a part payment request');
select pg_temp.as_user('owner_a');
do $$ begin
  perform pg_temp.check(public.get_store_trade_request(pg_temp.id('trade_pp'))->'listing'->>'slug' = 'st-l2', 'listing store sees it');
  perform public.save_trade_offer(pg_temp.id('trade_pp'), 800, 'Estimado sujeto a revisión');
  perform pg_temp.check((public.get_listing_selling_tools(array[pg_temp.id('l_store')]) #>> array[pg_temp.id('l_store')::text, 'part_payment'])::boolean, 'tools show part payment');
end $$;
select pg_temp.as_user('buyer');
select pg_temp.check(public.withdraw_trade_request(pg_temp.id('trade_pp')), 'buyer withdraws');
reset role;

-- ------------------------------------------------------------------ sell-03 consignment

set local role authenticated;
select pg_temp.as_user('owner_b');
select pg_temp.expect_error(format('select public.create_consignment_invite(%L)', pg_temp.id('l_store_b')), 'CONSIGNMENT_NOT_ENABLED');
select pg_temp.as_user('owner_a');
do $$ declare invite jsonb; again jsonb; begin
  perform pg_temp.expect_error(format('select public.create_consignment_invite(%L)', pg_temp.id('l_store_b')), 'LISTING_NOT_FOUND');
  invite := public.create_consignment_invite(pg_temp.id('l_store'));
  again := public.create_consignment_invite(pg_temp.id('l_store'));
  perform pg_temp.check(invite->>'token' <> again->>'token', 'renewing gives a new link');
  perform set_config('qa.token_old', invite->>'token', true);
  perform set_config('qa.token', again->>'token', true);
  perform pg_temp.check((public.get_store_listing_consignment(pg_temp.id('l_store'))->>'status') = 'invited', 'store sees the invite');
end $$;
select pg_temp.as_user('seller');
do $$ declare consignment uuid; mine jsonb; begin
  perform pg_temp.check(public.get_consignment_invite(current_setting('qa.token_old')) is null, 'old link no longer works');
  perform pg_temp.check(public.get_consignment_invite(current_setting('qa.token'))->'store'->>'name' = 'ST Tienda A', 'invite page reads the store');
  consignment := public.accept_consignment_invite(current_setting('qa.token'));
  perform pg_temp.remember('consignment', consignment);
  perform pg_temp.expect_error(format('select public.accept_consignment_invite(%L)', current_setting('qa.token')), 'CONSIGNMENT_INVITE_INVALID');
  mine := public.get_my_consignments();
  perform pg_temp.check(jsonb_array_length(mine) = 1 and mine #>> '{0,listing,slug}' = 'st-l2' and (mine #>> '{0,views}') is not null, 'owner follows the listing');
end $$;
reset role;
set local role anon;
select pg_temp.check(public.get_listing_consignment(pg_temp.id('l_store'))->>'store_name' = 'ST Tienda A', 'listing shows the consignment label');
select pg_temp.check(public.get_listing_selling_public(pg_temp.id('l_store'))->'consignment'->>'store_name' = 'ST Tienda A'
  and jsonb_typeof(public.get_listing_selling_public(pg_temp.id('l_store'))->'private_offer') = 'null', 'anonymous listing extras: label, no offer');
reset role;
-- A sale closes it and tells the owner by e-mail too.
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set status = 'sold', sold_at = now() where id = pg_temp.id('l_store');
select set_config('app.allow_listing_admin_fields', '', true);
select pg_temp.check((select status from public.listing_consignments where id = pg_temp.id('consignment')) = 'sold', 'consignment marked sold');
select pg_temp.check((select count(*) from laria_private.marketplace_email_deliveries where recipient_user_id = pg_temp.id('seller') and event_type = 'listing_consignment_update') = 1, 'owner e-mailed on sale');
set local role anon;
select pg_temp.check(public.get_listing_consignment(pg_temp.id('l_store')) is null, 'no label after the sale');
reset role;

-- ------------------------------------------------------------------ sell-04 price steps

insert into public.favorites(user_id, listing_id, saved_price_pen) values (pg_temp.id('buyer'), pg_temp.id('l_seller'), 2000);
set local role authenticated;
select pg_temp.as_user('buyer');
select pg_temp.expect_error(format('select public.set_listing_price_steps(%L, 1500, 5, 7, true)', pg_temp.id('l_seller')), 'LISTING_NOT_OWNED');
select pg_temp.as_user('seller');
select pg_temp.expect_error(format('select public.set_listing_price_steps(%L, 2000, 5, 7, true)', pg_temp.id('l_seller')), 'PRICE_STEPS_FLOOR_INVALID');
select pg_temp.expect_error(format('select public.set_listing_price_steps(%L, 300, 5, 7, true)', pg_temp.id('l_seller')), 'PRICE_STEPS_FLOOR_TOO_LOW');
select pg_temp.expect_error(format('select public.set_listing_price_steps(%L, 1700, 7, 7, true)', pg_temp.id('l_seller')), 'PRICE_STEPS_PACE_INVALID');
select public.set_listing_price_steps(pg_temp.id('l_seller'), 1750, 10, 7, true);
reset role;

-- Not due yet: nothing happens. Due: one step of 10%, the saver hears through the price-drop alert.
do $$ declare steps integer; begin
  steps := laria_private.run_listing_price_steps(100);
  perform pg_temp.check(steps = 0 and (select price_pen from public.listings where id = pg_temp.id('l_seller')) = 2000, 'not due yet');
  update public.listing_price_steps set next_step_at = now() - interval '1 minute', created_at = now() - interval '8 days' where listing_id = pg_temp.id('l_seller');
  steps := laria_private.run_listing_price_steps(100);
  perform pg_temp.check(steps = 1 and (select price_pen from public.listings where id = pg_temp.id('l_seller')) = 1800, 'one 10% step applied');
  steps := laria_private.run_listing_price_steps(100);
  perform pg_temp.check(steps = 0 and (select price_pen from public.listings where id = pg_temp.id('l_seller')) = 1800, 'a second run the same day changes nothing');
  perform pg_temp.check((select count(*) from public.notifications where user_id = pg_temp.id('buyer') and event_type = 'listing_price_drop' and listing_id = pg_temp.id('l_seller')) = 1, 'saver told through the price-drop alert');
  perform pg_temp.check((select count(*) from public.notifications where user_id = pg_temp.id('seller') and event_type = 'listing_price_step') = 1, 'seller told of the step');
  -- A WhatsApp contact since the last step skips the next one.
  insert into public.marketplace_events(event_type, listing_id, seller_user_id, actor_user_id, session_id, source)
  values ('whatsapp_contact', pg_temp.id('l_seller'), pg_temp.id('seller'), pg_temp.id('buyer'), gen_random_uuid(), 'detail');
  update public.listing_price_steps set next_step_at = now() - interval '1 minute', last_step_at = now() - interval '7 days' where listing_id = pg_temp.id('l_seller');
  steps := laria_private.run_listing_price_steps(100);
  perform pg_temp.check(steps = 0 and (select price_pen from public.listings where id = pg_temp.id('l_seller')) = 1800, 'step skipped after a contact');
  -- The next step stops at the floor and finishes the rule.
  update public.listing_price_steps set next_step_at = now() - interval '1 minute', last_step_at = now() where listing_id = pg_temp.id('l_seller');
  steps := laria_private.run_listing_price_steps(100);
  perform pg_temp.check((select price_pen from public.listings where id = pg_temp.id('l_seller')) = 1750, 'floor respected');
  perform pg_temp.check((select status || ':' || finished_reason from public.listing_price_steps where listing_id = pg_temp.id('l_seller')) = 'finished:floor', 'rule finished at the floor');
end $$;

-- ------------------------------------------------------------------ sell-05 private offers

set local role authenticated;
select pg_temp.as_user('seller');
do $$ declare sent jsonb; begin
  perform pg_temp.expect_error(format('select public.send_private_offer(%L, 1800, 3, null)', pg_temp.id('l_seller')), 'PRIVATE_OFFER_PRICE_INVALID');
  perform pg_temp.expect_error(format('select public.send_private_offer(%L, 1600, 9, null)', pg_temp.id('l_seller')), 'PRIVATE_OFFER_DAYS_INVALID');
  perform pg_temp.expect_error(format('select public.send_private_offer(%L, 1600, 3, %L)', pg_temp.id('l_seller'), 'wsp 999 888 777'), 'PRIVATE_OFFER_MESSAGE_INVALID');
  perform pg_temp.check((public.get_private_offer_audience(pg_temp.id('l_seller'))->>'saves')::int = 1, 'audience counted');
  sent := public.send_private_offer(pg_temp.id('l_seller'), 1600, 3, 'Solo esta semana');
  perform pg_temp.check((sent->>'recipients')::int = 1, 'offer sent to the saver');
  perform pg_temp.expect_error(format('select public.send_private_offer(%L, 1500, 3, null)', pg_temp.id('l_seller')), 'PRIVATE_OFFER_TOO_SOON');
  perform pg_temp.check((select price_pen from public.listings where id = pg_temp.id('l_seller')) = 1750, 'public price unchanged');
  perform pg_temp.remember('private_offer', (sent->>'id')::uuid);
end $$;
select pg_temp.as_user('buyer');
select pg_temp.check((public.get_my_private_offer(pg_temp.id('l_seller'))->>'price_pen')::int = 1600, 'saver sees the offer');
select pg_temp.check((public.get_listing_selling_public(pg_temp.id('l_seller'))->'private_offer'->>'price_pen')::int = 1600, 'listing page shows the saver the offer');
select pg_temp.as_user('other');
select pg_temp.check(public.get_my_private_offer(pg_temp.id('l_seller')) is null, 'others do not');
select pg_temp.check(public.get_listing_selling_tools(array[pg_temp.id('l_seller')]) = '{}'::jsonb, 'tools are owner-only');
reset role;
select pg_temp.check((select count(*) from laria_private.marketplace_email_deliveries where recipient_user_id = pg_temp.id('buyer') and event_type = 'listing_private_offer') = 1, 'offer e-mail queued');
set local role authenticated;
select pg_temp.as_user('seller');
select pg_temp.check(public.cancel_private_offer(pg_temp.id('private_offer')), 'seller cancels');
select pg_temp.check(public.get_listing_selling_tools(array[pg_temp.id('l_seller')]) #>> array[pg_temp.id('l_seller')::text, 'price_steps'] = 'finished', 'tools show the finished rule');
select pg_temp.as_user('buyer');
select pg_temp.check(public.get_my_private_offer(pg_temp.id('l_seller')) is null, 'cancelled offer disappears');
reset role;

-- A person who turned price-drop e-mails off gets the next offer only in the app.
update public.listing_private_offers set created_at = now() - interval '8 days' where id = pg_temp.id('private_offer');
insert into public.email_preferences(user_id, price_drop_emails) values (pg_temp.id('buyer'), false)
on conflict (user_id) do update set price_drop_emails = false;
set local role authenticated;
select pg_temp.as_user('seller');
select public.send_private_offer(pg_temp.id('l_seller'), 1650, 1, null);
reset role;
select pg_temp.check((select count(*) from laria_private.marketplace_email_deliveries where recipient_user_id = pg_temp.id('buyer') and event_type = 'listing_private_offer') = 1, 'no e-mail when price drops are off');
select pg_temp.check((select count(*) from public.notifications where user_id = pg_temp.id('buyer') and event_type = 'listing_private_offer') = 2, 'still told in the app');

-- ------------------------------------------------------------------ jobs

do $$ declare result jsonb; begin
  -- Expiry: a sell request nobody chose in time.
  insert into public.trade_requests(id, kind, requester_user_id, category, instrument_type, brand, model, title, condition, description, region, photos,
    offers_until, decide_until, created_at)
  values ('f3300000-0000-4000-8000-000000000009', 'sell', pg_temp.id('other'), 'guitars', 'other', 'Yamaha', 'Pacifica', 'Yamaha Pacifica', 'Usado - buen estado',
    'Guitarra con detalles de uso.', 'Arequipa', array['a/b/1.jpg', 'a/b/2.jpg'], now() - interval '4 days', now() - interval '1 minute', now() - interval '5 days');
  result := laria_private.run_trade_request_expiry(100);
  perform pg_temp.check((result->>'expired')::int = 1, 'expired one request');
  result := laria_private.run_trade_request_expiry(100);
  perform pg_temp.check((result->>'expired')::int = 0, 'expiry runs once');
  perform pg_temp.check((select status from public.trade_requests where id = 'f3300000-0000-4000-8000-000000000009') = 'expired', 'status expired');
  -- Orphan photos: older than two days, for no request.
  insert into storage.objects(bucket_id, name, owner_id, created_at) values ('trade-photos', pg_temp.id('other')::text || '/f3300000-0000-4000-8000-0000000000aa/1.jpg', pg_temp.id('other')::text, now() - interval '3 days');
  perform pg_temp.check(laria_private.trade_photo_orphans(10) = array[pg_temp.id('other')::text || '/f3300000-0000-4000-8000-0000000000aa/1.jpg'], 'orphan photo listed');
  -- Photos of a request closed more than 90 days ago go too; the request keeps its text.
  insert into storage.objects(bucket_id, name, owner_id, created_at) values ('trade-photos', pg_temp.id('other')::text || '/f3300000-0000-4000-8000-000000000009/1.jpg', pg_temp.id('other')::text, now() - interval '100 days');
  perform pg_temp.check(not (pg_temp.id('other')::text || '/f3300000-0000-4000-8000-000000000009/1.jpg' = any(laria_private.trade_photo_orphans(10))), 'recently closed request keeps its photos');
  update public.trade_requests set closed_at = now() - interval '91 days' where id = 'f3300000-0000-4000-8000-000000000009';
  perform pg_temp.check(pg_temp.id('other')::text || '/f3300000-0000-4000-8000-000000000009/1.jpg' = any(laria_private.trade_photo_orphans(10)), 'old closed request photos listed');
end $$;

set local role authenticated;
select pg_temp.as_user('seller');
select pg_temp.expect_error($q$select public.run_selling_job('price-steps', 1)$q$, 'permission denied');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.check(public.run_selling_job('trade-offers', 10) ? 'orphan_photos', 'service role runs the trade job');
select pg_temp.check(public.run_selling_job('price-steps', 10) ? 'steps', 'service role runs the price job');
select pg_temp.check(public.run_selling_job('gear-reminders', 10) ? 'sent', 'service role runs the reminders job');
reset role;

rollback;
