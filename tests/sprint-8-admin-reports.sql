-- Sprint 8 reports, Admin Hub, audit, RLS, and manual legacy ownership.
-- Local/test database only. Every fixture is rolled back.
begin;

create temporary table qa_s8_ids(name text primary key, id uuid not null) on commit drop;
grant select, insert on qa_s8_ids to authenticated;

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
 ('81000000-0000-4000-8000-000000000001','authenticated','authenticated','s8-owner@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Dueño S8","phone":"51999998001","city":"Lima","region":"Lima"}'),
 ('81000000-0000-4000-8000-000000000002','authenticated','authenticated','s8-reporter-a@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Reportante A","phone":"51999998002","city":"Lima","region":"Lima"}'),
 ('81000000-0000-4000-8000-000000000003','authenticated','authenticated','s8-reporter-b@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Reportante B","phone":"51999998003","city":"Lima","region":"Lima"}'),
 ('81000000-0000-4000-8000-000000000004','authenticated','authenticated','s8-store@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Tienda S8","phone":"51999998004","city":"Lima","region":"Lima"}'),
 ('81000000-0000-4000-8000-000000000005','authenticated','authenticated','s8-store-pending@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Tienda Pendiente S8","phone":"51999998005","city":"Lima","region":"Lima"}'),
 ('81999999-0000-4000-8000-000000000098','authenticated','authenticated','s8-admin-a@example.invalid',now(),'{"role":"admin"}','{"account_type":"seller","full_name":"Admin A S8","phone":"51999998998","city":"Lima","region":"Lima"}'),
 ('81999999-0000-4000-8000-000000000099','authenticated','authenticated','s8-admin-b@example.invalid',now(),'{"role":"admin"}','{"account_type":"seller","full_name":"Admin B S8","phone":"51999998999","city":"Lima","region":"Lima"}');

insert into public.stores(id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,is_verified)
values
 ('82000000-0000-4000-8000-000000000001','s8-tienda','Tienda S8','Tienda S8 SAC','20888888881','s8-store@example.invalid','Dueño Tienda S8','Dueño Tienda S8','51999998004','Lima','Lima','Av. QA 801','81000000-0000-4000-8000-000000000004','active',false),
 ('82000000-0000-4000-8000-000000000002','s8-pending','Tienda Pendiente S8','Tienda Pendiente S8 SAC','20888888882','s8-pending@example.invalid','Pendiente','Pendiente','51999998005','Lima','Lima','Av. QA 802','81000000-0000-4000-8000-000000000005','pending',false);

insert into public.listings(
 id,slug,title,seller_type,status,category,instrument_type,attributes,brand,model,condition,
 price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,
 created_by_source,marketplace_rules_accepted_at,published_at,hidden_source,hidden_reason,hidden_at,sold_at
) values
 ('83000000-0000-4000-8000-000000000001','s8-public','Guitarra pública S8','individual','approved','guitars','electric_guitar','{}','QA','Public','Usado - buen estado',1200,'Lima','Lima','Dueño S8','51999998001','Descripción pública suficientemente extensa para la prueba de reportes Sprint 8.','81000000-0000-4000-8000-000000000001',null,'self_service',now(),now(),null,null,null,null),
 ('83000000-0000-4000-8000-000000000002','s8-hidden','Guitarra oculta S8','individual','hidden','guitars','electric_guitar','{"strings":"6","bridge":"fixed"}','QA','Hidden','Usado - buen estado',1300,'Lima','Lima','Dueño S8','51999998001','Descripción oculta suficientemente extensa para probar privacidad Sprint 8.','81000000-0000-4000-8000-000000000001',null,'self_service',now(),now(),'owner','Oculta por el dueño',now(),null),
 ('83000000-0000-4000-8000-000000000003','s8-sold-review','Guitarra vendida S8','individual','sold','guitars','electric_guitar','{}','QA','Sold','Usado - buen estado',1400,'Lima','Lima','Dueño S8','51999998001','Descripción vendida para la reseña revelada de la prueba Sprint 8.','81000000-0000-4000-8000-000000000001',null,'self_service',now(),now(),null,null,null,now()-interval '12 days'),
 ('83000000-0000-4000-8000-000000000004','s8-pending-listing','Guitarra pendiente S8','individual','pending','guitars','electric_guitar','{}','QA','Pending','Usado - buen estado',1500,'Lima','Lima','Dueño S8','51999998001','Descripción pendiente suficientemente extensa para la cola Sprint 8.','81000000-0000-4000-8000-000000000001',null,'self_service',now(),null,null,null,null,null),
 ('83000000-0000-4000-8000-000000000006','s8-store-pending-listing','Sintetizador de tienda pendiente S8','store','pending','keyboards','synthesizer','{}','QA','Store Pending','Nuevo',1700,'Lima','Lima','Tienda S8','51999998004','Descripción de inventario de tienda para el filtro de propietario Sprint 8.','81000000-0000-4000-8000-000000000004','82000000-0000-4000-8000-000000000001','self_service',now(),null,null,null,null,null),
 ('83000000-0000-4000-8000-000000000007','s8-store-sold-listing','Sintetizador vendido de tienda activa S8','store','sold','keyboards','synthesizer','{}','QA','Store Sold','Nuevo',1800,'Lima','Lima','Tienda S8','51999998004','Descripción de inventario vendido de tienda activa para reportes Sprint 8.','81000000-0000-4000-8000-000000000004','82000000-0000-4000-8000-000000000001','self_service',now(),now(),null,null,null,now()-interval '3 days'),
 ('83000000-0000-4000-8000-000000000008','s8-inactive-store-sold-listing','Sintetizador vendido de tienda no pública S8','store','sold','keyboards','synthesizer','{}','QA','Inactive Store Sold','Nuevo',1900,'Lima','Lima','Tienda Pendiente S8','51999998005','Descripción de inventario vendido de tienda no pública para privacidad Sprint 8.','81000000-0000-4000-8000-000000000005','82000000-0000-4000-8000-000000000002','self_service',now(),now(),null,null,null,now()-interval '3 days'),
 ('83000000-0000-4000-8000-000000000010','s8-legacy','Guitarra legacy S8','individual','approved','guitars','electric_guitar','{}','QA','Legacy','Usado - buen estado',1600,'Lima','Lima','Contacto Histórico','51999998002','Descripción legacy que conserva publicación, fotos e identidad histórica.',null,null,'legacy',null,now(),null,null,null,null);

