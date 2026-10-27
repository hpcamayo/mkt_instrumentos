-- Feature ideas, integration: anonymising an account clears this branch's data
-- (supabase/migrations/20261210120400_feat_account_privacy.sql, through the launch audit's A20 anonymiser). Admin runs
-- it here (public.admin_anonymize_account); tests/feat-accounts.sql runs the self-service path. Local/test database
-- only. Every fixture is rolled back.
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
    if position(p_code in sqlerrm) > 0 or sqlstate = p_code then return; end if;
    raise exception 'Expected % from [%], got: % (%)', p_code, p_sql, sqlerrm, sqlstate;
  end;
  raise exception 'Expected % from [%], but it succeeded', p_code, p_sql;
end $$;
create function pg_temp.claims(p_sub text, p_admin boolean default false, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_sub, 'role', 'authenticated', 'aal', p_aal,
    'app_metadata', case when p_admin then jsonb_build_object('role', 'admin') else '{}'::jsonb end)::text, true)
$$;
grant execute on function pg_temp.check(boolean, text), pg_temp.expect_error(text, text), pg_temp.claims(text, boolean, text)
to anon, authenticated, service_role;

-- The person (01), someone else (02), an active store's owner (03) and Admin (09).
insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e1600000-0000-4000-8000-000000000001','authenticated','authenticated','fap-person@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Persona","phone":"51999996001","city":"Lima","region":"Lima"}'),
 ('e1600000-0000-4000-8000-000000000002','authenticated','authenticated','fap-other@example.invalid',now(),'{}','{"account_type":"buyer","full_name":"Otra","phone":"51999996002","city":"Lima","region":"Lima"}'),
 ('e1600000-0000-4000-8000-000000000003','authenticated','authenticated','fap-owner@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueña","phone":"51999996003","city":"Lima","region":"Lima"}'),
 ('e1600000-0000-4000-8000-000000000009','authenticated','authenticated','fap-admin@example.invalid',now(),'{"role":"admin"}','{"account_type":"seller","full_name":"Admin","phone":"51999996009","city":"Lima","region":"Lima"}');
select set_config('app.allow_store_admin_fields', 'true', true);
select set_config('app.allow_listing_admin_fields', 'true', true);
insert into public.stores (id, name, slug, whatsapp_phone, city, region, status, listing_plan, is_verified, ruc,
  owner_user_id, razon_social, email, address, contact_person)
values ('e1610000-0000-4000-8000-000000000001', 'Tienda Activa', 'fap-activa', '987654341', 'Lima', 'Lima', 'active', 'free',
  true, '20100047241', 'e1600000-0000-4000-8000-000000000003', 'ACTIVA SAC', 'a@fap.pe', 'Av Uno 123', 'Ana');
insert into public.listings (id, seller_type, store_id, status, title, slug, description, category, instrument_type,
  brand, model, condition, price_pen, city, region, contact_name, whatsapp_phone, owner_user_id,
  marketplace_rules_accepted_at)
select f.id::uuid, f.seller_type::public.seller_type, f.store_id::uuid, 'approved', f.title, f.slug,
  repeat('Descripción larga de prueba ', 3), 'guitars', 'electric_guitar', 'Fender', 'Strat', 'Muy bueno', 1500,
  'Lima', 'Lima', 'Ana', '51987654321', f.owner::uuid, now()
from (values
  ('e1620000-0000-4000-8000-000000000001', 'individual', null, 'Guitarra de la persona', 'fap-persona', 'e1600000-0000-4000-8000-000000000001'),
  ('e1620000-0000-4000-8000-000000000002', 'store', 'e1610000-0000-4000-8000-000000000001', 'Guitarra de tienda', 'fap-tienda', 'e1600000-0000-4000-8000-000000000003'),
  ('e1620000-0000-4000-8000-000000000003', 'individual', null, 'Guitarra de otra', 'fap-otra', 'e1600000-0000-4000-8000-000000000002')
) as f(id, seller_type, store_id, title, slug, owner);

