-- Deal-trust batch (docs/feature-ideas/deal-trust.md): counter purchase codes (reach-11), review photos (safe-06),
-- seller pages (sell-09), seller levels (sell-08), buyer track records (safe-07), provenance (safe-11), safe spots
-- (safe-03), the shared helpers and the patched readers. Local/test database only. Every fixture is rolled back.
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
    if position(p_code in sqlerrm) > 0 then return; end if;
    raise exception 'Expected % from [%], got: % (%)', p_code, p_sql, sqlerrm, sqlstate;
  end;
  raise exception 'Expected % from [%], but it succeeded', p_code, p_sql;
end $$;

create function pg_temp.as_user(p_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"d7100000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal2","app_metadata":{"role":"admin"}}', true);
end $$;

-- Values carried between steps (the role switches end each do block).
create temp table qa_values(name text primary key, value text);
grant all on qa_values to anon, authenticated;
create function pg_temp.put(p_name text, p_value text) returns void language sql as $$
  insert into qa_values values (p_name, p_value) on conflict (name) do update set value = excluded.value
$$;
create function pg_temp.get(p_name text) returns text language sql as $$ select value from qa_values where name = p_name $$;

-- People: S sells as a Particular, B and C buy, O owns the store, X is anyone else. D, E and F bought from S too, and G
-- did with an account two days old. Accounts are a month old unless said otherwise: launch audit A17 counts a buyer
-- (laria_private.counted_buyers) and holds their review by the account's age.
insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at) values
 ('d7100000-0000-4000-8000-000000000001','authenticated','authenticated','trust-s@example.invalid',now(),'{}','{"account_type":"individual","full_name":"María Pérez","phone":"51999997001","city":"Lima","region":"Lima"}',now() - interval '30 days'),
 ('d7100000-0000-4000-8000-000000000002','authenticated','authenticated','trust-b@example.invalid',now(),'{}','{"account_type":"individual","full_name":"Bruno Díaz","phone":"51999997002","city":"Lima","region":"Lima"}',now() - interval '30 days'),
 ('d7100000-0000-4000-8000-000000000003','authenticated','authenticated','trust-c@example.invalid',now(),'{}','{"account_type":"individual","full_name":"Carla Ruiz","phone":"51999997003","city":"Lima","region":"Lima"}',now() - interval '30 days'),
 ('d7100000-0000-4000-8000-000000000004','authenticated','authenticated','trust-o@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Olga Tienda","phone":"51999997004","city":"Lima","region":"Lima"}',now() - interval '30 days'),
 ('d7100000-0000-4000-8000-000000000005','authenticated','authenticated','trust-x@example.invalid',now(),'{}','{"account_type":"individual","full_name":"Xavier Otro","phone":"51999997005","city":"Lima","region":"Lima"}',now() - interval '30 days'),
 ('d7100000-0000-4000-8000-000000000099','authenticated','authenticated','trust-admin@example.invalid',now(),'{"role":"admin"}','{"account_type":"individual","full_name":"Admin Confianza","phone":"51999997099","city":"Lima","region":"Lima"}',now() - interval '30 days'),
 ('d7100000-0000-4000-8000-000000000006','authenticated','authenticated','trust-d@example.invalid',now(),'{}','{"account_type":"individual","full_name":"Diana Soto","phone":"51999997006","city":"Lima","region":"Lima"}',now() - interval '30 days'),
 ('d7100000-0000-4000-8000-000000000007','authenticated','authenticated','trust-e@example.invalid',now(),'{}','{"account_type":"individual","full_name":"Elena Quispe","phone":"51999997007","city":"Lima","region":"Lima"}',now() - interval '30 days'),
 ('d7100000-0000-4000-8000-000000000008','authenticated','authenticated','trust-f@example.invalid',now(),'{}','{"account_type":"individual","full_name":"Fabio Rojas","phone":"51999997008","city":"Lima","region":"Lima"}',now() - interval '30 days'),
 ('d7100000-0000-4000-8000-000000000009','authenticated','authenticated','trust-g@example.invalid',now(),'{}','{"account_type":"individual","full_name":"Gina Nueva","phone":"51999997009","city":"Lima","region":"Lima"}',now() - interval '2 days');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,district,address,show_address,owner_user_id,status,listing_plan,is_verified) values
 ('d7200000-0000-4000-8000-000000000001','trust-tienda','Tienda Confianza','Tienda Confianza SAC','20999997101','trust-store@example.invalid','Olga','Olga','51999997004','Lima','Lima','Miraflores','Av. Larco 100',true,'d7100000-0000-4000-8000-000000000004','active','free',true);

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at,attributes) values
 ('d7300000-0000-4000-8000-000000000001','trust-l1','Guitarra Fender Stratocaster','individual','approved','guitars','electric_guitar','Fender','Stratocaster','Bueno',3000,'Lima','Lima','María','51999997001','Descripción de prueba con más de cuarenta caracteres para la guitarra.','d7100000-0000-4000-8000-000000000001',null,'self_service',now(),'{"color":"Sunburst"}'),
 ('d7300000-0000-4000-8000-000000000002','trust-l2','Pedal Boss DS-1','individual','approved','pedals','pedals','Boss','DS-1','Bueno',200,'Lima','Lima','María','51999997001','Descripción de prueba con más de cuarenta caracteres para el pedal.','d7100000-0000-4000-8000-000000000001',null,'self_service',now(),null),
 ('d7300000-0000-4000-8000-000000000003','trust-l3','Teclado Yamaha de tienda','store','approved','keyboards','keyboard','Yamaha','PSR-E373','Nuevo',1200,'Lima','Lima','Olga','51999997004','Descripción de prueba con más de cuarenta caracteres para el teclado.','d7100000-0000-4000-8000-000000000004','d7200000-0000-4000-8000-000000000001','self_service',now(),null);

-- Four more sales of S, so the seller level has something to count (five verified sales in all with L1).
insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,created_by_source,marketplace_rules_accepted_at,sold_at)
select ('d7300000-0000-4000-8000-00000000001' || n)::uuid, 'trust-sold-' || n, 'Equipo vendido ' || n, 'individual', 'sold', 'pedals', 'pedals', 'Boss', 'TU-3', 'Bueno', 300, 'Lima', 'Lima',
  'María', '51999997001', 'Descripción de prueba con más de cuarenta caracteres para el equipo.', 'd7100000-0000-4000-8000-000000000001', 'self_service', now(), now() - interval '12 days'
from generate_series(1, 4) n;
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set status = 'sold', sold_at = now() - interval '12 days' where id = 'd7300000-0000-4000-8000-000000000001';
select set_config('app.allow_listing_admin_fields', '', true);

insert into public.transaction_claims(id, listing_id, seller_user_id, buyer_user_id, attribution_type, status, created_at, responded_at, ended_at)
select ('d7400000-0000-4000-8000-00000000000' || n)::uuid,
  case n when 1 then 'd7300000-0000-4000-8000-000000000001'::uuid else ('d7300000-0000-4000-8000-00000000001' || (n - 1))::uuid end,
  'd7100000-0000-4000-8000-000000000001',
  case when n % 2 = 1 then 'd7100000-0000-4000-8000-000000000002'::uuid else 'd7100000-0000-4000-8000-000000000003'::uuid end,
  'laria', 'confirmed', now() - interval '12 days', now() - interval '11 days', now() - interval '11 days'
