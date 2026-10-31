-- Effortless Laria, selling batch (docs/ux-effortless/selling.md): listing drafts (POST 02), sound clips (POST 16),
-- store listing defaults (SHOP 06), SKU listing details (STOCK 09) and the review wait (POST 14).
-- Local/test database only. Every fixture is rolled back.
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
create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"c5100000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal2","app_metadata":{"role":"admin"}}', true);
end $$;
create function pg_temp.drafts(p_id uuid) returns bigint language sql security definer as $$
  select count(*) from public.listing_drafts where id = p_id
$$;
create function pg_temp.item(p_name text) returns public.store_inventory_items language sql security definer as $$
  select * from public.store_inventory_items where id = pg_temp.id(p_name)
$$;

select pg_temp.remember('owner_a', 'c5100000-0000-4000-8000-000000000001'),
       pg_temp.remember('owner_b', 'c5100000-0000-4000-8000-000000000002'),
       pg_temp.remember('seller', 'c5100000-0000-4000-8000-000000000003'),
       pg_temp.remember('other', 'c5100000-0000-4000-8000-000000000004'),
       pg_temp.remember('store_a', 'c5200000-0000-4000-8000-000000000001'),
       pg_temp.remember('store_b', 'c5200000-0000-4000-8000-000000000002'),
       pg_temp.remember('d1', 'c5300000-0000-4000-8000-000000000001'),
       pg_temp.remember('d2', 'c5300000-0000-4000-8000-000000000002'),
       pg_temp.remember('ds', 'c5300000-0000-4000-8000-000000000003'),
       pg_temp.remember('lp', 'c5400000-0000-4000-8000-000000000001'),
       pg_temp.remember('lpending', 'c5400000-0000-4000-8000-000000000002'),
       pg_temp.remember('ls', 'c5400000-0000-4000-8000-000000000003');

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('c5100000-0000-4000-8000-000000000001','authenticated','authenticated','sel-owner-a@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Venta A","phone":"51999995001","city":"Lima","region":"Lima"}'),
 ('c5100000-0000-4000-8000-000000000002','authenticated','authenticated','sel-owner-b@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Venta B","phone":"51999995002","city":"Lima","region":"Lima"}'),
 ('c5100000-0000-4000-8000-000000000003','authenticated','authenticated','sel-seller@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Particular Venta","phone":"51999995003","city":"Lima","region":"Lima"}'),
 ('c5100000-0000-4000-8000-000000000004','authenticated','authenticated','sel-other@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Otro Venta","phone":"51999995004","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('c5200000-0000-4000-8000-000000000001','sel-tienda-a','Tienda Venta A','Tienda Venta A SAC','20999995001','sel-a@example.invalid','Contacto A','Contacto A','51999995001','Lima','Lima','Av. QA 1','c5100000-0000-4000-8000-000000000001','active','free',true),
 ('c5200000-0000-4000-8000-000000000002','sel-tienda-b','Tienda Venta B','Tienda Venta B SAC','20999995002','sel-b@example.invalid','Contacto B','Contacto B','51999995002','Lima','Lima','Av. QA 2','c5100000-0000-4000-8000-000000000002','active','free',false);

-- ------------------------------------------------------------------ POST 02: drafts

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform pg_temp.expect_error('select 1 from public.listing_drafts', 'permission denied');
end $$;

set local role authenticated;
select pg_temp.as_user('seller');
do $$ begin
  insert into public.listing_drafts (id, kind, title, form, photos, sound_clip)
  values (pg_temp.id('d1'), 'listing', 'Fender Strat', '{"brand":"Fender"}',
    jsonb_build_array(jsonb_build_object('path', pg_temp.id('seller') || '/' || pg_temp.id('d1') || '/0.jpg', 'shot', 'frente'),
                      jsonb_build_object('path', pg_temp.id('seller') || '/' || pg_temp.id('d1') || '/7.png')),
    jsonb_build_object('path', pg_temp.id('seller') || '/' || pg_temp.id('d1') || '/sonido-8.webm', 'duration', 12.5, 'type', 'audio/webm'));
  perform pg_temp.check((select owner_user_id from public.listing_drafts where id = pg_temp.id('d1')) = pg_temp.id('seller'), 'owner not defaulted to the caller');

  -- Paths outside the draft's own folder, odd slots, bad clips and other people's ids are refused.
  perform pg_temp.expect_error(format($q$insert into public.listing_drafts (id, kind, photos) values (%L, 'listing', %L)$q$,
    pg_temp.id('d2'), jsonb_build_array(jsonb_build_object('path', pg_temp.id('other') || '/' || pg_temp.id('d2') || '/0.jpg'))), 'Invalid draft photo');
  perform pg_temp.expect_error(format($q$insert into public.listing_drafts (id, kind, photos) values (%L, 'listing', %L)$q$,
    pg_temp.id('d2'), jsonb_build_array(jsonb_build_object('path', pg_temp.id('seller') || '/' || pg_temp.id('d2') || '/100.jpg'))), 'Invalid draft photo');
  perform pg_temp.expect_error(format($q$insert into public.listing_drafts (id, kind, photos) values (%L, 'listing', %L)$q$,
    pg_temp.id('d2'), jsonb_build_array(jsonb_build_object('path', pg_temp.id('seller') || '/' || pg_temp.id('d2') || '/0.gif'))), 'Invalid draft photo');
  perform pg_temp.expect_error(format($q$insert into public.listing_drafts (id, kind, sound_clip) values (%L, 'listing', %L)$q$,
    pg_temp.id('d2'), jsonb_build_object('path', pg_temp.id('seller') || '/' || pg_temp.id('d2') || '/sonido-1.webm', 'duration', 25)), 'Invalid draft sound clip');
  -- A missing path or duration is refused too (integration).
  perform pg_temp.expect_error(format($q$insert into public.listing_drafts (id, kind, sound_clip) values (%L, 'listing', %L)$q$,
    pg_temp.id('d2'), jsonb_build_object('duration', 12)), 'Invalid draft sound clip');
  perform pg_temp.expect_error(format($q$insert into public.listing_drafts (id, kind, sound_clip) values (%L, 'listing', %L)$q$,
    pg_temp.id('d2'), jsonb_build_object('path', pg_temp.id('seller') || '/' || pg_temp.id('d2') || '/sonido-1.webm')), 'Invalid draft sound clip');
  perform pg_temp.expect_error(format($q$insert into public.listing_drafts (id, kind, photos) values (%L, 'listing', %L)$q$,
    pg_temp.id('d2'), jsonb_build_array(jsonb_build_object('shot', 'frente'))), 'Invalid draft photo');
  perform pg_temp.expect_error(format($q$insert into public.listing_drafts (id, owner_user_id, kind) values (%L, %L, 'listing')$q$,
    pg_temp.id('d2'), pg_temp.id('other')), 'row-level security');
  -- A Particular cannot save a store draft, and a draft keeps its owner and kind.
  perform pg_temp.expect_error(format($q$insert into public.listing_drafts (id, kind, store_id) values (%L, 'store_listing', %L)$q$,
    pg_temp.id('d2'), pg_temp.id('store_a')), 'belongs to the owner''s store');
  perform pg_temp.expect_error(format($q$update public.listing_drafts set kind = 'store_listing', store_id = %L where id = %L$q$,
    pg_temp.id('store_a'), pg_temp.id('d1')), 'keeps its id, owner, kind and store');

  -- Saving again (the client upserts) updates the same row.
  insert into public.listing_drafts (id, kind, title) values (pg_temp.id('d1'), 'listing', 'Fender Strat 2021')
  on conflict (id) do update set title = excluded.title;
  perform pg_temp.check((select title from public.listing_drafts where id = pg_temp.id('d1')) = 'Fender Strat 2021', 'upsert did not update');
end $$;

-- 20 drafts at most, and an upsert of an existing draft is not counted against itself.
do $$ begin
  insert into public.listing_drafts (id, kind) select gen_random_uuid(), 'listing' from generate_series(1, 19);
  perform pg_temp.expect_error(format($q$insert into public.listing_drafts (id, kind) values (%L, 'listing')$q$, pg_temp.id('d2')), 'LISTING_DRAFT_LIMIT');
  insert into public.listing_drafts (id, kind, title) values (pg_temp.id('d1'), 'listing', 'Con 20 borradores')
  on conflict (id) do update set title = excluded.title;
  perform pg_temp.check((select title from public.listing_drafts where id = pg_temp.id('d1')) = 'Con 20 borradores', 'upsert at the limit failed');
  delete from public.listing_drafts where id <> pg_temp.id('d1');
end $$;

select pg_temp.as_user('other');
do $$ begin
  perform pg_temp.check((select count(*) from public.listing_drafts) = 0, 'another user sees the draft');
  update public.listing_drafts set title = 'robado' where id = pg_temp.id('d1');
  delete from public.listing_drafts where id = pg_temp.id('d1');
end $$;
reset role;
do $$ begin
  perform pg_temp.check(pg_temp.drafts(pg_temp.id('d1')) = 1 and (select title from public.listing_drafts where id = pg_temp.id('d1')) = 'Con 20 borradores',
    'another user changed or deleted the draft');
end $$;

-- Publishing the draft's submission deletes the draft in the same transaction, and it cannot come back.
do $$ begin
  perform public.complete_public_submission(pg_temp.id('d1'), 'listing', jsonb_build_object('slug', 'sel-d1', 'title', 'Fender Strat QA',
    'category', 'guitars', 'instrument_type', 'electric_guitar', 'brand', 'Fender', 'model', 'Strat', 'condition', 'Usado - buen estado',
    'price_pen', 1500, 'city', 'Lima', 'region', 'Lima', 'owner_user_id', pg_temp.id('seller'), 'marketplace_rules_accepted', true,
    'description', 'Publicación de prueba con suficiente detalle para validar el borrador.'),
    '[{"image_url":"https://example.invalid/sel-0.jpg"},{"image_url":"https://example.invalid/sel-1.jpg"}]');
  perform pg_temp.check(pg_temp.drafts(pg_temp.id('d1')) = 0, 'publishing did not delete the draft');
end $$;
set local role authenticated;
select pg_temp.as_user('seller');
do $$ begin
  perform pg_temp.expect_error(format($q$insert into public.listing_drafts (id, kind) values (%L, 'listing')$q$, pg_temp.id('d1')), 'LISTING_DRAFT_ALREADY_PUBLISHED');
end $$;

-- A store owner saves drafts for their own store only.
select pg_temp.as_user('owner_a');
do $$ begin
  insert into public.listing_drafts (id, kind, store_id) values (pg_temp.id('ds'), 'store_listing', pg_temp.id('store_a'));
  perform pg_temp.expect_error(format($q$insert into public.listing_drafts (id, kind, store_id) values (%L, 'store_listing', %L)$q$,
    gen_random_uuid(), pg_temp.id('store_b')), 'belongs to the owner''s store');
  perform pg_temp.expect_error(format($q$insert into public.listing_drafts (id, kind) values (%L, 'store_listing')$q$, gen_random_uuid()), 'owner''s store');
end $$;
reset role;

-- ------------------------------------------------------------------ POST 16: sound clips follow their listing

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at) values
 ('c5400000-0000-4000-8000-000000000001','sel-lp','Guitarra con sonido','individual','approved','guitars','electric_guitar','QA','Uno','Nuevo',1000,'Lima','Lima','Particular Venta','51999995003','Descripción de publicación válida con más de cuarenta caracteres.','c5100000-0000-4000-8000-000000000003',null,'self_service',now()),
 ('c5400000-0000-4000-8000-000000000002','sel-lpending','Guitarra en revisión','individual','pending','guitars','electric_guitar','QA','Dos','Nuevo',1000,'Lima','Lima','Particular Venta','51999995003','Descripción de publicación válida con más de cuarenta caracteres.','c5100000-0000-4000-8000-000000000003',null,'self_service',now());
insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/' || l.slug || '-' || n || '.jpg', n from public.listings l cross join generate_series(0, 1) n where l.slug in ('sel-lp', 'sel-lpending');
insert into public.listing_sound_clips (listing_id, clip_url, mime_type, duration_seconds) values
 ('c5400000-0000-4000-8000-000000000001', 'https://example.invalid/sonido-1.webm', 'audio/webm', 12),
 ('c5400000-0000-4000-8000-000000000002', 'https://example.invalid/sonido-2.webm', 'audio/webm', 8);

do $$ begin
  perform pg_temp.expect_error($q$insert into public.listing_sound_clips (listing_id, clip_url, mime_type, duration_seconds)
    values ('c5400000-0000-4000-8000-000000000001', 'https://example.invalid/x.webm', 'audio/webm', 10)$q$, 'duplicate key');
  perform pg_temp.expect_error($q$update public.listing_sound_clips set duration_seconds = 25 where listing_id = 'c5400000-0000-4000-8000-000000000001'$q$, 'check constraint');
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform pg_temp.check((select count(*) from public.listing_sound_clips where listing_id in (pg_temp.id('lp'), pg_temp.id('lpending'))) = 1,
    'anon must see the approved listing''s clip only');
  perform pg_temp.expect_error($q$insert into public.listing_sound_clips (listing_id, clip_url, mime_type, duration_seconds) values (gen_random_uuid(), 'https://example.invalid/y.webm', 'audio/webm', 5)$q$, 'permission denied');
