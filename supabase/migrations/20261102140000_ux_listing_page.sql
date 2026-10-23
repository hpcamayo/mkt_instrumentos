-- Effortless Laria, batch "listing" (docs/ux-effortless/listing.md): the data the listing page needs to show
-- freshness (list-04), real price drops (list-05), the seller at a glance (list-10), what Laria checked about a
-- verified store (trust-03), the full review list (list-06) and "Avísame cuando vuelva" (list-11). Everything here is
-- additive: new columns, one new BEFORE trigger, read-only RPCs, one table and its RPCs.

-- ------------------------------------------------------------------ list-04 and list-05: content and price history

-- content_changed_at: when the seller last changed what a buyer reads (price, text, details, photos excluded). The
-- generic updated_at moves with every view count, so it can't say "Actualizado hace 3 días".
-- price_changed_at: when the price last changed. previous_price_pen / price_dropped_at: the public "Antes S/ …".
alter table public.listings
  add column if not exists content_changed_at timestamptz,
  add column if not exists price_changed_at timestamptz,
  add column if not exists previous_price_pen integer,
  add column if not exists price_dropped_at timestamptz;

alter table public.listings drop constraint if exists listings_previous_price_check;
alter table public.listings add constraint listings_previous_price_check check (
  (previous_price_pen is null and price_dropped_at is null)
  or (previous_price_pen is not null and previous_price_pen > 0 and price_dropped_at is not null)
);

-- The trigger owns these four columns: whatever a caller writes to them is replaced.
--
-- A drop is public only when it is real (list-05):
--   * the listing was approved before the change, and the new price is at least 5% lower (the same threshold the
--     owner chose for price-drop alerts, save-08);
--   * the price it drops from had been in effect for at least 7 days. Raising a price and dropping it back a day later
--     shows nothing, so "Antes" can't be staged;
--   * a second drop within the 30 days a drop is shown keeps the original "Antes" price.
-- Any increase clears the drop. The page shows it for 30 days.
create or replace function laria_private.track_listing_content_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  base_price integer;
begin
  if tg_op = 'INSERT' then
    new.content_changed_at := null;
    new.price_changed_at := null;
    new.previous_price_pen := null;
    new.price_dropped_at := null;
    return new;
  end if;

  new.content_changed_at := old.content_changed_at;
  new.price_changed_at := old.price_changed_at;
  new.previous_price_pen := old.previous_price_pen;
  new.price_dropped_at := old.price_dropped_at;

  if row(new.title, new.description, new.attributes, new.condition, new.price_pen, new.brand, new.model)
     is distinct from row(old.title, old.description, old.attributes, old.condition, old.price_pen, old.brand, old.model) then
    new.content_changed_at := now();
  end if;

  if new.price_pen is distinct from old.price_pen then
    base_price := null;
    if old.status = 'approved' and new.price_pen is not null and old.price_pen is not null and new.price_pen < old.price_pen then
      if old.previous_price_pen is not null and old.price_dropped_at > now() - interval '30 days' then
        base_price := old.previous_price_pen;
      elsif old.price_changed_at is null or old.price_changed_at <= now() - interval '7 days' then
        base_price := old.price_pen;
      end if;
    end if;

    if base_price is not null and new.price_pen <= base_price * 0.95 then
      new.previous_price_pen := base_price;
      new.price_dropped_at := case when base_price = old.previous_price_pen then old.price_dropped_at else now() end;
    else
      new.previous_price_pen := null;
      new.price_dropped_at := null;
    end if;
    new.price_changed_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists listings_track_content_change on public.listings;
create trigger listings_track_content_change
before insert or update on public.listings
for each row execute function laria_private.track_listing_content_change();

-- ------------------------------------------------------------------ list-10 and trust-03: the seller at a glance

