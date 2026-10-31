-- reach-11 «Compra en tienda verificada» (docs/feature-ideas/deal-trust.md, FD-deal-trust-2 to 5).
--
-- After a Mostrador sale the store can show a one-time QR. The customer scans it, signs in and confirms
-- "Compré en <Tienda>"; that creates a verified transaction (and with it the double-blind reviews) for the store. This
-- changes two earlier rules on purpose, both approved with the idea:
--   * V1 "only WhatsApp contacts become verified buyers": a customer who confirms a counter sale's code is one too.
--   * Store operations rule 2 / D-12 "stock sales never unlock reviews": a stock movement on its own still creates
--     nothing; only the customer's confirmation of the code does.
-- A code belongs to one recorded sale (one Mostrador batch), works once, and stops working 24 hours after the sale or
-- as soon as the sale is undone. Laria records that the customer said they bought; it never sees or handles money.

create table public.store_counter_sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  sale_key text not null check (char_length(sale_key) between 8 and 160),
  -- Snapshot of what was sold, so the customer's screen does not depend on later edits to the inventory rows.
  lines jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) between 1 and 2000),
  -- Only the SHA-256 of the code is kept: the code itself lives in the QR on the store's screen.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'open' check (status in ('open', 'claimed', 'cancelled')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_by uuid references public.profiles(id) on delete restrict,
  claimed_at timestamptz,
  cancelled_at timestamptz,
  constraint store_counter_sales_sale_key unique (store_id, sale_key),
  constraint store_counter_sales_claim_shape check ((status = 'claimed') = (claimed_by is not null and claimed_at is not null)),
  constraint store_counter_sales_cancel_shape check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint store_counter_sales_expiry check (expires_at <= created_at + interval '24 hours')
);
create index if not exists store_counter_sales_created_by_idx on public.store_counter_sales (created_by);

create index store_counter_sales_store_idx on public.store_counter_sales(store_id, created_at desc);
create index store_counter_sales_claimer_idx on public.store_counter_sales(claimed_by, claimed_at desc) where claimed_by is not null;

-- Which ledger movements a code covers; an undo of any of them reaches its code through this table.
create table public.store_counter_sale_movements (
  movement_id uuid primary key references public.store_stock_movements(id) on delete restrict,
  sale_id uuid not null references public.store_counter_sales(id) on delete restrict
);

create index store_counter_sale_movements_sale_idx on public.store_counter_sale_movements(sale_id);

alter table public.store_counter_sales enable row level security;
alter table public.store_counter_sale_movements enable row level security;
revoke all on public.store_counter_sales, public.store_counter_sale_movements from anon, authenticated;

-- A verified transaction now comes either from a listing (claim + listing, as before) or from a counter sale (no
-- claim, no listing, always a store). Readers that join listings were checked: see the patch migrations of this batch.
alter table public.verified_transactions
  alter column claim_id drop not null,
  alter column listing_id drop not null,
  add column counter_sale_id uuid references public.store_counter_sales(id) on delete restrict;

alter table public.verified_transactions
  add constraint verified_transactions_counter_sale_key unique (counter_sale_id),
  add constraint verified_transactions_origin_check check (
    (counter_sale_id is null and claim_id is not null and listing_id is not null)
    or (counter_sale_id is not null and claim_id is null and listing_id is null and seller_identity_type = 'store')
  );

create or replace function laria_private.counter_token_hash(p_token text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(lower(btrim(coalesce(p_token, ''))), 'UTF8')), 'hex')
$$;

-- "Cuerdas D'Addario EXL110" or "Cuerdas D'Addario EXL110 y 2 más": how a counter sale is named in lists.
create or replace function laria_private.counter_sale_title(p_lines jsonb)
returns text
language sql
immutable
as $$
  select coalesce(p_lines->0->>'name', 'Compra en tienda')
    || case when jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) > 1
         then ' y ' || (jsonb_array_length(p_lines) - 1)::text || ' más' else '' end
$$;

create or replace function laria_private.raise_counter_error(p_code text, p_message text)
returns void
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001', message = p_code || ': ' || p_message;
end;
$$;

