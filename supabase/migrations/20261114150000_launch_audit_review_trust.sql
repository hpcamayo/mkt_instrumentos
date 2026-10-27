-- Launch audit A17: confirmed sales and reviews could be farmed with a second account.
--
-- Before: the seller card counted every confirmed sale, and a buyer's review showed as soon as both sides had reviewed
-- or the review period ended. A seller with a second free account could contact their own listing, mark it sold, pick
-- that account as the buyer, confirm and leave five stars, once per listing.
--
-- After:
-- 1. The seller card counts buyers, not sales: each buyer once, and only once their account is a week old with a
--    confirmed e-mail (laria_private.counted_buyers). The key stays verified_sales; the card reads it as buyers.
-- 2. A buyer's review of the seller waits for Admin (transaction_reviews.held_at) when any of these holds
--    (laria_private.review_hold_reasons, kept in laria_private.review_holds):
--    first_reviews      the seller has fewer than three published reviews from buyers;
--    new_account        the buyer's account is less than a week old;
--    email_unconfirmed  the buyer has not confirmed their e-mail;
--    repeat_buyer       the buyer already reviewed this seller for another sale;
--    same_browser       the buyer and the seller (or a member of the store) used the same browser on Laria: the
--                       signed first-party session that marketplace events carry;
--    same_phone         the buyer's phone matches the seller's, the store's or the listing's WhatsApp number.
--    A held review shows nowhere and counts for nothing; the other side's review shows as before. Admin sees held
--    reviews in the Reseñas queue with their reasons, and publishes one (public.publish_held_review) or hides it
--    (public.moderate_review, unchanged). Once published, it shows by the usual rule.
-- 3. The transaction page tells a buyer their review waits for Laria (own_review.held_at), and tells the seller when
--    the buyer's review waits (counterpart_review_held), once reviews would otherwise show.
--
-- A seller's reviews to buyers are not held. Reviews submitted before this migration are not held.
--
-- Compatibility: every function keeps its signature and its result's keys; get_transaction_detail and the Reseñas
-- queue items gain keys. The site before the deploy keeps working: it shows the count under its old label, and a held
-- review in the queue with only "Ocultar reseña".
-- Locks: adding the nullable column takes a brief ACCESS EXCLUSIVE lock on transaction_reviews. The index on
-- marketplace_events covers signed-in visitors' events only, and blocks writes to the events while it builds (seconds
-- for a few million rows). Every lock wait is capped at 10 seconds.
-- Rollback: recreate the six functions from the migrations named next to each, then drop publish_held_review,
-- review_hold_reasons, counted_buyers, laria_private.review_holds, the index and the column. Reviews still held
-- then show at once.

set lock_timeout = '10s';

-- ----------------------------------------------------------------------------------------------- 1. what is kept

alter table public.transaction_reviews add column if not exists held_at timestamptz;
comment on column public.transaction_reviews.held_at is
  'Set while a buyer''s review waits for Admin (launch audit A17); a held review shows nowhere. Reasons in laria_private.review_holds.';

-- Why a review is held. Only the database's own functions read it.
create table if not exists laria_private.review_holds (
  review_id uuid primary key references public.transaction_reviews(id) on delete cascade,
  reasons text[] not null check (
    cardinality(reasons) > 0
    and reasons <@ array['first_reviews', 'new_account', 'email_unconfirmed', 'repeat_buyer', 'same_browser', 'same_phone']
  ),
  created_at timestamptz not null default now()
);
alter table laria_private.review_holds enable row level security;
revoke all on laria_private.review_holds from public, anon, authenticated;

-- same_browser looks up a person's sessions, then whether someone else used one of them.
create index if not exists marketplace_events_actor_session_idx on public.marketplace_events(actor_user_id, session_id)
  where actor_user_id is not null and session_id is not null;

-- ----------------------------------------------------------------------------------------------- 2. the rules

