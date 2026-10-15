-- PAY-1: assisted commerce, Pilot A (docs/store-operations/design.md §11.1, §11.2, §11.4; owner decisions D-2, D-6,
-- D-7 at their accepted defaults; details and defaults taken in docs/store-operations/pay-1.md).
--
-- Purely additive. A verified store declares which payment methods it accepts, an Admin reviews each one, and only
-- approved methods of an active, verified store are shown to buyers. Laria still processes no payment: there are no
-- payment links, amounts, paid states, reservations or orders, and nothing here can change stock or a listing.
--
-- Invariants this migration maintains:
--   * A method is public only while it is `approved` AND its store is `active` AND `is_verified`, checked at read time,
--     so revoking verification or hiding the store hides its methods at once without touching the rows.
--   * Any owner change to a method (holder, provider, note) sends it back to `pending_review`; an Admin never approves
--     something other than what they saw (p_expected_updated_at).
--   * A change of the store's RUC or razón social sends its approved methods back to `pending_review`, because the
--     review compared the account holder with those fields.
--   * No phone, account or card numbers and no links are stored: free text rejects long digit runs and URLs.
--   * store_payment_method_changes is append-only; every Admin decision is also in admin_audit_actions.
--   * A purchase request is a `whatsapp_contact` event with metadata {"intent":"purchase"}, accepted only when the
--     listing is public, in stock (or not inventory-managed) and its store currently shows at least one method.

-- ------------------------------------------------------------------ types and tables

create type public.store_payment_method as enum
  ('efectivo_al_recoger', 'yape_plin', 'pos_tarjeta_al_recoger', 'link_de_pago');

create table public.store_payment_methods (
  store_id        uuid not null references public.stores(id) on delete cascade,
  method          public.store_payment_method not null,
  -- pending_review: proposed or changed by the owner, not public. approved: public while the store is verified.
  -- rejected: an Admin declined the proposal. disabled: an Admin withdrew a method that was approved.
  -- withdrawn: the owner stopped offering it.
  status          text not null default 'pending_review'
                  check (status in ('pending_review', 'approved', 'rejected', 'disabled', 'withdrawn')),
  -- Who receives the money (person or company), shown to Admin only, so it can be compared with the razón social.
  holder_name     text check (holder_name is null or char_length(holder_name) between 2 and 140),
  -- What the buyer sees next to the method, for example "Yape" or "Izipay".
  provider_label  text check (provider_label is null or char_length(provider_label) between 2 and 60),
  owner_note      text check (owner_note is null or char_length(owner_note) between 2 and 280),
  -- Admin authority comes from the Auth JWT and an Admin may have no profile row (see admin_audit_actions).
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  review_reason   text check (review_reason is null or char_length(review_reason) between 3 and 280),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (store_id, method),
  constraint store_payment_methods_holder_required
    check (method = 'efectivo_al_recoger' or status = 'withdrawn' or holder_name is not null),
  constraint store_payment_methods_review_consistent
    check ((status in ('approved', 'rejected', 'disabled')) = (reviewed_at is not null and reviewed_by is not null)),
  constraint store_payment_methods_reason_required
    check (status not in ('rejected', 'disabled') or review_reason is not null)
);

create index store_payment_methods_review_idx on public.store_payment_methods(status, updated_at);

create trigger store_payment_methods_set_updated_at
before update on public.store_payment_methods
for each row execute function public.set_updated_at();

-- Append-only history of every proposal, withdrawal, review and automatic re-review.
create table public.store_payment_method_changes (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  method         public.store_payment_method not null,
  change_type    text not null check (change_type in ('proposed', 'withdrawn', 'approved', 'rejected', 'disabled', 'business_data_changed')),
  actor_kind     text not null check (actor_kind in ('owner', 'admin', 'system')),
  actor_user_id  uuid,
  before         jsonb,
  after          jsonb not null,
  reason         text check (reason is null or char_length(reason) <= 280),
  created_at     timestamptz not null default now()
);

create index store_payment_method_changes_store_idx
  on public.store_payment_method_changes(store_id, created_at desc, id desc);

create or replace function laria_private.reject_payment_method_history_change()
returns trigger
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001',
    message = 'PAYMENT_METHOD_HISTORY_APPEND_ONLY: El historial de medios de pago no se puede modificar.';
end;
$$;

create trigger store_payment_method_changes_append_only
before update or delete on public.store_payment_method_changes
for each row execute function laria_private.reject_payment_method_history_change();
create trigger store_payment_method_changes_no_truncate
before truncate on public.store_payment_method_changes
for each statement execute function laria_private.reject_payment_method_history_change();

