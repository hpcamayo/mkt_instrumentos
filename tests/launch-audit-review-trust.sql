-- Launch audit A17 (supabase/migrations/20261114150000_launch_audit_review_trust.sql): the seller card counts each
-- buyer once, after their account is a week old with a confirmed e-mail; a buyer's review waits for Admin when it is
-- one of the seller's first three, comes from a new or unconfirmed account, repeats a buyer, or shares a browser or a
-- phone with the seller. Local/test database only. Every fixture is rolled back.
begin;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;

create function pg_temp.as_user(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.as_admin(p_aal text default 'aal2') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'a1700000-0000-4000-8000-000000000099',
    'role', 'authenticated', 'aal', p_aal, 'app_metadata', json_build_object('role', 'admin'))::text, true);
$$;

-- The buyer's review of a sale (the RPC as the buyer), and its row.
create function pg_temp.buyer_review(p_sale text, p_rating integer) returns uuid language plpgsql as $$
declare
  sale public.verified_transactions;
  review_uuid uuid;
begin
  select * into sale from public.verified_transactions where id = p_sale::uuid;
  perform pg_temp.as_user(sale.buyer_user_id::text);
  set local role authenticated;
  review_uuid := public.submit_transaction_review(sale.id, p_rating, 'Reseña de prueba A17.');
  reset role;
  return review_uuid;
end $$;

create function pg_temp.reasons(p_review uuid) returns text[] language sql as $$
  select reasons from laria_private.review_holds where review_id = p_review;
$$;

grant execute on function pg_temp.check(boolean, text) to authenticated;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, raw_app_meta_data, raw_user_meta_data)
values
  ('a1700000-0000-4000-8000-000000000001','authenticated','authenticated','a17-seller@example.invalid',crypt('qa-password',gen_salt('bf')),now() - interval '60 days',now() - interval '60 days','{}','{"account_type":"seller","full_name":"Vendedora A17","phone":"51911170001","city":"Lima","region":"Lima"}'),
  ('a1700000-0000-4000-8000-000000000002','authenticated','authenticated','a17-b1@example.invalid',crypt('qa-password',gen_salt('bf')),now() - interval '30 days',now() - interval '30 days','{}','{"account_type":"seller","full_name":"Comprador Uno","phone":"51911170002","city":"Lima","region":"Lima"}'),
  ('a1700000-0000-4000-8000-000000000003','authenticated','authenticated','a17-b2@example.invalid',crypt('qa-password',gen_salt('bf')),now() - interval '30 days',now() - interval '30 days','{}','{"account_type":"seller","full_name":"Comprador Dos","phone":"51911170003","city":"Lima","region":"Lima"}'),
  ('a1700000-0000-4000-8000-000000000004','authenticated','authenticated','a17-b3@example.invalid',crypt('qa-password',gen_salt('bf')),now() - interval '30 days',now() - interval '30 days','{}','{"account_type":"seller","full_name":"Comprador Tres","phone":"51911170004","city":"Lima","region":"Lima"}'),
  ('a1700000-0000-4000-8000-000000000005','authenticated','authenticated','a17-b4@example.invalid',crypt('qa-password',gen_salt('bf')),now() - interval '30 days',now() - interval '30 days','{}','{"account_type":"seller","full_name":"Comprador Cuatro","phone":"51911170005","city":"Lima","region":"Lima"}'),
  -- A two-day-old account.
  ('a1700000-0000-4000-8000-000000000006','authenticated','authenticated','a17-new@example.invalid',crypt('qa-password',gen_salt('bf')),now() - interval '2 days',now() - interval '2 days','{}','{"account_type":"seller","full_name":"Compradora Nueva","phone":"51911170006","city":"Lima","region":"Lima"}'),
  -- An e-mail never confirmed.
  ('a1700000-0000-4000-8000-000000000007','authenticated','authenticated','a17-unconfirmed@example.invalid',crypt('qa-password',gen_salt('bf')),null,now() - interval '30 days','{}','{"account_type":"seller","full_name":"Comprador Sin Confirmar","phone":"51911170007","city":"Lima","region":"Lima"}'),
  -- The seller's own number, written another way.
  ('a1700000-0000-4000-8000-000000000008','authenticated','authenticated','a17-phone@example.invalid',crypt('qa-password',gen_salt('bf')),now() - interval '30 days',now() - interval '30 days','{}','{"account_type":"seller","full_name":"Comprador Teléfono","phone":"+51 911-170-001","city":"Lima","region":"Lima"}'),
  -- Shares a browser with the store's staff.
  ('a1700000-0000-4000-8000-000000000009','authenticated','authenticated','a17-browser@example.invalid',crypt('qa-password',gen_salt('bf')),now() - interval '30 days',now() - interval '30 days','{}','{"account_type":"seller","full_name":"Compradora Navegador","phone":"51911170009","city":"Lima","region":"Lima"}'),
  ('a1700000-0000-4000-8000-000000000010','authenticated','authenticated','a17-store-owner@example.invalid',crypt('qa-password',gen_salt('bf')),now() - interval '60 days',now() - interval '60 days','{}','{"account_type":"store_owner","full_name":"Dueño Tienda A17","phone":"51911170010","city":"Lima","region":"Lima"}'),
  ('a1700000-0000-4000-8000-000000000011','authenticated','authenticated','a17-store-staff@example.invalid',crypt('qa-password',gen_salt('bf')),now() - interval '60 days',now() - interval '60 days','{}','{"account_type":"seller","full_name":"Personal Tienda A17","phone":"51911170011","city":"Lima","region":"Lima"}'),
  ('a1700000-0000-4000-8000-000000000099','authenticated','authenticated','a17-admin@example.invalid',crypt('qa-password',gen_salt('bf')),now() - interval '60 days',now() - interval '60 days','{"role":"admin"}','{"account_type":"seller","full_name":"Admin A17","phone":"51911170099","city":"Lima","region":"Lima"}');

