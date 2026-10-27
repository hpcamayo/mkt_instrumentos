-- Launch audit A34 (26 Oct 2026 audit), part 1: an index for each foreign key that had none a lookup by it can use.
--
-- 54 foreign keys of public and laria_private had no such index. 47 had no index starting with their columns, and 7
-- only partial ones that leave rows out: marketplace_events.actor_user_id's cover WhatsApp contacts and rows with a
-- session, and those of favorite_shares.user_id, follows.user_id, listing_revisions.listing_id,
-- purchase_checkins.seller_user_id, saved_search_alerts.user_id and store_admin_requests.store_id cover only active,
-- open or pending rows, or one kind of follow. Deleting or re-keying the row one points at (a listing, a store, an
-- account, a review, a catalog product the loader drops) then read the whole table that points at it, to check it or
-- to clear or cascade the link, and joins on these columns read it too. Each gets a btree index on its columns. A
-- column that may be null gets a partial index (where ... is not null): the checks and joins compare with =, which
-- never matches null, so it serves them at a fraction of the size.
-- Left out on purpose:
-- - public.marketplace_events.event_type: it points at a fixed list of event types that is never deleted or renamed,
--   and marketplace_events takes more writes than any other table.
-- - public.store_inventory_items (listing_id, store_id) and public.store_import_photo_assignments (asset_id,
--   session_id): a unique index on their first column already finds the one row (store_inventory_items_listing_id_key,
--   store_import_photo_assignments_pkey).
-- tests/launch-audit-database-speed.sql checks that every other foreign key of both schemas has an index starting with
-- its columns, with no condition or only `is not null` ones on those columns, which a lookup by the key always meets.
--
-- Locks: building an index takes a SHARE lock on its table, which blocks writes to it (never reads) until the
-- migration commits. Writers take these tables in many orders, so the first statement takes all 31 locks at once
-- without waiting: while one is held it lets go of the others and tries again a moment later, and after 30 seconds it
-- fails and can be run again. From then on the migration waits for no writer. Each build reads its table once; on
-- today's data they all take well under a second, and writes to these tables wait that long.
-- Rollback: drop the 54 indexes.

set lock_timeout = '10s';

do $$
declare
  give_up timestamptz := clock_timestamp() + interval '30 seconds';
begin
  loop
    begin
      lock table public.catalog_manufacturers, public.catalog_product_aliases, public.catalog_product_external_ids,
        public.catalog_product_families, public.catalog_product_specs, public.catalog_product_variants,
        public.catalog_products, public.catalog_review_candidates, public.complaints_book_entries,
        public.favorite_shares, public.follows, public.listing_drafts, public.listing_edit_attempts,
        public.listing_questions, public.listing_revisions, public.listing_stock_watches, public.marketplace_events,
        public.notifications, public.purchase_checkins, public.reports, public.review_moderation_actions,
        public.saved_search_alerts, public.store_admin_requests, public.store_import_photo_assets,
        public.store_import_rows, public.store_purchase_request_marks, public.store_stock_movements,
        public.transaction_claims, public.transaction_reviews, laria_private.marketplace_email_deliveries,
        laria_private.search_alert_matches
      in share mode nowait;
      exit;
    exception when lock_not_available then
      if clock_timestamp() > give_up then
        raise exception using errcode = 'lock_not_available',
          message = 'FOREIGN_KEY_INDEX_TABLES_BUSY: the tables to index stayed busy for 30 seconds; run it again.';
      end if;
      perform pg_sleep(0.02 + random() * 0.08);
    end;
  end loop;
end;
$$;

create index if not exists catalog_manufacturers_parent_idx on public.catalog_manufacturers (parent_id)
  where parent_id is not null;

create index if not exists catalog_product_aliases_source_idx on public.catalog_product_aliases (source_id)
  where source_id is not null;

create index if not exists catalog_product_external_ids_source_idx on public.catalog_product_external_ids (source_id)
  where source_id is not null;

create index if not exists catalog_product_families_category_idx on public.catalog_product_families (category_id)
  where category_id is not null;

create index if not exists catalog_product_specs_source_idx on public.catalog_product_specs (source_id)
  where source_id is not null;

create index if not exists catalog_product_variants_source_idx on public.catalog_product_variants (source_id)
  where source_id is not null;

create index if not exists catalog_products_family_id_idx on public.catalog_products (family_id)
  where family_id is not null;
create index if not exists catalog_products_parent_product_idx on public.catalog_products (parent_product_id)
  where parent_product_id is not null;

create index if not exists catalog_review_candidates_product_a_idx on public.catalog_review_candidates (product_a)
  where product_a is not null;
create index if not exists catalog_review_candidates_product_b_idx on public.catalog_review_candidates (product_b)
  where product_b is not null;

create index if not exists complaints_book_entries_answered_by_idx on public.complaints_book_entries (answered_by)
  where answered_by is not null;