-- The store shows the QR. Called right after "Registrar venta" (or from the sale's notice later the same day) with
-- the Mostrador batch key. Asking again for an open code replaces it: the previous QR stops working.
create or replace function public.create_counter_purchase_code(p_sale_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store uuid := laria_private.inventory_caller_store(false);
  request_key text := laria_private.inventory_request_key(p_sale_key, 160);
  store_status public.store_status;
  sale public.store_counter_sales;
  receipt laria_private.store_inventory_batch_receipts;
  movement_ids uuid[];
  sale_lines jsonb;
  first_at timestamptz;
  movement_count integer;
  token text := replace(gen_random_uuid()::text, '-', '');
begin
  select status into store_status from public.stores where id = owner_store;
  if store_status is distinct from 'active' then
    perform laria_private.raise_counter_error('COUNTER_STORE_NOT_ACTIVE', 'Tu tienda tiene que estar activa en Laria para mostrar el código.');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_store::text || ':counter:' || request_key, 23));
  select * into sale from public.store_counter_sales s where s.store_id = owner_store and s.sale_key = request_key for update;

  if found then
    if sale.status = 'claimed' then
      perform laria_private.raise_counter_error('COUNTER_SALE_CLAIMED', 'El cliente ya confirmó esta compra.');
    elsif sale.status = 'cancelled' then
      perform laria_private.raise_counter_error('COUNTER_SALE_UNDONE', 'Esta venta se deshizo, así que ya no tiene código.');
    elsif sale.expires_at <= now() then
      perform laria_private.raise_counter_error('COUNTER_SALE_EXPIRED', 'El código se puede mostrar hasta 24 horas después de la venta.');
    end if;
    update public.store_counter_sales set token_hash = laria_private.counter_token_hash(token)
    where id = sale.id returning * into sale;
  else
    select * into receipt from laria_private.store_inventory_batch_receipts r
    where r.store_id = owner_store and r.batch_key = request_key and r.operation = 'stock';
    if not found then
      perform laria_private.raise_counter_error('COUNTER_SALE_NOT_FOUND', 'No encontramos esa venta. Regístrala en el mostrador y vuelve a intentarlo.');
    end if;

    movement_count := jsonb_array_length(coalesce(receipt.result->'movements', '[]'::jsonb));
    select array_agg(m.id order by m.id),
      jsonb_agg(jsonb_build_object(
        'item_id', i.id,
        'name', concat_ws(' · ', i.product_name, nullif(btrim(coalesce(i.variant_label, '')), '')),
        'quantity', -m.on_hand_delta,
        'listing_id', i.listing_id
      ) order by i.product_name, i.id),
      min(m.created_at)
    into movement_ids, sale_lines, first_at
    from jsonb_array_elements(coalesce(receipt.result->'movements', '[]'::jsonb)) entry
    join public.store_stock_movements m on m.id = (entry->>'id')::uuid and m.store_id = owner_store
    join public.store_inventory_items i on i.id = m.item_id
    where m.movement_type = 'sale';

    if movement_ids is null or array_length(movement_ids, 1) <> movement_count then
      perform laria_private.raise_counter_error('COUNTER_SALE_NOT_FOUND', 'Solo las ventas del mostrador tienen código para el cliente.');
    end if;
    if first_at <= now() - interval '24 hours' then
      perform laria_private.raise_counter_error('COUNTER_SALE_EXPIRED', 'El código se puede mostrar hasta 24 horas después de la venta.');
    end if;
    if exists (select 1 from public.store_stock_movements c where c.store_id = owner_store and c.corrects_movement_id = any(movement_ids)) then
      perform laria_private.raise_counter_error('COUNTER_SALE_UNDONE', 'Esta venta se deshizo, así que ya no tiene código.');
    end if;
    if (select count(*) from public.store_counter_sales s where s.store_id = owner_store and s.created_at > now() - interval '24 hours') >= 300 then
      perform laria_private.raise_counter_error('COUNTER_CODE_LIMIT', 'Llegaste al límite de códigos de hoy. Vuelve a intentarlo mañana.');
    end if;

    insert into public.store_counter_sales(store_id, sale_key, lines, token_hash, created_by, expires_at)
    values (owner_store, request_key, sale_lines, laria_private.counter_token_hash(token), auth.uid(), first_at + interval '24 hours')
    returning * into sale;
    insert into public.store_counter_sale_movements(movement_id, sale_id)
    select unnest(movement_ids), sale.id;
  end if;

  return jsonb_build_object('sale_id', sale.id, 'token', token, 'expires_at', sale.expires_at, 'status', sale.status, 'lines', sale.lines);
