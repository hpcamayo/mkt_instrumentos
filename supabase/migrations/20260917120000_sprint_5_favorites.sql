-- Sprint 5: private favorites and transactional in-app price-drop notifications.
-- No historical events, email service, or later-sprint transaction model.
create table public.favorites (
 user_id uuid not null references public.profiles(id) on delete cascade,
 listing_id uuid not null references public.listings(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(user_id,listing_id)
);
create index favorites_listing_idx on public.favorites(listing_id);
create index favorites_user_recent_idx on public.favorites(user_id,created_at desc,listing_id);
alter table public.favorites enable row level security;
revoke all on public.favorites from anon,authenticated;
grant select on public.favorites to authenticated;
create policy "Users read only their favorites" on public.favorites for select to authenticated using(user_id=auth.uid());
insert into public.marketplace_event_types(event_type) values('favorite_added'),('favorite_removed');

create function public.set_listing_favorite(p_listing_id uuid,p_saved boolean)
returns boolean language plpgsql security definer set search_path=public as $$
declare item public.listings; parent_owner uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and account_type in ('seller','store_owner')) then raise exception 'FAVORITE_AUTH_REQUIRED'; end if;
 if p_saved is null then raise exception 'FAVORITE_INVALID'; end if;
 -- Serialize add/remove with each other and the live price update. The transaction
 -- snapshot for fan-out then reflects precisely which favorites preceded the drop.
 select * into item from public.listings where id=p_listing_id for update;
 if not found then
  if not p_saved then return false; end if;
  raise exception 'FAVORITE_UNAVAILABLE';
 end if;
 if p_saved then
  if not public.listing_is_public(item.id) then raise exception 'FAVORITE_UNAVAILABLE'; end if;
  select owner_user_id into parent_owner from public.stores where id=item.store_id;
  if auth.uid()=item.owner_user_id or auth.uid()=parent_owner then raise exception 'FAVORITE_SELF_NOT_ALLOWED'; end if;
  insert into public.favorites(user_id,listing_id) values(auth.uid(),item.id) on conflict do nothing;
 else
  delete from public.favorites where user_id=auth.uid() and listing_id=item.id;
 end if;
 return p_saved;
end $$;
revoke all on function public.set_listing_favorite(uuid,boolean) from public,anon;
grant execute on function public.set_listing_favorite(uuid,boolean) to authenticated;

create function public.capture_favorite_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare relation public.favorites; item public.listings; target_owner uuid;
begin
 if tg_op='INSERT' then relation:=new; else relation:=old; end if;
 select * into item from public.listings where id=relation.listing_id;
 -- Cascading account/listing deletion is cleanup, not a fabricated buyer action.
 if auth.uid() is distinct from relation.user_id or item.id is null then return null; end if;
 select owner_user_id into target_owner from public.stores where id=item.store_id;
 insert into public.marketplace_events(event_type,listing_id,store_id,seller_user_id,actor_user_id,source)
 values(case when tg_op='INSERT' then 'favorite_added' else 'favorite_removed' end,item.id,item.store_id,coalesce(target_owner,item.owner_user_id),relation.user_id,'account');
 return null;
end $$;
revoke all on function public.capture_favorite_event() from public,anon,authenticated;
create trigger favorites_events after insert or delete on public.favorites for each row execute function public.capture_favorite_event();

create table public.listing_price_drops (
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null references public.listings(id) on delete cascade,
 old_price_pen numeric not null,
 new_price_pen numeric not null,
 created_at timestamptz not null default now(),
 check(old_price_pen>new_price_pen and new_price_pen>=0)
);
alter table public.listing_price_drops enable row level security;
create index listing_price_drops_listing_idx on public.listing_price_drops(listing_id,created_at desc);
revoke all on public.listing_price_drops from anon,authenticated;
alter table public.notifications drop constraint notifications_event_type_check;
alter table public.notifications add constraint notifications_event_type_check check(event_type in
 ('listing_approved','listing_rejected','listing_hidden','listing_revision_approved','listing_revision_rejected',
 'store_approved','store_rejected','store_verified','store_verification_revoked','listing_price_drop'));
