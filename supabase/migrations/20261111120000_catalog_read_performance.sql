-- Catalog read performance (docs/operations/catalog-performance.md). Same results,
-- far less work per request: nothing here changes which listings anyone sees, what a search finds or what a count says.
--
-- 1. Public visibility in row-level security is written inline. The policies on listings and listing_photos called
--    public.listing_is_public(id) once per row: a security-definer function with its own search_path, which Postgres
--    can neither inline nor cache, and which reads the listing and its store again. About 23 times the cost of the
--    same condition written in the policy (5,000 listings: 70 ms against 3 ms for one count). Every anonymous read of
--    listings, photos and photo counts paid it. The new condition is word for word the function's: approved, and an
--    individual listing without a store or a store listing whose store is active. listing_is_public itself is kept
--    unchanged for the many functions that check one listing.
-- 2. Free-text search writes public.listing_matches_query's rule once per query, with the words and synonyms as
--    constants, in a form a new trigram index answers. Before, every approved listing ran the rule as a function that
--    re-parsed the query and looked up synonyms for that row. Accents, synonyms, typos (word similarity 0.55), "every
--    word must match" and the result set are unchanged; listing_matches_query stays the rule for saved-search alerts.
-- 3. catalog_facets reads the public listings once, works out each filter's yes/no per listing once, and counts every
--    facet from those flags. Before, it called laria_private.catalog_filter_ok (and seller_verified_rank) once per
--    listing per facet: about 20 function calls per listing. The JSON it returns is the same, key for key.
-- 4. catalog_brand_counts, catalog_type_counts and catalog_suggest use the inline visibility condition.
--
-- Compatibility: every function keeps its name, arguments, result and grants, so the application before and after
-- this migration works with it, and the migration can be applied before the application deploy.
-- Locks and duration: the index build takes a SHARE lock on public.listings (reads continue; listing writes wait
-- until it ends). With a few hundred listings it takes milliseconds; 20,000 listings take about a second
-- locally. It is built inside the migration's transaction (supabase db push runs each file in one transaction), so it
-- cannot be CONCURRENTLY. The policy swaps take a brief ACCESS EXCLUSIVE lock on each table.
-- Rollback: 20261111120000_catalog_read_performance.down.sql is not shipped; to go back, re-run the previous
-- definitions from 20260910190000_store_sprint_2.sql (policies) and 20261101120000_ux_find_search.sql (functions) and
-- drop listings_search_text_trgm_idx. docs/operations/catalog-performance.md has the exact steps.
-- Maintenance: the index stores public.listing_search_text(...). If that function or public.catalog_fold ever
-- changes, the same migration must `reindex index public.listings_search_text_trgm_idx`.

-- ------------------------------------------------------------------------------------------------ 1. visibility

drop policy if exists "Public can read publicly eligible listings" on public.listings;
create policy "Public can read publicly eligible listings"
on public.listings
for select
to anon, authenticated
using (
  status = 'approved'
  and (
    (seller_type = 'individual' and store_id is null)
    or (
      seller_type = 'store' and store_id is not null
      and exists (select 1 from public.stores s where s.id = listings.store_id and s.status = 'active')
    )
  )
);

-- The listing must be public; the subquery reads public.listings under its own row-level security, and the explicit
-- condition keeps the photo policy exactly as narrow as listing_is_public for every caller.
drop policy if exists "Public can read photos for publicly eligible listings" on public.listing_photos;
create policy "Public can read photos for publicly eligible listings"
on public.listing_photos
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.listings l
    where l.id = listing_photos.listing_id
      and l.status = 'approved'
      and (
        (l.seller_type = 'individual' and l.store_id is null)
        or (
          l.seller_type = 'store' and l.store_id is not null
          and exists (select 1 from public.stores s where s.id = l.store_id and s.status = 'active')
        )
      )
  )
);

-- --------------------------------------------------------------------------------------------- 2. text search

create index if not exists listings_search_text_trgm_idx
on public.listings
using gin (public.listing_search_text(title, brand, model, category, instrument_type) extensions.gin_trgm_ops)
where status = 'approved';

