-- Effortless Laria, accounts batch: saving, alerts, e-mail choices, sharing and following
-- (docs/ux-effortless/accounts.md). Actual Auth claims and RLS; every fixture rolls back.
begin;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('a2040000-0000-4000-8000-000000000001','authenticated','authenticated','ux-seller@example.invalid','{}','{"account_type":"seller","full_name":"Vende Uno","phone":"51999999101","city":"Lima","region":"Lima"}'),
 ('a2040000-0000-4000-8000-000000000002','authenticated','authenticated','ux-buyer@example.invalid','{}','{"account_type":"seller","full_name":"Ana Compradora","phone":"51999999102","city":"Lima","region":"Lima"}'),
 ('a2040000-0000-4000-8000-000000000003','authenticated','authenticated','ux-other@example.invalid','{}','{"account_type":"seller","full_name":"Otro","phone":"51999999103","city":"Lima","region":"Lima"}');
insert into public.listings(id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,created_by_source,published_at)
values
 ('a2040000-0000-4000-8000-000000000101','ux-strat','Fender Stratocaster','individual','approved','guitars','electric_guitar','Fender','Strat','Usado - buen estado',2500,'Lima','Lima','Vende','51999999101','Descripción de prueba suficientemente extensa para publicar este instrumento.','a2040000-0000-4000-8000-000000000001','admin',now() - interval '2 days'),
 ('a2040000-0000-4000-8000-000000000102','ux-hidden','Oculta','individual','hidden','guitars','electric_guitar','Fender','X','Usado - buen estado',900,'Lima','Lima','Vende','51999999101','Descripción de prueba suficientemente extensa para publicar este instrumento.','a2040000-0000-4000-8000-000000000001','admin',now() - interval '2 days'),
 ('a2040000-0000-4000-8000-000000000103','ux-tele','Fender Telecaster','individual','approved','guitars','electric_guitar','Fender','Tele','Nuevo',3000,'Arequipa','Arequipa','Vende','51999999101','Descripción de prueba suficientemente extensa para publicar este instrumento.','a2040000-0000-4000-8000-000000000001','admin',now() - interval '1 hour');
insert into public.listing_photos(listing_id,image_url,sort_order) values
 ('a2040000-0000-4000-8000-000000000101','https://example.invalid/strat-0.jpg',0),
 ('a2040000-0000-4000-8000-000000000101','https://example.invalid/strat-1.jpg',1);

-- Other notification types survive the additive constraint change.
do $$ begin
 if not exists (select 1 from pg_constraint where conname = 'notifications_event_type_check'
   and pg_get_constraintdef(oid) like '%listing_alert_match%' and pg_get_constraintdef(oid) like '%review_revealed%') then
   raise exception 'Notification types lost';
 end if;
end $$;

-- big-04: public cards for device favorites and recently viewed listings; nothing about hidden listings.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare cards jsonb; begin
 cards := public.get_public_listing_cards(array['a2040000-0000-4000-8000-000000000101','a2040000-0000-4000-8000-000000000102']::uuid[], array['ux-tele']);
 if jsonb_array_length(cards) <> 2 then raise exception 'Public cards wrong: %', cards; end if;
 if exists (select 1 from jsonb_array_elements(cards) c where c->>'slug' = 'ux-hidden') then raise exception 'Hidden listing leaked'; end if;
 if (select c->>'image_url' from jsonb_array_elements(cards) c where c->>'slug' = 'ux-strat') <> 'https://example.invalid/strat-0.jpg' then raise exception 'Card photo missing'; end if;
 begin perform public.merge_device_favorites(array['a2040000-0000-4000-8000-000000000101']::uuid[]); raise exception 'Anonymous merge allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- big-04: merging device favorites at sign-in skips hidden, own and repeated listings.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2040000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.merge_device_favorites(array['a2040000-0000-4000-8000-000000000101','a2040000-0000-4000-8000-000000000102','a2040000-0000-4000-8000-000000000101']::uuid[]) <> 1 then raise exception 'Merge count wrong'; end if;
 if public.merge_device_favorites(array['a2040000-0000-4000-8000-000000000101']::uuid[]) <> 0 then raise exception 'Merge repeated a favorite'; end if;
 if public.merge_device_favorites('{}'::uuid[]) <> 0 then raise exception 'Empty merge failed'; end if;
 if (select saved_price_pen from public.favorites where listing_id = 'a2040000-0000-4000-8000-000000000101') <> 2500 then raise exception 'Saved price missing'; end if;
 perform public.set_favorite_note('a2040000-0000-4000-8000-000000000101', '  Pregúntale al profe  ');
 if (public.get_account_favorites()->'items'->0->>'note') <> 'Pregúntale al profe' then raise exception 'Note not saved'; end if;
 if (public.get_account_favorites()->'items'->0->>'category') <> 'guitars' then raise exception 'Favorite category missing'; end if;
 begin perform public.set_favorite_note('a2040000-0000-4000-8000-000000000101', repeat('x', 281)); raise exception 'Long note allowed';
 exception when others then if sqlerrm not like '%FAVORITE_NOTE_TOO_LONG%' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"a2040000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if public.merge_device_favorites(array['a2040000-0000-4000-8000-000000000101']::uuid[]) <> 0 then raise exception 'Own listing merged'; end if;