insert into public.listing_photos(listing_id,image_url,sort_order)
select listing_id,'https://example.invalid/s8-'||listing_id||'-'||photo||'.jpg',photo
from (values
 ('83000000-0000-4000-8000-000000000001'::uuid),
 ('83000000-0000-4000-8000-000000000002'::uuid),
 ('83000000-0000-4000-8000-000000000003'::uuid),
 ('83000000-0000-4000-8000-000000000004'::uuid),
 ('83000000-0000-4000-8000-000000000006'::uuid),
 ('83000000-0000-4000-8000-000000000007'::uuid),
 ('83000000-0000-4000-8000-000000000008'::uuid),
 ('83000000-0000-4000-8000-000000000010'::uuid)
) fixture(listing_id) cross join generate_series(0,1) photo;

insert into public.listing_revisions(
 id,listing_id,owner_user_id,status,changed_fields,title,category,instrument_type,
 attributes,brand,model,condition,submitted_at
) values (
 '83500000-0000-4000-8000-000000000001',
 '83000000-0000-4000-8000-000000000001',
 '81000000-0000-4000-8000-000000000001',
 'pending',array['photos'],'Guitarra pública S8','guitars','electric_guitar',
 '{}','QA','Public','Usado - buen estado',now()
);
insert into public.listing_revision_photos(revision_id,image_url,alt_text,sort_order)
values
 ('83500000-0000-4000-8000-000000000001','/api/listing-images/s8-proposed-front.jpg','Frente propuesto',0),
 ('83500000-0000-4000-8000-000000000001','/api/listing-images/s8-proposed-back.jpg','Reverso propuesto',1);

insert into public.transaction_claims(id,listing_id,seller_user_id,buyer_user_id,attribution_type,status,created_at,responded_at,ended_at)
values('84000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','laria','confirmed',now()-interval '12 days',now()-interval '12 days',now()-interval '12 days');
insert into public.verified_transactions(id,claim_id,listing_id,seller_user_id,buyer_user_id,seller_identity_type,sold_at,verified_at,review_deadline)
values('85000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','particular',now()-interval '12 days',now()-interval '11 days',now()-interval '1 day');
insert into public.transaction_reviews(id,transaction_id,direction,reviewer_user_id,subject_user_id,rating,comment,submitted_at)
values('86000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','buyer_to_seller','81000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001',4,'Reseña revelada Sprint 8',now()-interval '2 days');

-- Anonymous callers cannot report or inspect Admin RPCs.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare denied integer := 0; begin
 begin perform public.submit_content_report('listing','83000000-0000-4000-8000-000000000001','spam',null); exception when insufficient_privilege then denied:=denied+1; end;
 begin perform public.get_admin_moderation_counts(); exception when insufficient_privilege then denied:=denied+1; end;
 begin perform public.get_admin_moderation_queue('reportes',1,20); exception when insufficient_privilege then denied:=denied+1; end;
 begin perform public.get_admin_domain_page('usuarios',null,null,1,24); exception when insufficient_privilege then denied:=denied+1; end;
 begin perform public.get_admin_listings_page(null,null,null,1,24); exception when insufficient_privilege then denied:=denied+1; end;
 begin perform public.get_admin_reports_page(null,null,null,null,1,24); exception when insufficient_privilege then denied:=denied+1; end;
 begin perform public.get_admin_legacy_page(null,null,1,1,20); exception when insufficient_privilege then denied:=denied+1; end;
 begin perform public.moderate_report(gen_random_uuid(),'resolved','Prueba'); exception when insufficient_privilege then denied:=denied+1; end;
 begin perform public.link_legacy_listing_owner('83000000-0000-4000-8000-000000000010','81000000-0000-4000-8000-000000000002','Prueba'); exception when insufficient_privilege then denied:=denied+1; end;
 if denied<>9 then raise exception 'Anonymous Sprint 8 guard failed: %',denied; end if;
end $$;

-- Reporter A can report each eligible public target. Invalid/private/self targets
-- fail with the same safe category and no raw report table is readable.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare
 listing_report uuid; store_report uuid;
 duplicate_denied boolean:=false; invalid_reason boolean:=false; too_long boolean:=false;
 hidden_error text; inactive_store_sold_error text; random_error text; raw_denied boolean:=false;
