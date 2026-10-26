-- Demo data for the selling-tools batch (docs/feature-ideas/selling-tools.md), after demo-seed.sql and
-- ux-my-listings-seed.sql. Local databases only. The buyer saves the Particular's Squier, so "Oferta a interesados"
-- has someone to send to; everything else (Mi equipo, Qué recibimos, requests and offers) is made through the pages.
begin;

insert into public.favorites (user_id, listing_id) values
 ('d0000000-0000-4000-8000-000000000003', 'd5000000-0000-4000-8000-000000000001')
on conflict do nothing;

commit;
