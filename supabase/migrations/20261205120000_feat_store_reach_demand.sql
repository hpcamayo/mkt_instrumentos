-- Feature ideas, batch "store-reach" (docs/feature-ideas/store-reach.md): reach-06 "Lo que buscan en Laria".
--
-- A monthly report for stores: what people searched for and kept alerts on in Laria during the last calendar month
-- (Lima time), by city, next to how many publications are live. Henri's note on reach-06 makes it counts, never advice:
-- no ranking framed as a recommendation, every figure says what it counts, and nothing under 5 people.
--
-- Built once a month from data Laria already records:
--   * `search` events (catalog page-1 views, Sprint 4), counted once per person: the signed-in account, else the signed
--     random session. Store and Admin accounts are left out, so a store looking at its own brand does not count.
--   * Active saved search alerts of Particular accounts, counted once per account.
-- The report is stored aggregated. A row keeps the search it describes (the saved-search filter shape: category,
-- instrument_type, brand, query, plus the city), how many people and how many live publications match. No row keeps an
-- account, a session or an event id, and a row under the threshold is never written (a check constraint holds the
-- floor of 5). Free text is folded, limited to letters, digits and model punctuation, and dropped when it looks like an
-- e-mail, a phone or a document number.
--
-- Additive: two tables, seven functions, one pg_cron job. No existing function is redefined.

create table public.demand_reports (
  month                date primary key,
  period_start         timestamptz not null,
  period_end           timestamptz not null,
  threshold            integer not null check (threshold >= 5),
  -- Totals under the threshold are stored as null, like any other figure.
  searchers            integer check (searchers is null or searchers >= threshold),
  searchers_with_city  integer check (searchers_with_city is null or searchers_with_city >= threshold),
  searchers_in_lima    integer check (searchers_in_lima is null or searchers_in_lima >= threshold),
  alert_holders        integer check (alert_holders is null or alert_holders >= threshold),
  built_at             timestamptz not null default now(),
  constraint demand_reports_month_check check (month = date_trunc('month', month)::date),
  constraint demand_reports_period_check check (period_end > period_start)
);

comment on table public.demand_reports is
  'reach-06: one row per monthly demand report (Lima calendar month). Read through get_demand_report().';

create table public.demand_report_rows (
  month     date not null references public.demand_reports(month) on delete cascade,
  section   text not null check (section in ('brand', 'query', 'type', 'no_results', 'alert')),
  position  integer not null check (position >= 1),
  -- null: every search of that kind, whatever its city ("Todo el Perú").
  city      text check (city is null or char_length(city) between 1 and 100),
  -- The search the row describes, in the saved-search shape (laria_private.listing_matches_saved_search reads it).
  filters   jsonb not null check (jsonb_typeof(filters) = 'object' and filters <> '{}'::jsonb
              and filters - array['category', 'instrument_type', 'brand', 'query'] = '{}'::jsonb),
  people    integer not null check (people >= 5),
  -- Live, available publications that match the row's search when the report was built.
  listed    integer not null check (listed >= 0),
  primary key (month, section, position)
);

comment on table public.demand_report_rows is
  'reach-06: aggregated demand rows, never under 5 people, never an identity. Read through get_demand_report().';

alter table public.demand_reports enable row level security;
alter table public.demand_report_rows enable row level security;
revoke all on public.demand_reports from public, anon, authenticated;
revoke all on public.demand_report_rows from public, anon, authenticated;

-- ------------------------------------------------------------------ helpers

create or replace function laria_private.demand_report_threshold()
returns integer
language sql
immutable
as $$ select 5 $$;

