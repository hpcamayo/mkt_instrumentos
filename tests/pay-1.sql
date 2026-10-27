-- PAY-1 assisted commerce, Pilot A: accepted payment methods, Admin review, public reads tied to live verification,
-- purchase-request eligibility and the purchase-intent contact event.
-- Local/test database only. Every fixture is rolled back.
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

create function pg_temp.id(p_name text) returns uuid language sql as $$ select current_setting('qa.' || p_name)::uuid $$;
create function pg_temp.remember(p_name text, p_id uuid) returns void language plpgsql as $$
begin perform set_config('qa.' || p_name, p_id::text, true); end $$;
create function pg_temp.method_status(p_store uuid, p_method text) returns text language sql security definer as $$
  select status from public.store_payment_methods where store_id = p_store and method = p_method::public.store_payment_method
$$;
create function pg_temp.method_revision(p_store uuid, p_method text) returns integer language sql security definer as $$
  select revision from public.store_payment_methods where store_id = p_store and method = p_method::public.store_payment_method
$$;
create function pg_temp.changes(p_store uuid, p_type text) returns bigint language sql security definer as $$
  select count(*) from public.store_payment_method_changes where store_id = p_store and change_type = p_type
$$;
create function pg_temp.audits(p_action text, p_store uuid) returns bigint language sql security definer as $$
  select count(*) from public.admin_audit_actions where action = p_action and target_type = 'store' and target_id = p_store
$$;
create function pg_temp.as_user(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(p_name), 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"b7100000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal2","app_metadata":{"role":"admin"}}', true);
end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', '{"role":"anon"}', true); end $$;

select pg_temp.remember('owner_a', 'b7100000-0000-4000-8000-000000000001'),
       pg_temp.remember('owner_b', 'b7100000-0000-4000-8000-000000000002'),
       pg_temp.remember('particular', 'b7100000-0000-4000-8000-000000000003'),
       pg_temp.remember('buyer', 'b7100000-0000-4000-8000-000000000004'),
       pg_temp.remember('store_a', 'b7200000-0000-4000-8000-000000000001'),
       pg_temp.remember('store_b', 'b7200000-0000-4000-8000-000000000002'),
       pg_temp.remember('l1', 'b7300000-0000-4000-8000-000000000001'),
       pg_temp.remember('l2', 'b7300000-0000-4000-8000-000000000002'),
       pg_temp.remember('lb', 'b7300000-0000-4000-8000-000000000003'),
       pg_temp.remember('lp', 'b7300000-0000-4000-8000-000000000004'),
       pg_temp.remember('lpending', 'b7300000-0000-4000-8000-000000000005');

-- ------------------------------------------------------------------ fixtures

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('b7100000-0000-4000-8000-000000000001','authenticated','authenticated','pay1-owner-a@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Pago A","phone":"51999997001","city":"Lima","region":"Lima"}'),
 ('b7100000-0000-4000-8000-000000000002','authenticated','authenticated','pay1-owner-b@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Pago B","phone":"51999997002","city":"Lima","region":"Lima"}'),
 ('b7100000-0000-4000-8000-000000000003','authenticated','authenticated','pay1-particular@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Particular Pago","phone":"51999997003","city":"Lima","region":"Lima"}'),
 ('b7100000-0000-4000-8000-000000000004','authenticated','authenticated','pay1-buyer@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Comprador Pago","phone":"51999997004","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('b7200000-0000-4000-8000-000000000001','pay1-tienda-a','Tienda Pago A','Tienda Pago A SAC','20999998001','pay1-a@example.invalid','Contacto A','Contacto A','51999997001','Lima','Lima','Av. QA 1','b7100000-0000-4000-8000-000000000001','active','free',true),
 ('b7200000-0000-4000-8000-000000000002','pay1-tienda-b','Tienda Pago B','Tienda Pago B SAC','20999998002','pay1-b@example.invalid','Contacto B','Contacto B','51999997002','Lima','Lima','Av. QA 2','b7100000-0000-4000-8000-000000000002','active','free',false);

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at) values
 ('b7300000-0000-4000-8000-000000000001','pay1-l1','Guitarra Pago uno','store','approved','guitars','electric_guitar','QA','Uno','Nuevo',1000,'Lima','Lima','Contacto A','51999997001','Descripción de publicación válida con más de cuarenta caracteres.','b7100000-0000-4000-8000-000000000001','b7200000-0000-4000-8000-000000000001','self_service',now()),
 ('b7300000-0000-4000-8000-000000000002','pay1-l2','Guitarra Pago dos','store','approved','guitars','electric_guitar','QA','Dos','Nuevo',1200,'Lima','Lima','Contacto A','51999997001','Descripción de publicación válida con más de cuarenta caracteres.','b7100000-0000-4000-8000-000000000001','b7200000-0000-4000-8000-000000000001','self_service',now()),
 ('b7300000-0000-4000-8000-000000000003','pay1-lb','Guitarra Pago tienda B','store','approved','guitars','electric_guitar','QA','Tres','Nuevo',500,'Lima','Lima','Contacto B','51999997002','Descripción de publicación válida con más de cuarenta caracteres.','b7100000-0000-4000-8000-000000000002','b7200000-0000-4000-8000-000000000002','self_service',now()),
 ('b7300000-0000-4000-8000-000000000004','pay1-lp','Guitarra Pago particular','individual','approved','guitars','electric_guitar','QA','Cuatro','Usado',700,'Lima','Lima','Particular Pago','51999997003','Descripción de publicación válida con más de cuarenta caracteres.','b7100000-0000-4000-8000-000000000003',null,'self_service',now()),
 ('b7300000-0000-4000-8000-000000000005','pay1-lpending','Guitarra Pago en revisión','store','pending','guitars','electric_guitar','QA','Cinco','Nuevo',900,'Lima','Lima','Contacto A','51999997001','Descripción de publicación válida con más de cuarenta caracteres.','b7100000-0000-4000-8000-000000000001','b7200000-0000-4000-8000-000000000001','self_service',now());

insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/pay1-' || l.slug || '-' || n || '.jpg', n
from public.listings l cross join generate_series(0, 1) n
where l.slug like 'pay1-%';

-- ------------------------------------------------------------------ browser role boundaries

set local role anon;
select pg_temp.as_anon();
do $$ begin
  perform pg_temp.expect_error('select 1 from public.store_payment_methods', 'permission denied');
  perform pg_temp.expect_error('select 1 from public.store_payment_method_changes', 'permission denied');
  perform pg_temp.expect_error($q$select public.set_store_payment_method('yape_plin', 'Anon', null, null)$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.withdraw_store_payment_method('yape_plin')$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.admin_review_store_payment_method(pg_temp.id('store_a'), 'yape_plin', 'approve', 'Anon', 1)$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.get_admin_store_payment_methods('pending_review', 1, 24)$q$, 'permission denied');
  perform pg_temp.check(public.get_store_payment_methods(pg_temp.id('store_a')) = '[]'::jsonb, 'anon read: no methods yet');
  perform pg_temp.check(public.get_listing_purchase_request(pg_temp.id('l1')) is null, 'anon read: no purchase request yet');
end $$;

-- ------------------------------------------------------------------ pilot switch (review fix A14)

-- Off by default in the database too (Codex item 6, finding 4): a direct call cannot propose a method while the pilot
-- is off, and only the database owner turns it on.
set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ begin
  perform pg_temp.expect_error($q$select public.set_store_payment_method('efectivo_al_recoger')$q$, 'PAYMENT_PILOT_OFF');
  perform pg_temp.expect_error($q$select laria_private.set_assisted_commerce_pilot(true, 'Yo mismo')$q$, 'permission denied');
end $$;
select pg_temp.as_admin();
do $$ begin
  perform pg_temp.expect_error($q$select laria_private.set_assisted_commerce_pilot(true, 'Admin')$q$, 'permission denied');
end $$;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ begin
  perform pg_temp.expect_error($q$select laria_private.set_assisted_commerce_pilot(true, 'Servicio')$q$, 'permission denied');
end $$;
reset role;
do $$ begin
  perform pg_temp.expect_error($q$select laria_private.set_assisted_commerce_pilot(true, null)$q$, 'Indica si el piloto');
  perform pg_temp.check(laria_private.set_assisted_commerce_pilot(true, 'Prueba PAY-1'), 'pilot not turned on');
  perform pg_temp.check(laria_private.assisted_commerce_pilot_enabled()
    and (select reason from laria_private.assisted_commerce_settings) = 'Prueba PAY-1', 'pilot change not recorded');
  -- Ordinary business names and notes still pass.
  perform pg_temp.check(laria_private.payment_method_text('Inversiones Música & Arte S.A.C.', 140) = 'Inversiones Música & Arte S.A.C.'
    and laria_private.payment_method_text('Paga con Visa o Mastercard; mínimo S/ 50 (sin recargo).', 280) is not null
    and laria_private.payment_method_text('Ñandú E.I.R.L.', 140) is not null, 'ordinary text refused');
  perform pg_temp.check(laria_private.payment_provider_label('yape_plin', 'YAPE Y PLIN') = 'Yape y Plin'
    and laria_private.payment_provider_label('link_de_pago', 'mercadopago') = 'Mercado Pago'
    and laria_private.payment_provider_label('link_de_pago', 'PayPal') = 'PayPal'
    and laria_private.payment_provider_label('link_de_pago', ' ') is null, 'provider names not matched');
end $$;

-- ------------------------------------------------------------------ owner proposals

set local role authenticated;
select pg_temp.as_user('particular');
do $$ begin
  perform pg_temp.expect_error($q$select public.set_store_payment_method('efectivo_al_recoger')$q$, 'PAYMENT_STORE_REQUIRED');
end $$;

-- D-2: an approved store that is not verified cannot declare methods.
select pg_temp.as_user('owner_b');
do $$ begin
  perform pg_temp.expect_error($q$select public.set_store_payment_method('efectivo_al_recoger')$q$, 'PAYMENT_STORE_NOT_VERIFIED');
