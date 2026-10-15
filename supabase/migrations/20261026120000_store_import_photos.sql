-- STORE-3a: photos for a spreadsheet import (docs/store-operations/design.md §8; owner decision D-3 at its accepted
-- default: 600 photos per import, 5 MB each).
--
-- Purely additive on top of 20261025120000_store_inventory_import.sql (STORE-2). Changes to existing objects:
--   * listing_photo_set_is_valid() accepts one more URL shape (a validated import photo of the same owner and store);
--     every other branch is the Sprint 4 function unchanged.
--   * Two nullable columns (store_import_rows.photo_state/photo_count) and one column on store_import_sessions
--     (photo_counts), plus indexes on listing_photos.image_url and listing_revision_photos.image_url.
--
-- Model (design §8.1):
--   * The server never opens a merchant's ZIP. The browser opens it (or takes a multi-file selection) and uploads each
--     image on its own to a path the database generated: store-import-photos/{uid}/{session}/{asset}.{ext}. A file
--     name inside an archive is display text and a matching hint, never part of a storage path.
--   * Uploading is not enough. An asset becomes `validated` only through record_store_import_photo_checks(), which only
--     the service role can call, after the server read the stored bytes (magic bytes, header dimensions, size,
--     SHA-256). Owners cannot mark their own uploads valid.
--   * Matching is deterministic and never guesses from pictures (§8.2): the spreadsheet's Foto(s) column or a manifest
--     names the row; otherwise the file name SKU__NN.ext does. Ambiguity blocks the row instead of picking one.
--   * Publication (STORE-3b) uses /api/listing-images/{uid}/import-photos/{session}/{asset}.{ext}. The proxy maps that
--     prefix only to the store-import-photos bucket, never to the store-imports spreadsheet bucket. No bytes are copied.
--   * An asset referenced by any listing or pending revision is never deleted. Discarding locks the asset row and
--     re-checks references; attaching locks the same row (trigger below) and requires it to be validated, so the two
--     cannot both win.

-- ------------------------------------------------------------------ bucket

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('store-import-photos', 'store-import-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------------ tables

create table public.store_import_photo_assets (
  id                     uuid primary key default gen_random_uuid(),
  -- Request order: the tie-break wherever "first" matters (duplicate images, placement), since every slot of one
  -- request shares created_at.
  request_order          bigint generated always as identity,
  session_id             uuid not null references public.store_import_sessions(id) on delete cascade,
  store_id               uuid not null references public.stores(id) on delete restrict,
  created_by             uuid not null,
  -- The base name the merchant's file had, cleaned for display. Never used to build a path.
  original_name          text not null check (char_length(original_name) between 1 and 120),
  file_ext               text not null check (file_ext in ('jpg', 'png', 'webp')),
  object_path            text not null unique,
  declared_bytes         integer not null check (declared_bytes between 1 and 5242880),
  -- What the name or the manifest says about the target, before matching.
  claim_source           text not null check (claim_source in ('filename', 'manifest', 'none')),
  claimed_sku            text check (claimed_sku is null or char_length(claimed_sku) <= 64),
  claimed_sku_normalized text check (claimed_sku_normalized is null or claimed_sku_normalized = upper(claimed_sku_normalized)),
  claimed_sequence       smallint check (claimed_sequence is null or claimed_sequence between 1 and 10),
  status                 text not null default 'awaiting_upload'
                           check (status in ('awaiting_upload', 'validated', 'rejected', 'discarded')),
  reject_code            text check (reject_code is null or reject_code ~ '^PHOTO_[A-Z_]{2,40}$'),
  -- Set only after the server read the bytes.
  mime_type              text check (mime_type is null or mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  bytes                  integer check (bytes is null or bytes between 1 and 5242880),
  width                  integer check (width is null or width between 400 and 8000),
  height                 integer check (height is null or height between 400 and 8000),
  sha256                 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  -- Matching outcome. placement 'manual' means the merchant placed or removed it; automatic matching leaves it alone.
  placement              text not null default 'auto' check (placement in ('auto', 'manual')),
  target_row_number      integer,
  match_source           text check (match_source is null or match_source in ('column', 'manifest', 'filename', 'manual')),
  match_issue            text check (match_issue is null or match_issue in (
                           'no_sku_in_name', 'unmatched_sku', 'ambiguous_sku', 'listed_twice', 'duplicate_sequence',
                           'duplicate_image', 'over_limit', 'removed')),
  match_note             text check (match_note is null or match_note in ('explicit_over_filename')),
  duplicate_of           uuid references public.store_import_photo_assets(id) on delete set null,
  validated_at           timestamptz,
  discarded_at           timestamptz,
  delete_claimed_at      timestamptz,
  deleted_at             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  unique (id, session_id),
  constraint import_photo_path_shape check (
    object_path = created_by::text || '/' || session_id::text || '/' || id::text || '.' || file_ext),
  constraint import_photo_validated_shape check (
    status <> 'validated' or (validated_at is not null and mime_type is not null and bytes is not null
                              and width is not null and height is not null and sha256 is not null)),
  constraint import_photo_rejected_shape check ((status = 'rejected') = (reject_code is not null)),
  constraint import_photo_discarded_shape check ((status = 'discarded') = (discarded_at is not null)),
  constraint import_photo_deleted_shape check (deleted_at is null or status in ('rejected', 'discarded'))
);

create index store_import_photo_assets_session_idx on public.store_import_photo_assets(session_id, request_order);
create index store_import_photo_assets_hash_idx on public.store_import_photo_assets(session_id, sha256) where sha256 is not null;
create index store_import_photo_assets_cleanup_idx on public.store_import_photo_assets(created_at)
  where status in ('rejected', 'discarded') and deleted_at is null;

create trigger store_import_photo_assets_set_updated_at
before update on public.store_import_photo_assets
for each row execute function public.set_updated_at();

-- One photo belongs to at most one row; a row has at most 10 ordered photos. The order key is deferrable so a
-- reorder can swap positions inside one statement.
create table public.store_import_photo_assignments (
  asset_id    uuid primary key,
  session_id  uuid not null,
  row_number  integer not null,
  sort_order  smallint not null check (sort_order between 1 and 10),
  created_at  timestamptz not null default now(),
  foreign key (asset_id, session_id) references public.store_import_photo_assets(id, session_id) on delete cascade,
  foreign key (session_id, row_number) references public.store_import_rows(session_id, row_number) on delete cascade,
  constraint store_import_photo_assignments_order_key unique (session_id, row_number, sort_order)
    deferrable initially immediate
);
create index store_import_photo_assignments_row_idx on public.store_import_photo_assignments(session_id, row_number, sort_order);

-- Per-row outcome, for the review and for STORE-3b's publication check:
--   none (no photo), too_few (1), ready (2–10, nothing ambiguous), too_many (more than 10 point at it),
--   blocked (two photos claim the same position, or a name is listed for two rows).
alter table public.store_import_rows
  add column photo_state text check (photo_state is null or photo_state in ('none', 'too_few', 'ready', 'too_many', 'blocked')),
  add column photo_count smallint not null default 0 check (photo_count between 0 and 10);

alter table public.store_import_sessions
  add column photo_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(photo_counts) = 'object');

-- Reference checks look listing photos up by URL (also used by the image proxy).
create index if not exists listing_photos_image_url_idx on public.listing_photos(image_url);
create index if not exists listing_revision_photos_image_url_idx on public.listing_revision_photos(image_url);

-- ------------------------------------------------------------------ RLS and grants

alter table public.store_import_photo_assets enable row level security;
alter table public.store_import_photo_assignments enable row level security;
revoke all on public.store_import_photo_assets, public.store_import_photo_assignments from public, anon, authenticated;
grant select on public.store_import_photo_assets, public.store_import_photo_assignments to authenticated;

create policy "Store owners can read own import photos" on public.store_import_photo_assets
  for select to authenticated using (public.is_store_owner(store_id));
create policy "Admins can read import photos" on public.store_import_photo_assets
  for select to authenticated using (public.is_admin());
create policy "Store owners can read own import photo assignments" on public.store_import_photo_assignments
  for select to authenticated using (exists (
    select 1 from public.store_import_sessions s where s.id = session_id and public.is_store_owner(s.store_id)));
create policy "Admins can read import photo assignments" on public.store_import_photo_assignments
  for select to authenticated using (public.is_admin());

-- ------------------------------------------------------------------ storage policies

-- The owner uploads exactly the path the database issued, once, while that asset waits for its bytes and the import
-- still accepts photos. No update or delete policy: an uploaded photo cannot be replaced, and only the service role
-- removes objects (after the reference checks below).
create policy "Store owners upload their import photos" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'store-import-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.store_import_photo_assets asset
    join public.store_import_sessions session on session.id = asset.session_id
    where asset.object_path = objects.name
      and asset.created_by = auth.uid()
      and asset.status = 'awaiting_upload'
      and session.status in ('ready', 'committing', 'committed', 'partially_committed')
      and session.rows_purged_at is null
      and public.is_store_owner(asset.store_id)
  )
);

