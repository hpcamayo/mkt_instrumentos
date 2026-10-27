-- Feature ideas, store-floor batch, second PR (docs/feature-ideas/store-floor.md): buy-09 "Cuotas".
--
-- A verified store that takes credit cards says it offers interest-free installments ("Hasta 12 cuotas sin intereses
-- con BCP o Interbank"). Like a payment method of PAY-1 Pilot A (20261028120000, 20261029120000), an Admin reviews the
-- offer before buyers see it and again after every change. Its listings then show "o 12 cuotas sin intereses de
-- S/ 358.25" and buyers can add "Acepta cuotas" to any search and saved alert. Laria still processes no payment: the
-- store's card provider runs the installments, and nothing here stores an amount, an account or a link.
--
-- Additive: two tables, one nullable listing column, one listing flag and its trigger, three refresh triggers and six
-- functions. No shared function is redefined; PAY-1's helpers (payment_caller_store, payment_method_text,
-- raise_payment_error, bump_payment_method_revision, reject_payment_method_history_change) are called as they are.
--
-- Invariants this migration maintains:
--   * Only interest-free offers exist (the owner confirms it on every proposal). Installments with interest would
--     have to show the TCEA, which Laria does not show.
--   * An offer is public only while it is `approved`, the pilot is on, the store is `active` and `is_verified`, and the
--     store shows an approved card method (POS al recoger or enlace de pago), checked at read time in
--     laria_private.public_installment_offer.
--   * listings.installments_max is that public offer's number of installments when the listing's price reaches the
--     offer's minimum, otherwise null. A BEFORE trigger recomputes it whenever it is written, so a client value never
--     sticks; laria_private.refresh_store_installments recomputes a store's listings when anything above changes.
--   * Any owner change sends the offer back to `pending_review`; an Admin decides on the revision they saw.
--   * store_installment_offer_changes is append-only; every Admin decision is also in admin_audit_actions.

-- ------------------------------------------------------------------ tables

-- The credit cards a store may name; the database accepts only these, in this spelling (INSTALLMENT_CARDS in
-- lib/payment-methods.ts). An offer with none applies to any credit card the store's provider takes.
create or replace function laria_private.installment_card_options()
returns text[]
language sql
immutable
as $$
  select array['BCP', 'BBVA', 'Interbank', 'Scotiabank', 'BanBif', 'Banco Pichincha', 'Diners Club',
    'American Express', 'Banco Falabella', 'Banco Ripley', 'Tarjeta Oh'];
$$;

create table public.store_installment_offers (
  store_id          uuid primary key references public.stores(id) on delete cascade,
  max_installments  smallint not null check (max_installments between 2 and 36),
  cards             text[] not null default '{}' check (cards <@ laria_private.installment_card_options()),
  -- The offer applies from this price (whole soles); null: every listing.
  min_price_pen     integer check (min_price_pen is null or min_price_pen between 1 and 2147483647),
  owner_note        text check (owner_note is null or char_length(owner_note) between 2 and 280),
  -- Same states as store_payment_methods.status.
  status            text not null default 'pending_review'
                    check (status in ('pending_review', 'approved', 'rejected', 'disabled', 'withdrawn')),
  revision          integer not null default 1 check (revision >= 1),
  reviewed_by       uuid,
  reviewed_at       timestamptz,
  review_reason     text check (review_reason is null or char_length(review_reason) between 3 and 280),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint store_installment_offers_review_consistent
    check ((status in ('approved', 'rejected', 'disabled')) = (reviewed_at is not null and reviewed_by is not null)),
  constraint store_installment_offers_reason_required
    check (status not in ('rejected', 'disabled') or review_reason is not null)
);

create index store_installment_offers_review_idx on public.store_installment_offers(status, updated_at);

create trigger store_installment_offers_set_updated_at
before update on public.store_installment_offers
for each row execute function public.set_updated_at();

create trigger store_installment_offers_bump_revision
before update on public.store_installment_offers
for each row execute function laria_private.bump_payment_method_revision();

