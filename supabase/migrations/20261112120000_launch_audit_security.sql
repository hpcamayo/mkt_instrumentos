-- Launch audit security fixes (26 Oct 2026 audit, findings A06, A09, A10, A12, A21, A31, A32).
--
-- A06. Stores are created only by public.complete_public_submission (security definer). The policy "Public can
--      insert pending free stores" let the anonymous role insert any pending row, with any RUC, slug, verified flag
--      or owner, and the owner-membership trigger then made that owner a store member. The owner insert policy was
--      unused. Both go, and anon and authenticated lose INSERT on stores.
-- A12. Listings are created only by the submission, copy and import functions (all security definer). The two old
--      insert policies let a signed-in user insert listings directly with forged published_at, view_count,
--      created_at and availability fields, since the protect triggers only run on update. Both go, and anon and
--      authenticated lose INSERT on listings.
-- A09. created_at is read-only on profiles and stores, so "En Laria desde" can't be backdated, and a store's slug is
--      read-only outside the controlled functions. The verified badge vouches for the business Admin checked: when
--      the owner of a verified Tienda changes its public name, RUC or razon social, the store stays active but the
--      badge comes off (verification_lapsed_at, with the previous values in verification_lapsed_from), and the store
--      waits in Admin's "Verificacion" queue until Admin verifies it again or leaves it unverified. Admin's own
--      corrections keep the badge.
-- A21. submit_listing_for_publication refuses a caller without a session. A legacy listing has no owner and an
--      anonymous caller no id, and "null is distinct from null" is false, so an anonymous caller could push a
--      rejected legacy listing back into review. anon also loses EXECUTE on it.
-- A10. The public SELECT policies on the listing-photos and store-assets buckets let anyone list every object,
--      including photos of rejected and removed listings, with account ids as folder names. Public buckets serve
--      files by URL without any policy; the app lists and deletes those files only with the service role. Each
--      bucket keeps a SELECT policy limited to the signed-in owner's own folder, so an upload that reads back its own
--      object keeps working.
-- A31. EXECUTE is revoked on functions the app no longer calls: relist_sold_listing (replaced by
--      copy_owned_listing(..., 'relist'), it appended "-republicado-xxxx" to slugs), can_add_listing_photo,
--      can_remove_listing_photo, listing_has_status and is_approved_store_member; anon also loses
--      get_admin_review_queue (it checks for Admin inside). increment_listing_view_count stays: it is the deliberate
--      denial tombstone for old clients (tests/sprint-4-analytics.sql).
-- A32. Logo, banner and store photo addresses written through the API must point at the caller's own folder for that
--      store in the store-assets bucket, as the store form writes them. Unchanged values and the controlled
--      functions are not checked.
--
-- Compatibility: the application before and after this migration works with it (no route inserts stores or listings
-- directly, and the store form already writes image addresses in that shape), so it can be applied before the deploy.
-- Locks: the policy and grant changes take brief ACCESS EXCLUSIVE locks on stores, listings and storage.objects; the
-- two new nullable columns on stores are metadata-only.
-- Rollback: recreate the dropped policies from 20260427203000_store_registration_fields.sql,
-- 20260516180000_phase_2_accounts.sql and 20260910190000_store_sprint_2.sql, re-grant the revoked privileges, drop
-- the two triggers, and restore the previous function bodies: submit_listing_for_publication and
-- set_store_verification from 20261029120100_review_fixes_lock_order.sql, protect_store_admin_fields from
-- 20260910190000_store_sprint_2.sql, protect_profile_admin_fields from 20260516180000_phase_2_accounts.sql,
-- get_admin_moderation_counts from 20260923120000_sprint_8_admin_reports_legacy.sql and get_admin_moderation_queue
-- from 20261104120100_ux_selling_sound_clips.sql.

-- A06 -------------------------------------------------------------------------------------------------------------
drop policy if exists "Public can insert pending free stores" on public.stores;
drop policy if exists "Store Owners can insert own pending store" on public.stores;
revoke insert on public.stores from anon, authenticated;

-- A12 -------------------------------------------------------------------------------------------------------------
drop policy if exists "Authenticated users can insert own individual listings" on public.listings;
drop policy if exists "Store owners can insert pending store inventory" on public.listings;
revoke insert on public.listings from anon, authenticated;

