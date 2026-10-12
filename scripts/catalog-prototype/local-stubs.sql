-- Local-only stubs so the catalog migrations can run on a plain Postgres (no Supabase stack). Never run against a
-- hosted database: it creates roles and placeholder auth functions.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists laria_private;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create or replace function laria_private.assert_admin() returns void language plpgsql as $$
begin raise exception 'admin only' using errcode = '42501'; end $$;
grant usage on schema extensions, auth to anon, authenticated, service_role;
create or replace function public.is_admin() returns boolean language sql stable as $$ select false $$;
