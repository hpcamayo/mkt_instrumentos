-- Effortless Laria, batch "stores" (docs/ux-effortless/stores.md): stock-10, publish many SKU at once from Inventario.
--
-- Bulk publishing existed only on an import's result page. "Publicar seleccionados" now opens the same publication
-- step for SKU chosen in Inventario: this function stages them as an already-applied import (one row per SKU, nothing
-- to apply, no stock change), so the import's photos, "Completar datos", allowance check and publish_store_import_rows
-- work unchanged. The session is closed from the start (it never blocks a real import) and is marked
-- options.source = 'inventory_selection' so the import history and the error tile can leave it out.
-- Additive: one function.

create or replace function public.create_inventory_publish_selection(p_item_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner_store_id uuid := laria_private.inventory_caller_store(true);
  session public.store_import_sessions;
  new_id uuid := gen_random_uuid();
  picked integer;
begin
  if p_item_ids is null or cardinality(p_item_ids) not between 1 and 200
    or array_position(p_item_ids, null) is not null
    or (select count(distinct id) from unnest(p_item_ids) id) <> cardinality(p_item_ids) then
    perform laria_private.raise_inventory_error('INVENTORY_BULK_INVALID', 'Elige entre 1 y 200 SKU distintos.');
  end if;
  if (select count(*) from public.store_inventory_items i
      where i.id = any(p_item_ids) and i.store_id = owner_store_id) <> cardinality(p_item_ids) then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_NOT_OWNED', 'No puedes administrar uno de estos SKU.');
  end if;
  select count(*) into picked from public.store_inventory_items i
  where i.id = any(p_item_ids) and i.inventory_status = 'active' and i.listing_id is null;
  if picked = 0 then
    perform laria_private.raise_inventory_error('INVENTORY_PUBLISH_NONE',
      'Los SKU elegidos ya tienen publicación o están archivados.');
  end if;

  insert into public.store_import_sessions (
    id, store_id, created_by, status, file_format, file_name, file_path, file_bytes, headers, header_row,
    column_mapping, mapping_confirmed_at, row_count, parse_cursor, counts, options, result_summary,
    commit_started_at, committed_at, closed_at
  ) values (
    new_id, owner_store_id, caller, 'committed', 'csv',
    'Publicar seleccionados (' || picked || ' SKU)', caller::text || '/' || new_id::text || '/source.csv', 1,
    '["SKU","Nombre","Variante","Categoría","Precio (PEN)"]'::jsonb, 1,
    '{"sku":0,"product_name":1,"variant_label":2,"category":3,"unit_price_pen":4}'::jsonb, now(), picked, picked + 1,
    jsonb_build_object('total', picked, 'applied', picked), jsonb_build_object('source', 'inventory_selection'),
    jsonb_build_object('applied', 0), now(), now(), now()
  ) returning * into session;

  -- Rows in the order Inventario lists SKU (by SKU), numbered from 2 as if under a header row.
  insert into public.store_import_rows (
    session_id, row_number, store_id, raw, parsed, sku_normalized, planned_action, changes, owner_decision,
    commit_status, applied_item_id, applied_at, photo_state, photo_count
  )
  select session.id, (row_number() over (order by i.sku_normalized, i.id) + 1)::integer, owner_store_id,
    jsonb_build_array(jsonb_build_object('v', i.merchant_sku), jsonb_build_object('v', i.product_name),
      jsonb_build_object('v', coalesce(i.variant_label, '')), jsonb_build_object('v', coalesce(i.category, '')),
      jsonb_build_object('v', coalesce(i.unit_price_pen::text, ''))),
    jsonb_strip_nulls(jsonb_build_object('sku', i.merchant_sku, 'product_name', i.product_name, 'variant_label', i.variant_label,
      'category', i.category, 'unit_price_pen', i.unit_price_pen)),
    i.sku_normalized, 'unchanged', '{}'::jsonb, 'include', 'applied', i.id, now(), 'none', 0
  from public.store_inventory_items i
  where i.id = any(p_item_ids) and i.inventory_status = 'active' and i.listing_id is null;

  perform laria_private.refresh_import_photo_states(session.id);
  perform laria_private.refresh_import_publish_counts(session.id);
  select * into session from public.store_import_sessions where id = session.id;
  return laria_private.import_session_json(session);
end;
$$;

revoke all on function public.create_inventory_publish_selection(uuid[]) from public, anon, authenticated;
grant execute on function public.create_inventory_publish_selection(uuid[]) to authenticated;
