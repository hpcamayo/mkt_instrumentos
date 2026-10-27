-- Feature ideas, store-floor batch, buy-09 "Cuotas" (docs/feature-ideas/store-floor.md): interest-free installment
-- offers, their Admin review, the listing column kept from the public offer and the "Acepta cuotas" flag.
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
create function pg_temp.listing(p_slug text) returns public.listings language sql security definer as $$
  select * from public.listings where slug = p_slug
$$;
create function pg_temp.cuotas(p_slug text) returns smallint language sql security definer as $$
  select installments_max from public.listings where slug = p_slug
$$;
create function pg_temp.flagged(p_slug text) returns boolean language sql security definer as $$
  select 'acepta_cuotas' = any(listing_flags) from public.listings where slug = p_slug
$$;
create function pg_temp.offer() returns public.store_installment_offers language sql security definer as $$
  select * from public.store_installment_offers where store_id = current_setting('qa.store_a')::uuid
$$;
create function pg_temp.changes(p_type text) returns bigint language sql security definer as $$
  select count(*) from public.store_installment_offer_changes where store_id = current_setting('qa.store_a')::uuid and change_type = p_type
$$;
create function pg_temp.audits(p_action text) returns bigint language sql security definer as $$
  select count(*) from public.admin_audit_actions where action = p_action and target_type = 'store' and target_id = current_setting('qa.store_a')::uuid
$$;
create function pg_temp.method_revision(p_method text) returns integer language sql security definer as $$
  select revision from public.store_payment_methods where store_id = current_setting('qa.store_a')::uuid and method = p_method::public.store_payment_method
$$;
-- Owners act on a second-step session (aal2), as safe-08 requires once a store has an approved payment method;
-- as_first_step is the session without it.
create function pg_temp.as_user(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(p_name), 'role', 'authenticated', 'aal', 'aal2')::text, true);
end $$;
create function pg_temp.as_first_step(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(p_name), 'role', 'authenticated', 'aal', 'aal1')::text, true);
end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"c9100000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal2","app_metadata":{"role":"admin"}}', true);
end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', '{"role":"anon"}', true); end $$;
-- An Admin decision on one of store A's payment methods, at its current revision.
create function pg_temp.review_method(p_method text, p_decision text) returns void language plpgsql as $$
begin
  perform pg_temp.as_admin();
  perform public.admin_review_store_payment_method(pg_temp.id('store_a'), p_method::public.store_payment_method, p_decision,
    'Titular coincide con la razón social', pg_temp.method_revision(p_method));
end $$;

select pg_temp.remember('owner_a', 'c9100000-0000-4000-8000-000000000001'),
       pg_temp.remember('owner_b', 'c9100000-0000-4000-8000-000000000002'),
       pg_temp.remember('particular', 'c9100000-0000-4000-8000-000000000003'),
       pg_temp.remember('store_a', 'c9200000-0000-4000-8000-000000000001'),
       pg_temp.remember('store_b', 'c9200000-0000-4000-8000-000000000002');

