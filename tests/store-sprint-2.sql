-- Laria V1 Sprint 2 store ownership, trust, RLS, visibility, and cap checks.
-- Local/test database only. Every fixture is rolled back.
begin;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('31000000-0000-4000-8000-000000000001','authenticated','authenticated','store-owner-a@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"store_owner","full_name":"Store Owner A","phone":"51999999001","city":"Lima","region":"Lima"}'),
  ('31000000-0000-4000-8000-000000000002','authenticated','authenticated','store-owner-b@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"store_owner","full_name":"Store Owner B","phone":"51999999002","city":"Lima","region":"Lima"}'),
  ('31000000-0000-4000-8000-000000000003','authenticated','authenticated','store-owner-c@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"store_owner","full_name":"Store Owner C","phone":"51999999003","city":"Lima","region":"Lima"}'),
  ('31000000-0000-4000-8000-000000000004','authenticated','authenticated','store-owner-cap@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"store_owner","full_name":"Store Owner Cap","phone":"51999999004","city":"Lima","region":"Lima"}'),
  ('31000000-0000-4000-8000-000000000010','authenticated','authenticated','particular@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"seller","full_name":"Particular QA","phone":"51999999010","city":"Lima","region":"Lima"}');

do $$
declare
  fields jsonb;
  duplicate_denied boolean := false;
begin
  fields := jsonb_build_object(
    'slug','sprint2-tienda-a','name','Tienda A','razon_social','Tienda A SAC','ruc','20111111111',
    'email','ventas-a@example.invalid','contact_person','Contacto A','whatsapp_phone','51999999001',
    'city','Lima','region','Lima','district','Miraflores','address','Av. QA 101',
    'description','Tienda QA A','instagram_url','https://instagram.com/tienda-a',
    'facebook_url','','tiktok_url','','website_url','https://example.invalid/a',
    'owner_user_id','31000000-0000-4000-8000-000000000001'
  );
  perform public.complete_public_submission('32000000-0000-4000-8000-000000000001','store',fields,
    '[{"role":"logo","image_url":"https://example.invalid/logo-a.jpg","alt_text":"Logo"},{"role":"store_photo","image_url":"https://example.invalid/local-a.jpg","alt_text":"Local"}]');
  perform public.complete_public_submission('32000000-0000-4000-8000-000000000001','store',fields,
    '[{"role":"logo","image_url":"https://example.invalid/logo-a.jpg","alt_text":"Logo"},{"role":"store_photo","image_url":"https://example.invalid/local-a.jpg","alt_text":"Local"}]');
  if (select count(*) from public.stores where id='32000000-0000-4000-8000-000000000001') <> 1 then raise exception 'Store submission retry was not idempotent'; end if;
  if (select owner_user_id from public.stores where id='32000000-0000-4000-8000-000000000001') <> '31000000-0000-4000-8000-000000000001' then raise exception 'Store was not bound to its owner'; end if;
  if not public.store_application_is_complete('32000000-0000-4000-8000-000000000001') then raise exception 'Complete application rejected'; end if;
  if (select count(*) from public.store_photos where store_id='32000000-0000-4000-8000-000000000001') <> 1 then raise exception 'Optional physical store photo did not persist'; end if;

  fields := fields || jsonb_build_object('slug','sprint2-tienda-duplicate','owner_user_id','31000000-0000-4000-8000-000000000002');
  begin
    perform public.complete_public_submission('32000000-0000-4000-8000-000000000002','store',fields,'[]');
  exception when unique_violation then duplicate_denied := true;
  end;
  if not duplicate_denied then raise exception 'Duplicate RUC created a second store'; end if;
end;
$$;

-- Every business identity/contact/location field is independently required.
do $$
declare column_name text; original_value text;
begin
  foreach column_name in array array['name','razon_social','ruc','email','whatsapp_phone','address','city','region','contact_person'] loop
    execute format('select %I::text from public.stores where id=$1', column_name)
      into original_value using '32000000-0000-4000-8000-000000000001'::uuid;
    execute format('update public.stores set %I=$1 where id=$2', column_name)
      using case when column_name='ruc' then null else '' end, '32000000-0000-4000-8000-000000000001'::uuid;
    if public.store_application_is_complete('32000000-0000-4000-8000-000000000001') then
      raise exception 'Store application accepted missing required field %', column_name;
    end if;
    execute format('update public.stores set %I=$1 where id=$2', column_name)
      using original_value, '32000000-0000-4000-8000-000000000001'::uuid;
  end loop;
