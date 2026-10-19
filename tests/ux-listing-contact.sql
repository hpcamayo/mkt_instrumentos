-- Effortless Laria, batch "listing", fix-03 (docs/ux-effortless/listing.md): a store's new WhatsApp number reaches its
-- unsold listings, a sold listing keeps its historical number, other stores are untouched, and the trigger function
-- is not callable from the browser roles. Local/test database only. Every fixture is rolled back.
begin;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;

create function pg_temp.phone(p_slug text) returns text language sql security definer as $$
  select whatsapp_phone from public.listings where slug = p_slug
$$;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e1020000-0000-4000-8000-000000000001','authenticated','authenticated','uxlc-owner-a@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño A","phone":"51999992001","city":"Lima","region":"Lima"}'),
 ('e1020000-0000-4000-8000-000000000002','authenticated','authenticated','uxlc-owner-b@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño B","phone":"51999992002","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('e1021000-0000-4000-8000-000000000001','uxlc-a','Tienda Contacto A','Tienda Contacto A SAC','20999992001','uxlc-a@example.invalid','Contacto A','Contacto A','51999992001','Lima','Lima','Av. QA 1','e1020000-0000-4000-8000-000000000001','active','free',true),
 ('e1021000-0000-4000-8000-000000000002','uxlc-b','Tienda Contacto B','Tienda Contacto B SAC','20999992002','uxlc-b@example.invalid','Contacto B','Contacto B','51999992002','Lima','Lima','Av. QA 2','e1020000-0000-4000-8000-000000000002','active','free',true);

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at,sold_at) values
 ('e1022000-0000-4000-8000-000000000001','uxlc-approved','Pedal aprobado','store','approved','pedals','pedals','QA','Uno','Nuevo',300,'Lima','Lima','Contacto A','51999992001','Descripción de inventario válida con más de cuarenta caracteres.','e1020000-0000-4000-8000-000000000001','e1021000-0000-4000-8000-000000000001','self_service',now(),null),
 ('e1022000-0000-4000-8000-000000000002','uxlc-pending','Pedal pendiente','store','pending','pedals','pedals','QA','Dos','Nuevo',300,'Lima','Lima','Contacto A','51999992001','Descripción de inventario válida con más de cuarenta caracteres.','e1020000-0000-4000-8000-000000000001','e1021000-0000-4000-8000-000000000001','self_service',now(),null),
 ('e1022000-0000-4000-8000-000000000003','uxlc-sold','Pedal vendido','store','sold','pedals','pedals','QA','Tres','Nuevo',300,'Lima','Lima','Contacto A','51999992001','Descripción de inventario válida con más de cuarenta caracteres.','e1020000-0000-4000-8000-000000000001','e1021000-0000-4000-8000-000000000001','self_service',now(),now()),
 ('e1022000-0000-4000-8000-000000000004','uxlc-other','Pedal de otra tienda','store','approved','pedals','pedals','QA','Cuatro','Nuevo',300,'Lima','Lima','Contacto B','51999992002','Descripción de inventario válida con más de cuarenta caracteres.','e1020000-0000-4000-8000-000000000002','e1021000-0000-4000-8000-000000000002','self_service',now(),null);

insert into public.listing_photos (listing_id, image_url, sort_order)
select l.id, 'https://example.invalid/' || l.slug || '-' || n || '.jpg', n
from public.listings l cross join generate_series(0, 1) n
where l.slug like 'uxlc-%';

-- The owner changes the store's number through the ordinary store edit (RLS as the owner).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1020000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update public.stores set whatsapp_phone = '51988887777' where id = 'e1021000-0000-4000-8000-000000000001';
reset role;

select pg_temp.check(pg_temp.phone('uxlc-approved') = '51988887777', 'an approved store listing follows the store number');
select pg_temp.check(pg_temp.phone('uxlc-pending') = '51988887777', 'a pending store listing follows the store number');
select pg_temp.check(pg_temp.phone('uxlc-sold') = '51999992001', 'a sold listing keeps its historical number');
select pg_temp.check(pg_temp.phone('uxlc-other') = '51999992002', 'another store''s listings are untouched');
select pg_temp.check(coalesce(current_setting('app.allow_listing_admin_fields', true), '') <> 'true',
  'the listing guard is closed again after the sync');

-- The guard stays closed for the owner: a direct edit of an approved listing's number is still refused.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1020000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  update public.listings set whatsapp_phone = '51900000000' where slug = 'uxlc-approved';
  if found then raise exception 'FAILED: a direct edit of an approved listing''s number succeeded'; end if;
exception when others then
  if sqlerrm like 'FAILED:%' then raise; end if;
end $$;
reset role;
select pg_temp.check(pg_temp.phone('uxlc-approved') = '51988887777', 'the direct edit changed nothing');

select pg_temp.check(not has_function_privilege('authenticated', 'laria_private.sync_store_listing_contact_phone()', 'execute'),
  'the browser cannot call the sync function');
select pg_temp.check(not has_function_privilege('anon', 'laria_private.sync_store_listing_contact_phone()', 'execute'),
  'anonymous visitors cannot call the sync function');

rollback;
