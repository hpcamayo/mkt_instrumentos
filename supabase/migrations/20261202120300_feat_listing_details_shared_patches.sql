-- Feature ideas, batch listing-details: small edits to functions other migrations own, made as find-and-replace on
-- each function's current definition so whatever earlier migrations added stays. Each edit must match exactly once,
-- or the migration stops. Functions touched (named in the PR for the integrator's diff):
--
--   laria_private.normalize_saved_search(jsonb)         conditions on the new scale (old values expanded, as the
--                                                       saved alerts were in 20261202120000); a new "options" key
--                                                       (registered listing flags); STABLE now, as it reads the
--                                                       flag registry.
--   laria_private.listing_matches_saved_search(...)     "options": the listing has every flag asked for.
--   laria_private.record_marketplace_event_service(...) a search event's filters may carry "options".
--   laria_private.sanitize_listing_details(jsonb)       a SKU's remembered condition on the new scale.
--   public.set_store_import_row_publish_fields(...)     an import row's condition on the new scale.
--   public.copy_owned_listing(uuid, text)               "Duplicar" and "Republicar" carry the listing details.
--
-- public.catalog_facets is rebuilt whole, alone, in 20261202120400.

create function pg_temp.listing_details_fix(p_function regprocedure, variadic p_edits text[])
returns void
language plpgsql
as $$
declare
  definition text := pg_get_functiondef(p_function);
  edit integer;
begin
  if cardinality(p_edits) % 2 <> 0 then
    raise exception 'listing_details_fix(%): edits come in old/new pairs', p_function;
  end if;
  for edit in 1 .. cardinality(p_edits) by 2 loop
    if (length(definition) - length(replace(definition, p_edits[edit], ''))) / length(p_edits[edit]) <> 1 then
      raise exception 'listing_details_fix(%): expected exactly one occurrence of %', p_function, p_edits[edit];
    end if;
    definition := replace(definition, p_edits[edit], p_edits[edit + 1]);
  end loop;
  execute definition;
end;
$$;

-- ------------------------------------------------------------------ saved searches

select pg_temp.listing_details_fix('laria_private.normalize_saved_search(jsonb)',
  E' IMMUTABLE\n',
  E' STABLE\n',

  E'''min_price'',''max_price'',''advanced'',''query'')',
  E'''min_price'',''max_price'',''advanced'',''query'',''options'')',

  E'    list_value := laria_private.saved_search_text_values(p_filters->''condition'', 100);\n',
  E'    -- sell-10: an old value stands for its part of the new scale (20261202120000).\n'
  || E'    list_value := laria_private.expand_search_conditions(laria_private.saved_search_text_values(p_filters->''condition'', 100));\n',

  E'      where value not in (''Nuevo'',''Usado - buen estado'',''Usado - con detalles'')\n',
  E'      where not public.listing_condition_is_valid(value, true)\n',

  E'  if p_filters ? ''seller_type'' then\n',
  E'  -- listing-details: the yes/no filters ("Envía a provincia", ...), registered flags only (20261202120100).\n'
  || E'  if p_filters ? ''options'' then\n'
  || E'    if jsonb_typeof(p_filters->''options'') not in (''array'', ''string'')\n'
  || E'      or (jsonb_typeof(p_filters->''options'') = ''array'' and jsonb_array_length(p_filters->''options'') > 20)\n'
  || E'      or exists (\n'
  || E'        select 1 from jsonb_array_elements(case jsonb_typeof(p_filters->''options'') when ''array'' then p_filters->''options''\n'
  || E'          else jsonb_build_array(p_filters->''options'') end) item\n'
  || E'        where jsonb_typeof(item) <> ''string''\n'
  || E'          or not exists (select 1 from laria_private.listing_flag_filters registered where registered.flag = item #>> ''{}'')\n'
  || E'      ) then\n'
  || E'      raise exception ''ALERT_FILTERS_INVALID'';\n'
  || E'    end if;\n'
  || E'    list_value := laria_private.normalize_listing_options(p_filters->''options'');\n'
  || E'    if list_value is not null then result := result || jsonb_build_object(''options'', list_value); end if;\n'
  || E'  end if;\n'
  || E'  if p_filters ? ''seller_type'' then\n');

select pg_temp.listing_details_fix('laria_private.listing_matches_saved_search(public.listings,jsonb)',
  E'    and not exists (\n      select 1 from jsonb_each(coalesce(p_filters->''advanced'', ''{}''::jsonb)) filter\n',
  E'    -- listing-details: every yes/no filter asked for (20261202120100).\n'
  || E'    and (not (p_filters ? ''options'')\n'
  || E'      or coalesce(p_listing.listing_flags, ''{}'') @> array(select jsonb_array_elements_text(p_filters->''options'')))\n'
  || E'    and not exists (\n      select 1 from jsonb_each(coalesce(p_filters->''advanced'', ''{}''::jsonb)) filter\n');

-- ------------------------------------------------------------------ search events

select pg_temp.listing_details_fix('laria_private.record_marketplace_event_service(text,uuid,uuid,uuid,uuid,uuid,text,jsonb,uuid)',
  E'''min_price'',''max_price'',''advanced'',''sort''))',
  E'''min_price'',''max_price'',''advanced'',''sort'',''options''))');

-- ------------------------------------------------------------------ store SKUs and imports

select pg_temp.listing_details_fix('laria_private.sanitize_listing_details(jsonb)',
  E'  select coalesce(jsonb_object_agg(key, value), ''{}''::jsonb)\n',
  E'  select coalesce(jsonb_object_agg(key, case when key = ''condition''\n'
  || E'    then to_jsonb(laria_private.current_condition(value #>> ''{}'')) else value end), ''{}''::jsonb)\n',

  E'     or (key = ''condition'' and (value #>> ''{}'') in (''Nuevo'', ''Usado - buen estado'', ''Usado - con detalles''))\n',
  E'     or (key = ''condition'' and jsonb_typeof(value) = ''string''\n'
  || E'           and public.listing_condition_is_valid(laria_private.current_condition(value #>> ''{}''), true))\n');

select pg_temp.listing_details_fix('public.set_store_import_row_publish_fields(uuid,integer,jsonb)',
  E'    if entry.key = ''description'' then value := btrim(entry.item #>> ''{}''); end if;\n',
  E'    if entry.key = ''description'' then value := btrim(entry.item #>> ''{}''); end if;\n'
  || E'    if entry.key = ''condition'' then value := laria_private.current_condition(value); end if;\n',

  E'       or (entry.key = ''condition'' and value not in (''Nuevo'', ''Usado - buen estado'', ''Usado - con detalles'')) then\n',
  E'       or (entry.key = ''condition'' and not public.listing_condition_is_valid(value, true)) then\n');

-- ------------------------------------------------------------------ copies

select pg_temp.listing_details_fix('public.copy_owned_listing(uuid,text)',
  E'  return copy;\n',
  E'  -- listing-details: the copy keeps the listing''s details (sale terms and other batches'' fields, 20261202120100).\n'
  || E'  perform laria_private.copy_listing_details(original.id, copy.id);\n'
  || E'  select * into copy from public.listings where id = new_id;\n'
  || E'  return copy;\n');

drop function pg_temp.listing_details_fix(regprocedure, text[]);
