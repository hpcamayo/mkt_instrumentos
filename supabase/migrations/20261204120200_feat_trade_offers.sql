-- Selling tools, sell-02 "Véndelo a una tienda" and run-04 "Parte de pago" (docs/feature-ideas/selling-tools.md).
--
-- sell-02: a Particular describes a guitar, bass, amp, pedal or keyboard with photos; verified stores of the same
-- region that said they buy used gear in that category see it for 24 hours and send one offer each. The person picks
-- one within three more days; only then do the store and the person see each other's contact, and the person takes
-- the gear to the store within five days. The store checks it, agrees the final price and pays directly: Laria
-- never touches the money and the store only records whether it happened.
--
-- run-04: on a store listing that accepts part payment, a buyer describes the gear they would hand over (from Mi equipo
-- or typed) and that store answers with an estimate, by the same steps.
--
-- Photos go to the private bucket trade-photos at <user>/<request>/<n>.jpg, uploaded before the request exists (the
-- browser makes the request's id) and served only through /api/trade-photos after can_view_trade_photo().

-- ------------------------------------------------------------------ store settings

create table public.store_trade_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  -- sell-02 "Compramos usados", per category.
  buys_used boolean not null default false,
  buy_categories text[] not null default '{}'::text[]
    check (buy_categories <@ array['guitars', 'basses', 'amplifiers', 'pedals', 'keyboards']::text[]),
  -- sell-03: takes gear in consignment.
  consignment boolean not null default false,
  -- run-04: the default for the store's listings; a listing can say otherwise (listings.accepts_part_payment).
  part_payment boolean not null default false,
  -- buy-06: what the store stocks, for the reminders' "dónde comprarlas".
  consumables text[] not null default '{}'::text[]
    check (consumables <@ array['strings', 'reeds', 'drumheads']::text[]),
  note text check (note is null or char_length(note) <= 300),
  updated_at timestamptz not null default now(),
  constraint store_trade_settings_buys_used_check check (not buys_used or cardinality(buy_categories) > 0)
);

create trigger store_trade_settings_set_updated_at
before update on public.store_trade_settings
for each row execute function public.set_updated_at();

alter table public.store_trade_settings enable row level security;

-- What a store says it buys or takes is public, like the rest of its profile.
create policy "Public reads trade settings of active stores"
on public.store_trade_settings for select to anon, authenticated
using (exists (select 1 from public.stores s where s.id = store_id and s.status = 'active'));

create policy "Store owners read own trade settings"
on public.store_trade_settings for select to authenticated
using (exists (select 1 from public.stores s where s.id = store_id and s.owner_user_id = (select auth.uid())));

revoke insert, update, delete, truncate, references, trigger on public.store_trade_settings from anon, authenticated;
grant select on public.store_trade_settings to anon, authenticated;

-- p_fields: buys_used, buy_categories, consignment, part_payment, consumables, note. Buying used gear and consignment
-- need a verified store; part payment and consumables any active store.
create or replace function public.set_store_trade_settings(p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  v_store public.stores%rowtype;
  v_buys boolean := coalesce((p_fields->>'buys_used')::boolean, false);
  v_consignment boolean := coalesce((p_fields->>'consignment')::boolean, false);
  v_part boolean := coalesce((p_fields->>'part_payment')::boolean, false);
  v_categories text[];
  v_consumables text[];
  v_note text := nullif(trim(coalesce(p_fields->>'note', '')), '');
  saved public.store_trade_settings%rowtype;
begin
  select * into v_store from public.stores where id = laria_private.selling_own_store_id();
  if not found then
    raise exception using errcode = '42501', message = 'STORE_REQUIRED: Esta opción es para tiendas.';
  end if;
  if v_store.status <> 'active' then
    raise exception 'STORE_NOT_ACTIVE: Tu tienda debe estar activa para usar esta opción.';
  end if;
  if (v_buys or v_consignment) and not v_store.is_verified then
    raise exception 'STORE_NOT_VERIFIED: Comprar usados y recibir en consignación es para tiendas verificadas.';
  end if;
  select coalesce(array_agg(distinct value order by value), '{}') into v_categories
  from jsonb_array_elements_text(coalesce(p_fields->'buy_categories', '[]'::jsonb)) value;
  select coalesce(array_agg(distinct value order by value), '{}') into v_consumables
  from jsonb_array_elements_text(coalesce(p_fields->'consumables', '[]'::jsonb)) value;
  if not v_categories <@ array['guitars', 'basses', 'amplifiers', 'pedals', 'keyboards']::text[] then
    raise exception 'TRADE_CATEGORIES_INVALID: Elige categorías de la lista.';
  end if;
  if v_buys and cardinality(v_categories) = 0 then
    raise exception 'TRADE_CATEGORIES_REQUIRED: Elige al menos una categoría que compras.';
  end if;
  if not v_consumables <@ array['strings', 'reeds', 'drumheads']::text[] then
    raise exception 'TRADE_CONSUMABLES_INVALID: Elige de la lista.';
  end if;
  if v_note is not null and (char_length(v_note) > 300 or laria_private.text_has_contact_details(v_note)) then
    raise exception 'TRADE_NOTE_INVALID: La nota admite hasta 300 caracteres y sin teléfonos, correos ni enlaces.';
  end if;
  insert into public.store_trade_settings(store_id, buys_used, buy_categories, consignment, part_payment, consumables, note)
  values (v_store.id, v_buys, case when v_buys then v_categories else '{}' end, v_consignment, v_part, v_consumables, v_note)
  on conflict (store_id) do update
    set buys_used = excluded.buys_used, buy_categories = excluded.buy_categories, consignment = excluded.consignment,
        part_payment = excluded.part_payment, consumables = excluded.consumables, note = excluded.note
  returning * into saved;
  return to_jsonb(saved);
end;
$$;

revoke all on function public.set_store_trade_settings(jsonb) from public, anon;
grant execute on function public.set_store_trade_settings(jsonb) to authenticated;

-- A store that loses its verification or closes stops receiving requests: the reads below check both every time.

-- ------------------------------------------------------------------ part payment on a listing (run-04)

-- null: follow the store's default; true or false: this listing says otherwise. Only store listings use it.
alter table public.listings add column if not exists accepts_part_payment boolean;

create or replace function public.listing_accepts_part_payment(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select coalesce(l.accepts_part_payment, ts.part_payment, false)
    from public.listings l
    join public.stores s on s.id = l.store_id and s.status = 'active'
    left join public.store_trade_settings ts on ts.store_id = l.store_id
    where l.id = p_listing_id and l.seller_type = 'store' and l.status = 'approved'
  ), false);
