-- Effortless Laria, inventory batch (docs/ux-effortless/inventory.md): undo (stock-03), the store's low-stock default
-- and daily summary (stock-06), price campaigns (stock-15), whole-selection bulk actions and the 2000 limit
-- (stock-14), categories (stock-20), positions and neighbours (stock-19), saved views (stock-17), the counter index
-- (big-10), reorder and demand (stock-07, stock-08) and purchase requests (stock-04, stock-23). Local/test database
-- only. Every fixture is rolled back. The fixes are in tests/ux-inventory-fixes.sql.
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
create function pg_temp.owner_a() returns void language sql as $$ select pg_temp.as_user('e5610000-0000-4000-8000-000000000001') $$;
create function pg_temp.owner_b() returns void language sql as $$ select pg_temp.as_user('e5610000-0000-4000-8000-000000000002') $$;

create function pg_temp.item(p_sku text) returns public.store_inventory_items language sql security definer as $$
  select * from public.store_inventory_items where merchant_sku = p_sku and store_id = 'e6610000-0000-4000-8000-000000000001'
$$;
create function pg_temp.movements(p_sku text) returns bigint language sql security definer as $$
  select count(*) from public.store_stock_movements where item_id = (pg_temp.item(p_sku)).id
$$;
create function pg_temp.first_movement(p_sku text) returns uuid language sql security definer as $$
  select id from public.store_stock_movements where item_id = (pg_temp.item(p_sku)).id order by created_at, id limit 1
$$;
create function pg_temp.round(p_price bigint, p_rounding text) returns bigint language sql security definer as $$
  select laria_private.inventory_round_price(p_price, p_rounding)
$$;
create function pg_temp.bulk_limit() returns integer language sql security definer as $$ select laria_private.inventory_bulk_limit() $$;
create function pg_temp.skus(p_filters jsonb, p_cursor jsonb default null, p_limit integer default 50) returns text[] language sql as $$
  select coalesce(array_agg(value->>'merchant_sku' order by ordinality), '{}')
  from jsonb_array_elements(public.get_inventory_page(p_filters, p_cursor, p_limit)->'items') with ordinality
$$;
-- Test-only: the ledger is append-only, so ageing a movement skips its triggers for one statement.
create function pg_temp.age_movements(p_sku text, p_age interval) returns void language plpgsql security definer as $$
begin
  perform set_config('session_replication_role', 'replica', true);
  update public.store_stock_movements set created_at = created_at - p_age where item_id = (pg_temp.item(p_sku)).id;
  perform set_config('session_replication_role', 'origin', true);
end $$;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e5610000-0000-4000-8000-000000000001','authenticated','authenticated','uxinv2-owner-a@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño A","phone":"51999995101","city":"Lima","region":"Lima"}'),
 ('e5610000-0000-4000-8000-000000000002','authenticated','authenticated','uxinv2-owner-b@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño B","phone":"51999995102","city":"Lima","region":"Lima"}'),
 ('e5610000-0000-4000-8000-000000000003','authenticated','authenticated','uxinv2-buyer@example.invalid',now(),'{}','{"account_type":"individual","full_name":"Compradora","phone":"51999995103","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('e6610000-0000-4000-8000-000000000001','uxinv2-a','Inventario UX2 A','Inventario UX2 A SAC','20999996611','uxinv2-a@example.invalid','Contacto A','Contacto A','51999995101','Lima','Lima','Av. QA 1','e5610000-0000-4000-8000-000000000001','active','free',true),
 ('e6610000-0000-4000-8000-000000000002','uxinv2-b','Inventario UX2 B','Inventario UX2 B SAC','20999996612','uxinv2-b@example.invalid','Contacto B','Contacto B','51999995102','Lima','Lima','Av. QA 2','e5610000-0000-4000-8000-000000000002','active','free',true);

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at) values
 ('e7610000-0000-4000-8000-000000000001','uxinv2-l1','Pedal de distorsión','store','approved','pedals','pedals','Boss','DS-1','Nuevo',300,'Lima','Lima','Contacto A','51999995101','Descripción de inventario válida con más de cuarenta caracteres.','e5610000-0000-4000-8000-000000000001','e6610000-0000-4000-8000-000000000001','self_service',now()),
 ('e7610000-0000-4000-8000-000000000002','uxinv2-l2','Afinador de pedal','store','approved','pedals','pedals','Boss','TU-3','Nuevo',350,'Lima','Lima','Contacto A','51999995101','Descripción de inventario válida con más de cuarenta caracteres.','e5610000-0000-4000-8000-000000000001','e6610000-0000-4000-8000-000000000001','self_service',now()),
 ('e7610000-0000-4000-8000-000000000003','uxinv2-l3','Pedal de otra tienda','store','approved','pedals','pedals','Boss','RC-1','Nuevo',500,'Lima','Lima','Contacto B','51999995102','Descripción de inventario válida con más de cuarenta caracteres.','e5610000-0000-4000-8000-000000000002','e6610000-0000-4000-8000-000000000002','self_service',now());
insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/uxinv2-' || l.slug || '-' || n || '.jpg', n
from public.listings l cross join generate_series(0, 1) n where l.slug like 'uxinv2-%';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal2","app_metadata":{"role":"admin"}}', true);
select public.admin_set_store_inventory_enabled('e6610000-0000-4000-8000-000000000001', true, 'Piloto UX');
select public.admin_set_store_inventory_enabled('e6610000-0000-4000-8000-000000000002', true, 'Piloto UX');

select pg_temp.owner_b();
select public.create_inventory_item('{"merchant_sku":"B-001","product_name":"Looper","listing_id":"e7610000-0000-4000-8000-000000000003"}'::jsonb, 3, 'qa-uxinv2-b1');

select pg_temp.owner_a();
select public.create_inventory_item('{"merchant_sku":"PED-001","product_name":"Distorsión naranja","listing_id":"e7610000-0000-4000-8000-000000000001","external_reference":"4957054010202","unit_price_pen":300}'::jsonb, 5, 'qa-uxinv2-1');
select public.create_inventory_item('{"merchant_sku":"PED-002","product_name":"Afinador","listing_id":"e7610000-0000-4000-8000-000000000002","unit_price_pen":350}'::jsonb, 2, 'qa-uxinv2-2');
select public.create_inventory_item('{"merchant_sku":"CUE-003","product_name":"Cuerdas 10-46","unit_price_pen":45}'::jsonb, 20, 'qa-uxinv2-3');
select public.create_inventory_item('{"merchant_sku":"CAB-004","product_name":"Cable 3 m"}'::jsonb, 0, 'qa-uxinv2-4');

-- ------------------------------------------------------------------ stock-03: undo a stock movement

-- Opening balances a minute older, so "latest movements" has a stable order inside this one transaction.
select pg_temp.age_movements(sku, interval '1 minute') from unnest(array['PED-001', 'PED-002', 'CUE-003', 'CAB-004']) sku;

do $$
declare
  sale jsonb := public.record_stock_movement((pg_temp.item('CUE-003')).id, 'sale', 2, 'tienda_fisica', null, null, null, 'qa-uxinv2-sale-1');
  sale_id uuid := (sale->'movement'->>'id')::uuid;
  undo jsonb;
begin
  perform pg_temp.check((pg_temp.item('CUE-003')).quantity_available = 18, 'the sale took 2 units');
  perform pg_temp.check((public.get_inventory_summary()->>'sales_30d_units')::integer = 2, 'the sale counts');
  undo := public.undo_stock_movements(array[sale_id], 'qa-uxinv2-undo-1');
  perform pg_temp.check((pg_temp.item('CUE-003')).quantity_available = 20, 'undo puts the units back');
  perform pg_temp.check(undo->'corrections'->0->>'movement_type' = 'correction', 'undo appends a correction');
  perform pg_temp.check(pg_temp.movements('CUE-003') = 3, 'the ledger keeps opening, sale and correction');
  perform pg_temp.check((public.get_inventory_summary()->>'sales_30d_units')::integer = 0, 'an undone sale is not a sale');
  perform pg_temp.check(exists (select 1 from jsonb_array_elements(public.get_inventory_summary()->'recent_movements') m
    where (m->>'id')::uuid = sale_id and (m->>'undone')::boolean), 'history marks the sale undone');
  perform pg_temp.check((public.undo_stock_movements(array[sale_id], 'qa-uxinv2-undo-1')->>'replayed')::boolean
    and (pg_temp.item('CUE-003')).quantity_available = 20, 'a retried undo replays and changes nothing');
  perform pg_temp.expect_error(format('select public.undo_stock_movements(array[%L]::uuid[], %L)', sale_id, 'qa-uxinv2-undo-2'), 'STOCK_UNDO_DONE');
  perform pg_temp.expect_error(format('select public.undo_stock_movements(array[%L]::uuid[], %L)',
    undo->'corrections'->0->>'id', 'qa-uxinv2-undo-3'), 'STOCK_UNDO_NOT_ALLOWED');
