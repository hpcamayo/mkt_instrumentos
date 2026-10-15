-- STORE-3b: listing allowance per store and publication from an import (docs/store-operations/design.md §7.7, §10;
-- owner decision D-1 at its accepted default: every store keeps 50, Admin grants explicit pilot allowances, audited).
--
-- Builds on 20261026120000_store_import_photos.sql (STORE-3a). Changes to existing objects:
--   * enforce_store_inventory_cap() reads the store's allowance (store_operation_settings.listing_allowance, 50 when
--     there is no row) inside the same per-store advisory lock. What counts and which transitions consume capacity are
--     unchanged; the message names the store's own number, so with the default it is the V1 text word for word.
--   * complete_public_submission() keeps its checks and messages but delegates the store-listing insert to
--     laria_private.insert_store_listing(), which the import publication uses too (§7.7: one implementation).
--   * store_import_rows gains four nullable publication columns; store_import_sessions gains publish_counts.
--
-- Publication model:
--   * A separate, explicit step after the inventory commit ("Publicar seleccionados"), at most 20 rows per call.
--   * publish_store_import_rows() is service-role only, like complete_public_submission(): the server route checks the
--     signed-in owner and prepares the listing fields with the same validators as the publish form
--     (lib/listing-submission.ts), and passes the owner's id. The database decides everything it can by itself: the
--     row was applied, its SKU is active and unlinked, the price is the SKU's, the photos are the row's own validated
--     import photos and used by no other listing, the store is the owner's and may publish, and the allowance.
--   * Each row publishes in its own subtransaction; a row that fails or finds no allowance left stays unpublished with
--     a Spanish reason, and the others go on. A row publishes at most once (publish_status under the row lock).
--   * Lock order: import session, store row, per-store allowance lock, then per row: import row, inventory item (via
--     link_new_store_listing). Same store-row → allowance-lock order as complete_public_submission().

-- ------------------------------------------------------------------ allowance (§10)

create or replace function laria_private.store_listing_allowance(p_store_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select listing_allowance from public.store_operation_settings where store_id = p_store_id), 50);
$$;

create or replace function laria_private.store_listing_quota_json(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'store_id', p_store_id,
    'allowance', allowance,
    'used', used,
    'remaining', greatest(allowance - used, 0),
    'is_default', not exists (select 1 from public.store_operation_settings where store_id = p_store_id
                              and listing_allowance <> 50))
  from (
    select laria_private.store_listing_allowance(p_store_id) as allowance,
      (select count(*)::integer from public.listings l
       where l.store_id = p_store_id and l.status in ('pending', 'approved')) as used
  ) quota;
$$;

-- Sprint 2's trigger with one change: the limit is the store's allowance, read after the advisory lock is held, so a
-- concurrent allowance change is either fully before or fully after this transition.
create or replace function public.enforce_store_inventory_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  concurrent_count integer;
  allowance integer;
begin
  if new.seller_type <> 'store'
    or new.store_id is null
    or new.status not in ('pending', 'approved') then
    return new;
  end if;

  -- A transition between pending and approved consumes no new capacity.
  if tg_op = 'UPDATE'
    and old.seller_type = 'store'
    and old.store_id = new.store_id
    and old.status in ('pending', 'approved') then
    return new;
  end if;

  -- Serialize every capacity-consuming transition for one store. Unlike a
  -- plain count check, this prevents two concurrent requests at 49 from both
  -- succeeding.
  perform pg_advisory_xact_lock(hashtextextended(new.store_id::text, 0));

  allowance := laria_private.store_listing_allowance(new.store_id);

  select count(*)
  into concurrent_count
  from public.listings l
  where l.store_id = new.store_id
    and l.status in ('pending', 'approved')
    and (tg_op = 'INSERT' or l.id <> old.id);

  if concurrent_count >= allowance then
    raise exception using
      errcode = 'P0001',
      message = 'STORE_INVENTORY_LIMIT_REACHED: La tienda ya tiene ' || allowance || ' publicaciones concurrentes.';
  end if;

  return new;
end;
$$;

