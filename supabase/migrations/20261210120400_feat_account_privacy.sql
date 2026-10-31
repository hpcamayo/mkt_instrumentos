-- Feature ideas, integration: anonymising an account (launch audit A20, 20261114120000_launch_audit_privacy.sql) clears
-- this branch's data too.
--
-- laria_private.anonymize_account_core calls laria_private.anonymize_account_feature_data(uuid) when it exists, for the
-- self-service deletion (public.service_delete_account, service role) and for Admin (public.admin_anonymize_account,
-- with the authenticator code) alike; its result lands under "features" in the run's counts. It replaces the accounts
-- batch's version (20261201120500), which only the service role could run and which covered that batch's tables
-- alone. As the core does for main's tables, it removes what is the person's own and keeps what other people's
-- records need:
--
--   * removed: sign-in devices, recovery codes and attempts, help tickets, stolen-gear reports (their photos are
--     queued in laria_private.upload_removals, which the daily /api/internal/uploads/sweep deletes from Storage),
--     private serials and photo fingerprints of the account's listings, Mi equipo and its reminders, price steps,
--     private offers made and received, the person's own bundle offer, the artist profile, the seller page and level,
--     the buyer track record, and the Mercado Libre connection of a store of theirs (an active store's stays: that is
--     the business's account, which a team member connected);
--   * closed: open or accepted trade requests are withdrawn (the stores with offers are told, as when the person
--     withdraws one) and lose the contact phone; upcoming try-outs are cancelled (the store is told, as when the buyer
--     cancels) and every try-out loses the buyer's name, phone and note; services are hidden under "Cuenta eliminada"
--     without the WhatsApp number; pending service bookings are cancelled; service analytics lose the account;
--   * kept: verified sales and their reviews and review photos, service reviews and reports, counter purchases,
--     consignments (the store keeps the instrument and the record), and the stores' own data (an active store's owner
--     is refused by the core).
--
-- Two checks change so that a cleared row is valid: a hidden service may have no WhatsApp number, and a try-out may
-- have no phone. public.request_store_tryout and the service forms still require a valid one.
--
-- public.service_delete_account now calls only laria_private.anonymize_account (which runs the hook) and returns its
-- result; app/api/account/delete no longer removes stolen-gear photos itself.
--
-- Locks: the two tables whose checks change are new with this branch (empty when it is first applied); each change
-- takes a brief ACCESS EXCLUSIVE lock, capped at 10 seconds.
-- Rollback: restore both checks, then 20261201120500's two functions.

set lock_timeout = '10s';

alter table public.services drop constraint services_whatsapp_check;
alter table public.services add constraint services_whatsapp_check
  check (whatsapp_phone ~ '^[0-9]{10,15}$' or (whatsapp_phone = '' and status = 'hidden'));

alter table public.store_tryouts drop constraint store_tryouts_buyer_phone_check;
alter table public.store_tryouts add constraint store_tryouts_buyer_phone_check
  check (buyer_phone ~ '^[0-9]{10,15}$' or buyer_phone = '');

reset lock_timeout;

create or replace function laria_private.anonymize_account_feature_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  counts jsonb := '{}'::jsonb;
  done integer;
  request record;
  other record;
  tryout public.store_tryouts;