end $$;
reset role;

-- save-08: drops under 5% and a second drop within a day do not alert; the notice names the listing.
select set_config('app.allow_listing_admin_fields','true',true);
update public.listings set price_pen = 2450 where slug = 'ux-strat';
do $$ begin if exists (select 1 from public.notifications where event_type = 'listing_price_drop' and listing_id = 'a2040000-0000-4000-8000-000000000101') then raise exception 'Drop under 5%% alerted'; end if; end $$;
update public.listings set price_pen = 2100 where slug = 'ux-strat';
update public.listings set price_pen = 1900 where slug = 'ux-strat';
do $$ begin
 if (select count(*) from public.notifications where event_type = 'listing_price_drop' and listing_id = 'a2040000-0000-4000-8000-000000000101') <> 1 then raise exception 'Daily limit broken'; end if;
 if (select message from public.notifications where event_type = 'listing_price_drop' and listing_id = 'a2040000-0000-4000-8000-000000000101') <> '«Fender Stratocaster» bajó de S/ 2,450 a S/ 2,100.' then raise exception 'Price-drop notice without the name'; end if;
 if (select count(*) from laria_private.marketplace_email_deliveries where event_type = 'listing_price_drop' and recipient_user_id = 'a2040000-0000-4000-8000-000000000002') <> 1 then raise exception 'Price-drop e-mail missing'; end if;
end $$;

-- save-07: turning price-drop e-mails off keeps the in-app notice and queues no e-mail.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2040000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.set_email_preferences(false, true);
do $$ begin
 if (select price_drop_emails from public.email_preferences) then raise exception 'Preference not saved'; end if;
 begin perform public.apply_email_link_action('a2040000-0000-4000-8000-000000000002', 'no_price_drops'); raise exception 'Link action without the service role';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.listing_price_drops set created_at = created_at - interval '25 hours' where listing_id = 'a2040000-0000-4000-8000-000000000101';
update public.listings set price_pen = 1700 where slug = 'ux-strat';
do $$ begin
 if (select count(*) from public.notifications where event_type = 'listing_price_drop' and listing_id = 'a2040000-0000-4000-8000-000000000101') <> 2 then raise exception 'Next-day drop missing'; end if;
 if (select count(*) from laria_private.marketplace_email_deliveries where event_type = 'listing_price_drop' and recipient_user_id = 'a2040000-0000-4000-8000-000000000002') <> 1 then raise exception 'Opted-out e-mail queued'; end if;
end $$;

-- save-11: one share link per account; the public list shows first name, public items and notes only.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2040000-0000-4000-8000-000000000002","role":"authenticated"}',true);
create temporary table share_token(token text) on commit drop;
grant select on share_token to anon;
insert into share_token select public.get_or_create_favorite_share();
do $$ begin
 if public.get_or_create_favorite_share() <> (select token from share_token) then raise exception 'Second share link'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare shared jsonb; begin
 shared := public.get_shared_favorite_list((select token from share_token));
 if shared->>'owner_name' <> 'Ana' then raise exception 'Owner name wrong: %', shared; end if;
 if jsonb_array_length(shared->'items') <> 1 or shared->'items'->0->>'note' <> 'Pregúntale al profe' then raise exception 'Shared items wrong: %', shared; end if;
 if shared::text like '%ux-buyer@example.invalid%' or shared::text like '%51999999102%' then raise exception 'Private data shared'; end if;
 if public.get_shared_favorite_list('not-a-token') is not null then raise exception 'Bad token answered'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2040000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.revoke_favorite_share();
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin if public.get_shared_favorite_list((select token from share_token)) is not null then raise exception 'Revoked link still works'; end if; end $$;
reset role;

