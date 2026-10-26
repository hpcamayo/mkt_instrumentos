-- Feature ideas, batch listing-details (docs/feature-ideas/listing-details.md), buy-01 "Combo".
--
-- A buyer gathers several listings of one seller into a combo kept on their device (nothing is stored here) and
-- sends one WhatsApp message. The database holds the two things a seller declares:
--
--   public.seller_bundle_offers  "10% menos llevando 2 o más": one offer per Particular (owner_user_id) or per store
--                                (store_id). Shown on that seller's listings. The seller honours it; Laria never
--                                computes a final price, takes a payment or guarantees the discount.
--   public.listing_companions    "Lo que suele acompañarlo": up to 6 listings of the same store attached to one of
--                                its listings (a case, a cable, a stand). Readable while both listings are public.
--
-- Both are written only through the RPCs below, by the seller.

-- ------------------------------------------------------------------ bundle offers

create table if not exists public.seller_bundle_offers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  discount_percent integer not null check (discount_percent between 5 and 30),
  min_items integer not null default 2 check (min_items between 2 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_bundle_offers_one_seller check ((owner_user_id is null) <> (store_id is null))
);

create unique index if not exists seller_bundle_offers_owner_idx on public.seller_bundle_offers (owner_user_id)
  where owner_user_id is not null;
create unique index if not exists seller_bundle_offers_store_idx on public.seller_bundle_offers (store_id)
  where store_id is not null;

comment on table public.seller_bundle_offers is
  'buy-01: a seller''s declared combo discount. Particular offers apply to their own listings, store offers to the '
  'store''s. Public read; written through set_bundle_offer.';

alter table public.seller_bundle_offers enable row level security;

drop policy if exists "Anyone can read bundle offers" on public.seller_bundle_offers;
create policy "Anyone can read bundle offers" on public.seller_bundle_offers
  for select to anon, authenticated using (true);

revoke all on table public.seller_bundle_offers from anon, authenticated;
grant select (id, owner_user_id, store_id, discount_percent, min_items, updated_at)
  on public.seller_bundle_offers to anon, authenticated;
grant all on table public.seller_bundle_offers to service_role;

-- p_store_id null: the signed-in Particular's own offer; otherwise the offer of a store they own. A null discount
-- removes the offer. Returns the offer, or null once removed.
create or replace function public.set_bundle_offer(p_store_id uuid, p_discount_percent integer, p_min_items integer default 2)
returns public.seller_bundle_offers
language plpgsql
security definer
set search_path = public
as $$
declare offer public.seller_bundle_offers;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'BUNDLE_OFFER_NOT_ALLOWED: Inicia sesión para ofrecer un combo.';
  end if;
  if p_store_id is null then
    if not exists (select 1 from public.profiles where id = auth.uid() and account_type = 'seller') then
      raise exception 'BUNDLE_OFFER_NOT_ALLOWED: Solo un vendedor puede ofrecer un combo.';
    end if;
  elsif not exists (
    select 1 from public.stores
    where id = p_store_id and owner_user_id = auth.uid() and status in ('pending', 'active')
  ) then
    raise exception 'BUNDLE_OFFER_NOT_ALLOWED: No puedes cambiar los combos de esta tienda.';
  end if;

  if p_discount_percent is null then
    delete from public.seller_bundle_offers
    where (p_store_id is null and owner_user_id = auth.uid()) or (p_store_id is not null and store_id = p_store_id);
    return null;
  end if;
  if p_discount_percent not between 5 and 30 or coalesce(p_min_items, 2) not between 2 and 5 then
    raise exception 'BUNDLE_OFFER_INVALID: El descuento va de 5%% a 30%%, llevando de 2 a 5 productos.';
  end if;

  if p_store_id is null then
    insert into public.seller_bundle_offers(owner_user_id, discount_percent, min_items)
    values (auth.uid(), p_discount_percent, coalesce(p_min_items, 2))
    on conflict (owner_user_id) where owner_user_id is not null
    do update set discount_percent = excluded.discount_percent, min_items = excluded.min_items, updated_at = now()
    returning * into offer;
  else
    insert into public.seller_bundle_offers(store_id, discount_percent, min_items)
    values (p_store_id, p_discount_percent, coalesce(p_min_items, 2))
    on conflict (store_id) where store_id is not null
    do update set discount_percent = excluded.discount_percent, min_items = excluded.min_items, updated_at = now()
    returning * into offer;
  end if;
  return offer;
