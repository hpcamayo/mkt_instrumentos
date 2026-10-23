-- Store Operations review fixes, store screens (docs/store-operations/review-fixes.md, section B). Henri's walkthrough
-- of the combined prototype asked for three things the screens could not do with the data they had:
--   B7  the "Para publicar falta…" hint on rows that only update a SKU that already has a publication;
--   B4  category chips in Inventario, where a SKU without a publication had no category at all;
--   B5  "Completar datos" on the import result, so a row missing publication data can be completed in place.
-- Everything here is additive: no existing function that takes a lock or writes stock is replaced. The one replaced
-- function, get_inventory_page, is read-only; only its category filter changes.

-- ------------------------------------------------------------------ B7: the publication hint on linked SKUs

-- The import page adds the info issue IMPORT_PUBLICATION_MISSING when a row lacks price, condition, category or a long
-- enough description (lib/store-import/rows.ts). That only matters for a SKU that can still be published from the
-- import. A row that updates (or leaves unchanged) a SKU already linked to a publication, or that links one through
-- the ID de publicación column, has nothing to publish, so planning drops the hint there. The review's
-- "N SKU necesitan más datos" count reads the same issues, so it follows.
create or replace function laria_private.import_row_drop_linked_publication_hint()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.planned_action in ('update', 'unchanged', 'adopt_listing')
     and (new.target_listing_id is not null
          or exists (select 1 from public.store_inventory_items i
                     where i.id = new.target_item_id and i.store_id = new.store_id and i.listing_id is not null)) then
    new.issues := coalesce((
      select jsonb_agg(issue order by position)
      from jsonb_array_elements(new.issues) with ordinality as entries(issue, position)
      where issue->>'code' is distinct from 'IMPORT_PUBLICATION_MISSING'), '[]'::jsonb);
  end if;
  return new;
end;
$$;

create trigger store_import_rows_drop_linked_publication_hint
before update of issues, planned_action, target_item_id, target_listing_id on public.store_import_rows
for each row
when (new.issues @> '[{"code":"IMPORT_PUBLICATION_MISSING"}]'::jsonb)
execute function laria_private.import_row_drop_linked_publication_hint();

-- ------------------------------------------------------------------ B4: a category for every SKU

-- The category a SKU belongs to in Inventario: its publication's category when it has one (that is what buyers see),
-- otherwise this column. Imports fill it from the file's Categoría column when a row is applied, so a large import
-- can be browsed by category before anything is published. It is descriptive only: no rule, stock or publication
-- reads it.
alter table public.store_inventory_items
  add column category text check (category is null or public.listing_taxonomy_is_valid(category, 'other'));

-- When an import row is applied, its SKU takes the row's category (the file is the latest word, like name and price).
-- The commit already holds the SKU's row lock, and the column is not a key, so this adds no lock and no foreign-key
-- check. Rows without a recognized category leave the SKU's category as it was.
create or replace function laria_private.import_row_record_item_category()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.store_inventory_items
  set category = new.parsed->>'category'
  where id = new.applied_item_id
    and store_id = new.store_id
    and category is distinct from new.parsed->>'category';
  return null;
end;
$$;

create trigger store_import_rows_record_item_category
after update of commit_status on public.store_import_rows
for each row
when (new.commit_status = 'applied' and old.commit_status is distinct from 'applied' and new.applied_item_id is not null
      and public.listing_taxonomy_is_valid(new.parsed->>'category', 'other'))
execute function laria_private.import_row_record_item_category();

-- Imports applied before this migration (local and prototype databases only; production has none).
update public.store_inventory_items i
set category = latest.category
from (
  select distinct on (r.applied_item_id) r.applied_item_id, r.parsed->>'category' as category
  from public.store_import_rows r
  where r.commit_status = 'applied' and r.applied_item_id is not null
    and public.listing_taxonomy_is_valid(r.parsed->>'category', 'other')
  order by r.applied_item_id, r.applied_at desc
) latest
where latest.applied_item_id = i.id and i.category is null;

