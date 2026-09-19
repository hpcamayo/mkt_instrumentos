-- Sprint 4 rollback-only analytics integrity, privacy, dedupe and aggregates.
-- Run only against local/test Supabase after every forward migration.
begin;

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values
 ('71000000-0000-4000-8000-000000000001','authenticated','authenticated','s4-analytics-owner@example.invalid','{}','{"account_type":"seller","full_name":"Analytics Owner","phone":"51999999501","city":"Lima","region":"Lima"}'),
 ('71000000-0000-4000-8000-000000000002','authenticated','authenticated','s4-analytics-other@example.invalid','{}','{"account_type":"seller","full_name":"Analytics Other","phone":"51999999502","city":"Lima","region":"Lima"}'),
 ('71000000-0000-4000-8000-000000000003','authenticated','authenticated','s4-analytics-store@example.invalid','{}','{"account_type":"store_owner","full_name":"Analytics Store","phone":"51999999503","city":"Lima","region":"Lima"}'),
 ('71000000-0000-4000-8000-000000000004','authenticated','authenticated','s4-analytics-admin@example.invalid','{"role":"admin"}','{"account_type":"seller","full_name":"Analytics Admin","phone":"51999999504","city":"Lima","region":"Lima"}'),
 ('71000000-0000-4000-8000-000000000005','authenticated','authenticated','s4-analytics-buyer@example.invalid','{}','{"account_type":"seller","full_name":"Analytics Buyer","phone":"51999999505","city":"Lima","region":"Lima"}'),
 ('71000000-0000-4000-8000-000000000006','authenticated','authenticated','s4-analytics-pending-store@example.invalid','{}','{"account_type":"store_owner","full_name":"Analytics Pending Store","phone":"51999999506","city":"Lima","region":"Lima"}'),
 ('71000000-0000-4000-8000-000000000007','authenticated','authenticated','s4-analytics-new-store@example.invalid','{}','{"account_type":"store_owner","full_name":"Analytics New Store","phone":"51999999507","city":"Lima","region":"Lima"}');

insert into public.stores(id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,is_verified,listing_plan)
values
 ('72000000-0000-4000-8000-000000000001','s4-analytics-active','Analytics Tienda','Analytics Tienda SAC','20777777771','s4-store@example.invalid','Contacto','Contacto','51999999503','Lima','Lima','Av. QA Analytics 4','71000000-0000-4000-8000-000000000003','active',false,'free'),
 ('72000000-0000-4000-8000-000000000002','s4-analytics-pending','Analytics Pendiente','Analytics Pendiente SAC','20777777772','s4-pending@example.invalid','Contacto','Contacto','51999999506','Lima','Lima','Av. QA Analytics 5','71000000-0000-4000-8000-000000000006','pending',false,'free');

insert into public.listings(id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at,published_at,view_count,sold_at)
values
 ('73000000-0000-4000-8000-000000000001','s4-analytics-live','Analytics vivo','individual','approved','guitars','electric_guitar','Yamaha','QA','Usado - buen estado',1200,'Lima','Lima','Analytics Owner','51999999501','Descripción temporal suficientemente larga para probar las métricas reales.','71000000-0000-4000-8000-000000000001',null,'self_service',now(),now(),7,null),
 ('73000000-0000-4000-8000-000000000002','s4-analytics-private','Analytics pendiente','individual','pending','guitars','electric_guitar','Yamaha','QA','Usado - buen estado',1200,'Lima','Lima','Analytics Owner','51999999501','Descripción temporal suficientemente larga para probar las métricas reales.','71000000-0000-4000-8000-000000000001',null,'self_service',now(),null,0,null),
 ('73000000-0000-4000-8000-000000000003','s4-analytics-sold','Analytics vendido','individual','sold','guitars','electric_guitar','Yamaha','QA','Usado - buen estado',1200,'Lima','Lima','Analytics Owner','51999999501','Descripción temporal suficientemente larga para probar las métricas reales.','71000000-0000-4000-8000-000000000001',null,'self_service',now(),now(),0,now()),
 ('73000000-0000-4000-8000-000000000004','s4-analytics-store-live','Analytics tienda vivo','store','approved','guitars','electric_guitar','Yamaha','QA','Nuevo',1200,'Lima','Lima','Contacto','51999999503','Descripción temporal suficientemente larga para probar las métricas reales.','71000000-0000-4000-8000-000000000003','72000000-0000-4000-8000-000000000001','self_service',now(),now(),4,null),
 ('73000000-0000-4000-8000-000000000005','s4-analytics-store-private','Analytics tienda no pública','store','approved','guitars','electric_guitar','Yamaha','QA','Nuevo',1200,'Lima','Lima','Contacto','51999999506','Descripción temporal suficientemente larga para probar las métricas reales.','71000000-0000-4000-8000-000000000006','72000000-0000-4000-8000-000000000002','self_service',now(),now(),0,null);

