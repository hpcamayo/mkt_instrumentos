-- Effortless Laria, batch "my-listings": what the account home and the statistics pages read
-- (docs/ux-effortless/my-listings.md).
--
--   * big-09 / stock-01  get_account_pendientes(): the caller's to-do list in one call, read from existing tables.
--   * mine-11 / shop-07  get_listing_statistics(): per-listing numbers for a period, a 12-week trend and the
--                        listings with contacts but no sale in 30 days.
--   * mine-09            the buyer list shows the last three digits of each eligible buyer's WhatsApp.
--   * trust-04           the transaction detail says whether this is the seller's first verified sale.

-- ------------------------------------------------------------------ big-09 Pendientes

create or replace function public.get_account_pendientes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, laria_private
as $$
declare
  me uuid := auth.uid();
  owner_store public.stores;
  buyer jsonb;
  seller jsonb;
  store_part jsonb := null;
  enabled boolean := false;
begin
  if me is null then raise exception using errcode = '42501', message = 'ACCOUNT_AUTH_REQUIRED'; end if;

  select jsonb_build_object(
    'pending_claims', coalesce((
      select jsonb_agg(jsonb_build_object('reference_id', c.id, 'listing_id', c.listing_id, 'title', l.title, 'requested_at', c.created_at) order by c.created_at)
      from public.transaction_claims c join public.listings l on l.id = c.listing_id
      where c.buyer_user_id = me and c.status = 'pending'), '[]'::jsonb),
    'reviews_due', coalesce((
      select jsonb_agg(jsonb_build_object('reference_id', t.id, 'listing_id', t.listing_id, 'title', l.title, 'deadline', t.review_deadline,
        'role', case when t.buyer_user_id = me then 'buyer' else 'seller' end) order by t.review_deadline)
      from public.verified_transactions t join public.listings l on l.id = t.listing_id
      where (t.buyer_user_id = me or t.seller_user_id = me) and t.review_deadline > now()
        and not exists (select 1 from public.transaction_reviews r where r.transaction_id = t.id and r.reviewer_user_id = me)), '[]'::jsonb),
    'purchase_checks', coalesce((
      select jsonb_agg(item order by contacted_at desc) from (
        select jsonb_build_object('listing_id', l.id, 'title', l.title, 'slug', l.slug, 'contacted_at', contact.contacted_at) item, contact.contacted_at
        from (
          select e.listing_id, max(e.created_at) contacted_at
          from public.marketplace_events e
          where e.event_type = 'whatsapp_contact' and e.actor_user_id = me
            and e.created_at between now() - interval '30 days' and now() - interval '3 days'
          group by e.listing_id
        ) contact
        join public.listings l on l.id = contact.listing_id
        where l.owner_user_id is distinct from me and l.status in ('approved', 'hidden', 'sold')
          and not exists (select 1 from public.purchase_checkins c where c.listing_id = l.id and c.buyer_user_id = me and c.answer is not null)
          and not exists (select 1 from public.transaction_claims c where c.listing_id = l.id and c.buyer_user_id = me)
          and not exists (select 1 from public.verified_transactions t where t.listing_id = l.id)
        order by contact.contacted_at desc
        limit 5) recent), '[]'::jsonb),
    'price_drops', (select count(*) from public.notifications n
      where n.user_id = me and n.event_type = 'listing_price_drop' and n.read_at is null and n.created_at > now() - interval '14 days'),
    'alert_matches', (select count(*) from laria_private.search_alert_matches m
      join public.saved_search_alerts a on a.id = m.alert_id
      where m.user_id = me and m.suppressed_at is null and m.matched_at > now() - interval '7 days')
  ) into buyer;

  select jsonb_build_object(
    'rejected', coalesce((
      select jsonb_agg(item order by changed_at desc) from (
        select jsonb_build_object('listing_id', l.id, 'title', l.title, 'reason', l.rejection_reason, 'codes', to_jsonb(l.rejection_codes), 'kind', 'listing') item, l.updated_at changed_at
        from public.listings l where l.owner_user_id = me and l.status = 'rejected'
        union all
        select jsonb_build_object('listing_id', l.id, 'title', l.title, 'reason', r.rejection_reason, 'codes', to_jsonb(r.rejection_codes), 'kind', 'revision'), r.reviewed_at
        from public.listings l
        join lateral (select * from public.listing_revisions r where r.listing_id = l.id order by r.created_at desc limit 1) r on true
        where l.owner_user_id = me and l.status in ('approved', 'hidden') and r.status = 'rejected'
          and r.reviewed_at > now() - interval '30 days'
        limit 20) rows), '[]'::jsonb),
    'admin_hidden', coalesce((
      select jsonb_agg(jsonb_build_object('listing_id', l.id, 'title', l.title, 'reason', l.hidden_reason) order by l.hidden_at desc)
      from public.listings l where l.owner_user_id = me and l.status = 'hidden' and l.hidden_source = 'admin'), '[]'::jsonb),
    'drafts', coalesce((
      select jsonb_agg(jsonb_build_object('listing_id', l.id, 'title', l.title) order by l.created_at desc)
      from public.listings l where l.owner_user_id = me and l.status = 'draft'), '[]'::jsonb),
    'buyer_reports', coalesce((
      select jsonb_agg(jsonb_build_object('checkin_id', c.id, 'listing_id', l.id, 'title', l.title, 'buyer_name', p.full_name,
        'answered_at', c.answered_at, 'stock_managed', exists (select 1 from public.store_inventory_items i where i.listing_id = l.id and i.inventory_status = 'active'))
        order by c.answered_at desc)
      from public.purchase_checkins c join public.listings l on l.id = c.listing_id left join public.profiles p on p.id = c.buyer_user_id
      where c.seller_user_id = me and c.answer = 'yes' and c.seller_decision is null and l.owner_user_id = me
        and not exists (select 1 from public.verified_transactions t where t.listing_id = l.id)), '[]'::jsonb),
    'availability', coalesce((
      select jsonb_agg(jsonb_build_object('listing_id', l.id, 'title', l.title, 'slug', l.slug, 'price_pen', l.price_pen, 'asked_at', l.availability_checkin_at)
        order by l.availability_checkin_at desc)
      from public.listings l
      where l.owner_user_id = me and l.status = 'approved' and l.availability_checkin_at is not null
        and l.availability_checkin_at > coalesce(l.availability_confirmed_at, '-infinity'::timestamptz)
        and l.availability_checkin_at > now() - interval '30 days'), '[]'::jsonb),
    'unattributed', coalesce((
      select jsonb_agg(jsonb_build_object('listing_id', l.id, 'title', l.title, 'sold_at', l.sold_at, 'eligible', eligible.n) order by l.sold_at desc)
      from public.listings l
      cross join lateral (
        select count(distinct e.actor_user_id) n from public.marketplace_events e
        where e.event_type = 'whatsapp_contact' and e.listing_id = l.id and e.actor_user_id is not null
          and e.actor_user_id <> l.owner_user_id and e.created_at <= l.sold_at) eligible
      where l.owner_user_id = me and l.status = 'sold' and l.sold_at > now() - interval '30 days' and eligible.n > 0
        and not exists (select 1 from public.transaction_claims c where c.listing_id = l.id)), '[]'::jsonb),
    'paused_until', (select max(l.paused_until) from public.listings l
      where l.owner_user_id = me and public.listing_is_paused(l.paused_until))
  ) into seller;

  select * into owner_store from public.stores where owner_user_id = me order by created_at limit 1;
  if owner_store.id is not null then
    select coalesce(s.inventory_enabled, false) into enabled
    from (select 1) one left join public.store_operation_settings s on s.store_id = owner_store.id;
    select jsonb_build_object(
      'store_id', owner_store.id,
      'inventory_enabled', enabled,
      'out_of_stock_saved', (select count(*) from public.store_inventory_items i
        where i.store_id = owner_store.id and i.inventory_status = 'active' and i.quantity_available = 0 and i.listing_id is not null
          and exists (select 1 from public.favorites f where f.listing_id = i.listing_id)),
      'low_stock', (select count(*) from public.store_inventory_items i
        where i.store_id = owner_store.id and i.inventory_status = 'active'
          and laria_private.inventory_stock_level(i.quantity_available, i.low_stock_threshold) = 'low'),
      'unlinked_skus', (select count(*) from public.store_inventory_items i
        where i.store_id = owner_store.id and i.inventory_status = 'active' and i.listing_id is null),
      'open_import', (select jsonb_build_object('id', s.id, 'file_name', s.file_name, 'status', s.status, 'expires_at', s.updated_at + interval '7 days')
        from public.store_import_sessions s
        where s.store_id = owner_store.id and laria_private.import_session_is_open(s.status)
        order by s.updated_at desc limit 1),
      'purchase_requests_today', (select count(*) from public.marketplace_events e
        where e.event_type = 'whatsapp_contact' and e.store_id = owner_store.id and e.metadata ->> 'intent' = 'purchase'
          and (e.created_at at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date),
      'listings', (select count(*) from public.listings l where l.store_id = owner_store.id),
      'payment_methods', (select count(*) from public.store_payment_methods m where m.store_id = owner_store.id and m.status <> 'withdrawn')
    ) into store_part;
  end if;

  return jsonb_build_object('buyer', buyer, 'seller', seller, 'store', store_part);
end;
$$;
revoke all on function public.get_account_pendientes() from public, anon;
grant execute on function public.get_account_pendientes() to authenticated, service_role;

-- ------------------------------------------------------------------ mine-11 / shop-07 statistics

-- The caller's listings (Particular or store) with period numbers, a weekly trend and the contacts without a sale.
-- Purchase requests are WhatsApp contacts marked {"intent":"purchase"} (PAY-1); "contacts" excludes them.
create or replace function public.get_listing_statistics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  since timestamptz;
  listings_json jsonb;
  weekly jsonb;
  stale jsonb;
begin
  if me is null then raise exception using errcode = '42501', message = 'Analytics access denied.'; end if;
  if p_days not in (7, 30, 90) then raise exception 'ANALYTICS_WINDOW_INVALID'; end if;
  since := now() - make_interval(days => p_days);

  with owned as (
    select l.id, l.title, l.slug, l.status, l.price_pen, l.published_at, l.created_at, l.store_id
    from public.listings l where l.owner_user_id = me and l.status in ('approved', 'hidden', 'sold', 'pending', 'rejected')
  ), counts as (
    select e.listing_id,
      count(*) filter (where e.event_type = 'listing_view') views,
      count(*) filter (where e.event_type = 'listing_impression') impressions,
      count(*) filter (where e.event_type = 'whatsapp_contact' and e.metadata ->> 'intent' is distinct from 'purchase') contacts,
      count(*) filter (where e.event_type = 'whatsapp_contact' and e.metadata ->> 'intent' = 'purchase') purchase_requests,
      count(*) filter (where e.event_type = 'favorite_added') saves
    from public.marketplace_events e join owned on owned.id = e.listing_id
    where e.created_at >= since and e.event_type in ('listing_view', 'listing_impression', 'whatsapp_contact', 'favorite_added')
    group by e.listing_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', owned.id, 'title', owned.title, 'slug', owned.slug, 'status', owned.status, 'price_pen', owned.price_pen,
      'published_at', owned.published_at,
      'views', coalesce(counts.views, 0), 'impressions', coalesce(counts.impressions, 0),
      'contacts', coalesce(counts.contacts, 0), 'purchase_requests', coalesce(counts.purchase_requests, 0),
      'saves', coalesce(counts.saves, 0),
      'favorites', (select count(*) from public.favorites f where f.listing_id = owned.id),
      'photos', (select count(*) from public.listing_photos p where p.listing_id = owned.id),
      'description_length', (select length(coalesce(l.description, '')) from public.listings l where l.id = owned.id)
    ) order by coalesce(counts.views, 0) desc, owned.created_at desc), '[]'::jsonb)
  into listings_json
  from owned left join counts on counts.listing_id = owned.id;

  with weeks as (
    select generate_series(date_trunc('week', now() at time zone 'America/Lima') - interval '11 weeks',
                           date_trunc('week', now() at time zone 'America/Lima'), interval '1 week') as week_start
  ), events as (
    select date_trunc('week', e.created_at at time zone 'America/Lima') week_start, e.event_type, e.metadata
    from public.marketplace_events e join public.listings l on l.id = e.listing_id
    where l.owner_user_id = me and e.event_type in ('listing_view', 'whatsapp_contact')
      and e.created_at >= now() - interval '12 weeks'
  )
  select jsonb_agg(jsonb_build_object('week_start', to_char(week_start, 'YYYY-MM-DD'), 'views', views,
      'contacts', contacts, 'purchase_requests', purchase_requests) order by week_start)
  into weekly
  from (
    select weeks.week_start,
      count(events.event_type) filter (where events.event_type = 'listing_view') views,
      count(events.event_type) filter (where events.event_type = 'whatsapp_contact' and events.metadata ->> 'intent' is distinct from 'purchase') contacts,
      count(events.event_type) filter (where events.event_type = 'whatsapp_contact' and events.metadata ->> 'intent' = 'purchase') purchase_requests
    from weeks left join events on events.week_start = weeks.week_start
    group by weeks.week_start
  ) per_week;

  select jsonb_build_object('count', count(*), 'contacts', coalesce(sum(contacts), 0), 'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'title', title, 'contacts', contacts) order by contacts desc) filter (where rank <= 5), '[]'::jsonb))
  into stale
  from (
    select l.id, l.title, count(*) contacts, row_number() over (order by count(*) desc) rank
    from public.listings l join public.marketplace_events e on e.listing_id = l.id
    where l.owner_user_id = me and l.status = 'approved'
      and e.event_type = 'whatsapp_contact' and e.created_at >= now() - interval '30 days'
    group by l.id, l.title
  ) rows;

  return jsonb_build_object('days', p_days, 'listings', listings_json, 'weekly', coalesce(weekly, '[]'::jsonb),
    'contacts_without_sale', stale);
end;
$$;
revoke all on function public.get_listing_statistics(integer) from public, anon;
grant execute on function public.get_listing_statistics(integer) to authenticated, service_role;

-- ------------------------------------------------------------------ mine-09 buyer cards

-- Same eligibility as before; each buyer also carries the last three digits of their WhatsApp number, which the
-- seller already has in their chat. Never the full number.
create or replace function public.get_eligible_transaction_buyers(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare item public.listings; result jsonb;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='TRANSACTION_AUTH_REQUIRED'; end if;
 select * into item from public.listings where id=p_listing_id;
 if not found or item.status<>'sold' or item.owner_user_id is distinct from auth.uid() then raise exception 'TRANSACTION_LISTING_NOT_OWNED'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('buyer_user_id',candidate.actor_user_id,'display_name',p.full_name,
  'last_contact_at',candidate.last_contact_at,
  'phone_last3',case when length(regexp_replace(coalesce(p.phone,''),'\D','','g'))>=6 then right(regexp_replace(p.phone,'\D','','g'),3) end,
  'reported_purchase',exists(select 1 from public.purchase_checkins c where c.listing_id=item.id and c.buyer_user_id=candidate.actor_user_id and c.answer='yes'))
  order by candidate.last_contact_at desc),'[]'::jsonb) into result
 from (select actor_user_id,max(created_at) last_contact_at from public.marketplace_events
  where event_type='whatsapp_contact' and listing_id=item.id and actor_user_id is not null
   and actor_user_id<>item.owner_user_id and created_at<=item.sold_at
  group by actor_user_id) candidate join public.profiles p on p.id=candidate.actor_user_id
 where not exists(select 1 from public.transaction_claims c where c.listing_id=item.id
  and c.buyer_user_id=candidate.actor_user_id and c.status in ('declined','confirmed'));
 return result;
