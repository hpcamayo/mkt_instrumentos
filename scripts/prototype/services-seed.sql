-- Feature ideas, services batch (bet-02): demo data for "Servicios para músicos", for a LOCAL database only.
-- Run after scripts/prototype/demo-seed.sql (it reuses its accounts and store):
--   psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -f scripts/prototype/services-seed.sql
-- Password for the two new accounts: laria-demo-2026, as in the demo seed.
--
--   particular@laria.test     guitar and singing lessons (approved, two reviews) and a confirmation to answer
--   demo-tienda@laria.test    the store's repair shop (approved, verified store) asking a client to confirm
--   estudio@laria.test        a rehearsal room (approved) and a recording studio (approved, edits waiting for Admin)
--   sonido@laria.test         sound for events, waiting for Admin
--   comprador@laria.test      client: a confirmed lesson to review, a store request to answer, an open report
--   admin@laria.test          Admin › Servicios: one new service, one with changes, one report

\set ON_ERROR_STOP 1
begin;

do $$ begin
  if (select count(*) from auth.users) > 300 then
    raise exception 'services-seed.sql is for a local database only';
  end if;
  if not exists (select 1 from auth.users where email = 'particular@laria.test') then
    raise exception 'Load scripts/prototype/demo-seed.sql first';
  end if;
