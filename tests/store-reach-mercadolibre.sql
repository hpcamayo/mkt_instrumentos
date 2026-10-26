-- Feature ideas, batch "store-reach" (docs/feature-ideas/store-reach.md): reach-01 "Importar desde Mercado Libre".
-- Covers who can see and change a connection (tokens only through the service role), the photos recorded for an
-- import (Mercado Libre hosts only, per store) and their claim and finish. Local/test database only; rolled back.
begin;

create function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_code in sqlerrm) = 1 then return; end if;
    raise exception 'Expected % from [%], got: % (%)', p_code, p_sql, sqlerrm, sqlstate;
  end;
  raise exception 'Expected % from [%], but it succeeded', p_code, p_sql;
end $$;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;

create function pg_temp.as_user(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_service() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e7440000-0000-4000-8000-0000000000a1','authenticated','authenticated','reach-ml-owner@example.invalid',now(),'{}','{"account_type":"store_owner"}'),
 ('e7440000-0000-4000-8000-0000000000a2','authenticated','authenticated','reach-ml-other@example.invalid',now(),'{}','{"account_type":"store_owner"}'),
 ('e7440000-0000-4000-8000-0000000000a3','authenticated','authenticated','reach-ml-pending@example.invalid',now(),'{}','{"account_type":"store_owner"}')
on conflict (id) do nothing;
insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('e7440000-0000-4000-8000-000000000001','reach-ml-tienda','Tienda ML','ML SAC','20999992001','ml@example.invalid','Contacto','Contacto','51999992001','Lima','Lima','Av. 1','e7440000-0000-4000-8000-0000000000a1','active','free',true),
 ('e7440000-0000-4000-8000-000000000002','reach-ml-otra','Otra ML','Otra SAC','20999992002','otra@example.invalid','Contacto','Contacto','51999992002','Lima','Lima','Av. 2','e7440000-0000-4000-8000-0000000000a2','active','free',true),
 ('e7440000-0000-4000-8000-000000000003','reach-ml-pendiente','Pendiente ML','Pend SAC','20999992003','pend@example.invalid','Contacto','Contacto','51999992003','Lima','Lima','Av. 3','e7440000-0000-4000-8000-0000000000a3','pending','free',false);
insert into public.store_import_sessions (id, store_id, created_by, status, file_format, file_name, file_path, file_bytes) values
 ('e7440000-0000-4000-8000-000000000101', 'e7440000-0000-4000-8000-000000000001', 'e7440000-0000-4000-8000-0000000000a1', 'awaiting_upload',
  'csv', 'mercado-libre.csv', 'e7440000-0000-4000-8000-0000000000a1/e7440000-0000-4000-8000-000000000101/source.csv', 1000);

-- ------------------------------------------------------------------ the connection

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect_error($$select public.get_mercadolibre_connection()$$, 'permission denied');
select pg_temp.expect_error($$select * from public.store_mercadolibre_connections$$, 'permission denied');

reset role;
set local role authenticated;
select pg_temp.as_user('e7440000-0000-4000-8000-0000000000a1');
select pg_temp.check((public.get_mercadolibre_connection()->>'connected')::boolean = false, 'not connected yet');
select pg_temp.expect_error($$select * from public.store_mercadolibre_connections$$, 'permission denied');
select pg_temp.expect_error($$select * from public.store_mercadolibre_import_photos$$, 'permission denied');
select pg_temp.expect_error($$select public.get_mercadolibre_tokens('e7440000-0000-4000-8000-0000000000a1')$$, 'permission denied');
select pg_temp.expect_error($$select public.save_mercadolibre_connection('e7440000-0000-4000-8000-0000000000a1', 1, 'x', 'enc', null, now(), null)$$, 'permission denied');

reset role;
set local role service_role;
select pg_temp.as_service();
select pg_temp.expect_error($$select public.save_mercadolibre_connection('e7440000-0000-4000-8000-0000000000a3', 77, 'PENDIENTE', 'v1.a.b.c', null, now() + interval '6 hours', null)$$, 'STORE_NOT_ACTIVE');
select pg_temp.expect_error($$select public.save_mercadolibre_connection('e7440000-0000-4000-8000-0000000000a1', 0, 'X', 'v1.a.b.c', null, now(), null)$$, 'MERCADOLIBRE_TOKEN_INVALID');
select pg_temp.check((public.save_mercadolibre_connection('e7440000-0000-4000-8000-0000000000a1', 123456, 'TIENDAML', 'v1.access', 'v1.refresh',
  now() + interval '6 hours', 'offline_access read')->>'connected')::boolean, 'saved');
select pg_temp.check(public.get_mercadolibre_tokens('e7440000-0000-4000-8000-0000000000a1')->>'access_token_enc' = 'v1.access', 'the server reads the tokens');
select pg_temp.check(public.get_mercadolibre_tokens('e7440000-0000-4000-8000-0000000000a2') is null, 'another owner has none');
select pg_temp.check(not public.update_mercadolibre_tokens('e7440000-0000-4000-8000-000000000001', 'v1.older', 'v1.new', null, now() + interval '6 hours'),
  'a refresh from an older token does not overwrite');
select pg_temp.check(public.update_mercadolibre_tokens('e7440000-0000-4000-8000-000000000001', 'v1.access', 'v1.access2', null, now() + interval '6 hours'),
  'a refresh applies');
select pg_temp.check(public.get_mercadolibre_tokens('e7440000-0000-4000-8000-0000000000a1')->>'refresh_token_enc' = 'v1.refresh', 'the refresh token is kept');

reset role;
set local role authenticated;
select pg_temp.as_user('e7440000-0000-4000-8000-0000000000a1');
do $$ declare connection jsonb; begin
  connection := public.get_mercadolibre_connection();
  perform pg_temp.check((connection->>'connected')::boolean and connection->>'nickname' = 'TIENDAML', 'the owner sees the nickname');
  perform pg_temp.check(not connection ? 'access_token_enc', 'never the tokens');
end $$;
select pg_temp.as_user('e7440000-0000-4000-8000-0000000000a2');
select pg_temp.check((public.get_mercadolibre_connection()->>'connected')::boolean = false, 'another store sees its own state');
select public.disconnect_mercadolibre();
select pg_temp.as_user('e7440000-0000-4000-8000-0000000000a1');
select pg_temp.check((public.get_mercadolibre_connection()->>'connected')::boolean, 'another store cannot disconnect this one');

-- ------------------------------------------------------------------ photos of an import

select pg_temp.as_user('e7440000-0000-4000-8000-0000000000a2');
select pg_temp.expect_error($$select public.record_mercadolibre_import_photos('e7440000-0000-4000-8000-000000000101', '[]')$$, 'MERCADOLIBRE_IMPORT_NOT_FOUND');
select pg_temp.expect_error($$select public.get_mercadolibre_import_photos('e7440000-0000-4000-8000-000000000101')$$, 'MERCADOLIBRE_IMPORT_NOT_FOUND');

select pg_temp.as_user('e7440000-0000-4000-8000-0000000000a1');
do $$ declare result jsonb; begin
  result := public.record_mercadolibre_import_photos('e7440000-0000-4000-8000-000000000101', jsonb_build_array(
    jsonb_build_object('sku', 'MPE612345678', 'order', 1, 'url', 'https://http2.mlstatic.com/D_NQ_NP_612345-MPE1-O.jpg'),
    jsonb_build_object('sku', 'MPE612345678', 'order', 2, 'url', 'https://http2.mlstatic.com/D_NQ_NP_612346-MPE2-O.webp'),
    jsonb_build_object('sku', 'MPE612345678', 'order', 2, 'url', 'https://http2.mlstatic.com/D_NQ_NP_dup-O.jpg'),
    jsonb_build_object('sku', 'DS1-004', 'order', 1, 'url', 'https://http2.mlstatic.com/D_NQ_NP_777-O.jpg'),
    jsonb_build_object('sku', 'DS1-004', 'order', 2, 'url', 'https://evil.example.com/x.jpg'),
    jsonb_build_object('sku', 'DS1-004', 'order', 3, 'url', 'http://http2.mlstatic.com/D_plain-O.jpg'),
    jsonb_build_object('sku', 'DS1-004', 'order', 4, 'url', 'https://http2.mlstatic.com.evil.com/x.jpg'),
    jsonb_build_object('sku', 'bad sku', 'order', 1, 'url', 'https://http2.mlstatic.com/D_ok-O.jpg'),
    jsonb_build_object('sku', 'DS1-004', 'order', 11, 'url', 'https://http2.mlstatic.com/D_ok-O.jpg'),
    jsonb_build_object('sku', 'DS1-004', 'order', 'x', 'url', 'https://http2.mlstatic.com/D_ok-O.jpg')));
  perform pg_temp.check((result->>'recorded')::integer = 3, format('only Mercado Libre https photos with valid SKUs: %s', result));
  -- The import has not been reviewed yet: nothing to copy.
  perform pg_temp.check((public.claim_mercadolibre_import_photos('e7440000-0000-4000-8000-000000000101')->>'accepting')::boolean = false, 'not accepting before review');
end $$;

reset role;
update public.store_import_sessions set status = 'ready' where id = 'e7440000-0000-4000-8000-000000000101';
set local role authenticated;
select pg_temp.as_user('e7440000-0000-4000-8000-0000000000a1');
do $$ declare first jsonb; second jsonb; photo jsonb; counts jsonb; begin
  first := public.claim_mercadolibre_import_photos('e7440000-0000-4000-8000-000000000101', 2);
  perform pg_temp.check(jsonb_array_length(first->'photos') = 2, 'two claimed');
  second := public.claim_mercadolibre_import_photos('e7440000-0000-4000-8000-000000000101', 8);
  perform pg_temp.check(jsonb_array_length(second->'photos') = 1, 'the third, not the ones being worked on');
  for photo in select value from jsonb_array_elements(first->'photos') loop
    perform public.finish_mercadolibre_import_photo((photo->>'id')::uuid, 'done', gen_random_uuid(), null);
  end loop;
  perform public.finish_mercadolibre_import_photo((second->'photos'->0->>'id')::uuid, 'failed', null, 'La foto mide menos de 400 px.');
  counts := public.get_mercadolibre_import_photos('e7440000-0000-4000-8000-000000000101');
  perform pg_temp.check((counts->>'total')::integer = 3 and (counts->>'done')::integer = 2 and (counts->>'failed')::integer = 1
    and (counts->>'pending')::integer = 0 and (counts->>'accepting')::boolean, format('counts %s', counts));
  perform pg_temp.check(jsonb_array_length(public.claim_mercadolibre_import_photos('e7440000-0000-4000-8000-000000000101')->'photos') = 0, 'nothing left');
end $$;

-- Another store cannot finish this store's photos.
reset role;
create temp table ml_target as select id from public.store_mercadolibre_import_photos where status = 'failed' limit 1;
grant select on ml_target to authenticated;
update public.store_mercadolibre_import_photos set status = 'working' where id = (select id from ml_target);
set local role authenticated;
select pg_temp.as_user('e7440000-0000-4000-8000-0000000000a2');
select public.finish_mercadolibre_import_photo((select id from ml_target), 'done', null, null);
reset role;
select pg_temp.check((select status from public.store_mercadolibre_import_photos where id = (select id from ml_target)) = 'working', 'untouched by another store');

-- Disconnecting removes the tokens.
set local role authenticated;
select pg_temp.as_user('e7440000-0000-4000-8000-0000000000a1');
select public.disconnect_mercadolibre();
reset role;
select pg_temp.check(not exists (select 1 from public.store_mercadolibre_connections where store_id = 'e7440000-0000-4000-8000-000000000001'), 'tokens deleted');

rollback;
