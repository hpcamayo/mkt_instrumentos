-- Actual Auth claims and RLS; every fixture rolls back.
begin;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('81000000-0000-4000-8000-000000000001','authenticated','authenticated','s5-owner@example.invalid','{}','{"account_type":"seller","full_name":"Owner","phone":"51999999001","city":"Lima","region":"Lima"}'),
 ('81000000-0000-4000-8000-000000000002','authenticated','authenticated','s5-buyer@example.invalid','{}','{"account_type":"seller","full_name":"Buyer","phone":"51999999002","city":"Lima","region":"Lima"}'),
 ('81000000-0000-4000-8000-000000000003','authenticated','authenticated','s5-store-buyer@example.invalid','{}','{"account_type":"store_owner","full_name":"Store buyer","phone":"51999999003","city":"Lima","region":"Lima"}');
insert into public.listings(id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,created_by_source)
values('82000000-0000-4000-8000-000000000001','s5-live','Sprint 5 pública','individual','approved','guitars','electric_guitar','Yamaha','QA','Usado - buen estado',1200,'Lima','Lima','Owner','51999999001','Descripción de prueba suficientemente extensa para publicar este instrumento.','81000000-0000-4000-8000-000000000001','admin');
insert into public.listing_photos(listing_id,image_url,sort_order) values
 ('82000000-0000-4000-8000-000000000001','https://example.invalid/s5-0.jpg',0),
 ('82000000-0000-4000-8000-000000000001','https://example.invalid/s5-1.jpg',1);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.set_listing_favorite('82000000-0000-4000-8000-000000000001',true);
select public.set_listing_favorite('82000000-0000-4000-8000-000000000001',true);
do $$ begin
 if (select count(*) from public.favorites)<>1 then raise exception 'Duplicate favorite'; end if;
 if (public.get_account_favorites()->'items'->0->>'availability')<>'approved' then raise exception 'Missing public favorite'; end if;
 if public.get_favorite_destination('82000000-0000-4000-8000-000000000001')<>'/instrumentos/s5-live' then raise exception 'Wrong destination'; end if;
 begin insert into public.favorites(user_id,listing_id) values('81000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000001'); raise exception 'Direct favorite write allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin if exists(select 1 from public.favorites) then raise exception 'Foreign favorite relation leaked'; end if; end $$;
