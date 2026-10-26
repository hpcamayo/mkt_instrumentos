-- Launch audit security fixes (supabase/migrations/20261112120000_launch_audit_security.sql): A06 store inserts,
-- A12 listing inserts, A09 created_at and the verified-store identity rule, A21 anonymous resubmission, A10 bucket
-- listing, A31 retired functions and A32 store image addresses. Local/test database only. Every fixture is rolled back.
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
create function pg_temp.store(p_id uuid) returns public.stores language sql security definer as $$
  select * from public.stores where id = p_id
$$;
grant execute on function pg_temp.check(boolean, text), pg_temp.expect_error(text, text), pg_temp.store(uuid) to anon, authenticated;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e1200000-0000-4000-8000-000000000001','authenticated','authenticated','lasec-particular@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Particular","phone":"51999995001","city":"Lima","region":"Lima"}'),
 ('e1200000-0000-4000-8000-000000000002','authenticated','authenticated','lasec-owner@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueña","phone":"51999995002","city":"Lima","region":"Lima"}'),
 ('e1200000-0000-4000-8000-000000000003','authenticated','authenticated','lasec-admin@example.invalid',now(),'{"role":"admin"}','{"account_type":"seller","full_name":"Admin","phone":"51999995003","city":"Lima","region":"Lima"}');
update public.profiles set account_type = 'store_owner' where id = 'e1200000-0000-4000-8000-000000000002';

select set_config('app.allow_store_admin_fields', 'true', true);
insert into public.stores (id, name, slug, whatsapp_phone, city, region, status, listing_plan, is_verified, ruc,
  owner_user_id, razon_social, email, address, contact_person, created_at)
values ('e1210000-0000-4000-8000-000000000001', 'Tienda Real', 'lasec-tienda-real', '987654321', 'Lima', 'Lima',
  'active', 'free', true, '20100047218', 'e1200000-0000-4000-8000-000000000002', 'REAL SAC', 'r@real.pe',
  'Av Real 123', 'Ana', now() - interval '20 days');
select set_config('app.allow_store_admin_fields', '', true);

-- A06: nobody inserts store rows through the API.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect_error($sql$
  insert into public.stores (name, slug, whatsapp_phone, city, region, status, listing_plan, is_verified, ruc, owner_user_id)
  values ('Casa Musical Squat', 'casa-musical', '987654321', 'Lima', 'Lima', 'pending', 'free', true, '20100047219',
    'e1200000-0000-4000-8000-000000000001')
$sql$, '42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.expect_error($sql$
  insert into public.stores (name, slug, whatsapp_phone, city, region, status, listing_plan, is_verified, ruc,
    owner_user_id, razon_social, email, address, contact_person)
  values ('Attacker Store', 'attacker-store', '987654321', 'Lima', 'Lima', 'pending', 'free', false, '20100047220',
    'e1200000-0000-4000-8000-000000000001', 'ACME SAC', 'a@b.pe', 'Av 1', 'Juan')
$sql$, '42501');
select set_config('request.jwt.claims', '{"sub":"e1200000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select pg_temp.expect_error($sql$
  insert into public.stores (name, slug, whatsapp_phone, city, region, status, listing_plan, is_verified, ruc,
    owner_user_id, razon_social, email, address, contact_person)
  values ('Second Store', 'second-store', '987654321', 'Lima', 'Lima', 'pending', 'free', false, '20100047221',
    'e1200000-0000-4000-8000-000000000002', 'SECOND SAC', 's@b.pe', 'Av 2', 'Ana')
$sql$, '42501');