-- A09 -------------------------------------------------------------------------------------------------------------
alter table public.stores add column if not exists verification_lapsed_at timestamptz;
alter table public.stores add column if not exists verification_lapsed_from jsonb;
comment on column public.stores.verification_lapsed_at is
  'When the owner changed the name, RUC or razon social of this verified Tienda; the badge waits for Admin (A09).';
comment on column public.stores.verification_lapsed_from is
  'The name, RUC and razon social Admin had verified, kept while the badge waits for a new check (A09).';

create or replace function public.protect_store_admin_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.allow_store_admin_fields', true) = 'true' then
    -- A decision on the store (approve, reject, hide, verify, revoke) settles a lapsed verification.
    if new.status is distinct from old.status or new.is_verified is distinct from old.is_verified then
      new.verification_lapsed_at := null;
      new.verification_lapsed_from := null;
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
    or new.listing_plan is distinct from old.listing_plan
    or new.is_verified is distinct from old.is_verified
    or new.rejection_reason is distinct from old.rejection_reason
    or new.owner_user_id is distinct from old.owner_user_id
    or new.created_at is distinct from old.created_at
    or new.slug is distinct from old.slug
    or new.verification_lapsed_at is distinct from old.verification_lapsed_at
    or new.verification_lapsed_from is distinct from old.verification_lapsed_from then
    raise exception 'Only controlled server functions can change protected store fields.';
  end if;

  -- The same business written with other spacing or capitals is not a change of identity. (Written inline: this
  -- trigger runs as the caller, who has no access to laria_private.)
  if old.is_verified and not public.is_admin() and (
    lower(regexp_replace(btrim(coalesce(new.name, '')), '\s+', ' ', 'g'))
      <> lower(regexp_replace(btrim(coalesce(old.name, '')), '\s+', ' ', 'g'))
    or regexp_replace(coalesce(new.ruc, ''), '[^0-9]', '', 'g') <> regexp_replace(coalesce(old.ruc, ''), '[^0-9]', '', 'g')
    or lower(regexp_replace(btrim(coalesce(new.razon_social, '')), '\s+', ' ', 'g'))
      <> lower(regexp_replace(btrim(coalesce(old.razon_social, '')), '\s+', ' ', 'g'))
  ) then
    new.is_verified := false;
    new.verification_lapsed_at := now();
    new.verification_lapsed_from := jsonb_build_object('name', old.name, 'ruc', old.ruc, 'razon_social', old.razon_social);
  end if;

  return new;
end;
$$;

create or replace function public.protect_profile_admin_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.account_type is distinct from old.account_type then
    raise exception 'Only admin can change profile account type.';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'Only admin can change when a profile was created.';
  end if;

  return new;
end;
$$;

