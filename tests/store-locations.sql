-- Feature ideas, store-locations batch (docs/feature-ideas/store-locations.md), run-02 "Sedes": stock per location,
-- transfers, Mostrador per location, counts per location, undo, archive and the public reads. Local/test database
-- only. Every fixture is rolled back.
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
create function pg_temp.owner_a() returns void language sql as $$ select pg_temp.as_user('5f810000-0000-4000-8000-000000000001') $$;
create function pg_temp.owner_b() returns void language sql as $$ select pg_temp.as_user('5f810000-0000-4000-8000-000000000002') $$;

-- Reads that bypass row-level security, for the checks.
create function pg_temp.item(p_sku text) returns public.store_inventory_items language sql security definer as $$
  select * from public.store_inventory_items where merchant_sku = p_sku
$$;
create function pg_temp.loc(p_name text) returns uuid language sql security definer as $$
  select id from public.store_locations where name = p_name and archived_at is null
$$;
create function pg_temp.at(p_sku text, p_name text) returns integer language sql security definer as $$
  select coalesce((select s.quantity_on_hand from public.store_location_stock s
    join public.store_inventory_items i on i.id = s.item_id
    join public.store_locations l on l.id = s.location_id
    where i.merchant_sku = p_sku and l.name = p_name and l.archived_at is null), 0)
$$;
create function pg_temp.last_movement(p_sku text) returns public.store_stock_movements language sql security definer as $$
  select m.* from public.store_stock_movements m join public.store_inventory_items i on i.id = m.item_id
  where i.merchant_sku = p_sku order by m.item_version_after desc limit 1
$$;
-- Runs the commit-time check now, then goes back to checking at commit.
create function pg_temp.verify() returns void language plpgsql as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end $$;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('5f810000-0000-4000-8000-000000000001','authenticated','authenticated','sl-owner-a@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueña A","phone":"51999994801","city":"Lima","region":"Lima"}'),
 ('5f810000-0000-4000-8000-000000000002','authenticated','authenticated','sl-owner-b@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño B","phone":"51999994802","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('5f820000-0000-4000-8000-000000000001','sl-a','Tienda Sedes A','Tienda Sedes A SAC','20999995801','sl-a@example.invalid','Contacto A','Contacto A','51999994801','Lima','Lima','Av. Prueba 1','5f810000-0000-4000-8000-000000000001','active','free',true),
 ('5f820000-0000-4000-8000-000000000002','sl-b','Tienda Sedes B','Tienda Sedes B SAC','20999995802','sl-b@example.invalid','Contacto B','Contacto B','51999994802','Lima','Lima','Av. Prueba 2','5f810000-0000-4000-8000-000000000002','active','free',true);

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at) values
 ('5f830000-0000-4000-8000-000000000001','sl-gtr','Guitarra en dos sedes','store','approved','guitars','electric_guitar','Fender','Player','Nuevo',3500,'Lima','Lima','Contacto A','51999994801','Descripción de prueba válida con más de cuarenta caracteres.','5f810000-0000-4000-8000-000000000001','5f820000-0000-4000-8000-000000000001','self_service',now());
insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/' || l.slug || '-' || n || '.jpg', n
from public.listings l cross join generate_series(0, 1) n where l.slug like 'sl-%';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal2","app_metadata":{"role":"admin"}}', true);
select public.admin_set_store_inventory_enabled('5f820000-0000-4000-8000-000000000001', true, 'Piloto sedes');
select public.admin_set_store_inventory_enabled('5f820000-0000-4000-8000-000000000002', true, 'Piloto sedes');

select pg_temp.owner_a();
select public.create_inventory_item('{"merchant_sku":"SL-GTR","product_name":"Guitarra en dos sedes","listing_id":"5f830000-0000-4000-8000-000000000001","unit_price_pen":3500}'::jsonb, 5, 'qa-sl-gtr');
select public.create_inventory_item('{"merchant_sku":"SL-CAB","product_name":"Cable"}'::jsonb, 2, 'qa-sl-cab');
select public.create_inventory_item('{"merchant_sku":"SL-PUA","product_name":"Púas"}'::jsonb, 0, 'qa-sl-pua');

-- ================================================================== without locations nothing changes

select pg_temp.check((pg_temp.last_movement('SL-GTR')).location_id is null and (pg_temp.last_movement('SL-GTR')).location_split is null,
  'a store without locations records movements as before');
