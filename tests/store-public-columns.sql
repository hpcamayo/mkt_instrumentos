-- Store data exposure: the public reads only the store columns public pages use.
-- Local/test database only. Every fixture is rolled back.
begin;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('9a000000-0000-4000-8000-000000000001','authenticated','authenticated','cols-owner@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"store_owner","full_name":"Dueño Columnas","phone":"51999999101","city":"Lima","region":"Lima"}'),
  ('9a000000-0000-4000-8000-000000000002','authenticated','authenticated','cols-buyer@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"seller","full_name":"Comprador Columnas","phone":"51999999102","city":"Lima","region":"Lima"}');

insert into public.stores (id, slug, name, status, city, region, district, address, whatsapp_phone, contact_name, contact_person,
  razon_social, ruc, email, description, owner_user_id, is_verified, listing_plan)
values ('9b000000-0000-4000-8000-000000000001','cols-tienda','Tienda Columnas','pending','Lima','Lima','Miraflores','Av. Privada 123',
  '51999999101','Contacto Legado','Persona Privada','Columnas SAC','20999999991','privado@example.invalid','Tienda de prueba',
  '9a000000-0000-4000-8000-000000000001',false,'free');
select set_config('app.allow_store_admin_fields','true',true);
update public.stores set status='active' where id='9b000000-0000-4000-8000-000000000001';
select set_config('app.allow_store_admin_fields','',true);

create temporary table private_store_columns(name text) on commit drop;
insert into private_store_columns values
  ('ruc'),('razon_social'),('email'),('contact_person'),('contact_name'),('address'),('rejection_reason'),('listing_plan');
grant select on private_store_columns to anon, authenticated;

-- Visitors (anon): public columns yes, private columns and owner id no.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$
declare
  col text;
  denied boolean;
begin
  if (select name from public.stores where slug='cols-tienda') <> 'Tienda Columnas' then
    raise exception 'Visitor cannot read a public store column';
  end if;
  if (select count(*) from public.stores where slug='cols-tienda' and whatsapp_phone='51999999101' and district='Miraflores') <> 1 then
    raise exception 'Visitor cannot read the columns the store page uses';
  end if;
  for col in select name from private_store_columns union all select 'owner_user_id' loop
    denied := false;
    begin
      execute format('select %I from public.stores where slug = %L', col, 'cols-tienda');
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'Visitor read private store column %', col; end if;
  end loop;
  denied := false;
  begin perform * from public.stores where slug='cols-tienda'; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Visitor read every store column with select *'; end if;
  denied := false;
  begin perform public.get_own_store(); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Visitor could call get_own_store'; end if;
end $$;

-- A signed-in buyer: same as a visitor, plus owner_user_id (owners filter on it to find their store).
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"9a000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  col text;
  denied boolean;
begin
  if (select owner_user_id from public.stores where slug='cols-tienda') <> '9a000000-0000-4000-8000-000000000001' then
    raise exception 'Signed-in user cannot read owner_user_id';
  end if;
  for col in select name from private_store_columns loop
    denied := false;
    begin
      execute format('select %I from public.stores where slug = %L', col, 'cols-tienda');
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'Signed-in user read private store column %', col; end if;
  end loop;
  if exists (select 1 from public.get_own_store()) then raise exception 'get_own_store returned another user''s store'; end if;
  denied := false;
  begin perform public.admin_get_store('9b000000-0000-4000-8000-000000000001'); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Non-admin read a store through admin_get_store'; end if;
end $$;

-- The owner: every field of their own store through get_own_store, and profile edits still work.
select set_config('request.jwt.claims','{"sub":"9a000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare changed integer;
begin
  if (select ruc || '|' || email || '|' || address || '|' || razon_social from public.get_own_store())
     <> '20999999991|privado@example.invalid|Av. Privada 123|Columnas SAC' then
    raise exception 'Owner cannot read their private store fields';
  end if;
  if (select id from public.stores where owner_user_id = '9a000000-0000-4000-8000-000000000001') <> '9b000000-0000-4000-8000-000000000001' then
    raise exception 'Owner cannot find their store by owner_user_id';
  end if;
  update public.stores set description='Descripción editada', address='Av. Nueva 456' where id='9b000000-0000-4000-8000-000000000001';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Owner cannot edit their store profile'; end if;
  if (select address from public.get_own_store()) <> 'Av. Nueva 456' then raise exception 'Owner edit of a private field was lost'; end if;
end $$;

-- Admin: every field through admin_get_store.
select set_config('request.jwt.claims','{"sub":"9a000000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal2","app_metadata":{"role":"admin"}}',true);
do $$
begin
  if (select ruc from public.admin_get_store('9b000000-0000-4000-8000-000000000001')) <> '20999999991' then
    raise exception 'Admin cannot read private store fields';
  end if;
end $$;

reset role;
select 'store public columns: visitors and signed-in users read only public store columns' as result;
rollback;