create policy "Store owners read their import photos" on storage.objects
for select to authenticated
using (
  bucket_id = 'store-import-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.store_import_photo_assets asset
    where asset.object_path = objects.name and asset.created_by = auth.uid() and public.is_store_owner(asset.store_id)
  )
);

-- ------------------------------------------------------------------ helpers

-- The durable URL a listing stores for an import photo. The second path segment names the photo bucket's own prefix
-- ("import-photos"), so it can never be read as the spreadsheet bucket ("store-imports").
create or replace function laria_private.import_photo_url(p_asset public.store_import_photo_assets)
returns text
language sql
immutable
as $$
  select '/api/listing-images/' || p_asset.created_by::text || '/import-photos/' || p_asset.session_id::text || '/'
    || p_asset.id::text || '.' || p_asset.file_ext;
$$;

-- Splits a merchant file name (§8.2): base name only, control characters removed, extension lowercased, then
-- SKU__NN on the LAST "__", NN 1–10. A SKU part that is not a valid SKU (D-9) gives no claim.
create or replace function laria_private.parse_import_photo_name(
  p_name text,
  out display_name text,
  out sku text,
  out sku_normalized text,
  out sequence integer
)
language plpgsql
immutable
as $$
declare
  base text;
  stem text;
  cut integer;
  sku_part text;
  seq_part text;
begin
  base := regexp_replace(coalesce(p_name, ''), '^.*[/\\]', '');
  base := btrim(regexp_replace(normalize(base, NFC), '[[:cntrl:]]', '', 'g'));
  if base = '' then base := 'foto'; end if;
  display_name := left(base, 120);
  stem := regexp_replace(base, '[.][A-Za-z0-9]{1,5}$', '');
  cut := length(stem) - strpos(reverse(stem), '__') - 1;   -- index just before the last "__"
  if strpos(stem, '__') = 0 or cut < 1 then return; end if;
  sku_part := left(stem, cut);
  seq_part := substr(stem, cut + 3);
  if seq_part !~ '^[0-9]{1,2}$' or seq_part::integer not between 1 and 10 then return; end if;
  if sku_part !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' then return; end if;
  sku := sku_part;
  sku_normalized := upper(sku_part);
  sequence := seq_part::integer;
end;
$$;