end;
$$;

revoke all on function public.create_counter_purchase_code(text) from public, anon;
grant execute on function public.create_counter_purchase_code(text) to authenticated, service_role;

-- The store closes the QR without a confirmation (the customer left, or it was shown by mistake).
create or replace function public.cancel_counter_purchase_code(p_sale_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store uuid := laria_private.inventory_caller_store(false);
  result_status text;
begin
  update public.store_counter_sales set status = 'cancelled', cancelled_at = now()
  where id = p_sale_id and store_id = owner_store and status = 'open'
  returning status into result_status;
  if result_status is null then
    select status into result_status from public.store_counter_sales where id = p_sale_id and store_id = owner_store;
  end if;
  if result_status is null then
    perform laria_private.raise_counter_error('COUNTER_SALE_NOT_FOUND', 'No encontramos ese código.');
  end if;
  return result_status;
end;
$$;

revoke all on function public.cancel_counter_purchase_code(uuid) from public, anon;
grant execute on function public.cancel_counter_purchase_code(uuid) to authenticated, service_role;

-- What the Mostrador polls while the QR is open: whether the customer confirmed, and who (first name and initial).
create or replace function public.get_counter_purchase_code_status(p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner_store uuid := laria_private.inventory_caller_store(false);
  sale public.store_counter_sales;
begin
  select * into sale from public.store_counter_sales where id = p_sale_id and store_id = owner_store;
  if not found then
    perform laria_private.raise_counter_error('COUNTER_SALE_NOT_FOUND', 'No encontramos ese código.');
  end if;
  return jsonb_build_object(
    'status', case when sale.status = 'open' and sale.expires_at <= now() then 'expired' else sale.status end,
    'expires_at', sale.expires_at,
    'claimed_at', sale.claimed_at,
    'buyer_name', case when sale.status = 'claimed'
      then laria_private.question_display_name((select full_name from public.profiles where id = sale.claimed_by)) end,
    'transaction_id', (select t.id from public.verified_transactions t where t.counter_sale_id = sale.id)
  );
end;
$$;

revoke all on function public.get_counter_purchase_code_status(uuid) from public, anon;
grant execute on function public.get_counter_purchase_code_status(uuid) to authenticated, service_role;

-- The customer's page (/compra-en-tienda/<code>), before and after signing in. Nothing about who claimed it unless it
-- was the caller.
create or replace function public.get_counter_purchase(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sale public.store_counter_sales;
  store_row public.stores;
  mine boolean;
begin
  if p_token is null or lower(btrim(p_token)) !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into sale from public.store_counter_sales where token_hash = laria_private.counter_token_hash(p_token);
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into store_row from public.stores where id = sale.store_id;
  mine := auth.uid() is not null and sale.claimed_by = auth.uid();
  return jsonb_build_object(
    'status', case when sale.status = 'open' and sale.expires_at <= now() then 'expired' else sale.status end,
    'store', jsonb_build_object('name', store_row.name, 'slug', store_row.slug, 'city', store_row.city,
      'district', store_row.district, 'logo_url', store_row.logo_url, 'is_verified', store_row.is_verified,
      'active', store_row.status = 'active'),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('name', line->>'name', 'quantity', (line->>'quantity')::integer)), '[]'::jsonb)
              from jsonb_array_elements(sale.lines) line),
    'sold_at', sale.created_at,
    'expires_at', sale.expires_at,
    'mine', mine,
    'own_store', auth.uid() is not null and (store_row.owner_user_id = auth.uid() or public.is_store_owner(store_row.id)),
    'transaction_id', case when mine then (select t.id from public.verified_transactions t where t.counter_sale_id = sale.id) end
  );
end;
$$;

revoke all on function public.get_counter_purchase(text) from public;
grant execute on function public.get_counter_purchase(text) to anon, authenticated, service_role;

