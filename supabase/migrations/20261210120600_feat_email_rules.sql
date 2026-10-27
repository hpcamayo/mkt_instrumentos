-- Feature ideas, integration: the branch's e-mail kinds under launch audit A25 (20261114160000_launch_audit_email_backlog.sql).
--
-- Since A25 the e-mail claim cancels an e-mail older than its kind's maximum age (laria_private.email_max_age) and,
-- when the daily limit can't take every e-mail, hands out an account's own business first, then reminders, then
-- alerts and digests (laria_private.email_priority). A kind neither function names gets a week and the first
-- priority. The branch adds 21 kinds; most are an account's own business and keep that default (help answers,
-- consignments, trades and offers between a person and a store, services, a stolen-gear match). The others:
--
--   * a sign-in from a new device says "just now": one day;
--   * try-outs are for a day and hour a few days ahead (requested, confirmed, declined, cancelled, the reminder the day
--     before): one day, so an e-mail about a slot doesn't arrive after it. The reminder is a reminder (priority 1);
--   * the Mi equipo reminder (strings, reeds, drumheads) is a reminder like main's: three days, priority 1;
--   * a private offer to people who saved a listing is optional, like a price drop (OPTIONAL_EMAIL_TYPES): two days,
--     priority 2.
--
-- Both functions are recreated with main's cases unchanged and these added.
--
-- Locks: none (two immutable functions). Rollback: recreate both from 20261114160000.

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
    -- Feature ideas (this migration).
    when p_event_type in ('account_new_device', 'listing_tryout_reminder', 'listing_tryout_confirmed',
                          'listing_tryout_declined', 'listing_tryout_cancelled', 'store_tryout_requested',
                          'store_tryout_cancelled') then interval '1 day'
    when p_event_type = 'listing_private_offer' then interval '2 days'
    when p_event_type = 'gear_reminder_due' then interval '3 days'
    else interval '7 days'
  end;
$$;

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
    -- Feature ideas (this migration).
    when p_event_type = 'listing_private_offer' then 2
    when p_event_type in ('gear_reminder_due', 'listing_tryout_reminder') then 1
    else 0
  end;
$$;

revoke all on function laria_private.email_max_age(text) from public, anon, authenticated;
revoke all on function laria_private.email_priority(text) from public, anon, authenticated;