end;
$$;

-- Create additional isolated stores used by verification and cap tests.
insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan)
values
 ('32000000-0000-4000-8000-000000000002','sprint2-tienda-b','Tienda B','Tienda B SAC','20222222222','ventas-b@example.invalid','Contacto B','Contacto B','51999999002','Lima','Lima','Av. QA 202','31000000-0000-4000-8000-000000000002','pending','free'),
 ('32000000-0000-4000-8000-000000000003','sprint2-tienda-c','Tienda C','Tienda C SAC','20333333333','ventas-c@example.invalid','Contacto C','Contacto C','51999999003','Lima','Lima','Av. QA 303','31000000-0000-4000-8000-000000000003','active','free'),
 ('32000000-0000-4000-8000-000000000004','sprint2-tienda-cap','Tienda Cap','Tienda Cap SAC','20444444444','ventas-cap@example.invalid','Contacto Cap','Contacto Cap','51999999004','Lima','Lima','Av. QA 404','31000000-0000-4000-8000-000000000004','pending','free');

-- Separate account types and owner-only RLS/protected authority.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000010","role":"authenticated"}',true);
do $$
declare denied boolean := false; changed integer;
begin
  begin update public.profiles set account_type='store_owner' where id='31000000-0000-4000-8000-000000000010'; exception when others then denied := true; end;
  if not denied then raise exception 'Particular silently converted to Store Owner'; end if;
  with changed as (update public.stores set name='Intrusión' where id='32000000-0000-4000-8000-000000000001' returning 1) select count(*) into changed from changed;
  if changed <> 0 then raise exception 'Particular modified a store application'; end if;
end;
$$;

select set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare denied boolean := false; changed integer;
begin
  if (select count(*) from public.stores where id='32000000-0000-4000-8000-000000000001') <> 1 then raise exception 'Owner cannot read own application'; end if;
  with changed as (update public.stores set description='Descripción editada por el dueño' where id='32000000-0000-4000-8000-000000000001' returning 1) select count(*) into changed from changed;
  if changed <> 1 then raise exception 'Owner cannot edit allowed store fields'; end if;
  with changed as (update public.stores set description='Intrusión de otro dueño' where id='32000000-0000-4000-8000-000000000002' returning 1) select count(*) into changed from changed;
  if changed <> 0 then raise exception 'Store Owner modified another store'; end if;
  begin update public.stores set status='active',is_verified=true,owner_user_id='31000000-0000-4000-8000-000000000002' where id='32000000-0000-4000-8000-000000000001'; exception when others then denied := true; end;
  if not denied then raise exception 'Owner changed protected store authority fields'; end if;
  denied := false;
  begin perform public.review_store_application('32000000-0000-4000-8000-000000000001','approve',null); exception when others then denied := true; end;
  if not denied then raise exception 'Owner self-approved a store'; end if;
  denied := false;
  begin perform public.set_store_verification('32000000-0000-4000-8000-000000000001',true); exception when others then denied := true; end;
  if not denied then raise exception 'Owner self-verified a store'; end if;
end;
$$;

-- Pending owners can submit inventory, but it remains pending.
insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at)
values ('33000000-0000-4000-8000-000000000001','pending-store-item','Pending Store Item','store','pending','guitars','electric_guitar','QA','Model','Nuevo',100,'Lima','Lima','Contacto A','51999999001','Descripción de inventario válida con más de cuarenta caracteres.','31000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','self_service',now());
insert into public.listing_photos (listing_id,image_url,sort_order) values
 ('33000000-0000-4000-8000-000000000001','https://example.invalid/a-front.jpg',0),
 ('33000000-0000-4000-8000-000000000001','https://example.invalid/a-back.jpg',1);
do $$ declare submitted public.listings; begin
  submitted := public.submit_listing_for_publication('33000000-0000-4000-8000-000000000001');
  if submitted.status <> 'pending' then raise exception 'Pending store self-published inventory'; end if;
end $$;