select pg_temp.check(jsonb_array_length(public.get_store_locations()->'locations') = 0, 'no locations yet');

-- ================================================================== the first location takes every unit

select public.save_store_location(null, '{"name":"Miraflores","region":"Lima","city":"Lima","district":"Miraflores","address":"Av. Larco 123","show_address":true}');
select pg_temp.verify();
select pg_temp.check(pg_temp.at('SL-GTR', 'Miraflores') = 5 and pg_temp.at('SL-CAB', 'Miraflores') = 2,
  'the first location receives the whole stock');
select pg_temp.check((public.get_store_locations()->'locations'->0->>'is_primary')::boolean, 'the first location is the main one');

select public.save_store_location(null, '{"name":"Centro","region":"Lima","city":"Lima","district":"Cercado de Lima","address":"Jr. de la Unión 456"}');
select pg_temp.check(pg_temp.at('SL-GTR', 'Centro') = 0 and (pg_temp.item('SL-GTR')).quantity_on_hand = 5,
  'a second location starts empty and the total is unchanged');
select pg_temp.expect_error($$select public.save_store_location(null, '{"name":" centro ","region":"Lima","city":"Lima"}')$$,
  'STORE_LOCATION_NAME_TAKEN');
select pg_temp.expect_error($$select public.save_store_location(null, '{"name":"X","region":"Lima","city":"Lima"}')$$,
  'STORE_LOCATION_NAME');
select pg_temp.expect_error($$select public.save_store_location(null, '{"name":"Sur","region":"Lima"}')$$,
  'STORE_LOCATION_PLACE');
select pg_temp.expect_error($$select public.save_store_location(null, '{"name":"Sur","region":"Lima","city":"Lima","show_address":true}')$$,
  'STORE_LOCATION_ADDRESS');
select pg_temp.expect_error($$select public.save_store_location(null, '{"name":"Sur","region":"Lima","city":"Lima","price":1}')$$,
  'STORE_LOCATION_INVALID');

-- ================================================================== transfers

select public.transfer_location_stock((pg_temp.item('SL-GTR')).id, pg_temp.loc('Miraflores'), pg_temp.loc('Centro'), 2, 'Vitrina', 'qa-sl-transfer-1');
select pg_temp.verify();
select pg_temp.check(pg_temp.at('SL-GTR', 'Miraflores') = 3 and pg_temp.at('SL-GTR', 'Centro') = 2
  and (pg_temp.item('SL-GTR')).quantity_on_hand = 5, 'a transfer moves units and keeps the total');
-- Replay with the same key: one transfer only.
select pg_temp.check((public.transfer_location_stock((pg_temp.item('SL-GTR')).id, pg_temp.loc('Miraflores'), pg_temp.loc('Centro'), 2, 'Vitrina', 'qa-sl-transfer-1')->>'replayed')::boolean
  and pg_temp.at('SL-GTR', 'Centro') = 2, 'a retried transfer is replayed');
select pg_temp.expect_error(format($$select public.transfer_location_stock(%L, %L, %L, 2, null, 'qa-sl-transfer-1')$$,
  (pg_temp.item('SL-GTR')).id, pg_temp.loc('Centro'), pg_temp.loc('Miraflores')), 'IDEMPOTENCY_KEY_REUSED');
select pg_temp.expect_error(format($$select public.transfer_location_stock(%L, %L, %L, 9, null, 'qa-sl-transfer-2')$$,
  (pg_temp.item('SL-GTR')).id, pg_temp.loc('Centro'), pg_temp.loc('Miraflores')), 'STORE_LOCATION_STOCK_SHORT');
select pg_temp.expect_error(format($$select public.transfer_location_stock(%L, %L, %L, 1, null, 'qa-sl-transfer-3')$$,
  (pg_temp.item('SL-GTR')).id, pg_temp.loc('Centro'), pg_temp.loc('Centro')), 'STORE_LOCATION_TRANSFER_SAME');

-- ================================================================== movements at a location

select public.record_location_stock_movement(pg_temp.loc('Centro'), (pg_temp.item('SL-GTR')).id, 'sale', 2, 'tienda_fisica', 'Mostrador', null, null, 'qa-sl-sale-centro');
select pg_temp.verify();
select pg_temp.check(pg_temp.at('SL-GTR', 'Centro') = 0 and pg_temp.at('SL-GTR', 'Miraflores') = 3
  and (pg_temp.item('SL-GTR')).quantity_on_hand = 3, 'a sale at Centro takes units from Centro');
