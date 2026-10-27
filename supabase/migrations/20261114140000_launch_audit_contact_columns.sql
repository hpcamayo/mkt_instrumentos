-- Launch audit A27, step 2 of 2: a listing's contact and other users' profiles leave the public API.
--
-- Before: anon and authenticated had table-level SELECT on public.listings, so through the public API key anyone
-- could read every column of a public listing: contact_name and whatsapp_phone, the moderation fields and the
-- internal ones. The policy "Public can read profiles for approved listings" (20260910100000) let anyone read the
-- name, phone, city and region of every Particular with an approved listing. A listing page shows its seller's name
-- and number by design; the API gave all of them in one paginated request, past the site's firewall and rate limits.
--
-- After: anon and authenticated read only a listing's public columns, the columns of public.public_listings
-- (20261114130000). A signed-in user also reads the four moderation fields owners see on their own listings
-- (rejection_reason, rejection_codes, hidden_source, hidden_reason); approval and showing a listing again clear them,
-- so on a public listing they are empty. contact_name, whatsapp_phone and the internal fields (archived_at, hidden_at,
-- created_by_source, marketplace_rules_accepted_at, relisted_from_listing_id, availability_checkin_at,
-- price_changed_at) are read only by the service role and by security definer functions: the listing page and the
-- contact button on the server, Admin's listing editor through admin_get_listing(). Profiles: nothing reads another
-- user's profile through the API any more (the listing page and the contact button read on the server), so the public
-- policy goes, and so does anon's SELECT. A signed-in user reads their own profile and Admin every profile, as before.
-- Row policies on listings are unchanged; writes are unchanged.
--
-- A column added to public.listings later is private by default: it needs its own column grant to be public, and its
-- place at the end of public.public_listings when a public page reads it next to a computed field (docs/database.md).
--
-- Compatibility: apply once the application of step 1 is live. The site that runs before it reads the photo count
-- from listings rows and the contact through the public key, and both fail under these grants.
-- Locks: the grants take no table lock. Dropping the policy takes a brief ACCESS EXCLUSIVE lock on profiles. Nothing
-- scans a table. Every lock wait is capped at 10 seconds (lock_timeout): behind a long-running query the migration
-- fails and can be run again, instead of holding up the traffic queued behind it.
-- Rollback: grant select on public.listings to anon, authenticated; grant select on public.profiles to anon; and
-- recreate the policy "Public can read profiles for approved listings" from 20260910100000_particular_sprint_1.sql.

set lock_timeout = '10s';

revoke select on public.listings from anon, authenticated;

-- The columns of public.public_listings, in its order.
grant select (
  id,
  store_id,
  owner_user_id,
  seller_type,
  status,
  title,
  slug,
  description,
  category,
  instrument_type,
  brand,
  model,
  condition,
  attributes,
  price_pen,
  previous_price_pen,
  price_dropped_at,
  city,
  region,
  view_count,
  stock_state,
  published_at,
  created_at,
  updated_at,
  content_changed_at,
  availability_confirmed_at,
  paused_until,
  sold_at
) on public.listings to anon, authenticated;

-- Mis publicaciones and Inventario show the owner why a listing was rejected or hidden.
grant select (rejection_reason, rejection_codes, hidden_source, hidden_reason) on public.listings to authenticated;

drop policy if exists "Public can read profiles for approved listings" on public.profiles;
revoke select on public.profiles from anon;

reset lock_timeout;
