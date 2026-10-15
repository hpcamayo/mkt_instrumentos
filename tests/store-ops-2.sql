-- STORE-2 spreadsheet import: sessions, lease, staging, mapping, planning, duplicates, commit (create, update,
-- snapshot reconciliation, adoption), idempotent retries, stale-preview conflicts, partial commits, cancel, RLS,
-- storage policies, retention.
-- Local/test database only. Every fixture is rolled back. The server-side parsing (CSV/XLSX) is covered by
-- tests/store-ops-2.test.cjs; this file plays the server by calling the same functions the step route calls.
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
create function pg_temp.txt(p_name text) returns text language sql as $$ select current_setting('qa.' || p_name) $$;
create function pg_temp.keep(p_name text, p_value text) returns void language plpgsql as $$
begin perform set_config('qa.' || p_name, p_value, true); end $$;

create function pg_temp.as_user(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(p_name), 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"e1000000-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}', true);
end $$;

create function pg_temp.session(p_id uuid) returns public.store_import_sessions language sql security definer as $$
  select * from public.store_import_sessions where id = p_id
$$;
create function pg_temp.row_of(p_session uuid, p_row integer) returns public.store_import_rows language sql security definer as $$
  select * from public.store_import_rows where session_id = p_session and row_number = p_row
$$;
create function pg_temp.item_by_sku(p_store uuid, p_sku text) returns public.store_inventory_items language sql security definer as $$
  select * from public.store_inventory_items where store_id = p_store and sku_normalized = upper(p_sku)
$$;
create function pg_temp.movements(p_item uuid) returns bigint language sql security definer as $$
  select count(*) from public.store_stock_movements where item_id = p_item
$$;
create function pg_temp.price_drops(p_listing uuid) returns bigint language sql security definer as $$
  select count(*) from public.notifications where event_type = 'listing_price_drop' and listing_id = p_listing
$$;

-- Plays the step route up to a confirmed mapping: claim, begin parse, stage raw rows, finish parse, confirm mapping.
-- p_rows: [{row_number, raw}]. Returns the session id.
create function pg_temp.staged_session(p_file text, p_headers jsonb, p_rows jsonb, p_mapping jsonb) returns uuid
language plpgsql as $$
declare session jsonb; token uuid; sid uuid;
begin
  session := public.create_store_import_session(p_file, 'csv', 1000);
  sid := (session #>> '{session,id}')::uuid;
  token := (public.claim_store_import_step(sid)->>'lock_token')::uuid;
  perform public.begin_store_import_parse(sid, token, repeat('a', 64), 1000);
  perform public.stage_store_import_rows(sid, token, p_rows);
  perform public.finish_store_import_parse(sid, token, jsonb_build_object('headers', p_headers, 'header_row', 1,
    'row_count', jsonb_array_length(p_rows), 'sheet_name', null));
  perform public.release_store_import_step(sid, token);
  perform public.confirm_store_import_mapping(sid, p_mapping, (pg_temp.session(sid)).version);
  return sid;
end $$;

-- Plays the validate step: plans every row with the given parsed values ({row_number, parsed, issues?}), finishes.
create function pg_temp.plan(p_session uuid, p_rows jsonb) returns void language plpgsql as $$
declare token uuid;
begin
  token := (public.claim_store_import_step(p_session)->>'lock_token')::uuid;
  perform public.plan_store_import_rows(p_session, token, p_rows);
  perform public.finish_store_import_validation(p_session, token);
  perform public.release_store_import_step(p_session, token);
end $$;

-- Plays the commit loop: confirm, commit every row in one chunk, finish.
create function pg_temp.commit_all(p_session uuid) returns jsonb language plpgsql as $$
declare token uuid; rows integer[];
begin
  perform public.start_store_import_commit(p_session, (pg_temp.session(p_session)).version);
  token := (public.claim_store_import_step(p_session)->>'lock_token')::uuid;
  select array_agg(row_number order by row_number) into rows from public.store_import_rows where session_id = p_session;
  perform public.commit_store_import_chunk(p_session, token, rows);
  return public.finish_store_import_commit(p_session, token);
end $$;

select pg_temp.remember('owner_a', 'e5000000-0000-4000-8000-000000000001'),
       pg_temp.remember('owner_b', 'e5000000-0000-4000-8000-000000000002'),
       pg_temp.remember('particular', 'e5000000-0000-4000-8000-000000000003'),
       pg_temp.remember('buyer', 'e5000000-0000-4000-8000-000000000004'),
       pg_temp.remember('store_a', 'e6000000-0000-4000-8000-000000000001'),
       pg_temp.remember('store_b', 'e6000000-0000-4000-8000-000000000002'),
       pg_temp.remember('l1', 'e7000000-0000-4000-8000-000000000001'),
       pg_temp.remember('l2', 'e7000000-0000-4000-8000-000000000002'),
       pg_temp.remember('lb', 'e7000000-0000-4000-8000-000000000003'),
       pg_temp.remember('lsold', 'e7000000-0000-4000-8000-000000000004'),
       pg_temp.remember('l5', 'e7000000-0000-4000-8000-000000000005');

-- ------------------------------------------------------------------ fixtures

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e5000000-0000-4000-8000-000000000001','authenticated','authenticated','so2-owner-a@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Tienda A","phone":"51999997001","city":"Lima","region":"Lima"}'),
 ('e5000000-0000-4000-8000-000000000002','authenticated','authenticated','so2-owner-b@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Tienda B","phone":"51999997002","city":"Lima","region":"Lima"}'),
 ('e5000000-0000-4000-8000-000000000003','authenticated','authenticated','so2-particular@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Particular SO2","phone":"51999997003","city":"Lima","region":"Lima"}'),
 ('e5000000-0000-4000-8000-000000000004','authenticated','authenticated','so2-buyer@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Comprador SO2","phone":"51999997004","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('e6000000-0000-4000-8000-000000000001','so2-tienda-a','Tienda SO2 A','Tienda SO2 A SAC','20999998001','so2-a@example.invalid','Contacto A','Contacto A','51999997001','Lima','Lima','Av. QA 1','e5000000-0000-4000-8000-000000000001','active','free',true),
 ('e6000000-0000-4000-8000-000000000002','so2-tienda-b','Tienda SO2 B','Tienda SO2 B SAC','20999998002','so2-b@example.invalid','Contacto B','Contacto B','51999997002','Lima','Lima','Av. QA 2','e5000000-0000-4000-8000-000000000002','active','free',false);

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at,sold_at) values
 ('e7000000-0000-4000-8000-000000000001','so2-l1','Pedal SO2 uno','store','approved','pedals','pedals','QA','Uno','Nuevo',300,'Lima','Lima','Contacto A','51999997001','Descripción de inventario válida con más de cuarenta caracteres.','e5000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000001','self_service',now(),null),
 ('e7000000-0000-4000-8000-000000000002','so2-l2','Pedal SO2 dos','store','approved','pedals','pedals','QA','Dos','Nuevo',450,'Lima','Lima','Contacto A','51999997001','Descripción de inventario válida con más de cuarenta caracteres.','e5000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000001','self_service',now(),null),
 ('e7000000-0000-4000-8000-000000000003','so2-lb','Pedal SO2 tienda B','store','approved','pedals','pedals','QA','Tres','Nuevo',500,'Lima','Lima','Contacto B','51999997002','Descripción de inventario válida con más de cuarenta caracteres.','e5000000-0000-4000-8000-000000000002','e6000000-0000-4000-8000-000000000002','self_service',now(),null),
 ('e7000000-0000-4000-8000-000000000004','so2-lsold','Pedal SO2 vendido','store','sold','pedals','pedals','QA','Cuatro','Nuevo',600,'Lima','Lima','Contacto A','51999997001','Descripción de inventario válida con más de cuarenta caracteres.','e5000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000001','self_service',now(),now()),
 ('e7000000-0000-4000-8000-000000000005','so2-l5','Pedal SO2 cinco','store','approved','pedals','pedals','QA','Cinco','Nuevo',800,'Lima','Lima','Contacto A','51999997001','Descripción de inventario válida con más de cuarenta caracteres.','e5000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000001','self_service',now(),null);

insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/so2-' || l.slug || '-' || n || '.jpg', n
from public.listings l cross join generate_series(0, 1) n
where l.slug like 'so2-%';

insert into public.favorites (user_id, listing_id) values
 ('e5000000-0000-4000-8000-000000000004','e7000000-0000-4000-8000-000000000002');

-- ------------------------------------------------------------------ browser role boundaries

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform pg_temp.expect_error('select 1 from public.store_import_sessions', 'permission denied');
  perform pg_temp.expect_error('select 1 from public.store_import_rows', 'permission denied');
  perform pg_temp.expect_error($q$select public.create_store_import_session('a.csv', 'csv', 10)$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.claim_store_import_file_deletions(10)$q$, 'permission denied');
end $$;

-- ------------------------------------------------------------------ gate and session creation

set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ begin
  perform pg_temp.expect_error($q$select public.create_store_import_session('a.csv', 'csv', 10)$q$, 'INVENTORY_NOT_ENABLED');
end $$;
select pg_temp.as_admin();
select public.admin_set_store_inventory_enabled(pg_temp.id('store_a'), true, 'Piloto STORE-2');
select public.admin_set_store_inventory_enabled(pg_temp.id('store_b'), true, 'Piloto STORE-2');

select pg_temp.as_user('particular');
do $$ begin
  perform pg_temp.expect_error($q$select public.create_store_import_session('a.csv', 'csv', 10)$q$, 'INVENTORY_STORE_REQUIRED');
end $$;

select pg_temp.as_user('owner_a');
do $$ declare created jsonb; sid uuid; begin
  perform pg_temp.expect_error($q$select public.create_store_import_session('a.xls', 'xls', 10)$q$, 'IMPORT_FORMAT_UNSUPPORTED');
  perform pg_temp.expect_error($q$select public.create_store_import_session('a.csv', 'csv', 5242881)$q$, 'IMPORT_FILE_TOO_LARGE');
  perform pg_temp.expect_error($q$select public.create_store_import_session('a.csv', 'csv', 0)$q$, 'IMPORT_FILE_TOO_LARGE');

  created := public.create_store_import_session(E'C:\\Users\\tienda\\../inventario\u0001 octubre.CSV', 'csv', 1200);
  sid := (created #>> '{session,id}')::uuid;
  perform pg_temp.remember('s_upload', sid);
  perform pg_temp.check(created #>> '{session,file_name}' = 'inventario octubre.CSV', 'file name keeps only the last segment, no control characters');
  perform pg_temp.check(created #>> '{upload,path}' = pg_temp.id('owner_a')::text || '/' || sid::text || '/source.csv',
    'upload path is server-generated');
  perform pg_temp.check(created #>> '{upload,bucket}' = 'store-imports', 'private bucket');
  perform pg_temp.check(not (created->'session' ? 'lock_token'), 'session json never exposes the lease token');
  perform pg_temp.expect_error($q$select public.create_store_import_session('b.csv', 'csv', 10)$q$, 'IMPORT_ALREADY_OPEN');
end $$;

-- ------------------------------------------------------------------ storage policies

do $$ begin
  perform pg_temp.check((select public from storage.buckets where id = 'store-imports') = false, 'bucket is private');
  perform pg_temp.check((select file_size_limit from storage.buckets where id = 'store-imports') = 5242880, '5 MB bucket limit');
end $$;

-- Owner A can upload exactly the session path, once, while the session awaits its file.
insert into storage.objects(bucket_id, name, owner) values
 ('store-imports', pg_temp.id('owner_a')::text || '/' || pg_temp.txt('s_upload') || '/source.csv', pg_temp.id('owner_a'));
do $$ begin
  perform pg_temp.expect_error(format($q$insert into storage.objects(bucket_id, name) values ('store-imports', %L)$q$,
    pg_temp.id('owner_a')::text || '/' || pg_temp.txt('s_upload') || '/otro.csv'), 'new row violates row-level security');
  perform pg_temp.expect_error(format($q$insert into storage.objects(bucket_id, name) values ('store-imports', %L)$q$,
    pg_temp.id('owner_a')::text || '/' || gen_random_uuid()::text || '/source.csv'), 'new row violates row-level security');
  -- No update or delete policy: the uploaded source cannot be replaced or removed by the owner.
  update storage.objects set name = name || '.x' where bucket_id = 'store-imports';
  perform pg_temp.check(not found, 'owner cannot rename an import file');
  delete from storage.objects where bucket_id = 'store-imports';
  perform pg_temp.check(not found, 'owner cannot delete an import file');
  perform pg_temp.check((select count(*) from storage.objects where bucket_id = 'store-imports') = 1, 'owner reads own import file');
end $$;

select pg_temp.as_user('owner_b');
do $$ begin
  -- Owner B can neither write into A's session path nor read A's file or session.
  perform pg_temp.expect_error(format($q$insert into storage.objects(bucket_id, name) values ('store-imports', %L)$q$,
    pg_temp.id('owner_a')::text || '/' || pg_temp.txt('s_upload') || '/source.csv'), 'new row violates row-level security');
  perform pg_temp.expect_error(format($q$insert into storage.objects(bucket_id, name) values ('store-imports', %L)$q$,
    pg_temp.id('owner_b')::text || '/' || pg_temp.txt('s_upload') || '/source.csv'), 'new row violates row-level security');
  perform pg_temp.check((select count(*) from storage.objects where bucket_id = 'store-imports') = 0, 'other owner cannot read the file');
  perform pg_temp.check((select count(*) from public.store_import_sessions) = 0, 'other owner cannot read the session');
  perform pg_temp.expect_error(format('select public.claim_store_import_step(%L)', pg_temp.id('s_upload')), 'IMPORT_SESSION_NOT_FOUND');
  perform pg_temp.expect_error(format('select public.cancel_store_import(%L)', pg_temp.id('s_upload')), 'IMPORT_SESSION_NOT_FOUND');
end $$;

-- ------------------------------------------------------------------ lease, parse, file failure

select pg_temp.as_user('owner_a');
do $$ declare sid uuid := pg_temp.id('s_upload'); token uuid; begin
  token := (public.claim_store_import_step(sid)->>'lock_token')::uuid;
  perform pg_temp.expect_error(format('select public.claim_store_import_step(%L)', sid), 'IMPORT_BUSY');
  perform pg_temp.expect_error(format('select public.begin_store_import_parse(%L, gen_random_uuid(), %L, 10)', sid, repeat('a', 64)), 'IMPORT_LEASE_LOST');
  perform pg_temp.expect_error(format('select public.stage_store_import_rows(%L, %L, %L)', sid, token,
    '[{"row_number":2,"raw":[]}]'), 'IMPORT_STATE_INVALID');
  perform public.begin_store_import_parse(sid, token, repeat('b', 64), 1200);
  perform pg_temp.expect_error(format('select public.begin_store_import_parse(%L, %L, %L, 1200)', sid, token, repeat('c', 64)), 'IMPORT_FILE_CHANGED');
  perform public.stage_store_import_rows(sid, token, '[{"row_number":2,"raw":[{"v":"A"}]}]');
  -- Staging is idempotent per row number.
  perform public.stage_store_import_rows(sid, token, '[{"row_number":2,"raw":[{"v":"A"}]}]');
  perform pg_temp.check((select count(*) from public.store_import_rows where session_id = sid) = 1, 'restaging does not duplicate');
  perform pg_temp.expect_error(format('select public.finish_store_import_parse(%L, %L, %L)', sid, token,
    '{"headers":["SKU"],"header_row":1,"row_count":5}'), 'IMPORT_ROWS_INCOMPLETE');
  perform public.fail_store_import(sid, token, 'IMPORT_XLSX_MACROS', 'El archivo tiene macros.');
  perform pg_temp.check((pg_temp.session(sid)).status = 'failed' and (pg_temp.session(sid)).closed_at is not null
    and (pg_temp.session(sid)).lock_token is null, 'failed session is closed and unleased');
  perform pg_temp.expect_error(format('select public.claim_store_import_step(%L)', sid), 'IMPORT_SESSION_CLOSED');
end $$;

-- Stale leases expire: a crashed step blocks for at most 90 seconds.
do $$ declare sid uuid; token uuid; begin
  sid := (public.create_store_import_session('lease.csv', 'csv', 10) #>> '{session,id}')::uuid;
  token := (public.claim_store_import_step(sid)->>'lock_token')::uuid;
  reset role;
  update public.store_import_sessions set locked_until = now() - interval '1 second' where id = sid;
  set local role authenticated;
  perform public.claim_store_import_step(sid);
  perform pg_temp.expect_error(format('select public.begin_store_import_parse(%L, %L, %L, 10)', sid, token, repeat('a', 64)),
    'IMPORT_LEASE_LOST');
  perform public.cancel_store_import(sid);
  perform pg_temp.check((pg_temp.session(sid)).status = 'cancelled', 'cancelled before upload');
end $$;

-- ------------------------------------------------------------------ first import: creates, generated SKU, errors

-- Existing state before the first import: one manual SKU linked to L2 (price 450, stock 4).
select public.create_inventory_item('{"merchant_sku":"PED-002","product_name":"Pedal dos","listing_id":"e7000000-0000-4000-8000-000000000002"}', 4, 'qa-so2-manual-1');

do $$ declare sid uuid; begin
  sid := pg_temp.staged_session('primera.csv', '["SKU","Nombre","Stock","Precio","ID de publicación","Umbral"]',
    '[{"row_number":2,"raw":[]},{"row_number":3,"raw":[]},{"row_number":4,"raw":[]},{"row_number":5,"raw":[]},
      {"row_number":6,"raw":[]},{"row_number":7,"raw":[]},{"row_number":8,"raw":[]},{"row_number":9,"raw":[]},
      {"row_number":10,"raw":[]},{"row_number":11,"raw":[]},{"row_number":12,"raw":[]},{"row_number":13,"raw":[]},
      {"row_number":14,"raw":[]},{"row_number":15,"raw":[]}]',
    '{"sku":0,"product_name":1,"quantity":2,"unit_price_pen":3,"listing_id":4,"low_stock_threshold":5}');
  perform pg_temp.remember('s1', sid);
  perform pg_temp.check((pg_temp.session(sid)).status = 'validating', 'mapping confirmed');

  -- The server's issues are kept; the database adds its own where the server missed something.
  perform pg_temp.plan(sid, jsonb_build_array(
    jsonb_build_object('row_number', 2, 'parsed', '{"sku":"00123","product_name":"Boss DS-1","quantity":8,"unit_price_pen":350,"low_stock_threshold":2}'::jsonb),
    jsonb_build_object('row_number', 3, 'parsed', '{"sku":null,"product_name":"Cable 3 m","quantity":20}'::jsonb),
    jsonb_build_object('row_number', 4, 'parsed', '{"sku":"pedal 1","product_name":"Mal SKU","quantity":1}'::jsonb),
    jsonb_build_object('row_number', 5, 'parsed', '{"sku":"NEG-1","product_name":"Negativo","quantity":-1}'::jsonb),
    jsonb_build_object('row_number', 6, 'parsed', '{"sku":"DUP-1","product_name":"Repetido uno","quantity":1}'::jsonb),
    jsonb_build_object('row_number', 7, 'parsed', '{"sku":"dup-1","product_name":"Repetido dos","quantity":2}'::jsonb),
    jsonb_build_object('row_number', 8, 'parsed', '{"sku":"SINSTOCK","product_name":"Sin stock"}'::jsonb),
    jsonb_build_object('row_number', 9, 'parsed', '{"sku":"PRICE-1","product_name":"Precio malo","quantity":1,"unit_price_pen":0}'::jsonb,
      'issues', '[{"code":"IMPORT_PRICE_AMBIGUOUS","field":"unit_price_pen","severity":"error","message":"Precio ambiguo: usa soles enteros."}]'::jsonb),
    jsonb_build_object('row_number', 10, 'parsed', ('{"sku":"ADOPT-1","quantity":3,"listing_id":"' || pg_temp.id('l1') || '"}')::jsonb),
    jsonb_build_object('row_number', 11, 'parsed', ('{"sku":"OTRA-B","product_name":"Ajena","quantity":3,"listing_id":"' || pg_temp.id('lb') || '"}')::jsonb),
    jsonb_build_object('row_number', 12, 'parsed', ('{"sku":"VEND-1","product_name":"Vendida","quantity":3,"listing_id":"' || pg_temp.id('lsold') || '"}')::jsonb),
    jsonb_build_object('row_number', 13, 'parsed', '{"sku":"PED-002","quantity":4}'::jsonb),
    jsonb_build_object('row_number', 14, 'parsed', '{"sku":"OTRO-SKU","quantity":4,"listing_id":"e7000000-0000-4000-8000-000000000002"}'::jsonb),
    jsonb_build_object('row_number', 15, 'parsed', '{"sku":"EXCL-1","product_name":"Excluida","quantity":5}'::jsonb)));

  perform pg_temp.check((pg_temp.session(sid)).status = 'ready', 'validation finished');
  perform pg_temp.check((pg_temp.row_of(sid, 2)).planned_action = 'create' and (pg_temp.row_of(sid, 2)).sku_normalized = '00123',
    'leading zeros kept as text');
  perform pg_temp.check((pg_temp.row_of(sid, 2)).changes #>> '{quantity_on_hand,to}' = '8', 'create shows the opening stock');
  perform pg_temp.check((pg_temp.row_of(sid, 3)).planned_action = 'create'
    and (pg_temp.row_of(sid, 3)).issues @> '[{"code":"IMPORT_SKU_GENERATED","severity":"warning"}]', 'blank SKU warns it will be generated');
  perform pg_temp.check((pg_temp.row_of(sid, 4)).planned_action = 'error'
    and (pg_temp.row_of(sid, 4)).issues @> '[{"code":"IMPORT_SKU_INVALID"}]', 'database rejects an invalid SKU');
  perform pg_temp.check((pg_temp.row_of(sid, 5)).issues @> '[{"code":"IMPORT_STOCK_INVALID"}]', 'database rejects negative stock');
  perform pg_temp.check((pg_temp.row_of(sid, 6)).planned_action = 'error' and (pg_temp.row_of(sid, 7)).planned_action = 'error'
    and (pg_temp.row_of(sid, 7)).issues @> '[{"code":"IMPORT_DUPLICATE_SKU"}]'
    and (pg_temp.row_of(sid, 7)).issues::text like '%filas 6, 7%', 'case-insensitive duplicates in one file are both errors');
  perform pg_temp.check((pg_temp.row_of(sid, 8)).issues @> '[{"code":"IMPORT_STOCK_REQUIRED"}]', 'a new SKU needs a stock');
  perform pg_temp.check((pg_temp.row_of(sid, 9)).planned_action = 'error'
    and jsonb_array_length((pg_temp.row_of(sid, 9)).issues) = 1, 'server price error kept once, database does not repeat it');
  perform pg_temp.check((pg_temp.row_of(sid, 10)).planned_action = 'adopt_listing'
    and (pg_temp.row_of(sid, 10)).changes #>> '{product_name,to}' = 'Pedal SO2 uno'
    and (pg_temp.row_of(sid, 10)).changes #>> '{unit_price_pen,to}' = '300', 'adoption takes the listing title and price when blank');
  perform pg_temp.check((pg_temp.row_of(sid, 11)).issues @> '[{"code":"IMPORT_LISTING_NOT_OWNED"}]', 'another store''s listing cannot be adopted');
  perform pg_temp.check((pg_temp.row_of(sid, 12)).issues @> '[{"code":"IMPORT_LISTING_CLOSED"}]', 'a sold listing cannot be adopted');
  perform pg_temp.check((pg_temp.row_of(sid, 13)).planned_action = 'unchanged', 'identical row is a no-op');
  perform pg_temp.check((pg_temp.row_of(sid, 14)).issues @> '[{"code":"IMPORT_SKU_LISTING_MISMATCH"}]',
    'never silently change an established SKU through a listing id');
  perform pg_temp.check((pg_temp.session(sid)).counts @> '{"create":3,"adopt_listing":1,"unchanged":1,"error":9,"to_apply":4}',
    'counts: ' || (pg_temp.session(sid)).counts::text);

  -- Excluding a row changes the version: confirming the old counts is refused.
  perform pg_temp.keep('s1_version', (pg_temp.session(sid)).version::text);
  perform public.set_store_import_rows_decision(sid, array[15], 'exclude', (pg_temp.session(sid)).version);
  perform pg_temp.expect_error(format('select public.start_store_import_commit(%L, %s)', sid, pg_temp.txt('s1_version')), 'IMPORT_VERSION_CONFLICT');
  perform pg_temp.check((pg_temp.session(sid)).counts @> '{"excluded":1,"to_apply":3}', 'exclusion counted');
  perform pg_temp.expect_error(format('select public.confirm_store_import_mapping(%L, %L, %s)', sid,
    '{"sku":0,"product_name":0,"quantity":2}', (pg_temp.session(sid)).version), 'IMPORT_MAPPING_INVALID');
end $$;

do $$ declare sid uuid := pg_temp.id('s1'); finished jsonb; ds1 public.store_inventory_items; generated public.store_inventory_items; adopted public.store_inventory_items; begin
  finished := pg_temp.commit_all(sid);
  perform pg_temp.check(finished->>'status' = 'committed', 'all applicable rows applied: ' || (finished->>'status'));
  perform pg_temp.check((pg_temp.session(sid)).result_summary @> '{"applied":3}', 'result summary kept on the session');

  ds1 := pg_temp.item_by_sku(pg_temp.id('store_a'), '00123');
  perform pg_temp.check(ds1.merchant_sku = '00123' and ds1.quantity_on_hand = 8 and ds1.unit_price_pen = 350
    and ds1.low_stock_threshold = 2 and ds1.stock_source = 'import' and ds1.version = 1, 'created item');
  perform pg_temp.check((select movement_type = 'opening_balance' and channel = 'importacion' and import_session_id = sid
    and import_row_number = 2 and idempotency_key = 'import:' || sid || ':2'
    from public.store_stock_movements where item_id = ds1.id), 'opening balance carries the session and row');

  select * into generated from public.store_inventory_items where store_id = pg_temp.id('store_a') and product_name = 'Cable 3 m';
  perform pg_temp.check(generated.sku_generated and generated.merchant_sku ~ '^LAR-[0-9]{6}$', 'generated SKU');

  adopted := pg_temp.item_by_sku(pg_temp.id('store_a'), 'ADOPT-1');
  perform pg_temp.check(adopted.listing_id = pg_temp.id('l1') and adopted.unit_price_pen = 300 and adopted.quantity_on_hand = 3,
    'adopted listing linked with its price');
  perform pg_temp.check((select stock_state from public.listings where id = pg_temp.id('l1')) = 'in_stock', 'adopted listing in stock');
  perform pg_temp.check(pg_temp.item_by_sku(pg_temp.id('store_a'), 'EXCL-1') is null, 'excluded row not applied');
  perform pg_temp.check((pg_temp.row_of(sid, 15)).commit_status = 'pending', 'excluded row stays pending');
  perform pg_temp.check((pg_temp.item_by_sku(pg_temp.id('store_a'), 'PED-002')).version = 1, 'unchanged row untouched');
end $$;

-- A retried chunk on a committed session is refused; re-calling the chunk function directly cannot re-apply rows.
do $$ declare sid uuid := pg_temp.id('s1'); begin
  perform pg_temp.expect_error(format('select public.claim_store_import_step(%L)', sid), 'IMPORT_SESSION_CLOSED');
  perform pg_temp.check(pg_temp.movements((pg_temp.item_by_sku(pg_temp.id('store_a'), '00123')).id) = 1, 'one movement');
end $$;

-- ------------------------------------------------------------------ reimport: snapshot semantics

-- Before the second file: a manual sale on 00123 (8 → 7).
select public.record_stock_movement((pg_temp.item_by_sku(pg_temp.id('store_a'), '00123')).id, 'sale', 1, 'tienda_fisica',
  null, null, null, 'qa-so2-sale-1');

do $$ declare sid uuid; ds1 public.store_inventory_items; ped public.store_inventory_items; begin
  sid := pg_temp.staged_session('segunda.csv', '["SKU","Stock","Precio","Nombre"]',
    '[{"row_number":2,"raw":[]},{"row_number":3,"raw":[]},{"row_number":4,"raw":[]}]',
    '{"sku":0,"quantity":1,"unit_price_pen":2,"product_name":3}');
  perform pg_temp.remember('s2', sid);
  perform pg_temp.plan(sid, '[
    {"row_number":2,"parsed":{"sku":"00123","quantity":5,"unit_price_pen":320}},
    {"row_number":3,"parsed":{"sku":"PED-002","quantity":4,"unit_price_pen":400,"product_name":"Pedal dos (negro)"}},
    {"row_number":4,"parsed":{"sku":"ped-002x","quantity":null,"product_name":"Nuevo sin stock"}}]');
  perform pg_temp.check((pg_temp.row_of(sid, 2)).planned_action = 'update'
    and (pg_temp.row_of(sid, 2)).changes @> '{"quantity_on_hand":{"from":7,"to":5},"unit_price_pen":{"from":350,"to":320}}',
    'snapshot shows current → counted');
  perform pg_temp.check((pg_temp.row_of(sid, 3)).changes ? 'product_name' and not ((pg_temp.row_of(sid, 3)).changes ? 'quantity_on_hand'),
    'stock equal: no stock change');

  perform pg_temp.commit_all(sid);
  ds1 := pg_temp.item_by_sku(pg_temp.id('store_a'), '00123');
  perform pg_temp.check(ds1.quantity_on_hand = 5 and ds1.unit_price_pen = 320, 'stock set to the counted total, not added');
  perform pg_temp.check((select on_hand_delta = -2 and movement_type = 'import_reconciliation'
    from public.store_stock_movements where item_id = ds1.id and import_session_id = sid), 'reconciliation of −2 recorded');
  perform pg_temp.check((select sum(on_hand_delta) from public.store_stock_movements where item_id = ds1.id) = ds1.quantity_on_hand,
    'ledger sums to on hand');
  ped := pg_temp.item_by_sku(pg_temp.id('store_a'), 'PED-002');
  perform pg_temp.check(ped.product_name = 'Pedal dos (negro)' and ped.unit_price_pen = 400, 'details and price updated');
  perform pg_temp.check((select price_pen from public.listings where id = pg_temp.id('l2')) = 400, 'price written through to the listing');
  perform pg_temp.check(pg_temp.price_drops(pg_temp.id('l2')) = 1, 'favorites get one price-drop notice');
  perform pg_temp.check(pg_temp.movements(ped.id) = 1, 'no stock movement when the count matches');
  perform pg_temp.check((select count(*) from public.store_inventory_changes where item_id = ped.id and reason = 'Importación'
    and change_type in ('details', 'price')) = 2, 'details and price audited');
  perform pg_temp.check((select count(*) from public.store_inventory_items where store_id = pg_temp.id('store_a')) = 4,
    'missing SKUs are not deleted and the invalid row created nothing');
  perform pg_temp.check((pg_temp.session(sid)).status = 'committed' and (pg_temp.row_of(sid, 4)).planned_action = 'error',
    'error rows are reported, not applied');
end $$;

-- Snapshot to zero sends a linked listing out of stock, keeps it approved.
do $$ declare sid uuid; begin
  sid := pg_temp.staged_session('agotado.csv', '["SKU","Stock"]', '[{"row_number":2,"raw":[]}]', '{"sku":0,"quantity":1}');
  perform pg_temp.plan(sid, '[{"row_number":2,"parsed":{"sku":"ADOPT-1","quantity":0}}]');
  perform pg_temp.commit_all(sid);
  perform pg_temp.check((select status = 'approved' and stock_state = 'out_of_stock' from public.listings where id = pg_temp.id('l1')),
    'zero stock keeps the listing approved, out of stock');
end $$;

-- ------------------------------------------------------------------ stale preview, conflicts, partial commit, retry

do $$ declare sid uuid; ds1 public.store_inventory_items; token uuid; begin
  sid := pg_temp.staged_session('conflicto.csv', '["SKU","Stock"]',
    '[{"row_number":2,"raw":[]},{"row_number":3,"raw":[]},{"row_number":4,"raw":[]}]', '{"sku":0,"quantity":1}');
  perform pg_temp.remember('s3', sid);
  perform pg_temp.plan(sid, '[{"row_number":2,"parsed":{"sku":"00123","quantity":10}},
                              {"row_number":3,"parsed":{"sku":"NUEVO-1","product_name":"Nuevo uno","quantity":2}},
                              {"row_number":4,"parsed":{"sku":"NUEVO-2","product_name":"Nuevo dos","quantity":2}}]');
  -- After the preview: a sale on 00123, and someone creates NUEVO-2 by hand.
  perform public.record_stock_movement((pg_temp.item_by_sku(pg_temp.id('store_a'), '00123')).id, 'sale', 1, 'tienda_fisica',
    null, null, null, 'qa-so2-sale-2');
  perform public.create_inventory_item('{"merchant_sku":"NUEVO-2","product_name":"Nuevo dos manual"}', 1, 'qa-so2-manual-2');

  perform public.start_store_import_commit(sid, (pg_temp.session(sid)).version);
  token := (public.claim_store_import_step(sid)->>'lock_token')::uuid;
  perform pg_temp.expect_error(format('select public.commit_store_import_chunk(%L, %L, %L)', sid, token,
    (select array_agg(n) from generate_series(1, 51) n)), 'IMPORT_ROWS_INVALID');
  perform public.commit_store_import_chunk(sid, token, array[2, 3, 4]);
  -- The same chunk again (a retry after a timeout) changes nothing.
  perform public.commit_store_import_chunk(sid, token, array[2, 3, 4]);
  perform public.finish_store_import_commit(sid, token);

  ds1 := pg_temp.item_by_sku(pg_temp.id('store_a'), '00123');
  perform pg_temp.check(ds1.quantity_on_hand = 4, 'the sale after the preview is preserved, not overwritten');
  perform pg_temp.check((pg_temp.row_of(sid, 2)).commit_status = 'conflict', 'stale stock row is a conflict');
  perform pg_temp.check((pg_temp.row_of(sid, 3)).commit_status = 'applied', 'independent row still applied');
  perform pg_temp.check((pg_temp.row_of(sid, 4)).commit_status = 'conflict', 'SKU created meanwhile is a conflict');
  perform pg_temp.check((pg_temp.item_by_sku(pg_temp.id('store_a'), 'NUEVO-2')).product_name = 'Nuevo dos manual', 'manual SKU untouched');
  perform pg_temp.check(pg_temp.movements((pg_temp.item_by_sku(pg_temp.id('store_a'), 'NUEVO-1')).id) = 1, 'retried chunk: one movement');
  perform pg_temp.check((pg_temp.session(sid)).status = 'partially_committed', 'partial result');

  -- Re-plan the conflicts against current values, review, confirm again.
  perform public.reopen_store_import(sid, (pg_temp.session(sid)).version);
  perform pg_temp.check((pg_temp.session(sid)).status = 'validating' and (pg_temp.session(sid)).closed_at is null, 'reopened for review');
  perform pg_temp.plan(sid, '[{"row_number":2,"parsed":{"sku":"00123","quantity":10}},
                              {"row_number":4,"parsed":{"sku":"NUEVO-2","product_name":"Nuevo dos","quantity":2}}]');
  perform pg_temp.check((pg_temp.row_of(sid, 2)).changes @> '{"quantity_on_hand":{"from":4,"to":10}}', 'new preview shows current stock');
  perform pg_temp.check((pg_temp.row_of(sid, 4)).planned_action = 'update', 'existing SKU is now an update');
  perform pg_temp.check((pg_temp.row_of(sid, 3)).commit_status = 'applied', 'applied rows are not re-planned');
  perform pg_temp.commit_all(sid);
  perform pg_temp.check((pg_temp.item_by_sku(pg_temp.id('store_a'), '00123')).quantity_on_hand = 10, 'conflict resolved by review');
  perform pg_temp.check((pg_temp.session(sid)).status = 'committed', 'session committed after the second pass');
  perform pg_temp.check(pg_temp.movements((pg_temp.item_by_sku(pg_temp.id('store_a'), 'NUEVO-1')).id) = 1, 'no double apply');
end $$;

-- A row that fails at commit (archived meanwhile) does not stop the chunk; retrying failed rows applies them later.
do $$ declare sid uuid; cable public.store_inventory_items; token uuid; begin
  select * into cable from public.store_inventory_items where store_id = pg_temp.id('store_a') and product_name = 'Cable 3 m';
  sid := pg_temp.staged_session('fallo.csv', '["SKU","Stock"]', '[{"row_number":2,"raw":[]},{"row_number":3,"raw":[]}]',
    '{"sku":0,"quantity":1}');
  perform pg_temp.plan(sid, jsonb_build_array(
    jsonb_build_object('row_number', 2, 'parsed', jsonb_build_object('sku', cable.merchant_sku, 'quantity', 15)),
    jsonb_build_object('row_number', 3, 'parsed', jsonb_build_object('sku', 'NUEVO-1', 'quantity', 7))));
  perform public.archive_inventory_item(cable.id, 'Prueba');
  perform pg_temp.commit_all(sid);
  perform pg_temp.check((pg_temp.row_of(sid, 2)).commit_status = 'failed'
    and (pg_temp.row_of(sid, 2)).commit_message like 'El SKU está archivado%', 'archived meanwhile: failed with the reason');
  perform pg_temp.check((pg_temp.row_of(sid, 3)).commit_status = 'applied', 'the rest of the chunk applied');
  perform pg_temp.check((pg_temp.session(sid)).status = 'partially_committed', 'partial');

  -- The merchant reactivates the SKU and reviews the failed row again.
  perform public.unarchive_inventory_item(cable.id, 'Prueba');
  perform public.reopen_store_import(sid, (pg_temp.session(sid)).version);
  perform pg_temp.check((pg_temp.session(sid)).status = 'validating', 'failed rows go back to the review');
  perform pg_temp.plan(sid, jsonb_build_array(
    jsonb_build_object('row_number', 2, 'parsed', jsonb_build_object('sku', cable.merchant_sku, 'quantity', 15))));
  perform pg_temp.commit_all(sid);
  perform pg_temp.check((pg_temp.session(sid)).status = 'committed', 'retried row applied');
  perform pg_temp.check((select quantity_on_hand from public.store_inventory_items where id = cable.id) = 15, 'stock applied on retry');
  perform pg_temp.check((select quantity_on_hand from public.store_inventory_items where store_id = pg_temp.id('store_a') and merchant_sku = 'NUEVO-1') = 7,
    'row applied in the first pass is not applied twice');
end $$;

-- ------------------------------------------------------------------ other store, read-only store, cancel

select pg_temp.as_user('owner_b');
do $$ declare sid uuid; begin
  -- Owner B cannot see A's sessions or rows, and A's SKUs are invisible to B's planning.
  perform pg_temp.check((select count(*) from public.store_import_rows) = 0, 'no cross-store rows');
  sid := pg_temp.staged_session('b.csv', '["SKU","Stock","Nombre"]', '[{"row_number":2,"raw":[]}]',
    '{"sku":0,"quantity":1,"product_name":2}');
  perform pg_temp.plan(sid, '[{"row_number":2,"parsed":{"sku":"00123","quantity":1,"product_name":"Mismo SKU en otra tienda"}}]');
  perform pg_temp.check((pg_temp.row_of(sid, 2)).planned_action = 'create', 'SKUs are per store');
  perform pg_temp.remember('sb', sid);
end $$;

-- B's store is hidden mid-import: steps and commit refuse, staged data stays readable.
reset role;
select set_config('app.allow_store_admin_fields', 'true', true);
update public.stores set status = 'hidden' where id = pg_temp.id('store_b');
select set_config('app.allow_store_admin_fields', '', true);
set local role authenticated;
do $$ declare sid uuid := pg_temp.id('sb'); begin
  perform pg_temp.expect_error(format('select public.claim_store_import_step(%L)', sid), 'INVENTORY_STORE_READ_ONLY');
  perform pg_temp.expect_error(format('select public.start_store_import_commit(%L, %s)', sid, (pg_temp.session(sid)).version),
    'INVENTORY_STORE_READ_ONLY');
  perform pg_temp.check((select count(*) from public.store_import_rows where session_id = sid) = 1, 'staged rows still readable');
  perform public.cancel_store_import(sid);
  perform pg_temp.check((pg_temp.session(sid)).status = 'cancelled', 'a read-only store can still cancel');
  perform pg_temp.check(pg_temp.item_by_sku(pg_temp.id('store_b'), '00123') is null, 'nothing applied');
end $$;

-- Admin reads sessions; nobody writes the tables directly.
select pg_temp.as_admin();
do $$ begin
  perform pg_temp.check((select count(*) from public.store_import_sessions) >= 6, 'admin reads import sessions');
  perform pg_temp.expect_error($q$update public.store_import_rows set commit_status = 'applied'$q$, 'permission denied');
  perform pg_temp.expect_error($q$delete from public.store_import_sessions$q$, 'permission denied');
end $$;

-- ------------------------------------------------------------------ retention

reset role;
do $$ declare result jsonb; sid1 uuid := pg_temp.id('s1'); stale uuid; begin
  -- An open session idle for 8 days expires; a session closed 31 days ago loses its rows and queues its file.
  stale := gen_random_uuid();
  insert into public.store_import_sessions (id, store_id, created_by, file_format, file_name, file_path, file_bytes)
  values (stale, pg_temp.id('store_a'), pg_temp.id('owner_a'), 'csv', 'viejo.csv',
          pg_temp.id('owner_a')::text || '/' || stale::text || '/source.csv', 10);
  alter table public.store_import_sessions disable trigger store_import_sessions_set_updated_at;
  update public.store_import_sessions set updated_at = now() - interval '8 days' where id = stale;
  update public.store_import_sessions set closed_at = now() - interval '31 days' where id = sid1;
  alter table public.store_import_sessions enable trigger store_import_sessions_set_updated_at;

  result := laria_private.run_store_import_retention();
  perform pg_temp.check((pg_temp.session(stale)).status = 'expired', 'idle open session expired');
  perform pg_temp.check((select count(*) from public.store_import_rows where session_id = sid1) = 0, 'old staged rows deleted');
  perform pg_temp.check((pg_temp.session(sid1)).rows_purged_at is not null and (pg_temp.session(sid1)).result_summary is not null,
    'session row and summary kept');
  perform pg_temp.check(exists (select 1 from laria_private.store_import_file_deletions where path = (pg_temp.session(sid1)).file_path),
    'source file queued for deletion');
  perform pg_temp.check((select count(*) from public.store_stock_movements where import_session_id = sid1) = 3,
    'ledger entries from the import are permanent');
  -- Running it again is harmless.
  perform laria_private.run_store_import_retention();
end $$;

-- The cleanup route's claim functions are service-role only.
set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ begin
  perform pg_temp.expect_error($q$select * from public.claim_store_import_file_deletions(10)$q$, 'permission denied');
end $$;
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare claimed integer; done integer; paths text[]; begin
  select count(*), array_agg(path) into claimed, paths from public.claim_store_import_file_deletions(10);
  perform pg_temp.check(claimed >= 1, 'claims queued files');
  perform pg_temp.check((select count(*) from public.claim_store_import_file_deletions(10)) = 0, 'claimed paths are not claimed twice');
  done := public.complete_store_import_file_deletions(paths);
  perform pg_temp.check(done = claimed, 'marks deleted');
end $$;

reset role;
rollback;
