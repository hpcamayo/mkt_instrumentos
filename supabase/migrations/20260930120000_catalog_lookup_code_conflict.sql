-- Canonical catalog (roadmap 3.4, 2026-09-29): catalog_lookup warns 'unexplained_code:<tok>' also when the matched
-- product has its own model code and the listing names a different code of the same brand, not only when the
-- product has no code. A price list gave Meinl's generic 'Wood Bongo' page its code WB200, and 'Meinl CS400AWA-M
-- Collection Series Wood Bongo' then matched it without a warning (gold R498). A listing code that contains the
-- product's code (a store suffix: PBONE1R), or that is one of its variant SKUs or aliases, still explains itself.
-- Eval on the local stack: R498 false match -> abstain, R308 wrong match -> abstain, no other row changed.
-- Only the function body changes (create or replace keeps the grants of 20260927120000_canonical_catalog.sql).

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
  -- '10/10' (condition score) is the most common number in Peruvian listings: drop it before matching
  q text := public.catalog_normalize(regexp_replace(query, '(^|\s)(10|9|8)\s*/\s*10(\s|$)', ' ', 'g'));
  toks text[] := string_to_array(q, ' ');
  qtoks text[];
  n int := coalesce(array_length(toks, 1), 0);
  grams text[] := '{}';
  gends int[] := '{}';
  gtexts text[] := '{}';
  pflag text[] := '{}';   -- pflag[i]: identity token right after position i (or null)
  intents text[];
  qcodes text[];          -- model-code-like tokens in the text ('pa012', 'ar529svjg', 's6000')
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
  ) s;
  select array_agg(distinct t) into qcodes
  from unnest(toks) t
  where length(t) >= 4 and t ~ '[a-z]' and t ~ '[0-9]' and t ~ '^[a-z0-9]+$'
    and t !~ '^[0-9]+(v|vac|w|wts|watts|hz|khz|mm|cm|kg|in|ch|x[0-9]+|da|ra|ro|do|to|vo|mo|no|gb|mb)$'
    and not exists (select 1 from public.catalog_manufacturer_aliases ma where ma.alias_key = t);
  -- category intent: most specific taxonomy terms present in the text ('bateria electronica' > 'bateria')
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
           array_length(string_to_array(a.normalized_alias, ' '), 1) as ntok,
           -- position of the alias' last token (its model part ends there, even when the brand came later)
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
  sku as (          -- manufacturer SKU / part number of a variant (Zildjian A20532)
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
          union all select * from sku union all select * from fuzzy) h
  ),
  best as (
    -- a product's evidence is its best strong hit when it has one (a fuzzy hit must not hide a warning)
    select distinct on (h.product_id) h.product_id, h.matched, h.alias_key, h.mtype, h.warn, h.base,
           coalesce(h.is_ambiguous, false) and h.mtype <> 'fuzzy' as ambiguous
    from hits h
    order by h.product_id, (h.mtype = 'fuzzy'), h.base desc
  )
  select p.id, m.canonical_name, p.canonical_model_name, p.category_id, c.label_es, p.entity_level,
         p.introduction_year, p.discontinuation_year, p.verification_status, p.quality_status, p.publish_ready,
         p.confidence, b.mtype, b.matched, intents[1], coalesce(b.warn, 'unexplained_code:' || uc.tok),
         round((b.base
           -- a generation / version token the match does not explain: most likely another product
           - case when b.warn is not null then 0.45 when uc.tok is not null then 0.03 else 0 end
           + case when exists (select 1 from mentioned) and p.manufacturer_id in (select manufacturer_id from mentioned) then 0.25
                  when exists (select 1 from mentioned) then -0.30 else 0 end
           -- an ambiguous alias ('Tremolo', 'III', a name shared by several products) needs its brand in the text
           - case when b.ambiguous and p.manufacturer_id not in (select manufacturer_id from mentioned) then 0.25 else 0 end
           -- listing says what kind of thing it is: reward agreement, punish contradiction
           + case when intents is null or p.category_id is null then 0
                  when exists (select 1 from unnest(intents) it
                               where p.category_id like it || '%' or it like p.category_id || '%'
                                  -- instruments.* must agree on the instrument (guitar / bass / drums / keys ...)
                                  or (split_part(it, '.', 1) = 'instruments'
                                      and split_part(it, '.', 1) || '.' || split_part(it, '.', 2)
                                        = split_part(p.category_id, '.', 1) || '.' || split_part(p.category_id, '.', 2))
                                  -- other groups (amplification, effects, pro_audio, studio, dj...) agree on the group
                                  or (split_part(it, '.', 1) <> 'instruments'
                                      and split_part(it, '.', 1) = split_part(p.category_id, '.', 1))
                                  -- a 'sintetizador' can be a groovebox / drum machine / sampler
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
  -- the listing names a model code but the matched product has none and its name does not contain it:
  -- 'yamaha pacifica pa012' is probably not the line 'Pacifica', but 'meinl msm3cu rawhide maracas'
  -- is just a retail SKU. Ranking is kept (the product stays the best candidate to show the
  -- seller); the warning tells the caller not to auto-approve.
  left join lateral (
    select x as tok from unnest(qcodes) x
    where b.mtype <> 'fuzzy'
      and position(x in b.alias_key) = 0 and position(x in p.model_key) = 0
      and (p.model_code_key is null
           -- 3.4: the product has its own code and the listing names another one of the same brand
           -- ('meinl cs400awa-m collection series wood bongo' vs Wood Bongo WB200): a code that contains the
           -- product's code (a store suffix, PBONE1R) or is one of its variant SKUs or aliases explains itself
           or (position(p.model_code_key in x) = 0
               and not exists (select 1 from public.catalog_product_variants v
                               where v.product_id = p.id and v.sku_key is not null
                                 and (position(x in v.sku_key) > 0 or position(v.sku_key in x) > 0))
               and not exists (select 1 from public.catalog_product_aliases a
                               where a.product_id = p.id and position(x in a.alias_key) > 0)))
    limit 1
  ) uc on true
  order by score desc, p.confidence desc
  limit max_results;
end $$;
