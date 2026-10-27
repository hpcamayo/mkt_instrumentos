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
-- - listing_photos and listing_sound_clips: a photo or the sound clip of such a listing added, changed (other than a
--   photo's updated_at) or removed.
-- - stores: a store that becomes or stops being active, and an active store added, removed or changed in a field the
--   pages show (the list in mark_store_page_changes). Its e-mail, contact person or plan don't count.
-- - profiles: a name, phone, city, region or start date changed (sellers and reviewers show by name), or a profile
--   removed. A new profile shows nowhere yet.
-- - transaction_reviews: a review added, changed (Admin hiding it) or removed, in either direction. A review shows once
--   both sides have reviewed or its deadline has passed (laria_private.review_is_visible), so the seller's review of a
--   buyer can reveal the buyer's review of the seller.
-- - While the payments pilot is on (laria_private.assisted_commerce_settings), a store listing's purchase details
--   (public.get_listing_purchase_request): its store's approved payment methods, and the SKU of its active inventory
--   item with the most a buyer can ask for (the available quantity, from 1 to 10). Switching the pilot counts too.
-- Two changes come with time alone: a review shows once its deadline passes, and a paused listing comes back at
-- midnight in Lima on its paused_until date. Each run of the job looks for both since its previous look
-- (laria_private.public_page_clock) and records a row when it finds one.
-- The seller's last activity, sale count and verification date, and badges that age out (a recent price drop), show as
-- of the page's last rebuild.
-- The triggers run once per statement and write at most one row, so an import that publishes 2,000 listings writes
-- one. Writers only ever insert, so no writer waits on another or on the job.
--
-- The job app/api/internal/public-pages/refresh runs every minute (vercel.json) with the service role. Each run claims
-- the waiting rows (claim_public_page_changes), reads the cached check page (app/api/public-pages/probe), reports its
-- nonce (complete_public_page_changes) and, while rows remain, asks for every cached listing page, the home and the
-- check page to be cleared together (lib/listing-cache.ts). Next.js sends the clear to the cache after the job
-- answers, so the job can't see whether it worked; the check page shows it on a later run, since its nonce only
-- changes when a clear reaches the cache. Each deployment has a cache of its own, and a clear reaches only the cache of
-- the deployment that asks for it, so the check page also names the deployment that built it, and a run counts only a
-- check page of its own deployment (a domain that switched deployments meanwhile serves another's). A row is armed with
-- the nonce a run reads, and that run's deployment, at least 35 seconds after the row was first claimed: by then every
-- rebuild that read the database before the change has been saved, since a rebuild stops after 30 seconds
-- (maxDuration). A later run in the same deployment that reads another nonce proves a clear since, and the row is
-- done; a run in another deployment (a deploy or a rollback since) arms the row again with its own. Until then every
-- run clears again, so a failed run, a clear the cache lost or a check page that can't be read leaves the rows for
-- later runs. A deployment the job hasn't run in before (a deploy, or a rollback to an older one, with pages from its
-- build or its own past) adds a row, so its pages are cleared too.
--
-- Compatibility: nothing before this change reads these tables, so the migration can be applied before the deploy;
-- rows wait until the job runs, and its first claim folds them into one.
-- Locks: every trigger is made with create or replace trigger, which takes a SHARE ROW EXCLUSIVE lock on its table,
-- on a second run too. The lock blocks writes to that table, never reads, and is held until the migration commits, so
-- the tables come in order of how often they are written, listings last. Each lock wait is capped at 10 seconds
-- (lock_timeout): behind a long-running query the migration fails and can be run again, instead of holding up the
-- traffic queued behind it. Applying it scans no table.
-- The transition tables hold the rows each statement touched, so a bulk update pays a small cost per row even when
-- nothing is recorded. Each run of the job looks for the changes that come with time through the review deadline
-- index, and reads public.listings for pauses that ended (no index covers paused_until; once a minute, that is a
-- scan of a table of a few thousand rows).
-- Rollback: drop the twenty-four triggers, the thirteen functions and the three tables.

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
-- The deployment of the run that armed the row (null where the job runs outside Vercel). Added on its own, so a
-- database that has the table from an earlier version of this file gains it too.
alter table laria_private.public_page_changes
  add column if not exists armed_deployment text
    check (armed_deployment is null or (armed_nonce is not null and length(armed_deployment) between 1 and 200));

-- The deployment the job last ran in.
create table if not exists laria_private.public_page_deployment (
  id boolean primary key default true check (id),
  deployment text not null check (length(deployment) between 1 and 200),
  seen_at timestamptz not null default now()
);

-- When the job last looked for the changes that come with time alone (claim_public_page_changes).
create table if not exists laria_private.public_page_clock (
  id boolean primary key default true check (id),
  checked_at timestamptz not null
);

revoke all on laria_private.public_page_changes, laria_private.public_page_deployment, laria_private.public_page_clock
from public, anon, authenticated;

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

-- A listing's sound clip plays on its page.
create or replace function laria_private.mark_sound_clip_page_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed boolean;
begin
  if tg_op = 'UPDATE' then
    -- A clip is keyed by its listing, so a row that left or entered the set is a change, even under a new key.
    select exists (
      select 1 from old_rows o
      where laria_private.listing_is_shown(o.listing_id)
        and not exists (select 1 from new_rows n where to_jsonb(n) = to_jsonb(o))
    ) or exists (
      select 1 from new_rows n
      where laria_private.listing_is_shown(n.listing_id)
        and not exists (select 1 from old_rows o where to_jsonb(o) = to_jsonb(n))
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

-- The listing page shows the seller's reviews from buyers (public.get_public_reputation). A review shows once both
-- sides have reviewed or its deadline has passed (laria_private.review_is_visible), so a review in either direction can
-- change what shows.
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
    select exists (select 1 from old_rows) into changed;
  else
    select exists (select 1 from new_rows) into changed;
  end if;
  if changed then
    insert into laria_private.public_page_changes default values;
  end if;
  return null;
end;
$$;

-- While the payments pilot is on, a store listing's page shows its store's approved payment methods while the store is
-- active and verified (laria_private.public_payment_methods). A proposal under review, a refusal or who receives the
-- money shows nowhere. Off, the page shows none, and switching the pilot counts on its own (mark_pilot_page_changes).
create or replace function laria_private.mark_payment_method_page_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed boolean;
begin
  if not laria_private.assisted_commerce_pilot_enabled() then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    select exists (
      select 1
      from (
        (select o.store_id, o.method, o.provider_label from old_rows o where o.status = 'approved'
         except
         select n.store_id, n.method, n.provider_label from new_rows n where n.status = 'approved')
        union all
        (select n.store_id, n.method, n.provider_label from new_rows n where n.status = 'approved'
         except
         select o.store_id, o.method, o.provider_label from old_rows o where o.status = 'approved')
      ) shown
      join public.stores s on s.id = shown.store_id
      where s.status = 'active' and s.is_verified
    ) into changed;
  elsif tg_op = 'INSERT' then
    select exists (
      select 1 from new_rows n join public.stores s on s.id = n.store_id
      where n.status = 'approved' and s.status = 'active' and s.is_verified
    ) into changed;
  else
    select exists (
      select 1 from old_rows o join public.stores s on s.id = o.store_id
      where o.status = 'approved' and s.status = 'active' and s.is_verified
    ) into changed;
  end if;
  if changed then
    insert into laria_private.public_page_changes default values;
  end if;
  return null;
end;
$$;

-- While the payments pilot is on, a store listing's page offers it with the SKU of its active inventory item and the
-- most a buyer can ask for: the available quantity, from 1 to 10 (public.get_listing_purchase_request). Stock
-- movements that leave those as they were (most of them), and items of no listing that shows, don't count.
create or replace function laria_private.mark_inventory_page_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed boolean;
begin
  if not laria_private.assisted_commerce_pilot_enabled() then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    select exists (
      select 1
      from (
        (select o.listing_id, o.merchant_sku, least(greatest(o.quantity_available, 1), 10) from old_rows o
         where o.listing_id is not null and o.inventory_status = 'active'
         except
         select n.listing_id, n.merchant_sku, least(greatest(n.quantity_available, 1), 10) from new_rows n
         where n.listing_id is not null and n.inventory_status = 'active')
        union all
        (select n.listing_id, n.merchant_sku, least(greatest(n.quantity_available, 1), 10) from new_rows n
         where n.listing_id is not null and n.inventory_status = 'active'
         except
         select o.listing_id, o.merchant_sku, least(greatest(o.quantity_available, 1), 10) from old_rows o
         where o.listing_id is not null and o.inventory_status = 'active')
      ) offered (listing_id, merchant_sku, max_quantity)
      where laria_private.listing_is_shown(offered.listing_id)
    ) into changed;
  elsif tg_op = 'INSERT' then
    select exists (
      select 1 from new_rows n
      where n.listing_id is not null and n.inventory_status = 'active' and laria_private.listing_is_shown(n.listing_id)
    ) into changed;
  else
    select exists (
      select 1 from old_rows o
      where o.listing_id is not null and o.inventory_status = 'active' and laria_private.listing_is_shown(o.listing_id)
    ) into changed;
  end if;
  if changed then
    insert into laria_private.public_page_changes default values;
  end if;
  return null;
end;
$$;

-- Switching the payments pilot on or off (laria_private.set_assisted_commerce_pilot) shows or hides every store
-- listing's purchase details.
create or replace function laria_private.mark_pilot_page_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from old_rows o join new_rows n on n.id = o.id where o.pilot_enabled is distinct from n.pilot_enabled
  ) then
    insert into laria_private.public_page_changes default values;
  end if;
  return null;
end;
$$;

revoke all on function laria_private.listing_row_is_shown(public.listing_status, public.seller_type, uuid),
  laria_private.listing_is_shown(uuid)
from public, anon, authenticated;
revoke all on function laria_private.mark_listing_page_changes(), laria_private.mark_listing_photo_page_changes(),
  laria_private.mark_sound_clip_page_changes(), laria_private.mark_store_page_changes(),
  laria_private.mark_profile_page_changes(), laria_private.mark_review_page_changes(),
  laria_private.mark_payment_method_page_changes(), laria_private.mark_inventory_page_changes(),
  laria_private.mark_pilot_page_changes()
from public, anon, authenticated;

-- Transition tables allow one event per trigger, so each table has one trigger per event. The tables come in order of
-- how often they are written, so the busiest are locked the shortest (see Locks above).
create or replace trigger assisted_commerce_settings_public_page_changes_update
after update on laria_private.assisted_commerce_settings
referencing old table as old_rows new table as new_rows
for each statement execute function laria_private.mark_pilot_page_changes();

create or replace trigger store_payment_methods_public_page_changes_insert
after insert on public.store_payment_methods
referencing new table as new_rows
for each statement execute function laria_private.mark_payment_method_page_changes();

create or replace trigger store_payment_methods_public_page_changes_update
after update on public.store_payment_methods
referencing old table as old_rows new table as new_rows
for each statement execute function laria_private.mark_payment_method_page_changes();

create or replace trigger store_payment_methods_public_page_changes_delete
after delete on public.store_payment_methods
referencing old table as old_rows
for each statement execute function laria_private.mark_payment_method_page_changes();

create or replace trigger transaction_reviews_public_page_changes_insert
after insert on public.transaction_reviews
referencing new table as new_rows
for each statement execute function laria_private.mark_review_page_changes();

create or replace trigger transaction_reviews_public_page_changes_update
after update on public.transaction_reviews
referencing old table as old_rows new table as new_rows
for each statement execute function laria_private.mark_review_page_changes();

create or replace trigger transaction_reviews_public_page_changes_delete
after delete on public.transaction_reviews
referencing old table as old_rows
for each statement execute function laria_private.mark_review_page_changes();

create or replace trigger listing_sound_clips_public_page_changes_insert
after insert on public.listing_sound_clips
referencing new table as new_rows
for each statement execute function laria_private.mark_sound_clip_page_changes();

create or replace trigger listing_sound_clips_public_page_changes_update
after update on public.listing_sound_clips
referencing old table as old_rows new table as new_rows
for each statement execute function laria_private.mark_sound_clip_page_changes();

create or replace trigger listing_sound_clips_public_page_changes_delete
after delete on public.listing_sound_clips
referencing old table as old_rows
for each statement execute function laria_private.mark_sound_clip_page_changes();

create or replace trigger profiles_public_page_changes_update
after update on public.profiles
referencing old table as old_rows new table as new_rows
for each statement execute function laria_private.mark_profile_page_changes();

create or replace trigger profiles_public_page_changes_delete
after delete on public.profiles
referencing old table as old_rows
for each statement execute function laria_private.mark_profile_page_changes();

create or replace trigger listing_photos_public_page_changes_insert
after insert on public.listing_photos
referencing new table as new_rows
for each statement execute function laria_private.mark_listing_photo_page_changes();

create or replace trigger listing_photos_public_page_changes_update
after update on public.listing_photos
referencing old table as old_rows new table as new_rows
for each statement execute function laria_private.mark_listing_photo_page_changes();

create or replace trigger listing_photos_public_page_changes_delete
after delete on public.listing_photos
referencing old table as old_rows
for each statement execute function laria_private.mark_listing_photo_page_changes();

create or replace trigger stores_public_page_changes_insert
after insert on public.stores
referencing new table as new_rows
for each statement execute function laria_private.mark_store_page_changes();

create or replace trigger stores_public_page_changes_update
after update on public.stores
referencing old table as old_rows new table as new_rows
for each statement execute function laria_private.mark_store_page_changes();

create or replace trigger stores_public_page_changes_delete
after delete on public.stores
referencing old table as old_rows
for each statement execute function laria_private.mark_store_page_changes();

create or replace trigger store_inventory_items_public_page_changes_insert
after insert on public.store_inventory_items
referencing new table as new_rows
for each statement execute function laria_private.mark_inventory_page_changes();

create or replace trigger store_inventory_items_public_page_changes_update
after update on public.store_inventory_items
referencing old table as old_rows new table as new_rows
for each statement execute function laria_private.mark_inventory_page_changes();

create or replace trigger store_inventory_items_public_page_changes_delete
after delete on public.store_inventory_items
referencing old table as old_rows
for each statement execute function laria_private.mark_inventory_page_changes();

create or replace trigger listings_public_page_changes_insert
after insert on public.listings
referencing new table as new_rows
for each statement execute function laria_private.mark_listing_page_changes();

create or replace trigger listings_public_page_changes_update
after update on public.listings
referencing old table as old_rows new table as new_rows
for each statement execute function laria_private.mark_listing_page_changes();

create or replace trigger listings_public_page_changes_delete
after delete on public.listings
referencing old table as old_rows
for each statement execute function laria_private.mark_listing_page_changes();

-- Service role only (app/api/internal/public-pages/refresh): takes every waiting row, including those of a run that
-- never reported back, and returns the claim, or null when nothing waits. p_deployment names the deployment the job
-- runs in; a new one adds a row. So does a review deadline, or the end of a listing's pause, passed since the previous
-- run looked (the first run only starts the clock: a deployment's first run adds a row anyway).
create or replace function public.claim_public_page_changes(p_deployment text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claim uuid := gen_random_uuid();
  claimed timestamptz;
  looked timestamptz;
  looking timestamptz := clock_timestamp();
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
  -- Locked, so runs at the same time look at the span between them once.
  select checked_at into looked from laria_private.public_page_clock where id for update;
  if not found then
    insert into laria_private.public_page_clock (id, checked_at) values (true, looking) on conflict (id) do nothing;
  elsif looked < looking then
    if exists (
      select 1 from public.verified_transactions t
      where t.review_deadline > looked and t.review_deadline <= looking
        and exists (select 1 from public.transaction_reviews r where r.transaction_id = t.id)
    ) or exists (
      -- The listing page counts a listing paused while paused_until is after today in Lima.
      select 1 from public.listings l
      where l.paused_until between (looked at time zone 'America/Lima')::date and (looking at time zone 'America/Lima')::date
        and (l.paused_until::timestamp at time zone 'America/Lima') > looked
        and (l.paused_until::timestamp at time zone 'America/Lima') <= looking
        and laria_private.listing_row_is_shown(l.status, l.seller_type, l.store_id)
    ) then
      insert into laria_private.public_page_changes default values;
    end if;
    update laria_private.public_page_clock set checked_at = looking where id;
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
  -- Rows armed with the same nonce in the same deployment, or not armed yet and first claimed by the same run, wait
  -- for the same thing, so one stands for all.
  delete from laria_private.public_page_changes c
  using (
    select id, row_number() over (
      partition by armed_deployment, armed_nonce, case when armed_nonce is null then first_claimed_at end
      order by id desc
    ) as rank
    from laria_private.public_page_changes
    where claim_id = claim
  ) r
  where c.id = r.id and r.rank > 1;
  return claim;
end;
$$;

-- Service role only: the run holding p_claim, in deployment p_deployment, read its own deployment's check page nonce
-- p_nonce after claiming (null when it couldn't). A row armed in this deployment with another nonce is done, since a
-- clear reached this deployment's cache after it was armed. A row armed in another deployment, whose proof says nothing
-- about this one's cache, is armed again here, and so is a row first claimed at least 35 seconds before this claim.
-- Rows another run has claimed since are left to it. Returns the rows done and the rows still waiting for a clear.
-- An earlier version of this file made the function without p_deployment.
drop function if exists public.complete_public_page_changes(uuid, text);
create or replace function public.complete_public_page_changes(p_claim uuid, p_nonce text, p_deployment text default null)
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
  if length(p_nonce) between 8 and 100 and (p_deployment is null or length(p_deployment) between 1 and 200) then
    delete from laria_private.public_page_changes
    where claim_id = p_claim and armed_nonce <> p_nonce and armed_deployment is not distinct from p_deployment;
    get diagnostics done = row_count;
    update laria_private.public_page_changes
    set armed_nonce = p_nonce, armed_deployment = p_deployment
    where claim_id = p_claim
      and ((armed_nonce is not null and armed_deployment is distinct from p_deployment)
        or (armed_nonce is null and claimed_at >= first_claimed_at + interval '35 seconds'));
  end if;
  select count(*) into waiting from laria_private.public_page_changes where claim_id = p_claim;
  return jsonb_build_object('done', done, 'waiting', waiting);
end;
$$;

revoke all on function public.claim_public_page_changes(text), public.complete_public_page_changes(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.claim_public_page_changes(text), public.complete_public_page_changes(uuid, text, text)
to service_role;

reset lock_timeout;
