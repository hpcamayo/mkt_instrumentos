-- Feature ideas, accounts batch (docs/feature-ideas/accounts.md), safe-08: two-step sign-in, remembered devices,
-- signing out everywhere, the new-device e-mail and the store-owner requirement.
--
--   * Supabase Auth keeps the authenticator-app factors (auth.mfa_factors) and the sessions (auth.sessions). The
--     functions here read them through dynamic SQL, so the migration also loads on a database without those tables
--     (the Docker-free test database), where they behave as "no factor" and "no session".
--   * public.account_devices: one row per browser an account signed in from, keyed by a SHA-256 hash of a random
--     first-party cookie (never the cookie itself). A sign-in from a browser the account has not used before sends one
--     e-mail; the account's very first browser is the baseline and sends none.
--   * laria_private.account_recovery_codes: ten one-time codes (bcrypt hashes) to get back in without the phone.
--   * A store owner whose store has an approved payment method, and anyone with a verified factor, needs a
--     second-factor session (aal2) to change the store's contact details or its payment methods (triggers below).
--     The Admin second factor itself (is_admin, assert_admin) is the launch audit's A15.
-- New tables, functions and triggers only; nothing existing is redefined.

-- ------------------------------------------------------------------ shared registries (accounts batch, additive)

-- E-mail types for the whole batch: the new-device notice, two-step turned off with a recovery code, a help ticket
-- answered (safe-10) and a stolen-gear report that Admin matched (safe-02). Context keys they carry are added too.
select laria_private.ux_extend_text_check('laria_private.marketplace_email_deliveries', 'marketplace_email_deliveries_event_type_check',
  'event_type', array['account_new_device', 'account_two_step_reset', 'help_ticket_answered', 'stolen_report_match']);

do $$
declare
  values_now text[];
begin
  values_now := laria_private.check_constraint_values('laria_private.marketplace_email_deliveries', 'marketplace_email_context_check', '(context - ');
  if values_now is null or not ('digest_date' = any(values_now)) then raise exception 'marketplace_email_context_check not readable'; end if;
  alter table laria_private.marketplace_email_deliveries drop constraint marketplace_email_context_check;
  execute format('alter table laria_private.marketplace_email_deliveries add constraint marketplace_email_context_check check (jsonb_typeof(context) = %L and octet_length(context::text) <= 8192 and (context - %L::text[]) = %L::jsonb)',
    'object', array(select distinct unnest(values_now || array['device', 'signed_in_at', 'ticket_code', 'answer', 'report_code', 'item']) order by 1), '{}');
end $$;

-- ------------------------------------------------------------------ factors, sessions and the requirement

create or replace function laria_private.user_has_verified_factor(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare found_factor boolean;
begin
  if p_user_id is null or to_regclass('auth.mfa_factors') is null then return false; end if;
  execute 'select exists (select 1 from auth.mfa_factors where user_id = $1 and status::text = ''verified'')'
    into found_factor using p_user_id;
  return coalesce(found_factor, false);
end;
$$;
revoke all on function laria_private.user_has_verified_factor(uuid) from public, anon, authenticated;

-- A store owner needs the second step once Admin has approved one of the store's payment methods (safe-08).
create or replace function laria_private.store_two_step_required(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.stores s
    join public.store_payment_methods m on m.store_id = s.id
    where s.owner_user_id = p_user_id and m.status = 'approved'
  );
$$;
revoke all on function laria_private.store_two_step_required(uuid) from public, anon, authenticated;

-- Raises TWO_STEP_REQUIRED when a signed-in caller who has a factor, or must have one, is on a first-step (aal1)
-- session. The service role and anonymous calls pass: they are not account sessions.
create or replace function laria_private.assert_two_step_session()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null or coalesce(auth.role(), '') <> 'authenticated' then return; end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' then return; end if;
  if laria_private.user_has_verified_factor(uid) or laria_private.store_two_step_required(uid) then
    raise exception using errcode = '42501', message = 'TWO_STEP_REQUIRED';
  end if;
end;
$$;
revoke all on function laria_private.assert_two_step_session() from public, anon, authenticated;

-- What Seguridad shows: whether the account must use the second step, and why.
create or replace function public.my_two_step_requirement()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception using errcode = '42501', message = 'TWO_STEP_AUTH_REQUIRED'; end if;
  return jsonb_build_object(
    'required', laria_private.store_two_step_required(uid) or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin',
    'reason', case
      when coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin' then 'admin'
      when laria_private.store_two_step_required(uid) then 'store'
      else null end,
    'has_factor', laria_private.user_has_verified_factor(uid),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'recovery_codes_left', (select count(*) from laria_private.account_recovery_codes c where c.user_id = uid and c.used_at is null)
  );
end;
$$;

-- Store contact details and payment methods need the second step (safe-08: a hijacked store account could change the
-- WhatsApp number or the payment holder). Only real changes of the listed store columns are checked, so the other
-- writes on stores (status, verification, counters) are unaffected.
create or replace function laria_private.require_two_step_for_store_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'stores' then
    if (
      new.name, new.whatsapp_phone, new.email, new.contact_name, new.contact_person, new.ruc, new.razon_social,
      new.instagram_url, new.facebook_url, new.tiktok_url, new.website_url
    ) is not distinct from (
      old.name, old.whatsapp_phone, old.email, old.contact_name, old.contact_person, old.ruc, old.razon_social,
      old.instagram_url, old.facebook_url, old.tiktok_url, old.website_url
    ) then
      return new;
    end if;
  end if;
  perform laria_private.assert_two_step_session();
  return coalesce(new, old);
end;
$$;
revoke all on function laria_private.require_two_step_for_store_change() from public, anon, authenticated;

create trigger stores_require_two_step
  before update of name, whatsapp_phone, email, contact_name, contact_person, ruc, razon_social,
    instagram_url, facebook_url, tiktok_url, website_url on public.stores
  for each row execute function laria_private.require_two_step_for_store_change();

create trigger store_payment_methods_require_two_step
  before insert or update or delete on public.store_payment_methods
  for each row execute function laria_private.require_two_step_for_store_change();

-- ------------------------------------------------------------------ devices and the new-device e-mail

create table public.account_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  label text not null check (char_length(label) between 1 and 80),
  first_seen_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  last_session_id uuid,
  revoked_at timestamptz,
  unique (user_id, device_hash)
);
create index account_devices_session_idx on public.account_devices (user_id, last_session_id);
alter table public.account_devices enable row level security;
-- No policies: the functions below read and write it.
revoke all on table public.account_devices from public, anon, authenticated;

