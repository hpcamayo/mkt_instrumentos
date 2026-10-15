-- STORE-1a inventory core: gate, owner functions, RLS, append-only ledger, listing stock_state, price write-through,
-- sold guard, price-drop and saved-search behavior, publication from an inventory item.
-- Local/test database only. Every fixture is rolled back. Races between separate connections are covered by
-- tests/store-ops-concurrency.integration.cjs.
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

-- Fixture ids live in transaction-local settings so every role can read them.
create function pg_temp.id(p_name text) returns uuid language sql as $$ select current_setting('qa.' || p_name)::uuid $$;
create function pg_temp.remember(p_name text, p_id uuid) returns void language plpgsql as $$
begin perform set_config('qa.' || p_name, p_id::text, true); end $$;
create function pg_temp.item(p_name text) returns public.store_inventory_items language sql as $$
  select * from public.store_inventory_items where id = pg_temp.id(p_name)
$$;
create function pg_temp.price_drops(p_listing uuid) returns bigint language sql security definer as $$
  select count(*) from public.notifications where event_type = 'listing_price_drop' and listing_id = p_listing
$$;
create function pg_temp.audits(p_action text, p_store uuid, p_reason text default null) returns bigint language sql security definer as $$
  select count(*) from public.admin_audit_actions
  where action = p_action and target_type = 'store' and target_id = p_store and (p_reason is null or detail->>'reason' = p_reason)
$$;
create function pg_temp.markers(p_listing uuid) returns bigint language sql security definer as $$
  select count(*) from laria_private.listing_alert_publications where listing_id = p_listing
$$;
create function pg_temp.matches(p_listing uuid) returns bigint language sql security definer as $$
  select count(*) from laria_private.search_alert_matches where listing_id = p_listing
$$;

select pg_temp.remember('owner_a', 'e1000000-0000-4000-8000-000000000001'),
       pg_temp.remember('owner_b', 'e1000000-0000-4000-8000-000000000002'),
       pg_temp.remember('particular', 'e1000000-0000-4000-8000-000000000003'),
       pg_temp.remember('buyer', 'e1000000-0000-4000-8000-000000000004'),
       pg_temp.remember('store_a', 'e2000000-0000-4000-8000-000000000001'),
       pg_temp.remember('store_b', 'e2000000-0000-4000-8000-000000000002'),
       pg_temp.remember('l1', 'e3000000-0000-4000-8000-000000000001'),
       pg_temp.remember('l2', 'e3000000-0000-4000-8000-000000000002'),
       pg_temp.remember('l3', 'e3000000-0000-4000-8000-000000000003'),
       pg_temp.remember('lp', 'e3000000-0000-4000-8000-000000000004'),
       pg_temp.remember('l5', 'e3000000-0000-4000-8000-000000000005'),
       pg_temp.remember('l6', 'e3000000-0000-4000-8000-000000000006'),
       pg_temp.remember('l7', 'e3000000-0000-4000-8000-000000000007'),
       pg_temp.remember('l8', 'e3000000-0000-4000-8000-000000000008'),
       pg_temp.remember('l9', 'e3000000-0000-4000-8000-000000000009');

