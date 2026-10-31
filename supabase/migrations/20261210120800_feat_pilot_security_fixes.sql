-- PR #54 review fixes and the owner's 2026-10-30 pilot decision: two-step sign-in is Admin-only.
-- Keep the existing helpers so the wider account rollout can return in a reviewed release.
create or replace function laria_private.two_step_in_scope()
returns boolean language sql stable set search_path = '' as $$
  select auth.uid() is not null and coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'admin';
$$;
revoke all on function laria_private.two_step_in_scope() from public, anon, authenticated;

create or replace function laria_private.store_two_step_required(p_user_id uuid)
returns boolean language sql stable set search_path = '' as $$ select false; $$;

create or replace function laria_private.assert_two_step_session()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.role() = 'authenticated' and laria_private.two_step_in_scope()
     and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    raise exception using errcode = '42501', message = 'TWO_STEP_REQUIRED';
  end if;
end;
$$;

-- Auth's global sign-out revokes refresh tokens, but an already-issued access JWT still verifies cryptographically.
-- Refuse its API and Storage access once its session row is gone, including aal2 tokens after recovery. The minimal
-- SQL test schema has no sessions; JWTs without a session_id are also used by database-only tests and service jobs.
create or replace function laria_private.request_session_is_active()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  sid uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
  active boolean;
begin
  if auth.role() is distinct from 'authenticated' or sid is null or to_regclass('auth.sessions') is null then
    return true;
  end if;
  execute 'select exists (select 1 from auth.sessions where id = $1 and user_id = $2 and (not_after is null or not_after > now()))'
    into active using sid, auth.uid();
  return active;
end;
$$;
revoke all on function laria_private.request_session_is_active() from public, anon, authenticated;

create or replace function laria_private.two_step_owed()
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'authenticated' then return false; end if;
  if not laria_private.request_session_is_active() then return true; end if;
  if not laria_private.two_step_in_scope() or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2' then return false; end if;
  return laria_private.user_has_verified_factor(auth.uid());
end;
$$;

-- Check revocation before even the recovery/setup allowlist. Otherwise an old JWT could spend more recovery codes.
select laria_private.patch_function_text('public.check_two_step_request()'::regprocedure,
  array[$old$  if not laria_private.two_step_owed() then return; end if;$old$],
  array[$new$  if not laria_private.request_session_is_active() then
    raise exception using errcode = '42501', message = 'AUTH_SESSION_REVOKED';
  end if;
  if not laria_private.two_step_owed() then return; end if;$new$]);

create or replace function public.my_two_step_requirement()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'required', laria_private.two_step_in_scope(),
    'reason', case when laria_private.two_step_in_scope() then 'admin' end,
    'has_factor', laria_private.two_step_in_scope() and laria_private.user_has_verified_factor(auth.uid()),
    'aal', coalesce(auth.jwt()->>'aal', 'aal1'),
    'recovery_codes_left', case when laria_private.two_step_in_scope() then
      (select count(*) from laria_private.account_recovery_codes where user_id = auth.uid() and used_at is null)
      else 0 end
  ) where auth.uid() is not null;
$$;

-- Hide enrollment in the UI and refuse recovery-code management for non-Admin accounts at the database boundary.
select laria_private.patch_function_text('public.create_my_recovery_codes()'::regprocedure,
  array[$old$  if uid is null then raise exception using errcode = '42501', message = 'TWO_STEP_AUTH_REQUIRED'; end if;$old$],
  array[$new$  if uid is null then raise exception using errcode = '42501', message = 'TWO_STEP_AUTH_REQUIRED'; end if;
  if not laria_private.two_step_in_scope() then
    raise exception using errcode = '42501', message = 'TWO_STEP_ADMIN_ONLY';
  end if;$new$]);
select laria_private.patch_function_text('public.use_my_recovery_code(text)'::regprocedure,
  array[$old$  if uid is null then raise exception using errcode = '42501', message = 'TWO_STEP_AUTH_REQUIRED'; end if;$old$],
  array[$new$  if uid is null then raise exception using errcode = '42501', message = 'TWO_STEP_AUTH_REQUIRED'; end if;
  if not laria_private.two_step_in_scope() then
    raise exception using errcode = '42501', message = 'TWO_STEP_ADMIN_ONLY';
  end if;$new$]);