insert into public.listing_photos(listing_id,image_url,sort_order)
select id,'https://example.invalid/s4-analytics-'||id||'-'||n||'.jpg',n
from public.listings cross join generate_series(0,1) n
where id::text like '73000000-%';

-- The event log is not a client-accessible write/read surface.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare denied boolean := false; begin
 if not has_function_privilege('authenticated','public.record_marketplace_event(text,uuid,uuid,uuid,uuid,uuid,text,jsonb,uuid)','EXECUTE') then raise exception 'Guarded event RPC is unavailable for a safe explicit denial'; end if;
 begin perform public.record_marketplace_event('listing_view',gen_random_uuid(),gen_random_uuid()); exception when insufficient_privilege then denied := true; end;
 if not denied then raise exception 'Ordinary user bypassed the trusted event recorder guard'; end if;
 denied := false;
 if not has_function_privilege('anon','public.increment_listing_view_count(uuid)','EXECUTE') then raise exception 'Legacy counter denial tombstone is unavailable'; end if;
 begin perform public.increment_listing_view_count('73000000-0000-4000-8000-000000000001'); exception when insufficient_privilege then denied := true; end;
 if not denied then raise exception 'Legacy public increment bypass still exposed'; end if;
 denied := false;
 begin perform 1 from public.marketplace_events; exception when insufficient_privilege then denied := true; end;
 if not denied then
  if exists(select 1 from public.marketplace_events) then raise exception 'Global raw events exposed'; end if;
 end if;
 denied := false;
 begin insert into public.marketplace_events(event_type) values('listing_approved'); exception when others then denied := true; end;
 if not denied then raise exception 'Client forged lifecycle event'; end if;
 denied := false;
 begin perform public.get_account_analytics(0,'71000000-0000-4000-8000-000000000003'); exception when others then denied := true; end;
 if not denied then raise exception 'Particular can read foreign store analytics'; end if;
 denied := false;
 begin perform public.get_marketplace_admin_analytics(0); exception when others then denied := true; end;
 if not denied then raise exception 'Nonadmin global aggregate access'; end if;
end $$;

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ declare result jsonb; replay jsonb; begin
 result := public.record_marketplace_event('listing_view','74000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000005','73000000-0000-4000-8000-000000000001',null,'detail');
 if (result->>'recorded')::boolean is not true or (result->>'view_count')::integer <> 8 then raise exception 'Accepted view did not increment preserved legacy cache'; end if;
 replay := public.record_marketplace_event('listing_view','74000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000005','73000000-0000-4000-8000-000000000001',null,'detail');
 if (replay->>'recorded')::boolean is not false or (replay->>'view_count')::integer <> 8 then raise exception 'Same-event retry changed cache'; end if;
 result := public.record_marketplace_event('listing_view','74000000-0000-4000-8000-000000000002',gen_random_uuid(),'71000000-0000-4000-8000-000000000005','73000000-0000-4000-8000-000000000001',null,'detail');
 if (result->>'recorded')::boolean is not false then raise exception 'Authenticated refresh/new session inflated view'; end if;
 result := public.record_marketplace_event('listing_view','74000000-0000-4000-8000-000000000001',gen_random_uuid(),null,'73000000-0000-4000-8000-000000000001',null,'detail');
 if (result->>'recorded')::boolean is not true then raise exception 'Anonymous session did not record independent view'; end if;
 result := public.record_marketplace_event('listing_view','74000000-0000-4000-8000-000000000001',gen_random_uuid(),null,'73000000-0000-4000-8000-000000000001',null,'detail');
 if (result->>'recorded')::boolean is not false then raise exception 'Anonymous refresh inflated view'; end if;
 result := public.record_marketplace_event('listing_view','74000000-0000-4000-8000-000000000002',gen_random_uuid(),null,'73000000-0000-4000-8000-000000000001',null,'detail');
 if (result->>'recorded')::boolean is not true then raise exception 'Separate anonymous session was conflated'; end if;
 result := public.record_marketplace_event('listing_impression','74000000-0000-4000-8000-000000000001',gen_random_uuid(),'71000000-0000-4000-8000-000000000005','73000000-0000-4000-8000-000000000001',null,'catalog');
 if (result->>'recorded')::boolean is not true then raise exception 'Different event types incorrectly share dedupe'; end if;
 perform public.record_marketplace_event('listing_impression','74000000-0000-4000-8000-000000000001',gen_random_uuid(),null,'73000000-0000-4000-8000-000000000001',null,'catalog');
 perform public.record_marketplace_event('whatsapp_contact','74000000-0000-4000-8000-000000000001',gen_random_uuid(),'71000000-0000-4000-8000-000000000005','73000000-0000-4000-8000-000000000001',null,'detail');
 perform public.record_marketplace_event('whatsapp_contact','74000000-0000-4000-8000-000000000001',gen_random_uuid(),'71000000-0000-4000-8000-000000000005','73000000-0000-4000-8000-000000000001',null,'seller_panel');
 perform public.record_marketplace_event('whatsapp_contact','74000000-0000-4000-8000-000000000001',gen_random_uuid(),null,'73000000-0000-4000-8000-000000000001',null,'detail');
