-- Launch audit A18 and A20 (26 Oct 2026 audit): a daily upload allowance per account, removal of uploaded files that
-- nothing uses, and anonymising an account on request (Ley 29733, cancelación).
--
-- A18, the allowance: a restrictive policy on storage.objects lets an account add, in 24 hours, at most 120 listing
-- photos (600 for the owner of an active store), 120 photos for listing edits, 20 sound clips and 40 store images
-- (laria_private.upload_daily_limit). It counts the account's own files in that bucket created in the last 24 hours,
-- so a file removed meanwhile frees its place. A path that already exists always passes, so a repeated upload still
-- fails as a duplicate, as before. Uploads that run in parallel can each see the last free place, so an account can
-- end a few files over. public.my_upload_allowance tells the forms the limit and when the next place frees up.
--
-- A18, the removal: every day app/api/internal/uploads/sweep takes files of these four buckets that are more than 48
-- hours old, have one of the names the forms give them, and nothing points at
-- (laria_private.upload_references: listing and edit photos, sound clips, store logos, banners and photos, and the
-- photos and sound clips of saved drafts). It queues them in laria_private.upload_removals
-- (public.claim_upload_removals), deletes them through the Storage API and reports them done
-- (public.complete_upload_removals). A file a page points at is never queued: the claim checks each candidate again
-- under a lock on its path, and every place that can point at a file takes the same lock before it does and refuses
-- a queued or removed path (laria_private.guard_upload_attachment, with UPLOAD_REMOVED), so a listing published while
-- the sweep runs either keeps its file or is told to upload it again. A draft kept only on the device has no row, so
-- its photos go after 48 hours, and the sell form drops the missing ones when the draft is restored
-- (app/api/submissions, "renew").
--
-- A20: laria_private.anonymize_account (service role, the self-service deletion of features/marketplace) and
-- public.admin_anonymize_account (Admin with the authenticator code, with a reason written to the Admin audit) run
-- laria_private.anonymize_account_core: the profile becomes "Cuenta eliminada" without phone or city; the Auth user
-- loses e-mail, phone, password, metadata, identities, sessions and factors, and is banned; listings that are not
-- sold are archived and every listing of the account loses its contact name and WhatsApp; the account's stores,
-- never an active one, lose their contact data; favorites, shared lists, follows, alerts, stock watches, drafts,
-- e-mail preferences and deliveries, notifications, push devices, edit attempts, check-ins outside a sale and
-- unanswered questions are deleted; analytics events lose every link to the account. Sales, reviews, reports and
-- Libro de Reclamaciones entries stay: the law keeps some, and the rest are other people's records too. Admin
-- accounts are refused, and so are owners of an active store until Admin hides it. A run is recorded in
-- laria_private.account_anonymizations, and running it again is harmless. When features/marketplace adds
-- laria_private.anonymize_account_feature_data(uuid), the core calls it as well.
--
-- Retention for the privacy notice: every day at 09:45 UTC a pg_cron job (marketplace-event-retention) removes the
-- account, session and identity of browsing events (views, impressions, searches, filters, favorites) after 90 days
-- and of every other event after 365 days, so the counts stay and nothing in them leads back to a person. A clock row
-- keeps each run from reading the rows an earlier run already cleared.
--
-- Compatibility: the app before this change calls none of the new functions; the policy and the guards apply at once,
-- whichever app is deployed.
-- Locks: the policy needs an ACCESS EXCLUSIVE lock on storage.objects and each guard a SHARE ROW EXCLUSIVE lock on its
-- table, held until commit. Writers take these tables in many orders, so the first statement takes all seven locks at
-- once without waiting: while one is held it lets go of the others and tries again a moment later, and after 30
-- seconds it fails and can be run again. From then on the migration waits for no writer. While it runs, uploads and
-- photo reads through Storage wait for it (well under a second).
-- Rollback: unschedule marketplace-event-retention, then drop the policy, the six guard triggers, the functions and
-- the four tables.

set lock_timeout = '10s';

do $$
declare
  give_up timestamptz := clock_timestamp() + interval '30 seconds';
begin
  loop
    begin
      lock table storage.objects, public.admin_audit_actions in access exclusive mode nowait;
      lock table public.listing_photos, public.listing_revision_photos, public.listing_sound_clips, public.listing_drafts,
        public.store_photos, public.stores
      in share row exclusive mode nowait;
      exit;
    exception when lock_not_available then
      if clock_timestamp() > give_up then
        raise exception using errcode = 'lock_not_available',
          message = 'PRIVACY_TABLES_BUSY: the tables this migration changes stayed busy for 30 seconds; run it again.';
      end if;
      perform pg_sleep(0.02 + random() * 0.08);
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------- A18: the allowance