select pg_temp.check((pg_temp.last_movement('SL-GTR')).location_id = pg_temp.loc('Centro'), 'the movement says where');
-- Units elsewhere do not make a sale possible here.
select pg_temp.expect_error(format($$select public.record_location_stock_movement(%L, %L, 'sale', 1, 'tienda_fisica', null, null, null, 'qa-sl-sale-short')$$,
  pg_temp.loc('Centro'), (pg_temp.item('SL-GTR')).id), 'STORE_LOCATION_STOCK_SHORT');

-- Undo puts the units back where they came from.
select public.undo_stock_movements(array[(pg_temp.last_movement('SL-GTR')).id], 'qa-sl-undo-centro');
select pg_temp.verify();
select pg_temp.check(pg_temp.at('SL-GTR', 'Centro') = 2 and (pg_temp.item('SL-GTR')).quantity_on_hand = 5,
  'undoing the Centro sale returns the units to Centro');

-- A movement without a location (Inventario, purchase requests, imports) takes from the main location first.
select public.record_stock_movement((pg_temp.item('SL-GTR')).id, 'sale', 4, 'whatsapp_laria', null, null, null, 'qa-sl-sale-any');
select pg_temp.verify();
select pg_temp.check(pg_temp.at('SL-GTR', 'Miraflores') = 0 and pg_temp.at('SL-GTR', 'Centro') = 1,
  'a sale without a location empties the main one first, then the next');
select pg_temp.check((pg_temp.last_movement('SL-GTR')).location_id is null
  and (pg_temp.last_movement('SL-GTR')).location_split = jsonb_build_object(pg_temp.loc('Miraflores')::text, -3, pg_temp.loc('Centro')::text, -1),
  'a split movement records every location');
select public.record_stock_movement((pg_temp.item('SL-GTR')).id, 'restock', 6, null, null, null, null, 'qa-sl-restock');
select pg_temp.check(pg_temp.at('SL-GTR', 'Miraflores') = 6, 'a restock without a location goes to the main one');
-- An item-level count moves the total by the difference, through the same rule.
select public.record_stock_movement((pg_temp.item('SL-GTR')).id, 'stock_count', 5, null, null, null, (pg_temp.item('SL-GTR')).version, 'qa-sl-count-total');
select pg_temp.verify();
select pg_temp.check(pg_temp.at('SL-GTR', 'Miraflores') = 4 and pg_temp.at('SL-GTR', 'Centro') = 1, 'an item count adjusts the main location');

-- A count at one location: the counted units, the total follows.
select public.record_location_stock_movement(pg_temp.loc('Centro'), (pg_temp.item('SL-GTR')).id, 'stock_count', 3, null, null, null, (pg_temp.item('SL-GTR')).version, 'qa-sl-count-centro');
select pg_temp.verify();
select pg_temp.check(pg_temp.at('SL-GTR', 'Centro') = 3 and pg_temp.at('SL-GTR', 'Miraflores') = 4
  and (pg_temp.item('SL-GTR')).quantity_on_hand = 7, 'a count at Centro sets Centro and the total follows');
select pg_temp.check((public.record_location_stock_movement(pg_temp.loc('Centro'), (pg_temp.item('SL-GTR')).id, 'stock_count', 3, null, null, null, (pg_temp.item('SL-GTR')).version, 'qa-sl-count-centro')->>'replayed')::boolean,
  'a retried count is replayed');
select pg_temp.expect_error(format($$select public.record_location_stock_movement(%L, %L, 'stock_count', 3, null, null, null, (pg_temp.item('SL-GTR')).version, 'qa-sl-count-centro')$$,
  pg_temp.loc('Miraflores'), (pg_temp.item('SL-GTR')).id), 'IDEMPOTENCY_KEY_REUSED');
select pg_temp.expect_error(format($$select public.record_location_stock_movement(%L, %L, 'import_reconciliation', 3, null, null, null, null, 'qa-sl-bad-type')$$,
  pg_temp.loc('Centro'), (pg_temp.item('SL-GTR')).id), 'STOCK_MOVEMENT_TYPE_INVALID');

-- ================================================================== Mostrador at a location

select public.apply_location_bulk_stock_operations(pg_temp.loc('Centro'), jsonb_build_array(
  jsonb_build_object('item_id', (pg_temp.item('SL-GTR')).id, 'type', 'sale', 'quantity', 1, 'channel', 'tienda_fisica', 'reference', 'Mostrador')),
  'qa-sl-counter-1');