create or replace function public.service_finish_two_step_recovery(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'RECOVERY_SERVICE_REQUIRED';
  end if;
  delete from laria_private.account_recovery_codes where user_id = p_user_id;
  delete from laria_private.account_recovery_attempts where user_id = p_user_id;
  delete from laria_private.push_subscriptions where user_id = p_user_id;
  update public.account_devices set revoked_at = clock_timestamp(), last_session_id = null
    where user_id = p_user_id and revoked_at is null;
end;
$$;
revoke all on function public.service_finish_two_step_recovery(uuid) from public, anon, authenticated;
grant execute on function public.service_finish_two_step_recovery(uuid) to service_role;

-- Serialize a buyer's confirmations before locking a code and reading either daily cap. Different code rows alone
-- do not serialize the buyer. No cancellation/correction path takes this buyer lock after taking a sale lock.
select laria_private.patch_function_text('public.claim_counter_purchase(text)'::regprocedure,
  array[$old$  select * into sale from public.store_counter_sales where token_hash = laria_private.counter_token_hash(p_token) for update;$old$],
  array[$new$  perform pg_advisory_xact_lock(hashtextextended('counter_purchase_buyer:' || me::text, 0));
  select * into sale from public.store_counter_sales where token_hash = laria_private.counter_token_hash(p_token) for update;$new$]);

-- Anonymous tickets enter only through the server, which supplies the HMAC of the actual client address.
-- Authenticated callers keep their existing RPC, capped per account even if they vary email or hash arguments.
create or replace function laria_private.write_help_ticket(
  p_user_id uuid,
  p_name text,
  p_email text,
  p_topic text,
  p_message text,
  p_page_path text default null,
  p_client_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := p_user_id;
  clean_email text := lower(nullif(trim(coalesce(p_email, '')), ''));
  sent timestamptz := clock_timestamp();
  saved public.help_tickets;
begin
  if clean_email is null and uid is not null then
    select lower(email) into clean_email from auth.users where id = uid;
  end if;
  if clean_email is null or char_length(trim(coalesce(p_name, ''))) < 2 or char_length(trim(coalesce(p_message, ''))) < 10 then
    raise exception 'HELP_TICKET_INVALID';
  end if;
  -- One lock order for the trusted server and the account-only RPC: client, account, then email.
  if p_client_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended('help_client:' || p_client_hash, 0));
  end if;
  if uid is not null then
    perform pg_advisory_xact_lock(hashtextextended('help_account:' || uid::text, 0));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('help_tickets:' || clean_email, 0));
  if (select count(*) from public.help_tickets where lower(email) = clean_email and created_at > sent - interval '24 hours') >= 5
    or (uid is not null and (select count(*) from public.help_tickets where user_id = uid and created_at > sent - interval '24 hours') >= 5)
    or (p_client_hash is not null and (select count(*) from public.help_tickets where client_hash = p_client_hash and created_at > sent - interval '1 hour') >= 10) then
    raise exception 'HELP_TICKET_RATE_LIMITED';
  end if;
  insert into public.help_tickets (code, user_id, name, email, topic, message, page_path, client_hash)
  values (
    'AY-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8)),
    uid, trim(p_name), clean_email, p_topic, trim(p_message), nullif(trim(coalesce(p_page_path, '')), ''), p_client_hash
  )
  returning * into saved;
  return jsonb_build_object('code', saved.code, 'created_at', saved.created_at);
exception
  when check_violation then raise exception 'HELP_TICKET_INVALID';
end;
$$;
revoke all on function laria_private.write_help_ticket(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;

create or replace function public.submit_help_ticket(
  p_name text, p_email text, p_topic text, p_message text, p_page_path text default null, p_client_hash text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'HELP_AUTH_REQUIRED'; end if;
  return laria_private.write_help_ticket(auth.uid(), p_name, p_email, p_topic, p_message, p_page_path, null);
end;
$$;
revoke all on function public.submit_help_ticket(text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_help_ticket(text, text, text, text, text, text) to authenticated;

create or replace function public.service_submit_help_ticket(
  p_name text, p_email text, p_topic text, p_message text, p_client_hash text,
  p_user_id uuid default null, p_page_path text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'HELP_SERVICE_REQUIRED';
  end if;
  if p_client_hash is null or p_client_hash !~ '^[0-9a-f]{64}$' then raise exception 'HELP_TICKET_INVALID'; end if;
  return laria_private.write_help_ticket(p_user_id, p_name, p_email, p_topic, p_message, p_page_path, p_client_hash);
end;
$$;
revoke all on function public.service_submit_help_ticket(text, text, text, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.service_submit_help_ticket(text, text, text, text, text, uuid, text) to service_role;

notify pgrst, 'reload schema';
