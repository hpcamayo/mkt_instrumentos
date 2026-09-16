-- Laria V1 Sprint 3.1: amendable revisions, stale moderation, exact prices,
-- typed notifications, RLS, and read-state checks. Local database only.
begin;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('51000000-0000-4000-8000-000000000001','authenticated','authenticated','s31-owner@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"seller","full_name":"Sprint 3.1 Owner","phone":"51999999201","city":"Lima","region":"Lima"}'),
  ('51000000-0000-4000-8000-000000000002','authenticated','authenticated','s31-other@example.invalid',crypt('qa-password',gen_salt('bf')),now(),'{}','{"account_type":"store_owner","full_name":"Sprint 3.1 Store","phone":"51999999202","city":"Lima","region":"Lima"}');

insert into public.stores (
  id,slug,name,razon_social,ruc,email,contact_person,contact_name,
  whatsapp_phone,city,region,address,owner_user_id,status,is_verified,listing_plan
) values (
  '52000000-0000-4000-8000-000000000001','s31-store','Tienda S31','Tienda S31 SAC','20666666661',
  's31-store@example.invalid','Contacto S31','Contacto S31','51999999202','Lima','Lima','Av. Sprint 31',
  '51000000-0000-4000-8000-000000000002','pending',false,'free'
);

insert into public.listings (
  id,slug,title,seller_type,status,category,instrument_type,attributes,brand,model,
  condition,price_pen,city,region,contact_name,whatsapp_phone,description,
  owner_user_id,created_by_source,marketplace_rules_accepted_at,published_at
) values
  ('53000000-0000-4000-8000-000000000001','s31-live','Título A','individual','approved','guitars','electric_guitar','{"body_type":"solid_body"}','Yamaha','112J','Usado - buen estado',1200,'Lima','Lima','Sprint 3.1 Owner','51999999201','Descripción válida para probar propuestas modificables y precio exacto.','51000000-0000-4000-8000-000000000001','self_service',now(),now()),
  ('53000000-0000-4000-8000-000000000002','s31-pending-approve','Pendiente exacta','individual','pending','guitars','electric_guitar','{}','Yamaha','QA','Usado - buen estado',1200,'Lima','Lima','Sprint 3.1 Owner','51999999201','Descripción válida para probar notificaciones de aprobación.','51000000-0000-4000-8000-000000000001','self_service',now(),null),
  ('53000000-0000-4000-8000-000000000003','s31-pending-reject','Pendiente rechazo','individual','pending','guitars','electric_guitar','{}','Yamaha','QA','Usado - buen estado',900,'Lima','Lima','Sprint 3.1 Owner','51999999201','Descripción válida para probar notificaciones de rechazo.','51000000-0000-4000-8000-000000000001','self_service',now(),null);

insert into public.listings (
  id,slug,title,seller_type,status,category,instrument_type,attributes,brand,model,
  condition,price_pen,city,region,contact_name,whatsapp_phone,description,
  owner_user_id,created_by_source,marketplace_rules_accepted_at,published_at,sold_at
) values (
  '53000000-0000-4000-8000-000000000004','s31-sold-title','Título canónico para republicar','individual','sold',
  'guitars','electric_guitar','{}','Yamaha','Relist','Usado - buen estado',1200,'Lima','Lima',
  'Sprint 3.1 Owner','51999999201','Descripción válida para comprobar que republicar conserva el título canónico.',
  '51000000-0000-4000-8000-000000000001','self_service',now(),now(),now()
);

insert into public.listing_photos (listing_id,image_url,alt_text,sort_order)
select listing_id, 'https://example.invalid/s31-' || listing_id || '-' || n || '.jpg', 'Foto ' || (n + 1), n
from (values
  ('53000000-0000-4000-8000-000000000001'::uuid),
  ('53000000-0000-4000-8000-000000000002'::uuid),
  ('53000000-0000-4000-8000-000000000003'::uuid),
  ('53000000-0000-4000-8000-000000000004'::uuid)
) listings(listing_id)
cross join generate_series(0,1) n;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"51000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

do $$
declare
  result jsonb;
  first_revision uuid;
