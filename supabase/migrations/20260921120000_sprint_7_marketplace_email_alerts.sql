-- Sprint 7: saved-search alerts and durable marketplace email delivery.
-- Supabase Auth mail remains separate. Existing rows are baselined but never
-- backfilled into matches or email jobs.

create schema if not exists laria_private authorization postgres;
revoke all on schema laria_private from public, anon, authenticated;

create table public.saved_search_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  search_filters jsonb not null,
  search_hash text not null,
  match_bucket text not null,
  frequency text not null check (frequency in ('immediate', 'daily')),
  status text not null default 'active' check (status in ('active', 'paused', 'deleted')),
  active_since timestamptz not null default clock_timestamp(),
  paused_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint saved_search_alerts_filters_object check (
    jsonb_typeof(search_filters) = 'object'
    and octet_length(search_filters::text) <= 4096
  ),
  constraint saved_search_alerts_hash_format check (search_hash ~ '^[0-9a-f]{64}$'),
  constraint saved_search_alerts_bucket_format check (
    match_bucket = 'all'
    or match_bucket ~ '^(category|type):[a-z0-9_ -]{1,100}$'
  ),
  constraint saved_search_alerts_state_check check (
    (status = 'active' and paused_at is null and deleted_at is null)
    or (status = 'paused' and paused_at is not null and deleted_at is null)
    or (status = 'deleted' and deleted_at is not null)
  )
);

create unique index saved_search_alerts_active_identity_idx
on public.saved_search_alerts(user_id, search_hash)
where deleted_at is null;

create index saved_search_alerts_match_candidates_idx
on public.saved_search_alerts(match_bucket, frequency, active_since, id)
where status = 'active';

create index saved_search_alerts_user_recent_idx
on public.saved_search_alerts(user_id, created_at desc, id desc)
where deleted_at is null;

alter table public.saved_search_alerts enable row level security;
revoke all on public.saved_search_alerts from anon, authenticated;
grant select on public.saved_search_alerts to authenticated;

create policy "Users read only their saved searches"
on public.saved_search_alerts
for select
to authenticated
using (user_id = auth.uid() and deleted_at is null);

create table laria_private.listing_alert_publications (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  first_public_at timestamptz not null
);

create table laria_private.search_alert_matches (
  id uuid primary key default gen_random_uuid(),
  -- Alerts are soft-deleted during normal use, so delivery history remains. The
  -- cascade is reserved for full account cleanup, where the parent profile and
  -- its private match rows must be removable as one unit.
  alert_id uuid not null references public.saved_search_alerts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  matched_at timestamptz not null default clock_timestamp(),
  matched_local_date date not null,
  suppressed_at timestamptz,
  suppression_reason text check (suppression_reason in ('alert_paused', 'alert_deleted')),
  delivery_id uuid,
  unique(alert_id, listing_id),
  constraint search_alert_matches_suppression_check check (
    (suppressed_at is null and suppression_reason is null)
    or (suppressed_at is not null and suppression_reason is not null)
  )
);

create index search_alert_matches_daily_pending_idx
on laria_private.search_alert_matches(matched_local_date, alert_id, matched_at, id)
where delivery_id is null and suppressed_at is null;

create table laria_private.marketplace_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'listing_approved',
    'listing_rejected',
    'listing_hidden',
    'listing_revision_approved',
    'listing_revision_rejected',
    'store_approved',
    'store_rejected',
    'store_verified',
    'store_verification_revoked',
    'transaction_confirmation_requested',
    'transaction_confirmed',
    'transaction_declined',
    'transaction_cancelled',
    'review_revealed',
    'listing_price_drop',
    'search_alert_immediate',
    'search_alert_daily'
  )),
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_email text,
  notification_id uuid references public.notifications(id) on delete set null,
  listing_id uuid references public.listings(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  claim_id uuid references public.transaction_claims(id) on delete set null,
  transaction_id uuid references public.verified_transactions(id) on delete set null,
  review_id uuid references public.transaction_reviews(id) on delete set null,
  price_drop_id uuid references public.listing_price_drops(id) on delete set null,
  search_alert_id uuid references public.saved_search_alerts(id) on delete set null,
  search_match_id uuid references laria_private.search_alert_matches(id) on delete set null,
  context jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'processing', 'retry', 'sent', 'failed', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  next_attempt_at timestamptz not null default clock_timestamp(),
  last_attempt_at timestamptz,
  locked_at timestamptz,
  locked_by uuid,
  provider_message_id text,
  failure_category text check (failure_category in ('transport', 'rate_limit', 'provider', 'configuration', 'template', 'recipient', 'unknown')),
  failure_code text,
  created_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz,
  constraint marketplace_email_context_check check (
    jsonb_typeof(context) = 'object'
    and octet_length(context::text) <= 8192
    and context - array['reason', 'old_price_pen', 'new_price_pen', 'digest_date']::text[] = '{}'::jsonb
  ),
  constraint marketplace_email_status_check check (
    (status = 'sent' and sent_at is not null and provider_message_id is not null)
    or (status <> 'sent' and sent_at is null)
  ),
  constraint marketplace_email_lock_check check (
    (status = 'processing' and locked_at is not null and locked_by is not null)
    or (status <> 'processing' and locked_at is null and locked_by is null)
  )
);

