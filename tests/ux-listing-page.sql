-- Effortless Laria, batch "listing" (docs/ux-effortless/listing.md): content and price history (list-04, list-05),
-- the seller's public facts (list-10, trust-03), the review page with its breakdown (list-06) and "Avísame cuando
-- vuelva" (list-11). Local/test database only. Every fixture is rolled back.
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
create function pg_temp.listing(p_slug text) returns public.listings language sql security definer as $$
  select * from public.listings where slug = p_slug
$$;
-- Admin-side writes that bypass the listing guard, the way trusted RPCs do.
create function pg_temp.set_price(p_slug text, p_price integer, p_changed_days_ago integer default null) returns void language plpgsql as $$
begin
  perform set_config('app.allow_listing_admin_fields', 'true', true);
  if p_changed_days_ago is not null then
    -- Age the current price: the trigger keeps its own columns, so turn it off for this fixture step only.
    alter table public.listings disable trigger listings_track_content_change;
    update public.listings set price_changed_at = now() - make_interval(days => p_changed_days_ago) where slug = p_slug;
    alter table public.listings enable trigger listings_track_content_change;
  end if;
  update public.listings set price_pen = p_price where slug = p_slug;
  perform set_config('app.allow_listing_admin_fields', '', true);
end $$;

insert into auth.users(id, aud, role, email, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data) values
 ('e1030000-0000-4000-8000-000000000001','authenticated','authenticated','uxlp-seller@example.invalid',now(),now() - interval '2 hours','{}','{"account_type":"seller","full_name":"Vendedora Uno","phone":"51999993001","city":"Lima","region":"Lima"}'),
 ('e1030000-0000-4000-8000-000000000002','authenticated','authenticated','uxlp-owner@example.invalid',now(),now() - interval '3 days','{}','{"account_type":"store_owner","full_name":"Dueño","phone":"51999993002","city":"Lima","region":"Lima"}'),
 ('e1030000-0000-4000-8000-000000000003','authenticated','authenticated','uxlp-buyer@example.invalid',now(),null,'{}','{"account_type":"seller","full_name":"Comprador","phone":"51999993003","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,district,address,owner_user_id,status,listing_plan,is_verified) values
 ('e1031000-0000-4000-8000-000000000001','uxlp-tienda','Tienda Página','Tienda Página SAC','20999993001','uxlp@example.invalid','Contacto','Contacto','51999993002','Lima','Lima','Miraflores','Av. Larco 100','e1030000-0000-4000-8000-000000000002','active','free',true);

select set_config('app.allow_listing_admin_fields', 'true', true);
insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at,stock_state) values
 ('e1032000-0000-4000-8000-000000000001','uxlp-particular','Guitarra de prueba','individual','approved','guitars','electric_guitar','QA','Uno','Usado - buen estado',1000,'Lima','Lima','Vendedora Uno','51999993001','Descripción válida con más de cuarenta caracteres para la prueba.','e1030000-0000-4000-8000-000000000001',null,'self_service',now(),null),
 ('e1032000-0000-4000-8000-000000000002','uxlp-store','Pedal de tienda','store','approved','pedals','pedals','QA','Dos','Nuevo',300,'Lima','Lima','Contacto','51999993002','Descripción válida con más de cuarenta caracteres para la prueba.','e1030000-0000-4000-8000-000000000002','e1031000-0000-4000-8000-000000000001','self_service',now(),'out_of_stock'),
 ('e1032000-0000-4000-8000-000000000003','uxlp-pending','Pedal pendiente','individual','pending','pedals','pedals','QA','Tres','Nuevo',300,'Lima','Lima','Vendedora Uno','51999993001','Descripción válida con más de cuarenta caracteres para la prueba.','e1030000-0000-4000-8000-000000000001',null,'self_service',now(),null);

select set_config('app.allow_listing_admin_fields', '', true);

insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/' || l.slug || '-' || n || '.jpg', n
from public.listings l cross join generate_series(0, 1) n where l.slug like 'uxlp-%';

-- ---------------------------------------------------------------- list-04 / list-05

select pg_temp.check((pg_temp.listing('uxlp-particular')).content_changed_at is null, 'a new listing has no content change');

