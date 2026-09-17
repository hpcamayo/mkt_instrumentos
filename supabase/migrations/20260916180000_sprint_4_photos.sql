-- Existing public/legacy objects remain untouched. New edit assets are private;
-- their durable app URL is publicly served only while referenced by live inventory.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('listing-edit-photos', 'listing-edit-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp']);

-- Initial signed submissions retain their public bucket convention. New edit
-- uploads cannot use that public bucket to bypass proposal privacy.
drop policy "Authenticated users can upload listing photos under own folder" on storage.objects;
create policy "Authenticated users can upload listing photos under own folder"
on storage.objects for insert to authenticated
with check (bucket_id = 'listing-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$');

create policy "Owners append private listing edit photos"
on storage.objects for insert to authenticated
with check (bucket_id = 'listing-edit-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] = 'listing-edits'
  and exists (select 1 from public.listings listing
    where listing.id::text = (storage.foldername(name))[3]
      and public.listing_owner_can_edit(listing.id)));

create table public.listing_photo_cleanup_claims (
  bucket text not null,
  path text not null,
  created_at timestamptz not null default now(),
  primary key(bucket, path)
);
alter table public.listing_photo_cleanup_claims enable row level security;
revoke all on public.listing_photo_cleanup_claims from anon, authenticated;

create or replace function public.listing_photo_set_is_valid(p_listing_id uuid, p_photos jsonb)
returns boolean language plpgsql stable security definer set search_path = public, storage as $$
declare
  listing_owner_id uuid;
  photo jsonb;
  url text;
  object_path text;
  object_bucket text;
begin
  select owner_user_id into listing_owner_id from public.listings where id = p_listing_id;
  if listing_owner_id is distinct from auth.uid() and not public.is_admin() then return false; end if;
  if p_photos is null or jsonb_typeof(p_photos) <> 'array' then return false; end if;
  if jsonb_array_length(p_photos) not between 2 and 10 then return false; end if;
  if (select count(distinct item->>'image_url') <> count(*) from jsonb_array_elements(p_photos) item) then return false; end if;
  for photo in select value from jsonb_array_elements(p_photos) loop
    url := photo->>'image_url';
    if jsonb_typeof(photo) <> 'object' or nullif(trim(url), '') is null then return false; end if;
    if exists (select 1 from public.listing_photos where listing_id = p_listing_id and image_url = url)
      or exists (select 1 from public.listing_revision_photos proposed
        join public.listing_revisions revision on revision.id = proposed.revision_id
        where revision.listing_id = p_listing_id and revision.status = 'pending'
          and revision.owner_user_id = listing_owner_id and proposed.image_url = url) then
      continue;
    end if;
    -- Only the owner can introduce uploads; admin promotion uses pending refs above.
    if listing_owner_id is distinct from auth.uid() then return false; end if;
    if left(url, length('/api/listing-images/')) = '/api/listing-images/' then
      object_bucket := 'listing-edit-photos';
      object_path := substr(url, length('/api/listing-images/') + 1);
    else return false;
    end if;
    if object_path !~ ('^' || listing_owner_id::text || '/listing-edits/' || p_listing_id::text
      || '/[0-9a-f-]{36}/[0-9]{1,2}[.](jpg|png|webp)$') then return false; end if;
    if exists (select 1 from public.listing_photo_cleanup_claims where bucket = object_bucket and path = object_path) then return false; end if;
    if not exists (select 1 from storage.objects object
      where object.bucket_id = object_bucket and object.name = object_path
        and object.owner_id = listing_owner_id::text
        and lower(object.metadata->>'mimetype') in ('image/jpeg', 'image/png', 'image/webp')
        and case when object.metadata->>'size' ~ '^[0-9]+$'
          then (object.metadata->>'size')::numeric between 1 and 5242880 else false end) then return false; end if;
  end loop;
  return true;
end;
$$;