from generate_series(1, 5) n;

-- Sale 1 (L1 to B) is recent, so its reviews are still open; the other four closed their window yesterday.
insert into public.verified_transactions(id, claim_id, listing_id, seller_user_id, buyer_user_id, seller_identity_type, sold_at, verified_at, review_deadline)
select ('d7500000-0000-4000-8000-00000000000' || n)::uuid, ('d7400000-0000-4000-8000-00000000000' || n)::uuid,
  case n when 1 then 'd7300000-0000-4000-8000-000000000001'::uuid else ('d7300000-0000-4000-8000-00000000001' || (n - 1))::uuid end,
  'd7100000-0000-4000-8000-000000000001',
  case when n % 2 = 1 then 'd7100000-0000-4000-8000-000000000002'::uuid else 'd7100000-0000-4000-8000-000000000003'::uuid end,
  'particular', now() - interval '12 days',
  case n when 1 then now() - interval '1 day' else now() - interval '11 days' end,
  case n when 1 then now() + interval '9 days' else now() - interval '1 day' end
from generate_series(1, 5) n;

-- Visible buyer reviews of S on sales 2-4 (window closed): 5, 5 and 4. Sellers' reviews of the buyers too.
insert into public.transaction_reviews(transaction_id, direction, reviewer_user_id, subject_user_id, rating, comment, submitted_at)
select ('d7500000-0000-4000-8000-00000000000' || n)::uuid, 'buyer_to_seller',
  case when n % 2 = 1 then 'd7100000-0000-4000-8000-000000000002'::uuid else 'd7100000-0000-4000-8000-000000000003'::uuid end,
  'd7100000-0000-4000-8000-000000000001', case n when 4 then 4 else 5 end, 'Todo bien', now() - interval '5 days'
from generate_series(2, 4) n;
insert into public.transaction_reviews(transaction_id, direction, reviewer_user_id, subject_user_id, rating, comment, submitted_at)
values ('d7500000-0000-4000-8000-000000000003', 'seller_to_buyer', 'd7100000-0000-4000-8000-000000000001',
  'd7100000-0000-4000-8000-000000000002', 5, 'Comprador puntual, comentario privado', now() - interval '5 days');

-- Those five went to B and C. Four more sales of S, to D, E, F and G, closed their window without reviews: S has sold
-- to six people and five of them count (launch audit A17: not G, whose account is two days old), which the seller page
-- and the level read.
insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,created_by_source,marketplace_rules_accepted_at,sold_at)
select ('d7300000-0000-4000-8000-00000000003' || n)::uuid, 'trust-sold-more-' || n, 'Otro equipo vendido ' || n, 'individual', 'sold', 'pedals', 'pedals', 'Boss', 'TU-3', 'Bueno', 300, 'Lima', 'Lima',
  'María', '51999997001', 'Descripción de prueba con más de cuarenta caracteres para el equipo.', 'd7100000-0000-4000-8000-000000000001', 'self_service', now(), now() - interval '12 days'
from generate_series(1, 4) n;
insert into public.transaction_claims(id, listing_id, seller_user_id, buyer_user_id, attribution_type, status, created_at, responded_at, ended_at)
select ('d7400000-0000-4000-8000-00000000003' || n)::uuid, ('d7300000-0000-4000-8000-00000000003' || n)::uuid, 'd7100000-0000-4000-8000-000000000001',
  ('d7100000-0000-4000-8000-00000000000' || (n + 5))::uuid, 'laria', 'confirmed', now() - interval '12 days', now() - interval '11 days', now() - interval '11 days'
from generate_series(1, 4) n;
insert into public.verified_transactions(id, claim_id, listing_id, seller_user_id, buyer_user_id, seller_identity_type, sold_at, verified_at, review_deadline)
select ('d7500000-0000-4000-8000-00000000003' || n)::uuid, ('d7400000-0000-4000-8000-00000000003' || n)::uuid, ('d7300000-0000-4000-8000-00000000003' || n)::uuid,
  'd7100000-0000-4000-8000-000000000001', ('d7100000-0000-4000-8000-00000000000' || (n + 5))::uuid, 'particular',
  now() - interval '12 days', now() - interval '11 days', now() - interval '1 day'
from generate_series(1, 4) n;

set local role authenticated;
select pg_temp.as_admin();
select public.admin_set_store_inventory_enabled('d7200000-0000-4000-8000-000000000001', true, 'Piloto confianza');
select pg_temp.as_user('d7100000-0000-4000-8000-000000000004');
select pg_temp.put('item', (public.create_inventory_item('{"merchant_sku":"CUE-010","product_name":"Cuerdas 10-46","variant_label":"Níquel"}'::jsonb, 20, 'qa-trust-item-1')->'item'->>'id'));
reset role;

-- ------------------------------------------------------------------ helpers

do $$ declare branch_count integer; begin
  perform laria_private.extend_or_check('public.notifications', 'notifications_target_check',
    $b$event_type = any (array['seller_level_earned', 'seller_level_lapsed']) and listing_id is null and store_id is null$b$);
  select (length(def) - length(replace(def, 'seller_level_earned', ''))) / length('seller_level_earned') into branch_count
  from (select pg_get_constraintdef(oid) def from pg_constraint where conname = 'notifications_target_check') c;
  perform pg_temp.check(branch_count = 1, 'extend_or_check adds a branch once: ' || branch_count);
  perform pg_temp.expect_error($q$select laria_private.patch_function_text('public.get_my_track_record()'::regprocedure, array['no such text'], array['qa-replacement-that-is-not-there'])$q$, 'matched 0 times');
  perform pg_temp.expect_error($q$select laria_private.patch_function_text('public.get_my_track_record()'::regprocedure, array['a'], array[]::text[])$q$, 'needs pairs');
end $$;

-- ------------------------------------------------------------------ reach-11: counter purchase codes

set local role authenticated;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000004');
select public.apply_bulk_stock_operations(jsonb_build_array(jsonb_build_object('item_id', pg_temp.get('item'), 'type', 'sale', 'quantity', 2, 'channel', 'tienda_fisica', 'reference', 'Mostrador')), 'qa-counter-sale-1');
select public.apply_bulk_stock_operations(jsonb_build_array(jsonb_build_object('item_id', pg_temp.get('item'), 'type', 'restock', 'quantity', 2)), 'qa-counter-restock-1');

do $$ declare first jsonb; second jsonb; begin
  perform pg_temp.expect_error($q$select public.create_counter_purchase_code('qa-unknown-sale')$q$, 'COUNTER_SALE_NOT_FOUND');
  perform pg_temp.expect_error($q$select public.create_counter_purchase_code('qa-counter-restock-1')$q$, 'COUNTER_SALE_NOT_FOUND');
  first := public.create_counter_purchase_code('qa-counter-sale-1');
  perform pg_temp.check(first->>'token' ~ '^[0-9a-f]{32}$', 'a code is 32 hex characters');
  perform pg_temp.check(first->'lines'->0->>'name' = 'Cuerdas 10-46 · Níquel' and (first->'lines'->0->>'quantity')::integer = 2, 'the code carries what was sold');
  second := public.create_counter_purchase_code('qa-counter-sale-1');
  perform pg_temp.check(second->>'sale_id' = first->>'sale_id' and second->>'token' <> first->>'token', 'asking again replaces the code of the same sale');
  perform pg_temp.put('sale1', second->>'sale_id');
  perform pg_temp.put('token1', second->>'token');
  perform pg_temp.put('old_token1', first->>'token');
