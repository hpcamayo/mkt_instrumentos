-- Effortless Laria, accounts batch (docs/ux-effortless/accounts.md): saving, alerts, e-mail and notifications.
--   big-04  favorites saved on a device merge into the account at sign-in (merge_device_favorites), and public cards
--           for device favorites and recently viewed listings (get_public_listing_cards);
--   save-04 counts of listings that are new since the last visit (get_new_listing_counts, alert new_count);
--   save-05 alerts can be renamed, switch frequency, show their last match and total, and save several locations or
--           conditions;
--   save-07 e-mail preferences (price drops, the weekly follow digest) and one-click e-mail actions;
--   save-08 price-drop alerts on drops of 5% or more, at most once a day per listing, with the price when saved;
--   save-09 favorites carry what the account page needs to act (category, type, brand, saved price);
--   save-10 "mark all as read", the listing's name in price-drop notices and an in-app notice for alert matches;
--   save-11 shared favorite lists with an optional note per item;
--   save-12 following stores and brands, with arrivals for "Para ti" and an optional weekly e-mail.
-- Replaced functions keep their signatures. Every public RPC checks its caller.

-- ------------------------------------------------------------------ allowed-value lists (additive)

-- Other batches may extend the same allowed-value checks, and Postgres may print a rewritten check either as
-- ARRAY['a'::text, ...] or as '{a,...}'::text[]. This reads the values from either form, so each migration adds its
-- own values to whatever the list holds when it runs.
create or replace function laria_private.check_constraint_values(p_table regclass, p_name text, p_after text)
returns text[]
language sql
stable
set search_path = ''
as $$
  select array_agg(distinct word order by word)
  from pg_catalog.pg_constraint c,
    regexp_matches(substring(pg_catalog.pg_get_constraintdef(c.oid) from position(p_after in pg_catalog.pg_get_constraintdef(c.oid)) + length(p_after)),
      '[a-z_]+', 'g') as m(words),
    unnest(m.words) as word
  where c.conrelid = p_table and c.conname = p_name and word not in ('text', 'jsonb');
$$;

-- The event types go through the shared laria_private.ux_extend_text_check (20261102120500, UXD-integration-3).
select laria_private.ux_extend_text_check('public.notifications', 'notifications_event_type_check', 'event_type',
  array['listing_alert_match']);
-- The weekly follow e-mail is a new delivery type whose context carries the week and its items.
select laria_private.ux_extend_text_check('laria_private.marketplace_email_deliveries', 'marketplace_email_deliveries_event_type_check',
  'event_type', array['follow_weekly']);

do $$
declare
  values_now text[];
begin
  values_now := laria_private.check_constraint_values('laria_private.marketplace_email_deliveries', 'marketplace_email_context_check', '(context - ');
  if values_now is null or not ('digest_date' = any(values_now)) then raise exception 'marketplace_email_context_check not readable'; end if;
  alter table laria_private.marketplace_email_deliveries drop constraint marketplace_email_context_check;
  execute format('alter table laria_private.marketplace_email_deliveries add constraint marketplace_email_context_check check (jsonb_typeof(context) = %L and octet_length(context::text) <= 8192 and (context - %L::text[]) = %L::jsonb)',
    'object', array(select distinct unnest(values_now || array['week_start', 'items']) order by 1), '{}');
end $$;

-- ------------------------------------------------------------------ favorites: saved price, note

alter table public.favorites
  add column if not exists saved_price_pen numeric,
  add column if not exists note text;
alter table public.favorites
  add constraint favorites_note_length check (note is null or char_length(note) <= 280);

-- The price when the favorite was saved; existing favorites take the price before their first later drop.
update public.favorites f
set saved_price_pen = coalesce((
    select d.old_price_pen from public.listing_price_drops d
    where d.listing_id = f.listing_id and d.created_at >= f.created_at
    order by d.created_at limit 1), l.price_pen)
from public.listings l
where l.id = f.listing_id and f.saved_price_pen is null;

create or replace function laria_private.capture_favorite_saved_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.saved_price_pen is null then
    select price_pen into new.saved_price_pen from public.listings where id = new.listing_id;
  end if;
  return new;
end;
$$;

create trigger favorites_capture_saved_price
before insert on public.favorites
for each row execute function laria_private.capture_favorite_saved_price();