-- Rows as the database holds them, without the publication triggers: the Particular's eight sold listings and the
-- store's two, each confirmed by its buyer just now.
set local session_replication_role = replica;
insert into public.stores (id, name, slug, status, is_verified, whatsapp_phone, city, region, owner_user_id)
values ('a1710000-0000-4000-8000-000000000001', 'Tienda A17', 'a17-tienda', 'active', true, '51911170010', 'Lima', 'Lima',
  'a1700000-0000-4000-8000-000000000010');
insert into public.store_members (store_id, user_id, role)
values ('a1710000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000010', 'owner'),
  ('a1710000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000011', 'staff');

insert into public.listings (id, store_id, owner_user_id, seller_type, status, title, slug, description, category,
  instrument_type, brand, model, condition, price_pen, city, region, contact_name, whatsapp_phone, published_at, sold_at)
select ('a1720000-0000-4000-8000-00000000000' || n)::uuid, null, 'a1700000-0000-4000-8000-000000000001', 'individual',
  'sold', 'Guitarra A17 ' || n, 'a17-venta-' || n, 'Guitarra de prueba para las reglas de reseñas.', 'guitars',
  'electric_guitar', 'QA', 'A17', 'Usado - buen estado', 1000, 'Lima', 'Lima', 'Vendedora A17', '51911170001',
  now() - interval '5 days', now() - interval '1 day'
from generate_series(1, 8) n;
insert into public.listings (id, store_id, owner_user_id, seller_type, status, title, slug, description, category,
  instrument_type, brand, model, condition, price_pen, city, region, contact_name, whatsapp_phone, published_at, sold_at)
select ('a1720000-0000-4000-8000-00000000010' || n)::uuid, 'a1710000-0000-4000-8000-000000000001',
  'a1700000-0000-4000-8000-000000000010', 'store', 'sold', 'Bajo A17 ' || n, 'a17-tienda-venta-' || n,
  'Bajo de prueba para las reglas de reseñas.', 'basses', 'electric_bass', 'QA', 'A17', 'Nuevo', 1500, 'Lima', 'Lima',
  'Tienda A17', '51911170010', now() - interval '5 days', now() - interval '1 day'
from generate_series(1, 2) n;

