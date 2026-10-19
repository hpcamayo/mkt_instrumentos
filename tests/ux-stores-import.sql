-- Effortless Laria, batch "stores" (docs/ux-effortless/stores.md): fix-04, re-importing an export never undoes sales.
-- Covers the update scope (prices, stock, both), the "Exportado el" check against movements recorded after the export,
-- the store's choice to use the file's stock anyway, and the mapping rules that follow from the scope.
-- Local/test database only. Every fixture is rolled back. now() is the same for the whole transaction, so "after the
-- export" is modelled with export times an hour before now() (every movement here is later) or a minute after it.
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

create function pg_temp.session(p_id uuid) returns public.store_import_sessions language sql security definer as $$
  select * from public.store_import_sessions where id = p_id
$$;
create function pg_temp.row_of(p_session uuid, p_row integer) returns public.store_import_rows language sql security definer as $$
  select * from public.store_import_rows where session_id = p_session and row_number = p_row
$$;
create function pg_temp.item(p_sku text) returns public.store_inventory_items language sql security definer as $$
  select * from public.store_inventory_items
  where store_id = 'e6100000-0000-4000-8000-000000000001' and sku_normalized = upper(p_sku)
$$;
create function pg_temp.has_issue(p_session uuid, p_row integer, p_code text) returns boolean language sql security definer as $$
  select issues @> jsonb_build_array(jsonb_build_object('code', p_code)) from public.store_import_rows
  where session_id = p_session and row_number = p_row
