-- UX-Effortless maybes, stock-24 and big-07 (supabase/migrations/20261120120000_maybes_ai_helpers.sql): the log of the
-- AI helpers' calls, written only by the server through public.record_ai_request, kept 90 days and unlinked from an
-- anonymized account, and the daily limits the two routes take from public.consume_rate_limit. Local/test database
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
create function pg_temp.claims(p_sub text) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_sub, 'role', 'authenticated', 'aal', 'aal1')::text, true)
$$;
grant execute on function pg_temp.check(boolean, text), pg_temp.expect_error(text, text), pg_temp.claims(text)
to anon, authenticated, service_role;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('ea860000-0000-4000-8000-000000000001','authenticated','authenticated','maybes-tienda@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueña Maybes","phone":"51999998601","city":"Lima","region":"Lima"}'),
 ('ea860000-0000-4000-8000-000000000002','authenticated','authenticated','maybes-uno@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Persona Maybes","phone":"51999998602","city":"Lima","region":"Lima"}'),
 ('ea860000-0000-4000-8000-000000000003','authenticated','authenticated','maybes-otra@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Otra Maybes","phone":"51999998603","city":"Cusco","region":"Cusco"}');
update public.profiles set account_type = 'store_owner' where id = 'ea860000-0000-4000-8000-000000000001';
select set_config('app.allow_store_admin_fields', 'true', true);
insert into public.stores (id, name, slug, whatsapp_phone, city, region, status, listing_plan, is_verified, ruc,
  owner_user_id, razon_social, email, address, contact_person, contact_name, show_address)
values ('ea861000-0000-4000-8000-000000000001', 'Tienda Maybes', 'maybes-ai-tienda', '987654386', 'Lima', 'Lima', 'active',
  'free', false, '20100048601', 'ea860000-0000-4000-8000-000000000001', 'MAYBES SAC', 'maybes@example.invalid', 'Av Uno 1',
  'Ana', 'Ana', false);

delete from laria_private.ai_requests where true;

-- ------------------------------------------------------------------------------------------ who reaches the log
do $$ declare
  r text;
  p text;
begin
  perform pg_temp.check((select relrowsecurity from pg_class where oid = 'laria_private.ai_requests'::regclass), 'RLS is on');
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    foreach p in array array['select', 'insert', 'update', 'delete'] loop
      perform pg_temp.check(not has_table_privilege(r, 'laria_private.ai_requests', p), r || ' has no ' || p || ' on the log');
    end loop;
    perform pg_temp.check(not has_function_privilege(r, 'laria_private.run_ai_request_retention()', 'execute')
      and not has_function_privilege(r, 'laria_private.unlink_anonymized_ai_requests()', 'execute'), r || ' runs neither the retention nor the unlinking');
  end loop;
  perform pg_temp.check(has_function_privilege('service_role', 'public.record_ai_request(text, uuid, uuid, text, integer, integer, text)', 'execute'),
    'the server writes the log');
  perform pg_temp.check(not has_function_privilege('anon', 'public.record_ai_request(text, uuid, uuid, text, integer, integer, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.record_ai_request(text, uuid, uuid, text, integer, integer, text)', 'execute'),
    'no visitor or account writes it');
  perform pg_temp.check((select count(*) = 3 and bool_and(p.prosecdef and p.proconfig = array['search_path=""']) from pg_proc p
    where p.oid in ('public.record_ai_request(text, uuid, uuid, text, integer, integer, text)'::regprocedure,
      'laria_private.run_ai_request_retention()'::regprocedure, 'laria_private.unlink_anonymized_ai_requests()'::regprocedure)),
    'security definer, with an empty search path');
  perform pg_temp.check((select count(*) = 2 and bool_and(c.confdeltype = 'n') and bool_or(c.confrelid = 'public.profiles'::regclass)
      and bool_or(c.confrelid = 'public.stores'::regclass)
    from pg_constraint c where c.conrelid = 'laria_private.ai_requests'::regclass and c.contype = 'f'),
    'deleting a profile or a store keeps its calls, without the link');
  perform pg_temp.check((select count(*) from pg_indexes where schemaname = 'laria_private' and tablename = 'ai_requests'
    and (indexname, indexdef) in (('ai_requests_user_idx', 'CREATE INDEX ai_requests_user_idx ON laria_private.ai_requests USING btree (user_id) WHERE (user_id IS NOT NULL)'),
      ('ai_requests_store_idx', 'CREATE INDEX ai_requests_store_idx ON laria_private.ai_requests USING btree (store_id) WHERE (store_id IS NOT NULL)'),
      ('ai_requests_created_at_idx', 'CREATE INDEX ai_requests_created_at_idx ON laria_private.ai_requests USING btree (created_at)'))) = 3,
    'each link has its partial index, and the retention its date index');
  perform pg_temp.check((select schedule = '55 9 * * *' and command = 'select laria_private.run_ai_request_retention()' and active
    from cron.job where jobname = 'ai-request-retention'), 'the retention runs every day');
  perform pg_temp.check(exists (select 1 from pg_trigger where tgname = 'account_anonymizations_unlink_ai_requests'
    and tgrelid = 'laria_private.account_anonymizations'::regclass and tgenabled = 'O' and not tgisinternal), 'anonymizing an account reaches the log');
  -- The log has no column for what was asked, the photos or the answer.
  perform pg_temp.check((select array_agg(attname::text order by attnum) from pg_attribute
    where attrelid = 'laria_private.ai_requests'::regclass and attnum > 0 and not attisdropped)
    = array['id', 'feature', 'user_id', 'store_id', 'model', 'input_tokens', 'output_tokens', 'outcome', 'created_at'], 'only the counts');