end $$;

select pg_temp.as_user('owner_a');
do $$ declare result jsonb; v text; begin
  perform pg_temp.expect_error($q$select public.set_store_payment_method('yape_plin', null, 'Yape', null)$q$, 'PAYMENT_HOLDER_REQUIRED');
  perform pg_temp.expect_error($q$select public.set_store_payment_method('yape_plin', '  ', 'Yape', null)$q$, 'PAYMENT_HOLDER_REQUIRED');
  -- Nothing that could be a phone, account or card number, a link or an e-mail is stored.
  perform pg_temp.expect_error($q$select public.set_store_payment_method('yape_plin', 'Tienda 987 654 321', 'Yape', null)$q$, 'PAYMENT_METHOD_SENSITIVE_DATA');
  perform pg_temp.expect_error($q$select public.set_store_payment_method('yape_plin', 'Tienda Pago A SAC', 'Yape', 'Cuenta 191-12345678-0-12')$q$, 'PAYMENT_METHOD_SENSITIVE_DATA');
  perform pg_temp.expect_error($q$select public.set_store_payment_method('link_de_pago', 'Tienda Pago A SAC', 'Izipay', 'Paga en https://pago.example.invalid/x')$q$, 'PAYMENT_METHOD_SENSITIVE_DATA');
  perform pg_temp.expect_error($q$select public.set_store_payment_method('link_de_pago', 'Tienda Pago A SAC', 'pagos.pe', null)$q$, 'PAYMENT_PROVIDER_INVALID');
  perform pg_temp.expect_error($q$select public.set_store_payment_method('link_de_pago', 'Tienda Pago A SAC', 'Izipay', 'Escribe a caja@tienda.example')$q$, 'PAYMENT_METHOD_SENSITIVE_DATA');
  perform pg_temp.expect_error($q$select public.set_store_payment_method('yape_plin', 'Tienda Pago A SAC', 'Yape', repeat('a', 281))$q$, 'PAYMENT_METHOD_TEXT_LENGTH');
  -- Review fix A2 (Codex item 6, finding 1): other separators, other hosts and look-alike characters, in the holder and
  -- in the note.
  foreach v in array array['987/654/321', '4111/1111/1111/1111', '4111_1111_1111_1111', '98 76 54 32 1', '９８７６５４３２１',
      '987' || chr(8203) || '654' || chr(8203) || '321', 'Caja 12, mesa 345, piso 6789', 'pago.xyz/abc', 'pago.pe?ref=abc',
      'caja.xn--p1ai/abc', 'pago[.]pe', 'pago (punto) pe', 'caja。pe', 'ｐａｇｏ．ｐｅ', 'wa.me/51', 'tel:+51', 'pago.pe', 'caja@tienda.pe'] loop
    perform pg_temp.expect_error(format('select public.set_store_payment_method(%L, %L, %L, %L)', 'link_de_pago', 'Tienda Pago A SAC', 'Izipay', 'Datos ' || v),
      'PAYMENT_METHOD_SENSITIVE_DATA');
    perform pg_temp.expect_error(format('select public.set_store_payment_method(%L, %L, %L, %L)', 'yape_plin', 'Tienda ' || v, 'Yape', null),
      'PAYMENT_METHOD_SENSITIVE_DATA');
  end loop;
  -- Only letters, digits and common punctuation: no invisible characters, other scripts or emoji.
  foreach v in array array['Tienda' || chr(8238) || 'Pago', 'Tienda' || chr(8203) || 'Pago', 'Тienda Pago', 'Paga al recoger 💳', 'Tienda <b>Pago</b>'] loop
    perform pg_temp.expect_error(format('select public.set_store_payment_method(%L, %L, %L, %L)', 'link_de_pago', 'Tienda Pago A SAC', 'Izipay', v),
      'PAYMENT_METHOD_TEXT_INVALID');
  end loop;
  -- The provider is one of Laria's names for that method, stored in its usual spelling.
  foreach v in array array['pago.xyz/abc', 'Yape', 'Izipay 987654', 'Banco'] loop
    perform pg_temp.expect_error(format('select public.set_store_payment_method(%L, %L, %L, %L)', 'pos_tarjeta_al_recoger', 'Tienda Pago A SAC', v, null),
      'PAYMENT_PROVIDER_INVALID');
  end loop;
  perform pg_temp.expect_error($q$select public.set_store_payment_method('pos_tarjeta_al_recoger', 'Tienda Pago A SAC', 'PayPal', null)$q$, 'PAYMENT_PROVIDER_INVALID');
  perform pg_temp.expect_error($q$select public.set_store_payment_method('efectivo_al_recoger', null, 'Izipay', null)$q$, 'PAYMENT_PROVIDER_INVALID');

  result := public.set_store_payment_method('yape_plin', '  Tienda   Pago A SAC ', 'Yape', 'Confirma el pago antes de recoger.');
  perform pg_temp.check(result->>'status' = 'pending_review' and result->>'holder_name' = 'Tienda Pago A SAC', 'yape proposal not stored');
  -- Cash needs no holder; one given is not kept.
  result := public.set_store_payment_method('efectivo_al_recoger', 'Alguien', null, null);
  perform pg_temp.check(result->>'status' = 'pending_review' and result->'holder_name' = 'null'::jsonb, 'cash proposal kept a holder');
  result := public.set_store_payment_method('pos_tarjeta_al_recoger', 'Tienda Pago A SAC', '  izipay ', null);
  perform pg_temp.check(result->>'provider_label' = 'Izipay' and (result->>'revision')::int = 1, 'provider not stored in its usual spelling');
  perform pg_temp.check(pg_temp.changes(pg_temp.id('store_a'), 'proposed') = 3, 'proposals not in the history');
  -- An identical resubmission changes nothing.
  result := public.set_store_payment_method('yape_plin', 'Tienda Pago A SAC', 'Yape', 'Confirma el pago antes de recoger.');
  perform pg_temp.check(pg_temp.changes(pg_temp.id('store_a'), 'proposed') = 3, 'identical resubmission was recorded');

  -- The owner reads its own rows and history, and cannot review them.
  perform pg_temp.check((select count(*) from public.store_payment_methods) = 3, 'owner does not see exactly its own methods');
  perform pg_temp.check((select count(*) from public.store_payment_method_changes) = 3, 'owner does not see its own history');
  perform pg_temp.expect_error($q$select public.admin_review_store_payment_method(pg_temp.id('store_a'), 'yape_plin', 'approve', 'Yo mismo', 1)$q$, 'ADMIN_REQUIRED');
  perform pg_temp.expect_error($q$select public.get_admin_store_payment_methods('pending_review', 1, 24)$q$, 'ADMIN_REQUIRED');
  -- No direct writes.
  perform pg_temp.expect_error($q$update public.store_payment_methods set status = 'approved'$q$, 'permission denied');
  perform pg_temp.expect_error($q$insert into public.store_payment_methods(store_id, method) values (pg_temp.id('store_a'), 'link_de_pago')$q$, 'permission denied');
  -- Pending methods are not public.
  perform pg_temp.check(public.get_store_payment_methods(pg_temp.id('store_a')) = '[]'::jsonb, 'pending methods became public');
