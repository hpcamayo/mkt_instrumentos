-- Review fixes for PAY-1 (docs/store-operations/review-fixes.md, items A2 and A14; Codex review item 6).
--
-- Changes to 20261028120000_pay_1_store_payment_methods.sql, nothing applied anywhere but local databases:
--   * Free text (holder, note) is checked after NFKC folding: digits split by any separator ("987/654/321",
--     "4111 1111 …") count as one run, nine digits anywhere are refused, any host name ("pago.xyz/abc",
--     "pago.pe?ref=abc", "caja.xn--p1ai/abc"), URL scheme or e-mail is refused, and only letters, digits and common
--     punctuation are accepted (no invisible separators, other scripts or emoji). The filter is a guard, not a promise:
--     Admin review stays the check for anything it cannot recognise (numbers written in words, for example).
--   * The provider label is no longer free text: one of a fixed list per method (lib/payment-methods.ts
--     PAYMENT_PROVIDER_OPTIONS), stored in its canonical spelling.
--   * store_payment_methods.revision goes up on every change of the row. The Admin decides on the revision they saw
--     (p_expected_revision), so two changes in one transaction can no longer share a token the way updated_at did.
--   * A change of RUC or razón social now also moves the revision of every pending method (and records it), so an
--     Admin screen loaded against the old business identity cannot approve.
--   * The pilot switch is enforced in the database too: laria_private.assisted_commerce_settings.pilot_enabled
--     (default off). With it off, owners cannot propose methods and public reads return nothing; owner withdrawal and
--     Admin review keep working. The app switch LARIA_ASSISTED_COMMERCE still decides what the screens show.
--   * Store rows are locked FOR NO KEY UPDATE instead of FOR UPDATE (see 20261029120100_review_fixes_lock_order.sql).

-- ------------------------------------------------------------------ pilot switch

create table laria_private.assisted_commerce_settings (
  id             boolean primary key default true check (id),
  pilot_enabled  boolean not null default false,
  changed_at     timestamptz not null default now(),
  changed_by     text not null default current_user,
  reason         text check (reason is null or char_length(reason) between 3 and 280)
);
insert into laria_private.assisted_commerce_settings(id) values (true);
revoke all on laria_private.assisted_commerce_settings from public, anon, authenticated;

create or replace function laria_private.assisted_commerce_pilot_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select coalesce((select pilot_enabled from laria_private.assisted_commerce_settings where id), false); $$;

-- Run by an operator with database owner rights (SQL editor) when the pilot starts or stops, together with the app
-- switch LARIA_ASSISTED_COMMERCE. Not callable through the API.
create or replace function laria_private.set_assisted_commerce_pilot(p_enabled boolean, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare change_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_enabled is null or change_reason is null or char_length(change_reason) not between 3 and 280 then
    raise exception 'Indica si el piloto queda activo y el motivo.';
  end if;
  update laria_private.assisted_commerce_settings
  set pilot_enabled = p_enabled, changed_at = now(), changed_by = session_user, reason = change_reason
  where id;
  return p_enabled;
end;
$$;

-- ------------------------------------------------------------------ review revision

alter table public.store_payment_methods add column revision integer not null default 1 check (revision >= 1);

create or replace function laria_private.bump_payment_method_revision()
returns trigger
language plpgsql
as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;

create trigger store_payment_methods_bump_revision
before update on public.store_payment_methods
for each row execute function laria_private.bump_payment_method_revision();

create or replace function laria_private.payment_method_json(p_row public.store_payment_methods)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'store_id', p_row.store_id, 'method', p_row.method, 'status', p_row.status,
    'holder_name', p_row.holder_name, 'provider_label', p_row.provider_label, 'owner_note', p_row.owner_note,
    'review_reason', p_row.review_reason, 'reviewed_at', p_row.reviewed_at, 'updated_at', p_row.updated_at,
    'revision', p_row.revision);
$$;

-- ------------------------------------------------------------------ text checks

-- Trimmed free text, null when blank. Refuses what Pilot A must not store: phone, account or card numbers, links and
-- e-mail addresses, also when written with separators, full-width characters or obfuscated dots.
create or replace function laria_private.payment_method_text(p_value text, p_max integer)
returns text
language plpgsql
immutable
as $$
declare
  value text := nullif(btrim(regexp_replace(normalize(coalesce(p_value, ''), NFKC), '\s+', ' ', 'g')), '');
  folded text;