-- ------------------------------------------------------------------ RLS and grants

alter table public.store_payment_methods enable row level security;
alter table public.store_payment_method_changes enable row level security;

revoke all on public.store_payment_methods, public.store_payment_method_changes from public, anon, authenticated;
grant select on public.store_payment_methods, public.store_payment_method_changes to authenticated;
grant usage on type public.store_payment_method to anon, authenticated;

create policy "Store owners can read own payment methods" on public.store_payment_methods
  for select to authenticated using (public.is_store_owner(store_id));
create policy "Admins can read payment methods" on public.store_payment_methods
  for select to authenticated using (public.is_admin());
create policy "Store owners can read own payment method history" on public.store_payment_method_changes
  for select to authenticated using (public.is_store_owner(store_id));
create policy "Admins can read payment method history" on public.store_payment_method_changes
  for select to authenticated using (public.is_admin());

-- ------------------------------------------------------------------ internal helpers

create or replace function laria_private.raise_payment_error(p_code text, p_message text)
returns void
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001', message = p_code || ': ' || p_message;
end;
$$;

-- Trimmed free text, null when blank. Rejects what Pilot A must never store: phone, account or card numbers (any run
-- of 6+ digits, ignoring spaces, dots and dashes between them), links and e-mail addresses.
create or replace function laria_private.payment_method_text(p_value text, p_max integer)
returns text
language plpgsql
immutable
as $$
declare
  value text := nullif(btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g')), '');
begin
  if value is null then return null; end if;
  if char_length(value) > p_max or char_length(value) < 2 then
    perform laria_private.raise_payment_error('PAYMENT_METHOD_TEXT_LENGTH', 'Revisa la longitud del texto.');
  end if;
  if regexp_replace(value, '[[:space:].-]', '', 'g') ~ '[0-9]{6,}'
    or value ~* '(https?://|www\.|\.(com|pe|net|org|io|me|link|ly|app)(/|\s|$))'
    or value ~ '[^\s@]+@[^\s@]+\.[^\s@]+' then
    perform laria_private.raise_payment_error('PAYMENT_METHOD_SENSITIVE_DATA',
      'No escribas números de teléfono, cuenta o tarjeta, enlaces ni correos. Laria solo muestra qué medios aceptas.');
  end if;
  return value;
end;
$$;

-- The caller's own store, locked for the rest of the transaction. Owner-only (D-8), as in STORE-1a.
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
  for update;
  if store_record.id is null then
    perform laria_private.raise_payment_error('PAYMENT_STORE_REQUIRED', 'Necesitas una tienda para indicar medios de pago.');
  end if;
  return store_record;
end;
$$;

create or replace function laria_private.payment_method_json(p_row public.store_payment_methods)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'store_id', p_row.store_id, 'method', p_row.method, 'status', p_row.status,
    'holder_name', p_row.holder_name, 'provider_label', p_row.provider_label, 'owner_note', p_row.owner_note,
    'review_reason', p_row.review_reason, 'reviewed_at', p_row.reviewed_at, 'updated_at', p_row.updated_at);
$$;

-- What a buyer may see for a store right now: approved methods, only while the store is active and verified.
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
  where m.store_id = p_store_id and m.status = 'approved' and s.status = 'active' and s.is_verified;
$$;

-- ------------------------------------------------------------------ owner functions

-- Propose or change one accepted method. Any real change goes (back) to pending_review; an identical resubmission of a
-- pending or approved method changes nothing.
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
  holder text := laria_private.payment_method_text(p_holder_name, 140);
  provider text := laria_private.payment_method_text(p_provider_label, 60);
  note text := laria_private.payment_method_text(p_note, 280);
begin
  if p_method is null then
    perform laria_private.raise_payment_error('PAYMENT_METHOD_INVALID', 'Elige un medio de pago.');
  end if;
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

-- Stop offering a method. Allowed even when the store is no longer verified, so an owner can always take one down.
create or replace function public.withdraw_store_payment_method(p_method public.store_payment_method)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  store_record public.stores;
  previous public.store_payment_methods;
  saved public.store_payment_methods;
begin
  store_record := laria_private.payment_caller_store();
  select * into previous from public.store_payment_methods where store_id = store_record.id and method = p_method for update;
  if previous.store_id is null then
    perform laria_private.raise_payment_error('PAYMENT_METHOD_NOT_FOUND', 'Ese medio de pago no está registrado.');
  end if;
  if previous.status = 'withdrawn' then return laria_private.payment_method_json(previous); end if;
  update public.store_payment_methods
  set status = 'withdrawn', reviewed_by = null, reviewed_at = null, review_reason = null
  where store_id = store_record.id and method = p_method
  returning * into saved;
  insert into public.store_payment_method_changes(store_id, method, change_type, actor_kind, actor_user_id, before, after)
  values (store_record.id, p_method, 'withdrawn', 'owner', auth.uid(),
    laria_private.payment_method_json(previous), laria_private.payment_method_json(saved));
  return laria_private.payment_method_json(saved);
