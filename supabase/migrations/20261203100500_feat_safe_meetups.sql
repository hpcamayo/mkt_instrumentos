-- safe-03 «Encuentro seguro» (docs/feature-ideas/deal-trust.md, FD-deal-trust-16 to 18), the one read the listing,
-- seller and store pages make for this batch's marks, and the batch's nightly job.
--
-- A verified, active store that shows its street address can offer itself as a «Punto seguro Laria»: a public place
-- where a buyer and a Particular seller can meet. The meetup sheet on a publication lists these stores in the same
-- city, next to well-known public places (lib/safe-meetup-places.ts). Laria checks nothing about the meeting and the
-- copy never promises safety. Admin can turn a store's spot off, with a reason.

create table public.store_safe_spots (
  store_id uuid primary key references public.stores(id) on delete cascade,
  enabled boolean not null default false,
  note text check (note is null or (char_length(note) between 1 and 200 and note = btrim(note))),
  enabled_at timestamptz,
  updated_at timestamptz not null default now(),
  admin_disabled_at timestamptz,
  admin_disabled_by uuid references public.profiles(id) on delete restrict,
  admin_disabled_reason text,
  constraint store_safe_spots_admin_shape check (
    (admin_disabled_at is null and admin_disabled_by is null and admin_disabled_reason is null)
    or (admin_disabled_at is not null and admin_disabled_by is not null and char_length(btrim(admin_disabled_reason)) between 3 and 500)
  ),
  constraint store_safe_spots_admin_off check (admin_disabled_at is null or not enabled)
);
create index if not exists store_safe_spots_admin_disabled_by_idx on public.store_safe_spots (admin_disabled_by)
  where admin_disabled_by is not null;

alter table public.store_safe_spots enable row level security;
revoke all on public.store_safe_spots from anon, authenticated;

-- What a store still needs before it can be a spot: active, verified by Laria, and its street address on its page.
create or replace function laria_private.safe_spot_missing(p_store public.stores)
returns text[]
language sql
immutable
as $$
  select array_remove(array[
    case when p_store.status <> 'active' then 'active' end,
    case when not p_store.is_verified then 'verified' end,
    case when nullif(btrim(coalesce(p_store.address, '')), '') is null then 'address' end,
    case when nullif(btrim(coalesce(p_store.address, '')), '') is not null and p_store.public_address is null then 'show_address' end
  ], null)
$$;

