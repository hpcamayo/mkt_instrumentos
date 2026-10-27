-- Launch audit A19 (26 Oct 2026 audit): a record of every change to what the cached public pages show.
--
-- The home and listing pages are cached and rebuilt at most once a minute (app/page.tsx,
-- app/instrumentos/[slug]/page.tsx). Besides its own page, a listing shows as a card on the home and in the
-- "Similares" and "Más del vendedor" rows of other listings, and a rebuild that fails keeps the old copy. So every
-- statement that changes something these pages show leaves a row in laria_private.public_page_changes, in its own
-- transaction, whichever path made it (the owner, Admin, Inventario, an import, a database function):
-- - listings: a listing added, changed or removed that is public before or after the statement (the rule of
--   public.listing_is_public), unless only view_count, availability_checkin_at or updated_at changed, which no page
--   shows;
-- - stores: an active store added, changed (other than updated_at) or removed, and a store that becomes or stops
--   being active;
-- - listing_photos: a photo of a public listing added, changed (other than updated_at) or removed.
-- The triggers run once per statement and write at most one row, so an import that publishes 2,000 listings writes
-- one. Rows are only ever inserted by writers, so no writer waits on another.
--
-- The job app/api/internal/public-pages/refresh runs every minute (vercel.json) with the service role. It claims every
-- waiting row (claim_public_page_changes), drops every cached listing page and the home, then reports back
-- (complete_public_page_changes). A row goes after a second drop at least 30 seconds after its first: a page whose
-- rebuild read the database just before the change and was saved just after the first drop (a rebuild stops after 30
-- seconds, maxDuration), or a drop the cache missed, is covered by the second. A run that fails before reporting back
-- leaves its rows for the next one.
--
-- Compatibility: nothing before this change reads the table, so the migration can be applied before the deploy; rows
-- wait until the job runs.
-- Locks: creating the triggers takes brief SHARE ROW EXCLUSIVE locks on listings, stores and listing_photos, and
-- nothing scans a table. Every lock wait is capped at 10 seconds (lock_timeout): behind a long-running query the
-- migration fails and can be run again, instead of holding up the traffic queued behind it.
-- Rollback: drop the nine triggers, the five functions and the table.

set lock_timeout = '10s';

create table laria_private.public_page_changes (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default clock_timestamp(),
  -- The run that holds the row (claim_public_page_changes); a later run takes it over.
  claim_id uuid,
  -- When a run first reported that it dropped the pages for this row.
  first_dropped_at timestamptz
);

revoke all on laria_private.public_page_changes from public, anon, authenticated;

