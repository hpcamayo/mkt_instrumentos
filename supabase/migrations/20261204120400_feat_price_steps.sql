-- Selling tools, sell-04 "Bajada automática" (docs/feature-ideas/selling-tools.md). The seller sets a floor and a
-- pace ("5% cada semana sin contactos"); a daily job lowers the public price one step at a time and stops at the floor,
-- a sale, or when the seller pauses or removes it. Each step is an ordinary price change, so people who saved the
-- listing hear about it through the existing price-drop alerts (notify_favorite_price_drop, at most once a day) and
-- the listing shows "Antes" by the existing rules. Listings whose stock comes from Inventario are left out: their
-- price follows the SKU.

create table public.listing_price_steps (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  floor_pen integer not null check (floor_pen >= 1),
  step_percent integer not null check (step_percent in (5, 10)),
  interval_days integer not null check (interval_days in (7, 14)),
  -- Skip a step when someone wrote by WhatsApp since the previous one.
  only_without_contacts boolean not null default true,
  status text not null default 'active' check (status in ('active', 'paused', 'finished')),
  finished_reason text check (finished_reason is null or finished_reason in ('floor', 'sold', 'unavailable')),
  start_price_pen integer not null check (start_price_pen >= 1),
  steps_taken integer not null default 0,
  next_step_at timestamptz not null,
  last_step_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_price_steps_floor_check check (floor_pen < start_price_pen),
  constraint listing_price_steps_finished_check check ((status = 'finished') = (finished_reason is not null))
);

create index listing_price_steps_due_idx on public.listing_price_steps(next_step_at) where status = 'active';
create index listing_price_steps_owner_idx on public.listing_price_steps(owner_user_id);

create trigger listing_price_steps_set_updated_at
before update on public.listing_price_steps
for each row execute function public.set_updated_at();

alter table public.listing_price_steps enable row level security;

create policy "Owners read own price steps"
on public.listing_price_steps for select to authenticated
using (owner_user_id = (select auth.uid()));

revoke all on public.listing_price_steps from anon;
revoke insert, update, delete, truncate, references, trigger on public.listing_price_steps from authenticated;
grant select on public.listing_price_steps to authenticated;

