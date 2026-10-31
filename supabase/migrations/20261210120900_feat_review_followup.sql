-- PR #54 second review: preserve location request identity, serialize buyer-wide booking limits, and complete
-- personal-data exports. No hosted migration is part of the repair; this ships with the feature branch.

-- Keep the location-level inputs, rather than the derived store-wide quantity of a location stock count.
create table laria_private.store_location_movement_requests (
  store_id uuid not null references public.stores(id) on delete cascade,
  request_key text not null,
  request_fingerprint text not null,
  movement_id uuid not null unique references public.store_stock_movements(id) on delete cascade,
  primary key (store_id, request_key)
);
alter table laria_private.store_location_movement_requests enable row level security;
revoke all on laria_private.store_location_movement_requests from public, anon, authenticated;

create or replace function public.record_location_stock_movement(
  p_location_id uuid, p_item_id uuid, p_type text, p_quantity integer,
  p_channel text default null, p_reference text default null, p_reason text default null,
  p_expected_version integer default null, p_idempotency_key text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_store_id uuid := laria_private.inventory_item_store_for_write(p_item_id);
  v_request_key text := laria_private.inventory_request_key(p_idempotency_key);
  reference text := laria_private.inventory_short_text(p_reference, 120, 'reference');
  reason text := laria_private.inventory_short_text(p_reason, 280, 'reason');
  args record;
  fingerprint text;
  saved_fingerprint text;
  existing public.store_stock_movements;
  item public.store_inventory_items;
  at_location integer;
  quantity integer := p_quantity;
  result jsonb;
  previous_location text := current_setting('laria.stock_location', true);
begin
  if p_type not in ('sale', 'return', 'restock', 'damage_or_loss', 'manual_adjustment', 'stock_count') then
    perform laria_private.raise_inventory_error('STOCK_MOVEMENT_TYPE_INVALID', 'Este tipo de movimiento no está disponible por sede.');
  end if;
  args := laria_private.owner_movement_args(p_type, p_channel, p_expected_version);
  -- Version is a precondition on the first write. An identical count retry remains valid after the item's version
  -- changes, as the original location API promised; every field describing the actual operation is compared.
  fingerprint := laria_private.inventory_fingerprint(jsonb_build_array(
    'record_location_stock_movement', p_location_id, p_item_id, args.movement_type, p_quantity, args.channel, reference, reason));
  perform pg_advisory_xact_lock(hashtextextended(owner_store_id::text || ':' || v_request_key, 23));
  select * into existing from public.store_stock_movements where store_id = owner_store_id and idempotency_key = v_request_key;
  if found then
    select r.request_fingerprint into saved_fingerprint from laria_private.store_location_movement_requests r
    where r.store_id = owner_store_id and r.request_key = v_request_key;
    if existing.location_id is distinct from p_location_id or
       (saved_fingerprint is not null and saved_fingerprint <> fingerprint) or
       (saved_fingerprint is null and (p_type = 'stock_count' or existing.request_fingerprint <>
         laria_private.inventory_fingerprint(jsonb_build_array('record_stock_movement', p_item_id,
           args.movement_type, p_quantity, args.channel, reference, reason, p_expected_version)))) then
      perform laria_private.raise_inventory_error('IDEMPOTENCY_KEY_REUSED', 'Esta solicitud ya se usó con otros datos.');
    end if;
    -- An older count has no recoverable original per-location target, so it is refused above rather than guessed.
    select * into item from public.store_inventory_items where id = existing.item_id;
    return jsonb_build_object('movement', laria_private.stock_movement_json(existing),
      'item', laria_private.inventory_item_json(item), 'replayed', true);
  end if;
  perform laria_private.active_store_location(owner_store_id, p_location_id);
  item := laria_private.lock_inventory_item(p_item_id);
  if p_type = 'stock_count' then
    if p_quantity is null or p_quantity not between 0 and 100000 then
      perform laria_private.raise_inventory_error('STOCK_QUANTITY_INVALID', 'Ingresa una cantidad entre 0 y 100000.');
    end if;
    select coalesce(sum(quantity_on_hand), 0) into at_location from public.store_location_stock
    where location_id = p_location_id and item_id = p_item_id;
    quantity := item.quantity_on_hand - at_location + p_quantity;
  end if;
  perform set_config('laria.stock_location', p_location_id::text, true);
  result := public.record_stock_movement(p_item_id, p_type, quantity, p_channel, p_reference, p_reason,
    p_expected_version, v_request_key);
  perform set_config('laria.stock_location', coalesce(previous_location, ''), true);
  insert into laria_private.store_location_movement_requests(store_id, request_key, request_fingerprint, movement_id)
  values (owner_store_id, v_request_key, fingerprint, (result->'movement'->>'id')::uuid);
  return result;
end;
$$;

-- Buyer first, store second: the store row still protects slot capacity, while this lock protects both limits
-- shared by all of that buyer's stores. Replays are looked up under the buyer lock too.
select laria_private.patch_function_text('public.request_store_tryout(uuid,timestamptz,text,text,text,text)'::regprocedure,
  array[$old$  select * into existing from public.store_tryouts where buyer_user_id = caller and request_key = p_request_key;$old$],
  array[$new$  perform pg_advisory_xact_lock(hashtextextended('tryout_buyer:' || caller::text, 0));
  select * into existing from public.store_tryouts where buyer_user_id = caller and request_key = p_request_key;$new$]);

-- Export listing and counter transactions alike, and all account-owned feature data with explicit privacy boundaries.
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
    'reviews_written', (select coalesce(jsonb_agg(jsonb_build_object('transaction_id', t.id, 'listing', coalesce(l.title, laria_private.counter_sale_title(cs.lines)), 'rating', r.rating,
        'comment', r.comment, 'submitted_at', r.submitted_at) order by r.submitted_at), '[]'::jsonb)
      from public.transaction_reviews r
      join public.verified_transactions t on t.id = r.transaction_id
      left join public.listings l on l.id = t.listing_id
      left join public.store_counter_sales cs on cs.id = t.counter_sale_id
      where r.reviewer_user_id = uid),
    -- Reviews about the person, once they show on the transaction page: revealed and not held for Admin (A17).
    'reviews_received', (select coalesce(jsonb_agg(jsonb_build_object('transaction_id', t.id, 'listing', coalesce(l.title, laria_private.counter_sale_title(cs.lines)), 'rating', r.rating,
        'comment', r.comment, 'submitted_at', r.submitted_at) order by r.submitted_at), '[]'::jsonb)
      from public.transaction_reviews r
      join public.verified_transactions t on t.id = r.transaction_id
      left join public.listings l on l.id = t.listing_id
      left join public.store_counter_sales cs on cs.id = t.counter_sale_id
      where (r.subject_user_id = uid or exists (select 1 from public.stores s where s.id = r.subject_store_id and s.owner_user_id = uid))
        and laria_private.review_is_visible(r.id)),
    'purchases_and_sales', (select coalesce(jsonb_agg(jsonb_build_object('transaction_id', t.id, 'listing', coalesce(l.title, laria_private.counter_sale_title(cs.lines)),
        'origin', case when t.counter_sale_id is not null then 'counter' else 'listing' end,
        'items', (select jsonb_agg(jsonb_build_object('name', e->>'name', 'quantity', e->'quantity')) from jsonb_array_elements(cs.lines) e),
        'role', case when t.buyer_user_id = uid then 'compra' else 'venta' end, 'sold_at', t.sold_at, 'confirmed_at', t.verified_at)
        order by t.verified_at), '[]'::jsonb)
      from public.verified_transactions t left join public.listings l on l.id = t.listing_id
      left join public.store_counter_sales cs on cs.id = t.counter_sale_id
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
  )
  || jsonb_build_object(
    -- Only the person's own equipment, requests and offers. No audience member identities or invite secrets.
    'gear_items', (select coalesce(jsonb_agg(to_jsonb(g) - 'user_id' - 'serial_key' order by g.created_at, g.id), '[]'::jsonb)
      from public.gear_items g where g.user_id = uid),
    'gear_reminders', (select coalesce(jsonb_agg(to_jsonb(g) - 'user_id' order by g.gear_item_id), '[]'::jsonb)
      from public.gear_reminders g where g.user_id = uid),
    'trade_requests', (select coalesce(jsonb_agg(to_jsonb(r) - 'requester_user_id' order by r.created_at, r.id), '[]'::jsonb)
      from public.trade_requests r where r.requester_user_id = uid),
    'trade_offers', (select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at, o.id), '[]'::jsonb)
      from public.trade_offers o where exists (select 1 from public.trade_requests r where r.id = o.request_id and r.requester_user_id = uid)
        or exists (select 1 from public.stores s where s.id = o.store_id and s.owner_user_id = uid)),
    'consignments', (select coalesce(jsonb_agg((to_jsonb(c) - 'owner_user_id' - 'invite_token_hash') ||
        jsonb_build_object('role', case when c.owner_user_id = uid then 'owner' else 'store' end) order by c.created_at, c.id), '[]'::jsonb)
      from public.listing_consignments c where c.owner_user_id = uid
        or exists (select 1 from public.stores s where s.id = c.store_id and s.owner_user_id = uid)),
    'price_steps', (select coalesce(jsonb_agg(to_jsonb(p) - 'owner_user_id' order by p.listing_id), '[]'::jsonb)
      from public.listing_price_steps p where p.owner_user_id = uid),
    'private_offers', (select coalesce(jsonb_agg(to_jsonb(o) - 'owner_user_id' order by o.created_at, o.id), '[]'::jsonb)
      from public.listing_private_offers o where o.owner_user_id = uid
        or exists (select 1 from public.listing_private_offer_recipients r where r.offer_id = o.id and r.user_id = uid)),
    'bundle_offers', (select coalesce(jsonb_agg(to_jsonb(b) - 'owner_user_id' order by b.id), '[]'::jsonb)
      from public.seller_bundle_offers b where b.owner_user_id = uid),
    'seller_page', (select to_jsonb(s) - 'user_id' from public.seller_pages s where s.user_id = uid),
    'buyer_track_record', (select to_jsonb(b) - 'user_id' - 'token' from public.buyer_track_records b where b.user_id = uid),
    'seller_levels', (select coalesce(jsonb_agg(to_jsonb(s) - 'subject_user_id' order by s.id), '[]'::jsonb)
      from public.seller_levels s where s.subject_user_id = uid
        or exists (select 1 from public.stores st where st.id = s.subject_store_id and st.owner_user_id = uid)),
    'review_photos', (select coalesce(jsonb_agg(to_jsonb(p) - 'moderated_by' order by p.review_id, p.sort_order, p.id), '[]'::jsonb)
      from public.transaction_review_photos p join public.transaction_reviews r on r.id = p.review_id where r.reviewer_user_id = uid),
    'stolen_gear_photos', (select coalesce(jsonb_agg(jsonb_build_object('report_id', p.report_id, 'path', p.storage_path) order by p.id), '[]'::jsonb)
      from public.stolen_gear_report_photos p join public.stolen_gear_reports r on r.id = p.report_id where r.reporter_id = uid)
  )
  || jsonb_build_object(
    -- Store/provider exports describe the relationship and the caller's decisions, without the other person's
    -- identity/contact details. Authored reviews stay exportable; received reviews must already be visible.
    'tryouts', (select coalesce(jsonb_agg(
        (to_jsonb(t) - 'buyer_user_id' - 'buyer_name' - 'buyer_phone' - 'buyer_note') ||
        case when t.buyer_user_id = uid then jsonb_build_object('role', 'buyer', 'buyer_name', t.buyer_name,
          'buyer_phone', t.buyer_phone, 'buyer_note', t.buyer_note) else jsonb_build_object('role', 'store') end
        order by t.starts_at, t.id), '[]'::jsonb)
      from public.store_tryouts t where t.buyer_user_id = uid
        or exists (select 1 from public.stores s where s.id = t.store_id and s.owner_user_id = uid)),
    'services', (select coalesce(jsonb_agg(to_jsonb(s) - 'owner_user_id' - 'reviewed_by' order by s.created_at, s.id), '[]'::jsonb)
      from public.services s where s.owner_user_id = uid),
    'service_bookings', (select coalesce(jsonb_agg((to_jsonb(b) - 'provider_user_id' - 'client_user_id') ||
        jsonb_build_object('role', case when b.client_user_id = uid then 'client' else 'provider' end)
        order by b.created_at, b.id), '[]'::jsonb)
      from public.service_bookings b where b.client_user_id = uid or b.provider_user_id = uid),
    'service_reviews', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'booking_id', r.booking_id,
        'service_id', r.service_id, 'rating', r.rating, 'comment', r.comment, 'status', r.status, 'created_at', r.created_at,
        'role', case when r.client_user_id = uid then 'author' else 'provider' end) order by r.created_at, r.id), '[]'::jsonb)
      from public.service_reviews r where r.client_user_id = uid or (r.status = 'visible'
        and exists (select 1 from public.services s where s.id = r.service_id and s.owner_user_id = uid))),
    'service_reports', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'target_type', r.target_type,
        'service_id', r.service_id, 'review_id', r.review_id, 'reason', r.reason, 'detail', r.detail,
        'status', r.status, 'created_at', r.created_at) order by r.created_at, r.id), '[]'::jsonb)
      from public.service_reports r where r.reporter_user_id = uid),
    'service_activity', (select coalesce(jsonb_agg(jsonb_build_object('service_id', e.service_id, 'kind', e.kind,
        'created_at', e.created_at) order by e.created_at, e.id), '[]'::jsonb) from public.service_events e where e.actor_user_id = uid)
  )
  || jsonb_build_object(
    -- The remaining owned feature settings. Every store row is filtered by current ownership; neither provider
    -- credentials nor other buyers' receipt/customer information is part of a personal account download.
    'artist_profile', (select to_jsonb(a) - 'user_id' - 'verified_by' from public.artist_profiles a where a.user_id = uid),
    'listing_maker_details', (select coalesce(jsonb_agg(to_jsonb(d) order by d.listing_id), '[]'::jsonb)
      from public.listing_maker_details d join public.listings l on l.id = d.listing_id where l.owner_user_id = uid),
    'listing_provenance', (select coalesce(jsonb_agg(to_jsonb(p) - 'linked_by' order by p.listing_id), '[]'::jsonb)
      from public.listing_provenance p join public.listings l on l.id = p.listing_id where l.owner_user_id = uid),
    'store_locations', (select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at, l.id), '[]'::jsonb)
      from public.store_locations l join public.stores s on s.id = l.store_id where s.owner_user_id = uid),
    'inventory_serials', (select coalesce(jsonb_agg(to_jsonb(ser) - 'serial_norm' order by ser.id), '[]'::jsonb)
      from public.inventory_item_serials ser join public.store_inventory_items i on i.id = ser.item_id
      join public.stores s on s.id = i.store_id where s.owner_user_id = uid),
    'store_trade_settings', (select to_jsonb(t) from public.store_trade_settings t join public.stores s on s.id = t.store_id where s.owner_user_id = uid),
    'store_tryout_settings', (select to_jsonb(t) from public.store_tryout_settings t join public.stores s on s.id = t.store_id where s.owner_user_id = uid),
    'store_maker_profile', (select to_jsonb(m) - 'hidden_by' from public.store_maker_profiles m join public.stores s on s.id = m.store_id where s.owner_user_id = uid),
    'store_gift_policy', (select to_jsonb(g) from public.store_gift_policies g join public.stores s on s.id = g.store_id where s.owner_user_id = uid),
    'store_warranty_policies', (select coalesce(jsonb_agg(to_jsonb(w) order by w.condition_group), '[]'::jsonb)
      from public.store_warranty_policies w join public.stores s on s.id = w.store_id where s.owner_user_id = uid),
    'store_payment_methods', (select coalesce(jsonb_agg(to_jsonb(m) - 'reviewed_by' order by m.method), '[]'::jsonb)
      from public.store_payment_methods m join public.stores s on s.id = m.store_id where s.owner_user_id = uid),
    'store_installment_offer', (select to_jsonb(o) - 'reviewed_by' from public.store_installment_offers o join public.stores s on s.id = o.store_id where s.owner_user_id = uid),
    'dealer_authorizations', (select coalesce(jsonb_agg(to_jsonb(a) - 'created_by' - 'reviewed_by' - 'document_sha256' order by a.created_at, a.id), '[]'::jsonb)
      from public.store_dealer_authorizations a join public.stores s on s.id = a.store_id where s.owner_user_id = uid),
    'mercadolibre_connection', (select jsonb_build_object('nickname', c.ml_nickname, 'user_id', c.ml_user_id,
        'scope', c.scope, 'connected_at', c.connected_at, 'updated_at', c.updated_at)
      from public.store_mercadolibre_connections c join public.stores s on s.id = c.store_id where s.owner_user_id = uid),
    'einvoice_settings', (select jsonb_build_object('provider', e.provider, 'api_url', e.api_url,
        'boleta_series', e.boleta_series, 'factura_series', e.factura_series, 'next_boleta_number', e.next_boleta_number,
        'next_factura_number', e.next_factura_number, 'igv_affectation', e.igv_affectation, 'email_customer', e.email_customer,
        'connected_at', e.connected_at, 'checked_at', e.checked_at)
      from public.store_einvoice_settings e join public.stores s on s.id = e.store_id where s.owner_user_id = uid)
  );
end;
$$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;


notify pgrst, 'reload schema';
