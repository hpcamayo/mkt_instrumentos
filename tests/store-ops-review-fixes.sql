-- Review fixes, A section (docs/store-operations/review-fixes.md): the lock-order invariants (A3, A4) as static and
-- sequential checks, one listing per import photo (A6), no alert e-mails after a stock-out (A7), first-public matching
-- after an import's price (A8), the mapping once rows are applied (A11), duplicates among rows with errors (n-dup) and
-- cleanup of import photos a listing stopped using (A13). Local/test database only. Every fixture is rolled back. The
-- races themselves are in tests/store-ops-concurrency.integration.cjs.
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
    '{"sub":"e9100000-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}', true);
end $$;

create function pg_temp.session(p_id uuid) returns public.store_import_sessions language sql security definer as $$
  select * from public.store_import_sessions where id = p_id
$$;
create function pg_temp.row_of(p_session uuid, p_row integer) returns public.store_import_rows language sql security definer as $$
  select * from public.store_import_rows where session_id = p_session and row_number = p_row
$$;
create function pg_temp.item_of(p_listing uuid) returns public.store_inventory_items language sql security definer as $$
  select * from public.store_inventory_items where listing_id = p_listing
$$;
create function pg_temp.alert_of(p_user uuid) returns uuid language sql security definer as $$
  select id from public.saved_search_alerts where user_id = p_user and deleted_at is null order by created_at desc limit 1
$$;
create function pg_temp.published(p_listing uuid) returns boolean language sql security definer as $$
  select exists (select 1 from laria_private.listing_alert_publications where listing_id = p_listing)
$$;
create function pg_temp.price_drops(p_listing uuid) returns bigint language sql security definer as $$
  select count(*) from public.listing_price_drops where listing_id = p_listing
$$;
create function pg_temp.matched(p_alert uuid, p_listing uuid) returns boolean language sql security definer as $$
  select exists (select 1 from laria_private.search_alert_matches where alert_id = p_alert and listing_id = p_listing)
$$;
-- Same steps as tests/store-ops-2.sql: stage, map, plan, commit.
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
  select array_agg(row_number order by row_number) into rows from public.store_import_rows
  where session_id = p_session and commit_status = 'pending';
  perform public.commit_store_import_chunk(p_session, token, rows);
  return public.finish_store_import_commit(p_session, token);
end $$;
-- A closed import of store A with one validated photo and its storage object; returns the URL a listing would store.
create function pg_temp.import_photo(p_name text, p_purged boolean) returns text language plpgsql security definer as $$
declare sid uuid := gen_random_uuid(); asset uuid := gen_random_uuid(); owner uuid := pg_temp.id('owner_a'); path text;
begin
  insert into public.store_import_sessions (id, store_id, created_by, status, file_format, file_name, file_path, file_bytes,
    closed_at, rows_purged_at)
  values (sid, pg_temp.id('store_a'), owner, 'committed', 'csv', 'fotos.csv', owner || '/' || sid || '/source.csv', 10,
    now() - interval '40 days', case when p_purged then now() end);
  path := owner || '/' || sid || '/' || asset || '.jpg';
  insert into public.store_import_photo_assets (id, session_id, store_id, created_by, original_name, file_ext, object_path,
    declared_bytes, claim_source, status, validated_at, mime_type, bytes, width, height, sha256)
  values (asset, sid, pg_temp.id('store_a'), owner, p_name, 'jpg', path, 1000, 'filename', 'validated', now(), 'image/jpeg',
    1000, 800, 800, repeat('b', 64));
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('store-import-photos', path, owner::text, '{"size":1000,"mimetype":"image/jpeg"}');
  perform pg_temp.remember('asset_' || regexp_replace(lower(p_name), '[^a-z0-9]', '', 'g'), asset);
  return '/api/listing-images/' || owner || '/import-photos/' || sid || '/' || asset || '.jpg';
end $$;

