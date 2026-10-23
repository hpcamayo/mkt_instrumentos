-- Effortless Laria, batch "find" (docs/ux-effortless/find.md): search, filter counts, sort orders, menus from real
-- listings and the gone-listing page. Read-only helpers over public listings; nothing here changes a listing.
--
-- BIG 03 / FIND 03: one search box over title, brand, model, type and category that ignores accents, forgives a typo
--   or two (pg_trgm word similarity) and knows gear slang (public.search_synonyms). catalog_search() returns listings, so
--   PostgREST keeps applying the catalog's filters, embeds, order and range on top of it; catalog_suggest() feeds the
--   suggestions under the box.
-- FIND 05 / 06 / 07 / 08: catalog_facets() counts every filter option (each facet ignores its own filter), the cities
--   that really have listings and the price spread; catalog_brand_counts() and catalog_type_counts() feed the menus and
--   landings with brands and types that have listings.
-- FIND 10: the computed field seller_verified_rank gives the "Tiendas verificadas primero" order. "Bajaron de precio" and
--   the "Antes S/" line use the listing batch's real drops (20261102140000) through recent_price_drop_at
--   (20261109120000), so the card, the listing page and the order always agree.
-- FIND 16: listing_gone_hint() says only the category and type of a listing that was public and no longer is.
-- FIND 04: saved search alerts accept the free-text query ("query"), matched with the same rule as the catalog.

-- ------------------------------------------------------------------------------------------------ search document

-- The words a listing is found by: title, brand, model, its type value and the Spanish words of its category, folded
-- like the catalog lookup (lowercase, no accents; public.catalog_fold).
create or replace function public.listing_search_text(
  p_title text, p_brand text, p_model text, p_category text, p_instrument_type text
)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select public.catalog_fold(concat_ws(' ',
    p_title, p_brand, p_model, replace(coalesce(p_instrument_type, ''), '_', ' '),
    case p_category
      when 'guitars' then 'guitarra guitarras'
      when 'basses' then 'bajo bajos'
      when 'keyboards' then 'teclado teclados piano pianos'
      when 'percussion' then 'percusion bateria baterias'
      when 'winds' then 'viento vientos'
      when 'strings' then 'cuerdas'
      when 'pedals' then 'pedal pedales efecto efectos'
      when 'amplifiers' then 'amplificador amplificadores'
      when 'microphones' then 'microfono microfonos'
      when 'audio' then 'audio'
    end))
$$;

-- Gear slang and common spellings: a query word (folded) and what it also means. Curated, small, public read-only.
create table if not exists public.search_synonyms (
  term text primary key check (term = public.catalog_fold(term) and term ~ '^[a-z0-9]+$'),
  expansions text[] not null check (cardinality(expansions) between 1 and 8)
);
alter table public.search_synonyms enable row level security;
drop policy if exists "Anyone can read search synonyms" on public.search_synonyms;
create policy "Anyone can read search synonyms" on public.search_synonyms for select to anon, authenticated using (true);
revoke all on public.search_synonyms from anon, authenticated;
grant select on public.search_synonyms to anon, authenticated;

insert into public.search_synonyms (term, expansions) values
  ('strato', array['stratocaster']), ('strat', array['stratocaster']), ('tele', array['telecaster']),
  ('lp', array['les paul']), ('lespaul', array['les paul']), ('jazzmaster', array['jazz master']),
  ('pbass', array['precision']), ('jbass', array['jazz bass']), ('jazzbass', array['jazz bass']),
  ('amp', array['amplificador', 'amplifier']), ('ampli', array['amplificador']), ('amplis', array['amplificador']),
  ('cabezal', array['amplificador', 'head']), ('combo', array['amplificador']),
  ('bass', array['bajo']), ('bajo', array['bass']), ('bajos', array['bass']),
  ('guitar', array['guitarra']), ('guitarra', array['guitar']), ('guitarras', array['guitar']),
  ('electrica', array['electric']), ('electricas', array['electric']), ('acustica', array['acoustic']),
  ('acusticas', array['acoustic']), ('electroacustica', array['acoustic']), ('criolla', array['clasica', 'acoustic']),
  ('drums', array['bateria']), ('bateria', array['drums']), ('platillo', array['cymbals', 'platillos']),
  ('platillos', array['cymbals']), ('cymbal', array['platillo']),
  ('pedal', array['pedals']), ('pedales', array['pedals']), ('efecto', array['pedal']), ('pedalera', array['pedal', 'multiefecto']),
  ('mic', array['microfono']), ('micro', array['microfono']), ('microfono', array['microphone']),
  ('interface', array['interfaz']), ('interfaz', array['interface']), ('tarjeta', array['interfaz']),
  ('keyboard', array['teclado']), ('teclado', array['keyboard']), ('synth', array['sintetizador']),
  ('sinte', array['sintetizador']), ('ukelele', array['ukulele']), ('violin', array['violin']),
  ('cajon', array['cajon']), ('distor', array['distortion', 'distorsion']), ('distorsion', array['distortion']),
  ('overdrive', array['drive']), ('afinador', array['tuner']), ('tuner', array['afinador']),
  ('sax', array['saxofon', 'saxo']), ('saxo', array['saxofon']), ('mixer', array['mezcladora', 'consola']),
  ('consola', array['mixer', 'mezcladora']), ('parlante', array['altavoz', 'monitor']), ('monitores', array['monitor'])
