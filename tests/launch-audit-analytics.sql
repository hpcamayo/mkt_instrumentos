-- Launch audit A33 (supabase/migrations/20261114180000_launch_audit_analytics.sql): a visitor's batch of events is
-- recorded in one call with the same rules as one at a time, and card impressions older than 90 days become daily
-- counts per listing without changing a number that Mis estadísticas or Admin show. Local/test database only. Every
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
    if position(p_code in sqlerrm) > 0 or sqlstate = p_code then return; end if;
    raise exception 'Expected % from [%], got: % (%)', p_code, p_sql, sqlerrm, sqlstate;
  end;
  raise exception 'Expected % from [%], but it succeeded', p_code, p_sql;
end $$;
create function pg_temp.claims(p_sub text, p_admin boolean) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_sub, 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', case when p_admin then jsonb_build_object('role', 'admin') else '{}'::jsonb end)::text, true)
$$;
-- A moment p_days_ago days before today, in Lima.
create function pg_temp.lima(p_days_ago integer, p_time time) returns timestamptz language sql stable as $$
  select (((now() at time zone 'America/Lima')::date - p_days_ago) + p_time) at time zone 'America/Lima'
$$;
grant execute on function pg_temp.check(boolean, text), pg_temp.expect_error(text, text), pg_temp.claims(text, boolean),
  pg_temp.lima(integer, time) to anon, authenticated, service_role;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('a3300000-0000-4000-8000-000000000001','authenticated','authenticated','la33-vendedor@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Vendedor A33","phone":"51999993301","city":"Lima","region":"Lima"}'),
 ('a3300000-0000-4000-8000-000000000002','authenticated','authenticated','la33-tienda@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Tienda A33","phone":"51999993302","city":"Lima","region":"Lima"}'),
 ('a3300000-0000-4000-8000-000000000003','authenticated','authenticated','la33-admin@example.invalid',now(),'{"role":"admin"}','{"account_type":"seller","full_name":"Admin A33","phone":"51999993303","city":"Lima","region":"Lima"}'),
 ('a3300000-0000-4000-8000-000000000004','authenticated','authenticated','la33-comprador@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Comprador A33","phone":"51999993304","city":"Lima","region":"Lima"}');

insert into public.stores(id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,is_verified,listing_plan)
values ('a3300000-0000-4000-8000-000000000010','la33-tienda','Tienda A33','Tienda A33 SAC','20777333301','la33-tienda@example.invalid','Contacto','Contacto','51999993302','Lima','Lima','Av. A33 1','a3300000-0000-4000-8000-000000000002','active',false,'free');

insert into public.listings(id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at,published_at,view_count,sold_at)
values
 ('a3300000-0000-4000-8000-000000000021','la33-a','A33 guitarra A','individual','approved','guitars','electric_guitar','Yamaha','QA','Usado - buen estado',1200,'Lima','Lima','Vendedor A33','51999993301','Descripción temporal suficientemente larga para probar las métricas del lote.','a3300000-0000-4000-8000-000000000001',null,'self_service',now(),now(),5,null),
 ('a3300000-0000-4000-8000-000000000022','la33-b','A33 guitarra B','individual','approved','guitars','electric_guitar','Yamaha','QA','Usado - buen estado',1300,'Lima','Lima','Vendedor A33','51999993301','Descripción temporal suficientemente larga para probar las métricas del lote.','a3300000-0000-4000-8000-000000000001',null,'self_service',now(),now(),0,null),
 ('a3300000-0000-4000-8000-000000000023','la33-c','A33 guitarra en revisión','individual','pending','guitars','electric_guitar','Yamaha','QA','Usado - buen estado',1400,'Lima','Lima','Vendedor A33','51999993301','Descripción temporal suficientemente larga para probar las métricas del lote.','a3300000-0000-4000-8000-000000000001',null,'self_service',now(),null,0,null);

insert into public.listing_photos(listing_id,image_url,sort_order)
select id,'https://example.invalid/la33-'||id||'-'||n||'.jpg',n
from public.listings cross join generate_series(0,1) n
where id::text like 'a3300000-%';

-- ------------------------------------------------------------------ who may do what