-- The caller's import, locked, writable, and still accepting photo changes. Photos can be added and arranged from the
-- review until the staged rows are purged (30 days after the import closes), so STORE-3b can publish after the
-- inventory commit. A cancelled, expired or failed import accepts none.
create or replace function laria_private.import_photo_session(p_session_id uuid)
returns public.store_import_sessions
language plpgsql
security definer
set search_path = public
as $$
declare session public.store_import_sessions;
begin
  session := laria_private.import_session_for_owner(p_session_id, true);
  if session.status not in ('ready', 'committing', 'committed', 'partially_committed') or session.rows_purged_at is not null then
    perform laria_private.raise_import_error('IMPORT_PHOTOS_CLOSED',
      case when session.status in ('awaiting_upload', 'parsing', 'mapping_required', 'validating')
        then 'Primero termina de revisar las filas; luego podrás subir las fotos.'
        else 'Esta importación ya no acepta cambios de fotos.' end);
  end if;
  return session;
end;
$$;

create or replace function laria_private.import_photo_url_referenced(p_url text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.listing_photos where image_url = p_url)
      or exists (select 1 from public.listing_revision_photos where image_url = p_url);
$$;

-- Is this URL a validated import photo that the given owner and store may attach? For a new listing created from an
-- import (STORE-3b), p_session_id limits it to that import; for an edit of an existing listing it is null.
create or replace function laria_private.import_photo_url_is_valid(p_url text, p_owner_user_id uuid, p_store_id uuid, p_session_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare parts text[]; asset public.store_import_photo_assets;
begin
  if p_owner_user_id is null or p_store_id is null then return false; end if;
  parts := regexp_match(coalesce(p_url, ''),
    '^/api/listing-images/([0-9a-f-]{36})/import-photos/([0-9a-f-]{36})/([0-9a-f-]{36})[.](jpg|png|webp)$');
  if parts is null or parts[1] <> p_owner_user_id::text then return false; end if;
  select * into asset from public.store_import_photo_assets a where a.id::text = parts[3];
  if not found or asset.session_id::text <> parts[2] or asset.file_ext <> parts[4]
    or asset.created_by <> p_owner_user_id or asset.store_id <> p_store_id or asset.status <> 'validated'
    or (p_session_id is not null and asset.session_id <> p_session_id) then
    return false;
  end if;
  return exists (
    select 1 from storage.objects object
    where object.bucket_id = 'store-import-photos' and object.name = asset.object_path
      and object.owner_id = p_owner_user_id::text);
end;
$$;

-- The ordered photo set of one staged row, in the shape complete_public_submission() takes. STORE-3b publishes a row
-- only when its photo_state is 'ready'.
create or replace function laria_private.import_row_photos_json(p_session_id uuid, p_row_number integer)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('image_url', laria_private.import_photo_url(asset), 'alt_text', null)
                            order by assignment.sort_order), '[]'::jsonb)
  from public.store_import_photo_assignments assignment
  join public.store_import_photo_assets asset on asset.id = assignment.asset_id
  where assignment.session_id = p_session_id and assignment.row_number = p_row_number and asset.status = 'validated';
$$;

-- ------------------------------------------------------------------ matching (§8.2)

-- Recomputes automatic placement for the whole import and refreshes per-row states and the session's photo counts.
-- Deterministic: the same files and rows always give the same result. Manual placements are kept as they are.
create or replace function laria_private.match_import_photos(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.store_import_photo_assignments a
  using public.store_import_photo_assets s
  where a.asset_id = s.id and s.session_id = p_session_id and s.placement = 'auto';

  update public.store_import_photo_assets
  set target_row_number = null, match_source = null, match_issue = null, match_note = null, duplicate_of = null
  where session_id = p_session_id and placement = 'auto';

  -- 1. Where does each validated automatic photo point? The spreadsheet column, then a manifest, then the name.
  with auto as (
    select a.* from public.store_import_photo_assets a
    where a.session_id = p_session_id and a.placement = 'auto' and a.status = 'validated'
  ), by_column as (
    select a.id, min(r.row_number) as row_number, count(distinct r.row_number) as rows, min(listed.position) as position
    from auto a
    join public.store_import_rows r on r.session_id = p_session_id
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(r.parsed->'photos') = 'array' then r.parsed->'photos' else '[]'::jsonb end
    ) with ordinality as listed(name, position)
    where lower(listed.name) = lower(a.original_name)
    group by a.id
  ), by_sku as (
    select a.id, min(r.row_number) as row_number, count(distinct r.row_number) as rows
    from auto a
    join public.store_import_rows r on r.session_id = p_session_id
    left join public.store_inventory_items item on item.id = r.applied_item_id
    where a.claimed_sku_normalized is not null
      and (r.sku_normalized = a.claimed_sku_normalized or item.sku_normalized = a.claimed_sku_normalized)
    group by a.id
  ), decided as (
    select auto.id,
      case
        when c.rows = 1 then c.row_number
        when c.rows > 1 then null
        when s.rows = 1 then s.row_number
      end as row_number,
      case
        when c.rows = 1 then 'column'
        when c.rows is null and s.rows = 1 then case when auto.claim_source = 'manifest' then 'manifest' else 'filename' end
      end as source,
      case
        when c.rows > 1 then 'listed_twice'
        when c.rows = 1 then null
        when s.rows > 1 then 'ambiguous_sku'
        when s.rows = 1 then null
        when auto.claimed_sku_normalized is not null then 'unmatched_sku'
        else 'no_sku_in_name'
      end as issue,
      case when c.rows = 1 and s.rows is not null and s.row_number is distinct from c.row_number then 'explicit_over_filename' end as note
    from auto
    left join by_column c on c.id = auto.id
    left join by_sku s on s.id = auto.id
  )
  update public.store_import_photo_assets a
  set target_row_number = d.row_number, match_source = d.source, match_issue = d.issue, match_note = d.note
  from decided d where a.id = d.id;

  -- 2. The same picture twice (same bytes): the first upload keeps its place, later copies are set aside.
  with firsts as (
    select a.id, first_value(a.id) over (partition by a.sha256 order by a.request_order) as first_id
    from public.store_import_photo_assets a
    where a.session_id = p_session_id and a.status = 'validated'
  )
  update public.store_import_photo_assets a
  set match_issue = 'duplicate_image', duplicate_of = f.first_id
  from firsts f
  where a.id = f.id and f.first_id <> a.id and a.placement = 'auto';

  -- 3. Two photos claiming the same position of one row: neither is placed and the row is blocked (no guessing).
  with positions as (
    select a.id, count(*) over (partition by a.target_row_number, coalesce(a.claimed_sequence, -1)) as same
    from public.store_import_photo_assets a
    where a.session_id = p_session_id and a.placement = 'auto' and a.status = 'validated'
      and a.match_issue is null and a.target_row_number is not null
      and a.match_source in ('manifest', 'filename') and a.claimed_sequence is not null
  )
  update public.store_import_photo_assets a set match_issue = 'duplicate_sequence'
  from positions p where a.id = p.id and p.same > 1;

  -- 4. Place what is left, after any photos the merchant placed by hand, in claimed order. Beyond 10: set aside.
  with column_position as (
    select a.id, min(listed.position) as position
    from public.store_import_photo_assets a
    join public.store_import_rows r on r.session_id = a.session_id and r.row_number = a.target_row_number
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(r.parsed->'photos') = 'array' then r.parsed->'photos' else '[]'::jsonb end
    ) with ordinality as listed(name, position)
    where a.session_id = p_session_id and a.match_source = 'column' and lower(listed.name) = lower(a.original_name)
    group by a.id
  ), manual_taken as (
    select row_number, max(sort_order) as taken
    from public.store_import_photo_assignments where session_id = p_session_id group by row_number
  ), ranked as (
    select a.id, a.target_row_number,
      coalesce(m.taken, 0) + row_number() over (
        partition by a.target_row_number
        order by case when a.match_source = 'column' then cp.position else a.claimed_sequence end nulls last,
                 lower(a.original_name), a.request_order) as sort_order
    from public.store_import_photo_assets a
    left join column_position cp on cp.id = a.id
    left join manual_taken m on m.row_number = a.target_row_number
    where a.session_id = p_session_id and a.placement = 'auto' and a.status = 'validated'
      and a.match_issue is null and a.target_row_number is not null
  ), over_limit as (
    update public.store_import_photo_assets a set match_issue = 'over_limit'
    from ranked where a.id = ranked.id and ranked.sort_order > 10
    returning a.id
  )
  insert into public.store_import_photo_assignments(asset_id, session_id, row_number, sort_order)
  select ranked.id, p_session_id, ranked.target_row_number, ranked.sort_order
  from ranked where ranked.sort_order <= 10;

  perform laria_private.refresh_import_photo_states(p_session_id);
