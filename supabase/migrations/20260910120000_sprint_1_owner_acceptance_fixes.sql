-- Sprint 1 owner-acceptance fixes: persist complete Particular signup metadata
-- and allow the existing instrument taxonomy's generic "Otro" fallback.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    phone,
    city,
    region,
    account_type
  )
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), '')
    ),
    nullif(
      regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '[^0-9]', '', 'g'),
      ''
    ),
    nullif(trim(new.raw_user_meta_data ->> 'city'), ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'region'), ''), 'Peru'),
    case
      when new.raw_user_meta_data ->> 'account_type' in ('seller', 'store_owner')
        then new.raw_user_meta_data ->> 'account_type'
      else 'seller'
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Repair profiles created by the previous trigger only when a signup metadata
-- value can fill an empty/default field. Existing owner edits win.
update public.profiles as profile
set
  full_name = coalesce(
    nullif(trim(profile.full_name), ''),
    nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(auth_user.raw_user_meta_data ->> 'name'), '')
  ),
  phone = case
    when regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g') ~ '^[0-9]{9,15}$'
      then regexp_replace(profile.phone, '[^0-9]', '', 'g')
    when regexp_replace(coalesce(auth_user.raw_user_meta_data ->> 'phone', ''), '[^0-9]', '', 'g') ~ '^[0-9]{9,15}$'
      then regexp_replace(auth_user.raw_user_meta_data ->> 'phone', '[^0-9]', '', 'g')
    else profile.phone
  end,
  city = coalesce(
    nullif(trim(profile.city), ''),
    nullif(trim(auth_user.raw_user_meta_data ->> 'city'), '')
  ),
  region = case
    when trim(profile.region) in ('', 'Peru')
      then coalesce(
        nullif(trim(auth_user.raw_user_meta_data ->> 'region'), ''),
        profile.region
      )
    else profile.region
  end
from auth.users as auth_user
where profile.id = auth_user.id;

create or replace function public.listing_meets_publish_requirements(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.listings l
    where l.id = p_listing_id
      and nullif(trim(coalesce(l.brand, '')), '') is not null
      and nullif(trim(coalesce(l.model, '')), '') is not null
      and nullif(trim(coalesce(l.category, '')), '') is not null
      and nullif(trim(coalesce(l.instrument_type, '')), '') is not null
      and (
        (l.instrument_type = 'other' and l.category in (
          'guitars', 'basses', 'drums', 'cymbals', 'microphones',
          'pedals', 'amplifiers', 'audio interfaces'
        ))
        or (l.category = 'guitars' and l.instrument_type in ('electric_guitar', 'acoustic_guitar'))
        or (l.category = 'basses' and l.instrument_type = 'bass')
        or (l.category = 'drums' and l.instrument_type = 'drums')
        or (l.category = 'cymbals' and l.instrument_type = 'cymbals')
        or (l.category = 'microphones' and l.instrument_type = 'microphones')
        or (l.category = 'pedals' and l.instrument_type = 'pedals')
        or (l.category = 'amplifiers' and l.instrument_type = 'amplifiers')
        or (l.category = 'audio interfaces' and l.instrument_type = 'audio_interface')
      )
      and nullif(trim(coalesce(l.condition, '')), '') is not null
      and nullif(trim(coalesce(l.city, '')), '') is not null
      and nullif(trim(coalesce(l.region, '')), '') is not null
      and nullif(trim(coalesce(l.whatsapp_phone, '')), '') is not null
      and l.price_pen is not null
      and l.price_pen > 0
      and length(trim(coalesce(l.description, ''))) >= 40
      and l.marketplace_rules_accepted_at is not null
      and (
        select count(*)
        from public.listing_photos lp
        where lp.listing_id = l.id
      ) between 2 and 10
  );
$$;