-- The next price a rule gives: one step down, never below the floor, in whole soles.
create or replace function public.listing_price_step_next(p_price integer, p_floor integer, p_percent integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(p_floor, floor(p_price::numeric * (100 - p_percent) / 100)::integer);
$$;

grant execute on function public.listing_price_step_next(integer, integer, integer) to anon, authenticated;

create or replace function public.set_listing_price_steps(
  p_listing_id uuid,
  p_floor_pen integer,
  p_step_percent integer,
  p_interval_days integer,
  p_only_without_contacts boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  uid uuid := auth.uid();
  v_listing public.listings%rowtype;
  saved public.listing_price_steps%rowtype;
begin
  if uid is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED: Inicia sesión para continuar.';
  end if;
  select * into v_listing from public.listings where id = p_listing_id and owner_user_id = uid for update;
  if not found then
    raise exception 'LISTING_NOT_OWNED: No encontramos esa publicación en tu cuenta.';
  end if;
  if v_listing.status <> 'approved' then
    raise exception 'PRICE_STEPS_NOT_PUBLIC: La bajada automática funciona en publicaciones en línea.';
  end if;
  if exists (select 1 from public.store_inventory_items i where i.listing_id = v_listing.id) then
    raise exception 'PRICE_STEPS_STOCK_MANAGED: El precio de esta publicación sigue al de tu Inventario.';
  end if;
  if p_step_percent is null or p_step_percent not in (5, 10) or p_interval_days is null or p_interval_days not in (7, 14) then
    raise exception 'PRICE_STEPS_PACE_INVALID: Elige 5%% o 10%%, cada 7 o 14 días.';
  end if;
  if p_floor_pen is null or p_floor_pen >= v_listing.price_pen then
    raise exception 'PRICE_STEPS_FLOOR_INVALID: El precio mínimo debe ser menor que el precio actual.';
  end if;
  -- A floor under a fifth of the price is almost always a typo (S/ 15 instead of S/ 1500).
  if p_floor_pen * 5 < v_listing.price_pen then
    raise exception 'PRICE_STEPS_FLOOR_TOO_LOW: El precio mínimo no puede ser menor al 20%% del precio actual.';
  end if;
  insert into public.listing_price_steps(
    listing_id, owner_user_id, floor_pen, step_percent, interval_days, only_without_contacts, status, finished_reason,
    start_price_pen, steps_taken, next_step_at, last_step_at
  ) values (
    v_listing.id, uid, p_floor_pen, p_step_percent, p_interval_days, coalesce(p_only_without_contacts, true), 'active', null,
    v_listing.price_pen, 0, now() + make_interval(days => p_interval_days), null
  )
  on conflict (listing_id) do update
    set floor_pen = excluded.floor_pen, step_percent = excluded.step_percent, interval_days = excluded.interval_days,
        only_without_contacts = excluded.only_without_contacts, status = 'active', finished_reason = null,
        start_price_pen = excluded.start_price_pen, steps_taken = 0, next_step_at = excluded.next_step_at, last_step_at = null
  returning * into saved;
  return to_jsonb(saved);
end;
$$;

-- Pause keeps the rule; resuming counts a full interval from now.
create or replace function public.pause_listing_price_steps(p_listing_id uuid, p_paused boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare saved public.listing_price_steps%rowtype;
begin
  update public.listing_price_steps
  set status = case when p_paused then 'paused' else 'active' end,
      next_step_at = case when p_paused then next_step_at else now() + make_interval(days => interval_days) end
  where listing_id = p_listing_id and owner_user_id = auth.uid() and status in ('active', 'paused')
  returning * into saved;
  if saved.listing_id is null then
    raise exception 'PRICE_STEPS_NOT_FOUND: Esa bajada automática ya terminó.';
  end if;
  return to_jsonb(saved);
end;
$$;

create or replace function public.delete_listing_price_steps(p_listing_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.listing_price_steps where listing_id = p_listing_id and owner_user_id = auth.uid();
  return found;
end;
$$;

revoke all on function public.set_listing_price_steps(uuid, integer, integer, integer, boolean),
  public.pause_listing_price_steps(uuid, boolean), public.delete_listing_price_steps(uuid) from public, anon;
grant execute on function public.set_listing_price_steps(uuid, integer, integer, integer, boolean),
  public.pause_listing_price_steps(uuid, boolean), public.delete_listing_price_steps(uuid) to authenticated;

-- The daily job: every due rule takes at most one step per run, so running it twice in a day changes nothing more.
-- Lock order: the listing, then its rule.
create or replace function laria_private.run_listing_price_steps(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  candidate uuid;
  v_listing public.listings%rowtype;
  v_rule public.listing_price_steps%rowtype;
  v_new integer;
  v_today date := (now() at time zone 'America/Lima')::date;
  v_previous text;
  v_steps integer := 0;
begin
  for candidate in
    select listing_id from public.listing_price_steps
    where status = 'active' and next_step_at <= now()
    order by next_step_at, listing_id
    limit greatest(1, least(coalesce(p_limit, 200), 1000))
  loop
    select * into v_listing from public.listings where id = candidate for update;
    select * into v_rule from public.listing_price_steps where listing_id = candidate for update;
    if v_rule.listing_id is null or v_rule.status <> 'active' or v_rule.next_step_at > now() then
      continue;
    end if;
    if v_listing.id is null or v_listing.status in ('archived', 'rejected')
      or exists (select 1 from public.store_inventory_items i where i.listing_id = candidate) then
      update public.listing_price_steps set status = 'finished', finished_reason = 'unavailable' where listing_id = candidate;
      continue;
    end if;
    if v_listing.status = 'sold' then
      update public.listing_price_steps set status = 'finished', finished_reason = 'sold' where listing_id = candidate;
      continue;
    end if;
    if v_listing.price_pen <= v_rule.floor_pen then
      update public.listing_price_steps set status = 'finished', finished_reason = 'floor' where listing_id = candidate;
      continue;
    end if;
    -- Not public right now (in review, hidden, or paused by the seller): try again tomorrow.
    if v_listing.status <> 'approved' or public.listing_is_paused(v_listing.paused_until) or v_listing.stock_state = 'out_of_stock' then
      update public.listing_price_steps set next_step_at = now() + interval '1 day' where listing_id = candidate;
      continue;
    end if;
    -- Someone wrote since the previous step: the price is doing its job, so this step is skipped.
    if v_rule.only_without_contacts and exists (
      select 1 from public.marketplace_events e
      where e.listing_id = candidate and e.event_type = 'whatsapp_contact'
        and e.created_at > coalesce(v_rule.last_step_at, v_rule.created_at)
        and e.actor_user_id is distinct from v_listing.owner_user_id
    ) then
      update public.listing_price_steps
      set next_step_at = now() + make_interval(days => interval_days), last_step_at = now()
      where listing_id = candidate;
      perform laria_private.selling_notify(v_listing.owner_user_id, 'listing_price_step',
        format('No bajamos “%s” esta vez: te escribieron desde la última revisión. Seguimos en %s días.', v_listing.title, v_rule.interval_days),
        candidate, v_listing.store_id);
      continue;
    end if;

    v_new := public.listing_price_step_next(v_listing.price_pen, v_rule.floor_pen, v_rule.step_percent);
    if v_new >= v_listing.price_pen then
      update public.listing_price_steps set status = 'finished', finished_reason = 'floor' where listing_id = candidate;
      continue;
    end if;
    v_previous := current_setting('app.allow_listing_admin_fields', true);
    perform set_config('app.allow_listing_admin_fields', 'true', true);
    update public.listings set price_pen = v_new where id = candidate;
    perform set_config('app.allow_listing_admin_fields', coalesce(v_previous, ''), true);
    update public.listing_price_steps
    set steps_taken = steps_taken + 1, last_step_at = now(),
        next_step_at = now() + make_interval(days => interval_days),
        status = case when v_new <= floor_pen then 'finished' else 'active' end,
        finished_reason = case when v_new <= floor_pen then 'floor' else null end
    where listing_id = candidate;
    perform laria_private.selling_notify(v_listing.owner_user_id, 'listing_price_step',
      case when v_new <= v_rule.floor_pen
        then format('Bajamos “%s” de S/ %s a S/ %s y llegó a tu precio mínimo: la bajada automática terminó.',
          v_listing.title, to_char(v_listing.price_pen, 'FM999G999G999'), to_char(v_new, 'FM999G999G999'))
        else format('Bajamos “%s” de S/ %s a S/ %s, como lo programaste. Próxima revisión en %s días.',
          v_listing.title, to_char(v_listing.price_pen, 'FM999G999G999'), to_char(v_new, 'FM999G999G999'), v_rule.interval_days) end,
      candidate, v_listing.store_id);
    v_steps := v_steps + 1;
  end loop;
  return v_steps;
end;
$$;

revoke all on function laria_private.run_listing_price_steps(integer) from public, anon, authenticated;
