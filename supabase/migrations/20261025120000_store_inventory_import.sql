-- STORE-2: spreadsheet import (docs/store-operations/design.md §7, §13.4; owner decision D-3 at its accepted default).
--
-- Purely additive. Builds on 20261023120000_store_inventory_foundation.sql (STORE-1a) and changes nothing that exists
-- today except one foreign key on the empty store_stock_movements.import_session_id column and one nullable column on
-- store_operation_settings.
--
-- Processing model (design §7.1): the merchant's open import page drives a loop of small server steps. Each step takes a
-- lease on the session (lock_token, 90 s), does one bounded unit (stage ≤ 1,000 parsed rows, plan ≤ 100 rows, commit
-- ≤ 50 rows) and releases it. Every function here binds the caller with auth.uid(); the server route calls them with the
-- owner's session, never the service role, so the database decides ownership.
--
-- Invariants:
--   * The spreadsheet is untrusted. The server parses it into staged rows, but every value that reaches inventory is
--     validated again here, at plan time and again at commit time against the locked current state.
--   * Snapshot mode only: a stock cell is the counted total. Commit records the difference as one import_reconciliation
--     movement (opening_balance for a new SKU). Blank cells never change anything; SKUs missing from a file are ignored.
--   * A row commits at most once: commit_status is written in the same transaction as its effects, and every movement
--     carries the key import:{session}:{row} under the ledger's unique (store_id, idempotency_key) index.
--   * A row whose target changed after the preview (version, SKU taken, link changed) becomes `conflict`, never applied.
--   * Lock order as everywhere else: linked listings in id order, then items in id order.
--   * One open import per store. Staged rows and source files are deleted 30 days after the session closes; ledger and
--     change log entries are permanent.

-- ------------------------------------------------------------------ sessions

create table public.store_import_sessions (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid not null references public.stores(id) on delete restrict,
  created_by            uuid not null,
  status                text not null default 'awaiting_upload' check (status in (
                          'awaiting_upload', 'parsing', 'mapping_required', 'validating', 'ready', 'committing',
                          'committed', 'partially_committed', 'failed', 'cancelled', 'expired')),
  mode                  text not null default 'snapshot' check (mode = 'snapshot'),
  file_format           text not null check (file_format in ('csv', 'xlsx')),
  file_name             text not null check (char_length(file_name) between 1 and 120),
  file_path             text not null unique,
  file_bytes            integer not null check (file_bytes between 1 and 5242880),
  file_sha256           text check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$'),
  sheet_name            text check (sheet_name is null or char_length(sheet_name) <= 120),
  header_row            integer check (header_row is null or header_row >= 1),
  headers               jsonb check (headers is null or (jsonb_typeof(headers) = 'array' and jsonb_array_length(headers) <= 80)),
  proposed_mapping      jsonb check (proposed_mapping is null or jsonb_typeof(proposed_mapping) = 'object'),
  column_mapping        jsonb check (column_mapping is null or jsonb_typeof(column_mapping) = 'object'),
  mapping_confirmed_at  timestamptz,
  row_count             integer check (row_count is null or row_count between 0 and 2000),
  parse_cursor          integer not null default 0 check (parse_cursor >= 0),
  file_warnings         jsonb not null default '[]'::jsonb check (jsonb_typeof(file_warnings) = 'array'),
  counts                jsonb not null default '{}'::jsonb check (jsonb_typeof(counts) = 'object'),
  options               jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  result_summary        jsonb check (result_summary is null or jsonb_typeof(result_summary) = 'object'),
  locked_until          timestamptz,
  lock_token            uuid,
  version               integer not null default 1 check (version >= 1),
  error_code            text check (error_code is null or error_code ~ '^IMPORT_[A-Z_]{2,60}$'),
  error_message         text check (error_message is null or char_length(error_message) <= 300),
  commit_started_at     timestamptz,
  committed_at          timestamptz,
  cancelled_at          timestamptz,
  closed_at             timestamptz,
  rows_purged_at        timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint import_file_path_shape check (
    file_path = created_by::text || '/' || id::text || '/source.' || file_format),
  constraint import_closed_status check (
    (closed_at is null) = (status not in ('committed', 'partially_committed', 'failed', 'cancelled', 'expired')))
);

-- One open import per store (design default recorded in store-2.md): a second upload would preview against rows the
-- first one is about to change.
create unique index store_import_sessions_one_open_idx on public.store_import_sessions(store_id)
  where status in ('awaiting_upload', 'parsing', 'mapping_required', 'validating', 'ready', 'committing');
create index store_import_sessions_store_created_idx on public.store_import_sessions(store_id, created_at desc, id desc);
create index store_import_sessions_retention_idx on public.store_import_sessions(closed_at)
  where rows_purged_at is null;

create trigger store_import_sessions_set_updated_at
before update on public.store_import_sessions
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------ staged rows

create table public.store_import_rows (
  session_id           uuid not null references public.store_import_sessions(id) on delete cascade,
  row_number           integer not null check (row_number between 1 and 1000000),
  store_id             uuid not null references public.stores(id) on delete restrict,
  -- Cells as read from the file: [{v: text, k: kind, f: formula?}]. Never interpreted by the database.
  raw                  jsonb not null check (jsonb_typeof(raw) = 'array' and octet_length(raw::text) <= 32768),
  parsed               jsonb check (parsed is null or jsonb_typeof(parsed) = 'object'),
  issues               jsonb not null default '[]'::jsonb check (jsonb_typeof(issues) = 'array'),
  sku_normalized       text,
  planned_action       text check (planned_action is null or planned_action in
                         ('create', 'update', 'adopt_listing', 'unchanged', 'error')),
  changes              jsonb check (changes is null or jsonb_typeof(changes) = 'object'),
  target_item_id       uuid,
  target_item_version  integer,
  target_listing_id    uuid,
  payload_fingerprint  text,
  owner_decision       text not null default 'include' check (owner_decision in ('include', 'exclude')),
  commit_status        text not null default 'pending' check (commit_status in ('pending', 'applied', 'conflict', 'failed')),
  commit_message       text check (commit_message is null or char_length(commit_message) <= 300),
  applied_item_id      uuid,
  applied_movement_id  uuid,
  applied_at           timestamptz,
  catalog              jsonb,          -- reserved for STORE-3c (design §9); always null in STORE-2
  primary key (session_id, row_number),
  constraint import_row_applied_shape check ((commit_status = 'applied') = (applied_at is not null))
);

create index store_import_rows_plan_idx on public.store_import_rows(session_id, planned_action, row_number);
create index store_import_rows_target_idx on public.store_import_rows(target_item_id) where target_item_id is not null;

-- The ledger column STORE-1a reserved for imports. Sessions are never deleted, so the reference always resolves.
alter table public.store_stock_movements
  add constraint store_stock_movements_import_session_fk
  foreign key (import_session_id) references public.store_import_sessions(id) on delete restrict;
alter table public.store_stock_movements
  add constraint store_stock_movements_import_row_shape
  check ((import_session_id is null) = (import_row_number is null));

-- The store's confirmed column mapping, offered first on the next import ({normalized header: field}).
alter table public.store_operation_settings
  add column import_mapping_default jsonb
  check (import_mapping_default is null or (jsonb_typeof(import_mapping_default) = 'object'
         and octet_length(import_mapping_default::text) <= 16384));

-- Source files whose session closed more than 30 days ago, waiting for the cleanup route to delete them through the
-- Storage API (deleting storage.objects rows directly would leave the bytes behind).
create table laria_private.store_import_file_deletions (
  bucket      text not null,
  path        text not null,
  queued_at   timestamptz not null default now(),
  claimed_at  timestamptz,
  deleted_at  timestamptz,
  primary key (bucket, path)
);
alter table laria_private.store_import_file_deletions enable row level security;
revoke all on laria_private.store_import_file_deletions from public, anon, authenticated;

-- ------------------------------------------------------------------ RLS and grants

alter table public.store_import_sessions enable row level security;
alter table public.store_import_rows enable row level security;
revoke all on public.store_import_sessions, public.store_import_rows from public, anon, authenticated;
grant select on public.store_import_sessions, public.store_import_rows to authenticated;

create policy "Store owners can read own import sessions" on public.store_import_sessions
  for select to authenticated using (public.is_store_owner(store_id));
create policy "Admins can read import sessions" on public.store_import_sessions
  for select to authenticated using (public.is_admin());
create policy "Store owners can read own import rows" on public.store_import_rows
  for select to authenticated using (public.is_store_owner(store_id));
create policy "Admins can read import rows" on public.store_import_rows
  for select to authenticated using (public.is_admin());

-- ------------------------------------------------------------------ private bucket

