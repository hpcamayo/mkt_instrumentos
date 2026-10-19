-- ux my-listings demo data, loaded after demo-seed.sql (local only). Gives particular@laria.test something in
-- Pendientes (a rejected listing with reasons, a draft, an old listing to confirm, a buyer who says they bought) and
-- comprador@laria.test a purchase question.
begin;
select set_config('app.allow_listing_admin_fields', 'true', true);

insert into public.listings (id, slug, title, seller_type, status, category, instrument_type, brand, model, condition,
  price_pen, city, region, contact_name, whatsapp_phone, description, owner_user_id, created_by_source,
  marketplace_rules_accepted_at, published_at, created_at, rejection_reason, rejection_codes)
values
  ('d5000000-0000-4000-8000-000000000001','demo-particular-squier-bullet','Guitarra Squier Bullet Stratocaster','individual','approved','guitars','electric_guitar','Squier','Bullet Stratocaster','Usado - buen estado',
   650,'Lima','Lima','Pablo Demo','51999000104','Guitarra con poco uso, trastes en buen estado, incluye funda acolchada y cable de 3 metros.','d0000000-0000-4000-8000-000000000004','self_service',now(),now() - interval '40 days',now() - interval '40 days',null,null),
  ('d5000000-0000-4000-8000-000000000002','demo-particular-casio-ctk','Teclado Casio CTK-3500','individual','rejected','keyboards','keyboards','Casio','CTK-3500','Usado - con detalles',
   480,'Lima','Lima','Pablo Demo','51999000104','Teclado de 61 teclas sensibles, funciona bien, con atril y fuente original.','d0000000-0000-4000-8000-000000000004','self_service',now(),null,now() - interval '3 days',
   'Pocas fotos o fotos poco claras; Marca o modelo incorrectos. Nota: el modelo de la foto parece CTK-2500.', array['pocas_fotos','marca_modelo']),
  ('d5000000-0000-4000-8000-000000000003','demo-particular-cajon','Cajón peruano artesanal','individual','draft','percussion','hand_percussion',null,null,'Usado - buen estado',
   220,'Lima','Lima','Pablo Demo','51999000104','Cajón de madera tornillo hecho a mano en Chincha, sonido grave profundo.','d0000000-0000-4000-8000-000000000004','self_service',now(),null,now() - interval '1 day',null,null),
  ('d5000000-0000-4000-8000-000000000004','demo-particular-zoom-g1','Pedalera Zoom G1 Four','individual','approved','pedals','pedals','Zoom','G1 Four','Usado - con detalles',
   290,'Lima','Lima','Pablo Demo','51999000104','Pedalera multiefectos con su fuente, funciona perfecto, algunas marcas de uso en la carcasa.','d0000000-0000-4000-8000-000000000004','self_service',now(),now() - interval '12 days',now() - interval '12 days',null,null)
on conflict (id) do nothing;

insert into public.listing_photos (listing_id, image_url, alt_text, sort_order)
select l.id, 'https://placehold.co/900x700?text=' || replace(l.title, ' ', '+') || '+' || n, 'Foto de ' || l.title, n - 1
from public.listings l cross join generate_series(1, 2) n
where l.id::text like 'd5000000-%' and not exists (select 1 from public.listing_photos p where p.listing_id = l.id);

-- The buyer wrote about the pedal 5 days ago (purchase question) and about the guitar 6 days ago, then said they bought it.
insert into public.marketplace_events (event_type, created_at, listing_id, seller_user_id, actor_user_id, source, metadata, dedupe_key) values
  ('whatsapp_contact', now() - interval '5 days', 'd5000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000003', 'detail', '{}', 'ux-demo-contact-1'),
  ('whatsapp_contact', now() - interval '6 days', 'd5000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000003', 'detail', '{}', 'ux-demo-contact-2')
on conflict (dedupe_key) do nothing;
commit;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-000000000003","role":"authenticated"}', false);
select public.answer_purchase_checkin('d5000000-0000-4000-8000-000000000001', true);
reset role;
select laria_private.run_my_listings_reminders();