end $$;
reset role;
do $$ begin
  perform pg_temp.check((select token_hash from public.store_counter_sales where id = pg_temp.get('sale1')::uuid) = laria_private.counter_token_hash(pg_temp.get('token1')),
    'only the hash of the code is kept');
end $$;

-- Someone else's store can't make codes for this one.
set local role authenticated;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000005');
do $$ begin
  perform pg_temp.expect_error($q$select public.create_counter_purchase_code('qa-counter-sale-1')$q$, 'INVENTORY_STORE_REQUIRED');
  perform pg_temp.expect_error(format('select public.get_counter_purchase_code_status(%L)', pg_temp.get('sale1')), 'INVENTORY_STORE_REQUIRED');
end $$;
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ declare page jsonb; begin
  page := public.get_counter_purchase(pg_temp.get('token1'));
  perform pg_temp.check(page->>'status' = 'open' and page->'store'->>'name' = 'Tienda Confianza' and not (page->>'mine')::boolean, 'anyone with the code sees the open purchase');
  perform pg_temp.check(page->'transaction_id' = 'null'::jsonb and not page ? 'claimed_by', 'nothing about who confirmed');
  perform pg_temp.check(public.get_counter_purchase(pg_temp.get('old_token1'))->>'status' = 'not_found', 'the replaced code is dead');
  perform pg_temp.check(public.get_counter_purchase('nope')->>'status' = 'not_found', 'garbage is not found');
  perform pg_temp.expect_error(format('select public.claim_counter_purchase(%L)', pg_temp.get('token1')), 'permission denied');
end $$;
reset role;

set local role authenticated;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000004');
do $$ begin
  perform pg_temp.expect_error(format('select public.claim_counter_purchase(%L)', pg_temp.get('token1')), 'COUNTER_OWN_STORE');
end $$;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000002');
do $$ declare claimed jsonb; again jsonb; page jsonb; begin
  claimed := public.claim_counter_purchase(pg_temp.get('token1'));
  perform pg_temp.check(claimed->>'transaction_id' is not null and not (claimed->>'replayed')::boolean, 'the customer confirms the purchase');
  perform pg_temp.put('counter_tx', claimed->>'transaction_id');
  again := public.claim_counter_purchase(pg_temp.get('token1'));
  perform pg_temp.check(again->>'transaction_id' = claimed->>'transaction_id' and (again->>'replayed')::boolean, 'confirming twice is harmless');
  page := public.get_counter_purchase(pg_temp.get('token1'));
  perform pg_temp.check(page->>'status' = 'claimed' and (page->>'mine')::boolean and page->>'transaction_id' = claimed->>'transaction_id', 'the buyer sees their confirmation');
end $$;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000003');
do $$ begin
  perform pg_temp.expect_error(format('select public.claim_counter_purchase(%L)', pg_temp.get('token1')), 'COUNTER_CODE_USED');
  perform pg_temp.check(public.get_counter_purchase(pg_temp.get('token1'))->'transaction_id' = 'null'::jsonb, 'another account sees no transaction');
end $$;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000004');
do $$ declare status jsonb; movements uuid[]; begin
  status := public.get_counter_purchase_code_status(pg_temp.get('sale1')::uuid);
  perform pg_temp.check(status->>'status' = 'claimed' and status->>'buyer_name' = 'Bruno D.' and status->>'transaction_id' = pg_temp.get('counter_tx'), 'the Mostrador learns who confirmed: ' || status::text);
  select array_agg(id) into movements from public.store_stock_movements where idempotency_key like 'qa-counter-sale-1:%';
  perform pg_temp.expect_error(format('select public.undo_stock_movements(%L::uuid[], %L)', movements, 'qa-undo-sale-1'), 'COUNTER_SALE_CONFIRMED');
end $$;
reset role;

do $$ declare tx public.verified_transactions; begin
  select * into tx from public.verified_transactions where id = pg_temp.get('counter_tx')::uuid;
  perform pg_temp.check(tx.claim_id is null and tx.listing_id is null and tx.store_id = 'd7200000-0000-4000-8000-000000000001'
    and tx.seller_user_id = 'd7100000-0000-4000-8000-000000000004' and tx.seller_identity_type = 'store'
    and tx.review_deadline = tx.verified_at + interval '10 days', 'a counter purchase is a store transaction without publication');
  perform pg_temp.check((select count(*) from public.notifications where transaction_id = tx.id and event_type = 'store_counter_purchase_confirmed') = 2, 'both sides are told');
  perform pg_temp.check(not exists (select 1 from laria_private.marketplace_email_deliveries where transaction_id = tx.id), 'no e-mail for counter purchases');
  perform pg_temp.check(exists (select 1 from public.marketplace_events where event_type = 'transaction_verified' and dedupe_key = 'transaction_verified:' || tx.id), 'the verification is counted');
  perform pg_temp.expect_error($q$insert into public.verified_transactions(counter_sale_id, claim_id, listing_id, seller_user_id, store_id, buyer_user_id, seller_identity_type, sold_at, verified_at, review_deadline)
    select counter_sale_id, claim_id, 'd7300000-0000-4000-8000-000000000003', seller_user_id, store_id, buyer_user_id, seller_identity_type, sold_at, verified_at, review_deadline
    from public.verified_transactions where counter_sale_id is not null limit 1$q$, 'verified_transactions');
end $$;

-- An undone sale closes its code; an expired one can't be confirmed; limits per customer.
set local role authenticated;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000004');
select public.apply_bulk_stock_operations(jsonb_build_array(jsonb_build_object('item_id', pg_temp.get('item'), 'type', 'sale', 'quantity', 1, 'channel', 'tienda_fisica', 'reference', 'Mostrador')), 'qa-counter-sale-2');
select public.apply_bulk_stock_operations(jsonb_build_array(jsonb_build_object('item_id', pg_temp.get('item'), 'type', 'sale', 'quantity', 1, 'channel', 'tienda_fisica', 'reference', 'Mostrador')), 'qa-counter-sale-3');
do $$ declare code jsonb; movements uuid[]; begin
  code := public.create_counter_purchase_code('qa-counter-sale-2');
  perform pg_temp.put('token2', code->>'token');
  perform pg_temp.put('sale2', code->>'sale_id');
  select array_agg(id) into movements from public.store_stock_movements where idempotency_key like 'qa-counter-sale-2:%';
  perform public.undo_stock_movements(movements, 'qa-undo-sale-2');
  perform pg_temp.check(public.get_counter_purchase_code_status((code->>'sale_id')::uuid)->>'status' = 'cancelled', 'undoing the sale closes its code');
  perform pg_temp.expect_error($q$select public.create_counter_purchase_code('qa-counter-sale-2')$q$, 'COUNTER_SALE_UNDONE');
  code := public.create_counter_purchase_code('qa-counter-sale-3');
  perform pg_temp.put('token3', code->>'token');
  perform pg_temp.put('sale3', code->>'sale_id');
  perform pg_temp.check(public.cancel_counter_purchase_code((code->>'sale_id')::uuid) = 'cancelled', 'the store can close a code');
  perform pg_temp.check(public.cancel_counter_purchase_code((code->>'sale_id')::uuid) = 'cancelled', 'closing twice is harmless');
