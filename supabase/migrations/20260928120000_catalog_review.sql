-- Phase 2 of the canonical catalog: duplicate review in /admin/catalogo.
--
-- The ETL (catalog/scripts/run_pipeline.py) regenerates catalog_review_candidates on every load,
-- annotated with a stable pair_key, the rule verdict and the AI-proposed verdict. Admin decisions live
-- in catalog_review_decisions, which the loader never truncates; catalog/scripts/review/pull_decisions.py
-- exports them into catalog/config/review_decisions.yaml so the next rebuild applies them.
--
-- Depends on 20260927120000_canonical_catalog.sql and on laria_private.assert_admin() (Sprint 8).

-- ------------------------------------------------------------------ candidates: triage columns
alter table public.catalog_review_candidates
  add column if not exists pair_key text,
  add column if not exists manufacturer_slug text,
  add column if not exists manufacturer_name text,
  add column if not exists model_a text,
  add column if not exists model_b text,
  add column if not exists keys_a text[] not null default '{}',
  add column if not exists keys_b text[] not null default '{}',
  add column if not exists records_a text[] not null default '{}',
  add column if not exists records_b text[] not null default '{}',
  add column if not exists rule_verdict text,
  add column if not exists rule_reason text,
  add column if not exists rule_confidence text,
  add column if not exists ai_verdict text,
  add column if not exists ai_confidence text,
  add column if not exists ai_reason text,
  add column if not exists ai_model text,
  add column if not exists ai_variant_name text,
  add column if not exists priority integer not null default 0,
  add column if not exists decision text;

create unique index if not exists catalog_review_candidates_pair_key_idx
  on public.catalog_review_candidates (pair_key);
create index if not exists catalog_review_candidates_queue_idx
  on public.catalog_review_candidates (status, priority desc, manufacturer_name);

-- ------------------------------------------------------------------ decisions (never regenerated)
create table if not exists public.catalog_review_decisions (
  pair_key text primary key,
  manufacturer_slug text not null,
  kind text,
  model_a text not null,
  model_b text,
  keys_a text[] not null default '{}',
  keys_b text[] not null default '{}',
  records_a text[] not null default '{}',
  records_b text[] not null default '{}',
  verdict text not null check (verdict in ('same', 'distinct', 'variant', 'family', 'reject_a', 'reject_b', 'skip')),
  variant_name text check (variant_name is null or char_length(variant_name) <= 120),
  note text check (note is null or char_length(note) <= 500),
  source text not null default 'human' check (source in ('human', 'ai_accepted', 'rule')),
  ai_verdict text,
  rule_verdict text,
  decided_by uuid,
  decided_by_email text,
  decided_at timestamptz not null default now()
);
create index if not exists catalog_review_decisions_mfr_idx on public.catalog_review_decisions (manufacturer_slug);

alter table public.catalog_review_decisions enable row level security;
revoke all on public.catalog_review_decisions from anon, authenticated;
drop policy if exists "catalog_review_decisions admin read" on public.catalog_review_decisions;
create policy "catalog_review_decisions admin read" on public.catalog_review_decisions
  for select to authenticated using (public.is_admin());

-- verdict -> candidate status
create or replace function laria_private.catalog_review_status_for(p_verdict text)
returns public.catalog_review_status
language sql
immutable
as $$
  select case
    when p_verdict is null or p_verdict = 'skip' then 'pending'::public.catalog_review_status
    when p_verdict in ('same', 'variant') then 'confirmed_same'::public.catalog_review_status
    when p_verdict in ('distinct', 'family') then 'confirmed_distinct'::public.catalog_review_status
    else 'dismissed'::public.catalog_review_status
  end;
$$;
revoke all on function laria_private.catalog_review_status_for(text) from public, anon, authenticated;

