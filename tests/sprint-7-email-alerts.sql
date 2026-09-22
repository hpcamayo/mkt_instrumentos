-- Sprint 7 saved-search, marketplace email, RLS and queue reliability checks.
-- Local/test database only. Every fixture is rolled back.
begin;

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
 ('71000000-0000-4000-8000-000000000001','authenticated','authenticated','s7-owner@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Dueño S7","phone":"51999997001","city":"Lima","region":"Lima"}'),
 ('71000000-0000-4000-8000-000000000002','authenticated','authenticated','s7-buyer-a@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Comprador A S7","phone":"51999997002","city":"Lima","region":"Lima"}'),
 ('71000000-0000-4000-8000-000000000003','authenticated','authenticated','s7-buyer-b@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Comprador B S7","phone":"51999997003","city":"Lima","region":"Lima"}'),
 ('71000000-0000-4000-8000-000000000004','authenticated','authenticated','s7-store@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Tienda S7","phone":"51999997004","city":"Lima","region":"Lima"}');

-- Anonymous callers and ordinary users cannot access internal scheduler/send paths.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare denied integer := 0; begin
  begin perform public.create_saved_search_alert('{}','immediate'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.prepare_daily_search_alert_emails(current_date - 1, 10); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.claim_marketplace_email_deliveries(gen_random_uuid(), 10); exception when insufficient_privilege then denied := denied + 1; end;
  if denied <> 3 or has_schema_privilege('anon','laria_private','usage') then raise exception 'Anonymous alert/email guard failed'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare denied integer := 0; begin
  begin perform public.prepare_daily_search_alert_emails(current_date - 1, 10); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.claim_marketplace_email_deliveries(gen_random_uuid(), 10); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform laria_private.enqueue_marketplace_email('listing_approved','71000000-0000-4000-8000-000000000002','forged'); exception when insufficient_privilege then denied := denied + 1; end;
  if denied <> 3 then raise exception 'Authenticated caller reached internal email authority'; end if;
end $$;

-- Exact compound state is normalized and duplicate semantic brand case is refused.
select public.create_saved_search_alert(
  '{"category":"guitars","instrument_type":"electric_guitar","condition":"Usado - buen estado","brand":"Fender","location":"Lima","seller_type":"individual","min_price":1000,"max_price":3000,"advanced":{"body_type":"solid_body","pickups":["single_coil"]}}',
  'immediate'
);
do $$ declare duplicate_denied boolean := false; invalid_denied boolean := false; begin
  begin perform public.create_saved_search_alert(
    '{"max_price":3000,"min_price":1000,"seller_type":"individual","location":"Lima","brand":"fender","condition":"Usado - buen estado","instrument_type":"electric_guitar","category":"guitars","advanced":{"pickups":["single_coil"],"body_type":"solid_body"}}',
    'daily'); exception when others then duplicate_denied := sqlerrm like '%ALERT_ALREADY_EXISTS%'; end;
  begin perform public.create_saved_search_alert('{"unsupported":"value"}','immediate'); exception when others then invalid_denied := sqlerrm like '%ALERT_FILTERS_INVALID%'; end;
  if not duplicate_denied or not invalid_denied then raise exception 'Alert normalization/duplicate validation failed'; end if;
  if (select count(*) from public.saved_search_alerts) <> 1 then raise exception 'Owner cannot read own alert'; end if;
end $$;

-- Store Owner accounts are buyer-capable and receive an isolated daily alert.
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.create_saved_search_alert('{"category":"guitars","instrument_type":"electric_guitar","location":"Lima"}','daily');
do $$ declare foreign_id uuid; changed integer := 0; denied boolean := false; begin
  if (select count(*) from public.saved_search_alerts) <> 1 then raise exception 'Cross-user alert leaked'; end if;
  select id into foreign_id from public.saved_search_alerts;
  begin
    with changed_rows as (update public.saved_search_alerts set user_id='71000000-0000-4000-8000-000000000002' where id=foreign_id returning 1)
    select count(*) into changed from changed_rows;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied or changed <> 0 then raise exception 'Direct alert authority write succeeded'; end if;
end $$;

-- Pending/rejected/nonmatching listings generate neither matches nor email.
reset role;
insert into public.listings(id,slug,title,seller_type,status,category,instrument_type,attributes,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,created_by_source,marketplace_rules_accepted_at)
values
 ('72000000-0000-4000-8000-000000000001','s7-match-one','Fender Strat S7','individual','pending','guitars','electric_guitar','{"body_type":"solid_body","pickups":["single_coil","humbucker"]}','Fender','Strat','Usado - buen estado',2000,'Lima','Lima','Dueño S7','51999997001','Descripción válida y suficientemente extensa para publicación de prueba Sprint 7.','71000000-0000-4000-8000-000000000001','self_service',now()),
 ('72000000-0000-4000-8000-000000000002','s7-nonmatch','Yamaha acústica S7','individual','pending','guitars','acoustic_guitar','{}','Yamaha','A1','Usado - buen estado',2000,'Lima','Lima','Dueño S7','51999997001','Descripción válida y suficientemente extensa para no coincidir con la alerta.','71000000-0000-4000-8000-000000000001','self_service',now());
insert into public.listing_photos(listing_id,image_url,sort_order)
select listing_id, 'https://example.invalid/'||listing_id||'-'||photo||'.jpg', photo
from (values('72000000-0000-4000-8000-000000000001'::uuid),('72000000-0000-4000-8000-000000000002'::uuid)) items(listing_id)
cross join generate_series(0,1) photo;
do $$ begin
  if (select count(*) from laria_private.search_alert_matches) <> 0 then raise exception 'Pending listing matched'; end if;
end $$;
select set_config('app.allow_listing_admin_fields','true',true);
update public.listings set status='rejected',rejection_reason='Prueba' where id='72000000-0000-4000-8000-000000000001';
do $$ begin if (select count(*) from laria_private.search_alert_matches) <> 0 then raise exception 'Rejected listing matched'; end if; end $$;
update public.listings set status='pending',rejection_reason=null where id='72000000-0000-4000-8000-000000000001';
update public.listings set status='approved',published_at=now() where id in ('72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000002');
do $$ begin
  if (select count(*) from laria_private.search_alert_matches where listing_id='72000000-0000-4000-8000-000000000001') <> 2 then raise exception 'Compound matching/publication fanout failed'; end if;
  if exists(select 1 from laria_private.search_alert_matches where listing_id='72000000-0000-4000-8000-000000000002') then raise exception 'Nonmatching listing alerted'; end if;
  if (select count(*) from laria_private.marketplace_email_deliveries where event_type='search_alert_immediate') <> 1 then raise exception 'Immediate email eligibility missing'; end if;
  if (select count(*) from laria_private.marketplace_email_deliveries where event_type='search_alert_daily') <> 0 then raise exception 'Daily email sent per listing'; end if;
end $$;

-- No-op updates and hide/restore cannot make the same listing newly public again.
update public.listings set status='approved' where id='72000000-0000-4000-8000-000000000001';
update public.listings set status='hidden',hidden_source='owner',hidden_at=now() where id='72000000-0000-4000-8000-000000000001';
update public.listings set status='approved',hidden_source=null,hidden_at=null where id='72000000-0000-4000-8000-000000000001';
do $$ begin
  if (select count(*) from laria_private.search_alert_matches where listing_id='72000000-0000-4000-8000-000000000001') <> 2 then raise exception 'Same listing alerted twice'; end if;
end $$;

-- One worker owns a job; retry reuses the same logical delivery and provider key.
create temporary table qa_s7_delivery(id uuid primary key) on commit drop;
grant select,insert on qa_s7_delivery to service_role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ declare first_claim jsonb; second_claim jsonb; delivery uuid; begin
  first_claim := public.claim_marketplace_email_deliveries('73000000-0000-4000-8000-000000000001',1);
  if jsonb_array_length(first_claim) <> 1 or first_claim->0->>'recipient_email' <> 's7-buyer-a@example.invalid' then raise exception 'Trusted claim payload/recipient failed'; end if;
  delivery := (first_claim->0->>'delivery_id')::uuid;
  second_claim := public.claim_marketplace_email_deliveries('73000000-0000-4000-8000-000000000002',1);
  if jsonb_array_length(second_claim) <> 0 then raise exception 'Concurrent worker double-claimed delivery'; end if;
  if public.fail_marketplace_email_delivery(delivery,'73000000-0000-4000-8000-000000000001',true,'transport','qa_timeout') <> 'retry' then raise exception 'Retryable failure was not retained'; end if;
  insert into qa_s7_delivery values(delivery);
end $$;
reset role;
update laria_private.marketplace_email_deliveries set next_attempt_at=clock_timestamp() where id=(select id from qa_s7_delivery);
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ declare second_claim jsonb; delivery uuid := (select id from qa_s7_delivery); begin
  second_claim := public.claim_marketplace_email_deliveries('73000000-0000-4000-8000-000000000002',1);
  if (second_claim->0->>'delivery_id')::uuid <> delivery then raise exception 'Retry created another delivery'; end if;
  perform public.complete_marketplace_email_delivery(delivery,'73000000-0000-4000-8000-000000000002','provider-qa-1');
end $$;
reset role;
do $$ declare delivery uuid := (select id from qa_s7_delivery); begin if (select attempt_count from laria_private.marketplace_email_deliveries where id=delivery) <> 2 then raise exception 'Retry count incorrect'; end if; end $$;

-- Pause suppresses undelivered history and never backfills it on resume.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare alert_id uuid; begin
  select id into alert_id from public.saved_search_alerts;
  perform public.set_saved_search_alert_status(alert_id,false);
  if (select status from public.saved_search_alerts where id=alert_id) <> 'paused' then raise exception 'Alert did not pause'; end if;
end $$;
reset role;
insert into public.listings(id,slug,title,seller_type,status,category,instrument_type,attributes,brand,model,condition,price_pen,city,region,whatsapp_phone,description,owner_user_id,marketplace_rules_accepted_at)
values('72000000-0000-4000-8000-000000000003','s7-during-pause','Fender pausa','individual','pending','guitars','electric_guitar','{"body_type":"solid_body","pickups":["single_coil"]}','Fender','Pausa','Usado - buen estado',1800,'Lima','Lima','51999997001','Descripción válida durante la pausa que no debe volver al reactivar.','71000000-0000-4000-8000-000000000001',now());
insert into public.listing_photos(listing_id,image_url,sort_order) values
 ('72000000-0000-4000-8000-000000000003','https://example.invalid/pause-0.jpg',0),
 ('72000000-0000-4000-8000-000000000003','https://example.invalid/pause-1.jpg',1);
update public.listings set status='approved',published_at=now() where id='72000000-0000-4000-8000-000000000003';
do $$ begin
  if exists(select 1 from laria_private.search_alert_matches match join public.saved_search_alerts alert on alert.id=match.alert_id where alert.user_id='71000000-0000-4000-8000-000000000002' and match.listing_id='72000000-0000-4000-8000-000000000003') then raise exception 'Paused alert captured match'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare alert_id uuid; begin select id into alert_id from public.saved_search_alerts; perform public.set_saved_search_alert_status(alert_id,true); end $$;
reset role;
insert into public.listings(id,slug,title,seller_type,status,category,instrument_type,attributes,brand,model,condition,price_pen,city,region,whatsapp_phone,description,owner_user_id,marketplace_rules_accepted_at)
values('72000000-0000-4000-8000-000000000004','s7-after-resume','Fender reactivada','individual','pending','guitars','electric_guitar','{"body_type":"solid_body","pickups":["single_coil"]}','Fender','Reactivada','Usado - buen estado',1700,'Lima','Lima','51999997001','Descripción válida después de reactivar para nueva coincidencia futura.','71000000-0000-4000-8000-000000000001',now());
insert into public.listing_photos(listing_id,image_url,sort_order) values
 ('72000000-0000-4000-8000-000000000004','https://example.invalid/resume-0.jpg',0),
 ('72000000-0000-4000-8000-000000000004','https://example.invalid/resume-1.jpg',1);
update public.listings set status='approved',published_at=now() where id='72000000-0000-4000-8000-000000000004';
do $$ begin
  if not exists(select 1 from laria_private.search_alert_matches match join public.saved_search_alerts alert on alert.id=match.alert_id where alert.user_id='71000000-0000-4000-8000-000000000002' and match.listing_id='72000000-0000-4000-8000-000000000004') then raise exception 'Resumed alert missed future match'; end if;
end $$;

-- A pause racing a claimed alert job cancels the claim and prevents a stale
-- worker from committing it as sent or retrying it.
update laria_private.marketplace_email_deliveries
set status='processing', attempt_count=attempt_count+1, last_attempt_at=now(), locked_at=now(), locked_by='73000000-0000-4000-8000-000000000003'
where event_type='search_alert_immediate' and listing_id='72000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare alert_id uuid; begin select id into alert_id from public.saved_search_alerts; perform public.set_saved_search_alert_status(alert_id,false); end $$;
reset role;
do $$ declare delivery uuid; stale_commit_denied boolean := false; begin
  select id into delivery from laria_private.marketplace_email_deliveries where event_type='search_alert_immediate' and listing_id='72000000-0000-4000-8000-000000000004';
  if (select status from laria_private.marketplace_email_deliveries where id=delivery) <> 'cancelled' then raise exception 'Pause did not cancel claimed job'; end if;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  begin perform public.complete_marketplace_email_delivery(delivery,'73000000-0000-4000-8000-000000000003','stale-provider-id'); exception when others then stale_commit_denied := sqlerrm like '%EMAIL_DELIVERY_CLAIM_INVALID%'; end;
  if not stale_commit_denied then raise exception 'Stale worker committed cancelled alert email'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare alert_id uuid; begin select id into alert_id from public.saved_search_alerts; perform public.set_saved_search_alert_status(alert_id,true); end $$;
reset role;

-- Store activation is the public boundary for already-approved inventory.
insert into public.stores(id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,is_verified)
values('74000000-0000-4000-8000-000000000001','s7-store','Tienda S7','Tienda S7 SAC','20777777777','store@example.invalid','Tienda S7','Tienda S7','51999997004','Lima','Lima','Av. S7 700','71000000-0000-4000-8000-000000000004','pending',false);
insert into public.listings(id,slug,title,seller_type,status,category,instrument_type,attributes,brand,condition,price_pen,city,region,whatsapp_phone,description,owner_user_id,store_id)
values('72000000-0000-4000-8000-000000000005','s7-store-pending-parent','Guitarra tienda pendiente','store','approved','guitars','electric_guitar','{}','Ibanez','Nuevo',2500,'Lima','Lima','51999997004','Descripción válida de inventario aprobado con tienda todavía pendiente.','71000000-0000-4000-8000-000000000004','74000000-0000-4000-8000-000000000001');
do $$ begin if exists(select 1 from laria_private.search_alert_matches where listing_id='72000000-0000-4000-8000-000000000005') then raise exception 'Inactive store inventory leaked into alerts'; end if; end $$;
select set_config('app.allow_store_admin_fields','true',true);
update public.stores set status='active' where id='74000000-0000-4000-8000-000000000001';
do $$ begin
  if (select count(*) from laria_private.search_alert_matches where listing_id='72000000-0000-4000-8000-000000000005') <> 1 then raise exception 'Store activation did not establish first public match'; end if;
end $$;

-- Verified direct publication and a relisted identity each qualify once.
update public.stores set is_verified=true where id='74000000-0000-4000-8000-000000000001';
insert into public.listings(id,slug,title,seller_type,status,category,instrument_type,attributes,brand,condition,price_pen,city,region,whatsapp_phone,description,owner_user_id,store_id)
values
 ('72000000-0000-4000-8000-000000000006','s7-verified-direct','Guitarra directa','store','approved','guitars','electric_guitar','{}','Ibanez','Nuevo',2400,'Lima','Lima','51999997004','Descripción válida de publicación directa de Tienda Verificada.','71000000-0000-4000-8000-000000000004','74000000-0000-4000-8000-000000000001'),
 ('72000000-0000-4000-8000-000000000007','s7-relist-new-id','Fender relistada','individual','approved','guitars','electric_guitar','{"body_type":"solid_body","pickups":["single_coil"]}','Fender','Usado - buen estado',1600,'Lima','Lima','51999997001','Descripción válida de nueva identidad relistada para la alerta activa.','71000000-0000-4000-8000-000000000001',null);
do $$ begin
  if (select count(*) from laria_private.search_alert_matches where listing_id='72000000-0000-4000-8000-000000000006') <> 1 then raise exception 'Verified direct publication missed alert'; end if;
  if (select count(*) from laria_private.search_alert_matches where listing_id='72000000-0000-4000-8000-000000000007') <> 2 then raise exception 'Relist identity did not qualify'; end if;
end $$;

-- Daily digest is one alert/date job, includes each match once, and sends no empty job.
update laria_private.search_alert_matches match
set matched_local_date = (clock_timestamp() at time zone 'America/Lima')::date - 1
from public.saved_search_alerts alert
where alert.id=match.alert_id and alert.user_id='71000000-0000-4000-8000-000000000003'
  and match.delivery_id is null and match.suppressed_at is null;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ declare digest_date date := (clock_timestamp() at time zone 'America/Lima')::date - 1; prepared integer; replay integer; empty integer; begin
  prepared := public.prepare_daily_search_alert_emails(digest_date,100);
  replay := public.prepare_daily_search_alert_emails(digest_date,100);
  empty := public.prepare_daily_search_alert_emails(digest_date - 1,100);
  if prepared <> 1 or replay <> 0 or empty <> 0 then raise exception 'Daily prepare/replay/empty behavior failed: %, %, %',prepared,replay,empty; end if;
end $$;
reset role;
do $$ declare delivery uuid; payload jsonb; begin
  select id into delivery from laria_private.marketplace_email_deliveries where event_type='search_alert_daily';
  payload := laria_private.marketplace_email_payload((select delivery_row from laria_private.marketplace_email_deliveries delivery_row where id=delivery));
  if jsonb_array_length(payload#>'{search_alert,matches}') < 2 then raise exception 'Daily digest did not bundle matches'; end if;
  if (select count(*) from laria_private.search_alert_matches where delivery_id=delivery) <> (select count(distinct listing_id) from laria_private.search_alert_matches where delivery_id=delivery) then raise exception 'Daily digest repeated listing'; end if;
end $$;

-- Lifecycle notifications enqueue prospectively and preserve trusted recipient/context.
reset role;
insert into public.notifications(user_id,event_type,message,listing_id)
values
 ('71000000-0000-4000-8000-000000000001','listing_approved','Aprobada','72000000-0000-4000-8000-000000000001'),
 ('71000000-0000-4000-8000-000000000001','listing_rejected','Rechazada','72000000-0000-4000-8000-000000000002');
insert into public.notifications(user_id,event_type,message,store_id)
values
 ('71000000-0000-4000-8000-000000000004','store_approved','Aprobada','74000000-0000-4000-8000-000000000001'),
 ('71000000-0000-4000-8000-000000000004','store_verified','Verificada','74000000-0000-4000-8000-000000000001'),
 ('71000000-0000-4000-8000-000000000004','store_verification_revoked','Revocada','74000000-0000-4000-8000-000000000001');
do $$ begin
  if (select count(*) from laria_private.marketplace_email_deliveries where event_type in ('listing_approved','listing_rejected')) <> 2 then raise exception 'Listing lifecycle email queue incomplete'; end if;
  if (select count(*) from laria_private.marketplace_email_deliveries where event_type in ('store_approved','store_verified','store_verification_revoked')) <> 3 then raise exception 'Store lifecycle email queue incomplete'; end if;
end $$;

-- Authoritative favorite transition creates one recipient/transition email job.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.set_listing_favorite('72000000-0000-4000-8000-000000000001',true);
reset role;
select set_config('app.allow_listing_admin_fields','true',true);
update public.listings set price_pen=1500 where id='72000000-0000-4000-8000-000000000001';
update public.listings set price_pen=1500 where id='72000000-0000-4000-8000-000000000001';
do $$ begin
  if (select count(*) from laria_private.marketplace_email_deliveries where event_type='listing_price_drop') <> 1 then raise exception 'Price-drop delivery repeated or missing'; end if;
  if not exists(select 1 from laria_private.marketplace_email_deliveries where event_type='listing_price_drop' and context->>'old_price_pen'='2000' and context->>'new_price_pen'='1500') then raise exception 'Price-drop authoritative context missing'; end if;
end $$;
update public.listings set price_pen=1400 where id='72000000-0000-4000-8000-000000000001';
do $$ begin if (select count(*) from laria_private.marketplace_email_deliveries where event_type='listing_price_drop') <> 2 then raise exception 'Later price transition did not qualify'; end if; end $$;

-- Canonical transaction records drive the account badge, not notifications.
insert into public.transaction_claims(id,listing_id,seller_user_id,buyer_user_id,attribution_type,status)
values('75000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003','laria','pending');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin if public.get_pending_buyer_confirmation_count() <> 1 then raise exception 'Pending buyer badge ignored canonical claim'; end if; end $$;
reset role;
update public.transaction_claims set status='declined',responded_at=now(),ended_at=now() where id='75000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin if public.get_pending_buyer_confirmation_count() <> 0 then raise exception 'Pending buyer badge did not clear'; end if; end $$;
reset role;

-- Delete hides the alert, stops future work, but retains delivery history.
create temporary table qa_s7_delete(alert_id uuid primary key, history integer) on commit drop;
insert into qa_s7_delete
select alert.id, count(delivery.id)::integer
from public.saved_search_alerts alert
left join laria_private.marketplace_email_deliveries delivery on delivery.search_alert_id=alert.id
where alert.user_id='71000000-0000-4000-8000-000000000002'
group by alert.id;
grant select on qa_s7_delete to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare alert_id uuid := (select alert_id from qa_s7_delete); begin
  perform public.delete_saved_search_alert(alert_id);
  if exists(select 1 from public.saved_search_alerts) then raise exception 'Deleted alert remains user-visible'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from laria_private.marketplace_email_deliveries where search_alert_id=(select alert_id from qa_s7_delete)) <> (select history from qa_s7_delete) then raise exception 'Alert deletion erased delivery history'; end if;
end $$;

rollback;
