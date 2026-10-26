-- Feature ideas, batch listing-details: public.catalog_facets rebuilt whole (it is one statement, so a find-and-replace
-- would be harder to read than the function). Same arguments, checks, grants and JSON as 20261111120000's version,
-- plus:
--   - "options" in p_filters: registered listing flags (20261202120100), "all of". Every facet counts with them, and
--     the result has an "options" object: per flag, how many results adding it gives.
--   - an old condition value ("Usado - buen estado") counts as its part of the new scale (20261202120000).
-- store-floor's "Con garantía" is a flag, so it needs no change here.

create or replace function public.catalog_facets(p_filters jsonb, p_q text default null, p_attribute_keys text[] default '{}')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  filters jsonb := coalesce(p_filters, '{}'::jsonb);
  f_category text;
  f_type text;
  f_conditions text[];
  f_cities text[];
  f_brand text;
  f_seller text;
  f_min numeric;
  f_max numeric;
  f_advanced jsonb;
  f_options text[];
  keys text[] := coalesce(p_attribute_keys, '{}');
  matches uuid[];
  result jsonb;
begin
  if jsonb_typeof(filters) <> 'object' or octet_length(filters::text) > 8192
    or cardinality(keys) > 30 or length(coalesce(p_q, '')) > 200 then
    raise exception 'CATALOG_FILTERS_INVALID';
  end if;

  -- The values the old per-row checks read, read once. A value of the wrong JSON type failed there with a cast or
  -- array error; here it fails the same request with CATALOG_FILTERS_INVALID.
  begin
    f_category := filters->>'category';
    f_type := filters->>'instrument_type';
    f_brand := filters->>'brand';
    f_seller := filters->>'seller_type';
    f_min := (filters->>'min_price')::numeric;
    f_max := (filters->>'max_price')::numeric;
    if coalesce(jsonb_array_length(filters->'conditions'), 0) > 0 then
      -- sell-10: an old condition in a link stands for its part of the new scale (20261202120000).
      f_conditions := array(
        select distinct value from jsonb_array_elements_text(filters->'conditions') as given(condition),
          unnest(laria_private.condition_search_values(given.condition)) as value);
    end if;
    if coalesce(jsonb_array_length(filters->'cities'), 0) > 0 then
      f_cities := array(select jsonb_array_elements_text(filters->'cities'));
    end if;
    f_advanced := coalesce(filters->'advanced', '{}'::jsonb);
    -- listing-details: the yes/no filters, "all of" (20261202120100).
    if coalesce(jsonb_array_length(filters->'options'), 0) > 0 then
      f_options := array(select jsonb_array_elements_text(filters->'options'));
    end if;
    perform jsonb_object_keys(f_advanced);
  exception when others then
    raise exception 'CATALOG_FILTERS_INVALID';
  end;

  if nullif(trim(coalesce(p_q, '')), '') is not null then
    matches := array(select public.catalog_search_ids(p_q));
  end if;

  with base as materialized (
    select
      l.category, l.instrument_type, l.condition, l.city, l.region, l.brand, l.price_pen, l.seller_type, l.attributes,
      l.listing_flags,
      -- seller_verified_rank: a store listing of an active verified store (visibility already requires active).
      (l.seller_type = 'store' and s.is_verified) as verified,
      (f_category is null or l.category = f_category) as ok_category,
      (f_type is null or l.instrument_type = f_type) as ok_type,
      (f_conditions is null or l.condition = any(f_conditions)) as ok_condition,
      (f_cities is null or l.city = any(f_cities)) as ok_location,
      (f_brand is null or coalesce(l.brand, '') ilike '%' || f_brand || '%') as ok_brand,
      ((f_min is null or l.price_pen >= f_min) and (f_max is null or l.price_pen <= f_max)) as ok_price,
      (f_seller is null
        or (f_seller in ('individual', 'store') and l.seller_type::text = f_seller)
        or (f_seller = 'verified_store' and l.seller_type = 'store' and s.is_verified)) as ok_seller,
      (f_options is null or l.listing_flags @> f_options) as ok_options,
      -- The advanced filters this listing fails (an empty array when it passes them all).
      array(
        select a.key from jsonb_each(f_advanced) a
        where not (coalesce(l.attributes, '{}'::jsonb) @> jsonb_build_object(a.key, a.value))
      ) as advanced_failed
    from public.listings l
    left join public.stores s on s.id = l.store_id
    where l.status = 'approved'
      and (l.stock_state is null or l.stock_state = 'in_stock')
      and ((l.seller_type = 'individual' and l.store_id is null)
        or (l.seller_type = 'store' and l.store_id is not null and s.status = 'active'))
      and (matches is null or l.id = any(matches))
  ),
  -- Which facets each listing counts for: every filter passes except, at most, the facet's own.
  flagged as materialized (
    select b.*,
      cardinality(b.advanced_failed) = 0 as ok_advanced,
      (b.ok_category::int + b.ok_type::int + b.ok_condition::int + b.ok_location::int + b.ok_brand::int + b.ok_price::int
        + b.ok_seller::int + b.ok_options::int) as core_passed
    from base b
  )
  select jsonb_build_object(
    'total', (select count(*) from flagged where core_passed = 8 and ok_advanced),
    'category', coalesce((select jsonb_object_agg(value, n) from (
      select category as value, count(*) as n from flagged
      where ok_type and ok_condition and ok_location and ok_brand and ok_price and ok_seller and ok_options
        and cardinality(array_remove(advanced_failed, 'category')) = 0
      group by 1) c), '{}'),
    'instrument_type', coalesce((select jsonb_object_agg(value, n) from (
      select instrument_type as value, count(*) as n from flagged
      where instrument_type is not null
        and ok_category and ok_condition and ok_location and ok_brand and ok_price and ok_seller and ok_options
        and cardinality(array_remove(advanced_failed, 'instrument_type')) = 0
      group by 1) c), '{}'),
    'condition', coalesce((select jsonb_object_agg(value, n) from (
      select condition as value, count(*) as n from flagged
      where condition is not null
        and ok_category and ok_type and ok_location and ok_brand and ok_price and ok_seller and ok_options
        and cardinality(array_remove(advanced_failed, 'condition')) = 0
      group by 1) c), '{}'),
    'seller_type', (select jsonb_build_object(
        'individual', count(*) filter (where seller_type = 'individual'),
        'store', count(*) filter (where seller_type = 'store'),
        'verified_store', count(*) filter (where verified))
      from flagged
      where ok_category and ok_type and ok_condition and ok_location and ok_brand and ok_price and ok_options
        and cardinality(array_remove(advanced_failed, 'seller_type')) = 0),
    'locations', coalesce((select jsonb_agg(jsonb_build_object('city', city, 'region', region, 'count', n) order by n desc, city) from (
      select city, mode() within group (order by region) as region, count(*) as n from flagged
      where ok_category and ok_type and ok_condition and ok_brand and ok_price and ok_seller and ok_options
        and cardinality(array_remove(advanced_failed, 'location')) = 0
      group by 1) c), '[]'),
    'brands', coalesce((select jsonb_agg(jsonb_build_object('brand', brand, 'count', n) order by n desc, brand) from (
      select mode() within group (order by trim(brand)) as brand, count(*) as n from flagged
      where nullif(trim(brand), '') is not null
        and ok_category and ok_type and ok_condition and ok_location and ok_price and ok_seller and ok_options
        and cardinality(array_remove(advanced_failed, 'brand')) = 0
      group by public.catalog_fold(trim(brand)) order by n desc, 1 limit 30) c), '[]'),
    'price', (select jsonb_build_object(
        'min', min(price_pen), 'max', max(price_pen),
        'low', percentile_disc(0.33) within group (order by price_pen),
        'high', percentile_disc(0.66) within group (order by price_pen),
        'count', count(price_pen))
      from flagged
      where price_pen is not null
        and ok_category and ok_type and ok_condition and ok_location and ok_brand and ok_seller and ok_options
        and cardinality(array_remove(advanced_failed, 'price')) = 0),
    -- listing-details: per flag, how many results adding it gives. The flags combine as "all of", so that is the
    -- results with every filter that have the flag (a chosen flag counts the total). Registered flags only.
    'options', coalesce((select jsonb_object_agg(flag, n) from (
      select flag, count(*) as n
      from flagged cross join lateral unnest(listing_flags) as flag
      where core_passed = 8 and ok_advanced
      group by flag) c
      where exists (select 1 from laria_private.listing_flag_filters registered where registered.flag = c.flag)), '{}'),
    'advanced', coalesce((select jsonb_object_agg(key, counts) from (
      select k.key, coalesce((select jsonb_object_agg(value, n) from (
        select v.value, count(*) as n
        from flagged f
        cross join lateral (
          select jsonb_array_elements_text(case when jsonb_typeof(f.attributes->k.key) = 'array' then f.attributes->k.key else '[]'::jsonb end)
          union all
          select f.attributes->>k.key where jsonb_typeof(f.attributes->k.key) in ('string', 'number', 'boolean')
        ) as v(value)
        where (k.key = 'category' or f.ok_category) and (k.key = 'instrument_type' or f.ok_type)
          and (k.key = 'condition' or f.ok_condition) and (k.key = 'location' or f.ok_location)
          and (k.key = 'brand' or f.ok_brand) and (k.key = 'price' or f.ok_price) and (k.key = 'seller_type' or f.ok_seller)
          and f.ok_options
          and cardinality(array_remove(f.advanced_failed, k.key)) = 0
        group by v.value) c), '{}') as counts
      from unnest(keys) as k(key)) a), '{}')
  ) into result;
  return result;
end;
$$;

revoke all on function public.catalog_facets(jsonb, text, text[]) from public;
grant execute on function public.catalog_facets(jsonb, text, text[]) to anon, authenticated;
