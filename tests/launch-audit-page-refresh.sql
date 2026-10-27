-- Launch audit A19 page refresh record (supabase/migrations/20261112130000_launch_audit_page_refresh.sql): which
-- changes leave a row, the job's claim and report, and who may run them. Local/test database only. Every fixture is
-- rolled back.
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
-- The rows recorded since the last call, which it clears.
create function pg_temp.take() returns bigint language plpgsql security definer as $$
declare taken bigint;
begin
  delete from laria_private.public_page_changes;
  get diagnostics taken = row_count;
  return taken;
end $$;
create function pg_temp.waiting() returns bigint language sql security definer as $$
  select count(*) from laria_private.public_page_changes
$$;
create function pg_temp.armed(p_nonce text) returns bigint language sql security definer as $$
  select count(*) from laria_private.public_page_changes where armed_nonce = p_nonce
$$;
create function pg_temp.report(p_claim text, p_nonce text) returns jsonb language sql as $$
  select public.complete_public_page_changes(p_claim::uuid, p_nonce)
$$;
grant execute on function pg_temp.check(boolean, text), pg_temp.expect_error(text, text), pg_temp.take(),
  pg_temp.waiting(), pg_temp.armed(text), pg_temp.report(text, text) to anon, authenticated, service_role;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e1400000-0000-4000-8000-000000000001','authenticated','authenticated','lapr-particular@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Particular","phone":"51999996001","city":"Lima","region":"Lima"}'),
 ('e1400000-0000-4000-8000-000000000002','authenticated','authenticated','lapr-verified@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueña","phone":"51999996002","city":"Lima","region":"Lima"}'),
 ('e1400000-0000-4000-8000-000000000003','authenticated','authenticated','lapr-unverified@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño","phone":"51999996003","city":"Lima","region":"Lima"}'),
 ('e1400000-0000-4000-8000-000000000004','authenticated','authenticated','lapr-buyer@example.invalid',now(),'{}','{"account_type":"buyer","full_name":"Compradora","phone":"51999996004","city":"Lima","region":"Lima"}');
update public.profiles set account_type = 'store_owner'
where id in ('e1400000-0000-4000-8000-000000000002', 'e1400000-0000-4000-8000-000000000003');
-- A new profile, or one whose role alone changed, shows nowhere yet.
select pg_temp.check(pg_temp.take() = 0, 'new profiles and a role change leave nothing');

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
select pg_temp.check(pg_temp.take() = 1, 'adding active stores is recorded');
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
select pg_temp.check(pg_temp.take() = 1, 'adding public listings is recorded');
insert into public.listing_photos (id, listing_id, image_url, sort_order) values
 ('e1430000-0000-4000-8000-000000000001', 'e1420000-0000-4000-8000-000000000001', 'https://example.invalid/lapr-1.jpg', 0),
 ('e1430000-0000-4000-8000-000000000002', 'e1420000-0000-4000-8000-000000000001', 'https://example.invalid/lapr-2.jpg', 1),
 ('e1430000-0000-4000-8000-000000000003', 'e1420000-0000-4000-8000-000000000003', 'https://example.invalid/lapr-4.jpg', 0),
 ('e1430000-0000-4000-8000-000000000004', 'e1420000-0000-4000-8000-000000000003', 'https://example.invalid/lapr-5.jpg', 1);
select pg_temp.check(pg_temp.take() = 1, 'adding a public listing''s photos is recorded');

-- Bookkeeping no page shows, and saves that change nothing, leave nothing.
update public.listings set view_count = coalesce(view_count, 0) + 1 where id = 'e1420000-0000-4000-8000-000000000001';
update public.listings set availability_checkin_at = now() where id = 'e1420000-0000-4000-8000-000000000001';
update public.listings set title = title, price_pen = price_pen where id = 'e1420000-0000-4000-8000-000000000001';
update public.stores set name = name, description = description where id = 'e1410000-0000-4000-8000-000000000002';
update public.listing_photos set sort_order = sort_order where listing_id = 'e1420000-0000-4000-8000-000000000001';
update public.profiles set full_name = full_name where id = 'e1400000-0000-4000-8000-000000000001';
select pg_temp.check(pg_temp.take() = 0, 'view counts, check-in times and saves that change nothing leave nothing');

-- What nobody sees publicly leaves nothing: hidden and pending listings, a listing of a store under review, a store
-- under review, a photo of a hidden listing, an active store's private details.
update public.listings set price_pen = 900
where id in ('e1420000-0000-4000-8000-000000000002', 'e1420000-0000-4000-8000-000000000004',
  'e1420000-0000-4000-8000-000000000006');
