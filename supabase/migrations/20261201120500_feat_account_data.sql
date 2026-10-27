-- Feature ideas, accounts batch (docs/feature-ideas/accounts.md), safe-09: "Tus datos".
--
--   * export_my_data: everything Laria holds about the signed-in account, as one JSON document the person downloads
--     (account, listings, drafts, favorites, follows, alerts, reviews, purchases and sales, questions, help tickets,
--     stolen-gear reports, devices and e-mail preferences). Reviews received appear once they are public.
--   * Deleting the account: my_account_deletion_check says whether self-service deletion applies (an Admin account or
--     one that runs a store is closed with the team instead). service_delete_account, called by the server with the
--     service role after it re-checks the password, runs A20's laria_private.anonymize_account (or its stand-in) and
--     then laria_private.anonymize_account_feature_data for this batch's own tables; the server then soft-deletes the
--     Supabase Auth user. Verified transactions and their reviews stay, under "Cuenta eliminada".
-- New objects only.

create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, laria_private
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception using errcode = '42501', message = 'EXPORT_AUTH_REQUIRED'; end if;
  return jsonb_build_object(
    'generated_at', clock_timestamp(),
    'about', 'Copia de los datos de tu cuenta en Laria. Las publicaciones de otras personas solo aparecen por su título y enlace.',
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at,
        'full_name', p.full_name, 'phone', p.phone, 'city', p.city, 'region', p.region, 'account_type', p.account_type)
      from auth.users u left join public.profiles p on p.id = u.id where u.id = uid),
    'store', (select jsonb_build_object('name', s.name, 'slug', s.slug, 'status', s.status, 'city', s.city,
        'whatsapp_phone', s.whatsapp_phone, 'email', s.email, 'created_at', s.created_at)
      from public.stores s where s.owner_user_id = uid order by s.created_at desc limit 1),
    'listings', (select coalesce(jsonb_agg(jsonb_build_object(
        'title', l.title, 'slug', l.slug, 'status', l.status, 'category', l.category, 'instrument_type', l.instrument_type,
        'brand', l.brand, 'model', l.model, 'condition', l.condition, 'price_pen', l.price_pen, 'city', l.city,
        'region', l.region, 'description', l.description, 'created_at', l.created_at, 'published_at', l.published_at,
        'sold_at', l.sold_at, 'serial', (select serial_raw from public.listing_serials where listing_id = l.id),
        'photos', (select coalesce(jsonb_agg(ph.image_url order by ph.sort_order), '[]'::jsonb) from public.listing_photos ph where ph.listing_id = l.id))
        order by l.created_at), '[]'::jsonb)
      from public.listings l where l.owner_user_id = uid),
    'drafts', (select coalesce(jsonb_agg(jsonb_build_object('title', d.title, 'kind', d.kind, 'form', d.form,
        'created_at', d.created_at, 'updated_at', d.updated_at) order by d.created_at), '[]'::jsonb)
      from public.listing_drafts d where d.owner_user_id = uid),
    'favorites', (select coalesce(jsonb_agg(jsonb_build_object('listing', l.title, 'url', '/instrumentos/' || l.slug,
        'saved_at', f.created_at, 'saved_price_pen', f.saved_price_pen, 'note', f.note) order by f.created_at), '[]'::jsonb)
      from public.favorites f join public.listings l on l.id = f.listing_id where f.user_id = uid),
    'follows', (select coalesce(jsonb_agg(jsonb_build_object('store', s.name, 'brand', fo.brand, 'since', fo.created_at)
        order by fo.created_at), '[]'::jsonb)
      from public.follows fo left join public.stores s on s.id = fo.store_id where fo.user_id = uid),
    'alerts', (select coalesce(jsonb_agg(jsonb_build_object('name', a.name, 'filters', a.search_filters,
        'frequency', a.frequency, 'status', a.status, 'created_at', a.created_at) order by a.created_at), '[]'::jsonb)
      from public.saved_search_alerts a where a.user_id = uid and a.status <> 'deleted'),
    'reviews_written', (select coalesce(jsonb_agg(jsonb_build_object('listing', l.title, 'rating', r.rating,
        'comment', r.comment, 'submitted_at', r.submitted_at) order by r.submitted_at), '[]'::jsonb)
      from public.transaction_reviews r
      join public.verified_transactions t on t.id = r.transaction_id
      join public.listings l on l.id = t.listing_id
      where r.reviewer_user_id = uid),
    'reviews_received', (select coalesce(jsonb_agg(jsonb_build_object('listing', l.title, 'rating', r.rating,
        'comment', r.comment, 'submitted_at', r.submitted_at) order by r.submitted_at), '[]'::jsonb)
      from public.transaction_reviews r
      join public.verified_transactions t on t.id = r.transaction_id
      join public.listings l on l.id = t.listing_id
      where r.subject_user_id = uid
        and (t.review_deadline <= now() or (select count(*) from public.transaction_reviews both_sides where both_sides.transaction_id = t.id) = 2)),
    'purchases_and_sales', (select coalesce(jsonb_agg(jsonb_build_object('listing', l.title,
        'role', case when t.buyer_user_id = uid then 'compra' else 'venta' end, 'sold_at', t.sold_at, 'confirmed_at', t.verified_at)
        order by t.verified_at), '[]'::jsonb)
      from public.verified_transactions t join public.listings l on l.id = t.listing_id
      where t.buyer_user_id = uid or t.seller_user_id = uid),
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('listing', l.title, 'question', q.body, 'answer', q.answer,
        'created_at', q.created_at) order by q.created_at), '[]'::jsonb)
      from public.listing_questions q join public.listings l on l.id = q.listing_id where q.asker_user_id = uid),
    'help_tickets', (select coalesce(jsonb_agg(jsonb_build_object('code', h.code, 'topic', h.topic, 'message', h.message,
        'answer', h.answer, 'status', h.status, 'created_at', h.created_at) order by h.created_at), '[]'::jsonb)
      from public.help_tickets h where h.user_id = uid),
    'stolen_gear_reports', (select coalesce(jsonb_agg(jsonb_build_object('code', r.code, 'brand', r.brand, 'model', r.model,
        'serial', r.serial_raw, 'stolen_on', r.stolen_on, 'place', r.place, 'police_report', r.police_report,
        'status', r.status, 'created_at', r.created_at) order by r.created_at), '[]'::jsonb)
      from public.stolen_gear_reports r where r.reporter_id = uid),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('device', d.label, 'first_seen_at', d.first_seen_at,
        'last_seen_at', d.last_seen_at) order by d.first_seen_at), '[]'::jsonb)
      from public.account_devices d where d.user_id = uid),
    'email_preferences', (select to_jsonb(e) - 'user_id' from public.email_preferences e where e.user_id = uid)
  );