-- Only facts Laria records, coarsened where they describe a person:
--   member_since       the account (Particular) or the store's creation date;
--   last_active        today / week / month / null (older or unknown), from the owner's last sign-in. Never a time;
--   verified_sales     transactions both sides confirmed in Laria (seller or store side);
--   email_confirmed    the owner confirmed their e-mail (true for every account that can sign in);
--   store              for a verified store only: what Laria checked (RUC, razón social, address, district, city,
--                      that a phone is on file) and since when it is verified (the latest Admin verification).
-- Phone checks and WhatsApp reply times are not recorded, so they are not offered.
create or replace function public.get_public_seller_facts(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  listing_row public.listings;
  store_row public.stores;
  owner_id uuid;
  last_seen timestamptz;
  sales integer;
  verified_since timestamptz;
  facts jsonb;
begin
  select * into listing_row from public.listings where id = p_listing_id;
  if listing_row.id is null
     or not (public.listing_is_public(p_listing_id) or listing_row.status = 'sold') then
    return null;
  end if;

  if listing_row.seller_type = 'store' and listing_row.store_id is not null then
    select * into store_row from public.stores where id = listing_row.store_id and status = 'active';
    if store_row.id is null then return null; end if;
    owner_id := store_row.owner_user_id;
    select count(*) into sales from public.verified_transactions where store_id = store_row.id;
  else
    owner_id := listing_row.owner_user_id;
    if owner_id is not null then
      select count(*) into sales from public.verified_transactions where seller_user_id = owner_id and store_id is null;
    end if;
  end if;

  if owner_id is not null then
    select u.last_sign_in_at into last_seen from auth.users u where u.id = owner_id;
  end if;

  facts := jsonb_build_object(
    'member_since', case
      when store_row.id is not null then store_row.created_at
      else (select p.created_at from public.profiles p where p.id = owner_id) end,
    'last_active', case
      when last_seen is null then null
      when last_seen >= now() - interval '1 day' then 'today'
      when last_seen >= now() - interval '7 days' then 'week'
      when last_seen >= now() - interval '30 days' then 'month'
      else null end,
    'verified_sales', coalesce(sales, 0),
    'email_confirmed', owner_id is not null and exists (
      select 1 from auth.users u where u.id = owner_id and coalesce(u.email_confirmed_at, u.confirmed_at) is not null)
  );

  if store_row.id is not null and store_row.is_verified then
    select max(a.created_at) into verified_since
    from public.admin_audit_actions a
    where a.target_type = 'store' and a.target_id = store_row.id and a.action = 'store_verified';

    facts := facts || jsonb_build_object('store', jsonb_build_object(
      'ruc', store_row.ruc,
      'razon_social', store_row.razon_social,
      'address', store_row.address,
      'district', store_row.district,
      'city', store_row.city,
      'phone_on_file', regexp_replace(coalesce(store_row.whatsapp_phone, ''), '[^0-9]', '', 'g') <> '',
      'verified_since', verified_since
    ));
  end if;

  return facts;
end;
$$;

revoke all on function public.get_public_seller_facts(uuid) from public;
grant execute on function public.get_public_seller_facts(uuid) to anon, authenticated, service_role;

-- ------------------------------------------------------------------ list-06: every review and the breakdown

-- The same visible reviews as get_public_reputation (buyer to seller), in pages, with the count per star.
create or replace function public.get_public_review_page(
  p_subject_user_id uuid default null,
  p_subject_store_id uuid default null,
  p_offset integer default 0,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset < 0
     or (p_subject_user_id is null) = (p_subject_store_id is null) then
    raise exception 'REPUTATION_TARGET_INVALID';
  end if;
  with visible as (
    select r.id, r.rating, r.comment, r.submitted_at, p.full_name reviewer_name
    from public.transaction_reviews r
    join public.verified_transactions t on t.id = r.transaction_id
    join public.profiles p on p.id = r.reviewer_user_id
    where r.direction = 'buyer_to_seller'
      and r.subject_user_id is not distinct from p_subject_user_id
      and r.subject_store_id is not distinct from p_subject_store_id
      and laria_private.review_is_visible(r.id)
  ),
  page as (select * from visible order by submitted_at desc, id desc offset p_offset limit p_limit)
  select jsonb_build_object(
    'review_count', (select count(*) from visible),
    'breakdown', jsonb_build_object(
      '5', (select count(*) from visible where rating = 5),
      '4', (select count(*) from visible where rating = 4),
      '3', (select count(*) from visible where rating = 3),
      '2', (select count(*) from visible where rating = 2),
      '1', (select count(*) from visible where rating = 1)),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'rating', rating, 'comment', comment,
      'submitted_at', submitted_at, 'reviewer_name', reviewer_name) order by submitted_at desc, id desc) from page), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_public_review_page(uuid, uuid, integer, integer) from public;