select pg_temp.verify();
select pg_temp.check(pg_temp.at('SL-GTR', 'Centro') = 2 and (pg_temp.item('SL-GTR')).quantity_on_hand = 6, 'Mostrador sells from its location');
select pg_temp.check((public.apply_location_bulk_stock_operations(pg_temp.loc('Centro'), jsonb_build_array(
  jsonb_build_object('item_id', (pg_temp.item('SL-GTR')).id, 'type', 'sale', 'quantity', 1, 'channel', 'tienda_fisica', 'reference', 'Mostrador')),
  'qa-sl-counter-1')->>'replayed')::boolean and pg_temp.at('SL-GTR', 'Centro') = 2, 'a retried Mostrador sale is replayed');
select pg_temp.expect_error(format($$select public.apply_location_bulk_stock_operations(%L, %L::jsonb, 'qa-sl-counter-1')$$,
  pg_temp.loc('Miraflores'), jsonb_build_array(jsonb_build_object('item_id', (pg_temp.item('SL-GTR')).id, 'type', 'sale', 'quantity', 1))),
  'IDEMPOTENCY_KEY_REUSED');
-- The sale is all or nothing: the cable is at Miraflores only.
select pg_temp.expect_error(format($$select public.apply_location_bulk_stock_operations(%L, %L::jsonb, 'qa-sl-counter-2')$$,
  pg_temp.loc('Centro'), jsonb_build_array(
    jsonb_build_object('item_id', (pg_temp.item('SL-GTR')).id, 'type', 'sale', 'quantity', 1, 'channel', 'tienda_fisica'),
    jsonb_build_object('item_id', (pg_temp.item('SL-CAB')).id, 'type', 'sale', 'quantity', 1, 'channel', 'tienda_fisica'))),
  'STORE_LOCATION_STOCK_SHORT');
select pg_temp.check(pg_temp.at('SL-GTR', 'Centro') = 2, 'nothing of a refused sale is recorded');
select pg_temp.expect_error(format($$select public.apply_location_bulk_stock_operations(%L, %L::jsonb, 'qa-sl-counter-3')$$,
  pg_temp.loc('Centro'), jsonb_build_array(jsonb_build_object('item_id', (pg_temp.item('SL-GTR')).id, 'type', 'stock_count', 'quantity', 1))),
  'INVENTORY_BULK_INVALID');

-- ================================================================== counts per location in bulk

do $$
declare result jsonb;
begin
  result := public.set_location_stock_counts(pg_temp.loc('Centro'), jsonb_build_array(
    jsonb_build_object('item_id', (pg_temp.item('SL-GTR')).id, 'quantity', 2),
    jsonb_build_object('item_id', (pg_temp.item('SL-CAB')).id, 'quantity', 4),
    jsonb_build_object('item_id', (pg_temp.item('SL-PUA')).id, 'quantity', 10)), 'qa-sl-counts-1');
  perform pg_temp.check((result->>'changed')::int = 2 and (result->>'unchanged')::int = 1, 'matching counts are skipped');
end $$;
select pg_temp.verify();
select pg_temp.check(pg_temp.at('SL-CAB', 'Centro') = 4 and pg_temp.at('SL-CAB', 'Miraflores') = 2
  and (pg_temp.item('SL-CAB')).quantity_on_hand = 6 and (pg_temp.item('SL-PUA')).quantity_on_hand = 10,
  'bulk counts set each location and the totals follow');
select pg_temp.check((public.set_location_stock_counts(pg_temp.loc('Centro'), jsonb_build_array(
    jsonb_build_object('item_id', (pg_temp.item('SL-GTR')).id, 'quantity', 2),
    jsonb_build_object('item_id', (pg_temp.item('SL-CAB')).id, 'quantity', 4),
    jsonb_build_object('item_id', (pg_temp.item('SL-PUA')).id, 'quantity', 10)), 'qa-sl-counts-1')->>'replayed')::boolean,
  'a retried upload is replayed');

-- ================================================================== public reads

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.check((select array_agg(name order by name) from public.get_listing_locations('5f830000-0000-4000-8000-000000000001'))
  = array['Centro', 'Miraflores'], 'the listing names both locations with units');