alter table laria_private.search_alert_matches
  add constraint search_alert_matches_delivery_fkey
  foreign key (delivery_id)
  references laria_private.marketplace_email_deliveries(id)
  on delete set null;

create index marketplace_email_ready_idx
on laria_private.marketplace_email_deliveries(next_attempt_at, created_at, id)
where status in ('pending', 'retry');

create index marketplace_email_recipient_idx
on laria_private.marketplace_email_deliveries(recipient_user_id, created_at desc, id desc);

create index marketplace_email_related_listing_idx
on laria_private.marketplace_email_deliveries(listing_id, created_at desc)
where listing_id is not null;

revoke all on all tables in schema laria_private from public, anon, authenticated;

create or replace function laria_private.normalize_saved_search(p_filters jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  result jsonb := '{}'::jsonb;
  advanced jsonb := coalesce(p_filters->'advanced', '{}'::jsonb);
  string_value text;
  number_value numeric;
  advanced_entry record;
  allowed_advanced constant text[] := array[
    'acoustic_type','alloy','amplifier_type','bass_type','body_shape','body_type',
    'bridge','configuration','connection','cymbal_type','drum_type','finish',
    'format','frets','handedness','has_preamp','includes_cymbals','includes_hardware',
    'inputs','kick_size','material','microphone_type','midi','pedal_type',
    'phantom_power','pickups','pieces','polar_pattern','power','scale_length',
    'shape','size','strings','strings_material','technology','true_bypass','use_case'
  ];
begin
  if p_filters is null or jsonb_typeof(p_filters) <> 'object' or octet_length(p_filters::text) > 4096 then
    raise exception 'ALERT_FILTERS_INVALID';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_filters) key
    where key not in ('category','location','condition','brand','seller_type','instrument_type','min_price','max_price','advanced')
  ) then
    raise exception 'ALERT_FILTERS_INVALID';
  end if;
  if jsonb_typeof(advanced) <> 'object'
    or exists (select 1 from jsonb_object_keys(advanced) key where not (key = any(allowed_advanced))) then
    raise exception 'ALERT_FILTERS_INVALID';
  end if;

  if p_filters ? 'category' then
    if jsonb_typeof(p_filters->'category') <> 'string' then raise exception 'ALERT_FILTERS_INVALID'; end if;
    string_value := nullif(trim(p_filters->>'category'), '');
    if string_value is not null and string_value not in ('guitars','basses','drums','cymbals','microphones','pedals','amplifiers','audio interfaces') then raise exception 'ALERT_FILTERS_INVALID'; end if;
    if string_value is not null then result := result || jsonb_build_object('category', string_value); end if;
  end if;
  if p_filters ? 'location' then
    if jsonb_typeof(p_filters->'location') <> 'string' then raise exception 'ALERT_FILTERS_INVALID'; end if;
    string_value := nullif(trim(p_filters->>'location'), '');
    if string_value is not null and length(string_value) > 100 then raise exception 'ALERT_FILTERS_INVALID'; end if;
    if string_value is not null then result := result || jsonb_build_object('location', string_value); end if;
  end if;
  if p_filters ? 'condition' then
    if jsonb_typeof(p_filters->'condition') <> 'string' then raise exception 'ALERT_FILTERS_INVALID'; end if;
    string_value := nullif(trim(p_filters->>'condition'), '');
    if string_value is not null and string_value not in ('Nuevo','Usado - buen estado','Usado - con detalles') then raise exception 'ALERT_FILTERS_INVALID'; end if;
    if string_value is not null then result := result || jsonb_build_object('condition', string_value); end if;
  end if;
  if p_filters ? 'brand' then
    if jsonb_typeof(p_filters->'brand') <> 'string' then raise exception 'ALERT_FILTERS_INVALID'; end if;
    string_value := nullif(trim(p_filters->>'brand'), '');
    if string_value is not null and length(string_value) > 200 then raise exception 'ALERT_FILTERS_INVALID'; end if;
    if string_value is not null then result := result || jsonb_build_object('brand', string_value); end if;
  end if;
  if p_filters ? 'seller_type' then
    if jsonb_typeof(p_filters->'seller_type') <> 'string' then raise exception 'ALERT_FILTERS_INVALID'; end if;
    string_value := nullif(trim(p_filters->>'seller_type'), '');
    if string_value is not null and string_value not in ('individual','store','verified_store') then raise exception 'ALERT_FILTERS_INVALID'; end if;
    if string_value is not null then result := result || jsonb_build_object('seller_type', string_value); end if;
  end if;
  if p_filters ? 'instrument_type' then
    if jsonb_typeof(p_filters->'instrument_type') <> 'string' then raise exception 'ALERT_FILTERS_INVALID'; end if;
    string_value := nullif(trim(p_filters->>'instrument_type'), '');
    if string_value is not null and length(string_value) > 100 then raise exception 'ALERT_FILTERS_INVALID'; end if;
    if string_value is not null then result := result || jsonb_build_object('instrument_type', string_value); end if;
  end if;
  if p_filters ? 'min_price' then
    if jsonb_typeof(p_filters->'min_price') <> 'number' then raise exception 'ALERT_FILTERS_INVALID'; end if;
    number_value := (p_filters->>'min_price')::numeric;
    if number_value < 0 or number_value > 1000000000 then raise exception 'ALERT_FILTERS_INVALID'; end if;
    result := result || jsonb_build_object('min_price', number_value);
  end if;
  if p_filters ? 'max_price' then
    if jsonb_typeof(p_filters->'max_price') <> 'number' then raise exception 'ALERT_FILTERS_INVALID'; end if;
    number_value := (p_filters->>'max_price')::numeric;
    if number_value < 0 or number_value > 1000000000 then raise exception 'ALERT_FILTERS_INVALID'; end if;
    result := result || jsonb_build_object('max_price', number_value);
  end if;
  if result ? 'min_price' and result ? 'max_price'
    and (result->>'min_price')::numeric > (result->>'max_price')::numeric then
    raise exception 'ALERT_FILTERS_INVALID';
  end if;

  for advanced_entry in select key, value from jsonb_each(advanced)
  loop
    if jsonb_typeof(advanced_entry.value) not in ('string','number','boolean','array')
      or octet_length(advanced_entry.value::text) > 1000
      or (jsonb_typeof(advanced_entry.value) = 'array' and jsonb_array_length(advanced_entry.value) > 20) then
      raise exception 'ALERT_FILTERS_INVALID';
    end if;
    if jsonb_typeof(advanced_entry.value) = 'array' and exists (
      select 1 from jsonb_array_elements(advanced_entry.value) item
      where jsonb_typeof(item) <> 'string' or length(item#>>'{}') > 100
    ) then
      raise exception 'ALERT_FILTERS_INVALID';
    end if;
  end loop;
  if advanced <> '{}'::jsonb then result := result || jsonb_build_object('advanced', advanced); end if;
  return result;
end;
$$;

revoke all on function laria_private.normalize_saved_search(jsonb) from public, anon, authenticated;

create or replace function laria_private.saved_search_hash(p_filters jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(extensions.digest(
    case when p_filters ? 'brand'
      then (p_filters || jsonb_build_object('brand', lower(p_filters->>'brand')))::text
      else p_filters::text
    end,
    'sha256'
  ), 'hex');
$$;

revoke all on function laria_private.saved_search_hash(jsonb) from public, anon, authenticated;

create or replace function public.create_saved_search_alert(p_filters jsonb, p_frequency text)
returns public.saved_search_alerts
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized jsonb;
  filter_hash text;
  bucket text;
  alert_record public.saved_search_alerts;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and account_type in ('seller','store_owner')
  ) then
    raise exception using errcode = '42501', message = 'ALERT_AUTH_REQUIRED';
  end if;
  if p_frequency not in ('immediate','daily') then raise exception 'ALERT_FREQUENCY_INVALID'; end if;
  normalized := laria_private.normalize_saved_search(p_filters);
  filter_hash := laria_private.saved_search_hash(normalized);
  bucket := case
    when normalized ? 'instrument_type' then 'type:' || (normalized->>'instrument_type')
    when normalized ? 'category' then 'category:' || (normalized->>'category')
    else 'all'
  end;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || filter_hash, 71));
  if exists (
    select 1 from public.saved_search_alerts
    where user_id = auth.uid() and search_hash = filter_hash and deleted_at is null
  ) then
    raise exception 'ALERT_ALREADY_EXISTS';
  end if;
  insert into public.saved_search_alerts(user_id, search_filters, search_hash, match_bucket, frequency)
  values(auth.uid(), normalized, filter_hash, bucket, p_frequency)
  returning * into alert_record;
  return alert_record;