end $$;

do $$
declare opening uuid;
begin
  opening := pg_temp.first_movement('PED-001');
  perform pg_temp.expect_error(format('select public.undo_stock_movements(array[%L]::uuid[], %L)', opening, 'qa-uxinv2-undo-4'), 'STOCK_UNDO_NOT_ALLOWED');
end $$;

-- All or nothing: one expired movement stops the whole undo.
do $$
declare
  fresh uuid := (public.record_stock_movement((pg_temp.item('PED-001')).id, 'sale', 1, 'tienda_fisica', null, null, null, 'qa-uxinv2-sale-2')->'movement'->>'id')::uuid;
  old uuid := (public.record_stock_movement((pg_temp.item('PED-002')).id, 'sale', 1, 'tienda_fisica', null, null, null, 'qa-uxinv2-sale-3')->'movement'->>'id')::uuid;
begin
  perform pg_temp.age_movements('PED-002', interval '1 hour');
  perform pg_temp.expect_error(format('select public.undo_stock_movements(array[%L, %L]::uuid[], %L)', fresh, old, 'qa-uxinv2-undo-5'), 'STOCK_UNDO_EXPIRED');
  perform pg_temp.check((pg_temp.item('PED-001')).quantity_available = 4, 'nothing was undone');
  perform public.undo_stock_movements(array[fresh], 'qa-uxinv2-undo-6');
  perform pg_temp.check((pg_temp.item('PED-001')).quantity_available = 5, 'the fresh one alone can be undone');
end $$;

-- An undo that would leave negative stock is refused: undo a restock after the units were sold.
do $$
declare restock uuid := (public.record_stock_movement((pg_temp.item('CAB-004')).id, 'restock', 3, null, null, null, null, 'qa-uxinv2-restock-1')->'movement'->>'id')::uuid;
begin
  perform public.record_stock_movement((pg_temp.item('CAB-004')).id, 'sale', 2, 'tienda_fisica', null, null, null, 'qa-uxinv2-sale-4');
  perform pg_temp.expect_error(format('select public.undo_stock_movements(array[%L]::uuid[], %L)', restock, 'qa-uxinv2-undo-7'), 'STOCK_UNDO_INSUFFICIENT');
  perform public.record_stock_movement((pg_temp.item('CAB-004')).id, 'stock_count', 0, null, null, null,
    (pg_temp.item('CAB-004')).version, 'qa-uxinv2-count-1');
end $$;

-- Another store's movement is not found.
select pg_temp.owner_b();
do $$
declare foreign_id uuid;
begin
  foreign_id := pg_temp.first_movement('CUE-003');
  perform pg_temp.expect_error(format('select public.undo_stock_movements(array[%L]::uuid[], %L)', foreign_id, 'qa-uxinv2-undo-8'), 'STOCK_UNDO_NOT_FOUND');
end $$;
select pg_temp.owner_a();

-- ------------------------------------------------------------------ stock-06: default threshold and daily summary