-- ------------------------------------------------------------------ fixtures

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('c9100000-0000-4000-8000-000000000001','authenticated','authenticated','cuotas-owner-a@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Cuotas A","phone":"51999996001","city":"Lima","region":"Lima"}'),
 ('c9100000-0000-4000-8000-000000000002','authenticated','authenticated','cuotas-owner-b@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Cuotas B","phone":"51999996002","city":"Lima","region":"Lima"}'),
 ('c9100000-0000-4000-8000-000000000003','authenticated','authenticated','cuotas-particular@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Particular Cuotas","phone":"51999996003","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('c9200000-0000-4000-8000-000000000001','cuotas-tienda-a','Tienda Cuotas A','Tienda Cuotas A SAC','20999996001','cuotas-a@example.invalid','Contacto A','Contacto A','51999996001','Lima','Lima','Av. QA 1','c9100000-0000-4000-8000-000000000001','active','free',true),
 ('c9200000-0000-4000-8000-000000000002','cuotas-tienda-b','Tienda Cuotas B','Tienda Cuotas B SAC','20999996002','cuotas-b@example.invalid','Contacto B','Contacto B','51999996002','Lima','Lima','Av. QA 2','c9100000-0000-4000-8000-000000000002','active','free',false);

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at) values
 ('c9300000-0000-4000-8000-000000000001','cuotas-cara','Guitarra Cuotas cara','store','approved','guitars','electric_guitar','QA','Uno','Nuevo',4299,'Lima','Lima','Contacto A','51999996001','Descripción de publicación válida con más de cuarenta caracteres.','c9100000-0000-4000-8000-000000000001','c9200000-0000-4000-8000-000000000001','self_service',now()),
 ('c9300000-0000-4000-8000-000000000002','cuotas-barata','Guitarra Cuotas barata','store','approved','guitars','electric_guitar','QA','Dos','Nuevo',300,'Lima','Lima','Contacto A','51999996001','Descripción de publicación válida con más de cuarenta caracteres.','c9100000-0000-4000-8000-000000000001','c9200000-0000-4000-8000-000000000001','self_service',now()),
 ('c9300000-0000-4000-8000-000000000003','cuotas-tienda-b','Guitarra Cuotas tienda B','store','approved','guitars','electric_guitar','QA','Tres','Nuevo',2000,'Lima','Lima','Contacto B','51999996002','Descripción de publicación válida con más de cuarenta caracteres.','c9100000-0000-4000-8000-000000000002','c9200000-0000-4000-8000-000000000002','self_service',now()),
 ('c9300000-0000-4000-8000-000000000004','cuotas-particular','Guitarra Cuotas particular','individual','approved','guitars','electric_guitar','QA','Cuatro','Bueno',2000,'Lima','Lima','Particular Cuotas','51999996003','Descripción de publicación válida con más de cuarenta caracteres.','c9100000-0000-4000-8000-000000000003',null,'self_service',now());

insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/cuotas-' || l.slug || '-' || n || '.jpg', n
from public.listings l cross join generate_series(0, 1) n
where l.slug like 'cuotas-%';

select pg_temp.check(laria_private.assisted_commerce_pilot_enabled() is false, 'the pilot starts off');
select pg_temp.check((select sort_order from laria_private.listing_flag_filters where flag = 'acepta_cuotas') = 50, '"Acepta cuotas" not registered');

-- ------------------------------------------------------------------ browser role boundaries

set local role anon;
select pg_temp.as_anon();
do $$ begin
  perform pg_temp.expect_error('select 1 from public.store_installment_offers', 'permission denied');
  perform pg_temp.expect_error('select 1 from public.store_installment_offer_changes', 'permission denied');
  perform pg_temp.expect_error($q$select public.set_store_installments(12, '{}', null, null, true)$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.withdraw_store_installments()$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.admin_review_store_installments(pg_temp.id('store_a'), 'approve', 'Anon', 1)$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.get_admin_store_installment_offers('pending_review', 1, 24)$q$, 'permission denied');
  perform pg_temp.expect_error($q$select laria_private.refresh_store_installments(pg_temp.id('store_a'))$q$, 'permission denied');
  perform pg_temp.check(public.get_store_installment_offer(pg_temp.id('store_a')) is null, 'anon read: no offer yet');
end $$;

-- ------------------------------------------------------------------ pilot off

set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ begin
  perform pg_temp.expect_error($q$select public.set_store_installments(12, '{}', null, null, true)$q$, 'PAYMENT_PILOT_OFF');
end $$;

reset role;
select pg_temp.check(laria_private.set_assisted_commerce_pilot(true, 'Prueba de cuotas'), 'pilot not turned on');
select pg_temp.check(laria_private.installment_cards(array['bcp', 'INTERBANK', 'Bcp', 'tarjeta oh']) = array['BCP', 'Interbank', 'Tarjeta Oh'],
  'card names not matched to the list, once each, in list order');