select pg_temp.remember('owner_a', 'e9100000-0000-4000-8000-000000000001'),
       pg_temp.remember('owner_b', 'e9100000-0000-4000-8000-000000000002'),
       pg_temp.remember('buyer', 'e9100000-0000-4000-8000-000000000004'),
       pg_temp.remember('digest_both', 'e9100000-0000-4000-8000-000000000005'),
       pg_temp.remember('digest_one', 'e9100000-0000-4000-8000-000000000006'),
       pg_temp.remember('max700', 'e9100000-0000-4000-8000-000000000007'),
       pg_temp.remember('min700', 'e9100000-0000-4000-8000-000000000008'),
       pg_temp.remember('store_a', 'e9200000-0000-4000-8000-000000000001'),
       pg_temp.remember('store_b', 'e9200000-0000-4000-8000-000000000002'),
       pg_temp.remember('la1', 'e9300000-0000-4000-8000-000000000001'),
       pg_temp.remember('la2', 'e9300000-0000-4000-8000-000000000002'),
       pg_temp.remember('lb1', 'e9300000-0000-4000-8000-000000000003'),
       pg_temp.remember('lp1', 'e9300000-0000-4000-8000-000000000011'),
       pg_temp.remember('lp2', 'e9300000-0000-4000-8000-000000000012'),
       pg_temp.remember('lp3', 'e9300000-0000-4000-8000-000000000013');

-- ------------------------------------------------------------------ fixtures

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select ('e9100000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'rf-' || n || '@example.invalid', now(), '{}',
  jsonb_build_object('account_type', case when n in ('01', '02') then 'store_owner' else 'seller' end,
    'full_name', 'Revisión ' || n, 'phone', '519999940' || n, 'city', 'Lima', 'region', 'Lima')
from unnest(array['01', '02', '04', '05', '06', '07', '08']) n;

-- A: active Tienda verificada. B: active, not verified (its edits become revisions).
insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('e9200000-0000-4000-8000-000000000001','rf-tienda-a','Tienda RF A','Tienda RF A SAC','20999994001','rf-a@example.invalid','Contacto A','Contacto A','51999994001','Lima','Lima','Av. QA 1','e9100000-0000-4000-8000-000000000001','active','free',true),
 ('e9200000-0000-4000-8000-000000000002','rf-tienda-b','Tienda RF B','Tienda RF B SAC','20999994002','rf-b@example.invalid','Contacto B','Contacto B','51999994002','Lima','Lima','Av. QA 2','e9100000-0000-4000-8000-000000000002','active','free',false);

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at) values
 ('e9300000-0000-4000-8000-000000000001','rf-la1','Guitarra RF uno','store','approved','guitars','electric_guitar','QA','Uno','Nuevo',1000,'Lima','Lima','Contacto A','51999994001','Descripción de publicación válida con más de cuarenta caracteres.','e9100000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000001','self_service',now()),
 ('e9300000-0000-4000-8000-000000000002','rf-la2','Guitarra RF dos','store','approved','guitars','electric_guitar','QA','Dos','Nuevo',1200,'Lima','Lima','Contacto A','51999994001','Descripción de publicación válida con más de cuarenta caracteres.','e9100000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000001','self_service',now()),
 ('e9300000-0000-4000-8000-000000000003','rf-lb1','Guitarra RF tienda B','store','approved','guitars','electric_guitar','QA','Tres','Nuevo',500,'Lima','Lima','Contacto B','51999994002','Descripción de publicación válida con más de cuarenta caracteres.','e9100000-0000-4000-8000-000000000002','e9200000-0000-4000-8000-000000000002','self_service',now());
insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/' || l.slug || '-' || n || '.jpg', n
from public.listings l cross join generate_series(0, 1) n where l.slug like 'rf-%';

set local role authenticated;
select pg_temp.as_admin();
select public.admin_set_store_inventory_enabled(pg_temp.id('store_a'), true, 'Revisión de correcciones');

