-- Laria V1 Sprint 2: store-owner applications, store trust, publication
-- authority, and the concurrency-safe free inventory cap.

-- Refuse to guess at unsafe historical data. Production was checked before this
-- migration was authored, but these guards keep every future environment safe.
do $$
begin
  if exists (
    select 1
    from public.stores
    where ruc is not null
      and length(regexp_replace(ruc, '[^0-9]', '', 'g')) <> 11
  ) then
    raise exception 'Sprint 2 migration blocked: an existing store has an invalid RUC.';
  end if;

  if exists (
    select 1
    from public.stores
    where ruc is not null
    group by regexp_replace(ruc, '[^0-9]', '', 'g')
    having count(*) > 1
  ) then
    raise exception 'Sprint 2 migration blocked: duplicate normalized RUC values exist.';
  end if;

  if exists (
    select 1
    from public.stores
    where owner_user_id is not null
    group by owner_user_id
    having count(*) > 1
  ) then
    raise exception 'Sprint 2 migration blocked: a Store Owner is linked to multiple stores.';
  end if;

  if exists (
    select 1
    from public.listings
    where store_id is not null
      and status in ('pending', 'approved')
    group by store_id
    having count(*) > 50
  ) then
    raise exception 'Sprint 2 migration blocked: a store exceeds the V1 concurrent inventory cap.';
  end if;
end;
$$;

update public.stores
set ruc = regexp_replace(ruc, '[^0-9]', '', 'g')
where ruc is not null;

alter table public.stores
  add constraint stores_ruc_format_check
  check (ruc is null or ruc ~ '^[0-9]{11}$');

create unique index stores_ruc_unique_idx
on public.stores (ruc)
where ruc is not null;

create unique index stores_owner_user_unique_idx
on public.stores (owner_user_id)
where owner_user_id is not null;

create index listings_store_concurrent_inventory_idx
on public.listings (store_id, status)
where store_id is not null and status in ('pending', 'approved');

create table public.store_photos (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  image_url text not null,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_photos_sort_order_non_negative check (sort_order >= 0)
);

create index store_photos_store_sort_idx
on public.store_photos (store_id, sort_order);

create trigger store_photos_set_updated_at
before update on public.store_photos
for each row execute function public.set_updated_at();

create or replace function public.store_application_is_complete(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.stores s
    where s.id = p_store_id
      and nullif(trim(coalesce(s.name, '')), '') is not null
      and nullif(trim(coalesce(s.razon_social, '')), '') is not null
      and coalesce(s.ruc, '') ~ '^[0-9]{11}$'
      and nullif(trim(coalesce(s.email, '')), '') is not null
      and s.email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and regexp_replace(coalesce(s.whatsapp_phone, ''), '[^0-9]', '', 'g') ~ '^[0-9]{9,15}$'
      and nullif(trim(coalesce(s.address, '')), '') is not null
      and nullif(trim(coalesce(s.city, '')), '') is not null
      and nullif(trim(coalesce(s.region, '')), '') is not null
      and nullif(trim(coalesce(s.contact_person, '')), '') is not null
  );
$$;

create or replace function public.enforce_store_inventory_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  concurrent_count integer;
begin
  if new.seller_type <> 'store'
    or new.store_id is null
    or new.status not in ('pending', 'approved') then
    return new;
  end if;

  -- A transition between pending and approved consumes no new capacity.
  if tg_op = 'UPDATE'
    and old.seller_type = 'store'
    and old.store_id = new.store_id
    and old.status in ('pending', 'approved') then
    return new;
  end if;

  -- Serialize every capacity-consuming transition for one store. Unlike a
  -- plain count check, this prevents two concurrent requests at 49 from both
  -- succeeding.
  perform pg_advisory_xact_lock(hashtextextended(new.store_id::text, 0));

  select count(*)
  into concurrent_count
  from public.listings l
  where l.store_id = new.store_id
    and l.status in ('pending', 'approved')
    and (tg_op = 'INSERT' or l.id <> old.id);

  if concurrent_count >= 50 then
    raise exception using
      errcode = 'P0001',
      message = 'STORE_INVENTORY_LIMIT_REACHED: La tienda ya tiene 50 publicaciones concurrentes.';
  end if;

  return new;
end;
$$;