-- ------------------------------------------------------------------ owner proposals

set local role authenticated;
select pg_temp.as_user('particular');
do $$ begin
  perform pg_temp.expect_error($q$select public.set_store_installments(12, '{}', null, null, true)$q$, 'PAYMENT_STORE_REQUIRED');
end $$;

select pg_temp.as_user('owner_b');
do $$ begin
  perform pg_temp.expect_error($q$select public.set_store_installments(12, '{}', null, null, true)$q$, 'PAYMENT_STORE_NOT_VERIFIED');
end $$;

select pg_temp.as_user('owner_a');
do $$ begin
  -- Only interest-free offers, a count in range, cards from the list and a note without numbers or links.
  perform pg_temp.expect_error($q$select public.set_store_installments(12, '{}', null, null, false)$q$, 'PAYMENT_INSTALLMENTS_INTEREST_FREE');
  perform pg_temp.expect_error($q$select public.set_store_installments(12, '{}', null, null, null)$q$, 'PAYMENT_INSTALLMENTS_INTEREST_FREE');
  perform pg_temp.expect_error($q$select public.set_store_installments(1, '{}', null, null, true)$q$, 'PAYMENT_INSTALLMENTS_COUNT');
  perform pg_temp.expect_error($q$select public.set_store_installments(48, '{}', null, null, true)$q$, 'PAYMENT_INSTALLMENTS_COUNT');
  perform pg_temp.expect_error($q$select public.set_store_installments(12, '{}', 0, null, true)$q$, 'PAYMENT_INSTALLMENTS_MIN_PRICE');
  perform pg_temp.expect_error($q$select public.set_store_installments(12, array['Banco Inventado'], null, null, true)$q$, 'PAYMENT_INSTALLMENTS_CARDS_INVALID');
  perform pg_temp.expect_error($q$select public.set_store_installments(12, '{}', null, 'Llama al 987 654 321', true)$q$, 'PAYMENT_METHOD_SENSITIVE_DATA');
  -- Installments need a card: cash alone is not enough.
  perform pg_temp.expect_error($q$select public.set_store_installments(12, '{}', null, null, true)$q$, 'PAYMENT_INSTALLMENTS_CARD_REQUIRED');
  perform public.set_store_payment_method('efectivo_al_recoger');
  perform pg_temp.expect_error($q$select public.set_store_installments(12, '{}', null, null, true)$q$, 'PAYMENT_INSTALLMENTS_CARD_REQUIRED');
end $$;

-- A card method in review is enough to propose; buyers see nothing until both are approved.
do $$ declare result jsonb; begin
  perform public.set_store_payment_method('pos_tarjeta_al_recoger', 'Tienda Cuotas A SAC', 'Izipay', null);
  result := public.set_store_installments(12, array['interbank', 'BCP'], 500, 'Con Visa y Mastercard de esos bancos.', true);
  perform pg_temp.check(result ->> 'status' = 'pending_review' and (result ->> 'max_installments')::integer = 12
    and result -> 'cards' = '["BCP", "Interbank"]' and (result ->> 'min_price_pen')::integer = 500, 'proposal not saved as sent');
  -- Saving the same values again changes nothing.
  result := public.set_store_installments(12, array['BCP', 'Interbank'], 500, 'Con Visa y Mastercard de esos bancos.', true);
  perform pg_temp.check((result ->> 'revision')::integer = 1 and pg_temp.changes('proposed') = 1, 'a repeated save made a new revision');
  perform pg_temp.check((select count(*) from public.store_installment_offers) = 1, 'the owner does not read their own offer');
  perform pg_temp.check(public.get_store_installment_offer(pg_temp.id('store_a')) is null, 'a pending offer is public');
end $$;
select pg_temp.check((select after ->> 'interest_free_confirmed' from public.store_installment_offer_changes
  where store_id = pg_temp.id('store_a') and change_type = 'proposed') = 'true', 'the interest-free confirmation is not in the history');

