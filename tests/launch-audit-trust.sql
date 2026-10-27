-- Launch audit trust fixes (supabase/migrations/20261113120000_launch_audit_trust.sql). Local/test database only.
-- Every fixture is rolled back.
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
create function pg_temp.claims(p_sub text, p_admin boolean, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_sub, 'role', 'authenticated', 'aal', p_aal,
    'app_metadata', case when p_admin then jsonb_build_object('role', 'admin') else '{}'::jsonb end)::text, true)
$$;
grant execute on function pg_temp.check(boolean, text), pg_temp.expect_error(text, text), pg_temp.claims(text, boolean, text)
  to anon, authenticated;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e1300000-0000-4000-8000-000000000001','authenticated','authenticated','latru-particular@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Particular","phone":"51999996001","city":"Lima","region":"Lima"}'),
 ('e1300000-0000-4000-8000-000000000003','authenticated','authenticated','latru-admin@example.invalid',now(),'{"role":"admin"}','{"account_type":"seller","full_name":"Admin","phone":"51999996003","city":"Lima","region":"Lima"}');
insert into public.catalog_search_log (source, query_text) values ('listing_form', 'latru prueba');

-- A15: a password alone doesn't make an Admin; the session must have passed the authenticator code.
set local role authenticated;
select pg_temp.claims('e1300000-0000-4000-8000-000000000003', true, 'aal1');
select pg_temp.check(public.is_admin() is false, 'an aal1 Admin session is not Admin');
select pg_temp.expect_error('select public.get_admin_moderation_counts()', 'ADMIN_MFA_REQUIRED');
select pg_temp.check((select count(*) from public.catalog_search_log) = 0, 'an aal1 Admin reads no catalog search log');
select pg_temp.check((select count(*) from public.catalog_review_candidates) = 0, 'an aal1 Admin reads no catalog review queue');

select pg_temp.claims('e1300000-0000-4000-8000-000000000003', true, 'aal2');
select pg_temp.check(public.is_admin() is true, 'an aal2 Admin session is Admin');
select pg_temp.check(public.get_admin_moderation_counts() ? 'publicaciones', 'an aal2 Admin reads the moderation counts');
select pg_temp.check((select count(*) from public.catalog_search_log) >= 1, 'an aal2 Admin reads the catalog search log');

-- The second factor alone makes nobody Admin, and a missing level counts as aal1.
select pg_temp.claims('e1300000-0000-4000-8000-000000000001', false, 'aal2');
select pg_temp.check(public.is_admin() is false, 'a non-Admin aal2 session is not Admin');
select pg_temp.expect_error('select public.get_admin_moderation_counts()', 'ADMIN_REQUIRED');
select set_config('request.jwt.claims', '{"sub":"e1300000-0000-4000-8000-000000000003","role":"authenticated","app_metadata":{"role":"admin"}}', true);
select pg_temp.check(public.is_admin() is false, 'an Admin session without a level is not Admin');
select pg_temp.expect_error('select public.get_admin_moderation_counts()', 'ADMIN_MFA_REQUIRED');
reset role;

-- A16, A28: request counts per visitor, for the server only.
set local role anon;
select pg_temp.expect_error($$select public.consume_rate_limit('auth.login', 'latru-key', 3, 300)$$, '42501');
reset role;
set local role authenticated;
select pg_temp.claims('e1300000-0000-4000-8000-000000000001', false, 'aal1');
select pg_temp.expect_error($$select public.consume_rate_limit('auth.login', 'latru-key', 3, 300)$$, '42501');
reset role;

set local role service_role;
select pg_temp.check(public.consume_rate_limit('auth.login', 'latru-key', 3, 300), 'the 1st request of 3 goes on');
select pg_temp.check(public.consume_rate_limit('auth.login', 'latru-key', 3, 300), 'the 2nd request of 3 goes on');
select pg_temp.check(public.consume_rate_limit('auth.login', 'latru-key', 3, 300), 'the 3rd request of 3 goes on');
select pg_temp.check(public.consume_rate_limit('auth.login', 'latru-key', 3, 300) is false, 'the 4th request is refused');
select pg_temp.check(public.consume_rate_limit('auth.login', 'latru-key', 3, 300) is false, 'and so is the 5th');
select pg_temp.check(public.consume_rate_limit('auth.login', 'latru-other', 3, 300), 'another visitor has its own count');
select pg_temp.check(public.consume_rate_limit('auth.resend', 'latru-key', 3, 300), 'another route has its own count');
select pg_temp.expect_error($$select public.consume_rate_limit('Auth Login', 'latru-key', 3, 300)$$, 'RATE_LIMIT_INVALID');
select pg_temp.expect_error($$select public.consume_rate_limit('auth.login', '', 3, 300)$$, 'RATE_LIMIT_INVALID');
select pg_temp.expect_error($$select public.consume_rate_limit('auth.login', 'latru-key', 0, 300)$$, 'RATE_LIMIT_INVALID');
select pg_temp.expect_error($$select public.consume_rate_limit('auth.login', 'latru-key', 3, 0)$$, 'RATE_LIMIT_INVALID');
reset role;

select pg_temp.check(
  (select hits from laria_private.rate_limit_hits where bucket = 'auth.login' and key_hash = 'latru-key') = 5,
  'one row per visitor and window counts every request');
select pg_temp.check(
  (select bool_and(extract(epoch from window_start)::bigint % 300 = 0) from laria_private.rate_limit_hits
    where key_hash like 'latru-%'),
  'windows start on whole periods');

-- Rows from earlier days go as new requests arrive.
insert into laria_private.rate_limit_hits (bucket, key_hash, window_start, hits)
  values ('auth.login', 'latru-old', now() - interval '2 days', 9);
select setseed(0.42);
set local role service_role;
do $$ begin
  for i in 1..600 loop
    perform public.consume_rate_limit('auth.check_email', 'latru-sweep-' || i, 20, 600);
  end loop;
end $$;
reset role;
select pg_temp.check(not exists (select 1 from laria_private.rate_limit_hits where key_hash = 'latru-old'),
  'counts older than a day are removed');
select pg_temp.check(exists (select 1 from laria_private.rate_limit_hits where key_hash = 'latru-key'),
  'current counts stay');

-- A sweep removes at most 500 old counts, found by an index, so no request waits on a long delete.
select pg_temp.check(exists (select 1 from pg_indexes where schemaname = 'laria_private' and tablename = 'rate_limit_hits'
    and indexname = 'rate_limit_hits_window_start_idx'), 'old counts are found by an index');
insert into laria_private.rate_limit_hits (bucket, key_hash, window_start, hits)
  select 'auth.login', 'latru-bulk-' || i, now() - interval '3 days', 1 from generate_series(1, 700) i;
do $$
declare
  before_count integer;
  after_count integer;
begin
  for i in 1..2000 loop
    select count(*) into before_count from laria_private.rate_limit_hits where key_hash like 'latru-bulk-%';
    perform public.consume_rate_limit('auth.check_email', 'latru-bulk-sweep', 100000, 600);
    select count(*) into after_count from laria_private.rate_limit_hits where key_hash like 'latru-bulk-%';
    if after_count < before_count then
      perform pg_temp.check(before_count - after_count = 500, 'one sweep removes 500 old counts, not ' || (before_count - after_count));
      return;
    end if;
  end loop;
  raise exception 'FAILED: no sweep in 2000 requests';
end $$;

rollback;
