-- Effortless Laria, batch "stores" (docs/ux-effortless/stores.md): shop-05 and stock-21.
-- Covers the owner's requests to Admin (more listing allowance, inventory access), the allowance detail behind the meter,
-- and "Ocultarlas", which hides published out-of-stock listings to free slots. Local/test database only; rolled back.
begin;

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

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;

create function pg_temp.as_user(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_admin() returns void language sql as $$
  select set_config('request.jwt.claims',
    '{"sub":"e1000000-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}', true);
$$;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e6200000-0000-4000-8000-0000000000a1','authenticated','authenticated','ux-req-owner@example.invalid',now(),'{}','{"account_type":"store_owner"}'),
 ('e6200000-0000-4000-8000-0000000000a2','authenticated','authenticated','ux-req-other@example.invalid',now(),'{}','{"account_type":"store_owner"}'),
 ('e6200000-0000-4000-8000-0000000000a3','authenticated','authenticated','ux-req-buyer@example.invalid',now(),'{}','{}');
insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('e6200000-0000-4000-8000-000000000001','ux-req-tienda','Tienda Pedidos','Tienda Pedidos SAC','20999997001','req@example.invalid','Contacto','Contacto','51999997001','Lima','Lima','Av. 1','e6200000-0000-4000-8000-0000000000a1','active','free',true),
 ('e6200000-0000-4000-8000-000000000002','ux-req-otra','Otra Tienda','Otra SAC','20999997002','otra@example.invalid','Contacto','Contacto','51999997002','Lima','Lima','Av. 2','e6200000-0000-4000-8000-0000000000a2','active','free',true);

set local role authenticated;

-- ------------------------------------------------------------------ stock-21: inventory access request

select pg_temp.as_user('e6200000-0000-4000-8000-0000000000a3');
select pg_temp.expect_error($$select public.request_store_admin_help('inventory_access')$$, 'STORE_REQUIRED');

select pg_temp.as_user('e6200000-0000-4000-8000-0000000000a1');
select pg_temp.expect_error($$select public.request_store_admin_help('otra_cosa')$$, 'REQUEST_INVALID');
select pg_temp.expect_error($$select public.request_store_admin_help('inventory_access', null, 100)$$, 'REQUEST_INVALID');
select pg_temp.expect_error(format($q$select public.request_store_admin_help('inventory_access', %L)$q$, repeat('x', 501)), 'REQUEST_INVALID');

do $$ declare first jsonb; again jsonb; begin
  first := public.request_store_admin_help('inventory_access', '  Llevamos 300 SKU en Excel.  ');
  perform pg_temp.check(first->>'status' = 'open' and first->>'message' = 'Llevamos 300 SKU en Excel.', 'request opened, message trimmed');
  -- Asking again returns the same open request instead of a second one.
  again := public.request_store_admin_help('inventory_access');
  perform pg_temp.check(again->>'id' = first->>'id', 'one open request per kind');
  perform pg_temp.check((select count(*) from public.store_admin_requests) = 1, 'owner sees only their request');
end $$;

-- Others can't see it, and nobody can write the table directly.
select pg_temp.as_user('e6200000-0000-4000-8000-0000000000a2');
select pg_temp.check((select count(*) from public.store_admin_requests) = 0, 'another store sees nothing');
select pg_temp.expect_error($$insert into public.store_admin_requests(store_id, kind, created_by)
  values ('e6200000-0000-4000-8000-000000000002', 'inventory_access', auth.uid())$$, 'permission denied');
select pg_temp.expect_error($$select public.get_admin_store_requests()$$, 'ADMIN_REQUIRED');
select pg_temp.expect_error($$select public.admin_close_store_request(gen_random_uuid(), 'resolved')$$, 'ADMIN_REQUIRED');

-- Admin sees it with the store's context, turns inventory on and closes it.
select pg_temp.as_admin();
do $$ declare list jsonb; closed jsonb; begin
  list := public.get_admin_store_requests();
  perform pg_temp.check(jsonb_array_length(list) = 1, 'admin sees the open request');
  perform pg_temp.check(list->0->>'store_name' = 'Tienda Pedidos' and (list->0->>'inventory_enabled')::boolean = false
    and (list->0->>'allowance')::integer = 50, 'admin sees the store context');
  perform public.admin_set_store_inventory_enabled('e6200000-0000-4000-8000-000000000001', true, 'Pedido desde Mi tienda');
  perform pg_temp.expect_error(format($q$select public.admin_close_store_request(%L, 'open')$q$, list->0->>'id'), 'REQUEST_INVALID');
  closed := public.admin_close_store_request((list->0->>'id')::uuid, 'resolved', 'Inventario activado');
  perform pg_temp.check(closed->>'status' = 'resolved' and closed->>'resolved_at' is not null, 'closed');
  perform pg_temp.expect_error(format($q$select public.admin_close_store_request(%L, 'dismissed')$q$, list->0->>'id'), 'REQUEST_NOT_FOUND');
  perform pg_temp.check(jsonb_array_length(public.get_admin_store_requests()) = 0, 'no open requests left');
  perform pg_temp.check(jsonb_array_length(public.get_admin_store_requests(null)) = 1, 'history kept');
end $$;

select pg_temp.as_user('e6200000-0000-4000-8000-0000000000a1');
select pg_temp.expect_error($$select public.request_store_admin_help('inventory_access')$$, 'INVENTORY_ALREADY_ENABLED');

-- ------------------------------------------------------------------ shop-05: allowance detail and "Ocultarlas"

select public.create_inventory_item('{"merchant_sku":"R-1","product_name":"Bajo","unit_price_pen":900}', 1, 'qa-ux-req-item-1');
select public.create_inventory_item('{"merchant_sku":"R-2","product_name":"Guitarra","unit_price_pen":800}', 4, 'qa-ux-req-item-2');

-- Two approved listings linked to those SKU, and one pending listing without inventory.
reset role;
insert into public.listings (id, slug, title, seller_type, status, category, city, region, whatsapp_phone, owner_user_id, store_id)
select ('e6200000-0000-4000-8000-0000000001' || n)::uuid, 'ux-req-' || n, 'Instrumento ' || n, 'store',
  (case when n = '03' then 'pending' else 'approved' end)::listing_status, 'pedals', 'Lima', 'Lima', '51999997001',
  'e6200000-0000-4000-8000-0000000000a1', 'e6200000-0000-4000-8000-000000000001'
from unnest(array['01', '02', '03']) n;
update public.store_inventory_items set listing_id = 'e6200000-0000-4000-8000-000000000101'
where store_id = 'e6200000-0000-4000-8000-000000000001' and merchant_sku = 'R-1';
update public.store_inventory_items set listing_id = 'e6200000-0000-4000-8000-000000000102'
where store_id = 'e6200000-0000-4000-8000-000000000001' and merchant_sku = 'R-2';
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set stock_state = 'out_of_stock' where id = 'e6200000-0000-4000-8000-000000000101';
update public.listings set stock_state = 'in_stock' where id = 'e6200000-0000-4000-8000-000000000102';
select set_config('app.allow_listing_admin_fields', '', true);
set local role authenticated;

do $$ declare detail jsonb; result jsonb; replay jsonb; begin
  detail := public.get_store_listing_allowance_detail();
  perform pg_temp.check((detail->>'allowance')::integer = 50 and (detail->>'used')::integer = 3, 'allowance and used');
  perform pg_temp.check((detail->>'approved')::integer = 2 and (detail->>'pending')::integer = 1, 'breakdown');
  perform pg_temp.check((detail->>'out_of_stock')::integer = 1, 'one published listing is out of stock');
  perform pg_temp.check(detail->'open_request' = 'null'::jsonb, 'no allowance request yet');

  perform pg_temp.expect_error($q$select public.hide_out_of_stock_store_listings(null)$q$, 'IDEMPOTENCY');
  result := public.hide_out_of_stock_store_listings('qa-ux-req-hide-1');
  perform pg_temp.check(jsonb_array_length(result->'hidden') = 1
    and result->'hidden'->0->>'listing_id' = 'e6200000-0000-4000-8000-000000000101', 'only the out-of-stock listing is hidden');
  replay := public.hide_out_of_stock_store_listings('qa-ux-req-hide-1');
  perform pg_temp.check((replay->>'replayed')::boolean, 'same key replays');
  detail := public.get_store_listing_allowance_detail();
  perform pg_temp.check((detail->>'used')::integer = 2 and (detail->>'out_of_stock')::integer = 0, 'a slot was freed');
  result := public.hide_out_of_stock_store_listings('qa-ux-req-hide-2');
  perform pg_temp.check(jsonb_array_length(result->'hidden') = 0, 'nothing left to hide');

  -- "Pedir más cupo".
  perform pg_temp.expect_error($q$select public.request_store_admin_help('listing_allowance', null, 0)$q$, 'REQUEST_INVALID');
  result := public.request_store_admin_help('listing_allowance', 'Tenemos 120 instrumentos.', 150);
  perform pg_temp.check((result->>'requested_allowance')::integer = 150, 'requested allowance stored');
  detail := public.get_store_listing_allowance_detail();
  perform pg_temp.check(detail->'open_request'->>'id' = result->>'id', 'the meter shows the open request');
end $$;

-- ------------------------------------------------------------------ stock-10: "Publicar seleccionados"

select public.create_inventory_item('{"merchant_sku":"R-3","product_name":"Teclado","unit_price_pen":700}', 2, 'qa-ux-req-item-3');
-- The SKU's category comes from imports; set it directly here.
reset role;
update public.store_inventory_items set category = 'keyboards' where merchant_sku = 'R-3' and store_id = 'e6200000-0000-4000-8000-000000000001';
set local role authenticated;

do $$ declare result jsonb; sid uuid; r public.store_import_rows; linked uuid; fresh uuid; begin
  select id into linked from public.store_inventory_items where merchant_sku = 'R-2' and store_id = 'e6200000-0000-4000-8000-000000000001';
  select id into fresh from public.store_inventory_items where merchant_sku = 'R-3' and store_id = 'e6200000-0000-4000-8000-000000000001';
  perform pg_temp.expect_error(format($q$select public.create_inventory_publish_selection(array[%L]::uuid[])$q$, linked), 'INVENTORY_PUBLISH_NONE');
  perform pg_temp.expect_error($q$select public.create_inventory_publish_selection('{}')$q$, 'INVENTORY_BULK_INVALID');
  result := public.create_inventory_publish_selection(array[linked, fresh]);
  sid := (result->>'id')::uuid;
  perform pg_temp.check(result->>'status' = 'committed', 'opens as an applied import');
  perform pg_temp.check((select count(*) from public.store_import_rows where session_id = sid) = 1, 'only the unlinked SKU');
  select * into r from public.store_import_rows where session_id = sid;
  perform pg_temp.check(r.applied_item_id = fresh and r.commit_status = 'applied' and r.row_number = 2, 'row applied to the SKU');
  perform pg_temp.check(r.parsed->>'category' = 'keyboards' and (r.parsed->>'unit_price_pen')::integer = 700, 'prefilled from the SKU');
  perform pg_temp.check((select options->>'source' from public.store_import_sessions where id = sid) = 'inventory_selection', 'marked');
  perform pg_temp.check((select count(*) from public.store_stock_movements where import_session_id = sid) = 0, 'no stock change');
  -- It never blocks a real import.
  perform pg_temp.check(public.create_store_import_session('real.csv', 'csv', 100) #>> '{session,status}' = 'awaiting_upload', 'a real import can start');
end $$;

-- Another store can't stage this store's SKU.
select pg_temp.as_user('e6200000-0000-4000-8000-0000000000a2');
select pg_temp.expect_error($$select public.create_inventory_publish_selection(array(select id from public.store_inventory_items limit 1))$$, 'INVENTORY');
-- A store without inventory can't use "Ocultarlas" (it only works on inventory-linked listings).
select pg_temp.expect_error($$select public.hide_out_of_stock_store_listings('qa-ux-req-hide-3')$$, 'INVENTORY');

rollback;
