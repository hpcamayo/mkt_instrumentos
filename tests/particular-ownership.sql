-- Run against a migrated local/test Supabase database only.
-- Every fixture is rolled back.
begin;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'qa-owner@example.invalid', crypt('qa-password', gen_salt('bf')), now(), '{}'::jsonb, '{"account_type":"seller","full_name":"QA Owner","phone":"+51 999 999 991","city":"Lima","region":"Lima"}'::jsonb),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'qa-other@example.invalid', crypt('qa-password', gen_salt('bf')), now(), '{}'::jsonb, '{"account_type":"seller","full_name":"QA Other","phone":"+51 999 999 992","city":"Lima","region":"Lima"}'::jsonb);

do $$
begin
  if not exists (
    select 1 from public.profiles
    where id = '10000000-0000-4000-8000-000000000001'
      and full_name = 'QA Owner'
      and phone = '51999999991'
      and city = 'Lima'
      and region = 'Lima'
  ) then
    raise exception 'Signup metadata did not create a complete normalized Particular profile';
  end if;
end;
$$;

update public.profiles set city = 'Lima', region = 'Lima'
where id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002');

-- A pre-account listing remains public and keeps its listing-level contact snapshot.
insert into public.listings (
  id, slug, title, seller_type, status, category, city, region,
  contact_name, whatsapp_phone, created_by_source
) values (
  '20000000-0000-4000-8000-000000000000', 'qa-legacy-listing', 'QA legacy',
  'individual', 'approved', 'guitars', 'Lima', 'Lima',
  'Contacto heredado', '51988888888', 'legacy'
);
insert into public.listing_photos (listing_id, image_url, sort_order)
values ('20000000-0000-4000-8000-000000000000', 'https://example.invalid/legacy.jpg', 0);

-- Matching historical contact data must never claim a legacy listing implicitly.
update public.profiles
set phone = '51988888888'
where id = '10000000-0000-4000-8000-000000000002';

do $$
begin
  if (select owner_user_id from public.listings where id = '20000000-0000-4000-8000-000000000000') is not null then
    raise exception 'Legacy ownership was inferred from matching contact data';
  end if;
end;
$$;