end;
$$;

revoke all on function public.create_saved_search_alert(jsonb, text) from public;
-- PostgREST resolves RPC signatures before authorization. Enter the explicit
-- 42501 guard above instead of failing at the ACL boundary.
grant execute on function public.create_saved_search_alert(jsonb, text) to anon, authenticated;

create or replace function public.set_saved_search_alert_status(p_alert_id uuid, p_active boolean)
returns public.saved_search_alerts
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare alert_record public.saved_search_alerts;
begin
  if auth.uid() is null or p_active is null then raise exception using errcode = '42501', message = 'ALERT_AUTH_REQUIRED'; end if;
  select * into alert_record from public.saved_search_alerts
  where id = p_alert_id and user_id = auth.uid() and deleted_at is null
  for update;
  if not found then raise exception 'ALERT_NOT_OWNED'; end if;
  if p_active then
    if alert_record.status = 'active' then return alert_record; end if;
    update public.saved_search_alerts set status = 'active', active_since = clock_timestamp(), paused_at = null, updated_at = clock_timestamp()
    where id = alert_record.id returning * into alert_record;
  else
    if alert_record.status = 'paused' then return alert_record; end if;
    update public.saved_search_alerts set status = 'paused', paused_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = alert_record.id returning * into alert_record;
    update laria_private.search_alert_matches
    set suppressed_at = coalesce(suppressed_at, clock_timestamp()), suppression_reason = coalesce(suppression_reason, 'alert_paused')
    where alert_id = alert_record.id and delivery_id is null and suppressed_at is null;
    update laria_private.marketplace_email_deliveries
    set status = 'cancelled', locked_at = null, locked_by = null
    where search_alert_id = alert_record.id and status in ('pending','retry','processing');
  end if;
  return alert_record;