-- Even an administratively approved listing cannot leak while its store is nonpublic.
reset role;
select set_config('app.allow_listing_admin_fields','true',true);
update public.listings set status='approved' where id='33000000-0000-4000-8000-000000000001';
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
  if (select count(*) from public.stores where id='32000000-0000-4000-8000-000000000002') <> 0 then raise exception 'Pending store page was publicly readable'; end if;
  if (select count(*) from public.listings where id='33000000-0000-4000-8000-000000000001') <> 0 then raise exception 'Pending store inventory leaked publicly'; end if;
  if (select count(*) from public.listing_photos where listing_id='33000000-0000-4000-8000-000000000001') <> 0 then raise exception 'Pending store photos leaked publicly'; end if;
end $$;

-- Basic approval/rejection and atomic verification are admin-only operations.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"31999999-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}',true);
do $$
declare denied boolean := false;
begin
  begin perform public.review_store_application('32000000-0000-4000-8000-000000000002','reject',''); exception when others then denied := true; end;
  if not denied then raise exception 'Store rejection without reason succeeded'; end if;
  perform public.review_store_application('32000000-0000-4000-8000-000000000001','approve',null);
  if (select status from public.stores where id='32000000-0000-4000-8000-000000000001') <> 'active' then raise exception 'Basic approval did not activate Tienda'; end if;
  if (select is_verified from public.stores where id='32000000-0000-4000-8000-000000000001') then raise exception 'Basic approval granted verification'; end if;
  perform public.review_store_application('32000000-0000-4000-8000-000000000002','reject','RUC no legible');
  if (select status from public.stores where id='32000000-0000-4000-8000-000000000002') <> 'rejected' or (select rejection_reason from public.stores where id='32000000-0000-4000-8000-000000000002') <> 'RUC no legible' then raise exception 'Rejection state/reason failed'; end if;
end;
$$;

-- An invalid pending row aborts verification without setting the trust flag.
reset role;
insert into public.listings (id,slug,title,seller_type,status,category,city,region,whatsapp_phone,owner_user_id,store_id)
values ('33000000-0000-4000-8000-000000000010','atomic-invalid','Atomic invalid','store','pending','guitars','Lima','Lima','51999999001','31000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"31999999-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}',true);
do $$ declare denied boolean := false; begin
  begin perform public.set_store_verification('32000000-0000-4000-8000-000000000001',true); exception when others then denied := true; end;
  if not denied then raise exception 'Malformed pending inventory allowed verification'; end if;
  if (select is_verified from public.stores where id='32000000-0000-4000-8000-000000000001') then raise exception 'Failed verification left a half-verified store'; end if;
end $$;
reset role;
delete from public.listings where id='33000000-0000-4000-8000-000000000010';

-- A normal Tienda remains moderated, and active-parent public visibility works.
insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at)
values ('33000000-0000-4000-8000-000000000009','normal-store-item','Normal Store Item','store','pending','guitars','electric_guitar','QA','Normal','Nuevo',100,'Lima','Lima','Contacto A','51999999001','Descripción válida de una Tienda normal que requiere moderación.','31000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','self_service',now());
insert into public.listing_photos (listing_id,image_url,sort_order) values ('33000000-0000-4000-8000-000000000009','https://example.invalid/normal-1.jpg',0),('33000000-0000-4000-8000-000000000009','https://example.invalid/normal-2.jpg',1);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare submitted public.listings; begin
  submitted := public.submit_listing_for_publication('33000000-0000-4000-8000-000000000009');
  if submitted.status <> 'pending' then raise exception 'Normal Tienda directly published inventory'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
  if (select count(*) from public.listings where id='33000000-0000-4000-8000-000000000001') <> 1 then raise exception 'Active Tienda approved inventory was not public'; end if;
  if (select count(*) from public.listings where id='33000000-0000-4000-8000-000000000009') <> 0 then raise exception 'Active Tienda pending inventory was public'; end if;
end $$;

