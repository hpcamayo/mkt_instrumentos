-- Sprint 6 verified transaction, review, privacy, time-boundary and lifecycle checks.
-- Local/test database only. Every fixture is rolled back.
begin;

create temporary table qa_s6_ids(name text primary key,id uuid not null) on commit drop;
grant select,insert,update on qa_s6_ids to authenticated;

-- Default-argument RPC resolution must deny anonymous analytics safely. This
-- specifically guards against a PostgREST/Postgres backend crash at the ACL edge.
set local role anon;
do $$ declare account_denied boolean:=false; admin_denied boolean:=false; begin
 begin perform public.get_account_analytics(); exception when insufficient_privilege then account_denied:=true; end;
 begin perform public.get_marketplace_admin_analytics(); exception when insufficient_privilege then admin_denied:=true; end;
 if not account_denied or not admin_denied then raise exception 'Anonymous analytics RPC was not denied safely'; end if;
end $$;
do $$ declare denied integer:=0; probe uuid:='60000000-0000-4000-8000-000000000000'; begin
 begin perform public.get_eligible_transaction_buyers(probe); exception when insufficient_privilege then denied:=denied+1; end;
 begin perform public.create_transaction_claim(probe,probe); exception when insufficient_privilege then denied:=denied+1; end;
 begin perform public.record_external_sale(probe); exception when insufficient_privilege then denied:=denied+1; end;
 begin perform public.cancel_transaction_claim(probe); exception when insufficient_privilege then denied:=denied+1; end;
 begin perform public.respond_transaction_claim(probe,true); exception when insufficient_privilege then denied:=denied+1; end;
 begin perform public.submit_transaction_review(probe,5,null); exception when insufficient_privilege then denied:=denied+1; end;
 begin perform public.get_transaction_center(); exception when insufficient_privilege then denied:=denied+1; end;
 begin perform public.get_transaction_detail(probe); exception when insufficient_privilege then denied:=denied+1; end;
 begin perform public.report_review(probe,'spam',null); exception when insufficient_privilege then denied:=denied+1; end;
 begin perform public.get_admin_review_queue(); exception when insufficient_privilege then denied:=denied+1; end;
 begin perform public.moderate_review(probe,true,'Motivo de prueba'); exception when insufficient_privilege then denied:=denied+1; end;
 if denied<>11 or has_schema_privilege('anon','laria_private','USAGE') then raise exception 'Anonymous Sprint 6 RPC guard failed: %',denied; end if;
end $$;
reset role;

insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
values
 ('61000000-0000-4000-8000-000000000001','authenticated','authenticated','s6-seller@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"seller","full_name":"Vendedor Sprint 6","phone":"51999996001","city":"Lima","region":"Lima"}'),
 ('61000000-0000-4000-8000-000000000002','authenticated','authenticated','s6-buyer-a@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"seller","full_name":"Comprador A","phone":"51999996002","city":"Lima","region":"Lima"}'),
 ('61000000-0000-4000-8000-000000000003','authenticated','authenticated','s6-buyer-b@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"seller","full_name":"Comprador B","phone":"51999996003","city":"Lima","region":"Lima"}'),
 ('61000000-0000-4000-8000-000000000004','authenticated','authenticated','s6-outsider@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"seller","full_name":"Persona Ajena","phone":"51999996004","city":"Lima","region":"Lima"}'),
 ('61000000-0000-4000-8000-000000000005','authenticated','authenticated','s6-store@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"store_owner","full_name":"Dueño Tienda S6","phone":"51999996005","city":"Lima","region":"Lima"}'),
 ('61999999-0000-4000-8000-000000000099','authenticated','authenticated','s6-admin@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{"role":"admin"}','{"account_type":"seller","full_name":"Admin S6","phone":"51999996999","city":"Lima","region":"Lima"}');

