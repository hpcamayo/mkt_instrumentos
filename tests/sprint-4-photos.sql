-- Local rollback-only proof of private photo provenance, admin promotion and
-- retirement safety. HTTP/storage-byte coverage lives in photos.integration.cjs.
begin;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values ('64000000-0000-4000-8000-000000000001','authenticated','authenticated','s4-photo-sql@example.invalid','{}',
 '{"account_type":"seller","full_name":"Fotos SQL","phone":"51999999401","city":"Lima","region":"Lima"}');
insert into public.listings(id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,created_by_source,marketplace_rules_accepted_at,published_at)
values ('64000000-0000-4000-8000-000000000002','s4-photo-sql','Fotos SQL','individual','approved','guitars','electric_guitar','Yamaha','QA','Usado - buen estado',1200,'Lima','Lima','Fotos SQL','51999999401','Descripción temporal suficientemente larga para verificar las fotos SQL.','64000000-0000-4000-8000-000000000001','self_service',now(),now());
insert into public.listing_photos(listing_id,image_url,sort_order)
values ('64000000-0000-4000-8000-000000000002','https://example.invalid/a.jpg',0),('64000000-0000-4000-8000-000000000002','https://example.invalid/b.jpg',1);
insert into storage.objects(bucket_id,name,owner_id,metadata)
values ('listing-edit-photos','64000000-0000-4000-8000-000000000001/listing-edits/64000000-0000-4000-8000-000000000002/64000000-0000-4000-8000-000000000003/2.png','64000000-0000-4000-8000-000000000001','{"size":100,"mimetype":"image/png"}');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"64000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare result jsonb; replay jsonb; denied boolean := false; photos jsonb := '[{"image_url":"https://example.invalid/a.jpg"},{"image_url":"https://example.invalid/b.jpg"},{"image_url":"/api/listing-images/64000000-0000-4000-8000-000000000001/listing-edits/64000000-0000-4000-8000-000000000002/64000000-0000-4000-8000-000000000003/2.png"}]'; begin
 result := public.update_owned_listing('64000000-0000-4000-8000-000000000002','{}','{"title":"Propuesta SQL"}',null);
 result := public.update_owned_listing('64000000-0000-4000-8000-000000000002','{}','{}',photos,'64000000-0000-4000-8000-000000000004');
 replay := public.update_owned_listing('64000000-0000-4000-8000-000000000002','{}','{}',photos,'64000000-0000-4000-8000-000000000004');
 if result <> replay or (result->>'revision_version')::integer <> 2 then raise exception 'Retry receipt changed proposal/version'; end if;
 begin perform public.update_owned_listing('64000000-0000-4000-8000-000000000002','{}','{"title":"Changed retry"}',photos,'64000000-0000-4000-8000-000000000004');
 exception when others then denied := sqlerrm like 'LISTING_EDIT_RETRY_CHANGED%'; end;
 if not denied then raise exception 'Changed retry was accepted'; end if;
 if (select count(*) from public.listing_photos where listing_id='64000000-0000-4000-8000-000000000002') <> 2 then raise exception 'Proposal leaked into live photos'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"64000000-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}',true);
do $$ declare revision_id uuid; begin
 select id into revision_id from public.listing_revisions where listing_id='64000000-0000-4000-8000-000000000002' and status='pending';
 perform public.review_listing_revision(revision_id,'approve',2,null);
 if (select count(*) from public.listing_photos where listing_id='64000000-0000-4000-8000-000000000002') <> 3 then raise exception 'Admin did not promote owner upload'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 if exists(select 1 from public.listing_revisions where listing_id='64000000-0000-4000-8000-000000000002') then raise exception 'Revision history exposed anonymously'; end if;
 if has_function_privilege('anon','public.claim_listing_photo_cleanup(uuid,uuid,text,text[])','EXECUTE') then raise exception 'Anonymous cleanup authority'; end if;
 if has_function_privilege('authenticated','public.apply_owned_listing_edit(uuid,jsonb,jsonb,jsonb)','EXECUTE') then raise exception 'Uncontrolled edit core exposed'; end if;
end $$;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ declare claimed text[]; path text := '64000000-0000-4000-8000-000000000001/listing-edits/64000000-0000-4000-8000-000000000002/64000000-0000-4000-8000-000000000003/2.png'; begin
 claimed := public.claim_listing_photo_cleanup('64000000-0000-4000-8000-000000000002','64000000-0000-4000-8000-000000000001','listing-edit-photos',array[path]);
 if cardinality(claimed) <> 0 then raise exception 'Live/audit object was claimed for deletion'; end if;
 claimed := public.claim_listing_photo_cleanup('64000000-0000-4000-8000-000000000002','64000000-0000-4000-8000-000000000001','listing-edit-photos',array[replace(path,'2.png','9.png')]);
 if cardinality(claimed) <> 1 then raise exception 'Exclusive orphan not retired'; end if;
end $$;
reset role;
do $$ begin
 if (select public from storage.buckets where id='listing-edit-photos') then raise exception 'Staged bucket is public'; end if;
 if (select length(payload_hash) from public.listing_edit_attempts where attempt_id='64000000-0000-4000-8000-000000000004') <> 64 then raise exception 'Receipt must use SHA-256'; end if;
end $$;
rollback;
