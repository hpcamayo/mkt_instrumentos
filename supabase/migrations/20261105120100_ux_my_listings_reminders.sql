-- Effortless Laria, batch "my-listings": reminders that close the loop (docs/ux-effortless/my-listings.md).
--
--   * big-08   A few days after a signed-in buyer opens WhatsApp from a listing, Laria asks them once:
--              "¿Compraste …?". "Sí" asks the seller to confirm; both answers together verify the sale.
--   * mine-08  "¿Sigue disponible?" after 30 days without confirmation, or after 5 contacts without a sale.
--   * trust-01 The buyer is reminded of a pending confirmation on day 2 and day 7, and both sides 3 days and 1 day
--              before the review window closes.
--
-- Each reminder is an in-app notification plus a queued e-mail. Nothing is sent from here: the existing e-mail
-- worker (/api/internal/email/process) sends queued messages when it runs, and it is still started by hand before
-- launch. The daily pg_cron job only prepares them. One reminder per kind and subject, ever (dedupe table).

-- ------------------------------------------------------------------ notification and e-mail types

select laria_private.ux_extend_text_check('public.notifications', 'notifications_event_type_check', 'event_type', array[
  'listing_purchase_check',               -- to the buyer: ¿Compraste …?
  'listing_buyer_reported_purchase',      -- to the seller: a buyer says they bought it
  'listing_availability_checkin',         -- to the seller: ¿Sigue disponible?
  'listing_purchase_confirmation_reminder', -- to the buyer: confirm the purchase the seller recorded
  'listing_review_reminder'               -- to either side: the review window closes soon
]);
select laria_private.ux_extend_text_check('laria_private.marketplace_email_deliveries', 'marketplace_email_deliveries_event_type_check', 'event_type', array[
  'listing_purchase_check',
  'listing_buyer_reported_purchase',
  'listing_availability_checkin',
  'listing_purchase_confirmation_reminder',
  'listing_review_reminder'
]);

-- Every new type starts with "listing_", so notifications_target_check already requires its listing_id.

create table if not exists laria_private.ux_reminders_sent (
  reminder_key text primary key,
  sent_at timestamptz not null default now()
);

