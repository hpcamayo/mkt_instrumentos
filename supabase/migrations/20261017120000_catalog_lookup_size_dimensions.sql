-- Canonical catalog (roadmap step 3.13b, Henri's choice (b), 2026-10-06): a size next to a maker code no longer drops
-- the code candidate. Store titles print the maker's article number with the drum's diameter or both dimensions
-- ('Tama Starclassic Maple MAS148 14"', 'DW DDAC0614SSCL … Tarola 6" X 14"', 'Tama 14"x 6" … LSP146'); the search
-- found the product by its code, but
--   * catalog_lookup(): the product's own size is one glued token ('14"x8"' -> 14inx8), so the title's '14"' (or the
--     '6"' of '6" X 14"') counted as unexplained, and since the product's name has another size the 4.5 size rule
--     warned 'unexplained_token:14in' and took 0.45 off: the code candidate dropped out of the ranking. A size the
--     title writes alone or apart that is one dimension of the candidate's own 'AxB' size is now explained; a size the
--     candidate's name does not have still warns ('Z40118 20"' vs an 18" China);
--   * catalog_lookup_candidates(): a size whose second dimension the store wrote apart ('14"x 6"' -> '14inx', '6" X14"'
--     -> 'x14in') was read as a store code ('unexplained_code:14inx'); such sizes are not codes now, like '14inx6in'.
-- Scores, catalog_match() and run_eval.decide() are unchanged. Both functions are copied from
-- 20261016120000_catalog_lookup_short_maker_skus.sql (candidates) and 20261015120000_catalog_lookup_maker_code_first.sql
-- (lookup) with only these changes. Local only; production with the other catalog migrations after review.

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
    -- 3.13b: nor is a size whose second dimension the store wrote apart ('14"x 6"' -> 14inx 6in, '6" X14"' -> x14in)
    and t !~ '^[0-9.]+(in)?x$' and t !~ '^x[0-9.]+(in)?$'
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
       -- 3.12g (Henri's C1): a four-character SKU the maker states (Meinl MSM3 / MGU1, LP ES-12) when its brand is in
       -- the title; shorter SKUs and store-stated ones stay out
       or (length(v.sku_key) = 4 and v.sku_key ~ '[a-z]' and v.sku_key ~ '[0-9]'
           and coalesce(v.source_id, '') not like 'retail\_%'
           and exists (select 1 from public.catalog_products p2
                       where p2.id = v.product_id and p2.manufacturer_id in (select manufacturer_id from mentioned)))
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


grant execute on function public.catalog_lookup_candidates(text, text, integer) to anon, authenticated;

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
  -- 3.10a: a code's mains-voltage ending ('RC-500-230', 'JC-40-230') names the same product as the code
  qv text := regexp_replace(query, '\m([A-Za-z]+-?[0-9]+[A-Za-z]{0,3})-(100|117|120|220|230|240)\M', '\1', 'g');
  q text := public.catalog_normalize(regexp_replace(regexp_replace(qv, '(^|\s)(10|9|8)\s*/\s*10(\s|$)', ' ', 'g'),
                                                    '\s\+(\s|$)', ' y ', 'g'));
  toks text[] := string_to_array(q, ' ');
  n int := coalesce(array_length(toks, 1), 0);
  alts text[];
  syns text[];
  noise text[];
  warnw text[];
  copyw text[];
  keepw text[];
  boundary constant text[] := array['con', 'de', 'del', 'para', 'y', 'color', 'incluye', 'en', 'sin', 'o'];
  strong constant text[] := array['exact_alias', 'exact_alias_with_brand', 'alias_tokens', 'model_code', 'sku'];
begin
  if n = 0 then
    return;
  end if;
  select coalesce(array_agg(term) filter (where kind = 'noise'), '{}'), coalesce(array_agg(term) filter (where kind = 'warn'), '{}'),
         coalesce(array_agg(term) filter (where kind = 'copy'), '{}'), coalesce(array_agg(term) filter (where kind = 'keep'), '{}')
    into noise, warnw, copyw, keepw from public.catalog_lookup_terms;
  alts := toks;
  syns := array(select coalesce(s.target, a) from unnest(alts) with ordinality u(a, i)
                left join public.catalog_lookup_terms s on s.kind = 'synonym' and s.term = a order by i);

  return query
  with cand as (
    select c.*, p.manufacturer_id, p.canonical_model_name as cname, p.model_code as mcode,
           p.model_code_key as mcode_key, p.model_key as mkey
    from public.catalog_lookup_candidates(qv, manufacturer_hint, 20) with ordinality c
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
  cand_dims as ( -- 3.13b: the dimensions of each candidate's own 'AxB' size ('Starclassic Maple Snare 14"x8"' -> 14, 8)
    select distinct kk.product_id, d
    from keys kk, unnest(string_to_array(replace(kk.k, 'in', ''), 'x')) d
    where not kk.brand and kk.k ~ '^[0-9]{1,2}(p[0-9]+)?(in)?x[0-9]{1,2}(p[0-9]+)?(in)?$'
  ),
  size_tok as (  -- sizes the title writes alone or apart: 'MAS148 14"', '6" X 14"', '14"x 6"' (14inx), '6" X14"' (x14in)
    select i, regexp_replace(altkey, '^x?([0-9]{1,2}(p[0-9]+)?)(in)?x?$', '\1') as d
    from pos where altkey ~ '^x?[0-9]{1,2}(p[0-9]+)?(in)?x?$' and altkey ~ '(in|^x|x$)'
  ),
  ex_dim as (    -- such a size is explained when it is one of the candidate's dimensions, and so is an 'x' between two
                 -- of them; a size the candidate's name does not have stays unexplained ('Z40118 20"' vs an 18" China, 4.5)
    select cd.product_id, st.i from cand_dims cd join size_tok st on st.d = cd.d
    union
    select a.product_id, ps.i
    from pos ps join size_tok s1 on s1.i = ps.i - 1 join size_tok s2 on s2.i = ps.i + 1
    join cand_dims a on a.d = s1.d join cand_dims b on b.product_id = a.product_id and b.d = s2.d
    where ps.altkey = 'x'
  ),
  ex as (
    select product_id, i from ex_all union select product_id, i from ex_num union select product_id, i from ex_typo
    union select product_id, i from ex_suffix union select product_id, i from ex_dim
  ),
  brandpos as (  -- 4.3: from n-grams, so two-word brands count ('Goodwood Audio')
    select distinct kk.product_id, gs.i
    from keys kk join grams g on g.k = kk.k cross join lateral generate_series(g.s, g.e) gs(i)
    where kk.brand
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
      union  -- 4.5: a size the candidate does not explain while its own name has another size ('Z40118 20"' vs 18")
      select c.product_id, ps.i, ps.alt
      from cand c join pos ps on ps.alt ~ '^[0-9]{1,2}(\.[0-9]+)?in$'
      where not exists (select 1 from ex e where e.product_id = c.product_id and e.i = ps.i)
        and exists (select 1 from keys kk where kk.product_id = c.product_id and not kk.brand
                      and kk.k ~ '^[0-9]{1,2}(p[0-9]+)?in$' and kk.k <> ps.altkey)
      union
      select d.product_id, d.i, ps.alt
      from dominated d join pos ps on ps.i = d.i
      where not exists (select 1 from ex e where e.product_id = d.product_id and e.i = d.i)
        -- a category word ('wah' in 'wah dunlop cry baby') does not make a sibling more specific
        and not exists (select 1 from public.catalog_category_terms ct where ct.term = ps.alt)
    ) x
    group by x.product_id
  ),
  copied as (    -- 4.3: 'vorson tipo les paul': a candidate whose own vocabulary explains the words right after a copy word
    -- a copy word the candidate itself explains is part of its name ('Vox Continental Type 1')
    select distinct im.product_id, ps.alt as tok
    from pos ps join ident_mp im on im.i in (ps.i + 1, ps.i + 2)
    where ps.alt = any(copyw)
      and not exists (select 1 from ex e where e.product_id = im.product_id and e.i = ps.i)
  ),
  unknown_brand as ( -- 4.3: the candidate's brand is not in the title, its match rests on words (no code token), and a
                     -- word before its model part is unexplained and is not noise, a category, identity or known brand word
    select m.product_id, (array_agg(ps.alt order by ps.i))[1] as tok
    from mpa m join pos ps on ps.i < m.lo
    where not exists (select 1 from brandpos b where b.product_id = m.product_id)
      and not exists (select 1 from mp0 x join pos px on px.i = x.i where x.product_id = m.product_id and px.alt ~ '[0-9]')
      and ps.alt ~ '^[a-z]{3,}$' and not ps.is_noise and not (ps.alt = any(warnw)) and not (ps.alt = any(copyw))
      and not (ps.alt = any(keepw))
      and not exists (select 1 from ex e where e.product_id = m.product_id and e.i = ps.i)
      and not exists (select 1 from public.catalog_category_terms ct where ct.term = ps.alt)
      and not exists (select 1 from public.catalog_manufacturer_aliases ma where ma.alias_key = ps.altkey)
    group by m.product_id
  ),
  bundle_at as (  -- 4.4: where a second gear item starts ('... con Amplificador Crush Mini'): a connector followed within
                  -- two words by a category word that is not an accessory ('con estuche', 'con funda' are not bundles)
    -- a bundle needs a main item: a strong candidate names a model before the connector ('Consola Digital Con Interfaz
    -- MIDAS MR12' is a feature, not a bundle)
    select c.i as s2, t.i as wpos, t.alt as word
    from pos c join pos t on t.i in (c.i + 1, c.i + 2)
    where c.alt in ('con', 'y', 'mas', 'incluye', 'incluido', 'incluida')
      and exists (select 1 from public.catalog_category_terms ct
                  where ct.term = t.alt and ct.category_id not like 'accessories%')
      and (exists (select 1 from mp0 x join cand c2 on c2.product_id = x.product_id join pos px on px.i = x.i
                   where x.i < c.i and c2.match_type = any(strong) and not (px.alt = any(keepw)))
           -- 3.9r: or a token with a digit names a main item the catalog may lack ('Smiger S-G3 con amplificador
           -- YX-15': the title reads 's g3'); only removes automatic approvals (the second item becomes a bundle part)
           or exists (select 1 from pos px
                      where px.i < c.i and not px.is_noise and px.altkey ~ '[0-9]'
                        and px.alt !~ '^[0-9]{1,2}(\.[0-9]+)?in$'))
    order by c.i, t.i
    limit 1
  ),
  bundled as (    -- 'part' = the candidate names only the second item; otherwise it is the main item of a bundle;
                  -- a candidate that explains the category word itself is not bundled ('Amp & IR Cabinet' + 'gabinete')
    select m.product_id, b.word, bool_and(m.i >= b.s2) as part
    from mp0 m cross join bundle_at b
    where not exists (select 1 from ex e where e.product_id = m.product_id and e.i = b.wpos)
    group by m.product_id, b.word
  ),
  code_taken as ( -- 4.2: the search's 'unexplained_code:<tok>' when another candidate explains that code (its SKU)
    select c.product_id
    from cand c join pos ps on c.warning = 'unexplained_code:' || ps.tokkey
    where exists (select 1 from ex e where e.product_id <> c.product_id and e.i = ps.i)
    group by c.product_id
  ),
  scored0 as (
    select c.*, coalesce(cardinality(m0.ps), 0) as nmp,
           case when c.warning is null and w.tok is not null and c.match_type = any(strong)
                then 'unexplained_token:' || w.tok else c.warning end as warning1,
           case when c.warning is null and w.tok is not null and c.match_type = any(strong) then c.score - 0.45
                when ct.product_id is not null then c.score - 0.45 + 0.03  -- the search already took 0.03
                else c.score end as score1,
           cp.tok as copy_tok, ub.tok as unknown_tok, bd.word as bundle_word, bd.part as bundle_part
    from cand c
    left join mp0a m0 on m0.product_id = c.product_id
    left join warned w on w.product_id = c.product_id
    left join code_taken ct on ct.product_id = c.product_id
    left join (select product_id, min(tok) as tok from copied group by product_id) cp on cp.product_id = c.product_id
    left join unknown_brand ub on ub.product_id = c.product_id
    left join bundled bd on bd.product_id = c.product_id
  ),
  scored as (   -- 4.3 warnings come after the token warnings (a candidate carries one warning)
    select s0.*,
           case when s0.warning1 is null and s0.match_type = any(strong) and s0.copy_tok is not null then 'copy_word:' || s0.copy_tok
                when s0.warning1 is null and s0.match_type = any(strong) and s0.unknown_tok is not null then 'unknown_brand:' || s0.unknown_tok
                when s0.warning1 is null and s0.bundle_part then 'bundle_part:' || s0.bundle_word
                -- 4.4: the main item of a bundle keeps its score; 'bundle:<word>' does not block (catalog_match: reason)
                when s0.warning1 is null and s0.bundle_word is not null then 'bundle:' || s0.bundle_word
                else s0.warning1 end as warning2,
           case when s0.warning1 is null and s0.match_type = any(strong) and (s0.copy_tok is not null or s0.unknown_tok is not null)
                then s0.score1 - 0.45
                when s0.warning1 is null and s0.bundle_part then s0.score1 - 0.45
                else s0.score1 end as score2
    from scored0 s0
  )
  select s.product_id, s.manufacturer, s.model, s.category_id, s.category_label_es, s.entity_level, s.introduction_year,
         s.discontinuation_year, s.verification_status, s.quality_status, s.publish_ready, s.confidence, s.match_type,
         s.matched_text, s.category_intent, s.warning2, round(s.score2, 4)
  from scored s
  order by (s.warning2 is null and s.match_type in ('sku', 'model_code')
            and exists (select 1 from grams g where g.k = public.catalog_compact_normalized(public.catalog_normalize(s.matched_text)))
            -- a store code that extends the maker's code with a hyphen ('B16MTC-B' = Brilliant) is not that code
            and qv !~* ('(^|[^a-z0-9])' || regexp_replace(s.matched_text, '[^A-Za-z0-9]', '', 'g') || '-[a-z0-9]')
            -- it outranks names found by similarity only: a clean strong candidate that scores higher stays first
            and not exists (select 1 from scored o where o.product_id <> s.product_id and o.warning2 is null
                               and o.match_type = any(strong) and o.score2 > s.score2)
            and exists (select 1 from brandpos b where b.product_id = s.product_id)
            and case when s.match_type = 'sku'
                     then exists (select 1 from public.catalog_product_variants v
                                  where v.product_id = s.product_id and v.sku = s.matched_text
                                    and coalesce(v.source_id, '') not like 'retail\_%')
                     else s.verification_status = 'VERIFIED' end) desc,
           s.score2 desc, s.nmp desc, (s.entity_level = 'family'), s.model, s.product_id
  limit max_results;
end $$;

comment on function public.catalog_lookup(text, text, integer) is
  'Ranked catalog candidates for a listing title (Phase 4.1 explained tokens, 4.2 store codes, 4.3 unknown brands and copies, 4.4 bundles, 4.5 sizes, 3.12a the maker''s own article number first, 3.13b a size that is one dimension of the candidate''s own size, over catalog_lookup_candidates()).';

grant execute on function public.catalog_lookup(text, text, integer) to anon, authenticated;
