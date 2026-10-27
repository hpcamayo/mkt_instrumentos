-- STORE-3b: listing allowance per store (design §10, D-1) and publication from an import (§7.7).
-- Local/test database only. Every fixture is rolled back. The route-side field rules (publish form validators) are in
-- tests/store-ops-3b.test.cjs; here the service role sends fields the way the publish route does.
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
create function pg_temp.listing(p_id uuid) returns public.listings language sql security definer as $$
  select * from public.listings where id = p_id
$$;
create function pg_temp.published(p_session uuid, p_row integer) returns public.listings language sql security definer as $$
  select l.* from public.listings l join public.store_import_rows r on r.published_listing_id = l.id
  where r.session_id = p_session and r.row_number = p_row
$$;
create function pg_temp.asset_id(p_session uuid, p_name text) returns uuid language sql security definer as $$
  select id from public.store_import_photo_assets where session_id = p_session and original_name = p_name
$$;
create function pg_temp.photo_url(p_session uuid, p_name text) returns text language sql security definer as $$
  select laria_private.import_photo_url(a) from public.store_import_photo_assets a where session_id = p_session and original_name = p_name
$$;
create function pg_temp.audit_detail(p_store uuid) returns jsonb language sql security definer as $$
  select detail from public.admin_audit_actions where target_id = p_store and action = 'store_listing_allowance_changed'
  order by created_at limit 1
$$;
create function pg_temp.audits(p_store uuid) returns bigint language sql security definer as $$
  select count(*) from public.admin_audit_actions where target_id = p_store and action = 'store_listing_allowance_changed'
$$;
create function pg_temp.outcome(p_result jsonb, p_row integer) returns jsonb language sql as $$
  select value from jsonb_array_elements(p_result->'results') where (value->>'row_number')::integer = p_row
$$;
create function pg_temp.alerted(p_listing uuid) returns bigint language sql security definer as $$
  select count(*) from laria_private.listing_alert_publications where listing_id = p_listing
$$;

-- Plays an import to `ready`: create, stage, map, plan. p_rows: [{row_number, parsed}].
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
  perform public.finish_store_import_parse(sid, token, jsonb_build_object('headers', '["SKU","Nombre","Stock","Precio"]'::jsonb,
    'header_row', 1, 'row_count', jsonb_array_length(p_rows), 'sheet_name', null));
  perform public.release_store_import_step(sid, token);
  perform public.confirm_store_import_mapping(sid, '{"sku":0,"product_name":1,"quantity":2,"unit_price_pen":3}', (pg_temp.session(sid)).version);
  token := (public.claim_store_import_step(sid)->>'lock_token')::uuid;
  perform public.plan_store_import_rows(sid, token, p_rows);
  perform public.finish_store_import_validation(sid, token);
  perform public.release_store_import_step(sid, token);
  return sid;
end $$;
create function pg_temp.commit_all(p_session uuid) returns jsonb language plpgsql as $$
declare token uuid; rows integer[];
begin
  perform public.start_store_import_commit(p_session, (pg_temp.session(p_session)).version);
  token := (public.claim_store_import_step(p_session)->>'lock_token')::uuid;
  select array_agg(row_number order by row_number) into rows from public.store_import_rows
  where session_id = p_session and planned_action in ('create', 'update', 'adopt_listing');
  perform public.commit_store_import_chunk(p_session, token, rows);
  return public.finish_store_import_commit(p_session, token);
end $$;
-- Asks for one slot per name and puts each object at its issued path (what the browser does).
create function pg_temp.upload(p_session uuid, p_owner uuid, p_names text[]) returns void language plpgsql as $$
declare result jsonb; upload jsonb;
begin
  result := public.request_store_import_photo_uploads(p_session,
    (select jsonb_agg(jsonb_build_object('name', n, 'type', 'image/jpeg', 'bytes', 200000)) from unnest(p_names) n));
  for upload in select value from jsonb_array_elements(result->'uploads') loop
    insert into storage.objects(bucket_id, name, owner, owner_id, metadata)
    values ('store-import-photos', upload->>'path', p_owner, p_owner::text, '{"size":200000,"mimetype":"image/jpeg"}');
  end loop;
