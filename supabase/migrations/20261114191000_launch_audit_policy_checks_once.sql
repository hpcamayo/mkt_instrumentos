-- Launch audit A34 (26 Oct 2026 audit), part 2: access rules that check the account once per statement.
--
-- 60 row level security policies of public and storage called auth.uid() or public.is_admin() as is. Postgres runs
-- such a call again for every row a policy checks, and public.is_admin() reads the request's JWT claims as JSON each
-- time, so every signed-in read of listings, stores or profiles paid for it row by row. Written as (select auth.uid())
-- and (select public.is_admin()), each runs once per statement and gives the same answer. Nothing else in the
-- policies changes: each one below is the policy as stored (pg_get_expr, every name with its schema) with only those
-- calls wrapped. public.is_store_member(...), public.is_store_owner(...) and public.listing_owner_can_edit(...) take a
-- value of the row, so they stay as they are. Supabase's database advisor reports the same (auth_rls_initplan).
-- tests/launch-audit-database-speed.sql checks that no policy of public or storage calls either as is.
--
-- Locks: changing a policy takes an ACCESS EXCLUSIVE lock on its table, which blocks reads too, until the migration
-- commits, and the parse of a policy that reads another table takes a lock on that one as well (every such table is
-- in the list). So the first statement takes all 36 locks at once without waiting: while one is held it lets go of the
-- others and tries again a moment later, and after 30 seconds it fails and can be run again. From then on the
-- migration waits for nobody. The changes then take a few milliseconds, which is how long reads and writes of these
-- tables, Storage uploads and downloads included, wait for it.
-- Rollback: alter each policy back to the same text without the (select ...) around auth.uid() and public.is_admin().

set lock_timeout = '10s';

do $$
declare
  give_up timestamptz := clock_timestamp() + interval '30 seconds';
begin
  loop
    begin
      lock table public.catalog_conflicts, public.catalog_review_candidates, public.catalog_review_decisions,
        public.catalog_search_log, public.catalog_source_records, public.email_preferences, public.favorite_shares,
        public.favorites, public.follows, public.listing_drafts, public.listing_photos,
        public.listing_revision_photos, public.listing_revisions, public.listing_sound_clips,
        public.listing_stock_watches, public.listings, public.notifications, public.profiles,
        public.purchase_checkins, public.saved_search_alerts, public.store_admin_requests,
        public.store_import_photo_assets, public.store_import_photo_assignments, public.store_import_rows,
        public.store_import_sessions, public.store_inventory_changes, public.store_inventory_items,
        public.store_listing_defaults, public.store_members, public.store_operation_settings,
        public.store_payment_method_changes, public.store_payment_methods, public.store_photos,
        public.store_stock_movements, public.stores, storage.objects
      in access exclusive mode nowait;
      exit;
    exception when lock_not_available then
      if clock_timestamp() > give_up then
        raise exception using errcode = 'lock_not_available',
          message = 'POLICY_TABLES_BUSY: the tables whose policies change stayed busy for 30 seconds; run it again.';
      end if;
      perform pg_sleep(0.02 + random() * 0.08);
    end;
  end loop;
end;
$$;

alter policy "catalog_conflicts admin read" on public.catalog_conflicts
  using ((select public.is_admin()));

alter policy "catalog_review_candidates admin all" on public.catalog_review_candidates
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy "catalog_review_decisions admin read" on public.catalog_review_decisions
  using ((select public.is_admin()));

alter policy "catalog_search_log admin read" on public.catalog_search_log
  using ((select public.is_admin()));

alter policy "catalog_source_records admin read" on public.catalog_source_records
  using ((select public.is_admin()));

alter policy "Users read their own e-mail preferences" on public.email_preferences
  using (user_id = (select auth.uid()));

alter policy "Users read their own favorite shares" on public.favorite_shares
  using (user_id = (select auth.uid()));

alter policy "Users read only their favorites" on public.favorites
  using (user_id = (select auth.uid()));

alter policy "Users read their own follows" on public.follows
  using (user_id = (select auth.uid()));

alter policy "Owners create own listing drafts" on public.listing_drafts
  with check (owner_user_id = (select auth.uid()));
