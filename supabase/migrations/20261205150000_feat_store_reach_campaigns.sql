-- Feature ideas, batch "store-reach" (docs/feature-ideas/store-reach.md): reach-05 "Campañas Laria".
--
-- Laria runs campaign pages (Navidad, Día de la Música, back to school, Cyber Wow once legal clears the name). Stores
-- opt publications in with a real discount, and Laria checks the reference ("Antes") against what the publication
-- actually held over the 30 days before:
--   * the reference is the lowest price of those 30 days (listing_price_history, recorded from this migration on);
--   * the publication's price right before the campaign must be that lowest price (a price raised within the 30 days
--     cannot be the "Antes" of a campaign);
--   * the campaign price must be at least the campaign's minimum discount below the reference;
--   * the publication must have been public and its price recorded for the whole 30 days.
-- The check runs when the store applies and again when the entry goes live. No countdowns: campaign pages show plain
-- dates. Prices stay the store's: Laria sets the campaign price the store chose when the campaign starts and, if the
-- store asked for it, puts the earlier price back when it ends; a store that changes the price itself leaves the
-- campaign. A job (pg_cron every 10 minutes, or the protected route app/api/internal/jobs/campaigns) does both.
--
-- History starts with this migration: a publication whose price has not changed since list-05 began tracking is
-- recorded from the moment this runs, so it can join a campaign 30 days later. Laria never guesses an older price.
--
-- Additive: three tables, one trigger, new values in two text checks, functions listed at the end. No existing
-- function is redefined.

-- ------------------------------------------------------------------ price history

create table public.listing_price_history (
  id          bigint generated always as identity primary key,
  listing_id  uuid not null references public.listings(id) on delete cascade,
  price_pen   integer not null check (price_pen > 0),
  valid_from  timestamptz not null,
  valid_to    timestamptz,
  source      text not null check (source in ('backfill', 'created', 'change', 'campaign')),
  constraint listing_price_history_period check (valid_to is null or valid_to >= valid_from)
);

comment on table public.listing_price_history is
  'reach-05: every price a publication held and when. Written only by the listings_record_price_history trigger.';

create unique index listing_price_history_current_idx on public.listing_price_history (listing_id) where valid_to is null;
create index listing_price_history_listing_idx on public.listing_price_history (listing_id, valid_from desc);

alter table public.listing_price_history enable row level security;
revoke all on public.listing_price_history from public, anon, authenticated;

insert into public.listing_price_history (listing_id, price_pen, valid_from, source)
select l.id, l.price_pen, coalesce(l.price_changed_at, now()), 'backfill'
from public.listings l
where l.price_pen is not null and l.price_pen > 0;

create or replace function laria_private.record_listing_price_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- The moment of the change, not the transaction's start: two edits of one listing wait for each other's row lock,
  -- and the later one may have started first. Never before the current row began.
  at timestamptz;
begin
  if tg_op = 'UPDATE' and new.price_pen is not distinct from old.price_pen then
    return null;
  end if;
  select greatest(clock_timestamp(), max(h.valid_from)) into at
  from public.listing_price_history h where h.listing_id = new.id and h.valid_to is null;
  update public.listing_price_history h set valid_to = at where h.listing_id = new.id and h.valid_to is null;
  if new.price_pen is not null and new.price_pen > 0 then
    insert into public.listing_price_history (listing_id, price_pen, valid_from, source)
    values (new.id, new.price_pen, at,
      case when tg_op = 'INSERT' then 'created'
           when current_setting('laria.price_change_source', true) = 'campaign' then 'campaign'
           else 'change' end);
  end if;
  return null;
end;
$$;

create trigger listings_record_price_history
after insert or update of price_pen on public.listings
for each row execute function laria_private.record_listing_price_history();

revoke all on function laria_private.record_listing_price_history() from public, anon, authenticated;

-- ------------------------------------------------------------------ campaigns

create table public.laria_campaigns (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  name              text not null check (char_length(name) between 3 and 80 and name = btrim(name)),
  description       text not null default '' check (char_length(description) <= 600),
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  min_discount_pct  integer not null default 10 check (min_discount_pct between 5 and 70),
  status            text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  revision          integer not null default 1 check (revision >= 1),
  -- At most 30 days, so a card's "Antes" (list-05 shows drops of the past 30 days) lasts the whole campaign.
  constraint laria_campaigns_period check (ends_at > starts_at and ends_at - starts_at <= interval '30 days')
);
create index if not exists laria_campaigns_created_by_idx on public.laria_campaigns (created_by)
  where created_by is not null;

comment on table public.laria_campaigns is 'reach-05: Laria''s campaign pages. Written only by Admin functions.';

