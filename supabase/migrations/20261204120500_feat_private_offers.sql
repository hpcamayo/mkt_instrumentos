-- Selling tools, sell-05 "Oferta a interesados" (docs/feature-ideas/selling-tools.md). The seller sends one private
-- price to everyone who saved the listing, in the app and by e-mail, for a few days; the public price does not change.
-- The person sees it on the listing with a WhatsApp button that quotes it. Once per listing every 7 days. Laria does
-- not hold the price for anyone: the seller honours it by WhatsApp like any other price.

create table public.listing_private_offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  price_pen integer not null check (price_pen >= 1),
  public_price_pen integer not null,
  message text check (message is null or char_length(message) <= 200),
  valid_until timestamptz not null,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  recipient_count integer not null check (recipient_count >= 1),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint listing_private_offers_price_check check (price_pen < public_price_pen),
  constraint listing_private_offers_valid_check check (valid_until > created_at)
);
create index if not exists listing_private_offers_owner_user_idx on public.listing_private_offers (owner_user_id);

create index listing_private_offers_listing_idx on public.listing_private_offers(listing_id, created_at desc);

create table public.listing_private_offer_recipients (
  offer_id uuid not null references public.listing_private_offers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (offer_id, user_id)
);

create index listing_private_offer_recipients_user_idx on public.listing_private_offer_recipients(user_id);

alter table public.listing_private_offers enable row level security;
alter table public.listing_private_offer_recipients enable row level security;
revoke all on public.listing_private_offers, public.listing_private_offer_recipients from anon, authenticated;

