-- Feature ideas, services batch, bet-02 (docs/feature-ideas/services.md): "Servicios para músicos".
-- Saving a service and its rules, Admin review and post-moderation, the public directory and page, views and contacts,
-- "Contraté este servicio" bookings, reviews, reports, pausing and deleting, photos, the notices and e-mails, and the
-- browser-role boundaries. Services never touch listings. Local/test database only; every fixture is rolled back.
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
create function pg_temp.num(p_name text) returns integer language sql as $$ select current_setting('qa.' || p_name)::integer $$;
create function pg_temp.remember_num(p_name text, p_value integer) returns void language plpgsql as $$
begin perform set_config('qa.' || p_name, p_value::text, true); end $$;

create function pg_temp.as_user(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(p_name), 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id('admin'), 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('role', 'admin'))::text, true);
end $$;
-- Reads the browser roles cannot make (the tables are closed to them).
create function pg_temp.service(p_id uuid) returns public.services language sql security definer as $$
  select * from public.services where id = p_id
$$;
create function pg_temp.booking(p_id uuid) returns public.service_bookings language sql security definer as $$
  select * from public.service_bookings where id = p_id
$$;
create function pg_temp.notifications(p_user uuid, p_type text) returns bigint language sql security definer as $$
  select count(*) from public.notifications where user_id = p_user and event_type = p_type
$$;
create function pg_temp.delivery_context(p_key text) returns jsonb language sql security definer as $$
  select context from laria_private.marketplace_email_deliveries where dedupe_key = p_key
$$;
create function pg_temp.events(p_service uuid, p_kind text) returns bigint language sql security definer as $$
  select count(*) from public.service_events where service_id = p_service and kind = p_kind
$$;
create function pg_temp.ids(p_page jsonb) returns uuid[] language sql as $$
  select coalesce(array_agg((value->>'id')::uuid order by ordinality), '{}') from jsonb_array_elements(p_page->'items') with ordinality
$$;
-- A valid lesson service; tests override one field at a time.
create function pg_temp.lesson(p_overrides jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'category', 'clases',
    'title', 'Clases de guitarra para principiantes',
    'provider_name', 'Prof. Ana Torres',
    'description', 'Clases de guitarra acústica y eléctrica para todas las edades, con material incluido y repertorio a tu gusto.',
    'price_from_pen', 50,
    'price_unit', 'clase',
    'modalities', jsonb_build_array('en_local', 'en_linea'),
    'skills', jsonb_build_array('guitarra', 'teoria'),
    'city', 'Lima',
    'region', 'Lima',
    'district', 'Miraflores',
    'areas', jsonb_build_array('Barranco', 'San Isidro')
  ) || p_overrides
$$;

select pg_temp.remember('prov', 'f5110000-0000-4000-8000-000000000001'),
       pg_temp.remember('client', 'f5110000-0000-4000-8000-000000000002'),
       pg_temp.remember('client2', 'f5110000-0000-4000-8000-000000000003'),
       pg_temp.remember('owner', 'f5110000-0000-4000-8000-000000000004'),
       pg_temp.remember('stranger', 'f5110000-0000-4000-8000-000000000005'),
       pg_temp.remember('admin', 'f5110000-0000-4000-8000-000000000099'),
       pg_temp.remember('store', 'f6110000-0000-4000-8000-000000000001'),
       pg_temp.remember('session', 'f7110000-0000-4000-8000-000000000001'),
       pg_temp.remember('session2', 'f7110000-0000-4000-8000-000000000002');

-- ------------------------------------------------------------------ fixtures

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('f5110000-0000-4000-8000-000000000001','authenticated','authenticated','svc-prov@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Ana Torres","phone":"51999996101","city":"Lima","region":"Lima"}'),
 ('f5110000-0000-4000-8000-000000000002','authenticated','authenticated','svc-client@example.invalid',now(),'{}','{"account_type":"seller","full_name":"rodrigo  castañeda ruiz","phone":"51999996102","city":"Lima","region":"Lima"}'),
 ('f5110000-0000-4000-8000-000000000003','authenticated','authenticated','svc-client2@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Lucía Paz","phone":"51999996103","city":"Cusco","region":"Cusco"}'),
 ('f5110000-0000-4000-8000-000000000004','authenticated','authenticated','svc-owner@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Taller","phone":"51999996104","city":"Lima","region":"Lima"}'),
 ('f5110000-0000-4000-8000-000000000005','authenticated','authenticated','svc-stranger@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Extraño","phone":"51999996105","city":"Lima","region":"Lima"}'),
 ('f5110000-0000-4000-8000-000000000099','authenticated','authenticated','svc-admin@example.invalid',now(),'{"role":"admin"}','{"account_type":"seller","full_name":"Admin S","phone":"51999996199","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('f6110000-0000-4000-8000-000000000001','svc-taller','Taller Sonido Andino','Taller SAC','20999996111','svc-t@example.invalid','Contacto T','Contacto T','51999996104','Lima','Lima','Av. QA 61','f5110000-0000-4000-8000-000000000004','active','free',true);

-- An uploaded photo in the provider's folder, one in another account's folder.
insert into storage.objects(bucket_id, name, owner_id, metadata) values
 ('service-photos', 'f5110000-0000-4000-8000-000000000001/f8110000-0000-4000-8000-000000000001.jpg', 'f5110000-0000-4000-8000-000000000001', '{"size":100,"mimetype":"image/jpeg"}'),
 ('service-photos', 'f5110000-0000-4000-8000-000000000005/f8110000-0000-4000-8000-000000000002.jpg', 'f5110000-0000-4000-8000-000000000005', '{"size":100,"mimetype":"image/jpeg"}');

select pg_temp.remember_num('listings_before', (select count(*) from public.listings)::integer);

-- ------------------------------------------------------------------ anonymous visitors read, never write

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson())$q$, 'permission denied');
  perform pg_temp.expect_error('select count(*) from public.services', 'permission denied');
  perform pg_temp.expect_error('select count(*) from public.service_bookings', 'permission denied');
  perform pg_temp.expect_error('select count(*) from public.service_reviews', 'permission denied');
  perform pg_temp.expect_error('select count(*) from public.service_events', 'permission denied');
  perform pg_temp.expect_error('select count(*) from public.service_reports', 'permission denied');
  perform pg_temp.expect_error($q$select public.record_service_event(gen_random_uuid(), gen_random_uuid(), 'view', null, gen_random_uuid())$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.get_admin_service_queue()$q$, 'permission denied');
  perform pg_temp.check((public.get_public_services()->>'total')::integer = 0, 'empty directory');
  perform pg_temp.check((public.get_service_viewer_state(gen_random_uuid())->>'signed_in')::boolean = false, 'anon viewer');
