-- Feature ideas, batch store-locations (docs/feature-ideas/store-locations.md), run-03 "Boleta electrónica".
--
-- A store connects its own electronic-invoicing account (Nubefact) and a Mostrador sale issues a boleta or factura in
-- one tap. The store pays its provider and is the issuer; Laria only passes the sale to the store's account and keeps
-- the result for the store. Laria handles no money and charges nothing.
--
-- Trust boundaries:
--   * The store's API token never reaches a browser. The server encrypts it (AES-256-GCM, key LARIA_EINVOICE_KEY,
--     bound to the store id) before it is saved, and only the service role can read the column back.
--   * A receipt is prepared with the owner's session: prepare_store_receipt checks the sale (the Mostrador batch) and
--     takes the next number of the series under a row lock, so two receipts never share a number.
--   * Only the server, with the service role, records what the provider answered (record_store_receipt_result), so a
--     browser cannot mark a receipt "aceptada por SUNAT".
-- Additive; no existing function is redefined.

-- ------------------------------------------------------------------ settings

create table public.store_einvoice_settings (
  store_id               uuid primary key references public.stores(id) on delete cascade,
  provider               text not null default 'nubefact' check (provider = 'nubefact'),
  -- The account's "RUTA": https://api.nubefact.com/api/v1/<id>.
  api_url                text not null check (api_url ~ '^https://api\.nubefact\.com/api/v1/[A-Za-z0-9_-]{8,80}$'),
  token_ciphertext       text not null check (token_ciphertext ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'),
  token_hint             text not null check (token_hint ~ '^[A-Za-z0-9]{4}$'),
  boleta_series          text not null default 'B001' check (boleta_series ~ '^B[A-Z0-9]{3}$'),
  factura_series         text not null default 'F001' check (factura_series ~ '^F[A-Z0-9]{3}$'),
  next_boleta_number     integer not null default 1 check (next_boleta_number between 1 and 99999999),
  next_factura_number    integer not null default 1 check (next_factura_number between 1 and 99999999),
  -- How the store's sales are taxed: gravado (IGV 18 %), exonerado (for example the Amazonía) or inafecto.
  igv_affectation        text not null default 'gravado' check (igv_affectation in ('gravado', 'exonerado', 'inafecto')),
  -- The provider e-mails the PDF when the customer gave an address.
  email_customer         boolean not null default true,
  connected_at           timestamptz not null default now(),
  checked_at             timestamptz,
  updated_at             timestamptz not null default now(),
  updated_by             uuid
);

create trigger store_einvoice_settings_set_updated_at
before update on public.store_einvoice_settings
for each row execute function public.set_updated_at();

comment on column public.store_einvoice_settings.token_ciphertext is
  'run-03: the store''s Nubefact token, encrypted by the server (v1.<iv>.<tag>.<data>, AES-256-GCM bound to the store id). Service role only.';

-- ------------------------------------------------------------------ receipts

create table public.store_receipts (
  id                     uuid primary key default gen_random_uuid(),
  store_id               uuid not null references public.stores(id) on delete cascade,
  kind                   text not null check (kind in ('boleta', 'factura')),
  series                 text not null check (series ~ '^[BF][A-Z0-9]{3}$'),
  number                 integer not null check (number between 1 and 99999999),
  status                 text not null default 'pending'
                           check (status in ('pending', 'accepted', 'rejected', 'error', 'void_pending', 'voided')),
  -- The Mostrador sale it documents (its batch key): one receipt per sale.
  sale_key               text not null check (char_length(sale_key) between 8 and 160),
  location_id            uuid references public.store_locations(id) on delete set null,
  customer_doc_type      text not null check (customer_doc_type in ('none', 'dni', 'ruc', 'ce', 'pasaporte')),
  customer_doc_number    text check (customer_doc_number is null or customer_doc_number ~ '^[A-Za-z0-9-]{4,15}$'),
  customer_name          text check (customer_name is null or char_length(btrim(customer_name)) between 2 and 100),
  customer_address       text check (customer_address is null or char_length(btrim(customer_address)) between 5 and 200),
  customer_email         text check (customer_email is null or (char_length(customer_email) <= 120 and customer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  -- [{item_id, sku, description, quantity, unit_price_cents}] with prices in céntimos, IGV included.
  lines                  jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) between 1 and 200),
  igv_affectation        text not null check (igv_affectation in ('gravado', 'exonerado', 'inafecto')),
  total_cents            bigint not null check (total_cents > 0),
  issue_date             date not null,
  attempts               integer not null default 0 check (attempts >= 0),
  provider_link          text check (provider_link is null or provider_link ~ '^https://'),
  pdf_url                text check (pdf_url is null or pdf_url ~ '^https://'),
  xml_url                text check (xml_url is null or xml_url ~ '^https://'),
  cdr_url                text check (cdr_url is null or cdr_url ~ '^https://'),
  -- What SUNAT said so far: a boleta goes in the provider's daily summary, so it can be issued before SUNAT accepts it.
  sunat_accepted         boolean,
  sunat_description      text check (sunat_description is null or char_length(sunat_description) <= 500),
  error_message          text check (error_message is null or char_length(error_message) <= 500),
  void_reason            text check (void_reason is null or char_length(btrim(void_reason)) between 3 and 100),
  voided_at              timestamptz,
  created_by             uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint store_receipts_series_kind check (left(series, 1) = case kind when 'boleta' then 'B' else 'F' end),
  constraint store_receipts_factura_ruc check (kind <> 'factura' or (customer_doc_type = 'ruc' and customer_name is not null)),
  constraint store_receipts_doc check ((customer_doc_type = 'none') = (customer_doc_number is null))
);
create index if not exists store_receipts_location_idx on public.store_receipts (location_id)
  where location_id is not null;

create unique index store_receipts_number_idx on public.store_receipts(store_id, series, number);
create unique index store_receipts_sale_idx on public.store_receipts(store_id, sale_key);
create index store_receipts_store_idx on public.store_receipts(store_id, created_at desc, id desc);

create trigger store_receipts_set_updated_at
before update on public.store_receipts
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------ RLS and grants

alter table public.store_einvoice_settings enable row level security;
alter table public.store_receipts enable row level security;

revoke all on public.store_einvoice_settings, public.store_receipts from public, anon, authenticated;
-- Owners read their receipts directly; settings only through get_einvoice_settings (never the token).
grant select on public.store_receipts to authenticated;
grant select, update on public.store_einvoice_settings to service_role;
grant select, update on public.store_receipts to service_role;

create policy "Store owners can read own receipts" on public.store_receipts
  for select to authenticated using (public.is_store_owner(store_id));
create policy "Admins can read receipts" on public.store_receipts
  for select to authenticated using ((select public.is_admin()));

-- ------------------------------------------------------------------ helpers

create or replace function laria_private.receipt_error(p_code text, p_message text)
returns void
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001', message = p_code || ': ' || p_message;
end;
$$;

-- The caller's store, for receipts: a verified, active store with Inventario on.
create or replace function laria_private.receipt_caller_store()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare owner_store_id uuid := laria_private.inventory_caller_store(true);
begin
  if not exists (select 1 from public.stores where id = owner_store_id and status = 'active' and is_verified) then
    perform laria_private.receipt_error('RECEIPT_STORE_NOT_VERIFIED', 'La boleta electrónica es para tiendas verificadas.');
  end if;
  return owner_store_id;
end;
$$;

create or replace function laria_private.store_receipt_json(p_receipt public.store_receipts)
returns jsonb
language sql
stable
as $$
  select to_jsonb(p_receipt) - 'created_by';
$$;

-- ------------------------------------------------------------------ owner: settings

create or replace function public.get_einvoice_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_caller_store(false);
  settings public.store_einvoice_settings;
begin
  select * into settings from public.store_einvoice_settings where store_id = owner_store_id;
  if not found then return jsonb_build_object('connected', false); end if;
  return jsonb_build_object('connected', true, 'provider', settings.provider, 'api_url', settings.api_url,
    'token_hint', settings.token_hint, 'boleta_series', settings.boleta_series, 'factura_series', settings.factura_series,
    'next_boleta_number', settings.next_boleta_number, 'next_factura_number', settings.next_factura_number,
    'igv_affectation', settings.igv_affectation, 'email_customer', settings.email_customer,
    'connected_at', settings.connected_at, 'checked_at', settings.checked_at);
end;
$$;

-- Saves the connection. p_fields: api_url, token_ciphertext and token_hint (both or neither; required the first time),
-- boleta_series, factura_series, next_boleta_number, next_factura_number, igv_affectation, email_customer, checked.
-- A number can only move forward past every receipt Laria already numbered in that series.
create or replace function public.save_einvoice_settings(p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.receipt_caller_store();
  current_settings public.store_einvoice_settings;
  v_boleta text;
  v_factura text;
  v_next_boleta integer;
  v_next_factura integer;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_fields) key where key not in ('api_url', 'token_ciphertext', 'token_hint',
      'boleta_series', 'factura_series', 'next_boleta_number', 'next_factura_number', 'igv_affectation',
      'email_customer', 'checked')
  ) then
    perform laria_private.receipt_error('EINVOICE_SETTINGS_INVALID', 'Revisa los datos de la conexión.');
  end if;
  if (p_fields ? 'token_ciphertext') <> (p_fields ? 'token_hint') then
    perform laria_private.receipt_error('EINVOICE_SETTINGS_INVALID', 'Revisa el token.');
  end if;
  select * into current_settings from public.store_einvoice_settings where store_id = owner_store_id for update;
  if not found and not (p_fields ? 'token_ciphertext' and p_fields ? 'api_url') then
    perform laria_private.receipt_error('EINVOICE_TOKEN_REQUIRED', 'Pega la ruta y el token de tu cuenta de Nubefact.');
  end if;

  v_boleta := upper(coalesce(nullif(btrim(p_fields->>'boleta_series'), ''), current_settings.boleta_series, 'B001'));
  v_factura := upper(coalesce(nullif(btrim(p_fields->>'factura_series'), ''), current_settings.factura_series, 'F001'));
  begin
    v_next_boleta := coalesce((p_fields->>'next_boleta_number')::integer, current_settings.next_boleta_number, 1);
    v_next_factura := coalesce((p_fields->>'next_factura_number')::integer, current_settings.next_factura_number, 1);
  exception when invalid_text_representation or numeric_value_out_of_range then
    perform laria_private.receipt_error('EINVOICE_NUMBER_INVALID', 'El número siguiente debe ser un número entero.');
  end;
  if v_next_boleta <= coalesce((select max(number) from public.store_receipts
      where store_id = owner_store_id and series = v_boleta), 0)
    or v_next_factura <= coalesce((select max(number) from public.store_receipts
      where store_id = owner_store_id and series = v_factura), 0) then
    perform laria_private.receipt_error('EINVOICE_NUMBER_USED', 'Ese número ya se usó en esa serie. Elige uno mayor.');
  end if;

  begin
    insert into public.store_einvoice_settings as s (store_id, api_url, token_ciphertext, token_hint, boleta_series,
      factura_series, next_boleta_number, next_factura_number, igv_affectation, email_customer, checked_at, updated_by)
    values (owner_store_id,
      coalesce(p_fields->>'api_url', current_settings.api_url),
      coalesce(p_fields->>'token_ciphertext', current_settings.token_ciphertext),
      coalesce(p_fields->>'token_hint', current_settings.token_hint),
      v_boleta, v_factura, v_next_boleta, v_next_factura,
      coalesce(p_fields->>'igv_affectation', current_settings.igv_affectation, 'gravado'),
      coalesce((p_fields->>'email_customer')::boolean, current_settings.email_customer, true),
      case when coalesce((p_fields->>'checked')::boolean, false) then now() else current_settings.checked_at end,
      auth.uid())
    on conflict (store_id) do update set
      api_url = excluded.api_url, token_ciphertext = excluded.token_ciphertext, token_hint = excluded.token_hint,
      boleta_series = excluded.boleta_series, factura_series = excluded.factura_series,
      next_boleta_number = excluded.next_boleta_number, next_factura_number = excluded.next_factura_number,
      igv_affectation = excluded.igv_affectation, email_customer = excluded.email_customer,
      checked_at = excluded.checked_at, updated_by = excluded.updated_by;
  exception when check_violation or invalid_text_representation then
    perform laria_private.receipt_error('EINVOICE_SETTINGS_INVALID',
      'Revisa la ruta (https://api.nubefact.com/api/v1/…), las series (B001, F001) y el tipo de IGV.');
  end;
  return public.get_einvoice_settings();