-- ------------------------------------------------------------------ queue
-- p_filter: 'pendientes' (default) | 'prioritarias' (pending, brands with Peruvian demand) |
--           'con_propuesta' (pending with an AI proposal) | 'decididas' | 'todas'
create or replace function public.get_catalog_review_queue(
  p_filter text default 'pendientes',
  p_brand text default null,
  p_search text default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  row_offset integer;
  item_count bigint;
  items jsonb;
  brands jsonb;
  counts jsonb;
  search_pattern text := '%' || lower(trim(coalesce(p_search, ''))) || '%';
begin
  perform laria_private.assert_admin();
  if coalesce(p_filter, '') not in ('', 'pendientes', 'prioritarias', 'con_propuesta', 'decididas', 'todas') then
    raise exception 'CATALOG_REVIEW_FILTER_INVALID';
  end if;
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size not between 1 and 50 then
    raise exception 'ADMIN_PAGINATION_INVALID';
  end if;
  row_offset := (p_page - 1) * p_page_size;

  with filtered as (
    select c.*, d.verdict as d_verdict, d.source as d_source, d.variant_name as d_variant_name, d.note as d_note,
           d.decided_by_email as d_email, d.decided_at as d_at,
           count(*) over () as total_rows
    from public.catalog_review_candidates c
    left join public.catalog_review_decisions d on d.pair_key = c.pair_key
    where c.pair_key is not null
      and c.model_b is not null
      and (p_brand is null or p_brand = '' or c.manufacturer_slug = p_brand)
      and (p_search is null or trim(p_search) = ''
           or lower(coalesce(c.model_a, '') || ' ' || coalesce(c.model_b, '') || ' ' || coalesce(c.manufacturer_name, '')) like search_pattern)
      and case coalesce(nullif(p_filter, ''), 'pendientes')
            when 'pendientes' then c.status = 'pending'
            when 'prioritarias' then c.status = 'pending' and c.priority > 0
            when 'con_propuesta' then c.status = 'pending' and c.ai_verdict is not null
            when 'decididas' then c.status <> 'pending'
            else true
          end
    order by c.priority desc, c.manufacturer_name, c.model_a, c.pair_key
    offset row_offset limit p_page_size
  )
  select coalesce(max(f.total_rows), 0),
    coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id, 'pair_key', f.pair_key, 'kind', f.kind, 'reason', f.reason, 'status', f.status,
        'manufacturer_slug', f.manufacturer_slug, 'manufacturer_name', f.manufacturer_name, 'priority', f.priority,
        'rule_verdict', f.rule_verdict, 'rule_reason', f.rule_reason, 'rule_confidence', f.rule_confidence,
        'ai_verdict', f.ai_verdict, 'ai_confidence', f.ai_confidence, 'ai_reason', f.ai_reason, 'ai_model', f.ai_model,
        'ai_variant_name', f.ai_variant_name,
        'decision', f.d_verdict, 'decision_source', f.d_source, 'decision_variant_name', f.d_variant_name,
        'decision_note', f.d_note, 'decided_by_email', f.d_email, 'decided_at', f.d_at,
        'a', laria_private.catalog_review_side(f.product_a, f.model_a),
        'b', laria_private.catalog_review_side(f.product_b, f.model_b))
      order by f.priority desc, f.manufacturer_name, f.model_a, f.pair_key), '[]'::jsonb)
  into item_count, items
  from filtered f;
  -- count(*) over () is computed before offset/limit, but an empty page loses it: recount then
  if items = '[]'::jsonb then
    select count(*) into item_count
    from public.catalog_review_candidates c
    where c.pair_key is not null and c.model_b is not null
      and (p_brand is null or p_brand = '' or c.manufacturer_slug = p_brand)
      and (p_search is null or trim(p_search) = ''
           or lower(coalesce(c.model_a, '') || ' ' || coalesce(c.model_b, '') || ' ' || coalesce(c.manufacturer_name, '')) like search_pattern)
      and case coalesce(nullif(p_filter, ''), 'pendientes')
            when 'pendientes' then c.status = 'pending'
            when 'prioritarias' then c.status = 'pending' and c.priority > 0
            when 'con_propuesta' then c.status = 'pending' and c.ai_verdict is not null
            when 'decididas' then c.status <> 'pending'
            else true
          end;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('slug', b.manufacturer_slug, 'name', b.manufacturer_name,
                                               'pending', b.pending, 'priority', b.priority)
                            order by b.priority desc, b.pending desc, b.manufacturer_name), '[]'::jsonb)
  into brands
  from (
    select manufacturer_slug, max(manufacturer_name) as manufacturer_name, max(priority) as priority,
           count(*) filter (where status = 'pending') as pending
    from public.catalog_review_candidates
    where pair_key is not null and model_b is not null
    group by manufacturer_slug
    having count(*) filter (where status = 'pending') > 0
    order by max(priority) desc, count(*) filter (where status = 'pending') desc
    limit 80
  ) b;

  select jsonb_build_object(
    'pendientes', count(*) filter (where status = 'pending'),
    'prioritarias', count(*) filter (where status = 'pending' and priority > 0),
    'con_propuesta', count(*) filter (where status = 'pending' and ai_verdict is not null),
    'decididas', count(*) filter (where status <> 'pending'),
    'todas', count(*))
  into counts
  from public.catalog_review_candidates
  where pair_key is not null and model_b is not null;

  return jsonb_build_object('filter', coalesce(nullif(p_filter, ''), 'pendientes'), 'brand', coalesce(p_brand, ''),
                            'page', p_page, 'page_size', p_page_size, 'total', item_count,
                            'counts', counts, 'brands', brands, 'items', items);
