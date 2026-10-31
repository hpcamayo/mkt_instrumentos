-- Feature ideas, integration: the launch audit's page refresh record for the branch's tables
-- (supabase/migrations/20261210120300_feat_page_refresh.sql). A statement that changes what the cached listing page or
-- home shows leaves one row; one that changes nothing shown leaves none. Local/test database only. Every fixture is
-- rolled back.
begin;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;
-- The rows recorded since the last call, which it clears.
create function pg_temp.take() returns bigint language plpgsql security definer as $$
declare taken bigint;
begin
  delete from laria_private.public_page_changes;
  get diagnostics taken = row_count;
  return taken;
end $$;
grant execute on function pg_temp.check(boolean, text), pg_temp.take() to service_role;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e1500000-0000-4000-8000-000000000001','authenticated','authenticated','fpr-particular@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Particular","phone":"51999995001","city":"Lima","region":"Lima"}'),
 ('e1500000-0000-4000-8000-000000000002','authenticated','authenticated','fpr-owner@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueña","phone":"51999995002","city":"Lima","region":"Lima"}'),
 ('e1500000-0000-4000-8000-000000000003','authenticated','authenticated','fpr-buyer@example.invalid',now(),'{}','{"account_type":"buyer","full_name":"Compradora","phone":"51999995003","city":"Lima","region":"Lima"}');
select set_config('app.allow_store_admin_fields', 'true', true);
select set_config('app.allow_listing_admin_fields', 'true', true);
insert into public.stores (id, name, slug, whatsapp_phone, city, region, status, listing_plan, is_verified, ruc,
  owner_user_id, razon_social, email, address, contact_person)
values
 ('e1510000-0000-4000-8000-000000000001', 'Tienda Activa', 'fpr-activa', '987654331', 'Lima', 'Lima', 'active', 'free',
  true, '20100047231', 'e1500000-0000-4000-8000-000000000002', 'ACTIVA SAC', 'a@fpr.pe', 'Av Uno 123', 'Ana'),
 ('e1510000-0000-4000-8000-000000000002', 'Tienda en revisión', 'fpr-revision', '987654332', 'Lima', 'Lima', 'pending',
  'free', false, '20100047232', null, 'REVISION SAC', 'r@fpr.pe', 'Av Dos 456', 'Beto');
insert into public.listings (id, seller_type, store_id, status, title, slug, description, category, instrument_type,
  brand, model, condition, price_pen, city, region, contact_name, whatsapp_phone, owner_user_id,
  marketplace_rules_accepted_at)
select f.id::uuid, f.seller_type::public.seller_type, f.store_id::uuid, f.status::public.listing_status, f.title, f.slug,
  repeat('Descripción larga de prueba ', 3), 'guitars', 'electric_guitar', 'Fender', 'Strat', 'Muy bueno', 1500,
  'Lima', 'Lima', 'Ana', '51987654321', f.owner::uuid, now()
from (values
  ('e1520000-0000-4000-8000-000000000001', 'store', 'e1510000-0000-4000-8000-000000000001', 'approved', 'Guitarra de tienda', 'fpr-tienda', 'e1500000-0000-4000-8000-000000000002'),
  ('e1520000-0000-4000-8000-000000000002', 'store', 'e1510000-0000-4000-8000-000000000001', 'approved', 'Correa de tienda', 'fpr-correa', 'e1500000-0000-4000-8000-000000000002'),
  ('e1520000-0000-4000-8000-000000000003', 'individual', null, 'approved', 'Guitarra pública', 'fpr-publica', 'e1500000-0000-4000-8000-000000000001'),
  ('e1520000-0000-4000-8000-000000000004', 'individual', null, 'hidden', 'Guitarra oculta', 'fpr-oculta', 'e1500000-0000-4000-8000-000000000001')
) as f(id, seller_type, store_id, status, title, slug, owner);
select pg_temp.take();