end $$;

set local role authenticated;
select pg_temp.as_user('seller');
do $$ begin
  perform pg_temp.check((select count(*) from public.listing_sound_clips where listing_id in (pg_temp.id('lp'), pg_temp.id('lpending'))) = 2,
    'the owner must see the clip of their pending listing');
  delete from public.listing_sound_clips where listing_id = pg_temp.id('lp');
  perform pg_temp.check((select count(*) from public.listing_sound_clips where listing_id = pg_temp.id('lp')) = 1, 'an owner removed a reviewed clip directly');
end $$;

select pg_temp.as_admin();
do $$ declare queue jsonb; entry jsonb; begin
  queue := to_jsonb(public.get_admin_moderation_queue('publicaciones'));
  select value into entry from jsonb_array_elements(case when jsonb_typeof(queue) = 'array' then queue else coalesce(queue->'items', '[]') end)
  where value->>'id' = pg_temp.id('lpending')::text;
  perform pg_temp.check(entry->>'sound_clip_url' = 'https://example.invalid/sonido-2.webm', 'the Admin queue does not carry the sound clip');
end $$;
reset role;

do $$ begin
  perform pg_temp.check((select public from storage.buckets where id = 'listing-sound-clips')
    and (select file_size_limit from storage.buckets where id = 'listing-sound-clips') = 1048576, 'sound bucket settings wrong');
