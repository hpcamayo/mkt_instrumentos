-- Feature ideas, discovery batch (docs/feature-ideas/discovery.md): buy-05 gift finder, disc-02 buying guides,
-- disc-03 collections, disc-04 Hecho en Perú and the eleventh category, disc-05 gear from Peruvian artists.
--
-- 1. disc-04 category: "Andinos y tradicionales" (andean). Its redefined functions live alone in
--    20261207120000 (taxonomy), 20261207120100 (attribute keys), 20261207120200 (search text) and 20261207120300
--    (saved-search patch), as the build plan's shared-function rule asks.
-- 2. disc-04 makers: a store declares itself "Fabricante" or "Taller" with the city where it makes its instruments and
--    its story (store_maker_profiles). Its listings can carry "Hecho a mano" and "Se hace a pedido: N semanas"
--    (listing_maker_details). Admin can hide a maker profile, with an audited reason; hiding it hides the marks.
-- 3. buy-05: a store says whether it accepts gift exchanges and for how many days (store_gift_policies).
-- 4. disc-05 artists: Admin records a verified Peruvian artist on an account after checking who they are
--    (artist_profiles). Their listings can carry a short note on how the gear was used ("Usado en la gira 2024").
--    Laria checks the identity, never the use; the note is the seller's.
-- 5. disc-03 collections: Admin saves a title, a text, dates and up to four catalog filter sets.
--
-- Additive: five tables, new functions and policies; no existing function is redefined here. Public reads of makers,
-- artists and marks go through definer functions that only ever return public listings. Nothing here changes a listing's status or its moderation.

-- ------------------------------------------------------------------------------------------- audit targets

-- The admin audit accepts artists and collections as targets (maker profiles are audited on their store).
select laria_private.ux_extend_text_check(
  'public.admin_audit_actions', 'admin_audit_actions_target_type_check', 'target_type', array['artist', 'collection']
);

-- ------------------------------------------------------------------------------------------------- 2. makers

create table public.store_maker_profiles (
  store_id      uuid primary key references public.stores(id) on delete cascade,
  kind          text not null check (kind in ('fabricante', 'taller')),
  craft_city    text not null check (char_length(btrim(craft_city)) between 2 and 60),
  story         text check (story is null or char_length(story) between 40 and 1500),
  since_year    smallint check (since_year is null or since_year between 1900 and 2100),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  hidden_at     timestamptz,
  hidden_reason text check (hidden_reason is null or char_length(hidden_reason) between 3 and 500),
  hidden_by     uuid,
  constraint store_maker_hidden_shape check ((hidden_at is null) = (hidden_reason is null))
);

alter table public.store_maker_profiles enable row level security;
revoke all on public.store_maker_profiles from public, anon, authenticated;
grant select on public.store_maker_profiles to authenticated;
create policy store_maker_profiles_owner_or_admin_read on public.store_maker_profiles
for select to authenticated
using (exists (select 1 from public.stores s where s.id = store_id and s.owner_user_id = auth.uid()) or public.is_admin());

create table public.listing_maker_details (
  listing_id          uuid primary key references public.listings(id) on delete cascade,
  handmade            boolean not null default false,
  made_to_order_weeks smallint check (made_to_order_weeks is null or made_to_order_weeks between 1 and 26),
  artist_note         text check (artist_note is null or char_length(artist_note) between 3 and 140),
  updated_at          timestamptz not null default now(),
  constraint listing_maker_details_not_empty check (handmade or made_to_order_weeks is not null or artist_note is not null)
);

create index listing_maker_details_handmade_idx on public.listing_maker_details(listing_id) where handmade;

alter table public.listing_maker_details enable row level security;
revoke all on public.listing_maker_details from public, anon, authenticated;
grant select on public.listing_maker_details to authenticated;
create policy listing_maker_details_owner_or_admin_read on public.listing_maker_details
for select to authenticated
using (public.can_manage_listing(listing_id));

-- The maker profile of a store, when it is shown: the store is active and Admin has not hidden it.
create or replace function laria_private.visible_maker_profile(p_store_id uuid)
returns public.store_maker_profiles
language sql
stable
security definer
set search_path = public
as $$
  select m.* from public.store_maker_profiles m
  join public.stores s on s.id = m.store_id
  where m.store_id = p_store_id and m.hidden_at is null and s.status = 'active';
$$;

revoke all on function laria_private.visible_maker_profile(uuid) from public, anon, authenticated;

create or replace function laria_private.raise_discovery_error(p_code text, p_message text)
returns void
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001', message = p_code || ': ' || p_message;
end;
$$;