create function pg_temp.as_user(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(p_name), 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"e1000000-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}', true);
end $$;

-- ------------------------------------------------------------------ fixtures

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e1000000-0000-4000-8000-000000000001','authenticated','authenticated','so1-owner-a@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Tienda A","phone":"51999996001","city":"Lima","region":"Lima"}'),
 ('e1000000-0000-4000-8000-000000000002','authenticated','authenticated','so1-owner-b@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Tienda B","phone":"51999996002","city":"Lima","region":"Lima"}'),
 ('e1000000-0000-4000-8000-000000000003','authenticated','authenticated','so1-particular@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Particular SO1","phone":"51999996003","city":"Lima","region":"Lima"}'),
 ('e1000000-0000-4000-8000-000000000004','authenticated','authenticated','so1-buyer@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Comprador SO1","phone":"51999996004","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('e2000000-0000-4000-8000-000000000001','so1-tienda-a','Tienda SO1 A','Tienda SO1 A SAC','20999999001','so1-a@example.invalid','Contacto A','Contacto A','51999996001','Lima','Lima','Av. QA 1','e1000000-0000-4000-8000-000000000001','active','free',true),
 ('e2000000-0000-4000-8000-000000000002','so1-tienda-b','Tienda SO1 B','Tienda SO1 B SAC','20999999002','so1-b@example.invalid','Contacto B','Contacto B','51999996002','Lima','Lima','Av. QA 2','e1000000-0000-4000-8000-000000000002','active','free',false);

-- The buyer follows guitars before anything is published, so every first publication is a saved-search match.
set local role authenticated;
select pg_temp.as_user('buyer');
select public.create_saved_search_alert('{"category":"guitars"}', 'immediate');
reset role;

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at,sold_at) values
 ('e3000000-0000-4000-8000-000000000001','so1-l1','Guitarra SO1 uno','store','approved','guitars','electric_guitar','QA','Uno','Nuevo',1000,'Lima','Lima','Contacto A','51999996001','Descripción de inventario válida con más de cuarenta caracteres.','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','self_service',now(),null),
 ('e3000000-0000-4000-8000-000000000002','so1-l2','Guitarra SO1 dos','store','approved','guitars','electric_guitar','QA','Dos','Nuevo',1200,'Lima','Lima','Contacto A','51999996001','Descripción de inventario válida con más de cuarenta caracteres.','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','self_service',now(),null),
 ('e3000000-0000-4000-8000-000000000003','so1-l3','Guitarra SO1 tienda B','store','approved','guitars','electric_guitar','QA','Tres','Nuevo',500,'Lima','Lima','Contacto B','51999996002','Descripción de inventario válida con más de cuarenta caracteres.','e1000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002','self_service',now(),null),
 ('e3000000-0000-4000-8000-000000000004','so1-lp','Guitarra SO1 particular','individual','approved','guitars','electric_guitar','QA','Cuatro','Nuevo',700,'Lima','Lima','Particular SO1','51999996003','Descripción de publicación válida con más de cuarenta caracteres.','e1000000-0000-4000-8000-000000000003',null,'self_service',now(),null),
 ('e3000000-0000-4000-8000-000000000005','so1-l5','Guitarra SO1 cinco','store','pending','guitars','electric_guitar','QA','Cinco','Nuevo',900,'Lima','Lima','Contacto A','51999996001','Descripción de inventario válida con más de cuarenta caracteres.','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','self_service',now(),null),
 ('e3000000-0000-4000-8000-000000000006','so1-l6','Guitarra SO1 vendida','store','sold','guitars','electric_guitar','QA','Seis','Nuevo',600,'Lima','Lima','Contacto A','51999996001','Descripción de inventario válida con más de cuarenta caracteres.','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','self_service',now(),now()),
 ('e3000000-0000-4000-8000-000000000007','so1-l7','Guitarra SO1 siete','store','pending','guitars','electric_guitar','QA','Siete','Nuevo',800,'Lima','Lima','Contacto A','51999996001','Descripción de inventario válida con más de cuarenta caracteres.','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','self_service',now(),null);

insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/so1-' || l.slug || '-' || n || '.jpg', n
from public.listings l cross join generate_series(0, 1) n
where l.slug like 'so1-%';

insert into public.favorites (user_id, listing_id) values
 ('e1000000-0000-4000-8000-000000000004','e3000000-0000-4000-8000-000000000001'),
 ('e1000000-0000-4000-8000-000000000004','e3000000-0000-4000-8000-000000000002'),
 ('e1000000-0000-4000-8000-000000000004','e3000000-0000-4000-8000-000000000004');

do $$ begin
  perform pg_temp.check(pg_temp.markers(pg_temp.id('l1')) = 1 and pg_temp.matches(pg_temp.id('l1')) = 1, 'fixture L1 was not first-public');
  perform pg_temp.check((select count(*) from public.listings where slug like 'so1-%' and stock_state is not null) = 0,
    'existing listings must start with a null stock_state');
end $$;

-- ------------------------------------------------------------------ browser role boundaries

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform pg_temp.expect_error('select 1 from public.store_inventory_items', 'permission denied');
  perform pg_temp.expect_error('select 1 from public.store_stock_movements', 'permission denied');
  perform pg_temp.expect_error('select 1 from public.store_inventory_changes', 'permission denied');
  perform pg_temp.expect_error('select 1 from public.store_operation_settings', 'permission denied');
  perform pg_temp.expect_error('select public.get_inventory_summary()', 'permission denied');
  perform pg_temp.expect_error($q$select public.create_inventory_item('{"product_name":"Anon"}', 1, 'qa-anon-create')$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.record_stock_movement(gen_random_uuid(), 'restock', 1, null, null, null, null, 'qa-anon-move')$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.admin_set_store_inventory_enabled(gen_random_uuid(), true, 'Piloto')$q$, 'permission denied');
  perform pg_temp.check(not has_schema_privilege('anon', 'laria_private', 'usage'), 'anon reached laria_private');
  -- stock_state is public: it backs the "Agotado" label.
  perform pg_temp.check((select stock_state from public.listings where id = pg_temp.id('l1')) is null, 'anon cannot read stock_state');
end $$;

-- ------------------------------------------------------------------ pilot gate (D-2)

set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ declare summary jsonb; begin
  summary := public.get_inventory_summary();
  perform pg_temp.check(summary->>'inventory_enabled' = 'false' and summary->>'can_write' = 'false', 'gate defaults to disabled');
  perform pg_temp.expect_error($q$select public.create_inventory_item('{"product_name":"Antes del piloto"}', 1, 'qa-before-enable')$q$, 'INVENTORY_NOT_ENABLED');
  perform pg_temp.expect_error($q$select public.admin_set_store_inventory_enabled(pg_temp.id('store_a'), true, 'Autohabilitar')$q$, 'ADMIN_REQUIRED');
end $$;

select pg_temp.as_user('particular');
do $$ begin
  perform pg_temp.expect_error('select public.get_inventory_summary()', 'INVENTORY_STORE_REQUIRED');
  perform pg_temp.expect_error($q$select public.create_inventory_item('{"product_name":"Particular"}', 1, 'qa-particular-create')$q$, 'INVENTORY_STORE_REQUIRED');
end $$;

select pg_temp.as_admin();
do $$ declare settings jsonb; begin
  perform pg_temp.expect_error($q$select public.admin_set_store_inventory_enabled(pg_temp.id('store_a'), true, ' ')$q$, 'INVENTORY_REASON_REQUIRED');
  settings := public.admin_set_store_inventory_enabled(pg_temp.id('store_a'), true, 'Piloto A de inventario');
  perform pg_temp.check((settings->>'inventory_enabled')::boolean, 'admin could not enable inventory');
  perform pg_temp.check(pg_temp.audits('store_inventory_enabled', pg_temp.id('store_a'), 'Piloto A de inventario') = 1,
    'enabling inventory was not audited with its reason');
  -- Repeating the same state is not a second audited change.
  perform public.admin_set_store_inventory_enabled(pg_temp.id('store_a'), true, 'Piloto A de inventario');
  perform pg_temp.check(pg_temp.audits('store_inventory_enabled', pg_temp.id('store_a')) = 1, 'no-op enable was audited twice');
  -- An Admin has no store, so owner functions refuse them.
  perform pg_temp.expect_error('select public.get_inventory_summary()', 'INVENTORY_STORE_REQUIRED');
end $$;

-- ------------------------------------------------------------------ items

select pg_temp.as_user('owner_a');
do $$ declare result jsonb; item public.store_inventory_items; begin
  result := public.create_inventory_item('{"merchant_sku":"gtr-001","product_name":"Guitarra QA","unit_price_pen":900,"low_stock_threshold":"2"}', 5, 'qa-create-item1');
  perform pg_temp.check(result->>'replayed' = 'false', 'first create reported a replay');
  perform pg_temp.remember('item1', (result->'item'->>'id')::uuid);
  item := pg_temp.item('item1');
  perform pg_temp.check(item.merchant_sku = 'gtr-001' and item.sku_normalized = 'GTR-001' and not item.sku_generated, 'SKU not stored as typed');
  perform pg_temp.check(item.quantity_on_hand = 5 and item.quantity_available = 5 and item.quantity_reserved = 0 and item.version = 1,
    'opening balance not applied');
  perform pg_temp.check(item.low_stock_threshold = 2 and item.unit_price_pen = 900 and item.store_id = pg_temp.id('store_a'), 'fields not stored');
  perform pg_temp.check((select count(*) from public.store_stock_movements where item_id = item.id and movement_type = 'opening_balance'
    and on_hand_before = 0 and on_hand_after = 5 and on_hand_delta = 5 and channel = 'panel' and actor_kind = 'owner'
    and actor_user_id = pg_temp.id('owner_a') and item_version_after = 1) = 1, 'opening balance not in the ledger');
  perform pg_temp.check((select count(*) from public.store_inventory_changes where item_id = item.id and change_type = 'created') = 1,
    'creation not audited');

  -- Same key and payload returns the first result; same key with other data is refused.
  result := public.create_inventory_item('{"merchant_sku":"gtr-001","product_name":"Guitarra QA","unit_price_pen":900,"low_stock_threshold":"2"}', 5, 'qa-create-item1');
  perform pg_temp.check(result->>'replayed' = 'true' and (result->'item'->>'id')::uuid = pg_temp.id('item1'), 'create retry was not idempotent');
  perform pg_temp.check((select count(*) from public.store_inventory_items where store_id = pg_temp.id('store_a')) = 1, 'create retry made a second item');
  perform pg_temp.expect_error($q$select public.create_inventory_item('{"merchant_sku":"gtr-001","product_name":"Guitarra QA","unit_price_pen":900,"low_stock_threshold":"2"}', 6, 'qa-create-item1')$q$, 'IDEMPOTENCY_KEY_REUSED');

  perform pg_temp.expect_error($q$select public.create_inventory_item('{"merchant_sku":"GTR-001","product_name":"Duplicada"}', 1, 'qa-create-dup')$q$, 'INVENTORY_SKU_TAKEN');
  perform pg_temp.expect_error($q$select public.create_inventory_item('{"merchant_sku":"gtr 001","product_name":"Espacios"}', 1, 'qa-create-space')$q$, 'INVENTORY_SKU_INVALID');
  perform pg_temp.expect_error($q$select public.create_inventory_item('{"product_name":"Campo extra","quantity_on_hand":4}', 1, 'qa-create-extra')$q$, 'INVENTORY_FIELD_NOT_ALLOWED');
  perform pg_temp.expect_error($q$select public.create_inventory_item('{"product_name":"Decimal","low_stock_threshold":"12.5"}', 1, 'qa-create-decimal')$q$, 'INVENTORY_FIELD_INVALID');
  perform pg_temp.expect_error($q$select public.create_inventory_item('{"product_name":"Precio","unit_price_pen":0}', 1, 'qa-create-price0')$q$, 'INVENTORY_PRICE_INVALID');
  perform pg_temp.expect_error($q$select public.create_inventory_item('{"product_name":"N"}', 1, 'qa-create-short')$q$, 'INVENTORY_FIELD_INVALID');
  perform pg_temp.expect_error($q$select public.create_inventory_item('{"product_name":"Negativo"}', -1, 'qa-create-negative')$q$, 'STOCK_QUANTITY_INVALID');
  perform pg_temp.expect_error($q$select public.create_inventory_item('{"product_name":"Catálogo","catalog_product_id":"00000000-0000-4000-8000-000000000000"}', 1, 'qa-create-catalog')$q$, 'INVENTORY_CATALOG_INVALID');
  perform pg_temp.expect_error($q$select public.create_inventory_item('{"product_name":"Variante","catalog_variant_id":"00000000-0000-4000-8000-000000000000"}', 1, 'qa-create-variant')$q$, 'INVENTORY_CATALOG_INVALID');
  perform pg_temp.expect_error($q$select public.create_inventory_item('{"product_name":"Clave"}', 1, 'short')$q$, 'IDEMPOTENCY_KEY_INVALID');
  perform pg_temp.expect_error($q$select public.create_inventory_item('{"product_name":"Clave"}', 1, null)$q$, 'IDEMPOTENCY_KEY_INVALID');

  -- An omitted SKU is generated from the store counter.
  result := public.create_inventory_item('{"product_name":"Pedal QA"}', 0, 'qa-create-item2');
  perform pg_temp.remember('item2', (result->'item'->>'id')::uuid);
  item := pg_temp.item('item2');
  perform pg_temp.check(item.merchant_sku = 'LAR-000001' and item.sku_generated and item.quantity_on_hand = 0 and item.version = 1,
    'generated SKU or zero opening balance wrong');
  perform pg_temp.check(result->'item'->>'stock_level' = 'out', 'stock level for zero stock is not "out"');
end $$;

-- ------------------------------------------------------------------ movements

do $$ declare result jsonb; item public.store_inventory_items; begin
  result := public.record_stock_movement(pg_temp.id('item1'), 'sale', 2, 'tienda_fisica', 'Boleta 001', null, null, 'qa-move-0001');
  item := pg_temp.item('item1');
  perform pg_temp.check(item.quantity_on_hand = 3 and item.version = 2 and item.last_movement_at is not null, 'sale not applied');
  perform pg_temp.check((result->'movement'->>'on_hand_delta')::int = -2 and result->'movement'->>'channel' = 'tienda_fisica'
    and not (result->'movement' ? 'request_fingerprint'), 'sale movement wrong');

  result := public.record_stock_movement(pg_temp.id('item1'), 'sale', 2, 'tienda_fisica', 'Boleta 001', null, null, 'qa-move-0001');
  perform pg_temp.check(result->>'replayed' = 'true' and (pg_temp.item('item1')).quantity_on_hand = 3, 'movement retry applied twice');
  perform pg_temp.expect_error($q$select public.record_stock_movement(pg_temp.id('item1'), 'sale', 1, 'tienda_fisica', 'Boleta 001', null, null, 'qa-move-0001')$q$, 'IDEMPOTENCY_KEY_REUSED');

  perform pg_temp.expect_error($q$select public.record_stock_movement(pg_temp.id('item1'), 'sale', 1, null, null, null, null, 'qa-move-nochannel')$q$, 'STOCK_CHANNEL_INVALID');
  perform pg_temp.expect_error($q$select public.record_stock_movement(pg_temp.id('item1'), 'restock', 1, 'tienda_fisica', null, null, null, 'qa-move-restock-channel')$q$, 'STOCK_CHANNEL_INVALID');
  perform pg_temp.expect_error($q$select public.record_stock_movement(pg_temp.id('item1'), 'sale', 4, 'otro', null, null, null, 'qa-move-oversell')$q$, 'STOCK_INSUFFICIENT');
  perform pg_temp.expect_error($q$select public.record_stock_movement(pg_temp.id('item1'), 'damage_or_loss', 4, null, null, null, null, 'qa-move-overloss')$q$, 'STOCK_INSUFFICIENT');
  perform pg_temp.expect_error($q$select public.record_stock_movement(pg_temp.id('item1'), 'manual_adjustment', -20, null, null, null, null, 'qa-move-negative')$q$, 'STOCK_INSUFFICIENT');
  perform pg_temp.expect_error($q$select public.record_stock_movement(pg_temp.id('item1'), 'manual_adjustment', 0, null, null, null, null, 'qa-move-zero-adjust')$q$, 'STOCK_QUANTITY_INVALID');
  perform pg_temp.expect_error($q$select public.record_stock_movement(pg_temp.id('item1'), 'restock', 0, null, null, null, null, 'qa-move-zero-restock')$q$, 'STOCK_QUANTITY_INVALID');
  perform pg_temp.expect_error($q$select public.record_stock_movement(pg_temp.id('item1'), 'restock', 100001, null, null, null, null, 'qa-move-huge')$q$, 'STOCK_QUANTITY_INVALID');
  perform pg_temp.expect_error($q$select public.record_stock_movement(pg_temp.id('item1'), 'opening_balance', 4, null, null, null, null, 'qa-move-opening')$q$, 'STOCK_MOVEMENT_TYPE_INVALID');
  perform pg_temp.expect_error($q$select public.record_stock_movement(pg_temp.id('item1'), 'reservation', 1, null, null, null, null, 'qa-move-reserve')$q$, 'STOCK_MOVEMENT_TYPE_INVALID');
  perform pg_temp.expect_error($q$select public.record_stock_movement(pg_temp.id('item1'), 'import_reconciliation', 4, null, null, null, 3, 'qa-move-import')$q$, 'STOCK_MOVEMENT_TYPE_INVALID');
  perform pg_temp.expect_error($q$select public.record_stock_movement(pg_temp.id('item1'), 'restock', 1, null, null, repeat('x', 281), null, 'qa-move-reason')$q$, 'INVENTORY_FIELD_INVALID');

  -- A count is absolute, so it must name the version the merchant saw.
  perform pg_temp.expect_error($q$select public.record_stock_movement(pg_temp.id('item1'), 'stock_count', 9, null, null, null, null, 'qa-move-count-noversion')$q$, 'INVENTORY_VERSION_REQUIRED');
  perform pg_temp.expect_error($q$select public.record_stock_movement(pg_temp.id('item1'), 'stock_count', 9, null, null, null, 1, 'qa-move-count-stale')$q$, 'INVENTORY_VERSION_CONFLICT');
  perform public.record_stock_movement(pg_temp.id('item1'), 'stock_count', 9, null, null, 'Conteo semanal', 2, 'qa-move-count-0001');
  perform pg_temp.check((pg_temp.item('item1')).quantity_on_hand = 9 and (pg_temp.item('item1')).version = 3, 'count not applied');
  -- Counting the same quantity is recorded (a zero-delta absolute movement).
  perform public.record_stock_movement(pg_temp.id('item1'), 'stock_count', 9, null, null, null, 3, 'qa-move-count-0002');
  perform pg_temp.check((select on_hand_delta from public.store_stock_movements where idempotency_key = 'qa-move-count-0002') = 0
    and (pg_temp.item('item1')).version = 4, 'zero-delta count not recorded');
end $$;

-- ------------------------------------------------------------------ RLS and direct writes

do $$ begin
  perform pg_temp.check((select count(*) from public.store_inventory_items) = 2, 'owner cannot read own items');
  perform pg_temp.check((select count(*) from public.store_operation_settings) = 1, 'owner cannot read own settings');
  perform pg_temp.expect_error($q$update public.store_inventory_items set quantity_on_hand = 100$q$, 'permission denied');
  perform pg_temp.expect_error($q$update public.store_inventory_items set listing_id = pg_temp.id('l1')$q$, 'permission denied');
  perform pg_temp.expect_error($q$insert into public.store_inventory_items(store_id, merchant_sku, sku_normalized, product_name) values (pg_temp.id('store_a'), 'X1', 'X1', 'Directo')$q$, 'permission denied');
  perform pg_temp.expect_error($q$delete from public.store_stock_movements$q$, 'permission denied');
  perform pg_temp.expect_error($q$update public.store_operation_settings set inventory_enabled = true$q$, 'permission denied');
  perform pg_temp.expect_error($q$insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at,stock_state)
    values (gen_random_uuid(),'so1-forged','Forjada','store','pending','guitars','electric_guitar','QA','F','Nuevo',100,'Lima','Lima','Contacto A','51999996001','Descripción de inventario válida con más de cuarenta caracteres.',pg_temp.id('owner_a'),pg_temp.id('store_a'),'self_service',now(),'in_stock')$q$,
    'Only controlled server functions');
