-- Selling tools, sell-01 "Mi equipo" (without estimated values) and buy-06 "¿Toca cambiar cuerdas?"
-- (docs/feature-ideas/selling-tools.md). A Particular's private list of the gear they own: filled from their
-- verified purchases or typed by brand and model, with a private serial, purchase date and warranty end. "Vender esto"
-- turns an item into a sell-form draft. An item can carry one opt-in reminder to change strings, reeds or drumheads.
-- Nobody else reads this list; the stolen-gear matching of the accounts batch reads gear_items.serial at integration.

create table public.gear_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null default 'manual' check (source in ('manual', 'purchase')),
  transaction_id uuid unique references public.verified_transactions(id) on delete set null,
  source_listing_id uuid references public.listings(id) on delete set null,
  category text not null,
  instrument_type text not null,
  brand text not null check (char_length(brand) between 1 and 80),
  model text not null default '' check (char_length(model) <= 120),
  title text not null check (char_length(title) between 1 and 200),
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object' and pg_column_size(attributes) <= 8192),
  serial text check (serial is null or char_length(serial) between 1 and 64),
  -- The serial as matching compares it: letters and digits only, upper case.
  serial_key text generated always as (nullif(upper(regexp_replace(coalesce(serial, ''), '[^0-9A-Za-z]', '', 'g')), '')) stored,
  purchased_on date,
  warranty_until date,
  note text check (note is null or char_length(note) <= 500),
  -- "Vender esto": the id of the sell-form draft it opened, which becomes the listing's id once published.
  sale_listing_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gear_items_taxonomy_check check (public.listing_taxonomy_is_valid(category, instrument_type)),
  constraint gear_items_warranty_check check (warranty_until is null or purchased_on is null or warranty_until >= purchased_on)
);
create index if not exists gear_items_source_listing_idx on public.gear_items (source_listing_id)
  where source_listing_id is not null;

create index gear_items_user_idx on public.gear_items(user_id, created_at desc);
create index gear_items_serial_key_idx on public.gear_items(serial_key) where serial_key is not null;

create trigger gear_items_set_updated_at
before update on public.gear_items
for each row execute function public.set_updated_at();

alter table public.gear_items enable row level security;

create policy "Owners read own gear"
on public.gear_items for select to authenticated
using (user_id = (select auth.uid()));

revoke all on public.gear_items from anon;
revoke insert, update, delete, truncate, references, trigger on public.gear_items from authenticated;
grant select on public.gear_items to authenticated;