-- The customer confirms. Limits keep a store from filling its own record with friends' confirmations: one counter
-- purchase per store per customer a day, five a day in all, never at one's own store.
create or replace function public.claim_counter_purchase(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  sale public.store_counter_sales;
  store_row public.stores;
  transaction_uuid uuid;
  confirmed_at timestamptz := now();
begin
  if me is null then
    raise exception using errcode = '42501', message = 'COUNTER_AUTH_REQUIRED: Ingresa a tu cuenta para confirmar la compra.';
  end if;
  if p_token is null or lower(btrim(p_token)) !~ '^[0-9a-f]{32}$' then
    perform laria_private.raise_counter_error('COUNTER_CODE_INVALID', 'Este código no es válido. Pide a la tienda que lo muestre de nuevo.');
  end if;
  select * into sale from public.store_counter_sales where token_hash = laria_private.counter_token_hash(p_token) for update;
  if not found then
    perform laria_private.raise_counter_error('COUNTER_CODE_INVALID', 'Este código no es válido. Pide a la tienda que lo muestre de nuevo.');
  end if;
  if sale.status = 'claimed' then
    if sale.claimed_by = me then
      return jsonb_build_object('transaction_id', (select t.id from public.verified_transactions t where t.counter_sale_id = sale.id), 'replayed', true);
    end if;
    perform laria_private.raise_counter_error('COUNTER_CODE_USED', 'Otra cuenta ya confirmó esta compra.');
  end if;
  if sale.status = 'cancelled' then
    perform laria_private.raise_counter_error('COUNTER_SALE_UNDONE', 'La tienda deshizo esta venta o cerró el código.');
  end if;
  if sale.expires_at <= confirmed_at then
    perform laria_private.raise_counter_error('COUNTER_CODE_EXPIRED', 'Este código venció. Se puede confirmar hasta 24 horas después de la compra.');
  end if;

  select * into store_row from public.stores where id = sale.store_id;
  if store_row.status <> 'active' or store_row.owner_user_id is null then
    perform laria_private.raise_counter_error('COUNTER_STORE_NOT_ACTIVE', 'Esta tienda no está activa en Laria en este momento.');
  end if;
  if store_row.owner_user_id = me or exists (select 1 from public.store_members m where m.store_id = sale.store_id and m.user_id = me) then
    perform laria_private.raise_counter_error('COUNTER_OWN_STORE', 'No puedes confirmar una compra en tu propia tienda.');
  end if;
  if exists (select 1 from public.store_counter_sales s where s.claimed_by = me and s.store_id = sale.store_id and s.claimed_at > confirmed_at - interval '24 hours') then
    perform laria_private.raise_counter_error('COUNTER_STORE_DAILY_LIMIT', 'Ya confirmaste una compra en esta tienda hoy. Puedes confirmar otra mañana.');
  end if;
  if (select count(*) from public.store_counter_sales s where s.claimed_by = me and s.claimed_at > confirmed_at - interval '24 hours') >= 5 then
    perform laria_private.raise_counter_error('COUNTER_DAILY_LIMIT', 'Llegaste al límite de compras en tienda confirmadas por hoy.');
  end if;

  insert into public.verified_transactions(counter_sale_id, claim_id, listing_id, seller_user_id, store_id, buyer_user_id,
    seller_identity_type, sold_at, verified_at, review_deadline)
  values (sale.id, null, null, store_row.owner_user_id, sale.store_id, me,
    'store', sale.created_at, confirmed_at, confirmed_at + interval '10 days')
  returning id into transaction_uuid;

  update public.store_counter_sales set status = 'claimed', claimed_by = me, claimed_at = confirmed_at where id = sale.id;

  insert into public.marketplace_events(event_type, store_id, seller_user_id, actor_user_id, source, dedupe_key, metadata)
  values ('transaction_verified', sale.store_id, store_row.owner_user_id, me, 'system', 'transaction_verified:' || transaction_uuid,
    jsonb_build_object('origin', 'counter'));

  insert into public.notifications(user_id, event_type, message, store_id, transaction_id) values
    (me, 'store_counter_purchase_confirmed',
      'Tu compra en ' || store_row.name || ' quedó registrada en Laria. Puedes dejar tu reseña durante 10 días.',
      sale.store_id, transaction_uuid),
    (store_row.owner_user_id, 'store_counter_purchase_confirmed',
      laria_private.question_display_name((select full_name from public.profiles where id = me))
        || ' confirmó su compra del mostrador. Puedes reseñar a tu cliente durante 10 días.',
      sale.store_id, transaction_uuid);

  return jsonb_build_object('transaction_id', transaction_uuid, 'replayed', false);
end;
$$;

revoke all on function public.claim_counter_purchase(text) from public, anon;
grant execute on function public.claim_counter_purchase(text) to authenticated, service_role;

-- Undoing a counter sale closes its code. Once the customer confirmed, the sale can't be undone from the Mostrador:
-- a return is recorded as a return instead, and the transaction and its reviews stay.
create or replace function laria_private.counter_sale_guard_correction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sale public.store_counter_sales;
begin
  select s.* into sale
  from public.store_counter_sale_movements link
  join public.store_counter_sales s on s.id = link.sale_id
  where link.movement_id = new.corrects_movement_id
  for update of s;
  if not found then
    return new;
  end if;
  if sale.status = 'claimed' then
    perform laria_private.raise_inventory_error('COUNTER_SALE_CONFIRMED',
      'El cliente ya confirmó esta compra en Laria, así que no se puede deshacer. Si devolvió algo, regístralo como devolución en Inventario.');
  end if;
  if sale.status = 'open' then
    update public.store_counter_sales set status = 'cancelled', cancelled_at = now() where id = sale.id;
  end if;
  return new;
end;
$$;

revoke all on function laria_private.counter_sale_guard_correction() from public, anon, authenticated;

create trigger store_stock_movements_counter_sale_guard
before insert on public.store_stock_movements
for each row when (new.corrects_movement_id is not null)
execute function laria_private.counter_sale_guard_correction();

-- Counter purchases in "Compras y ventas". get_transaction_center stays as it is (claims only); the page merges both.
create or replace function public.get_counter_transaction_center()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  result jsonb;
begin
  if me is null then raise exception using errcode = '42501', message = 'TRANSACTION_AUTH_REQUIRED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'reference_id', t.id, 'claim_id', null, 'transaction_id', t.id, 'listing_id', null,
      'title', laria_private.counter_sale_title(sale.lines), 'slug', null, 'sold_at', t.sold_at, 'status', 'verified',
      'attribution_type', 'counter', 'origin', 'counter',
      'role', case when t.buyer_user_id = me then 'buyer' else 'seller' end,
      'seller_name', st.name, 'store_slug', st.slug,
      'buyer_name', case when t.seller_user_id = me then laria_private.question_display_name(b.full_name) end,
      'verified_at', t.verified_at, 'review_deadline', t.review_deadline,
      'own_review_submitted', exists (select 1 from public.transaction_reviews r where r.transaction_id = t.id and r.reviewer_user_id = me),
      'reviews_revealed', t.review_deadline <= now() or (select count(*) from public.transaction_reviews r where r.transaction_id = t.id) = 2
    ) order by t.verified_at desc), '[]'::jsonb)
  into result
  from public.verified_transactions t
  join public.store_counter_sales sale on sale.id = t.counter_sale_id
  join public.stores st on st.id = t.store_id
  left join public.profiles b on b.id = t.buyer_user_id
  where t.counter_sale_id is not null and (t.buyer_user_id = me or t.seller_user_id = me);
  return result;