end $$;

select pg_temp.as_user('owner_b');
do $$ begin
  perform pg_temp.check((select count(*) from public.store_inventory_items) = 0, 'other store owner read inventory');
  perform pg_temp.check((select count(*) from public.store_stock_movements) = 0, 'other store owner read the ledger');
  perform pg_temp.check((select count(*) from public.store_inventory_changes) = 0, 'other store owner read inventory changes');
  perform pg_temp.check((select count(*) from public.store_operation_settings) = 0, 'other store owner read settings');
  perform pg_temp.check(jsonb_array_length(public.get_inventory_page()->'items') = 0, 'other store owner paged inventory');
  perform pg_temp.expect_error($q$select public.record_stock_movement(pg_temp.id('item1'), 'restock', 1, null, null, null, null, 'qa-b-move-0001')$q$, 'INVENTORY_ITEM_NOT_OWNED');
  perform pg_temp.expect_error($q$select public.update_inventory_item(pg_temp.id('item1'), '{"product_name":"Robada"}', 4)$q$, 'INVENTORY_ITEM_NOT_OWNED');
  perform pg_temp.expect_error($q$select public.record_stock_movement(gen_random_uuid(), 'restock', 1, null, null, null, null, 'qa-b-move-0002')$q$, 'INVENTORY_ITEM_NOT_OWNED');
  perform pg_temp.expect_error($q$select public.create_inventory_item('{"product_name":"Sin piloto"}', 1, 'qa-b-create-0001')$q$, 'INVENTORY_NOT_ENABLED');