begin
 listing_report:=public.submit_content_report('listing','83000000-0000-4000-8000-000000000001','posible_estafa','Detalle opcional');
 perform public.submit_content_report('listing','83000000-0000-4000-8000-000000000003','articulo_prohibido','Reporte de una publicación vendida todavía visible');
 perform public.submit_content_report('listing','83000000-0000-4000-8000-000000000007','spam','Reporte de inventario vendido de tienda activa');
 store_report:=public.submit_content_report('store','82000000-0000-4000-8000-000000000001','informacion_falsa',null);
 if listing_report is null or store_report is null then raise exception 'Eligible reports were not created'; end if;
 insert into qa_s8_ids values('reporter_a_listing_report', listing_report);
 begin perform public.submit_content_report('listing','83000000-0000-4000-8000-000000000001','spam',null); exception when others then duplicate_denied:=sqlerrm like '%REPORT_ALREADY_SUBMITTED%'; end;
 begin perform public.submit_content_report('listing','83000000-0000-4000-8000-000000000001','no_valido',null); exception when others then invalid_reason:=sqlerrm like '%REPORT_REASON_INVALID%'; end;
 begin perform public.submit_content_report('store','82000000-0000-4000-8000-000000000001','otro',repeat('x',1001)); exception when others then too_long:=sqlerrm like '%REPORT_DETAIL_TOO_LONG%'; end;
 begin perform public.submit_content_report('listing','83000000-0000-4000-8000-000000000002','spam',null); exception when others then hidden_error:=sqlerrm; end;
 begin perform public.submit_content_report('listing','83000000-0000-4000-8000-000000000008','spam',null); exception when others then inactive_store_sold_error:=sqlerrm; end;
 begin perform public.submit_content_report('listing','87000000-0000-4000-8000-000000000099','spam',null); exception when others then random_error:=sqlerrm; end;
 begin perform count(*) from public.reports; exception when insufficient_privilege then raw_denied:=true; end;
 if not duplicate_denied or not invalid_reason or not too_long or not raw_denied then raise exception 'Report validation/RLS failed'; end if;
 if hidden_error not like '%REPORT_TARGET_UNAVAILABLE%' or random_error<>hidden_error or inactive_store_sold_error<>hidden_error then raise exception 'Target probing produced distinguishable errors: %, %, %',hidden_error,inactive_store_sold_error,random_error; end if;
end $$;

-- The target owner cannot self-report and cannot inspect reporter identity.
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare self_denied boolean:=false; raw_denied boolean:=false; begin
 begin perform public.submit_content_report('listing','83000000-0000-4000-8000-000000000001','otro',null); exception when others then self_denied:=sqlerrm like '%REPORT_TARGET_UNAVAILABLE%'; end;
 begin perform count(*) from public.reports; exception when insufficient_privilege then raw_denied:=true; end;
 if not self_denied or not raw_denied then raise exception 'Owner self-report/reporter privacy failed'; end if;
end $$;

-- Reporter B creates an independent report for the same listing.
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.submit_content_report('listing','83000000-0000-4000-8000-000000000001','otro',null);
select public.report_review('86000000-0000-4000-8000-000000000001','spam','Reporte compatible');
do $$ declare denied integer:=0; begin
 begin perform public.get_admin_moderation_counts(); exception when insufficient_privilege then denied:=denied+1; end;
 begin perform public.moderate_report((select id from public.reports limit 1),'resolved','Intrusión'); exception when insufficient_privilege then denied:=denied+1; end;
 begin perform public.link_legacy_listing_owner('83000000-0000-4000-8000-000000000010','81000000-0000-4000-8000-000000000003','Intrusión'); exception when insufficient_privilege then denied:=denied+1; end;
 if denied<>3 then raise exception 'Nonadmin privileged RPC guard failed: %',denied; end if;
end $$;
reset role;

do $$ begin
 if (select count(*) from public.reports where listing_id='83000000-0000-4000-8000-000000000001' and status='open')<>2 then raise exception 'Different reporters were collapsed'; end if;
 if (select count(*) from public.review_reports where review_id='86000000-0000-4000-8000-000000000001')<>1 then raise exception 'Sprint 6 compatibility view lost report history'; end if;
end $$;

-- Retained oversized photo fixtures exercise both readers' 10-photo bound.
insert into public.listing_revisions(id,listing_id,owner_user_id,status,changed_fields,attributes)
values('83500000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000002',
 '81000000-0000-4000-8000-000000000001','pending',array['attributes'],'{"strings":"7","bridge":"tremolo"}');
insert into public.listing_photos(listing_id,image_url,sort_order)
select '83000000-0000-4000-8000-000000000002','https://example.invalid/s8-bound-current-'||n||'.jpg',n
from generate_series(2,11) n;
insert into public.listing_revision_photos(revision_id,image_url,sort_order)
select '83500000-0000-4000-8000-000000000002','https://example.invalid/s8-bound-proposed-'||n||'.jpg',n
from generate_series(0,11) n;

-- Admin queues/counts are bounded and canonical. Report closure is separate
-- from target moderation and a closed report permits a later new report.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81999999-0000-4000-8000-000000000098","role":"authenticated","app_metadata":{"role":"admin"}}',true);
do $$
declare
 counts jsonb;
  queue jsonb;
  page jsonb;
  page_2 jsonb;
  report_page jsonb;
 legacy_page jsonb;
 legacy_page_2 jsonb;
  report_id uuid;
  resolved_report_id uuid;
  target_status public.listing_status;
  resolved_target_status public.listing_status;
 closed public.reports;
 conflict boolean:=false;
 invalid_filter boolean:=false;
