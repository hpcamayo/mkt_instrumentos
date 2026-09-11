-- Run in a transaction and roll back; never leave QA listings in production.
begin;

do $$
declare
  test_id uuid := gen_random_uuid();
  owner_id uuid := gen_random_uuid();
  payload jsonb;
  photo_payload jsonb := '[{"image_url":"https://example.invalid/qa-front.jpg","alt_text":"QA frontal"},{"image_url":"https://example.invalid/qa-back.jpg","alt_text":"QA posterior"}]'::jsonb;
  actual_count bigint;
  first_published timestamptz;
begin
  insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  values (owner_id, 'authenticated', 'authenticated', 'qa-' || owner_id || '@example.invalid', crypt('qa-password', gen_salt('bf')), now(), '{}'::jsonb, jsonb_build_object('account_type','seller','full_name','QA Particular','phone','51999999999','city','Lima','region','Lima'));
  update public.profiles set city = 'Lima', region = 'Lima' where id = owner_id;
  payload := jsonb_build_object('slug', 'qa-' || test_id, 'title', 'QA', 'category', 'guitars', 'instrument_type', 'electric_guitar', 'attributes', '{"body_type":"solid_body"}'::jsonb, 'brand', 'QA', 'model', 'QA', 'condition', 'Usado - buen estado', 'price_pen', 100, 'city', 'Lima', 'region', 'Lima', 'owner_user_id', owner_id, 'marketplace_rules_accepted', true, 'description', 'Publicación transaccional QA con suficiente detalle para validar.');
  perform public.complete_public_submission(test_id, 'listing', payload, photo_payload);
  perform public.complete_public_submission(test_id, 'listing', payload, photo_payload);
  select public.listing_photo_count(l) into actual_count from public.listings l where id = test_id;
  if actual_count <> 2 then raise exception 'Retry duplicated photos'; end if;
  if (select status from public.listings where id = test_id) <> 'pending' then raise exception 'Submission bypassed approval'; end if;
  if (select owner_user_id from public.listings where id = test_id) <> owner_id then raise exception 'Submission lost ownership'; end if;
  if (select created_by_source from public.listings where id = test_id) <> 'self_service' then raise exception 'Submission source is incorrect'; end if;
  if not public.listing_meets_publish_requirements(test_id) then raise exception 'Valid two-photo listing rejected'; end if;
  insert into public.listing_photos (listing_id, image_url, sort_order)
  select test_id, 'https://example.invalid/qa-' || n || '.jpg', n from generate_series(2, 9) n;
  if not public.listing_meets_publish_requirements(test_id) then raise exception 'Valid ten-photo listing rejected'; end if;
  insert into public.listing_photos (listing_id, image_url, sort_order) values (test_id, 'https://example.invalid/qa-11.jpg', 10);
  if public.listing_meets_publish_requirements(test_id) then raise exception 'Eleven-photo listing accepted'; end if;
  delete from public.listing_photos where listing_id = test_id and sort_order = 10;
  perform set_config('app.allow_listing_admin_fields', 'true', true);
  update public.listings set status = 'approved' where id = test_id;
  select published_at into first_published from public.listings where id = test_id;
  if first_published is null then raise exception 'Approval date missing'; end if;
  update public.listings set status = 'hidden' where id = test_id;
  update public.listings set status = 'approved' where id = test_id;
  if (select published_at from public.listings where id = test_id) <> first_published then raise exception 'Publication date changed on reapproval'; end if;
  if has_function_privilege('anon', 'public.auth_email_exists(text)', 'execute') then raise exception 'Email lookup exposed to anon'; end if;
  if has_function_privilege('authenticated', 'public.complete_public_submission(uuid,text,jsonb,jsonb)', 'execute') then raise exception 'Submission RPC exposed directly'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'listings' and policyname = 'Public can insert pending listings') then raise exception 'Anonymous listing insert policy still exists'; end if;
end;
$$;

do $$
declare test_id uuid := gen_random_uuid(); owner_id uuid := gen_random_uuid(); payload jsonb;
begin
  insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  values (owner_id, 'authenticated', 'authenticated', 'qa-store-' || owner_id || '@example.invalid', crypt('qa-password', gen_salt('bf')), now(), '{}'::jsonb, jsonb_build_object('account_type','store_owner','full_name','QA Store Owner','phone','51999999999','city','Lima','region','Lima'));
  payload := jsonb_build_object('slug', 'qa-store-' || test_id, 'name', 'QA', 'razon_social', 'QA SAC', 'ruc', '20999999999', 'email', 'qa-store@example.invalid', 'contact_person', 'QA Store Owner', 'city', 'Lima', 'region', 'Lima', 'district', 'QA', 'address', 'QA 123', 'whatsapp_phone', '51999999999', 'description', 'QA', 'owner_user_id', owner_id);
  perform public.complete_public_submission(test_id, 'store', payload, '[{"role":"logo","image_url":"https://example.invalid/logo.jpg"},{"role":"banner","image_url":"https://example.invalid/banner.jpg"}]');
  perform public.complete_public_submission(test_id, 'store', payload, '[{"role":"logo","image_url":"https://example.invalid/logo.jpg"},{"role":"banner","image_url":"https://example.invalid/banner.jpg"}]');
  if (select count(*) from public.stores where id = test_id and status = 'pending') <> 1 then raise exception 'Store retry failed'; end if;
end;
$$;

do $$
declare test_id uuid := gen_random_uuid(); actual_count bigint;
begin
  insert into public.listings (id, slug, title, seller_type, status, category, city, whatsapp_phone)
  values (test_id, 'qa-count-' || test_id, 'QA', 'individual', 'approved', 'guitars', 'Lima', '51999999999');
  insert into public.listing_photos (listing_id, image_url, sort_order)
  select test_id, 'https://example.invalid/' || n || '.jpg', n from generate_series(1, 1200) n;
  select public.listing_photo_count(l) into actual_count from public.listings l where id = test_id;
  if actual_count <> 1200 then raise exception 'Photo count was truncated'; end if;
end;
$$;

rollback;