-- What the seller sees before sending: how many people saved it, and when the next offer is allowed.
create or replace function public.get_private_offer_audience(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_listing public.listings%rowtype;
  v_last public.listing_private_offers%rowtype;
begin
  select * into v_listing from public.listings where id = p_listing_id and owner_user_id = auth.uid();
  if not found then
    return null;
  end if;
  select * into v_last from public.listing_private_offers where listing_id = p_listing_id order by created_at desc limit 1;
  return jsonb_build_object(
    'saves', (select count(*) from public.favorites f where f.listing_id = p_listing_id and f.user_id <> v_listing.owner_user_id),
    'price_pen', v_listing.price_pen,
    'is_public', public.listing_is_public(p_listing_id) and v_listing.stock_state is distinct from 'out_of_stock',
    'last_offer', case when v_last.id is null then null else jsonb_build_object(
      'id', v_last.id, 'price_pen', v_last.price_pen, 'valid_until', v_last.valid_until, 'status', v_last.status,
      'recipient_count', v_last.recipient_count, 'created_at', v_last.created_at) end,
    'next_allowed_at', case when v_last.id is null then null else v_last.created_at + interval '7 days' end
  );
end;
$$;

-- p_days: 1 to 7; the offer lasts until the end of that day in Lima.
create or replace function public.send_private_offer(p_listing_id uuid, p_price_pen integer, p_days integer, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  uid uuid := auth.uid();
  v_listing public.listings%rowtype;
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_valid timestamptz;
  v_offer_id uuid;
  v_count integer := 0;
  v_store_owner uuid;
  recipient record;
  v_notification uuid;
begin
  if uid is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED: Inicia sesión para continuar.';
  end if;
  select * into v_listing from public.listings where id = p_listing_id and owner_user_id = uid for update;
  if not found then
    raise exception 'LISTING_NOT_OWNED: No encontramos esa publicación en tu cuenta.';
  end if;
  if not public.listing_is_public(v_listing.id) or v_listing.stock_state = 'out_of_stock' then
    raise exception 'PRIVATE_OFFER_NOT_PUBLIC: La oferta se envía desde una publicación en línea.';
  end if;
  if p_price_pen is null or p_price_pen >= v_listing.price_pen or p_price_pen < 1 then
    raise exception 'PRIVATE_OFFER_PRICE_INVALID: El precio de la oferta debe ser menor que el publicado.';
  end if;
  if p_price_pen * 5 < v_listing.price_pen then
    raise exception 'PRIVATE_OFFER_PRICE_TOO_LOW: La oferta no puede ser menor al 20%% del precio publicado.';
  end if;
  if p_days is null or p_days not between 1 and 7 then
    raise exception 'PRIVATE_OFFER_DAYS_INVALID: Elige de 1 a 7 días.';
  end if;
  if v_message is not null and (char_length(v_message) > 200 or laria_private.text_has_contact_details(v_message)) then
    raise exception 'PRIVATE_OFFER_MESSAGE_INVALID: El mensaje admite hasta 200 caracteres y sin teléfonos, correos ni enlaces.';
  end if;
  if exists (select 1 from public.listing_private_offers where listing_id = v_listing.id and created_at > now() - interval '7 days') then
    raise exception 'PRIVATE_OFFER_TOO_SOON: Ya enviaste una oferta esta semana para esta publicación.';
  end if;
  select owner_user_id into v_store_owner from public.stores where id = v_listing.store_id;
  -- The end of the chosen day in Lima.
  v_valid := (((now() at time zone 'America/Lima')::date + p_days + 1)::timestamp at time zone 'America/Lima') - interval '1 second';

  insert into public.listing_private_offers(listing_id, owner_user_id, price_pen, public_price_pen, message, valid_until, recipient_count)
  select v_listing.id, uid, p_price_pen, v_listing.price_pen, v_message, v_valid, count(*)
  from public.favorites f
  where f.listing_id = v_listing.id and f.user_id <> uid and f.user_id is distinct from v_store_owner
  having count(*) > 0
  returning id, recipient_count into v_offer_id, v_count;
  if v_offer_id is null then
    raise exception 'PRIVATE_OFFER_NO_AUDIENCE: Nadie guardó esta publicación todavía.';
  end if;

  for recipient in
    insert into public.listing_private_offer_recipients(offer_id, user_id)
    select v_offer_id, f.user_id from public.favorites f
    where f.listing_id = v_listing.id and f.user_id <> uid and f.user_id is distinct from v_store_owner
    returning user_id
  loop
    v_notification := laria_private.selling_notify(recipient.user_id, 'listing_private_offer',
      format('Oferta para ti: “%s” a S/ %s hasta el %s. El precio publicado sigue en S/ %s.',
        v_listing.title, to_char(p_price_pen, 'FM999G999G999'), to_char(v_valid at time zone 'America/Lima', 'DD/MM'),
        to_char(v_listing.price_pen, 'FM999G999G999')),
      v_listing.id, null);
    -- The same choice as price drops: a person who turned those e-mails off gets this one only in the app.
    if not exists (select 1 from public.email_preferences p where p.user_id = recipient.user_id and not p.price_drop_emails) then
      perform laria_private.enqueue_marketplace_email(
        'listing_private_offer', recipient.user_id, 'private_offer:' || v_offer_id::text || ':' || recipient.user_id::text,
        v_notification, v_listing.id, null,
        p_context => jsonb_build_object('selling', jsonb_build_object(
          'price_pen', p_price_pen, 'public_price_pen', v_listing.price_pen, 'valid_until', v_valid, 'message', v_message))
      );
    end if;
  end loop;
  return jsonb_build_object('id', v_offer_id, 'recipients', v_count, 'valid_until', v_valid);
end;
$$;

-- The seller withdraws it; it stops showing on the listing. The 7-day wait still counts from the first one.
create or replace function public.cancel_private_offer(p_offer_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.listing_private_offers
  set status = 'cancelled', cancelled_at = now()
  where id = p_offer_id and owner_user_id = auth.uid() and status = 'active' and valid_until > now();
  return found;
end;
$$;

-- The offer the signed-in person received for this listing, while it lasts and the listing is public.
create or replace function public.get_my_private_offer(p_listing_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', o.id, 'price_pen', o.price_pen, 'public_price_pen', o.public_price_pen,
    'valid_until', o.valid_until, 'message', o.message)
  from public.listing_private_offers o
  join public.listing_private_offer_recipients r on r.offer_id = o.id and r.user_id = auth.uid()
  join public.listings l on l.id = o.listing_id
  where o.listing_id = p_listing_id and o.status = 'active' and o.valid_until > now()
    and o.price_pen < l.price_pen and l.stock_state is distinct from 'out_of_stock'
    and public.listing_is_public(p_listing_id)
  order by o.created_at desc
  limit 1;
$$;

revoke all on function public.get_private_offer_audience(uuid), public.send_private_offer(uuid, integer, integer, text),
  public.cancel_private_offer(uuid), public.get_my_private_offer(uuid) from public, anon;
grant execute on function public.get_private_offer_audience(uuid), public.send_private_offer(uuid, integer, integer, text),
  public.cancel_private_offer(uuid), public.get_my_private_offer(uuid) to authenticated;

-- ------------------------------------------------------------------ the selling tools at a glance

-- For "Mis publicaciones" and the store's inventory list: which tools each of the owner's listings uses.
create or replace function public.get_listing_selling_tools(p_listing_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(l.id, jsonb_build_object(
    'price_steps', (select ps.status from public.listing_price_steps ps where ps.listing_id = l.id),
    'private_offer', (select case when o.status = 'active' and o.valid_until > now() then 'active' else null end
                      from public.listing_private_offers o where o.listing_id = l.id order by o.created_at desc limit 1),
    'consignment', (select c.status from public.listing_consignments c where c.listing_id = l.id and c.status in ('invited', 'active') limit 1),
    'part_payment', case when l.seller_type = 'store' then public.listing_accepts_part_payment(l.id) else null end,
    'trade_requests', (select count(*) from public.trade_requests r where r.listing_id = l.id and r.status = 'open' and r.offers_until > now()
                        and not exists (select 1 from public.trade_offers o where o.request_id = r.id and o.store_id = l.store_id)),
    'saves', (select count(*) from public.favorites f where f.listing_id = l.id and f.user_id <> l.owner_user_id)
  )), '{}'::jsonb)
  from public.listings l
  where l.id = any((coalesce(p_listing_ids, '{}'::uuid[]))[1:200]) and l.owner_user_id = auth.uid();
$$;

revoke all on function public.get_listing_selling_tools(uuid[]) from public, anon;
grant execute on function public.get_listing_selling_tools(uuid[]) to authenticated;

-- What the listing page adds for a visitor, in one read: the consignment label, whether the store takes gear as part
-- payment and, for a signed-in person, the private offer they received.
create or replace function public.get_listing_selling_public(p_listing_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'consignment', public.get_listing_consignment(p_listing_id),
    'part_payment', public.listing_accepts_part_payment(p_listing_id)
      and not exists (select 1 from public.listings l where l.id = p_listing_id and l.owner_user_id is not distinct from auth.uid()),
    'private_offer', case when auth.uid() is null then null else public.get_my_private_offer(p_listing_id) end,
    'is_owner', auth.uid() is not null and exists (select 1 from public.listings l where l.id = p_listing_id and l.owner_user_id = auth.uid())
  );
$$;

grant execute on function public.get_listing_selling_public(uuid) to anon, authenticated;
