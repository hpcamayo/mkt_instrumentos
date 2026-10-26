-- Feature ideas, batch listing-details (docs/feature-ideas/listing-details.md): two small registries other batches
-- build on, so that a new yes/no filter or a new listing field never needs another rebuild of a shared function.
--
-- 1. Listing flags. listings.listing_flags is a list of yes/no facts a buyer can filter on ("Envía a provincia",
--    "Se puede probar", "Acepta cambios"; store-floor's "Con garantía" later). Triggers keep it, so a client value is
--    always overwritten:
--      listings_flags_a_reset         BEFORE INSERT OR UPDATE, empties the list (the "a" makes it fire first);
--      listings_flags_<batch>         BEFORE INSERT OR UPDATE (no column list), appends that batch's flags from its
--                                     own columns.
--    Postgres fires BEFORE triggers of one table in name order, so every batch trigger name must sort after
--    "listings_flags_a_reset" and before "listings_track_content_change". laria_private.listing_flag_filters lists the
--    flags a search may ask for (saved alerts, catalog counts). Adding a flag: one row here, one trigger, one entry in
--    lib/listing-flags.ts. listing_flags is in no column grant and must never be in one.
--
-- 2. Listing detail writers. A listing's extra fields (sale terms here; warranty, made to order, part payment in
--    other batches) arrive as one JSON object, p_details, keyed by the owning batch's key. Each key has a writer
--    (uuid, jsonb) that checks and stores its part, and optionally a copier (uuid, uuid) for "Duplicar" and
--    "Republicar". They run through:
--      public.complete_listing_submission  the sell form's submission, with the details (service role);
--      public.update_owned_listing_details the edit form's details (the signed-in owner);
--      laria_private.copy_listing_details  called by copy_owned_listing (patched in 20261202120300).
--    Adding a field: one writer, one row here, one input component placed in the forms with a one-line import.

-- ------------------------------------------------------------------ 1. listing flags

alter table public.listings add column if not exists listing_flags text[] not null default '{}';
create index if not exists listings_listing_flags_idx on public.listings using gin (listing_flags);

comment on column public.listings.listing_flags is
  'Yes/no facts a buyer can filter on, kept by the listings_flags_* triggers from each batch''s own columns. Never '
  'client-writable: listings_flags_a_reset empties it on every insert and update.';

create table if not exists laria_private.listing_flag_filters (
  flag text primary key check (flag ~ '^[a-z][a-z0-9_]{1,39}$'),
  label text not null check (char_length(label) between 2 and 40),
  sort_order integer not null default 100
);

comment on table laria_private.listing_flag_filters is
  'The listing flags a search may ask for ("options" in a saved search or the catalog filters). The label is for '
  'people reading the database; the site''s copy lives in lib/listing-flags.ts.';

revoke all on table laria_private.listing_flag_filters from public, anon, authenticated;

create or replace function laria_private.reset_listing_flags()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.listing_flags := '{}';
  return new;
end;
$$;

drop trigger if exists listings_flags_a_reset on public.listings;
create trigger listings_flags_a_reset
before insert or update on public.listings
for each row execute function laria_private.reset_listing_flags();

revoke all on function laria_private.reset_listing_flags() from public, anon, authenticated;

-- A search's "options": registered flags only, each once, sorted; null when none are left.
create or replace function laria_private.normalize_listing_options(p_value jsonb)
returns jsonb
language sql
stable
set search_path = public
as $$
  select case when count(*) = 0 then null else jsonb_agg(flag order by flag) end
  from (
    select distinct given.value as flag
    from jsonb_array_elements_text(case jsonb_typeof(p_value)
      when 'array' then p_value when 'string' then jsonb_build_array(p_value) else '[]'::jsonb end) as given(value)
    where exists (select 1 from laria_private.listing_flag_filters registered where registered.flag = given.value)
  ) options;
$$;