-- The caller's own store, or any store for an Admin. Read-only.
create or replace function public.get_store_listing_quota(p_store_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare target uuid;
begin
  if p_store_id is null then
    select s.id into target from public.stores s where auth.uid() is not null and s.owner_user_id = auth.uid();
  elsif public.is_admin() or exists (select 1 from public.stores s where s.id = p_store_id and auth.uid() is not null
                                     and s.owner_user_id = auth.uid()) then
    select s.id into target from public.stores s where s.id = p_store_id;
  end if;
  if target is null then
    perform laria_private.raise_inventory_error('STORE_NOT_FOUND', 'No encontramos la tienda.');
  end if;
  return laria_private.store_listing_quota_json(target);
end;
$$;

-- Admin only, reason required, audited with before/after. Lowering below the current count is allowed: it only blocks
-- new capacity-consuming transitions and hides nothing.
create or replace function public.admin_set_store_listing_allowance(p_store_id uuid, p_allowance integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
  previous integer;
  quota jsonb;
begin
  perform laria_private.assert_admin();
  if reason is null or char_length(reason) not between 3 and 280 then
    perform laria_private.raise_inventory_error('STORE_ALLOWANCE_REASON_REQUIRED', 'Indica el motivo del cambio.');
  end if;
  if p_allowance is null or p_allowance not between 1 and 2000 then
    perform laria_private.raise_inventory_error('STORE_ALLOWANCE_INVALID', 'El cupo debe estar entre 1 y 2000 publicaciones.');
  end if;
  perform 1 from public.stores where id = p_store_id for update;
  if not found then
    perform laria_private.raise_inventory_error('STORE_NOT_FOUND', 'La tienda no existe.');
  end if;
  -- The same lock enforce_store_inventory_cap() takes: a publication in flight sees the old or the new value.
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text, 0));
  previous := laria_private.store_listing_allowance(p_store_id);
  insert into public.store_operation_settings(store_id, listing_allowance, updated_by)
  values (p_store_id, p_allowance, auth.uid())
  on conflict (store_id) do update set listing_allowance = excluded.listing_allowance, updated_by = excluded.updated_by,
    updated_at = now();
  quota := laria_private.store_listing_quota_json(p_store_id);
  if previous is distinct from p_allowance then
    perform laria_private.record_admin_audit('store_listing_allowance_changed', 'store', p_store_id,
      jsonb_build_object('from', previous, 'to', p_allowance, 'reason', reason, 'used', quota->'used'));
  end if;
  return quota;
end;
$$;

-- ------------------------------------------------------------------ one store-listing insert (§7.7)