create table public.store_installment_offer_changes (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  change_type    text not null check (change_type in ('proposed', 'withdrawn', 'approved', 'rejected', 'disabled')),
  actor_kind     text not null check (actor_kind in ('owner', 'admin')),
  actor_user_id  uuid,
  before         jsonb,
  after          jsonb not null,
  reason         text check (reason is null or char_length(reason) <= 280),
  created_at     timestamptz not null default now()
);

create index store_installment_offer_changes_store_idx
  on public.store_installment_offer_changes(store_id, created_at desc, id desc);

create trigger store_installment_offer_changes_append_only
before update or delete on public.store_installment_offer_changes
for each row execute function laria_private.reject_payment_method_history_change();
create trigger store_installment_offer_changes_no_truncate
before truncate on public.store_installment_offer_changes
for each statement execute function laria_private.reject_payment_method_history_change();

alter table public.store_installment_offers enable row level security;
alter table public.store_installment_offer_changes enable row level security;

revoke all on public.store_installment_offers, public.store_installment_offer_changes from public, anon, authenticated;
grant select on public.store_installment_offers, public.store_installment_offer_changes to authenticated;

create policy "Store owners can read own installment offer" on public.store_installment_offers
  for select to authenticated using (public.is_store_owner(store_id));
create policy "Admins can read installment offers" on public.store_installment_offers
  for select to authenticated using (public.is_admin());
create policy "Store owners can read own installment offer history" on public.store_installment_offer_changes
  for select to authenticated using (public.is_store_owner(store_id));
create policy "Admins can read installment offer history" on public.store_installment_offer_changes
  for select to authenticated using (public.is_admin());

-- ------------------------------------------------------------------ helpers

create or replace function laria_private.installment_offer_json(p_row public.store_installment_offers)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'store_id', p_row.store_id, 'max_installments', p_row.max_installments, 'cards', to_jsonb(p_row.cards),
    'min_price_pen', p_row.min_price_pen, 'owner_note', p_row.owner_note, 'status', p_row.status,
    'review_reason', p_row.review_reason, 'reviewed_at', p_row.reviewed_at, 'updated_at', p_row.updated_at,
    'revision', p_row.revision);
$$;

-- The cards a store named, each matched to the list ignoring case and spaces, once each, in the list's order.
create or replace function laria_private.installment_cards(p_cards text[])
returns text[]
language plpgsql
immutable
as $$
declare
  wanted text[] := '{}';
  value text;
  option text;
  matched boolean;
begin
  if coalesce(cardinality(p_cards), 0) > 20 then
    perform laria_private.raise_payment_error('PAYMENT_INSTALLMENTS_CARDS_INVALID', 'Elige las tarjetas de la lista.');
  end if;
  foreach value in array coalesce(p_cards, '{}'::text[]) loop
    matched := false;
    foreach option in array laria_private.installment_card_options() loop
      if regexp_replace(lower(option), '[^a-z0-9]', '', 'g')
        = regexp_replace(lower(normalize(coalesce(value, ''), NFKC)), '[^a-z0-9]', '', 'g') then
        wanted := array_append(wanted, option);
        matched := true;
      end if;
    end loop;
    if not matched then
      perform laria_private.raise_payment_error('PAYMENT_INSTALLMENTS_CARDS_INVALID', 'Elige las tarjetas de la lista.');
    end if;
  end loop;
  return array(select listed.card from unnest(laria_private.installment_card_options()) with ordinality as listed(card, n)
    where listed.card = any(wanted) order by listed.n);
end;
$$;