end $$;

-- ------------------------------------------------------------------ SHOP 06: store listing defaults

set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ begin
  insert into public.store_listing_defaults (store_id, condition, description_footer)
  values (pg_temp.id('store_a'), 'Nuevo', 'Garantía de 6 meses en tienda.');
  perform pg_temp.expect_error(format($q$insert into public.store_listing_defaults (store_id, condition) values (%L, 'Nuevo')$q$, pg_temp.id('store_b')), 'row-level security');
  perform pg_temp.expect_error(format($q$update public.store_listing_defaults set condition = 'Casi nuevo' where store_id = %L$q$, pg_temp.id('store_a')), 'check constraint');
  perform pg_temp.expect_error(format($q$update public.store_listing_defaults set description_footer = repeat('x', 1001) where store_id = %L$q$, pg_temp.id('store_a')), 'check constraint');
end $$;
select pg_temp.as_user('owner_b');
do $$ begin
  perform pg_temp.check((select count(*) from public.store_listing_defaults where store_id = pg_temp.id('store_a')) = 0, 'another store reads the defaults');
end $$;
select pg_temp.as_user('seller');
do $$ begin
  perform pg_temp.check((select count(*) from public.store_listing_defaults) = 0, 'a Particular reads store defaults');
end $$;
reset role;

-- ------------------------------------------------------------------ STOCK 09: SKU listing details

set local role authenticated;
select pg_temp.as_admin();
select public.admin_set_store_inventory_enabled(pg_temp.id('store_a'), true, 'Piloto de venta');
select public.admin_set_store_inventory_enabled(pg_temp.id('store_b'), true, 'Piloto de venta');
select pg_temp.as_user('owner_a');
do $$ declare result jsonb; begin
  result := public.create_inventory_item('{"merchant_sku":"SEL-001","product_name":"Bajo de venta","unit_price_pen":1200}', 3, 'qa-sel-create-1');
  perform pg_temp.remember('item1', (result->'item'->>'id')::uuid);
  result := public.create_inventory_item('{"merchant_sku":"SEL-002","product_name":"Pedal de venta"}', 1, 'qa-sel-create-2');
  perform pg_temp.remember('item2', (result->'item'->>'id')::uuid);

  -- The owner corrects what the SKU remembers; unknown keys and invalid values are dropped, the category is kept.
  result := public.update_inventory_listing_details(pg_temp.id('item1'),
    '{"brand":"Fender","model":"Jazz Bass","condition":"Usado - buen estado","category":"basses","price_pen":1,"condition_bad":"x","instrument_type":"Bass!"}');
  perform pg_temp.check((result->>'changed')::boolean, 'details not saved');
  perform pg_temp.check((pg_temp.item('item1')).listing_details = '{"brand":"Fender","model":"Jazz Bass","condition":"Muy bueno"}'::jsonb,
    'details not sanitized: ' || (pg_temp.item('item1')).listing_details::text);
  perform pg_temp.check((pg_temp.item('item1')).category = 'basses', 'category not set from details');
  result := public.update_inventory_listing_details(pg_temp.id('item1'), '{"brand":"Fender","model":"Jazz Bass","condition":"Usado - buen estado","category":"basses"}');
  perform pg_temp.check(not (result->>'changed')::boolean, 'a repeat save counted as a change');
  perform pg_temp.check((select count(*) from public.store_inventory_changes where item_id = pg_temp.id('item1') and change_type = 'details') = 1,
    'details change not logged once');
  perform pg_temp.expect_error(format($q$select public.update_inventory_listing_details(%L, '[]')$q$, pg_temp.id('item1')), 'INVENTORY_FIELD_INVALID');
