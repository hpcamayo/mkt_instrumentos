-- Launch audit A25: switching on the e-mail scheduler would have sent the whole backlog at once.
--
-- Before: claim_marketplace_email_deliveries took the oldest due e-mails with no age limit. Nothing has run the worker
-- on a schedule since go-live, while the daily jobs kept queueing reminders, digests and alerts, so its first run would
-- have sent weeks-old e-mails, oldest first, until Resend's daily quota ran out (100 a day on the free plan, counting
-- the sign-up and password e-mails Supabase Auth sends through the same account).
--
-- After:
-- 1. Each kind of e-mail has a maximum age (laria_private.email_max_age): an instant search alert or a daily digest
--    one day; a price drop or a back-in-stock notice two days; reminders and the weekly follow digest three days;
--    everything else (moderation results, sales, reviews, questions, store decisions) a week. Age runs from when the
--    e-mail was queued, except for digests, whose age runs from the end of the day or the start of the week they cover
--    (laria_private.email_content_time): the worker's first run prepares the digests of the seven days before it, all
--    queued that minute. The claim cancels older ones (status cancelled, failure_code expired) instead of sending
--    them. Their in-app notices stay.
-- 2. The claim hands out an account's own business first (moderation, sales, reviews, questions, stores), then
--    reminders, then alerts and digests (laria_private.email_priority), oldest first within each.
-- 3. A daily limit (laria_private.email_settings, 80 by default, so sign-up and password e-mails keep 20 of Resend's
--    free 100): the claim hands out at most the limit minus what was sent since midnight UTC, when Resend's daily
--    quota resets, and what is being sent now. What doesn't fit waits for the next run, and expires by its kind's age
--    like the rest. An operator changes the limit with laria_private.set_email_daily_limit (SQL editor only).
--    Claims take a transaction advisory lock, so two runs at once can't both spend the same allowance.
-- 4. An attempt that may have reached Resend (a transport or provider failure, or a worker that stopped while
--    sending) is remembered (marketplace_email_deliveries.uncertain_since, set by fail_marketplace_email_delivery and by
--    the claim's stale-lock recovery). Every attempt sends the delivery's id as Resend's Idempotency-Key, which Resend
--    keeps for 24 hours, so such a retry is safe only within that time: the claim hands these out before anything
--    else, and 23 hours after the first uncertain attempt marks one still waiting failed (failure_code
--    retry_window_closed) instead of risking a second copy.
-- 5. A digest's day is read only when it is a real calendar date (laria_private.calendar_date); anything else ages from
--    when the e-mail was queued, so one malformed row can't stop the claim.
--
-- Compatibility: the claim and fail_marketplace_email_delivery keep their signatures, checks and payload; a kind added
-- later gets a week and the first priority unless it is added to the two functions. Nothing else changes.
-- Locks: adding the nullable column takes a brief ACCESS EXCLUSIVE lock on the queue (a few hundred rows); otherwise
-- none beyond creating the table, the functions and an index on the queue.
-- Rollback: recreate claim_marketplace_email_deliveries from 20261029120200_review_fixes_alerts_and_import.sql and
-- fail_marketplace_email_delivery from 20260921120000_sprint_7_marketplace_email_alerts.sql, then drop
-- set_email_daily_limit, email_settings, email_priority, email_content_time, calendar_date, email_max_age,
-- marketplace_email_sent_idx and the uncertain_since column. Cancelled e-mails stay cancelled.

set lock_timeout = '10s';

-- ----------------------------------------------------------------------------------------------- 1. the rules

-- How long an e-mail of each kind stays worth sending, from laria_private.email_content_time.
create or replace function laria_private.email_max_age(p_event_type text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case
    when p_event_type in ('search_alert_immediate', 'search_alert_daily') then interval '1 day'
    when p_event_type in ('listing_price_drop', 'listing_back_in_stock') then interval '2 days'
    when p_event_type in ('follow_weekly', 'listing_availability_checkin', 'listing_purchase_check',
                          'listing_purchase_confirmation_reminder', 'listing_review_reminder') then interval '3 days'
    else interval '7 days'
  end;
$$;

-- A YYYY-MM-DD text as a date, or null when it isn't a real calendar date (2026-02-30 included), without raising.
create or replace function laria_private.calendar_date(p_value text)
returns date
language sql
immutable
set search_path = ''
as $$
  select case when p_value ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then
    case when substr(p_value, 9, 2)::integer <= extract(day from make_date(substr(p_value, 1, 4)::integer,
        substr(p_value, 6, 2)::integer, 1) + interval '1 month - 1 day')::integer
      then p_value::date end
  end;
$$;

-- When an e-mail's age starts: a daily digest at the end of its day in Lima, the weekly follow digest at the start of
-- its week (the Monday it is sent, 00:00 in Lima), anything else, and a digest without a real date, when it was
-- queued.
create or replace function laria_private.email_content_time(p_event_type text, p_context jsonb, p_created_at timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when p_event_type = 'search_alert_daily' and laria_private.calendar_date(p_context ->> 'digest_date') is not null
      then (laria_private.calendar_date(p_context ->> 'digest_date') + 1)::timestamp at time zone 'America/Lima'
    when p_event_type = 'follow_weekly' and laria_private.calendar_date(p_context ->> 'week_start') is not null
      then laria_private.calendar_date(p_context ->> 'week_start')::timestamp at time zone 'America/Lima'
    else p_created_at
  end;
$$;

-- Which e-mails go first when the daily limit can't take them all: 0 an account's own business, 1 reminders, 2 alerts
-- and digests.
create or replace function laria_private.email_priority(p_event_type text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_event_type in ('search_alert_immediate', 'search_alert_daily', 'listing_price_drop', 'listing_back_in_stock',
                          'follow_weekly') then 2
    when p_event_type in ('listing_availability_checkin', 'listing_purchase_check',
                          'listing_purchase_confirmation_reminder', 'listing_review_reminder') then 1
    else 0
  end;
$$;

revoke all on function laria_private.email_max_age(text) from public, anon, authenticated;
revoke all on function laria_private.calendar_date(text) from public, anon, authenticated;
revoke all on function laria_private.email_content_time(text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function laria_private.email_priority(text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------------------------- 2. the daily limit

create table if not exists laria_private.email_settings (
  id           boolean primary key default true check (id),
  daily_limit  integer not null default 80 check (daily_limit between 0 and 1000000),
  changed_at   timestamptz not null default now(),
  changed_by   text not null default current_user,
  reason       text check (reason is null or char_length(reason) between 3 and 280)
);
insert into laria_private.email_settings(id) values (true) on conflict (id) do nothing;
alter table laria_private.email_settings enable row level security;
revoke all on laria_private.email_settings from public, anon, authenticated;

-- Run by an operator with database owner rights (SQL editor), for example after a change of Resend plan. Not callable
-- through the API. 0 stops marketplace e-mails; they wait, and expire by their kind's age.
create or replace function laria_private.set_email_daily_limit(p_limit integer, p_reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare change_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_limit is null or p_limit not between 0 and 1000000
     or change_reason is null or char_length(change_reason) not between 3 and 280 then
    raise exception 'Indica el límite diario (0 a 1000000) y el motivo.';
  end if;
  update laria_private.email_settings
  set daily_limit = p_limit, changed_at = now(), changed_by = session_user, reason = change_reason
  where id;
  return p_limit;
end;
$$;
revoke all on function laria_private.set_email_daily_limit(integer, text) from public, anon, authenticated, service_role;

-- What was sent today, for the limit.
create index if not exists marketplace_email_sent_idx on laria_private.marketplace_email_deliveries (sent_at)
  where status = 'sent';

-- ----------------------------------------------------------------------------------------------- 3. uncertain sends

alter table laria_private.marketplace_email_deliveries add column if not exists uncertain_since timestamptz;
comment on column laria_private.marketplace_email_deliveries.uncertain_since is
  'When the first attempt that may have reached the provider began (launch audit A25): a transport or provider failure, or a worker that stopped while sending. Resend keeps the Idempotency-Key (the delivery id) for 24 hours, so the claim retries it first and gives up 23 hours after.';

-- From 20260921120000_sprint_7_marketplace_email_alerts.sql, with uncertain_since: a transport or provider failure
-- (timeouts, lost connections, 408, 409, 5xx, a reply without an id) may have been accepted; a rate limit, a refusal
-- or a failure before sending was not.
create or replace function public.fail_marketplace_email_delivery(
  p_delivery_id uuid,
  p_worker_id uuid,
  p_retryable boolean,
  p_failure_category text,
  p_failure_code text
)
returns text
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare delivery_record laria_private.marketplace_email_deliveries; next_status text;
begin
  if auth.role() is distinct from 'service_role' then raise exception using errcode = '42501', message = 'EMAIL_SERVICE_REQUIRED'; end if;
  if p_failure_category not in ('transport','rate_limit','provider','configuration','template','recipient','unknown')
    or length(coalesce(p_failure_code, '')) > 200 then raise exception 'EMAIL_FAILURE_INVALID'; end if;
  select * into delivery_record from laria_private.marketplace_email_deliveries
  where id = p_delivery_id and status = 'processing' and locked_by = p_worker_id for update;
  if not found then raise exception 'EMAIL_DELIVERY_CLAIM_INVALID'; end if;
  next_status := case when p_retryable and delivery_record.attempt_count < 5 then 'retry' else 'failed' end;
  update laria_private.marketplace_email_deliveries
  set status = next_status,
      next_attempt_at = case delivery_record.attempt_count
        when 1 then clock_timestamp() + interval '5 minutes'
        when 2 then clock_timestamp() + interval '30 minutes'
        when 3 then clock_timestamp() + interval '2 hours'
        else clock_timestamp() + interval '8 hours'
      end,
      failure_category = p_failure_category,
      failure_code = nullif(left(coalesce(p_failure_code, ''), 200), ''),
      uncertain_since = case when p_failure_category in ('transport', 'provider')
        then coalesce(delivery_record.uncertain_since, delivery_record.last_attempt_at, clock_timestamp())
        else delivery_record.uncertain_since end,
      locked_at = null,
      locked_by = null
  where id = delivery_record.id;
  return next_status;
end;
$$;

revoke all on function public.fail_marketplace_email_delivery(uuid, uuid, boolean, text, text) from public;
grant execute on function public.fail_marketplace_email_delivery(uuid, uuid, boolean, text, text) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------------------------- 4. the claim

-- From 20261029120200_review_fixes_alerts_and_import.sql, with the lock, the retry window, the expiry, the allowance
-- and the order added.
create or replace function public.claim_marketplace_email_deliveries(p_worker_id uuid, p_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private, auth
as $$
declare
  result jsonb;
  allowance integer;
begin
  if auth.role() is distinct from 'service_role' or p_worker_id is null or p_limit not between 1 and 100 then
    raise exception using errcode = '42501', message = 'EMAIL_SERVICE_REQUIRED';
  end if;
  -- A25: one claim at a time, so two runs can't both spend the same part of the daily limit.
  perform pg_advisory_xact_lock(hashtextextended('laria.claim_marketplace_email_deliveries', 0));

  update laria_private.marketplace_email_deliveries
  set status = case when attempt_count >= 5 then 'failed' else 'retry' end,
      next_attempt_at = clock_timestamp(), locked_at = null, locked_by = null,
      failure_category = coalesce(failure_category, 'transport'),
      failure_code = coalesce(failure_code, 'stale_worker_lock'),
      -- A25: the worker may have stopped after Resend accepted it.
      uncertain_since = coalesce(uncertain_since, last_attempt_at, locked_at)
  where status = 'processing' and locked_at < clock_timestamp() - interval '15 minutes';

  -- A25: Resend forgets the Idempotency-Key after 24 hours; past 23, a retry of an e-mail it may have accepted could
  -- send a second copy.
  update laria_private.marketplace_email_deliveries
  set status = 'failed', failure_code = 'retry_window_closed'
  where status = 'retry' and uncertain_since < clock_timestamp() - interval '23 hours';

  -- A25: an e-mail past its kind's maximum age is not worth sending any more.
  update laria_private.marketplace_email_deliveries delivery
  set status = 'cancelled', failure_code = 'expired'
  where delivery.status in ('pending', 'retry')
    and laria_private.email_content_time(delivery.event_type, delivery.context, delivery.created_at)
        < clock_timestamp() - laria_private.email_max_age(delivery.event_type);

  -- Review fix A7 (design §5.2): nothing about a listing that ran out of stock after its e-mail was queued.
  update laria_private.search_alert_matches match
  set delivery_id = null, suppressed_at = clock_timestamp(), suppression_reason = 'listing_out_of_stock'
  from laria_private.marketplace_email_deliveries delivery, public.listings listing
  where match.delivery_id = delivery.id and delivery.status in ('pending', 'retry')
    and delivery.event_type = 'search_alert_daily'
    and listing.id = match.listing_id and listing.stock_state = 'out_of_stock';
  update laria_private.marketplace_email_deliveries delivery
  set status = 'cancelled', failure_code = 'listing_out_of_stock'
  where delivery.status in ('pending', 'retry')
    and ((delivery.event_type in ('listing_price_drop', 'search_alert_immediate')
          and exists (select 1 from public.listings listing
                      where listing.id = delivery.listing_id and listing.stock_state = 'out_of_stock'))
      or (delivery.event_type = 'search_alert_daily'
          and not exists (select 1 from laria_private.search_alert_matches match where match.delivery_id = delivery.id)));

  -- A25: what is left of today's limit (Resend's day starts at midnight UTC), less what is being sent now.
  select greatest(0, least(p_limit, settings.daily_limit
      - (select count(*) from laria_private.marketplace_email_deliveries sent
         where sent.status = 'sent' and sent.sent_at >= date_trunc('day', clock_timestamp() at time zone 'UTC') at time zone 'UTC')
      - (select count(*) from laria_private.marketplace_email_deliveries busy where busy.status = 'processing')))
  into allowance
  from laria_private.email_settings settings
  where settings.id;
  allowance := coalesce(allowance, p_limit);
  if allowance = 0 then
    return '[]'::jsonb;
  end if;

  with candidates as (
    select delivery.id
    from laria_private.marketplace_email_deliveries delivery
    left join public.saved_search_alerts alert on alert.id = delivery.search_alert_id
    where delivery.status in ('pending','retry')
      and delivery.next_attempt_at <= clock_timestamp()
      and delivery.attempt_count < 5
      and (delivery.search_alert_id is null or alert.status = 'active')
    -- A25: retries Resend may have accepted first, while its Idempotency-Key still holds.
    order by delivery.uncertain_since is null, laria_private.email_priority(delivery.event_type), delivery.created_at, delivery.id
    for update of delivery skip locked
    limit allowance
  ), updated as (
    update laria_private.marketplace_email_deliveries delivery
    set status = 'processing', attempt_count = attempt_count + 1,
        last_attempt_at = clock_timestamp(), locked_at = clock_timestamp(), locked_by = p_worker_id,
        recipient_email = auth_user.email, failure_category = null, failure_code = null
    from candidates, auth.users auth_user
    where delivery.id = candidates.id and auth_user.id = delivery.recipient_user_id
    returning delivery.*
  )
  select coalesce(jsonb_agg(laria_private.marketplace_email_payload(updated)
    order by updated.uncertain_since is null, laria_private.email_priority(updated.event_type), updated.created_at, updated.id), '[]'::jsonb)
  into result from updated;
  return result;
end;
$$;

revoke all on function public.claim_marketplace_email_deliveries(uuid, integer) from public;
grant execute on function public.claim_marketplace_email_deliveries(uuid, integer) to anon, authenticated, service_role;

reset lock_timeout;