alter table public.notifications add column price_drop_id uuid references public.listing_price_drops(id) on delete cascade,
 add column old_price_pen numeric, add column new_price_pen numeric;
alter table public.notifications add constraint notifications_price_drop_check check(
 (event_type='listing_price_drop' and price_drop_id is not null and old_price_pen is not null and new_price_pen is not null and old_price_pen>new_price_pen and new_price_pen>=0)
 or (event_type<>'listing_price_drop' and price_drop_id is null and old_price_pen is null and new_price_pen is null));
create unique index notifications_price_drop_recipient_idx on public.notifications(user_id,price_drop_id) where price_drop_id is not null;
create index notifications_price_drop_target_idx on public.notifications(user_id,listing_id) where event_type='listing_price_drop';

create function public.notify_favorite_price_drop()
returns trigger language plpgsql security definer set search_path=public as $$
declare transition_id uuid;
begin
 if old.status<>'approved' or new.status<>'approved' or new.price_pen>=old.price_pen
  or not ((old.seller_type='individual' and old.store_id is null) or (old.seller_type='store' and exists(select 1 from public.stores where id=old.store_id and status='active')))
  or not public.listing_is_public(new.id) then return new; end if;
 insert into public.listing_price_drops(listing_id,old_price_pen,new_price_pen)
 values(new.id,old.price_pen,new.price_pen) returning id into transition_id;
 insert into public.notifications(user_id,event_type,message,listing_id,store_id,price_drop_id,old_price_pen,new_price_pen)
 select user_id,'listing_price_drop','Una publicación de tus favoritos bajó de S/ '||old.price_pen::bigint::text||' a S/ '||new.price_pen::bigint::text||'.',
 new.id,new.store_id,transition_id,old.price_pen,new.price_pen from public.favorites where listing_id=new.id
 on conflict do nothing;
 return new;
end $$;
revoke all on function public.notify_favorite_price_drop() from public,anon,authenticated;
create trigger listings_favorite_price_drop after update of price_pen on public.listings for each row
 when(old.price_pen is distinct from new.price_pen) execute function public.notify_favorite_price_drop();