do $$
declare result jsonb;
begin
  result := public.set_inventory_preferences('{"default_low_stock_threshold":3}', true);
  perform pg_temp.check((result->>'applied')::integer = 4, 'every SKU without a threshold takes the default: ' || result::text);
  perform pg_temp.check((pg_temp.item('PED-002')).low_stock_threshold = 3, 'the default applied');
  perform public.create_inventory_item('{"merchant_sku":"NEW-005","product_name":"Púas"}'::jsonb, 10, 'qa-uxinv2-5');
  perform pg_temp.check((pg_temp.item('NEW-005')).low_stock_threshold = 3, 'a new SKU takes the default');
  perform public.create_inventory_item('{"merchant_sku":"NEW-006","product_name":"Correa","low_stock_threshold":1}'::jsonb, 10, 'qa-uxinv2-6');
  perform pg_temp.check((pg_temp.item('NEW-006')).low_stock_threshold = 1, 'its own threshold wins');
  perform pg_temp.check((public.get_inventory_summary()->'preferences'->>'default_low_stock_threshold')::integer = 3, 'the summary returns it');
  perform pg_temp.expect_error($q$select public.set_inventory_preferences('{"inventory_enabled":true}')$q$, 'INVENTORY_FIELD_NOT_ALLOWED');
  perform pg_temp.expect_error($q$select public.set_inventory_preferences('{"default_low_stock_threshold":-1}')$q$, 'INVENTORY_FIELD_INVALID');
  perform public.set_inventory_preferences('{"daily_stock_summary":true,"pickup_hours":"Lun a sáb, 10 a 7"}');
end $$;

reset role;
do $$
declare sent integer;
begin
  sent := laria_private.send_inventory_daily_summaries();
  perform pg_temp.check(sent = 1, 'one summary for the store that turned it on, none for the other');
  perform pg_temp.check(laria_private.send_inventory_daily_summaries() = 0, 'once a day');
  perform pg_temp.check((select message from public.notifications where event_type = 'store_stock_summary'
    and store_id = 'e6610000-0000-4000-8000-000000000001') ~ '^Stock bajo: \d+ · Agotados hoy: \d+$', 'the message counts only');
  perform pg_temp.check(exists (select 1 from cron.job where jobname = 'inventory-daily-summary'), 'the daily job is scheduled');
end $$;
set local role authenticated;
select pg_temp.owner_a();

-- ------------------------------------------------------------------ stock-15: price campaigns

do $$
declare
  ids uuid[] := array[(pg_temp.item('PED-001')).id, (pg_temp.item('PED-002')).id, (pg_temp.item('CUE-003')).id];
  preview jsonb;
  campaign jsonb;
  reverted jsonb;
begin
  perform pg_temp.check(pg_temp.round(304, 'nine') = 299 and pg_temp.round(305, 'nine') = 309
    and pg_temp.round(5, 'nine') = 9 and pg_temp.round(304, 'none') = 304, 'rounding to …9');
  preview := public.preview_inventory_price_campaign(ids, 'percent', -10, 'nine');
  perform pg_temp.check((select (value->>'after')::integer from jsonb_array_elements(preview->'items') where value->>'merchant_sku' = 'PED-001') = 269,
    '300 − 10 % = 270, rounded to 269');
  campaign := public.apply_inventory_price_campaign(ids, 'percent', -10, 'nine', 'Cyber', 'qa-uxinv2-camp-1');
  perform pg_temp.check((pg_temp.item('PED-001')).unit_price_pen = 269 and (pg_temp.item('CUE-003')).unit_price_pen = 39, 'prices changed');
  perform pg_temp.check((select price_pen from public.listings where id = 'e7610000-0000-4000-8000-000000000001') = 269, 'the publication follows');
  perform pg_temp.check((public.apply_inventory_price_campaign(ids, 'percent', -10, 'nine', 'Cyber', 'qa-uxinv2-camp-1')->>'replayed')::boolean
    and (pg_temp.item('PED-001')).unit_price_pen = 269, 'a retry does not discount twice');
  -- The owner changes one price by hand; the revert leaves it.
  perform public.update_inventory_item((pg_temp.item('PED-002')).id, '{"unit_price_pen":330}', (pg_temp.item('PED-002')).version);
  reverted := public.revert_inventory_price_campaign((campaign->>'campaign_id')::uuid);
  perform pg_temp.check((pg_temp.item('PED-001')).unit_price_pen = 300 and (pg_temp.item('CUE-003')).unit_price_pen = 45, 'prices back');
  perform pg_temp.check((pg_temp.item('PED-002')).unit_price_pen = 330 and jsonb_array_length(reverted->'kept') = 1, 'a hand-made change is kept');
  perform pg_temp.check((public.revert_inventory_price_campaign((campaign->>'campaign_id')::uuid)->>'replayed')::boolean, 'one revert');
  perform pg_temp.expect_error(format('select public.apply_inventory_price_campaign(array[%L]::uuid[], %L, 10, %L, null, %L)',
    (pg_temp.item('CAB-004')).id, 'add', 'none', 'qa-uxinv2-camp-2'), 'INVENTORY_PRICE_MISSING');