end $$;

select pg_temp.as_user('owner_b');
do $$ begin
  perform pg_temp.check((select count(*) from public.store_payment_methods) = 0, 'another owner reads store A methods');
  perform pg_temp.check((select count(*) from public.store_payment_method_changes) = 0, 'another owner reads store A history');
  perform pg_temp.expect_error($q$select public.withdraw_store_payment_method('yape_plin')$q$, 'PAYMENT_METHOD_NOT_FOUND');
end $$;

-- ------------------------------------------------------------------ Admin review

select pg_temp.as_admin();
do $$ declare result jsonb; page jsonb; begin
  page := public.get_admin_store_payment_methods('pending_review', 1, 24);
  perform pg_temp.check((page->>'total')::int >= 3, 'Admin list misses pending proposals');
  perform pg_temp.check(exists(select 1 from jsonb_array_elements(page->'items') item
    where item->>'store_id' = pg_temp.id('store_a')::text and item->>'method' = 'yape_plin'
      and item->>'ruc' = '20999998001' and item->>'razon_social' = 'Tienda Pago A SAC' and item->>'holder_name' = 'Tienda Pago A SAC'),
    'Admin list lacks the business data to compare');

  perform pg_temp.expect_error($q$select public.admin_review_store_payment_method(pg_temp.id('store_a'), 'yape_plin', 'approve', null, pg_temp.method_revision(pg_temp.id('store_a'), 'yape_plin'))$q$, 'PAYMENT_REASON_REQUIRED');
  perform pg_temp.expect_error($q$select public.admin_review_store_payment_method(pg_temp.id('store_a'), 'yape_plin', 'publish', 'Titular coincide', pg_temp.method_revision(pg_temp.id('store_a'), 'yape_plin'))$q$, 'PAYMENT_DECISION_INVALID');
  -- The Admin decides on the version they saw.
  perform pg_temp.expect_error($q$select public.admin_review_store_payment_method(pg_temp.id('store_a'), 'yape_plin', 'approve', 'Titular coincide', 0)$q$, 'PAYMENT_METHOD_CHANGED');
  perform pg_temp.expect_error($q$select public.admin_review_store_payment_method(pg_temp.id('store_a'), 'yape_plin', 'approve', 'Titular coincide', null)$q$, 'PAYMENT_METHOD_CHANGED');
  perform pg_temp.expect_error($q$select public.admin_review_store_payment_method(pg_temp.id('store_a'), 'yape_plin', 'disable', 'No aplica', pg_temp.method_revision(pg_temp.id('store_a'), 'yape_plin'))$q$, 'PAYMENT_METHOD_NOT_APPROVED');
  perform pg_temp.expect_error($q$select public.admin_review_store_payment_method(pg_temp.id('store_a'), 'link_de_pago', 'approve', 'No existe', 1)$q$, 'PAYMENT_METHOD_NOT_FOUND');

  result := public.admin_review_store_payment_method(pg_temp.id('store_a'), 'yape_plin', 'approve',
    'Titular coincide con la razón social', pg_temp.method_revision(pg_temp.id('store_a'), 'yape_plin'));
  perform pg_temp.check(result->>'status' = 'approved', 'yape not approved');
  result := public.admin_review_store_payment_method(pg_temp.id('store_a'), 'efectivo_al_recoger', 'approve',
    'Pago en tienda', pg_temp.method_revision(pg_temp.id('store_a'), 'efectivo_al_recoger'));
  result := public.admin_review_store_payment_method(pg_temp.id('store_a'), 'pos_tarjeta_al_recoger', 'reject',
    'El titular no coincide con la razón social', pg_temp.method_revision(pg_temp.id('store_a'), 'pos_tarjeta_al_recoger'));
  perform pg_temp.check(result->>'status' = 'rejected' and result->>'review_reason' = 'El titular no coincide con la razón social', 'reject not stored');
  perform pg_temp.expect_error($q$select public.admin_review_store_payment_method(pg_temp.id('store_a'), 'yape_plin', 'approve', 'Otra vez', pg_temp.method_revision(pg_temp.id('store_a'), 'yape_plin'))$q$, 'PAYMENT_METHOD_NOT_PENDING');
  perform pg_temp.check(pg_temp.audits('store_payment_method_approved', pg_temp.id('store_a')) = 2
    and pg_temp.audits('store_payment_method_rejected', pg_temp.id('store_a')) = 1, 'Admin decisions not audited');
  perform pg_temp.check(pg_temp.changes(pg_temp.id('store_a'), 'approved') = 2 and pg_temp.changes(pg_temp.id('store_a'), 'rejected') = 1,
    'Admin decisions not in the history');
