-- Feature ideas, batch "store-reach" (docs/feature-ideas/store-reach.md): reach-01 "Importar desde Mercado Libre".
--
-- A store connects its Mercado Libre account through Mercado Libre's own OAuth (authorization code with PKCE), picks
-- publications there, and Laria turns them into an ordinary inventory import (the existing wizard: mapping, review,
-- commit, then publishing under the usual moderation and allowance). Photos come from Mercado Libre's image hosts and
-- go through the import's own photo check.
--
-- Two tables:
--   * store_mercadolibre_connections: one per store, with the tokens encrypted by the server (AES-256-GCM with
--     MERCADOLIBRE_TOKEN_KEY). Nobody reads them through the API: only service-role functions write or return them, and
--     only for the owner the server names after checking the session. The owner sees whether it is connected and the
--     Mercado Libre nickname, and can disconnect.
--   * store_mercadolibre_import_photos: the photos of each publication brought into an import, by SKU and order, for
--     the step that copies them into the import once its rows are reviewed.
--
-- Off by default: without the server's credentials no connection can be made and the page says it is not available.
-- Additive: two tables and the functions listed at the end. No existing function is redefined.

create table public.store_mercadolibre_connections (
  store_id           uuid primary key references public.stores(id) on delete cascade,
  ml_user_id         bigint not null check (ml_user_id > 0),
  ml_nickname        text check (ml_nickname is null or char_length(ml_nickname) <= 120),
  access_token_enc   text not null check (char_length(access_token_enc) <= 4000),
  refresh_token_enc  text check (refresh_token_enc is null or char_length(refresh_token_enc) <= 4000),
  expires_at         timestamptz not null,
  scope              text check (scope is null or char_length(scope) <= 400),
  connected_by       uuid not null references auth.users(id) on delete cascade,
  connected_at       timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.store_mercadolibre_connections is
  'reach-01: a store''s Mercado Libre connection. Tokens are encrypted by the server; only service-role functions touch them.';

alter table public.store_mercadolibre_connections enable row level security;
revoke all on public.store_mercadolibre_connections from public, anon, authenticated;

create table public.store_mercadolibre_import_photos (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.store_import_sessions(id) on delete cascade,
  store_id     uuid not null references public.stores(id) on delete cascade,
  sku          text not null check (sku ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  sort_order   integer not null check (sort_order between 1 and 10),
  -- Only Mercado Libre's image hosts, over https.
  source_url   text not null check (char_length(source_url) <= 500 and source_url ~ '^https://[a-z0-9-]+\.mlstatic\.com/[A-Za-z0-9._~/%-]+$'),
  status       text not null default 'pending' check (status in ('pending', 'working', 'done', 'failed')),
  claimed_at   timestamptz,
  failure      text check (failure is null or char_length(failure) <= 200),
  asset_id     uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (session_id, sku, sort_order)
);

comment on table public.store_mercadolibre_import_photos is
  'reach-01: photos of Mercado Libre publications brought into an import, copied once the import accepts photos.';

create index store_mercadolibre_import_photos_pending_idx on public.store_mercadolibre_import_photos (session_id, status, sku, sort_order);

alter table public.store_mercadolibre_import_photos enable row level security;
revoke all on public.store_mercadolibre_import_photos from public, anon, authenticated;

-- ------------------------------------------------------------------ connection

-- What the owner sees: connected or not, and the account's nickname.
create or replace function public.get_mercadolibre_connection()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_store public.stores := laria_private.reach_caller_store(false);
  connection public.store_mercadolibre_connections;
begin
  select * into connection from public.store_mercadolibre_connections c where c.store_id = caller_store.id;
  return jsonb_build_object('connected', connection.store_id is not null, 'ml_user_id', connection.ml_user_id,
    'nickname', connection.ml_nickname, 'connected_at', connection.connected_at, 'store_status', caller_store.status);
end;
$$;

create or replace function public.disconnect_mercadolibre()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_store public.stores := laria_private.reach_caller_store(false);
begin
  delete from public.store_mercadolibre_connections c where c.store_id = caller_store.id;
  return jsonb_build_object('connected', false);
end;
$$;

-- Service role only: the server exchanged the code for the owner it checked; the store must be theirs and active.
create or replace function public.save_mercadolibre_connection(
  p_owner_user_id uuid, p_ml_user_id bigint, p_nickname text, p_access_token_enc text, p_refresh_token_enc text,
  p_expires_at timestamptz, p_scope text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store public.stores;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'MERCADOLIBRE_SERVICE_REQUIRED: Solo el servidor guarda la conexión.';
  end if;
  select * into owner_store from public.stores s where s.owner_user_id = p_owner_user_id;
  if owner_store.id is null or owner_store.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'STORE_NOT_ACTIVE: Tu tienda debe estar activa para conectar Mercado Libre.';
  end if;
  if p_ml_user_id is null or p_ml_user_id < 1 or coalesce(p_access_token_enc, '') = '' or p_expires_at is null then
    raise exception using errcode = 'P0001', message = 'MERCADOLIBRE_TOKEN_INVALID: Mercado Libre no devolvió una conexión válida.';
  end if;
  insert into public.store_mercadolibre_connections as c (store_id, ml_user_id, ml_nickname, access_token_enc, refresh_token_enc,
    expires_at, scope, connected_by)
  values (owner_store.id, p_ml_user_id, left(p_nickname, 120), p_access_token_enc, p_refresh_token_enc, p_expires_at, left(p_scope, 400),
    p_owner_user_id)
  on conflict (store_id) do update set ml_user_id = excluded.ml_user_id, ml_nickname = excluded.ml_nickname,
    access_token_enc = excluded.access_token_enc, refresh_token_enc = excluded.refresh_token_enc, expires_at = excluded.expires_at,
    scope = excluded.scope, connected_by = excluded.connected_by, connected_at = now(), updated_at = now();
  return jsonb_build_object('connected', true, 'nickname', left(p_nickname, 120));
end;
$$;

-- Service role only: the encrypted tokens of the owner's store, for a call the owner asked for.
create or replace function public.get_mercadolibre_tokens(p_owner_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  connection public.store_mercadolibre_connections;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'MERCADOLIBRE_SERVICE_REQUIRED: Solo el servidor lee la conexión.';
  end if;
  select c.* into connection from public.store_mercadolibre_connections c
  join public.stores s on s.id = c.store_id
  where s.owner_user_id = p_owner_user_id and s.status = 'active';
  if connection.store_id is null then return null; end if;
  return jsonb_build_object('store_id', connection.store_id, 'ml_user_id', connection.ml_user_id,
    'access_token_enc', connection.access_token_enc, 'refresh_token_enc', connection.refresh_token_enc,
    'expires_at', connection.expires_at);
end;
$$;

-- Service role only: new tokens after a refresh. Applies only to the connection the refresh started from, so a
-- reconnection in between is never overwritten by an older refresh.
create or replace function public.update_mercadolibre_tokens(
  p_store_id uuid, p_previous_access_token_enc text, p_access_token_enc text, p_refresh_token_enc text, p_expires_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'MERCADOLIBRE_SERVICE_REQUIRED: Solo el servidor guarda la conexión.';
  end if;
  update public.store_mercadolibre_connections c set access_token_enc = p_access_token_enc,
    refresh_token_enc = coalesce(p_refresh_token_enc, c.refresh_token_enc), expires_at = p_expires_at, updated_at = now()
  where c.store_id = p_store_id and c.access_token_enc = p_previous_access_token_enc;
  return found;
end;
$$;

-- ------------------------------------------------------------------ photos of an import

-- Right after the server created the import from Mercado Libre: the photos of each SKU, in order (at most 10 each,
-- 600 in all, like the import itself). The session must be the caller's and still waiting for its file.
create or replace function public.record_mercadolibre_import_photos(p_session_id uuid, p_photos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_store public.stores := laria_private.reach_caller_store(true);
  session public.store_import_sessions;
  entry jsonb;
  inserted integer := 0;
begin
  select * into session from public.store_import_sessions s where s.id = p_session_id and s.store_id = caller_store.id for update;
  if session.id is null or session.status not in ('awaiting_upload', 'parsing') then
    raise exception using errcode = 'P0001', message = 'MERCADOLIBRE_IMPORT_NOT_FOUND: No encontramos esa importación.';
  end if;
  if p_photos is null or jsonb_typeof(p_photos) <> 'array' or jsonb_array_length(p_photos) > 600 then
    raise exception using errcode = 'P0001', message = 'MERCADOLIBRE_PHOTOS_INVALID: Una importación admite hasta 600 fotos.';
  end if;
  for entry in select value from jsonb_array_elements(p_photos) loop
    begin
      insert into public.store_mercadolibre_import_photos (session_id, store_id, sku, sort_order, source_url)
      values (session.id, caller_store.id, entry->>'sku', (entry->>'order')::integer, entry->>'url')
      on conflict (session_id, sku, sort_order) do nothing;
      if found then inserted := inserted + 1; end if;
    exception when check_violation or invalid_text_representation or not_null_violation then
      -- A photo that is not from Mercado Libre's image hosts, or a SKU the import would not accept, is left out.
      null;
    end;
  end loop;
  return jsonb_build_object('recorded', inserted);
end;
$$;

-- Up to p_limit photos to copy now, marked as being worked on for two minutes (another tab or a retried request skips
-- them meanwhile). Only once the import accepts photos (its rows are reviewed).
create or replace function public.claim_mercadolibre_import_photos(p_session_id uuid, p_limit integer default 4)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_store public.stores := laria_private.reach_caller_store(true);
  session public.store_import_sessions;
  claimed jsonb;
begin
  select * into session from public.store_import_sessions s where s.id = p_session_id and s.store_id = caller_store.id;
  if session.id is null then
    raise exception using errcode = 'P0001', message = 'MERCADOLIBRE_IMPORT_NOT_FOUND: No encontramos esa importación.';
  end if;
  if session.status not in ('ready', 'committing', 'committed', 'partially_committed') then
    return jsonb_build_object('photos', '[]'::jsonb, 'accepting', false);
  end if;
  with picked as (
    select p.id from public.store_mercadolibre_import_photos p
    where p.session_id = session.id
      and (p.status = 'pending' or (p.status = 'working' and p.claimed_at < now() - interval '2 minutes'))
    order by p.sku, p.sort_order
    limit greatest(1, least(coalesce(p_limit, 4), 8))
    for update skip locked
  ), marked as (
    update public.store_mercadolibre_import_photos p set status = 'working', claimed_at = now(), updated_at = now()
    from picked where p.id = picked.id
    returning p.id, p.sku, p.sort_order, p.source_url
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'sku', m.sku, 'order', m.sort_order, 'url', m.source_url)
    order by m.sku, m.sort_order), '[]'::jsonb) into claimed from marked m;
  return jsonb_build_object('photos', claimed, 'accepting', true);
end;
$$;

create or replace function public.finish_mercadolibre_import_photo(p_id uuid, p_status text, p_asset_id uuid, p_failure text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_store public.stores := laria_private.reach_caller_store(true);
begin
  if p_status not in ('done', 'failed', 'pending') then
    raise exception using errcode = 'P0001', message = 'MERCADOLIBRE_PHOTOS_INVALID: Estado de foto inválido.';
  end if;
  update public.store_mercadolibre_import_photos p set status = p_status, asset_id = p_asset_id, failure = left(p_failure, 200),
    claimed_at = null, updated_at = now()
  where p.id = p_id and p.store_id = caller_store.id and p.status = 'working';
end;
$$;

create or replace function public.get_mercadolibre_import_photos(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_store public.stores := laria_private.reach_caller_store(false);
  session public.store_import_sessions;
begin
  select * into session from public.store_import_sessions s where s.id = p_session_id and s.store_id = caller_store.id;
  if session.id is null then
    raise exception using errcode = 'P0001', message = 'MERCADOLIBRE_IMPORT_NOT_FOUND: No encontramos esa importación.';
  end if;
  return (
    select jsonb_build_object(
      'total', count(*),
      'pending', count(*) filter (where p.status in ('pending', 'working')),
      'done', count(*) filter (where p.status = 'done'),
      'failed', count(*) filter (where p.status = 'failed'),
      'accepting', session.status in ('ready', 'committing', 'committed', 'partially_committed'))
    from public.store_mercadolibre_import_photos p where p.session_id = session.id);
end;
$$;

-- ------------------------------------------------------------------ grants

revoke all on function public.get_mercadolibre_connection() from public, anon, authenticated;
revoke all on function public.disconnect_mercadolibre() from public, anon, authenticated;
revoke all on function public.save_mercadolibre_connection(uuid, bigint, text, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.get_mercadolibre_tokens(uuid) from public, anon, authenticated;
revoke all on function public.update_mercadolibre_tokens(uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.record_mercadolibre_import_photos(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.claim_mercadolibre_import_photos(uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_mercadolibre_import_photo(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.get_mercadolibre_import_photos(uuid) from public, anon, authenticated;
grant execute on function public.get_mercadolibre_connection() to authenticated;
grant execute on function public.disconnect_mercadolibre() to authenticated;
grant execute on function public.save_mercadolibre_connection(uuid, bigint, text, text, text, timestamptz, text) to service_role;
grant execute on function public.get_mercadolibre_tokens(uuid) to service_role;
grant execute on function public.update_mercadolibre_tokens(uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.record_mercadolibre_import_photos(uuid, jsonb) to authenticated;
grant execute on function public.claim_mercadolibre_import_photos(uuid, integer) to authenticated;
grant execute on function public.finish_mercadolibre_import_photo(uuid, text, uuid, text) to authenticated;
grant execute on function public.get_mercadolibre_import_photos(uuid) to authenticated;
