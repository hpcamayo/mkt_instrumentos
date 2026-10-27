-- Launch audit A27, step 2 (supabase/migrations/20261114140000_launch_audit_contact_columns.sql): through the public
-- API key nobody reads a listing's contact, its internal fields or another user's profile; public pages and owners
-- keep what they read. Local/test database only. Every fixture is rolled back.
begin;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;

-- p_sql must fail for lack of rights.
create function pg_temp.refused(p_sql text, p_message text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'FAILED: %', p_message;
end $$;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('a2730000-0000-4000-8000-000000000001','authenticated','authenticated','a27c-particular@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"seller","full_name":"Particular A27","phone":"51911137001","city":"Lima","region":"Lima"}'),
  ('a2730000-0000-4000-8000-000000000003','authenticated','authenticated','a27c-buyer@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"seller","full_name":"Comprador A27","phone":"51911137003","city":"Lima","region":"Lima"}');

set local session_replication_role = replica;
insert into public.listings (id, owner_user_id, seller_type, status, title, slug, description, category, instrument_type,
  brand, model, condition, price_pen, city, region, contact_name, whatsapp_phone, published_at, rejection_reason,
  hidden_source, created_by_source)
values
  ('a2740000-0000-4000-8000-000000000001', 'a2730000-0000-4000-8000-000000000001', 'individual', 'approved',
    'Guitarra A27 pública', 'a27c-publica', 'Guitarra de prueba para la auditoría de contactos.', 'guitars',
    'electric_guitar', 'QA', 'Uno', 'Usado - buen estado', 900, 'Lima', 'Lima', 'Particular A27', '51911137001',
    now() - interval '1 day', null, null, 'self_service'),
  ('a2740000-0000-4000-8000-000000000002', 'a2730000-0000-4000-8000-000000000001', 'individual', 'hidden',
    'Pedal A27 oculto', 'a27c-oculta', 'Pedal de prueba para la auditoría de contactos.', 'pedals', 'distortion', 'QA',
    'Dos', 'Nuevo', 300, 'Lima', 'Lima', 'Particular A27', '51911137001', now() - interval '5 days', 'Fotos borrosas',
    'owner', 'self_service');
insert into public.listing_photos (listing_id, image_url, sort_order)
values ('a2740000-0000-4000-8000-000000000001', 'https://example.invalid/a27c-publica-0.jpg', 0);
set local session_replication_role = origin;

create temporary table private_listing_columns(name text) on commit drop;
insert into private_listing_columns values
  ('contact_name'), ('whatsapp_phone'), ('archived_at'), ('hidden_at'), ('created_by_source'),
  ('marketplace_rules_accepted_at'), ('relisted_from_listing_id'), ('availability_checkin_at'), ('price_changed_at');
create temporary table owner_listing_columns(name text) on commit drop;
insert into owner_listing_columns values ('rejection_reason'), ('rejection_codes'), ('hidden_source'), ('hidden_reason');
grant select on private_listing_columns, owner_listing_columns to anon, authenticated;

-- The grants: the public columns are exactly the view's (a public column added later goes in both, docs/database.md),
-- and the profile policy for visitors is gone.
select pg_temp.check((
  select array_agg(a.attname::text order by a.attname) from pg_attribute a
  where a.attrelid = 'public.listings'::regclass and a.attnum > 0 and not a.attisdropped
    and has_column_privilege('anon', a.attrelid, a.attnum, 'select')
) = (
  select array_agg(c.column_name::text order by c.column_name) from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'public_listings'
), 'visitors read on listings exactly the columns of public_listings');
select pg_temp.check(not has_table_privilege('anon', 'public.listings', 'select')
  and not has_table_privilege('authenticated', 'public.listings', 'select'), 'no table-wide read on listings');
select pg_temp.check(not has_table_privilege('anon', 'public.profiles', 'select'), 'visitors read no profile');
select pg_temp.check(not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
  and policyname = 'Public can read profiles for approved listings'), 'the public profile policy is gone');

