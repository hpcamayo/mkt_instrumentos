-- EASE-428: claim, listing and transaction links must expose the same authorized review flow.
-- Existing detail signatures, review visibility and participant rules stay the same.
set lock_timeout = '5s';

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
 if claim.id is null then
  select * into item from public.listings where id=p_reference_id and status='sold' and owner_user_id=auth.uid();
  if not found then raise exception 'TRANSACTION_NOT_ACCESSIBLE'; end if;
  select * into claim from public.transaction_claims where listing_id=item.id order by created_at desc limit 1;
 else select * into item from public.listings where id=claim.listing_id;
 end if;
 -- A buyer's confirmation leaves the browser on the claim URL. Resolve its verified transaction too,
 -- without using FOUND from the transaction lookup to decide whether the claim itself exists.
 if transaction_record.id is null and claim.id is not null then
  select * into transaction_record from public.verified_transactions where claim_id=claim.id;
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


-- Claim the first-sale notice when the seller actually mounts the page, not during server prefetch.
-- A private row makes it once per seller account, including across devices and concurrent visits.
create table if not exists laria_private.seller_first_sale_notices (
  seller_user_id uuid primary key references public.profiles(id) on delete cascade,
  transaction_id uuid not null references public.verified_transactions(id) on delete cascade,
  seen_at timestamptz not null default now()
);
create index if not exists seller_first_sale_notices_transaction_id_idx
  on laria_private.seller_first_sale_notices(transaction_id);
alter table laria_private.seller_first_sale_notices enable row level security;
revoke all on laria_private.seller_first_sale_notices from public, anon, authenticated;

create or replace function public.claim_first_sale_notice(p_transaction_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.verified_transactions;
  inserted integer;
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='TRANSACTION_AUTH_REQUIRED';
  end if;
  select * into item from public.verified_transactions where id=p_transaction_id;
  if not found or item.seller_user_id <> auth.uid() then
    raise exception 'TRANSACTION_NOT_ACCESSIBLE';
  end if;
  if (select count(*) from public.verified_transactions where seller_user_id=auth.uid()) <> 1 then
    return false;
  end if;
  insert into laria_private.seller_first_sale_notices(seller_user_id,transaction_id)
  values(auth.uid(),item.id) on conflict(seller_user_id) do nothing;
  get diagnostics inserted = row_count;
  return inserted=1;
end;
$$;
revoke all on function public.claim_first_sale_notice(uuid) from public, anon;
grant execute on function public.claim_first_sale_notice(uuid) to authenticated, service_role;


notify pgrst, 'reload schema';
reset lock_timeout;
