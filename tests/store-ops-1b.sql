-- STORE-1b inventory screens: summary tiles, bulk low-stock threshold and bulk hide
-- (supabase/migrations/20261024120000_store_inventory_ui.sql). Local/test database only; everything is rolled back.
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

create function pg_temp.id(p_name text) returns uuid language sql as $$ select current_setting('qa.' || p_name)::uuid $$;
create function pg_temp.remember(p_name text, p_id uuid) returns void language plpgsql as $$
begin perform set_config('qa.' || p_name, p_id::text, true); end $$;
create function pg_temp.item(p_name text) returns public.store_inventory_items language sql security definer as $$
  select * from public.store_inventory_items where id = pg_temp.id(p_name)
$$;
create function pg_temp.listing_status(p_name text) returns text language sql security definer as $$
  select status::text from public.listings where id = pg_temp.id(p_name)
$$;
create function pg_temp.as_user(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(p_name), 'role', 'authenticated')::text, true);
end $$;

select pg_temp.remember('owner_a', 'f1000000-0000-4000-8000-000000000001'),
       pg_temp.remember('owner_b', 'f1000000-0000-4000-8000-000000000002'),
       pg_temp.remember('particular', 'f1000000-0000-4000-8000-000000000003'),
       pg_temp.remember('store_a', 'f2000000-0000-4000-8000-000000000001'),
       pg_temp.remember('store_b', 'f2000000-0000-4000-8000-000000000002'),
       pg_temp.remember('l1', 'f3000000-0000-4000-8000-000000000001'),
       pg_temp.remember('l2', 'f3000000-0000-4000-8000-000000000002'),
       pg_temp.remember('l3', 'f3000000-0000-4000-8000-000000000003'),
       pg_temp.remember('lb', 'f3000000-0000-4000-8000-000000000004');

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('f1000000-0000-4000-8000-000000000001','authenticated','authenticated','so1b-owner-a@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño 1b A","phone":"51999997001","city":"Lima","region":"Lima"}'),
 ('f1000000-0000-4000-8000-000000000002','authenticated','authenticated','so1b-owner-b@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño 1b B","phone":"51999997002","city":"Lima","region":"Lima"}'),
 ('f1000000-0000-4000-8000-000000000003','authenticated','authenticated','so1b-particular@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Particular 1b","phone":"51999997003","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('f2000000-0000-4000-8000-000000000001','so1b-tienda-a','Tienda 1b A','Tienda 1b A SAC','20999998001','so1b-a@example.invalid','Contacto A','Contacto A','51999997001','Lima','Lima','Av. QA 1','f1000000-0000-4000-8000-000000000001','active','free',true),
 ('f2000000-0000-4000-8000-000000000002','so1b-tienda-b','Tienda 1b B','Tienda 1b B SAC','20999998002','so1b-b@example.invalid','Contacto B','Contacto B','51999997002','Lima','Lima','Av. QA 2','f1000000-0000-4000-8000-000000000002','active','free',false);

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at) values
 ('f3000000-0000-4000-8000-000000000001','so1b-l1','Pedal 1b uno','store','approved','guitars','electric_guitar','QA','Uno','Nuevo',300,'Lima','Lima','Contacto A','51999997001','Descripción de inventario válida con más de cuarenta caracteres.','f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','self_service',now()),
 ('f3000000-0000-4000-8000-000000000002','so1b-l2','Pedal 1b dos','store','pending','guitars','electric_guitar','QA','Dos','Nuevo',400,'Lima','Lima','Contacto A','51999997001','Descripción de inventario válida con más de cuarenta caracteres.','f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','self_service',now()),
 ('f3000000-0000-4000-8000-000000000003','so1b-l3','Pedal 1b tres','store','approved','guitars','electric_guitar','QA','Tres','Nuevo',500,'Lima','Lima','Contacto A','51999997001','Descripción de inventario válida con más de cuarenta caracteres.','f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','self_service',now()),
 ('f3000000-0000-4000-8000-000000000004','so1b-lb','Pedal 1b tienda B','store','approved','guitars','electric_guitar','QA','B','Nuevo',500,'Lima','Lima','Contacto B','51999997002','Descripción de inventario válida con más de cuarenta caracteres.','f1000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000002','self_service',now());

insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/so1b-' || l.slug || '-' || n || '.jpg', n
from public.listings l cross join generate_series(0, 1) n
where l.slug like 'so1b-%';

insert into public.store_operation_settings(store_id, inventory_enabled) values
 ('f2000000-0000-4000-8000-000000000001', true),
 ('f2000000-0000-4000-8000-000000000002', true);

-- ------------------------------------------------------------------ browser role boundaries

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform pg_temp.expect_error($q$select public.set_inventory_threshold_bulk(array[gen_random_uuid()], 1, 'qa-anon-threshold')$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.hide_inventory_listings_bulk(array[gen_random_uuid()], 'qa-anon-hide')$q$, 'permission denied');
  perform pg_temp.expect_error('select public.get_inventory_summary()', 'permission denied');
end $$;

set local role authenticated;
select pg_temp.as_user('particular');
do $$ begin
  perform pg_temp.expect_error('select public.get_inventory_summary()', 'INVENTORY_STORE_REQUIRED');
  perform pg_temp.expect_error($q$select public.set_inventory_threshold_bulk(array[gen_random_uuid()], 1, 'qa-part-threshold')$q$, 'INVENTORY_STORE_REQUIRED');
  perform pg_temp.expect_error($q$select public.hide_inventory_listings_bulk(array[gen_random_uuid()], 'qa-part-hide')$q$, 'INVENTORY_STORE_REQUIRED');
end $$;

-- ------------------------------------------------------------------ fixtures through the owner functions

select pg_temp.as_user('owner_b');
do $$ declare result jsonb; begin
  result := public.create_inventory_item(jsonb_build_object('product_name', 'Pedal de B', 'listing_id', pg_temp.id('lb')), 4, 'qa1b-create-b');
  perform pg_temp.remember('item_b', (result->'item'->>'id')::uuid);
end $$;

select pg_temp.as_user('owner_a');
do $$ declare result jsonb; summary jsonb; begin
  -- An empty store reads zeros, not nulls.
  summary := public.get_inventory_summary();
  perform pg_temp.check((summary->>'skus')::int = 0 and (summary->>'sales_30d_units')::int = 0 and (summary->>'sales_30d_count')::int = 0
    and summary->'recent_movements' = '[]'::jsonb and (summary->>'hidden')::int = 0, 'empty summary is not all zeros');

  result := public.create_inventory_item(jsonb_build_object('merchant_sku', 'ds-1', 'product_name', 'Pedal uno', 'listing_id', pg_temp.id('l1')), 10, 'qa1b-create-1');
  perform pg_temp.remember('item1', (result->'item'->>'id')::uuid);
  result := public.create_inventory_item(jsonb_build_object('merchant_sku', 'ds-2', 'product_name', 'Pedal dos', 'listing_id', pg_temp.id('l2')), 3, 'qa1b-create-2');
  perform pg_temp.remember('item2', (result->'item'->>'id')::uuid);
  result := public.create_inventory_item(jsonb_build_object('merchant_sku', 'ds-3', 'product_name', 'Pedal tres', 'low_stock_threshold', 1), 2, 'qa1b-create-3');
  perform pg_temp.remember('item3', (result->'item'->>'id')::uuid);
  result := public.create_inventory_item(jsonb_build_object('merchant_sku', 'ds-4', 'product_name', 'Pedal cuatro', 'listing_id', pg_temp.id('l3')), 1, 'qa1b-create-4');
  perform pg_temp.remember('item4', (result->'item'->>'id')::uuid);
end $$;

-- ------------------------------------------------------------------ summary tiles

