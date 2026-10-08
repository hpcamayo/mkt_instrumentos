-- Canonical catalog (roadmap Phase 4.2, 2026-09-29): store codes. On top of 4.1 (explained tokens):
--   * a store code made of a candidate's code or SKU plus a 2-4 character suffix that starts with a letter explains
--     itself (PDP PDNY0514SS + PR, Casio CT-S410 + C2, AP-750 + GB: finish and region suffixes); one letter does not
--     (Jackson JS32 and JS32Q are two models); the suffix must be glued inside the code's last token and must not be
--     an identity word ('EK-50 CSA II', 'ATH-W5000 2013+' where '+' compacts to 'plus');
--   * a candidate the search warned 'unexplained_code:<tok>' loses the full 0.45 (not 0.03) when another candidate
--     explains that code: several Meinl 'Rawhide Maracas' share a name, and the one whose SKU is MSM3CU wins;
--   * sizes are not codes ('14"16"20"', "14''x6''");
--   * the candidate search finds a product by its code or SKU plus such a suffix (a strong 'model_code' hit), and a
--     product's own variant SKUs explain a store code whether or not the product has a model code (3.4 checked SKUs
--     only for coded products, so Meinl 'Rawhide Maracas', whose SKUs include MSM3CU, was warned on its own SKU).
-- A maker's article number the catalog does not carry ('Bravo III 72 A16622') still blocks automatic approval: it
-- cannot be told apart from a model code the catalog lacks (Yamaha PA012 is a specific Pacifica).
-- Only the function bodies change. Local only; goes to production with the other catalog migrations after review.

-- ------------------------------------------------------------------------------------ candidate search (unchanged
-- apart from the '+' / synonym tokens and distinct alias tokens; see 20260930120000_catalog_lookup_code_conflict.sql)
create or replace function public.catalog_lookup_candidates(
  query text,
  manufacturer_hint text default null,
  max_results integer default 8
)
returns table (
  product_id uuid,
  manufacturer text,
  model text,
  category_id text,
  category_label_es text,
  entity_level text,
  introduction_year smallint,
  discontinuation_year smallint,
  verification_status public.catalog_verification_status,
  quality_status text,
  publish_ready boolean,
  confidence numeric,
  match_type text,
  matched_text text,
  category_intent text,
  warning text,
  score numeric
)
language plpgsql
stable
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  -- 4.1: a spaced '+' is 'and' ('Pearl D1500TGL + cable'), unlike a glued one ('az2203nt+', a product version)
  q text := public.catalog_normalize(regexp_replace(regexp_replace(query, '(^|\s)(10|9|8)\s*/\s*10(\s|$)', ' ', 'g'),
                                                    '\s\+(\s|$)', ' y ', 'g'));
  toks text[] := string_to_array(q, ' ');
  qtoks text[];
  n int := coalesce(array_length(toks, 1), 0);
  grams text[] := '{}';
  gends int[] := '{}';
  gtexts text[] := '{}';
  pflag text[] := '{}';
  intents text[];
  qcodes text[];
  nx text; af text;
  i int; j int;