-- disc-04, disc-05: the maker and artist marks.
insert into public.listing_maker_details (listing_id, handmade) values ('e1520000-0000-4000-8000-000000000001', true);
select pg_temp.check(pg_temp.take() = 1, 'a shown listing''s maker details are recorded');
insert into public.listing_maker_details (listing_id, handmade) values ('e1520000-0000-4000-8000-000000000004', true);
select pg_temp.check(pg_temp.take() = 0, 'a hidden listing''s leave nothing');
update public.listing_maker_details set updated_at = now() + interval '1 minute';
select pg_temp.check(pg_temp.take() = 0, 'a new updated_at alone leaves nothing');
update public.listing_maker_details set made_to_order_weeks = 4 where listing_id = 'e1520000-0000-4000-8000-000000000001';
select pg_temp.check(pg_temp.take() = 1, '«Por encargo» is recorded');
delete from public.listing_maker_details;
select pg_temp.check(pg_temp.take() = 1, 'removing them is recorded, once for the statement');

insert into public.store_maker_profiles (store_id, kind, craft_city)
values ('e1510000-0000-4000-8000-000000000001', 'taller', 'Ayacucho'), ('e1510000-0000-4000-8000-000000000002', 'taller', 'Cusco');
select pg_temp.check(pg_temp.take() = 1, 'an active store''s workshop is recorded');
update public.store_maker_profiles set story = repeat('Hacemos charangos a mano desde hace años. ', 2), since_year = 1990;
select pg_temp.check(pg_temp.take() = 0, 'the story and year, which only the store page shows, leave nothing');
update public.store_maker_profiles set craft_city = 'Lima' where store_id = 'e1510000-0000-4000-8000-000000000002';
select pg_temp.check(pg_temp.take() = 0, 'a store under review leaves nothing');
update public.store_maker_profiles set hidden_at = now(), hidden_reason = 'No es un taller', hidden_by = 'e1500000-0000-4000-8000-000000000002'
where store_id = 'e1510000-0000-4000-8000-000000000001';
select pg_temp.check(pg_temp.take() = 1, 'Admin hiding the mark is recorded');

insert into public.artist_profiles (user_id, slug, display_name, verified_by)
values ('e1500000-0000-4000-8000-000000000001', 'fpr-artista', 'La Artista', 'e1500000-0000-4000-8000-000000000002');
select pg_temp.check(pg_temp.take() = 1, 'an artist is recorded');
update public.artist_profiles set story = repeat('Toca en la Orquesta Sinfónica Nacional. ', 2), link_url = 'https://example.invalid/a';
select pg_temp.check(pg_temp.take() = 0, 'the story and link, which only the artist page shows, leave nothing');
update public.artist_profiles set revoked_at = now();
select pg_temp.check(pg_temp.take() = 1, 'revoking the artist is recorded');
update public.artist_profiles set display_name = 'Otra';
select pg_temp.check(pg_temp.take() = 0, 'a revoked artist leaves nothing');

-- run-02: "Disponible en". A location shows while it holds the listing's item.
insert into public.store_inventory_items (id, store_id, merchant_sku, sku_normalized, listing_id, product_name, quantity_on_hand)
values ('e1530000-0000-4000-8000-000000000001', 'e1510000-0000-4000-8000-000000000001', 'FPR-001', 'FPR-001',
  'e1520000-0000-4000-8000-000000000001', 'Guitarra de tienda', 5);
insert into public.store_locations (id, store_id, name, region, city, district, address, is_primary, position)
values
 ('e1540000-0000-4000-8000-000000000001', 'e1510000-0000-4000-8000-000000000001', 'Miraflores', 'Lima', 'Lima', 'Miraflores', 'Av. Larco 123', true, 0),
 ('e1540000-0000-4000-8000-000000000002', 'e1510000-0000-4000-8000-000000000001', 'Centro', 'Lima', 'Lima', 'Cercado', 'Jr. Unión 456', false, 1);