-- save-12: follow a brand; its new public listings arrive with the reason. The weekly e-mail is opt-in.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2040000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.set_follow(null, ' fender ', true);
select public.set_follow(null, 'FENDER', true);
do $$ declare arrivals jsonb; begin
 if (select count(*) from public.follows) <> 1 then raise exception 'Brand follow duplicated'; end if;
 arrivals := public.get_followed_arrivals(12, 14);
 if jsonb_array_length(arrivals) <> 2 or arrivals->0->>'slug' <> 'ux-tele' or arrivals->0->>'reason' <> 'brand' then raise exception 'Arrivals wrong: %', arrivals; end if;
 begin perform public.set_follow(null, null, true); raise exception 'Empty follow allowed'; exception when others then if sqlerrm not like '%FOLLOW_INVALID%' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"a2040000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin if (select count(*) from public.follows) <> 0 then raise exception 'Foreign follows visible'; end if; end $$;
select public.set_follow(null, 'Fender', true);
reset role;
do $$ declare monday date := date_trunc('week', (now() at time zone 'America/Lima')::date + 7)::date - 7; begin
 -- Only the account that opted in (Ana, set_email_preferences(false, true) above) gets the weekly e-mail.
 update public.listings set published_at = (monday - 3)::timestamp at time zone 'America/Lima' where slug = 'ux-tele';
 perform laria_private.prepare_weekly_follow_emails(monday, 100);
 if (select count(*) from laria_private.marketplace_email_deliveries where event_type = 'follow_weekly') <> 1 then raise exception 'Weekly follow e-mail not opt-in'; end if;
 if (select count(*) from laria_private.marketplace_email_deliveries where event_type = 'follow_weekly' and recipient_user_id = 'a2040000-0000-4000-8000-000000000002') <> 1 then raise exception 'Weekly e-mail recipient wrong'; end if;
 perform laria_private.prepare_weekly_follow_emails(monday, 100);
 if (select count(*) from laria_private.marketplace_email_deliveries where event_type = 'follow_weekly') <> 1 then raise exception 'Weekly e-mail repeated'; end if;
end $$;

-- save-05 / save-10: an alert with two cities, renamed and switched to daily, matches either city and leaves an
-- in-app notice; its list shows the total and the new count.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2040000-0000-4000-8000-000000000002","role":"authenticated"}',true);
create temporary table alert_ref(id uuid) on commit drop;
grant select on alert_ref to service_role;
insert into alert_ref select (public.create_saved_search_alert('{"category":"guitars","location":["Lima","Cusco"]}'::jsonb, 'immediate')).id;
do $$ declare saved public.saved_search_alerts; begin
 select * into saved from public.saved_search_alerts where id = (select id from alert_ref);
 if saved.search_filters->'location' <> '["Cusco", "Lima"]'::jsonb then raise exception 'Location list not normalized: %', saved.search_filters; end if;
 saved := public.update_saved_search_alert((select id from alert_ref), '  Guitarras en Lima  ', 'daily');
 if saved.name <> 'Guitarras en Lima' or saved.frequency <> 'daily' then raise exception 'Alert update failed'; end if;
 begin perform public.create_saved_search_alert('{"category":"guitars","location":["Lima","Cusco","Lima"]}'::jsonb, 'daily'); raise exception 'Same list saved twice';
 exception when others then if sqlerrm not like '%ALERT_ALREADY_EXISTS%' then raise; end if; end;
 if (public.create_saved_search_alert('{"category":"guitars","location":"Lima"}'::jsonb, 'daily')).search_filters->>'location' <> 'Lima' then raise exception 'Single location changed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"a2040000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 begin perform public.update_saved_search_alert((select id from alert_ref), 'Mía', 'daily'); raise exception 'Foreign alert updated';
 exception when others then if sqlerrm not like '%ALERT_NOT_OWNED%' then raise; end if; end;