end $$;

-- An unverified store cannot get a method approved, even if a row exists from an earlier verification.
reset role;
insert into public.store_payment_methods(store_id, method, status) values (pg_temp.id('store_b'), 'efectivo_al_recoger', 'pending_review');
set local role authenticated;
select pg_temp.as_admin();
do $$ begin
  perform pg_temp.expect_error($q$select public.admin_review_store_payment_method(pg_temp.id('store_b'), 'efectivo_al_recoger', 'approve', 'Pago en tienda', pg_temp.method_revision(pg_temp.id('store_b'), 'efectivo_al_recoger'))$q$, 'PAYMENT_STORE_NOT_VERIFIED');
end $$;

-- ------------------------------------------------------------------ public reads

set local role anon;
select pg_temp.as_anon();
do $$ declare methods jsonb; request jsonb; begin
  methods := public.get_store_payment_methods(pg_temp.id('store_a'));
  perform pg_temp.check(methods = '[{"method":"efectivo_al_recoger","provider_label":null},{"method":"yape_plin","provider_label":"Yape"}]'::jsonb,
    'public methods are not exactly the approved ones: ' || methods::text);
  perform pg_temp.check(position('holder' in methods::text) = 0 and position('Tienda Pago A SAC' in methods::text) = 0, 'holder name leaked to the public');
  request := public.get_listing_purchase_request(pg_temp.id('l1'));
  perform pg_temp.check(request->'methods' = methods and request->'sku' = 'null'::jsonb, 'purchase request for an unlinked listing');
  perform pg_temp.check(public.get_listing_purchase_request(pg_temp.id('lp')) is null, 'a Particular listing offers a purchase request');
  perform pg_temp.check(public.get_listing_purchase_request(pg_temp.id('lb')) is null, 'an unverified store offers a purchase request');
  perform pg_temp.check(public.get_listing_purchase_request(pg_temp.id('lpending')) is null, 'a pending listing offers a purchase request');
  perform pg_temp.check(public.get_listing_purchase_request(gen_random_uuid()) is null, 'an unknown listing offers a purchase request');
  perform pg_temp.check(public.get_store_payment_methods(pg_temp.id('store_b')) = '[]'::jsonb, 'unverified store shows methods');
end $$;

-- Verification and store status are read live: revoking either hides the methods, restoring shows them again.
reset role;
-- Stand-in for the Admin verification functions, which set this flag themselves.
select set_config('app.allow_store_admin_fields', 'true', true);
update public.stores set is_verified = false where id = pg_temp.id('store_a');
set local role anon;
select pg_temp.as_anon();
do $$ begin
  perform pg_temp.check(public.get_store_payment_methods(pg_temp.id('store_a')) = '[]'::jsonb, 'methods shown after verification was revoked');
  perform pg_temp.check(public.get_listing_purchase_request(pg_temp.id('l1')) is null, 'purchase request after verification was revoked');
end $$;
reset role;
update public.stores set is_verified = true where id = pg_temp.id('store_a');
update public.stores set status = 'hidden' where id = pg_temp.id('store_a');
set local role anon;
select pg_temp.as_anon();
do $$ begin
  perform pg_temp.check(public.get_store_payment_methods(pg_temp.id('store_a')) = '[]'::jsonb, 'methods shown for a hidden store');