-- The store-listing body of complete_public_submission(), moved here unchanged so the import publishes through the
-- same code. The caller has already found and locked an eligible store owned by p_store.owner_user_id and checked the
-- marketplace rules. Returns the new id, or null when a listing with p_id already existed (idempotent retry).
create or replace function laria_private.insert_store_listing(
  p_id uuid,
  p_store public.stores,
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
  inventory_item_id uuid;
begin
  if coalesce(jsonb_array_length(p_photos), 0) not between 2 and 10 then
    raise exception 'A listing requires 2 to 10 photos.';
  end if;
  inventory_item_id := laria_private.inventory_json_uuid(p_fields, 'inventory_item_id');

  insert into public.listings (
    id, slug, title, category, instrument_type, attributes, brand, model,
    condition, price_pen, city, region, contact_name, whatsapp_phone,
    description, seller_type, status, owner_user_id, store_id,
    created_by_source, marketplace_rules_accepted_at
  ) values (
    p_id, p_fields->>'slug', p_fields->>'title', p_fields->>'category',
    p_fields->>'instrument_type', coalesce(p_fields->'attributes', '{}'::jsonb),
    p_fields->>'brand', p_fields->>'model', p_fields->>'condition',
    (p_fields->>'price_pen')::integer, p_store.city, p_store.region,
    p_store.contact_person, p_store.whatsapp_phone, p_fields->>'description',
    'store', 'pending', p_store.owner_user_id, p_store.id,
    'self_service', now()
  ) on conflict (id) do nothing returning id into inserted_id;

  if inserted_id is not null then
    insert into public.listing_photos (listing_id, image_url, alt_text, sort_order)
    select p_id, photo->>'image_url', photo->>'alt_text', (ordinality - 1)::integer
    from jsonb_array_elements(p_photos) with ordinality as photos(photo, ordinality);

    if inventory_item_id is not null then
      perform laria_private.link_new_store_listing(p_id, inventory_item_id, p_store.id, p_store.owner_user_id);
    end if;

    if p_store.status = 'active' and p_store.is_verified then
      if not public.listing_meets_publish_requirements(p_id) then
        raise exception 'Listing does not meet publication requirements.';
      end if;
      perform set_config('app.allow_listing_admin_fields', 'true', true);
      update public.listings
      set status = 'approved', published_at = coalesce(published_at, now())
      where id = p_id;
    end if;
  end if;

  return inserted_id;
end;
$$;

-- STORE-1a's function; the 'store_listing' branch now calls insert_store_listing(). Checks, their order and their
-- messages are the same, and the other kinds are untouched.
create or replace function public.complete_public_submission(p_id uuid, p_kind text, p_fields jsonb, p_photos jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
  profile_record public.profiles;
  store_record public.stores;
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
    ) on conflict (id) do nothing returning id into inserted_id;

    if inserted_id is not null then
      insert into public.listing_photos (listing_id, image_url, alt_text, sort_order)
      select p_id, photo->>'image_url', photo->>'alt_text', (ordinality - 1)::integer
      from jsonb_array_elements(p_photos) with ordinality as photos(photo, ordinality);
    end if;
  elsif p_kind = 'store' then
    select * into profile_record
    from public.profiles
    where id = (p_fields->>'owner_user_id')::uuid
      and account_type = 'store_owner';

    if not found then
      raise exception 'A separate Store Owner account is required.';
    end if;

    insert into public.stores (
      id, slug, name, description, status, listing_plan, contact_name,
      whatsapp_phone, city, region, district, address, instagram_url,
      facebook_url, logo_url, banner_url, owner_user_id, razon_social, ruc,
      contact_person, email, tiktok_url, website_url
    ) values (
      p_id, p_fields->>'slug', trim(p_fields->>'name'), nullif(trim(p_fields->>'description'), ''),
      'pending', 'free', trim(p_fields->>'contact_person'),
      regexp_replace(coalesce(p_fields->>'whatsapp_phone', ''), '[^0-9]', '', 'g'),
      trim(p_fields->>'city'), trim(p_fields->>'region'), nullif(trim(p_fields->>'district'), ''),
      trim(p_fields->>'address'), nullif(trim(p_fields->>'instagram_url'), ''),
      nullif(trim(p_fields->>'facebook_url'), ''),
      (select photo->>'image_url' from jsonb_array_elements(p_photos) photo where photo->>'role' = 'logo' limit 1),
      (select photo->>'image_url' from jsonb_array_elements(p_photos) photo where photo->>'role' = 'banner' limit 1),
      profile_record.id, trim(p_fields->>'razon_social'),
      regexp_replace(coalesce(p_fields->>'ruc', ''), '[^0-9]', '', 'g'),
      trim(p_fields->>'contact_person'), lower(trim(p_fields->>'email')),
      nullif(trim(p_fields->>'tiktok_url'), ''), nullif(trim(p_fields->>'website_url'), '')
    ) on conflict (id) do nothing returning id into inserted_id;

    if inserted_id is not null then
      if not public.store_application_is_complete(p_id) then
        raise exception 'Store application is incomplete.';
      end if;

      insert into public.store_photos (store_id, image_url, alt_text, sort_order)
      select p_id, photo->>'image_url', photo->>'alt_text', (ordinality - 1)::integer
      from jsonb_array_elements(p_photos) with ordinality as photos(photo, ordinality)
      where photo->>'role' = 'store_photo';
    end if;
  elsif p_kind = 'store_listing' then
    if coalesce(jsonb_array_length(p_photos), 0) not between 2 and 10 then
      raise exception 'A listing requires 2 to 10 photos.';
    end if;

    select s.* into store_record
    from public.stores s
    join public.profiles p on p.id = s.owner_user_id
    where s.id = (p_fields->>'store_id')::uuid
      and s.owner_user_id = (p_fields->>'owner_user_id')::uuid
      and p.account_type = 'store_owner'
      and s.status in ('pending', 'active')
    for update;

    if not found then
      raise exception 'An eligible owner-bound store is required.';
    end if;
    if coalesce((p_fields->>'marketplace_rules_accepted')::boolean, false) is not true then
      raise exception 'Marketplace rules acceptance is required.';
    end if;

    perform laria_private.insert_store_listing(p_id, store_record, p_fields, p_photos);
  else
    raise exception 'Invalid submission kind';
  end if;

  return p_id;
end;
$$;

-- ------------------------------------------------------------------ publication state on staged rows

alter table public.store_import_rows
  add column publish_status text check (publish_status is null or publish_status in ('published', 'failed', 'no_quota')),
  add column publish_message text check (publish_message is null or char_length(publish_message) <= 300),
  add column published_listing_id uuid references public.listings(id) on delete set null,
  add column published_at timestamptz,
  add constraint import_row_published_shape check (
    (publish_status = 'published') = (published_at is not null)
    and (published_listing_id is null or publish_status = 'published'));

create unique index store_import_rows_published_listing_idx on public.store_import_rows(published_listing_id)
  where published_listing_id is not null;

alter table public.store_import_sessions
  add column publish_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(publish_counts) = 'object');

