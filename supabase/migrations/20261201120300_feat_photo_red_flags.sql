-- Feature ideas, accounts batch (docs/feature-ideas/accounts.md), safe-05: red flags at review time, photo copies.
--
--   * public.listing_photo_fingerprints keeps a 64-bit difference hash (dHash) of each listing photo. The server
--     computes it (lib/photo-fingerprint.ts, no outside service) when Admin opens a listing for review and in the
--     daily job, then hands it over through service_record_listing_fingerprints.
--   * Two photos whose hashes differ in at most 5 of 64 bits look the same. When that happens between listings of
--     different sellers (an account, a store, or a legacy listing on its own), the newer listing gets a "photo_copy"
--     flag in public.listing_red_flags that names the other listing and the photos. Nothing is rejected or hidden:
--     Admin sees the reason next to the listing and decides.
--   * laria_private.listing_fingerprint_checks remembers which photo set of a listing was last hashed, so the job
--     hashes a listing again only when its photos change.
--   * The price rule of safe-05 waits for typical prices from the catalog (docs/feature-ideas/build-plan.md).
-- New objects only; get_admin_moderation_queue is untouched (the flags load on their own).

create table public.listing_photo_fingerprints (
  listing_id uuid not null references public.listings(id) on delete cascade,
  photo_key text not null check (char_length(photo_key) between 1 and 1000),
  sort_order integer not null default 0,
  owner_key text not null check (owner_key ~ '^(user|store|listing):[0-9a-f-]{36}$'),
  dhash bit(64) not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (listing_id, photo_key)
);
create index listing_photo_fingerprints_owner_idx on public.listing_photo_fingerprints (owner_key);
alter table public.listing_photo_fingerprints enable row level security;
revoke all on table public.listing_photo_fingerprints from public, anon, authenticated;

create table laria_private.listing_fingerprint_checks (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  photo_signature text not null,
  hashed integer not null default 0,
  checked_at timestamptz not null default clock_timestamp()
);
revoke all on table laria_private.listing_fingerprint_checks from public, anon, authenticated;

create table public.listing_red_flags (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  kind text not null check (kind in ('photo_copy')),
  matched_listing_id uuid not null references public.listings(id) on delete cascade,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 4096),
  status text not null default 'open' check (status in ('open', 'dismissed', 'confirmed')),
  review_note text check (review_note is null or char_length(review_note) <= 500),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  unique (listing_id, kind, matched_listing_id),
  constraint listing_red_flags_review_check check ((status = 'open') = (reviewed_at is null))
);
create index listing_red_flags_open_idx on public.listing_red_flags (status, created_at desc);
alter table public.listing_red_flags enable row level security;
revoke all on table public.listing_red_flags from public, anon, authenticated;

-- Whose photo it is: the store, else the owning account, else the (legacy) listing itself.
create or replace function laria_private.listing_owner_key(p_listing public.listings)
returns text
language sql
immutable
as $$
  select case
    when p_listing.store_id is not null then 'store:' || p_listing.store_id::text
    when p_listing.owner_user_id is not null then 'user:' || p_listing.owner_user_id::text
    else 'listing:' || p_listing.id::text end;
$$;
revoke all on function laria_private.listing_owner_key(public.listings) from public, anon, authenticated;

create or replace function laria_private.listing_photo_signature(p_listing_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select md5(coalesce(string_agg(image_url, '|' order by sort_order, id), ''))
  from public.listing_photos where listing_id = p_listing_id;
$$;
revoke all on function laria_private.listing_photo_signature(uuid) from public, anon, authenticated;

-- The job's to-do list: listings under review or live whose current photos were not hashed yet, pending first.
create or replace function public.listings_needing_fingerprints(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, laria_private
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'FINGERPRINT_SERVICE_REQUIRED';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('listing_id', l.id, 'photos', (
      select coalesce(jsonb_agg(jsonb_build_object('key', p.image_url, 'sort_order', p.sort_order) order by p.sort_order, p.id), '[]'::jsonb)
      from public.listing_photos p where p.listing_id = l.id)) order by l.status <> 'pending', l.created_at desc), '[]'::jsonb)
    from (
      select l.* from public.listings l
      left join laria_private.listing_fingerprint_checks c on c.listing_id = l.id
      where l.status in ('pending', 'approved', 'hidden')
        and exists (select 1 from public.listing_photos p where p.listing_id = l.id)
        and (c.listing_id is null or c.photo_signature <> laria_private.listing_photo_signature(l.id))
      order by l.status <> 'pending', l.created_at desc
      limit greatest(1, least(coalesce(p_limit, 50), 500))
    ) l);
