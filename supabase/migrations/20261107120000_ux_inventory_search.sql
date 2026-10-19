-- Effortless Laria, inventory batch, fixes (docs/ux-effortless/inventory.md: fix-06 and the fix-09 parts in Inventario).
--
-- get_inventory_page as in 20261030120000_store_review_fixes_ux.sql, with two changes:
--   * fix-06: the search box promises "SKU, marca, modelo o nombre". It now matches the SKU, the name, the variant, the
--     external reference (where stores keep the barcode) and the linked publication's title, brand and model. Words
--     are matched separately and in any order, without accents or case ("boss ds1" finds "BOSS DS-1 Distortion" only
--     if every word appears), so typing narrows the list as the owner types.
--   * fix-09: the "En revisión" tile counts publications waiting for review and publications with changes in review;
--     the new publication filter 'in_review' selects exactly those, so the tile opens what it counts.
-- Nothing else changes: same caller rules, same keyset paging, same grants (create or replace keeps them).

create or replace function laria_private.inventory_search_text(
  p_name text, p_sku text, p_variant text, p_reference text, p_title text, p_brand text, p_model text
)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select public.catalog_fold(concat_ws(' ', p_name, p_sku, p_variant, p_reference, p_title, p_brand, p_model));
$$;

-- True when every word of the search appears in the text (both already folded by catalog_fold).
create or replace function laria_private.inventory_search_matches(p_text text, p_search text)
returns boolean
language sql
immutable
parallel safe
as $$
  select not exists (
    select 1 from regexp_split_to_table(btrim(p_search), '\s+') word
    where word <> '' and position(word in p_text) = 0
  );
$$;

create or replace function public.get_inventory_page(p_filters jsonb default '{}'::jsonb, p_cursor jsonb default null, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_caller_store(false);
  filters jsonb := coalesce(p_filters, '{}'::jsonb);
  page_size integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  sort text := coalesce(nullif(filters->>'sort', ''), 'updated');
  stock text := coalesce(nullif(filters->>'stock', ''), 'all');
  publication text := nullif(filters->>'publication', '');
  catalog text := nullif(filters->>'catalog', '');
  category text := nullif(btrim(coalesce(filters->>'category', '')), '');
  search text := nullif(btrim(coalesce(filters->>'q', '')), '');
  sort_expression text;
  sort_type text;
  descending boolean;
  cursor_value text;
  cursor_id uuid;
  page_rows jsonb;
  has_more boolean;
  last_row jsonb;
begin
  case sort
    when 'updated' then sort_expression := 'i.updated_at'; sort_type := 'timestamptz'; descending := true;
    when 'name' then sort_expression := 'i.product_name'; sort_type := 'text'; descending := false;
    when 'available_asc' then sort_expression := 'i.quantity_available'; sort_type := 'integer'; descending := false;
    when 'available_desc' then sort_expression := 'i.quantity_available'; sort_type := 'integer'; descending := true;
    when 'price_asc' then sort_expression := 'coalesce(i.unit_price_pen, 2147483647)'; sort_type := 'integer'; descending := false;
    when 'price_desc' then sort_expression := 'coalesce(i.unit_price_pen, -1)'; sort_type := 'integer'; descending := true;
    else perform laria_private.raise_inventory_error('INVENTORY_FILTER_INVALID', 'Orden no compatible.');
  end case;
  if stock not in ('all', 'in_stock', 'low', 'out', 'archived')
    or coalesce(publication, 'none') not in ('none', 'pending', 'in_review', 'published', 'hidden', 'rejected', 'changes_pending')
    or coalesce(catalog, 'matched') not in ('matched', 'unmatched')
    or char_length(search) > 100 or char_length(category) > 80 then
    perform laria_private.raise_inventory_error('INVENTORY_FILTER_INVALID', 'Revisa los filtros.');
  end if;
  if p_cursor is not null and p_cursor <> 'null'::jsonb then
    cursor_value := p_cursor->>'value';
    cursor_id := laria_private.inventory_json_uuid(p_cursor, 'id');
    if cursor_id is null or cursor_value is null then
      perform laria_private.raise_inventory_error('INVENTORY_FILTER_INVALID', 'La página solicitada no es válida.');
    end if;
  end if;

  execute format($query$
    with page as (
      select i.*, %1$s as sort_value
      from public.store_inventory_items i
      left join public.listings l on l.id = i.listing_id
      where i.store_id = $1
        and case $2
          when 'archived' then i.inventory_status = 'archived'
          when 'all' then i.inventory_status = 'active'
          else i.inventory_status = 'active'
            and laria_private.inventory_stock_level(i.quantity_available, i.low_stock_threshold) = $2
        end
        and ($3::text is null or case $3
          when 'none' then i.listing_id is null
          when 'pending' then l.status = 'pending'
          when 'in_review' then l.status = 'pending' or exists (
            select 1 from public.listing_revisions r where r.listing_id = i.listing_id and r.status = 'pending')
          when 'published' then l.status = 'approved'
          when 'hidden' then l.status = 'hidden'
          when 'rejected' then l.status = 'rejected'
          when 'changes_pending' then exists (
            select 1 from public.listing_revisions r where r.listing_id = i.listing_id and r.status = 'pending')
        end)
        and ($4::text is null or ($4 = 'matched') = (i.catalog_product_id is not null))
        and ($5::text is null or coalesce(l.category, i.category, 'none') = $5)
        and ($6::text is null or laria_private.inventory_search_matches(
          laria_private.inventory_search_text(i.product_name, i.merchant_sku, i.variant_label, i.external_reference,
            l.title, l.brand, l.model),
          public.catalog_fold($6)))
        and ($8::uuid is null or (%1$s, i.id) %2$s ($7::%3$s, $8))
      order by %1$s %4$s, i.id %4$s
      limit $9 + 1
    )
    select coalesce(jsonb_agg(laria_private.inventory_item_json(
             (select x from public.store_inventory_items x where x.id = page.id))
             || jsonb_build_object('sort_value', page.sort_value)
           order by page.sort_value %4$s, page.id %4$s), '[]'::jsonb)
    from page
  $query$,
    sort_expression,
    case when descending then '<' else '>' end,
    sort_type,
    case when descending then 'desc' else 'asc' end)
  into page_rows
  using owner_store_id, stock, publication, catalog, category, search, cursor_value, cursor_id, page_size;

  has_more := jsonb_array_length(page_rows) > page_size;
  if has_more then
    page_rows := page_rows - page_size;
    last_row := page_rows -> (page_size - 1);
  end if;
  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(element - 'sort_value'), '[]'::jsonb) from jsonb_array_elements(page_rows) element),
    'next_cursor', case when has_more then jsonb_build_object('value', last_row->>'sort_value', 'id', last_row->>'id') end
  );
end;
$$;

revoke all on function laria_private.inventory_search_text(text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function laria_private.inventory_search_matches(text, text) from public, anon, authenticated;