end $$;

select pg_temp.as_user('particular');
do $$ begin
  perform pg_temp.check((select count(*) from public.store_inventory_items) = 0, 'Particular read inventory');
  perform pg_temp.expect_error($q$select public.record_stock_movement(pg_temp.id('item1'), 'restock', 1, null, null, null, null, 'qa-p-move-0001')$q$, 'INVENTORY_ITEM_NOT_OWNED');
end $$;

select pg_temp.as_admin();
do $$ begin
  perform pg_temp.check((select count(*) from public.store_inventory_items where store_id = pg_temp.id('store_a')) = 2, 'admin cannot read inventory');
  perform pg_temp.check((select count(*) from public.store_stock_movements where store_id = pg_temp.id('store_a')) >= 4, 'admin cannot read the ledger');
  perform pg_temp.expect_error($q$select public.record_stock_movement(pg_temp.id('item1'), 'restock', 1, null, null, null, null, 'qa-admin-move-1')$q$, 'INVENTORY_ITEM_NOT_OWNED');
  -- Store B joins the pilot so cross-store checks below have a foreign item.
  perform public.admin_set_store_inventory_enabled(pg_temp.id('store_b'), true, 'Piloto B de inventario');
end $$;

select pg_temp.as_user('owner_b');
do $$ declare result jsonb; begin
  result := public.create_inventory_item('{"merchant_sku":"GTR-001","product_name":"Guitarra de B"}', 3, 'qa-b-create-item');
  perform pg_temp.remember('item_b', (result->'item'->>'id')::uuid);
end $$;

reset role;
do $$ begin
  -- The ledger is append-only even for the database owner.
  perform pg_temp.expect_error($q$update public.store_stock_movements set reason = 'editado' where item_id = pg_temp.id('item1')$q$, 'INVENTORY_LEDGER_APPEND_ONLY');
  perform pg_temp.expect_error($q$delete from public.store_stock_movements where item_id = pg_temp.id('item1')$q$, 'INVENTORY_LEDGER_APPEND_ONLY');
  perform pg_temp.expect_error($q$truncate public.store_stock_movements cascade$q$, 'INVENTORY_LEDGER_APPEND_ONLY');
  perform pg_temp.expect_error($q$delete from public.store_inventory_changes where item_id = pg_temp.id('item1')$q$, 'INVENTORY_LEDGER_APPEND_ONLY');
  perform pg_temp.expect_error($q$update public.store_inventory_items set quantity_on_hand = -1 where id = pg_temp.id('item1')$q$, 'new row for relation');
  perform pg_temp.expect_error($q$update public.store_inventory_items set quantity_reserved = 10 where id = pg_temp.id('item1')$q$, 'new row for relation');
  -- A listing of another store can never be linked, even by a direct write.
  perform pg_temp.expect_error($q$update public.store_inventory_items set listing_id = pg_temp.id('l3') where id = pg_temp.id('item1')$q$, 'insert or update on table');

  -- stock_state is a controlled field on every path.
  perform set_config('app.allow_listing_admin_fields', '', true);
  perform pg_temp.expect_error($q$update public.listings set stock_state = 'out_of_stock' where id = pg_temp.id('l1')$q$, 'Only controlled server functions');
  perform set_config('app.allow_listing_admin_fields', 'true', true);
  perform pg_temp.expect_error($q$update public.listings set stock_state = 'agotado' where id = pg_temp.id('l1')$q$, 'new row for relation');
  perform set_config('app.allow_listing_admin_fields', '', true);
end $$;

-- ------------------------------------------------------------------ linking

set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ declare item public.store_inventory_items; result jsonb; begin
  perform pg_temp.expect_error($q$select public.link_inventory_listing(pg_temp.id('item1'), pg_temp.id('l1'), 4)$q$, 'INVENTORY_PRICE_CHOICE_REQUIRED');
  perform pg_temp.expect_error($q$select public.link_inventory_listing(pg_temp.id('item1'), pg_temp.id('l3'), 4, 500)$q$, 'INVENTORY_LISTING_INVALID');
  perform pg_temp.expect_error($q$select public.link_inventory_listing(pg_temp.id('item1'), pg_temp.id('lp'), 4, 700)$q$, 'INVENTORY_LISTING_INVALID');
  perform pg_temp.expect_error($q$select public.link_inventory_listing(pg_temp.id('item1'), pg_temp.id('l6'), 4, 600)$q$, 'INVENTORY_LISTING_INVALID');
  perform pg_temp.expect_error($q$select public.link_inventory_listing(pg_temp.id('item1'), pg_temp.id('l1'), 3, 1000)$q$, 'INVENTORY_VERSION_CONFLICT');
  perform pg_temp.expect_error($q$select public.link_inventory_listing(pg_temp.id('item1'), pg_temp.id('l1'), null, 1000)$q$, 'INVENTORY_VERSION_REQUIRED');

  result := public.link_inventory_listing(pg_temp.id('item1'), pg_temp.id('l1'), 4, 1000);
  item := pg_temp.item('item1');
  perform pg_temp.check(item.listing_id = pg_temp.id('l1') and item.unit_price_pen = 1000 and item.version = 6, 'link did not apply the chosen price');
  perform pg_temp.check(result->'item'->'listing'->>'stock_state' = 'in_stock', 'link result does not show the listing');
  perform pg_temp.check((select count(*) from public.store_inventory_changes where item_id = item.id and change_type in ('link', 'price')) = 2,
    'link and price change not audited');

  perform pg_temp.expect_error($q$select public.link_inventory_listing(pg_temp.id('item2'), pg_temp.id('l1'), 1, 1000)$q$, 'INVENTORY_LISTING_ALREADY_LINKED');
  perform pg_temp.expect_error($q$select public.link_inventory_listing(pg_temp.id('item1'), pg_temp.id('l2'), 6, 1200)$q$, 'INVENTORY_ITEM_ALREADY_LINKED');

  -- "Controlar stock" on an existing listing at zero stock: stock_state is written before the price, so the lower price
  -- sends no price-drop notification.
  result := public.create_inventory_item(jsonb_build_object('merchant_sku', 'GTR-002', 'product_name', 'Guitarra dos',
    'unit_price_pen', 1100, 'listing_id', pg_temp.id('l2')), 0, 'qa-create-item3');
  perform pg_temp.remember('item3', (result->'item'->>'id')::uuid);
  item := pg_temp.item('item3');
  perform pg_temp.check(item.listing_id = pg_temp.id('l2') and item.unit_price_pen = 1100 and item.version = 1, 'adoption failed');
  perform pg_temp.expect_error(format($q$select public.create_inventory_item('{"product_name":"Otra vez","listing_id":"%s"}', 1, 'qa-create-readopt')$q$, pg_temp.id('l2')),
    'INVENTORY_LISTING_ALREADY_LINKED');
  perform pg_temp.expect_error(format($q$select public.create_inventory_item('{"product_name":"Ajena","listing_id":"%s"}', 1, 'qa-create-foreign')$q$, pg_temp.id('l3')),
    'INVENTORY_LISTING_INVALID');
end $$;

