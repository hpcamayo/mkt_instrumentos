-- Launch audit A19 (26 Oct 2026 audit): a record of every change to what the cached public pages show, kept until the
-- cache is proven cleared after it.
--
-- The home and listing pages are cached and rebuilt at most once a minute (app/page.tsx,
-- app/instrumentos/[slug]/page.tsx), and after a quiet spell the cache hands the first visitor its old copy. Besides
-- its own page, a listing shows as a card on the home and in the "Similares" and "Más del vendedor" rows of other
-- listings. So every statement that changes what these pages show leaves a row in laria_private.public_page_changes,
-- in its own transaction, whichever path made it (the owner, Admin, Inventario, an import, a database function):
-- - listings: a listing added, changed or removed that shows publicly before or after the statement: approved, or
--   sold (its page stays up with "Vendido"), from a Particular or an active store. Changes to view_count,
--   availability_checkin_at or updated_at alone don't count: no page shows them as they happen.
-- - listing_photos: a photo of such a listing added, changed (other than updated_at) or removed.
-- - stores: a store that becomes or stops being active, and an active store added, removed or changed in a field the
--   pages show (the list in mark_store_page_changes). Its e-mail, contact person or plan don't count.
-- - profiles: a name, phone, city, region or start date changed (sellers and reviewers show by name), or a profile
--   removed. A new profile shows nowhere yet.
-- - transaction_reviews: a review of a seller added, changed (Admin hiding it) or removed.
-- The seller's last activity, sale count and verification date show as of the page's last rebuild.
-- The triggers run once per statement and write at most one row, so an import that publishes 2,000 listings writes
-- one. Writers only ever insert, so no writer waits on another or on the job.
--
-- The job app/api/internal/public-pages/refresh runs every minute (vercel.json) with the service role. Each run claims
-- the waiting rows (claim_public_page_changes), reads the nonce of a cached check page (app/api/public-pages/probe),
-- reports it (complete_public_page_changes) and, while rows remain, asks for every cached listing page, the home and
-- the check page to be cleared together (lib/listing-cache.ts). Next.js sends the clear to the cache after the job
-- answers, so the job can't see whether it worked; the check page shows it on a later run, since its nonce only
-- changes when a clear reaches the cache. A row is armed with the nonce a run reads at least 35 seconds after the row
-- was first claimed: by then every rebuild that read the database before the change has been saved, since a rebuild
-- stops after 30 seconds (maxDuration). A later run that reads another nonce proves a clear since, and the row is done.
-- Until then every run clears again, so a failed run, a clear the cache lost or a check page that can't be read leaves
-- the rows for later runs. A deployment the job hasn't run in before (a deploy, or a rollback to an older one, with
-- pages from its build or its own past) adds a row, so its pages are cleared too.
--
-- Compatibility: nothing before this change reads these tables, so the migration can be applied before the deploy;
-- rows wait until the job runs, and its first claim folds them into one.
-- Locks: creating the triggers takes brief SHARE ROW EXCLUSIVE locks on listings, listing_photos, stores, profiles and
-- transaction_reviews, and nothing scans a table. Every lock wait is capped at 10 seconds (lock_timeout): behind a
-- long-running query the migration fails and can be run again, instead of holding up the traffic queued behind it.
-- The transition tables hold the rows each statement touched, so a bulk update pays a small cost per row even when
-- nothing is recorded.
-- Rollback: drop the fourteen triggers, the nine functions and the two tables.

set lock_timeout = '10s';

create table if not exists laria_private.public_page_changes (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default clock_timestamp(),
  -- The run that holds the row; a later run takes it over (claim_public_page_changes).
  claim_id uuid,
  claimed_at timestamptz,
  first_claimed_at timestamptz,
  -- The check page's nonce, read by a run at least 35 seconds after first_claimed_at.
  armed_nonce text check (armed_nonce is null or length(armed_nonce) between 8 and 100),
  check (armed_nonce is null or first_claimed_at is not null)
);

-- The deployment the job last ran in.
create table if not exists laria_private.public_page_deployment (
  id boolean primary key default true check (id),
  deployment text not null check (length(deployment) between 1 and 200),
  seen_at timestamptz not null default now()
);

revoke all on laria_private.public_page_changes, laria_private.public_page_deployment from public, anon, authenticated;

