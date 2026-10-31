-- Feature ideas, integration (docs/feature-ideas/build-plan.md): the launch audit's record of changes to the cached
-- public pages (20261113130000_launch_audit_page_refresh.sql, A19) for the tables this branch adds.
--
-- The cached listing page and home read these tables besides main's nine. Each statement that changes what they show
-- leaves one row in laria_private.public_page_changes, like main's triggers, whichever path made it:
-- - disc-04, disc-05 (public.get_listing_marks): listing_maker_details, store_maker_profiles and artist_profiles, the
--   "Hecho a mano", "Por encargo" and artist marks;
-- - run-02 (public.get_listing_locations): store_locations and store_location_stock, the "Disponible en" locations
--   (a location shows while it holds the listing's item, so a quantity counts only when it reaches or leaves zero);
-- - sell-08, sell-09, safe-03, safe-11 (public.get_listing_trust): seller_levels (the «Vendedor destacado» mark, not
--   the daily job's computed_at and facts), seller_pages (linked from a Particular's shown listings), store_safe_spots
--   and listing_provenance;
-- - buy-07: store_tryout_settings, only whether the store takes try-outs (components/store-floor/tryout-entry.tsx);
-- - buy-01: seller_bundle_offers and listing_companions, the combo and "Lo que suele acompañarlo";
-- - buy-09: store_installment_offers while the payments pilot is on (laria_private.public_installment_offer; main's
--   trigger on the pilot's settings already counts switching it);
-- - safe-06: transaction_review_photos, an approved review photo added, changed or removed;
-- - disc-03: collections, the home's collections row. A published collection shows from midnight in Lima on its
--   starts_on to midnight after its ends_on, so public.claim_public_page_changes now also looks for those moments, like
--   a listing's pause that ends.
-- laria_private.feature_page_part says what each page shows of a row. A statement is recorded when a shown part left or
-- entered the table's rows, so a write that changes nothing shown (a timestamp, a quantity from 3 to 2, a pending
-- photo) leaves nothing.
-- Not recorded, shown as of the page's last rebuild (as main's seller facts are): the dealer and campaign marks and the
-- services counts, which the pages read through shared caches of their own (lib/dealers-server.ts,
-- lib/campaigns-server.ts, lib/services-counts.ts; Admin's decisions clear the first two with revalidateTag), and a
-- listing's previous owners (laria_private.listing_provenance_json reads public.verified_transactions).
-- New listing, store and profile columns: the listing columns count by themselves (main's rule), and no page reads the
-- store's map pins (20261202120600) from the cache.
--
-- Locks: like main's migration, the first statement takes every table that gets a trigger at once and without waiting,
-- and tries again a moment later while one is busy; after 30 seconds it fails with PAGE_REFRESH_TABLES_BUSY and can be
-- run again. Every other lock wait is capped at 10 seconds. Nothing here locks main's record tables.
-- Rollback: drop the forty-four triggers below, laria_private.mark_feature_page_changes, laria_private.feature_page_part
-- and laria_private.store_is_shown, and take the collections clause out of public.claim_public_page_changes.

set lock_timeout = '10s';

do $$
declare
  give_up timestamptz := clock_timestamp() + interval '30 seconds';
begin
  loop
    begin
      lock table public.collections, public.transaction_review_photos, public.store_installment_offers,
        public.listing_companions, public.seller_bundle_offers, public.store_tryout_settings, public.listing_provenance,
        public.store_safe_spots, public.seller_pages, public.seller_levels, public.store_location_stock,
        public.store_locations, public.artist_profiles, public.store_maker_profiles, public.listing_maker_details
      in share row exclusive mode nowait;
      exit;
    exception when lock_not_available then
      if clock_timestamp() > give_up then
        raise exception using errcode = 'lock_not_available',
          message = 'PAGE_REFRESH_TABLES_BUSY: the tables this migration adds triggers to stayed busy for 30 seconds; run it again.';
      end if;
      perform pg_sleep(0.02 + random() * 0.08);
    end;
  end loop;
end;
$$;

-- An active store: the cached pages show nothing of the others (public.listing_is_public).
create or replace function laria_private.store_is_shown(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.stores s where s.id = p_store_id and s.status = 'active');
$$;

-- What the cached listing page or home shows of a row of p_table (as to_jsonb of the row), or null when it shows
-- nothing of it. Two rows with the same part look the same on every cached page.
create or replace function laria_private.feature_page_part(p_table text, p_row jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case p_table
    when 'listing_maker_details' then case when laria_private.listing_is_shown((p_row->>'listing_id')::uuid) then
      jsonb_build_object('listing_id', p_row->'listing_id', 'handmade', p_row->'handmade',
        'made_to_order_weeks', p_row->'made_to_order_weeks', 'artist_note', p_row->'artist_note') end
    when 'store_maker_profiles' then case when p_row->>'hidden_at' is null
      and laria_private.store_is_shown((p_row->>'store_id')::uuid) then
      jsonb_build_object('store_id', p_row->'store_id', 'kind', p_row->'kind', 'craft_city', p_row->'craft_city') end
    when 'artist_profiles' then case when p_row->>'revoked_at' is null then
      jsonb_build_object('user_id', p_row->'user_id', 'slug', p_row->'slug', 'display_name', p_row->'display_name') end
    when 'store_locations' then case when p_row->>'archived_at' is null
      and laria_private.store_is_shown((p_row->>'store_id')::uuid) then
      p_row - array['address', 'show_address', 'region', 'archived_at', 'updated_at'] end
    when 'store_location_stock' then case when laria_private.store_is_shown((p_row->>'store_id')::uuid) then
      jsonb_build_object('location_id', p_row->'location_id', 'item_id', p_row->'item_id',
        'held', (p_row->>'quantity_on_hand')::integer > 0) end
    when 'seller_levels' then case when p_row->>'qualified_since' is not null then
      jsonb_build_object('subject_user_id', p_row->'subject_user_id', 'subject_store_id', p_row->'subject_store_id',
        'qualified_since', p_row->'qualified_since') end
    -- Linked from the Particular's shown listings.
    when 'seller_pages' then case when not (p_row->>'hidden')::boolean and exists (
        select 1 from public.listings l
        where l.owner_user_id = (p_row->>'user_id')::uuid and l.store_id is null
          and laria_private.listing_row_is_shown(l.status, l.seller_type, l.store_id)) then
      jsonb_build_object('user_id', p_row->'user_id', 'slug', p_row->'slug') end
    when 'store_safe_spots' then case when (p_row->>'enabled')::boolean and p_row->>'admin_disabled_at' is null
      and laria_private.store_is_shown((p_row->>'store_id')::uuid) then
      jsonb_build_object('store_id', p_row->'store_id', 'note', p_row->'note', 'enabled_at', p_row->'enabled_at') end
    when 'listing_provenance' then case when laria_private.listing_is_shown((p_row->>'listing_id')::uuid) then
      jsonb_build_object('listing_id', p_row->'listing_id', 'transaction_id', p_row->'transaction_id') end
    when 'store_tryout_settings' then case when (p_row->>'enabled')::boolean
      and laria_private.store_is_shown((p_row->>'store_id')::uuid) then
      jsonb_build_object('store_id', p_row->'store_id') end
    when 'seller_bundle_offers' then case when p_row->>'store_id' is null
      or laria_private.store_is_shown((p_row->>'store_id')::uuid) then
      jsonb_build_object('owner_user_id', p_row->'owner_user_id', 'store_id', p_row->'store_id',
        'discount_percent', p_row->'discount_percent', 'min_items', p_row->'min_items') end
    when 'listing_companions' then case when laria_private.listing_is_shown((p_row->>'listing_id')::uuid) then
      jsonb_build_object('listing_id', p_row->'listing_id', 'companion_id', p_row->'companion_id',
        'sort_order', p_row->'sort_order') end
    when 'store_installment_offers' then case when p_row->>'status' = 'approved'
      and laria_private.assisted_commerce_pilot_enabled()
      and laria_private.store_is_shown((p_row->>'store_id')::uuid) then
      jsonb_build_object('store_id', p_row->'store_id', 'max_installments', p_row->'max_installments',
        'cards', p_row->'cards', 'min_price_pen', p_row->'min_price_pen') end
    when 'transaction_review_photos' then case when p_row->>'status' = 'approved' then
      jsonb_build_object('id', p_row->'id', 'review_id', p_row->'review_id', 'storage_path', p_row->'storage_path',
        'sort_order', p_row->'sort_order') end
    when 'collections' then case when (p_row->>'published')::boolean then
      p_row - array['published', 'created_at', 'updated_at', 'updated_by'] end
  end;
$$;

-- One statement, at most one row. A shown part that left or entered the table's rows, under any key, is a change.
create or replace function laria_private.mark_feature_page_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed boolean;
begin
  if tg_op = 'INSERT' then
    select exists (
      select 1 from new_rows n where laria_private.feature_page_part(tg_table_name, to_jsonb(n)) is not null
    ) into changed;
  elsif tg_op = 'DELETE' then
    select exists (
      select 1 from old_rows o where laria_private.feature_page_part(tg_table_name, to_jsonb(o)) is not null
    ) into changed;
  else
    select exists (
      select part from (
        select laria_private.feature_page_part(tg_table_name, to_jsonb(o)) as part from old_rows o
      ) before_parts where part is not null
      except
      select laria_private.feature_page_part(tg_table_name, to_jsonb(n)) from new_rows n
    ) or exists (
      select part from (
        select laria_private.feature_page_part(tg_table_name, to_jsonb(n)) as part from new_rows n
      ) after_parts where part is not null
      except
      select laria_private.feature_page_part(tg_table_name, to_jsonb(o)) from old_rows o
    ) into changed;
  end if;
  if changed then
    insert into laria_private.public_page_changes default values;
  end if;
  return null;
end;
$$;

revoke all on function laria_private.store_is_shown(uuid) from public, anon, authenticated;
revoke all on function laria_private.feature_page_part(text, jsonb) from public, anon, authenticated;
revoke all on function laria_private.mark_feature_page_changes() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['listing_maker_details', 'store_maker_profiles', 'artist_profiles', 'store_locations',
    'store_location_stock', 'seller_levels', 'seller_pages', 'store_safe_spots', 'listing_provenance',
    'store_tryout_settings', 'seller_bundle_offers', 'listing_companions', 'store_installment_offers',
    'transaction_review_photos', 'collections']
  loop
    -- A seller page is made when its owner's first listing is approved, which records itself, or on its owner's
    -- request, linked from nothing shown yet (like main's profiles, which get no insert trigger).
    if t <> 'seller_pages' then
      execute format('create or replace trigger %I after insert on public.%I referencing new table as new_rows '
        'for each statement execute function laria_private.mark_feature_page_changes()', t || '_public_page_changes_insert', t);
    end if;
    execute format('create or replace trigger %I after update on public.%I referencing old table as old_rows new table as new_rows '
      'for each statement execute function laria_private.mark_feature_page_changes()', t || '_public_page_changes_update', t);
    execute format('create or replace trigger %I after delete on public.%I referencing old table as old_rows '
      'for each statement execute function laria_private.mark_feature_page_changes()', t || '_public_page_changes_delete', t);
  end loop;
end;
$$;

-- disc-03: a published collection enters the home at midnight in Lima on its starts_on and leaves it at midnight after
-- its ends_on (the collections_public_read policy), with time alone.
select laria_private.patch_function_text(
  'public.claim_public_page_changes(text)'::regprocedure,
  array[
    $old$        and laria_private.listing_row_is_shown(l.status, l.seller_type, l.store_id)
    ) then$old$
  ],
  array[
    $new$        and laria_private.listing_row_is_shown(l.status, l.seller_type, l.store_id)
    ) or exists (
      -- Feature ideas, disc-03 (20261210120300): a published collection's first day starts or its last day ends.
      select 1 from public.collections c
      cross join lateral (values
        ((c.starts_on::timestamp at time zone 'America/Lima')),
        (((c.ends_on + 1)::timestamp at time zone 'America/Lima'))
      ) as moment(at)
      where c.published and moment.at > looked and moment.at <= looking
    ) then$new$
  ]
);
