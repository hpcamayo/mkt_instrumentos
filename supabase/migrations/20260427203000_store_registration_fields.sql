-- Store registration fields and public store image uploads.

alter table public.stores
add column district text,
add column address text,
add column instagram_url text,
add column facebook_url text,
add column logo_url text,
add column banner_url text;

drop policy if exists "Public can insert pending stores" on public.stores;

create policy "Public can insert pending free stores"
on public.stores
for insert
to anon, authenticated
with check (
  status = 'pending'
  and listing_plan = 'free'
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'store-assets',
  'store-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public can read store assets"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'store-assets');

create policy "Public can upload store assets"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'store-assets');