select pg_temp.take();
update public.store_locations set address = 'Av. Larco 125' where id = 'e1540000-0000-4000-8000-000000000001';
select pg_temp.check(pg_temp.take() = 0, 'a street address the store doesn''t show leaves nothing');
update public.store_locations set show_address = true where id = 'e1540000-0000-4000-8000-000000000001';
select pg_temp.check(pg_temp.take() = 1, 'showing it is recorded');
update public.store_locations set opening_hours = 'Lun a sáb 10 a 20' where id = 'e1540000-0000-4000-8000-000000000002';
select pg_temp.check(pg_temp.take() = 1, 'new opening hours are recorded');
insert into public.store_location_stock (location_id, item_id, store_id, quantity_on_hand)
values ('e1540000-0000-4000-8000-000000000001', 'e1530000-0000-4000-8000-000000000001', 'e1510000-0000-4000-8000-000000000001', 5),
       ('e1540000-0000-4000-8000-000000000002', 'e1530000-0000-4000-8000-000000000001', 'e1510000-0000-4000-8000-000000000001', 0);
select pg_temp.check(pg_temp.take() = 1, 'stock at a location is recorded');
update public.store_location_stock
set quantity_on_hand = quantity_on_hand + case when location_id = 'e1540000-0000-4000-8000-000000000002' then 2 else -2 end;
select pg_temp.check(pg_temp.take() = 1, 'a transfer that fills an empty location is recorded');
update public.store_location_stock
set quantity_on_hand = quantity_on_hand + case when location_id = 'e1540000-0000-4000-8000-000000000002' then 1 else -1 end;
select pg_temp.check(pg_temp.take() = 0, 'a transfer between two locations that keep units leaves nothing');
update public.store_location_stock set updated_at = now() + interval '1 minute';
select pg_temp.check(pg_temp.take() = 0, 'a new updated_at alone leaves nothing');

-- sell-08, sell-09, safe-03, safe-11: the seller's level, page, safe spot and the listing's history.
insert into public.seller_levels (subject_user_id, facts) values ('e1500000-0000-4000-8000-000000000001', '{"sales": 1}');
select pg_temp.check(pg_temp.take() = 0, 'a seller not yet «Vendedor destacado» leaves nothing');
update public.seller_levels set qualified_since = now() - interval '1 day', computed_at = now();
select pg_temp.check(pg_temp.take() = 1, 'earning the mark is recorded');
update public.seller_levels set computed_at = now() + interval '1 day', facts = '{"sales": 9}';
select pg_temp.check(pg_temp.take() = 0, 'the daily job''s recount leaves nothing');
update public.seller_levels set qualified_since = null;
select pg_temp.check(pg_temp.take() = 1, 'losing the mark is recorded');

-- The Particular's first listing made the page (laria_private.seller_page_on_listing).
select pg_temp.check(exists (select 1 from public.seller_pages where user_id = 'e1500000-0000-4000-8000-000000000001'),
  'the seller page exists');
update public.seller_pages set slug = 'fpr-particular';
select pg_temp.check(pg_temp.take() = 1, 'a new address is recorded');
update public.seller_pages set updated_at = now() + interval '1 minute';
select pg_temp.check(pg_temp.take() = 0, 'a new updated_at alone leaves nothing');
update public.seller_pages set hidden = true;
select pg_temp.check(pg_temp.take() = 1, 'hiding it is recorded');
-- A page is made with its owner's first approved listing, which records itself: one row for both.
insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e1500000-0000-4000-8000-000000000004','authenticated','authenticated','fpr-new@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Nueva","phone":"51999995004","city":"Lima","region":"Lima"}');
insert into public.listings (id, seller_type, status, title, slug, description, category, instrument_type, brand, model,
  condition, price_pen, city, region, contact_name, whatsapp_phone, owner_user_id, marketplace_rules_accepted_at)
