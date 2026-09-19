-- Sprint 6: buyer-confirmed Laria transactions and immutable double-blind reviews.
-- No historic buyer is inferred, no email is sent, and events remain secondary audit signals.

create schema if not exists laria_private authorization postgres;
revoke all on schema laria_private from public,anon,authenticated;

create table public.transaction_claims (
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null references public.listings(id) on delete restrict,
 seller_user_id uuid not null references public.profiles(id) on delete restrict,
 store_id uuid references public.stores(id) on delete restrict,
 buyer_user_id uuid references public.profiles(id) on delete restrict,
 attribution_type text not null check(attribution_type in ('laria','external')),
 status text not null check(status in ('pending','confirmed','declined','cancelled','superseded','external')),
 created_at timestamptz not null default now(),
 responded_at timestamptz,
 ended_at timestamptz,
 constraint transaction_claims_identity_check check(
  (attribution_type='laria' and buyer_user_id is not null and status in ('pending','confirmed','declined','cancelled','superseded'))
  or (attribution_type='external' and buyer_user_id is null and status in ('external','superseded'))
 )
);
create unique index transaction_claims_one_active_idx on public.transaction_claims(listing_id)
 where status in ('pending','confirmed','external');
create index transaction_claims_buyer_idx on public.transaction_claims(buyer_user_id,created_at desc) where buyer_user_id is not null;
create index transaction_claims_seller_idx on public.transaction_claims(seller_user_id,created_at desc);
create index transaction_claims_listing_history_idx on public.transaction_claims(listing_id,created_at desc);

create table public.verified_transactions (
 id uuid primary key default gen_random_uuid(),
 claim_id uuid not null unique references public.transaction_claims(id) on delete restrict,
 listing_id uuid not null unique references public.listings(id) on delete restrict,
 seller_user_id uuid not null references public.profiles(id) on delete restrict,
 store_id uuid references public.stores(id) on delete restrict,
 buyer_user_id uuid not null references public.profiles(id) on delete restrict,
 seller_identity_type text not null check(seller_identity_type in ('particular','store')),
 sold_at timestamptz not null,
 verified_at timestamptz not null default now(),
 review_deadline timestamptz not null,
 constraint verified_transactions_identity_check check(
  (seller_identity_type='particular' and store_id is null)
  or (seller_identity_type='store' and store_id is not null)
 ),
 constraint verified_transactions_parties_check check(buyer_user_id<>seller_user_id),
 constraint verified_transactions_deadline_check check(review_deadline=verified_at+interval '10 days')
);
create index verified_transactions_buyer_idx on public.verified_transactions(buyer_user_id,verified_at desc);
create index verified_transactions_seller_idx on public.verified_transactions(seller_user_id,verified_at desc);
create index verified_transactions_store_idx on public.verified_transactions(store_id,verified_at desc) where store_id is not null;
create index verified_transactions_open_reviews_idx on public.verified_transactions(review_deadline,id);

create table public.transaction_reviews (
 id uuid primary key default gen_random_uuid(),
 transaction_id uuid not null references public.verified_transactions(id) on delete restrict,
 direction text not null check(direction in ('buyer_to_seller','seller_to_buyer')),
 reviewer_user_id uuid not null references public.profiles(id) on delete restrict,
 subject_user_id uuid references public.profiles(id) on delete restrict,
 subject_store_id uuid references public.stores(id) on delete restrict,
 rating smallint not null check(rating between 1 and 5),
 comment text,
 submitted_at timestamptz not null default now(),
 admin_hidden_at timestamptz,
 admin_hidden_by uuid references public.profiles(id) on delete restrict,
 admin_hidden_reason text,
 constraint transaction_reviews_direction_unique unique(transaction_id,direction),
 constraint transaction_reviews_subject_check check((subject_user_id is null)<>(subject_store_id is null)),
 constraint transaction_reviews_comment_check check(comment is null or (length(comment)<=2000 and comment=trim(comment))),
 constraint transaction_reviews_admin_hide_check check(
  (admin_hidden_at is null and admin_hidden_by is null and admin_hidden_reason is null)
  or (admin_hidden_at is not null and admin_hidden_by is not null and length(trim(admin_hidden_reason)) between 3 and 500)
 )
);
create index transaction_reviews_subject_user_idx on public.transaction_reviews(subject_user_id,submitted_at desc) where subject_user_id is not null;
create index transaction_reviews_subject_store_idx on public.transaction_reviews(subject_store_id,submitted_at desc) where subject_store_id is not null;
create index transaction_reviews_transaction_idx on public.transaction_reviews(transaction_id,direction);