do $$ declare summary jsonb; begin
  perform public.record_stock_movement(pg_temp.id('item1'), 'sale', 3, 'tienda_fisica', 'B-001', null, null, 'qa1b-sale-1');
  perform public.record_stock_movement(pg_temp.id('item1'), 'sale', 2, 'whatsapp_laria', null, null, null, 'qa1b-sale-2');
  perform public.record_stock_movement(pg_temp.id('item1'), 'return', 1, 'tienda_fisica', null, null, null, 'qa1b-return-1');
  perform public.record_stock_movement(pg_temp.id('item3'), 'damage_or_loss', 1, null, null, 'Golpe', null, 'qa1b-loss-1');
  perform public.record_stock_movement(pg_temp.id('item4'), 'sale', 1, 'otro', null, null, null, 'qa1b-sale-4');

  summary := public.get_inventory_summary();
  perform pg_temp.check((summary->>'inventory_enabled')::boolean and (summary->>'can_write')::boolean, 'pilot flags missing');
  perform pg_temp.check((summary->>'skus')::int = 4, 'SKU count');
  -- 10 − 3 − 2 + 1 = 6; 3; 2 − 1 = 1; 1 − 1 = 0.
  perform pg_temp.check((summary->>'units')::int = 10 and (summary->>'available_units')::int = 10, 'unit totals');
  perform pg_temp.check((summary->>'low_stock')::int = 1 and (summary->>'out_of_stock')::int = 1, 'low and out counts');
  perform pg_temp.check((summary->>'published')::int = 2 and (summary->>'in_review')::int = 1 and (summary->>'unlinked')::int = 1, 'publication counts');
  -- Sales are net of returns in the window and count only sale movements; damage is not a sale.
  perform pg_temp.check((summary->>'sales_30d_units')::int = 5 and (summary->>'sales_30d_count')::int = 3,
    format('recorded sales wrong: %s units, %s sales', summary->>'sales_30d_units', summary->>'sales_30d_count'));
  perform pg_temp.check(jsonb_array_length(summary->'recent_movements') = 5, 'recent movements are capped at five');
  -- One transaction shares now(), so ties fall back to id; check the order contract and the row shape.
  perform pg_temp.check((select bool_and(ok) from (
      select (m->>'created_at')::timestamptz > lead((m->>'created_at')::timestamptz) over (order by n)
        or ((m->>'created_at')::timestamptz = lead((m->>'created_at')::timestamptz) over (order by n)
            and (m->>'id')::uuid > lead((m->>'id')::uuid) over (order by n))
        or lead(m->>'id') over (order by n) is null as ok
      from jsonb_array_elements(summary->'recent_movements') with ordinality as t(m, n)) ordered), 'newest movement first');
  -- Which five rows tie-break to the top is random (ids), so every row is checked against its own SKU.
  perform pg_temp.check((select count(*) = 5 and bool_and(m->>'merchant_sku' = i.merchant_sku and m->>'product_name' = i.product_name
      and m->>'actor_kind' = 'owner' and m->>'movement_type' in ('opening_balance', 'sale', 'return', 'damage_or_loss'))
    from jsonb_array_elements(summary->'recent_movements') m join public.store_inventory_items i on i.id = (m->>'item_id')::uuid),
    'movement rows carry their SKU');
  perform pg_temp.check(not exists (
    select 1 from jsonb_array_elements(summary->'recent_movements') m where m->>'item_id' = pg_temp.id('item_b')::text),
    'another store''s movements leaked into the summary');
end $$;

-- Sales older than 30 days leave the tile; the ledger is append-only, so the fixture backdates as the table owner.
reset role;
alter table public.store_stock_movements disable trigger user;
update public.store_stock_movements set created_at = now() - interval '31 days' where idempotency_key = 'qa1b-sale-1';
alter table public.store_stock_movements enable trigger user;
set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ declare summary jsonb; begin
  summary := public.get_inventory_summary();
  perform pg_temp.check((summary->>'sales_30d_units')::int = 2 and (summary->>'sales_30d_count')::int = 2, 'a 31-day-old sale still counted');
