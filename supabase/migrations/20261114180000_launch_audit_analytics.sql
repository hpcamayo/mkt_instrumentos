-- Launch audit A33: analytics events are written one at a time and kept forever.
--
-- Before:
-- 1. /api/events called public.record_marketplace_event once per event, one after another: up to 20 database calls
--    for one batch of a visitor's card impressions.
-- 2. Every card impression stayed in public.marketplace_events for good. They are most of its rows: one for every card
--    a visitor sees, once per 30 minutes.
--
-- After:
-- 1. public.record_marketplace_events(session, events, actor) records a visitor's whole batch in one call and one
--    transaction, through the same laria_private.record_marketplace_event_service as before, so every rule stays as it
--    was (public listings and active stores only, owners and Admins not counted, one per visitor every 30 minutes,
--    signed search metadata). Service role only.
-- 2. laria_private.listing_impression_days keeps one count per listing and Lima day. pg_cron listing-impression-rollup
--    (daily at 09:40 UTC) moves there the card impressions of every day that ended 90 days ago or more, and deletes
--    them. The all-time numbers of Mis estadísticas (get_account_analytics) and of Admin's analytics
--    (get_marketplace_admin_analytics) add those counts, so they don't change. Their 7- and 30-day periods, and the 7-,
--    30- and 90-day periods of get_listing_statistics, only ever read events younger than 90 days, which stay.
--
-- Compatibility: public.record_marketplace_event stays for the routes that record one event (contacts, submissions).
--   The two base analytics functions keep their names, arguments and grants; only their all-time impressions change
--   source. Other event types are untouched, and launch audit A18's laria_private.scrub_marketplace_events
--   (20261114120000) still clears the visitor of the events that stay.
-- Locks: none beyond creating the new objects and replacing three functions.
-- Rollback: select cron.unschedule('listing-impression-rollup'); then drop public.record_marketplace_events and the two
--   rollup functions. Keep laria_private.listing_impression_days and the two analytics functions while it has rows:
--   it is the only record of the impressions it counts.

set lock_timeout = '10s';

-- ------------------------------------------------------------------------------------- 1. one call per batch