-- public.listing_is_public's rule for a row's own values: the triggers judge each row as it was before and after.
create or replace function laria_private.listing_row_is_public(
  p_status public.listing_status,
  p_seller_type public.seller_type,
  p_store_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_status = 'approved'
    and (
      (p_seller_type = 'individual' and p_store_id is null)
      or (
        p_seller_type = 'store' and p_store_id is not null
        and exists (select 1 from public.stores s where s.id = p_store_id and s.status = 'active')
      )
    );
$$;

create or replace function laria_private.mark_listing_page_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed boolean;
begin
  if tg_op = 'UPDATE' then
    select exists (
      select 1
      from old_rows o
      join new_rows n on n.id = o.id
      where (o.status = 'approved' or n.status = 'approved')
        and (to_jsonb(o) - array['view_count', 'availability_checkin_at', 'updated_at'])
          is distinct from (to_jsonb(n) - array['view_count', 'availability_checkin_at', 'updated_at'])
        and (
          laria_private.listing_row_is_public(o.status, o.seller_type, o.store_id)
          or laria_private.listing_row_is_public(n.status, n.seller_type, n.store_id)
        )
    ) into changed;
  elsif tg_op = 'INSERT' then
    select exists (
      select 1 from new_rows n where laria_private.listing_row_is_public(n.status, n.seller_type, n.store_id)
    ) into changed;
  else
    select exists (
      select 1 from old_rows o where laria_private.listing_row_is_public(o.status, o.seller_type, o.store_id)
    ) into changed;
  end if;
  if changed then
    insert into laria_private.public_page_changes default values;
  end if;
  return null;
end;
$$;

create or replace function laria_private.mark_store_page_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed boolean;
begin
  if tg_op = 'UPDATE' then
    select exists (
      select 1
      from old_rows o
      join new_rows n on n.id = o.id
      where (o.status = 'active' or n.status = 'active')
        and (to_jsonb(o) - 'updated_at') is distinct from (to_jsonb(n) - 'updated_at')
    ) into changed;
  elsif tg_op = 'INSERT' then
    select exists (select 1 from new_rows n where n.status = 'active') into changed;
  else
    select exists (select 1 from old_rows o where o.status = 'active') into changed;
  end if;
  if changed then
    insert into laria_private.public_page_changes default values;
  end if;
  return null;
end;
$$;

create or replace function laria_private.mark_listing_photo_page_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed boolean;
begin
  if tg_op = 'UPDATE' then
    select exists (
      select 1
      from old_rows o
      join new_rows n on n.id = o.id
      where (to_jsonb(o) - 'updated_at') is distinct from (to_jsonb(n) - 'updated_at')
        and (public.listing_is_public(o.listing_id) or public.listing_is_public(n.listing_id))
    ) into changed;
  elsif tg_op = 'INSERT' then
    select exists (select 1 from new_rows n where public.listing_is_public(n.listing_id)) into changed;
  else
    select exists (select 1 from old_rows o where public.listing_is_public(o.listing_id)) into changed;
  end if;
  if changed then
    insert into laria_private.public_page_changes default values;
  end if;
  return null;
end;
$$;

revoke all on function laria_private.listing_row_is_public(public.listing_status, public.seller_type, uuid)
from public, anon, authenticated;
revoke all on function laria_private.mark_listing_page_changes(), laria_private.mark_store_page_changes(),
  laria_private.mark_listing_photo_page_changes()
from public, anon, authenticated;

-- Transition tables allow one event per trigger, so each table has three.
drop trigger if exists listings_public_page_changes_insert on public.listings;
create trigger listings_public_page_changes_insert
after insert on public.listings
referencing new table as new_rows
for each statement execute function laria_private.mark_listing_page_changes();

drop trigger if exists listings_public_page_changes_update on public.listings;
create trigger listings_public_page_changes_update
after update on public.listings
referencing old table as old_rows new table as new_rows
for each statement execute function laria_private.mark_listing_page_changes();

drop trigger if exists listings_public_page_changes_delete on public.listings;
create trigger listings_public_page_changes_delete
after delete on public.listings
referencing old table as old_rows
for each statement execute function laria_private.mark_listing_page_changes();

drop trigger if exists stores_public_page_changes_insert on public.stores;
create trigger stores_public_page_changes_insert
after insert on public.stores
referencing new table as new_rows
for each statement execute function laria_private.mark_store_page_changes();

drop trigger if exists stores_public_page_changes_update on public.stores;
create trigger stores_public_page_changes_update
after update on public.stores
referencing old table as old_rows new table as new_rows
for each statement execute function laria_private.mark_store_page_changes();

drop trigger if exists stores_public_page_changes_delete on public.stores;
create trigger stores_public_page_changes_delete
after delete on public.stores
referencing old table as old_rows
for each statement execute function laria_private.mark_store_page_changes();

drop trigger if exists listing_photos_public_page_changes_insert on public.listing_photos;
create trigger listing_photos_public_page_changes_insert
after insert on public.listing_photos
referencing new table as new_rows
for each statement execute function laria_private.mark_listing_photo_page_changes();

drop trigger if exists listing_photos_public_page_changes_update on public.listing_photos;
create trigger listing_photos_public_page_changes_update
after update on public.listing_photos
referencing old table as old_rows new table as new_rows
for each statement execute function laria_private.mark_listing_photo_page_changes();

drop trigger if exists listing_photos_public_page_changes_delete on public.listing_photos;
create trigger listing_photos_public_page_changes_delete
after delete on public.listing_photos
referencing old table as old_rows
for each statement execute function laria_private.mark_listing_photo_page_changes();

-- Service role only (app/api/internal/public-pages/refresh): takes every waiting row, including rows of a run that
-- never reported back, and returns the claim, or null when nothing changed.
create or replace function public.claim_public_page_changes()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claim uuid := gen_random_uuid();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  update laria_private.public_page_changes set claim_id = claim;
  if not found then
    return null;
  end if;
  return claim;
end;
$$;

-- Service role only: the run holding p_claim has dropped the pages. A row seen for the first time waits for one more
-- run; a row first dropped at least 30 seconds ago is done. Rows another run has claimed since are left to it.
-- Returns the number of rows done.
create or replace function public.complete_public_page_changes(p_claim uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  done integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  delete from laria_private.public_page_changes
  where claim_id = p_claim and first_dropped_at <= now() - interval '30 seconds';
  get diagnostics done = row_count;
  update laria_private.public_page_changes
  set first_dropped_at = now()
  where claim_id = p_claim and first_dropped_at is null;
  return done;
end;
$$;

revoke all on function public.claim_public_page_changes(), public.complete_public_page_changes(uuid)
from public, anon, authenticated;
grant execute on function public.claim_public_page_changes(), public.complete_public_page_changes(uuid)
to service_role;

reset lock_timeout;
