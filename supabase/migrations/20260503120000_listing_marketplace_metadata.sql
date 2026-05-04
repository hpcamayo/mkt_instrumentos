-- Marketplace listing metadata for future filtering and ranking.
-- Existing rows keep working because the new fields are nullable or have safe defaults.

alter table public.listings
add column if not exists instrument_type text,
add column if not exists attributes jsonb default '{}'::jsonb,
add column if not exists published_at timestamptz,
add column if not exists view_count integer default 0;

update public.listings
set published_at = created_at
where status = 'approved'
  and published_at is null;

create index if not exists listings_instrument_type_idx
on public.listings (instrument_type);

create index if not exists listings_published_at_idx
on public.listings (published_at desc);

create index if not exists listings_view_count_idx
on public.listings (view_count desc);

create index if not exists listings_attributes_gin_idx
on public.listings using gin (attributes);