end $$;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000003');
do $$ begin
  perform pg_temp.expect_error(format('select public.claim_counter_purchase(%L)', pg_temp.get('token2')), 'COUNTER_SALE_UNDONE');
  perform pg_temp.expect_error(format('select public.claim_counter_purchase(%L)', pg_temp.get('token3')), 'COUNTER_SALE_UNDONE');
  perform pg_temp.expect_error($q$select public.claim_counter_purchase('0123456789abcdef0123456789abcdef')$q$, 'COUNTER_CODE_INVALID');
end $$;
reset role;

update public.store_counter_sales set status = 'open', cancelled_at = null, created_at = now() - interval '2 days', expires_at = now() - interval '1 day'
where id = pg_temp.get('sale3')::uuid;
set local role authenticated;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000003');
do $$ begin
  perform pg_temp.check(public.get_counter_purchase(pg_temp.get('token3'))->>'status' = 'expired', 'an old code reads as expired');
  perform pg_temp.expect_error(format('select public.claim_counter_purchase(%L)', pg_temp.get('token3')), 'COUNTER_CODE_EXPIRED');
end $$;
reset role;

set local role authenticated;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000004');
select public.apply_bulk_stock_operations(jsonb_build_array(jsonb_build_object('item_id', pg_temp.get('item'), 'type', 'sale', 'quantity', 1, 'channel', 'whatsapp_laria', 'reference', 'Mostrador')), 'qa-counter-sale-4');
select pg_temp.put('token4', public.create_counter_purchase_code('qa-counter-sale-4')->>'token');
select pg_temp.as_user('d7100000-0000-4000-8000-000000000002');
do $$ begin
  perform pg_temp.expect_error(format('select public.claim_counter_purchase(%L)', pg_temp.get('token4')), 'COUNTER_STORE_DAILY_LIMIT');
end $$;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000003');
select pg_temp.put('counter_tx_c', public.claim_counter_purchase(pg_temp.get('token4'))->>'transaction_id');
reset role;

-- ------------------------------------------------------------------ reach-11: the counter purchase shows wherever a review can

set local role authenticated;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000002');
do $$ declare center jsonb; detail jsonb; pending jsonb; begin
  center := public.get_counter_transaction_center();
  perform pg_temp.check(jsonb_array_length(center) = 1 and center->0->>'role' = 'buyer' and center->0->>'title' = 'Cuerdas 10-46 · Níquel'
    and center->0->>'seller_name' = 'Tienda Confianza' and center->0->>'origin' = 'counter', 'the buyer''s Compras y ventas lists it: ' || center::text);
  detail := public.get_counter_transaction_detail(pg_temp.get('counter_tx')::uuid);
  perform pg_temp.check(detail->>'role' = 'buyer' and (detail->>'review_window_open')::boolean and detail->'buyer_name' = 'null'::jsonb, 'the buyer opens its detail');
  perform pg_temp.check(public.get_counter_transaction_detail('d7500000-0000-4000-8000-000000000001') is null, 'a publication sale is not a counter purchase');
  pending := public.get_account_pendientes();
  perform pg_temp.check(exists (select 1 from jsonb_array_elements(pending->'buyer'->'reviews_due') due
    where due->>'reference_id' = pg_temp.get('counter_tx') and due->>'title' = 'Compra en Tienda Confianza'), 'the account home asks for the review: ' || (pending->'buyer'->'reviews_due')::text);
  perform pg_temp.put('counter_review_b', public.submit_transaction_review(pg_temp.get('counter_tx')::uuid, 5, 'Muy buena atención')::text);
end $$;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000005');
do $$ begin
  perform pg_temp.check(public.get_counter_transaction_detail(pg_temp.get('counter_tx')::uuid) is null, 'others can''t open it');
  perform pg_temp.check(jsonb_array_length(public.get_counter_transaction_center()) = 0, 'others don''t list it');
end $$;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000004');
do $$ declare center jsonb; begin
  center := public.get_counter_transaction_center();
  perform pg_temp.check(jsonb_array_length(center) = 2 and bool_and(item->>'role' = 'seller') and bool_or(item->>'buyer_name' = 'Bruno D.'), 'the store lists its counter purchases')
  from jsonb_array_elements(center) item;
  perform public.submit_transaction_review(pg_temp.get('counter_tx')::uuid, 4, 'Cliente amable');
  -- Launch audit A17: the buyer's review is the store's first, so it waits for Admin; the store is told so.
  perform pg_temp.check((public.get_counter_transaction_detail(pg_temp.get('counter_tx')::uuid)->>'counterpart_review_held')::boolean,
    'the store learns the buyer''s review waits for Laria');
end $$;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000002');
do $$ declare detail jsonb := public.get_counter_transaction_detail(pg_temp.get('counter_tx')::uuid); begin
  perform pg_temp.check(detail->'own_review'->>'held_at' is not null and not (detail->>'counterpart_review_held')::boolean
    and jsonb_array_length(detail->'visible_reviews') = 1, 'the buyer sees their review held and the store''s review: ' || detail::text);
end $$;
reset role;
do $$ begin
  perform pg_temp.check((select reasons from laria_private.review_holds where review_id = pg_temp.get('counter_review_b')::uuid) = array['first_reviews'],
    'held as the store''s first review');
  perform pg_temp.check(not exists (select 1 from public.notifications where transaction_id = pg_temp.get('counter_tx')::uuid
    and event_type = 'store_counter_review_revealed'), 'no "Ambas reseñas" while one is held');
end $$;
set local role authenticated;
select pg_temp.as_admin();
select public.publish_held_review(pg_temp.get('counter_review_b')::uuid);
reset role;

do $$ declare review public.transaction_reviews; begin
  select * into review from public.transaction_reviews where id = pg_temp.get('counter_review_b')::uuid;
  perform pg_temp.check(review.subject_store_id = 'd7200000-0000-4000-8000-000000000001' and review.subject_user_id is null, 'the buyer reviews the store');
  perform pg_temp.check((select count(*) from public.notifications where transaction_id = pg_temp.get('counter_tx')::uuid and event_type = 'store_counter_review_revealed') = 2,
    'both reviews in and published: revealed with the counter type');
  perform pg_temp.check(laria_private.review_is_visible(review.id), 'and visible');
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ declare reputation jsonb; review_page jsonb; facts jsonb; begin
  reputation := public.get_public_reputation(null, 'd7200000-0000-4000-8000-000000000001', 6);
  perform pg_temp.check((reputation->'buyer_to_seller'->>'review_count')::integer = 1 or (reputation->>'review_count')::integer = 1
    or reputation::text like '%Muy buena atención%', 'the store page shows the review: ' || reputation::text);
  review_page := public.get_public_review_page(null, 'd7200000-0000-4000-8000-000000000001', 0, 20);
  perform pg_temp.check((review_page->>'review_count')::integer = 1 and review_page->'items'->0->'photos' = '[]'::jsonb, 'review pages list it, with photos: ' || review_page::text);
  facts := public.get_public_seller_facts('d7300000-0000-4000-8000-000000000003');
  perform pg_temp.check((facts->>'verified_sales')::integer = 2, 'the store''s verified sales count counter purchases: ' || facts::text);
