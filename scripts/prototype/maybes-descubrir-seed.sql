-- Descubrir (big-02, docs/ux-effortless/maybes-descubrir.md) demo data, loaded after demo-seed.sql (local only).
-- Sixteen approved listings with two to five photos each, published relative to when the seed runs (Lima days): five
-- today, three yesterday, six over the five days before, and two older ones that only a results list (or the 30-day
-- window, when the week is thin) shows. So "Lo nuevo" has a today, a stop after it, earlier days and an end.
--
-- Photos: scripts/prototype/make-descubrir-photos.py draws them (same slugs and counts as below). Put them where the
-- local gateway serves the listing-photos bucket and pass that address as photo_base:
--   python3 scripts/prototype/make-descubrir-photos.py "$STORAGE_DIR/listing-photos/descubrir"
--   psql "$LOCAL_DB" -v ON_ERROR_STOP=1 \
--     -v photo_base="$GATEWAY_URL/storage/v1/object/public/listing-photos/descubrir" \
--     -f scripts/prototype/maybes-descubrir-seed.sql
-- Without photo_base the photos point at placehold.co, like the other seeds.

\set ON_ERROR_STOP 1
\if :{?photo_base}
\else
  \set photo_base ''
\endif

begin;

do $$ begin
  if (select count(*) from auth.users) > 300 then
    raise exception 'maybes-descubrir-seed.sql is for a local database only';
  end if;
  if not exists (select 1 from public.stores where id = 'd1000000-0000-4000-8000-000000000001') then
    raise exception 'load scripts/prototype/demo-seed.sql first';
  end if;
end $$;

-- published_at and created_at are set here, as supabase/seed.sql does.
select set_config('app.allow_listing_admin_fields', 'true', true);

create temp table descubrir_seed (n int, slug text, title text, seller text, category text, itype text, brand text,
  model text, condition text, price int, city text, attributes jsonb, photos int, days int, at numeric,
  description text) on commit drop;

-- days: Lima days ago. at: for today, the share of the time since midnight it was published before now (0.1 = most
-- recent); for earlier days, the Lima hour.
insert into descubrir_seed values
 (1,'descubrir-fender-telecaster-player','Fender Player Telecaster Butterscotch Blonde','store','guitars','electric_guitar',
  'Fender','Player Telecaster','Nuevo',3999,'Lima',
  '{"body_type":"solid_body","shape":"tele","strings":"6","bridge":"fixed","pickups":["single_coil"],"handedness":"right_handed","frets":"22"}',
  4,0,0.1,'Nueva, con garantía de tienda y funda. Mástil de arce, dos pastillas simples. Pruébala en Av. Larco.'),
 (2,'descubrir-yamaha-p45','Piano digital Yamaha P-45 con atril y pedal','individual','keyboards','keyboards',
  'Yamaha','P-45','Usado - buen estado',1650,'Lima',
  '{"keyboard_type":"digital_piano","keys":"88","weighted_keys":"yes"}',
  3,0,0.3,'88 teclas con peso, muy poco uso. Incluye atril, pedal de sustain y fuente original.'),
 (3,'descubrir-ibanez-sr300e','Bajo Ibanez SR300E 4 cuerdas activo','individual','basses','bass',
  'Ibanez','SR300E','Usado - buen estado',1450,'Arequipa',
  '{"strings":"4","bass_type":"modern","pickups":["pj","active"],"scale_length":"long","handedness":"right_handed"}',
  5,0,0.5,'Electrónica activa de 3 bandas, trastes sin desgaste. Entrego con funda y correa.'),
 (4,'descubrir-pearl-roadshow','Batería Pearl Roadshow 5 cuerpos con platillos','individual','percussion','drums',
  'Pearl','Roadshow','Usado - con detalles',2300,'Lima',
  '{"drum_type":"acoustic","configuration":"complete","pieces":"5","material":"poplar","includes_hardware":"yes","includes_cymbals":"yes","kick_size":"22"}',
  3,0,0.7,'Completa con fierros, banco y platillos. Algunas marcas en el bombo, suena bien.'),
 (5,'descubrir-boss-rc-30','Pedal Boss RC-30 Loop Station','store','pedals','pedals',
  'Boss','RC-30','Nuevo',1290,'Lima',
  '{"pedal_type":"multi_fx","format":"double","true_bypass":"no"}',
  2,0,0.85,'Nuevo en caja. Dos pistas de loop sincronizadas y efectos incorporados.'),
 (6,'descubrir-marshall-dsl40','Amplificador Marshall DSL40CR 40 W a tubos','individual','amplifiers','amplifiers',
  'Marshall','DSL40CR','Usado - buen estado',2900,'Lima',
  '{"amplifier_type":"combo","technology":"tube","power":"16_50w","use_case":"guitar"}',
  3,1,19.5,'Combo 1x12 a tubos, válvulas cambiadas hace seis meses. Con footswitch.'),
 (7,'descubrir-taylor-114ce','Guitarra electroacústica Taylor 114ce','store','guitars','acoustic_guitar',
  'Taylor','114ce','Nuevo',4590,'Lima',
  '{"acoustic_type":"electro_acoustic","body_shape":"grand_auditorium","strings_material":"steel","handedness":"right_handed","has_preamp":"yes"}',
  4,1,15,'Tapa sólida de abeto, corte y preamplificador. Nueva, con estuche acolchado.'),
 (8,'descubrir-epiphone-les-paul','Epiphone Les Paul Standard 60s','individual','guitars','electric_guitar',
  'Epiphone','Les Paul Standard 60s','Usado - buen estado',2100,'Huancayo',
  '{"body_type":"solid_body","shape":"les_paul","strings":"6","bridge":"fixed","pickups":["humbucker"],"handedness":"right_handed","frets":"22"}',
  3,1,10,'Muy cuidada, cuerdas nuevas. Envío a Lima por agencia si te interesa.'),
 (9,'descubrir-roland-td07','Batería electrónica Roland TD-07KV','individual','percussion','drums',
  'Roland','TD-07KV','Usado - buen estado',3200,'Lima',
  '{"drum_type":"electronic","configuration":"complete","pieces":"5","includes_hardware":"yes","includes_cymbals":"yes"}',
  2,2,18,'Parches de malla, módulo con Bluetooth. Ideal para departamento.'),
 (10,'descubrir-shure-sm7b','Micrófono Shure SM7B','store','microphones','microphones',
  'Shure','SM7B','Nuevo',1890,'Lima',
  '{"microphone_type":"dynamic","use_case":["voice","podcast"],"polar_pattern":"cardioid","connection":"xlr"}',
  2,2,11,'Nuevo, sellado. El micrófono de voz y podcast más pedido.'),
 (11,'descubrir-cort-action-bass','Bajo Cort Action Bass Plus negro','individual','basses','bass',
  'Cort','Action Bass Plus','Usado - con detalles',690,'Ayacucho',
  '{"strings":"4","bass_type":"modern","pickups":["active"],"scale_length":"long","handedness":"right_handed"}',
  3,3,20,'Para empezar: algunos golpes en el canto, todo funciona. Con cable.'),
 (12,'descubrir-korg-minilogue','Sintetizador Korg Minilogue XD','individual','keyboards','keyboards',
  'Korg','Minilogue XD','Usado - buen estado',2450,'Lima',
  '{"keyboard_type":"synthesizer","keys":"37","weighted_keys":"no"}',
  3,4,16,'Analógico de cuatro voces con efectos digitales. Sin detalles, con su fuente.'),
 (13,'descubrir-tc-hall-of-fame','Pedal TC Electronic Hall of Fame 2 Reverb','individual','pedals','pedals',
  'TC Electronic','Hall of Fame 2','Usado - buen estado',380,'Lima',
  '{"pedal_type":"reverb","format":"compact","true_bypass":"yes"}',
  2,5,12,'Reverb con TonePrint, funciona perfecto. Lo cambio por overdrive también.'),
 (14,'descubrir-squier-strat','Squier Classic Vibe 60s Stratocaster Lake Placid Blue','individual','guitars','electric_guitar',
  'Squier','Classic Vibe 60s Stratocaster','Usado - buen estado',1750,'Lima',
  '{"body_type":"solid_body","shape":"strat","strings":"6","bridge":"tremolo","pickups":["sss"],"handedness":"right_handed","frets":"21"}',
  4,6,21,'Calibrada, trastes pulidos. Incluye palanca y funda.'),
 (15,'descubrir-fender-rumble-40','Amplificador de bajo Fender Rumble 40','individual','amplifiers','amplifiers',
  'Fender','Rumble 40','Usado - con detalles',690,'Arequipa',
  '{"amplifier_type":"combo","technology":"solid_state","power":"16_50w","use_case":"bass"}',
  2,9,17,'Rejilla con una abolladura, suena limpio y fuerte.'),
 (16,'descubrir-gibson-sg','Gibson SG Standard Heritage Cherry','store','guitars','electric_guitar',
  'Gibson','SG Standard','Nuevo',8990,'Lima',
  '{"body_type":"solid_body","shape":"sg","strings":"6","bridge":"fixed","pickups":["humbucker"],"handedness":"right_handed","frets":"22"}',
  5,20,12,'Nueva con estuche Gibson. Separa la tuya con la tienda.');

