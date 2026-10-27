-- STORE-3a import photos: upload slots, storage policies, server-side checks (service role only), matching by file
-- name / Foto(s) column / manifest, ambiguity, duplicates, the 10-photo cap, manual correction, the listing photo
-- validator and attachment guard, isolation between stores, cancel and retention cleanup.
-- Local/test database only. Every fixture is rolled back. Byte-level checks (magic bytes, dimensions, polyglots) are
-- in tests/store-ops-3a.test.cjs; here the service role reports their outcome the way the completion route does.
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

create function pg_temp.as_user(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(p_name), 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"e1000000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal2","app_metadata":{"role":"admin"}}', true);
end $$;

create function pg_temp.session(p_id uuid) returns public.store_import_sessions language sql security definer as $$
  select * from public.store_import_sessions where id = p_id
$$;
create function pg_temp.row_of(p_session uuid, p_row integer) returns public.store_import_rows language sql security definer as $$
  select * from public.store_import_rows where session_id = p_session and row_number = p_row
$$;
create function pg_temp.asset(p_session uuid, p_name text) returns public.store_import_photo_assets language sql security definer as $$
  select * from public.store_import_photo_assets where session_id = p_session and original_name = p_name
$$;
create function pg_temp.url(p_session uuid, p_name text) returns text language sql security definer as $$
  select laria_private.import_photo_url(a) from public.store_import_photo_assets a where session_id = p_session and original_name = p_name
$$;
create function pg_temp.slot(p_session uuid, p_name text) returns integer language sql security definer as $$
  select x.sort_order from public.store_import_photo_assignments x
  join public.store_import_photo_assets a on a.id = x.asset_id
  where a.session_id = p_session and a.original_name = p_name
$$;
create function pg_temp.row_photos(p_session uuid, p_row integer) returns text[] language sql security definer as $$
  select coalesce(array_agg(a.original_name order by x.sort_order), '{}')
  from public.store_import_photo_assignments x join public.store_import_photo_assets a on a.id = x.asset_id
  where x.session_id = p_session and x.row_number = p_row
$$;

create function pg_temp.row_json(p_session uuid, p_row integer) returns jsonb language sql security definer as $$
  select laria_private.import_row_photos_json(p_session, p_row)
$$;
create function pg_temp.set_valid(p_listing uuid, p_photos jsonb) returns boolean language sql security definer as $$
  select public.listing_photo_set_is_valid(p_listing, p_photos)
$$;
create function pg_temp.url_valid(p_url text, p_owner uuid, p_store uuid, p_session uuid) returns boolean language sql security definer as $$
  select laria_private.import_photo_url_is_valid(p_url, p_owner, p_store, p_session)
$$;

