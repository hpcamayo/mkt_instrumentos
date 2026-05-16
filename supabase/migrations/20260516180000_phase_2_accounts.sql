-- Phase 2 account foundation for seller and store-owner workflows.
-- Additive and compatibility-first: legacy public submissions, approved listings,
-- active store pages, and current admin moderation remain valid.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  city text,
  region text not null default 'Peru',
  account_type text not null default 'seller',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_account_type_check check (
    account_type in ('seller', 'store_owner', 'admin')
  )
);

create table if not exists public.store_members (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  constraint store_members_role_check check (role in ('owner', 'manager', 'staff')),
  constraint store_members_store_user_unique unique (store_id, user_id)
);

alter table public.stores
  add column if not exists owner_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists razon_social text,
  add column if not exists ruc text,
  add column if not exists contact_person text,
  add column if not exists email text,
  add column if not exists tiktok_url text,
  add column if not exists website_url text,
  add column if not exists rejection_reason text;

alter table public.listings
  add column if not exists owner_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists sold_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists created_by_source text not null default 'legacy',
  add column if not exists marketplace_rules_accepted_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'listings_created_by_source_check'
      and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listings_created_by_source_check check (
        created_by_source in ('legacy', 'self_service', 'admin_invite', 'admin')
      );
  end if;
end;
$$;

alter type public.listing_status add value if not exists 'draft';
alter type public.listing_status add value if not exists 'archived';
alter type public.store_status add value if not exists 'rejected';

create index if not exists profiles_account_type_idx
on public.profiles (account_type);

create index if not exists listings_owner_user_id_idx
on public.listings (owner_user_id);

create index if not exists listings_created_by_source_idx
on public.listings (created_by_source);

create index if not exists stores_owner_user_id_idx
on public.stores (owner_user_id);

create index if not exists store_members_user_id_idx
on public.store_members (user_id);

create index if not exists store_members_store_id_idx
on public.store_members (store_id);

drop trigger if exists profiles_set_updated_at on public.profiles;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, account_type)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'phone',
    case
      when new.raw_user_meta_data ->> 'account_type' in ('seller', 'store_owner')
        then new.raw_user_meta_data ->> 'account_type'
      else 'seller'
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created'
      and tgrelid = 'auth.users'::regclass
  ) then
    create trigger on_auth_user_created
    after insert on auth.users
    for each row
    execute function public.handle_new_auth_user();
  end if;
end;
$$;

create or replace function public.create_owner_store_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_user_id is not null then
    insert into public.store_members (store_id, user_id, role)
    values (new.id, new.owner_user_id, 'owner')
    on conflict (store_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists stores_create_owner_membership on public.stores;

create trigger stores_create_owner_membership
after insert on public.stores
for each row
execute function public.create_owner_store_membership();

create or replace function public.is_store_member(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_members
    where store_id = p_store_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_store_owner(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_members
    where store_id = p_store_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

create or replace function public.is_approved_store_member(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_members sm
    join public.stores s on s.id = sm.store_id
    where sm.store_id = p_store_id
      and sm.user_id = auth.uid()
      and s.status = 'active'
  );
$$;

create or replace function public.can_manage_listing(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.listings l
      where l.id = p_listing_id
        and (
          l.owner_user_id = auth.uid()
          or (
            l.store_id is not null
            and public.is_store_member(l.store_id)
          )
        )
    );
$$;

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
      ) >= 3
  );
$$;

create or replace function public.protect_listing_admin_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_admin()
    or current_setting('app.allow_listing_admin_fields', true) = 'true' then
    return new;
  end if;

  if new.status is distinct from old.status
    or new.published_at is distinct from old.published_at
    or new.view_count is distinct from old.view_count
    or new.created_by_source is distinct from old.created_by_source
    or new.owner_user_id is distinct from old.owner_user_id
    or new.store_id is distinct from old.store_id
    or new.seller_type is distinct from old.seller_type then
    raise exception 'Only admin or controlled server functions can change protected listing fields.';
  end if;

  return new;
end;
$$;

drop trigger if exists listings_protect_admin_fields on public.listings;

create trigger listings_protect_admin_fields
before update on public.listings
for each row
execute function public.protect_listing_admin_fields();

create or replace function public.protect_store_admin_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_admin()
    or current_setting('app.allow_store_admin_fields', true) = 'true' then
    return new;
  end if;

  if new.status is distinct from old.status
    or new.listing_plan is distinct from old.listing_plan
    or new.is_verified is distinct from old.is_verified
    or new.rejection_reason is distinct from old.rejection_reason
    or new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'Only admin or controlled server functions can change protected store fields.';
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

  return new;
end;
$$;

drop trigger if exists profiles_protect_admin_fields on public.profiles;

create trigger profiles_protect_admin_fields
before update on public.profiles
for each row
execute function public.protect_profile_admin_fields();

drop trigger if exists stores_protect_admin_fields on public.stores;

create trigger stores_protect_admin_fields
before update on public.stores
for each row
execute function public.protect_store_admin_fields();

create or replace function public.submit_listing_for_publication(p_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_record public.listings;
begin
  select *
  into listing_record
  from public.listings
  where id = p_listing_id;

  if not found then
    raise exception 'Listing not found.';
  end if;

  if listing_record.seller_type = 'individual' then
    if listing_record.owner_user_id is distinct from auth.uid() then
      raise exception 'You cannot publish this listing.';
    end if;
  elsif listing_record.seller_type = 'store' then
    if listing_record.store_id is null
      or not public.is_approved_store_member(listing_record.store_id) then
      raise exception 'Store listings require an approved store membership.';
    end if;
  else
    raise exception 'Unsupported seller type.';
  end if;

  if not public.listing_meets_publish_requirements(p_listing_id) then
    raise exception 'Listing does not meet publication requirements.';
  end if;

  perform set_config('app.allow_listing_admin_fields', 'true', true);

  update public.listings
  set status = 'approved',
      published_at = coalesce(published_at, now()),
      created_by_source = case
        when created_by_source = 'legacy' then 'self_service'
        else created_by_source
      end
  where id = p_listing_id
  returning * into listing_record;

  return listing_record;
end;
$$;

create or replace function public.increment_listing_view_count(p_listing_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_view_count integer;
begin
  perform set_config('app.allow_listing_admin_fields', 'true', true);

  update public.listings
  set view_count = coalesce(view_count, 0) + 1
  where id = p_listing_id
    and status = 'approved'
  returning view_count into next_view_count;

  return next_view_count;
end;
$$;

alter table public.profiles enable row level security;
alter table public.store_members enable row level security;

drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Admins can read profiles" on public.profiles;
drop policy if exists "Admins can update profiles" on public.profiles;

create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and account_type in ('seller', 'store_owner')
);

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Admins can read profiles"
on public.profiles
for select
to authenticated
using (public.is_admin());

create policy "Admins can update profiles"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Store members can read own memberships" on public.store_members;
drop policy if exists "Store owners can read store memberships" on public.store_members;
drop policy if exists "Admins can manage store memberships" on public.store_members;

create policy "Store members can read own memberships"
on public.store_members
for select
to authenticated
using (user_id = auth.uid());

create policy "Store owners can read store memberships"
on public.store_members
for select
to authenticated
using (public.is_store_owner(store_id));

create policy "Admins can manage store memberships"
on public.store_members
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Store owners can read own stores" on public.stores;
drop policy if exists "Authenticated users can insert own pending stores" on public.stores;
drop policy if exists "Store members can update store profile fields" on public.stores;

create policy "Store owners can read own stores"
on public.stores
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_store_member(id)
);

create policy "Authenticated users can insert own pending stores"
on public.stores
for insert
to authenticated
with check (
  status = 'pending'
  and listing_plan = 'free'
  and owner_user_id = auth.uid()
);

create policy "Store members can update store profile fields"
on public.stores
for update
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_store_member(id)
)
with check (
  owner_user_id = auth.uid()
  or public.is_store_member(id)
);

