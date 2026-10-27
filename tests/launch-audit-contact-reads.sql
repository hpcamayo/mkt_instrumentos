-- Launch audit A27, step 1 (supabase/migrations/20261114130000_launch_audit_contact_reads.sql): public pages read a
-- listing's public columns through public.public_listings, with the computed fields the cards use; the catalog's
-- search returns those rows; Admin reads a listing's contact through admin_get_listing. Passes before and after step 2
-- (20261114140000). Local/test database only. Every fixture is rolled back.
begin;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('a2700000-0000-4000-8000-000000000001','authenticated','authenticated','a27-particular@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"seller","full_name":"Particular A27","phone":"51911127001","city":"Lima","region":"Lima"}'),
  ('a2700000-0000-4000-8000-000000000002','authenticated','authenticated','a27-store@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"store_owner","full_name":"Dueño A27","phone":"51911127002","city":"Lima","region":"Lima"}'),
  ('a2700000-0000-4000-8000-000000000003','authenticated','authenticated','a27-buyer@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"seller","full_name":"Comprador A27","phone":"51911127003","city":"Lima","region":"Lima"}');

-- Rows as the database holds them, without the publication triggers.
set local session_replication_role = replica;
insert into public.stores (id, name, slug, status, is_verified, whatsapp_phone, city, region, owner_user_id)
values
  ('a2710000-0000-4000-8000-000000000001', 'Tienda A27', 'a27-tienda', 'active', true, '51911127002', 'Lima', 'Lima', 'a2700000-0000-4000-8000-000000000002'),
  ('a2710000-0000-4000-8000-000000000002', 'Tienda A27 oculta', 'a27-tienda-oculta', 'hidden', true, '51911127004', 'Lima', 'Lima', null);

insert into public.listings (id, store_id, owner_user_id, seller_type, status, title, slug, description, category,
  instrument_type, brand, model, condition, price_pen, previous_price_pen, price_dropped_at, city, region,
  contact_name, whatsapp_phone, published_at, rejection_reason)
values
  -- A Particular's approved listing whose price dropped yesterday.
  ('a2720000-0000-4000-8000-000000000001', null, 'a2700000-0000-4000-8000-000000000001', 'individual', 'approved',
    'Guitarra Zqa27marca particular', 'a27-particular', 'Guitarra de prueba para la auditoría de contactos.', 'guitars',
    'electric_guitar', 'Zqa27marca', 'Uno', 'Usado - buen estado', 900, 1000, now() - interval '1 day', 'Lima', 'Lima',
    'Particular A27', '51911127001', now() - interval '2 days', null),
  -- A verified store's approved listing.
  ('a2720000-0000-4000-8000-000000000002', 'a2710000-0000-4000-8000-000000000001', 'a2700000-0000-4000-8000-000000000002',
    'store', 'approved', 'Bajo Zqa27marca tienda', 'a27-tienda-bajo', 'Bajo de prueba para la auditoría de contactos.',
    'basses', 'electric_bass', 'Zqa27marca', 'Dos', 'Nuevo', 1500, null, null, 'Lima', 'Lima', 'Tienda A27',
    '51911127002', now() - interval '1 day', null),
  -- The Particular's pending listing, with the note of an earlier review.
  ('a2720000-0000-4000-8000-000000000003', null, 'a2700000-0000-4000-8000-000000000001', 'individual', 'pending',
    'Pedal Zqa27marca pendiente', 'a27-pendiente', 'Pedal de prueba para la auditoría de contactos.', 'pedals',
    'distortion', 'Zqa27marca', 'Tres', 'Nuevo', 300, null, null, 'Lima', 'Lima', 'Particular A27', '51911127001', null,
    'Fotos borrosas'),
  -- An approved listing of a store that is not active.
  ('a2720000-0000-4000-8000-000000000004', 'a2710000-0000-4000-8000-000000000002', null,
    'store', 'approved', 'Teclado Zqa27marca oculto', 'a27-oculto', 'Teclado de prueba para la auditoría de contactos.',
    'keyboards', 'keyboard', 'Zqa27marca', 'Cuatro', 'Nuevo', 2000, null, null, 'Lima', 'Lima', 'Tienda A27 oculta',
    '51911127004', now(), null),
  -- An old Particular listing without an account.
  ('a2720000-0000-4000-8000-000000000005', null, null, 'individual', 'approved', 'Micrófono Zqa27marca antiguo',
    'a27-antiguo', 'Micrófono de prueba para la auditoría de contactos.', 'microphones', 'microphones', 'Zqa27marca',
    'Cinco', 'Usado - como nuevo', 250, null, null, 'Arequipa', 'Arequipa', 'Contacto antiguo', '51911127005',
    now() - interval '3 days', null);

insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/' || l.slug || '-' || n || '.jpg', n
from public.listings l cross join generate_series(0, 1) n
where l.slug like 'a27-%';
set local session_replication_role = origin;

-- The view: security invoker, and none of the contact, moderation or internal columns.
select pg_temp.check((select 'security_invoker=true' = any(reloptions) from pg_class where oid = 'public.public_listings'::regclass),
  'public_listings reads with the caller''s rights');