end $$;

-- ------------------------------------------------------------------ stock-20 and stock-14: category and bulk actions

do $$
declare
  ids uuid[] := array[(pg_temp.item('CUE-003')).id, (pg_temp.item('CAB-004')).id, (pg_temp.item('PED-001')).id];
  result jsonb;
begin
  perform public.set_inventory_item_category((pg_temp.item('CUE-003')).id, 'strings', (pg_temp.item('CUE-003')).version);
  perform pg_temp.check((pg_temp.item('CUE-003')).category = 'strings', 'one SKU');
  perform pg_temp.expect_error(format('select public.set_inventory_item_category(%L, %L, %s)',
    (pg_temp.item('CUE-003')).id, 'not-a-category', (pg_temp.item('CUE-003')).version), 'INVENTORY_CATEGORY_INVALID');

  result := public.apply_inventory_bulk_action(ids, 'category', 'audio', null, 'qa-uxinv2-bulk-1');
  perform pg_temp.check(jsonb_array_length(result->'changed') = 3, 'bulk category');
  result := public.undo_inventory_batch('qa-uxinv2-bulk-1', 'qa-uxinv2-bulk-1-undo');
  perform pg_temp.check((pg_temp.item('CUE-003')).category = 'strings' and (pg_temp.item('CAB-004')).category is null, 'undo puts categories back');

  result := public.apply_inventory_bulk_action(ids, 'archive', null, null, 'qa-uxinv2-bulk-2');
  perform pg_temp.check(jsonb_array_length(result->'changed') = 2 and result->'skipped'->0->>'reason' = 'listing_public',
    'a SKU with a public publication is skipped, not an error');
  perform pg_temp.check((pg_temp.item('CAB-004')).inventory_status = 'archived', 'archived');
  perform public.undo_inventory_batch('qa-uxinv2-bulk-2', 'qa-uxinv2-bulk-2-undo');
  perform pg_temp.check((pg_temp.item('CAB-004')).inventory_status = 'active', 'undo reactivates');
  perform pg_temp.expect_error($q$select public.undo_inventory_batch('qa-uxinv2-bulk-2', 'qa-uxinv2-bulk-2-undo-b')$q$, 'STOCK_UNDO_DONE');

  perform public.hide_inventory_listings_bulk(array[(pg_temp.item('PED-002')).id], 'qa-uxinv2-hide-1');
  result := public.apply_inventory_bulk_action(array[(pg_temp.item('PED-002')).id, (pg_temp.item('CAB-004')).id], 'restore', null, null, 'qa-uxinv2-bulk-3');
  perform pg_temp.check(jsonb_array_length(result->'changed') = 1 and result->'skipped'->0->>'reason' = 'not_linked', 'restore what the store hid');
  perform pg_temp.check((select status from public.listings where id = 'e7610000-0000-4000-8000-000000000002') = 'approved', 'public again');
end $$;

-- The 200 limit is now 2000, and 2001 is refused.
do $$ begin
  perform pg_temp.expect_error(format('select public.set_inventory_threshold_bulk(%L::uuid[], 1, %L)',
    (select array_agg(gen_random_uuid()) from generate_series(1, 2001)), 'qa-uxinv2-limit'), 'INVENTORY_BULK_INVALID');
  perform pg_temp.check(pg_temp.bulk_limit() = 2000, 'limit');
  perform pg_temp.check(position('inventory_bulk_limit' in pg_get_functiondef('public.apply_bulk_stock_operations(jsonb,text)'::regprocedure)) > 0
    and position('inventory_bulk_limit' in pg_get_functiondef('public.hide_inventory_listings_bulk(uuid[],text)'::regprocedure)) > 0, 'patched');
