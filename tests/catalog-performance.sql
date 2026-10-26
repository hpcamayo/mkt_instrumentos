-- Catalog read performance (supabase/migrations/20261111120000_catalog_read_performance.sql): the rewritten policies,
-- search, facets, counts and suggestions give exactly the previous results. The previous definitions, copied verbatim
-- from 20261101120000_ux_find_search.sql, are recreated in a scratch schema and compared with the new ones over a
-- seeded catalog with every visibility case. Everything runs in one transaction and is rolled back.
begin;

create schema catalog_perf_old;
grant usage on schema catalog_perf_old to anon, authenticated;

create or replace function catalog_perf_old.catalog_search(p_q text)
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

create or replace function catalog_perf_old.catalog_facets(p_filters jsonb, p_q text default null, p_attribute_keys text[] default '{}')
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

create or replace function catalog_perf_old.catalog_brand_counts()
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

create or replace function catalog_perf_old.catalog_type_counts()
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

create or replace function catalog_perf_old.catalog_suggest(p_q text, p_limit integer default 6)
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

grant execute on all functions in schema catalog_perf_old to anon, authenticated;

-- ------------------------------------------------------------------------------------------------------------ seed

set local session_replication_role = replica;
insert into public.stores (id, name, slug, status, is_verified, whatsapp_phone, city, region)
select ('9e100000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Tienda QA ' || n, 'tienda-qa-perf-' || n,
  (array['active', 'active', 'active', 'pending', 'hidden', 'rejected'])[1 + n % 6]::public.store_status,
  n % 2 = 0, '5199000' || lpad(n::text, 4, '0'),
  (array['Lima', 'Arequipa', 'Cusco', 'Chimbote'])[1 + n % 4], 'Peru'
from generate_series(1, 12) n;

insert into public.listings (id, store_id, seller_type, status, title, slug, description, category, instrument_type,
  attributes, brand, model, condition, price_pen, city, region, whatsapp_phone, published_at, stock_state)
select ('9f100000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  case when n % 3 = 0 then ('9e100000-0000-4000-8000-' || lpad((1 + n % 12)::text, 12, '0'))::uuid end,
  (case when n % 3 = 0 then 'store' else 'individual' end)::public.seller_type,
  (array['approved', 'approved', 'approved', 'approved', 'approved', 'pending', 'hidden', 'sold', 'rejected', 'draft'])[1 + n % 10]::public.listing_status,
  (array['Guitarra eléctrica', 'Bajo eléctrico', 'Micrófono dinámico', 'Pedal de distorsión', 'Amplificador combo', 'Cajón peruano', 'Teclado 61 teclas'])[1 + n % 7]
    || ' ' || (array['Fender', 'fender ', 'Ibanez', 'Shure', 'Boss', 'Marshall', 'Yamaha', 'Gibson', 'Focusrite', '% Rara_'])[1 + n % 10]
    || ' ' || (array['Stratocaster', 'Telecaster', 'SM58', 'DS-1', 'Les Paul', 'Scarlett 2i2', 'PSR', ''])[1 + n % 8] || ' ' || n,
  'qa-perf-' || n, 'Instrumento de prueba para comparar el catálogo.',
  (array['guitars', 'basses', 'microphones', 'pedals', 'amplifiers', 'percussion', 'keyboards'])[1 + n % 7],
  (array['electric_guitar', 'electric_bass', 'microphones', 'distortion', 'combo', null, 'keyboard'])[1 + n % 7],
  case n % 5
    when 0 then '{"pickups": "hh", "strings": "6"}'::jsonb
    when 1 then '{"pickups": "sss", "connection": ["xlr", "usb"]}'::jsonb
    when 2 then '{"strings": "5", "true_bypass": "yes"}'::jsonb
    when 3 then '{"microphone_type": "dynamic", "connection": ["xlr"]}'::jsonb
    else '{}'::jsonb end,
  case when n % 17 = 0 then null when n % 23 = 0 then '  ' else
    (array['Fender', 'fender ', 'Ibanez', 'Shure', 'Boss', 'Marshall', 'Yamaha', 'Gibson', 'Focusrite', '% Rara_'])[1 + n % 10] end,
  nullif((array['Stratocaster', 'Telecaster', 'SM58', 'DS-1', 'Les Paul', 'Scarlett 2i2', 'PSR', ''])[1 + n % 8], ''),
  -- The condition scale of 20261202120000 (sell-10).
  (array['Nuevo', 'Como nuevo', 'Muy bueno', 'Bueno'])[1 + n % 4],
  case when n % 19 = 0 then null else 100 + (n * 37) % 4900 end,
  (array['Lima', 'Lima', 'Arequipa', 'Cusco', 'Trujillo', 'Chimbote', 'Iquitos'])[1 + n % 7], 'Peru',
  '5199100' || lpad(n::text, 4, '0'), now() - (n || ' hours')::interval,
  case when n % 3 = 0 then (case when n % 4 = 0 then 'out_of_stock' else 'in_stock' end) end
from generate_series(1, 700) n;

insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/qa-perf/' || l.slug || '-' || p || '.jpg', p
from public.listings l, generate_series(0, 1) p where l.slug like 'qa-perf-%';
set local session_replication_role = origin;
analyze public.listings;

-- What listing_is_public says for each seeded listing, read by the role tests below.
create table catalog_perf_old.expected as
select l.id, public.listing_is_public(l.id) as public from public.listings l where l.slug like 'qa-perf-%';
grant select on catalog_perf_old.expected to anon, authenticated;

do $$
begin
  if (select count(*) filter (where public) from catalog_perf_old.expected) < 150
    or (select count(*) filter (where not public) from catalog_perf_old.expected) < 150 then
    raise exception 'The seed does not cover public and hidden listings';
  end if;
end;
$$;

-- --------------------------------------------------------------------------------- visibility and search, per role

create or replace function catalog_perf_old.check_role(p_role text) returns void language plpgsql as $$
declare
  word text;
  queries text[] := array['fender', 'strato', 'guitarra', 'guitara', 'bajo ibanez', 'lp', 'amp marshall', 'microfono shure',
    'micrófono', 'yamah', 'pedal boss ds-1', 'xyznothing', 'de la', 'sm58', 'telecastr', 'cajon', 'Cajón', 'acustica', '2i2',
    'les paul', 'fendr stratocastr', 'ibanes', '%', '_', 'rara_', '100%', 'a', '   ', ''];
begin
  if exists (select id from public.listings where slug like 'qa-perf-%'
             except select id from catalog_perf_old.expected where public)
    or exists (select id from catalog_perf_old.expected where public
               except select id from public.listings where slug like 'qa-perf-%') then
    raise exception '%: the listings policy differs from listing_is_public', p_role;
  end if;
  if exists (select listing_id from public.listing_photos where image_url like 'https://example.invalid/qa-perf/%'
             except select id from catalog_perf_old.expected where public)
    or (select count(*) from public.listing_photos where image_url like 'https://example.invalid/qa-perf/%')
       <> 2 * (select count(*) from catalog_perf_old.expected where public) then
    raise exception '%: the photos policy differs from listing_is_public', p_role;
  end if;
  foreach word in array queries loop
    if (select array_agg(id order by id) from catalog_perf_old.catalog_search(word))
       is distinct from (select array_agg(id order by id) from public.catalog_search(word)) then
      raise exception '%: catalog_search(%) differs from the previous rule', p_role, quote_literal(word);
    end if;
    if exists (select i from public.catalog_search_ids(word) i except select id from public.listings) then
      raise exception '%: catalog_search_ids(%) returned a listing this role cannot read', p_role, quote_literal(word);
    end if;
  end loop;
end;
$$;
grant execute on function catalog_perf_old.check_role(text) to anon, authenticated;

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select catalog_perf_old.check_role('anon');
reset role;

-- A signed-in member who owns nothing sees exactly the public listings too.
set local role authenticated;
select set_config('request.jwt.claims', '{"role": "authenticated", "sub": "00000000-0000-4000-8000-0000000000aa"}', true);
select catalog_perf_old.check_role('authenticated');
reset role;
select set_config('request.jwt.claims', '', true);

-- -------------------------------------------------------------------------------- facets, counts and suggestions

do $$
declare
  q text;
  f record;
  old_facets jsonb;
  new_facets jsonb;
  queries text[] := array[null, '', 'fender', 'strato', 'guitara', 'bajo ibanez', 'lp', 'microfono', 'de la', 'xyznothing', 'rara_'];
begin
  for f in select * from (values
      ('{}'::jsonb, '{}'::text[]),
      ('{"category": "guitars"}', '{pickups,strings,connection}'),
      ('{"category": "guitars", "instrument_type": "electric_guitar", "advanced": {"pickups": "hh"}}', '{pickups,strings}'),
      ('{"advanced": {"connection": ["xlr"], "microphone_type": "dynamic"}}', '{connection,microphone_type,pickups}'),
      ('{"advanced": {"connection": "usb"}}', '{connection}'),
      ('{"cities": ["Lima", "Arequipa"], "conditions": ["Nuevo", "Muy bueno"]}', '{}'),
      ('{"brand": "fen", "min_price": 500, "max_price": 3000}', '{}'),
      ('{"brand": "%"}', '{}'),
      ('{"brand": "rara_"}', '{}'),
      ('{"min_price": 4000}', '{}'),
      ('{"seller_type": "verified_store"}', '{}'),
      ('{"seller_type": "store", "category": "pedals"}', '{strings,true_bypass}'),
      ('{"seller_type": "individual", "cities": ["Chimbote"]}', '{}'),
      ('{"seller_type": "bogus"}', '{}'),
      ('{"category": "basses", "advanced": {"strings": "5"}, "min_price": 100}', '{strings,pickups}'),
      ('{"cities": ["Nowhere"]}', '{}')
    ) as cases(filters, keys)
  loop
    foreach q in array queries loop
      old_facets := catalog_perf_old.catalog_facets(f.filters, q, f.keys);
      new_facets := public.catalog_facets(f.filters, q, f.keys);
      -- The previous brand list cut at 30 without a tie-break; the new one breaks ties by name. Same counts, and every
      -- listed brand with its previous count. "options" is new (20261202120400, listing flags).
      if (old_facets - 'brands') is distinct from (new_facets - 'brands' - 'options') then
        raise exception 'catalog_facets(%, %) differs: % against %', f.filters, q, old_facets - 'brands', new_facets - 'brands' - 'options';
      end if;
      if (select array_agg((b->>'count')::int order by (b->>'count')::int desc) from jsonb_array_elements(old_facets->'brands') b)
         is distinct from (select array_agg((b->>'count')::int order by (b->>'count')::int desc) from jsonb_array_elements(new_facets->'brands') b) then
        raise exception 'catalog_facets(%, %) brand counts differ', f.filters, q;
      end if;
      if jsonb_array_length(old_facets->'brands') < 30 and old_facets->'brands' is distinct from new_facets->'brands' then
        raise exception 'catalog_facets(%, %) brands differ', f.filters, q;
      end if;
    end loop;
  end loop;

  if (select array_agg(row(c.*)::text order by c.category, c.brand) from catalog_perf_old.catalog_brand_counts() c)
     is distinct from (select array_agg(row(c.*)::text order by c.category, c.brand) from public.catalog_brand_counts() c) then
    raise exception 'catalog_brand_counts differs';
  end if;
  if (select array_agg(row(c.*)::text order by c.category, c.instrument_type) from catalog_perf_old.catalog_type_counts() c)
     is distinct from (select array_agg(row(c.*)::text order by c.category, c.instrument_type) from public.catalog_type_counts() c) then
    raise exception 'catalog_type_counts differs';
  end if;
  foreach q in array array['f', 'fe', 'fen', 'FENDER', 'fender strat', 'ibanes', 'shure sm', 'boss ds', 'scarlett', 'rara', '%', '_', 'zz', ''] loop
    if (select array_agg(row(s.*)::text) from catalog_perf_old.catalog_suggest(q, 6) s)
       is distinct from (select array_agg(row(s.*)::text) from public.catalog_suggest(q, 6) s) then
      raise exception 'catalog_suggest(%) differs', quote_literal(q);
    end if;
  end loop;
end;
$$;

-- Each facet is counted without its own filter, and only from listings that pass every other filter.
do $$
declare
  facets jsonb := public.catalog_facets('{"category": "guitars", "cities": ["Lima"]}', null, '{}');
begin
  if (facets->>'total')::int <> (facets->'category'->>'guitars')::int then raise exception 'The total ignores the category filter'; end if;
  if (select count(*) from jsonb_object_keys(facets->'category')) < 2 then raise exception 'The category facet excluded other categories'; end if;
  if (select sum((x->>'count')::int) from jsonb_array_elements(facets->'locations') x)
     <> (select sum(value::int) from jsonb_each_text(public.catalog_facets('{"category": "guitars"}', null, '{}')->'category') where key = 'guitars') then
    raise exception 'The location facet is not counted within the chosen category';
  end if;
  -- Out of stock and hidden-store listings are never counted.
  if (facets->>'total')::int <> (select count(*) from public.listings l join catalog_perf_old.expected e on e.id = l.id
      where e.public and l.category = 'guitars' and l.city = 'Lima' and l.stock_state is distinct from 'out_of_stock') then
    raise exception 'The total counts listings that are not public or are out of stock';
  end if;
end;
$$;

-- --------------------------------------------------------------------------------------------- input and the index

do $$
begin
  begin
    perform public.catalog_facets('{"min_price": "cien"}', null, '{}');
    raise exception 'A non-numeric price was accepted';
  exception when others then
    if sqlerrm <> 'CATALOG_FILTERS_INVALID' then raise; end if;
  end;
  begin
    perform public.catalog_facets('{"cities": "Lima"}', null, '{}');
    raise exception 'A city that is not a list was accepted';
  exception when others then
    if sqlerrm <> 'CATALOG_FILTERS_INVALID' then raise; end if;
  end;
  begin
    perform public.catalog_search_ids(repeat('a', 201));
    raise exception 'An over-long search was accepted';
  exception when others then
    if sqlerrm <> 'CATALOG_FILTERS_INVALID' then raise; end if;
  end;
  if (select count(*) from public.catalog_suggest('f', 6)) <> 0 then raise exception 'A one-letter suggestion query ran'; end if;
end;
$$;

-- The search condition can be answered by the trigram index. A table this small is cheaper to read through other
-- indexes, so they and plain scans are set aside for this check (the transaction is rolled back).
do $$
declare
  line text;
  plan text := '';
  other regclass;
begin
  for other in select indexrelid::regclass from pg_index
    where indrelid = 'public.listings'::regclass and not indisunique and indexrelid <> 'public.listings_search_text_trgm_idx'::regclass loop
    execute format('drop index %s', other);
  end loop;
  set local enable_seqscan = off;
  for line in execute format('explain select l.id from public.listings l where l.status = ''approved'' and %s', public.catalog_search_condition('fender strato')) loop
    plan := plan || line || E'\n';
  end loop;
  if plan not like '%Bitmap Index Scan on listings_search_text_trgm_idx%' then raise exception 'The search cannot use its index: %', plan; end if;
  if public.catalog_search_condition('   ') <> 'true' then raise exception 'An empty query must match everything'; end if;
end;
$$;

-- A store that becomes active shows its approved listings at once, through the policy (no cached visibility).
select set_config('app.allow_store_admin_fields', 'true', true);
update public.stores set status = 'active' where id = '9e100000-0000-4000-8000-000000000004';
set local role anon;
do $$
declare
  store uuid := '9e100000-0000-4000-8000-000000000004';
  approved bigint;
begin
  select count(*) into approved from public.listings l where l.store_id = store;
  if approved = 0 then raise exception 'The activated store listings are missing'; end if;
  if (select count(*) from public.catalog_search('') where store_id = store) <> approved
    or (select count(*) from public.catalog_search_ids('') i join public.listings l on l.id = i where l.store_id = store) <> approved then
    raise exception 'Search and visibility disagree after activation';
  end if;
end;
$$;
reset role;

rollback;