values ('e1520000-0000-4000-8000-000000000005', 'individual', 'approved', 'Bajo nuevo', 'fpr-nuevo',
  repeat('Descripción larga de prueba ', 3), 'basses', 'electric_bass', 'Fender', 'Jazz', 'Muy bueno', 1500, 'Lima', 'Lima',
  'Nueva', '51999995004', 'e1500000-0000-4000-8000-000000000004', now());
select pg_temp.check(exists (select 1 from public.seller_pages where user_id = 'e1500000-0000-4000-8000-000000000004')
  and pg_temp.take() = 1, 'the first approved listing, which makes the page, is recorded once');
update public.listings set status = 'hidden' where id = 'e1520000-0000-4000-8000-000000000005';
select pg_temp.take();
update public.seller_pages set slug = 'fpr-nueva' where user_id = 'e1500000-0000-4000-8000-000000000004';
select pg_temp.check(pg_temp.take() = 0, 'a page linked from no shown listing leaves nothing');

insert into public.store_safe_spots (store_id, enabled, note, enabled_at)
values ('e1510000-0000-4000-8000-000000000001', true, 'En la tienda, de 10 a 18', now()),
       ('e1510000-0000-4000-8000-000000000002', true, 'En la tienda', now());
select pg_temp.check(pg_temp.take() = 1, 'an active store''s «Punto seguro» is recorded');
update public.store_safe_spots set updated_at = now() + interval '1 minute';
select pg_temp.check(pg_temp.take() = 0, 'a new updated_at alone leaves nothing');
update public.store_safe_spots set enabled = false, admin_disabled_at = now(),
  admin_disabled_by = 'e1500000-0000-4000-8000-000000000002', admin_disabled_reason = 'Dirección incorrecta'
where store_id = 'e1510000-0000-4000-8000-000000000001';
select pg_temp.check(pg_temp.take() = 1, 'Admin turning it off is recorded');

set local session_replication_role = replica;
insert into public.verified_transactions (id, claim_id, listing_id, seller_user_id, buyer_user_id, seller_identity_type,
  sold_at, verified_at, review_deadline)
values
 ('e1550000-0000-4000-8000-000000000001', gen_random_uuid(), 'e1520000-0000-4000-8000-000000000002',
  'e1500000-0000-4000-8000-000000000002', 'e1500000-0000-4000-8000-000000000001', 'particular', '2026-10-01', '2026-10-01', '2026-10-11'),
 ('e1550000-0000-4000-8000-000000000002', gen_random_uuid(), 'e1520000-0000-4000-8000-000000000001',
  'e1500000-0000-4000-8000-000000000002', 'e1500000-0000-4000-8000-000000000001', 'particular', '2026-10-01', '2026-10-01', '2026-10-11');
set local session_replication_role = origin;
insert into public.listing_provenance (listing_id, transaction_id, linked_by)
values ('e1520000-0000-4000-8000-000000000004', 'e1550000-0000-4000-8000-000000000001', 'e1500000-0000-4000-8000-000000000001');
select pg_temp.check(pg_temp.take() = 0, 'a hidden listing''s history leaves nothing');
insert into public.listing_provenance (listing_id, transaction_id, linked_by)
values ('e1520000-0000-4000-8000-000000000003', 'e1550000-0000-4000-8000-000000000002', 'e1500000-0000-4000-8000-000000000001');
select pg_temp.check(pg_temp.take() = 1, '«Historial en Laria» on a shown listing is recorded');

-- buy-07: whether the store takes try-outs, not how.
insert into public.store_tryout_settings (store_id, enabled) values ('e1510000-0000-4000-8000-000000000001', false);
select pg_temp.check(pg_temp.take() = 0, 'try-outs switched off leave nothing');
update public.store_tryout_settings set enabled = true, weekly_hours = '{"1": [["10:00", "13:00"]]}';
select pg_temp.check(pg_temp.take() = 1, 'taking try-outs is recorded');
update public.store_tryout_settings set note = 'Trae tus audífonos', capacity = 2;
select pg_temp.check(pg_temp.take() = 0, 'the booking details, read when the sheet opens, leave nothing');