end;
$$;

create or replace function laria_private.refresh_import_photo_states(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with assigned as (
    select row_number, count(*)::smallint as photos
    from public.store_import_photo_assignments where session_id = p_session_id group by row_number
  ), problems as (
    select target_row_number as row_number,
      bool_or(match_issue = 'over_limit') as too_many,
      bool_or(match_issue in ('duplicate_sequence')) as blocked
    from public.store_import_photo_assets
    where session_id = p_session_id and status = 'validated' and target_row_number is not null
    group by target_row_number
  ), listed_twice as (
    -- A name listed in the Foto(s) column of two rows blocks both rows.
    select distinct r.row_number
    from public.store_import_photo_assets a
    join public.store_import_rows r on r.session_id = a.session_id
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(r.parsed->'photos') = 'array' then r.parsed->'photos' else '[]'::jsonb end) listed(name)
    where a.session_id = p_session_id and a.match_issue = 'listed_twice' and lower(listed.name) = lower(a.original_name)
  ), states as (
    select r.row_number,
      coalesce(assigned.photos, 0) as photos,
      case
        when coalesce(problems.too_many, false) then 'too_many'
        when coalesce(problems.blocked, false) or lt.row_number is not null then 'blocked'
        when coalesce(assigned.photos, 0) = 0 then 'none'
        when assigned.photos = 1 then 'too_few'
        else 'ready'
      end as state
    from public.store_import_rows r
    left join assigned on assigned.row_number = r.row_number
    left join problems on problems.row_number = r.row_number
    left join listed_twice lt on lt.row_number = r.row_number
    where r.session_id = p_session_id
  )
  update public.store_import_rows r
  set photo_state = states.state, photo_count = states.photos
  from states
  where r.session_id = p_session_id and r.row_number = states.row_number
    and (r.photo_state is distinct from states.state or r.photo_count <> states.photos);

  update public.store_import_sessions s
  set photo_counts = (
    select jsonb_build_object(
      'total', count(*) filter (where a.status <> 'discarded'),
      'awaiting_upload', count(*) filter (where a.status = 'awaiting_upload'),
      'validated', count(*) filter (where a.status = 'validated'),
      'rejected', count(*) filter (where a.status = 'rejected'),
      'assigned', (select count(*) from public.store_import_photo_assignments x where x.session_id = p_session_id),
      'set_aside', count(*) filter (where a.status = 'validated' and a.match_issue is not null),
      'rows_with_photos', (select count(*) from public.store_import_rows r where r.session_id = p_session_id and r.photo_count > 0),
      'rows_ready', (select count(*) from public.store_import_rows r where r.session_id = p_session_id and r.photo_state = 'ready'),
      'rows_too_few', (select count(*) from public.store_import_rows r where r.session_id = p_session_id and r.photo_state = 'too_few'),
      'rows_too_many', (select count(*) from public.store_import_rows r where r.session_id = p_session_id and r.photo_state = 'too_many'),
      'rows_blocked', (select count(*) from public.store_import_rows r where r.session_id = p_session_id and r.photo_state = 'blocked'))
    from public.store_import_photo_assets a where a.session_id = p_session_id)
  where s.id = p_session_id;
end;
$$;

create or replace function laria_private.import_photos_json(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'session_id', s.id,
    'version', s.version,
    'photo_counts', s.photo_counts)
  from public.store_import_sessions s where s.id = p_session_id;
$$;

