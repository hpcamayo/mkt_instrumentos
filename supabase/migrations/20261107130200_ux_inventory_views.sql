-- Effortless Laria, inventory batch (docs/ux-effortless/inventory.md): the ways of finding SKUs.
--   * stock-19 "1–50 de 312" and Anterior/Siguiente: get_inventory_page returns the total, the position and a cursor
--     for the previous page; the SKU page gets its previous and next SKU in the same list.
--   * stock-14 select everything that matches, and stock-16 "Exportar esta vista": the ids of a whole filtered view.
--   * stock-17 saved views, plus the "Sin precio" filter.
--   * big-10 the counter (Mostrador): every active SKU with the codes a scan can match.
--   * stock-08 out-of-stock SKUs people are asking about, and stock-07 the reorder list.
-- All reads; every write here is a saved view. Filters are validated in one place, so the table, the counts, the
-- selection and the export always agree.

-- ------------------------------------------------------------------ one ranked list for every reader

-- The caller's matching SKUs in display order: rn is the 1-based position, total the count, and after_cursor whether
-- the row comes after the given keyset cursor (always true without one). Filters as in get_inventory_page
-- (20261107120000_ux_inventory_search.sql) plus price = 'none'.
create or replace function laria_private.inventory_ranked(
  p_store_id uuid, p_filters jsonb, p_cursor_value text default null, p_cursor_id uuid default null
)
returns table(id uuid, sort_value text, rn bigint, total bigint, after_cursor boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  filters jsonb := coalesce(p_filters, '{}'::jsonb);
  sort text := coalesce(nullif(filters->>'sort', ''), 'updated');
  stock text := coalesce(nullif(filters->>'stock', ''), 'all');
  publication text := nullif(filters->>'publication', '');
  catalog text := nullif(filters->>'catalog', '');
  category text := nullif(btrim(coalesce(filters->>'category', '')), '');
  search text := nullif(btrim(coalesce(filters->>'q', '')), '');
  price text := nullif(filters->>'price', '');
  sort_expression text;
  sort_type text;
  descending boolean;
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
    or coalesce(price, 'none') <> 'none'
    or char_length(search) > 100 or char_length(category) > 80 then
    perform laria_private.raise_inventory_error('INVENTORY_FILTER_INVALID', 'Revisa los filtros.');
  end if;

  return query execute format($query$
    select ranked.id, ranked.sort_value::text, ranked.rn, ranked.total,
           $9::uuid is null or (ranked.sort_key, ranked.id) %2$s ($8::%3$s, $9)
    from (
      select i.id, %1$s as sort_key, %1$s as sort_value,
             row_number() over (order by %1$s %4$s, i.id %4$s) as rn,
             count(*) over () as total
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
        and ($7::text is null or i.unit_price_pen is null)
    ) ranked
  $query$,
    sort_expression,
    case when descending then '<' else '>' end,
    sort_type,
    case when descending then 'desc' else 'asc' end)
  using p_store_id, stock, publication, catalog, category, search, price, p_cursor_value, p_cursor_id;
end;
$$;

-- get_inventory_page with the same arguments and items as before, plus:
--   total        how many SKUs match ("de 312")
--   offset       how many come before this page ("51–100")
--   prev_cursor  the cursor of the previous page; null with has_prev true means "the first page"
create or replace function public.get_inventory_page(p_filters jsonb default '{}'::jsonb, p_cursor jsonb default null, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_caller_store(false);
  page_size integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  cursor_value text;
  cursor_id uuid;
  matching_total bigint := 0;
  start_rn bigint;
  page_rows jsonb;
  last_row jsonb;
  prev_cursor jsonb;
begin
  if p_cursor is not null and p_cursor <> 'null'::jsonb then
    cursor_value := p_cursor->>'value';
    cursor_id := laria_private.inventory_json_uuid(p_cursor, 'id');
    if cursor_id is null or cursor_value is null then
      perform laria_private.raise_inventory_error('INVENTORY_FILTER_INVALID', 'La página solicitada no es válida.');
    end if;
  end if;

  with ranked as (
    select * from laria_private.inventory_ranked(owner_store_id, p_filters, cursor_value, cursor_id)
  ), bounds as (
    select coalesce(max(r.total), 0) as matching_total,
           coalesce(min(r.rn) filter (where r.after_cursor), coalesce(max(r.total), 0) + 1) as start_rn
    from ranked r
  )
  select b.matching_total, b.start_rn,
    (select coalesce(jsonb_agg(laria_private.inventory_item_json(i) || jsonb_build_object('sort_value', r.sort_value)
              order by r.rn), '[]'::jsonb)
     from ranked r join public.store_inventory_items i on i.id = r.id
     where r.rn between b.start_rn and b.start_rn + page_size - 1),
    (select jsonb_build_object('value', r.sort_value, 'id', r.id) from ranked r
     where b.start_rn - page_size > 1 and r.rn = b.start_rn - page_size - 1)
  into matching_total, start_rn, page_rows, prev_cursor
  from bounds b;

  if start_rn + page_size - 1 < matching_total then
    last_row := page_rows -> (page_size - 1);
  end if;

  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(element - 'sort_value'), '[]'::jsonb) from jsonb_array_elements(page_rows) element),
    'next_cursor', case when last_row is not null then jsonb_build_object('value', last_row->>'sort_value', 'id', last_row->>'id') end,
    'total', matching_total,
    'offset', least(start_rn - 1, matching_total),
    'has_prev', start_rn > 1,
    'prev_cursor', prev_cursor
  );