end $$;
-- The completion route's report: every waiting photo passes with a distinct hash.
create function pg_temp.checks_for(p_session uuid) returns jsonb language sql security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('asset_id', id, 'ok', true, 'mime_type', 'image/jpeg', 'bytes', 200000,
    'width', 1200, 'height', 900, 'sha256', encode(sha256(convert_to(id::text, 'UTF8')), 'hex')) order by request_order), '[]')
  from public.store_import_photo_assets where session_id = p_session and status = 'awaiting_upload'
$$;
-- The fields the publish route builds for a complete row.
create function pg_temp.fields(p_title text) returns jsonb language sql as $$
  select jsonb_build_object('title', p_title, 'brand', 'Boss', 'model', 'DS-1', 'category', 'pedals', 'instrument_type', 'pedals',
    'condition', 'Nuevo', 'description', 'Pedal de distorsión nuevo, en caja, con garantía de la tienda por un año.',
    'attributes', jsonb_build_object('pedal_type', 'distortion'))
$$;
create function pg_temp.publish_args(p_rows integer[], p_title text default 'Boss DS-1') returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('row_number', r, 'fields', pg_temp.fields(p_title || ' ' || r)) order by r) from unnest(p_rows) r
$$;

select pg_temp.remember('owner_a', 'e5400000-0000-4000-8000-000000000001'),
       pg_temp.remember('owner_b', 'e5400000-0000-4000-8000-000000000002'),
       pg_temp.remember('owner_c', 'e5400000-0000-4000-8000-000000000003'),
       pg_temp.remember('particular', 'e5400000-0000-4000-8000-000000000004'),
       pg_temp.remember('store_a', 'e6400000-0000-4000-8000-000000000001'),
       pg_temp.remember('store_b', 'e6400000-0000-4000-8000-000000000002'),
       pg_temp.remember('store_c', 'e6400000-0000-4000-8000-000000000003');

-- ------------------------------------------------------------------ fixtures