create table public.laria_campaign_entries (
  id                   uuid primary key default gen_random_uuid(),
  campaign_id          uuid not null references public.laria_campaigns(id) on delete cascade,
  listing_id           uuid not null references public.listings(id) on delete cascade,
  store_id             uuid not null references public.stores(id) on delete cascade,
  campaign_price_pen   integer not null check (campaign_price_pen > 0),
  -- The checked "Antes": the lowest price of the 30 days before (rechecked when the entry goes live).
  reference_price_pen  integer not null,
  -- The publication's price when the store applied; restored after the campaign when the store asked for it.
  price_before_pen     integer not null check (price_before_pen > 0),
  -- The store's explicit choice for when the campaign ends; there is no default.
  after_campaign       text not null check (after_campaign in ('restore', 'keep')),
  status               text not null default 'scheduled'
                         check (status in ('scheduled', 'live', 'ended', 'withdrawn', 'ineligible', 'removed')),
  status_reason        text check (status_reason is null or char_length(status_reason) <= 400),
  applied_at           timestamptz,
  ended_at             timestamptz,
  created_by           uuid not null references auth.users(id) on delete restrict,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint laria_campaign_entries_discount check (campaign_price_pen < reference_price_pen),
  constraint laria_campaign_entries_live check (status <> 'live' or applied_at is not null)
);
create index if not exists laria_campaign_entries_created_by_idx on public.laria_campaign_entries (created_by);

comment on table public.laria_campaign_entries is
  'reach-05: a store''s publication in a campaign, with its checked reference price. Written only by functions.';

-- A publication is in at most one campaign at a time.
create unique index laria_campaign_entries_active_idx on public.laria_campaign_entries (listing_id) where status in ('scheduled', 'live');
create index laria_campaign_entries_campaign_idx on public.laria_campaign_entries (campaign_id, status, applied_at desc);
create index laria_campaign_entries_store_idx on public.laria_campaign_entries (store_id, created_at desc);
create index if not exists laria_campaign_entries_listing_id_idx on public.laria_campaign_entries (listing_id);

alter table public.laria_campaigns enable row level security;
alter table public.laria_campaign_entries enable row level security;
revoke all on public.laria_campaigns from public, anon, authenticated;
revoke all on public.laria_campaign_entries from public, anon, authenticated;

select laria_private.ux_extend_text_check(
  'public.notifications', 'notifications_event_type_check', 'event_type',
  array['store_campaign_entry_ineligible', 'store_campaign_entry_removed']
);
select laria_private.ux_extend_text_check(
  'public.admin_audit_actions', 'admin_audit_actions_target_type_check', 'target_type',
  array['campaign', 'campaign_entry']
);

-- ------------------------------------------------------------------ helpers

create or replace function laria_private.campaign_soles(p_value integer)
returns text
language sql
immutable
as $$ select 'S/ ' || to_char(p_value, 'FM999,999,999,999') $$;

create or replace function laria_private.campaign_phase(p_campaign public.laria_campaigns)
returns text
language sql
stable
as $$
  select case
    when p_campaign.status <> 'published' then p_campaign.status
    when now() < p_campaign.starts_at then 'upcoming'
    when now() < p_campaign.ends_at then 'live'
    else 'ended' end
$$;

