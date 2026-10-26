-- Deal-trust demo data (docs/feature-ideas/deal-trust.md), loaded after demo-seed.sql and ux-my-listings-seed.sql.
-- Local only. Gives the demo accounts something to show:
--   particular@laria.test   five sales confirmed by both sides, four reviews (one with an approved photo), so the
--                           nightly job makes them «Vendedor destacado»; their seller page.
--   comprador@laria.test    the buyer of three of those sales, with their buyer card turned on and two reviews from
--                           the seller; they resell one instrument, linked to the purchase («Historial en Laria»).
--   demo-tienda@laria.test  «Laria Demo Música» shows its address and is a «Punto seguro Laria».
-- The review photo's file is copied by hand (scripts/prototype/README.md § Deal-trust).
\set ON_ERROR_STOP 1
begin;

do $$ begin
  if (select count(*) from auth.users) > 300 then
    raise exception 'deal-trust-seed.sql is for a local database only';
  end if;
end $$;

-- Five instruments particular@laria.test sold in Laria.
insert into public.listings (id, slug, title, seller_type, status, category, instrument_type, brand, model, condition, price_pen,
  city, region, contact_name, whatsapp_phone, description, owner_user_id, created_by_source, marketplace_rules_accepted_at, attributes)
values
  ('d8000000-0000-4000-8000-000000000001','demo-particular-telecaster','Fender Player Telecaster Butterscotch','individual','approved','guitars','electric_guitar','Fender','Player Telecaster','Muy bueno',3600,'Lima','Lima','Pablo Demo','51999000104','Telecaster mexicana con estuche, cuerdas nuevas y regulada hace un mes.','d0000000-0000-4000-8000-000000000004','self_service',now() - interval '120 days','{"color":"Butterscotch"}'),
  ('d8000000-0000-4000-8000-000000000002','demo-particular-big-muff','Pedal Electro-Harmonix Big Muff Pi','individual','approved','pedals','pedals','Electro-Harmonix','Big Muff Pi','Bueno',320,'Lima','Lima','Pablo Demo','51999000104','Big Muff de los nuevos, funciona perfecto, con su caja original.','d0000000-0000-4000-8000-000000000004','self_service',now() - interval '110 days',null),
  ('d8000000-0000-4000-8000-000000000003','demo-particular-katana','Amplificador Boss Katana 50 MkII','individual','approved','amplifiers','amplifiers','Boss','Katana 50 MkII','Muy bueno',1500,'Lima','Lima','Pablo Demo','51999000104','Katana 50 con footswitch, poco uso en casa, sin golpes.','d0000000-0000-4000-8000-000000000004','self_service',now() - interval '100 days',null),
  ('d8000000-0000-4000-8000-000000000004','demo-particular-sm57','Micrófono Shure SM57','individual','approved','microphones','microphones','Shure','SM57','Bueno',380,'Lima','Lima','Pablo Demo','51999000104','SM57 original con su pinza, usado en ensayos.','d0000000-0000-4000-8000-000000000004','self_service',now() - interval '90 days',null),
  ('d8000000-0000-4000-8000-000000000005','demo-particular-cry-baby','Pedal Dunlop Cry Baby GCB95','individual','approved','pedals','pedals','Dunlop','Cry Baby GCB95','Bueno',290,'Lima','Lima','Pablo Demo','51999000104','Wah clásico, potenciómetro limpio, sin ruidos.','d0000000-0000-4000-8000-000000000004','self_service',now() - interval '80 days',null)
on conflict (id) do nothing;

select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set status = 'sold', sold_at = now() - interval '30 days' + (interval '4 days' * (right(id::text, 1)::integer))
where id::text like 'd8000000-0000-4000-8000-00000000000_' and status = 'approved';
select set_config('app.allow_listing_admin_fields', '', true);

-- Sales 1, 3 and 5 went to comprador@laria.test, 2 and 4 to the demo store's owner buying as a person.
insert into public.transaction_claims (id, listing_id, seller_user_id, buyer_user_id, attribution_type, status, created_at, responded_at, ended_at)
select ('d8100000-0000-4000-8000-00000000000' || n)::uuid, ('d8000000-0000-4000-8000-00000000000' || n)::uuid,
  'd0000000-0000-4000-8000-000000000004',
  case when n % 2 = 1 then 'd0000000-0000-4000-8000-000000000003'::uuid else 'd0000000-0000-4000-8000-000000000001'::uuid end,
  'laria', 'confirmed', now() - interval '28 days', now() - interval '27 days', now() - interval '27 days'
from generate_series(1, 5) n
on conflict (id) do nothing;

-- Sale 1 is recent (its reviews are still open); the other four closed their ten days.
insert into public.verified_transactions (id, claim_id, listing_id, seller_user_id, buyer_user_id, seller_identity_type, sold_at, verified_at, review_deadline)
select ('d8200000-0000-4000-8000-00000000000' || n)::uuid, ('d8100000-0000-4000-8000-00000000000' || n)::uuid,
  ('d8000000-0000-4000-8000-00000000000' || n)::uuid, 'd0000000-0000-4000-8000-000000000004',
  case when n % 2 = 1 then 'd0000000-0000-4000-8000-000000000003'::uuid else 'd0000000-0000-4000-8000-000000000001'::uuid end,
  'particular', now() - interval '27 days',
  case n when 1 then now() - interval '2 days' else now() - interval '26 days' end,
  case n when 1 then now() + interval '8 days' else now() - interval '16 days' end