drop policy if exists "Owners can read own listings" on public.listings;
drop policy if exists "Authenticated users can insert own individual listings" on public.listings;
drop policy if exists "Approved store members can insert store listings" on public.listings;
drop policy if exists "Listing managers can update own listings" on public.listings;

create policy "Owners can read own listings"
on public.listings
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or (
    store_id is not null
    and public.is_store_member(store_id)
  )
);

create policy "Authenticated users can insert own individual listings"
on public.listings
for insert
to authenticated
with check (
  seller_type = 'individual'
  and store_id is null
  and owner_user_id = auth.uid()
  and status = 'pending'
);

create policy "Approved store members can insert store listings"
on public.listings
for insert
to authenticated
with check (
  seller_type = 'store'
  and store_id is not null
  and public.is_approved_store_member(store_id)
  and owner_user_id = auth.uid()
  and status = 'pending'
);

create policy "Listing managers can update own listings"
on public.listings
for update
to authenticated
using (public.can_manage_listing(id))
with check (public.can_manage_listing(id));

drop policy if exists "Listing managers can read own listing photos" on public.listing_photos;
drop policy if exists "Listing managers can insert own listing photos" on public.listing_photos;
drop policy if exists "Listing managers can update own listing photos" on public.listing_photos;

create policy "Listing managers can read own listing photos"
on public.listing_photos
for select
to authenticated
using (public.can_manage_listing(listing_id));

create policy "Listing managers can insert own listing photos"
on public.listing_photos
for insert
to authenticated
with check (public.can_manage_listing(listing_id));

create policy "Listing managers can update own listing photos"
on public.listing_photos
for update
to authenticated
using (public.can_manage_listing(listing_id))
with check (public.can_manage_listing(listing_id));

drop policy if exists "Authenticated users can upload listing photos under own folder" on storage.objects;
drop policy if exists "Authenticated users can upload store assets under own folder" on storage.objects;

create policy "Authenticated users can upload listing photos under own folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'listing-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Authenticated users can upload store assets under own folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'store-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.store_members to authenticated;
grant update on public.store_members to authenticated;
grant select, insert, update on public.stores to authenticated;
grant select, insert, update on public.listings to authenticated;
grant select, insert, update on public.listing_photos to authenticated;

grant execute on function public.handle_new_auth_user() to authenticated;
grant execute on function public.is_store_member(uuid) to authenticated;
grant execute on function public.is_store_owner(uuid) to authenticated;
grant execute on function public.is_approved_store_member(uuid) to authenticated;
grant execute on function public.can_manage_listing(uuid) to authenticated;
grant execute on function public.listing_meets_publish_requirements(uuid) to authenticated;
grant execute on function public.submit_listing_for_publication(uuid) to authenticated;
grant execute on function public.increment_listing_view_count(uuid) to anon, authenticated;