begin
  if n = 0 then
    return;
  end if;
  for i in 1..n loop
    nx := toks[i + 1];
    af := toks[i + 2];
    if nx ~ '^(ii|iii|iv|vi|mk[0-9]+|mkii+|mark[0-9]+|v[0-9]+|[0-9]{1,3}(\.[0-9]+)?\+?|plus|\+|pro\+?|xl|xd|mini|jr|deluxe|dlx)$'
       and not (nx ~ '^[0-9]' and coalesce(af, '') ~ '^(cuerpos|piezas|pzas|pz|cuerdas|teclas|canales|ch|watts|w|wts|metros|m|pulgadas|in|anos|meses|dias|x|unidades|pads|zonas|bandas|botones|pedales|tambores|platillos|octavas|voces|vias|soles|sol|dolares|usd|lucas|mil|s)$') then
      pflag := pflag || ('unexplained_token:' || nx);
    else
      pflag := pflag || null::text;
    end if;
  end loop;
  for i in 1..n loop
    for j in i..least(n, i + 4) loop
      grams := grams || public.catalog_compact(array_to_string(toks[i:j], ' '));
      gends := gends || j;
      if j - i between 1 and 3 then
        gtexts := gtexts || array_to_string(toks[i:j], ' ');
      end if;
    end loop;
  end loop;
  if n <= 2 then
    gtexts := gtexts || q;
  end if;
  select array_agg(distinct t) into qtoks from (
    select unnest(toks) as t
    union all
    select x || 'in' from unnest(toks) x where x ~ '^[0-9]{1,2}(\.[0-9])?$' and x::numeric between 6 and 30
    union all  -- 4.1: 'cabezal' also counts as 'head'
    select s.target from unnest(toks) x join public.catalog_lookup_terms s on s.kind = 'synonym' and s.term = x
  ) s;
  select array_agg(distinct t) into qcodes
  from unnest(toks) t
  where length(t) >= 4 and t ~ '[a-z]' and t ~ '[0-9]' and t ~ '^[a-z0-9]+$'
    and t !~ '^[0-9]+(v|vac|w|wts|watts|hz|khz|mm|cm|kg|in|ch|x[0-9]+|da|ra|ro|do|to|vo|mo|no|gb|mb)$'
    -- 4.2: sizes are not codes ('14"16"20"' -> 14in16in20in, "14''x6''" -> 14inx6in)
    and t !~ '^([0-9]+(\.[0-9]+)?in)+[0-9]*$' and t !~ '^[0-9.]+(in)?x[0-9.]+(in)?$'
    and not exists (select 1 from public.catalog_manufacturer_aliases ma where ma.alias_key = t);
  select array_agg(ct.category_id order by length(ct.term) desc) into intents
  from public.catalog_category_terms ct
  where (' ' || q || ' ') like ('% ' || ct.term || ' %');

  return query
  with mentioned as (
    select distinct ma.manufacturer_id
    from public.catalog_manufacturer_aliases ma
    where length(ma.alias_key) >= 3 and ma.alias_key = any(grams)
    union
    select ma.manufacturer_id from public.catalog_manufacturer_aliases ma
    where manufacturer_hint is not null and ma.alias_key = public.catalog_compact(manufacturer_hint)
  ),
  g as (
    select * from unnest(grams, gends) as g(k, e)
  ),
  exact as (
    select a.product_id, a.alias as matched, a.alias_key,
           case when a.alias_type = 'manufacturer_prefixed' then 'exact_alias_with_brand' else 'exact_alias' end as mtype,
           1.0::numeric as quality, a.confidence, a.is_ambiguous,
           coalesce(array_length(string_to_array(a.normalized_alias, ' '), 1), 1) as ntok, pflag[g.e] as warn
    from g join public.catalog_product_aliases a on a.alias_key = g.k
    where length(a.alias_key) >= 3
  ),
  tokenset as (
    select a.product_id, a.alias as matched, a.alias_key, 'alias_tokens'::text as mtype,
           0.95::numeric as quality, a.confidence, a.is_ambiguous,
           -- 4.1: repeated words count once ('korg nautilus korg nautilus at')
           (select count(distinct w)::int from unnest(string_to_array(a.normalized_alias, ' ')) w) as ntok,
           pflag[array_position(toks, (string_to_array(a.normalized_alias, ' '))[array_length(string_to_array(a.normalized_alias, ' '), 1)])] as warn
    from public.catalog_product_aliases a
    where string_to_array(a.normalized_alias, ' ') <@ qtoks
      and array_length(string_to_array(a.normalized_alias, ' '), 1) >= 2
      and length(a.alias_key) >= 4
  ),
  code as (
    select p.id as product_id, p.model_code as matched, p.model_code_key as alias_key,
           'model_code'::text as mtype, 0.85::numeric as quality, 0.9::numeric as confidence, false as is_ambiguous, 1 as ntok,
           pflag[g.e] as warn
    from g join public.catalog_products p on p.model_code_key = g.k
    where length(p.model_code_key) >= 3
  ),
  code_suffix as (  -- 4.2: a store code = a product's code or SKU + a 2-4 character suffix glued in the same token
                    -- (PDNY0514SS + PR, CT-S410 + C2); not a one-letter suffix, not an identity word ('II', '+' = plus)
    select distinct on (x.product_id) x.product_id, x.matched, x.key as alias_key, 'model_code'::text as mtype,
           0.85::numeric as quality, 0.9::numeric as confidence, false as is_ambiguous, 1 as ntok, null::text as warn
    from (  -- the gram minus a 2-4 character tail, looked up by equality (indexed)
      with gp as (select distinct g.k, left(g.k, length(g.k) - t) as pre from g, generate_series(2, 4) t
                  where length(g.k) - t >= 5)
      select p.id as product_id, p.model_code as matched, p.model_code_key as key, gp.k
      from gp join public.catalog_products p on p.model_code_key = gp.pre
      where p.model_code_key ~ '[0-9]' and p.model_code_key ~ '[a-z]'
      union all
      select v.product_id, v.sku, v.sku_key, gp.k
      from gp join public.catalog_product_variants v on v.sku_key = gp.pre
      where v.sku_key ~ '[0-9]' and v.sku_key ~ '[a-z]'
    ) x
    join g g2 on g2.k = x.k
    where length(x.k) - length(x.key) between 2 and 4
      and substr(x.k, length(x.key) + 1) ~ '^[a-z][a-z0-9]*$'
      and length(x.key) > length(x.k) - length(public.catalog_compact(toks[g2.e]))
      and substr(x.k, length(x.key) + 1) not in (select term from public.catalog_lookup_terms where kind = 'warn')
      and substr(x.k, length(x.key) + 1) <> 'plus'
      and substr(x.k, length(x.key) + 1) !~ '^(mk[0-9]+|v[0-9]+|gen[0-9]*)$'
    order by x.product_id, length(x.key) desc
  ),
  sku as (
    select distinct on (v.product_id) v.product_id, v.sku as matched, v.sku_key as alias_key,
           'sku'::text as mtype, 0.92::numeric as quality, 0.95::numeric as confidence, false as is_ambiguous, 2 as ntok,
           null::text as warn
    from g join public.catalog_product_variants v on v.sku_key = g.k
    where length(v.sku_key) >= 5
  ),
  fuzzy as (
    select f.product_id, f.matched, f.alias_key, 'fuzzy'::text as mtype,
           (0.75 * f.sim)::numeric as quality, f.confidence, f.is_ambiguous, f.ntok, null::text as warn
    from (
      select distinct on (a.id) a.product_id, a.alias as matched, a.alias_key, a.confidence, a.is_ambiguous,
             coalesce(array_length(string_to_array(a.normalized_alias, ' '), 1), 1) as ntok,
             greatest(similarity(a.normalized_alias, g), word_similarity(a.normalized_alias, q)) as sim
      from unnest(gtexts) g
      join public.catalog_product_aliases a on a.normalized_alias % g
      order by a.id, similarity(a.normalized_alias, g) desc
    ) f
    order by f.sim desc
    limit 150
  ),
  hits as (
    select h.*,
           (h.quality * h.confidence * case when h.is_ambiguous then 0.9 else 1 end
             + 0.05 * least(h.ntok, 8) + 0.01 * least(length(h.alias_key), 20))::numeric as base
    from (select * from exact union all select * from tokenset union all select * from code
          union all select * from code_suffix union all select * from sku union all select * from fuzzy) h
  ),
  best as (
    select distinct on (h.product_id) h.product_id, h.matched, h.alias_key, h.mtype, h.warn, h.base,
           coalesce(h.is_ambiguous, false) and h.mtype <> 'fuzzy' as ambiguous
    from hits h
    order by h.product_id, (h.mtype = 'fuzzy'), h.base desc, h.alias_key
  )
  select p.id, m.canonical_name, p.canonical_model_name, p.category_id, c.label_es, p.entity_level,
         p.introduction_year, p.discontinuation_year, p.verification_status, p.quality_status, p.publish_ready,
         p.confidence, b.mtype, b.matched, intents[1], coalesce(b.warn, 'unexplained_code:' || uc.tok),
         round((b.base
           - case when b.warn is not null then 0.45 when uc.tok is not null then 0.03 else 0 end
           + case when exists (select 1 from mentioned) and p.manufacturer_id in (select manufacturer_id from mentioned) then 0.25
                  when exists (select 1 from mentioned) then -0.30 else 0 end
           - case when b.ambiguous and p.manufacturer_id not in (select manufacturer_id from mentioned) then 0.25 else 0 end
           + case when intents is null or p.category_id is null then 0
                  when exists (select 1 from unnest(intents) it
                               where p.category_id like it || '%' or it like p.category_id || '%'
                                  or (split_part(it, '.', 1) = 'instruments'
                                      and split_part(it, '.', 1) || '.' || split_part(it, '.', 2)
                                        = split_part(p.category_id, '.', 1) || '.' || split_part(p.category_id, '.', 2))
                                  or (split_part(it, '.', 1) <> 'instruments'
                                      and split_part(it, '.', 1) = split_part(p.category_id, '.', 1))
                                  or (it like 'instruments.keyboards%' and p.category_id like 'studio.%')
                                  or (it like 'studio.%' and p.category_id like 'instruments.keyboards%')) then 0.08
                  else -0.25 end
           + case p.entity_level when 'family' then -0.12 else 0 end
           + case p.quality_status when 'quarantined' then -0.6 when 'needs_review' then -0.04 else 0 end
           + case p.verification_status when 'VERIFIED' then 0.04 when 'PROBABLE' then 0.02
                  when 'REJECTED' then -0.5 else 0 end)::numeric, 4) as score
  from best b
  join public.catalog_products p on p.id = b.product_id and p.superseded_at is null
  join public.catalog_manufacturers m on m.id = p.manufacturer_id
  left join public.catalog_categories c on c.id = p.category_id
  left join lateral (
    select x as tok from unnest(qcodes) x
    where b.mtype <> 'fuzzy'
      and position(x in b.alias_key) = 0 and position(x in p.model_key) = 0
      and (p.model_code_key is null or position(p.model_code_key in x) = 0)
      -- 4.2: the product's own variant SKUs explain a code whether or not it has a model code (Meinl 'Rawhide
      -- Maracas' has no code; MSM3CU is one of its SKUs). Aliases only for coded products, as in 3.4: a code-less line
      -- ('Pacifica') must not be explained by a store title that names one model of it (PA012).
      and not exists (select 1 from public.catalog_product_variants v
                      where v.product_id = p.id and v.sku_key is not null
                        and (position(x in v.sku_key) > 0 or position(v.sku_key in x) > 0))
      and (p.model_code_key is null
           or not exists (select 1 from public.catalog_product_aliases a
                          where a.product_id = p.id and position(x in a.alias_key) > 0))
    limit 1
  ) uc on true
  order by score desc, p.confidence desc, p.id
  limit max_results;