begin
 counts:=public.get_admin_moderation_counts();
 if (counts->>'publicaciones')::int<2 or (counts->>'tiendas')::int<1 or (counts->>'verificacion')::int<>0 or (counts->>'reportes')::int<6 or (counts->>'resenas')::int<1 then raise exception 'Moderation counts incorrect: %',counts; end if;
 queue:=public.get_admin_moderation_queue('reportes',1,2);
 if jsonb_array_length(queue->'items')<>2 or (queue->>'total')::int<6 then raise exception 'Report queue was not bounded: %',queue; end if;
 queue:=public.get_admin_moderation_queue('publicaciones',1,2);
 if not ((queue->'items'->0) ? 'price_pen') or not ((queue->'items'->0) ? 'photo_count') or not ((queue->'items'->0) ? 'first_photo_url') then
   raise exception 'Listing queue lacks bounded moderation context: %',queue;
 end if;
 queue:=public.get_admin_moderation_queue('tiendas',1,2);
 if not ((queue->'items'->0) ? 'address') or not ((queue->'items'->0) ? 'whatsapp_phone') or not ((queue->'items'->0) ? 'store_photos') then
   raise exception 'Store queue lacks application/assets context: %',queue;
 end if;
 queue:=public.get_admin_moderation_queue('verificacion',1,2);
 if (queue->>'total')::int<>0 or jsonb_array_length(queue->'items')<>0 then
   raise exception 'Optional Tienda verification was misrepresented as pending work: %',queue;
 end if;
 page:=public.get_admin_domain_page('publicaciones','Guitarra','approved',1,2);
 if (page->>'page_size')::int<>2 or jsonb_array_length(page->'items')>2 then raise exception 'Admin domain pagination failed'; end if;
 page:=public.get_admin_domain_page('revisiones','Guitarra pública S8','pending',1,10);
 if (page->>'total')::int<>1
   or not ((page->'items'->0) ? 'current_values')
   or not ((page->'items'->0) ? 'proposed_values')
   or (page->'items'->0->>'proposed_photo_count')::int<>2 then
   raise exception 'Revision domain lacks inspection context: %',page;
 end if;
 -- ADMIN-005: inspect both readers before any moderation decision.
 queue:=public.get_admin_moderation_queue('revisiones',1,25);
 for page_2 in select value from jsonb_array_elements(queue->'items')
   where value->>'id' in ('83500000-0000-4000-8000-000000000001','83500000-0000-4000-8000-000000000002')
 loop
   page:=public.get_admin_domain_page('revisiones',page_2->>'listing_title','pending',1,10);
   if page->'items'->0 is distinct from (page_2 || jsonb_build_object(
     'status','pending','reviewed_at',null,'rejection_reason',null,'resolution_reason',null
   )) then raise exception 'Revision readers disagree: %, %',page,page_2; end if;
   if page_2->>'id'='83500000-0000-4000-8000-000000000001' then
     if page_2->'changed_fields' is distinct from '["photos"]'::jsonb
       or jsonb_array_length(page_2->'current_photos') is distinct from 2
       or jsonb_array_length(page_2->'proposed_photos') is distinct from 2
       or page_2->'current_photos'->0->>'image_url' not like 'https://example.invalid/s8-%'
       or page_2->'proposed_photos'->0->>'image_url' is distinct from '/api/listing-images/s8-proposed-front.jpg'
       or page_2->'proposed_photos'->1->>'alt_text' is distinct from 'Reverso propuesto' then
       raise exception 'ADMIN-005 photo-only proposal is not reviewable: %',page_2;
     end if;
   else
     if page_2->'changed_fields' is distinct from '["attributes"]'::jsonb
       or page_2->'current_values'->'attributes' is distinct from '{"strings":"6","bridge":"fixed"}'::jsonb
       or page_2->'proposed_values'->'attributes' is distinct from '{"strings":"7","bridge":"tremolo"}'::jsonb
       or page_2->'proposed_values'->>'instrument_type' is distinct from 'electric_guitar'
       or jsonb_array_length(page_2->'current_photos') is distinct from 10
       or jsonb_array_length(page_2->'proposed_photos') is distinct from 10
       or (page_2->'current_photos'->9->>'sort_order')::int is distinct from 9
       or (page_2->'proposed_photos'->9->>'sort_order')::int is distinct from 9 then
       raise exception 'ADMIN-005 attributes/bounded photos missing: %',page_2;
     end if;
   end if;
 end loop;
 if (select count(*) from jsonb_array_elements(queue->'items') where value->>'id' in (
   '83500000-0000-4000-8000-000000000001','83500000-0000-4000-8000-000000000002')) is distinct from 2 then
   raise exception 'ADMIN-005 revision fixtures missing from queue';
 end if;
 page:=public.get_admin_domain_page('resenas','86000000-0000-4000-8000-000000000001','visible',1,10);
 if (page->>'total')::int<>1 then raise exception 'Review ID search failed: %',page; end if;
 page:=public.get_admin_domain_page('resenas','85000000-0000-4000-8000-000000000001','visible',1,10);
 if (page->>'total')::int<>1 then raise exception 'Review transaction search failed: %',page; end if;
 page:=public.get_admin_domain_page('resenas','Guitarra vendida S8','visible',1,10);
 if (page->>'total')::int<>1 then raise exception 'Review listing-title search failed: %',page; end if;
 page:=public.get_admin_domain_page('transacciones',null,'confirmed',1,10);
 if (page->>'total')::int<>0 then raise exception 'Verified transaction leaked into confirmed filter: %',page; end if;
 page:=public.get_admin_domain_page('transacciones',null,'verified',1,10);
 if (page->>'total')::int<>1 or page->'items'->0->>'status'<>'verified' then
   raise exception 'Verified transaction filter failed: %',page;
 end if;
 page:=public.get_admin_domain_page('tiendas','Tienda Pendiente S8','pending',1,10);
 if (page->>'total')::int<>1
   or not ((page->'items'->0) ? 'address')
   or not ((page->'items'->0) ? 'whatsapp_phone')
   or not ((page->'items'->0) ? 'logo_url')
   or (page->'items'->0->>'store_photo_count')::int<>0 then
   raise exception 'Store domain lacks business/assets context: %',page;
 end if;

  page:=public.get_admin_listings_page(null,'individual','Guitarra',1,50);
 if (page->>'total')::int<4 or exists(
   select 1 from jsonb_array_elements(page->'items') item where item->>'seller_type'<>'individual'
 ) then raise exception 'Individual owner-type filter failed: %',page; end if;
 page:=public.get_admin_listings_page('pending','store','Sintetizador',1,10);
 if (page->>'total')::int<>1 or page->'items'->0->>'id'<>'83000000-0000-4000-8000-000000000006' then
   raise exception 'Store owner-type filter failed: %',page;
 end if;
 page:=public.get_admin_listings_page(null,null,null,1,2);
 page_2:=public.get_admin_listings_page(null,null,null,2,2);
 if jsonb_array_length(page->'items')<>2
   or jsonb_array_length(page_2->'items')<>2
   or exists(
     select 1
     from jsonb_array_elements(page->'items') first_page
     join jsonb_array_elements(page_2->'items') second_page
       on first_page->>'id'=second_page->>'id'
   ) then raise exception 'Listing pagination is not stable/disjoint: %, %',page,page_2; end if;

 page:=public.get_admin_domain_page('usuarios','Reportante A','seller',1,10);
 if (page->>'total')::int<>1
   or page->'items'->0->>'id'<>'81000000-0000-4000-8000-000000000002'
   or not ((page->'items'->0) ? 'listing_count')
   or not ((page->'items'->0) ? 'transaction_count') then
   raise exception 'User inspection/search context failed: %',page;
 end if;

 report_page:=public.get_admin_reports_page('open','listing','otro','Reportante B',1,10);
 if (report_page->>'total')::int<>1
   or report_page->'items'->0->>'target_status'<>'approved'
   or report_page->'items'->0->>'target_owner_user_id'<>'81000000-0000-4000-8000-000000000001'
   or (report_page->'items'->0->>'open_target_report_count')::int<>2
   or (report_page->'items'->0->>'target_report_count')::int<>2 then
   raise exception 'Report filters/current target context failed: %',report_page;
 end if;
 resolved_report_id:=(report_page->'items'->0->>'id')::uuid;
 report_page:=public.get_admin_reports_page('open','listing',null,'Guitarra pública S8',1,10);
 if (report_page->>'total')::int<>2 then raise exception 'Report title search failed: %',report_page; end if;
 report_page:=public.get_admin_reports_page('open','listing',null,'83000000-0000-4000-8000-000000000001',1,10);
 if (report_page->>'total')::int<>2 then raise exception 'Report ID search failed: %',report_page; end if;
 report_page:=public.get_admin_reports_page('open','listing','articulo_prohibido','Guitarra vendida S8',1,10);
 if (report_page->>'total')::int<>1 or report_page->'items'->0->>'target_status'<>'sold' then
   raise exception 'Public sold-listing reportability failed: %',report_page;
 end if;
 report_page:=public.get_admin_reports_page('open','listing','spam','Sintetizador vendido de tienda activa S8',1,10);
 if (report_page->>'total')::int<>1 or report_page->'items'->0->>'target_status'<>'sold'
   or report_page->'items'->0->>'target_owner_user_id'<>'81000000-0000-4000-8000-000000000004' then
   raise exception 'Active-store sold-listing reportability failed: %',report_page;
 end if;
 page:=public.get_admin_domain_page('tiendas','82000000-0000-4000-8000-000000000001',null,1,10);
 if (page->>'total')::int<>1
   or (page->'items'->0->>'listing_count')::int<>2
   or (page->'items'->0->>'report_count')::int<>1
   or (page->'items'->0->>'open_report_count')::int<>1 then
   raise exception 'Store management context/search failed: %',page;
 end if;
 page:=public.get_admin_listings_page(null,'store','82000000-0000-4000-8000-000000000001',1,10);
 if (page->>'total')::int<>2
   or exists (
     select 1 from jsonb_array_elements(page->'items') item
     where item->>'store_id'<>'82000000-0000-4000-8000-000000000001'
   ) then raise exception 'Store inventory deep-link filter failed: %',page; end if;
 report_page:=public.get_admin_reports_page('open','store',null,'82000000-0000-4000-8000-000000000001',1,10);
 if (report_page->>'total')::int<>1 or report_page->'items'->0->>'store_id'<>'82000000-0000-4000-8000-000000000001' then
   raise exception 'Store report deep-link filter failed: %',report_page;
 end if;
 begin
   perform public.get_admin_reports_page(null,'invalid',null,null,1,10);
 exception when others then
   invalid_filter:=sqlerrm like '%ADMIN_REPORT_TARGET_TYPE_INVALID%';
 end;
 if not invalid_filter then raise exception 'Invalid report target filter was accepted'; end if;

 legacy_page:=public.get_admin_legacy_page('Guitarra legacy','Reportante A',1,1,1);
 if (legacy_page->>'listing_total')::int<>1 or (legacy_page->>'user_total')::int<>1
   or jsonb_array_length(legacy_page->'items')<>1 or jsonb_array_length(legacy_page->'users')<>1 then
   raise exception 'Independent legacy listing/user search failed: %',legacy_page;
 end if;
 legacy_page:=public.get_admin_legacy_page(null,null,1,1,2);
 legacy_page_2:=public.get_admin_legacy_page(null,null,1,2,2);
 if (legacy_page->>'user_total')::int<4
   or exists(
     select 1
     from jsonb_array_elements(legacy_page->'users') first_page
     join jsonb_array_elements(legacy_page_2->'users') second_page
       on first_page->>'id'=second_page->>'id'
   ) then raise exception 'Legacy user pagination is not stable/disjoint: %, %',legacy_page,legacy_page_2; end if;

 select id into report_id from qa_s8_ids where name='reporter_a_listing_report';
 select status into target_status from public.listings where id='83000000-0000-4000-8000-000000000001';
 closed:=public.moderate_report(report_id,'dismissed','No requiere moderación del objetivo');
 if closed.status<>'dismissed' or (select status from public.listings where id='83000000-0000-4000-8000-000000000001')<>target_status then raise exception 'Dismiss mutated target or failed'; end if;
 begin perform public.moderate_report(report_id,'resolved','Conflicto'); exception when others then conflict:=sqlerrm like '%REPORT_ALREADY_CLOSED%'; end;
  if not conflict then raise exception 'Resolve/dismiss conflict was last-write-wins'; end if;
  if not (public.get_admin_audit_history('report',report_id,10) @> jsonb_build_array(jsonb_build_object('action','report_dismissed'))) then raise exception 'Report audit missing'; end if;

  select status into resolved_target_status from public.listings where id='83000000-0000-4000-8000-000000000001';
  closed:=public.moderate_report(resolved_report_id,'resolved','Reporte atendido; el objetivo se modera por separado');
  if closed.status<>'resolved'
    or (select status from public.listings where id='83000000-0000-4000-8000-000000000001')<>resolved_target_status then
    raise exception 'Resolve mutated target or failed';
  end if;
  if not (public.get_admin_audit_history('report',resolved_report_id,10) @> jsonb_build_array(jsonb_build_object('action','report_resolved'))) then
    raise exception 'Resolved report audit missing';
  end if;
