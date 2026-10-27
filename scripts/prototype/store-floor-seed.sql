-- Store floor demo data (docs/feature-ideas/store-floor.md), for the local prototype only. Run after demo-seed.sql:
--   psql "$PGURL" -v ON_ERROR_STOP=1 -f scripts/prototype/store-floor-seed.sql
-- Laria Demo Música gets a warranty for new gear, try-outs switched on, a "Por llegar" date on the Boss TU-3 (out of
-- stock) and two try-outs from comprador@laria.test: the soonest one confirmed, a later one waiting for the store; and
-- interest-free installments (buy-09).
begin;

do $floor$
declare
  demo_store constant uuid := 'd1000000-0000-4000-8000-000000000001';
  owner_claims constant text := '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}';
  buyer_claims constant text := '{"sub":"d0000000-0000-4000-8000-000000000003","role":"authenticated"}';
  slots jsonb;
  first_tryout jsonb;
begin
  if to_regprocedure('public.set_store_tryout_settings(jsonb)') is null then
    raise notice 'Store floor not present; skipping';
    return;
  end if;

  perform set_config('request.jwt.claims', owner_claims, true);
  perform public.set_store_warranty_policy('new',
    '{"warranty_months":12,"warranty_provider":"brand","returns_days":7,"returns_note":"Con boleta y en su empaque"}');
  perform public.set_store_tryout_settings(jsonb_build_object(
    'enabled', true,
    'weekly_hours', '{"1":[["10:00","19:00"]],"2":[["10:00","19:00"]],"3":[["10:00","19:00"]],"4":[["10:00","19:00"]],"5":[["10:00","19:00"]],"6":[["10:00","14:00"]]}'::jsonb,
    'min_notice_hours', 1,
    'note', 'Si quieres probar con tu equipo, tráelo. Tenemos amplificadores y cables.'));
  perform public.set_inventory_arrival(
    array(select i.id from public.store_inventory_items i where i.store_id = demo_store and i.merchant_sku = 'BOSS-TU3'),
    (now() at time zone 'America/Lima')::date + 9);

  perform set_config('request.jwt.claims', buyer_claims, true);
  slots := public.get_listing_tryout_slots('d2000000-0000-4000-8000-000000000002') -> 'slots';
  if jsonb_array_length(slots) < 5 then
    raise notice 'Too few try-out slots ahead; skipping the demo try-outs';
    return;
  end if;
  first_tryout := public.request_store_tryout('d2000000-0000-4000-8000-000000000002', (slots ->> 0)::timestamptz,
    'Carla Compradora', '987654321', 'Quiero compararla con una Telecaster, si tienen una.', 'demo-prueba-strat');
  perform public.request_store_tryout('d2000000-0000-4000-8000-000000000007', (slots ->> 4)::timestamptz,
    'Carla Compradora', '987654321', null, 'demo-prueba-bajo');

  perform set_config('request.jwt.claims', owner_claims, true);
  perform public.respond_store_tryout((first_tryout ->> 'id')::uuid, 'confirm', null);
end
$floor$;

-- buy-09 "Cuotas": up to 12 interest-free installments with BCP, BBVA or Interbank from S/ 500, approved by Admin. The
-- demo seed already approved "Tarjeta con POS al recoger", so the store's listings from S/ 500 show them.
do $cuotas$
begin
  if to_regprocedure('public.set_store_installments(integer,text[],integer,text,boolean)') is null then
    raise notice 'Cuotas not present; skipping';
    return;
  end if;
  perform set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  perform public.set_store_installments(12, array['BCP', 'BBVA', 'Interbank'], 500, 'Las procesa Izipay en el POS.', true);
  perform set_config('request.jwt.claims',
    '{"sub":"d0000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"role":"admin"}}', true);
  perform public.admin_review_store_installments('d1000000-0000-4000-8000-000000000001', 'approve',
    'Izipay ofrece estas cuotas sin intereses', (select revision from public.store_installment_offers
      where store_id = 'd1000000-0000-4000-8000-000000000001'));
end
$cuotas$;

commit;