end $$;
reset role;

set local role authenticated;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000005');
select public.submit_content_report('review', pg_temp.get('counter_review_b')::uuid, 'spam', null);
select pg_temp.as_admin();
do $$ declare domain jsonb; queue jsonb; counter jsonb; begin
  domain := public.get_admin_domain_page('resenas', null, null, 1, 25);
  perform pg_temp.check(exists (select 1 from jsonb_array_elements(domain->'items') item
    where item->>'id' = pg_temp.get('counter_review_b') and item->>'listing_title' = 'Compra en tienda · Tienda Confianza'), 'Admin > Reseñas lists it: ' || domain::text);
  queue := public.get_admin_moderation_queue('resenas', 1, 25);
  perform pg_temp.check(exists (select 1 from jsonb_array_elements(queue->'items') item where item->>'id' = pg_temp.get('counter_review_b')),
    'the reported counter review reaches the queue: ' || queue::text);
  counter := public.get_admin_counter_purchases(1, 25);
  perform pg_temp.check((counter->>'total')::integer = 2 and counter->'items'->0->>'store_name' = 'Tienda Confianza', 'Admin > Confianza lists counter purchases');
end $$;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000002');
do $$ begin
  perform pg_temp.expect_error($q$select public.get_admin_counter_purchases(1, 25)$q$, 'ADMIN_REQUIRED');
end $$;
reset role;

-- Reminders: the existing job skips counter purchases without failing; ours sends one per person, once.
do $$ declare first integer; second integer; begin
  perform laria_private.run_my_listings_reminders();
  update public.verified_transactions set verified_at = now() - interval '9 days', review_deadline = now() + interval '1 day'
  where id = pg_temp.get('counter_tx_c')::uuid;
  first := laria_private.send_counter_review_reminders();
  second := laria_private.send_counter_review_reminders();
  perform pg_temp.check(first = 2 and second = 0, 'counter review reminders go once to each side: ' || first || '/' || second);
end $$;

-- ------------------------------------------------------------------ safe-06: review photos

insert into storage.objects(bucket_id, name, owner, owner_id, metadata) values
 ('review-photos', 'd7100000-0000-4000-8000-000000000002/d7500000-0000-4000-8000-000000000001/a0000000-0000-4000-8000-000000000001.jpg',
  'd7100000-0000-4000-8000-000000000002', 'd7100000-0000-4000-8000-000000000002', '{"mimetype":"image/jpeg","size":120000}'),
 ('review-photos', 'd7100000-0000-4000-8000-000000000002/d7500000-0000-4000-8000-000000000001/a0000000-0000-4000-8000-000000000002.jpg',
  'd7100000-0000-4000-8000-000000000002', 'd7100000-0000-4000-8000-000000000002', '{"mimetype":"image/jpeg","size":130000}'),
 ('review-photos', 'd7100000-0000-4000-8000-000000000002/d7500000-0000-4000-8000-000000000001/a0000000-0000-4000-8000-000000000003.jpg',
  'd7100000-0000-4000-8000-000000000002', 'd7100000-0000-4000-8000-000000000002', '{"mimetype":"image/jpeg","size":130000}'),
 ('review-photos', 'd7100000-0000-4000-8000-000000000002/d7500000-0000-4000-8000-000000000001/a0000000-0000-4000-8000-000000000004.jpg',
  'd7100000-0000-4000-8000-000000000002', 'd7100000-0000-4000-8000-000000000002', '{"mimetype":"image/jpeg","size":130000}'),
 ('review-photos', 'd7100000-0000-4000-8000-000000000002/d7500000-0000-4000-8000-000000000001/a0000000-0000-4000-8000-000000000005.jpg',
  'd7100000-0000-4000-8000-000000000002', 'd7100000-0000-4000-8000-000000000002', '{"mimetype":"application/pdf","size":130000}');
insert into storage.objects(bucket_id, name, owner, owner_id, metadata, created_at) values
 ('review-photos', 'd7100000-0000-4000-8000-000000000003/d7500000-0000-4000-8000-000000000002/a0000000-0000-4000-8000-000000000009.jpg',
  'd7100000-0000-4000-8000-000000000003', 'd7100000-0000-4000-8000-000000000003', '{"mimetype":"image/jpeg","size":100}', now() - interval '3 days');

set local role authenticated;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000002');
do $$ declare review_id uuid; photos jsonb; prefix text := 'd7100000-0000-4000-8000-000000000002/d7500000-0000-4000-8000-000000000001/'; begin
  perform pg_temp.check(public.review_photo_upload_allowed(prefix || 'b0000000-0000-4000-8000-000000000001.jpg'), 'the buyer may upload for an open purchase');
  perform pg_temp.check(not public.review_photo_upload_allowed('d7100000-0000-4000-8000-000000000002/d7500000-0000-4000-8000-000000000003/b0000000-0000-4000-8000-000000000001.jpg'),
    'not once the window closed');
  perform pg_temp.check(not public.review_photo_upload_allowed('d7100000-0000-4000-8000-000000000003/d7500000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-000000000001.jpg'),
    'not in someone else''s folder');
  perform pg_temp.check(not public.review_photo_upload_allowed(prefix || 'foto.png'), 'only <uuid>.jpg');
  review_id := public.submit_transaction_review('d7500000-0000-4000-8000-000000000001', 5, 'Llegó como en las fotos');
  perform pg_temp.put('review_b1', review_id::text);
  photos := public.attach_review_photos(review_id, array[prefix || 'a0000000-0000-4000-8000-000000000001.jpg', prefix || 'a0000000-0000-4000-8000-000000000002.jpg']);
  perform pg_temp.check(jsonb_array_length(photos) = 2 and bool_and(photo->>'status' = 'pending'), 'two photos wait for Admin')
  from jsonb_array_elements(photos) photo;
  perform pg_temp.put('photo1', photos->0->>'id');
  perform pg_temp.put('photo2', photos->1->>'id');
  photos := public.attach_review_photos(review_id, array[prefix || 'a0000000-0000-4000-8000-000000000001.jpg']);
  perform pg_temp.check(jsonb_array_length(photos) = 2, 'attaching the same path again changes nothing');
  perform pg_temp.expect_error(format('select public.attach_review_photos(%L, array[%L, %L])', review_id,
    prefix || 'a0000000-0000-4000-8000-000000000003.jpg', prefix || 'a0000000-0000-4000-8000-000000000004.jpg'), 'REVIEW_PHOTO_LIMIT');
  perform pg_temp.expect_error(format('select public.attach_review_photos(%L, array[%L])', review_id, prefix || 'a0000000-0000-4000-8000-000000000005.jpg'), 'REVIEW_PHOTO_UPLOAD_MISSING');
  perform pg_temp.expect_error(format('select public.attach_review_photos(%L, array[%L])', review_id, prefix || 'c0000000-0000-4000-8000-000000000001.jpg'), 'REVIEW_PHOTO_UPLOAD_MISSING');
  perform pg_temp.expect_error(format('select public.attach_review_photos(%L, array[%L])', review_id,
    'd7100000-0000-4000-8000-000000000003/d7500000-0000-4000-8000-000000000002/a0000000-0000-4000-8000-000000000009.jpg'), 'REVIEW_PHOTO_PATH_INVALID');
  perform pg_temp.check(public.get_review_photo_object(pg_temp.get('photo1')::uuid)->>'access' = 'private', 'the reviewer sees their own pending photo');