end;
$$;

revoke all on function public.set_bundle_offer(uuid, integer, integer) from public, anon;
grant execute on function public.set_bundle_offer(uuid, integer, integer) to authenticated;

-- ------------------------------------------------------------------ companions

create table if not exists public.listing_companions (
  listing_id uuid not null references public.listings(id) on delete cascade,
  companion_id uuid not null references public.listings(id) on delete cascade,
  sort_order smallint not null default 0 check (sort_order between 0 and 5),
  created_at timestamptz not null default now(),
  primary key (listing_id, companion_id),
  constraint listing_companions_not_self check (listing_id <> companion_id)
);

create index if not exists listing_companions_companion_idx on public.listing_companions (companion_id);

comment on table public.listing_companions is
  'buy-01: "Lo que suele acompañarlo", listings of the same store a store attaches to one of its listings. Public '
  'while both listings are public; written through set_listing_companions.';

alter table public.listing_companions enable row level security;

drop policy if exists "Public companions of public listings" on public.listing_companions;
create policy "Public companions of public listings" on public.listing_companions
  for select to anon, authenticated
  using (public.listing_is_public(listing_id) and public.listing_is_public(companion_id));

drop policy if exists "Store owners read their companions" on public.listing_companions;
create policy "Store owners read their companions" on public.listing_companions
  for select to authenticated
  using (exists (
    select 1 from public.listings l join public.stores s on s.id = l.store_id
    where l.id = listing_companions.listing_id and s.owner_user_id = auth.uid()
  ));

revoke all on table public.listing_companions from anon, authenticated;
grant select on table public.listing_companions to anon, authenticated;
grant all on table public.listing_companions to service_role;

-- Replaces the listing's companions with p_companion_ids, in that order. The listing and every companion must be
-- listings of one store the caller owns, not sold or archived.
create or replace function public.set_listing_companions(p_listing_id uuid, p_companion_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_record public.listings;
  ids uuid[];
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'LISTING_NOT_OWNED: No puedes editar esta publicación.';
  end if;
  select * into listing_record from public.listings where id = p_listing_id for update;
  if not found or listing_record.store_id is null or not exists (
    select 1 from public.stores where id = listing_record.store_id and owner_user_id = auth.uid()
  ) then
    raise exception 'LISTING_NOT_OWNED: No puedes editar esta publicación.';
  end if;

  select coalesce(array_agg(id order by first_position), '{}') into ids
  from (
    select id, min(position) as first_position
    from unnest(coalesce(p_companion_ids, '{}')) with ordinality as given(id, position)
    where id is not null
    group by id
  ) distinct_ids;

  if cardinality(ids) > 6 then
    raise exception 'COMPANIONS_INVALID: Elige hasta 6 productos.';
  end if;
  if p_listing_id = any(ids) or exists (
    select 1 from unnest(ids) as chosen(id)
    where not exists (
      select 1 from public.listings companion
      where companion.id = chosen.id and companion.store_id = listing_record.store_id
        and companion.status not in ('sold', 'archived')
    )
  ) then
    raise exception 'COMPANIONS_INVALID: Elige productos de tu tienda que sigan a la venta.';
  end if;

  delete from public.listing_companions where listing_id = p_listing_id and not (companion_id = any(ids));
  insert into public.listing_companions(listing_id, companion_id, sort_order)
  select p_listing_id, chosen.id, (chosen.position - 1)::smallint
  from unnest(ids) with ordinality as chosen(id, position)
  on conflict (listing_id, companion_id) do update set sort_order = excluded.sort_order;
  return cardinality(ids);
end;
$$;

revoke all on function public.set_listing_companions(uuid, uuid[]) from public, anon;
grant execute on function public.set_listing_companions(uuid, uuid[]) to authenticated;