drop trigger if exists listings_enforce_store_inventory_cap on public.listings;
create trigger listings_enforce_store_inventory_cap
before insert or update of seller_type, store_id, status on public.listings
for each row execute function public.enforce_store_inventory_cap();

create or replace function public.listing_is_public(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.listings l
    left join public.stores s on s.id = l.store_id
    where l.id = p_listing_id
      and l.status = 'approved'
      and (
        (l.seller_type = 'individual' and l.store_id is null)
        or
        (l.seller_type = 'store' and l.store_id is not null and s.status = 'active')
      )
  );
$$;

create or replace function public.listing_has_status(
  listing_id uuid,
  expected_status public.listing_status
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when expected_status = 'approved' then public.listing_is_public(listing_id)
    else exists (
      select 1 from public.listings l
      where l.id = listing_id and l.status = expected_status
    )
  end;
$$;

drop policy if exists "Public can read approved listings" on public.listings;
create policy "Public can read publicly eligible listings"
on public.listings
for select
to anon, authenticated
using (public.listing_is_public(id));

drop policy if exists "Public can read photos for approved listings" on public.listing_photos;
create policy "Public can read photos for publicly eligible listings"
on public.listing_photos
for select
to anon, authenticated
using (public.listing_is_public(listing_id));

-- Store authority fields are changed only through the trusted review RPCs.
create or replace function public.protect_store_admin_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.allow_store_admin_fields', true) = 'true' then
    return new;
  end if;

  if new.status is distinct from old.status
    or new.listing_plan is distinct from old.listing_plan
    or new.is_verified is distinct from old.is_verified
    or new.rejection_reason is distinct from old.rejection_reason
    or new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'Only controlled server functions can change protected store fields.';
  end if;

  return new;
end;
$$;

create or replace function public.review_store_application(
  p_store_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.stores
language plpgsql
security definer
set search_path = public
as $$
declare
  store_record public.stores;
begin
  if not public.is_admin() then
    raise exception 'Admin access required.';
  end if;

  select * into store_record
  from public.stores
  where id = p_store_id
  for update;

  if not found then
    raise exception 'Store not found.';
  end if;

  perform set_config('app.allow_store_admin_fields', 'true', true);

  if p_decision = 'approve' then
    if not public.store_application_is_complete(p_store_id) then
      raise exception 'Store application is incomplete.';
    end if;

    update public.stores
    set status = 'active', is_verified = false, rejection_reason = null
    where id = p_store_id
    returning * into store_record;
  elsif p_decision in ('reject', 'hide') then
    if nullif(trim(coalesce(p_reason, '')), '') is null then
      raise exception 'A rejection or suspension reason is required.';
    end if;

    update public.stores
    set status = case when p_decision = 'reject' then 'rejected'::public.store_status else 'hidden'::public.store_status end,
        is_verified = false,
        rejection_reason = trim(p_reason)
    where id = p_store_id
    returning * into store_record;
  else
    raise exception 'Unsupported store decision.';
  end if;

  return store_record;
end;
$$;

create or replace function public.set_store_verification(
  p_store_id uuid,
  p_verified boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  store_record public.stores;
  approved_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Admin access required.';
  end if;

  select * into store_record
  from public.stores
  where id = p_store_id
  for update;

  if not found then
    raise exception 'Store not found.';
  end if;

  if p_verified then
    if store_record.status <> 'active' then
      raise exception 'Only an active Tienda can be verified.';
    end if;
    if not public.store_application_is_complete(p_store_id) then
      raise exception 'Store application is incomplete.';
    end if;
    if exists (
      select 1
      from public.listings l
      where l.store_id = p_store_id
        and l.seller_type = 'store'
        and l.status = 'pending'
        and not public.listing_meets_publish_requirements(l.id)
    ) then
      raise exception 'Pending inventory contains a listing that cannot be published.';
    end if;

    perform set_config('app.allow_store_admin_fields', 'true', true);
    perform set_config('app.allow_listing_admin_fields', 'true', true);

    update public.stores
    set is_verified = true
    where id = p_store_id;

    update public.listings
    set status = 'approved',
        published_at = coalesce(published_at, now())
    where store_id = p_store_id
      and seller_type = 'store'
      and status = 'pending';
    get diagnostics approved_count = row_count;
  else
    perform set_config('app.allow_store_admin_fields', 'true', true);
    update public.stores
    set is_verified = false
    where id = p_store_id;
  end if;

  return jsonb_build_object(
    'store_id', p_store_id,
    'is_verified', p_verified,
    'approved_pending_count', approved_count
  );
end;
$$;

create or replace function public.resubmit_store_application(p_store_id uuid)
returns public.stores
language plpgsql
security definer
set search_path = public
as $$
declare
  store_record public.stores;
begin
  select * into store_record
  from public.stores
  where id = p_store_id
    and owner_user_id = auth.uid()
  for update;

  if not found then raise exception 'Store not found.'; end if;
  if store_record.status <> 'rejected' then
    raise exception 'Only a rejected store application can be resubmitted.';
  end if;
  if not public.store_application_is_complete(p_store_id) then
    raise exception 'Store application is incomplete.';
  end if;

  perform set_config('app.allow_store_admin_fields', 'true', true);
  update public.stores
  set status = 'pending', is_verified = false, rejection_reason = null
  where id = p_store_id
  returning * into store_record;
  return store_record;
end;
$$;

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
  select * into listing_record
  from public.listings
  where id = p_listing_id;

  if not found then raise exception 'Listing not found.'; end if;

  if listing_record.seller_type = 'individual' then
    if listing_record.owner_user_id is distinct from auth.uid() then
      raise exception 'You cannot submit this listing.';
    end if;
    if listing_record.status not in ('draft', 'pending') then
      raise exception 'Only a draft or pending listing can be submitted.';
    end if;
    if not public.listing_meets_publish_requirements(p_listing_id) then
      raise exception 'Listing does not meet publication requirements.';
    end if;

    perform set_config('app.allow_listing_admin_fields', 'true', true);
    update public.listings
    set status = 'pending',
        created_by_source = case when created_by_source = 'legacy' then 'self_service' else created_by_source end
    where id = p_listing_id
    returning * into listing_record;
    return listing_record;
  end if;

  if listing_record.seller_type = 'store' then
    select * into store_record
    from public.stores
    where id = listing_record.store_id
      and owner_user_id = auth.uid()
      and status in ('pending', 'active')
    for update;

    if not found then
      raise exception 'Store inventory requires its authenticated owner and an eligible application.';
    end if;
    if listing_record.owner_user_id is distinct from auth.uid() then
      raise exception 'You cannot submit this store inventory.';
    end if;
    if not public.listing_meets_publish_requirements(p_listing_id) then
      raise exception 'Listing does not meet publication requirements.';
    end if;

    perform set_config('app.allow_listing_admin_fields', 'true', true);
    update public.listings
    set status = case when store_record.status = 'active' and store_record.is_verified then 'approved'::public.listing_status else 'pending'::public.listing_status end,
        published_at = case
          when store_record.status = 'active' and store_record.is_verified then coalesce(published_at, now())
          else published_at
        end,
        created_by_source = case when created_by_source = 'legacy' then 'self_service' else created_by_source end
    where id = p_listing_id
    returning * into listing_record;
    return listing_record;
  end if;

  raise exception 'Unsupported seller type.';
end;
$$;

create or replace function public.complete_public_submission(
  p_id uuid,
  p_kind text,
  p_fields jsonb,
  p_photos jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
  profile_record public.profiles;
  store_record public.stores;
begin
  if p_kind = 'listing' then
    if coalesce(jsonb_array_length(p_photos), 0) not between 2 and 10 then
      raise exception 'A listing requires 2 to 10 photos.';
    end if;

    select * into profile_record
    from public.profiles
    where id = (p_fields->>'owner_user_id')::uuid
      and account_type = 'seller'
      and nullif(trim(coalesce(full_name, '')), '') is not null
      and nullif(trim(coalesce(phone, '')), '') is not null
      and nullif(trim(coalesce(city, '')), '') is not null
      and nullif(trim(coalesce(region, '')), '') is not null;

    if not found or coalesce((p_fields->>'marketplace_rules_accepted')::boolean, false) is not true then
      raise exception 'A complete Particular profile and rules acceptance are required.';
    end if;

    insert into public.listings (
      id, slug, title, category, instrument_type, attributes, brand, model,
      condition, price_pen, city, region, contact_name, whatsapp_phone,
      description, seller_type, status, owner_user_id, store_id,
      created_by_source, marketplace_rules_accepted_at
    ) values (
      p_id, p_fields->>'slug', p_fields->>'title', p_fields->>'category',
      p_fields->>'instrument_type', coalesce(p_fields->'attributes', '{}'::jsonb),
      p_fields->>'brand', p_fields->>'model', p_fields->>'condition',
      (p_fields->>'price_pen')::integer, p_fields->>'city', p_fields->>'region',
      profile_record.full_name, profile_record.phone, p_fields->>'description',
      'individual', 'pending', profile_record.id, null, 'self_service', now()
    ) on conflict (id) do nothing returning id into inserted_id;

    if inserted_id is not null then
      insert into public.listing_photos (listing_id, image_url, alt_text, sort_order)
      select p_id, photo->>'image_url', photo->>'alt_text', (ordinality - 1)::integer
      from jsonb_array_elements(p_photos) with ordinality as photos(photo, ordinality);
    end if;
  elsif p_kind = 'store' then
    select * into profile_record
    from public.profiles
    where id = (p_fields->>'owner_user_id')::uuid
      and account_type = 'store_owner';

    if not found then
      raise exception 'A separate Store Owner account is required.';
    end if;

    insert into public.stores (
      id, slug, name, description, status, listing_plan, contact_name,
      whatsapp_phone, city, region, district, address, instagram_url,
      facebook_url, logo_url, banner_url, owner_user_id, razon_social, ruc,
      contact_person, email, tiktok_url, website_url
    ) values (
      p_id, p_fields->>'slug', trim(p_fields->>'name'), nullif(trim(p_fields->>'description'), ''),
      'pending', 'free', trim(p_fields->>'contact_person'),
      regexp_replace(coalesce(p_fields->>'whatsapp_phone', ''), '[^0-9]', '', 'g'),
      trim(p_fields->>'city'), trim(p_fields->>'region'), nullif(trim(p_fields->>'district'), ''),
      trim(p_fields->>'address'), nullif(trim(p_fields->>'instagram_url'), ''),
      nullif(trim(p_fields->>'facebook_url'), ''),
      (select photo->>'image_url' from jsonb_array_elements(p_photos) photo where photo->>'role' = 'logo' limit 1),
      (select photo->>'image_url' from jsonb_array_elements(p_photos) photo where photo->>'role' = 'banner' limit 1),
      profile_record.id, trim(p_fields->>'razon_social'),
      regexp_replace(coalesce(p_fields->>'ruc', ''), '[^0-9]', '', 'g'),
      trim(p_fields->>'contact_person'), lower(trim(p_fields->>'email')),
      nullif(trim(p_fields->>'tiktok_url'), ''), nullif(trim(p_fields->>'website_url'), '')
    ) on conflict (id) do nothing returning id into inserted_id;

    if inserted_id is not null then
      if not public.store_application_is_complete(p_id) then
        raise exception 'Store application is incomplete.';
      end if;

      insert into public.store_photos (store_id, image_url, alt_text, sort_order)
      select p_id, photo->>'image_url', photo->>'alt_text', (ordinality - 1)::integer
      from jsonb_array_elements(p_photos) with ordinality as photos(photo, ordinality)
      where photo->>'role' = 'store_photo';
    end if;
  elsif p_kind = 'store_listing' then
    if coalesce(jsonb_array_length(p_photos), 0) not between 2 and 10 then
      raise exception 'A listing requires 2 to 10 photos.';
    end if;

    select s.* into store_record
    from public.stores s
    join public.profiles p on p.id = s.owner_user_id
    where s.id = (p_fields->>'store_id')::uuid
      and s.owner_user_id = (p_fields->>'owner_user_id')::uuid
      and p.account_type = 'store_owner'
      and s.status in ('pending', 'active')
    for update;

    if not found then
      raise exception 'An eligible owner-bound store is required.';
    end if;
    if coalesce((p_fields->>'marketplace_rules_accepted')::boolean, false) is not true then
      raise exception 'Marketplace rules acceptance is required.';
    end if;

    insert into public.listings (
      id, slug, title, category, instrument_type, attributes, brand, model,
      condition, price_pen, city, region, contact_name, whatsapp_phone,
      description, seller_type, status, owner_user_id, store_id,
      created_by_source, marketplace_rules_accepted_at
    ) values (
      p_id, p_fields->>'slug', p_fields->>'title', p_fields->>'category',
      p_fields->>'instrument_type', coalesce(p_fields->'attributes', '{}'::jsonb),
      p_fields->>'brand', p_fields->>'model', p_fields->>'condition',
      (p_fields->>'price_pen')::integer, store_record.city, store_record.region,
      store_record.contact_person, store_record.whatsapp_phone, p_fields->>'description',
      'store', 'pending', store_record.owner_user_id, store_record.id,
      'self_service', now()
    ) on conflict (id) do nothing returning id into inserted_id;

    if inserted_id is not null then
      insert into public.listing_photos (listing_id, image_url, alt_text, sort_order)
      select p_id, photo->>'image_url', photo->>'alt_text', (ordinality - 1)::integer
      from jsonb_array_elements(p_photos) with ordinality as photos(photo, ordinality);

      if store_record.status = 'active' and store_record.is_verified then
        if not public.listing_meets_publish_requirements(p_id) then
          raise exception 'Listing does not meet publication requirements.';
        end if;
        perform set_config('app.allow_listing_admin_fields', 'true', true);
        update public.listings
        set status = 'approved', published_at = coalesce(published_at, now())
        where id = p_id;
      end if;
    end if;
  else
    raise exception 'Invalid submission kind';
  end if;

  return p_id;
end;
$$;

-- Pending owners can insert inventory, but only for their one owner-bound
-- pending/active store. Publication status remains protected by the trigger.
drop policy if exists "Approved store members can insert store listings" on public.listings;
create policy "Store owners can insert pending store inventory"
on public.listings
for insert
to authenticated
with check (
  seller_type = 'store'
  and store_id is not null
  and owner_user_id = auth.uid()
  and status = 'pending'
  and exists (
    select 1 from public.stores s
    where s.id = store_id
      and s.owner_user_id = auth.uid()
      and s.status in ('pending', 'active')
  )
);

drop policy if exists "Authenticated users can insert own pending stores" on public.stores;
create policy "Store Owners can insert own pending store"
on public.stores
for insert
to authenticated
with check (
  status = 'pending'
  and listing_plan = 'free'
  and is_verified = false
  and rejection_reason is null
  and owner_user_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.account_type = 'store_owner'
  )
);

alter table public.store_photos enable row level security;

create policy "Public can read active store photos"
on public.store_photos
for select
to anon, authenticated
using (exists (
  select 1 from public.stores s
  where s.id = store_id and s.status = 'active'
));

create policy "Store owners can read own store photos"
on public.store_photos
for select
to authenticated
using (public.is_store_owner(store_id));

create policy "Store owners can add own store photos"
on public.store_photos
for insert
to authenticated
with check (public.is_store_owner(store_id));

create policy "Store owners can update own store photos"
on public.store_photos
for update
to authenticated
using (public.is_store_owner(store_id))
with check (public.is_store_owner(store_id));

create policy "Store owners can delete own store photos"
on public.store_photos
for delete
to authenticated
using (public.is_store_owner(store_id));

create policy "Admins can manage store photos"
on public.store_photos
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public can upload store assets" on storage.objects;
drop policy if exists "Authenticated users can upload store assets under own folder" on storage.objects;
create policy "Store Owners can upload own store assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'store-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.account_type = 'store_owner'
  )
);

create policy "Store Owners can update own store assets"
on storage.objects
for update
to authenticated
using (bucket_id = 'store-assets' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'store-assets' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Store Owners can delete own store assets"
on storage.objects
for delete
to authenticated
using (bucket_id = 'store-assets' and (storage.foldername(name))[1] = auth.uid()::text);

grant select, insert, update, delete on public.store_photos to authenticated;
grant select on public.store_photos to anon;

revoke all on function public.review_store_application(uuid, text, text) from public, anon;
revoke all on function public.set_store_verification(uuid, boolean) from public, anon;
grant execute on function public.review_store_application(uuid, text, text) to authenticated;
grant execute on function public.set_store_verification(uuid, boolean) to authenticated;
grant execute on function public.resubmit_store_application(uuid) to authenticated;
grant execute on function public.store_application_is_complete(uuid) to authenticated;
grant execute on function public.listing_is_public(uuid) to anon, authenticated;
grant execute on function public.submit_listing_for_publication(uuid) to authenticated;

revoke all on function public.complete_public_submission(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.complete_public_submission(uuid, text, jsonb, jsonb) to service_role;