end $$;

-- A threshold batch can be undone.
do $$
declare ids uuid[] := array[(pg_temp.item('CUE-003')).id, (pg_temp.item('NEW-006')).id];
begin
  perform public.set_inventory_threshold_bulk(ids, 7, 'qa-uxinv2-thr-1');
  perform public.undo_inventory_batch('qa-uxinv2-thr-1', 'qa-uxinv2-thr-1-undo');
  perform pg_temp.check((pg_temp.item('CUE-003')).low_stock_threshold = 3 and (pg_temp.item('NEW-006')).low_stock_threshold = 1, 'thresholds back');
  perform pg_temp.expect_error($q$select public.undo_inventory_batch('qa-uxinv2-camp-1', 'qa-uxinv2-camp-undo')$q$, 'STOCK_UNDO_NOT_ALLOWED');
end $$;

-- ------------------------------------------------------------------ stock-19, stock-17, stock-14: positions, views, ids

do $$
declare
  first_page jsonb := public.get_inventory_page('{"sort":"name"}', null, 2);
  second_page jsonb := public.get_inventory_page('{"sort":"name"}', first_page->'next_cursor', 2);
  third_page jsonb := public.get_inventory_page('{"sort":"name"}', second_page->'next_cursor', 2);
  neighbors jsonb;
  view jsonb;
begin
  perform pg_temp.check((first_page->>'total')::integer = 6 and (first_page->>'offset')::integer = 0
    and not (first_page->>'has_prev')::boolean, 'page 1 of 6: ' || (first_page - 'items')::text);
  perform pg_temp.check((second_page->>'offset')::integer = 2 and (second_page->>'has_prev')::boolean
    and second_page->'prev_cursor' = 'null'::jsonb, 'page 2 goes back to the first page');
  perform pg_temp.check((third_page->>'offset')::integer = 4 and third_page->'next_cursor' = 'null'::jsonb, 'page 3 is the last');
  perform pg_temp.check(pg_temp.skus('{"sort":"name"}', third_page->'prev_cursor', 2) = pg_temp.skus('{"sort":"name"}', first_page->'next_cursor', 2),
    'the previous cursor of page 3 opens page 2');
  perform pg_temp.check(pg_temp.skus('{"sort":"name"}') = array['PED-002', 'CAB-004', 'NEW-006', 'CUE-003', 'PED-001', 'NEW-005'], 'name order');

  neighbors := public.get_inventory_neighbors((pg_temp.item('NEW-006')).id, '{"sort":"name"}');
  perform pg_temp.check((neighbors->>'position')::integer = 3 and (neighbors->>'previous_id')::uuid = (pg_temp.item('CAB-004')).id
    and (neighbors->>'next_id')::uuid = (pg_temp.item('CUE-003')).id, 'neighbours: ' || neighbors::text);
  perform pg_temp.check(public.get_inventory_neighbors((pg_temp.item('PED-002')).id, '{"sort":"name"}')->'previous_id' = 'null'::jsonb, 'first has no previous');

  perform pg_temp.check(pg_temp.skus('{"price":"none"}') = array['CAB-004'] or pg_temp.skus('{"price":"none"}') @> array['CAB-004'], 'Sin precio');
  perform pg_temp.check(not (pg_temp.skus('{"price":"none"}') && array['PED-001']), 'priced SKUs are not "sin precio"');
  perform pg_temp.check((public.get_inventory_item_ids('{"price":"none"}')->>'total')::integer = cardinality(pg_temp.skus('{"price":"none"}')), 'ids match the page');
  perform pg_temp.check(jsonb_array_length(public.get_inventory_item_ids('{}')->'ids') = 6, 'every id of the view');
  perform pg_temp.expect_error($q$select public.get_inventory_page('{"price":"cheap"}')$q$, 'INVENTORY_FILTER_INVALID');

  view := public.save_inventory_view('Para reponer', '{"stock":"low","q":""}');
  perform pg_temp.check(view->'filters' = '{"stock":"low"}'::jsonb, 'empty filters are dropped');
  perform public.save_inventory_view('Para reponer', '{"stock":"out"}');
  perform pg_temp.check((select count(*) from public.store_inventory_views) = 1
    and (select filters->>'stock' from public.store_inventory_views) = 'out', 'the same name replaces');
  perform pg_temp.expect_error($q$select public.save_inventory_view('Mala', '{"store_id":"x"}')$q$, 'INVENTORY_FILTER_INVALID');
  perform pg_temp.expect_error($q$select public.save_inventory_view('Mala', '{"stock":"lots"}')$q$, 'INVENTORY_FILTER_INVALID');
  perform set_config('qa.saved_view', (select id::text from public.store_inventory_views), true);
