-- Store locations and receipts demo data (docs/feature-ideas/store-locations.md), for the local prototype only. Run
-- after demo-seed.sql:
--   psql "$PGURL" -v ON_ERROR_STOP=1 -f scripts/prototype/store-locations-seed.sql
-- Laria Demo Música gets two sedes (Miraflores, the main one, and Centro de Lima) with part of its stock moved to the
-- Centro, a Nubefact connection whose token is sealed with the local-only key below, and three receipts: one accepted,
-- one that could not reach Nubefact and one voided. Nothing here ever calls Nubefact.
--   LARIA_EINVOICE_KEY=ERERERERERERERERERERERERERERERERERERERERERE=   (local prototype only; never use it anywhere else)
begin;

do $locations$
declare
  demo_store constant uuid := 'd1000000-0000-4000-8000-000000000001';
  owner_claims constant text := '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}';
  miraflores uuid;
  centro uuid;
  item record;
begin
  if to_regprocedure('public.save_store_location(uuid,jsonb)') is null then
    raise notice 'Store locations not present; skipping';
    return;
  end if;
  if exists (select 1 from public.store_locations where store_id = demo_store) then
    raise notice 'Demo sedes already seeded; skipping';
    return;
  end if;

  perform set_config('request.jwt.claims', owner_claims, true);
  miraflores := (public.save_store_location(null, jsonb_build_object(
    'name', 'Miraflores', 'region', 'Lima', 'city', 'Lima', 'district', 'Miraflores',
    'address', 'Av. Larco 345', 'show_address', true, 'opening_hours', 'Lun a sáb, 10:00 a 20:00',
    'pickup_enabled', true))->'location'->>'id')::uuid;
  centro := (public.save_store_location(null, jsonb_build_object(
    'name', 'Centro de Lima', 'region', 'Lima', 'city', 'Lima', 'district', 'Cercado de Lima',
    'address', 'Jr. Cuzco 220', 'show_address', false, 'opening_hours', 'Lun a vie, 9:00 a 18:00',
    'pickup_enabled', true))->'location'->>'id')::uuid;

  for item in
    select i.id, i.merchant_sku, i.quantity_on_hand from public.store_inventory_items i
    where i.store_id = demo_store and i.merchant_sku in ('BOSS-DS1', 'YAM-C40', 'SHU-SM58', 'DAD-EXL110', 'FEN-FM10G')
  loop
    perform public.transfer_location_stock(item.id, miraflores, centro,
      case item.merchant_sku when 'DAD-EXL110' then 24 when 'BOSS-DS1' then 3 when 'YAM-C40' then 5 else 2 end,
      'Stock inicial del Centro', 'demo-sede-' || item.merchant_sku);
  end loop;
  perform set_config('request.jwt.claims', '', true);

  insert into public.store_einvoice_settings (store_id, api_url, token_ciphertext, token_hint, next_boleta_number,
    next_factura_number, checked_at)
  values (demo_store, 'https://api.nubefact.com/api/v1/demo-laria-local-0001',
    'v1.AQEBAQEBAQEBAQEB.ArpOfiBVyiXkjoXrglnEGg.Itbts9psp6lvW8aywP0Z3v4qE7OG3w', '0000', 4, 2, now());

  insert into public.store_receipts (store_id, kind, series, number, status, sale_key, location_id, customer_doc_type,
    customer_doc_number, customer_name, customer_address, customer_email, lines, igv_affectation, total_cents,
    issue_date, attempts, provider_link, pdf_url, sunat_accepted, sunat_description, error_message, void_reason,
    voided_at, created_at)
  select demo_store, r.kind, r.series, r.number, r.status, r.sale_key, r.location_id, r.doc_type, r.doc_number,
    r.name, r.address, r.email, r.lines, 'gravado', r.total, (now() at time zone 'America/Lima')::date - r.days_ago,
    1, r.link, r.pdf, r.accepted, r.description, r.error, r.void_reason, r.voided_at,
    now() - make_interval(days => r.days_ago)
  from (values
    ('boleta', 'B001', 1, 'accepted', 'demo-receipt-0001', miraflores, 'dni', '45678912', 'Lucía Paredes', null::text,
      'lucia@laria.test', jsonb_build_array(jsonb_build_object('item_id', null, 'sku', 'SHU-SM58',
      'description', 'Shure SM58', 'quantity', 1, 'unit_price_cents', 54900)), 54900::bigint, 2,
      'https://www.nubefact.com/cpe/demo-b001-1', 'https://www.nubefact.com/cpe/demo-b001-1.pdf', true,
      'La Boleta numero B001-1, ha sido aceptada', null::text, null::text, null::timestamptz),
    ('factura', 'F001', 1, 'accepted', 'demo-receipt-0002', centro, 'ruc', '20601234567', 'Sonido Andino S.A.C.',
      'Av. Arequipa 1200, Lince', null, jsonb_build_array(jsonb_build_object('item_id', null, 'sku', 'DAD-EXL110',
      'description', 'Cuerdas D''Addario EXL110 10-46', 'quantity', 10, 'unit_price_cents', 3500)), 35000, 1,
      'https://www.nubefact.com/cpe/demo-f001-1', 'https://www.nubefact.com/cpe/demo-f001-1.pdf', true,
      'La Factura numero F001-1, ha sido aceptada', null, null, null),
    ('boleta', 'B001', 2, 'voided', 'demo-receipt-0003', miraflores, 'none', null, null, null, null,
      jsonb_build_array(jsonb_build_object('item_id', null, 'sku', 'BOSS-DS1', 'description', 'Boss DS-1 Distortion',
      'quantity', 1, 'unit_price_cents', 29900)), 29900, 1, 'https://www.nubefact.com/cpe/demo-b001-2',
      'https://www.nubefact.com/cpe/demo-b001-2.pdf', true, 'Comunicación de baja aceptada', null,
      'Venta devuelta', now() - interval '20 hours'),
    ('boleta', 'B001', 3, 'error', 'demo-receipt-0004', centro, 'none', null, null, null, null,
      jsonb_build_array(jsonb_build_object('item_id', null, 'sku', 'YAM-C40', 'description', 'Yamaha C40',
      'quantity', 1, 'unit_price_cents', 45900)), 45900, 0, null, null, null, null,
      'No pudimos comunicarnos con Nubefact. Reintenta en unos minutos.', null, null)
  ) as r(kind, series, number, status, sale_key, location_id, doc_type, doc_number, name, address, email, lines, total,
         days_ago, link, pdf, accepted, description, error, void_reason, voided_at);
end;
$locations$;

commit;
