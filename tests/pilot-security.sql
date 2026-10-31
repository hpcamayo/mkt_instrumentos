-- PR #54 security regression checks and the 2026-10-30 Admin-only pilot policy. All fixtures roll back.
begin;
create function pg_temp.check(ok boolean, message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FAILED: %', message; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if position(expected in sqlerrm)>0 then return; end if;
    raise exception 'Expected %, got %', expected, sqlerrm;
  end;
  raise exception 'Expected %, statement succeeded', expected;
end $$;
create function pg_temp.claims(who uuid, level text, admin boolean default false, session_id uuid default null)
returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_strip_nulls(jsonb_build_object('role','authenticated','sub',who,
   'aal',level,'session_id',session_id,'app_metadata',case when admin then '{"role":"admin"}'::jsonb else '{}'::jsonb end))::text,true);
$$;
do $$ begin
 if to_regclass('auth.mfa_factors') is null then
  create table auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid,status text);
 end if;
 if to_regclass('auth.sessions') is null then
  create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
 end if;
end $$;
insert into auth.users(id,email,role,aud,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
 ('ee540000-0000-4000-8000-000000000001','pilot-admin@example.invalid','authenticated','authenticated',now(),'{"role":"admin"}','{"full_name":"Admin QA","account_type":"seller"}'),
 ('ee540000-0000-4000-8000-000000000002','pilot-owner@example.invalid','authenticated','authenticated',now(),'{}','{"full_name":"Persona QA","account_type":"seller"}');
insert into auth.mfa_factors(user_id,status) values
 ('ee540000-0000-4000-8000-000000000001','verified'),('ee540000-0000-4000-8000-000000000002','verified');
insert into auth.sessions(id,user_id) values
 ('ee540000-0000-4000-8000-000000000011','ee540000-0000-4000-8000-000000000001');
insert into storage.objects(bucket_id,name) values
 ('stolen-gear-photos','ee540000-0000-4000-8000-000000000001/ee540000-0000-4000-8000-000000000021/1.jpg'),
 ('stolen-gear-photos','ee540000-0000-4000-8000-000000000002/ee540000-0000-4000-8000-000000000022/1.jpg');
set local role authenticated;
select pg_temp.claims('ee540000-0000-4000-8000-000000000002','aal1');
select pg_temp.check(not public.my_two_step_owed(),'pilot non-Admin must not owe a code even with a verified factor');
select pg_temp.check(not (public.my_two_step_requirement()->>'required')::boolean,'non-Admin requirement');
select pg_temp.check((select count(*)=1 from storage.objects where bucket_id='stolen-gear-photos'),'non-Admin private storage still works');
select pg_temp.expect_error('select public.create_my_recovery_codes()','TWO_STEP_ADMIN_ONLY');
select pg_temp.claims('ee540000-0000-4000-8000-000000000001','aal1',true,'ee540000-0000-4000-8000-000000000011');
select pg_temp.check(public.my_two_step_owed(),'Admin with factor owes code');
select set_config('request.path','/rpc/export_my_data',true);
select pg_temp.expect_error('select public.check_two_step_request()','TWO_STEP_REQUIRED');
select pg_temp.check((select count(*)=0 from storage.objects where bucket_id='stolen-gear-photos'),'Admin aal1 sees no private storage');
select pg_temp.claims('ee540000-0000-4000-8000-000000000001','aal2',true,'ee540000-0000-4000-8000-000000000011');
select public.check_two_step_request();
select pg_temp.check((select count(*)=1 from storage.objects where bucket_id='stolen-gear-photos'),'Admin aal2 reads own file');
reset role;
delete from auth.sessions where id='ee540000-0000-4000-8000-000000000011';
set local role authenticated;
select pg_temp.expect_error('select public.check_two_step_request()','AUTH_SESSION_REVOKED');
select set_config('request.path','/rpc/use_my_recovery_code',true);
select pg_temp.expect_error('select public.check_two_step_request()','AUTH_SESSION_REVOKED');
select pg_temp.check(public.my_two_step_owed(),'service-role route check must refuse a revoked aal2 token');
select pg_temp.check((select count(*)=0 from storage.objects where bucket_id='stolen-gear-photos'),'revoked aal2 reads no private file');
select pg_temp.expect_error($q$select public.service_finish_two_step_recovery('ee540000-0000-4000-8000-000000000001')$q$,'permission denied');

-- A direct authenticated caller cannot evade the account cap by changing email addresses or client hashes.
select pg_temp.claims('ee540000-0000-4000-8000-000000000002','aal1');
do $$ begin
 for n in 1..5 loop
  perform public.submit_help_ticket('Persona QA','pilot-user-'||n||'@example.invalid','otro','Consulta de prueba con texto suficiente',null,md5(n::text)||md5(n::text));
 end loop;
end $$;
select pg_temp.expect_error($q$select public.submit_help_ticket('Persona QA','pilot-user-extra@example.invalid','otro','Consulta de prueba con texto suficiente')$q$,'HELP_TICKET_RATE_LIMITED');
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.expect_error($q$select public.submit_help_ticket('Persona QA','pilot-direct@example.invalid','otro','Consulta de prueba con texto suficiente')$q$,'permission denied');
select pg_temp.expect_error($q$select public.service_submit_help_ticket('Persona QA','pilot-direct@example.invalid','otro','Consulta de prueba con texto suficiente',repeat('c',64))$q$,'permission denied');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ begin
 for n in 1..10 loop
  perform public.service_submit_help_ticket('Persona QA','pilot-anon-'||n||'@example.invalid','otro','Consulta de prueba con texto suficiente',repeat('c',64));
 end loop;
end $$;
select pg_temp.expect_error($q$select public.service_submit_help_ticket('Persona QA','pilot-anon-extra@example.invalid','otro','Consulta de prueba con texto suficiente',repeat('c',64))$q$,'HELP_TICKET_RATE_LIMITED');
select pg_temp.expect_error($q$select public.service_submit_help_ticket('Persona QA','pilot-null@example.invalid','otro','Consulta de prueba con texto suficiente',null)$q$,'HELP_TICKET_INVALID');
rollback;