-- Another store's owner sees nothing of it.
select pg_temp.as_user('owner_b');
select pg_temp.check((select count(*) from public.store_installment_offers) = 0
  and (select count(*) from public.store_installment_offer_changes) = 0, 'an offer leaked to another owner');
do $$ begin
  perform pg_temp.expect_error($q$select public.get_admin_store_installment_offers('pending_review', 1, 24)$q$, 'ADMIN_REQUIRED');
  perform pg_temp.expect_error($q$select public.admin_review_store_installments(pg_temp.id('store_a'), 'approve', 'Yo mismo', 1)$q$, 'ADMIN_REQUIRED');
end $$;

-- ------------------------------------------------------------------ Admin review and the listing column

select pg_temp.as_admin();
do $$ declare queue jsonb; begin
  queue := public.get_admin_store_installment_offers('pending_review', 1, 24);
  perform pg_temp.check((queue ->> 'total')::integer = 1 and queue -> 'items' -> 0 ->> 'store_name' = 'Tienda Cuotas A'
    and queue -> 'items' -> 0 -> 'card_methods' -> 0 ->> 'status' = 'pending_review', 'review queue lacks the offer or its card method');
  perform pg_temp.expect_error($q$select public.admin_review_store_installments(pg_temp.id('store_a'), 'approve', 'ok', 1)$q$, 'PAYMENT_REASON_REQUIRED');
  perform pg_temp.expect_error($q$select public.admin_review_store_installments(pg_temp.id('store_a'), 'approve', 'Revisado', 7)$q$, 'PAYMENT_INSTALLMENTS_CHANGED');
  perform pg_temp.expect_error($q$select public.admin_review_store_installments(pg_temp.id('store_a'), 'disable', 'Revisado', 1)$q$, 'PAYMENT_INSTALLMENTS_NOT_APPROVED');
  perform pg_temp.expect_error($q$select public.admin_review_store_installments(pg_temp.id('store_b'), 'approve', 'Revisado', 1)$q$, 'PAYMENT_INSTALLMENTS_NOT_FOUND');
  perform public.admin_review_store_installments(pg_temp.id('store_a'), 'approve', 'Cuotas sin intereses confirmadas', 1);
end $$;
-- Approved, but the card method is still in review: nothing public yet.
select pg_temp.check((pg_temp.offer()).status = 'approved' and public.get_store_installment_offer(pg_temp.id('store_a')) is null
  and pg_temp.cuotas('cuotas-cara') is null, 'an offer without an approved card method is public');

select pg_temp.review_method('pos_tarjeta_al_recoger', 'approve');
select pg_temp.check(public.get_store_installment_offer(pg_temp.id('store_a'))
  = '{"max_installments": 12, "cards": ["BCP", "Interbank"], "min_price_pen": 500}'::jsonb, 'public offer not shown');
select pg_temp.check(pg_temp.cuotas('cuotas-cara') = 12 and pg_temp.flagged('cuotas-cara'), 'listing above the minimum lacks the installments');
select pg_temp.check(pg_temp.cuotas('cuotas-barata') is null and not pg_temp.flagged('cuotas-barata'), 'listing below the minimum shows installments');
select pg_temp.check(pg_temp.cuotas('cuotas-tienda-b') is null and pg_temp.cuotas('cuotas-particular') is null, 'other sellers show installments');
select pg_temp.check(pg_temp.audits('store_installments_approved') = 1, 'approval not audited');

-- The value is never taken from a write: an Admin edit recomputes it, and a price change crosses the minimum.
update public.listings set installments_max = 24 where slug = 'cuotas-cara';
update public.listings set installments_max = 24 where slug = 'cuotas-barata';
select pg_temp.check(pg_temp.cuotas('cuotas-cara') = 12 and pg_temp.cuotas('cuotas-barata') is null, 'a written value stuck');
update public.listings set price_pen = 800 where slug = 'cuotas-barata';
select pg_temp.check(pg_temp.cuotas('cuotas-barata') = 12 and pg_temp.flagged('cuotas-barata'), 'a price above the minimum did not add installments');
update public.listings set price_pen = 300 where slug = 'cuotas-barata';
select pg_temp.check(pg_temp.cuotas('cuotas-barata') is null and not pg_temp.flagged('cuotas-barata'), 'a price below the minimum kept installments');

