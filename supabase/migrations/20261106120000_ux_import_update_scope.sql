-- Effortless Laria, batch "stores", fix-04: re-importing an inventory export can no longer undo sales recorded in
-- between (docs/ux-effortless/stores.md).
--
-- Before: the export always filled a Stock column and the import required one, so "export, change prices in Excel,
-- re-import" wrote back the stock counted at export time and reversed every counter sale recorded since, as one
-- import_reconciliation line among hundreds.
--
-- After:
--   * Each import says what the file updates on SKU that already exist (session options.update_scope):
--     'prices' (stock untouched), 'stock' (prices untouched) or 'both'. The stock column is required only when the
--     file updates stock, the price column only when it updates prices alone. New SKU always take the row's values.
--   * The export carries "Exportado el" (an ISO timestamp, mapping field exported_at). When a row's SKU had stock
--     movements after that moment, today's stock is kept by default (info IMPORT_STOCK_KEPT when the cell still holds
--     the export-time count, warning IMPORT_STOCK_STALE when the store edited it). options.stale_stock = 'apply' is the
--     store's explicit choice to use the file's stock anyway (warning IMPORT_STOCK_STALE_APPLIED).
--
-- plan_import_row gains the options argument; its two callers are patched to pass the session's options, so preview
-- and commit still plan with the same rules. Nothing else changes. Additive: no table or column is added.

create function pg_temp.review_fix(p_function regprocedure, variadic p_edits text[])
returns void
language plpgsql
as $$
declare
  definition text := pg_get_functiondef(p_function);
  edit integer;
begin
  if cardinality(p_edits) % 2 <> 0 then
    raise exception 'review_fix(%): edits come in old/new pairs', p_function;
  end if;
  for edit in 1 .. cardinality(p_edits) by 2 loop
    if (length(definition) - length(replace(definition, p_edits[edit], ''))) / length(p_edits[edit]) <> 1 then
      raise exception 'review_fix(%): expected exactly one occurrence of %', p_function, p_edits[edit];
    end if;
    definition := replace(definition, p_edits[edit], p_edits[edit + 1]);
  end loop;
  execute definition;
end;
$$;

-- ------------------------------------------------------------------ the export timestamp

-- The row's "Exportado el" value, when it is a UTC ISO timestamp no later than now (a Laria export writes
-- 2026-10-19T14:05:00Z). Anything else is no timestamp: the row is then planned as before.
create or replace function laria_private.import_exported_at(p_parsed jsonb)
returns timestamptz
language plpgsql
stable
as $$
declare raw text := laria_private.import_text(p_parsed, 'exported_at'); value timestamptz;
begin
  if raw is null or raw !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,6})?)?Z$' then
    return null;
  end if;
  begin
    value := raw::timestamptz;
  exception when others then
    return null;
  end;
  return case when value <= now() + interval '5 minutes' then value end;
