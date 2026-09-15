-- Laria V1 Sprint 3 lifecycle, revision, RLS, history, and cap checks.
-- Local/test database only. Every fixture is rolled back.
begin;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('41000000-0000-4000-8000-000000000001','authenticated','authenticated','s3-owner@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"seller","full_name":"Sprint 3 Owner","phone":"51999999101","city":"Lima","region":"Lima"}'),
  ('41000000-0000-4000-8000-000000000002','authenticated','authenticated','s3-other@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"seller","full_name":"Sprint 3 Other","phone":"51999999102","city":"Lima","region":"Lima"}'),
  ('41000000-0000-4000-8000-000000000003','authenticated','authenticated','s3-store@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"store_owner","full_name":"Sprint 3 Store","phone":"51999999103","city":"Lima","region":"Lima"}'),
  ('41000000-0000-4000-8000-000000000004','authenticated','authenticated','s3-verified@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"store_owner","full_name":"Sprint 3 Verified","phone":"51999999104","city":"Lima","region":"Lima"}'),
  ('41000000-0000-4000-8000-000000000005','authenticated','authenticated','s3-cap@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"store_owner","full_name":"Sprint 3 Cap","phone":"51999999105","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,is_verified,listing_plan)
values
 ('42000000-0000-4000-8000-000000000003','s3-normal-store','S3 Normal','S3 Normal SAC','20555555551','normal@example.invalid','Contacto Normal','Contacto Normal','51999999103','Lima','Lima','Av. S3 103','41000000-0000-4000-8000-000000000003','active',false,'free'),
 ('42000000-0000-4000-8000-000000000004','s3-verified-store','S3 Verificada','S3 Verificada SAC','20555555552','verified@example.invalid','Contacto Verificado','Contacto Verificado','51999999104','Lima','Lima','Av. S3 104','41000000-0000-4000-8000-000000000004','active',true,'free'),
 ('42000000-0000-4000-8000-000000000005','s3-cap-store','S3 Cap','S3 Cap SAC','20555555553','cap@example.invalid','Contacto Cap','Contacto Cap','51999999105','Lima','Lima','Av. S3 105','41000000-0000-4000-8000-000000000005','active',false,'free');

insert into public.listings (
  id,slug,title,seller_type,status,category,instrument_type,attributes,brand,model,
  condition,price_pen,city,region,contact_name,whatsapp_phone,description,
  owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at,published_at
) values
 ('43000000-0000-4000-8000-000000000001','s3-particular-live','Título público original','individual','approved','guitars','electric_guitar','{"body_type":"solid_body"}','Marca vieja','Modelo viejo','Usado - buen estado',1000,'Lima','Lima','Sprint 3 Owner','51999999101','Descripción pública válida con bastante detalle para superar cuarenta caracteres.','41000000-0000-4000-8000-000000000001',null,'self_service',now(),now()),
 ('43000000-0000-4000-8000-000000000002','s3-admin-hidden','Ocultada admin','individual','approved','guitars','electric_guitar','{}','Marca','Modelo','Usado - buen estado',800,'Lima','Lima','Sprint 3 Owner','51999999101','Descripción pública válida para probar una ocultación administrativa.','41000000-0000-4000-8000-000000000001',null,'self_service',now(),now()),
 ('43000000-0000-4000-8000-000000000003','s3-normal-live','Producto tienda normal','store','approved','guitars','electric_guitar','{}','Marca','Normal','Nuevo',1200,'Lima','Lima','Contacto Normal','51999999103','Descripción válida para la publicación de una tienda normal en Sprint tres.','41000000-0000-4000-8000-000000000003','42000000-0000-4000-8000-000000000003','self_service',now(),now()),
 ('43000000-0000-4000-8000-000000000004','s3-verified-live','Producto tienda verificada','store','approved','guitars','electric_guitar','{}','Marca','Verificado','Nuevo',1400,'Lima','Lima','Contacto Verificado','51999999104','Descripción válida para una edición directa de tienda verificada.','41000000-0000-4000-8000-000000000004','42000000-0000-4000-8000-000000000004','self_service',now(),now()),
 ('43000000-0000-4000-8000-000000000005','s3-pending-approve','Pendiente para aprobar','individual','pending','guitars','electric_guitar','{}','Marca','Aprobar','Usado - buen estado',700,'Lima','Lima','Sprint 3 Owner','51999999101','Descripción válida de una publicación pendiente que será aprobada.','41000000-0000-4000-8000-000000000001',null,'self_service',now(),null),
 ('43000000-0000-4000-8000-000000000006','s3-pending-reject','Pendiente para rechazar','individual','pending','guitars','electric_guitar','{}','Marca','Rechazar','Usado - buen estado',750,'Lima','Lima','Sprint 3 Owner','51999999101','Descripción válida de una publicación pendiente que será rechazada.','41000000-0000-4000-8000-000000000001',null,'self_service',now(),null);

insert into public.listing_photos (listing_id,image_url,sort_order)
select listing_id, 'https://example.invalid/' || listing_id || '-' || n || '.jpg', n
from (values
 ('43000000-0000-4000-8000-000000000001'::uuid),
 ('43000000-0000-4000-8000-000000000002'::uuid),
 ('43000000-0000-4000-8000-000000000003'::uuid),
 ('43000000-0000-4000-8000-000000000004'::uuid),
 ('43000000-0000-4000-8000-000000000005'::uuid),
 ('43000000-0000-4000-8000-000000000006'::uuid)
) listings(listing_id)
cross join generate_series(0,1) n;

-- Owner lifecycle and owner/admin hide distinction.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare changed_count integer; denied boolean := false;
begin
  with changed as (
    update public.listings set title = 'Bypass no permitido'
    where id = '43000000-0000-4000-8000-000000000001' returning 1
  ) select count(*) into changed_count from changed;
  if changed_count <> 0 then raise exception 'Owner bypassed the validated listing edit RPC'; end if;

  begin
    insert into public.listing_photos (listing_id,image_url,sort_order)
    values ('43000000-0000-4000-8000-000000000001','https://example.invalid/bypass.jpg',2);
  exception when others then denied := true;
  end;
  if not denied then raise exception 'Owner bypassed the validated photo edit RPC'; end if;

  with changed as (
    delete from public.listing_photos
    where listing_id = '43000000-0000-4000-8000-000000000001' returning 1
  ) select count(*) into changed_count from changed;
  if changed_count <> 0 then raise exception 'Owner deleted immutable live photo rows directly'; end if;
end;
$$;

do $$
declare result public.listings; denied boolean := false;
begin
  result := public.set_owned_listing_lifecycle('43000000-0000-4000-8000-000000000001','hide');
  if result.status <> 'hidden' or result.hidden_source <> 'owner' or result.hidden_at is null then
    raise exception 'LIFE-003 owner hide did not retain its source';
  end if;
  if public.listing_is_public(result.id) then raise exception 'Owner-hidden listing remained public'; end if;
  result := public.set_owned_listing_lifecycle(result.id,'restore');
  if result.status <> 'approved' or result.hidden_source is not null then raise exception 'LIFE-004 owner restore failed'; end if;
  begin perform public.set_owned_listing_lifecycle('43000000-0000-4000-8000-000000000002','hide');
  exception when others then denied := true; end;
  if denied then raise exception 'Owner could not hide its second approved listing'; end if;
end;
$$;

select set_config('request.jwt.claims','{"sub":"41999999-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}',true);
do $$ declare denied boolean := false; begin
  perform public.review_listing('43000000-0000-4000-8000-000000000005','approve',null);
  if (select status <> 'approved' or published_at is null from public.listings where id='43000000-0000-4000-8000-000000000005') then raise exception 'LIFE-001 admin approval failed'; end if;
  begin perform public.review_listing('43000000-0000-4000-8000-000000000006','reject',''); exception when others then denied := true; end;
  if not denied then raise exception 'ADMIN-010 listing rejection without reason succeeded'; end if;
  perform public.review_listing('43000000-0000-4000-8000-000000000006','reject','Las fotos no permiten validar el estado');
  if (select status <> 'rejected' or rejection_reason is null from public.listings where id='43000000-0000-4000-8000-000000000006') then raise exception 'LIFE-002 admin rejection failed'; end if;
  if public.listing_is_public('43000000-0000-4000-8000-000000000006') then raise exception 'Rejected listing became public'; end if;
end $$;
select public.review_listing('43000000-0000-4000-8000-000000000002','restore',null);
select public.review_listing('43000000-0000-4000-8000-000000000002','hide','Contenido prohibido');

select set_config('request.jwt.claims','{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare denied boolean := false; begin
  if (select rejection_reason from public.listings where id='43000000-0000-4000-8000-000000000006') <> 'Las fotos no permiten validar el estado' then raise exception 'ADMIN-011 owner cannot see listing rejection reason'; end if;
  begin perform public.set_owned_listing_lifecycle('43000000-0000-4000-8000-000000000002','restore');
  exception when others then denied := sqlerrm like 'LISTING_RESTORE_INVALID%'; end;
  if not denied then raise exception 'Owner restored an admin-hidden listing'; end if;
end $$;

-- Mixed immediate/moderated edit: live price changes while old title/photos remain.
do $$
declare result jsonb; revision_id uuid; denied boolean := false;
begin
  begin
    perform public.update_owned_listing(
      '43000000-0000-4000-8000-000000000001',
      '{}', '{}',
      '[{"image_url":"https://attacker.invalid/not-owned-1.jpg"},{"image_url":"https://attacker.invalid/not-owned-2.jpg"}]'
    );
  exception when others then denied := sqlerrm like 'LISTING_PHOTO_INVALID%'; end;
  if not denied then raise exception 'Direct RPC accepted unowned proposed photos'; end if;
  denied := false;
  result := public.update_owned_listing(
    '43000000-0000-4000-8000-000000000001',
    '{"price_pen":900,"description":"Descripción inmediata actualizada y suficientemente larga para seguir publicada."}',
    '{"title":"Título propuesto","brand":"Marca nueva","condition":"Usado - con detalles"}',
    '[{"image_url":"https://example.invalid/43000000-0000-4000-8000-000000000001-1.jpg"},{"image_url":"https://example.invalid/43000000-0000-4000-8000-000000000001-0.jpg"}]'
  );
  revision_id := (result->>'revision_id')::uuid;
  if result->>'mode' <> 'revision' or revision_id is null then raise exception 'REV-011 mixed edit did not create revision'; end if;
  if (select price_pen from public.listings where id='43000000-0000-4000-8000-000000000001') <> 900 then raise exception 'REV-001 immediate price did not apply'; end if;
  if (select title from public.listings where id='43000000-0000-4000-8000-000000000001') <> 'Título público original' then raise exception 'Pending title leaked to live row'; end if;
  if (select condition from public.listings where id='43000000-0000-4000-8000-000000000001') <> 'Usado - buen estado' then raise exception 'Pending condition leaked to live row'; end if;
  if (select image_url from public.listing_photos where listing_id='43000000-0000-4000-8000-000000000001' order by sort_order limit 1) like '%-1.jpg' then raise exception 'Pending photo order leaked to live row'; end if;
  if not public.listing_is_public('43000000-0000-4000-8000-000000000001') then raise exception 'Pending revision removed the approved live version'; end if;
  begin perform public.update_owned_listing('43000000-0000-4000-8000-000000000001','{}','{"model":"Segundo cambio"}',null);
  exception when others then denied := sqlerrm like 'LISTING_REVISION_ALREADY_PENDING%'; end;
  if not denied then raise exception 'REV-014 second pending revision was accepted'; end if;
  perform public.set_owned_listing_lifecycle('43000000-0000-4000-8000-000000000001','hide');
  if public.listing_is_public('43000000-0000-4000-8000-000000000001') then raise exception 'Owner hide with a pending revision remained public'; end if;
  if not exists (select 1 from public.listing_revisions where id=revision_id and status='pending') then raise exception 'Owner hide incorrectly resolved the pending revision'; end if;
end;
$$;

-- Public callers cannot read pending revision content or proposed photos.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
  if (select count(*) from public.listing_revisions) <> 0 then raise exception 'Public caller read listing revisions'; end if;
  if (select count(*) from public.listing_revision_photos) <> 0 then raise exception 'Public caller read revision photos'; end if;
end $$;

-- Admin approval patches moderated fields only and preserves later immediate price.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.update_owned_listing('43000000-0000-4000-8000-000000000001','{"price_pen":875}','{}',null);
select set_config('request.jwt.claims','{"sub":"41999999-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}',true);
do $$ declare revision_id uuid; begin
  select id into revision_id from public.listing_revisions where listing_id='43000000-0000-4000-8000-000000000001' and status='pending';
  perform public.review_listing_revision(revision_id,'approve',null);
  if (select title from public.listings where id='43000000-0000-4000-8000-000000000001') <> 'Título propuesto' then raise exception 'REV-012 title patch failed'; end if;
  if (select condition from public.listings where id='43000000-0000-4000-8000-000000000001') <> 'Usado - con detalles' then raise exception 'Approved condition revision was not promoted'; end if;
  if (select price_pen from public.listings where id='43000000-0000-4000-8000-000000000001') <> 875 then raise exception 'Revision approval overwrote later immediate price'; end if;
  if (select image_url from public.listing_photos where listing_id='43000000-0000-4000-8000-000000000001' order by sort_order limit 1) <> 'https://example.invalid/43000000-0000-4000-8000-000000000001-1.jpg' then raise exception 'Approved photos were not applied'; end if;
  if (select status <> 'hidden' or hidden_source <> 'owner' from public.listings where id='43000000-0000-4000-8000-000000000001') then raise exception 'Revision approval undid owner hide'; end if;
end $$;

-- Rejected revisions retain a mandatory reason while live values stay unchanged.
select set_config('request.jwt.claims','{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.set_owned_listing_lifecycle('43000000-0000-4000-8000-000000000001','restore');
do $$ declare result jsonb; begin
  result := public.update_owned_listing(
    '43000000-0000-4000-8000-000000000001',
    '{"city":"Cusco","region":"Cusco","attributes":{"strings":"5"}}',
    '{"category":"basses","instrument_type":"bass"}',
    null
  );
  if result->>'mode' <> 'revision' then raise exception 'Category/type edit did not create a revision'; end if;
  if (select city <> 'Cusco' or category <> 'guitars' or instrument_type <> 'electric_guitar' or attributes ? 'strings' from public.listings where id='43000000-0000-4000-8000-000000000001') then
    raise exception 'Dependent attributes leaked before the type revision was approved';
  end if;
end $$;
select set_config('request.jwt.claims','{"sub":"41999999-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}',true);
do $$ declare revision_id uuid; begin
  select id into revision_id from public.listing_revisions where listing_id='43000000-0000-4000-8000-000000000001' and status='pending';
  perform public.review_listing_revision(revision_id,'approve',null);
  if (select category <> 'basses' or instrument_type <> 'bass' or attributes->>'strings' <> '5' from public.listings where id='43000000-0000-4000-8000-000000000001') then
    raise exception 'Category/type revision did not atomically promote compatible attributes';
  end if;
end $$;
select set_config('request.jwt.claims','{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.update_owned_listing('43000000-0000-4000-8000-000000000001','{}','{"model":"Modelo rechazado","condition":"Nuevo"}',null);
select set_config('request.jwt.claims','{"sub":"41999999-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}',true);
do $$ declare revision_id uuid; denied boolean := false; begin
  select id into revision_id from public.listing_revisions where listing_id='43000000-0000-4000-8000-000000000001' and status='pending';
  begin perform public.review_listing_revision(revision_id,'reject',''); exception when others then denied := true; end;
  if not denied then raise exception 'REV-013 revision rejection without reason succeeded'; end if;
  perform public.review_listing_revision(revision_id,'reject','El modelo no coincide con las fotos');
  if (select model from public.listings where id='43000000-0000-4000-8000-000000000001') <> 'Modelo viejo' then raise exception 'Rejected revision mutated live row'; end if;
  if (select condition from public.listings where id='43000000-0000-4000-8000-000000000001') <> 'Usado - con detalles' then raise exception 'Rejected condition revision mutated live row'; end if;
end $$;

-- Normal Tienda revisions; verified Tienda edits directly; revocation affects future edits.
select set_config('request.jwt.claims','{"sub":"41000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare result jsonb; begin
  result := public.update_owned_listing('43000000-0000-4000-8000-000000000003','{}','{"title":"Normal propuesto","condition":"Usado - buen estado"}',null);
  if result->>'mode' <> 'revision' then raise exception 'REV-015 normal Tienda bypassed moderation'; end if;
  if (select condition from public.listings where id='43000000-0000-4000-8000-000000000003') <> 'Nuevo' then raise exception 'Normal Tienda leaked pending condition'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"41999999-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}',true);
select public.set_store_verification('42000000-0000-4000-8000-000000000003',true);
do $$ declare revision_id uuid; begin
  select id into revision_id from public.listing_revisions where listing_id='43000000-0000-4000-8000-000000000003' and status='pending';
  if revision_id is null then raise exception 'Store verification auto-resolved an existing edit revision'; end if;
  perform public.review_listing('43000000-0000-4000-8000-000000000003','hide','Revisión administrativa de inventario');
  perform public.review_listing_revision(revision_id,'approve',null);
  if (select status <> 'hidden' or hidden_source <> 'admin' or title <> 'Normal propuesto' or condition <> 'Usado - buen estado' from public.listings where id='43000000-0000-4000-8000-000000000003') then
    raise exception 'Revision approval undid an administrative hide';
  end if;
  perform public.set_store_verification('42000000-0000-4000-8000-000000000003',false);
end $$;

select set_config('request.jwt.claims','{"sub":"41000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ declare result jsonb; begin
  result := public.update_owned_listing('43000000-0000-4000-8000-000000000004','{}','{"title":"Verificada directa","condition":"Usado - con detalles"}',null);
  if result->>'mode' <> 'direct' or (select title <> 'Verificada directa' or condition <> 'Usado - con detalles' from public.listings where id='43000000-0000-4000-8000-000000000004') then
    raise exception 'REV-016 verified Tienda did not edit directly';
  end if;
end $$;

select set_config('request.jwt.claims','{"sub":"41999999-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}',true);
select public.set_store_verification('42000000-0000-4000-8000-000000000004',false);
select set_config('request.jwt.claims','{"sub":"41000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ declare result jsonb; begin
  result := public.update_owned_listing('43000000-0000-4000-8000-000000000004','{}','{"model":"Revocado moderado"}',null);
  if result->>'mode' <> 'revision' then raise exception 'Revoked store kept revision bypass'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"41999999-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}',true);
select public.set_store_verification('42000000-0000-4000-8000-000000000004',true);
do $$ begin
  if not exists (select 1 from public.listing_revisions where listing_id='43000000-0000-4000-8000-000000000004' and status='pending') then
    raise exception 'Verification auto-approved an existing pending edit revision';
  end if;
end $$;
select set_config('request.jwt.claims','{"sub":"41000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ declare result jsonb; begin
  result := public.update_owned_listing('43000000-0000-4000-8000-000000000004','{}','{"model":"Verificada posterior"}',null);
  if result->>'mode' <> 'direct' then raise exception 'Future verified edit did not apply directly'; end if;
  if exists (select 1 from public.listing_revisions where listing_id='43000000-0000-4000-8000-000000000004' and status='pending') then
    raise exception 'Superseded pending revision could still overwrite a later verified edit';
  end if;
  if not exists (select 1 from public.listing_revisions where listing_id='43000000-0000-4000-8000-000000000004' and status='cancelled') then
    raise exception 'Superseded verified-store revision history was not retained';
  end if;
  perform public.set_owned_listing_lifecycle('43000000-0000-4000-8000-000000000004','sold');
end $$;

-- Sold cancels a pending revision, keeps a direct-history identity, and is immutable.
select set_config('request.jwt.claims','{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.update_owned_listing('43000000-0000-4000-8000-000000000001','{}','{"model":"Pendiente al vender"}',null);
do $$
declare sold public.listings; copy public.listings; original_photo text; denied boolean := false;
begin
  select image_url into original_photo from public.listing_photos where listing_id='43000000-0000-4000-8000-000000000001' order by sort_order limit 1;
  sold := public.set_owned_listing_lifecycle('43000000-0000-4000-8000-000000000001','sold');
  if sold.status <> 'sold' or sold.sold_at is null then raise exception 'LIFE-005 sold transition failed'; end if;
  if exists (select 1 from public.listing_revisions where listing_id=sold.id and status='pending') then raise exception 'Pending revision survived sold transition'; end if;
  if public.listing_is_public(sold.id) then raise exception 'LIFE-007 sold listing remained publicly browseable'; end if;
  begin perform public.update_owned_listing(sold.id,'{"price_pen":1}','{}',null); exception when others then denied := true; end;
  if not denied then raise exception 'LIFE-008 sold listing was editable'; end if;
  copy := public.relist_sold_listing(sold.id);
  if copy.id = sold.id or copy.slug = sold.slug or copy.status <> 'pending' or copy.relisted_from_listing_id <> sold.id then raise exception 'LIFE-009 Particular relist copy invalid'; end if;
  if (select image_url from public.listing_photos where listing_id=copy.id order by sort_order limit 1) <> original_photo then raise exception 'Relist did not preserve safe photo reference'; end if;
end;
$$;

-- Unrelated owners cannot read/manage nonpublic lifecycle rows or revisions.
select set_config('request.jwt.claims','{"sub":"41000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare denied boolean := false; begin
  if (select count(*) from public.listings where id='43000000-0000-4000-8000-000000000001') <> 0 then raise exception 'Unrelated owner read sold listing'; end if;
  if (select count(*) from public.listing_revisions where listing_id='43000000-0000-4000-8000-000000000001') <> 0 then raise exception 'Unrelated owner read revision history'; end if;
  begin perform public.relist_sold_listing('43000000-0000-4000-8000-000000000001'); exception when others then denied := true; end;
  if not denied then raise exception 'Unrelated owner relisted sold inventory'; end if;
end $$;

-- Verified store relist publishes directly; normal store relist remains pending.
reset role;
update public.listings set status='sold', sold_at=now(), hidden_source=null, hidden_reason=null, hidden_at=null where id='43000000-0000-4000-8000-000000000003';
update public.stores set is_verified=true where id='42000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"41000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare copy public.listings; begin
  copy := public.relist_sold_listing('43000000-0000-4000-8000-000000000003');
  if copy.status <> 'pending' then raise exception 'LIFE-011 normal Tienda relist bypassed moderation'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"41000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ declare copy public.listings; begin
  copy := public.relist_sold_listing('43000000-0000-4000-8000-000000000004');
  if copy.status <> 'approved' or copy.published_at is null then raise exception 'LIFE-012 verified Tienda relist did not publish'; end if;
end $$;

-- A restore into counted inventory uses the existing serialized cap trigger.
reset role;
insert into public.listings (
  id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,
  price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,
  store_id,created_by_source,marketplace_rules_accepted_at,published_at,hidden_source,hidden_at
) values (
  '43000000-0000-4000-8000-000000000050','s3-cap-hidden','Cap oculto','store','hidden','guitars','electric_guitar','Marca','Cap','Nuevo',500,
  'Lima','Lima','Contacto Cap','51999999105','Descripción válida para probar restauración con límite completo.',
  '41000000-0000-4000-8000-000000000005','42000000-0000-4000-8000-000000000005','self_service',now(),now(),'owner',now()
);
insert into public.listing_photos (listing_id,image_url,sort_order) values
 ('43000000-0000-4000-8000-000000000050','https://example.invalid/cap-hidden-1.jpg',0),
 ('43000000-0000-4000-8000-000000000050','https://example.invalid/cap-hidden-2.jpg',1);
insert into public.listings (slug,title,seller_type,status,category,city,region,whatsapp_phone,owner_user_id,store_id)
select 's3-cap-'||n,'S3 Cap '||n,'store',case when n%2=0 then 'pending'::public.listing_status else 'approved'::public.listing_status end,'guitars','Lima','Lima','51999999105','41000000-0000-4000-8000-000000000005','42000000-0000-4000-8000-000000000005'
from generate_series(1,50)n;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"41000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ declare denied boolean := false; begin
  begin perform public.set_owned_listing_lifecycle('43000000-0000-4000-8000-000000000050','restore');
  exception when others then denied := sqlerrm like 'STORE_INVENTORY_LIMIT_REACHED%'; end;
  if not denied then raise exception 'CAP-010 owner restore exceeded store cap'; end if;
end $$;

rollback;