insert into public.stores(id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,is_verified)
values('62000000-0000-4000-8000-000000000001','s6-store','Tienda S6','Tienda S6 SAC','20666666666','s6-store@example.invalid','Dueño Tienda S6','Dueño Tienda S6','51999996005','Lima','Lima','Av. QA 600','61000000-0000-4000-8000-000000000005','active',false);

insert into public.listings(id,slug,title,seller_type,status,category,instrument_type,attributes,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at)
values
 ('63000000-0000-4000-8000-000000000001','s6-main','Guitarra principal S6','individual','pending','guitars','electric_guitar','{}','QA','Main','Usado - buen estado',1000,'Lima','Lima','Vendedor Sprint 6','51999996001','Descripción válida y suficientemente extensa para la venta principal Sprint 6.','61000000-0000-4000-8000-000000000001',null,'self_service',now()),
 ('63000000-0000-4000-8000-000000000002','s6-cross','Guitarra cruzada S6','individual','pending','guitars','electric_guitar','{}','QA','Cross','Usado - buen estado',1000,'Lima','Lima','Vendedor Sprint 6','51999996001','Descripción válida y suficientemente extensa para otro contacto Sprint 6.','61000000-0000-4000-8000-000000000001',null,'self_service',now()),
 ('63000000-0000-4000-8000-000000000003','s6-external','Guitarra externa S6','individual','pending','guitars','electric_guitar','{}','QA','External','Usado - buen estado',1000,'Lima','Lima','Vendedor Sprint 6','51999996001','Descripción válida y suficientemente extensa para venta externa Sprint 6.','61000000-0000-4000-8000-000000000001',null,'self_service',now()),
 ('63000000-0000-4000-8000-000000000004','s6-decline','Guitarra rechazo S6','individual','pending','guitars','electric_guitar','{}','QA','Decline','Usado - buen estado',1000,'Lima','Lima','Vendedor Sprint 6','51999996001','Descripción válida y suficientemente extensa para rechazo y selección Sprint 6.','61000000-0000-4000-8000-000000000001',null,'self_service',now()),
 ('63000000-0000-4000-8000-000000000005','s6-deadline','Guitarra plazo S6','individual','pending','guitars','electric_guitar','{}','QA','Deadline','Usado - buen estado',1000,'Lima','Lima','Vendedor Sprint 6','51999996001','Descripción válida y suficientemente extensa para probar el plazo Sprint 6.','61000000-0000-4000-8000-000000000001',null,'self_service',now()),
 ('63000000-0000-4000-8000-000000000006','s6-store-item','Producto Tienda S6','store','pending','guitars','electric_guitar','{}','QA','Store','Nuevo',1000,'Lima','Lima','Dueño Tienda S6','51999996005','Descripción válida y suficientemente extensa para la tienda Sprint 6.','61000000-0000-4000-8000-000000000005','62000000-0000-4000-8000-000000000001','self_service',now());

insert into public.listing_photos(listing_id,image_url,sort_order)
select listing.id,'https://example.invalid/'||listing.id||'-'||photo.n||'.jpg',photo.n
from (values
 ('63000000-0000-4000-8000-000000000001'::uuid),
 ('63000000-0000-4000-8000-000000000002'::uuid),
 ('63000000-0000-4000-8000-000000000003'::uuid),
 ('63000000-0000-4000-8000-000000000004'::uuid),
 ('63000000-0000-4000-8000-000000000005'::uuid),
 ('63000000-0000-4000-8000-000000000006'::uuid)) listing(id)
cross join (values(0),(1)) photo(n);

select set_config('app.allow_listing_admin_fields','true',true);
update public.listings set status='approved',published_at=now()
where owner_user_id in ('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000005');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.set_owned_listing_lifecycle(id,'sold') from public.listings where owner_user_id='61000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select public.set_owned_listing_lifecycle('63000000-0000-4000-8000-000000000006','sold');
reset role;

