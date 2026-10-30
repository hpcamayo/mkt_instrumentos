-- Feature ideas, accounts batch (docs/feature-ideas/accounts.md): two-step sign-in, devices and the store-owner
-- requirement (safe-08), "Tus datos" (safe-09), help tickets (safe-10), the stolen-gear registry (safe-02) and photo
-- copy flags (safe-05). Actual Auth claims and RLS; local/test database only, every fixture rolls back.
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
create function pg_temp.as_user(p_id text, p_aal text default 'aal1', p_session text default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_strip_nulls(jsonb_build_object('sub', p_id, 'role', 'authenticated',
    'aal', p_aal, 'session_id', p_session))::text, true);
end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"f8100000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal2","app_metadata":{"role":"admin"}}', true);
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', '{"role":"service_role"}', true); end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', '{"role":"anon"}', true); end $$;
create function pg_temp.emails(p_type text, p_user text) returns bigint language sql security definer as $$
  select count(*) from laria_private.marketplace_email_deliveries where event_type = p_type and recipient_user_id = p_user::uuid
$$;
create function pg_temp.hash64(p_seed text) returns text language sql as $$
  select string_agg(case when get_byte(decode(md5(p_seed || n), 'hex'), 0) % 2 = 0 then '0' else '1' end, '' order by n)
  from generate_series(1, 64) n
$$;
-- The same hash with its first p_flip bits inverted.
create function pg_temp.flip(p_hash text, p_flip integer) returns text language sql as $$
  select string_agg(case when n <= p_flip then (case substr(p_hash, n, 1) when '0' then '1' else '0' end) else substr(p_hash, n, 1) end, '' order by n)
  from generate_series(1, 64) n
$$;

-- Supabase Auth's own tables, where the Docker-free database lacks them (dropped with the rollback).
do $$ begin
  if to_regclass('auth.mfa_factors') is null then
    create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, friendly_name text,
      factor_type text not null default 'totp', status text not null, created_at timestamptz default now(), updated_at timestamptz default now());
  end if;
  if to_regclass('auth.sessions') is null then
    create table auth.sessions (id uuid primary key, user_id uuid not null, created_at timestamptz default now(),
      updated_at timestamptz default now(), factor_id uuid, aal text, not_after timestamptz, refreshed_at timestamp,
      user_agent text, ip inet, tag text);
  end if;
end $$;

-- ------------------------------------------------------------------ fixtures