-- Own history without granting buyers SELECT on sold or nonpublic listings.
-- Unavailable rows expose only the already-owned relation, never private content.
create function public.get_account_favorites(p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'FAVORITE_AUTH_REQUIRED'; end if;
 if p_page not between 1 and 100000 then raise exception 'FAVORITE_PAGE_INVALID'; end if;
 with relations as (
  select f.*,l.title,l.slug,l.price_pen,l.status,
   (public.listing_is_public(l.id) or (l.status='sold' and (l.store_id is null or s.status='active'))) available
  from public.favorites f join public.listings l on l.id=f.listing_id left join public.stores s on s.id=l.store_id
  where f.user_id=auth.uid() order by f.created_at desc,f.listing_id limit 24 offset (p_page-1)*24
 ) select jsonb_build_object('total',(select count(*) from public.favorites where user_id=auth.uid()),
 'items',coalesce(jsonb_agg(jsonb_build_object('listing_id',listing_id,'created_at',created_at,
  'availability',case when not available then 'unavailable' when status='sold' then 'sold' else 'approved' end,
  'title',case when available then title end,'slug',case when available then slug end,
  'price_pen',case when available then price_pen end,
  'image_url',case when available then (select image_url from public.listing_photos where listing_id=relations.listing_id order by sort_order limit 1) end)
  order by created_at desc,listing_id),'[]'::jsonb)) into result from relations;
 return result;
end $$;
revoke all on function public.get_account_favorites(integer) from public,anon;
grant execute on function public.get_account_favorites(integer) to authenticated;

create function public.get_favorite_destination(p_listing_id uuid)
returns text language plpgsql stable security definer set search_path=public as $$
declare destination text;
begin
 if auth.uid() is null or not (exists(select 1 from public.favorites where user_id=auth.uid() and listing_id=p_listing_id)
  or exists(select 1 from public.notifications where user_id=auth.uid() and listing_id=p_listing_id and event_type='listing_price_drop')) then return null; end if;
 select '/instrumentos/'||l.slug into destination from public.listings l left join public.stores s on s.id=l.store_id
 where l.id=p_listing_id and (public.listing_is_public(l.id) or (l.status='sold' and (l.store_id is null or s.status='active')));
 return destination;
end $$;
revoke all on function public.get_favorite_destination(uuid) from public,anon;
grant execute on function public.get_favorite_destination(uuid) to authenticated;

-- Extend existing trusted aggregates; current relation counts are all-time state,
-- while add/remove action counts and favorite-rate share the event-window denominator.
alter function public.get_account_analytics(integer,uuid) rename to get_account_analytics_before_favorites;
revoke all on function public.get_account_analytics_before_favorites(integer,uuid) from public,anon,authenticated;
create function public.get_account_analytics(p_days integer default 0,p_owner_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; enriched jsonb;
begin
 result:=public.get_account_analytics_before_favorites(p_days,p_owner_id);
 with items as (select value item,(value->>'id')::uuid id from jsonb_array_elements(result->'listings')),
 current_counts as (select f.listing_id,count(*) favorites from public.favorites f join items on items.id=f.listing_id group by f.listing_id),
 actions as (select e.listing_id,count(*) filter(where event_type='favorite_added') additions,
 count(*) filter(where event_type='favorite_removed') removals from public.marketplace_events e join items on items.id=e.listing_id
 where event_type in ('favorite_added','favorite_removed') and (p_days=0 or created_at>=now()-make_interval(days=>p_days)) group by e.listing_id),
 rows as (select item||jsonb_build_object('favorites',coalesce(favorites,0),'favorite_additions',coalesce(additions,0),
 'favorite_removals',coalesce(removals,0),'favorite_rate',coalesce(additions,0)::numeric/nullif((item->>'recorded_views')::numeric,0)) item from items
 left join current_counts on current_counts.listing_id=items.id left join actions on actions.listing_id=items.id)
 select coalesce(jsonb_agg(item order by item->>'id'),'[]'::jsonb) into enriched from rows;
 result:=jsonb_set(result,'{listings}',enriched);
 return jsonb_set(result,'{summary}',(result->'summary')||jsonb_build_object(
 'favorites',(select coalesce(sum((item->>'favorites')::bigint),0) from jsonb_array_elements(enriched) item),
 'favorite_additions',(select coalesce(sum((item->>'favorite_additions')::bigint),0) from jsonb_array_elements(enriched) item),
 'favorite_removals',(select coalesce(sum((item->>'favorite_removals')::bigint),0) from jsonb_array_elements(enriched) item),
 'favorite_rate',(select coalesce(sum((item->>'favorite_additions')::numeric),0) from jsonb_array_elements(enriched) item)/nullif((result#>>'{summary,recorded_views}')::numeric,0)));
end $$;
revoke all on function public.get_account_analytics(integer,uuid) from public,anon;
grant execute on function public.get_account_analytics(integer,uuid) to authenticated;
alter function public.get_marketplace_admin_analytics(integer) rename to get_marketplace_admin_analytics_before_favorites;
revoke all on function public.get_marketplace_admin_analytics_before_favorites(integer) from public,anon,authenticated;
create function public.get_marketplace_admin_analytics(p_days integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; additions bigint; removals bigint;
begin
 result:=public.get_marketplace_admin_analytics_before_favorites(p_days);
 select count(*) filter(where event_type='favorite_added'),count(*) filter(where event_type='favorite_removed') into additions,removals
 from public.marketplace_events where p_days=0 or created_at>=now()-make_interval(days=>p_days);
 return result||jsonb_build_object('favorite_additions',additions,'favorite_removals',removals,'favorite_rate',additions::numeric/nullif((result->>'views')::numeric,0));
end $$;
revoke all on function public.get_marketplace_admin_analytics(integer) from public,anon;
grant execute on function public.get_marketplace_admin_analytics(integer) to authenticated;
