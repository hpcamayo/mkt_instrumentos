-- PR #54 final review: refresh the counter's complete stock snapshot and coordinate single-use ML token rotation.
-- No hosted changes: ship with the rest of this branch at the coordinated release.

-- The item index and location counts share one snapshot; no PostgREST row cap or extra per-item requests.
create or replace function public.get_counter_index()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare owner_store_id uuid := laria_private.inventory_caller_store(false);
begin
  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'merchant_sku', i.merchant_sku, 'external_reference', i.external_reference,
      'product_name', i.product_name, 'variant_label', i.variant_label,
      'quantity_available', i.quantity_available, 'unit_price_pen', i.unit_price_pen,
      'version', i.version, 'listing_title', l.title) order by i.merchant_sku), '[]'::jsonb)
      from public.store_inventory_items i left join public.listings l on l.id = i.listing_id
      where i.store_id = owner_store_id and i.inventory_status = 'active'),
    'location_stock', (select coalesce(jsonb_object_agg(stock.location_id, stock.items), '{}'::jsonb)
      from (select s.location_id, jsonb_object_agg(s.item_id, s.quantity_on_hand) as items
        from public.store_location_stock s
        join public.store_inventory_items i on i.id = s.item_id and i.inventory_status = 'active'
        where s.store_id = owner_store_id group by s.location_id) stock),
    'generated_at', now());
end;
$$;

-- A lease coordinates separate server workers. The source ciphertext fences out a reconnect, including when an
-- OAuth callback replaces a connection while the provider request is in flight. Only encrypted tokens are stored.
create table laria_private.mercadolibre_refresh_claims (
  store_id uuid primary key references public.store_mercadolibre_connections(store_id) on delete cascade,
  access_token_enc text not null,
  claim_id uuid not null,
  lease_until timestamptz not null
);
revoke all on laria_private.mercadolibre_refresh_claims from public, anon, authenticated, service_role;

create function public.claim_mercadolibre_refresh(p_store_id uuid, p_previous_access_token_enc text, p_claim_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare connection public.store_mercadolibre_connections; lease laria_private.mercadolibre_refresh_claims;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'MERCADOLIBRE_SERVICE_REQUIRED: Solo el servidor renueva la conexión.';
  end if;
  if p_claim_id is null then raise exception 'MERCADOLIBRE_CLAIM_REQUIRED'; end if;
  select * into connection from public.store_mercadolibre_connections where store_id = p_store_id for update;
  if connection.store_id is null or connection.access_token_enc is distinct from p_previous_access_token_enc then
    return 'changed';
  end if;
  select * into lease from laria_private.mercadolibre_refresh_claims where store_id = p_store_id;
  if lease.access_token_enc = connection.access_token_enc and lease.lease_until > clock_timestamp() then
    return case when lease.claim_id = p_claim_id then 'claimed' else 'busy' end;
  end if;
  insert into laria_private.mercadolibre_refresh_claims values (p_store_id, p_previous_access_token_enc, p_claim_id, clock_timestamp() + interval '60 seconds')
  on conflict(store_id) do update set access_token_enc = excluded.access_token_enc, claim_id = excluded.claim_id, lease_until = excluded.lease_until;
  return 'claimed';
end;
$$;

create function public.finish_mercadolibre_refresh(p_store_id uuid, p_previous_access_token_enc text, p_claim_id uuid,
  p_access_token_enc text, p_refresh_token_enc text, p_expires_at timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
declare connection public.store_mercadolibre_connections;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'MERCADOLIBRE_SERVICE_REQUIRED: Solo el servidor guarda la conexión.';
  end if;
  if coalesce(p_access_token_enc, '') = '' or coalesce(p_refresh_token_enc, '') = '' or p_expires_at is null then
    raise exception 'MERCADOLIBRE_TOKEN_INVALID';
  end if;
  select * into connection from public.store_mercadolibre_connections where store_id = p_store_id for update;
  if connection.store_id is null then return false; end if;
  -- Retrying a committed save whose response was lost is a success, without rotating again.
  if connection.access_token_enc = p_access_token_enc and connection.refresh_token_enc = p_refresh_token_enc then return true; end if;
  if connection.access_token_enc is distinct from p_previous_access_token_enc or not exists (
    select 1 from laria_private.mercadolibre_refresh_claims r where r.store_id = p_store_id
      and r.claim_id = p_claim_id and r.access_token_enc = p_previous_access_token_enc) then return false; end if;
  update public.store_mercadolibre_connections set access_token_enc = p_access_token_enc,
    refresh_token_enc = p_refresh_token_enc, expires_at = p_expires_at, updated_at = now() where store_id = p_store_id;
  delete from laria_private.mercadolibre_refresh_claims where store_id = p_store_id and claim_id = p_claim_id;
  return true;
end;
$$;

create function public.release_mercadolibre_refresh(p_store_id uuid, p_claim_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'MERCADOLIBRE_SERVICE_REQUIRED: Solo el servidor renueva la conexión.';
  end if;
  delete from laria_private.mercadolibre_refresh_claims where store_id = p_store_id and claim_id = p_claim_id;
end;
$$;

revoke all on function public.claim_mercadolibre_refresh(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.finish_mercadolibre_refresh(uuid, text, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.release_mercadolibre_refresh(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_mercadolibre_refresh(uuid, text, uuid) to service_role;
grant execute on function public.finish_mercadolibre_refresh(uuid, text, uuid, text, text, timestamptz) to service_role;
grant execute on function public.release_mercadolibre_refresh(uuid, uuid) to service_role;