end $$;
reset role;

-- ------------------------------------------------------------------ saving: the rules

set local role authenticated;
select pg_temp.as_user('prov');
do $$
declare saved jsonb; s public.services;
begin
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson('{"category":"alquiler"}'))$q$, 'SERVICE_CATEGORY_INVALID: ');
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson('{"title":"Clases"}'))$q$, 'SERVICE_TITLE_LENGTH');
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson('{"description":"Muy corto."}'))$q$, 'SERVICE_DESCRIPTION_LENGTH');
  -- The PAY-1 contact filter, in the title, the description and the name.
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson('{"title":"Clases al 987 654 321"}'))$q$, 'SERVICE_CONTACT_DETAILS: No escribas');
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson(jsonb_build_object('description', repeat('Clases de guitarra. ', 3) || 'Escríbeme a ana@correo.com')))$q$, 'SERVICE_CONTACT_DETAILS');
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson('{"provider_name":"www.anatorres.pe"}'))$q$, 'SERVICE_CONTACT_DETAILS');
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson('{"price_from_pen":0}'))$q$, 'SERVICE_PRICE_INVALID');
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson('{"price_from_pen":"cincuenta"}'))$q$, 'SERVICE_PRICE_INVALID');
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson('{"price_unit":"evento"}'))$q$, 'SERVICE_UNIT_INVALID');
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson('{"modalities":[]}'))$q$, 'SERVICE_MODALITY_INVALID');
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson('{"modalities":["en_tu_casa"]}'))$q$, 'SERVICE_MODALITY_INVALID');
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson('{"skills":[]}'))$q$, 'SERVICE_SKILLS_INVALID: Elige entre 1 y 8 instrumentos o temas');
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson('{"skills":["amplificadores"]}'))$q$, 'SERVICE_SKILLS_INVALID');
  -- Rehearsal rooms take no skills and only "en el local".
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson('{"category":"ensayo","price_unit":"hora","modalities":["en_local"],"skills":["guitarra"]}'))$q$, 'SERVICE_SKILLS_INVALID');
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson('{"category":"ensayo","price_unit":"hora","modalities":["en_linea"],"skills":[]}'))$q$, 'SERVICE_MODALITY_INVALID');
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson('{"city":" "}'))$q$, 'SERVICE_CITY_REQUIRED');
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson('{"areas":["A","B","C","D","E","F","G","H","I","J","K","L","M"]}'))$q$, 'SERVICE_AREAS_INVALID');
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson('{"whatsapp_phone":"12"}'))$q$, 'SERVICE_PHONE_INVALID');
  -- Photos must be the caller's own uploads that exist.
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson('{"photo_paths":["f5110000-0000-4000-8000-000000000005/f8110000-0000-4000-8000-000000000002.jpg"]}'))$q$, 'SERVICE_PHOTOS_INVALID');
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson('{"photo_paths":["f5110000-0000-4000-8000-000000000001/f8110000-0000-4000-8000-000000000009.jpg"]}'))$q$, 'SERVICE_PHOTOS_INVALID');
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson('{"photo_paths":["../x.jpg"]}'))$q$, 'SERVICE_PHOTOS_INVALID');

  -- A clean lesson service: pending, slug fixed, whitespace folded, areas deduplicated (case and accents aside),
  -- the profile's phone as the default WhatsApp.
  saved := public.save_service(null, pg_temp.lesson(jsonb_build_object(
    'title', '  Clases de   guitarra para principiantes ',
    'description', E'Clases de guitarra acústica y eléctrica.\n\n\n\nPara todas las edades, con material incluido y repertorio a tu gusto.',
    'areas', jsonb_build_array('Barranco', ' barranco ', 'San Isidro', 'SAN ISIDRÓ', 'Surco'),
    'photo_paths', jsonb_build_array('f5110000-0000-4000-8000-000000000001/f8110000-0000-4000-8000-000000000001.jpg'))));
  perform pg_temp.remember('s_lesson', (saved->>'id')::uuid);
  s := pg_temp.service((saved->>'id')::uuid);
  perform pg_temp.check(saved->>'status' = 'pending' and s.status = 'pending', 'new service waits for Admin');
  perform pg_temp.check(s.slug ~ '^clases-de-guitarra-para-principiantes-[0-9a-f]{6}$', 'slug: ' || s.slug);
  perform pg_temp.check(saved->>'path' = '/servicios/clases/' || s.slug, 'path');
  perform pg_temp.check(s.title = 'Clases de guitarra para principiantes', 'title folded');
  perform pg_temp.check(s.description = E'Clases de guitarra acústica y eléctrica.\n\nPara todas las edades, con material incluido y repertorio a tu gusto.', 'paragraphs kept');
  perform pg_temp.check(s.areas = array['Barranco', 'San Isidro', 'Surco'], 'areas deduplicated: ' || s.areas::text);
  perform pg_temp.check(s.whatsapp_phone = '51999996101', 'profile phone by default');
  perform pg_temp.check(s.skills = array['guitarra', 'teoria'] and s.modalities = array['en_linea', 'en_local'], 'arrays');
  perform pg_temp.check(s.store_id is null and s.provider_name = 'Prof. Ana Torres', 'particular provider');

  -- One service per category; the category never changes.
  perform pg_temp.expect_error($q$select public.save_service(null, pg_temp.lesson())$q$, 'SERVICE_CATEGORY_TAKEN');
  perform pg_temp.expect_error(format($q$select public.save_service(%L, pg_temp.lesson('{"category":"reparaciones"}'))$q$, pg_temp.id('s_lesson')), 'SERVICE_CATEGORY_FIXED');
  perform pg_temp.expect_error(format($q$select public.save_service(%L, pg_temp.lesson(), 99)$q$, pg_temp.id('s_lesson')), 'SERVICE_STALE');

  -- A second category for the same account: a recording studio.
  saved := public.save_service(null, pg_temp.lesson('{"category":"grabacion","title":"Grabación de voces y maquetas","price_from_pen":120,"price_unit":"cancion","modalities":["en_local"],"skills":[]}'));
  perform pg_temp.remember('s_rec', (saved->>'id')::uuid);
  -- A third one that is never approved.
  saved := public.save_service(null, pg_temp.lesson('{"category":"sonido","title":"Sonido para matrimonios y eventos","price_from_pen":900,"price_unit":"evento","modalities":["a_domicilio"],"skills":[]}'));
  perform pg_temp.remember('s_sound', (saved->>'id')::uuid);
