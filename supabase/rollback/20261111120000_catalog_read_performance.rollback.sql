-- Rollback for supabase/migrations/20261111120000_catalog_read_performance.sql. Not a migration: run it by hand, and
-- only if that migration itself is at fault (the application before and after it works with either schema, so a code
-- problem is rolled back in Vercel, not here). docs/operations/catalog-performance.md has when and how.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/rollback/20261111120000_catalog_read_performance.rollback.sql
--
-- It restores, verbatim, the policies of 20260910190000_store_sprint_2.sql and the functions of
-- 20261101120000_ux_find_search.sql, then drops what the migration added. Locks: brief ACCESS EXCLUSIVE on listings
-- and listing_photos for the policy swaps; dropping the index is instant. The migration stays recorded as applied, so
-- a later `supabase db push` does not re-run it; to re-apply, run the migration file by hand.

drop policy if exists "Public can read publicly eligible listings" on public.listings;
create policy "Public can read publicly eligible listings"
on public.listings
for select
to anon, authenticated
using (public.listing_is_public(id));

drop policy if exists "Public can read photos for publicly eligible listings" on public.listing_photos;
create policy "Public can read photos for publicly eligible listings"
on public.listing_photos
for select
to anon, authenticated
using (public.listing_is_public(listing_id));

create or replace function public.catalog_search(p_q text)
returns setof public.listings
language sql
stable
set search_path = public, extensions
as $$
  select l.*
  from public.listings l
  where l.status = 'approved'
    and public.listing_matches_query(public.listing_search_text(l.title, l.brand, l.model, l.category, l.instrument_type), p_q)
$$;
revoke all on function public.catalog_search(text) from public;
grant execute on function public.catalog_search(text) to anon, authenticated;

create or replace function public.catalog_facets(p_filters jsonb, p_q text default null, p_attribute_keys text[] default '{}')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  filters jsonb := coalesce(p_filters, '{}'::jsonb);
  result jsonb;
