-- First-party product events. No historic events are fabricated or backfilled.
create table public.marketplace_event_types (
  event_type text primary key,
  created_at timestamptz not null default now()
);
insert into public.marketplace_event_types(event_type) values
 ('listing_impression'),('listing_view'),('store_view'),('whatsapp_contact'),('store_contact'),
 ('search'),('filter_applied'),('listing_creation_started'),('listing_submitted'),
 ('listing_approved'),('listing_rejected'),('listing_sold'),('store_application_started'),
 ('store_application_submitted'),('store_approved'),('store_verified');
create table public.marketplace_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null references public.marketplace_event_types(event_type),
  created_at timestamptz not null default now(),
  listing_id uuid references public.listings(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  seller_user_id uuid references public.profiles(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  session_id uuid,
  submission_id uuid,
  source text not null check(source in ('home','catalog','recommendations','detail','seller_panel','store','account','submission','system','other')),
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 4096),
  identity_key text,
  dedupe_key text unique
);
create index marketplace_events_recent_idx on public.marketplace_events(created_at desc);
create index marketplace_events_listing_idx on public.marketplace_events(listing_id,event_type,created_at desc);
create index marketplace_events_store_idx on public.marketplace_events(store_id,created_at desc);
create index marketplace_events_seller_idx on public.marketplace_events(seller_user_id,created_at desc);
create index marketplace_events_buyer_contact_idx on public.marketplace_events(actor_user_id,listing_id,created_at desc) where event_type='whatsapp_contact' and actor_user_id is not null;
create index marketplace_events_identity_idx on public.marketplace_events(identity_key,created_at desc);
alter table public.marketplace_events enable row level security;
alter table public.marketplace_event_types enable row level security;
revoke all on public.marketplace_events, public.marketplace_event_types from anon, authenticated;

