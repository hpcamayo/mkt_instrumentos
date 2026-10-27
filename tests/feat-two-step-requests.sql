-- Feature ideas, integration (migration 20261210120700): a session that owes its authenticator code (aal1, with a
-- verified factor) is refused by PostgREST's pre-request check and by Storage, except the calls signing in and the code
-- step make. Actual Auth claims and request paths as PostgREST sets them; local/test database only, every fixture rolls
-- back. tests/feat-two-step-requests.test.cjs checks the allowlist against the app's calls.
begin;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;
create function pg_temp.claims(p_role text, p_sub text, p_aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_strip_nulls(jsonb_build_object('role', p_role, 'sub', p_sub, 'aal', p_aal))::text, true);
end $$;
-- What PostgREST's pre-request check answers for a request to p_path: null when it lets the request through.
create function pg_temp.refusal(p_path text) returns text language plpgsql as $$
begin
  perform set_config('request.path', p_path, true);
  perform public.check_two_step_request();
  return null;
exception when insufficient_privilege then
  return sqlerrm;
end $$;
grant execute on function pg_temp.check(boolean, text), pg_temp.claims(text, text, text), pg_temp.refusal(text)
  to anon, authenticated;

-- Supabase Auth's factor table, where the Docker-free database lacks it (dropped with the rollback).
do $$ begin
  if to_regclass('auth.mfa_factors') is null then
    create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, friendly_name text,
      factor_type text not null default 'totp', status text not null, created_at timestamptz default now(), updated_at timestamptz default now());
  end if;
end $$;

insert into auth.users (id, aud, role, email, email_confirmed_at, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
 ('f9200000-0000-4000-8000-000000000001','authenticated','authenticated','two-step-app@example.invalid',now(),'x','{}','{"account_type":"seller","full_name":"Con App","phone":"51999996001","city":"Lima","region":"Lima"}'),
 ('f9200000-0000-4000-8000-000000000002','authenticated','authenticated','two-step-none@example.invalid',now(),'x','{}','{"account_type":"seller","full_name":"Sin App","phone":"51999996002","city":"Lima","region":"Lima"}'),
 ('f9200000-0000-4000-8000-000000000003','authenticated','authenticated','two-step-half@example.invalid',now(),'x','{}','{"account_type":"seller","full_name":"App a Medias","phone":"51999996003","city":"Lima","region":"Lima"}');
insert into auth.mfa_factors (user_id, status) values
  ('f9200000-0000-4000-8000-000000000001', 'verified'),
  -- A setup that never got its first code.
  ('f9200000-0000-4000-8000-000000000003', 'unverified');
insert into storage.objects (bucket_id, name) values
  ('stolen-gear-photos', 'f9200000-0000-4000-8000-000000000001/aaaaaaaa-0000-4000-8000-000000000001/1.jpg'),
  ('stolen-gear-photos', 'f9200000-0000-4000-8000-000000000002/aaaaaaaa-0000-4000-8000-000000000002/1.jpg');

-- PostgREST runs the check for every request (20261210120700 sets it on the authenticator role).
select pg_temp.check(exists (
  select 1 from pg_db_role_setting s
  where s.setrole = 'authenticator'::regrole and s.setdatabase = 0
    and 'pgrst.db_pre_request=public.check_two_step_request' = any (s.setconfig)
), 'the authenticator role names the pre-request check');

-- Visitors, the service role, accounts without a factor and aal2 sessions pass everywhere.
set local role anon;
select pg_temp.claims('anon', null, null);
select pg_temp.check(pg_temp.refusal('/listings') is null, 'a visitor reads the catalog');
reset role;
select pg_temp.claims('service_role', null, null);
select pg_temp.check(pg_temp.refusal('/rpc/claim_marketplace_email_deliveries') is null, 'the service role');
set local role authenticated;
select pg_temp.claims('authenticated', 'f9200000-0000-4000-8000-000000000002', 'aal1');
select pg_temp.check(pg_temp.refusal('/profiles') is null, 'an account without the app, at aal1');
select pg_temp.check(public.my_two_step_owed() is false, 'an account without the app owes nothing');
select pg_temp.claims('authenticated', 'f9200000-0000-4000-8000-000000000003', 'aal1');
select pg_temp.check(pg_temp.refusal('/profiles') is null, 'a factor that was never verified asks for nothing');
select pg_temp.claims('authenticated', 'f9200000-0000-4000-8000-000000000001', 'aal2');
select pg_temp.check(pg_temp.refusal('/profiles') is null, 'the account with the app, after its code (aal2)');
select pg_temp.check(public.my_two_step_owed() is false, 'an aal2 session owes nothing');

-- The account with the app, after the password only: refused, except the four calls of signing in and the code step.
select pg_temp.claims('authenticated', 'f9200000-0000-4000-8000-000000000001', 'aal1');
select pg_temp.check(public.my_two_step_owed() is true, 'aal1 with a verified factor owes its code');
select pg_temp.check(pg_temp.refusal('/profiles') = 'TWO_STEP_REQUIRED', 'a table read');
select pg_temp.check(pg_temp.refusal('/listings') = 'TWO_STEP_REQUIRED', 'even a public table, as this account');
select pg_temp.check(pg_temp.refusal('/rpc/export_my_data') = 'TWO_STEP_REQUIRED', 'a function call');
select pg_temp.check(pg_temp.refusal('/rpc/my_two_step_requirement/extra') = 'TWO_STEP_REQUIRED', 'only the exact paths');
select pg_temp.check(pg_temp.refusal('') = 'TWO_STEP_REQUIRED', 'no path');
select pg_temp.check(pg_temp.refusal('/rpc/my_two_step_owed') is null, 'my_two_step_owed');
select pg_temp.check(pg_temp.refusal('/rpc/my_two_step_requirement') is null, 'my_two_step_requirement (Seguridad, middleware)');
select pg_temp.check(pg_temp.refusal('/rpc/record_sign_in_device') is null, 'record_sign_in_device (sign-in)');
select pg_temp.check(pg_temp.refusal('/rpc/use_my_recovery_code') is null, 'use_my_recovery_code (No tengo mi teléfono)');
-- No claim of a level reads as aal1.
select pg_temp.claims('authenticated', 'f9200000-0000-4000-8000-000000000001', null);
select pg_temp.check(pg_temp.refusal('/profiles') = 'TWO_STEP_REQUIRED', 'a token without aal');

-- Storage: the same session sees and changes nothing; after its code it reads its own photo again.
select pg_temp.claims('authenticated', 'f9200000-0000-4000-8000-000000000001', 'aal1');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'stolen-gear-photos') = 0,
  'a session that owes its code reads no file');
