-- Feature ideas, discovery batch (docs/feature-ideas/discovery.md): the eleventh category, maker profiles and their
-- marks, gift exchanges, verified artists and collections. Who can write what, what the public reads show, and that
-- Admin's actions are audited. Local/test database only. Every fixture is rolled back.
begin;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;

-- Runs a statement as a user (null: anonymous) and returns the error code before the colon, or 'ok'.
create function pg_temp.attempt(p_user uuid, p_sql text) returns text language plpgsql as $$
declare code text;
begin
  if p_user is null then
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  else
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated',
      'app_metadata', case when p_user = 'd7000000-0000-4000-8000-000000000009' then json_build_object('role', 'admin') else '{}'::json end)::text, true);
  end if;
  begin
    execute p_sql;
    code := 'ok';
  exception when others then
    code := case when sqlstate = '42501' then 'denied' else split_part(sqlerrm, ':', 1) end;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return code;
end $$;

create function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', case when p_user is null then 'anon' else 'authenticated' end, true);
  perform set_config('request.jwt.claims', case when p_user is null then '{"role":"anon"}' else json_build_object('sub', p_user, 'role', 'authenticated',
    'app_metadata', case when p_user = 'd7000000-0000-4000-8000-000000000009' then json_build_object('role', 'admin') else '{}'::json end)::text end, true);
end $$;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('d7000000-0000-4000-8000-000000000001','authenticated','authenticated','disc-maker@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Luthier QA","phone":"51999997001","city":"Ayacucho","region":"Ayacucho"}'),
 ('d7000000-0000-4000-8000-000000000002','authenticated','authenticated','disc-shop@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Tienda QA","phone":"51999997002","city":"Lima","region":"Lima"}'),
 ('d7000000-0000-4000-8000-000000000003','authenticated','authenticated','disc-artist@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Artista QA","phone":"51999997003","city":"Lima","region":"Lima"}'),
 ('d7000000-0000-4000-8000-000000000004','authenticated','authenticated','disc-seller@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Vendedor QA","phone":"51999997004","city":"Lima","region":"Lima"}'),
 ('d7000000-0000-4000-8000-000000000009','authenticated','authenticated','disc-admin@example.invalid',now(),'{"role":"admin"}','{"account_type":"seller","full_name":"Admin QA","phone":"51999997009","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('d7100000-0000-4000-8000-000000000001','disc-taller','Taller QA','Taller QA SAC','20999997001','disc-taller@example.invalid','Luthier','Luthier','51999997001','Ayacucho','Ayacucho','Jr. QA 1','d7000000-0000-4000-8000-000000000001','active','free',true),
 ('d7100000-0000-4000-8000-000000000002','disc-tienda','Tienda QA','Tienda QA SAC','20999997002','disc-tienda@example.invalid','Tienda','Tienda','51999997002','Lima','Lima','Av. QA 2','d7000000-0000-4000-8000-000000000002','active','free',false);

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at,published_at) values
 ('d7200000-0000-4000-8000-000000000001','disc-charango','Charango de luthier','store','approved','andean','andean_instrument','Taller QA','Kirkincho','Nuevo',900,'Ayacucho','Ayacucho','Luthier','51999997001','Charango hecho a mano en el taller, con caja de naranjillo y diez cuerdas.','d7000000-0000-4000-8000-000000000001','d7100000-0000-4000-8000-000000000001','self_service',now(),now()),
 ('d7200000-0000-4000-8000-000000000002','disc-quena','Quena pendiente','store','pending','andean','andean_instrument','Taller QA','Caña','Nuevo',120,'Ayacucho','Ayacucho','Luthier','51999997001','Quena de caña hecha a mano en el taller, afinada en sol, con funda.','d7000000-0000-4000-8000-000000000001','d7100000-0000-4000-8000-000000000001','self_service',now(),null),
 ('d7200000-0000-4000-8000-000000000003','disc-pedal','Pedal de tienda','store','approved','pedals','pedals','QA','Uno','Nuevo',300,'Lima','Lima','Tienda','51999997002','Pedal de distorsión en buen estado, con caja original y manual.','d7000000-0000-4000-8000-000000000002','d7100000-0000-4000-8000-000000000002','self_service',now(),now()),
 ('d7200000-0000-4000-8000-000000000004','disc-gira','Guitarra de la gira','individual','approved','guitars','electric_guitar','QA','Gira','Usado - Bueno',2500,'Lima','Lima','Artista','51999997003','Guitarra usada en conciertos, con estuche y cuerdas nuevas, lista para tocar.','d7000000-0000-4000-8000-000000000003',null,'self_service',now(),now()),
 ('d7200000-0000-4000-8000-000000000005','disc-otro','Bajo de otro vendedor','individual','approved','basses','electric_bass','QA','Otro','Usado - Bueno',1500,'Lima','Lima','Vendedor','51999997004','Bajo eléctrico de cuatro cuerdas en buen estado, con funda acolchada.','d7000000-0000-4000-8000-000000000004',null,'self_service',now(),now());

insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/' || l.slug || '-' || n || '.jpg', n
from public.listings l cross join generate_series(0, 1) n
where l.slug like 'disc-%';

-- ---------------------------------------------------------------------------------------- the eleventh category

select pg_temp.check(public.listing_taxonomy_is_valid('andean', 'andean_instrument'), 'andean accepts its own type');
select pg_temp.check(public.listing_taxonomy_is_valid('andean', 'other'), 'andean accepts other');
select pg_temp.check(not public.listing_taxonomy_is_valid('andean', 'electric_guitar'), 'andean refuses another category''s type');
select pg_temp.check(not public.listing_taxonomy_is_valid('strings', 'andean_instrument'), 'the andean type stays in its category');
select pg_temp.check(public.listing_taxonomy_is_valid('percussion', 'hand_percussion'), 'hand percussion (the cajón) stays in Percusión');
select pg_temp.check(public.listing_attribute_keys_are_valid('andean_instrument', '{"andean_type":"charango"}'), 'andean_type is an attribute of the andean type');
select pg_temp.check(not public.listing_attribute_keys_are_valid('andean_instrument', '{"body_type":"solid"}'), 'other keys are refused on the andean type');
select pg_temp.check(public.listing_search_text('Charango de luthier', 'Taller QA', 'Kirkincho', 'andean', 'andean_instrument') like '%andino%',
  'a listing in the category is found by "andino"');
select pg_temp.check(laria_private.normalize_saved_search('{"category":"andean","instrument_type":"andean_instrument","advanced":{"andean_type":"quena"}}')->>'category' = 'andean',
  'a saved search keeps the new category and its attribute');

-- ------------------------------------------------------------------------------------------------- makers

select pg_temp.check(pg_temp.attempt(null, $q$select public.set_store_maker_profile('taller','Ayacucho')$q$) = 'denied', 'anonymous visitors cannot declare a maker');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000004', $q$select public.set_store_maker_profile('taller','Lima')$q$) = 'STORE_REQUIRED', 'a particular has no store to declare');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000001', $q$select public.set_store_maker_profile('artesano','Ayacucho')$q$) = 'MAKER_INVALID', 'only fabricante or taller');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000001', $q$select public.set_store_maker_profile('taller',' ')$q$) = 'MAKER_CITY_REQUIRED', 'the city is required');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000001', $q$select public.set_store_maker_profile('taller','Ayacucho','Corta')$q$) = 'MAKER_STORY_LENGTH', 'a story is 40 characters or more');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000001', $q$select public.set_store_maker_profile('taller','Ayacucho',null,2999)$q$) = 'MAKER_YEAR_INVALID', 'the year cannot be in the future');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000001',
  $q$select public.set_store_maker_profile('taller','  Ayacucho ','Hacemos charangos y quenas a mano desde hace veinte años en el barrio de Santa Ana.',2004)$q$) = 'ok', 'the owner declares the store a taller');
select pg_temp.check((select craft_city from public.store_maker_profiles where store_id = 'd7100000-0000-4000-8000-000000000001') = 'Ayacucho', 'the city is trimmed');

-- The table is not writable from the browser, and another owner does not see the profile.
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000002',
  $q$insert into public.store_maker_profiles(store_id, kind, craft_city) values ('d7100000-0000-4000-8000-000000000002','fabricante','Lima')$q$) = 'denied', 'no direct insert');
select pg_temp.as_user('d7000000-0000-4000-8000-000000000002');
select pg_temp.check((select count(*) from public.store_maker_profiles) = 0, 'another owner reads no maker profile');
select pg_temp.as_user(null);
select pg_temp.check(not has_table_privilege('anon', 'public.store_maker_profiles', 'select'), 'anonymous visitors cannot read the table');
reset role;