-- Trusted exact-listing contact history: duplicates dedupe; self, anonymous,
-- other-listing and post-sold contacts never qualify.
insert into public.marketplace_events(event_type,listing_id,seller_user_id,actor_user_id,session_id,source,created_at)
values
 ('whatsapp_contact','63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002',gen_random_uuid(),'detail',(select sold_at-interval '20 minutes' from public.listings where id='63000000-0000-4000-8000-000000000001')),
 ('whatsapp_contact','63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002',gen_random_uuid(),'detail',(select sold_at-interval '10 minutes' from public.listings where id='63000000-0000-4000-8000-000000000001')),
 ('whatsapp_contact','63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',gen_random_uuid(),'detail',(select sold_at-interval '5 minutes' from public.listings where id='63000000-0000-4000-8000-000000000001')),
 ('whatsapp_contact','63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',null,gen_random_uuid(),'detail',(select sold_at-interval '5 minutes' from public.listings where id='63000000-0000-4000-8000-000000000001')),
 ('whatsapp_contact','63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000003',gen_random_uuid(),'detail',(select sold_at+interval '1 minute' from public.listings where id='63000000-0000-4000-8000-000000000001')),
 ('whatsapp_contact','63000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000003',gen_random_uuid(),'detail',(select sold_at-interval '1 minute' from public.listings where id='63000000-0000-4000-8000-000000000002'));

-- Reusable qualifying contacts for cancellation/decline, deadline and store identity.
insert into public.marketplace_events(event_type,listing_id,seller_user_id,store_id,actor_user_id,session_id,source,created_at)
select 'whatsapp_contact',listing.id,listing.owner_user_id,listing.store_id,buyer.id,gen_random_uuid(),'detail',listing.sold_at-interval '1 minute'
from public.listings listing
join (values
 ('63000000-0000-4000-8000-000000000004'::uuid,'61000000-0000-4000-8000-000000000002'::uuid),
 ('63000000-0000-4000-8000-000000000004'::uuid,'61000000-0000-4000-8000-000000000003'::uuid),
 ('63000000-0000-4000-8000-000000000005'::uuid,'61000000-0000-4000-8000-000000000002'::uuid),
 ('63000000-0000-4000-8000-000000000006'::uuid,'61000000-0000-4000-8000-000000000002'::uuid)) buyer(listing_id,id)
on listing.id=buyer.listing_id;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare candidates jsonb; first_claim uuid; retry_claim uuid; denied boolean:=false;
begin
 candidates:=public.get_eligible_transaction_buyers('63000000-0000-4000-8000-000000000001');
 if jsonb_array_length(candidates)<>1
  or candidates#>>'{0,buyer_user_id}'<>'61000000-0000-4000-8000-000000000002'
  or candidates#>>'{0,display_name}'<>'Comprador A'
  or candidates#>'{0}' ?| array['email','phone'] then raise exception 'TX-002 candidate boundary/dedupe/privacy failed: %',candidates; end if;
 begin perform public.create_transaction_claim('63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000003');
 exception when others then denied:=sqlerrm like '%TRANSACTION_BUYER_NOT_ELIGIBLE%'; end;
 if not denied then raise exception 'Forged/noneligible buyer was accepted'; end if;
 first_claim:=public.create_transaction_claim('63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002');
 retry_claim:=public.create_transaction_claim('63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002');
 if first_claim<>retry_claim then raise exception 'Identical pending claim retry was not idempotent'; end if;
 insert into qa_s6_ids values('main_claim',first_claim);
end $$;

-- Raw transaction/review/report tables are unavailable even to a participant.
do $$ declare denied integer:=0; begin
 begin perform count(*) from public.transaction_claims; exception when insufficient_privilege then denied:=denied+1; end;
 begin perform count(*) from public.verified_transactions; exception when insufficient_privilege then denied:=denied+1; end;
 begin perform count(*) from public.transaction_reviews; exception when insufficient_privilege then denied:=denied+1; end;
 begin perform count(*) from public.review_reports; exception when insufficient_privilege then denied:=denied+1; end;
 begin perform count(*) from public.review_moderation_actions; exception when insufficient_privilege then denied:=denied+1; end;
 if denied<>5 then raise exception 'Participant could directly read private Sprint 6 tables: %',denied; end if;
