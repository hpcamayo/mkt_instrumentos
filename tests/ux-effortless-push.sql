-- Effortless Laria big-12: push notices (supabase/migrations/20261108120000_ux_push_notifications.sql).
-- A person reaches only their own devices, only browser push services are accepted, only the service role claims and
-- finishes deliveries, and the queue skips notices already read, old ones and people without a device.
-- Local/test database only. Every fixture is rolled back.
begin;

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
 ('7e000000-0000-4000-8000-000000000001','authenticated','authenticated','push-a@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Avisos A","phone":"51999998001","city":"Lima","region":"Lima"}'),
 ('7e000000-0000-4000-8000-000000000002','authenticated','authenticated','push-b@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Avisos B","phone":"51999998002","city":"Lima","region":"Lima"}'),
 ('7e000000-0000-4000-8000-000000000003','authenticated','authenticated','push-c@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Avisos C","phone":"51999998003","city":"Lima","region":"Lima"}');
insert into public.listings(id,slug,title,seller_type,status,category,instrument_type,attributes,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,created_by_source,marketplace_rules_accepted_at)
values ('7e100000-0000-4000-8000-000000000001','push-strat','Fender Stratocaster Avisos','individual','pending','guitars','electric_guitar','{"body_type":"solid_body","pickups":["single_coil","humbucker"]}','Fender','Stratocaster','Usado - buen estado',3200,'Lima','Lima','Avisos A','51999998001','Descripción válida y suficientemente extensa para la prueba de avisos en el teléfono.','7e000000-0000-4000-8000-000000000001','self_service',now());