create or replace function laria_private.safe_spot_json(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('note', spot.note, 'since', spot.enabled_at)
  from public.store_safe_spots spot
  join public.stores s on s.id = spot.store_id
  where spot.store_id = p_store_id and spot.enabled and spot.admin_disabled_at is null
    and cardinality(laria_private.safe_spot_missing(s)) = 0
$$;

revoke all on function laria_private.safe_spot_json(uuid) from public, anon, authenticated;

create or replace function laria_private.caller_store()
returns public.stores
language sql
stable
security definer
set search_path = public
as $$
  select s.* from public.stores s
  where auth.uid() is not null and s.owner_user_id = auth.uid() and public.is_store_owner(s.id)
  order by s.created_at limit 1
$$;

revoke all on function laria_private.caller_store() from public, anon, authenticated;

-- The «Punto seguro» card in Mi tienda.
create or replace function public.get_my_safe_spot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  store_row public.stores := laria_private.caller_store();
  spot public.store_safe_spots;
begin
  if store_row.id is null then return null; end if;
  select * into spot from public.store_safe_spots where store_id = store_row.id;
  return jsonb_build_object(
    'store_id', store_row.id,
    'store_slug', store_row.slug,
    'missing', to_jsonb(laria_private.safe_spot_missing(store_row)),
    'enabled', coalesce(spot.enabled, false),
    'note', spot.note,
    'address', store_row.public_address,
    'district', store_row.district,
    'city', store_row.city,
    'admin_disabled', spot.admin_disabled_at is not null,
    'admin_disabled_reason', spot.admin_disabled_reason
  );
end;
$$;

revoke all on function public.get_my_safe_spot() from public, anon;
grant execute on function public.get_my_safe_spot() to authenticated, service_role;

create or replace function public.set_my_safe_spot(p_enabled boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  store_row public.stores := laria_private.caller_store();
  spot public.store_safe_spots;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if store_row.id is null then raise exception using errcode = '42501', message = 'SAFE_SPOT_STORE_REQUIRED'; end if;
  if p_enabled is null then raise exception 'SAFE_SPOT_VALUE_INVALID'; end if;
  if clean_note is not null and (char_length(clean_note) > 200 or laria_private.text_has_contact_details(clean_note)) then
    raise exception 'SAFE_SPOT_NOTE_INVALID';
  end if;
  -- The store row is read again under a lock so a change to its address or verification can't race the check.
  select * into store_row from public.stores where id = store_row.id for no key update;
  select * into spot from public.store_safe_spots where store_id = store_row.id for update;
  if p_enabled then
    if spot.admin_disabled_at is not null then raise exception 'SAFE_SPOT_ADMIN_DISABLED'; end if;
    if cardinality(laria_private.safe_spot_missing(store_row)) > 0 then raise exception 'SAFE_SPOT_NOT_ELIGIBLE'; end if;
  end if;
  insert into public.store_safe_spots(store_id, enabled, note, enabled_at)
  values (store_row.id, p_enabled, clean_note, case when p_enabled then now() end)
  on conflict (store_id) do update set
    enabled = excluded.enabled,
    note = excluded.note,
    enabled_at = case when excluded.enabled then coalesce(store_safe_spots.enabled_at, now()) end,
    updated_at = now();
  return public.get_my_safe_spot();
end;
$$;

revoke all on function public.set_my_safe_spot(boolean, text) from public, anon;
grant execute on function public.set_my_safe_spot(boolean, text) to authenticated, service_role;

-- Spots for the meetup sheet: same city first, then the rest of the region. Nothing outside the region.
create or replace function public.get_safe_meetup_spots(p_city text, p_region text, p_limit integer default 6)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(spot_row.item order by spot_row.same_city desc, spot_row.name), '[]'::jsonb)
  from (
    select jsonb_build_object(
        'name', s.name, 'slug', s.slug, 'district', s.district, 'city', s.city, 'address', s.public_address,
        'opening_hours', s.opening_hours, 'note', spot.note, 'logo_url', s.logo_url
      ) item,
      public.catalog_fold(s.city) = public.catalog_fold(coalesce(p_city, '')) same_city,
      s.name
    from public.store_safe_spots spot
    join public.stores s on s.id = spot.store_id
    where spot.enabled and spot.admin_disabled_at is null
      and cardinality(laria_private.safe_spot_missing(s)) = 0
      and (public.catalog_fold(s.city) = public.catalog_fold(coalesce(p_city, ''))
           or public.catalog_fold(s.region) = public.catalog_fold(coalesce(p_region, '')))
    order by 2 desc, s.name
    limit least(greatest(coalesce(p_limit, 6), 1), 12)
  ) spot_row
$$;

revoke all on function public.get_safe_meetup_spots(text, text, integer) from public;
grant execute on function public.get_safe_meetup_spots(text, text, integer) to anon, authenticated, service_role;

-- Admin > Confianza > Puntos seguros.
create or replace function public.get_admin_safe_spots()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform laria_private.assert_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'store_id', s.id, 'store_name', s.name, 'store_slug', s.slug, 'city', s.city, 'district', s.district,
      'address', s.public_address, 'enabled', spot.enabled, 'note', spot.note, 'enabled_at', spot.enabled_at,
      'missing', to_jsonb(laria_private.safe_spot_missing(s)),
      'admin_disabled_at', spot.admin_disabled_at, 'admin_disabled_reason', spot.admin_disabled_reason
    ) order by spot.admin_disabled_at desc nulls last, s.name)
    from public.store_safe_spots spot join public.stores s on s.id = spot.store_id
    where spot.enabled or spot.admin_disabled_at is not null
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_admin_safe_spots() from public, anon;
grant execute on function public.get_admin_safe_spots() to authenticated, service_role;