-- The typed search text as the report keeps it: folded (lowercase, no accents), single spaces, 2 to 60 characters,
-- letters, digits and the punctuation of model names only. null when it could identify someone: an e-mail, a phone or
-- a run of 7 or more digits (a DNI has 8).
create or replace function laria_private.demand_clean_query(p_text text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select case
    when cleaned is null or char_length(cleaned) not between 2 and 60 then null
    when cleaned !~ '^[a-z0-9][a-z0-9 .''"/+&-]*$' then null
    when cleaned ~ '[0-9]{7,}' then null
    when public.catalog_redact(cleaned) <> cleaned then null
    else cleaned
  end
  from (select nullif(btrim(regexp_replace(public.catalog_fold(p_text), '\s+', ' ', 'g')), '') as cleaned) as c
$$;

-- Words that are not brands even when a publication was typed with them.
create or replace function laria_private.demand_is_brand_word(p_key text)
returns boolean
language sql
immutable
as $$
  select p_key is not null and char_length(p_key) between 2 and 60
    and p_key not in ('generico', 'generica', 'sin marca', 'otro', 'otra', 'otros', 'otras', 'varios', 'varias',
                      'na', 'n/a', 'ninguna', 'ninguno', 'no aplica', 'artesanal', 'nacional', 'importado')
$$;

-- What counts as a brand: the catalog's manufacturers and their aliases, and the brands of publications. Each spelling
-- (key, folded) points to one brand (brand_key) and the name shown for it: the catalog's name when the catalog knows
-- the brand, else the spelling most publications use.
create or replace function laria_private.demand_brand_dictionary()
returns table (key text, brand_key text, display text)
language sql
stable
security definer
set search_path = public
as $$
  with names as (
    select public.catalog_fold(btrim(m.canonical_name)) as key, public.catalog_fold(btrim(m.canonical_name)) as brand_key,
           btrim(m.canonical_name) as display, 1 as source_rank
    from public.catalog_manufacturers m
    where nullif(btrim(m.canonical_name), '') is not null
    union all
    select public.catalog_fold(btrim(a.alias)), public.catalog_fold(btrim(m.canonical_name)), btrim(m.canonical_name), 1
    from public.catalog_manufacturer_aliases a
    join public.catalog_manufacturers m on m.id = a.manufacturer_id
    where nullif(btrim(a.alias), '') is not null and nullif(btrim(m.canonical_name), '') is not null
    union all
    select public.catalog_fold(btrim(l.brand)), public.catalog_fold(btrim(l.brand)), btrim(l.brand), 2
    from public.listings l
    where l.status in ('approved', 'sold') and nullif(btrim(l.brand), '') is not null
  ),
  counted as (
    select names.key, names.brand_key, names.display, min(names.source_rank) as source_rank, count(*) as uses
    from names
    where laria_private.demand_is_brand_word(names.key)
    group by names.key, names.brand_key, names.display
  ),
  -- One display name per brand, so every spelling of a brand groups under the same name.
  brand_names as (
    select distinct on (counted.brand_key) counted.brand_key, counted.display
    from counted
    order by counted.brand_key, counted.source_rank, counted.uses desc, counted.display
  )
  select distinct on (counted.key) counted.key, counted.brand_key, brand_names.display
  from counted
  join brand_names on brand_names.brand_key = counted.brand_key
  order by counted.key, counted.source_rank, counted.uses desc
$$;

-- One row per search of the period, as the report reads it. `q` is the typed text (the event's `query` is the brand
-- box when nothing was typed, so it counts as text only when it differs from the brand filter); `q_unsafe` marks
-- typed text the report cannot keep, which leaves that search out of the text-based sections. `narrowed`: the search
-- also had a price, condition, seller or detail filter.
create or replace function laria_private.demand_report_searches(p_start timestamptz, p_end timestamptz)
returns table (
  id bigint, person text, category text, instrument_type text, brand_filter text, q text, q_unsafe boolean,
  cities text[], result_count integer, narrowed boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with raw as (
    select row_number() over () as id,
      coalesce('u:' || e.actor_user_id::text, 's:' || e.session_id::text) as person,
      e.metadata->'filters' as f,
      nullif(btrim(e.metadata->>'query'), '') as query_text,
      case when jsonb_typeof(e.metadata->'result_count') = 'number' then (e.metadata->>'result_count')::integer else 0 end as result_count
    from public.marketplace_events e
    where e.event_type = 'search'
      and e.created_at >= p_start and e.created_at < p_end
      and jsonb_typeof(e.metadata->'filters') = 'object'
      and coalesce(e.actor_user_id::text, e.session_id::text) is not null
      and (e.actor_user_id is null or (
        not exists (select 1 from public.profiles p where p.id = e.actor_user_id and p.account_type in ('store_owner', 'admin'))
        and not exists (select 1 from auth.users u where u.id = e.actor_user_id and u.raw_app_meta_data->>'role' = 'admin')))
  ),
  fields as (
    select raw.id, raw.person, raw.result_count, raw.query_text,
      case when jsonb_typeof(raw.f->'category') = 'string' then nullif(btrim(raw.f->>'category'), '') end as category,
      case when jsonb_typeof(raw.f->'instrument_type') = 'string' then nullif(btrim(raw.f->>'instrument_type'), '') end as instrument_type,
      case when jsonb_typeof(raw.f->'brand') = 'string' then nullif(left(btrim(raw.f->>'brand'), 80), '') end as brand_filter,
      case jsonb_typeof(raw.f->'city')
        when 'string' then array_remove(array[nullif(left(btrim(raw.f->>'city'), 100), '')], null)
        when 'array' then array(select distinct left(btrim(c.value), 100)
                                from jsonb_array_elements_text(raw.f->'city') as c(value)
                                where nullif(btrim(c.value), '') is not null
                                limit 20)
        else array[]::text[]
      end as cities,
      exists (select 1 from jsonb_object_keys(raw.f) as k(key)
              where k.key not in ('category', 'instrument_type', 'brand', 'city', 'sort')) as narrowed
    from raw
  )
  select fields.id, fields.person, fields.category, fields.instrument_type, fields.brand_filter,
    laria_private.demand_clean_query(typed.text) as q,
    typed.text is not null and laria_private.demand_clean_query(typed.text) is null as q_unsafe,
    fields.cities, fields.result_count, fields.narrowed
  from fields
  cross join lateral (
    select case
      when fields.query_text is null then null
      when fields.brand_filter is not null and public.catalog_fold(fields.query_text) = public.catalog_fold(fields.brand_filter) then null
      else fields.query_text
    end as text
  ) as typed
$$;

-- Active alerts of Particular accounts created before the period's end, as the report reads them: the alert's
-- category, type, brand and text (price, condition, seller and detail filters are left out of the key), its
-- locations, and whether its text could be kept.
create or replace function laria_private.demand_report_alerts(p_end timestamptz)
returns table (person text, category text, instrument_type text, brand text, q text, q_unsafe boolean, cities text[])
language sql
stable
security definer
set search_path = public
as $$
  select 'u:' || a.user_id::text,
    nullif(btrim(a.search_filters->>'category'), ''),
    nullif(btrim(a.search_filters->>'instrument_type'), ''),
    nullif(left(btrim(a.search_filters->>'brand'), 80), ''),
    laria_private.demand_clean_query(a.search_filters->>'query'),
    nullif(btrim(a.search_filters->>'query'), '') is not null and laria_private.demand_clean_query(a.search_filters->>'query') is null,
    case jsonb_typeof(a.search_filters->'location')
      when 'string' then array_remove(array[nullif(left(btrim(a.search_filters->>'location'), 100), '')], null)
      when 'array' then array(select distinct left(btrim(c.value), 100)
                              from jsonb_array_elements_text(a.search_filters->'location') as c(value)
                              where nullif(btrim(c.value), '') is not null
                              limit 20)
      else array[]::text[]
    end
  from public.saved_search_alerts a
  join public.profiles p on p.id = a.user_id and p.account_type = 'seller'
  where a.status = 'active' and a.created_at < p_end
    and not exists (select 1 from auth.users u where u.id = a.user_id and u.raw_app_meta_data->>'role' = 'admin')
$$;

-- Builds the report of one complete Lima month once. Returns the number of rows written, or null when the report
-- already exists. Rows: per section the 30 searches with most people for all of Peru, then up to 90 city rows of those
-- same searches, each at 5 people or more. `listed` counts approved, public publications in stock that the row's search
-- finds (the saved-search matcher, so it follows the catalog's own rules).
create or replace function laria_private.build_demand_report(p_month date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  threshold constant integer := laria_private.demand_report_threshold();
  lima_month constant date := date_trunc('month', (now() at time zone 'America/Lima'))::date;
  v_start timestamptz;
  v_end timestamptz;
  written integer;
  total_searchers integer;
  total_with_city integer;
  total_lima integer;
  total_alerts integer;
begin
  if p_month is null or p_month <> date_trunc('month', p_month)::date or p_month >= lima_month then
    raise exception using errcode = 'P0001', message = 'DEMAND_REPORT_MONTH_INVALID: Solo se prepara el reporte de un mes completo.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('demand-report:' || p_month::text, 0));
  if exists (select 1 from public.demand_reports r where r.month = p_month) then
    return null;
  end if;
  v_start := p_month::timestamp at time zone 'America/Lima';
  v_end := (p_month + interval '1 month')::timestamp at time zone 'America/Lima';

  select count(distinct s.person),
         count(distinct s.person) filter (where cardinality(s.cities) > 0),
         count(distinct s.person) filter (where exists (select 1 from unnest(s.cities) c(city) where public.catalog_fold(c.city) = 'lima'))
  into total_searchers, total_with_city, total_lima
  from laria_private.demand_report_searches(v_start, v_end) s;
  select count(distinct a.person) into total_alerts
  from laria_private.demand_report_alerts(v_end) a;

  insert into public.demand_reports (month, period_start, period_end, threshold, searchers, searchers_with_city,
                                     searchers_in_lima, alert_holders)
  values (p_month, v_start, v_end, threshold,
          case when total_searchers >= threshold then total_searchers end,
          case when total_with_city >= threshold then total_with_city end,
          case when total_lima >= threshold then total_lima end,
          case when total_alerts >= threshold then total_alerts end);

  insert into public.demand_report_rows (month, section, position, city, filters, people, listed)
  with dictionary as materialized (
    select * from laria_private.demand_brand_dictionary()
  ),
  searches as materialized (
    select * from laria_private.demand_report_searches(v_start, v_end)
  ),
  -- The brand a typed search names: the longest run of one to three words that is a known brand.
  typed_brand as (
    select distinct on (s.id) s.id, d.brand_key, d.display
    from searches s
    cross join lateral (select regexp_split_to_array(s.q, ' ') as words) w
    cross join lateral generate_series(1, least(3, cardinality(w.words))) as n(size)
    cross join lateral generate_series(1, cardinality(w.words) - n.size + 1) as i(start)
    join dictionary d on d.key = array_to_string(w.words[i.start:i.start + n.size - 1], ' ')
    where s.q is not null
    order by s.id, n.size desc, i.start
  ),
  described as (
    select s.*,
      coalesce(fb.brand_key, case when s.brand_filter is not null then public.catalog_fold(s.brand_filter) end, tb.brand_key) as brand_key,
      coalesce(fb.display, s.brand_filter, tb.display) as brand_display,
      case when s.brand_filter is not null then coalesce(fb.display, s.brand_filter) end as brand_filter_display
    from searches s
    left join dictionary fb on fb.key = public.catalog_fold(s.brand_filter)
    left join typed_brand tb on tb.id = s.id
  ),
  alert_rows as (
    select a.person, a.cities, a.category, a.instrument_type, a.q,
      case when a.brand is not null then coalesce(d.display, a.brand) end as brand_display
    from laria_private.demand_report_alerts(v_end) a
    left join dictionary d on d.key = public.catalog_fold(a.brand)
    where not a.q_unsafe
  ),
  keyed as (
    select 'brand'::text as section, s.brand_key as group_key, jsonb_build_object('brand', s.brand_display) as filters, s.person, s.cities
    from described s where s.brand_key is not null and not (s.brand_filter is null and s.q_unsafe)
    union all
    select 'query', null, jsonb_strip_nulls(jsonb_build_object('query', s.q, 'category', s.category,
             'instrument_type', s.instrument_type, 'brand', s.brand_filter_display)), s.person, s.cities
    from described s where s.q is not null
    union all
    select 'type', null, jsonb_strip_nulls(jsonb_build_object('category', s.category, 'instrument_type', s.instrument_type)),
           s.person, s.cities
    from described s where s.category is not null or s.instrument_type is not null
    union all
    select 'no_results', null, jsonb_strip_nulls(jsonb_build_object('query', s.q, 'category', s.category,
             'instrument_type', s.instrument_type, 'brand', s.brand_filter_display)), s.person, s.cities
    from described s
    where s.result_count = 0 and not s.narrowed and not s.q_unsafe
      and (s.q is not null or s.brand_filter is not null or s.category is not null or s.instrument_type is not null)
    union all
    select 'alert', null, jsonb_strip_nulls(jsonb_build_object('query', a.q, 'category', a.category,
             'instrument_type', a.instrument_type, 'brand', a.brand_display)), a.person, a.cities
    from alert_rows a
    where a.q is not null or a.brand_display is not null or a.category is not null or a.instrument_type is not null
  ),
  expanded as (
    select k.section, coalesce(k.group_key, k.filters::text) as group_key, k.filters, null::text as city, k.person from keyed k
    union all
    select k.section, coalesce(k.group_key, k.filters::text), k.filters, c.city, k.person
    from keyed k cross join lateral unnest(k.cities) as c(city)
  ),
  counted as (
    select e.section, e.group_key, e.city, mode() within group (order by e.filters) as filters,
           count(distinct e.person)::integer as people
    from expanded e
    group by e.section, e.group_key, e.city
    having count(distinct e.person) >= threshold
  ),
  national as (
    select c.*, row_number() over (partition by c.section order by c.people desc, c.group_key) as rank
    from counted c where c.city is null
  ),
  by_city as (
    select c.*, row_number() over (partition by c.section order by c.people desc, c.group_key, c.city) as rank
    from counted c
    join national n on n.section = c.section and n.group_key = c.group_key and n.rank <= 30
    where c.city is not null
  ),
  kept as (
    select n.section, n.group_key, n.city, n.filters, n.people, 0 as tier from national n where n.rank <= 30
    union all
    select b.section, b.group_key, b.city, b.filters, b.people, 1 from by_city b where b.rank <= 90
  )
  select p_month, kept.section,
    row_number() over (partition by kept.section order by kept.tier, kept.people desc, kept.group_key, kept.city),
    kept.city, kept.filters, kept.people,
    (select count(*)::integer from public.listings l
     where l.status = 'approved' and (l.stock_state is null or l.stock_state = 'in_stock')
       and laria_private.listing_matches_saved_search(l, kept.filters
         || case when kept.city is null then '{}'::jsonb else jsonb_build_object('location', kept.city) end))
  from kept;
  get diagnostics written = row_count;
  return written;
end;
$$;

-- The daily job: builds last month's report when it is missing and drops reports older than 13 months. Safe to run
-- any number of times a day.
create or replace function laria_private.run_demand_report_job()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lima_month constant date := date_trunc('month', (now() at time zone 'America/Lima'))::date;
  target constant date := (lima_month - interval '1 month')::date;
  written integer;
begin
  delete from public.demand_reports r where r.month < (lima_month - interval '13 months')::date;
  written := laria_private.build_demand_report(target);
  return jsonb_build_object('month', target, 'built', written is not null, 'rows', coalesce(written, 0));
end;
$$;

-- The same job for the protected route app/api/internal/jobs/demand-report (service role only).
create or replace function public.run_demand_report_job()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'DEMAND_REPORT_SERVICE_REQUIRED: Solo el servidor puede preparar el reporte.';
  end if;
  return laria_private.run_demand_report_job();
end;
$$;

-- ------------------------------------------------------------------ reading

-- The report for the owner of an active store, or an Admin. p_month null: the latest. `mine` counts the caller's own
-- live, in-stock publications that the row's search finds (null for an Admin).
create or replace function public.get_demand_report(p_month date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_is_admin boolean := public.is_admin();
  caller_store_id uuid;
  report public.demand_reports;
  months jsonb;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'DEMAND_REPORT_FORBIDDEN: Ingresa con tu cuenta de tienda.';
  end if;
  if not caller_is_admin then
    select s.id into caller_store_id from public.stores s where s.owner_user_id = caller and s.status = 'active';
    if caller_store_id is null then
      raise exception using errcode = '42501', message = 'DEMAND_REPORT_STORE_REQUIRED: El reporte está disponible para tiendas activas.';
    end if;
  end if;

  select coalesce(jsonb_agg(to_char(recent.month, 'YYYY-MM-DD') order by recent.month desc), '[]'::jsonb) into months
  from (select r.month from public.demand_reports r order by r.month desc limit 12) recent;

  select * into report from public.demand_reports r
  where r.month = coalesce(date_trunc('month', p_month)::date, (select max(latest.month) from public.demand_reports latest));
  if report.month is null then
    return jsonb_build_object('months', months, 'report', null);
  end if;

  return jsonb_build_object('months', months, 'report', jsonb_build_object(
    'month', to_char(report.month, 'YYYY-MM-DD'),
    'period_start', report.period_start,
    'period_end', report.period_end,
    'built_at', report.built_at,
    'threshold', report.threshold,
    'searchers', report.searchers,
    'searchers_with_city', report.searchers_with_city,
    'searchers_in_lima', report.searchers_in_lima,
    'alert_holders', report.alert_holders,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'section', r.section, 'position', r.position, 'city', r.city, 'filters', r.filters,
        'people', r.people, 'listed', r.listed,
        'mine', case when caller_store_id is null then null else (
          select count(*)::integer from public.listings l
          where l.store_id = caller_store_id and l.status = 'approved'
            and (l.stock_state is null or l.stock_state = 'in_stock')
            and laria_private.listing_matches_saved_search(l, r.filters
              || case when r.city is null then '{}'::jsonb else jsonb_build_object('location', r.city) end)) end)
        order by r.section, r.position)
      from public.demand_report_rows r where r.month = report.month), '[]'::jsonb)));
end;
$$;

revoke all on function laria_private.demand_report_threshold() from public, anon, authenticated;
revoke all on function laria_private.demand_clean_query(text) from public, anon, authenticated;
revoke all on function laria_private.demand_is_brand_word(text) from public, anon, authenticated;
revoke all on function laria_private.demand_brand_dictionary() from public, anon, authenticated;
revoke all on function laria_private.demand_report_searches(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function laria_private.demand_report_alerts(timestamptz) from public, anon, authenticated;
revoke all on function laria_private.build_demand_report(date) from public, anon, authenticated;
revoke all on function laria_private.run_demand_report_job() from public, anon, authenticated;
revoke all on function public.run_demand_report_job() from public, anon, authenticated;
revoke all on function public.get_demand_report(date) from public, anon, authenticated;
grant execute on function public.run_demand_report_job() to service_role;
grant execute on function public.get_demand_report(date) to authenticated;

-- 10:30 UTC is 05:30 in Lima. The job builds last month's report on the first run of a month and does nothing on the
-- other days, so a missed day only delays it. The route app/api/internal/jobs/demand-report runs the same job by hand.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'demand-report-monthly') then
    perform cron.unschedule('demand-report-monthly');
  end if;
  perform cron.schedule('demand-report-monthly', '30 10 * * *', 'select laria_private.run_demand_report_job()');
end;
$$;