end;
$$;

-- Removes the connection (the token goes with it). Receipts already issued stay in Comprobantes.
create or replace function public.disconnect_einvoice()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare owner_store_id uuid := laria_private.inventory_caller_store(false);
begin
  delete from public.store_einvoice_settings where store_id = owner_store_id;
  return jsonb_build_object('connected', false);
end;
$$;

-- ------------------------------------------------------------------ owner: receipts

-- Prepares the receipt of one Mostrador sale and takes its number. p_fields: sale_key, kind (boleta|factura),
-- customer {doc_type, doc_number, name, address, email}, lines [{item_id, unit_price_cents}] (one per sold SKU; the
-- price charged, IGV included, defaults to the SKU's price). Quantities come from the sale itself. A retry with the
-- same sale returns the receipt already prepared.
create or replace function public.prepare_store_receipt(p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.receipt_caller_store();
  settings public.store_einvoice_settings;
  receipt public.store_receipts;
  v_sale_key text := laria_private.inventory_request_key(p_fields->>'sale_key', 160);
  v_kind text := p_fields->>'kind';
  customer jsonb := coalesce(p_fields->'customer', '{}'::jsonb);
  v_doc_type text := coalesce(nullif(customer->>'doc_type', ''), 'none');
  v_doc_number text := nullif(upper(regexp_replace(coalesce(customer->>'doc_number', ''), '\s', '', 'g')), '');
  v_name text := nullif(btrim(regexp_replace(coalesce(customer->>'name', ''), '\s+', ' ', 'g')), '');
  v_address text := nullif(btrim(customer->>'address'), '');
  v_email text := nullif(lower(btrim(customer->>'email')), '');
  sold record;
  prices jsonb := '{}'::jsonb;
  entry jsonb;
  built jsonb := '[]'::jsonb;
  total bigint := 0;
  price bigint;
  v_series text;
  v_number integer;
  v_location uuid;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    perform laria_private.receipt_error('RECEIPT_INVALID', 'Revisa los datos del comprobante.');
  end if;
  if v_kind not in ('boleta', 'factura') then
    perform laria_private.receipt_error('RECEIPT_KIND', 'Elige boleta o factura.');
  end if;

  select * into receipt from public.store_receipts where store_id = owner_store_id and sale_key = v_sale_key;
  if found then
    return jsonb_build_object('receipt', laria_private.store_receipt_json(receipt), 'replayed', true);
  end if;

  -- The customer.
  if v_doc_type not in ('none', 'dni', 'ruc', 'ce', 'pasaporte') then
    perform laria_private.receipt_error('RECEIPT_DOCUMENT', 'Elige el tipo de documento.');
  end if;
  if v_doc_type = 'none' then
    v_doc_number := null;
  elsif v_doc_number is null then
    perform laria_private.receipt_error('RECEIPT_DOCUMENT', 'Escribe el número de documento.');
  elsif v_doc_type = 'dni' and v_doc_number !~ '^\d{8}$' then
    perform laria_private.receipt_error('RECEIPT_DNI', 'El DNI tiene 8 dígitos.');
  elsif v_doc_type = 'ruc' and v_doc_number !~ '^(10|15|17|20)\d{9}$' then
    perform laria_private.receipt_error('RECEIPT_RUC', 'El RUC tiene 11 dígitos y empieza con 10, 15, 17 o 20.');
  elsif v_doc_type in ('ce', 'pasaporte') and v_doc_number !~ '^[A-Z0-9-]{4,15}$' then
    perform laria_private.receipt_error('RECEIPT_DOCUMENT', 'Revisa el número de documento.');
  end if;
  if v_kind = 'factura' and (v_doc_type <> 'ruc' or v_name is null) then
    perform laria_private.receipt_error('RECEIPT_FACTURA', 'La factura necesita el RUC y la razón social del cliente.');
  end if;
  if v_doc_type <> 'none' and v_name is null then
    perform laria_private.receipt_error('RECEIPT_NAME', 'Escribe el nombre del cliente.');
  end if;
  if v_name is not null and char_length(v_name) not between 2 and 100 then
    perform laria_private.receipt_error('RECEIPT_NAME', 'El nombre debe tener entre 2 y 100 caracteres.');
  end if;
  if v_email is not null and (char_length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    perform laria_private.receipt_error('RECEIPT_EMAIL', 'Revisa el correo del cliente.');
  end if;
  if v_address is not null and char_length(v_address) not between 5 and 200 then
    perform laria_private.receipt_error('RECEIPT_ADDRESS', 'Revisa la dirección del cliente.');
  end if;

  -- Prices the owner charged, by SKU.
  if p_fields ? 'lines' then
    if jsonb_typeof(p_fields->'lines') <> 'array' then
      perform laria_private.receipt_error('RECEIPT_INVALID', 'Revisa las líneas del comprobante.');
    end if;
    for entry in select value from jsonb_array_elements(p_fields->'lines') loop
      if laria_private.inventory_json_uuid(entry, 'item_id') is null then
        perform laria_private.receipt_error('RECEIPT_INVALID', 'Revisa las líneas del comprobante.');
      end if;
      if entry ? 'unit_price_cents' and entry->'unit_price_cents' <> 'null'::jsonb then
        begin
          price := (entry->>'unit_price_cents')::bigint;
        exception when others then
          price := null;
        end;
        if price is null or price not between 1 and 100000000000 then
          perform laria_private.receipt_error('RECEIPT_PRICE', 'Cada precio debe ser mayor que cero.');
        end if;
        prices := prices || jsonb_build_object(entry->>'item_id', price);
      end if;
    end loop;
  end if;

  -- The sale: the store's own Mostrador sale movements under this batch key, net of any undone.
  for sold in
    select m.item_id, -m.on_hand_delta as quantity, m.location_id, i.merchant_sku, i.product_name, i.variant_label,
      i.unit_price_pen
    from public.store_stock_movements m
    join public.store_inventory_items i on i.id = m.item_id
    where m.store_id = owner_store_id and m.movement_type = 'sale' and m.idempotency_key = v_sale_key || ':' || m.item_id::text
      and not exists (select 1 from public.store_stock_movements c where c.corrects_movement_id = m.id)
    order by i.merchant_sku, m.item_id
  loop
    price := coalesce((prices->>sold.item_id::text)::bigint, sold.unit_price_pen::bigint * 100);
    if price is null then
      perform laria_private.receipt_error('RECEIPT_PRICE', format('Escribe el precio de %s.', sold.merchant_sku));
    end if;
    built := built || jsonb_build_array(jsonb_build_object(
      'item_id', sold.item_id, 'sku', sold.merchant_sku,
      'description', left(sold.product_name || coalesce(' · ' || sold.variant_label, ''), 250),
      'quantity', sold.quantity, 'unit_price_cents', price));
    total := total + price * sold.quantity;
    v_location := coalesce(v_location, sold.location_id);
  end loop;
  if jsonb_array_length(built) = 0 then
    perform laria_private.receipt_error('RECEIPT_SALE_NOT_FOUND', 'No encontramos esa venta del Mostrador, o ya se deshizo.');
  end if;
  if exists (select 1 from jsonb_object_keys(prices) key
             where not exists (select 1 from jsonb_array_elements(built) line where line->>'item_id' = key)) then
    perform laria_private.receipt_error('RECEIPT_INVALID', 'Una línea no corresponde a la venta.');
  end if;
  -- SUNAT: a boleta of S/ 700 or more identifies the customer.
  if v_kind = 'boleta' and total >= 70000 and v_doc_type = 'none' then
    perform laria_private.receipt_error('RECEIPT_DOCUMENT_REQUIRED',
      'Para una boleta de S/ 700 o más, escribe el documento y el nombre del cliente.');
  end if;

  -- The number: one at a time per store, under the settings row lock.
  select * into settings from public.store_einvoice_settings where store_id = owner_store_id for update;
  if not found then
    perform laria_private.receipt_error('EINVOICE_NOT_CONNECTED', 'Conecta tu cuenta de Nubefact en Comprobantes.');
  end if;
  if v_kind = 'boleta' then
    v_series := settings.boleta_series; v_number := settings.next_boleta_number;
    update public.store_einvoice_settings set next_boleta_number = next_boleta_number + 1 where store_id = owner_store_id;
  else
    v_series := settings.factura_series; v_number := settings.next_factura_number;
    update public.store_einvoice_settings set next_factura_number = next_factura_number + 1 where store_id = owner_store_id;
  end if;

  insert into public.store_receipts (store_id, kind, series, number, sale_key, location_id, customer_doc_type,
    customer_doc_number, customer_name, customer_address, customer_email, lines, igv_affectation, total_cents,
    issue_date, created_by)
  values (owner_store_id, v_kind, v_series, v_number, v_sale_key, v_location, v_doc_type, v_doc_number, v_name,
    v_address, v_email, built, settings.igv_affectation, total, laria_private.lima_today(), auth.uid())
  returning * into receipt;
  return jsonb_build_object('receipt', laria_private.store_receipt_json(receipt), 'replayed', false);
end;
$$;

-- Asks to void an accepted receipt (comunicación de baja): within 7 days of its date, with a reason.
create or replace function public.request_store_receipt_void(p_receipt_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.receipt_caller_store();
  receipt public.store_receipts;
  reason text := nullif(btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g')), '');
begin
  select * into receipt from public.store_receipts where id = p_receipt_id and store_id = owner_store_id for update;
  if not found then
    perform laria_private.receipt_error('RECEIPT_NOT_FOUND', 'No encontramos ese comprobante.');
  end if;
  if receipt.status = 'void_pending' then
    return jsonb_build_object('receipt', laria_private.store_receipt_json(receipt), 'replayed', true);
  end if;
  if receipt.status <> 'accepted' then
    perform laria_private.receipt_error('RECEIPT_VOID_NOT_ALLOWED', 'Solo se anula un comprobante aceptado.');
  end if;
  if receipt.issue_date < laria_private.lima_today() - 7 then
    perform laria_private.receipt_error('RECEIPT_VOID_EXPIRED',
      'Pasaron más de 7 días desde su emisión. Emite una nota de crédito desde tu cuenta de Nubefact.');
  end if;
  if reason is null or char_length(reason) not between 3 and 100 then
    perform laria_private.receipt_error('RECEIPT_VOID_REASON', 'Escribe el motivo de la anulación (3 a 100 caracteres).');
  end if;
  update public.store_receipts set status = 'void_pending', void_reason = reason where id = receipt.id
  returning * into receipt;
  return jsonb_build_object('receipt', laria_private.store_receipt_json(receipt), 'replayed', false);
end;
$$;

-- ------------------------------------------------------------------ server: the provider's answer

-- Service role only. p_result: {status: accepted|rejected|error|voided|void_failed, sunat_accepted, provider_link, pdf_url, xml_url,
-- cdr_url, sunat_description, error_message}. A receipt never goes back from accepted or voided to an error.
create or replace function public.record_store_receipt_result(p_receipt_id uuid, p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  receipt public.store_receipts;
  next_status text := p_result->>'status';
  url_pattern constant text := '^https://[A-Za-z0-9.-]+(/[^\s]*)?$';
begin
  select * into receipt from public.store_receipts where id = p_receipt_id for update;
  if not found then
    perform laria_private.receipt_error('RECEIPT_NOT_FOUND', 'No encontramos ese comprobante.');
  end if;
  if next_status not in ('accepted', 'rejected', 'error', 'voided', 'void_failed') then
    perform laria_private.receipt_error('RECEIPT_RESULT_INVALID', 'Resultado no válido.');
  end if;
  if receipt.status in ('accepted', 'voided') and next_status in ('rejected', 'error') then
    return jsonb_build_object('receipt', laria_private.store_receipt_json(receipt));
  end if;
  if next_status in ('voided', 'void_failed') and receipt.status <> 'void_pending' then
    perform laria_private.receipt_error('RECEIPT_RESULT_INVALID', 'Ese comprobante no espera una anulación.');
  end if;
  update public.store_receipts set
    status = case next_status when 'void_failed' then 'accepted' else next_status end,
    attempts = attempts + case when next_status in ('accepted', 'rejected', 'error') then 1 else 0 end,
    provider_link = coalesce(case when p_result->>'provider_link' ~ url_pattern then p_result->>'provider_link' end, provider_link),
    pdf_url = coalesce(case when p_result->>'pdf_url' ~ url_pattern then p_result->>'pdf_url' end, pdf_url),
    xml_url = coalesce(case when p_result->>'xml_url' ~ url_pattern then p_result->>'xml_url' end, xml_url),
    cdr_url = coalesce(case when p_result->>'cdr_url' ~ url_pattern then p_result->>'cdr_url' end, cdr_url),
    sunat_accepted = coalesce((p_result->>'sunat_accepted')::boolean, sunat_accepted),
    sunat_description = coalesce(left(p_result->>'sunat_description', 500), sunat_description),
    error_message = case when next_status in ('accepted', 'voided') then null else left(p_result->>'error_message', 500) end,
    void_reason = case when next_status = 'void_failed' then null else void_reason end,
    voided_at = case when next_status = 'voided' then now() else voided_at end
  where id = receipt.id
  returning * into receipt;
  return jsonb_build_object('receipt', laria_private.store_receipt_json(receipt));
end;
$$;

-- ------------------------------------------------------------------ grants

revoke all on function public.get_einvoice_settings() from public, anon, authenticated;
revoke all on function public.save_einvoice_settings(jsonb) from public, anon, authenticated;
revoke all on function public.disconnect_einvoice() from public, anon, authenticated;
revoke all on function public.prepare_store_receipt(jsonb) from public, anon, authenticated;
revoke all on function public.request_store_receipt_void(uuid, text) from public, anon, authenticated;
revoke all on function public.record_store_receipt_result(uuid, jsonb) from public, anon, authenticated;

grant execute on function public.get_einvoice_settings() to authenticated;
grant execute on function public.save_einvoice_settings(jsonb) to authenticated;
grant execute on function public.disconnect_einvoice() to authenticated;
grant execute on function public.prepare_store_receipt(jsonb) to authenticated;
grant execute on function public.request_store_receipt_void(uuid, text) to authenticated;
grant execute on function public.record_store_receipt_result(uuid, jsonb) to service_role;

do $$
declare fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'laria_private' and p.proname in ('receipt_error', 'receipt_caller_store', 'store_receipt_json')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end;
$$;