-- The slug the publish form gives a listing (app/api/submissions/route.ts): title without accents, lowercase, runs of
-- other characters as "-", at most 100 characters, then the listing id.
create or replace function laria_private.listing_slug(p_title text, p_id uuid)
returns text
language sql
immutable
as $$
  select coalesce(nullif(regexp_replace(left(btrim(regexp_replace(
           regexp_replace(lower(normalize(coalesce(p_title, ''), NFD)), '[̀-ͯ]', '', 'g'),
           '[^a-z0-9]+', '-', 'g'), '-'), 100), '-$', ''), ''), 'publicacion') || '-' || p_id::text;
$$;

create or replace function laria_private.refresh_import_publish_counts(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'published', count(*) filter (where publish_status = 'published'),
    'failed', count(*) filter (where publish_status = 'failed'),
    'no_quota', count(*) filter (where publish_status = 'no_quota'))
  into result
  from public.store_import_rows where session_id = p_session_id;
  update public.store_import_sessions set publish_counts = result where id = p_session_id;
  return result;
end;
$$;

-- The Spanish reason a row stays unpublished, from a database error. Unknown errors get a generic line.
create or replace function laria_private.import_publish_error_message(p_message text)
returns text
language sql
immutable
as $$
  select case
    when p_message like 'STORE_INVENTORY_LIMIT_REACHED%' then 'Sin cupo de publicaciones.'
    when p_message like 'INVENTORY_ITEM_ALREADY_LINKED%' then 'Este SKU ya tiene una publicación.'
    when p_message like 'INVENTORY_ITEM_ARCHIVED%' then 'El SKU está archivado. Reactívalo antes de publicarlo.'
    when p_message like 'LISTING_PHOTO_INVALID%' then 'Una de las fotos ya no está disponible. Revisa las fotos de este SKU.'
    when p_message like 'Listing does not meet publication requirements%'
      or p_message like 'IMPORT_PUBLISH_INCOMPLETE%' then 'Faltan datos para publicar.'
    when p_message ~ '^[A-Z][A-Z_]{2,80}: ' then left(substr(p_message, strpos(p_message, ': ') + 2), 300)
    else 'No se pudo publicar esta fila. Intenta de nuevo.'
  end;
$$;

-- ------------------------------------------------------------------ publication (§7.7)

