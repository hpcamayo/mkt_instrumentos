-- Feature ideas, integration: the second sign-in step holds for the whole API, not only for the pages (safe-08,
-- accounts batch, docs/feature-ideas/accounts.md).
--
-- safe-08 asks for the authenticator code after the password on a new device, and the middleware sends a session that
-- still owes it to the code step. But that session's first-step token (aal1) is a valid API token, and row security
-- checks auth.uid(), not the level: with the password alone, someone could skip the code step and read or change the
-- account through the API (PostgREST and Storage) directly. Until now the database checked the level only for a
-- store's contact details and payment methods, sessions, recovery codes and Admin (launch audit A15).
--
-- From here on, a signed-in session at aal1 whose account has a verified authenticator factor ("owes its code") gets
-- TWO_STEP_REQUIRED from:
--   * every PostgREST request, through PostgREST's pre-request function (public.check_two_step_request, set on the
--     authenticator role below), except the four calls that signing in and the code step make: my_two_step_owed,
--     my_two_step_requirement, record_sign_in_device and use_my_recovery_code ("No tengo mi teléfono");
--   * Storage, through a restrictive policy on storage.objects for every action.
-- The app's routes that act with the service role for the signed-in account ask public.my_two_step_owed() first
-- (lib/auth/complete-session.ts); the others make a request with the account's own token, which the check refuses.
--
-- Untouched: accounts without a factor, aal2 sessions, visitors (anon) and the service role. The check costs one
-- indexed lookup of auth.mfa_factors, and only for aal1 sessions. An account that turns the app on keeps its current
-- session at aal2 (the setup verifies a code); an account that turns it off is aal1 with no factor.
--
-- Locks: the policy takes a brief lock on storage.objects, capped at 10 seconds. Rollback:
--   alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';
--   drop policy "Second sign-in step" on storage.objects;
--   drop function public.check_two_step_request(), public.my_two_step_owed(), laria_private.two_step_owed();

-- Whether this request comes from a signed-in session that still owes its authenticator code.
create or replace function laria_private.two_step_owed()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return false; end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' then return false; end if;
  return laria_private.user_has_verified_factor(auth.uid());
end;
$$;
revoke all on function laria_private.two_step_owed() from public, anon, authenticated;

-- For the app's routes that act with the service role, and for the Storage policy below.
create or replace function public.my_two_step_owed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select laria_private.two_step_owed();
$$;
revoke all on function public.my_two_step_owed() from public, anon;
grant execute on function public.my_two_step_owed() to authenticated;

-- PostgREST runs this after it reads the token and before the request's own query, in the same transaction, as the
-- request's role; an exception answers the request instead (42501: 403 for a signed-in session).
create or replace function public.check_two_step_request()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not laria_private.two_step_owed() then return; end if;
  if coalesce(current_setting('request.path', true), '') in (
    '/rpc/my_two_step_owed', '/rpc/my_two_step_requirement', '/rpc/record_sign_in_device', '/rpc/use_my_recovery_code'
  ) then
    return;
  end if;
  raise exception using errcode = '42501', message = 'TWO_STEP_REQUIRED',
    hint = 'Ingresa el código de tu app de autenticación para continuar.';
end;
$$;
revoke all on function public.check_two_step_request() from public;
grant execute on function public.check_two_step_request() to anon, authenticated;

set lock_timeout = '10s';

drop policy if exists "Second sign-in step" on storage.objects;
create policy "Second sign-in step"
on storage.objects
as restrictive
for all
to authenticated
using ((select public.my_two_step_owed()) is not true)
with check ((select public.my_two_step_owed()) is not true);

reset lock_timeout;

alter role authenticator set pgrst.db_pre_request = 'public.check_two_step_request';
notify pgrst, 'reload config';