-- A: active Tienda verificada. B: active, not verified. C: pending store.
insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e5400000-0000-4000-8000-000000000001','authenticated','authenticated','so3b-owner-a@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Tienda A","phone":"51999995001","city":"Lima","region":"Lima"}'),
 ('e5400000-0000-4000-8000-000000000002','authenticated','authenticated','so3b-owner-b@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Tienda B","phone":"51999995002","city":"Lima","region":"Lima"}'),
 ('e5400000-0000-4000-8000-000000000003','authenticated','authenticated','so3b-owner-c@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Tienda C","phone":"51999995003","city":"Lima","region":"Lima"}'),
 ('e5400000-0000-4000-8000-000000000004','authenticated','authenticated','so3b-particular@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Particular 3B","phone":"51999995004","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('e6400000-0000-4000-8000-000000000001','so3b-tienda-a','Tienda 3B A','Tienda 3B A SAC','20999996001','so3b-a@example.invalid','Contacto A','Contacto A','51999995001','Lima','Lima','Av. QA 1','e5400000-0000-4000-8000-000000000001','active','free',true),
 ('e6400000-0000-4000-8000-000000000002','so3b-tienda-b','Tienda 3B B','Tienda 3B B SAC','20999996002','so3b-b@example.invalid','Contacto B','Contacto B','51999995002','Lima','Lima','Av. QA 2','e5400000-0000-4000-8000-000000000002','active','free',false),
 ('e6400000-0000-4000-8000-000000000003','so3b-tienda-c','Tienda 3B C','Tienda 3B C SAC','20999996003','so3b-c@example.invalid','Contacto C','Contacto C','51999995003','Lima','Lima','Av. QA 3','e5400000-0000-4000-8000-000000000003','pending','free',false);

-- ------------------------------------------------------------------ browser role boundaries

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform pg_temp.expect_error('select public.get_store_listing_quota()', 'permission denied');
  perform pg_temp.expect_error($q$select public.admin_set_store_listing_allowance(gen_random_uuid(), 100, 'Piloto')$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.publish_store_import_rows(gen_random_uuid(), gen_random_uuid(), '[]', true)$q$, 'permission denied');
end $$;

reset role;
set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ declare quota jsonb; begin
  quota := public.get_store_listing_quota();
  perform pg_temp.check((quota->>'allowance')::integer = 50 and (quota->>'used')::integer = 0
    and (quota->>'remaining')::integer = 50 and (quota->>'is_default')::boolean, 'a store without settings has the V1 allowance of 50');
  perform pg_temp.check((public.get_store_listing_quota(pg_temp.id('store_a'))->>'allowance')::integer = 50, 'owner reads own quota by id');
  perform pg_temp.expect_error(format('select public.get_store_listing_quota(%L)', pg_temp.id('store_b')), 'STORE_NOT_FOUND');
  perform pg_temp.expect_error(format($q$select public.admin_set_store_listing_allowance(%L, 500, 'Me lo doy')$q$, pg_temp.id('store_a')), 'ADMIN_REQUIRED');
  perform pg_temp.expect_error($q$select public.publish_store_import_rows(gen_random_uuid(), gen_random_uuid(), '[]', true)$q$, 'permission denied');
  perform pg_temp.expect_error('select laria_private.store_listing_allowance(gen_random_uuid())', 'permission denied');
  perform pg_temp.expect_error($q$select laria_private.insert_store_listing(gen_random_uuid(), null::public.stores, '{}', '[]')$q$, 'permission denied');
end $$;

select pg_temp.as_user('particular');
do $$ begin
  perform pg_temp.expect_error('select public.get_store_listing_quota()', 'STORE_NOT_FOUND');
end $$;

-- ------------------------------------------------------------------ Admin allowance (§10)

select pg_temp.as_admin();
do $$ declare quota jsonb; begin
  perform pg_temp.expect_error(format($q$select public.admin_set_store_listing_allowance(%L, 500, ' ')$q$, pg_temp.id('store_b')), 'STORE_ALLOWANCE_REASON_REQUIRED');
  perform pg_temp.expect_error(format($q$select public.admin_set_store_listing_allowance(%L, 0, 'Piloto')$q$, pg_temp.id('store_b')), 'STORE_ALLOWANCE_INVALID');
  perform pg_temp.expect_error(format($q$select public.admin_set_store_listing_allowance(%L, 2001, 'Piloto')$q$, pg_temp.id('store_b')), 'STORE_ALLOWANCE_INVALID');
  perform pg_temp.expect_error(format($q$select public.admin_set_store_listing_allowance(%L, null, 'Piloto')$q$, pg_temp.id('store_b')), 'STORE_ALLOWANCE_INVALID');
  perform pg_temp.expect_error($q$select public.admin_set_store_listing_allowance(gen_random_uuid(), 100, 'Piloto')$q$, 'STORE_NOT_FOUND');

  quota := public.admin_set_store_listing_allowance(pg_temp.id('store_b'), 2, 'Prueba de cupo bajo');
  perform pg_temp.check((quota->>'allowance')::integer = 2 and not (quota->>'is_default')::boolean, 'Admin sets an allowance');
  perform pg_temp.check(pg_temp.audits(pg_temp.id('store_b')) = 1, 'the change is audited');
  perform pg_temp.check(pg_temp.audit_detail(pg_temp.id('store_b')) @> '{"from":50,"to":2,"reason":"Prueba de cupo bajo","used":0}',
    'audit has before, after, reason and the current count');
  perform public.admin_set_store_listing_allowance(pg_temp.id('store_b'), 2, 'Mismo valor');
  perform pg_temp.check(pg_temp.audits(pg_temp.id('store_b')) = 1, 'setting the same value writes no audit');
  perform pg_temp.check((select inventory_enabled from public.store_operation_settings where store_id = pg_temp.id('store_b')) = false,
    'setting the allowance does not enable inventory');
  perform pg_temp.check((public.get_store_listing_quota(pg_temp.id('store_b'))->>'allowance')::integer = 2, 'Admin reads any store');

  perform public.admin_set_store_inventory_enabled(pg_temp.id('store_a'), true, 'Piloto STORE-3b');
  perform public.admin_set_store_inventory_enabled(pg_temp.id('store_b'), true, 'Piloto STORE-3b');
  perform public.admin_set_store_inventory_enabled(pg_temp.id('store_c'), true, 'Piloto STORE-3b');
end $$;

-- ------------------------------------------------------------------ the cap trigger reads the allowance

reset role;
do $$ declare denied text; begin
  insert into public.listings (id,slug,title,seller_type,status,category,city,region,whatsapp_phone,owner_user_id,store_id)
  select gen_random_uuid(), 'so3b-cap-' || n, 'Cupo ' || n, 'store', 'pending', 'pedals', 'Lima', 'Lima', '51999995002',
    pg_temp.id('owner_b'), pg_temp.id('store_b') from generate_series(1, 2) n;
  begin
    insert into public.listings (slug,title,seller_type,status,category,city,region,whatsapp_phone,owner_user_id,store_id)
    values ('so3b-cap-3','Cupo 3','store','pending','pedals','Lima','Lima','51999995002',pg_temp.id('owner_b'),pg_temp.id('store_b'));
  exception when others then denied := sqlerrm;
  end;
  perform pg_temp.check(denied = 'STORE_INVENTORY_LIMIT_REACHED: La tienda ya tiene 2 publicaciones concurrentes.',
    'the third listing is refused with the store''s own number: ' || coalesce(denied, 'none'));

  -- A listing hidden and restored consumes capacity again, so it is refused too.
  perform set_config('app.allow_listing_admin_fields', 'true', true);
  update public.listings set status = 'hidden' where slug = 'so3b-cap-2';
  insert into public.listings (slug,title,seller_type,status,category,city,region,whatsapp_phone,owner_user_id,store_id)
  values ('so3b-cap-3','Cupo 3','store','pending','pedals','Lima','Lima','51999995002',pg_temp.id('owner_b'),pg_temp.id('store_b'));
  denied := null;
  begin
    update public.listings set status = 'pending' where slug = 'so3b-cap-2';
  exception when others then denied := sqlerrm;
  end;
  perform pg_temp.check(denied like 'STORE_INVENTORY_LIMIT_REACHED%', 'restoring a hidden listing past the allowance is refused');
  perform set_config('app.allow_listing_admin_fields', '', true);

end $$;

set local role authenticated;
select pg_temp.as_admin();
do $$ declare quota jsonb; begin
  -- Lowering below the current count hides nothing.
  quota := public.admin_set_store_listing_allowance(pg_temp.id('store_b'), 1, 'Bajar el cupo');
  perform pg_temp.check((quota->>'used')::integer = 2 and (quota->>'remaining')::integer = 0, 'lowered allowance: 2 in use, none left');
  perform pg_temp.check((select count(*) from public.listings where store_id = pg_temp.id('store_b') and status in ('pending', 'approved')) = 2,
    'lowering the allowance changed no listing');
  perform pg_temp.check(pg_temp.audits(pg_temp.id('store_b')) = 2, 'second change audited');
end $$;

-- ------------------------------------------------------------------ import for the verified store (A)

select pg_temp.as_user('owner_a');
do $$ declare sid uuid; begin
  sid := pg_temp.ready_session('publicar.csv', '[
    {"row_number":2,"parsed":{"sku":"PUB-1","product_name":"Boss DS-1","quantity":3,"unit_price_pen":450}},
    {"row_number":3,"parsed":{"sku":"PUB-2","product_name":"Boss SD-1","quantity":0,"unit_price_pen":380}},
    {"row_number":4,"parsed":{"sku":"PUB-3","product_name":"Una foto","quantity":1,"unit_price_pen":100}},
    {"row_number":5,"parsed":{"sku":"PUB-4","product_name":"Sin precio","quantity":1}},
    {"row_number":6,"parsed":{"sku":"PUB-5","product_name":"Incompleto","quantity":2,"unit_price_pen":200}},
    {"row_number":7,"parsed":{"sku":"PUB-6","product_name":"Repite foto","quantity":2,"unit_price_pen":250}}]');
  perform pg_temp.remember('sa', sid);
  perform pg_temp.upload(sid, pg_temp.id('owner_a'), array['PUB-1__01.jpg','PUB-1__02.jpg','PUB-2__01.jpg','PUB-2__02.jpg',
    'PUB-3__01.jpg','PUB-4__01.jpg','PUB-4__02.jpg','PUB-5__01.jpg','PUB-5__02.jpg','PUB-6__01.jpg','PUB-6__02.jpg']);
end $$;
select set_config('qa.checks', pg_temp.checks_for(pg_temp.id('sa'))::text, true);

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare sid uuid := pg_temp.id('sa'); begin
  perform public.record_store_import_photo_checks(pg_temp.id('owner_a'), sid, current_setting('qa.checks')::jsonb);
  perform pg_temp.check((pg_temp.row_of(sid, 2)).photo_state = 'ready' and (pg_temp.row_of(sid, 4)).photo_state = 'too_few',
    'photos matched by SKU__NN');
  -- Nothing publishes before the inventory is applied.
  perform pg_temp.expect_error(format('select public.publish_store_import_rows(%L, %L, %L, true)',
    pg_temp.id('owner_a'), sid, pg_temp.publish_args(array[2])), 'IMPORT_PUBLISH_CLOSED');
end $$;

reset role;
set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ begin
  perform pg_temp.commit_all(pg_temp.id('sa'));
  perform pg_temp.check((pg_temp.session(pg_temp.id('sa'))).status = 'committed', 'inventory applied');
end $$;

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare sid uuid := pg_temp.id('sa'); result jsonb; listing public.listings; item public.store_inventory_items; begin
  -- Request checks.
  perform pg_temp.expect_error(format('select public.publish_store_import_rows(%L, %L, %L, true)',
    pg_temp.id('owner_b'), sid, pg_temp.publish_args(array[2])), 'IMPORT_SESSION_NOT_FOUND');
  perform pg_temp.expect_error(format('select public.publish_store_import_rows(%L, %L, %L, false)',
    pg_temp.id('owner_a'), sid, pg_temp.publish_args(array[2])), 'IMPORT_PUBLISH_RULES_REQUIRED');
  perform pg_temp.expect_error(format('select public.publish_store_import_rows(%L, %L, %L, true)',
    pg_temp.id('owner_a'), sid, pg_temp.publish_args(array(select generate_series(1, 21)))), 'IMPORT_PUBLISH_REQUEST_INVALID');
  perform pg_temp.expect_error(format('select public.publish_store_import_rows(%L, %L, %L, true)',
    pg_temp.id('owner_a'), sid, pg_temp.publish_args(array[2]) || pg_temp.publish_args(array[2])), 'IMPORT_PUBLISH_REQUEST_INVALID');
  perform pg_temp.expect_error(format($q$select public.publish_store_import_rows(%L, %L, '[{"row_number":2}]', true)$q$,
    pg_temp.id('owner_a'), sid), 'IMPORT_PUBLISH_REQUEST_INVALID');

  result := public.publish_store_import_rows(pg_temp.id('owner_a'), sid,
    pg_temp.publish_args(array[2, 3, 4, 5]) || jsonb_build_array(
      jsonb_build_object('row_number', 6, 'fields', pg_temp.fields('Incompleto') - 'brand'),
      jsonb_build_object('row_number', 99, 'fields', pg_temp.fields('Fantasma'))), true);
  perform set_config('qa.first', result::text, true);

  perform pg_temp.check(pg_temp.outcome(result, 2)->>'outcome' = 'published' and pg_temp.outcome(result, 2)->>'listing_status' = 'approved',
    'verified store: complete row published directly');
  listing := pg_temp.published(sid, 2);
  select * into item from public.store_inventory_items where id = (pg_temp.row_of(sid, 2)).applied_item_id;
  perform pg_temp.check(item.listing_id = listing.id and listing.store_id = pg_temp.id('store_a') and listing.seller_type = 'store'
    and listing.owner_user_id = pg_temp.id('owner_a'), 'listing created for the store and linked to the SKU');
  perform pg_temp.check(listing.price_pen = 450 and item.unit_price_pen = 450, 'price comes from the SKU');
  perform pg_temp.check(listing.stock_state = 'in_stock' and listing.published_at is not null, 'in stock and published');
  perform pg_temp.check((listing.city, listing.region, listing.contact_name, listing.whatsapp_phone)
    = ('Lima', 'Lima', 'Contacto A', '51999995001'), 'contact data copied from the store, as the publish form does');
  perform pg_temp.check(listing.slug = 'boss-ds-1-2-' || listing.id and listing.title = 'Boss DS-1 2', 'slug built like the publish form');
  perform pg_temp.check(listing.attributes = '{"pedal_type":"distortion"}' and listing.marketplace_rules_accepted_at is not null,
    'attributes and rules acceptance stored');
  perform pg_temp.check((select array_agg(image_url order by sort_order) from public.listing_photos where listing_id = listing.id)
    = array[pg_temp.photo_url(sid, 'PUB-1__01.jpg'), pg_temp.photo_url(sid, 'PUB-1__02.jpg')],
    'listing photos are the row''s import photos, in order');
  perform pg_temp.check((select bool_and(alt_text = 'Foto de Boss DS-1 2') from public.listing_photos where listing_id = listing.id), 'alt text');
  perform pg_temp.check(public.listing_is_public(listing.id), 'published row is public');
  perform pg_temp.check(pg_temp.alerted(listing.id) = 1, 'first in-stock publication is recorded for saved searches once');

  perform pg_temp.check(pg_temp.outcome(result, 3)->>'outcome' = 'published' and (pg_temp.published(sid, 3)).stock_state = 'out_of_stock'
    and (pg_temp.published(sid, 3)).status = 'approved', 'zero stock: approved as Agotado');
  perform pg_temp.check(pg_temp.alerted((pg_temp.published(sid, 3)).id) = 0, 'an out-of-stock publication sends no alert');

  perform pg_temp.check(pg_temp.outcome(result, 4)->>'outcome' = 'failed'
    and pg_temp.outcome(result, 4)->>'message' = 'El SKU necesita de 2 a 10 fotos listas.', 'one photo is not enough');
  perform pg_temp.check(pg_temp.outcome(result, 5)->>'outcome' = 'failed'
    and pg_temp.outcome(result, 5)->>'message' = 'El SKU no tiene precio.', 'no price, no publication');
  perform pg_temp.check(pg_temp.outcome(result, 6)->>'outcome' = 'failed'
    and pg_temp.outcome(result, 6)->>'message' = 'Faltan datos para publicar.', 'missing brand: requirements refuse it');
  perform pg_temp.check(pg_temp.outcome(result, 99)->>'outcome' = 'not_found', 'unknown row reported');
  perform pg_temp.check((pg_temp.row_of(sid, 6)).publish_status = 'failed' and (pg_temp.row_of(sid, 6)).published_listing_id is null
    and not exists (select 1 from public.listings where title = 'Incompleto'), 'a failed row leaves no listing behind');
  perform pg_temp.check((select i.listing_id from public.store_inventory_items i where i.id = (pg_temp.row_of(sid, 6)).applied_item_id) is null,
    'a failed row leaves its SKU unlinked');
  perform pg_temp.check(result->'publish_counts' = '{"published":2,"failed":3,"no_quota":0}', 'counts: ' || (result->'publish_counts')::text);
  perform pg_temp.check((result #>> '{quota,used}')::integer = 2, 'quota follows the publications');

  -- Retrying a published row changes nothing.
  result := public.publish_store_import_rows(pg_temp.id('owner_a'), sid, pg_temp.publish_args(array[2], 'Otro título'), true);
  perform pg_temp.check(pg_temp.outcome(result, 2)->>'outcome' = 'already_published'
    and (pg_temp.outcome(result, 2)->>'listing_id')::uuid = (pg_temp.published(sid, 2)).id, 'retry returns the first publication');
  perform pg_temp.check((select count(*) from public.listings where store_id = pg_temp.id('store_a')) = 2, 'no second listing');

  -- A failed row can be fixed and sent again.
  result := public.publish_store_import_rows(pg_temp.id('owner_a'), sid, pg_temp.publish_args(array[6], 'Completo'), true);
  perform pg_temp.check(pg_temp.outcome(result, 6)->>'outcome' = 'published' and (pg_temp.row_of(sid, 6)).publish_message is null,
    'fixed row publishes');
end $$;

-- A photo already used by a publication cannot be used by a second one.
reset role;
set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ declare sid uuid := pg_temp.id('sa'); begin
  perform public.place_store_import_photo(sid, pg_temp.asset_id(sid, 'PUB-1__01.jpg'), 7);
  perform pg_temp.check((pg_temp.row_of(sid, 7)).photo_count = 3, 'the published photo moved to another row in the import');
  -- The published listing keeps its photos whatever happens in the import.
  perform pg_temp.check((select count(*) from public.listing_photos where listing_id = (pg_temp.published(sid, 2)).id) = 2,
    'moving a photo in the import does not change the listing');
end $$;

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare sid uuid := pg_temp.id('sa'); result jsonb; begin
  result := public.publish_store_import_rows(pg_temp.id('owner_a'), sid, pg_temp.publish_args(array[7]), true);
  perform pg_temp.check(pg_temp.outcome(result, 7)->>'outcome' = 'failed'
    and pg_temp.outcome(result, 7)->>'message' like 'Una de las fotos ya se usa en otra publicación%', 'a used photo is refused');
end $$;

reset role;
set local role authenticated;
select pg_temp.as_user('owner_a');
select public.place_store_import_photo(pg_temp.id('sa'), pg_temp.asset_id(pg_temp.id('sa'), 'PUB-1__01.jpg'), null);

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare sid uuid := pg_temp.id('sa'); result jsonb; begin
  result := public.publish_store_import_rows(pg_temp.id('owner_a'), sid, pg_temp.publish_args(array[7]), true);
  perform pg_temp.check(pg_temp.outcome(result, 7)->>'outcome' = 'published', 'with its own photos the row publishes');
  perform pg_temp.check((select count(*) from public.store_inventory_items where store_id = pg_temp.id('store_a') and listing_id is not null) = 4,
    'four SKU linked');
end $$;

reset role;
do $$ declare sid uuid := pg_temp.id('sa'); begin
  -- The publication's import photos stay when the import is purged; the photo set aside is discarded.
  update public.store_import_sessions set closed_at = now() - interval '31 days' where id = sid;
  perform laria_private.run_store_import_retention();
  perform pg_temp.check((select count(*) from public.store_import_photo_assets where session_id = sid and status = 'validated') = 8,
    'photos used by the four listings survive the purge');
  perform pg_temp.check((select status from public.store_import_photo_assets where id = pg_temp.asset_id(sid, 'PUB-1__01.jpg')) = 'validated',
    'a published photo is kept even when the import no longer assigns it');
  perform pg_temp.check((select status from public.store_import_photo_assets where id = pg_temp.asset_id(sid, 'PUB-3__01.jpg')) = 'discarded',
    'an unpublished photo goes with the purge');
end $$;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare sid uuid := pg_temp.id('sa'); begin
  perform pg_temp.expect_error(format('select public.publish_store_import_rows(%L, %L, %L, true)',
    pg_temp.id('owner_a'), sid, pg_temp.publish_args(array[4])), 'IMPORT_PUBLISH_CLOSED');
end $$;

-- ------------------------------------------------------------------ normal Tienda (B): review and allowance

reset role;
set local role authenticated;
select pg_temp.as_admin();
select public.admin_set_store_listing_allowance(pg_temp.id('store_b'), 3, 'Piloto con un lugar libre');

select pg_temp.as_user('owner_b');
do $$ declare sid uuid; begin
  sid := pg_temp.ready_session('tienda-b.csv', '[
    {"row_number":2,"parsed":{"sku":"B-1","product_name":"Bajo uno","quantity":1,"unit_price_pen":900}},
    {"row_number":3,"parsed":{"sku":"B-2","product_name":"Bajo dos","quantity":1,"unit_price_pen":950}}]');
  perform pg_temp.remember('sb', sid);
  perform pg_temp.upload(sid, pg_temp.id('owner_b'), array['B-1__01.jpg','B-1__02.jpg','B-2__01.jpg','B-2__02.jpg']);
end $$;
select set_config('qa.checks', pg_temp.checks_for(pg_temp.id('sb'))::text, true);
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.record_store_import_photo_checks(pg_temp.id('owner_b'), pg_temp.id('sb'), current_setting('qa.checks')::jsonb);
reset role;
set local role authenticated;
select pg_temp.as_user('owner_b');
select pg_temp.commit_all(pg_temp.id('sb'));

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare sid uuid := pg_temp.id('sb'); result jsonb; begin
  -- Another owner's import photos are never accepted for this store.
  perform pg_temp.expect_error(format('select public.publish_store_import_rows(%L, %L, %L, true)',
    pg_temp.id('owner_a'), sid, pg_temp.publish_args(array[2])), 'IMPORT_SESSION_NOT_FOUND');

  result := public.publish_store_import_rows(pg_temp.id('owner_b'), sid, pg_temp.publish_args(array[2, 3]), true);
  perform pg_temp.check(pg_temp.outcome(result, 2)->>'outcome' = 'published' and pg_temp.outcome(result, 2)->>'listing_status' = 'pending',
    'normal Tienda: the row enters review');
  perform pg_temp.check(not public.listing_is_public((pg_temp.published(sid, 2)).id), 'a row in review is not public');
  perform pg_temp.check(pg_temp.outcome(result, 3)->>'outcome' = 'no_quota'
    and pg_temp.outcome(result, 3)->>'message' = 'Sin cupo de publicaciones.', 'the row past the allowance stays unpublished');
  perform pg_temp.check((pg_temp.row_of(sid, 3)).publish_status = 'no_quota', 'no-quota state recorded');
  perform pg_temp.check((result #>> '{quota,remaining}')::integer = 0, 'no allowance left');
end $$;

reset role;
set local role authenticated;
select pg_temp.as_admin();
select public.admin_set_store_listing_allowance(pg_temp.id('store_b'), 4, 'Un lugar más');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare result jsonb; begin
  result := public.publish_store_import_rows(pg_temp.id('owner_b'), pg_temp.id('sb'), pg_temp.publish_args(array[3]), true);
  perform pg_temp.check(pg_temp.outcome(result, 3)->>'outcome' = 'published', 'after a higher allowance the row publishes');
end $$;

-- ------------------------------------------------------------------ pending store (C)

reset role;
set local role authenticated;
select pg_temp.as_user('owner_c');
do $$ declare sid uuid; begin
  sid := pg_temp.ready_session('tienda-c.csv', '[{"row_number":2,"parsed":{"sku":"C-1","product_name":"Teclado","quantity":1,"unit_price_pen":1200}}]');
  perform pg_temp.remember('sc', sid);
  perform pg_temp.upload(sid, pg_temp.id('owner_c'), array['C-1__01.jpg','C-1__02.jpg']);
end $$;
select set_config('qa.checks', pg_temp.checks_for(pg_temp.id('sc'))::text, true);
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.record_store_import_photo_checks(pg_temp.id('owner_c'), pg_temp.id('sc'), current_setting('qa.checks')::jsonb);
reset role;
set local role authenticated;
select pg_temp.as_user('owner_c');
select pg_temp.commit_all(pg_temp.id('sc'));
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare sid uuid := pg_temp.id('sc'); result jsonb; begin
  result := public.publish_store_import_rows(pg_temp.id('owner_c'), sid, pg_temp.publish_args(array[2]), true);
  perform pg_temp.check(pg_temp.outcome(result, 2)->>'listing_status' = 'pending'
    and not public.listing_is_public((pg_temp.published(sid, 2)).id), 'pending store: the row stays in review and private');
end $$;

-- A store hidden after its import cannot publish from it.
reset role;
select set_config('app.allow_store_admin_fields', 'true', true);
update public.stores set status = 'hidden' where id = pg_temp.id('store_c');
select set_config('app.allow_store_admin_fields', '', true);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ begin
  perform pg_temp.expect_error(format('select public.publish_store_import_rows(%L, %L, %L, true)',
    pg_temp.id('owner_c'), pg_temp.id('sc'), pg_temp.publish_args(array[2])), 'INVENTORY_STORE_READ_ONLY');
end $$;

-- ------------------------------------------------------------------ the publish form path is unchanged

reset role;
do $$ declare fields jsonb; photos jsonb; form_id uuid := gen_random_uuid(); begin
  fields := jsonb_build_object('slug', 'so3b-form', 'title', 'Pedal del formulario', 'category', 'pedals', 'instrument_type', 'pedals',
    'brand', 'QA', 'model', 'Form', 'condition', 'Nuevo', 'price_pen', '320',
    'description', 'Descripción de inventario válida con más de cuarenta caracteres.',
    'store_id', pg_temp.id('store_a'), 'owner_user_id', pg_temp.id('owner_a'), 'marketplace_rules_accepted', true);
  photos := '[{"image_url":"https://example.invalid/so3b-form-0.jpg"},{"image_url":"https://example.invalid/so3b-form-1.jpg"}]';
  perform pg_temp.expect_error(format('select public.complete_public_submission(%L, %L, %L, %L)', form_id, 'store_listing',
    fields, '[{"image_url":"https://example.invalid/one.jpg"}]'), 'A listing requires 2 to 10 photos.');
  perform pg_temp.expect_error(format('select public.complete_public_submission(%L, %L, %L, %L)', form_id, 'store_listing',
    fields || '{"marketplace_rules_accepted":false}', photos), 'Marketplace rules acceptance is required.');
  perform pg_temp.expect_error(format('select public.complete_public_submission(%L, %L, %L, %L)', form_id, 'store_listing',
    fields || jsonb_build_object('owner_user_id', pg_temp.id('owner_b')), photos), 'An eligible owner-bound store is required.');
  perform pg_temp.check(public.complete_public_submission(form_id, 'store_listing', fields, photos) = form_id, 'form publish returns the id');
  perform pg_temp.check(public.complete_public_submission(form_id, 'store_listing', fields, photos) = form_id, 'form retry is idempotent');
  perform pg_temp.check((pg_temp.listing(form_id)).status = 'approved' and (pg_temp.listing(form_id)).stock_state is null
    and (select count(*) from public.listing_photos where listing_id = form_id) = 2, 'form listing approved, unlinked, two photos');
  perform pg_temp.check((pg_temp.listing(form_id)).contact_name = 'Contacto A', 'form listing copies the store contact');
end $$;

rollback;