-- Shows publicly: approved, or sold (the page stays up with "Vendido"), from a Particular or an active store. The rule
-- of app/instrumentos/[slug]/page.tsx and public.listing_is_public, for a row's own values: the triggers judge each
-- row as it was before and after the statement.
create or replace function laria_private.listing_row_is_shown(
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
  select p_status in ('approved', 'sold')
    and (
      (p_seller_type = 'individual' and p_store_id is null)
      or (
        p_seller_type = 'store' and p_store_id is not null
        and exists (select 1 from public.stores s where s.id = p_store_id and s.status = 'active')
      )
    );
$$;

create or replace function laria_private.listing_is_shown(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.listings l
    where l.id = p_listing_id and laria_private.listing_row_is_shown(l.status, l.seller_type, l.store_id)
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
      where (o.status in ('approved', 'sold') or n.status in ('approved', 'sold'))
        and (to_jsonb(o) - array['view_count', 'availability_checkin_at', 'updated_at'])
          is distinct from (to_jsonb(n) - array['view_count', 'availability_checkin_at', 'updated_at'])
        and (
          laria_private.listing_row_is_shown(o.status, o.seller_type, o.store_id)
          or laria_private.listing_row_is_shown(n.status, n.seller_type, n.store_id)
        )
    ) into changed;
  elsif tg_op = 'INSERT' then
    select exists (
      select 1 from new_rows n where laria_private.listing_row_is_shown(n.status, n.seller_type, n.store_id)
    ) into changed;
  else
    select exists (
      select 1 from old_rows o where laria_private.listing_row_is_shown(o.status, o.seller_type, o.store_id)
    ) into changed;
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
        and (laria_private.listing_is_shown(o.listing_id) or laria_private.listing_is_shown(n.listing_id))
    ) into changed;
  elsif tg_op = 'INSERT' then
    select exists (select 1 from new_rows n where laria_private.listing_is_shown(n.listing_id)) into changed;
  else
    select exists (select 1 from old_rows o where laria_private.listing_is_shown(o.listing_id)) into changed;
  end if;
  if changed then
    insert into laria_private.public_page_changes default values;
  end if;
  return null;
end;
$$;

-- What the cached pages show of a store: the listing page's store box and seller facts
-- (app/instrumentos/[slug]/page.tsx, public.get_public_seller_facts: the owner's activity, RUC, razon social, the
-- address or that one was checked), the cards (lib/catalog.ts) and the home's stores (lib/home.ts).
-- tests/launch-audit-caching.test.cjs checks that every store field those pages read is in this list.
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
        and row(o.status, o.is_verified, o.name, o.slug, o.description, o.city, o.district, o.whatsapp_phone,
                o.logo_url, o.created_at, o.public_address, o.address, o.opening_hours, o.ruc, o.razon_social,
                o.owner_user_id)
          is distinct from
            row(n.status, n.is_verified, n.name, n.slug, n.description, n.city, n.district, n.whatsapp_phone,
                n.logo_url, n.created_at, n.public_address, n.address, n.opening_hours, n.ruc, n.razon_social,
                n.owner_user_id)
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

-- The listing page shows its seller's name, phone, city, region and start date, and each reviewer's name.
create or replace function laria_private.mark_profile_page_changes()
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
      where row(o.full_name, o.phone, o.city, o.region, o.created_at)
        is distinct from row(n.full_name, n.phone, n.city, n.region, n.created_at)
    ) into changed;
  else
    select exists (select 1 from old_rows) into changed;
  end if;
  if changed then
    insert into laria_private.public_page_changes default values;
  end if;
  return null;
end;
$$;

-- The listing page shows the seller's reviews from buyers (public.get_public_reputation).
create or replace function laria_private.mark_review_page_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed boolean;
begin
  if tg_op = 'DELETE' then
    select exists (select 1 from old_rows o where o.direction = 'buyer_to_seller') into changed;
  else
    select exists (select 1 from new_rows n where n.direction = 'buyer_to_seller') into changed;
  end if;
  if changed then
    insert into laria_private.public_page_changes default values;
  end if;
  return null;
end;
$$;

revoke all on function laria_private.listing_row_is_shown(public.listing_status, public.seller_type, uuid),
  laria_private.listing_is_shown(uuid)
from public, anon, authenticated;
revoke all on function laria_private.mark_listing_page_changes(), laria_private.mark_listing_photo_page_changes(),
  laria_private.mark_store_page_changes(), laria_private.mark_profile_page_changes(),
  laria_private.mark_review_page_changes()