-- ------------------------------------------------------------------ owner RPCs

-- Issues up to 25 upload targets. p_files: [{name, type, bytes, manifest_sku?, manifest_order?}]. The type decides the
-- extension (never the name); the name only gives a display label and a matching hint. 600 per import (D-3).
create or replace function public.request_store_import_photo_uploads(p_session_id uuid, p_files jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session public.store_import_sessions;
  existing integer;
  entry jsonb;
  parsed record;
  ext text;
  declared integer;
  manifest_sku text;
  manifest_order integer;
  asset public.store_import_photo_assets;
  asset_id uuid;
  uploads jsonb := '[]'::jsonb;
begin
  session := laria_private.import_photo_session(p_session_id);
  if p_files is null or jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) not between 1 and 25 then
    perform laria_private.raise_import_error('IMPORT_PHOTO_REQUEST_INVALID', 'Envía entre 1 y 25 fotos por vez.');
  end if;
  select count(*) into existing from public.store_import_photo_assets where session_id = session.id;
  if existing + jsonb_array_length(p_files) > 600 then
    perform laria_private.raise_import_error('IMPORT_PHOTO_LIMIT', 'Una importación admite hasta 600 fotos.',
      jsonb_build_object('remaining', greatest(600 - existing, 0)));
  end if;

  for entry in select value from jsonb_array_elements(p_files) loop
    if jsonb_typeof(entry) <> 'object' then
      perform laria_private.raise_import_error('IMPORT_PHOTO_REQUEST_INVALID', 'Solicitud de fotos inválida.');
    end if;
    ext := case entry->>'type' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
    if ext is null then
      perform laria_private.raise_import_error('IMPORT_PHOTO_TYPE', 'Solo se aceptan fotos JPG, PNG o WebP.');
    end if;
    declared := case when entry->>'bytes' ~ '^[0-9]{1,9}$' then (entry->>'bytes')::integer end;
    if declared is null or declared not between 1 and 5242880 then
      perform laria_private.raise_import_error('IMPORT_PHOTO_TOO_LARGE', 'Cada foto puede pesar hasta 5 MB.');
    end if;
    parsed := laria_private.parse_import_photo_name(left(entry->>'name', 400));
    manifest_sku := btrim(left(entry->>'manifest_sku', 80));
    manifest_order := case when entry->>'manifest_order' ~ '^[0-9]{1,2}$' then (entry->>'manifest_order')::integer end;
    if manifest_sku !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' then manifest_sku := null; end if;
    if manifest_order is not null and manifest_order not between 1 and 10 then manifest_order := null; end if;

    asset_id := gen_random_uuid();
    insert into public.store_import_photo_assets(
      id, session_id, store_id, created_by, original_name, file_ext, object_path, declared_bytes,
      claim_source, claimed_sku, claimed_sku_normalized, claimed_sequence)
    values (
      asset_id, session.id, session.store_id, auth.uid(), parsed.display_name, ext,
      auth.uid()::text || '/' || session.id::text || '/' || asset_id::text || '.' || ext, declared,
      case when manifest_sku is not null then 'manifest' when parsed.sku is not null then 'filename' else 'none' end,
      coalesce(manifest_sku, parsed.sku), upper(coalesce(manifest_sku, parsed.sku)),
      case when manifest_sku is not null then manifest_order else parsed.sequence end)
    returning * into asset;
    uploads := uploads || jsonb_build_object('asset_id', asset.id, 'bucket', 'store-import-photos',
      'path', asset.object_path, 'name', asset.original_name);
  end loop;

  perform laria_private.refresh_import_photo_states(session.id);
  return jsonb_build_object('uploads', uploads) || laria_private.import_photos_json(session.id);
end;
$$;

-- Service role only: the server read each uploaded object and reports what it found. p_results:
-- [{asset_id, ok, code?, mime_type?, bytes?, width?, height?, sha256?}]. Missing objects are simply not reported and
-- stay awaiting_upload. The database re-checks ownership, the asset's state and the storage row's owner and size.
create or replace function public.record_store_import_photo_checks(p_owner_user_id uuid, p_session_id uuid, p_results jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  session public.store_import_sessions;
  entry jsonb;
  asset public.store_import_photo_assets;
  object_size numeric;
  object_mime text;
  expected_mime text;
  code text;
  rejected jsonb := '[]'::jsonb;
  validated integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  select * into session from public.store_import_sessions where id = p_session_id for update;
  if not found or session.created_by is distinct from p_owner_user_id then
    perform laria_private.raise_import_error('IMPORT_SESSION_NOT_FOUND', 'No encontramos esta importación.');
  end if;
  perform laria_private.require_inventory_write(session.store_id, p_owner_user_id);
  if session.status not in ('ready', 'committing', 'committed', 'partially_committed') or session.rows_purged_at is not null then
    perform laria_private.raise_import_error('IMPORT_PHOTOS_CLOSED', 'Esta importación ya no acepta cambios de fotos.');
  end if;
  if p_results is null or jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) > 25 then
    perform laria_private.raise_import_error('IMPORT_PHOTO_REQUEST_INVALID', 'Solicitud de fotos inválida.');
  end if;

  for entry in select value from jsonb_array_elements(p_results) loop
    select * into asset from public.store_import_photo_assets a
    where a.id::text = entry->>'asset_id' and a.session_id = session.id and a.created_by = p_owner_user_id
    for update;
    if not found or asset.status <> 'awaiting_upload' then continue; end if;

    select (o.metadata->>'size')::numeric, lower(o.metadata->>'mimetype') into object_size, object_mime
    from storage.objects o
    where o.bucket_id = 'store-import-photos' and o.name = asset.object_path and o.owner_id = p_owner_user_id::text
      and coalesce(o.metadata->>'size', '') ~ '^[0-9]+$';
    if not found then continue; end if;

    code := null;
    expected_mime := (array['image/jpeg', 'image/png', 'image/webp'])[array_position(array['jpg', 'png', 'webp'], asset.file_ext)];
    if (entry->>'ok') is distinct from 'true' then
      code := case when entry->>'code' ~ '^PHOTO_[A-Z_]{2,40}$' then entry->>'code' else 'PHOTO_INVALID' end;
    elsif entry->>'mime_type' is distinct from expected_mime or object_mime is distinct from expected_mime then
      code := 'PHOTO_TYPE_MISMATCH';
    elsif coalesce(entry->>'bytes', '') !~ '^[0-9]{1,9}$' or (entry->>'bytes')::numeric <> object_size
       or object_size not between 1 and 5242880 then
      code := 'PHOTO_TOO_LARGE';
    elsif coalesce(entry->>'width', '') !~ '^[0-9]{1,6}$' or coalesce(entry->>'height', '') !~ '^[0-9]{1,6}$'
       or (entry->>'width')::integer not between 400 and 8000 or (entry->>'height')::integer not between 400 and 8000 then
      code := 'PHOTO_DIMENSIONS';
    elsif coalesce(entry->>'sha256', '') !~ '^[0-9a-f]{64}$' then
      code := 'PHOTO_INVALID';
    end if;

    if code is null then
      update public.store_import_photo_assets
      set status = 'validated', validated_at = now(), mime_type = entry->>'mime_type', bytes = object_size::integer,
          width = (entry->>'width')::integer, height = (entry->>'height')::integer, sha256 = entry->>'sha256'
      where id = asset.id;
      validated := validated + 1;
    else
      update public.store_import_photo_assets set status = 'rejected', reject_code = code where id = asset.id;
      rejected := rejected || jsonb_build_object('asset_id', asset.id, 'path', asset.object_path, 'code', code);
    end if;
  end loop;

  perform laria_private.match_import_photos(session.id);
  return jsonb_build_object('validated', validated, 'rejected', rejected) || laria_private.import_photos_json(session.id);