-- A12: nobody inserts listings through the API.
select set_config('request.jwt.claims', '{"sub":"e1200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.expect_error($sql$
  insert into public.listings (seller_type, status, title, slug, description, category, instrument_type, brand, model,
    condition, price_pen, city, region, contact_name, whatsapp_phone, owner_user_id, published_at, view_count)
  values ('individual', 'pending', 'Guitarra directa', 'lasec-direct', repeat('Descripción ', 5), 'guitars',
    'electric_guitar', 'Fender', 'Strat', 'used_good', 1500, 'Lima', 'Lima', 'Ana', '51999995001',
    'e1200000-0000-4000-8000-000000000001', now() - interval '3 years', 9999)
$sql$, '42501');
select set_config('request.jwt.claims', '{"sub":"e1200000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select pg_temp.expect_error($sql$
  insert into public.listings (seller_type, store_id, status, title, slug, description, category, instrument_type,
    brand, model, condition, price_pen, city, region, contact_name, whatsapp_phone, owner_user_id)
  values ('store', 'e1210000-0000-4000-8000-000000000001', 'pending', 'Bajo directo', 'lasec-direct-store',
    repeat('Descripción ', 5), 'bass', 'electric_bass', 'Yamaha', 'TRBX', 'new', 1500, 'Lima', 'Lima', 'Ana',
    '51999995002', 'e1200000-0000-4000-8000-000000000002')
$sql$, '42501');

-- A09: created_at and slug are read-only for the owner; a name, RUC or razón social change lifts the badge.
select pg_temp.expect_error($sql$
  update public.stores set created_at = '2015-01-01' where id = 'e1210000-0000-4000-8000-000000000001'
$sql$, 'Only controlled server functions');
select pg_temp.expect_error($sql$
  update public.stores set slug = 'yamaha-oficial' where id = 'e1210000-0000-4000-8000-000000000001'
$sql$, 'Only controlled server functions');
select pg_temp.expect_error($sql$
  update public.profiles set created_at = '2012-01-01' where id = 'e1200000-0000-4000-8000-000000000002'
$sql$, 'Only admin can change when a profile was created');
select pg_temp.expect_error($sql$
  update public.stores set verification_lapsed_at = null, verification_lapsed_from = '{}' where id = 'e1210000-0000-4000-8000-000000000001'
$sql$, 'Only controlled server functions');

-- Same business, other spacing and capitals: the badge stays.
update public.stores set name = '  tienda   REAL ', razon_social = 'Real  SAC' where id = 'e1210000-0000-4000-8000-000000000001';
select pg_temp.check((pg_temp.store('e1210000-0000-4000-8000-000000000001')).is_verified, 'cosmetic edit kept the badge');
-- Other profile fields don't touch the badge either.
update public.stores set description = 'Guitarras y bajos', whatsapp_phone = '987654322' where id = 'e1210000-0000-4000-8000-000000000001';
select pg_temp.check((pg_temp.store('e1210000-0000-4000-8000-000000000001')).is_verified, 'profile edit kept the badge');

update public.stores set name = 'Yamaha Oficial Peru' where id = 'e1210000-0000-4000-8000-000000000001';
select pg_temp.check(not (pg_temp.store('e1210000-0000-4000-8000-000000000001')).is_verified, 'a new name lifted the badge');
select pg_temp.check((pg_temp.store('e1210000-0000-4000-8000-000000000001')).status = 'active', 'the store stays active');
select pg_temp.check((pg_temp.store('e1210000-0000-4000-8000-000000000001')).verification_lapsed_at is not null, 'lapse recorded');
select pg_temp.check((pg_temp.store('e1210000-0000-4000-8000-000000000001')).verification_lapsed_from
  = '{"name":"  tienda   REAL ","ruc":"20100047218","razon_social":"Real  SAC"}'::jsonb, 'previous identity kept');
-- A second change keeps the first verified identity.
update public.stores set ruc = '20999999991' where id = 'e1210000-0000-4000-8000-000000000001';
select pg_temp.check((pg_temp.store('e1210000-0000-4000-8000-000000000001')).verification_lapsed_from ->> 'ruc' = '20100047218',
  'the lapse keeps the identity Admin verified');

-- Admin sees it in Verificacion, and verifying again settles it.
select set_config('request.jwt.claims', '{"sub":"e1200000-0000-4000-8000-000000000003","role":"authenticated","app_metadata":{"role":"admin"}}', true);
do $$
declare queue jsonb;
begin
  queue := public.get_admin_moderation_queue('verificacion', 1, 10);
  perform pg_temp.check((queue->>'total')::int = 1, format('one store waits for verification: %s', queue));
  perform pg_temp.check(queue->'items'->0->>'id' = 'e1210000-0000-4000-8000-000000000001', 'the lapsed store is listed');
  perform pg_temp.check(queue->'items'->0->>'reason' = 'store_identity_changed', 'with its reason');
  perform pg_temp.check(queue->'items'->0->'previous_identity'->>'ruc' = '20100047218', 'and the verified identity');
  perform pg_temp.check((queue->'counts'->>'verificacion')::int = 1, 'the tab counts it');