-- The search condition for a query, as SQL over the alias "l", equal to public.listing_matches_query's rule with the
-- query's words and synonyms written in as constants: for every query word, the listing text contains the word or one
-- of its synonyms, or (words of four letters or more) has a word at least 0.55 similar. "Contains" is LIKE with the
-- wildcards escaped (the same as strpos > 0) and "similar" is extensions.<% under a 0.55 threshold (the same as
-- word_similarity >= 0.55; callers set pg_trgm.word_similarity_threshold), which the trigram index answers. Before,
-- every listing re-parsed the query and looked up its synonyms. Words are [a-z0-9] only (search_query_words) and
-- synonyms are quoted, so the text is safe to execute. 'true' when the query has no words, as listing_matches_query.
create or replace function public.catalog_search_condition(p_q text)
returns text
language sql
stable
parallel safe
set search_path = public, extensions
as $$
  select coalesce(string_agg(
    '(' || concat_ws(' or ',
      format('public.listing_search_text(l.title, l.brand, l.model, l.category, l.instrument_type) like %L', '%' || word || '%'),
      (select string_agg(format('public.listing_search_text(l.title, l.brand, l.model, l.category, l.instrument_type) like %L',
          '%' || replace(replace(replace(e, '\', '\\'), '%', '\%'), '_', '\_') || '%'), ' or ')
        from public.search_synonyms s, unnest(s.expansions) e where s.term = word),
      case when length(word) >= 4
        then format('%L operator(extensions.<%%) public.listing_search_text(l.title, l.brand, l.model, l.category, l.instrument_type)', word) end
    ) || ')', ' and '), 'true')
  from unnest(public.search_query_words(p_q)) as word
$$;

revoke all on function public.catalog_search_condition(text) from public;
grant execute on function public.catalog_search_condition(text) to anon, authenticated;

-- The ids of the public listings matching a query. Security definer so the trigram index can be used: under row-level
-- security Postgres may not evaluate the (not leakproof) text conditions before the policy, so it scans every row. It
-- applies the public-visibility condition itself and returns nothing a visitor could not already find.
create or replace function public.catalog_search_ids(p_q text)
returns setof uuid
language plpgsql
stable
security definer
set search_path = public, extensions
set pg_trgm.word_similarity_threshold = 0.55
as $$
begin
  if length(coalesce(p_q, '')) > 200 then raise exception 'CATALOG_FILTERS_INVALID'; end if;
  return query execute format(
    'select l.id from public.listings l left join public.stores s on s.id = l.store_id
     where l.status = ''approved''
       and ((l.seller_type = ''individual'' and l.store_id is null)
         or (l.seller_type = ''store'' and l.store_id is not null and s.status = ''active''))
       and (%s)',
    public.catalog_search_condition(p_q));
end;
$$;

revoke all on function public.catalog_search_ids(text) from public;
grant execute on function public.catalog_search_ids(text) to anon, authenticated;

-- Same contract as before (20261101120000): approved listings whose text matches the query, security invoker so
-- row-level security still decides what the caller sees. One difference, for signed-in callers only: a listing that is
-- approved but not public (its store is not active) no longer matches for its own store's members. The application
-- calls it with the anonymous key only, for whom nothing changes.
create or replace function public.catalog_search(p_q text)
returns setof public.listings
language sql
stable
set search_path = public, extensions
as $$
  select l.* from public.listings l
  where l.status = 'approved' and l.id in (select public.catalog_search_ids(p_q))
$$;

revoke all on function public.catalog_search(text) from public;
grant execute on function public.catalog_search(text) to anon, authenticated;

-- ------------------------------------------------------------------------------------------------- 3. facets

-- Same arguments, same checks and the same JSON as 20261101120000's version. Each listing's pass/fail per filter is
-- computed once (the ok_* columns); a facet counts the listings that pass every filter but its own. Public listings
-- with stock only, whoever calls.
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
      f_conditions := array(select jsonb_array_elements_text(filters->'conditions'));
    end if;
    if coalesce(jsonb_array_length(filters->'cities'), 0) > 0 then
      f_cities := array(select jsonb_array_elements_text(filters->'cities'));
    end if;
    f_advanced := coalesce(filters->'advanced', '{}'::jsonb);
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
        + b.ok_seller::int) as core_passed
    from base b
  )
  select jsonb_build_object(
    'total', (select count(*) from flagged where core_passed = 7 and ok_advanced),
    'category', coalesce((select jsonb_object_agg(value, n) from (
      select category as value, count(*) as n from flagged
      where ok_type and ok_condition and ok_location and ok_brand and ok_price and ok_seller
        and cardinality(array_remove(advanced_failed, 'category')) = 0
      group by 1) c), '{}'),
    'instrument_type', coalesce((select jsonb_object_agg(value, n) from (
      select instrument_type as value, count(*) as n from flagged
      where instrument_type is not null
        and ok_category and ok_condition and ok_location and ok_brand and ok_price and ok_seller
        and cardinality(array_remove(advanced_failed, 'instrument_type')) = 0
      group by 1) c), '{}'),
    'condition', coalesce((select jsonb_object_agg(value, n) from (
      select condition as value, count(*) as n from flagged
      where condition is not null
        and ok_category and ok_type and ok_location and ok_brand and ok_price and ok_seller
        and cardinality(array_remove(advanced_failed, 'condition')) = 0
      group by 1) c), '{}'),
    'seller_type', (select jsonb_build_object(
        'individual', count(*) filter (where seller_type = 'individual'),
        'store', count(*) filter (where seller_type = 'store'),
        'verified_store', count(*) filter (where verified))
      from flagged
      where ok_category and ok_type and ok_condition and ok_location and ok_brand and ok_price
        and cardinality(array_remove(advanced_failed, 'seller_type')) = 0),
    'locations', coalesce((select jsonb_agg(jsonb_build_object('city', city, 'region', region, 'count', n) order by n desc, city) from (
      select city, mode() within group (order by region) as region, count(*) as n from flagged
      where ok_category and ok_type and ok_condition and ok_brand and ok_price and ok_seller
        and cardinality(array_remove(advanced_failed, 'location')) = 0
      group by 1) c), '[]'),
    'brands', coalesce((select jsonb_agg(jsonb_build_object('brand', brand, 'count', n) order by n desc, brand) from (
      select mode() within group (order by trim(brand)) as brand, count(*) as n from flagged
      where nullif(trim(brand), '') is not null
        and ok_category and ok_type and ok_condition and ok_location and ok_price and ok_seller
        and cardinality(array_remove(advanced_failed, 'brand')) = 0
      group by public.catalog_fold(trim(brand)) order by n desc, 1 limit 30) c), '[]'),
    'price', (select jsonb_build_object(
        'min', min(price_pen), 'max', max(price_pen),
        'low', percentile_disc(0.33) within group (order by price_pen),
        'high', percentile_disc(0.66) within group (order by price_pen),
        'count', count(price_pen))
      from flagged
      where price_pen is not null
        and ok_category and ok_type and ok_condition and ok_location and ok_brand and ok_seller
        and cardinality(array_remove(advanced_failed, 'price')) = 0),
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
          and cardinality(array_remove(f.advanced_failed, k.key)) = 0
        group by v.value) c), '{}') as counts
      from unnest(keys) as k(key)) a), '{}')
  ) into result;
  return result;
