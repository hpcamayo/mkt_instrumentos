-- Initial MVP marketplace schema.
-- Scope: stores, listings, and listing photos only.
-- Excludes payments, subscriptions, orders, reviews, shipping, and chat.

create extension if not exists pgcrypto;

create type public.seller_type as enum (
  'individual',
  'store'
);

create type public.listing_status as enum (
  'pending',
  'approved',
  'rejected',
  'hidden',
  'sold'
);

create type public.store_status as enum (
  'pending',
  'active',
  'hidden'
);

create type public.store_listing_plan as enum (
  'free',
  'starter_20',
  'growth_50',
  'pro_100'
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  status public.store_status not null default 'pending',
  listing_plan public.store_listing_plan not null default 'free',
  contact_name text,
  whatsapp_phone text not null,
  city text not null,
  region text not null default 'Peru',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stores_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores (id) on delete set null,
  seller_type public.seller_type not null,
  status public.listing_status not null default 'pending',
  title text not null,
  slug text not null unique,
  description text,
  category text not null,
  brand text,
  model text,
  condition text,
  price_pen integer,
  city text not null,
  region text not null default 'Peru',
  contact_name text,
  whatsapp_phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint listings_price_non_negative check (price_pen is null or price_pen >= 0),
  constraint listings_seller_store_match check (
    (seller_type = 'individual' and store_id is null)
    or
    (seller_type = 'store' and store_id is not null)
  )
);

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  image_url text not null,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_photos_sort_order_non_negative check (sort_order >= 0)
);

create index stores_status_idx on public.stores (status);
create index stores_listing_plan_idx on public.stores (listing_plan);
create index stores_city_idx on public.stores (city);
create index stores_region_idx on public.stores (region);
create index stores_created_at_idx on public.stores (created_at desc);
create index stores_search_idx on public.stores using gin (
  to_tsvector('spanish', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(city, ''))
);

create index listings_status_idx on public.listings (status);
create index listings_seller_type_idx on public.listings (seller_type);
create index listings_store_id_idx on public.listings (store_id);
create index listings_category_idx on public.listings (category);
create index listings_brand_idx on public.listings (brand);
create index listings_city_idx on public.listings (city);
create index listings_region_idx on public.listings (region);
create index listings_price_pen_idx on public.listings (price_pen);
create index listings_created_at_idx on public.listings (created_at desc);
create index listings_search_idx on public.listings using gin (
  to_tsvector(
    'spanish',
    coalesce(title, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(category, '') || ' ' ||
    coalesce(brand, '') || ' ' ||
    coalesce(model, '') || ' ' ||
    coalesce(city, '')
  )
);

create index listing_photos_listing_id_idx on public.listing_photos (listing_id);
create index listing_photos_sort_order_idx on public.listing_photos (listing_id, sort_order);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger stores_set_updated_at
before update on public.stores
for each row
execute function public.set_updated_at();

create trigger listings_set_updated_at
before update on public.listings
for each row
execute function public.set_updated_at();

create trigger listing_photos_set_updated_at
before update on public.listing_photos
for each row
execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
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
  select exists (
    select 1
    from public.listings
    where id = listing_id
      and status = expected_status
  );
$$;

alter table public.stores enable row level security;
alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;

create policy "Public can read active stores"
on public.stores
for select
to anon, authenticated
using (status = 'active');

create policy "Admins can read stores"
on public.stores
for select
to authenticated
using (public.is_admin());

create policy "Public can insert pending stores"
on public.stores
for insert
to anon, authenticated
with check (status = 'pending');

create policy "Admins can update stores"
on public.stores
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Public can read approved listings"
on public.listings
for select
to anon, authenticated
using (status = 'approved');

create policy "Admins can read listings"
on public.listings
for select
to authenticated
using (public.is_admin());

create policy "Public can insert pending listings"
on public.listings
for insert
to anon, authenticated
with check (status = 'pending');

create policy "Admins can update listings"
on public.listings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Public can read photos for approved listings"
on public.listing_photos
for select
to anon, authenticated
using (public.listing_has_status(listing_id, 'approved'));

create policy "Admins can read listing photos"
on public.listing_photos
for select
to authenticated
using (public.is_admin());

create policy "Public can insert photos for pending listings"
on public.listing_photos
for insert
to anon, authenticated
with check (public.listing_has_status(listing_id, 'pending'));

create policy "Admins can update listing photos"
on public.listing_photos
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant usage on schema public to anon, authenticated;

grant select, insert on public.stores to anon, authenticated;
grant select, insert on public.listings to anon, authenticated;
grant select, insert on public.listing_photos to anon, authenticated;

grant update on public.stores to authenticated;
grant update on public.listings to authenticated;
grant update on public.listing_photos to authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.listing_has_status(uuid, public.listing_status) to anon, authenticated;

grant usage on type public.seller_type to anon, authenticated;
grant usage on type public.listing_status to anon, authenticated;
grant usage on type public.store_status to anon, authenticated;
grant usage on type public.store_listing_plan to anon, authenticated;
