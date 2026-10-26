-- Feature ideas, discovery batch (docs/feature-ideas/discovery.md), disc-04: the eleventh category, Andinos y
-- tradicionales (andean), with one type, andean_instrument, and its attribute andean_type. lib/listing-submission.ts and
-- lib/instrument-filters.ts mirror it.
--
-- Shared function rule (docs/feature-ideas/build-plan.md, rule 7): this file patches one function (owned by
-- listing-details) in place instead of replacing it, so it keeps every other batch's changes.

-- Saved searches: the category list and the attribute keys gain the new values. Other batches redefine this function
-- for their own filters, so instead of a full copy this patches whatever definition is current when it runs, and
-- refuses to run if the two lists it extends are no longer where they were.
do $$
declare
  current_definition text := pg_catalog.pg_get_functiondef('laria_private.normalize_saved_search(jsonb)'::regprocedure);
  patched text := current_definition;
  category_list constant text := $list$'microphones','audio') then raise exception 'ALERT_FILTERS_INVALID'$list$;
  advanced_list constant text := 'allowed_advanced constant text[] := array[';
begin
  if position(category_list in patched) = 0 or position(advanced_list in patched) = 0 then
    raise exception 'normalize_saved_search: the category or attribute list moved; update 20261207120000_feat_discovery.sql';
  end if;
  if position($list$'audio','andean')$list$ in patched) = 0 then
    patched := replace(patched, category_list, $list$'microphones','audio','andean') then raise exception 'ALERT_FILTERS_INVALID'$list$);
  end if;
  if position($list$'andean_type'$list$ in patched) = 0 then
    patched := replace(patched, advanced_list, advanced_list || $list$'andean_type',$list$);
  end if;
  if patched <> current_definition then
    execute patched;
  end if;
end $$;