begin
  if jsonb_typeof(filters) <> 'object' or octet_length(filters::text) > 8192
    or cardinality(coalesce(p_attribute_keys, '{}')) > 30 or length(coalesce(p_q, '')) > 200 then
    raise exception 'CATALOG_FILTERS_INVALID';
  end if;

  with catalog_facet_base as materialized (
    select l as row from public.listings l
    where l.status = 'approved'
      and (l.stock_state is null or l.stock_state = 'in_stock')
      and public.listing_is_public(l.id)
      and (nullif(trim(coalesce(p_q, '')), '') is null
        or public.listing_matches_query(public.listing_search_text(l.title, l.brand, l.model, l.category, l.instrument_type), p_q))
  )
  select jsonb_build_object(
    'total', (select count(*) from catalog_facet_base b where laria_private.catalog_filter_ok(b.row, filters, '')),
    'category', coalesce((select jsonb_object_agg(value, n) from (
      select (b.row).category as value, count(*) as n from catalog_facet_base b
      where laria_private.catalog_filter_ok(b.row, filters, 'category') group by 1) c), '{}'),
    'instrument_type', coalesce((select jsonb_object_agg(value, n) from (
      select (b.row).instrument_type as value, count(*) as n from catalog_facet_base b
      where (b.row).instrument_type is not null and laria_private.catalog_filter_ok(b.row, filters, 'instrument_type') group by 1) c), '{}'),
    'condition', coalesce((select jsonb_object_agg(value, n) from (
      select (b.row).condition as value, count(*) as n from catalog_facet_base b
      where (b.row).condition is not null and laria_private.catalog_filter_ok(b.row, filters, 'condition') group by 1) c), '{}'),
    'seller_type', jsonb_build_object(
      'individual', (select count(*) from catalog_facet_base b where (b.row).seller_type = 'individual' and laria_private.catalog_filter_ok(b.row, filters, 'seller_type')),
      'store', (select count(*) from catalog_facet_base b where (b.row).seller_type = 'store' and laria_private.catalog_filter_ok(b.row, filters, 'seller_type')),
      'verified_store', (select count(*) from catalog_facet_base b where public.seller_verified_rank(b.row) = 1 and laria_private.catalog_filter_ok(b.row, filters, 'seller_type'))),
    'locations', coalesce((select jsonb_agg(jsonb_build_object('city', city, 'region', region, 'count', n) order by n desc, city) from (
      select (b.row).city as city, mode() within group (order by (b.row).region) as region, count(*) as n from catalog_facet_base b
      where laria_private.catalog_filter_ok(b.row, filters, 'location') group by 1) c), '[]'),
    'brands', coalesce((select jsonb_agg(jsonb_build_object('brand', brand, 'count', n) order by n desc, brand) from (
      select mode() within group (order by trim((b.row).brand)) as brand, count(*) as n from catalog_facet_base b
      where nullif(trim((b.row).brand), '') is not null and laria_private.catalog_filter_ok(b.row, filters, 'brand')
      group by public.catalog_fold(trim((b.row).brand)) order by n desc limit 30) c), '[]'),
    'price', (select jsonb_build_object(
        'min', min(p), 'max', max(p),
        'low', percentile_disc(0.33) within group (order by p),
        'high', percentile_disc(0.66) within group (order by p),
        'count', count(p))
      from (select (b.row).price_pen as p from catalog_facet_base b
        where (b.row).price_pen is not null and laria_private.catalog_filter_ok(b.row, filters, 'price')) prices),
    'advanced', coalesce((select jsonb_object_agg(key, counts) from (
      select key, coalesce((select jsonb_object_agg(value, n) from (
        select v.value, count(*) as n
        from catalog_facet_base b
        cross join lateral (
          select jsonb_array_elements_text(case when jsonb_typeof((b.row).attributes->key) = 'array' then (b.row).attributes->key else '[]'::jsonb end)
          union all
          select (b.row).attributes->>key where jsonb_typeof((b.row).attributes->key) in ('string', 'number', 'boolean')
        ) as v(value)
        where laria_private.catalog_filter_ok(b.row, filters, key)
        group by v.value) c), '{}') as counts
      from unnest(coalesce(p_attribute_keys, '{}')) as key) a), '{}')
  ) into result;
  return result;
end;
$$;
revoke all on function public.catalog_facets(jsonb, text, text[]) from public;
grant execute on function public.catalog_facets(jsonb, text, text[]) to anon, authenticated;

create or replace function public.catalog_brand_counts()
returns table (category text, brand text, listings bigint)
language sql
stable
security definer
set search_path = public
as $$
  select l.category, mode() within group (order by trim(l.brand)), count(*)
  from public.listings l
  where l.status = 'approved' and (l.stock_state is null or l.stock_state = 'in_stock') and public.listing_is_public(l.id)
    and nullif(trim(l.brand), '') is not null
  group by l.category, public.catalog_fold(trim(l.brand))
  order by 1, 3 desc, 2
$$;
revoke all on function public.catalog_brand_counts() from public;
grant execute on function public.catalog_brand_counts() to anon, authenticated;

create or replace function public.catalog_type_counts()
returns table (category text, instrument_type text, listings bigint)
language sql
stable
security definer
set search_path = public
as $$
  select l.category, l.instrument_type, count(*)
  from public.listings l
  where l.status = 'approved' and (l.stock_state is null or l.stock_state = 'in_stock') and public.listing_is_public(l.id)
  group by 1, 2
  order by 1, 2
$$;
revoke all on function public.catalog_type_counts() from public;
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
    where l.status = 'approved' and (l.stock_state is null or l.stock_state = 'in_stock') and public.listing_is_public(l.id)
      and nullif(trim(l.brand), '') is not null
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

drop function if exists public.catalog_search_ids(text);
drop function if exists public.catalog_search_condition(text);
drop index if exists public.listings_search_text_trgm_idx;