-- The web server supplies an Auth-verified actor and a signed random first-party
-- session. Neither is accepted from a browser event payload. Raw RPC access is
-- service-only; targets/authority are still resolved here, not from client claims.
create function public.record_marketplace_event(p_event_type text, p_session_id uuid, p_event_id uuid,
 p_actor_user_id uuid default null, p_listing_id uuid default null, p_store_id uuid default null,
 p_source text default 'other', p_metadata jsonb default '{}'::jsonb, p_submission_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
 listing_record public.listings; store_record public.stores;
 target_seller uuid; target_store uuid; actor_type text; identity text;
 clean_metadata jsonb := '{}'::jsonb; inserted_id uuid; current_views integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service access required.'; end if;
 if p_event_id is null or p_session_id is null then raise exception 'Event/session identity required.'; end if;
 if p_source not in ('home','catalog','recommendations','detail','seller_panel','store','account','submission','other') then raise exception 'Invalid event source.'; end if;
 if p_actor_user_id is not null then
  select account_type::text into actor_type from public.profiles where id=p_actor_user_id;
  if not found then raise exception 'Invalid authenticated actor.'; end if;
 end if;
 if p_event_type in ('listing_impression','listing_view','whatsapp_contact') then
  select * into listing_record from public.listings where id=p_listing_id;
  if not found or not public.listing_is_public(p_listing_id) then return jsonb_build_object('recorded',false); end if;
  target_store := listing_record.store_id; target_seller := listing_record.owner_user_id;
  current_views := coalesce(listing_record.view_count,0);
  if target_store is not null then select * into store_record from public.stores where id=target_store; target_seller := coalesce(store_record.owner_user_id,target_seller); end if;
  if p_store_id is not null and p_store_id is distinct from target_store then raise exception 'Invalid store attribution.'; end if;
 elsif p_event_type in ('store_view','store_contact') then
  if p_listing_id is not null then raise exception 'Invalid listing attribution.'; end if;
  select * into store_record from public.stores where id=p_store_id and status='active';
  if not found then return jsonb_build_object('recorded',false); end if;
  target_store := store_record.id; target_seller := store_record.owner_user_id;
 elsif p_event_type in ('search','filter_applied') then
  if p_listing_id is not null or p_store_id is not null then raise exception 'Search has no seller target.'; end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object'
   or exists(select 1 from jsonb_object_keys(p_metadata) key where key not in ('query','filters','result_count','zero_results'))
   or jsonb_typeof(p_metadata->'query') is distinct from 'string'
   or length(p_metadata->>'query') > 200
   or jsonb_typeof(p_metadata->'filters') is distinct from 'object'
   or exists(select 1 from jsonb_object_keys(p_metadata->'filters') key where key not in ('category','city','brand','condition','seller_type','instrument_type','min_price','max_price','advanced','sort'))
   or jsonb_typeof(p_metadata->'result_count') is distinct from 'number'
   or (p_metadata->>'result_count')::numeric not between 0 and 10000000
   or octet_length(p_metadata::text)>4096 then raise exception 'Invalid search metadata.'; end if;
  clean_metadata := jsonb_build_object('query',p_metadata->>'query','filters',p_metadata->'filters',
    'result_count',(p_metadata->>'result_count')::integer,'zero_results',(p_metadata->>'result_count')::integer=0);
 elsif p_event_type in ('listing_creation_started','store_application_started') then
  if p_actor_user_id is null or p_submission_id is null or p_listing_id is not null then raise exception 'Authenticated submission required.'; end if;
  target_seller := p_actor_user_id;
  if p_event_type='store_application_started' then
   if actor_type <> 'store_owner' or exists(select 1 from public.stores where owner_user_id=p_actor_user_id) then raise exception 'Separate new Store Owner application required.'; end if;
  elsif actor_type='store_owner' then
   select id into target_store from public.stores where owner_user_id=p_actor_user_id;
   if not found then raise exception 'Store application required.'; end if;
  elsif actor_type <> 'seller' then raise exception 'Seller account required.'; end if;
 else raise exception 'Client cannot emit lifecycle events.';
 end if;
 if p_event_type not in ('search','filter_applied') and coalesce(p_metadata,'{}'::jsonb) <> '{}'::jsonb then raise exception 'No freeform event metadata allowed.'; end if;
 if p_event_type in ('listing_impression','listing_view','store_view','whatsapp_contact','store_contact')
  and p_actor_user_id is not null and (p_actor_user_id=target_seller
   or exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'role'='admin')) then
  return jsonb_build_object('recorded',false,'view_count',current_views);
 end if;
 identity := coalesce('user:'||p_actor_user_id::text,'session:'||p_session_id::text)||':'||p_event_type||':'||coalesce(p_listing_id::text,target_store::text,'');
 if p_event_type in ('listing_impression','listing_view','store_view') then
  -- Rolling (not fixed clock-bucket) 30 minutes, serialized across requests.
  perform pg_advisory_xact_lock(hashtextextended(identity, 40));
  if exists(select 1 from public.marketplace_events where identity_key=identity and created_at>now()-interval '30 minutes') then
   select view_count into current_views from public.listings where id=p_listing_id;
   return jsonb_build_object('recorded',false,'view_count',current_views);
  end if;
 end if;
 insert into public.marketplace_events(id,event_type,listing_id,store_id,seller_user_id,actor_user_id,session_id,submission_id,source,metadata,identity_key,dedupe_key)
 values(p_event_id,p_event_type,p_listing_id,target_store,target_seller,p_actor_user_id,p_session_id,p_submission_id,p_source,clean_metadata,identity,
  case when p_submission_id is not null then p_event_type||':'||p_submission_id::text end)
 on conflict do nothing returning id into inserted_id;
 if inserted_id is not null and p_event_type='listing_view' then
  perform set_config('app.allow_listing_admin_fields','true',true);
  update public.listings set view_count=coalesce(view_count,0)+1 where id=p_listing_id returning view_count into current_views;
 end if;
 return jsonb_build_object('recorded',inserted_id is not null,'view_count',current_views);
