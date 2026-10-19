-- Effortless Laria, big-12 (docs/ux-effortless/speed.md): Laria's notices on the phone, a lighter companion to
-- e-mail that each person turns on per device in Mi cuenta > Notificaciones.
-- Every new row in public.notifications for someone with a device turned on gets one push delivery. The worker
-- (app/api/internal/push/process) sends them only between 08:00 and 22:00 Lima, joins a person's pending notices
-- into one, and skips notices already read in Laria or older than three days. Devices and deliveries live in
-- laria_private; people reach their own devices only through the security-definer functions below, and only the
-- service role claims and finishes deliveries.

-- The browsers' own push services. The worker posts nowhere else, whatever a browser hands over.
create or replace function laria_private.is_push_service_endpoint(p_endpoint text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(
    length(p_endpoint) <= 1024
    and p_endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[^[:space:]]+$',
    false
  )
$$;

-- A base64url key from PushSubscription.toJSON(), decoded, or null unless it has exactly p_length bytes.
create or replace function laria_private.push_key_bytes(p_value text, p_length integer)
returns bytea
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  cleaned text := rtrim(coalesce(p_value, ''), '=');
  decoded bytea;
begin
  if cleaned !~ '^[A-Za-z0-9_-]{1,100}$' then return null; end if;
  decoded := decode(translate(cleaned, '-_', '+/') || repeat('=', (4 - length(cleaned) % 4) % 4), 'base64');
  return case when length(decoded) = p_length then decoded end;
exception when others then
  return null;
end;
$$;

create table laria_private.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (laria_private.is_push_service_endpoint(endpoint)),
  -- The browser's P-256 public key (65 bytes, uncompressed) and auth secret (16 bytes), base64url without padding.
  p256dh text not null check (coalesce(get_byte(laria_private.push_key_bytes(p256dh, 65), 0) = 4, false)),
  auth_secret text not null check (laria_private.push_key_bytes(auth_secret, 16) is not null),
  -- Consecutive failed sends; a device the push service rejects five times in a row is forgotten.
  failure_count integer not null default 0 check (failure_count between 0 and 10),
  created_at timestamptz not null default clock_timestamp(),
  last_success_at timestamptz
);

create index push_subscriptions_user_idx on laria_private.push_subscriptions(user_id, created_at desc);

create table laria_private.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'skipped', 'failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  next_attempt_at timestamptz not null default clock_timestamp(),
  last_attempt_at timestamptz,
  locked_at timestamptz,
  locked_by uuid,
  failure_code text check (length(failure_code) <= 200),
  created_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz,
  constraint push_deliveries_sent_check check ((status = 'sent') = (sent_at is not null)),
  constraint push_deliveries_lock_check check (
    (status = 'processing' and locked_at is not null and locked_by is not null)
    or (status <> 'processing' and locked_at is null and locked_by is null)
  )
);

create index push_deliveries_ready_idx on laria_private.push_deliveries(next_attempt_at, user_id) where status = 'pending';
create index push_deliveries_user_idx on laria_private.push_deliveries(user_id, created_at desc);

revoke all on laria_private.push_subscriptions, laria_private.push_deliveries from public, anon, authenticated;
revoke all on function laria_private.is_push_service_endpoint(text), laria_private.push_key_bytes(text, integer)
from public, anon, authenticated;

-- Turning notices on in this browser: the device is the signed-in person's from now on, even if another account
-- turned it on before (a shared phone), and a person keeps ten devices at most, the newest ones.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns uuid
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  current_user_id uuid := auth.uid();
  subscription_id uuid;
begin
  if current_user_id is null then raise exception using errcode = '42501', message = 'PUSH_AUTH_REQUIRED'; end if;
  if not laria_private.is_push_service_endpoint(p_endpoint) then raise exception 'PUSH_ENDPOINT_UNSUPPORTED'; end if;
  if get_byte(laria_private.push_key_bytes(p_p256dh, 65), 0) is distinct from 4
    or laria_private.push_key_bytes(p_auth, 16) is null then
    raise exception 'PUSH_KEYS_INVALID';
  end if;
  insert into laria_private.push_subscriptions(user_id, endpoint, p256dh, auth_secret)
  values (current_user_id, p_endpoint, rtrim(p_p256dh, '='), rtrim(p_auth, '='))
  on conflict (endpoint) do update
  set user_id = excluded.user_id, p256dh = excluded.p256dh, auth_secret = excluded.auth_secret,
      failure_count = 0, created_at = clock_timestamp()
  returning id into subscription_id;
  delete from laria_private.push_subscriptions
  where id in (
    select id from laria_private.push_subscriptions
    where user_id = current_user_id
    order by created_at desc, id
    offset 10
  );
  return subscription_id;
