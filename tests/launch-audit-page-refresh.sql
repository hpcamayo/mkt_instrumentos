-- Launch audit A19 page refresh record (supabase/migrations/20261112130000_launch_audit_page_refresh.sql): which
-- changes to listings, stores and photos leave a row, the job's claim and report, and who may run them. Local/test
-- database only. Every fixture is rolled back.
begin;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;
create function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_code in sqlerrm) > 0 or sqlstate = p_code then return; end if;
    raise exception 'Expected % from [%], got: % (%)', p_code, p_sql, sqlerrm, sqlstate;
  end;
  raise exception 'Expected % from [%], but it succeeded', p_code, p_sql;
end $$;
create function pg_temp.waiting() returns bigint language sql security definer as $$
  select count(*) from laria_private.public_page_changes
$$;
create function pg_temp.first_drops() returns bigint language sql security definer as $$
  select count(*) from laria_private.public_page_changes where first_dropped_at is not null
$$;
grant execute on function pg_temp.check(boolean, text), pg_temp.expect_error(text, text), pg_temp.waiting(),
  pg_temp.first_drops() to anon, authenticated, service_role;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e1400000-0000-4000-8000-000000000001','authenticated','authenticated','lapr-particular@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Particular","phone":"51999996001","city":"Lima","region":"Lima"}'),
 ('e1400000-0000-4000-8000-000000000002','authenticated','authenticated','lapr-verified@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueña","phone":"51999996002","city":"Lima","region":"Lima"}'),
 ('e1400000-0000-4000-8000-000000000003','authenticated','authenticated','lapr-unverified@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño","phone":"51999996003","city":"Lima","region":"Lima"}');
update public.profiles set account_type = 'store_owner'
where id in ('e1400000-0000-4000-8000-000000000002', 'e1400000-0000-4000-8000-000000000003');

select set_config('app.allow_store_admin_fields', 'true', true);
select set_config('app.allow_listing_admin_fields', 'true', true);
insert into public.stores (id, name, slug, whatsapp_phone, city, region, status, listing_plan, is_verified, ruc,
  owner_user_id, razon_social, email, address, contact_person)
values
 ('e1410000-0000-4000-8000-000000000001', 'Tienda Verificada', 'lapr-verificada', '987654321', 'Lima', 'Lima',
  'active', 'free', true, '20100047218', 'e1400000-0000-4000-8000-000000000002', 'VERIFICADA SAC', 'v@lapr.pe',
  'Av Uno 123', 'Ana'),
 ('e1410000-0000-4000-8000-000000000002', 'Tienda Nueva', 'lapr-nueva', '987654322', 'Lima', 'Lima',
  'active', 'free', false, '20100047219', 'e1400000-0000-4000-8000-000000000003', 'NUEVA SAC', 'n@lapr.pe',
  'Av Dos 456', 'Beto'),
 ('e1410000-0000-4000-8000-000000000003', 'Tienda en revisión', 'lapr-revision', '987654323', 'Lima', 'Lima',
  'pending', 'free', false, '20100047220', null, 'REVISION SAC', 'r@lapr.pe', 'Av Tres 789', 'Caro');
insert into public.listings (id, seller_type, store_id, status, title, slug, description, category, instrument_type,
  brand, model, condition, price_pen, city, region, contact_name, whatsapp_phone, owner_user_id,
  marketplace_rules_accepted_at)
select f.id::uuid, f.seller_type::public.seller_type, f.store_id::uuid, f.status::public.listing_status, f.title, f.slug,
  repeat('Descripción larga de prueba ', 3), 'guitars', 'electric_guitar', 'Fender', 'Strat', 'Muy bueno', 1500,
  'Lima', 'Lima', 'Ana', '51987654321', f.owner::uuid, now()
from (values
  ('e1420000-0000-4000-8000-000000000001', 'individual', null, 'approved', 'Guitarra pública', 'lapr-publica', 'e1400000-0000-4000-8000-000000000001'),
  ('e1420000-0000-4000-8000-000000000002', 'individual', null, 'hidden', 'Guitarra oculta', 'lapr-oculta', 'e1400000-0000-4000-8000-000000000001'),
  ('e1420000-0000-4000-8000-000000000003', 'individual', null, 'approved', 'Guitarra segunda', 'lapr-segunda', 'e1400000-0000-4000-8000-000000000001'),
  ('e1420000-0000-4000-8000-000000000004', 'individual', null, 'pending', 'Guitarra en revisión', 'lapr-pendiente', 'e1400000-0000-4000-8000-000000000001'),
  ('e1420000-0000-4000-8000-000000000005', 'store', 'e1410000-0000-4000-8000-000000000001', 'approved', 'Guitarra de tienda', 'lapr-tienda', 'e1400000-0000-4000-8000-000000000002'),
  ('e1420000-0000-4000-8000-000000000006', 'store', 'e1410000-0000-4000-8000-000000000003', 'approved', 'Guitarra de tienda en revisión', 'lapr-tienda-revision', null)
) as f(id, seller_type, store_id, status, title, slug, owner);
insert into public.listing_photos (id, listing_id, image_url, sort_order) values
 ('e1430000-0000-4000-8000-000000000001', 'e1420000-0000-4000-8000-000000000001', 'https://example.invalid/lapr-1.jpg', 0),
 ('e1430000-0000-4000-8000-000000000002', 'e1420000-0000-4000-8000-000000000001', 'https://example.invalid/lapr-2.jpg', 1),
 ('e1430000-0000-4000-8000-000000000003', 'e1420000-0000-4000-8000-000000000003', 'https://example.invalid/lapr-4.jpg', 0),
 ('e1430000-0000-4000-8000-000000000004', 'e1420000-0000-4000-8000-000000000003', 'https://example.invalid/lapr-5.jpg', 1);

