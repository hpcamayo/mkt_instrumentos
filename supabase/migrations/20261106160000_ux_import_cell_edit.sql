-- Effortless Laria, batch "stores" (docs/ux-effortless/stores.md): stock-12, fix import errors on the page.
--
-- The review used to say "correct the file and upload it again". Now the owner can correct a mapped cell of a row in
-- the review itself: the cell's text replaces the file's value in the staged row, and the row is planned again by the
-- same step loop as after a column change (the session goes back to validating). Rows flagged as duplicates are
-- planned again too, because fixing one SKU can end the duplicate for its twin. Applied rows are never touched.
-- Additive: one function.

create or replace function public.edit_store_import_cell(
  p_session_id uuid, p_row_number integer, p_field text, p_value text, p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session public.store_import_sessions;
  target public.store_import_rows;
  column_index integer;
  cells jsonb;
  clean_value text := btrim(coalesce(p_value, ''));
begin
  session := laria_private.import_session_for_owner(p_session_id, true);
  if session.status <> 'ready' then
    perform laria_private.raise_import_error('IMPORT_STATE_INVALID', 'La revisión ya no se puede cambiar.');
  end if;
  if p_expected_version is null or p_expected_version <> session.version then
    perform laria_private.raise_import_error('IMPORT_VERSION_CONFLICT', 'La importación cambió. Vuelve a cargar la página.',
      jsonb_build_object('current_version', session.version));
  end if;
  if p_field is null or not (coalesce(session.column_mapping, '{}'::jsonb) ? p_field)
    or jsonb_typeof(session.column_mapping->p_field) <> 'number' then
    perform laria_private.raise_import_error('IMPORT_CELL_INVALID', 'Esa columna no se importa en este archivo.');
  end if;
  if char_length(clean_value) > 2000 then
    perform laria_private.raise_import_error('IMPORT_CELL_INVALID', 'El valor es demasiado largo.');
  end if;
  select * into target from public.store_import_rows r
  where r.session_id = session.id and r.row_number = p_row_number for update;
  if target.session_id is null then
    perform laria_private.raise_import_error('IMPORT_ROWS_INVALID', 'No encontramos esa fila.');
  end if;
  if target.commit_status = 'applied' then
    perform laria_private.raise_import_error('IMPORT_ROW_APPLIED', 'Esta fila ya se aplicó al inventario.');
  end if;

  column_index := (session.column_mapping->>p_field)::integer;
  cells := coalesce(target.raw, '[]'::jsonb);
  while jsonb_array_length(cells) <= column_index loop
    cells := cells || jsonb_build_array(jsonb_build_object('v', ''));
  end loop;
  -- Typed text: no Excel kind, formula or truncation marks carried over from the file's cell.
  cells := jsonb_set(cells, array[column_index::text], jsonb_build_object('v', clean_value));

  update public.store_import_rows
  set raw = cells
  where session_id = session.id and row_number = target.row_number;
  update public.store_import_rows r
  set parsed = null, issues = '[]'::jsonb, sku_normalized = null, planned_action = null, changes = null,
      target_item_id = null, target_item_version = null, target_listing_id = null, payload_fingerprint = null,
      owner_decision = 'include', commit_status = 'pending', commit_message = null
  where r.session_id = session.id and r.commit_status <> 'applied'
    and (r.row_number = target.row_number or r.issues @> '[{"code":"IMPORT_DUPLICATE_SKU"}]'::jsonb);

  update public.store_import_sessions
  set status = 'validating', lock_token = null, locked_until = null, version = version + 1
  where id = session.id returning * into session;
  perform laria_private.refresh_import_counts(session.id);
  select * into session from public.store_import_sessions where id = session.id;
  return laria_private.import_session_json(session);
end;
$$;

revoke all on function public.edit_store_import_cell(uuid, integer, text, text, integer) from public, anon, authenticated;
grant execute on function public.edit_store_import_cell(uuid, integer, text, text, integer) to authenticated;