end;
$$;

revoke all on function public.catalog_facets(jsonb, text, text[]) from public;
grant execute on function public.catalog_facets(jsonb, text, text[]) to anon, authenticated;

-- ---------------------------------------------------------------------------------- 4. menus and suggestions

create or replace function public.catalog_brand_counts()
returns table (category text, brand text, listings bigint)
language sql
stable
security definer
set search_path = public
as $$
  select l.category, mode() within group (order by trim(l.brand)), count(*)
  from public.listings l
  left join public.stores s on s.id = l.store_id
  where l.status = 'approved' and (l.stock_state is null or l.stock_state = 'in_stock')
    and ((l.seller_type = 'individual' and l.store_id is null)
      or (l.seller_type = 'store' and l.store_id is not null and s.status = 'active'))
    and nullif(trim(l.brand), '') is not null
  group by l.category, public.catalog_fold(trim(l.brand))
  order by 1, 3 desc, 2
$$;

create or replace function public.catalog_type_counts()
returns table (category text, instrument_type text, listings bigint)
language sql
stable
security definer
set search_path = public
as $$
  select l.category, l.instrument_type, count(*)
  from public.listings l
  left join public.stores s on s.id = l.store_id
  where l.status = 'approved' and (l.stock_state is null or l.stock_state = 'in_stock')
    and ((l.seller_type = 'individual' and l.store_id is null)
      or (l.seller_type = 'store' and l.store_id is not null and s.status = 'active'))
  group by 1, 2
  order by 1, 2
$$;

revoke all on function public.catalog_brand_counts() from public;
revoke all on function public.catalog_type_counts() from public;
grant execute on function public.catalog_brand_counts() to anon, authenticated;
grant execute on function public.catalog_type_counts() to anon, authenticated;

create or replace function public.catalog_suggest(p_q text, p_limit integer default 6)
returns table (kind text, brand text, model text, listings bigint)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with typed as (
    select public.catalog_fold(trim(left(coalesce(p_q, ''), 60))) as q
  ),
  public_listings as (
    select trim(l.brand) as brand, nullif(trim(l.model), '') as model
    from public.listings l
    left join public.stores s on s.id = l.store_id
    where l.status = 'approved' and (l.stock_state is null or l.stock_state = 'in_stock')
      and ((l.seller_type = 'individual' and l.store_id is null)
        or (l.seller_type = 'store' and l.store_id is not null and s.status = 'active'))
      and nullif(trim(l.brand), '') is not null
      and (select length(q) >= 2 from typed)
  ),
  brands as (
    select 'brand'::text as kind, mode() within group (order by brand) as brand, null::text as model, count(*) as listings,
      public.catalog_fold(brand) as folded
    from public_listings group by public.catalog_fold(brand)
  ),
  models as (
    select 'model'::text, mode() within group (order by brand), mode() within group (order by model), count(*),
      public.catalog_fold(brand || ' ' || model)
    from public_listings where model is not null group by public.catalog_fold(brand || ' ' || model)
  ),
  candidates as (
    select * from brands union all select * from models
  )
  select c.kind, c.brand, c.model, c.listings
  from candidates c, typed t
  where length(t.q) >= 2
    and (c.folded like t.q || '%' or c.folded like '% ' || t.q || '%' or strpos(c.folded, t.q) > 0
      or (length(t.q) >= 4 and extensions.word_similarity(t.q, c.folded) >= 0.5))
  order by (c.folded like t.q || '%') desc, c.kind, c.listings desc, c.brand, c.model
  limit least(greatest(coalesce(p_limit, 6), 1), 10)
$$;

revoke all on function public.catalog_suggest(text, integer) from public;
grant execute on function public.catalog_suggest(text, integer) to anon, authenticated;