-- Same page and availability rules as before (Sprint 5); each item now also says what helps the account act on it.
create or replace function public.get_account_favorites(p_page integer default 1)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'FAVORITE_AUTH_REQUIRED'; end if;
 if p_page not between 1 and 100000 then raise exception 'FAVORITE_PAGE_INVALID'; end if;
 with relations as (
  select f.*,l.title,l.slug,l.price_pen,l.status,l.category,l.instrument_type,l.brand,
   (public.listing_is_public(l.id) or (l.status='sold' and (l.store_id is null or s.status='active'))) available
  from public.favorites f join public.listings l on l.id=f.listing_id left join public.stores s on s.id=l.store_id
  where f.user_id=auth.uid() order by f.created_at desc,f.listing_id limit 24 offset (p_page-1)*24
 ) select jsonb_build_object('total',(select count(*) from public.favorites where user_id=auth.uid()),
 'items',coalesce(jsonb_agg(jsonb_build_object('listing_id',listing_id,'created_at',created_at,
  'availability',case when not available then 'unavailable' when status='sold' then 'sold' else 'approved' end,
  'title',case when available then title end,'slug',case when available then slug end,
  'price_pen',case when available then price_pen end,
  'image_url',case when available then (select image_url from public.listing_photos where listing_id=relations.listing_id order by sort_order limit 1) end,
  'saved_price_pen',case when available then saved_price_pen end,
  'category',case when available then category end,
  'instrument_type',case when available then instrument_type end,
  'brand',case when available then brand end,
  'note',note)
  order by created_at desc,listing_id),'[]'::jsonb)) into result from relations;
 return result;
end $$;

-- big-04: favorites saved on a device before signing in. Each id goes through set_listing_favorite, so the usual
-- rules apply (public listings only, never your own); ids that fail are skipped. Returns how many were added.
create or replace function public.merge_device_favorites(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare item uuid; added integer := 0;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'FAVORITE_AUTH_REQUIRED'; end if;
  if p_ids is null or cardinality(p_ids) > 100 then raise exception 'FAVORITE_INVALID'; end if;
  foreach item in array coalesce((select array_agg(distinct id) from unnest(p_ids) id), '{}'::uuid[]) loop
    continue when item is null;
    continue when exists (select 1 from public.favorites where user_id = auth.uid() and listing_id = item);
    begin
      perform public.set_listing_favorite(item, true);
      added := added + 1;
    exception when others then
      null;
    end;
  end loop;
  return added;
end;
$$;

-- big-04: cards for favorites saved on a device and listings viewed on it. Public listings, plus sold ones so a saved
-- item can say it sold; nothing about hidden, pending or rejected listings.
create or replace function public.get_public_listing_cards(p_ids uuid[] default '{}', p_slugs text[] default '{}')
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'slug', l.slug, 'title', l.title, 'price_pen', l.price_pen,
      'availability', case when l.status = 'sold' then 'sold' else 'approved' end,
      'category', l.category, 'instrument_type', l.instrument_type, 'brand', l.brand,
      'city', l.city, 'condition', l.condition, 'stock_state', l.stock_state,
      'image_url', (select image_url from public.listing_photos where listing_id = l.id order by sort_order limit 1))), '[]'::jsonb)
  from public.listings l
  left join public.stores s on s.id = l.store_id
  where (l.id = any(coalesce(p_ids, '{}')) or l.slug = any(coalesce(p_slugs, '{}')))
    and coalesce(cardinality(p_ids), 0) + coalesce(cardinality(p_slugs), 0) <= 120
    and (public.listing_is_public(l.id) or (l.status = 'sold' and (l.store_id is null or s.status = 'active')));
$$;