insert into auth.users (id, aud, role, email, email_confirmed_at, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
 ('f8100000-0000-4000-8000-000000000001','authenticated','authenticated','feat-owner@example.invalid',now(),'x','{}','{"account_type":"store_owner","full_name":"Dueña Tienda","phone":"51999996001","city":"Lima","region":"Lima"}'),
 ('f8100000-0000-4000-8000-000000000002','authenticated','authenticated','feat-seller@example.invalid',now(),'x','{}','{"account_type":"seller","full_name":"Vende Particular","phone":"51999996002","city":"Lima","region":"Lima"}'),
 ('f8100000-0000-4000-8000-000000000003','authenticated','authenticated','feat-buyer@example.invalid',now(),'x','{}','{"account_type":"seller","full_name":"Compra Persona","phone":"51999996003","city":"Lima","region":"Lima"}'),
 ('f8100000-0000-4000-8000-000000000004','authenticated','authenticated','feat-other@example.invalid',now(),'x','{}','{"account_type":"seller","full_name":"Otra Persona","phone":"51999996004","city":"Cusco","region":"Cusco"}'),
 ('f8100000-0000-4000-8000-000000000099','authenticated','authenticated','feat-admin@example.invalid',now(),'x','{"role":"admin"}','{"account_type":"seller","full_name":"Admin QA"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('f8200000-0000-4000-8000-000000000001','feat-tienda','Tienda Segura','Tienda Segura SAC','20999996001','feat-tienda@example.invalid','Dueña','Dueña','51999996001','Lima','Lima','Av. QA 1','f8100000-0000-4000-8000-000000000001','active','free',true);

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at,created_at) values
 ('f8300000-0000-4000-8000-000000000001','feat-original','Guitarra original','individual','approved','guitars','electric_guitar','Fender','Strat','Usado - buen estado',2500,'Lima','Lima','Vende','51999996002','Descripción de publicación válida con más de cuarenta caracteres.','f8100000-0000-4000-8000-000000000002',null,'self_service',now(),now() - interval '10 days'),
 ('f8300000-0000-4000-8000-000000000002','feat-copia','Guitarra con fotos copiadas','individual','pending','guitars','electric_guitar','Fender','Strat','Usado - buen estado',900,'Cusco','Cusco','Otra','51999996004','Descripción de publicación válida con más de cuarenta caracteres.','f8100000-0000-4000-8000-000000000004',null,'self_service',now(),now() - interval '1 hour'),
 ('f8300000-0000-4000-8000-000000000003','feat-mismo-dueno','Segunda guitarra del mismo','individual','approved','guitars','electric_guitar','Fender','Tele','Usado - buen estado',2000,'Lima','Lima','Vende','51999996002','Descripción de publicación válida con más de cuarenta caracteres.','f8100000-0000-4000-8000-000000000002',null,'self_service',now(),now() - interval '5 days'),
 ('f8300000-0000-4000-8000-000000000004','feat-tienda-l','Bajo de tienda','store','approved','basses','electric_bass','Ibanez','SR','Nuevo',1800,'Lima','Lima','Dueña','51999996001','Descripción de publicación válida con más de cuarenta caracteres.','f8100000-0000-4000-8000-000000000001','f8200000-0000-4000-8000-000000000001','self_service',now(),now() - interval '3 days');
insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/' || l.slug || '-' || n || '.jpg', n
from public.listings l cross join generate_series(0, 1) n where l.slug like 'feat-%';

-- ================================================================== safe-08

-- Devices: the first browser is the baseline; a second one sends one e-mail; the same one again sends none.
set local role authenticated;
select pg_temp.as_user('f8100000-0000-4000-8000-000000000002', 'aal1', 'f8400000-0000-4000-8000-000000000001');
do $$ declare result jsonb; begin
  result := public.record_sign_in_device(repeat('a', 64), 'Chrome en Android');
  perform pg_temp.check((result->>'new_device')::boolean and not (result->>'emailed')::boolean, 'first device e-mailed: ' || result::text);
  result := public.record_sign_in_device(repeat('a', 64), 'Chrome en Android');
  perform pg_temp.check(not (result->>'new_device')::boolean, 'known device counted as new');
  result := public.record_sign_in_device(repeat('b', 64), 'Safari en iPhone');
  perform pg_temp.check((result->>'new_device')::boolean and (result->>'emailed')::boolean, 'second device not e-mailed: ' || result::text);
  perform pg_temp.check(pg_temp.emails('account_new_device', 'f8100000-0000-4000-8000-000000000002') = 1, 'new-device e-mail count');
  perform pg_temp.expect_error($q$select public.record_sign_in_device('not-a-hash', 'x')$q$, 'DEVICE_INVALID');
  perform pg_temp.expect_error('select * from public.account_devices', 'permission denied');
end $$;
reset role;
do $$ begin
  perform pg_temp.check((select context->>'device' from laria_private.marketplace_email_deliveries
    where event_type = 'account_new_device' and recipient_user_id = 'f8100000-0000-4000-8000-000000000002') = 'Safari en iPhone',
    'e-mail does not name the device');
end $$;
set local role anon;
select pg_temp.as_anon();
do $$ begin
  perform pg_temp.expect_error($q$select public.record_sign_in_device(repeat('c', 64), 'x')$q$, 'permission denied');
  perform pg_temp.expect_error('select * from public.list_my_sessions()', 'permission denied');
end $$;
reset role;

-- Sessions: only one's own, the current one marked; another can be closed, the current one cannot.
insert into auth.sessions (id, user_id, aal, user_agent, created_at) values
 ('f8400000-0000-4000-8000-000000000001','f8100000-0000-4000-8000-000000000002','aal1','Mozilla/5.0 (Linux; Android 14) Chrome/130', now() - interval '2 hours'),
 ('f8400000-0000-4000-8000-000000000002','f8100000-0000-4000-8000-000000000002','aal1','Mozilla/5.0 (iPhone) Safari', now() - interval '1 day'),
 ('f8400000-0000-4000-8000-000000000003','f8100000-0000-4000-8000-000000000003','aal1','Firefox', now());
update public.account_devices set last_session_id = 'f8400000-0000-4000-8000-000000000002' where device_hash = repeat('b', 64);
set local role authenticated;
select pg_temp.as_user('f8100000-0000-4000-8000-000000000002', 'aal1', 'f8400000-0000-4000-8000-000000000001');
do $$ begin
  perform pg_temp.check((select count(*) from public.list_my_sessions()) = 2, 'sessions of another account listed');
  perform pg_temp.check((select is_current from public.list_my_sessions() where session_id = 'f8400000-0000-4000-8000-000000000001'), 'current session not marked');
  perform pg_temp.check((select device_label from public.list_my_sessions() where session_id = 'f8400000-0000-4000-8000-000000000002') = 'Safari en iPhone', 'device label missing');
  perform pg_temp.expect_error($q$select public.revoke_my_session('f8400000-0000-4000-8000-000000000001')$q$, 'SESSION_IS_CURRENT');
  perform pg_temp.check(not public.revoke_my_session('f8400000-0000-4000-8000-000000000003'), 'closed another account''s session');
  perform pg_temp.check(public.revoke_my_session('f8400000-0000-4000-8000-000000000002'), 'own session not closed');
  perform pg_temp.check((select count(*) from public.list_my_sessions()) = 1, 'closed session still listed');
  -- That browser is forgotten: signing in there again is a new device.
  perform pg_temp.check((public.record_sign_in_device(repeat('b', 64), 'Safari en iPhone')->>'new_device')::boolean, 'revoked device still trusted');
end $$;
reset role;
do $$ begin
  perform pg_temp.check(exists (select 1 from auth.sessions where id = 'f8400000-0000-4000-8000-000000000003'), 'other account''s session deleted');
end $$;

-- Signing out everywhere forgets every other browser and every push device.
insert into laria_private.push_subscriptions (user_id, endpoint, p256dh, auth_secret)
values ('f8100000-0000-4000-8000-000000000002', 'https://fcm.googleapis.com/fcm/send/feat-qa', 'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAAAAAA');
set local role authenticated;
select pg_temp.as_user('f8100000-0000-4000-8000-000000000002', 'aal1', 'f8400000-0000-4000-8000-000000000004');
do $$ begin perform public.record_sign_in_device(repeat('b', 64), 'Safari en iPhone'); end $$;
select pg_temp.as_user('f8100000-0000-4000-8000-000000000002', 'aal1', 'f8400000-0000-4000-8000-000000000001');
do $$ begin
  perform public.record_sign_in_device(repeat('a', 64), 'Chrome en Android');
  perform pg_temp.check(public.prepare_sign_out_everywhere() = 1, 'other browsers not forgotten');
end $$;
reset role;
do $$ begin
  perform pg_temp.check(not exists (select 1 from laria_private.push_subscriptions where user_id = 'f8100000-0000-4000-8000-000000000002'), 'push device kept');
  perform pg_temp.check((select revoked_at is null from public.account_devices where device_hash = repeat('a', 64)), 'current browser forgotten');
end $$;

-- The store-owner requirement: no approved payment method yet, so contact changes pass on a first-step session.
set local role authenticated;
select pg_temp.as_user('f8100000-0000-4000-8000-000000000001');
do $$ begin
  update public.stores set whatsapp_phone = '51999996011' where id = 'f8200000-0000-4000-8000-000000000001';
  perform pg_temp.check(not (public.my_two_step_requirement()->>'required')::boolean, 'required before any approved method');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.store_payment_methods (store_id, method, status, holder_name, reviewed_by, reviewed_at)
values ('f8200000-0000-4000-8000-000000000001', 'yape_plin', 'approved', 'Dueña Tienda', 'f8100000-0000-4000-8000-000000000099', now());
set local role authenticated;
select pg_temp.as_user('f8100000-0000-4000-8000-000000000001');
do $$ begin
  perform pg_temp.check(not (public.my_two_step_requirement()->>'required')::boolean, 'pilot store must not need two-step');
  update public.stores set whatsapp_phone = '51999996012' where id = 'f8200000-0000-4000-8000-000000000001';
  update public.stores set name = 'Otra Tienda' where id = 'f8200000-0000-4000-8000-000000000001';
  -- Other columns are not guarded.
  update public.stores set description = 'Tienda de prueba con descripción.' where id = 'f8200000-0000-4000-8000-000000000001';
end $$;
select pg_temp.as_user('f8100000-0000-4000-8000-000000000001', 'aal2');
do $$ begin
  update public.stores set whatsapp_phone = '51999996013' where id = 'f8200000-0000-4000-8000-000000000001';
end $$;
reset role;

-- A verified factor makes payment-method writes need the second step for anyone, Admin included.
-- (Browsers never write the table; the trigger guards the definer functions that do, so this runs as the owner role
-- with an Admin's claims.)
insert into auth.mfa_factors (user_id, status) values ('f8100000-0000-4000-8000-000000000099', 'verified');
select set_config('request.jwt.claims', '{"sub":"f8100000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal1","app_metadata":{"role":"admin"}}', true);
do $$ begin
  perform pg_temp.expect_error($q$update public.store_payment_methods set owner_note = 'Nota de prueba' where store_id = 'f8200000-0000-4000-8000-000000000001'$q$, 'TWO_STEP_REQUIRED');
end $$;
select set_config('request.jwt.claims', '{"sub":"f8100000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal2","app_metadata":{"role":"admin"}}', true);
update public.store_payment_methods set owner_note = 'Nota de prueba' where store_id = 'f8200000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '', true);

-- Recovery codes: only on a second-factor session; each works once; five wrong tries lock for a while.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8100000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal1","app_metadata":{"role":"admin"}}', true);
do $$ begin
  perform pg_temp.expect_error('select public.create_my_recovery_codes()', 'TWO_STEP_REQUIRED');
end $$;
select pg_temp.as_admin();
do $$ declare codes text[]; begin
  codes := public.create_my_recovery_codes();
  perform pg_temp.check(cardinality(codes) = 10 and codes[1] ~ '^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$', 'codes malformed: ' || codes::text);
  perform set_config('qa.code', codes[1], true);
  perform set_config('qa.code2', codes[2], true);
end $$;
select set_config('request.jwt.claims', '{"sub":"f8100000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal1","app_metadata":{"role":"admin"}}', true);
do $$ begin
  perform pg_temp.check(public.use_my_recovery_code(lower(replace(current_setting('qa.code'), '-', ' '))), 'valid code refused');
  perform pg_temp.check(not public.use_my_recovery_code(current_setting('qa.code')), 'used code accepted twice');
  perform pg_temp.check((public.my_two_step_requirement()->>'recovery_codes_left')::integer = 9, 'codes left wrong');
  perform pg_temp.check(not public.use_my_recovery_code('AAAA-AAAA'), 'wrong code accepted');
  perform pg_temp.check(not public.use_my_recovery_code('AAAA-AAAB'), 'wrong code accepted');
  perform pg_temp.check(not public.use_my_recovery_code('AAAA-AAAC'), 'wrong code accepted');
  perform pg_temp.check(not public.use_my_recovery_code('AAAA-AAAD'), 'wrong code accepted');
  perform pg_temp.expect_error($q$select public.use_my_recovery_code(current_setting('qa.code2'))$q$, 'RECOVERY_RATE_LIMITED');
  perform pg_temp.expect_error('select public.create_my_recovery_codes()', 'TWO_STEP_REQUIRED');
end $$;
reset role;
do $$ begin
  perform pg_temp.check(pg_temp.emails('account_two_step_reset', 'f8100000-0000-4000-8000-000000000099') = 1, 'reset e-mail missing');
end $$;

-- ================================================================== safe-10

set local role service_role;
select pg_temp.as_service();
do $$ declare ticket jsonb; begin
  ticket := public.service_submit_help_ticket('Visitante', 'Visita@Example.invalid', 'comprar', '¿Cómo sé si un vendedor es confiable?', repeat('d', 64), null, '/ayuda');
  perform pg_temp.check(ticket->>'code' ~ '^AY-[0-9A-F]{8}$', 'ticket code malformed');
  perform pg_temp.expect_error($q$select public.service_submit_help_ticket('V', 'x@example.invalid', 'comprar', 'Mensaje largo de prueba', repeat('d', 64))$q$, 'HELP_TICKET_INVALID');
  perform pg_temp.expect_error($q$select public.service_submit_help_ticket('Visitante', 'x@example.invalid', 'inventado', 'Mensaje largo de prueba', repeat('d', 64))$q$, 'HELP_TICKET_INVALID');
  perform pg_temp.expect_error($q$select public.service_submit_help_ticket('Visitante', 'no-es-correo', 'comprar', 'Mensaje largo de prueba', repeat('d', 64))$q$, 'HELP_TICKET_INVALID');
  perform public.service_submit_help_ticket('Visitante', 'visita@example.invalid', 'otro', 'Segunda pregunta de prueba', repeat('d', 64));
  perform public.service_submit_help_ticket('Visitante', 'visita@example.invalid', 'otro', 'Tercera pregunta de prueba', repeat('d', 64));
  perform public.service_submit_help_ticket('Visitante', 'visita@example.invalid', 'otro', 'Cuarta pregunta de prueba', repeat('d', 64));
  perform public.service_submit_help_ticket('Visitante', 'visita@example.invalid', 'otro', 'Quinta pregunta de prueba', repeat('d', 64));
  perform pg_temp.expect_error($q$select public.service_submit_help_ticket('Visitante', 'visita@example.invalid', 'otro', 'Sexta pregunta de prueba', repeat('d', 64))$q$, 'HELP_TICKET_RATE_LIMITED');

end $$;
reset role;
set local role anon;
select pg_temp.as_anon();
do $$ begin
  perform pg_temp.expect_error($q$select public.submit_help_ticket('Visitante', 'direct@example.invalid', 'otro', 'Consulta directa sin servidor')$q$, 'permission denied');
  perform pg_temp.expect_error('select * from public.help_tickets', 'permission denied');
  perform pg_temp.expect_error('select public.my_help_tickets()', 'permission denied');
end $$;
reset role;
set local role authenticated;
select pg_temp.as_user('f8100000-0000-4000-8000-000000000003');
do $$ begin
  -- Signed in: the account's own address is used when none is given.
  perform public.submit_help_ticket('Compra Persona', null, 'cuenta', 'No puedo cambiar mi correo electrónico.');
  perform pg_temp.check(jsonb_array_length(public.my_help_tickets()) = 1, 'own ticket not listed');
  perform pg_temp.expect_error('select public.admin_help_tickets()', 'ADMIN_REQUIRED');
end $$;
select pg_temp.as_admin();
do $$ declare result jsonb; account_ticket uuid; anon_ticket uuid; begin
  result := public.admin_help_tickets('abierto', 50);
  perform pg_temp.check(jsonb_array_length(result->'items') = 6, 'open tickets wrong: ' || (result->'counts')::text);
  select (item->>'id')::uuid into account_ticket from jsonb_array_elements(result->'items') item where (item->>'has_account')::boolean;
  select (item->>'id')::uuid into anon_ticket from jsonb_array_elements(result->'items') item where item->>'topic' = 'comprar';
  result := public.admin_answer_help_ticket(account_ticket, 'Desde Mi cuenta > Perfil puedes cambiarlo.');
  perform pg_temp.check((result->>'emailed')::boolean and result->>'email' is null, 'account ticket answer not e-mailed');
  result := public.admin_answer_help_ticket(anon_ticket, 'Revisa las reseñas y los consejos de seguridad.', true);
  perform pg_temp.check(not (result->>'emailed')::boolean and result->>'email' = 'visita@example.invalid' and result->>'status' = 'cerrado', 'anon ticket answer wrong');
  perform pg_temp.check(public.admin_set_help_ticket_status(anon_ticket, 'abierto') = 'abierto', 'reopen failed');
end $$;
select pg_temp.as_user('f8100000-0000-4000-8000-000000000003');
do $$ begin
  perform pg_temp.check(public.my_help_tickets()->0->>'status' = 'respondido' and public.my_help_tickets()->0->>'answer' like 'Desde Mi cuenta%', 'answer not visible to the person');
end $$;
reset role;
do $$ begin
  perform pg_temp.check(pg_temp.emails('help_ticket_answered', 'f8100000-0000-4000-8000-000000000003') = 1, 'answer e-mail missing');
end $$;

-- ================================================================== safe-05

-- The particular's original and second listing share an owner; the other account's pending listing copies a photo.
select set_config('qa.h1', pg_temp.hash64('original-1'), true), set_config('qa.h2', pg_temp.hash64('original-2'), true);
set local role authenticated;
select pg_temp.as_user('f8100000-0000-4000-8000-000000000004');
do $$ begin
  perform pg_temp.expect_error($q$select public.service_record_listing_fingerprints('f8300000-0000-4000-8000-000000000002', '[]')$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.admin_red_flags()$q$, 'ADMIN_REQUIRED');
end $$;
reset role;
set local role service_role;
select pg_temp.as_service();
do $$ declare todo jsonb; result jsonb; begin
  todo := public.listings_needing_fingerprints(50);
  perform pg_temp.check((select count(*) from jsonb_array_elements(todo) item where item->>'listing_id' like 'f83%') = 4, 'to-do list wrong');
  perform pg_temp.check((todo->0->>'listing_id') = 'f8300000-0000-4000-8000-000000000002', 'pending listing not first');
  result := public.service_record_listing_fingerprints('f8300000-0000-4000-8000-000000000001', jsonb_build_array(
    jsonb_build_object('key', 'https://example.invalid/feat-original-0.jpg', 'sort_order', 0, 'dhash', current_setting('qa.h1')),
    jsonb_build_object('key', 'https://example.invalid/feat-original-1.jpg', 'sort_order', 1, 'dhash', current_setting('qa.h2'))));
  perform pg_temp.check((result->>'flags')::integer = 0, 'flag without a copy');
  -- Same owner reusing a photo: no flag.
  result := public.service_record_listing_fingerprints('f8300000-0000-4000-8000-000000000003', jsonb_build_array(
    jsonb_build_object('key', 'https://example.invalid/feat-mismo-dueno-0.jpg', 'sort_order', 0, 'dhash', current_setting('qa.h1'))));
  perform pg_temp.check((result->>'flags')::integer = 0, 'same owner flagged');
  -- A flat picture never counts.
  result := public.service_record_listing_fingerprints('f8300000-0000-4000-8000-000000000004', jsonb_build_array(
    jsonb_build_object('key', 'https://example.invalid/feat-tienda-l-0.jpg', 'sort_order', 0, 'dhash', repeat('0', 64))));
  perform pg_temp.check((result->>'flags')::integer = 0, 'flat picture flagged');
  -- Another account, photo 2 within 4 bits of the original's photo 2.
  result := public.service_record_listing_fingerprints('f8300000-0000-4000-8000-000000000002', jsonb_build_array(
    jsonb_build_object('key', 'https://example.invalid/feat-copia-0.jpg', 'sort_order', 0, 'dhash', pg_temp.hash64('unrelated')),
    jsonb_build_object('key', 'https://example.invalid/feat-copia-1.jpg', 'sort_order', 1, 'dhash', pg_temp.flip(current_setting('qa.h2'), 4))));
  perform pg_temp.check((result->>'flags')::integer = 1, 'copy not flagged: ' || result::text);
  -- Recording again is idempotent, and the listing leaves the to-do list.
  result := public.service_record_listing_fingerprints('f8300000-0000-4000-8000-000000000002', jsonb_build_array(
    jsonb_build_object('key', 'https://example.invalid/feat-copia-1.jpg', 'sort_order', 1, 'dhash', pg_temp.flip(current_setting('qa.h2'), 4))));
  perform pg_temp.check((result->>'flags')::integer = 0, 'flag repeated');
  todo := public.listings_needing_fingerprints(50);
  perform pg_temp.check(not exists (select 1 from jsonb_array_elements(todo) item where item->>'listing_id' like 'f83%'), 'hashed listings still to do');
  perform pg_temp.expect_error($q$select public.service_record_listing_fingerprints('f8300000-0000-4000-8000-000000000002', '[{"key":"x","dhash":"012"}]')$q$, 'FINGERPRINT_INVALID');
end $$;
reset role;
do $$ begin
  perform pg_temp.check((select listing_id from public.listing_red_flags) = 'f8300000-0000-4000-8000-000000000002'
    and (select matched_listing_id from public.listing_red_flags) = 'f8300000-0000-4000-8000-000000000001'
    and (select detail->>'photo' from public.listing_red_flags) = '2' and (select detail->>'distance' from public.listing_red_flags) = '4',
    'flag attached to the wrong listing or reason');
end $$;
-- A changed photo set goes back on the to-do list.
update public.listing_photos set image_url = 'https://example.invalid/feat-copia-1b.jpg' where image_url = 'https://example.invalid/feat-copia-1.jpg';
set local role service_role;
select pg_temp.as_service();
do $$ begin
  perform pg_temp.check(exists (select 1 from jsonb_array_elements(public.listings_needing_fingerprints(50)) item
    where item->>'listing_id' = 'f8300000-0000-4000-8000-000000000002'), 'changed photos not re-hashed');
  perform pg_temp.check((public.service_listings_fingerprint_state(array['f8300000-0000-4000-8000-000000000001']::uuid[])->0->>'current')::boolean, 'state wrong');
end $$;
reset role;
set local role authenticated;
select pg_temp.as_admin();
do $$ declare flags jsonb; begin
  flags := public.admin_listing_red_flags(array['f8300000-0000-4000-8000-000000000002']::uuid[]);
  perform pg_temp.check(jsonb_array_length(flags) = 1 and flags->0->'matched'->>'slug' = 'feat-original'
    and flags->0->'matched'->>'seller' = 'Vende Particular', 'Admin flag view wrong: ' || flags::text);
  perform pg_temp.check(public.admin_review_red_flag((flags->0->>'id')::uuid, 'confirmed', 'Mismas fotos.') = 'confirmed', 'review failed');
  perform pg_temp.expect_error(format('select public.admin_review_red_flag(%L, %L)', flags->0->>'id', 'dismissed'), 'RED_FLAG_NOT_OPEN');
  perform pg_temp.check(jsonb_array_length(public.admin_listing_red_flags(array['f8300000-0000-4000-8000-000000000002']::uuid[])) = 0, 'reviewed flag still open');
  perform pg_temp.check((public.admin_red_flags('confirmed')->'counts'->>'confirmed')::integer = 1, 'counts wrong');
end $$;
reset role;
do $$ begin
  perform pg_temp.check((select status from public.listings where id = 'f8300000-0000-4000-8000-000000000002') = 'pending', 'flag changed the listing');
end $$;

-- ================================================================== safe-02

-- Private serials: the owner sets and reads them; nobody else, not even through the table.
set local role authenticated;
select pg_temp.as_user('f8100000-0000-4000-8000-000000000004');
do $$ begin
  perform pg_temp.check(public.set_listing_serial('f8300000-0000-4000-8000-000000000002', 'us 1234-5678'), 'serial not saved');
  perform pg_temp.check(public.get_listing_serial('f8300000-0000-4000-8000-000000000002') = 'us 1234-5678', 'serial not read back');
  perform pg_temp.expect_error($q$select public.set_listing_serial('f8300000-0000-4000-8000-000000000001', 'AB1234')$q$, 'LISTING_SERIAL_FORBIDDEN');
  perform pg_temp.expect_error($q$select public.get_listing_serial('f8300000-0000-4000-8000-000000000001')$q$, 'LISTING_SERIAL_FORBIDDEN');
  perform pg_temp.expect_error($q$select public.set_listing_serial('f8300000-0000-4000-8000-000000000002', 'A1')$q$, 'LISTING_SERIAL_INVALID');
  perform pg_temp.expect_error('select * from public.listing_serials', 'permission denied');
end $$;
select pg_temp.as_user('f8100000-0000-4000-8000-000000000002');
do $$ begin
  perform public.set_listing_serial('f8300000-0000-4000-8000-000000000001', 'MX-777-888');
end $$;
reset role;

-- Reports: a serial or a photo is required; photo paths must be under the reporter's folder.
set local role anon;
select pg_temp.as_anon();
do $$ begin
  perform pg_temp.expect_error($q$select public.submit_stolen_gear_report('Fender', 'Strat', 'Guitarra robada en mi casa', 'US12345678', current_date, 'Lima', 'DEN-1', null)$q$, 'permission denied');
end $$;
reset role;
set local role authenticated;
select pg_temp.as_user('f8100000-0000-4000-8000-000000000003');
do $$ declare report jsonb; begin
  perform pg_temp.expect_error($q$select public.submit_stolen_gear_report('Fender', 'Strat', 'Guitarra robada en mi casa', null, current_date, 'Lima', 'DEN-1', null)$q$, 'STOLEN_SERIAL_OR_PHOTO_REQUIRED');
  perform pg_temp.expect_error($q$select public.submit_stolen_gear_report('Fender', 'Strat', 'Guitarra robada en mi casa', null, current_date, 'Lima', 'DEN-1', null,
    '[{"path":"f8100000-0000-4000-8000-000000000004/f8500000-0000-4000-8000-000000000001/0.jpg"}]')$q$, 'STOLEN_PHOTOS_INVALID');
  perform pg_temp.expect_error($q$select public.submit_stolen_gear_report('Fender', 'Strat', 'Guitarra robada en mi casa', 'US1234', current_date + 3, 'Lima', 'DEN-1', null)$q$, 'STOLEN_REPORT_INVALID');
  -- Same serial as the other account's listing (written differently): a match for Admin.
  report := public.submit_stolen_gear_report('Fender', 'Stratocaster', 'Guitarra robada en mi casa en Miraflores', 'US12345678', current_date - 3,
    'Miraflores, Lima', 'DEN-2026-001', 'Comisaría Miraflores',
    jsonb_build_array(jsonb_build_object('path', 'f8100000-0000-4000-8000-000000000003/f8500000-0000-4000-8000-000000000001/0.jpg',
      'dhash', current_setting('qa.h1'))));
  perform pg_temp.check(report->>'code' ~ '^RB-[0-9A-F]{8}$', 'report code malformed');
  perform set_config('qa.report', report->>'id', true);
  -- The reporter sees the report, not the pending matches.
  perform pg_temp.check(public.my_stolen_reports()->0->>'confirmed_matches' = '0', 'pending matches shown to the reporter');
  perform pg_temp.expect_error('select * from public.stolen_report_matches', 'permission denied');
end $$;
reset role;
do $$ begin
  -- Serial match on the copy listing; photo matches on the two listings whose first photo was hashed with h1.
  perform pg_temp.check((select count(*) from public.stolen_report_matches where report_id = current_setting('qa.report')::uuid) = 3,
    'matches wrong: ' || (select string_agg(source || ':' || ref_id, ', ') from public.stolen_report_matches));
  perform pg_temp.check(exists (select 1 from public.stolen_report_matches where source = 'listing'
    and listing_id = 'f8300000-0000-4000-8000-000000000002' and detail->>'serial' = 'US12345678'), 'serial match missing');
  perform pg_temp.check(exists (select 1 from public.stolen_report_matches where source = 'photo'
    and listing_id = 'f8300000-0000-4000-8000-000000000001' and detail->>'distance' = '0'), 'photo match missing');
end $$;

-- A serial added later, on a store SKU, matches too; the reporter's own listing never does.
insert into public.store_inventory_items (id, store_id, merchant_sku, sku_normalized, product_name, listing_id)
values ('f8600000-0000-4000-8000-000000000001', 'f8200000-0000-4000-8000-000000000001', 'B-SR-1', 'B-SR-1', 'Ibanez SR', 'f8300000-0000-4000-8000-000000000004');
set local role authenticated;
select pg_temp.as_user('f8100000-0000-4000-8000-000000000001', 'aal2');
do $$ begin
  perform pg_temp.check(public.set_inventory_item_serials('f8600000-0000-4000-8000-000000000001', array['SR-0001', 'us-1234 5678', 'SR-0001']) = 2, 'SKU serials not saved');
  perform pg_temp.check(public.get_inventory_item_serials('f8600000-0000-4000-8000-000000000001') = array['SR-0001', 'us-1234 5678'], 'SKU serials not read back');
end $$;
select pg_temp.as_user('f8100000-0000-4000-8000-000000000004');
do $$ begin
  perform pg_temp.expect_error($q$select public.set_inventory_item_serials('f8600000-0000-4000-8000-000000000001', array['X12345'])$q$, 'INVENTORY_SERIAL_FORBIDDEN');
end $$;
reset role;
do $$ begin
  perform pg_temp.check(exists (select 1 from public.stolen_report_matches where source = 'inventory'
    and inventory_item_id = 'f8600000-0000-4000-8000-000000000001' and listing_id = 'f8300000-0000-4000-8000-000000000004'), 'SKU match missing');
  -- "Mi equipo" (selling-tools) calls the entry point with its own row id and owner.
  perform pg_temp.check(laria_private.flag_serial_against_stolen_reports('US-12345678', 'gear', 'f8700000-0000-4000-8000-000000000001', 'f8100000-0000-4000-8000-000000000003') = 0, 'reporter''s own gear matched');
  perform pg_temp.check(laria_private.flag_serial_against_stolen_reports('US-12345678', 'gear', 'f8700000-0000-4000-8000-000000000002', 'f8100000-0000-4000-8000-000000000002') = 1, 'gear match missing');
  perform pg_temp.check(laria_private.flag_serial_against_stolen_reports('US-12345678', 'gear', 'f8700000-0000-4000-8000-000000000002', 'f8100000-0000-4000-8000-000000000002') = 0, 'gear match repeated');
end $$;
set local role authenticated;
select pg_temp.as_user('f8100000-0000-4000-8000-000000000003');
do $$ begin
  -- The entry point is for other database code, not for browsers.
  perform pg_temp.expect_error('select laria_private.flag_serial_against_stolen_reports(''x'', ''gear'', null)', 'permission denied');
end $$;
reset role;

-- Admin: the queue explains each match; confirming tells the reporter once, dismissing says nothing.
set local role authenticated;
select pg_temp.as_admin();
do $$ declare queue jsonb; serial_match uuid; photo_match uuid; result jsonb; begin
  queue := public.admin_stolen_matches('pending', 50);
  perform pg_temp.check(jsonb_array_length(queue->'items') = 5, 'pending matches wrong: ' || (queue->'counts')::text);
  select (item->>'id')::uuid into serial_match from jsonb_array_elements(queue->'items') item where item->>'source' = 'listing';
  select (item->>'id')::uuid into photo_match from jsonb_array_elements(queue->'items') item where item->>'source' = 'photo';
  perform pg_temp.check((select item->'report'->>'police_report' from jsonb_array_elements(queue->'items') item where item->>'source' = 'listing') = 'DEN-2026-001', 'report details missing');
  result := public.admin_review_stolen_match(serial_match, 'confirmed', 'Mismo número de serie.');
  perform pg_temp.check((result->>'reporter_notified')::boolean, 'reporter not told');
  result := public.admin_review_stolen_match(photo_match, 'dismissed');
  perform pg_temp.check(not (result->>'reporter_notified')::boolean, 'dismissal told the reporter');
  perform pg_temp.expect_error(format('select public.admin_review_stolen_match(%L, %L)', serial_match, 'dismissed'), 'STOLEN_MATCH_NOT_PENDING');
  perform pg_temp.check(jsonb_array_length(public.admin_stolen_reports('active')) >= 1, 'reports list empty');
end $$;
select pg_temp.as_user('f8100000-0000-4000-8000-000000000003');
do $$ begin
  perform pg_temp.check(public.my_stolen_reports()->0->>'confirmed_matches' = '1', 'confirmed match not counted for the reporter');
  perform pg_temp.check(public.set_my_stolen_report_status(current_setting('qa.report')::uuid, 'recovered') = 'recovered', 'recovered not saved');
  perform pg_temp.expect_error(format('select public.set_my_stolen_report_status(%L, %L)', current_setting('qa.report'), 'withdrawn'), 'STOLEN_REPORT_NOT_ACTIVE');
end $$;
reset role;
do $$ begin
  perform pg_temp.check(pg_temp.emails('stolen_report_match', 'f8100000-0000-4000-8000-000000000003') = 1, 'match e-mail count');
  perform pg_temp.check((select context->>'item' from laria_private.marketplace_email_deliveries where event_type = 'stolen_report_match') = 'Fender Stratocaster', 'e-mail item wrong');
  perform pg_temp.check(not exists (select 1 from public.stolen_report_matches where report_id = current_setting('qa.report')::uuid and status = 'pending'), 'matches left pending after recovery');
  perform pg_temp.check(position('robad' in (select context::text from laria_private.marketplace_email_deliveries where event_type = 'stolen_report_match')) = 0, 'e-mail context says robado');
end $$;

-- ================================================================== safe-09

-- Export: the account's own data under every heading.
set local role authenticated;
select pg_temp.as_user('f8100000-0000-4000-8000-000000000002');
do $$ declare export jsonb; begin
  export := public.export_my_data();
  perform pg_temp.check(export->'account'->>'email' = 'feat-seller@example.invalid', 'export account wrong');
  perform pg_temp.check(jsonb_array_length(export->'listings') = 2, 'export listings wrong');
  perform pg_temp.check((select item->>'serial' from jsonb_array_elements(export->'listings') item where item->>'slug' = 'feat-original') = 'MX-777-888', 'export serial missing');
  perform pg_temp.check(export ?& array['favorites', 'follows', 'alerts', 'reviews_written', 'reviews_received', 'purchases_and_sales',
    'questions', 'help_tickets', 'stolen_gear_reports', 'devices', 'drafts'], 'export headings missing');
  perform pg_temp.check((public.my_account_deletion_check()->>'allowed')::boolean
    and (public.my_account_deletion_check()->>'listings_removed')::integer = 2, 'deletion check wrong');
end $$;
select pg_temp.as_user('f8100000-0000-4000-8000-000000000001', 'aal2');
do $$ begin
  perform pg_temp.check(public.my_account_deletion_check()->>'blocker' = 'store', 'store owner not blocked');
end $$;
select pg_temp.as_admin();
do $$ begin
  perform pg_temp.check(public.my_account_deletion_check()->>'blocker' = 'admin', 'admin not blocked');
end $$;
select pg_temp.as_user('f8100000-0000-4000-8000-000000000002');
do $$ begin
  perform pg_temp.expect_error($q$select public.service_delete_account('f8100000-0000-4000-8000-000000000002')$q$, 'permission denied');
end $$;
reset role;

-- Deletion: a favorite and a verified sale exist; the sale stays, everything personal goes.
insert into public.favorites (user_id, listing_id) values ('f8100000-0000-4000-8000-000000000002', 'f8300000-0000-4000-8000-000000000004');
set local role service_role;
select pg_temp.as_service();
do $$ declare result jsonb; begin
  perform pg_temp.expect_error($q$select public.service_delete_account('f8100000-0000-4000-8000-000000000001')$q$, 'DELETE_BLOCKED_STORE');
  result := public.service_delete_account('f8100000-0000-4000-8000-000000000002');
  perform pg_temp.check((result->>'listings_archived')::integer = 2, 'listings not removed: ' || result::text);
end $$;
reset role;
do $$ begin
  perform pg_temp.check((select full_name from public.profiles where id = 'f8100000-0000-4000-8000-000000000002') = 'Cuenta eliminada'
    and (select phone from public.profiles where id = 'f8100000-0000-4000-8000-000000000002') is null, 'profile not anonymized');
  perform pg_temp.check(not exists (select 1 from public.listings where owner_user_id = 'f8100000-0000-4000-8000-000000000002' and status <> 'archived'), 'listings left public');
  perform pg_temp.check(not exists (select 1 from public.favorites where user_id = 'f8100000-0000-4000-8000-000000000002'), 'favorites kept');
  perform pg_temp.check(not exists (select 1 from public.account_devices where user_id = 'f8100000-0000-4000-8000-000000000002'), 'devices kept');
  perform pg_temp.check(not exists (select 1 from public.listing_serials where listing_id = 'f8300000-0000-4000-8000-000000000001'), 'serial kept');
end $$;

-- The reporter's own deletion removes their reports and queues the photos for the uploads sweep.
set local role service_role;
select pg_temp.as_service();
do $$ declare result jsonb; begin
  result := public.service_delete_account('f8100000-0000-4000-8000-000000000003');
  perform pg_temp.check((result->'features'->>'stolen_reports')::integer = 1
    and (result->'features'->>'stolen_photos_queued')::integer >= 1
    and (result->'features'->>'help_tickets')::integer = 1, 'feature data not removed: ' || result::text);
end $$;
reset role;
do $$ begin
  perform pg_temp.check(exists (select 1 from laria_private.upload_removals where bucket = 'stolen-gear-photos'
    and path like 'f8100000-0000-4000-8000-000000000003/%' and removed_at is null), 'stolen-gear photo not queued');
end $$;

rollback;