end $$;

-- Self/admin inspections and nonpublic inventory are never commercial opens.
do $$ declare actor uuid; target uuid; result jsonb; kind text; begin
 foreach actor in array array['71000000-0000-4000-8000-000000000001'::uuid,'71000000-0000-4000-8000-000000000004'::uuid] loop
  foreach kind in array array['listing_view','listing_impression'] loop
   result := public.record_marketplace_event(kind,'74000000-0000-4000-8000-000000000001',gen_random_uuid(),actor,'73000000-0000-4000-8000-000000000001',null,'detail');
   if (result->>'recorded')::boolean is true then raise exception 'Owner/admin inspection inflated %',kind; end if;
  end loop;
 end loop;
 foreach target in array array['73000000-0000-4000-8000-000000000002'::uuid,'73000000-0000-4000-8000-000000000003'::uuid,'73000000-0000-4000-8000-000000000005'::uuid] loop
  foreach kind in array array['listing_view','listing_impression','whatsapp_contact'] loop
   result := public.record_marketplace_event(kind,'74000000-0000-4000-8000-000000000001',gen_random_uuid(),null,target,null,'detail');
   if (result->>'recorded')::boolean is true then raise exception 'Nonpublic listing event accepted: % %',target,kind; end if;
  end loop;
 end loop;
 result := public.record_marketplace_event('store_view','74000000-0000-4000-8000-000000000001',gen_random_uuid(),null,null,'72000000-0000-4000-8000-000000000002','store');
 if (result->>'recorded')::boolean is true then raise exception 'Pending store recorded public view'; end if;
end $$;

