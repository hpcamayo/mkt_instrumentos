-- Effortless Laria, batch "my-listings" (docs/ux-effortless/my-listings.md): listing lifecycle for owners.
--
--   * mine-07  "Ya lo vendí" from any state: an owner-hidden listing can be marked sold, and a pending listing can be
--              withdrawn as sold ("Lo vendí, retirar"). The withdrawn listing becomes `archived` with `sold_at`, so it
--              never becomes public without moderation.
--   * mine-10  Relisting opens a prefilled draft with a clean address instead of going straight to review.
--   * shop-08  "Duplicar" copies any owned listing into a new draft.
--   * mine-03  Moderators pick rejection reasons from a fixed list plus an optional note; the owner sees a checklist.
--   * mine-08  `availability_confirmed_at`: the owner's last "Sí, sigue disponible" (read by the check-ins).
--   * mine-12  Vacation mode: `paused_until` on the owner's listings; the listing says "Vuelve el …" until that date
--              and nothing needs to run for the pause to end.
--   * big-08   `purchase_checkins`: a signed-in buyer's own answer to "¿Compraste …?", and the seller's decision.
--
-- Shared check constraints are extended with laria_private.ux_add_check_values(), which keeps every value already
-- allowed (also values other batches add), so the migrations of the batches can run in any order.

-- ------------------------------------------------------------------ additive check-constraint helper

-- Rebuilds a simple `column = any (array[...])` check constraint with extra values, keeping the existing ones.
create or replace function laria_private.ux_add_check_values(p_table regclass, p_constraint text, p_values text[])
returns void
language plpgsql
set search_path = public, laria_private
as $$
declare
  definition text;
  column_name text;
  existing text[];
  merged text[];
