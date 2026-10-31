-- Selling tools: the daily jobs (docs/feature-ideas/selling-tools.md). Each one is idempotent and safe to run more than
-- once a day; app/api/internal/jobs/<name>/route.ts calls them with the service role.
--   price-steps     laria_private.run_listing_price_steps (sell-04)
--   gear-reminders  laria_private.run_gear_reminders (buy-06)
--   trade-offers    laria_private.run_trade_request_expiry and the orphan photo list (sell-02, run-04)

-- buy-06: every reminder due today, once. It names up to three active stores of the person's region that said they
-- stock that consumable, the person's city first and verified stores first; never a promoted or paid placement.
create or replace function laria_private.run_gear_reminders(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  v_today date := (now() at time zone 'America/Lima')::date;
  v_reminder public.gear_reminders%rowtype;
  v_item public.gear_items%rowtype;
  v_person public.profiles%rowtype;
  v_stores jsonb;
  v_what text;
  v_message text;
  v_notification uuid;
  v_sent integer := 0;
begin
  for v_reminder in
    select * from public.gear_reminders
    where next_due_on <= v_today and (last_sent_on is null or last_sent_on < v_today)
    order by next_due_on, gear_item_id
    limit greatest(1, least(coalesce(p_limit, 500), 2000))
    for update skip locked
  loop
    select * into v_item from public.gear_items where id = v_reminder.gear_item_id;
    select * into v_person from public.profiles where id = v_reminder.user_id;
    select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'slug', s.slug, 'city', s.city, 'district', s.district,
        'is_verified', s.is_verified) order by s.rank), '[]'::jsonb)
    into v_stores
    from (
      select st.*, row_number() over (
        order by (lower(trim(coalesce(st.city, ''))) = lower(trim(coalesce(v_person.city, '')))) desc, st.is_verified desc, st.name
      ) as rank
      from public.stores st
      join public.store_trade_settings ts on ts.store_id = st.id
      where st.status = 'active' and v_reminder.kind = any(ts.consumables)
        and lower(trim(st.region)) = lower(trim(coalesce(v_person.region, '')))
    ) s
    where s.rank <= 3;
    v_what := case v_reminder.kind when 'strings' then 'las cuerdas' when 'reeds' then 'las cañas' else 'los parches' end;
    v_message := format('¿Toca cambiar %s de tu %s? Ya pasaron %s %s desde el último cambio.',
      v_what, v_item.title, v_reminder.every_months, case when v_reminder.every_months = 1 then 'mes' else 'meses' end);
    if jsonb_array_length(v_stores) > 0 then
      v_message := v_message || ' Las tienen: ' || (select string_agg(value->>'name', ', ') from jsonb_array_elements(v_stores)) || '.';
    end if;
    v_notification := laria_private.selling_notify(v_reminder.user_id, 'gear_reminder_due', v_message, null, null);
    perform laria_private.enqueue_marketplace_email(
      'gear_reminder_due', v_reminder.user_id, 'gear_reminder:' || v_reminder.gear_item_id::text || ':' || v_reminder.next_due_on::text,
      v_notification, null, null,
      p_context => jsonb_build_object('selling', jsonb_build_object(
        'kind', v_reminder.kind, 'title', v_item.title, 'months', v_reminder.every_months,
        'gear_id', v_reminder.gear_item_id, 'stores', v_stores))
    );
    update public.gear_reminders
    set last_sent_on = v_today,
        next_due_on = greatest((next_due_on + make_interval(months => every_months))::date, v_today + 1)
    where gear_item_id = v_reminder.gear_item_id;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;