on conflict (term) do update set expansions = excluded.expansions;

-- Query words (folded), without filler words. Capped at 8 words of 40 characters.
create or replace function public.search_query_words(p_query text)
returns text[]
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select coalesce(array_agg(word order by position), '{}')
  from (
    select left(word, 40) as word, position
    from regexp_split_to_table(public.catalog_fold(left(coalesce(p_query, ''), 200)), '[^a-z0-9]+') with ordinality as t(word, position)
    where word <> ''
      and word not in ('de', 'del', 'la', 'el', 'los', 'las', 'en', 'para', 'con', 'y', 'o', 'un', 'una', 'a', 'al', 'por', 'se', 'vendo')
    order by position
    limit 8
  ) words
$$;

-- A listing matches when every query word is in its text: as a substring (numbers, model codes), through a synonym,
-- or, for words of four letters or more, by trigram word similarity (one or two typos: "guitara", "yamah").
create or replace function public.listing_matches_query(p_text text, p_query text)
returns boolean
language sql
stable
parallel safe
set search_path = public, extensions
as $$
  select coalesce(bool_and(
    strpos(p_text, word) > 0
    or exists (select 1 from public.search_synonyms s, unnest(s.expansions) e where s.term = word and strpos(p_text, e) > 0)
    or (length(word) >= 4 and extensions.word_similarity(word, p_text) >= 0.55)
  ), true)
  from unnest(public.search_query_words(p_query)) as word
$$;