-- The buyers behind a seller's confirmed sales: a store's (p_store_id) or a Particular's outside any store
-- (p_seller_user_id). Each buyer once, and only once their account is a week old with a confirmed e-mail.
create or replace function laria_private.counted_buyers(p_seller_user_id uuid, p_store_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  buyers integer;
begin
  if p_store_id is not null then
    select count(distinct vt.buyer_user_id) into buyers
    from public.verified_transactions vt
    join auth.users u on u.id = vt.buyer_user_id
    where vt.store_id = p_store_id
      and u.created_at <= now() - interval '7 days'
      and coalesce(u.email_confirmed_at, u.confirmed_at) is not null;
  else
    select count(distinct vt.buyer_user_id) into buyers
    from public.verified_transactions vt
    join auth.users u on u.id = vt.buyer_user_id
    where vt.seller_user_id = p_seller_user_id and vt.store_id is null
      and u.created_at <= now() - interval '7 days'
      and coalesce(u.email_confirmed_at, u.confirmed_at) is not null;
  end if;
  return coalesce(buyers, 0);
end;
$$;
revoke all on function laria_private.counted_buyers(uuid, uuid) from public, anon, authenticated;

-- Why the buyer's review of this sale waits for Admin; empty when it does not. The seller's side is the seller and,
-- for a store's sale, every member of the store.
create or replace function laria_private.review_hold_reasons(p_transaction_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sale public.verified_transactions;
  seller_side uuid[];
  published integer;
  buyer_created timestamptz;
  buyer_confirmed timestamptz;
  buyer_phone text;
  reasons text[] := '{}';
begin
  select * into sale from public.verified_transactions where id = p_transaction_id;
  if not found then return reasons; end if;

  seller_side := array[sale.seller_user_id];
  if sale.store_id is not null then
    seller_side := seller_side
      || array(select m.user_id from public.store_members m where m.store_id = sale.store_id)
      || array(select s.owner_user_id from public.stores s where s.id = sale.store_id and s.owner_user_id is not null);
  end if;

  if sale.store_id is not null then
    select count(*) into published from (
      select 1 from public.transaction_reviews r
      where r.subject_store_id = sale.store_id and r.direction = 'buyer_to_seller'
        and r.held_at is null and r.admin_hidden_at is null and r.transaction_id <> sale.id
      limit 3
    ) earlier;
  else
    select count(*) into published from (
      select 1 from public.transaction_reviews r
      where r.subject_user_id = sale.seller_user_id and r.direction = 'buyer_to_seller'
        and r.held_at is null and r.admin_hidden_at is null and r.transaction_id <> sale.id
      limit 3
    ) earlier;
  end if;
  if published < 3 then reasons := reasons || 'first_reviews'::text; end if;

  select u.created_at, coalesce(u.email_confirmed_at, u.confirmed_at) into buyer_created, buyer_confirmed
  from auth.users u where u.id = sale.buyer_user_id;
  if buyer_created is null or buyer_created > now() - interval '7 days' then
    reasons := reasons || 'new_account'::text;
  end if;
  if buyer_confirmed is null then reasons := reasons || 'email_unconfirmed'::text; end if;

  if sale.store_id is not null then
    if exists (
      select 1 from public.transaction_reviews r
      where r.subject_store_id = sale.store_id and r.direction = 'buyer_to_seller'
        and r.reviewer_user_id = sale.buyer_user_id and r.transaction_id <> sale.id
    ) then reasons := reasons || 'repeat_buyer'::text; end if;
  elsif exists (
    select 1 from public.transaction_reviews r
    where r.subject_user_id = sale.seller_user_id and r.direction = 'buyer_to_seller'
      and r.reviewer_user_id = sale.buyer_user_id and r.transaction_id <> sale.id
  ) then reasons := reasons || 'repeat_buyer'::text;
  end if;

  if exists (
    select 1
    from public.marketplace_events buyer_event
    join public.marketplace_events seller_event
      on seller_event.session_id = buyer_event.session_id and seller_event.actor_user_id = any(seller_side)
      and seller_event.actor_user_id is not null and seller_event.session_id is not null
    where buyer_event.actor_user_id = sale.buyer_user_id
      and buyer_event.actor_user_id is not null and buyer_event.session_id is not null
  ) then reasons := reasons || 'same_browser'::text; end if;

  -- The last nine digits: a Peruvian mobile number with or without +51.
  select right(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'), 9) into buyer_phone
  from public.profiles p where p.id = sale.buyer_user_id;
  if length(buyer_phone) = 9 and (
    exists (select 1 from public.profiles p where p.id = any(seller_side)
      and right(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'), 9) = buyer_phone)
    or exists (select 1 from public.stores s where s.id = sale.store_id
      and right(regexp_replace(coalesce(s.whatsapp_phone, ''), '[^0-9]', '', 'g'), 9) = buyer_phone)
    or exists (select 1 from public.listings l where l.id = sale.listing_id
      and right(regexp_replace(coalesce(l.whatsapp_phone, ''), '[^0-9]', '', 'g'), 9) = buyer_phone)
  ) then reasons := reasons || 'same_phone'::text; end if;

  return reasons;
end;
$$;
revoke all on function laria_private.review_hold_reasons(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------------------------- 3. submitting a review

-- From 20260918120000_sprint_6_transactions_reviews.sql. A buyer's review is held when review_hold_reasons gives a
-- reason, and "Ambas reseñas" goes out only once neither review is held. The deal-trust batch on features/marketplace
-- patches the notification line in place, so that line stays as it was.
create or replace function public.submit_transaction_review(p_transaction_id uuid,p_rating integer,p_comment text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare transaction_record public.verified_transactions; review_uuid uuid; review_direction text; subject_user uuid; subject_store uuid; clean_comment text; hold_reasons text[]:='{}';
begin
 if auth.uid() is null then raise exception using errcode='42501',message='REVIEW_AUTH_REQUIRED'; end if;
 select * into transaction_record from public.verified_transactions where id=p_transaction_id for update;
 if not found then raise exception 'REVIEW_TRANSACTION_INVALID'; end if;
 if clock_timestamp()>=transaction_record.review_deadline then raise exception 'REVIEW_WINDOW_CLOSED'; end if;
 if p_rating is null or p_rating not between 1 and 5 then raise exception 'REVIEW_RATING_INVALID'; end if;
 clean_comment:=nullif(trim(coalesce(p_comment,'')),'');
 if clean_comment is not null and length(clean_comment)>2000 then raise exception 'REVIEW_COMMENT_TOO_LONG'; end if;
 if auth.uid()=transaction_record.buyer_user_id then
  review_direction:='buyer_to_seller'; subject_user:=case when transaction_record.store_id is null then transaction_record.seller_user_id end; subject_store:=transaction_record.store_id;
  hold_reasons:=laria_private.review_hold_reasons(transaction_record.id);
 elsif auth.uid()=transaction_record.seller_user_id then
  review_direction:='seller_to_buyer'; subject_user:=transaction_record.buyer_user_id;
 else raise exception 'REVIEW_PARTICIPANT_REQUIRED'; end if;
 insert into public.transaction_reviews(transaction_id,direction,reviewer_user_id,subject_user_id,subject_store_id,rating,comment,held_at)
 values(transaction_record.id,review_direction,auth.uid(),subject_user,subject_store,p_rating,clean_comment,
  case when cardinality(hold_reasons)>0 then now() end) returning id into review_uuid;
 if cardinality(hold_reasons)>0 then
  insert into laria_private.review_holds(review_id,reasons) values(review_uuid,hold_reasons);
 end if;
 insert into public.marketplace_events(event_type,listing_id,store_id,seller_user_id,actor_user_id,source,dedupe_key)
 values('review_submitted',transaction_record.listing_id,transaction_record.store_id,transaction_record.seller_user_id,auth.uid(),'system','review_submitted:'||review_uuid);
 if (select count(*) from public.transaction_reviews where transaction_id=transaction_record.id)=2
  and not exists(select 1 from public.transaction_reviews where transaction_id=transaction_record.id and held_at is not null) then
  insert into public.notifications(user_id,event_type,message,listing_id,store_id,transaction_id)
  select recipient,'review_revealed','Ambas reseñas fueron enviadas y ya están visibles.',transaction_record.listing_id,transaction_record.store_id,transaction_record.id
  from (values(transaction_record.seller_user_id),(transaction_record.buyer_user_id)) recipients(recipient) on conflict do nothing;
 end if;
 return review_uuid;
exception when unique_violation then raise exception 'REVIEW_ALREADY_SUBMITTED';
end $$;
revoke all on function public.submit_transaction_review(uuid,integer,text) from public;
grant execute on function public.submit_transaction_review(uuid,integer,text) to anon,authenticated;

-- From 20260918120000_sprint_6_transactions_reviews.sql: a held review shows nowhere. Every public page reads reviews
-- through this function (get_reputation, get_public_review_page, get_public_store_directory, get_transaction_detail).
create or replace function laria_private.review_is_visible(p_review_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.transaction_reviews r join public.verified_transactions t on t.id=r.transaction_id
  where r.id=p_review_id and r.admin_hidden_at is null and r.held_at is null and
   (t.review_deadline<=now() or (select count(*) from public.transaction_reviews pair where pair.transaction_id=t.id)=2))
$$;
revoke all on function laria_private.review_is_visible(uuid) from public,anon,authenticated;

-- ------------------------------------------------------------------------------------------ 4. Admin publishes

-- A held review then shows by the usual rule: once both sides have reviewed or the review period has ended. The sale
-- is locked first, as submit_transaction_review does, so a review arriving at the same time sees the hold or its end.
create or replace function public.publish_held_review(p_review_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  review_record public.transaction_reviews;
  sale public.verified_transactions;
  held_for text[];
begin
  perform laria_private.assert_admin();
  select * into review_record from public.transaction_reviews where id = p_review_id;
  if not found then raise exception 'REVIEW_NOT_FOUND'; end if;
  select * into sale from public.verified_transactions where id = review_record.transaction_id for update;
  select * into review_record from public.transaction_reviews where id = p_review_id for update;
  if review_record.held_at is null then return true; end if;
  if review_record.admin_hidden_at is not null then raise exception 'REVIEW_HIDDEN'; end if;

  update public.transaction_reviews set held_at = null where id = p_review_id;
  delete from laria_private.review_holds where review_id = p_review_id returning review_holds.reasons into held_for;
  perform laria_private.record_admin_audit('review_published', 'review', p_review_id,
    jsonb_build_object('reasons', coalesce(to_jsonb(held_for), '[]'::jsonb)));

  if sale.listing_id is not null
    and (select count(*) from public.transaction_reviews where transaction_id = sale.id) = 2
    and not exists (select 1 from public.transaction_reviews where transaction_id = sale.id and held_at is not null) then
    insert into public.notifications(user_id, event_type, message, listing_id, store_id, transaction_id)
    select recipient, 'review_revealed', 'Ambas reseñas fueron enviadas y ya están visibles.', sale.listing_id, sale.store_id, sale.id
    from (values (sale.seller_user_id), (sale.buyer_user_id)) recipients(recipient)
    on conflict do nothing;
  end if;
  return true;
end;
$$;
revoke all on function public.publish_held_review(uuid) from public, anon;
grant execute on function public.publish_held_review(uuid) to authenticated;

-- ------------------------------------------------------------------------------------------ 5. Admin's queue

-- From 20261112120000_launch_audit_security.sql: Reseñas counts held reviews too.
create or replace function public.get_admin_moderation_counts()
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
begin
  perform laria_private.assert_admin();
  return jsonb_build_object(
    'publicaciones', (select count(*) from public.listings where status = 'pending'),
    'revisiones', (select count(*) from public.listing_revisions where status = 'pending'),
    'tiendas', (select count(*) from public.stores where status = 'pending'),
    -- Only a verified Tienda whose identity changed is pending work (A09). A normal Tienda is a valid terminal trust
    -- tier, so active and unverified alone is not.
    'verificacion', (
      select count(*) from public.stores
      where status = 'active' and not is_verified and verification_lapsed_at is not null
    ),
    'reportes', (select count(*) from public.reports where status = 'open'),
    -- A review held for Admin (launch audit A17), or a shown one with an open report.
    'resenas', (
      select count(*)
      from public.transaction_reviews tr
      join public.verified_transactions vt on vt.id = tr.transaction_id
      where tr.admin_hidden_at is null
        and (
          tr.held_at is not null
          or (
            tr.id in (select r.review_id from public.reports r where r.target_type = 'review' and r.status = 'open')
            and (
              vt.review_deadline <= now()
              or (select count(*) from public.transaction_reviews pair where pair.transaction_id = vt.id) = 2
            )
          )
        )
    )
  );
end;
$$;

-- From 20261112120000_launch_audit_security.sql: the Reseñas queue lists held reviews with their reasons, the reviewer's
-- account and who they reviewed, next to the reported ones as before. The deal-trust batch on features/marketplace
-- patches the listings join and the listing columns of this list in place, so those lines stay as they were.
create or replace function public.get_admin_moderation_queue(p_queue text, p_page integer default 1, p_page_size integer default 20)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $function$
declare
  result jsonb;
  item_count bigint;
  row_offset integer;
begin
  perform laria_private.assert_admin();
  if p_queue not in ('publicaciones', 'revisiones', 'tiendas', 'verificacion', 'reportes', 'resenas') then
    raise exception 'ADMIN_QUEUE_INVALID';
  end if;
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size not between 1 and 25 then
    raise exception 'ADMIN_PAGINATION_INVALID';
  end if;
  row_offset := (p_page - 1) * p_page_size;

  if p_queue = 'publicaciones' then
    select count(*) into item_count from public.listings where status = 'pending';
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at, q.id), '[]'::jsonb) into result
    from (
      select l.id, l.title, l.status::text status, l.seller_type::text seller_type,
        l.created_at, l.owner_user_id, l.store_id, l.price_pen, l.condition,
        l.description, l.city, l.region,
        coalesce(s.name, p.full_name, l.contact_name, 'Vendedor de Laria') owner_name,
        l.category, l.brand, l.model, photos.first_photo_url,
        (select c.clip_url from public.listing_sound_clips c where c.listing_id = l.id) sound_clip_url,
        coalesce(photos.photo_count, 0) photo_count
      from public.listings l
      left join public.stores s on s.id = l.store_id
      left join public.profiles p on p.id = l.owner_user_id
      left join lateral (
        select
          (array_agg(lp.image_url order by lp.sort_order, lp.id))[1] first_photo_url,
          count(*) photo_count
        from public.listing_photos lp
        where lp.listing_id = l.id
      ) photos on true
      where l.status = 'pending'
      order by l.created_at, l.id
      limit p_page_size offset row_offset
    ) q;
  elsif p_queue = 'revisiones' then
    select count(*) into item_count from public.listing_revisions where status = 'pending';
    select coalesce(jsonb_agg(to_jsonb(q) order by q.submitted_at, q.id), '[]'::jsonb) into result
    from (
      select r.id, r.listing_id, r.version, r.changed_fields, r.submitted_at,
        l.title listing_title, p.full_name owner_name,
        jsonb_build_object(
          'title', l.title, 'category', l.category, 'instrument_type', l.instrument_type,
          'brand', l.brand, 'model', l.model, 'condition', l.condition,
          'attributes', l.attributes
        ) current_values,
        jsonb_build_object(
          'title', case when 'title' = any(r.changed_fields) then r.title else l.title end,
          'category', case when 'category' = any(r.changed_fields) then r.category else l.category end,
          'instrument_type', case when 'instrument_type' = any(r.changed_fields) then r.instrument_type else l.instrument_type end,
          'brand', case when 'brand' = any(r.changed_fields) then r.brand else l.brand end,
          'model', case when 'model' = any(r.changed_fields) then r.model else l.model end,
          'condition', case when 'condition' = any(r.changed_fields) then r.condition else l.condition end,
          'attributes', case when 'attributes' = any(r.changed_fields) then r.attributes else l.attributes end
        ) proposed_values,
        coalesce((
          select jsonb_agg(to_jsonb(photo) order by photo.sort_order, photo.id)
          from (
            select lp.id, lp.image_url, lp.alt_text, lp.sort_order
            from public.listing_photos lp where lp.listing_id = l.id
            order by lp.sort_order, lp.id limit 10
          ) photo
        ), '[]'::jsonb) current_photos,
        coalesce((
          select jsonb_agg(to_jsonb(photo) order by photo.sort_order, photo.id)
          from (
            select rp.id, rp.image_url, rp.alt_text, rp.sort_order
            from public.listing_revision_photos rp where rp.revision_id = r.id
            order by rp.sort_order, rp.id limit 10
          ) photo
        ), '[]'::jsonb) proposed_photos,
        (select count(*) from public.listing_revision_photos rp where rp.revision_id = r.id) proposed_photo_count
      from public.listing_revisions r
      join public.listings l on l.id = r.listing_id
      left join public.profiles p on p.id = r.owner_user_id
      where r.status = 'pending'
      order by r.submitted_at, r.id
      limit p_page_size offset row_offset
    ) q;
  elsif p_queue = 'tiendas' then
    select count(*) into item_count from public.stores where status = 'pending';
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at, q.id), '[]'::jsonb) into result
    from (
      select s.id, s.name, s.razon_social, s.ruc, s.city, s.region, s.district,
        s.address, s.created_at, s.owner_user_id, p.full_name owner_name,
        s.email, s.contact_person, s.contact_name, s.whatsapp_phone,
        s.logo_url, s.banner_url, s.instagram_url, s.facebook_url,
        s.tiktok_url, s.website_url,
        coalesce(assets.store_photos, '[]'::jsonb) store_photos
      from public.stores s
      left join public.profiles p on p.id = s.owner_user_id
      left join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'id', sp.id,
            'image_url', sp.image_url,
            'alt_text', sp.alt_text,
            'sort_order', sp.sort_order
          ) order by sp.sort_order, sp.id
        ) store_photos
        from public.store_photos sp
        where sp.store_id = s.id
      ) assets on true
      where s.status = 'pending'
      order by s.created_at, s.id
      limit p_page_size offset row_offset
    ) q;
  elsif p_queue = 'verificacion' then
    -- A09: a verified Tienda whose owner changed its public name, RUC or razon social waits here until Admin
    -- verifies it again or leaves it unverified. Any other active, unverified Tienda is a valid terminal trust tier,
    -- not pending work. Verification and revocation stay available under Tiendas.
    select count(*) into item_count from public.stores
    where status = 'active' and not is_verified and verification_lapsed_at is not null;
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at, q.id), '[]'::jsonb) into result
    from (
      select s.id, s.name, s.razon_social, s.ruc, s.city, s.region, s.district,
        s.address, s.verification_lapsed_at created_at, s.owner_user_id, p.full_name owner_name,
        s.email, s.contact_person, s.contact_name, s.whatsapp_phone,
        s.logo_url, s.banner_url, s.instagram_url, s.facebook_url,
        s.tiktok_url, s.website_url,
        'store_identity_changed' reason,
        s.verification_lapsed_from previous_identity,
        coalesce(assets.store_photos, '[]'::jsonb) store_photos
      from public.stores s
      left join public.profiles p on p.id = s.owner_user_id
      left join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'id', sp.id,
            'image_url', sp.image_url,
            'alt_text', sp.alt_text,
            'sort_order', sp.sort_order
          ) order by sp.sort_order, sp.id
        ) store_photos
        from public.store_photos sp
        where sp.store_id = s.id
      ) assets on true
      where s.status = 'active' and not s.is_verified and s.verification_lapsed_at is not null
      order by s.verification_lapsed_at, s.id
      limit p_page_size offset row_offset
    ) q;
  elsif p_queue = 'reportes' then
    select count(*) into item_count from public.reports where status = 'open';
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at, q.id), '[]'::jsonb) into result
    from (
      select r.id, r.target_type, r.reason, r.detail, r.created_at,
        r.listing_id, r.store_id, r.review_id,
        reporter.full_name reporter_name,
        case r.target_type
          when 'listing' then l.title
          when 'store' then s.name
          else coalesce(rl.title, 'Reseña verificada')
        end target_title,
        case r.target_type
          when 'listing' then l.status::text
          when 'store' then s.status::text
          else case when tr.admin_hidden_at is null then 'visible' else 'hidden' end
        end target_status,
        case r.target_type
          when 'listing' then coalesce(s.name, listing_owner.full_name, l.contact_name, 'Vendedor de Laria')
          when 'store' then coalesce(store_owner.full_name, s.contact_person, s.name)
          else coalesce(review_subject.full_name, review_subject_store.name, 'Usuario de Laria')
        end target_owner_name,
        -- Equality on the active target and NULL on the other columns keeps
        -- reports_target_status_idx usable across deep OFFSET pages.
        case r.target_type
          when 'listing' then (select count(*) from public.reports same_target
            where same_target.target_type = 'listing' and same_target.status = 'open'
              and same_target.listing_id = r.listing_id
              and same_target.store_id is null
              and same_target.review_id is null)
          when 'store' then (select count(*) from public.reports same_target
            where same_target.target_type = 'store' and same_target.status = 'open'
              and same_target.listing_id is null
              and same_target.store_id = r.store_id
              and same_target.review_id is null)
          when 'review' then (select count(*) from public.reports same_target
            where same_target.target_type = 'review' and same_target.status = 'open'
              and same_target.listing_id is null
              and same_target.store_id is null
              and same_target.review_id = r.review_id)
        end open_target_report_count
      from public.reports r
      join public.profiles reporter on reporter.id = r.reporter_user_id
      left join public.listings l on l.id = r.listing_id
      left join public.profiles listing_owner on listing_owner.id = l.owner_user_id
      left join public.stores s on s.id = coalesce(r.store_id, l.store_id)
      left join public.profiles store_owner on store_owner.id = s.owner_user_id
      left join public.transaction_reviews tr on tr.id = r.review_id
      left join public.verified_transactions vt on vt.id = tr.transaction_id
      left join public.listings rl on rl.id = vt.listing_id
      left join public.profiles review_subject on review_subject.id = tr.subject_user_id
      left join public.stores review_subject_store on review_subject_store.id = tr.subject_store_id
      where r.status = 'open'
      order by r.created_at, r.id
      limit p_page_size offset row_offset
    ) q;
  else
    -- A17: a review held for Admin waits here with its reasons (laria_private.review_holds) and the reviewer's account,
    -- whether or not it is revealed yet; a shown review waits here while it has an open report, as before.
    select count(*) into item_count
    from public.transaction_reviews tr
    join public.verified_transactions vt on vt.id = tr.transaction_id
    where tr.admin_hidden_at is null
      and (
        tr.held_at is not null
        or (
          tr.id in (select r.review_id from public.reports r where r.target_type = 'review' and r.status = 'open')
          and (
            vt.review_deadline <= now()
            or (select count(*) from public.transaction_reviews pair where pair.transaction_id = vt.id) = 2
          )
        )
      );
    select coalesce(jsonb_agg(to_jsonb(q) order by q.submitted_at, q.id), '[]'::jsonb) into result
    from (
      select tr.id, tr.transaction_id, tr.direction, tr.rating, tr.comment,
        tr.submitted_at, tr.admin_hidden_at, tr.admin_hidden_reason,
        l.id listing_id, l.title listing_title,
        (select count(*) from public.reports r where r.review_id = tr.id and r.status = 'open') open_report_count,
        tr.held_at,
        (select to_jsonb(h.reasons) from laria_private.review_holds h where h.review_id = tr.id) hold_reasons,
        reviewer.full_name reviewer_name,
        reviewer_account.created_at reviewer_since,
        coalesce(reviewer_account.email_confirmed_at, reviewer_account.confirmed_at) is not null reviewer_email_confirmed,
        coalesce(subject_store.name, subject.full_name, 'Usuario de Laria') reviewed_name
      from public.transaction_reviews tr
      join public.verified_transactions vt on vt.id = tr.transaction_id
      join public.listings l on l.id = vt.listing_id
      left join public.profiles reviewer on reviewer.id = tr.reviewer_user_id
      left join auth.users reviewer_account on reviewer_account.id = tr.reviewer_user_id
      left join public.profiles subject on subject.id = tr.subject_user_id
      left join public.stores subject_store on subject_store.id = tr.subject_store_id
      where tr.admin_hidden_at is null
        and (
          tr.held_at is not null
          or (
            tr.id in (select r.review_id from public.reports r where r.target_type = 'review' and r.status = 'open')
            and (
              vt.review_deadline <= now()
              or (select count(*) from public.transaction_reviews pair where pair.transaction_id = vt.id) = 2
            )
          )
        )
      order by tr.submitted_at, tr.id
      limit p_page_size offset row_offset
    ) q;
  end if;

  return jsonb_build_object(
    'queue', p_queue,
    'page', p_page,
    'page_size', p_page_size,
    'total', item_count,
    'counts', public.get_admin_moderation_counts(),
    'items', coalesce(result, '[]'::jsonb)
  );