-- What a buyer may see for a store right now: null while the pilot is off, the offer is not approved, the store is
-- not active and verified, or it shows no approved card method.
create or replace function laria_private.public_installment_offer(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('max_installments', o.max_installments, 'cards', to_jsonb(o.cards), 'min_price_pen', o.min_price_pen)
  from public.store_installment_offers o
  join public.stores s on s.id = o.store_id
  where laria_private.assisted_commerce_pilot_enabled()
    and o.store_id = p_store_id and o.status = 'approved' and s.status = 'active' and s.is_verified
    and exists (
      select 1 from public.store_payment_methods m
      where m.store_id = o.store_id and m.status = 'approved' and m.method in ('pos_tarjeta_al_recoger', 'link_de_pago'));
$$;

-- ------------------------------------------------------------------ the listing column

alter table public.listings add column installments_max smallint check (installments_max is null or installments_max between 2 and 36);

comment on column public.listings.installments_max is
  'buy-09: the number of interest-free installments the store''s public offer gives this listing (price at or above '
  'the offer''s minimum), else null. Kept by listings_a_store_installments; never client-writable.';

-- "Acepta cuotas" lists store listings only; the partial index keeps the count cheap.
create index listings_public_with_installments_idx on public.listings (published_at desc, id)
  where status = 'approved' and installments_max is not null;

-- The name sorts before listings_flags_a_reset, so the flag trigger below sees the filled column.
create or replace function laria_private.apply_store_installments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare offer jsonb;
begin
  new.installments_max := null;
  if new.seller_type is distinct from 'store' or new.store_id is null or new.price_pen is null then return new; end if;
  offer := laria_private.public_installment_offer(new.store_id);
  if offer is not null and (offer->>'min_price_pen' is null or new.price_pen >= (offer->>'min_price_pen')::integer) then
    new.installments_max := (offer->>'max_installments')::smallint;
  end if;
  return new;
end;
$$;

create trigger listings_a_store_installments
before insert or update of price_pen, seller_type, store_id, installments_max on public.listings
for each row execute function laria_private.apply_store_installments();

-- Recomputes a store's listings whose value would change. Sold listings stay as they are (they cannot change, and no
-- buyer pays for them any more). Listings are locked in id order, the order every inventory path uses.
create or replace function laria_private.refresh_store_installments(p_store_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  offer jsonb := laria_private.public_installment_offer(p_store_id);
  top smallint := (offer->>'max_installments')::smallint;
  floor_price integer := coalesce((offer->>'min_price_pen')::integer, 0);
  refreshed integer;
begin
  perform 1 from public.listings l
  where l.store_id = p_store_id and l.status <> 'sold'
    and l.installments_max is distinct from
      (case when l.seller_type = 'store' and l.price_pen is not null and l.price_pen >= floor_price then top end)
  order by l.id for update;
  -- Naming installments_max fires listings_a_store_installments, which writes the value (or clears it).
  update public.listings l set installments_max = null
  where l.store_id = p_store_id and l.status <> 'sold'
    and l.installments_max is distinct from
      (case when l.seller_type = 'store' and l.price_pen is not null and l.price_pen >= floor_price then top end);
  get diagnostics refreshed = row_count;
  return refreshed;
end;
$$;

-- ------------------------------------------------------------------ the "Acepta cuotas" flag

-- Its own trigger, so store-floor's "Con garantía" trigger (20261206120300) is not redefined. The name sorts after
-- listings_flags_a_reset and before listings_track_content_change, as the registry requires.
insert into laria_private.listing_flag_filters (flag, label, sort_order)
values ('acepta_cuotas', 'Acepta cuotas', 50)
on conflict (flag) do update set label = excluded.label, sort_order = excluded.sort_order;

create or replace function laria_private.listing_flags_store_floor_installments()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.installments_max is not null then
    new.listing_flags := array_append(new.listing_flags, 'acepta_cuotas');
  end if;
  return new;
end;
$$;

create trigger listings_flags_store_floor_installments
before insert or update on public.listings
for each row execute function laria_private.listing_flags_store_floor_installments();

-- ------------------------------------------------------------------ keeping the listings in step

-- A card method approved, rejected, disabled or withdrawn; the store verified, unverified, hidden or reactivated; the
-- pilot switched. Each refreshes only stores that have an offer.
create or replace function laria_private.refresh_installments_on_payment_method()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.method in ('pos_tarjeta_al_recoger', 'link_de_pago')
    and exists (select 1 from public.store_installment_offers where store_id = new.store_id) then
    perform laria_private.refresh_store_installments(new.store_id);
  end if;
  return null;
end;
$$;

create trigger store_payment_methods_refresh_installments
after insert or update of status on public.store_payment_methods
for each row execute function laria_private.refresh_installments_on_payment_method();

create or replace function laria_private.refresh_installments_on_store_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.status is distinct from old.status or new.is_verified is distinct from old.is_verified)
    and exists (select 1 from public.store_installment_offers where store_id = new.id) then
    perform laria_private.refresh_store_installments(new.id);
  end if;
  return null;