end;
$$;
revoke all on function public.listings_needing_fingerprints(integer) from public, anon, authenticated;
grant execute on function public.listings_needing_fingerprints(integer) to service_role;

-- Stores the listing's hashes (replacing older ones), raises copy flags and remembers the photo set.
-- p_items: [{"key": "<image_url>", "sort_order": 0, "dhash": "<64 zeros and ones>"}]; photos that could not be read
-- are simply left out.
create or replace function public.service_record_listing_fingerprints(p_listing_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  listing public.listings;
  owner text;
  flagged integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'FINGERPRINT_SERVICE_REQUIRED';
  end if;
  select * into listing from public.listings where id = p_listing_id;
  if not found then raise exception 'FINGERPRINT_LISTING_NOT_FOUND'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 30
    or exists (select 1 from jsonb_array_elements(p_items) item
               where coalesce(item ->> 'dhash', '') !~ '^[01]{64}$' or coalesce(item ->> 'key', '') = '') then
    raise exception 'FINGERPRINT_INVALID';
  end if;
  owner := laria_private.listing_owner_key(listing);
  delete from public.listing_photo_fingerprints where listing_id = p_listing_id;
  insert into public.listing_photo_fingerprints (listing_id, photo_key, sort_order, owner_key, dhash)
  select p_listing_id, item ->> 'key', coalesce((item ->> 'sort_order')::integer, 0), owner, (item ->> 'dhash')::bit(64)
  from jsonb_array_elements(p_items) item
  on conflict (listing_id, photo_key) do nothing;

  -- Nearly flat pictures (almost all bits equal) match everything, so they never count.
  with pairs as (
    select distinct on (other.listing_id)
      other.listing_id as other_id, mine.sort_order + 1 as photo, other.sort_order + 1 as matched_photo,
      bit_count(mine.dhash # other.dhash) as distance
    from public.listing_photo_fingerprints mine
    join public.listing_photo_fingerprints other
      on other.owner_key <> mine.owner_key and other.listing_id <> mine.listing_id
      and bit_count(mine.dhash # other.dhash) <= 5
    where mine.listing_id = p_listing_id and bit_count(mine.dhash) between 4 and 60
    order by other.listing_id, bit_count(mine.dhash # other.dhash), mine.sort_order
  ), oriented as (
    select
      case when other.created_at > listing.created_at then other.id else listing.id end as flagged_id,
      case when other.created_at > listing.created_at then listing.id else other.id end as source_id,
      case when other.created_at > listing.created_at then pairs.matched_photo else pairs.photo end as photo,
      case when other.created_at > listing.created_at then pairs.photo else pairs.matched_photo end as source_photo,
      pairs.distance
    from pairs join public.listings other on other.id = pairs.other_id
  )
  insert into public.listing_red_flags (listing_id, kind, matched_listing_id, detail)
  select flagged_id, 'photo_copy', source_id,
    jsonb_build_object('photo', photo, 'matched_photo', source_photo, 'distance', distance)
  from oriented
  on conflict (listing_id, kind, matched_listing_id) do nothing;
  get diagnostics flagged = row_count;

  insert into laria_private.listing_fingerprint_checks (listing_id, photo_signature, hashed, checked_at)
  values (p_listing_id, laria_private.listing_photo_signature(p_listing_id), jsonb_array_length(p_items), clock_timestamp())
  on conflict (listing_id) do update
    set photo_signature = excluded.photo_signature, hashed = excluded.hashed, checked_at = excluded.checked_at;
  return jsonb_build_object('hashed', jsonb_array_length(p_items), 'flags', flagged);
end;
$$;
revoke all on function public.service_record_listing_fingerprints(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.service_record_listing_fingerprints(uuid, jsonb) to service_role;

-- Whether these listings' current photos were hashed already (Admin hashes the rest on opening them).
create or replace function public.service_listings_fingerprint_state(p_listing_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public, laria_private
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'FINGERPRINT_SERVICE_REQUIRED';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('listing_id', l.id,
      'current', c.listing_id is not null and c.photo_signature = laria_private.listing_photo_signature(l.id),
      'photos', (select coalesce(jsonb_agg(jsonb_build_object('key', p.image_url, 'sort_order', p.sort_order) order by p.sort_order, p.id), '[]'::jsonb)
                 from public.listing_photos p where p.listing_id = l.id))), '[]'::jsonb)
    from public.listings l
    left join laria_private.listing_fingerprint_checks c on c.listing_id = l.id
    where l.id = any(p_listing_ids[1:50]));
end;
$$;
revoke all on function public.service_listings_fingerprint_state(uuid[]) from public, anon, authenticated;
grant execute on function public.service_listings_fingerprint_state(uuid[]) to service_role;

create or replace function laria_private.red_flag_json(p_flag public.listing_red_flags)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_flag.id, 'kind', p_flag.kind, 'status', p_flag.status, 'detail', p_flag.detail,
    'review_note', p_flag.review_note, 'reviewed_at', p_flag.reviewed_at, 'created_at', p_flag.created_at,
    'listing', jsonb_build_object('id', l.id, 'title', l.title, 'slug', l.slug, 'status', l.status,
      'seller', coalesce(s.name, p.full_name, l.contact_name), 'created_at', l.created_at),
    'matched', jsonb_build_object('id', m.id, 'title', m.title, 'slug', m.slug, 'status', m.status,
      'seller', coalesce(ms.name, mp.full_name, m.contact_name), 'created_at', m.created_at))
  from public.listings l
  left join public.stores s on s.id = l.store_id
  left join public.profiles p on p.id = l.owner_user_id
  join public.listings m on m.id = p_flag.matched_listing_id
  left join public.stores ms on ms.id = m.store_id
  left join public.profiles mp on mp.id = m.owner_user_id
  where l.id = p_flag.listing_id;
$$;
revoke all on function laria_private.red_flag_json(public.listing_red_flags) from public, anon, authenticated;

-- Admin: the open flags of the listings on screen (the moderation queue item shows them next to the listing).
create or replace function public.admin_listing_red_flags(p_listing_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public, laria_private
as $$
begin
  perform laria_private.assert_admin();
  return (select coalesce(jsonb_agg(laria_private.red_flag_json(f) order by f.created_at), '[]'::jsonb)
    from public.listing_red_flags f
    where f.listing_id = any(p_listing_ids[1:100]) and f.status = 'open');
end;
$$;
revoke all on function public.admin_listing_red_flags(uuid[]) from public, anon;
grant execute on function public.admin_listing_red_flags(uuid[]) to authenticated;

create or replace function public.admin_red_flags(p_status text default 'open', p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, laria_private
as $$
begin
  perform laria_private.assert_admin();
  if p_status not in ('open', 'dismissed', 'confirmed') then raise exception 'RED_FLAG_STATUS_INVALID'; end if;
  return jsonb_build_object(
    'counts', (select coalesce(jsonb_object_agg(status, total), '{}'::jsonb) from (
      select status, count(*) as total from public.listing_red_flags group by status) counted),
    'items', (select coalesce(jsonb_agg(laria_private.red_flag_json(f) order by f.created_at desc), '[]'::jsonb)
      from (select * from public.listing_red_flags where status = p_status
            order by created_at desc limit greatest(1, least(coalesce(p_limit, 50), 200))) f));
end;
$$;
revoke all on function public.admin_red_flags(text, integer) from public, anon;
grant execute on function public.admin_red_flags(text, integer) to authenticated;

-- "Es una copia" or "No es copia". Neither changes the listing: Admin rejects or hides it with the usual tools.
create or replace function public.admin_review_red_flag(p_flag_id uuid, p_status text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare saved text;
begin
  perform laria_private.assert_admin();
  if p_status not in ('dismissed', 'confirmed') then raise exception 'RED_FLAG_STATUS_INVALID'; end if;
  update public.listing_red_flags
  set status = p_status, review_note = nullif(left(trim(coalesce(p_note, '')), 500), ''),
    reviewed_at = clock_timestamp(), reviewed_by = auth.uid()
  where id = p_flag_id and status = 'open'
  returning status into saved;
  if saved is null then raise exception 'RED_FLAG_NOT_OPEN'; end if;
  return saved;
end;
$$;
revoke all on function public.admin_review_red_flag(uuid, text, text) from public, anon;
grant execute on function public.admin_review_red_flag(uuid, text, text) to authenticated;