begin
  if value is null then return null; end if;
  if char_length(value) > p_max or char_length(value) < 2 then
    perform laria_private.raise_payment_error('PAYMENT_METHOD_TEXT_LENGTH', 'Revisa la longitud del texto.');
  end if;
  -- Ideographic full stops and "pago[.]pe", "pago(punto)pe" read as dots.
  folded := regexp_replace(lower(translate(value, '。', '.')), '\s*[\[\(\{]\s*(\.|dot|punto)\s*[\]\)\}]\s*', '.', 'g');
  if regexp_replace(folded, '([0-9])[^a-z0-9à-öø-ÿā-ž]+(?=[0-9])', '\1', 'g') ~ '[0-9]{6,}'
    or char_length(regexp_replace(folded, '[^0-9]', '', 'g')) >= 9
    or folded ~ '[a-z][a-z0-9+.-]*:/'
    or folded ~ '\m(tel|mailto|sms|whatsapp):'
    or folded ~ '(^|[^a-z0-9à-öø-ÿā-ž_-])[a-z0-9à-öø-ÿā-ž-]+(\.[a-z0-9à-öø-ÿā-ž-]+)*\.([a-z]{2,63}|xn--[a-z0-9-]{1,59})($|[^a-z0-9à-öø-ÿā-ž-])'
    or folded ~ '[^\s@]+@[^\s@]+\.[^\s@]+' then
    perform laria_private.raise_payment_error('PAYMENT_METHOD_SENSITIVE_DATA',
      'No escribas números de teléfono, cuenta o tarjeta (ni otras secuencias largas de números), enlaces ni correos. '
      || 'Laria solo muestra qué medios aceptas.');
  end if;
  if value !~ '^[A-Za-z0-9À-ÖØ-öø-ÿĀ-ž .,;:!¡?¿''"’‘“”()&/+%#°ºª*_-]+$' then
    perform laria_private.raise_payment_error('PAYMENT_METHOD_TEXT_INVALID',
      'Usa solo letras, números y signos de puntuación comunes.');
  end if;
  return value;
end;
$$;

-- The provider a buyer sees next to the method: empty, or one of the names Laria lists for that method (same list as
-- PAYMENT_PROVIDER_OPTIONS in lib/payment-methods.ts). Matching ignores case, accents of width and spaces.
create or replace function laria_private.payment_provider_options(p_method public.store_payment_method)
returns text[]
language sql
immutable
as $$
  select case p_method
    when 'yape_plin' then array['Yape', 'Plin', 'Yape y Plin']
    when 'pos_tarjeta_al_recoger' then array['Izipay', 'Niubiz', 'Culqi', 'Mercado Pago', 'OpenPay']
    when 'link_de_pago' then array['Izipay', 'Niubiz', 'Culqi', 'Mercado Pago', 'OpenPay', 'PayPal']
    else array[]::text[]
  end;
$$;

create or replace function laria_private.payment_provider_label(p_method public.store_payment_method, p_value text)
returns text
language plpgsql
immutable
as $$
declare
  wanted text := regexp_replace(lower(normalize(coalesce(p_value, ''), NFKC)), '[^a-z0-9]', '', 'g');
  option text;
begin
  if nullif(btrim(coalesce(p_value, '')), '') is null then return null; end if;
  foreach option in array laria_private.payment_provider_options(p_method) loop
    if regexp_replace(lower(option), '[^a-z0-9]', '', 'g') = wanted then return option; end if;
  end loop;
  perform laria_private.raise_payment_error('PAYMENT_PROVIDER_INVALID', 'Elige el proveedor de la lista.');
end;
$$;

-- ------------------------------------------------------------------ store lock

-- The caller's own store, locked for the rest of the transaction. FOR NO KEY UPDATE serializes with the store's own
-- changes (an RUC change, Admin decisions) without blocking foreign-key checks from other tables.
create or replace function laria_private.payment_caller_store()
returns public.stores
language plpgsql
security definer
set search_path = public
as $$
declare store_record public.stores;
begin
  select s.* into store_record
  from public.stores s
  where auth.uid() is not null and s.owner_user_id = auth.uid() and public.is_store_owner(s.id)
  for no key update;
  if store_record.id is null then
    perform laria_private.raise_payment_error('PAYMENT_STORE_REQUIRED', 'Necesitas una tienda para indicar medios de pago.');
  end if;
  return store_record;
end;
$$;

-- ------------------------------------------------------------------ public reads