-- What the person has across the batches, and the same for someone else where it must stay.
insert into public.account_devices (user_id, device_hash, label)
values ('e1600000-0000-4000-8000-000000000001', repeat('a', 64), 'Chrome en Windows'),
  ('e1600000-0000-4000-8000-000000000002', repeat('b', 64), 'Safari en iPhone');
insert into public.help_tickets (code, user_id, name, email, topic, message)
values ('AY-0000FA01', 'e1600000-0000-4000-8000-000000000001', 'Persona', 'fap-person@example.invalid', 'cuenta', 'No puedo cambiar mi foto.');
insert into public.gear_items (id, user_id, category, instrument_type, brand, title, serial)
values ('e1630000-0000-4000-8000-000000000001', 'e1600000-0000-4000-8000-000000000001', 'guitars', 'electric_guitar', 'Fender', 'Mi Strat', 'MX12345'),
  ('e1630000-0000-4000-8000-000000000002', 'e1600000-0000-4000-8000-000000000002', 'guitars', 'electric_guitar', 'Gibson', 'Su Les Paul', null);
insert into public.gear_reminders (gear_item_id, user_id, kind, every_months, last_changed_on, next_due_on)
values ('e1630000-0000-4000-8000-000000000001', 'e1600000-0000-4000-8000-000000000001', 'strings', 3, current_date, current_date + 90);
insert into public.listing_price_steps (listing_id, owner_user_id, floor_pen, step_percent, interval_days, start_price_pen, next_step_at)
values ('e1620000-0000-4000-8000-000000000001', 'e1600000-0000-4000-8000-000000000001', 1000, 5, 7, 1500, now() + interval '7 days');
insert into public.listing_private_offers (id, listing_id, owner_user_id, price_pen, public_price_pen, valid_until, recipient_count)
values ('e1640000-0000-4000-8000-000000000001', 'e1620000-0000-4000-8000-000000000001', 'e1600000-0000-4000-8000-000000000001', 1400, 1500, now() + interval '3 days', 1),
  ('e1640000-0000-4000-8000-000000000002', 'e1620000-0000-4000-8000-000000000003', 'e1600000-0000-4000-8000-000000000002', 1400, 1500, now() + interval '3 days', 1);
insert into public.listing_private_offer_recipients (offer_id, user_id)
values ('e1640000-0000-4000-8000-000000000001', 'e1600000-0000-4000-8000-000000000002'),
  ('e1640000-0000-4000-8000-000000000002', 'e1600000-0000-4000-8000-000000000001');
insert into public.seller_bundle_offers (owner_user_id, discount_percent, min_items)
values ('e1600000-0000-4000-8000-000000000001', 10, 2), ('e1600000-0000-4000-8000-000000000002', 10, 2);
insert into public.artist_profiles (user_id, slug, display_name, verified_by)
values ('e1600000-0000-4000-8000-000000000001', 'fap-artista', 'La Persona', 'e1600000-0000-4000-8000-000000000009');
insert into public.seller_levels (subject_user_id, facts, qualified_since)
values ('e1600000-0000-4000-8000-000000000001', '{"sales": 3}', now());
insert into public.buyer_track_records (user_id, enabled, token, enabled_at)
values ('e1600000-0000-4000-8000-000000000001', true, repeat('c', 24), now());

-- Trade requests: an open one with a store's offer, and an expired one; both have the person's phone.
insert into public.trade_requests (id, kind, requester_user_id, category, instrument_type, brand, model, title, condition,
  description, region, photos, offers_until, decide_until, contact_phone)
values
 ('e1650000-0000-4000-8000-000000000001', 'sell', 'e1600000-0000-4000-8000-000000000001', 'guitars', 'other', 'Yamaha', 'Pacifica',
  'Yamaha Pacifica', 'Muy bueno', 'Guitarra con detalles de uso.', 'Lima', array['a/b/1.jpg', 'a/b/2.jpg'],
  now() + interval '2 days', now() + interval '4 days', '51999996001'),
 ('e1650000-0000-4000-8000-000000000002', 'sell', 'e1600000-0000-4000-8000-000000000001', 'guitars', 'other', 'Ibanez', 'RG',
  'Ibanez RG', 'Muy bueno', 'Guitarra con detalles de uso.', 'Lima', array['a/c/1.jpg', 'a/c/2.jpg'],
  now() + interval '2 days', now() + interval '4 days', '51999996001');