-- Visitors.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.check((select title || ' ' || view_count from public.listings l
  where l.slug = 'a27c-publica' and l.owner_user_id = 'a2730000-0000-4000-8000-000000000001') is not null,
  'visitors read and filter on the public columns');
select pg_temp.check((select count(*) from public.listing_photos where listing_id = 'a2740000-0000-4000-8000-000000000001') = 1,
  'the photos of a public listing are still public (their policy reads listings columns)');
select pg_temp.check((select public.listing_photo_count(p) from public.public_listings p where p.slug = 'a27c-publica') = 1,
  'cards read their computed fields on public_listings');
select pg_temp.refused(format('select %I from public.listings where slug = %L', c.name, 'a27c-publica'),
  format('a visitor read listings.%s', c.name))
from (select name from private_listing_columns union all select name from owner_listing_columns) c;
select pg_temp.refused($$select * from public.listings where slug = 'a27c-publica'$$, 'a visitor read every column with select *');
select pg_temp.refused($$select public.listing_photo_count(l) from public.listings l where slug = 'a27c-publica'$$,
  'a visitor read a whole listings row');
select pg_temp.refused($$select id from public.listings where whatsapp_phone = '51911137001'$$,
  'a visitor searched listings by WhatsApp number');
select pg_temp.refused($$select full_name from public.profiles$$, 'a visitor read a profile');
reset role;

-- A signed-in buyer: the same, except the moderation fields (empty on a public listing); no other user's profile.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2730000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select pg_temp.refused(format('select %I from public.listings where slug = %L', c.name, 'a27c-publica'),
  format('a signed-in buyer read listings.%s', c.name))
from private_listing_columns c;
select pg_temp.check((select rejection_reason is null and hidden_source is null from public.listings where slug = 'a27c-publica'),
  'the moderation fields of a public listing are readable and empty');
select pg_temp.check(not exists (select 1 from public.profiles where id = 'a2730000-0000-4000-8000-000000000001'),
  'a signed-in buyer does not see the profile of a seller with an approved listing');
select pg_temp.check((select phone from public.profiles where id = 'a2730000-0000-4000-8000-000000000003') = '51911137003',
  'a signed-in user reads their own profile, phone included');

-- The owner: the moderation fields of their own hidden listing; its contact comes from their profile, not from here.
select set_config('request.jwt.claims', '{"sub":"a2730000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.check((select rejection_reason || ' ' || hidden_source from public.listings where slug = 'a27c-oculta')
  = 'Fotos borrosas owner', 'an owner reads why their listing was rejected or hidden');
select pg_temp.refused($$select whatsapp_phone from public.listings where slug = 'a27c-oculta'$$,
  'an owner read a listing''s contact through the API');

-- Admin: every profile as before; a listing's contact only through admin_get_listing.
select set_config('request.jwt.claims', '{"sub":"a2730000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal2","app_metadata":{"role":"admin"}}', true);
select pg_temp.check((select count(*) from public.profiles where id in ('a2730000-0000-4000-8000-000000000001',
  'a2730000-0000-4000-8000-000000000003')) = 2, 'Admin reads every profile');
select pg_temp.check((select whatsapp_phone from public.admin_get_listing('a2740000-0000-4000-8000-000000000002')) = '51911137001',
  'Admin reads a listing''s contact through admin_get_listing');
select pg_temp.refused($$select contact_name from public.listings where slug = 'a27c-publica'$$,
  'Admin read a listing''s contact on the table');
reset role;

-- The server (service role): everything, as the listing page and the contact button read it.
set local role service_role;
select pg_temp.check((select l.contact_name || ' ' || l.whatsapp_phone || ' ' || p.phone from public.listings l
  join public.profiles p on p.id = l.owner_user_id where l.slug = 'a27c-publica') = 'Particular A27 51911137001 51911137001',
  'the service role reads the contact and the profile');
reset role;

select 'launch audit A27 step 2: contact columns and other users'' profiles are private' as result;
rollback;
