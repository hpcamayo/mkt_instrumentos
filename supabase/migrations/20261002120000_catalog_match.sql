-- Canonical catalog (roadmap Phase 4.0, 2026-09-29): the lookup's decision rule moves into the database, so Laria and
-- the evaluation use one rule. Until now it lived only in catalog/scripts/eval/run_eval.py (decide()). This first
-- version is that rule unchanged (the eval outcomes must stay identical; tests/test_catalog_match_parity.py compares
-- the two); Phase 4 changes it step by step, and 4.5 maps it to Henri's tiers AUTO / REVIEW / INSUFFICIENT.
--
--   INSUFFICIENT  no candidate, the top candidate is only fuzzy, its score is below 1.0 (brand or category
--                 contradicted), it carries a warning, or it is quarantined / REJECTED / CONFLICTING
--   CONFLICTING   another strong candidate for a different product within 0.02 of the top score
--   FAMILY        the top candidate is a product line (entity_level = family)
--   MATCH         otherwise
--
-- Local only; goes to production with the other catalog migrations after Henri's review.

create or replace function public.catalog_match(
  query text,
  manufacturer_hint text default null
)
returns table (
  decision text,
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
  runner_up_score numeric
)
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  strong constant text[] := array['exact_alias', 'exact_alias_with_brand', 'alias_tokens', 'model_code', 'sku'];
  min_score constant numeric := 1.0;
  tie constant numeric := 0.02;
  h record;
  top record;
  n int := 0;
  why text[] := '{}';
  rival_id uuid;
  rival_score numeric;
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
    reasons := array['no_candidate'];
    return next;
    return;
  end if;

  if not top.match_type = any(strong) then why := why || 'fuzzy_only'::text; end if;
  if top.score < min_score then why := why || 'low_score'::text; end if;
  if top.warning is not null then why := why || 'warning'::text; end if;
  if top.quality_status = 'quarantined' then why := why || 'quarantined'::text; end if;
  if top.verification_status in ('REJECTED', 'CONFLICTING') then why := why || 'rejected'::text; end if;

  if cardinality(why) > 0 then
    decision := 'INSUFFICIENT';
  elsif rival_id is not null then
    decision := 'CONFLICTING';
    why := array['tie'];
  elsif top.entity_level = 'family' then
    decision := 'FAMILY';
    why := array['family'];
  else
    decision := 'MATCH';
  end if;

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
  'Phase 4: the lookup decision (MATCH / FAMILY / CONFLICTING / INSUFFICIENT) with its reasons and the top candidate. '
  'The rule is shared with catalog/scripts/eval/run_eval.py; see the migration header.';

grant execute on function public.catalog_match(text, text) to anon, authenticated;