-- ------------------------------------------------------------------ A3 and A4: lock order, statically

reset role;
do $$ declare offenders text; begin
  select string_agg(n.nspname || '.' || p.proname, ', ') into offenders
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'laria_private') and p.prosrc ~* 'from\s+(public\.)?stores\s[^;]*\mfor\s+update';
  -- FOR UPDATE on a store row blocks the KEY SHARE every ledger, audit and receipt insert takes on it (review fix A3).
  perform pg_temp.check(offenders is null, 'these functions still lock a store row FOR UPDATE: ' || coalesce(offenders, ''));
  perform pg_temp.check((select prosrc ~ 'staged\.applied_item_id for update' from pg_proc
    where oid = 'public.publish_store_import_rows(uuid,uuid,jsonb,boolean)'::regprocedure), 'publication reads the price without locking the SKU');
  perform pg_temp.check((select position('lock_inventory_item(' in prosrc) = 0 from pg_proc
    where oid = 'public.link_inventory_listing(uuid,uuid,integer,integer)'::regprocedure), 'linking still locks the SKU''s current listing');
end $$;

set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ declare result jsonb; begin
  result := public.create_inventory_item(jsonb_build_object('merchant_sku', 'RF-LA1', 'product_name', 'Guitarra RF uno',
    'listing_id', pg_temp.id('la1')), 1, 'qa-rf-la1');
  result := public.create_inventory_item('{"merchant_sku":"RF-FREE","product_name":"Libre","unit_price_pen":1200}', 0, 'qa-rf-free');
  -- A linked SKU cannot be linked again, and a linked listing takes no second SKU.
  perform pg_temp.expect_error(format('select public.link_inventory_listing(%L, %L, 1, null)', (pg_temp.item_of(pg_temp.id('la1'))).id,
    pg_temp.id('la2')), 'INVENTORY_ITEM_ALREADY_LINKED');
  perform pg_temp.expect_error(format('select public.link_inventory_listing(%L, %L, %s, null)', (result->'item'->>'id'),
    pg_temp.id('la1'), (result->'item'->>'version')), 'INVENTORY_LISTING_ALREADY_LINKED');
end $$;

-- ------------------------------------------------------------------ A6: one listing per import photo

reset role;
select set_config('qa.photo_a', pg_temp.import_photo('RF-A__01.jpg', false), true);
do $$ begin
  insert into public.listing_photos (listing_id, image_url, sort_order) values (pg_temp.id('la1'), current_setting('qa.photo_a'), 5);
  -- The same photo on another listing, directly or as a proposed edit, is refused.
  perform pg_temp.expect_error(format('insert into public.listing_photos (listing_id, image_url, sort_order) values (%L, %L, 5)',
    pg_temp.id('la2'), current_setting('qa.photo_a')), 'LISTING_PHOTO_INVALID');
  -- The same listing may use it again (a verified store's direct edit replaces its photos with the same URLs).
  delete from public.listing_photos where listing_id = pg_temp.id('la1') and image_url = current_setting('qa.photo_a');
  insert into public.listing_photos (listing_id, image_url, sort_order) values (pg_temp.id('la1'), current_setting('qa.photo_a'), 5);
end $$;
set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ begin
  perform public.update_owned_listing(pg_temp.id('la1'), '{}', '{}', jsonb_build_array(
    jsonb_build_object('image_url', 'https://example.invalid/rf-la1-0.jpg'), jsonb_build_object('image_url', current_setting('qa.photo_a'))),
    gen_random_uuid());
  perform pg_temp.check((select count(*) from public.listing_photos where image_url = current_setting('qa.photo_a') and listing_id = pg_temp.id('la1')) = 1,
    'a direct edit of the same listing kept its import photo');
end $$;

-- ------------------------------------------------------------------ A7: no alert e-mails after a stock-out

-- Pedal alerts: immediate for the buyer, daily digests for two others (one follows only Boss).
select pg_temp.as_user('buyer');
select public.create_saved_search_alert('{"category":"pedals"}', 'immediate');
select pg_temp.as_user('digest_both');
select public.create_saved_search_alert('{"category":"pedals"}', 'daily');
select pg_temp.as_user('digest_one');
select public.create_saved_search_alert('{"category":"pedals","brand":"Boss"}', 'daily');
reset role;
insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at) values
 ('e9300000-0000-4000-8000-000000000011','rf-lp1','Pedal RF Boss','store','approved','pedals','pedals','Boss','DS-1','Nuevo',1000,'Lima','Lima','Contacto A','51999994001','Descripción de publicación válida con más de cuarenta caracteres.','e9100000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000001','self_service',now()),
 ('e9300000-0000-4000-8000-000000000012','rf-lp2','Pedal RF MXR','store','approved','pedals','pedals','MXR','Phase 90','Nuevo',800,'Lima','Lima','Contacto A','51999994001','Descripción de publicación válida con más de cuarenta caracteres.','e9100000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000001','self_service',now());
insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/' || l.slug || '-' || n || '.jpg', n
from public.listings l cross join generate_series(0, 1) n where l.slug in ('rf-lp1', 'rf-lp2');
insert into public.favorites (user_id, listing_id) values (pg_temp.id('buyer'), pg_temp.id('lp1'));

set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ begin
  perform public.create_inventory_item(jsonb_build_object('merchant_sku', 'RF-LP1', 'product_name', 'Pedal Boss',
    'listing_id', pg_temp.id('lp1')), 1, 'qa-rf-lp1');
  perform public.create_inventory_item(jsonb_build_object('merchant_sku', 'RF-LP2', 'product_name', 'Pedal MXR',
    'listing_id', pg_temp.id('lp2')), 3, 'qa-rf-lp2');
  -- A price drop while in stock queues an e-mail for the buyer who saved it.
  perform public.set_inventory_price_bulk(array[(pg_temp.item_of(pg_temp.id('lp1'))).id], 'set', 900, 'qa-rf-drop');
end $$;

-- Yesterday's digests are prepared with what matched then.
reset role;
update laria_private.search_alert_matches set matched_local_date = (now() at time zone 'America/Lima')::date - 1
where listing_id in (pg_temp.id('lp1'), pg_temp.id('lp2'));
select laria_private.prepare_daily_search_alert_emails((now() at time zone 'America/Lima')::date - 1, 100);
do $$ begin
  perform pg_temp.check((select count(*) from laria_private.marketplace_email_deliveries
    where listing_id = pg_temp.id('lp1') and event_type in ('listing_price_drop', 'search_alert_immediate') and status = 'pending') = 2,
    'fixture: a price-drop and a search e-mail are queued for the Boss pedal');
  perform pg_temp.check((select count(*) from laria_private.marketplace_email_deliveries
    where event_type = 'search_alert_daily' and recipient_user_id in (pg_temp.id('digest_both'), pg_temp.id('digest_one'))) = 2,
    'fixture: both digests are queued');
end $$;

-- The Boss pedal sells its last unit before the worker runs.
set local role authenticated;
select pg_temp.as_user('owner_a');
select public.record_stock_movement((pg_temp.item_of(pg_temp.id('lp1'))).id, 'sale', 1, 'tienda_fisica', null, null, null, 'qa-rf-sale');

