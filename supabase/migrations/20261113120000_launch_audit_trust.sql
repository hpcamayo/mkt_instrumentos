-- Launch audit trust fixes (docs/launch-audit/trust.md).
--
-- A15  Admin needs a second factor: is_admin() and assert_admin() require an aal2 session (Supabase MFA, TOTP), and
--      the catalog tables that checked the role inline use is_admin() too.
--
-- Locks: replacing functions and policies takes brief locks on the catalog tables; no table is rewritten.
-- Rollback: restore the previous bodies of public.is_admin() and laria_private.assert_admin() (the role check alone).

-- A15 ----------------------------------------------------------------------------------------------------------------

-- Every Admin check in policies and functions goes through here, so a password alone no longer opens Admin: the
-- session must also have passed the authenticator code (aal2). Sessions of the service role are not affected.
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

-- ADMIN_MFA_REQUIRED tells an Admin whose session skipped the code apart from someone who isn't Admin at all.
create or replace function laria_private.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception using errcode = '42501', message = 'ADMIN_MFA_REQUIRED';
  end if;
end;
$$;
revoke all on function laria_private.assert_admin() from public, anon, authenticated;

drop policy if exists "catalog_source_records admin read" on public.catalog_source_records;
create policy "catalog_source_records admin read" on public.catalog_source_records
  for select to authenticated using (public.is_admin());
drop policy if exists "catalog_conflicts admin read" on public.catalog_conflicts;
create policy "catalog_conflicts admin read" on public.catalog_conflicts
  for select to authenticated using (public.is_admin());
drop policy if exists "catalog_review_candidates admin all" on public.catalog_review_candidates;
create policy "catalog_review_candidates admin all" on public.catalog_review_candidates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "catalog_search_log admin read" on public.catalog_search_log;
create policy "catalog_search_log admin read" on public.catalog_search_log
  for select to authenticated using (public.is_admin());

-- A16, A28 -----------------------------------------------------------------------------------------------------------

-- Request counts for the server routes that call Supabase Auth or reveal account facts (lib/rate-limit.ts): sign-in,
-- the e-mail link callback, the e-mail check and the confirmation resend. Fixed windows per bucket and key; the key
-- is an HMAC of the visitor's address made by the app, so no address is stored. Rows older than a day are removed
-- as new ones arrive.
create table if not exists laria_private.rate_limit_hits (
  bucket text not null,
  key_hash text not null,
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (bucket, key_hash, window_start)
);
alter table laria_private.rate_limit_hits enable row level security;
revoke all on laria_private.rate_limit_hits from public, anon, authenticated;

-- True while the window's count is within the limit. Only the service role calls it.
create or replace function public.consume_rate_limit(p_bucket text, p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  window_begin timestamptz;
  total integer;
begin
  if p_bucket is null or p_bucket !~ '^[a-z][a-z0-9_.-]{0,40}$' or p_key is null or length(p_key) not between 1 and 128
    or coalesce(p_limit, 0) < 1 or coalesce(p_window_seconds, 0) not between 1 and 86400 then
    raise exception using errcode = '22023', message = 'RATE_LIMIT_INVALID';
  end if;
  window_begin := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into laria_private.rate_limit_hits as h (bucket, key_hash, window_start, hits)
  values (p_bucket, p_key, window_begin, 1)
  on conflict (bucket, key_hash, window_start) do update set hits = h.hits + 1
  returning hits into total;
  if random() < 0.02 then
    delete from laria_private.rate_limit_hits where window_start < now() - interval '1 day';
  end if;
  return total <= p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;
