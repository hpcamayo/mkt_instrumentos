-- Feature ideas, store-floor batch (docs/feature-ideas/store-floor.md): buy-07 "Reservar una prueba".
--
-- On an available listing of a store that takes try-outs, a signed-in buyer picks a day and a time within the hours
-- the store set for try-outs. The store confirms or declines in one tap from Mi tienda > Pruebas; both sides get the
-- details in Laria (notice and e-mail) and send each other a prefilled WhatsApp message from their screens (Laria
-- sends no WhatsApp itself). One reminder goes out the day before (or the same morning). A try-out holds a time, never
-- the instrument: stock, listings and purchase requests are untouched.
--
-- Additive: two tables, read and write functions, and new notification and e-mail types. Store hours for slots are
-- structured (store_tryout_settings.weekly_hours) because the store profile's opening hours are free text (list-12).

-- ------------------------------------------------------------------ settings

create table public.store_tryout_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  enabled boolean not null default false,
  -- {"1": [["10:00","13:00"],["15:00","19:00"]], …, "7": []}: ISO weekday (1 = lunes) to at most two ranges, Lima time.
  weekly_hours jsonb not null default '{}'::jsonb,
  slot_minutes smallint not null default 30 check (slot_minutes in (15, 30, 45, 60, 90)),
  -- How many buyers can try at the same time (rooms, staff).
  capacity smallint not null default 1 check (capacity between 1 and 5),
  min_notice_hours smallint not null default 3 check (min_notice_hours between 1 and 72),
  max_days_ahead smallint not null default 14 check (max_days_ahead between 1 and 30),
  -- Shown to the buyer before booking ("Trae tus audífonos", "Tenemos sala de pruebas").
  note text check (note is null or (char_length(note) between 1 and 200 and btrim(note) <> '')),
  updated_at timestamptz not null default now(),
  constraint store_tryout_hours_object check (jsonb_typeof(weekly_hours) = 'object'),
  constraint store_tryout_enabled_needs_hours check (not enabled or weekly_hours <> '{}'::jsonb)
);

comment on table public.store_tryout_settings is
  'buy-07: whether a store takes try-out bookings, and the weekly hours and slot length they use.';

alter table public.store_tryout_settings enable row level security;
revoke all on public.store_tryout_settings from anon, authenticated;
grant select on public.store_tryout_settings to anon, authenticated;

create policy store_tryout_settings_read on public.store_tryout_settings
for select to anon, authenticated
using (
  public.is_store_owner(store_id)
  or exists (select 1 from public.stores s where s.id = store_id and s.status = 'active')
);

-- ------------------------------------------------------------------ try-outs

create table public.store_tryouts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  -- The title when booked, so the agenda still reads well if the listing changes or goes away.
  listing_title text not null check (char_length(listing_title) between 1 and 200),
  buyer_user_id uuid not null references public.profiles(id) on delete cascade,
  buyer_name text not null check (char_length(btrim(buyer_name)) between 2 and 80),
  -- Digits with the country code (laria_private.normalize_pe_phone), for the store's WhatsApp message. Only the store
  -- and the buyer read it; it is deleted with the try-out 90 days after its date.
  buyer_phone text not null check (buyer_phone ~ '^[0-9]{10,15}$'),
  buyer_note text check (buyer_note is null or char_length(buyer_note) between 1 and 280),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'declined', 'cancelled', 'expired')),
  cancelled_by text check (cancelled_by is null or cancelled_by in ('buyer', 'store')),
  store_reason text check (store_reason is null or char_length(store_reason) between 1 and 200),
  request_key text not null check (char_length(request_key) between 8 and 100),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  cancelled_at timestamptz,
  reminded_at timestamptz,
  constraint store_tryouts_times check (ends_at > starts_at),
  constraint store_tryouts_cancelled_by check ((status = 'cancelled') = (cancelled_by is not null)),
  constraint store_tryouts_request_key unique (buyer_user_id, request_key)
);

comment on table public.store_tryouts is
  'buy-07: a buyer''s request to try a listing at the store at a given time. Holds a time, never the instrument.';