begin
  if (select price_pen from public.listings where id='53000000-0000-4000-8000-000000000001') <> 1200 then
    raise exception 'LIST-013 initial 1200 price was not exact';
  end if;

  result := to_jsonb(public.relist_sold_listing('53000000-0000-4000-8000-000000000004'));
  if result->>'title' <> 'Título canónico para republicar' then
    raise exception 'Relist did not preserve the canonical title';
  end if;

  result := public.update_owned_listing('53000000-0000-4000-8000-000000000001','{}','{"title":"Título B"}',null);
  first_revision := (result->>'revision_id')::uuid;
  if result->>'mode' <> 'revision' or (result->>'revision_version')::integer <> 1 then raise exception 'Initial revision invalid'; end if;

  result := public.update_owned_listing(
    '53000000-0000-4000-8000-000000000001','{}','{}',
    '[{"image_url":"https://example.invalid/s31-53000000-0000-4000-8000-000000000001-1.jpg","alt_text":"Foto 2"},{"image_url":"https://example.invalid/s31-53000000-0000-4000-8000-000000000001-0.jpg","alt_text":"Foto 1"}]'
  );
  if result->>'mode' <> 'revision_amended' or (result->>'revision_id')::uuid <> first_revision then raise exception 'Photo amendment did not reuse the proposal'; end if;

  result := public.update_owned_listing('53000000-0000-4000-8000-000000000001','{}','{"condition":"Nuevo"}',null);
  if (select count(*) from public.listing_revisions where listing_id='53000000-0000-4000-8000-000000000001' and status='pending') <> 1 then raise exception 'Competing revision created'; end if;
  if (select changed_fields @> array['title','condition','photos']::text[] from public.listing_revisions where id=first_revision) is not true then raise exception 'Proposal merge lost fields'; end if;

  result := public.update_owned_listing(
    '53000000-0000-4000-8000-000000000001','{"price_pen":1100}','{}',
    '[{"image_url":"https://example.invalid/s31-53000000-0000-4000-8000-000000000001-1.jpg","alt_text":"Foto 2"},{"image_url":"https://example.invalid/s31-53000000-0000-4000-8000-000000000001-0.jpg","alt_text":"Foto 1"}]'
  );
  if (select price_pen from public.listings where id='53000000-0000-4000-8000-000000000001') <> 1100 then raise exception 'Mixed edit did not apply exact immediate price'; end if;
  if (select title from public.listings where id='53000000-0000-4000-8000-000000000001') <> 'Título A' then raise exception 'Pending title leaked live'; end if;
  if (select image_url from public.listing_photos where listing_id='53000000-0000-4000-8000-000000000001' order by sort_order limit 1) like '%-1.jpg' then raise exception 'Pending photo leaked live'; end if;

  perform public.update_owned_listing('53000000-0000-4000-8000-000000000001','{}','{"title":"Título C"}',null);
  perform public.update_owned_listing('53000000-0000-4000-8000-000000000001','{}','{"title":"Título A","condition":"Usado - buen estado"}',null);
  result := public.update_owned_listing(
    '53000000-0000-4000-8000-000000000001','{}','{}',
    '[{"image_url":"https://example.invalid/s31-53000000-0000-4000-8000-000000000001-0.jpg","alt_text":"Foto 1"},{"image_url":"https://example.invalid/s31-53000000-0000-4000-8000-000000000001-1.jpg","alt_text":"Foto 2"}]'
  );
  if result->>'mode' <> 'revision_cancelled' then raise exception 'Empty proposal was not cancelled'; end if;
  if exists (select 1 from public.listing_revisions where listing_id='53000000-0000-4000-8000-000000000001' and status='pending') then raise exception 'Meaningless pending revision remained'; end if;
end;
$$;

-- Stale admin decision protection and canonical title promotion.
select public.update_owned_listing('53000000-0000-4000-8000-000000000001','{}','{"title":"Título aprobado final"}',null);
select public.update_owned_listing('53000000-0000-4000-8000-000000000001','{}','{"model":"Modelo actualizado"}',null);

select set_config('request.jwt.claims','{"sub":"51999999-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}',true);
do $$
declare
  target_revision uuid;
  denied boolean := false;