end $$;

-- ------------------------------------------------------------------ bulk low-stock threshold

do $$ declare result jsonb; replay jsonb; v1 int; v3 int; changes_before bigint; begin
  v1 := (pg_temp.item('item1')).version;
  v3 := (pg_temp.item('item3')).version;
  -- item3 already warns at 1; setting 1 on it again is not a change, so it keeps its version and writes no audit row.
  select count(*) into changes_before from public.store_inventory_changes where item_id = pg_temp.id('item3');
  result := public.set_inventory_threshold_bulk(array[pg_temp.id('item1'), pg_temp.id('item2'), pg_temp.id('item3')], 1, 'qa1b-threshold-1');
  perform pg_temp.check(result->>'replayed' = 'false' and jsonb_array_length(result->'changes') = 2, 'threshold changes: ' || (result->'changes')::text);
  perform pg_temp.check((pg_temp.item('item1')).low_stock_threshold = 1 and (pg_temp.item('item2')).low_stock_threshold = 1, 'threshold not stored');
  perform pg_temp.check((pg_temp.item('item1')).version = v1 + 1 and (pg_temp.item('item3')).version = v3, 'versions');
  perform pg_temp.check((select count(*) from public.store_inventory_changes where item_id = pg_temp.id('item3')) = changes_before, 'no-op audited');
  perform pg_temp.check((select count(*) from public.store_inventory_changes where item_id = pg_temp.id('item1') and change_type = 'details'
    and before = '{"low_stock_threshold": null}' and after = '{"low_stock_threshold": 1}' and reason = 'Cambio de umbral masivo'
    and actor_kind = 'owner' and actor_user_id = pg_temp.id('owner_a')) = 1, 'threshold change not audited');

  -- Same key and request: the first result, nothing applied twice. Same key, other data: refused.
  replay := public.set_inventory_threshold_bulk(array[pg_temp.id('item3'), pg_temp.id('item2'), pg_temp.id('item1')], 1, 'qa1b-threshold-1');
  perform pg_temp.check(replay->>'replayed' = 'true' and replay->'changes' = result->'changes', 'threshold replay (order-insensitive)');
  perform pg_temp.check((pg_temp.item('item1')).version = v1 + 1, 'replay applied twice');
  perform pg_temp.expect_error($q$select public.set_inventory_threshold_bulk(array[pg_temp.id('item1')], 5, 'qa1b-threshold-1')$q$, 'IDEMPOTENCY_KEY_REUSED');
  -- A key used by another bulk kind is refused, not replayed as this one.
  perform public.set_inventory_price_bulk(array[pg_temp.id('item3')], 'set', 250, 'qa1b-price-1');
  perform pg_temp.expect_error($q$select public.set_inventory_threshold_bulk(array[pg_temp.id('item3')], 2, 'qa1b-price-1')$q$, 'IDEMPOTENCY_KEY_REUSED');

  -- Null clears the warning.
  perform public.set_inventory_threshold_bulk(array[pg_temp.id('item2')], null, 'qa1b-threshold-clear');
  perform pg_temp.check((pg_temp.item('item2')).low_stock_threshold is null, 'threshold not cleared');

  perform pg_temp.expect_error($q$select public.set_inventory_threshold_bulk(array[pg_temp.id('item1')], -1, 'qa1b-threshold-neg')$q$, 'INVENTORY_FIELD_INVALID');
  perform pg_temp.expect_error($q$select public.set_inventory_threshold_bulk(array[pg_temp.id('item1')], 100001, 'qa1b-threshold-big')$q$, 'INVENTORY_FIELD_INVALID');
  perform pg_temp.expect_error($q$select public.set_inventory_threshold_bulk('{}'::uuid[], 1, 'qa1b-threshold-empty')$q$, 'INVENTORY_BULK_INVALID');
  perform pg_temp.expect_error($q$select public.set_inventory_threshold_bulk(array[pg_temp.id('item1'), pg_temp.id('item1')], 1, 'qa1b-threshold-dup')$q$, 'INVENTORY_BULK_INVALID');
  perform pg_temp.expect_error($q$select public.set_inventory_threshold_bulk(array[pg_temp.id('item1')], 1, 'short')$q$, 'IDEMPOTENCY_KEY_INVALID');
  -- Another store's SKU (or one that does not exist) aborts the whole batch with the same error.
  perform pg_temp.expect_error($q$select public.set_inventory_threshold_bulk(array[pg_temp.id('item1'), pg_temp.id('item_b')], 9, 'qa1b-threshold-cross')$q$, 'INVENTORY_ITEM_NOT_OWNED');
  perform pg_temp.expect_error($q$select public.set_inventory_threshold_bulk(array[gen_random_uuid()], 9, 'qa1b-threshold-ghost')$q$, 'INVENTORY_ITEM_NOT_OWNED');
  perform pg_temp.check((pg_temp.item('item1')).low_stock_threshold = 1, 'a refused batch changed an item');

  -- An archived SKU in the batch aborts it: all or nothing.
  perform public.archive_inventory_item(pg_temp.id('item3'), 'Fin de temporada');
  perform pg_temp.expect_error($q$select public.set_inventory_threshold_bulk(array[pg_temp.id('item1'), pg_temp.id('item3')], 7, 'qa1b-threshold-archived')$q$, 'INVENTORY_ITEM_ARCHIVED');
  perform pg_temp.check((pg_temp.item('item1')).low_stock_threshold = 1, 'archived SKU did not roll the batch back');
  perform public.unarchive_inventory_item(pg_temp.id('item3'), null);