end $$;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000005');
do $$ begin
  perform pg_temp.check(public.get_review_photo_object(pg_temp.get('photo1')::uuid) is null, 'nobody else sees a pending photo');
  perform pg_temp.expect_error(format('select public.attach_review_photos(%L, array[]::text[])', pg_temp.get('review_b1')), 'REVIEW_PHOTO_REVIEW_INVALID');
  perform pg_temp.expect_error(format('select public.moderate_review_photo(%L, %L)', pg_temp.get('photo1'), 'approved'), 'ADMIN_REQUIRED');
end $$;
select pg_temp.as_admin();
do $$ declare queue jsonb; begin
  queue := public.get_admin_review_photo_queue('pending', 1, 24);
  perform pg_temp.check((queue->>'total')::integer = 2, 'Admin sees both photos waiting');
  perform pg_temp.check(bool_and((item->>'review_held')::boolean), 'of a review held for Admin (B already reviewed S): ' || queue::text)
  from jsonb_array_elements(queue->'items') item;
  perform pg_temp.check(public.moderate_review_photo(pg_temp.get('photo1')::uuid, 'approved') = 'approved', 'Admin approves one');
  perform pg_temp.expect_error(format('select public.moderate_review_photo(%L, %L)', pg_temp.get('photo2'), 'hidden'), 'REVIEW_PHOTO_REASON_REQUIRED');
  perform public.moderate_review_photo(pg_temp.get('photo2')::uuid, 'hidden', 'Se ve un número de teléfono');
end $$;
reset role;
do $$ begin
  perform pg_temp.check((select count(*) from public.admin_audit_actions where action like 'review_photo_%' and target_id = pg_temp.get('review_b1')::uuid) = 2, 'both decisions are audited');
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform pg_temp.check(public.get_review_photo_object(pg_temp.get('photo1')::uuid) is null, 'approved, but the review is not visible yet (double-blind)');
end $$;
reset role;
set local role authenticated;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000001');
select public.submit_transaction_review('d7500000-0000-4000-8000-000000000001', 5, 'Buen comprador');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform pg_temp.check(public.get_review_photo_object(pg_temp.get('photo1')::uuid) is null, 'both reviews in, but the buyer''s is held: no photo yet');
end $$;
reset role;
do $$ begin
  perform pg_temp.check((select reasons from laria_private.review_holds where review_id = pg_temp.get('review_b1')::uuid) = array['repeat_buyer'],
    'B''s second review of S is held');
end $$;
set local role authenticated;
select pg_temp.as_admin();
select public.publish_held_review(pg_temp.get('review_b1')::uuid);
reset role;
do $$ begin
  perform pg_temp.check((select count(*) from public.notifications where transaction_id = 'd7500000-0000-4000-8000-000000000001' and event_type = 'review_revealed') = 2,
    'published: both sides are told, as for any sale with a publication');
end $$;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ declare reputation jsonb; review_page jsonb; begin
  perform pg_temp.check(public.get_review_photo_object(pg_temp.get('photo1')::uuid)->>'access' = 'public', 'now anyone sees the approved photo');
  perform pg_temp.check(public.get_review_photo_object(pg_temp.get('photo2')::uuid) is null, 'never the hidden one');
  reputation := public.get_public_reputation('d7100000-0000-4000-8000-000000000001', null, 6);
  perform pg_temp.check(reputation::text like '%' || pg_temp.get('photo1') || '%' and reputation::text not like '%' || pg_temp.get('photo2') || '%',
    'the seller''s reputation carries the approved photo only');
  review_page := public.get_public_review_page('d7100000-0000-4000-8000-000000000001', null, 0, 20);
  perform pg_temp.check(exists (select 1 from jsonb_array_elements(review_page->'items') item
    where item->>'id' = pg_temp.get('review_b1') and item->'photos' = jsonb_build_array(jsonb_build_object('id', pg_temp.get('photo1')))), 'and so do the review pages');
  perform pg_temp.expect_error($q$select public.list_orphan_review_photos(10)$q$, 'permission denied');
end $$;
reset role;

do $$ declare orphans text[] := public.list_orphan_review_photos(10); begin
  perform pg_temp.check(orphans = array['d7100000-0000-4000-8000-000000000003/d7500000-0000-4000-8000-000000000002/a0000000-0000-4000-8000-000000000009.jpg'],
    'only unattached uploads older than two days are orphans: ' || orphans::text);
end $$;

-- ------------------------------------------------------------------ sell-09: seller pages

do $$ declare page jsonb; slug text; begin
  slug := (select s.slug from public.seller_pages s where s.user_id = 'd7100000-0000-4000-8000-000000000001');
  perform pg_temp.check(slug ~ '^maria-[0-9a-f]{6}$', 'the page address is the folded first name and a suffix: ' || coalesce(slug, 'none'));
  perform pg_temp.put('seller_slug', slug);
  perform pg_temp.check(not exists (select 1 from public.seller_pages where user_id = 'd7100000-0000-4000-8000-000000000004'), 'a store''s publications make no Particular page');
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ declare page jsonb; begin
  page := public.get_seller_page(upper(pg_temp.get('seller_slug')));
  perform pg_temp.check(page->>'first_name' = 'María' and page->>'city' = 'Lima' and (page->>'verified_sales')::integer = 5
    and (page->>'active_listings')::integer = 1, 'the public page: ' || page::text);
  perform pg_temp.check(not page ? 'full_name' and not page ? 'phone' and page::text not like '%Pérez%', 'first name only');
  perform pg_temp.check(public.get_seller_page('no-such-page') is null and public.get_seller_page('../x') is null, 'unknown pages are null');
end $$;
reset role;

set local role authenticated;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000001');
do $$ declare mine jsonb; begin
  mine := public.set_my_seller_page_hidden(true);
  perform pg_temp.check((mine->>'hidden')::boolean, 'the seller hides the page');
  perform pg_temp.check(public.get_seller_page(pg_temp.get('seller_slug')) is null, 'a hidden page is gone');
  perform public.set_my_seller_page_hidden(false);
end $$;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000005');
do $$ begin
  perform pg_temp.check(not (public.get_my_seller_page()->>'exists')::boolean, 'no page without publications');
  perform pg_temp.expect_error($q$select public.set_my_seller_page_hidden(true)$q$, 'SELLER_PAGE_NOT_FOUND');
end $$;
reset role;

-- ------------------------------------------------------------------ sell-08: seller level

do $$ declare result jsonb; level public.seller_levels; begin
  result := laria_private.refresh_seller_levels();
  select * into level from public.seller_levels where subject_user_id = 'd7100000-0000-4000-8000-000000000001';
  perform pg_temp.check(level.qualified_since is not null, 'five sales, 4.67 average, no reports, questions answered: the mark. ' || coalesce(level.facts::text, 'no row'));
  perform pg_temp.check((select count(*) from public.notifications where user_id = 'd7100000-0000-4000-8000-000000000001' and event_type = 'seller_level_earned') = 1, 'the seller is told');
  perform laria_private.refresh_seller_levels();
  perform pg_temp.check((select count(*) from public.notifications where user_id = 'd7100000-0000-4000-8000-000000000001' and event_type = 'seller_level_earned') = 1, 'once');
  perform pg_temp.check(not exists (select 1 from public.seller_levels where subject_store_id is not null and qualified_since is not null), 'the store doesn''t qualify with two sales');
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ declare trust jsonb; begin
  trust := public.get_listing_trust('d7300000-0000-4000-8000-000000000002');
  perform pg_temp.check(trust->'level'->>'kind' = 'particular' and trust->'seller_page'->>'slug' = pg_temp.get('seller_slug'), 'the publication shows the mark and the page link: ' || trust::text);
  perform pg_temp.check(public.get_seller_page(pg_temp.get('seller_slug'))->'level' is not null, 'so does the seller page');