alter policy "Owners delete own listing drafts" on public.listing_drafts
  using (owner_user_id = (select auth.uid()));
alter policy "Owners read own listing drafts" on public.listing_drafts
  using (owner_user_id = (select auth.uid()));
alter policy "Owners update own listing drafts" on public.listing_drafts
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

alter policy "Admins can read listing photos" on public.listing_photos
  using ((select public.is_admin()));
alter policy "Admins can update listing photos" on public.listing_photos
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy "Owners can read own revision photos" on public.listing_revision_photos
  using (exists (
    select 1 from public.listing_revisions revision
    where ((revision.id = listing_revision_photos.revision_id)
      and ((revision.owner_user_id = (select auth.uid())) or (select public.is_admin())))));

alter policy "Owners can read own listing revisions" on public.listing_revisions
  using ((owner_user_id = (select auth.uid())) or (select public.is_admin()));

alter policy "Admins remove sound clips" on public.listing_sound_clips
  using ((select public.is_admin()));

alter policy "listing_stock_watches_own" on public.listing_stock_watches
  using (user_id = (select auth.uid()));

alter policy "Admins can read listings" on public.listings
  using ((select public.is_admin()));
alter policy "Admins can update listings" on public.listings
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
alter policy "Owners can read own listings" on public.listings
  using ((owner_user_id = (select auth.uid())) or ((store_id is not null) and public.is_store_member(store_id)));

alter policy "Users can read own notifications" on public.notifications
  using (user_id = (select auth.uid()));

alter policy "Admins can read profiles" on public.profiles
  using ((select public.is_admin()));
alter policy "Admins can update profiles" on public.profiles
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
alter policy "Users can insert own profile" on public.profiles
  with check ((id = (select auth.uid())) and (account_type = any (array['seller'::text, 'store_owner'::text])));
alter policy "Users can read own profile" on public.profiles
  using (id = (select auth.uid()));
alter policy "Users can update own profile" on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy "Buyers read own purchase check-ins" on public.purchase_checkins
  using (buyer_user_id = (select auth.uid()));
alter policy "Sellers read buyer purchase reports" on public.purchase_checkins
  using ((seller_user_id = (select auth.uid())) and (answer = 'yes'::text));

alter policy "Users read only their saved searches" on public.saved_search_alerts
  using ((user_id = (select auth.uid())) and (deleted_at is null));

alter policy "store_admin_requests_owner_read" on public.store_admin_requests
  using ((exists (
      select 1 from public.stores s
      where ((s.id = store_admin_requests.store_id) and (s.owner_user_id = (select auth.uid())))))
    or (select public.is_admin()));

alter policy "Admins can read import photos" on public.store_import_photo_assets
  using ((select public.is_admin()));

alter policy "Admins can read import photo assignments" on public.store_import_photo_assignments
  using ((select public.is_admin()));

alter policy "Admins can read import rows" on public.store_import_rows
  using ((select public.is_admin()));

alter policy "Admins can read import sessions" on public.store_import_sessions
  using ((select public.is_admin()));

alter policy "Admins can read inventory changes" on public.store_inventory_changes
  using ((select public.is_admin()));

alter policy "Admins can read inventory" on public.store_inventory_items
  using ((select public.is_admin()));

alter policy "Store owners read own listing defaults" on public.store_listing_defaults
  using (public.is_store_owner(store_id) or (select public.is_admin()));

alter policy "Admins can manage store memberships" on public.store_members
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
alter policy "Store members can read own memberships" on public.store_members
  using (user_id = (select auth.uid()));

alter policy "Admins can read operation settings" on public.store_operation_settings
  using ((select public.is_admin()));

alter policy "Admins can read payment method history" on public.store_payment_method_changes
  using ((select public.is_admin()));

alter policy "Admins can read payment methods" on public.store_payment_methods
  using ((select public.is_admin()));

alter policy "Admins can manage store photos" on public.store_photos
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy "Admins can read stock movements" on public.store_stock_movements
  using ((select public.is_admin()));

alter policy "Admins can read stores" on public.stores
  using ((select public.is_admin()));
