-- Effortless Laria maybes, talk-06 "Reservado" (docs/ux-effortless/maybes-reservado.md). A Particular seller marks a
-- published listing as reserved for 1, 2, 3 or 5 days: the listing page and the catalog cards say "Reservado", and a
-- buyer can ask "Avísame si se libera". When the period ends the badge goes and the seller is asked "¿Se vendió?" (a
-- Pendientes item, a notification and an e-mail). The people waiting hear once: when the seller says it is still
-- available, or 24 hours after the end without an answer. If it sold instead, they hear that in the app.
-- Stores hold units through Inventario and purchase requests, so a store listing can't be reserved here.
--
-- What it adds:
-- - public.listing_reservations: one row per listing while it is reserved, and after the end until the seller answers
--   (24 hours at most). A table of its own rather than a column of public.listings: features/marketplace redefines
--   public.public_listings (20261210120500), and listings carries the edit triggers. No API role reads it directly:
--   the listing page, the cards and Descubrir read the running periods of public listings through
--   public.get_reserved_listings(), the seller theirs through public.get_my_listing_reservations().
-- - public.listing_release_watches: "Avísame si se libera", like public.listing_stock_watches (20261102140000).
-- - The seller's two actions, security-definer functions only: public.set_listing_reservation (1, 2, 3 or 5 days from
--   now; again to change a period or after one ended) and public.end_listing_reservation ('available', which also
--   counts as "sigue disponible", or 'sold', the ordinary sold flow of public.set_owned_listing_lifecycle).
-- - laria_private.run_listing_reservations(), every minute from pg_cron (listing-reservations): it ends the periods
--   that ran out and asks the seller, releases a listing 24 hours after its end, and closes the period of a listing
--   that left Approved (sold, hidden or archived through any path).
-- - Notifications: listing_reservation_ended (the seller, with an e-mail), listing_released (each person waiting, with
--   an e-mail) and listing_reservation_sold (each person waiting, in the app only).
-- - Launch audit A19 (20261113130000): a statement that starts, changes or ends the period of a shown listing records
--   a change of the cached public pages, so the badge comes and goes within a minute.
-- - Launch audit A20 (20261114120000): anonymizing an account removes its release watches.
-- - Launch audit A25 (20261114160000): a release e-mail lasts two days and goes with the alerts, like a restock; the
--   seller's question lasts three, with the reminders. Every earlier answer of the two functions stays the same.
--
-- Compatibility: new tables and functions, which the deployed app doesn't call.
-- Locks: the two event type lists take public.notifications and laria_private.marketplace_email_deliveries for an
-- instant (the constraints come back NOT VALID, so nothing is scanned); the anonymization trigger takes
-- laria_private.account_anonymizations for an instant. Each wait is capped at 10 seconds.
-- Rollback: select cron.unschedule('listing-reservations'); drop the trigger account_anonymizations_release_watches,
-- the two tables (their triggers go with them) and the functions below; restore laria_private.email_max_age and
-- laria_private.email_priority from 20261114160000. The event types can stay.

set lock_timeout = '10s';

-- ------------------------------------------------------------------ tables

create table if not exists public.listing_reservations (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  reserved_at timestamptz not null default now(),
  reserved_until timestamptz not null,
  -- When laria_private.run_listing_reservations() found the period over and asked the seller "¿Se vendió?".
  ended_at timestamptz,
  constraint listing_reservations_period_check
    check (reserved_until > reserved_at and reserved_until <= reserved_at + interval '5 days'),
  constraint listing_reservations_ended_check check (ended_at is null or ended_at >= reserved_until)
);
-- The job's two scans: periods past their end that nobody ended yet, and ended periods waiting for an answer.
create index if not exists listing_reservations_running_idx on public.listing_reservations (reserved_until)
  where ended_at is null;
create index if not exists listing_reservations_ended_idx on public.listing_reservations (reserved_until)
  where ended_at is not null;

alter table public.listing_reservations enable row level security;
revoke all on public.listing_reservations from public, anon, authenticated;

