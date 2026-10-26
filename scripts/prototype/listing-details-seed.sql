-- Feature ideas, listing-details batch (docs/feature-ideas/listing-details.md): demo data for the prototype, after
-- demo-seed.sql. Local only. Shows delivery and trade terms, the price mode, a store's combo discount and companions,
-- and the map: Laria Demo Música shows its address with a pin in Miraflores; Casa Musical Grau has a district and no
-- pin (an approximate area); Particulares show by city.
--
--   psql "$PGURL" -v ON_ERROR_STOP=1 -f scripts/prototype/listing-details-seed.sql

begin;
select set_config('app.allow_listing_admin_fields', 'true', true);

update public.stores set show_address = true, address = coalesce(nullif(address, ''), 'Av. José Larco 345'),
  map_latitude = -12.121900, map_longitude = -77.030000
where slug = 'laria-demo-musica';
update public.stores set district = 'Cercado de Lima' where slug = 'casa-musical-grau' and district is null;

select laria_private.write_listing_sale_terms(id, '{"price_mode":"fixed","pickup":true,"pickup_area":"Miraflores","can_try":true,
  "lima_delivery":"seller","ships_provinces":true,"carriers":["olva","shalom"],"shipping_payment":"origin"}')
from public.listings where slug in ('demo-fender-player-strat-3ts', 'demo-boss-ds-1', 'demo-boss-tu-3', 'demo-fender-frontman-10g', 'demo-yamaha-c40');

select laria_private.write_listing_sale_terms(id, '{"price_mode":"negotiable","pickup":true,"pickup_area":"Surco","can_try":true,
  "lima_delivery":"buyer","accepts_trades":true,"trade_wants":"Un pedal de delay o un ampli pequeño","trade_categories":["pedals","amplifiers"]}')
from public.listings where slug = 'demo-particular-squier-bullet';

select laria_private.write_listing_sale_terms(id, '{"price_mode":"negotiable","ships_provinces":true,"carriers":["shalom"],"shipping_payment":"destination"}')
from public.listings where slug in ('bajo-yamaha-trbx174-usado-huancayo', 'bateria-pearl-export-usada-arequipa');

select laria_private.write_listing_sale_terms(id, '{"price_mode":"fixed","pickup":true,"pickup_area":"Cercado","can_try":true}')
from public.listings where slug in ('amplificador-orange-crush-20-casa-musical-grau', 'guitarra-acustica-yamaha-f310-casa-musical-grau');

insert into public.seller_bundle_offers(store_id, discount_percent, min_items)
select id, 10, 2 from public.stores where slug = 'laria-demo-musica'
on conflict (store_id) where store_id is not null do update set discount_percent = excluded.discount_percent, min_items = excluded.min_items;

delete from public.listing_companions where listing_id = (select id from public.listings where slug = 'demo-fender-player-strat-3ts');
insert into public.listing_companions(listing_id, companion_id, sort_order)
select main.id, companion.id, (row_number() over (order by companion.slug) - 1)::smallint
from public.listings main
join public.listings companion on companion.slug in ('demo-boss-ds-1', 'demo-boss-tu-3', 'demo-fender-frontman-10g')
where main.slug = 'demo-fender-player-strat-3ts';

commit;