$$;
create function pg_temp.iso(p_at timestamptz) returns text language sql as $$
  select to_char(p_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
$$;

-- Stages p_count empty raw rows (row numbers 2…), confirms the mapping with the given scope, and returns the session.
create function pg_temp.staged(p_headers jsonb, p_count integer, p_mapping jsonb, p_scope text, p_stale text default null)
returns uuid language plpgsql as $$
declare sid uuid; token uuid;
begin
  sid := (public.create_store_import_session('ux.csv', 'csv', 1000) #>> '{session,id}')::uuid;
  token := (public.claim_store_import_step(sid)->>'lock_token')::uuid;
  perform public.begin_store_import_parse(sid, token, repeat('b', 64), 1000);
  perform public.stage_store_import_rows(sid, token,
    (select jsonb_agg(jsonb_build_object('row_number', n, 'raw', '[]'::jsonb)) from generate_series(2, p_count + 1) n));
  perform public.finish_store_import_parse(sid, token, jsonb_build_object('headers', p_headers, 'header_row', 1,
    'row_count', p_count, 'sheet_name', null));
  perform public.release_store_import_step(sid, token);
  perform public.confirm_store_import_mapping(sid, p_mapping, (pg_temp.session(sid)).version, false, p_scope, p_stale);
  return sid;
end $$;

create function pg_temp.plan(p_session uuid, p_rows jsonb) returns void language plpgsql as $$
declare token uuid;
begin
  token := (public.claim_store_import_step(p_session)->>'lock_token')::uuid;
  perform public.plan_store_import_rows(p_session, token, p_rows);
  perform public.finish_store_import_validation(p_session, token);
  perform public.release_store_import_step(p_session, token);
end $$;

create function pg_temp.commit_all(p_session uuid) returns jsonb language plpgsql as $$
declare token uuid; rows integer[];
begin
  perform public.start_store_import_commit(p_session, (pg_temp.session(p_session)).version);
  token := (public.claim_store_import_step(p_session)->>'lock_token')::uuid;
  select array_agg(row_number order by row_number) into rows from public.store_import_rows where session_id = p_session;
  perform public.commit_store_import_chunk(p_session, token, rows);
  return public.finish_store_import_commit(p_session, token);
end $$;

-- ------------------------------------------------------------------ fixtures

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e6100000-0000-4000-8000-0000000000a1','authenticated','authenticated','ux-stores-owner@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueña UX","phone":"51999996001","city":"Lima","region":"Lima"}');
insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('e6100000-0000-4000-8000-000000000001','ux-tienda','Tienda UX','Tienda UX SAC','20999996001','ux@example.invalid','Contacto UX','Contacto UX','51999996001','Lima','Lima','Av. UX 1','e6100000-0000-4000-8000-0000000000a1','active','free',true);

select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}', true);
set local role authenticated;
select public.admin_set_store_inventory_enabled('e6100000-0000-4000-8000-000000000001', true, 'Piloto UX');
select set_config('request.jwt.claims', '{"sub":"e6100000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select public.create_inventory_item('{"merchant_sku":"A-1","product_name":"Afinador","unit_price_pen":100}', 10, 'qa-ux-item-a');
select public.create_inventory_item('{"merchant_sku":"B-1","product_name":"Cable","unit_price_pen":200}', 5, 'qa-ux-item-b');
select public.create_inventory_item('{"merchant_sku":"C-1","product_name":"Cuerdas","unit_price_pen":30}', 3, 'qa-ux-item-c');
-- The SKU existed before the export: move their opening balances two hours back (the ledger refuses updates, so its
-- guard is paused inside this rolled-back transaction).
reset role;
alter table public.store_stock_movements disable trigger user;
update public.store_stock_movements set created_at = now() - interval '2 hours'
where store_id = 'e6100000-0000-4000-8000-000000000001' and movement_type = 'opening_balance';
alter table public.store_stock_movements enable trigger user;
set local role authenticated;
-- After the export: a counter sale of 2 on A (10 → 8) and one of 1 on C (3 → 2).
select public.record_stock_movement((pg_temp.item('A-1')).id, 'sale', 2, 'tienda_fisica', null, null, null, 'qa-ux-sale-a');
select public.record_stock_movement((pg_temp.item('C-1')).id, 'sale', 1, 'tienda_fisica', null, null, null, 'qa-ux-sale-c');

-- ------------------------------------------------------------------ the mapping follows the scope

do $$ declare sid uuid; v integer; begin
  sid := (public.create_store_import_session('reglas.csv', 'csv', 1000) #>> '{session,id}')::uuid;
  perform public.cancel_store_import(sid);
  -- A fresh session to try mappings on.
  sid := pg_temp.staged('["SKU","Stock","Precio"]', 1, '{"sku":0,"quantity":1,"unit_price_pen":2}', 'both');
  v := (pg_temp.session(sid)).version;
  perform pg_temp.check((pg_temp.session(sid)).options->>'update_scope' = 'both', 'scope stored on the session');
  perform pg_temp.check((pg_temp.session(sid)).options->>'stale_stock' = 'keep', 'today''s stock is kept by default');
  perform pg_temp.expect_error(format($q$select public.confirm_store_import_mapping(%L, '{"sku":0,"unit_price_pen":2}', %s, false, 'both')$q$, sid, v),
    'IMPORT_MAPPING_STOCK_REQUIRED');
  perform pg_temp.expect_error(format($q$select public.confirm_store_import_mapping(%L, '{"sku":0,"unit_price_pen":2}', %s, false, 'stock')$q$, sid, v),
    'IMPORT_MAPPING_STOCK_REQUIRED');
  perform pg_temp.expect_error(format($q$select public.confirm_store_import_mapping(%L, '{"sku":0,"quantity":1}', %s, false, 'prices')$q$, sid, v),
    'IMPORT_MAPPING_PRICE_REQUIRED');
  perform pg_temp.expect_error(format($q$select public.confirm_store_import_mapping(%L, '{"sku":0,"quantity":1}', %s, false, 'todo')$q$, sid, v),
    'IMPORT_SCOPE_INVALID');
  perform pg_temp.expect_error(format($q$select public.confirm_store_import_mapping(%L, '{"sku":0,"quantity":1}', %s, false, 'both', 'maybe')$q$, sid, v),
    'IMPORT_SCOPE_INVALID');
  perform pg_temp.expect_error(format($q$select public.confirm_store_import_mapping(%L, '{"sku":0,"exportado":1}', %s, false, 'prices')$q$, sid, v),
    'IMPORT_MAPPING_INVALID');
  -- Prices only: no stock column needed. The old four-argument call still means "both".
  perform public.confirm_store_import_mapping(sid, '{"sku":0,"unit_price_pen":2}', v, false, 'prices');
  perform pg_temp.check((pg_temp.session(sid)).options->>'update_scope' = 'prices', 'prices scope');
  perform public.confirm_store_import_mapping(sid, '{"sku":0,"quantity":1}', (pg_temp.session(sid)).version);
  perform pg_temp.check((pg_temp.session(sid)).options->>'update_scope' = 'both', 'no scope means both');
  perform public.cancel_store_import(sid);
end $$;

-- ------------------------------------------------------------------ round trip: export, edit prices, re-import

do $$ declare sid uuid; exported text := pg_temp.iso(now() - interval '1 hour'); r public.store_import_rows; begin
  sid := pg_temp.staged('["SKU","Stock","Precio (PEN)","Exportado el"]', 3,
    '{"sku":0,"quantity":1,"unit_price_pen":2,"exported_at":3}', 'both');
  perform pg_temp.plan(sid, jsonb_build_array(
    -- A: stock cell untouched (10 at export), price edited 100 → 120.
    jsonb_build_object('row_number', 2, 'parsed', jsonb_build_object('sku', 'A-1', 'quantity', 10, 'unit_price_pen', 120, 'exported_at', exported)),
    -- B: nothing moved since the export, and the file holds today's stock: nothing to say.
    jsonb_build_object('row_number', 3, 'parsed', jsonb_build_object('sku', 'B-1', 'quantity', 5, 'unit_price_pen', 200, 'exported_at', exported)),
    -- C: the store edited the stock cell 3 → 7, but a sale happened after the export.
    jsonb_build_object('row_number', 4, 'parsed', jsonb_build_object('sku', 'C-1', 'quantity', 7, 'unit_price_pen', 30, 'exported_at', exported))));

  r := pg_temp.row_of(sid, 2);
  perform pg_temp.check(r.planned_action = 'update', 'A updates');
  perform pg_temp.check(not (r.changes ? 'quantity_on_hand'), 'A keeps today''s stock');
  perform pg_temp.check((r.changes #>> '{unit_price_pen,to}')::integer = 120, 'A takes the new price');
  perform pg_temp.check(pg_temp.has_issue(sid, 2, 'IMPORT_STOCK_KEPT'), 'A says the stock is kept');
  perform pg_temp.check(r.issues::text like '%Se mantiene el stock de hoy: 8.%', 'A names today''s stock');
  perform pg_temp.check((pg_temp.row_of(sid, 3)).planned_action = 'unchanged', 'B unchanged');
  perform pg_temp.check(not pg_temp.has_issue(sid, 3, 'IMPORT_STOCK_KEPT'), 'B carries no stock notice');
  r := pg_temp.row_of(sid, 4);
  perform pg_temp.check(r.planned_action = 'unchanged', 'C unchanged: its stock is kept and nothing else changed');
  perform pg_temp.check(pg_temp.has_issue(sid, 4, 'IMPORT_STOCK_STALE'), 'C warns that its edit was not applied');
  perform pg_temp.check(r.issues::text like '%pasa de 3 a 7%hoy hay 2%', 'C names the export count, the file count and today');
  perform pg_temp.check(((pg_temp.session(sid)).counts->>'since_export')::integer = 2, 'two rows moved since the export');
  perform pg_temp.check(((pg_temp.session(sid)).counts->>'since_export_kept')::integer = 2, 'both kept');
  perform pg_temp.check(((pg_temp.session(sid)).counts->>'stock_changes')::integer = 0, 'no stock change planned');

  -- The store recounted: use the file's stock. The mapping is confirmed again with stale_stock = apply.
  perform public.confirm_store_import_mapping(sid, (pg_temp.session(sid)).column_mapping, (pg_temp.session(sid)).version,
    false, 'both', 'apply');
  perform pg_temp.plan(sid, jsonb_build_array(
    jsonb_build_object('row_number', 2, 'parsed', jsonb_build_object('sku', 'A-1', 'quantity', 10, 'unit_price_pen', 120, 'exported_at', exported)),
    jsonb_build_object('row_number', 3, 'parsed', jsonb_build_object('sku', 'B-1', 'quantity', 5, 'unit_price_pen', 200, 'exported_at', exported)),
    jsonb_build_object('row_number', 4, 'parsed', jsonb_build_object('sku', 'C-1', 'quantity', 7, 'unit_price_pen', 30, 'exported_at', exported))));
  perform pg_temp.check((pg_temp.row_of(sid, 4)).changes #>> '{quantity_on_hand,to}' = '7', 'apply: C takes the file''s stock');
  perform pg_temp.check(pg_temp.has_issue(sid, 4, 'IMPORT_STOCK_STALE_APPLIED'), 'apply: C still says it overrides movements');
  perform pg_temp.check((pg_temp.row_of(sid, 2)).changes #>> '{quantity_on_hand,to}' = '10', 'apply: A would go back to 10');
  perform pg_temp.check(((pg_temp.session(sid)).counts->>'since_export_kept')::integer = 0, 'apply: none kept');

  -- Back to keeping today's stock, then apply.
  perform public.confirm_store_import_mapping(sid, (pg_temp.session(sid)).column_mapping, (pg_temp.session(sid)).version,
    false, 'both', 'keep');
  perform pg_temp.plan(sid, jsonb_build_array(
    jsonb_build_object('row_number', 2, 'parsed', jsonb_build_object('sku', 'A-1', 'quantity', 10, 'unit_price_pen', 120, 'exported_at', exported)),
    jsonb_build_object('row_number', 3, 'parsed', jsonb_build_object('sku', 'B-1', 'quantity', 5, 'unit_price_pen', 200, 'exported_at', exported)),
    jsonb_build_object('row_number', 4, 'parsed', jsonb_build_object('sku', 'C-1', 'quantity', 7, 'unit_price_pen', 30, 'exported_at', exported))));
  perform pg_temp.commit_all(sid);
  perform pg_temp.check((pg_temp.item('A-1')).quantity_on_hand = 8, 'the counter sale on A survives the re-import');
  perform pg_temp.check((pg_temp.item('A-1')).unit_price_pen = 120, 'A has the new price');
  perform pg_temp.check((pg_temp.item('C-1')).quantity_on_hand = 2, 'the sale on C survives the re-import');
  perform pg_temp.check((select count(*) from public.store_stock_movements where import_session_id = sid) = 0,
    'no import reconciliation was written');
end $$;

-- ------------------------------------------------------------------ an export time with nothing after it

do $$ declare sid uuid; later text := pg_temp.iso(now() + interval '1 minute'); begin
  sid := pg_temp.staged('["SKU","Stock","Exportado el"]', 1, '{"sku":0,"quantity":1,"exported_at":2}', 'stock');
  perform pg_temp.plan(sid, jsonb_build_array(
    jsonb_build_object('row_number', 2, 'parsed', jsonb_build_object('sku', 'C-1', 'quantity', 6, 'exported_at', later))));
  perform pg_temp.check((pg_temp.row_of(sid, 2)).changes #>> '{quantity_on_hand,to}' = '6', 'no movement after the export: the count applies');
  perform pg_temp.check(not pg_temp.has_issue(sid, 2, 'IMPORT_STOCK_STALE'), 'and no warning');
  perform public.cancel_store_import(sid);
end $$;

-- ------------------------------------------------------------------ an export time that is not one

do $$ declare sid uuid; begin
  sid := pg_temp.staged('["SKU","Stock","Exportado el"]', 3, '{"sku":0,"quantity":1,"exported_at":2}', 'both');
  perform pg_temp.plan(sid, jsonb_build_array(
    jsonb_build_object('row_number', 2, 'parsed', jsonb_build_object('sku', 'A-1', 'quantity', 4, 'exported_at', pg_temp.iso(now() + interval '1 day'))),
    jsonb_build_object('row_number', 3, 'parsed', jsonb_build_object('sku', 'B-1', 'quantity', 4, 'exported_at', '19/10/2026 09:05')),
    jsonb_build_object('row_number', 4, 'parsed', jsonb_build_object('sku', 'C-1', 'quantity', 4, 'exported_at', '2026-02-30T10:00:00Z'))));
  perform pg_temp.check((pg_temp.row_of(sid, 2)).changes #>> '{quantity_on_hand,to}' = '4', 'a future export time is ignored');
  perform pg_temp.check((pg_temp.row_of(sid, 3)).changes #>> '{quantity_on_hand,to}' = '4', 'a local date is ignored');
  perform pg_temp.check((pg_temp.row_of(sid, 4)).changes #>> '{quantity_on_hand,to}' = '4', 'an impossible date is ignored');
  perform public.cancel_store_import(sid);
end $$;

-- ------------------------------------------------------------------ prices only, stock only

do $$ declare sid uuid; begin
  sid := pg_temp.staged('["SKU","Stock","Precio","Nombre"]', 2, '{"sku":0,"quantity":1,"unit_price_pen":2,"product_name":3}', 'prices');
  perform pg_temp.plan(sid, jsonb_build_array(
    jsonb_build_object('row_number', 2, 'parsed', jsonb_build_object('sku', 'B-1', 'quantity', 99, 'unit_price_pen', 210)),
    jsonb_build_object('row_number', 3, 'parsed', jsonb_build_object('sku', 'D-1', 'quantity', 4, 'unit_price_pen', 50, 'product_name', 'Púas'))));
  perform pg_temp.check(not ((pg_temp.row_of(sid, 2)).changes ? 'quantity_on_hand'), 'prices: existing stock untouched');
  perform pg_temp.check((pg_temp.row_of(sid, 2)).changes #>> '{unit_price_pen,to}' = '210', 'prices: price changes');
  perform pg_temp.check(pg_temp.has_issue(sid, 2, 'IMPORT_STOCK_IGNORED'), 'prices: says the stock cell is ignored');
  perform pg_temp.check((pg_temp.row_of(sid, 3)).planned_action = 'create', 'prices: a new SKU is still created');
  perform pg_temp.check((pg_temp.row_of(sid, 3)).changes #>> '{quantity_on_hand,to}' = '4', 'prices: with its opening stock');
  perform pg_temp.commit_all(sid);
  perform pg_temp.check((pg_temp.item('B-1')).quantity_on_hand = 5 and (pg_temp.item('B-1')).unit_price_pen = 210, 'prices applied');
  perform pg_temp.check((pg_temp.item('D-1')).quantity_on_hand = 4, 'new SKU opened with 4');
end $$;

do $$ declare sid uuid; begin
  sid := pg_temp.staged('["SKU","Stock","Precio"]', 1, '{"sku":0,"quantity":1,"unit_price_pen":2}', 'stock');
  perform pg_temp.plan(sid, jsonb_build_array(
    jsonb_build_object('row_number', 2, 'parsed', jsonb_build_object('sku', 'B-1', 'quantity', 9, 'unit_price_pen', 999))));
  perform pg_temp.check((pg_temp.row_of(sid, 2)).changes #>> '{quantity_on_hand,to}' = '9', 'stock: count applies');
  perform pg_temp.check(not ((pg_temp.row_of(sid, 2)).changes ? 'unit_price_pen'), 'stock: price untouched');
  perform pg_temp.check(pg_temp.has_issue(sid, 2, 'IMPORT_PRICE_IGNORED'), 'stock: says the price cell is ignored');
  perform pg_temp.commit_all(sid);
  perform pg_temp.check((pg_temp.item('B-1')).quantity_on_hand = 9 and (pg_temp.item('B-1')).unit_price_pen = 210, 'stock applied, price kept');
end $$;

-- ------------------------------------------------------------------ stock-12: correct a cell in the review

do $$ declare sid uuid; v integer; r public.store_import_rows; begin
  sid := pg_temp.staged('["SKU","Stock","Precio"]', 3, '{"sku":0,"quantity":1,"unit_price_pen":2}', 'both');
  -- Rows 2 and 3 share a SKU (both become duplicates); row 4 is fine.
  perform pg_temp.plan(sid, jsonb_build_array(
    jsonb_build_object('row_number', 2, 'parsed', jsonb_build_object('sku', 'E-1', 'quantity', 1, 'product_name', 'Uno')),
    jsonb_build_object('row_number', 3, 'parsed', jsonb_build_object('sku', 'E-1', 'quantity', 2, 'product_name', 'Dos')),
    jsonb_build_object('row_number', 4, 'parsed', jsonb_build_object('sku', 'F-1', 'quantity', 3, 'product_name', 'Tres'))));
  perform pg_temp.check(pg_temp.has_issue(sid, 2, 'IMPORT_DUPLICATE_SKU') and pg_temp.has_issue(sid, 3, 'IMPORT_DUPLICATE_SKU'), 'twins flagged');
  v := (pg_temp.session(sid)).version;
  perform pg_temp.expect_error(format($q$select public.edit_store_import_cell(%L, 3, 'sku', 'E-2', %s)$q$, sid, v - 1), 'IMPORT_VERSION_CONFLICT');
  perform pg_temp.expect_error(format($q$select public.edit_store_import_cell(%L, 3, 'brand', 'X', %s)$q$, sid, v), 'IMPORT_CELL_INVALID');
  perform pg_temp.expect_error(format($q$select public.edit_store_import_cell(%L, 99, 'sku', 'X', %s)$q$, sid, v), 'IMPORT_ROWS_INVALID');
  perform public.edit_store_import_cell(sid, 3, 'sku', '  E-2 ', v);
  perform pg_temp.check((pg_temp.session(sid)).status = 'validating', 'the session is planned again');
  r := pg_temp.row_of(sid, 3);
  perform pg_temp.check(r.raw->0 = '{"v":"E-2"}'::jsonb and r.planned_action is null, 'the cell replaced, the row unplanned');
  perform pg_temp.check((pg_temp.row_of(sid, 2)).planned_action is null, 'its twin is planned again too');
  perform pg_temp.check((pg_temp.row_of(sid, 4)).planned_action = 'create', 'other rows keep their plan');
  -- The staged row had no cells: the edit pads it only up to the edited column.
  perform pg_temp.check(jsonb_array_length(r.raw) = 1, 'only up to the edited column');
  perform pg_temp.plan(sid, jsonb_build_array(
    jsonb_build_object('row_number', 2, 'parsed', jsonb_build_object('sku', 'E-1', 'quantity', 1, 'product_name', 'Uno')),
    jsonb_build_object('row_number', 3, 'parsed', jsonb_build_object('sku', 'E-2', 'quantity', 2, 'product_name', 'Dos'))));
  perform pg_temp.check((pg_temp.session(sid)).status = 'ready', 'ready again');
  perform pg_temp.check((pg_temp.row_of(sid, 2)).planned_action = 'create' and (pg_temp.row_of(sid, 3)).planned_action = 'create',
    'no duplicate left');
  perform public.cancel_store_import(sid);
  perform pg_temp.expect_error(format($q$select public.edit_store_import_cell(%L, 3, 'sku', 'E-3', %s)$q$, sid, (pg_temp.session(sid)).version),
    'IMPORT_');
end $$;

-- The planning helper is private.
do $$ begin
  perform pg_temp.expect_error($q$select laria_private.import_exported_at('{}'::jsonb)$q$, 'permission denied');
end $$;

reset role;
rollback;
