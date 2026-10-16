-- Store Operations prototype: demo data for a LOCAL database only.
-- Run after the migrations and supabase/seed.sql:
--   psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -f scripts/prototype/demo-seed.sql
-- It refuses to run when the database already has more than a few hundred auth users (a guard against pointing it at
-- a real project). Every account uses the password laria-demo-2026 and an @laria.test address.
--
-- Accounts:
--   demo-tienda@laria.test     owner of "Laria Demo Música", verified, inventory enabled
--   admin@laria.test           Admin (app_metadata.role = admin)
--   comprador@laria.test       buyer with favorites and a saved search
--   particular@laria.test      Particular seller, for comparison
-- Sections further down are added as each sub-sprint lands (import, photos, publication, payment methods).

\set ON_ERROR_STOP 1
begin;

do $$ begin
  if (select count(*) from auth.users) > 300 then
    raise exception 'demo-seed.sql is for a local database only';
  end if;
end $$;

-- ------------------------------------------------------------------ accounts
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, created_at, updated_at)
values
 ('00000000-0000-0000-0000-000000000000','d0000000-0000-4000-8000-000000000001','authenticated','authenticated','demo-tienda@laria.test',
  extensions.crypt('laria-demo-2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
  '{"account_type":"store_owner","full_name":"Rosa Demo","phone":"51999000101","city":"Lima","region":"Lima"}', '', '', now(), now()),
 ('00000000-0000-0000-0000-000000000000','d0000000-0000-4000-8000-000000000002','authenticated','authenticated','admin@laria.test',
  extensions.crypt('laria-demo-2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"],"role":"admin"}',
  '{"account_type":"seller","full_name":"Admin Laria","phone":"51999000102","city":"Lima","region":"Lima"}', '', '', now(), now()),
 ('00000000-0000-0000-0000-000000000000','d0000000-0000-4000-8000-000000000003','authenticated','authenticated','comprador@laria.test',
  extensions.crypt('laria-demo-2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
  '{"account_type":"seller","full_name":"Carlos Comprador","phone":"51999000103","city":"Lima","region":"Lima"}', '', '', now(), now()),
 ('00000000-0000-0000-0000-000000000000','d0000000-0000-4000-8000-000000000004','authenticated','authenticated','particular@laria.test',
  extensions.crypt('laria-demo-2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
  '{"account_type":"seller","full_name":"Lucía Particular","phone":"51999000104","city":"Miraflores","region":"Lima"}', '', '', now(), now())
on conflict (id) do nothing;

-- On real local Supabase (GoTrue), token columns must be '' rather than null and each user needs an email identity.
-- The Docker-free shim has neither, so both steps check first.
do $gotrue$
declare col text;
begin
  foreach col in array array['email_change', 'email_change_token_new', 'email_change_token_current', 'phone_change',
                             'phone_change_token', 'reauthentication_token'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = col) then
      execute format('update auth.users set %I = coalesce(%I, %L) where email like %L', col, col, '', '%@laria.test');
    end if;
  end loop;
  if to_regclass('auth.identities') is not null then
    execute $q$
      insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
      select gen_random_uuid(), u.id, u.id::text, 'email',
             jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
      from auth.users u
      where u.email like '%@laria.test'
        and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email')
    $q$;
  end if;
end
$gotrue$;

-- ------------------------------------------------------------------ store
insert into public.stores (id, slug, name, razon_social, ruc, email, contact_person, contact_name, whatsapp_phone,
  city, district, region, address, description, owner_user_id, status, listing_plan, is_verified)
values ('d1000000-0000-4000-8000-000000000001', 'laria-demo-musica', 'Laria Demo Música', 'Laria Demo Música SAC',
  '20999000101', 'demo-tienda@laria.test', 'Rosa Demo', 'Rosa Demo', '51999000101', 'Lima', 'Miraflores', 'Lima',
  'Av. Larco 1234', 'Tienda de demostración: instrumentos nuevos y accesorios con stock gestionado en Laria.',
  'd0000000-0000-4000-8000-000000000001', 'active', 'growth_50', true)
on conflict (id) do nothing;

-- Admin enables the pilot gate (audited).
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d0000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"role":"admin"}}', true);
select public.admin_set_store_inventory_enabled('d1000000-0000-4000-8000-000000000001', true, 'Tienda de demostración del prototipo');
reset role;

-- ------------------------------------------------------------------ store listings (approved, new gear)
insert into public.listings (id, slug, title, seller_type, status, category, instrument_type, brand, model, condition,
  price_pen, city, region, contact_name, whatsapp_phone, description, owner_user_id, store_id, created_by_source,
  marketplace_rules_accepted_at)
select l.id::uuid, l.slug, l.title, 'store', 'approved', l.category, l.itype, l.brand, l.model, 'Nuevo', l.price,
  'Lima', 'Lima', 'Rosa Demo', '51999000101',
  'Producto nuevo con garantía de tienda. Stock informado por la tienda; confirma disponibilidad por WhatsApp.',
  'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'self_service', now()
from (values
  ('d2000000-0000-4000-8000-000000000001','demo-boss-ds-1','Pedal Boss DS-1 Distortion','pedals','pedals','Boss','DS-1',299),
  ('d2000000-0000-4000-8000-000000000002','demo-fender-player-strat-3ts','Fender Player Stratocaster 3-Color Sunburst','guitars','electric_guitar','Fender','Player Stratocaster',4299),
  ('d2000000-0000-4000-8000-000000000003','demo-yamaha-c40','Guitarra clásica Yamaha C40','guitars','acoustic_guitar','Yamaha','C40',459),
  ('d2000000-0000-4000-8000-000000000004','demo-shure-sm58','Micrófono Shure SM58','microphones','microphones','Shure','SM58',549),
  ('d2000000-0000-4000-8000-000000000005','demo-focusrite-scarlett-2i2','Interfaz Focusrite Scarlett 2i2 4ta gen','audio','audio_interface','Focusrite','Scarlett 2i2',899),
  ('d2000000-0000-4000-8000-000000000006','demo-boss-tu-3','Afinador Boss TU-3','pedals','pedals','Boss','TU-3',429),
  ('d2000000-0000-4000-8000-000000000007','demo-ibanez-gsr200','Bajo Ibanez GSR200 Black','basses','bass','Ibanez','GSR200',1199),
  ('d2000000-0000-4000-8000-000000000008','demo-fender-frontman-10g','Amplificador Fender Frontman 10G','amplifiers','amplifiers','Fender','Frontman 10G',389)
) as l(id, slug, title, category, itype, brand, model, price)
on conflict (id) do nothing;

insert into public.listing_photos (listing_id, image_url, alt_text, sort_order)
select l.id, 'https://placehold.co/900x700?text=' || replace(l.brand || ' ' || l.model, ' ', '+'), 'Foto de ' || l.title, 0
from public.listings l
where l.store_id = 'd1000000-0000-4000-8000-000000000001'
  and not exists (select 1 from public.listing_photos p where p.listing_id = l.id);

-- ------------------------------------------------------------------ inventory, as the owner
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select public.create_inventory_item(f, q, 'demo-create-' || md5(f::text))
from (values
  ('{"merchant_sku":"BOSS-DS1","product_name":"Boss DS-1 Distortion","unit_price_pen":299,"low_stock_threshold":3}'::jsonb, 8),
  ('{"merchant_sku":"FEN-PLSTRAT-3TS","product_name":"Fender Player Stratocaster","variant_label":"3-Color Sunburst","unit_price_pen":4299,"low_stock_threshold":1}', 3),
  ('{"merchant_sku":"YAM-C40","product_name":"Yamaha C40","unit_price_pen":459,"low_stock_threshold":4}', 12),
  ('{"merchant_sku":"SHU-SM58","product_name":"Shure SM58","unit_price_pen":549,"low_stock_threshold":3}', 6),
  ('{"merchant_sku":"FOC-2I2-G4","product_name":"Focusrite Scarlett 2i2","variant_label":"4ta generación","unit_price_pen":899,"low_stock_threshold":2}', 2),
  ('{"merchant_sku":"BOSS-TU3","product_name":"Boss TU-3","unit_price_pen":429,"low_stock_threshold":2}', 1),
  ('{"merchant_sku":"IBZ-GSR200-BK","product_name":"Ibanez GSR200","variant_label":"Black","unit_price_pen":1199,"low_stock_threshold":1}', 2),
  ('{"merchant_sku":"FEN-FM10G","product_name":"Fender Frontman 10G","unit_price_pen":389,"low_stock_threshold":2}', 4),
  ('{"merchant_sku":"DAD-EXL110","product_name":"Cuerdas D''Addario EXL110 10-46","unit_price_pen":39,"low_stock_threshold":20}', 64),
  ('{"merchant_sku":"ERN-2221","product_name":"Cuerdas Ernie Ball Regular Slinky 2221","unit_price_pen":35,"low_stock_threshold":20}', 15),
  ('{"merchant_sku":"","product_name":"Cable de instrumento 3 m (marca de la tienda)","unit_price_pen":29,"low_stock_threshold":10}', 40),
  ('{"merchant_sku":"PLK-DUNLOP-TORTEX-088","product_name":"Uñetas Dunlop Tortex 0.88 (pack x12)","unit_price_pen":25,"low_stock_threshold":10}', 0)
) as v(f, q);

-- Link items to their listings (same price, so no price choice is needed).
select public.link_inventory_listing(i.id, l.id, i.version)
from public.store_inventory_items i
join (values ('BOSS-DS1','demo-boss-ds-1'),('FEN-PLSTRAT-3TS','demo-fender-player-strat-3ts'),('YAM-C40','demo-yamaha-c40'),
             ('SHU-SM58','demo-shure-sm58'),('FOC-2I2-G4','demo-focusrite-scarlett-2i2'),('BOSS-TU3','demo-boss-tu-3'),
             ('IBZ-GSR200-BK','demo-ibanez-gsr200'),('FEN-FM10G','demo-fender-frontman-10g')) m(sku, slug) on m.sku = i.merchant_sku
join public.listings l on l.slug = m.slug
where i.store_id = 'd1000000-0000-4000-8000-000000000001' and i.listing_id is null;

-- A few days of stock activity.
create temp table demo_moves (n int, sku text, kind text, qty int, channel text, reason text) on commit drop;
grant all on demo_moves to authenticated;
insert into demo_moves values
 (1,'BOSS-DS1','sale',1,'tienda_fisica','Venta en tienda'), (2,'BOSS-DS1','sale',1,'whatsapp_laria','Venta por WhatsApp'),
 (3,'YAM-C40','sale',2,'tienda_fisica','Colegio San Martín'), (4,'YAM-C40','restock',6,null,'Llegó pedido Yamaha'),
 (5,'SHU-SM58','sale',1,'whatsapp_laria','Contacto desde Laria'), (6,'SHU-SM58','damage_or_loss',1,null,'Rejilla dañada en exhibición'),
 (7,'DAD-EXL110','sale',12,'tienda_fisica','Venta mostrador'), (8,'ERN-2221','sale',6,'tienda_fisica','Venta mostrador'),
 (9,'FEN-PLSTRAT-3TS','sale',1,'whatsapp_laria','Contacto desde Laria'), (10,'BOSS-TU3','sale',1,'whatsapp_laria','Venta por WhatsApp'),
 (11,'FOC-2I2-G4','return',1,'tienda_fisica','Devolución sin uso');
select public.record_stock_movement(i.id, m.kind, m.qty,
  m.channel, null, m.reason, null, 'demo-move-' || m.n)
from demo_moves m join public.store_inventory_items i on i.merchant_sku = m.sku and i.store_id = 'd1000000-0000-4000-8000-000000000001'
order by m.n;
reset role;

-- ------------------------------------------------------------------ buyer
insert into public.favorites (user_id, listing_id) values
 ('d0000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000001'),
 ('d0000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000006')
on conflict do nothing;

-- ------------------------------------------------------------------ PAY-1: accepted payment methods (Pilot A)
-- Visible only with LARIA_ASSISTED_COMMERCE=1. Three approved methods, one still in review. Turns the database's own
-- pilot switch on (review fix A14); the demo database is local only.
do $pay$
begin
  -- Skipped on a branch without PAY-1.
  if to_regprocedure('public.set_store_payment_method(public.store_payment_method,text,text,text)') is null then
    raise notice 'PAY-1 not present; skipping payment methods';
    return;
  end if;
  if to_regprocedure('laria_private.set_assisted_commerce_pilot(boolean,text)') is not null then
    perform laria_private.set_assisted_commerce_pilot(true, 'Prototipo local');
  end if;
  perform set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  execute $q$
    select public.set_store_payment_method('efectivo_al_recoger', null, null, 'En tienda, Av. Larco 1234');
    select public.set_store_payment_method('yape_plin', 'Laria Demo Música SAC', null, null);
    select public.set_store_payment_method('pos_tarjeta_al_recoger', 'Laria Demo Música SAC', 'Izipay', 'Visa y Mastercard');
    select public.set_store_payment_method('link_de_pago', 'Laria Demo Música SAC', 'Mercado Pago', 'Te enviamos el link por WhatsApp');
  $q$;
  perform set_config('request.jwt.claims',
    '{"sub":"d0000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"role":"admin"}}', true);
  execute format($q$
    select public.admin_review_store_payment_method(m.store_id, m.method, 'approve', 'Titular coincide con la razón social', m.%I)
    from public.store_payment_methods m
    where m.store_id = 'd1000000-0000-4000-8000-000000000001' and m.method <> 'link_de_pago' and m.status = 'pending_review'
  $q$, case when to_regprocedure('laria_private.set_assisted_commerce_pilot(boolean,text)') is null then 'updated_at' else 'revision' end);
end
$pay$;

commit;