end $$;

set local role authenticated;
select pg_temp.claims('ea860000-0000-4000-8000-000000000002');
select pg_temp.expect_error($$select public.record_ai_request('listing_assist', 'ea860000-0000-4000-8000-000000000002', null, 'claude-opus-5-5', 1, 1, 'answered')$$, '42501');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect_error($$select public.record_ai_request('store_question', null, null, 'claude-opus-5-5', 1, 1, 'answered')$$, '42501');
reset role;

-- --------------------------------------------------------------------------------------------- what it records
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.record_ai_request('store_question', 'ea860000-0000-4000-8000-000000000001', 'ea861000-0000-4000-8000-000000000001', 'claude-opus-5-5', 1500, 400, 'answered');
select public.record_ai_request('store_question', 'ea860000-0000-4000-8000-000000000001', 'ea861000-0000-4000-8000-000000000001', 'claude-opus-5-5', 1400, 300, 'no_match');
select public.record_ai_request('listing_assist', 'ea860000-0000-4000-8000-000000000002', null, 'claude-haiku-5-5', 6500, 1500, 'answered');
select public.record_ai_request('listing_assist', 'ea860000-0000-4000-8000-000000000002', null, 'Claude Opus; drop table', -5, null, 'failed');
select public.record_ai_request('listing_assist', 'ea860000-0000-4000-8000-000000000003', null, 'claude-opus-5', 7000, 1600, 'refused');
select pg_temp.expect_error($$select public.record_ai_request('chat', null, null, 'claude-opus-5-5', 0, 0, 'answered')$$, 'AI_REQUEST_INVALID');
select pg_temp.expect_error($$select public.record_ai_request('store_question', null, null, 'claude-opus-5-5', 0, 0, 'ok')$$, 'AI_REQUEST_INVALID');
select pg_temp.expect_error($$select public.record_ai_request(null, null, null, 'claude-opus-5-5', 0, 0, 'answered')$$, '22023');
reset role;

select pg_temp.check((select count(*) from laria_private.ai_requests) = 5, 'one row per call');
select pg_temp.check((select row(model, input_tokens, output_tokens, outcome) = row('unknown'::text, 0, 0, 'failed'::text)
  from laria_private.ai_requests where model not like 'claude-%'), 'a model name outside the pattern is "unknown", and no count goes below 0');
