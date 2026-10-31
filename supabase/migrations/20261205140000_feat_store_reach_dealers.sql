-- Feature ideas, batch "store-reach" (docs/feature-ideas/store-reach.md): reach-04 "Distribuidor oficial".
--
-- A store that is an authorized dealer of a brand uploads the brand's authorization; Admin reads it and approves or
-- rejects it. While approved (and before its optional end date), the store's new publications of that brand show
-- "Distribuidor oficial <marca>", its store page lists the brand, and the catalog filtered by that brand names the
-- brand's dealers on Laria. What Laria checked is the document, never the instruments: the warranty is the store's and
-- the manufacturer's, and the page says so.
--
-- Upload flow, like the import photos (STORE-3a): the owner asks for a slot (request_dealer_authorization_upload),
-- uploads the file to exactly the path issued, in the private bucket store-dealer-documents, and the server checks the
-- bytes with the service role (complete_dealer_authorization_upload) before the request reaches Admin. Admin opens the
-- document through a short signed link. Every Admin decision is audited and notifies the owner in the app.
--
-- Additive: one table, one bucket and its policies, eleven functions, new values in two text checks
-- (notification event types and the audit target type). No existing function is redefined.

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('store-dealer-documents', 'store-dealer-documents', false, 5242880,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.store_dealer_authorizations (
  id                   uuid primary key default gen_random_uuid(),
  store_id             uuid not null references public.stores(id) on delete cascade,
  brand                text not null check (char_length(brand) between 2 and 60 and brand = btrim(brand)),
  -- Folded brand (catalog_fold, single spaces): how publications and the catalog filter are matched.
  brand_key            text not null check (char_length(brand_key) between 2 and 60),
  status               text not null default 'awaiting_document'
                         check (status in ('awaiting_document', 'pending', 'approved', 'rejected', 'revoked', 'withdrawn')),
  document_path        text not null unique,
  document_name        text not null check (char_length(document_name) between 1 and 120),
  document_type        text not null check (document_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  document_bytes       integer not null check (document_bytes between 1 and 5242880),
  document_sha256      text check (document_sha256 ~ '^[0-9a-f]{64}$'),
  document_checked_at  timestamptz,
  -- The last day the authorization covers, when the document says so.
  valid_until          date,
  owner_note           text check (owner_note is null or char_length(owner_note) <= 500),
  created_by           uuid not null references auth.users(id) on delete restrict,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  submitted_at         timestamptz,
  reviewed_by          uuid references auth.users(id) on delete set null,
  reviewed_at          timestamptz,
  review_reason        text check (review_reason is null or char_length(review_reason) between 3 and 500),
  revision             integer not null default 1 check (revision >= 1),
  constraint store_dealer_authorizations_checked check (
    status in ('awaiting_document', 'withdrawn') or (document_checked_at is not null and document_sha256 is not null and submitted_at is not null)),
  constraint store_dealer_authorizations_reviewed check (
    status not in ('approved', 'rejected', 'revoked') or (reviewed_at is not null and reviewed_by is not null)),
  constraint store_dealer_authorizations_reason check (status not in ('rejected', 'revoked') or review_reason is not null)
);
create index if not exists store_dealer_authorizations_created_by_idx on public.store_dealer_authorizations (created_by);
create index if not exists store_dealer_authorizations_reviewed_by_idx on public.store_dealer_authorizations (reviewed_by)
  where reviewed_by is not null;

comment on table public.store_dealer_authorizations is
  'reach-04: a store''s authorization to sell a brand as an official dealer, checked by Admin. Written only by functions.';

-- One open request per store and brand.
create unique index store_dealer_authorizations_open_idx on public.store_dealer_authorizations (store_id, brand_key)
  where status in ('awaiting_document', 'pending', 'approved');
create index store_dealer_authorizations_review_idx on public.store_dealer_authorizations (status, submitted_at);
create index if not exists store_dealer_authorizations_store_id_idx on public.store_dealer_authorizations (store_id);
create index store_dealer_authorizations_brand_idx on public.store_dealer_authorizations (brand_key) where status = 'approved';

alter table public.store_dealer_authorizations enable row level security;
revoke all on public.store_dealer_authorizations from public, anon, authenticated;

select laria_private.ux_extend_text_check(
  'public.notifications', 'notifications_event_type_check', 'event_type',
  array['store_dealer_approved', 'store_dealer_rejected', 'store_dealer_revoked']
);
select laria_private.ux_extend_text_check(
  'public.admin_audit_actions', 'admin_audit_actions_target_type_check', 'target_type',
  array['dealer_authorization']
);

-- Whether the caller may upload this object: the path the database issued them, while the request waits for its
-- document. A function, because the table has no grants and every policy on storage.objects is planned for every
-- upload, whatever its bucket.
create or replace function public.dealer_document_upload_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.store_dealer_authorizations d
    where d.document_path = p_name and d.created_by = auth.uid() and d.status = 'awaiting_document'
      and public.is_store_owner(d.store_id)
  )
$$;
revoke all on function public.dealer_document_upload_allowed(text) from public, anon, authenticated;
grant execute on function public.dealer_document_upload_allowed(text) to authenticated;

-- The owner uploads exactly the path the database issued, once, while the request waits for its document. No update
-- or delete policy: a document cannot be replaced, and only the service role removes objects.
create policy "Store owners upload their dealer documents" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'store-dealer-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.dealer_document_upload_allowed(name)
);