alter policy "Admins can update stores" on public.stores
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
alter policy "Store members can update store profile fields" on public.stores
  using ((owner_user_id = (select auth.uid())) or public.is_store_member(id))
  with check ((owner_user_id = (select auth.uid())) or public.is_store_member(id));
alter policy "Store owners can read own stores" on public.stores
  using ((owner_user_id = (select auth.uid())) or public.is_store_member(id));

alter policy "Authenticated users can upload listing photos under own folder" on storage.objects
  with check ((bucket_id = 'listing-photos'::text)
    and ((storage.foldername(name))[1] = ((select auth.uid()))::text)
    and ((storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'::text));
alter policy "Authenticated users upload sound clips under own folder" on storage.objects
  with check ((bucket_id = 'listing-sound-clips'::text)
    and ((storage.foldername(name))[1] = ((select auth.uid()))::text)
    and ((storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'::text));
alter policy "Owners append private listing edit photos" on storage.objects
  with check ((bucket_id = 'listing-edit-photos'::text)
    and ((storage.foldername(name))[1] = ((select auth.uid()))::text)
    and ((storage.foldername(name))[2] = 'listing-edits'::text)
    and (exists (
      select 1 from public.listings listing
      where (((listing.id)::text = (storage.foldername(objects.name))[3])
        and public.listing_owner_can_edit(listing.id)))));
alter policy "Store Owners can delete own store assets" on storage.objects
  using ((bucket_id = 'store-assets'::text) and ((storage.foldername(name))[1] = ((select auth.uid()))::text));
alter policy "Store Owners can update own store assets" on storage.objects
  using ((bucket_id = 'store-assets'::text) and ((storage.foldername(name))[1] = ((select auth.uid()))::text))
  with check ((bucket_id = 'store-assets'::text) and ((storage.foldername(name))[1] = ((select auth.uid()))::text));
alter policy "Store Owners can upload own store assets" on storage.objects
  with check ((bucket_id = 'store-assets'::text)
    and ((storage.foldername(name))[1] = ((select auth.uid()))::text)
    and (exists (
      select 1 from public.profiles p
      where ((p.id = (select auth.uid())) and (p.account_type = 'store_owner'::text)))));
alter policy "Store owners read their import files" on storage.objects
  using ((bucket_id = 'store-imports'::text)
    and ((storage.foldername(name))[1] = ((select auth.uid()))::text)
    and (exists (
      select 1 from public.store_import_sessions session
      where ((session.file_path = objects.name) and (session.created_by = (select auth.uid()))
        and public.is_store_owner(session.store_id)))));
alter policy "Store owners read their import photos" on storage.objects
  using ((bucket_id = 'store-import-photos'::text)
    and ((storage.foldername(name))[1] = ((select auth.uid()))::text)
    and (exists (
      select 1 from public.store_import_photo_assets asset
      where ((asset.object_path = objects.name) and (asset.created_by = (select auth.uid()))
        and public.is_store_owner(asset.store_id)))));
alter policy "Store owners upload their import file" on storage.objects
  with check ((bucket_id = 'store-imports'::text)
    and ((storage.foldername(name))[1] = ((select auth.uid()))::text)
    and (exists (
      select 1 from public.store_import_sessions session
      where ((session.file_path = objects.name) and (session.created_by = (select auth.uid()))
        and (session.status = 'awaiting_upload'::text) and public.is_store_owner(session.store_id)))));
alter policy "Store owners upload their import photos" on storage.objects
  with check ((bucket_id = 'store-import-photos'::text)
    and ((storage.foldername(name))[1] = ((select auth.uid()))::text)
    and (exists (
      select 1 from (public.store_import_photo_assets asset
        join public.store_import_sessions session on ((session.id = asset.session_id)))
      where ((asset.object_path = objects.name) and (asset.created_by = (select auth.uid()))
        and (asset.status = 'awaiting_upload'::text)
        and (session.status = any (array['ready'::text, 'committing'::text, 'committed'::text,
          'partially_committed'::text]))
        and (session.rows_purged_at is null) and public.is_store_owner(asset.store_id)))));

reset lock_timeout;