-- A new store listing takes the offer when it is written.
reset role;
insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at) values
 ('c9300000-0000-4000-8000-000000000005','cuotas-nueva','Guitarra Cuotas nueva','store','pending','guitars','electric_guitar','QA','Cinco','Nuevo',1500,'Lima','Lima','Contacto A','51999996001','Descripción de publicación válida con más de cuarenta caracteres.','c9100000-0000-4000-8000-000000000001','c9200000-0000-4000-8000-000000000001','self_service',now());
select pg_temp.check(pg_temp.cuotas('cuotas-nueva') = 12 and pg_temp.flagged('cuotas-nueva'), 'a new listing did not take the offer');

-- Saved searches and alerts take "Acepta cuotas" through the "options" key, like every registered flag.
select pg_temp.check(laria_private.normalize_saved_search('{"options":["acepta_cuotas"]}') -> 'options' = '["acepta_cuotas"]',
  'saved search dropped "Acepta cuotas"');
select pg_temp.check(laria_private.listing_matches_saved_search(pg_temp.listing('cuotas-cara'), '{"options":["acepta_cuotas"]}')
  and not laria_private.listing_matches_saved_search(pg_temp.listing('cuotas-barata'), '{"options":["acepta_cuotas"]}'),
  'saved search does not match by "Acepta cuotas"');

-- ------------------------------------------------------------------ everything the public offer depends on

-- The store's verification.
select set_config('app.allow_store_admin_fields', 'true', true);
update public.stores set is_verified = false where id = pg_temp.id('store_a');
select pg_temp.check(pg_temp.cuotas('cuotas-cara') is null and public.get_store_installment_offer(pg_temp.id('store_a')) is null,
  'an unverified store shows installments');
update public.stores set is_verified = true where id = pg_temp.id('store_a');
select set_config('app.allow_store_admin_fields', 'false', true);
select pg_temp.check(pg_temp.cuotas('cuotas-cara') = 12, 'a verified store again lacks installments');

-- The pilot switch.
select laria_private.set_assisted_commerce_pilot(false, 'Pausa de prueba');
select pg_temp.check(pg_temp.cuotas('cuotas-cara') is null and pg_temp.cuotas('cuotas-nueva') is null, 'installments shown with the pilot off');
select laria_private.set_assisted_commerce_pilot(true, 'Vuelve el piloto');
select pg_temp.check(pg_temp.cuotas('cuotas-cara') = 12 and pg_temp.cuotas('cuotas-nueva') = 12, 'installments not back with the pilot');

-- The card method: withdrawn by the owner, proposed again, approved again.
set local role authenticated;
select pg_temp.as_user('owner_a');
select public.withdraw_store_payment_method('pos_tarjeta_al_recoger');
select pg_temp.check(pg_temp.cuotas('cuotas-cara') is null, 'installments shown without a card method');
select public.set_store_payment_method('link_de_pago', 'Tienda Cuotas A SAC', 'Niubiz', null);
select pg_temp.check(pg_temp.cuotas('cuotas-cara') is null, 'installments shown with a card method in review');
select pg_temp.review_method('link_de_pago', 'approve');
select pg_temp.check(pg_temp.cuotas('cuotas-cara') = 12, 'installments not back with an approved card method');

-- ------------------------------------------------------------------ changes, rejection, disabling, withdrawal

-- safe-08: with an approved payment method, a first-step session cannot change the installments.
select pg_temp.as_first_step('owner_a');
do $$ begin
  perform pg_temp.expect_error($q$select public.set_store_installments(6, '{}', null, null, true)$q$, 'TWO_STEP_REQUIRED');
  perform pg_temp.expect_error($q$select public.withdraw_store_installments()$q$, 'TWO_STEP_REQUIRED');