-- Off: the spot stops showing at once and the store can't turn it back on. Allowed again: the store may turn it on.
create or replace function public.admin_set_safe_spot(p_store_id uuid, p_allowed boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  owner_id uuid;
begin
  perform laria_private.assert_admin();
  if p_allowed is null then raise exception 'SAFE_SPOT_VALUE_INVALID'; end if;
  if not p_allowed and (clean_reason is null or char_length(clean_reason) not between 3 and 500) then
    raise exception 'SAFE_SPOT_REASON_REQUIRED';
  end if;
  select owner_user_id into owner_id from public.stores where id = p_store_id;
  if not found then raise exception 'SAFE_SPOT_STORE_REQUIRED'; end if;
  if p_allowed then
    update public.store_safe_spots
    set admin_disabled_at = null, admin_disabled_by = null, admin_disabled_reason = null, updated_at = now()
    where store_id = p_store_id;
  else
    insert into public.store_safe_spots(store_id, enabled, admin_disabled_at, admin_disabled_by, admin_disabled_reason)
    values (p_store_id, false, now(), auth.uid(), clean_reason)
    on conflict (store_id) do update set
      enabled = false, enabled_at = null, admin_disabled_at = now(), admin_disabled_by = auth.uid(),
      admin_disabled_reason = clean_reason, updated_at = now();
    insert into public.notifications(user_id, event_type, message, store_id)
    select owner_id, 'store_safe_spot_disabled',
      'Laria quitó tu tienda de los Puntos seguros. Motivo: ' || clean_reason, p_store_id
    where owner_id is not null;
  end if;
  perform laria_private.record_admin_audit(case when p_allowed then 'safe_spot_allowed' else 'safe_spot_disabled' end,
    'store', p_store_id, jsonb_build_object('reason', clean_reason));
  return public.get_admin_safe_spots();
end;
$$;

revoke all on function public.admin_set_safe_spot(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_safe_spot(uuid, boolean, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- One read per page for this batch's marks
-- ---------------------------------------------------------------------------------------------------------------

-- The publication page: seller page link (Particular), the seller's level, the publication's history on Laria, the
-- store's «Punto seguro», and where the meetup sheet looks for places. Null when the publication isn't public or sold.
create or replace function public.get_listing_trust(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  item public.listings;
  particular boolean;
begin
  select * into item from public.listings where id = p_listing_id;
  if not found or not (public.listing_is_public(item.id) or item.status = 'sold') then return null; end if;
  particular := item.seller_type = 'individual' and item.store_id is null;
  return jsonb_build_object(
    'seller_kind', case when particular then 'particular' else 'store' end,
    'seller_page', case when particular then (
      select jsonb_build_object('slug', page.slug) from public.seller_pages page
      where page.user_id = item.owner_user_id and not page.hidden) end,
    'level', case when particular then laria_private.seller_level_json(item.owner_user_id, null)
      when item.store_id is not null then laria_private.seller_level_json(null, item.store_id) end,
    'provenance', laria_private.listing_provenance_json(item.id),
    'safe_spot', case when item.store_id is not null then laria_private.safe_spot_json(item.store_id) end,
    'meetup', jsonb_build_object('city', item.city, 'region', item.region)
  );
end;
$$;

revoke all on function public.get_listing_trust(uuid) from public;
grant execute on function public.get_listing_trust(uuid) to anon, authenticated, service_role;

create or replace function public.get_store_trust(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'level', laria_private.seller_level_json(null, s.id),
    'safe_spot', laria_private.safe_spot_json(s.id)
  )
  from public.stores s where s.id = p_store_id and s.status = 'active'
$$;

revoke all on function public.get_store_trust(uuid) from public;
grant execute on function public.get_store_trust(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Nightly job
-- ---------------------------------------------------------------------------------------------------------------

-- Counter purchases have no publication, so run_my_listings_reminders (which joins publications) skips them; this
-- sends their "your review is due soon" reminder instead, once per person and purchase, two days before the end.
create or replace function laria_private.send_counter_review_reminders()
returns integer
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  due record;
  sent integer := 0;
begin
  for due in
    select t.id transaction_id, t.store_id, participant.user_id, s.name store_name, participant.role
    from public.verified_transactions t
    join public.stores s on s.id = t.store_id
    cross join lateral (values (t.buyer_user_id, 'buyer'), (t.seller_user_id, 'seller')) participant(user_id, role)
    where t.counter_sale_id is not null
      and t.review_deadline > now() and t.review_deadline <= now() + interval '2 days'
      and not exists (select 1 from public.transaction_reviews r where r.transaction_id = t.id and r.reviewer_user_id = participant.user_id)
  loop
    if laria_private.trust_notify_once('counter-review:' || due.transaction_id || ':' || due.user_id, due.user_id,
         'store_counter_review_reminder',
         case when due.role = 'buyer'
           then 'Tu reseña de la compra en ' || due.store_name || ' vence en menos de dos días.'
           else 'Tu reseña de un cliente del mostrador vence en menos de dos días.' end,
         due.store_id, due.transaction_id) then
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end;
$$;

revoke all on function laria_private.send_counter_review_reminders() from public, anon, authenticated;

create or replace function laria_private.run_deal_trust_nightly()
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
begin
  return jsonb_build_object(
    'levels', laria_private.refresh_seller_levels(),
    'counter_review_reminders', laria_private.send_counter_review_reminders()
  );
end;
$$;

revoke all on function laria_private.run_deal_trust_nightly() from public, anon, authenticated;

-- For app/api/internal/jobs/deal-trust (CRON_SECRET), which also removes unattached review photo uploads.
create or replace function public.run_deal_trust_nightly()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select laria_private.run_deal_trust_nightly()
$$;

revoke all on function public.run_deal_trust_nightly() from public, anon, authenticated;
grant execute on function public.run_deal_trust_nightly() to service_role;

-- No pg_cron job: per the feature build plan every scheduled job runs from its route (once a day, 02:30 Lima suggested),
-- and the integrator collects the schedules for Henri. Running it more than once a day is harmless.