-- Listing marks: only a maker's own listings, only the seller.
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000002',
  $q$select public.set_listing_maker_details('d7200000-0000-4000-8000-000000000003', true)$q$) = 'MAKER_REQUIRED', 'a store that is not a maker cannot mark Hecho a mano');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000002',
  $q$select public.set_listing_maker_details('d7200000-0000-4000-8000-000000000001', true)$q$) = 'LISTING_NOT_OWNED', 'another owner cannot mark the maker''s listing');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000001',
  $q$select public.set_listing_maker_details('d7200000-0000-4000-8000-000000000001', true, 40)$q$) = 'MADE_TO_ORDER_INVALID', 'made to order is 1 to 26 weeks');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000001',
  $q$select public.set_listing_maker_details('d7200000-0000-4000-8000-000000000001', true, 6, 'Usado en la gira')$q$) = 'ARTIST_REQUIRED', 'only a verified artist adds a note');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000001',
  $q$select public.set_listing_maker_details('d7200000-0000-4000-8000-000000000001', true, 6)$q$) = 'ok', 'the maker marks the charango');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000001',
  $q$select public.set_listing_maker_details('d7200000-0000-4000-8000-000000000002', true)$q$) = 'ok', 'the maker marks the pending quena');

select pg_temp.as_user(null);
select pg_temp.check((select jsonb_array_length(public.get_listing_marks(array['d7200000-0000-4000-8000-000000000001','d7200000-0000-4000-8000-000000000002']::uuid[]))) = 1,
  'the public marks leave out a pending listing');
select pg_temp.check((select (public.get_listing_marks(array['d7200000-0000-4000-8000-000000000001']::uuid[]))->0->'maker'->>'craft_city') = 'Ayacucho', 'the mark names the city');
select pg_temp.check((select (public.get_listing_marks(array['d7200000-0000-4000-8000-000000000001']::uuid[]))->0->>'made_to_order_weeks') = '6', 'the mark carries the weeks');
select pg_temp.check((select jsonb_array_length(public.get_public_makers(4))) = 1, 'the maker is listed on Hecho en Perú');
select pg_temp.check((select (public.get_public_makers(4))->0->'listing_ids') = '["d7200000-0000-4000-8000-000000000001"]'::jsonb, 'with its public handmade listing only');
select pg_temp.check((public.get_store_maker_profile('d7100000-0000-4000-8000-000000000001'))->>'kind' = 'taller', 'the store page shows the profile');
reset role;

-- Admin hides it with a reason: the marks and the page entry disappear, the owner cannot edit it, the audit has it.
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000001',
  $q$select public.admin_set_maker_hidden('d7100000-0000-4000-8000-000000000001', true, 'Revisión')$q$) = 'denied', 'an owner cannot use the Admin action');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000009',
  $q$select public.admin_set_maker_hidden('d7100000-0000-4000-8000-000000000001', true, 'no')$q$) = 'REASON_REQUIRED', 'hiding needs a reason');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000009',
  $q$select public.admin_set_maker_hidden('d7100000-0000-4000-8000-000000000001', true, 'Revisamos la procedencia')$q$) = 'ok', 'Admin hides the maker');
select pg_temp.check(exists (select 1 from public.admin_audit_actions where target_id = 'd7100000-0000-4000-8000-000000000001' and action = 'maker_hidden'), 'hiding is audited');
select pg_temp.as_user(null);
select pg_temp.check((select jsonb_array_length(public.get_public_makers(4))) = 0, 'a hidden maker leaves Hecho en Perú');
select pg_temp.check(public.get_store_maker_profile('d7100000-0000-4000-8000-000000000001') is null, 'and its store page');
select pg_temp.check(((public.get_listing_marks(array['d7200000-0000-4000-8000-000000000001']::uuid[]))->0->'maker') is null, 'and its listing marks');
reset role;
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000001',
  $q$select public.set_store_maker_profile('fabricante','Lima')$q$) = 'MAKER_HIDDEN', 'the owner cannot change a hidden profile');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000009',
  $q$select public.admin_set_maker_hidden('d7100000-0000-4000-8000-000000000001', false, 'Procedencia confirmada')$q$) = 'ok', 'Admin shows it again');

