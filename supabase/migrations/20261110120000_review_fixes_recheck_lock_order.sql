-- Codex re-check of the review fixes, R1 and R2 (docs/store-operations/review-fixes.md, section C).
--
-- R1. Import publication locked each unlinked SKU when it reached that SKU's row, so a chunk took its SKUs in
--     spreadsheet-row order, while every bulk path (lock_inventory_items, commit_store_import_chunk) takes them in id
--     order. Rows [higher id, lower id] against a bulk stock update of both SKUs could deadlock (40P01). Publication now
--     locks every unlinked candidate SKU in id order before its first row, as the import commit does. A linked SKU is
--     still refused without waiting for it: its listing comes first in the shared order, and publication never needs
--     it. A SKU unlinked after those locks is taken only if it is free; otherwise the chunk ends with
--     INVENTORY_CONCURRENT_CHANGE (40001), which the server retries once with the same rows.
-- R2. The import photo guard locks a photo's asset row as that photo row is inserted, so two attachments of
--     overlapping photo sets in opposite orders ([A, B] and [B, A]) could deadlock. Every path that attaches photos now
--     locks the whole set's assets in asset-id order first: replace_listing_photos (direct edits and the promotion of
--     an approved revision), revision proposals in apply_owned_listing_edit, insert_store_listing (the publish form
--     and import publication) and, for every row of a chunk at once, publish_store_import_rows. The guard's own lock
--     then finds the asset already held, and its checks are unchanged. Asset locks still come after any listing and
--     SKU lock in each path.
--
-- Like 20261029120100, the long functions are patched from their current definitions with exact old -> new
-- replacements, each of which must match exactly once. tests/store-ops-review-fixes.sql checks the result; the races
-- are in tests/store-ops-concurrency.integration.cjs.

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

-- ------------------------------------------------------------------ R2: one order for import photo locks

-- Locks the asset rows of the import photos in a photo list (the p_photos shape: [{"image_url": ...}, ...]) in id
-- order, in the mode the guard uses. Other URLs, and anything that is not a list, are left to the callers' checks.
create function laria_private.lock_import_photo_assets(p_photos jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if jsonb_typeof(p_photos) is distinct from 'array' then return; end if;
  perform 1 from public.store_import_photo_assets a
  where a.id in (
    select (regexp_match(photo->>'image_url',
      '^/api/listing-images/[0-9a-f-]{36}/import-photos/[0-9a-f-]{36}/'
      || '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[.](jpg|png|webp)$'))[1]::uuid
    from jsonb_array_elements(p_photos) photo)
  order by a.id
  for no key update;
end;
$$;

revoke all on function laria_private.lock_import_photo_assets(jsonb) from public, anon, authenticated;

select pg_temp.review_fix('public.replace_listing_photos(uuid,jsonb)',
  E'  delete from public.listing_photos where listing_id = p_listing_id;\n',
  E'  -- The whole set''s import photos, in asset-id order, before the guard locks them row by row (Codex re-check R2).\n'
  || E'  perform laria_private.lock_import_photo_assets(p_photos);\n'
  || E'  delete from public.listing_photos where listing_id = p_listing_id;\n');

select pg_temp.review_fix('public.apply_owned_listing_edit(uuid,jsonb,jsonb,jsonb)',
  E'  if p_photos is not null then\n    delete from public.listing_revision_photos where revision_id = target_revision_id;\n',
  E'  if p_photos is not null then\n'
  || E'    -- The whole set''s import photos, in asset-id order, before the guard locks them row by row (Codex re-check R2).\n'
  || E'    perform laria_private.lock_import_photo_assets(p_photos);\n'
  || E'    delete from public.listing_revision_photos where revision_id = target_revision_id;\n');

select pg_temp.review_fix('laria_private.insert_store_listing(uuid,public.stores,jsonb,jsonb)',
  E'  if inserted_id is not null then\n    insert into public.listing_photos (listing_id, image_url, alt_text, sort_order)\n',
  E'  if inserted_id is not null then\n'
  || E'    -- The whole set''s import photos, in asset-id order, before the guard locks them row by row (Codex re-check R2).\n'
  || E'    perform laria_private.lock_import_photo_assets(p_photos);\n'
  || E'    insert into public.listing_photos (listing_id, image_url, alt_text, sort_order)\n');

-- ------------------------------------------------------------------ R1 and R2: publication locks before its first row

select pg_temp.review_fix('public.publish_store_import_rows(uuid,uuid,jsonb,boolean)',
  E'  remaining := (laria_private.store_listing_quota_json(store_record.id)->>''remaining'')::integer;\n',
  E'  remaining := (laria_private.store_listing_quota_json(store_record.id)->>''remaining'')::integer;\n'
  || E'\n'
  || E'  -- Codex re-check R1 and R2: before the first row, the locks every row needs, in the shared order. First the\n'
  || E'  -- unlinked candidate SKUs in id order, as every bulk path takes them (row by row, a chunk took them in spreadsheet\n'
  || E'  -- order and could deadlock with a bulk update). A linked SKU is refused below without waiting for it. Then the\n'
  || E'  -- rows'' photos in asset-id order, so two attachments of overlapping sets never take them in opposite orders.\n'
  || E'  perform 1 from public.store_inventory_items i\n'
  || E'  where i.id in (select r.applied_item_id from public.store_import_rows r\n'
  || E'                 where r.session_id = session.id\n'
  || E'                   and r.row_number in (select (value->>''row_number'')::integer from jsonb_array_elements(p_rows)))\n'
  || E'    and i.listing_id is null\n'
  || E'  order by i.id\n'
  || E'  for update;\n'
  || E'  perform 1 from public.store_import_photo_assets a\n'
  || E'  where a.id in (select x.asset_id from public.store_import_photo_assignments x\n'
  || E'                 where x.session_id = session.id\n'
  || E'                   and x.row_number in (select (value->>''row_number'')::integer from jsonb_array_elements(p_rows)))\n'
  || E'  order by a.id\n'
  || E'  for no key update;\n',
  E'    if item.id is not null and item.listing_id is null then\n'
  || E'      select * into item from public.store_inventory_items i where i.id = staged.applied_item_id for update;\n'
  || E'    end if;\n',
  E'    if item.id is not null and item.listing_id is null then\n'
  || E'      -- Already held since the locks above, unless it was unlinked after them: then only if it is free, never by\n'
  || E'      -- waiting out of order (Codex re-check R1).\n'
  || E'      begin\n'
  || E'        select * into item from public.store_inventory_items i where i.id = staged.applied_item_id for update nowait;\n'
  || E'      exception when lock_not_available then\n'
  || E'        raise exception using errcode = ''40001'',\n'
  || E'          message = ''INVENTORY_CONCURRENT_CHANGE: Un SKU cambió mientras se publicaba. Intenta de nuevo.'';\n'
  || E'      end;\n'
  || E'    end if;\n');

drop function pg_temp.review_fix(regprocedure, text[]);
