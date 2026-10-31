-- sell-09 «Perfil del vendedor», sell-08 «Vendedor destacado» and safe-07 «Comprador con historial»
-- (docs/feature-ideas/deal-trust.md, FD-deal-trust-8 to 13).
--
-- Seller page: every Particular who has published gets a public page at /vendedores/<slug> with their first name,
-- city, member since, verified sales, reviews and active publications. Nothing about the people they sold to. The
-- seller can hide it at any time.
-- Seller level: an automatic mark, recomputed every night from public criteria, that lapses by itself.
-- Buyer track record: off by default. When the buyer turns it on, a line and a link to a small card can go with their
-- WhatsApp messages. This makes the average of the ratings sellers gave the buyer visible on that card, which V1 kept
-- private; the comments stay private.

-- ---------------------------------------------------------------------------------------------------------------
-- Seller pages
-- ---------------------------------------------------------------------------------------------------------------

create table public.seller_pages (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.seller_pages enable row level security;
revoke all on public.seller_pages from anon, authenticated;

-- "maria-4k7d2q": the folded first name plus six random characters, so the address doesn't spell out who it is.
create or replace function laria_private.new_seller_page_slug(p_full_name text)
returns text
language sql
volatile
set search_path = public, extensions
as $$
  select coalesce(nullif(left(regexp_replace(public.catalog_fold(split_part(btrim(coalesce(p_full_name, '')), ' ', 1)), '[^a-z0-9]+', '', 'g'), 24), ''), 'vendedor')
    || '-' || substr(md5(gen_random_uuid()::text), 1, 6)
$$;

create or replace function laria_private.ensure_seller_page(p_user_id uuid)
returns public.seller_pages
language plpgsql
security definer
set search_path = public
as $$
declare
  page public.seller_pages;
  attempt integer := 0;
begin
  select * into page from public.seller_pages where user_id = p_user_id;
  if found or p_user_id is null then return page; end if;
  loop
    attempt := attempt + 1;
    begin
      insert into public.seller_pages(user_id, slug)
      values (p_user_id, laria_private.new_seller_page_slug((select full_name from public.profiles where id = p_user_id)))
      on conflict (user_id) do nothing;
      exit;
    exception when unique_violation then
      if attempt >= 5 then raise; end if;
    end;
  end loop;
  select * into page from public.seller_pages where user_id = p_user_id;
  return page;
end;
$$;

revoke all on function laria_private.ensure_seller_page(uuid) from public, anon, authenticated;

create or replace function laria_private.seller_page_on_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.seller_pages where user_id = new.owner_user_id) then
    perform laria_private.ensure_seller_page(new.owner_user_id);
  end if;
  return null;
end;
$$;

revoke all on function laria_private.seller_page_on_listing() from public, anon, authenticated;

-- A page appears with the first approved publication of a Particular.
create trigger listings_seller_page
after insert or update of status on public.listings
for each row
when (new.seller_type = 'individual' and new.store_id is null and new.owner_user_id is not null and new.status in ('approved', 'sold'))
execute function laria_private.seller_page_on_listing();

select laria_private.ensure_seller_page(owner.owner_user_id)
from (
  select distinct owner_user_id from public.listings
  where seller_type = 'individual' and store_id is null and owner_user_id is not null and status in ('approved', 'sold')
) owner;

-- ---------------------------------------------------------------------------------------------------------------
-- Seller level («Vendedor destacado» for a Particular, «Tienda destacada» for a store)
-- ---------------------------------------------------------------------------------------------------------------

create table public.seller_levels (
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid unique references public.profiles(id) on delete cascade,
  subject_store_id uuid unique references public.stores(id) on delete cascade,
  qualified_since timestamptz,
  facts jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  constraint seller_levels_subject check ((subject_user_id is null) <> (subject_store_id is null))
);

alter table public.seller_levels enable row level security;
revoke all on public.seller_levels from anon, authenticated;