-- Pending/rejected/hidden/sold state preservation during verification.
reset role;
insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at)
values
 ('33000000-0000-4000-8000-000000000011','verify-pending','Verify pending','store','pending','guitars','electric_guitar','QA','Valid','Nuevo',100,'Lima','Lima','Contacto C','51999999003','Descripción válida de tienda para verificar publicación atómica.','31000000-0000-4000-8000-000000000003','32000000-0000-4000-8000-000000000003','self_service',now()),
 ('33000000-0000-4000-8000-000000000012','verify-rejected','Verify rejected','store','rejected','guitars','electric_guitar','QA','Rejected','Nuevo',100,'Lima','Lima','Contacto C','51999999003','Descripción rechazada que debe permanecer sin modificación.','31000000-0000-4000-8000-000000000003','32000000-0000-4000-8000-000000000003','self_service',now()),
 ('33000000-0000-4000-8000-000000000013','verify-hidden','Verify hidden','store','hidden','guitars','electric_guitar','QA','Hidden','Nuevo',100,'Lima','Lima','Contacto C','51999999003','Descripción oculta que debe permanecer sin modificación.','31000000-0000-4000-8000-000000000003','32000000-0000-4000-8000-000000000003','self_service',now()),
 ('33000000-0000-4000-8000-000000000014','verify-sold','Verify sold','store','sold','guitars','electric_guitar','QA','Sold','Nuevo',100,'Lima','Lima','Contacto C','51999999003','Descripción vendida que debe permanecer sin modificación.','31000000-0000-4000-8000-000000000003','32000000-0000-4000-8000-000000000003','self_service',now());
insert into public.listing_photos (listing_id,image_url,sort_order)
select '33000000-0000-4000-8000-000000000011', 'https://example.invalid/verify-'||n||'.jpg', n from generate_series(0,1)n;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"31999999-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}',true);
do $$ begin
  perform public.set_store_verification('32000000-0000-4000-8000-000000000003',true);
  if not (select is_verified from public.stores where id='32000000-0000-4000-8000-000000000003') then raise exception 'Verification flag was not set'; end if;
  if (select status from public.listings where id='33000000-0000-4000-8000-000000000011') <> 'approved' then raise exception 'Pending inventory was not approved'; end if;
  if (select published_at from public.listings where id='33000000-0000-4000-8000-000000000011') is null then raise exception 'First publication timestamp missing'; end if;
  if (select status from public.listings where id='33000000-0000-4000-8000-000000000012') <> 'rejected' or (select status from public.listings where id='33000000-0000-4000-8000-000000000013') <> 'hidden' or (select status from public.listings where id='33000000-0000-4000-8000-000000000014') <> 'sold' then raise exception 'Verification changed nonpending inventory'; end if;
end $$;

-- Verified direct publication, then revocation restores moderation without hiding approved inventory.
reset role;
insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at)
values ('33000000-0000-4000-8000-000000000015','verified-new','Verified new','store','pending','guitars','electric_guitar','QA','Direct','Nuevo',100,'Lima','Lima','Contacto C','51999999003','Descripción válida de inventario nuevo de Tienda Verificada.','31000000-0000-4000-8000-000000000003','32000000-0000-4000-8000-000000000003','self_service',now());
insert into public.listing_photos (listing_id,image_url,sort_order) values ('33000000-0000-4000-8000-000000000015','https://example.invalid/direct-1.jpg',0),('33000000-0000-4000-8000-000000000015','https://example.invalid/direct-2.jpg',1);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare submitted public.listings; begin
  submitted := public.submit_listing_for_publication('33000000-0000-4000-8000-000000000015');
  if submitted.status <> 'approved' then raise exception 'Verified store did not directly publish valid inventory'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"31999999-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}',true);
select public.set_store_verification('32000000-0000-4000-8000-000000000003',false);
do $$ begin
  if (select status from public.stores where id='32000000-0000-4000-8000-000000000003') <> 'active' then raise exception 'Revocation hid approved Tienda'; end if;
  if (select status from public.listings where id='33000000-0000-4000-8000-000000000015') <> 'approved' then raise exception 'Revocation hid approved inventory'; end if;
end $$;