-- save-11: a note per favorite ("pregúntale a tu profe"), shown on the shared list.
create or replace function public.set_favorite_note(p_listing_id uuid, p_note text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare saved text := nullif(trim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'FAVORITE_AUTH_REQUIRED'; end if;
  if char_length(saved) > 280 then raise exception 'FAVORITE_NOTE_TOO_LONG'; end if;
  update public.favorites set note = saved where user_id = auth.uid() and listing_id = p_listing_id;
  if not found then raise exception 'FAVORITE_NOT_FOUND'; end if;
  return saved;
end;
$$;

-- ------------------------------------------------------------------ save-11: shared favorite lists

create table public.favorite_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index favorite_shares_one_active on public.favorite_shares(user_id) where revoked_at is null;
alter table public.favorite_shares enable row level security;
create policy "Users read their own favorite shares" on public.favorite_shares for select using (user_id = auth.uid());
revoke all on public.favorite_shares from anon, authenticated;
grant select on public.favorite_shares to authenticated;

create or replace function public.get_or_create_favorite_share()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare share_token text;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'FAVORITE_AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('favorite_share:' || auth.uid()::text, 0));
  select token into share_token from public.favorite_shares where user_id = auth.uid() and revoked_at is null;
  if share_token is null then
    insert into public.favorite_shares(user_id) values (auth.uid()) returning token into share_token;
  end if;
  return share_token;
end;
$$;

create or replace function public.revoke_favorite_share()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'FAVORITE_AUTH_REQUIRED'; end if;
  update public.favorite_shares set revoked_at = now() where user_id = auth.uid() and revoked_at is null;
  return found;
end;
$$;

-- What anyone with the link sees: the owner's first name and their public favorites with notes. Nothing else about
-- the owner, and nothing about listings that are not public.
create or replace function public.get_shared_favorite_list(p_token text)
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  select case when share.id is null then null else jsonb_build_object(
    'owner_name', nullif(split_part(trim(coalesce(profile.full_name, '')), ' ', 1), ''),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'slug', l.slug, 'title', l.title, 'price_pen', l.price_pen, 'note', f.note,
        'city', l.city, 'condition', l.condition,
        'image_url', (select image_url from public.listing_photos where listing_id = l.id order by sort_order limit 1))
        order by f.created_at desc)
      from public.favorites f join public.listings l on l.id = f.listing_id
      where f.user_id = share.user_id and public.listing_is_public(l.id)), '[]'::jsonb)) end
  from (select 1) as one
  left join public.favorite_shares share on share.token = p_token and share.revoked_at is null and p_token ~ '^[0-9a-f]{24}$'
  left join public.profiles profile on profile.id = share.user_id;
$$;

-- ------------------------------------------------------------------ save-12: follow a store or a brand

create table public.follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  brand text,
  brand_key text generated always as (lower(trim(brand))) stored,
  created_at timestamptz not null default now(),
  constraint follows_one_target check ((store_id is null) <> (brand is null)),
  constraint follows_brand_length check (brand is null or char_length(trim(brand)) between 1 and 80)
);
create unique index follows_user_store on public.follows(user_id, store_id) where store_id is not null;
create unique index follows_user_brand on public.follows(user_id, brand_key) where brand is not null;
create index follows_store on public.follows(store_id) where store_id is not null;
create index follows_brand_key on public.follows(brand_key) where brand is not null;
alter table public.follows enable row level security;
create policy "Users read their own follows" on public.follows for select using (user_id = auth.uid());
revoke all on public.follows from anon, authenticated;
grant select on public.follows to authenticated;

create or replace function public.set_follow(p_store_id uuid, p_brand text, p_follow boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare brand_value text := nullif(trim(coalesce(p_brand, '')), '');
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception using errcode = '42501', message = 'FOLLOW_AUTH_REQUIRED';
  end if;
  if p_follow is null or ((p_store_id is null) = (brand_value is null)) or char_length(brand_value) > 80 then
    raise exception 'FOLLOW_INVALID';
  end if;
  if p_store_id is not null then
    if p_follow then
      if not exists (select 1 from public.stores where id = p_store_id and status = 'active') then raise exception 'FOLLOW_UNAVAILABLE'; end if;
      if exists (select 1 from public.stores where id = p_store_id and owner_user_id = auth.uid()) then raise exception 'FOLLOW_SELF_NOT_ALLOWED'; end if;
      insert into public.follows(user_id, store_id) values (auth.uid(), p_store_id) on conflict do nothing;
    else
      delete from public.follows where user_id = auth.uid() and store_id = p_store_id;
    end if;
  else
    if p_follow then
      insert into public.follows(user_id, brand) values (auth.uid(), brand_value) on conflict do nothing;
    else
      delete from public.follows where user_id = auth.uid() and brand_key = lower(brand_value);
    end if;
  end if;
  return p_follow;
end;
$$;

create or replace function public.get_account_follows()
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'kind', case when f.store_id is null then 'brand' else 'store' end,
      'store_id', f.store_id, 'store_name', s.name, 'store_slug', s.slug, 'brand', f.brand, 'created_at', f.created_at)
      order by f.created_at desc), '[]'::jsonb)
  from public.follows f left join public.stores s on s.id = f.store_id
  where f.user_id = auth.uid();