-- Trusted relationship derivation must override/deny a mismatching store claim.
do $$ declare result jsonb; denied boolean := false; begin
 begin result := public.record_marketplace_event('whatsapp_contact','74000000-0000-4000-8000-000000000003',gen_random_uuid(),'71000000-0000-4000-8000-000000000005','73000000-0000-4000-8000-000000000004','72000000-0000-4000-8000-000000000002','detail');
 exception when others then denied := true; end;
 if not denied and exists(select 1 from public.marketplace_events where listing_id='73000000-0000-4000-8000-000000000004' and store_id is distinct from '72000000-0000-4000-8000-000000000001') then raise exception 'Store attribution forged'; end if;
 perform public.record_marketplace_event('listing_view','74000000-0000-4000-8000-000000000003',gen_random_uuid(),null,'73000000-0000-4000-8000-000000000004',null,'detail');
 perform public.record_marketplace_event('listing_impression','74000000-0000-4000-8000-000000000003',gen_random_uuid(),null,'73000000-0000-4000-8000-000000000004',null,'store');
 perform public.record_marketplace_event('store_view','74000000-0000-4000-8000-000000000003',gen_random_uuid(),null,null,'72000000-0000-4000-8000-000000000001','store');
 perform public.record_marketplace_event('store_view','74000000-0000-4000-8000-000000000003',gen_random_uuid(),null,null,'72000000-0000-4000-8000-000000000001','store');
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare lifetime jsonb; recent jsonb; item jsonb; begin
 lifetime := public.get_account_analytics(0);
 recent := public.get_account_analytics(7);
 if (lifetime#>>'{summary,views}')::integer <> 10 then raise exception 'Lifetime views lost legacy baseline or inflated retries: %',lifetime; end if;
 if (lifetime#>>'{summary,recorded_views}')::integer <> 3 or (recent#>>'{summary,views}')::integer <> 3 then raise exception 'Event-only recent views wrong'; end if;
 if (lifetime#>>'{summary,impressions}')::integer <> 2 or (lifetime#>>'{summary,contacts}')::integer <> 3 then raise exception 'Impression/contact aggregate incorrect'; end if;
 if (lifetime#>>'{summary,active}')::integer <> 1 or (lifetime#>>'{summary,sold}')::integer <> 1 then raise exception 'All-state lifecycle aggregate incorrect'; end if;
 if nullif(lifetime->>'tracking_started_at','') is null then raise exception 'Analytics time context absent'; end if;
 select value into item from jsonb_array_elements(lifetime->'listings') where value->>'id'='73000000-0000-4000-8000-000000000001';
 if (item->>'views')::integer <> 10 or (item->>'contacts')::integer <> 3 or item->>'status' <> 'approved' or nullif(item->>'published_at','') is null then raise exception 'Per-listing aggregates/metadata mismatch'; end if;
 if lifetime::text like '%71000000-0000-4000-8000-000000000005%' then raise exception 'Buyer identity directory leaked into analytics'; end if;
 if lifetime::text like '%revenue%' or lifetime::text like '%gmv%' then raise exception 'Future/commercial metrics fabricated'; end if;
 if (lifetime#>>'{summary,ctr}')::numeric <> 1.5 or (lifetime#>>'{summary,contact_rate}')::numeric <> 1 then raise exception 'Ratios must use recorded views, not incomparable historical cache'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare report jsonb; begin
 report := public.get_account_analytics(0);
 if (report#>>'{summary,views}')::integer <> 0 or (report#>>'{summary,contacts}')::integer <> 0 then raise exception 'Foreign owner aggregate leak'; end if;
 if coalesce((report#>>'{summary,ctr}')::numeric,0) <> 0 or coalesce((report#>>'{summary,contact_rate}')::numeric,0) <> 0 then raise exception 'Empty ratios unsafe'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare report jsonb; begin
 report := public.get_account_analytics(0);
 if (report#>>'{summary,views}')::integer <> 5 or (report#>>'{summary,recorded_views}')::integer <> 1 or (report#>>'{summary,store_views}')::integer <> 1 then raise exception 'Store analytics did not reconcile lifetime/event/page views'; end if;
 if (report#>>'{summary,active}')::integer <> 1 then raise exception 'Approved inventory under active store not counted as active'; end if;
end $$;

-- Approved inventory is active only while its parent is public. Historical
-- metrics remain available to its owner when a store is hidden.
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
do $$ declare report jsonb; begin
 report := public.get_account_analytics(0);
 if (report#>>'{summary,active}')::integer <> 0 then raise exception 'Pending parent store inventory counted as public active inventory'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000004","role":"authenticated","app_metadata":{"role":"admin"}}',true);
select public.review_store_application('72000000-0000-4000-8000-000000000001','hide','QA hidden parent visibility');
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare report jsonb; begin
 report := public.get_account_analytics(0);
 if (report#>>'{summary,active}')::integer <> 0 then raise exception 'Hidden parent store inventory counted as public active inventory'; end if;
 if (report#>>'{summary,views}')::integer <> 5 or (report#>>'{summary,recorded_views}')::integer <> 1 then raise exception 'Parent visibility removed owner historical metrics'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000004","role":"authenticated","app_metadata":{"role":"admin"}}',true);
select public.review_store_application('72000000-0000-4000-8000-000000000001','approve');

-- A rolling window, not a clock-bucket boundary, determines new opens.
reset role;
update public.marketplace_events set created_at=now()-interval '31 minutes'
where id='75000000-0000-4000-8000-000000000001';
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ declare result jsonb; begin
 result := public.record_marketplace_event('listing_view','74000000-0000-4000-8000-000000000001',gen_random_uuid(),'71000000-0000-4000-8000-000000000005','73000000-0000-4000-8000-000000000001',null,'detail');
 if (result->>'recorded')::boolean is not true or (result->>'view_count')::integer <> 11 then raise exception 'Rolling dedupe did not release after 30 minutes'; end if;
 result := public.record_marketplace_event('listing_view','74000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000005','73000000-0000-4000-8000-000000000001',null,'detail');
 if (result->>'recorded')::boolean is true then raise exception 'Historic same-event replay accepted'; end if;
end $$;

reset role;
do $$ begin
 if exists(select 1 from public.marketplace_events where listing_id='73000000-0000-4000-8000-000000000001' and seller_user_id is distinct from '71000000-0000-4000-8000-000000000001') then raise exception 'Particular seller attribution corrupted'; end if;
 if exists(select 1 from public.marketplace_events where listing_id='73000000-0000-4000-8000-000000000004' and (seller_user_id is distinct from '71000000-0000-4000-8000-000000000003' or store_id is distinct from '72000000-0000-4000-8000-000000000001')) then raise exception 'Store seller attribution corrupted'; end if;
 if exists(select 1 from public.marketplace_events where listing_id::text like '73000000-%' and (metadata ?| array['message','draft','password','token','ip','user_agent'])) then raise exception 'Sensitive product-event metadata persisted'; end if;
end $$;

-- Searches have sanitized existing filter state, server-derived zero flag,
-- event-ID retry protection, and filter events are not new searches.
create temporary table s4_admin_baseline(report jsonb);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000004","role":"authenticated","app_metadata":{"role":"admin"}}',true);
reset role;
insert into s4_admin_baseline values(public.get_marketplace_admin_analytics(0));
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ declare result jsonb; denied boolean := false; begin
 result := public.record_marketplace_event('listing_creation_started','74000000-0000-4000-8000-000000000009',gen_random_uuid(),'71000000-0000-4000-8000-000000000001',null,null,'submission','{}','75000000-0000-4000-8000-000000000011');
 if (result->>'recorded')::boolean is not true then raise exception 'Listing start missing'; end if;
 result := public.record_marketplace_event('listing_creation_started','74000000-0000-4000-8000-000000000009',gen_random_uuid(),'71000000-0000-4000-8000-000000000001',null,null,'submission','{}','75000000-0000-4000-8000-000000000011');
 if (result->>'recorded')::boolean is true then raise exception 'Listing start retry duplicated funnel'; end if;
 result := public.record_marketplace_event('store_application_started','74000000-0000-4000-8000-000000000009',gen_random_uuid(),'71000000-0000-4000-8000-000000000007',null,null,'submission','{}','75000000-0000-4000-8000-000000000012');
 if (result->>'recorded')::boolean is not true then raise exception 'Store application start missing'; end if;
 result := public.record_marketplace_event('store_application_started','74000000-0000-4000-8000-000000000009',gen_random_uuid(),'71000000-0000-4000-8000-000000000007',null,null,'submission','{}','75000000-0000-4000-8000-000000000012');
 if (result->>'recorded')::boolean is true then raise exception 'Store application start retry duplicated funnel'; end if;
 begin perform public.record_marketplace_event('store_application_started','74000000-0000-4000-8000-000000000009',gen_random_uuid(),'71000000-0000-4000-8000-000000000001',null,null,'submission','{}',gen_random_uuid());
 exception when others then denied := true; end;
 if not denied then raise exception 'Particular silently entered store funnel'; end if;
 denied := false;
 result := public.record_marketplace_event('search','74000000-0000-4000-8000-000000000009','75000000-0000-4000-8000-000000000009',null,null,null,'catalog','{"query":"Yamaha","filters":{"brand":"Yamaha","sort":"newest"},"result_count":2,"zero_results":true}');
 if (result->>'recorded')::boolean is not true then raise exception 'Search not recorded'; end if;
 result := public.record_marketplace_event('search','74000000-0000-4000-8000-000000000009','75000000-0000-4000-8000-000000000009',null,null,null,'catalog','{"query":"Yamaha","filters":{"brand":"Yamaha","sort":"newest"},"result_count":2,"zero_results":true}');
 if (result->>'recorded')::boolean is true then raise exception 'Search retry duplicated'; end if;
 perform public.record_marketplace_event('search','74000000-0000-4000-8000-000000000009','75000000-0000-4000-8000-000000000010',null,null,null,'catalog','{"query":"No existe","filters":{"brand":"No existe"},"result_count":0,"zero_results":false}');
 perform public.record_marketplace_event('filter_applied','74000000-0000-4000-8000-000000000009',gen_random_uuid(),null,null,null,'catalog','{"query":"No existe","filters":{"brand":"No existe"},"result_count":0}');
 begin perform public.record_marketplace_event('search','74000000-0000-4000-8000-000000000009',gen_random_uuid(),null,null,null,'catalog','{"query":"","filters":{},"result_count":0,"password":"must never persist"}');
 exception when others then denied := true; end;
 if not denied then raise exception 'Uncontrolled search metadata accepted'; end if;
 denied := false;
 begin perform public.record_marketplace_event('listing_approved','74000000-0000-4000-8000-000000000009',gen_random_uuid(),'71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001');
 exception when others then denied := true; end;
 if not denied then raise exception 'Telemetry recorder accepted forged lifecycle state'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000004","role":"authenticated","app_metadata":{"role":"admin"}}',true);
do $$ declare before_report jsonb; report jsonb; begin
 select * into before_report from s4_admin_baseline;
 report := public.get_marketplace_admin_analytics(0);
 if (report->>'searches')::integer <> (before_report->>'searches')::integer+2 or (report->>'zero_results')::integer <> (before_report->>'zero_results')::integer+1 then raise exception 'Search/zero result counts wrong'; end if;
 if (report->>'zero_result_rate')::numeric <> (report->>'zero_results')::numeric/(report->>'searches')::numeric then raise exception 'Zero result rate incorrect'; end if;
 if (select metadata->>'zero_results' from public.marketplace_events where id='75000000-0000-4000-8000-000000000009') <> 'false' then raise exception 'Zero flag trusted caller rather than count'; end if;
 if (select metadata->>'zero_results' from public.marketplace_events where id='75000000-0000-4000-8000-000000000010') <> 'true' then raise exception 'Zero flag missing for real empty search'; end if;
end $$;

-- Existing trusted moderation paths produce authoritative lifecycle events.
set local role authenticated;
do $$ begin
 perform public.review_listing('73000000-0000-4000-8000-000000000002','reject','QA rechazo temporal');
end $$;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.submit_listing_for_publication('73000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000004","role":"authenticated","app_metadata":{"role":"admin"}}',true);
select public.review_listing('73000000-0000-4000-8000-000000000002','approve',null);
select public.review_store_application('72000000-0000-4000-8000-000000000002','approve',null);
select public.set_store_verification('72000000-0000-4000-8000-000000000002',true);
select public.set_store_verification('72000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.set_owned_listing_lifecycle('73000000-0000-4000-8000-000000000002','sold');
reset role;
do $$ declare kind text; begin
 foreach kind in array array['listing_submitted','listing_rejected','listing_approved','listing_sold'] loop
  if (select count(*) from public.marketplace_events where listing_id='73000000-0000-4000-8000-000000000002' and event_type=kind) <> 1 then raise exception 'Listing transition events wrong: %',kind; end if;
 end loop;
 foreach kind in array array['store_application_submitted','store_approved','store_verified'] loop
  if (select count(*) from public.marketplace_events where store_id='72000000-0000-4000-8000-000000000002' and event_type=kind) <> 1 then raise exception 'Store transition events wrong/idempotency failed: %',kind; end if;
 end loop;
 if (select published_at from public.listings where id='73000000-0000-4000-8000-000000000002') is null then raise exception 'Lifecycle telemetry regressed first publication'; end if;
end $$;

-- Windowed analytics never assign unknown historic views to a date range.
update public.marketplace_events set created_at=now()-interval '31 days'
where listing_id='73000000-0000-4000-8000-000000000001' and event_type='listing_view' and actor_user_id is null and session_id='74000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare report jsonb; period integer; begin
 foreach period in array array[7,30] loop
  report := public.get_account_analytics(period);
  if (report#>>'{summary,views}')::integer <> 3 then raise exception 'Historical/event time filtering wrong for % days: %',period,report; end if;
 end loop;
 report := public.get_account_analytics(0);
 if (report#>>'{summary,views}')::integer <> 11 or (report#>>'{summary,recorded_views}')::integer <> 4 then raise exception 'Lifetime cache/event distinction lost'; end if;
end $$;

rollback;