reset role;
do $$ begin
  perform pg_temp.check((select stock_state from public.listings where id = pg_temp.id('l1')) = 'in_stock', 'L1 not in stock after link');
  perform pg_temp.check((select (status, stock_state, price_pen) = ('approved'::listing_status, 'out_of_stock', 1100)
    from public.listings where id = pg_temp.id('l2')), 'L2 adoption did not set status-independent stock_state and price');
  perform pg_temp.check(pg_temp.price_drops(pg_temp.id('l2')) = 0, 'out-of-stock adoption sent a price drop');
  perform pg_temp.check(public.listing_is_public(pg_temp.id('l2')), 'stock changed listing visibility');
end $$;

-- ------------------------------------------------------------------ stock-out, restock, price drops

set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ begin
  perform public.record_stock_movement(pg_temp.id('item1'), 'sale', 9, 'whatsapp_laria', null, null, 6, 'qa-move-sellout');
end $$;
reset role;
do $$ begin
  perform pg_temp.check((select (status, stock_state) = ('approved'::listing_status, 'out_of_stock') from public.listings where id = pg_temp.id('l1')),
    'sell-out changed status or missed stock_state');
  perform pg_temp.check(public.listing_is_public(pg_temp.id('l1')), 'sell-out changed listing visibility');
end $$;

set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ begin
  perform public.update_inventory_item(pg_temp.id('item1'), '{"unit_price_pen":950}', 7);
  perform pg_temp.check((select price_pen from public.listings where id = pg_temp.id('l1')) = 950, 'price did not reach the listing');
  perform pg_temp.check(pg_temp.price_drops(pg_temp.id('l1')) = 0, 'price drop sent while out of stock');

  perform public.record_stock_movement(pg_temp.id('item1'), 'restock', 3, null, 'Guía 55', null, 8, 'qa-move-restock-1');
  perform pg_temp.check((select stock_state from public.listings where id = pg_temp.id('l1')) = 'in_stock', 'restock did not set in_stock');
  perform pg_temp.check(pg_temp.markers(pg_temp.id('l1')) = 1 and pg_temp.matches(pg_temp.id('l1')) = 1, 'restock re-sent saved-search alerts');

  perform public.update_inventory_item(pg_temp.id('item1'), '{"unit_price_pen":900}', 9);
  perform pg_temp.check(pg_temp.price_drops(pg_temp.id('l1')) = 1, 'in-stock price drop not notified');

  -- Listing-side price edit writes through to the item (lock order listing -> item).
  perform public.update_owned_listing(pg_temp.id('l1'), '{"price_pen":880}', '{}', null, gen_random_uuid());
  perform pg_temp.check((pg_temp.item('item1')).unit_price_pen = 880 and (pg_temp.item('item1')).version = 11,
    'listing price edit did not reach the item');
  perform pg_temp.check((select count(*) from public.store_inventory_changes where item_id = pg_temp.id('item1') and change_type = 'price'
    and reason = 'Precio editado en la publicación' and actor_kind = 'owner' and after->>'unit_price_pen' = '880') = 1,
    'listing-side price edit not audited');
  perform pg_temp.check(pg_temp.price_drops(pg_temp.id('l1')) = 2, 'listing-side price drop not notified');

  -- A linked listing cannot be marked sold (D-15) ...
  perform pg_temp.expect_error($q$select public.set_owned_listing_lifecycle(pg_temp.id('l1'), 'sold')$q$, 'INVENTORY_MANAGED_LISTING');
  -- ... and hiding and restoring it keeps the link.
  perform public.set_owned_listing_lifecycle(pg_temp.id('l1'), 'hide');
  perform public.set_owned_listing_lifecycle(pg_temp.id('l1'), 'restore');
end $$;

reset role;
do $$ begin
  perform pg_temp.check((select (status, stock_state) = ('approved'::listing_status, 'in_stock') from public.listings where id = pg_temp.id('l1')),
    'hide/restore lost stock_state');
  perform set_config('app.allow_listing_admin_fields', 'true', true);
  perform pg_temp.expect_error($q$update public.listings set status = 'sold', sold_at = now() where id = pg_temp.id('l1')$q$, 'INVENTORY_MANAGED_LISTING');
  perform set_config('app.allow_listing_admin_fields', '', true);
end $$;

set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ declare result jsonb; begin
  perform pg_temp.expect_error($q$select public.unlink_inventory_listing(pg_temp.id('item1'), null, 10)$q$, 'INVENTORY_VERSION_CONFLICT');
  result := public.unlink_inventory_listing(pg_temp.id('item1'), 'Pasa al flujo de vendido', 11);
  perform pg_temp.check((pg_temp.item('item1')).listing_id is null and result->'item'->'listing' = 'null'::jsonb, 'unlink did not clear the link');
  perform pg_temp.expect_error($q$select public.unlink_inventory_listing(pg_temp.id('item1'), null, null)$q$, 'INVENTORY_ITEM_NOT_LINKED');
  -- Back to plain V1 behavior: the sold flow works.
  perform public.set_owned_listing_lifecycle(pg_temp.id('l1'), 'sold');
end $$;
reset role;
do $$ begin
  perform pg_temp.check((select (status, stock_state) is not distinct from ('sold'::listing_status, null::text) from public.listings where id = pg_temp.id('l1')),
    'unlinked listing did not return to V1 behavior');
  perform set_config('app.allow_listing_admin_fields', '', true);
end $$;

-- Particular listings are untouched: price drops notify and the sold flow works.
set local role authenticated;
select pg_temp.as_user('particular');
do $$ begin
  perform public.update_owned_listing(pg_temp.id('lp'), '{"price_pen":650}', '{}', null, gen_random_uuid());
  perform pg_temp.check(pg_temp.price_drops(pg_temp.id('lp')) = 1, 'Particular price drop regressed');
  perform public.set_owned_listing_lifecycle(pg_temp.id('lp'), 'sold');
end $$;
reset role;
do $$ begin
  perform pg_temp.check((select (status, stock_state) is not distinct from ('sold'::listing_status, null::text) from public.listings where id = pg_temp.id('lp')),
    'Particular sold flow regressed');
  perform set_config('app.allow_listing_admin_fields', '', true);
end $$;

-- ------------------------------------------------------------------ archive and SKU changes

set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ declare item public.store_inventory_items; begin
  perform pg_temp.expect_error($q$select public.archive_inventory_item(pg_temp.id('item3'), null)$q$, 'INVENTORY_ARCHIVE_BLOCKED');
  perform public.archive_inventory_item(pg_temp.id('item2'), 'Descontinuado');
  perform pg_temp.check((pg_temp.item('item2')).inventory_status = 'archived', 'archive failed');
  perform pg_temp.expect_error($q$select public.record_stock_movement(pg_temp.id('item2'), 'restock', 1, null, null, null, null, 'qa-move-archived')$q$, 'INVENTORY_ITEM_ARCHIVED');
  perform pg_temp.expect_error($q$select public.link_inventory_listing(pg_temp.id('item2'), pg_temp.id('l5'), 2, 900)$q$, 'INVENTORY_ITEM_ARCHIVED');
  perform public.unarchive_inventory_item(pg_temp.id('item2'), null);
  perform pg_temp.check((pg_temp.item('item2')).inventory_status = 'active' and (pg_temp.item('item2')).version = 3, 'unarchive failed');

  perform pg_temp.expect_error($q$select public.change_inventory_sku(pg_temp.id('item2'), 'PED-01', null, 3)$q$, 'INVENTORY_REASON_REQUIRED');
  perform pg_temp.expect_error($q$select public.change_inventory_sku(pg_temp.id('item2'), 'gtr-001', 'Unificar', 3)$q$, 'INVENTORY_SKU_TAKEN');
  perform pg_temp.expect_error($q$select public.change_inventory_sku(pg_temp.id('item2'), 'PED 01', 'Unificar', 3)$q$, 'INVENTORY_SKU_INVALID');
  perform pg_temp.expect_error($q$select public.change_inventory_sku(pg_temp.id('item2'), 'PED-01', 'Unificar', 2)$q$, 'INVENTORY_VERSION_CONFLICT');
  perform public.change_inventory_sku(pg_temp.id('item2'), 'PED-01', 'Código del proveedor', 3);
  item := pg_temp.item('item2');
  perform pg_temp.check(item.merchant_sku = 'PED-01' and item.sku_normalized = 'PED-01' and not item.sku_generated, 'SKU change failed');
  perform pg_temp.check((select count(*) from public.store_inventory_changes where item_id = item.id and change_type = 'sku'
    and before->>'merchant_sku' = 'LAR-000001' and reason = 'Código del proveedor') = 1, 'SKU change not audited');
  -- Generated numbers are never reused.
  perform pg_temp.check((public.create_inventory_item('{"product_name":"Cable QA"}', 2, 'qa-create-item4')->'item'->>'merchant_sku') = 'LAR-000002',
    'generated SKU counter reused a number');

  perform pg_temp.expect_error($q$select public.update_inventory_item(pg_temp.id('item2'), '{"product_name":"Pedal"}', null)$q$, 'INVENTORY_VERSION_REQUIRED');
  perform pg_temp.expect_error($q$select public.update_inventory_item(pg_temp.id('item2'), '{"merchant_sku":"X-1"}', 4)$q$, 'INVENTORY_FIELD_NOT_ALLOWED');
  perform public.update_inventory_item(pg_temp.id('item2'), '{"product_name":"Pedal de distorsión","variant_label":"Negro"}', 4);
  perform pg_temp.check((select count(*) from public.store_inventory_changes where item_id = pg_temp.id('item2') and change_type = 'details'
    and after = '{"product_name":"Pedal de distorsión","variant_label":"Negro"}'::jsonb) = 1, 'detail change not audited with only changed fields');
  perform pg_temp.expect_error($q$select public.update_inventory_item(pg_temp.id('item3'), '{"unit_price_pen":null}', 1)$q$, 'INVENTORY_PRICE_INVALID');