-- The owner's own store, writable (pending or active), or an error.
create or replace function laria_private.discovery_owner_store()
returns public.stores
language plpgsql
stable
security definer
set search_path = public
as $$
declare target public.stores;
begin
  select * into target from public.stores s where auth.uid() is not null and s.owner_user_id = auth.uid();
  if target.id is null then
    perform laria_private.raise_discovery_error('STORE_REQUIRED', 'Necesitas una tienda.');
  end if;
  if target.status not in ('pending', 'active') then
    perform laria_private.raise_discovery_error('STORE_NOT_WRITABLE', 'Tu tienda no puede cambiar esto en este momento.');
  end if;
  return target;
end;
$$;

revoke all on function laria_private.discovery_owner_store() from public, anon, authenticated;

-- The owner declares the store a maker, edits it, or turns it off (p_kind null). A profile Admin hid cannot be
-- changed by the owner; Admin restores it.
create or replace function public.set_store_maker_profile(
  p_kind text, p_craft_city text default null, p_story text default null, p_since_year integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.stores := laria_private.discovery_owner_store();
  existing public.store_maker_profiles;
  clean_city text := nullif(btrim(regexp_replace(coalesce(p_craft_city, ''), '\s+', ' ', 'g')), '');
  clean_story text := nullif(btrim(coalesce(p_story, '')), '');
  saved public.store_maker_profiles;
begin
  select * into existing from public.store_maker_profiles m where m.store_id = target.id for update;
  if existing.hidden_at is not null then
    perform laria_private.raise_discovery_error('MAKER_HIDDEN', 'Laria ocultó tu perfil de fabricante. Escríbenos para revisarlo.');
  end if;
  if p_kind is null then
    delete from public.store_maker_profiles where store_id = target.id;
    delete from public.listing_maker_details d using public.listings l
      where l.id = d.listing_id and l.store_id = target.id and d.artist_note is null;
    update public.listing_maker_details d set handmade = false, made_to_order_weeks = null, updated_at = now()
      from public.listings l where l.id = d.listing_id and l.store_id = target.id;
    return jsonb_build_object('kind', null);
  end if;
  if p_kind not in ('fabricante', 'taller') then
    perform laria_private.raise_discovery_error('MAKER_INVALID', 'Elige Fabricante o Taller.');
  end if;
  if clean_city is null or char_length(clean_city) not between 2 and 60 then
    perform laria_private.raise_discovery_error('MAKER_CITY_REQUIRED', 'Indica la ciudad donde haces tus instrumentos.');
  end if;
  if clean_story is not null and char_length(clean_story) not between 40 and 1500 then
    perform laria_private.raise_discovery_error('MAKER_STORY_LENGTH', 'Tu historia debe tener entre 40 y 1500 caracteres.');
  end if;
  if p_since_year is not null and (p_since_year < 1900 or p_since_year > extract(year from now())::integer) then
    perform laria_private.raise_discovery_error('MAKER_YEAR_INVALID', 'Revisa el año en que empezaste.');
  end if;
  insert into public.store_maker_profiles(store_id, kind, craft_city, story, since_year)
  values (target.id, p_kind, clean_city, clean_story, p_since_year)
  on conflict (store_id) do update
    set kind = excluded.kind, craft_city = excluded.craft_city, story = excluded.story,
        since_year = excluded.since_year, updated_at = now()
  returning * into saved;
  return jsonb_build_object('kind', saved.kind, 'craft_city', saved.craft_city, 'story', saved.story, 'since_year', saved.since_year);
end;
$$;

revoke all on function public.set_store_maker_profile(text, text, text, integer) from public, anon;
grant execute on function public.set_store_maker_profile(text, text, text, integer) to authenticated;

-- ------------------------------------------------------------------------------------------- 3. gift exchanges

create table public.store_gift_policies (
  store_id      uuid primary key references public.stores(id) on delete cascade,
  exchange_days smallint not null check (exchange_days between 3 and 60),
  note          text check (note is null or char_length(note) between 3 and 200),
  updated_at    timestamptz not null default now()
);

alter table public.store_gift_policies enable row level security;
revoke all on public.store_gift_policies from public, anon, authenticated;
grant select on public.store_gift_policies to anon, authenticated;
-- The policy is public on an active store (it is what the store tells buyers); the owner and Admin always see it.
-- Two policies, because anonymous visitors may read stores.status but not stores.owner_user_id.
create policy store_gift_policies_public_read on public.store_gift_policies
for select to anon, authenticated
using (exists (select 1 from public.stores s where s.id = store_id and s.status = 'active'));
create policy store_gift_policies_owner_or_admin_read on public.store_gift_policies
for select to authenticated
using (public.is_store_owner(store_id) or public.is_admin());

-- p_days null turns gift exchanges off.
create or replace function public.set_store_gift_policy(p_days integer, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.stores := laria_private.discovery_owner_store();
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  saved public.store_gift_policies;
begin
  if p_days is null then
    delete from public.store_gift_policies where store_id = target.id;
    return jsonb_build_object('exchange_days', null);
  end if;
  if p_days not between 3 and 60 then
    perform laria_private.raise_discovery_error('GIFT_DAYS_INVALID', 'Indica entre 3 y 60 días.');
  end if;
  if clean_note is not null and char_length(clean_note) not between 3 and 200 then
    perform laria_private.raise_discovery_error('GIFT_NOTE_LENGTH', 'La condición admite entre 3 y 200 caracteres.');
  end if;
  insert into public.store_gift_policies(store_id, exchange_days, note) values (target.id, p_days, clean_note)
  on conflict (store_id) do update set exchange_days = excluded.exchange_days, note = excluded.note, updated_at = now()
  returning * into saved;
  return jsonb_build_object('exchange_days', saved.exchange_days, 'note', saved.note);
end;
$$;

revoke all on function public.set_store_gift_policy(integer, text) from public, anon;
grant execute on function public.set_store_gift_policy(integer, text) to authenticated;

-- ------------------------------------------------------------------------------------------------ 4. artists

create table public.artist_profiles (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 80),
  story        text check (story is null or char_length(story) between 40 and 1200),
  link_url     text check (link_url is null or (link_url ~ '^https://[^\s]+$' and char_length(link_url) <= 300)),
  verified_at  timestamptz not null default now(),
  verified_by  uuid not null,
  revoked_at   timestamptz,
  updated_at   timestamptz not null default now()
);

alter table public.artist_profiles enable row level security;
revoke all on public.artist_profiles from public, anon, authenticated;
grant select on public.artist_profiles to authenticated;
create policy artist_profiles_self_or_admin_read on public.artist_profiles
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

-- The listing's seller account: the particular, or the store's owner.
create or replace function laria_private.listing_seller_user(p_listing public.listings)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when p_listing.store_id is null then p_listing.owner_user_id
    else (select s.owner_user_id from public.stores s where s.id = p_listing.store_id) end;
$$;

revoke all on function laria_private.listing_seller_user(public.listings) from public, anon, authenticated;

-- Admin records (or updates) a verified artist on an account found by its e-mail. p_check says how the identity was
-- checked (for example "videollamada y su cuenta verificada de Instagram"); it goes to the audit, never public.
create or replace function public.admin_save_artist_profile(
  p_email text, p_slug text, p_display_name text, p_story text, p_link_url text, p_check text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
  clean_story text := nullif(btrim(coalesce(p_story, '')), '');
  clean_link text := nullif(btrim(coalesce(p_link_url, '')), '');
  clean_check text := btrim(coalesce(p_check, ''));
  saved public.artist_profiles;
begin
  perform laria_private.assert_admin();
  select u.id into target_user from auth.users u where lower(u.email) = lower(btrim(coalesce(p_email, '')));
  if target_user is null or not exists (select 1 from public.profiles p where p.id = target_user) then
    perform laria_private.raise_discovery_error('ARTIST_ACCOUNT_NOT_FOUND', 'No hay una cuenta con ese correo.');
  end if;
  if char_length(clean_check) not between 10 and 500 then
    perform laria_private.raise_discovery_error('ARTIST_CHECK_REQUIRED', 'Describe cómo comprobaste la identidad (10 a 500 caracteres).');
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_slug) > 60 then
    perform laria_private.raise_discovery_error('ARTIST_SLUG_INVALID', 'El enlace usa minúsculas, números y guiones.');
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 2 and 80 then
    perform laria_private.raise_discovery_error('ARTIST_NAME_INVALID', 'Escribe el nombre artístico (2 a 80 caracteres).');
  end if;
  if clean_story is not null and char_length(clean_story) not between 40 and 1200 then
    perform laria_private.raise_discovery_error('ARTIST_STORY_LENGTH', 'La historia debe tener entre 40 y 1200 caracteres.');
  end if;
  if clean_link is not null and (clean_link !~ '^https://[^\s]+$' or char_length(clean_link) > 300) then
    perform laria_private.raise_discovery_error('ARTIST_LINK_INVALID', 'El enlace debe empezar con https://.');
  end if;
  begin
    insert into public.artist_profiles(user_id, slug, display_name, story, link_url, verified_by)
    values (target_user, p_slug, btrim(p_display_name), clean_story, clean_link, auth.uid())
    on conflict (user_id) do update
      set slug = excluded.slug, display_name = excluded.display_name, story = excluded.story,
          link_url = excluded.link_url, verified_at = now(), verified_by = auth.uid(), revoked_at = null, updated_at = now()
    returning * into saved;
  exception when unique_violation then
    perform laria_private.raise_discovery_error('ARTIST_SLUG_TAKEN', 'Ese enlace ya lo usa otro artista.');
  end;
  perform laria_private.record_admin_audit('artist_verified', 'artist', target_user,
    jsonb_build_object('check', clean_check, 'display_name', saved.display_name, 'slug', saved.slug));
  return jsonb_build_object('user_id', saved.user_id, 'slug', saved.slug, 'display_name', saved.display_name);
end;
$$;

revoke all on function public.admin_save_artist_profile(text, text, text, text, text, text) from public, anon;
grant execute on function public.admin_save_artist_profile(text, text, text, text, text, text) to authenticated;

create or replace function public.admin_revoke_artist_profile(p_user_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare clean_reason text := btrim(coalesce(p_reason, '')); saved public.artist_profiles;
begin
  perform laria_private.assert_admin();
  if char_length(clean_reason) not between 3 and 500 then
    perform laria_private.raise_discovery_error('REASON_REQUIRED', 'Escribe un motivo de entre 3 y 500 caracteres.');
  end if;
  update public.artist_profiles set revoked_at = now(), updated_at = now()
  where user_id = p_user_id and revoked_at is null
  returning * into saved;
  if saved.user_id is null then
    perform laria_private.raise_discovery_error('ARTIST_NOT_FOUND', 'Este artista ya no está verificado.');
  end if;
  perform laria_private.record_admin_audit('artist_revoked', 'artist', p_user_id, jsonb_build_object('reason', clean_reason));
  return jsonb_build_object('user_id', p_user_id, 'revoked', true);
end;
$$;

revoke all on function public.admin_revoke_artist_profile(uuid, text) from public, anon;
grant execute on function public.admin_revoke_artist_profile(uuid, text) to authenticated;

create or replace function public.get_admin_artists()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform laria_private.assert_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'slug', a.slug, 'display_name', a.display_name,
      'story', a.story, 'link_url', a.link_url, 'verified_at', a.verified_at, 'revoked_at', a.revoked_at,
      'email', u.email) order by a.revoked_at nulls first, a.display_name)
    from public.artist_profiles a join auth.users u on u.id = a.user_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_admin_artists() from public, anon;