-- Records up to 20 events of one visitor: the signed session and, when signed in, the account Auth verified. Each event
-- is {event_id, event_type, listing_id?, store_id?, source?, metadata?}, as public.record_marketplace_event takes it.
-- They are recorded by type and then by listing or store, so two batches that count views of the same listings lock
-- them in the same order and can't deadlock. Answers one receipt per event, in the order given:
-- {event_id, recorded, view_count}. Any error rolls the whole batch back; the browser sends it once more, with the
-- same event ids, which can't count twice.
create or replace function public.record_marketplace_events(p_session_id uuid, p_events jsonb, p_actor_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  total integer;
  item record;
  receipts jsonb := '{}'::jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'Service access required.';
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception using errcode = '22023', message = 'EVENT_BATCH_INVALID';
  end if;
  total := jsonb_array_length(p_events);
  if total not between 1 and 20 or exists (
    select 1 from jsonb_array_elements(p_events) event
    where jsonb_typeof(event) <> 'object'
      or exists (select 1 from jsonb_object_keys(event) field
        where field not in ('event_id', 'event_type', 'listing_id', 'store_id', 'source', 'metadata'))
  ) then
    raise exception using errcode = '22023', message = 'EVENT_BATCH_INVALID';
  end if;

  for item in
    select e.value, e.ordinality
    from jsonb_array_elements(p_events) with ordinality e(value, ordinality)
    order by e.value ->> 'event_type', coalesce((e.value ->> 'listing_id')::uuid, (e.value ->> 'store_id')::uuid), e.ordinality
  loop
    receipts := receipts || jsonb_build_object(item.ordinality::text,
      jsonb_build_object('event_id', item.value ->> 'event_id') || laria_private.record_marketplace_event_service(
        item.value ->> 'event_type', p_session_id, (item.value ->> 'event_id')::uuid, p_actor_user_id,
        (item.value ->> 'listing_id')::uuid, (item.value ->> 'store_id')::uuid,
        coalesce(item.value ->> 'source', 'other'), coalesce(item.value -> 'metadata', '{}'::jsonb), null));
  end loop;
  return (select jsonb_agg(receipts -> n::text order by n) from generate_series(1, total) n);
end;
$$;
revoke all on function public.record_marketplace_events(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.record_marketplace_events(uuid, jsonb, uuid) to service_role;

-- ------------------------------------------------------------------- 2. daily counts of old card impressions

-- Card impressions per listing and Lima day, for the days whose events laria_private.roll_up_listing_impressions has
-- deleted. Nothing here leads to a person.
create table if not exists laria_private.listing_impression_days (
  listing_id uuid not null references public.listings(id) on delete cascade,
  day date not null,
  impressions integer not null check (impressions > 0),
  primary key (listing_id, day)
);
alter table laria_private.listing_impression_days enable row level security;
revoke all on laria_private.listing_impression_days from public, anon, authenticated;

-- The first Lima day laria_private.roll_up_listing_impressions hasn't finished.
create table if not exists laria_private.listing_impression_rollup_clock (
  id boolean primary key default true check (id),
  next_day date not null
);
revoke all on laria_private.listing_impression_rollup_clock from public, anon, authenticated;

-- Moves up to p_limit card impressions of the Lima days that ended 90 days ago or more into
-- laria_private.listing_impression_days, oldest day first, deleting them in the same statement, and answers how many it
-- moved; call again while it answers p_limit. A day stopped halfway goes on where it stopped, since every statement
-- adds its counts to the day's.
create or replace function laria_private.roll_up_listing_impressions(p_limit integer default 10000)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The newest day to move: it ended at today's midnight in Lima 90 days ago, or earlier.
  last_day constant date := (now() at time zone 'America/Lima')::date - 91;
  current_day date;
  moved integer;
  total integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 50000 then
    raise exception using errcode = '22023', message = 'Invalid limit.';
  end if;
  insert into laria_private.listing_impression_rollup_clock (next_day)
  select coalesce((min(e.created_at) at time zone 'America/Lima')::date, last_day + 1) from public.marketplace_events e
  on conflict (id) do nothing;
  select c.next_day into current_day from laria_private.listing_impression_rollup_clock c where c.id for update;

  while current_day <= last_day loop
    with batch as (
      select e.id from public.marketplace_events e
      where e.event_type = 'listing_impression'
        and e.created_at >= current_day::timestamp at time zone 'America/Lima'
        and e.created_at < (current_day + 1)::timestamp at time zone 'America/Lima'
      limit p_limit - total
    ), removed as (
      delete from public.marketplace_events e using batch b where e.id = b.id
      returning e.listing_id
    ), counted as (
      insert into laria_private.listing_impression_days as d (listing_id, day, impressions)
      select r.listing_id, current_day, count(*) from removed r where r.listing_id is not null group by r.listing_id
      on conflict (listing_id, day) do update set impressions = d.impressions + excluded.impressions
    )
    select count(*)::integer into moved from removed;
    total := total + moved;
    -- The day may have more: the next call looks at it again.
    exit when total >= p_limit;
    current_day := current_day + 1;
    update laria_private.listing_impression_rollup_clock set next_day = current_day where id;
  end loop;
  return total;
end;
$$;

-- The daily run: batches until one comes back short, at most 50 of them (500,000 impressions) a day.
create or replace function laria_private.run_listing_impression_rollup()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch integer;
  total integer := 0;
begin
  for i in 1 .. 50 loop
    batch := laria_private.roll_up_listing_impressions(10000);
    total := total + batch;
    exit when batch < 10000;
  end loop;
  return total;
end;
$$;
revoke all on function laria_private.roll_up_listing_impressions(integer), laria_private.run_listing_impression_rollup()
from public, anon, authenticated;

-- Daily at 09:40 UTC (04:40 Lima), before marketplace-event-retention. cron.schedule() with a job name replaces the job
-- of that name.
select cron.schedule('listing-impression-rollup', '40 9 * * *', $$select laria_private.run_listing_impression_rollup()$$);

-- --------------------------------------------------------- 3. all-time numbers count the moved impressions

-- As in 20260916200000_sprint_4_events.sql (renamed in 20260917120000_sprint_5_favorites.sql), with one change: for
-- all time (p_days 0), each listing's impressions add its daily counts in laria_private.listing_impression_days.
create or replace function public.get_account_analytics_before_favorites(p_days integer default 0,p_owner_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare target uuid := coalesce(p_owner_id,auth.uid()); account_kind text; result jsonb;
begin
 if auth.uid() is null or (target is distinct from auth.uid() and not public.is_admin()) then raise exception 'Analytics access denied.'; end if;
 if p_days not in (0,7,30) then raise exception 'Invalid analytics period.'; end if;
 select account_type::text into account_kind from public.profiles where id=target;
 if not found then raise exception 'Account unavailable.'; end if;
 with owned as (
  select listing.*,listing.status='approved' and (listing.store_id is null or parent.status='active') as publicly_active
   from public.listings listing left join public.stores parent on parent.id=listing.store_id where listing.owner_user_id=target
    and ((account_kind='seller' and listing.store_id is null) or (account_kind='store_owner' and exists(select 1 from public.stores where id=listing.store_id and owner_user_id=target)))
 ), counts as (
  select counted.listing_id,sum(counted.impressions)::bigint impressions,sum(counted.recorded_views)::bigint recorded_views,
   sum(counted.contacts)::bigint contacts
  from (
   select event.listing_id,count(*) filter(where event.event_type='listing_impression') impressions,
    count(*) filter(where event.event_type='listing_view') recorded_views,
    count(*) filter(where event.event_type='whatsapp_contact') contacts
   from public.marketplace_events event where event.seller_user_id=target
    and (p_days=0 or event.created_at>=now()-make_interval(days=>p_days)) group by event.listing_id
   union all
   select moved.listing_id,sum(moved.impressions),0,0 from laria_private.listing_impression_days moved
   where p_days=0 and moved.listing_id in (select owned.id from owned) group by moved.listing_id
  ) counted group by counted.listing_id
 ), items as (
  select owned.id,owned.title,owned.status,owned.published_at,owned.sold_at,owned.publicly_active,
   case when p_days=0 then coalesce(owned.view_count,0) else coalesce(counts.recorded_views,0) end views,
   coalesce(counts.recorded_views,0) recorded_views,coalesce(counts.impressions,0) impressions,coalesce(counts.contacts,0) contacts
  from owned left join counts on counts.listing_id=owned.id
 ), totals as (
  select count(*) filter(where publicly_active) active,count(*) filter(where status='sold') sold,
   coalesce(sum(views),0) views,coalesce(sum(recorded_views),0) recorded_views,
   coalesce(sum(impressions),0) impressions,coalesce(sum(contacts),0) contacts from items
 ), store_counts as (
  select count(*) filter(where event_type='store_view') store_views,count(*) filter(where event_type='store_contact') store_contacts
  from public.marketplace_events where seller_user_id=target and (p_days=0 or created_at>=now()-make_interval(days=>p_days))
 ) select jsonb_build_object('days',p_days,'tracking_started_at',(select min(created_at) from public.marketplace_event_types),
  'summary',(select to_jsonb(totals)||to_jsonb(store_counts)||jsonb_build_object('ctr',recorded_views::numeric/nullif(impressions,0),'contact_rate',contacts::numeric/nullif(recorded_views,0)) from totals cross join store_counts),
  'listings',coalesce((select jsonb_agg(to_jsonb(items)||jsonb_build_object('ctr',recorded_views::numeric/nullif(impressions,0),'contact_rate',contacts::numeric/nullif(recorded_views,0)) order by id) from items),'[]'::jsonb)) into result;
 return result;
end $$;

-- As in 20260916200000_sprint_4_events.sql (renamed in 20260917120000_sprint_5_favorites.sql), with one change: for
-- all time (p_days 0), impressions and the click-through rate add the daily counts in
-- laria_private.listing_impression_days.
create or replace function public.get_marketplace_admin_analytics_before_favorites(p_days integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; moved_impressions bigint := 0;
begin
 if not public.is_admin() then raise exception 'Admin access required.'; end if;
 if p_days not in (0,7,30) then raise exception 'Invalid analytics period.'; end if;
 if p_days=0 then select coalesce(sum(moved.impressions),0) into moved_impressions from laria_private.listing_impression_days moved; end if;
 select jsonb_build_object('searches',count(*) filter(where event_type='search'),
  'zero_results',count(*) filter(where event_type='search' and metadata->>'zero_results'='true'),
  'zero_result_rate',(count(*) filter(where event_type='search' and metadata->>'zero_results'='true'))::numeric/nullif(count(*) filter(where event_type='search'),0),
  'impressions',count(*) filter(where event_type='listing_impression')+moved_impressions,'views',count(*) filter(where event_type='listing_view'),
  'contacts',count(*) filter(where event_type='whatsapp_contact'),
  'ctr',(count(*) filter(where event_type='listing_view'))::numeric/nullif(count(*) filter(where event_type='listing_impression')+moved_impressions,0),
  'contact_rate',(count(*) filter(where event_type='whatsapp_contact'))::numeric/nullif(count(*) filter(where event_type='listing_view'),0)) into result
 from public.marketplace_events where p_days=0 or created_at>=now()-make_interval(days=>p_days);
 return result;
end $$;

reset lock_timeout;