end $$;

-- Someone else cannot edit, pause or delete it, nor read it as owner.
select pg_temp.as_user('stranger');
do $$ begin
  perform pg_temp.expect_error(format($q$select public.save_service(%L, pg_temp.lesson())$q$, pg_temp.id('s_lesson')), 'SERVICE_NOT_FOUND');
  perform pg_temp.expect_error(format($q$select public.delete_service(%L)$q$, pg_temp.id('s_lesson')), 'SERVICE_NOT_FOUND');
  perform pg_temp.expect_error(format($q$select public.set_service_paused(%L, true)$q$, pg_temp.id('s_lesson')), 'SERVICE_NOT_FOUND');
  perform pg_temp.check(public.get_my_service(pg_temp.id('s_lesson')) is null, 'not my service');
  perform pg_temp.check(public.get_my_services() = '[]'::jsonb, 'no services');
  -- Not public yet: no page, no directory entry.
  perform pg_temp.check(public.get_public_service('clases', (pg_temp.service(pg_temp.id('s_lesson'))).slug) is null, 'pending is not public');
  perform pg_temp.expect_error($q$select public.get_admin_service_counts()$q$, 'SERVICE_ADMIN_REQUIRED');
  perform pg_temp.expect_error($q$select public.get_admin_service_queue()$q$, 'SERVICE_ADMIN_REQUIRED');
end $$;

-- The owner previews it.
select pg_temp.as_user('prov');
do $$
declare page jsonb := public.get_public_service('clases', (pg_temp.service(pg_temp.id('s_lesson'))).slug);
begin
  perform pg_temp.check((page->>'preview')::boolean and (page->>'is_owner')::boolean, 'owner preview');
  perform pg_temp.check(jsonb_array_length(public.get_my_services()) = 3, 'my three services');
  perform pg_temp.expect_error(format($q$select public.set_service_paused(%L, true)$q$, pg_temp.id('s_lesson')), 'SERVICE_STATUS_INVALID');
end $$;

-- A store owner's service shows the store.
select pg_temp.as_user('owner');
do $$
declare saved jsonb; s public.services;
begin
  saved := public.save_service(null, jsonb_build_object(
    'category', 'reparaciones', 'title', 'Reparación y calibración de guitarras',
    'provider_name', 'Otro nombre que no se usa',
    'description', 'Calibración, cambio de trastes, electrónica y restauración de guitarras y bajos, con presupuesto sin compromiso.',
    'price_from_pen', 80, 'price_unit', 'trabajo', 'modalities', jsonb_build_array('en_local'),
    'skills', jsonb_build_array('guitarra', 'bajo', 'amplificadores'), 'city', 'Lima', 'areas', '[]'::jsonb));
  perform pg_temp.remember('s_store', (saved->>'id')::uuid);
  s := pg_temp.service((saved->>'id')::uuid);
  perform pg_temp.check(s.store_id = pg_temp.id('store') and s.provider_name = 'Taller Sonido Andino' and s.whatsapp_phone = '51999996104', 'store provider');
end $$;
reset role;

-- No listing was created or changed by any of this.
do $$ begin
  perform pg_temp.check((select count(*) from public.listings) = pg_temp.num('listings_before'), 'listings untouched');
end $$;

-- ------------------------------------------------------------------ Admin review

set local role authenticated;
select pg_temp.as_admin();
do $$
declare queue jsonb; v integer; result jsonb; page jsonb;
begin
  queue := public.get_admin_service_queue('pending');
  perform pg_temp.check((queue->>'total')::integer = 4 and (queue->'counts'->>'pending')::integer = 4, 'four pending');
  perform pg_temp.check(queue->'items'->0->>'owner_email' is not null, 'owner e-mail for Admin');
  perform pg_temp.check((public.get_admin_service_queue('pending', 'TALLER')->>'total')::integer = 1, 'search');

  -- Admin previews a pending service.
  page := public.get_public_service('clases', (pg_temp.service(pg_temp.id('s_lesson'))).slug);
  perform pg_temp.check((page->>'preview')::boolean and not (page->>'is_owner')::boolean, 'admin preview');

  v := (pg_temp.service(pg_temp.id('s_lesson'))).version;
  perform pg_temp.expect_error(format($q$select public.admin_review_service(%L, 'approve', null, null)$q$, pg_temp.id('s_lesson')), 'SERVICE_STALE');
  perform pg_temp.expect_error(format($q$select public.admin_review_service(%L, 'reject', ' ', %s)$q$, pg_temp.id('s_lesson'), v), 'SERVICE_REASON_REQUIRED');
  perform pg_temp.expect_error(format($q$select public.admin_review_service(%L, 'restore', null, %s)$q$, pg_temp.id('s_lesson'), v), 'SERVICE_STATUS_INVALID');
  perform pg_temp.expect_error(format($q$select public.admin_review_service(%L, 'publicar', null, %s)$q$, pg_temp.id('s_lesson'), v), 'SERVICE_DECISION_INVALID');

  result := public.admin_review_service(pg_temp.id('s_lesson'), 'approve', null, v);
  perform pg_temp.check(result->>'status' = 'approved', 'approved');
  result := public.admin_review_service(pg_temp.id('s_rec'), 'approve', null, (pg_temp.service(pg_temp.id('s_rec'))).version);
  result := public.admin_review_service(pg_temp.id('s_store'), 'approve', null, (pg_temp.service(pg_temp.id('s_store'))).version);
  result := public.admin_review_service(pg_temp.id('s_sound'), 'reject', 'Agrega qué equipos incluye el servicio.', (pg_temp.service(pg_temp.id('s_sound'))).version);
  perform pg_temp.check(result->>'status' = 'rejected', 'rejected');