reset role;
insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at)
values ('33000000-0000-4000-8000-000000000016','revoked-new','Revoked new','store','pending','guitars','electric_guitar','QA','Moderated','Nuevo',100,'Lima','Lima','Contacto C','51999999003','Descripción válida posterior a revocar la verificación de tienda.','31000000-0000-4000-8000-000000000003','32000000-0000-4000-8000-000000000003','self_service',now());
insert into public.listing_photos (listing_id,image_url,sort_order) values ('33000000-0000-4000-8000-000000000016','https://example.invalid/revoked-1.jpg',0),('33000000-0000-4000-8000-000000000016','https://example.invalid/revoked-2.jpg',1);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare submitted public.listings; begin
  submitted := public.submit_listing_for_publication('33000000-0000-4000-8000-000000000016');
  if submitted.status <> 'pending' then raise exception 'Revoked store kept direct-publication privilege'; end if;
end $$;

-- Cap: the 50th counted listing succeeds, the 51st and a restore both fail.
reset role;
insert into public.listings (slug,title,seller_type,status,category,city,region,whatsapp_phone,owner_user_id,store_id)
select 'cap-'||n, 'Cap '||n, 'store', case when n%2=0 then 'pending'::public.listing_status else 'approved'::public.listing_status end, 'guitars','Lima','Lima','51999999004','31000000-0000-4000-8000-000000000004','32000000-0000-4000-8000-000000000004'
from generate_series(1,50)n;
insert into public.listings (id,slug,title,seller_type,status,category,city,region,whatsapp_phone,owner_user_id,store_id)
values ('33000000-0000-4000-8000-000000000099','cap-hidden','Cap hidden','store','hidden','guitars','Lima','Lima','51999999004','31000000-0000-4000-8000-000000000004','32000000-0000-4000-8000-000000000004');
do $$
declare denied boolean := false; restore_denied boolean := false;
begin
  if (select count(*) from public.listings where store_id='32000000-0000-4000-8000-000000000004' and status in ('pending','approved')) <> 50 then raise exception '49 to 50 boundary failed'; end if;
  begin insert into public.listings (slug,title,seller_type,status,category,city,region,whatsapp_phone,owner_user_id,store_id) values ('cap-51','Cap 51','store','pending','guitars','Lima','Lima','51999999004','31000000-0000-4000-8000-000000000004','32000000-0000-4000-8000-000000000004'); exception when others then denied := sqlerrm like 'STORE_INVENTORY_LIMIT_REACHED%'; end;
  if not denied then raise exception 'The 51st concurrent listing succeeded'; end if;
  begin perform set_config('app.allow_listing_admin_fields','true',true); update public.listings set status='pending' where id='33000000-0000-4000-8000-000000000099'; exception when others then restore_denied := sqlerrm like 'STORE_INVENTORY_LIMIT_REACHED%'; end;
  if not restore_denied then raise exception 'Counted-state restoration bypassed the cap'; end if;
end $$;

-- Leaving counted states frees capacity for a replacement.
update public.listings set status='sold' where slug='cap-1';
insert into public.listings (slug,title,seller_type,status,category,city,region,whatsapp_phone,owner_user_id,store_id)
values ('cap-sold-replacement','Sold replacement','store','pending','guitars','Lima','Lima','51999999004','31000000-0000-4000-8000-000000000004','32000000-0000-4000-8000-000000000004');
update public.listings set status='hidden' where slug='cap-2';
insert into public.listings (slug,title,seller_type,status,category,city,region,whatsapp_phone,owner_user_id,store_id)
values ('cap-hidden-replacement','Hidden replacement','store','pending','guitars','Lima','Lima','51999999004','31000000-0000-4000-8000-000000000004','32000000-0000-4000-8000-000000000004');

-- Noncounted states and Particular inventory do not consume store capacity.
insert into public.listings (slug,title,seller_type,status,category,city,region,whatsapp_phone,owner_user_id,store_id)
select 'noncount-'||n, 'Noncount '||n, 'store', (array['sold','rejected','archived','hidden']::public.listing_status[])[1+((n-1)%4)], 'guitars','Lima','Lima','51999999004','31000000-0000-4000-8000-000000000004','32000000-0000-4000-8000-000000000004' from generate_series(1,20)n;
insert into public.listings (slug,title,seller_type,status,category,city,region,whatsapp_phone,owner_user_id)
select 'particular-cap-'||n, 'Particular '||n, 'individual','pending','guitars','Lima','Lima','51999999010','31000000-0000-4000-8000-000000000010' from generate_series(1,51)n;

rollback;