end $$;

-- Review moderation remains immutable and is independently audited.
select public.moderate_review('86000000-0000-4000-8000-000000000001',true,'Contenido reportado en prueba Sprint 8');
do $$ declare page jsonb; queue jsonb; counts jsonb; begin
 page:=public.get_admin_domain_page('resenas',null,'hidden',1,24);
 if not (page->'items' @> '[{"id":"86000000-0000-4000-8000-000000000001"}]'::jsonb) then
   raise exception 'Hidden revealed review disappeared from Admin domain: %',page;
 end if;
 queue:=public.get_admin_moderation_queue('resenas',1,20);
 if (queue->>'total')::int<>0 or jsonb_array_length(queue->'items')<>0 then
   raise exception 'Hidden review remained actionable in the review queue: %',queue;
 end if;
 counts:=public.get_admin_moderation_counts();
 if (counts->>'resenas')::int<>0 or (counts->>'reportes')::int<1 then
   raise exception 'Hidden review count/report separation failed: %',counts;
 end if;
 if not (public.get_admin_audit_history('review','86000000-0000-4000-8000-000000000001',10) @> jsonb_build_array(jsonb_build_object('action','review_hidden'))) then raise exception 'Review audit missing'; end if;
end $$;
reset role;
do $$ begin
 if (select rating from public.transaction_reviews where id='86000000-0000-4000-8000-000000000001')<>4 then raise exception 'Review content was rewritten'; end if;
 if laria_private.review_is_visible('86000000-0000-4000-8000-000000000001') then raise exception 'Admin-hidden review remained publicly visible'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81999999-0000-4000-8000-000000000098","role":"authenticated","app_metadata":{"role":"admin"}}',true);
