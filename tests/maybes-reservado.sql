-- Effortless Laria maybes, talk-06 "Reservado" (docs/ux-effortless/maybes-reservado.md,
-- supabase/migrations/20261120100000_ux_maybes_reservado.sql): who can reserve what and for how long, what the public
-- reads, "Avísame si se libera", the job that ends periods, asks the seller and releases the listing, the seller's
-- answers, the cached pages, account anonymization, the e-mail rules and the grants. Local/test database only. Every
-- fixture is rolled back.
begin;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;
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
create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
-- How many changes of the cached pages were recorded after a mark.
create function pg_temp.page_changes_since(p_mark bigint) returns bigint language sql security definer as $$
  select count(*) from laria_private.public_page_changes where id > p_mark
$$;
create function pg_temp.page_mark() returns bigint language sql security definer as $$
  select coalesce(max(id), 0) from laria_private.public_page_changes
$$;
create function pg_temp.notices(p_user uuid, p_type text) returns bigint language sql security definer as $$
  select count(*) from public.notifications where user_id = p_user and event_type = p_type
$$;
create function pg_temp.emails(p_user uuid, p_type text) returns bigint language sql security definer as $$
  select count(*) from laria_private.marketplace_email_deliveries where recipient_user_id = p_user and event_type = p_type
$$;
-- Moves a listing's period back in time, as if it had been set days ago.
create function pg_temp.age_period(p_listing uuid, p_until interval, p_ended interval default null) returns void
language sql security definer as $$
  update public.listing_reservations
  set reserved_at = now() - p_until - interval '1 day', reserved_until = now() - p_until,
      ended_at = case when p_ended is null then null else now() - p_ended end
  where listing_id = p_listing
$$;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e1800000-0000-4000-8000-000000000001','authenticated','authenticated','mres-seller@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Vendedora Reserva","phone":"51999998001","city":"Lima","region":"Lima"}'),
 ('e1800000-0000-4000-8000-000000000002','authenticated','authenticated','mres-buyer@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Comprador Uno","phone":"51999998002","city":"Lima","region":"Lima"}'),
 ('e1800000-0000-4000-8000-000000000003','authenticated','authenticated','mres-buyer2@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Compradora Dos","phone":"51999998003","city":"Lima","region":"Lima"}'),
 ('e1800000-0000-4000-8000-000000000004','authenticated','authenticated','mres-store@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Tienda","phone":"51999998004","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('e1801000-0000-4000-8000-000000000001','mres-tienda','Tienda Reserva','Tienda Reserva SAC','20999998001','mres@example.invalid','Contacto','Contacto','51999998004','Lima','Lima','Av. QA 1','e1800000-0000-4000-8000-000000000004','active','free',true);

select set_config('app.allow_listing_admin_fields', 'true', true);
insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at) values
 ('e1802000-0000-4000-8000-000000000001','mres-uno','Guitarra reservada','individual','approved','guitars','electric_guitar','QA','Uno','Usado - buen estado',2000,'Lima','Lima','Vendedora Reserva','51999998001','Descripción válida con más de cuarenta caracteres para la prueba.','e1800000-0000-4000-8000-000000000001',null,'self_service',now()),
 ('e1802000-0000-4000-8000-000000000002','mres-dos','Bajo reservado','individual','approved','basses','bass','QA','Dos','Usado - buen estado',1500,'Lima','Lima','Vendedora Reserva','51999998001','Descripción válida con más de cuarenta caracteres para la prueba.','e1800000-0000-4000-8000-000000000001',null,'self_service',now()),
 ('e1802000-0000-4000-8000-000000000003','mres-pendiente','Pedal pendiente','individual','pending','pedals','pedals','QA','Tres','Nuevo',300,'Lima','Lima','Vendedora Reserva','51999998001','Descripción válida con más de cuarenta caracteres para la prueba.','e1800000-0000-4000-8000-000000000001',null,'self_service',now()),
 ('e1802000-0000-4000-8000-000000000004','mres-tienda-pedal','Pedal de tienda','store','approved','pedals','pedals','QA','Cuatro','Nuevo',300,'Lima','Lima','Contacto','51999998004','Descripción válida con más de cuarenta caracteres para la prueba.','e1800000-0000-4000-8000-000000000004','e1801000-0000-4000-8000-000000000001','self_service',now()),
 ('e1802000-0000-4000-8000-000000000005','mres-tres','Teclado reservado','individual','approved','keyboards','keyboards','QA','Cinco','Usado - buen estado',900,'Lima','Lima','Vendedora Reserva','51999998001','Descripción válida con más de cuarenta caracteres para la prueba.','e1800000-0000-4000-8000-000000000001',null,'self_service',now());