do $$ begin
  insert into storage.objects (bucket_id, name)
  values ('stolen-gear-photos', 'f9200000-0000-4000-8000-000000000001/aaaaaaaa-0000-4000-8000-000000000001/2.jpg');
  raise exception 'FAILED: a session that owes its code uploaded a file';
exception when insufficient_privilege then null;
end $$;
do $$ declare removed integer; begin
  delete from storage.objects where bucket_id = 'stolen-gear-photos';
  get diagnostics removed = row_count;
  perform pg_temp.check(removed = 0, 'nor deletes one');
end $$;
select pg_temp.claims('authenticated', 'f9200000-0000-4000-8000-000000000001', 'aal2');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'stolen-gear-photos') = 1,
  'after the code, the account reads its own photo (and not the other account''s)');
select pg_temp.claims('authenticated', 'f9200000-0000-4000-8000-000000000002', 'aal1');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'stolen-gear-photos') = 1,
  'an account without the app is unaffected');
reset role;

-- Who may call what: the check runs as the request's role; my_two_step_owed is for signed-in accounts.
select pg_temp.check(has_function_privilege('anon', 'public.check_two_step_request()', 'execute')
  and has_function_privilege('authenticated', 'public.check_two_step_request()', 'execute'), 'the check runs for every role');
select pg_temp.check(not has_function_privilege('anon', 'public.my_two_step_owed()', 'execute')
  and has_function_privilege('authenticated', 'public.my_two_step_owed()', 'execute'), 'my_two_step_owed: signed in only');
select pg_temp.check(not has_function_privilege('authenticated', 'laria_private.two_step_owed()', 'execute'),
  'the private helper is not callable');

rollback;