begin
  select id into target_revision from public.listing_revisions where listing_id='53000000-0000-4000-8000-000000000001' and status='pending';
  begin perform public.review_listing_revision(target_revision,'approve',1,null);
  exception when others then denied := sqlerrm like 'LISTING_REVISION_STALE%'; end;
  if not denied then raise exception 'Stale admin approval was accepted'; end if;
  perform public.review_listing_revision(target_revision,'approve',2,null);
  if (select title from public.listings where id='53000000-0000-4000-8000-000000000001') <> 'Título aprobado final' then raise exception 'Canonical title was not promoted'; end if;
  if (select model from public.listings where id='53000000-0000-4000-8000-000000000001') <> 'Modelo actualizado' then raise exception 'Latest proposal was not promoted'; end if;
  if (select price_pen from public.listings where id='53000000-0000-4000-8000-000000000001') <> 1100 then raise exception 'Revision approval replayed stale immediate price'; end if;
end;
$$;

-- Rejection preserves the live title and creates a reason-linked notification.
select set_config('request.jwt.claims','{"sub":"51000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.update_owned_listing('53000000-0000-4000-8000-000000000001','{}','{"title":"Título rechazado"}',null);
select public.update_owned_listing('53000000-0000-4000-8000-000000000001','{}','{"model":"Modelo también rechazado"}',null);
select set_config('request.jwt.claims','{"sub":"51999999-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}',true);
do $$ declare target_revision uuid; begin
  select id into target_revision from public.listing_revisions where listing_id='53000000-0000-4000-8000-000000000001' and status='pending';
  perform public.review_listing_revision(target_revision,'reject',2,'El título no corresponde al producto');
  if (select title from public.listings where id='53000000-0000-4000-8000-000000000001') <> 'Título aprobado final' then raise exception 'Rejected title changed live row'; end if;
  if (select model from public.listings where id='53000000-0000-4000-8000-000000000001') <> 'Modelo actualizado' then raise exception 'Rejected amended proposal changed live model'; end if;
end $$;

select public.review_listing('53000000-0000-4000-8000-000000000002','approve',null);
select public.review_listing('53000000-0000-4000-8000-000000000003','reject','Fotos insuficientes');
select public.review_listing('53000000-0000-4000-8000-000000000001','hide','Revisión administrativa');
select public.review_store_application('52000000-0000-4000-8000-000000000001','approve',null);
select public.set_store_verification('52000000-0000-4000-8000-000000000001',true);
select public.set_store_verification('52000000-0000-4000-8000-000000000001',false);

-- Notification isolation and read state.
select set_config('request.jwt.claims','{"sub":"51000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  notification_id uuid;
  before_count integer;
begin
  select count(*) into before_count from public.notifications;
  if before_count <> 5 then raise exception 'Expected five listing/revision notifications, got %', before_count; end if;
  if not exists (select 1 from public.notifications where event_type='listing_revision_rejected' and listing_id='53000000-0000-4000-8000-000000000001') then raise exception 'Revision rejection notification missing'; end if;
  select id into notification_id from public.notifications order by created_at desc, id desc limit 1;
  perform public.mark_notification_read(notification_id);
  if (select read_at is null from public.notifications where id=notification_id) then raise exception 'Notification read state did not persist'; end if;
end;
$$;

select set_config('request.jwt.claims','{"sub":"51000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  foreign_notification uuid;
  denied boolean := false;
begin
  if (select count(*) from public.notifications) <> 3 then raise exception 'Store owner notification scope is incorrect'; end if;
  select id into foreign_notification from public.notifications where user_id='51000000-0000-4000-8000-000000000001' limit 1;
  if foreign_notification is not null then raise exception 'RLS exposed another user notification'; end if;
  begin perform public.mark_notification_read((select id from public.notifications where user_id='51000000-0000-4000-8000-000000000001' limit 1));
  exception when others then denied := true; end;
  -- The RLS-hidden subquery returns null; the trusted RPC must still deny it.
  if not denied then raise exception 'Cross-user notification mutation was not denied'; end if;
end;
$$;

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
  if (select count(*) from public.notifications) <> 0 then raise exception 'Anonymous user read notifications'; end if;
end $$;

rollback;