end $$;

-- ------------------------------------------------------------------ bulk stock

do $$ declare result jsonb; operations jsonb; before_on_hand integer := (pg_temp.item('item1')).quantity_on_hand; begin
  operations := jsonb_build_array(
    jsonb_build_object('item_id', pg_temp.id('item1'), 'type', 'restock', 'quantity', 2),
    jsonb_build_object('item_id', pg_temp.id('item2'), 'type', 'sale', 'quantity', 5, 'channel', 'otro'));
  -- All or nothing: item2 has no stock, so item1 is not restocked either.
  perform pg_temp.expect_error(format('select public.apply_bulk_stock_operations(%L, %L)', operations, 'qa-bulk-0001'), 'STOCK_INSUFFICIENT');
  perform pg_temp.check((pg_temp.item('item1')).quantity_on_hand = before_on_hand, 'failed batch applied part of its work');

  operations := jsonb_build_array(
    jsonb_build_object('item_id', pg_temp.id('item2'), 'type', 'restock', 'quantity', '4'),
    jsonb_build_object('item_id', pg_temp.id('item1'), 'type', 'restock', 'quantity', 2, 'reference', 'Guía 77'));
  result := public.apply_bulk_stock_operations(operations, 'qa-bulk-0002');
  perform pg_temp.check(result->>'replayed' = 'false' and jsonb_array_length(result->'movements') = 2, 'bulk result wrong');
  perform pg_temp.check((pg_temp.item('item1')).quantity_on_hand = before_on_hand + 2 and (pg_temp.item('item2')).quantity_on_hand = 4, 'bulk not applied');
  perform pg_temp.check((select count(*) from public.store_stock_movements where idempotency_key like 'qa-bulk-0002:%') = 2, 'bulk movement keys wrong');
  result := public.apply_bulk_stock_operations(operations, 'qa-bulk-0002');
  perform pg_temp.check(result->>'replayed' = 'true' and (pg_temp.item('item2')).quantity_on_hand = 4, 'bulk retry applied twice');
  perform pg_temp.expect_error(format('select public.apply_bulk_stock_operations(%L, %L)', operations - 0, 'qa-bulk-0002'), 'IDEMPOTENCY_KEY_REUSED');

  perform pg_temp.expect_error(format('select public.apply_bulk_stock_operations(%L, %L)',
    jsonb_build_array(jsonb_build_object('item_id', pg_temp.id('item1'), 'type', 'restock', 'quantity', 1),
                      jsonb_build_object('item_id', pg_temp.id('item1'), 'type', 'restock', 'quantity', 1)), 'qa-bulk-dup'), 'INVENTORY_BULK_INVALID');
  perform pg_temp.expect_error($q$select public.apply_bulk_stock_operations('[]', 'qa-bulk-empty')$q$, 'INVENTORY_BULK_INVALID');
  perform pg_temp.expect_error(format('select public.apply_bulk_stock_operations(%L, %L)',
    jsonb_build_array(jsonb_build_object('item_id', pg_temp.id('item1'), 'type', 'restock', 'quantity', 1, 'store_id', pg_temp.id('store_b'))), 'qa-bulk-extra'), 'INVENTORY_BULK_INVALID');
  perform pg_temp.expect_error(format('select public.apply_bulk_stock_operations(%L, %L)',
    jsonb_build_array(jsonb_build_object('item_id', pg_temp.id('item1'), 'type', 'restock', 'quantity', 1),
                      jsonb_build_object('item_id', pg_temp.id('item_b'), 'type', 'restock', 'quantity', 1)), 'qa-bulk-foreign'), 'INVENTORY_ITEM_NOT_OWNED');
  perform pg_temp.expect_error(format('select public.apply_bulk_stock_operations(%L, %L)',
    jsonb_build_array(jsonb_build_object('item_id', pg_temp.id('item1'), 'type', 'stock_count', 'quantity', 1)), 'qa-bulk-count'), 'INVENTORY_VERSION_REQUIRED');
  perform pg_temp.expect_error(format('select public.apply_bulk_stock_operations(%L, %L)',
    jsonb_build_array(jsonb_build_object('item_id', pg_temp.id('item1'), 'type', 'restock', 'quantity', 1.5)), 'qa-bulk-decimal'), 'INVENTORY_FIELD_INVALID');
end $$;

-- ------------------------------------------------------------------ bulk price