insert into public.trade_offers (id, request_id, store_id, amount_pen)
values ('e1660000-0000-4000-8000-000000000001', 'e1650000-0000-4000-8000-000000000001', 'e1610000-0000-4000-8000-000000000001', 700);
update public.trade_requests set status = 'expired', closed_at = now() where id = 'e1650000-0000-4000-8000-000000000002';

-- Try-outs at the store: one coming up, one past.
insert into public.store_tryouts (id, store_id, listing_id, listing_title, buyer_user_id, buyer_name, buyer_phone, buyer_note,
  starts_at, ends_at, status, request_key)
values
 ('e1670000-0000-4000-8000-000000000001', 'e1610000-0000-4000-8000-000000000001', 'e1620000-0000-4000-8000-000000000002',
  'Guitarra de tienda', 'e1600000-0000-4000-8000-000000000001', 'Persona', '51999996001', 'Llevo mi pedal',
  now() + interval '2 days', now() + interval '2 days 1 hour', 'confirmed', 'fap-tryout-1'),
 ('e1670000-0000-4000-8000-000000000002', 'e1610000-0000-4000-8000-000000000001', 'e1620000-0000-4000-8000-000000000002',
  'Guitarra de tienda', 'e1600000-0000-4000-8000-000000000001', 'Persona', '51999996001', null,
  now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 'confirmed', 'fap-tryout-2'),
 ('e1670000-0000-4000-8000-000000000003', 'e1610000-0000-4000-8000-000000000001', 'e1620000-0000-4000-8000-000000000002',
  'Guitarra de tienda', 'e1600000-0000-4000-8000-000000000002', 'Otra', '51999996002', null,
  now() + interval '3 days', now() + interval '3 days 1 hour', 'requested', 'fap-tryout-3');

-- Services: the person's lessons, someone else's repairs; bookings both ways.
insert into public.services (id, owner_user_id, category, slug, title, provider_name, description, price_from_pen, price_unit,
  modalities, skills, city, whatsapp_phone, status, approved_at)
values
 ('e1680000-0000-4000-8000-000000000001', 'e1600000-0000-4000-8000-000000000001', 'clases',
  laria_private.service_slug('Clases de guitarra para principiantes', 'e1680000-0000-4000-8000-000000000001'),
  'Clases de guitarra para principiantes', 'Persona', btrim(repeat('Clases personalizadas de guitarra. ', 3)), 60, 'clase',
  array['a_domicilio'], array['guitarra'], 'Lima', '51999996001', 'approved', now()),
 ('e1680000-0000-4000-8000-000000000002', 'e1600000-0000-4000-8000-000000000002', 'clases',
  laria_private.service_slug('Clases de canto para todas las edades', 'e1680000-0000-4000-8000-000000000002'),
  'Clases de canto para todas las edades', 'Otra', btrim(repeat('Clases personalizadas de canto. ', 3)), 60, 'clase',
  array['a_domicilio'], array['canto'], 'Lima', '51999996002', 'approved', now());
insert into public.service_bookings (id, service_id, provider_user_id, client_user_id, requested_by)
values ('e1690000-0000-4000-8000-000000000001', 'e1680000-0000-4000-8000-000000000001', 'e1600000-0000-4000-8000-000000000001',
  'e1600000-0000-4000-8000-000000000002', 'client'),
 ('e1690000-0000-4000-8000-000000000002', 'e1680000-0000-4000-8000-000000000002', 'e1600000-0000-4000-8000-000000000002',
  'e1600000-0000-4000-8000-000000000001', 'client');
insert into public.service_bookings (id, service_id, provider_user_id, client_user_id, requested_by, status, responded_at,
  confirmed_at, review_deadline)
values ('e1690000-0000-4000-8000-000000000003', 'e1680000-0000-4000-8000-000000000001', 'e1600000-0000-4000-8000-000000000001',
  'e1600000-0000-4000-8000-000000000009', 'client', 'confirmed', now(), now(), now() + interval '30 days');