end $$;

select pg_temp.owner_b();
do $$ begin
  perform pg_temp.check((select count(*) from public.store_inventory_views) = 0, 'views are private to the store');
  perform pg_temp.check((public.delete_inventory_view(current_setting('qa.saved_view')::uuid)->>'deleted')::boolean = false,
    'another store cannot delete a view');
  perform pg_temp.check((public.get_inventory_neighbors((pg_temp.item('NEW-006')).id, '{}')->>'position') is null, 'no neighbours across stores');
  perform pg_temp.check(jsonb_array_length(public.get_counter_index()->'items') = 1, 'the counter sees only its store');
end $$;
select pg_temp.owner_a();
do $$ begin
  perform pg_temp.check((select count(*) from public.store_inventory_views) = 1, 'the view outlived the other store''s delete');
  perform pg_temp.check((public.delete_inventory_view(current_setting('qa.saved_view')::uuid)->>'deleted')::boolean, 'the owner deletes a view');
  perform pg_temp.check((select count(*) from public.store_inventory_views) = 0, 'the view is gone');
end $$;

-- ------------------------------------------------------------------ big-10, stock-08, stock-07

do $$
declare
  counter jsonb := public.get_counter_index();
  reorder jsonb;
begin
  perform pg_temp.check(exists (select 1 from jsonb_array_elements(counter->'items') e
    where e->>'external_reference' = '4957054010202' and e->>'merchant_sku' = 'PED-001'), 'the counter carries barcodes');
  -- PED-002 sells out; people saved and asked about it.
  perform public.record_stock_movement((pg_temp.item('PED-002')).id, 'sale', 1, 'tienda_fisica', null, null, null, 'qa-uxinv2-sale-5');
end $$;
reset role;
insert into public.favorites(user_id, listing_id) values ('e5610000-0000-4000-8000-000000000003', 'e7610000-0000-4000-8000-000000000002');
insert into public.marketplace_events(event_type, listing_id, store_id, source, metadata)
values ('whatsapp_contact', 'e7610000-0000-4000-8000-000000000002', 'e6610000-0000-4000-8000-000000000001', 'detail', '{}');
set local role authenticated;
select pg_temp.owner_a();
do $$
declare demand jsonb := public.get_out_of_stock_demand();
  reorder jsonb := public.get_reorder_list();
  row_value jsonb;
