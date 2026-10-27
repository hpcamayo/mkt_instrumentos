-- Launch audit A18 and A20 (supabase/migrations/20261114120000_launch_audit_privacy.sql): the daily upload allowance,
-- the sweep of files nothing uses, anonymising an account, and the retention of analytics events. Local/test database
-- only. Every fixture is rolled back, the stand-ins for Supabase's other auth tables included.
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
create function pg_temp.claims(p_sub text, p_admin boolean default false, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_sub, 'role', 'authenticated', 'aal', p_aal,
    'app_metadata', case when p_admin then jsonb_build_object('role', 'admin') else '{}'::jsonb end)::text, true)
$$;
-- One file per statement, as Storage writes them.
create function pg_temp.upload(p_bucket text, p_name text) returns boolean language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name, owner) values (p_bucket, p_name, auth.uid());
  return true;
exception when insufficient_privilege then
  return false;
end $$;
create function pg_temp.url(p_bucket text, p_path text) returns text language sql immutable as $$
  select 'http://127.0.0.1:54321/storage/v1/object/public/' || p_bucket || '/' || p_path
$$;
grant execute on function pg_temp.check(boolean, text), pg_temp.expect_error(text, text),
  pg_temp.claims(text, boolean, text), pg_temp.upload(text, text), pg_temp.url(text, text)
to anon, authenticated, service_role;

-- What Supabase Auth has besides users, for the scrub to clear (the local stand-in has only auth.users).
alter table auth.users add column email_change varchar(255) default '', add column phone_change text default '';
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null, identity_data jsonb);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null);
create table auth.refresh_tokens (id bigserial primary key, user_id varchar(255), token varchar(255));
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null);
create table auth.one_time_tokens (id uuid primary key default gen_random_uuid(), user_id uuid not null);
create table auth.flow_state (id uuid primary key default gen_random_uuid(), user_id uuid);
create table auth.audit_log_entries (id uuid primary key default gen_random_uuid(), payload json);

insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, phone,
  recovery_token, email_change) values
 ('e1500000-0000-4000-8000-000000000001','authenticated','authenticated','lapv-uno@example.invalid','$2a$10$hash',now(),'{"provider":"email"}','{"account_type":"seller","full_name":"Persona Uno","phone":"51999997001","city":"Lima","region":"Lima"}','51999997001','token-uno','nuevo@example.invalid'),
 ('e1500000-0000-4000-8000-000000000002','authenticated','authenticated','lapv-tienda@example.invalid','$2a$10$hash',now(),'{}','{"account_type":"store_owner","full_name":"Dueña Activa","phone":"51999997002","city":"Lima","region":"Lima"}',null,'',''),
 ('e1500000-0000-4000-8000-000000000003','authenticated','authenticated','lapv-pendiente@example.invalid','$2a$10$hash',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Pendiente","phone":"51999997003","city":"Cusco","region":"Cusco"}',null,'',''),
 ('e1500000-0000-4000-8000-000000000004','authenticated','authenticated','lapv-otra@example.invalid','$2a$10$hash',now(),'{}','{"account_type":"buyer","full_name":"Otra Persona","phone":"51999997004","city":"Lima","region":"Lima"}','51999997004','',''),
 ('e1500000-0000-4000-8000-000000000005','authenticated','authenticated','lapv-admin@example.invalid','$2a$10$hash',now(),'{"role":"admin"}','{"account_type":"seller","full_name":"Admin","phone":"51999997005","city":"Lima","region":"Lima"}',null,'','');
update public.profiles set account_type = 'store_owner'
where id in ('e1500000-0000-4000-8000-000000000002', 'e1500000-0000-4000-8000-000000000003');

select set_config('app.allow_store_admin_fields', 'true', true);
select set_config('app.allow_listing_admin_fields', 'true', true);
insert into public.stores (id, name, slug, whatsapp_phone, city, region, status, listing_plan, is_verified, ruc,
  owner_user_id, razon_social, email, address, contact_person, contact_name, show_address, logo_url)
values
 ('e1510000-0000-4000-8000-000000000002', 'Tienda Activa', 'lapv-activa', '987654301', 'Lima', 'Lima', 'active', 'free',
  false, '20100047301', 'e1500000-0000-4000-8000-000000000002', 'ACTIVA SAC', 'activa@lapv.pe', 'Av Uno 1', 'Ana', 'Ana',
  false, null),
 ('e1510000-0000-4000-8000-000000000003', 'Tienda Pendiente', 'lapv-pendiente', '987654302', 'Cusco', 'Cusco', 'pending',
  'free', false, '20100047302', 'e1500000-0000-4000-8000-000000000003', 'PENDIENTE SAC', 'pendiente@lapv.pe',
  'Calle Dos 2', 'Beto', 'Beto', true,
  pg_temp.url('store-assets', 'e1500000-0000-4000-8000-000000000003/e1510000-0000-4000-8000-000000000003/logo.png'));
insert into public.store_payment_methods (store_id, method, status, holder_name, provider_label, owner_note) values
 ('e1510000-0000-4000-8000-000000000003', 'yape_plin', 'pending_review', 'Beto Pérez', 'Yape', 'Yape al 987654302');
insert into public.listings (id, seller_type, store_id, status, title, slug, description, category, instrument_type,
  brand, model, condition, price_pen, city, region, contact_name, whatsapp_phone, owner_user_id,
  marketplace_rules_accepted_at, sold_at)
select f.id::uuid, 'individual', null, f.status::public.listing_status, f.title, f.slug,
  repeat('Descripción larga de prueba ', 3), 'guitars', 'electric_guitar', 'Fender', 'Strat', 'Muy bueno', 1500,
  'Lima', 'Lima', f.contact, f.phone, f.owner::uuid, now(), case when f.status = 'sold' then now() end
from (values
  ('e1520000-0000-4000-8000-000000000001', 'approved', 'Guitarra publicada', 'lapv-publicada', 'Persona Uno', '51999997001', 'e1500000-0000-4000-8000-000000000001'),
  ('e1520000-0000-4000-8000-000000000002', 'sold', 'Guitarra vendida', 'lapv-vendida', 'Persona Uno', '51999997001', 'e1500000-0000-4000-8000-000000000001'),
  ('e1520000-0000-4000-8000-000000000003', 'pending', 'Guitarra en revisión', 'lapv-revision', 'Persona Uno', '51999997001', 'e1500000-0000-4000-8000-000000000001'),
  ('e1520000-0000-4000-8000-000000000004', 'approved', 'Bajo de otra persona', 'lapv-otra', 'Otra', '51999997004', 'e1500000-0000-4000-8000-000000000004')
) as f(id, status, title, slug, contact, phone, owner);
select set_config('app.allow_store_admin_fields', '', true);
select set_config('app.allow_listing_admin_fields', '', true);

-- ---------------------------------------------------------------------------------------------------- the allowance
select pg_temp.check(laria_private.upload_daily_limit('listing-photos', 'e1500000-0000-4000-8000-000000000001') = 120,
  'a Particular may add 120 listing photos a day');
select pg_temp.check(laria_private.upload_daily_limit('listing-photos', 'e1500000-0000-4000-8000-000000000002') = 600,
  'the owner of an active store may add 600');
select pg_temp.check(laria_private.upload_daily_limit('listing-photos', 'e1500000-0000-4000-8000-000000000003') = 120,
  'a store under review counts as a Particular');
select pg_temp.check(laria_private.upload_daily_limit('listing-sound-clips', 'e1500000-0000-4000-8000-000000000001') = 20
  and laria_private.upload_daily_limit('store-assets', 'e1500000-0000-4000-8000-000000000001') = 40
  and laria_private.upload_daily_limit('listing-edit-photos', 'e1500000-0000-4000-8000-000000000001') = 120,
  'sound clips 20, store images 40, edit photos 120');
select pg_temp.check(laria_private.upload_daily_limit('store-imports', 'e1500000-0000-4000-8000-000000000001') is null,
  'other buckets have no allowance');
-- Someone else's clip, for the check below that the allowance never tells whether another account's file exists.
insert into storage.objects (bucket_id, name, owner)
values ('listing-sound-clips', 'e1500000-0000-4000-8000-000000000004/e1530000-0000-4000-8000-000000000044/sonido-1.webm',
  'e1500000-0000-4000-8000-000000000004');

set local role authenticated;
select pg_temp.claims('e1500000-0000-4000-8000-000000000001');
select pg_temp.check(public.my_upload_allowance('listing-sound-clips') = jsonb_build_object('bucket', 'listing-sound-clips',
  'limit', 20, 'used', 0, 'next_at', null), 'nothing used yet');
do $$
begin
  for slot in 1..20 loop
    perform pg_temp.check(pg_temp.upload('listing-sound-clips',
      'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/sonido-' || slot || '.webm'),
      'clip ' || slot || ' of 20 is allowed');
  end loop;
end $$;
select pg_temp.check(not pg_temp.upload('listing-sound-clips',
  'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/sonido-21.webm'), 'the 21st clip of the day is refused');
select pg_temp.check(public.storage_upload_allowed('listing-sound-clips',
  'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/sonido-3.webm'),
  'a path of the caller''s folder that exists passes, so a repeated upload still fails as a duplicate');
select pg_temp.check(not public.storage_upload_allowed('listing-sound-clips',
    'e1500000-0000-4000-8000-000000000004/e1530000-0000-4000-8000-000000000044/sonido-1.webm')
  and not public.storage_upload_allowed('listing-sound-clips',
    'e1500000-0000-4000-8000-000000000004/e1530000-0000-4000-8000-000000000044/sonido-2.webm'),
  'another account''s file and a missing one get the same answer, so the check never tells whether it exists');
select pg_temp.check((public.my_upload_allowance('listing-sound-clips') ->> 'used')::int = 20
  and (public.my_upload_allowance('listing-sound-clips') ->> 'next_at')::timestamptz between now() + interval '23 hours 59 minutes'
    and now() + interval '24 hours 1 minute', 'all 20 used; the first frees up in 24 hours');
select pg_temp.check(pg_temp.upload('listing-photos',
  'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/0.jpg'), 'each bucket counts on its own');
select pg_temp.check(public.my_upload_allowance('store-imports') = jsonb_build_object('bucket', 'store-imports', 'limit', null),
  'no allowance to report for other buckets');
reset role;
-- Files older than 24 hours leave the count; removing a file frees its place.
update storage.objects set created_at = now() - interval '25 hours'
where bucket_id = 'listing-sound-clips' and name ~ '/sonido-(1|2|3)\.webm$'
  and name like 'e1500000-0000-4000-8000-000000000001/%';
delete from storage.objects where bucket_id = 'listing-sound-clips' and name like '%/sonido-4.webm';
set local role authenticated;
select pg_temp.claims('e1500000-0000-4000-8000-000000000001');
select pg_temp.check((public.my_upload_allowance('listing-sound-clips') ->> 'used')::int = 16
  and public.my_upload_allowance('listing-sound-clips') -> 'next_at' = 'null'::jsonb, 'older files and removed ones free places');
do $$
begin
  for slot in 21..24 loop
    perform pg_temp.check(pg_temp.upload('listing-sound-clips',
      'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/sonido-' || slot || '.webm'),
      'clip ' || slot || ' fits again');
  end loop;
end $$;
select pg_temp.check(not pg_temp.upload('listing-sound-clips',
  'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/sonido-25.webm'), 'and the limit holds again');
-- Another account has its own count.
select pg_temp.claims('e1500000-0000-4000-8000-000000000004');
select pg_temp.check(pg_temp.upload('listing-sound-clips',
  'e1500000-0000-4000-8000-000000000004/e1530000-0000-4000-8000-000000000004/sonido-1.webm'), 'another account is not counted');
select pg_temp.claims('e1500000-0000-4000-8000-000000000002');
select pg_temp.check((public.my_upload_allowance('listing-photos') ->> 'limit')::int = 600, 'the active store owner sees 600');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect_error('select public.my_upload_allowance(''listing-photos'')', '42501');
reset role;

-- -------------------------------------------------------------------------------------------- the sweep's references
select pg_temp.check((select array_agg(r.bucket || ' ' || r.path) from laria_private.upload_ref(pg_temp.url('listing-photos', 'a/b/0.jpg')) r)
  = array['listing-photos a/b/0.jpg'], 'a public address names its bucket and path');
select pg_temp.check((select array_agg(r.bucket || ' ' || r.path) from laria_private.upload_ref(pg_temp.url('store-assets', 'a/b/logo.png?v=2')) r)
  = array['store-assets a/b/logo.png']
  and (select array_agg(r.bucket || ' ' || r.path) from laria_private.upload_ref(
    '/api/listing-images/e1500000-0000-4000-8000-000000000001/listing-edits/e1520000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-00000000000a/1.jpg#x') r)
  = array['listing-edit-photos e1500000-0000-4000-8000-000000000001/listing-edits/e1520000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-00000000000a/1.jpg'],
  'a query or fragment after the path still names the file, so the sweep keeps it');
select pg_temp.check((select array_agg(r.bucket || ' ' || r.path) from laria_private.upload_ref(
  '/api/listing-images/e1500000-0000-4000-8000-000000000001/listing-edits/e1520000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-00000000000a/0.jpg') r)
  = array['listing-edit-photos e1500000-0000-4000-8000-000000000001/listing-edits/e1520000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-00000000000a/0.jpg'],
  'the private photo route names an edit photo');
select pg_temp.check(not exists (select 1 from laria_private.upload_ref('/api/listing-images/import-photos/x/y.jpg'))
  and not exists (select 1 from laria_private.upload_ref('https://example.invalid/foto.jpg'))
  and not exists (select 1 from laria_private.upload_ref(pg_temp.url('store-imports', 'a/b.csv')))
  and not exists (select 1 from laria_private.upload_ref(null)), 'import photos, other sites and other buckets name nothing');
select pg_temp.check(laria_private.upload_is_sweepable('listing-photos', 'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/19.webp')
  and laria_private.upload_is_sweepable('listing-sound-clips', 'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/sonido-7.m4a')
  and laria_private.upload_is_sweepable('store-assets', 'e1500000-0000-4000-8000-000000000003/e1510000-0000-4000-8000-000000000003/profile-1761500000000-0.jpg')
  and laria_private.upload_is_sweepable('store-assets', 'e1500000-0000-4000-8000-000000000003/e1530000-0000-4000-8000-000000000003/2.png')
  and not laria_private.upload_is_sweepable('listing-photos', 'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/foto-0.jpg')
  and not laria_private.upload_is_sweepable('listing-photos', 'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/00.jpg')
  and not laria_private.upload_is_sweepable('store-assets', 'e1500000-0000-4000-8000-000000000003/e1510000-0000-4000-8000-000000000003/logo.png')
  and not laria_private.upload_is_sweepable('store-imports', 'e1500000-0000-4000-8000-000000000003/x/0.jpg'),
  'only the names the forms give files can be swept');

-- -------------------------------------------------------------------------------------------------------- the sweep
delete from storage.objects where name like 'e15%';
insert into storage.objects (bucket_id, name, owner, created_at)
select f.bucket, f.name, f.owner::uuid, now() - f.age::interval
from (values
  -- Nothing points at these, they have a form's name and they are older than 48 hours: queued.
  ('listing-photos', 'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/0.jpg', 'e1500000-0000-4000-8000-000000000001', '3 days'),
  ('listing-sound-clips', 'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/sonido-1.webm', 'e1500000-0000-4000-8000-000000000001', '3 days'),
  ('store-assets', 'e1500000-0000-4000-8000-000000000003/e1510000-0000-4000-8000-000000000003/profile-1761500000000-0.jpg', 'e1500000-0000-4000-8000-000000000003', '3 days'),
  ('listing-edit-photos', 'e1500000-0000-4000-8000-000000000001/listing-edits/e1520000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-00000000000a/1.jpg', 'e1500000-0000-4000-8000-000000000001', '3 days'),
  -- A listing photo, a draft's photo and sound clip, a store photo, a logo, an edit proposal's photo, a file another
  -- cleanup has claimed: kept.
  ('listing-photos', 'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/1.jpg', 'e1500000-0000-4000-8000-000000000001', '3 days'),
  ('listing-photos', 'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000002/0.jpg', 'e1500000-0000-4000-8000-000000000001', '3 days'),
  ('listing-sound-clips', 'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000002/sonido-0.webm', 'e1500000-0000-4000-8000-000000000001', '3 days'),
  ('store-assets', 'e1500000-0000-4000-8000-000000000003/e1510000-0000-4000-8000-000000000003/profile-1761500000000-1.jpg', 'e1500000-0000-4000-8000-000000000003', '3 days'),
  ('store-assets', 'e1500000-0000-4000-8000-000000000003/e1510000-0000-4000-8000-000000000003/logo.png', 'e1500000-0000-4000-8000-000000000003', '3 days'),
  ('listing-edit-photos', 'e1500000-0000-4000-8000-000000000001/listing-edits/e1520000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-00000000000a/0.jpg', 'e1500000-0000-4000-8000-000000000001', '3 days'),
  ('listing-photos', 'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/2.jpg', 'e1500000-0000-4000-8000-000000000001', '3 days'),
  -- Another name, too young, another bucket: kept.
  ('listing-photos', 'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/foto-0.jpg', 'e1500000-0000-4000-8000-000000000001', '3 days'),
  ('listing-photos', 'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000003/0.jpg', 'e1500000-0000-4000-8000-000000000001', '47 hours'),
  ('store-imports', 'e1500000-0000-4000-8000-000000000003/e1530000-0000-4000-8000-000000000003/0.jpg', 'e1500000-0000-4000-8000-000000000003', '3 days')
) as f(bucket, name, owner, age);
insert into public.listing_photos (listing_id, image_url, sort_order) values
 ('e1520000-0000-4000-8000-000000000001', pg_temp.url('listing-photos', 'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/1.jpg'), 0);
insert into public.listing_drafts (id, owner_user_id, kind, title, form, photos, sound_clip) values
 ('e1530000-0000-4000-8000-000000000002', 'e1500000-0000-4000-8000-000000000001', 'listing', 'Borrador', '{}',
  '[{"path":"e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000002/0.jpg"}]',
  '{"path":"e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000002/sonido-0.webm","duration":3}');
insert into public.store_photos (store_id, image_url, sort_order) values
 ('e1510000-0000-4000-8000-000000000003', pg_temp.url('store-assets', 'e1500000-0000-4000-8000-000000000003/e1510000-0000-4000-8000-000000000003/profile-1761500000000-1.jpg'), 0);
insert into public.listing_revisions (id, listing_id, owner_user_id, status, changed_fields, title) values
 ('e1540000-0000-4000-8000-000000000001', 'e1520000-0000-4000-8000-000000000003', 'e1500000-0000-4000-8000-000000000001',
  'pending', array['photos'], 'Guitarra en revisión');
insert into public.listing_revision_photos (revision_id, image_url, sort_order) values
 ('e1540000-0000-4000-8000-000000000001', '/api/listing-images/e1500000-0000-4000-8000-000000000001/listing-edits/e1520000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-00000000000a/0.jpg', 0);
insert into public.listing_photo_cleanup_claims (bucket, path) values
 ('listing-photos', 'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/2.jpg');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.check((select array_agg(c.bucket || ' ' || c.path order by c.bucket, c.path) from public.claim_upload_removals(100) c) = array[
  'listing-edit-photos e1500000-0000-4000-8000-000000000001/listing-edits/e1520000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-00000000000a/1.jpg',
  'listing-photos e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/0.jpg',
  'listing-sound-clips e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/sonido-1.webm',
  'store-assets e1500000-0000-4000-8000-000000000003/e1510000-0000-4000-8000-000000000003/profile-1761500000000-0.jpg'],
  'the claim queues exactly the four files nothing uses');
select pg_temp.check((select count(*) from public.claim_upload_removals(100)) = 4, 'a later claim hands out the same files until they are removed');
select pg_temp.check((select count(*) from public.claim_upload_removals(2)) = 2, 'at most p_limit at a time');
reset role;

-- A queued file can't be pointed at again: the guards refuse it.
select pg_temp.expect_error($$insert into public.listing_photos (listing_id, image_url, sort_order) values
  ('e1520000-0000-4000-8000-000000000003', pg_temp.url('listing-photos', 'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/0.jpg'), 1)$$,
  'UPLOAD_REMOVED');
-- A draft kept on the device whose files were swept, saved to the account later.
select pg_temp.expect_error($$insert into public.listing_drafts (id, owner_user_id, kind, title, form, photos) values
  ('e1530000-0000-4000-8000-000000000001', 'e1500000-0000-4000-8000-000000000001', 'listing', 'Borrador', '{}',
   '[{"path":"e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/0.jpg"}]')$$, 'UPLOAD_REMOVED');
select pg_temp.expect_error($$insert into public.listing_drafts (id, owner_user_id, kind, title, form, photos, sound_clip) values
  ('e1530000-0000-4000-8000-000000000001', 'e1500000-0000-4000-8000-000000000001', 'listing', 'Borrador', '{}', '[]',
   '{"path":"e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/sonido-1.webm","duration":3}')$$,
  'UPLOAD_REMOVED');
select pg_temp.expect_error($$insert into public.store_photos (store_id, image_url, sort_order) values
  ('e1510000-0000-4000-8000-000000000003', pg_temp.url('store-assets', 'e1500000-0000-4000-8000-000000000003/e1510000-0000-4000-8000-000000000003/profile-1761500000000-0.jpg'), 1)$$,
  'UPLOAD_REMOVED');
select pg_temp.expect_error($$update public.stores set banner_url = pg_temp.url('store-assets', 'e1500000-0000-4000-8000-000000000003/e1510000-0000-4000-8000-000000000003/profile-1761500000000-0.jpg')
  where id = 'e1510000-0000-4000-8000-000000000003'$$, 'UPLOAD_REMOVED');
select pg_temp.expect_error($$insert into public.listing_revision_photos (revision_id, image_url, sort_order) values
  ('e1540000-0000-4000-8000-000000000001', '/api/listing-images/e1500000-0000-4000-8000-000000000001/listing-edits/e1520000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-00000000000a/1.jpg', 1)$$,
  'UPLOAD_REMOVED');
-- A row that keeps its own file, or points at a file nobody queued, is untouched by the guards.
update public.listing_drafts set title = 'Borrador 2',
  photos = photos || '[{"path":"e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000002/1.jpg"}]'
where id = 'e1530000-0000-4000-8000-000000000002';
update public.listing_photos set sort_order = 3
where image_url = pg_temp.url('listing-photos', 'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/1.jpg');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.check(public.complete_upload_removals('listing-photos', array[
  'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/0.jpg',
  'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/1.jpg']) = 1, 'only a queued file is marked removed');
select pg_temp.check((select count(*) from public.claim_upload_removals(100)) = 3, 'the three not removed yet come back');
select pg_temp.check(public.complete_upload_removals('listing-sound-clips', array['e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/sonido-1.webm'])
  + public.complete_upload_removals('store-assets', array['e1500000-0000-4000-8000-000000000003/e1510000-0000-4000-8000-000000000003/profile-1761500000000-0.jpg'])
  + public.complete_upload_removals('listing-edit-photos', array['e1500000-0000-4000-8000-000000000001/listing-edits/e1520000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-00000000000a/1.jpg']) = 3,
  'the rest are marked removed');
select pg_temp.check((select count(*) from public.claim_upload_removals(100)) = 0,
  'then nothing: the files Storage removed stay listed, so they are not queued again');
select pg_temp.expect_error('select public.claim_upload_removals(0)', '22023');
select pg_temp.expect_error('select public.complete_upload_removals(''listing-photos'', null)', '22023');
reset role;
select pg_temp.expect_error($$insert into public.listing_photos (listing_id, image_url, sort_order) values
  ('e1520000-0000-4000-8000-000000000003', pg_temp.url('listing-photos', 'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/0.jpg'), 1)$$,
  'UPLOAD_REMOVED');
-- A month after their removal the rows go, with the next report.
update laria_private.upload_removals set removed_at = now() - interval '31 days'
where path = 'e1500000-0000-4000-8000-000000000001/e1530000-0000-4000-8000-000000000001/0.jpg';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.complete_upload_removals('listing-photos', array[]::text[]);
reset role;
select pg_temp.check((select count(*) from laria_private.upload_removals where path like 'e15%') = 3, 'rows removed a month ago are dropped');
-- Another bucket's file queued by hand (as laria_private.anonymize_account_feature_data may) is handed out as well.
insert into laria_private.upload_removals (bucket, path) values ('stolen-gear-photos', 'e1500000-0000-4000-8000-000000000001/x.jpg');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.check((select array_agg(c.bucket) from public.claim_upload_removals(100) c) = array['stolen-gear-photos'],
  'a file queued by hand in another bucket is handed out too');
reset role;
delete from laria_private.upload_removals where bucket = 'stolen-gear-photos';

set local role authenticated;
select pg_temp.claims('e1500000-0000-4000-8000-000000000001');
select pg_temp.expect_error('select public.claim_upload_removals(10)', '42501');
select pg_temp.expect_error('select public.complete_upload_removals(''listing-photos'', array[''a''])', '42501');
select pg_temp.expect_error('select laria_private.scrub_marketplace_events(10)', '42501');
select pg_temp.expect_error('select laria_private.run_marketplace_event_retention()', '42501');
select pg_temp.check((select count(*) from storage.objects where name like 'e1500000-0000-4000-8000-000000000003/%') = 0,
  'the sweep changes nothing about who reads which file');
reset role;

-- ------------------------------------------------------------------------------------------------ the anonymization
-- Everything the account has, and the same kinds of rows of another account, which must stay.
insert into auth.identities (user_id, identity_data) values
 ('e1500000-0000-4000-8000-000000000001', '{"email":"lapv-uno@example.invalid"}'), ('e1500000-0000-4000-8000-000000000004', '{}');
insert into auth.sessions (user_id) values ('e1500000-0000-4000-8000-000000000001'), ('e1500000-0000-4000-8000-000000000004');
insert into auth.refresh_tokens (user_id, token) values ('e1500000-0000-4000-8000-000000000001', 'r1'), ('e1500000-0000-4000-8000-000000000004', 'r4');
insert into auth.mfa_factors (user_id) values ('e1500000-0000-4000-8000-000000000001'), ('e1500000-0000-4000-8000-000000000004');
insert into auth.one_time_tokens (user_id) values ('e1500000-0000-4000-8000-000000000001'), ('e1500000-0000-4000-8000-000000000004');
insert into auth.flow_state (user_id) values ('e1500000-0000-4000-8000-000000000001'), ('e1500000-0000-4000-8000-000000000004');
insert into auth.audit_log_entries (payload) values
 ('{"actor_id":"e1500000-0000-4000-8000-000000000001","actor_username":"lapv-uno@example.invalid"}'),
 ('{"actor_id":"e1500000-0000-4000-8000-000000000004"}');
insert into public.favorites (user_id, listing_id) values
 ('e1500000-0000-4000-8000-000000000001', 'e1520000-0000-4000-8000-000000000004'),
 ('e1500000-0000-4000-8000-000000000004', 'e1520000-0000-4000-8000-000000000001');
insert into public.favorite_shares (user_id, token) values ('e1500000-0000-4000-8000-000000000001', 'lapv-share-token-uno-0000000000');
insert into public.follows (user_id, store_id, brand) values
 ('e1500000-0000-4000-8000-000000000001', 'e1510000-0000-4000-8000-000000000002', null),
 ('e1500000-0000-4000-8000-000000000001', null, 'Fender');
insert into public.saved_search_alerts (id, user_id, search_filters, search_hash, match_bucket, frequency) values
 ('e1550000-0000-4000-8000-000000000001', 'e1500000-0000-4000-8000-000000000001', '{"q":"strat"}', repeat('a', 64), 'all', 'daily');
insert into laria_private.search_alert_matches (alert_id, user_id, listing_id, matched_local_date) values
 ('e1550000-0000-4000-8000-000000000001', 'e1500000-0000-4000-8000-000000000001', 'e1520000-0000-4000-8000-000000000004', current_date);
insert into public.listing_stock_watches (user_id, listing_id) values ('e1500000-0000-4000-8000-000000000001', 'e1520000-0000-4000-8000-000000000004');
insert into public.listing_edit_attempts (user_id, attempt_id, listing_id, payload_hash, result) values
 ('e1500000-0000-4000-8000-000000000001', 'e1530000-0000-4000-8000-00000000000a', 'e1520000-0000-4000-8000-000000000001', repeat('b', 64), '{}');
insert into public.email_preferences (user_id) values ('e1500000-0000-4000-8000-000000000001');
insert into public.notifications (id, user_id, event_type, message, listing_id) values
 ('e1560000-0000-4000-8000-000000000001', 'e1500000-0000-4000-8000-000000000001', 'listing_approved', 'Tu publicación fue aprobada.', 'e1520000-0000-4000-8000-000000000001'),
 ('e1560000-0000-4000-8000-000000000004', 'e1500000-0000-4000-8000-000000000004', 'listing_approved', 'Tu publicación fue aprobada.', 'e1520000-0000-4000-8000-000000000004');
insert into laria_private.marketplace_email_deliveries (event_type, recipient_user_id, recipient_email, notification_id, listing_id, dedupe_key) values
 ('listing_approved', 'e1500000-0000-4000-8000-000000000001', 'lapv-uno@example.invalid', 'e1560000-0000-4000-8000-000000000001', 'e1520000-0000-4000-8000-000000000001', 'lapv-delivery-uno');
insert into laria_private.push_subscriptions (user_id, endpoint, p256dh, auth_secret) values
 ('e1500000-0000-4000-8000-000000000001', 'https://fcm.googleapis.com/fcm/send/lapv-uno',
  'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg');
insert into laria_private.push_deliveries (notification_id, user_id) values
 ('e1560000-0000-4000-8000-000000000001', 'e1500000-0000-4000-8000-000000000001');
insert into public.purchase_checkins (listing_id, buyer_user_id, seller_user_id, contacted_at) values
 ('e1520000-0000-4000-8000-000000000004', 'e1500000-0000-4000-8000-000000000001', 'e1500000-0000-4000-8000-000000000004', now());
insert into public.listing_questions (id, listing_id, asker_user_id, body, answer, answered_at, answered_by) values
 ('e1570000-0000-4000-8000-000000000001', 'e1520000-0000-4000-8000-000000000004', 'e1500000-0000-4000-8000-000000000001', '¿Tiene estuche?', null, null, null),
 ('e1570000-0000-4000-8000-000000000002', 'e1520000-0000-4000-8000-000000000004', 'e1500000-0000-4000-8000-000000000001', '¿Acepta cambios?', 'No, gracias.', now(), 'e1500000-0000-4000-8000-000000000004'),
 ('e1570000-0000-4000-8000-000000000003', 'e1520000-0000-4000-8000-000000000004', 'e1500000-0000-4000-8000-000000000001', '¿Precio final?', null, null, null);
insert into public.reports (reporter_user_id, reason, target_type, question_id) values
 ('e1500000-0000-4000-8000-000000000004', 'spam', 'question', 'e1570000-0000-4000-8000-000000000003');
insert into public.marketplace_events (event_type, listing_id, seller_user_id, actor_user_id, session_id, source, identity_key) values
 ('listing_view', 'e1520000-0000-4000-8000-000000000004', 'e1500000-0000-4000-8000-000000000004', 'e1500000-0000-4000-8000-000000000001', null, 'detail',
  'user:e1500000-0000-4000-8000-000000000001:listing_view:e1520000-0000-4000-8000-000000000004'),
 ('listing_view', 'e1520000-0000-4000-8000-000000000001', 'e1500000-0000-4000-8000-000000000001', 'e1500000-0000-4000-8000-000000000004', null, 'detail',
  'user:e1500000-0000-4000-8000-000000000004:listing_view:e1520000-0000-4000-8000-000000000001');
-- The features branch's own data comes through its hook, when it exists.
create temp table feature_calls (user_id uuid) on commit drop;
grant insert on feature_calls to public;
create function laria_private.anonymize_account_feature_data(p_user_id uuid) returns jsonb language plpgsql as $$
begin
  insert into feature_calls values (p_user_id);
  return jsonb_build_object('devices', 1);
end $$;

-- Who may run it.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect_error('select public.admin_anonymize_account(''e1500000-0000-4000-8000-000000000001'', ''Motivo'')', '42501');
reset role;
set local role authenticated;
select pg_temp.claims('e1500000-0000-4000-8000-000000000004');
select pg_temp.expect_error('select public.admin_anonymize_account(''e1500000-0000-4000-8000-000000000001'', ''Motivo'')', 'ADMIN_REQUIRED');
select pg_temp.expect_error('select laria_private.anonymize_account(''e1500000-0000-4000-8000-000000000001'')', '42501');
select pg_temp.claims('e1500000-0000-4000-8000-000000000005', true, 'aal1');
select pg_temp.expect_error('select public.admin_anonymize_account(''e1500000-0000-4000-8000-000000000001'', ''Motivo'')', 'ADMIN_MFA_REQUIRED');
select pg_temp.claims('e1500000-0000-4000-8000-000000000005', true, 'aal2');
select pg_temp.expect_error('select public.admin_anonymize_account(''e1500000-0000-4000-8000-000000000001'', ''  '')', 'ANONYMIZE_REASON_REQUIRED');
select pg_temp.expect_error('select public.admin_anonymize_account(''e1500000-0000-4000-8000-000000000005'', ''Prueba'')', 'ANONYMIZE_ADMIN');
select pg_temp.expect_error('select public.admin_anonymize_account(''e1500000-0000-4000-8000-000000000002'', ''Pedido del titular'')', 'ANONYMIZE_ACTIVE_STORE');
select pg_temp.expect_error('select public.admin_anonymize_account(''e1500000-0000-4000-8000-0000000000ff'', ''Pedido del titular'')', 'ANONYMIZE_ACCOUNT_NOT_FOUND');
reset role;
select pg_temp.expect_error('select laria_private.anonymize_account(''e1500000-0000-4000-8000-000000000001'')', 'ANONYMIZE_SERVICE_REQUIRED');
-- The service role reaches it only through a security definer function (features/marketplace's
-- public.service_delete_account), as this suite does from here on: it has no access to laria_private.
select pg_temp.check(not has_function_privilege('service_role', 'laria_private.anonymize_account(uuid, text)', 'execute')
  and not has_schema_privilege('service_role', 'laria_private', 'usage')
  and not has_schema_privilege('authenticated', 'laria_private', 'usage'), 'no API role calls the anonymisation directly');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.expect_error('select laria_private.anonymize_account(''e1500000-0000-4000-8000-000000000005'')', 'ANONYMIZE_ADMIN');
select pg_temp.check((select full_name from public.profiles where id = 'e1500000-0000-4000-8000-000000000001') = 'Persona Uno',
  'a refused call changes nothing');

-- The service entry, as the self-service deletion calls it.
create temp table run_one on commit drop as
select laria_private.anonymize_account('e1500000-0000-4000-8000-000000000001', 'self_service') as result;
select set_config('request.jwt.claims', '', true);
select pg_temp.check((select result ->> 'user_id' from run_one) = 'e1500000-0000-4000-8000-000000000001'
  and (select (result ->> 'listings_archived')::int from run_one) = 2
  and (select (result ->> 'listings_scrubbed')::int from run_one) = 3
  and (select result -> 'features' from run_one) = '{"devices": 1}'::jsonb
  and (select result -> 'auth' ->> 'identities' from run_one) = '1',
  'the result counts what was cleared, the feature data included');
select pg_temp.check((select array_agg(user_id) from feature_calls) = array['e1500000-0000-4000-8000-000000000001'::uuid],
  'the features hook ran once, for this account');
select pg_temp.check((select row(full_name, phone, city) is not distinct from row('Cuenta eliminada'::text, null::text, null::text)
  from public.profiles where id = 'e1500000-0000-4000-8000-000000000001'), 'the profile keeps no name, phone or city');
select pg_temp.check((select email is null and phone is null and encrypted_password = '' and raw_user_meta_data = '{}'::jsonb
    and banned_until > now() + interval '900 years' and deleted_at is not null and recovery_token = '' and email_change = ''
    and raw_app_meta_data = '{"provider":"email"}'::jsonb
  from auth.users where id = 'e1500000-0000-4000-8000-000000000001'),
  'the sign-in has no e-mail, phone, password or pending link, and is banned');
select pg_temp.check((select count(*) from auth.identities where user_id = 'e1500000-0000-4000-8000-000000000001')
  + (select count(*) from auth.sessions where user_id = 'e1500000-0000-4000-8000-000000000001')
  + (select count(*) from auth.refresh_tokens where user_id = 'e1500000-0000-4000-8000-000000000001')
  + (select count(*) from auth.mfa_factors where user_id = 'e1500000-0000-4000-8000-000000000001')
  + (select count(*) from auth.one_time_tokens where user_id = 'e1500000-0000-4000-8000-000000000001')
  + (select count(*) from auth.flow_state where user_id = 'e1500000-0000-4000-8000-000000000001')
  + (select count(*) from auth.audit_log_entries where payload ->> 'actor_id' = 'e1500000-0000-4000-8000-000000000001') = 0,
  'identities, sessions, tokens, factors and the Auth log of the account are gone');
select pg_temp.check((select count(*) from auth.identities) + (select count(*) from auth.sessions)
  + (select count(*) from auth.refresh_tokens) + (select count(*) from auth.mfa_factors)
  + (select count(*) from auth.one_time_tokens) + (select count(*) from auth.flow_state)
  + (select count(*) from auth.audit_log_entries) = 7
  and (select email from auth.users where id = 'e1500000-0000-4000-8000-000000000004') = 'lapv-otra@example.invalid',
  'another account keeps all of its own');
select pg_temp.check((select array_agg(row(status, contact_name, whatsapp_phone)::text order by slug) from public.listings
    where owner_user_id = 'e1500000-0000-4000-8000-000000000001')
  = array['(archived,,"")', '(archived,,"")', '(sold,,"")'],
  'listings not sold are archived, and none keeps a contact');
select pg_temp.check((select archived_at is not null from public.listings where id = 'e1520000-0000-4000-8000-000000000001')
  and (select contact_name = 'Otra' from public.listings where id = 'e1520000-0000-4000-8000-000000000004'),
  'archived now; another person''s listing is untouched');
select pg_temp.check((select row(status, resolution_reason) = row('cancelled'::text, 'Cuenta eliminada'::text)
  from public.listing_revisions where id = 'e1540000-0000-4000-8000-000000000001'), 'a pending edit is cancelled');
select pg_temp.check((select count(*) from public.favorites where user_id = 'e1500000-0000-4000-8000-000000000001')
  + (select count(*) from public.favorite_shares where user_id = 'e1500000-0000-4000-8000-000000000001')
  + (select count(*) from public.follows where user_id = 'e1500000-0000-4000-8000-000000000001')
  + (select count(*) from public.saved_search_alerts where user_id = 'e1500000-0000-4000-8000-000000000001')
  + (select count(*) from laria_private.search_alert_matches where user_id = 'e1500000-0000-4000-8000-000000000001')
  + (select count(*) from public.listing_stock_watches where user_id = 'e1500000-0000-4000-8000-000000000001')
  + (select count(*) from public.listing_drafts where owner_user_id = 'e1500000-0000-4000-8000-000000000001')
  + (select count(*) from public.listing_edit_attempts where user_id = 'e1500000-0000-4000-8000-000000000001')
  + (select count(*) from public.email_preferences where user_id = 'e1500000-0000-4000-8000-000000000001')
  + (select count(*) from laria_private.marketplace_email_deliveries where recipient_user_id = 'e1500000-0000-4000-8000-000000000001')
  + (select count(*) from public.notifications where user_id = 'e1500000-0000-4000-8000-000000000001')
  + (select count(*) from laria_private.push_subscriptions where user_id = 'e1500000-0000-4000-8000-000000000001')
  + (select count(*) from laria_private.push_deliveries where user_id = 'e1500000-0000-4000-8000-000000000001')
  + (select count(*) from public.purchase_checkins where buyer_user_id = 'e1500000-0000-4000-8000-000000000001') = 0,
  'favorites, lists, follows, alerts, watches, drafts, attempts, preferences, e-mails, notices, devices and check-ins are gone');
select pg_temp.check((select count(*) from public.favorites where user_id = 'e1500000-0000-4000-8000-000000000004') = 1
  and (select count(*) from public.notifications where user_id = 'e1500000-0000-4000-8000-000000000004') = 1,
  'another person''s favorite of the archived listing and their notice stay');
select pg_temp.check((select array_agg(id order by id) from public.listing_questions where asker_user_id = 'e1500000-0000-4000-8000-000000000001')
  = array['e1570000-0000-4000-8000-000000000002'::uuid, 'e1570000-0000-4000-8000-000000000003'::uuid],
  'an unanswered question goes; an answered one stays, and so does a reported one');
select pg_temp.check(not exists (select 1 from public.marketplace_events
    where actor_user_id = 'e1500000-0000-4000-8000-000000000001' or seller_user_id = 'e1500000-0000-4000-8000-000000000001'
      or identity_key like 'user:e1500000-0000-4000-8000-000000000001:%')
  and exists (select 1 from public.marketplace_events where listing_id = 'e1520000-0000-4000-8000-000000000004'
    and event_type = 'listing_view' and actor_user_id is null and identity_key is null
    and seller_user_id = 'e1500000-0000-4000-8000-000000000004')
  and exists (select 1 from public.marketplace_events where listing_id = 'e1520000-0000-4000-8000-000000000001'
    and event_type = 'listing_view' and seller_user_id is null and actor_user_id = 'e1500000-0000-4000-8000-000000000004'),
  'events keep no link to the account, and keep the other person''s');
select pg_temp.check((select row(reason, requested_by) is not distinct from row('self_service'::text, null::uuid) and first_anonymized_at = last_anonymized_at
  from laria_private.account_anonymizations where user_id = 'e1500000-0000-4000-8000-000000000001'), 'the run is recorded');

-- Running it again is harmless and updates the record.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temp table run_two on commit drop as
select laria_private.anonymize_account('e1500000-0000-4000-8000-000000000001') as result;
select pg_temp.check((select (result ->> 'listings_archived')::int + (result ->> 'listings_scrubbed')::int
  + (result ->> 'favorites')::int + (result ->> 'events_unlinked')::int + (result -> 'auth' ->> 'identities')::int from run_two) = 0,
  'a second run finds nothing left');
select set_config('request.jwt.claims', '', true);
select pg_temp.check((select reason = 'self_service' and counts ->> 'listings_archived' = '0'
  from laria_private.account_anonymizations where user_id = 'e1500000-0000-4000-8000-000000000001'), 'the record keeps the first reason');

-- The Admin entry, for an account whose store is under review.
set local role authenticated;
select pg_temp.claims('e1500000-0000-4000-8000-000000000005', true, 'aal2');
select pg_temp.check((public.admin_anonymize_account('e1500000-0000-4000-8000-000000000003', '  Pedido por correo del titular ')
  ->> 'stores_scrubbed')::int = 1, 'Admin anonymises the account of a store under review');
select pg_temp.check((select jsonb_array_length(public.get_admin_audit_history('account', 'e1500000-0000-4000-8000-000000000003', 10))) = 1
  and (select public.get_admin_audit_history('account', 'e1500000-0000-4000-8000-000000000003', 10) -> 0 ->> 'action') = 'anonymize_account'
  and (select public.get_admin_audit_history('account', 'e1500000-0000-4000-8000-000000000003', 10) -> 0 -> 'detail' ->> 'reason') = 'Pedido por correo del titular',
  'the Admin audit lists it under the account, with the reason');
reset role;
select pg_temp.check((select row(status::text, rejection_reason, contact_name, contact_person, email, whatsapp_phone, address,
    public_address, show_address, name, ruc)
  is not distinct from row('rejected', 'Cuenta eliminada', null, null, null, '', null, null, false, 'Tienda Pendiente', '20100047302')
  from public.stores where id = 'e1510000-0000-4000-8000-000000000003'),
  'the store is rejected and keeps no contact, while the business name and RUC stay');
select pg_temp.check((select row(status, holder_name, owner_note) is not distinct from row('withdrawn'::text, null::text, null::text)
  from public.store_payment_methods where store_id = 'e1510000-0000-4000-8000-000000000003'),
  'its payment method is withdrawn without the holder''s name');
select pg_temp.check((select requested_by = 'e1500000-0000-4000-8000-000000000005' from laria_private.account_anonymizations
  where user_id = 'e1500000-0000-4000-8000-000000000003'), 'the record names the Admin');
select pg_temp.check(not exists (select 1 from public.store_members where user_id = 'e1500000-0000-4000-8000-000000000003'),
  'the account is no member of the store any more');
select pg_temp.check((select full_name from public.profiles where id = 'e1500000-0000-4000-8000-000000000002') = 'Dueña Activa',
  'the active store''s owner is untouched');
drop function laria_private.anonymize_account_feature_data(uuid);

-- ------------------------------------------------------------------------------------------- analytics event retention
delete from public.marketplace_events;
insert into public.marketplace_events (event_type, created_at, listing_id, seller_user_id, actor_user_id, session_id, source, identity_key)
select f.kind, now() - f.age::interval, 'e1520000-0000-4000-8000-000000000004', 'e1500000-0000-4000-8000-000000000004',
  'e1500000-0000-4000-8000-000000000002', gen_random_uuid(), 'detail', 'user:x:' || f.kind || ':' || f.age
from (values ('listing_view', '100 days'), ('listing_impression', '95 days'), ('listing_view', '80 days'),
  ('whatsapp_contact', '200 days'), ('whatsapp_contact', '400 days')) as f(kind, age);
select pg_temp.check(laria_private.scrub_marketplace_events(1) = 1, 'a call clears at most p_limit events');
select pg_temp.check(laria_private.scrub_marketplace_events(5000) = 2, 'the next one goes on from there');
select pg_temp.check(laria_private.scrub_marketplace_events(5000) = 0, 'and then nothing is left to read');
select pg_temp.check((select array_agg(row(event_type, actor_user_id is null, session_id is null, identity_key is null,
    seller_user_id is not null)::text order by created_at)
  from public.marketplace_events)
  = array['(whatsapp_contact,t,t,t,t)', '(whatsapp_contact,f,f,f,t)', '(listing_view,t,t,t,t)', '(listing_impression,t,t,t,t)',
    '(listing_view,f,f,f,t)'],
  'browsing after 90 days and every event after 365 lose the person; the seller and the counts stay');
select pg_temp.check((select browsing_at between now() - interval '90 days 1 minute' and now() - interval '89 days 23 hours'
  and other_at between now() - interval '365 days 1 minute' and now() - interval '364 days 23 hours'
  and browsing_id = '00000000-0000-0000-0000-000000000000' and other_id = browsing_id
  from laria_private.marketplace_event_scrub_clock), 'the clock remembers where the runs left off');
-- An event that comes of age later is read by a later run, and one the clock has passed is not read again.
update public.marketplace_events set created_at = now() - interval '91 days' where event_type = 'listing_view'
  and created_at > now() - interval '85 days';
select pg_temp.check(laria_private.scrub_marketplace_events(5000) = 0, 'an event moved behind the clock is not read again');
update laria_private.marketplace_event_scrub_clock set browsing_at = now() - interval '92 days';
select pg_temp.check(laria_private.scrub_marketplace_events(5000) = 1, 'one past the clock is');
select pg_temp.check(not exists (select 1 from public.marketplace_events where event_type = 'listing_view' and actor_user_id is not null),
  'and is cleared');

-- The daily run goes on batch after batch until one comes back short.
delete from laria_private.marketplace_event_scrub_clock;
insert into public.marketplace_events (event_type, created_at, actor_user_id, session_id, source, identity_key)
select 'listing_impression', now() - interval '100 days' - n * interval '1 second', 'e1500000-0000-4000-8000-000000000002',
  gen_random_uuid(), 'detail', 'user:x:' || n
from generate_series(1, 5003) n;
select pg_temp.check(laria_private.run_marketplace_event_retention() = 5007, 'one run reads past the first batch of 5,000');
select pg_temp.check(not exists (select 1 from public.marketplace_events where created_at < now() - interval '90 days'
    and event_type <> 'whatsapp_contact' and (actor_user_id is not null or session_id is not null or identity_key is not null)),
  'and clears every browsing event past 90 days');
select pg_temp.check(exists (select 1 from cron.job where jobname = 'marketplace-event-retention' and schedule = '45 9 * * *'
    and command = 'select laria_private.run_marketplace_event_retention()'),
  'pg_cron runs it every day');

rollback;
