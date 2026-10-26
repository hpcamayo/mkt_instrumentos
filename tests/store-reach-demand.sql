-- Feature ideas, batch "store-reach" (docs/feature-ideas/store-reach.md): reach-06 "Lo que buscan en Laria".
-- Covers the monthly demand report: who counts, the floor of 5 people, free text that could identify someone, the
-- sections and cities, live publication counts, idempotent builds, pruning and who may read it.
-- Local/test database only; rolled back.
begin;

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

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;

create function pg_temp.as_user(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_admin() returns void language sql as $$
  select set_config('request.jwt.claims',
    '{"sub":"e1000000-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}', true);
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;

-- ------------------------------------------------------------------ free text the report may keep

select pg_temp.check(laria_private.demand_clean_query('  Yamaha   Pacífica ') = 'yamaha pacifica', 'folded and trimmed');
select pg_temp.check(laria_private.demand_clean_query('Fender Strat 012') = 'fender strat 012', 'model numbers kept');
select pg_temp.check(laria_private.demand_clean_query('RD-88 / B&W') = 'rd-88 / b&w', 'model punctuation kept');
select pg_temp.check(laria_private.demand_clean_query('x') is null, 'one letter dropped');
select pg_temp.check(laria_private.demand_clean_query(repeat('a', 61)) is null, 'over 60 characters dropped');
select pg_temp.check(laria_private.demand_clean_query('juan@correo.com') is null, 'e-mail dropped');
select pg_temp.check(laria_private.demand_clean_query('llamar 987 654 321') is null, 'phone dropped');
select pg_temp.check(laria_private.demand_clean_query('dni 45678912') is null, 'document number dropped');
select pg_temp.check(laria_private.demand_clean_query('<script>') is null, 'markup dropped');
select pg_temp.check(laria_private.demand_clean_query(null) is null, 'null stays null');

-- ------------------------------------------------------------------ fixtures

create temp table demand_fixture as
select (date_trunc('month', now() at time zone 'America/Lima') - interval '1 month')::date as month,
       (date_trunc('month', now() at time zone 'America/Lima') - interval '1 month' + interval '10 days')::timestamp
         at time zone 'America/Lima' as during;
grant select on demand_fixture to authenticated;

-- Buyers b01..b12 (Particular accounts), two store owners, and one more Particular account that holds a paused alert.
insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select ('e7400000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated',
       'reach-demand-' || n || '@example.invalid', now(), '{}', '{}'
from (select lpad(g::text, 2, '0') as n from generate_series(1, 13) g) buyers;
insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e7400000-0000-4000-8000-0000000000a1','authenticated','authenticated','reach-demand-owner@example.invalid',now(),'{}','{"account_type":"store_owner"}'),
 ('e7400000-0000-4000-8000-0000000000a2','authenticated','authenticated','reach-demand-owner2@example.invalid',now(),'{}','{"account_type":"store_owner"}');
insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('e7400000-0000-4000-8000-000000000001','reach-demand-tienda','Tienda Demanda','Tienda Demanda SAC','20999996001','dem@example.invalid','Contacto','Contacto','51999996001','Lima','Lima','Av. 1','e7400000-0000-4000-8000-0000000000a1','active','free',true),
 ('e7400000-0000-4000-8000-000000000002','reach-demand-pausa','Tienda Pausada','Pausada SAC','20999996002','pau@example.invalid','Contacto','Contacto','51999996002','Lima','Lima','Av. 2','e7400000-0000-4000-8000-0000000000a2','hidden','free',true);

-- Publications: two Yamaha keyboards of the store in Lima (one out of stock), a Particular's Yamaha in Arequipa, and a
-- pending Yamaha that must not count.
insert into public.listings (id, slug, title, seller_type, status, category, brand, model, city, region, whatsapp_phone, owner_user_id, store_id, price_pen)
values
 ('e7400000-0000-4000-8000-000000000101', 'reach-demand-1', 'Yamaha PSR-E373', 'store', 'approved', 'keyboards', 'Yamaha', 'PSR-E373', 'Lima', 'Lima', '51999996001', 'e7400000-0000-4000-8000-0000000000a1', 'e7400000-0000-4000-8000-000000000001', 1200),
 ('e7400000-0000-4000-8000-000000000102', 'reach-demand-2', 'Yamaha P-45', 'store', 'approved', 'keyboards', 'Yamaha', 'P-45', 'Lima', 'Lima', '51999996001', 'e7400000-0000-4000-8000-0000000000a1', 'e7400000-0000-4000-8000-000000000001', 2100),
 ('e7400000-0000-4000-8000-000000000103', 'reach-demand-3', 'Guitarra Yamaha Pacifica', 'individual', 'approved', 'guitars', 'Yamaha', 'Pacifica 112', 'Arequipa', 'Arequipa', '51999996003', 'e7400000-0000-4000-8000-000000000001', null, 900),
 ('e7400000-0000-4000-8000-000000000104', 'reach-demand-4', 'Yamaha pendiente', 'individual', 'pending', 'keyboards', 'Yamaha', 'X', 'Lima', 'Lima', '51999996004', 'e7400000-0000-4000-8000-000000000002', null, 500);
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set stock_state = 'out_of_stock' where id = 'e7400000-0000-4000-8000-000000000102';
select set_config('app.allow_listing_admin_fields', '', true);

-- Searches of last month. `person` is the account (b01..) or a session (s01..).
create temp table demand_searches (person text, query text, filters jsonb, result_count integer, at_offset interval default '0');
insert into demand_searches (person, query, filters, result_count) values
 -- Brand box "Yamaha": six Particular accounts, five in Lima (one of them twice), one in Arequipa.
 ('b01', 'Yamaha', '{"brand":"Yamaha","city":"Lima"}', 3), ('b01', 'Yamaha', '{"brand":"Yamaha","city":"Lima","sort":"price_asc"}', 3),
 ('b02', 'Yamaha', '{"brand":"Yamaha","city":"Lima"}', 3), ('b03', 'Yamaha', '{"brand":"yamaha","city":["Lima"]}', 3),
 ('b04', 'Yamaha', '{"brand":"Yamaha","city":"Lima"}', 3), ('b05', 'Yamaha', '{"brand":"Yamaha","city":"Lima"}', 3),
 ('b06', 'Yamaha', '{"brand":"Yamaha","city":"Arequipa"}', 1),
 -- Typed "yamaha pacifica" by five signed-out sessions: a brand by its text, and a typed search.
 ('s01', 'yamaha pacifica', '{"q":"yamaha pacifica"}', 1), ('s02', 'Yamaha Pacífica', '{"q":"Yamaha Pacífica"}', 1),
 ('s03', 'yamaha  pacifica', '{"q":"yamaha  pacifica"}', 1), ('s04', 'yamaha pacifica', '{"q":"yamaha pacifica"}', 1),
 ('s05', 'yamaha pacifica', '{"q":"yamaha pacifica"}', 1),
 -- Only four people typed "roland td": under the floor.
 ('b07', 'roland td', '{"q":"roland td"}', 0), ('b08', 'roland td', '{"q":"roland td"}', 0),
 ('b09', 'roland td', '{"q":"roland td"}', 0), ('b10', 'roland td', '{"q":"roland td"}', 0),
 -- Five people typed an e-mail: never kept, not even as a brand or a no-result search.
 ('s06', 'juan@correo.com', '{"q":"juan@correo.com"}', 0), ('s07', 'juan@correo.com', '{"q":"juan@correo.com"}', 0),
 ('s08', 'juan@correo.com', '{"q":"juan@correo.com"}', 0), ('s09', 'juan@correo.com', '{"q":"juan@correo.com"}', 0),
 ('s10', 'juan@correo.com', '{"q":"juan@correo.com"}', 0),
 -- Five people looked for theremins (category winds, type theremin) and found nothing, in Cusco.
 ('b07', '', '{"category":"winds","instrument_type":"theremin","city":"Cusco"}', 0),
 ('b08', '', '{"category":"winds","instrument_type":"theremin","city":"Cusco"}', 0),
 ('b09', '', '{"category":"winds","instrument_type":"theremin","city":"Cusco"}', 0),
 ('b10', '', '{"category":"winds","instrument_type":"theremin","city":"Cusco"}', 0),
 ('b11', '', '{"category":"winds","instrument_type":"theremin","city":"Cusco"}', 0),
 -- Five people with a price cap found no keyboards: a narrowed search, so not a "sin resultados" row.
 ('s11', '', '{"category":"keyboards","max_price":100}', 0), ('s12', '', '{"category":"keyboards","max_price":100}', 0),
 ('s13', '', '{"category":"keyboards","max_price":100}', 0), ('s14', '', '{"category":"keyboards","max_price":100}', 0),
 ('s15', '', '{"category":"keyboards","max_price":100}', 0),
 -- A store owner looking at their own brand does not count.
 ('a1', 'Yamaha', '{"brand":"Yamaha","city":"Lima"}', 3);
-- Outside the month: this month and two months ago.
insert into demand_searches (person, query, filters, result_count, at_offset) values
 ('b12', 'Yamaha', '{"brand":"Yamaha"}', 3, '1 month'), ('s16', 'Yamaha', '{"brand":"Yamaha"}', 3, '-1 month');

insert into public.marketplace_events (event_type, created_at, actor_user_id, session_id, source, metadata)
select 'search', f.during + s.at_offset,
  case when s.person like 'b%' then ('e7400000-0000-4000-8000-0000000000' || substr(s.person, 2))::uuid
       when s.person = 'a1' then 'e7400000-0000-4000-8000-0000000000a1'::uuid end,
  case when s.person like 's%' then ('e7400000-0000-4000-8000-0000000002' || substr(s.person, 2))::uuid end,
  'catalog',
  jsonb_build_object('query', s.query, 'filters', s.filters, 'result_count', s.result_count, 'zero_results', s.result_count = 0)
from demand_searches s cross join demand_fixture f;

-- Alerts: five Particular accounts keep "Fender, guitarras" in Lima; a sixth paused theirs.
insert into public.saved_search_alerts (user_id, search_filters, search_hash, match_bucket, frequency, status, paused_at, created_at)
select ('e7400000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid,
  '{"category":"guitars","brand":"Fender","location":"Lima","max_price":3000}'::jsonb,
  encode(sha256(('reach-demand-alert-' || g)::bytea), 'hex'), 'category:guitars', 'daily', 'active', null, now() - interval '40 days'
from generate_series(1, 6) g
union all
select 'e7400000-0000-4000-8000-000000000013', '{"category":"guitars","brand":"Fender"}'::jsonb,
  encode(sha256('reach-demand-alert-13'::bytea), 'hex'), 'category:guitars', 'daily', 'paused', now(), now() - interval '40 days';

-- ------------------------------------------------------------------ building

select pg_temp.expect_error(
  $$select laria_private.build_demand_report(date_trunc('month', now() at time zone 'America/Lima')::date)$$,
  'DEMAND_REPORT_MONTH_INVALID');
select pg_temp.expect_error($$select laria_private.build_demand_report('2026-09-15')$$, 'DEMAND_REPORT_MONTH_INVALID');

do $$ declare built integer; again integer; report public.demand_reports; begin
  built := laria_private.build_demand_report((select month from demand_fixture));
  perform pg_temp.check(built > 0, 'rows written');
  again := laria_private.build_demand_report((select month from demand_fixture));
  perform pg_temp.check(again is null, 'a second build leaves the report as it is');

  select * into report from public.demand_reports where month = (select month from demand_fixture);
  -- b01..b11 and s01..s15; the store owner and searches outside the month do not count.
  perform pg_temp.check(report.searchers = 26, format('26 people searched, got %s', report.searchers));
  perform pg_temp.check(report.searchers_with_city = 11, format('11 people gave a city, got %s', report.searchers_with_city));
  perform pg_temp.check(report.searchers_in_lima = 5, format('5 people in Lima, got %s', report.searchers_in_lima));
  perform pg_temp.check(report.alert_holders = 6, format('6 accounts keep active alerts, got %s', report.alert_holders));
  perform pg_temp.check(report.threshold = 5, 'threshold recorded');
  perform pg_temp.check(report.period_end - report.period_start between interval '28 days' and interval '31 days', 'one month');
end $$;

do $$ declare m date := (select month from demand_fixture); begin
  -- Brand: 6 accounts by the brand box + 5 sessions by typed text, every spelling under one name.
  perform pg_temp.check((select people from public.demand_report_rows
    where month = m and section = 'brand' and city is null and filters = '{"brand":"Yamaha"}') = 11, 'Yamaha: 11 people in Peru');
  perform pg_temp.check((select people from public.demand_report_rows
    where month = m and section = 'brand' and city = 'Lima' and filters = '{"brand":"Yamaha"}') = 5, 'Yamaha: 5 people in Lima');
  perform pg_temp.check(not exists (select 1 from public.demand_report_rows where month = m and city = 'Arequipa'),
    'a city with fewer than 5 people has no row');
  -- Live publications: the Yamaha in stock in Lima plus the one in Arequipa; out of stock and pending ones are left out.
  perform pg_temp.check((select listed from public.demand_report_rows
    where month = m and section = 'brand' and city is null and filters = '{"brand":"Yamaha"}') = 2, 'Yamaha: 2 live publications');
  perform pg_temp.check((select listed from public.demand_report_rows
    where month = m and section = 'brand' and city = 'Lima') = 1, 'Yamaha in Lima: 1 live publication');

  -- Typed text: folded, every spelling together; the brand box alone is not typed text.
  perform pg_temp.check((select people from public.demand_report_rows
    where month = m and section = 'query' and filters = '{"query":"yamaha pacifica"}') = 5, 'typed search: 5 people');
  perform pg_temp.check((select listed from public.demand_report_rows
    where month = m and section = 'query' and filters = '{"query":"yamaha pacifica"}') = 1, 'typed search finds 1 publication');
  perform pg_temp.check(not exists (select 1 from public.demand_report_rows where month = m and filters->>'query' = 'yamaha'),
    'brand box not counted as typed text');
  perform pg_temp.check(not exists (select 1 from public.demand_report_rows where month = m and filters::text like '%roland%'),
    'four people make no row');
  perform pg_temp.check(not exists (select 1 from public.demand_report_rows where month = m and filters::text like '%correo%'),
    'an e-mail is never kept');

  -- Types and searches with no results.
  perform pg_temp.check((select people from public.demand_report_rows where month = m and section = 'type' and city is null
    and filters = '{"category":"winds","instrument_type":"theremin"}') = 5, 'type row');
  perform pg_temp.check((select people from public.demand_report_rows where month = m and section = 'no_results' and city = 'Cusco'
    and filters = '{"category":"winds","instrument_type":"theremin"}') = 5, 'no-result row in Cusco');
  perform pg_temp.check(not exists (select 1 from public.demand_report_rows where month = m and section = 'no_results'
    and filters = '{"category":"keyboards"}'), 'a search narrowed by price is not a no-result row');
  perform pg_temp.check((select people from public.demand_report_rows where month = m and section = 'type'
    and filters = '{"category":"keyboards"}' and city is null) = 5, 'the narrowed search still counts as a type');

  -- Alerts: active ones only, price filters left out of the key.
  perform pg_temp.check((select people from public.demand_report_rows where month = m and section = 'alert' and city is null
    and filters = '{"brand":"Fender","category":"guitars"}') = 6, format('alert row: 6 accounts, got %s',
    (select people from public.demand_report_rows where month = m and section = 'alert' and city is null)));
  perform pg_temp.check((select people from public.demand_report_rows where month = m and section = 'alert' and city = 'Lima') = 6,
    'alert row in Lima');

  -- The table holds nothing under the floor and no identity.
  perform pg_temp.check(not exists (select 1 from public.demand_report_rows where people < 5), 'nothing under 5');
  perform pg_temp.check(not exists (select 1 from public.demand_report_rows where filters::text ~ 'e7400000'), 'no ids');
end $$;
select pg_temp.expect_error($$insert into public.demand_report_rows (month, section, position, filters, people, listed)
  values ((select month from demand_fixture), 'brand', 99, '{"brand":"X"}', 4, 0)$$, 'new row for relation');
select pg_temp.expect_error($$insert into public.demand_report_rows (month, section, position, filters, people, listed)
  values ((select month from demand_fixture), 'brand', 99, '{"user":"x"}', 9, 0)$$, 'new row for relation');

-- ------------------------------------------------------------------ reading

set local role authenticated;

select pg_temp.as_anon();
select pg_temp.expect_error($$select public.get_demand_report()$$, 'DEMAND_REPORT_FORBIDDEN');

select pg_temp.as_user('e7400000-0000-4000-8000-000000000001');
select pg_temp.expect_error($$select public.get_demand_report()$$, 'DEMAND_REPORT_STORE_REQUIRED');
select pg_temp.expect_error($$select * from public.demand_reports$$, 'permission denied');
select pg_temp.expect_error($$select * from public.demand_report_rows$$, 'permission denied');
select pg_temp.expect_error($$select public.run_demand_report_job()$$, 'permission denied');
select pg_temp.expect_error($$select laria_private.build_demand_report('2020-01-01')$$, 'permission denied');

-- The owner of a hidden store cannot read it.
select pg_temp.as_user('e7400000-0000-4000-8000-0000000000a2');
select pg_temp.expect_error($$select public.get_demand_report()$$, 'DEMAND_REPORT_STORE_REQUIRED');

select pg_temp.as_user('e7400000-0000-4000-8000-0000000000a1');
do $$ declare result jsonb; yamaha jsonb; begin
  result := public.get_demand_report();
  perform pg_temp.check(result->'report'->>'month' = to_char((select month from demand_fixture), 'YYYY-MM-DD'), 'latest month');
  perform pg_temp.check(jsonb_array_length(result->'months') = 1, 'one month listed');
  select r into yamaha from jsonb_array_elements(result->'report'->'rows') r
  where r->>'section' = 'brand' and r->>'city' is null;
  perform pg_temp.check((yamaha->>'mine')::integer = 1, 'the store sees its own live Yamaha');
  perform pg_temp.check((yamaha->>'listed')::integer = 2, 'and all live Yamahas');
  perform pg_temp.check(public.get_demand_report('2020-01-01')->'report' = 'null'::jsonb, 'a month without report');
end $$;

select pg_temp.as_admin();
do $$ declare result jsonb; begin
  result := public.get_demand_report((select month from demand_fixture));
  perform pg_temp.check(jsonb_array_length(result->'report'->'rows') > 0, 'admin reads it');
  perform pg_temp.check((select bool_and(r->'mine' = 'null'::jsonb) from jsonb_array_elements(result->'report'->'rows') r),
    'admin has no store column');
end $$;

reset role;

-- ------------------------------------------------------------------ the job

insert into public.demand_reports (month, period_start, period_end, threshold)
values ('2020-01-01', '2020-01-01 05:00+00', '2020-02-01 05:00+00', 5);
do $$ declare result jsonb; begin
  result := laria_private.run_demand_report_job();
  perform pg_temp.check((result->>'built')::boolean = false, 'the job leaves an existing report alone');
  perform pg_temp.check(result->>'month' = (select month from demand_fixture)::text, 'the job targets last month');
  perform pg_temp.check(not exists (select 1 from public.demand_reports where month = '2020-01-01'), 'old reports pruned');
end $$;
select pg_temp.check(exists (select 1 from cron.job where jobname = 'demand-report-monthly'), 'job scheduled');

-- The protected route runs the same job with the service role.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.check((public.run_demand_report_job()->>'built')::boolean = false, 'service role runs the job');
reset role;

rollback;