-- Adding a public listing, an active store or a public listing's photo is recorded.
select pg_temp.check(pg_temp.waiting() >= 3, 'adding public listings, active stores and their photos is recorded');
delete from laria_private.public_page_changes;

-- Bookkeeping no page shows, and saves that change nothing, leave nothing.
update public.listings set view_count = coalesce(view_count, 0) + 1 where id = 'e1420000-0000-4000-8000-000000000001';
update public.listings set availability_checkin_at = now() where id = 'e1420000-0000-4000-8000-000000000001';
update public.listings set title = title, price_pen = price_pen where id = 'e1420000-0000-4000-8000-000000000001';
update public.stores set name = name, description = description where id = 'e1410000-0000-4000-8000-000000000002';
update public.listing_photos set sort_order = sort_order where listing_id = 'e1420000-0000-4000-8000-000000000001';
select pg_temp.check(pg_temp.waiting() = 0, 'view counts, check-in times and saves that change nothing leave nothing');

-- What nobody sees publicly leaves nothing: hidden and pending listings, a listing of a store under review, a store
-- under review, a photo of a hidden listing.
update public.listings set price_pen = 900
where id in ('e1420000-0000-4000-8000-000000000002', 'e1420000-0000-4000-8000-000000000004',
  'e1420000-0000-4000-8000-000000000006');
update public.stores set description = 'Pronto abrimos' where id = 'e1410000-0000-4000-8000-000000000003';
insert into public.listing_photos (listing_id, image_url, sort_order)
values ('e1420000-0000-4000-8000-000000000002', 'https://example.invalid/lapr-hidden.jpg', 0);
select pg_temp.check(pg_temp.waiting() = 0, 'changes nobody sees publicly leave nothing');

-- A public listing's new price leaves one row, and one statement over several listings leaves one.
update public.listings set price_pen = 1400 where id = 'e1420000-0000-4000-8000-000000000001';
select pg_temp.check(pg_temp.waiting() = 1, 'a public listing''s new price is recorded');
update public.listings set city = 'Arequipa'
where id in ('e1420000-0000-4000-8000-000000000001', 'e1420000-0000-4000-8000-000000000003',
  'e1420000-0000-4000-8000-000000000005');
select pg_temp.check(pg_temp.waiting() = 2, 'one statement over several listings leaves one row');

-- Leaving public view and coming back are both recorded.
update public.listings set status = 'hidden', hidden_source = 'owner', hidden_at = now()
where id = 'e1420000-0000-4000-8000-000000000003';
select pg_temp.check(pg_temp.waiting() = 3, 'hiding a public listing is recorded');
update public.listings set status = 'approved', hidden_source = null, hidden_at = null
where id = 'e1420000-0000-4000-8000-000000000003';
select pg_temp.check(pg_temp.waiting() = 4, 'a listing back in public view is recorded');
update public.listings set stock_state = 'out_of_stock' where id = 'e1420000-0000-4000-8000-000000000005';
select pg_temp.check(pg_temp.waiting() = 5, 'a public listing out of stock is recorded');

-- A public listing's photos: added, reordered, removed.
insert into public.listing_photos (listing_id, image_url, sort_order)
values ('e1420000-0000-4000-8000-000000000001', 'https://example.invalid/lapr-3.jpg', 2);
select pg_temp.check(pg_temp.waiting() = 6, 'a new photo of a public listing is recorded');
update public.listing_photos set sort_order = case sort_order when 0 then 1 when 1 then 0 else sort_order end
where listing_id = 'e1420000-0000-4000-8000-000000000001';
select pg_temp.check(pg_temp.waiting() = 7, 'reordering a public listing''s photos leaves one row');
delete from public.listing_photos where id = 'e1430000-0000-4000-8000-000000000002';
select pg_temp.check(pg_temp.waiting() = 8, 'removing a public listing''s photo is recorded');