create index store_tryouts_store_active_idx on public.store_tryouts (store_id, starts_at)
  where status in ('requested', 'confirmed');
create index store_tryouts_store_starts_idx on public.store_tryouts (store_id, starts_at desc, id desc);
create index store_tryouts_buyer_idx on public.store_tryouts (buyer_user_id, starts_at desc, id desc);
create index store_tryouts_reminder_idx on public.store_tryouts (starts_at)
  where status = 'confirmed' and reminded_at is null;

alter table public.store_tryouts enable row level security;
revoke all on public.store_tryouts from anon, authenticated;
grant select on public.store_tryouts to authenticated;

create policy store_tryouts_buyer_read on public.store_tryouts
for select to authenticated using (buyer_user_id = auth.uid());

create policy store_tryouts_store_read on public.store_tryouts
for select to authenticated using (public.is_store_owner(store_id));

-- ------------------------------------------------------------------ helpers

create or replace function laria_private.raise_tryout_error(p_code text, p_message text)
returns void
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001', message = p_code || ': ' || p_message;
end;
$$;

revoke all on function laria_private.raise_tryout_error(text, text) from public, anon, authenticated;

-- "sábado 14 de diciembre, 11:00 a. m." in Lima time, for notices and e-mails.
create or replace function laria_private.tryout_when_label(p_at timestamptz)
returns text
language sql
stable
set search_path = public
as $$
  select (array['lunes','martes','miércoles','jueves','viernes','sábado','domingo'])[extract(isodow from local)::int]
    || ' ' || extract(day from local)::int
    || ' de ' || (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','setiembre','octubre',
                        'noviembre','diciembre'])[extract(month from local)::int]
    || ', ' || ((extract(hour from local)::int + 11) % 12 + 1) || ':' || to_char(local, 'MI')
    || case when extract(hour from local) < 12 then ' a. m.' else ' p. m.' end
  from (select p_at at time zone 'America/Lima' as local) t
$$;

revoke all on function laria_private.tryout_when_label(timestamptz) from public, anon, authenticated;