create table public.review_reports (
 id uuid primary key default gen_random_uuid(),
 review_id uuid not null references public.transaction_reviews(id) on delete restrict,
 reporter_user_id uuid not null references public.profiles(id) on delete restrict,
 reason text not null check(reason in ('acoso','contenido_inapropiado','informacion_falsa','spam','otro')),
 detail text check(detail is null or (length(detail)<=1000 and detail=trim(detail))),
 status text not null default 'open' check(status in ('open','resolved','dismissed')),
 created_at timestamptz not null default now(),
 resolved_at timestamptz,
 resolved_by uuid references public.profiles(id) on delete restrict,
 resolution_reason text,
 unique(review_id,reporter_user_id),
 constraint review_reports_resolution_check check(
  (status='open' and resolved_at is null and resolved_by is null and resolution_reason is null)
  or (status<>'open' and resolved_at is not null and resolved_by is not null and length(trim(resolution_reason)) between 3 and 500)
 )
);
create index review_reports_open_idx on public.review_reports(created_at,id) where status='open';
create index review_reports_review_idx on public.review_reports(review_id,created_at desc);

create table public.review_moderation_actions (
 id uuid primary key default gen_random_uuid(),
 review_id uuid not null references public.transaction_reviews(id) on delete restrict,
 admin_user_id uuid not null references public.profiles(id) on delete restrict,
 action text not null check(action in ('hide','restore')),
 reason text not null check(length(trim(reason)) between 3 and 500),
 created_at timestamptz not null default now()
);
create index review_moderation_actions_review_idx on public.review_moderation_actions(review_id,created_at desc);

alter table public.transaction_claims enable row level security;
alter table public.verified_transactions enable row level security;
alter table public.transaction_reviews enable row level security;
alter table public.review_reports enable row level security;
alter table public.review_moderation_actions enable row level security;
revoke all on public.transaction_claims,public.verified_transactions,public.transaction_reviews,public.review_reports,public.review_moderation_actions from anon,authenticated;

-- Listing-first candidate lookup; the old actor-first index remains useful for buyer history.
create index marketplace_events_listing_contact_candidates_idx
 on public.marketplace_events(listing_id,actor_user_id,created_at desc)
 where event_type='whatsapp_contact' and actor_user_id is not null;

insert into public.marketplace_event_types(event_type) values
 ('transaction_confirmation_requested'),('buyer_transaction_confirmed'),('buyer_transaction_declined'),
 ('transaction_verified'),('review_submitted');

alter table public.notifications drop constraint notifications_event_type_check;
alter table public.notifications drop constraint notifications_target_check;
alter table public.notifications
 add column claim_id uuid references public.transaction_claims(id) on delete restrict,
 add column transaction_id uuid references public.verified_transactions(id) on delete restrict,
 add column review_id uuid references public.transaction_reviews(id) on delete restrict;
alter table public.notifications add constraint notifications_event_type_check check(event_type in
 ('listing_approved','listing_rejected','listing_hidden','listing_revision_approved','listing_revision_rejected',
  'store_approved','store_rejected','store_verified','store_verification_revoked','listing_price_drop',
  'transaction_confirmation_requested','transaction_confirmed','transaction_declined','transaction_cancelled','review_revealed'));
alter table public.notifications add constraint notifications_target_check check(
 (event_type like 'listing_%' and listing_id is not null)
 or (event_type like 'store_%' and store_id is not null)
 or (event_type in ('transaction_confirmation_requested','transaction_declined','transaction_cancelled') and claim_id is not null and listing_id is not null)
 or (event_type='transaction_confirmed' and transaction_id is not null and listing_id is not null)
 or (event_type='review_revealed' and transaction_id is not null and listing_id is not null)
);
create unique index notifications_transaction_request_idx on public.notifications(user_id,claim_id,event_type)
 where event_type='transaction_confirmation_requested';
create unique index notifications_transaction_result_idx on public.notifications(user_id,claim_id,event_type)
 where claim_id is not null and event_type in ('transaction_declined','transaction_cancelled');