$$;

grant execute on function public.listing_accepts_part_payment(uuid) to anon, authenticated;

-- The store's choice for one listing: true, false, or null to follow the store's default.
create or replace function public.set_listing_part_payment(p_listing_id uuid, p_value boolean)
returns boolean
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  v_store_id uuid := laria_private.selling_own_store_id();
  v_status public.listing_status;
  previous text := current_setting('app.allow_listing_admin_fields', true);
begin
  if v_store_id is null then
    raise exception using errcode = '42501', message = 'STORE_REQUIRED: Esta opción es para tiendas.';
  end if;
  select status into v_status from public.listings where id = p_listing_id and store_id = v_store_id for update;
  if v_status is null then
    raise exception 'LISTING_NOT_FOUND: No encontramos esa publicación en tu tienda.';
  end if;
  if v_status in ('sold', 'archived') then
    raise exception 'LISTING_CLOSED: Esa publicación ya no está activa.';
  end if;
  perform set_config('app.allow_listing_admin_fields', 'true', true);
  update public.listings set accepts_part_payment = p_value where id = p_listing_id;
  perform set_config('app.allow_listing_admin_fields', coalesce(previous, ''), true);
  return public.listing_accepts_part_payment(p_listing_id);
end;
$$;

revoke all on function public.set_listing_part_payment(uuid, boolean) from public, anon;
grant execute on function public.set_listing_part_payment(uuid, boolean) to authenticated;

