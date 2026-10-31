-- Store Operations review fixes, store screens (docs/store-operations/review-fixes.md, section B): the publication hint
-- on linked SKUs (B7), the SKU's own category, its counts and the Inventario category filter (B4), and the owner's
-- "Completar datos" values on an import row (B5). Local/test database only. Every fixture is rolled back.
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
create function pg_temp.item(p_sku text) returns public.store_inventory_items language sql security definer as $$
  select * from public.store_inventory_items where merchant_sku = p_sku
$$;
create function pg_temp.hinted(p_session uuid, p_row integer) returns boolean language sql security definer as $$
  select issues @> '[{"code":"IMPORT_PUBLICATION_MISSING"}]' from public.store_import_rows where session_id = p_session and row_number = p_row
$$;
create function pg_temp.skus(p_page jsonb) returns text[] language sql as $$
  select coalesce(array_agg(value->>'merchant_sku' order by value->>'merchant_sku'), '{}') from jsonb_array_elements(p_page->'items')
$$;

-- Plays an import to `ready`: create, stage, map, plan. p_rows: [{row_number, parsed, issues?}].
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
  perform public.finish_store_import_parse(sid, token, jsonb_build_object('headers', '["SKU","Nombre","Stock","Categoría","ID de publicación"]'::jsonb,
    'header_row', 1, 'row_count', jsonb_array_length(p_rows), 'sheet_name', null));
  perform public.release_store_import_step(sid, token);
  perform public.confirm_store_import_mapping(sid, '{"sku":0,"product_name":1,"quantity":2,"category":3,"listing_id":4}', (pg_temp.session(sid)).version);
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
create function pg_temp.hint(p_text text) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('code', 'IMPORT_PUBLICATION_MISSING', 'severity', 'info', 'message', 'Para publicar falta: ' || p_text || '.'))
$$;

select pg_temp.remember('owner_a', 'e5500000-0000-4000-8000-000000000001'),
       pg_temp.remember('owner_b', 'e5500000-0000-4000-8000-000000000002'),
       pg_temp.remember('particular', 'e5500000-0000-4000-8000-000000000003'),
       pg_temp.remember('store_a', 'e6500000-0000-4000-8000-000000000001'),
       pg_temp.remember('store_b', 'e6500000-0000-4000-8000-000000000002'),
       pg_temp.remember('l1', 'e7500000-0000-4000-8000-000000000001'),
       pg_temp.remember('l2', 'e7500000-0000-4000-8000-000000000002');

-- ------------------------------------------------------------------ fixtures

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e5500000-0000-4000-8000-000000000001','authenticated','authenticated','soux-owner-a@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Tienda A","phone":"51999994001","city":"Lima","region":"Lima"}'),
 ('e5500000-0000-4000-8000-000000000002','authenticated','authenticated','soux-owner-b@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Tienda B","phone":"51999994002","city":"Lima","region":"Lima"}'),
 ('e5500000-0000-4000-8000-000000000003','authenticated','authenticated','soux-particular@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Particular UX","phone":"51999994003","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('e6500000-0000-4000-8000-000000000001','soux-tienda-a','Tienda UX A','Tienda UX A SAC','20999995501','soux-a@example.invalid','Contacto A','Contacto A','51999994001','Lima','Lima','Av. QA 1','e5500000-0000-4000-8000-000000000001','active','free',true),
 ('e6500000-0000-4000-8000-000000000002','soux-tienda-b','Tienda UX B','Tienda UX B SAC','20999995502','soux-b@example.invalid','Contacto B','Contacto B','51999994002','Lima','Lima','Av. QA 2','e5500000-0000-4000-8000-000000000002','active','free',true);

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at) values
 ('e7500000-0000-4000-8000-000000000001','soux-l1','Pedal UX uno','store','approved','pedals','pedals','QA','Uno','Nuevo',300,'Lima','Lima','Contacto A','51999994001','Descripción de inventario válida con más de cuarenta caracteres.','e5500000-0000-4000-8000-000000000001','e6500000-0000-4000-8000-000000000001','self_service',now()),
 ('e7500000-0000-4000-8000-000000000002','soux-l2','Bajo UX dos','store','approved','basses','bass','QA','Dos','Nuevo',900,'Lima','Lima','Contacto A','51999994001','Descripción de inventario válida con más de cuarenta caracteres.','e5500000-0000-4000-8000-000000000001','e6500000-0000-4000-8000-000000000001','self_service',now());

insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/soux-' || l.slug || '-' || n || '.jpg', n
from public.listings l cross join generate_series(0, 1) n
where l.slug like 'soux-%';

set local role authenticated;
select pg_temp.as_admin();
select public.admin_set_store_inventory_enabled(pg_temp.id('store_a'), true, 'Piloto revisión B');
select public.admin_set_store_inventory_enabled(pg_temp.id('store_b'), true, 'Piloto revisión B');

-- ------------------------------------------------------------------ browser role boundaries

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform pg_temp.expect_error('select public.get_inventory_category_counts()', 'permission denied');
  perform pg_temp.expect_error($q$select public.set_store_import_row_publish_fields(gen_random_uuid(), 2, '{"brand":"X"}')$q$, 'permission denied');
end $$;
reset role;
set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ begin
  perform pg_temp.expect_error('select laria_private.import_row_record_item_category()', 'permission denied');
  perform pg_temp.expect_error('select laria_private.import_row_drop_linked_publication_hint()', 'permission denied');
  perform pg_temp.check(public.get_inventory_category_counts() = '{}'::jsonb, 'a store without SKUs has no categories');
end $$;
select pg_temp.as_user('particular');
do $$ begin
  perform pg_temp.expect_error('select public.get_inventory_category_counts()', 'INVENTORY_STORE_REQUIRED');
end $$;

-- ------------------------------------------------------------------ B7 and B4: the first import

select pg_temp.as_user('owner_a');
-- A manual SKU already linked to L1 (pedals). L2 (basses) has no SKU yet.
select public.create_inventory_item(('{"merchant_sku":"LINK-1","product_name":"Pedal uno","listing_id":"' || pg_temp.id('l1') || '"}')::jsonb, 2, 'qa-soux-manual-1');

do $$ declare sid uuid; result jsonb; begin
  sid := pg_temp.ready_session('primera.csv', jsonb_build_array(
    jsonb_build_object('row_number', 2, 'parsed', '{"sku":"NEW-1","product_name":"Guitarra nueva","quantity":3,"category":"guitars"}'::jsonb, 'issues', pg_temp.hint('precio')),
    jsonb_build_object('row_number', 3, 'parsed', '{"sku":"NEW-2","product_name":"Sin categoría","quantity":1}'::jsonb, 'issues', pg_temp.hint('categoría')),
    jsonb_build_object('row_number', 4, 'parsed', '{"sku":"LINK-1","quantity":5}'::jsonb, 'issues', pg_temp.hint('marca')),
    jsonb_build_object('row_number', 5, 'parsed', ('{"sku":"ADOPT-2","quantity":2,"listing_id":"' || pg_temp.id('l2') || '"}')::jsonb, 'issues', pg_temp.hint('marca')),
    jsonb_build_object('row_number', 6, 'parsed', '{"sku":"NEW-3","product_name":"Pedal nuevo","quantity":4,"category":"pedals"}'::jsonb,
      'issues', jsonb_build_array(jsonb_build_object('code', 'IMPORT_PRICE_ROUNDED', 'severity', 'warning', 'message', 'Redondeamos el precio.')) || pg_temp.hint('marca')),
    jsonb_build_object('row_number', 7, 'parsed', '{"sku":"NEW-4","product_name":"Categoría desconocida","quantity":1,"category":"theremins"}'::jsonb)
  ));
  perform pg_temp.remember('first', sid);

  perform pg_temp.check((pg_temp.row_of(sid, 4)).planned_action = 'update' and not pg_temp.hinted(sid, 4),
    'B7: an update of a SKU linked to a publication drops "Para publicar falta"');
  perform pg_temp.check((pg_temp.row_of(sid, 5)).planned_action = 'adopt_listing' and not pg_temp.hinted(sid, 5),
    'B7: a row that links an existing publication drops the hint');
  perform pg_temp.check(pg_temp.hinted(sid, 2) and pg_temp.hinted(sid, 3), 'B7: new SKUs keep the hint');
  perform pg_temp.check((pg_temp.row_of(sid, 6)).issues = jsonb_build_array(jsonb_build_object('code', 'IMPORT_PRICE_ROUNDED', 'severity', 'warning', 'message', 'Redondeamos el precio.')) || pg_temp.hint('marca'),
    'B7: other issues are left exactly as they were');
  perform pg_temp.check(((pg_temp.session(sid)).counts->>'publication_incomplete')::integer = 3,
    'B7: the review count "N SKU necesitan más datos" follows the hints: ' || ((pg_temp.session(sid)).counts->>'publication_incomplete'));

  result := pg_temp.commit_all(sid);
  perform pg_temp.check((pg_temp.session(sid)).status = 'committed', 'the first import is applied: ' || result::text);
  perform pg_temp.check((pg_temp.item('NEW-1')).category = 'guitars' and (pg_temp.item('NEW-3')).category = 'pedals',
    'B4: an applied row gives its SKU the file''s category');
  perform pg_temp.check((pg_temp.item('NEW-2')).category is null, 'B4: no category in the file, none on the SKU');
  perform pg_temp.check((pg_temp.item('NEW-4')).category is null, 'B4: a category Laria does not know is not stored');
  perform pg_temp.check((pg_temp.item('LINK-1')).category is null and (pg_temp.item('ADOPT-2')).listing_id = pg_temp.id('l2'),
    'B4: linked SKUs take their category from the publication instead');