-- sell-02 / run-04: requests nobody chose in time expire (the stores that offered are told), and accepted requests the
-- store never closed are closed 30 days after the drop-off date.
create or replace function laria_private.run_trade_request_expiry(p_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  v_request public.trade_requests%rowtype;
  v_today date := (now() at time zone 'America/Lima')::date;
  v_offers integer;
  v_expired integer := 0;
  v_closed integer := 0;
  other record;
begin
  for v_request in
    select * from public.trade_requests
    where status = 'open' and decide_until <= now()
    order by decide_until, id
    limit greatest(1, least(coalesce(p_limit, 500), 2000))
    for update skip locked
  loop
    update public.trade_requests set status = 'expired', closed_at = now(), close_reason = 'Venció sin elegir una oferta.'
    where id = v_request.id;
    v_offers := 0;
    for other in
      update public.trade_offers o set status = 'declined' where o.request_id = v_request.id and o.status = 'sent' returning o.store_id
    loop
      v_offers := v_offers + 1;
      perform laria_private.selling_notify((select owner_user_id from public.stores where id = other.store_id), 'store_trade_update',
        format('El pedido por %s venció sin que eligieran una oferta.', v_request.title), v_request.listing_id, other.store_id);
    end loop;
    perform laria_private.selling_notify(v_request.requester_user_id, 'gear_trade_update',
      case when v_offers > 0
        then format('Tu pedido por %s venció sin que eligieras una oferta. Puedes enviarlo de nuevo cuando quieras.', v_request.title)
        else format('Tu pedido por %s venció sin ofertas. Puedes publicarlo en Laria o intentarlo más adelante.', v_request.title) end,
      null, null);
    v_expired := v_expired + 1;
  end loop;

  with stale as (
    select id from public.trade_requests
    where status = 'accepted' and drop_off_by < v_today - 30
    order by drop_off_by, id
    limit greatest(1, least(coalesce(p_limit, 500), 2000))
    for update skip locked
  )
  update public.trade_requests r
  set status = 'not_completed', closed_at = now(), close_reason = 'La tienda no registró el resultado.'
  from stale where r.id = stale.id;
  get diagnostics v_closed = row_count;

  return jsonb_build_object('expired', v_expired, 'closed', v_closed);
end;
$$;

-- Photos uploaded for a request that was never sent, after two days, and the photos of requests closed more than 90 days
-- ago (the request keeps its text and amounts). The route removes them through Storage.
create or replace function laria_private.trade_photo_orphans(p_limit integer default 200)
returns text[]
language sql
stable
security definer
set search_path = public, storage
as $$
  select coalesce(array_agg(name), '{}')
  from (
    select o.name
    from storage.objects o
    where o.bucket_id = 'trade-photos' and (
      (o.created_at < now() - interval '2 days'
        and not exists (select 1 from public.trade_requests r where r.id::text = (storage.foldername(o.name))[2]))
      or exists (select 1 from public.trade_requests r
        where r.id::text = (storage.foldername(o.name))[2] and r.closed_at < now() - interval '90 days'))
    order by o.created_at
    limit greatest(1, least(coalesce(p_limit, 200), 1000))
  ) rows;
$$;

revoke all on function laria_private.run_gear_reminders(integer), laria_private.run_trade_request_expiry(integer),
  laria_private.trade_photo_orphans(integer) from public, anon, authenticated;

-- The service-role entry points the internal job routes call.
create or replace function public.run_selling_job(p_job text, p_limit integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_REQUIRED';
  end if;
  return case p_job
    when 'price-steps' then jsonb_build_object('steps', laria_private.run_listing_price_steps(coalesce(p_limit, 200)))
    when 'gear-reminders' then jsonb_build_object('sent', laria_private.run_gear_reminders(coalesce(p_limit, 500)))
    when 'trade-offers' then laria_private.run_trade_request_expiry(coalesce(p_limit, 500))
      || jsonb_build_object('orphan_photos', to_jsonb(laria_private.trade_photo_orphans(200)))
    else null
  end;
end;
$$;

revoke all on function public.run_selling_job(text, integer) from public, anon, authenticated;
grant execute on function public.run_selling_job(text, integer) to service_role;