begin
  select pg_get_constraintdef(c.oid), a.attname into definition, column_name
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.conrelid = p_table and c.conname = p_constraint and c.contype = 'c' and array_length(c.conkey, 1) = 1;
  if definition is null then
    raise exception 'UX_CHECK_CONSTRAINT_MISSING: %.%', p_table, p_constraint;
  end if;
  select coalesce(array_agg(match[1]), array[]::text[]) into existing
  from regexp_matches(definition, '''([^'']+)''::text', 'g') as match;
  select array_agg(distinct value order by value) into merged from unnest(existing || p_values) as value;
  execute format('alter table %s drop constraint %I', p_table, p_constraint);
  execute format('alter table %s add constraint %I check (%I = any (%L::text[]))', p_table, p_constraint, column_name, merged);
end;
$$;
revoke all on function laria_private.ux_add_check_values(regclass, text, text[]) from public, anon, authenticated;

-- ------------------------------------------------------------------ columns

alter table public.listings
  add column if not exists rejection_codes text[],
  add column if not exists availability_confirmed_at timestamptz,
  add column if not exists availability_checkin_at timestamptz,
  add column if not exists paused_until date;

alter table public.listing_revisions
  add column if not exists rejection_codes text[];

comment on column public.listings.rejection_codes is 'mine-03: reasons the moderator picked (laria_private.ux_rejection_reason_label). rejection_reason keeps the readable text.';
comment on column public.listings.availability_confirmed_at is 'mine-08: when the owner last answered "Sí, sigue disponible".';
comment on column public.listings.availability_checkin_at is 'mine-08: when Laria last asked "¿Sigue disponible?".';
comment on column public.listings.paused_until is 'mine-12: vacation mode. Until this date (inclusive, America/Lima) the listing says "Vuelve el …" and offers no WhatsApp contact.';

-- The new columns are owner state written only by the functions below.
create or replace function laria_private.ux_protect_listing_owner_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.allow_listing_admin_fields', true) = 'true' or public.is_admin() then return new; end if;
  if new.rejection_codes is distinct from old.rejection_codes
    or new.availability_confirmed_at is distinct from old.availability_confirmed_at
    or new.availability_checkin_at is distinct from old.availability_checkin_at
    or new.paused_until is distinct from old.paused_until then
    raise exception 'Only controlled server functions can change protected listing fields.';
  end if;
  return new;
end;
$$;
drop trigger if exists listings_ux_protect_owner_state on public.listings;
create trigger listings_ux_protect_owner_state
before update of rejection_codes, availability_confirmed_at, availability_checkin_at, paused_until on public.listings
for each row execute function laria_private.ux_protect_listing_owner_state();

-- A reason text cleared by approval or resubmission clears its codes too.
create or replace function laria_private.ux_clear_rejection_codes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.rejection_reason is null then new.rejection_codes := null; end if;
  return new;
end;
$$;
drop trigger if exists listings_ux_clear_rejection_codes on public.listings;
create trigger listings_ux_clear_rejection_codes
before insert or update of rejection_reason on public.listings
for each row execute function laria_private.ux_clear_rejection_codes();
drop trigger if exists listing_revisions_ux_clear_rejection_codes on public.listing_revisions;
create trigger listing_revisions_ux_clear_rejection_codes
before insert or update of rejection_reason on public.listing_revisions
for each row execute function laria_private.ux_clear_rejection_codes();

-- ------------------------------------------------------------------ mine-03 rejection reasons

-- The fixed list. Labels match lib/rejection-reasons.ts, which also maps each code to the fields it concerns.
create or replace function laria_private.ux_rejection_reason_label(p_code text)
returns text
language sql
immutable
as $$
  select case p_code
    when 'pocas_fotos' then 'Pocas fotos o fotos poco claras'
    when 'falta_reverso' then 'Falta una foto del reverso o de los detalles'
    when 'precio_incoherente' then 'El precio no es coherente con el equipo'
    when 'contacto_en_descripcion' then 'Datos de contacto en la descripción'
    when 'descripcion_incompleta' then 'La descripción no explica el estado real'
    when 'titulo_impreciso' then 'El título no identifica el equipo'
    when 'categoria_incorrecta' then 'Categoría o tipo incorrectos'
    when 'marca_modelo' then 'Marca o modelo incorrectos'
    when 'condicion_incoherente' then 'La condición no coincide con las fotos'
    when 'articulo_prohibido' then 'El equipo está entre los Artículos prohibidos'
  end;
$$;

-- Validated, de-duplicated codes plus the readable reason the owner, the e-mail and the admin history show.
create or replace function laria_private.ux_rejection_reason(p_codes text[], p_note text)
returns table(codes text[], reason text)
language plpgsql
immutable
as $$
declare
  clean text[];
  note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if p_codes is not null and exists (select 1 from unnest(p_codes) code where laria_private.ux_rejection_reason_label(code) is null) then
    raise exception 'LISTING_REJECTION_CODE_INVALID: Motivo de rechazo no compatible.';
  end if;
  select array_agg(code order by first_position) into clean
  from (select code, min(position) first_position from unnest(coalesce(p_codes, array[]::text[])) with ordinality as item(code, position) group by code) codes;
  codes := clean;
  if clean is null then
    reason := note;
  else
    reason := (select string_agg(laria_private.ux_rejection_reason_label(code), '; ' order by position)
               from unnest(clean) with ordinality as item(code, position))
      || case when note is null then '.' else '. Nota: ' || note end;
  end if;
  return next;
end;
$$;

-- review_listing and review_listing_revision gain p_reason_codes. A rejection needs at least one code or a note.
drop function if exists public.review_listing(uuid, text, text);
create or replace function public.review_listing(p_listing_id uuid, p_decision text, p_reason text default null, p_reason_codes text[] default null)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_record public.listings;
  rejection record;
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
    select * into rejection from laria_private.ux_rejection_reason(p_reason_codes, p_reason);
    if listing_record.status <> 'pending' or rejection.reason is null then
      raise exception 'LISTING_REJECTION_REASON_REQUIRED: La publicación pendiente requiere un motivo.';
    end if;
    update public.listings set status = 'rejected', rejection_reason = rejection.reason, rejection_codes = rejection.codes
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
  elsif p_decision = 'sold' then
    if listing_record.status <> 'approved' then
      raise exception 'LISTING_SOLD_INVALID: Solo una publicación aprobada puede marcarse como vendida.';
    end if;
    update public.listing_revisions
    set status = 'cancelled', reviewed_at = now(),
        resolution_reason = 'La publicación fue marcada como vendida por administración.'
    where listing_id = p_listing_id and status = 'pending';
    update public.listings
    set status = 'sold', sold_at = coalesce(sold_at, now()),
        hidden_source = null, hidden_reason = null, hidden_at = null
    where id = p_listing_id returning * into listing_record;
  else
    raise exception 'LISTING_REVIEW_ACTION_INVALID: Acción de moderación no compatible.';
  end if;
  return listing_record;
end;
$$;
revoke all on function public.review_listing(uuid, text, text, text[]) from public, anon;
grant execute on function public.review_listing(uuid, text, text, text[]) to authenticated, service_role;

drop function if exists public.review_listing_revision(uuid, text, integer, text);
create or replace function public.review_listing_revision(p_revision_id uuid, p_decision text, p_expected_version integer, p_reason text default null, p_reason_codes text[] default null)
returns public.listing_revisions
language plpgsql
security definer
set search_path = public
as $$
declare
  revision public.listing_revisions;
  listing_record public.listings;
  target_listing_id uuid;
  rejection record;
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
    select * into rejection from laria_private.ux_rejection_reason(p_reason_codes, p_reason);
    if rejection.reason is null then
      raise exception 'LISTING_REVISION_REJECTION_REASON_REQUIRED: La revisión requiere un motivo.';
    end if;
    update public.listing_revisions
    set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid(),
        rejection_reason = rejection.reason, rejection_codes = rejection.codes
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
revoke all on function public.review_listing_revision(uuid, text, integer, text, text[]) from public, anon;
grant execute on function public.review_listing_revision(uuid, text, integer, text, text[]) to authenticated, service_role;

-- ------------------------------------------------------------------ mine-07 sold from any state

-- 'sold' now also accepts an owner-hidden listing; 'withdraw_sold' retires a pending listing that sold during review.
create or replace function public.set_owned_listing_lifecycle(p_listing_id uuid, p_action text)
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
    if not (listing_record.status = 'approved'
      or (listing_record.status = 'hidden' and listing_record.hidden_source = 'owner')) then
      raise exception 'LISTING_SOLD_INVALID: Solo una publicación aprobada u ocultada por ti puede marcarse como vendida.';
    end if;
    update public.listing_revisions
    set status = 'cancelled', reviewed_at = now(),
        resolution_reason = 'La publicación fue marcada como vendida.'
    where listing_id = p_listing_id and status = 'pending';
    update public.listings
    set status = 'sold', sold_at = coalesce(sold_at, now()),
        hidden_source = null, hidden_reason = null, hidden_at = null
    where id = p_listing_id returning * into listing_record;
  elsif p_action = 'withdraw_sold' then
    if listing_record.status not in ('pending', 'draft', 'rejected') then
      raise exception 'LISTING_WITHDRAW_INVALID: Solo una publicación que aún no se publica puede retirarse como vendida.';
    end if;
    update public.listings
    set status = 'archived', archived_at = now(), sold_at = coalesce(sold_at, now())
    where id = p_listing_id returning * into listing_record;
  else
    raise exception 'LISTING_LIFECYCLE_ACTION_INVALID: Acción no compatible.';
  end if;

  return listing_record;
end;
$$;

-- ------------------------------------------------------------------ mine-10 / shop-08 drafts from a listing

-- p_mode 'relist': the sold listing becomes the source of a new draft linked by relisted_from_listing_id.
-- p_mode 'duplicate': any owned listing except an archived or moderation-hidden one.
-- The draft has a clean address (title + id, like a new listing) and the same photos; the owner adjusts it on the
-- edit page and sends it with "Enviar a revisión" (or "Publicar" for a Tienda verificada).
create or replace function public.copy_owned_listing(p_listing_id uuid, p_mode text)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  original public.listings;
  copy public.listings;
  new_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'LISTING_NOT_OWNED'; end if;
  if p_mode not in ('relist', 'duplicate') then raise exception 'LISTING_COPY_MODE_INVALID: Acción no compatible.'; end if;
  select * into original from public.listings where id = p_listing_id for update;
  if not found or original.owner_user_id is distinct from auth.uid() then
    raise exception 'LISTING_NOT_OWNED: No puedes copiar esta publicación.';
  end if;
  if p_mode = 'relist' and original.status <> 'sold' then
    raise exception 'LISTING_RELIST_INVALID: Solo se puede republicar una publicación vendida.';
  end if;
  if p_mode = 'duplicate' and (original.status = 'archived' or (original.status = 'hidden' and original.hidden_source = 'admin')) then
    raise exception 'LISTING_COPY_INVALID: Esta publicación no se puede duplicar.';
  end if;
  if original.store_id is not null and not exists (
    select 1 from public.stores store
    where store.id = original.store_id and store.owner_user_id = auth.uid() and store.status in ('pending', 'active')
  ) then
    raise exception 'STORE_NOT_ELIGIBLE: La tienda no puede recibir nuevo inventario.';
  end if;

  insert into public.listings (
    id, store_id, seller_type, status, title, slug, description, category,
    brand, model, condition, price_pen, city, region, contact_name,
    whatsapp_phone, owner_user_id, created_by_source,
    marketplace_rules_accepted_at, instrument_type, attributes, relisted_from_listing_id
  ) values (
    new_id, original.store_id, original.seller_type, 'draft',
    original.title, laria_private.listing_slug(original.title, new_id),
    original.description, original.category, original.brand, original.model,
    original.condition, original.price_pen, original.city, original.region,
    original.contact_name, original.whatsapp_phone, original.owner_user_id,
    'self_service', original.marketplace_rules_accepted_at,
    original.instrument_type, original.attributes,
    case when p_mode = 'relist' then original.id end
  ) returning * into copy;

  insert into public.listing_photos (listing_id, image_url, alt_text, sort_order)
  select copy.id, image_url, alt_text, sort_order
  from public.listing_photos where listing_id = original.id
  order by sort_order;

  return copy;
end;
$$;
revoke all on function public.copy_owned_listing(uuid, text) from public, anon;
grant execute on function public.copy_owned_listing(uuid, text) to authenticated, service_role;

-- ------------------------------------------------------------------ mine-04 inline price and bulk hide/restore

-- One price, from the list. Same rules as the immediate edit: whole soles, owned, not sold or moderation-hidden.
create or replace function public.set_owned_listing_price(p_listing_id uuid, p_price_pen integer)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_record public.listings;
begin
  if p_price_pen is null or p_price_pen < 0 or p_price_pen > 100000000 then
    raise exception 'LISTING_PRICE_INVALID: Ingresa un precio válido en soles enteros.';
  end if;
  perform public.apply_owned_listing_edit(p_listing_id, jsonb_build_object('price_pen', p_price_pen), '{}'::jsonb, null);
  select * into listing_record from public.listings where id = p_listing_id;
  return listing_record;
end;
$$;
revoke all on function public.set_owned_listing_price(uuid, integer) from public, anon;
grant execute on function public.set_owned_listing_price(uuid, integer) to authenticated, service_role;

-- Hide or restore several owned listings at once; each one follows set_owned_listing_lifecycle. Returns the ids that
-- changed and, per id, why one did not (the list shows "3 ocultas, 1 no se pudo").
create or replace function public.set_owned_listings_lifecycle_bulk(p_listing_ids uuid[], p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_id uuid;
  changed uuid[] := array[]::uuid[];
  failed jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'LISTING_NOT_OWNED'; end if;
  if p_action not in ('hide', 'restore') then raise exception 'LISTING_LIFECYCLE_ACTION_INVALID: Acción no compatible.'; end if;
  if p_listing_ids is null or cardinality(p_listing_ids) = 0 or cardinality(p_listing_ids) > 100 then
    raise exception 'LISTING_BULK_INVALID: Elige entre 1 y 100 publicaciones.';
  end if;
  foreach listing_id in array (select array_agg(distinct id order by id) from unnest(p_listing_ids) id) loop
    begin
      perform public.set_owned_listing_lifecycle(listing_id, p_action);
      changed := changed || listing_id;
    exception when others then
      failed := failed || jsonb_build_object('id', listing_id, 'code', split_part(sqlerrm, ':', 1));
    end;
  end loop;
  return jsonb_build_object('changed', to_jsonb(changed), 'failed', failed);
end;
$$;
revoke all on function public.set_owned_listings_lifecycle_bulk(uuid[], text) from public, anon;
grant execute on function public.set_owned_listings_lifecycle_bulk(uuid[], text) to authenticated, service_role;

-- ------------------------------------------------------------------ mine-12 vacation mode

-- Pauses every listing the caller owns (Particular or store) until p_until, or ends the pause with null.
-- At most 90 days ahead. Listings published during a pause start unpaused.
create or replace function public.set_owned_listings_pause(p_until date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Lima')::date;
  touched integer;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'LISTING_NOT_OWNED'; end if;
  if p_until is not null and (p_until <= today or p_until > today + 90) then
    raise exception 'LISTING_PAUSE_INVALID: Elige una fecha entre mañana y los próximos 90 días.';
  end if;
  perform set_config('app.allow_listing_admin_fields', 'true', true);
  update public.listings
  set paused_until = p_until
  where owner_user_id = auth.uid()
    and status in ('draft', 'pending', 'approved', 'hidden', 'rejected')
    and paused_until is distinct from p_until;
  get diagnostics touched = row_count;
  return jsonb_build_object('paused_until', p_until, 'listings', touched);
end;
$$;
revoke all on function public.set_owned_listings_pause(date) from public, anon;
grant execute on function public.set_owned_listings_pause(date) to authenticated, service_role;

-- True while the listing's pause runs (inclusive of the return date's eve, America/Lima).
create or replace function public.listing_is_paused(p_paused_until date)
returns boolean
language sql
stable
as $$
  select p_paused_until is not null and p_paused_until > (now() at time zone 'America/Lima')::date;
$$;
grant execute on function public.listing_is_paused(date) to anon, authenticated, service_role;

-- ------------------------------------------------------------------ mine-08 availability answer

-- "Sí, sigue disponible": records the answer; the listing's first publication date does not change.
create or replace function public.confirm_listing_available(p_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_record public.listings;
begin
  select * into listing_record from public.listings where id = p_listing_id for update;
  if not found or listing_record.owner_user_id is distinct from auth.uid() then
    raise exception 'LISTING_NOT_OWNED: No puedes administrar esta publicación.';
  end if;
  if listing_record.status not in ('approved', 'hidden') then
    raise exception 'LISTING_AVAILABILITY_INVALID: Solo una publicación publicada u oculta puede confirmarse.';
  end if;
  perform set_config('app.allow_listing_admin_fields', 'true', true);
  update public.listings set availability_confirmed_at = now() where id = p_listing_id returning * into listing_record;
  update public.notifications set read_at = coalesce(read_at, now())
  where user_id = auth.uid() and listing_id = p_listing_id and event_type = 'listing_availability_checkin';
  return listing_record;
end;
$$;
revoke all on function public.confirm_listing_available(uuid) from public, anon;
grant execute on function public.confirm_listing_available(uuid) to authenticated, service_role;

-- ------------------------------------------------------------------ big-08 buyer-side purchase check-ins

create table if not exists public.purchase_checkins (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_user_id uuid not null references public.profiles(id) on delete cascade,
  seller_user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  contacted_at timestamptz not null,
  asked_at timestamptz,
  answer text check (answer in ('yes', 'no')),
  answered_at timestamptz,
  seller_decision text check (seller_decision in ('confirmed', 'declined')),
  seller_decided_at timestamptz,
  claim_id uuid references public.transaction_claims(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (listing_id, buyer_user_id),
  check ((answer is null) = (answered_at is null)),
  check (seller_decision is null or answer = 'yes'),
  check ((seller_decision is null) = (seller_decided_at is null))
);
create index if not exists purchase_checkins_buyer_idx on public.purchase_checkins(buyer_user_id, created_at desc);
create index if not exists purchase_checkins_seller_open_idx on public.purchase_checkins(seller_user_id, answered_at desc)
  where answer = 'yes' and seller_decision is null;

alter table public.purchase_checkins enable row level security;
revoke all on public.purchase_checkins from anon, authenticated;
grant select on public.purchase_checkins to authenticated;
drop policy if exists "Buyers read own purchase check-ins" on public.purchase_checkins;
create policy "Buyers read own purchase check-ins" on public.purchase_checkins
  for select to authenticated using (buyer_user_id = auth.uid());
drop policy if exists "Sellers read buyer purchase reports" on public.purchase_checkins;
create policy "Sellers read buyer purchase reports" on public.purchase_checkins
  for select to authenticated using (seller_user_id = auth.uid() and answer = 'yes');

comment on table public.purchase_checkins is 'big-08: a signed-in buyer who opened WhatsApp from a listing answers "¿Compraste …?". Only "Sí" reaches the seller, who confirms or declines; "No" or silence change nothing.';