reset role;
-- Only this test's e-mails are due now.
update laria_private.marketplace_email_deliveries set next_attempt_at = now() + interval '1 day'
where status in ('pending', 'retry') and recipient_user_id not in
  (pg_temp.id('buyer'), pg_temp.id('digest_both'), pg_temp.id('digest_one'), pg_temp.id('max700'), pg_temp.id('min700'));
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare claimed jsonb; digest jsonb; begin
  claimed := public.claim_marketplace_email_deliveries(gen_random_uuid(), 100);
  perform pg_temp.check(not exists (select 1 from jsonb_array_elements(claimed) e where e->'listing'->>'slug' = 'rf-lp1'),
    'an e-mail about the sold-out pedal was sent: ' || claimed::text);
  perform pg_temp.check(exists (select 1 from jsonb_array_elements(claimed) e
    where e->>'event_type' = 'search_alert_immediate' and e->'listing'->>'slug' = 'rf-lp2'), 'the in-stock pedal''s alert went out');
  select e into digest from jsonb_array_elements(claimed) e
  where e->>'event_type' = 'search_alert_daily' and e->>'recipient_email' = 'rf-05@example.invalid';
  perform pg_temp.check(digest is not null and digest #> '{search_alert,matches}' = jsonb_build_array(
    jsonb_build_object('title', 'Pedal RF MXR', 'slug', 'rf-lp2', 'price_pen', 800,
      'image_url', (select image_url from public.listing_photos p join public.listings l on l.id = p.listing_id where l.slug = 'rf-lp2' order by p.sort_order limit 1))), 'the digest lists only the pedal in stock: ' || coalesce(digest::text, 'none'));
  perform pg_temp.check(not exists (select 1 from jsonb_array_elements(claimed) e where e->>'recipient_email' = 'rf-06@example.invalid'),
    'a digest with nothing in stock was sent');
end $$;
reset role;
do $$ begin
  perform pg_temp.check((select count(*) from laria_private.marketplace_email_deliveries
    where status = 'cancelled' and failure_code = 'listing_out_of_stock'
      and (listing_id = pg_temp.id('lp1') or recipient_user_id = pg_temp.id('digest_one'))) = 3,
    'the price-drop, the search e-mail and the empty digest are cancelled, not left to retry');
  perform pg_temp.check((select count(*) from laria_private.search_alert_matches
    where listing_id = pg_temp.id('lp1') and suppression_reason = 'listing_out_of_stock') = 2, 'digest matches are marked as dropped');
end $$;

-- ------------------------------------------------------------------ A8: first-public matching after the import's price

-- A pedal approved while it had never had stock: not public for alerts yet.
insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at) values
 ('e9300000-0000-4000-8000-000000000013','rf-lp3','Pedal RF Electro','store','pending','pedals','pedals','Electro-Harmonix','Big Muff','Nuevo',750,'Lima','Lima','Contacto A','51999994001','Descripción de publicación válida con más de cuarenta caracteres.','e9100000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000001','self_service',now());
insert into public.listing_photos (listing_id, image_url, sort_order)
values (pg_temp.id('lp3'), 'https://example.invalid/rf-lp3-0.jpg', 0), (pg_temp.id('lp3'), 'https://example.invalid/rf-lp3-1.jpg', 1);
set local role authenticated;
select pg_temp.as_user('owner_a');
select public.create_inventory_item(jsonb_build_object('merchant_sku', 'RF-LP3', 'product_name', 'Big Muff',
  'listing_id', pg_temp.id('lp3')), 0, 'qa-rf-lp3');
select pg_temp.as_admin();
select public.review_listing(pg_temp.id('lp3'), 'approve', null);
select pg_temp.as_user('max700');
select public.create_saved_search_alert('{"category":"pedals","max_price":700}', 'immediate');
select pg_temp.as_user('min700');
select public.create_saved_search_alert('{"category":"pedals","min_price":700}', 'immediate');