end $$;

do $$ declare detail jsonb; begin
 detail:=public.get_transaction_detail('63000000-0000-4000-8000-000000000001');
 if detail->>'state'<>'pending' or detail->>'transaction_id' is not null then
  raise exception 'Unanswered confirmation did not remain pending/unverified: %',detail;
 end if;
end $$;

-- Unrelated buyer cannot inspect/respond; selected buyer can confirm idempotently.
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ declare denied boolean:=false; claim_uuid uuid; begin
 select id into claim_uuid from qa_s6_ids where name='main_claim';
 begin perform public.respond_transaction_claim(claim_uuid,true); exception when others then denied:=sqlerrm like '%TRANSACTION_CLAIM_NOT_OWNED%'; end;
 if not denied then raise exception 'Unrelated buyer confirmed another account claim'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare claim_uuid uuid; first_result jsonb; retry_result jsonb; begin
 select id into claim_uuid from qa_s6_ids where name='main_claim';
 first_result:=public.respond_transaction_claim(claim_uuid,true);
 retry_result:=public.respond_transaction_claim(claim_uuid,true);
 if first_result->>'transaction_id' is distinct from retry_result->>'transaction_id' then raise exception 'TX-012 confirmation retry duplicated transaction'; end if;
 insert into qa_s6_ids values('main_transaction',(first_result->>'transaction_id')::uuid);
end $$;
reset role;
do $$ begin
 if (select count(*) from public.verified_transactions where listing_id='63000000-0000-4000-8000-000000000001')<>1 then raise exception 'TX-007 exactly one verified transaction failed'; end if;
 if not exists(select 1 from public.notifications where user_id='61000000-0000-4000-8000-000000000002' and event_type='transaction_confirmation_requested') then raise exception 'Buyer request notification missing'; end if;
 if (select count(*) from public.marketplace_events where listing_id='63000000-0000-4000-8000-000000000001' and event_type='transaction_verified')<>1 then raise exception 'Authoritative verification event missing/deduped incorrectly'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare denied boolean:=false; begin
 begin perform public.create_transaction_claim('63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002');
 exception when others then denied:=sqlerrm like '%TRANSACTION_ALREADY_VERIFIED%'; end;
 if not denied then raise exception 'Seller reassigned an already verified transaction'; end if;
end $$;
reset role;

-- External attribution is idempotent and never creates a verified relationship.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare first_id uuid; retry_id uuid; begin
 first_id:=public.record_external_sale('63000000-0000-4000-8000-000000000003');
 retry_id:=public.record_external_sale('63000000-0000-4000-8000-000000000003');
 if first_id<>retry_id then raise exception 'External attribution retry was not idempotent'; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.verified_transactions where listing_id='63000000-0000-4000-8000-000000000003') then raise exception 'External sale created verified transaction'; end if;
end $$;

-- Cancellation and decline remain auditable and allow a different eligible selection.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.cancel_transaction_claim(public.create_transaction_claim('63000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-000000000002'));
insert into qa_s6_ids values('decline_claim',public.create_transaction_claim('63000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-000000000003'));
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.respond_transaction_claim((select id from qa_s6_ids where name='decline_claim'),false);
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare denied boolean:=false; begin
 begin perform public.create_transaction_claim('63000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-000000000003');
 exception when others then denied:=sqlerrm like '%TRANSACTION_BUYER_NOT_ELIGIBLE%'; end;
 if not denied then raise exception 'Seller could reselect a buyer who explicitly declined'; end if;