end;
$$;

-- stock-19: the SKU before and after this one in the list the owner came from, and its position.
create or replace function public.get_inventory_neighbors(p_item_id uuid, p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_caller_store(false);
  current_rn bigint;
  matching_total bigint;
  previous_id uuid;
  next_id uuid;
begin
  with ranked as (select * from laria_private.inventory_ranked(owner_store_id, p_filters)),
  here as (select r.rn from ranked r where r.id = p_item_id)
  select (select rn from here), (select max(r.total) from ranked r),
         (select r.id from ranked r, here h where r.rn = h.rn - 1),
         (select r.id from ranked r, here h where r.rn = h.rn + 1)
  into current_rn, matching_total, previous_id, next_id;
  if current_rn is null then
    return jsonb_build_object('position', null, 'total', coalesce(matching_total, 0), 'previous_id', null, 'next_id', null);
  end if;
  return jsonb_build_object('position', current_rn, 'total', matching_total, 'previous_id', previous_id, 'next_id', next_id);
end;
$$;

-- stock-14 and stock-16: every id of the view, in order, up to the bulk limit.
create or replace function public.get_inventory_item_ids(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare owner_store_id uuid := laria_private.inventory_caller_store(false);
begin
  return (
    select jsonb_build_object(
      'ids', coalesce(jsonb_agg(r.id order by r.rn) filter (where r.rn <= laria_private.inventory_bulk_limit()), '[]'::jsonb),
      'total', coalesce(max(r.total), 0),
      'limit', laria_private.inventory_bulk_limit())
    from laria_private.inventory_ranked(owner_store_id, p_filters) r
  );
end;
$$;

-- ------------------------------------------------------------------ stock-17: saved views

create table public.store_inventory_views (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  filters     jsonb not null check (jsonb_typeof(filters) = 'object' and octet_length(filters::text) <= 1024),
  created_at  timestamptz not null default now(),
  unique (store_id, name)
);

alter table public.store_inventory_views enable row level security;
revoke all on public.store_inventory_views from public, anon, authenticated;
grant select on public.store_inventory_views to authenticated;
create policy "Store owners can read own inventory views" on public.store_inventory_views
  for select to authenticated using (public.is_store_owner(store_id));

-- Saves the current filters under a name (the same name replaces the earlier view). Up to 12 per store.
create or replace function public.save_inventory_view(p_name text, p_filters jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_caller_store(true);
  view_name text := laria_private.inventory_short_text(p_name, 40, 'name');
  filters jsonb;
  saved public.store_inventory_views;
begin
  if view_name is null then
    perform laria_private.raise_inventory_error('INVENTORY_FIELD_INVALID', 'Ponle un nombre a la vista.', jsonb_build_object('field', 'name'));
  end if;
  if p_filters is null or jsonb_typeof(p_filters) <> 'object' or exists (
    select 1 from jsonb_each(p_filters) entry
    where entry.key not in ('q', 'stock', 'publication', 'category', 'sort', 'price') or jsonb_typeof(entry.value) <> 'string') then
    perform laria_private.raise_inventory_error('INVENTORY_FILTER_INVALID', 'Revisa los filtros.');
  end if;
  select jsonb_object_agg(key, value) into filters from jsonb_each(p_filters) where value <> '""'::jsonb;
  filters := coalesce(filters, '{}'::jsonb);
  perform 1 from laria_private.inventory_ranked(owner_store_id, filters) limit 1; -- validates the filters
  perform pg_advisory_xact_lock(hashtextextended(owner_store_id::text || ':inventory-views', 23));
  if not exists (select 1 from public.store_inventory_views v where v.store_id = owner_store_id and v.name = view_name)
     and (select count(*) from public.store_inventory_views v where v.store_id = owner_store_id) >= 12 then
    perform laria_private.raise_inventory_error('INVENTORY_VIEWS_FULL', 'Ya tienes 12 vistas guardadas. Borra una para guardar otra.');
  end if;
  insert into public.store_inventory_views(store_id, name, filters) values (owner_store_id, view_name, filters)
  on conflict (store_id, name) do update set filters = excluded.filters
  returning * into saved;
  return jsonb_build_object('id', saved.id, 'name', saved.name, 'filters', saved.filters);
end;
$$;

create or replace function public.delete_inventory_view(p_view_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare owner_store_id uuid := laria_private.inventory_caller_store(true);
begin
  delete from public.store_inventory_views where id = p_view_id and store_id = owner_store_id;
  return jsonb_build_object('deleted', found);
end;
$$;

-- ------------------------------------------------------------------ big-10: the counter

-- Every active SKU with what a scan or a typed code can match (SKU and external reference, where stores keep the
-- barcode), so the counter finds codes instantly and keeps working while the connection drops.
create or replace function public.get_counter_index()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare owner_store_id uuid := laria_private.inventory_caller_store(false);
begin
  return (
    select jsonb_build_object('items', coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'merchant_sku', i.merchant_sku, 'external_reference', i.external_reference,
        'product_name', i.product_name, 'variant_label', i.variant_label,
        'quantity_available', i.quantity_available, 'unit_price_pen', i.unit_price_pen,
        'version', i.version, 'listing_title', l.title) order by i.merchant_sku), '[]'::jsonb),
      'generated_at', now())
    from public.store_inventory_items i
    left join public.listings l on l.id = i.listing_id
    where i.store_id = owner_store_id and i.inventory_status = 'active'
  );
end;
$$;

-- ------------------------------------------------------------------ stock-08 and stock-07

-- Out-of-stock SKUs whose publication people still save or ask about (favorites now, WhatsApp contacts in 90 days),
-- most asked first. Counts only; never who.
create or replace function public.get_out_of_stock_demand(p_limit integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare owner_store_id uuid := laria_private.inventory_caller_store(false);
begin
  return (
    select coalesce(jsonb_agg(row_value order by interest desc, merchant_sku), '[]'::jsonb)
    from (
      select i.merchant_sku, demand.favorites + demand.contacts as interest,
        jsonb_build_object('id', i.id, 'merchant_sku', i.merchant_sku, 'product_name', i.product_name,
          'listing_id', i.listing_id, 'listing_title', l.title, 'version', i.version,
          'favorites', demand.favorites, 'contacts_90d', demand.contacts) as row_value
      from public.store_inventory_items i
      join public.listings l on l.id = i.listing_id
      cross join lateral (select
        (select count(*) from public.favorites f where f.listing_id = i.listing_id) as favorites,
        (select count(*) from public.marketplace_events e where e.listing_id = i.listing_id
           and e.event_type = 'whatsapp_contact' and e.created_at >= now() - interval '90 days') as contacts) demand
      where i.store_id = owner_store_id and i.inventory_status = 'active' and i.quantity_available = 0
        and demand.favorites + demand.contacts > 0
      order by interest desc, i.merchant_sku
      limit least(greatest(coalesce(p_limit, 10), 1), 50)
    ) ranked
  );
end;
$$;

-- What to reorder: active SKUs at or under their low-stock threshold, or out of stock, with net sales in 30 days
-- (undone sales excluded) and a suggested quantity: enough for another 30 days like the last, and at least back
-- above the threshold.
create or replace function public.get_reorder_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare owner_store_id uuid := laria_private.inventory_caller_store(false);
begin
  return (
    select jsonb_build_object('items', coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'merchant_sku', i.merchant_sku, 'product_name', i.product_name, 'variant_label', i.variant_label,
        'external_reference', i.external_reference, 'quantity_available', i.quantity_available,
        'low_stock_threshold', i.low_stock_threshold, 'sales_30d', coalesce(greatest(s.units, 0), 0),
        'suggested', greatest(1, greatest(coalesce(greatest(s.units, 0), 0), coalesce(i.low_stock_threshold, 0) + 1)
          - i.quantity_available),
        'unit_price_pen', i.unit_price_pen)
      order by i.quantity_available, coalesce(s.units, 0) desc, i.merchant_sku), '[]'::jsonb))
    from public.store_inventory_items i
    left join laria_private.store_net_sales(owner_store_id, now() - interval '30 days') s on s.item_id = i.id
    where i.store_id = owner_store_id and i.inventory_status = 'active'
      and laria_private.inventory_stock_level(i.quantity_available, i.low_stock_threshold) in ('low', 'out')
  );
end;
$$;

revoke all on function laria_private.inventory_ranked(uuid, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.get_inventory_neighbors(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.get_inventory_item_ids(jsonb) from public, anon, authenticated;
revoke all on function public.save_inventory_view(text, jsonb) from public, anon, authenticated;
revoke all on function public.delete_inventory_view(uuid) from public, anon, authenticated;
revoke all on function public.get_counter_index() from public, anon, authenticated;
revoke all on function public.get_out_of_stock_demand(integer) from public, anon, authenticated;
revoke all on function public.get_reorder_list() from public, anon, authenticated;
grant execute on function public.get_inventory_neighbors(uuid, jsonb) to authenticated;
grant execute on function public.get_inventory_item_ids(jsonb) to authenticated;
grant execute on function public.save_inventory_view(text, jsonb) to authenticated;
grant execute on function public.delete_inventory_view(uuid) to authenticated;
grant execute on function public.get_counter_index() to authenticated;
grant execute on function public.get_out_of_stock_demand(integer) to authenticated;
grant execute on function public.get_reorder_list() to authenticated;