-- Plays the import up to `ready`: create, stage, map, plan. p_rows: [{row_number, parsed}].
create function pg_temp.ready_session(p_file text, p_rows jsonb) returns uuid language plpgsql as $$
declare session jsonb; token uuid; sid uuid; raw jsonb;
begin
  session := public.create_store_import_session(p_file, 'csv', 1000);
  sid := (session #>> '{session,id}')::uuid;
  token := (public.claim_store_import_step(sid)->>'lock_token')::uuid;
  perform public.begin_store_import_parse(sid, token, repeat('a', 64), 1000);
  select jsonb_agg(jsonb_build_object('row_number', (r->>'row_number')::integer,
    'raw', jsonb_build_array(jsonb_build_object('v', coalesce(r #>> '{parsed,sku}', ''), 'k', 's'))))
  into raw from jsonb_array_elements(p_rows) r;
  perform public.stage_store_import_rows(sid, token, raw);
  perform public.finish_store_import_parse(sid, token, jsonb_build_object('headers', '["SKU","Nombre","Stock","Fotos"]'::jsonb,
    'header_row', 1, 'row_count', jsonb_array_length(p_rows), 'sheet_name', null));
  perform public.release_store_import_step(sid, token);
  perform public.confirm_store_import_mapping(sid, '{"sku":0,"product_name":1,"quantity":2,"photos":3}', (pg_temp.session(sid)).version);
  perform pg_temp.remember('validating_session', sid);
  return sid;
end $$;
create function pg_temp.plan(p_session uuid, p_rows jsonb) returns void language plpgsql as $$
declare token uuid;
begin
  token := (public.claim_store_import_step(p_session)->>'lock_token')::uuid;
  perform public.plan_store_import_rows(p_session, token, p_rows);
  perform public.finish_store_import_validation(p_session, token);
  perform public.release_store_import_step(p_session, token);
end $$;
create function pg_temp.commit_all(p_session uuid) returns jsonb language plpgsql as $$
declare token uuid; rows integer[];
begin
  perform public.start_store_import_commit(p_session, (pg_temp.session(p_session)).version);
  token := (public.claim_store_import_step(p_session)->>'lock_token')::uuid;
  select array_agg(row_number order by row_number) into rows from public.store_import_rows where session_id = p_session;
  perform public.commit_store_import_chunk(p_session, token, rows);
  return public.finish_store_import_commit(p_session, token);
end $$;

-- What the browser does after asking for slots: put each file at its issued path (here: the storage row the Storage
-- API would write, under the owner's RLS). Skips names listed in p_skip.
create function pg_temp.put_objects(p_uploads jsonb, p_owner uuid, p_skip text[] default '{}') returns void language plpgsql as $$
declare upload jsonb;
begin
  for upload in select value from jsonb_array_elements(p_uploads) loop
    continue when upload->>'name' = any(p_skip);
    insert into storage.objects(bucket_id, name, owner, owner_id, metadata)
    values ('store-import-photos', upload->>'path', p_owner, p_owner::text,
      jsonb_build_object('size', 200000, 'mimetype',
        case when upload->>'path' like '%.png' then 'image/png' when upload->>'path' like '%.webp' then 'image/webp' else 'image/jpeg' end));
  end loop;
end $$;

-- The completion route's report: every uploaded asset passes with a distinct hash unless p_overrides says otherwise
-- ({name: {ok, code, width, mime_type, sha256}}).
create function pg_temp.checks_for(p_session uuid, p_overrides jsonb default '{}') returns jsonb language plpgsql security definer as $$
declare result jsonb := '[]'; asset public.store_import_photo_assets; o jsonb;
begin
  for asset in select * from public.store_import_photo_assets where session_id = p_session and status = 'awaiting_upload' order by request_order loop
    o := coalesce(p_overrides->asset.original_name, '{}');
    result := result || jsonb_build_object(
      'asset_id', asset.id,
      'ok', coalesce((o->>'ok')::boolean, true),
      'code', o->>'code',
      'mime_type', coalesce(o->>'mime_type', case asset.file_ext when 'jpg' then 'image/jpeg' when 'png' then 'image/png' else 'image/webp' end),
      'bytes', 200000,
      'width', coalesce((o->>'width')::integer, 1200),
      'height', 900,
      'sha256', coalesce(o->>'sha256', encode(sha256(convert_to(asset.id::text, 'UTF8')), 'hex')));
  end loop;
  return result;
end $$;

select pg_temp.remember('owner_a', 'e5300000-0000-4000-8000-000000000001'),
       pg_temp.remember('owner_b', 'e5300000-0000-4000-8000-000000000002'),
       pg_temp.remember('particular', 'e5300000-0000-4000-8000-000000000003'),
       pg_temp.remember('store_a', 'e6300000-0000-4000-8000-000000000001'),
       pg_temp.remember('store_b', 'e6300000-0000-4000-8000-000000000002'),
       pg_temp.remember('la', 'e7300000-0000-4000-8000-000000000001'),
       pg_temp.remember('lb', 'e7300000-0000-4000-8000-000000000002'),
       pg_temp.remember('lp', 'e7300000-0000-4000-8000-000000000003');

-- ------------------------------------------------------------------ fixtures

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e5300000-0000-4000-8000-000000000001','authenticated','authenticated','so3a-owner-a@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Tienda A","phone":"51999996001","city":"Lima","region":"Lima"}'),
 ('e5300000-0000-4000-8000-000000000002','authenticated','authenticated','so3a-owner-b@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Tienda B","phone":"51999996002","city":"Lima","region":"Lima"}'),
 ('e5300000-0000-4000-8000-000000000003','authenticated','authenticated','so3a-particular@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Particular 3A","phone":"51999996003","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('e6300000-0000-4000-8000-000000000001','so3a-tienda-a','Tienda 3A A','Tienda 3A A SAC','20999997001','so3a-a@example.invalid','Contacto A','Contacto A','51999996001','Lima','Lima','Av. QA 1','e5300000-0000-4000-8000-000000000001','active','free',true),
 ('e6300000-0000-4000-8000-000000000002','so3a-tienda-b','Tienda 3A B','Tienda 3A B SAC','20999997002','so3a-b@example.invalid','Contacto B','Contacto B','51999996002','Lima','Lima','Av. QA 2','e5300000-0000-4000-8000-000000000002','active','free',true);

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at) values
 ('e7300000-0000-4000-8000-000000000001','so3a-la','Pedal 3A tienda A','store','approved','pedals','pedals','QA','Uno','Nuevo',300,'Lima','Lima','Contacto A','51999996001','Descripción de inventario válida con más de cuarenta caracteres.','e5300000-0000-4000-8000-000000000001','e6300000-0000-4000-8000-000000000001','self_service',now()),
 ('e7300000-0000-4000-8000-000000000002','so3a-lb','Pedal 3A tienda B','store','approved','pedals','pedals','QA','Dos','Nuevo',300,'Lima','Lima','Contacto B','51999996002','Descripción de inventario válida con más de cuarenta caracteres.','e5300000-0000-4000-8000-000000000002','e6300000-0000-4000-8000-000000000002','self_service',now()),
 ('e7300000-0000-4000-8000-000000000003','so3a-lp','Pedal 3A particular','individual','approved','pedals','pedals','QA','Tres','Usado',300,'Lima','Lima','Particular','51999996003','Descripción de inventario válida con más de cuarenta caracteres.','e5300000-0000-4000-8000-000000000003',null,'self_service',now());

insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/so3a-' || l.slug || '-' || n || '.jpg', n
from public.listings l cross join generate_series(0, 1) n where l.slug like 'so3a-%';

-- ------------------------------------------------------------------ browser role boundaries

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform pg_temp.expect_error('select 1 from public.store_import_photo_assets', 'permission denied');
  perform pg_temp.expect_error('select 1 from public.store_import_photo_assignments', 'permission denied');
  perform pg_temp.expect_error($q$select public.request_store_import_photo_uploads(gen_random_uuid(), '[]')$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.place_store_import_photo(gen_random_uuid(), gen_random_uuid(), 1)$q$, 'permission denied');
end $$;

reset role;
-- Bucket settings are read as the database owner: Supabase Storage keeps row-level security on storage.buckets with
-- no policies, so anonymous visitors see no bucket rows (Codex re-check; the local shim used to let them read it).
do $$ begin
  perform pg_temp.check((select public from storage.buckets where id = 'store-import-photos') = false, 'photo bucket is private');
  perform pg_temp.check((select file_size_limit from storage.buckets where id = 'store-import-photos') = 5242880, '5 MB per photo');
  perform pg_temp.check((select allowed_mime_types from storage.buckets where id = 'store-import-photos')
    = array['image/jpeg', 'image/png', 'image/webp'], 'JPEG, PNG and WebP only');
end $$;

select pg_temp.as_admin();
set local role authenticated;
select public.admin_set_store_inventory_enabled(pg_temp.id('store_a'), true, 'Piloto STORE-3a');
select public.admin_set_store_inventory_enabled(pg_temp.id('store_b'), true, 'Piloto STORE-3a');

-- ------------------------------------------------------------------ photos wait for a reviewed import

select pg_temp.as_user('owner_a');
do $$ declare sid uuid; begin
  sid := pg_temp.ready_session('fotos.csv', '[
    {"row_number":2,"parsed":{"sku":"DS1-004","product_name":"Boss DS-1","quantity":8}},
    {"row_number":3,"parsed":{"sku":"CAB-3","product_name":"Cable 3 m","quantity":20}},
    {"row_number":4,"parsed":{"sku":null,"product_name":"Afinador","quantity":3,"photos":["frente.jpg","lateral.jpg","DS1-004__05.jpg"]}},
    {"row_number":5,"parsed":{"sku":"DUP-1","product_name":"Repetido uno","quantity":1}},
    {"row_number":6,"parsed":{"sku":"dup-1","product_name":"Repetido dos","quantity":2}},
    {"row_number":7,"parsed":{"sku":"MANY","product_name":"Muchas fotos","quantity":1}},
    {"row_number":8,"parsed":{"sku":"SOLO","product_name":"Solo","quantity":1}}]');
  perform pg_temp.remember('s1', sid);
  perform pg_temp.expect_error(format($q$select public.request_store_import_photo_uploads(%L, '[{"name":"a.jpg","type":"image/jpeg","bytes":10}]')$q$, sid),
    'IMPORT_PHOTOS_CLOSED');
  perform pg_temp.plan(sid, '[
    {"row_number":2,"parsed":{"sku":"DS1-004","product_name":"Boss DS-1","quantity":8}},
    {"row_number":3,"parsed":{"sku":"CAB-3","product_name":"Cable 3 m","quantity":20}},
    {"row_number":4,"parsed":{"sku":null,"product_name":"Afinador","quantity":3,"photos":["frente.jpg","lateral.jpg","DS1-004__05.jpg"]}},
    {"row_number":5,"parsed":{"sku":"DUP-1","product_name":"Repetido uno","quantity":1}},
    {"row_number":6,"parsed":{"sku":"dup-1","product_name":"Repetido dos","quantity":2}},
    {"row_number":7,"parsed":{"sku":"MANY","product_name":"Muchas fotos","quantity":1}},
    {"row_number":8,"parsed":{"sku":"SOLO","product_name":"Solo","quantity":1}}]');
  perform pg_temp.check((pg_temp.session(sid)).status = 'ready', 'session ready');
  perform pg_temp.check((pg_temp.row_of(sid, 5)).planned_action = 'error', 'duplicate SKU rows are errors');
end $$;

-- ------------------------------------------------------------------ upload slots

do $$ declare sid uuid := pg_temp.id('s1'); result jsonb; begin
  perform pg_temp.expect_error(format($q$select public.request_store_import_photo_uploads(%L, '[]')$q$, sid), 'IMPORT_PHOTO_REQUEST_INVALID');
  perform pg_temp.expect_error(format($q$select public.request_store_import_photo_uploads(%L, %L)$q$, sid,
    (select jsonb_agg(jsonb_build_object('name', 'x' || n || '.jpg', 'type', 'image/jpeg', 'bytes', 10)) from generate_series(1, 26) n)),
    'IMPORT_PHOTO_REQUEST_INVALID');
  perform pg_temp.expect_error(format($q$select public.request_store_import_photo_uploads(%L, '[{"name":"a.gif","type":"image/gif","bytes":10}]')$q$, sid),
    'IMPORT_PHOTO_TYPE');
  perform pg_temp.expect_error(format($q$select public.request_store_import_photo_uploads(%L, '[{"name":"a.svg","type":"image/svg+xml","bytes":10}]')$q$, sid),
    'IMPORT_PHOTO_TYPE');
  perform pg_temp.expect_error(format($q$select public.request_store_import_photo_uploads(%L, '[{"name":"a.heic","type":"image/heic","bytes":10}]')$q$, sid),
    'IMPORT_PHOTO_TYPE');
  perform pg_temp.expect_error(format($q$select public.request_store_import_photo_uploads(%L, '[{"name":"a.jpg","type":"image/jpeg","bytes":5242881}]')$q$, sid),
    'IMPORT_PHOTO_TOO_LARGE');

  result := public.request_store_import_photo_uploads(sid, jsonb_build_array(
    jsonb_build_object('name', 'DS1-004__01.jpg', 'type', 'image/jpeg', 'bytes', 200000),
    jsonb_build_object('name', '../../DS1-004__02.JPG', 'type', 'image/jpeg', 'bytes', 200000),
    jsonb_build_object('name', 'ds1-004__03.png', 'type', 'image/png', 'bytes', 200000),
    jsonb_build_object('name', E'fotos\\DS1-004__05.jpg', 'type', 'image/jpeg', 'bytes', 200000),
    jsonb_build_object('name', 'Frente.JPG', 'type', 'image/jpeg', 'bytes', 200000),
    jsonb_build_object('name', 'lateral.jpg', 'type', 'image/jpeg', 'bytes', 200000),
    jsonb_build_object('name', 'CAB-3__1.jpg', 'type', 'image/jpeg', 'bytes', 200000),
    jsonb_build_object('name', 'CAB-3__02.jpg', 'type', 'image/jpeg', 'bytes', 200000),
    jsonb_build_object('name', 'cab-3__2.webp', 'type', 'image/webp', 'bytes', 200000),
    jsonb_build_object('name', 'NOPE-1__01.jpg', 'type', 'image/jpeg', 'bytes', 200000),
    jsonb_build_object('name', 'DUP-1__01.jpg', 'type', 'image/jpeg', 'bytes', 200000),
    jsonb_build_object('name', E'DS1‐004__04.jpg', 'type', 'image/jpeg', 'bytes', 200000),
    jsonb_build_object('name', 'DS1-004__06.jpg', 'type', 'image/jpeg', 'bytes', 200000),
    jsonb_build_object('name', 'SOLO__01.jpg', 'type', 'image/jpeg', 'bytes', 200000),
    jsonb_build_object('name', 'SOLO__02.jpg', 'type', 'image/jpeg', 'bytes', 200000),
    jsonb_build_object('name', 'SOLO__03.png', 'type', 'image/png', 'bytes', 200000),
    jsonb_build_object('name', 'SOLO__04.jpg', 'type', 'image/jpeg', 'bytes', 200000),
    jsonb_build_object('name', E'/etc/passwd\u0001.jpg', 'type', 'image/jpeg', 'bytes', 200000)));
  perform pg_temp.remember('dummy', sid);
  perform set_config('qa.batch1', (result->'uploads')::text, true);

  perform pg_temp.check(jsonb_array_length(result->'uploads') = 18, 'one slot per file');
  perform pg_temp.check(not exists (select 1 from jsonb_array_elements(result->'uploads') u
      where u->>'path' !~ ('^' || pg_temp.id('owner_a')::text || '/' || sid::text || '/[0-9a-f-]{36}[.](jpg|png|webp)$')),
    'every path is {uid}/{session}/{asset}.{ext}, generated by the database');
  perform pg_temp.check((pg_temp.asset(sid, 'DS1-004__02.JPG')).id is not null, 'traversal name keeps only the base name for display');
  perform pg_temp.check((pg_temp.asset(sid, 'DS1-004__05.jpg')).id is not null, 'backslash paths keep only the base name');
  perform pg_temp.check((pg_temp.asset(sid, 'passwd.jpg')).object_path like '%.jpg', 'absolute path and control characters dropped');
  perform pg_temp.check((pg_temp.asset(sid, 'SOLO__03.png')).file_ext = 'png', 'extension comes from the declared type');
  perform pg_temp.check((pg_temp.asset(sid, 'ds1-004__03.png')).claimed_sku_normalized = 'DS1-004'
    and (pg_temp.asset(sid, 'ds1-004__03.png')).claimed_sequence = 3, 'SKU__NN parsed case-insensitively');
  perform pg_temp.check((pg_temp.asset(sid, E'DS1‐004__04.jpg')).claim_source = 'none', 'look-alike hyphen is not a SKU');
  perform pg_temp.check((pg_temp.session(sid)).photo_counts->>'awaiting_upload' = '18', 'counts follow the slots');
end $$;

-- ------------------------------------------------------------------ storage policies

-- The owner can put bytes only at an issued path, once, while it waits.
select pg_temp.put_objects(current_setting('qa.batch1')::jsonb, pg_temp.id('owner_a'), array['SOLO__04.jpg']);
do $$ declare sid uuid := pg_temp.id('s1'); begin
  perform pg_temp.expect_error(format($q$insert into storage.objects(bucket_id, name, owner_id) values ('store-import-photos', %L, %L)$q$,
    pg_temp.id('owner_a')::text || '/' || sid::text || '/' || gen_random_uuid()::text || '.jpg', pg_temp.id('owner_a')),
    'new row violates row-level security');
  perform pg_temp.expect_error(format($q$insert into storage.objects(bucket_id, name, owner_id) values ('store-imports', %L, %L)$q$,
    (pg_temp.asset(sid, 'SOLO__04.jpg')).object_path, pg_temp.id('owner_a')),
    'new row violates row-level security');
  update storage.objects set name = name || '.x' where bucket_id = 'store-import-photos';
  perform pg_temp.check(not found, 'owner cannot rename an import photo');
  delete from storage.objects where bucket_id = 'store-import-photos';
  perform pg_temp.check(not found, 'owner cannot delete an import photo');
  perform pg_temp.check((select count(*) from storage.objects where bucket_id = 'store-import-photos') = 17, 'owner reads own photos');
end $$;

select pg_temp.as_user('owner_b');
do $$ declare sid uuid := pg_temp.id('s1'); begin
  perform pg_temp.expect_error(format($q$insert into storage.objects(bucket_id, name, owner_id) values ('store-import-photos', %L, %L)$q$,
    (pg_temp.asset(sid, 'SOLO__04.jpg')).object_path, pg_temp.id('owner_b')), 'new row violates row-level security');
  perform pg_temp.check((select count(*) from storage.objects where bucket_id = 'store-import-photos') = 0, 'other owners read nothing');
  perform pg_temp.check((select count(*) from public.store_import_photo_assets) = 0, 'other owners see no assets');
  perform pg_temp.expect_error(format($q$select public.request_store_import_photo_uploads(%L, '[{"name":"a.jpg","type":"image/jpeg","bytes":10}]')$q$, sid),
    'IMPORT_SESSION_NOT_FOUND');
  perform pg_temp.expect_error(format($q$select public.reset_store_import_photo_matching(%L)$q$, sid), 'IMPORT_SESSION_NOT_FOUND');
end $$;

-- ------------------------------------------------------------------ server-side checks (service role only)

select pg_temp.as_user('owner_a');
do $$ begin
  perform pg_temp.expect_error(format($q$select public.record_store_import_photo_checks(%L, %L, '[]')$q$, pg_temp.id('owner_a'), pg_temp.id('s1')),
    'permission denied');
  perform pg_temp.expect_error($q$select * from public.claim_store_import_photo_deletions(10)$q$, 'permission denied');
end $$;
select set_config('qa.checks', pg_temp.checks_for(pg_temp.id('s1'), jsonb_build_object(
  'DS1-004__06.jpg', jsonb_build_object('sha256', encode(sha256(convert_to((pg_temp.asset(pg_temp.id('s1'), 'DS1-004__01.jpg')).id::text, 'UTF8')), 'hex')),
  'SOLO__01.jpg', jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_IMAGE'),
  'SOLO__02.jpg', jsonb_build_object('width', 300),
  'SOLO__03.png', jsonb_build_object('mime_type', 'image/jpeg')))::text, true);

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare sid uuid := pg_temp.id('s1'); result jsonb; begin
  perform pg_temp.expect_error(format($q$select public.record_store_import_photo_checks(%L, %L, %L)$q$,
    pg_temp.id('owner_b'), sid, current_setting('qa.checks')), 'IMPORT_SESSION_NOT_FOUND');
  result := public.record_store_import_photo_checks(pg_temp.id('owner_a'), sid, current_setting('qa.checks')::jsonb);
  perform pg_temp.check((result->>'validated')::integer = 14, 'fourteen photos pass');
  perform pg_temp.check(jsonb_array_length(result->'rejected') = 3, 'three rejected');
  perform pg_temp.check((pg_temp.asset(sid, 'SOLO__01.jpg')).reject_code = 'PHOTO_NOT_IMAGE', 'not an image');
  perform pg_temp.check((pg_temp.asset(sid, 'SOLO__02.jpg')).reject_code = 'PHOTO_DIMENSIONS', 'too small');
  perform pg_temp.check((pg_temp.asset(sid, 'SOLO__03.png')).reject_code = 'PHOTO_TYPE_MISMATCH', 'declared PNG, bytes are JPEG');
  perform pg_temp.check((pg_temp.asset(sid, 'SOLO__04.jpg')).status = 'awaiting_upload', 'no object yet: still waiting');
  -- Reporting again changes nothing: only waiting assets are recorded.
  result := public.record_store_import_photo_checks(pg_temp.id('owner_a'), sid, current_setting('qa.checks')::jsonb);
  perform pg_temp.check((result->>'validated')::integer = 0 and jsonb_array_length(result->'rejected') = 0, 'idempotent');
end $$;

-- ------------------------------------------------------------------ matching

reset role;
set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ declare sid uuid := pg_temp.id('s1'); begin
  perform pg_temp.check(pg_temp.row_photos(sid, 2) = array['DS1-004__01.jpg', 'DS1-004__02.JPG', 'ds1-004__03.png'],
    'file name convention places DS1-004 photos in order');
  perform pg_temp.check((pg_temp.row_of(sid, 2)).photo_state = 'ready' and (pg_temp.row_of(sid, 2)).photo_count = 3, 'DS1-004 ready');
  perform pg_temp.check(pg_temp.row_photos(sid, 4) = array['Frente.JPG', 'lateral.jpg', 'DS1-004__05.jpg'],
    'Foto(s) column places a SKU-less row, case-insensitive, in listed order');
  perform pg_temp.check((pg_temp.asset(sid, 'DS1-004__05.jpg')).match_source = 'column'
    and (pg_temp.asset(sid, 'DS1-004__05.jpg')).match_note = 'explicit_over_filename', 'explicit mapping wins and the conflict is shown');
  perform pg_temp.check((pg_temp.asset(sid, 'DS1-004__06.jpg')).match_issue = 'duplicate_image'
    and (pg_temp.asset(sid, 'DS1-004__06.jpg')).duplicate_of = (pg_temp.asset(sid, 'DS1-004__01.jpg')).id, 'same bytes set aside');
  perform pg_temp.check((pg_temp.asset(sid, 'CAB-3__02.jpg')).match_issue = 'duplicate_sequence'
    and (pg_temp.asset(sid, 'cab-3__2.webp')).match_issue = 'duplicate_sequence', 'two photos claim position 2');
  perform pg_temp.check((pg_temp.row_of(sid, 3)).photo_state = 'blocked' and pg_temp.row_photos(sid, 3) = array['CAB-3__1.jpg'],
    'ambiguous row is blocked, nothing guessed');
  perform pg_temp.check((pg_temp.asset(sid, 'NOPE-1__01.jpg')).match_issue = 'unmatched_sku', 'unknown SKU');
  perform pg_temp.check((pg_temp.asset(sid, 'DUP-1__01.jpg')).match_issue = 'ambiguous_sku', 'SKU on two rows');
  perform pg_temp.check((pg_temp.asset(sid, E'DS1‐004__04.jpg')).match_issue = 'no_sku_in_name', 'name without SKU__NN');
  perform pg_temp.check((pg_temp.row_of(sid, 8)).photo_state = 'none', 'rejected photos never count');
  perform pg_temp.check((pg_temp.row_of(sid, 5)).photo_state = 'none', 'rows without photos are none');
end $$;

-- A manifest names SKU and order; eleven photos for one SKU place ten and set one aside.
do $$ declare sid uuid := pg_temp.id('s1'); result jsonb; begin
  result := public.request_store_import_photo_uploads(sid,
    (select jsonb_agg(jsonb_build_object('name', 'img-' || lpad(n::text, 2, '0') || '.jpg', 'type', 'image/jpeg', 'bytes', 200000,
       'manifest_sku', 'many', 'manifest_order', null) order by n) from generate_series(1, 11) n));
  perform set_config('qa.batch2', (result->'uploads')::text, true);
end $$;
select pg_temp.put_objects(current_setting('qa.batch2')::jsonb, pg_temp.id('owner_a'));
select set_config('qa.checks', pg_temp.checks_for(pg_temp.id('s1'))::text, true);
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.record_store_import_photo_checks(pg_temp.id('owner_a'), pg_temp.id('s1'), current_setting('qa.checks')::jsonb);
reset role;
set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ declare sid uuid := pg_temp.id('s1'); begin
  perform pg_temp.check((pg_temp.asset(sid, 'img-01.jpg')).match_source = 'manifest', 'manifest claim');
  perform pg_temp.check((pg_temp.row_of(sid, 7)).photo_count = 10 and (pg_temp.row_of(sid, 7)).photo_state = 'too_many',
    'ten placed, row flagged');
  perform pg_temp.check((pg_temp.asset(sid, 'img-11.jpg')).match_issue = 'over_limit', 'eleventh set aside');
  perform pg_temp.check((pg_temp.session(sid)).photo_counts->>'rows_ready' = '2'
    and (pg_temp.session(sid)).photo_counts->>'rows_blocked' = '1'
    and (pg_temp.session(sid)).photo_counts->>'rows_too_many' = '1', 'session counts');
end $$;

-- ------------------------------------------------------------------ manual correction

do $$ declare sid uuid := pg_temp.id('s1'); begin
  -- Remove one of the two position-2 photos: the other takes the place.
  perform public.place_store_import_photo(sid, (pg_temp.asset(sid, 'cab-3__2.webp')).id, null);
  perform pg_temp.check((pg_temp.asset(sid, 'cab-3__2.webp')).match_issue = 'removed', 'removed by hand');
  perform pg_temp.check(pg_temp.row_photos(sid, 3) = array['CAB-3__1.jpg', 'CAB-3__02.jpg'] and (pg_temp.row_of(sid, 3)).photo_state = 'ready',
    'ambiguity resolved');
  -- Move the set-aside eleventh photo to another SKU.
  perform public.place_store_import_photo(sid, (pg_temp.asset(sid, 'img-11.jpg')).id, 8);
  perform pg_temp.check(pg_temp.row_photos(sid, 8) = array['img-11.jpg'] and (pg_temp.row_of(sid, 8)).photo_state = 'too_few', 'moved, one photo');
  perform pg_temp.check((pg_temp.row_of(sid, 7)).photo_state = 'ready', 'the crowded row is fine now');
  -- Reorder.
  perform pg_temp.expect_error(format($q$select public.order_store_import_photos(%L, 2, %L)$q$, sid,
    array[(pg_temp.asset(sid, 'ds1-004__03.png')).id, (pg_temp.asset(sid, 'DS1-004__01.jpg')).id]), 'IMPORT_PHOTO_ORDER_STALE');
  perform public.order_store_import_photos(sid, 2, array[(pg_temp.asset(sid, 'ds1-004__03.png')).id,
    (pg_temp.asset(sid, 'DS1-004__01.jpg')).id, (pg_temp.asset(sid, 'DS1-004__02.JPG')).id]);
  perform pg_temp.check(pg_temp.row_photos(sid, 2) = array['ds1-004__03.png', 'DS1-004__01.jpg', 'DS1-004__02.JPG'], 'reordered');
  -- Move within: from DS1-004 to SOLO, appended, and the source closes its gap.
  perform public.place_store_import_photo(sid, (pg_temp.asset(sid, 'DS1-004__01.jpg')).id, 8);
  perform pg_temp.check(pg_temp.row_photos(sid, 2) = array['ds1-004__03.png', 'DS1-004__02.JPG'], 'source compacted, order kept');
  perform pg_temp.check(pg_temp.row_photos(sid, 8) = array['img-11.jpg', 'DS1-004__01.jpg'] and (pg_temp.row_of(sid, 8)).photo_state = 'ready',
    'appended at the end');
  -- New uploads still match automatically around manual rows.
  perform pg_temp.check((pg_temp.asset(sid, 'ds1-004__03.png')).placement = 'manual', 'touched rows are manual');
  -- Refusals.
  perform pg_temp.expect_error(format($q$select public.place_store_import_photo(%L, %L, 7)$q$, sid, (pg_temp.asset(sid, 'NOPE-1__01.jpg')).id),
    'IMPORT_PHOTO_ROW_FULL');
  perform pg_temp.expect_error(format($q$select public.place_store_import_photo(%L, %L, 2)$q$, sid, (pg_temp.asset(sid, 'SOLO__01.jpg')).id),
    'IMPORT_PHOTO_NOT_FOUND');
  perform pg_temp.expect_error(format($q$select public.place_store_import_photo(%L, %L, 999)$q$, sid, (pg_temp.asset(sid, 'NOPE-1__01.jpg')).id),
    'IMPORT_PHOTO_ROW_NOT_FOUND');
  -- Start over from names, column and manifest.
  perform public.reset_store_import_photo_matching(sid);
  perform pg_temp.check(pg_temp.row_photos(sid, 2) = array['DS1-004__01.jpg', 'DS1-004__02.JPG', 'ds1-004__03.png']
    and (pg_temp.row_of(sid, 3)).photo_state = 'blocked' and (pg_temp.row_of(sid, 7)).photo_state = 'too_many', 'automatic again');
  perform public.place_store_import_photo(sid, (pg_temp.asset(sid, 'cab-3__2.webp')).id, null);
end $$;

-- ------------------------------------------------------------------ commit keeps photos; generated SKUs match after

do $$ declare sid uuid := pg_temp.id('s1'); generated text; result jsonb; begin
  perform pg_temp.commit_all(sid);
  perform pg_temp.check((pg_temp.session(sid)).status = 'committed', 'committed');
  perform pg_temp.check(pg_temp.row_photos(sid, 2) = array['DS1-004__01.jpg', 'DS1-004__02.JPG', 'ds1-004__03.png'], 'photos survive the commit');
  select i.merchant_sku into generated from public.store_inventory_items i where i.id = (pg_temp.row_of(sid, 4)).applied_item_id;
  perform pg_temp.check(generated like 'LAR-%', 'row 4 got a generated SKU');
  result := public.request_store_import_photo_uploads(sid, jsonb_build_array(
    jsonb_build_object('name', generated || '__09.jpg', 'type', 'image/jpeg', 'bytes', 200000)));
  perform set_config('qa.batch3', (result->'uploads')::text, true);
end $$;
select pg_temp.put_objects(current_setting('qa.batch3')::jsonb, pg_temp.id('owner_a'));
select set_config('qa.checks', pg_temp.checks_for(pg_temp.id('s1'))::text, true);
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.record_store_import_photo_checks(pg_temp.id('owner_a'), pg_temp.id('s1'), current_setting('qa.checks')::jsonb);
reset role;
set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ declare sid uuid := pg_temp.id('s1'); photos jsonb; begin
  perform pg_temp.check((pg_temp.row_of(sid, 4)).photo_count = 4, 'a generated SKU matches after the commit');
  photos := pg_temp.row_json(sid, 2);
  perform pg_temp.check(jsonb_array_length(photos) = 3 and photos->0->>'image_url' = pg_temp.url(sid, 'DS1-004__01.jpg'),
    'publication helper returns the ordered URLs');
  perform pg_temp.check(photos->0->>'image_url' ~ '^/api/listing-images/[0-9a-f-]{36}/import-photos/[0-9a-f-]{36}/[0-9a-f-]{36}[.]jpg$',
    'URL names the import-photos prefix');
end $$;

-- ------------------------------------------------------------------ listing photo validator (§8.4)

do $$ declare sid uuid := pg_temp.id('s1'); begin
  perform pg_temp.check(pg_temp.set_valid(pg_temp.id('la'), jsonb_build_array(
    jsonb_build_object('image_url', pg_temp.url(sid, 'DS1-004__01.jpg')),
    jsonb_build_object('image_url', pg_temp.url(sid, 'DS1-004__02.JPG')))), 'own validated import photos are accepted for an own listing');
  perform pg_temp.check(not pg_temp.set_valid(pg_temp.id('la'), jsonb_build_array(
    jsonb_build_object('image_url', pg_temp.url(sid, 'DS1-004__01.jpg')),
    jsonb_build_object('image_url', pg_temp.url(sid, 'SOLO__01.jpg')))), 'rejected photo refused');
  perform pg_temp.check(not pg_temp.set_valid(pg_temp.id('la'), jsonb_build_array(
    jsonb_build_object('image_url', pg_temp.url(sid, 'DS1-004__01.jpg')),
    jsonb_build_object('image_url', pg_temp.url(sid, 'SOLO__04.jpg')))), 'photo never uploaded refused');
  perform pg_temp.check(not pg_temp.set_valid(pg_temp.id('la'), jsonb_build_array(
    jsonb_build_object('image_url', pg_temp.url(sid, 'DS1-004__01.jpg')),
    jsonb_build_object('image_url', replace(pg_temp.url(sid, 'DS1-004__02.JPG'), '.jpg', '.png')))), 'wrong extension refused');
  perform pg_temp.check(not pg_temp.set_valid(pg_temp.id('la'), jsonb_build_array(
    jsonb_build_object('image_url', pg_temp.url(sid, 'DS1-004__01.jpg')),
    jsonb_build_object('image_url', replace(pg_temp.url(sid, 'DS1-004__02.JPG'), '/import-photos/', '/store-imports/')))),
    'the spreadsheet bucket prefix is never an image');
  perform pg_temp.check(not pg_temp.url_valid(pg_temp.url(sid, 'DS1-004__01.jpg'), pg_temp.id('owner_a'),
    pg_temp.id('store_a'), gen_random_uuid()), 'a new listing only takes photos of the import publishing it');
  perform pg_temp.check(pg_temp.url_valid(pg_temp.url(sid, 'DS1-004__01.jpg'), pg_temp.id('owner_a'),
    pg_temp.id('store_a'), sid), 'and accepts its own');
end $$;

select pg_temp.as_user('owner_b');
do $$ declare sid uuid := pg_temp.id('s1'); begin
  perform pg_temp.check(not pg_temp.set_valid(pg_temp.id('lb'), jsonb_build_array(
    jsonb_build_object('image_url', pg_temp.url(sid, 'DS1-004__01.jpg')),
    jsonb_build_object('image_url', pg_temp.url(sid, 'DS1-004__02.JPG')))), 'store B cannot use store A photos');
end $$;

-- The Sprint 4 edit path takes import photos like any other upload (a verified store's photo change applies directly
-- or as a proposal; either way the URLs are stored and guarded).
select pg_temp.as_user('owner_a');
do $$ declare sid uuid := pg_temp.id('s1'); begin
  perform public.update_owned_listing(pg_temp.id('la'), '{}'::jsonb, '{}'::jsonb, jsonb_build_array(
    jsonb_build_object('image_url', pg_temp.url(sid, 'Frente.JPG'), 'alt_text', 'Frente'),
    jsonb_build_object('image_url', pg_temp.url(sid, 'lateral.jpg'), 'alt_text', 'Lateral')), gen_random_uuid());
  perform pg_temp.check(exists (select 1 from public.listing_photos where image_url = pg_temp.url(sid, 'Frente.JPG'))
    or exists (select 1 from public.listing_revision_photos where image_url = pg_temp.url(sid, 'Frente.JPG')),
    'edit stored the import photo URL');
end $$;

-- The attachment guard covers every write path, including ones that bypass the validator.
reset role;
do $$ declare sid uuid := pg_temp.id('s1'); begin
  insert into public.listing_photos(listing_id, image_url, sort_order) values (pg_temp.id('la'), pg_temp.url(sid, 'DS1-004__01.jpg'), 5);
  perform pg_temp.expect_error(format($q$insert into public.listing_photos(listing_id, image_url, sort_order) values (%L, %L, 5)$q$,
    pg_temp.id('lb'), pg_temp.url(sid, 'DS1-004__02.JPG')), 'LISTING_PHOTO_INVALID');
  perform pg_temp.expect_error(format($q$insert into public.listing_photos(listing_id, image_url, sort_order) values (%L, %L, 5)$q$,
    pg_temp.id('lp'), pg_temp.url(sid, 'DS1-004__02.JPG')), 'LISTING_PHOTO_INVALID');
  perform pg_temp.expect_error(format($q$insert into public.listing_photos(listing_id, image_url, sort_order) values (%L, %L, 6)$q$,
    pg_temp.id('la'), pg_temp.url(sid, 'SOLO__02.jpg')), 'LISTING_PHOTO_INVALID');
  perform pg_temp.expect_error(format($q$insert into public.listing_photos(listing_id, image_url, sort_order) values (%L, %L, 6)$q$,
    pg_temp.id('la'), '/api/listing-images/x/import-photos/../../secret.jpg'), 'LISTING_PHOTO_INVALID');
end $$;

-- Admin reads for support.
set local role authenticated;
select pg_temp.as_admin();
do $$ begin
  perform pg_temp.check((select count(*) from public.store_import_photo_assets where session_id = pg_temp.id('s1')) = 30, 'admin reads assets');
end $$;

-- ------------------------------------------------------------------ cancel discards; the 600 cap

select pg_temp.as_user('owner_b');
do $$ declare sid uuid; result jsonb; begin
  sid := pg_temp.ready_session('b.csv', '[{"row_number":2,"parsed":{"sku":"B-1","product_name":"B","quantity":1}}]');
  perform pg_temp.plan(sid, '[{"row_number":2,"parsed":{"sku":"B-1","product_name":"B","quantity":1}}]');
  perform pg_temp.remember('s2', sid);
  result := public.request_store_import_photo_uploads(sid, '[{"name":"B-1__01.jpg","type":"image/jpeg","bytes":10},{"name":"B-1__02.jpg","type":"image/jpeg","bytes":10}]');
  perform set_config('qa.batch4', (result->'uploads')::text, true);
end $$;
reset role;
insert into public.store_import_photo_assets(id, session_id, store_id, created_by, original_name, file_ext, object_path, declared_bytes, claim_source)
select x.id, pg_temp.id('s2'), pg_temp.id('store_b'), pg_temp.id('owner_b'), 'relleno.jpg', 'jpg',
  pg_temp.id('owner_b')::text || '/' || pg_temp.id('s2')::text || '/' || x.id::text || '.jpg', 10, 'none'
from (select gen_random_uuid() as id from generate_series(1, 589)) x;
set local role authenticated;
select pg_temp.as_user('owner_b');
do $$ declare sid uuid := pg_temp.id('s2'); begin
  perform pg_temp.expect_error(format($q$select public.request_store_import_photo_uploads(%L, %L)$q$, sid,
    (select jsonb_agg(jsonb_build_object('name', 'x' || n || '.jpg', 'type', 'image/jpeg', 'bytes', 10)) from generate_series(1, 10) n)),
    'IMPORT_PHOTO_LIMIT');
  perform public.request_store_import_photo_uploads(sid, '[{"name":"ultima.jpg","type":"image/jpeg","bytes":10}]');
end $$;
select pg_temp.put_objects(current_setting('qa.batch4')::jsonb, pg_temp.id('owner_b'));
do $$ declare sid uuid := pg_temp.id('s2'); begin
  perform public.cancel_store_import(sid);
  perform pg_temp.check((select count(*) from public.store_import_photo_assets where session_id = sid and status <> 'discarded') = 0,
    'a cancelled import keeps no photos');
  perform pg_temp.expect_error(format($q$select public.request_store_import_photo_uploads(%L, '[{"name":"a.jpg","type":"image/jpeg","bytes":10}]')$q$, sid),
    'IMPORT_PHOTOS_CLOSED');
  perform pg_temp.expect_error(format($q$insert into storage.objects(bucket_id, name, owner_id) values ('store-import-photos', %L, %L)$q$,
    (select object_path from public.store_import_photo_assets where session_id = sid and original_name = 'ultima.jpg'), pg_temp.id('owner_b')),
    'new row violates row-level security');
end $$;

-- ------------------------------------------------------------------ retention: published photos stay, the rest go

reset role;
do $$ declare sid uuid := pg_temp.id('s1'); begin
  update public.store_import_sessions set closed_at = now() - interval '31 days' where id = sid;
  perform laria_private.run_store_import_retention();
  perform pg_temp.check((pg_temp.session(sid)).rows_purged_at is not null, 'rows purged');
  perform pg_temp.check((pg_temp.asset(sid, 'DS1-004__01.jpg')).status = 'validated', 'a photo used by a listing is never discarded');
  perform pg_temp.check((select count(*) from public.store_import_photo_assets where session_id = sid and status = 'discarded') = 24,
    'every other uploaded or waiting photo is discarded');
  perform pg_temp.check((select count(*) from public.store_import_photo_assignments where session_id = sid) = 0, 'assignments gone with the rows');
  perform pg_temp.expect_error(format($q$insert into public.listing_photos(listing_id, image_url, sort_order) values (%L, %L, 7)$q$,
    pg_temp.id('la'), pg_temp.url(sid, 'DS1-004__02.JPG')), 'LISTING_PHOTO_INVALID');
end $$;
set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ begin
  perform pg_temp.check(not pg_temp.set_valid(pg_temp.id('la'), jsonb_build_array(
    jsonb_build_object('image_url', pg_temp.url(pg_temp.id('s1'), 'DS1-004__02.JPG')),
    jsonb_build_object('image_url', pg_temp.url(pg_temp.id('s1'), 'DS1-004__03.png')))), 'discarded photos cannot be attached');
  perform pg_temp.expect_error(format($q$select public.reset_store_import_photo_matching(%L)$q$, pg_temp.id('s1')), 'IMPORT_PHOTOS_CLOSED');
end $$;

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare claimed integer; done integer; paths text[]; begin
  select count(*), array_agg(path) into claimed, paths from public.claim_store_import_photo_deletions(100, pg_temp.id('s1'));
  perform pg_temp.check(claimed = 27, 'claims the rejected and discarded photos of the import');
  perform pg_temp.check(not ((pg_temp.asset(pg_temp.id('s1'), 'DS1-004__01.jpg')).object_path = any(paths)), 'never the published one');
  done := public.complete_store_import_photo_deletions(paths);
  perform pg_temp.check(done = claimed, 'marked deleted');
  perform pg_temp.check((select count(*) from public.claim_store_import_photo_deletions(100, pg_temp.id('s1'))) = 0, 'deleted ones are done');
  select count(*) into claimed from public.claim_store_import_photo_deletions(100);
  perform pg_temp.check(claimed = 100, 'the daily cleanup claims in batches of 100');
  perform pg_temp.check((select count(*) from public.claim_store_import_photo_deletions(100)) = 100, 'next batch, not the same paths');
end $$;

reset role;
rollback;
