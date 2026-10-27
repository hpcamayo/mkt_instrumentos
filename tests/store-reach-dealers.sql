-- Feature ideas, batch "store-reach" (docs/feature-ideas/store-reach.md): reach-04 "Distribuidor oficial".
-- Covers the owner's request and upload slot, the server's check, Admin's review (audited, notified, stale-safe),
-- withdrawal, expiry and what the public sees. Local/test database only; rolled back.
begin;

create function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_code in sqlerrm) = 1 then return; end if;
    raise exception 'Expected % from [%], got: % (%)', p_code, p_sql, sqlerrm, sqlstate;
  end;
  raise exception 'Expected % from [%], but it succeeded', p_code, p_sql;
end $$;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;

create function pg_temp.as_user(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_admin() returns void language sql as $$
  select set_config('request.jwt.claims',
    '{"sub":"e1000000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal2","app_metadata":{"role":"admin"}}', true);
$$;
create function pg_temp.as_service() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e7420000-0000-4000-8000-0000000000a1','authenticated','authenticated','reach-dealer-owner@example.invalid',now(),'{}','{"account_type":"store_owner"}'),
 ('e7420000-0000-4000-8000-0000000000a2','authenticated','authenticated','reach-dealer-other@example.invalid',now(),'{}','{"account_type":"store_owner"}'),
 ('e7420000-0000-4000-8000-0000000000a3','authenticated','authenticated','reach-dealer-buyer@example.invalid',now(),'{}','{}'),
 ('e1000000-0000-4000-8000-000000000099','authenticated','authenticated','reach-dealer-admin@example.invalid',now(),'{"role":"admin"}','{}')
on conflict (id) do nothing;
insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('e7420000-0000-4000-8000-000000000001','reach-dealer-tienda','Tienda Oficial','Oficial SAC','20999994001','ofi@example.invalid','Contacto','Contacto','51999994001','Arequipa','Arequipa','Av. 1','e7420000-0000-4000-8000-0000000000a1','active','free',true),
 ('e7420000-0000-4000-8000-000000000002','reach-dealer-otra','Otra Tienda','Otra SAC','20999994002','otr@example.invalid','Contacto','Contacto','51999994002','Lima','Lima','Av. 2','e7420000-0000-4000-8000-0000000000a2','pending','free',false);

-- Publications: the store's new Yamaha (spelled as most publications spell it), a used one, and a Particular's Yamaha.
insert into public.listings (id, slug, title, seller_type, status, category, brand, condition, city, region, whatsapp_phone, owner_user_id, store_id, price_pen)
values
 ('e7420000-0000-4000-8000-000000000101', 'reach-dealer-1', 'Yamaha P-45', 'store', 'approved', 'keyboards', 'Yamaha', 'Nuevo', 'Arequipa', 'Arequipa', '51999994001', 'e7420000-0000-4000-8000-0000000000a1', 'e7420000-0000-4000-8000-000000000001', 2100),
 ('e7420000-0000-4000-8000-000000000102', 'reach-dealer-2', 'Yamaha F310', 'store', 'approved', 'guitars', 'Yamaha', 'Usado - buen estado', 'Arequipa', 'Arequipa', '51999994001', 'e7420000-0000-4000-8000-0000000000a1', 'e7420000-0000-4000-8000-000000000001', 400),
 ('e7420000-0000-4000-8000-000000000103', 'reach-dealer-3', 'Yamaha PSR', 'individual', 'approved', 'keyboards', 'YAMAHA', 'Nuevo', 'Lima', 'Lima', '51999994003', 'e7420000-0000-4000-8000-0000000000a3', null, 900);

set local role authenticated;

-- ------------------------------------------------------------------ owner

select pg_temp.as_user('e7420000-0000-4000-8000-0000000000a3');
select pg_temp.expect_error($$select public.request_dealer_authorization_upload('Yamaha', 'carta.pdf', 'application/pdf', 1000)$$, 'STORE_REQUIRED');
select pg_temp.as_user('e7420000-0000-4000-8000-0000000000a2');
select pg_temp.expect_error($$select public.request_dealer_authorization_upload('Yamaha', 'carta.pdf', 'application/pdf', 1000)$$, 'STORE_NOT_ACTIVE');

select pg_temp.as_user('e7420000-0000-4000-8000-0000000000a1');
select pg_temp.expect_error($$select public.request_dealer_authorization_upload('Y', 'carta.pdf', 'application/pdf', 1000)$$, 'DEALER_BRAND_INVALID');
select pg_temp.expect_error($$select public.request_dealer_authorization_upload('Yamaha', 'carta.exe', 'application/x-msdownload', 1000)$$, 'DEALER_DOCUMENT_INVALID');
select pg_temp.expect_error($$select public.request_dealer_authorization_upload('Yamaha', 'carta.pdf', 'application/pdf', 6000000)$$, 'DEALER_DOCUMENT_INVALID');
select pg_temp.expect_error($$select public.request_dealer_authorization_upload('Yamaha', 'carta.pdf', 'application/pdf', 1000, current_date - 30)$$, 'DEALER_VALID_UNTIL_INVALID');

create temp table dealer_ids (name text primary key, id uuid, path text);
grant all on dealer_ids to authenticated, service_role;
do $$ declare first jsonb; second jsonb; begin
  first := public.request_dealer_authorization_upload('  yamaha ', '../../carta Yamaha.pdf', 'application/pdf', 2048, null, 'Carta 2026');
  perform pg_temp.check(first->>'status' = 'awaiting_document' and first->>'brand' = 'Yamaha', format('request opened, usual spelling: %s', first->>'brand'));
  perform pg_temp.check(first->>'document_name' = '....carta Yamaha.pdf', format('name has no slashes: %s', first->>'document_name'));
  perform pg_temp.check(first->'upload'->>'path' = 'e7420000-0000-4000-8000-0000000000a1/' || (first->>'id') || '/autorizacion.pdf', 'path issued under the owner');
  -- Asking again for the same brand replaces the slot still waiting for its file.
  second := public.request_dealer_authorization_upload('yamaha', 'carta.pdf', 'application/pdf', 2048);
  perform pg_temp.check(second->>'id' <> first->>'id', 'new slot');
  perform pg_temp.check((select jsonb_agg(d->>'status' order by d->>'created_at') from jsonb_array_elements(public.get_store_dealer_authorizations()) d)
    @> '["withdrawn", "awaiting_document"]', 'the old slot is withdrawn');
  insert into dealer_ids values ('yamaha', (second->>'id')::uuid, second->'upload'->>'path');
end $$;

-- Storage: the owner may upload the issued path only; nobody else, nothing else.
select pg_temp.check(
  (select count(*) from pg_policies where tablename = 'objects' and policyname = 'Store owners upload their dealer documents') = 1, 'upload policy');
select pg_temp.expect_error($$select public.complete_dealer_authorization_upload((select id from dealer_ids where name = 'yamaha'),
  'e7420000-0000-4000-8000-0000000000a1', 'application/pdf', 2048, repeat('a', 64))$$, 'permission denied');
select pg_temp.expect_error($$select * from public.store_dealer_authorizations$$, 'permission denied');
select pg_temp.expect_error($$insert into storage.objects(bucket_id, name, owner) values ('store-dealer-documents',
  'e7420000-0000-4000-8000-0000000000a1/' || gen_random_uuid() || '/autorizacion.pdf', 'e7420000-0000-4000-8000-0000000000a1')$$, 'new row violates row-level security');
insert into storage.objects(bucket_id, name, owner)
values ('store-dealer-documents', (select path from dealer_ids where name = 'yamaha'), 'e7420000-0000-4000-8000-0000000000a1');
select pg_temp.as_user('e7420000-0000-4000-8000-0000000000a2');
select pg_temp.check(not public.dealer_document_upload_allowed((select path from dealer_ids where name = 'yamaha')), 'another owner cannot upload it');
select pg_temp.as_user('e7420000-0000-4000-8000-0000000000a1');

-- ------------------------------------------------------------------ the server's check

reset role;
set local role service_role;
select pg_temp.as_service();
select pg_temp.expect_error($$select public.complete_dealer_authorization_upload((select id from dealer_ids where name = 'yamaha'),
  'e7420000-0000-4000-8000-0000000000a2', 'application/pdf', 2048, repeat('a', 64))$$, 'DEALER_NOT_FOUND');
select pg_temp.expect_error($$select public.complete_dealer_authorization_upload((select id from dealer_ids where name = 'yamaha'),
  'e7420000-0000-4000-8000-0000000000a1', 'image/png', 2048, repeat('a', 64))$$, 'DEALER_DOCUMENT_INVALID');
select pg_temp.check(public.complete_dealer_authorization_upload((select id from dealer_ids where name = 'yamaha'),
  'e7420000-0000-4000-8000-0000000000a1', 'application/pdf', 1999, repeat('a', 64))->>'status' = 'pending', 'checked and sent to Admin');
select pg_temp.expect_error($$select public.complete_dealer_authorization_upload((select id from dealer_ids where name = 'yamaha'),
  'e7420000-0000-4000-8000-0000000000a1', 'application/pdf', 1999, repeat('a', 64))$$, 'DEALER_NOT_FOUND');
reset role;
set local role authenticated;

select pg_temp.as_user('e7420000-0000-4000-8000-0000000000a1');
select pg_temp.expect_error($$select public.request_dealer_authorization_upload('yamaha', 'otra.pdf', 'application/pdf', 100)$$, 'DEALER_ALREADY_OPEN');
select pg_temp.expect_error($$select public.admin_get_dealer_authorizations()$$, 'ADMIN_REQUIRED');
select pg_temp.expect_error(format('select public.admin_review_dealer_authorization(%L, %L, 1)', (select id from dealer_ids where name = 'yamaha'), 'approve'), 'ADMIN_REQUIRED');
select pg_temp.check(public.get_active_dealer_authorizations() = '[]'::jsonb, 'nothing public before approval');

-- ------------------------------------------------------------------ Admin

select pg_temp.as_admin();
do $$ declare queue jsonb; approved jsonb; v_id uuid := (select id from dealer_ids where name = 'yamaha'); begin
  queue := public.admin_get_dealer_authorizations();
  perform pg_temp.check(jsonb_array_length(queue) = 1 and queue->0->>'store_name' = 'Tienda Oficial' and queue->0->>'store_ruc' = '20999994001',
    'Admin sees the request with the store');
  perform pg_temp.check(public.admin_get_dealer_document(v_id)->>'path' = (select path from dealer_ids where name = 'yamaha'), 'document path');
  perform pg_temp.expect_error(format('select public.admin_review_dealer_authorization(%L, %L, 1)', v_id, 'approve'), 'DEALER_STALE');
  perform pg_temp.expect_error(format('select public.admin_review_dealer_authorization(%L, %L, %s)', v_id, 'reject', (queue->0->>'revision')), 'DEALER_REASON_REQUIRED');
  perform pg_temp.expect_error(format('select public.admin_review_dealer_authorization(%L, %L, %s)', v_id, 'revoke', (queue->0->>'revision')), 'DEALER_REASON_REQUIRED');
  approved := public.admin_review_dealer_authorization(v_id, 'approve', (queue->0->>'revision')::integer, null, current_date + 200);
  perform pg_temp.check(approved->>'status' = 'approved' and (approved->>'active')::boolean, 'approved and in force');
  perform pg_temp.expect_error(format('select public.admin_review_dealer_authorization(%L, %L, %s)', v_id, 'approve', (approved->>'revision')), 'DEALER_STALE');
end $$;

reset role;
select pg_temp.check(exists (select 1 from public.admin_audit_actions a where a.target_id = (select id from dealer_ids where name = 'yamaha')
  and a.action = 'dealer_authorization_approved' and a.target_type = 'dealer_authorization'), 'audited');
select pg_temp.check(exists (select 1 from public.notifications n where n.event_type = 'store_dealer_approved'
  and n.user_id = 'e7420000-0000-4000-8000-0000000000a1' and n.store_id = 'e7420000-0000-4000-8000-000000000001'), 'owner notified');

-- ------------------------------------------------------------------ public

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ declare dealers jsonb; begin
  dealers := public.get_active_dealer_authorizations();
  perform pg_temp.check(jsonb_array_length(dealers) = 1, 'one dealer in force');
  perform pg_temp.check(dealers->0->>'brand' = 'Yamaha' and dealers->0->>'store_slug' = 'reach-dealer-tienda', 'brand and store');
  perform pg_temp.check(dealers->0->'keys' ? 'yamaha', 'matched by its folded spelling');
  perform pg_temp.check(not (dealers->0 ? 'document_path') and dealers::text not like '%e7420000-0000-4000-8000-0000000000a1%', 'no document or owner');
end $$;
select pg_temp.expect_error($$select public.get_store_dealer_authorizations()$$, 'permission denied');

-- Expired: out of the public list without anyone touching it.
reset role;
update public.store_dealer_authorizations set valid_until = current_date - 400 where id = (select id from dealer_ids where name = 'yamaha');
select pg_temp.check(public.get_active_dealer_authorizations() = '[]'::jsonb, 'expired leaves');
update public.store_dealer_authorizations set valid_until = null where id = (select id from dealer_ids where name = 'yamaha');
-- A store that stops being active takes its marks with it.
select set_config('app.allow_store_admin_fields', 'true', true);
update public.stores set status = 'hidden' where id = 'e7420000-0000-4000-8000-000000000001';
select pg_temp.check(public.get_active_dealer_authorizations() = '[]'::jsonb, 'hidden store leaves');
update public.stores set status = 'active' where id = 'e7420000-0000-4000-8000-000000000001';
select set_config('app.allow_store_admin_fields', '', true);

-- ------------------------------------------------------------------ revoke and withdraw

set local role authenticated;
select pg_temp.as_admin();
do $$ declare v_id uuid := (select id from dealer_ids where name = 'yamaha'); rev integer; revoked jsonb; begin
  rev := (select (d->>'revision')::integer from jsonb_array_elements(public.admin_get_dealer_authorizations('approved')) d where (d->>'id')::uuid = v_id);
  revoked := public.admin_review_dealer_authorization(v_id, 'revoke', rev, 'La marca nos informó que la autorización terminó.');
  perform pg_temp.check(revoked->>'status' = 'revoked' and revoked->>'review_reason' like 'La marca%', 'revoked with reason');
end $$;
reset role;
select pg_temp.check(exists (select 1 from public.notifications n where n.event_type = 'store_dealer_revoked'), 'owner told why');
set local role authenticated;

select pg_temp.as_user('e7420000-0000-4000-8000-0000000000a1');
do $$ declare fender jsonb; begin
  fender := public.request_dealer_authorization_upload('Fender', 'fender.png', 'image/png', 500);
  perform pg_temp.check(public.withdraw_dealer_authorization((fender->>'id')::uuid)->>'status' = 'withdrawn', 'withdrawn by the owner');
  perform pg_temp.expect_error(format('select public.withdraw_dealer_authorization(%L)', fender->>'id'), 'DEALER_NOT_FOUND');
end $$;
-- Another store cannot withdraw or see this store's requests.
select pg_temp.as_user('e7420000-0000-4000-8000-0000000000a2');
select pg_temp.check(public.get_store_dealer_authorizations() = '[]'::jsonb, 'other store sees nothing');
select pg_temp.expect_error(format('select public.withdraw_dealer_authorization(%L)', (select id from dealer_ids where name = 'yamaha')), 'DEALER_NOT_FOUND');

rollback;
