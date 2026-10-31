-- Feature ideas, integration: the branch's listing columns under launch audit A27
-- (20261114130000_launch_audit_contact_reads.sql, 20261114140000_launch_audit_contact_columns.sql).
--
-- Since A27 the public API key reads a listing's columns only through column grants, and pages that use a computed
-- field (photo_count, the sort fields) read the view public.public_listings. The branch adds twenty columns to
-- public.listings, all public facts that cards, filters, the map, store pages and the listing page show: the yes/no
-- flags and "Precio conversable" (listing-details), sale terms, delivery and pickup area (listing-details), trades and
-- part payment (selling-tools), warranty and returns (store-floor's store terms), the restock date (store-floor) and
-- the interest-free installments (buy-09, null while the payments pilot is off). None is a contact or a moderation
-- field. They get the same grant as main's public columns and their place at the end of the view, in the same order.
--
-- A column the branch adds to listings later is private by default, as on main: it needs its grant here and its place
-- at the end of the view when a public page reads it (docs/database.md).
--
-- Locks: the grant takes no table lock; replacing the view takes a brief ACCESS EXCLUSIVE lock on the view alone,
-- capped at 10 seconds.
-- Rollback: revoke the grant, then recreate the view from 20261114130000 (drop and create; catalog_search and the
-- three public_listings functions depend on its row type, so they are recreated with it).

set lock_timeout = '10s';

grant select (
  listing_flags,
  price_mode,
  delivery_pickup,
  pickup_area,
  can_try,
  lima_delivery,
  ships_provinces,
  shipping_carriers,
  shipping_payment,
  accepts_trades,
  trade_wants,
  trade_categories,
  accepts_part_payment,
  warranty_months,
  warranty_provider,
  returns_days,
  returns_note,
  store_terms_source,
  restock_expected_on,
  installments_max
) on public.listings to anon, authenticated;

-- Main's columns first, unchanged and in order (create or replace view only adds columns at the end).
create or replace view public.public_listings
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
  l.sold_at,
  l.listing_flags,
  l.price_mode,
  l.delivery_pickup,
  l.pickup_area,
  l.can_try,
  l.lima_delivery,
  l.ships_provinces,
  l.shipping_carriers,
  l.shipping_payment,
  l.accepts_trades,
  l.trade_wants,
  l.trade_categories,
  l.accepts_part_payment,
  l.warranty_months,
  l.warranty_provider,
  l.returns_days,
  l.returns_note,
  l.store_terms_source,
  l.restock_expected_on,
  l.installments_max
from public.listings l;

reset lock_timeout;