end $$;
revoke all on function public.record_marketplace_event(text,uuid,uuid,uuid,uuid,uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.record_marketplace_event(text,uuid,uuid,uuid,uuid,uuid,text,jsonb,uuid) to service_role;

-- Retire the public, undeduplicated legacy write path. The HTTP compatibility
-- route uses record_marketplace_event; view_count remains the historical cache.
revoke all on function public.increment_listing_view_count(uuid) from public,anon,authenticated;

create function public.capture_listing_marketplace_transition()
returns trigger language plpgsql security definer set search_path=public as $$
declare kind text; actor uuid;
begin
 if new.owner_user_id is null or new.created_by_source <> 'self_service' then return new; end if;
 select id into actor from public.profiles where id=auth.uid();
 if tg_op='INSERT' and new.status in ('pending','approved') then
  insert into public.marketplace_events(event_type,listing_id,store_id,seller_user_id,actor_user_id,submission_id,source,dedupe_key)
  values('listing_submitted',new.id,new.store_id,new.owner_user_id,actor,new.id,'system','listing_submitted:'||new.id::text);
 end if;
 if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
 kind := case new.status when 'approved' then 'listing_approved' when 'rejected' then 'listing_rejected' when 'sold' then 'listing_sold' end;
 if kind is not null then
  insert into public.marketplace_events(event_type,listing_id,store_id,seller_user_id,actor_user_id,source,metadata,dedupe_key)
  values(kind,new.id,new.store_id,new.owner_user_id,actor,'system',jsonb_build_object('status',new.status),kind||':'||new.id::text||':'||txid_current()::text)
  on conflict(dedupe_key) do nothing;
 end if;
 return new;
end $$;
create function public.capture_store_marketplace_transition()
returns trigger language plpgsql security definer set search_path=public as $$
declare actor uuid;
begin
 if new.owner_user_id is null then return new; end if;
 select id into actor from public.profiles where id=auth.uid();
 if (tg_op='INSERT' and new.status='pending') or (tg_op='UPDATE' and new.status='pending' and old.status is distinct from new.status) then
  insert into public.marketplace_events(event_type,store_id,seller_user_id,actor_user_id,submission_id,source,dedupe_key)
  values('store_application_submitted',new.id,new.owner_user_id,actor,new.id,'system','store_application_submitted:'||new.id::text||':'||txid_current()::text)
  on conflict(dedupe_key) do nothing;
 end if;
 if new.status='active' and (tg_op='INSERT' or old.status is distinct from new.status) then
  insert into public.marketplace_events(event_type,store_id,seller_user_id,actor_user_id,source,dedupe_key)
  values('store_approved',new.id,new.owner_user_id,actor,'system','store_approved:'||new.id::text||':'||txid_current()::text) on conflict(dedupe_key) do nothing;
 end if;
 if new.is_verified and (tg_op='INSERT' or not old.is_verified) then
  insert into public.marketplace_events(event_type,store_id,seller_user_id,actor_user_id,source,dedupe_key)
  values('store_verified',new.id,new.owner_user_id,actor,'system','store_verified:'||new.id::text||':'||txid_current()::text) on conflict(dedupe_key) do nothing;
 end if;
 return new;
end $$;
revoke all on function public.capture_listing_marketplace_transition(),public.capture_store_marketplace_transition() from public,anon,authenticated;
create trigger listings_marketplace_transition after insert or update on public.listings for each row execute function public.capture_listing_marketplace_transition();
create trigger stores_marketplace_transition after insert or update on public.stores for each row execute function public.capture_store_marketplace_transition();

create function public.get_account_analytics(p_days integer default 0,p_owner_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare target uuid := coalesce(p_owner_id,auth.uid()); account_kind text; result jsonb;
begin
 if auth.uid() is null or (target is distinct from auth.uid() and not public.is_admin()) then raise exception 'Analytics access denied.'; end if;
 if p_days not in (0,7,30) then raise exception 'Invalid analytics period.'; end if;
 select account_type::text into account_kind from public.profiles where id=target;
 if not found then raise exception 'Account unavailable.'; end if;
 with owned as (
  select listing.*,listing.status='approved' and (listing.store_id is null or parent.status='active') as publicly_active
   from public.listings listing left join public.stores parent on parent.id=listing.store_id where listing.owner_user_id=target
    and ((account_kind='seller' and listing.store_id is null) or (account_kind='store_owner' and exists(select 1 from public.stores where id=listing.store_id and owner_user_id=target)))
 ), counts as (
  select event.listing_id,count(*) filter(where event.event_type='listing_impression') impressions,
   count(*) filter(where event.event_type='listing_view') recorded_views,
   count(*) filter(where event.event_type='whatsapp_contact') contacts
  from public.marketplace_events event where event.seller_user_id=target
   and (p_days=0 or event.created_at>=now()-make_interval(days=>p_days)) group by event.listing_id
 ), items as (
  select owned.id,owned.title,owned.status,owned.published_at,owned.sold_at,owned.publicly_active,
   case when p_days=0 then coalesce(owned.view_count,0) else coalesce(counts.recorded_views,0) end views,
   coalesce(counts.recorded_views,0) recorded_views,coalesce(counts.impressions,0) impressions,coalesce(counts.contacts,0) contacts
  from owned left join counts on counts.listing_id=owned.id
 ), totals as (
  select count(*) filter(where publicly_active) active,count(*) filter(where status='sold') sold,
   coalesce(sum(views),0) views,coalesce(sum(recorded_views),0) recorded_views,
   coalesce(sum(impressions),0) impressions,coalesce(sum(contacts),0) contacts from items
 ), store_counts as (
  select count(*) filter(where event_type='store_view') store_views,count(*) filter(where event_type='store_contact') store_contacts
  from public.marketplace_events where seller_user_id=target and (p_days=0 or created_at>=now()-make_interval(days=>p_days))
 ) select jsonb_build_object('days',p_days,'tracking_started_at',(select min(created_at) from public.marketplace_event_types),
  'summary',(select to_jsonb(totals)||to_jsonb(store_counts)||jsonb_build_object('ctr',recorded_views::numeric/nullif(impressions,0),'contact_rate',contacts::numeric/nullif(recorded_views,0)) from totals cross join store_counts),
  'listings',coalesce((select jsonb_agg(to_jsonb(items)||jsonb_build_object('ctr',recorded_views::numeric/nullif(impressions,0),'contact_rate',contacts::numeric/nullif(recorded_views,0)) order by id) from items),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.get_account_analytics(integer,uuid) from public,anon;
grant execute on function public.get_account_analytics(integer,uuid) to authenticated;

create function public.get_marketplace_admin_analytics(p_days integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if not public.is_admin() then raise exception 'Admin access required.'; end if;
 if p_days not in (0,7,30) then raise exception 'Invalid analytics period.'; end if;
 select jsonb_build_object('searches',count(*) filter(where event_type='search'),
  'zero_results',count(*) filter(where event_type='search' and metadata->>'zero_results'='true'),
  'zero_result_rate',(count(*) filter(where event_type='search' and metadata->>'zero_results'='true'))::numeric/nullif(count(*) filter(where event_type='search'),0),
  'impressions',count(*) filter(where event_type='listing_impression'),'views',count(*) filter(where event_type='listing_view'),
  'contacts',count(*) filter(where event_type='whatsapp_contact'),
  'ctr',(count(*) filter(where event_type='listing_view'))::numeric/nullif(count(*) filter(where event_type='listing_impression'),0),
  'contact_rate',(count(*) filter(where event_type='whatsapp_contact'))::numeric/nullif(count(*) filter(where event_type='listing_view'),0)) into result
 from public.marketplace_events where p_days=0 or created_at>=now()-make_interval(days=>p_days);
 return result;
end $$;
revoke all on function public.get_marketplace_admin_analytics(integer) from public,anon;
grant execute on function public.get_marketplace_admin_analytics(integer) to authenticated;