do $$ declare preview jsonb; result jsonb; begin
  perform public.record_stock_movement(pg_temp.id('item3'), 'restock', 2, null, null, null, 1, 'qa-move-item3-restock');
  perform pg_temp.check(pg_temp.markers(pg_temp.id('l2')) = 1 and pg_temp.matches(pg_temp.id('l2')) = 1, 'restock of adopted listing re-alerted');

  -- item4 has no price, so a relative change is refused for the whole batch.
  perform pg_temp.remember('item4', (select id from public.store_inventory_items where merchant_sku = 'LAR-000002'));
  preview := public.preview_inventory_price_bulk(array[pg_temp.id('item1'), pg_temp.id('item4')], 'percent', 10);
  perform pg_temp.check((select count(*) from jsonb_array_elements(preview->'items') e
    where (e->>'id')::uuid = pg_temp.id('item1') and (e->>'after')::int = 968) = 1, 'preview percent wrong');
  perform pg_temp.check((select count(*) from jsonb_array_elements(preview->'items') e where e->>'problem' = 'missing_price') = 1, 'preview missed missing price');
  perform pg_temp.expect_error(format('select public.set_inventory_price_bulk(%L, %L, %s, %L)',
    array[pg_temp.id('item1'), pg_temp.id('item4')], 'percent', -10, 'qa-price-0001'), 'INVENTORY_PRICE_MISSING');
  perform pg_temp.check((pg_temp.item('item1')).unit_price_pen = 880, 'failed price batch changed a price');

  perform public.set_inventory_price_bulk(array[pg_temp.id('item4')], 'set', 5, 'qa-price-0002');
  preview := public.preview_inventory_price_bulk(array[pg_temp.id('item4')], 'percent', 10);
  perform pg_temp.check((preview->'items'->0->>'after')::int = 6, 'percent rounding is not half away from zero');
  preview := public.preview_inventory_price_bulk(array[pg_temp.id('item4')], 'add', -10);
  perform pg_temp.check(preview->'items'->0->>'problem' = 'below_minimum', 'preview missed a price below S/ 1');

  result := public.set_inventory_price_bulk(array[pg_temp.id('item3'), pg_temp.id('item1')], 'percent', -10, 'qa-price-0003');
  perform pg_temp.check((pg_temp.item('item1')).unit_price_pen = 792 and (pg_temp.item('item3')).unit_price_pen = 990, 'bulk percent wrong');
  perform pg_temp.check((select price_pen from public.listings where id = pg_temp.id('l2')) = 990, 'bulk price did not reach the listing');
  perform pg_temp.check(pg_temp.price_drops(pg_temp.id('l2')) = 1, 'bulk in-stock price drop not notified');
  result := public.set_inventory_price_bulk(array[pg_temp.id('item1'), pg_temp.id('item3')], 'percent', -10, 'qa-price-0003');
  perform pg_temp.check(result->>'replayed' = 'true' and (pg_temp.item('item1')).unit_price_pen = 792, 'bulk price retry applied twice');
  perform pg_temp.expect_error(format('select public.set_inventory_price_bulk(%L, %L, %s, %L)',
    array[pg_temp.id('item1'), pg_temp.id('item3')], 'percent', -20, 'qa-price-0003'), 'IDEMPOTENCY_KEY_REUSED');
  perform pg_temp.expect_error(format('select public.set_inventory_price_bulk(%L, %L, %s, %L)',
    array[pg_temp.id('item1')], 'percent', -95, 'qa-price-0004'), 'INVENTORY_PRICE_INVALID');
  perform pg_temp.expect_error(format('select public.set_inventory_price_bulk(%L, %L, %s, %L)',
    array[pg_temp.id('item1')], 'set', 0, 'qa-price-0005'), 'INVENTORY_PRICE_INVALID');
  perform pg_temp.expect_error(format('select public.set_inventory_price_bulk(%L, %L, %s, %L)',
    array[pg_temp.id('item4')], 'add', -10, 'qa-price-0006'), 'INVENTORY_PRICE_INVALID');
  perform pg_temp.expect_error(format('select public.set_inventory_price_bulk(%L, %L, %s, %L)',
    array[pg_temp.id('item1'), pg_temp.id('item_b')], 'set', 100, 'qa-price-0007'), 'INVENTORY_ITEM_NOT_OWNED');
end $$;

-- ------------------------------------------------------------------ approval and store reactivation while out of stock

do $$ declare result jsonb; begin
  result := public.create_inventory_item(jsonb_build_object('product_name', 'Guitarra cinco', 'listing_id', pg_temp.id('l5')), 0, 'qa-create-item5');
  perform pg_temp.remember('item5', (result->'item'->>'id')::uuid);
  perform pg_temp.check((pg_temp.item('item5')).unit_price_pen = 900, 'adoption without a price did not take the listing price');
  result := public.create_inventory_item(jsonb_build_object('product_name', 'Guitarra siete', 'listing_id', pg_temp.id('l7')), 0, 'qa-create-item7');
  perform pg_temp.remember('item7', (result->'item'->>'id')::uuid);
end $$;

select pg_temp.as_admin();
do $$ begin
  perform public.review_listing(pg_temp.id('l5'), 'approve', null);
  perform pg_temp.check(pg_temp.markers(pg_temp.id('l5')) = 0 and pg_temp.matches(pg_temp.id('l5')) = 0, 'approval while out of stock sent alerts');
end $$;

select pg_temp.as_user('owner_a');
do $$ begin
  perform public.record_stock_movement(pg_temp.id('item5'), 'restock', 1, null, null, null, null, 'qa-move-item5-1');
  perform pg_temp.check(pg_temp.markers(pg_temp.id('l5')) = 1 and pg_temp.matches(pg_temp.id('l5')) = 1, 'first in-stock moment did not alert');
  perform public.record_stock_movement(pg_temp.id('item5'), 'sale', 1, 'tienda_fisica', null, null, null, 'qa-move-item5-2');
  perform public.record_stock_movement(pg_temp.id('item5'), 'restock', 1, null, null, null, null, 'qa-move-item5-3');
  perform pg_temp.check(pg_temp.markers(pg_temp.id('l5')) = 1 and pg_temp.matches(pg_temp.id('l5')) = 1, 'restock alerted again');
end $$;

-- A hidden store keeps read access only; on reactivation an out-of-stock listing is not "first public".
reset role;
select set_config('app.allow_store_admin_fields', 'true', true);
update public.stores set status = 'hidden' where id = 'e2000000-0000-4000-8000-000000000001';
select set_config('app.allow_store_admin_fields', '', true);
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set status = 'approved' where id = 'e3000000-0000-4000-8000-000000000007';
select set_config('app.allow_listing_admin_fields', '', true);
set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ declare summary jsonb; begin
  perform pg_temp.expect_error($q$select public.record_stock_movement(pg_temp.id('item7'), 'restock', 1, null, null, null, null, 'qa-move-hidden')$q$, 'INVENTORY_STORE_READ_ONLY');
  summary := public.get_inventory_summary();
  perform pg_temp.check(summary->>'can_write' = 'false' and summary->>'store_status' = 'hidden', 'hidden store summary wrong');
  perform pg_temp.check(jsonb_array_length(public.get_inventory_page()->'items') > 0, 'hidden store lost read access');
end $$;
reset role;
select set_config('app.allow_store_admin_fields', 'true', true);
update public.stores set status = 'active' where id = 'e2000000-0000-4000-8000-000000000001';
select set_config('app.allow_store_admin_fields', '', true);
do $$ begin
  perform pg_temp.check(pg_temp.markers(pg_temp.id('l7')) = 0, 'store reactivation alerted for an out-of-stock listing');
end $$;
set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ begin
  perform public.record_stock_movement(pg_temp.id('item7'), 'restock', 1, null, null, null, null, 'qa-move-item7-1');
  perform pg_temp.check(pg_temp.markers(pg_temp.id('l7')) = 1 and pg_temp.matches(pg_temp.id('l7')) = 1, 'restock after reactivation did not alert');
end $$;

-- ------------------------------------------------------------------ publishing from an inventory item

do $$ declare result jsonb; begin
  result := public.create_inventory_item('{"merchant_sku":"GTR-008","product_name":"Guitarra ocho"}', 0, 'qa-create-item8');
  perform pg_temp.remember('item8', (result->'item'->>'id')::uuid);
end $$;

reset role;
do $$ declare fields jsonb; photos jsonb; begin
  fields := jsonb_build_object('slug', 'so1-l8', 'title', 'Guitarra SO1 ocho', 'category', 'guitars', 'instrument_type', 'electric_guitar',
    'brand', 'QA', 'model', 'Ocho', 'condition', 'Nuevo', 'price_pen', '750',
    'description', 'Descripción de inventario válida con más de cuarenta caracteres.',
    'store_id', pg_temp.id('store_a'), 'owner_user_id', pg_temp.id('owner_a'), 'marketplace_rules_accepted', true);
  photos := '[{"image_url":"https://example.invalid/so1-l8-0.jpg"},{"image_url":"https://example.invalid/so1-l8-1.jpg"}]';

  -- Another store's item, or one already published, aborts the whole submission.
  perform pg_temp.expect_error(format('select public.complete_public_submission(%L, %L, %L, %L)', pg_temp.id('l9'), 'store_listing',
    fields || jsonb_build_object('slug', 'so1-l9', 'inventory_item_id', pg_temp.id('item_b')), photos), 'INVENTORY_ITEM_NOT_OWNED');
  perform pg_temp.expect_error(format('select public.complete_public_submission(%L, %L, %L, %L)', pg_temp.id('l9'), 'store_listing',
    fields || jsonb_build_object('slug', 'so1-l9', 'inventory_item_id', pg_temp.id('item5')), photos), 'INVENTORY_ITEM_ALREADY_LINKED');
  perform pg_temp.check(not exists (select 1 from public.listings where id = pg_temp.id('l9')), 'failed inventory submission left a listing');

  -- A verified store publishes directly; at zero stock the listing is approved out of stock and sends no alert.
  perform public.complete_public_submission(pg_temp.id('l8'), 'store_listing', fields || jsonb_build_object('inventory_item_id', pg_temp.id('item8')), photos);
  perform pg_temp.check((select (status, stock_state) = ('approved'::listing_status, 'out_of_stock') from public.listings where id = pg_temp.id('l8')),
    'published inventory listing state wrong');
  perform pg_temp.check((pg_temp.item('item8')).listing_id = pg_temp.id('l8') and (pg_temp.item('item8')).unit_price_pen = 750,
    'published listing not linked or price not copied');
  perform pg_temp.check(pg_temp.markers(pg_temp.id('l8')) = 0 and pg_temp.matches(pg_temp.id('l8')) = 0, 'out-of-stock publication alerted');
  perform set_config('app.allow_listing_admin_fields', '', true);