end $$;
reset role;

-- An unanswered question older than seven days lapses the mark.
insert into public.listing_questions(listing_id, asker_user_id, body, created_at)
values ('d7300000-0000-4000-8000-000000000002', 'd7100000-0000-4000-8000-000000000005', '¿Sigue disponible el pedal?', now() - interval '8 days');
do $$ declare level public.seller_levels; begin
  perform laria_private.refresh_seller_levels();
  select * into level from public.seller_levels where subject_user_id = 'd7100000-0000-4000-8000-000000000001';
  perform pg_temp.check(level.qualified_since is null and (level.facts->>'unanswered_questions')::integer = 1, 'the mark lapses by itself');
  perform pg_temp.check(exists (select 1 from public.notifications where user_id = 'd7100000-0000-4000-8000-000000000001' and event_type = 'seller_level_lapsed'), 'and says so');
end $$;
set local role authenticated;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000001');
do $$ declare mine jsonb := public.get_my_seller_levels(); begin
  perform pg_temp.check((mine->'particular'->'facts'->>'unanswered_questions')::integer = 1 and mine->'particular'->'level' = 'null'::jsonb
    and mine->'store' = 'null'::jsonb, 'the seller sees which criterion is missing: ' || mine::text);
end $$;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000004');
do $$ declare mine jsonb := public.get_my_seller_levels(); begin
  perform pg_temp.check((mine->'store'->'facts'->>'verified_sales')::integer = 2, 'a store owner also sees the store''s numbers: ' || mine::text);
end $$;
reset role;

-- ------------------------------------------------------------------ safe-07: buyer track record

set local role authenticated;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000002');
do $$ declare mine jsonb; card jsonb; old_token text; begin
  mine := public.get_my_track_record();
  perform pg_temp.check(not (mine->>'enabled')::boolean and mine->'token' = 'null'::jsonb and (mine->>'verified_purchases')::integer = 4,
    'off by default; purchases include the counter one: ' || mine::text);
  mine := public.set_my_track_record(true);
  perform pg_temp.check((mine->>'enabled')::boolean and mine->>'token' ~ '^[0-9a-f]{24}$', 'turned on, with a card address');
  old_token := mine->>'token';
  perform pg_temp.check(public.set_my_track_record(true)->>'token' = old_token, 'turning it on again keeps the address');
  perform pg_temp.put('card_token', old_token);
end $$;
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ declare card jsonb; begin
  card := public.get_buyer_card(pg_temp.get('card_token'));
  perform pg_temp.check(card->>'first_name' = 'Bruno' and (card->>'verified_purchases')::integer = 4 and (card->>'rating_count')::integer = 3
    and (card->>'average_rating')::numeric = 4.67, 'the public card: ' || card::text);
  perform pg_temp.check(card::text not like '%privado%' and card::text not like '%Díaz%', 'no comments, no surname');
  perform pg_temp.check(public.get_buyer_card('000000000000000000000000') is null and public.get_buyer_card(null) is null, 'unknown cards are null');
end $$;
reset role;

set local role authenticated;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000002');
do $$ declare mine jsonb; begin
  perform public.set_my_track_record(false);
  perform pg_temp.check(public.get_buyer_card(pg_temp.get('card_token')) is null, 'off: the card is gone');
  mine := public.set_my_track_record(true);
  perform pg_temp.check(mine->>'token' <> pg_temp.get('card_token') and public.get_buyer_card(pg_temp.get('card_token')) is null,
    'on again: a new address, the old link stays dead');
end $$;
reset role;

-- ------------------------------------------------------------------ safe-11: provenance

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,created_by_source,marketplace_rules_accepted_at) values
 ('d7300000-0000-4000-8000-000000000021','trust-resale-b','Stratocaster, la vendo','individual','approved','guitars','electric_guitar','Fender','Stratocaster','Bueno',2800,'Lima','Lima','Bruno','51999997002','Descripción de prueba con más de cuarenta caracteres para la reventa.','d7100000-0000-4000-8000-000000000002','self_service',now()),
 ('d7300000-0000-4000-8000-000000000022','trust-resale-b-draft','Borrador de Bruno','individual','draft','guitars','electric_guitar','Fender','Stratocaster','Bueno',2800,'Lima','Lima','Bruno','51999997002','Descripción de prueba con más de cuarenta caracteres para el borrador.','d7100000-0000-4000-8000-000000000002','self_service',now()),
 ('d7300000-0000-4000-8000-000000000023','trust-resale-c','Stratocaster, otra vez','individual','approved','guitars','electric_guitar','Fender','Stratocaster','Bueno',2600,'Lima','Lima','Carla','51999997003','Descripción de prueba con más de cuarenta caracteres para la tercera.','d7100000-0000-4000-8000-000000000003','self_service',now());

set local role authenticated;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000002');
do $$ declare options jsonb; begin
  options := public.get_my_provenance_options('d7500000-0000-4000-8000-000000000001');
  perform pg_temp.check((options->>'eligible')::boolean and jsonb_array_length(options->'candidates') = 2, 'the buyer can link either of their publications: ' || options::text);
  perform pg_temp.check(not (public.get_my_provenance_options(pg_temp.get('counter_tx')::uuid)->>'eligible')::boolean, 'a counter purchase has no history to carry');
  perform pg_temp.expect_error($q$select public.link_listing_provenance('d7500000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001')$q$, 'PROVENANCE_LISTING_INVALID');
  perform pg_temp.expect_error($q$select public.link_listing_provenance('d7500000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000023')$q$, 'PROVENANCE_LISTING_INVALID');
  options := public.link_listing_provenance('d7500000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000021');
  perform pg_temp.check(options->'linked'->>'listing_id' = 'd7300000-0000-4000-8000-000000000021', 'linked');
end $$;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000005');
do $$ begin
  perform pg_temp.expect_error($q$select public.link_listing_provenance('d7500000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000021')$q$, 'PROVENANCE_TRANSACTION_INVALID');
end $$;
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ declare trust jsonb; begin
  trust := public.get_listing_trust('d7300000-0000-4000-8000-000000000021');
  perform pg_temp.check((trust->'provenance'->>'previous_owners')::integer = 1 and trust->'provenance'->'original'->>'brand' = 'Fender'
    and trust->'provenance'->'original'->'attributes'->>'color' = 'Sunburst', 'the resale shows its history: ' || trust::text);
  perform pg_temp.check(trust::text not like '%María%' and trust::text not like '%trust-l1%' and trust::text not like '%d7300000-0000-4000-8000-000000000001%',
    'nothing about the previous seller or the old publication');
  perform pg_temp.check(public.get_listing_trust('d7300000-0000-4000-8000-000000000022') is null, 'a draft has no public trust read');
