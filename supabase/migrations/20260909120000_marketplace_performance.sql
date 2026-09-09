-- Keep counts in each listing query; SECURITY INVOKER preserves photo RLS.
create or replace function public.listing_photo_count(public.listings)
returns bigint language sql stable security invoker set search_path = public
as $$ select count(*) from public.listing_photos where listing_id = $1.id; $$;
grant execute on function public.listing_photo_count(public.listings) to anon, authenticated;

-- A bounded, server-only lookup replaces downloading the Auth user directory.
create or replace function public.auth_email_exists(p_email text)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from auth.users where email = lower(trim(p_email))); $$;
revoke all on function public.auth_email_exists(text) from public, anon, authenticated;
grant execute on function public.auth_email_exists(text) to service_role;

-- Applies to admin approval as well as controlled publication functions.
create or replace function public.set_listing_publication_date()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'approved' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;
create trigger listings_set_publication_date before insert or update of status on public.listings
for each row execute function public.set_listing_publication_date();

-- Old records have no reliable approval timestamp; preserve their creation date.
-- The existing protection trigger explicitly permits this controlled migration.
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set published_at = created_at where status = 'approved' and published_at is null;

-- Support bounded newest-first browsing and seller recommendations.
create index if not exists listings_approved_newest_idx
on public.listings (published_at desc nulls last, created_at desc, id) where status = 'approved';
create index if not exists listings_approved_phone_idx
on public.listings (whatsapp_phone) where status = 'approved' and seller_type = 'individual';

-- Atomic insertion after uploads. Repeated requests with the same signed submission
-- ID are successful without inserting duplicate listings, stores, or photo rows.
create or replace function public.complete_public_submission(p_id uuid, p_kind text, p_fields jsonb, p_photos jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare inserted_id uuid;
begin
  if p_kind = 'listing' then
    insert into public.listings (id, slug, title, category, brand, model, condition, price_pen, city, region, contact_name, whatsapp_phone, description, seller_type, status)
    values (p_id, p_fields->>'slug', p_fields->>'title', p_fields->>'category', p_fields->>'brand', p_fields->>'model', p_fields->>'condition', (p_fields->>'price_pen')::integer, p_fields->>'city', p_fields->>'region', p_fields->>'contact_name', p_fields->>'whatsapp_phone', p_fields->>'description', 'individual', 'pending')
    on conflict (id) do nothing returning id into inserted_id;
    if inserted_id is not null then
      insert into public.listing_photos (listing_id, image_url, alt_text, sort_order)
      select p_id, photo->>'image_url', photo->>'alt_text', (ordinality - 1)::integer
      from jsonb_array_elements(p_photos) with ordinality as photos(photo, ordinality);
    end if;
  elsif p_kind = 'store' then
    insert into public.stores (id, slug, name, city, region, district, address, whatsapp_phone, contact_name, instagram_url, facebook_url, description, logo_url, banner_url, status, listing_plan)
    values (p_id, p_fields->>'slug', p_fields->>'name', p_fields->>'city', p_fields->>'region', p_fields->>'district', p_fields->>'address', p_fields->>'whatsapp_phone', p_fields->>'name', nullif(p_fields->>'instagram_url',''), nullif(p_fields->>'facebook_url',''), p_fields->>'description', p_photos->0->>'image_url', p_photos->1->>'image_url', 'pending', 'free')
    on conflict (id) do nothing;
  else
    raise exception 'Invalid submission kind';
  end if;
  return p_id;
end;
$$;
revoke all on function public.complete_public_submission(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.complete_public_submission(uuid, text, jsonb, jsonb) to service_role;
