-- Feature ideas, store-locations batch (docs/feature-ideas/store-locations.md), run-03 "Boleta electrónica": the
-- connection settings, preparing a receipt from a Mostrador sale, numbering, the customer rules and the server-only result. Local/test database
-- only. Every fixture is rolled back.
begin;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;

create function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_code in sqlerrm) = 1 then return; end if;
    raise exception 'Expected % from [%], got: % (%)', p_code, p_sql, sqlerrm, sqlstate;
  end;
  raise exception 'Expected % from [%], but it succeeded', p_code, p_sql;
end $$;

create function pg_temp.as_user(p_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.owner_a() returns void language sql as $$ select pg_temp.as_user('5f910000-0000-4000-8000-000000000001') $$;
create function pg_temp.owner_b() returns void language sql as $$ select pg_temp.as_user('5f910000-0000-4000-8000-000000000002') $$;

-- Reads that bypass row-level security, for the checks.
create function pg_temp.item(p_sku text) returns public.store_inventory_items language sql security definer as $$
  select * from public.store_inventory_items where merchant_sku = p_sku
$$;
insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('5f910000-0000-4000-8000-000000000001','authenticated','authenticated','sr-owner-a@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueña A","phone":"51999994901","city":"Lima","region":"Lima"}'),
 ('5f910000-0000-4000-8000-000000000002','authenticated','authenticated','sr-owner-b@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño B","phone":"51999994902","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('5f920000-0000-4000-8000-000000000001','sr-a','Tienda Recibos A','Tienda Recibos A SAC','20999995901','sr-a@example.invalid','Contacto A','Contacto A','51999994901','Lima','Lima','Av. Prueba 1','5f910000-0000-4000-8000-000000000001','active','free',true),
 ('5f920000-0000-4000-8000-000000000002','sr-b','Tienda Recibos B','Tienda Recibos B SAC','20999995902','sr-b@example.invalid','Contacto B','Contacto B','51999994902','Lima','Lima','Av. Prueba 2','5f910000-0000-4000-8000-000000000002','active','free',false);

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at) values
 ('5f930000-0000-4000-8000-000000000001','sr-gtr','Guitarra con boleta','store','approved','guitars','electric_guitar','Fender','Player','Nuevo',3500,'Lima','Lima','Contacto A','51999994901','Descripción de prueba válida con más de cuarenta caracteres.','5f910000-0000-4000-8000-000000000001','5f920000-0000-4000-8000-000000000001','self_service',now());
insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/' || l.slug || '-' || n || '.jpg', n
from public.listings l cross join generate_series(0, 1) n where l.slug like 'sr-%';


-- Store B is active but not verified.

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal2","app_metadata":{"role":"admin"}}', true);
select public.admin_set_store_inventory_enabled('5f920000-0000-4000-8000-000000000001', true, 'Piloto boleta');
select public.admin_set_store_inventory_enabled('5f920000-0000-4000-8000-000000000002', true, 'Piloto boleta');

select pg_temp.owner_a();
select public.create_inventory_item('{"merchant_sku":"SR-GTR","product_name":"Guitarra con boleta","listing_id":"5f930000-0000-4000-8000-000000000001","unit_price_pen":3500}'::jsonb, 5, 'qa-sr-gtr');
select public.create_inventory_item('{"merchant_sku":"SR-CAB","product_name":"Cable","variant_label":"3 m","unit_price_pen":25}'::jsonb, 10, 'qa-sr-cab');
select public.create_inventory_item('{"merchant_sku":"SR-PUA","product_name":"Púas"}'::jsonb, 10, 'qa-sr-pua');

-- Two Mostrador sales: one small, one over S/ 700.
select public.apply_bulk_stock_operations(jsonb_build_array(
  jsonb_build_object('item_id', (pg_temp.item('SR-CAB')).id, 'type', 'sale', 'quantity', 2, 'channel', 'tienda_fisica', 'reference', 'Mostrador')),
  'qa-sr-sale-small');
select public.apply_bulk_stock_operations(jsonb_build_array(
  jsonb_build_object('item_id', (pg_temp.item('SR-GTR')).id, 'type', 'sale', 'quantity', 1, 'channel', 'tienda_fisica', 'reference', 'Mostrador'),
  jsonb_build_object('item_id', (pg_temp.item('SR-CAB')).id, 'type', 'sale', 'quantity', 1, 'channel', 'tienda_fisica', 'reference', 'Mostrador')),
  'qa-sr-sale-big');
select public.apply_bulk_stock_operations(jsonb_build_array(
  jsonb_build_object('item_id', (pg_temp.item('SR-PUA')).id, 'type', 'sale', 'quantity', 3, 'channel', 'tienda_fisica', 'reference', 'Mostrador')),
  'qa-sr-sale-noprice');

-- ================================================================== the connection

select pg_temp.check((public.get_einvoice_settings()->>'connected')::boolean = false, 'not connected yet');
select pg_temp.expect_error($$select public.prepare_store_receipt('{"sale_key":"qa-sr-sale-small","kind":"boleta"}')$$,
  'EINVOICE_NOT_CONNECTED');
select pg_temp.expect_error($$select public.save_einvoice_settings('{"boleta_series":"B002"}')$$, 'EINVOICE_TOKEN_REQUIRED');
select pg_temp.expect_error($$select public.save_einvoice_settings('{"api_url":"https://evil.example/api","token_ciphertext":"v1.a.b.c","token_hint":"abcd"}')$$,
  'EINVOICE_SETTINGS_INVALID');
select pg_temp.expect_error($$select public.save_einvoice_settings('{"api_url":"https://api.nubefact.com/api/v1/abcdef12-3456","token_ciphertext":"v1.a.b.c","token_hint":"abcd","boleta_series":"X001"}')$$,
  'EINVOICE_SETTINGS_INVALID');
select public.save_einvoice_settings('{"api_url":"https://api.nubefact.com/api/v1/abcdef12-3456","token_ciphertext":"v1.aaa.bbb.ccc","token_hint":"9f3c","boleta_series":"b001","checked":true}');
select pg_temp.check(public.get_einvoice_settings()->>'boleta_series' = 'B001' and public.get_einvoice_settings()->>'token_hint' = '9f3c'
  and not (public.get_einvoice_settings() ? 'token_ciphertext') and public.get_einvoice_settings()->>'checked_at' is not null,
  'settings are saved and never return the token');
select pg_temp.expect_error($$select * from public.store_einvoice_settings$$, 'permission denied');
-- Changing the series keeps the token.
select public.save_einvoice_settings('{"factura_series":"F002"}');
select pg_temp.check(public.get_einvoice_settings()->>'factura_series' = 'F002' and public.get_einvoice_settings()->>'token_hint' = '9f3c',
  'a partial save keeps the token');

-- An unverified store cannot connect.
select pg_temp.owner_b();
select pg_temp.expect_error($$select public.save_einvoice_settings('{"api_url":"https://api.nubefact.com/api/v1/abcdef12-3456","token_ciphertext":"v1.a.b.c","token_hint":"abcd"}')$$,
  'RECEIPT_STORE_NOT_VERIFIED');

-- ================================================================== preparing receipts

select pg_temp.owner_a();
do $$
declare result jsonb;
begin
  result := public.prepare_store_receipt('{"sale_key":"qa-sr-sale-small","kind":"boleta","customer":{"email":"Cliente@Example.com"}}');
  perform pg_temp.check(result->'receipt'->>'series' = 'B001' and (result->'receipt'->>'number')::int = 1
    and result->'receipt'->>'status' = 'pending', 'the first boleta is B001-1, pending');
  perform pg_temp.check((result->'receipt'->>'total_cents')::bigint = 5000
    and (result->'receipt'->'lines'->0->>'quantity')::int = 2
    and result->'receipt'->'lines'->0->>'description' = 'Cable · 3 m', 'lines come from the sale and the SKU price');
  perform pg_temp.check(result->'receipt'->>'customer_email' = 'cliente@example.com', 'the e-mail is kept in lower case');
  result := public.prepare_store_receipt('{"sale_key":"qa-sr-sale-small","kind":"boleta"}');
  perform pg_temp.check((result->>'replayed')::boolean and (result->'receipt'->>'number')::int = 1, 'a retry returns the same receipt');
end $$;

select pg_temp.expect_error($$select public.prepare_store_receipt('{"sale_key":"qa-sr-sale-big","kind":"boleta"}')$$,
  'RECEIPT_DOCUMENT_REQUIRED');
select pg_temp.expect_error($$select public.prepare_store_receipt('{"sale_key":"qa-sr-sale-big","kind":"boleta","customer":{"doc_type":"dni","doc_number":"1234","name":"Ana"}}')$$,
  'RECEIPT_DNI');
select pg_temp.expect_error($$select public.prepare_store_receipt('{"sale_key":"qa-sr-sale-big","kind":"boleta","customer":{"doc_type":"dni","doc_number":"12345678"}}')$$,
  'RECEIPT_NAME');
select pg_temp.expect_error($$select public.prepare_store_receipt('{"sale_key":"qa-sr-sale-big","kind":"factura","customer":{"doc_type":"dni","doc_number":"12345678","name":"Ana"}}')$$,
  'RECEIPT_FACTURA');
select pg_temp.expect_error($$select public.prepare_store_receipt('{"sale_key":"qa-sr-sale-big","kind":"factura","customer":{"doc_type":"ruc","doc_number":"30123456789","name":"Empresa"}}')$$,
  'RECEIPT_RUC');
select pg_temp.expect_error($$select public.prepare_store_receipt('{"sale_key":"qa-sr-sale-nothing","kind":"boleta"}')$$,
  'RECEIPT_SALE_NOT_FOUND');
select pg_temp.expect_error($$select public.prepare_store_receipt('{"sale_key":"qa-sr-sale-noprice","kind":"boleta"}')$$,
  'RECEIPT_PRICE');
select pg_temp.expect_error(format($$select public.prepare_store_receipt(%L)$$, jsonb_build_object('sale_key', 'qa-sr-sale-small-2', 'kind', 'boleta',
  'lines', jsonb_build_array(jsonb_build_object('item_id', (pg_temp.item('SR-GTR')).id, 'unit_price_cents', 100)))), 'RECEIPT_SALE_NOT_FOUND');

do $$
declare result jsonb;
begin
  -- A factura with the price actually charged for the guitar.
  result := public.prepare_store_receipt(jsonb_build_object('sale_key', 'qa-sr-sale-big', 'kind', 'factura',
    'customer', jsonb_build_object('doc_type', 'ruc', 'doc_number', '20123456789', 'name', '  Música   Andina SAC ', 'address', 'Av. Arequipa 100'),
    'lines', jsonb_build_array(jsonb_build_object('item_id', (pg_temp.item('SR-GTR')).id, 'unit_price_cents', 339990))));
  perform pg_temp.check(result->'receipt'->>'series' = 'F002' and (result->'receipt'->>'number')::int = 1, 'the first factura is F002-1');
  perform pg_temp.check((result->'receipt'->>'total_cents')::bigint = 339990 + 2500
    and result->'receipt'->>'customer_name' = 'Música Andina SAC', 'the charged price and the cleaned name are used');
  -- The price of a SKU that is not in the sale is refused.
  perform pg_temp.expect_error(format($x$select public.prepare_store_receipt(%L)$x$, jsonb_build_object('sale_key', 'qa-sr-sale-noprice', 'kind', 'boleta',
    'lines', jsonb_build_array(jsonb_build_object('item_id', (pg_temp.item('SR-PUA')).id, 'unit_price_cents', 500),
                               jsonb_build_object('item_id', (pg_temp.item('SR-GTR')).id, 'unit_price_cents', 500)))), 'RECEIPT_INVALID');
  result := public.prepare_store_receipt(jsonb_build_object('sale_key', 'qa-sr-sale-noprice', 'kind', 'boleta',
    'lines', jsonb_build_array(jsonb_build_object('item_id', (pg_temp.item('SR-PUA')).id, 'unit_price_cents', 150))));
  perform pg_temp.check((result->'receipt'->>'number')::int = 2 and (result->'receipt'->>'total_cents')::bigint = 450,
    'the next boleta is B001-2');
end $$;

-- An undone sale cannot get a receipt.
select public.apply_bulk_stock_operations(jsonb_build_array(
  jsonb_build_object('item_id', (pg_temp.item('SR-CAB')).id, 'type', 'sale', 'quantity', 1, 'channel', 'tienda_fisica', 'reference', 'Mostrador')),
  'qa-sr-sale-undone');
select public.undo_stock_movements(array(select m.id from public.store_stock_movements m
  where m.idempotency_key = 'qa-sr-sale-undone:' || (pg_temp.item('SR-CAB')).id::text), 'qa-sr-undo');
select pg_temp.expect_error($$select public.prepare_store_receipt('{"sale_key":"qa-sr-sale-undone","kind":"boleta"}')$$,
  'RECEIPT_SALE_NOT_FOUND');

-- Numbers cannot go back over issued ones.
select pg_temp.expect_error($$select public.save_einvoice_settings('{"next_boleta_number":2}')$$, 'EINVOICE_NUMBER_USED');
select public.save_einvoice_settings('{"next_boleta_number":120}');

-- ================================================================== results come only from the server

select pg_temp.expect_error(format($$select public.record_store_receipt_result(%L, '{"status":"accepted"}')$$,
  (select id from public.store_receipts where series = 'B001' and number = 1)), 'permission denied');
select pg_temp.expect_error($$update public.store_receipts set status = 'accepted'$$, 'permission denied');
select pg_temp.expect_error(format($$select public.request_store_receipt_void(%L, 'Error en el precio')$$,
  (select id from public.store_receipts where series = 'B001' and number = 1)), 'RECEIPT_VOID_NOT_ALLOWED');

reset role;
set local role service_role;
select public.record_store_receipt_result((select id from public.store_receipts where series = 'B001' and number = 1),
  '{"status":"accepted","pdf_url":"https://www.nubefact.com/cpe/abc.pdf","xml_url":"javascript:alert(1)","sunat_description":"La Boleta numero B001-1, ha sido aceptada"}');
reset role;
select pg_temp.check((select status = 'accepted' and pdf_url like 'https://%' and xml_url is null and attempts = 1
  from public.store_receipts where series = 'B001' and number = 1), 'the server records the answer; links must be https');
set local role service_role;
-- A late error never overwrites an accepted receipt.
select public.record_store_receipt_result((select id from public.store_receipts where series = 'B001' and number = 1),
  '{"status":"error","error_message":"timeout"}');
reset role;
select pg_temp.check((select status from public.store_receipts where series = 'B001' and number = 1) = 'accepted',
  'an accepted receipt stays accepted');

set local role authenticated;
select pg_temp.owner_a();
select pg_temp.expect_error(format($$select public.request_store_receipt_void(%L, 'x')$$,
  (select id from public.store_receipts where series = 'B001' and number = 1)), 'RECEIPT_VOID_REASON');
select public.request_store_receipt_void((select id from public.store_receipts where series = 'B001' and number = 1), 'Venta devuelta');
reset role;
set local role service_role;
select public.record_store_receipt_result((select id from public.store_receipts where series = 'B001' and number = 1), '{"status":"voided"}');
reset role;
select pg_temp.check((select status = 'voided' and voided_at is not null from public.store_receipts where series = 'B001' and number = 1),
  'a void the provider accepted marks the receipt voided');

-- ================================================================== privacy

set local role authenticated;
select pg_temp.owner_b();
select pg_temp.check((select count(*) from public.store_receipts) = 0, 'another store sees none of these receipts');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect_error($$select * from public.store_receipts$$, 'permission denied');
select pg_temp.expect_error($$select public.get_einvoice_settings()$$, 'permission denied');

rollback;