create index if not exists favorite_shares_user_idx on public.favorite_shares (user_id);

create index if not exists follows_user_idx on public.follows (user_id);

create index if not exists listing_drafts_store_idx on public.listing_drafts (store_id) where store_id is not null;

create index if not exists listing_edit_attempts_listing_idx on public.listing_edit_attempts (listing_id);

create index if not exists listing_questions_answered_by_idx on public.listing_questions (answered_by)
  where answered_by is not null;
create index if not exists listing_questions_hidden_by_idx on public.listing_questions (hidden_by)
  where hidden_by is not null;

create index if not exists listing_revisions_listing_idx on public.listing_revisions (listing_id);

create index if not exists listing_stock_watches_listing_idx on public.listing_stock_watches (listing_id);

create index if not exists marketplace_events_actor_idx on public.marketplace_events (actor_user_id)
  where actor_user_id is not null;

create index if not exists notifications_claim_idx on public.notifications (claim_id) where claim_id is not null;
create index if not exists notifications_listing_idx on public.notifications (listing_id) where listing_id is not null;
create index if not exists notifications_price_drop_idx on public.notifications (price_drop_id)
  where price_drop_id is not null;
create index if not exists notifications_review_idx on public.notifications (review_id) where review_id is not null;
create index if not exists notifications_store_idx on public.notifications (store_id) where store_id is not null;
create index if not exists notifications_transaction_idx on public.notifications (transaction_id)
  where transaction_id is not null;

create index if not exists purchase_checkins_claim_idx on public.purchase_checkins (claim_id)
  where claim_id is not null;
create index if not exists purchase_checkins_seller_idx on public.purchase_checkins (seller_user_id);
create index if not exists purchase_checkins_store_idx on public.purchase_checkins (store_id)
  where store_id is not null;

create index if not exists reports_listing_idx on public.reports (listing_id) where listing_id is not null;
create index if not exists reports_resolved_by_idx on public.reports (resolved_by) where resolved_by is not null;
create index if not exists reports_review_idx on public.reports (review_id) where review_id is not null;
create index if not exists reports_store_idx on public.reports (store_id) where store_id is not null;

create index if not exists review_moderation_actions_admin_user_idx on public.review_moderation_actions (admin_user_id);

create index if not exists saved_search_alerts_user_idx on public.saved_search_alerts (user_id);

create index if not exists store_admin_requests_store_idx on public.store_admin_requests (store_id);

create index if not exists store_import_photo_assets_duplicate_of_idx on public.store_import_photo_assets (duplicate_of)
  where duplicate_of is not null;
create index if not exists store_import_photo_assets_store_idx on public.store_import_photo_assets (store_id);

create index if not exists store_import_rows_store_idx on public.store_import_rows (store_id);

create index if not exists store_purchase_request_marks_sale_movement_idx
  on public.store_purchase_request_marks (sale_movement_id) where sale_movement_id is not null;

create index if not exists store_stock_movements_import_session_idx on public.store_stock_movements (import_session_id)
  where import_session_id is not null;

create index if not exists transaction_claims_store_idx on public.transaction_claims (store_id)
  where store_id is not null;

create index if not exists transaction_reviews_admin_hidden_by_idx on public.transaction_reviews (admin_hidden_by)
  where admin_hidden_by is not null;
create index if not exists transaction_reviews_reviewer_user_idx on public.transaction_reviews (reviewer_user_id);

create index if not exists marketplace_email_deliveries_claim_idx
  on laria_private.marketplace_email_deliveries (claim_id) where claim_id is not null;
create index if not exists marketplace_email_deliveries_notification_idx
  on laria_private.marketplace_email_deliveries (notification_id) where notification_id is not null;
create index if not exists marketplace_email_deliveries_price_drop_idx
  on laria_private.marketplace_email_deliveries (price_drop_id) where price_drop_id is not null;
create index if not exists marketplace_email_deliveries_review_idx
  on laria_private.marketplace_email_deliveries (review_id) where review_id is not null;
create index if not exists marketplace_email_deliveries_search_alert_idx
  on laria_private.marketplace_email_deliveries (search_alert_id) where search_alert_id is not null;
create index if not exists marketplace_email_deliveries_search_match_idx
  on laria_private.marketplace_email_deliveries (search_match_id) where search_match_id is not null;
create index if not exists marketplace_email_deliveries_store_idx
  on laria_private.marketplace_email_deliveries (store_id) where store_id is not null;
create index if not exists marketplace_email_deliveries_transaction_idx
  on laria_private.marketplace_email_deliveries (transaction_id) where transaction_id is not null;

create index if not exists search_alert_matches_listing_idx on laria_private.search_alert_matches (listing_id);
create index if not exists search_alert_matches_user_idx on laria_private.search_alert_matches (user_id);

reset lock_timeout;