-- buy-01: the combo and "Lo que suele acompañarlo".
insert into public.seller_bundle_offers (store_id, discount_percent) values ('e1510000-0000-4000-8000-000000000002', 10);
select pg_temp.check(pg_temp.take() = 0, 'a combo of a store under review leaves nothing');
insert into public.seller_bundle_offers (owner_user_id, discount_percent) values ('e1500000-0000-4000-8000-000000000001', 10);
select pg_temp.check(pg_temp.take() = 1, 'a Particular''s combo is recorded');
update public.seller_bundle_offers set updated_at = now() + interval '1 minute';
select pg_temp.check(pg_temp.take() = 0, 'a new updated_at alone leaves nothing');
insert into public.listing_companions (listing_id, companion_id) values ('e1520000-0000-4000-8000-000000000001', 'e1520000-0000-4000-8000-000000000002');
select pg_temp.check(pg_temp.take() = 1, 'a companion is recorded');
update public.listing_companions set sort_order = 1;
select pg_temp.check(pg_temp.take() = 1, 'a new order is recorded');
delete from public.listing_companions;
select pg_temp.check(pg_temp.take() = 1, 'removing it is recorded');

-- buy-09: the store's installments, while the payments pilot is on.
select laria_private.set_assisted_commerce_pilot(false, 'Prueba de páginas');
select pg_temp.take();
insert into public.store_installment_offers (store_id, max_installments, status, reviewed_by, reviewed_at)
values ('e1510000-0000-4000-8000-000000000001', 6, 'approved', 'e1500000-0000-4000-8000-000000000002', now());
select pg_temp.check(pg_temp.take() = 0, 'with the pilot off, installments leave nothing');
select laria_private.set_assisted_commerce_pilot(true, 'Prueba de páginas');
select pg_temp.check(pg_temp.take() = 1, 'switching the pilot on is recorded (main''s trigger)');
update public.store_installment_offers set max_installments = 12;
select pg_temp.check(pg_temp.take() = 1, 'with the pilot on, a new number of installments is recorded');
update public.store_installment_offers set owner_note = 'Con Visa y Mastercard', updated_at = now() + interval '1 minute';
select pg_temp.check(pg_temp.take() = 0, 'the owner''s note for Admin leaves nothing');
update public.store_installment_offers set status = 'pending_review', reviewed_by = null, reviewed_at = null, revision = 2;
select pg_temp.check(pg_temp.take() = 1, 'an offer sent back to review is recorded');
select laria_private.set_assisted_commerce_pilot(false, 'Prueba de páginas');
select pg_temp.take();

-- safe-06: approved review photos.
insert into public.transaction_reviews (id, transaction_id, direction, reviewer_user_id, subject_store_id, rating)
values ('e1560000-0000-4000-8000-000000000001', 'e1550000-0000-4000-8000-000000000002', 'buyer_to_seller',
  'e1500000-0000-4000-8000-000000000001', 'e1510000-0000-4000-8000-000000000001', 5);
select pg_temp.take();
insert into public.transaction_review_photos (id, review_id, storage_path, sort_order)
values ('e1570000-0000-4000-8000-000000000001', 'e1560000-0000-4000-8000-000000000001',
  'review-photos/e1560000-0000-4000-8000-000000000001/0.jpg', 0);