-- Inserts the notification and queues its e-mail once per p_key. Returns false when the key was used before.
create or replace function laria_private.ux_notify_once(
  p_key text, p_user_id uuid, p_event_type text, p_message text, p_listing_id uuid,
  p_store_id uuid default null, p_claim_id uuid default null, p_transaction_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  notification_id uuid;
begin
  if p_user_id is null then return false; end if;
  insert into laria_private.ux_reminders_sent(reminder_key) values (p_key) on conflict do nothing;
  if not found then return false; end if;
  insert into public.notifications(user_id, event_type, message, listing_id, store_id, claim_id, transaction_id)
  values (p_user_id, p_event_type, p_message, p_listing_id, p_store_id, p_claim_id, p_transaction_id)
  returning id into notification_id;
  perform laria_private.enqueue_marketplace_email(
    p_event_type, p_user_id, 'ux:' || p_key, notification_id, p_listing_id, p_store_id, p_claim_id, p_transaction_id
  );
  return true;
end;
$$;
revoke all on function laria_private.ux_notify_once(text, uuid, text, text, uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- mine-01: the "changes rejected" e-mail now carries the moderator's reason, like the listing rejection.
create or replace function laria_private.ux_fill_revision_rejection_reason()
returns trigger
language plpgsql
security definer
set search_path = public, laria_private
as $$
begin
  if new.event_type = 'listing_revision_rejected' and new.listing_id is not null and not (new.context ? 'reason') then
    select new.context || jsonb_build_object('reason', revision.rejection_reason) into new.context
    from public.listing_revisions revision
    where revision.listing_id = new.listing_id and revision.status = 'rejected' and revision.rejection_reason is not null
    order by revision.reviewed_at desc nulls last
    limit 1;
    new.context := coalesce(new.context, '{}'::jsonb);
  end if;
  return new;
end;
$$;
drop trigger if exists marketplace_email_ux_revision_reason on laria_private.marketplace_email_deliveries;
create trigger marketplace_email_ux_revision_reason
before insert on laria_private.marketplace_email_deliveries
for each row execute function laria_private.ux_fill_revision_rejection_reason();

-- ------------------------------------------------------------------ big-08 answers

-- Is the caller a signed-in buyer who opened WhatsApp from this listing (not their own)? Returns the last contact.
create or replace function laria_private.ux_buyer_last_contact(p_listing_id uuid, p_buyer uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(event.created_at)
  from public.marketplace_events event
  join public.listings listing on listing.id = event.listing_id
  where event.event_type = 'whatsapp_contact' and event.listing_id = p_listing_id
    and event.actor_user_id = p_buyer and listing.owner_user_id is distinct from p_buyer;
$$;
revoke all on function laria_private.ux_buyer_last_contact(uuid, uuid) from public, anon, authenticated;

-- What the listing page shows the signed-in caller after they opened WhatsApp ("¿Cómo te fue?"), or null.
create or replace function public.get_purchase_checkin(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  contact timestamptz;
  checkin public.purchase_checkins;
  claim public.transaction_claims;
begin
  if auth.uid() is null then return null; end if;
  contact := laria_private.ux_buyer_last_contact(p_listing_id, auth.uid());
  if contact is null or contact < now() - interval '60 days' then return null; end if;
  select * into claim from public.transaction_claims
  where listing_id = p_listing_id and buyer_user_id = auth.uid() and status in ('pending', 'confirmed')
  order by created_at desc limit 1;
  select * into checkin from public.purchase_checkins where listing_id = p_listing_id and buyer_user_id = auth.uid();
  return jsonb_build_object(
    'contacted_at', contact,
    'answer', checkin.answer,
    'seller_decision', checkin.seller_decision,
    'claim_id', claim.id,
    'claim_status', claim.status
  );
end;
$$;
revoke all on function public.get_purchase_checkin(uuid) from public, anon;
grant execute on function public.get_purchase_checkin(uuid) to authenticated, service_role;

-- The buyer's answer. "Sí" notifies the seller once; "No" only stops the question. If the seller already asked this
-- buyer to confirm, "Sí" answers that request directly (the result names the claim).
create or replace function public.answer_purchase_checkin(p_listing_id uuid, p_bought boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  listing_record public.listings;
  contact timestamptz;
  checkin public.purchase_checkins;
  claim public.transaction_claims;
  outcome jsonb;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'TRANSACTION_AUTH_REQUIRED'; end if;
  if p_bought is null then raise exception 'TRANSACTION_RESPONSE_INVALID'; end if;
  select * into listing_record from public.listings where id = p_listing_id;
  contact := laria_private.ux_buyer_last_contact(p_listing_id, auth.uid());
  if listing_record.id is null or contact is null or listing_record.owner_user_id is null then
    raise exception 'TRANSACTION_BUYER_NOT_ELIGIBLE';
  end if;

  select * into claim from public.transaction_claims
  where listing_id = p_listing_id and buyer_user_id = auth.uid() and status = 'pending' for update;
  if claim.id is not null then
    outcome := public.respond_transaction_claim(claim.id, p_bought);
  end if;

  insert into public.purchase_checkins(listing_id, buyer_user_id, seller_user_id, store_id, contacted_at, answer, answered_at, claim_id)
  values (p_listing_id, auth.uid(), listing_record.owner_user_id, listing_record.store_id, contact,
          case when p_bought then 'yes' else 'no' end, now(), claim.id)
  on conflict (listing_id, buyer_user_id) do update
    set answer = excluded.answer, answered_at = excluded.answered_at, contacted_at = excluded.contacted_at,
        claim_id = coalesce(excluded.claim_id, public.purchase_checkins.claim_id)
    where public.purchase_checkins.seller_decision is null
  returning * into checkin;
  if checkin.id is null then
    select * into checkin from public.purchase_checkins where listing_id = p_listing_id and buyer_user_id = auth.uid();
  end if;

  update public.notifications set read_at = coalesce(read_at, now())
  where user_id = auth.uid() and listing_id = p_listing_id and event_type = 'listing_purchase_check';

  if p_bought and claim.id is null and checkin.seller_decision is null
    and not exists (select 1 from public.verified_transactions where listing_id = p_listing_id) then
    perform laria_private.ux_notify_once(
      'buyer_reported:' || checkin.id, listing_record.owner_user_id, 'listing_buyer_reported_purchase',
      'Una persona que te contactó por WhatsApp indica que te compró esta publicación. Confírmalo para habilitar las reseñas.',
      p_listing_id, listing_record.store_id
    );
  end if;

  return jsonb_build_object('checkin_id', checkin.id, 'answer', checkin.answer, 'claim_id', claim.id, 'claim', outcome);
end;
$$;
revoke all on function public.answer_purchase_checkin(uuid, boolean) from public, anon;
grant execute on function public.answer_purchase_checkin(uuid, boolean) to authenticated, service_role;

-- The seller's decision on a buyer's "Sí". Confirming marks the listing sold if it is still published or hidden by
-- the owner, and records a verified transaction: the buyer already said yes, so no second confirmation is asked.
-- A listing whose stock Inventario controls is never marked sold here (D-15); the store records the sale there.
create or replace function public.decide_purchase_checkin(p_checkin_id uuid, p_confirmed boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  checkin public.purchase_checkins;
  item public.listings;
  claim_uuid uuid;
  transaction_uuid uuid;
  verified_time timestamptz;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'TRANSACTION_AUTH_REQUIRED'; end if;
  if p_confirmed is null then raise exception 'TRANSACTION_RESPONSE_INVALID'; end if;
  select * into checkin from public.purchase_checkins where id = p_checkin_id for update;
  if not found or checkin.answer is distinct from 'yes' then raise exception 'TRANSACTION_NOT_ACCESSIBLE'; end if;
  select * into item from public.listings where id = checkin.listing_id for update;
  if item.owner_user_id is distinct from auth.uid() then raise exception 'TRANSACTION_LISTING_NOT_OWNED'; end if;
  if checkin.seller_decision is not null then
    return jsonb_build_object('decision', checkin.seller_decision, 'claim_id', checkin.claim_id,
      'transaction_id', (select id from public.verified_transactions where claim_id = checkin.claim_id));
  end if;

  update public.notifications set read_at = coalesce(read_at, now())
  where user_id = auth.uid() and listing_id = item.id and event_type = 'listing_buyer_reported_purchase';

  if not p_confirmed then
    update public.purchase_checkins set seller_decision = 'declined', seller_decided_at = now() where id = checkin.id;
    return jsonb_build_object('decision', 'declined');
  end if;

  if exists (select 1 from public.verified_transactions where listing_id = item.id) then
    raise exception 'TRANSACTION_ALREADY_VERIFIED';
  end if;
  if item.status in ('approved', 'hidden') then
    perform public.set_owned_listing_lifecycle(item.id, 'sold');
    select * into item from public.listings where id = item.id;
  end if;
  if item.status <> 'sold' or item.sold_at is null then raise exception 'TRANSACTION_LISTING_NOT_SOLD'; end if;
  if not exists (select 1 from public.marketplace_events e where e.event_type = 'whatsapp_contact'
      and e.listing_id = item.id and e.actor_user_id = checkin.buyer_user_id and e.created_at <= item.sold_at) then
    raise exception 'TRANSACTION_BUYER_NOT_ELIGIBLE';
  end if;

  verified_time := clock_timestamp();
  update public.transaction_claims set status = 'superseded', ended_at = verified_time
  where listing_id = item.id and status in ('pending', 'external');
  insert into public.transaction_claims(listing_id, seller_user_id, store_id, buyer_user_id, attribution_type, status, responded_at, ended_at)
  values (item.id, item.owner_user_id, item.store_id, checkin.buyer_user_id, 'laria', 'confirmed', verified_time, verified_time)
  returning id into claim_uuid;
  insert into public.verified_transactions(claim_id, listing_id, seller_user_id, store_id, buyer_user_id, seller_identity_type, sold_at, verified_at, review_deadline)
  values (claim_uuid, item.id, item.owner_user_id, item.store_id, checkin.buyer_user_id,
          case when item.store_id is null then 'particular' else 'store' end, item.sold_at, verified_time, verified_time + interval '10 days')
  returning id into transaction_uuid;
  update public.purchase_checkins set seller_decision = 'confirmed', seller_decided_at = verified_time, claim_id = claim_uuid where id = checkin.id;

  insert into public.notifications(user_id, event_type, message, listing_id, store_id, claim_id, transaction_id)
  select recipient, 'transaction_confirmed', 'La relación de compra fue confirmada. Ya pueden dejar sus reseñas durante 10 días.',
         item.id, item.store_id, claim_uuid, transaction_uuid
  from (values (item.owner_user_id), (checkin.buyer_user_id)) recipients(recipient)
  on conflict do nothing;
  insert into public.marketplace_events(event_type, listing_id, store_id, seller_user_id, actor_user_id, source, dedupe_key) values
    ('buyer_transaction_confirmed', item.id, item.store_id, item.owner_user_id, checkin.buyer_user_id, 'system', 'buyer_transaction_confirmed:' || claim_uuid),
    ('transaction_verified', item.id, item.store_id, item.owner_user_id, auth.uid(), 'system', 'transaction_verified:' || transaction_uuid);
  return jsonb_build_object('decision', 'confirmed', 'claim_id', claim_uuid, 'transaction_id', transaction_uuid);
end;
$$;
revoke all on function public.decide_purchase_checkin(uuid, boolean) from public, anon;
grant execute on function public.decide_purchase_checkin(uuid, boolean) to authenticated, service_role;

-- ------------------------------------------------------------------ the daily run

-- When a listing is due for "¿Sigue disponible?" (mine-08): published, not controlled by Inventario, not paused, and
-- either 30 days without a confirmation or 5 contacts since the last one; never asked twice within 14 days.
create or replace function laria_private.ux_listing_availability_due(p_listing public.listings)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_listing.status = 'approved'
    and p_listing.owner_user_id is not null
    and not public.listing_is_paused(p_listing.paused_until)
    and not exists (select 1 from public.store_inventory_items i where i.listing_id = p_listing.id and i.inventory_status = 'active')
    and (p_listing.availability_checkin_at is null or p_listing.availability_checkin_at < now() - interval '14 days')
    and (
      coalesce(p_listing.availability_confirmed_at, p_listing.published_at, p_listing.created_at) < now() - interval '30 days'
      or (select count(*) from public.marketplace_events e
          where e.event_type = 'whatsapp_contact' and e.listing_id = p_listing.id
            and e.created_at > coalesce(p_listing.availability_confirmed_at, p_listing.published_at, p_listing.created_at)) >= 5
    );
$$;
revoke all on function laria_private.ux_listing_availability_due(public.listings) from public, anon, authenticated;

create or replace function laria_private.run_my_listings_reminders()
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  asked integer := 0;
  checkins integer := 0;
  claim_reminders integer := 0;
  review_reminders integer := 0;
  candidate record;
begin
  perform set_config('app.allow_listing_admin_fields', 'true', true);

  -- big-08: contacts 3 to 30 days old, no answer, no request from the seller, no verified sale. At most 3 per buyer.
  for candidate in
    select * from (
      select contact.listing_id, contact.buyer_user_id, contact.contacted_at, listing.owner_user_id, listing.store_id, listing.title,
             row_number() over (partition by contact.buyer_user_id order by contact.contacted_at desc) as rank
      from (
        select e.listing_id, e.actor_user_id as buyer_user_id, max(e.created_at) as contacted_at
        from public.marketplace_events e
        where e.event_type = 'whatsapp_contact' and e.actor_user_id is not null
          and e.created_at between now() - interval '30 days' and now() - interval '3 days'
        group by e.listing_id, e.actor_user_id
      ) contact
      join public.listings listing on listing.id = contact.listing_id
      where listing.owner_user_id is not null and listing.owner_user_id <> contact.buyer_user_id
        and listing.status in ('approved', 'hidden', 'sold')
        and not exists (select 1 from public.purchase_checkins c where c.listing_id = contact.listing_id and c.buyer_user_id = contact.buyer_user_id)
        and not exists (select 1 from public.transaction_claims c where c.listing_id = contact.listing_id and c.buyer_user_id = contact.buyer_user_id)
        and not exists (select 1 from public.verified_transactions t where t.listing_id = contact.listing_id)
    ) ranked
    where rank <= 3
  loop
    insert into public.purchase_checkins(listing_id, buyer_user_id, seller_user_id, store_id, contacted_at, asked_at)
    values (candidate.listing_id, candidate.buyer_user_id, candidate.owner_user_id, candidate.store_id, candidate.contacted_at, now())
    on conflict (listing_id, buyer_user_id) do nothing;
    if found and laria_private.ux_notify_once(
      'purchase_check:' || candidate.listing_id || ':' || candidate.buyer_user_id, candidate.buyer_user_id, 'listing_purchase_check',
      '¿Compraste «' || left(candidate.title, 80) || '»? Si lo compraste, cuéntanos para habilitar las reseñas.',
      candidate.listing_id, candidate.store_id
    ) then asked := asked + 1; end if;
  end loop;

  -- mine-08
  for candidate in
    select listing.id, listing.owner_user_id, listing.store_id, listing.title
    from public.listings listing
    where listing.status = 'approved' and laria_private.ux_listing_availability_due(listing)
    order by listing.published_at nulls last
    limit 2000
  loop
    update public.listings set availability_checkin_at = now() where id = candidate.id;
    if laria_private.ux_notify_once(
      'availability:' || candidate.id || ':' || to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD'), candidate.owner_user_id,
      'listing_availability_checkin',
      '¿«' || left(candidate.title, 80) || '» sigue disponible? Respóndelo en un toque desde tu cuenta.',
      candidate.id, candidate.store_id
    ) then checkins := checkins + 1; end if;
  end loop;

  -- trust-01: pending confirmations on day 2 and day 7.
  for candidate in
    select claim.id, claim.listing_id, claim.store_id, claim.buyer_user_id, listing.title,
           case when claim.created_at <= now() - interval '7 days' then 7 else 2 end as day
    from public.transaction_claims claim
    join public.listings listing on listing.id = claim.listing_id
    where claim.status = 'pending' and claim.buyer_user_id is not null
      and claim.created_at <= now() - interval '2 days' and claim.created_at > now() - interval '30 days'
  loop
    if laria_private.ux_notify_once(
      'claim_reminder:' || candidate.id || ':' || candidate.day, candidate.buyer_user_id, 'listing_purchase_confirmation_reminder',
      'El vendedor espera que confirmes si compraste «' || left(candidate.title, 80) || '».',
      candidate.listing_id, candidate.store_id, candidate.id
    ) then claim_reminders := claim_reminders + 1; end if;
  end loop;

  -- trust-01: reviews closing in 3 days and in 1 day, for each side that has not reviewed.
  for candidate in
    select t.id, t.listing_id, t.store_id, t.claim_id, side.user_id, listing.title,
           case when t.review_deadline <= now() + interval '1 day' then 1 else 3 end as days_left
    from public.verified_transactions t
    join public.listings listing on listing.id = t.listing_id
    cross join lateral (values (t.seller_user_id), (t.buyer_user_id)) side(user_id)
    where t.review_deadline > now() and t.review_deadline <= now() + interval '3 days'
      and not exists (select 1 from public.transaction_reviews r where r.transaction_id = t.id and r.reviewer_user_id = side.user_id)
  loop
    if laria_private.ux_notify_once(
      'review_reminder:' || candidate.id || ':' || candidate.user_id || ':' || candidate.days_left, candidate.user_id, 'listing_review_reminder',
      case when candidate.days_left = 1 then 'Mañana se cierra el plazo para reseñar «' else 'Quedan 3 días para reseñar «' end
        || left(candidate.title, 80) || '».',
      candidate.listing_id, candidate.store_id, candidate.claim_id, candidate.id
    ) then review_reminders := review_reminders + 1; end if;
  end loop;

  return jsonb_build_object('purchase_checks', asked, 'availability_checkins', checkins,
    'claim_reminders', claim_reminders, 'review_reminders', review_reminders);
end;
$$;
revoke all on function laria_private.run_my_listings_reminders() from public, anon, authenticated;

-- 14:00 UTC is 09:00 in Lima: reminders arrive in the morning, once a day (a digest, not a stream).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ux-my-listings-reminders') then
    perform cron.unschedule('ux-my-listings-reminders');
  end if;
  perform cron.schedule('ux-my-listings-reminders', '0 14 * * *', 'select laria_private.run_my_listings_reminders()');
end;
$$;