select set_config('app.allow_listing_admin_fields', '', true);

insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/' || l.slug || '-' || n || '.jpg', n
from public.listings l cross join generate_series(0, 1) n where l.slug like 'mres-%';

-- ---------------------------------------------------------------- what an API role can reach

select pg_temp.check((select relrowsecurity from pg_class where oid = 'public.listing_reservations'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.listing_release_watches'::regclass), 'RLS is on for both tables');
select pg_temp.check(not has_table_privilege('anon', 'public.listing_reservations', 'select')
  and not has_table_privilege('authenticated', 'public.listing_reservations', 'select')
  and not has_table_privilege('authenticated', 'public.listing_reservations', 'insert')
  and not has_table_privilege('anon', 'public.listing_release_watches', 'select')
  and not has_table_privilege('authenticated', 'public.listing_release_watches', 'select')
  and not has_table_privilege('authenticated', 'public.listing_release_watches', 'insert'),
  'no API role reads or writes the tables directly');
select pg_temp.check(has_function_privilege('anon', 'public.get_reserved_listings(uuid[])', 'execute')
  and has_function_privilege('authenticated', 'public.get_reserved_listings(uuid[])', 'execute'), 'anyone reads the running periods');
select pg_temp.check(not has_function_privilege('anon', 'public.set_listing_reservation(uuid, integer)', 'execute')
  and not has_function_privilege('anon', 'public.end_listing_reservation(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.get_my_listing_reservations()', 'execute')
  and not has_function_privilege('anon', 'public.set_listing_release_watch(uuid, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.get_listing_release_watch(uuid)', 'execute'),
  'a visitor calls none of the account functions');
select pg_temp.check(has_function_privilege('authenticated', 'public.set_listing_reservation(uuid, integer)', 'execute')
  and has_function_privilege('authenticated', 'public.end_listing_reservation(uuid, text)', 'execute')
  and has_function_privilege('authenticated', 'public.get_my_listing_reservations()', 'execute')
  and has_function_privilege('authenticated', 'public.set_listing_release_watch(uuid, boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.get_listing_release_watch(uuid)', 'execute'),
  'a signed-in account calls them');
select pg_temp.check(not has_function_privilege('authenticated', 'laria_private.run_listing_reservations()', 'execute')
  and not has_function_privilege('authenticated', 'laria_private.tell_release_watchers(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'laria_private.mark_reservation_page_changes()', 'execute')
  and not has_function_privilege('authenticated', 'laria_private.forget_release_watches_on_anonymization()', 'execute')
  and not has_function_privilege('anon', 'laria_private.run_listing_reservations()', 'execute'),
  'the job and its helpers stay private');
select pg_temp.check(exists (select 1 from cron.job where jobname = 'listing-reservations' and schedule = '* * * * *'
  and command = 'select laria_private.run_listing_reservations()'), 'the job runs every minute');

-- ---------------------------------------------------------------- reserving

select pg_temp.as_user('e1800000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.expect_error($$select public.set_listing_reservation('e1802000-0000-4000-8000-000000000001', 4)$$, 'RESERVATION_DAYS_INVALID');
select pg_temp.expect_error($$select public.set_listing_reservation('e1802000-0000-4000-8000-000000000001', 0)$$, 'RESERVATION_DAYS_INVALID');
select pg_temp.expect_error($$select public.set_listing_reservation('e1802000-0000-4000-8000-000000000001', null)$$, 'RESERVATION_DAYS_INVALID');
select pg_temp.expect_error($$select public.set_listing_reservation('e1802000-0000-4000-8000-000000000003', 2)$$, 'RESERVATION_NOT_PUBLISHED');
select pg_temp.expect_error($$select public.set_listing_reservation('e1802000-0000-4000-8000-000000000004', 2)$$, 'RESERVATION_NOT_OWNED');
select pg_temp.expect_error($$select * from public.listing_reservations$$, 'permission denied');
reset role;

create temp table mark_one on commit drop as select pg_temp.page_mark() as mark;
set local role authenticated;
select pg_temp.check(public.set_listing_reservation('e1802000-0000-4000-8000-000000000001', 2) = now() + interval '2 days',
  'two days from now');
select pg_temp.check(public.set_listing_reservation('e1802000-0000-4000-8000-000000000002', 5) = now() + interval '5 days',
  'five days at most');
reset role;
select pg_temp.check(pg_temp.page_changes_since((select mark from mark_one)) = 2, 'each new period of a shown listing changes the cached pages');

-- A store holds units through Inventario, not here.
select pg_temp.as_user('e1800000-0000-4000-8000-000000000004');
set local role authenticated;
select pg_temp.expect_error($$select public.set_listing_reservation('e1802000-0000-4000-8000-000000000004', 1)$$, 'RESERVATION_STORE_LISTING');
reset role;
-- Another account can't reserve or end someone else's listing.
select pg_temp.as_user('e1800000-0000-4000-8000-000000000002');
set local role authenticated;
select pg_temp.expect_error($$select public.set_listing_reservation('e1802000-0000-4000-8000-000000000001', 1)$$, 'RESERVATION_NOT_OWNED');
select pg_temp.expect_error($$select public.end_listing_reservation('e1802000-0000-4000-8000-000000000001', 'available')$$, 'RESERVATION_NOT_OWNED');
select pg_temp.check((select count(*) from public.get_my_listing_reservations()) = 0, 'a buyer has no periods of their own');
reset role;
set local role anon;
select pg_temp.expect_error($$select public.set_listing_reservation('e1802000-0000-4000-8000-000000000001', 1)$$, 'permission denied');
reset role;
-- A server call without a signed-in account.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select pg_temp.expect_error($$select public.set_listing_reservation('e1802000-0000-4000-8000-000000000001', 1)$$, 'RESERVATION_AUTH_REQUIRED');
select pg_temp.expect_error($$select public.end_listing_reservation('e1802000-0000-4000-8000-000000000001', 'available')$$, 'RESERVATION_AUTH_REQUIRED');
select pg_temp.expect_error($$select public.set_listing_release_watch('e1802000-0000-4000-8000-000000000001', true)$$, 'RELEASE_WATCH_AUTH_REQUIRED');
select pg_temp.check(not public.get_listing_release_watch('e1802000-0000-4000-8000-000000000001'), 'nobody signed in, nothing read');
reset role;

-- ---------------------------------------------------------------- what the public reads

set local role anon;
select pg_temp.check((select array_agg(listing_id order by listing_id) from public.get_reserved_listings(array[
    'e1802000-0000-4000-8000-000000000001', 'e1802000-0000-4000-8000-000000000002', 'e1802000-0000-4000-8000-000000000003',
    'e1802000-0000-4000-8000-000000000004', 'e1802000-0000-4000-8000-000000000005']::uuid[]))
  = array['e1802000-0000-4000-8000-000000000001', 'e1802000-0000-4000-8000-000000000002']::uuid[],
  'a visitor reads the two running periods among the ids');
select pg_temp.check((select reserved_until from public.get_reserved_listings(array['e1802000-0000-4000-8000-000000000001']::uuid[]))
  = now() + interval '2 days', 'with their end');
select pg_temp.check((select count(*) from public.get_reserved_listings(null)) = 0
  and (select count(*) from public.get_reserved_listings('{}')) = 0, 'no ids, no rows');
-- Only the first 200 ids are read.
select pg_temp.check((select count(*) from public.get_reserved_listings(
    array(select gen_random_uuid() from generate_series(1, 200)) || 'e1802000-0000-4000-8000-000000000001'::uuid)) = 0,
  'an id past the 200th is not read');
reset role;

-- ---------------------------------------------------------------- "Avísame si se libera"

select pg_temp.as_user('e1800000-0000-4000-8000-000000000002');
set local role authenticated;
select pg_temp.check(public.set_listing_release_watch('e1802000-0000-4000-8000-000000000001', true), 'a buyer asks to hear when it is free');
select pg_temp.check(public.set_listing_release_watch('e1802000-0000-4000-8000-000000000001', true), 'asking twice is harmless');
select pg_temp.check(public.get_listing_release_watch('e1802000-0000-4000-8000-000000000001'), 'the buyer sees their own request');
select pg_temp.check(public.set_listing_release_watch('e1802000-0000-4000-8000-000000000002', true), 'and on the second listing');
select pg_temp.check(not public.set_listing_release_watch('e1802000-0000-4000-8000-000000000002', false), 'and can take it back');
select pg_temp.check(not public.get_listing_release_watch('e1802000-0000-4000-8000-000000000002'), 'and then reads it gone');
select pg_temp.check(public.set_listing_release_watch('e1802000-0000-4000-8000-000000000002', true), 'and ask again');
select pg_temp.expect_error($$select public.set_listing_release_watch('e1802000-0000-4000-8000-000000000005', true)$$, 'RELEASE_WATCH_UNAVAILABLE');
select pg_temp.expect_error($$select public.set_listing_release_watch('e1802000-0000-4000-8000-000000000003', true)$$, 'RELEASE_WATCH_UNAVAILABLE');
select pg_temp.expect_error($$select * from public.listing_release_watches$$, 'permission denied');
reset role;
select pg_temp.as_user('e1800000-0000-4000-8000-000000000003');
set local role authenticated;
select pg_temp.check(public.set_listing_release_watch('e1802000-0000-4000-8000-000000000001', true), 'a second buyer waits too');
select pg_temp.check(not public.get_listing_release_watch('e1802000-0000-4000-8000-000000000005'), 'nothing asked, nothing read');
reset role;
select pg_temp.as_user('e1800000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.expect_error($$select public.set_listing_release_watch('e1802000-0000-4000-8000-000000000001', true)$$, 'RELEASE_WATCH_OWN_LISTING');
select pg_temp.check((select watchers from public.get_my_listing_reservations() where listing_id = 'e1802000-0000-4000-8000-000000000001') = 2,
  'the seller sees how many people wait');
select pg_temp.check((select count(*) from public.get_my_listing_reservations()) = 2
  and (select bool_and(ended_at is null) from public.get_my_listing_reservations()), 'the seller sees both running periods');
reset role;
set local role anon;
select pg_temp.expect_error($$select public.set_listing_release_watch('e1802000-0000-4000-8000-000000000001', true)$$, 'permission denied');
reset role;

-- Changing a period keeps the people waiting and records the new end.
create temp table mark_two on commit drop as select pg_temp.page_mark() as mark;
select pg_temp.as_user('e1800000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.check(public.set_listing_reservation('e1802000-0000-4000-8000-000000000001', 3) = now() + interval '3 days', 'a new end');
reset role;
select pg_temp.check(pg_temp.page_changes_since((select mark from mark_two)) = 1, 'a changed end changes the cached pages');
select pg_temp.check((select count(*) from public.listing_release_watches where listing_id = 'e1802000-0000-4000-8000-000000000001') = 2,
  'the people waiting keep waiting');

-- ---------------------------------------------------------------- the end of a period

-- The first period ran out an hour ago; the job hasn't run since.
select pg_temp.age_period('e1802000-0000-4000-8000-000000000001', interval '1 hour');
set local role anon;
select pg_temp.check((select count(*) from public.get_reserved_listings(array['e1802000-0000-4000-8000-000000000001']::uuid[])) = 0,
  'a period that ran out shows no badge even before the job runs');
reset role;
select pg_temp.as_user('e1800000-0000-4000-8000-000000000002');
set local role authenticated;
select pg_temp.expect_error($$select public.set_listing_release_watch('e1802000-0000-4000-8000-000000000001', true)$$, 'RELEASE_WATCH_UNAVAILABLE');
reset role;

create temp table mark_three on commit drop as select pg_temp.page_mark() as mark;
create temp table run_one on commit drop as select laria_private.run_listing_reservations() as result;
select pg_temp.check((select result from run_one) = '{"asked": 1, "closed": 0, "released": 0}'::jsonb, 'the job asks about the one period that ended');
select pg_temp.check((select ended_at = now() from public.listing_reservations where listing_id = 'e1802000-0000-4000-8000-000000000001'),
  'the period is marked ended');
select pg_temp.check(pg_temp.page_changes_since((select mark from mark_three)) = 1, 'the end changes the cached pages');
select pg_temp.check(pg_temp.notices('e1800000-0000-4000-8000-000000000001', 'listing_reservation_ended') = 1
  and pg_temp.emails('e1800000-0000-4000-8000-000000000001', 'listing_reservation_ended') = 1, 'the seller is asked, in the app and by e-mail');
select pg_temp.check((select message from public.notifications where user_id = 'e1800000-0000-4000-8000-000000000001'
    and event_type = 'listing_reservation_ended') = '¿Se vendió «Guitarra reservada»? Terminó la reserva: respóndelo en un toque desde tu cuenta.',
  'the question names the listing');
select pg_temp.check(pg_temp.notices('e1800000-0000-4000-8000-000000000002', 'listing_released') = 0, 'nobody waiting is told yet');
select pg_temp.check((select laria_private.run_listing_reservations()) = '{"asked": 0, "closed": 0, "released": 0}'::jsonb, 'a second run asks nothing');
select pg_temp.check(pg_temp.notices('e1800000-0000-4000-8000-000000000001', 'listing_reservation_ended') = 1, 'the seller is asked once per period');

select pg_temp.as_user('e1800000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.check((select ended_at is not null and watchers = 2 from public.get_my_listing_reservations()
  where listing_id = 'e1802000-0000-4000-8000-000000000001'), 'the seller sees the question waiting, with two people');
reset role;

-- 24 hours after the end with no answer: released, and both people waiting hear it once.
select pg_temp.age_period('e1802000-0000-4000-8000-000000000001', interval '25 hours', interval '24 hours');
create temp table mark_four on commit drop as select pg_temp.page_mark() as mark;
select pg_temp.check((select laria_private.run_listing_reservations()) = '{"asked": 0, "closed": 0, "released": 2}'::jsonb, 'released after 24 hours');
select pg_temp.check(not exists (select 1 from public.listing_reservations where listing_id = 'e1802000-0000-4000-8000-000000000001'),
  'the period is closed');
select pg_temp.check(not exists (select 1 from public.listing_release_watches where listing_id = 'e1802000-0000-4000-8000-000000000001'),
  'the requests end with the notice');
select pg_temp.check(pg_temp.notices('e1800000-0000-4000-8000-000000000002', 'listing_released') = 1
  and pg_temp.emails('e1800000-0000-4000-8000-000000000002', 'listing_released') = 1
  and pg_temp.notices('e1800000-0000-4000-8000-000000000003', 'listing_released') = 1
  and pg_temp.emails('e1800000-0000-4000-8000-000000000003', 'listing_released') = 1, 'each person waiting is told once, by e-mail too');
select pg_temp.check((select message from public.notifications where user_id = 'e1800000-0000-4000-8000-000000000002'
    and event_type = 'listing_released') = 'Ya no está reservado: Guitarra reservada. Si te sigue interesando, escríbele a quien vende.',
  'the notice names the listing');
select pg_temp.check(pg_temp.page_changes_since((select mark from mark_four)) = 0, 'closing an ended period shows nothing new');
select pg_temp.check((select laria_private.run_listing_reservations()) = '{"asked": 0, "closed": 0, "released": 0}'::jsonb, 'nothing more after that');
select pg_temp.check(pg_temp.notices('e1800000-0000-4000-8000-000000000002', 'listing_released') = 1, 'nobody hears twice');

-- Re-reserving after a period ended is allowed.
select pg_temp.as_user('e1800000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.check(public.set_listing_reservation('e1802000-0000-4000-8000-000000000001', 1) = now() + interval '1 day', 'reserved again');
reset role;

-- ---------------------------------------------------------------- the seller's answers

-- "Sigue disponible" while the second period still runs (taking the reservation off).
select pg_temp.as_user('e1800000-0000-4000-8000-000000000001');
set local role authenticated;
create temp table end_one on commit drop as select public.end_listing_reservation('e1802000-0000-4000-8000-000000000002', 'available') as told;
reset role;
select pg_temp.check((select told from end_one) = 1, 'the one person waiting is told');
select pg_temp.check(pg_temp.notices('e1800000-0000-4000-8000-000000000002', 'listing_released') = 2
  and pg_temp.emails('e1800000-0000-4000-8000-000000000002', 'listing_released') = 2, 'in the app and by e-mail');
select pg_temp.check(not exists (select 1 from public.listing_reservations where listing_id = 'e1802000-0000-4000-8000-000000000002')
  and not exists (select 1 from public.listing_release_watches where listing_id = 'e1802000-0000-4000-8000-000000000002'), 'the period closes');
select pg_temp.check((select availability_confirmed_at = now() from public.listings where id = 'e1802000-0000-4000-8000-000000000002'),
  'it counts as "sigue disponible"');
select pg_temp.as_user('e1800000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.expect_error($$select public.end_listing_reservation('e1802000-0000-4000-8000-000000000002', 'available')$$, 'RESERVATION_NOT_FOUND');
select pg_temp.expect_error($$select public.end_listing_reservation('e1802000-0000-4000-8000-000000000001', 'later')$$, 'RESERVATION_OUTCOME_INVALID');
select pg_temp.expect_error($$select public.end_listing_reservation('e1802000-0000-4000-8000-000000000003', 'available')$$, 'RESERVATION_NOT_PUBLISHED');
reset role;

-- "Sí, se vendió" after the end: the ordinary sold flow; the people waiting hear it in the app only.
select pg_temp.as_user('e1800000-0000-4000-8000-000000000003');
set local role authenticated;
select public.set_listing_release_watch('e1802000-0000-4000-8000-000000000001', true);
reset role;
select pg_temp.age_period('e1802000-0000-4000-8000-000000000001', interval '2 hours');
select laria_private.run_listing_reservations();
select pg_temp.check(pg_temp.notices('e1800000-0000-4000-8000-000000000001', 'listing_reservation_ended') = 2, 'the second period asks again');
select pg_temp.as_user('e1800000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.check(public.end_listing_reservation('e1802000-0000-4000-8000-000000000001', 'sold') = 1, 'one person is told');
reset role;
select pg_temp.check((select status = 'sold' and sold_at is not null from public.listings where id = 'e1802000-0000-4000-8000-000000000001'),
  'the listing is sold');
select pg_temp.check(pg_temp.notices('e1800000-0000-4000-8000-000000000003', 'listing_reservation_sold') = 1
  and pg_temp.emails('e1800000-0000-4000-8000-000000000003', 'listing_reservation_sold') = 0, 'in the app only');
select pg_temp.check((select message from public.notifications where user_id = 'e1800000-0000-4000-8000-000000000003'
  and event_type = 'listing_reservation_sold') = 'Se vendió: Guitarra reservada.', 'the notice names the listing');
select pg_temp.check(not exists (select 1 from public.notifications where user_id = 'e1800000-0000-4000-8000-000000000001'
  and event_type = 'listing_reservation_ended' and read_at is null), 'the answer clears the seller''s question');
select pg_temp.check(not exists (select 1 from public.listing_reservations where listing_id = 'e1802000-0000-4000-8000-000000000001'),
  'the period closes');
select pg_temp.as_user('e1800000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.expect_error($$select public.set_listing_reservation('e1802000-0000-4000-8000-000000000001', 1)$$, 'RESERVATION_NOT_PUBLISHED');
select pg_temp.expect_error($$select public.end_listing_reservation('e1802000-0000-4000-8000-000000000001', 'sold')$$, 'LISTING_SOLD_INVALID');
reset role;

-- ---------------------------------------------------------------- a listing that leaves Approved another way

-- Sold from Mis publicaciones while reserved: the job closes the period and tells the people waiting.
select pg_temp.as_user('e1800000-0000-4000-8000-000000000001');
set local role authenticated;
select public.set_listing_reservation('e1802000-0000-4000-8000-000000000005', 1);
reset role;
select pg_temp.as_user('e1800000-0000-4000-8000-000000000002');
set local role authenticated;
select public.set_listing_release_watch('e1802000-0000-4000-8000-000000000005', true);
reset role;
select pg_temp.as_user('e1800000-0000-4000-8000-000000000001');
set local role authenticated;
select public.set_owned_listing_lifecycle('e1802000-0000-4000-8000-000000000005', 'hide');
reset role;
set local role anon;
select pg_temp.check((select count(*) from public.get_reserved_listings(array['e1802000-0000-4000-8000-000000000005']::uuid[])) = 0,
  'a hidden listing shows no period');
reset role;
select pg_temp.as_user('e1800000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.check((select count(*) from public.get_my_listing_reservations() where listing_id = 'e1802000-0000-4000-8000-000000000005') = 0,
  'nor does the seller''s list');
reset role;
select pg_temp.check((select laria_private.run_listing_reservations()) = '{"asked": 0, "closed": 1, "released": 0}'::jsonb,
  'the job closes the period of a hidden listing');
select pg_temp.check(not exists (select 1 from public.listing_release_watches where listing_id = 'e1802000-0000-4000-8000-000000000005')
  and pg_temp.notices('e1800000-0000-4000-8000-000000000002', 'listing_reservation_sold') = 0
  and pg_temp.notices('e1800000-0000-4000-8000-000000000002', 'listing_released') = 2, 'quietly');

select pg_temp.as_user('e1800000-0000-4000-8000-000000000001');
set local role authenticated;
select public.set_owned_listing_lifecycle('e1802000-0000-4000-8000-000000000005', 'restore');
select public.set_listing_reservation('e1802000-0000-4000-8000-000000000005', 2);
reset role;
select pg_temp.as_user('e1800000-0000-4000-8000-000000000002');
set local role authenticated;
select public.set_listing_release_watch('e1802000-0000-4000-8000-000000000005', true);
reset role;
select pg_temp.as_user('e1800000-0000-4000-8000-000000000001');
set local role authenticated;
select public.set_owned_listing_lifecycle('e1802000-0000-4000-8000-000000000005', 'sold');
reset role;
select pg_temp.check((select laria_private.run_listing_reservations()) = '{"asked": 0, "closed": 1, "released": 0}'::jsonb,
  'a listing sold another way: the job closes the period');
select pg_temp.check(pg_temp.notices('e1800000-0000-4000-8000-000000000002', 'listing_reservation_sold') = 1,
  'and the people waiting hear it');

-- ---------------------------------------------------------------- cached pages, row by row

-- A write that changes neither the end nor whether it ended records nothing; one on a listing no page shows neither.
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set status = 'approved' where id = 'e1802000-0000-4000-8000-000000000003';
select set_config('app.allow_listing_admin_fields', '', true);
select pg_temp.as_user('e1800000-0000-4000-8000-000000000001');
set local role authenticated;
select public.set_listing_reservation('e1802000-0000-4000-8000-000000000003', 1);
reset role;
create temp table mark_five on commit drop as select pg_temp.page_mark() as mark;
update public.listing_reservations set reserved_at = reserved_at where listing_id = 'e1802000-0000-4000-8000-000000000003';
select pg_temp.check(pg_temp.page_changes_since((select mark from mark_five)) = 0, 'an update that changes nothing shown records nothing');
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set status = 'pending' where id = 'e1802000-0000-4000-8000-000000000003';
select set_config('app.allow_listing_admin_fields', '', true);
create temp table mark_six on commit drop as select pg_temp.page_mark() as mark;
update public.listing_reservations set reserved_until = reserved_until - interval '1 hour' where listing_id = 'e1802000-0000-4000-8000-000000000003';
delete from public.listing_reservations where listing_id = 'e1802000-0000-4000-8000-000000000003';
select pg_temp.check(pg_temp.page_changes_since((select mark from mark_six)) = 0, 'a listing no page shows records nothing');

-- ---------------------------------------------------------------- account anonymization (A20)

select pg_temp.as_user('e1800000-0000-4000-8000-000000000001');
set local role authenticated;
select public.set_owned_listing_lifecycle('e1802000-0000-4000-8000-000000000002', 'hide');
select public.set_owned_listing_lifecycle('e1802000-0000-4000-8000-000000000002', 'restore');
select public.set_listing_reservation('e1802000-0000-4000-8000-000000000002', 1);
reset role;
select pg_temp.as_user('e1800000-0000-4000-8000-000000000003');
set local role authenticated;
select public.set_listing_release_watch('e1802000-0000-4000-8000-000000000002', true);
reset role;
insert into laria_private.account_anonymizations (user_id, reason, counts)
values ('e1800000-0000-4000-8000-000000000003', 'self_service', '{"listings_archived": 0}');
select pg_temp.check(not exists (select 1 from public.listing_release_watches where user_id = 'e1800000-0000-4000-8000-000000000003'),
  'an anonymized account keeps no release watch');
select pg_temp.check((select counts from laria_private.account_anonymizations where user_id = 'e1800000-0000-4000-8000-000000000003')
  = '{"listings_archived": 0, "release_watches": 1}'::jsonb, 'and the count is recorded with the rest');
-- A repeat goes through the upsert of laria_private.anonymize_account_core.
insert into laria_private.account_anonymizations as a (user_id, reason, counts)
values ('e1800000-0000-4000-8000-000000000003', 'self_service', '{"listings_archived": 0}')
on conflict (user_id) do update set last_anonymized_at = now(), counts = excluded.counts;
select pg_temp.check((select counts from laria_private.account_anonymizations where user_id = 'e1800000-0000-4000-8000-000000000003')
  = '{"listings_archived": 0, "release_watches": 0}'::jsonb, 'a repeat counts what it found then');
select pg_temp.check(exists (select 1 from pg_trigger where tgname = 'account_anonymizations_release_watches'
  and tgrelid = 'laria_private.account_anonymizations'::regclass and tgenabled = 'O'), 'the trigger is on');

-- ---------------------------------------------------------------- registries and e-mail rules

-- Which of the values an event type check accepts (the check is "event_type = ANY ('{...}'::text[])").
create function pg_temp.accepted(p_table regclass, p_constraint text, p_values text[]) returns text[] language sql as $$
  select array(
    select value from unnest(p_values) value
    where value = any ((substring((select pg_get_constraintdef(oid) from pg_constraint
      where conrelid = p_table and conname = p_constraint) from '''(\{[^}]*\})'''))::text[])
    order by value)
$$;
select pg_temp.check(pg_temp.accepted('public.notifications', 'notifications_event_type_check',
    array['listing_reservation_ended', 'listing_released', 'listing_reservation_sold', 'listing_back_in_stock'])
  = array['listing_back_in_stock', 'listing_released', 'listing_reservation_ended', 'listing_reservation_sold'],
  'the three notices are known, and the earlier ones stay');
select pg_temp.check(pg_temp.accepted('laria_private.marketplace_email_deliveries', 'marketplace_email_deliveries_event_type_check',
    array['listing_reservation_ended', 'listing_released', 'listing_reservation_sold', 'listing_back_in_stock'])
  = array['listing_back_in_stock', 'listing_released', 'listing_reservation_ended'],
  'two of them are e-mails; the sale is not');

-- 20261114160000's answers, unchanged.
select pg_temp.check(laria_private.email_max_age('search_alert_immediate') = interval '1 day'
  and laria_private.email_max_age('search_alert_daily') = interval '1 day'
  and laria_private.email_max_age('listing_price_drop') = interval '2 days'
  and laria_private.email_max_age('listing_back_in_stock') = interval '2 days'
  and laria_private.email_max_age('follow_weekly') = interval '3 days'
  and laria_private.email_max_age('listing_availability_checkin') = interval '3 days'
  and laria_private.email_max_age('listing_purchase_check') = interval '3 days'
  and laria_private.email_max_age('listing_purchase_confirmation_reminder') = interval '3 days'
  and laria_private.email_max_age('listing_review_reminder') = interval '3 days'
  and laria_private.email_max_age('transaction_confirmation_requested') = interval '7 days'
  and laria_private.email_max_age('a_kind_added_later') = interval '7 days', 'every earlier age stays');
select pg_temp.check(laria_private.email_priority('search_alert_immediate') = 2
  and laria_private.email_priority('search_alert_daily') = 2 and laria_private.email_priority('listing_price_drop') = 2
  and laria_private.email_priority('listing_back_in_stock') = 2 and laria_private.email_priority('follow_weekly') = 2
  and laria_private.email_priority('listing_availability_checkin') = 1 and laria_private.email_priority('listing_purchase_check') = 1
  and laria_private.email_priority('listing_purchase_confirmation_reminder') = 1
  and laria_private.email_priority('listing_review_reminder') = 1
  and laria_private.email_priority('transaction_confirmation_requested') = 0
  and laria_private.email_priority('a_kind_added_later') = 0, 'every earlier order stays');
select pg_temp.check(laria_private.email_max_age('listing_released') = interval '2 days'
  and laria_private.email_priority('listing_released') = 2, 'a release is news like a restock');
select pg_temp.check(laria_private.email_max_age('listing_reservation_ended') = interval '3 days'
  and laria_private.email_priority('listing_reservation_ended') = 1, 'the seller''s question is a reminder');

rollback;