end $$;
-- Admin's own correction of a verified store keeps the badge.
select public.set_store_verification('e1210000-0000-4000-8000-000000000001', true);
-- set_config(..., true) lasts until the end of the transaction; each API request is its own, this suite is one.
select set_config('app.allow_store_admin_fields', '', true), set_config('app.allow_listing_admin_fields', '', true);
select pg_temp.check((pg_temp.store('e1210000-0000-4000-8000-000000000001')).is_verified, 'Admin verified again');
select pg_temp.check((pg_temp.store('e1210000-0000-4000-8000-000000000001')).verification_lapsed_at is null, 'verification settles the lapse');
update public.stores set name = 'Yamaha Peru Distribuidor' where id = 'e1210000-0000-4000-8000-000000000001';
select pg_temp.check((pg_temp.store('e1210000-0000-4000-8000-000000000001')).is_verified, 'an Admin edit keeps the badge');
select pg_temp.check((public.get_admin_moderation_counts()->>'verificacion')::int = 0, 'nothing waits');

-- Leaving a lapsed store unverified takes it out of the queue.
select set_config('request.jwt.claims', '{"sub":"e1200000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update public.stores set razon_social = 'OTRA EMPRESA SAC' where id = 'e1210000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '{"sub":"e1200000-0000-4000-8000-000000000003","role":"authenticated","app_metadata":{"role":"admin"}}', true);
select pg_temp.check((public.get_admin_moderation_counts()->>'verificacion')::int = 1, 'razón social change waits');
select public.set_store_verification('e1210000-0000-4000-8000-000000000001', false);
select set_config('app.allow_store_admin_fields', '', true);
select pg_temp.check((public.get_admin_moderation_counts()->>'verificacion')::int = 0, 'kept unverified, queue empty');
select pg_temp.check((pg_temp.store('e1210000-0000-4000-8000-000000000001')).verification_lapsed_from is null, 'lapse cleared');
reset role;

-- A21: a rejected legacy listing can't be resubmitted without a session or by someone else.
select set_config('app.allow_listing_admin_fields', 'true', true);
insert into public.listings (id, seller_type, status, title, slug, description, category, instrument_type, brand,
  model, condition, price_pen, city, region, contact_name, whatsapp_phone, created_by_source,
  marketplace_rules_accepted_at, rejection_reason)
values ('e1220000-0000-4000-8000-000000000001', 'individual', 'rejected', 'Guitarra legacy', 'lasec-legacy',
  repeat('Descripción larga de prueba ', 3), 'guitars', 'electric_guitar', 'Fender', 'Strat', 'used_good', 1500,
  'Lima', 'Lima', 'Ana', '51987654321', 'legacy', now(), 'Fotos borrosas');
insert into public.listing_photos (listing_id, image_url, sort_order) values
 ('e1220000-0000-4000-8000-000000000001', 'https://example.invalid/lasec-1.jpg', 0),
 ('e1220000-0000-4000-8000-000000000001', 'https://example.invalid/lasec-2.jpg', 1);
select set_config('app.allow_listing_admin_fields', '', true);
select pg_temp.check(not has_function_privilege('anon', 'public.submit_listing_for_publication(uuid)', 'EXECUTE'), 'anon cannot submit');
select pg_temp.check(has_function_privilege('authenticated', 'public.submit_listing_for_publication(uuid)', 'EXECUTE'), 'signed-in users can submit');
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select pg_temp.expect_error($sql$ select public.submit_listing_for_publication('e1220000-0000-4000-8000-000000000001') $sql$,
  'You cannot submit this listing.');
select set_config('request.jwt.claims', '{"sub":"e1200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.expect_error($sql$ select public.submit_listing_for_publication('e1220000-0000-4000-8000-000000000001') $sql$,
  'You cannot submit this listing.');