end $$;
select public.create_transaction_claim('63000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-000000000002');
reset role;
do $$ begin
 if (select count(*) from public.transaction_claims where listing_id='63000000-0000-4000-8000-000000000004' and status='pending')<>1
  or not exists(select 1 from public.transaction_claims where listing_id='63000000-0000-4000-8000-000000000004' and status='cancelled')
  or not exists(select 1 from public.transaction_claims where listing_id='63000000-0000-4000-8000-000000000004' and status='declined') then
  raise exception 'Cancel/decline/reselection history or active uniqueness failed';
 end if;
 if exists(select 1 from public.verified_transactions where listing_id='63000000-0000-4000-8000-000000000004') then raise exception 'Decline created verification'; end if;
end $$;

-- Reviews unlock only after verification and remain double blind until paired.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ declare denied boolean:=false; transaction_uuid uuid; begin
 select id into transaction_uuid from qa_s6_ids where name='main_transaction';
 begin perform public.submit_transaction_review(transaction_uuid,5,'Intrusión'); exception when others then denied:=sqlerrm like '%REVIEW_PARTICIPANT_REQUIRED%'; end;
 if not denied then raise exception 'Unrelated user reviewed transaction'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into qa_s6_ids values('main_buyer_review',public.submit_transaction_review((select id from qa_s6_ids where name='main_transaction'),5,''));
do $$ declare denied boolean:=false; transaction_uuid uuid; begin
 select id into transaction_uuid from qa_s6_ids where name='main_transaction';
 begin perform public.submit_transaction_review(transaction_uuid,4,'Duplicada'); exception when others then denied:=sqlerrm like '%REVIEW_ALREADY_SUBMITTED%'; end;
 if not denied then raise exception 'Duplicate buyer review accepted'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"61999999-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}',true);
do $$ declare queue jsonb; review_uuid uuid; begin
 select id into review_uuid from qa_s6_ids where name='main_buyer_review';
 queue:=public.get_admin_review_queue();
 if exists(select 1 from jsonb_array_elements(queue->'reviews') item where item->>'id'=review_uuid::text) then
  raise exception 'Admin queue revealed an unpaired review before its deadline';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare detail jsonb; transaction_uuid uuid; begin
 select id into transaction_uuid from qa_s6_ids where name='main_transaction';
 detail:=public.get_transaction_detail(transaction_uuid);
 if jsonb_array_length(detail->'visible_reviews')<>0 or detail->'own_review'<>'null'::jsonb then raise exception 'Hidden counterparty review leaked before reveal: %',detail; end if;
 perform public.submit_transaction_review(transaction_uuid,1,'Experiencia registrada por el vendedor.');
 detail:=public.get_transaction_detail(transaction_uuid);
 if jsonb_array_length(detail->'visible_reviews')<>2 then raise exception 'Paired reviews did not reveal immediately'; end if;
end $$;
reset role;
do $$ declare reputation jsonb; begin
 reputation:=public.get_public_reputation('61000000-0000-4000-8000-000000000001',null,5);
 if reputation->>'review_count'<>'1' or (reputation->>'average_rating')::numeric<>5 then raise exception 'Particular reputation aggregate incorrect: %',reputation; end if;
end $$;

-- Visible review can be reported once. Only admin can hide/restore, with audit reason.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ declare review_uuid uuid; denied boolean:=false; begin
 select id into review_uuid from qa_s6_ids where name='main_buyer_review';
 begin perform public.report_review(review_uuid,null,null); exception when others then denied:=sqlerrm like '%REPORT_REASON_INVALID%'; end;
 if not denied then raise exception 'Review report without a fixed reason was accepted'; end if;
 denied:=false;
 perform public.report_review(review_uuid,'spam','Reporte local');
 begin perform public.report_review(review_uuid,'spam','Duplicado'); exception when others then denied:=sqlerrm like '%REPORT_ALREADY_SUBMITTED%'; end;
 if not denied then raise exception 'Duplicate review report accepted'; end if;
 begin perform public.moderate_review(review_uuid,true,'No autorizado'); exception when others then denied:=sqlerrm like '%ADMIN_REQUIRED%'; end;
 if not denied then raise exception 'Nonadmin moderated review'; end if;
 denied:=false;
 begin perform public.get_admin_review_queue(); exception when others then denied:=sqlerrm like '%ADMIN_REQUIRED%'; end;
 if not denied then raise exception 'Nonadmin inspected review/transaction moderation queue'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"61999999-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}',true);