end $$;

-- ------------------------------------------------------------------------------------ compact an already-normalized text
-- catalog_compact() without the normalization step (tokens and aliases are normalized already); same result on them
create or replace function public.catalog_compact_normalized(input text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select replace(replace(replace(regexp_replace(input, '([0-9])\.([0-9])', '\1p\2', 'g'), '+', 'plus'), ' ', ''), '.', '')
$$;

-- ------------------------------------------------------------------------------------ token noise (position aware)
-- mirrors the Phase 4.1 prototype: sizes, prices, watts, '4 x 10', '88 teclas' and vocabulary noise are not identity
create or replace function public.catalog_token_is_noise(toks text[], p int, noise text[], warn text[])
returns boolean
language sql
immutable
set search_path = public, extensions
as $$
  select case
    when t = 'x' and coalesce(toks[p + 1], '-') ~ '^[0-9.]+$' and coalesce(toks[p - 1], '-') ~ '^[0-9.]+$' then true
    when t = any(warn) or t = 'v' then false
    when t = any(noise) or length(t) = 1 then true
    when t ~ '^[0-9]+(\.[0-9]+)?$' and (length(t) >= 3 or coalesce(toks[p + 1], '') ~ '^(cuerpos|piezas|pzas|pz|cuerdas|teclas|canales|ch|watts|w|wts|metros|m|pulgadas|in|anos|meses|dias|x|unidades|pads|zonas|bandas|botones|pedales|tambores|platillos|octavas|voces|vias|soles|sol|dolares|usd|lucas|mil|s|ohm|ohms|hz|mm|cm|kg|v|pcs|pc)$'
                                     or coalesce(toks[p + 1], '') = 'x' or coalesce(toks[p - 1], '') = 'x') then true
    when t ~ '^[0-9]+(\.[0-9]+)?(in|w|wts|watts|v|vac|mm|cm|kg|ch|ohm|ohms|hz|khz|pz|pcs|pc|k|mah|gb|mb)$' then true
    when t ~ '^[0-9.]+(in)?x[0-9.]+(in)?$' or t ~ '^[0-9]+in[0-9]+(in)?$' then true
    else false end
  from (select toks[p] as t) s
$$;

-- ------------------------------------------------------------------------------------ the lookup
create or replace function public.catalog_lookup(
  query text,
  manufacturer_hint text default null,
  max_results integer default 8
)
returns table (
  product_id uuid,
  manufacturer text,
  model text,
  category_id text,
  category_label_es text,
  entity_level text,
  introduction_year smallint,
  discontinuation_year smallint,
  verification_status public.catalog_verification_status,
  quality_status text,
  publish_ready boolean,
  confidence numeric,
  match_type text,
  matched_text text,
  category_intent text,
  warning text,
  score numeric
)
language plpgsql
stable
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  -- 4.1: a spaced '+' is 'and' ('Pearl D1500TGL + cable'), unlike a glued one ('az2203nt+', a product version)
  q text := public.catalog_normalize(regexp_replace(regexp_replace(query, '(^|\s)(10|9|8)\s*/\s*10(\s|$)', ' ', 'g'),
                                                    '\s\+(\s|$)', ' y ', 'g'));
  toks text[] := string_to_array(q, ' ');
  n int := coalesce(array_length(toks, 1), 0);
  alts text[];
  syns text[];
  noise text[];
  warnw text[];
  boundary constant text[] := array['con', 'de', 'del', 'para', 'y', 'color', 'incluye', 'en', 'sin', 'o'];
  strong constant text[] := array['exact_alias', 'exact_alias_with_brand', 'alias_tokens', 'model_code', 'sku'];
begin
  if n = 0 then
    return;
  end if;
  select coalesce(array_agg(term) filter (where kind = 'noise'), '{}'), coalesce(array_agg(term) filter (where kind = 'warn'), '{}')
    into noise, warnw from public.catalog_lookup_terms;
  alts := toks;
  syns := array(select coalesce(s.target, a) from unnest(alts) with ordinality u(a, i)
                left join public.catalog_lookup_terms s on s.kind = 'synonym' and s.term = a order by i);

  return query
  with cand as (
    select c.*, p.manufacturer_id, p.canonical_model_name as cname, p.model_code as mcode,
           p.model_code_key as mcode_key, p.model_key as mkey
    from public.catalog_lookup_candidates(query, manufacturer_hint, 20) with ordinality c
    join public.catalog_products p on p.id = c.product_id
  ),
  pos as (
    select i, toks[i] as tok, alts[i] as alt, syns[i] as syn,
           public.catalog_compact_normalized(alts[i]) as altkey, public.catalog_compact_normalized(toks[i]) as tokkey,
           public.catalog_token_is_noise(toks, i, noise, warnw) as is_noise
    from generate_subscripts(toks, 1) i
  ),
  grams as (  -- every 1-4 token run of the title, as written, without the '+', and with synonyms
    select public.catalog_compact_normalized(array_to_string(seq[s:e], ' ')) as k, s, e
    from (values (toks), (alts), (syns)) v(seq),
         generate_series(1, n) s, generate_series(s, least(n, s + 3)) e
  ),
  keys as (   -- what each candidate explains; ident = the product's own vocabulary (no store-title aliases)
    select c.product_id, x.k, x.ident, x.brand
    from cand c
    cross join lateral (
      select a.alias_key as k, coalesce(a.source_id, '') not like 'retail\_%' as ident, false as brand
      from public.catalog_product_aliases a where a.product_id = c.product_id
      union all
      select public.catalog_compact_normalized(w), coalesce(a.source_id, '') not like 'retail\_%', false
      from public.catalog_product_aliases a, unnest(string_to_array(a.normalized_alias, ' ')) w where a.product_id = c.product_id
      union all
      select public.catalog_compact_normalized(w), true, false
      from (select public.catalog_normalize(s) as ns from unnest(array[c.cname, c.mcode]) s where s is not null
            union
            select public.catalog_normalize(s) from public.catalog_product_variants v,
                   unnest(array[v.variant_name, v.sku, v.finish, v.color, v.configuration]) s
            where v.product_id = c.product_id and s is not null) z,
           unnest(array[z.ns] || string_to_array(z.ns, ' ')) w
      union all
      select ma.alias_key, true, true from public.catalog_manufacturer_aliases ma where ma.manufacturer_id = c.manufacturer_id
    ) x
    where x.k is not null and x.k <> ''
  ),
  ex_all as (   -- positions explained by n-grams
    select distinct kk.product_id, i, bool_or(kk.ident) over (partition by kk.product_id, i) as ident
    from keys kk join grams g on g.k = kk.k, generate_series(g.s, g.e) i
  ),
  ex_num as (   -- '14' written without the inch mark, product '14"'
    select c.product_id, ps.i from cand c join pos ps on ps.tok ~ '^[0-9]{1,2}(\.[0-9])?$'
    where exists (select 1 from keys kk where kk.product_id = c.product_id and kk.k = ps.tokkey || 'in')
  ),
  ex_typo as (  -- a typo of one of the candidate's words ('tamma', 'zildjan'), never a noise word
    select c.product_id, ps.i from cand c join pos ps on length(ps.alt) >= 4 and ps.alt ~ '^[a-z]+$' and not (ps.alt = any(noise))
    where not exists (select 1 from ex_all e where e.product_id = c.product_id and e.i = ps.i)
      and exists (select 1 from keys kk where kk.product_id = c.product_id and kk.k ~ '^[a-z]{4,}$'
                    and abs(length(kk.k) - length(ps.alt)) <= 2
                    and extensions.levenshtein(kk.k, ps.alt) <= greatest(1, floor(0.1 * (length(kk.k) + length(ps.alt)))))
  ),
  ex_suffix as ( -- 4.2: a store code = the candidate's code or SKU + a 2-4 character suffix that starts with a letter
                -- (PDNY0514SS + PR, CT-S410 + C2, AP-750 + GB); one letter is not enough (JS32 vs JS32Q are two models)
    -- the suffix is glued inside the code's last token and is not an identity word ('EK-50 CSA II', '2013+' = plus)
    select distinct kk.product_id, gs.i
    from keys kk join grams g on g.k like kk.k || '%'
      and length(g.k) - length(kk.k) between 2 and 4
      and substr(g.k, length(kk.k) + 1) ~ '^[a-z][a-z0-9]*$'
    join pos last on last.i = g.e and length(kk.k) > length(g.k) - length(last.tokkey)
    cross join lateral generate_series(g.s, g.e) gs(i)
    where not kk.brand and length(kk.k) >= 5 and kk.k ~ '[0-9]' and kk.k ~ '[a-z]' and g.k ~ '[0-9]'
      and substr(g.k, length(kk.k) + 1) <> all(warnw || array['plus'])
      and substr(g.k, length(kk.k) + 1) !~ '^(mk[0-9]+|v[0-9]+|gen[0-9]*)$'
  ),
  ex as (
    select product_id, i from ex_all union select product_id, i from ex_num union select product_id, i from ex_typo
    union select product_id, i from ex_suffix
  ),
  brandpos as (
    select c.product_id, ps.i from cand c join pos ps on true
    where exists (select 1 from keys kk where kk.product_id = c.product_id and kk.brand and kk.k = ps.altkey)
  ),
  -- model tokens: explained, not the brand, not a vocabulary noise word or a lone letter ('v' counts)
  mp0 as (
    select e.product_id, e.i from ex e join pos ps on ps.i = e.i
    where not exists (select 1 from brandpos b where b.product_id = e.product_id and b.i = e.i)
      and not (ps.alt = any(noise)) and not (length(ps.alt) = 1 and ps.alt <> 'v')
  ),
  mp as (       -- a product whose name is only noise words ('A Solo'): its explained non-brand tokens
    select product_id, i from mp0
    union all
    select e.product_id, e.i from ex e
    where not exists (select 1 from mp0 m where m.product_id = e.product_id)
      and not exists (select 1 from brandpos b where b.product_id = e.product_id and b.i = e.i)
  ),
  ident_mp as ( -- model tokens by the product's own vocabulary only (for sibling domination)
    select distinct e.product_id, e.i from ex_all e join pos ps on ps.i = e.i
    where e.ident and not exists (select 1 from brandpos b where b.product_id = e.product_id and b.i = e.i)
      and not (ps.alt = any(noise)) and not (length(ps.alt) = 1 and ps.alt <> 'v')
  ),
  mpa as (
    select product_id, array_agg(i order by i) as ps, min(i) as lo, max(i) as hi, count(*)::int as nmp
    from (select distinct product_id, i from mp) x group by product_id
  ),
  mp0a as (select product_id, array_agg(distinct i) as ps from mp0 group by product_id),
  identa as (select product_id, array_agg(distinct i) as ps from ident_mp group by product_id),
  region as (   -- from the first model token to the first 'con' / 'de' / 'para' ... after the last one
    select m.product_id, m.lo,
           coalesce((select min(case when ps.alt = any(boundary) then ps.i else ps.i + 1 end) from pos ps
                     where ps.i > m.hi and (ps.alt = any(boundary) or ps.tok ~ '.\+$')), n + 1) as cut
    from mpa m
  ),
  dominated as ( -- positions a sibling explains beyond this candidate's own model tokens (sibling = strict superset);
                 -- a word three or more such siblings share ('wah' of the Cry Baby wahs) is the line's word, not identity
    select product_id, i from (
      select c0.product_id, unnest(o.ps) as i, o.product_id as sib
      from mp0a c0 join identa o on o.product_id <> c0.product_id and o.ps @> c0.ps and not (c0.ps @> o.ps)
    ) d
    group by product_id, i
    having count(distinct sib) <= 2
  ),
  warned as (   -- identity-shaped tokens after the model part, and anything a more specific sibling explains
    select x.product_id, (array_agg(x.alt order by x.i))[1] as tok
    from (
      select r.product_id, ps.i, ps.alt
      from region r join pos ps on ps.i >= r.lo and ps.i < r.cut
      where not exists (select 1 from ex e where e.product_id = r.product_id and e.i = ps.i)
        and not ps.is_noise
        and (ps.alt ~ '[0-9]' or ps.alt = any(warnw) or ps.alt = 'v'
             or ps.alt ~ '^(mk[0-9]+|v[0-9]+|gen[0-9]*|[0-9]+(st|nd|rd|th))$')
      union
      select d.product_id, d.i, ps.alt
      from dominated d join pos ps on ps.i = d.i
      where not exists (select 1 from ex e where e.product_id = d.product_id and e.i = d.i)
        -- a category word ('wah' in 'wah dunlop cry baby') does not make a sibling more specific
        and not exists (select 1 from public.catalog_category_terms ct where ct.term = ps.alt)
    ) x
    group by x.product_id
  ),
  code_taken as ( -- 4.2: the search's 'unexplained_code:<tok>' when another candidate explains that code (its SKU)
    select c.product_id
    from cand c join pos ps on c.warning = 'unexplained_code:' || ps.tokkey
    where exists (select 1 from ex e where e.product_id <> c.product_id and e.i = ps.i)
    group by c.product_id
  ),
  scored as (
    select c.*, coalesce(cardinality(m0.ps), 0) as nmp,
           case when c.warning is null and w.tok is not null and c.match_type = any(strong)
                then 'unexplained_token:' || w.tok else c.warning end as warning2,
           case when c.warning is null and w.tok is not null and c.match_type = any(strong) then c.score - 0.45
                when ct.product_id is not null then c.score - 0.45 + 0.03  -- the search already took 0.03
                else c.score end as score2
    from cand c
    left join mp0a m0 on m0.product_id = c.product_id
    left join warned w on w.product_id = c.product_id
    left join code_taken ct on ct.product_id = c.product_id
  )
  select s.product_id, s.manufacturer, s.model, s.category_id, s.category_label_es, s.entity_level, s.introduction_year,
         s.discontinuation_year, s.verification_status, s.quality_status, s.publish_ready, s.confidence, s.match_type,
         s.matched_text, s.category_intent, s.warning2, round(s.score2, 4)
  from scored s
  order by s.score2 desc, s.nmp desc, (s.entity_level = 'family'), s.model, s.product_id
  limit max_results;
end $$;

comment on function public.catalog_lookup(text, text, integer) is
  'Ranked catalog candidates for a listing title (Phase 4.1 explained tokens, 4.2 store codes, over catalog_lookup_candidates()).';

grant execute on function public.catalog_lookup_candidates(text, text, integer) to anon, authenticated;
grant execute on function public.catalog_compact_normalized(text) to anon, authenticated;
grant execute on function public.catalog_token_is_noise(text[], integer, text[], text[]) to anon, authenticated;
grant execute on function public.catalog_lookup(text, text, integer) to anon, authenticated;