end $$;
reset role;
update public.stores set status = 'active' where id = pg_temp.id('store_a');
set local role anon;
select pg_temp.as_anon();
do $$ begin
  perform pg_temp.check(jsonb_array_length(public.get_store_payment_methods(pg_temp.id('store_a'))) = 2, 'methods did not return with verification');
end $$;
-- With the pilot off (review fix A14), nothing is public and owners cannot propose; Admins can still review.
reset role;
select laria_private.set_assisted_commerce_pilot(false, 'Pausa de prueba');
set local role anon;
select pg_temp.as_anon();
do $$ begin
  perform pg_temp.check(public.get_store_payment_methods(pg_temp.id('store_a')) = '[]'::jsonb, 'methods shown with the pilot off');
  perform pg_temp.check(public.get_listing_purchase_request(pg_temp.id('l1')) is null, 'purchase request with the pilot off');
end $$;
set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ begin
  perform pg_temp.expect_error($q$select public.set_store_payment_method('link_de_pago', 'Tienda Pago A SAC', 'Izipay', null)$q$, 'PAYMENT_PILOT_OFF');
  -- Withdrawing still works (undone here; the withdrawal section below covers it).
  begin
    perform pg_temp.check(public.withdraw_store_payment_method('yape_plin')->>'status' = 'withdrawn', 'owner could not withdraw with the pilot off');
    raise exception 'undo';
  exception when raise_exception then
    if sqlerrm <> 'undo' then raise; end if;
  end;
end $$;
select pg_temp.as_admin();
do $$ begin
  perform pg_temp.check((public.get_admin_store_payment_methods('approved', 1, 24)->>'total')::int >= 2, 'Admin list hidden with the pilot off');
end $$;
reset role;
select laria_private.set_assisted_commerce_pilot(true, 'Reanuda la prueba');
set local role anon;
select pg_temp.as_anon();
do $$ begin
  perform pg_temp.check(jsonb_array_length(public.get_store_payment_methods(pg_temp.id('store_a'))) = 2, 'methods did not return with the pilot');
end $$;
-- A verified store can still be hidden from the owner's side: it keeps rows, writes stay possible only while verified.
set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ declare result jsonb; begin
  -- An owner change to an approved method sends it back to review and hides it.
  result := public.set_store_payment_method('yape_plin', 'Tienda Pago A SAC', 'Yape y Plin', 'Confirma el pago antes de recoger.');
  perform pg_temp.check(result->>'status' = 'pending_review' and result->'review_reason' = 'null'::jsonb, 'owner change kept the approval');
  perform pg_temp.check(public.get_store_payment_methods(pg_temp.id('store_a')) = '[{"method":"efectivo_al_recoger","provider_label":null}]'::jsonb,
    'changed method stayed public');
  -- A rejected method can be proposed again.
  result := public.set_store_payment_method('pos_tarjeta_al_recoger', 'Tienda Pago A SAC', 'Izipay', 'Titular corregido');
  perform pg_temp.check(result->>'status' = 'pending_review', 'rejected method could not be proposed again');
end $$;

-- Review fix A14 (Codex item 6, finding 3): two owner changes in one transaction get different revisions, so a review
-- token read before the second change cannot approve it.
select pg_temp.as_user('owner_a');
do $$ declare seen integer; result jsonb; begin
  seen := pg_temp.method_revision(pg_temp.id('store_a'), 'yape_plin');
  perform set_config('qa.seen_revision', seen::text, true);
  result := public.set_store_payment_method('yape_plin', 'Otro Titular SAC', 'Yape y Plin', 'Confirma el pago antes de recoger.');
  perform pg_temp.check((result->>'revision')::int = seen + 1, 'an owner change in the same transaction kept the revision');
end $$;
select pg_temp.as_admin();
do $$ begin
  perform pg_temp.expect_error(format('select public.admin_review_store_payment_method(%L, %L, %L, %L, %s)', pg_temp.id('store_a'),
    'yape_plin', 'approve', 'Titular coincide', current_setting('qa.seen_revision')), 'PAYMENT_METHOD_CHANGED');
end $$;
select pg_temp.as_user('owner_a');
select public.set_store_payment_method('yape_plin', 'Tienda Pago A SAC', 'Yape y Plin', 'Confirma el pago antes de recoger.');

-- A change of RUC or razón social sends approved methods back to review, and moves the revision of pending ones (Codex
-- item 6, finding 2), so an Admin screen loaded against the old business data cannot approve.
reset role;
select set_config('qa.pos_revision', pg_temp.method_revision(pg_temp.id('store_a'), 'pos_tarjeta_al_recoger')::text, true);
update public.stores set razon_social = 'Tienda Pago A EIRL' where id = pg_temp.id('store_a');
do $$ begin
  perform pg_temp.check(pg_temp.method_status(pg_temp.id('store_a'), 'efectivo_al_recoger') = 'pending_review', 'razón social change kept the approval');
  perform pg_temp.check(pg_temp.method_status(pg_temp.id('store_a'), 'pos_tarjeta_al_recoger') = 'pending_review'
    and pg_temp.method_revision(pg_temp.id('store_a'), 'pos_tarjeta_al_recoger') = current_setting('qa.pos_revision')::int + 1,
    'razón social change left the pending revision');
  -- efectivo (approved), yape and pos (pending).
  perform pg_temp.check(pg_temp.changes(pg_temp.id('store_a'), 'business_data_changed') = 3, 'business data change not in the history');
  perform pg_temp.check(public.get_store_payment_methods(pg_temp.id('store_a')) = '[]'::jsonb, 'methods public after a razón social change');
