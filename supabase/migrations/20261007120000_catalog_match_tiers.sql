-- Canonical catalog (roadmap Phase 4.5, 2026-09-29): tiers (Henri's D3) on top of catalog_match()'s decision.
--
--   AUTO          decision MATCH and not a bundle (score >= 1.0: after 4.1-4.4 a higher threshold only costs
--                 matches; precision on the gold is flat from 1.0 to 1.4)
--   REVIEW        a plausible candidate to show the seller: the main item of a bundle, a product line (FAMILY), a tie
--                 (CONFLICTING), a strong candidate carrying a token / code warning or scoring 0.8-1.0, or a fuzzy
--                 candidate (typo) of a brand the title names, scoring >= 1.2
--   INSUFFICIENT  no candidate; an unknown brand, a copy or only the second item of a bundle; the title names another
--                 known brand; a quarantined / REJECTED / CONFLICTING product; anything weaker
--
-- The return type gains `tier` and `brand_mentioned`, so the function is dropped and recreated (grants restated).
-- Local only; production after review.

drop function if exists public.catalog_match(text, text);

create function public.catalog_match(
  query text,
  manufacturer_hint text default null
)
returns table (
  decision text,
  tier text,
  reasons text[],
  product_id uuid,
  manufacturer text,
  model text,
  category_id text,
  category_label_es text,
  entity_level text,
  verification_status public.catalog_verification_status,
  quality_status text,
  publish_ready boolean,
  match_type text,
  matched_text text,
  category_intent text,
  warning text,
  score numeric,
  runner_up_product_id uuid,
  runner_up_score numeric,
  brand_mentioned boolean
)
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  strong constant text[] := array['exact_alias', 'exact_alias_with_brand', 'alias_tokens', 'model_code', 'sku'];
  min_score constant numeric := 1.0;        -- AUTO (and MATCH) threshold
  tie constant numeric := 0.02;
  review_strong constant numeric := 0.8;    -- a strong candidate below MATCH is still worth showing from here
  review_fuzzy constant numeric := 1.2;     -- a fuzzy candidate of a brand the title names, from here
  h record;
  top record;
  n int := 0;
  why text[] := '{}';
  rival_id uuid;
  rival_score numeric;
  q text := public.catalog_normalize(regexp_replace(regexp_replace(query, '(^|\s)(10|9|8)\s*/\s*10(\s|$)', ' ', 'g'),
                                                    '\s\+(\s|$)', ' y ', 'g'));
  toks text[] := string_to_array(q, ' ');
  grams text[];
  mentioned uuid[];
  top_mid uuid;
  hard boolean;
begin
  -- one lookup call: candidates with equal scores keep one order inside this function
  for h in select * from public.catalog_lookup(query, manufacturer_hint, 8) loop
    n := n + 1;
    if n = 1 then
      top := h;
    elsif rival_id is null and h.product_id <> top.product_id and h.match_type = any(strong)
          and h.score >= top.score - tie then
      rival_id := h.product_id;
      rival_score := h.score;
    end if;
  end loop;

  if n = 0 then
    decision := 'INSUFFICIENT';
    tier := 'INSUFFICIENT';
    reasons := array['no_candidate'];
    brand_mentioned := false;
    return next;
    return;
  end if;

  -- brands the title names (same n-grams as the candidate search) or the caller passes
  grams := array(select public.catalog_compact_normalized(array_to_string(toks[s:e], ' '))
                 from generate_series(1, coalesce(array_length(toks, 1), 0)) s,
                      generate_series(s, least(coalesce(array_length(toks, 1), 0), s + 4)) e);
  mentioned := array(select distinct ma.manufacturer_id from public.catalog_manufacturer_aliases ma
                     where (length(ma.alias_key) >= 3 and ma.alias_key = any(grams))
                        or (manufacturer_hint is not null and ma.alias_key = public.catalog_compact(manufacturer_hint)));
  select p.manufacturer_id into top_mid from public.catalog_products p where p.id = top.product_id;
  brand_mentioned := top_mid = any(mentioned);

  if not top.match_type = any(strong) then why := why || 'fuzzy_only'::text; end if;
  if top.score < min_score then why := why || 'low_score'::text; end if;
  -- 4.4: 'bundle:<word>' (the main item of a bundle) does not block; it is a reason ('bundle')
  if top.warning like 'bundle:%' then why := why || 'bundle'::text;
  elsif top.warning is not null then why := why || 'warning'::text; end if;
  if top.quality_status = 'quarantined' then why := why || 'quarantined'::text; end if;
  if top.verification_status in ('REJECTED', 'CONFLICTING') then why := why || 'rejected'::text; end if;
  if cardinality(mentioned) > 0 and not brand_mentioned then why := why || 'brand_contradicted'::text; end if;

  if cardinality(array_remove(array_remove(why, 'bundle'), 'brand_contradicted')) > 0 then
    decision := 'INSUFFICIENT';
  elsif rival_id is not null then
    decision := 'CONFLICTING';
    why := why || 'tie'::text;
  elsif top.entity_level = 'family' then
    decision := 'FAMILY';
    why := why || 'family'::text;
  else
    decision := 'MATCH';
  end if;

  -- tiers (D3)
  hard := top.warning ~ '^(unknown_brand|copy_word|bundle_part):'
          or 'quarantined' = any(why) or 'rejected' = any(why) or 'brand_contradicted' = any(why);
  tier := case
    when hard then 'INSUFFICIENT'
    when decision = 'MATCH' and not 'bundle' = any(why) then 'AUTO'
    when decision in ('MATCH', 'FAMILY', 'CONFLICTING') then 'REVIEW'
    when top.match_type = any(strong) and (top.warning is not null or top.score >= review_strong) then 'REVIEW'
    when not top.match_type = any(strong) and brand_mentioned and top.score >= review_fuzzy then 'REVIEW'
    else 'INSUFFICIENT' end;

  reasons := why;
  product_id := top.product_id;
  manufacturer := top.manufacturer;
  model := top.model;
  category_id := top.category_id;
  category_label_es := top.category_label_es;
  entity_level := top.entity_level;
  verification_status := top.verification_status;
  quality_status := top.quality_status;
  publish_ready := top.publish_ready;
  match_type := top.match_type;
  matched_text := top.matched_text;
  category_intent := top.category_intent;
  warning := top.warning;
  score := top.score;
  runner_up_product_id := rival_id;
  runner_up_score := rival_score;
  return next;
end $$;

comment on function public.catalog_match(text, text) is
  'Phase 4: the lookup decision (MATCH / FAMILY / CONFLICTING / INSUFFICIENT), its tier (AUTO / REVIEW / INSUFFICIENT, '
  'Henri''s D3), reasons and the top candidate. The decision rule is shared with catalog/scripts/eval/run_eval.py.';

grant execute on function public.catalog_match(text, text) to anon, authenticated;