end;
$$;

revoke all on function public.get_counter_transaction_center() from public, anon;
grant execute on function public.get_counter_transaction_center() to authenticated, service_role;

-- The detail of a counter purchase, in the shape of get_transaction_detail. Null when the id is not a counter purchase
-- of the caller, so the page falls back to get_transaction_detail.
create or replace function public.get_counter_transaction_detail(p_transaction_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  transaction_record public.verified_transactions;
  sale public.store_counter_sales;
  store_row public.stores;
  participant text;
begin
  if me is null then raise exception using errcode = '42501', message = 'TRANSACTION_AUTH_REQUIRED'; end if;
  select * into transaction_record from public.verified_transactions where id = p_transaction_id and counter_sale_id is not null;
  if not found then return null; end if;
  if transaction_record.buyer_user_id = me then participant := 'buyer';
  elsif transaction_record.seller_user_id = me then participant := 'seller';
  else return null; end if;
  select * into sale from public.store_counter_sales where id = transaction_record.counter_sale_id;
  select * into store_row from public.stores where id = transaction_record.store_id;
  return jsonb_build_object(
    'origin', 'counter',
    'reference_id', transaction_record.id, 'transaction_id', transaction_record.id, 'claim_id', null,
    'listing_id', null, 'listing_title', laria_private.counter_sale_title(sale.lines), 'listing_slug', null,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('name', line->>'name', 'quantity', (line->>'quantity')::integer)), '[]'::jsonb)
              from jsonb_array_elements(sale.lines) line),
    'sold_at', transaction_record.sold_at, 'role', participant, 'state', 'verified',
    'buyer_user_id', case when participant = 'seller' then transaction_record.buyer_user_id end,
    'buyer_name', case when participant = 'seller'
      then laria_private.question_display_name((select full_name from public.profiles where id = transaction_record.buyer_user_id)) end,
    'seller_name', store_row.name, 'store_id', store_row.id, 'store_slug', store_row.slug,
    'verified_at', transaction_record.verified_at, 'review_deadline', transaction_record.review_deadline,
    'review_window_open', transaction_record.review_deadline > clock_timestamp(),
    'own_review', (select to_jsonb(r) - 'admin_hidden_by' - 'admin_hidden_reason' from public.transaction_reviews r
                   where r.transaction_id = transaction_record.id and r.reviewer_user_id = me),
    'visible_reviews', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'direction', r.direction, 'rating', r.rating,
        'comment', r.comment, 'submitted_at', r.submitted_at, 'reviewer_name',
        case when r.direction = 'seller_to_buyer' then store_row.name else p.full_name end) order by r.direction)
      from public.transaction_reviews r join public.profiles p on p.id = r.reviewer_user_id
      where r.transaction_id = transaction_record.id and laria_private.review_is_visible(r.id)), '[]'::jsonb),
    -- Launch audit A17, as get_transaction_detail: the other side's review waits for Laria, once reviews would show.
    'counterpart_review_held', (transaction_record.review_deadline <= now()
      or (select count(*) from public.transaction_reviews pair where pair.transaction_id = transaction_record.id) = 2)
      and exists (select 1 from public.transaction_reviews r where r.transaction_id = transaction_record.id
        and r.reviewer_user_id <> me and r.held_at is not null and r.admin_hidden_at is null)
  );