end;
$$;

-- ------------------------------------------------------------------ admin functions

-- approve: only a pending proposal of an active, verified store, after checking the holder against RUC/razón social.
-- reject: a pending proposal. disable: an approved method. Each needs a reason and the updated_at the Admin saw.
create or replace function public.admin_review_store_payment_method(
  p_store_id uuid,
  p_method public.store_payment_method,
  p_decision text,
  p_reason text,
  p_expected_updated_at timestamptz
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
  select * into store_record from public.stores where id = p_store_id for update;
  if store_record.id is null then
    perform laria_private.raise_payment_error('STORE_NOT_FOUND', 'La tienda no existe.');
  end if;
  select * into previous from public.store_payment_methods where store_id = p_store_id and method = p_method for update;
  if previous.store_id is null then
    perform laria_private.raise_payment_error('PAYMENT_METHOD_NOT_FOUND', 'Ese medio de pago no está registrado.');
  end if;
  if p_expected_updated_at is null or previous.updated_at is distinct from p_expected_updated_at then
    perform laria_private.raise_payment_error('PAYMENT_METHOD_CHANGED',
      'La tienda cambió este medio de pago. Vuelve a revisarlo antes de decidir.');
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

-- The Admin review list: one row per method with the store's business data to compare the holder against.
create or replace function public.get_admin_store_payment_methods(p_status text default 'pending_review', p_page integer default 1, p_page_size integer default 24)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  page integer := greatest(coalesce(p_page, 1), 1);
  page_size integer := least(greatest(coalesce(p_page_size, 24), 1), 100);
  status_filter text := nullif(btrim(coalesce(p_status, '')), '');
  total integer;
  rows jsonb;
begin
  perform laria_private.assert_admin();
  if status_filter is not null and status_filter not in ('pending_review', 'approved', 'rejected', 'disabled', 'withdrawn') then
    status_filter := 'pending_review';
  end if;
  select count(*) into total from public.store_payment_methods m where status_filter is null or m.status = status_filter;
  select coalesce(jsonb_agg(item order by sort_at, store_name, method), '[]'::jsonb) into rows
  from (
    select laria_private.payment_method_json(m) || jsonb_build_object(
        'store_name', s.name, 'store_slug', s.slug, 'store_status', s.status, 'store_is_verified', s.is_verified,
        'razon_social', s.razon_social, 'ruc', s.ruc) as item,
      m.updated_at as sort_at, s.name as store_name, m.method
    from public.store_payment_methods m
    join public.stores s on s.id = m.store_id
    where status_filter is null or m.status = status_filter
    order by m.updated_at, s.name, m.method
    offset (page - 1) * page_size limit page_size
  ) listed;
  return jsonb_build_object('items', rows, 'total', total, 'page', page, 'page_size', page_size, 'status', status_filter);
end;
$$;

-- ------------------------------------------------------------------ public reads

-- Approved methods of a store, for its public page. Empty unless the store is active and verified right now.
create or replace function public.get_store_payment_methods(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$ select laria_private.public_payment_methods(p_store_id); $$;

-- What the listing page and the contact route need for "Solicitar compra": null unless the listing is public, belongs
-- to a store that currently shows methods, and is not out of stock. The merchant SKU of a linked inventory item goes
-- into the WhatsApp message the buyer sends to that store; no stock figure is returned (D-14).
create or replace function public.get_listing_purchase_request(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  listing_record public.listings;
  methods jsonb;
  sku text;
begin
  select * into listing_record from public.listings where id = p_listing_id;
  if listing_record.id is null or listing_record.status <> 'approved' or listing_record.store_id is null
    or listing_record.seller_type <> 'store' or listing_record.stock_state is not distinct from 'out_of_stock'
    or not public.listing_is_public(p_listing_id) then
    return null;
  end if;
  methods := laria_private.public_payment_methods(listing_record.store_id);
  if jsonb_array_length(methods) = 0 then return null; end if;
  select i.merchant_sku into sku
  from public.store_inventory_items i
  where i.listing_id = p_listing_id and i.store_id = listing_record.store_id and i.inventory_status = 'active';
  return jsonb_build_object('methods', methods, 'sku', sku);
end;
$$;

-- ------------------------------------------------------------------ store business data changes

-- The Admin approved each method against the store's RUC and razón social. If either changes, approved methods go back
-- to review. Verification and store status are checked at read time instead, so they need no trigger.
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
  for item in select * from public.store_payment_methods where store_id = new.id and status = 'approved' order by method for update loop
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

create trigger stores_review_payment_methods_on_business_change
after update of ruc, razon_social on public.stores
for each row execute function laria_private.review_payment_methods_on_business_change();

-- ------------------------------------------------------------------ purchase-request events

create or replace function laria_private.purchase_intent_allowed(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.get_listing_purchase_request(p_listing_id) is not null; $$;

-- Same function as 20260916200000_sprint_4_events.sql (moved to laria_private in Sprint 6), with one change: a
-- `whatsapp_contact` may carry exactly {"intent":"purchase"} when the listing currently allows a purchase request
-- (design §5.5, §11.1). It stays a contact, so Sprint 6 transaction-claim eligibility and contact counts are unchanged.
create or replace function laria_private.record_marketplace_event_service(p_event_type text, p_session_id uuid, p_event_id uuid,
 p_actor_user_id uuid default null, p_listing_id uuid default null, p_store_id uuid default null,
 p_source text default 'other', p_metadata jsonb default '{}'::jsonb, p_submission_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
 listing_record public.listings; store_record public.stores;
 target_seller uuid; target_store uuid; actor_type text; identity text;
 clean_metadata jsonb := '{}'::jsonb; inserted_id uuid; current_views integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service access required.'; end if;
 if p_event_id is null or p_session_id is null then raise exception 'Event/session identity required.'; end if;
 if p_source not in ('home','catalog','recommendations','detail','seller_panel','store','account','submission','other') then raise exception 'Invalid event source.'; end if;
 if p_actor_user_id is not null then
  select account_type::text into actor_type from public.profiles where id=p_actor_user_id;
  if not found then raise exception 'Invalid authenticated actor.'; end if;
 end if;
 if p_event_type in ('listing_impression','listing_view','whatsapp_contact') then
  select * into listing_record from public.listings where id=p_listing_id;
  if not found or not public.listing_is_public(p_listing_id) then return jsonb_build_object('recorded',false); end if;
  target_store := listing_record.store_id; target_seller := listing_record.owner_user_id;
  current_views := coalesce(listing_record.view_count,0);
  if target_store is not null then select * into store_record from public.stores where id=target_store; target_seller := coalesce(store_record.owner_user_id,target_seller); end if;
  if p_store_id is not null and p_store_id is distinct from target_store then raise exception 'Invalid store attribution.'; end if;
  if p_event_type='whatsapp_contact' and coalesce(p_metadata,'{}'::jsonb) <> '{}'::jsonb then
   if p_metadata is distinct from '{"intent":"purchase"}'::jsonb or not laria_private.purchase_intent_allowed(p_listing_id) then
    raise exception 'Invalid purchase intent.';
   end if;
   clean_metadata := '{"intent":"purchase"}'::jsonb;
  end if;
 elsif p_event_type in ('store_view','store_contact') then
  if p_listing_id is not null then raise exception 'Invalid listing attribution.'; end if;
  select * into store_record from public.stores where id=p_store_id and status='active';
  if not found then return jsonb_build_object('recorded',false); end if;
  target_store := store_record.id; target_seller := store_record.owner_user_id;
 elsif p_event_type in ('search','filter_applied') then
  if p_listing_id is not null or p_store_id is not null then raise exception 'Search has no seller target.'; end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object'
   or exists(select 1 from jsonb_object_keys(p_metadata) key where key not in ('query','filters','result_count','zero_results'))
   or jsonb_typeof(p_metadata->'query') is distinct from 'string'
   or length(p_metadata->>'query') > 200
   or jsonb_typeof(p_metadata->'filters') is distinct from 'object'
   or exists(select 1 from jsonb_object_keys(p_metadata->'filters') key where key not in ('category','city','brand','condition','seller_type','instrument_type','min_price','max_price','advanced','sort'))
   or jsonb_typeof(p_metadata->'result_count') is distinct from 'number'
   or (p_metadata->>'result_count')::numeric not between 0 and 10000000
   or octet_length(p_metadata::text)>4096 then raise exception 'Invalid search metadata.'; end if;
  clean_metadata := jsonb_build_object('query',p_metadata->>'query','filters',p_metadata->'filters',
    'result_count',(p_metadata->>'result_count')::integer,'zero_results',(p_metadata->>'result_count')::integer=0);
 elsif p_event_type in ('listing_creation_started','store_application_started') then
  if p_actor_user_id is null or p_submission_id is null or p_listing_id is not null then raise exception 'Authenticated submission required.'; end if;
  target_seller := p_actor_user_id;
  if p_event_type='store_application_started' then
   if actor_type <> 'store_owner' or exists(select 1 from public.stores where owner_user_id=p_actor_user_id) then raise exception 'Separate new Store Owner application required.'; end if;
  elsif actor_type='store_owner' then
   select id into target_store from public.stores where owner_user_id=p_actor_user_id;
   if not found then raise exception 'Store application required.'; end if;
  elsif actor_type <> 'seller' then raise exception 'Seller account required.'; end if;
 else raise exception 'Client cannot emit lifecycle events.';
 end if;
 if p_event_type not in ('search','filter_applied','whatsapp_contact') and coalesce(p_metadata,'{}'::jsonb) <> '{}'::jsonb then raise exception 'No freeform event metadata allowed.'; end if;
 if p_event_type in ('listing_impression','listing_view','store_view','whatsapp_contact','store_contact')
  and p_actor_user_id is not null and (p_actor_user_id=target_seller
   or exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'role'='admin')) then
  return jsonb_build_object('recorded',false,'view_count',current_views);
 end if;
 identity := coalesce('user:'||p_actor_user_id::text,'session:'||p_session_id::text)||':'||p_event_type||':'||coalesce(p_listing_id::text,target_store::text,'');
 if p_event_type in ('listing_impression','listing_view','store_view') then
  -- Rolling (not fixed clock-bucket) 30 minutes, serialized across requests.
  perform pg_advisory_xact_lock(hashtextextended(identity, 40));
  if exists(select 1 from public.marketplace_events where identity_key=identity and created_at>now()-interval '30 minutes') then
   select view_count into current_views from public.listings where id=p_listing_id;
   return jsonb_build_object('recorded',false,'view_count',current_views);
  end if;
 end if;
 insert into public.marketplace_events(id,event_type,listing_id,store_id,seller_user_id,actor_user_id,session_id,submission_id,source,metadata,identity_key,dedupe_key)
 values(p_event_id,p_event_type,p_listing_id,target_store,target_seller,p_actor_user_id,p_session_id,p_submission_id,p_source,clean_metadata,identity,
  case when p_submission_id is not null then p_event_type||':'||p_submission_id::text end)
 on conflict do nothing returning id into inserted_id;
 if inserted_id is not null and p_event_type='listing_view' then
  perform set_config('app.allow_listing_admin_fields','true',true);
  update public.listings set view_count=coalesce(view_count,0)+1 where id=p_listing_id returning view_count into current_views;
 end if;
 return jsonb_build_object('recorded',inserted_id is not null,'view_count',current_views);
end $$;

-- ------------------------------------------------------------------ grants

revoke all on function public.set_store_payment_method(public.store_payment_method, text, text, text) from public, anon, authenticated;
revoke all on function public.withdraw_store_payment_method(public.store_payment_method) from public, anon, authenticated;
revoke all on function public.admin_review_store_payment_method(uuid, public.store_payment_method, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.get_admin_store_payment_methods(text, integer, integer) from public, anon, authenticated;
revoke all on function public.get_store_payment_methods(uuid) from public, anon, authenticated;
revoke all on function public.get_listing_purchase_request(uuid) from public, anon, authenticated;

grant execute on function public.set_store_payment_method(public.store_payment_method, text, text, text) to authenticated;
grant execute on function public.withdraw_store_payment_method(public.store_payment_method) to authenticated;
grant execute on function public.admin_review_store_payment_method(uuid, public.store_payment_method, text, text, timestamptz) to authenticated;
grant execute on function public.get_admin_store_payment_methods(text, integer, integer) to authenticated;
grant execute on function public.get_store_payment_methods(uuid) to anon, authenticated, service_role;
grant execute on function public.get_listing_purchase_request(uuid) to anon, authenticated, service_role;

-- Internal helpers: no browser execute (laria_private also has no browser schema usage).
revoke all on function laria_private.reject_payment_method_history_change() from public, anon, authenticated;
revoke all on function laria_private.raise_payment_error(text, text) from public, anon, authenticated;
revoke all on function laria_private.payment_method_text(text, integer) from public, anon, authenticated;
revoke all on function laria_private.payment_caller_store() from public, anon, authenticated;
revoke all on function laria_private.payment_method_json(public.store_payment_methods) from public, anon, authenticated;
revoke all on function laria_private.public_payment_methods(uuid) from public, anon, authenticated;
revoke all on function laria_private.review_payment_methods_on_business_change() from public, anon, authenticated;
revoke all on function laria_private.purchase_intent_allowed(uuid) from public, anon, authenticated;
