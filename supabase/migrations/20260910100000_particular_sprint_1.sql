-- Laria V1 Sprint 1: account-owned Particular publication.
-- Forward-only and compatibility-safe: legacy rows keep nullable ownership and
-- their listing-level contact snapshot.

create or replace function public.listing_meets_publish_requirements(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.listings l
    where l.id = p_listing_id
      and nullif(trim(coalesce(l.brand, '')), '') is not null
      and nullif(trim(coalesce(l.model, '')), '') is not null
      and nullif(trim(coalesce(l.category, '')), '') is not null
      and nullif(trim(coalesce(l.instrument_type, '')), '') is not null
      and (
        (l.category = 'guitars' and l.instrument_type in ('electric_guitar', 'acoustic_guitar'))
        or (l.category = 'basses' and l.instrument_type = 'bass')
        or (l.category = 'drums' and l.instrument_type = 'drums')
        or (l.category = 'cymbals' and l.instrument_type = 'cymbals')
        or (l.category = 'microphones' and l.instrument_type = 'microphones')
        or (l.category = 'pedals' and l.instrument_type = 'pedals')
        or (l.category = 'amplifiers' and l.instrument_type = 'amplifiers')
        or (l.category = 'audio interfaces' and l.instrument_type = 'audio_interface')
      )
      and nullif(trim(coalesce(l.condition, '')), '') is not null
      and nullif(trim(coalesce(l.city, '')), '') is not null
      and nullif(trim(coalesce(l.region, '')), '') is not null
      and nullif(trim(coalesce(l.whatsapp_phone, '')), '') is not null
      and l.price_pen is not null
      and l.price_pen > 0
      and length(trim(coalesce(l.description, ''))) >= 40
      and l.marketplace_rules_accepted_at is not null
      and (
        select count(*)
        from public.listing_photos lp
        where lp.listing_id = l.id
      ) between 2 and 10
  );
$$;

create or replace function public.enforce_listing_publication_requirements()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'approved'
    and old.status is distinct from 'approved'
    and not public.listing_meets_publish_requirements(old.id) then
    raise exception 'Listing does not meet publication requirements.';
  end if;
  return new;
end;
$$;

drop trigger if exists listings_enforce_publication_requirements on public.listings;
create trigger listings_enforce_publication_requirements
after update of status on public.listings
for each row execute function public.enforce_listing_publication_requirements();

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
    )
    on conflict (id) do nothing
    returning id into inserted_id;

    if inserted_id is not null then
      insert into public.listing_photos (listing_id, image_url, alt_text, sort_order)
      select p_id, photo->>'image_url', photo->>'alt_text', (ordinality - 1)::integer
      from jsonb_array_elements(p_photos) with ordinality as photos(photo, ordinality);
    end if;
  elsif p_kind = 'store' then
    insert into public.stores (id, slug, name, city, region, district, address, whatsapp_phone, contact_name, instagram_url, facebook_url, description, logo_url, banner_url, status, listing_plan)
    values (p_id, p_fields->>'slug', p_fields->>'name', p_fields->>'city', p_fields->>'region', p_fields->>'district', p_fields->>'address', p_fields->>'whatsapp_phone', p_fields->>'name', nullif(p_fields->>'instagram_url',''), nullif(p_fields->>'facebook_url',''), p_fields->>'description', p_photos->0->>'image_url', p_photos->1->>'image_url', 'pending', 'free')
    on conflict (id) do nothing;
  else
    raise exception 'Invalid submission kind';
  end if;
  return p_id;
end;
$$;

revoke all on function public.complete_public_submission(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.complete_public_submission(uuid, text, jsonb, jsonb) to service_role;

-- A Particular can validate/submit a draft, but can never self-approve it.
-- Store behavior is intentionally left to the dedicated store sprint.
create or replace function public.submit_listing_for_publication(p_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_record public.listings;
begin
  select * into listing_record from public.listings where id = p_listing_id;
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
    if listing_record.store_id is null or not public.is_approved_store_member(listing_record.store_id) then
      raise exception 'Store listings require an approved store membership.';
    end if;
    if not public.listing_meets_publish_requirements(p_listing_id) then
      raise exception 'Listing does not meet publication requirements.';
    end if;
    perform set_config('app.allow_listing_admin_fields', 'true', true);
    update public.listings
    set status = 'approved', published_at = coalesce(published_at, now())
    where id = p_listing_id returning * into listing_record;
    return listing_record;
  end if;

  raise exception 'Unsupported seller type.';
end;
$$;

-- Anonymous callers may browse approved inventory, but can no longer create it.
drop policy if exists "Public can insert pending listings" on public.listings;
drop policy if exists "Public can insert photos for pending listings" on public.listing_photos;
drop policy if exists "Public can upload listing photos" on storage.objects;

-- Public listing details resolve only the profile of an approved owned listing.
drop policy if exists "Public can read profiles for approved listings" on public.profiles;
create policy "Public can read profiles for approved listings"
on public.profiles
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.listings l
    where l.owner_user_id = profiles.id
      and l.seller_type = 'individual'
      and l.status = 'approved'
  )
);
grant select on public.profiles to anon;

create or replace function public.can_remove_listing_photo(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_listing(p_listing_id)
    and (select count(*) from public.listing_photos where listing_id = p_listing_id) > 2;
$$;

create or replace function public.can_add_listing_photo(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_listing(p_listing_id)
    and (select count(*) from public.listing_photos where listing_id = p_listing_id) < 10;
$$;

drop policy if exists "Listing managers can insert own listing photos" on public.listing_photos;
create policy "Listing managers can insert own listing photos"
on public.listing_photos
for insert
to authenticated
with check (public.can_add_listing_photo(listing_id));

drop policy if exists "Listing managers can delete own listing photos above minimum" on public.listing_photos;
create policy "Listing managers can delete own listing photos above minimum"
on public.listing_photos
for delete
to authenticated
using (public.can_remove_listing_photo(listing_id));

drop policy if exists "Authenticated users can update listing photos under own folder" on storage.objects;
drop policy if exists "Authenticated users can delete listing photos under own folder" on storage.objects;
create policy "Authenticated users can update listing photos under own folder"
on storage.objects
for update
to authenticated
using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Authenticated users can delete listing photos under own folder"
on storage.objects
for delete
to authenticated
using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

grant delete on public.listing_photos to authenticated;
grant execute on function public.can_add_listing_photo(uuid) to authenticated;
grant execute on function public.can_remove_listing_photo(uuid) to authenticated;