do $$ declare review_uuid uuid; denied boolean:=false; queue jsonb; begin
 select id into review_uuid from qa_s6_ids where name='main_buyer_review';
 begin perform public.moderate_review(review_uuid,true,''); exception when others then denied:=sqlerrm like '%REVIEW_MODERATION_REASON_REQUIRED%'; end;
 if not denied then raise exception 'Admin hid review without reason'; end if;
 perform public.moderate_review(review_uuid,true,'Contenido reportado en prueba local');
 queue:=public.get_admin_review_queue();
 if jsonb_array_length(queue->'reports')<>1 then raise exception 'Admin report queue missing review report'; end if;
 if not exists(select 1 from jsonb_array_elements(queue->'transactions') item
  where item->>'transaction_id'=(select id::text from qa_s6_ids where name='main_transaction')
   and item->>'status'='verified') then raise exception 'Admin transaction linkage/state missing from queue'; end if;
 if (public.get_public_reputation('61000000-0000-4000-8000-000000000001',null,5)->>'review_count')<>'0' then raise exception 'Hidden review remained in aggregate'; end if;
 perform public.moderate_review(review_uuid,false,'Reporte revisado; se restaura la reseña');
end $$;
reset role;
do $$ declare review_uuid uuid; begin
 select id into review_uuid from qa_s6_ids where name='main_buyer_review';
 if (select rating<>5 or comment is not null from public.transaction_reviews where id=review_uuid) then raise exception 'Moderation rewrote review content'; end if;
 if (select count(*) from public.review_moderation_actions where review_id=review_uuid)<>2 then raise exception 'Hide/restore audit history missing'; end if;
end $$;

-- Deadline uses database time: invalid input fails; just-before succeeds; at/after closes.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into qa_s6_ids values('deadline_claim',public.create_transaction_claim('63000000-0000-4000-8000-000000000005','61000000-0000-4000-8000-000000000002'));
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare result jsonb; begin
 result:=public.respond_transaction_claim((select id from qa_s6_ids where name='deadline_claim'),true);
 insert into qa_s6_ids values('deadline_transaction',(result->>'transaction_id')::uuid);
end $$;
reset role;
do $$ declare transaction_uuid uuid; deadline timestamptz:=clock_timestamp()+interval '2 seconds'; begin
 select id into transaction_uuid from qa_s6_ids where name='deadline_transaction';
 update public.verified_transactions set verified_at=deadline-interval '10 days',review_deadline=deadline where id=transaction_uuid;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare transaction_uuid uuid; denied boolean:=false; begin
 select id into transaction_uuid from qa_s6_ids where name='deadline_transaction';
 begin perform public.submit_transaction_review(transaction_uuid,0,null); exception when others then denied:=sqlerrm like '%REVIEW_RATING_INVALID%'; end;
 if not denied then raise exception 'Rating below 1 accepted'; end if;
 denied:=false;
 begin perform public.submit_transaction_review(transaction_uuid,5,repeat('x',2001)); exception when others then denied:=sqlerrm like '%REVIEW_COMMENT_TOO_LONG%'; end;
 if not denied then raise exception 'Oversized review comment accepted'; end if;
 perform public.submit_transaction_review(transaction_uuid,5,null);