end $$;
set local role authenticated;
select pg_temp.as_admin();
do $$ begin
  perform pg_temp.expect_error(format('select public.admin_review_store_payment_method(%L, %L, %L, %L, %s)', pg_temp.id('store_a'),
    'pos_tarjeta_al_recoger', 'approve', 'Titular coincide con Tienda Pago A SAC', current_setting('qa.pos_revision')), 'PAYMENT_METHOD_CHANGED');
end $$;
reset role;
-- Other store edits leave approvals alone.
set local role authenticated;
select pg_temp.as_admin();
select public.admin_review_store_payment_method(pg_temp.id('store_a'), 'efectivo_al_recoger', 'approve', 'Pago en tienda', pg_temp.method_revision(pg_temp.id('store_a'), 'efectivo_al_recoger'));
select public.admin_review_store_payment_method(pg_temp.id('store_a'), 'yape_plin', 'approve', 'Titular coincide con la nueva razón social', pg_temp.method_revision(pg_temp.id('store_a'), 'yape_plin'));
reset role;
update public.stores set description = 'Otra descripción de la tienda' where id = pg_temp.id('store_a');
do $$ begin
  perform pg_temp.check(pg_temp.method_status(pg_temp.id('store_a'), 'efectivo_al_recoger') = 'approved', 'an unrelated store edit reset the approval');
end $$;

-- ------------------------------------------------------------------ inventory: SKU and stock-outs

set local role authenticated;
select pg_temp.as_admin();
select public.admin_set_store_inventory_enabled(pg_temp.id('store_a'), true, 'Piloto PAY-1');
select pg_temp.as_user('owner_a');
do $$ declare result jsonb; item uuid; begin
  result := public.create_inventory_item('{"merchant_sku":"PAY-DS1","product_name":"Guitarra Pago uno","unit_price_pen":1000}', 1, 'qa-pay1-create');
  item := (result->'item'->>'id')::uuid;
  perform pg_temp.remember('item', item);
  result := public.link_inventory_listing(item, pg_temp.id('l1'), (result->'item'->>'version')::int, 1000);
  perform pg_temp.check(public.get_listing_purchase_request(pg_temp.id('l1'))->>'sku' = 'PAY-DS1', 'linked SKU not in the purchase request');
  -- Out of stock: no purchase request (the restock question stays).
  result := public.record_stock_movement(item, 'sale', 1, 'tienda_fisica', null, null, null, 'qa-pay1-sale');
  perform pg_temp.check(public.get_listing_purchase_request(pg_temp.id('l1')) is null, 'out-of-stock listing offers a purchase request');
  result := public.record_stock_movement(item, 'restock', 2, null, null, null, null, 'qa-pay1-restock');
  perform pg_temp.check(public.get_listing_purchase_request(pg_temp.id('l1')) is not null, 'restocked listing lost its purchase request');
end $$;

