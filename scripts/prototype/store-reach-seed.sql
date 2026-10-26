-- Demo data for the store-reach batch (docs/feature-ideas/store-reach.md), after demo-seed.sql. Local databases only.
-- The demo store publishes its feed, is an approved Boss dealer with a Fender request waiting for Admin, has two
-- publications in a live Laria campaign (their price history moved back 45 days so they qualify), and last month's
-- "Lo que buscan en Laria" report is built from searches of 30 signed-out sessions. Password: laria-demo-2026.
begin;

do $$ begin
  if exists (select 1 from public.stores where slug = 'laria-demo-musica') is not true then
    raise exception 'run scripts/prototype/demo-seed.sql first';
  end if;
end $$;

-- ------------------------------------------------------------------ reach-02: the store's feed

insert into public.store_feed_settings (store_id, enabled, enabled_at, updated_by)
values ('d1000000-0000-4000-8000-000000000001', true, now() - interval '3 days', 'd0000000-0000-4000-8000-000000000001')
on conflict (store_id) do update set enabled = true, enabled_at = excluded.enabled_at;

-- ------------------------------------------------------------------ reach-04: dealer authorizations

insert into public.store_dealer_authorizations (id, store_id, brand, brand_key, status, document_path, document_name,
  document_type, document_bytes, document_sha256, document_checked_at, valid_until, owner_note, created_by, created_at,
  submitted_at, reviewed_by, reviewed_at)
values
 ('d7000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'Boss', 'boss', 'approved',
  'd0000000-0000-4000-8000-000000000001/d7000000-0000-4000-8000-000000000001/autorizacion.pdf', 'Carta Roland Boss 2026.pdf',
  'application/pdf', 182000, repeat('a', 64), now() - interval '9 days', (now() + interval '300 days')::date,
  'Carta del distribuidor para Perú.', 'd0000000-0000-4000-8000-000000000001', now() - interval '9 days',
  now() - interval '9 days', 'd0000000-0000-4000-8000-000000000002', now() - interval '8 days'),
 ('d7000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'Fender', 'fender', 'pending',
  'd0000000-0000-4000-8000-000000000001/d7000000-0000-4000-8000-000000000002/autorizacion.pdf', 'fender-autorizacion.pdf',
  'application/pdf', 240000, repeat('b', 64), now() - interval '1 day', null, null, 'd0000000-0000-4000-8000-000000000001',
  now() - interval '1 day', now() - interval '1 day', null, null)
on conflict (id) do nothing;

-- ------------------------------------------------------------------ reach-05: a live Laria campaign

-- The demo publications were created a moment ago; a campaign needs 30 days of price history behind them.
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set published_at = now() - interval '45 days'
where store_id = 'd1000000-0000-4000-8000-000000000001' and published_at > now() - interval '45 days';
select set_config('app.allow_listing_admin_fields', '', true);
update public.listing_price_history h set valid_from = now() - interval '45 days'
from public.listings l
where l.id = h.listing_id and l.store_id = 'd1000000-0000-4000-8000-000000000001' and h.valid_to is null
  and h.valid_from > now() - interval '45 days';

insert into public.laria_campaigns (id, slug, name, description, starts_at, ends_at, min_discount_pct, status, created_by)
values
 ('d7100000-0000-4000-8000-000000000001', 'semana-de-la-musica', 'Semana de la música',
  'Tiendas de Laria bajan el precio de instrumentos y accesorios durante una semana. Cada precio se compara con el más bajo de los últimos 30 días.',
  now() - interval '2 days', now() + interval '5 days', 10, 'published', 'd0000000-0000-4000-8000-000000000002'),
 ('d7100000-0000-4000-8000-000000000002', 'regreso-a-clases', 'Regreso a clases',
  'Instrumentos para empezar el año escolar.', now() + interval '20 days', now() + interval '34 days', 10, 'published',
  'd0000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

-- The store joins as itself, so the entries go through the same checks and the job's price change.
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select public.join_campaign('d7100000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 249, 'restore');
select public.join_campaign('d7100000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000003', 399, 'keep');
reset role;
select set_config('request.jwt.claims', '', true);

-- ------------------------------------------------------------------ reach-06: last month's report

insert into public.marketplace_events (event_type, created_at, actor_user_id, session_id, source, metadata)
select 'search',
  date_trunc('month', (now() at time zone 'America/Lima') - interval '1 month') at time zone 'America/Lima' + interval '10 days'
    + (s.n * interval '7 hours'),
  null, ('d7200000-0000-4000-8000-' || lpad(s.n::text, 12, '0'))::uuid, 'catalog',
  jsonb_build_object('query', q.query, 'filters', q.filters, 'result_count', q.results, 'zero_results', q.results = 0)
from generate_series(1, 30) s(n)
join lateral (values
  ('Boss', '{"brand":"Boss","city":"Lima"}'::jsonb, 2, s.n <= 14),
  ('Fender', '{"brand":"Fender","city":"Lima"}'::jsonb, 2, s.n between 6 and 17),
  ('Yamaha', '{"brand":"Yamaha","city":"Arequipa"}'::jsonb, 1, s.n between 12 and 19),
  ('charango electroacústico', '{"q":"charango electroacústico"}'::jsonb, 0, s.n between 15 and 23),
  ('looper', '{"q":"looper"}'::jsonb, 0, s.n between 20 and 26),
  ('', '{"category":"basses","instrument_type":"bass","city":"Cusco"}'::jsonb, 0, s.n between 24 and 30),
  ('', '{"category":"keyboards","city":"Lima"}'::jsonb, 3, s.n between 1 and 9)
) q(query, filters, results, included) on q.included;

select laria_private.build_demand_report(date_trunc('month', (now() at time zone 'America/Lima') - interval '1 month')::date);

commit;
