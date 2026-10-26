-- safe-06 «Reseñas con fotos» (docs/feature-ideas/deal-trust.md, FD-deal-trust-6 and 7).
--
-- A buyer's review of a verified transaction can carry up to three photos of what arrived. They use the listing photo
-- pipeline (the browser redraws each one as a JPEG of at most 2400 px, which drops EXIF and GPS) but go to a private
-- bucket, and every photo waits for Admin before anyone else sees it: a photo appears only when Admin approved it and
-- its review is visible (both reviews in, or the window closed). The site serves them through
-- app/api/review-photos/[id], which asks get_review_photo_object who may see each one.

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('review-photos', 'review-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- <buyer id>/<transaction id>/<uuid>.jpg, only for the caller's own purchase while its review window is open, and at
-- most twelve objects per purchase (three photos plus retries and replacements).
create or replace function public.review_photo_upload_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select auth.uid() is not null
    and coalesce(array_length(storage.foldername(p_name), 1), 0) = 2
    and (storage.foldername(p_name))[1] = auth.uid()::text
    and (storage.foldername(p_name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and storage.filename(p_name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    and exists (
      select 1 from public.verified_transactions t
      where t.id = ((storage.foldername(p_name))[2])::uuid
        and t.buyer_user_id = auth.uid()
        and t.review_deadline > now()
    )
    and (
      select count(*) from storage.objects o
      where o.bucket_id = 'review-photos'
        and left(o.name, 74) = left(p_name, 74)
    ) < 12
$$;

revoke all on function public.review_photo_upload_allowed(text) from public, anon;
grant execute on function public.review_photo_upload_allowed(text) to authenticated, service_role;

drop policy if exists "Buyers upload review photos for their purchases" on storage.objects;
create policy "Buyers upload review photos for their purchases"
on storage.objects for insert to authenticated
with check (bucket_id = 'review-photos' and public.review_photo_upload_allowed(name));

create table public.transaction_review_photos (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.transaction_reviews(id) on delete restrict,
  storage_path text not null unique check (char_length(storage_path) between 40 and 200),
  sort_order smallint not null check (sort_order between 0 and 2),
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  created_at timestamptz not null default now(),
  moderated_at timestamptz,
  moderated_by uuid references public.profiles(id) on delete restrict,
  moderation_reason text check (moderation_reason is null or char_length(moderation_reason) between 3 and 500),
  constraint transaction_review_photos_order unique (review_id, sort_order),
  constraint transaction_review_photos_moderation check ((status = 'pending') = (moderated_at is null and moderated_by is null))
);

create index transaction_review_photos_queue_idx on public.transaction_review_photos(status, created_at);

alter table public.transaction_review_photos enable row level security;
revoke all on public.transaction_review_photos from anon, authenticated;

-- Approved photos of one review, for the public review lists ({id} each; the image is /api/review-photos/<id>).
create or replace function laria_private.review_photo_items(p_review_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', photo.id) order by photo.sort_order), '[]'::jsonb)
  from public.transaction_review_photos photo
  where photo.review_id = p_review_id and photo.status = 'approved'
$$;

revoke all on function laria_private.review_photo_items(uuid) from public, anon, authenticated;

-- Called right after submit_transaction_review with the paths the browser uploaded. Works for a day after the review
-- was sent, so a dropped connection can retry; sending the same paths again changes nothing.
create or replace function public.attach_review_photos(p_review_id uuid, p_paths text[])
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  me uuid := auth.uid();
  review public.transaction_reviews;
  existing integer;
  path text;
  next_order integer;
  object_row storage.objects;
begin
  if me is null then raise exception using errcode = '42501', message = 'REVIEW_AUTH_REQUIRED'; end if;
  select * into review from public.transaction_reviews where id = p_review_id for update;
  if not found or review.reviewer_user_id <> me then raise exception 'REVIEW_PHOTO_REVIEW_INVALID'; end if;
  if review.direction <> 'buyer_to_seller' then raise exception 'REVIEW_PHOTO_BUYER_ONLY'; end if;
  if review.submitted_at < now() - interval '24 hours' then raise exception 'REVIEW_PHOTO_WINDOW_CLOSED'; end if;
  if p_paths is null or cardinality(p_paths) = 0 then
    return public.get_my_review_photos(review.transaction_id);
  end if;
  if cardinality(p_paths) > 3 or (select count(distinct value) from unnest(p_paths) value) <> cardinality(p_paths) then
    raise exception 'REVIEW_PHOTO_LIMIT';
  end if;

  foreach path in array p_paths loop
    if exists (select 1 from public.transaction_review_photos where storage_path = path and review_id = review.id) then
      continue;
    end if;
    if path !~ ('^' || me::text || '/' || review.transaction_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$') then
      raise exception 'REVIEW_PHOTO_PATH_INVALID';
    end if;
    select * into object_row from storage.objects o where o.bucket_id = 'review-photos' and o.name = path;
    if not found
       or coalesce(object_row.metadata->>'mimetype', '') not in ('image/jpeg', 'image/png', 'image/webp')
       or coalesce((object_row.metadata->>'size')::bigint, 0) not between 1 and 5242880 then
      raise exception 'REVIEW_PHOTO_UPLOAD_MISSING';
    end if;
    select count(*), coalesce(max(sort_order) + 1, 0) into existing, next_order
    from public.transaction_review_photos where review_id = review.id;
    if existing >= 3 then raise exception 'REVIEW_PHOTO_LIMIT'; end if;
    insert into public.transaction_review_photos(review_id, storage_path, sort_order)
    values (review.id, path, least(next_order, 2));
  end loop;
  return public.get_my_review_photos(review.transaction_id);
end;
$$;

-- The reviewer's own photos with their moderation state, for the transaction page.
create or replace function public.get_my_review_photos(p_transaction_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', photo.id, 'status', photo.status) order by photo.sort_order), '[]'::jsonb)
  from public.transaction_review_photos photo
  join public.transaction_reviews review on review.id = photo.review_id
  where review.transaction_id = p_transaction_id and review.reviewer_user_id = auth.uid()
$$;

revoke all on function public.get_my_review_photos(uuid) from public, anon;
grant execute on function public.get_my_review_photos(uuid) to authenticated, service_role;
revoke all on function public.attach_review_photos(uuid, text[]) from public, anon;
grant execute on function public.attach_review_photos(uuid, text[]) to authenticated, service_role;

-- Who may see one photo. "public": approved and its review visible (anyone). "private": the reviewer or Admin.
create or replace function public.get_review_photo_object(p_photo_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when photo.status = 'approved' and review.admin_hidden_at is null and laria_private.review_is_visible(review.id)
      then jsonb_build_object('path', photo.storage_path, 'access', 'public')
    when auth.uid() is not null and (review.reviewer_user_id = auth.uid() or public.is_admin())
      then jsonb_build_object('path', photo.storage_path, 'access', 'private')
  end
  from public.transaction_review_photos photo
  join public.transaction_reviews review on review.id = photo.review_id
  where photo.id = p_photo_id
$$;

revoke all on function public.get_review_photo_object(uuid) from public;
grant execute on function public.get_review_photo_object(uuid) to anon, authenticated, service_role;

-- Admin > Confianza > Fotos de reseñas.
create or replace function public.get_admin_review_photo_queue(p_status text default 'pending', p_page integer default 1, p_page_size integer default 24)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform laria_private.assert_admin();
  if p_status not in ('pending', 'approved', 'hidden') or p_page is null or p_page < 1
     or p_page_size is null or p_page_size not between 1 and 100 then
    raise exception 'PAGE_INVALID';
  end if;
  select jsonb_build_object(
    'total', (select count(*) from public.transaction_review_photos where status = p_status),
    'items', coalesce((select jsonb_agg(item order by (item->>'created_at')::timestamptz) from (
      select jsonb_build_object(
        'id', photo.id, 'status', photo.status, 'created_at', photo.created_at, 'moderation_reason', photo.moderation_reason,
        'review_id', review.id, 'transaction_id', review.transaction_id, 'rating', review.rating, 'comment', review.comment,
        'review_hidden', review.admin_hidden_at is not null,
        'reviewer_name', reviewer.full_name,
        'subject_name', coalesce(st.name, subject.full_name)
      ) item
      from public.transaction_review_photos photo
      join public.transaction_reviews review on review.id = photo.review_id
      join public.profiles reviewer on reviewer.id = review.reviewer_user_id
      left join public.stores st on st.id = review.subject_store_id
      left join public.profiles subject on subject.id = review.subject_user_id
      where photo.status = p_status
      order by photo.created_at
      limit p_page_size offset (p_page - 1) * p_page_size) page), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_admin_review_photo_queue(text, integer, integer) from public, anon;
grant execute on function public.get_admin_review_photo_queue(text, integer, integer) to authenticated, service_role;

create or replace function public.moderate_review_photo(p_photo_id uuid, p_status text, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  photo public.transaction_review_photos;
  clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform laria_private.assert_admin();
  if p_status not in ('approved', 'hidden') then raise exception 'REVIEW_PHOTO_STATUS_INVALID'; end if;
  if p_status = 'hidden' and (clean_reason is null or char_length(clean_reason) not between 3 and 500) then
    raise exception 'REVIEW_PHOTO_REASON_REQUIRED';
  end if;
  select * into photo from public.transaction_review_photos where id = p_photo_id for update;
  if not found then raise exception 'REVIEW_PHOTO_NOT_FOUND'; end if;
  update public.transaction_review_photos
  set status = p_status, moderated_at = now(), moderated_by = auth.uid(), moderation_reason = clean_reason
  where id = photo.id;
  perform laria_private.record_admin_audit('review_photo_' || p_status, 'review', photo.review_id,
    jsonb_build_object('photo_id', photo.id, 'from', photo.status, 'reason', clean_reason));
  return p_status;
end;
$$;

revoke all on function public.moderate_review_photo(uuid, text, text) from public, anon;
grant execute on function public.moderate_review_photo(uuid, text, text) to authenticated, service_role;

-- Uploads that never got attached to a review (the buyer left the form). The nightly job route removes them through
-- the Storage API, which deletes the file too; a row in storage.objects is never deleted from SQL.
create or replace function public.list_orphan_review_photos(p_limit integer default 200)
returns text[]
language sql
stable
security definer
set search_path = public, storage
as $$
  select coalesce(array_agg(name), '{}') from (
    select o.name from storage.objects o
    where o.bucket_id = 'review-photos'
      and o.created_at < now() - interval '2 days'
      and not exists (select 1 from public.transaction_review_photos photo where photo.storage_path = o.name)
    order by o.created_at
    limit least(greatest(coalesce(p_limit, 200), 1), 1000)
  ) orphan
$$;

revoke all on function public.list_orphan_review_photos(integer) from public, anon, authenticated;
grant execute on function public.list_orphan_review_photos(integer) to service_role;
