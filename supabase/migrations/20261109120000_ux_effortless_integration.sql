-- Effortless Laria, integration (docs/ux-effortless/integration.md): where two batches built the same thing, one rule.

-- ------------------------------------------------------------------------------ FIND 10 and list-05: price drops

-- A drop shown anywhere is the listing batch's real drop (20261102140000, list-05: at least 5% below a price held for
-- 7 days, shown for 30 days, kept by the trigger in previous_price_pen and price_dropped_at). This computed field gives
-- the "Bajaron de precio" order and the home's row (FIND 10) exactly the drops the cards and the listing page show as
-- "Antes S/". It reads only the row it is given, so it needs no extra rights.
create or replace function public.recent_price_drop_at(p_listing public.listings)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case
    when p_listing.status = 'approved'
      and p_listing.previous_price_pen > p_listing.price_pen
      and p_listing.price_dropped_at > now() - interval '30 days'
    then p_listing.price_dropped_at
  end
$$;

revoke all on function public.recent_price_drop_at(public.listings) from public;
grant execute on function public.recent_price_drop_at(public.listings) to anon, authenticated;

-- ------------------------------------------------------------- list-10, trust-03 and list-12: a store's street address

-- The listing batch's "Tienda verificada" explainer (20261102140000) listed a verified store's street address on every
-- listing, while the stores batch shows it on the store's own page only when the store agrees (list-12, show_address,
-- off by default). One rule (UXD-integration-11): the explainer gets public_address, so the street appears only where
-- the store chose to show it, and address_checked says Laria checked one. Everything else is unchanged.
create or replace function public.get_public_seller_facts(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  listing_row public.listings;
  store_row public.stores;
  owner_id uuid;
  last_seen timestamptz;
  sales integer;
  verified_since timestamptz;
  facts jsonb;
begin
  select * into listing_row from public.listings where id = p_listing_id;
  if listing_row.id is null
     or not (public.listing_is_public(p_listing_id) or listing_row.status = 'sold') then
    return null;
  end if;

  if listing_row.seller_type = 'store' and listing_row.store_id is not null then
    select * into store_row from public.stores where id = listing_row.store_id and status = 'active';
    if store_row.id is null then return null; end if;
    owner_id := store_row.owner_user_id;
    select count(*) into sales from public.verified_transactions where store_id = store_row.id;
  else
    owner_id := listing_row.owner_user_id;
    if owner_id is not null then
      select count(*) into sales from public.verified_transactions where seller_user_id = owner_id and store_id is null;
    end if;
  end if;

  if owner_id is not null then
    select u.last_sign_in_at into last_seen from auth.users u where u.id = owner_id;
  end if;

  facts := jsonb_build_object(
    'member_since', case
      when store_row.id is not null then store_row.created_at
      else (select p.created_at from public.profiles p where p.id = owner_id) end,
    'last_active', case
      when last_seen is null then null
      when last_seen >= now() - interval '1 day' then 'today'
      when last_seen >= now() - interval '7 days' then 'week'
      when last_seen >= now() - interval '30 days' then 'month'
      else null end,
    'verified_sales', coalesce(sales, 0),
    'email_confirmed', owner_id is not null and exists (
      select 1 from auth.users u where u.id = owner_id and coalesce(u.email_confirmed_at, u.confirmed_at) is not null)
  );

  if store_row.id is not null and store_row.is_verified then
    select max(a.created_at) into verified_since
    from public.admin_audit_actions a
    where a.target_type = 'store' and a.target_id = store_row.id and a.action = 'store_verified';

    facts := facts || jsonb_build_object('store', jsonb_build_object(
      'ruc', store_row.ruc,
      'razon_social', store_row.razon_social,
      -- list-12: the street only while the store shows it on its page; otherwise only that Laria checked one.
      'address', store_row.public_address,
      'address_checked', nullif(btrim(coalesce(store_row.address, '')), '') is not null,
      'district', store_row.district,
      'city', store_row.city,
      'phone_on_file', regexp_replace(coalesce(store_row.whatsapp_phone, ''), '[^0-9]', '', 'g') <> '',
      'verified_since', verified_since
    ));
  end if;

  return facts;
end;
$$;

revoke all on function public.get_public_seller_facts(uuid) from public;
grant execute on function public.get_public_seller_facts(uuid) to anon, authenticated, service_role;