end $$;
reset role;
do $$ declare transaction_uuid uuid; boundary timestamptz:=now(); begin
 select id into transaction_uuid from qa_s6_ids where name='deadline_transaction';
 update public.verified_transactions set verified_at=boundary-interval '10 days',review_deadline=boundary where id=transaction_uuid;
 if not laria_private.review_is_visible((select id from public.transaction_reviews where transaction_id=transaction_uuid)) then raise exception 'Single review did not reveal at deadline'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare transaction_uuid uuid; denied boolean:=false; begin
 select id into transaction_uuid from qa_s6_ids where name='deadline_transaction';
 begin perform public.submit_transaction_review(transaction_uuid,5,null); exception when others then denied:=sqlerrm like '%REVIEW_WINDOW_CLOSED%'; end;
 if not denied then raise exception 'Review accepted at/after exact deadline'; end if;
end $$;

-- Store transaction attributes buyer-to-seller reputation to store, never owner profile.
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
insert into qa_s6_ids values('store_claim',public.create_transaction_claim('63000000-0000-4000-8000-000000000006','61000000-0000-4000-8000-000000000002'));
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare result jsonb; begin
 result:=public.respond_transaction_claim((select id from qa_s6_ids where name='store_claim'),true);
 insert into qa_s6_ids values('store_transaction',(result->>'transaction_id')::uuid);
 insert into qa_s6_ids values('store_buyer_review',public.submit_transaction_review((result->>'transaction_id')::uuid,4,'Buena experiencia con la tienda.'));
end $$;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select public.submit_transaction_review((select id from qa_s6_ids where name='store_transaction'),5,'Comprador responsable.');
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select public.report_review((select id from qa_s6_ids where name='store_buyer_review'),'otro',null);
reset role;
do $$ declare store_rep jsonb; owner_rep jsonb; buyer_rep jsonb; begin
 if (select seller_identity_type<>'store' or store_id is null from public.verified_transactions where listing_id='63000000-0000-4000-8000-000000000006') then raise exception 'Store transaction identity not attached to store'; end if;
 if (select subject_store_id is null or subject_user_id is not null from public.transaction_reviews where transaction_id=(select id from public.verified_transactions where listing_id='63000000-0000-4000-8000-000000000006') and direction='buyer_to_seller') then raise exception 'Store review target leaked to owner identity'; end if;
 store_rep:=public.get_public_reputation(null,'62000000-0000-4000-8000-000000000001',5);
 owner_rep:=public.get_public_reputation('61000000-0000-4000-8000-000000000005',null,5);
 if store_rep->>'review_count'<>'1' or owner_rep->>'review_count'<>'0' then raise exception 'Store/owner aggregate separation failed'; end if;
 buyer_rep:=laria_private.get_reputation('61000000-0000-4000-8000-000000000002',null,'seller_to_buyer',5);
 if buyer_rep->>'review_count'<>'2' or (buyer_rep->>'average_rating')::numeric<>3 then raise exception 'Buyer reputation aggregate incorrect: %',buyer_rep; end if;
 if not exists(select 1 from public.review_reports where reporter_user_id='61000000-0000-4000-8000-000000000004' and detail is null and created_at is not null) then
  raise exception 'Review report optional detail/reporter/timestamp semantics failed';
 end if;
end $$;

-- Verified history remains on sold anchor; a relist has no inherited transaction/review.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare copy public.listings; begin
 copy:=public.relist_sold_listing('63000000-0000-4000-8000-000000000001');
 if copy.relisted_from_listing_id<>'63000000-0000-4000-8000-000000000001' then raise exception 'Relist lost original anchor'; end if;
 insert into qa_s6_ids values('relist',copy.id);
end $$;
reset role;
do $$ declare copy_id uuid; begin
 select id into copy_id from qa_s6_ids where name='relist';
 if exists(select 1 from public.verified_transactions where listing_id=copy_id)
  or exists(select 1 from public.transaction_claims where listing_id=copy_id) then raise exception 'LIFE-013 relist inherited transaction history'; end if;
 if not exists(select 1 from public.verified_transactions where listing_id='63000000-0000-4000-8000-000000000001') then raise exception 'Original sold listing lost transaction history'; end if;
end $$;

rollback;