$$;

-- New public listings from what the account follows, newest first, each with the reason it is shown.
create or replace function laria_private.followed_arrivals(p_user_id uuid, p_since timestamptz, p_limit integer)
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(item order by published desc), '[]'::jsonb)
  from (
    select published, item from (
      select distinct on (l.id) l.published_at as published, jsonb_build_object(
        'id', l.id, 'slug', l.slug, 'title', l.title, 'price_pen', l.price_pen, 'city', l.city, 'condition', l.condition,
        'published_at', l.published_at,
        'reason', case when f.store_id is not null then 'store' else 'brand' end,
        'reason_label', case when f.store_id is not null then s.name else f.brand end,
        'image_url', (select image_url from public.listing_photos where listing_id = l.id order by sort_order limit 1)) as item
      from public.follows f
      join public.listings l on (f.store_id is not null and l.store_id = f.store_id)
        or (f.brand is not null and lower(trim(coalesce(l.brand, ''))) = f.brand_key)
      left join public.stores s on s.id = f.store_id
      where f.user_id = p_user_id and l.published_at >= p_since and public.listing_is_public(l.id)
        and l.stock_state is distinct from 'out_of_stock'
      order by l.id, f.created_at
    ) unique_arrivals
    order by published desc
    limit greatest(1, least(coalesce(p_limit, 12), 200))
  ) arrivals;
$$;

create or replace function public.get_followed_arrivals(p_limit integer default 12, p_days integer default 14)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'FOLLOW_AUTH_REQUIRED'; end if;
  if p_days not between 1 and 60 then raise exception 'FOLLOW_INVALID'; end if;
  return (select coalesce(jsonb_agg(item), '[]'::jsonb) from (
    select item from jsonb_array_elements(laria_private.followed_arrivals(auth.uid(), now() - make_interval(days => p_days), 200)) item
    order by item->>'published_at' desc limit greatest(1, least(coalesce(p_limit, 12), 48))) newest);
end;
$$;

-- ------------------------------------------------------------------ save-07: e-mail preferences

create table public.email_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  price_drop_emails boolean not null default true,
  follow_digest_emails boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.email_preferences enable row level security;
create policy "Users read their own e-mail preferences" on public.email_preferences for select using (user_id = auth.uid());
revoke all on public.email_preferences from anon, authenticated;
grant select on public.email_preferences to authenticated;

create or replace function public.set_email_preferences(p_price_drop_emails boolean, p_follow_digest_emails boolean)
returns public.email_preferences
language plpgsql
security definer
set search_path = public
as $$
declare saved public.email_preferences;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'EMAIL_PREFERENCES_AUTH_REQUIRED'; end if;
  if p_price_drop_emails is null or p_follow_digest_emails is null then raise exception 'EMAIL_PREFERENCES_INVALID'; end if;
  insert into public.email_preferences(user_id, price_drop_emails, follow_digest_emails, updated_at)
  values (auth.uid(), p_price_drop_emails, p_follow_digest_emails, now())
  on conflict (user_id) do update set price_drop_emails = excluded.price_drop_emails,
    follow_digest_emails = excluded.follow_digest_emails, updated_at = now()
  returning * into saved;
  return saved;
end;
$$;

