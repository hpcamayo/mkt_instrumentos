-- Laria V1 Sprint 3: owned listing lifecycle and moderated revisions.
-- Additive and compatibility-first. Sold listings remain outside public RLS;
-- their explicit detail route is resolved by trusted server code.

alter table public.listings
  add column if not exists rejection_reason text,
  add column if not exists hidden_source text,
  add column if not exists hidden_reason text,
  add column if not exists hidden_at timestamptz,
  add column if not exists relisted_from_listing_id uuid references public.listings(id) on delete restrict;

alter table public.listings
  add constraint listings_hidden_source_check
  check (hidden_source is null or hidden_source in ('owner', 'admin', 'legacy'));

create index listings_relisted_from_idx
on public.listings (relisted_from_listing_id)
where relisted_from_listing_id is not null;

update public.listings
set sold_at = coalesce(sold_at, updated_at, created_at)
where status = 'sold' and sold_at is null;

update public.listings
set hidden_source = 'legacy',
    hidden_at = coalesce(hidden_at, updated_at, created_at)
where status = 'hidden' and hidden_source is null;

create table public.listing_revisions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete restrict,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  store_id uuid references public.stores(id) on delete restrict,
  status text not null default 'pending',
  changed_fields text[] not null,
  title text,
  category text,
  instrument_type text,
  attributes jsonb,
  brand text,
  model text,
  condition text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  rejection_reason text,
  resolution_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_revisions_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint listing_revisions_changed_fields_check
    check (
      cardinality(changed_fields) > 0
      and changed_fields <@ array['title', 'category', 'instrument_type', 'attributes', 'brand', 'model', 'condition', 'photos']::text[]
    )
);

create unique index listing_revisions_one_pending_idx
on public.listing_revisions (listing_id)
where status = 'pending';

create index listing_revisions_owner_idx
on public.listing_revisions (owner_user_id, submitted_at desc);

create index listing_revisions_store_idx
on public.listing_revisions (store_id, submitted_at desc)
where store_id is not null;

create table public.listing_revision_photos (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.listing_revisions(id) on delete restrict,
  image_url text not null,
  alt_text text,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  constraint listing_revision_photos_sort_order_non_negative check (sort_order >= 0),
  constraint listing_revision_photos_revision_sort_unique unique (revision_id, sort_order)
);

create index listing_revision_photos_revision_idx
on public.listing_revision_photos (revision_id, sort_order);

create trigger listing_revisions_set_updated_at
before update on public.listing_revisions
for each row execute function public.set_updated_at();

alter table public.listing_revisions enable row level security;
alter table public.listing_revision_photos enable row level security;

create policy "Owners can read own listing revisions"
on public.listing_revisions
for select
to authenticated
using (owner_user_id = auth.uid() or public.is_admin());

create policy "Owners can read own revision photos"
on public.listing_revision_photos
for select
to authenticated
using (
  exists (
    select 1 from public.listing_revisions revision
    where revision.id = revision_id
      and (revision.owner_user_id = auth.uid() or public.is_admin())
  )
);

grant select on public.listing_revisions, public.listing_revision_photos to authenticated;

-- Photos used by live, sold, or revision records are immutable storage assets.
-- Trusted server cleanup may still remove failed-attempt objects with service_role.
drop policy if exists "Authenticated users can update listing photos under own folder" on storage.objects;
drop policy if exists "Authenticated users can delete listing photos under own folder" on storage.objects;

create or replace function public.listing_owner_can_edit(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.listings listing
    where listing.id = p_listing_id
      and listing.owner_user_id = auth.uid()
  );
$$;

create or replace function public.listing_accepts_direct_photo_edits(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.listings listing
    where listing.id = p_listing_id
      and listing.owner_user_id = auth.uid()
      and listing.status in ('draft', 'pending', 'rejected')
  );
$$;