grant execute on function public.get_admin_artists() to authenticated;

-- --------------------------------------------------------------------------------- the marks on one listing

-- The owner sets the listing's marks. Hecho a mano and a pedido need a shown maker profile on the listing's store; the
-- artist note needs a verified artist as the listing's seller. All three empty removes the row.
create or replace function public.set_listing_maker_details(
  p_listing_id uuid, p_handmade boolean, p_made_to_order_weeks integer default null, p_artist_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.listings;
  seller uuid;
  clean_note text := nullif(btrim(regexp_replace(coalesce(p_artist_note, ''), '\s+', ' ', 'g')), '');
  saved public.listing_maker_details;
begin
  select * into target from public.listings l where l.id = p_listing_id for update;
  if target.id is null or auth.uid() is null then
    perform laria_private.raise_discovery_error('LISTING_NOT_FOUND', 'Esta publicación ya no está disponible.');
  end if;
  seller := laria_private.listing_seller_user(target);
  if seller is distinct from auth.uid() then
    perform laria_private.raise_discovery_error('LISTING_NOT_OWNED', 'Solo quien vende puede cambiar esto.');
  end if;
  if target.status in ('sold', 'archived') then
    perform laria_private.raise_discovery_error('LISTING_CLOSED', 'Esta publicación ya está cerrada.');
  end if;
  if (coalesce(p_handmade, false) or p_made_to_order_weeks is not null) and not exists (
    select 1 from public.store_maker_profiles m where m.store_id = target.store_id and m.hidden_at is null
  ) then
    perform laria_private.raise_discovery_error('MAKER_REQUIRED', 'Primero marca tu tienda como Fabricante o Taller en Mi tienda.');
  end if;
  if p_made_to_order_weeks is not null and p_made_to_order_weeks not between 1 and 26 then
    perform laria_private.raise_discovery_error('MADE_TO_ORDER_INVALID', 'Indica entre 1 y 26 semanas.');
  end if;
  if clean_note is not null and char_length(clean_note) not between 3 and 140 then
    perform laria_private.raise_discovery_error('ARTIST_NOTE_LENGTH', 'La nota admite entre 3 y 140 caracteres.');
  end if;
  if clean_note is not null and not exists (
    select 1 from public.artist_profiles a where a.user_id = seller and a.revoked_at is null
  ) then
    perform laria_private.raise_discovery_error('ARTIST_REQUIRED', 'Solo un artista verificado por Laria puede agregar esta nota.');
  end if;
  if not coalesce(p_handmade, false) and p_made_to_order_weeks is null and clean_note is null then
    delete from public.listing_maker_details where listing_id = target.id;
    return jsonb_build_object('listing_id', target.id, 'handmade', false, 'made_to_order_weeks', null, 'artist_note', null);
  end if;
  insert into public.listing_maker_details(listing_id, handmade, made_to_order_weeks, artist_note)
  values (target.id, coalesce(p_handmade, false), p_made_to_order_weeks, clean_note)
  on conflict (listing_id) do update
    set handmade = excluded.handmade, made_to_order_weeks = excluded.made_to_order_weeks,
        artist_note = excluded.artist_note, updated_at = now()
  returning * into saved;
  return jsonb_build_object('listing_id', saved.listing_id, 'handmade', saved.handmade,
    'made_to_order_weeks', saved.made_to_order_weeks, 'artist_note', saved.artist_note);
end;
$$;

revoke all on function public.set_listing_maker_details(uuid, boolean, integer, text) from public, anon;
grant execute on function public.set_listing_maker_details(uuid, boolean, integer, text) to authenticated;

-- What the owner's form starts from: the marks, and whether each one is open to this seller.
create or replace function public.get_listing_maker_form(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare target public.listings; seller uuid; details public.listing_maker_details;
begin
  select * into target from public.listings l where l.id = p_listing_id;
  if target.id is null then return null; end if;
  seller := laria_private.listing_seller_user(target);
  if seller is distinct from auth.uid() then return null; end if;
  select * into details from public.listing_maker_details d where d.listing_id = target.id;
  return jsonb_build_object(
    'can_mark_handmade', exists (select 1 from public.store_maker_profiles m where m.store_id = target.store_id and m.hidden_at is null),
    'can_add_artist_note', exists (select 1 from public.artist_profiles a where a.user_id = seller and a.revoked_at is null),
    'is_store', target.store_id is not null,
    'handmade', coalesce(details.handmade, false),
    'made_to_order_weeks', details.made_to_order_weeks,
    'artist_note', details.artist_note);
end;
$$;

revoke all on function public.get_listing_maker_form(uuid) from public, anon;
grant execute on function public.get_listing_maker_form(uuid) to authenticated;

-- Public: the marks of public listings, only where their profile is still shown. A mark of a hidden maker or a
-- revoked artist is left out, the rest of the row stays.
create or replace function public.get_listing_marks(p_listing_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(mark) filter (where mark is not null), '[]'::jsonb)
  from (
    select nullif(jsonb_strip_nulls(jsonb_build_object(
      'listing_id', l.id,
      'maker', case when m.store_id is not null and (d.handmade or d.made_to_order_weeks is not null) then jsonb_build_object(
        'kind', m.kind, 'craft_city', m.craft_city, 'store_name', s.name, 'store_slug', s.slug) end,
      'handmade', case when m.store_id is not null and d.handmade then true end,
      'made_to_order_weeks', case when m.store_id is not null then d.made_to_order_weeks end,
      'artist', case when a.user_id is not null then jsonb_build_object('display_name', a.display_name, 'slug', a.slug) end,
      'artist_note', case when a.user_id is not null then d.artist_note end
    )), jsonb_build_object('listing_id', l.id)) as mark
    from public.listings l
    join public.listing_maker_details d on d.listing_id = l.id
    left join public.stores s on s.id = l.store_id
    left join public.store_maker_profiles m on m.store_id = l.store_id and m.hidden_at is null and s.status = 'active'
    left join public.artist_profiles a on a.user_id = laria_private.listing_seller_user(l) and a.revoked_at is null
      and d.artist_note is not null
    where l.id = any(coalesce(p_listing_ids, '{}'))
      and coalesce(cardinality(p_listing_ids), 0) <= 120
      and public.listing_is_public(l.id)
  ) marks;
$$;

revoke all on function public.get_listing_marks(uuid[]) from public;
grant execute on function public.get_listing_marks(uuid[]) to anon, authenticated;

-- Public: the shown makers with their story and the ids of their newest public handmade listings (the landing reads
-- the cards through the catalog's own query, under RLS).
create or replace function public.get_public_makers(p_listings_per_maker integer default 4)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'store_id', s.id, 'store_name', s.name, 'store_slug', s.slug, 'logo_url', s.logo_url,
      'is_verified', s.is_verified, 'kind', m.kind, 'craft_city', m.craft_city, 'story', m.story,
      'since_year', m.since_year,
      'listing_ids', coalesce((
        select jsonb_agg(x.id) from (
          select l.id from public.listings l join public.listing_maker_details d on d.listing_id = l.id and d.handmade
          where l.store_id = s.id and public.listing_is_public(l.id)
            and (l.stock_state is null or l.stock_state = 'in_stock')
          order by l.published_at desc nulls last, l.id
          limit least(greatest(coalesce(p_listings_per_maker, 4), 0), 12)) x), '[]'::jsonb))
    order by s.is_verified desc, m.created_at), '[]'::jsonb)
  from public.store_maker_profiles m
  join public.stores s on s.id = m.store_id
  where m.hidden_at is null and s.status = 'active';