select pg_temp.check(pg_temp.take() = 0, 'a photo waiting for Admin leaves nothing');
update public.transaction_review_photos set status = 'approved', moderated_at = now(), moderated_by = 'e1500000-0000-4000-8000-000000000002';
select pg_temp.check(pg_temp.take() = 1, 'approving it is recorded');
update public.transaction_review_photos set moderation_reason = 'Foto clara';
select pg_temp.check(pg_temp.take() = 0, 'Admin''s note leaves nothing');
update public.transaction_review_photos set status = 'hidden', moderation_reason = 'Muestra datos personales';
select pg_temp.check(pg_temp.take() = 1, 'hiding it is recorded');
delete from public.transaction_review_photos;
select pg_temp.check(pg_temp.take() = 0, 'removing a hidden photo leaves nothing');

-- disc-03: the home's collections.
insert into public.collections (id, slug, title, intro, sets, published)
values ('e1580000-0000-4000-8000-000000000001', 'fpr-coleccion', 'Para empezar', 'Todo lo que necesitas para tu primera guitarra.',
  '[{"label":"Guitarras","query":"category=guitars"}]', false);
select pg_temp.check(pg_temp.take() = 0, 'a draft collection leaves nothing');
update public.collections set published = true;
select pg_temp.check(pg_temp.take() = 1, 'publishing it is recorded');
update public.collections set updated_at = now() + interval '1 minute';
select pg_temp.check(pg_temp.take() = 0, 'a new updated_at alone leaves nothing');
update public.collections set title = 'Para empezar a tocar';
select pg_temp.check(pg_temp.take() = 1, 'a new title is recorded');

-- With time alone: a published collection enters the home at midnight in Lima on its first day and leaves it at
-- midnight after its last (public.claim_public_page_changes looks since the previous look).
update public.collections set starts_on = (clock_timestamp() at time zone 'America/Lima')::date,
  ends_on = (clock_timestamp() at time zone 'America/Lima')::date + 3;
select pg_temp.take();
update laria_private.public_page_clock set checked_at = clock_timestamp() - interval '1 minute';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.check(public.claim_public_page_changes() is null, 'no first or last day since the previous look adds nothing');
reset role;
update laria_private.public_page_clock
set checked_at = ((clock_timestamp() at time zone 'America/Lima')::date::timestamp at time zone 'America/Lima') - interval '1 minute';
set local role service_role;
select pg_temp.check(public.claim_public_page_changes() is not null, 'a first day that started since the previous look adds a row');
reset role;
select pg_temp.check(pg_temp.take() = 1, 'one row for the collection that started');
update public.collections set starts_on = (clock_timestamp() at time zone 'America/Lima')::date - 5,
  ends_on = (clock_timestamp() at time zone 'America/Lima')::date - 1;
select pg_temp.take();
update laria_private.public_page_clock
set checked_at = ((clock_timestamp() at time zone 'America/Lima')::date::timestamp at time zone 'America/Lima') - interval '1 minute';
set local role service_role;
select pg_temp.check(public.claim_public_page_changes() is not null, 'a last day that ended since the previous look adds a row');
reset role;
select pg_temp.check(pg_temp.take() = 1, 'one row for the collection that ended');
update public.collections set published = false;
select pg_temp.take();
update laria_private.public_page_clock
set checked_at = ((clock_timestamp() at time zone 'America/Lima')::date::timestamp at time zone 'America/Lima') - interval '1 minute';
set local role service_role;
select pg_temp.check(public.claim_public_page_changes() is null, 'a draft collection''s dates add nothing');
reset role;

-- Who may call the helpers: nobody but the triggers.
select pg_temp.check(not has_function_privilege('anon', 'laria_private.feature_page_part(text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'laria_private.feature_page_part(text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'laria_private.mark_feature_page_changes()', 'execute')
  and not has_function_privilege('authenticated', 'laria_private.store_is_shown(uuid)', 'execute'),
  'the helpers are private');
select pg_temp.check((select count(*) from pg_trigger where tgname like '%\_public\_page\_changes\_%' and not tgisinternal
  and tgfoid = 'laria_private.mark_feature_page_changes()'::regprocedure) = 44,
  'fifteen tables, three triggers each but seller_pages, which has no insert trigger');

rollback;