-- 5 MB (D-3). Only the two formats the importer reads; the server also checks the bytes, not just the declared type.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('store-imports', 'store-imports', false, 5242880,
  array['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The owner uploads exactly the path the session names, once, while the session waits for its file. No update or
-- delete policy: an uploaded source cannot be replaced, and only the cleanup route (service role) removes it.
create policy "Store owners upload their import file" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'store-imports'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.store_import_sessions session
    where session.file_path = objects.name
      and session.created_by = auth.uid()
      and session.status = 'awaiting_upload'
      and public.is_store_owner(session.store_id)
  )
);

create policy "Store owners read their import files" on storage.objects
for select to authenticated
using (
  bucket_id = 'store-imports'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.store_import_sessions session
    where session.file_path = objects.name and session.created_by = auth.uid() and public.is_store_owner(session.store_id)
  )
);

-- ------------------------------------------------------------------ internal helpers

create or replace function laria_private.raise_import_error(p_code text, p_message text, p_detail jsonb default null)
returns void
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001', message = p_code || ': ' || p_message, detail = coalesce(p_detail::text, '');
end;
$$;

create or replace function laria_private.import_session_is_open(p_status text)
returns boolean
language sql
immutable
as $$ select p_status in ('awaiting_upload', 'parsing', 'mapping_required', 'validating', 'ready', 'committing'); $$;

create or replace function laria_private.import_session_json(p_session public.store_import_sessions)
returns jsonb
language sql
stable
as $$
  select to_jsonb(p_session) - 'lock_token' - 'created_by'
    || jsonb_build_object('lease_active', p_session.locked_until is not null and p_session.locked_until > now());
$$;

-- The caller's session, locked. "Does not exist" and "not yours" are the same error. Writes need the store to be
-- writable for inventory (owner, enabled, pending or active): a store hidden mid-import keeps its staged data readable
-- in the tables but can no longer change anything.
create or replace function laria_private.import_session_for_owner(p_session_id uuid, p_for_write boolean)
returns public.store_import_sessions
language plpgsql
security definer
set search_path = public
as $$
declare session public.store_import_sessions; owner_store_id uuid;
begin
  owner_store_id := laria_private.inventory_caller_store(false);
  select * into session from public.store_import_sessions s
  where s.id = p_session_id and s.store_id = owner_store_id
  for update;
  if not found then
    perform laria_private.raise_import_error('IMPORT_SESSION_NOT_FOUND', 'No encontramos esta importación.');
  end if;
  if p_for_write then
    perform laria_private.require_inventory_write(session.store_id, auth.uid());
  end if;
  return session;
end;
$$;

-- A step function's guard: the caller holds the current lease. Each call extends it, so a long step stays leased.
create or replace function laria_private.import_session_with_lease(p_session_id uuid, p_lock_token uuid, p_statuses text[])
returns public.store_import_sessions
language plpgsql
security definer
set search_path = public
as $$
declare session public.store_import_sessions;
begin
  session := laria_private.import_session_for_owner(p_session_id, true);
  if p_lock_token is null or session.lock_token is distinct from p_lock_token or session.locked_until <= now() then
    perform laria_private.raise_import_error('IMPORT_LEASE_LOST',
      'La importación cambió en otra ventana. Vuelve a cargar la página.');
  end if;
  if not (session.status = any(p_statuses)) then
    perform laria_private.raise_import_error('IMPORT_STATE_INVALID', 'Este paso ya no corresponde a la importación.',
      jsonb_build_object('status', session.status));
  end if;
  update public.store_import_sessions set locked_until = now() + interval '90 seconds'
  where id = session.id returning * into session;
  return session;
end;
$$;

create or replace function laria_private.close_import_session(p_session_id uuid, p_status text)
returns public.store_import_sessions
language plpgsql
security definer
set search_path = public
as $$
declare session public.store_import_sessions;
begin
  update public.store_import_sessions
  set status = p_status, closed_at = now(), lock_token = null, locked_until = null, version = version + 1,
      committed_at = case when p_status in ('committed', 'partially_committed') then now() else committed_at end,
      cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
      result_summary = counts
  where id = p_session_id
  returning * into session;
  return session;
end;
$$;