-- The numbers behind the mark. The criteria are public (the "¿Por qué?" dialog lists them) and live only here and in
-- seller_level_meets, so changing a threshold is one migration.
create or replace function laria_private.seller_level_facts(p_user_id uuid, p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  -- Launch audit A17: buyers, not sales (laria_private.counted_buyers); the key stays verified_sales.
  with sales as (
    select laria_private.counted_buyers(case when p_store_id is null then p_user_id end, p_store_id) n
  ),
  reviews as (
    select count(*) n, avg(r.rating)::numeric(3, 2) average
    from public.transaction_reviews r
    where r.direction = 'buyer_to_seller'
      and r.subject_user_id is not distinct from (case when p_store_id is null then p_user_id end)
      and r.subject_store_id is not distinct from p_store_id
      and laria_private.review_is_visible(r.id)
  ),
  own_listings as (
    select l.id from public.listings l
    where (p_store_id is not null and l.store_id = p_store_id)
       or (p_store_id is null and l.owner_user_id = p_user_id and l.seller_type = 'individual' and l.store_id is null)
  ),
  upheld as (
    select count(*) n from public.reports rp
    where rp.status = 'resolved' and rp.resolved_at > now() - interval '90 days'
      and (rp.listing_id in (select id from own_listings) or (p_store_id is not null and rp.store_id = p_store_id))
  ),
  unanswered as (
    select count(*) n from public.listing_questions q
    join public.listings l on l.id = q.listing_id
    where q.listing_id in (select id from own_listings)
      and l.status = 'approved' and q.status = 'visible' and q.answered_at is null
      and q.created_at between now() - interval '90 days' and now() - interval '7 days'
  )
  select jsonb_build_object(
    'verified_sales', (select n from sales),
    'review_count', (select n from reviews),
    'average_rating', (select average from reviews),
    'upheld_reports_90d', (select n from upheld),
    'unanswered_questions', (select n from unanswered),
    'store_active', p_store_id is null or exists (select 1 from public.stores s where s.id = p_store_id and s.status = 'active')
  )
$$;

revoke all on function laria_private.seller_level_facts(uuid, uuid) from public, anon, authenticated;

create or replace function laria_private.seller_level_meets(p_facts jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce((p_facts->>'verified_sales')::integer, 0) >= 5
    and coalesce((p_facts->>'review_count')::integer, 0) >= 3
    and coalesce((p_facts->>'average_rating')::numeric, 0) >= 4.5
    and coalesce((p_facts->>'upheld_reports_90d')::integer, 1) = 0
    and coalesce((p_facts->>'unanswered_questions')::integer, 1) = 0
    and coalesce((p_facts->>'store_active')::boolean, false)
$$;

-- Public: {since} while the mark holds, null otherwise.
create or replace function laria_private.seller_level_json(p_user_id uuid, p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when level.qualified_since is not null then jsonb_build_object(
      'kind', case when level.subject_store_id is not null then 'store' else 'particular' end,
      'since', level.qualified_since,
      'computed_at', level.computed_at)
    end
  from public.seller_levels level
  where (p_store_id is not null and level.subject_store_id = p_store_id)
     or (p_store_id is null and level.subject_user_id = p_user_id)
$$;

revoke all on function laria_private.seller_level_json(uuid, uuid) from public, anon, authenticated;

-- Nightly: everyone with five or more verified sales, plus whoever holds the mark now (so it can lapse).
create or replace function laria_private.refresh_seller_levels()
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  candidate record;
  current_level public.seller_levels;
  level_facts jsonb;
  meets boolean;
  was_qualified boolean;
  owner_id uuid;
  earned integer := 0;
  lapsed integer := 0;
  checked integer := 0;
  today text := to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD');
begin
  for candidate in
    select t.seller_user_id user_id, null::uuid store_id from public.verified_transactions t
    where t.store_id is null group by t.seller_user_id having count(*) >= 5
    union
    select null::uuid, t.store_id from public.verified_transactions t
    where t.store_id is not null group by t.store_id having count(*) >= 5
    union
    select level.subject_user_id, level.subject_store_id from public.seller_levels level where level.qualified_since is not null
  loop
    checked := checked + 1;
    level_facts := laria_private.seller_level_facts(candidate.user_id, candidate.store_id);
    meets := laria_private.seller_level_meets(level_facts);
    select * into current_level from public.seller_levels level
    where (candidate.store_id is not null and level.subject_store_id = candidate.store_id)
       or (candidate.store_id is null and level.subject_user_id = candidate.user_id)
    for update;
    was_qualified := found and current_level.qualified_since is not null;

    if found then
      update public.seller_levels
      set facts = level_facts,
          computed_at = now(),
          qualified_since = case when meets then coalesce(current_level.qualified_since, now()) end
      where id = current_level.id;
    else
      insert into public.seller_levels(subject_user_id, subject_store_id, qualified_since, facts)
      values (candidate.user_id, candidate.store_id, case when meets then now() end, level_facts);
    end if;

    if meets = was_qualified then
      continue;
    end if;
    if meets then earned := earned + 1; else lapsed := lapsed + 1; end if;
    if candidate.store_id is not null then
      select s.owner_user_id into owner_id from public.stores s where s.id = candidate.store_id;
      perform laria_private.trust_notify_once(
        'level:' || case when meets then 'earned' else 'lapsed' end || ':' || candidate.store_id || ':' || today,
        owner_id,
        case when meets then 'store_level_earned' else 'store_level_lapsed' end,
        case when meets
          then 'Tu tienda ahora tiene la marca «Tienda destacada». Se mantiene mientras siga cumpliendo los criterios.'
          else 'La marca «Tienda destacada» de tu tienda se pausó porque dejó de cumplir un criterio. Puedes ver cuál en Compras y ventas.' end,
        candidate.store_id, null);
    else
      perform laria_private.trust_notify_once(
        'level:' || case when meets then 'earned' else 'lapsed' end || ':' || candidate.user_id || ':' || today,
        candidate.user_id,
        case when meets then 'seller_level_earned' else 'seller_level_lapsed' end,
        case when meets
          then 'Ahora tienes la marca «Vendedor destacado». Se mantiene mientras sigas cumpliendo los criterios.'
          else 'Tu marca «Vendedor destacado» se pausó porque dejaste de cumplir un criterio. Puedes ver cuál en Compras y ventas.' end,
        null, null);
    end if;
  end loop;
  return jsonb_build_object('checked', checked, 'earned', earned, 'lapsed', lapsed);
end;
$$;

revoke all on function laria_private.refresh_seller_levels() from public, anon, authenticated;

-- The account's own view: each criterion with its number, for Compras y ventas (Particular and, when the caller owns
-- one, the store).
create or replace function public.get_my_seller_levels()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  owned_store uuid;
begin
  if me is null then raise exception using errcode = '42501', message = 'TRANSACTION_AUTH_REQUIRED'; end if;
  select s.id into owned_store from public.stores s where s.owner_user_id = me and public.is_store_owner(s.id) limit 1;
  return jsonb_build_object(
    'particular', jsonb_build_object('facts', laria_private.seller_level_facts(me, null), 'level', laria_private.seller_level_json(me, null)),
    'store', case when owned_store is not null then jsonb_build_object(
      'facts', laria_private.seller_level_facts(null, owned_store), 'level', laria_private.seller_level_json(null, owned_store)) end
  );
end;
$$;

revoke all on function public.get_my_seller_levels() from public, anon;
grant execute on function public.get_my_seller_levels() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Seller page reads and settings
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.get_seller_page(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  page public.seller_pages;
  profile public.profiles;
begin
  if p_slug is null or lower(btrim(p_slug)) !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then return null; end if;
  select * into page from public.seller_pages where slug = lower(btrim(p_slug)) and not hidden;
  if not found then return null; end if;
  select * into profile from public.profiles where id = page.user_id;
  return jsonb_build_object(
    'user_id', page.user_id,
    'slug', page.slug,
    'first_name', laria_private.trust_first_name(profile.full_name),
    'city', coalesce(nullif(btrim(coalesce(profile.city, '')), ''), (
      select l.city from public.listings l
      where l.owner_user_id = page.user_id and l.seller_type = 'individual' and l.store_id is null and l.status in ('approved', 'sold')
      order by coalesce(l.published_at, l.created_at) desc limit 1)),
    'member_since', profile.created_at,
    -- Launch audit A17: buyers, not sales, as on the seller card (get_public_seller_facts).
    'verified_sales', laria_private.counted_buyers(page.user_id, null),
    'active_listings', (select count(*) from public.listings l where l.owner_user_id = page.user_id and l.seller_type = 'individual'
      and l.store_id is null and public.listing_is_public(l.id)),
    'level', laria_private.seller_level_json(page.user_id, null)
  );
end;
$$;

revoke all on function public.get_seller_page(text) from public;
grant execute on function public.get_seller_page(text) to anon, authenticated, service_role;

-- The seller's own settings card. Creates the page the first time for someone who has published.
create or replace function public.get_my_seller_page()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  page public.seller_pages;
begin
  if me is null then raise exception using errcode = '42501', message = 'TRANSACTION_AUTH_REQUIRED'; end if;
  if exists (select 1 from public.listings l where l.owner_user_id = me and l.seller_type = 'individual' and l.store_id is null
             and l.status in ('approved', 'sold')) then
    page := laria_private.ensure_seller_page(me);
  else
    select * into page from public.seller_pages where user_id = me;
  end if;
  return jsonb_build_object('slug', page.slug, 'hidden', coalesce(page.hidden, false), 'exists', page.user_id is not null);
end;
$$;

revoke all on function public.get_my_seller_page() from public, anon;
grant execute on function public.get_my_seller_page() to authenticated, service_role;

create or replace function public.set_my_seller_page_hidden(p_hidden boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'TRANSACTION_AUTH_REQUIRED'; end if;
  if p_hidden is null then raise exception 'SELLER_PAGE_VALUE_INVALID'; end if;
  update public.seller_pages set hidden = p_hidden, updated_at = now() where user_id = auth.uid();
  if not found then raise exception 'SELLER_PAGE_NOT_FOUND'; end if;
  return public.get_my_seller_page();
end;
$$;

revoke all on function public.set_my_seller_page_hidden(boolean) from public, anon;
grant execute on function public.set_my_seller_page_hidden(boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Buyer track record
-- ---------------------------------------------------------------------------------------------------------------

create table public.buyer_track_records (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  -- The card's address. A new one each time it is turned on, so a link shared before turning it off stays dead.
  token text unique check (token is null or token ~ '^[0-9a-f]{24}$'),
  enabled_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint buyer_track_records_enabled_shape check (not enabled or (token is not null and enabled_at is not null))
);

alter table public.buyer_track_records enable row level security;
revoke all on public.buyer_track_records from anon, authenticated;

create or replace function laria_private.buyer_track_facts(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'first_name', laria_private.trust_first_name(p.full_name),
    'member_since', p.created_at,
    'verified_purchases', (select count(*) from public.verified_transactions t where t.buyer_user_id = p.id),
    'rating_count', (select count(*) from public.transaction_reviews r where r.direction = 'seller_to_buyer'
      and r.subject_user_id = p.id and laria_private.review_is_visible(r.id)),
    'average_rating', (select avg(r.rating)::numeric(3, 2) from public.transaction_reviews r where r.direction = 'seller_to_buyer'
      and r.subject_user_id = p.id and laria_private.review_is_visible(r.id))
  )
  from public.profiles p where p.id = p_user_id
$$;

revoke all on function laria_private.buyer_track_facts(uuid) from public, anon, authenticated;

create or replace function public.get_my_track_record()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  record_row public.buyer_track_records;
begin
  if me is null then raise exception using errcode = '42501', message = 'TRANSACTION_AUTH_REQUIRED'; end if;
  select * into record_row from public.buyer_track_records where user_id = me;
  return coalesce(laria_private.buyer_track_facts(me), '{}'::jsonb) || jsonb_build_object(
    'enabled', coalesce(record_row.enabled, false),
    'token', case when record_row.enabled then record_row.token end
  );
end;
$$;

revoke all on function public.get_my_track_record() from public, anon;
grant execute on function public.get_my_track_record() to authenticated, service_role;

create or replace function public.set_my_track_record(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  fresh_token text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 24);
begin
  if me is null then raise exception using errcode = '42501', message = 'TRANSACTION_AUTH_REQUIRED'; end if;
  if p_enabled is null then raise exception 'TRACK_RECORD_VALUE_INVALID'; end if;
  insert into public.buyer_track_records(user_id, enabled, token, enabled_at)
  values (me, p_enabled, case when p_enabled then fresh_token end, case when p_enabled then now() end)
  on conflict (user_id) do update set
    enabled = excluded.enabled,
    token = case when excluded.enabled and not buyer_track_records.enabled then fresh_token else buyer_track_records.token end,
    enabled_at = case when excluded.enabled and not buyer_track_records.enabled then now() else buyer_track_records.enabled_at end,
    updated_at = now();
  return public.get_my_track_record();
end;
$$;

revoke all on function public.set_my_track_record(boolean) from public, anon;
grant execute on function public.set_my_track_record(boolean) to authenticated, service_role;

-- The public card (/comprador/<token>). Null when the link is unknown or the buyer turned it off.
create or replace function public.get_buyer_card(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select laria_private.buyer_track_facts(record_row.user_id)
  from public.buyer_track_records record_row
  where p_token is not null and lower(btrim(p_token)) ~ '^[0-9a-f]{24}$'
    and record_row.token = lower(btrim(p_token)) and record_row.enabled
$$;

revoke all on function public.get_buyer_card(text) from public;
grant execute on function public.get_buyer_card(text) to anon, authenticated, service_role;