from public, anon, authenticated;

-- Transition tables allow one event per trigger, so each table has one trigger per event.
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

drop trigger if exists profiles_public_page_changes_update on public.profiles;
create trigger profiles_public_page_changes_update
after update on public.profiles
referencing old table as old_rows new table as new_rows
for each statement execute function laria_private.mark_profile_page_changes();

drop trigger if exists profiles_public_page_changes_delete on public.profiles;
create trigger profiles_public_page_changes_delete
after delete on public.profiles
referencing old table as old_rows
for each statement execute function laria_private.mark_profile_page_changes();

drop trigger if exists transaction_reviews_public_page_changes_insert on public.transaction_reviews;
create trigger transaction_reviews_public_page_changes_insert
after insert on public.transaction_reviews
referencing new table as new_rows
for each statement execute function laria_private.mark_review_page_changes();

drop trigger if exists transaction_reviews_public_page_changes_update on public.transaction_reviews;
create trigger transaction_reviews_public_page_changes_update
after update on public.transaction_reviews
referencing old table as old_rows new table as new_rows
for each statement execute function laria_private.mark_review_page_changes();

drop trigger if exists transaction_reviews_public_page_changes_delete on public.transaction_reviews;
create trigger transaction_reviews_public_page_changes_delete
after delete on public.transaction_reviews
referencing old table as old_rows
for each statement execute function laria_private.mark_review_page_changes();

-- Service role only (app/api/internal/public-pages/refresh): takes every waiting row, including those of a run that
-- never reported back, and returns the claim, or null when nothing waits. p_deployment names the deployment the job
-- runs in; a new one adds a row.
create or replace function public.claim_public_page_changes(p_deployment text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claim uuid := gen_random_uuid();
  claimed timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if length(p_deployment) between 1 and 200 then
    insert into laria_private.public_page_deployment as d (id, deployment)
    values (true, p_deployment)
    on conflict (id) do update set deployment = excluded.deployment, seen_at = now()
    where d.deployment <> excluded.deployment;
    if found then
      insert into laria_private.public_page_changes default values;
    end if;
  end if;
  update laria_private.public_page_changes set claim_id = claim;
  if not found then
    return null;
  end if;
  -- Read after the update's snapshot, so every row it took was committed before this time.
  claimed := clock_timestamp();
  update laria_private.public_page_changes
  set claimed_at = claimed, first_claimed_at = coalesce(first_claimed_at, claimed)
  where claim_id = claim;
  -- Rows armed with the same nonce, or not armed yet and first claimed by the same run, wait for the same thing, so
  -- one stands for all.
  delete from laria_private.public_page_changes c
  using (
    select id, row_number() over (
      partition by armed_nonce, case when armed_nonce is null then first_claimed_at end
      order by id desc
    ) as rank
    from laria_private.public_page_changes
    where claim_id = claim
  ) r
  where c.id = r.id and r.rank > 1;
  return claim;
end;
$$;

-- Service role only: the run holding p_claim read the check page's nonce p_nonce after claiming (null when it couldn't).
-- A row armed with another nonce is done, since a clear reached the cache after it was armed; a row first claimed at
-- least 35 seconds before this claim is armed with p_nonce. Rows another run has claimed since are left to it. Returns
-- the rows done and the rows still waiting for a clear.
create or replace function public.complete_public_page_changes(p_claim uuid, p_nonce text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  done integer := 0;
  waiting integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if length(p_nonce) between 8 and 100 then
    delete from laria_private.public_page_changes
    where claim_id = p_claim and armed_nonce <> p_nonce;
    get diagnostics done = row_count;
    update laria_private.public_page_changes
    set armed_nonce = p_nonce
    where claim_id = p_claim and armed_nonce is null and claimed_at >= first_claimed_at + interval '35 seconds';
  end if;
  select count(*) into waiting from laria_private.public_page_changes where claim_id = p_claim;
  return jsonb_build_object('done', done, 'waiting', waiting);
end;
$$;

revoke all on function public.claim_public_page_changes(text), public.complete_public_page_changes(uuid, text)
from public, anon, authenticated;
grant execute on function public.claim_public_page_changes(text), public.complete_public_page_changes(uuid, text)
to service_role;

reset lock_timeout;