end;
$$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

create or replace function laria_private.account_deletion_blocker(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from auth.users where id = p_user_id and coalesce(raw_app_meta_data ->> 'role', '') = 'admin') then 'admin'
    when exists (select 1 from public.stores where owner_user_id = p_user_id and status in ('pending', 'active', 'hidden')) then 'store'
    else null end;
$$;
revoke all on function laria_private.account_deletion_blocker(uuid) from public, anon, authenticated;

-- What "Eliminar mi cuenta" shows before the person confirms.
create or replace function public.my_account_deletion_check()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, laria_private
as $$
declare
  uid uuid := auth.uid();
  blocker text;
begin
  if uid is null then raise exception using errcode = '42501', message = 'DELETE_AUTH_REQUIRED'; end if;
  blocker := laria_private.account_deletion_blocker(uid);
  return jsonb_build_object(
    'allowed', blocker is null,
    'blocker', blocker,
    'listings_removed', (select count(*) from public.listings where owner_user_id = uid and status in ('pending', 'approved', 'hidden', 'rejected', 'draft')),
    'transactions_kept', (select count(*) from public.verified_transactions where buyer_user_id = uid or seller_user_id = uid),
    'has_password', exists (select 1 from auth.users where id = uid and coalesce(encrypted_password, '') <> '')
  );
end;
$$;
revoke all on function public.my_account_deletion_check() from public, anon;
grant execute on function public.my_account_deletion_check() to authenticated;

-- This batch's own data, after anonymize_account: devices, recovery codes, help tickets, stolen-gear reports (their
-- photos' paths come back so the server removes the files), private serials and photo hashes of the account's listings.
create or replace function laria_private.anonymize_account_feature_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  photo_paths jsonb;
  tickets integer;
  reports integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'ANONYMIZE_SERVICE_REQUIRED';
  end if;
  delete from public.account_devices where user_id = p_user_id;
  delete from laria_private.account_recovery_codes where user_id = p_user_id;
  delete from laria_private.account_recovery_attempts where user_id = p_user_id;
  delete from public.help_tickets where user_id = p_user_id;
  get diagnostics tickets = row_count;
  select coalesce(jsonb_agg(p.storage_path), '[]'::jsonb) into photo_paths
  from public.stolen_gear_report_photos p join public.stolen_gear_reports r on r.id = p.report_id
  where r.reporter_id = p_user_id;
  delete from public.stolen_gear_reports where reporter_id = p_user_id;
  get diagnostics reports = row_count;
  delete from public.listing_serials s using public.listings l where l.id = s.listing_id and l.owner_user_id = p_user_id;
  delete from public.listing_photo_fingerprints f using public.listings l where l.id = f.listing_id and l.owner_user_id = p_user_id;
  return jsonb_build_object('help_tickets', tickets, 'stolen_reports', reports, 'stolen_photo_paths', photo_paths);
end;
$$;
revoke all on function laria_private.anonymize_account_feature_data(uuid) from public, anon, authenticated;
grant execute on function laria_private.anonymize_account_feature_data(uuid) to service_role;

-- The server's entry point for self-service deletion (service role only; the server checked who is asking).
create or replace function public.service_delete_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  blocker text;
  core jsonb;
  feature jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'DELETE_SERVICE_REQUIRED';
  end if;
  blocker := laria_private.account_deletion_blocker(p_user_id);
  if blocker is not null then raise exception 'DELETE_BLOCKED_%', upper(blocker); end if;
  core := laria_private.anonymize_account(p_user_id, 'self_service');
  feature := laria_private.anonymize_account_feature_data(p_user_id);
  return jsonb_build_object('account', core, 'feature_data', feature);
end;
$$;
revoke all on function public.service_delete_account(uuid) from public, anon, authenticated;
grant execute on function public.service_delete_account(uuid) to service_role;