begin
  -- Accounts: sign-in, help and stolen-gear reports.
  delete from public.account_devices where user_id = p_user_id;
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('devices', done);
  delete from laria_private.account_recovery_codes where user_id = p_user_id;
  delete from laria_private.account_recovery_attempts where user_id = p_user_id;
  delete from public.help_tickets where user_id = p_user_id;
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('help_tickets', done);
  insert into laria_private.upload_removals (bucket, path)
  select 'stolen-gear-photos', p.storage_path
  from public.stolen_gear_report_photos p join public.stolen_gear_reports r on r.id = p.report_id
  where r.reporter_id = p_user_id
  on conflict do nothing;
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('stolen_photos_queued', done);
  delete from public.stolen_gear_reports where reporter_id = p_user_id;
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('stolen_reports', done);
  delete from public.listing_serials s using public.listings l where l.id = s.listing_id and l.owner_user_id = p_user_id;
  delete from public.listing_photo_fingerprints f using public.listings l
  where l.id = f.listing_id and l.owner_user_id = p_user_id;

  -- Selling tools: Mi equipo (its reminders go with it), price steps, private offers.
  delete from public.gear_items where user_id = p_user_id;
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('gear_items', done);
  delete from public.listing_price_steps where owner_user_id = p_user_id;
  delete from public.listing_private_offers where owner_user_id = p_user_id;
  delete from public.listing_private_offer_recipients where user_id = p_user_id;
  delete from public.seller_bundle_offers where owner_user_id = p_user_id;

  -- Trade requests, as public.withdraw_trade_request does, then no contact phone on any of them.
  for request in
    update public.trade_requests
    set status = 'withdrawn', closed_at = now(), close_reason = 'Cuenta eliminada.'
    where requester_user_id = p_user_id and status in ('open', 'accepted')
    returning id, title, listing_id
  loop
    for other in
      update public.trade_offers o set status = case when o.status = 'accepted' then 'accepted' else 'declined' end
      where o.request_id = request.id and o.status in ('sent', 'accepted')
      returning o.store_id
    loop
      perform laria_private.selling_notify(
        (select s.owner_user_id from public.stores s where s.id = other.store_id), 'store_trade_update',
        format('La persona retiró su pedido por %s.', request.title), request.listing_id, other.store_id);
    end loop;
  end loop;
  update public.trade_requests set contact_phone = null where requester_user_id = p_user_id and contact_phone is not null;
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('trade_requests_scrubbed', done);

  -- Public pages: artist profile, seller page and level, buyer track record.
  delete from public.artist_profiles where user_id = p_user_id;
  delete from public.seller_pages where user_id = p_user_id;
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('seller_pages', done);
  delete from public.seller_levels where subject_user_id = p_user_id;
  delete from public.buyer_track_records where user_id = p_user_id;

  -- Try-outs: an upcoming one is cancelled as public.cancel_my_tryout does; none keeps the buyer's details.
  for tryout in
    update public.store_tryouts
    set status = 'cancelled', cancelled_by = 'buyer', cancelled_at = now()
    where buyer_user_id = p_user_id and status in ('requested', 'confirmed') and starts_at > now()
    returning *
  loop
    perform laria_private.notify_tryout(tryout, 'store_tryout_cancelled',
      (select s.owner_user_id from public.stores s where s.id = tryout.store_id),
      'Cancelaron la prueba de ' || tryout.listing_title || ' del ' || laria_private.tryout_when_label(tryout.starts_at) || '.');
  end loop;
  update public.store_tryouts set buyer_name = 'Cuenta eliminada', buyer_phone = '', buyer_note = null
  where buyer_user_id = p_user_id;
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('tryouts_scrubbed', done);

  -- Services: hidden without a contact; pending bookings cancelled; analytics unlinked. Reviews and reports stay.
  update public.services
  set status = 'hidden', moderation_reason = 'Cuenta eliminada', provider_name = 'Cuenta eliminada', whatsapp_phone = ''
  where owner_user_id = p_user_id;
  get diagnostics done = row_count;
  counts := counts || jsonb_build_object('services_hidden', done);
  update public.service_bookings set status = 'cancelled', responded_at = now()
  where (client_user_id = p_user_id or provider_user_id = p_user_id) and status = 'pending';
  update public.service_events set actor_user_id = null where actor_user_id = p_user_id;

  -- Store reach: a Mercado Libre connection the person made for a store that is not active (one of their own, which
  -- the core already cleared). An active store's stays: it is the business's account, which a team member connected.
  delete from public.store_mercadolibre_connections c
  where c.connected_by = p_user_id
    and not exists (select 1 from public.stores s where s.id = c.store_id and s.status = 'active');

  return counts;
end;
$$;

revoke all on function laria_private.anonymize_account_feature_data(uuid) from public, anon, authenticated, service_role;

-- The server's entry point for self-service deletion (service role only; the server checked who is asking).
create or replace function public.service_delete_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  blocker text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'DELETE_SERVICE_REQUIRED';
  end if;
  blocker := laria_private.account_deletion_blocker(p_user_id);
  if blocker is not null then raise exception 'DELETE_BLOCKED_%', upper(blocker); end if;
  return laria_private.anonymize_account(p_user_id, 'self_service');
end;
$$;
revoke all on function public.service_delete_account(uuid) from public, anon, authenticated;
grant execute on function public.service_delete_account(uuid) to service_role;