-- Claim under the same listing lock used by editing. A claim permanently prevents
-- subsequent attachment before Storage deletion, avoiding check/delete races.
create function public.claim_listing_photo_cleanup(p_listing_id uuid, p_user_id uuid, p_bucket text, p_paths text[])
returns text[] language plpgsql security definer set search_path = public as $$
declare path text; result text[] := array[]::text[];
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service access required.'; end if;
  if p_bucket not in ('listing-edit-photos', 'listing-photos') or cardinality(p_paths) > 100 then raise exception 'Invalid cleanup scope.'; end if;
  perform 1 from public.listings where id = p_listing_id and owner_user_id = p_user_id for update;
  if not found then raise exception 'Listing not owned.'; end if;
  foreach path in array p_paths loop
    if path !~ ('^' || p_user_id::text || '/listing-edits/' || p_listing_id::text
      || '/[0-9a-f-]{36}/[0-9]{1,2}[.](jpg|png|webp)$') then continue; end if;
    if exists (select 1 from public.listing_photos where
        image_url = '/api/listing-images/' || path or image_url like '%/storage/v1/object/public/listing-photos/' || path)
      or exists (select 1 from public.listing_revision_photos where
        image_url = '/api/listing-images/' || path or image_url like '%/storage/v1/object/public/listing-photos/' || path) then continue; end if;
    insert into public.listing_photo_cleanup_claims(bucket, path) values(p_bucket, path) on conflict do nothing;
    result := array_append(result, path);
  end loop;
  return result;
end;
$$;
revoke all on function public.claim_listing_photo_cleanup(uuid, uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.claim_listing_photo_cleanup(uuid, uuid, text, text[]) to service_role;

create table public.listing_edit_attempts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  attempt_id uuid not null,
  listing_id uuid not null references public.listings(id) on delete cascade,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id, attempt_id)
);
alter table public.listing_edit_attempts enable row level security;
revoke all on public.listing_edit_attempts from anon, authenticated;

alter function public.update_owned_listing(uuid, jsonb, jsonb, jsonb) rename to apply_owned_listing_edit;
revoke all on function public.apply_owned_listing_edit(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
create function public.update_owned_listing(p_listing_id uuid, p_immediate jsonb default '{}'::jsonb,
  p_moderated jsonb default '{}'::jsonb, p_photos jsonb default null, p_attempt_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare receipt public.listing_edit_attempts; payload_hash text; edit_result jsonb;
begin
  perform 1 from public.listings where id = p_listing_id and owner_user_id = auth.uid() for update;
  if not found then raise exception 'LISTING_NOT_OWNED'; end if;
  if p_attempt_id is not null then
    -- Serialize an attempt even if a malicious caller reuses it across listings.
    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_attempt_id::text, 4));
    payload_hash := encode(sha256(convert_to(jsonb_build_array(p_listing_id, p_immediate, p_moderated, p_photos)::text, 'UTF8')), 'hex');
    select * into receipt from public.listing_edit_attempts where user_id = auth.uid() and attempt_id = p_attempt_id;
    if found then
      if receipt.payload_hash <> payload_hash then raise exception 'LISTING_EDIT_RETRY_CHANGED'; end if;
      return receipt.result;
    end if;
  end if;
  edit_result := public.apply_owned_listing_edit(p_listing_id, p_immediate, p_moderated, p_photos);
  if p_attempt_id is not null then
    insert into public.listing_edit_attempts(user_id, attempt_id, listing_id, payload_hash, result)
    values(auth.uid(), p_attempt_id, p_listing_id, payload_hash, edit_result);
  end if;
  return edit_result;
end;
$$;
revoke all on function public.update_owned_listing(uuid, jsonb, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.update_owned_listing(uuid, jsonb, jsonb, jsonb, uuid) to authenticated;

-- An owner-reverted empty proposal has no photo component to retain. Other
-- cancelled/rejected/approved history keeps its references for moderation audit.
create function public.release_empty_revision_photos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status = 'pending'
    and new.resolution_reason = 'El propietario restauró todos los valores aprobados.' then
    delete from public.listing_revision_photos where revision_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.release_empty_revision_photos() from public, anon, authenticated;
create trigger listing_revisions_release_empty_photos after update on public.listing_revisions
for each row execute function public.release_empty_revision_photos();