end;
$$;

create trigger stores_refresh_installments
after update of status, is_verified on public.stores
for each row execute function laria_private.refresh_installments_on_store_change();

create or replace function laria_private.refresh_installments_on_pilot_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare offer_store uuid;
begin
  if new.pilot_enabled is not distinct from old.pilot_enabled then return null; end if;
  for offer_store in select store_id from public.store_installment_offers where status = 'approved' order by store_id loop
    perform laria_private.refresh_store_installments(offer_store);
  end loop;
  return null;
end;
$$;

create trigger assisted_commerce_settings_refresh_installments
after update of pilot_enabled on laria_private.assisted_commerce_settings
for each row execute function laria_private.refresh_installments_on_pilot_change();

-- ------------------------------------------------------------------ owner functions

-- Proposes or changes the store's offer; every change goes to Admin review and stops showing until approved. Saving
-- the same values again changes nothing, so an approved offer stays approved.
create or replace function public.set_store_installments(
  p_max_installments integer,
  p_cards text[] default '{}',
  p_min_price_pen integer default null,
  p_note text default null,
  p_interest_free boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  store_record public.stores;
  previous public.store_installment_offers;
  saved public.store_installment_offers;
  card_list text[];
  note text;
begin
  if not laria_private.assisted_commerce_pilot_enabled() then
    perform laria_private.raise_payment_error('PAYMENT_PILOT_OFF', 'Los medios de pago aún no están disponibles.');
  end if;
  if p_interest_free is not true then
    perform laria_private.raise_payment_error('PAYMENT_INSTALLMENTS_INTEREST_FREE',
      'Laria solo muestra cuotas sin intereses. Confirma que el comprador no paga intereses ni recargos.');
  end if;
  if p_max_installments is null or p_max_installments not between 2 and 36 then
    perform laria_private.raise_payment_error('PAYMENT_INSTALLMENTS_COUNT', 'Elige hasta cuántas cuotas ofreces, de 2 a 36.');
  end if;
  if p_min_price_pen is not null and p_min_price_pen < 1 then
    perform laria_private.raise_payment_error('PAYMENT_INSTALLMENTS_MIN_PRICE', 'El precio mínimo debe ser mayor que cero.');
  end if;
  card_list := laria_private.installment_cards(p_cards);
  note := laria_private.payment_method_text(p_note, 280);
  store_record := laria_private.payment_caller_store();
  if store_record.status <> 'active' or not store_record.is_verified then
    perform laria_private.raise_payment_error('PAYMENT_STORE_NOT_VERIFIED',
      'Solo las tiendas verificadas pueden mostrar medios de pago.');
  end if;
  if not exists (
    select 1 from public.store_payment_methods
    where store_id = store_record.id and method in ('pos_tarjeta_al_recoger', 'link_de_pago')
      and status in ('pending_review', 'approved')) then
    perform laria_private.raise_payment_error('PAYMENT_INSTALLMENTS_CARD_REQUIRED',
      'Primero agrega un medio de pago con tarjeta: tarjeta con POS al recoger o enlace de pago.');
  end if;

  select * into previous from public.store_installment_offers where store_id = store_record.id for update;
  if previous.store_id is not null and previous.status in ('pending_review', 'approved')
    and previous.max_installments = p_max_installments
    and previous.cards = card_list
    and previous.min_price_pen is not distinct from p_min_price_pen
    and previous.owner_note is not distinct from note then
    return laria_private.installment_offer_json(previous);
  end if;

  insert into public.store_installment_offers(store_id, max_installments, cards, min_price_pen, owner_note, status)
  values (store_record.id, p_max_installments, card_list, p_min_price_pen, note, 'pending_review')
  on conflict (store_id) do update set
    max_installments = excluded.max_installments, cards = excluded.cards, min_price_pen = excluded.min_price_pen,
    owner_note = excluded.owner_note, status = 'pending_review', reviewed_by = null, reviewed_at = null, review_reason = null
  returning * into saved;

  insert into public.store_installment_offer_changes(store_id, change_type, actor_kind, actor_user_id, before, after)
  values (store_record.id, 'proposed', 'owner', auth.uid(),
    case when previous.store_id is null then null else laria_private.installment_offer_json(previous) end,
    laria_private.installment_offer_json(saved) || jsonb_build_object('interest_free_confirmed', true));
  if previous.status = 'approved' then perform laria_private.refresh_store_installments(store_record.id); end if;
  return laria_private.installment_offer_json(saved);
end;
$$;

create or replace function public.withdraw_store_installments()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  store_record public.stores;
  previous public.store_installment_offers;
  saved public.store_installment_offers;
begin
  store_record := laria_private.payment_caller_store();
  select * into previous from public.store_installment_offers where store_id = store_record.id for update;
  if previous.store_id is null then
    perform laria_private.raise_payment_error('PAYMENT_INSTALLMENTS_NOT_FOUND', 'Tu tienda no tiene cuotas registradas.');
  end if;
  if previous.status = 'withdrawn' then return laria_private.installment_offer_json(previous); end if;
  update public.store_installment_offers
  set status = 'withdrawn', reviewed_by = null, reviewed_at = null, review_reason = null
  where store_id = store_record.id
  returning * into saved;
  insert into public.store_installment_offer_changes(store_id, change_type, actor_kind, actor_user_id, before, after)
  values (store_record.id, 'withdrawn', 'owner', auth.uid(),
    laria_private.installment_offer_json(previous), laria_private.installment_offer_json(saved));
  if previous.status = 'approved' then perform laria_private.refresh_store_installments(store_record.id); end if;
  return laria_private.installment_offer_json(saved);
end;
$$;

-- ------------------------------------------------------------------ Admin

-- approve: a pending offer of an active, verified store. reject: a pending offer. disable: an approved one. Each
-- needs a reason and the revision the Admin saw. Lock order: store, then offer, then listings (as the owner functions).
create or replace function public.admin_review_store_installments(
  p_store_id uuid,
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
  previous public.store_installment_offers;
  saved public.store_installment_offers;
  next_status text;
begin
  perform laria_private.assert_admin();
  if p_decision is null or p_decision not in ('approve', 'reject', 'disable') then
    perform laria_private.raise_payment_error('PAYMENT_DECISION_INVALID', 'Elige aprobar, rechazar o desactivar.');
  end if;
  if reason is null or char_length(reason) not between 3 and 280 then
    perform laria_private.raise_payment_error('PAYMENT_REASON_REQUIRED', 'Indica el motivo o lo que comprobaste.');
  end if;
  select * into store_record from public.stores where id = p_store_id for no key update;
  if store_record.id is null then
    perform laria_private.raise_payment_error('STORE_NOT_FOUND', 'La tienda no existe.');
  end if;
  select * into previous from public.store_installment_offers where store_id = p_store_id for update;
  if previous.store_id is null then
    perform laria_private.raise_payment_error('PAYMENT_INSTALLMENTS_NOT_FOUND', 'Esa tienda no tiene cuotas registradas.');
  end if;
  if p_expected_revision is null or previous.revision <> p_expected_revision then
    perform laria_private.raise_payment_error('PAYMENT_INSTALLMENTS_CHANGED',
      'La tienda cambió sus cuotas. Vuelve a revisarlas antes de decidir.');
  end if;

  if p_decision = 'approve' then
    if previous.status <> 'pending_review' then
      perform laria_private.raise_payment_error('PAYMENT_INSTALLMENTS_NOT_PENDING', 'Solo se aprueban cuotas en revisión.');
    end if;
    if store_record.status <> 'active' or not store_record.is_verified then
      perform laria_private.raise_payment_error('PAYMENT_STORE_NOT_VERIFIED', 'La tienda debe estar activa y verificada.');
    end if;
    next_status := 'approved';
  elsif p_decision = 'reject' then
    if previous.status <> 'pending_review' then
      perform laria_private.raise_payment_error('PAYMENT_INSTALLMENTS_NOT_PENDING', 'Solo se rechazan cuotas en revisión.');
    end if;
    next_status := 'rejected';
  else
    if previous.status <> 'approved' then
      perform laria_private.raise_payment_error('PAYMENT_INSTALLMENTS_NOT_APPROVED', 'Solo se desactivan cuotas aprobadas.');
    end if;
    next_status := 'disabled';
  end if;

  update public.store_installment_offers
  set status = next_status, reviewed_by = auth.uid(), reviewed_at = now(), review_reason = reason
  where store_id = p_store_id
  returning * into saved;

  insert into public.store_installment_offer_changes(store_id, change_type, actor_kind, actor_user_id, before, after, reason)
  values (p_store_id, next_status, 'admin', auth.uid(),
    laria_private.installment_offer_json(previous), laria_private.installment_offer_json(saved), reason);
  perform laria_private.record_admin_audit('store_installments_' || next_status, 'store', p_store_id,
    jsonb_build_object('max_installments', saved.max_installments, 'from', previous.status, 'to', next_status, 'reason', reason));
  if next_status in ('approved', 'disabled') then perform laria_private.refresh_store_installments(p_store_id); end if;
  return laria_private.installment_offer_json(saved);
end;
$$;

-- The review queue, oldest change first, with what the Admin checks: the store's state and its card methods.
create or replace function public.get_admin_store_installment_offers(
  p_status text default 'pending_review',
  p_page integer default 1,
  p_page_size integer default 24
)
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
  select count(*) into total from public.store_installment_offers o where status_filter is null or o.status = status_filter;
  select coalesce(jsonb_agg(item order by sort_at, store_name), '[]'::jsonb) into rows
  from (
    select laria_private.installment_offer_json(o) || jsonb_build_object(
        'store_name', s.name, 'store_slug', s.slug, 'store_status', s.status, 'store_is_verified', s.is_verified,
        'card_methods', coalesce((
          select jsonb_agg(jsonb_build_object('method', m.method, 'status', m.status, 'provider_label', m.provider_label) order by m.method)
          from public.store_payment_methods m
          where m.store_id = o.store_id and m.method in ('pos_tarjeta_al_recoger', 'link_de_pago')), '[]'::jsonb)) as item,
      o.updated_at as sort_at, s.name as store_name
    from public.store_installment_offers o
    join public.stores s on s.id = o.store_id
    where status_filter is null or o.status = status_filter
    order by o.updated_at, s.name
    offset (page - 1) * page_size limit page_size
  ) listed;
  return jsonb_build_object('items', rows, 'total', total, 'page', page, 'page_size', page_size, 'status', status_filter);
end;
$$;

-- ------------------------------------------------------------------ public read

-- The store page and the listing page: the store's public offer, or null.
create or replace function public.get_store_installment_offer(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$ select laria_private.public_installment_offer(p_store_id); $$;

-- ------------------------------------------------------------------ grants

revoke all on function laria_private.installment_card_options() from public, anon, authenticated;
revoke all on function laria_private.installment_offer_json(public.store_installment_offers) from public, anon, authenticated;
revoke all on function laria_private.installment_cards(text[]) from public, anon, authenticated;
revoke all on function laria_private.public_installment_offer(uuid) from public, anon, authenticated;
revoke all on function laria_private.apply_store_installments() from public, anon, authenticated;
revoke all on function laria_private.refresh_store_installments(uuid) from public, anon, authenticated;
revoke all on function laria_private.listing_flags_store_floor_installments() from public, anon, authenticated;
revoke all on function laria_private.refresh_installments_on_payment_method() from public, anon, authenticated;
revoke all on function laria_private.refresh_installments_on_store_change() from public, anon, authenticated;
revoke all on function laria_private.refresh_installments_on_pilot_change() from public, anon, authenticated;

revoke all on function public.set_store_installments(integer, text[], integer, text, boolean) from public, anon, authenticated;
revoke all on function public.withdraw_store_installments() from public, anon, authenticated;
revoke all on function public.admin_review_store_installments(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.get_admin_store_installment_offers(text, integer, integer) from public, anon, authenticated;
revoke all on function public.get_store_installment_offer(uuid) from public, anon, authenticated;

grant execute on function public.set_store_installments(integer, text[], integer, text, boolean) to authenticated;
grant execute on function public.withdraw_store_installments() to authenticated;
grant execute on function public.admin_review_store_installments(uuid, text, text, integer) to authenticated;
grant execute on function public.get_admin_store_installment_offers(text, integer, integer) to authenticated;
grant execute on function public.get_store_installment_offer(uuid) to anon, authenticated, service_role;