end;
$$;

revoke all on function public.get_counter_transaction_detail(uuid) from public, anon;
grant execute on function public.get_counter_transaction_detail(uuid) to authenticated, service_role;

-- Admin: the latest confirmed counter purchases (Admin > Confianza), to spot a store confirming its own sales.
create or replace function public.get_admin_counter_purchases(p_page integer default 1, p_page_size integer default 25)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  row_offset integer;
  result jsonb;
begin
  perform laria_private.assert_admin();
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size not between 1 and 100 then
    raise exception 'PAGE_INVALID';
  end if;
  row_offset := (p_page - 1) * p_page_size;
  select jsonb_build_object(
    'total', (select count(*) from public.verified_transactions where counter_sale_id is not null),
    'items', coalesce((select jsonb_agg(item order by (item->>'verified_at')::timestamptz desc) from (
      select jsonb_build_object(
        'transaction_id', t.id, 'store_id', st.id, 'store_name', st.name, 'store_slug', st.slug,
        'title', laria_private.counter_sale_title(sale.lines), 'buyer_name', p.full_name, 'buyer_user_id', t.buyer_user_id,
        'verified_at', t.verified_at, 'sold_at', t.sold_at,
        'buyer_counter_purchases_30d', (select count(*) from public.store_counter_sales s where s.claimed_by = t.buyer_user_id
          and s.store_id = t.store_id and s.claimed_at > now() - interval '30 days'),
        'review_count', (select count(*) from public.transaction_reviews r where r.transaction_id = t.id)
      ) item
      from public.verified_transactions t
      join public.store_counter_sales sale on sale.id = t.counter_sale_id
      join public.stores st on st.id = t.store_id
      join public.profiles p on p.id = t.buyer_user_id
      where t.counter_sale_id is not null
      order by t.verified_at desc
      limit p_page_size offset row_offset) page), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_admin_counter_purchases(integer, integer) from public, anon;
grant execute on function public.get_admin_counter_purchases(integer, integer) to authenticated, service_role;
