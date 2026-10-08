-- Step 3.15d2 (close-out sprint, 2026-10-07): a maker's article number that holds no digit ('GALAXY', the 2026 Meinl
-- price list's Bill Saragosa Galaxy) is a plain word: as an SKU or model-code match it now names that article only
-- when the title also names the maker (brandpos); otherwise the candidate carries the warning 'sku_word:<word>' and
-- loses 0.45 like the other 4.3 warnings ('LP Conga Galaxy Fiber' was approved to Meinl's Galaxy; it is LP's Galaxy
-- conga). A copy of catalog_lookup() from 20261018120000 with that one change; catalog_lookup_candidates(), the scores
-- of every other candidate and catalog_match() are unchanged. Previewed on every store listing and gold title.

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
  -- 3.15c: a distributor's region tag after the code ('Randall RG80E-U', 'RX15MBCE-U') names the same product as the code
  qv text := regexp_replace(regexp_replace(query, '\m([A-Za-z]+-?[0-9]+[A-Za-z]{0,3})-(100|117|120|220|230|240)\M', '\1', 'g'),
                            '\m([A-Za-z]+[0-9]+[A-Za-z0-9]*?)E-U\M', '\1', 'g');
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
        -- 3.15c: a count glued to its Spanish unit ('35WATT', 'De 2Canales') is not an identity token either
        and ps.altkey !~ '^[0-9]+(in)?(canales|teclas|piezas|cuerdas|watt|watts|pulgadas|bandas|zonas|voces|vias|octavas|metros|monitores|entradas|salidas|pads)$'
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
      -- 3.15c: a negated inclusion is no second item ('NO INCLUYE PLATILLOS', 'sin incluir')
      and not exists (select 1 from pos ng where ng.i = c.i - 1 and ng.alt in ('no', 'sin'))
      -- 3.15c: nor a list of uses or features: the connector joins two words of one list ('para Guitarra y Bajo',
      -- 'para voz y guitarra', 'saxofón y trompeta'; 'Pedal Delay y Reverb', 'Controlador y secuenciador MIDI')
      and not (c.alt in ('y', 'mas') and exists (
            select 1 from pos pv,
                   (values (array['guitarra', 'guitarras', 'bajo', 'bajos', 'voz', 'voces', 'violin', 'ukelele', 'saxofon',
                                  'trompeta', 'clarinete', 'flauta', 'teclado', 'piano']),
                           (array['delay', 'reverb', 'looper', 'chorus', 'flanger', 'phaser', 'tremolo', 'overdrive', 'distorsion',
                                  'fuzz', 'compresor', 'compressor', 'sustainer', 'ecualizador', 'octavador', 'pitch', 'armonizador',
                                  'harmonizer', 'modulador', 'modulacion', 'secuenciador', 'controlador', 'multiefectos', 'modelador',
                                  'afinador', 'efectos'])) l(ws)
            where pv.i = c.i - 1 and pv.alt = any(l.ws) and t.alt = any(l.ws)))
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
                -- 3.15d2: a maker's article number with no digit is a word ('GALAXY', Meinl's Bill Saragosa Galaxy): it names
                -- that article only in a title that names the maker ('LP Conga Galaxy Fiber' is LP's Galaxy conga)
                when s0.warning1 is null and s0.match_type in ('sku', 'model_code') and s0.matched_text !~ '[0-9]'
                     and not exists (select 1 from brandpos b where b.product_id = s0.product_id)
                then 'sku_word:' || lower(s0.matched_text)
                when s0.warning1 is null and s0.bundle_part then 'bundle_part:' || s0.bundle_word
                -- 4.4: the main item of a bundle keeps its score; 'bundle:<word>' does not block (catalog_match: reason)
                when s0.warning1 is null and s0.bundle_word is not null then 'bundle:' || s0.bundle_word
                else s0.warning1 end as warning2,
           case when s0.warning1 is null and s0.match_type = any(strong) and (s0.copy_tok is not null or s0.unknown_tok is not null)
                then s0.score1 - 0.45
                when s0.warning1 is null and s0.match_type in ('sku', 'model_code') and s0.matched_text !~ '[0-9]'
                     and not exists (select 1 from brandpos b where b.product_id = s0.product_id)
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
  'Ranked catalog candidates for a listing title (Phase 4.1 explained tokens, 4.2 store codes, 4.3 unknown brands and copies, 4.4 bundles, 4.5 sizes, 3.12a the maker''s own article number first, 3.13b a size that is one dimension of the candidate''s own size, 3.15c store endings, 3.15d2 a word-like article number needs its maker named, over catalog_lookup_candidates()).';

grant execute on function public.catalog_lookup(text, text, integer) to anon, authenticated;