-- ------------------------------------------------------------------ requests and offers

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('trade-photos', 'trade-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.trade_requests (
  -- Made by the browser, so the photos can be uploaded under it before the request is sent.
  id uuid primary key,
  kind text not null check (kind in ('sell', 'part_payment')),
  requester_user_id uuid not null references public.profiles(id) on delete cascade,
  gear_item_id uuid references public.gear_items(id) on delete set null,
  -- part_payment: the listing the gear would help pay for, and its store.
  listing_id uuid references public.listings(id) on delete set null,
  store_id uuid references public.stores(id) on delete cascade,
  category text not null,
  instrument_type text not null,
  brand text not null check (char_length(brand) between 1 and 80),
  model text not null default '' check (char_length(model) <= 120),
  title text not null check (char_length(title) between 1 and 200),
  condition text not null check (char_length(condition) between 1 and 40),
  description text not null check (char_length(description) between 10 and 1000),
  asking_price_pen integer check (asking_price_pen is null or asking_price_pen between 1 and 1000000),
  city text check (city is null or char_length(city) <= 80),
  region text not null check (char_length(region) between 1 and 80),
  photos text[] not null check (cardinality(photos) between 2 and 6),
  status text not null default 'open'
    check (status in ('open', 'accepted', 'completed', 'not_completed', 'withdrawn', 'expired')),
  offers_until timestamptz not null,
  decide_until timestamptz not null,
  accepted_offer_id uuid,
  accepted_at timestamptz,
  drop_off_by date,
  -- The person's WhatsApp, shared with the chosen store when they accept.
  contact_phone text check (contact_phone is null or contact_phone ~ '^[0-9]{9,15}$'),
  final_price_pen integer check (final_price_pen is null or final_price_pen between 1 and 1000000),
  closed_at timestamptz,
  close_reason text check (close_reason is null or char_length(close_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trade_requests_taxonomy_check check (public.listing_taxonomy_is_valid(category, instrument_type)),
  constraint trade_requests_kind_store_check check (kind = 'part_payment' or (listing_id is null and store_id is null)),
  constraint trade_requests_window_check check (decide_until > offers_until and offers_until > created_at),
  constraint trade_requests_accepted_check check (
    (status in ('accepted', 'completed', 'not_completed')) = (accepted_offer_id is not null and accepted_at is not null and drop_off_by is not null)
  )
);
create index if not exists trade_requests_accepted_offer_idx on public.trade_requests (accepted_offer_id)
  where accepted_offer_id is not null;
create index if not exists trade_requests_gear_item_idx on public.trade_requests (gear_item_id)
  where gear_item_id is not null;

create index trade_requests_requester_idx on public.trade_requests(requester_user_id, created_at desc);
create index trade_requests_open_idx on public.trade_requests(category, region, offers_until) where status = 'open';
create index trade_requests_store_idx on public.trade_requests(store_id, created_at desc) where store_id is not null;
create index trade_requests_listing_idx on public.trade_requests(listing_id) where listing_id is not null;

create trigger trade_requests_set_updated_at
before update on public.trade_requests
for each row execute function public.set_updated_at();

create table public.trade_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.trade_requests(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  amount_pen integer not null check (amount_pen between 1 and 1000000),
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'sent' check (status in ('sent', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, store_id)
);

create index trade_offers_store_idx on public.trade_offers(store_id, created_at desc);

create trigger trade_offers_set_updated_at
before update on public.trade_offers
for each row execute function public.set_updated_at();

alter table public.trade_requests
  add constraint trade_requests_accepted_offer_fkey foreign key (accepted_offer_id) references public.trade_offers(id) on delete set null;

-- Nobody reads these tables directly: the functions below decide what each side sees.
alter table public.trade_requests enable row level security;
alter table public.trade_offers enable row level security;
revoke all on public.trade_requests, public.trade_offers from anon, authenticated;

-- ------------------------------------------------------------------ who sees a request

-- A sell request reaches active, verified stores of the same region that buy used gear in its category.
create or replace function laria_private.trade_store_qualifies(p_store_id uuid, p_category text, p_region text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.stores s
    join public.store_trade_settings ts on ts.store_id = s.id
    where s.id = p_store_id and s.status = 'active' and s.is_verified
      and ts.buys_used and p_category = any(ts.buy_categories)
      and lower(trim(s.region)) = lower(trim(p_region))
  );
$$;

-- Whether a store may see a request: it qualifies and the 24 hours are running, or it already answered it, or (part
-- payment) it is the listing's store.
create or replace function laria_private.trade_store_can_view(p_store_id uuid, p_request public.trade_requests)
returns boolean
language sql
stable
security definer
set search_path = public, laria_private
as $$
  select p_store_id is not null and (
    (p_request.kind = 'part_payment' and p_request.store_id = p_store_id)
    or exists (select 1 from public.trade_offers o where o.request_id = p_request.id and o.store_id = p_store_id)
    or (p_request.kind = 'sell' and p_request.status = 'open' and p_request.offers_until > now()
        and laria_private.trade_store_qualifies(p_store_id, p_request.category, p_request.region))
  );
$$;

revoke all on function laria_private.trade_store_qualifies(uuid, text, text), laria_private.trade_store_can_view(uuid, public.trade_requests)
  from public, anon, authenticated;

-- How many stores would see a sell request now: the real number, shown before the person writes anything.
create or replace function public.count_trade_stores(p_category text, p_region text)
returns integer
language sql
stable
security definer
set search_path = public, laria_private
as $$
  select count(*)::integer
  from public.stores s
  where auth.uid() is not null and laria_private.trade_store_qualifies(s.id, p_category, coalesce(p_region, ''));
$$;

-- The same count for every category stores buy, for the "¿Prefieres vender ya?" card on the sell page.
create or replace function public.count_trade_stores_by_category(p_region text)
returns jsonb
language sql
stable
security definer
set search_path = public, laria_private
as $$
  select jsonb_object_agg(category, (
    select count(*) from public.stores s where laria_private.trade_store_qualifies(s.id, category, coalesce(p_region, ''))
  ))
  from unnest(array['guitars', 'basses', 'amplifiers', 'pedals', 'keyboards']) category
  where auth.uid() is not null;
$$;

revoke all on function public.count_trade_stores(text, text), public.count_trade_stores_by_category(text) from public, anon;
grant execute on function public.count_trade_stores(text, text), public.count_trade_stores_by_category(text) to authenticated;

-- ------------------------------------------------------------------ the person's side

-- p_fields: kind, gear_item_id, listing_id (part payment), category, instrument_type, brand, model, condition,
-- description, asking_price_pen, city, region, photos (paths already uploaded under <user>/<p_id>/).
create or replace function public.create_trade_request(p_id uuid, p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private, storage
as $$
declare
  uid uuid := laria_private.gear_require_owner();
  v_kind text := coalesce(p_fields->>'kind', 'sell');
  v_gear public.gear_items%rowtype;
  v_listing public.listings%rowtype;
  v_store public.stores%rowtype;
  v_category text := nullif(trim(coalesce(p_fields->>'category', '')), '');
  v_type text := coalesce(nullif(trim(coalesce(p_fields->>'instrument_type', '')), ''), 'other');
  v_brand text := nullif(trim(coalesce(p_fields->>'brand', '')), '');
  v_model text := trim(coalesce(p_fields->>'model', ''));
  v_condition text := laria_private.current_condition(nullif(trim(coalesce(p_fields->>'condition', '')), ''));
  v_description text := trim(coalesce(p_fields->>'description', ''));
  v_city text := nullif(trim(coalesce(p_fields->>'city', '')), '');
  v_region text := nullif(trim(coalesce(p_fields->>'region', '')), '');
  v_price integer;
  v_photos text[];
  v_photo text;
  v_store_ids uuid[];
  v_offers_until timestamptz;
  v_decide_until timestamptz;
  v_store_id uuid;
  v_notification uuid;
  v_title text;
begin
  if p_id is null or p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'TRADE_INVALID: Revisa los datos.';
  end if;
  if v_kind not in ('sell', 'part_payment') then
    raise exception 'TRADE_INVALID: Revisa los datos.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('trade_requests:' || uid::text, 0));
  if exists (select 1 from public.trade_requests where id = p_id) then
    if exists (select 1 from public.trade_requests where id = p_id and requester_user_id = uid) then
      return jsonb_build_object('id', p_id, 'repeated', true);
    end if;
    raise exception 'TRADE_INVALID: Revisa los datos.';
  end if;

  if nullif(p_fields->>'gear_item_id', '') is not null then
    select * into v_gear from public.gear_items where id = (p_fields->>'gear_item_id')::uuid and user_id = uid;
    if not found then
      raise exception 'GEAR_NOT_FOUND: Ese equipo ya no está en tu lista.';
    end if;
    v_category := coalesce(v_category, v_gear.category);
    v_brand := coalesce(v_brand, v_gear.brand);
  end if;
  if v_category is null or not public.listing_taxonomy_is_valid(v_category, v_type) then
    raise exception 'TRADE_CATEGORY_INVALID: Elige una categoría.';
  end if;
  if v_brand is null or char_length(v_brand) > 80 or char_length(v_model) > 120 then
    raise exception 'TRADE_BRAND_REQUIRED: Escribe la marca y el modelo.';
  end if;
  -- The listing condition scale (sell-10, 20261202120000); a person is never "Exhibición o caja abierta".
  if v_condition is null or not public.listing_condition_is_valid(v_condition, false) then
    raise exception 'TRADE_CONDITION_REQUIRED: Elige el estado de la escala.';
  end if;
  if char_length(v_description) not between 10 and 1000 then
    raise exception 'TRADE_DESCRIPTION_LENGTH: Describe el equipo en 10 a 1000 caracteres.';
  end if;
  if laria_private.text_has_contact_details(v_description) or laria_private.text_has_contact_details(v_brand || ' ' || v_model) then
    raise exception 'TRADE_CONTACT_DETAILS: Quita teléfonos, correos o enlaces: el contacto se comparte solo cuando eliges una oferta.';
  end if;
  if v_region is null or char_length(v_region) > 80 or char_length(coalesce(v_city, '')) > 80 then
    raise exception 'TRADE_REGION_REQUIRED: Indica tu región.';
  end if;
  begin
    v_price := nullif(p_fields->>'asking_price_pen', '')::integer;
  exception when others then
    raise exception 'TRADE_PRICE_INVALID: Revisa el precio.';
  end;
  if v_price is not null and v_price not between 1 and 1000000 then
    raise exception 'TRADE_PRICE_INVALID: Revisa el precio.';
  end if;

  select coalesce(array_agg(value order by ordinality), '{}') into v_photos
  from jsonb_array_elements_text(coalesce(p_fields->'photos', '[]'::jsonb)) with ordinality as photo(value, ordinality);
  if cardinality(v_photos) not between 2 and 6 then
    raise exception 'TRADE_PHOTOS_REQUIRED: Sube de 2 a 6 fotos.';
  end if;
  foreach v_photo in array v_photos loop
    if v_photo !~ ('^' || uid::text || '/' || p_id::text || '/[1-6]\.jpg$')
      or not exists (select 1 from storage.objects o where o.bucket_id = 'trade-photos' and o.name = v_photo and o.owner_id = uid::text) then
      raise exception 'TRADE_PHOTO_MISSING: Una foto no terminó de subir. Vuelve a intentarlo.';
    end if;
  end loop;
  if (select count(distinct value) from unnest(v_photos) value) <> cardinality(v_photos) then
    raise exception 'TRADE_PHOTO_MISSING: Una foto no terminó de subir. Vuelve a intentarlo.';
  end if;

  if (select count(*) from public.trade_requests where requester_user_id = uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'TRADE_RATE_LIMIT: Llegaste al límite de pedidos por hoy. Prueba mañana.';
  end if;

  v_title := laria_private.gear_title(v_brand, v_model);

  if v_kind = 'sell' then
    if v_category not in ('guitars', 'basses', 'amplifiers', 'pedals', 'keyboards') then
      raise exception 'TRADE_CATEGORY_NOT_BOUGHT: Por ahora las tiendas reciben guitarras, bajos, amplificadores, pedales y teclados.';
    end if;
    if (select count(*) from public.trade_requests where requester_user_id = uid and kind = 'sell' and status in ('open', 'accepted')) >= 5 then
      raise exception 'TRADE_OPEN_LIMIT: Tienes 5 pedidos abiertos. Cierra uno para enviar otro.';
    end if;
    select coalesce(array_agg(s.id order by s.created_at), '{}') into v_store_ids
    from public.stores s
    where laria_private.trade_store_qualifies(s.id, v_category, v_region) and s.owner_user_id is distinct from uid;
    if cardinality(v_store_ids) = 0 then
      raise exception 'TRADE_NO_STORES: Todavía no hay tiendas verificadas de tu región que compren esta categoría.';
    end if;
    v_offers_until := now() + interval '24 hours';
    v_decide_until := v_offers_until + interval '3 days';
  else
    begin
      select * into v_listing from public.listings where id = nullif(p_fields->>'listing_id', '')::uuid;
    exception when others then
      raise exception 'TRADE_LISTING_INVALID: Esa publicación ya no está disponible.';
    end;
    if v_listing.id is null or not public.listing_accepts_part_payment(v_listing.id) or v_listing.stock_state = 'out_of_stock' then
      raise exception 'TRADE_LISTING_INVALID: Esa publicación ya no acepta parte de pago.';
    end if;
    select * into v_store from public.stores where id = v_listing.store_id;
    if v_store.owner_user_id = uid then
      raise exception 'TRADE_OWN_STORE: Es una publicación de tu tienda.';
    end if;
    if exists (select 1 from public.trade_requests where requester_user_id = uid and listing_id = v_listing.id and status in ('open', 'accepted')) then
      raise exception 'TRADE_ALREADY_SENT: Ya enviaste un pedido para esta publicación.';
    end if;
    v_store_ids := array[v_store.id];
    v_offers_until := now() + interval '72 hours';
    v_decide_until := v_offers_until + interval '7 days';
  end if;

  insert into public.trade_requests(
    id, kind, requester_user_id, gear_item_id, listing_id, store_id, category, instrument_type, brand, model, title,
    condition, description, asking_price_pen, city, region, photos, offers_until, decide_until
  ) values (
    p_id, v_kind, uid, v_gear.id, v_listing.id, v_store.id, v_category, v_type, v_brand, v_model, v_title,
    v_condition, v_description, v_price, v_city, v_region, v_photos, v_offers_until, v_decide_until
  );

  -- At most 30 stores hear about one request; the oldest stores first, so the order does not depend on chance.
  foreach v_store_id in array v_store_ids[1:30] loop
    select * into v_store from public.stores where id = v_store_id;
    v_notification := laria_private.selling_notify(
      v_store.owner_user_id, 'store_trade_request',
      case when v_kind = 'sell'
        then format('Te ofrecen un equipo usado: %s (%s). Puedes enviar una oferta hasta mañana.', v_title, coalesce(v_city, v_region))
        else format('Quieren dejar un %s como parte de pago de “%s”.', v_title, v_listing.title) end,
      v_listing.id, v_store.id
    );
    perform laria_private.enqueue_marketplace_email(
      'store_trade_request', v_store.owner_user_id, 'trade_request:' || p_id::text || ':' || v_store.id::text,
      v_notification, v_listing.id, v_store.id,
      p_context => jsonb_build_object('selling', jsonb_build_object(
        'kind', v_kind, 'title', v_title, 'place', coalesce(v_city || ', ', '') || v_region,
        'request_id', p_id, 'offers_until', v_offers_until))
    );
  end loop;

  return jsonb_build_object('id', p_id, 'stores', least(cardinality(v_store_ids), 30));
end;
$$;

-- The person picks an offer: the others are declined, and both sides now see each other's contact. p_phone: the
-- WhatsApp to share when the profile has none.
create or replace function public.accept_trade_offer(p_offer_id uuid, p_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  uid uuid := auth.uid();
  v_offer public.trade_offers%rowtype;
  v_request public.trade_requests%rowtype;
  v_store public.stores%rowtype;
  v_phone text;
  other record;
begin
  if uid is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED: Inicia sesión para continuar.';
  end if;
  select * into v_offer from public.trade_offers where id = p_offer_id;
  if not found then
    raise exception 'TRADE_OFFER_NOT_FOUND: Esa oferta ya no está disponible.';
  end if;
  select * into v_request from public.trade_requests where id = v_offer.request_id and requester_user_id = uid for update;
  if not found then
    raise exception 'TRADE_OFFER_NOT_FOUND: Esa oferta ya no está disponible.';
  end if;
  select * into v_offer from public.trade_offers where id = p_offer_id for update;
  if v_request.status <> 'open' or v_request.decide_until <= now() or v_offer.status <> 'sent' then
    raise exception 'TRADE_OFFER_CLOSED: Ese pedido ya no admite elegir ofertas.';
  end if;
  select * into v_store from public.stores where id = v_offer.store_id;
  if v_store.status <> 'active' then
    raise exception 'TRADE_OFFER_CLOSED: Esa tienda ya no está activa en Laria.';
  end if;
  v_phone := regexp_replace(coalesce(nullif(p_phone, ''), (select phone from public.profiles where id = uid), ''), '[^0-9]', '', 'g');
  if char_length(v_phone) = 9 and v_phone like '9%' then
    v_phone := '51' || v_phone;
  end if;
  if v_phone !~ '^[0-9]{9,15}$' then
    raise exception 'TRADE_PHONE_REQUIRED: Indica tu WhatsApp para que la tienda te escriba.';
  end if;

  update public.trade_offers set status = 'accepted' where id = v_offer.id;
  update public.trade_requests
  set status = 'accepted', accepted_offer_id = v_offer.id, accepted_at = now(),
      drop_off_by = (now() at time zone 'America/Lima')::date + 5, contact_phone = v_phone
  where id = v_request.id;

  perform laria_private.selling_notify(
    v_store.owner_user_id, 'store_trade_update',
    format('Eligieron tu oferta por %s. Escríbele por WhatsApp para coordinar la entrega en tu tienda.', v_request.title),
    v_request.listing_id, v_store.id
  );
  perform laria_private.enqueue_marketplace_email(
    'store_trade_update', v_store.owner_user_id, 'trade_accepted:' || v_request.id::text,
    null, v_request.listing_id, v_store.id,
    p_context => jsonb_build_object('selling', jsonb_build_object(
      'kind', v_request.kind, 'title', v_request.title, 'amount_pen', v_offer.amount_pen, 'request_id', v_request.id))
  );
  for other in
    update public.trade_offers o set status = 'declined'
    where o.request_id = v_request.id and o.id <> v_offer.id and o.status = 'sent'
    returning o.store_id
  loop
    perform laria_private.selling_notify(
      (select owner_user_id from public.stores where id = other.store_id), 'store_trade_update',
      format('La persona eligió otra oferta por %s. Gracias por responder.', v_request.title),
      v_request.listing_id, other.store_id
    );
  end loop;
  return jsonb_build_object('id', v_request.id, 'status', 'accepted');
end;
$$;

-- The person cancels: before choosing, or after choosing if they no longer go (the store is told).
create or replace function public.withdraw_trade_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  v_request public.trade_requests%rowtype;
  other record;
begin
  select * into v_request from public.trade_requests
  where id = p_request_id and requester_user_id = auth.uid() for update;
  if not found then
    raise exception 'TRADE_NOT_FOUND: No encontramos ese pedido.';
  end if;
  if v_request.status not in ('open', 'accepted') then
    return false;
  end if;
  update public.trade_requests
  set status = 'withdrawn', closed_at = now(), close_reason = 'Lo retiró la persona.'
  where id = v_request.id;
  for other in
    update public.trade_offers o set status = case when o.status = 'accepted' then 'accepted' else 'declined' end
    where o.request_id = v_request.id and o.status in ('sent', 'accepted')
    returning o.store_id
  loop
    perform laria_private.selling_notify(
      (select owner_user_id from public.stores where id = other.store_id), 'store_trade_update',
      format('La persona retiró su pedido por %s.', v_request.title),
      v_request.listing_id, other.store_id
    );
  end loop;
  return true;
end;
$$;

-- Everything the person sent, newest first, with how many offers each has.
create or replace function public.get_my_trade_requests()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'kind', r.kind, 'title', r.title, 'category', r.category,
    'status', case when r.status = 'open' and r.decide_until <= now() then 'expired' else r.status end,
    'offers_until', r.offers_until, 'decide_until', r.decide_until, 'drop_off_by', r.drop_off_by,
    'created_at', r.created_at, 'photo', r.photos[1],
    'listing', case when r.listing_id is null then null else (
      select jsonb_build_object('id', l.id, 'title', l.title, 'slug', l.slug) from public.listings l where l.id = r.listing_id) end,
    'offer_count', (select count(*) from public.trade_offers o where o.request_id = r.id and o.status in ('sent', 'accepted')),
    'best_offer_pen', (select max(o.amount_pen) from public.trade_offers o where o.request_id = r.id and o.status in ('sent', 'accepted'))
  ) order by r.created_at desc), '[]'::jsonb)
  from public.trade_requests r
  where r.requester_user_id = auth.uid();
$$;

-- One request for the person: the offers (store, amount, note) and, once they chose, that store's address and WhatsApp.
create or replace function public.get_my_trade_request(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id, 'kind', r.kind, 'title', r.title, 'category', r.category, 'instrument_type', r.instrument_type,
    'brand', r.brand, 'model', r.model, 'condition', r.condition, 'description', r.description,
    'asking_price_pen', r.asking_price_pen, 'city', r.city, 'region', r.region, 'photos', to_jsonb(r.photos),
    'status', case when r.status = 'open' and r.decide_until <= now() then 'expired' else r.status end,
    'offers_until', r.offers_until, 'decide_until', r.decide_until, 'accepted_at', r.accepted_at,
    'drop_off_by', r.drop_off_by, 'final_price_pen', r.final_price_pen, 'close_reason', r.close_reason,
    'created_at', r.created_at,
    'listing', case when r.listing_id is null then null else (
      select jsonb_build_object('id', l.id, 'title', l.title, 'slug', l.slug, 'price_pen', l.price_pen) from public.listings l where l.id = r.listing_id) end,
    'stores_reached', case when r.kind = 'sell' then (
      select count(*) from public.stores s where laria_private.trade_store_qualifies(s.id, r.category, r.region)) else 1 end,
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'amount_pen', o.amount_pen, 'note', o.note, 'status', o.status, 'created_at', o.created_at,
        'store', jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug, 'city', s.city, 'district', s.district, 'is_verified', s.is_verified),
        'contact', case when o.status = 'accepted' and r.status = 'accepted' then jsonb_build_object(
          'whatsapp_phone', s.whatsapp_phone,
          'address', coalesce(nullif(s.public_address, ''), nullif(s.address, '')),
          'district', s.district, 'city', s.city, 'opening_hours', s.opening_hours) else null end
      ) order by o.amount_pen desc, o.created_at)
      from public.trade_offers o join public.stores s on s.id = o.store_id
      where o.request_id = r.id and o.status <> 'withdrawn'
    ), '[]'::jsonb)
  )
  from public.trade_requests r
  where r.id = p_request_id and r.requester_user_id = auth.uid();