end $$;
reset role;
update public.saved_search_alerts set active_since = now() - interval '1 day' where id = (select id from alert_ref);
insert into public.listings(id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,created_by_source)
values
 ('a2040000-0000-4000-8000-000000000104','ux-cusco','Gibson Les Paul','individual','approved','guitars','electric_guitar','Gibson','LP','Usado - buen estado',5000,'Cusco','Cusco','Vende','51999999101','Descripción de prueba suficientemente extensa para publicar este instrumento.','a2040000-0000-4000-8000-000000000001','admin'),
 ('a2040000-0000-4000-8000-000000000105','ux-piura','Ibanez RG','individual','approved','guitars','electric_guitar','Ibanez','RG','Usado - buen estado',1500,'Piura','Piura','Vende','51999999101','Descripción de prueba suficientemente extensa para publicar este instrumento.','a2040000-0000-4000-8000-000000000001','admin');
do $$ begin
 if (select count(*) from laria_private.search_alert_matches where alert_id = (select id from alert_ref)) <> 1 then raise exception 'Multi-city match wrong'; end if;
 if (select message from public.notifications where event_type = 'listing_alert_match' and user_id = 'a2040000-0000-4000-8000-000000000002') <> 'Nueva coincidencia para «Guitarras en Lima»: «Gibson Les Paul».' then raise exception 'Alert match notice missing'; end if;
 if exists (select 1 from laria_private.marketplace_email_deliveries where event_type = 'search_alert_immediate' and search_alert_id = (select id from alert_ref)) then raise exception 'Daily alert sent an immediate e-mail'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2040000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare alerts jsonb; item jsonb; begin
 alerts := public.get_account_search_alerts(now() - interval '1 hour');
 select a into item from jsonb_array_elements(alerts) a where (a->>'id')::uuid = (select id from alert_ref);
 if (item->>'match_count')::int <> 1 or (item->>'new_count')::int <> 1 or item->>'last_match_at' is null or item->>'name' <> 'Guitarras en Lima' then raise exception 'Alert stats wrong: %', item; end if;
 if (select (a->>'new_count')::int from jsonb_array_elements(public.get_account_search_alerts(now() + interval '1 hour')) a where (a->>'id')::uuid = (select id from alert_ref)) <> 0 then raise exception 'New count ignores the visit'; end if;
end $$;

-- save-10: mark all as read touches only the account's own notices.
do $$ begin
 if public.mark_all_notifications_read() < 2 then raise exception 'Mark all read missed notices'; end if;
 if exists (select 1 from public.notifications where read_at is null) then raise exception 'Unread left'; end if;
end $$;
reset role;
do $$ begin if not exists (select 1 from public.notifications where read_at is null and user_id <> 'a2040000-0000-4000-8000-000000000002') and exists (select 1 from public.notifications where user_id <> 'a2040000-0000-4000-8000-000000000002') then raise exception 'Foreign notices marked read'; end if; end $$;

-- save-07: the one-click link actions (service role only).
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.apply_email_link_action('a2040000-0000-4000-8000-000000000002', 'pause_alert', (select id from alert_ref));
select public.apply_email_link_action('a2040000-0000-4000-8000-000000000002', 'no_follow_digest');
reset role;
do $$ begin
 if (select status from public.saved_search_alerts where id = (select id from alert_ref)) <> 'paused' then raise exception 'Pause link failed'; end if;
 if (select follow_digest_emails from public.email_preferences where user_id = 'a2040000-0000-4000-8000-000000000002') then raise exception 'Follow digest link failed'; end if;
end $$;

-- save-04: counts of new public listings by category since a visit.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 if (public.get_new_listing_counts(now() - interval '1 day', array['guitars'])->>'guitars')::int < 2 then raise exception 'New counts missing'; end if;
 if public.get_new_listing_counts(now() - interval '200 days') <> '{}'::jsonb then raise exception 'Old visits counted'; end if;
end $$;
reset role;
rollback;