-- The lowest price of the 30 days before p_at and whether the history covers all of them.
create or replace function laria_private.campaign_reference(p_listing_id uuid, p_at timestamptz)
returns table (reference_price integer, covered_since timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select min(h.price_pen)::integer, min(h.valid_from)
  from public.listing_price_history h
  where h.listing_id = p_listing_id
    and h.valid_from < p_at
    and (h.valid_to is null or h.valid_to > p_at - interval '30 days')
    and (h.valid_to is null or h.valid_to > h.valid_from)
$$;

-- Why a publication cannot join (code and the store-facing message), or nulls when it can. p_campaign_price null: only
-- the publication's own conditions. Always returns the reference and the most the campaign price may be.
create or replace function laria_private.campaign_entry_problem(
  p_listing public.listings, p_campaign public.laria_campaigns, p_campaign_price integer, p_at timestamptz)
returns table (code text, message text, reference_price integer, max_campaign_price integer, eligible_from date)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ref record;
  since timestamptz;
  v_max integer;
begin
  select * into ref from laria_private.campaign_reference(p_listing.id, p_at);
  reference_price := ref.reference_price;
  v_max := case when ref.reference_price is null then null
                else floor(ref.reference_price * (100 - p_campaign.min_discount_pct) / 100.0)::integer end;
  max_campaign_price := v_max;
  since := greatest(p_listing.published_at, ref.covered_since);
  if since is not null then eligible_from := ((since + interval '30 days') at time zone 'America/Lima')::date; end if;

  if p_listing.status <> 'approved' or not public.listing_is_public(p_listing.id) or p_listing.store_id is null
     or p_listing.stock_state = 'out_of_stock' or p_listing.price_pen is null
     or (p_listing.paused_until is not null and p_listing.paused_until > (now() at time zone 'America/Lima')::date) then
    code := 'CAMPAIGN_LISTING_NOT_ELIGIBLE';
    message := 'La publicación debe estar publicada, con stock y sin pausa.';
  elsif ref.reference_price is null or since is null or since > p_at - interval '30 days' then
    code := 'CAMPAIGN_HISTORY_SHORT';
    message := 'La publicación necesita 30 días publicada con su precio registrado en Laria'
      || case when eligible_from is not null then '; podrá participar desde el ' || to_char(eligible_from, 'DD/MM/YYYY') else '' end || '.';
  elsif p_listing.price_pen > ref.reference_price then
    code := 'CAMPAIGN_PRICE_RAISED';
    message := 'El precio actual (' || laria_private.campaign_soles(p_listing.price_pen) || ') es mayor que el más bajo de los últimos 30 días ('
      || laria_private.campaign_soles(ref.reference_price) || '). Solo participa una publicación cuyo precio actual sea el más bajo de ese periodo.';
  elsif v_max is null or v_max < 1 then
    code := 'CAMPAIGN_DISCOUNT_SHORT';
    message := 'El precio es demasiado bajo para aplicar el descuento mínimo.';
  elsif p_campaign_price is not null and (p_campaign_price < 1 or p_campaign_price > v_max) then
    code := 'CAMPAIGN_DISCOUNT_SHORT';
    message := 'El precio de campaña debe ser ' || laria_private.campaign_soles(v_max) || ' o menos: al menos '
      || p_campaign.min_discount_pct || ' % menos que ' || laria_private.campaign_soles(ref.reference_price)
      || ', el precio más bajo de los últimos 30 días.';
  end if;
  return next;
end;
$$;

-- Sets a publication's price for a campaign (start or restore). The caller holds the listing lock.
create or replace function laria_private.campaign_set_price(p_listing_id uuid, p_price integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  guard text := coalesce(current_setting('app.allow_listing_admin_fields', true), '');
begin
  perform set_config('app.allow_listing_admin_fields', 'true', true);
  perform set_config('laria.price_change_source', 'campaign', true);
  update public.listings set price_pen = p_price where id = p_listing_id;
  perform set_config('laria.price_change_source', '', true);
  perform set_config('app.allow_listing_admin_fields', guard, true);
end;
$$;

create or replace function laria_private.campaign_notify_store(p_entry public.laria_campaign_entries, p_event text, p_message text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, event_type, store_id, message)
  select s.owner_user_id, p_event, s.id, left(p_message, 500)
  from public.stores s where s.id = p_entry.store_id and s.owner_user_id is not null
$$;

-- Puts a scheduled entry live: rechecks the publication at the campaign's start (or when it joined, if later) and
-- sets the campaign price. Lock order: listing, then entry.
create or replace function laria_private.campaign_apply_entry(p_entry_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  entry public.laria_campaign_entries;
  listing public.listings;
  campaign public.laria_campaigns;
  problem record;
begin
  select * into entry from public.laria_campaign_entries e where e.id = p_entry_id;
  if entry.id is null then return 'missing'; end if;
  select * into listing from public.listings l where l.id = entry.listing_id for update;
  select * into entry from public.laria_campaign_entries e where e.id = p_entry_id for update;
  select * into campaign from public.laria_campaigns c where c.id = entry.campaign_id;
  if entry.status <> 'scheduled' or laria_private.campaign_phase(campaign) <> 'live' then return entry.status; end if;

  if listing.price_pen is distinct from entry.price_before_pen then
    update public.laria_campaign_entries e set status = 'withdrawn', status_reason = 'Cambiaste el precio antes del inicio de la campaña.',
      ended_at = now(), updated_at = now() where e.id = entry.id;
    return 'withdrawn';
  end if;
  select * into problem from laria_private.campaign_entry_problem(listing, campaign, entry.campaign_price_pen, greatest(campaign.starts_at, entry.created_at));
  if problem.code is not null then
    update public.laria_campaign_entries e set status = 'ineligible', status_reason = left(problem.message, 400), ended_at = now(), updated_at = now()
    where e.id = entry.id;
    perform laria_private.campaign_notify_store(entry, 'store_campaign_entry_ineligible',
      'Tu publicación «' || left(listing.title, 80) || '» no entró a ' || campaign.name || ': ' || problem.message);
    return 'ineligible';
  end if;
  perform laria_private.campaign_set_price(listing.id, entry.campaign_price_pen);
  update public.laria_campaign_entries e set status = 'live', reference_price_pen = problem.reference_price, applied_at = now(), updated_at = now()
  where e.id = entry.id;
  return 'live';
end;
$$;

-- Closes a live or scheduled entry. A live entry whose store asked for it gets its earlier price back, unless the
-- publication's price is no longer the campaign price or it was sold.
create or replace function laria_private.campaign_close_entry(p_entry_id uuid, p_status text, p_reason text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  entry public.laria_campaign_entries;
  listing public.listings;
begin
  select * into entry from public.laria_campaign_entries e where e.id = p_entry_id;
  if entry.id is null then return 'missing'; end if;
  select * into listing from public.listings l where l.id = entry.listing_id for update;
  select * into entry from public.laria_campaign_entries e where e.id = p_entry_id for update;
  if entry.status not in ('scheduled', 'live') then return entry.status; end if;
  if entry.status = 'live' and entry.after_campaign = 'restore' and listing.price_pen = entry.campaign_price_pen
     and listing.status not in ('sold', 'archived') then
    perform laria_private.campaign_set_price(listing.id, entry.price_before_pen);
  end if;
  update public.laria_campaign_entries e set status = p_status, status_reason = left(p_reason, 400), ended_at = now(), updated_at = now()
  where e.id = entry.id;
  return p_status;
end;
$$;

create or replace function laria_private.campaign_entry_json(p_entry public.laria_campaign_entries)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_entry.id, 'campaign_id', p_entry.campaign_id, 'listing_id', p_entry.listing_id,
    'listing_title', (select l.title from public.listings l where l.id = p_entry.listing_id),
    'listing_slug', (select l.slug from public.listings l where l.id = p_entry.listing_id),
    'campaign_price_pen', p_entry.campaign_price_pen, 'reference_price_pen', p_entry.reference_price_pen,
    'price_before_pen', p_entry.price_before_pen, 'after_campaign', p_entry.after_campaign, 'status', p_entry.status,
    'status_reason', p_entry.status_reason, 'applied_at', p_entry.applied_at, 'ended_at', p_entry.ended_at,
    'created_at', p_entry.created_at)
$$;

create or replace function laria_private.campaign_json(p_campaign public.laria_campaigns)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p_campaign.id, 'slug', p_campaign.slug, 'name', p_campaign.name, 'description', p_campaign.description,
    'starts_at', p_campaign.starts_at, 'ends_at', p_campaign.ends_at, 'min_discount_pct', p_campaign.min_discount_pct,
    'status', p_campaign.status, 'phase', laria_private.campaign_phase(p_campaign), 'revision', p_campaign.revision)
$$;

-- ------------------------------------------------------------------ the job

create or replace function laria_private.run_campaign_job()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item record;
  listing public.listings;
  live integer := 0;
  ineligible integer := 0;
  ended integer := 0;
  left_campaign integer := 0;
  result text;
begin
  perform pg_advisory_xact_lock(hashtextextended('laria-campaign-job', 0));

  -- Campaigns that ended or were cancelled close their entries (restoring prices the stores asked for).
  for item in
    select e.id, c.status as campaign_status from public.laria_campaign_entries e
    join public.laria_campaigns c on c.id = e.campaign_id
    where e.status in ('scheduled', 'live') and (c.status = 'cancelled' or (c.status = 'published' and now() >= c.ends_at))
    order by e.id limit 500
  loop
    perform laria_private.campaign_close_entry(item.id, case when item.campaign_status = 'cancelled' then 'withdrawn' else 'ended' end,
      case when item.campaign_status = 'cancelled' then 'Laria canceló la campaña.' else 'La campaña terminó.' end);
    ended := ended + 1;
  end loop;

  -- A live publication whose price the store changed, or that was sold, leaves the campaign without a restore. The
  -- listing is locked before its entry, the same order as everywhere else.
  for item in
    select e.id, e.listing_id from public.laria_campaign_entries e
    join public.listings l on l.id = e.listing_id
    where e.status = 'live' and (l.price_pen is distinct from e.campaign_price_pen or l.status in ('sold', 'archived'))
    order by e.id limit 500
  loop
    select * into listing from public.listings l where l.id = item.listing_id for update;
    update public.laria_campaign_entries e set status = case when listing.status in ('sold', 'archived') then 'ended' else 'withdrawn' end,
      status_reason = case when listing.status in ('sold', 'archived') then 'La publicación se vendió o archivó.'
                           else 'Cambiaste el precio durante la campaña.' end,
      ended_at = now(), updated_at = now()
    where e.id = item.id and e.status = 'live'
      and (listing.price_pen is distinct from e.campaign_price_pen or listing.status in ('sold', 'archived'));
    if found then left_campaign := left_campaign + 1; end if;
  end loop;

  -- Entries of campaigns that are live now go live.
  for item in
    select e.id from public.laria_campaign_entries e
    join public.laria_campaigns c on c.id = e.campaign_id
    where e.status = 'scheduled' and c.status = 'published' and now() >= c.starts_at and now() < c.ends_at
    order by e.created_at, e.id limit 500
  loop
    result := laria_private.campaign_apply_entry(item.id);
    if result = 'live' then live := live + 1; elsif result = 'ineligible' then ineligible := ineligible + 1; end if;
  end loop;

  return jsonb_build_object('live', live, 'ineligible', ineligible, 'ended', ended, 'left', left_campaign);
end;
$$;

create or replace function public.run_campaign_job()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'CAMPAIGN_SERVICE_REQUIRED: Solo el servidor puede ejecutar las campañas.';
  end if;
  return laria_private.run_campaign_job();
end;
$$;

-- ------------------------------------------------------------------ stores

-- The campaigns a store can join or is in: published ones not ended, and those that ended in the last 60 days.
create or replace function public.get_store_campaigns()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_store public.stores := laria_private.reach_caller_store(false);
begin
  return coalesce((select jsonb_agg(laria_private.campaign_json(c) || jsonb_build_object('entries', coalesce((
      select jsonb_agg(laria_private.campaign_entry_json(e) order by e.created_at desc)
      from public.laria_campaign_entries e where e.campaign_id = c.id and e.store_id = caller_store.id), '[]'::jsonb))
    order by c.starts_at)
  from public.laria_campaigns c
  where c.status = 'published' and c.ends_at > now() - interval '60 days'), '[]'::jsonb);
end;
$$;

-- The store's publications for one campaign, each with its reference, the most its campaign price may be and, when it
-- cannot join, why.
create or replace function public.get_campaign_listing_options(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_store public.stores := laria_private.reach_caller_store(true);
  campaign public.laria_campaigns;
begin
  select * into campaign from public.laria_campaigns c where c.id = p_campaign_id and c.status = 'published';
  if campaign.id is null or laria_private.campaign_phase(campaign) = 'ended' then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_NOT_OPEN: Esta campaña no recibe publicaciones.';
  end if;
  return laria_private.campaign_json(campaign) || jsonb_build_object('listings', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', l.id, 'title', l.title, 'slug', l.slug, 'price_pen', l.price_pen, 'stock_state', l.stock_state,
      'reference_price_pen', p.reference_price, 'max_campaign_price_pen', p.max_campaign_price, 'eligible_from', p.eligible_from,
      'problem_code', p.code, 'problem', p.message,
      'entry', (select laria_private.campaign_entry_json(e) from public.laria_campaign_entries e
                where e.listing_id = l.id and (e.status in ('scheduled', 'live') or e.campaign_id = campaign.id)
                order by (e.status in ('scheduled', 'live')) desc, e.created_at desc limit 1))
      order by (p.code is null) desc, l.title)
    from (select x.id from public.listings x where x.store_id = caller_store.id and x.status = 'approved' order by x.title limit 300) ids
    join public.listings l on l.id = ids.id
    cross join lateral laria_private.campaign_entry_problem(l, campaign, null, now()) p), '[]'::jsonb));