end;
$function$;

-- ------------------------------------------------------------------------------------------ 6. what pages show

-- From 20261109120000_ux_effortless_integration.sql: verified_sales counts buyers (laria_private.counted_buyers).
create or replace function public.get_public_seller_facts(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  listing_row public.listings;
  store_row public.stores;
  owner_id uuid;
  last_seen timestamptz;
  sales integer;
  verified_since timestamptz;
  facts jsonb;
begin
  select * into listing_row from public.listings where id = p_listing_id;
  if listing_row.id is null
     or not (public.listing_is_public(p_listing_id) or listing_row.status = 'sold') then
    return null;
  end if;

  if listing_row.seller_type = 'store' and listing_row.store_id is not null then
    select * into store_row from public.stores where id = listing_row.store_id and status = 'active';
    if store_row.id is null then return null; end if;
    owner_id := store_row.owner_user_id;
    sales := laria_private.counted_buyers(null, store_row.id);
  else
    owner_id := listing_row.owner_user_id;
    if owner_id is not null then
      sales := laria_private.counted_buyers(owner_id, null);
    end if;
  end if;

  if owner_id is not null then
    select u.last_sign_in_at into last_seen from auth.users u where u.id = owner_id;
  end if;

  facts := jsonb_build_object(
    'member_since', case
      when store_row.id is not null then store_row.created_at
      else (select p.created_at from public.profiles p where p.id = owner_id) end,
    'last_active', case
      when last_seen is null then null
      when last_seen >= now() - interval '1 day' then 'today'
      when last_seen >= now() - interval '7 days' then 'week'
      when last_seen >= now() - interval '30 days' then 'month'
      else null end,
    'verified_sales', coalesce(sales, 0),
    'email_confirmed', owner_id is not null and exists (
      select 1 from auth.users u where u.id = owner_id and coalesce(u.email_confirmed_at, u.confirmed_at) is not null)
  );

  if store_row.id is not null and store_row.is_verified then
    select max(a.created_at) into verified_since
    from public.admin_audit_actions a
    where a.target_type = 'store' and a.target_id = store_row.id and a.action = 'store_verified';

    facts := facts || jsonb_build_object('store', jsonb_build_object(
      'ruc', store_row.ruc,
      'razon_social', store_row.razon_social,
      -- list-12: the street only while the store shows it on its page; otherwise only that Laria checked one.
      'address', store_row.public_address,
      'address_checked', nullif(btrim(coalesce(store_row.address, '')), '') is not null,
      'district', store_row.district,
      'city', store_row.city,
      'phone_on_file', regexp_replace(coalesce(store_row.whatsapp_phone, ''), '[^0-9]', '', 'g') <> '',
      'verified_since', verified_since
    ));
  end if;

  return facts;
end;
$$;

revoke all on function public.get_public_seller_facts(uuid) from public;
grant execute on function public.get_public_seller_facts(uuid) to anon, authenticated, service_role;

-- From 20261105120200_ux_my_listings_pendientes.sql: counterpart_review_held says the other side's review waits for
-- Laria, once reviews would otherwise show. own_review carries held_at.
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
  'counterpart_review_held',transaction_record.id is not null
   and (transaction_record.review_deadline<=now() or (select count(*) from public.transaction_reviews pair where pair.transaction_id=transaction_record.id)=2)
   and exists(select 1 from public.transaction_reviews r where r.transaction_id=transaction_record.id and r.reviewer_user_id<>auth.uid()
    and r.held_at is not null and r.admin_hidden_at is null),
  'seller_verified_sales',case when role='seller' then (select count(*) from public.verified_transactions t where t.seller_user_id=item.owner_user_id
   and t.store_id is not distinct from item.store_id) end) into result;
 return result;
end $$;

reset lock_timeout;