-- ------------------------------------------------------------------ purchase-intent events

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare result jsonb; before_events bigint; begin
  select count(*) into before_events from public.marketplace_events where listing_id = pg_temp.id('l1');
  result := public.record_marketplace_event('whatsapp_contact', gen_random_uuid(), gen_random_uuid(), pg_temp.id('buyer'), pg_temp.id('l1'), null, 'detail', '{"intent":"purchase"}');
  perform pg_temp.check(result->>'recorded' = 'true', 'purchase request not recorded');
  perform pg_temp.check((select count(*) from public.marketplace_events where listing_id = pg_temp.id('l1') and event_type = 'whatsapp_contact'
    and metadata = '{"intent":"purchase"}' and actor_user_id = pg_temp.id('buyer') and store_id = pg_temp.id('store_a')) = 1,
    'purchase request is not a whatsapp_contact with the purchase intent');
  -- A plain contact keeps empty metadata.
  result := public.record_marketplace_event('whatsapp_contact', gen_random_uuid(), gen_random_uuid(), null, pg_temp.id('l2'), null, 'detail', '{}');
  perform pg_temp.check((select metadata from public.marketplace_events where listing_id = pg_temp.id('l2') and event_type = 'whatsapp_contact' limit 1) = '{}'::jsonb,
    'plain contact gained metadata');
  perform pg_temp.expect_error($q$select public.record_marketplace_event('whatsapp_contact', gen_random_uuid(), gen_random_uuid(), null, pg_temp.id('lp'), null, 'detail', '{"intent":"purchase"}')$q$, 'Invalid purchase intent');
  perform pg_temp.expect_error($q$select public.record_marketplace_event('whatsapp_contact', gen_random_uuid(), gen_random_uuid(), null, pg_temp.id('lb'), null, 'detail', '{"intent":"purchase"}')$q$, 'Invalid purchase intent');
  perform pg_temp.expect_error($q$select public.record_marketplace_event('whatsapp_contact', gen_random_uuid(), gen_random_uuid(), null, pg_temp.id('l1'), null, 'detail', '{"intent":"pay"}')$q$, 'Invalid purchase intent');
  perform pg_temp.expect_error($q$select public.record_marketplace_event('whatsapp_contact', gen_random_uuid(), gen_random_uuid(), null, pg_temp.id('l1'), null, 'detail', '{"intent":"purchase","amount":10}')$q$, 'Invalid purchase intent');
  -- Other event types still take no free-form metadata.
  perform pg_temp.expect_error($q$select public.record_marketplace_event('store_contact', gen_random_uuid(), gen_random_uuid(), null, null, pg_temp.id('store_a'), 'store', '{"intent":"purchase"}')$q$, 'No freeform event metadata allowed');
  perform pg_temp.expect_error($q$select public.record_marketplace_event('listing_view', gen_random_uuid(), gen_random_uuid(), null, pg_temp.id('l1'), null, 'detail', '{"intent":"purchase"}')$q$, 'No freeform event metadata allowed');
  -- The seller's own click is not counted, as for any contact.
  result := public.record_marketplace_event('whatsapp_contact', gen_random_uuid(), gen_random_uuid(), pg_temp.id('owner_a'), pg_temp.id('l1'), null, 'detail', '{"intent":"purchase"}');
  perform pg_temp.check(result->>'recorded' = 'false', 'the seller''s own purchase request was counted');
end $$;
-- Browser roles still cannot record events directly.
set local role anon;
select pg_temp.as_anon();
do $$ begin
  perform pg_temp.expect_error($q$select public.record_marketplace_event('whatsapp_contact', gen_random_uuid(), gen_random_uuid(), null, pg_temp.id('l1'), null, 'detail', '{"intent":"purchase"}')$q$, 'Service access required');
end $$;

-- ------------------------------------------------------------------ no money state, stock or listing side effects

reset role;
do $$ begin
  perform pg_temp.check((select quantity_on_hand from public.store_inventory_items where id = pg_temp.id('item')) = 2, 'a purchase request changed stock');
  perform pg_temp.check((select status from public.listings where id = pg_temp.id('l1')) = 'approved', 'a purchase request changed the listing');
  perform pg_temp.check(not exists(select 1 from information_schema.columns where table_schema = 'public'
    and table_name in ('store_payment_methods', 'store_payment_method_changes')
    and column_name ~ '(amount|paid|payment_url|link|phone|account|card|token|secret)'), 'a money or credential column exists');
end $$;

-- ------------------------------------------------------------------ withdrawal and history

set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ declare result jsonb; begin
  result := public.withdraw_store_payment_method('yape_plin');
  perform pg_temp.check(result->>'status' = 'withdrawn', 'withdrawal not stored');
  perform pg_temp.check(public.get_store_payment_methods(pg_temp.id('store_a')) = '[{"method":"efectivo_al_recoger","provider_label":null}]'::jsonb,
    'withdrawn method stayed public');
  result := public.withdraw_store_payment_method('yape_plin');
  perform pg_temp.check(pg_temp.changes(pg_temp.id('store_a'), 'withdrawn') = 1, 'repeated withdrawal recorded twice');
end $$;
select pg_temp.as_admin();
do $$ begin
  perform pg_temp.expect_error($q$select public.admin_review_store_payment_method(pg_temp.id('store_a'), 'yape_plin', 'approve', 'Titular coincide', pg_temp.method_revision(pg_temp.id('store_a'), 'yape_plin'))$q$, 'PAYMENT_METHOD_NOT_PENDING');
  perform public.admin_review_store_payment_method(pg_temp.id('store_a'), 'efectivo_al_recoger', 'disable', 'Reclamos de compradores', pg_temp.method_revision(pg_temp.id('store_a'), 'efectivo_al_recoger'));
  perform pg_temp.check(public.get_store_payment_methods(pg_temp.id('store_a')) = '[]'::jsonb, 'disabled method stayed public');
  perform pg_temp.check(public.get_listing_purchase_request(pg_temp.id('l1')) is null, 'purchase request without any method');
  perform pg_temp.check(pg_temp.audits('store_payment_method_disabled', pg_temp.id('store_a')) = 1, 'disable not audited');
end $$;
reset role;
do $$ begin
  perform pg_temp.expect_error($q$update public.store_payment_method_changes set reason = 'x'$q$, 'PAYMENT_METHOD_HISTORY_APPEND_ONLY');
  perform pg_temp.expect_error($q$delete from public.store_payment_method_changes$q$, 'PAYMENT_METHOD_HISTORY_APPEND_ONLY');
end $$;

rollback;