-- One import row gives it its first stock and a new price of S/ 650.
select pg_temp.as_user('owner_a');
do $$ declare sid uuid; begin
  perform pg_temp.check((select stock_state from public.listings where id = pg_temp.id('lp3')) = 'out_of_stock'
    and not pg_temp.published(pg_temp.id('lp3')),
    'fixture: the pedal was approved without stock and is not first-public yet');
  sid := pg_temp.staged_session('precio.csv', '["SKU","Stock","Precio"]',
    '[{"row_number":2,"raw":[]},{"row_number":3,"raw":[]}]', '{"sku":0,"quantity":1,"unit_price_pen":2}');
  perform pg_temp.plan(sid, '[{"row_number":2,"parsed":{"sku":"RF-LP3","quantity":1,"unit_price_pen":650}},
                              {"row_number":3,"parsed":{"sku":"RF-LP2","quantity":0,"unit_price_pen":700}}]');
  perform pg_temp.commit_all(sid);
  perform pg_temp.check((select price_pen from public.listings where id = pg_temp.id('lp3')) = 650
    and (select stock_state from public.listings where id = pg_temp.id('lp3')) = 'in_stock', 'import applied');
  perform pg_temp.check(pg_temp.matched(pg_temp.alert_of(pg_temp.id('max700')), pg_temp.id('lp3')),
    'an alert for pedals up to S/ 700 missed the pedal now at S/ 650');
  perform pg_temp.check(not pg_temp.matched(pg_temp.alert_of(pg_temp.id('min700')), pg_temp.id('lp3')),
    'an alert for pedals from S/ 700 matched the pedal now at S/ 650');
  -- Stock still lands before price: a row that empties a listing and lowers its price records no price drop.
  perform pg_temp.check((select stock_state from public.listings where id = pg_temp.id('lp2')) = 'out_of_stock'
    and (select price_pen from public.listings where id = pg_temp.id('lp2')) = 700, 'second row applied');
  perform pg_temp.check(pg_temp.price_drops(pg_temp.id('lp2')) = 0,
    'a zero-stock import recorded a price drop');
  perform pg_temp.check(coalesce(current_setting('laria.defer_alert_capture', true), '') = '', 'the deferral did not outlive the row');
end $$;

-- ------------------------------------------------------------------ A11: the mapping is final once rows are applied

do $$ declare sid uuid; begin
  sid := pg_temp.staged_session('parcial.csv', '["SKU","Stock"]', '[{"row_number":2,"raw":[]},{"row_number":3,"raw":[]}]',
    '{"sku":0,"quantity":1}');
  perform pg_temp.plan(sid, '[{"row_number":2,"parsed":{"sku":"RF-N1","product_name":"Nuevo uno","quantity":2}},
                              {"row_number":3,"parsed":{"sku":"RF-N2","product_name":"Nuevo dos","quantity":2}}]');
  -- RF-N2 is created by hand after the preview, so its row is a conflict and the import ends partially committed.
  perform public.create_inventory_item('{"merchant_sku":"RF-N2","product_name":"Nuevo dos a mano"}', 1, 'qa-rf-n2');
  perform pg_temp.commit_all(sid);
  perform pg_temp.check((pg_temp.session(sid)).status = 'partially_committed', 'fixture: partial commit');
  perform public.reopen_store_import(sid, (pg_temp.session(sid)).version);
  perform pg_temp.plan(sid, '[{"row_number":3,"parsed":{"sku":"RF-N2","product_name":"Nuevo dos","quantity":2}}]');
  perform pg_temp.expect_error(format('select public.confirm_store_import_mapping(%L, %L, %s)', sid, '{"sku":0,"quantity":1}',
    (pg_temp.session(sid)).version), 'IMPORT_MAPPING_LOCKED');
  perform pg_temp.check((pg_temp.row_of(sid, 2)).commit_status = 'applied' and (pg_temp.row_of(sid, 2)).applied_at is not null,
    'the applied row is untouched');
  -- The rest of the import still goes through.
  perform pg_temp.commit_all(sid);
  perform pg_temp.check((pg_temp.session(sid)).status = 'committed', 'the reviewed row applied');
end $$;

-- ------------------------------------------------------------------ n-dup: rows with other errors count as duplicates

