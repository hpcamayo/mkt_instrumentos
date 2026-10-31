-- Feature ideas, batch listing-details (docs/feature-ideas/listing-details.md): a listing's sale terms.
--
--   sell-07 "Precio fijo o conversable"  price_mode: fixed | negotiable | null (not said).
--   buy-02  "Cómo se entrega"            delivery_pickup + pickup_area (a district or area, never an address);
--                                        can_try ("Se puede probar"); lima_delivery: buyer | seller | agree (who pays a
--                                        delivery in Lima); ships_provinces + shipping_carriers (shalom, olva, other)
--                                        + shipping_payment: origin (the seller pays when sending) | destination (the
--                                        buyer pays at the agency).
--   sell-06 "Acepto cambios por..."      accepts_trades + trade_wants (free text, no contact details) +
--                                        trade_categories (the marketplace's categories).
--
-- Every value is what the seller says; Laria never handles the money, the parcel or the trade. Three of them are
-- flags a buyer can filter on and save in an alert: envia_provincia, se_puede_probar, acepta_cambios.
--
-- They arrive as the "sale_terms" key of the listing details (20261202120100): laria_private.write_listing_sale_terms
-- stores the keys it is given and leaves the others as they are; laria_private.copy_listing_sale_terms carries them
-- to a duplicate or a relisted copy. A direct owner update of these columns is held to the same checks.

alter table public.listings
  add column if not exists price_mode text,
  add column if not exists delivery_pickup boolean not null default false,
  add column if not exists pickup_area text,
  add column if not exists can_try boolean not null default false,
  add column if not exists lima_delivery text,
  add column if not exists ships_provinces boolean not null default false,
  add column if not exists shipping_carriers text[] not null default '{}',
  add column if not exists shipping_payment text,
  add column if not exists accepts_trades boolean not null default false,
  add column if not exists trade_wants text,
  add column if not exists trade_categories text[] not null default '{}';

alter table public.listings
  add constraint listings_price_mode_check check (price_mode is null or price_mode in ('fixed', 'negotiable')),
  add constraint listings_pickup_area_check check (pickup_area is null or char_length(pickup_area) between 2 and 60),
  add constraint listings_lima_delivery_check check (lima_delivery is null or lima_delivery in ('buyer', 'seller', 'agree')),
  add constraint listings_shipping_carriers_check check (
    shipping_carriers <@ array['shalom', 'olva', 'other']::text[] and (ships_provinces or cardinality(shipping_carriers) = 0)),
  add constraint listings_shipping_payment_check check (
    shipping_payment is null or (ships_provinces and shipping_payment in ('origin', 'destination'))),
  add constraint listings_trade_wants_check check (
    trade_wants is null or (accepts_trades and char_length(trade_wants) between 2 and 200)),
  add constraint listings_trade_categories_check check (
    trade_categories <@ array['guitars', 'basses', 'keyboards', 'percussion', 'winds', 'strings', 'pedals', 'amplifiers',
      'microphones', 'audio']::text[]
    and cardinality(trade_categories) <= 10
    and (accepts_trades or cardinality(trade_categories) = 0));

comment on column public.listings.price_mode is 'sell-07: fixed or negotiable, as the seller says; null when not said.';
comment on column public.listings.pickup_area is 'buy-02: where to pick up or try the instrument, a district or area. Never an address.';
comment on column public.listings.lima_delivery is 'buy-02: who pays a delivery in Lima: buyer, seller, or agree (they agree on it).';
comment on column public.listings.shipping_payment is 'buy-02: origin (paid when sending) or destination (paid at the agency).';
comment on column public.listings.trade_wants is 'sell-06: what the seller would take in trade, in their words. No contact details.';

-- ------------------------------------------------------------------ the rules every write meets

-- Free text a buyer reads goes through the same contact-detail check as titles and descriptions.
create or replace function laria_private.check_listing_sale_terms()
returns trigger
language plpgsql
security definer
set search_path = public, laria_private
as $$
begin
  if new.pickup_area is not null and laria_private.text_has_contact_details(new.pickup_area) then
    raise exception 'SALE_TERMS_CONTACT_DETAILS: Indica solo el distrito o la zona, sin teléfonos, correos ni enlaces.';
  end if;
  if new.trade_wants is not null and laria_private.text_has_contact_details(new.trade_wants) then
    raise exception 'SALE_TERMS_CONTACT_DETAILS: Describe el cambio sin teléfonos, correos ni enlaces.';
  end if;
  return new;
end;
$$;

drop trigger if exists listings_check_sale_terms on public.listings;
create trigger listings_check_sale_terms
before insert or update of pickup_area, trade_wants on public.listings
for each row execute function laria_private.check_listing_sale_terms();

-- The flags (20261202120100): this batch's trigger, after listings_flags_a_reset.
create or replace function laria_private.listing_flags_listing_details()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.ships_provinces then new.listing_flags := array_append(new.listing_flags, 'envia_provincia'); end if;
  if new.can_try then new.listing_flags := array_append(new.listing_flags, 'se_puede_probar'); end if;
  if new.accepts_trades then new.listing_flags := array_append(new.listing_flags, 'acepta_cambios'); end if;
  return new;
end;
$$;

drop trigger if exists listings_flags_listing_details on public.listings;
create trigger listings_flags_listing_details
before insert or update on public.listings
for each row execute function laria_private.listing_flags_listing_details();

insert into laria_private.listing_flag_filters(flag, label, sort_order) values
  ('envia_provincia', 'Envía a provincia', 10),
  ('se_puede_probar', 'Se puede probar', 20),
  ('acepta_cambios', 'Acepta cambios', 30)
on conflict (flag) do update set label = excluded.label, sort_order = excluded.sort_order;

-- A change to the terms is a change a buyer reads ("Actualizado hace 3 días"). This trigger's name sorts after
-- listings_track_content_change, which resets content_changed_at to its old value on every update.
create or replace function laria_private.track_listing_sale_terms_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if row(new.price_mode, new.delivery_pickup, new.pickup_area, new.can_try, new.lima_delivery, new.ships_provinces,
         new.shipping_carriers, new.shipping_payment, new.accepts_trades, new.trade_wants, new.trade_categories)
     is distinct from
     row(old.price_mode, old.delivery_pickup, old.pickup_area, old.can_try, old.lima_delivery, old.ships_provinces,
         old.shipping_carriers, old.shipping_payment, old.accepts_trades, old.trade_wants, old.trade_categories) then
    new.content_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists listings_ux_sale_terms_changed on public.listings;
create trigger listings_ux_sale_terms_changed
before update of price_mode, delivery_pickup, pickup_area, can_try, lima_delivery, ships_provinces, shipping_carriers,
  shipping_payment, accepts_trades, trade_wants, trade_categories on public.listings
for each row execute function laria_private.track_listing_sale_terms_change();

revoke all on function laria_private.check_listing_sale_terms() from public, anon, authenticated;
revoke all on function laria_private.listing_flags_listing_details() from public, anon, authenticated;
revoke all on function laria_private.track_listing_sale_terms_change() from public, anon, authenticated;

-- ------------------------------------------------------------------ the writer and the copier

-- p_terms: { price_mode, pickup, pickup_area, can_try, lima_delivery, ships_provinces, carriers, shipping_payment,
-- accepts_trades, trade_wants, trade_categories }. A key that is absent keeps its value; null clears it. Values that
-- depend on a switch are cleared with it (no carriers without shipping, no trade text without trades).
create or replace function laria_private.write_listing_sale_terms(p_listing_id uuid, p_terms jsonb)
returns void
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  current_row public.listings;
  v_price_mode text;
  v_pickup boolean;
  v_pickup_area text;
  v_can_try boolean;
  v_lima text;
  v_ships boolean;
  v_carriers text[];
  v_payment text;
  v_trades boolean;
  v_wants text;
  v_categories text[];
begin
  if p_terms is null or p_terms = 'null'::jsonb then
    return;
  end if;
  if jsonb_typeof(p_terms) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_terms) as given(key)
    where given.key not in ('price_mode', 'pickup', 'pickup_area', 'can_try', 'lima_delivery', 'ships_provinces',
      'carriers', 'shipping_payment', 'accepts_trades', 'trade_wants', 'trade_categories')
  ) then
    raise exception 'SALE_TERMS_INVALID: Las condiciones de venta no son válidas.';
  end if;

  select * into current_row from public.listings where id = p_listing_id;
  if not found then
    raise exception 'LISTING_NOT_FOUND';
  end if;

  begin
    v_price_mode := case when p_terms ? 'price_mode' then p_terms->>'price_mode' else current_row.price_mode end;
    v_pickup := case when p_terms ? 'pickup' then coalesce((p_terms->>'pickup')::boolean, false) else current_row.delivery_pickup end;
    v_pickup_area := case when p_terms ? 'pickup_area'
      then nullif(regexp_replace(trim(coalesce(p_terms->>'pickup_area', '')), '\s+', ' ', 'g'), '')
      else current_row.pickup_area end;
    v_can_try := case when p_terms ? 'can_try' then coalesce((p_terms->>'can_try')::boolean, false) else current_row.can_try end;
    v_lima := case when p_terms ? 'lima_delivery' then p_terms->>'lima_delivery' else current_row.lima_delivery end;
    v_ships := case when p_terms ? 'ships_provinces' then coalesce((p_terms->>'ships_provinces')::boolean, false) else current_row.ships_provinces end;
    v_carriers := case when p_terms ? 'carriers' then array(
        select distinct value from jsonb_array_elements_text(coalesce(nullif(p_terms->'carriers', 'null'::jsonb), '[]'::jsonb)) value order by value)
      else current_row.shipping_carriers end;
    v_payment := case when p_terms ? 'shipping_payment' then p_terms->>'shipping_payment' else current_row.shipping_payment end;
    v_trades := case when p_terms ? 'accepts_trades' then coalesce((p_terms->>'accepts_trades')::boolean, false) else current_row.accepts_trades end;
    v_wants := case when p_terms ? 'trade_wants'
      then nullif(regexp_replace(trim(coalesce(p_terms->>'trade_wants', '')), '\s+', ' ', 'g'), '')
      else current_row.trade_wants end;
    v_categories := case when p_terms ? 'trade_categories' then array(
        select distinct value from jsonb_array_elements_text(coalesce(nullif(p_terms->'trade_categories', 'null'::jsonb), '[]'::jsonb)) value order by value)
      else current_row.trade_categories end;
  exception when others then
    raise exception 'SALE_TERMS_INVALID: Las condiciones de venta no son válidas.';
  end;

  if not v_ships then v_carriers := '{}'; v_payment := null; end if;
  if not v_trades then v_wants := null; v_categories := '{}'; end if;
  if not (v_pickup or v_can_try) then v_pickup_area := null; end if;

  if v_price_mode is not null and v_price_mode not in ('fixed', 'negotiable') then
    raise exception 'SALE_TERMS_INVALID: Elige precio fijo o conversable.';
  end if;
  if v_lima is not null and v_lima not in ('buyer', 'seller', 'agree') then
    raise exception 'SALE_TERMS_INVALID: Elige quién paga el delivery en Lima.';
  end if;
  if not v_carriers <@ array['shalom', 'olva', 'other']::text[] then
    raise exception 'SALE_TERMS_INVALID: Elige Shalom, Olva u otra agencia.';
  end if;
  if v_payment is not null and v_payment not in ('origin', 'destination') then
    raise exception 'SALE_TERMS_INVALID: Elige cómo se paga el envío.';
  end if;
  if v_pickup_area is not null and char_length(v_pickup_area) not between 2 and 60 then
    raise exception 'SALE_TERMS_INVALID: El distrito o la zona debe tener entre 2 y 60 caracteres.';
  end if;
  if v_wants is not null and char_length(v_wants) not between 2 and 200 then
    raise exception 'SALE_TERMS_INVALID: Lo que aceptas en cambio debe tener entre 2 y 200 caracteres.';
  end if;
  if not v_categories <@ array['guitars', 'basses', 'keyboards', 'percussion', 'winds', 'strings', 'pedals', 'amplifiers',
      'microphones', 'audio']::text[] or cardinality(v_categories) > 10 then
    raise exception 'SALE_TERMS_INVALID: Elige categorías del catálogo.';
  end if;

  update public.listings
  set price_mode = v_price_mode,
      delivery_pickup = v_pickup,
      pickup_area = v_pickup_area,
      can_try = v_can_try,
      lima_delivery = v_lima,
      ships_provinces = v_ships,
      shipping_carriers = v_carriers,
      shipping_payment = v_payment,
      accepts_trades = v_trades,
      trade_wants = v_wants,
      trade_categories = v_categories
  where id = p_listing_id
    and row(price_mode, delivery_pickup, pickup_area, can_try, lima_delivery, ships_provinces, shipping_carriers,
            shipping_payment, accepts_trades, trade_wants, trade_categories)
        is distinct from
        row(v_price_mode, v_pickup, v_pickup_area, v_can_try, v_lima, v_ships, v_carriers, v_payment, v_trades, v_wants,
            v_categories);
