-- STORE-1b: reads and bulk actions for the Inventario screens (docs/store-operations/design.md §5.5, §13.1–§13.3).
-- Additive: one replaced read function and two new owner functions. No table, column, policy or trigger changes.

-- ------------------------------------------------------------------ summary tiles

-- Same contract as STORE-1a plus the store's own sales figures (§5.5: merchant-reported, never revenue verified by
-- Laria), owner-hidden publications and the five latest movements for the "Movimientos recientes" list.
create or replace function public.get_inventory_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_caller_store(false);
  store_record public.stores;
  enabled boolean;
  totals jsonb;
  sales jsonb;
  recent jsonb;
begin
  select * into store_record from public.stores where id = owner_store_id;
  select coalesce(settings.inventory_enabled, false) into enabled
  from (select 1) one left join public.store_operation_settings settings on settings.store_id = owner_store_id;

  select jsonb_build_object(
      'skus', count(*) filter (where i.inventory_status = 'active'),
      'archived', count(*) filter (where i.inventory_status = 'archived'),
      'units', coalesce(sum(i.quantity_on_hand) filter (where i.inventory_status = 'active'), 0),
      'available_units', coalesce(sum(i.quantity_available) filter (where i.inventory_status = 'active'), 0),
      'low_stock', count(*) filter (where i.inventory_status = 'active'
        and laria_private.inventory_stock_level(i.quantity_available, i.low_stock_threshold) = 'low'),
      'out_of_stock', count(*) filter (where i.inventory_status = 'active' and i.quantity_available = 0),
      'unlinked', count(*) filter (where i.inventory_status = 'active' and i.listing_id is null),
      'published', count(*) filter (where l.status = 'approved'),
      'hidden', count(*) filter (where l.status = 'hidden'),
      'in_review', count(*) filter (where l.status = 'pending' or exists (
        select 1 from public.listing_revisions r where r.listing_id = l.id and r.status = 'pending')),
      'rejected', count(*) filter (where l.status = 'rejected'))
  into totals
  from public.store_inventory_items i
  left join public.listings l on l.id = i.listing_id
  where i.store_id = owner_store_id;

  -- Net of returns: a return in the window cancels a recorded sale in the window.
  select jsonb_build_object(
      'sales_30d_units', coalesce(sum(-m.on_hand_delta) filter (where m.movement_type = 'sale'), 0)
                         - coalesce(sum(m.on_hand_delta) filter (where m.movement_type = 'return'), 0),
      'sales_30d_count', count(*) filter (where m.movement_type = 'sale'))
  into sales
  from public.store_stock_movements m
  where m.store_id = owner_store_id
    and m.movement_type in ('sale', 'return')
    and m.created_at >= now() - interval '30 days';

  select coalesce(jsonb_agg(row_value order by created_at desc, id desc), '[]'::jsonb) into recent
  from (
    select m.id, m.created_at, jsonb_build_object(
        'id', m.id, 'item_id', m.item_id, 'merchant_sku', i.merchant_sku, 'product_name', i.product_name,
        'movement_type', m.movement_type, 'channel', m.channel, 'on_hand_delta', m.on_hand_delta,
        'on_hand_after', m.on_hand_after, 'actor_kind', m.actor_kind, 'created_at', m.created_at) as row_value
    from public.store_stock_movements m
    join public.store_inventory_items i on i.id = m.item_id
    where m.store_id = owner_store_id
    order by m.created_at desc, m.id desc
    limit 5
  ) latest;

  return jsonb_build_object(
      'inventory_enabled', enabled,
      'can_write', enabled and store_record.status in ('pending', 'active'),
      'store_status', store_record.status,
      'recent_movements', recent)
    || totals || sales;
end;
$$;

-- ------------------------------------------------------------------ bulk low-stock threshold

