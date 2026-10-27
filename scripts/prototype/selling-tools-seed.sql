-- Demo data for the selling-tools batch (docs/feature-ideas/selling-tools.md), after demo-seed.sql and
-- ux-my-listings-seed.sql. Local databases only. The buyer saves the Particular's Squier, so "Oferta a interesados"
-- has someone to send to, and the store gets one used guitar outside its Inventario, which is what a consignment needs
-- (stock-managed listings can't take one). Everything else (Mi equipo, Qué recibimos, requests and offers) is made
-- through the pages.
begin;

insert into public.favorites (user_id, listing_id) values
 ('d0000000-0000-4000-8000-000000000003', 'd5000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into public.listings (id, slug, title, seller_type, status, category, instrument_type, brand, model, condition,
  price_pen, city, region, contact_name, whatsapp_phone, description, owner_user_id, store_id, created_by_source,
  marketplace_rules_accepted_at)
values ('d6000000-0000-4000-8000-000000000001', 'demo-ibanez-rg421-usada', 'Guitarra eléctrica Ibanez RG421 usada',
  'store', 'approved', 'guitars', 'electric_guitar', 'Ibanez', 'RG421', 'Muy bueno', 1650, 'Lima', 'Lima', 'Rosa Demo',
  '51999000101', 'Usada, con detalles leves en el cuerpo. Revisada en tienda: trastes y electrónica en buen estado.',
  'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'self_service', now())
on conflict (id) do nothing;

insert into public.listing_photos (listing_id, image_url, alt_text, sort_order)
select 'd6000000-0000-4000-8000-000000000001', 'https://placehold.co/900x700?text=Ibanez+RG421', 'Foto de Ibanez RG421', 0
where not exists (select 1 from public.listing_photos where listing_id = 'd6000000-0000-4000-8000-000000000001');

commit;
