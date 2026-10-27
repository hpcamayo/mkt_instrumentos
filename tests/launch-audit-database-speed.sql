-- Launch audit A34 (supabase/migrations/20261114190000_launch_audit_foreign_key_indexes.sql and
-- 20261114191000_launch_audit_policy_checks_once.sql): every foreign key has an index, and no access rule reads the
-- account or the Admin role row by row, while every rule still gives the answers it gave. Local/test database only.
-- Every fixture is rolled back.
begin;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
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
-- p_sql's plan, as EXPLAIN prints it.
create function pg_temp.plan(p_sql text) returns text language plpgsql as $$
declare
  line text;
  plan text := '';
begin
  for line in execute 'explain ' || p_sql loop
    plan := plan || line || E'\n';
  end loop;
  return plan;
end $$;
grant execute on function pg_temp.check(boolean, text), pg_temp.claims(text, boolean, text), pg_temp.upload(text, text),
  pg_temp.plan(text)
to anon, authenticated, service_role;

-- 1. Every foreign key of public and laria_private has an index that starts with its columns, but the three left out
-- on purpose: the fixed list of event types, and two keys whose first column has a unique index of its own.
select pg_temp.check(coalesce((
    select array_agg(fk order by fk)
    from (
      select c.conrelid::regclass::text || ' (' || (
          select string_agg(a.attname, ', ' order by k.ord)
          from unnest(c.conkey) with ordinality k(attnum, ord)
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
        ) || ')' as fk
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where c.contype = 'f' and n.nspname in ('public', 'laria_private')
        and not exists (
          select 1 from pg_index i
          where i.indrelid = c.conrelid
            and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] @> c.conkey
            and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] <@ c.conkey)
    ) keys
  ), '{}') = array['marketplace_events (event_type)', 'store_import_photo_assignments (asset_id, session_id)',
    'store_inventory_items (listing_id, store_id)'],
  'every foreign key has an index but the three left out on purpose');
select pg_temp.check(
  (select indisunique and indkey[0] = (select attnum from pg_attribute
      where attrelid = 'public.store_inventory_items'::regclass and attname = 'listing_id')
    from pg_index where indexrelid = 'public.store_inventory_items_listing_id_key'::regclass)
  and (select indisunique and indkey[0] = (select attnum from pg_attribute
      where attrelid = 'public.store_import_photo_assignments'::regclass and attname = 'asset_id')
    from pg_index where indexrelid = 'public.store_import_photo_assignments_pkey'::regclass),
  'the two keys left out find their one row through a unique index on their first column');
select pg_temp.check(
  (select indpred is not null from pg_index where indexrelid = 'public.notifications_listing_idx'::regclass)
  and (select indpred is null from pg_index where indexrelid = 'public.listing_edit_attempts_listing_idx'::regclass)
  and (select pg_get_indexdef(indexrelid) from pg_index where indexrelid = 'public.catalog_products_family_id_idx'::regclass)
    like '%(family_id) WHERE (family_id IS NOT NULL)',
  'a column that may be null gets a partial index, a required one a full index');

-- 2. No policy of public or storage calls auth.uid() or is_admin() outside a (select ...) of its own.
select pg_temp.check(not exists (
    select 1 from pg_policies
    where schemaname in ('public', 'storage')
      and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
        '\( SELECT (auth\.uid\(\) AS uid|(public\.)?is_admin\(\) AS is_admin)\)', '', 'g') ~ 'auth\.uid\(\)|is_admin\(\)'),
  'no policy reads the account or the Admin role row by row');
select pg_temp.check((select count(*) from pg_policies
    where schemaname in ('public', 'storage')
      and coalesce(qual, '') || ' ' || coalesce(with_check, '') ~ '\( SELECT (auth\.uid\(\) AS uid|(public\.)?is_admin\(\) AS is_admin)\)')
  >= 62, 'the 60 policies changed, and the two of storage that already had it, read them once');