end $$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, created_at, updated_at)
values
 ('00000000-0000-0000-0000-000000000000','d0000000-0000-4000-8000-000000000071','authenticated','authenticated','estudio@laria.test',
  extensions.crypt('laria-demo-2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
  '{"account_type":"seller","full_name":"Martín Estudio","phone":"51999000171","city":"Lima","region":"Lima"}', '', '', now(), now()),
 ('00000000-0000-0000-0000-000000000000','d0000000-0000-4000-8000-000000000072','authenticated','authenticated','sonido@laria.test',
  extensions.crypt('laria-demo-2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
  '{"account_type":"seller","full_name":"Paola Sonido","phone":"51999000172","city":"Arequipa","region":"Arequipa"}', '', '', now(), now())
on conflict (id) do nothing;

do $gotrue$
declare col text;
begin
  foreach col in array array['email_change', 'email_change_token_new', 'email_change_token_current', 'phone_change',
                             'phone_change_token', 'reauthentication_token'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = col) then
      execute format('update auth.users set %I = coalesce(%I, %L) where email like %L', col, col, '', '%@laria.test');
    end if;
  end loop;
  if to_regclass('auth.identities') is not null then
    execute $q$
      insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
      select gen_random_uuid(), u.id, u.id::text, 'email',
             jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
      from auth.users u
      where u.email in ('estudio@laria.test', 'sonido@laria.test')
        and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email')
    $q$;
  end if;
end
$gotrue$;

-- ------------------------------------------------------------------ services
insert into public.services (id, owner_user_id, store_id, category, slug, title, provider_name, description,
  price_from_pen, price_unit, modalities, skills, city, region, district, areas, whatsapp_phone, status,
  needs_recheck, approved_at, reviewed_at, created_at, updated_at)
select v.id, v.owner, v.store, v.category, laria_private.service_slug(v.title, v.id), v.title, v.provider, v.description,
  v.price, v.unit, v.modalities, v.skills, v.city, v.region, v.district, v.areas, v.phone, v.status,
  v.recheck, case when v.status = 'approved' then now() - v.age end, case when v.status = 'approved' then now() - v.age end,
  now() - v.age - interval '2 days', now() - v.age
from (values
  ('d7000000-0000-4000-8000-000000000001'::uuid, 'd0000000-0000-4000-8000-000000000004'::uuid, null::uuid, 'clases',
   'Clases de guitarra y canto para todas las edades', 'Lucía Particular',
   E'Clases personalizadas de guitarra acústica y eléctrica, y de canto. Trabajamos con las canciones que te gustan, desde los primeros acordes hasta tocar con otros.\n\nPara niños desde 8 años, jóvenes y adultos. Primera clase para conocernos y armar un plan.',
   60, 'clase', array['a_domicilio', 'en_linea'], array['guitarra', 'canto', 'teoria'], 'Lima', 'Lima', 'Miraflores',
   array['Miraflores', 'Barranco', 'San Isidro', 'Surquillo'], '51999000104', 'approved', false, interval '20 days'),
  ('d7000000-0000-4000-8000-000000000002'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid, 'd1000000-0000-4000-8000-000000000001'::uuid, 'reparaciones',
   'Taller de luthería, calibración y reparación de amplificadores', 'Laria Demo Música',
   E'Calibramos guitarras y bajos (altura de cuerdas, alma, octavas), cambiamos trastes y cejuelas, y revisamos amplificadores de tubos y transistores.\n\nDiagnóstico en el taller; te damos el presupuesto antes de empezar.',
   80, 'trabajo', array['en_local'], array['guitarra', 'bajo', 'amplificadores', 'pedales'], 'Lima', 'Lima', 'Miraflores',
   array[]::text[], '51999000101', 'approved', false, interval '12 days'),
  ('d7000000-0000-4000-8000-000000000003'::uuid, 'd0000000-0000-4000-8000-000000000071'::uuid, null::uuid, 'ensayo',
   'Sala de ensayo con batería y backline completo', 'Estudio Kallpa',
   E'Sala acondicionada de 20 m² con batería completa, dos amplificadores de guitarra, uno de bajo, consola y micrófonos para voces. Aire acondicionado.\n\nAbierta de lunes a domingo, de 10 a 22 horas.',
   35, 'hora', array['en_local'], array[]::text[], 'Lima', 'Lima', 'Surco',
   array[]::text[], '51999000171', 'approved', false, interval '8 days'),
  ('d7000000-0000-4000-8000-000000000004'::uuid, 'd0000000-0000-4000-8000-000000000071'::uuid, null::uuid, 'grabacion',
   'Grabación, mezcla y masterización de tu canción', 'Estudio Kallpa',
   E'Grabamos bandas en vivo o por pistas, voces e instrumentos acústicos. Mezcla y masterización listas para plataformas.\n\nTambién mezclamos en línea las pistas que grabaste en casa.',
   250, 'cancion', array['en_local', 'en_linea'], array[]::text[], 'Lima', 'Lima', 'Surco',
   array[]::text[], '51999000171', 'approved', true, interval '6 days'),
  ('d7000000-0000-4000-8000-000000000005'::uuid, 'd0000000-0000-4000-8000-000000000072'::uuid, null::uuid, 'sonido',
   'Sonido e iluminación para conciertos y eventos', 'Paola Sonido',
   E'Equipo de sonido para eventos de hasta 300 personas: parlantes, monitores, consola digital y técnico de sonido. Iluminación básica a pedido.\n\nCotizamos según el lugar y la duración.',
   600, 'evento', array['a_domicilio'], array[]::text[], 'Arequipa', 'Arequipa', null,
   array['Arequipa', 'Cayma', 'Yanahuara'], '51999000172', 'pending', false, interval '1 day')
) as v(id, owner, store, category, title, provider, description, price, unit, modalities, skills, city, region, district, areas, phone, status, recheck, age)
on conflict (id) do nothing;

-- ------------------------------------------------------------------ contacts, confirmations and reviews
-- The buyer wrote to the lessons and the store's workshop with the button; the admin and the studio wrote to the lessons.
insert into public.service_events (id, service_id, kind, actor_user_id, session_id, created_at)
select gen_random_uuid(), e.service_id, e.kind, e.actor, gen_random_uuid(), now() - e.age
from (values
  ('d7000000-0000-4000-8000-000000000001'::uuid, 'contact', 'd0000000-0000-4000-8000-000000000003'::uuid, interval '18 days'),
  ('d7000000-0000-4000-8000-000000000001'::uuid, 'contact', 'd0000000-0000-4000-8000-000000000071'::uuid, interval '15 days'),
  ('d7000000-0000-4000-8000-000000000002'::uuid, 'contact', 'd0000000-0000-4000-8000-000000000003'::uuid, interval '5 days'),
  ('d7000000-0000-4000-8000-000000000001'::uuid, 'view', null, interval '3 days'),
  ('d7000000-0000-4000-8000-000000000001'::uuid, 'view', null, interval '2 days'),
  ('d7000000-0000-4000-8000-000000000003'::uuid, 'view', null, interval '1 day')
) as e(service_id, kind, actor, age)
where not exists (select 1 from public.service_events where service_id = 'd7000000-0000-4000-8000-000000000001');

insert into public.service_bookings (id, service_id, provider_user_id, client_user_id, requested_by, status, created_at,
  responded_at, confirmed_at, review_deadline)
values
  -- The studio's lesson: confirmed and reviewed.
  ('d7100000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004',
   'd0000000-0000-4000-8000-000000000071', 'provider', 'confirmed', now() - interval '14 days', now() - interval '13 days',
   now() - interval '13 days', now() + interval '17 days'),
  -- The buyer's lesson: confirmed, the review is still to write.
  ('d7100000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004',
   'd0000000-0000-4000-8000-000000000003', 'client', 'confirmed', now() - interval '10 days', now() - interval '9 days',
   now() - interval '9 days', now() + interval '21 days'),
  -- The store asks the buyer to confirm the repair.
  ('d7100000-0000-4000-8000-000000000003', 'd7000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000003', 'provider', 'pending', now() - interval '1 day', null, null, null)
on conflict (id) do nothing;

insert into public.service_reviews (id, booking_id, service_id, client_user_id, rating, comment, created_at)
values ('d7200000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000071', 5, 'Muy paciente y ordenada. En un mes ya tocaba mis primeras canciones.', now() - interval '12 days')
on conflict (id) do nothing;

-- An open report for Admin › Servicios › Reportes.
insert into public.service_reports (id, reporter_user_id, target_type, service_id, reason, detail, created_at)
values ('d7300000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'service',
  'd7000000-0000-4000-8000-000000000003', 'informacion_falsa', 'Las fotos no corresponden a la sala.', now() - interval '2 hours')
on conflict (id) do nothing;

commit;