end $$;

select pg_temp.as_user('owner_a');
do $$ declare result jsonb; begin
  result := public.set_store_installments(6, '{}', null, null, true);
  perform pg_temp.check(result ->> 'status' = 'pending_review' and (result ->> 'revision')::integer = 3 and result -> 'cards' = '[]',
    'a change did not go back to review');
  perform pg_temp.check(pg_temp.cuotas('cuotas-cara') is null and pg_temp.cuotas('cuotas-nueva') is null, 'a changed offer stayed public');
end $$;

select pg_temp.as_admin();
do $$ begin
  perform pg_temp.expect_error($q$select public.admin_review_store_installments(pg_temp.id('store_a'), 'approve', 'Revisado', 2)$q$, 'PAYMENT_INSTALLMENTS_CHANGED');
  perform public.admin_review_store_installments(pg_temp.id('store_a'), 'reject', 'No ofrecen cuotas sin intereses con todas las tarjetas', 3);
end $$;
select pg_temp.check((pg_temp.offer()).status = 'rejected' and pg_temp.audits('store_installments_rejected') = 1, 'rejection not saved');

select pg_temp.as_user('owner_a');
select pg_temp.check((select review_reason from public.store_installment_offers) = 'No ofrecen cuotas sin intereses con todas las tarjetas',
  'the owner does not see why');
select public.set_store_installments(6, array['BBVA'], 1000, null, true);

select pg_temp.as_admin();
select public.admin_review_store_installments(pg_temp.id('store_a'), 'approve', 'Cuotas con BBVA confirmadas', (pg_temp.offer()).revision);
select pg_temp.check(pg_temp.cuotas('cuotas-cara') = 6 and pg_temp.cuotas('cuotas-nueva') = 6, 'the approved change is not on the listings');
select public.admin_review_store_installments(pg_temp.id('store_a'), 'disable', 'La tienda dejó de ofrecerlas', (pg_temp.offer()).revision);
select pg_temp.check((pg_temp.offer()).status = 'disabled' and pg_temp.cuotas('cuotas-cara') is null
  and pg_temp.audits('store_installments_disabled') = 1 and pg_temp.audits('store_installments_approved') = 2, 'disabling not applied');

select pg_temp.as_user('owner_a');
select public.set_store_installments(6, array['BBVA'], 1000, null, true);
select pg_temp.as_admin();
select public.admin_review_store_installments(pg_temp.id('store_a'), 'approve', 'Otra vez disponibles', (pg_temp.offer()).revision);
select pg_temp.as_user('owner_a');
do $$ declare result jsonb; begin
  result := public.withdraw_store_installments();
  perform pg_temp.check(result ->> 'status' = 'withdrawn' and pg_temp.cuotas('cuotas-cara') is null, 'withdrawal not applied');
  result := public.withdraw_store_installments();
  perform pg_temp.check(pg_temp.changes('withdrawn') = 1, 'a second withdrawal was recorded');
end $$;
select pg_temp.as_user('owner_b');
do $$ begin
  perform pg_temp.expect_error($q$select public.withdraw_store_installments()$q$, 'PAYMENT_INSTALLMENTS_NOT_FOUND');
end $$;

-- The history has every step and cannot be changed.
reset role;
select pg_temp.check(pg_temp.changes('proposed') = 4 and pg_temp.changes('approved') = 3 and pg_temp.changes('rejected') = 1
  and pg_temp.changes('disabled') = 1, 'history incomplete');
do $$ begin
  perform pg_temp.expect_error($q$update public.store_installment_offer_changes set reason = 'x'$q$, 'PAYMENT_METHOD_HISTORY_APPEND_ONLY');
  perform pg_temp.expect_error($q$delete from public.store_installment_offer_changes$q$, 'PAYMENT_METHOD_HISTORY_APPEND_ONLY');
end $$;

rollback;