-- A browser's keys (the RFC 8291 example) and the same key with a first byte that no P-256 point has.
create temporary table qa_keys on commit drop as
select 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'::text as p256dh,
  'BTBZMqHH6r4Tts7J_aSIgg'::text as auth,
  rtrim(translate(replace(encode(set_byte(laria_private.push_key_bytes('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 65), 0, 5), 'base64'), E'\n', ''), '+/', '-_'), '=') as not_a_point;
create temporary table qa_push(key text primary key, id uuid) on commit drop;
grant select on qa_keys to anon, authenticated, service_role;
grant select, insert on qa_push to authenticated, service_role;

-- Signed out: nothing.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare denied integer := 0; begin
  begin perform public.save_push_subscription('https://fcm.googleapis.com/fcm/send/qa-anon', 'x', 'y'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.get_push_subscription('https://fcm.googleapis.com/fcm/send/qa-anon'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.delete_push_subscription(null, 'https://fcm.googleapis.com/fcm/send/qa-anon'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.claim_push_deliveries(gen_random_uuid(), 10); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.finish_push_deliveries(gen_random_uuid(), '{}', 'sent'); exception when insufficient_privilege then denied := denied + 1; end;
  if denied <> 5 then raise exception 'Anonymous push guard failed (%)', denied; end if;
end $$;

-- Signed in: no worker authority and no direct access to devices or deliveries.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"7e000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare denied integer := 0; begin
  begin perform public.claim_push_deliveries(gen_random_uuid(), 10); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.finish_push_deliveries(gen_random_uuid(), '{}', 'sent'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform count(*) from laria_private.push_subscriptions; exception when insufficient_privilege then denied := denied + 1; end;
  begin perform count(*) from laria_private.push_deliveries; exception when insufficient_privilege then denied := denied + 1; end;
  begin perform laria_private.enqueue_notification_push(); exception when insufficient_privilege or feature_not_supported then denied := denied + 1; end;
  if denied <> 5 then raise exception 'Authenticated caller reached push internals (%)', denied; end if;
end $$;

-- Only browser push services, and real keys.
do $$ declare k record; attempt record; outcome text; begin
  select * into k from qa_keys;
  for attempt in
    select * from (values
      ('https://evil.example/fcm/send/x', k.p256dh, k.auth, 'PUSH_ENDPOINT_UNSUPPORTED'),
      ('http://fcm.googleapis.com/fcm/send/x', k.p256dh, k.auth, 'PUSH_ENDPOINT_UNSUPPORTED'),
      ('https://fcm.googleapis.com.evil.pe/x', k.p256dh, k.auth, 'PUSH_ENDPOINT_UNSUPPORTED'),
      ('https://fcm.googleapis.com@evil.pe/x', k.p256dh, k.auth, 'PUSH_ENDPOINT_UNSUPPORTED'),
      ('https://169.254.169.254/latest/meta-data', k.p256dh, k.auth, 'PUSH_ENDPOINT_UNSUPPORTED'),
      ('https://fcm.googleapis.com/fcm/send/x y', k.p256dh, k.auth, 'PUSH_ENDPOINT_UNSUPPORTED'),
      ('https://fcm.googleapis.com/' || repeat('a', 1100), k.p256dh, k.auth, 'PUSH_ENDPOINT_UNSUPPORTED'),
      ('https://fcm.googleapis.com/fcm/send/x', 'abc', k.auth, 'PUSH_KEYS_INVALID'),
      ('https://fcm.googleapis.com/fcm/send/x', k.not_a_point, k.auth, 'PUSH_KEYS_INVALID'),
      ('https://fcm.googleapis.com/fcm/send/x', k.p256dh, 'AAAA', 'PUSH_KEYS_INVALID'),
      ('https://fcm.googleapis.com/fcm/send/x', k.p256dh, null, 'PUSH_KEYS_INVALID')
    ) as cases(endpoint, p256dh, auth, expected)
  loop
    begin
      perform public.save_push_subscription(attempt.endpoint, attempt.p256dh, attempt.auth);
      outcome := 'saved';
    exception when others then
      outcome := sqlerrm;
    end;
    if outcome <> attempt.expected then raise exception 'Expected % for %, got %', attempt.expected, left(attempt.endpoint, 60), outcome; end if;
  end loop;
end $$;

-- A's phone: saved once, saved again in place (padded keys are the same keys), visible only to A.
do $$ declare k record; phone uuid; begin
  select * into k from qa_keys;
  phone := public.save_push_subscription('https://fcm.googleapis.com/fcm/send/qa-a-phone', k.p256dh, k.auth);
  if phone is null then raise exception 'Device not saved'; end if;
  if public.save_push_subscription('https://fcm.googleapis.com/fcm/send/qa-a-phone', k.p256dh || '=', k.auth || '==') is distinct from phone then
    raise exception 'Saving the same device twice made another one';
  end if;
  if public.get_push_subscription('https://fcm.googleapis.com/fcm/send/qa-a-phone') is distinct from phone then raise exception 'Own device not found'; end if;
  if public.get_push_subscription('https://fcm.googleapis.com/fcm/send/qa-unknown') is not null then raise exception 'Unknown device reported as on'; end if;
  insert into qa_push values ('a_phone', phone);
end $$;

-- B cannot see or remove A's device; turning notices on with the same browser makes it B's (a shared phone),
-- and back to A's when A turns them on there again.
select set_config('request.jwt.claims','{"sub":"7e000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare k record; begin
  select * into k from qa_keys;
  if public.get_push_subscription('https://fcm.googleapis.com/fcm/send/qa-a-phone') is not null then raise exception 'Another person''s device was visible'; end if;
  if public.delete_push_subscription((select id from qa_push where key = 'a_phone')) then raise exception 'Another person''s device was deleted by id'; end if;
  if public.delete_push_subscription(null, 'https://fcm.googleapis.com/fcm/send/qa-a-phone') then raise exception 'Another person''s device was deleted by address'; end if;
  insert into qa_push values ('shared', public.save_push_subscription('https://fcm.googleapis.com/fcm/send/qa-shared', k.p256dh, k.auth));
  insert into qa_push values ('b_iphone', public.save_push_subscription('https://web.push.apple.com/qa-b-iphone', k.p256dh, k.auth));
  if (select id from qa_push where key = 'b_iphone') is null then raise exception 'Apple device not saved'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"7e000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare k record; begin
  select * into k from qa_keys;
  if public.save_push_subscription('https://fcm.googleapis.com/fcm/send/qa-shared', k.p256dh, k.auth) is distinct from (select id from qa_push where key = 'shared') then
    raise exception 'A device taken over got a new id';
  end if;
  if public.get_push_subscription('https://wns2-par02p.notify.windows.com/w/?token=qa') is not null then raise exception 'Windows device on before saving'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"7e000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
  if public.get_push_subscription('https://fcm.googleapis.com/fcm/send/qa-shared') is not null then raise exception 'The previous person kept the shared device'; end if;
end $$;

-- Ten devices at most: the oldest goes.
select set_config('request.jwt.claims','{"sub":"7e000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare k record; begin
  select * into k from qa_keys;
  perform public.save_push_subscription('https://wns2-par02p.notify.windows.com/w/?token=qa', k.p256dh, k.auth);
  perform public.save_push_subscription('https://updates.push.services.mozilla.com/wpush/v2/qa-' || n, k.p256dh, k.auth) from generate_series(1, 8) n;
  if public.get_push_subscription('https://fcm.googleapis.com/fcm/send/qa-a-phone') is not null then raise exception 'The oldest device was kept past ten'; end if;
  if public.get_push_subscription('https://fcm.googleapis.com/fcm/send/qa-shared') is null then raise exception 'A newer device was dropped'; end if;
  if public.get_push_subscription('https://wns2-par02p.notify.windows.com/w/?token=qa') is null then raise exception 'Windows device not saved'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from laria_private.push_subscriptions where user_id = '7e000000-0000-4000-8000-000000000001') <> 10 then raise exception 'Device cap not applied'; end if;
  if (select count(*) from laria_private.push_subscriptions where user_id = '7e000000-0000-4000-8000-000000000002') <> 1 then raise exception 'B''s devices wrong'; end if;
  if exists (select 1 from laria_private.push_subscriptions where p256dh like '%=' or auth_secret like '%=') then raise exception 'Key padding stored'; end if;
end $$;

-- New notices queue one delivery each, only for people with a device.
insert into public.notifications(id, user_id, event_type, message, listing_id, created_at) values
 ('7e200000-0000-4000-8000-000000000001', '7e000000-0000-4000-8000-000000000001', 'listing_approved', 'Tu publicación fue aprobada y ya puede mostrarse en Laria.', '7e100000-0000-4000-8000-000000000001', now() - interval '2 minutes'),
 ('7e200000-0000-4000-8000-000000000002', '7e000000-0000-4000-8000-000000000001', 'listing_hidden', 'Moderación ocultó tu publicación. Revisa el motivo desde tu cuenta.', '7e100000-0000-4000-8000-000000000001', now() - interval '1 minute'),
 ('7e200000-0000-4000-8000-000000000003', '7e000000-0000-4000-8000-000000000003', 'listing_approved', 'Tu publicación fue aprobada y ya puede mostrarse en Laria.', '7e100000-0000-4000-8000-000000000001', now());
do $$ begin
  if (select count(*) from laria_private.push_deliveries where user_id = '7e000000-0000-4000-8000-000000000001' and status = 'pending') <> 2 then raise exception 'Deliveries not queued'; end if;
  if exists (select 1 from laria_private.push_deliveries where user_id = '7e000000-0000-4000-8000-000000000003') then raise exception 'Queued for a person without a device'; end if;
end $$;

-- One claim per person, newest notice first, with the listing's name and every device, newest first; a second
-- worker gets nothing.
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ declare first_claim jsonb; begin
  first_claim := public.claim_push_deliveries('7e300000-0000-4000-8000-000000000001', 50);
  if jsonb_array_length(first_claim) <> 1 or first_claim->0->>'user_id' <> '7e000000-0000-4000-8000-000000000001' then raise exception 'Claim not grouped by person: %', first_claim; end if;
  if jsonb_array_length(first_claim->0->'notices') <> 2 or first_claim->0->'notices'->0->>'event_type' <> 'listing_hidden' then raise exception 'Notices not newest first'; end if;
  if first_claim->0->'notices'->1->>'listing_title' <> 'Fender Stratocaster Avisos' or first_claim->0->'notices'->1->>'listing_id' <> '7e100000-0000-4000-8000-000000000001' then raise exception 'Listing missing'; end if;
  if jsonb_array_length(first_claim->0->'devices') <> 10 or first_claim->0->'devices'->0->>'endpoint' not like '%qa-8'
    or first_claim->0->'devices'->0->>'p256dh' is null or first_claim->0->'devices'->0->>'auth' is null then raise exception 'Devices missing from the claim'; end if;
  if jsonb_array_length(public.claim_push_deliveries('7e300000-0000-4000-8000-000000000002', 50)) <> 0 then raise exception 'A second worker claimed the same notices'; end if;
  insert into qa_push values
    ('delivery_hidden', (first_claim->0->'notices'->0->>'delivery_id')::uuid),
    ('delivery_approved', (first_claim->0->'notices'->1->>'delivery_id')::uuid),
    ('sent_device', (first_claim->0->'devices'->0->>'id')::uuid),
    ('gone_device', (first_claim->0->'devices'->1->>'id')::uuid),
    ('failing_device', (first_claim->0->'devices'->2->>'id')::uuid);
end $$;

-- Only the claiming worker finishes, with a known outcome.
do $$ declare problem text; begin
  begin
    perform public.finish_push_deliveries('7e300000-0000-4000-8000-000000000002', array(select id from qa_push where key like 'delivery_%'), 'sent');
    problem := 'finished';
  exception when others then problem := sqlerrm;
  end;
  if problem <> 'PUSH_DELIVERY_CLAIM_INVALID' then raise exception 'Another worker finished a claim (%)', problem; end if;
  begin
    perform public.finish_push_deliveries('7e300000-0000-4000-8000-000000000001', array(select id from qa_push where key like 'delivery_%'), 'delivered');
    problem := 'finished';
  exception when others then problem := sqlerrm;
  end;
  if problem <> 'PUSH_OUTCOME_INVALID' then raise exception 'Unknown outcome accepted (%)', problem; end if;
end $$;
reset role;
update laria_private.push_subscriptions set failure_count = 4 where id = (select id from qa_push where key = 'failing_device');

-- Sent marks the device that got it, a device the push service no longer knows is forgotten, a fifth failure in a
-- row forgets that one too, and devices of people outside the claim are never touched.
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ declare finished integer; begin
  finished := public.finish_push_deliveries('7e300000-0000-4000-8000-000000000001',
    array(select id from qa_push where key like 'delivery_%'), 'sent', null,
    array[(select id from qa_push where key = 'sent_device')],
    array[(select id from qa_push where key = 'failing_device')],
    array[(select id from qa_push where key = 'gone_device'), (select id from qa_push where key = 'b_iphone')]);
  if finished <> 2 then raise exception 'Finish touched % deliveries', finished; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from laria_private.push_deliveries where user_id = '7e000000-0000-4000-8000-000000000001' and (status <> 'sent' or sent_at is null or locked_by is not null or failure_code is not null)) then raise exception 'Sent deliveries not recorded'; end if;
  if (select last_success_at is null or failure_count <> 0 from laria_private.push_subscriptions where id = (select id from qa_push where key = 'sent_device')) then raise exception 'Device success not recorded'; end if;
  if exists (select 1 from laria_private.push_subscriptions where id in (select id from qa_push where key in ('gone_device', 'failing_device'))) then raise exception 'A gone or failing device was kept'; end if;
  if not exists (select 1 from laria_private.push_subscriptions where id = (select id from qa_push where key = 'b_iphone')) then raise exception 'A device outside the claim was deleted'; end if;
end $$;

-- A retry waits (5 minutes after the first attempt), comes back once due, and fails for good after five attempts.
insert into public.notifications(id, user_id, event_type, message, listing_id) values
 ('7e200000-0000-4000-8000-000000000004', '7e000000-0000-4000-8000-000000000001', 'listing_revision_approved', 'Los cambios propuestos para tu publicación fueron aprobados.', '7e100000-0000-4000-8000-000000000001');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ declare claimed jsonb; delivery uuid; begin
  claimed := public.claim_push_deliveries('7e300000-0000-4000-8000-000000000003', 50);
  delivery := (claimed->0->'notices'->0->>'delivery_id')::uuid;
  if jsonb_array_length(claimed->0->'notices') <> 1 or delivery is null then raise exception 'New notice not claimed: %', claimed; end if;
  if public.finish_push_deliveries('7e300000-0000-4000-8000-000000000003', array[delivery], 'retry', '429') <> 1 then raise exception 'Retry not recorded'; end if;
  if jsonb_array_length(public.claim_push_deliveries('7e300000-0000-4000-8000-000000000003', 50)) <> 0 then raise exception 'A retry was claimed before it was due'; end if;
  insert into qa_push values ('retry', delivery);
end $$;
reset role;
do $$ declare delivery_row laria_private.push_deliveries; begin
  select * into delivery_row from laria_private.push_deliveries where id = (select id from qa_push where key = 'retry');
  if delivery_row.status <> 'pending' or delivery_row.attempt_count <> 1 or delivery_row.failure_code <> '429'
    or delivery_row.next_attempt_at < clock_timestamp() + interval '4 minutes' or delivery_row.locked_by is not null then
    raise exception 'Retry backoff wrong: %', delivery_row;
  end if;
end $$;
update laria_private.push_deliveries set next_attempt_at = clock_timestamp() - interval '1 second', attempt_count = 4 where id = (select id from qa_push where key = 'retry');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ declare claimed jsonb; begin
  claimed := public.claim_push_deliveries('7e300000-0000-4000-8000-000000000004', 50);
  if (claimed->0->'notices'->0->>'delivery_id')::uuid is distinct from (select id from qa_push where key = 'retry') then raise exception 'Due retry not claimed'; end if;
  perform public.finish_push_deliveries('7e300000-0000-4000-8000-000000000004', array[(select id from qa_push where key = 'retry')], 'retry', 'transport');
end $$;
reset role;
do $$ begin
  if (select status <> 'failed' or attempt_count <> 5 or failure_code <> 'transport' from laria_private.push_deliveries where id = (select id from qa_push where key = 'retry')) then
    raise exception 'Fifth failed attempt did not fail for good';
  end if;
end $$;

-- Read in Laria, three days old, or nobody's device left: skipped, never sent.
insert into public.notifications(id, user_id, event_type, message, listing_id) values
 ('7e200000-0000-4000-8000-000000000005', '7e000000-0000-4000-8000-000000000001', 'listing_rejected', 'Tu publicación fue rechazada. Revisa el motivo y corrígela desde tu cuenta.', '7e100000-0000-4000-8000-000000000001'),
 ('7e200000-0000-4000-8000-000000000006', '7e000000-0000-4000-8000-000000000001', 'listing_revision_rejected', 'Los cambios propuestos para tu publicación fueron rechazados. Revisa el motivo.', '7e100000-0000-4000-8000-000000000001'),
 ('7e200000-0000-4000-8000-000000000007', '7e000000-0000-4000-8000-000000000002', 'listing_approved', 'Tu publicación fue aprobada y ya puede mostrarse en Laria.', '7e100000-0000-4000-8000-000000000001');
update public.notifications set read_at = now() where id = '7e200000-0000-4000-8000-000000000005';
update laria_private.push_deliveries set created_at = clock_timestamp() - interval '4 days' where notification_id = '7e200000-0000-4000-8000-000000000006';
delete from laria_private.push_subscriptions where user_id = '7e000000-0000-4000-8000-000000000002';
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ begin
  if jsonb_array_length(public.claim_push_deliveries('7e300000-0000-4000-8000-000000000005', 50)) <> 0 then raise exception 'A read, old or device-less notice was claimed'; end if;
end $$;
reset role;
do $$ begin
  if (select string_agg(failure_code, ',' order by notification_id) from laria_private.push_deliveries
      where notification_id in ('7e200000-0000-4000-8000-000000000005', '7e200000-0000-4000-8000-000000000006', '7e200000-0000-4000-8000-000000000007') and status = 'skipped')
    is distinct from 'read,stale,no_device' then raise exception 'Skips not recorded'; end if;
end $$;

-- A worker that stopped mid-batch gives its claim back after 15 minutes.
insert into public.notifications(id, user_id, event_type, message, listing_id) values
 ('7e200000-0000-4000-8000-000000000008', '7e000000-0000-4000-8000-000000000001', 'listing_approved', 'Tu publicación fue aprobada y ya puede mostrarse en Laria.', '7e100000-0000-4000-8000-000000000001');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ begin
  if jsonb_array_length(public.claim_push_deliveries('7e300000-0000-4000-8000-000000000006', 50)) <> 1 then raise exception 'New notice not claimed'; end if;
  if jsonb_array_length(public.claim_push_deliveries('7e300000-0000-4000-8000-000000000007', 50)) <> 0 then raise exception 'A fresh claim was taken over'; end if;
end $$;
reset role;
update laria_private.push_deliveries set locked_at = clock_timestamp() - interval '20 minutes' where notification_id = '7e200000-0000-4000-8000-000000000008';
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ begin
  if jsonb_array_length(public.claim_push_deliveries('7e300000-0000-4000-8000-000000000007', 50)) <> 1 then raise exception 'A stale claim was not given back'; end if;
end $$;
reset role;
do $$ begin
  if (select locked_by <> '7e300000-0000-4000-8000-000000000007' or attempt_count <> 2 or status <> 'processing' from laria_private.push_deliveries where notification_id = '7e200000-0000-4000-8000-000000000008') then
    raise exception 'Reclaimed delivery state wrong';
  end if;
end $$;

-- Turning notices off here (by address) or signing out (by device id) removes only the person's own device;
-- deleting a notice removes its delivery.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"7e000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
  if not public.delete_push_subscription(null, 'https://fcm.googleapis.com/fcm/send/qa-shared') then raise exception 'Own device not deleted by address'; end if;
  if not public.delete_push_subscription((select id from qa_push where key = 'sent_device')) then raise exception 'Own device not deleted by id'; end if;
  if public.delete_push_subscription(gen_random_uuid()) then raise exception 'Deleted a device that does not exist'; end if;
  if public.get_push_subscription('https://fcm.googleapis.com/fcm/send/qa-shared') is not null then raise exception 'Deleted device still on'; end if;
end $$;
reset role;
delete from public.notifications where id = '7e200000-0000-4000-8000-000000000001';
do $$ begin
  if exists (select 1 from laria_private.push_deliveries where notification_id = '7e200000-0000-4000-8000-000000000001') then raise exception 'Delivery outlived its notice'; end if;
  if (select count(*) from laria_private.push_subscriptions where user_id = '7e000000-0000-4000-8000-000000000001') <> 6 then raise exception 'Wrong devices left after turning off'; end if;
end $$;

rollback;