reset role;
select pg_temp.check((select status = 'rejected' and created_by_source = 'legacy' and rejection_reason = 'Fotos borrosas'
  from public.listings where id = 'e1220000-0000-4000-8000-000000000001'), 'the legacy listing is untouched');

-- A10: nobody lists the public buckets; an owner still reads their own folder.
insert into storage.objects (bucket_id, name, owner) values
 ('listing-photos', 'e1200000-0000-4000-8000-000000000001/e1220000-0000-4000-8000-000000000001/foto-0.jpg', 'e1200000-0000-4000-8000-000000000001'),
 ('store-assets', 'e1200000-0000-4000-8000-000000000002/e1210000-0000-4000-8000-000000000001/logo.png', 'e1200000-0000-4000-8000-000000000002');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.check((select count(*) from storage.objects where bucket_id in ('listing-photos', 'store-assets')) = 0, 'anon lists nothing');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'listing-photos') = 1, 'the owner reads their own photo');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'store-assets') = 0, 'but not another account''s assets');
reset role;

-- A31: retired functions are not callable through the API.
select pg_temp.check(not has_function_privilege('authenticated', 'public.relist_sold_listing(uuid)', 'EXECUTE'), 'relist retired');
select pg_temp.check(not has_function_privilege('authenticated', 'public.can_add_listing_photo(uuid)', 'EXECUTE'), 'can_add_listing_photo retired');
select pg_temp.check(not has_function_privilege('anon', 'public.can_remove_listing_photo(uuid)', 'EXECUTE'), 'can_remove_listing_photo retired');
select pg_temp.check(not has_function_privilege('anon', 'public.listing_has_status(uuid,public.listing_status)', 'EXECUTE'), 'listing_has_status retired');
select pg_temp.check(not has_function_privilege('authenticated', 'public.is_approved_store_member(uuid)', 'EXECUTE'), 'is_approved_store_member retired');
select pg_temp.check(not has_function_privilege('anon', 'public.get_admin_review_queue()', 'EXECUTE'), 'anon cannot reach the old review queue');
select pg_temp.check(has_function_privilege('anon', 'public.increment_listing_view_count(uuid)', 'EXECUTE'), 'the counter tombstone stays');

-- A32: logo, banner and store photo addresses must be the caller's own upload for that store.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1200000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select pg_temp.expect_error($sql$
  update public.stores set logo_url = 'https://evil.example/logo.png' where id = 'e1210000-0000-4000-8000-000000000001'
$sql$, 'STORE_IMAGE_URL_INVALID');
select pg_temp.expect_error($sql$
  update public.stores set banner_url = 'https://abc.supabase.co/storage/v1/object/public/store-assets/e1200000-0000-4000-8000-000000000001/e1210000-0000-4000-8000-000000000001/b.png'
  where id = 'e1210000-0000-4000-8000-000000000001'
$sql$, 'STORE_IMAGE_URL_INVALID');
update public.stores
set logo_url = 'https://abc.supabase.co/storage/v1/object/public/store-assets/e1200000-0000-4000-8000-000000000002/e1210000-0000-4000-8000-000000000001/profile-1-0.png',
    banner_url = null
where id = 'e1210000-0000-4000-8000-000000000001';
select pg_temp.expect_error($sql$
  insert into public.store_photos (store_id, image_url, alt_text, sort_order)
  values ('e1210000-0000-4000-8000-000000000001', 'https://images.example/shop.jpg', 'Local', 0)
$sql$, 'STORE_IMAGE_URL_INVALID');
insert into public.store_photos (store_id, image_url, alt_text, sort_order)
values ('e1210000-0000-4000-8000-000000000001',
  'https://abc.supabase.co/storage/v1/object/public/store-assets/e1200000-0000-4000-8000-000000000002/e1210000-0000-4000-8000-000000000001/profile-2-0.webp',
  'Local', 0);
reset role;
select pg_temp.check((select count(*) from public.store_photos where store_id = 'e1210000-0000-4000-8000-000000000001') = 1, 'own photo saved');

rollback;
