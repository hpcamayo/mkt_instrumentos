-- Effortless Laria, batch "stores" (docs/ux-effortless/stores.md): list-12, find-13 and find-14.
--
-- list-12: a store may show its street address (with a "Cómo llegar" map link) and its opening hours on its page and
--          on its listings. The address is already stored for every store (a required application field); it is shown
--          only when the store says so (show_address, off by default). Opening hours are free text the store writes.
-- find-13: /tiendas lists the active stores with their number of public listings and their rating, in one call.
-- find-14: the store page offers category chips, built from the categories the store actually has.
--
-- Additive: three columns, one check, two read functions. Owners already update their store row through
-- "Store members can update store profile fields" and the table-level UPDATE grant; protect_store_admin_fields does
-- not cover the new columns, so the store profile form can save them as it saves the others.
--
-- The address: public pages read public_address, a generated column that holds the street address only while
-- show_address is true, never the raw address. The separate change 20261022130000_store_public_columns.sql (from
-- main) closes the raw column, RUC, e-mail and the other private fields to the public with column grants; the grant
-- at the end of this file makes the three new public columns readable under it. Before that change is merged the
-- table-level grant still covers them, so this file works with or without it.

alter table public.stores
  add column show_address boolean not null default false,
  add column opening_hours text,
  add constraint stores_opening_hours_length check (
    opening_hours is null or (char_length(opening_hours) between 1 and 300 and btrim(opening_hours) <> '')
  );

alter table public.stores
  add column public_address text generated always as (case when show_address then nullif(btrim(address), '') end) stored;

comment on column public.stores.public_address is
  'list-12: the street address while show_address is true, otherwise null. Public pages read this, never address.';
comment on column public.stores.show_address is
  'list-12: the store agreed to show its street address (and a map link) on its public page and listings. Off by default.';
comment on column public.stores.opening_hours is
  'list-12: opening hours as the store writes them ("Lun a sáb de 10 a. m. a 7 p. m."), 1–300 characters, or null.';

-- find-13: the stores directory. Active stores only, public columns only (no address, contact or business data),
-- with the number of approved listings (the store page's "N publicaciones": in stock and out of stock) and the
-- verified-transaction rating counted exactly as get_public_reputation counts it. Verified stores first, then by name.
create or replace function public.get_public_store_directory()
returns table (
  id uuid,
  name text,
  slug text,
  city text,
  district text,
  region text,
  logo_url text,
  is_verified boolean,
  listing_count bigint,
  review_count bigint,
  average_rating numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.name,
    s.slug,
    s.city,
    s.district,
    s.region,
    s.logo_url,
    s.is_verified,
    (select count(*) from public.listings l
      where l.store_id = s.id and l.status = 'approved' and l.seller_type = 'store') as listing_count,
    reviews.review_count,
    reviews.average_rating
  from public.stores s
  cross join lateral (
    select count(*) as review_count, avg(r.rating)::numeric(3,2) as average_rating
    from public.transaction_reviews r
    join public.verified_transactions t on t.id = r.transaction_id
    join public.profiles p on p.id = r.reviewer_user_id
    where r.direction = 'buyer_to_seller'
      and r.subject_store_id = s.id
      and laria_private.review_is_visible(r.id)
  ) reviews
  where s.status = 'active'
  order by s.is_verified desc, lower(s.name), s.id
  limit 2000;
$$;

revoke all on function public.get_public_store_directory() from public;
grant execute on function public.get_public_store_directory() to anon, authenticated;

-- find-14: the categories a store has, with how many approved listings each holds. Security invoker: row-level
-- security decides what is counted (a visitor counts the store's public listings; the owner previewing a store in
-- review counts its own approved listings).
create or replace function public.get_store_listing_categories(p_store_id uuid)
returns table (category text, listing_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select l.category, count(*) as listing_count
  from public.listings l
  where l.store_id = p_store_id and l.status = 'approved'
  group by l.category
  order by l.category;
$$;

revoke all on function public.get_store_listing_categories(uuid) from public;
grant execute on function public.get_store_listing_categories(uuid) to anon, authenticated;

-- Public columns of list-12 (see the note at the top). Column grants add to a table-level grant, so this is a no-op
-- until the column-grant change is merged, and keeps them readable after it.
grant select (show_address, opening_hours, public_address) on public.stores to anon, authenticated;