do $$ begin
  perform pg_temp.check(has_function_privilege('service_role', 'public.record_marketplace_events(uuid, jsonb, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.record_marketplace_events(uuid, jsonb, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.record_marketplace_events(uuid, jsonb, uuid)', 'execute'),
    'only the service role records a batch');
  perform pg_temp.check(not has_function_privilege('authenticated', 'laria_private.roll_up_listing_impressions(integer)', 'execute')
    and not has_function_privilege('anon', 'laria_private.run_listing_impression_rollup()', 'execute')
    and not has_function_privilege('authenticated', 'laria_private.run_listing_impression_rollup()', 'execute'),
    'the rollup stays private');
  perform pg_temp.check(not has_table_privilege('anon', 'laria_private.listing_impression_days', 'select')
    and not has_table_privilege('authenticated', 'laria_private.listing_impression_days', 'select')
    and not has_table_privilege('authenticated', 'laria_private.listing_impression_days', 'insert')
    and not has_table_privilege('authenticated', 'laria_private.listing_impression_rollup_clock', 'update'),
    'no API role reads or writes the daily counts');
  perform pg_temp.check((select relrowsecurity from pg_class where oid = 'laria_private.listing_impression_days'::regclass), 'RLS is on');
  perform pg_temp.check(exists (select 1 from cron.job where jobname = 'listing-impression-rollup' and schedule = '40 9 * * *'
    and command like '%laria_private.run_listing_impression_rollup()%'), 'the daily job is scheduled');
  perform pg_temp.check((select confdeltype = 'c' from pg_constraint
    where conrelid = 'laria_private.listing_impression_days'::regclass and contype = 'f'), 'a deleted listing takes its counts');
end $$;

-- ------------------------------------------------------------------ one call per batch

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare
  batch constant jsonb := '[
    {"event_id":"a3300000-0000-4000-8000-000000000101","event_type":"store_view","store_id":"a3300000-0000-4000-8000-000000000010","source":"store"},
    {"event_id":"a3300000-0000-4000-8000-000000000102","event_type":"listing_view","listing_id":"a3300000-0000-4000-8000-000000000021","source":"detail"},
    {"event_id":"a3300000-0000-4000-8000-000000000103","event_type":"listing_impression","listing_id":"a3300000-0000-4000-8000-000000000022","source":"catalog","metadata":{}},
    {"event_id":"a3300000-0000-4000-8000-000000000104","event_type":"listing_impression","listing_id":"a3300000-0000-4000-8000-000000000021","source":"catalog"},
    {"event_id":"a3300000-0000-4000-8000-000000000105","event_type":"listing_impression","listing_id":"a3300000-0000-4000-8000-000000000023","source":"catalog"},
    {"event_id":"a3300000-0000-4000-8000-000000000106","event_type":"search","source":"catalog","metadata":{"query":"yamaha","filters":{"sort":"newest"},"result_count":0}}
  ]';
  receipts jsonb;