select public.moderate_review('86000000-0000-4000-8000-000000000001',false,'Reporte revisado; se restaura la reseña');
do $$ declare page jsonb; queue jsonb; begin
 page:=public.get_admin_domain_page('resenas',null,'visible',1,24);
 if not (page->'items' @> '[{"id":"86000000-0000-4000-8000-000000000001"}]'::jsonb) then
   raise exception 'Restored review missing from visible Admin domain: %',page;
 end if;
 if not (public.get_admin_audit_history('review','86000000-0000-4000-8000-000000000001',10) @> jsonb_build_array(jsonb_build_object('action','review_restored'))) then raise exception 'Review restore audit missing'; end if;
 queue:=public.get_admin_moderation_queue('resenas',1,20);
 if not (queue->'items' @> '[{"id":"86000000-0000-4000-8000-000000000001"}]'::jsonb) then
   raise exception 'Restored reported review did not return to actionable queue: %',queue;
 end if;
end $$;
reset role;
do $$ begin
 if not laria_private.review_is_visible('86000000-0000-4000-8000-000000000001') then raise exception 'Restored revealed review did not regain public visibility'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81999999-0000-4000-8000-000000000098","role":"authenticated","app_metadata":{"role":"admin"}}',true);

-- Existing listing state machine is the workbench authority and its action is audited.
select public.review_listing('83000000-0000-4000-8000-000000000004','approve',null);
do $$ begin
 if not (public.get_admin_audit_history('listing','83000000-0000-4000-8000-000000000004',10) @> jsonb_build_array(jsonb_build_object('action','listing_approved'))) then raise exception 'Listing moderation audit missing'; end if;
