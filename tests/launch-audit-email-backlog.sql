-- Launch audit A25 (supabase/migrations/20261114160000_launch_audit_email_backlog.sql): queued e-mails expire by kind,
-- the claim hands out an account's own business first, and a daily limit holds back the rest. A send Resend may have
-- accepted is retried first and given up 23 hours after, before Resend forgets its Idempotency-Key, and a digest's day
-- that isn't a real date can't stop the claim. Local/test database only. Every fixture is rolled back.
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
create function pg_temp.id(p_n integer) returns uuid language sql immutable as $$
  select ('a2510000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;
-- A queued e-mail for la25-uno, p_age old.
create function pg_temp.queue(p_n integer, p_event_type text, p_age interval, p_status text default 'pending')
returns void language sql as $$
  insert into laria_private.marketplace_email_deliveries(id, event_type, recipient_user_id, dedupe_key, status, created_at, next_attempt_at)
  values (pg_temp.id(p_n), p_event_type, 'a2500000-0000-4000-8000-000000000001', 'la25-' || p_n, p_status, now() - p_age, now() - p_age)
$$;
create function pg_temp.claimed(p_claim jsonb) returns uuid[] language sql immutable as $$
  select coalesce(array_agg((e.value ->> 'delivery_id')::uuid order by e.n), '{}') from jsonb_array_elements(p_claim) with ordinality e(value, n)
$$;
grant execute on function pg_temp.check(boolean, text), pg_temp.expect_error(text, text), pg_temp.id(integer),
  pg_temp.claimed(jsonb) to anon, authenticated, service_role;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('a2500000-0000-4000-8000-000000000001','authenticated','authenticated','la25-uno@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Persona A25","phone":"51999992501","city":"Lima","region":"Lima"}');

-- Only this suite's e-mails are due.
update laria_private.marketplace_email_deliveries set next_attempt_at = now() + interval '30 days'
where status in ('pending', 'retry');

-- ------------------------------------------------------------------ the rules

do $$ begin
  perform pg_temp.check(laria_private.email_max_age('search_alert_immediate') = interval '1 day'
    and laria_private.email_max_age('search_alert_daily') = interval '1 day', 'an instant alert or a daily digest lasts a day');
  perform pg_temp.check(laria_private.email_max_age('listing_price_drop') = interval '2 days'
    and laria_private.email_max_age('listing_back_in_stock') = interval '2 days', 'drops and restocks last two days');
  perform pg_temp.check(laria_private.email_content_time('search_alert_daily', '{"digest_date":"2026-10-20"}', now())
    = '2026-10-21 05:00:00+00', 'a daily digest ages from the end of its day in Lima');
  perform pg_temp.check(laria_private.email_content_time('follow_weekly', '{"week_start":"2026-10-26","items":[]}', now())
    = '2026-10-26 05:00:00+00', 'the weekly digest ages from the start of its Monday in Lima');
  perform pg_temp.check(laria_private.email_content_time('store_approved', '{}', '2026-10-01 12:00:00+00')
    = '2026-10-01 12:00:00+00', 'anything else ages from when it was queued');
  perform pg_temp.check(laria_private.email_content_time('search_alert_daily', '{"digest_date":"pronto"}', '2026-10-01 12:00:00+00')
    = '2026-10-01 12:00:00+00', 'a digest without a readable day ages from when it was queued');
  perform pg_temp.check(laria_private.email_content_time('search_alert_daily', '{"digest_date":"2026-02-30"}', '2026-10-01 12:00:00+00')
    = '2026-10-01 12:00:00+00' and laria_private.email_content_time('follow_weekly', '{"week_start":"2026-09-31"}',
    '2026-10-01 12:00:00+00') = '2026-10-01 12:00:00+00', 'a day that doesn''t exist ages from when it was queued, without an error');
  perform pg_temp.check(laria_private.calendar_date('2026-02-28') = '2026-02-28'::date
    and laria_private.calendar_date('2024-02-29') = '2024-02-29'::date and laria_private.calendar_date('2026-12-31') = '2026-12-31'::date,
    'real calendar dates are read');
  perform pg_temp.check(laria_private.calendar_date('2026-02-29') is null and laria_private.calendar_date('2026-04-31') is null
    and laria_private.calendar_date('2026-13-01') is null and laria_private.calendar_date('2026-00-10') is null
    and laria_private.calendar_date('0000-01-01') is null and laria_private.calendar_date('2026-1-01') is null
    and laria_private.calendar_date('2026-01-01T00:00') is null and laria_private.calendar_date(null) is null,
    'anything else is no date');
  perform pg_temp.check(laria_private.email_max_age('listing_review_reminder') = interval '3 days'
    and laria_private.email_max_age('follow_weekly') = interval '3 days', 'reminders and the weekly digest last three days');
  perform pg_temp.check(laria_private.email_max_age('transaction_confirmation_requested') = interval '7 days'
    and laria_private.email_max_age('store_approved') = interval '7 days', 'an account''s own business lasts a week');
  perform pg_temp.check(laria_private.email_max_age('a_kind_added_later') = interval '7 days', 'a new kind gets a week');
  perform pg_temp.check(laria_private.email_priority('transaction_confirmation_requested') = 0
    and laria_private.email_priority('a_kind_added_later') = 0, 'an account''s own business goes first');
  perform pg_temp.check(laria_private.email_priority('listing_review_reminder') = 1, 'reminders go next');
  perform pg_temp.check(laria_private.email_priority('search_alert_immediate') = 2
    and laria_private.email_priority('follow_weekly') = 2, 'alerts and digests go last');
  perform pg_temp.check((select daily_limit from laria_private.email_settings where id) = 80, 'the limit starts at 80');
  perform pg_temp.check(not has_table_privilege('service_role', 'laria_private.email_settings', 'select')
    and not has_table_privilege('authenticated', 'laria_private.email_settings', 'select'), 'no API role reads the settings');
end $$;

-- ------------------------------------------------------------------ expiry and order

select pg_temp.queue(1, 'search_alert_immediate', interval '25 hours');      -- past its day
select pg_temp.queue(2, 'search_alert_immediate', interval '23 hours');      -- still due, an alert
select pg_temp.queue(3, 'store_approved', interval '8 days');                -- past its week
select pg_temp.queue(4, 'store_approved', interval '6 days', 'retry');       -- still due, the account's own
select pg_temp.queue(5, 'listing_review_reminder', interval '4 days');       -- past its three days
select pg_temp.queue(8, 'transaction_confirmed', interval '1 hour');         -- still due, the account's own, newest
select pg_temp.queue(9, 'listing_review_reminder', interval '2 days');       -- still due, a reminder
-- A digest whose day doesn't exist, queued three days ago: it ages from then, and the claim goes on.
insert into laria_private.marketplace_email_deliveries(id, event_type, recipient_user_id, dedupe_key, context, created_at, next_attempt_at)
values (pg_temp.id(16), 'search_alert_daily', 'a2500000-0000-4000-8000-000000000001', 'la25-16', '{"digest_date":"2026-02-30"}',
  now() - interval '3 days', now() - interval '3 days');
-- Queued just now by the worker's catch-up, for a day that ended two days ago.
insert into laria_private.marketplace_email_deliveries(id, event_type, recipient_user_id, dedupe_key, context)
values (pg_temp.id(15), 'search_alert_daily', 'a2500000-0000-4000-8000-000000000001', 'la25-15',
  jsonb_build_object('digest_date', (clock_timestamp() at time zone 'America/Lima')::date - 3));
-- A worker that stopped mid-send on a ten-day-old e-mail.
insert into laria_private.marketplace_email_deliveries(id, event_type, recipient_user_id, dedupe_key, status, attempt_count,
  created_at, next_attempt_at, locked_at, locked_by)
values (pg_temp.id(6), 'store_verified', 'a2500000-0000-4000-8000-000000000001', 'la25-6', 'processing', 1,
  now() - interval '10 days', now() - interval '10 days', now() - interval '20 minutes', gen_random_uuid());
-- Sent: one today, one before midnight UTC.
insert into laria_private.marketplace_email_deliveries(id, event_type, recipient_user_id, dedupe_key, status, created_at,
  next_attempt_at, sent_at, provider_message_id)
values
 (pg_temp.id(7), 'listing_approved', 'a2500000-0000-4000-8000-000000000001', 'la25-7', 'sent', now() - interval '1 hour',
  now(), clock_timestamp(), 'qa-sent-today'),
 (pg_temp.id(10), 'listing_approved', 'a2500000-0000-4000-8000-000000000001', 'la25-10', 'sent', now() - interval '2 days',
  now(), date_trunc('day', clock_timestamp() at time zone 'UTC') at time zone 'UTC' - interval '1 minute', 'qa-sent-yesterday');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.expect_error('select public.claim_marketplace_email_deliveries(gen_random_uuid(), 10)', 'EMAIL_SERVICE_REQUIRED');
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare claim jsonb; begin
  claim := public.claim_marketplace_email_deliveries('a2520000-0000-4000-8000-000000000001', 10);
  perform pg_temp.check(pg_temp.claimed(claim) = array[pg_temp.id(4), pg_temp.id(8), pg_temp.id(9), pg_temp.id(2)],
    'the account''s own e-mails first, then the reminder, then the alert, oldest first in each: ' || claim::text);
  perform pg_temp.check(claim -> 0 ->> 'recipient_email' = 'la25-uno@example.invalid' and claim -> 0 ->> 'event_type' = 'store_approved',
    'the payload is unchanged');
end $$;
reset role;

do $$ begin
  perform pg_temp.check((select array_agg(id order by id) from laria_private.marketplace_email_deliveries
    where id = any(array[pg_temp.id(1), pg_temp.id(3), pg_temp.id(5), pg_temp.id(6), pg_temp.id(15), pg_temp.id(16)])
      and status = 'cancelled' and failure_code = 'expired')
      = array[pg_temp.id(1), pg_temp.id(3), pg_temp.id(5), pg_temp.id(6), pg_temp.id(15), pg_temp.id(16)],
    'e-mails past their age are cancelled as expired, the stopped worker''s, the old day''s digest and the one without a real day too');
  perform pg_temp.check((select count(*) from laria_private.marketplace_email_deliveries
    where id = any(array[pg_temp.id(2), pg_temp.id(4), pg_temp.id(8), pg_temp.id(9)]) and status = 'processing') = 4,
    'the due ones are being sent');
  perform pg_temp.check((select status from laria_private.marketplace_email_deliveries where id = pg_temp.id(7)) = 'sent',
    'a sent e-mail stays as it was');
end $$;

-- ------------------------------------------------------------------ the daily limit

-- Two of the four are sent; today now has three sent (one from before) and two still being sent.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.complete_marketplace_email_delivery(pg_temp.id(4), 'a2520000-0000-4000-8000-000000000001', 'qa-4');
select public.complete_marketplace_email_delivery(pg_temp.id(8), 'a2520000-0000-4000-8000-000000000001', 'qa-8');
select pg_temp.expect_error('select laria_private.set_email_daily_limit(100, ''desde la API'')', '42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.expect_error('select laria_private.set_email_daily_limit(100, ''desde la API'')', '42501');
reset role;

select pg_temp.expect_error('select laria_private.set_email_daily_limit(10, null)', 'Indica el límite diario');
select pg_temp.expect_error('select laria_private.set_email_daily_limit(-1, ''Plan de prueba'')', 'Indica el límite diario');
do $$ begin
  perform pg_temp.check(laria_private.set_email_daily_limit(7, 'Prueba del límite') = 7, 'an operator sets the limit');
  perform pg_temp.check((select daily_limit = 7 and reason = 'Prueba del límite' from laria_private.email_settings where id),
    'the limit and its reason are kept');
end $$;
select pg_temp.queue(11, 'store_rejected', interval '3 hours');
select pg_temp.queue(12, 'listing_price_drop', interval '5 hours');
select pg_temp.queue(13, 'listing_approved', interval '2 hours');
select pg_temp.queue(14, 'search_alert_immediate', interval '1 hour');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare claim jsonb; begin
  -- 7 a day, 3 sent today, 2 being sent: room for 2.
  claim := public.claim_marketplace_email_deliveries('a2520000-0000-4000-8000-000000000002', 10);
  perform pg_temp.check(pg_temp.claimed(claim) = array[pg_temp.id(11), pg_temp.id(13)],
    'the limit takes what fits, the account''s own first: ' || claim::text);
  claim := public.claim_marketplace_email_deliveries('a2520000-0000-4000-8000-000000000003', 10);
  perform pg_temp.check(claim = '[]'::jsonb, 'nothing more today: ' || claim::text);
end $$;
reset role;
do $$ begin
  perform pg_temp.check((select count(*) from laria_private.marketplace_email_deliveries
    where id = any(array[pg_temp.id(12), pg_temp.id(14)]) and status = 'pending') = 2, 'what didn''t fit waits');
end $$;

-- A failed send frees its place; the limit at 0 stops everything.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare claim jsonb; begin
  perform public.fail_marketplace_email_delivery(pg_temp.id(11), 'a2520000-0000-4000-8000-000000000002', false, 'recipient', 'qa_bounce');
  claim := public.claim_marketplace_email_deliveries('a2520000-0000-4000-8000-000000000004', 10);
  perform pg_temp.check(pg_temp.claimed(claim) = array[pg_temp.id(12)], 'a failed send frees its place: ' || claim::text);
end $$;
reset role;
select laria_private.set_email_daily_limit(0, 'Pausa de prueba');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ begin
  perform pg_temp.check(public.claim_marketplace_email_deliveries('a2520000-0000-4000-8000-000000000005', 10) = '[]'::jsonb,
    'a limit of 0 sends nothing');
end $$;
reset role;
do $$ begin
  perform pg_temp.check((select status from laria_private.marketplace_email_deliveries where id = pg_temp.id(14)) = 'pending',
    'the paused e-mail still waits');
end $$;

-- ------------------------------------------------------------------ uncertain sends

select laria_private.set_email_daily_limit(80, 'Vuelta al límite');
update laria_private.marketplace_email_deliveries set next_attempt_at = now() + interval '30 days'
where status in ('pending', 'retry');
select pg_temp.queue(20, 'listing_price_drop', interval '3 hours');
select pg_temp.queue(21, 'store_approved', interval '2 hours');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare claim jsonb; begin
  claim := public.claim_marketplace_email_deliveries('a2520000-0000-4000-8000-000000000006', 10);
  perform pg_temp.check(pg_temp.claimed(claim) = array[pg_temp.id(21), pg_temp.id(20)], 'both go out: ' || claim::text);
  -- The price drop's answer is lost; the store e-mail hits Resend's rate limit.
  perform pg_temp.check(public.fail_marketplace_email_delivery(pg_temp.id(20), 'a2520000-0000-4000-8000-000000000006', true,
    'transport', 'transport_error') = 'retry', 'a lost answer is retried');
  perform pg_temp.check(public.fail_marketplace_email_delivery(pg_temp.id(21), 'a2520000-0000-4000-8000-000000000006', true,
    'rate_limit', 'http_429') = 'retry', 'a rate limit is retried');
end $$;
reset role;
do $$ begin
  perform pg_temp.check((select uncertain_since is not null and uncertain_since = last_attempt_at
    from laria_private.marketplace_email_deliveries where id = pg_temp.id(20)), 'a lost answer may have been sent, from that attempt on');
  perform pg_temp.check((select uncertain_since is null from laria_private.marketplace_email_deliveries where id = pg_temp.id(21)),
    'a rate limit was not sent');
end $$;

update laria_private.marketplace_email_deliveries set next_attempt_at = now() - interval '1 minute'
where id = any(array[pg_temp.id(20), pg_temp.id(21)]);
-- Retries of sends that may have reached Resend: 24 hours ago (past the window) and 22 hours ago (within it).
insert into laria_private.marketplace_email_deliveries(id, event_type, recipient_user_id, dedupe_key, status, attempt_count,
  created_at, next_attempt_at, last_attempt_at, uncertain_since, failure_category, failure_code)
values
 (pg_temp.id(22), 'store_approved', 'a2500000-0000-4000-8000-000000000001', 'la25-22', 'retry', 2, now() - interval '30 hours',
  now() - interval '1 minute', now() - interval '20 hours', now() - interval '24 hours', 'transport', 'transport_error'),
 (pg_temp.id(23), 'listing_back_in_stock', 'a2500000-0000-4000-8000-000000000001', 'la25-23', 'retry', 1, now() - interval '22 hours',
  now() - interval '1 minute', now() - interval '22 hours', now() - interval '22 hours', 'provider', 'http_503');
-- A worker that stopped 20 minutes ago while sending.
insert into laria_private.marketplace_email_deliveries(id, event_type, recipient_user_id, dedupe_key, status, attempt_count,
  created_at, next_attempt_at, last_attempt_at, locked_at, locked_by)
values (pg_temp.id(24), 'listing_approved', 'a2500000-0000-4000-8000-000000000001', 'la25-24', 'processing', 1, now() - interval '1 hour',
  now() - interval '1 hour', now() - interval '20 minutes', now() - interval '20 minutes', gen_random_uuid());

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare claim jsonb; begin
  claim := public.claim_marketplace_email_deliveries('a2520000-0000-4000-8000-000000000007', 10);
  perform pg_temp.check(pg_temp.claimed(claim) = array[pg_temp.id(24), pg_temp.id(23), pg_temp.id(20), pg_temp.id(21)],
    'sends Resend may have accepted go first, the account''s own first among them; the rest follow: ' || claim::text);
end $$;
reset role;
do $$ begin
  perform pg_temp.check((select status = 'failed' and failure_code = 'retry_window_closed' and failure_category = 'transport'
    from laria_private.marketplace_email_deliveries where id = pg_temp.id(22)), 'past 23 hours it is given up, not sent again');
  perform pg_temp.check((select uncertain_since = now() - interval '20 minutes' and status = 'processing' and attempt_count = 2
    from laria_private.marketplace_email_deliveries where id = pg_temp.id(24)), 'a stopped worker''s send may have gone out, from its attempt');
end $$;

rollback;