$$;

revoke all on function public.get_public_makers(integer) from public;
grant execute on function public.get_public_makers(integer) to anon, authenticated;

-- Public: the maker profile shown on one store page, or null.
create or replace function public.get_store_maker_profile(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('kind', m.kind, 'craft_city', m.craft_city, 'story', m.story, 'since_year', m.since_year)
  from laria_private.visible_maker_profile(p_store_id) m
  where m.store_id is not null;
$$;

revoke all on function public.get_store_maker_profile(uuid) from public;
grant execute on function public.get_store_maker_profile(uuid) to anon, authenticated;

-- Public: the verified artists with their story and the ids of their newest public listings.
create or replace function public.get_public_artists(p_listings_per_artist integer default 4)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'slug', a.slug, 'display_name', a.display_name, 'story', a.story, 'link_url', a.link_url,
      'listing_ids', coalesce((
        select jsonb_agg(x.id) from (
          select l.id from public.listings l
          where laria_private.listing_seller_user(l) = a.user_id and public.listing_is_public(l.id)
            and (l.stock_state is null or l.stock_state = 'in_stock')
          order by l.published_at desc nulls last, l.id
          limit least(greatest(coalesce(p_listings_per_artist, 4), 0), 12)) x), '[]'::jsonb))
    order by a.verified_at), '[]'::jsonb)
  from public.artist_profiles a
  where a.revoked_at is null;