end $$;

do $$ declare counts jsonb; begin
  counts := public.get_inventory_category_counts();
  perform pg_temp.check(counts = '{"guitars":1,"pedals":2,"basses":1,"none":2}'::jsonb,
    'B4: counts use the publication''s category, else the SKU''s, else "none": ' || counts::text);
  perform pg_temp.check(pg_temp.skus(public.get_inventory_page('{"category":"pedals"}')) = array['LINK-1', 'NEW-3'],
    'B4: the category filter matches a publication''s category and a SKU''s own');
  perform pg_temp.check(pg_temp.skus(public.get_inventory_page('{"category":"basses"}')) = array['ADOPT-2'], 'B4: adopted publication');
  perform pg_temp.check(pg_temp.skus(public.get_inventory_page('{"category":"none"}')) = array['NEW-2', 'NEW-4'], 'B4: "none" selects SKUs with neither');
  perform pg_temp.check(jsonb_array_length(public.get_inventory_page('{}')->'items') = 6, 'B4: no filter, every SKU');
  perform pg_temp.check((public.get_inventory_page('{"category":"guitars"}')->'items'->0->>'category') = 'guitars', 'B4: the item JSON carries its category');
  perform public.archive_inventory_item((pg_temp.item('NEW-4')).id, 'Ya no lo vendo');
  perform pg_temp.check((public.get_inventory_category_counts()->>'none')::integer = 1, 'B4: archived SKUs are not counted');
end $$;

select pg_temp.as_user('owner_b');
do $$ begin
  perform pg_temp.check(public.get_inventory_category_counts() = '{}'::jsonb, 'B4: another store sees only its own counts');
end $$;

-- A later import with a new category updates the SKU; an unknown one leaves it as it was.
select pg_temp.as_user('owner_a');
do $$ declare sid uuid; begin
  sid := pg_temp.ready_session('segunda.csv', jsonb_build_array(
    jsonb_build_object('row_number', 2, 'parsed', '{"sku":"NEW-2","quantity":6,"category":"basses"}'::jsonb, 'issues', pg_temp.hint('precio')),
    jsonb_build_object('row_number', 3, 'parsed', '{"sku":"NEW-1","quantity":9,"category":"theremins"}'::jsonb)
  ));
  perform pg_temp.check(pg_temp.hinted(sid, 2), 'B7: an update of a SKU without a publication keeps the hint');
  perform pg_temp.commit_all(sid);
  perform pg_temp.check((pg_temp.item('NEW-2')).category = 'basses', 'B4: the latest import sets the category');
  perform pg_temp.check((pg_temp.item('NEW-1')).category = 'guitars', 'B4: an unknown category keeps the current one');
