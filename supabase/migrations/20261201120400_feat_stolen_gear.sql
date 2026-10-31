-- Feature ideas, accounts batch (docs/feature-ideas/accounts.md), safe-02: the stolen-gear registry.
--
--   * public.stolen_gear_reports: a signed-in person reports an instrument stolen with its serial number (when it has
--     one), photos (private bucket stolen-gear-photos, under their own folder) and the police report number.
--   * Private serials: public.listing_serials (one per listing, added when publishing or editing) and
--     public.inventory_item_serials (any number per store SKU; a store's listing takes them from its SKU). They are
--     never shown on a public page and only their owner and the matching below read them.
--   * Matching: the same serial (compared without spaces, dashes or case), or a listing photo whose hash is within 5
--     of 64 bits of a report photo, creates a row in public.stolen_report_matches for Admin, with the reason. A
--     reporter's own listings never match their own report. Nothing changes on the listing and nobody is accused on
--     a page: Admin reviews, and only a match Admin confirms tells the reporter (e-mail stolen_report_match), without
--     naming the listing or the seller. Copy says "coincide con un reporte", never "robado".
--   * laria_private.flag_serial_against_stolen_reports(serial, source, ref, owner) is the entry point other features
--     call with a serial they hold (selling-tools' "Mi equipo" passes source 'gear'). Keep its signature stable.
-- New objects only.

create or replace function laria_private.normalize_serial(p_serial text)
returns text
language sql
immutable
as $$
  select nullif(upper(regexp_replace(coalesce(p_serial, ''), '[^0-9A-Za-z]', '', 'g')), '');
$$;
grant execute on function laria_private.normalize_serial(text) to service_role;

create table public.stolen_gear_reports (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^RB-[0-9A-F]{8}$'),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  brand text not null check (char_length(brand) between 1 and 80),
  model text check (model is null or char_length(model) between 1 and 120),
  description text not null check (char_length(description) between 10 and 1000),
  serial_raw text check (serial_raw is null or char_length(serial_raw) between 1 and 60),
  serial_norm text check (serial_norm is null or char_length(serial_norm) between 4 and 40),
  stolen_on date not null check (stolen_on > date '1990-01-01'),
  place text not null check (char_length(place) between 2 and 120),
  police_report text not null check (char_length(police_report) between 3 and 60),
  police_station text check (police_station is null or char_length(police_station) between 2 and 120),
  status text not null default 'active' check (status in ('active', 'recovered', 'withdrawn', 'rejected')),
  status_reason text check (status_reason is null or char_length(status_reason) <= 500),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index stolen_gear_reports_serial_idx on public.stolen_gear_reports (serial_norm) where status = 'active' and serial_norm is not null;
create index stolen_gear_reports_reporter_idx on public.stolen_gear_reports (reporter_id, created_at desc);
alter table public.stolen_gear_reports enable row level security;
revoke all on table public.stolen_gear_reports from public, anon, authenticated;

create table public.stolen_gear_report_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.stolen_gear_reports(id) on delete cascade,
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9]{1,2}\.(jpg|png|webp)$'),
  sort_order integer not null default 0,
  dhash bit(64),
  created_at timestamptz not null default clock_timestamp()
);
create index stolen_gear_report_photos_report_idx on public.stolen_gear_report_photos (report_id, sort_order);
alter table public.stolen_gear_report_photos enable row level security;
revoke all on table public.stolen_gear_report_photos from public, anon, authenticated;

create table public.listing_serials (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  serial_raw text not null check (char_length(serial_raw) between 1 and 60),
  serial_norm text not null check (char_length(serial_norm) between 4 and 40),
  updated_at timestamptz not null default clock_timestamp()
);
create index listing_serials_norm_idx on public.listing_serials (serial_norm);
alter table public.listing_serials enable row level security;
revoke all on table public.listing_serials from public, anon, authenticated;

create table public.inventory_item_serials (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.store_inventory_items(id) on delete cascade,
  serial_raw text not null check (char_length(serial_raw) between 1 and 60),
  serial_norm text not null check (char_length(serial_norm) between 4 and 40),
  created_at timestamptz not null default clock_timestamp(),
  unique (item_id, serial_norm)
);
create index inventory_item_serials_norm_idx on public.inventory_item_serials (serial_norm);
alter table public.inventory_item_serials enable row level security;
revoke all on table public.inventory_item_serials from public, anon, authenticated;

create table public.stolen_report_matches (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.stolen_gear_reports(id) on delete cascade,
  source text not null check (source in ('listing', 'inventory', 'gear', 'photo')),
  ref_id uuid not null,
  listing_id uuid references public.listings(id) on delete set null,
  inventory_item_id uuid references public.store_inventory_items(id) on delete set null,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 4096),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'dismissed')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 500),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reporter_notified_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (report_id, source, ref_id),
  constraint stolen_report_matches_review_check check ((status = 'pending') = (reviewed_at is null))
);
create index if not exists stolen_report_matches_inventory_item_idx on public.stolen_report_matches (inventory_item_id)
  where inventory_item_id is not null;