-- sale n: listing, buyer.
create temporary table a17_sales (n integer primary key, listing_id uuid, buyer_id uuid, sale_id uuid) on commit drop;
grant select on a17_sales to authenticated;
insert into a17_sales (n, listing_id, buyer_id, sale_id) values
  (1, 'a1720000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000002', 'a1740000-0000-4000-8000-000000000001'),
  (2, 'a1720000-0000-4000-8000-000000000002', 'a1700000-0000-4000-8000-000000000003', 'a1740000-0000-4000-8000-000000000002'),
  (3, 'a1720000-0000-4000-8000-000000000003', 'a1700000-0000-4000-8000-000000000004', 'a1740000-0000-4000-8000-000000000003'),
  (4, 'a1720000-0000-4000-8000-000000000004', 'a1700000-0000-4000-8000-000000000005', 'a1740000-0000-4000-8000-000000000004'),
  (5, 'a1720000-0000-4000-8000-000000000005', 'a1700000-0000-4000-8000-000000000006', 'a1740000-0000-4000-8000-000000000005'),
  (6, 'a1720000-0000-4000-8000-000000000006', 'a1700000-0000-4000-8000-000000000007', 'a1740000-0000-4000-8000-000000000006'),
  (7, 'a1720000-0000-4000-8000-000000000007', 'a1700000-0000-4000-8000-000000000002', 'a1740000-0000-4000-8000-000000000007'),
  (8, 'a1720000-0000-4000-8000-000000000008', 'a1700000-0000-4000-8000-000000000008', 'a1740000-0000-4000-8000-000000000008'),
  (101, 'a1720000-0000-4000-8000-000000000101', 'a1700000-0000-4000-8000-000000000003', 'a1740000-0000-4000-8000-000000000101'),
  (102, 'a1720000-0000-4000-8000-000000000102', 'a1700000-0000-4000-8000-000000000009', 'a1740000-0000-4000-8000-000000000102');

insert into public.transaction_claims (id, listing_id, seller_user_id, store_id, buyer_user_id, attribution_type, status, responded_at)
select s.sale_id, s.listing_id, l.owner_user_id, l.store_id, s.buyer_id, 'laria', 'confirmed', now()
from a17_sales s join public.listings l on l.id = s.listing_id;
insert into public.verified_transactions (id, claim_id, listing_id, seller_user_id, store_id, buyer_user_id,
  seller_identity_type, sold_at, verified_at, review_deadline)
select s.sale_id, s.sale_id, s.listing_id, l.owner_user_id, l.store_id, s.buyer_id,
  case when l.store_id is null then 'particular' else 'store' end, l.sold_at, now(), now() + interval '10 days'
from a17_sales s join public.listings l on l.id = s.listing_id;

-- The browser-session cookie each signed-in event carries. The buyer of sale 102 and the store's staff used one
-- browser; everyone else has their own.
insert into public.marketplace_events (event_type, listing_id, store_id, actor_user_id, session_id, source)
values
  ('listing_view', 'a1720000-0000-4000-8000-000000000102', 'a1710000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000009', 'a1750000-0000-4000-8000-000000000001', 'detail'),
  ('search', null, null, 'a1700000-0000-4000-8000-000000000011', 'a1750000-0000-4000-8000-000000000001', 'catalog'),
  ('listing_view', 'a1720000-0000-4000-8000-000000000001', null, 'a1700000-0000-4000-8000-000000000002', 'a1750000-0000-4000-8000-000000000002', 'detail'),
  ('search', null, null, 'a1700000-0000-4000-8000-000000000001', 'a1750000-0000-4000-8000-000000000003', 'catalog'),
  ('search', null, null, 'a1700000-0000-4000-8000-000000000010', 'a1750000-0000-4000-8000-000000000004', 'catalog');
set local session_replication_role = origin;

-- ------------------------------------------------------------------------------------------- who may call what

