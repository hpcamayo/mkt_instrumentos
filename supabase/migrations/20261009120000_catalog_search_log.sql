-- Canonical catalog (roadmap Phase 4.6, 2026-09-30): search log (Henri's D4). Every lookup Laria makes is recorded, to
-- feed the catalog's gap queue and new test cases.
--
--   * Written only by server-side code, through catalog_search_logged() (EXECUTE for service_role only; anon and
--     authenticated cannot write or read the table). Nothing in Laria calls it yet: catalog autofill is post-V1
--     (docs/functional-spec.md, "Planned After V1: Catalog Autofill and Jev").
--   * Stored: the title with e-mail addresses and phone numbers removed (catalog_redact()), the brand hint, the source
--     (listing_form, store_inventory, admin, eval), the decision, tier, reasons, top product, match type, score and
--     warning, the top candidates, and the time. No account id, no listing id.
--   * Read by admins (JWT app_metadata.role = 'admin', as the other catalog admin tables); catalog_search_gaps groups
--     the titles that did not reach AUTO, most frequent first.
--   * Kept 12 months: catalog_search_log_prune() deletes older rows (to be scheduled with the Phase 5 refreshes).
-- Local only; production after review.

create table if not exists public.catalog_search_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text not null check (source in ('listing_form', 'store_inventory', 'admin', 'eval')),
  query_text text not null,
  manufacturer_hint text,
  decision text,
  tier text,
  reasons text[],
  product_id uuid,
  match_type text,
  score numeric,
  warning text,
  candidates jsonb not null default '[]'::jsonb,
  latency_ms integer
);
create index if not exists catalog_search_log_created_idx on public.catalog_search_log (created_at);
create index if not exists catalog_search_log_tier_idx on public.catalog_search_log (tier, created_at);
comment on table public.catalog_search_log is
  'Phase 4.6 (Henri D4): every catalog lookup Laria makes, redacted (no e-mail, no phone, no account id), kept 12 months.';

alter table public.catalog_search_log enable row level security;
drop policy if exists "catalog_search_log admin read" on public.catalog_search_log;
create policy "catalog_search_log admin read" on public.catalog_search_log
  for select to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false));
revoke all on public.catalog_search_log from anon, authenticated;
grant select on public.catalog_search_log to authenticated;   -- rows only through the admin policy

-- e-mail addresses and Peruvian phone numbers (+51 prefix, 9-digit mobiles 9xx xxx xxx, '(01)' / '01-' Lima landlines). Model codes
-- and store SKUs are kept: a 10-digit Fender part number or a code glued to letters is not a phone number.
create or replace function public.catalog_redact(input text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(input, ''),
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email]', 'g'),
    '\+?\m51[\s.-]?9[0-9]{2}[\s.-]?[0-9]{3}[\s.-]?[0-9]{3}\M', '[telefono]', 'g'),
    '(^|[^0-9A-Za-z])9[0-9]{2}[\s.-]?[0-9]{3}[\s.-]?[0-9]{3}([^0-9A-Za-z]|$)', '\1[telefono]\2', 'g'),
    '(\(01\)\s?|\m01[\s.-])[0-9]{3}[\s.-]?[0-9]{4}\M', '[telefono]', 'g'))
$$;

create or replace function public.catalog_search_logged(
  query text,
  manufacturer_hint text default null,
  source text default 'listing_form'
)
returns setof public.catalog_search_log
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  t0 timestamptz := clock_timestamp();
  m record;
  cands jsonb;
  row_out public.catalog_search_log;
begin
  select * into m from public.catalog_match(query, manufacturer_hint);
  select coalesce(jsonb_agg(jsonb_build_object('product_id', c.product_id, 'manufacturer', c.manufacturer, 'model', c.model,
                                               'match_type', c.match_type, 'score', c.score, 'warning', c.warning)), '[]'::jsonb)
    into cands from public.catalog_lookup(query, manufacturer_hint, 5) c;
  insert into public.catalog_search_log (source, query_text, manufacturer_hint, decision, tier, reasons, product_id,
                                         match_type, score, warning, candidates, latency_ms)
  values (source, public.catalog_redact(query), public.catalog_redact(manufacturer_hint), m.decision, m.tier, m.reasons,
          m.product_id, m.match_type, m.score, m.warning, cands,
          (extract(epoch from clock_timestamp() - t0) * 1000)::int)
  returning * into row_out;
  return next row_out;
end $$;
comment on function public.catalog_search_logged(text, text, text) is
  'Phase 4.6: catalog_match() + one row in catalog_search_log. Server-side only (service_role).';

create or replace function public.catalog_search_log_prune()
returns integer
language sql
volatile
security definer
set search_path = public, extensions
as $$
  with d as (delete from public.catalog_search_log where created_at < now() - interval '12 months' returning 1)
  select count(*)::int from d
$$;

-- titles that did not reach AUTO, grouped: the gap queue's input (admins only, through the table's policy)
create or replace view public.catalog_search_gaps
with (security_invoker = true) as
  select public.catalog_normalize(query_text) as normalized_query, tier, count(*) as searches,
         max(created_at) as last_seen, (array_agg(query_text order by created_at desc))[1] as example
  from public.catalog_search_log
  where tier <> 'AUTO'
  group by 1, 2
  order by searches desc, last_seen desc;

revoke all on function public.catalog_search_logged(text, text, text) from public, anon, authenticated;
revoke all on function public.catalog_search_log_prune() from public, anon, authenticated;
grant execute on function public.catalog_search_logged(text, text, text) to service_role;
grant execute on function public.catalog_search_log_prune() to service_role;
grant execute on function public.catalog_redact(text) to anon, authenticated, service_role;
revoke all on public.catalog_search_gaps from anon;
grant select on public.catalog_search_gaps to authenticated;