update public.stores set description = 'Pronto abrimos' where id = 'e1410000-0000-4000-8000-000000000003';
insert into public.listing_photos (listing_id, image_url, sort_order)
values ('e1420000-0000-4000-8000-000000000002', 'https://example.invalid/lapr-hidden.jpg', 0);
update public.stores set email = 'ventas@lapr.pe', contact_person = 'Ana María', listing_plan = 'starter_20'
where id = 'e1410000-0000-4000-8000-000000000001';
select pg_temp.check(pg_temp.take() = 0, 'changes nobody sees publicly leave nothing');

-- A public listing's new price leaves one row, and one statement over several listings leaves one.
update public.listings set price_pen = 1400 where id = 'e1420000-0000-4000-8000-000000000001';
select pg_temp.check(pg_temp.take() = 1, 'a public listing''s new price is recorded');
update public.listings set city = 'Arequipa'
where id in ('e1420000-0000-4000-8000-000000000001', 'e1420000-0000-4000-8000-000000000003',
  'e1420000-0000-4000-8000-000000000005');
select pg_temp.check(pg_temp.take() = 1, 'one statement over several listings leaves one row');

-- Leaving public view and coming back are both recorded.
update public.listings set status = 'hidden', hidden_source = 'owner', hidden_at = now()
where id = 'e1420000-0000-4000-8000-000000000003';
select pg_temp.check(pg_temp.take() = 1, 'hiding a public listing is recorded');
update public.listings set status = 'approved', hidden_source = null, hidden_at = null
where id = 'e1420000-0000-4000-8000-000000000003';
select pg_temp.check(pg_temp.take() = 1, 'a listing back in public view is recorded');
update public.listings set stock_state = 'out_of_stock' where id = 'e1420000-0000-4000-8000-000000000005';
select pg_temp.check(pg_temp.take() = 1, 'a public listing out of stock is recorded');