begin
  receipts := public.record_marketplace_events('a3300000-0000-4000-8000-000000000031', batch);
  perform pg_temp.check((select array_agg(r ->> 'event_id' order by n) from jsonb_array_elements(receipts) with ordinality x(r, n))
    = (select array_agg(e ->> 'event_id' order by n) from jsonb_array_elements(batch) with ordinality x(e, n)),
    'one receipt per event, in the order sent: ' || receipts::text);
  perform pg_temp.check(receipts -> 0 ->> 'recorded' = 'true', 'the store visit counts');
  perform pg_temp.check(receipts -> 1 = '{"event_id":"a3300000-0000-4000-8000-000000000102","recorded":true,"view_count":6}',
    'the listing view counts and answers the new view count: ' || (receipts -> 1)::text);
  perform pg_temp.check(receipts -> 2 ->> 'recorded' = 'true' and receipts -> 3 ->> 'recorded' = 'true', 'both cards count');
  perform pg_temp.check(receipts -> 4 = '{"event_id":"a3300000-0000-4000-8000-000000000105","recorded":false}',
    'a listing in review is not counted');
  perform pg_temp.check(receipts -> 5 ->> 'recorded' = 'true', 'the search counts');
  perform pg_temp.check((select metadata ->> 'zero_results' = 'true' and session_id = 'a3300000-0000-4000-8000-000000000031'
    from public.marketplace_events where id = 'a3300000-0000-4000-8000-000000000106'), 'the search keeps its checked metadata');
  perform pg_temp.check((select view_count from public.listings where id = 'a3300000-0000-4000-8000-000000000021') = 6, 'one more view');

  -- The browser's one retry after a lost answer sends the same events: nothing counts twice.
  receipts := public.record_marketplace_events('a3300000-0000-4000-8000-000000000031', batch);
  perform pg_temp.check(not exists (select 1 from jsonb_array_elements(receipts) r where r ->> 'recorded' = 'true'),
    'a resent batch records nothing: ' || receipts::text);
  perform pg_temp.check(receipts -> 1 ->> 'view_count' = '6', 'and the view count stays');
  perform pg_temp.check((select count(*) from public.marketplace_events where id::text like 'a3300000-0000-4000-8000-0000000001%') = 5,
    'five events, the one in review never');

  -- The seller's own card is not counted; a signed-in buyer counts once every 30 minutes, whatever the session.
  receipts := public.record_marketplace_events('a3300000-0000-4000-8000-000000000032',
    '[{"event_id":"a3300000-0000-4000-8000-000000000111","event_type":"listing_impression","listing_id":"a3300000-0000-4000-8000-000000000021","source":"catalog"}]',
    'a3300000-0000-4000-8000-000000000001');
  perform pg_temp.check(receipts -> 0 ->> 'recorded' = 'false', 'the owner is not counted');
  receipts := public.record_marketplace_events('a3300000-0000-4000-8000-000000000032',
    '[{"event_id":"a3300000-0000-4000-8000-000000000112","event_type":"listing_view","listing_id":"a3300000-0000-4000-8000-000000000021","source":"detail"}]',
    'a3300000-0000-4000-8000-000000000004');
  perform pg_temp.check(receipts -> 0 ->> 'recorded' = 'true' and receipts -> 0 ->> 'view_count' = '7', 'a buyer''s view counts');
  receipts := public.record_marketplace_events('a3300000-0000-4000-8000-000000000033',
    '[{"event_id":"a3300000-0000-4000-8000-000000000113","event_type":"listing_view","listing_id":"a3300000-0000-4000-8000-000000000021","source":"detail"}]',
    'a3300000-0000-4000-8000-000000000004');
  perform pg_temp.check(receipts -> 0 ->> 'recorded' = 'false', 'the same buyer in another session is not counted again');

  -- The same card twice in one batch counts once.
  receipts := public.record_marketplace_events('a3300000-0000-4000-8000-000000000034', '[
    {"event_id":"a3300000-0000-4000-8000-000000000114","event_type":"listing_impression","listing_id":"a3300000-0000-4000-8000-000000000022","source":"catalog"},
    {"event_id":"a3300000-0000-4000-8000-000000000115","event_type":"listing_impression","listing_id":"a3300000-0000-4000-8000-000000000022","source":"catalog"}]');
  perform pg_temp.check(receipts -> 0 ->> 'recorded' = 'true' and receipts -> 1 ->> 'recorded' = 'false', 'one card, once: ' || receipts::text);
end $$;

-- A malformed batch, or one event the rules refuse, fails the whole call.
select pg_temp.expect_error($$select public.record_marketplace_events('a3300000-0000-4000-8000-000000000035', '[]')$$, 'EVENT_BATCH_INVALID');
select pg_temp.expect_error($$select public.record_marketplace_events('a3300000-0000-4000-8000-000000000035', null)$$, 'EVENT_BATCH_INVALID');
select pg_temp.expect_error($$select public.record_marketplace_events('a3300000-0000-4000-8000-000000000035', '{"event_id":"a3300000-0000-4000-8000-000000000120"}')$$, 'EVENT_BATCH_INVALID');
select pg_temp.expect_error($$select public.record_marketplace_events('a3300000-0000-4000-8000-000000000035', '[1]')$$, 'EVENT_BATCH_INVALID');
select pg_temp.expect_error($$select public.record_marketplace_events('a3300000-0000-4000-8000-000000000035',
  (select jsonb_agg(jsonb_build_object('event_id', gen_random_uuid(), 'event_type', 'listing_impression',
    'listing_id', 'a3300000-0000-4000-8000-000000000022')) from generate_series(1, 21)))$$, 'EVENT_BATCH_INVALID');
select pg_temp.expect_error($$select public.record_marketplace_events('a3300000-0000-4000-8000-000000000035',
  '[{"event_id":"a3300000-0000-4000-8000-000000000121","event_type":"listing_view","listing_id":"a3300000-0000-4000-8000-000000000022","actor_user_id":"a3300000-0000-4000-8000-000000000004"}]')$$,
  'EVENT_BATCH_INVALID');
select pg_temp.expect_error($$select public.record_marketplace_events('a3300000-0000-4000-8000-000000000035',
  '[{"event_id":"a3300000-0000-4000-8000-000000000122","event_type":"listing_impression","listing_id":"a3300000-0000-4000-8000-000000000022"},
    {"event_id":"a3300000-0000-4000-8000-000000000123","event_type":"listing_approved","listing_id":"a3300000-0000-4000-8000-000000000022"}]')$$,
  'Client cannot emit lifecycle events.');