select public.set_listing_favorite('82000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 begin perform public.set_listing_favorite('82000000-0000-4000-8000-000000000001',true); raise exception 'Self favorite allowed'; exception when others then if sqlerrm not like '%FAVORITE_SELF_NOT_ALLOWED%' then raise; end if; end;
 if exists(select 1 from public.favorites) then raise exception 'Seller sees buyer directory'; end if;
end $$;
reset role;
select set_config('app.allow_listing_admin_fields','true',true);
update public.listings set price_pen=1100 where slug='s5-live';
update public.listings set price_pen=1100 where slug='s5-live';
update public.listings set price_pen=1150 where slug='s5-live';
do $$ begin
 if (select count(*) from public.notifications where listing_id='82000000-0000-4000-8000-000000000001' and event_type='listing_price_drop')<>2 then raise exception 'Fan-out/retry/increase mismatch'; end if;
 if (select count(*) from public.listing_price_drops where listing_id='82000000-0000-4000-8000-000000000001')<>1 then raise exception 'Logical drop repeated'; end if;
 if (select count(*) from public.marketplace_events where listing_id='82000000-0000-4000-8000-000000000001' and event_type='favorite_added')<>2 then raise exception 'Idempotent favorite emitted duplicate action'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare nid uuid; begin
 select id into nid from public.notifications where listing_id='82000000-0000-4000-8000-000000000001' and event_type='listing_price_drop';
 if (select count(*) from public.notifications where listing_id='82000000-0000-4000-8000-000000000001' and event_type='listing_price_drop')<>1 then raise exception 'Notification privacy broken'; end if;
 perform public.mark_notification_read(nid); perform public.mark_notification_read(nid);
 if (select read_at from public.notifications where id=nid) is null then raise exception 'Read state missing'; end if;
end $$;
select public.set_listing_favorite('82000000-0000-4000-8000-000000000001',false);
select public.set_listing_favorite('82000000-0000-4000-8000-000000000001',false);
reset role;
update public.listings set price_pen=1000 where slug='s5-live';
do $$ begin if (select count(*) from public.notifications where listing_id='82000000-0000-4000-8000-000000000001' and event_type='listing_price_drop')<>3 then raise exception 'Unfavorite ignored'; end if; end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.set_listing_favorite('82000000-0000-4000-8000-000000000001',true);
reset role;
update public.listings set price_pen=900 where slug='s5-live';
do $$ begin if (select count(*) from public.notifications where listing_id='82000000-0000-4000-8000-000000000001' and event_type='listing_price_drop')<>5 then raise exception 'Future drop/refavorite missing'; end if; end $$;
-- Proposed text/photo changes do not touch the live price. Private-state drops
-- and inactive parent inventory must not emit notifications.
update public.listings set status='hidden',hidden_source='owner',hidden_at=now() where slug='s5-live';
update public.listings set price_pen=800 where slug='s5-live';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare history jsonb; begin
 history:=public.get_account_favorites();
 if history->'items'->0->>'availability'<>'unavailable' or history->'items'->0->>'title' is not null or history->'items'->0->>'slug' is not null then raise exception 'Private favorite data leaked'; end if;
 if public.get_favorite_destination('82000000-0000-4000-8000-000000000001') is not null then raise exception 'Hidden target leaked'; end if;
 begin perform public.set_listing_favorite('82000000-0000-4000-8000-000000000001',true); raise exception 'Hidden favorite allowed'; exception when others then if sqlerrm not like '%FAVORITE_UNAVAILABLE%' then raise; end if; end;
end $$;
reset role;
update public.listings set status='pending',price_pen=700 where slug='s5-live';
update public.listings set status='rejected',price_pen=600 where slug='s5-live';
update public.listings set status='archived',price_pen=500 where slug='s5-live';
update public.listings set status='sold',sold_at=now() where slug='s5-live';
set local role authenticated;
do $$ begin if public.get_account_favorites()->'items'->0->>'availability'<>'sold' then raise exception 'Sold history lost'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare report jsonb; begin
 report:=public.get_account_analytics(30);
 if (report#>>'{summary,favorites}')::int<>2 or (report#>>'{summary,favorite_additions}')::int<>3 or (report#>>'{summary,favorite_removals}')::int<>1 then raise exception 'Relations/actions conflated'; end if;
 if report#>>'{summary,favorite_rate}' is not null then raise exception 'Zero denominator invented'; end if;
 if report::text like '%81000000-0000-4000-8000-000000000002%' then raise exception 'Buyer identities exposed'; end if;
end $$;
reset role;
do $$ begin if (select count(*) from public.notifications where listing_id='82000000-0000-4000-8000-000000000001' and event_type='listing_price_drop')<>5 then raise exception 'Nonpublic decrease notified'; end if; end $$;
-- Public store eligibility and real seller/store aggregates, not buyer directories.
insert into public.stores(id,slug,name,razon_social,ruc,email,contact_person,whatsapp_phone,city,region,address,owner_user_id,status)
values('83000000-0000-4000-8000-000000000001','s5-store','Tienda S5','Tienda S5 SAC','20333333331','s5@example.invalid','Contacto','51999999003','Lima','Lima','Av QA 123','81000000-0000-4000-8000-000000000003','active');
insert into public.listings(id,slug,title,seller_type,status,category,price_pen,city,region,whatsapp_phone,owner_user_id,store_id)
values('82000000-0000-4000-8000-000000000002','s5-store-live','S5 Tienda pública','store','approved','guitars',1000,'Lima','Lima','51999999003','81000000-0000-4000-8000-000000000003','83000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.set_listing_favorite('82000000-0000-4000-8000-000000000002',true);
reset role;
update public.listings set price_pen=900 where slug='s5-store-live';
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.record_marketplace_event('listing_view',gen_random_uuid(),gen_random_uuid(),'81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002',null,'detail');
do $$ begin
 begin perform public.record_marketplace_event('favorite_added',gen_random_uuid(),gen_random_uuid(),'81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002'); raise exception 'Forged favorite telemetry'; exception when others then if sqlerrm not like '%Client cannot emit lifecycle%' then raise; end if; end;
end $$;
reset role;
select set_config('app.allow_store_admin_fields','true',true);
update public.stores set status='hidden' where slug='s5-store';
update public.listings set price_pen=800 where slug='s5-store-live';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare history jsonb; begin
 history:=public.get_account_favorites();
 if (select count(*) from jsonb_array_elements(history->'items') item where item->>'availability'='unavailable' and item->>'title' is null)<>1 then raise exception 'Hidden parent favorite leaked inventory'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare report jsonb; begin
 report:=public.get_account_analytics(7);
 if (report#>>'{summary,favorites}')::int<>1 or (report#>>'{summary,favorite_additions}')::int<>1 then raise exception 'Store favorite aggregation missing'; end if;
 if (report#>>'{summary,favorite_rate}')::numeric<>1 then raise exception 'Favorite rate denominator mismatch'; end if;
 if report::text like '%81000000-0000-4000-8000-000000000002%' then raise exception 'Store buyer directory exposed'; end if;
end $$;
reset role;
update public.marketplace_events set created_at=now()-interval '8 days' where event_type='favorite_added' and listing_id='82000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ declare report jsonb; begin
 report:=public.get_account_analytics(7);
 if (report#>>'{summary,favorites}')::int<>1 or (report#>>'{summary,favorite_additions}')::int<>0 or (report#>>'{summary,favorite_rate}')::numeric<>0 then raise exception 'Current relation conflated with windowed events'; end if;
end $$;
reset role;
do $$ begin if (select count(*) from public.notifications where listing_id='82000000-0000-4000-8000-000000000002' and event_type='listing_price_drop')<>1 then raise exception 'Hidden parent notified'; end if; end $$;
set local role anon;
do $$ begin
 if has_function_privilege('anon','public.set_listing_favorite(uuid,boolean)','execute') then raise exception 'Anonymous favorite access'; end if;
 if has_table_privilege('anon','public.favorites','select') then raise exception 'Anonymous relation access'; end if;
end $$;
rollback;