create or replace function public.listing_taxonomy_is_valid(
  p_category text,
  p_instrument_type text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    (p_instrument_type = 'other' and p_category in (
      'guitars', 'basses', 'drums', 'cymbals', 'microphones',
      'pedals', 'amplifiers', 'audio interfaces'
    ))
    or (p_category = 'guitars' and p_instrument_type in ('electric_guitar', 'acoustic_guitar'))
    or (p_category = 'basses' and p_instrument_type = 'bass')
    or (p_category = 'drums' and p_instrument_type = 'drums')
    or (p_category = 'cymbals' and p_instrument_type = 'cymbals')
    or (p_category = 'microphones' and p_instrument_type = 'microphones')
    or (p_category = 'pedals' and p_instrument_type = 'pedals')
    or (p_category = 'amplifiers' and p_instrument_type = 'amplifiers')
    or (p_category = 'audio interfaces' and p_instrument_type = 'audio_interface');
$$;

create or replace function public.listing_attribute_keys_are_valid(
  p_instrument_type text,
  p_attributes jsonb
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(coalesce(p_attributes, '{}'::jsonb)) = 'object'
    and not exists (
      select 1
      from jsonb_object_keys(coalesce(p_attributes, '{}'::jsonb)) key
      where case p_instrument_type
        when 'electric_guitar' then key <> all(array['body_type','shape','strings','bridge','pickups','handedness','frets'])
        when 'bass' then key <> all(array['strings','bass_type','pickups','scale_length','handedness'])
        when 'acoustic_guitar' then key <> all(array['acoustic_type','body_shape','strings_material','handedness','has_preamp'])
        when 'drums' then key <> all(array['drum_type','configuration','pieces','material','includes_hardware','includes_cymbals','kick_size'])
        when 'cymbals' then key <> all(array['cymbal_type','size','alloy','finish'])
        when 'microphones' then key <> all(array['microphone_type','use_case','polar_pattern','connection'])
        when 'audio_interface' then key <> all(array['inputs','connection','phantom_power','midi'])
        when 'pedals' then key <> all(array['pedal_type','format','true_bypass'])
        when 'amplifiers' then key <> all(array['amplifier_type','technology','power','use_case'])
        when 'other' then true
        else true
      end
    );
$$;

create or replace function public.can_add_listing_photo(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.listing_accepts_direct_photo_edits(p_listing_id)
    and (select count(*) from public.listing_photos where listing_id = p_listing_id) < 10;
$$;

create or replace function public.can_remove_listing_photo(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.listing_accepts_direct_photo_edits(p_listing_id)
    and (select count(*) from public.listing_photos where listing_id = p_listing_id) > 2;
$$;

create or replace function public.listing_photo_set_is_valid(
  p_listing_id uuid,
  p_photos jsonb
)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select jsonb_typeof(p_photos) = 'array'
    and jsonb_array_length(p_photos) between 2 and 10
    and (
      select count(distinct photo->>'image_url') = count(*)
      from jsonb_array_elements(p_photos) photo
    )
    and not exists (
      select 1
      from jsonb_array_elements(p_photos) photo
      where jsonb_typeof(photo) <> 'object'
        or nullif(trim(coalesce(photo->>'image_url', '')), '') is null
        or not (
          exists (
            select 1 from public.listing_photos current_photo
            where current_photo.listing_id = p_listing_id
              and current_photo.image_url = photo->>'image_url'
          )
          or exists (
            select 1 from storage.objects object
            where object.bucket_id = 'listing-photos'
              and object.owner_id = auth.uid()::text
              and object.name = split_part(
                photo->>'image_url',
                '/storage/v1/object/public/listing-photos/',
                2
              )
              and object.name like auth.uid()::text || '/listing-edits/' || p_listing_id::text || '/%'
              and object.name ~* '\\.(jpg|png|webp)$'
              and lower(coalesce(object.metadata->>'mimetype', '')) in ('image/jpeg', 'image/png', 'image/webp')
              and coalesce((object.metadata->>'size')::bigint, 0) between 1 and 5242880
          )
        )
    );
$$;

-- Owner mutations now go through the validated, transactional RPCs below. The
-- previous generic table policies would otherwise let an authenticated owner
-- bypass canonical field/photo validation on pending or rejected inventory.
-- Admin policies remain available for trusted moderation paths.
drop policy if exists "Listing managers can update own listings" on public.listings;
drop policy if exists "Listing managers can insert own listing photos" on public.listing_photos;
drop policy if exists "Listing managers can update own listing photos" on public.listing_photos;
drop policy if exists "Listing managers can delete own listing photos above minimum" on public.listing_photos;

-- Protect lifecycle, authority, audit fields, and the immutable sold original.
create or replace function public.protect_listing_admin_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.allow_listing_admin_fields', true) = 'true' then
    return new;
  end if;

  if old.status = 'sold' then
    raise exception 'SOLD_LISTING_IMMUTABLE: Una publicación vendida no se puede modificar.';
  end if;

  if new.status is distinct from old.status
    or new.published_at is distinct from old.published_at
    or new.sold_at is distinct from old.sold_at
    or new.archived_at is distinct from old.archived_at
    or new.hidden_at is distinct from old.hidden_at
    or new.hidden_source is distinct from old.hidden_source
    or new.hidden_reason is distinct from old.hidden_reason
    or new.rejection_reason is distinct from old.rejection_reason
    or new.view_count is distinct from old.view_count
    or new.created_by_source is distinct from old.created_by_source
    or new.owner_user_id is distinct from old.owner_user_id
    or new.store_id is distinct from old.store_id
    or new.seller_type is distinct from old.seller_type
    or new.relisted_from_listing_id is distinct from old.relisted_from_listing_id then
    raise exception 'Only controlled server functions can change protected listing fields.';
  end if;

  if not public.is_admin()
    and old.status in ('approved', 'hidden')
    and (
      new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.category is distinct from old.category
      or new.instrument_type is distinct from old.instrument_type
      or new.attributes is distinct from old.attributes
      or new.brand is distinct from old.brand
      or new.model is distinct from old.model
      or new.condition is distinct from old.condition
      or new.price_pen is distinct from old.price_pen
      or new.city is distinct from old.city
      or new.region is distinct from old.region
      or new.contact_name is distinct from old.contact_name
      or new.whatsapp_phone is distinct from old.whatsapp_phone
    ) then
    raise exception 'APPROVED_LISTING_REQUIRES_CONTROLLED_EDIT: Usa el flujo de edición de la publicación.';
  end if;

  return new;
end;
$$;

create or replace function public.replace_listing_photos(
  p_listing_id uuid,
  p_photos jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_photos is null or not public.listing_photo_set_is_valid(p_listing_id, p_photos) then
    raise exception 'LISTING_PHOTO_INVALID: Revisa las fotos, su orden y su origen.';
  end if;

  delete from public.listing_photos where listing_id = p_listing_id;
  insert into public.listing_photos (listing_id, image_url, alt_text, sort_order)
  select p_listing_id,
         photo->>'image_url',
         nullif(trim(photo->>'alt_text'), ''),
         (ordinality - 1)::integer
  from jsonb_array_elements(p_photos) with ordinality as photos(photo, ordinality);
end;
$$;

create or replace function public.update_owned_listing(
  p_listing_id uuid,
  p_immediate jsonb default '{}'::jsonb,
  p_moderated jsonb default '{}'::jsonb,
  p_photos jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_record public.listings;
  verified_edit boolean := false;
  revision_id uuid;
  changed text[] := array[]::text[];
  direct_edit boolean;
  defer_attributes boolean := false;
  target_category text;
  target_instrument_type text;
begin
  if p_immediate is null or jsonb_typeof(p_immediate) <> 'object'
    or p_moderated is null or jsonb_typeof(p_moderated) <> 'object' then
    raise exception 'LISTING_EDIT_INVALID: Los cambios deben ser objetos válidos.';
  end if;
  if exists (select 1 from jsonb_object_keys(p_immediate) key where key not in ('price_pen', 'description', 'city', 'region', 'attributes'))
    or exists (select 1 from jsonb_object_keys(p_moderated) key where key not in ('title', 'category', 'instrument_type', 'brand', 'model', 'condition')) then
    raise exception 'LISTING_EDIT_FIELD_NOT_ALLOWED: Se recibió un campo no editable.';
  end if;

  select * into listing_record
  from public.listings
  where id = p_listing_id
  for update;

  if not found or listing_record.owner_user_id is distinct from auth.uid() then
    raise exception 'LISTING_NOT_OWNED: No puedes editar esta publicación.';
  end if;
  if listing_record.status in ('sold', 'archived') then
    raise exception 'LISTING_NOT_EDITABLE: Esta publicación ya no se puede editar.';
  end if;
  if listing_record.status = 'hidden' and listing_record.hidden_source = 'admin' then
    raise exception 'ADMIN_HIDDEN_LISTING: La publicación fue ocultada por moderación.';
  end if;

  if p_immediate ? 'price_pen' and coalesce((p_immediate->>'price_pen')::integer, 0) <= 0 then
    raise exception 'LISTING_PRICE_INVALID: Ingresa un precio mayor que cero.';
  end if;
  if p_immediate ? 'description' and length(trim(coalesce(p_immediate->>'description', ''))) < 40 then
    raise exception 'LISTING_DESCRIPTION_INVALID: La descripción debe tener al menos 40 caracteres.';
  end if;
  if p_immediate ? 'city' and nullif(trim(p_immediate->>'city'), '') is null
    or p_immediate ? 'region' and nullif(trim(p_immediate->>'region'), '') is null then
    raise exception 'LISTING_FIELD_REQUIRED: Completa ubicación y estado del producto.';
  end if;

  target_category := case when p_moderated ? 'category' then trim(p_moderated->>'category') else listing_record.category end;
  target_instrument_type := case when p_moderated ? 'instrument_type' then trim(p_moderated->>'instrument_type') else listing_record.instrument_type end;
  if not public.listing_taxonomy_is_valid(target_category, target_instrument_type) then
    raise exception 'LISTING_TAXONOMY_INVALID: La categoría y el tipo de instrumento no corresponden.';
  end if;
  if p_immediate ? 'attributes'
    and not public.listing_attribute_keys_are_valid(target_instrument_type, p_immediate->'attributes') then
    raise exception 'LISTING_ATTRIBUTES_INVALID: Revisa las características del instrumento.';
  end if;
  if p_moderated ? 'instrument_type'
    and not p_immediate ? 'attributes'
    and not public.listing_attribute_keys_are_valid(target_instrument_type, listing_record.attributes) then
    raise exception 'LISTING_ATTRIBUTES_INVALID: Actualiza las características para el nuevo tipo de instrumento.';
  end if;

  if listing_record.store_id is not null then
    select exists (
      select 1 from public.stores store
      where store.id = listing_record.store_id
        and store.owner_user_id = auth.uid()
        and store.status = 'active'
        and store.is_verified
    ) into verified_edit;
  end if;

  direct_edit := listing_record.status in ('draft', 'pending', 'rejected') or verified_edit;
  defer_attributes := not direct_edit
    and p_moderated ? 'instrument_type'
    and p_immediate ? 'attributes';

  if p_photos is not null and not public.listing_photo_set_is_valid(p_listing_id, p_photos) then
    raise exception 'LISTING_PHOTO_INVALID: Revisa las fotos, su orden y su origen.';
  end if;

  if not direct_edit
    and (p_moderated <> '{}'::jsonb or p_photos is not null)
    and exists (
      select 1 from public.listing_revisions
      where listing_id = p_listing_id and status = 'pending'
    ) then
    raise exception 'LISTING_REVISION_ALREADY_PENDING: Ya existe una revisión pendiente.';
  end if;

  perform set_config('app.allow_listing_admin_fields', 'true', true);

  -- Verification does not auto-approve an existing proposal. If the verified
  -- owner later replaces moderated values directly, resolve that older proposal
  -- as superseded so a later admin action cannot overwrite the newer live edit.
  if direct_edit
    and verified_edit
    and (p_moderated <> '{}'::jsonb or p_photos is not null) then
    update public.listing_revisions
    set status = 'cancelled', reviewed_at = now(),
        resolution_reason = 'La Tienda Verificada aplicó una edición directa posterior.'
    where listing_id = p_listing_id and status = 'pending';
  end if;

  update public.listings
  set price_pen = case when p_immediate ? 'price_pen' then (p_immediate->>'price_pen')::integer else price_pen end,
      description = case when p_immediate ? 'description' then trim(p_immediate->>'description') else description end,
      city = case when p_immediate ? 'city' then trim(p_immediate->>'city') else city end,
      region = case when p_immediate ? 'region' then trim(p_immediate->>'region') else region end,
      attributes = case when p_immediate ? 'attributes' and not defer_attributes then coalesce(p_immediate->'attributes', '{}'::jsonb) else attributes end,
      title = case when direct_edit and p_moderated ? 'title' then trim(p_moderated->>'title') else title end,
      category = case when direct_edit and p_moderated ? 'category' then trim(p_moderated->>'category') else category end,
      instrument_type = case when direct_edit and p_moderated ? 'instrument_type' then trim(p_moderated->>'instrument_type') else instrument_type end,
      brand = case when direct_edit and p_moderated ? 'brand' then trim(p_moderated->>'brand') else brand end,
      model = case when direct_edit and p_moderated ? 'model' then trim(p_moderated->>'model') else model end,
      condition = case when direct_edit and p_moderated ? 'condition' then trim(p_moderated->>'condition') else condition end
  where id = p_listing_id
  returning * into listing_record;

  if direct_edit and p_photos is not null then
    perform public.replace_listing_photos(p_listing_id, p_photos);
  end if;

  if direct_edit then
    if listing_record.status in ('approved', 'hidden') and not public.listing_meets_publish_requirements(p_listing_id) then
      raise exception 'LISTING_REQUIREMENTS_INVALID: La publicación dejaría de cumplir los requisitos.';
    end if;
    return jsonb_build_object('listing_id', p_listing_id, 'revision_id', null, 'mode', 'direct');
  end if;

  select array_agg(key order by key) into changed
  from (
    select key from jsonb_object_keys(p_moderated) key
    union all
    select 'photos' where p_photos is not null
    union all
    select 'attributes' where defer_attributes
  ) proposed;

  if coalesce(cardinality(changed), 0) = 0 then
    return jsonb_build_object('listing_id', p_listing_id, 'revision_id', null, 'mode', 'immediate');
  end if;

  if p_moderated ? 'title' and nullif(trim(p_moderated->>'title'), '') is null
    or p_moderated ? 'category' and nullif(trim(p_moderated->>'category'), '') is null
    or p_moderated ? 'instrument_type' and nullif(trim(p_moderated->>'instrument_type'), '') is null
    or p_moderated ? 'brand' and nullif(trim(p_moderated->>'brand'), '') is null
    or p_moderated ? 'model' and nullif(trim(p_moderated->>'model'), '') is null
    or p_moderated ? 'condition' and nullif(trim(p_moderated->>'condition'), '') is null then
    raise exception 'LISTING_REVISION_REQUIRED_FIELD: Completa los campos principales.';
  end if;
  if p_photos is not null and (jsonb_typeof(p_photos) <> 'array' or jsonb_array_length(p_photos) not between 2 and 10) then
    raise exception 'LISTING_PHOTO_COUNT_INVALID: Se requieren entre 2 y 10 fotos.';
  end if;

  insert into public.listing_revisions (
    listing_id, owner_user_id, store_id, changed_fields,
    title, category, instrument_type, attributes, brand, model, condition
  ) values (
    p_listing_id, listing_record.owner_user_id, listing_record.store_id, changed,
    case when p_moderated ? 'title' then trim(p_moderated->>'title') end,
    case when p_moderated ? 'category' then trim(p_moderated->>'category') end,
    case when p_moderated ? 'instrument_type' then trim(p_moderated->>'instrument_type') end,
    case when defer_attributes then coalesce(p_immediate->'attributes', '{}'::jsonb) end,
    case when p_moderated ? 'brand' then trim(p_moderated->>'brand') end,
    case when p_moderated ? 'model' then trim(p_moderated->>'model') end,
    case when p_moderated ? 'condition' then trim(p_moderated->>'condition') end
  ) returning id into revision_id;

  if p_photos is not null then
    insert into public.listing_revision_photos (revision_id, image_url, alt_text, sort_order)
    select revision_id,
           photo->>'image_url',
           nullif(trim(photo->>'alt_text'), ''),
           (ordinality - 1)::integer
    from jsonb_array_elements(p_photos) with ordinality as photos(photo, ordinality);
  end if;

  return jsonb_build_object('listing_id', p_listing_id, 'revision_id', revision_id, 'mode', 'revision');
end;
$$;

create or replace function public.set_owned_listing_lifecycle(
  p_listing_id uuid,
  p_action text
)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_record public.listings;
begin
  select * into listing_record
  from public.listings
  where id = p_listing_id
  for update;

  if not found or listing_record.owner_user_id is distinct from auth.uid() then
    raise exception 'LISTING_NOT_OWNED: No puedes administrar esta publicación.';
  end if;
  perform set_config('app.allow_listing_admin_fields', 'true', true);

  if p_action = 'hide' then
    if listing_record.status <> 'approved' then
      raise exception 'LISTING_HIDE_INVALID: Solo puedes ocultar una publicación aprobada.';
    end if;
    update public.listings
    set status = 'hidden', hidden_source = 'owner', hidden_reason = null, hidden_at = now()
    where id = p_listing_id returning * into listing_record;
  elsif p_action = 'restore' then
    if listing_record.status <> 'hidden' or listing_record.hidden_source <> 'owner' then
      raise exception 'LISTING_RESTORE_INVALID: Moderación debe restaurar una publicación ocultada por administración.';
    end if;
    if listing_record.store_id is not null and not exists (
      select 1 from public.stores store where store.id = listing_record.store_id and store.status = 'active'
    ) then
      raise exception 'STORE_NOT_PUBLIC: La tienda debe estar activa para restaurar esta publicación.';
    end if;
    if not public.listing_meets_publish_requirements(p_listing_id) then
      raise exception 'LISTING_REQUIREMENTS_INVALID: La publicación ya no cumple los requisitos.';
    end if;
    update public.listings
    set status = 'approved', hidden_source = null, hidden_reason = null, hidden_at = null
    where id = p_listing_id returning * into listing_record;
  elsif p_action = 'sold' then
    if listing_record.status <> 'approved' then
      raise exception 'LISTING_SOLD_INVALID: Solo una publicación aprobada puede marcarse como vendida.';
    end if;
    update public.listing_revisions
    set status = 'cancelled', reviewed_at = now(),
        resolution_reason = 'La publicación fue marcada como vendida.'
    where listing_id = p_listing_id and status = 'pending';
    update public.listings
    set status = 'sold', sold_at = coalesce(sold_at, now()),
        hidden_source = null, hidden_reason = null, hidden_at = null
    where id = p_listing_id returning * into listing_record;
  else
    raise exception 'LISTING_LIFECYCLE_ACTION_INVALID: Acción no compatible.';
  end if;

  return listing_record;
end;
$$;

create or replace function public.relist_sold_listing(p_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  original public.listings;
  copy public.listings;
  target_status public.listing_status := 'pending';
  new_id uuid := gen_random_uuid();
begin
  select * into original from public.listings where id = p_listing_id for update;
  if not found or original.owner_user_id is distinct from auth.uid() then
    raise exception 'LISTING_NOT_OWNED: No puedes republicar esta publicación.';
  end if;
  if original.status <> 'sold' then
    raise exception 'LISTING_RELIST_INVALID: Solo se puede republicar una publicación vendida.';
  end if;

  if original.store_id is not null and not exists (
    select 1 from public.stores store
    where store.id = original.store_id
      and store.owner_user_id = auth.uid()
      and store.status in ('pending', 'active')
  ) then
    raise exception 'STORE_NOT_ELIGIBLE: La tienda no puede recibir nuevo inventario.';
  end if;

  if original.store_id is not null and exists (
    select 1 from public.stores store
    where store.id = original.store_id and store.status = 'active' and store.is_verified
  ) then
    target_status := 'approved';
  end if;

  insert into public.listings (
    id, store_id, seller_type, status, title, slug, description, category,
    brand, model, condition, price_pen, city, region, contact_name,
    whatsapp_phone, owner_user_id, created_by_source,
    marketplace_rules_accepted_at, instrument_type, attributes,
    published_at, relisted_from_listing_id
  ) values (
    new_id, original.store_id, original.seller_type, target_status,
    original.title, original.slug || '-republicado-' || left(replace(new_id::text, '-', ''), 8),
    original.description, original.category, original.brand, original.model,
    original.condition, original.price_pen, original.city, original.region,
    original.contact_name, original.whatsapp_phone, original.owner_user_id,
    'self_service', original.marketplace_rules_accepted_at,
    original.instrument_type, original.attributes,
    case when target_status = 'approved' then now() else null end,
    original.id
  ) returning * into copy;

  insert into public.listing_photos (listing_id, image_url, alt_text, sort_order)
  select copy.id, image_url, alt_text, sort_order
  from public.listing_photos where listing_id = original.id
  order by sort_order;

  if not public.listing_meets_publish_requirements(copy.id) then
    raise exception 'LISTING_REQUIREMENTS_INVALID: La copia no cumple los requisitos de publicación.';
  end if;

  return copy;
end;
$$;

create or replace function public.review_listing(
  p_listing_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_record public.listings;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into listing_record from public.listings where id = p_listing_id for update;
  if not found then raise exception 'Listing not found.'; end if;
  perform set_config('app.allow_listing_admin_fields', 'true', true);

  if p_decision = 'approve' then
    if listing_record.status <> 'pending' or not public.listing_meets_publish_requirements(p_listing_id) then
      raise exception 'LISTING_APPROVAL_INVALID: La publicación pendiente no cumple los requisitos.';
    end if;
    update public.listings set status = 'approved', published_at = coalesce(published_at, now()), rejection_reason = null
    where id = p_listing_id returning * into listing_record;
  elsif p_decision = 'reject' then
    if listing_record.status <> 'pending' or nullif(trim(coalesce(p_reason, '')), '') is null then
      raise exception 'LISTING_REJECTION_REASON_REQUIRED: La publicación pendiente requiere un motivo.';
    end if;
    update public.listings set status = 'rejected', rejection_reason = trim(p_reason)
    where id = p_listing_id returning * into listing_record;
  elsif p_decision = 'hide' then
    if listing_record.status <> 'approved' or nullif(trim(coalesce(p_reason, '')), '') is null then
      raise exception 'LISTING_HIDE_REASON_REQUIRED: La ocultación administrativa requiere un motivo.';
    end if;
    update public.listings
    set status = 'hidden', hidden_source = 'admin', hidden_reason = trim(p_reason), hidden_at = now()
    where id = p_listing_id returning * into listing_record;
  elsif p_decision = 'restore' then
    if listing_record.status <> 'hidden' then raise exception 'LISTING_RESTORE_INVALID: La publicación no está oculta.'; end if;
    if listing_record.store_id is not null and not exists (
      select 1 from public.stores store where store.id = listing_record.store_id and store.status = 'active'
    ) then raise exception 'STORE_NOT_PUBLIC: La tienda debe estar activa.'; end if;
    if not public.listing_meets_publish_requirements(p_listing_id) then raise exception 'LISTING_REQUIREMENTS_INVALID: La publicación ya no cumple los requisitos.'; end if;
    update public.listings set status = 'approved', hidden_source = null, hidden_reason = null, hidden_at = null
    where id = p_listing_id returning * into listing_record;
  else
    raise exception 'LISTING_REVIEW_ACTION_INVALID: Acción de moderación no compatible.';
  end if;
  return listing_record;
end;
$$;

create or replace function public.review_listing_revision(
  p_revision_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.listing_revisions
language plpgsql
security definer
set search_path = public
as $$
declare
  revision public.listing_revisions;
  listing_record public.listings;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into revision from public.listing_revisions where id = p_revision_id for update;
  if not found or revision.status <> 'pending' then
    raise exception 'LISTING_REVISION_NOT_PENDING: La revisión ya fue resuelta.';
  end if;
  select * into listing_record from public.listings where id = revision.listing_id for update;
  if listing_record.status = 'sold' then
    raise exception 'SOLD_LISTING_IMMUTABLE: No se puede aprobar una revisión de una publicación vendida.';
  end if;
  perform set_config('app.allow_listing_admin_fields', 'true', true);

  if p_decision = 'approve' then
    update public.listings
    set title = case when 'title' = any(revision.changed_fields) then revision.title else title end,
        category = case when 'category' = any(revision.changed_fields) then revision.category else category end,
        instrument_type = case when 'instrument_type' = any(revision.changed_fields) then revision.instrument_type else instrument_type end,
        attributes = case when 'attributes' = any(revision.changed_fields) then revision.attributes else attributes end,
        brand = case when 'brand' = any(revision.changed_fields) then revision.brand else brand end,
        model = case when 'model' = any(revision.changed_fields) then revision.model else model end,
        condition = case when 'condition' = any(revision.changed_fields) then revision.condition else condition end
    where id = listing_record.id;

    if 'photos' = any(revision.changed_fields) then
      perform public.replace_listing_photos(
        listing_record.id,
        (select jsonb_agg(jsonb_build_object('image_url', image_url, 'alt_text', alt_text) order by sort_order)
         from public.listing_revision_photos where revision_id = revision.id)
      );
    end if;
    if not public.listing_meets_publish_requirements(listing_record.id) then
      raise exception 'LISTING_REQUIREMENTS_INVALID: La revisión no cumple los requisitos de publicación.';
    end if;
    update public.listing_revisions
    set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid(), rejection_reason = null
    where id = revision.id returning * into revision;
  elsif p_decision = 'reject' then
    if nullif(trim(coalesce(p_reason, '')), '') is null then
      raise exception 'LISTING_REVISION_REJECTION_REASON_REQUIRED: La revisión requiere un motivo.';
    end if;
    update public.listing_revisions
    set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid(), rejection_reason = trim(p_reason)
    where id = revision.id returning * into revision;
  else
    raise exception 'LISTING_REVISION_REVIEW_INVALID: Acción de revisión no compatible.';
  end if;
  return revision;
end;
$$;

-- Rejected listings may be corrected and submitted again. Approved/sold/hidden
-- states still cannot enter the new-listing moderation path.
create or replace function public.submit_listing_for_publication(p_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_record public.listings;
  store_record public.stores;
begin
  select * into listing_record from public.listings where id = p_listing_id for update;
  if not found or listing_record.owner_user_id is distinct from auth.uid() then
    raise exception 'You cannot submit this listing.';
  end if;
  if listing_record.status not in ('draft', 'pending', 'rejected') then
    raise exception 'Only a draft, rejected, or pending listing can be submitted.';
  end if;
  if not public.listing_meets_publish_requirements(p_listing_id) then
    raise exception 'Listing does not meet publication requirements.';
  end if;

  if listing_record.seller_type = 'store' then
    select * into store_record from public.stores
    where id = listing_record.store_id and owner_user_id = auth.uid() and status in ('pending', 'active')
    for update;
    if not found then raise exception 'Store inventory requires its authenticated owner and an eligible application.'; end if;
  end if;

  perform set_config('app.allow_listing_admin_fields', 'true', true);
  update public.listings
  set status = case
        when listing_record.seller_type = 'store' and store_record.status = 'active' and store_record.is_verified
          then 'approved'::public.listing_status
        else 'pending'::public.listing_status
      end,
      published_at = case
        when listing_record.seller_type = 'store' and store_record.status = 'active' and store_record.is_verified
          then coalesce(published_at, now())
        else published_at
      end,
      rejection_reason = null,
      created_by_source = case when created_by_source = 'legacy' then 'self_service' else created_by_source end
  where id = p_listing_id returning * into listing_record;
  return listing_record;
end;
$$;

revoke all on function public.replace_listing_photos(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.listing_photo_set_is_valid(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.update_owned_listing(uuid, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.set_owned_listing_lifecycle(uuid, text) from public, anon;
revoke all on function public.relist_sold_listing(uuid) from public, anon;
revoke all on function public.review_listing(uuid, text, text) from public, anon;
revoke all on function public.review_listing_revision(uuid, text, text) from public, anon;

grant execute on function public.listing_owner_can_edit(uuid) to authenticated;
grant execute on function public.listing_accepts_direct_photo_edits(uuid) to authenticated;
grant execute on function public.listing_taxonomy_is_valid(text, text) to authenticated;
grant execute on function public.listing_attribute_keys_are_valid(text, jsonb) to authenticated;
grant execute on function public.update_owned_listing(uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.set_owned_listing_lifecycle(uuid, text) to authenticated;
grant execute on function public.relist_sold_listing(uuid) to authenticated;
grant execute on function public.review_listing(uuid, text, text) to authenticated;
grant execute on function public.review_listing_revision(uuid, text, text) to authenticated;