-- Files an account may add to a bucket in 24 hours; null for a bucket without a limit.
create or replace function laria_private.upload_daily_limit(p_bucket text, p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case p_bucket
    when 'listing-photos' then case when exists (
        select 1 from public.stores s where s.owner_user_id = p_user_id and s.status = 'active') then 600 else 120 end
    when 'listing-edit-photos' then 120
    when 'listing-sound-clips' then 20
    when 'store-assets' then 40
  end;
$$;

-- Every bucket these forms write keeps an account's files under a folder named after it (the upload policies).
create or replace function laria_private.upload_window(p_bucket text, p_user_id uuid)
returns table (used integer, oldest timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer, min(o.created_at)
  from storage.objects o
  where o.bucket_id = p_bucket and o.name like p_user_id::text || '/%' and o.created_at > now() - interval '24 hours';
$$;

-- The restrictive upload policy's check. A path that exists already passes: the upload then fails as a duplicate.
create or replace function public.storage_upload_allowed(p_bucket text, p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  upload_limit integer;
begin
  if uid is null then return true; end if;
  upload_limit := laria_private.upload_daily_limit(p_bucket, uid);
  if upload_limit is null then return true; end if;
  if exists (select 1 from storage.objects o where o.bucket_id = p_bucket and o.name = p_name) then return true; end if;
  return (select w.used from laria_private.upload_window(p_bucket, uid) w) < upload_limit;
end;
$$;

-- For the forms: the caller's limit in a bucket, how many places are used, and, once none is left, when the oldest
-- counted file leaves the 24 hours.
create or replace function public.my_upload_allowance(p_bucket text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  upload_limit integer;
  window_used integer;
  next_at timestamptz;
begin
  if uid is null then raise exception using errcode = '42501', message = 'Not allowed.'; end if;
  upload_limit := laria_private.upload_daily_limit(p_bucket, uid);
  if upload_limit is null then return jsonb_build_object('bucket', p_bucket, 'limit', null); end if;
  select w.used into window_used from laria_private.upload_window(p_bucket, uid) w;
  if window_used >= upload_limit then
    select o.created_at + interval '24 hours' into next_at
    from storage.objects o
    where o.bucket_id = p_bucket and o.name like uid::text || '/%' and o.created_at > now() - interval '24 hours'
    order by o.created_at
    offset window_used - upload_limit
    limit 1;
  end if;
  return jsonb_build_object('bucket', p_bucket, 'limit', upload_limit, 'used', window_used, 'next_at', next_at);
end;
$$;

revoke all on function laria_private.upload_daily_limit(text, uuid), laria_private.upload_window(text, uuid)
from public, anon, authenticated;
revoke all on function public.storage_upload_allowed(text, text), public.my_upload_allowance(text) from public, anon;
grant execute on function public.storage_upload_allowed(text, text), public.my_upload_allowance(text) to authenticated;

drop policy if exists "Daily upload allowance" on storage.objects;
create policy "Daily upload allowance"
on storage.objects
as restrictive
for insert
to authenticated
with check (public.storage_upload_allowed(bucket_id, name));

-- ------------------------------------------------------------------------------------------------ A18: the removal

create table if not exists laria_private.upload_removals (
  -- Any bucket: the sweep finds files of four, and laria_private.anonymize_account_feature_data may queue others.
  bucket text not null check (length(bucket) between 3 and 63),
  path text not null check (length(path) between 3 and 300),
  queued_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (bucket, path)
);
revoke all on laria_private.upload_removals from public, anon, authenticated;

-- The file a stored address points at: a public address of a bucket the sweep covers, or the route that serves private
-- edit photos. Nothing for any other address (another site, an import photo).
create or replace function laria_private.upload_ref(p_url text)
returns table (bucket text, path text)
language sql
immutable
set search_path = ''
as $$
  select m[1], m[2]
  from regexp_match(coalesce(p_url, ''),
    '/storage/v1/object/public/(listing-photos|listing-sound-clips|store-assets)/([^?#]+)$') m
  where m is not null
  union all
  select 'listing-edit-photos', substr(p_url, length('/api/listing-images/') + 1)
  where p_url ~ '^/api/listing-images/[0-9a-f-]{36}/listing-edits/';
$$;

-- Every file something points at. A new place that keeps a file of these buckets belongs here, and gets
-- laria_private.guard_upload_attachment (docs/database.md, "Launch audit: privacy").
create or replace view laria_private.upload_references as
  select r.bucket, r.path from public.listing_photos p cross join lateral laria_private.upload_ref(p.image_url) r
  union all
  select r.bucket, r.path from public.listing_revision_photos p cross join lateral laria_private.upload_ref(p.image_url) r
  union all
  select r.bucket, r.path from public.listing_sound_clips c cross join lateral laria_private.upload_ref(c.clip_url) r
  union all
  select r.bucket, r.path from public.store_photos p cross join lateral laria_private.upload_ref(p.image_url) r
  union all
  select r.bucket, r.path from public.stores s cross join lateral laria_private.upload_ref(s.logo_url) r
  union all
  select r.bucket, r.path from public.stores s cross join lateral laria_private.upload_ref(s.banner_url) r
  union all
  select 'listing-photos', photo.value ->> 'path' from public.listing_drafts d
    cross join lateral jsonb_array_elements(d.photos) photo
  union all
  select 'listing-sound-clips', d.sound_clip ->> 'path' from public.listing_drafts d where d.sound_clip is not null
  union all
  -- Edit photos another cleanup removes already (app/api/listings/[id]/photo-cleanup).
  select c.bucket, c.path from public.listing_photo_cleanup_claims c;
revoke all on laria_private.upload_references from public, anon, authenticated;

-- The names the forms give files (lib/public-submission.ts, components/selling, components/listing-edit-form.tsx,
-- components/store-registration-form.tsx); anything else in these buckets is never removed.
create or replace function laria_private.upload_is_sweepable(p_bucket text, p_path text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(case p_bucket
    when 'listing-photos' then p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(?:[0-9]|[1-9][0-9])\.(jpg|png|webp)$'
    when 'listing-sound-clips' then p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/sonido-[0-9]{1,3}\.(webm|ogg|m4a|wav)$'
    when 'store-assets' then p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(?:(?:[0-9]|[1-9][0-9])|profile-[0-9]{10,16}-[0-9]{1,2})\.(jpg|png|webp)$'
    when 'listing-edit-photos' then p_path ~ '^[0-9a-f-]{36}/listing-edits/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9]{1,2}\.(jpg|png|webp)$'
  end, false);
$$;

-- One lock per file, taken by the claim and by every place that points at a file, in (bucket, path) order.
create or replace function laria_private.lock_upload_path(p_bucket text, p_path text)
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('laria-upload:' || p_bucket || '/' || p_path, 0));
$$;

-- The same lock without waiting: false while another transaction holds it.
create or replace function laria_private.try_lock_upload_path(p_bucket text, p_path text)
returns boolean
language sql
volatile
set search_path = ''
as $$
  select pg_try_advisory_xact_lock(hashtextextended('laria-upload:' || p_bucket || '/' || p_path, 0));
$$;

-- Service role only (app/api/internal/uploads/sweep). Hands out files queued before and not removed yet, else queues
-- up to p_limit new ones and hands them out.
create or replace function public.claim_upload_removals(p_limit integer default 100)
returns table (bucket text, path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_buckets text[];
  found_paths text[];
  locked_buckets text[] := '{}';
  locked_paths text[] := '{}';
  i integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Not allowed.';
  end if;
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception using errcode = '22023', message = 'Invalid limit.';
  end if;
  return query
    select r.bucket, r.path from laria_private.upload_removals r
    where r.removed_at is null
    order by r.bucket, r.path
    limit p_limit;
  if found then return; end if;

  select coalesce(array_agg(c.bucket_id order by c.bucket_id, c.name), '{}'),
    coalesce(array_agg(c.name order by c.bucket_id, c.name), '{}')
  into found_buckets, found_paths
  from (
    select o.bucket_id, o.name
    from storage.objects o
    where o.bucket_id in ('listing-photos', 'listing-edit-photos', 'listing-sound-clips', 'store-assets')
      and o.created_at < now() - interval '48 hours'
      and laria_private.upload_is_sweepable(o.bucket_id, o.name)
      and not exists (select 1 from laria_private.upload_references x where x.bucket = o.bucket_id and x.path = o.name)
      and not exists (select 1 from laria_private.upload_removals r where r.bucket = o.bucket_id and r.path = o.name)
    order by o.bucket_id, o.name
    limit p_limit
  ) c;
  -- A file whose lock another transaction holds is being attached right now: it stays. The claim never waits, so it
  -- can't deadlock with one.
  for i in 1 .. cardinality(found_paths) loop
    if laria_private.try_lock_upload_path(found_buckets[i], found_paths[i]) then
      locked_buckets := locked_buckets || found_buckets[i];
      locked_paths := locked_paths || found_paths[i];
    end if;
  end loop;
  -- Its own statement, so it sees every reference committed before the locks above were taken; a place that points at
  -- one of these files later takes the same lock and then finds it queued.
  return query
    with queued as (
      insert into laria_private.upload_removals (bucket, path)
      select c.bucket, c.path from unnest(locked_buckets, locked_paths) as c (bucket, path)
      where not exists (select 1 from laria_private.upload_references x where x.bucket = c.bucket and x.path = c.path)
      on conflict do nothing
      returning upload_removals.bucket, upload_removals.path
    )
    select q.bucket, q.path from queued q order by q.bucket, q.path;
end;
$$;

-- Service role only: the files Storage removed. Rows removed a month ago are dropped; by then every form has moved on.
create or replace function public.complete_upload_removals(p_bucket text, p_paths text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  done integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Not allowed.';
  end if;
  if p_paths is null or cardinality(p_paths) > 500 then
    raise exception using errcode = '22023', message = 'Invalid paths.';
  end if;
  update laria_private.upload_removals r set removed_at = now()
  where r.bucket = p_bucket and r.path = any (p_paths) and r.removed_at is null;
  get diagnostics done = row_count;
  delete from laria_private.upload_removals r where r.removed_at < now() - interval '30 days';
  return done;
end;
$$;

revoke all on function laria_private.upload_ref(text), laria_private.upload_is_sweepable(text, text),
  laria_private.lock_upload_path(text, text), laria_private.try_lock_upload_path(text, text)
from public, anon, authenticated;
revoke all on function public.claim_upload_removals(integer), public.complete_upload_removals(text, text[])
from public, anon, authenticated;
grant execute on function public.claim_upload_removals(integer), public.complete_upload_removals(text, text[])
to service_role;

-- Every place that points at a file: a file the sweep queued or removed can't be pointed at again.
create or replace function laria_private.guard_upload_attachment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  added text[] := '{}';
  kept text[] := '{}';
  ref record;
begin
  if tg_table_name in ('listing_photos', 'listing_revision_photos', 'store_photos') then
    added := array[new.image_url];
    if tg_op = 'UPDATE' then kept := array[old.image_url]; end if;
  elsif tg_table_name = 'listing_sound_clips' then
    added := array[new.clip_url];
    if tg_op = 'UPDATE' then kept := array[old.clip_url]; end if;
  elsif tg_table_name = 'stores' then
    added := array[new.logo_url, new.banner_url];
    if tg_op = 'UPDATE' then kept := array[old.logo_url, old.banner_url]; end if;
  elsif tg_table_name = 'listing_drafts' then
    select coalesce(array_agg('/storage/v1/object/public/listing-photos/' || (photo.value ->> 'path')), '{}') into added
    from jsonb_array_elements(new.photos) photo;
    if new.sound_clip is not null then
      added := added || ('/storage/v1/object/public/listing-sound-clips/' || (new.sound_clip ->> 'path'));
    end if;
    if tg_op = 'UPDATE' then
      select coalesce(array_agg('/storage/v1/object/public/listing-photos/' || (photo.value ->> 'path')), '{}') into kept
      from jsonb_array_elements(old.photos) photo;
      if old.sound_clip is not null then
        kept := kept || ('/storage/v1/object/public/listing-sound-clips/' || (old.sound_clip ->> 'path'));
      end if;
    end if;
  end if;

  for ref in
    select distinct r.bucket, r.path
    from unnest(added) address cross join lateral laria_private.upload_ref(address) r
    where address is not null and not (address = any (array_remove(kept, null)))
    order by r.bucket, r.path
  loop
    perform laria_private.lock_upload_path(ref.bucket, ref.path);
    if exists (select 1 from laria_private.upload_removals u where u.bucket = ref.bucket and u.path = ref.path) then
      raise exception using errcode = 'P0001',
        message = 'UPLOAD_REMOVED: Una de las fotos ya no está guardada en Laria. Vuelve a subirla.';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function laria_private.guard_upload_attachment() from public, anon, authenticated;

create or replace trigger listing_photos_guard_upload
before insert or update of image_url on public.listing_photos
for each row execute function laria_private.guard_upload_attachment();

create or replace trigger listing_revision_photos_guard_upload
before insert or update of image_url on public.listing_revision_photos
for each row execute function laria_private.guard_upload_attachment();

create or replace trigger listing_sound_clips_guard_upload
before insert or update of clip_url on public.listing_sound_clips
for each row execute function laria_private.guard_upload_attachment();

create or replace trigger store_photos_guard_upload
before insert or update of image_url on public.store_photos
for each row execute function laria_private.guard_upload_attachment();

create or replace trigger stores_guard_upload
before insert or update of logo_url, banner_url on public.stores
for each row execute function laria_private.guard_upload_attachment();

create or replace trigger listing_drafts_guard_upload
before insert or update of photos, sound_clip on public.listing_drafts
for each row execute function laria_private.guard_upload_attachment();

-- --------------------------------------------------------------------------------------- A20: anonymising an account

create table if not exists laria_private.account_anonymizations (
  user_id uuid primary key,
  first_anonymized_at timestamptz not null default now(),
  last_anonymized_at timestamptz not null default now(),
  reason text check (reason is null or length(reason) <= 500),
  -- The Admin who asked; null when the account asked itself (self-service deletion) or the service did.
  requested_by uuid,
  counts jsonb not null default '{}'::jsonb check (jsonb_typeof(counts) = 'object')
);
revoke all on laria_private.account_anonymizations from public, anon, authenticated;

-- The Auth side: no e-mail, phone, password, metadata or pending link; identities, sessions, refresh tokens, factors
-- and one-time tokens deleted; banned, so neither a sign-in nor a token refresh works. The access token already
-- issued lasts until it expires (an hour at most). Supabase's own soft delete (auth.admin.deleteUser(id, true)) may
-- run after this one, and finds nothing left to clear. Tables the migration role can't write here are skipped.
create or replace function laria_private.anonymize_auth_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  counts jsonb := '{}'::jsonb;
  done integer;
  token_column text;
  target text;
begin
  update auth.users set email = null, phone = null, encrypted_password = '', raw_user_meta_data = '{}'::jsonb,
    banned_until = timestamptz '2999-12-31 00:00:00+00', deleted_at = coalesce(deleted_at, now()), updated_at = now()
  where id = p_user_id;
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('users', done);
  -- Supabase reads these as text, so they are emptied, never nulled.
  for token_column in
    select c.column_name::text from information_schema.columns c
    where c.table_schema = 'auth' and c.table_name = 'users'
      and c.column_name in ('confirmation_token', 'recovery_token', 'email_change', 'email_change_token_new',
        'email_change_token_current', 'phone_change', 'phone_change_token', 'reauthentication_token')
    order by c.column_name
  loop
    execute format('update auth.users set %I = %L where id = $1', token_column, '') using p_user_id;
  end loop;
  foreach target in array array['identities', 'sessions', 'refresh_tokens', 'mfa_factors', 'one_time_tokens', 'flow_state']
  loop
    if to_regclass('auth.' || target) is not null and has_table_privilege('auth.' || target, 'DELETE') then
      execute format('delete from auth.%I where user_id = $1::%s', target,
        case when target = 'refresh_tokens' then 'text' else 'uuid' end) using p_user_id::text;
      get diagnostics done = row_count;
      counts := counts || jsonb_build_object(target, done);
    end if;
  end loop;
  if to_regclass('auth.audit_log_entries') is not null and has_table_privilege('auth.audit_log_entries', 'DELETE') then
    execute 'delete from auth.audit_log_entries where payload ->> ''actor_id'' = $1' using p_user_id::text;
    get diagnostics done = row_count;
    counts := counts || jsonb_build_object('audit_log_entries', done);
  end if;
  return counts;
end;
$$;

create or replace function laria_private.anonymize_account_core(p_user_id uuid, p_reason text, p_requested_by uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  counts jsonb := '{}'::jsonb;
  done integer;
  listing_bypass text := coalesce(current_setting('app.allow_listing_admin_fields', true), '');
  store_bypass text := coalesce(current_setting('app.allow_store_admin_fields', true), '');
  stores_owned uuid[];
  feature_counts jsonb;
begin
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ANONYMIZE_ACCOUNT_NOT_FOUND: No encontramos esa cuenta.';
  end if;
  if exists (select 1 from auth.users u where u.id = p_user_id and u.raw_app_meta_data ->> 'role' = 'admin') then
    raise exception using errcode = 'P0001',
      message = 'ANONYMIZE_ADMIN: Una cuenta Admin no se anonimiza. Quítale el rol primero.';
  end if;
  if exists (select 1 from public.stores s where s.owner_user_id = p_user_id and s.status = 'active') then
    raise exception using errcode = 'P0001',
      message = 'ANONYMIZE_ACTIVE_STORE: Esta cuenta administra una Tienda activa. Ocúltala antes de anonimizar la cuenta.';
  end if;
  select coalesce(array_agg(s.id order by s.id), '{}') into stores_owned
  from public.stores s where s.owner_user_id = p_user_id;

  -- Listings: those not sold leave the marketplace; none keeps a contact (sold ones stay as the record of the sale,
  -- under "Cuenta eliminada").
  perform set_config('app.allow_listing_admin_fields', 'true', true);
  update public.listings l
  set status = 'archived', archived_at = coalesce(l.archived_at, now())
  where (l.owner_user_id = p_user_id or l.store_id = any (stores_owned)) and l.status not in ('sold', 'archived');
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('listings_archived', done);
  update public.listings l
  set contact_name = null, whatsapp_phone = ''
  where (l.owner_user_id = p_user_id or l.store_id = any (stores_owned))
    and (l.contact_name is not null or l.whatsapp_phone <> '');
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('listings_scrubbed', done);
  perform set_config('app.allow_listing_admin_fields', listing_bypass, true);

  update public.listing_revisions r
  set status = 'cancelled', resolution_reason = 'Cuenta eliminada', reviewed_at = coalesce(r.reviewed_at, now())
  where r.owner_user_id = p_user_id and r.status = 'pending';
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('revisions_cancelled', done);

  -- Stores (none active): an application under review is rejected; each loses the person's contact data. Its RUC and
  -- business name stay: they belong to the business, not to the person.
  if cardinality(stores_owned) > 0 then
    perform set_config('app.allow_store_admin_fields', 'true', true);
    update public.stores s
    set status = case when s.status = 'pending' then 'rejected'::public.store_status else s.status end,
      rejection_reason = case when s.status = 'pending' then 'Cuenta eliminada' else s.rejection_reason end,
      contact_name = null, contact_person = null, email = null, whatsapp_phone = '', address = null, show_address = false
    where s.id = any (stores_owned);
    get diagnostics done = row_count;
    counts := counts || jsonb_build_object('stores_scrubbed', done);
    perform set_config('app.allow_store_admin_fields', store_bypass, true);
    -- Their payment methods are withdrawn without the holder's name or the owner's note. The method history is an
    -- append-only record of what Admin decided, and keeps what it recorded.
    update public.store_payment_methods m
    set status = 'withdrawn', holder_name = null, owner_note = null, reviewed_at = null, reviewed_by = null
    where m.store_id = any (stores_owned)
      and (m.status <> 'withdrawn' or m.holder_name is not null or m.owner_note is not null);
    get diagnostics done = row_count;
    counts := counts || jsonb_build_object('payment_methods_withdrawn', done);
  end if;
  delete from public.store_members where user_id = p_user_id;
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('store_memberships', done);

  delete from public.favorites where user_id = p_user_id;
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('favorites', done);
  delete from public.favorite_shares where user_id = p_user_id;
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('favorite_shares', done);
  delete from public.follows where user_id = p_user_id;
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('follows', done);
  delete from laria_private.search_alert_matches where user_id = p_user_id;
  delete from public.saved_search_alerts where user_id = p_user_id;
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('saved_search_alerts', done);
  delete from public.listing_stock_watches where user_id = p_user_id;
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('stock_watches', done);
  delete from public.listing_drafts where owner_user_id = p_user_id;
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('drafts', done);
  delete from public.listing_edit_attempts where user_id = p_user_id;
  delete from public.email_preferences where user_id = p_user_id;
  delete from laria_private.marketplace_email_deliveries where recipient_user_id = p_user_id;
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('email_deliveries', done);
  delete from laria_private.push_deliveries where user_id = p_user_id;
  delete from public.notifications where user_id = p_user_id;
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('notifications', done);
  delete from laria_private.push_subscriptions where user_id = p_user_id;
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('push_devices', done);
  delete from public.purchase_checkins
  where (buyer_user_id = p_user_id or seller_user_id = p_user_id) and claim_id is null;
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('purchase_checkins', done);
  -- A reported question stays for the report.
  delete from public.listing_questions q
  where q.asker_user_id = p_user_id and q.answer is null
    and not exists (select 1 from public.reports r where r.question_id = q.id);
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('unanswered_questions', done);

  update public.marketplace_events e
  set actor_user_id = case when e.actor_user_id = p_user_id then null else e.actor_user_id end,
    seller_user_id = case when e.seller_user_id = p_user_id then null else e.seller_user_id end,
    identity_key = case when e.identity_key like 'user:' || p_user_id::text || ':%' then null else e.identity_key end
  where e.actor_user_id = p_user_id or e.seller_user_id = p_user_id or e.identity_key like 'user:' || p_user_id::text || ':%';
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('events_unlinked', done);

  update public.profiles set full_name = 'Cuenta eliminada', phone = null, city = null where id = p_user_id;
  counts := counts || jsonb_build_object('auth', laria_private.anonymize_auth_user(p_user_id));

  if to_regprocedure('laria_private.anonymize_account_feature_data(uuid)') is not null then
    execute 'select to_jsonb(laria_private.anonymize_account_feature_data($1))' into feature_counts using p_user_id;
    counts := counts || jsonb_build_object('features', coalesce(feature_counts, 'null'::jsonb));
  end if;

  insert into laria_private.account_anonymizations as a (user_id, reason, requested_by, counts)
  values (p_user_id, left(p_reason, 500), p_requested_by, counts)
  on conflict (user_id) do update
  set last_anonymized_at = now(), reason = coalesce(excluded.reason, a.reason),
    requested_by = coalesce(excluded.requested_by, a.requested_by), counts = excluded.counts;

  return jsonb_build_object('user_id', p_user_id, 'anonymized_at',
    (select a.first_anonymized_at from laria_private.account_anonymizations a where a.user_id = p_user_id))
    || counts;
end;
$$;

-- Service role only: the self-service deletion (features/marketplace, app/api/account/delete) calls this exact
-- signature, then Supabase's soft delete of the Auth user.
create or replace function laria_private.anonymize_account(p_user_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'ANONYMIZE_SERVICE_REQUIRED';
  end if;
  return laria_private.anonymize_account_core(p_user_id, p_reason, null);
end;
$$;

-- Admin with the authenticator code; the reason goes to the Admin audit with what was cleared.
create or replace function public.admin_anonymize_account(p_user_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reason text := btrim(coalesce(p_reason, ''));
  result jsonb;
begin
  perform laria_private.assert_admin();
  if length(reason) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'ANONYMIZE_REASON_REQUIRED: Escribe el motivo (de 3 a 500 caracteres).';
  end if;
  if p_user_id = auth.uid() then
    raise exception using errcode = 'P0001', message = 'ANONYMIZE_ADMIN: Una cuenta Admin no se anonimiza. Quítale el rol primero.';
  end if;
  result := laria_private.anonymize_account_core(p_user_id, reason, auth.uid());
  insert into public.admin_audit_actions (admin_user_id, action, target_type, target_id, detail)
  values (auth.uid(), 'anonymize_account', 'account', p_user_id, jsonb_build_object('reason', reason, 'result', result));
  return result;
end;
$$;

revoke all on function laria_private.anonymize_auth_user(uuid), laria_private.anonymize_account_core(uuid, text, uuid)
from public, anon, authenticated, service_role;
revoke all on function laria_private.anonymize_account(uuid, text) from public, anon, authenticated;
grant execute on function laria_private.anonymize_account(uuid, text) to service_role;
revoke all on function public.admin_anonymize_account(uuid, text) from public, anon;
grant execute on function public.admin_anonymize_account(uuid, text) to authenticated;

-- The Admin audit lists accounts too now (/admin/auditoria/account/<id>).
alter table public.admin_audit_actions drop constraint if exists admin_audit_actions_target_type_check;
alter table public.admin_audit_actions add constraint admin_audit_actions_target_type_check
  check (target_type = any (array['legacy_link', 'listing', 'listing_revision', 'question', 'report', 'review', 'store',
    'account']));

create or replace function public.get_admin_audit_history(p_target_type text, p_target_id uuid, p_limit integer default 25)
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
  if p_target_type not in ('listing', 'listing_revision', 'store', 'report', 'review', 'legacy_link', 'account')
    or p_target_id is null or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'ADMIN_AUDIT_QUERY_INVALID';
  end if;
  select coalesce(jsonb_agg(to_jsonb(history) order by history.created_at desc, history.id desc), '[]'::jsonb)
  into result
  from (
    select a.id, a.action, a.target_type, a.target_id, a.detail, a.created_at,
      a.admin_user_id, p.full_name admin_name
    from public.admin_audit_actions a
    left join public.profiles p on p.id = a.admin_user_id
    where a.target_type = p_target_type and a.target_id = p_target_id
    order by a.created_at desc, a.id desc
    limit p_limit
  ) history;
  return result;
end;
$$;

-- ------------------------------------------------------------------------------------ Retention of analytics events

-- Where laria_private.scrub_marketplace_events left off, for browsing events and for the others: the last event it
-- read, in (created_at, id) order. Every event of that kind up to there has nothing that leads to a person.
create table if not exists laria_private.marketplace_event_scrub_clock (
  id boolean primary key default true check (id),
  browsing_at timestamptz,
  browsing_id uuid,
  other_at timestamptz,
  other_id uuid
);
revoke all on laria_private.marketplace_event_scrub_clock from public, anon, authenticated;

-- Reads up to p_limit events past the clock, oldest first, clears the account, session and identity of each, and
-- returns how many it read; call again while it returns p_limit.
create or replace function laria_private.scrub_marketplace_events(p_limit integer default 5000)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  browsing text[] := array['listing_impression', 'listing_view', 'store_view', 'search', 'filter_applied',
    'favorite_added', 'favorite_removed'];
  clock laria_private.marketplace_event_scrub_clock;
  browsing_until timestamptz := now() - interval '90 days';
  other_until timestamptz := now() - interval '365 days';
  first_id constant uuid := '00000000-0000-0000-0000-000000000000';
  read_count integer;
  last_at timestamptz;
  last_id uuid;
  total integer;
begin
  if p_limit is null or p_limit not between 1 and 20000 then
    raise exception using errcode = '22023', message = 'Invalid limit.';
  end if;
  insert into laria_private.marketplace_event_scrub_clock (id) values (true) on conflict do nothing;
  select * into clock from laria_private.marketplace_event_scrub_clock where id for update;

  with batch as (
    select e.id, e.created_at from public.marketplace_events e
    where e.event_type = any (browsing) and e.created_at < browsing_until
      and (e.created_at, e.id) > (coalesce(clock.browsing_at, '-infinity'), coalesce(clock.browsing_id, first_id))
    order by e.created_at, e.id
    limit p_limit
  ), cleared as (
    update public.marketplace_events e set actor_user_id = null, session_id = null, identity_key = null
    from batch b
    where e.id = b.id and (e.actor_user_id is not null or e.session_id is not null or e.identity_key is not null)
    returning e.id
  )
  select count(*)::integer, (array_agg(b.created_at order by b.created_at desc, b.id desc))[1],
    (array_agg(b.id order by b.created_at desc, b.id desc))[1]
  into read_count, last_at, last_id
  from batch b;
  -- A batch short of p_limit read everything up to browsing_until: the next run starts there.
  if read_count < p_limit then
    last_at := browsing_until;
    last_id := first_id;
  end if;
  update laria_private.marketplace_event_scrub_clock set browsing_at = last_at, browsing_id = last_id where id;
  total := read_count;
  if total >= p_limit then
    return total;
  end if;

  with batch as (
    select e.id, e.created_at from public.marketplace_events e
    where e.event_type <> all (browsing) and e.created_at < other_until
      and (e.created_at, e.id) > (coalesce(clock.other_at, '-infinity'), coalesce(clock.other_id, first_id))
    order by e.created_at, e.id
    limit p_limit - total
  ), cleared as (
    update public.marketplace_events e set actor_user_id = null, session_id = null, identity_key = null
    from batch b
    where e.id = b.id and (e.actor_user_id is not null or e.session_id is not null or e.identity_key is not null)
    returning e.id
  )
  select count(*)::integer, (array_agg(b.created_at order by b.created_at desc, b.id desc))[1],
    (array_agg(b.id order by b.created_at desc, b.id desc))[1]
  into read_count, last_at, last_id
  from batch b;
  if read_count < p_limit - total then
    last_at := other_until;
    last_id := first_id;
  end if;
  update laria_private.marketplace_event_scrub_clock set other_at = last_at, other_id = last_id where id;
  return total + read_count;
end;
$$;

-- The daily run: batches until one comes back short, at most 100 of them (500,000 events) a day.
create or replace function laria_private.run_marketplace_event_retention()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch integer;
  total integer := 0;
begin
  for i in 1 .. 100 loop
    batch := laria_private.scrub_marketplace_events(5000);
    total := total + batch;
    exit when batch < 5000;
  end loop;
  return total;
end;
$$;
revoke all on function laria_private.scrub_marketplace_events(integer), laria_private.run_marketplace_event_retention()
from public, anon, authenticated;

-- Daily at 09:45 UTC (04:45 Lima). cron.schedule() with a job name replaces the job of that name.
select cron.schedule('marketplace-event-retention', '45 9 * * *', $$select laria_private.run_marketplace_event_retention()$$);