create unique index notifications_transaction_verified_idx on public.notifications(user_id,transaction_id,event_type)
 where event_type='transaction_confirmed';
create unique index notifications_review_revealed_idx on public.notifications(user_id,transaction_id,event_type)
 where event_type='review_revealed';

create function public.get_eligible_transaction_buyers(p_listing_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare item public.listings; result jsonb;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='TRANSACTION_AUTH_REQUIRED'; end if;
 select * into item from public.listings where id=p_listing_id;
 if not found or item.status<>'sold' or item.owner_user_id is distinct from auth.uid() then raise exception 'TRANSACTION_LISTING_NOT_OWNED'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('buyer_user_id',candidate.actor_user_id,'display_name',p.full_name,
  'last_contact_at',candidate.last_contact_at) order by candidate.last_contact_at desc),'[]'::jsonb) into result
 from (select actor_user_id,max(created_at) last_contact_at from public.marketplace_events
  where event_type='whatsapp_contact' and listing_id=item.id and actor_user_id is not null
   and actor_user_id<>item.owner_user_id and created_at<=item.sold_at
  group by actor_user_id) candidate join public.profiles p on p.id=candidate.actor_user_id
 where not exists(select 1 from public.transaction_claims c where c.listing_id=item.id
  and c.buyer_user_id=candidate.actor_user_id and c.status in ('declined','confirmed'));
 return result;
end $$;
revoke all on function public.get_eligible_transaction_buyers(uuid) from public;
grant execute on function public.get_eligible_transaction_buyers(uuid) to anon,authenticated;