-- 3. The same answers as before.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('a3400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'a34-uno@example.invalid', '', now(), '{}',
    '{"account_type":"seller","full_name":"Persona A34","phone":"51911134001","city":"Lima","region":"Lima"}'),
  ('a3400000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'a34-dos@example.invalid', '', now(), '{}',
    '{"account_type":"seller","full_name":"Otra A34","phone":"51911134002","city":"Lima","region":"Lima"}'),
  ('a3400000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'a34-admin@example.invalid', '', now(),
    '{"role":"admin"}', '{"account_type":"seller","full_name":"Admin A34","phone":"51911134003","city":"Lima","region":"Lima"}');
set local session_replication_role = replica;
insert into public.listings (id, owner_user_id, seller_type, status, title, slug, description, category, instrument_type,
  brand, model, condition, price_pen, city, region, contact_name, whatsapp_phone, published_at)
values ('a3430000-0000-4000-8000-000000000001', 'a3400000-0000-4000-8000-000000000001', 'individual', 'approved',
  'Guitarra A34', 'a34-guitarra', 'Guitarra de prueba para la velocidad de la base de datos.', 'guitars',
  'electric_guitar', 'QA', 'A34', 'Usado - buen estado', 1000, 'Lima', 'Lima', 'Persona A34', '51911134001', now());
set local session_replication_role = origin;
insert into public.notifications (user_id, event_type, message, listing_id) values
  ('a3400000-0000-4000-8000-000000000001', 'listing_approved', 'Aviso de prueba A34.', 'a3430000-0000-4000-8000-000000000001'),
  ('a3400000-0000-4000-8000-000000000002', 'listing_approved', 'Aviso de prueba A34.', 'a3430000-0000-4000-8000-000000000001');

set local role authenticated;
select pg_temp.claims('a3400000-0000-4000-8000-000000000001');
select pg_temp.check(
  (select array_agg(id) from public.profiles where id::text like 'a3400000-%') = array['a3400000-0000-4000-8000-000000000001'::uuid],
  'an account reads its own profile and no other');
select pg_temp.check((select count(*) from public.notifications where user_id::text like 'a3400000-%') = 1
  and (select user_id from public.notifications where user_id::text like 'a3400000-%')
    = 'a3400000-0000-4000-8000-000000000001', 'and only its own notifications');
insert into public.listing_drafts (id, kind, title) values ('a3410000-0000-4000-8000-000000000001', 'listing', 'Borrador A34');
select pg_temp.check((select count(*) from public.listing_drafts where id = 'a3410000-0000-4000-8000-000000000001') = 1,
  'an account saves and reads its own draft');
do $$
begin
  insert into public.listing_drafts (id, owner_user_id, kind, title)
  values ('a3410000-0000-4000-8000-000000000002', 'a3400000-0000-4000-8000-000000000002', 'listing', 'Ajeno A34');
  raise exception 'FAILED: a draft in another account''s name went in';
exception when insufficient_privilege then
  null;
end $$;
select pg_temp.check(pg_temp.upload('listing-photos',
    'a3400000-0000-4000-8000-000000000001/a3420000-0000-4000-8000-000000000001/foto-0.jpg')
  and not pg_temp.upload('listing-photos',
    'a3400000-0000-4000-8000-000000000002/a3420000-0000-4000-8000-000000000001/foto-0.jpg'),
  'a photo goes into the account''s own folder, never into another''s');
-- The checks run once per statement now: the plan reads them in an InitPlan, before any row.
select pg_temp.check(pg_temp.plan('select id from public.notifications') ~ 'InitPlan',
  'notifications read the account once per statement');
select pg_temp.check(pg_temp.plan('select id from public.stores') ~ 'InitPlan',
  'stores read the account and the Admin role once per statement');

select pg_temp.claims('a3400000-0000-4000-8000-000000000003', true, 'aal1');
select pg_temp.check((select count(*) from public.profiles where id::text like 'a3400000-%') = 1,
  'an Admin without the authenticator code reads only their own profile');
select pg_temp.claims('a3400000-0000-4000-8000-000000000003', true, 'aal2');
select pg_temp.check((select count(*) from public.profiles where id::text like 'a3400000-%') = 3,
  'an Admin with the code reads every profile');
reset role;

rollback;