-- Caller-written history is ignored.
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set previous_price_pen = 5000, price_dropped_at = now() where slug = 'uxlp-particular';
select set_config('app.allow_listing_admin_fields', '', true);
select pg_temp.check((pg_temp.listing('uxlp-particular')).previous_price_pen is null, 'the drop columns cannot be written directly');

-- A first price that has been in effect (never changed) and a drop of 10%: shown.
select pg_temp.set_price('uxlp-particular', 900);
select pg_temp.check((pg_temp.listing('uxlp-particular')).previous_price_pen = 1000, 'a 10% drop shows "Antes 1000"');
select pg_temp.check((pg_temp.listing('uxlp-particular')).price_dropped_at is not null, 'the drop is dated');
select pg_temp.check((pg_temp.listing('uxlp-particular')).content_changed_at is not null, 'a price change counts as a content change');

-- A second drop within 30 days keeps the original "Antes".
select pg_temp.set_price('uxlp-particular', 800);
select pg_temp.check((pg_temp.listing('uxlp-particular')).previous_price_pen = 1000, 'a second drop keeps the first "Antes"');

-- An increase clears it.
select pg_temp.set_price('uxlp-particular', 1200);
select pg_temp.check((pg_temp.listing('uxlp-particular')).previous_price_pen is null, 'an increase clears the drop');

-- Inflate then drop the next day: the raised price wasn't in effect 7 days, nothing shows.
select pg_temp.set_price('uxlp-particular', 1100);
select pg_temp.check((pg_temp.listing('uxlp-particular')).previous_price_pen is null, 'a drop from a price set a moment ago shows nothing');

-- After 7 days at 1100, a 3% drop is too small; a 10% drop shows.
select pg_temp.set_price('uxlp-particular', 1067, 8);
select pg_temp.check((pg_temp.listing('uxlp-particular')).previous_price_pen is null, 'a drop under 5% shows nothing');
select pg_temp.set_price('uxlp-particular', 1500, 8);
select pg_temp.set_price('uxlp-particular', 1350, 8);
select pg_temp.check((pg_temp.listing('uxlp-particular')).previous_price_pen = 1500, 'a 10% drop from a week-old price shows');

-- A listing that was not approved shows no drop.
select pg_temp.set_price('uxlp-pending', 200);
select pg_temp.check((pg_temp.listing('uxlp-pending')).previous_price_pen is null, 'a pending listing never shows a drop');

-- A view count bump is not a content change.
update public.listings set content_changed_at = null where false;
select set_config('app.allow_listing_admin_fields', 'true', true);
alter table public.listings disable trigger listings_track_content_change;
update public.listings set content_changed_at = null where slug = 'uxlp-store';
alter table public.listings enable trigger listings_track_content_change;
update public.listings set view_count = coalesce(view_count, 0) + 1 where slug = 'uxlp-store';
select set_config('app.allow_listing_admin_fields', '', true);
select pg_temp.check((pg_temp.listing('uxlp-store')).content_changed_at is null, 'a view is not a content change');

-- ---------------------------------------------------------------- list-10 / trust-03

insert into public.admin_audit_actions (admin_user_id, action, target_type, target_id, created_at)
values ('e1030000-0000-4000-8000-000000000099', 'store_verified', 'store', 'e1031000-0000-4000-8000-000000000001', '2026-08-01T12:00:00Z');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
create temp table facts_particular as select public.get_public_seller_facts('e1032000-0000-4000-8000-000000000001') as f;
create temp table facts_store as select public.get_public_seller_facts('e1032000-0000-4000-8000-000000000002') as f;
create temp table facts_pending as select public.get_public_seller_facts('e1032000-0000-4000-8000-000000000003') as f;
reset role;