-- Validates and normalizes the weekly hours: keys "1"…"7", each an array of at most two ["HH:MM","HH:MM"] ranges on a
-- quarter hour, between 06:00 and 23:00, in order and not overlapping. Days left out or empty are closed.
create or replace function laria_private.read_tryout_hours(p_hours jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  result jsonb := '{}'::jsonb;
  day record;
  ranges jsonb;
  range_value jsonb;
  from_time time;
  to_time time;
  previous_end time;
begin
  if p_hours is null or jsonb_typeof(p_hours) <> 'object' then
    perform laria_private.raise_tryout_error('TRYOUT_HOURS_INVALID', 'Revisa el horario para pruebas.');
  end if;
  for day in select key, value from jsonb_each(p_hours) loop
    if day.key not in ('1', '2', '3', '4', '5', '6', '7') or jsonb_typeof(day.value) <> 'array'
       or jsonb_array_length(day.value) > 2 then
      perform laria_private.raise_tryout_error('TRYOUT_HOURS_INVALID', 'Cada día admite hasta dos horarios.');
    end if;
    ranges := '[]'::jsonb;
    previous_end := null;
    for range_value in select value from jsonb_array_elements(day.value) loop
      if jsonb_typeof(range_value) <> 'array' or jsonb_array_length(range_value) <> 2
         or coalesce(range_value->>0, '') !~ '^([01][0-9]|2[0-3]):(00|15|30|45)$'
         or coalesce(range_value->>1, '') !~ '^([01][0-9]|2[0-3]):(00|15|30|45)$' then
        perform laria_private.raise_tryout_error('TRYOUT_HOURS_INVALID', 'Escribe las horas como 10:00 o 18:30, en cuartos de hora.');
      end if;
      from_time := (range_value->>0)::time;
      to_time := (range_value->>1)::time;
      if from_time >= to_time or from_time < time '06:00' or to_time > time '23:00'
         or (previous_end is not null and from_time < previous_end) then
        perform laria_private.raise_tryout_error('TRYOUT_HOURS_INVALID',
          'Cada horario empieza antes de terminar, entre las 6:00 y las 23:00, sin cruzarse con el anterior.');
      end if;
      previous_end := to_time;
      ranges := ranges || jsonb_build_array(jsonb_build_array(to_char(from_time, 'HH24:MI'), to_char(to_time, 'HH24:MI')));
    end loop;
    if jsonb_array_length(ranges) > 0 then result := result || jsonb_build_object(day.key, ranges); end if;
  end loop;
  return result;
end;
$$;

revoke all on function laria_private.read_tryout_hours(jsonb) from public, anon, authenticated;

-- Every slot start of a store from now on, in its booking window: each open range of each day split into slots of
-- slot_minutes (a slot must end by the range's end), no sooner than min_notice_hours from now.
create or replace function laria_private.tryout_slot_starts(p_settings public.store_tryout_settings)
returns setof timestamptz
language sql
stable
set search_path = public
as $$
  select slot.starts_at
  from generate_series(0, p_settings.max_days_ahead - 1) as day_offset
  cross join lateral (select (now() at time zone 'America/Lima')::date + day_offset as local_day) d
  cross join lateral jsonb_array_elements(
    coalesce(p_settings.weekly_hours -> extract(isodow from d.local_day)::int::text, '[]'::jsonb)) as opening(range_value)
  cross join lateral generate_series(
    0,
    (extract(epoch from ((opening.range_value->>1)::time - (opening.range_value->>0)::time)) / 60)::int
      / p_settings.slot_minutes - 1) as n
  cross join lateral (
    select ((d.local_day + (opening.range_value->>0)::time) + make_interval(mins => n * p_settings.slot_minutes))
      at time zone 'America/Lima' as starts_at) slot
  where slot.starts_at >= now() + make_interval(hours => p_settings.min_notice_hours)
  order by slot.starts_at
$$;

revoke all on function laria_private.tryout_slot_starts(public.store_tryout_settings) from public, anon, authenticated;

-- Requests and confirmed try-outs that overlap a time range (the capacity check).
create or replace function laria_private.tryouts_overlapping(p_store_id uuid, p_from timestamptz, p_to timestamptz)
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::int from public.store_tryouts
  where store_id = p_store_id and status in ('requested', 'confirmed')
    and starts_at < p_to and ends_at > p_from
$$;

revoke all on function laria_private.tryouts_overlapping(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- The listing a try-out can be booked for, with its store's settings: public, a store listing, units available (or
-- not stock-managed), not paused, and a store that takes try-outs. Null otherwise.
create or replace function laria_private.tryout_listing(p_listing_id uuid)
returns table (listing public.listings, settings public.store_tryout_settings, store public.stores)
language sql
stable
security definer
set search_path = public
as $$
  select l, t, s
  from public.listings l
  join public.stores s on s.id = l.store_id
  join public.store_tryout_settings t on t.store_id = s.id
  where l.id = p_listing_id
    and l.status = 'approved' and l.seller_type = 'store'
    and (l.stock_state is null or l.stock_state = 'in_stock')
    and (l.paused_until is null or l.paused_until <= laria_private.lima_today())
    and s.status = 'active'
    and t.enabled
    and public.listing_is_public(l.id)
$$;

revoke all on function laria_private.tryout_listing(uuid) from public, anon, authenticated;

-- A notice for one side of a try-out, with its e-mail (dedupe on the notice). Buyers' notices are listing_ events
-- and need the listing; when it is gone the notice is skipped. p_email false: in-app (and push) only.
create or replace function laria_private.notify_tryout(
  p_tryout public.store_tryouts,
  p_event_type text,
  p_recipient uuid,
  p_message text,
  p_email boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare notification_id uuid;
begin
  if p_recipient is null or (p_event_type like 'listing_%' and p_tryout.listing_id is null) then return; end if;
  insert into public.notifications (user_id, event_type, message, listing_id, store_id)
  values (p_recipient, p_event_type, left(p_message, 240), p_tryout.listing_id,
    case when p_event_type like 'store_%' then p_tryout.store_id end)
  returning id into notification_id;
  if p_email then
    perform laria_private.enqueue_marketplace_email(
      p_event_type, p_recipient, 'tryout:' || notification_id::text, notification_id, p_tryout.listing_id,
      p_tryout.store_id, null, null, null, null, null, null,
      jsonb_build_object('reason', laria_private.tryout_when_label(p_tryout.starts_at)
        || coalesce(' · Motivo: ' || p_tryout.store_reason, '')));
  end if;
end;
$$;

revoke all on function laria_private.notify_tryout(public.store_tryouts, text, uuid, text, boolean) from public, anon, authenticated;

-- What both screens show of a try-out.
create or replace function laria_private.tryout_json(p_tryout public.store_tryouts)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(p_tryout) - 'request_key'
    || jsonb_build_object(
      'when_label', laria_private.tryout_when_label(p_tryout.starts_at),
      'store', (select jsonb_build_object('name', s.name, 'slug', s.slug, 'whatsapp_phone', s.whatsapp_phone,
                  'public_address', s.public_address, 'district', s.district, 'city', s.city)
                from public.stores s where s.id = p_tryout.store_id),
      'listing_slug', (select l.slug from public.listings l where l.id = p_tryout.listing_id))
$$;

revoke all on function laria_private.tryout_json(public.store_tryouts) from public, anon, authenticated;

-- ------------------------------------------------------------------ the buyer

-- The free slots of a listing (anyone may look; booking needs an account). available false with a reason when the
-- listing cannot be booked; no buyer data is ever returned.
create or replace function public.get_listing_tryout_slots(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, laria_private
as $$
declare
  target record;
  slots jsonb;
begin
  select * into target from laria_private.tryout_listing(p_listing_id);
  if target.listing is null then
    return jsonb_build_object('available', false, 'slots', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') order by starts_at), '[]'::jsonb)
  into slots
  from laria_private.tryout_slot_starts(target.settings) starts_at
  where laria_private.tryouts_overlapping((target.store).id, starts_at,
          starts_at + make_interval(mins => (target.settings).slot_minutes)) < (target.settings).capacity;
  return jsonb_build_object(
    'available', true,
    'store_name', (target.store).name,
    'slot_minutes', (target.settings).slot_minutes,
    'note', (target.settings).note,
    'slots', slots);
end;
$$;

revoke all on function public.get_listing_tryout_slots(uuid) from public;
grant execute on function public.get_listing_tryout_slots(uuid) to anon, authenticated;

-- Books a slot. Bookings of one store are serialized on its settings row, so two buyers can never take the last place
-- of a slot. A retried request (same key) returns the first booking. Limits: one open try-out per listing, three open
-- try-outs in all and ten requests a day per buyer.
create or replace function public.request_store_tryout(
  p_listing_id uuid,
  p_starts_at timestamptz,
  p_buyer_name text,
  p_buyer_phone text,
  p_note text,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  caller uuid := auth.uid();
  target record;
  settings public.store_tryout_settings;
  existing public.store_tryouts;
  booked public.store_tryouts;
  name_value text := regexp_replace(btrim(coalesce(p_buyer_name, '')), '\s+', ' ', 'g');
  phone_value text := laria_private.normalize_pe_phone(p_buyer_phone);
  note_value text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if caller is null then
    perform laria_private.raise_tryout_error('TRYOUT_AUTH_REQUIRED', 'Ingresa para reservar una prueba.');
  end if;
  if p_request_key is null or char_length(p_request_key) not between 8 and 100 then
    perform laria_private.raise_tryout_error('TRYOUT_INVALID', 'Vuelve a intentarlo.');
  end if;
  select * into existing from public.store_tryouts where buyer_user_id = caller and request_key = p_request_key;
  if existing.id is not null then
    return laria_private.tryout_json(existing) || jsonb_build_object('replayed', true);
  end if;

  select * into target from laria_private.tryout_listing(p_listing_id);
  if target.listing is null then
    perform laria_private.raise_tryout_error('TRYOUT_UNAVAILABLE', 'Esta publicación ya no acepta reservas de prueba.');
  end if;
  if (target.listing).owner_user_id = caller or (target.store).owner_user_id = caller then
    perform laria_private.raise_tryout_error('TRYOUT_OWN_LISTING', 'Es una publicación de tu tienda.');
  end if;
  if char_length(name_value) not between 2 and 80 then
    perform laria_private.raise_tryout_error('TRYOUT_NAME_INVALID', 'Escribe tu nombre, de 2 a 80 caracteres.');
  end if;
  if phone_value is null or phone_value !~ '^[0-9]{10,15}$' then
    perform laria_private.raise_tryout_error('TRYOUT_PHONE_INVALID', 'Escribe un número de WhatsApp válido, por ejemplo 987 654 321.');
  end if;
  if note_value is not null and char_length(note_value) > 280 then
    perform laria_private.raise_tryout_error('TRYOUT_NOTE_LENGTH', 'El mensaje para la tienda tiene hasta 280 caracteres.');
  end if;

  -- One booking at a time per store.
  select * into settings from public.store_tryout_settings where store_id = (target.store).id for update;
  if not settings.enabled then
    perform laria_private.raise_tryout_error('TRYOUT_UNAVAILABLE', 'Esta tienda ya no recibe reservas de prueba.');
  end if;
  if not exists (select 1 from laria_private.tryout_slot_starts(settings) s where s = p_starts_at) then
    perform laria_private.raise_tryout_error('TRYOUT_SLOT_INVALID', 'Ese horario ya no está disponible. Elige otro.');
  end if;
  if exists (select 1 from public.store_tryouts where buyer_user_id = caller and listing_id = p_listing_id
             and status in ('requested', 'confirmed') and starts_at > now()) then
    perform laria_private.raise_tryout_error('TRYOUT_ALREADY_BOOKED', 'Ya tienes una prueba pendiente para esta publicación.');
  end if;
  if (select count(*) from public.store_tryouts where buyer_user_id = caller
      and status in ('requested', 'confirmed') and starts_at > now()) >= 3
     or (select count(*) from public.store_tryouts where buyer_user_id = caller
         and created_at > now() - interval '1 day') >= 10 then
    perform laria_private.raise_tryout_error('TRYOUT_LIMIT', 'Tienes varias pruebas pendientes. Cancela alguna antes de reservar otra.');
  end if;
  if laria_private.tryouts_overlapping(settings.store_id, p_starts_at,
       p_starts_at + make_interval(mins => settings.slot_minutes)) >= settings.capacity then
    perform laria_private.raise_tryout_error('TRYOUT_SLOT_TAKEN', 'Alguien acaba de reservar ese horario. Elige otro.');
  end if;

  insert into public.store_tryouts (store_id, listing_id, listing_title, buyer_user_id, buyer_name, buyer_phone,
    buyer_note, starts_at, ends_at, request_key)
  values (settings.store_id, p_listing_id, left((target.listing).title, 200), caller, name_value, phone_value,
    note_value, p_starts_at, p_starts_at + make_interval(mins => settings.slot_minutes), p_request_key)
  returning * into booked;

  perform laria_private.notify_tryout(booked, 'store_tryout_requested', (target.store).owner_user_id,
    'Nueva solicitud de prueba: ' || booked.listing_title || ', ' || laria_private.tryout_when_label(booked.starts_at) || '.');
  return laria_private.tryout_json(booked);
end;
$$;

revoke all on function public.request_store_tryout(uuid, timestamptz, text, text, text, text) from public, anon;
grant execute on function public.request_store_tryout(uuid, timestamptz, text, text, text, text) to authenticated;

-- The buyer cancels a request or a confirmed try-out before it starts; the store is told.
create or replace function public.cancel_my_tryout(p_tryout_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  tryout public.store_tryouts;
begin
  select * into tryout from public.store_tryouts where id = p_tryout_id and buyer_user_id = auth.uid() for update;
  if tryout.id is null then
    perform laria_private.raise_tryout_error('TRYOUT_NOT_FOUND', 'No encontramos esa prueba.');
  end if;
  if tryout.status = 'cancelled' then return laria_private.tryout_json(tryout); end if;
  if tryout.status not in ('requested', 'confirmed') or tryout.starts_at <= now() then
    perform laria_private.raise_tryout_error('TRYOUT_NOT_CANCELLABLE', 'Esta prueba ya no se puede cancelar.');
  end if;
  update public.store_tryouts set status = 'cancelled', cancelled_by = 'buyer', cancelled_at = now()
  where id = tryout.id returning * into tryout;
  perform laria_private.notify_tryout(tryout, 'store_tryout_cancelled',
    (select owner_user_id from public.stores where id = tryout.store_id),
    'Cancelaron la prueba de ' || tryout.listing_title || ' del ' || laria_private.tryout_when_label(tryout.starts_at) || '.');
  return laria_private.tryout_json(tryout);
end;
$$;

revoke all on function public.cancel_my_tryout(uuid) from public, anon;
grant execute on function public.cancel_my_tryout(uuid) to authenticated;

-- ------------------------------------------------------------------ the store

-- confirm or decline a request; cancel a confirmed try-out. Repeating the same answer returns the try-out unchanged
-- (a double tap). The buyer gets a notice and an e-mail each time.
create or replace function public.respond_store_tryout(p_tryout_id uuid, p_action text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  tryout public.store_tryouts;
  reason_value text := nullif(regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g'), '');
  store_status public.store_status;
begin
  select * into tryout from public.store_tryouts where id = p_tryout_id for update;
  if tryout.id is null or not public.is_store_owner(tryout.store_id) then
    perform laria_private.raise_tryout_error('TRYOUT_NOT_FOUND', 'No encontramos esa prueba.');
  end if;
  select status into store_status from public.stores where id = tryout.store_id;
  if store_status not in ('pending', 'active') then
    perform laria_private.raise_tryout_error('TRYOUT_STORE_READ_ONLY', 'Tu tienda no puede responder pruebas en este momento.');
  end if;
  if reason_value is not null and char_length(reason_value) > 200 then
    perform laria_private.raise_tryout_error('TRYOUT_REASON_LENGTH', 'El motivo tiene hasta 200 caracteres.');
  end if;

  if p_action = 'confirm' then
    if tryout.status = 'confirmed' then return laria_private.tryout_json(tryout); end if;
    if tryout.status <> 'requested' or tryout.starts_at <= now() then
      perform laria_private.raise_tryout_error('TRYOUT_NOT_PENDING', 'Esta solicitud ya no está pendiente.');
    end if;
    update public.store_tryouts set status = 'confirmed', decided_at = now() where id = tryout.id returning * into tryout;
    perform laria_private.notify_tryout(tryout, 'listing_tryout_confirmed', tryout.buyer_user_id,
      'La tienda confirmó tu prueba de ' || tryout.listing_title || ': ' || laria_private.tryout_when_label(tryout.starts_at) || '.');
  elsif p_action = 'decline' then
    if tryout.status = 'declined' then return laria_private.tryout_json(tryout); end if;
    if tryout.status <> 'requested' then
      perform laria_private.raise_tryout_error('TRYOUT_NOT_PENDING', 'Esta solicitud ya no está pendiente.');
    end if;
    update public.store_tryouts set status = 'declined', decided_at = now(), store_reason = reason_value
    where id = tryout.id returning * into tryout;
    perform laria_private.notify_tryout(tryout, 'listing_tryout_declined', tryout.buyer_user_id,
      'La tienda no puede recibirte para probar ' || tryout.listing_title || ' el '
      || laria_private.tryout_when_label(tryout.starts_at) || '.' || coalesce(' Motivo: ' || reason_value, ''));
  elsif p_action = 'cancel' then
    if tryout.status = 'cancelled' then return laria_private.tryout_json(tryout); end if;
    if tryout.status <> 'confirmed' or tryout.starts_at <= now() then
      perform laria_private.raise_tryout_error('TRYOUT_NOT_CANCELLABLE', 'Esta prueba ya no se puede cancelar.');
    end if;
    update public.store_tryouts set status = 'cancelled', cancelled_by = 'store', cancelled_at = now(), store_reason = reason_value
    where id = tryout.id returning * into tryout;
    perform laria_private.notify_tryout(tryout, 'listing_tryout_cancelled', tryout.buyer_user_id,
      'La tienda canceló tu prueba de ' || tryout.listing_title || ' del '
      || laria_private.tryout_when_label(tryout.starts_at) || '.' || coalesce(' Motivo: ' || reason_value, ''));
  else
    perform laria_private.raise_tryout_error('TRYOUT_INVALID', 'Acción no válida.');
  end if;
  return laria_private.tryout_json(tryout);
end;
$$;

revoke all on function public.respond_store_tryout(uuid, text, text) from public, anon;
grant execute on function public.respond_store_tryout(uuid, text, text) to authenticated;

-- Saves the keys present in p_fields (enabled, weekly_hours, slot_minutes, capacity, min_notice_hours,
-- max_days_ahead, note). Turning try-outs off keeps the try-outs already booked.
create or replace function public.set_store_tryout_settings(p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  store_record public.stores;
  current_row public.store_tryout_settings;
  next_row public.store_tryout_settings;
begin
  select s.* into store_record from public.stores s
  where auth.uid() is not null and s.owner_user_id = auth.uid() and public.is_store_owner(s.id);
  if store_record.id is null then
    perform laria_private.raise_tryout_error('TRYOUT_STORE_REQUIRED', 'Necesitas una tienda para recibir pruebas.');
  end if;
  if store_record.status not in ('pending', 'active') then
    perform laria_private.raise_tryout_error('TRYOUT_STORE_READ_ONLY', 'Tu tienda no puede cambiar este ajuste ahora.');
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_fields) key
    where key not in ('enabled', 'weekly_hours', 'slot_minutes', 'capacity', 'min_notice_hours', 'max_days_ahead', 'note')
  ) then
    perform laria_private.raise_tryout_error('TRYOUT_SETTINGS_INVALID', 'Revisa los ajustes de pruebas.');
  end if;

  insert into public.store_tryout_settings (store_id) values (store_record.id) on conflict (store_id) do nothing;
  select * into current_row from public.store_tryout_settings where store_id = store_record.id for update;
  next_row := current_row;
  begin
    if p_fields ? 'enabled' then next_row.enabled := (p_fields->>'enabled')::boolean; end if;
    if p_fields ? 'slot_minutes' then next_row.slot_minutes := (p_fields->>'slot_minutes')::smallint; end if;
    if p_fields ? 'capacity' then next_row.capacity := (p_fields->>'capacity')::smallint; end if;
    if p_fields ? 'min_notice_hours' then next_row.min_notice_hours := (p_fields->>'min_notice_hours')::smallint; end if;
    if p_fields ? 'max_days_ahead' then next_row.max_days_ahead := (p_fields->>'max_days_ahead')::smallint; end if;
  exception when others then
    perform laria_private.raise_tryout_error('TRYOUT_SETTINGS_INVALID', 'Revisa los ajustes de pruebas.');
  end;
  if p_fields ? 'weekly_hours' then next_row.weekly_hours := laria_private.read_tryout_hours(p_fields->'weekly_hours'); end if;
  if p_fields ? 'note' then
    next_row.note := nullif(regexp_replace(btrim(coalesce(p_fields->>'note', '')), '\s+', ' ', 'g'), '');
    if next_row.note is not null and char_length(next_row.note) > 200 then
      perform laria_private.raise_tryout_error('TRYOUT_NOTE_LENGTH', 'La nota tiene hasta 200 caracteres.');
    end if;
  end if;
  if next_row.enabled and next_row.weekly_hours = '{}'::jsonb then
    perform laria_private.raise_tryout_error('TRYOUT_HOURS_REQUIRED', 'Marca al menos un día con horario para recibir pruebas.');
  end if;
  if next_row.slot_minutes not in (15, 30, 45, 60, 90) or next_row.capacity not between 1 and 5
     or next_row.min_notice_hours not between 1 and 72 or next_row.max_days_ahead not between 1 and 30 then
    perform laria_private.raise_tryout_error('TRYOUT_SETTINGS_INVALID', 'Revisa los ajustes de pruebas.');
  end if;

  update public.store_tryout_settings set
    enabled = next_row.enabled, weekly_hours = next_row.weekly_hours, slot_minutes = next_row.slot_minutes,
    capacity = next_row.capacity, min_notice_hours = next_row.min_notice_hours,
    max_days_ahead = next_row.max_days_ahead, note = next_row.note, updated_at = now()
  where store_id = store_record.id
  returning * into next_row;
  return to_jsonb(next_row);
end;
$$;

revoke all on function public.set_store_tryout_settings(jsonb) from public, anon;
grant execute on function public.set_store_tryout_settings(jsonb) to authenticated;

-- ------------------------------------------------------------------ daily work

-- Requests the store never answered before their time end as 'expired' (the buyer gets an in-app notice); confirmed
-- try-outs of today or tomorrow (Lima) get their one reminder, unless they start within the hour; try-outs whose date
-- is more than 90 days past are deleted with the buyer's name and number. Idempotent.
create or replace function laria_private.run_tryout_daily()
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  tryout public.store_tryouts;
  today date := laria_private.lima_today();
  expired integer := 0;
  reminded integer := 0;
  purged integer := 0;
begin
  for tryout in
    update public.store_tryouts set status = 'expired', decided_at = now()
    where status = 'requested' and starts_at <= now()
    returning *
  loop
    perform laria_private.notify_tryout(tryout, 'listing_tryout_declined', tryout.buyer_user_id,
      'La tienda no respondió a tiempo tu solicitud para probar ' || tryout.listing_title || ' el '
      || laria_private.tryout_when_label(tryout.starts_at) || '.', false);
    expired := expired + 1;
  end loop;

  for tryout in
    update public.store_tryouts set reminded_at = now()
    where status = 'confirmed' and reminded_at is null
      and starts_at > now() + interval '1 hour'
      and (starts_at at time zone 'America/Lima')::date between today and today + 1
    returning *
  loop
    perform laria_private.notify_tryout(tryout, 'listing_tryout_reminder', tryout.buyer_user_id,
      'Recordatorio: tu prueba de ' || tryout.listing_title || ' es el '
      || laria_private.tryout_when_label(tryout.starts_at) || '.');
    reminded := reminded + 1;
  end loop;

  delete from public.store_tryouts where starts_at < now() - interval '90 days';
  get diagnostics purged = row_count;

  return jsonb_build_object('expired', expired, 'reminded', reminded, 'purged', purged);
end;
$$;

revoke all on function laria_private.run_tryout_daily() from public, anon, authenticated;

-- The store-floor daily job (app/api/internal/jobs/store-floor): arrival dates that passed, then try-outs.
create or replace function public.run_store_floor_daily()
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare arrivals integer;
begin
  arrivals := laria_private.expire_arrival_estimates();
  return jsonb_build_object('arrivals_expired', arrivals) || laria_private.run_tryout_daily();
end;
$$;

revoke all on function public.run_store_floor_daily() from public, anon, authenticated;
grant execute on function public.run_store_floor_daily() to service_role;

-- ------------------------------------------------------------------ registries

-- Notices. Buyers' are listing_ events (they need the listing); the store's are store_ events (they need the store).
--   store_tryout_requested    a buyer asked to try a listing          (store, notice + e-mail)
--   store_tryout_cancelled    the buyer cancelled                     (store, notice + e-mail)
--   listing_tryout_confirmed  the store confirmed                     (buyer, notice + e-mail)
--   listing_tryout_declined   the store declined, or never answered   (buyer, notice + e-mail; expiry: notice only)
--   listing_tryout_cancelled  the store cancelled a confirmed try-out (buyer, notice + e-mail)
--   listing_tryout_reminder   the one reminder                        (buyer, notice + e-mail)
select laria_private.ux_extend_text_check(
  'public.notifications', 'notifications_event_type_check', 'event_type',
  array['store_tryout_requested', 'store_tryout_cancelled', 'listing_tryout_confirmed', 'listing_tryout_declined',
        'listing_tryout_cancelled', 'listing_tryout_reminder']
);
select laria_private.ux_extend_text_check(
  'laria_private.marketplace_email_deliveries', 'marketplace_email_deliveries_event_type_check', 'event_type',
  array['store_tryout_requested', 'store_tryout_cancelled', 'listing_tryout_confirmed', 'listing_tryout_declined',
        'listing_tryout_cancelled', 'listing_tryout_reminder']
);