-- The chips above the inventory table: how many active SKUs each category has (publication category first, then the
-- SKU's own), plus "none" for SKUs with neither. Same caller rules as get_inventory_page.
create or replace function public.get_inventory_category_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_caller_store(false);
  result jsonb;
begin
  select coalesce(jsonb_object_agg(category, total), '{}'::jsonb) into result
  from (
    select coalesce(l.category, i.category, 'none') as category, count(*) as total
    from public.store_inventory_items i
    left join public.listings l on l.id = i.listing_id
    where i.store_id = owner_store_id and i.inventory_status = 'active'
    group by 1
  ) counts;
  return result;
end;
$$;

-- get_inventory_page as in 20261023120000_store_inventory_foundation.sql, with one change: the category filter matches
-- the SKU's category in Inventario (its publication's, else its own) instead of the publication's only, and "none"
-- selects SKUs with neither.
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
    or coalesce(publication, 'none') not in ('none', 'pending', 'published', 'hidden', 'rejected', 'changes_pending')
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
          when 'published' then l.status = 'approved'
          when 'hidden' then l.status = 'hidden'
          when 'rejected' then l.status = 'rejected'
          when 'changes_pending' then exists (
            select 1 from public.listing_revisions r where r.listing_id = i.listing_id and r.status = 'pending')
        end)
        and ($4::text is null or ($4 = 'matched') = (i.catalog_product_id is not null))
        and ($5::text is null or coalesce(l.category, i.category, 'none') = $5)
        and ($6::text is null or lower(i.product_name || ' ' || i.merchant_sku)
             like '%%' || replace(replace(replace(lower($6), '\', '\\'), '%%', '\%%'), '_', '\_') || '%%')
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

-- ------------------------------------------------------------------ B5: completing a row on the import result

-- Publication data the owner typed on the result page for one applied row ("Completar datos"). The publish route
-- reads the row's cells with the confirmed columns and lays these values over them, then validates the result with
-- the publish form's rules (lib/store-import/publication.ts), as it does for the file's own values. Keys: brand,
-- model, category, instrument_type, condition, description. Price lives on the SKU and photos on the row; neither is
-- stored here.
alter table public.store_import_rows
  add column publish_fields jsonb check (publish_fields is null
    or (jsonb_typeof(publish_fields) = 'object' and octet_length(publish_fields::text) <= 16384));

-- The owner saves some of those fields for one applied, unpublished row of their own committed import. A field sent
-- as an empty string or null is cleared. Values are checked here for shape (known keys, text, lengths, a Laria
-- category and condition); whether the row is complete is decided when it is published. Locks the session before
-- the row, the same order as publish_store_import_rows, and touches nothing else.
create or replace function public.set_store_import_row_publish_fields(p_session_id uuid, p_row_number integer, p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session public.store_import_sessions;
  staged public.store_import_rows;
  limits constant jsonb := '{"brand":80,"model":80,"category":80,"instrument_type":80,"condition":60,"description":2000}';
  entry record;
  value text;
  fields jsonb;
begin
  if auth.uid() is null then
    perform laria_private.raise_import_error('IMPORT_SESSION_NOT_FOUND', 'No encontramos esta importación.');
  end if;
  select * into session from public.store_import_sessions where id = p_session_id for share;
  if not found or session.created_by is distinct from auth.uid() then
    perform laria_private.raise_import_error('IMPORT_SESSION_NOT_FOUND', 'No encontramos esta importación.');
  end if;
  perform laria_private.require_inventory_write(session.store_id, auth.uid());
  if session.status not in ('committed', 'partially_committed') or session.rows_purged_at is not null then
    perform laria_private.raise_import_error('IMPORT_PUBLISH_CLOSED',
      case when session.status in ('committed', 'partially_committed')
        then 'Esta importación ya no se puede publicar. Publica desde Inventario.'
        else 'Primero confirma la importación; luego podrás publicar.' end);
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' or p_fields = '{}'::jsonb
     or exists (select 1 from jsonb_object_keys(p_fields) key where not limits ? key) then
    perform laria_private.raise_import_error('IMPORT_FIELDS_INVALID', 'Revisa los datos ingresados.');
  end if;

  select * into staged from public.store_import_rows
  where session_id = session.id and row_number = p_row_number
  for update;
  if not found or staged.commit_status <> 'applied' then
    perform laria_private.raise_import_error('IMPORT_ROW_NOT_FOUND', 'Esa fila no se aplicó al inventario.');
  end if;
  if staged.publish_status = 'published' then
    perform laria_private.raise_import_error('IMPORT_ROW_PUBLISHED', 'Esta fila ya se publicó. Edita la publicación desde Inventario.');
  end if;

  fields := coalesce(staged.publish_fields, '{}'::jsonb);
  for entry in select key, item from jsonb_each(p_fields) as pairs(key, item) loop
    if jsonb_typeof(entry.item) = 'null' then
      fields := fields - entry.key;
      continue;
    end if;
    if jsonb_typeof(entry.item) <> 'string' then
      perform laria_private.raise_import_error('IMPORT_FIELDS_INVALID', 'Revisa los datos ingresados.');
    end if;
    value := btrim(regexp_replace(entry.item #>> '{}', '\s+', ' ', 'g'));
    if entry.key = 'description' then value := btrim(entry.item #>> '{}'); end if;
    if value = '' then
      fields := fields - entry.key;
      continue;
    end if;
    if char_length(value) > (limits->>entry.key)::integer
       or (entry.key = 'category' and not public.listing_taxonomy_is_valid(value, 'other'))
       or (entry.key = 'condition' and value not in ('Nuevo', 'Usado - buen estado', 'Usado - con detalles')) then
      perform laria_private.raise_import_error('IMPORT_FIELDS_INVALID', 'Revisa los datos ingresados.', jsonb_build_object('field', entry.key));
    end if;
    fields := fields || jsonb_build_object(entry.key, value);
  end loop;

  update public.store_import_rows
  set publish_fields = nullif(fields, '{}'::jsonb),
      -- An earlier "Faltan datos" outcome no longer describes the row.
      publish_status = case when publish_status = 'failed' then null else publish_status end,
      publish_message = case when publish_status = 'failed' then null else publish_message end
  where session_id = session.id and row_number = staged.row_number;

  return jsonb_build_object('row_number', staged.row_number, 'publish_fields', coalesce(nullif(fields, '{}'::jsonb), '{}'::jsonb));
end;
$$;

-- ------------------------------------------------------------------ grants

revoke all on function laria_private.import_row_drop_linked_publication_hint() from public, anon, authenticated;
revoke all on function laria_private.import_row_record_item_category() from public, anon, authenticated;
revoke all on function public.get_inventory_category_counts() from public, anon, authenticated;
revoke all on function public.set_store_import_row_publish_fields(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.get_inventory_category_counts() to authenticated;
grant execute on function public.set_store_import_row_publish_fields(uuid, integer, jsonb) to authenticated;