select pg_temp.check((select public_address from public.get_public_store_locations('5f820000-0000-4000-8000-000000000001') where name = 'Centro') is null
  and (select public_address from public.get_public_store_locations('5f820000-0000-4000-8000-000000000001') where name = 'Miraflores') = 'Av. Larco 123',
  'the street address shows only with consent');
select pg_temp.expect_error($$select * from public.store_location_stock$$, 'permission denied');
select pg_temp.expect_error($$select * from public.store_locations$$, 'permission denied');

reset role;
set local role authenticated;
select pg_temp.owner_b();
select pg_temp.check((select count(*) from public.store_locations) = 0 and (select count(*) from public.store_location_stock) = 0,
  'another store sees none of these rows');
select pg_temp.expect_error(format($$select public.transfer_location_stock(%L, %L, %L, 1, null, 'qa-sl-b-transfer')$$,
  (pg_temp.item('SL-GTR')).id, pg_temp.loc('Miraflores'), pg_temp.loc('Centro')), 'INVENTORY_ITEM_NOT_OWNED');
select pg_temp.expect_error(format($$select public.archive_store_location(%L, null, 'qa-sl-b-archive')$$, pg_temp.loc('Centro')),
  'STORE_LOCATION_NOT_FOUND');
select pg_temp.expect_error(format($$select public.save_store_location(%L, '{"name":"Robada","region":"Lima","city":"Lima"}')$$, pg_temp.loc('Centro')),
  'STORE_LOCATION_NOT_FOUND');

-- ================================================================== archive

select pg_temp.owner_a();
select public.set_primary_store_location(pg_temp.loc('Centro'));
select pg_temp.check((select is_primary from public.store_locations where id = pg_temp.loc('Centro')), 'the main location can change');
select pg_temp.expect_error(format($$select public.archive_store_location(%L, null, 'qa-sl-archive-0')$$, pg_temp.loc('Miraflores')),
  'STORE_LOCATION_MOVE_TO');
select public.archive_store_location(pg_temp.loc('Miraflores'), pg_temp.loc('Centro'), 'qa-sl-archive-1');
select pg_temp.verify();
select pg_temp.check(pg_temp.at('SL-GTR', 'Centro') = 6 and pg_temp.at('SL-CAB', 'Centro') = 6
  and (pg_temp.item('SL-GTR')).quantity_on_hand = 6, 'archiving a location moves its units');
select pg_temp.check((select count(*) from public.store_stock_transfers where reason = 'Sede archivada') = 2, 'the move is in the transfer ledger');
-- One location left: the listing no longer names locations.
select pg_temp.check(not exists (select 1 from public.get_listing_locations('5f830000-0000-4000-8000-000000000001')),
  'with one location the listing names none');
-- The last one turns locations off and keeps the totals.
select public.archive_store_location(pg_temp.loc('Centro'), null, 'qa-sl-archive-2');
select pg_temp.verify();
reset role;
select pg_temp.check((select count(*) from public.store_location_stock where store_id = '5f820000-0000-4000-8000-000000000001') = 0
  and (pg_temp.item('SL-GTR')).quantity_on_hand = 6, 'archiving the last location keeps the totals');
set local role authenticated;
select pg_temp.owner_a();
select public.record_stock_movement((pg_temp.item('SL-GTR')).id, 'sale', 1, 'tienda_fisica', null, null, null, 'qa-sl-after-off');
select pg_temp.verify();
select pg_temp.check((pg_temp.last_movement('SL-GTR')).location_id is null and (pg_temp.item('SL-GTR')).quantity_on_hand = 5,
  'without locations, movements work as before');

-- ================================================================== the ledger stays append-only

reset role;
select pg_temp.expect_error($$update public.store_stock_transfers set quantity = 1$$, 'INVENTORY_LEDGER_APPEND_ONLY');
-- The commit-time check refuses a split that does not add up.
select pg_temp.expect_error($$
  do $x$ begin
    insert into public.store_locations (store_id, name, region, city, is_primary)
    values ('5f820000-0000-4000-8000-000000000002', 'Única', 'Lima', 'Lima', true);
    insert into public.store_inventory_items (store_id, merchant_sku, sku_normalized, product_name, quantity_on_hand)
    values ('5f820000-0000-4000-8000-000000000002', 'SL-B-1', 'SL-B-1', 'Producto B', 3);
    set constraints all immediate;
  end $x$;
$$, 'STORE_LOCATION_STOCK_MISMATCH');

rollback;