end $$;
reset role;
do $$
declare s public.services := pg_temp.service(pg_temp.id('s_lesson'));
begin
  perform pg_temp.check(s.approved_at is not null and s.reviewed_by = pg_temp.id('admin'), 'approval recorded');
  perform pg_temp.check(pg_temp.notifications(pg_temp.id('prov'), 'service_approved') = 2, 'approval notices');
  perform pg_temp.check(pg_temp.notifications(pg_temp.id('prov'), 'service_rejected') = 1, 'rejection notice');
  perform pg_temp.check(pg_temp.delivery_context('service_approved:' || s.id || ':' || s.version)
    = jsonb_build_object('service_title', s.title, 'service_path', '/servicios/clases/' || s.slug), 'approval e-mail context');
  perform pg_temp.check(pg_temp.delivery_context('service_rejected:' || pg_temp.id('s_sound') || ':' || (pg_temp.service(pg_temp.id('s_sound'))).version)->>'reason'
    = 'Agrega qué equipos incluye el servicio.', 'rejection e-mail carries the reason');
  perform pg_temp.check((select count(*) from public.admin_audit_actions where target_type = 'service' and action in ('service_approve', 'service_reject')) = 4, 'audited');
  perform pg_temp.check((select service_id from public.notifications where user_id = pg_temp.id('prov') and event_type = 'service_rejected') = pg_temp.id('s_sound'), 'notice targets the service');
  -- A service notice must name its service.
  perform pg_temp.expect_error(format($q$insert into public.notifications(user_id, event_type, message) values (%L, 'service_approved', 'x')$q$, pg_temp.id('prov')), 'notifications_target_check');
end $$;

-- ------------------------------------------------------------------ rejected → edited → back to review; post-moderation

set local role authenticated;
select pg_temp.as_user('prov');
do $$
declare saved jsonb; s public.services;
begin
  perform pg_temp.check((public.get_my_service(pg_temp.id('s_sound'))->>'moderation_reason') = 'Agrega qué equipos incluye el servicio.', 'owner sees the reason');
  saved := public.save_service(pg_temp.id('s_sound'), pg_temp.lesson('{"category":"sonido","title":"Sonido para matrimonios y eventos","description":"Equipo de sonido con dos parlantes de 15 pulgadas, consola de 12 canales y técnico durante todo el evento.","price_from_pen":900,"price_unit":"evento","modalities":["a_domicilio"],"skills":[]}'),
    (pg_temp.service(pg_temp.id('s_sound'))).version);
  perform pg_temp.check(saved->>'status' = 'pending' and (pg_temp.service(pg_temp.id('s_sound'))).moderation_reason is null, 'back to review');

  -- An approved service: a price change applies with no new review; a new title stays public and goes to recheck.
  saved := public.save_service(pg_temp.id('s_lesson'), pg_temp.lesson(jsonb_build_object('price_from_pen', 45,
    'description', (pg_temp.service(pg_temp.id('s_lesson'))).description)));
  s := pg_temp.service(pg_temp.id('s_lesson'));
  perform pg_temp.check(s.status = 'approved' and not s.needs_recheck and s.price_from_pen = 45, 'price change, no recheck');
  saved := public.save_service(pg_temp.id('s_lesson'), pg_temp.lesson(jsonb_build_object('price_from_pen', 45,
    'description', (pg_temp.service(pg_temp.id('s_lesson'))).description, 'title', 'Clases de guitarra y teoría musical')));
  s := pg_temp.service(pg_temp.id('s_lesson'));
  perform pg_temp.check(s.status = 'approved' and s.needs_recheck and s.title = 'Clases de guitarra y teoría musical', 'title change, recheck');
  perform pg_temp.check(s.slug like 'clases-de-guitarra-para-principiantes-%', 'slug fixed at creation');
  -- Photos kept from before stay valid without re-checking storage.
  perform pg_temp.check(s.photo_paths = array['f5110000-0000-4000-8000-000000000001/f8110000-0000-4000-8000-000000000001.jpg'], 'photos kept when omitted');
end $$;
select pg_temp.as_admin();
do $$ begin
  perform pg_temp.check((public.get_admin_service_counts()->>'recheck')::integer = 1, 'one recheck');
  perform pg_temp.check(pg_temp.ids(public.get_admin_service_queue('recheck')) = array[pg_temp.id('s_lesson')], 'recheck queue');
  perform public.admin_review_service(pg_temp.id('s_lesson'), 'recheck_ok', null, (pg_temp.service(pg_temp.id('s_lesson'))).version);
  perform pg_temp.check(not (pg_temp.service(pg_temp.id('s_lesson'))).needs_recheck, 'recheck cleared');
end $$;

-- ------------------------------------------------------------------ the public directory and page

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare page jsonb; dir jsonb; counts jsonb;
begin
  dir := public.get_public_services();
  perform pg_temp.check((dir->>'total')::integer = 3, 'three public services: ' || (dir->>'total'));
  dir := public.get_public_services('{"category":"clases"}');
  perform pg_temp.check(pg_temp.ids(dir) = array[pg_temp.id('s_lesson')], 'by category');
  -- A place matches the service's city or one of its areas, accents and case aside.
  perform pg_temp.check(pg_temp.ids(public.get_public_services('{"city":"san isidro","category":"clases"}')) = array[pg_temp.id('s_lesson')], 'by area');
  perform pg_temp.check((public.get_public_services('{"city":"Arequipa"}')->>'total')::integer = 0, 'no Arequipa');
  perform pg_temp.check((public.get_public_services('{"modality":"en_linea"}')->>'total')::integer = 1, 'online');
  perform pg_temp.check(pg_temp.ids(public.get_public_services('{"skill":"amplificadores"}')) = array[pg_temp.id('s_store')], 'by skill');
  perform pg_temp.check(pg_temp.ids(public.get_public_services('{"sort":"precio"}')) = array[pg_temp.id('s_lesson'), pg_temp.id('s_store'), pg_temp.id('s_rec')], 'cheapest first');
  perform pg_temp.check((public.get_public_services('{}', 2, 2)->>'page')::integer = 2 and jsonb_array_length(public.get_public_services('{}', 2, 2)->'items') = 1, 'paging');
  counts := public.get_service_directory_counts();
  perform pg_temp.check((counts->>'total')::integer = 3 and (counts->'categories'->>'clases')::integer = 1 and counts->'categories'->>'sonido' is null, 'counts');
  perform pg_temp.check(counts->'cities'->0->>'city' = 'Lima', 'city counts');

  page := public.get_public_service('reparaciones', (pg_temp.service(pg_temp.id('s_store'))).slug);
  perform pg_temp.check(page->'provider'->>'kind' = 'verified' and page->'provider'->>'store_slug' = 'svc-taller', 'store provider on the page');
  perform pg_temp.check(not (page->>'preview')::boolean and page->>'whatsapp_phone' = '51999996104', 'public page');
  -- The URL needs the right category.
  perform pg_temp.check(public.get_public_service('clases', (pg_temp.service(pg_temp.id('s_store'))).slug) is null, 'wrong category');
  page := public.get_public_service('clases', (pg_temp.service(pg_temp.id('s_lesson'))).slug);
  perform pg_temp.check(jsonb_array_length(page->'other_services') = 1 and page->'other_services'->0->>'category' = 'grabacion', 'other services of the provider');
  perform pg_temp.check(page->'provider'->>'kind' = 'particular' and page->'provider'->>'name' = 'Prof. Ana Torres', 'particular provider on the page');
  perform pg_temp.check((page->'rating'->>'count')::integer = 0 and page->'rating'->>'average' is null, 'no reviews yet');