end $$;

select pg_temp.as_user('owner_b');
do $$ begin
  perform pg_temp.expect_error(format($q$select public.update_inventory_listing_details(%L, '{"brand":"X"}')$q$, pg_temp.id('item1')), 'INVENTORY_');
end $$;
select pg_temp.as_user('seller');
do $$ begin
  perform pg_temp.expect_error(format($q$select public.update_inventory_listing_details(%L, '{"brand":"X"}')$q$, pg_temp.id('item1')), 'INVENTORY_');
end $$;
reset role;

-- Publishing a SKU leaves the listing's details on it for the next publication.
do $$ begin
  perform public.complete_public_submission(pg_temp.id('ls'), 'store_listing', jsonb_build_object('slug', 'sel-ls', 'title', 'Pedal de venta Boss',
    'category', 'pedals', 'instrument_type', 'pedals', 'brand', 'Boss', 'model', 'DS-1', 'condition', 'Nuevo', 'price_pen', '350',
    'description', 'Pedal de distorsión en caja, con más de cuarenta caracteres de descripción.', 'store_id', pg_temp.id('store_a'),
    'owner_user_id', pg_temp.id('owner_a'), 'marketplace_rules_accepted', true, 'inventory_item_id', pg_temp.id('item2')),
    '[{"image_url":"https://example.invalid/sel-ls-0.jpg"},{"image_url":"https://example.invalid/sel-ls-1.jpg"}]');
  perform pg_temp.check((pg_temp.item('item2')).listing_id = pg_temp.id('ls'), 'publication did not link the SKU');
  perform pg_temp.check((pg_temp.item('item2')).listing_details @> '{"brand":"Boss","model":"DS-1","condition":"Nuevo"}'::jsonb,
    'publication did not remember the details: ' || (pg_temp.item('item2')).listing_details::text);
  perform pg_temp.check((pg_temp.item('item2')).listing_details ? 'description', 'publication did not remember the description');
  perform pg_temp.check((pg_temp.item('item2')).category = 'pedals', 'publication did not remember the category');
end $$;

-- ------------------------------------------------------------------ POST 14: review wait

do $$ declare baseline bigint; begin
  select count(*) into baseline from public.listings where store_id is null and published_at is not null and published_at > now() - interval '60 days';
  if baseline = 0 then
    perform pg_temp.check(public.listing_review_wait_minutes() is null, 'a wait was shown without data');
  end if;
end $$;
insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,created_by_source,marketplace_rules_accepted_at,created_at,published_at)
select gen_random_uuid(), 'sel-wait-' || n, 'Guitarra espera ' || n, 'individual', 'approved', 'guitars', 'electric_guitar', 'QA', 'W' || n, 'Nuevo', 500,
  'Lima', 'Lima', 'Otro Venta', '51999995004', 'Descripción de publicación válida con más de cuarenta caracteres.',
  'c5100000-0000-4000-8000-000000000004', 'self_service', now(), now() - interval '1 day' - n * interval '1 minute', now() - interval '1 day' + interval '90 minutes'
from generate_series(1, 25) n;
do $$ declare wait integer; begin
  wait := public.listing_review_wait_minutes();
  perform pg_temp.check(wait is not null and wait between 90 and 130, 'median review wait wrong: ' || coalesce(wait::text, 'null'));
  perform pg_temp.check(not has_function_privilege('anon', 'public.listing_review_wait_minutes()', 'execute'), 'anon can read the review wait');
end $$;

rollback;
