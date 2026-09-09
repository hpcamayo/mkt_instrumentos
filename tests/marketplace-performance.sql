-- Run in a transaction and roll back; never leave QA listings in production.
do $$
declare
  test_id uuid := gen_random_uuid();
  payload jsonb;
  photo_payload jsonb := '[{"image_url":"https://example.invalid/qa.jpg","alt_text":"QA"}]'::jsonb;
  actual_count bigint;
  first_published timestamptz;
begin
  payload := jsonb_build_object('slug', 'qa-' || test_id, 'title', 'QA', 'category', 'guitars', 'brand', 'QA', 'model', 'QA', 'condition', 'Usado - buen estado', 'price_pen', 100, 'city', 'Lima', 'region', 'Lima', 'contact_name', 'QA', 'whatsapp_phone', '51999999999', 'description', 'Transactional QA record');
  perform public.complete_public_submission(test_id, 'listing', payload, photo_payload);
  perform public.complete_public_submission(test_id, 'listing', payload, photo_payload);
  select public.listing_photo_count(l) into actual_count from public.listings l where id = test_id;
  if actual_count <> 1 then raise exception 'Retry duplicated photos'; end if;
  if (select status from public.listings where id = test_id) <> 'pending' then raise exception 'Submission bypassed approval'; end if;
  update public.listings set status = 'approved' where id = test_id;
  select published_at into first_published from public.listings where id = test_id;
  if first_published is null then raise exception 'Approval date missing'; end if;
  update public.listings set status = 'hidden' where id = test_id;
  update public.listings set status = 'approved' where id = test_id;
  if (select published_at from public.listings where id = test_id) <> first_published then raise exception 'Publication date changed on reapproval'; end if;
  if has_function_privilege('anon', 'public.auth_email_exists(text)', 'execute') then raise exception 'Email lookup exposed to anon'; end if;
  if has_function_privilege('authenticated', 'public.complete_public_submission(uuid,text,jsonb,jsonb)', 'execute') then raise exception 'Submission RPC exposed directly'; end if;
end;
$$;

do $$
declare test_id uuid := gen_random_uuid(); payload jsonb;
begin
  payload := jsonb_build_object('slug', 'qa-store-' || test_id, 'name', 'QA', 'city', 'Lima', 'region', 'Lima', 'district', 'QA', 'address', 'QA', 'whatsapp_phone', '51999999999', 'description', 'QA');
  perform public.complete_public_submission(test_id, 'store', payload, '[{"image_url":"https://example.invalid/logo.jpg"},{"image_url":"https://example.invalid/banner.jpg"}]');
  perform public.complete_public_submission(test_id, 'store', payload, '[{"image_url":"https://example.invalid/logo.jpg"},{"image_url":"https://example.invalid/banner.jpg"}]');
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