end $$;
reset role;

-- A store that is no longer active takes its services off the directory.
select set_config('app.allow_store_admin_fields', 'true', true);
update public.stores set status = 'hidden' where id = pg_temp.id('store');
set local role anon;
do $$ begin
  perform pg_temp.check((public.get_public_services()->>'total')::integer = 2, 'inactive store hidden');
  perform pg_temp.check(public.get_public_service('reparaciones', (pg_temp.service(pg_temp.id('s_store'))).slug) is null, 'inactive store page');
end $$;
reset role;
update public.stores set status = 'active' where id = pg_temp.id('store');
select set_config('app.allow_store_admin_fields', '', true);

-- ------------------------------------------------------------------ views and contacts (service role)

set local role authenticated;
select pg_temp.as_user('client');
do $$ begin
  perform pg_temp.expect_error(format($q$select public.record_service_event(gen_random_uuid(), %L, 'contact', %L, %L)$q$,
    pg_temp.id('s_lesson'), pg_temp.id('client'), pg_temp.id('session')), 'permission denied');
end $$;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare r jsonb; event uuid := gen_random_uuid();
begin
  r := public.record_service_event(event, pg_temp.id('s_lesson'), 'view', null, pg_temp.id('session'));
  perform pg_temp.check((r->>'recorded')::boolean, 'view recorded');
  r := public.record_service_event(event, pg_temp.id('s_lesson'), 'view', null, pg_temp.id('session'));
  perform pg_temp.check(r->>'reason' = 'duplicate', 'same event id once');
  r := public.record_service_event(gen_random_uuid(), pg_temp.id('s_lesson'), 'view', null, pg_temp.id('session'));
  perform pg_temp.check(r->>'reason' = 'recent', 'one view per 30 minutes');
  r := public.record_service_event(gen_random_uuid(), pg_temp.id('s_lesson'), 'view', pg_temp.id('prov'), pg_temp.id('session2'));
  perform pg_temp.check(r->>'reason' = 'owner', 'owner views never count');
  r := public.record_service_event(gen_random_uuid(), pg_temp.id('s_lesson'), 'contact', pg_temp.id('admin'), pg_temp.id('session2'));
  perform pg_temp.check(r->>'reason' = 'owner', 'admin contacts never count');
  r := public.record_service_event(gen_random_uuid(), pg_temp.id('s_sound'), 'contact', pg_temp.id('client'), pg_temp.id('session2'));
  perform pg_temp.check(r->>'reason' = 'unavailable', 'pending service records nothing');
  r := public.record_service_event(gen_random_uuid(), pg_temp.id('s_lesson'), 'contact', pg_temp.id('client'), pg_temp.id('session2'));
  perform pg_temp.check((r->>'recorded')::boolean, 'contact recorded');
  r := public.record_service_event(gen_random_uuid(), pg_temp.id('s_lesson'), 'contact', pg_temp.id('client'), pg_temp.id('session2'));
  perform pg_temp.check((r->>'recorded')::boolean, 'every press counts');
  -- client2 contacted the lesson service anonymously (no account): that contact cannot be confirmed later.
  r := public.record_service_event(gen_random_uuid(), pg_temp.id('s_lesson'), 'contact', null, pg_temp.id('session'));
  perform pg_temp.check((r->>'recorded')::boolean, 'anonymous contact recorded');
  perform pg_temp.check(pg_temp.events(pg_temp.id('s_lesson'), 'view') = 1 and pg_temp.events(pg_temp.id('s_lesson'), 'contact') = 3, 'event counts');
end $$;
reset role;
-- A daily cap on contacts per person and service.
insert into public.service_events(id, service_id, kind, actor_user_id, session_id)
select gen_random_uuid(), pg_temp.id('s_rec'), 'contact', pg_temp.id('stranger'), pg_temp.id('session') from generate_series(1, 20);
-- client2 wrote to the recording studio while signed in, but 200 days ago.
insert into public.service_events(id, service_id, kind, actor_user_id, session_id, created_at)
values (gen_random_uuid(), pg_temp.id('s_rec'), 'contact', pg_temp.id('client2'), pg_temp.id('session'), now() - interval '200 days');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ begin
  perform pg_temp.check(public.record_service_event(gen_random_uuid(), pg_temp.id('s_rec'), 'contact', pg_temp.id('stranger'), pg_temp.id('session'))->>'reason' = 'limit', 'contact cap');
end $$;
reset role;

-- ------------------------------------------------------------------ bookings: the client claims, the provider confirms

set local role authenticated;
select pg_temp.as_user('client2');
do $$
declare state jsonb := public.get_service_viewer_state(pg_temp.id('s_lesson'));
begin
  perform pg_temp.check((state->>'signed_in')::boolean and not (state->>'contacted')::boolean and not (state->>'can_claim')::boolean, 'no contact, no claim');
  perform pg_temp.expect_error(format($q$select public.claim_service_booking(%L)$q$, pg_temp.id('s_lesson')), 'SERVICE_CONTACT_REQUIRED');
  -- A contact older than 180 days does not count either.
  perform pg_temp.expect_error(format($q$select public.claim_service_booking(%L)$q$, pg_temp.id('s_rec')), 'SERVICE_CONTACT_REQUIRED');
end $$;

select pg_temp.as_user('prov');
do $$
declare candidates jsonb := public.get_service_booking_candidates(pg_temp.id('s_lesson'));
begin
  perform pg_temp.check(jsonb_array_length(candidates) = 1 and candidates->0->>'name' = 'rodrigo C.' and candidates->0->>'phone_tail' = '102', 'one candidate: ' || candidates::text);
  perform pg_temp.expect_error(format($q$select public.claim_service_booking(%L)$q$, pg_temp.id('s_lesson')), 'SERVICE_OWN_SERVICE');
  perform pg_temp.expect_error(format($q$select public.request_service_booking(%L, %L)$q$, pg_temp.id('s_lesson'), pg_temp.id('client2')), 'SERVICE_CONTACT_REQUIRED');