-- ------------------------------------------------------------------ helpers

create or replace function laria_private.dealer_brand_key(p_brand text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select nullif(btrim(regexp_replace(public.catalog_fold(p_brand), '\s+', ' ', 'g')), '')
$$;

-- Lima's date: an authorization is in force through its valid_until day.
create or replace function laria_private.dealer_today()
returns date
language sql
stable
as $$ select (now() at time zone 'America/Lima')::date $$;

create or replace function laria_private.dealer_authorization_json(p_row public.store_dealer_authorizations)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p_row.id, 'brand', p_row.brand, 'status', p_row.status,
    'active', p_row.status = 'approved' and (p_row.valid_until is null or p_row.valid_until >= laria_private.dealer_today()),
    'document_name', p_row.document_name, 'document_type', p_row.document_type, 'document_bytes', p_row.document_bytes,
    'valid_until', p_row.valid_until, 'owner_note', p_row.owner_note, 'created_at', p_row.created_at,
    'submitted_at', p_row.submitted_at, 'reviewed_at', p_row.reviewed_at, 'review_reason', p_row.review_reason,
    'revision', p_row.revision)
$$;

-- ------------------------------------------------------------------ owner

-- Opens a request for one brand and issues the upload path. An earlier request for the same brand still waiting for
-- its document is replaced; a pending or approved one blocks a second. At most 20 open requests per store.
create or replace function public.request_dealer_authorization_upload(
  p_brand text, p_file_name text, p_file_type text, p_file_bytes integer, p_valid_until date default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_store public.stores := laria_private.reach_caller_store(true);
  v_brand text := btrim(regexp_replace(coalesce(p_brand, ''), '\s+', ' ', 'g'));
  v_key text := laria_private.dealer_brand_key(p_brand);
  v_name text := left(btrim(regexp_replace(coalesce(p_file_name, ''), '[[:cntrl:]/\\]+', '', 'g')), 120);
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid := gen_random_uuid();
  v_ext text;
  created public.store_dealer_authorizations;
begin
  if char_length(v_brand) not between 2 and 60 or v_key is null or char_length(v_key) < 2 then
    raise exception using errcode = 'P0001', message = 'DEALER_BRAND_INVALID: Escribe la marca como figura en la autorización (2 a 60 caracteres).';
  end if;
  v_ext := case p_file_type when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
  if v_ext is null then
    raise exception using errcode = 'P0001', message = 'DEALER_DOCUMENT_INVALID: Sube la autorización en PDF, JPG, PNG o WebP.';
  end if;
  if p_file_bytes is null or p_file_bytes not between 1 and 5242880 then
    raise exception using errcode = 'P0001', message = 'DEALER_DOCUMENT_INVALID: El archivo debe pesar como máximo 5 MB.';
  end if;
  if v_name = '' then v_name := 'autorizacion.' || v_ext; end if;
  if p_valid_until is not null and (p_valid_until < laria_private.dealer_today() or p_valid_until > laria_private.dealer_today() + 3650) then
    raise exception using errcode = 'P0001', message = 'DEALER_VALID_UNTIL_INVALID: La fecha de vigencia debe ser futura.';
  end if;
  -- The brand's usual spelling: the catalog's name, else the one most publications use, else as typed.
  v_brand := left(coalesce(
    (select btrim(m.canonical_name) from public.catalog_manufacturers m
     where laria_private.dealer_brand_key(m.canonical_name) = v_key order by m.canonical_name limit 1),
    (select btrim(m.canonical_name) from public.catalog_manufacturer_aliases a join public.catalog_manufacturers m on m.id = a.manufacturer_id
     where laria_private.dealer_brand_key(a.alias) = v_key order by m.canonical_name limit 1),
    (select btrim(l.brand) from public.listings l
     where l.status in ('approved', 'sold') and laria_private.dealer_brand_key(l.brand) = v_key
     group by btrim(l.brand) order by count(*) desc, btrim(l.brand) limit 1),
    v_brand), 60);
  if v_note is not null and char_length(v_note) > 500 then
    raise exception using errcode = 'P0001', message = 'DEALER_NOTE_INVALID: La nota puede tener hasta 500 caracteres.';
  end if;

  -- One request at a time per store, without blocking the KEY SHARE that inserts referencing the store take.
  perform 1 from public.stores s where s.id = caller_store.id for no key update;
  if exists (select 1 from public.store_dealer_authorizations d
             where d.store_id = caller_store.id and d.brand_key = v_key and d.status in ('pending', 'approved')) then
    raise exception using errcode = 'P0001', message = 'DEALER_ALREADY_OPEN: Ya tienes una autorización de esta marca en revisión o aprobada.';
  end if;
  update public.store_dealer_authorizations d set status = 'withdrawn', updated_at = now(), revision = d.revision + 1
  where d.store_id = caller_store.id and d.brand_key = v_key and d.status = 'awaiting_document';
  if (select count(*) from public.store_dealer_authorizations d
      where d.store_id = caller_store.id and d.status in ('awaiting_document', 'pending', 'approved')) >= 20 then
    raise exception using errcode = 'P0001', message = 'DEALER_LIMIT: Puedes tener hasta 20 autorizaciones abiertas.';
  end if;

  insert into public.store_dealer_authorizations (id, store_id, brand, brand_key, document_path, document_name, document_type,
    document_bytes, valid_until, owner_note, created_by)
  values (v_id, caller_store.id, v_brand, v_key, auth.uid()::text || '/' || v_id::text || '/autorizacion.' || v_ext, v_name,
    p_file_type, p_file_bytes, p_valid_until, v_note, auth.uid())
  returning * into created;
  return laria_private.dealer_authorization_json(created)
    || jsonb_build_object('upload', jsonb_build_object('bucket', 'store-dealer-documents', 'path', created.document_path));
end;
$$;

-- Called by the server with the service role after it read the uploaded bytes and checked their type: the request
-- goes to Admin. p_owner is the signed-in owner the server verified.
create or replace function public.complete_dealer_authorization_upload(
  p_id uuid, p_owner uuid, p_document_type text, p_document_bytes integer, p_sha256 text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_now public.store_dealer_authorizations;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'DEALER_SERVICE_REQUIRED: Solo el servidor puede revisar el archivo.';
  end if;
  select * into row_now from public.store_dealer_authorizations d where d.id = p_id and d.created_by = p_owner for update;
  if row_now.id is null or row_now.status <> 'awaiting_document' then
    raise exception using errcode = 'P0001', message = 'DEALER_NOT_FOUND: Esta solicitud ya no espera un archivo.';
  end if;
  if p_document_type is distinct from row_now.document_type or p_document_bytes is null or p_document_bytes not between 1 and 5242880
     or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'DEALER_DOCUMENT_INVALID: El archivo no coincide con el tipo indicado.';
  end if;
  update public.store_dealer_authorizations d set status = 'pending', document_bytes = p_document_bytes,
    document_sha256 = p_sha256, document_checked_at = now(), submitted_at = now(), updated_at = now(), revision = d.revision + 1
  where d.id = p_id
  returning * into row_now;
  return laria_private.dealer_authorization_json(row_now);
end;
$$;

-- The owner withdraws a request or an approved authorization; the mark disappears at once.
create or replace function public.withdraw_dealer_authorization(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_store public.stores := laria_private.reach_caller_store(false);
  row_now public.store_dealer_authorizations;
begin
  update public.store_dealer_authorizations d set status = 'withdrawn', updated_at = now(), revision = d.revision + 1
  where d.id = p_id and d.store_id = caller_store.id and d.status in ('awaiting_document', 'pending', 'approved')
  returning * into row_now;
  if row_now.id is null then
    raise exception using errcode = 'P0001', message = 'DEALER_NOT_FOUND: No encontramos esa autorización.';
  end if;
  return laria_private.dealer_authorization_json(row_now);
end;
$$;

-- The owner's requests, newest first (withdrawn ones only from the last 90 days).
create or replace function public.get_store_dealer_authorizations()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(laria_private.dealer_authorization_json(d) order by d.created_at desc), '[]'::jsonb)
  from public.store_dealer_authorizations d
  where d.store_id = (laria_private.reach_caller_store(false)).id
    and (d.status <> 'withdrawn' or d.updated_at > now() - interval '90 days')
$$;

-- ------------------------------------------------------------------ Admin

create or replace function public.admin_get_dealer_authorizations(p_status text default 'pending')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED: Solo Admin puede revisar autorizaciones.';
  end if;
  if p_status is not null and p_status not in ('pending', 'approved', 'rejected', 'revoked', 'withdrawn') then
    raise exception using errcode = 'P0001', message = 'DEALER_STATUS_INVALID: Estado no válido.';
  end if;
  return coalesce((
    select jsonb_agg(laria_private.dealer_authorization_json(d) || jsonb_build_object(
      'store_id', s.id, 'store_name', s.name, 'store_slug', s.slug, 'store_status', s.status, 'store_ruc', s.ruc,
      'store_verified', s.is_verified)
      order by coalesce(d.submitted_at, d.created_at) asc)
    from (select * from public.store_dealer_authorizations x
          where (p_status is null and x.status <> 'awaiting_document') or x.status = p_status
          order by coalesce(x.submitted_at, x.created_at) asc limit 200) d
    join public.stores s on s.id = d.store_id), '[]'::jsonb);
end;
$$;

-- The document path for the Admin viewer route (which signs a short link with the service role).
create or replace function public.admin_get_dealer_document(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  row_now public.store_dealer_authorizations;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED: Solo Admin puede ver autorizaciones.';
  end if;
  select * into row_now from public.store_dealer_authorizations d where d.id = p_id and d.document_checked_at is not null;
  if row_now.id is null then
    raise exception using errcode = 'P0001', message = 'DEALER_NOT_FOUND: No encontramos ese documento.';
  end if;
  return jsonb_build_object('bucket', 'store-dealer-documents', 'path', row_now.document_path,
    'name', row_now.document_name, 'type', row_now.document_type);
end;
$$;

-- approve (pending → approved), reject (pending → rejected, reason required) or revoke (approved → revoked, reason
-- required). p_valid_until on approval sets or corrects the end date Admin read in the document.
create or replace function public.admin_review_dealer_authorization(
  p_id uuid, p_decision text, p_expected_revision integer, p_reason text default null, p_valid_until date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_now public.store_dealer_authorizations;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_owner uuid;
  v_status text;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED: Solo Admin puede revisar autorizaciones.';
  end if;
  if p_decision not in ('approve', 'reject', 'revoke') then
    raise exception using errcode = 'P0001', message = 'DEALER_DECISION_INVALID: Decisión no válida.';
  end if;
  if v_reason is not null and char_length(v_reason) not between 3 and 500 then
    raise exception using errcode = 'P0001', message = 'DEALER_REASON_INVALID: El motivo debe tener entre 3 y 500 caracteres.';
  end if;
  if p_decision in ('reject', 'revoke') and v_reason is null then
    raise exception using errcode = 'P0001', message = 'DEALER_REASON_REQUIRED: Escribe el motivo; la tienda lo verá.';
  end if;
  select * into row_now from public.store_dealer_authorizations d where d.id = p_id for update;
  if row_now.id is null then
    raise exception using errcode = 'P0001', message = 'DEALER_NOT_FOUND: No encontramos esa autorización.';
  end if;
  if row_now.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'DEALER_STALE: La autorización cambió. Vuelve a cargar la página.';
  end if;
  if (p_decision in ('approve', 'reject') and row_now.status <> 'pending') or (p_decision = 'revoke' and row_now.status <> 'approved') then
    raise exception using errcode = 'P0001', message = 'DEALER_STALE: La autorización ya no está en ese estado.';
  end if;
  if p_decision = 'approve' and p_valid_until is not null and p_valid_until < laria_private.dealer_today() then
    raise exception using errcode = 'P0001', message = 'DEALER_VALID_UNTIL_INVALID: La fecha de vigencia ya pasó.';
  end if;
  v_status := case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'revoked' end;

  update public.store_dealer_authorizations d set status = v_status, reviewed_by = auth.uid(), reviewed_at = now(),
    review_reason = v_reason, valid_until = case when p_decision = 'approve' then coalesce(p_valid_until, d.valid_until) else d.valid_until end,
    updated_at = now(), revision = d.revision + 1
  where d.id = p_id
  returning * into row_now;

  insert into public.admin_audit_actions (admin_user_id, action, target_type, target_id, detail)
  values (auth.uid(), 'dealer_authorization_' || v_status, 'dealer_authorization', row_now.id,
    jsonb_build_object('store_id', row_now.store_id, 'brand', row_now.brand, 'reason', v_reason, 'valid_until', row_now.valid_until));

  select s.owner_user_id into v_owner from public.stores s where s.id = row_now.store_id;
  if v_owner is not null then
    insert into public.notifications (user_id, event_type, store_id, message)
    values (v_owner, 'store_dealer_' || case v_status when 'approved' then 'approved' when 'rejected' then 'rejected' else 'revoked' end,
      row_now.store_id,
      case v_status
        when 'approved' then 'Laria aprobó tu autorización de ' || row_now.brand || '. Tus publicaciones nuevas de la marca muestran «Distribuidor oficial».'
        when 'rejected' then 'Laria no aprobó tu autorización de ' || row_now.brand || ': ' || v_reason
        else 'Laria retiró tu marca de distribuidor oficial de ' || row_now.brand || ': ' || v_reason end);
  end if;
  return laria_private.dealer_authorization_json(row_now);
end;
$$;

-- ------------------------------------------------------------------ public

-- Every authorization in force, of active stores: small, read once and shared by the listing page, the store page and
-- the catalog (lib/dealers.ts). keys: every spelling of the brand that a publication's brand may use (the brand itself,
-- and the catalog's canonical name and aliases when the catalog knows the brand).
create or replace function public.get_active_dealer_authorizations()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'brand', d.brand, 'valid_until', d.valid_until, 'store_id', s.id, 'store_slug', s.slug, 'store_name', s.name,
    'store_city', s.city, 'store_verified', s.is_verified,
    'keys', (select jsonb_agg(distinct k.key) from (
      select d.brand_key as key
      union all
      select laria_private.dealer_brand_key(m.canonical_name) from public.catalog_manufacturers m
      where laria_private.dealer_brand_key(m.canonical_name) = d.brand_key
         or exists (select 1 from public.catalog_manufacturer_aliases a where a.manufacturer_id = m.id and laria_private.dealer_brand_key(a.alias) = d.brand_key)
      union all
      select laria_private.dealer_brand_key(a.alias) from public.catalog_manufacturer_aliases a
      join public.catalog_manufacturers m on m.id = a.manufacturer_id
      where laria_private.dealer_brand_key(m.canonical_name) = d.brand_key
         or exists (select 1 from public.catalog_manufacturer_aliases b where b.manufacturer_id = m.id and laria_private.dealer_brand_key(b.alias) = d.brand_key)
    ) k where k.key is not null))
    order by d.brand_key, s.name), '[]'::jsonb)
  from public.store_dealer_authorizations d
  join public.stores s on s.id = d.store_id and s.status = 'active'
  where d.status = 'approved' and (d.valid_until is null or d.valid_until >= laria_private.dealer_today())
$$;

revoke all on function laria_private.dealer_brand_key(text) from public, anon, authenticated;
revoke all on function laria_private.dealer_today() from public, anon, authenticated;
revoke all on function laria_private.dealer_authorization_json(public.store_dealer_authorizations) from public, anon, authenticated;
revoke all on function public.request_dealer_authorization_upload(text, text, text, integer, date, text) from public, anon, authenticated;
revoke all on function public.complete_dealer_authorization_upload(uuid, uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.withdraw_dealer_authorization(uuid) from public, anon, authenticated;
revoke all on function public.get_store_dealer_authorizations() from public, anon, authenticated;
revoke all on function public.admin_get_dealer_authorizations(text) from public, anon, authenticated;
revoke all on function public.admin_get_dealer_document(uuid) from public, anon, authenticated;
revoke all on function public.admin_review_dealer_authorization(uuid, text, integer, text, date) from public, anon, authenticated;
revoke all on function public.get_active_dealer_authorizations() from public, anon, authenticated;
grant execute on function public.request_dealer_authorization_upload(text, text, text, integer, date, text) to authenticated;
grant execute on function public.complete_dealer_authorization_upload(uuid, uuid, text, integer, text) to service_role;
grant execute on function public.withdraw_dealer_authorization(uuid) to authenticated;
grant execute on function public.get_store_dealer_authorizations() to authenticated;
grant execute on function public.admin_get_dealer_authorizations(text) to authenticated;
grant execute on function public.admin_get_dealer_document(uuid) to authenticated;
grant execute on function public.admin_review_dealer_authorization(uuid, text, integer, text, date) to authenticated;
grant execute on function public.get_active_dealer_authorizations() to anon, authenticated;