create table if not exists public.listing_release_watches (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
create index if not exists listing_release_watches_listing_idx on public.listing_release_watches (listing_id);

alter table public.listing_release_watches enable row level security;
revoke all on public.listing_release_watches from public, anon, authenticated;

-- ------------------------------------------------------------------ registries

-- Every type starts with "listing_", so notifications_target_check already requires a listing_id.
--   listing_reservation_ended  the period ended: "¿Se vendió?" for the seller, answered from Pendientes.
--   listing_released           a listing the person waited on isn't reserved any more; sent once.
--   listing_reservation_sold   a listing the person waited on sold; in the app only.
select laria_private.ux_extend_text_check(
  'public.notifications', 'notifications_event_type_check', 'event_type',
  array['listing_reservation_ended', 'listing_released', 'listing_reservation_sold']
);
select laria_private.ux_extend_text_check(
  'laria_private.marketplace_email_deliveries', 'marketplace_email_deliveries_event_type_check', 'event_type',
  array['listing_reservation_ended', 'listing_released']
);

-- Same as 20261114160000 with the two kinds added: a release is news like a restock, and is stale as soon (two days,
-- after an account's own business); the seller's question is a reminder (three days, before the alerts).
create or replace function laria_private.email_max_age(p_event_type text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case
    when p_event_type in ('search_alert_immediate', 'search_alert_daily') then interval '1 day'
    when p_event_type in ('listing_price_drop', 'listing_back_in_stock', 'listing_released') then interval '2 days'
    when p_event_type in ('follow_weekly', 'listing_availability_checkin', 'listing_purchase_check',
                          'listing_purchase_confirmation_reminder', 'listing_review_reminder',
                          'listing_reservation_ended') then interval '3 days'
    else interval '7 days'
  end;
$$;

create or replace function laria_private.email_priority(p_event_type text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_event_type in ('search_alert_immediate', 'search_alert_daily', 'listing_price_drop', 'listing_back_in_stock',
                          'follow_weekly', 'listing_released') then 2
    when p_event_type in ('listing_availability_checkin', 'listing_purchase_check',
                          'listing_purchase_confirmation_reminder', 'listing_review_reminder',
                          'listing_reservation_ended') then 1
    else 0
  end;
$$;

revoke all on function laria_private.email_max_age(text) from public, anon, authenticated;
revoke all on function laria_private.email_priority(text) from public, anon, authenticated;

-- ------------------------------------------------------------------ reading

-- The running periods (not ended, not run out) of public Particular listings among the ids: the listing page, the
-- catalog cards and Descubrir (lib/listing-reservations.ts). The first 200 ids are read.
create or replace function public.get_reserved_listings(p_listing_ids uuid[])
returns table (listing_id uuid, reserved_until timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.listing_id, r.reserved_until
  from public.listing_reservations r
  join public.listings l on l.id = r.listing_id
  where r.listing_id = any ((coalesce(p_listing_ids, '{}'::uuid[]))[1:200])
    and r.ended_at is null
    and r.reserved_until > now()
    and l.status = 'approved' and l.seller_type = 'individual' and l.store_id is null;
$$;
revoke all on function public.get_reserved_listings(uuid[]) from public;
grant execute on function public.get_reserved_listings(uuid[]) to anon, authenticated, service_role;

-- The caller's own periods of published listings, running or waiting for "¿Se vendió?", with how many people wait to
-- hear (Mis publicaciones, Pendientes). A period whose listing left Approved is the job's to close, so it isn't listed.
create or replace function public.get_my_listing_reservations()
returns table (listing_id uuid, title text, slug text, reserved_until timestamptz, ended_at timestamptz, watchers integer)
language sql
stable
security definer
set search_path = public
as $$
  select r.listing_id, l.title, l.slug, r.reserved_until, r.ended_at,
    (select count(*)::integer from public.listing_release_watches w where w.listing_id = r.listing_id)
  from public.listing_reservations r
  join public.listings l on l.id = r.listing_id
  where l.owner_user_id = (select auth.uid()) and l.status = 'approved'
  order by r.reserved_until, r.listing_id;
$$;
revoke all on function public.get_my_listing_reservations() from public, anon;
grant execute on function public.get_my_listing_reservations() to authenticated, service_role;

-- ------------------------------------------------------------------ the people waiting

-- Tells each person waiting on the listing once, then forgets their request: 'released' in the app and by e-mail,
-- 'sold' in the app only. Returns how many were told.
create or replace function laria_private.tell_release_watchers(p_listing_id uuid, p_kind text)
returns integer
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  watch record;
  notification_id uuid;
  listing_title text;
  told integer := 0;
begin
  select l.title into listing_title from public.listings l where l.id = p_listing_id;
  for watch in
    delete from public.listing_release_watches w where w.listing_id = p_listing_id returning w.user_id
  loop
    if p_kind = 'released' then
      insert into public.notifications (user_id, event_type, message, listing_id)
      values (watch.user_id, 'listing_released',
        left('Ya no está reservado: ' || coalesce(listing_title, 'la publicación que esperabas')
          || '. Si te sigue interesando, escríbele a quien vende.', 240),
        p_listing_id)
      returning id into notification_id;
      perform laria_private.enqueue_marketplace_email(
        'listing_released', watch.user_id, 'released:' || notification_id::text, notification_id, p_listing_id
      );
    else
      insert into public.notifications (user_id, event_type, message, listing_id)
      values (watch.user_id, 'listing_reservation_sold',
        left('Se vendió: ' || coalesce(listing_title, 'la publicación que esperabas') || '.', 240), p_listing_id);
    end if;
    told := told + 1;
  end loop;
  return told;
end;
$$;
revoke all on function laria_private.tell_release_watchers(uuid, text) from public, anon, authenticated;

-- "Avísame si se libera", on and off. Only while the period runs: after it ends the listing reads as available.
create or replace function public.set_listing_release_watch(p_listing_id uuid, p_watch boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  listing_record public.listings;
begin
  if caller is null then
    raise exception 'RELEASE_WATCH_AUTH_REQUIRED: Ingresa para recibir el aviso.';
  end if;
  if not coalesce(p_watch, false) then
    delete from public.listing_release_watches w where w.user_id = caller and w.listing_id = p_listing_id;
    return false;
  end if;
  select * into listing_record from public.listings where id = p_listing_id;
  if listing_record.id is null or listing_record.status <> 'approved' or not exists (
    select 1 from public.listing_reservations r
    where r.listing_id = p_listing_id and r.ended_at is null and r.reserved_until > now()
  ) then
    raise exception 'RELEASE_WATCH_UNAVAILABLE: Esta publicación ya no está reservada.';
  end if;
  if listing_record.owner_user_id = caller then
    raise exception 'RELEASE_WATCH_OWN_LISTING: Es tu propia publicación.';
  end if;
  insert into public.listing_release_watches (user_id, listing_id) values (caller, p_listing_id) on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.set_listing_release_watch(uuid, boolean) from public, anon;
grant execute on function public.set_listing_release_watch(uuid, boolean) to authenticated, service_role;

create or replace function public.get_listing_release_watch(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.listing_release_watches w
    where w.user_id = (select auth.uid()) and w.listing_id = p_listing_id
  );
$$;
revoke all on function public.get_listing_release_watch(uuid) from public, anon;
grant execute on function public.get_listing_release_watch(uuid) to authenticated, service_role;

-- ------------------------------------------------------------------ the seller's actions

-- 1, 2, 3 or 5 days from now, on the seller's own published Particular listing. Again on a reserved listing, the new
-- period replaces the old one, and the people waiting keep waiting. Returns the end of the period.
create or replace function public.set_listing_reservation(p_listing_id uuid, p_days integer)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  listing_record public.listings;
  period_end timestamptz;
begin
  if caller is null then
    raise exception 'RESERVATION_AUTH_REQUIRED: Ingresa a tu cuenta.';
  end if;
  if p_days is null or p_days not in (1, 2, 3, 5) then
    raise exception 'RESERVATION_DAYS_INVALID: Elige 1, 2, 3 o 5 días.';
  end if;
  select * into listing_record from public.listings where id = p_listing_id for update;
  if not found or listing_record.owner_user_id is distinct from caller then
    raise exception 'RESERVATION_NOT_OWNED: No puedes administrar esta publicación.';
  end if;
  if listing_record.seller_type <> 'individual' or listing_record.store_id is not null then
    raise exception 'RESERVATION_STORE_LISTING: Las tiendas separan unidades desde Inventario.';
  end if;
  if listing_record.status <> 'approved' then
    raise exception 'RESERVATION_NOT_PUBLISHED: Solo puedes reservar una publicación publicada.';
  end if;
  period_end := now() + make_interval(days => p_days);
  insert into public.listing_reservations as r (listing_id, reserved_at, reserved_until, ended_at)
  values (p_listing_id, now(), period_end, null)
  on conflict (listing_id) do update
  set reserved_at = excluded.reserved_at, reserved_until = excluded.reserved_until, ended_at = null;
  -- A new period answers the last one's "¿Se vendió?".
  update public.notifications set read_at = now()
  where user_id = caller and listing_id = p_listing_id and event_type = 'listing_reservation_ended' and read_at is null;
  return period_end;
end;
$$;
revoke all on function public.set_listing_reservation(uuid, integer) from public, anon;
grant execute on function public.set_listing_reservation(uuid, integer) to authenticated, service_role;

-- 'available': the seller takes the reservation off, or answers "Sigue disponible" after the end. It counts as a
-- "sigue disponible" (public.confirm_listing_available), and the people waiting hear it now.
-- 'sold': the ordinary sold flow (public.set_owned_listing_lifecycle, which checks the listing can be sold); the people
-- waiting hear it in the app. It works on a listing whose period already closed too.
-- Either way the period closes. Returns how many people were told.
create or replace function public.end_listing_reservation(p_listing_id uuid, p_outcome text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  listing_record public.listings;
  told integer;
begin
  if caller is null then
    raise exception 'RESERVATION_AUTH_REQUIRED: Ingresa a tu cuenta.';
  end if;
  if p_outcome is null or p_outcome not in ('available', 'sold') then
    raise exception 'RESERVATION_OUTCOME_INVALID: Acción no compatible.';
  end if;
  select * into listing_record from public.listings where id = p_listing_id;
  if not found or listing_record.owner_user_id is distinct from caller then
    raise exception 'RESERVATION_NOT_OWNED: No puedes administrar esta publicación.';
  end if;
  if p_outcome = 'sold' then
    perform public.set_owned_listing_lifecycle(p_listing_id, 'sold');
  else
    if listing_record.status <> 'approved' then
      raise exception 'RESERVATION_NOT_PUBLISHED: Solo puedes reservar una publicación publicada.';
    end if;
    if not exists (select 1 from public.listing_reservations r where r.listing_id = p_listing_id) then
      raise exception 'RESERVATION_NOT_FOUND: Esta publicación ya no está reservada.';
    end if;
    perform public.confirm_listing_available(p_listing_id);
  end if;
  delete from public.listing_reservations r where r.listing_id = p_listing_id;
  told := laria_private.tell_release_watchers(p_listing_id, case when p_outcome = 'sold' then 'sold' else 'released' end);
  update public.notifications set read_at = now()
  where user_id = caller and listing_id = p_listing_id and event_type = 'listing_reservation_ended' and read_at is null;
  return told;
end;
$$;
revoke all on function public.end_listing_reservation(uuid, text) from public, anon;
grant execute on function public.end_listing_reservation(uuid, text) to authenticated, service_role;

-- ------------------------------------------------------------------ the job

-- Every minute (below). Each step's statement records a page change through the triggers when it touches a shown
-- listing, so the badge goes from the cached pages within a minute of the end.
create or replace function laria_private.run_listing_reservations()
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  item record;
  closed integer := 0;
  asked integer := 0;
  released integer := 0;
begin
  -- 1. A listing that left Approved (sold, hidden, archived) takes its period with it. If it sold, the people waiting
  --    hear it; otherwise their requests end quietly.
  for item in
    delete from public.listing_reservations r
    using public.listings l
    where l.id = r.listing_id and l.status <> 'approved'
    returning r.listing_id, l.status
  loop
    closed := closed + 1;
    if item.status = 'sold' then
      perform laria_private.tell_release_watchers(item.listing_id, 'sold');
    else
      delete from public.listing_release_watches w where w.listing_id = item.listing_id;
    end if;
  end loop;

  -- 2. The periods that ran out: the badge goes, and the seller is asked once per period.
  for item in
    update public.listing_reservations r set ended_at = now()
    from public.listings l
    where l.id = r.listing_id and r.ended_at is null and r.reserved_until <= now()
    returning r.listing_id, r.reserved_until, l.owner_user_id, l.title
  loop
    if laria_private.ux_notify_once(
      'reservation_ended:' || item.listing_id || ':' || to_char(item.reserved_until at time zone 'UTC', 'YYYYMMDDHH24MISS'),
      item.owner_user_id,
      'listing_reservation_ended',
      left('¿Se vendió «' || left(item.title, 80) || '»? Terminó la reserva: respóndelo en un toque desde tu cuenta.', 240),
      item.listing_id
    ) then
      asked := asked + 1;
    end if;
  end loop;

  -- 3. No answer 24 hours after the end: it counts as available again, and the people waiting hear so.
  for item in
    delete from public.listing_reservations r
    where r.ended_at is not null and r.reserved_until <= now() - interval '24 hours'
    returning r.listing_id
  loop
    released := released + laria_private.tell_release_watchers(item.listing_id, 'released');
  end loop;

  return jsonb_build_object('closed', closed, 'asked', asked, 'released', released);
end;
$$;
revoke all on function laria_private.run_listing_reservations() from public, anon, authenticated;

-- A quiet run reads the small table once and two partial indexes. cron.schedule() with a job name replaces the job of
-- that name.
select cron.schedule('listing-reservations', '* * * * *', $$select laria_private.run_listing_reservations()$$);

-- ------------------------------------------------------------------ cached pages (launch audit A19)

-- The listing page shows "Reservado" and its end, and the cards the badge, while a period runs. A new period, a changed
-- one, one the job ended and one closed while it ran change what shows; closing a period that had already ended
-- doesn't (its end was recorded).
create or replace function laria_private.mark_reservation_page_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed boolean;
begin
  if tg_op = 'UPDATE' then
    select exists (
      select 1
      from old_rows o
      join new_rows n on n.listing_id = o.listing_id
      where (o.reserved_until, o.ended_at) is distinct from (n.reserved_until, n.ended_at)
        and laria_private.listing_is_shown(n.listing_id)
    ) into changed;
  elsif tg_op = 'INSERT' then
    select exists (select 1 from new_rows n where laria_private.listing_is_shown(n.listing_id)) into changed;
  else
    select exists (
      select 1 from old_rows o where o.ended_at is null and laria_private.listing_is_shown(o.listing_id)
    ) into changed;
  end if;
  if changed then
    insert into laria_private.public_page_changes default values;
  end if;
  return null;
end;
$$;
revoke all on function laria_private.mark_reservation_page_changes() from public, anon, authenticated;

create or replace trigger listing_reservations_public_page_changes_insert
after insert on public.listing_reservations
referencing new table as new_rows
for each statement execute function laria_private.mark_reservation_page_changes();

create or replace trigger listing_reservations_public_page_changes_update
after update on public.listing_reservations
referencing old table as old_rows new table as new_rows
for each statement execute function laria_private.mark_reservation_page_changes();

create or replace trigger listing_reservations_public_page_changes_delete
after delete on public.listing_reservations
referencing old table as old_rows
for each statement execute function laria_private.mark_reservation_page_changes();

-- ------------------------------------------------------------------ account anonymization (launch audit A20)

-- An anonymized account's release watches go with it, counted with the rest. Every anonymization ends by recording
-- itself in laria_private.account_anonymizations (laria_private.anonymize_account_core), so this needs no change to
-- the core or to features/marketplace's hook; on a repeat, the upsert's update keeps the counts this trigger gave the
-- insert it tried first.
create or replace function laria_private.forget_release_watches_on_anonymization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  done integer;
begin
  delete from public.listing_release_watches w where w.user_id = new.user_id;
  get diagnostics done = row_count;
  new.counts := coalesce(new.counts, '{}'::jsonb) || jsonb_build_object('release_watches', done);
  return new;
end;
$$;
revoke all on function laria_private.forget_release_watches_on_anonymization() from public, anon, authenticated;

drop trigger if exists account_anonymizations_release_watches on laria_private.account_anonymizations;
create trigger account_anonymizations_release_watches
before insert on laria_private.account_anonymizations
for each row execute function laria_private.forget_release_watches_on_anonymization();

reset lock_timeout;