$$;

revoke all on function public.get_public_artists(integer) from public;
grant execute on function public.get_public_artists(integer) to anon, authenticated;

-- Public: active stores that accept gift exchanges, verified first.
create or replace function public.get_gift_exchange_stores(p_limit integer default 12)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_data order by verified desc, name), '[]'::jsonb)
  from (
    select s.is_verified as verified, s.name, jsonb_build_object('store_name', s.name, 'store_slug', s.slug, 'city', s.city,
      'is_verified', s.is_verified, 'logo_url', s.logo_url, 'exchange_days', g.exchange_days, 'note', g.note) as row_data
    from public.store_gift_policies g join public.stores s on s.id = g.store_id
    where s.status = 'active'
    order by s.is_verified desc, s.name
    limit least(greatest(coalesce(p_limit, 12), 1), 48)
  ) rows;
$$;

revoke all on function public.get_gift_exchange_stores(integer) from public;
grant execute on function public.get_gift_exchange_stores(integer) to anon, authenticated;

-- Admin: every maker profile, hidden ones included.
create or replace function public.get_admin_makers()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform laria_private.assert_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('store_id', s.id, 'store_name', s.name, 'store_slug', s.slug,
      'store_status', s.status, 'is_verified', s.is_verified, 'kind', m.kind, 'craft_city', m.craft_city,
      'story', m.story, 'since_year', m.since_year, 'updated_at', m.updated_at,
      'hidden_at', m.hidden_at, 'hidden_reason', m.hidden_reason,
      'handmade_listings', (select count(*) from public.listing_maker_details d join public.listings l on l.id = d.listing_id
                            where l.store_id = s.id and d.handmade))
      order by m.hidden_at nulls first, m.updated_at desc)
    from public.store_maker_profiles m join public.stores s on s.id = m.store_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_admin_makers() from public, anon;
