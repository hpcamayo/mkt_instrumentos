-- Feature ideas, integration (migrations 20261210120000..120200, 120600): "Mi equipo" serials (selling-tools) in the
-- stolen-gear matching (accounts batch, safe-02), both directions, Admin's view of a gear match, and the e-mail rules of
-- the branch's kinds. Actual Auth claims; local/test database only, every fixture rolls back.
begin;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;
create function pg_temp.as_user(p_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"f9100000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal2","app_metadata":{"role":"admin"}}', true);
end $$;
create function pg_temp.gear_matches(p_item uuid) returns bigint language sql security definer as $$
  select count(*) from public.stolen_report_matches where source = 'gear' and ref_id = p_item
$$;

insert into auth.users (id, aud, role, email, email_confirmed_at, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
 ('f9100000-0000-4000-8000-000000000001','authenticated','authenticated','int-owner@example.invalid',now(),'x','{}','{"account_type":"seller","full_name":"Tiene Equipo","phone":"51999997001","city":"Lima","region":"Lima"}'),
 ('f9100000-0000-4000-8000-000000000002','authenticated','authenticated','int-reporter@example.invalid',now(),'x','{}','{"account_type":"seller","full_name":"Reporta Robo","phone":"51999997002","city":"Lima","region":"Lima"}'),
 ('f9100000-0000-4000-8000-000000000003','authenticated','authenticated','int-later@example.invalid',now(),'x','{}','{"account_type":"seller","full_name":"Llega Después","phone":"51999997003","city":"Cusco","region":"Cusco"}'),
 ('f9100000-0000-4000-8000-000000000099','authenticated','authenticated','int-admin@example.invalid',now(),'x','{"role":"admin"}','{"account_type":"seller","full_name":"Admin QA"}');

-- An item saved before any report: nothing to match yet.
set local role authenticated;
select pg_temp.as_user('f9100000-0000-4000-8000-000000000001');
do $$ declare item uuid; begin
  item := public.save_gear_item(null, '{"category":"guitars","instrument_type":"electric_guitar","brand":"Fender","model":"Stratocaster","serial":"us-1234 5678"}');
  perform set_config('qa.item_owner', item::text, true);
  perform pg_temp.check(pg_temp.gear_matches(item) = 0, 'a match without any report');
end $$;
-- The reporter's own gear with the same serial.
select pg_temp.as_user('f9100000-0000-4000-8000-000000000002');
do $$ declare item uuid; begin
  item := public.save_gear_item(null, '{"category":"guitars","instrument_type":"electric_guitar","brand":"Fender","model":"Stratocaster","serial":"US12345678"}');
  perform set_config('qa.item_reporter', item::text, true);
end $$;

-- A new report scans Mi equipo: the other person's item matches (serial written differently), the reporter's never.
do $$ declare report jsonb; begin
  report := public.submit_stolen_gear_report('Fender', 'Stratocaster', 'Guitarra robada en un ensayo en Barranco', 'US-12345678',
    current_date - 2, 'Barranco, Lima', 'DEN-2026-777', null);
  perform set_config('qa.report', report->>'id', true);
end $$;
reset role;
do $$ begin
  perform pg_temp.check(pg_temp.gear_matches(current_setting('qa.item_owner')::uuid) = 1, 'new report did not find the Mi equipo item');
  perform pg_temp.check(pg_temp.gear_matches(current_setting('qa.item_reporter')::uuid) = 0, 'the reporter''s own gear matched');
  perform pg_temp.check((select detail->>'serial' from public.stolen_report_matches where ref_id = current_setting('qa.item_owner')::uuid) = 'US12345678',
    'match does not say which serial');
end $$;

-- An item saved after the report matches on insert; a serial changed to the reported one matches on update, and
-- saving the item again without changing the serial adds nothing. The owner never sees the match.
set local role authenticated;
select pg_temp.as_user('f9100000-0000-4000-8000-000000000003');
do $$ declare later uuid; renamed uuid; begin
  later := public.save_gear_item(null, '{"category":"guitars","instrument_type":"electric_guitar","brand":"Fender","model":"Strat","serial":"US 1234 5678"}');
  renamed := public.save_gear_item(null, '{"category":"guitars","instrument_type":"electric_guitar","brand":"Fender","model":"Strat","serial":"XX-0000"}');
  perform set_config('qa.item_later', later::text, true);
  perform set_config('qa.item_renamed', renamed::text, true);
  perform pg_temp.check(pg_temp.gear_matches(later) = 1, 'insert with a reported serial did not match');
  perform pg_temp.check(pg_temp.gear_matches(renamed) = 0, 'an unrelated serial matched');
  perform public.save_gear_item(renamed, '{"category":"guitars","instrument_type":"electric_guitar","brand":"Fender","model":"Strat","serial":"us12345678"}');
  perform pg_temp.check(pg_temp.gear_matches(renamed) = 1, 'serial changed to the reported one did not match');
  perform public.save_gear_item(renamed, '{"category":"guitars","instrument_type":"electric_guitar","brand":"Fender","model":"Strat","serial":"US1234-5678","note":"Con estuche"}');
  perform pg_temp.check(pg_temp.gear_matches(renamed) = 1, 'saving again duplicated the match');
  begin
    perform 1 from public.stolen_report_matches;
    raise exception 'FAILED: the gear owner read the matches';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Admin sees what the item is, never who owns it; a removed item keeps its match, without the item.
set local role authenticated;
select pg_temp.as_admin();
do $$ declare queue jsonb; entry jsonb; begin
  queue := public.admin_stolen_matches('pending', 50);
  select item into entry from jsonb_array_elements(queue->'items') item where item->>'ref_id' = current_setting('qa.item_owner');
  perform pg_temp.check(entry->>'source' = 'gear', 'gear match missing from the queue');
  perform pg_temp.check(entry->'gear_item'->>'title' = 'Fender Stratocaster', 'gear item title missing: ' || coalesce(entry::text, 'null'));
  perform pg_temp.check(entry->'gear_item' ? 'sale_listing_id' and jsonb_typeof(entry->'gear_item'->'sale_listing_id') = 'null', 'item not on sale shows a listing');
  perform pg_temp.check(position('Tiene Equipo' in entry::text) = 0 and position('int-owner@' in entry::text) = 0, 'gear owner named to Admin');
  perform pg_temp.check(entry->'listing' = 'null'::jsonb and entry->'inventory_item' = 'null'::jsonb, 'gear match shows a listing or SKU');
end $$;
reset role;
set local role authenticated;
select pg_temp.as_user('f9100000-0000-4000-8000-000000000001');
do $$ begin
  perform pg_temp.check(public.delete_gear_item(current_setting('qa.item_owner')::uuid), 'item not deleted');
end $$;
select pg_temp.as_admin();
do $$ declare queue jsonb; entry jsonb; begin
  queue := public.admin_stolen_matches('pending', 50);
  select item into entry from jsonb_array_elements(queue->'items') item where item->>'ref_id' = current_setting('qa.item_owner');
  perform pg_temp.check(entry is not null and entry->'gear_item' = 'null'::jsonb, 'removed item lost its match or still shows: ' || coalesce(entry::text, 'null'));
end $$;
reset role;

-- The other sources still match as before (the redefined report trigger keeps the listing and SKU scans).
do $$ begin
  perform pg_temp.check(exists (select 1 from pg_trigger where tgname = 'stolen_gear_reports_match' and not tgisinternal), 'report trigger missing');
  perform pg_temp.check(position('listing_serials' in pg_get_functiondef('laria_private.match_new_stolen_report()'::regprocedure)) > 0
    and position('inventory_item_serials' in pg_get_functiondef('laria_private.match_new_stolen_report()'::regprocedure)) > 0
    and position('gear_items' in pg_get_functiondef('laria_private.match_new_stolen_report()'::regprocedure)) > 0,
    'match_new_stolen_report lost a scan');
end $$;

-- E-mail ages and priorities for the branch's kinds (20261210120600, launch audit A25); main's kinds unchanged.
do $$ declare kind text; begin
  perform pg_temp.check(laria_private.email_max_age('search_alert_daily') = interval '1 day'
    and laria_private.email_max_age('listing_price_drop') = interval '2 days'
    and laria_private.email_max_age('listing_review_reminder') = interval '3 days'
    and laria_private.email_max_age('listing_approved') = interval '7 days'
    and laria_private.email_priority('follow_weekly') = 2 and laria_private.email_priority('listing_purchase_check') = 1
    and laria_private.email_priority('transaction_confirmed') = 0, 'main''s kinds keep their rules');
  foreach kind in array array['account_new_device', 'listing_tryout_reminder', 'listing_tryout_confirmed',
      'listing_tryout_declined', 'listing_tryout_cancelled', 'store_tryout_requested', 'store_tryout_cancelled'] loop
    perform pg_temp.check(laria_private.email_max_age(kind) = interval '1 day', kind || ' ages out in a day');
  end loop;
  perform pg_temp.check(laria_private.email_max_age('listing_private_offer') = interval '2 days'
    and laria_private.email_priority('listing_private_offer') = 2, 'a private offer goes like a price drop');
  perform pg_temp.check(laria_private.email_max_age('gear_reminder_due') = interval '3 days'
    and laria_private.email_priority('gear_reminder_due') = 1 and laria_private.email_priority('listing_tryout_reminder') = 1,
    'reminders go after an account''s own business');
  perform pg_temp.check(laria_private.email_max_age('stolen_report_match') = interval '7 days'
    and laria_private.email_priority('stolen_report_match') = 0 and laria_private.email_priority('account_new_device') = 0,
    'the rest is an account''s own business');
end $$;

rollback;