end $$;

-- ------------------------------------------------------------------ bulk hide

do $$ declare result jsonb; replay jsonb; on_hand int; begin
  on_hand := (pg_temp.item('item1')).quantity_on_hand;
  -- item1 → approved listing (hidden); item2 → pending listing (skipped); item3 → no listing (skipped).
  result := public.hide_inventory_listings_bulk(array[pg_temp.id('item1'), pg_temp.id('item2'), pg_temp.id('item3')], 'qa1b-hide-1');
  perform pg_temp.check(jsonb_array_length(result->'hidden') = 1 and result->'hidden'->0->>'listing_id' = pg_temp.id('l1')::text, 'hidden list');
  perform pg_temp.check(jsonb_array_length(result->'skipped') = 2
    and exists (select 1 from jsonb_array_elements(result->'skipped') s where s->>'id' = pg_temp.id('item2')::text and s->>'reason' = 'not_published')
    and exists (select 1 from jsonb_array_elements(result->'skipped') s where s->>'id' = pg_temp.id('item3')::text and s->>'reason' = 'not_linked'),
    'skipped list: ' || (result->'skipped')::text);
  perform pg_temp.check(pg_temp.listing_status('l1') = 'hidden' and pg_temp.listing_status('l2') = 'pending', 'listing statuses after hide');
  perform pg_temp.check((select hidden_source from public.listings where id = pg_temp.id('l1')) = 'owner', 'bulk hide is an owner hide');
  perform pg_temp.check((pg_temp.item('item1')).quantity_on_hand = on_hand and (pg_temp.item('item1')).listing_id = pg_temp.id('l1'),
    'hiding changed stock or the link');
  perform pg_temp.check(coalesce(current_setting('app.allow_listing_admin_fields', true), '') = '', 'controlled-field flag left on');
  perform pg_temp.check((public.get_inventory_summary()->>'hidden')::int = 1, 'summary hidden count');

  replay := public.hide_inventory_listings_bulk(array[pg_temp.id('item3'), pg_temp.id('item2'), pg_temp.id('item1')], 'qa1b-hide-1');
  perform pg_temp.check(replay->>'replayed' = 'true' and replay->'hidden' = result->'hidden', 'hide replay');
  perform pg_temp.expect_error($q$select public.hide_inventory_listings_bulk(array[pg_temp.id('item4')], 'qa1b-hide-1')$q$, 'IDEMPOTENCY_KEY_REUSED');
  perform pg_temp.expect_error($q$select public.hide_inventory_listings_bulk(array[pg_temp.id('item4'), pg_temp.id('item_b')], 'qa1b-hide-cross')$q$, 'INVENTORY_ITEM_NOT_OWNED');
  perform pg_temp.check(pg_temp.listing_status('l3') = 'approved', 'a refused batch hid a listing');

  -- The owner restores it through the V1 path; the link and stock are untouched.
  perform public.set_owned_listing_lifecycle(pg_temp.id('l1'), 'restore');
  perform pg_temp.check(pg_temp.listing_status('l1') = 'approved', 'restore after bulk hide');