insert into public.service_events (id, service_id, kind, actor_user_id, session_id)
values (gen_random_uuid(), 'e1680000-0000-4000-8000-000000000002', 'contact', 'e1600000-0000-4000-8000-000000000001', gen_random_uuid());

-- Mercado Libre: a connection the person made for the active store (staff), which stays.
insert into public.store_mercadolibre_connections (store_id, ml_user_id, access_token_enc, expires_at, connected_by)
values ('e1610000-0000-4000-8000-000000000001', 1234, 'cifrado', now() + interval '6 hours', 'e1600000-0000-4000-8000-000000000001');

select pg_temp.check(exists (select 1 from public.seller_pages where user_id = 'e1600000-0000-4000-8000-000000000001'),
  'the first approved listing made the seller page');

-- Nobody reaches the hook directly; the core calls it.
select pg_temp.check(not has_function_privilege('service_role', 'laria_private.anonymize_account_feature_data(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'laria_private.anonymize_account_feature_data(uuid)', 'execute')
  and not has_function_privilege('anon', 'laria_private.anonymize_account_feature_data(uuid)', 'execute'),
  'no API role runs the hook');
select pg_temp.check(not has_function_privilege('authenticated', 'public.service_delete_account(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.service_delete_account(uuid)', 'execute'),
  'self-service deletion is the server''s');

-- Admin anonymises the person (the hook used to accept the service role only).
set local role authenticated;
select pg_temp.claims('e1600000-0000-4000-8000-000000000009', true, 'aal2');
create temp table fap_run on commit drop as
select public.admin_anonymize_account('e1600000-0000-4000-8000-000000000001', 'Pedido del titular') as result;
reset role;

select pg_temp.check((select (result -> 'features' ->> 'devices')::int = 1
    and (result -> 'features' ->> 'help_tickets')::int = 1
    and (result -> 'features' ->> 'gear_items')::int = 1
    and (result -> 'features' ->> 'seller_pages')::int = 1
    and (result -> 'features' ->> 'trade_requests_scrubbed')::int = 2
    and (result -> 'features' ->> 'tryouts_scrubbed')::int = 2
    and (result -> 'features' ->> 'services_hidden')::int = 1 from fap_run),
  'the run counts the branch''s data under features: ' || (select result::text from fap_run));

-- Removed.
select pg_temp.check(not exists (select 1 from public.account_devices where user_id = 'e1600000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.help_tickets where user_id = 'e1600000-0000-4000-8000-000000000001'), 'devices and help tickets go');
select pg_temp.check(not exists (select 1 from public.gear_items where user_id = 'e1600000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.gear_reminders where user_id = 'e1600000-0000-4000-8000-000000000001'), 'Mi equipo goes with its reminders');
select pg_temp.check(not exists (select 1 from public.listing_price_steps where owner_user_id = 'e1600000-0000-4000-8000-000000000001'), 'price steps go');
select pg_temp.check(not exists (select 1 from public.listing_private_offers where owner_user_id = 'e1600000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.listing_private_offer_recipients where user_id = 'e1600000-0000-4000-8000-000000000001'),
  'private offers made and received go');
select pg_temp.check(not exists (select 1 from public.seller_bundle_offers where owner_user_id = 'e1600000-0000-4000-8000-000000000001'), 'the bundle offer goes');
select pg_temp.check(not exists (select 1 from public.artist_profiles where user_id = 'e1600000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.seller_pages where user_id = 'e1600000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.seller_levels where subject_user_id = 'e1600000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.buyer_track_records where user_id = 'e1600000-0000-4000-8000-000000000001'),
  'the artist profile, seller page and level and buyer track record go');

-- Closed, and told to the store as when the person does it.
select pg_temp.check((select status = 'withdrawn' and contact_phone is null from public.trade_requests where id = 'e1650000-0000-4000-8000-000000000001'),
  'the open trade request is withdrawn without the phone');
select pg_temp.check((select status = 'expired' and contact_phone is null from public.trade_requests where id = 'e1650000-0000-4000-8000-000000000002'),
  'the expired one stays, without the phone');
select pg_temp.check((select status from public.trade_offers where id = 'e1660000-0000-4000-8000-000000000001') = 'declined', 'the store''s offer is closed');
select pg_temp.check((select count(*) from public.notifications where user_id = 'e1600000-0000-4000-8000-000000000003' and event_type = 'store_trade_update') = 1,
  'the store is told the request was withdrawn');
select pg_temp.check((select status = 'cancelled' and cancelled_by = 'buyer' from public.store_tryouts where id = 'e1670000-0000-4000-8000-000000000001'),
  'the coming try-out is cancelled');
select pg_temp.check((select status from public.store_tryouts where id = 'e1670000-0000-4000-8000-000000000002') = 'confirmed', 'the past one keeps its status');
select pg_temp.check((select count(*) = 2 from public.store_tryouts where buyer_user_id = 'e1600000-0000-4000-8000-000000000001'
    and buyer_name = 'Cuenta eliminada' and buyer_phone = '' and buyer_note is null), 'no try-out keeps the buyer''s name, phone or note');
select pg_temp.check((select count(*) from public.notifications where user_id = 'e1600000-0000-4000-8000-000000000003' and event_type = 'store_tryout_cancelled') = 1,
  'the store is told the try-out was cancelled');
select pg_temp.check((select row(status, provider_name, whatsapp_phone, moderation_reason)
    = row('hidden'::text, 'Cuenta eliminada'::text, ''::text, 'Cuenta eliminada'::text)
  from public.services where id = 'e1680000-0000-4000-8000-000000000001'), 'the service is hidden without a contact');
select pg_temp.check((select status from public.service_bookings where id = 'e1690000-0000-4000-8000-000000000001') = 'cancelled'
  and (select status from public.service_bookings where id = 'e1690000-0000-4000-8000-000000000002') = 'cancelled',
  'pending bookings, either side, are cancelled');
select pg_temp.check((select status from public.service_bookings where id = 'e1690000-0000-4000-8000-000000000003') = 'confirmed',
  'a confirmed booking stays for its review');
select pg_temp.check(not exists (select 1 from public.service_events where actor_user_id = 'e1600000-0000-4000-8000-000000000001'),
  'service analytics lose the account');
select pg_temp.check(exists (select 1 from public.store_mercadolibre_connections where store_id = 'e1610000-0000-4000-8000-000000000001'),
  'the active store keeps its Mercado Libre connection');

-- Everyone else keeps theirs.
select pg_temp.check(exists (select 1 from public.account_devices where user_id = 'e1600000-0000-4000-8000-000000000002')
  and exists (select 1 from public.gear_items where user_id = 'e1600000-0000-4000-8000-000000000002')
  and exists (select 1 from public.seller_bundle_offers where owner_user_id = 'e1600000-0000-4000-8000-000000000002')
  and exists (select 1 from public.listing_private_offers where id = 'e1640000-0000-4000-8000-000000000002')
  and (select row(status, buyer_name, buyer_phone) = row('requested'::text, 'Otra'::text, '51999996002'::text)
    from public.store_tryouts where id = 'e1670000-0000-4000-8000-000000000003')
  and (select status from public.services where id = 'e1680000-0000-4000-8000-000000000002') = 'approved',
  'other people''s data is untouched');

-- The cleared values are valid only where they belong: a shown service needs a number, and a try-out request still
-- refuses a missing phone.
select pg_temp.expect_error($q$update public.services set status = 'approved', moderation_reason = null where id = 'e1680000-0000-4000-8000-000000000001'$q$,
  'services_whatsapp_check');
select pg_temp.check(position($s$phone_value !~ '^[0-9]{10,15}$'$s$ in
    (select prosrc from pg_proc where oid = 'public.request_store_tryout(uuid, timestamptz, text, text, text, text)'::regprocedure)) > 0,
  'a try-out request still checks the phone itself');

-- Running it again is harmless.
set local role authenticated;
select pg_temp.claims('e1600000-0000-4000-8000-000000000009', true, 'aal2');
select pg_temp.check((public.admin_anonymize_account('e1600000-0000-4000-8000-000000000001', 'Pedido del titular') -> 'features' ->> 'devices')::int = 0,
  'a second run finds nothing left');
reset role;

rollback;
