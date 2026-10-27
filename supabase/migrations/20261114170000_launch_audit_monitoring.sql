-- Launch audit A13: no error tracking, uptime checks or alerts.
--
-- Before: an error in a page, an API route, a server action or a visitor's browser left at most a line in Vercel's
-- runtime logs, and nobody would hear of an outage before the users did.
--
-- After:
-- 1. laria_private.app_errors counts each kind of error per 10 minutes, from the server (instrumentation.ts,
--    onRequestError) and from browsers (/api/client-errors), and keeps the counts 30 days (pg_cron
--    app-error-retention, daily at 09:50 UTC). public.record_app_error, for the service role only, keeps the error's
--    name, message and route with e-mail addresses, ids, tokens, long numbers and query strings replaced, and never an
--    account, an IP address or a stack. At most 25 kinds per source in each 10 minutes; the rest are counted in one
--    overflow row, so a flood of made-up reports can't fill the database.
-- 2. public.get_admin_app_errors(days, source) lists them for Admin (/admin/errores), grouped by kind, newest first.
-- 3. public.get_app_health() gives /api/health the server errors of the last 10 to 20 minutes. The uptime check
--    (.github/workflows/uptime.yml) fails, and GitHub e-mails the owner, when the site or the database doesn't answer
--    or those errors reach 20.
--
-- Compatibility: new objects only.
-- Locks: none beyond creating the table and the functions.
-- Rollback: select cron.unschedule('app-error-retention'); then drop the five functions and laria_private.app_errors.

set lock_timeout = '10s';

-- ----------------------------------------------------------------------------------------------- 1. the counts

create table if not exists laria_private.app_errors (
  fingerprint text not null,
  bucket timestamptz not null,
  source text not null check (source in ('server', 'browser')),
  kind text not null,
  route text not null default '',
  name text not null,
  message text not null default '',
  client text not null default '',
  digest text,
  occurrences integer not null default 1 check (occurrences > 0),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (fingerprint, bucket)
);
create index if not exists app_errors_bucket_idx on laria_private.app_errors (bucket, source);
alter table laria_private.app_errors enable row level security;
revoke all on laria_private.app_errors from public, anon, authenticated;

-- What may identify someone in an error message or an address: query strings and fragments with values, e-mail
-- addresses, UUIDs, tokens (16 or more letters, digits, _ or - with at least one digit) and runs of 7 or more digits,
-- spaces and separators (phone, DNI, RUC and card numbers, dates and IP addresses).
create or replace function laria_private.scrub_error_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(coalesce(p_text, ''), '([?#])[A-Za-z0-9_.%-]+=[^\s"''<>]*', '\1…', 'g'),
          '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '<email>', 'g'),
        '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}', '<id>', 'g'),
      '(?=[A-Za-z_-]*[0-9])[A-Za-z0-9_-]{16,}', '<token>', 'g'),
    '\+?[0-9][0-9 ().:/-]{5,}[0-9]', '<n>', 'g');
$$;

