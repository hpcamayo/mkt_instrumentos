-- Launch audit A27, step 1 of 2: the reads the site needs once a listing's contact columns are private.
--
-- Before: anon and authenticated may read every column of a public listing, contact_name and whatsapp_phone included,
-- and the profile (full_name, phone, city, region) of every Particular with an approved listing. Each listing page
-- shows its seller's name and number by design; what the API adds is every seller's name and number in one paginated
-- request, past the site's firewall and its rate limits.
--
-- Step 2 (20261114140000_launch_audit_contact_columns.sql) gives listings column grants, as stores already has
-- (20261022130000), and closes other users' profiles. This step adds what the application reads instead. It changes
-- nothing the site reads today, so it is applied before the application that uses it deploys:
--
-- 1. public.public_listings, a listing's public columns: the columns step 2 grants. A security invoker view, so
--    row-level security on listings still decides which rows a caller sees. A computed field such as
--    listing_photo_count(listings) reads the whole row, which needs SELECT on every column of listings: under column
--    grants it fails. The view's row holds only public columns, so public pages that use a computed field read the
--    view, and the same fields are declared for its rows.
-- 2. listing_photo_count, recent_price_drop_at and seller_verified_rank for a public_listings row, with the same
--    bodies and the same rights as the listings ones.
-- 3. catalog_search (the catalog's free-text search) returns public_listings rows.
-- 4. admin_get_listing(): one listing, every column, for Admin's listing editor.
--
-- The contact button's number and the listings of a seller without an account are read on the server
-- (app/api/contact/route.ts, app/instrumentos/[slug]/page.tsx), with the service role.
--
-- Compatibility: the site that runs before the deploy keeps working. Every column, embed and computed field it asks of
-- catalog_search exists on public_listings rows.
-- Locks: the view and the functions lock nothing against reads or writes. Every lock wait is capped at 10 seconds.
-- Rollback (before step 2): drop admin_get_listing, recreate catalog_search from
-- 20261111120000_catalog_read_performance.sql, then drop the three public_listings functions and the view.

set lock_timeout = '10s';

-- ------------------------------------------------------------------------------------------------ 1. the view

-- A column added to public.listings later is not here: a public one needs its column grant (step 2) and its place
-- at the end of this view (create or replace view keeps the existing columns in order and adds new ones last).
create view public.public_listings
with (security_invoker = true)
as
select
  l.id,
  l.store_id,
  l.owner_user_id,
  l.seller_type,
  l.status,
  l.title,
  l.slug,
  l.description,
  l.category,
  l.instrument_type,
  l.brand,
  l.model,
  l.condition,
  l.attributes,
  l.price_pen,
  l.previous_price_pen,
  l.price_dropped_at,
  l.city,
  l.region,
  l.view_count,
  l.stock_state,
  l.published_at,
  l.created_at,
  l.updated_at,
  l.content_changed_at,
  l.availability_confirmed_at,
  l.paused_until,
  l.sold_at
from public.listings l;

comment on view public.public_listings is
  'A listing''s public columns, read with the caller''s rights (security invoker): public pages that use a computed field read this view. Launch audit A27.';

-- Read-only for the browser roles. Through the view a caller could only write what it may write on listings, but
-- nothing writes through it.
revoke all on public.public_listings from public, anon, authenticated;
grant select on public.public_listings to anon, authenticated;

-- ------------------------------------------------------------------------------------- 2. the computed fields

-- PostgREST picks a computed field by its name and the row type of the relation it is read on, so each field is
-- declared for listings rows (unchanged, for the service role and owner pages) and for public_listings rows.

-- Same as 20260909120000: security invoker, so the photos' own policies still apply.
create or replace function public.listing_photo_count(public.public_listings)
returns bigint language sql stable security invoker set search_path = public
as $$ select count(*) from public.listing_photos where listing_id = $1.id; $$;
revoke all on function public.listing_photo_count(public.public_listings) from public;
grant execute on function public.listing_photo_count(public.public_listings) to anon, authenticated;

-- Same as 20261109120000: reads only the row it is given.
create or replace function public.recent_price_drop_at(p_listing public.public_listings)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case
    when p_listing.status = 'approved'
      and p_listing.previous_price_pen > p_listing.price_pen
      and p_listing.price_dropped_at > now() - interval '30 days'
    then p_listing.price_dropped_at
  end
$$;
revoke all on function public.recent_price_drop_at(public.public_listings) from public;
grant execute on function public.recent_price_drop_at(public.public_listings) to anon, authenticated;

-- Same as 20261101120000: 1 for a listing of an active verified store, else 0.
create or replace function public.seller_verified_rank(p_listing public.public_listings)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when p_listing.seller_type = 'store' and exists (
    select 1 from public.stores s where s.id = p_listing.store_id and s.status = 'active' and s.is_verified
  ) then 1 else 0 end
$$;
revoke all on function public.seller_verified_rank(public.public_listings) from public;
grant execute on function public.seller_verified_rank(public.public_listings) to anon, authenticated;

-- ------------------------------------------------------------------------------------------ 3. catalog_search

-- Same contract as 20261111120000: approved listings whose text matches the query, security invoker so row-level
-- security still decides what the caller sees. Its rows are public_listings rows now, since select l.* from listings
-- needs every column. A new return type needs a new function; the drop and the create commit together.
drop function public.catalog_search(text);

create function public.catalog_search(p_q text)
returns setof public.public_listings
language sql
stable
set search_path = public, extensions
as $$
  select p.* from public.public_listings p
  where p.status = 'approved' and p.id in (select public.catalog_search_ids(p_q))
$$;

revoke all on function public.catalog_search(text) from public;
grant execute on function public.catalog_search(text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------- 4. admin_get_listing

-- One listing, every column, for Admin (the listing editor: its contact name and WhatsApp), as admin_get_store does
-- for stores. is_admin() asks for the second sign-in step (aal2) since 20261113120000.
create or replace function public.admin_get_listing(p_listing_id uuid)
returns setof public.listings
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  return query select l.* from public.listings l where l.id = p_listing_id;
end;
$$;

revoke all on function public.admin_get_listing(uuid) from public, anon;
grant execute on function public.admin_get_listing(uuid) to authenticated;

reset lock_timeout;
