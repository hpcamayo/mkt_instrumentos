-- Effortless Laria, batch "my-listings": lifecycle, drafts, rejection reasons, vacation mode, buyer check-ins,
-- reminders, Pendientes and statistics. Local/test database only. Every fixture is rolled back.
begin;

-- Anonymous callers are denied every new RPC.
set local role anon;
do $$ declare denied integer := 0; probe uuid := '70000000-0000-4000-8000-000000000000'; begin
  begin perform public.copy_owned_listing(probe, 'duplicate'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.set_owned_listing_price(probe, 100); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.set_owned_listings_lifecycle_bulk(array[probe], 'hide'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.set_owned_listings_pause(null); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.confirm_listing_available(probe); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.get_purchase_checkin(probe); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.answer_purchase_checkin(probe, true); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.decide_purchase_checkin(probe, true); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.get_account_pendientes(); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.get_listing_statistics(30); exception when insufficient_privilege then denied := denied + 1; end;
  if denied <> 10 then raise exception 'Anonymous my-listings RPC guard failed: %', denied; end if;
end $$;
reset role;

insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
 ('71000000-0000-4000-8000-000000000001','authenticated','authenticated','ml-seller@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"seller","full_name":"Vendedora ML","phone":"51999997001","city":"Lima","region":"Lima"}'),
 ('71000000-0000-4000-8000-000000000002','authenticated','authenticated','ml-buyer@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"seller","full_name":"Comprador ML","phone":"+51 999 997 321","city":"Lima","region":"Lima"}'),
 ('71000000-0000-4000-8000-000000000003','authenticated','authenticated','ml-other@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"seller","full_name":"Otra Persona","phone":"51999997003","city":"Lima","region":"Lima"}'),
 ('71999999-0000-4000-8000-000000000099','authenticated','authenticated','ml-admin@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{"role":"admin"}','{"account_type":"seller","full_name":"Admin ML","phone":"51999997999","city":"Lima","region":"Lima"}');

-- 1 approved, 2 approved then owner-hidden, 3 pending, 4 sold (relist source), 5 pending (rejection),
-- 6 approved (check-in), 7 approved and old (availability).
insert into public.listings(id,slug,title,seller_type,status,category,instrument_type,attributes,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,created_by_source,marketplace_rules_accepted_at)
select ('73000000-0000-4000-8000-00000000000'||n)::uuid,'ml-listing-'||n,'Guitarra ML '||n,'individual','pending','guitars','electric_guitar','{}','QA','ML','Usado - buen estado',1000+n,'Lima','Lima','Vendedora ML','51999997001',
       'Descripción válida y suficientemente extensa para la publicación ML número '||n||'.','71000000-0000-4000-8000-000000000001','self_service',now()
from generate_series(1,7) n;
insert into public.listing_photos(listing_id,image_url,sort_order)
select l.id,'https://example.invalid/'||l.id||'-'||p.n||'.jpg',p.n from public.listings l cross join (values(0),(1)) p(n)
where l.owner_user_id='71000000-0000-4000-8000-000000000001';

select set_config('app.allow_listing_admin_fields','true',true);
update public.listings set status='approved',published_at=now() where id in
 ('73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000004',
  '73000000-0000-4000-8000-000000000006','73000000-0000-4000-8000-000000000007');
update public.listings set published_at=now()-interval '40 days' where id='73000000-0000-4000-8000-000000000007';
select set_config('app.allow_listing_admin_fields','',true);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

-- Protected owner state cannot be written directly (RLS has no owner UPDATE, and the trigger guards it too).
do $$ begin
  update public.listings set paused_until=current_date+5 where id='73000000-0000-4000-8000-000000000001';
  if exists (select 1 from public.listings where id='73000000-0000-4000-8000-000000000001' and paused_until is not null) then
    raise exception 'Owner wrote paused_until directly';
  end if;
end $$;

-- mine-07: hidden -> sold, pending -> withdrawn as sold, admin-hidden stays blocked.
select public.set_owned_listing_lifecycle('73000000-0000-4000-8000-000000000002','hide');
do $$ declare result public.listings; begin
  result := public.set_owned_listing_lifecycle('73000000-0000-4000-8000-000000000002','sold');
  if result.status <> 'sold' or result.sold_at is null then raise exception 'Hidden listing was not marked sold'; end if;
  result := public.set_owned_listing_lifecycle('73000000-0000-4000-8000-000000000003','withdraw_sold');
  if result.status <> 'archived' or result.sold_at is null or result.archived_at is null then raise exception 'Pending listing was not withdrawn as sold'; end if;
  if public.listing_is_public(result.id) then raise exception 'Withdrawn listing is public'; end if;
  begin
    perform public.set_owned_listing_lifecycle('73000000-0000-4000-8000-000000000001','withdraw_sold');
    raise exception 'Approved listing was withdrawn';
  exception when raise_exception then
    if sqlerrm not like 'LISTING_WITHDRAW_INVALID%' then raise; end if;
  end;
end $$;

-- mine-10 / shop-08: drafts with a clean address and the same photos.
select public.set_owned_listing_lifecycle('73000000-0000-4000-8000-000000000004','sold');
do $$ declare relist public.listings; duplicate public.listings; begin
  relist := public.copy_owned_listing('73000000-0000-4000-8000-000000000004','relist');
  if relist.status <> 'draft' or relist.relisted_from_listing_id <> '73000000-0000-4000-8000-000000000004'
    or relist.slug like '%republicado%' or relist.slug <> 'guitarra-ml-4-' || relist.id then
    raise exception 'Relist draft is wrong: % %', relist.status, relist.slug;
  end if;
  if (select count(*) from public.listing_photos where listing_id = relist.id) <> 2 then raise exception 'Relist photos were not copied'; end if;
  duplicate := public.copy_owned_listing('73000000-0000-4000-8000-000000000001','duplicate');
  if duplicate.status <> 'draft' or duplicate.relisted_from_listing_id is not null then raise exception 'Duplicate draft is wrong'; end if;
  begin
    perform public.copy_owned_listing('73000000-0000-4000-8000-000000000001','relist');
    raise exception 'Relisted an unsold listing';
  exception when raise_exception then
    if sqlerrm not like 'LISTING_RELIST_INVALID%' then raise; end if;
  end;
  -- The draft is sent with the normal submission and goes to review.
  if (public.submit_listing_for_publication(duplicate.id)).status <> 'pending' then raise exception 'Draft did not go to review'; end if;
end $$;

-- mine-04: inline price and bulk hide/restore.
do $$ declare result jsonb; begin
  if (public.set_owned_listing_price('73000000-0000-4000-8000-000000000001', 900)).price_pen <> 900 then raise exception 'Inline price failed'; end if;
  result := public.set_owned_listings_lifecycle_bulk(array['73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000004']::uuid[], 'hide');
  if jsonb_array_length(result->'changed') <> 1 or jsonb_array_length(result->'failed') <> 1 then raise exception 'Bulk hide result: %', result; end if;
  result := public.set_owned_listings_lifecycle_bulk(array['73000000-0000-4000-8000-000000000001']::uuid[], 'restore');
  if jsonb_array_length(result->'changed') <> 1 then raise exception 'Bulk restore result: %', result; end if;
end $$;

-- mine-12: pause and resume.
do $$ declare result jsonb; begin
  result := public.set_owned_listings_pause(((now() at time zone 'America/Lima')::date + 10));
  if (result->>'listings')::int < 3 then raise exception 'Pause touched too few listings: %', result; end if;
  if not public.listing_is_paused((select paused_until from public.listings where id='73000000-0000-4000-8000-000000000001')) then raise exception 'Listing is not paused'; end if;
  begin perform public.set_owned_listings_pause(((now() at time zone 'America/Lima')::date + 120)); raise exception 'Accepted a pause over 90 days';
  exception when raise_exception then if sqlerrm not like 'LISTING_PAUSE_INVALID%' then raise; end if; end;
  perform public.set_owned_listings_pause(null);
  if exists (select 1 from public.listings where owner_user_id = auth.uid() and paused_until is not null) then raise exception 'Resume left a pause'; end if;
end $$;
reset role;

-- mine-03: rejection codes, readable reason and the checklist; cleared on resubmission.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71999999-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}',true);
do $$ declare result public.listings; begin
  result := public.review_listing('73000000-0000-4000-8000-000000000005','reject',' Sube una foto del mástil ',array['falta_reverso','precio_incoherente','falta_reverso']);
  if result.rejection_codes <> array['falta_reverso','precio_incoherente']
    or result.rejection_reason <> 'Falta una foto del reverso o de los detalles; El precio no es coherente con el equipo. Nota: Sube una foto del mástil' then
    raise exception 'Rejection reason: % / %', result.rejection_codes, result.rejection_reason;
  end if;
  begin perform public.review_listing('73000000-0000-4000-8000-000000000003','reject',null,array['inventado']); raise exception 'Accepted an unknown code';
  exception when raise_exception then if sqlerrm not like 'LISTING_REJECTION_CODE_INVALID%' then raise; end if; end;
  -- The three-argument call of older callers still works.
  begin perform public.review_listing('73000000-0000-4000-8000-000000000005','reject','Otra vez'); raise exception 'Rejected a non-pending listing';
  exception when raise_exception then if sqlerrm not like 'LISTING_REJECTION_REASON_REQUIRED%' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare result public.listings; begin
  result := public.submit_listing_for_publication('73000000-0000-4000-8000-000000000005');
  if result.status <> 'pending' or result.rejection_reason is not null or result.rejection_codes is not null then raise exception 'Resubmission kept the rejection'; end if;
end $$;
reset role;

-- big-08: a buyer who contacted listing 6 answers "Sí"; the seller confirms; the sale is verified.
insert into public.marketplace_events(event_type,listing_id,seller_user_id,actor_user_id,session_id,source,created_at) values
 ('whatsapp_contact','73000000-0000-4000-8000-000000000006','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002',gen_random_uuid(),'detail',now()-interval '4 days'),
 ('whatsapp_contact','73000000-0000-4000-8000-000000000006','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003',gen_random_uuid(),'detail',now()-interval '5 days');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
  if public.get_purchase_checkin('73000000-0000-4000-8000-000000000001') is not null then raise exception 'Check-in without a contact'; end if;
  if public.get_purchase_checkin('73000000-0000-4000-8000-000000000006') ->> 'answer' is not null then raise exception 'Unanswered check-in has an answer'; end if;
  if jsonb_array_length(public.get_account_pendientes() #> '{buyer,purchase_checks}') <> 1 then raise exception 'Buyer Pendientes lacks the purchase check'; end if;
  perform public.answer_purchase_checkin('73000000-0000-4000-8000-000000000006', false);
  if jsonb_array_length(public.get_account_pendientes() #> '{buyer,purchase_checks}') <> 0 then raise exception '"No" did not stop the question'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
  begin perform public.answer_purchase_checkin('73000000-0000-4000-8000-000000000001', true); raise exception 'Answered without a contact';
  exception when raise_exception then if sqlerrm not like 'TRANSACTION_BUYER_NOT_ELIGIBLE%' then raise; end if; end;
  perform public.answer_purchase_checkin('73000000-0000-4000-8000-000000000006', true);
  perform public.answer_purchase_checkin('73000000-0000-4000-8000-000000000006', true);
end $$;
reset role;
do $$ begin
  if (select count(*) from public.notifications where user_id='71000000-0000-4000-8000-000000000001' and event_type='listing_buyer_reported_purchase') <> 1 then
    raise exception 'Seller was not notified exactly once';
  end if;
  if not exists (select 1 from laria_private.marketplace_email_deliveries where event_type='listing_buyer_reported_purchase' and recipient_user_id='71000000-0000-4000-8000-000000000001') then
    raise exception 'Seller e-mail was not queued';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
  -- Another account cannot see or decide the report.
  if exists (select 1 from public.purchase_checkins where buyer_user_id='71000000-0000-4000-8000-000000000002') then raise exception 'Check-in leaked to another account'; end if;
  begin perform public.decide_purchase_checkin((select id from public.purchase_checkins where answer='no' limit 1), true); raise exception 'Decided a "No"';
  exception when raise_exception then if sqlerrm not like 'TRANSACTION_NOT_ACCESSIBLE%' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare report jsonb; result jsonb; buyers jsonb; detail jsonb; begin
  report := public.get_account_pendientes() #> '{seller,buyer_reports,0}';
  if report is null or report->>'buyer_name' <> 'Comprador ML' then raise exception 'Seller Pendientes lacks the buyer report: %', public.get_account_pendientes()->'seller'; end if;
  result := public.decide_purchase_checkin((report->>'checkin_id')::uuid, true);
  if result->>'decision' <> 'confirmed' or result->>'transaction_id' is null then raise exception 'Decision: %', result; end if;
  if (select status from public.listings where id='73000000-0000-4000-8000-000000000006') <> 'sold' then raise exception 'Listing was not marked sold'; end if;
  if public.get_transaction_detail((result->>'transaction_id')::uuid)->>'state' <> 'verified' then raise exception 'No verified transaction'; end if;
  -- A repeat returns the same decision.
  if public.decide_purchase_checkin((report->>'checkin_id')::uuid, true)->>'claim_id' <> result->>'claim_id' then raise exception 'Repeat decision changed'; end if;
  -- trust-04: first verified sale; mine-09: last three digits only.
  detail := public.get_transaction_detail((result->>'transaction_id')::uuid);
  if (detail->>'seller_verified_sales')::int <> 1 then raise exception 'seller_verified_sales: %', detail->'seller_verified_sales'; end if;
  buyers := public.get_eligible_transaction_buyers('73000000-0000-4000-8000-000000000006');
  if buyers #>> '{0,phone_last3}' <> '003' or buyers::text like '%999997003%' then raise exception 'Buyer cards: %', buyers; end if;
  -- Reviews due shows for the seller.
  if jsonb_array_length(public.get_account_pendientes() #> '{buyer,reviews_due}') <> 1 then raise exception 'Seller review not due'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
  if (public.get_transaction_detail((public.get_account_pendientes() #>> '{buyer,reviews_due,0,reference_id}')::uuid) ->> 'seller_verified_sales') is not null then
    raise exception 'Buyer sees the seller''s count';
  end if;
end $$;
reset role;

-- trust-01 / mine-08 / big-08: the daily run, and nothing twice.
insert into public.marketplace_events(event_type,listing_id,seller_user_id,actor_user_id,session_id,source,created_at) values
 ('whatsapp_contact','73000000-0000-4000-8000-000000000007','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003',gen_random_uuid(),'detail',now()-interval '6 days');
update public.verified_transactions set verified_at=now()-interval '8 days', review_deadline=now()-interval '8 days'+interval '10 days'
where listing_id='73000000-0000-4000-8000-000000000006';
do $$ declare first_run jsonb; second_run jsonb; begin
  first_run := laria_private.run_my_listings_reminders();
  second_run := laria_private.run_my_listings_reminders();
  if (first_run->>'purchase_checks')::int < 1 or (first_run->>'availability_checkins')::int < 1 or (first_run->>'review_reminders')::int < 2 then
    raise exception 'First run: %', first_run;
  end if;
  if (second_run->>'purchase_checks')::int <> 0 or (second_run->>'availability_checkins')::int <> 0 or (second_run->>'review_reminders')::int <> 0 then
    raise exception 'Second run repeated: %', second_run;
  end if;
  if not exists (select 1 from public.notifications where event_type='listing_availability_checkin' and listing_id='73000000-0000-4000-8000-000000000007') then
    raise exception 'No availability check-in for the old listing';
  end if;
  if not exists (select 1 from laria_private.marketplace_email_deliveries where event_type='listing_review_reminder') then raise exception 'No review reminder e-mail'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare stats jsonb; begin
  if jsonb_array_length(public.get_account_pendientes() #> '{seller,availability}') <> 1 then raise exception 'Availability not pending'; end if;
  perform public.confirm_listing_available('73000000-0000-4000-8000-000000000007');
  if jsonb_array_length(public.get_account_pendientes() #> '{seller,availability}') <> 0 then raise exception '"Sí" did not clear the check-in'; end if;
  stats := public.get_listing_statistics(30);
  if jsonb_array_length(stats->'weekly') <> 12 or (stats #>> '{contacts_without_sale,count}')::int <> 1 then raise exception 'Statistics: %', stats - 'listings'; end if;
  begin perform public.get_listing_statistics(12); raise exception 'Accepted a 12-day window';
  exception when raise_exception then if sqlerrm not like 'ANALYTICS_WINDOW_INVALID%' then raise; end if; end;
end $$;
reset role;

-- The revision-rejected e-mail carries the reason.
insert into public.listing_revisions(listing_id,owner_user_id,status,changed_fields,title,category,submitted_at,reviewed_at,rejection_reason)
values('73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','rejected',array['title'],'Otro título','guitars',now(),now(),'Título engañoso');
insert into public.notifications(user_id,event_type,message,listing_id) values
 ('71000000-0000-4000-8000-000000000001','listing_revision_rejected','Rechazada','73000000-0000-4000-8000-000000000001');
do $$ begin
  if (select context->>'reason' from laria_private.marketplace_email_deliveries
      where event_type='listing_revision_rejected' and listing_id='73000000-0000-4000-8000-000000000001') <> 'Título engañoso' then
    raise exception 'Revision e-mail lacks the reason';
  end if;
end $$;

-- The schedule exists.
do $$ begin
  if not exists (select 1 from cron.job where jobname='ux-my-listings-reminders' and schedule='0 14 * * *') then raise exception 'Reminder job is not scheduled'; end if;
end $$;

rollback;