select pg_temp.check((select count(*) = 2 and bool_and(store_id = 'ea861000-0000-4000-8000-000000000001')
  from laria_private.ai_requests where feature = 'store_question'), 'a store question counts for its store');
select pg_temp.check((select sum(input_tokens) = 2900 and sum(output_tokens) = 700 from laria_private.ai_requests
  where store_id = 'ea861000-0000-4000-8000-000000000001' and created_at >= date_trunc('day', now(), 'UTC')), 'what a store used today adds up');

-- ---------------------------------------------------------------------------------------------- anonymization
select laria_private.anonymize_account_core('ea860000-0000-4000-8000-000000000002', 'Prueba maybes', null);
select pg_temp.check((select count(*) = 2 and bool_and(user_id is null) from laria_private.ai_requests
  where feature = 'listing_assist' and model <> 'claude-opus-5'), 'the anonymized account''s calls lose it');
select pg_temp.check((select count(*) from laria_private.ai_requests where user_id = 'ea860000-0000-4000-8000-000000000001') = 2
  and (select count(*) from laria_private.ai_requests where user_id = 'ea860000-0000-4000-8000-000000000003') = 1, 'other accounts keep theirs');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.record_ai_request('listing_assist', 'ea860000-0000-4000-8000-000000000002', null, 'claude-opus-5-5', 10, 10, 'answered');
reset role;
select pg_temp.check((select user_id is null from laria_private.ai_requests where input_tokens = 10),
  'a call that ends after the account was anonymized is logged without it');

-- -------------------------------------------------------------------------------------------------- retention
insert into laria_private.ai_requests (feature, user_id, model, outcome, created_at) values
 ('listing_assist', 'ea860000-0000-4000-8000-000000000003', 'claude-opus-5-5', 'answered', now() - interval '91 days'),
 ('listing_assist', 'ea860000-0000-4000-8000-000000000003', 'claude-opus-5-5', 'invalid', now() - interval '89 days');
select pg_temp.check(laria_private.run_ai_request_retention() = 1, 'one row is older than 90 days');
select pg_temp.check(not exists (select 1 from laria_private.ai_requests where created_at < now() - interval '90 days')
  and exists (select 1 from laria_private.ai_requests where outcome = 'invalid'), 'the 89-day-old row stays');

-- ------------------------------------------------------------------------------------------- the daily limits
-- The counts below must land in one day: wait out a midnight (UTC) that is less than 20 seconds away.
do $$ begin
  if date_trunc('day', clock_timestamp(), 'UTC') + interval '1 day' - clock_timestamp() < interval '20 seconds' then
    perform pg_sleep(21);
  end if;
end $$;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare
  allowed integer := 0;
begin
  for i in 1..51 loop
    if public.consume_rate_limit('ai.store_question', 'maybes-store-key', 50, 86400) then allowed := allowed + 1; end if;
  end loop;
  perform pg_temp.check(allowed = 50, 'a store asks 50 questions a day, not 51: ' || allowed);
  perform pg_temp.check(public.consume_rate_limit('ai.store_question', 'maybes-other-store-key', 50, 86400), 'another store has its own 50');
  allowed := 0;
  for i in 1..21 loop
    if public.consume_rate_limit('ai.listing_assist', 'maybes-account-key', 20, 86400) then allowed := allowed + 1; end if;
  end loop;
  perform pg_temp.check(allowed = 20, 'an account gets 20 photo assists a day: ' || allowed);
  perform pg_temp.check(public.consume_rate_limit('ai.daily', 'site', 500, 86400), 'the site-wide cap is its own bucket');
end $$;
reset role;
select pg_temp.check((select window_start = date_trunc('day', now(), 'UTC') from laria_private.rate_limit_hits
  where bucket = 'ai.store_question' and key_hash = 'maybes-store-key'), 'the day starts at 00:00 UTC, 7 p. m. in Lima');

rollback;
