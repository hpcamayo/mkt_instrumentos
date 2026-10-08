-- Canonical catalog (roadmap Phase 4.7, 2026-09-30): Jev inputs, catalog side only (Henri's D7). One function returns
-- what Jev needs from the catalog for a listing title: the match (decision, tier, reasons, score, match type, warning,
-- the top candidate and its closest rival) and the matched product's detail (DETAILED flag, detail status, missing
-- and untrusted required attributes, publish_ready, verification). The listing side (which product a listing matched,
-- which values were autofilled, which the seller changed) is a written contract in catalog/docs/jev_inputs.md and is
-- built with the post-V1 marketplace work; nothing here changes the V1 listings schema.
-- Local only; production after review.

create or replace function public.catalog_jev_inputs(
  query text,
  manufacturer_hint text default null
)
returns table (
  decision text,
  tier text,
  reasons text[],
  score numeric,
  match_type text,
  warning text,
  brand_mentioned boolean,
  product_id uuid,
  manufacturer text,
  model text,
  category_id text,
  entity_level text,
  verification_status public.catalog_verification_status,
  publish_ready boolean,
  detail_status text,
  detailed boolean,
  missing_attributes text[],
  untrusted_attributes text[],
  runner_up_product_id uuid,
  runner_up_score numeric
)
language sql
stable
set search_path = public, extensions
as $$
  select m.decision, m.tier, m.reasons, m.score, m.match_type, m.warning, m.brand_mentioned,
         m.product_id, m.manufacturer, m.model, m.category_id, m.entity_level, m.verification_status, m.publish_ready,
         p.detail_status, p.detail_status = 'detailed', p.missing_attributes, p.untrusted_attributes,
         m.runner_up_product_id, m.runner_up_score
  from public.catalog_match(query, manufacturer_hint) m
  left join public.catalog_products p on p.id = m.product_id
$$;

comment on function public.catalog_jev_inputs(text, text) is
  'Phase 4.7 (Henri D7): the catalog side of Jev''s inputs for a listing title. Contract: catalog/docs/jev_inputs.md.';

grant execute on function public.catalog_jev_inputs(text, text) to anon, authenticated;