select pg_temp.expect_error($$select public.record_marketplace_events('a3300000-0000-4000-8000-000000000035',
  '[{"event_id":"a3300000-0000-4000-8000-000000000124","event_type":"listing_impression","listing_id":"a3300000-0000-4000-8000-000000000022","metadata":{"message":"no"}}]')$$,
  'No freeform event metadata allowed.');
select set_config('request.jwt.claims', '{"sub":"a3300000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select pg_temp.expect_error($$select public.record_marketplace_events('a3300000-0000-4000-8000-000000000035',
  '[{"event_id":"a3300000-0000-4000-8000-000000000125","event_type":"listing_impression","listing_id":"a3300000-0000-4000-8000-000000000022"}]')$$,
  'Service access required.');
reset role;

-- ------------------------------------------------------------------ daily counts of old card impressions

-- Card impressions of listing A 100, 95 and 91 days ago (to move), at today's midnight 90 days ago and 89 days ago (to
-- keep), one of listing B 100 days ago (to move), and a view 100 days ago (never moved).
delete from laria_private.listing_impression_rollup_clock where true;
insert into public.marketplace_events(event_type, created_at, listing_id, seller_user_id, session_id, source)
select event_type, pg_temp.lima(days_ago, at::time), listing_id::uuid, 'a3300000-0000-4000-8000-000000000001', gen_random_uuid(), 'catalog'
from (values
  ('listing_impression', 100, '09:00', 'a3300000-0000-4000-8000-000000000021'),
  ('listing_impression', 100, '12:00', 'a3300000-0000-4000-8000-000000000021'),
  ('listing_impression', 100, '23:00', 'a3300000-0000-4000-8000-000000000021'),
  ('listing_impression', 95, '00:00', 'a3300000-0000-4000-8000-000000000021'),
  ('listing_impression', 95, '18:30', 'a3300000-0000-4000-8000-000000000021'),
  ('listing_impression', 91, '23:59:59', 'a3300000-0000-4000-8000-000000000021'),
  ('listing_impression', 90, '00:00', 'a3300000-0000-4000-8000-000000000021'),
  ('listing_impression', 89, '12:00', 'a3300000-0000-4000-8000-000000000021'),
  ('listing_impression', 100, '15:00', 'a3300000-0000-4000-8000-000000000022'),
  ('listing_view', 100, '15:01', 'a3300000-0000-4000-8000-000000000021')
) fixture(event_type, days_ago, at, listing_id);

create temp table la33_numbers(label text primary key, seller jsonb, admin jsonb);
create function pg_temp.numbers(p_label text) returns void language plpgsql as $$
declare seller jsonb; admin jsonb;
begin
  perform pg_temp.claims('a3300000-0000-4000-8000-000000000001', false);
  seller := jsonb_build_object('all', public.get_account_analytics(0), 'week', public.get_account_analytics(7),
    'month', public.get_account_analytics(30), 'quarter', public.get_listing_statistics(90));
  perform pg_temp.claims('a3300000-0000-4000-8000-000000000003', true);
  admin := jsonb_build_object('all', public.get_marketplace_admin_analytics(0), 'week', public.get_marketplace_admin_analytics(7),
    'month', public.get_marketplace_admin_analytics(30));
  insert into la33_numbers values (p_label, seller, admin);
end $$;