end;
$$;

-- Turning them off here, or signing out (app/logout passes the device id the settings left in a cookie).
create or replace function public.delete_push_subscription(p_subscription_id uuid default null, p_endpoint text default null)
returns boolean
language plpgsql
security definer
set search_path = public, laria_private
as $$
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'PUSH_AUTH_REQUIRED'; end if;
  delete from laria_private.push_subscriptions
  where user_id = auth.uid() and (id = p_subscription_id or endpoint = p_endpoint);
  return found;
end;
$$;

-- Whether this browser's subscription has notices on for the signed-in person: the device id, or null.
create or replace function public.get_push_subscription(p_endpoint text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, laria_private
as $$
declare subscription_id uuid;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'PUSH_AUTH_REQUIRED'; end if;
  select id into subscription_id from laria_private.push_subscriptions
  where user_id = auth.uid() and endpoint = p_endpoint;
  return subscription_id;
end;
$$;

revoke all on function public.save_push_subscription(text, text, text), public.delete_push_subscription(uuid, text),
  public.get_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text), public.delete_push_subscription(uuid, text),
  public.get_push_subscription(text) to authenticated;

create or replace function laria_private.enqueue_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public, laria_private
as $$
begin
  if exists (select 1 from laria_private.push_subscriptions where user_id = new.user_id) then
    insert into laria_private.push_deliveries(notification_id, user_id)
    values (new.id, new.user_id)
    on conflict (notification_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function laria_private.enqueue_notification_push() from public, anon, authenticated;

create trigger notifications_push_delivery
after insert on public.notifications
for each row execute function laria_private.enqueue_notification_push();

-- The worker's batch: up to p_limit people, each with all their due notices (newest first, to be sent as one
-- message) and their devices.
create or replace function public.claim_push_deliveries(p_worker_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  claimed_at timestamptz := clock_timestamp();
  result jsonb;
begin
  if auth.role() is distinct from 'service_role' or p_worker_id is null or p_limit not between 1 and 200 then
    raise exception using errcode = '42501', message = 'PUSH_SERVICE_REQUIRED';
  end if;
  -- A worker that stopped mid-batch gives its deliveries back.
  update laria_private.push_deliveries
  set status = case when attempt_count >= 5 then 'failed' else 'pending' end,
      next_attempt_at = claimed_at, locked_at = null, locked_by = null,
      failure_code = coalesce(failure_code, 'stale_worker_lock')
  where status = 'processing' and locked_at < claimed_at - interval '15 minutes';
  -- Already read in Laria, too old to matter, or no device left: nothing to send.
  update laria_private.push_deliveries delivery
  set status = 'skipped',
      failure_code = case
        when notification.read_at is not null then 'read'
        when delivery.created_at < claimed_at - interval '3 days' then 'stale'
        else 'no_device'
      end
  from public.notifications notification
  where notification.id = delivery.notification_id
    and delivery.status = 'pending'
    and (
      notification.read_at is not null
      or delivery.created_at < claimed_at - interval '3 days'
      or not exists (select 1 from laria_private.push_subscriptions device where device.user_id = delivery.user_id)
    );
  with recipients as (
    select delivery.user_id
    from laria_private.push_deliveries delivery
    where delivery.status = 'pending' and delivery.next_attempt_at <= claimed_at
    group by delivery.user_id
    order by min(delivery.created_at), delivery.user_id
    limit p_limit
  ), candidates as (
    select delivery.id
    from laria_private.push_deliveries delivery
    join recipients on recipients.user_id = delivery.user_id
    where delivery.status = 'pending' and delivery.next_attempt_at <= claimed_at
    for update of delivery skip locked
  ), claimed as (
    update laria_private.push_deliveries delivery
    set status = 'processing', attempt_count = delivery.attempt_count + 1, last_attempt_at = claimed_at,
        locked_at = claimed_at, locked_by = p_worker_id, failure_code = null
    from candidates
    where delivery.id = candidates.id
    returning delivery.id, delivery.user_id, delivery.notification_id, delivery.created_at
  ), grouped as (
    select claimed.user_id, min(claimed.created_at) as first_at,
      jsonb_agg(jsonb_build_object(
        'delivery_id', claimed.id,
        'event_type', notification.event_type,
        'message', notification.message,
        'created_at', notification.created_at,
        'listing_id', notification.listing_id,
        'listing_title', listing.title,
        'store_id', notification.store_id,
        'claim_id', notification.claim_id,
        'transaction_id', notification.transaction_id,
        'old_price_pen', notification.old_price_pen,
        'new_price_pen', notification.new_price_pen
      ) order by notification.created_at desc, notification.id desc) as notices
    from claimed
    join public.notifications notification on notification.id = claimed.notification_id
    left join public.listings listing on listing.id = notification.listing_id
    group by claimed.user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', grouped.user_id,
      'notices', grouped.notices,
      'devices', (
        select coalesce(jsonb_agg(jsonb_build_object('id', device.id, 'endpoint', device.endpoint, 'p256dh', device.p256dh, 'auth', device.auth_secret)
          order by device.created_at desc), '[]'::jsonb)
        from laria_private.push_subscriptions device
        where device.user_id = grouped.user_id
      )
    ) order by grouped.first_at, grouped.user_id), '[]'::jsonb)
  into result
  from grouped;
  return result;