end $$;
select public.review_listing('83000000-0000-4000-8000-000000000004','hide','Motivo administrativo auditable');
do $$ begin
 if not (public.get_admin_audit_history('listing','83000000-0000-4000-8000-000000000004',10) @> jsonb_build_array(jsonb_build_object(
   'action','listing_hidden','detail',jsonb_build_object('reason','Motivo administrativo auditable')
 ))) then raise exception 'Listing moderation reason audit missing'; end if;
end $$;
select public.review_listing('83000000-0000-4000-8000-000000000004','restore',null);
do $$ begin
 if not (public.get_admin_audit_history('listing','83000000-0000-4000-8000-000000000004',10) @> jsonb_build_array(jsonb_build_object(
   'action','listing_approved','detail',jsonb_build_object('prior_reason','Motivo administrativo auditable')
 ))) then raise exception 'Listing prior moderation reason was not preserved'; end if;
end $$;

-- The preserved Admin content/profile editors are allowlisted, audited, and
-- cannot leave an already-public record below its database invariant.
do $$ declare denied boolean:=false; begin
 update public.listings set model='Legacy administrada' where id='83000000-0000-4000-8000-000000000010';
 if (select model from public.listings where id='83000000-0000-4000-8000-000000000010')<>'Legacy administrada' then
   raise exception 'Historical incomplete listing compatibility was lost';
 end if;
 update public.stores set description='Perfil histórico administrado.' where id='10000000-0000-0000-0000-000000000001';
 if (select description from public.stores where id='10000000-0000-0000-0000-000000000001')<>'Perfil histórico administrado.' then
   raise exception 'Historical incomplete store compatibility was lost';
 end if;

 begin
   update public.listings set price_pen=0 where id='83000000-0000-4000-8000-000000000001';
 exception when others then
   denied:=sqlerrm like '%LISTING_REQUIREMENTS_INVALID%';
 end;
 if not denied or (select price_pen from public.listings where id='83000000-0000-4000-8000-000000000001')<>1200 then
   raise exception 'Invalid public listing Admin edit was accepted';
 end if;
 update public.listings set model='Public administrada' where id='83000000-0000-4000-8000-000000000001';
 if not (public.get_admin_audit_history('listing','83000000-0000-4000-8000-000000000001',10) @> jsonb_build_array(jsonb_build_object('action','listing_content_updated'))) then
   raise exception 'Allowed listing content edit audit missing';
 end if;

 denied:=false;
 begin
   update public.stores set ruc=null where id='82000000-0000-4000-8000-000000000001';
 exception when others then
   denied:=sqlerrm like '%STORE_APPLICATION_INCOMPLETE%';
 end;
 if not denied or (select ruc from public.stores where id='82000000-0000-4000-8000-000000000001')<>'20888888881' then
   raise exception 'Invalid active-store Admin edit was accepted';
 end if;
 update public.stores set description='Perfil comercial revisado por administración.' where id='82000000-0000-4000-8000-000000000001';
 if not (public.get_admin_audit_history('store','82000000-0000-4000-8000-000000000001',10) @> jsonb_build_array(jsonb_build_object('action','store_profile_updated'))) then
   raise exception 'Allowed store profile edit audit missing';
 end if;
end $$;

-- ADMIN-030 starts with an actual pending proposal and zero buyer relations.
reset role;
insert into public.listing_revisions(id,listing_id,owner_user_id,status,changed_fields,title)
values('83500000-0000-4000-8000-000000000030','83000000-0000-4000-8000-000000000004',
 '81000000-0000-4000-8000-000000000001','pending',array['title'],'Guitarra pendiente S8 editada');
do $$ begin
 if exists(select 1 from public.transaction_claims where listing_id='83000000-0000-4000-8000-000000000004')
   or exists(select 1 from public.verified_transactions where listing_id='83000000-0000-4000-8000-000000000004') then
   raise exception 'ADMIN-030 fixture already has buyer relations';
 end if;
end $$;
set local role authenticated;
select public.review_listing('83000000-0000-4000-8000-000000000004','sold',null);
do $$ begin
 if (select status from public.listings where id='83000000-0000-4000-8000-000000000004')<>'sold'
   or (select sold_at from public.listings where id='83000000-0000-4000-8000-000000000004') is null then
   raise exception 'Admin mark-sold transition failed';
 end if;
 if not (public.get_admin_audit_history('listing','83000000-0000-4000-8000-000000000004',10) @> jsonb_build_array(jsonb_build_object('action','listing_sold'))) then
   raise exception 'Admin mark-sold audit missing';
 end if;
end $$;