create or replace function laria_private.gear_title(p_brand text, p_model text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(trim(both from concat_ws(' ', nullif(trim(both from p_brand), ''), nullif(trim(both from p_model), ''))), 200);
$$;

-- Mi equipo is for Particular accounts; a store keeps its stock in Inventario.
create or replace function laria_private.gear_require_owner()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED: Inicia sesión para continuar.';
  end if;
  if not exists (select 1 from public.profiles where id = uid and account_type = 'seller') then
    raise exception using errcode = '42501', message = 'GEAR_PARTICULAR_ONLY: Mi equipo es para cuentas de Particular.';
  end if;
  return uid;
end;
$$;

revoke all on function laria_private.gear_title(text, text), laria_private.gear_require_owner() from public, anon, authenticated;

-- Adds or changes one item. p_fields: category, instrument_type, brand, model, serial, purchased_on, warranty_until,
-- note. Returns the item's id.
create or replace function public.save_gear_item(p_id uuid, p_fields jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  uid uuid := laria_private.gear_require_owner();
  v_category text := nullif(trim(coalesce(p_fields->>'category', '')), '');
  v_type text := coalesce(nullif(trim(coalesce(p_fields->>'instrument_type', '')), ''), 'other');
  v_brand text := nullif(trim(coalesce(p_fields->>'brand', '')), '');
  v_model text := trim(coalesce(p_fields->>'model', ''));
  v_serial text := nullif(trim(coalesce(p_fields->>'serial', '')), '');
  v_note text := nullif(trim(coalesce(p_fields->>'note', '')), '');
  v_purchased date;
  v_warranty date;
  today date := (now() at time zone 'America/Lima')::date;
  saved_id uuid;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'GEAR_INVALID: Revisa los datos del equipo.';
  end if;
  if v_category is null or not public.listing_taxonomy_is_valid(v_category, v_type) then
    raise exception 'GEAR_CATEGORY_INVALID: Elige una categoría.';
  end if;
  if v_brand is null or char_length(v_brand) > 80 then
    raise exception 'GEAR_BRAND_REQUIRED: Escribe la marca (hasta 80 caracteres).';
  end if;
  if char_length(v_model) > 120 then
    raise exception 'GEAR_MODEL_TOO_LONG: El modelo admite hasta 120 caracteres.';
  end if;
  if v_serial is not null and char_length(v_serial) > 64 then
    raise exception 'GEAR_SERIAL_TOO_LONG: El número de serie admite hasta 64 caracteres.';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'GEAR_NOTE_TOO_LONG: La nota admite hasta 500 caracteres.';
  end if;
  begin
    v_purchased := nullif(p_fields->>'purchased_on', '')::date;
    v_warranty := nullif(p_fields->>'warranty_until', '')::date;
  exception when others then
    raise exception 'GEAR_DATE_INVALID: Revisa las fechas.';
  end;
  if v_purchased is not null and (v_purchased > today or v_purchased < date '1900-01-01') then
    raise exception 'GEAR_PURCHASE_DATE_INVALID: La fecha de compra no puede ser futura.';
  end if;
  if v_warranty is not null and (v_warranty > today + 3650 or (v_purchased is not null and v_warranty < v_purchased)) then
    raise exception 'GEAR_WARRANTY_DATE_INVALID: La garantía debe terminar después de la compra.';
  end if;

  if p_id is null then
    -- One person's list: serialized so two tabs cannot pass the limit together.
    perform pg_advisory_xact_lock(hashtextextended('gear_items:' || uid::text, 0));
    if (select count(*) from public.gear_items where user_id = uid) >= 200 then
      raise exception 'GEAR_LIMIT: Mi equipo admite hasta 200 equipos.';
    end if;
    insert into public.gear_items(user_id, category, instrument_type, brand, model, title, serial, purchased_on, warranty_until, note)
    values (uid, v_category, v_type, v_brand, v_model, laria_private.gear_title(v_brand, v_model), v_serial, v_purchased, v_warranty, v_note)
    returning id into saved_id;
  else
    update public.gear_items
    set category = v_category, instrument_type = v_type, brand = v_brand, model = v_model,
        title = laria_private.gear_title(v_brand, v_model),
        attributes = case when category = v_category and instrument_type = v_type then attributes else '{}'::jsonb end,
        serial = v_serial, purchased_on = v_purchased, warranty_until = v_warranty, note = v_note
    where id = p_id and user_id = uid
    returning id into saved_id;
    if saved_id is null then
      raise exception 'GEAR_NOT_FOUND: Ese equipo ya no está en tu lista.';
    end if;
  end if;
  return saved_id;
end;
$$;

create or replace function public.delete_gear_item(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare uid uuid := laria_private.gear_require_owner();
begin
  delete from public.gear_items where id = p_id and user_id = uid;
  return found;
end;
$$;

-- "Vender esto": a sell-form draft filled with what the item already says (never a price), kept as the item's sale.
-- A second tap opens the same draft, or the listing once it is published.
create or replace function public.start_gear_sale(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  uid uuid := laria_private.gear_require_owner();
  item public.gear_items%rowtype;
  person public.profiles%rowtype;
  existing_status public.listing_status;
  draft_id uuid;
begin
  select * into item from public.gear_items where id = p_id and user_id = uid for update;
  if not found then
    raise exception 'GEAR_NOT_FOUND: Ese equipo ya no está en tu lista.';
  end if;
  if item.sale_listing_id is not null then
    select status into existing_status from public.listings where id = item.sale_listing_id and owner_user_id = uid;
    if existing_status is not null and existing_status not in ('archived', 'rejected') then
      return jsonb_build_object('listing_id', item.sale_listing_id, 'status', existing_status);
    end if;
    if existing_status is null and exists (select 1 from public.listing_drafts where id = item.sale_listing_id and owner_user_id = uid) then
      return jsonb_build_object('draft_id', item.sale_listing_id);
    end if;
  end if;
  select * into person from public.profiles where id = uid;
  draft_id := gen_random_uuid();
  insert into public.listing_drafts(id, owner_user_id, kind, title, form, photos)
  values (
    draft_id, uid, 'listing', item.title,
    jsonb_build_object(
      'category', item.category,
      'instrumentType', item.instrument_type,
      'brand', item.brand,
      'model', item.model,
      'title', item.title,
      'titleEdited', false,
      'condition', '',
      'price', '',
      'city', coalesce(person.city, ''),
      'region', coalesce(person.region, ''),
      'description', '',
      'attributes', item.attributes
    ),
    '[]'::jsonb
  );
  update public.gear_items set sale_listing_id = draft_id where id = item.id;
  return jsonb_build_object('draft_id', draft_id);
end;
$$;

revoke all on function public.save_gear_item(uuid, jsonb), public.delete_gear_item(uuid), public.start_gear_sale(uuid) from public, anon;
grant execute on function public.save_gear_item(uuid, jsonb), public.delete_gear_item(uuid), public.start_gear_sale(uuid) to authenticated;

-- A purchase both sides confirmed lands in the buyer's Mi equipo (Particular buyers only), once.
create or replace function laria_private.add_purchase_to_gear()
returns trigger
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare listing public.listings%rowtype;
begin
  if not exists (select 1 from public.profiles where id = new.buyer_user_id and account_type = 'seller') then
    return new;
  end if;
  if (select count(*) from public.gear_items where user_id = new.buyer_user_id) >= 200 then
    return new;
  end if;
  select * into listing from public.listings where id = new.listing_id;
  if not found or not public.listing_taxonomy_is_valid(listing.category, coalesce(listing.instrument_type, 'other')) then
    return new;
  end if;
  insert into public.gear_items(user_id, source, transaction_id, source_listing_id, category, instrument_type, brand, model, title, attributes, purchased_on)
  values (
    new.buyer_user_id, 'purchase', new.id, listing.id, listing.category, coalesce(listing.instrument_type, 'other'),
    left(coalesce(nullif(trim(listing.brand), ''), 'Sin marca'), 80), left(coalesce(trim(listing.model), ''), 120),
    left(listing.title, 200), coalesce(listing.attributes, '{}'::jsonb),
    (new.sold_at at time zone 'America/Lima')::date
  )
  on conflict (transaction_id) do nothing;
  return new;
end;
$$;

revoke all on function laria_private.add_purchase_to_gear() from public, anon, authenticated;

create trigger verified_transactions_add_to_gear
after insert on public.verified_transactions
for each row execute function laria_private.add_purchase_to_gear();

-- Purchases confirmed before this release.
insert into public.gear_items(user_id, source, transaction_id, source_listing_id, category, instrument_type, brand, model, title, attributes, purchased_on)
select vt.buyer_user_id, 'purchase', vt.id, l.id, l.category, coalesce(l.instrument_type, 'other'),
  left(coalesce(nullif(trim(l.brand), ''), 'Sin marca'), 80), left(coalesce(trim(l.model), ''), 120),
  left(l.title, 200), coalesce(l.attributes, '{}'::jsonb), (vt.sold_at at time zone 'America/Lima')::date
from public.verified_transactions vt
join public.listings l on l.id = vt.listing_id
join public.profiles p on p.id = vt.buyer_user_id and p.account_type = 'seller'
where public.listing_taxonomy_is_valid(l.category, coalesce(l.instrument_type, 'other'))
on conflict (transaction_id) do nothing;

-- buy-06: one opt-in reminder per item to change strings, reeds or drumheads. Off until the person turns it on.
create table public.gear_reminders (
  gear_item_id uuid primary key references public.gear_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('strings', 'reeds', 'drumheads')),
  every_months integer not null check (every_months between 1 and 12),
  last_changed_on date not null,
  next_due_on date not null,
  last_sent_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index gear_reminders_due_idx on public.gear_reminders(next_due_on);
create index gear_reminders_user_idx on public.gear_reminders(user_id);

create trigger gear_reminders_set_updated_at
before update on public.gear_reminders
for each row execute function public.set_updated_at();

alter table public.gear_reminders enable row level security;

create policy "Owners read own gear reminders"
on public.gear_reminders for select to authenticated
using (user_id = (select auth.uid()));

revoke all on public.gear_reminders from anon;
revoke insert, update, delete, truncate, references, trigger on public.gear_reminders from authenticated;
grant select on public.gear_reminders to authenticated;

-- What an item's reminder would change, if any: strings for guitars, basses and other stringed instruments, reeds
-- for winds, drumheads for drums.
create or replace function public.gear_reminder_kind(p_instrument_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_instrument_type in ('electric_guitar', 'acoustic_guitar', 'bass', 'string_instrument') then 'strings'
    when p_instrument_type = 'winds' then 'reeds'
    when p_instrument_type = 'drums' then 'drumheads'
    else null
  end;
$$;

grant execute on function public.gear_reminder_kind(text) to anon, authenticated;

-- Turns the item's reminder on (or changes it). p_last_changed_on: when the strings, reeds or heads were last changed;
-- the next reminder is that date plus p_every_months, never before tomorrow.
create or replace function public.set_gear_reminder(p_gear_id uuid, p_every_months integer, p_last_changed_on date)
returns date
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  uid uuid := laria_private.gear_require_owner();
  item public.gear_items%rowtype;
  v_kind text;
  today date := (now() at time zone 'America/Lima')::date;
  due date;
begin
  select * into item from public.gear_items where id = p_gear_id and user_id = uid;
  if not found then
    raise exception 'GEAR_NOT_FOUND: Ese equipo ya no está en tu lista.';
  end if;
  v_kind := public.gear_reminder_kind(item.instrument_type);
  if v_kind is null then
    raise exception 'GEAR_REMINDER_NOT_APPLICABLE: Este equipo no tiene cuerdas, cañas ni parches que cambiar.';
  end if;
  if p_every_months is null or p_every_months not between 1 and 12 then
    raise exception 'GEAR_REMINDER_INTERVAL_INVALID: Elige cada cuántos meses (de 1 a 12).';
  end if;
  if p_last_changed_on is null or p_last_changed_on > today or p_last_changed_on < today - 3650 then
    raise exception 'GEAR_REMINDER_DATE_INVALID: Indica cuándo los cambiaste por última vez.';
  end if;
  due := greatest((p_last_changed_on + make_interval(months => p_every_months))::date, today + 1);
  insert into public.gear_reminders(gear_item_id, user_id, kind, every_months, last_changed_on, next_due_on)
  values (item.id, uid, v_kind, p_every_months, p_last_changed_on, due)
  on conflict (gear_item_id) do update
    set kind = excluded.kind, every_months = excluded.every_months, last_changed_on = excluded.last_changed_on,
        next_due_on = excluded.next_due_on;
  return due;
end;
$$;

-- "Ya los cambié": the next reminder counts from today.
create or replace function public.mark_gear_reminder_done(p_gear_id uuid)
returns date
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  uid uuid := laria_private.gear_require_owner();
  today date := (now() at time zone 'America/Lima')::date;
  due date;
begin
  update public.gear_reminders
  set last_changed_on = today, next_due_on = (today + make_interval(months => every_months))::date
  where gear_item_id = p_gear_id and user_id = uid
  returning next_due_on into due;
  if due is null then
    raise exception 'GEAR_REMINDER_NOT_FOUND: Ese recordatorio ya no está activo.';
  end if;
  return due;
end;
$$;

-- One tap to stop it. Works for any account type so a person who changed theirs can still stop it.
create or replace function public.stop_gear_reminder(p_gear_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED: Inicia sesión para continuar.';
  end if;
  delete from public.gear_reminders where gear_item_id = p_gear_id and user_id = auth.uid();
  return found;
end;
$$;

revoke all on function public.set_gear_reminder(uuid, integer, date), public.mark_gear_reminder_done(uuid), public.stop_gear_reminder(uuid) from public, anon;
grant execute on function public.set_gear_reminder(uuid, integer, date), public.mark_gear_reminder_done(uuid), public.stop_gear_reminder(uuid) to authenticated;

-- The one-click "No más recordatorios" link in a reminder e-mail (signed in lib/email/links.ts): stops all of them.
create or replace function public.stop_gear_reminders_by_link(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_REQUIRED';
  end if;
  delete from public.gear_reminders where user_id = p_user_id;
  return true;
end;
$$;

revoke all on function public.stop_gear_reminders_by_link(uuid) from public, anon, authenticated;
grant execute on function public.stop_gear_reminders_by_link(uuid) to service_role;
