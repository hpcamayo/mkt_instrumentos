-- Laria V1 Sprint 3.1: amendable listing proposals and in-app notifications.
-- Forward-only and compatibility-first. The approved listing remains live while
-- its single pending proposal evolves.

alter table public.listing_revisions
  add column if not exists version integer not null default 1;

alter table public.listing_revisions
  add constraint listing_revisions_version_positive check (version > 0);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  message text not null,
  listing_id uuid references public.listings(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notifications_event_type_check check (event_type in (
    'listing_approved',
    'listing_rejected',
    'listing_hidden',
    'listing_revision_approved',
    'listing_revision_rejected',
    'store_approved',
    'store_rejected',
    'store_verified',
    'store_verification_revoked'
  )),
  constraint notifications_target_check check (
    (event_type like 'listing_%' and listing_id is not null)
    or (event_type like 'store_%' and store_id is not null)
  )
);

create index notifications_user_created_idx
on public.notifications (user_id, created_at desc, id desc);

create index notifications_user_unread_idx
on public.notifications (user_id, created_at desc)
where read_at is null;

alter table public.notifications enable row level security;

create policy "Users can read own notifications"
on public.notifications
for select
to authenticated
using (user_id = auth.uid());

grant select on public.notifications to authenticated;

create or replace function public.create_account_notification(
  p_user_id uuid,
  p_event_type text,
  p_listing_id uuid default null,
  p_store_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  notification_id uuid;
  notification_message text;
begin
  if p_user_id is null then
    return null;
  end if;

  notification_message := case p_event_type
    when 'listing_approved' then 'Tu publicación fue aprobada y ya puede mostrarse en Laria.'
    when 'listing_rejected' then 'Tu publicación fue rechazada. Revisa el motivo y corrígela desde tu cuenta.'
    when 'listing_hidden' then 'Moderación ocultó tu publicación. Revisa el motivo desde tu cuenta.'
    when 'listing_revision_approved' then 'Los cambios propuestos para tu publicación fueron aprobados.'
    when 'listing_revision_rejected' then 'Los cambios propuestos para tu publicación fueron rechazados. Revisa el motivo.'
    when 'store_approved' then 'Tu solicitud fue aprobada. Tu negocio ya figura como Tienda en Laria.'
    when 'store_rejected' then 'Tu solicitud de tienda fue rechazada. Revisa el motivo y corrige los datos.'
    when 'store_verified' then 'Tu tienda fue verificada y ahora figura como Tienda Verificada.'
    when 'store_verification_revoked' then 'La verificación de tu tienda fue revocada. La tienda permanece activa y el inventario futuro vuelve a moderación.'
    else null
  end;

  if notification_message is null then
    raise exception 'NOTIFICATION_EVENT_INVALID: Tipo de notificación no compatible.';
  end if;

  insert into public.notifications (user_id, event_type, message, listing_id, store_id)
  values (p_user_id, p_event_type, notification_message, p_listing_id, p_store_id)
  returning id into notification_id;

  return notification_id;
end;
$$;

revoke all on function public.create_account_notification(uuid, text, uuid, uuid)
from public, anon, authenticated;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  notification_record public.notifications;
begin
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and user_id = auth.uid()
  returning * into notification_record;

  if not found then
    raise exception 'NOTIFICATION_NOT_OWNED: No puedes modificar esta notificación.';
  end if;

  return notification_record;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

-- A proposed photo may reuse either a current public photo or a photo already
-- attached to this listing's pending proposal. New objects remain owner-scoped.
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
            select 1
            from public.listing_revision_photos proposed_photo
            join public.listing_revisions revision on revision.id = proposed_photo.revision_id
            where revision.listing_id = p_listing_id
              and revision.owner_user_id = auth.uid()
              and revision.status = 'pending'
              and proposed_photo.image_url = photo->>'image_url'
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
  pending_revision public.listing_revisions;
  has_pending boolean := false;
  verified_edit boolean := false;
  direct_edit boolean;
  defer_attributes boolean := false;
  proposal_touched boolean := false;
  photos_changed boolean := false;
  target_revision_id uuid;
  changed text[] := array[]::text[];
  proposal_title text;
  proposal_category text;
  proposal_instrument_type text;
  proposal_attributes jsonb;
  proposal_brand text;
  proposal_model text;
  proposal_condition text;
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

  select * into pending_revision
  from public.listing_revisions
  where listing_id = p_listing_id and status = 'pending'
  for update;
  has_pending := found;

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

  proposal_title := case
    when p_moderated ? 'title' then trim(p_moderated->>'title')
    when has_pending and 'title' = any(pending_revision.changed_fields) then pending_revision.title
    else listing_record.title end;
  proposal_category := case
    when p_moderated ? 'category' then trim(p_moderated->>'category')
    when has_pending and 'category' = any(pending_revision.changed_fields) then pending_revision.category
    else listing_record.category end;
  proposal_instrument_type := case
    when p_moderated ? 'instrument_type' then trim(p_moderated->>'instrument_type')
    when has_pending and 'instrument_type' = any(pending_revision.changed_fields) then pending_revision.instrument_type
    else listing_record.instrument_type end;
  proposal_brand := case
    when p_moderated ? 'brand' then trim(p_moderated->>'brand')
    when has_pending and 'brand' = any(pending_revision.changed_fields) then pending_revision.brand
    else listing_record.brand end;
  proposal_model := case
    when p_moderated ? 'model' then trim(p_moderated->>'model')
    when has_pending and 'model' = any(pending_revision.changed_fields) then pending_revision.model
    else listing_record.model end;
  proposal_condition := case
    when p_moderated ? 'condition' then trim(p_moderated->>'condition')
    when has_pending and 'condition' = any(pending_revision.changed_fields) then pending_revision.condition
    else listing_record.condition end;
  proposal_attributes := case
    when has_pending and 'attributes' = any(pending_revision.changed_fields) then pending_revision.attributes
    else listing_record.attributes end;

  defer_attributes := not direct_edit
    and p_immediate ? 'attributes'
    and proposal_instrument_type is distinct from listing_record.instrument_type;
  if p_immediate ? 'attributes' then
    proposal_attributes := coalesce(p_immediate->'attributes', '{}'::jsonb);
  end if;
  proposal_touched := p_moderated <> '{}'::jsonb or p_photos is not null or defer_attributes;

  if nullif(proposal_title, '') is null
    or nullif(proposal_category, '') is null
    or nullif(proposal_instrument_type, '') is null
    or nullif(proposal_brand, '') is null
    or nullif(proposal_model, '') is null
    or nullif(proposal_condition, '') is null then
    raise exception 'LISTING_REVISION_REQUIRED_FIELD: Completa los campos principales.';
  end if;
  if not public.listing_taxonomy_is_valid(proposal_category, proposal_instrument_type) then
    raise exception 'LISTING_TAXONOMY_INVALID: La categoría y el tipo de instrumento no corresponden.';
  end if;
  if not public.listing_attribute_keys_are_valid(proposal_instrument_type, proposal_attributes) then
    raise exception 'LISTING_ATTRIBUTES_INVALID: Revisa las características del instrumento.';
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
  if p_photos is not null and not public.listing_photo_set_is_valid(p_listing_id, p_photos) then
    raise exception 'LISTING_PHOTO_INVALID: Revisa las fotos, su orden y su origen.';
  end if;

  perform set_config('app.allow_listing_admin_fields', 'true', true);

  if direct_edit and verified_edit and has_pending
    and (p_moderated <> '{}'::jsonb or p_photos is not null) then
    update public.listing_revisions
    set status = 'cancelled', reviewed_at = now(),
        resolution_reason = 'La Tienda Verificada aplicó una edición directa posterior.'
    where id = pending_revision.id;
    has_pending := false;
  end if;

  update public.listings
  set price_pen = case when p_immediate ? 'price_pen' then (p_immediate->>'price_pen')::integer else price_pen end,
      description = case when p_immediate ? 'description' then trim(p_immediate->>'description') else description end,
      city = case when p_immediate ? 'city' then trim(p_immediate->>'city') else city end,
      region = case when p_immediate ? 'region' then trim(p_immediate->>'region') else region end,
      attributes = case when p_immediate ? 'attributes' and not defer_attributes then coalesce(p_immediate->'attributes', '{}'::jsonb) else attributes end,
      title = case when direct_edit and p_moderated ? 'title' then proposal_title else title end,
      category = case when direct_edit and p_moderated ? 'category' then proposal_category else category end,
      instrument_type = case when direct_edit and p_moderated ? 'instrument_type' then proposal_instrument_type else instrument_type end,
      brand = case when direct_edit and p_moderated ? 'brand' then proposal_brand else brand end,
      model = case when direct_edit and p_moderated ? 'model' then proposal_model else model end,
      condition = case when direct_edit and p_moderated ? 'condition' then proposal_condition else condition end
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

  if has_pending and not proposal_touched then
    return jsonb_build_object(
      'listing_id', p_listing_id,
      'revision_id', pending_revision.id,
      'revision_version', pending_revision.version,
      'mode', 'immediate'
    );
  end if;

  if p_photos is not null then
    select exists (
      (select image_url, coalesce(alt_text, ''), sort_order
       from public.listing_photos where listing_id = p_listing_id
       except
       select photo->>'image_url', coalesce(nullif(trim(photo->>'alt_text'), ''), ''), (ordinality - 1)::integer
       from jsonb_array_elements(p_photos) with ordinality as photos(photo, ordinality))
      union all
      (select photo->>'image_url', coalesce(nullif(trim(photo->>'alt_text'), ''), ''), (ordinality - 1)::integer
       from jsonb_array_elements(p_photos) with ordinality as photos(photo, ordinality)
       except
       select image_url, coalesce(alt_text, ''), sort_order
       from public.listing_photos where listing_id = p_listing_id)
    ) into photos_changed;
  else
    photos_changed := has_pending and 'photos' = any(pending_revision.changed_fields);
  end if;

  select coalesce(array_agg(field order by ordinal), array[]::text[])
  into changed
  from (values
    ('title', proposal_title is distinct from listing_record.title, 1),
    ('category', proposal_category is distinct from listing_record.category, 2),
    ('instrument_type', proposal_instrument_type is distinct from listing_record.instrument_type, 3),
    ('attributes', proposal_attributes is distinct from listing_record.attributes, 4),
    ('brand', proposal_brand is distinct from listing_record.brand, 5),
    ('model', proposal_model is distinct from listing_record.model, 6),
    ('condition', proposal_condition is distinct from listing_record.condition, 7),
    ('photos', photos_changed, 8)
  ) as differences(field, differs, ordinal)
  where differs;

  if cardinality(changed) = 0 then
    if has_pending then
      update public.listing_revisions
      set status = 'cancelled', reviewed_at = now(), reviewed_by = null,
          rejection_reason = null,
          resolution_reason = 'El propietario restauró todos los valores aprobados.'
      where id = pending_revision.id;
    end if;
    return jsonb_build_object('listing_id', p_listing_id, 'revision_id', null, 'mode', 'revision_cancelled');
  end if;

  if has_pending then
    update public.listing_revisions
    set changed_fields = changed,
        title = case when 'title' = any(changed) then proposal_title else null end,
        category = case when 'category' = any(changed) then proposal_category else null end,
        instrument_type = case when 'instrument_type' = any(changed) then proposal_instrument_type else null end,
        attributes = case when 'attributes' = any(changed) then proposal_attributes else null end,
        brand = case when 'brand' = any(changed) then proposal_brand else null end,
        model = case when 'model' = any(changed) then proposal_model else null end,
        condition = case when 'condition' = any(changed) then proposal_condition else null end,
        submitted_at = now(),
        reviewed_at = null,
        reviewed_by = null,
        rejection_reason = null,
        resolution_reason = null,
        version = version + 1
    where id = pending_revision.id
    returning id into target_revision_id;
  else
    insert into public.listing_revisions (
      listing_id, owner_user_id, store_id, changed_fields,
      title, category, instrument_type, attributes, brand, model, condition
    ) values (
      p_listing_id, listing_record.owner_user_id, listing_record.store_id, changed,
      case when 'title' = any(changed) then proposal_title end,
      case when 'category' = any(changed) then proposal_category end,
      case when 'instrument_type' = any(changed) then proposal_instrument_type end,
      case when 'attributes' = any(changed) then proposal_attributes end,
      case when 'brand' = any(changed) then proposal_brand end,
      case when 'model' = any(changed) then proposal_model end,
      case when 'condition' = any(changed) then proposal_condition end
    ) returning id into target_revision_id;
  end if;

  if p_photos is not null then
    delete from public.listing_revision_photos where revision_id = target_revision_id;
    if photos_changed then
      insert into public.listing_revision_photos (revision_id, image_url, alt_text, sort_order)
      select target_revision_id,
             photo->>'image_url',
             nullif(trim(photo->>'alt_text'), ''),
             (ordinality - 1)::integer
      from jsonb_array_elements(p_photos) with ordinality as photos(photo, ordinality);
    end if;
  end if;

  return jsonb_build_object(
    'listing_id', p_listing_id,
    'revision_id', target_revision_id,
    'revision_version', (select version from public.listing_revisions where id = target_revision_id),
    'mode', case when has_pending then 'revision_amended' else 'revision' end
  );
end;
$$;

-- Replace the unsafe three-argument moderation entry point. Admin decisions
-- must name the proposal version that was actually reviewed.
drop function public.review_listing_revision(uuid, text, text);

create function public.review_listing_revision(
  p_revision_id uuid,
  p_decision text,
  p_expected_version integer,
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
  target_listing_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;

  select listing_id into target_listing_id
  from public.listing_revisions
  where id = p_revision_id;
  if not found then raise exception 'LISTING_REVISION_NOT_PENDING: La revisión no existe.'; end if;

  select * into listing_record
  from public.listings
  where id = target_listing_id
  for update;

  select * into revision
  from public.listing_revisions
  where id = p_revision_id
  for update;
  if revision.status <> 'pending' then
    raise exception 'LISTING_REVISION_NOT_PENDING: La revisión ya fue resuelta.';
  end if;
  if p_expected_version is null or revision.version <> p_expected_version then
    raise exception 'LISTING_REVISION_STALE: La propuesta cambió. Recarga y revisa la versión más reciente.';
  end if;
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
    perform public.create_account_notification(
      listing_record.owner_user_id,
      'listing_revision_approved',
      listing_record.id,
      listing_record.store_id
    );
  elsif p_decision = 'reject' then
    if nullif(trim(coalesce(p_reason, '')), '') is null then
      raise exception 'LISTING_REVISION_REJECTION_REASON_REQUIRED: La revisión requiere un motivo.';
    end if;
    update public.listing_revisions
    set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid(), rejection_reason = trim(p_reason)
    where id = revision.id returning * into revision;
    perform public.create_account_notification(
      listing_record.owner_user_id,
      'listing_revision_rejected',
      listing_record.id,
      listing_record.store_id
    );
  else
    raise exception 'LISTING_REVISION_REVIEW_INVALID: Acción de revisión no compatible.';
  end if;
  return revision;
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
    perform public.create_account_notification(listing_record.owner_user_id, 'listing_approved', listing_record.id, listing_record.store_id);
  elsif p_decision = 'reject' then
    if listing_record.status <> 'pending' or nullif(trim(coalesce(p_reason, '')), '') is null then
      raise exception 'LISTING_REJECTION_REASON_REQUIRED: La publicación pendiente requiere un motivo.';
    end if;
    update public.listings set status = 'rejected', rejection_reason = trim(p_reason)
    where id = p_listing_id returning * into listing_record;
    perform public.create_account_notification(listing_record.owner_user_id, 'listing_rejected', listing_record.id, listing_record.store_id);
  elsif p_decision = 'hide' then
    if listing_record.status <> 'approved' or nullif(trim(coalesce(p_reason, '')), '') is null then
      raise exception 'LISTING_HIDE_REASON_REQUIRED: La ocultación administrativa requiere un motivo.';
    end if;
    update public.listings
    set status = 'hidden', hidden_source = 'admin', hidden_reason = trim(p_reason), hidden_at = now()
    where id = p_listing_id returning * into listing_record;
    perform public.create_account_notification(listing_record.owner_user_id, 'listing_hidden', listing_record.id, listing_record.store_id);
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

create or replace function public.review_store_application(
  p_store_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.stores
language plpgsql
security definer
set search_path = public
as $$
declare
  store_record public.stores;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into store_record from public.stores where id = p_store_id for update;
  if not found then raise exception 'Store not found.'; end if;
  perform set_config('app.allow_store_admin_fields', 'true', true);

  if p_decision = 'approve' then
    if not public.store_application_is_complete(p_store_id) then raise exception 'Store application is incomplete.'; end if;
    update public.stores
    set status = 'active', is_verified = false, rejection_reason = null
    where id = p_store_id returning * into store_record;
    perform public.create_account_notification(store_record.owner_user_id, 'store_approved', null, store_record.id);
  elsif p_decision in ('reject', 'hide') then
    if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'A rejection or suspension reason is required.'; end if;
    update public.stores
    set status = case when p_decision = 'reject' then 'rejected'::public.store_status else 'hidden'::public.store_status end,
        is_verified = false,
        rejection_reason = trim(p_reason)
    where id = p_store_id returning * into store_record;
    if p_decision = 'reject' then
      perform public.create_account_notification(store_record.owner_user_id, 'store_rejected', null, store_record.id);
    end if;
  else
    raise exception 'Unsupported store decision.';
  end if;
  return store_record;
end;
$$;

create or replace function public.set_store_verification(
  p_store_id uuid,
  p_verified boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  store_record public.stores;
  approved_count integer := 0;
  pending_listing record;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into store_record from public.stores where id = p_store_id for update;
  if not found then raise exception 'Store not found.'; end if;

  if p_verified then
    if store_record.status <> 'active' then raise exception 'Only an active Tienda can be verified.'; end if;
    if not public.store_application_is_complete(p_store_id) then raise exception 'Store application is incomplete.'; end if;
    if exists (
      select 1 from public.listings l
      where l.store_id = p_store_id and l.seller_type = 'store' and l.status = 'pending'
        and not public.listing_meets_publish_requirements(l.id)
    ) then raise exception 'Pending inventory contains a listing that cannot be published.'; end if;

    perform set_config('app.allow_store_admin_fields', 'true', true);
    perform set_config('app.allow_listing_admin_fields', 'true', true);
    update public.stores set is_verified = true where id = p_store_id;
    for pending_listing in
      select id, owner_user_id from public.listings
      where store_id = p_store_id and seller_type = 'store' and status = 'pending'
      for update
    loop
      update public.listings
      set status = 'approved', published_at = coalesce(published_at, now())
      where id = pending_listing.id;
      approved_count := approved_count + 1;
      perform public.create_account_notification(pending_listing.owner_user_id, 'listing_approved', pending_listing.id, p_store_id);
    end loop;
    perform public.create_account_notification(store_record.owner_user_id, 'store_verified', null, p_store_id);
  else
    perform set_config('app.allow_store_admin_fields', 'true', true);
    update public.stores set is_verified = false where id = p_store_id;
    if store_record.is_verified then
      perform public.create_account_notification(store_record.owner_user_id, 'store_verification_revoked', null, p_store_id);
    end if;
  end if;

  return jsonb_build_object('store_id', p_store_id, 'is_verified', p_verified, 'approved_pending_count', approved_count);
end;
$$;

revoke all on function public.review_listing_revision(uuid, text, integer, text) from public, anon;
grant execute on function public.review_listing_revision(uuid, text, integer, text) to authenticated;