do $$ declare sid uuid; begin
  sid := pg_temp.staged_session('duplicados.csv', '["SKU","Stock"]',
    '[{"row_number":2,"raw":[]},{"row_number":3,"raw":[]},{"row_number":4,"raw":[]}]', '{"sku":0,"quantity":1}');
  perform pg_temp.plan(sid, '[{"row_number":2,"parsed":{"sku":"RF-DUP","product_name":"Duplicado","quantity":1}},
                              {"row_number":3,"parsed":{"sku":"rf-dup","product_name":"Duplicado","quantity":-1}},
                              {"row_number":4,"parsed":{"sku":"RF-OK","product_name":"Bien","quantity":1}}]');
  perform pg_temp.check((pg_temp.row_of(sid, 2)).planned_action = 'error' and (pg_temp.row_of(sid, 3)).planned_action = 'error',
    'both rows sharing the SKU are errors');
  perform pg_temp.check((pg_temp.row_of(sid, 2)).issues @> '[{"code":"IMPORT_DUPLICATE_SKU"}]'
    and (pg_temp.row_of(sid, 3)).issues @> '[{"code":"IMPORT_DUPLICATE_SKU"}]',
    'the row that already had an error is flagged as a duplicate too');
  -- Confirming still works (the duplicates are not counted again as new ones) and applies only the clean row.
  perform pg_temp.commit_all(sid);
  perform pg_temp.check((pg_temp.row_of(sid, 4)).commit_status = 'applied', 'the clean row applied');
  perform pg_temp.check(not exists (select 1 from public.store_inventory_items where store_id = pg_temp.id('store_a') and sku_normalized = 'RF-DUP'),
    'a duplicated SKU was created');
end $$;

-- ------------------------------------------------------------------ A13: photos a listing stopped using are cleaned up

reset role;
select set_config('qa.photo_kept', pg_temp.import_photo('RF-K__01.jpg', true), true);
select set_config('qa.photo_open', pg_temp.import_photo('RF-O__01.jpg', false), true);
insert into public.listing_photos (listing_id, image_url, sort_order) values (pg_temp.id('la2'), current_setting('qa.photo_kept'), 5);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ begin
  -- In use: kept, and not looked at again for a day.
  perform pg_temp.check(not exists (select 1 from public.claim_store_import_photo_deletions(100, null) c
    where c.path like '%' || pg_temp.id('asset_rfk01jpg') || '%'), 'a photo in use was claimed for deletion');
end $$;
reset role;
do $$ begin
  perform pg_temp.check((select status = 'validated' and reference_checked_at is not null from public.store_import_photo_assets
    where id = pg_temp.id('asset_rfk01jpg')), 'the photo in use was checked and kept');
end $$;
-- The owner replaces that listing's photos; a day later the sweep sees the photo is no longer used.
delete from public.listing_photos where listing_id = pg_temp.id('la2') and image_url = current_setting('qa.photo_kept');
update public.store_import_photo_assets set reference_checked_at = now() - interval '2 days' where id = pg_temp.id('asset_rfk01jpg');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare paths text[]; begin
  select array_agg(c.path) into paths from public.claim_store_import_photo_deletions(100, null) c;
  perform pg_temp.check(exists (select 1 from unnest(paths) p where p like '%' || pg_temp.id('asset_rfk01jpg') || '%'),
    'the photo no listing uses any more was not claimed for deletion');
  perform pg_temp.check(not exists (select 1 from unnest(paths) p where p like '%' || pg_temp.id('asset_rfo01jpg') || '%'),
    'a photo of an import that is still open was swept');
end $$;
reset role;
do $$ begin
  perform pg_temp.check((select status from public.store_import_photo_assets where id = pg_temp.id('asset_rfk01jpg')) = 'discarded',
    'the detached photo is discarded');
  -- Once discarded it cannot be attached again.
  perform pg_temp.expect_error(format('insert into public.listing_photos (listing_id, image_url, sort_order) values (%L, %L, 6)',
    pg_temp.id('la2'), current_setting('qa.photo_kept')), 'LISTING_PHOTO_INVALID');
end $$;

rollback;