-- Turning the maker off clears the marks.
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000001', $q$select public.set_store_maker_profile(null)$q$) = 'ok', 'the owner turns the maker off');
select pg_temp.check(not exists (select 1 from public.listing_maker_details d join public.listings l on l.id = d.listing_id
  where l.store_id = 'd7100000-0000-4000-8000-000000000001'), 'the listings lose their maker marks');

-- ---------------------------------------------------------------------------------------------- gift exchanges

select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000002', $q$select public.set_store_gift_policy(90)$q$) = 'GIFT_DAYS_INVALID', '3 to 60 days');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000004', $q$select public.set_store_gift_policy(15)$q$) = 'STORE_REQUIRED', 'only stores');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000002', $q$select public.set_store_gift_policy(15, 'Con boleta y empaque')$q$) = 'ok', 'a store offers gift exchanges');
select pg_temp.as_user(null);
select pg_temp.check((public.get_gift_exchange_stores(12))->0->>'exchange_days' = '15', 'the gift page lists the store');
select pg_temp.check((select count(*) from public.store_gift_policies) = 1, 'the policy of an active store is public');
reset role;
select set_config('app.allow_store_admin_fields', 'true', true);
update public.stores set status = 'hidden' where id = 'd7100000-0000-4000-8000-000000000002';
select pg_temp.as_user(null);
select pg_temp.check((select jsonb_array_length(public.get_gift_exchange_stores(12))) = 0, 'a hidden store leaves the gift page');
select pg_temp.check((select count(*) from public.store_gift_policies) = 0, 'and its policy is no longer public');
reset role;
update public.stores set status = 'active' where id = 'd7100000-0000-4000-8000-000000000002';
select set_config('app.allow_store_admin_fields', '', true);

-- --------------------------------------------------------------------------------------------------- artists

select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000003',
  $q$select public.admin_save_artist_profile('disc-artist@example.invalid','artista-qa','Artista QA',null,null,'Lo dice él mismo')$q$) = 'denied', 'a seller cannot verify themselves');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000009',
  $q$select public.admin_save_artist_profile('disc-artist@example.invalid','artista-qa','Artista QA',null,null,'corto')$q$) = 'ARTIST_CHECK_REQUIRED', 'Admin says how the identity was checked');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000009',
  $q$select public.admin_save_artist_profile('nadie@example.invalid','artista-qa','Artista QA',null,null,'Videollamada y cuenta verificada')$q$) = 'ARTIST_ACCOUNT_NOT_FOUND', 'the account must exist');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000009',
  $q$select public.admin_save_artist_profile('disc-artist@example.invalid','artista-qa','Artista QA',null,'http://example.invalid','Videollamada y cuenta verificada')$q$) = 'ARTIST_LINK_INVALID', 'links are https');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000009',
  $q$select public.admin_save_artist_profile('DISC-ARTIST@example.invalid','artista-qa','Artista QA',null,'https://example.invalid/artista','Videollamada y cuenta verificada')$q$) = 'ok', 'Admin verifies the artist');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000009',
  $q$select public.admin_save_artist_profile('disc-seller@example.invalid','artista-qa','Otro QA',null,null,'Videollamada y cuenta verificada')$q$) = 'ARTIST_SLUG_TAKEN', 'slugs are unique');
select pg_temp.check((select (detail->>'check') from public.admin_audit_actions where action = 'artist_verified' and target_id = 'd7000000-0000-4000-8000-000000000003') = 'Videollamada y cuenta verificada',
  'the check goes to the audit');

select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000003',
  $q$select public.set_listing_maker_details('d7200000-0000-4000-8000-000000000004', true)$q$) = 'MAKER_REQUIRED', 'an artist is not a maker');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000003',
  $q$select public.set_listing_maker_details('d7200000-0000-4000-8000-000000000004', false, null, 'Usada en la gira 2024')$q$) = 'ok', 'the artist adds a note');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000004',
  $q$select public.set_listing_maker_details('d7200000-0000-4000-8000-000000000005', false, null, 'Usado por un famoso')$q$) = 'ARTIST_REQUIRED', 'another seller cannot add a note');