create index if not exists stolen_report_matches_listing_idx on public.stolen_report_matches (listing_id)
  where listing_id is not null;
create index if not exists stolen_report_matches_reviewed_by_idx on public.stolen_report_matches (reviewed_by)
  where reviewed_by is not null;
create index stolen_report_matches_status_idx on public.stolen_report_matches (status, created_at desc);
alter table public.stolen_report_matches enable row level security;
revoke all on table public.stolen_report_matches from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stolen-gear-photos', 'stolen-gear-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Reporters upload stolen-gear photos under own folder"
on storage.objects for insert to authenticated
with check (bucket_id = 'stolen-gear-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$');
create policy "Reporters read own stolen-gear photos"
on storage.objects for select to authenticated
using (bucket_id = 'stolen-gear-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Reporters delete own stolen-gear photos"
on storage.objects for delete to authenticated
using (bucket_id = 'stolen-gear-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ------------------------------------------------------------------ matching

-- A serial someone holds (a listing's, a SKU's, or a "Mi equipo" item's) against the active reports.
--   p_source: 'listing' (p_ref = listing id), 'inventory' (p_ref = store_inventory_items id) or 'gear' (p_ref = the
--   Mi equipo row id; pass its owner as p_owner_id so a reporter's own gear never matches).
-- Returns how many new matches it created.
create or replace function laria_private.flag_serial_against_stolen_reports(
  p_serial text, p_source text, p_ref uuid, p_owner_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  norm text := laria_private.normalize_serial(p_serial);
  owner uuid := p_owner_id;
  match_listing uuid;
  match_item uuid;
  created integer;
begin
  if norm is null or char_length(norm) not between 4 and 40 or p_ref is null then return 0; end if;
  if p_source = 'listing' then
    select l.id, coalesce(l.owner_user_id, s.owner_user_id) into match_listing, owner
    from public.listings l left join public.stores s on s.id = l.store_id where l.id = p_ref;
    if match_listing is null then return 0; end if;
  elsif p_source = 'inventory' then
    select i.id, i.listing_id, s.owner_user_id into match_item, match_listing, owner
    from public.store_inventory_items i join public.stores s on s.id = i.store_id where i.id = p_ref;
    if match_item is null then return 0; end if;
  elsif p_source <> 'gear' then
    raise exception 'STOLEN_SOURCE_INVALID';
  end if;
  insert into public.stolen_report_matches (report_id, source, ref_id, listing_id, inventory_item_id, detail)
  select r.id, p_source, p_ref, match_listing, match_item, jsonb_build_object('serial', norm)
  from public.stolen_gear_reports r
  where r.serial_norm = norm and r.status = 'active' and r.reporter_id is distinct from owner
  on conflict (report_id, source, ref_id) do nothing;
  get diagnostics created = row_count;
  return created;
end;
$$;
revoke all on function laria_private.flag_serial_against_stolen_reports(text, text, uuid, uuid) from public, anon, authenticated;

create or replace function laria_private.flag_listing_serial()
returns trigger
language plpgsql
security definer
set search_path = public, laria_private
as $$
begin
  perform laria_private.flag_serial_against_stolen_reports(new.serial_raw, 'listing', new.listing_id);
  return new;
end;
$$;
revoke all on function laria_private.flag_listing_serial() from public, anon, authenticated;
create trigger listing_serials_flag_stolen
  after insert or update of serial_norm on public.listing_serials
  for each row execute function laria_private.flag_listing_serial();

create or replace function laria_private.flag_inventory_serial()
returns trigger
language plpgsql
security definer
set search_path = public, laria_private
as $$
begin
  perform laria_private.flag_serial_against_stolen_reports(new.serial_raw, 'inventory', new.item_id);
  return new;
end;
$$;
revoke all on function laria_private.flag_inventory_serial() from public, anon, authenticated;
create trigger inventory_item_serials_flag_stolen
  after insert on public.inventory_item_serials
  for each row execute function laria_private.flag_inventory_serial();

-- A new (or reopened) report looks for the serial among the listings and SKUs already registered.
create or replace function laria_private.match_new_stolen_report()
returns trigger
language plpgsql
security definer
set search_path = public, laria_private
as $$
begin
  if new.status <> 'active' or new.serial_norm is null then return new; end if;
  insert into public.stolen_report_matches (report_id, source, ref_id, listing_id, detail)
  select new.id, 'listing', ls.listing_id, ls.listing_id, jsonb_build_object('serial', ls.serial_norm)
  from public.listing_serials ls
  join public.listings l on l.id = ls.listing_id
  left join public.stores s on s.id = l.store_id
  where ls.serial_norm = new.serial_norm and coalesce(l.owner_user_id, s.owner_user_id) is distinct from new.reporter_id
  on conflict (report_id, source, ref_id) do nothing;
  insert into public.stolen_report_matches (report_id, source, ref_id, listing_id, inventory_item_id, detail)
  select new.id, 'inventory', i.id, i.listing_id, i.id, jsonb_build_object('serial', iss.serial_norm)
  from public.inventory_item_serials iss
  join public.store_inventory_items i on i.id = iss.item_id
  join public.stores s on s.id = i.store_id
  where iss.serial_norm = new.serial_norm and s.owner_user_id is distinct from new.reporter_id
  on conflict (report_id, source, ref_id) do nothing;
  return new;
end;
$$;
revoke all on function laria_private.match_new_stolen_report() from public, anon, authenticated;
create trigger stolen_gear_reports_match
  after insert or update of serial_norm, status on public.stolen_gear_reports
  for each row execute function laria_private.match_new_stolen_report();

-- Photos: a listing photo hashed for safe-05 is compared with the photos of active reports, and a report photo with
-- the listing photos hashed so far. Nearly flat pictures never count.
create or replace function laria_private.match_listing_photo_against_reports()
returns trigger
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare owner uuid;
begin
  if bit_count(new.dhash) not between 4 and 60 then return new; end if;
  select coalesce(l.owner_user_id, s.owner_user_id) into owner
  from public.listings l left join public.stores s on s.id = l.store_id where l.id = new.listing_id;
  insert into public.stolen_report_matches (report_id, source, ref_id, listing_id, detail)
  select distinct on (r.id) r.id, 'photo', new.listing_id, new.listing_id,
    jsonb_build_object('photo', new.sort_order + 1, 'report_photo', rp.sort_order + 1, 'distance', bit_count(rp.dhash # new.dhash))
  from public.stolen_gear_report_photos rp
  join public.stolen_gear_reports r on r.id = rp.report_id
  where rp.dhash is not null and r.status = 'active' and r.reporter_id is distinct from owner
    and bit_count(rp.dhash # new.dhash) <= 5
  order by r.id, bit_count(rp.dhash # new.dhash)
  on conflict (report_id, source, ref_id) do nothing;
  return new;
end;
$$;
revoke all on function laria_private.match_listing_photo_against_reports() from public, anon, authenticated;
create trigger listing_photo_fingerprints_match_stolen
  after insert on public.listing_photo_fingerprints
  for each row execute function laria_private.match_listing_photo_against_reports();

create or replace function laria_private.match_report_photos(p_report_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare created integer;
begin
  insert into public.stolen_report_matches (report_id, source, ref_id, listing_id, detail)
  select distinct on (f.listing_id) r.id, 'photo', f.listing_id, f.listing_id,
    jsonb_build_object('photo', f.sort_order + 1, 'report_photo', rp.sort_order + 1, 'distance', bit_count(rp.dhash # f.dhash))
  from public.stolen_gear_reports r
  join public.stolen_gear_report_photos rp on rp.report_id = r.id and rp.dhash is not null
  join public.listing_photo_fingerprints f on bit_count(rp.dhash # f.dhash) <= 5
  join public.listings l on l.id = f.listing_id
  left join public.stores s on s.id = l.store_id
  where r.id = p_report_id and r.status = 'active' and bit_count(rp.dhash) between 4 and 60
    and coalesce(l.owner_user_id, s.owner_user_id) is distinct from r.reporter_id
  order by f.listing_id, bit_count(rp.dhash # f.dhash)
  on conflict (report_id, source, ref_id) do nothing;
  get diagnostics created = row_count;
  return created;
end;
$$;
revoke all on function laria_private.match_report_photos(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ reporting

-- p_photos: [{"path": "<uid>/<report folder>/<n>.jpg", "dhash": "<64 zeros and ones>"}], uploaded beforehand under
-- the caller's own folder. A report needs a serial or at least one photo; five reports per account a day at most.
create or replace function public.submit_stolen_gear_report(
  p_brand text,
  p_model text,
  p_description text,
  p_serial text,
  p_stolen_on date,
  p_place text,
  p_police_report text,
  p_police_station text,
  p_photos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  uid uuid := auth.uid();
  norm text := laria_private.normalize_serial(p_serial);
  saved public.stolen_gear_reports;
  photo_count integer := coalesce(jsonb_array_length(case when jsonb_typeof(p_photos) = 'array' then p_photos end), 0);
begin
  if uid is null then raise exception using errcode = '42501', message = 'STOLEN_AUTH_REQUIRED'; end if;
  if p_photos is not null and jsonb_typeof(p_photos) <> 'array' or photo_count > 6
    or exists (select 1 from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) item
               where coalesce(item ->> 'path', '') not like uid::text || '/%'
                 or (item ? 'dhash' and coalesce(item ->> 'dhash', '') !~ '^[01]{64}$')) then
    raise exception 'STOLEN_PHOTOS_INVALID';
  end if;
  if norm is not null and char_length(norm) not between 4 and 40 then raise exception 'STOLEN_SERIAL_INVALID'; end if;
  if norm is null and photo_count = 0 then raise exception 'STOLEN_SERIAL_OR_PHOTO_REQUIRED'; end if;
  if p_stolen_on is null or p_stolen_on > (clock_timestamp() at time zone 'America/Lima')::date then
    raise exception 'STOLEN_REPORT_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stolen_reports:' || uid::text, 0));
  if (select count(*) from public.stolen_gear_reports
      where reporter_id = uid and created_at > clock_timestamp() - interval '24 hours') >= 5 then
    raise exception 'STOLEN_RATE_LIMITED';
  end if;
  insert into public.stolen_gear_reports (code, reporter_id, brand, model, description, serial_raw, serial_norm,
    stolen_on, place, police_report, police_station)
  values ('RB-' || upper(encode(extensions.gen_random_bytes(4), 'hex')), uid, trim(p_brand), nullif(trim(coalesce(p_model, '')), ''),
    trim(p_description), case when norm is null then null else trim(p_serial) end, norm, p_stolen_on, trim(p_place),
    trim(p_police_report), nullif(trim(coalesce(p_police_station, '')), ''))
  returning * into saved;
  insert into public.stolen_gear_report_photos (report_id, storage_path, sort_order, dhash)
  select saved.id, item ->> 'path', (n - 1)::integer, (item ->> 'dhash')::bit(64)
  from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) with ordinality as photos(item, n);
  perform laria_private.match_report_photos(saved.id);
  return jsonb_build_object('id', saved.id, 'code', saved.code);
exception
  when check_violation then raise exception 'STOLEN_REPORT_INVALID';
end;
$$;
revoke all on function public.submit_stolen_gear_report(text, text, text, text, date, text, text, text, jsonb) from public, anon;
grant execute on function public.submit_stolen_gear_report(text, text, text, text, date, text, text, text, jsonb) to authenticated;

-- The reporter's own reports. Matches stay with Admin until reviewed: the reporter sees only confirmed ones, counted.
create or replace function public.my_stolen_reports()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'STOLEN_AUTH_REQUIRED'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'code', r.code, 'brand', r.brand, 'model', r.model, 'serial', r.serial_raw, 'stolen_on', r.stolen_on,
      'place', r.place, 'police_report', r.police_report, 'status', r.status, 'created_at', r.created_at,
      'photos', (select coalesce(jsonb_agg(p.storage_path order by p.sort_order), '[]'::jsonb)
                 from public.stolen_gear_report_photos p where p.report_id = r.id),
      'confirmed_matches', (select count(*) from public.stolen_report_matches m where m.report_id = r.id and m.status = 'confirmed'))
      order by r.created_at desc), '[]'::jsonb)
    from public.stolen_gear_reports r where r.reporter_id = auth.uid());
end;
$$;
revoke all on function public.my_stolen_reports() from public, anon;
grant execute on function public.my_stolen_reports() to authenticated;

-- "Lo recuperé" or "Retirar reporte". Matches still waiting for Admin are closed with the report.
create or replace function public.set_my_stolen_report_status(p_report_id uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare saved text;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'STOLEN_AUTH_REQUIRED'; end if;
  if p_status not in ('recovered', 'withdrawn') then raise exception 'STOLEN_STATUS_INVALID'; end if;
  update public.stolen_gear_reports set status = p_status, updated_at = clock_timestamp()
  where id = p_report_id and reporter_id = auth.uid() and status = 'active'
  returning status into saved;
  if saved is null then raise exception 'STOLEN_REPORT_NOT_ACTIVE'; end if;
  update public.stolen_report_matches
  set status = 'dismissed', reviewed_at = clock_timestamp(), admin_note = 'Reporte cerrado por quien lo hizo.'
  where report_id = p_report_id and status = 'pending';
  return saved;
end;
$$;
revoke all on function public.set_my_stolen_report_status(uuid, text) from public, anon;
grant execute on function public.set_my_stolen_report_status(uuid, text) to authenticated;

-- ------------------------------------------------------------------ private serials

create or replace function laria_private.can_manage_listing(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.listings l
    where l.id = p_listing_id and auth.uid() is not null
      and (l.owner_user_id = auth.uid() or (l.store_id is not null and public.is_store_owner(l.store_id)))
  );
$$;
revoke all on function laria_private.can_manage_listing(uuid) from public, anon, authenticated;

-- An empty serial removes it. Only the listing's owner (or its store's owner) sets or reads it.
create or replace function public.set_listing_serial(p_listing_id uuid, p_serial text)
returns boolean
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare norm text := laria_private.normalize_serial(p_serial);
begin
  if not laria_private.can_manage_listing(p_listing_id) then
    raise exception using errcode = '42501', message = 'LISTING_SERIAL_FORBIDDEN';
  end if;
  if norm is null then
    delete from public.listing_serials where listing_id = p_listing_id;
    return false;
  end if;
  if char_length(norm) not between 4 and 40 or char_length(trim(p_serial)) > 60 then raise exception 'LISTING_SERIAL_INVALID'; end if;
  insert into public.listing_serials (listing_id, serial_raw, serial_norm)
  values (p_listing_id, trim(p_serial), norm)
  on conflict (listing_id) do update
    set serial_raw = excluded.serial_raw, serial_norm = excluded.serial_norm, updated_at = clock_timestamp()
    where listing_serials.serial_norm is distinct from excluded.serial_norm or listing_serials.serial_raw is distinct from excluded.serial_raw;
  return true;
end;
$$;
revoke all on function public.set_listing_serial(uuid, text) from public, anon;
grant execute on function public.set_listing_serial(uuid, text) to authenticated;

create or replace function public.get_listing_serial(p_listing_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, laria_private
as $$
begin
  if not laria_private.can_manage_listing(p_listing_id) then
    raise exception using errcode = '42501', message = 'LISTING_SERIAL_FORBIDDEN';
  end if;
  return (select serial_raw from public.listing_serials where listing_id = p_listing_id);
end;
$$;
revoke all on function public.get_listing_serial(uuid) from public, anon;
grant execute on function public.get_listing_serial(uuid) to authenticated;

-- A SKU's serials, one per unit the store holds (up to 200). The list replaces the previous one.
create or replace function public.set_inventory_item_serials(p_item_id uuid, p_serials text[])
returns integer
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  store uuid;
  saved integer;
begin
  select store_id into store from public.store_inventory_items where id = p_item_id;
  if store is null or not public.is_store_owner(store) then
    raise exception using errcode = '42501', message = 'INVENTORY_SERIAL_FORBIDDEN';
  end if;
  if coalesce(cardinality(p_serials), 0) > 200 or exists (
    select 1 from unnest(coalesce(p_serials, '{}')) s
    where laria_private.normalize_serial(s) is not null
      and (char_length(laria_private.normalize_serial(s)) not between 4 and 40 or char_length(trim(s)) > 60)) then
    raise exception 'INVENTORY_SERIAL_INVALID';
  end if;
  delete from public.inventory_item_serials
  where item_id = p_item_id
    and serial_norm <> all (array(select laria_private.normalize_serial(s) from unnest(coalesce(p_serials, '{}')) s
                                  where laria_private.normalize_serial(s) is not null));
  insert into public.inventory_item_serials (item_id, serial_raw, serial_norm)
  select distinct on (laria_private.normalize_serial(s)) p_item_id, trim(s), laria_private.normalize_serial(s)
  from unnest(coalesce(p_serials, '{}')) s
  where laria_private.normalize_serial(s) is not null
  on conflict (item_id, serial_norm) do nothing;
  select count(*) into saved from public.inventory_item_serials where item_id = p_item_id;
  return saved;
end;
$$;
revoke all on function public.set_inventory_item_serials(uuid, text[]) from public, anon;
grant execute on function public.set_inventory_item_serials(uuid, text[]) to authenticated;

create or replace function public.get_inventory_item_serials(p_item_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare store uuid;
begin
  select store_id into store from public.store_inventory_items where id = p_item_id;
  if store is null or not public.is_store_owner(store) then
    raise exception using errcode = '42501', message = 'INVENTORY_SERIAL_FORBIDDEN';
  end if;
  return array(select serial_raw from public.inventory_item_serials where item_id = p_item_id order by created_at, serial_norm);
end;
$$;
revoke all on function public.get_inventory_item_serials(uuid) from public, anon;
grant execute on function public.get_inventory_item_serials(uuid) to authenticated;

-- ------------------------------------------------------------------ Admin

create or replace function public.admin_stolen_matches(p_status text default 'pending', p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, laria_private
as $$
begin
  perform laria_private.assert_admin();
  if p_status not in ('pending', 'confirmed', 'dismissed') then raise exception 'STOLEN_STATUS_INVALID'; end if;
  return jsonb_build_object(
    'counts', (select coalesce(jsonb_object_agg(status, total), '{}'::jsonb) from (
      select status, count(*) as total from public.stolen_report_matches group by status) counted),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'source', m.source, 'ref_id', m.ref_id, 'detail', m.detail, 'status', m.status,
        'admin_note', m.admin_note, 'reviewed_at', m.reviewed_at, 'reporter_notified_at', m.reporter_notified_at,
        'created_at', m.created_at,
        'report', jsonb_build_object('id', r.id, 'code', r.code, 'brand', r.brand, 'model', r.model,
          'description', r.description, 'serial', r.serial_raw, 'stolen_on', r.stolen_on, 'place', r.place,
          'police_report', r.police_report, 'police_station', r.police_station, 'status', r.status,
          'reporter', coalesce(rp.full_name, 'Sin nombre'), 'reporter_email', ru.email,
          'photos', (select coalesce(jsonb_agg(p.storage_path order by p.sort_order), '[]'::jsonb)
                     from public.stolen_gear_report_photos p where p.report_id = r.id)),
        'listing', case when l.id is null then null else jsonb_build_object('id', l.id, 'title', l.title, 'slug', l.slug,
          'status', l.status, 'seller', coalesce(s.name, lp.full_name, l.contact_name),
          'photo', (select image_url from public.listing_photos where listing_id = l.id order by sort_order limit 1)) end,
        'inventory_item', case when i.id is null then null else jsonb_build_object('id', i.id, 'sku', i.merchant_sku,
          'name', i.product_name, 'store', si.name) end
      ) order by m.created_at desc), '[]'::jsonb)
      from (select * from public.stolen_report_matches where status = p_status
            order by created_at desc limit greatest(1, least(coalesce(p_limit, 50), 200))) m
      join public.stolen_gear_reports r on r.id = m.report_id
      left join public.profiles rp on rp.id = r.reporter_id
      left join auth.users ru on ru.id = r.reporter_id
      left join public.listings l on l.id = m.listing_id
      left join public.stores s on s.id = l.store_id
      left join public.profiles lp on lp.id = l.owner_user_id
      left join public.store_inventory_items i on i.id = m.inventory_item_id
      left join public.stores si on si.id = i.store_id));
end;
$$;
revoke all on function public.admin_stolen_matches(text, integer) from public, anon;
grant execute on function public.admin_stolen_matches(text, integer) to authenticated;

-- "Coincide" tells the reporter by e-mail, once, without naming the listing or the seller; "No coincide" closes it
-- silently. Neither touches the listing: Admin hides or rejects it with the usual moderation tools if needed.
create or replace function public.admin_review_stolen_match(p_match_id uuid, p_status text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  saved public.stolen_report_matches;
  report public.stolen_gear_reports;
  notified boolean := false;
begin
  perform laria_private.assert_admin();
  if p_status not in ('confirmed', 'dismissed') then raise exception 'STOLEN_STATUS_INVALID'; end if;
  update public.stolen_report_matches
  set status = p_status, admin_note = nullif(left(trim(coalesce(p_note, '')), 500), ''),
    reviewed_at = clock_timestamp(), reviewed_by = auth.uid()
  where id = p_match_id and status = 'pending'
  returning * into saved;
  if not found then raise exception 'STOLEN_MATCH_NOT_PENDING'; end if;
  select * into report from public.stolen_gear_reports where id = saved.report_id;
  if p_status = 'confirmed' and exists (select 1 from public.profiles where id = report.reporter_id) then
    perform laria_private.enqueue_marketplace_email(
      'stolen_report_match', report.reporter_id, 'stolen_report_match:' || saved.id::text,
      p_context => jsonb_build_object('report_code', report.code, 'item', trim(report.brand || ' ' || coalesce(report.model, ''))));
    update public.stolen_report_matches set reporter_notified_at = clock_timestamp() where id = saved.id;
    notified := true;
  end if;
  return jsonb_build_object('status', saved.status, 'reporter_notified', notified);
end;
$$;
revoke all on function public.admin_review_stolen_match(uuid, text, text) from public, anon;
grant execute on function public.admin_review_stolen_match(uuid, text, text) to authenticated;

create or replace function public.admin_stolen_reports(p_status text default 'active', p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform laria_private.assert_admin();
  if p_status not in ('active', 'recovered', 'withdrawn', 'rejected') then raise exception 'STOLEN_STATUS_INVALID'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'code', r.code, 'brand', r.brand, 'model', r.model, 'description', r.description,
      'serial', r.serial_raw, 'stolen_on', r.stolen_on, 'place', r.place, 'police_report', r.police_report,
      'police_station', r.police_station, 'status', r.status, 'status_reason', r.status_reason, 'created_at', r.created_at,
      'reporter', coalesce(p.full_name, 'Sin nombre'), 'reporter_email', u.email,
      'photos', (select coalesce(jsonb_agg(ph.storage_path order by ph.sort_order), '[]'::jsonb)
                 from public.stolen_gear_report_photos ph where ph.report_id = r.id),
      'matches', (select count(*) from public.stolen_report_matches m where m.report_id = r.id))
      order by r.created_at desc), '[]'::jsonb)
    from (select * from public.stolen_gear_reports where status = p_status
          order by created_at desc limit greatest(1, least(coalesce(p_limit, 50), 200))) r
    left join public.profiles p on p.id = r.reporter_id
    left join auth.users u on u.id = r.reporter_id);
end;
$$;
revoke all on function public.admin_stolen_reports(text, integer) from public, anon;
grant execute on function public.admin_stolen_reports(text, integer) to authenticated;

-- Admin can set aside a report that is not credible (with a reason) and reopen it.
create or replace function public.admin_set_stolen_report_status(p_report_id uuid, p_status text, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare saved text;
begin
  perform laria_private.assert_admin();
  if p_status not in ('active', 'rejected') then raise exception 'STOLEN_STATUS_INVALID'; end if;
  if p_status = 'rejected' and char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'STOLEN_REASON_REQUIRED'; end if;
  update public.stolen_gear_reports
  set status = p_status, status_reason = case when p_status = 'rejected' then left(trim(p_reason), 500) end,
    updated_at = clock_timestamp()
  where id = p_report_id and status in ('active', 'rejected')
  returning status into saved;
  if saved is null then raise exception 'STOLEN_REPORT_NOT_FOUND'; end if;
  if p_status = 'rejected' then
    update public.stolen_report_matches
    set status = 'dismissed', reviewed_at = clock_timestamp(), reviewed_by = auth.uid(), admin_note = 'Reporte descartado.'
    where report_id = p_report_id and status = 'pending';
  end if;
  return saved;
end;
$$;
revoke all on function public.admin_set_stolen_report_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_stolen_report_status(uuid, text, text) to authenticated;