grant execute on function public.get_admin_makers() to authenticated;

-- Admin hides (p_hidden true) or shows again a maker profile, with a reason; audited on the store.
create or replace function public.admin_set_maker_hidden(p_store_id uuid, p_hidden boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare clean_reason text := btrim(coalesce(p_reason, '')); saved public.store_maker_profiles;
begin
  perform laria_private.assert_admin();
  if char_length(clean_reason) not between 3 and 500 then
    perform laria_private.raise_discovery_error('REASON_REQUIRED', 'Escribe un motivo de entre 3 y 500 caracteres.');
  end if;
  update public.store_maker_profiles
  set hidden_at = case when p_hidden then now() end,
      hidden_reason = case when p_hidden then clean_reason end,
      hidden_by = case when p_hidden then auth.uid() end,
      updated_at = now()
  where store_id = p_store_id and (hidden_at is null) = coalesce(p_hidden, false)
  returning * into saved;
  if saved.store_id is null then
    perform laria_private.raise_discovery_error('MAKER_STATUS_UNCHANGED', 'El perfil ya está así.');
  end if;
  perform laria_private.record_admin_audit(case when p_hidden then 'maker_hidden' else 'maker_restored' end,
    'store', p_store_id, jsonb_build_object('reason', clean_reason));
  return jsonb_build_object('store_id', p_store_id, 'hidden', p_hidden);
end;
$$;

revoke all on function public.admin_set_maker_hidden(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_maker_hidden(uuid, boolean, text) to authenticated;

-- -------------------------------------------------------------------------------------------- 5. collections

-- A set is {"label": "Cajones", "query": "category=percussion&instrument_type=hand_percussion&percussion_type=cajon"}:
-- the catalog's own URL parameters, so its link opens the same results. The app parses the query with the catalog's
-- filter parser; the database only checks its shape and characters.
create or replace function laria_private.collection_sets_are_valid(p_sets jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(p_sets) = 'array'
    and jsonb_array_length(p_sets) between 1 and 4
    and not exists (
      select 1 from jsonb_array_elements(p_sets) item
      where jsonb_typeof(item) <> 'object'
        or exists (select 1 from jsonb_object_keys(item) key where key not in ('label', 'query'))
        or jsonb_typeof(item->'label') is distinct from 'string'
        or jsonb_typeof(item->'query') is distinct from 'string'
        or char_length(btrim(item->>'label')) not between 2 and 40
        or char_length(item->>'query') not between 3 and 300
        or (item->>'query') !~ '^[A-Za-z0-9_=&%+.,-]+$'
    );
$$;

create table public.collections (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  title       text not null check (char_length(btrim(title)) between 3 and 80),
  intro       text not null check (char_length(btrim(intro)) between 20 and 400),
  sets        jsonb not null check (laria_private.collection_sets_are_valid(sets)),
  starts_on   date,
  ends_on     date,
  published   boolean not null default false,
  sort_order  smallint not null default 100 check (sort_order between 0 and 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  constraint collections_dates check (starts_on is null or ends_on is null or ends_on >= starts_on)
);

alter table public.collections enable row level security;
revoke all on public.collections from public, anon, authenticated;
grant select on public.collections to anon, authenticated;
-- Public while published and inside its dates (Lima's calendar day); Admin sees every collection.
create policy collections_public_read on public.collections
for select to anon, authenticated
using (
  (published
    and (starts_on is null or starts_on <= (now() at time zone 'America/Lima')::date)
    and (ends_on is null or ends_on >= (now() at time zone 'America/Lima')::date))
  or public.is_admin()
);

create or replace function public.admin_save_collection(
  p_id uuid, p_slug text, p_title text, p_intro text, p_sets jsonb,
  p_starts_on date, p_ends_on date, p_published boolean, p_sort_order integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare saved public.collections;
begin
  perform laria_private.assert_admin();
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_slug) > 60 then
    perform laria_private.raise_discovery_error('COLLECTION_SLUG_INVALID', 'El enlace usa minúsculas, números y guiones.');
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 80 then
    perform laria_private.raise_discovery_error('COLLECTION_TITLE_INVALID', 'El título debe tener entre 3 y 80 caracteres.');
  end if;
  if char_length(btrim(coalesce(p_intro, ''))) not between 20 and 400 then
    perform laria_private.raise_discovery_error('COLLECTION_INTRO_INVALID', 'El texto debe tener entre 20 y 400 caracteres.');
  end if;
  if p_sets is null or not laria_private.collection_sets_are_valid(p_sets) then
    perform laria_private.raise_discovery_error('COLLECTION_SETS_INVALID', 'Agrega de 1 a 4 grupos, cada uno con nombre y filtros.');
  end if;
  if p_starts_on is not null and p_ends_on is not null and p_ends_on < p_starts_on then
    perform laria_private.raise_discovery_error('COLLECTION_DATES_INVALID', 'La fecha de fin va después de la de inicio.');
  end if;
  begin
    if p_id is null then
      insert into public.collections(slug, title, intro, sets, starts_on, ends_on, published, sort_order, updated_by)
      values (p_slug, btrim(p_title), btrim(p_intro), p_sets, p_starts_on, p_ends_on, coalesce(p_published, false),
        least(greatest(coalesce(p_sort_order, 100), 0), 1000), auth.uid())
      returning * into saved;
    else
      update public.collections
      set slug = p_slug, title = btrim(p_title), intro = btrim(p_intro), sets = p_sets, starts_on = p_starts_on,
          ends_on = p_ends_on, published = coalesce(p_published, false),
          sort_order = least(greatest(coalesce(p_sort_order, 100), 0), 1000), updated_at = now(), updated_by = auth.uid()
      where id = p_id
      returning * into saved;
      if saved.id is null then
        perform laria_private.raise_discovery_error('COLLECTION_NOT_FOUND', 'Esta colección ya no existe.');
      end if;
    end if;
  exception when unique_violation then
    perform laria_private.raise_discovery_error('COLLECTION_SLUG_TAKEN', 'Ese enlace ya lo usa otra colección.');
  end;
  perform laria_private.record_admin_audit(case when p_id is null then 'collection_created' else 'collection_updated' end,
    'collection', saved.id, jsonb_build_object('slug', saved.slug, 'published', saved.published,
      'starts_on', saved.starts_on, 'ends_on', saved.ends_on));
  return to_jsonb(saved);
end;
$$;

revoke all on function public.admin_save_collection(uuid, text, text, text, jsonb, date, date, boolean, integer) from public, anon;
grant execute on function public.admin_save_collection(uuid, text, text, text, jsonb, date, date, boolean, integer) to authenticated;

create or replace function public.admin_delete_collection(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare removed public.collections;
begin
  perform laria_private.assert_admin();
  delete from public.collections where id = p_id returning * into removed;
  if removed.id is null then
    perform laria_private.raise_discovery_error('COLLECTION_NOT_FOUND', 'Esta colección ya no existe.');
  end if;
  perform laria_private.record_admin_audit('collection_deleted', 'collection', removed.id,
    jsonb_build_object('slug', removed.slug, 'title', removed.title));
  return jsonb_build_object('id', removed.id, 'deleted', true);
end;
$$;

revoke all on function public.admin_delete_collection(uuid) from public, anon;
grant execute on function public.admin_delete_collection(uuid) to authenticated;

-- The first collections, written with Henri's ideas list (disc-03). Admin edits, dates or unpublishes them; a second
-- run of this file changes nothing (on conflict do nothing keeps Admin's edits).
insert into public.collections(slug, title, intro, sets, starts_on, ends_on, published, sort_order) values
  ('criollo-y-afroperuano', 'Criollo y afroperuano',
   'Cajones y guitarras criollas para el vals, la marinera y el festejo. Para la Canción Criolla y todo el año.',
   '[{"label":"Cajones","query":"category=percussion&instrument_type=hand_percussion&percussion_type=cajon"},
     {"label":"Guitarras criollas y clásicas","query":"category=guitars&instrument_type=acoustic_guitar&acoustic_type=classical"}]',
   null, null, true, 10),
  ('andino', 'Andino',
   'Charangos, quenas, zampoñas y bombos de particulares, tiendas y talleres que los hacen a mano.',
   '[{"label":"Charangos","query":"category=andean&instrument_type=andean_instrument&andean_type=charango"},
     {"label":"Quenas","query":"category=andean&instrument_type=andean_instrument&andean_type=quena"},
     {"label":"Zampoñas y sikus","query":"category=andean&instrument_type=andean_instrument&andean_type=zampona"},
     {"label":"Todo lo andino","query":"category=andean"}]',
   null, null, true, 20),
  ('banda-escolar', 'Banda escolar',
   'Trompetas, trombones, tambores y liras para la banda del colegio, antes del año escolar y de los desfiles de julio.',
   '[{"label":"Trompetas","query":"category=winds&instrument_type=winds&wind_type=trumpet"},
     {"label":"Trombones","query":"category=winds&instrument_type=winds&wind_type=trombone"},
     {"label":"Tambores","query":"q=tambor"},
     {"label":"Liras","query":"q=lira"}]',
   '2027-02-01', '2027-07-31', true, 30),
  ('alabanza', 'Alabanza',
   'Teclados, guitarras electroacústicas, micrófonos y sonido para el ministerio de música de tu iglesia.',
   '[{"label":"Teclados","query":"category=keyboards"},
     {"label":"Guitarras electroacústicas","query":"category=guitars&instrument_type=acoustic_guitar&acoustic_type=electro_acoustic"},
     {"label":"Micrófonos","query":"category=microphones"},
     {"label":"Parlantes y mezcladoras","query":"category=audio&instrument_type=audio_gear"}]',
   null, null, true, 40),
  ('home-studio', 'Home studio',
   'Lo básico para grabar en casa: interfaz, monitores, un micrófono de condensador y un controlador.',
   '[{"label":"Interfaces de audio","query":"category=audio&instrument_type=audio_interface"},
     {"label":"Monitores de estudio","query":"category=audio&instrument_type=audio_gear&audio_type=studio_monitor"},
     {"label":"Micrófonos de condensador","query":"category=microphones&instrument_type=microphones&microphone_type=condenser"},
     {"label":"Controladores MIDI","query":"category=keyboards&instrument_type=keyboards&keyboard_type=midi_controller"}]',
   null, null, true, 50),
  ('empieza-con-500', 'Empieza con S/ 500',
   'Guitarras, teclados, ukeleles y percusión de hasta S/ 500 para empezar a tocar sin gastar de más.',
   '[{"label":"Guitarras","query":"category=guitars&max_price=500"},
     {"label":"Teclados","query":"category=keyboards&max_price=500"},
     {"label":"Ukeleles y cuerdas","query":"category=strings&max_price=500"},
     {"label":"Percusión","query":"category=percussion&max_price=500"}]',
   null, null, true, 60)
on conflict (slug) do nothing;