grant execute on function public.get_public_review_page(uuid, uuid, integer, integer) to anon, authenticated, service_role;

-- ------------------------------------------------------------------ list-11: "Avísame cuando vuelva"

-- A buyer's request to hear once when an Agotado listing has units again. One row per buyer and listing; the row is
-- removed when the notice is sent, so a later sell-out needs a new request (no standing subscription).
create table if not exists public.listing_stock_watches (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

alter table public.listing_stock_watches enable row level security;
revoke all on public.listing_stock_watches from anon, authenticated;
grant select on public.listing_stock_watches to authenticated;

drop policy if exists listing_stock_watches_own on public.listing_stock_watches;
create policy listing_stock_watches_own on public.listing_stock_watches
for select to authenticated using (user_id = auth.uid());

create or replace function public.set_listing_stock_watch(p_listing_id uuid, p_watch boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  listing_row public.listings;
begin
  if caller is null then
    raise exception 'STOCK_WATCH_AUTH_REQUIRED: Ingresa para recibir el aviso.';
  end if;
  if not coalesce(p_watch, false) then
    delete from public.listing_stock_watches where user_id = caller and listing_id = p_listing_id;
    return false;
  end if;
  select * into listing_row from public.listings where id = p_listing_id;
  if listing_row.id is null or not public.listing_is_public(p_listing_id) or listing_row.stock_state is distinct from 'out_of_stock' then
    raise exception 'STOCK_WATCH_UNAVAILABLE: Esta publicación no está agotada.';
  end if;
  if listing_row.owner_user_id = caller
     or exists (select 1 from public.stores s where s.id = listing_row.store_id and s.owner_user_id = caller) then
    raise exception 'STOCK_WATCH_OWN_LISTING: Es tu propia publicación.';
  end if;
  insert into public.listing_stock_watches (user_id, listing_id) values (caller, p_listing_id)
  on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.set_listing_stock_watch(uuid, boolean) from public, anon;
grant execute on function public.set_listing_stock_watch(uuid, boolean) to authenticated;

-- When a watched listing has units again and is public, each watcher gets one notification and one e-mail, and the
-- watch ends. Restock still never re-sends search alerts (design §5.2); this is a notice the buyer asked for.
create or replace function laria_private.notify_listing_stock_watchers()
returns trigger
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  watch record;
  notification_id uuid;
begin
  if not public.listing_is_public(new.id) then return new; end if;
  for watch in
    delete from public.listing_stock_watches where listing_id = new.id returning user_id
  loop
    insert into public.notifications (user_id, event_type, message, listing_id)
    values (watch.user_id, 'listing_back_in_stock',
      left('Volvió a estar disponible: ' || new.title, 240), new.id)
    returning id into notification_id;
    perform laria_private.enqueue_marketplace_email(
      'listing_back_in_stock', watch.user_id, 'back_in_stock:' || notification_id::text, notification_id, new.id);
  end loop;
  return new;
end;
$$;

revoke all on function laria_private.notify_listing_stock_watchers() from public, anon, authenticated;

drop trigger if exists listings_notify_stock_watchers on public.listings;
create trigger listings_notify_stock_watchers
after update of stock_state on public.listings
for each row
when (old.stock_state = 'out_of_stock' and new.stock_state = 'in_stock')
execute function laria_private.notify_listing_stock_watchers();

-- The page asks whether the signed-in viewer already asked (the button then reads "Te avisaremos").
create or replace function public.get_listing_stock_watch(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.listing_stock_watches where user_id = auth.uid() and listing_id = p_listing_id)
$$;

revoke all on function public.get_listing_stock_watch(uuid) from public, anon;
grant execute on function public.get_listing_stock_watch(uuid) to authenticated;