end $$;

-- ------------------------------------------------------------------ trust-04 first verified sale

-- get_transaction_detail plus seller_verified_sales: how many verified sales the seller side has (the seller's own
-- count, only for the seller). The closing screen marks the first one as a milestone.
create or replace function public.get_transaction_detail(p_reference_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare item public.listings; claim public.transaction_claims; transaction_record public.verified_transactions; role text; result jsonb;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='TRANSACTION_AUTH_REQUIRED'; end if;
 select * into transaction_record from public.verified_transactions where id=p_reference_id;
 if found then select * into claim from public.transaction_claims where id=transaction_record.claim_id;
 else select * into claim from public.transaction_claims where id=p_reference_id;
 end if;
 if not found then
  select * into item from public.listings where id=p_reference_id and status='sold' and owner_user_id=auth.uid();
  if not found then raise exception 'TRANSACTION_NOT_ACCESSIBLE'; end if;
  select * into claim from public.transaction_claims where listing_id=item.id order by created_at desc limit 1;
  if claim.id is not null then select * into transaction_record from public.verified_transactions where claim_id=claim.id; end if;
 else select * into item from public.listings where id=claim.listing_id;
 end if;
 if item.owner_user_id=auth.uid() then role:='seller';
 elsif claim.buyer_user_id=auth.uid() then role:='buyer';
 else raise exception 'TRANSACTION_NOT_ACCESSIBLE'; end if;
 select jsonb_build_object('reference_id',p_reference_id,'listing_id',item.id,'listing_title',item.title,'listing_slug',item.slug,'sold_at',item.sold_at,
  'role',role,'state',case when transaction_record.id is not null then 'verified' when claim.id is null then 'unattributed' else claim.status end,
  'claim_id',claim.id,'transaction_id',transaction_record.id,'buyer_user_id',case when role='seller' then claim.buyer_user_id end,
  'buyer_name',case when role='seller' then (select full_name from public.profiles where id=claim.buyer_user_id) end,
  'seller_name',coalesce((select name from public.stores where id=item.store_id),(select full_name from public.profiles where id=item.owner_user_id),'Vendedor de Laria'),
  'store_id',item.store_id,'verified_at',transaction_record.verified_at,'review_deadline',transaction_record.review_deadline,
  'review_window_open',transaction_record.id is not null and transaction_record.review_deadline>clock_timestamp(),
  'own_review',(select to_jsonb(r)-'admin_hidden_by'-'admin_hidden_reason' from public.transaction_reviews r where r.transaction_id=transaction_record.id and r.reviewer_user_id=auth.uid()),
  'visible_reviews',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'direction',r.direction,'rating',r.rating,'comment',r.comment,'submitted_at',r.submitted_at,'reviewer_name',p.full_name) order by r.direction)
   from public.transaction_reviews r join public.profiles p on p.id=r.reviewer_user_id where r.transaction_id=transaction_record.id and laria_private.review_is_visible(r.id)),'[]'::jsonb),
  'seller_verified_sales',case when role='seller' then (select count(*) from public.verified_transactions t where t.seller_user_id=item.owner_user_id
   and t.store_id is not distinct from item.store_id) end) into result;
 return result;
end $$;