insert into public.listings (id, slug, title, seller_type, status, category, instrument_type, brand, model, condition,
  price_pen, city, region, contact_name, whatsapp_phone, description, owner_user_id, store_id, created_by_source,
  marketplace_rules_accepted_at, attributes, published_at, created_at)
select ('de5c0000-0000-4000-8000-' || lpad(s.n::text, 12, '0'))::uuid, s.slug, s.title, s.seller::public.seller_type, 'approved', s.category,
  s.itype, s.brand, s.model, s.condition, s.price, s.city,
  case s.city when 'Huancayo' then 'Junín' else s.city end,
  case when s.seller = 'store' then 'Rosa Demo' else 'Lucía Particular' end,
  case when s.seller = 'store' then '51999000101' else '51999000104' end,
  s.description,
  case when s.seller = 'store' then 'd0000000-0000-4000-8000-000000000001' else 'd0000000-0000-4000-8000-000000000004' end::uuid,
  case when s.seller = 'store' then 'd1000000-0000-4000-8000-000000000001'::uuid end,
  'self_service', now(), s.attributes, p.at, p.at
from descubrir_seed s
cross join lateral (
  select case when s.days = 0
    then now() - (now() - (date_trunc('day', now() at time zone 'America/Lima') at time zone 'America/Lima')) * s.at
    else (date_trunc('day', now() at time zone 'America/Lima') - make_interval(days => s.days)
          + make_interval(secs => (s.at * 3600)::double precision)) at time zone 'America/Lima'
  end as at
) p
on conflict (id) do nothing;

insert into public.listing_photos (listing_id, image_url, alt_text, sort_order)
select l.id,
  case when :'photo_base' = '' then 'https://placehold.co/900x700?text=' || replace(s.brand || ' ' || s.model, ' ', '+') || '+' || k
       else :'photo_base' || '/' || s.slug || '-' || k || '.jpg' end,
  'Foto ' || k || ' de ' || s.title, k - 1
from descubrir_seed s
join public.listings l on l.slug = s.slug
cross join generate_series(1, s.photos) k
where not exists (select 1 from public.listing_photos p where p.listing_id = l.id);

commit;