end $$;

-- ------------------------------------------------------------------ B5: "Completar datos"

do $$ declare sid uuid := pg_temp.id('first'); result jsonb; begin
  perform pg_temp.expect_error(format($q$select public.set_store_import_row_publish_fields(%L, 2, '{}')$q$, sid), 'IMPORT_FIELDS_INVALID');
  perform pg_temp.expect_error(format($q$select public.set_store_import_row_publish_fields(%L, 2, '[]')$q$, sid), 'IMPORT_FIELDS_INVALID');
  perform pg_temp.expect_error(format($q$select public.set_store_import_row_publish_fields(%L, 2, '{"title":"Otro"}')$q$, sid), 'IMPORT_FIELDS_INVALID');
  perform pg_temp.expect_error(format($q$select public.set_store_import_row_publish_fields(%L, 2, '{"unit_price_pen":"100"}')$q$, sid), 'IMPORT_FIELDS_INVALID');
  perform pg_temp.expect_error(format($q$select public.set_store_import_row_publish_fields(%L, 2, '{"brand":12}')$q$, sid), 'IMPORT_FIELDS_INVALID');
  perform pg_temp.expect_error(format($q$select public.set_store_import_row_publish_fields(%L, 2, '{"category":"theremins"}')$q$, sid), 'IMPORT_FIELDS_INVALID');
  perform pg_temp.expect_error(format($q$select public.set_store_import_row_publish_fields(%L, 2, '{"condition":"Casi nuevo"}')$q$, sid), 'IMPORT_FIELDS_INVALID');
  perform pg_temp.expect_error(format('select public.set_store_import_row_publish_fields(%L, 2, %L)', sid, jsonb_build_object('brand', repeat('x', 81))), 'IMPORT_FIELDS_INVALID');
  perform pg_temp.expect_error(format('select public.set_store_import_row_publish_fields(%L, 2, %L)', sid, jsonb_build_object('description', repeat('x', 2001))), 'IMPORT_FIELDS_INVALID');
  perform pg_temp.expect_error(format($q$select public.set_store_import_row_publish_fields(%L, 99, '{"brand":"Fender"}')$q$, sid), 'IMPORT_ROW_NOT_FOUND');
  perform pg_temp.expect_error(format($q$select public.set_store_import_row_publish_fields(%L, 7, '{"brand":"Fender"}')$q$, pg_temp.id('l1')), 'IMPORT_SESSION_NOT_FOUND');

  result := public.set_store_import_row_publish_fields(sid, 2, jsonb_build_object(
    'brand', '  Fender   Custom  ', 'model', 'Strat', 'category', 'guitars', 'instrument_type', 'electric_guitar',
    'condition', 'Nuevo', 'description', E'  Guitarra eléctrica nueva.\nIncluye estuche rígido y cable de regalo.  '));
  perform pg_temp.check(result->'publish_fields' = jsonb_build_object('brand', 'Fender Custom', 'model', 'Strat', 'category', 'guitars',
    'instrument_type', 'electric_guitar', 'condition', 'Nuevo', 'description', E'Guitarra eléctrica nueva.\nIncluye estuche rígido y cable de regalo.'),
    'B5: values are trimmed, spaces collapse except in the description: ' || result::text);
  perform pg_temp.check((pg_temp.row_of(sid, 2)).publish_fields = result->'publish_fields', 'B5: stored on the row');

  result := public.set_store_import_row_publish_fields(sid, 2, '{"model":"","brand":null,"condition":"Usado - buen estado"}');
  perform pg_temp.check(result->'publish_fields' = jsonb_build_object('category', 'guitars', 'instrument_type', 'electric_guitar',
    -- An old condition is stored on the new scale (20261202120000).
    'condition', 'Muy bueno', 'description', E'Guitarra eléctrica nueva.\nIncluye estuche rígido y cable de regalo.'),
    'B5: an empty string or null clears a field, others merge: ' || result::text);
  result := public.set_store_import_row_publish_fields(sid, 2, '{"category":null,"instrument_type":"","condition":"","description":" "}');
  perform pg_temp.check((pg_temp.row_of(sid, 2)).publish_fields is null and result->'publish_fields' = '{}'::jsonb, 'B5: clearing everything leaves no values');