-- The owner's own changes through the API are recorded too, though the owner can't read the record.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1400000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.confirm_listing_available('e1420000-0000-4000-8000-000000000001');
select pg_temp.expect_error('select count(*) from laria_private.public_page_changes', '42501');
select set_config('request.jwt.claims', '{"sub":"e1400000-0000-4000-8000-000000000003","role":"authenticated"}', true);
update public.stores set opening_hours = 'Lunes a sábado, 10 a 19 h' where id = 'e1410000-0000-4000-8000-000000000002';
reset role;
select pg_temp.check(pg_temp.waiting() = 10, 'the owner''s confirmation and an unverified active store''s new hours are recorded');

-- A store that stops being active is recorded, and its listings stop counting. Rejected and then sent back to review
-- before the job runs (the third review's case), the first change stays recorded.
update public.stores set status = 'rejected', rejection_reason = 'El RUC no coincide'
where id = 'e1410000-0000-4000-8000-000000000001';
select pg_temp.check(pg_temp.waiting() = 11, 'a store leaving active status is recorded');
update public.stores set status = 'pending', rejection_reason = null where id = 'e1410000-0000-4000-8000-000000000001';
update public.listings set price_pen = 2000 where id = 'e1420000-0000-4000-8000-000000000005';
select pg_temp.check(pg_temp.waiting() = 11, 'a store under review and its listings leave nothing more, and the first change stays');
update public.stores set status = 'active' where id = 'e1410000-0000-4000-8000-000000000001';
select pg_temp.check(pg_temp.waiting() = 12, 'a store becoming active is recorded');

-- The job's claim and report: the service role only.
delete from laria_private.public_page_changes;
update public.listings set price_pen = 1300 where id = 'e1420000-0000-4000-8000-000000000001';
select pg_temp.expect_error('select public.claim_public_page_changes()', '42501');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect_error('select public.claim_public_page_changes()', '42501');
select pg_temp.expect_error('select public.complete_public_page_changes(gen_random_uuid())', '42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1400000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.expect_error('select public.claim_public_page_changes()', '42501');
select pg_temp.expect_error('select public.complete_public_page_changes(gen_random_uuid())', '42501');
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('lapr.claim1', public.claim_public_page_changes()::text, true);
reset role;
select pg_temp.check(current_setting('lapr.claim1') <> '', 'a waiting change is claimed');
-- A change after the claim waits for the next run.
update public.listings set price_pen = 1250 where id = 'e1420000-0000-4000-8000-000000000001';
set local role service_role;
select pg_temp.check(public.complete_public_page_changes(current_setting('lapr.claim1')::uuid) = 0,
  'a first drop finishes nothing');
reset role;
select pg_temp.check(pg_temp.waiting() = 2 and pg_temp.first_drops() = 1, 'only the claimed change has its first drop');

-- A second drop seconds after the first (a duplicate delivery) finishes nothing.
set local role service_role;
select set_config('lapr.claim2', public.claim_public_page_changes()::text, true);
select pg_temp.check(public.complete_public_page_changes(current_setting('lapr.claim2')::uuid) = 0,
  'a drop seconds after the first finishes nothing');
reset role;
select pg_temp.check(pg_temp.waiting() = 2 and pg_temp.first_drops() = 2, 'both changes have their first drop');

-- The next run, a minute later, finishes both.
update laria_private.public_page_changes set first_dropped_at = first_dropped_at - interval '1 minute';
set local role service_role;
select set_config('lapr.claim3', public.claim_public_page_changes()::text, true);
select pg_temp.check(public.complete_public_page_changes(current_setting('lapr.claim3')::uuid) = 2,
  'the second drop a minute later finishes both');
reset role;
select pg_temp.check(pg_temp.waiting() = 0, 'nothing waits after the second drop');

-- A run that took the rows over reports for them; the earlier claim's report changes nothing.
update public.listings set price_pen = 1200 where id = 'e1420000-0000-4000-8000-000000000001';
set local role service_role;
select set_config('lapr.claim4', public.claim_public_page_changes()::text, true);
select set_config('lapr.claim5', public.claim_public_page_changes()::text, true);
select pg_temp.check(public.complete_public_page_changes(current_setting('lapr.claim4')::uuid) = 0,
  'a claim taken over finishes nothing');
reset role;
select pg_temp.check(pg_temp.first_drops() = 0, 'a claim taken over records no drop');
set local role service_role;
select public.complete_public_page_changes(current_setting('lapr.claim5')::uuid);
reset role;
select pg_temp.check(pg_temp.waiting() = 1 and pg_temp.first_drops() = 1, 'the run holding the rows records the drop');

-- Nothing waiting, nothing claimed.
delete from laria_private.public_page_changes;
set local role service_role;
select pg_temp.check(public.claim_public_page_changes() is null, 'with nothing waiting there is no claim');
reset role;

rollback;