end;
$$;

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
                       'external_reference', 'photos', 'listing_id', 'exported_at')
         or entry.key ~ '^attribute:[a-z][a-z0-9_]{0,39}$')
        and jsonb_typeof(entry.value) = 'number'
        and (entry.value #>> '{}') ~ '^[0-9]{1,2}$'
        and (entry.value #>> '{}')::integer < p_column_count))
    and (select count(*) from jsonb_each(p_mapping)) = (select count(distinct entry.value) from jsonb_each(p_mapping) entry)
    and (select count(*) from jsonb_each(p_mapping)) <= 80;
$$;

-- ------------------------------------------------------------------ planning with the session's options

-- Plans one row against the store's current inventory. Used at preview time and again at commit time on locked rows,
-- so "what the merchant saw" and "what is applied" come from the same rules. Never writes.
-- fix-04: p_options is the session's options. update_scope ('prices' | 'stock' | 'both') says what the file updates on
-- SKU that already exist; stale_stock ('keep' | 'apply') says what to do with a stock cell from a Laria export when
-- stock moved after the export (sales, adjustments). New SKU always take the row's stock and price.
--   create         new SKU (generated when the cell is blank)
--   update         existing SKU, or the SKU already linked to the listing id in the row
--   adopt_listing  a row with a listing id whose listing has no SKU yet: creates the SKU, or links the existing one
--   unchanged      nothing in the row differs from the current values
--   error          the row cannot be applied as it is
create or replace function laria_private.plan_import_row(
  p_store_id uuid,
  p_parsed jsonb,
  p_issues jsonb,
  p_options jsonb,
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
  scope text := coalesce(p_options->>'update_scope', 'both');
  stale_mode text := coalesce(p_options->>'stale_stock', 'keep');
  exported_at timestamptz := laria_private.import_exported_at(p_parsed);
  moves_since integer;
  qty_at_export integer;
  stock_skipped boolean := false;
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
    if scope = 'stock' then
      issues := issues || jsonb_build_object('code', 'IMPORT_PRICE_IGNORED', 'field', 'unit_price_pen', 'severity', 'info',
        'message', 'Precio sin cambiar: este archivo solo actualiza stock.');
    else
      changes := changes || jsonb_build_object('unit_price_pen', jsonb_build_object('from', target.unit_price_pen, 'to', chosen_price));
    end if;
  end if;
  if quantity is not null and scope = 'prices' then
    if quantity <> target.quantity_on_hand then
      issues := issues || jsonb_build_object('code', 'IMPORT_STOCK_IGNORED', 'field', 'quantity', 'severity', 'info',
        'message', 'Stock sin cambiar: este archivo solo actualiza precios. Hoy hay ' || target.quantity_on_hand || '.');
    end if;
    stock_skipped := true;
  elsif quantity is not null and exported_at is not null then
    -- A stock cell from a Laria export is the count at export time. Movements recorded since (a counter sale, an
    -- adjustment, another import) would be undone by writing it back, so today's stock is kept unless the store chose
    -- the file's stock. The count at export time is the stock before the first of those movements.
    select count(*), (array_agg(m.on_hand_before order by m.created_at, m.id))[1]
    into moves_since, qty_at_export
    from public.store_stock_movements m
    where m.item_id = target.id and m.created_at > exported_at;
    if moves_since = 0 or quantity = target.quantity_on_hand then
      null; -- nothing moved since the export, or the file already holds today's stock
    elsif stale_mode = 'keep' then
      if quantity = qty_at_export then
        issues := issues || jsonb_build_object('code', 'IMPORT_STOCK_KEPT', 'field', 'quantity', 'severity', 'info',
          'group', 'stock_since_export',
          'message', 'Desde que exportaste el archivo hubo ' || moves_since
            || case when moves_since = 1 then ' movimiento' else ' movimientos' end
            || ' de stock (ventas o ajustes). Se mantiene el stock de hoy: ' || target.quantity_on_hand || '.');
      else
        issues := issues || jsonb_build_object('code', 'IMPORT_STOCK_STALE', 'field', 'quantity', 'severity', 'warning',
          'group', 'stock_since_export',
          'message', 'En el archivo el stock pasa de ' || qty_at_export || ' a ' || quantity
            || ', pero desde que lo exportaste hubo ' || moves_since
            || case when moves_since = 1 then ' movimiento' else ' movimientos' end
            || ' (ventas o ajustes) y hoy hay ' || target.quantity_on_hand
            || '. Se mantiene el stock de hoy; si volviste a contar, usa el stock del archivo.');
      end if;
      stock_skipped := true;
    else
      issues := issues || jsonb_build_object('code', 'IMPORT_STOCK_STALE_APPLIED', 'field', 'quantity', 'severity', 'warning',
        'group', 'stock_since_export',
        'message', 'Reemplaza el stock de hoy (' || target.quantity_on_hand || ') por el del archivo (' || quantity
          || '), aunque hubo ' || moves_since
          || case when moves_since = 1 then ' movimiento' else ' movimientos' end || ' después de exportarlo.');
    end if;
  end if;
  if quantity is not null and not stock_skipped and quantity <> target.quantity_on_hand then
    changes := changes || jsonb_build_object('quantity_on_hand', jsonb_build_object('from', target.quantity_on_hand, 'to', quantity));
  end if;
  if planned_action = 'adopt_listing' then
    changes := changes || jsonb_build_object('listing_id', jsonb_build_object('from', null, 'to', listing.id));
  end if;
  if planned_action = 'update' and changes = '{}'::jsonb then
    planned_action := 'unchanged';
  end if;
  if quantity is null and target.id is not null and scope <> 'prices' then
    issues := issues || jsonb_build_object('code', 'IMPORT_STOCK_BLANK', 'field', 'quantity', 'severity', 'info',
      'message', 'Stock vacío: no se cambia.');
  end if;
end;
$$;


select pg_temp.review_fix('public.plan_store_import_rows(uuid,uuid,jsonb)',
  'laria_private.plan_import_row(session.store_id, parsed, issues)',
  'laria_private.plan_import_row(session.store_id, parsed, issues, session.options)');

select pg_temp.review_fix('laria_private.commit_import_row(public.store_import_sessions,public.store_import_rows,uuid)',
  'laria_private.plan_import_row(p_session.store_id, p_row.parsed, ''[]''::jsonb)',
  'laria_private.plan_import_row(p_session.store_id, p_row.parsed, ''[]''::jsonb, p_session.options)');

drop function laria_private.plan_import_row(uuid, jsonb, jsonb);

-- ------------------------------------------------------------------ the mapping step asks what the file updates

drop function public.confirm_store_import_mapping(uuid, jsonb, integer, boolean);

create function public.confirm_store_import_mapping(
  p_session_id uuid, p_mapping jsonb, p_expected_version integer, p_save_as_default boolean default false,
  p_update_scope text default null, p_stale_stock text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session public.store_import_sessions;
  header_count integer;
  default_mapping jsonb;
  -- An older client sends no scope: it keeps STORE-2's behavior (the file updates everything it holds).
  scope text := coalesce(p_update_scope, 'both');
  stale text := coalesce(p_stale_stock, 'keep');
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
  -- Review fix A11: replanning would turn applied rows back into pending ones; their inventory changes are done.
  if exists (select 1 from public.store_import_rows where session_id = session.id and commit_status = 'applied') then
    perform laria_private.raise_import_error('IMPORT_MAPPING_LOCKED',
      'Algunas filas ya se aplicaron al inventario, así que las columnas ya no se pueden cambiar. Para otro orden de columnas, empieza una importación nueva.');
  end if;
  header_count := jsonb_array_length(session.headers);
  if p_mapping is null or not laria_private.import_mapping_is_valid(p_mapping, header_count) then
    perform laria_private.raise_import_error('IMPORT_MAPPING_INVALID', 'Revisa las columnas elegidas: cada columna se usa una sola vez.');
  end if;
  if scope not in ('prices', 'stock', 'both') or stale not in ('keep', 'apply') then
    perform laria_private.raise_import_error('IMPORT_SCOPE_INVALID', 'Elige qué actualiza este archivo.');
  end if;
  if scope in ('stock', 'both') and not (p_mapping ? 'quantity') then
    perform laria_private.raise_import_error('IMPORT_MAPPING_STOCK_REQUIRED', 'Elige la columna de stock.');
  end if;
  if scope = 'prices' and not (p_mapping ? 'unit_price_pen') then
    perform laria_private.raise_import_error('IMPORT_MAPPING_PRICE_REQUIRED', 'Elige la columna de precio.');
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
      options = options || jsonb_build_object('update_scope', scope, 'stale_stock', stale),
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

-- ------------------------------------------------------------------ counts

-- STORE-2's counts plus since_export (rows whose stock moved after the export, kept or applied) and since_export_kept
-- (those where today's stock is kept).
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
    'since_export', count(*) filter (where planned_action <> 'error' and issues @> '[{"group":"stock_since_export"}]'),
    'since_export_kept', count(*) filter (where planned_action <> 'error'
                           and (issues @> '[{"code":"IMPORT_STOCK_KEPT"}]' or issues @> '[{"code":"IMPORT_STOCK_STALE"}]')),
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

drop function pg_temp.review_fix(regprocedure, text[]);

-- ------------------------------------------------------------------ privileges

revoke all on function public.confirm_store_import_mapping(uuid, jsonb, integer, boolean, text, text) from public, anon, authenticated;
grant execute on function public.confirm_store_import_mapping(uuid, jsonb, integer, boolean, text, text) to authenticated;
revoke all on function laria_private.import_exported_at(jsonb) from public, anon, authenticated;
revoke all on function laria_private.plan_import_row(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function laria_private.import_mapping_is_valid(jsonb, integer) from public, anon, authenticated;
revoke all on function laria_private.refresh_import_counts(uuid) from public, anon, authenticated;