end;
$$;

-- Manual correction (§8.2): move a photo to another row of the same import (appended at the end), or take it out
-- (p_row_number null). Both rows become manual so automatic matching no longer rearranges them.
create or replace function public.place_store_import_photo(p_session_id uuid, p_asset_id uuid, p_row_number integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session public.store_import_sessions;
  asset public.store_import_photo_assets;
  current_row integer;
  next_order integer;
begin
  session := laria_private.import_photo_session(p_session_id);
  select * into asset from public.store_import_photo_assets a where a.id = p_asset_id and a.session_id = session.id for update;
  if not found or asset.status <> 'validated' then
    perform laria_private.raise_import_error('IMPORT_PHOTO_NOT_FOUND', 'No encontramos esta foto en la importación.');
  end if;
  if p_row_number is not null and not exists (
      select 1 from public.store_import_rows where session_id = session.id and row_number = p_row_number) then
    perform laria_private.raise_import_error('IMPORT_PHOTO_ROW_NOT_FOUND', 'Esa fila no está en esta importación.');
  end if;

  select row_number into current_row from public.store_import_photo_assignments where asset_id = asset.id;
  if p_row_number is not null and current_row is not distinct from p_row_number then
    return laria_private.import_photos_json(session.id);
  end if;

  -- Freeze the rows involved as they are now, then make the change.
  update public.store_import_photo_assets a set placement = 'manual'
  where a.session_id = session.id and a.id in (
    select x.asset_id from public.store_import_photo_assignments x
    where x.session_id = session.id and x.row_number in (current_row, p_row_number));
  delete from public.store_import_photo_assignments where asset_id = asset.id;
  if current_row is not null then
    perform laria_private.compact_import_photo_row(session.id, current_row);
  end if;

  if p_row_number is null then
    update public.store_import_photo_assets
    set placement = 'manual', match_source = null, match_issue = 'removed', match_note = null, target_row_number = null
    where id = asset.id;
  else
    select coalesce(max(sort_order), 0) + 1 into next_order
    from public.store_import_photo_assignments where session_id = session.id and row_number = p_row_number;
    if next_order > 10 then
      perform laria_private.raise_import_error('IMPORT_PHOTO_ROW_FULL', 'Ese SKU ya tiene 10 fotos. Quita una primero.');
    end if;
    insert into public.store_import_photo_assignments(asset_id, session_id, row_number, sort_order)
    values (asset.id, session.id, p_row_number, next_order);
    update public.store_import_photo_assets
    set placement = 'manual', match_source = 'manual', match_issue = null, match_note = null, target_row_number = p_row_number
    where id = asset.id;
  end if;

  perform laria_private.match_import_photos(session.id);
  return laria_private.import_photos_json(session.id);
end;
$$;

create or replace function laria_private.compact_import_photo_row(p_session_id uuid, p_row_number integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  set constraints public.store_import_photo_assignments_order_key deferred;
  with ordered as (
    select asset_id, row_number() over (order by sort_order, asset_id) as position
    from public.store_import_photo_assignments where session_id = p_session_id and row_number = p_row_number
  )
  update public.store_import_photo_assignments a set sort_order = ordered.position
  from ordered where a.asset_id = ordered.asset_id and a.sort_order <> ordered.position;
  set constraints public.store_import_photo_assignments_order_key immediate;
end;
$$;

-- Sets the order of one row's photos. p_asset_ids must be exactly the photos the row has now.
create or replace function public.order_store_import_photos(p_session_id uuid, p_row_number integer, p_asset_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare session public.store_import_sessions; current_ids uuid[];
begin
  session := laria_private.import_photo_session(p_session_id);
  select coalesce(array_agg(asset_id order by asset_id), '{}') into current_ids
  from public.store_import_photo_assignments where session_id = session.id and row_number = p_row_number;
  if p_asset_ids is null or cardinality(p_asset_ids) <> cardinality(current_ids)
     or (select array_agg(x order by x) from unnest(p_asset_ids) x) is distinct from current_ids
     or cardinality(current_ids) = 0 then
    perform laria_private.raise_import_error('IMPORT_PHOTO_ORDER_STALE', 'Las fotos de este SKU cambiaron. Vuelve a cargar la página.');
  end if;
  update public.store_import_photo_assets set placement = 'manual' where id = any(current_ids);
  set constraints public.store_import_photo_assignments_order_key deferred;
  update public.store_import_photo_assignments a set sort_order = ordered.position
  from unnest(p_asset_ids) with ordinality as ordered(asset_id, position)
  where a.asset_id = ordered.asset_id and a.sort_order <> ordered.position;
  set constraints public.store_import_photo_assignments_order_key immediate;
  perform laria_private.refresh_import_photo_states(session.id);
  return laria_private.import_photos_json(session.id);
end;
$$;

-- Drops every manual placement and matches again from the names, the column and the manifest.
create or replace function public.reset_store_import_photo_matching(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare session public.store_import_sessions;
begin
  session := laria_private.import_photo_session(p_session_id);
  update public.store_import_photo_assets set placement = 'auto' where session_id = session.id and placement = 'manual';
  perform laria_private.match_import_photos(session.id);
  return laria_private.import_photos_json(session.id);
end;
$$;

-- ------------------------------------------------------------------ attachment guard and cleanup (§8.5)

-- Any listing photo or proposed photo that uses an import photo URL must point at a validated asset of the same
-- store. FOR SHARE on the asset row serializes with discard_import_photo_assets(), which takes FOR UPDATE and then
-- re-checks references: either the attachment commits first and the discard sees it, or the discard commits first
-- and this check sees status 'discarded'.
create or replace function laria_private.guard_import_photo_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parts text[];
  asset public.store_import_photo_assets;
  listing_store uuid;
  listing_owner uuid;
begin
  parts := regexp_match(new.image_url, '^/api/listing-images/[^/]+/import-photos/');
  if parts is null then return new; end if;
  parts := regexp_match(new.image_url,
    '^/api/listing-images/([0-9a-f-]{36})/import-photos/([0-9a-f-]{36})/([0-9a-f-]{36})[.](jpg|png|webp)$');
  if parts is null then raise exception 'LISTING_PHOTO_INVALID'; end if;
  if tg_table_name = 'listing_photos' then
    select l.store_id, l.owner_user_id into listing_store, listing_owner from public.listings l where l.id = new.listing_id;
  else
    select l.store_id, l.owner_user_id into listing_store, listing_owner
    from public.listing_revisions r join public.listings l on l.id = r.listing_id where r.id = new.revision_id;
  end if;
  select * into asset from public.store_import_photo_assets a where a.id::text = parts[3] for share;
  if not found or asset.status <> 'validated' or asset.session_id::text <> parts[2] or asset.created_by::text <> parts[1]
     or asset.file_ext <> parts[4] or listing_store is null or asset.store_id <> listing_store
     or asset.created_by <> listing_owner then
    raise exception 'LISTING_PHOTO_INVALID';
  end if;
  return new;
end;
$$;

create trigger listing_photos_guard_import_photo
before insert or update of image_url on public.listing_photos
for each row execute function laria_private.guard_import_photo_reference();
create trigger listing_revision_photos_guard_import_photo
before insert or update of image_url on public.listing_revision_photos
for each row execute function laria_private.guard_import_photo_reference();

-- Marks every unreferenced photo of an import for deletion. Referenced photos (published or proposed) stay forever:
-- they are listing photos now. Two statements on purpose: the first waits for any attachment holding a row lock, the
-- second sees what that attachment committed.
create or replace function laria_private.discard_import_photo_assets(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare discarded integer;
begin
  perform 1 from public.store_import_photo_assets
  where session_id = p_session_id and status in ('awaiting_upload', 'validated')
  order by id for update;

  with gone as (
    update public.store_import_photo_assets a
    set status = 'discarded', discarded_at = now()
    where a.session_id = p_session_id and a.status in ('awaiting_upload', 'validated')
      and not laria_private.import_photo_url_referenced(laria_private.import_photo_url(a))
    returning a.id
  )
  select count(*) into discarded from gone;
  delete from public.store_import_photo_assignments x
  using public.store_import_photo_assets a
  where x.asset_id = a.id and a.session_id = p_session_id and a.status = 'discarded';
  return discarded;
end;
$$;

-- Session lifecycle hooks: a cancelled or expired import keeps no photos; when retention purges an import's staged
-- rows (30 days after it closed) its unpublished photos go too. Rejected photos are deleted as soon as they fail.
create or replace function laria_private.store_import_session_photo_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.status in ('cancelled', 'expired', 'failed') and new.status is distinct from old.status)
     or (new.rows_purged_at is not null and old.rows_purged_at is null) then
    perform laria_private.discard_import_photo_assets(new.id);
    if new.rows_purged_at is null then
      perform laria_private.refresh_import_photo_states(new.id);
    end if;
  end if;
  return null;
end;
$$;

create trigger store_import_sessions_photo_lifecycle
after update of status, rows_purged_at on public.store_import_sessions
for each row execute function laria_private.store_import_session_photo_lifecycle();

-- Service role only (the cleanup route and the photo completion route): claims up to 100 objects to delete. Only
-- rejected or discarded photos are ever claimed; neither can be attached to a listing.
create or replace function public.claim_store_import_photo_deletions(p_limit integer default 100, p_session_id uuid default null)
returns table(bucket text, path text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  return query
  with claimed as (
    select a.id from public.store_import_photo_assets a
    where a.status in ('rejected', 'discarded') and a.deleted_at is null
      and (p_session_id is null or a.session_id = p_session_id)
      and (a.delete_claimed_at is null or a.delete_claimed_at < now() - interval '1 hour' or p_session_id is not null)
    order by a.request_order
    limit least(greatest(coalesce(p_limit, 100), 1), 100)
    for update skip locked
  )
  update public.store_import_photo_assets a set delete_claimed_at = now()
  from claimed where a.id = claimed.id
  returning 'store-import-photos'::text, a.object_path;
end;
$$;

create or replace function public.complete_store_import_photo_deletions(p_paths text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare done integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  update public.store_import_photo_assets
  set deleted_at = now()
  where object_path = any(coalesce(p_paths, '{}')) and status in ('rejected', 'discarded') and deleted_at is null;
  get diagnostics done = row_count;
  return done;
end;
$$;

-- ------------------------------------------------------------------ listing photo validator (§8.4)

-- Sprint 4's function with one added branch: an import photo URL is accepted for the listing's own owner when the
-- asset is validated and belongs to the same store (laria_private.import_photo_url_is_valid). Everything else is
-- unchanged.
create or replace function public.listing_photo_set_is_valid(p_listing_id uuid, p_photos jsonb)
returns boolean language plpgsql stable security definer set search_path = public, storage as $$
declare
  listing_owner_id uuid;
  listing_store_id uuid;
  photo jsonb;
  url text;
  object_path text;
  object_bucket text;
begin
  select owner_user_id, store_id into listing_owner_id, listing_store_id from public.listings where id = p_listing_id;
  if listing_owner_id is distinct from auth.uid() and not public.is_admin() then return false; end if;
  if p_photos is null or jsonb_typeof(p_photos) <> 'array' then return false; end if;
  if jsonb_array_length(p_photos) not between 2 and 10 then return false; end if;
  if (select count(distinct item->>'image_url') <> count(*) from jsonb_array_elements(p_photos) item) then return false; end if;
  for photo in select value from jsonb_array_elements(p_photos) loop
    url := photo->>'image_url';
    if jsonb_typeof(photo) <> 'object' or nullif(trim(url), '') is null then return false; end if;
    if exists (select 1 from public.listing_photos where listing_id = p_listing_id and image_url = url)
      or exists (select 1 from public.listing_revision_photos proposed
        join public.listing_revisions revision on revision.id = proposed.revision_id
        where revision.listing_id = p_listing_id and revision.status = 'pending'
          and revision.owner_user_id = listing_owner_id and proposed.image_url = url) then
      continue;
    end if;
    -- Only the owner can introduce uploads; admin promotion uses pending refs above.
    if listing_owner_id is distinct from auth.uid() then return false; end if;
    if url ~ '^/api/listing-images/[^/]+/import-photos/' then
      if not laria_private.import_photo_url_is_valid(url, listing_owner_id, listing_store_id, null) then return false; end if;
      continue;
    end if;
    if left(url, length('/api/listing-images/')) = '/api/listing-images/' then
      object_bucket := 'listing-edit-photos';
      object_path := substr(url, length('/api/listing-images/') + 1);
    else return false;
    end if;
    if object_path !~ ('^' || listing_owner_id::text || '/listing-edits/' || p_listing_id::text
      || '/[0-9a-f-]{36}/[0-9]{1,2}[.](jpg|png|webp)$') then return false; end if;
    if exists (select 1 from public.listing_photo_cleanup_claims where bucket = object_bucket and path = object_path) then return false; end if;
    if not exists (select 1 from storage.objects object
      where object.bucket_id = object_bucket and object.name = object_path
        and object.owner_id = listing_owner_id::text
        and lower(object.metadata->>'mimetype') in ('image/jpeg', 'image/png', 'image/webp')
        and case when object.metadata->>'size' ~ '^[0-9]+$'
          then (object.metadata->>'size')::numeric between 1 and 5242880 else false end) then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.listing_photo_set_is_valid(uuid, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------------ grants

revoke all on function laria_private.import_photo_url(public.store_import_photo_assets) from public, anon, authenticated;
revoke all on function laria_private.parse_import_photo_name(text) from public, anon, authenticated;
revoke all on function laria_private.import_photo_session(uuid) from public, anon, authenticated;
revoke all on function laria_private.import_photo_url_referenced(text) from public, anon, authenticated;
revoke all on function laria_private.import_photo_url_is_valid(text, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function laria_private.import_row_photos_json(uuid, integer) from public, anon, authenticated;
revoke all on function laria_private.match_import_photos(uuid) from public, anon, authenticated;
revoke all on function laria_private.refresh_import_photo_states(uuid) from public, anon, authenticated;
revoke all on function laria_private.import_photos_json(uuid) from public, anon, authenticated;
revoke all on function laria_private.compact_import_photo_row(uuid, integer) from public, anon, authenticated;
revoke all on function laria_private.guard_import_photo_reference() from public, anon, authenticated;
revoke all on function laria_private.discard_import_photo_assets(uuid) from public, anon, authenticated;
revoke all on function laria_private.store_import_session_photo_lifecycle() from public, anon, authenticated;

revoke all on function public.request_store_import_photo_uploads(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.record_store_import_photo_checks(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.place_store_import_photo(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.order_store_import_photos(uuid, integer, uuid[]) from public, anon, authenticated;
revoke all on function public.reset_store_import_photo_matching(uuid) from public, anon, authenticated;
revoke all on function public.claim_store_import_photo_deletions(integer, uuid) from public, anon, authenticated;
revoke all on function public.complete_store_import_photo_deletions(text[]) from public, anon, authenticated;

grant execute on function public.request_store_import_photo_uploads(uuid, jsonb) to authenticated;
grant execute on function public.place_store_import_photo(uuid, uuid, integer) to authenticated;
grant execute on function public.order_store_import_photos(uuid, integer, uuid[]) to authenticated;
grant execute on function public.reset_store_import_photo_matching(uuid) to authenticated;
grant execute on function public.record_store_import_photo_checks(uuid, uuid, jsonb) to service_role;
grant execute on function public.claim_store_import_photo_deletions(integer, uuid) to service_role;
grant execute on function public.complete_store_import_photo_deletions(text[]) to service_role;