-- The catalog's free-text search: listings whose text matches the query. Security invoker: row-level security decides
-- what the caller sees, and the catalog adds its own status, stock and filter conditions on top.
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
grant execute on function public.listing_search_text(text, text, text, text, text) to anon, authenticated;
grant execute on function public.listing_matches_query(text, text) to anon, authenticated;
grant execute on function public.search_query_words(text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------- computed fields

-- 1 for a listing of an active verified store, else 0: "Tiendas verificadas primero".
create or replace function public.seller_verified_rank(p_listing public.listings)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when p_listing.seller_type = 'store' and exists (
    select 1 from public.stores s where s.id = p_listing.store_id and s.status = 'active' and s.is_verified
  ) then 1 else 0 end
$$;

revoke all on function public.seller_verified_rank(public.listings) from public;
grant execute on function public.seller_verified_rank(public.listings) to anon, authenticated;

-- ------------------------------------------------------------------------------------------------------- facets

-- Does a public listing pass the catalog filters, ignoring one facet (p_except)? The filters are the catalog's own
-- (lib/catalog-facets.ts builds them): category, instrument_type, conditions[], cities[], brand, seller_type, min_price,
-- max_price and advanced {key: value | [values]}.
create or replace function laria_private.catalog_filter_ok(p_listing public.listings, p_filters jsonb, p_except text)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    (p_except = 'category' or not (p_filters ? 'category') or p_listing.category = p_filters->>'category')
    and (p_except = 'instrument_type' or not (p_filters ? 'instrument_type') or p_listing.instrument_type = p_filters->>'instrument_type')
    and (p_except = 'condition' or coalesce(jsonb_array_length(p_filters->'conditions'), 0) = 0
      or p_listing.condition in (select jsonb_array_elements_text(p_filters->'conditions')))
    and (p_except = 'location' or coalesce(jsonb_array_length(p_filters->'cities'), 0) = 0
      or p_listing.city in (select jsonb_array_elements_text(p_filters->'cities')))
    and (p_except = 'brand' or not (p_filters ? 'brand') or coalesce(p_listing.brand, '') ilike '%' || (p_filters->>'brand') || '%')
    and (p_except = 'price' or not (p_filters ? 'min_price') or p_listing.price_pen >= (p_filters->>'min_price')::numeric)
    and (p_except = 'price' or not (p_filters ? 'max_price') or p_listing.price_pen <= (p_filters->>'max_price')::numeric)
    and (
      p_except = 'seller_type' or not (p_filters ? 'seller_type')
      or (p_filters->>'seller_type' in ('individual', 'store') and p_listing.seller_type::text = p_filters->>'seller_type')
      or (p_filters->>'seller_type' = 'verified_store' and public.seller_verified_rank(p_listing) = 1)
    )
    and not exists (
      select 1 from jsonb_each(coalesce(p_filters->'advanced', '{}'::jsonb)) filter
      where filter.key <> p_except
        and not (coalesce(p_listing.attributes, '{}'::jsonb) @> jsonb_build_object(filter.key, filter.value))
    )
$$;

revoke all on function laria_private.catalog_filter_ok(public.listings, jsonb, text) from public, anon, authenticated;

-- Counts for the catalog's filters, each facet counted without its own filter, so every option says how many results
-- choosing it gives: {total, category, instrument_type, condition, seller_type, locations: [{city, region, count}],
-- brands: [{brand, count}], price: {min, max, low, high}, advanced: {key: {value: count}}}. p_attribute_keys names the
-- attributes shown (the chosen type's). Public listings only, with stock (design §5.2), whoever calls.
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

-- Brands and types that have public listings with stock, per category: the menus and landings (FIND 06).
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

revoke all on function public.catalog_brand_counts() from public;
revoke all on function public.catalog_type_counts() from public;
grant execute on function public.catalog_brand_counts() to anon, authenticated;
grant execute on function public.catalog_type_counts() to anon, authenticated;

-- Suggestions under the search box (FIND 03): brands and brand + model pairs that have public listings, with counts.
-- A suggestion matches when the typed text starts a word of it, is inside it, or is a near spelling.
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

-- ------------------------------------------------------------------------------------------------- gone listings

-- FIND 16: for a listing address that once showed a public listing and no longer does, only its category and type, so
-- the page can point to similar live listings. Nothing else about it is returned, and never for a listing that was
-- never public (pending or rejected), nor for one that is still public.
create or replace function public.listing_gone_hint(p_slug text)
returns table (category text, instrument_type text)
language sql
stable
security definer
set search_path = public
as $$
  select l.category, l.instrument_type
  from public.listings l
  where p_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(p_slug) <= 200
    and l.slug = p_slug
    and l.status in ('approved', 'hidden', 'sold')
    and l.published_at is not null
    and not public.listing_is_public(l.id)
  limit 1
$$;

revoke all on function public.listing_gone_hint(text) from public;
grant execute on function public.listing_gone_hint(text) to anon, authenticated;

-- ------------------------------------------------------------------------- saved searches with a free-text query

-- Sprint 7's normalization (as updated on 12 Oct 2026) accepts "query": up to 200 characters, kept trimmed. Rewritten
-- from the current definition with exact old → new replacements, as in 20261029120200_review_fixes_alerts_and_import.sql.
create function pg_temp.find_fix(p_function regprocedure, variadic p_edits text[])
returns void
language plpgsql
as $$
declare
  definition text := pg_get_functiondef(p_function);
  edit integer;
begin
  for edit in 1 .. cardinality(p_edits) by 2 loop
    if (length(definition) - length(replace(definition, p_edits[edit], ''))) / length(p_edits[edit]) <> 1 then
      raise exception 'find_fix(%): expected exactly one occurrence of %', p_function, p_edits[edit];
    end if;
    definition := replace(definition, p_edits[edit], p_edits[edit + 1]);
  end loop;
  execute definition;
end;
$$;

select pg_temp.find_fix('laria_private.normalize_saved_search(jsonb)',
  $old$where key not in ('category','location','condition','brand','seller_type','instrument_type','min_price','max_price','advanced')$old$,
  $new$where key not in ('category','location','condition','brand','seller_type','instrument_type','min_price','max_price','advanced','query')$new$,
  $old$  if p_filters ? 'seller_type' then$old$,
  $new$  if p_filters ? 'query' then
    if jsonb_typeof(p_filters->'query') <> 'string' then raise exception 'ALERT_FILTERS_INVALID'; end if;
    string_value := nullif(trim(p_filters->>'query'), '');
    if string_value is not null and length(string_value) > 200 then raise exception 'ALERT_FILTERS_INVALID'; end if;
    if string_value is not null then result := result || jsonb_build_object('query', string_value); end if;
  end if;
  if p_filters ? 'seller_type' then$new$);

-- The same query in another case is the same alert.
select pg_temp.find_fix('laria_private.saved_search_hash(jsonb)',
  $old$    case when p_filters ? 'brand'
      then (p_filters || jsonb_build_object('brand', lower(p_filters->>'brand')))::text
      else p_filters::text
    end,$old$,
  $new$    (p_filters
      || case when p_filters ? 'brand' then jsonb_build_object('brand', lower(p_filters->>'brand')) else '{}'::jsonb end
      || case when p_filters ? 'query' then jsonb_build_object('query', lower(p_filters->>'query')) else '{}'::jsonb end)::text,$new$);

select pg_temp.find_fix('laria_private.listing_matches_saved_search(public.listings,jsonb)',
  $old$    and (not (p_filters ? 'brand') or coalesce(p_listing.brand, '') ilike '%' || (p_filters->>'brand') || '%')$old$,
  $new$    and (not (p_filters ? 'brand') or coalesce(p_listing.brand, '') ilike '%' || (p_filters->>'brand') || '%')
    and (not (p_filters ? 'query') or public.listing_matches_query(
      public.listing_search_text(p_listing.title, p_listing.brand, p_listing.model, p_listing.category, p_listing.instrument_type),
      p_filters->>'query'))$new$);
