-- Demo data for the discovery batch (docs/feature-ideas/discovery.md), after demo-seed.sql. Local databases only.
-- A Taller in Ayacucho with three andean listings (two handmade, one made to order), a gift-exchange policy on the
-- demo store, and the demo Particular as a verified artist with a note on the Squier. Password: laria-demo-2026.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000','d0000000-0000-4000-8000-000000000021','authenticated','authenticated','taller@laria.test',
  extensions.crypt('laria-demo-2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
  '{"account_type":"store_owner","full_name":"Teodoro Quispe","phone":"51999000121","city":"Ayacucho","region":"Ayacucho"}', '', '', now(), now())
on conflict (id) do nothing;

do $gotrue$
begin
  if to_regclass('auth.identities') is not null then
    execute $q$
      insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
      select gen_random_uuid(), u.id, u.id::text, 'email',
             jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
      from auth.users u
      where u.email = 'taller@laria.test'
        and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email')
    $q$;
  end if;
end
$gotrue$;

insert into public.stores (id, slug, name, razon_social, ruc, email, contact_person, contact_name, whatsapp_phone,
  city, district, region, address, description, owner_user_id, status, listing_plan, is_verified)
values ('d1000000-0000-4000-8000-000000000021', 'taller-wayra', 'Taller Wayra', 'Taller Wayra EIRL', '20999000121',
  'taller@laria.test', 'Teodoro Quispe', 'Teodoro Quispe', '51999000121', 'Ayacucho', 'Huamanga', 'Ayacucho',
  'Jr. Demo 121', 'Charangos, quenas y zampoñas hechos a mano en Huamanga.',
  'd0000000-0000-4000-8000-000000000021', 'active', 'free', true)
on conflict (id) do nothing;

insert into public.listings (id, slug, title, seller_type, status, category, instrument_type, attributes, brand, model,
  condition, price_pen, city, region, contact_name, whatsapp_phone, description, owner_user_id, store_id,
  created_by_source, marketplace_rules_accepted_at, published_at)
values
 ('d2000000-0000-4000-8000-000000000021', 'demo-charango-wayra', 'Charango de naranjillo Taller Wayra', 'store', 'approved',
  'andean', 'andean_instrument', '{"andean_type":"charango"}', 'Taller Wayra', 'Naranjillo', 'Nuevo', 950, 'Ayacucho',
  'Ayacucho', 'Teodoro Quispe', '51999000121', 'Charango de diez cuerdas con caja de naranjillo y tapa de pino, hecho a mano en el taller.',
  'd0000000-0000-4000-8000-000000000021', 'd1000000-0000-4000-8000-000000000021', 'self_service', now(), now() - interval '2 days'),
 ('d2000000-0000-4000-8000-000000000022', 'demo-quena-wayra', 'Quena de caña en sol Taller Wayra', 'store', 'approved',
  'andean', 'andean_instrument', '{"andean_type":"quena"}', 'Taller Wayra', 'Caña', 'Nuevo', 140, 'Ayacucho',
  'Ayacucho', 'Teodoro Quispe', '51999000121', 'Quena de caña afinada en sol, con funda de tela y boquilla trabajada a mano.',
  'd0000000-0000-4000-8000-000000000021', 'd1000000-0000-4000-8000-000000000021', 'self_service', now(), now() - interval '1 day'),
 ('d2000000-0000-4000-8000-000000000023', 'demo-zampona-wayra', 'Zampoña doble de 13 tubos Taller Wayra', 'store', 'approved',
  'andean', 'andean_instrument', '{"andean_type":"zampona"}', 'Taller Wayra', 'Malta', 'Nuevo', 220, 'Ayacucho',
  'Ayacucho', 'Teodoro Quispe', '51999000121', 'Zampoña de dos hileras afinada en mi menor, hecha a pedido con caña seleccionada.',
  'd0000000-0000-4000-8000-000000000021', 'd1000000-0000-4000-8000-000000000021', 'self_service', now(), now())
on conflict (id) do nothing;

insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://placehold.co/900x700?text=' || replace(split_part(l.title, ' ', 1), ' ', '+'), n
from public.listings l cross join generate_series(0, 1) n
where l.id in ('d2000000-0000-4000-8000-000000000021', 'd2000000-0000-4000-8000-000000000022', 'd2000000-0000-4000-8000-000000000023')
  and not exists (select 1 from public.listing_photos p where p.listing_id = l.id);

insert into public.store_maker_profiles (store_id, kind, craft_city, story, since_year)
values ('d1000000-0000-4000-8000-000000000021', 'taller', 'Ayacucho',
  'Somos un taller familiar de Huamanga. Hacemos charangos, quenas y zampoñas a mano, uno por uno, con maderas y cañas que elegimos nosotros.', 1998)
on conflict (store_id) do nothing;

insert into public.listing_maker_details (listing_id, handmade, made_to_order_weeks) values
 ('d2000000-0000-4000-8000-000000000021', true, null),
 ('d2000000-0000-4000-8000-000000000022', true, null),
 ('d2000000-0000-4000-8000-000000000023', true, 3)
on conflict (listing_id) do nothing;

insert into public.store_gift_policies (store_id, exchange_days, note) values
 ('d1000000-0000-4000-8000-000000000001', 15, 'Con boleta y el empaque original.'),
 ('d1000000-0000-4000-8000-000000000021', 30, null)
on conflict (store_id) do nothing;

insert into public.artist_profiles (user_id, slug, display_name, story, link_url, verified_by)
values ('d0000000-0000-4000-8000-000000000004', 'lucia-demo', 'Lucía Demo',
  'Guitarrista de sesión en Lima. Vende el equipo que usó en giras y grabaciones cuando lo cambia por otro.',
  'https://example.com/lucia-demo', 'd0000000-0000-4000-8000-000000000002')
on conflict (user_id) do nothing;

insert into public.listing_maker_details (listing_id, handmade, artist_note)
values ('d5000000-0000-4000-8000-000000000001', false, 'La usé en la gira por el sur de 2024.')
on conflict (listing_id) do nothing;

commit;