end $$;
select pg_temp.as_user('stranger');
do $$ begin
  perform pg_temp.expect_error(format($q$select public.get_service_booking_candidates(%L)$q$, pg_temp.id('s_lesson')), 'SERVICE_NOT_FOUND');
  perform pg_temp.expect_error(format($q$select public.request_service_booking(%L, %L)$q$, pg_temp.id('s_lesson'), pg_temp.id('client')), 'SERVICE_NOT_FOUND');
end $$;

select pg_temp.as_user('client');
do $$
declare state jsonb; result jsonb;
begin
  state := public.get_service_viewer_state(pg_temp.id('s_lesson'));
  perform pg_temp.check((state->>'contacted')::boolean and (state->>'can_claim')::boolean and not (state->>'can_review')::boolean, 'can claim');
  result := public.claim_service_booking(pg_temp.id('s_lesson'));
  perform pg_temp.remember('b1', (result->>'id')::uuid);
  perform pg_temp.check(result->>'status' = 'pending', 'claim pending');
  perform pg_temp.expect_error(format($q$select public.claim_service_booking(%L)$q$, pg_temp.id('s_lesson')), 'SERVICE_BOOKING_EXISTS');
  state := public.get_service_viewer_state(pg_temp.id('s_lesson'));
  perform pg_temp.check(not (state->>'can_claim')::boolean and state->'booking'->>'status' = 'pending', 'claim shown');
  -- The client cannot answer their own claim, nor review before it is confirmed.
  perform pg_temp.expect_error(format($q$select public.respond_service_booking(%L, true)$q$, pg_temp.id('b1')), 'SERVICE_BOOKING_FORBIDDEN');
  perform pg_temp.expect_error(format($q$select public.submit_service_review(%L, 5)$q$, pg_temp.id('b1')), 'SERVICE_REVIEW_LOCKED');
  perform pg_temp.check((public.get_my_service_bookings()->0->>'role') = 'client', 'client sees the booking');
end $$;
reset role;
do $$ begin
  perform pg_temp.check(pg_temp.notifications(pg_temp.id('prov'), 'service_booking_requested') = 1, 'provider told');
  perform pg_temp.check(pg_temp.delivery_context('service_booking:' || pg_temp.id('b1'))->>'service_path' = '/mi-cuenta/servicios#contrataciones', 'provider e-mail');
end $$;

set local role authenticated;
select pg_temp.as_user('prov');
do $$
declare result jsonb; mine jsonb;
begin
  -- The claimed client no longer shows as a candidate.
  perform pg_temp.check(public.get_service_booking_candidates(pg_temp.id('s_lesson')) = '[]'::jsonb, 'no candidates left');
  mine := public.get_my_service_bookings();
  perform pg_temp.check(mine->0->>'role' = 'provider' and mine->0->>'other_name' = 'rodrigo C.', 'provider sees the claim');
  perform pg_temp.expect_error(format($q$select public.cancel_service_booking(%L)$q$, pg_temp.id('b1')), 'SERVICE_BOOKING_FORBIDDEN');
  result := public.respond_service_booking(pg_temp.id('b1'), true);
  perform pg_temp.check(result->>'status' = 'confirmed' and result->>'review_deadline' is not null, 'confirmed');
  perform pg_temp.expect_error(format($q$select public.respond_service_booking(%L, false)$q$, pg_temp.id('b1')), 'SERVICE_BOOKING_ANSWERED');
  -- Confirmed clients make the service undeletable.
  perform pg_temp.check(not (public.get_my_services()->0->>'can_delete')::boolean, 'cannot delete with history');
  perform pg_temp.expect_error(format($q$select public.delete_service(%L)$q$, pg_temp.id('s_lesson')), 'SERVICE_HAS_HISTORY');
end $$;
reset role;
do $$ begin
  perform pg_temp.check(pg_temp.notifications(pg_temp.id('client'), 'service_booking_confirmed') = 1, 'client told');
  perform pg_temp.check(pg_temp.delivery_context('service_booking_confirmed:' || pg_temp.id('b1')) is not null, 'client e-mail');
end $$;

-- ------------------------------------------------------------------ reviews

set local role authenticated;
select pg_temp.as_user('client');
do $$
declare result jsonb; page jsonb;
begin
  perform pg_temp.check((public.get_service_viewer_state(pg_temp.id('s_lesson'))->>'can_review')::boolean, 'can review');
  perform pg_temp.expect_error(format($q$select public.submit_service_review(%L, 6)$q$, pg_temp.id('b1')), 'SERVICE_RATING_INVALID');
  perform pg_temp.expect_error(format($q$select public.submit_service_review(%L, 5, 'Escríbele al 987654321')$q$, pg_temp.id('b1')), 'SERVICE_CONTACT_DETAILS');
  perform pg_temp.expect_error(format($q$select public.submit_service_review(%L, 5, %L)$q$, pg_temp.id('b1'), repeat('a', 1001)), 'SERVICE_COMMENT_LENGTH');
  result := public.submit_service_review(pg_temp.id('b1'), 4, '  Muy paciente   y puntual. ');
  perform pg_temp.remember('r1', (result->>'id')::uuid);
  perform pg_temp.expect_error(format($q$select public.submit_service_review(%L, 5)$q$, pg_temp.id('b1')), 'SERVICE_REVIEW_EXISTS');
  page := public.get_public_service('clases', (pg_temp.service(pg_temp.id('s_lesson'))).slug);
  perform pg_temp.check((page->'rating'->>'count')::integer = 1 and (page->'rating'->>'average')::numeric = 4.0, 'rating');
  perform pg_temp.check(page->'reviews'->0->>'comment' = 'Muy paciente y puntual.' and page->'reviews'->0->>'reviewer_name' = 'rodrigo C.', 'review shown');
  perform pg_temp.check((page->'breakdown'->>'4')::integer = 1, 'breakdown');
  perform pg_temp.check(not (public.get_service_viewer_state(pg_temp.id('s_lesson'))->>'can_review')::boolean, 'reviewed once');
  -- Not their own review.
  perform pg_temp.expect_error(format($q$select public.submit_service_report('service_review', %L, 'spam')$q$, pg_temp.id('r1')), 'SERVICE_REPORT_TARGET_UNAVAILABLE');