select pg_temp.check(not has_function_privilege('authenticated', 'laria_private.counted_buyers(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'laria_private.review_hold_reasons(uuid)', 'execute'),
  'the rules run only inside the database');
select pg_temp.check(not has_table_privilege('authenticated', 'laria_private.review_holds', 'select')
  and (select relrowsecurity from pg_class where oid = 'laria_private.review_holds'::regclass), 'the reasons are private');
select pg_temp.check(not has_function_privilege('anon', 'public.publish_held_review(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.publish_held_review(uuid)', 'execute'),
  'publishing is for signed-in Admin');

-- --------------------------------------------------------------------------------------------- the seller card

-- Eight confirmed sales of the Particular: buyer one twice, a new account, an unconfirmed e-mail. Five buyers count.
select pg_temp.check(laria_private.counted_buyers('a1700000-0000-4000-8000-000000000001', null) = 5,
  'each buyer once, only week-old confirmed accounts');
set local role anon;
select pg_temp.check((public.get_public_seller_facts('a1720000-0000-4000-8000-000000000001') ->> 'verified_sales')::integer = 5,
  'the seller card shows the buyers');
select pg_temp.check((public.get_public_seller_facts('a1720000-0000-4000-8000-000000000101') ->> 'verified_sales')::integer = 2,
  'a store''s buyers');
reset role;
select pg_temp.check(laria_private.counted_buyers('a1700000-0000-4000-8000-000000000010', null) = 0,
  'the store''s sales are not its owner''s');

-- ----------------------------------------------------------------------------------------------- the holds

-- Sale 1: the seller's first review from a buyer waits for Admin, and shows nowhere.
create temporary table a17_reviews (n integer primary key, review_id uuid) on commit drop;
grant select on a17_reviews to authenticated;
insert into a17_reviews values (1, pg_temp.buyer_review('a1740000-0000-4000-8000-000000000001', 5));
select pg_temp.check((select held_at is not null from public.transaction_reviews where id = (select review_id from a17_reviews where n = 1)),
  'the first review is held');
select pg_temp.check(pg_temp.reasons((select review_id from a17_reviews where n = 1)) = array['first_reviews'],
  'held as one of the first three');
select pg_temp.check(not laria_private.review_is_visible((select review_id from a17_reviews where n = 1)), 'a held review is not shown');

-- The buyer sees that it waits; the seller sees nothing yet, as before the seller reviews.
select pg_temp.as_user('a1700000-0000-4000-8000-000000000002');
set local role authenticated;
select pg_temp.check((public.get_transaction_detail('a1740000-0000-4000-8000-000000000001') #>> '{own_review,held_at}') is not null,
  'the buyer is told their review waits for Laria');
reset role;
select pg_temp.as_user('a1700000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.check((public.get_transaction_detail('a1740000-0000-4000-8000-000000000001') ->> 'counterpart_review_held')::boolean = false,
  'the seller learns nothing before reviewing');
-- The seller reviews the buyer: never held. Reviews show by the usual rule, the held one excepted.
select pg_temp.check(public.submit_transaction_review('a1740000-0000-4000-8000-000000000001', 4, 'Buen comprador.') is not null,
  'the seller reviews the buyer');
select pg_temp.check((public.get_transaction_detail('a1740000-0000-4000-8000-000000000001') ->> 'counterpart_review_held')::boolean,
  'the seller is told the buyer''s review waits for Laria');
select pg_temp.check(jsonb_array_length(public.get_transaction_detail('a1740000-0000-4000-8000-000000000001') -> 'visible_reviews') = 1,
  'only the seller''s review shows');
reset role;
select pg_temp.check((select held_at is null from public.transaction_reviews
  where transaction_id = 'a1740000-0000-4000-8000-000000000001' and direction = 'seller_to_buyer'), 'a seller''s review is not held');
select pg_temp.check(not exists (select 1 from public.notifications
  where transaction_id = 'a1740000-0000-4000-8000-000000000001' and event_type = 'review_revealed'),
  '"Ambas reseñas" waits for the held review');
select pg_temp.check((public.get_public_reputation('a1700000-0000-4000-8000-000000000001', null, 5) ->> 'review_count')::integer = 0,
  'a held review does not count');

-- A held review cannot be reported.
select pg_temp.as_user('a1700000-0000-4000-8000-000000000005');
set local role authenticated;
do $$
begin
  begin
    perform public.report_review((select review_id from a17_reviews where n = 1), 'spam', null);
    raise exception 'FAILED: a held review was reported';
  exception when others then
    if sqlerrm <> 'REPORT_TARGET_UNAVAILABLE' then raise; end if;
  end;
end $$;
reset role;

-- Admin's Reseñas queue lists it with its reasons and the reviewer's account.
select pg_temp.as_admin();
set local role authenticated;
do $$
declare
  page jsonb;
  item jsonb;
begin
  page := public.get_admin_moderation_queue('resenas', 1, 25);
  select value into item from jsonb_array_elements(page -> 'items')
  where value ->> 'id' = (select review_id::text from a17_reviews where n = 1);
  perform pg_temp.check(item is not null, 'the held review is in the Reseñas queue');
  perform pg_temp.check(item -> 'hold_reasons' = '["first_reviews"]'::jsonb and item ->> 'held_at' is not null, 'with its reasons');
  perform pg_temp.check(item ->> 'reviewer_name' = 'Comprador Uno' and item ->> 'reviewed_name' = 'Vendedora A17'
    and (item ->> 'reviewer_email_confirmed')::boolean and item ->> 'reviewer_since' is not null
    and item ->> 'listing_title' = 'Guitarra A17 1', 'with who reviewed whom, and the reviewer''s account');
  perform pg_temp.check((page -> 'counts' ->> 'resenas')::integer = (page ->> 'total')::integer
    and (page ->> 'total')::integer >= 1, 'the count matches the queue');
end $$;
reset role;

-- Publishing: Admin with the second sign-in step only.
select pg_temp.as_user('a1700000-0000-4000-8000-000000000001');
set local role authenticated;
do $$
begin
  begin
    perform public.publish_held_review((select review_id from a17_reviews where n = 1));
    raise exception 'FAILED: the seller published their own review';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select pg_temp.as_admin('aal1');
set local role authenticated;
do $$
begin
  begin
    perform public.publish_held_review((select review_id from a17_reviews where n = 1));
    raise exception 'FAILED: Admin without the second step published a review';
  exception when insufficient_privilege then
    if sqlerrm <> 'ADMIN_MFA_REQUIRED' then raise; end if;
  end;
end $$;
reset role;
select pg_temp.as_admin();
set local role authenticated;
do $$
begin
  begin
    perform public.publish_held_review('a17ffff0-0000-4000-8000-000000000000');
    raise exception 'FAILED: an unknown review was published';
  exception when others then
    if sqlerrm <> 'REVIEW_NOT_FOUND' then raise; end if;
  end;
end $$;
select pg_temp.check(public.publish_held_review((select review_id from a17_reviews where n = 1)), 'Admin publishes');
select pg_temp.check(public.publish_held_review((select review_id from a17_reviews where n = 1)), 'publishing again changes nothing');
reset role;
select pg_temp.check(laria_private.review_is_visible((select review_id from a17_reviews where n = 1)), 'a published review shows');
select pg_temp.check(pg_temp.reasons((select review_id from a17_reviews where n = 1)) is null, 'its hold is gone');
select pg_temp.check((select count(*) from public.admin_audit_actions where target_type = 'review'
  and target_id = (select review_id from a17_reviews where n = 1) and action = 'review_published'
  and detail -> 'reasons' = '["first_reviews"]'::jsonb) = 1, 'recorded once in Admin''s audit, with its reasons');
select pg_temp.check((select count(*) from public.notifications
  where transaction_id = 'a1740000-0000-4000-8000-000000000001' and event_type = 'review_revealed') = 2,
  '"Ambas reseñas" goes to both once the review is published');
select pg_temp.check((public.get_public_reputation('a1700000-0000-4000-8000-000000000001', null, 5) ->> 'review_count')::integer = 1,
  'a published review counts');

-- Sales 2 and 3: still among the first three. Published, the seller has three.
insert into a17_reviews values (2, pg_temp.buyer_review('a1740000-0000-4000-8000-000000000002', 5));
insert into a17_reviews values (3, pg_temp.buyer_review('a1740000-0000-4000-8000-000000000003', 4));
select pg_temp.check(pg_temp.reasons((select review_id from a17_reviews where n = 2)) = array['first_reviews']
  and pg_temp.reasons((select review_id from a17_reviews where n = 3)) = array['first_reviews'], 'the second and third are held too');
select pg_temp.as_admin();
set local role authenticated;
select public.publish_held_review(review_id) from a17_reviews where n in (2, 3);
reset role;

-- Sale 4: a fourth buyer with nothing in common with the seller. Not held.
insert into a17_reviews values (4, pg_temp.buyer_review('a1740000-0000-4000-8000-000000000004', 5));
select pg_temp.check((select held_at is null from public.transaction_reviews where id = (select review_id from a17_reviews where n = 4))
  and pg_temp.reasons((select review_id from a17_reviews where n = 4)) is null, 'after three published reviews, no hold');

-- Sales 5 to 8: a new account, an unconfirmed e-mail, a buyer reviewing again, the seller's own number.
insert into a17_reviews values (5, pg_temp.buyer_review('a1740000-0000-4000-8000-000000000005', 5));
insert into a17_reviews values (6, pg_temp.buyer_review('a1740000-0000-4000-8000-000000000006', 5));
insert into a17_reviews values (7, pg_temp.buyer_review('a1740000-0000-4000-8000-000000000007', 5));
insert into a17_reviews values (8, pg_temp.buyer_review('a1740000-0000-4000-8000-000000000008', 5));
select pg_temp.check(pg_temp.reasons((select review_id from a17_reviews where n = 5)) = array['new_account'], 'a new account');
select pg_temp.check(pg_temp.reasons((select review_id from a17_reviews where n = 6)) = array['email_unconfirmed'], 'an unconfirmed e-mail');
select pg_temp.check(pg_temp.reasons((select review_id from a17_reviews where n = 7)) = array['repeat_buyer'], 'a buyer reviewing again');
select pg_temp.check(pg_temp.reasons((select review_id from a17_reviews where n = 8)) = array['same_phone'], 'the seller''s own number');

-- The review period ends: a held review still shows nowhere.
update public.verified_transactions set verified_at = now() - interval '10 days', review_deadline = now()
where id = 'a1740000-0000-4000-8000-000000000005';
select pg_temp.check(not laria_private.review_is_visible((select review_id from a17_reviews where n = 5)),
  'a held review stays hidden after the review period');

-- Hidden by Admin, a held review leaves the queue and cannot be published.
select pg_temp.as_admin();
set local role authenticated;
select public.moderate_review((select review_id from a17_reviews where n = 5), true, 'Cuenta creada para la venta');
do $$
begin
  perform pg_temp.check(not exists (select 1 from jsonb_array_elements(public.get_admin_moderation_queue('resenas', 1, 25) -> 'items')
    where value ->> 'id' = (select review_id::text from a17_reviews where n = 5)), 'a hidden review leaves the queue');
  begin
    perform public.publish_held_review((select review_id from a17_reviews where n = 5));
    raise exception 'FAILED: a hidden review was published';
  exception when others then
    if sqlerrm <> 'REVIEW_HIDDEN' then raise; end if;
  end;
end $$;
reset role;

-- Sales 101 and 102, the store's: its first review, and a buyer who shared a browser with the store's staff.
insert into a17_reviews values (101, pg_temp.buyer_review('a1740000-0000-4000-8000-000000000101', 5));
insert into a17_reviews values (102, pg_temp.buyer_review('a1740000-0000-4000-8000-000000000102', 5));
select pg_temp.check(pg_temp.reasons((select review_id from a17_reviews where n = 101)) = array['first_reviews'],
  'the store''s first review');
select pg_temp.check(pg_temp.reasons((select review_id from a17_reviews where n = 102)) = array['first_reviews', 'same_browser'],
  'a browser shared with the store''s staff');
select pg_temp.check((select subject_store_id = 'a1710000-0000-4000-8000-000000000001' from public.transaction_reviews
  where id = (select review_id from a17_reviews where n = 102)), 'a store''s review is the store''s');

-- The queue now holds the five held reviews still waiting (6, 7, 8, 101, 102) and nothing else of these sales.
select pg_temp.as_admin();
set local role authenticated;
select pg_temp.check((select count(*) from jsonb_array_elements(public.get_admin_moderation_queue('resenas', 1, 25) -> 'items') i
  where i.value ->> 'id' in (select review_id::text from a17_reviews)) = 5, 'the queue holds the reviews still waiting');
reset role;

select 'launch audit A17: buyers counted once, held reviews, Admin publishing' as result;
rollback;