select pg_temp.numbers('before');
do $$ declare seller jsonb := (select seller from la33_numbers where label = 'before'); begin
  perform pg_temp.check((select (item ->> 'impressions')::integer from jsonb_array_elements(seller #> '{all,listings}') item
    where item ->> 'id' = 'a3300000-0000-4000-8000-000000000021') = 9, 'all time, card A was seen 9 times: ' || (seller -> 'all')::text);
  perform pg_temp.check((select (item ->> 'impressions')::integer from jsonb_array_elements(seller #> '{all,listings}') item
    where item ->> 'id' = 'a3300000-0000-4000-8000-000000000022') = 3, 'and card B 3 times');
end $$;

do $$ declare today date := (now() at time zone 'America/Lima')::date; begin
  perform pg_temp.check(laria_private.run_listing_impression_rollup() = 7, 'the 7 impressions of days that ended 90 days ago move');
  perform pg_temp.check((select jsonb_agg(jsonb_build_array(listing_id, today - day, impressions) order by listing_id, day)
    from laria_private.listing_impression_days where listing_id::text like 'a3300000-%') = jsonb_build_array(
      jsonb_build_array('a3300000-0000-4000-8000-000000000021', 100, 3), jsonb_build_array('a3300000-0000-4000-8000-000000000021', 95, 2),
      jsonb_build_array('a3300000-0000-4000-8000-000000000021', 91, 1), jsonb_build_array('a3300000-0000-4000-8000-000000000022', 100, 1)),
    'one count per listing and Lima day');
  perform pg_temp.check((select count(*) from public.marketplace_events where event_type = 'listing_impression'
    and listing_id::text like 'a3300000-%' and created_at < pg_temp.lima(90, '00:00')) = 0, 'their events are gone');
  perform pg_temp.check((select array_agg(today - (created_at at time zone 'America/Lima')::date order by created_at)
    from public.marketplace_events where event_type = 'listing_impression' and listing_id = 'a3300000-0000-4000-8000-000000000021'
      and created_at < now() - interval '1 day') = array[90, 89], 'the impressions of the last 90 days stay');
  perform pg_temp.check(exists (select 1 from public.marketplace_events where event_type = 'listing_view'
    and listing_id = 'a3300000-0000-4000-8000-000000000021' and created_at = pg_temp.lima(100, '15:01')), 'a view is never moved');
  perform pg_temp.check((select next_day from laria_private.listing_impression_rollup_clock) = today - 90, 'the clock waits for the next day');
  perform pg_temp.check(laria_private.run_listing_impression_rollup() = 0, 'a second run moves nothing');
end $$;

select pg_temp.numbers('after');
do $$ declare
  before la33_numbers := (select n from la33_numbers n where label = 'before');
  after la33_numbers := (select n from la33_numbers n where label = 'after');
begin
  perform pg_temp.check(after.seller = before.seller, 'Mis estadísticas show the same numbers in every period: '
    || (before.seller -> 'all')::text || ' / ' || (after.seller -> 'all')::text);
  perform pg_temp.check(after.admin = before.admin, 'Admin''s analytics show the same numbers in every period: '
    || (before.admin -> 'all')::text || ' / ' || (after.admin -> 'all')::text);
  perform pg_temp.check((after.admin #>> '{all,impressions}')::integer >= 12, 'Admin''s all-time impressions include the moved ones');
end $$;

-- A day stopped halfway goes on where it stopped: 5 impressions of card B 93 days ago, moved 2 at a time.
delete from laria_private.listing_impression_rollup_clock where true;
insert into public.marketplace_events(event_type, created_at, listing_id, seller_user_id, session_id, source)
select 'listing_impression', pg_temp.lima(93, '10:00') + n * interval '1 minute', 'a3300000-0000-4000-8000-000000000022',
  'a3300000-0000-4000-8000-000000000001', gen_random_uuid(), 'catalog'
from generate_series(1, 5) n;
select pg_temp.numbers('five more');
do $$ declare
  today date := (now() at time zone 'America/Lima')::date;
  moved_b integer;
begin
  perform pg_temp.check(laria_private.roll_up_listing_impressions(2) = 2, 'two at a time');
  perform pg_temp.check((select next_day from laria_private.listing_impression_rollup_clock) = today - 93, 'the day is not finished');
  perform pg_temp.check(laria_private.roll_up_listing_impressions(2) = 2, 'two more');
  perform pg_temp.check(laria_private.roll_up_listing_impressions(2) = 1, 'the last one');
  select impressions into moved_b from laria_private.listing_impression_days
  where listing_id = 'a3300000-0000-4000-8000-000000000022' and day = today - 93;
  perform pg_temp.check(moved_b = 5, 'the day''s count adds up: ' || coalesce(moved_b::text, 'none'));
  perform pg_temp.check((select next_day from laria_private.listing_impression_rollup_clock) = today - 90, 'and the clock moves on');
end $$;
select pg_temp.numbers('five moved');
do $$ begin
  perform pg_temp.check((select seller from la33_numbers where label = 'five moved') = (select seller from la33_numbers where label = 'five more')
    and (select admin from la33_numbers where label = 'five moved') = (select admin from la33_numbers where label = 'five more'),
    'the numbers stay the same');
end $$;

select pg_temp.expect_error('select laria_private.roll_up_listing_impressions(0)', 'Invalid limit.');
select pg_temp.expect_error('select laria_private.roll_up_listing_impressions(50001)', 'Invalid limit.');

rollback;