from generate_series(1, 5) n
on conflict (id) do nothing;

insert into public.transaction_reviews (id, transaction_id, direction, reviewer_user_id, subject_user_id, rating, comment, submitted_at)
values
  ('d8300000-0000-4000-8000-000000000002','d8200000-0000-4000-8000-000000000002','buyer_to_seller','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000004',5,'El pedal llegó tal cual las fotos. Muy amable.',now() - interval '20 days'),
  ('d8300000-0000-4000-8000-000000000003','d8200000-0000-4000-8000-000000000003','buyer_to_seller','d0000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000004',5,'Probamos el ampli juntos en un centro comercial; todo como dijo.',now() - interval '19 days'),
  ('d8300000-0000-4000-8000-000000000004','d8200000-0000-4000-8000-000000000004','buyer_to_seller','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000004',4,'Buen micro, la pinza tenía un detalle que me avisó antes.',now() - interval '18 days'),
  ('d8300000-0000-4000-8000-000000000005','d8200000-0000-4000-8000-000000000005','buyer_to_seller','d0000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000004',5,'Respondió rápido y el wah funciona perfecto.',now() - interval '17 days'),
  ('d8300000-0000-4000-8000-000000000013','d8200000-0000-4000-8000-000000000003','seller_to_buyer','d0000000-0000-4000-8000-000000000004','d0000000-0000-4000-8000-000000000003',5,'Puntual y claro.',now() - interval '19 days'),
  ('d8300000-0000-4000-8000-000000000015','d8200000-0000-4000-8000-000000000005','seller_to_buyer','d0000000-0000-4000-8000-000000000004','d0000000-0000-4000-8000-000000000003',5,'Todo bien.',now() - interval '17 days')
on conflict (id) do nothing;

-- The amplifier review's photo, approved by Admin. Its file goes to <STORAGE_DIR>/review-photos/<path> (README).
insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
values ('review-photos', 'd0000000-0000-4000-8000-000000000003/d8200000-0000-4000-8000-000000000003/d8400000-0000-4000-8000-000000000001.jpg',
  'd0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003', '{"size": 120000, "mimetype": "image/jpeg"}')
on conflict (bucket_id, name) do nothing;
insert into public.transaction_review_photos (id, review_id, storage_path, sort_order, status, created_at, moderated_at, moderated_by)
values ('d8400000-0000-4000-8000-000000000001', 'd8300000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000003/d8200000-0000-4000-8000-000000000003/d8400000-0000-4000-8000-000000000001.jpg',
  0, 'approved', now() - interval '19 days', now() - interval '18 days', 'd0000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

-- Comprador resells the Telecaster from sale 1 and links it to the purchase.
insert into public.listings (id, slug, title, seller_type, status, category, instrument_type, brand, model, condition, price_pen,
  city, region, contact_name, whatsapp_phone, description, owner_user_id, created_by_source, marketplace_rules_accepted_at, attributes)
values ('d8000000-0000-4000-8000-000000000011','demo-comprador-telecaster','Fender Player Telecaster, la vendo','individual','approved','guitars','electric_guitar','Fender','Player Telecaster','Muy bueno',3400,'Lima','Lima','Carla Demo','51999000103','La compré en Laria hace poco; me pasé a una Les Paul. Con estuche y cuerdas nuevas.','d0000000-0000-4000-8000-000000000003','self_service',now(),'{"color":"Butterscotch"}')
on conflict (id) do nothing;
insert into public.listing_provenance (listing_id, transaction_id, linked_by)
values ('d8000000-0000-4000-8000-000000000011', 'd8200000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003')
on conflict (listing_id) do nothing;

-- Comprador's buyer card, on.
insert into public.buyer_track_records (user_id, enabled, token, enabled_at)
values ('d0000000-0000-4000-8000-000000000003', true, 'a1b2c3d4e5f60718293a4b5c', now() - interval '3 days')
on conflict (user_id) do nothing;

-- The demo store shows its address and offers itself as a Punto seguro.
select set_config('app.allow_store_admin_fields', 'true', true);
update public.stores set show_address = true, opening_hours = coalesce(opening_hours, 'Lunes a sábado de 10:00 a 20:00')
where id = 'd1000000-0000-4000-8000-000000000001';
select set_config('app.allow_store_admin_fields', '', true);
insert into public.store_safe_spots (store_id, enabled, note, enabled_at)
values ('d1000000-0000-4000-8000-000000000001', true, 'Pregunta en caja: hay una mesa y un ampli para probar.', now() - interval '5 days')
on conflict (store_id) do nothing;

-- What the nightly job would do tonight.
select laria_private.refresh_seller_levels();

commit;