-- One-click actions from an e-mail link (the app checks the signed link first; only the service role calls this).
create or replace function public.apply_email_link_action(p_user_id uuid, p_action text, p_alert_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'EMAIL_SERVICE_REQUIRED';
  end if;
  if p_action = 'pause_alert' then
    update public.saved_search_alerts set status = 'paused', paused_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = p_alert_id and user_id = p_user_id and status = 'active';
    return true;
  elsif p_action = 'no_price_drops' then
    insert into public.email_preferences(user_id, price_drop_emails) values (p_user_id, false)
    on conflict (user_id) do update set price_drop_emails = false, updated_at = now();
    return true;
  elsif p_action = 'no_follow_digest' then
    insert into public.email_preferences(user_id, follow_digest_emails) values (p_user_id, false)
    on conflict (user_id) do update set follow_digest_emails = false, updated_at = now();
    return true;
  end if;
  raise exception 'EMAIL_ACTION_INVALID';
end;
$$;

-- Price-drop e-mails respect the preference (the in-app notice stays). Same body as before otherwise.
create or replace function laria_private.enqueue_marketplace_email(p_event_type text, p_recipient_user_id uuid, p_dedupe_key text, p_notification_id uuid default null::uuid, p_listing_id uuid default null::uuid, p_store_id uuid default null::uuid, p_claim_id uuid default null::uuid, p_transaction_id uuid default null::uuid, p_review_id uuid default null::uuid, p_price_drop_id uuid default null::uuid, p_search_alert_id uuid default null::uuid, p_search_match_id uuid default null::uuid, p_context jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare delivery_id uuid;
begin
  if p_recipient_user_id is null or nullif(trim(coalesce(p_dedupe_key, '')), '') is null then return null; end if;
  if p_event_type = 'listing_price_drop' and exists (
    select 1 from public.email_preferences where user_id = p_recipient_user_id and not price_drop_emails
  ) then
    return null;
  end if;
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

-- save-12: the weekly e-mail of new arrivals from what an account follows (opt-in). The items are copied into the
-- delivery when it is prepared, so the e-mail shows what was new that week.
create or replace function laria_private.prepare_weekly_follow_emails(p_week_start date, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  account record;
  items jsonb;
  prepared integer := 0;
  window_start timestamptz := ((p_week_start - 7)::timestamp at time zone 'America/Lima');
  window_end timestamptz := (p_week_start::timestamp at time zone 'America/Lima');
begin
  if p_week_start is null or p_week_start > (clock_timestamp() at time zone 'America/Lima')::date
    or extract(isodow from p_week_start) <> 1 or p_limit not between 1 and 500 then
    raise exception 'EMAIL_WEEKLY_WINDOW_INVALID';
  end if;
  for account in
    select pref.user_id from public.email_preferences pref
    where pref.follow_digest_emails
      and exists (select 1 from public.follows f where f.user_id = pref.user_id)
      and not exists (select 1 from laria_private.marketplace_email_deliveries d
                      where d.dedupe_key = 'follow_weekly:' || pref.user_id::text || ':' || p_week_start::text)
    order by pref.user_id
    limit p_limit
  loop
    select coalesce(jsonb_agg(item), '[]'::jsonb) into items from (
      select item from jsonb_array_elements(laria_private.followed_arrivals(account.user_id, window_start, 200)) item
      where (item->>'published_at')::timestamptz < window_end
      order by item->>'published_at' desc limit 8) newest;
    continue when jsonb_array_length(items) = 0;
    perform laria_private.enqueue_marketplace_email(
      'follow_weekly', account.user_id, 'follow_weekly:' || account.user_id::text || ':' || p_week_start::text,
      p_context => jsonb_build_object('week_start', p_week_start, 'items', items));
    prepared := prepared + 1;
  end loop;
  return prepared;
end;
$$;

create or replace function public.prepare_weekly_follow_emails(p_week_start date, p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = public, laria_private
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'EMAIL_SERVICE_REQUIRED';
  end if;
  return laria_private.prepare_weekly_follow_emails(p_week_start, p_limit);
end;
$$;

-- The e-mail payload now names the recipient's account (for the signed one-click links) and carries the first photo
-- of each listing (save-07: photos and prices in alert e-mails). Otherwise as before.
create or replace function laria_private.marketplace_email_payload(p_delivery laria_private.marketplace_email_deliveries)
returns jsonb
language plpgsql
stable security definer
set search_path = public, laria_private, auth
as $$
declare result jsonb; match_items jsonb := '[]'::jsonb;
begin
  if p_delivery.event_type = 'search_alert_daily' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'title', listing.title, 'slug', listing.slug, 'price_pen', listing.price_pen,
      'image_url', (select image_url from public.listing_photos where listing_id = listing.id order by sort_order limit 1)
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
    'recipient_user_id', auth_user.id,
    'recipient_email', auth_user.email,
    'recipient_name', profile.full_name,
    'context', p_delivery.context,
    'listing', case when listing.id is null then null else jsonb_build_object(
      'title', listing.title, 'slug', listing.slug, 'price_pen', listing.price_pen,
      'image_url', (select image_url from public.listing_photos where listing_id = listing.id order by sort_order limit 1)
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
      'name', alert.name,
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

-- ------------------------------------------------------------------ save-08: price drops that matter

-- A drop alerts only when the new price is at least 5% below the old one, and a listing alerts at most once in 24
-- hours. The notice names the listing (save-10). Otherwise the rules stay: approved and public before and after,
-- not out of stock, active store.
create or replace function public.notify_favorite_price_drop()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare transition_id uuid;
begin
 if old.status<>'approved' or new.status<>'approved' or new.price_pen>=old.price_pen
  or new.stock_state is not distinct from 'out_of_stock'
  or not ((old.seller_type='individual' and old.store_id is null) or (old.seller_type='store' and exists(select 1 from public.stores where id=old.store_id and status='active')))
  or not public.listing_is_public(new.id) then return new; end if;
 if new.price_pen > old.price_pen * 0.95 then return new; end if;
 if exists (select 1 from public.listing_price_drops where listing_id = new.id and created_at > now() - interval '24 hours') then return new; end if;
 insert into public.listing_price_drops(listing_id,old_price_pen,new_price_pen)
 values(new.id,old.price_pen,new.price_pen) returning id into transition_id;
 insert into public.notifications(user_id,event_type,message,listing_id,store_id,price_drop_id,old_price_pen,new_price_pen)
 select user_id,'listing_price_drop','«'||new.title||'» bajó de S/ '||to_char(old.price_pen,'FM999,999,999')||' a S/ '||to_char(new.price_pen,'FM999,999,999')||'.',
 new.id,new.store_id,transition_id,old.price_pen,new.price_pen from public.favorites where listing_id=new.id
 on conflict do nothing;
 return new;
end $$;

-- ------------------------------------------------------------------ save-05: alerts you can change

alter table public.saved_search_alerts add column if not exists name text;
alter table public.saved_search_alerts
  add constraint saved_search_alerts_name_length check (name is null or char_length(name) between 1 and 80);

-- One value (as before) or a list of up to 20 values for location and condition.
create or replace function laria_private.saved_search_text_values(p_value jsonb, p_max_length integer)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare items text[];
begin
  if jsonb_typeof(p_value) = 'string' then
    items := array[nullif(trim(p_value #>> '{}'), '')];
  elsif jsonb_typeof(p_value) = 'array' and jsonb_array_length(p_value) <= 20
    and not exists (select 1 from jsonb_array_elements(p_value) item where jsonb_typeof(item) <> 'string') then
    select array_agg(distinct nullif(trim(item #>> '{}'), '') order by nullif(trim(item #>> '{}'), ''))
    into items from jsonb_array_elements(p_value) item;
  else
    raise exception 'ALERT_FILTERS_INVALID';
  end if;
  items := array_remove(items, null);
  if exists (select 1 from unnest(items) value where length(value) > p_max_length) then raise exception 'ALERT_FILTERS_INVALID'; end if;
  if coalesce(cardinality(items), 0) = 0 then return null; end if;
  if cardinality(items) = 1 then return to_jsonb(items[1]); end if;
  return to_jsonb(items);
end;
$$;

create or replace function laria_private.saved_search_value_matches(p_value text, p_filter jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case jsonb_typeof(p_filter)
    when 'array' then coalesce(p_value, '') in (select jsonb_array_elements_text(p_filter))
    else p_value = p_filter #>> '{}'
  end;
$$;

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
  list_value jsonb;
  number_value numeric;
  advanced_entry record;
  allowed_advanced constant text[] := array[
    'acoustic_type','alloy','amplifier_type','audio_type','bass_type','body_shape','body_type',
    'bridge','configuration','connection','cymbal_type','drum_type','finish',
    'format','frets','handedness','has_preamp','includes_cymbals','includes_hardware',
    'inputs','keyboard_type','keys','kick_size','material','microphone_type','midi','pedal_type',
    'percussion_type','phantom_power','pickups','pieces','polar_pattern','power','scale_length',
    'shape','size','string_type','strings','strings_material','technology','true_bypass','use_case',
    'weighted_keys','wind_type'
  ];
begin
  if p_filters is null or jsonb_typeof(p_filters) <> 'object' or octet_length(p_filters::text) > 4096 then
    raise exception 'ALERT_FILTERS_INVALID';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_filters) key
    where key not in ('category','location','condition','brand','seller_type','instrument_type','min_price','max_price','advanced','query')
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
    if string_value is not null and string_value not in ('guitars','basses','keyboards','percussion','winds','strings','pedals','amplifiers','microphones','audio') then raise exception 'ALERT_FILTERS_INVALID'; end if;
    if string_value is not null then result := result || jsonb_build_object('category', string_value); end if;
  end if;
  if p_filters ? 'location' then
    list_value := laria_private.saved_search_text_values(p_filters->'location', 100);
    if list_value is not null then result := result || jsonb_build_object('location', list_value); end if;
  end if;
  if p_filters ? 'condition' then
    list_value := laria_private.saved_search_text_values(p_filters->'condition', 100);
    if list_value is not null and exists (
      select 1 from jsonb_array_elements_text(case when jsonb_typeof(list_value) = 'array' then list_value else jsonb_build_array(list_value) end) value
      where value not in ('Nuevo','Usado - buen estado','Usado - con detalles')
    ) then raise exception 'ALERT_FILTERS_INVALID'; end if;
    if list_value is not null then result := result || jsonb_build_object('condition', list_value); end if;
  end if;
  if p_filters ? 'brand' then
    if jsonb_typeof(p_filters->'brand') <> 'string' then raise exception 'ALERT_FILTERS_INVALID'; end if;
    string_value := nullif(trim(p_filters->>'brand'), '');
    if string_value is not null and length(string_value) > 200 then raise exception 'ALERT_FILTERS_INVALID'; end if;
    if string_value is not null then result := result || jsonb_build_object('brand', string_value); end if;
  end if;
  -- Keeps the find batch's free-text query (20261101120000_ux_find_search.sql), which this redefinition replaces.
  if p_filters ? 'query' then
    if jsonb_typeof(p_filters->'query') <> 'string' then raise exception 'ALERT_FILTERS_INVALID'; end if;
    string_value := nullif(trim(p_filters->>'query'), '');
    if string_value is not null and length(string_value) > 200 then raise exception 'ALERT_FILTERS_INVALID'; end if;
    if string_value is not null then result := result || jsonb_build_object('query', string_value); end if;
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

create or replace function laria_private.listing_matches_saved_search(p_listing public.listings, p_filters jsonb)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select
    p_listing.status = 'approved'
    and public.listing_is_public(p_listing.id)
    and (not (p_filters ? 'category') or p_listing.category = p_filters->>'category')
    and (not (p_filters ? 'location') or laria_private.saved_search_value_matches(p_listing.city, p_filters->'location'))
    and (not (p_filters ? 'condition') or laria_private.saved_search_value_matches(p_listing.condition, p_filters->'condition'))
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

-- save-10: each new match also leaves an in-app notice (quiet: no e-mail of its own, the alert's frequency decides
-- the e-mail). Otherwise the body is the one from Sprint 7.
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
    insert into public.notifications(user_id, event_type, message, listing_id, store_id)
    values (alert_record.user_id, 'listing_alert_match',
      'Nueva coincidencia para ' || coalesce('«' || alert_record.name || '»', 'tu alerta') || ': «' || listing_record.title || '».',
      listing_record.id, listing_record.store_id);
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

create or replace function public.update_saved_search_alert(p_alert_id uuid, p_name text, p_frequency text)
returns public.saved_search_alerts
language plpgsql
security definer
set search_path = public
as $$
declare saved public.saved_search_alerts; name_value text := nullif(trim(coalesce(p_name, '')), '');
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'ALERT_AUTH_REQUIRED'; end if;
  if p_frequency not in ('immediate','daily') then raise exception 'ALERT_FREQUENCY_INVALID'; end if;
  if char_length(name_value) > 80 then raise exception 'ALERT_NAME_INVALID'; end if;
  update public.saved_search_alerts
  set name = name_value, frequency = p_frequency, updated_at = clock_timestamp()
  where id = p_alert_id and user_id = auth.uid() and deleted_at is null
  returning * into saved;
  if not found then raise exception 'ALERT_NOT_OWNED'; end if;
  return saved;
end;
$$;

-- The account's alerts with their activity: total matches, the last match and how many arrived after p_since
-- (the previous visit, save-04).
create or replace function public.get_account_search_alerts(p_since timestamptz default null)
returns jsonb
language sql
stable security definer
set search_path = public, laria_private
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', alert.id, 'name', alert.name, 'search_filters', alert.search_filters, 'frequency', alert.frequency,
      'status', alert.status, 'active_since', alert.active_since, 'created_at', alert.created_at,
      'match_count', coalesce(stats.total, 0), 'last_match_at', stats.last_at, 'new_count', coalesce(stats.fresh, 0))
      order by alert.created_at desc), '[]'::jsonb)
  from public.saved_search_alerts alert
  left join lateral (
    select count(*) as total, max(match.matched_at) as last_at,
      count(*) filter (where p_since is not null and match.matched_at > p_since) as fresh
    from laria_private.search_alert_matches match
    where match.alert_id = alert.id and match.suppressed_at is null
  ) stats on true
  where alert.user_id = auth.uid() and alert.deleted_at is null;
$$;

-- ------------------------------------------------------------------ save-04: new since the last visit

-- Public listings published after p_since, counted by category (for "Nuevo desde tu última visita").
create or replace function public.get_new_listing_counts(p_since timestamptz, p_categories text[] default null)
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(category, total), '{}'::jsonb)
  from (
    select l.category, count(*) as total
    from public.listings l
    left join public.stores s on s.id = l.store_id
    where p_since is not null and p_since > now() - interval '90 days'
      and l.published_at > p_since and l.status = 'approved'
      and ((l.seller_type = 'individual' and l.store_id is null) or (l.seller_type = 'store' and s.status = 'active'))
      and l.stock_state is distinct from 'out_of_stock'
      and (p_categories is null or l.category = any(p_categories))
    group by l.category
  ) counts;
$$;

-- ------------------------------------------------------------------ save-10: mark all as read

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'NOTIFICATION_AUTH_REQUIRED'; end if;
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- ------------------------------------------------------------------ grants

revoke all on function public.merge_device_favorites(uuid[]) from public, anon;
revoke all on function public.set_favorite_note(uuid, text) from public, anon;
revoke all on function public.get_or_create_favorite_share() from public, anon;
revoke all on function public.revoke_favorite_share() from public, anon;
revoke all on function public.set_follow(uuid, text, boolean) from public, anon;
revoke all on function public.get_account_follows() from public, anon;
revoke all on function public.get_followed_arrivals(integer, integer) from public, anon;
revoke all on function public.set_email_preferences(boolean, boolean) from public, anon;
revoke all on function public.update_saved_search_alert(uuid, text, text) from public, anon;
revoke all on function public.get_account_search_alerts(timestamptz) from public, anon;
revoke all on function public.mark_all_notifications_read() from public, anon;
revoke all on function public.apply_email_link_action(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.prepare_weekly_follow_emails(date, integer) from public, anon, authenticated;
grant execute on function public.merge_device_favorites(uuid[]) to authenticated;
grant execute on function public.set_favorite_note(uuid, text) to authenticated;
grant execute on function public.get_or_create_favorite_share() to authenticated;
grant execute on function public.revoke_favorite_share() to authenticated;
grant execute on function public.set_follow(uuid, text, boolean) to authenticated;
grant execute on function public.get_account_follows() to authenticated;
grant execute on function public.get_followed_arrivals(integer, integer) to authenticated;
grant execute on function public.set_email_preferences(boolean, boolean) to authenticated;
grant execute on function public.update_saved_search_alert(uuid, text, text) to authenticated;
grant execute on function public.get_account_search_alerts(timestamptz) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.get_public_listing_cards(uuid[], text[]) to anon, authenticated;
grant execute on function public.get_shared_favorite_list(text) to anon, authenticated;
grant execute on function public.get_new_listing_counts(timestamptz, text[]) to anon, authenticated;
grant execute on function public.apply_email_link_action(uuid, text, uuid) to service_role;
grant execute on function public.prepare_weekly_follow_emails(date, integer) to service_role;

-- The find batch's migration (20261101120000_ux_find_search.sql) taught listing_matches_saved_search the free-text
-- "query" filter; the redefinition above would drop it. Put it back whenever find's search helpers exist.
do $$
declare
  definition text;
  old_text constant text := $old$    and (not (p_filters ? 'brand') or coalesce(p_listing.brand, '') ilike '%' || (p_filters->>'brand') || '%')$old$;
begin
  if to_regprocedure('public.listing_matches_query(text,text)') is null
    or to_regprocedure('public.listing_search_text(text,text,text,text,text)') is null then
    return;
  end if;
  definition := pg_get_functiondef('laria_private.listing_matches_saved_search(public.listings,jsonb)'::regprocedure);
  if position(old_text in definition) = 0 then
    raise exception 'listing_matches_saved_search: brand clause not found';
  end if;
  execute replace(definition, old_text, old_text || $new$
    and (not (p_filters ? 'query') or public.listing_matches_query(
      public.listing_search_text(p_listing.title, p_listing.brand, p_listing.model, p_listing.category, p_listing.instrument_type),
      p_filters->>'query'))$new$);
end;
$$;