end $$;
reset role;
do $$ begin
  perform pg_temp.check(pg_temp.notifications(pg_temp.id('prov'), 'service_review_received') = 1, 'provider told of the review');
end $$;
set local role anon;
do $$ begin
  perform pg_temp.check(public.get_service_reviews(pg_temp.id('s_lesson'))->'items'->0->>'id' = pg_temp.id('r1')::text, 'review page');
  perform pg_temp.check((pg_temp.ids(public.get_public_services('{"sort":"valorados"}')))[1] = pg_temp.id('s_lesson'), 'best rated first');
end $$;
reset role;

-- ------------------------------------------------------------------ bookings: the provider asks, the client declines; expiry

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.record_service_event(gen_random_uuid(), pg_temp.id('s_rec'), 'contact', pg_temp.id('client2'), pg_temp.id('session2'));
select public.record_service_event(gen_random_uuid(), pg_temp.id('s_rec'), 'contact', pg_temp.id('client'), pg_temp.id('session2'));
set local role authenticated;
select pg_temp.as_user('prov');
do $$
declare result jsonb;
begin
  result := public.request_service_booking(pg_temp.id('s_rec'), pg_temp.id('client2'));
  perform pg_temp.remember('b2', (result->>'id')::uuid);
  result := public.request_service_booking(pg_temp.id('s_rec'), pg_temp.id('client'));
  perform pg_temp.remember('b3', (result->>'id')::uuid);
  perform pg_temp.expect_error(format($q$select public.request_service_booking(%L, %L)$q$, pg_temp.id('s_rec'), pg_temp.id('client')), 'SERVICE_BOOKING_EXISTS');
end $$;
select pg_temp.as_user('client2');
do $$ begin
  perform pg_temp.expect_error(format($q$select public.cancel_service_booking(%L)$q$, pg_temp.id('b2')), 'SERVICE_BOOKING_FORBIDDEN');
  perform pg_temp.check((public.respond_service_booking(pg_temp.id('b2'), false))->>'status' = 'declined', 'declined');
  -- A "no" is final for the pair.
  perform pg_temp.expect_error(format($q$select public.claim_service_booking(%L)$q$, pg_temp.id('s_rec')), 'SERVICE_BOOKING_DECLINED');
  perform pg_temp.check(not (public.get_service_viewer_state(pg_temp.id('s_rec'))->>'can_claim')::boolean, 'no claim after a no');
end $$;
reset role;
do $$ begin
  perform pg_temp.check(pg_temp.notifications(pg_temp.id('prov'), 'service_booking_declined') = 1, 'provider told of the no');
  perform pg_temp.check(pg_temp.notifications(pg_temp.id('client2'), 'service_booking_requested') = 1, 'client2 was asked');
end $$;
-- The request to client is 31 days old: it lapses.
update public.service_bookings set created_at = now() - interval '31 days' where id = pg_temp.id('b3');
set local role authenticated;
select pg_temp.as_user('client');
do $$ begin
  perform pg_temp.check((select item->>'status' from jsonb_array_elements(public.get_my_service_bookings()) item where item->>'id' = pg_temp.id('b3')::text) = 'expired', 'reads as expired');
  perform pg_temp.expect_error(format($q$select public.respond_service_booking(%L, true)$q$, pg_temp.id('b3')), 'SERVICE_BOOKING_EXPIRED');
end $$;
-- After it lapsed the client may claim again (the old request is stored as expired), and withdraw the claim.
do $$
declare result jsonb := public.claim_service_booking(pg_temp.id('s_rec'));
begin
  perform pg_temp.check((public.cancel_service_booking((result->>'id')::uuid))->>'status' = 'cancelled', 'withdrawn');
end $$;
reset role;
do $$ begin
  perform pg_temp.check((pg_temp.booking(pg_temp.id('b3'))).status = 'expired', 'stored as expired');
end $$;

-- Past the 30-day window a confirmed client can no longer review.
update public.service_bookings set status = 'confirmed', responded_at = now(), confirmed_at = now() - interval '40 days', review_deadline = now() - interval '10 days'
where id = pg_temp.id('b3');
set local role authenticated;
select pg_temp.as_user('client');
do $$ begin
  perform pg_temp.expect_error(format($q$select public.submit_service_review(%L, 5)$q$, pg_temp.id('b3')), 'SERVICE_REVIEW_CLOSED');
end $$;

-- ------------------------------------------------------------------ reports and moderation

select pg_temp.as_user('prov');
do $$ begin
  perform pg_temp.expect_error(format($q$select public.submit_service_report('service', %L, 'spam')$q$, pg_temp.id('s_lesson')), 'SERVICE_REPORT_TARGET_UNAVAILABLE');
  perform pg_temp.remember('rep_review', public.submit_service_report('service_review', pg_temp.id('r1'), 'informacion_falsa', 'No fue mi alumno.'));
end $$;
select pg_temp.as_user('stranger');
do $$ begin
  perform pg_temp.expect_error(format($q$select public.submit_service_report('service', %L, 'otra_cosa')$q$, pg_temp.id('s_lesson')), 'SERVICE_REPORT_REASON_INVALID');
  perform pg_temp.expect_error(format($q$select public.submit_service_report('service', %L, 'spam')$q$, pg_temp.id('s_sound')), 'SERVICE_REPORT_TARGET_UNAVAILABLE');
  perform pg_temp.remember('rep_service', public.submit_service_report('service', pg_temp.id('s_lesson'), 'posible_estafa', null));
  perform pg_temp.expect_error(format($q$select public.submit_service_report('service', %L, 'spam')$q$, pg_temp.id('s_lesson')), 'SERVICE_REPORT_ALREADY_SUBMITTED');
  perform pg_temp.expect_error(format($q$select public.admin_close_service_report(%L, 'dismissed', 'No aplica')$q$, pg_temp.id('rep_service')), 'SERVICE_ADMIN_REQUIRED');
  perform pg_temp.expect_error(format($q$select public.admin_moderate_service_review(%L, 'hide', 'No aplica')$q$, pg_temp.id('r1')), 'SERVICE_ADMIN_REQUIRED');
end $$;