end $$;

-- An out-of-stock listing can be hidden too, and a listing an Admin hid is never "approved", so it is skipped.
do $$ declare result jsonb; begin
  perform pg_temp.check((select stock_state from public.listings where id = pg_temp.id('l3')) = 'out_of_stock', 'fixture: l3 is out of stock');
  result := public.hide_inventory_listings_bulk(array[pg_temp.id('item4')], 'qa1b-hide-out');
  perform pg_temp.check(jsonb_array_length(result->'hidden') = 1 and pg_temp.listing_status('l3') = 'hidden', 'out-of-stock hide');
end $$;

-- ------------------------------------------------------------------ read-only and disabled stores

reset role;
select set_config('app.allow_store_admin_fields', 'true', true);
update public.stores set status = 'hidden' where id = pg_temp.id('store_a');
select set_config('app.allow_store_admin_fields', '', true);
set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ declare summary jsonb; begin
  summary := public.get_inventory_summary();
  perform pg_temp.check(summary->>'can_write' = 'false' and (summary->>'skus')::int = 4, 'hidden store keeps read-only access');
  perform pg_temp.expect_error($q$select public.set_inventory_threshold_bulk(array[pg_temp.id('item1')], 3, 'qa1b-threshold-ro')$q$, 'INVENTORY_STORE_READ_ONLY');
  perform pg_temp.expect_error($q$select public.hide_inventory_listings_bulk(array[pg_temp.id('item1')], 'qa1b-hide-ro')$q$, 'INVENTORY_STORE_READ_ONLY');
end $$;

reset role;
select set_config('app.allow_store_admin_fields', 'true', true);
update public.stores set status = 'active' where id = pg_temp.id('store_a');
select set_config('app.allow_store_admin_fields', '', true);
update public.store_operation_settings set inventory_enabled = false where store_id = pg_temp.id('store_a');
set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ declare summary jsonb; begin
  summary := public.get_inventory_summary();
  perform pg_temp.check(summary->>'inventory_enabled' = 'false' and summary->>'can_write' = 'false', 'disabled pilot');
  perform pg_temp.expect_error($q$select public.set_inventory_threshold_bulk(array[pg_temp.id('item1')], 3, 'qa1b-threshold-off')$q$, 'INVENTORY_NOT_ENABLED');
  perform pg_temp.expect_error($q$select public.hide_inventory_listings_bulk(array[pg_temp.id('item1')], 'qa1b-hide-off')$q$, 'INVENTORY_NOT_ENABLED');
end $$;

-- ------------------------------------------------------------------ grants

reset role;
do $$ begin
  perform pg_temp.check(not has_function_privilege('anon', 'public.set_inventory_threshold_bulk(uuid[], integer, text)', 'execute'), 'anon threshold');
  perform pg_temp.check(not has_function_privilege('anon', 'public.hide_inventory_listings_bulk(uuid[], text)', 'execute'), 'anon hide');
  perform pg_temp.check(has_function_privilege('authenticated', 'public.hide_inventory_listings_bulk(uuid[], text)', 'execute'), 'owner hide');
  perform pg_temp.check((select prosecdef from pg_proc where oid = 'public.set_inventory_threshold_bulk(uuid[], integer, text)'::regprocedure), 'definer');
end $$;

rollback;