-- Counts one error and returns the fingerprint it was counted under. A server error's kind is its route type (render,
-- route, action, middleware) and its route the route's file pattern; a browser error's kind is error,
-- unhandledrejection or boundary, and its route the page's path, kept as the latest seen but not part of the
-- fingerprint, so one bug on every listing page counts as one kind. Numbers in the message don't split kinds either.
create or replace function public.record_app_error(
  p_source text,
  p_kind text,
  p_route text,
  p_name text,
  p_message text,
  p_client text default '',
  p_digest text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_bucket timestamptz := date_bin(interval '10 minutes', clock_timestamp(), timestamptz '2001-01-01 00:00:00+00');
  v_kind text := case when p_kind ~ '^[a-z][a-z_-]{0,39}$' then p_kind else 'error' end;
  v_route text := left(laria_private.scrub_error_text(left(p_route, 1000)), 200);
  v_name text := case when p_name ~ '^[A-Za-z_$][A-Za-z0-9_$.]{0,79}$' then p_name else 'Error' end;
  v_message text := left(laria_private.scrub_error_text(left(p_message, 2000)), 300);
  v_client text := case when p_client ~ '^[A-Za-z][A-Za-z ]{0,39}$' then p_client else '' end;
  v_digest text := case when p_digest ~ '^[A-Za-z0-9_-]{1,40}$' then p_digest end;
  v_fingerprint text;
begin
  if p_source is null or p_source not in ('server', 'browser') then
    raise exception using errcode = '22023', message = 'APP_ERROR_INVALID';
  end if;
  v_fingerprint := md5(concat_ws(chr(31), p_source, v_kind, case when p_source = 'server' then v_route else '' end,
    v_name, regexp_replace(v_message, '[0-9]+', '0', 'g'), v_client));
  if not exists (select 1 from laria_private.app_errors where fingerprint = v_fingerprint and bucket = v_bucket)
    and (select count(*) from laria_private.app_errors where bucket = v_bucket and source = p_source) >= 25 then
    v_fingerprint := 'overflow-' || p_source;
    v_kind := 'overflow';
    v_route := '';
    v_name := 'Overflow';
    v_message := 'Otros errores: se guardan hasta 25 tipos distintos cada 10 minutos.';
    v_client := '';
    v_digest := null;
  end if;
  insert into laria_private.app_errors as e (fingerprint, bucket, source, kind, route, name, message, client, digest,
                                             first_at, last_at)
  values (v_fingerprint, v_bucket, p_source, v_kind, v_route, v_name, v_message, v_client, v_digest,
          clock_timestamp(), clock_timestamp())
  on conflict (fingerprint, bucket) do update
    set occurrences = e.occurrences + 1,
        last_at = excluded.last_at,
        route = excluded.route,
        digest = coalesce(excluded.digest, e.digest);
  return v_fingerprint;
end;
$$;
revoke all on function public.record_app_error(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_app_error(text, text, text, text, text, text, text) to service_role;

-- ----------------------------------------------------------------------------------------------- 2. Admin

-- The kinds seen in the last p_days days (1 to 30), from the server, the browser or both, newest first, at most 200:
-- the latest name, message, route and digest of each, how many times, and when first and last.
create or replace function public.get_admin_app_errors(p_days integer default 7, p_source text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform laria_private.assert_admin();
  if p_days is null or p_days not between 1 and 30 or (p_source is not null and p_source not in ('server', 'browser')) then
    raise exception using errcode = '22023', message = 'APP_ERRORS_INVALID';
  end if;
  return coalesce((
    select jsonb_agg(grouped.item order by grouped.last_at desc, grouped.fingerprint)
    from (
      select e.fingerprint, max(e.last_at) as last_at, jsonb_build_object(
        'fingerprint', e.fingerprint,
        'source', min(e.source),
        'kind', min(e.kind),
        'route', (array_agg(e.route order by e.last_at desc))[1],
        'name', (array_agg(e.name order by e.last_at desc))[1],
        'message', (array_agg(e.message order by e.last_at desc))[1],
        'client', min(e.client),
        'digest', (array_agg(e.digest order by e.last_at desc) filter (where e.digest is not null))[1],
        'occurrences', sum(e.occurrences),
        'first_at', min(e.first_at),
        'last_at', max(e.last_at)
      ) as item
      from laria_private.app_errors e
      where e.bucket >= now() - make_interval(days => p_days)
        and (p_source is null or e.source = p_source)
      group by e.fingerprint
      order by max(e.last_at) desc, e.fingerprint
      limit 200
    ) grouped
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_admin_app_errors(integer, text) from public, anon;
grant execute on function public.get_admin_app_errors(integer, text) to authenticated;

-- ----------------------------------------------------------------------------------------------- 3. health

-- Server errors in this 10-minute bucket and the one before, for /api/health. Answering at all shows the database is up.
create or replace function public.get_app_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('server_errors', coalesce(sum(e.occurrences), 0))
  from laria_private.app_errors e
  where e.source = 'server'
    and e.bucket >= date_bin(interval '10 minutes', now(), timestamptz '2001-01-01 00:00:00+00') - interval '10 minutes';
$$;
revoke all on function public.get_app_health() from public, anon, authenticated;
grant execute on function public.get_app_health() to service_role;

-- ----------------------------------------------------------------------------------------------- 4. retention

create or replace function laria_private.run_app_error_retention()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from laria_private.app_errors where bucket < now() - interval '30 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function laria_private.scrub_error_text(text), laria_private.run_app_error_retention()
from public, anon, authenticated;

-- Daily at 09:50 UTC (04:50 Lima). cron.schedule() with a job name replaces the job of that name.
select cron.schedule('app-error-retention', '50 9 * * *', $$select laria_private.run_app_error_retention()$$);

reset lock_timeout;
