-- Public listing photo uploads for pending MVP submissions.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'listing-photos',
  'listing-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public can read listing photos"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'listing-photos');

create policy "Public can upload listing photos"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'listing-photos');