end;
$$;

-- one side of a pair, with the evidence a reviewer needs
create or replace function laria_private.catalog_review_side(p_product uuid, p_fallback_name text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'id', p.id, 'name', p.canonical_model_name, 'category_id', p.category_id, 'category_label', cat.label_es,
      'entity_level', p.entity_level, 'status', p.verification_status, 'quality_status', p.quality_status,
      'model_code', p.model_code, 'introduction_year', p.introduction_year, 'discontinuation_year', p.discontinuation_year,
      'source_count', p.source_count,
      'sources', coalesce((select jsonb_agg(jsonb_build_object('source_id', s.source_id, 'name', s.source_model_name,
                                                              'url', s.source_url))
                           from (select * from public.catalog_product_sources s where s.product_id = p.id
                                 order by s.confidence desc, s.source_id limit 6) s), '[]'::jsonb),
      'aliases', coalesce((select jsonb_agg(a.alias) from (select alias from public.catalog_product_aliases a
                           where a.product_id = p.id and a.alias_type not in ('manufacturer_prefixed', 'punctuation_variant')
                           order by a.confidence desc, a.alias limit 6) a), '[]'::jsonb),
      'variants', coalesce((select jsonb_agg(v.variant_name) from (select variant_name from public.catalog_product_variants v
                            where v.product_id = p.id order by v.variant_name limit 6) v), '[]'::jsonb))
    from public.catalog_products p
    left join public.catalog_categories cat on cat.id = p.category_id
    where p.id = p_product
  ), jsonb_build_object('name', p_fallback_name, 'sources', '[]'::jsonb, 'aliases', '[]'::jsonb, 'variants', '[]'::jsonb));