select pg_temp.check(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'public_listings'
    and column_name in ('contact_name', 'whatsapp_phone', 'rejection_reason', 'rejection_codes', 'hidden_source',
      'hidden_reason', 'hidden_at', 'archived_at', 'created_by_source', 'marketplace_rules_accepted_at',
      'relisted_from_listing_id', 'availability_checkin_at', 'price_changed_at')), 'the view holds no private column');
select pg_temp.check(pg_get_function_result('public.catalog_search(text)'::regprocedure) = 'SETOF public_listings',
  'the search returns public_listings rows');
select pg_temp.check(not has_function_privilege('anon', 'public.admin_get_listing(uuid)', 'execute'),
  'visitors cannot call admin_get_listing');
select pg_temp.check(not has_table_privilege('anon', 'public.public_listings', 'insert')
  and not has_table_privilege('authenticated', 'public.public_listings', 'update')
  and not has_table_privilege('authenticated', 'public.public_listings', 'delete'), 'nothing writes through the view');

-- Visitors: the rows the public policy shows (approved, a Particular's or an active store's), with the cards' fields.
-- PostgREST calls a computed field with the row it reads, as here.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.check((select array_agg(slug order by slug) from public.public_listings where slug like 'a27-%')
  = array['a27-antiguo', 'a27-particular', 'a27-tienda-bajo'], 'visitors see the public listings and only those');
select pg_temp.check((select public.listing_photo_count(p) from public.public_listings p where slug = 'a27-particular') = 2,
  'the photo count');
select pg_temp.check((select public.recent_price_drop_at(p) = p.price_dropped_at and p.previous_price_pen = 1000
  from public.public_listings p where slug = 'a27-particular'), 'the price drop, its date and the price before');
select pg_temp.check((select public.recent_price_drop_at(p) from public.public_listings p where slug = 'a27-tienda-bajo') is null,
  'no drop, no date');
select pg_temp.check((select public.seller_verified_rank(p) from public.public_listings p where slug = 'a27-tienda-bajo') = 1,
  'a verified store ranks first');
select pg_temp.check((select public.seller_verified_rank(p) from public.public_listings p where slug = 'a27-particular') = 0,
  'a Particular does not');
select pg_temp.check((select array_agg(c.slug order by c.slug) from public.catalog_search('zqa27marca') c where c.slug like 'a27-%')
  = array['a27-antiguo', 'a27-particular', 'a27-tienda-bajo'], 'the search shows the same listings');
select pg_temp.check((select public.listing_photo_count(c) from public.catalog_search('zqa27marca') c where c.slug = 'a27-particular') = 2,
  'the computed fields work on the search''s rows');
select pg_temp.check((select count(*) from public.public_listings p
  where p.slug like 'a27-%' and p.owner_user_id = 'a2700000-0000-4000-8000-000000000001') = 1,
  '"Más de este vendedor" finds a Particular''s listings by account');
do $$
begin
  begin
    update public.public_listings set title = 'Cambio' where slug = 'a27-particular';
    raise exception 'FAILED: a visitor wrote through public_listings';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- A signed-in buyer sees the same listings, and cannot read one through admin_get_listing.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2700000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select pg_temp.check((select array_agg(slug order by slug) from public.public_listings where slug like 'a27-%')
  = array['a27-antiguo', 'a27-particular', 'a27-tienda-bajo'], 'a signed-in buyer sees the same listings');
do $$
begin
  begin
    perform public.admin_get_listing('a2720000-0000-4000-8000-000000000001');
    raise exception 'FAILED: a buyer read a listing through admin_get_listing';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The Particular sees their own pending listing through the view too (the owners' policy), as on listings.
select set_config('request.jwt.claims', '{"sub":"a2700000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.check((select count(*) from public.public_listings where slug = 'a27-pendiente') = 1,
  'an owner reads their own pending listing');

-- Admin: only with the second sign-in step, and then every column of any listing.
select set_config('request.jwt.claims', '{"sub":"a2700000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal1","app_metadata":{"role":"admin"}}', true);
do $$
begin
  begin
    perform public.admin_get_listing('a2720000-0000-4000-8000-000000000001');
    raise exception 'FAILED: Admin without the second step read a listing through admin_get_listing';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"a2700000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal2","app_metadata":{"role":"admin"}}', true);
select pg_temp.check((select contact_name || ' ' || whatsapp_phone from public.admin_get_listing('a2720000-0000-4000-8000-000000000001'))
  = 'Particular A27 51911127001', 'Admin reads a listing''s contact');
select pg_temp.check((select rejection_reason from public.admin_get_listing('a2720000-0000-4000-8000-000000000003')) = 'Fotos borrosas',
  'Admin reads a listing the public cannot see');
select pg_temp.check(not exists (select 1 from public.admin_get_listing('a2720000-0000-4000-8000-0000000000ff')),
  'an unknown listing gives no row');
reset role;

select 'launch audit A27 step 1: public listings view, computed fields, search and Admin listing read' as result;
rollback;