revoke all on function laria_private.normalize_listing_options(jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------------ 2. listing detail writers

create table if not exists laria_private.listing_detail_writers (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  writer regprocedure not null,
  copier regprocedure,
  owner_batch text not null,
  note text
);

comment on table laria_private.listing_detail_writers is
  'One row per key of p_details. writer(listing_id uuid, value jsonb) checks and stores that part of a listing; '
  'copier(source_id uuid, target_id uuid), when set, carries it to a duplicated or relisted copy. Both run as the '
  'definer, after the caller''s ownership checks, in key order.';

revoke all on table laria_private.listing_detail_writers from public, anon, authenticated;

create or replace function laria_private.apply_listing_details(p_listing_id uuid, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare entry laria_private.listing_detail_writers;
begin
  if p_details is null or p_details = 'null'::jsonb then
    return;
  end if;
  if jsonb_typeof(p_details) <> 'object' or octet_length(p_details::text) > 16384 then
    raise exception 'LISTING_DETAILS_INVALID: Los detalles de la publicación no son válidos.';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_details) as given(key)
    where not exists (select 1 from laria_private.listing_detail_writers registered where registered.key = given.key)
  ) then
    raise exception 'LISTING_DETAILS_INVALID: Se recibió un detalle desconocido.';
  end if;
  for entry in select * from laria_private.listing_detail_writers order by key loop
    if p_details ? entry.key then
      execute format('select %s($1, $2)', entry.writer::oid::regproc) using p_listing_id, p_details->entry.key;
    end if;
  end loop;
end;
$$;

create or replace function laria_private.copy_listing_details(p_source_id uuid, p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare entry laria_private.listing_detail_writers;
begin
  for entry in select * from laria_private.listing_detail_writers where copier is not null order by key loop
    execute format('select %s($1, $2)', entry.copier::oid::regproc) using p_source_id, p_target_id;
  end loop;
end;
$$;

revoke all on function laria_private.apply_listing_details(uuid, jsonb) from public, anon, authenticated;
revoke all on function laria_private.copy_listing_details(uuid, uuid) from public, anon, authenticated;

-- The sell form's submission with its details, in one transaction. A retry of a listing that already exists returns
-- it untouched, as complete_public_submission does. A store listing that goes public at once is matched against saved
-- searches after its details are stored, so an alert for "Envía a provincia" finds it.
create or replace function public.complete_listing_submission(
  p_id uuid, p_kind text, p_fields jsonb, p_photos jsonb, p_details jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  existed boolean;
  result uuid;
  deferred text;
begin
  if p_kind not in ('listing', 'store_listing') then
    raise exception 'Invalid submission kind';
  end if;
  existed := exists (select 1 from public.listings where id = p_id);

  perform set_config('laria.defer_alert_capture', 'on', true);
  perform set_config('laria.alert_capture_deferred', '', true);
  result := public.complete_public_submission(p_id, p_kind, p_fields, p_photos);
  if not existed then
    perform laria_private.apply_listing_details(p_id, coalesce(p_details, '{}'::jsonb));
  end if;
  perform set_config('laria.defer_alert_capture', '', true);

  deferred := coalesce(current_setting('laria.alert_capture_deferred', true), '');
  if deferred <> '' then
    perform set_config('laria.alert_capture_deferred', '', true);
    perform laria_private.capture_deferred_listing_publication(deferred::uuid);
  end if;
  return result;
end;
$$;

revoke all on function public.complete_listing_submission(uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.complete_listing_submission(uuid, text, jsonb, jsonb, jsonb) to service_role;

-- The edit form's details: the owner, on a listing they can still edit (the same rules as apply_owned_listing_edit).
-- Details are not moderated: each writer refuses what moderation would (contact details in free text, for one).
create or replace function public.update_owned_listing_details(p_listing_id uuid, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare listing_record public.listings;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'LISTING_NOT_OWNED: No puedes editar esta publicación.';
  end if;
  select * into listing_record from public.listings where id = p_listing_id for update;
  if not found or listing_record.owner_user_id is distinct from auth.uid() then
    raise exception 'LISTING_NOT_OWNED: No puedes editar esta publicación.';
  end if;
  if listing_record.status in ('sold', 'archived') then
    raise exception 'LISTING_NOT_EDITABLE: Esta publicación ya no se puede editar.';
  end if;
  if listing_record.status = 'hidden' and listing_record.hidden_source = 'admin' then
    raise exception 'ADMIN_HIDDEN_LISTING: La publicación fue ocultada por moderación.';
  end if;
  perform laria_private.apply_listing_details(p_listing_id, p_details);
end;
$$;

revoke all on function public.update_owned_listing_details(uuid, jsonb) from public, anon;
grant execute on function public.update_owned_listing_details(uuid, jsonb) to authenticated, service_role;