begin
  perform pg_temp.check(jsonb_array_length(demand) = 1 and demand->0->>'merchant_sku' = 'PED-002'
    and (demand->0->>'favorites')::integer = 1 and (demand->0->>'contacts_90d')::integer = 1, 'demand: ' || demand::text);
  select value into row_value from jsonb_array_elements(reorder->'items') where value->>'merchant_sku' = 'PED-002';
  -- Sold 1 kept (the other was undone? no: PED-002's sale of 1 aged an hour, plus this one): 2 sales, threshold 3, 0 left.
  perform pg_temp.check((row_value->>'sales_30d')::integer = 2 and (row_value->>'suggested')::integer = 4,
    'suggested = max(sales 30 d, threshold + 1) − available: ' || row_value::text);
  perform pg_temp.check(not exists (select 1 from jsonb_array_elements(reorder->'items') where value->>'merchant_sku' = 'NEW-005'), 'stocked SKUs are not listed');
end $$;

-- ------------------------------------------------------------------ stock-04 and stock-23: purchase requests

reset role;
insert into public.marketplace_events(id, event_type, listing_id, store_id, actor_user_id, source, metadata) values
 ('e8610000-0000-4000-8000-000000000001', 'whatsapp_contact', 'e7610000-0000-4000-8000-000000000001', 'e6610000-0000-4000-8000-000000000001', 'e5610000-0000-4000-8000-000000000003', 'detail', '{"intent":"purchase"}'),
 ('e8610000-0000-4000-8000-000000000002', 'whatsapp_contact', 'e7610000-0000-4000-8000-000000000001', 'e6610000-0000-4000-8000-000000000001', null, 'detail', '{"intent":"purchase"}'),
 ('e8610000-0000-4000-8000-000000000003', 'whatsapp_contact', 'e7610000-0000-4000-8000-000000000003', 'e6610000-0000-4000-8000-000000000002', null, 'detail', '{"intent":"purchase"}');
set local role authenticated;
select pg_temp.owner_a();
do $$
declare
  list jsonb := public.get_store_purchase_requests();
  sale jsonb;
begin
  perform pg_temp.check((list->>'waiting')::integer = 2 and public.get_store_purchase_request_count() = 2, 'two waiting, the plain contact is not one');
  perform pg_temp.check((select count(*) from jsonb_array_elements(list->'requests') r where r->>'buyer_name' = 'Compradora') = 1
    and (select count(*) from jsonb_array_elements(list->'requests') r where not (r->>'signed_in')::boolean and r->>'buyer_name' is null) = 1,
    'a signed-in buyer is named, a visitor is not');
  perform public.mark_store_purchase_request('e8610000-0000-4000-8000-000000000002', 'not_sold');
  perform pg_temp.check(public.get_store_purchase_request_count() = 1, 'a marked request stops waiting');
  perform pg_temp.check(jsonb_array_length(public.get_store_purchase_requests('all')->'requests') = 2, 'all keeps it');

  sale := public.record_purchase_request_sale('e8610000-0000-4000-8000-000000000001', 2, null, 'qa-uxinv2-pr-1');
  perform pg_temp.check((pg_temp.item('PED-001')).quantity_available = 3, 'the sale is recorded in Inventario');
  perform pg_temp.check((select channel::text from public.store_stock_movements where id = (sale->>'movement_id')::uuid) = 'whatsapp_laria', 'channel');
  perform pg_temp.check((public.record_purchase_request_sale('e8610000-0000-4000-8000-000000000001', 2, null, 'qa-uxinv2-pr-2')->>'replayed')::boolean
    and (pg_temp.item('PED-001')).quantity_available = 3, 'a second "Vendido" never sells twice');
  perform pg_temp.expect_error($q$select public.mark_store_purchase_request('e8610000-0000-4000-8000-000000000001', 'answered')$q$, 'PURCHASE_REQUEST_SOLD');
  -- Undo the sale: the request can be marked again, and sold again.
  perform public.undo_stock_movements(array[(sale->>'movement_id')::uuid], 'qa-uxinv2-pr-undo');
  perform pg_temp.check((pg_temp.item('PED-001')).quantity_available = 5, 'the undone sale gave the units back');
  perform public.mark_store_purchase_request('e8610000-0000-4000-8000-000000000001', null);
  perform pg_temp.check(public.get_store_purchase_request_count() = 1, 'back to waiting');
  perform public.record_purchase_request_sale('e8610000-0000-4000-8000-000000000001', 1, null, 'qa-uxinv2-pr-4');
  perform pg_temp.check((pg_temp.item('PED-001')).quantity_available = 4, 'sold again after the undo');
  perform pg_temp.expect_error($q$select public.mark_store_purchase_request('e8610000-0000-4000-8000-000000000003', 'answered')$q$, 'PURCHASE_REQUEST_NOT_FOUND');
  perform pg_temp.expect_error($q$select public.record_purchase_request_sale('e8610000-0000-4000-8000-000000000002', 99, null, 'qa-uxinv2-pr-3')$q$, 'STOCK_');
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform pg_temp.expect_error($q$select public.get_store_purchase_requests()$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.undo_stock_movements(array[gen_random_uuid()], 'qa-anon-key-1')$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.get_counter_index()$q$, 'permission denied');
  perform pg_temp.expect_error($q$select laria_private.send_inventory_daily_summaries()$q$, 'permission denied');
end $$;
reset role;

rollback;