-- A sold listing keeps its page with "Vendido" (the fourth review's case): selling a hidden listing, changing a sold
-- one and removing it are recorded; a sold listing of a store under review shows nowhere.
update public.listings set status = 'sold', sold_at = now(), hidden_source = null, hidden_at = null
where id = 'e1420000-0000-4000-8000-000000000002';
select pg_temp.check(pg_temp.take() = 1, 'a hidden listing marked sold is recorded');
update public.listings set description = repeat('Vendida con estuche original ', 3)
where id = 'e1420000-0000-4000-8000-000000000002';
select pg_temp.check(pg_temp.take() = 1, 'a sold listing''s change is recorded');
update public.listings set status = 'sold', sold_at = now() where id = 'e1420000-0000-4000-8000-000000000006';
select pg_temp.check(pg_temp.take() = 0, 'a sold listing of a store under review leaves nothing');
delete from public.listing_photos where listing_id = 'e1420000-0000-4000-8000-000000000002';
select pg_temp.check(pg_temp.take() = 1, 'removing a sold listing''s photo is recorded');
delete from public.listings where id = 'e1420000-0000-4000-8000-000000000002';
select pg_temp.check(pg_temp.take() = 1, 'removing a sold listing is recorded');

-- A public listing's photos: added, reordered, removed.
insert into public.listing_photos (listing_id, image_url, sort_order)
values ('e1420000-0000-4000-8000-000000000001', 'https://example.invalid/lapr-3.jpg', 2);
select pg_temp.check(pg_temp.take() = 1, 'a new photo of a public listing is recorded');
update public.listing_photos set sort_order = case sort_order when 0 then 1 when 1 then 0 else sort_order end
where listing_id = 'e1420000-0000-4000-8000-000000000001';
select pg_temp.check(pg_temp.take() = 1, 'reordering a public listing''s photos leaves one row');
delete from public.listing_photos where id = 'e1430000-0000-4000-8000-000000000002';
select pg_temp.check(pg_temp.take() = 1, 'removing a public listing''s photo is recorded');

-- The owner's own changes through the API are recorded too, though the owner can't read the record.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1400000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.confirm_listing_available('e1420000-0000-4000-8000-000000000001');
select pg_temp.expect_error('select count(*) from laria_private.public_page_changes', '42501');
select set_config('request.jwt.claims', '{"sub":"e1400000-0000-4000-8000-000000000003","role":"authenticated"}', true);
update public.stores set opening_hours = 'Lunes a sábado, 10 a 19 h' where id = 'e1410000-0000-4000-8000-000000000002';
reset role;
select pg_temp.check(pg_temp.take() = 2, 'the owner''s confirmation and an unverified active store''s new hours are recorded');

-- A store that stops being active is recorded, and its listings stop counting. Rejected and then sent back to review
-- before the job runs (the third review's case), the first change stays recorded.
update public.stores set status = 'rejected', rejection_reason = 'El RUC no coincide'
where id = 'e1410000-0000-4000-8000-000000000001';
select pg_temp.check(pg_temp.waiting() = 1, 'a store leaving active status is recorded');
update public.stores set status = 'pending', rejection_reason = null where id = 'e1410000-0000-4000-8000-000000000001';
update public.listings set price_pen = 2000 where id = 'e1420000-0000-4000-8000-000000000005';
select pg_temp.check(pg_temp.take() = 1, 'a store under review and its listings leave nothing more, and the first change stays');
update public.stores set status = 'active' where id = 'e1410000-0000-4000-8000-000000000001';
select pg_temp.check(pg_temp.take() = 1, 'a store becoming active is recorded');

-- Names: a seller's or reviewer's new name is recorded; a profile's role alone isn't.
update public.profiles set full_name = 'Particular Pérez' where id = 'e1400000-0000-4000-8000-000000000001';
select pg_temp.check(pg_temp.take() = 1, 'a new name is recorded');
update public.profiles set account_type = 'seller' where id = 'e1400000-0000-4000-8000-000000000004';
select pg_temp.check(pg_temp.take() = 0, 'a role change leaves nothing');

-- Reviews of a seller: added, hidden by Admin, removed. A seller's review of a buyer shows on no cached page.
set local session_replication_role = replica;
insert into public.verified_transactions (id, claim_id, listing_id, seller_user_id, buyer_user_id, seller_identity_type,
  sold_at, verified_at, review_deadline)
values ('e1440000-0000-4000-8000-000000000001', gen_random_uuid(), 'e1420000-0000-4000-8000-000000000003',
  'e1400000-0000-4000-8000-000000000001', 'e1400000-0000-4000-8000-000000000004', 'particular',
  '2026-10-01', '2026-10-01', '2026-10-11');
set local session_replication_role = origin;
insert into public.transaction_reviews (id, transaction_id, direction, reviewer_user_id, subject_user_id, rating, comment)
values ('e1450000-0000-4000-8000-000000000001', 'e1440000-0000-4000-8000-000000000001', 'buyer_to_seller',
  'e1400000-0000-4000-8000-000000000004', 'e1400000-0000-4000-8000-000000000001', 5, 'Todo excelente');
select pg_temp.check(pg_temp.take() = 1, 'a buyer''s review is recorded');
insert into public.transaction_reviews (transaction_id, direction, reviewer_user_id, subject_user_id, rating)
values ('e1440000-0000-4000-8000-000000000001', 'seller_to_buyer', 'e1400000-0000-4000-8000-000000000001',
  'e1400000-0000-4000-8000-000000000004', 5);
select pg_temp.check(pg_temp.take() = 0, 'a seller''s review of a buyer leaves nothing');
update public.transaction_reviews
set admin_hidden_at = now(), admin_hidden_by = 'e1400000-0000-4000-8000-000000000002', admin_hidden_reason = 'Lenguaje ofensivo'
where id = 'e1450000-0000-4000-8000-000000000001';
select pg_temp.check(pg_temp.take() = 1, 'Admin hiding a review is recorded');
delete from public.transaction_reviews where id = 'e1450000-0000-4000-8000-000000000001';
select pg_temp.check(pg_temp.take() = 1, 'removing a review is recorded');

-- The job's claim and report: the service role only.
update public.listings set price_pen = 1300 where id = 'e1420000-0000-4000-8000-000000000001';
select pg_temp.expect_error('select public.claim_public_page_changes()', '42501');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect_error('select public.claim_public_page_changes(''dpl_x'')', '42501');
select pg_temp.expect_error('select public.complete_public_page_changes(gen_random_uuid(), ''nonce-1234'')', '42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1400000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.expect_error('select public.claim_public_page_changes()', '42501');
select pg_temp.expect_error('select public.complete_public_page_changes(gen_random_uuid(), ''nonce-1234'')', '42501');
reset role;

-- A first claim folds what waits into one row; a change after it waits for the next run.
update public.listings set price_pen = 1290 where id = 'e1420000-0000-4000-8000-000000000001';
select pg_temp.check(pg_temp.waiting() = 2, 'two changes wait');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('lapr.claim1', public.claim_public_page_changes()::text, true);
reset role;
select pg_temp.check(current_setting('lapr.claim1') <> '' and pg_temp.waiting() = 1, 'the first claim folds them into one');
update public.listings set price_pen = 1250 where id = 'e1420000-0000-4000-8000-000000000001';
-- Seconds after the first claim, nothing is armed yet.
set local role service_role;
select pg_temp.check(pg_temp.report(current_setting('lapr.claim1'), 'nonce-aaaa-1111') = '{"done": 0, "waiting": 1}',
  'a row first claimed seconds ago isn''t armed');
reset role;
select pg_temp.check(pg_temp.waiting() = 2 and pg_temp.armed('nonce-aaaa-1111') = 0, 'nothing is armed, and the later change waits');

-- 35 seconds after its first claim, the next run arms the row with the nonce it read; the newer row waits its turn.
update laria_private.public_page_changes set first_claimed_at = first_claimed_at - interval '40 seconds'
where claim_id = current_setting('lapr.claim1')::uuid;
set local role service_role;
select set_config('lapr.claim2', public.claim_public_page_changes()::text, true);
select pg_temp.check(pg_temp.report(current_setting('lapr.claim2'), 'nonce-aaaa-1111') = '{"done": 0, "waiting": 2}',
  'the older row is armed');
reset role;
select pg_temp.check(pg_temp.armed('nonce-aaaa-1111') = 1, 'one row armed');

-- The same nonce again: no clear reached the cache, so nothing is done.
set local role service_role;
select set_config('lapr.claim3', public.claim_public_page_changes()::text, true);
select pg_temp.check(pg_temp.report(current_setting('lapr.claim3'), 'nonce-aaaa-1111') = '{"done": 0, "waiting": 2}',
  'the same nonce finishes nothing');
reset role;

-- Another nonce proves a clear: the armed row is done, and the newer one, past its 35 seconds, is armed with it.
update laria_private.public_page_changes set first_claimed_at = first_claimed_at - interval '40 seconds'
where armed_nonce is null;
set local role service_role;
select set_config('lapr.claim4', public.claim_public_page_changes()::text, true);
select pg_temp.check(pg_temp.report(current_setting('lapr.claim4'), 'nonce-bbbb-2222') = '{"done": 1, "waiting": 1}',
  'another nonce finishes the armed row');
-- Without a nonce, or with a malformed one, nothing moves.
select set_config('lapr.claim5', public.claim_public_page_changes()::text, true);
select pg_temp.check(pg_temp.report(current_setting('lapr.claim5'), null) = '{"done": 0, "waiting": 1}', 'no nonce, no change');
select pg_temp.check(pg_temp.report(current_setting('lapr.claim5'), 'short') = '{"done": 0, "waiting": 1}', 'a malformed nonce, no change');
reset role;
select pg_temp.check(pg_temp.armed('nonce-bbbb-2222') = 1, 'the newer row stays armed');

-- A run that took the rows over reports for them; the earlier claim's report changes nothing.
set local role service_role;
select set_config('lapr.claim6', public.claim_public_page_changes()::text, true);
select set_config('lapr.claim7', public.claim_public_page_changes()::text, true);
select pg_temp.check(pg_temp.report(current_setting('lapr.claim6'), 'nonce-cccc-3333') = '{"done": 0, "waiting": 0}',
  'a claim taken over finishes and holds nothing');
select pg_temp.check(pg_temp.report(current_setting('lapr.claim7'), 'nonce-cccc-3333') = '{"done": 1, "waiting": 0}',
  'the run holding the rows finishes them');
reset role;
select pg_temp.check(pg_temp.waiting() = 0, 'nothing waits');

-- Rows armed with the same nonce fold into one; rows armed with another nonce stay apart.
insert into laria_private.public_page_changes (first_claimed_at, armed_nonce)
select now() - interval '2 minutes', nonce from (values ('nonce-dddd-4444'), ('nonce-dddd-4444'), ('nonce-eeee-5555')) v(nonce);
set local role service_role;
select set_config('lapr.claim8', public.claim_public_page_changes()::text, true);
reset role;
select pg_temp.check(pg_temp.armed('nonce-dddd-4444') = 1 and pg_temp.armed('nonce-eeee-5555') = 1, 'same-nonce rows fold');
set local role service_role;
select pg_temp.check(pg_temp.report(current_setting('lapr.claim8'), 'nonce-dddd-4444') = '{"done": 1, "waiting": 1}',
  'each nonce is judged on its own');
reset role;
select pg_temp.take();

-- Nothing waiting, nothing claimed.
set local role service_role;
select pg_temp.check(public.claim_public_page_changes() is null, 'with nothing waiting there is no claim');

-- A deployment the job hasn't run in before adds a row; the same one again doesn't; another one does.
select pg_temp.check(public.claim_public_page_changes('dpl_first') is not null, 'the first deployment adds a row');
reset role;
select pg_temp.check(pg_temp.take() = 1, 'one row for the first deployment');
set local role service_role;
select pg_temp.check(public.claim_public_page_changes('dpl_first') is null, 'the same deployment adds nothing');
select pg_temp.check(public.claim_public_page_changes(null) is null, 'no deployment named adds nothing');
select pg_temp.check(public.claim_public_page_changes(repeat('x', 201)) is null, 'a malformed name is ignored');
select pg_temp.check(public.claim_public_page_changes('dpl_second') is not null, 'a new deployment adds a row');
reset role;
select pg_temp.check(pg_temp.take() = 1, 'one row for the new deployment');

rollback;