insert into public.listings (
  id, slug, title, seller_type, status, category, city, region,
  contact_name, whatsapp_phone, owner_user_id, created_by_source
) values (
  '20000000-0000-4000-8000-000000000002', 'qa-rejected-listing', 'QA rejected',
  'individual', 'rejected', 'guitars', 'Lima', 'Lima',
  'QA Owner', '51999999991', '10000000-0000-4000-8000-000000000001', 'self_service'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- A Particular can create only their own pending individual listing.
insert into public.listings (
  id, slug, title, seller_type, status, category, instrument_type, attributes,
  brand, model, condition, price_pen, city, region, contact_name,
  whatsapp_phone, description, owner_user_id, created_by_source,
  marketplace_rules_accepted_at
) values (
  '20000000-0000-4000-8000-000000000001', 'qa-owned-listing', 'QA owned',
  'individual', 'pending', 'guitars', 'electric_guitar',
  '{"body_type":"solid_body","pickups":["humbucker"]}'::jsonb,
  'QA', 'QA', 'Usado - buen estado', 100, 'Lima', 'Lima', 'Snapshot original',
  '51999999991', 'Descripción QA con más de cuarenta caracteres para publicación.',
  '10000000-0000-4000-8000-000000000001', 'self_service', now()
);

do $$
declare listing_record public.listings; denied boolean := false;
begin
  select * into listing_record from public.listings where id = '20000000-0000-4000-8000-000000000001';
  if listing_record.owner_user_id <> '10000000-0000-4000-8000-000000000001' then raise exception 'Owned listing lost owner_user_id'; end if;
  if listing_record.instrument_type <> 'electric_guitar' or listing_record.attributes->>'body_type' <> 'solid_body' or listing_record.attributes->'pickups'->>0 <> 'humbucker' then raise exception 'Instrument type or attributes did not persist'; end if;
  if (select count(*) from public.listings where id = '20000000-0000-4000-8000-000000000002') <> 1 then raise exception 'Owner cannot read own rejected listing'; end if;
  begin
    insert into public.listings (slug, title, seller_type, status, category, city, whatsapp_phone, owner_user_id)
    values ('qa-spoofed-owner', 'QA spoof', 'individual', 'pending', 'guitars', 'Lima', '51999999991', '10000000-0000-4000-8000-000000000002');
  exception when others then denied := true;
  end;
  if not denied then raise exception 'Particular created a listing for another owner'; end if;
end;
$$;

insert into public.listing_photos (listing_id, image_url, sort_order) values
  ('20000000-0000-4000-8000-000000000001', 'https://example.invalid/front.jpg', 0),
  ('20000000-0000-4000-8000-000000000001', 'https://example.invalid/back.jpg', 1);

do $$
declare changed_count integer; denied boolean;
begin
  if not public.listing_meets_publish_requirements('20000000-0000-4000-8000-000000000001') then raise exception 'Two-photo listing rejected'; end if;
  update public.listings
  set instrument_type = 'other', attributes = '{}'::jsonb
  where id = '20000000-0000-4000-8000-000000000001';
  if not public.listing_meets_publish_requirements('20000000-0000-4000-8000-000000000001') then raise exception 'Other instrument subtype rejected'; end if;
  update public.listings
  set instrument_type = 'electric_guitar', attributes = '{"body_type":"solid_body","pickups":["humbucker"]}'::jsonb
  where id = '20000000-0000-4000-8000-000000000001';
  with changed as (
    delete from public.listing_photos
    where listing_id = '20000000-0000-4000-8000-000000000001' and sort_order = 1 returning 1
  ) select count(*) into changed_count from changed;
  if changed_count <> 0 then raise exception 'Owner removed a photo below the two-photo minimum'; end if;

  denied := false;
  begin update public.listings set status = 'approved' where id = '20000000-0000-4000-8000-000000000001';
  exception when others then denied := true; end;
  if not denied then raise exception 'Seller changed protected status'; end if;

  denied := false;
  begin update public.listings set owner_user_id = '10000000-0000-4000-8000-000000000002' where id = '20000000-0000-4000-8000-000000000001';
  exception when others then denied := true; end;
  if not denied then raise exception 'Seller changed protected ownership'; end if;

  denied := false;
  begin update public.listings set published_at = now() where id = '20000000-0000-4000-8000-000000000001';
  exception when others then denied := true; end;
  if not denied then raise exception 'Seller changed protected publication fields'; end if;

  denied := false;
  begin update public.listings set view_count = view_count + 1 where id = '20000000-0000-4000-8000-000000000001';
  exception when others then denied := true; end;
  if not denied then raise exception 'Seller changed protected view_count'; end if;

  denied := false;
  begin update public.listings set seller_type = 'store', store_id = '10000000-0000-0000-0000-000000000001' where id = '20000000-0000-4000-8000-000000000001';
  exception when others then denied := true; end;
  if not denied then raise exception 'Seller changed protected seller_type/store_id'; end if;
end;
$$;

insert into public.listing_photos (listing_id, image_url, sort_order)
select '20000000-0000-4000-8000-000000000001', 'https://example.invalid/qa-' || n || '.jpg', n
from generate_series(2, 9) n;

do $$
declare denied boolean := false; submitted public.listings;
begin
  begin
    insert into public.listing_photos (listing_id, image_url, sort_order)
    values ('20000000-0000-4000-8000-000000000001', 'https://example.invalid/eleven.jpg', 10);
  exception when others then denied := true;
  end;
  if not denied then raise exception 'Owner exceeded the ten-photo maximum'; end if;
  if (select count(*) from public.listing_photos where listing_id = '20000000-0000-4000-8000-000000000001') <> 10 then raise exception 'Ten-photo boundary was not preserved'; end if;
  submitted := public.submit_listing_for_publication('20000000-0000-4000-8000-000000000001');
  if submitted.status <> 'pending' or submitted.published_at is not null then raise exception 'Particular self-approved a listing'; end if;
end;
$$;

update public.profiles
set full_name = 'QA Owner actualizado', phone = '51977777777', city = 'Cusco', region = 'Cusco'
where id = '10000000-0000-4000-8000-000000000001';

-- Another Particular cannot see or modify the nonpublic owned listing.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare visible_count integer; changed_count integer;
begin
  select count(*) into visible_count from public.listings where id = '20000000-0000-4000-8000-000000000001';
  if visible_count <> 0 then raise exception 'Unrelated Particular read an owned pending listing'; end if;
  with changed as (
    update public.listings set description = 'Unauthorized change'
    where id = '20000000-0000-4000-8000-000000000001' returning 1
  ) select count(*) into changed_count from changed;
  if changed_count <> 0 then raise exception 'Unrelated Particular edited an owned listing'; end if;
end;
$$;

-- Anonymous access can browse legacy approved inventory but cannot publish.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare visible_count integer; denied boolean := false;
begin
  select count(*) into visible_count from public.listings
  where id = '20000000-0000-4000-8000-000000000000'
    and owner_user_id is null and contact_name = 'Contacto heredado' and whatsapp_phone = '51988888888';
  if visible_count <> 1 then raise exception 'Legacy unowned listing is no longer public'; end if;
  select count(*) into visible_count from public.listings where id = '20000000-0000-4000-8000-000000000001';
  if visible_count <> 0 then raise exception 'Anonymous user read a pending owned listing'; end if;
  select count(*) into visible_count from public.listing_photos where listing_id = '20000000-0000-4000-8000-000000000000';
  if visible_count <> 1 then raise exception 'Anonymous user cannot read photos for approved inventory'; end if;
  select count(*) into visible_count from public.listing_photos where listing_id = '20000000-0000-4000-8000-000000000001';
  if visible_count <> 0 then raise exception 'Anonymous user read photos for nonpublic inventory'; end if;

  begin
    insert into public.listings (slug, title, seller_type, status, category, city, whatsapp_phone)
    values ('qa-anonymous-listing', 'QA anonymous', 'individual', 'pending', 'guitars', 'Lima', '51999999999');
  exception when others then denied := true;
  end;
  if not denied then raise exception 'Anonymous listing creation was allowed'; end if;

  denied := false;
  begin perform public.submit_listing_for_publication('20000000-0000-4000-8000-000000000001');
  exception when others then denied := true; end;
  if not denied then raise exception 'Anonymous publication was allowed'; end if;
end;
$$;

-- Admins retain RLS read/update authority and can moderate a valid listing.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}', true);
do $$
declare changed_count integer;
begin
  with changed as (
    update public.listings set status = 'approved', published_at = now()
    where id = '20000000-0000-4000-8000-000000000001' returning 1
  ) select count(*) into changed_count from changed;
  if changed_count <> 1 then raise exception 'Admin could not moderate the listing'; end if;
end;
$$;

-- Approved owned listings expose the current profile, not the old snapshot.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare visible_count integer;
begin
  select count(*) into visible_count
  from public.listings l
  join public.profiles p on p.id = l.owner_user_id
  where l.id = '20000000-0000-4000-8000-000000000001'
    and p.full_name = 'QA Owner actualizado'
    and p.phone = '51977777777'
    and p.city = 'Cusco'
    and p.region = 'Cusco'
    and l.contact_name = 'Snapshot original';
  if visible_count <> 1 then raise exception 'Dynamic owned-listing profile resolution failed'; end if;

  select count(*) into visible_count from public.profiles
  where id = '10000000-0000-4000-8000-000000000002';
  if visible_count <> 0 then raise exception 'Unrelated profile was exposed publicly'; end if;
end;
$$;

reset role;
rollback;