-- Field keys the mapping may use. Attribute columns map to the existing attribute keys (lib/instrument-filters.ts),
-- never to a second taxonomy; STORE-3b validates them against the instrument type at publication.
create or replace function laria_private.import_mapping_is_valid(p_mapping jsonb, p_column_count integer)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(p_mapping) = 'object'
    and not exists (
      select 1 from jsonb_each(p_mapping) entry
      where not (
        (entry.key in ('sku', 'product_name', 'brand', 'model', 'category', 'instrument_type', 'variant_label',
                       'unit_price_pen', 'quantity', 'condition', 'description', 'low_stock_threshold',
                       'external_reference', 'photos', 'listing_id')
         or entry.key ~ '^attribute:[a-z][a-z0-9_]{0,39}$')
        and jsonb_typeof(entry.value) = 'number'
        and (entry.value #>> '{}') ~ '^[0-9]{1,2}$'
        and (entry.value #>> '{}')::integer < p_column_count))
    and (select count(*) from jsonb_each(p_mapping)) = (select count(distinct entry.value) from jsonb_each(p_mapping) entry)
    and (select count(*) from jsonb_each(p_mapping)) <= 80;
$$;

-- Field checks the database owns, whatever the server already found. Returns issues for fields the caller's issues do
-- not already mark as errors. Messages are the merchant-facing Spanish text.
create or replace function laria_private.import_row_field_issues(p_parsed jsonb, p_existing_issues jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  issues jsonb := '[]'::jsonb;
  flagged text[];
  value jsonb;
  raw text;
begin
  select coalesce(array_agg(issue->>'field'), '{}') into flagged
  from jsonb_array_elements(coalesce(p_existing_issues, '[]'::jsonb)) issue where issue->>'severity' = 'error';

  value := p_parsed->'sku';
  if value is not null and value <> 'null'::jsonb and not ('sku' = any(flagged)) then
    raw := case when jsonb_typeof(value) = 'string' then btrim(value #>> '{}') end;
    if raw is null or raw !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' then
      issues := issues || jsonb_build_object('code', 'IMPORT_SKU_INVALID', 'field', 'sku', 'severity', 'error',
        'message', 'El SKU admite letras, números, punto, guion y guion bajo, sin espacios, hasta 64 caracteres.');
    end if;
  end if;

  value := p_parsed->'product_name';
  if value is not null and value <> 'null'::jsonb and not ('product_name' = any(flagged))
    and (jsonb_typeof(value) <> 'string' or char_length(btrim(value #>> '{}')) not between 2 and 140) then
    issues := issues || jsonb_build_object('code', 'IMPORT_NAME_INVALID', 'field', 'product_name', 'severity', 'error',
      'message', 'El nombre debe tener entre 2 y 140 caracteres.');
  end if;

  value := p_parsed->'variant_label';
  if value is not null and value <> 'null'::jsonb and not ('variant_label' = any(flagged))
    and (jsonb_typeof(value) <> 'string' or char_length(btrim(value #>> '{}')) not between 1 and 80) then
    issues := issues || jsonb_build_object('code', 'IMPORT_FIELD_INVALID', 'field', 'variant_label', 'severity', 'error',
      'message', 'La variante admite hasta 80 caracteres.');
  end if;

  value := p_parsed->'external_reference';
  if value is not null and value <> 'null'::jsonb and not ('external_reference' = any(flagged))
    and (jsonb_typeof(value) <> 'string' or char_length(btrim(value #>> '{}')) not between 1 and 120) then
    issues := issues || jsonb_build_object('code', 'IMPORT_FIELD_INVALID', 'field', 'external_reference', 'severity', 'error',
      'message', 'La referencia externa admite hasta 120 caracteres.');
  end if;

  value := p_parsed->'quantity';
  if value is not null and value <> 'null'::jsonb and not ('quantity' = any(flagged))
    and (jsonb_typeof(value) <> 'number' or (value #>> '{}') !~ '^[0-9]{1,6}$' or (value #>> '{}')::integer > 100000) then
    issues := issues || jsonb_build_object('code', 'IMPORT_STOCK_INVALID', 'field', 'quantity', 'severity', 'error',
      'message', 'El stock debe ser un número entero entre 0 y 100000.');
  end if;

  value := p_parsed->'unit_price_pen';
  if value is not null and value <> 'null'::jsonb and not ('unit_price_pen' = any(flagged))
    and (jsonb_typeof(value) <> 'number' or (value #>> '{}') !~ '^[0-9]{1,10}$'
         or (value #>> '{}')::bigint not between 1 and 2147483647) then
    issues := issues || jsonb_build_object('code', 'IMPORT_PRICE_INVALID', 'field', 'unit_price_pen', 'severity', 'error',
      'message', 'El precio debe estar en soles enteros, mayor que cero.');
  end if;

  value := p_parsed->'low_stock_threshold';
  if value is not null and value <> 'null'::jsonb and not ('low_stock_threshold' = any(flagged))
    and (jsonb_typeof(value) <> 'number' or (value #>> '{}') !~ '^[0-9]{1,6}$' or (value #>> '{}')::integer > 100000) then
    issues := issues || jsonb_build_object('code', 'IMPORT_THRESHOLD_INVALID', 'field', 'low_stock_threshold', 'severity', 'error',
      'message', 'El umbral de stock bajo debe ser un número entero entre 0 y 100000.');
  end if;

  value := p_parsed->'listing_id';
  if value is not null and value <> 'null'::jsonb and not ('listing_id' = any(flagged))
    and (jsonb_typeof(value) <> 'string'
         or (value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    issues := issues || jsonb_build_object('code', 'IMPORT_LISTING_INVALID', 'field', 'listing_id', 'severity', 'error',
      'message', 'El ID de publicación no es válido.');
  end if;
  return issues;
end;
$$;

create or replace function laria_private.import_text(p_parsed jsonb, p_key text)
returns text
language sql
immutable
as $$ select nullif(btrim(case when jsonb_typeof(p_parsed->p_key) = 'string' then p_parsed->>p_key end), ''); $$;

create or replace function laria_private.import_int(p_parsed jsonb, p_key text)
returns integer
language sql
immutable
as $$ select case when jsonb_typeof(p_parsed->p_key) = 'number' then (p_parsed->>p_key)::integer end; $$;

-- Plans one row against the store's current inventory. Used at preview time and again at commit time on locked rows,
-- so "what the merchant saw" and "what is applied" come from the same rules. Never writes.
--   create         new SKU (generated when the cell is blank)
--   update         existing SKU, or the SKU already linked to the listing id in the row
--   adopt_listing  a row with a listing id whose listing has no SKU yet: creates the SKU, or links the existing one
--   unchanged      nothing in the row differs from the current values
--   error          the row cannot be applied as it is
create or replace function laria_private.plan_import_row(
  p_store_id uuid,
  p_parsed jsonb,
  p_issues jsonb,
  out planned_action text,
  out sku_normalized text,
  out target_item_id uuid,
  out target_item_version integer,
  out target_listing_id uuid,
  out changes jsonb,
  out issues jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sku text := laria_private.import_text(p_parsed, 'sku');
  name text := laria_private.import_text(p_parsed, 'product_name');
  variant text := laria_private.import_text(p_parsed, 'variant_label');
  external_ref text := laria_private.import_text(p_parsed, 'external_reference');
  quantity integer;
  price integer;
  threshold integer;
  listing_ref uuid;
  listing public.listings;
  by_sku public.store_inventory_items;
  by_listing public.store_inventory_items;
  target public.store_inventory_items;
  chosen_price integer;
begin
  issues := coalesce(p_issues, '[]'::jsonb) || laria_private.import_row_field_issues(p_parsed, p_issues);
  changes := '{}'::jsonb;
  if exists (select 1 from jsonb_array_elements(issues) issue where issue->>'severity' = 'error') then
    planned_action := 'error';
    sku_normalized := upper(sku);
    return;
  end if;

  quantity := laria_private.import_int(p_parsed, 'quantity');
  price := laria_private.import_int(p_parsed, 'unit_price_pen');
  threshold := laria_private.import_int(p_parsed, 'low_stock_threshold');
  listing_ref := nullif(laria_private.import_text(p_parsed, 'listing_id'), '')::uuid;
  sku_normalized := upper(sku);

  if sku is not null then
    select * into by_sku from public.store_inventory_items i where i.store_id = p_store_id and i.sku_normalized = upper(sku);
  end if;

  if listing_ref is not null then
    select * into listing from public.listings l where l.id = listing_ref;
    if listing.id is null or listing.store_id is distinct from p_store_id then
      issues := issues || jsonb_build_object('code', 'IMPORT_LISTING_NOT_OWNED', 'field', 'listing_id', 'severity', 'error',
        'message', 'Esta publicación no es de tu tienda.');
    elsif listing.status in ('sold', 'archived') then
      issues := issues || jsonb_build_object('code', 'IMPORT_LISTING_CLOSED', 'field', 'listing_id', 'severity', 'error',
        'message', 'Una publicación vendida o archivada no se puede vincular al inventario.');
    else
      target_listing_id := listing.id;
      select * into by_listing from public.store_inventory_items i where i.listing_id = listing.id;
      if by_listing.id is not null then
        if by_sku.id is not null and by_sku.id <> by_listing.id then
          issues := issues || jsonb_build_object('code', 'IMPORT_SKU_LISTING_MISMATCH', 'field', 'sku', 'severity', 'error',
            'message', 'Esta publicación ya está vinculada al SKU ' || by_listing.merchant_sku || '.');
        elsif sku is not null and by_sku.id is null then
          issues := issues || jsonb_build_object('code', 'IMPORT_SKU_LISTING_MISMATCH', 'field', 'sku', 'severity', 'error',
            'message', 'Esta publicación ya está vinculada al SKU ' || by_listing.merchant_sku
              || '. Para cambiar un SKU usa la acción Cambiar SKU.');
        else
          target := by_listing;
          planned_action := 'update';
        end if;
      elsif by_sku.id is not null and by_sku.listing_id is not null then
        issues := issues || jsonb_build_object('code', 'IMPORT_SKU_ALREADY_LINKED', 'field', 'listing_id', 'severity', 'error',
          'message', 'El SKU ' || by_sku.merchant_sku || ' ya está vinculado a otra publicación.');
      else
        target := by_sku;
        planned_action := 'adopt_listing';
      end if;
    end if;
  elsif by_sku.id is not null then
    target := by_sku;
    planned_action := 'update';
  else
    planned_action := 'create';
  end if;

  if target.id is not null and target.inventory_status = 'archived' then
    issues := issues || jsonb_build_object('code', 'IMPORT_ITEM_ARCHIVED', 'field', 'sku', 'severity', 'error',
      'message', 'El SKU está archivado. Reactívalo antes de importarlo.');
  end if;

  if target.id is null and planned_action in ('create', 'adopt_listing') then
    if name is null and listing.id is not null then name := left(btrim(listing.title), 140); end if;
    if name is null or char_length(name) < 2 then
      issues := issues || jsonb_build_object('code', 'IMPORT_NAME_REQUIRED', 'field', 'product_name', 'severity', 'error',
        'message', 'Falta el nombre para crear el SKU.');
    end if;
    if quantity is null then
      issues := issues || jsonb_build_object('code', 'IMPORT_STOCK_REQUIRED', 'field', 'quantity', 'severity', 'error',
        'message', 'Indica el stock para crear el SKU.');
    end if;
  end if;

  if exists (select 1 from jsonb_array_elements(issues) issue where issue->>'severity' = 'error') then
    planned_action := 'error';
    target_item_id := null;
    target_item_version := null;
    changes := '{}'::jsonb;
    return;
  end if;

  -- The linked listing's price applies when the row has none; the row's price, when present, wins for both.
  if planned_action = 'adopt_listing' then
    chosen_price := coalesce(price, case when listing.price_pen > 0 then listing.price_pen end, target.unit_price_pen);
  else
    chosen_price := price;
  end if;

  if target.id is null then
    changes := jsonb_strip_nulls(jsonb_build_object(
      'merchant_sku', jsonb_build_object('from', null, 'to', coalesce(sku, 'LAR-…')),
      'product_name', jsonb_build_object('from', null, 'to', name),
      'variant_label', case when variant is not null then jsonb_build_object('from', null, 'to', variant) end,
      'quantity_on_hand', jsonb_build_object('from', null, 'to', quantity),
      'unit_price_pen', case when chosen_price is not null then jsonb_build_object('from', null, 'to', chosen_price) end,
      'low_stock_threshold', case when threshold is not null then jsonb_build_object('from', null, 'to', threshold) end,
      'external_reference', case when external_ref is not null then jsonb_build_object('from', null, 'to', external_ref) end,
      'listing_id', case when listing.id is not null then jsonb_build_object('from', null, 'to', listing.id) end));
    if sku is null then
      issues := issues || jsonb_build_object('code', 'IMPORT_SKU_GENERATED', 'field', 'sku', 'severity', 'warning',
        'message', 'Sin SKU: Laria generará uno. Si vuelves a importar esta fila sin SKU, se creará otro.');
    end if;
    return;
  end if;

  target_item_id := target.id;
  target_item_version := target.version;
  if name is not null and name is distinct from target.product_name then
    changes := changes || jsonb_build_object('product_name', jsonb_build_object('from', target.product_name, 'to', name));
  end if;
  if variant is not null and variant is distinct from target.variant_label then
    changes := changes || jsonb_build_object('variant_label', jsonb_build_object('from', target.variant_label, 'to', variant));
  end if;
  if threshold is not null and threshold is distinct from target.low_stock_threshold then
    changes := changes || jsonb_build_object('low_stock_threshold',
      jsonb_build_object('from', target.low_stock_threshold, 'to', threshold));
  end if;
  if external_ref is not null and external_ref is distinct from target.external_reference then
    changes := changes || jsonb_build_object('external_reference',
      jsonb_build_object('from', target.external_reference, 'to', external_ref));
  end if;
  if chosen_price is not null and chosen_price is distinct from target.unit_price_pen then
    changes := changes || jsonb_build_object('unit_price_pen', jsonb_build_object('from', target.unit_price_pen, 'to', chosen_price));
  end if;
  if quantity is not null and quantity <> target.quantity_on_hand then
    changes := changes || jsonb_build_object('quantity_on_hand', jsonb_build_object('from', target.quantity_on_hand, 'to', quantity));
  end if;
  if planned_action = 'adopt_listing' then
    changes := changes || jsonb_build_object('listing_id', jsonb_build_object('from', null, 'to', listing.id));
  end if;
  if planned_action = 'update' and changes = '{}'::jsonb then
    planned_action := 'unchanged';
  end if;
  if quantity is null and target.id is not null then
    issues := issues || jsonb_build_object('code', 'IMPORT_STOCK_BLANK', 'field', 'quantity', 'severity', 'info',
      'message', 'Stock vacío: no se cambia.');
  end if;
end;
$$;

-- Recounts a session's rows into counts {total, create, update, adopt_listing, unchanged, error, excluded, to_apply,
-- warnings, publication_incomplete, stock_changes, applied, conflict, failed, pending_plan}.
create or replace function laria_private.refresh_import_counts(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'total', count(*),
    'create', count(*) filter (where planned_action = 'create' and owner_decision = 'include'),
    'update', count(*) filter (where planned_action = 'update' and owner_decision = 'include'),
    'adopt_listing', count(*) filter (where planned_action = 'adopt_listing' and owner_decision = 'include'),
    'unchanged', count(*) filter (where planned_action = 'unchanged'),
    'error', count(*) filter (where planned_action = 'error'),
    'excluded', count(*) filter (where planned_action in ('create', 'update', 'adopt_listing') and owner_decision = 'exclude'),
    'to_apply', count(*) filter (where planned_action in ('create', 'update', 'adopt_listing')
                                   and owner_decision = 'include' and commit_status = 'pending'),
    'warnings', count(*) filter (where planned_action <> 'error' and exists (
                  select 1 from jsonb_array_elements(issues) issue where issue->>'severity' = 'warning')),
    'publication_incomplete', count(*) filter (where planned_action in ('create', 'update', 'adopt_listing', 'unchanged')
                                 and issues @> '[{"code":"IMPORT_PUBLICATION_MISSING"}]'),
    'stock_changes', count(*) filter (where planned_action in ('create', 'update', 'adopt_listing')
                                        and owner_decision = 'include' and changes ? 'quantity_on_hand'),
    'applied', count(*) filter (where commit_status = 'applied'),
    'conflict', count(*) filter (where commit_status = 'conflict'),
    'failed', count(*) filter (where commit_status = 'failed'),
    'pending_plan', count(*) filter (where planned_action is null))
  into result
  from public.store_import_rows where session_id = p_session_id;
  update public.store_import_sessions set counts = result where id = p_session_id;
  return result;
end;
$$;

-- Duplicate detection over the whole file (design §7.2: one SKU once per file). Every row involved becomes an error,
-- because which of them is right is the merchant's call.
create or replace function laria_private.mark_import_duplicates(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare marked integer;
begin
  with keyed as (
    select row_number, 'sku:' || sku_normalized as key
    from public.store_import_rows
    where session_id = p_session_id and planned_action <> 'error' and sku_normalized is not null
    union all
    select row_number, 'listing:' || (parsed->>'listing_id')
    from public.store_import_rows
    where session_id = p_session_id and planned_action <> 'error' and parsed->>'listing_id' is not null
    union all
    select row_number, 'item:' || target_item_id::text
    from public.store_import_rows
    where session_id = p_session_id and planned_action <> 'error' and target_item_id is not null
  ), groups as (
    select key, array_agg(distinct row_number order by row_number) as rows_in_group
    from keyed group by key having count(distinct row_number) > 1
  ), affected as (
    select row_number, min(groups.rows_in_group::text) as rows_text
    from groups, unnest(groups.rows_in_group) as row_number
    group by row_number
  )
  update public.store_import_rows r
  set planned_action = 'error', changes = '{}'::jsonb, target_item_id = null, target_item_version = null,
      issues = r.issues || jsonb_build_object('code', 'IMPORT_DUPLICATE_SKU', 'field', 'sku', 'severity', 'error',
        'message', 'El mismo SKU o publicación aparece en las filas '
          || replace(trim(both '{}' from affected.rows_text), ',', ', ') || '. Deja una sola fila.')
  from affected
  where r.session_id = p_session_id and r.row_number = affected.row_number and r.commit_status <> 'applied';
  get diagnostics marked = row_count;
  return marked;
end;
$$;

-- Applies one planned row to items the chunk has already locked (listings first). Re-plans the row against current
-- state first: anything that differs from the preview makes the row a conflict instead of being applied.
create or replace function laria_private.commit_import_row(
  p_session public.store_import_sessions,
  p_row public.store_import_rows,
  p_actor uuid,
  out commit_status text,
  out commit_message text,
  out applied_item_id uuid,
  out applied_movement_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  plan record;
  item public.store_inventory_items;
  listing public.listings;
  movement public.store_stock_movements;
  request_key text := 'import:' || p_session.id::text || ':' || p_row.row_number::text;
  fingerprint text := laria_private.inventory_fingerprint(jsonb_build_array('store_import_row', p_row.parsed));
  sku text := laria_private.import_text(p_row.parsed, 'sku');
  name text;
  quantity integer := laria_private.import_int(p_row.parsed, 'quantity');
  generated boolean := false;
  before_values jsonb;
  after_values jsonb;
  reason constant text := 'Importación';
begin
  select * into plan from laria_private.plan_import_row(p_session.store_id, p_row.parsed, '[]'::jsonb);
  if plan.planned_action = 'error' then
    commit_status := 'failed';
    commit_message := left(coalesce((select string_agg(issue->>'message', ' ')
      from jsonb_array_elements(plan.issues) issue where issue->>'severity' = 'error'), 'La fila no es válida.'), 300);
    return;
  end if;
  if plan.planned_action <> p_row.planned_action
    or plan.target_item_id is distinct from p_row.target_item_id
    or plan.target_item_version is distinct from p_row.target_item_version
    or plan.target_listing_id is distinct from p_row.target_listing_id then
    commit_status := 'conflict';
    commit_message := 'El SKU cambió después de la revisión. Actualiza la fila para ver los valores actuales.';
    return;
  end if;

  if plan.target_listing_id is not null then
    select * into listing from public.listings where id = plan.target_listing_id;
  end if;

  if plan.target_item_id is null then
    -- New SKU (create, or adopt_listing without an existing SKU).
    name := coalesce(plan.changes #>> '{product_name,to}', laria_private.import_text(p_row.parsed, 'product_name'));
    if sku is null then
      sku := laria_private.next_generated_sku(p_session.store_id);
      generated := true;
    end if;
    insert into public.store_inventory_items (
      store_id, merchant_sku, sku_normalized, sku_generated, listing_id, product_name, variant_label,
      low_stock_threshold, unit_price_pen, external_reference, stock_source
    ) values (
      p_session.store_id, sku, upper(sku), generated, plan.target_listing_id, name,
      laria_private.import_text(p_row.parsed, 'variant_label'),
      laria_private.import_int(p_row.parsed, 'low_stock_threshold'),
      case when plan.target_listing_id is null then (plan.changes #>> '{unit_price_pen,to}')::integer
           when listing.price_pen > 0 then listing.price_pen end,
      laria_private.import_text(p_row.parsed, 'external_reference'), 'import'
    ) returning * into item;
    perform laria_private.record_inventory_change(item, 'created', '{}'::jsonb,
      jsonb_strip_nulls(jsonb_build_object('merchant_sku', item.merchant_sku, 'product_name', item.product_name,
        'variant_label', item.variant_label, 'low_stock_threshold', item.low_stock_threshold,
        'unit_price_pen', item.unit_price_pen, 'external_reference', item.external_reference,
        'import_session_id', p_session.id, 'import_row_number', p_row.row_number)),
      p_actor, 'owner', reason);
    if plan.target_listing_id is not null then
      perform laria_private.record_inventory_change(item, 'link', '{}'::jsonb,
        jsonb_build_object('listing_id', plan.target_listing_id), p_actor, 'owner', reason);
    end if;
    -- The opening balance writes stock_state for an adopted listing before any price change, so an out-of-stock
    -- adoption never sends a price-drop notification (same order as create_inventory_item).
    movement := laria_private.apply_stock_movement(item.id, 'opening_balance', quantity, 'importacion', null, reason, null,
      request_key, fingerprint, p_actor, 'owner', p_session.id, p_row.row_number);
    if plan.target_listing_id is not null and (plan.changes #>> '{unit_price_pen,to}') is not null
      and listing.price_pen is distinct from (plan.changes #>> '{unit_price_pen,to}')::integer then
      perform laria_private.apply_inventory_price(item.id, (plan.changes #>> '{unit_price_pen,to}')::integer,
        p_actor, 'owner', reason);
    end if;
  else
    select * into item from public.store_inventory_items where id = plan.target_item_id;

    before_values := jsonb_build_object('product_name', item.product_name, 'variant_label', item.variant_label,
      'low_stock_threshold', item.low_stock_threshold, 'external_reference', item.external_reference);
    after_values := before_values
      || jsonb_strip_nulls(jsonb_build_object(
        'product_name', plan.changes #> '{product_name,to}', 'variant_label', plan.changes #> '{variant_label,to}',
        'low_stock_threshold', plan.changes #> '{low_stock_threshold,to}',
        'external_reference', plan.changes #> '{external_reference,to}'));
    if before_values <> after_values then
      perform laria_private.record_inventory_change(item, 'details',
        (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(before_values) where after_values->key <> value),
        (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(after_values) where before_values->key <> value),
        p_actor, 'owner', reason);
      update public.store_inventory_items
      set product_name = after_values->>'product_name', variant_label = after_values->>'variant_label',
          low_stock_threshold = (after_values->>'low_stock_threshold')::integer,
          external_reference = after_values->>'external_reference', version = version + 1
      where id = item.id returning * into item;
    end if;

    if p_row.planned_action = 'adopt_listing' then
      update public.store_inventory_items set listing_id = plan.target_listing_id, version = version + 1
      where id = item.id returning * into item;
      perform laria_private.record_inventory_change(item, 'link', '{}'::jsonb,
        jsonb_build_object('listing_id', plan.target_listing_id), p_actor, 'owner', reason);
    end if;

    -- Stock before price: a listing going out of stock must not send a price-drop notification for the same import.
    if plan.changes ? 'quantity_on_hand' then
      movement := laria_private.apply_stock_movement(item.id, 'import_reconciliation', quantity, 'importacion', null,
        reason, null, request_key, fingerprint, p_actor, 'owner', p_session.id, p_row.row_number);
    elsif p_row.planned_action = 'adopt_listing' then
      perform laria_private.write_listing_stock_state(plan.target_listing_id,
        laria_private.stock_state_for(item.quantity_available));
    end if;

    if plan.changes ? 'unit_price_pen' then
      perform laria_private.apply_inventory_price(item.id, (plan.changes #>> '{unit_price_pen,to}')::integer,
        p_actor, 'owner', reason);
    elsif p_row.planned_action = 'adopt_listing' and listing.price_pen is distinct from item.unit_price_pen
      and item.unit_price_pen is not null then
      -- Row without price, item with a price and listing without one: the item's price goes to the listing.
      perform laria_private.apply_inventory_price(item.id, item.unit_price_pen, p_actor, 'owner', reason);
    end if;
  end if;

  commit_status := 'applied';
  applied_item_id := item.id;
  applied_movement_id := movement.id;
end;
$$;

-- ------------------------------------------------------------------ owner functions

-- Starts an import: the browser then uploads the file to the returned path (storage policy above).
create or replace function public.create_store_import_session(p_file_name text, p_file_format text, p_file_bytes integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_caller_store(true);
  existing uuid;
  session_id uuid := gen_random_uuid();
  clean_name text;
  session public.store_import_sessions;
begin
  if p_file_format is null or p_file_format not in ('csv', 'xlsx') then
    perform laria_private.raise_import_error('IMPORT_FORMAT_UNSUPPORTED', 'Sube un archivo .xlsx o .csv.');
  end if;
  if p_file_bytes is null or p_file_bytes not between 1 and 5242880 then
    perform laria_private.raise_import_error('IMPORT_FILE_TOO_LARGE', 'El archivo debe pesar como máximo 5 MB.');
  end if;
  -- Display only: last path segment, no control characters, at most 120 characters.
  clean_name := left(btrim(regexp_replace(regexp_replace(coalesce(p_file_name, ''), '^.*[\\/]', ''),
    '[[:cntrl:]]', '', 'g')), 120);
  if clean_name = '' then clean_name := 'archivo.' || p_file_format; end if;

  select id into existing from public.store_import_sessions
  where store_id = owner_store_id and laria_private.import_session_is_open(status);
  if existing is not null then
    perform laria_private.raise_import_error('IMPORT_ALREADY_OPEN',
      'Ya tienes una importación abierta. Termínala o cancélala antes de subir otro archivo.',
      jsonb_build_object('session_id', existing));
  end if;

  insert into public.store_import_sessions (id, store_id, created_by, file_format, file_name, file_path, file_bytes)
  values (session_id, owner_store_id, auth.uid(), p_file_format, clean_name,
          auth.uid()::text || '/' || session_id::text || '/source.' || p_file_format, p_file_bytes)
  returning * into session;
  return jsonb_build_object('session', laria_private.import_session_json(session),
    'upload', jsonb_build_object('bucket', 'store-imports', 'path', session.file_path));
exception when unique_violation then
  perform laria_private.raise_import_error('IMPORT_ALREADY_OPEN',
    'Ya tienes una importación abierta. Termínala o cancélala antes de subir otro archivo.');
end;
$$;

-- Takes the step lease. A second tab gets IMPORT_BUSY until the first releases it or the lease expires (90 s).
create or replace function public.claim_store_import_step(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare session public.store_import_sessions; token uuid := gen_random_uuid();
begin
  session := laria_private.import_session_for_owner(p_session_id, true);
  if not laria_private.import_session_is_open(session.status) then
    perform laria_private.raise_import_error('IMPORT_SESSION_CLOSED', 'Esta importación ya terminó.',
      jsonb_build_object('status', session.status));
  end if;
  if session.lock_token is not null and session.locked_until > now() then
    perform laria_private.raise_import_error('IMPORT_BUSY', 'La importación está en curso en otra ventana.');
  end if;
  update public.store_import_sessions set lock_token = token, locked_until = now() + interval '90 seconds'
  where id = session.id returning * into session;
  return jsonb_build_object('lock_token', token, 'session', laria_private.import_session_json(session));
end;
$$;

create or replace function public.release_store_import_step(p_session_id uuid, p_lock_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare session public.store_import_sessions;
begin
  session := laria_private.import_session_for_owner(p_session_id, false);
  update public.store_import_sessions set lock_token = null, locked_until = null
  where id = session.id and lock_token = p_lock_token;
end;
$$;

-- The server has read the uploaded file and checked its bytes. Moves awaiting_upload → parsing.
create or replace function public.begin_store_import_parse(
  p_session_id uuid, p_lock_token uuid, p_file_sha256 text, p_file_bytes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare session public.store_import_sessions;
begin
  session := laria_private.import_session_with_lease(p_session_id, p_lock_token, array['awaiting_upload', 'parsing']);
  if p_file_sha256 is null or p_file_sha256 !~ '^[0-9a-f]{64}$' or p_file_bytes is null
    or p_file_bytes not between 1 and 5242880 then
    perform laria_private.raise_import_error('IMPORT_FILE_INVALID', 'No pudimos leer el archivo.');
  end if;
  if session.status = 'parsing' and session.file_sha256 is distinct from p_file_sha256 then
    perform laria_private.raise_import_error('IMPORT_FILE_CHANGED', 'El archivo cambió durante la importación.');
  end if;
  update public.store_import_sessions
  set status = 'parsing', file_sha256 = p_file_sha256, file_bytes = p_file_bytes
  where id = session.id returning * into session;
  return laria_private.import_session_json(session);
end;
$$;

-- Stages up to 1,000 rows of cells. Idempotent per row number, so a retried parse step never duplicates a row.
create or replace function public.stage_store_import_rows(p_session_id uuid, p_lock_token uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare session public.store_import_sessions; staged integer;
begin
  session := laria_private.import_session_with_lease(p_session_id, p_lock_token, array['parsing']);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 1000 then
    perform laria_private.raise_import_error('IMPORT_ROWS_INVALID', 'No pudimos guardar las filas del archivo.');
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) entry
    where jsonb_typeof(entry->'row_number') <> 'number' or (entry->>'row_number') !~ '^[0-9]{1,7}$'
       or jsonb_typeof(entry->'raw') <> 'array' or jsonb_array_length(entry->'raw') > 80
  ) then
    perform laria_private.raise_import_error('IMPORT_ROWS_INVALID', 'No pudimos guardar las filas del archivo.');
  end if;
  insert into public.store_import_rows(session_id, row_number, store_id, raw)
  select session.id, (entry->>'row_number')::integer, session.store_id, entry->'raw'
  from jsonb_array_elements(p_rows) entry
  on conflict (session_id, row_number) do nothing;
  get diagnostics staged = row_count;
  if (select count(*) from public.store_import_rows where session_id = session.id) > 2000 then
    perform laria_private.raise_import_error('IMPORT_TOO_MANY_ROWS', 'El archivo tiene más de 2000 filas.');
  end if;

  update public.store_import_sessions
  set parse_cursor = greatest(parse_cursor, (select max((entry->>'row_number')::integer) from jsonb_array_elements(p_rows) entry))
  where id = session.id;
  return jsonb_build_object('staged', staged);
end;
$$;

-- Parsing finished: headers, the proposed mapping and file-level warnings. Moves parsing → mapping_required.
create or replace function public.finish_store_import_parse(p_session_id uuid, p_lock_token uuid, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare session public.store_import_sessions; staged integer; header_count integer;
begin
  session := laria_private.import_session_with_lease(p_session_id, p_lock_token, array['parsing']);
  if p_meta is null or jsonb_typeof(p_meta) <> 'object' or jsonb_typeof(p_meta->'headers') <> 'array'
    or jsonb_array_length(p_meta->'headers') not between 1 and 80
    or exists (select 1 from jsonb_array_elements(p_meta->'headers') header
               where jsonb_typeof(header) <> 'string' or char_length(header #>> '{}') > 200)
    or jsonb_typeof(p_meta->'row_count') <> 'number'
    or jsonb_typeof(p_meta->'header_row') <> 'number'
    or (p_meta ? 'warnings' and (jsonb_typeof(p_meta->'warnings') <> 'array' or jsonb_array_length(p_meta->'warnings') > 20)) then
    perform laria_private.raise_import_error('IMPORT_ROWS_INVALID', 'No pudimos leer los encabezados del archivo.');
  end if;
  header_count := jsonb_array_length(p_meta->'headers');
  select count(*) into staged from public.store_import_rows where session_id = session.id;
  if staged <> (p_meta->>'row_count')::integer or staged > 2000 then
    perform laria_private.raise_import_error('IMPORT_ROWS_INCOMPLETE', 'La lectura del archivo no terminó. Vuelve a intentarlo.');
  end if;
  if p_meta ? 'proposed_mapping' and not laria_private.import_mapping_is_valid(p_meta->'proposed_mapping', header_count) then
    perform laria_private.raise_import_error('IMPORT_MAPPING_INVALID', 'Revisa las columnas elegidas.');
  end if;

  update public.store_import_sessions
  set status = 'mapping_required', headers = p_meta->'headers', header_row = (p_meta->>'header_row')::integer,
      sheet_name = left(nullif(p_meta->>'sheet_name', ''), 120), row_count = staged,
      proposed_mapping = coalesce(p_meta->'proposed_mapping', '{}'::jsonb),
      file_warnings = coalesce(p_meta->'warnings', '[]'::jsonb), version = version + 1
  where id = session.id returning * into session;
  perform laria_private.refresh_import_counts(session.id);
  select * into session from public.store_import_sessions where id = session.id;
  return laria_private.import_session_json(session);
end;
$$;

-- The file could not be read (corrupt, macros, too many rows…): the session fails with a reason the page shows.
create or replace function public.fail_store_import(p_session_id uuid, p_lock_token uuid, p_code text, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare session public.store_import_sessions;
begin
  session := laria_private.import_session_with_lease(p_session_id, p_lock_token, array['awaiting_upload', 'parsing']);
  if p_code is null or p_code !~ '^IMPORT_[A-Z_]{2,60}$' then
    perform laria_private.raise_import_error('IMPORT_STATE_INVALID', 'Código de error no válido.');
  end if;
  update public.store_import_sessions
  set error_code = p_code, error_message = left(coalesce(nullif(btrim(p_message), ''), 'No pudimos leer el archivo.'), 300)
  where id = session.id;
  session := laria_private.close_import_session(session.id, 'failed');
  return laria_private.import_session_json(session);
end;
$$;

-- The merchant confirms which column holds which field. Replans every row: any earlier preview is discarded and the
-- step lease is revoked, so a step still running against the old mapping fails instead of writing stale plans.
create or replace function public.confirm_store_import_mapping(
  p_session_id uuid, p_mapping jsonb, p_expected_version integer, p_save_as_default boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare session public.store_import_sessions; header_count integer; default_mapping jsonb;
begin
  session := laria_private.import_session_for_owner(p_session_id, true);
  if session.status not in ('mapping_required', 'validating', 'ready') then
    perform laria_private.raise_import_error('IMPORT_STATE_INVALID', 'Las columnas ya no se pueden cambiar en esta importación.',
      jsonb_build_object('status', session.status));
  end if;
  if p_expected_version is null or p_expected_version <> session.version then
    perform laria_private.raise_import_error('IMPORT_VERSION_CONFLICT', 'La importación cambió. Vuelve a cargar la página.',
      jsonb_build_object('current_version', session.version));
  end if;
  header_count := jsonb_array_length(session.headers);
  if p_mapping is null or not laria_private.import_mapping_is_valid(p_mapping, header_count) then
    perform laria_private.raise_import_error('IMPORT_MAPPING_INVALID', 'Revisa las columnas elegidas: cada columna se usa una sola vez.');
  end if;
  if not (p_mapping ? 'quantity') then
    perform laria_private.raise_import_error('IMPORT_MAPPING_STOCK_REQUIRED', 'Elige la columna de stock.');
  end if;
  if not (p_mapping ?| array['sku', 'product_name', 'listing_id']) then
    perform laria_private.raise_import_error('IMPORT_MAPPING_KEY_REQUIRED', 'Elige la columna de SKU o de nombre.');
  end if;

  update public.store_import_rows
  set parsed = null, issues = '[]'::jsonb, sku_normalized = null, planned_action = null, changes = null,
      target_item_id = null, target_item_version = null, target_listing_id = null, payload_fingerprint = null,
      owner_decision = 'include', commit_status = 'pending', commit_message = null
  where session_id = session.id;

  update public.store_import_sessions
  set column_mapping = p_mapping, mapping_confirmed_at = now(), status = 'validating',
      lock_token = null, locked_until = null, version = version + 1
  where id = session.id returning * into session;
  perform laria_private.refresh_import_counts(session.id);

  if p_save_as_default then
    select coalesce(jsonb_object_agg(lower(btrim(session.headers->>((entry.value #>> '{}')::integer))), entry.key), '{}'::jsonb)
    into default_mapping
    from jsonb_each(p_mapping) entry;
    update public.store_operation_settings set import_mapping_default = default_mapping where store_id = session.store_id;
  end if;

  select * into session from public.store_import_sessions where id = session.id;
  return laria_private.import_session_json(session);
end;
$$;

-- Plans up to 100 rows: the server sends each row's parsed values and the issues it found; the database adds its own
-- checks and decides the action against current inventory.
create or replace function public.plan_store_import_rows(p_session_id uuid, p_lock_token uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session public.store_import_sessions;
  entry jsonb;
  plan record;
  parsed jsonb;
  issues jsonb;
  planned integer := 0;
begin
  session := laria_private.import_session_with_lease(p_session_id, p_lock_token, array['validating']);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 100 then
    perform laria_private.raise_import_error('IMPORT_ROWS_INVALID', 'No pudimos revisar las filas.');
  end if;
  for entry in select value from jsonb_array_elements(p_rows) loop
    parsed := entry->'parsed';
    issues := coalesce(entry->'issues', '[]'::jsonb);
    if jsonb_typeof(entry->'row_number') <> 'number' or jsonb_typeof(parsed) <> 'object'
      or octet_length(parsed::text) > 32768 or jsonb_typeof(issues) <> 'array' or jsonb_array_length(issues) > 40
      or exists (select 1 from jsonb_array_elements(issues) issue
                 where jsonb_typeof(issue) <> 'object' or coalesce(issue->>'severity', '') not in ('error', 'warning', 'info')
                    or char_length(coalesce(issue->>'message', '')) not between 1 and 300) then
      perform laria_private.raise_import_error('IMPORT_ROWS_INVALID', 'No pudimos revisar las filas.');
    end if;
    select * into plan from laria_private.plan_import_row(session.store_id, parsed, issues);
    update public.store_import_rows r
    set parsed = entry->'parsed', issues = plan.issues, sku_normalized = plan.sku_normalized,
        planned_action = plan.planned_action, changes = plan.changes, target_item_id = plan.target_item_id,
        target_item_version = plan.target_item_version, target_listing_id = plan.target_listing_id,
        payload_fingerprint = laria_private.inventory_fingerprint(entry->'parsed'),
        commit_status = 'pending', commit_message = null
    where r.session_id = session.id and r.row_number = (entry->>'row_number')::integer
      and r.planned_action is null and r.commit_status <> 'applied';
    if found then planned := planned + 1; end if;
  end loop;
  return jsonb_build_object('planned', planned);
end;
$$;

-- All rows planned: marks duplicates, counts, and moves validating → ready.
create or replace function public.finish_store_import_validation(p_session_id uuid, p_lock_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare session public.store_import_sessions; pending integer;
begin
  session := laria_private.import_session_with_lease(p_session_id, p_lock_token, array['validating']);
  select count(*) into pending from public.store_import_rows where session_id = session.id and planned_action is null;
  if pending > 0 then
    perform laria_private.raise_import_error('IMPORT_ROWS_PENDING', 'Aún hay filas por revisar.',
      jsonb_build_object('pending', pending));
  end if;
  perform laria_private.mark_import_duplicates(session.id);
  perform laria_private.refresh_import_counts(session.id);
  update public.store_import_sessions set status = 'ready', version = version + 1
  where id = session.id returning * into session;
  return laria_private.import_session_json(session);
end;
$$;

-- Include or exclude rows from the commit (null row list = every applicable row). Changes the version, so the
-- confirmation must be made on the counts the merchant now sees.
create or replace function public.set_store_import_rows_decision(
  p_session_id uuid, p_row_numbers integer[], p_decision text, p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare session public.store_import_sessions;
begin
  session := laria_private.import_session_for_owner(p_session_id, true);
  if session.status <> 'ready' then
    perform laria_private.raise_import_error('IMPORT_STATE_INVALID', 'La revisión ya no se puede cambiar.');
  end if;
  if p_expected_version is null or p_expected_version <> session.version then
    perform laria_private.raise_import_error('IMPORT_VERSION_CONFLICT', 'La importación cambió. Vuelve a cargar la página.',
      jsonb_build_object('current_version', session.version));
  end if;
  if p_decision is null or p_decision not in ('include', 'exclude')
    or (p_row_numbers is not null and cardinality(p_row_numbers) > 2000) then
    perform laria_private.raise_import_error('IMPORT_ROWS_INVALID', 'Revisa las filas elegidas.');
  end if;
  update public.store_import_rows
  set owner_decision = p_decision
  where session_id = session.id and planned_action in ('create', 'update', 'adopt_listing')
    and commit_status = 'pending'
    and (p_row_numbers is null or row_number = any(p_row_numbers));
  perform laria_private.refresh_import_counts(session.id);
  update public.store_import_sessions set version = version + 1 where id = session.id returning * into session;
  return laria_private.import_session_json(session);
end;
$$;

-- The explicit confirmation ("Crear 120, actualizar 34…"). Moves ready → committing.
create or replace function public.start_store_import_commit(p_session_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare session public.store_import_sessions; counts jsonb;
begin
  session := laria_private.import_session_for_owner(p_session_id, true);
  if session.status <> 'ready' then
    perform laria_private.raise_import_error('IMPORT_STATE_INVALID', 'La importación no está lista para confirmar.',
      jsonb_build_object('status', session.status));
  end if;
  if p_expected_version is null or p_expected_version <> session.version then
    perform laria_private.raise_import_error('IMPORT_VERSION_CONFLICT', 'La importación cambió. Revisa el resumen otra vez.',
      jsonb_build_object('current_version', session.version));
  end if;
  if laria_private.mark_import_duplicates(session.id) > 0 then
    perform laria_private.refresh_import_counts(session.id);
    update public.store_import_sessions set version = version + 1 where id = session.id;
    perform laria_private.raise_import_error('IMPORT_VERSION_CONFLICT', 'Encontramos filas repetidas. Revisa el resumen otra vez.');
  end if;
  counts := laria_private.refresh_import_counts(session.id);
  if (counts->>'to_apply')::integer = 0 then
    perform laria_private.raise_import_error('IMPORT_NOTHING_TO_APPLY', 'No hay cambios para aplicar.');
  end if;
  update public.store_import_sessions
  set status = 'committing', commit_started_at = coalesce(commit_started_at, now()), lock_token = null,
      locked_until = null, version = version + 1
  where id = session.id returning * into session;
  return laria_private.import_session_json(session);
end;
$$;

-- Commits up to 50 rows in one transaction, as the owner. Locks every listing involved in id order, then every target
-- item in id order (design §4.3), then applies each row inside its own savepoint: a row that fails is recorded as
-- failed and the rest of the chunk still commits. Rows already applied are skipped, so a retried chunk is harmless.
create or replace function public.commit_store_import_chunk(p_session_id uuid, p_lock_token uuid, p_row_numbers integer[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  session public.store_import_sessions;
  row_record public.store_import_rows;
  listing_ids uuid[];
  item_ids uuid[];
  r_status text;
  r_message text;
  r_item uuid;
  r_movement uuid;
  results jsonb := '[]'::jsonb;
begin
  session := laria_private.import_session_with_lease(p_session_id, p_lock_token, array['committing']);
  if p_row_numbers is null or cardinality(p_row_numbers) not between 1 and 50 then
    perform laria_private.raise_import_error('IMPORT_ROWS_INVALID', 'Envía entre 1 y 50 filas por paso.');
  end if;

  select coalesce(array_agg(distinct target_item_id) filter (where target_item_id is not null), '{}'),
         coalesce(array_agg(distinct target_listing_id) filter (where target_listing_id is not null), '{}')
  into item_ids, listing_ids
  from public.store_import_rows
  where session_id = session.id and row_number = any(p_row_numbers) and commit_status = 'pending'
    and owner_decision = 'include' and planned_action in ('create', 'update', 'adopt_listing');

  select coalesce(array_agg(distinct id), '{}') into listing_ids
  from (
    select unnest(listing_ids) as id
    union
    select listing_id from public.store_inventory_items where id = any(item_ids) and listing_id is not null
  ) ids;
  perform 1 from public.listings where id = any(listing_ids) order by id for update;
  perform 1 from public.store_inventory_items where id = any(item_ids) order by id for update;
  if exists (select 1 from public.store_inventory_items
             where id = any(item_ids) and listing_id is not null and not (listing_id = any(listing_ids))) then
    raise exception using errcode = '40001',
      message = 'INVENTORY_CONCURRENT_CHANGE: Un SKU cambió mientras se importaba. Intenta de nuevo.';
  end if;

  for row_record in
    select * from public.store_import_rows
    where session_id = session.id and row_number = any(p_row_numbers) and commit_status = 'pending'
      and owner_decision = 'include' and planned_action in ('create', 'update', 'adopt_listing')
    order by row_number
  loop
    begin
      select c.commit_status, c.commit_message, c.applied_item_id, c.applied_movement_id
      into r_status, r_message, r_item, r_movement
      from laria_private.commit_import_row(session, row_record, caller) c;
    exception
      when sqlstate '40001' or sqlstate '40P01' then raise;
      when unique_violation then
        r_status := 'conflict';
        r_message := 'Otro cambio creó este SKU mientras se importaba. Actualiza la fila.';
        r_item := null;
        r_movement := null;
      when others then
        r_status := 'failed';
        r_message := left(regexp_replace(SQLERRM, '^[A-Z_]+: ', ''), 300);
        r_item := null;
        r_movement := null;
    end;
    update public.store_import_rows
    set commit_status = r_status, commit_message = r_message, applied_item_id = r_item, applied_movement_id = r_movement,
        applied_at = case when r_status = 'applied' then now() end
    where session_id = session.id and row_number = row_record.row_number;
    results := results || jsonb_build_object('row_number', row_record.row_number, 'status', r_status, 'message', r_message);
  end loop;
  perform laria_private.refresh_import_counts(session.id);
  return jsonb_build_object('results', results);
end;
$$;

-- No row left to apply: committing → committed, or partially_committed when some rows ended in conflict or failure.
create or replace function public.finish_store_import_commit(p_session_id uuid, p_lock_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare session public.store_import_sessions; counts jsonb;
begin
  session := laria_private.import_session_with_lease(p_session_id, p_lock_token, array['committing']);
  counts := laria_private.refresh_import_counts(session.id);
  if (counts->>'to_apply')::integer > 0 then
    perform laria_private.raise_import_error('IMPORT_ROWS_PENDING', 'Aún hay filas por aplicar.',
      jsonb_build_object('pending', counts->'to_apply'));
  end if;
  session := laria_private.close_import_session(session.id,
    case when (counts->>'conflict')::integer + (counts->>'failed')::integer > 0 then 'partially_committed' else 'committed' end);
  return laria_private.import_session_json(session);
end;
$$;

-- After a partial commit: the rows that ended in conflict or failed are planned again against current values and go
-- back to the review, where the merchant sees what would change now and confirms again. Reopens the session, so it
-- must be the store's only open import.
create or replace function public.reopen_store_import(p_session_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare session public.store_import_sessions; affected integer;
begin
  session := laria_private.import_session_for_owner(p_session_id, true);
  if session.status <> 'partially_committed' then
    perform laria_private.raise_import_error('IMPORT_STATE_INVALID', 'Esta importación no tiene filas por revisar.');
  end if;
  if p_expected_version is null or p_expected_version <> session.version then
    perform laria_private.raise_import_error('IMPORT_VERSION_CONFLICT', 'La importación cambió. Vuelve a cargar la página.');
  end if;
  update public.store_import_rows
  set planned_action = null, commit_status = 'pending', commit_message = null, changes = null,
      target_item_id = null, target_item_version = null, target_listing_id = null
  where session_id = session.id and commit_status in ('conflict', 'failed');
  get diagnostics affected = row_count;
  if affected = 0 then
    perform laria_private.raise_import_error('IMPORT_NOTHING_TO_APPLY', 'No hay filas por revisar.');
  end if;
  begin
    update public.store_import_sessions
    set status = 'validating', closed_at = null, committed_at = null, result_summary = null, version = version + 1,
        lock_token = null, locked_until = null
    where id = session.id returning * into session;
  exception when unique_violation then
    perform laria_private.raise_import_error('IMPORT_ALREADY_OPEN', 'Ya tienes otra importación abierta. Termínala primero.');
  end;
  perform laria_private.refresh_import_counts(session.id);
  select * into session from public.store_import_sessions where id = session.id;
  return laria_private.import_session_json(session);
end;
$$;

-- Stops an open import. Rows already applied stay applied (they are ledger history); nothing else is applied.
create or replace function public.cancel_store_import(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare session public.store_import_sessions;
begin
  session := laria_private.import_session_for_owner(p_session_id, false);
  if session.status = 'partially_committed' then
    -- Closing a partial import just confirms it stays as it is.
    return laria_private.import_session_json(session);
  end if;
  if not laria_private.import_session_is_open(session.status) then
    perform laria_private.raise_import_error('IMPORT_SESSION_CLOSED', 'Esta importación ya terminó.');
  end if;
  perform laria_private.refresh_import_counts(session.id);
  session := laria_private.close_import_session(session.id, 'cancelled');
  return laria_private.import_session_json(session);
end;
$$;

-- ------------------------------------------------------------------ retention (design §7.9)

-- Daily: open sessions idle for 7 days expire; staged rows of sessions closed 30 days ago are deleted and their source
-- file is queued for deletion. Session rows stay, with their result summary. Never applies anything.
create or replace function laria_private.run_store_import_retention()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare expired integer; purged integer;
begin
  with stale as (
    select id from public.store_import_sessions
    where laria_private.import_session_is_open(status) and updated_at < now() - interval '7 days'
      and (locked_until is null or locked_until < now())
    for update skip locked
  )
  update public.store_import_sessions s
  set status = 'expired', closed_at = now(), lock_token = null, locked_until = null, version = version + 1,
      result_summary = counts
  from stale where s.id = stale.id;
  get diagnostics expired = row_count;

  with old as (
    select id, file_path from public.store_import_sessions
    where closed_at < now() - interval '30 days' and rows_purged_at is null
    order by closed_at
    limit 500
    for update skip locked
  ), queued as (
    insert into laria_private.store_import_file_deletions(bucket, path)
    select 'store-imports', file_path from old
    on conflict do nothing
  ), deleted as (
    delete from public.store_import_rows r using old where r.session_id = old.id
  )
  update public.store_import_sessions s set rows_purged_at = now() from old where s.id = old.id;
  get diagnostics purged = row_count;

  return jsonb_build_object('expired', expired, 'purged', purged);
end;
$$;

-- Service role only (the cleanup route): claims up to 100 queued paths. A claim older than an hour is retried.
create or replace function public.claim_store_import_file_deletions(p_limit integer default 100)
returns table(bucket text, path text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  perform laria_private.run_store_import_retention();
  return query
  with claimed as (
    select d.bucket, d.path from laria_private.store_import_file_deletions d
    where d.deleted_at is null and (d.claimed_at is null or d.claimed_at < now() - interval '1 hour')
    order by d.queued_at
    limit least(greatest(coalesce(p_limit, 100), 1), 100)
    for update skip locked
  )
  update laria_private.store_import_file_deletions d set claimed_at = now()
  from claimed where d.bucket = claimed.bucket and d.path = claimed.path
  returning d.bucket, d.path;
end;
$$;

create or replace function public.complete_store_import_file_deletions(p_paths text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare done integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  update laria_private.store_import_file_deletions
  set deleted_at = now()
  where bucket = 'store-imports' and path = any(coalesce(p_paths, '{}')) and deleted_at is null;
  get diagnostics done = row_count;
  return done;
end;
$$;

-- Daily at 09:15 UTC (04:15 Lima). cron.schedule() with a job name replaces the job of that name. The cleanup route
-- (/api/internal/store-imports/cleanup, CRON_SECRET) runs the same retention before it deletes files, so either
-- schedule alone is enough for the database part; only the route can remove the files themselves. The route has no
-- schedule yet: the pre-go-live Hobby release registers no Vercel cron (sprint-7 test), so it is called by the same
-- external scheduler as the email worker once one exists; until then queued files simply wait.
select cron.schedule('store-import-retention', '15 9 * * *', $$select laria_private.run_store_import_retention()$$);

-- ------------------------------------------------------------------ function privileges

revoke all on function public.create_store_import_session(text, text, integer) from public, anon, authenticated;
revoke all on function public.claim_store_import_step(uuid) from public, anon, authenticated;
revoke all on function public.release_store_import_step(uuid, uuid) from public, anon, authenticated;
revoke all on function public.begin_store_import_parse(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.stage_store_import_rows(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.finish_store_import_parse(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fail_store_import(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.confirm_store_import_mapping(uuid, jsonb, integer, boolean) from public, anon, authenticated;
revoke all on function public.plan_store_import_rows(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.finish_store_import_validation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_store_import_rows_decision(uuid, integer[], text, integer) from public, anon, authenticated;
revoke all on function public.start_store_import_commit(uuid, integer) from public, anon, authenticated;
revoke all on function public.commit_store_import_chunk(uuid, uuid, integer[]) from public, anon, authenticated;
revoke all on function public.finish_store_import_commit(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reopen_store_import(uuid, integer) from public, anon, authenticated;
revoke all on function public.cancel_store_import(uuid) from public, anon, authenticated;
revoke all on function public.claim_store_import_file_deletions(integer) from public, anon, authenticated;
revoke all on function public.complete_store_import_file_deletions(text[]) from public, anon, authenticated;

grant execute on function public.create_store_import_session(text, text, integer) to authenticated;
grant execute on function public.claim_store_import_step(uuid) to authenticated;
grant execute on function public.release_store_import_step(uuid, uuid) to authenticated;
grant execute on function public.begin_store_import_parse(uuid, uuid, text, integer) to authenticated;
grant execute on function public.stage_store_import_rows(uuid, uuid, jsonb) to authenticated;
grant execute on function public.finish_store_import_parse(uuid, uuid, jsonb) to authenticated;
grant execute on function public.fail_store_import(uuid, uuid, text, text) to authenticated;
grant execute on function public.confirm_store_import_mapping(uuid, jsonb, integer, boolean) to authenticated;
grant execute on function public.plan_store_import_rows(uuid, uuid, jsonb) to authenticated;
grant execute on function public.finish_store_import_validation(uuid, uuid) to authenticated;
grant execute on function public.set_store_import_rows_decision(uuid, integer[], text, integer) to authenticated;
grant execute on function public.start_store_import_commit(uuid, integer) to authenticated;
grant execute on function public.commit_store_import_chunk(uuid, uuid, integer[]) to authenticated;
grant execute on function public.finish_store_import_commit(uuid, uuid) to authenticated;
grant execute on function public.reopen_store_import(uuid, integer) to authenticated;
grant execute on function public.cancel_store_import(uuid) to authenticated;
grant execute on function public.claim_store_import_file_deletions(integer) to service_role;
grant execute on function public.complete_store_import_file_deletions(text[]) to service_role;

do $$
declare fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'laria_private' and p.proname in (
      'raise_import_error', 'import_session_is_open', 'import_session_json', 'import_session_for_owner',
      'import_session_with_lease', 'close_import_session', 'import_mapping_is_valid', 'import_row_field_issues',
      'import_text', 'import_int', 'plan_import_row', 'refresh_import_counts', 'mark_import_duplicates',
      'commit_import_row', 'run_store_import_retention')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end;
$$;