select pg_temp.as_user(null);
select pg_temp.check((public.get_listing_marks(array['d7200000-0000-4000-8000-000000000004']::uuid[]))->0->'artist'->>'slug' = 'artista-qa', 'the listing shows the artist');
select pg_temp.check((public.get_public_artists(4))->0->'listing_ids' = '["d7200000-0000-4000-8000-000000000004"]'::jsonb, 'the artist page lists their gear');
select pg_temp.check(not has_table_privilege('anon', 'public.artist_profiles', 'select'), 'anonymous visitors cannot read the artist table');
reset role;
select pg_temp.as_user('d7000000-0000-4000-8000-000000000004');
select pg_temp.check((select count(*) from public.artist_profiles) = 0, 'another account cannot read the artist row');
reset role;

select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000009',
  $q$select public.admin_revoke_artist_profile('d7000000-0000-4000-8000-000000000003', 'Ya no es verificable')$q$) = 'ok', 'Admin revokes the artist');
select pg_temp.as_user(null);
select pg_temp.check(public.get_listing_marks(array['d7200000-0000-4000-8000-000000000004']::uuid[]) = '[]'::jsonb,
  'a revoked artist''s note and name disappear');
select pg_temp.check((select jsonb_array_length(public.get_public_artists(4))) = 0, 'and they leave the artist page');
reset role;

-- ---------------------------------------------------------------------------------------------- collections

select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000002',
  $q$select public.admin_save_collection(null,'qa-coleccion','Colección QA','Una colección de prueba para revisar las reglas.','[{"label":"Guitarras","query":"category=guitars"}]',null,null,true)$q$) = 'denied', 'only Admin saves collections');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000009',
  $q$select public.admin_save_collection(null,'qa-coleccion','Colección QA','Una colección de prueba para revisar las reglas.','[{"label":"Guitarras","query":"category=guitars<script>"}]',null,null,true)$q$) <> 'ok', 'a set query keeps to the catalog''s characters');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000009',
  $q$select public.admin_save_collection(null,'qa-coleccion','Colección QA','Una colección de prueba para revisar las reglas.','[{"label":"Guitarras","query":"category=guitars"}]','2020-01-01','2020-02-01',true)$q$) = 'ok', 'Admin saves a past collection');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000009',
  $q$select public.admin_save_collection(null,'qa-vigente','Colección vigente','Una colección de prueba que está dentro de sus fechas.','[{"label":"Bajos","query":"category=basses"}]',null,null,true)$q$) = 'ok', 'Admin saves a current collection');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000009',
  $q$select public.admin_save_collection(null,'qa-borrador','Colección borrador','Una colección de prueba que todavía es borrador.','[{"label":"Bajos","query":"category=basses"}]',null,null,false)$q$) = 'ok', 'Admin saves a draft');
select pg_temp.as_user(null);
select pg_temp.check(not exists (select 1 from public.collections where slug in ('qa-coleccion', 'qa-borrador')), 'past and draft collections are not public');
select pg_temp.check(exists (select 1 from public.collections where slug = 'qa-vigente'), 'a current collection is public');
reset role;
select pg_temp.check(pg_temp.attempt(null, $q$insert into public.collections(slug,title,intro,sets) values ('x','xxx','xxxxxxxxxxxxxxxxxxxxxxx','[{"label":"xx","query":"q=x"}]')$q$) = 'denied', 'no direct writes');
select pg_temp.check(pg_temp.attempt('d7000000-0000-4000-8000-000000000009',
  $q$select public.admin_delete_collection((select id from public.collections where slug = 'qa-borrador'))$q$) = 'ok', 'Admin deletes a collection');
select pg_temp.check(exists (select 1 from public.admin_audit_actions where target_type = 'collection' and action like '%collection%'), 'collection changes are audited');
select pg_temp.check((select count(*) from public.collections where slug in ('criollo-y-afroperuano','andino','banda-escolar','alabanza','home-studio','empieza-con-500')) = 6, 'the six starter collections are seeded');

-- Nothing writable is open to the browser roles beyond the RPCs.
select pg_temp.check(not has_function_privilege('anon', 'public.set_listing_maker_details(uuid, boolean, integer, text)', 'execute'), 'anon cannot mark listings');
select pg_temp.check(not has_function_privilege('anon', 'public.admin_save_collection(uuid, text, text, text, jsonb, date, date, boolean, integer)', 'execute'), 'anon cannot save collections');
select pg_temp.check(not has_function_privilege('authenticated', 'laria_private.visible_maker_profile(uuid)', 'execute'), 'private helpers stay private');

rollback;