-- Inspect without RLS so a fabricated relation cannot yield a false negative.
reset role;
do $$ begin
 if (select status from public.listing_revisions where id='83500000-0000-4000-8000-000000000030')<>'cancelled'
   or (select reviewed_at from public.listing_revisions where id='83500000-0000-4000-8000-000000000030') is null
   or exists(select 1 from public.listing_revisions where listing_id='83000000-0000-4000-8000-000000000004' and status='pending') then
   raise exception 'ADMIN-030 mark-sold did not cancel pending revision';
 end if;
 if exists(select 1 from public.transaction_claims where listing_id='83000000-0000-4000-8000-000000000004') then
   raise exception 'ADMIN-030 mark-sold fabricated buyer claim';
 end if;
 if exists(select 1 from public.verified_transactions where listing_id='83000000-0000-4000-8000-000000000004') then
   raise exception 'ADMIN-030 mark-sold fabricated verified transaction';
 end if;
end $$;
set local role authenticated;

-- Revision, store approval and verification continue through the established
-- state machines and every privileged transition is auditable.
select public.review_listing_revision('83500000-0000-4000-8000-000000000001','approve',1,null);
do $$ begin
 if not (public.get_admin_audit_history('listing_revision','83500000-0000-4000-8000-000000000001',10) @> jsonb_build_array(jsonb_build_object('action','listing_revision_approved'))) then
   raise exception 'Revision moderation audit missing';
 end if;
end $$;

select public.review_store_application('82000000-0000-4000-8000-000000000002','reject','RUC pendiente de validación documental');
do $$ begin
 if not (public.get_admin_audit_history('store','82000000-0000-4000-8000-000000000002',10) @> jsonb_build_array(jsonb_build_object(
   'action','store_rejected','detail',jsonb_build_object('reason','RUC pendiente de validación documental')
 ))) then raise exception 'Store moderation reason audit missing'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select public.resubmit_store_application('82000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claims','{"sub":"81999999-0000-4000-8000-000000000098","role":"authenticated","app_metadata":{"role":"admin"}}',true);
select public.review_store_application('82000000-0000-4000-8000-000000000002','approve',null);
do $$ begin
 if not (public.get_admin_audit_history('store','82000000-0000-4000-8000-000000000002',10) @> jsonb_build_array(jsonb_build_object('action','store_active'))) then
   raise exception 'Store approval audit missing';
 end if;
end $$;

select public.set_store_verification('82000000-0000-4000-8000-000000000002',true);
do $$ declare page jsonb; begin
 page:=public.get_admin_domain_page('tiendas','Tienda Pendiente S8','verified',1,10);
 if (page->>'total')::int<>1
   or page->'items'->0->>'id'<>'82000000-0000-4000-8000-000000000002'
   or (page->'items'->0->>'is_verified')::boolean is not true then
   raise exception 'Verified-store filtering failed: %',page;
 end if;
 if not (public.get_admin_audit_history('store','82000000-0000-4000-8000-000000000002',10) @> jsonb_build_array(jsonb_build_object('action','store_verified'))) then
   raise exception 'Store verification audit missing';
 end if;
end $$;

-- Legacy linking rejects Store Owners, links exactly once, preserves state,
-- photos and historical snapshots, and records the selected account/Admin.
do $$ declare denied boolean:=false; linked public.listings; begin
 begin perform public.link_legacy_listing_owner('83000000-0000-4000-8000-000000000010','81000000-0000-4000-8000-000000000004','Cuenta de tienda no permitida'); exception when others then denied:=sqlerrm like '%LEGACY_OWNER_NOT_ELIGIBLE%'; end;
 if not denied then raise exception 'Store Owner received individual legacy listing'; end if;
 linked:=public.link_legacy_listing_owner('83000000-0000-4000-8000-000000000010','81000000-0000-4000-8000-000000000003','Evidencia revisada manualmente');
 if linked.owner_user_id<>'81000000-0000-4000-8000-000000000003' or linked.status<>'approved' or linked.contact_name<>'Contacto Histórico' then raise exception 'Legacy link rewrote historical listing'; end if;
 if (select count(*) from public.listing_photos where listing_id=linked.id)<>2 then raise exception 'Legacy link lost photos'; end if;
 if not (public.get_admin_audit_history('legacy_link',linked.id,10) @> jsonb_build_array(jsonb_build_object('action','legacy_owner_linked'))) then raise exception 'Legacy link audit missing'; end if;
 denied:=false;
 begin perform public.link_legacy_listing_owner(linked.id,'81000000-0000-4000-8000-000000000002','Segundo intento'); exception when others then denied:=sqlerrm like '%LEGACY_LISTING_NOT_ELIGIBLE%'; end;
 if not denied then raise exception 'Already-owned legacy listing was reassigned'; end if;
end $$;

-- Closing the first reporter's listing report allows a later, genuinely new open report.
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.submit_content_report('listing','83000000-0000-4000-8000-000000000001','otro','Nuevo reporte después del cierre');
reset role;

do $$ begin
 if (select count(*) from public.reports where listing_id='83000000-0000-4000-8000-000000000001' and reporter_user_id='81000000-0000-4000-8000-000000000002')<>2 then raise exception 'Closed report did not preserve history/new-open semantics'; end if;
 if (select count(*) from public.listings where owner_user_id is null and created_by_source='legacy' and whatsapp_phone='51999998002')<>0 then raise exception 'Explicitly linked fixture remained unowned'; end if;
end $$;

rollback;