-- Called by the server right after every sign-in (password, e-mail link, Google or Apple). A browser the account has
-- not used before, or one whose session was closed from Seguridad, counts as new: it gets one e-mail, at most ten a day.
create or replace function public.record_sign_in_device(p_device_hash text, p_label text)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  uid uuid := auth.uid();
  sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  clean_label text := left(coalesce(nullif(trim(p_label), ''), 'Navegador'), 80);
  existing public.account_devices;
  known integer;
  emailed boolean := false;
  signed_in timestamptz := clock_timestamp();
begin
  if uid is null then raise exception using errcode = '42501', message = 'DEVICE_AUTH_REQUIRED'; end if;
  if p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$' then raise exception 'DEVICE_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('account_devices:' || uid::text, 0));
  select * into existing from public.account_devices where user_id = uid and device_hash = p_device_hash;
  if found and existing.revoked_at is null then
    update public.account_devices set last_seen_at = signed_in, last_session_id = sid, label = clean_label
    where id = existing.id;
    return jsonb_build_object('new_device', false, 'emailed', false);
  end if;
  select count(*) into known from public.account_devices where user_id = uid;
  insert into public.account_devices (user_id, device_hash, label, last_session_id)
  values (uid, p_device_hash, clean_label, sid)
  on conflict (user_id, device_hash) do update
    set revoked_at = null, first_seen_at = signed_in, last_seen_at = signed_in, last_session_id = sid, label = clean_label;
  if known > 0 and exists (select 1 from public.profiles where id = uid)
    and (select count(*) from laria_private.marketplace_email_deliveries d
         where d.recipient_user_id = uid and d.event_type = 'account_new_device' and d.created_at > signed_in - interval '24 hours') < 10 then
    perform laria_private.enqueue_marketplace_email(
      'account_new_device', uid,
      'account_new_device:' || uid::text || ':' || p_device_hash || ':' || to_char(signed_in, 'YYYYMMDDHH24MISSUS'),
      p_context => jsonb_build_object(
        'device', clean_label,
        'signed_in_at', to_char(signed_in at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI')));
    emailed := true;
  end if;
  return jsonb_build_object('new_device', true, 'emailed', emailed);
end;
$$;
revoke all on function public.record_sign_in_device(text, text) from public, anon;
grant execute on function public.record_sign_in_device(text, text) to authenticated;

-- The account's open sessions, newest activity first, for "Dispositivos con sesión iniciada" in Seguridad.
create or replace function public.list_my_sessions()
returns table (
  session_id uuid, device_label text, user_agent text, ip text, created_at timestamptz, last_active_at timestamptz,
  aal text, is_current boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if uid is null then raise exception using errcode = '42501', message = 'SESSIONS_AUTH_REQUIRED'; end if;
  if to_regclass('auth.sessions') is null then return; end if;
  return query execute $q$
    select s.id, d.label, s.user_agent::text, host(s.ip)::text, s.created_at,
      greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'UTC') as last_active_at,
      coalesce(s.aal::text, 'aal1'), s.id = $2
    from auth.sessions s
    left join public.account_devices d on d.user_id = s.user_id and d.last_session_id = s.id
    where s.user_id = $1 and (s.not_after is null or s.not_after > now())
    order by last_active_at desc nulls last
    limit 50
  $q$ using uid, sid;
end;
$$;
revoke all on function public.list_my_sessions() from public, anon;
grant execute on function public.list_my_sessions() to authenticated;

-- "Cerrar sesión" on one other device. Closing a session also forgets that browser, so signing in there again sends
-- the new-device e-mail and asks for the code.
create or replace function public.revoke_my_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  removed integer := 0;
begin
  if uid is null then raise exception using errcode = '42501', message = 'SESSIONS_AUTH_REQUIRED'; end if;
  perform laria_private.assert_two_step_session();
  if p_session_id is null then raise exception 'SESSION_INVALID'; end if;
  if p_session_id = sid then raise exception 'SESSION_IS_CURRENT'; end if;
  if to_regclass('auth.sessions') is not null then
    begin
      execute 'delete from auth.sessions where id = $1 and user_id = $2' using p_session_id, uid;
      get diagnostics removed = row_count;
    exception when insufficient_privilege then
      raise exception 'SESSION_REVOKE_UNAVAILABLE';
    end;
  end if;
  update public.account_devices set revoked_at = clock_timestamp(), last_session_id = null
  where user_id = uid and last_session_id = p_session_id;
  return removed > 0;
end;
$$;
revoke all on function public.revoke_my_session(uuid) from public, anon;
grant execute on function public.revoke_my_session(uuid) to authenticated;

-- Before "Cerrar sesión en todos los dispositivos" (Supabase's global sign-out): every browser except this one is
-- forgotten, and no device keeps receiving this account's push notices.
create or replace function public.prepare_sign_out_everywhere()
returns integer
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  uid uuid := auth.uid();
  sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  forgotten integer;
begin
  if uid is null then raise exception using errcode = '42501', message = 'SESSIONS_AUTH_REQUIRED'; end if;
  update public.account_devices set revoked_at = clock_timestamp(), last_session_id = null
  where user_id = uid and revoked_at is null and last_session_id is distinct from sid;
  get diagnostics forgotten = row_count;
  delete from laria_private.push_subscriptions where user_id = uid;
  return forgotten;
end;
$$;
revoke all on function public.prepare_sign_out_everywhere() from public, anon;
grant execute on function public.prepare_sign_out_everywhere() to authenticated;

-- ------------------------------------------------------------------ recovery codes

create table laria_private.account_recovery_codes (
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  created_at timestamptz not null default clock_timestamp(),
  used_at timestamptz,
  primary key (user_id, code_hash)
);
create table laria_private.account_recovery_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default clock_timestamp()
);
create index account_recovery_attempts_idx on laria_private.account_recovery_attempts (user_id, attempted_at desc);
revoke all on table laria_private.account_recovery_codes, laria_private.account_recovery_attempts from public, anon, authenticated;

-- Ten new codes, shown once (the old ones stop working). Only on a second-factor session.
create or replace function public.create_my_recovery_codes()
returns text[]
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  uid uuid := auth.uid();
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  codes text[] := '{}';
  code text;
  bytes bytea;
begin
  if uid is null then raise exception using errcode = '42501', message = 'TWO_STEP_AUTH_REQUIRED'; end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception using errcode = '42501', message = 'TWO_STEP_REQUIRED';
  end if;
  delete from laria_private.account_recovery_codes where user_id = uid;
  for n in 1..10 loop
    bytes := extensions.gen_random_bytes(8);
    code := '';
    for i in 0..7 loop
      code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
    end loop;
    code := substr(code, 1, 4) || '-' || substr(code, 5, 4);
    insert into laria_private.account_recovery_codes (user_id, code_hash)
    values (uid, extensions.crypt(code, extensions.gen_salt('bf', 8)));
    codes := codes || code;
  end loop;
  return codes;
end;
$$;
revoke all on function public.create_my_recovery_codes() from public, anon;
grant execute on function public.create_my_recovery_codes() to authenticated;

-- Spends one code. True means the server may remove the account's factors (it does so with the service role) and the
-- account gets an e-mail saying so. At most five tries in fifteen minutes.
create or replace function public.use_my_recovery_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  uid uuid := auth.uid();
  clean text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  candidate record;
begin
  if uid is null then raise exception using errcode = '42501', message = 'TWO_STEP_AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('account_recovery:' || uid::text, 0));
  if (select count(*) from laria_private.account_recovery_attempts
      where user_id = uid and attempted_at > clock_timestamp() - interval '15 minutes') >= 5 then
    raise exception 'RECOVERY_RATE_LIMITED';
  end if;
  if char_length(clean) = 8 then
    clean := substr(clean, 1, 4) || '-' || substr(clean, 5, 4);
    for candidate in
      select code_hash from laria_private.account_recovery_codes where user_id = uid and used_at is null
    loop
      if extensions.crypt(clean, candidate.code_hash) = candidate.code_hash then
        update laria_private.account_recovery_codes set used_at = clock_timestamp()
        where user_id = uid and code_hash = candidate.code_hash;
        if exists (select 1 from public.profiles where id = uid) then
          perform laria_private.enqueue_marketplace_email(
            'account_two_step_reset', uid,
            'account_two_step_reset:' || uid::text || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS'),
            p_context => jsonb_build_object('signed_in_at', to_char(clock_timestamp() at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI')));
        end if;
        return true;
      end if;
    end loop;
  end if;
  insert into laria_private.account_recovery_attempts (user_id) values (uid);
  return false;
end;
$$;
revoke all on function public.use_my_recovery_code(text) from public, anon;
grant execute on function public.use_my_recovery_code(text) to authenticated;