end;
$$;

revoke all on function public.set_saved_search_alert_status(uuid, boolean) from public;
grant execute on function public.set_saved_search_alert_status(uuid, boolean) to anon, authenticated;

create or replace function public.delete_saved_search_alert(p_alert_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare alert_record public.saved_search_alerts;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'ALERT_AUTH_REQUIRED'; end if;
  select * into alert_record from public.saved_search_alerts
  where id = p_alert_id and user_id = auth.uid() and deleted_at is null
  for update;
  if not found then raise exception 'ALERT_NOT_OWNED'; end if;
  update public.saved_search_alerts
  set status = 'deleted', deleted_at = clock_timestamp(), paused_at = coalesce(paused_at, clock_timestamp()), updated_at = clock_timestamp()
  where id = alert_record.id;
  update laria_private.search_alert_matches
  set suppressed_at = coalesce(suppressed_at, clock_timestamp()), suppression_reason = coalesce(suppression_reason, 'alert_deleted')
  where alert_id = alert_record.id and delivery_id is null and suppressed_at is null;
  update laria_private.marketplace_email_deliveries
  set status = 'cancelled', locked_at = null, locked_by = null
  where search_alert_id = alert_record.id and status in ('pending','retry','processing');
  return true;
end;
$$;

revoke all on function public.delete_saved_search_alert(uuid) from public;
grant execute on function public.delete_saved_search_alert(uuid) to anon, authenticated;

create or replace function laria_private.listing_matches_saved_search(
  p_listing public.listings,
  p_filters jsonb
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_listing.status = 'approved'
    and public.listing_is_public(p_listing.id)
    and (not (p_filters ? 'category') or p_listing.category = p_filters->>'category')
    and (not (p_filters ? 'location') or p_listing.city = p_filters->>'location')
    and (not (p_filters ? 'condition') or p_listing.condition = p_filters->>'condition')
    and (not (p_filters ? 'brand') or coalesce(p_listing.brand, '') ilike '%' || (p_filters->>'brand') || '%')
    and (not (p_filters ? 'instrument_type') or p_listing.instrument_type = p_filters->>'instrument_type')
    and (not (p_filters ? 'min_price') or p_listing.price_pen >= (p_filters->>'min_price')::numeric)
    and (not (p_filters ? 'max_price') or p_listing.price_pen <= (p_filters->>'max_price')::numeric)
    and (
      not (p_filters ? 'seller_type')
      or (p_filters->>'seller_type' = 'individual' and p_listing.seller_type = 'individual')
      or (p_filters->>'seller_type' = 'store' and p_listing.seller_type = 'store')
      or (p_filters->>'seller_type' = 'verified_store' and p_listing.seller_type = 'store' and exists (
        select 1 from public.stores where id = p_listing.store_id and status = 'active' and is_verified
      ))
    )
    and not exists (
      select 1 from jsonb_each(coalesce(p_filters->'advanced', '{}'::jsonb)) filter
      where not (coalesce(p_listing.attributes, '{}'::jsonb) @> jsonb_build_object(filter.key, filter.value))
    );
$$;

revoke all on function laria_private.listing_matches_saved_search(public.listings, jsonb) from public, anon, authenticated;

create or replace function laria_private.enqueue_marketplace_email(
  p_event_type text,
  p_recipient_user_id uuid,
  p_dedupe_key text,
  p_notification_id uuid default null,
  p_listing_id uuid default null,
  p_store_id uuid default null,
  p_claim_id uuid default null,
  p_transaction_id uuid default null,
  p_review_id uuid default null,
  p_price_drop_id uuid default null,
  p_search_alert_id uuid default null,
  p_search_match_id uuid default null,
  p_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare delivery_id uuid;
begin
  if p_recipient_user_id is null or nullif(trim(coalesce(p_dedupe_key, '')), '') is null then return null; end if;
  insert into laria_private.marketplace_email_deliveries(
    event_type, recipient_user_id, notification_id, listing_id, store_id, claim_id,
    transaction_id, review_id, price_drop_id, search_alert_id, search_match_id,
    context, dedupe_key
  ) values (
    p_event_type, p_recipient_user_id, p_notification_id, p_listing_id, p_store_id, p_claim_id,
    p_transaction_id, p_review_id, p_price_drop_id, p_search_alert_id, p_search_match_id,
    coalesce(p_context, '{}'::jsonb), p_dedupe_key
  )
  on conflict (dedupe_key) do nothing
  returning id into delivery_id;
  if delivery_id is null then
    select id into delivery_id from laria_private.marketplace_email_deliveries where dedupe_key = p_dedupe_key;
  end if;
  return delivery_id;
end;
$$;

revoke all on function laria_private.enqueue_marketplace_email(text, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, jsonb)
from public, anon, authenticated;

create or replace function laria_private.enqueue_notification_marketplace_email()
returns trigger
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  email_event text;
  logical_key text;
  context_value jsonb := '{}'::jsonb;
begin
  email_event := case when new.event_type in (
    'listing_approved','listing_rejected','listing_hidden','listing_revision_approved','listing_revision_rejected',
    'store_approved','store_rejected','store_verified','store_verification_revoked',
    'transaction_confirmation_requested','transaction_confirmed','transaction_declined','transaction_cancelled',
    'review_revealed','listing_price_drop'
  ) then new.event_type end;
  if email_event is null then return new; end if;
  if new.event_type = 'listing_price_drop' then
    logical_key := 'price_drop:' || new.price_drop_id::text || ':' || new.user_id::text;
    context_value := jsonb_build_object('old_price_pen', new.old_price_pen, 'new_price_pen', new.new_price_pen);
  elsif new.event_type = 'transaction_confirmation_requested' then
    logical_key := 'transaction_request:' || new.claim_id::text || ':' || new.user_id::text;
  elsif new.event_type in ('transaction_declined','transaction_cancelled') then
    logical_key := new.event_type || ':' || new.claim_id::text || ':' || new.user_id::text;
  elsif new.event_type in ('transaction_confirmed','review_revealed') then
    logical_key := new.event_type || ':' || new.transaction_id::text || ':' || new.user_id::text;
  else
    logical_key := 'notification:' || new.id::text;
  end if;
  if new.event_type in ('listing_rejected','listing_hidden') then
    select context_value || jsonb_build_object('reason', coalesce(rejection_reason, hidden_reason, 'Revisa el estado desde tu cuenta.'))
    into context_value from public.listings where id = new.listing_id;
  elsif new.event_type = 'store_rejected' then
    select context_value || jsonb_build_object('reason', coalesce(rejection_reason, 'Revisa el estado desde tu cuenta.'))
    into context_value from public.stores where id = new.store_id;
  end if;
  perform laria_private.enqueue_marketplace_email(
    email_event, new.user_id, logical_key, new.id, new.listing_id, new.store_id,
    new.claim_id, new.transaction_id, new.review_id, new.price_drop_id, null, null, context_value
  );
  return new;
end;
$$;

revoke all on function laria_private.enqueue_notification_marketplace_email() from public, anon, authenticated;

create trigger notifications_marketplace_email
after insert on public.notifications
for each row execute function laria_private.enqueue_notification_marketplace_email();

create or replace function laria_private.capture_saved_search_matches(p_listing_id uuid, p_public_at timestamptz)
returns integer
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  listing_record public.listings;
  alert_record public.saved_search_alerts;
  match_record laria_private.search_alert_matches;
  inserted_count integer := 0;
begin
  select * into listing_record from public.listings where id = p_listing_id;
  if not found or not public.listing_is_public(p_listing_id) then return 0; end if;
  for alert_record in
    select * from public.saved_search_alerts
    where status = 'active'
      and deleted_at is null
      and active_since <= p_public_at
      and match_bucket in (
        'all',
        'category:' || listing_record.category,
        'type:' || coalesce(listing_record.instrument_type, '')
      )
    order by id
    for share
  loop
    if not laria_private.listing_matches_saved_search(listing_record, alert_record.search_filters) then continue; end if;
    insert into laria_private.search_alert_matches(alert_id, user_id, listing_id, matched_at, matched_local_date)
    values(alert_record.id, alert_record.user_id, listing_record.id, p_public_at, (p_public_at at time zone 'America/Lima')::date)
    on conflict (alert_id, listing_id) do nothing
    returning * into match_record;
    if match_record.id is null then continue; end if;
    inserted_count := inserted_count + 1;
    if alert_record.frequency = 'immediate' then
      perform laria_private.enqueue_marketplace_email(
        'search_alert_immediate', alert_record.user_id,
        'search_immediate:' || alert_record.id::text || ':' || listing_record.id::text,
        null, listing_record.id, listing_record.store_id, null, null, null, null,
        alert_record.id, match_record.id, '{}'::jsonb
      );
    end if;
  end loop;
  return inserted_count;
end;
$$;

revoke all on function laria_private.capture_saved_search_matches(uuid, timestamptz) from public, anon, authenticated;

create or replace function laria_private.capture_listing_alert_publication()
returns trigger
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare public_at timestamptz := clock_timestamp(); inserted_id uuid;
begin
  if new.status <> 'approved' or not public.listing_is_public(new.id) then return new; end if;
  if tg_op = 'UPDATE'
    and old.status = 'approved'
    and old.store_id is not distinct from new.store_id then
    return new;
  end if;
  insert into laria_private.listing_alert_publications(listing_id, first_public_at)
  values(new.id, public_at)
  on conflict do nothing
  returning listing_id into inserted_id;
  if inserted_id is not null then perform laria_private.capture_saved_search_matches(new.id, public_at); end if;
  return new;
end;
$$;

create or replace function laria_private.capture_store_alert_publication()
returns trigger
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare listing_record record; public_at timestamptz := clock_timestamp(); inserted_id uuid;
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then return new; end if;
  for listing_record in select id from public.listings where store_id = new.id and status = 'approved' order by id
  loop
    inserted_id := null;
    insert into laria_private.listing_alert_publications(listing_id, first_public_at)
    values(listing_record.id, public_at)
    on conflict do nothing
    returning listing_id into inserted_id;
    if inserted_id is not null then perform laria_private.capture_saved_search_matches(listing_record.id, public_at); end if;
  end loop;
  return new;
end;
$$;

revoke all on function laria_private.capture_listing_alert_publication(), laria_private.capture_store_alert_publication()
from public, anon, authenticated;

-- Baseline the catalog before enabling transition capture. This creates no
-- match and no email delivery.
insert into laria_private.listing_alert_publications(listing_id, first_public_at)
select listing.id, coalesce(listing.published_at, listing.created_at, clock_timestamp())
from public.listings listing
where public.listing_is_public(listing.id)
on conflict do nothing;

create trigger listings_saved_search_publication
after insert or update of status, store_id on public.listings
for each row execute function laria_private.capture_listing_alert_publication();

create trigger stores_saved_search_publication
after insert or update of status on public.stores
for each row execute function laria_private.capture_store_alert_publication();

create or replace function laria_private.prepare_daily_search_alert_emails(p_digest_date date, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  alert_record public.saved_search_alerts;
  delivery_uuid uuid;
  prepared integer := 0;
begin
  if p_digest_date is null or p_digest_date >= (clock_timestamp() at time zone 'America/Lima')::date
    or p_limit not between 1 and 500 then raise exception 'EMAIL_DAILY_WINDOW_INVALID'; end if;
  for alert_record in
    select alert.* from public.saved_search_alerts alert
    where alert.status = 'active' and alert.frequency = 'daily' and alert.deleted_at is null
      and exists (
        select 1 from laria_private.search_alert_matches match
        where match.alert_id = alert.id and match.matched_local_date = p_digest_date
          and match.delivery_id is null and match.suppressed_at is null
      )
    order by alert.id
    for update skip locked
    limit p_limit
  loop
    delivery_uuid := laria_private.enqueue_marketplace_email(
      'search_alert_daily', alert_record.user_id,
      'search_daily:' || alert_record.id::text || ':' || p_digest_date::text,
      null, null, null, null, null, null, null, alert_record.id, null,
      jsonb_build_object('digest_date', p_digest_date)
    );
    update laria_private.search_alert_matches
    set delivery_id = delivery_uuid
    where alert_id = alert_record.id and matched_local_date = p_digest_date
      and delivery_id is null and suppressed_at is null;
    if found then prepared := prepared + 1; end if;
  end loop;
  return prepared;
end;
$$;

revoke all on function laria_private.prepare_daily_search_alert_emails(date, integer) from public, anon, authenticated;

create or replace function public.prepare_daily_search_alert_emails(p_digest_date date, p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = public, laria_private
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'EMAIL_SERVICE_REQUIRED';
  end if;
  return laria_private.prepare_daily_search_alert_emails(p_digest_date, p_limit);
end;
$$;

revoke all on function public.prepare_daily_search_alert_emails(date, integer) from public;
grant execute on function public.prepare_daily_search_alert_emails(date, integer) to anon, authenticated, service_role;

create or replace function laria_private.marketplace_email_payload(p_delivery laria_private.marketplace_email_deliveries)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, laria_private, auth
as $$
declare result jsonb; match_items jsonb := '[]'::jsonb;
begin
  if p_delivery.event_type = 'search_alert_daily' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'title', listing.title, 'slug', listing.slug, 'price_pen', listing.price_pen
    ) order by match.matched_at, match.id), '[]'::jsonb)
    into match_items
    from laria_private.search_alert_matches match
    join public.listings listing on listing.id = match.listing_id
    where match.delivery_id = p_delivery.id;
  end if;
  select jsonb_build_object(
    'delivery_id', p_delivery.id,
    'event_type', p_delivery.event_type,
    'attempt_count', p_delivery.attempt_count,
    'recipient_email', auth_user.email,
    'recipient_name', profile.full_name,
    'context', p_delivery.context,
    'listing', case when listing.id is null then null else jsonb_build_object(
      'title', listing.title, 'slug', listing.slug, 'price_pen', listing.price_pen
    ) end,
    'store', case when store.id is null then null else jsonb_build_object(
      'name', store.name, 'slug', store.slug
    ) end,
    'transaction', case when claim.id is null and transaction_record.id is null then null else jsonb_build_object(
      'reference_id', coalesce(transaction_record.id, claim.id),
      'listing_title', transaction_listing.title,
      'review_deadline', transaction_record.review_deadline
    ) end,
    'search_alert', case when alert.id is null then null else jsonb_build_object(
      'id', alert.id,
      'filters', alert.search_filters,
      'frequency', alert.frequency,
      'matches', match_items
    ) end
  ) into result
  from auth.users auth_user
  left join public.profiles profile on profile.id = auth_user.id
  left join public.listings listing on listing.id = p_delivery.listing_id
  left join public.stores store on store.id = p_delivery.store_id
  left join public.transaction_claims claim on claim.id = p_delivery.claim_id
  left join public.verified_transactions transaction_record on transaction_record.id = p_delivery.transaction_id
  left join public.listings transaction_listing on transaction_listing.id = coalesce(transaction_record.listing_id, claim.listing_id)
  left join public.saved_search_alerts alert on alert.id = p_delivery.search_alert_id
  where auth_user.id = p_delivery.recipient_user_id;
  return result;
end;
$$;

revoke all on function laria_private.marketplace_email_payload(laria_private.marketplace_email_deliveries)
from public, anon, authenticated;

create or replace function public.claim_marketplace_email_deliveries(p_worker_id uuid, p_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private, auth
as $$
declare result jsonb;
begin
  if auth.role() is distinct from 'service_role' or p_worker_id is null or p_limit not between 1 and 100 then
    raise exception using errcode = '42501', message = 'EMAIL_SERVICE_REQUIRED';
  end if;
  update laria_private.marketplace_email_deliveries
  set status = case when attempt_count >= 5 then 'failed' else 'retry' end,
      next_attempt_at = clock_timestamp(), locked_at = null, locked_by = null,
      failure_category = coalesce(failure_category, 'transport'),
      failure_code = coalesce(failure_code, 'stale_worker_lock')
  where status = 'processing' and locked_at < clock_timestamp() - interval '15 minutes';
  with candidates as (
    select delivery.id
    from laria_private.marketplace_email_deliveries delivery
    left join public.saved_search_alerts alert on alert.id = delivery.search_alert_id
    where delivery.status in ('pending','retry')
      and delivery.next_attempt_at <= clock_timestamp()
      and delivery.attempt_count < 5
      and (delivery.search_alert_id is null or alert.status = 'active')
    order by delivery.created_at, delivery.id
    for update of delivery skip locked
    limit p_limit
  ), updated as (
    update laria_private.marketplace_email_deliveries delivery
    set status = 'processing', attempt_count = attempt_count + 1,
        last_attempt_at = clock_timestamp(), locked_at = clock_timestamp(), locked_by = p_worker_id,
        recipient_email = auth_user.email, failure_category = null, failure_code = null
    from candidates, auth.users auth_user
    where delivery.id = candidates.id and auth_user.id = delivery.recipient_user_id
    returning delivery.*
  )
  select coalesce(jsonb_agg(laria_private.marketplace_email_payload(updated) order by updated.created_at, updated.id), '[]'::jsonb)
  into result from updated;
  return result;
end;
$$;

revoke all on function public.claim_marketplace_email_deliveries(uuid, integer) from public;
grant execute on function public.claim_marketplace_email_deliveries(uuid, integer) to anon, authenticated, service_role;

create or replace function public.complete_marketplace_email_delivery(
  p_delivery_id uuid,
  p_worker_id uuid,
  p_provider_message_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, laria_private
as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception using errcode = '42501', message = 'EMAIL_SERVICE_REQUIRED'; end if;
  if nullif(trim(coalesce(p_provider_message_id, '')), '') is null or length(p_provider_message_id) > 500 then
    raise exception 'EMAIL_PROVIDER_ID_INVALID';
  end if;
  update laria_private.marketplace_email_deliveries
  set status = 'sent', provider_message_id = trim(p_provider_message_id), sent_at = clock_timestamp(),
      locked_at = null, locked_by = null, next_attempt_at = clock_timestamp(),
      failure_category = null, failure_code = null
  where id = p_delivery_id and status = 'processing' and locked_by = p_worker_id;
  if not found then raise exception 'EMAIL_DELIVERY_CLAIM_INVALID'; end if;
  return true;
end;
$$;

revoke all on function public.complete_marketplace_email_delivery(uuid, uuid, text) from public;
grant execute on function public.complete_marketplace_email_delivery(uuid, uuid, text) to anon, authenticated, service_role;

create or replace function public.fail_marketplace_email_delivery(
  p_delivery_id uuid,
  p_worker_id uuid,
  p_retryable boolean,
  p_failure_category text,
  p_failure_code text
)
returns text
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare delivery_record laria_private.marketplace_email_deliveries; next_status text;
begin
  if auth.role() is distinct from 'service_role' then raise exception using errcode = '42501', message = 'EMAIL_SERVICE_REQUIRED'; end if;
  if p_failure_category not in ('transport','rate_limit','provider','configuration','template','recipient','unknown')
    or length(coalesce(p_failure_code, '')) > 200 then raise exception 'EMAIL_FAILURE_INVALID'; end if;
  select * into delivery_record from laria_private.marketplace_email_deliveries
  where id = p_delivery_id and status = 'processing' and locked_by = p_worker_id for update;
  if not found then raise exception 'EMAIL_DELIVERY_CLAIM_INVALID'; end if;
  next_status := case when p_retryable and delivery_record.attempt_count < 5 then 'retry' else 'failed' end;
  update laria_private.marketplace_email_deliveries
  set status = next_status,
      next_attempt_at = case delivery_record.attempt_count
        when 1 then clock_timestamp() + interval '5 minutes'
        when 2 then clock_timestamp() + interval '30 minutes'
        when 3 then clock_timestamp() + interval '2 hours'
        else clock_timestamp() + interval '8 hours'
      end,
      failure_category = p_failure_category,
      failure_code = nullif(left(coalesce(p_failure_code, ''), 200), ''),
      locked_at = null,
      locked_by = null
  where id = delivery_record.id;
  return next_status;
end;
$$;

revoke all on function public.fail_marketplace_email_delivery(uuid, uuid, boolean, text, text) from public;
grant execute on function public.fail_marketplace_email_delivery(uuid, uuid, boolean, text, text) to anon, authenticated, service_role;

create or replace function public.get_pending_buyer_confirmation_count()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare pending_count integer;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'TRANSACTION_AUTH_REQUIRED'; end if;
  select count(*)::integer into pending_count
  from public.transaction_claims
  where buyer_user_id = auth.uid() and status = 'pending';
  return pending_count;
end;
$$;

revoke all on function public.get_pending_buyer_confirmation_count() from public;
grant execute on function public.get_pending_buyer_confirmation_count() to anon, authenticated;