-- Service role only (the publish route). p_rows: up to 20 of {row_number, fields: {title, brand, model, category,
-- instrument_type, condition, description, attributes}}, already validated by the route with the publish form's
-- rules. Price, photos, store contact data and the SKU link come from the database, never from p_rows.
create or replace function public.publish_store_import_rows(
  p_owner_user_id uuid,
  p_session_id uuid,
  p_rows jsonb,
  p_rules_accepted boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session public.store_import_sessions;
  store_record public.stores;
  entry jsonb;
  fields jsonb;
  staged public.store_import_rows;
  item public.store_inventory_items;
  photos jsonb;
  photo jsonb;
  listing_id uuid;
  listing_status text;
  remaining integer;
  outcome text;
  message text;
  title text;
  results jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  select * into session from public.store_import_sessions where id = p_session_id for update;
  if not found or session.created_by is distinct from p_owner_user_id then
    perform laria_private.raise_import_error('IMPORT_SESSION_NOT_FOUND', 'No encontramos esta importación.');
  end if;
  perform laria_private.require_inventory_write(session.store_id, p_owner_user_id);
  if session.status not in ('committed', 'partially_committed') or session.rows_purged_at is not null then
    perform laria_private.raise_import_error('IMPORT_PUBLISH_CLOSED',
      case when session.status in ('committed', 'partially_committed')
        then 'Esta importación ya no se puede publicar. Publica desde Inventario.'
        else 'Primero confirma la importación; luego podrás publicar.' end);
  end if;
  if coalesce(p_rules_accepted, false) is not true then
    perform laria_private.raise_import_error('IMPORT_PUBLISH_RULES_REQUIRED', 'Debes aceptar las reglas del marketplace.');
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 20
     or (select count(distinct value->>'row_number') from jsonb_array_elements(p_rows)) <> jsonb_array_length(p_rows)
     or exists (select 1 from jsonb_array_elements(p_rows)
                where coalesce(value->>'row_number', '') !~ '^[0-9]{1,7}$' or coalesce(jsonb_typeof(value->'fields'), '') <> 'object') then
    perform laria_private.raise_import_error('IMPORT_PUBLISH_REQUEST_INVALID', 'Solicitud de publicación inválida.');
  end if;

  -- Same store checks as the publish form (complete_public_submission), then the allowance lock for the whole chunk.
  select s.* into store_record
  from public.stores s
  join public.profiles p on p.id = s.owner_user_id
  where s.id = session.store_id
    and s.owner_user_id = p_owner_user_id
    and p.account_type = 'store_owner'
    and s.status in ('pending', 'active')
  for update of s;
  if not found then
    perform laria_private.raise_import_error('IMPORT_PUBLISH_STORE_INELIGIBLE', 'Tu tienda no puede publicar en este momento.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(store_record.id::text, 0));
  remaining := (laria_private.store_listing_quota_json(store_record.id)->>'remaining')::integer;

  for entry in
    select value from jsonb_array_elements(p_rows) order by (value->>'row_number')::integer
  loop
    outcome := null;
    message := null;
    listing_id := null;
    listing_status := null;

    select * into staged from public.store_import_rows r
    where r.session_id = session.id and r.row_number = (entry->>'row_number')::integer
    for update;
    if not found then
      results := results || jsonb_build_object('row_number', (entry->>'row_number')::integer, 'outcome', 'not_found',
        'message', 'Esa fila no está en esta importación.');
      continue;
    end if;

    if staged.publish_status = 'published' then
      select l.status::text into listing_status from public.listings l where l.id = staged.published_listing_id;
      results := results || jsonb_build_object('row_number', staged.row_number, 'outcome', 'already_published',
        'listing_id', staged.published_listing_id, 'listing_status', listing_status);
      continue;
    end if;

    select * into item from public.store_inventory_items i where i.id = staged.applied_item_id;
    if staged.commit_status <> 'applied' or staged.applied_item_id is null or not found then
      outcome := 'failed'; message := 'Esta fila no se aplicó al inventario.';
    elsif item.store_id <> store_record.id then
      outcome := 'failed'; message := 'No puedes publicar este SKU.';
    elsif item.inventory_status <> 'active' then
      outcome := 'failed'; message := 'El SKU está archivado. Reactívalo antes de publicarlo.';
    elsif item.listing_id is not null then
      outcome := 'failed'; message := 'Este SKU ya tiene una publicación.';
    elsif item.unit_price_pen is null or item.unit_price_pen <= 0 then
      outcome := 'failed'; message := 'El SKU no tiene precio.';
    elsif staged.photo_state is distinct from 'ready' then
      outcome := 'failed'; message := 'El SKU necesita de 2 a 10 fotos listas.';
    elsif remaining <= 0 then
      outcome := 'no_quota'; message := 'Sin cupo de publicaciones.';
    end if;

    if outcome is null then
      fields := entry->'fields';
      title := btrim(coalesce(fields->>'title', ''));
      photos := (
        select coalesce(jsonb_agg(jsonb_build_object('image_url', value->>'image_url', 'alt_text', 'Foto de ' || title)
                                  order by ordinality), '[]'::jsonb)
        from jsonb_array_elements(laria_private.import_row_photos_json(session.id, staged.row_number)) with ordinality);
      listing_id := gen_random_uuid();
      begin
        if char_length(title) not between 2 and 500 then
          perform laria_private.raise_import_error('IMPORT_PUBLISH_INCOMPLETE', 'Faltan datos para publicar.');
        end if;
        if jsonb_array_length(photos) not between 2 and 10 then
          perform laria_private.raise_import_error('IMPORT_PUBLISH_PHOTOS', 'El SKU necesita de 2 a 10 fotos listas.');
        end if;
        for photo in select value from jsonb_array_elements(photos) loop
          if not laria_private.import_photo_url_is_valid(photo->>'image_url', p_owner_user_id, store_record.id, session.id)
             or laria_private.import_photo_url_referenced(photo->>'image_url') then
            perform laria_private.raise_import_error('IMPORT_PUBLISH_PHOTOS',
              'Una de las fotos ya se usa en otra publicación o no está disponible. Revisa las fotos de este SKU.');
          end if;
        end loop;

        perform laria_private.insert_store_listing(listing_id, store_record,
          jsonb_build_object(
            'slug', laria_private.listing_slug(title, listing_id),
            'title', title,
            'category', btrim(coalesce(fields->>'category', '')),
            'instrument_type', btrim(coalesce(fields->>'instrument_type', '')),
            'attributes', case when jsonb_typeof(fields->'attributes') = 'object' then fields->'attributes' else '{}'::jsonb end,
            'brand', btrim(coalesce(fields->>'brand', '')),
            'model', btrim(coalesce(fields->>'model', '')),
            'condition', btrim(coalesce(fields->>'condition', '')),
            'price_pen', item.unit_price_pen,
            'description', btrim(coalesce(fields->>'description', '')),
            'inventory_item_id', item.id),
          photos);

        -- Stricter than the form path: every imported row, verified or not, must meet the publication requirements
        -- before it is created (a normal Tienda's row would otherwise reach the Admin queue incomplete).
        if not public.listing_meets_publish_requirements(listing_id)
           or not public.listing_attribute_keys_are_valid(fields->>'instrument_type', fields->'attributes') then
          perform laria_private.raise_import_error('IMPORT_PUBLISH_INCOMPLETE', 'Faltan datos para publicar.');
        end if;
        outcome := 'published';
      exception when others then
        -- A lock conflict (the SKU was linked by another request) is retried by the caller with the same rows.
        if sqlstate in ('40001', '40P01') then raise; end if;
        outcome := case when sqlerrm like 'STORE_INVENTORY_LIMIT_REACHED%' then 'no_quota' else 'failed' end;
        message := laria_private.import_publish_error_message(sqlerrm);
        listing_id := null;
      end;
    end if;

    if outcome = 'published' then
      remaining := remaining - 1;
      select l.status::text into listing_status from public.listings l where l.id = listing_id;
      update public.store_import_rows
      set publish_status = 'published', publish_message = null, published_listing_id = listing_id, published_at = now()
      where session_id = session.id and row_number = staged.row_number;
    else
      update public.store_import_rows
      set publish_status = outcome, publish_message = left(message, 300)
      where session_id = session.id and row_number = staged.row_number;
    end if;
    results := results || jsonb_strip_nulls(jsonb_build_object('row_number', staged.row_number, 'outcome', outcome,
      'message', message, 'listing_id', listing_id, 'listing_status', listing_status));
  end loop;

  return jsonb_build_object(
    'results', results,
    'publish_counts', laria_private.refresh_import_publish_counts(session.id),
    'quota', laria_private.store_listing_quota_json(store_record.id),
    'store', jsonb_build_object('status', store_record.status, 'is_verified', store_record.is_verified));
end;
$$;

-- ------------------------------------------------------------------ grants

revoke all on function laria_private.store_listing_allowance(uuid) from public, anon, authenticated;
revoke all on function laria_private.store_listing_quota_json(uuid) from public, anon, authenticated;
revoke all on function laria_private.insert_store_listing(uuid, public.stores, jsonb, jsonb) from public, anon, authenticated;
revoke all on function laria_private.listing_slug(text, uuid) from public, anon, authenticated;
revoke all on function laria_private.refresh_import_publish_counts(uuid) from public, anon, authenticated;
revoke all on function laria_private.import_publish_error_message(text) from public, anon, authenticated;

revoke all on function public.complete_public_submission(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.complete_public_submission(uuid, text, jsonb, jsonb) to service_role;

revoke all on function public.get_store_listing_quota(uuid) from public, anon, authenticated;
revoke all on function public.admin_set_store_listing_allowance(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.publish_store_import_rows(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.get_store_listing_quota(uuid) to authenticated;
grant execute on function public.admin_set_store_listing_allowance(uuid, integer, text) to authenticated;
grant execute on function public.publish_store_import_rows(uuid, uuid, jsonb, boolean) to service_role;