end $$;

set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ begin
  perform public.record_stock_movement(pg_temp.id('item8'), 'restock', 2, null, null, null, null, 'qa-move-item8-1');
  perform pg_temp.check(pg_temp.markers(pg_temp.id('l8')) = 1 and pg_temp.matches(pg_temp.id('l8')) = 1, 'published listing did not alert when stocked');
end $$;

-- ------------------------------------------------------------------ reads

do $$ declare page jsonb; seen uuid[] := '{}'; names text[] := '{}'; cursor jsonb := null; pages integer := 0; summary jsonb; begin
  loop
    page := public.get_inventory_page('{"sort":"name"}', cursor, 2);
    seen := seen || array(select (e->>'id')::uuid from jsonb_array_elements(page->'items') e);
    names := names || array(select e->>'product_name' from jsonb_array_elements(page->'items') e);
    pages := pages + 1;
    cursor := page->'next_cursor';
    exit when cursor is null or cursor = 'null'::jsonb or pages > 10;
  end loop;
  perform pg_temp.check(cardinality(seen) = (select count(*) from public.store_inventory_items where store_id = pg_temp.id('store_a') and inventory_status = 'active')
    and cardinality(seen) = (select count(distinct x) from unnest(seen) x), 'name pages skipped or repeated items');
  perform pg_temp.check(names = (select array_agg(n order by n) from unnest(names) n), 'name pages out of order');

  -- updated_at ties (one transaction) must still page by id without gaps.
  seen := '{}'; cursor := null; pages := 0;
  loop
    page := public.get_inventory_page('{}', cursor, 3);
    seen := seen || array(select (e->>'id')::uuid from jsonb_array_elements(page->'items') e);
    pages := pages + 1;
    cursor := page->'next_cursor';
    exit when cursor is null or cursor = 'null'::jsonb or pages > 10;
  end loop;
  perform pg_temp.check(cardinality(seen) = (select count(*) from public.store_inventory_items where store_id = pg_temp.id('store_a') and inventory_status = 'active')
    and cardinality(seen) = (select count(distinct x) from unnest(seen) x), 'updated pages skipped or repeated items');

  page := public.get_inventory_page('{"q":"pedal"}', null, 50);
  perform pg_temp.check(jsonb_array_length(page->'items') = 1 and page->'items'->0->>'merchant_sku' = 'PED-01', 'search by name failed');
  page := public.get_inventory_page('{"q":"gtr-00"}', null, 50);
  perform pg_temp.check(jsonb_array_length(page->'items') = 3, 'search by SKU failed');
  page := public.get_inventory_page('{"q":"%"}', null, 50);
  perform pg_temp.check(jsonb_array_length(page->'items') = 0, 'search treats % as a wildcard');
  page := public.get_inventory_page('{"publication":"none"}', null, 50);
  perform pg_temp.check((select bool_and(e->'listing' = 'null'::jsonb) from jsonb_array_elements(page->'items') e)
    and jsonb_array_length(page->'items') = 3, 'unpublished filter wrong');
  page := public.get_inventory_page('{"publication":"published","sort":"price_desc"}', null, 50);
  perform pg_temp.check(jsonb_array_length(page->'items') = 4 and (page->'items'->0->>'unit_price_pen')::int = 990, 'published filter or price sort wrong');
  perform public.update_inventory_item(pg_temp.id('item4'), '{"low_stock_threshold":2}', (pg_temp.item('item4')).version);
  page := public.get_inventory_page('{"stock":"low"}', null, 50);
  perform pg_temp.check(jsonb_array_length(page->'items') = 1 and page->'items'->0->>'merchant_sku' = 'LAR-000002'
    and page->'items'->0->>'stock_level' = 'low', 'low-stock filter wrong');
  perform public.record_stock_movement(pg_temp.id('item7'), 'sale', 1, 'redes_sociales', null, null, null, 'qa-move-item7-2');
  page := public.get_inventory_page('{"stock":"out"}', null, 50);
  perform pg_temp.check(jsonb_array_length(page->'items') = 1 and (page->'items'->0->>'id')::uuid = pg_temp.id('item7')
    and page->'items'->0->'listing'->>'stock_state' = 'out_of_stock', 'out-of-stock filter wrong');
  perform pg_temp.expect_error($q$select public.get_inventory_page('{"sort":"stock; drop table x"}', null, 10)$q$, 'INVENTORY_FILTER_INVALID');
  perform pg_temp.expect_error($q$select public.get_inventory_page('{}', '{"value":"x"}', 10)$q$, 'INVENTORY_FILTER_INVALID');

  summary := public.get_inventory_summary();
  perform pg_temp.check((summary->>'skus')::int = 7 and (summary->>'unlinked')::int = 3 and (summary->>'published')::int = 4
    and (summary->>'out_of_stock')::int = 1 and (summary->>'low_stock')::int = 1 and summary->>'can_write' = 'true', 'summary counts wrong');
end $$;

-- ------------------------------------------------------------------ disabling the pilot

select pg_temp.as_admin();
select public.admin_set_store_inventory_enabled('e2000000-0000-4000-8000-000000000001', false, 'Fin del piloto');
select pg_temp.as_user('owner_a');
do $$ begin
  perform pg_temp.check(pg_temp.audits('store_inventory_disabled', pg_temp.id('store_a'), 'Fin del piloto') = 1, 'disabling was not audited');
  perform pg_temp.expect_error($q$select public.record_stock_movement(pg_temp.id('item1'), 'restock', 1, null, null, null, null, 'qa-move-disabled')$q$, 'INVENTORY_NOT_ENABLED');
  perform pg_temp.check(public.get_inventory_summary()->>'inventory_enabled' = 'false', 'disabled store still enabled');
  perform pg_temp.check(jsonb_array_length(public.get_inventory_page()->'items') > 0, 'disabled store lost read access');
end $$;

-- ------------------------------------------------------------------ ledger integrity

reset role;
do $$ begin
  perform pg_temp.check(not exists (
    select 1 from public.store_inventory_items i
    where i.store_id in (pg_temp.id('store_a'), pg_temp.id('store_b'))
      and i.quantity_on_hand <> (select coalesce(sum(m.on_hand_delta), 0) from public.store_stock_movements m where m.item_id = i.id)
  ), 'ledger does not sum to quantity_on_hand');
  perform pg_temp.check(not exists (
    select 1 from public.store_inventory_items i
    where i.store_id = pg_temp.id('store_a') and i.quantity_on_hand <> (
      select m.on_hand_after from public.store_stock_movements m where m.item_id = i.id
      order by m.item_version_after desc limit 1)
  ), 'latest movement does not match quantity_on_hand');
  perform pg_temp.check(not exists (select 1 from public.store_inventory_items where quantity_reserved <> 0), 'a reservation was written');
  perform pg_temp.check(not exists (
    select 1 from public.listings l
    where l.slug like 'so1-%' and (l.stock_state is not null) <> exists (select 1 from public.store_inventory_items i where i.listing_id = l.id)
  ), 'stock_state is not null exactly for linked listings');
  perform pg_temp.check(not exists (
    select 1 from public.store_inventory_items i join public.listings l on l.id = i.listing_id
    where l.stock_state <> case when i.quantity_available > 0 then 'in_stock' else 'out_of_stock' end
       or l.price_pen is distinct from i.unit_price_pen
  ), 'a linked listing disagrees with its item');
end $$;

rollback;