end $$;
reset role;

-- B resells to C through Laria; C relinks: two previous owners. B can't move the link of a purchase already resold.
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set status = 'sold', sold_at = now() where id = 'd7300000-0000-4000-8000-000000000021';
select set_config('app.allow_listing_admin_fields', '', true);
insert into public.transaction_claims(id, listing_id, seller_user_id, buyer_user_id, attribution_type, status, created_at, responded_at, ended_at)
values ('d7400000-0000-4000-8000-000000000021', 'd7300000-0000-4000-8000-000000000021', 'd7100000-0000-4000-8000-000000000002', 'd7100000-0000-4000-8000-000000000003', 'laria', 'confirmed', now(), now(), now());
insert into public.verified_transactions(id, claim_id, listing_id, seller_user_id, buyer_user_id, seller_identity_type, sold_at, verified_at, review_deadline)
values ('d7500000-0000-4000-8000-000000000021', 'd7400000-0000-4000-8000-000000000021', 'd7300000-0000-4000-8000-000000000021', 'd7100000-0000-4000-8000-000000000002', 'd7100000-0000-4000-8000-000000000003', 'particular', now(), now(), now() + interval '10 days');
set local role authenticated;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000003');
select public.link_listing_provenance('d7500000-0000-4000-8000-000000000021', 'd7300000-0000-4000-8000-000000000023');
select pg_temp.as_user('d7100000-0000-4000-8000-000000000002');
do $$ begin
  perform pg_temp.check((public.get_listing_trust('d7300000-0000-4000-8000-000000000023')->'provenance'->>'previous_owners')::integer = 2, 'the chain counts two owners before');
  perform pg_temp.expect_error($q$select public.link_listing_provenance('d7500000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000022')$q$, 'PROVENANCE_ALREADY_RESOLD');
end $$;
reset role;

-- ------------------------------------------------------------------ safe-03: safe spots

set local role authenticated;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000004');
do $$ declare mine jsonb; begin
  mine := public.get_my_safe_spot();
  perform pg_temp.check(mine->'missing' = '[]'::jsonb and not (mine->>'enabled')::boolean, 'an active verified store with its address shown can opt in: ' || mine::text);
  perform pg_temp.expect_error($q$select public.set_my_safe_spot(true, 'Llama al 999 888 777')$q$, 'SAFE_SPOT_NOTE_INVALID');
  mine := public.set_my_safe_spot(true, 'Pregunta en caja por el punto de encuentro');
  perform pg_temp.check((mine->>'enabled')::boolean and mine->>'note' = 'Pregunta en caja por el punto de encuentro', 'opted in');
end $$;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000005');
do $$ begin
  perform pg_temp.check(public.get_my_safe_spot() is null, 'no store, no card');
  perform pg_temp.expect_error($q$select public.set_my_safe_spot(true)$q$, 'SAFE_SPOT_STORE_REQUIRED');
end $$;
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ declare spots jsonb; begin
  spots := public.get_safe_meetup_spots('lima', 'Lima');
  perform pg_temp.check(jsonb_array_length(spots) = 1 and spots->0->>'name' = 'Tienda Confianza' and spots->0->>'address' = 'Av. Larco 100', 'the sheet lists the spot: ' || spots::text);
  perform pg_temp.check(jsonb_array_length(public.get_safe_meetup_spots('Arequipa', 'Arequipa')) = 0, 'nothing outside the region');
  perform pg_temp.check(public.get_store_trust('d7200000-0000-4000-8000-000000000001')->'safe_spot' is not null, 'the store page shows the badge');
  perform pg_temp.check(public.get_listing_trust('d7300000-0000-4000-8000-000000000003')->'safe_spot' is not null, 'and the store''s publications');
end $$;
reset role;

set local role authenticated;
select pg_temp.as_admin();
do $$ begin
  perform pg_temp.expect_error($q$select public.admin_set_safe_spot('d7200000-0000-4000-8000-000000000001', false)$q$, 'SAFE_SPOT_REASON_REQUIRED');
  perform public.admin_set_safe_spot('d7200000-0000-4000-8000-000000000001', false, 'Reclamos de compradores');
  perform pg_temp.check(public.get_store_trust('d7200000-0000-4000-8000-000000000001')->'safe_spot' = 'null'::jsonb, 'Admin turns it off at once');
end $$;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000004');
do $$ begin
  perform pg_temp.expect_error($q$select public.set_my_safe_spot(true)$q$, 'SAFE_SPOT_ADMIN_DISABLED');
  perform pg_temp.check(exists (select 1 from public.notifications where event_type = 'store_safe_spot_disabled' and store_id = 'd7200000-0000-4000-8000-000000000001'), 'the store is told why');
end $$;
select pg_temp.as_admin();
select public.admin_set_safe_spot('d7200000-0000-4000-8000-000000000001', true);
select pg_temp.as_user('d7100000-0000-4000-8000-000000000004');
select public.set_my_safe_spot(true);
reset role;
select set_config('app.allow_store_admin_fields', 'true', true);
update public.stores set is_verified = false where id = 'd7200000-0000-4000-8000-000000000001';
select set_config('app.allow_store_admin_fields', '', true);
set local role authenticated;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000004');
do $$ begin
  perform pg_temp.check(public.get_store_trust('d7200000-0000-4000-8000-000000000001')->'safe_spot' = 'null'::jsonb, 'losing verification hides the spot');
  perform pg_temp.check(public.get_my_safe_spot()->'missing' = '["verified"]'::jsonb, 'and the card says what is missing');
  perform pg_temp.expect_error($q$select public.set_my_safe_spot(true)$q$, 'SAFE_SPOT_NOT_ELIGIBLE');
  perform public.set_my_safe_spot(false);
end $$;
reset role;

-- ------------------------------------------------------------------ boundaries

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform pg_temp.expect_error($q$select count(*) from public.store_counter_sales$q$, 'permission denied');
  perform pg_temp.expect_error($q$select count(*) from public.seller_pages$q$, 'permission denied');
  perform pg_temp.expect_error($q$select count(*) from public.buyer_track_records$q$, 'permission denied');
  perform pg_temp.expect_error($q$select count(*) from public.transaction_review_photos$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.run_deal_trust_nightly()$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.create_counter_purchase_code('qa-counter-sale-1')$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.get_my_track_record()$q$, 'permission denied');
end $$;
reset role;
set local role authenticated;
select pg_temp.as_user('d7100000-0000-4000-8000-000000000002');
do $$ begin
  perform pg_temp.expect_error($q$select public.run_deal_trust_nightly()$q$, 'permission denied');
  perform pg_temp.expect_error($q$select laria_private.refresh_seller_levels()$q$, 'permission denied');
  perform pg_temp.expect_error($q$select count(*) from public.seller_levels$q$, 'permission denied');
end $$;
reset role;

do $$ begin
  perform pg_temp.check(laria_private.run_deal_trust_nightly() ? 'levels', 'the nightly job runs');
  perform pg_temp.check(public.run_deal_trust_nightly() ? 'counter_review_reminders', 'and runs again harmlessly from its route');
  perform pg_temp.check(not exists (select 1 from cron.job where jobname = 'deal-trust-nightly'), 'with no pg_cron job (the route is the schedule)');
end $$;

rollback;