end $$;

-- An earlier "Faltan datos" outcome is cleared when the owner completes the row; a published row cannot change.
reset role;
update public.store_import_rows set publish_status = 'failed', publish_message = 'Para publicar falta: marca.' where session_id = pg_temp.id('first') and row_number = 3;
update public.store_import_rows set publish_status = 'no_quota', publish_message = 'Sin cupo de publicaciones.' where session_id = pg_temp.id('first') and row_number = 6;
update public.store_import_rows set publish_status = 'published', published_at = now() where session_id = pg_temp.id('first') and row_number = 7;
set local role authenticated;
do $$ declare sid uuid := pg_temp.id('first'); begin
  perform public.set_store_import_row_publish_fields(sid, 3, '{"brand":"Ibanez"}');
  perform pg_temp.check((pg_temp.row_of(sid, 3)).publish_status is null and (pg_temp.row_of(sid, 3)).publish_message is null,
    'B5: a failed attempt no longer describes a completed row');
  perform public.set_store_import_row_publish_fields(sid, 6, '{"brand":"Boss"}');
  perform pg_temp.check((pg_temp.row_of(sid, 6)).publish_status = 'no_quota', 'B5: an allowance outcome stays');
  perform pg_temp.expect_error(format($q$select public.set_store_import_row_publish_fields(%L, 7, '{"brand":"Fender"}')$q$, sid), 'IMPORT_ROW_PUBLISHED');
end $$;

-- Rows that were not applied, imports that are not applied yet, and other owners.
do $$ declare open_sid uuid; begin
  open_sid := pg_temp.ready_session('abierta.csv', '[{"row_number":2,"parsed":{"sku":"NEW-9","product_name":"Abierta","quantity":1}}]');
  perform pg_temp.expect_error(format($q$select public.set_store_import_row_publish_fields(%L, 2, '{"brand":"Fender"}')$q$, open_sid), 'IMPORT_PUBLISH_CLOSED');
  perform public.cancel_store_import(open_sid);
  perform pg_temp.expect_error(format($q$select public.set_store_import_row_publish_fields(%L, 2, '{"brand":"Fender"}')$q$, open_sid), 'IMPORT_PUBLISH_CLOSED');
end $$;

select pg_temp.as_user('owner_b');
do $$ begin
  perform pg_temp.expect_error(format($q$select public.set_store_import_row_publish_fields(%L, 2, '{"brand":"Fender"}')$q$, pg_temp.id('first')), 'IMPORT_SESSION_NOT_FOUND');
end $$;
select pg_temp.as_user('particular');
do $$ begin
  perform pg_temp.expect_error(format($q$select public.set_store_import_row_publish_fields(%L, 2, '{"brand":"Fender"}')$q$, pg_temp.id('first')), 'IMPORT_SESSION_NOT_FOUND');
end $$;

-- After the 30-day cleanup the result is read-only.
select pg_temp.as_user('owner_a');
reset role;
update public.store_import_sessions set rows_purged_at = now() where id = pg_temp.id('first');
set local role authenticated;
do $$ begin
  perform pg_temp.expect_error(format($q$select public.set_store_import_row_publish_fields(%L, 2, '{"brand":"Fender"}')$q$, pg_temp.id('first')), 'IMPORT_PUBLISH_CLOSED');
end $$;

-- The column refuses anything but a small object, whoever writes it.
reset role;
do $$ begin
  perform pg_temp.expect_error(format($q$update public.store_import_rows set publish_fields = '[]' where session_id = %L and row_number = 2$q$, pg_temp.id('first')), 'new row for relation');
  perform pg_temp.expect_error(format('update public.store_import_rows set publish_fields = %L where session_id = %L and row_number = 2',
    jsonb_build_object('description', repeat('x', 17000)), pg_temp.id('first')), 'new row for relation');
end $$;

rollback;