$$;

revoke all on function public.create_trade_request(uuid, jsonb), public.accept_trade_offer(uuid, text),
  public.withdraw_trade_request(uuid), public.get_my_trade_requests(), public.get_my_trade_request(uuid) from public, anon;
grant execute on function public.create_trade_request(uuid, jsonb), public.accept_trade_offer(uuid, text),
  public.withdraw_trade_request(uuid), public.get_my_trade_requests(), public.get_my_trade_request(uuid) to authenticated;

-- ------------------------------------------------------------------ the store's side

-- A store sends or changes its one offer while the request takes offers.
create or replace function public.save_trade_offer(p_request_id uuid, p_amount_pen integer, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  v_store_id uuid := laria_private.selling_own_store_id();
  v_store public.stores%rowtype;
  v_request public.trade_requests%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_offer_id uuid;
  v_is_new boolean;
  v_notification uuid;
begin
  if v_store_id is null then
    raise exception using errcode = '42501', message = 'STORE_REQUIRED: Esta opción es para tiendas.';
  end if;
  select * into v_store from public.stores where id = v_store_id;
  select * into v_request from public.trade_requests where id = p_request_id for update;
  if not found or not laria_private.trade_store_can_view(v_store_id, v_request) then
    raise exception 'TRADE_NOT_FOUND: Ese pedido ya no está disponible.';
  end if;
  if v_request.status <> 'open' or v_request.offers_until <= now() then
    raise exception 'TRADE_OFFERS_CLOSED: Ese pedido ya no recibe ofertas.';
  end if;
  if v_store.status <> 'active' or (v_request.kind = 'sell' and not laria_private.trade_store_qualifies(v_store_id, v_request.category, v_request.region)) then
    raise exception 'TRADE_STORE_NOT_ELIGIBLE: Tu tienda ya no cumple las condiciones para ofertar.';
  end if;
  if p_amount_pen is null or p_amount_pen not between 1 and 1000000 then
    raise exception 'TRADE_AMOUNT_INVALID: Escribe un monto en soles.';
  end if;
  if v_note is not null and (char_length(v_note) > 300 or laria_private.text_has_contact_details(v_note)) then
    raise exception 'TRADE_NOTE_INVALID: La nota admite hasta 300 caracteres y sin teléfonos, correos ni enlaces.';
  end if;
  select id into v_offer_id from public.trade_offers where request_id = v_request.id and store_id = v_store_id for update;
  v_is_new := v_offer_id is null;
  if v_is_new then
    insert into public.trade_offers(request_id, store_id, amount_pen, note)
    values (v_request.id, v_store_id, p_amount_pen, v_note)
    returning id into v_offer_id;
  else
    update public.trade_offers set amount_pen = p_amount_pen, note = v_note, status = 'sent'
    where id = v_offer_id and status in ('sent', 'withdrawn');
    if not found then
      raise exception 'TRADE_OFFERS_CLOSED: Ese pedido ya no recibe ofertas.';
    end if;
  end if;

  v_notification := laria_private.selling_notify(
    v_request.requester_user_id, 'gear_trade_offer',
    case when v_is_new
      then format('%s te ofrece S/ %s por %s.', v_store.name, to_char(p_amount_pen, 'FM999G999G999'), v_request.title)
      else format('%s cambió su oferta por %s a S/ %s.', v_store.name, v_request.title, to_char(p_amount_pen, 'FM999G999G999')) end,
    null, v_store_id
  );
  -- One e-mail per request, for the first offer: the rest wait in Mi equipo.
  perform laria_private.enqueue_marketplace_email(
    'gear_trade_offer', v_request.requester_user_id, 'trade_offer_first:' || v_request.id::text,
    v_notification, null, v_store_id,
    p_context => jsonb_build_object('selling', jsonb_build_object(
      'kind', v_request.kind, 'title', v_request.title, 'amount_pen', p_amount_pen, 'request_id', v_request.id,
      'decide_until', v_request.decide_until))
  );
  return v_offer_id;
end;
$$;

create or replace function public.withdraw_trade_offer(p_offer_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  v_store_id uuid := laria_private.selling_own_store_id();
  v_offer public.trade_offers%rowtype;
  v_request public.trade_requests%rowtype;
begin
  select * into v_offer from public.trade_offers where id = p_offer_id and store_id = v_store_id;
  if not found then
    raise exception 'TRADE_OFFER_NOT_FOUND: Esa oferta ya no está disponible.';
  end if;
  select * into v_request from public.trade_requests where id = v_offer.request_id for update;
  update public.trade_offers set status = 'withdrawn' where id = v_offer.id and status = 'sent';
  if not found or v_request.status <> 'open' then
    raise exception 'TRADE_OFFERS_CLOSED: Esa oferta ya no se puede retirar.';
  end if;
  return true;
end;
$$;

-- After the visit: the store records whether the deal happened and at what final price. Laria only keeps the note.
create or replace function public.close_trade_request(p_request_id uuid, p_completed boolean, p_final_price_pen integer default null, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  v_store_id uuid := laria_private.selling_own_store_id();
  v_request public.trade_requests%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select r.* into v_request
  from public.trade_requests r join public.trade_offers o on o.id = r.accepted_offer_id
  where r.id = p_request_id and o.store_id = v_store_id
  for update of r;
  if not found then
    raise exception 'TRADE_NOT_FOUND: Ese pedido ya no está disponible.';
  end if;
  if v_request.status <> 'accepted' then
    raise exception 'TRADE_NOT_ACCEPTED: Ese pedido ya está cerrado.';
  end if;
  if p_completed and (p_final_price_pen is null or p_final_price_pen not between 1 and 1000000) then
    raise exception 'TRADE_AMOUNT_INVALID: Escribe el precio final en soles.';
  end if;
  if v_reason is not null and (char_length(v_reason) > 300 or laria_private.text_has_contact_details(v_reason)) then
    raise exception 'TRADE_NOTE_INVALID: La nota admite hasta 300 caracteres y sin teléfonos, correos ni enlaces.';
  end if;
  update public.trade_requests
  set status = case when p_completed then 'completed' else 'not_completed' end,
      final_price_pen = case when p_completed then p_final_price_pen else null end,
      closed_at = now(), close_reason = v_reason
  where id = v_request.id;
  perform laria_private.selling_notify(
    v_request.requester_user_id, 'gear_trade_update',
    case when p_completed
      then format('La tienda registró que %s se concretó por S/ %s.', v_request.title, to_char(p_final_price_pen, 'FM999G999G999'))
      else format('La tienda registró que %s no se concretó.%s', v_request.title, coalesce(' ' || v_reason, '')) end,
    null, v_store_id
  );
  return true;
end;
$$;

-- The store's inbox: requests it can answer now, those it answered and those chosen for it (last 60 days).
create or replace function public.get_store_trade_inbox()
returns jsonb
language sql
stable
security definer
set search_path = public, laria_private
as $$
  with mine as (select laria_private.selling_own_store_id() as store_id)
  select coalesce(jsonb_agg(item order by (item->>'sort_at') desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', r.id, 'kind', r.kind, 'title', r.title, 'category', r.category, 'condition', r.condition,
      'city', r.city, 'region', r.region, 'asking_price_pen', r.asking_price_pen, 'photo', r.photos[1],
      'status', case when r.status = 'open' and r.decide_until <= now() then 'expired' else r.status end,
      'offers_until', r.offers_until, 'created_at', r.created_at, 'sort_at', r.created_at,
      'listing', case when r.listing_id is null then null else (
        select jsonb_build_object('id', l.id, 'title', l.title, 'slug', l.slug) from public.listings l where l.id = r.listing_id) end,
      'my_offer', (select jsonb_build_object('id', o.id, 'amount_pen', o.amount_pen, 'status', o.status)
                   from public.trade_offers o where o.request_id = r.id and o.store_id = mine.store_id)
    ) as item
    from public.trade_requests r, mine
    where mine.store_id is not null
      and r.created_at > now() - interval '60 days'
      and laria_private.trade_store_can_view(mine.store_id, r)
  ) rows;
$$;

-- One request for the store. The person's name and WhatsApp appear only after they chose this store's offer.
create or replace function public.get_store_trade_request(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, laria_private
as $$
  with mine as (select laria_private.selling_own_store_id() as store_id)
  select jsonb_build_object(
    'id', r.id, 'kind', r.kind, 'title', r.title, 'category', r.category, 'instrument_type', r.instrument_type,
    'brand', r.brand, 'model', r.model, 'condition', r.condition, 'description', r.description,
    'asking_price_pen', r.asking_price_pen, 'city', r.city, 'region', r.region, 'photos', to_jsonb(r.photos),
    'status', case when r.status = 'open' and r.decide_until <= now() then 'expired' else r.status end,
    'offers_until', r.offers_until, 'decide_until', r.decide_until, 'accepted_at', r.accepted_at,
    'drop_off_by', r.drop_off_by, 'final_price_pen', r.final_price_pen, 'created_at', r.created_at,
    'listing', case when r.listing_id is null then null else (
      select jsonb_build_object('id', l.id, 'title', l.title, 'slug', l.slug, 'price_pen', l.price_pen) from public.listings l where l.id = r.listing_id) end,
    'my_offer', (select jsonb_build_object('id', o.id, 'amount_pen', o.amount_pen, 'note', o.note, 'status', o.status)
                 from public.trade_offers o where o.request_id = r.id and o.store_id = mine.store_id),
    'contact', case when r.status in ('accepted', 'completed', 'not_completed') and exists (
        select 1 from public.trade_offers o where o.id = r.accepted_offer_id and o.store_id = mine.store_id)
      then jsonb_build_object('name', coalesce(nullif(p.full_name, ''), 'Particular'), 'whatsapp_phone', r.contact_phone)
      else null end
  )
  from public.trade_requests r
  cross join mine
  join public.profiles p on p.id = r.requester_user_id
  where r.id = p_request_id and laria_private.trade_store_can_view(mine.store_id, r);
$$;

revoke all on function public.save_trade_offer(uuid, integer, text), public.withdraw_trade_offer(uuid),
  public.close_trade_request(uuid, boolean, integer, text), public.get_store_trade_inbox(), public.get_store_trade_request(uuid)
  from public, anon;
grant execute on function public.save_trade_offer(uuid, integer, text), public.withdraw_trade_offer(uuid),
  public.close_trade_request(uuid, boolean, integer, text), public.get_store_trade_inbox(), public.get_store_trade_request(uuid)
  to authenticated;

-- ------------------------------------------------------------------ photos

-- Whether a request id is still free, so its photos can be uploaded (the policy below runs as the uploader, who
-- cannot read trade_requests).
create or replace function public.trade_photo_folder_is_free(p_request_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_request_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and not exists (select 1 from public.trade_requests r where r.id::text = p_request_id);
$$;

revoke all on function public.trade_photo_folder_is_free(text) from public, anon;
grant execute on function public.trade_photo_folder_is_free(text) to authenticated;

-- The person uploads into their own folder, as <user>/<request>/<1..6>.jpg, while that request does not exist yet.
create policy "People upload their trade photos" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'trade-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}/[1-6]\.jpg$')
  and public.trade_photo_folder_is_free((storage.foldername(name))[2])
);

-- Read by /api/trade-photos with the service role, after this check with the viewer's session.
create or replace function public.can_view_trade_photo(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public, laria_private
as $$
  select exists (
    select 1 from public.trade_requests r
    where p_path = any(r.photos)
      and (r.requester_user_id = auth.uid() or laria_private.trade_store_can_view(laria_private.selling_own_store_id(), r))
  );
$$;

revoke all on function public.can_view_trade_photo(text) from public, anon;
grant execute on function public.can_view_trade_photo(text) to authenticated;