-- What a buyer may see for a store right now: nothing while the pilot is off; otherwise approved methods, only while
-- the store is active and verified. get_store_payment_methods, get_listing_purchase_request and the purchase-intent
-- check all read through here.
create or replace function laria_private.public_payment_methods(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('method', m.method, 'provider_label', m.provider_label) order by m.method), '[]'::jsonb)
  from public.store_payment_methods m
  join public.stores s on s.id = m.store_id
  where laria_private.assisted_commerce_pilot_enabled()
    and m.store_id = p_store_id and m.status = 'approved' and s.status = 'active' and s.is_verified;
$$;

-- ------------------------------------------------------------------ owner proposals

create or replace function public.set_store_payment_method(
  p_method public.store_payment_method,
  p_holder_name text default null,
  p_provider_label text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  store_record public.stores;
  previous public.store_payment_methods;
  saved public.store_payment_methods;
  holder text;
  provider text;
  note text;
begin
  if not laria_private.assisted_commerce_pilot_enabled() then
    perform laria_private.raise_payment_error('PAYMENT_PILOT_OFF', 'Los medios de pago aún no están disponibles.');
  end if;
  if p_method is null then
    perform laria_private.raise_payment_error('PAYMENT_METHOD_INVALID', 'Elige un medio de pago.');
  end if;
  holder := laria_private.payment_method_text(p_holder_name, 140);
  provider := laria_private.payment_provider_label(p_method, p_provider_label);
  note := laria_private.payment_method_text(p_note, 280);
  store_record := laria_private.payment_caller_store();
  -- D-2: payments only for verified stores.
  if store_record.status <> 'active' or not store_record.is_verified then
    perform laria_private.raise_payment_error('PAYMENT_STORE_NOT_VERIFIED',
      'Solo las tiendas verificadas pueden mostrar medios de pago.');
  end if;
  if p_method <> 'efectivo_al_recoger' and holder is null then
    perform laria_private.raise_payment_error('PAYMENT_HOLDER_REQUIRED',
      'Indica el titular que recibe el pago, tal como figura en tu cuenta.');
  end if;
  if p_method = 'efectivo_al_recoger' then holder := null; end if;

  select * into previous from public.store_payment_methods where store_id = store_record.id and method = p_method for update;
  if previous.store_id is not null and previous.status in ('pending_review', 'approved')
    and previous.holder_name is not distinct from holder
    and previous.provider_label is not distinct from provider
    and previous.owner_note is not distinct from note then
    return laria_private.payment_method_json(previous);
  end if;

  insert into public.store_payment_methods(store_id, method, status, holder_name, provider_label, owner_note)
  values (store_record.id, p_method, 'pending_review', holder, provider, note)
  on conflict (store_id, method) do update set
    status = 'pending_review', holder_name = excluded.holder_name, provider_label = excluded.provider_label,
    owner_note = excluded.owner_note, reviewed_by = null, reviewed_at = null, review_reason = null
  returning * into saved;

  insert into public.store_payment_method_changes(store_id, method, change_type, actor_kind, actor_user_id, before, after)
  values (store_record.id, p_method, 'proposed', 'owner', auth.uid(),
    case when previous.store_id is null then null else laria_private.payment_method_json(previous) end,
    laria_private.payment_method_json(saved));
  return laria_private.payment_method_json(saved);
end;
$$;

-- ------------------------------------------------------------------ Admin review

-- approve: only a pending proposal of an active, verified store, after checking the holder against RUC/razón social.
-- reject: a pending proposal. disable: an approved method. Each needs a reason and the revision the Admin saw.
drop function public.admin_review_store_payment_method(uuid, public.store_payment_method, text, text, timestamptz);

create or replace function public.admin_review_store_payment_method(
  p_store_id uuid,
  p_method public.store_payment_method,
  p_decision text,
  p_reason text,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
  store_record public.stores;
  previous public.store_payment_methods;
  saved public.store_payment_methods;
  next_status text;
begin
  perform laria_private.assert_admin();
  if p_decision is null or p_decision not in ('approve', 'reject', 'disable') then
    perform laria_private.raise_payment_error('PAYMENT_DECISION_INVALID', 'Elige aprobar, rechazar o desactivar.');
  end if;
  if reason is null or char_length(reason) not between 3 and 280 then
    perform laria_private.raise_payment_error('PAYMENT_REASON_REQUIRED', 'Indica el motivo o lo que comprobaste.');
  end if;
  -- Lock order: store, then method (as the owner functions), so a concurrent RUC change cannot slip between.
  select * into store_record from public.stores where id = p_store_id for no key update;
  if store_record.id is null then
    perform laria_private.raise_payment_error('STORE_NOT_FOUND', 'La tienda no existe.');
  end if;
  select * into previous from public.store_payment_methods where store_id = p_store_id and method = p_method for update;
  if previous.store_id is null then
    perform laria_private.raise_payment_error('PAYMENT_METHOD_NOT_FOUND', 'Ese medio de pago no está registrado.');
  end if;
  if p_expected_revision is null or previous.revision <> p_expected_revision then
    perform laria_private.raise_payment_error('PAYMENT_METHOD_CHANGED',
      'La tienda cambió este medio de pago o sus datos comerciales. Vuelve a revisarlo antes de decidir.');
  end if;

  if p_decision = 'approve' then
    if previous.status <> 'pending_review' then
      perform laria_private.raise_payment_error('PAYMENT_METHOD_NOT_PENDING', 'Solo se aprueba un medio de pago en revisión.');
    end if;
    if store_record.status <> 'active' or not store_record.is_verified then
      perform laria_private.raise_payment_error('PAYMENT_STORE_NOT_VERIFIED', 'La tienda debe estar activa y verificada.');
    end if;
    next_status := 'approved';
  elsif p_decision = 'reject' then
    if previous.status <> 'pending_review' then
      perform laria_private.raise_payment_error('PAYMENT_METHOD_NOT_PENDING', 'Solo se rechaza un medio de pago en revisión.');
    end if;
    next_status := 'rejected';
  else
    if previous.status <> 'approved' then
      perform laria_private.raise_payment_error('PAYMENT_METHOD_NOT_APPROVED', 'Solo se desactiva un medio de pago aprobado.');
    end if;
    next_status := 'disabled';
  end if;

  update public.store_payment_methods
  set status = next_status, reviewed_by = auth.uid(), reviewed_at = now(), review_reason = reason
  where store_id = p_store_id and method = p_method
  returning * into saved;

  insert into public.store_payment_method_changes(store_id, method, change_type, actor_kind, actor_user_id, before, after, reason)
  values (p_store_id, p_method, next_status, 'admin', auth.uid(),
    laria_private.payment_method_json(previous), laria_private.payment_method_json(saved), reason);
  perform laria_private.record_admin_audit('store_payment_method_' || next_status, 'store', p_store_id,
    jsonb_build_object('method', p_method, 'from', previous.status, 'to', next_status, 'reason', reason));
  return laria_private.payment_method_json(saved);
end;
$$;

-- ------------------------------------------------------------------ store business data changes

-- The Admin approves each method against the store's RUC and razón social. If either changes, approved methods go back
-- to review, and pending ones get a new revision, so a review screen loaded against the old data cannot decide.
create or replace function laria_private.review_payment_methods_on_business_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare item public.store_payment_methods; saved public.store_payment_methods;
begin
  if new.ruc is not distinct from old.ruc and new.razon_social is not distinct from old.razon_social then
    return new;
  end if;
  for item in
    select * from public.store_payment_methods
    where store_id = new.id and status in ('approved', 'pending_review')
    order by method for update
  loop
    update public.store_payment_methods
    set status = 'pending_review', reviewed_by = null, reviewed_at = null, review_reason = null
    where store_id = item.store_id and method = item.method
    returning * into saved;
    insert into public.store_payment_method_changes(store_id, method, change_type, actor_kind, actor_user_id, before, after, reason)
    values (item.store_id, item.method, 'business_data_changed', 'system', auth.uid(),
      laria_private.payment_method_json(item), laria_private.payment_method_json(saved), 'Cambió el RUC o la razón social');
  end loop;
  return new;
end;
$$;

-- ------------------------------------------------------------------ grants

revoke all on function laria_private.assisted_commerce_pilot_enabled() from public, anon, authenticated;
revoke all on function laria_private.set_assisted_commerce_pilot(boolean, text) from public, anon, authenticated, service_role;
revoke all on function laria_private.bump_payment_method_revision() from public, anon, authenticated;
revoke all on function laria_private.payment_provider_options(public.store_payment_method) from public, anon, authenticated;
revoke all on function laria_private.payment_provider_label(public.store_payment_method, text) from public, anon, authenticated;

revoke all on function public.admin_review_store_payment_method(uuid, public.store_payment_method, text, text, integer) from public, anon, authenticated;
grant execute on function public.admin_review_store_payment_method(uuid, public.store_payment_method, text, text, integer) to authenticated;