end;
$$;

create or replace function laria_private.copy_listing_sale_terms(p_source_id uuid, p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = public, laria_private
as $$
begin
  update public.listings target
  set price_mode = source.price_mode,
      delivery_pickup = source.delivery_pickup,
      pickup_area = source.pickup_area,
      can_try = source.can_try,
      lima_delivery = source.lima_delivery,
      ships_provinces = source.ships_provinces,
      shipping_carriers = source.shipping_carriers,
      shipping_payment = source.shipping_payment,
      accepts_trades = source.accepts_trades,
      trade_wants = source.trade_wants,
      trade_categories = source.trade_categories
  from public.listings source
  where source.id = p_source_id and target.id = p_target_id;
end;
$$;

revoke all on function laria_private.write_listing_sale_terms(uuid, jsonb) from public, anon, authenticated;
revoke all on function laria_private.copy_listing_sale_terms(uuid, uuid) from public, anon, authenticated;

insert into laria_private.listing_detail_writers(key, writer, copier, owner_batch, note) values (
  'sale_terms',
  'laria_private.write_listing_sale_terms(uuid,jsonb)',
  'laria_private.copy_listing_sale_terms(uuid,uuid)',
  'listing-details',
  'sell-07 price mode, buy-02 delivery and try-out, sell-06 trades'
) on conflict (key) do update set writer = excluded.writer, copier = excluded.copier, owner_batch = excluded.owner_batch,
  note = excluded.note;