end;
$$;

create or replace function public.join_campaign(p_campaign_id uuid, p_listing_id uuid, p_campaign_price integer, p_after_campaign text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_store public.stores := laria_private.reach_caller_store(true);
  campaign public.laria_campaigns;
  listing public.listings;
  problem record;
  created public.laria_campaign_entries;
begin
  if p_after_campaign is null or p_after_campaign not in ('restore', 'keep') then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_AFTER_REQUIRED: Elige qué pasa con el precio cuando termine la campaña.';
  end if;
  if p_campaign_price is null or p_campaign_price < 1 then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_PRICE_INVALID: Escribe el precio de campaña en soles.';
  end if;
  select * into campaign from public.laria_campaigns c where c.id = p_campaign_id and c.status = 'published';
  if campaign.id is null or laria_private.campaign_phase(campaign) not in ('upcoming', 'live') then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_NOT_OPEN: Esta campaña no recibe publicaciones.';
  end if;
  select * into listing from public.listings l where l.id = p_listing_id and l.store_id = caller_store.id for update;
  if listing.id is null then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_LISTING_NOT_ELIGIBLE: No encontramos esa publicación en tu tienda.';
  end if;
  if exists (select 1 from public.laria_campaign_entries e where e.listing_id = listing.id and e.status in ('scheduled', 'live')) then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_ALREADY_IN: Esta publicación ya está en una campaña.';
  end if;
  select * into problem from laria_private.campaign_entry_problem(listing, campaign, p_campaign_price, now());
  if problem.code is not null then
    raise exception using errcode = 'P0001', message = problem.code || ': ' || problem.message;
  end if;
  insert into public.laria_campaign_entries (campaign_id, listing_id, store_id, campaign_price_pen, reference_price_pen, price_before_pen,
    after_campaign, created_by)
  values (campaign.id, listing.id, caller_store.id, p_campaign_price, problem.reference_price, listing.price_pen, p_after_campaign, auth.uid())
  returning * into created;
  if laria_private.campaign_phase(campaign) = 'live' then
    perform laria_private.campaign_apply_entry(created.id);
    select * into created from public.laria_campaign_entries e where e.id = created.id;
  end if;
  return laria_private.campaign_entry_json(created);
end;
$$;

create or replace function public.withdraw_campaign_entry(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_store public.stores := laria_private.reach_caller_store(false);
  entry public.laria_campaign_entries;
begin
  select * into entry from public.laria_campaign_entries e where e.id = p_entry_id and e.store_id = caller_store.id;
  if entry.id is null or entry.status not in ('scheduled', 'live') then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_ENTRY_NOT_FOUND: Esta publicación ya no está en la campaña.';
  end if;
  perform laria_private.campaign_close_entry(entry.id, 'withdrawn', 'Retirada por tu tienda.');
  select * into entry from public.laria_campaign_entries e where e.id = p_entry_id;
  return laria_private.campaign_entry_json(entry);
end;
$$;

-- ------------------------------------------------------------------ Admin

create or replace function laria_private.campaign_require_admin()
returns void
language plpgsql
stable
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED: Solo Admin puede administrar campañas.';
  end if;
end;
$$;

create or replace function public.admin_get_campaigns()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform laria_private.campaign_require_admin();
  return coalesce((select jsonb_agg(laria_private.campaign_json(c) || jsonb_build_object(
      'entries', (select count(*) from public.laria_campaign_entries e where e.campaign_id = c.id),
      'live_entries', (select count(*) from public.laria_campaign_entries e where e.campaign_id = c.id and e.status = 'live'),
      'scheduled_entries', (select count(*) from public.laria_campaign_entries e where e.campaign_id = c.id and e.status = 'scheduled'))
    order by c.starts_at desc)
  from public.laria_campaigns c), '[]'::jsonb);
end;
$$;

create or replace function public.admin_get_campaign(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  campaign public.laria_campaigns;
begin
  perform laria_private.campaign_require_admin();
  select * into campaign from public.laria_campaigns c where c.id = p_id;
  if campaign.id is null then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_NOT_FOUND: No encontramos esa campaña.';
  end if;
  return laria_private.campaign_json(campaign) || jsonb_build_object('entries', coalesce((
    select jsonb_agg(laria_private.campaign_entry_json(e) || jsonb_build_object('store_name', s.name, 'store_slug', s.slug)
      order by e.created_at desc)
    from public.laria_campaign_entries e join public.stores s on s.id = e.store_id where e.campaign_id = campaign.id), '[]'::jsonb));
end;
$$;

-- Creates (p_id null) or edits a campaign. Dates and the minimum discount can change only before it starts.
create or replace function public.admin_save_campaign(
  p_id uuid, p_slug text, p_name text, p_description text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_min_discount_pct integer, p_expected_revision integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign public.laria_campaigns;
  v_name text := btrim(coalesce(p_name, ''));
  v_slug text := btrim(lower(coalesce(p_slug, '')));
  v_description text := btrim(coalesce(p_description, ''));
begin
  perform laria_private.campaign_require_admin();
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) not between 3 and 60 then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_SLUG_INVALID: La dirección usa minúsculas, números y guiones (3 a 60).';
  end if;
  if char_length(v_name) not between 3 and 80 or char_length(v_description) > 600 then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_TEXT_INVALID: El nombre tiene 3 a 80 caracteres y la descripción hasta 600.';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at or p_ends_at - p_starts_at > interval '30 days' then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_DATES_INVALID: La campaña dura como máximo 30 días y termina después de empezar.';
  end if;
  if p_min_discount_pct is null or p_min_discount_pct not between 5 and 70 then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_DISCOUNT_INVALID: El descuento mínimo va de 5 % a 70 %.';
  end if;
  if exists (select 1 from public.laria_campaigns c where c.slug = v_slug and c.id is distinct from p_id) then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_SLUG_TAKEN: Ya existe una campaña con esa dirección.';
  end if;

  if p_id is null then
    insert into public.laria_campaigns (slug, name, description, starts_at, ends_at, min_discount_pct, created_by)
    values (v_slug, v_name, v_description, p_starts_at, p_ends_at, p_min_discount_pct, auth.uid())
    returning * into campaign;
    insert into public.admin_audit_actions (admin_user_id, action, target_type, target_id, detail)
    values (auth.uid(), 'campaign_created', 'campaign', campaign.id, laria_private.campaign_json(campaign));
    return laria_private.campaign_json(campaign);
  end if;

  select * into campaign from public.laria_campaigns c where c.id = p_id for update;
  if campaign.id is null then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_NOT_FOUND: No encontramos esa campaña.';
  end if;
  if campaign.revision is distinct from p_expected_revision then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_STALE: La campaña cambió. Vuelve a cargar la página.';
  end if;
  if campaign.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_NOT_EDITABLE: Una campaña cancelada no se edita.';
  end if;
  if (campaign.status = 'published' and now() >= campaign.starts_at)
     and (p_starts_at <> campaign.starts_at or p_ends_at <> campaign.ends_at or p_min_discount_pct <> campaign.min_discount_pct or v_slug <> campaign.slug) then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_NOT_EDITABLE: Después del inicio solo cambian el nombre y la descripción.';
  end if;
  if campaign.status = 'published' and now() < campaign.starts_at and p_starts_at <= now() then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_DATES_INVALID: Una campaña publicada debe empezar en el futuro.';
  end if;
  update public.laria_campaigns c set slug = v_slug, name = v_name, description = v_description, starts_at = p_starts_at,
    ends_at = p_ends_at, min_discount_pct = p_min_discount_pct, updated_at = now(), revision = c.revision + 1
  where c.id = p_id
  returning * into campaign;
  insert into public.admin_audit_actions (admin_user_id, action, target_type, target_id, detail)
  values (auth.uid(), 'campaign_updated', 'campaign', campaign.id, laria_private.campaign_json(campaign));
  return laria_private.campaign_json(campaign);
end;
$$;

-- draft → published (it must start in the future), published → cancelled (the job closes its entries and restores the
-- prices stores asked for), published → draft while it has no entries and has not started.
create or replace function public.admin_set_campaign_status(p_id uuid, p_status text, p_expected_revision integer, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign public.laria_campaigns;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform laria_private.campaign_require_admin();
  select * into campaign from public.laria_campaigns c where c.id = p_id for update;
  if campaign.id is null then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_NOT_FOUND: No encontramos esa campaña.';
  end if;
  if campaign.revision is distinct from p_expected_revision then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_STALE: La campaña cambió. Vuelve a cargar la página.';
  end if;
  if not ((campaign.status = 'draft' and p_status = 'published' and campaign.starts_at > now())
       or (campaign.status = 'published' and p_status = 'cancelled' and now() < campaign.ends_at)
       or (campaign.status = 'published' and p_status = 'draft' and now() < campaign.starts_at
           and not exists (select 1 from public.laria_campaign_entries e where e.campaign_id = campaign.id))) then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_STATUS_INVALID: Ese cambio de estado no es posible ahora.';
  end if;
  if p_status = 'cancelled' and (v_reason is null or char_length(v_reason) < 3) then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_REASON_REQUIRED: Escribe el motivo de la cancelación.';
  end if;
  update public.laria_campaigns c set status = p_status, updated_at = now(), revision = c.revision + 1 where c.id = p_id
  returning * into campaign;
  insert into public.admin_audit_actions (admin_user_id, action, target_type, target_id, detail)
  values (auth.uid(), 'campaign_' || p_status, 'campaign', campaign.id, jsonb_build_object('reason', v_reason));
  return laria_private.campaign_json(campaign);
end;
$$;

create or replace function public.admin_remove_campaign_entry(p_entry_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  entry public.laria_campaign_entries;
  campaign public.laria_campaigns;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform laria_private.campaign_require_admin();
  if v_reason is null or char_length(v_reason) not between 3 and 400 then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_REASON_REQUIRED: Escribe el motivo; la tienda lo verá.';
  end if;
  select * into entry from public.laria_campaign_entries e where e.id = p_entry_id;
  if entry.id is null or entry.status not in ('scheduled', 'live') then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_ENTRY_NOT_FOUND: Esta publicación ya no está en la campaña.';
  end if;
  perform laria_private.campaign_close_entry(entry.id, 'removed', v_reason);
  select * into entry from public.laria_campaign_entries e where e.id = p_entry_id;
  select * into campaign from public.laria_campaigns c where c.id = entry.campaign_id;
  insert into public.admin_audit_actions (admin_user_id, action, target_type, target_id, detail)
  values (auth.uid(), 'campaign_entry_removed', 'campaign_entry', entry.id,
    jsonb_build_object('campaign_id', entry.campaign_id, 'listing_id', entry.listing_id, 'reason', v_reason));
  perform laria_private.campaign_notify_store(entry, 'store_campaign_entry_removed',
    'Laria retiró una publicación de ' || campaign.name || ': ' || v_reason);
  return laria_private.campaign_json(campaign) || jsonb_build_object('entry', laria_private.campaign_entry_json(entry));
end;
$$;

-- ------------------------------------------------------------------ public

-- Published campaigns that are coming, live or ended in the last 60 days, with how many publications are in them now.
create or replace function public.get_public_campaigns()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(laria_private.campaign_json(c) || jsonb_build_object('live_entries', (
      select count(*) from public.laria_campaign_entries e join public.listings l on l.id = e.listing_id
      where e.campaign_id = c.id and e.status = 'live' and l.price_pen = e.campaign_price_pen
        and l.status = 'approved' and coalesce(l.stock_state, 'in_stock') = 'in_stock'))
    order by c.starts_at), '[]'::jsonb)
  from public.laria_campaigns c
  where c.status = 'published' and c.ends_at > now() - interval '60 days'
$$;

-- One campaign and a page of its live publications (in stock, at the campaign price), the latest to join first.
create or replace function public.get_public_campaign(p_slug text, p_offset integer default 0, p_limit integer default 24)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with campaign as (
    select * from public.laria_campaigns c where c.slug = p_slug and c.status = 'published'
  ),
  live as (
    select e.listing_id, e.campaign_price_pen, e.reference_price_pen, e.applied_at
    from campaign c
    join public.laria_campaign_entries e on e.campaign_id = c.id and e.status = 'live'
    join public.listings l on l.id = e.listing_id
    where l.price_pen = e.campaign_price_pen and l.status = 'approved' and coalesce(l.stock_state, 'in_stock') = 'in_stock'
      and public.listing_is_public(l.id)
  )
  select case when not exists (select 1 from campaign) then null else
    (select laria_private.campaign_json(c) from campaign c) || jsonb_build_object(
      'total', (select count(*) from live),
      'entries', coalesce((select jsonb_agg(jsonb_build_object('listing_id', page.listing_id, 'campaign_price_pen', page.campaign_price_pen,
          'reference_price_pen', page.reference_price_pen, 'applied_at', page.applied_at) order by page.applied_at desc, page.listing_id)
        from (select * from live order by applied_at desc, listing_id
              offset greatest(coalesce(p_offset, 0), 0) limit greatest(1, least(coalesce(p_limit, 24), 48))) page), '[]'::jsonb))
  end
$$;

-- Every publication in a live campaign, for the line on its page. One small public list the site reads once and shares
-- for ten minutes (lib/campaigns-server.ts), so a listing page adds no query per visit; the page shows the line only
-- while the publication's price is still the campaign price.
create or replace function public.get_live_campaign_marks()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('listing_id', e.listing_id, 'slug', c.slug, 'name', c.name, 'ends_at', c.ends_at,
      'campaign_price_pen', e.campaign_price_pen, 'reference_price_pen', e.reference_price_pen) order by e.listing_id), '[]'::jsonb)
  from (select * from public.laria_campaign_entries x where x.status = 'live' order by x.applied_at desc limit 5000) e
  join public.laria_campaigns c on c.id = e.campaign_id and c.status = 'published' and now() < c.ends_at
  join public.listings l on l.id = e.listing_id
  where l.price_pen = e.campaign_price_pen and l.status = 'approved'
$$;

-- ------------------------------------------------------------------ grants and schedule

revoke all on function laria_private.campaign_soles(integer) from public, anon, authenticated;
revoke all on function laria_private.campaign_phase(public.laria_campaigns) from public, anon, authenticated;
revoke all on function laria_private.campaign_reference(uuid, timestamptz) from public, anon, authenticated;
revoke all on function laria_private.campaign_entry_problem(public.listings, public.laria_campaigns, integer, timestamptz) from public, anon, authenticated;
revoke all on function laria_private.campaign_set_price(uuid, integer) from public, anon, authenticated;
revoke all on function laria_private.campaign_notify_store(public.laria_campaign_entries, text, text) from public, anon, authenticated;
revoke all on function laria_private.campaign_apply_entry(uuid) from public, anon, authenticated;
revoke all on function laria_private.campaign_close_entry(uuid, text, text) from public, anon, authenticated;
revoke all on function laria_private.campaign_entry_json(public.laria_campaign_entries) from public, anon, authenticated;
revoke all on function laria_private.campaign_json(public.laria_campaigns) from public, anon, authenticated;
revoke all on function laria_private.run_campaign_job() from public, anon, authenticated;
revoke all on function laria_private.campaign_require_admin() from public, anon, authenticated;
revoke all on function public.run_campaign_job() from public, anon, authenticated;
revoke all on function public.get_store_campaigns() from public, anon, authenticated;
revoke all on function public.get_campaign_listing_options(uuid) from public, anon, authenticated;
revoke all on function public.join_campaign(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.withdraw_campaign_entry(uuid) from public, anon, authenticated;
revoke all on function public.admin_get_campaigns() from public, anon, authenticated;
revoke all on function public.admin_get_campaign(uuid) from public, anon, authenticated;
revoke all on function public.admin_save_campaign(uuid, text, text, text, timestamptz, timestamptz, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_set_campaign_status(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.admin_remove_campaign_entry(uuid, text) from public, anon, authenticated;
revoke all on function public.get_public_campaigns() from public, anon, authenticated;
revoke all on function public.get_public_campaign(text, integer, integer) from public, anon, authenticated;
revoke all on function public.get_live_campaign_marks() from public, anon, authenticated;
grant execute on function public.run_campaign_job() to service_role;
grant execute on function public.get_store_campaigns() to authenticated;
grant execute on function public.get_campaign_listing_options(uuid) to authenticated;
grant execute on function public.join_campaign(uuid, uuid, integer, text) to authenticated;
grant execute on function public.withdraw_campaign_entry(uuid) to authenticated;
grant execute on function public.admin_get_campaigns() to authenticated;
grant execute on function public.admin_get_campaign(uuid) to authenticated;
grant execute on function public.admin_save_campaign(uuid, text, text, text, timestamptz, timestamptz, integer, integer) to authenticated;
grant execute on function public.admin_set_campaign_status(uuid, text, integer, text) to authenticated;
grant execute on function public.admin_remove_campaign_entry(uuid, text) to authenticated;
grant execute on function public.get_public_campaigns() to anon, authenticated;
grant execute on function public.get_public_campaign(text, integer, integer) to anon, authenticated;
grant execute on function public.get_live_campaign_marks() to anon, authenticated;

-- Every 10 minutes: entries go live at the campaign's start and close at its end within that window. Idempotent.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'laria-campaigns') then
    perform cron.unschedule('laria-campaigns');
  end if;
  perform cron.schedule('laria-campaigns', '*/10 * * * *', 'select laria_private.run_campaign_job()');
end;
$$;