end;
$$;

-- What happened to one person's message: 'sent' (to at least one device), 'retry' (every device failed for now),
-- 'failed' or 'skipped'. Devices the push service no longer knows are forgotten, and so is one that failed five
-- times in a row; only devices of the people in this claim are touched.
create or replace function public.finish_push_deliveries(
  p_worker_id uuid,
  p_delivery_ids uuid[],
  p_outcome text,
  p_failure_code text default null,
  p_sent_device_ids uuid[] default '{}',
  p_failed_device_ids uuid[] default '{}',
  p_gone_device_ids uuid[] default '{}'
)
returns integer
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  finished integer;
  owners uuid[];
begin
  if auth.role() is distinct from 'service_role' or p_worker_id is null then
    raise exception using errcode = '42501', message = 'PUSH_SERVICE_REQUIRED';
  end if;
  if p_outcome is null or p_outcome not in ('sent', 'retry', 'failed', 'skipped') or length(coalesce(p_failure_code, '')) > 200 then
    raise exception 'PUSH_OUTCOME_INVALID';
  end if;
  select array_agg(distinct user_id) into owners
  from laria_private.push_deliveries
  where id = any(coalesce(p_delivery_ids, '{}')) and status = 'processing' and locked_by = p_worker_id;
  if owners is null then raise exception 'PUSH_DELIVERY_CLAIM_INVALID'; end if;
  delete from laria_private.push_subscriptions
  where id = any(coalesce(p_gone_device_ids, '{}')) and user_id = any(owners);
  update laria_private.push_subscriptions
  set failure_count = least(failure_count + 1, 10)
  where id = any(coalesce(p_failed_device_ids, '{}')) and user_id = any(owners);
  delete from laria_private.push_subscriptions
  where id = any(coalesce(p_failed_device_ids, '{}')) and user_id = any(owners) and failure_count >= 5;
  update laria_private.push_subscriptions
  set failure_count = 0, last_success_at = clock_timestamp()
  where id = any(coalesce(p_sent_device_ids, '{}')) and user_id = any(owners);
  update laria_private.push_deliveries
  set status = case
        when p_outcome <> 'retry' then p_outcome
        when attempt_count < 5 then 'pending'
        else 'failed'
      end,
      sent_at = case when p_outcome = 'sent' then clock_timestamp() end,
      next_attempt_at = case
        when p_outcome <> 'retry' then next_attempt_at
        when attempt_count = 1 then clock_timestamp() + interval '5 minutes'
        when attempt_count = 2 then clock_timestamp() + interval '30 minutes'
        when attempt_count = 3 then clock_timestamp() + interval '2 hours'
        else clock_timestamp() + interval '8 hours'
      end,
      failure_code = case when p_outcome = 'sent' then null else nullif(left(coalesce(p_failure_code, ''), 200), '') end,
      locked_at = null,
      locked_by = null
  where id = any(coalesce(p_delivery_ids, '{}')) and status = 'processing' and locked_by = p_worker_id;
  get diagnostics finished = row_count;
  return finished;
end;
$$;

-- Only the worker's service-role client calls these; the role check inside stays as a second guard.
revoke all on function public.claim_push_deliveries(uuid, integer),
  public.finish_push_deliveries(uuid, uuid[], text, text, uuid[], uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.claim_push_deliveries(uuid, integer),
  public.finish_push_deliveries(uuid, uuid[], text, text, uuid[], uuid[], uuid[]) to service_role;