-- All-or-nothing, up to 200 distinct SKU of the caller's store; null clears the threshold. Audited per item as a
-- 'details' change. A retried batch returns its first result (same receipt table as the STORE-1a bulk functions).
create or replace function public.set_inventory_threshold_bulk(p_item_ids uuid[], p_threshold integer, p_batch_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner_store_id uuid := laria_private.inventory_caller_store(true);
  request_batch_key text := laria_private.inventory_request_key(p_batch_key, 160);
  fingerprint text;
  receipt laria_private.store_inventory_batch_receipts;
  item public.store_inventory_items;
  changes jsonb := '[]'::jsonb;
  result jsonb;
begin
  if p_item_ids is null or cardinality(p_item_ids) not between 1 and 200
    or array_position(p_item_ids, null) is not null
    or (select count(distinct id) from unnest(p_item_ids) id) <> cardinality(p_item_ids) then
    perform laria_private.raise_inventory_error('INVENTORY_BULK_INVALID', 'Elige entre 1 y 200 SKU distintos.');
  end if;
  if p_threshold is not null and p_threshold not between 0 and 100000 then
    perform laria_private.raise_inventory_error('INVENTORY_FIELD_INVALID', 'El umbral de stock bajo va de 0 a 100000.',
      jsonb_build_object('field', 'low_stock_threshold'));
  end if;

  fingerprint := laria_private.inventory_fingerprint(jsonb_build_array(
    'set_inventory_threshold_bulk', (select jsonb_agg(id order by id) from unnest(p_item_ids) id), p_threshold));
  perform pg_advisory_xact_lock(hashtextextended(owner_store_id::text || ':' || request_batch_key, 23));
  select * into receipt from laria_private.store_inventory_batch_receipts r
  where r.store_id = owner_store_id and r.batch_key = request_batch_key;
  if found then
    if receipt.operation <> 'threshold' or receipt.request_fingerprint <> fingerprint then
      perform laria_private.raise_inventory_error('IDEMPOTENCY_KEY_REUSED', 'Esta solicitud ya se usó con otros datos.');
    end if;
    return receipt.result || jsonb_build_object('replayed', true);
  end if;

  if (select count(*) from public.store_inventory_items i
      where i.id = any(p_item_ids) and i.store_id = owner_store_id) <> cardinality(p_item_ids) then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_NOT_OWNED', 'No puedes administrar uno de estos SKU.');
  end if;
  perform laria_private.lock_inventory_items(p_item_ids);

  for item in select * from public.store_inventory_items where id = any(p_item_ids) order by id loop
    if item.inventory_status = 'archived' then
      perform laria_private.raise_inventory_error('INVENTORY_ITEM_ARCHIVED',
        'El SKU ' || item.merchant_sku || ' está archivado; reactívalo antes de cambiarlo.',
        jsonb_build_object('item_id', item.id));
    end if;
    continue when item.low_stock_threshold is not distinct from p_threshold;
    perform laria_private.record_inventory_change(item, 'details',
      jsonb_build_object('low_stock_threshold', item.low_stock_threshold),
      jsonb_build_object('low_stock_threshold', p_threshold), caller, 'owner', 'Cambio de umbral masivo');
    update public.store_inventory_items set low_stock_threshold = p_threshold, version = version + 1 where id = item.id;
    changes := changes || jsonb_build_array(jsonb_build_object('id', item.id, 'before', item.low_stock_threshold, 'after', p_threshold));
  end loop;

  result := jsonb_build_object('batch_key', request_batch_key, 'changes', changes);
  insert into laria_private.store_inventory_batch_receipts(store_id, batch_key, operation, request_fingerprint, result, actor_user_id)
  values (owner_store_id, request_batch_key, 'threshold', fingerprint, result, caller);
  return result || jsonb_build_object('replayed', false);
end;
$$;

-- ------------------------------------------------------------------ bulk hide

-- "Ocultar" on selected SKU (§13.1 bulk bar): hides each linked approved publication through the owner's existing
-- set_owned_listing_lifecycle('hide'), so the hide is the V1 owner hide in every respect (restorable from the listing,
-- Admin-hidden rows untouched). SKU without a linked approved publication are skipped and reported, never an error, so
-- a mixed selection works; the hides themselves are all-or-nothing. Stock and links are not changed.
create or replace function public.hide_inventory_listings_bulk(p_item_ids uuid[], p_batch_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner_store_id uuid := laria_private.inventory_caller_store(true);
  request_batch_key text := laria_private.inventory_request_key(p_batch_key, 160);
  fingerprint text;
  receipt laria_private.store_inventory_batch_receipts;
  target record;
  hidden jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
  previous_flag text := current_setting('app.allow_listing_admin_fields', true);
  result jsonb;
begin
  if p_item_ids is null or cardinality(p_item_ids) not between 1 and 200
    or array_position(p_item_ids, null) is not null
    or (select count(distinct id) from unnest(p_item_ids) id) <> cardinality(p_item_ids) then
    perform laria_private.raise_inventory_error('INVENTORY_BULK_INVALID', 'Elige entre 1 y 200 SKU distintos.');
  end if;

  fingerprint := laria_private.inventory_fingerprint(jsonb_build_array(
    'hide_inventory_listings_bulk', (select jsonb_agg(id order by id) from unnest(p_item_ids) id)));
  perform pg_advisory_xact_lock(hashtextextended(owner_store_id::text || ':' || request_batch_key, 23));
  select * into receipt from laria_private.store_inventory_batch_receipts r
  where r.store_id = owner_store_id and r.batch_key = request_batch_key;
  if found then
    if receipt.operation <> 'hide' or receipt.request_fingerprint <> fingerprint then
      perform laria_private.raise_inventory_error('IDEMPOTENCY_KEY_REUSED', 'Esta solicitud ya se usó con otros datos.');
    end if;
    return receipt.result || jsonb_build_object('replayed', true);
  end if;

  if (select count(*) from public.store_inventory_items i
      where i.id = any(p_item_ids) and i.store_id = owner_store_id) <> cardinality(p_item_ids) then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_NOT_OWNED', 'No puedes administrar uno de estos SKU.');
  end if;
  -- Listings then items, as on every inventory path; set_owned_listing_lifecycle re-locks the listing it already holds.
  perform laria_private.lock_inventory_items(p_item_ids);

  for target in
    select i.id, i.merchant_sku, i.listing_id, l.status
    from public.store_inventory_items i
    left join public.listings l on l.id = i.listing_id
    where i.id = any(p_item_ids)
    order by i.id
  loop
    if target.listing_id is not null and target.status = 'approved' then
      perform public.set_owned_listing_lifecycle(target.listing_id, 'hide');
      hidden := hidden || jsonb_build_array(jsonb_build_object('id', target.id, 'listing_id', target.listing_id));
    else
      skipped := skipped || jsonb_build_array(jsonb_build_object('id', target.id, 'merchant_sku', target.merchant_sku,
        'reason', case when target.listing_id is null then 'not_linked' else 'not_published' end));
    end if;
  end loop;
  perform set_config('app.allow_listing_admin_fields', coalesce(previous_flag, ''), true);

  result := jsonb_build_object('batch_key', request_batch_key, 'hidden', hidden, 'skipped', skipped);
  insert into laria_private.store_inventory_batch_receipts(store_id, batch_key, operation, request_fingerprint, result, actor_user_id)
  values (owner_store_id, request_batch_key, 'hide', fingerprint, result, caller);
  return result || jsonb_build_object('replayed', false);
end;
$$;

revoke all on function public.get_inventory_summary() from public, anon, authenticated;
revoke all on function public.set_inventory_threshold_bulk(uuid[], integer, text) from public, anon, authenticated;
revoke all on function public.hide_inventory_listings_bulk(uuid[], text) from public, anon, authenticated;
grant execute on function public.get_inventory_summary() to authenticated;
grant execute on function public.set_inventory_threshold_bulk(uuid[], integer, text) to authenticated;
grant execute on function public.hide_inventory_listings_bulk(uuid[], text) to authenticated;