create or replace function public.set_store_verification(p_store_id uuid, p_verified boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  store_record public.stores;
  approved_count integer := 0;
  pending_listing record;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into store_record from public.stores where id = p_store_id for no key update;
  if not found then raise exception 'Store not found.'; end if;

  if p_verified then
    if store_record.status <> 'active' then raise exception 'Only an active Tienda can be verified.'; end if;
    if not public.store_application_is_complete(p_store_id) then raise exception 'Store application is incomplete.'; end if;
    if exists (
      select 1 from public.listings l
      where l.store_id = p_store_id and l.seller_type = 'store' and l.status = 'pending'
        and not public.listing_meets_publish_requirements(l.id)
    ) then raise exception 'Pending inventory contains a listing that cannot be published.'; end if;

    perform set_config('app.allow_store_admin_fields', 'true', true);
    perform set_config('app.allow_listing_admin_fields', 'true', true);
    update public.stores set is_verified = true, verification_lapsed_at = null, verification_lapsed_from = null
    where id = p_store_id;
    for pending_listing in
      select id, owner_user_id from public.listings
      where store_id = p_store_id and seller_type = 'store' and status = 'pending'
      for update
    loop
      update public.listings
      set status = 'approved', published_at = coalesce(published_at, now())
      where id = pending_listing.id;
      approved_count := approved_count + 1;
      perform public.create_account_notification(pending_listing.owner_user_id, 'listing_approved', pending_listing.id, p_store_id);
    end loop;
    perform public.create_account_notification(store_record.owner_user_id, 'store_verified', null, p_store_id);
  else
    perform set_config('app.allow_store_admin_fields', 'true', true);
    -- Leaving a lapsed store unverified also takes it out of the Verificacion queue.
    update public.stores set is_verified = false, verification_lapsed_at = null, verification_lapsed_from = null
    where id = p_store_id;
    if store_record.is_verified then
      perform public.create_account_notification(store_record.owner_user_id, 'store_verification_revoked', null, p_store_id);
    end if;
  end if;

  return jsonb_build_object('store_id', p_store_id, 'is_verified', p_verified, 'approved_pending_count', approved_count);
end;
$$;

create or replace function public.get_admin_moderation_counts()
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
begin
  perform laria_private.assert_admin();
  return jsonb_build_object(
    'publicaciones', (select count(*) from public.listings where status = 'pending'),
    'revisiones', (select count(*) from public.listing_revisions where status = 'pending'),
    'tiendas', (select count(*) from public.stores where status = 'pending'),
    -- Only a verified Tienda whose identity changed is pending work (A09). A normal Tienda is a valid terminal trust
    -- tier, so active and unverified alone is not.
    'verificacion', (
      select count(*) from public.stores
      where status = 'active' and not is_verified and verification_lapsed_at is not null
    ),
    'reportes', (select count(*) from public.reports where status = 'open'),
    'resenas', (
      select count(distinct r.review_id)
      from public.reports r
      join public.transaction_reviews tr on tr.id = r.review_id
      join public.verified_transactions vt on vt.id = tr.transaction_id
      where r.status = 'open'
        and r.target_type = 'review'
        and tr.admin_hidden_at is null
        and (
          vt.review_deadline <= now()
          or (select count(*) from public.transaction_reviews pair where pair.transaction_id = vt.id) = 2
        )
    )
  );
end;
$$;

-- A21 -------------------------------------------------------------------------------------------------------------
create or replace function public.submit_listing_for_publication(p_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_record public.listings;
  store_record public.stores;
begin
  if auth.uid() is null then
    raise exception 'You cannot submit this listing.';
  end if;
  select * into listing_record from public.listings where id = p_listing_id for update;
  if not found or listing_record.owner_user_id is distinct from auth.uid() then
    raise exception 'You cannot submit this listing.';
  end if;
  if listing_record.status not in ('draft', 'pending', 'rejected') then
    raise exception 'Only a draft, rejected, or pending listing can be submitted.';
  end if;
  if not public.listing_meets_publish_requirements(p_listing_id) then
    raise exception 'Listing does not meet publication requirements.';
  end if;

  if listing_record.seller_type = 'store' then
    select * into store_record from public.stores
    where id = listing_record.store_id and owner_user_id = auth.uid() and status in ('pending', 'active')
    for no key update;
    if not found then raise exception 'Store inventory requires its authenticated owner and an eligible application.'; end if;
  end if;

  perform set_config('app.allow_listing_admin_fields', 'true', true);
  update public.listings
  set status = case
        when listing_record.seller_type = 'store' and store_record.status = 'active' and store_record.is_verified
          then 'approved'::public.listing_status
        else 'pending'::public.listing_status
      end,
      published_at = case
        when listing_record.seller_type = 'store' and store_record.status = 'active' and store_record.is_verified
          then coalesce(published_at, now())
        else published_at
      end,
      rejection_reason = null,
      created_by_source = case when created_by_source = 'legacy' then 'self_service' else created_by_source end
  where id = p_listing_id returning * into listing_record;
  return listing_record;
end;
$$;
revoke all on function public.submit_listing_for_publication(uuid) from public, anon;
grant execute on function public.submit_listing_for_publication(uuid) to authenticated;

-- A10 -------------------------------------------------------------------------------------------------------------
drop policy if exists "Public can read listing photos" on storage.objects;
drop policy if exists "Public can read store assets" on storage.objects;
drop policy if exists "Owners can read own listing photos" on storage.objects;
create policy "Owners can read own listing photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Owners can read own store assets" on storage.objects;
create policy "Owners can read own store assets" on storage.objects
  for select to authenticated
  using (bucket_id = 'store-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- A31 -------------------------------------------------------------------------------------------------------------
revoke all on function public.relist_sold_listing(uuid) from public, anon, authenticated;
revoke all on function public.can_add_listing_photo(uuid) from public, anon, authenticated;
revoke all on function public.can_remove_listing_photo(uuid) from public, anon, authenticated;
revoke all on function public.listing_has_status(uuid, public.listing_status) from public, anon, authenticated;
revoke all on function public.is_approved_store_member(uuid) from public, anon, authenticated;
revoke all on function public.get_admin_review_queue() from public, anon;

-- A32 -------------------------------------------------------------------------------------------------------------
create or replace function laria_private.guard_store_image_urls()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  store_key uuid;
  shape text;
begin
  -- Only writes made straight through the API are checked; the controlled functions run as their owner.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_table_name = 'stores' then
    store_key := new.id;
  else
    store_key := new.store_id;
  end if;
  shape := '^https?://[^/?#]+/storage/v1/object/public/store-assets/'
    || coalesce(auth.uid()::text, 'none') || '/' || store_key::text || '/[A-Za-z0-9._-]+$';

  if tg_table_name = 'stores' then
    if (new.logo_url is distinct from old.logo_url and new.logo_url is not null and new.logo_url !~ shape)
      or (new.banner_url is distinct from old.banner_url and new.banner_url is not null and new.banner_url !~ shape) then
      raise exception 'STORE_IMAGE_URL_INVALID: Sube la imagen desde el formulario de tu tienda.';
    end if;
  elsif (tg_op = 'INSERT' or new.image_url is distinct from old.image_url) and new.image_url !~ shape then
    raise exception 'STORE_IMAGE_URL_INVALID: Sube la imagen desde el formulario de tu tienda.';
  end if;
  return new;
end;
$$;
revoke all on function laria_private.guard_store_image_urls() from public, anon, authenticated;

drop trigger if exists stores_guard_image_urls on public.stores;
create trigger stores_guard_image_urls
  before update of logo_url, banner_url on public.stores
  for each row execute function laria_private.guard_store_image_urls();
drop trigger if exists store_photos_guard_image_url on public.store_photos;
create trigger store_photos_guard_image_url
  before insert or update of image_url on public.store_photos
  for each row execute function laria_private.guard_store_image_urls();

-- A09: the Verificacion queue lists the stores whose badge is waiting for Admin. Same body as the current definition
-- (20261104120100_ux_selling_sound_clips.sql) except the 'verificacion' branch.
create or replace function public.get_admin_moderation_queue(p_queue text, p_page integer default 1, p_page_size integer default 20)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $function$
declare
  result jsonb;
  item_count bigint;
  row_offset integer;
begin
  perform laria_private.assert_admin();
  if p_queue not in ('publicaciones', 'revisiones', 'tiendas', 'verificacion', 'reportes', 'resenas') then
    raise exception 'ADMIN_QUEUE_INVALID';
  end if;
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size not between 1 and 25 then
    raise exception 'ADMIN_PAGINATION_INVALID';
  end if;
  row_offset := (p_page - 1) * p_page_size;

  if p_queue = 'publicaciones' then
    select count(*) into item_count from public.listings where status = 'pending';
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at, q.id), '[]'::jsonb) into result
    from (
      select l.id, l.title, l.status::text status, l.seller_type::text seller_type,
        l.created_at, l.owner_user_id, l.store_id, l.price_pen, l.condition,
        l.description, l.city, l.region,
        coalesce(s.name, p.full_name, l.contact_name, 'Vendedor de Laria') owner_name,
        l.category, l.brand, l.model, photos.first_photo_url,
        (select c.clip_url from public.listing_sound_clips c where c.listing_id = l.id) sound_clip_url,
        coalesce(photos.photo_count, 0) photo_count
      from public.listings l
      left join public.stores s on s.id = l.store_id
      left join public.profiles p on p.id = l.owner_user_id
      left join lateral (
        select
          (array_agg(lp.image_url order by lp.sort_order, lp.id))[1] first_photo_url,
          count(*) photo_count
        from public.listing_photos lp
        where lp.listing_id = l.id
      ) photos on true
      where l.status = 'pending'
      order by l.created_at, l.id
      limit p_page_size offset row_offset
    ) q;
  elsif p_queue = 'revisiones' then
    select count(*) into item_count from public.listing_revisions where status = 'pending';
    select coalesce(jsonb_agg(to_jsonb(q) order by q.submitted_at, q.id), '[]'::jsonb) into result
    from (
      select r.id, r.listing_id, r.version, r.changed_fields, r.submitted_at,
        l.title listing_title, p.full_name owner_name,
        jsonb_build_object(
          'title', l.title, 'category', l.category, 'instrument_type', l.instrument_type,
          'brand', l.brand, 'model', l.model, 'condition', l.condition,
          'attributes', l.attributes
        ) current_values,
        jsonb_build_object(
          'title', case when 'title' = any(r.changed_fields) then r.title else l.title end,
          'category', case when 'category' = any(r.changed_fields) then r.category else l.category end,
          'instrument_type', case when 'instrument_type' = any(r.changed_fields) then r.instrument_type else l.instrument_type end,
          'brand', case when 'brand' = any(r.changed_fields) then r.brand else l.brand end,
          'model', case when 'model' = any(r.changed_fields) then r.model else l.model end,
          'condition', case when 'condition' = any(r.changed_fields) then r.condition else l.condition end,
          'attributes', case when 'attributes' = any(r.changed_fields) then r.attributes else l.attributes end
        ) proposed_values,
        coalesce((
          select jsonb_agg(to_jsonb(photo) order by photo.sort_order, photo.id)
          from (
            select lp.id, lp.image_url, lp.alt_text, lp.sort_order
            from public.listing_photos lp where lp.listing_id = l.id
            order by lp.sort_order, lp.id limit 10
          ) photo
        ), '[]'::jsonb) current_photos,
        coalesce((
          select jsonb_agg(to_jsonb(photo) order by photo.sort_order, photo.id)
          from (
            select rp.id, rp.image_url, rp.alt_text, rp.sort_order
            from public.listing_revision_photos rp where rp.revision_id = r.id
            order by rp.sort_order, rp.id limit 10
          ) photo
        ), '[]'::jsonb) proposed_photos,
        (select count(*) from public.listing_revision_photos rp where rp.revision_id = r.id) proposed_photo_count
      from public.listing_revisions r
      join public.listings l on l.id = r.listing_id
      left join public.profiles p on p.id = r.owner_user_id
      where r.status = 'pending'
      order by r.submitted_at, r.id
      limit p_page_size offset row_offset
    ) q;
  elsif p_queue = 'tiendas' then
    select count(*) into item_count from public.stores where status = 'pending';
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at, q.id), '[]'::jsonb) into result
    from (
      select s.id, s.name, s.razon_social, s.ruc, s.city, s.region, s.district,
        s.address, s.created_at, s.owner_user_id, p.full_name owner_name,
        s.email, s.contact_person, s.contact_name, s.whatsapp_phone,
        s.logo_url, s.banner_url, s.instagram_url, s.facebook_url,
        s.tiktok_url, s.website_url,
        coalesce(assets.store_photos, '[]'::jsonb) store_photos
      from public.stores s
      left join public.profiles p on p.id = s.owner_user_id
      left join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'id', sp.id,
            'image_url', sp.image_url,
            'alt_text', sp.alt_text,
            'sort_order', sp.sort_order
          ) order by sp.sort_order, sp.id
        ) store_photos
        from public.store_photos sp
        where sp.store_id = s.id
      ) assets on true
      where s.status = 'pending'
      order by s.created_at, s.id
      limit p_page_size offset row_offset
    ) q;
  elsif p_queue = 'verificacion' then
    -- A09: a verified Tienda whose owner changed its public name, RUC or razon social waits here until Admin
    -- verifies it again or leaves it unverified. Any other active, unverified Tienda is a valid terminal trust tier,
    -- not pending work. Verification and revocation stay available under Tiendas.
    select count(*) into item_count from public.stores
    where status = 'active' and not is_verified and verification_lapsed_at is not null;
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at, q.id), '[]'::jsonb) into result
    from (
      select s.id, s.name, s.razon_social, s.ruc, s.city, s.region, s.district,
        s.address, s.verification_lapsed_at created_at, s.owner_user_id, p.full_name owner_name,
        s.email, s.contact_person, s.contact_name, s.whatsapp_phone,
        s.logo_url, s.banner_url, s.instagram_url, s.facebook_url,
        s.tiktok_url, s.website_url,
        'store_identity_changed' reason,
        s.verification_lapsed_from previous_identity,
        coalesce(assets.store_photos, '[]'::jsonb) store_photos
      from public.stores s
      left join public.profiles p on p.id = s.owner_user_id
      left join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'id', sp.id,
            'image_url', sp.image_url,
            'alt_text', sp.alt_text,
            'sort_order', sp.sort_order
          ) order by sp.sort_order, sp.id
        ) store_photos
        from public.store_photos sp
        where sp.store_id = s.id
      ) assets on true
      where s.status = 'active' and not s.is_verified and s.verification_lapsed_at is not null
      order by s.verification_lapsed_at, s.id
      limit p_page_size offset row_offset
    ) q;
  elsif p_queue = 'reportes' then
    select count(*) into item_count from public.reports where status = 'open';
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at, q.id), '[]'::jsonb) into result
    from (
      select r.id, r.target_type, r.reason, r.detail, r.created_at,
        r.listing_id, r.store_id, r.review_id,
        reporter.full_name reporter_name,
        case r.target_type
          when 'listing' then l.title
          when 'store' then s.name
          else coalesce(rl.title, 'Reseña verificada')
        end target_title,
        case r.target_type
          when 'listing' then l.status::text
          when 'store' then s.status::text
          else case when tr.admin_hidden_at is null then 'visible' else 'hidden' end
        end target_status,
        case r.target_type
          when 'listing' then coalesce(s.name, listing_owner.full_name, l.contact_name, 'Vendedor de Laria')
          when 'store' then coalesce(store_owner.full_name, s.contact_person, s.name)
          else coalesce(review_subject.full_name, review_subject_store.name, 'Usuario de Laria')
        end target_owner_name,
        -- Equality on the active target and NULL on the other columns keeps
        -- reports_target_status_idx usable across deep OFFSET pages.
        case r.target_type
          when 'listing' then (select count(*) from public.reports same_target
            where same_target.target_type = 'listing' and same_target.status = 'open'
              and same_target.listing_id = r.listing_id
              and same_target.store_id is null
              and same_target.review_id is null)
          when 'store' then (select count(*) from public.reports same_target
            where same_target.target_type = 'store' and same_target.status = 'open'
              and same_target.listing_id is null
              and same_target.store_id = r.store_id
              and same_target.review_id is null)
          when 'review' then (select count(*) from public.reports same_target
            where same_target.target_type = 'review' and same_target.status = 'open'
              and same_target.listing_id is null
              and same_target.store_id is null
              and same_target.review_id = r.review_id)
        end open_target_report_count
      from public.reports r
      join public.profiles reporter on reporter.id = r.reporter_user_id
      left join public.listings l on l.id = r.listing_id
      left join public.profiles listing_owner on listing_owner.id = l.owner_user_id
      left join public.stores s on s.id = coalesce(r.store_id, l.store_id)
      left join public.profiles store_owner on store_owner.id = s.owner_user_id
      left join public.transaction_reviews tr on tr.id = r.review_id
      left join public.verified_transactions vt on vt.id = tr.transaction_id
      left join public.listings rl on rl.id = vt.listing_id
      left join public.profiles review_subject on review_subject.id = tr.subject_user_id
      left join public.stores review_subject_store on review_subject_store.id = tr.subject_store_id
      where r.status = 'open'
      order by r.created_at, r.id
      limit p_page_size offset row_offset
    ) q;
  else
    select count(distinct r.review_id) into item_count
    from public.reports r
    join public.transaction_reviews tr on tr.id = r.review_id
    join public.verified_transactions vt on vt.id = tr.transaction_id
    where r.status = 'open'
      and r.target_type = 'review'
      and tr.admin_hidden_at is null
      and (
        vt.review_deadline <= now()
        or (select count(*) from public.transaction_reviews pair where pair.transaction_id = vt.id) = 2
      );
    select coalesce(jsonb_agg(to_jsonb(q) order by q.submitted_at, q.id), '[]'::jsonb) into result
    from (
      select tr.id, tr.transaction_id, tr.direction, tr.rating, tr.comment,
        tr.submitted_at, tr.admin_hidden_at, tr.admin_hidden_reason,
        l.id listing_id, l.title listing_title,
        (select count(*) from public.reports r where r.review_id = tr.id and r.status = 'open') open_report_count
      from public.transaction_reviews tr
      join public.verified_transactions vt on vt.id = tr.transaction_id
      join public.listings l on l.id = vt.listing_id
      where tr.admin_hidden_at is null
        and exists(select 1 from public.reports r where r.review_id = tr.id and r.status = 'open')
        and (
          vt.review_deadline <= now()
          or (select count(*) from public.transaction_reviews pair where pair.transaction_id = vt.id) = 2
        )
      order by tr.submitted_at, tr.id
      limit p_page_size offset row_offset
    ) q;
  end if;

  return jsonb_build_object(
    'queue', p_queue,
    'page', p_page,
    'page_size', p_page_size,
    'total', item_count,
    'counts', public.get_admin_moderation_counts(),
    'items', coalesce(result, '[]'::jsonb)
  );
end;
$function$;