$$;
revoke all on function laria_private.catalog_review_side(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------------ decide / undo
-- Undo = verdict 'skip': the pair returns to pending and the 'skip' row keeps a later rebuild from
-- re-applying an older decision (rows are never deleted, so the file and the database stay consistent).
create or replace function public.decide_catalog_review(
  p_pair_key text,
  p_verdict text,
  p_variant_name text default null,
  p_note text default null,
  p_source text default 'human'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.catalog_review_candidates%rowtype;
  actor_email text := coalesce(auth.jwt() ->> 'email', '');
begin
  perform laria_private.assert_admin();
  select * into c from public.catalog_review_candidates where pair_key = p_pair_key for update;
  if not found then raise exception 'CATALOG_REVIEW_NOT_FOUND'; end if;
  if p_source not in ('human', 'ai_accepted') then raise exception 'CATALOG_REVIEW_SOURCE_INVALID'; end if;

  if p_verdict is null or p_verdict not in ('same', 'distinct', 'variant', 'family', 'reject_a', 'reject_b', 'skip') then
    raise exception 'CATALOG_REVIEW_VERDICT_INVALID';
  end if;
  if p_verdict = 'variant' and char_length(trim(coalesce(p_variant_name, ''))) < 1 then
    raise exception 'CATALOG_REVIEW_VARIANT_NAME_REQUIRED';
  end if;
  if p_source = 'ai_accepted' and p_verdict is distinct from c.ai_verdict then
    raise exception 'CATALOG_REVIEW_AI_MISMATCH';
  end if;

  insert into public.catalog_review_decisions as d (
    pair_key, manufacturer_slug, kind, model_a, model_b, keys_a, keys_b, records_a, records_b, verdict,
    variant_name, note, source, ai_verdict, rule_verdict, decided_by, decided_by_email, decided_at)
  values (
    c.pair_key, c.manufacturer_slug, c.kind, c.model_a, c.model_b, c.keys_a, c.keys_b, c.records_a, c.records_b,
    p_verdict, case when p_verdict = 'variant' then left(trim(p_variant_name), 120) end,
    nullif(left(trim(coalesce(p_note, '')), 500), ''), p_source, c.ai_verdict, c.rule_verdict,
    auth.uid(), actor_email, now())
  on conflict (pair_key) do update set
    verdict = excluded.verdict, variant_name = excluded.variant_name, note = excluded.note,
    source = excluded.source, ai_verdict = excluded.ai_verdict, rule_verdict = excluded.rule_verdict,
    decided_by = excluded.decided_by, decided_by_email = excluded.decided_by_email, decided_at = now();

  update public.catalog_review_candidates
    set status = laria_private.catalog_review_status_for(p_verdict), decision = p_verdict,
        reviewed_by = auth.uid(), reviewed_at = now()
    where pair_key = p_pair_key;
  return jsonb_build_object('pair_key', p_pair_key, 'verdict', p_verdict);
end;
$$;

-- Accept the AI proposals (confidence 'high', verdict other than skip) of pending pairs from brands
-- without Peruvian demand (priority = 0). Priority brands are always confirmed one by one.
create or replace function public.accept_catalog_ai_proposals(p_brand text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
begin
  perform laria_private.assert_admin();
  for r in
    select pair_key, ai_verdict, coalesce(nullif(ai_variant_name, ''), model_b) as variant_name
    from public.catalog_review_candidates
    where status = 'pending' and priority = 0 and ai_confidence = 'high'
      and ai_verdict in ('same', 'distinct', 'variant', 'family', 'reject_a', 'reject_b')
      and pair_key is not null and model_b is not null
      and (p_brand is null or p_brand = '' or manufacturer_slug = p_brand)
  loop
    perform public.decide_catalog_review(
      r.pair_key, r.ai_verdict, case when r.ai_verdict = 'variant' then r.variant_name end,
      'Propuesta IA aceptada en bloque', 'ai_accepted');
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Export for catalog/scripts/review/pull_decisions.py (also served as JSON from /admin/catalogo/decisiones).
create or replace function public.get_catalog_review_decisions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform laria_private.assert_admin();
  return coalesce((select jsonb_agg(to_jsonb(d) order by d.manufacturer_slug, d.pair_key)
                   from public.catalog_review_decisions d), '[]'::jsonb);
end;
$$;

revoke all on function public.get_catalog_review_queue(text, text, text, integer, integer) from public, anon;
revoke all on function public.decide_catalog_review(text, text, text, text, text) from public, anon;
revoke all on function public.accept_catalog_ai_proposals(text) from public, anon;
revoke all on function public.get_catalog_review_decisions() from public, anon;
grant execute on function public.get_catalog_review_queue(text, text, text, integer, integer) to authenticated;
grant execute on function public.decide_catalog_review(text, text, text, text, text) to authenticated;
grant execute on function public.accept_catalog_ai_proposals(text) to authenticated;
grant execute on function public.get_catalog_review_decisions() to authenticated;