select pg_temp.as_admin();
do $$
declare queue jsonb;
begin
  queue := public.get_admin_service_queue('reports');
  perform pg_temp.check((queue->>'total')::integer = 2 and (queue->'counts'->>'reports')::integer = 2, 'two open reports');
  perform pg_temp.check(queue->'items'->0->>'target_type' = 'service_review' and queue->'items'->0->'review'->>'rating' = '4', 'review report first');
  perform pg_temp.expect_error(format($q$select public.admin_moderate_service_review(%L, 'hide', ' ')$q$, pg_temp.id('r1')), 'SERVICE_REASON_REQUIRED');
  perform public.admin_moderate_service_review(pg_temp.id('r1'), 'hide', 'El proveedor indica que no fue su cliente.');
  perform public.admin_close_service_report(pg_temp.id('rep_review'), 'resolved', 'Reseña oculta mientras se aclara.');
  perform pg_temp.expect_error(format($q$select public.admin_close_service_report(%L, 'resolved', 'Otra vez')$q$, pg_temp.id('rep_review')), 'SERVICE_REPORT_NOT_FOUND');
  perform pg_temp.check((public.get_admin_service_queue('reviews')->'items'->0->>'status') = 'hidden', 'reviews view shows hidden');

  -- Hiding the service.
  perform pg_temp.expect_error(format($q$select public.admin_review_service(%L, 'hide', null, %s)$q$, pg_temp.id('s_lesson'), (pg_temp.service(pg_temp.id('s_lesson'))).version), 'SERVICE_REASON_REQUIRED');
  perform public.admin_review_service(pg_temp.id('s_lesson'), 'hide', 'Reportado como posible estafa; en revisión.', (pg_temp.service(pg_temp.id('s_lesson'))).version);
  perform public.admin_close_service_report(pg_temp.id('rep_service'), 'resolved', 'Servicio oculto.');
end $$;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform pg_temp.check(public.get_public_service('clases', (pg_temp.service(pg_temp.id('s_lesson'))).slug) is null, 'hidden service gone');
  perform pg_temp.check(public.get_service_reviews(pg_temp.id('s_lesson'))->'items' = '[]'::jsonb, 'reviews of a hidden service gone');
end $$;
reset role;
do $$ begin
  perform pg_temp.check(pg_temp.notifications(pg_temp.id('prov'), 'service_hidden') = 1, 'hidden notice');
  perform pg_temp.check((select count(*) from public.admin_audit_actions where target_type = 'service_review' and action = 'service_review_hidden') = 1, 'review audit');
  perform pg_temp.check((select count(*) from public.admin_audit_actions where target_type = 'service_report') = 2, 'report audit');
end $$;
set local role authenticated;
select pg_temp.as_admin();
do $$ begin
  perform public.admin_review_service(pg_temp.id('s_lesson'), 'restore', null, (pg_temp.service(pg_temp.id('s_lesson'))).version);
  perform public.admin_moderate_service_review(pg_temp.id('r1'), 'restore', 'Se confirmó que fue su alumno.');
  perform pg_temp.check((pg_temp.service(pg_temp.id('s_lesson'))).status = 'approved' and (pg_temp.service(pg_temp.id('s_lesson'))).moderation_reason is null, 'restored');
end $$;

-- ------------------------------------------------------------------ pausing and deleting

select pg_temp.as_user('owner');
do $$
declare result jsonb;
begin
  result := public.set_service_paused(pg_temp.id('s_store'), true);
  perform pg_temp.check(result->>'status' = 'paused', 'paused');
  perform pg_temp.check(not (public.get_my_service(pg_temp.id('s_store'))->>'public')::boolean, 'paused is not public');
  perform pg_temp.expect_error(format($q$select public.set_service_paused(%L, true)$q$, pg_temp.id('s_store')), 'SERVICE_STATUS_INVALID');
  perform pg_temp.check((public.set_service_paused(pg_temp.id('s_store'), false))->>'status' = 'approved', 'resumed');
  -- No clients, no reviews: it can be deleted.
  perform pg_temp.check(public.delete_service(pg_temp.id('s_store')), 'deleted');
  perform pg_temp.check(public.get_my_services() = '[]'::jsonb, 'gone');
end $$;
reset role;

-- ------------------------------------------------------------------ photos bucket

do $$ begin
  perform pg_temp.check((select public from storage.buckets where id = 'service-photos') and (select file_size_limit from storage.buckets where id = 'service-photos') = 5242880, 'public 5 MB bucket');
end $$;
set local role authenticated;
select pg_temp.as_user('client');
insert into storage.objects(bucket_id, name, owner) values ('service-photos', 'f5110000-0000-4000-8000-000000000002/f8110000-0000-4000-8000-000000000003.jpg', 'f5110000-0000-4000-8000-000000000002');
do $$ begin
  perform pg_temp.expect_error($q$insert into storage.objects(bucket_id, name) values ('service-photos', 'f5110000-0000-4000-8000-000000000001/f8110000-0000-4000-8000-000000000004.jpg')$q$, 'row-level security');
  perform pg_temp.expect_error($q$insert into storage.objects(bucket_id, name) values ('service-photos', 'f5110000-0000-4000-8000-000000000002/sub/f8110000-0000-4000-8000-000000000004.jpg')$q$, 'row-level security');
  perform pg_temp.expect_error($q$insert into storage.objects(bucket_id, name) values ('service-photos', 'f5110000-0000-4000-8000-000000000002/foto.gif')$q$, 'row-level security');
  -- The folder listing is the owner's alone.
  perform pg_temp.check((select count(*) from storage.objects where bucket_id = 'service-photos') = 1, 'own folder only');
end $$;
-- An unused photo of one's own can be removed; another account's cannot.
with removed as (delete from storage.objects where bucket_id = 'service-photos' returning name)
select pg_temp.remember_num('client_removed', (select count(*) from removed)::integer);
reset role;
set local role authenticated;
select pg_temp.as_user('prov');
-- A photo a service still shows stays.
with removed as (delete from storage.objects where bucket_id = 'service-photos'
  and name = 'f5110000-0000-4000-8000-000000000001/f8110000-0000-4000-8000-000000000001.jpg' returning name)
select pg_temp.remember_num('used_removed', (select count(*) from removed)::integer);
reset role;
do $$ begin
  perform pg_temp.check(pg_temp.num('client_removed') = 1, 'own unused photo removed');
  perform pg_temp.check(pg_temp.num('used_removed') = 0, 'photo in use kept');
  perform pg_temp.check(exists (select 1 from storage.objects where name = 'f5110000-0000-4000-8000-000000000005/f8110000-0000-4000-8000-000000000002.jpg'), 'other account photo kept');
end $$;

rollback;
