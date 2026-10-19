-- Effortless Laria, integration (docs/ux-effortless/integration.md): what the batches share once they meet.
-- UXD-integration-3: after every batch's migrations, each notification and e-mail type any batch added is still
-- allowed, and the shared laria_private.ux_extend_text_check reads either form Postgres prints a list in.
-- Local/test database only. Every fixture is rolled back.
begin;
set local client_min_messages = warning;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;

-- Copies one check constraint onto a one-column scratch table and reports which of p_values it accepts, so the test
-- exercises the constraint itself rather than reading its text the way the helper does.
create function pg_temp.accepted(p_table regclass, p_constraint text, p_values text[]) returns text[] language plpgsql as $$
declare
  definition text;
  value text;
  ok text[] := '{}';
begin
  select pg_get_constraintdef(oid) into definition from pg_constraint where conrelid = p_table and conname = p_constraint;
  if definition is null then raise exception 'FAILED: % on % not found', p_constraint, p_table; end if;
  drop table if exists pg_temp.qa_probe;
  create temporary table qa_probe (event_type text);
  execute format('alter table pg_temp.qa_probe add constraint qa_probe_check %s', definition);
  foreach value in array p_values loop
    begin
      insert into pg_temp.qa_probe values (value);
      ok := ok || value;
    exception when check_violation then null;
    end;
  end loop;
  return ok;
end $$;

-- Every in-app notification type: the marketplace's own, then listing (big-11, list-11), accounts (search alerts), my
-- listings (check-ins and reminders) and inventory (stock-06 daily summary).
create temporary table qa_notification_types on commit drop as select unnest(array[
  'listing_approved', 'listing_hidden', 'listing_price_drop', 'listing_rejected', 'listing_revision_approved',
  'listing_revision_rejected', 'review_revealed', 'store_approved', 'store_rejected', 'store_verification_revoked',
  'store_verified', 'transaction_cancelled', 'transaction_confirmation_requested', 'transaction_confirmed',
  'transaction_declined',
  'listing_back_in_stock', 'listing_question_asked', 'listing_question_answered',
  'listing_alert_match',
  'listing_purchase_check', 'listing_buyer_reported_purchase', 'listing_availability_checkin',
  'listing_purchase_confirmation_reminder', 'listing_review_reminder',
  'store_stock_summary'
]) as event_type;

-- Every e-mail type: the marketplace's own and the search alerts, then listing, accounts (weekly follow) and my
-- listings.
create temporary table qa_email_types on commit drop as select unnest(array[
  'listing_approved', 'listing_hidden', 'listing_price_drop', 'listing_rejected', 'listing_revision_approved',
  'listing_revision_rejected', 'review_revealed', 'search_alert_daily', 'search_alert_immediate', 'store_approved',
  'store_rejected', 'store_verification_revoked', 'store_verified', 'transaction_cancelled',
  'transaction_confirmation_requested', 'transaction_confirmed', 'transaction_declined',
  'listing_back_in_stock', 'listing_question_asked',
  'follow_weekly',
  'listing_purchase_check', 'listing_buyer_reported_purchase', 'listing_availability_checkin',
  'listing_purchase_confirmation_reminder', 'listing_review_reminder'
]) as event_type;

do $$
declare
  expected text[];
  missing text[];
begin
  select array_agg(event_type order by event_type) into expected from qa_notification_types;
  select array_agg(value order by value) into missing
  from unnest(expected) value
  where value <> all (pg_temp.accepted('public.notifications', 'notifications_event_type_check', expected));
  perform pg_temp.check(missing is null, 'notification types missing: ' || coalesce(missing::text, ''));
  perform pg_temp.check(cardinality(pg_temp.accepted('public.notifications', 'notifications_event_type_check', array['not_a_type'])) = 0,
    'notifications still refuse an unknown type');

  select array_agg(event_type order by event_type) into expected from qa_email_types;
  select array_agg(value order by value) into missing
  from unnest(expected) value
  where value <> all (pg_temp.accepted('laria_private.marketplace_email_deliveries', 'marketplace_email_deliveries_event_type_check', expected));
  perform pg_temp.check(missing is null, 'e-mail types missing: ' || coalesce(missing::text, ''));
  perform pg_temp.check(cardinality(pg_temp.accepted('laria_private.marketplace_email_deliveries', 'marketplace_email_deliveries_event_type_check', array['not_a_type'])) = 0,
    'e-mails still refuse an unknown type');
end $$;

-- The helper on both printed forms: a fresh `in (…)` list prints as ARRAY['a'::text, …]; once the helper rewrote it,
-- it prints as '{a,…}'::text[]. A second extension must keep everything the first one left.
create temporary table qa_forms (event_type text constraint qa_forms_check check (event_type in ('a_one', 'b_two'))) on commit drop;
select laria_private.ux_extend_text_check('pg_temp.qa_forms', 'qa_forms_check', 'event_type', array['c_three']);
select pg_temp.check(pg_get_constraintdef(oid) like '%''{%', 'the rewritten list prints in the text[] form')
from pg_constraint where conrelid = 'pg_temp.qa_forms'::regclass and conname = 'qa_forms_check';
select laria_private.ux_extend_text_check('pg_temp.qa_forms', 'qa_forms_check', 'event_type', array['d_four', 'a_one']);
select pg_temp.check(
  pg_temp.accepted('pg_temp.qa_forms', 'qa_forms_check', array['a_one', 'b_two', 'c_three', 'd_four', 'e_five'])
    = array['a_one', 'b_two', 'c_three', 'd_four'],
  'both forms keep every value, add the new ones once and still refuse others');

do $$
begin
  perform laria_private.ux_extend_text_check('public.notifications', 'notifications_pkey', 'event_type', array['x']);
  raise exception 'FAILED: a constraint that is not a check was accepted';
exception when others then
  perform pg_temp.check(sqlerrm like '%not found%', 'a missing check is reported: ' || sqlerrm);
end $$;

rollback;