select pg_temp.check((select f->>'last_active' from facts_particular) = 'today', 'signed in two hours ago reads today');
select pg_temp.check((select (f->>'verified_sales')::int from facts_particular) = 0, 'no verified sales yet');
select pg_temp.check((select (f->>'email_confirmed')::boolean from facts_particular), 'the e-mail is confirmed');
select pg_temp.check((select f->'store' from facts_particular) is null, 'a Particular has no store facts');
select pg_temp.check((select f->>'last_active' from facts_store) = 'week', 'signed in three days ago reads this week');
select pg_temp.check((select f #>> '{store,ruc}' from facts_store) = '20999993001', 'a verified store shows its RUC');
select pg_temp.check((select f #>> '{store,address}' from facts_store) = 'Av. Larco 100', 'a verified store shows its address');
select pg_temp.check((select (f #>> '{store,verified_since}')::timestamptz from facts_store) = '2026-08-01T12:00:00Z', 'verified since the Admin verification');
select pg_temp.check((select f from facts_pending) is null, 'a non-public listing reveals nothing');
select pg_temp.check(not (select f ? 'last_sign_in_at' from facts_particular), 'no raw sign-in time');

-- ---------------------------------------------------------------- list-06

set local role anon;
select pg_temp.check((public.get_public_review_page('e1030000-0000-4000-8000-000000000001', null, 0, 20)->>'review_count')::int = 0, 'review page answers for a seller without reviews');
select pg_temp.check((public.get_public_review_page('e1030000-0000-4000-8000-000000000001', null, 0, 20)->'breakdown'->>'5')::int = 0, 'the breakdown has every star');
reset role;
select pg_temp.expect_error($$select public.get_public_review_page(null, null, 0, 20)$$, 'REPUTATION_TARGET_INVALID');
select pg_temp.expect_error($$select public.get_public_review_page('e1030000-0000-4000-8000-000000000001', null, 0, 51)$$, 'REPUTATION_TARGET_INVALID');

-- ---------------------------------------------------------------- list-11

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1030000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select pg_temp.check(public.set_listing_stock_watch('e1032000-0000-4000-8000-000000000002', true), 'a buyer asks to hear when it is back');
select pg_temp.check(public.set_listing_stock_watch('e1032000-0000-4000-8000-000000000002', true), 'asking twice is harmless');
select pg_temp.check(public.get_listing_stock_watch('e1032000-0000-4000-8000-000000000002'), 'the buyer sees their own request');
select pg_temp.check((select count(*) from public.listing_stock_watches) = 1, 'the buyer reads only their own row');
select pg_temp.expect_error($$select public.set_listing_stock_watch('e1032000-0000-4000-8000-000000000001', true)$$, 'STOCK_WATCH_UNAVAILABLE');
select set_config('request.jwt.claims', '{"sub":"e1030000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select pg_temp.expect_error($$select public.set_listing_stock_watch('e1032000-0000-4000-8000-000000000002', true)$$, 'STOCK_WATCH_OWN_LISTING');
select pg_temp.check((select count(*) from public.listing_stock_watches) = 0, 'the owner cannot read the buyer''s request');
reset role;
set local role anon;
select pg_temp.expect_error($$select public.set_listing_stock_watch('e1032000-0000-4000-8000-000000000002', true)$$, 'permission denied');
reset role;

-- Restock: one notification, one e-mail, and the watch ends.
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set stock_state = 'in_stock' where slug = 'uxlp-store';
select set_config('app.allow_listing_admin_fields', '', true);
select pg_temp.check((select count(*) from public.notifications where user_id = 'e1030000-0000-4000-8000-000000000003' and event_type = 'listing_back_in_stock') = 1, 'the buyer is notified once');
select pg_temp.check((select count(*) from laria_private.marketplace_email_deliveries where recipient_user_id = 'e1030000-0000-4000-8000-000000000003' and event_type = 'listing_back_in_stock') = 1, 'one e-mail is queued');
select pg_temp.check(not exists (select 1 from public.listing_stock_watches where listing_id = 'e1032000-0000-4000-8000-000000000002'), 'the watch ends after the notice');

-- Selling out and restocking again sends nothing more.
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set stock_state = 'out_of_stock' where slug = 'uxlp-store';
update public.listings set stock_state = 'in_stock' where slug = 'uxlp-store';
select set_config('app.allow_listing_admin_fields', '', true);
select pg_temp.check((select count(*) from public.notifications where event_type = 'listing_back_in_stock' and listing_id = 'e1032000-0000-4000-8000-000000000002') = 1, 'no standing subscription');

rollback;