create function public.create_transaction_claim(p_listing_id uuid,p_buyer_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare item public.listings; existing public.transaction_claims; claim_uuid uuid;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='TRANSACTION_AUTH_REQUIRED'; end if;
 select * into item from public.listings where id=p_listing_id for update;
 if not found or item.status<>'sold' or item.owner_user_id is distinct from auth.uid() then raise exception 'TRANSACTION_LISTING_NOT_OWNED'; end if;
 select * into existing from public.transaction_claims where listing_id=item.id and status='pending' for update;
 if found and existing.buyer_user_id=p_buyer_user_id then return existing.id; end if;
 if exists(select 1 from public.verified_transactions where listing_id=item.id) then raise exception 'TRANSACTION_ALREADY_VERIFIED'; end if;
 if exists(select 1 from public.transaction_claims c where c.listing_id=item.id
  and c.buyer_user_id=p_buyer_user_id and c.status in ('declined','confirmed')) then
  raise exception 'TRANSACTION_BUYER_NOT_ELIGIBLE';
 end if;
 if p_buyer_user_id=item.owner_user_id or not exists(select 1 from public.marketplace_events e where e.event_type='whatsapp_contact'
  and e.listing_id=item.id and e.actor_user_id=p_buyer_user_id and e.created_at<=item.sold_at) then raise exception 'TRANSACTION_BUYER_NOT_ELIGIBLE'; end if;
 update public.transaction_claims set status='superseded',ended_at=now() where listing_id=item.id and status in ('pending','external');
 insert into public.transaction_claims(listing_id,seller_user_id,store_id,buyer_user_id,attribution_type,status)
 values(item.id,item.owner_user_id,item.store_id,p_buyer_user_id,'laria','pending') returning id into claim_uuid;
 insert into public.notifications(user_id,event_type,message,listing_id,store_id,claim_id)
 values(p_buyer_user_id,'transaction_confirmation_requested','El vendedor indicó que compraste este artículo. Confirma si corresponde.',item.id,item.store_id,claim_uuid)
 on conflict do nothing;
 insert into public.marketplace_events(event_type,listing_id,store_id,seller_user_id,actor_user_id,source,dedupe_key)
 values('transaction_confirmation_requested',item.id,item.store_id,item.owner_user_id,auth.uid(),'system','transaction_confirmation_requested:'||claim_uuid);
 return claim_uuid;
end $$;
revoke all on function public.create_transaction_claim(uuid,uuid) from public;
grant execute on function public.create_transaction_claim(uuid,uuid) to anon,authenticated;

create function public.record_external_sale(p_listing_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare item public.listings; claim_uuid uuid;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='TRANSACTION_AUTH_REQUIRED'; end if;
 select * into item from public.listings where id=p_listing_id for update;
 if not found or item.status<>'sold' or item.owner_user_id is distinct from auth.uid() then raise exception 'TRANSACTION_LISTING_NOT_OWNED'; end if;
 if exists(select 1 from public.verified_transactions where listing_id=item.id) then raise exception 'TRANSACTION_ALREADY_VERIFIED'; end if;
 select id into claim_uuid from public.transaction_claims where listing_id=item.id and status='external';
 if claim_uuid is not null then return claim_uuid; end if;
 update public.transaction_claims set status='superseded',ended_at=now() where listing_id=item.id and status in ('pending','external');
 insert into public.transaction_claims(listing_id,seller_user_id,store_id,attribution_type,status)
 values(item.id,item.owner_user_id,item.store_id,'external','external') returning id into claim_uuid;
 return claim_uuid;
end $$;
revoke all on function public.record_external_sale(uuid) from public;
grant execute on function public.record_external_sale(uuid) to anon,authenticated;

create function public.cancel_transaction_claim(p_claim_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare claim public.transaction_claims;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='TRANSACTION_AUTH_REQUIRED'; end if;
 select * into claim from public.transaction_claims where id=p_claim_id for update;
 if not found or claim.seller_user_id is distinct from auth.uid() then raise exception 'TRANSACTION_CLAIM_NOT_OWNED'; end if;
 if claim.status='cancelled' then return true; end if;
 if claim.status<>'pending' then raise exception 'TRANSACTION_CLAIM_FINAL'; end if;
 update public.transaction_claims set status='cancelled',ended_at=now() where id=claim.id;
 insert into public.notifications(user_id,event_type,message,listing_id,store_id,claim_id)
 values(claim.buyer_user_id,'transaction_cancelled','El vendedor canceló esta solicitud de confirmación.',claim.listing_id,claim.store_id,claim.id)
 on conflict do nothing;
 return true;
end $$;
revoke all on function public.cancel_transaction_claim(uuid) from public;
grant execute on function public.cancel_transaction_claim(uuid) to anon,authenticated;

create function public.respond_transaction_claim(p_claim_id uuid,p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare claim public.transaction_claims; item public.listings; transaction_uuid uuid; verified_time timestamptz;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='TRANSACTION_AUTH_REQUIRED'; end if;
 if p_confirmed is null then raise exception 'TRANSACTION_RESPONSE_INVALID'; end if;
 select * into claim from public.transaction_claims where id=p_claim_id for update;
 if not found or claim.buyer_user_id is distinct from auth.uid() then raise exception 'TRANSACTION_CLAIM_NOT_OWNED'; end if;
 if claim.status='confirmed' and p_confirmed then
  select id into transaction_uuid from public.verified_transactions where claim_id=claim.id;
  return jsonb_build_object('status','confirmed','transaction_id',transaction_uuid);
 end if;
 if claim.status='declined' and not p_confirmed then return jsonb_build_object('status','declined'); end if;
 if claim.status<>'pending' then raise exception 'TRANSACTION_CLAIM_FINAL'; end if;
 select * into item from public.listings where id=claim.listing_id for update;
 if item.status<>'sold' or item.sold_at is null then raise exception 'TRANSACTION_LISTING_NOT_SOLD'; end if;
 if not p_confirmed then
  update public.transaction_claims set status='declined',responded_at=now(),ended_at=now() where id=claim.id;
  insert into public.notifications(user_id,event_type,message,listing_id,store_id,claim_id)
  values(claim.seller_user_id,'transaction_declined','El contacto seleccionado indicó que no realizó esta compra.',claim.listing_id,claim.store_id,claim.id) on conflict do nothing;
  insert into public.marketplace_events(event_type,listing_id,store_id,seller_user_id,actor_user_id,source,dedupe_key)
  values('buyer_transaction_declined',claim.listing_id,claim.store_id,claim.seller_user_id,auth.uid(),'system','buyer_transaction_declined:'||claim.id);
  return jsonb_build_object('status','declined');
 end if;
 verified_time:=clock_timestamp();
 update public.transaction_claims set status='confirmed',responded_at=verified_time,ended_at=verified_time where id=claim.id;
 insert into public.verified_transactions(claim_id,listing_id,seller_user_id,store_id,buyer_user_id,seller_identity_type,sold_at,verified_at,review_deadline)
 values(claim.id,claim.listing_id,claim.seller_user_id,claim.store_id,claim.buyer_user_id,
  case when claim.store_id is null then 'particular' else 'store' end,item.sold_at,verified_time,verified_time+interval '10 days')
 returning id into transaction_uuid;
 insert into public.notifications(user_id,event_type,message,listing_id,store_id,claim_id,transaction_id)
 select recipient,'transaction_confirmed','La relación de compra fue confirmada. Ya pueden dejar sus reseñas durante 10 días.',claim.listing_id,claim.store_id,claim.id,transaction_uuid
 from (values(claim.seller_user_id),(claim.buyer_user_id)) recipients(recipient) on conflict do nothing;
 insert into public.marketplace_events(event_type,listing_id,store_id,seller_user_id,actor_user_id,source,dedupe_key) values
 ('buyer_transaction_confirmed',claim.listing_id,claim.store_id,claim.seller_user_id,auth.uid(),'system','buyer_transaction_confirmed:'||claim.id),
 ('transaction_verified',claim.listing_id,claim.store_id,claim.seller_user_id,auth.uid(),'system','transaction_verified:'||transaction_uuid);
 return jsonb_build_object('status','confirmed','transaction_id',transaction_uuid,'review_deadline',verified_time+interval '10 days');
end $$;
revoke all on function public.respond_transaction_claim(uuid,boolean) from public;
grant execute on function public.respond_transaction_claim(uuid,boolean) to anon,authenticated;

create function laria_private.review_is_visible(p_review_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.transaction_reviews r join public.verified_transactions t on t.id=r.transaction_id
  where r.id=p_review_id and r.admin_hidden_at is null and
   (t.review_deadline<=now() or (select count(*) from public.transaction_reviews pair where pair.transaction_id=t.id)=2))
$$;
revoke all on function laria_private.review_is_visible(uuid) from public,anon,authenticated;

create function public.submit_transaction_review(p_transaction_id uuid,p_rating integer,p_comment text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare transaction_record public.verified_transactions; review_uuid uuid; review_direction text; subject_user uuid; subject_store uuid; clean_comment text;
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
 elsif auth.uid()=transaction_record.seller_user_id then
  review_direction:='seller_to_buyer'; subject_user:=transaction_record.buyer_user_id;
 else raise exception 'REVIEW_PARTICIPANT_REQUIRED'; end if;
 insert into public.transaction_reviews(transaction_id,direction,reviewer_user_id,subject_user_id,subject_store_id,rating,comment)
 values(transaction_record.id,review_direction,auth.uid(),subject_user,subject_store,p_rating,clean_comment) returning id into review_uuid;
 insert into public.marketplace_events(event_type,listing_id,store_id,seller_user_id,actor_user_id,source,dedupe_key)
 values('review_submitted',transaction_record.listing_id,transaction_record.store_id,transaction_record.seller_user_id,auth.uid(),'system','review_submitted:'||review_uuid);
 if (select count(*) from public.transaction_reviews where transaction_id=transaction_record.id)=2 then
  insert into public.notifications(user_id,event_type,message,listing_id,store_id,transaction_id)
  select recipient,'review_revealed','Ambas reseñas fueron enviadas y ya están visibles.',transaction_record.listing_id,transaction_record.store_id,transaction_record.id
  from (values(transaction_record.seller_user_id),(transaction_record.buyer_user_id)) recipients(recipient) on conflict do nothing;
 end if;
 return review_uuid;
exception when unique_violation then raise exception 'REVIEW_ALREADY_SUBMITTED';
end $$;
revoke all on function public.submit_transaction_review(uuid,integer,text) from public;
grant execute on function public.submit_transaction_review(uuid,integer,text) to anon,authenticated;

create function public.get_transaction_center()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='TRANSACTION_AUTH_REQUIRED'; end if;
 with relevant as (
  select c.*,t.id transaction_id,t.verified_at,t.review_deadline,l.title,l.slug,l.sold_at,
   case when c.buyer_user_id=auth.uid() then 'buyer' else 'seller' end participant_role,
   coalesce(s.name,p.full_name,'Cuenta de Laria') seller_name,b.full_name buyer_name
  from public.transaction_claims c join public.listings l on l.id=c.listing_id
  left join public.verified_transactions t on t.claim_id=c.id left join public.stores s on s.id=c.store_id
  left join public.profiles p on p.id=c.seller_user_id left join public.profiles b on b.id=c.buyer_user_id
  where c.seller_user_id=auth.uid() or c.buyer_user_id=auth.uid()
 ), rows as (select jsonb_build_object('reference_id',coalesce(transaction_id,id),'claim_id',id,'transaction_id',transaction_id,
  'listing_id',listing_id,'title',title,'slug',slug,'sold_at',sold_at,'status',case when transaction_id is not null then 'verified' else status end,
  'attribution_type',attribution_type,'role',participant_role,'seller_name',seller_name,'buyer_name',case when participant_role='seller' then buyer_name end,
  'verified_at',verified_at,'review_deadline',review_deadline,
  'own_review_submitted',transaction_id is not null and exists(select 1 from public.transaction_reviews r where r.transaction_id=relevant.transaction_id and r.reviewer_user_id=auth.uid()),
  'reviews_revealed',transaction_id is not null and (review_deadline<=now() or (select count(*) from public.transaction_reviews r where r.transaction_id=relevant.transaction_id)=2)) value,
  created_at from relevant)
 select coalesce(jsonb_agg(value order by created_at desc),'[]'::jsonb) into result from rows;
 return result;
end $$;
revoke all on function public.get_transaction_center() from public;
grant execute on function public.get_transaction_center() to anon,authenticated;

create function public.get_transaction_detail(p_reference_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
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
   from public.transaction_reviews r join public.profiles p on p.id=r.reviewer_user_id where r.transaction_id=transaction_record.id and laria_private.review_is_visible(r.id)),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.get_transaction_detail(uuid) from public;
grant execute on function public.get_transaction_detail(uuid) to anon,authenticated;

create function laria_private.get_reputation(p_subject_user_id uuid,p_subject_store_id uuid,p_direction text,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if p_limit is null or p_limit not between 1 and 24
  or p_direction is null or p_direction not in ('buyer_to_seller','seller_to_buyer')
  or (p_subject_user_id is null)=(p_subject_store_id is null)
  or (p_direction='seller_to_buyer' and p_subject_store_id is not null) then raise exception 'REPUTATION_TARGET_INVALID'; end if;
 with visible as (select r.*,
  case when r.direction='seller_to_buyer' then coalesce(s.name,p.full_name) else p.full_name end reviewer_name
  from public.transaction_reviews r join public.verified_transactions t on t.id=r.transaction_id
  join public.profiles p on p.id=r.reviewer_user_id left join public.stores s on s.id=t.store_id
  where r.direction=p_direction and r.subject_user_id is not distinct from p_subject_user_id
   and r.subject_store_id is not distinct from p_subject_store_id and laria_private.review_is_visible(r.id)),
 totals as (select count(*) review_count,avg(rating)::numeric(3,2) average_rating from visible),
 items as (select * from visible order by submitted_at desc,id desc limit p_limit)
 select jsonb_build_object('review_count',totals.review_count,'average_rating',totals.average_rating,
  'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'rating',rating,'comment',comment,'submitted_at',submitted_at,'reviewer_name',reviewer_name) order by submitted_at desc,id desc) from items),'[]'::jsonb)) into result from totals;
 return result;
end $$;
revoke all on function laria_private.get_reputation(uuid,uuid,text,integer) from public,anon,authenticated;

create function public.get_public_reputation(p_subject_user_id uuid default null,p_subject_store_id uuid default null,p_limit integer default 5)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 return laria_private.get_reputation(p_subject_user_id,p_subject_store_id,'buyer_to_seller',p_limit);
end $$;
revoke all on function public.get_public_reputation(uuid,uuid,integer) from public;
grant execute on function public.get_public_reputation(uuid,uuid,integer) to anon,authenticated;

create function public.report_review(p_review_id uuid,p_reason text,p_detail text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare report_uuid uuid; clean_detail text;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='REPORT_AUTH_REQUIRED'; end if;
 if p_reason is null or p_reason not in ('acoso','contenido_inapropiado','informacion_falsa','spam','otro') then raise exception 'REPORT_REASON_INVALID'; end if;
 if not laria_private.review_is_visible(p_review_id) then raise exception 'REPORT_REVIEW_NOT_VISIBLE'; end if;
 clean_detail:=nullif(trim(coalesce(p_detail,'')),''); if clean_detail is not null and length(clean_detail)>1000 then raise exception 'REPORT_DETAIL_TOO_LONG'; end if;
 insert into public.review_reports(review_id,reporter_user_id,reason,detail) values(p_review_id,auth.uid(),p_reason,clean_detail)
 returning id into report_uuid; return report_uuid;
exception when unique_violation then raise exception 'REPORT_ALREADY_SUBMITTED';
end $$;
revoke all on function public.report_review(uuid,text,text) from public;
grant execute on function public.report_review(uuid,text,text) to anon,authenticated;

create function public.get_admin_review_queue()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='ADMIN_REQUIRED'; end if;
 if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
 select jsonb_build_object(
 'transactions',coalesce((select jsonb_agg(transaction_row.value order by transaction_row.created_at desc) from (
  select jsonb_build_object('claim_id',c.id,'transaction_id',t.id,'listing_id',c.listing_id,'listing_title',l.title,
   'seller_name',coalesce(s.name,seller.full_name,'Cuenta de Laria'),'buyer_name',buyer.full_name,
   'attribution_type',c.attribution_type,'status',case when t.id is not null then 'verified' else c.status end,
   'created_at',c.created_at,'responded_at',c.responded_at,'verified_at',t.verified_at) value,c.created_at
  from public.transaction_claims c join public.listings l on l.id=c.listing_id
  left join public.verified_transactions t on t.claim_id=c.id
  left join public.stores s on s.id=c.store_id
  left join public.profiles seller on seller.id=c.seller_user_id
  left join public.profiles buyer on buyer.id=c.buyer_user_id
  order by c.created_at desc limit 100
 ) transaction_row),'[]'::jsonb),
 'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'transaction_id',r.transaction_id,'direction',r.direction,
  'rating',r.rating,'comment',r.comment,'submitted_at',r.submitted_at,'hidden_at',r.admin_hidden_at,'hidden_reason',r.admin_hidden_reason,
  'listing_id',t.listing_id,'listing_title',l.title) order by r.submitted_at desc)
  from public.transaction_reviews r join public.verified_transactions t on t.id=r.transaction_id join public.listings l on l.id=t.listing_id
  where t.review_deadline<=now() or (select count(*) from public.transaction_reviews pair where pair.transaction_id=t.id)=2),'[]'::jsonb),
 'reports',coalesce((select jsonb_agg(jsonb_build_object('id',rr.id,'review_id',rr.review_id,'reason',rr.reason,'detail',rr.detail,'status',rr.status,'created_at',rr.created_at) order by rr.created_at desc) from public.review_reports rr),'[]'::jsonb),
 'moderation_history',coalesce((select jsonb_agg(jsonb_build_object('review_id',a.review_id,'action',a.action,'reason',a.reason,'created_at',a.created_at) order by a.created_at desc) from public.review_moderation_actions a),'[]'::jsonb)) into result;
 return result;
end
$$;
revoke all on function public.get_admin_review_queue() from public;
grant execute on function public.get_admin_review_queue() to anon,authenticated;

create function public.moderate_review(p_review_id uuid,p_hidden boolean,p_reason text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception using errcode='42501',message='ADMIN_REQUIRED'; end if;
 if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
 if p_hidden is null or length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'REVIEW_MODERATION_REASON_REQUIRED'; end if;
 if p_hidden then update public.transaction_reviews set admin_hidden_at=coalesce(admin_hidden_at,now()),admin_hidden_by=auth.uid(),admin_hidden_reason=trim(p_reason) where id=p_review_id;
 else update public.transaction_reviews set admin_hidden_at=null,admin_hidden_by=null,admin_hidden_reason=null where id=p_review_id; end if;
 if not found then raise exception 'REVIEW_NOT_FOUND'; end if;
 insert into public.review_moderation_actions(review_id,admin_user_id,action,reason)
 values(p_review_id,auth.uid(),case when p_hidden then 'hide' else 'restore' end,trim(p_reason));
 return true;
end $$;
revoke all on function public.moderate_review(uuid,boolean,text) from public;
grant execute on function public.moderate_review(uuid,boolean,text) to anon,authenticated;

-- Keep the trusted event writer callable only through a guarded public RPC.
-- PostgREST/Postgres 17 can terminate a backend when a caller without EXECUTE
-- invokes a function that has omitted default arguments. Moving the implementation
-- out of the exposed schema and granting the public guard avoids that availability
-- failure without allowing a browser role to record or forge an event.
alter function public.record_marketplace_event(text,uuid,uuid,uuid,uuid,uuid,text,jsonb,uuid)
 rename to record_marketplace_event_service;
alter function public.record_marketplace_event_service(text,uuid,uuid,uuid,uuid,uuid,text,jsonb,uuid)
 set schema laria_private;

create function public.record_marketplace_event(p_event_type text,p_session_id uuid,p_event_id uuid,
 p_actor_user_id uuid default null,p_listing_id uuid default null,p_store_id uuid default null,
 p_source text default 'other',p_metadata jsonb default '{}'::jsonb,p_submission_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if auth.role() is distinct from 'service_role' then
  raise exception using errcode='42501',message='Service access required.';
 end if;
 return laria_private.record_marketplace_event_service(
  p_event_type,p_session_id,p_event_id,p_actor_user_id,p_listing_id,p_store_id,
  p_source,p_metadata,p_submission_id
 );
end $$;
revoke all on function public.record_marketplace_event(text,uuid,uuid,uuid,uuid,uuid,text,jsonb,uuid) from public;
grant execute on function public.record_marketplace_event(text,uuid,uuid,uuid,uuid,uuid,text,jsonb,uuid) to anon,authenticated,service_role;

-- Keep the retired legacy counter name as a denial-only compatibility tombstone.
-- No caller can increment through it, while hostile/stale RPC calls receive a
-- stable authorization error instead of reaching a revoked-function crash path.
create or replace function public.increment_listing_view_count(p_listing_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
begin
 raise exception using errcode='42501',message='Legacy view counter is disabled.';
end $$;
revoke all on function public.increment_listing_view_count(uuid) from public;
grant execute on function public.increment_listing_view_count(uuid) to anon,authenticated,service_role;

-- Enrich existing private seller/store aggregates without exposing buyers.
alter function public.get_account_analytics(integer,uuid) rename to get_account_analytics_before_transactions;
revoke all on function public.get_account_analytics_before_transactions(integer,uuid) from public,anon,authenticated;
create function public.get_account_analytics(p_days integer default 0,p_owner_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; target uuid:=coalesce(p_owner_id,auth.uid()); verified_count bigint; contacts bigint;
begin
 if auth.uid() is null then
  raise exception using errcode='42501',message='Analytics access denied.';
 end if;
 result:=public.get_account_analytics_before_transactions(p_days,p_owner_id);
 select count(*) into verified_count from public.verified_transactions where seller_user_id=target and (p_days=0 or verified_at>=now()-make_interval(days=>p_days));
 contacts:=coalesce((result#>>'{summary,contacts}')::bigint,0);
 return jsonb_set(result,'{summary}',(result->'summary')||jsonb_build_object('verified_transactions',verified_count,
  'contact_to_verified_rate',verified_count::numeric/nullif(contacts,0)));
end $$;
revoke all on function public.get_account_analytics(integer,uuid) from public,anon;
-- PostgREST resolves omitted default arguments before checking function ACLs. In the
-- local Postgres 17 stack, denying that resolution at the ACL boundary can terminate
-- the backend. Let anon enter this wrapper only so it reaches the explicit 42501 above;
-- no analytics query runs and no data can be returned.
grant execute on function public.get_account_analytics(integer,uuid) to anon,authenticated;

alter function public.get_marketplace_admin_analytics(integer) rename to get_marketplace_admin_analytics_before_transactions;
revoke all on function public.get_marketplace_admin_analytics_before_transactions(integer) from public,anon,authenticated;
create function public.get_marketplace_admin_analytics(p_days integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; verified_count bigint;
begin
 if auth.uid() is null then
  raise exception using errcode='42501',message='Admin access required.';
 end if;
 result:=public.get_marketplace_admin_analytics_before_transactions(p_days);
 select count(*) into verified_count from public.verified_transactions where p_days=0 or verified_at>=now()-make_interval(days=>p_days);
 return result||jsonb_build_object('verified_transactions',verified_count,
  'contact_to_verified_rate',verified_count::numeric/nullif((result->>'contacts')::numeric,0));
end $$;
revoke all on function public.get_marketplace_admin_analytics(integer) from public,anon;
grant execute on function public.get_marketplace_admin_analytics(integer) to anon,authenticated;
