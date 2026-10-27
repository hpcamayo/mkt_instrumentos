-- Feature ideas, store-floor batch (docs/feature-ideas/store-floor.md): reach-09 "Garantía y cambios".
--
-- A store states its warranty and returns once per condition group ("Nuevo", "Exhibición o caja abierta", "Usado"),
-- and every store listing carries the line. A listing follows its store's policy unless the store gives that one
-- listing its own terms. The promise is the store's: Laria stores what the store says and shows it as the store's.
--
-- Additive: one table, five nullable listing columns, one helper, one trigger and three functions.
--   * Particular listings never carry terms (check below), so nothing changes for them.
--   * Owners still cannot update listings directly; the columns change only through the functions here (and Admin).
--     They are not moderated: like the price, the store's own promise applies at once.
--   * No shared function is redefined. complete_public_submission and update_owned_listing are untouched: the BEFORE
--     trigger fills a new or re-conditioned store listing from the policy, whichever path wrote it.
--   * "Con garantía" (the filter) is a listing flag; it arrives with the listing flag registry in its own migration.

-- ------------------------------------------------------------------ condition groups

-- The three groups a policy is written for. The listing-details batch replaces today's conditions (sell-10); every
-- value but "Nuevo" and the stores-only "Exhibición o caja abierta" is a used instrument, so the groups survive it.
create or replace function laria_private.listing_condition_group(p_condition text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_condition is null or btrim(p_condition) = '' then null
    when p_condition = 'Nuevo' then 'new'
    when lower(p_condition) like 'exhibici%' or lower(p_condition) like '%caja abierta%' then 'open_box'
    else 'used'
  end
$$;

revoke all on function laria_private.listing_condition_group(text) from public, anon, authenticated;

-- ------------------------------------------------------------------ the store's policy

create table public.store_warranty_policies (
  store_id uuid not null references public.stores(id) on delete cascade,
  condition_group text not null check (condition_group in ('new', 'open_box', 'used')),
  -- null: the store says nothing about it; 0: "Sin garantía de la tienda" / "Sin cambios"; otherwise months or days.
  warranty_months smallint check (warranty_months is null or warranty_months between 0 and 60),
  -- Who stands behind the warranty: the store itself or the brand (through the store).
  warranty_provider text check (warranty_provider is null or warranty_provider in ('store', 'brand')),
  returns_days smallint check (returns_days is null or returns_days between 0 and 30),
  -- "con boleta y empaque original"
  returns_note text check (returns_note is null or (char_length(returns_note) between 1 and 100 and btrim(returns_note) <> '')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  primary key (store_id, condition_group),
  constraint store_warranty_provider_needs_months check (warranty_provider is null or coalesce(warranty_months, 0) > 0),
  constraint store_warranty_note_needs_returns check (returns_note is null or coalesce(returns_days, 0) > 0),
  -- A policy that says nothing is deleted instead.
  constraint store_warranty_says_something check (warranty_months is not null or returns_days is not null)
);
create index if not exists store_warranty_policies_updated_by_idx on public.store_warranty_policies (updated_by)
  where updated_by is not null;

comment on table public.store_warranty_policies is
  'reach-09: a store''s warranty and returns per condition group. Written only by set_store_warranty_policy.';

alter table public.store_warranty_policies enable row level security;
revoke all on public.store_warranty_policies from anon, authenticated;
grant select on public.store_warranty_policies to anon, authenticated;

-- Public for active stores (the store page shows it), and always for the owner.
create policy store_warranty_policies_read on public.store_warranty_policies
for select to anon, authenticated
using (
  public.is_store_owner(store_id)
  or exists (select 1 from public.stores s where s.id = store_id and s.status = 'active')
);

-- ------------------------------------------------------------------ the listing's copy

alter table public.listings
  add column warranty_months smallint check (warranty_months is null or warranty_months between 0 and 60),
  add column warranty_provider text check (warranty_provider is null or warranty_provider in ('store', 'brand')),
  add column returns_days smallint check (returns_days is null or returns_days between 0 and 30),
  add column returns_note text check (returns_note is null or (char_length(returns_note) between 1 and 100 and btrim(returns_note) <> '')),
  -- 'store_policy': follows the store's policy for its condition group; 'listing': the store set this listing's own.
  add column store_terms_source text check (store_terms_source is null or store_terms_source in ('store_policy', 'listing'));

alter table public.listings
  add constraint listings_store_terms_store_only check (
    seller_type = 'store'
    or (warranty_months is null and warranty_provider is null and returns_days is null and returns_note is null
        and store_terms_source is null)
  ),
  add constraint listings_warranty_provider_needs_months check (warranty_provider is null or coalesce(warranty_months, 0) > 0),
  add constraint listings_returns_note_needs_returns check (returns_note is null or coalesce(returns_days, 0) > 0);

comment on column public.listings.warranty_months is
  'reach-09: the store''s warranty in months (0 = none of its own), copied from its policy or set for this listing.';
comment on column public.listings.store_terms_source is
  'reach-09: store_policy (follows store_warranty_policies for the condition group) or listing (its own terms).';

-- "Con garantía": store listings with a warranty, newest first, as the catalog reads them.
create index listings_public_with_warranty_idx on public.listings (published_at desc, id)
  where status = 'approved' and warranty_months > 0;

-- ------------------------------------------------------------------ keeping the copy in step

-- A new store listing, a listing whose condition changes, or one set back to its store's policy takes the policy of
-- its condition group (nothing when the store has none). A listing with its own terms keeps them. Particular listings
-- are left with none. The name sorts first so the listing flag triggers (listings_flags_*) see the filled columns.
create or replace function laria_private.apply_store_terms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare policy public.store_warranty_policies;
begin
  if new.seller_type is distinct from 'store' or new.store_id is null then
    new.warranty_months := null; new.warranty_provider := null; new.returns_days := null; new.returns_note := null;
    new.store_terms_source := null;
    return new;
  end if;
  if new.store_terms_source = 'listing' then return new; end if;
  select * into policy from public.store_warranty_policies
  where store_id = new.store_id and condition_group = laria_private.listing_condition_group(new.condition);
  new.warranty_months := policy.warranty_months;
  new.warranty_provider := policy.warranty_provider;
  new.returns_days := policy.returns_days;
  new.returns_note := policy.returns_note;
  new.store_terms_source := case when policy.store_id is null then null else 'store_policy' end;
  return new;
end;
$$;

revoke all on function laria_private.apply_store_terms() from public, anon, authenticated;

create trigger listings_a_store_terms
before insert or update of condition, store_terms_source, seller_type, store_id on public.listings
for each row execute function laria_private.apply_store_terms();

-- Re-applies the policy to every unsold listing of a store that follows it, in one condition group (or all groups).
-- Listings are locked in id order, the order every inventory path uses (design §4.3); nothing here locks an item.
create or replace function laria_private.refresh_store_terms(p_store_id uuid, p_condition_group text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare refreshed integer;
begin
  perform 1 from public.listings
  where store_id = p_store_id and status <> 'sold' and coalesce(store_terms_source, 'store_policy') = 'store_policy'
    and (p_condition_group is null or laria_private.listing_condition_group(condition) = p_condition_group)
  order by id for update;
  -- Naming store_terms_source in the SET list fires listings_a_store_terms, which copies the policy (or clears it).
  update public.listings set store_terms_source = 'store_policy'
  where store_id = p_store_id and status <> 'sold' and coalesce(store_terms_source, 'store_policy') = 'store_policy'
    and (p_condition_group is null or laria_private.listing_condition_group(condition) = p_condition_group);
  get diagnostics refreshed = row_count;
  return refreshed;
end;
$$;

revoke all on function laria_private.refresh_store_terms(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------------ errors and reading the fields

create or replace function laria_private.raise_terms_error(p_code text, p_message text)
returns void
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001', message = p_code || ': ' || p_message;
end;
$$;

revoke all on function laria_private.raise_terms_error(text, text) from public, anon, authenticated;

-- The caller's store, for writing: the owner of a store that is in review or active.
create or replace function laria_private.terms_caller_store()
returns public.stores
language plpgsql
stable
security definer
set search_path = public
as $$
declare store_record public.stores;
begin
  select s.* into store_record from public.stores s
  where auth.uid() is not null and s.owner_user_id = auth.uid() and public.is_store_owner(s.id);
  if store_record.id is null then
    perform laria_private.raise_terms_error('STORE_TERMS_STORE_REQUIRED', 'Necesitas una tienda para indicar tu garantía.');
  end if;
  if store_record.status not in ('pending', 'active') then
    perform laria_private.raise_terms_error('STORE_TERMS_READ_ONLY', 'Tu tienda no puede cambiar su garantía en este momento.');
  end if;
  return store_record;
end;
$$;

revoke all on function laria_private.terms_caller_store() from public, anon, authenticated;

-- Reads the four term fields from JSON: integers in range, a provider from the list, a trimmed note. Returns them as a
-- row of the policy table (store and group left empty). Unknown keys are an error, so a typo never passes silently.
create or replace function laria_private.read_store_terms(p_fields jsonb)
returns public.store_warranty_policies
language plpgsql
immutable
set search_path = public
as $$
declare
  terms public.store_warranty_policies;
  raw text;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_fields) key
                where key not in ('warranty_months', 'warranty_provider', 'returns_days', 'returns_note')) then
    perform laria_private.raise_terms_error('STORE_TERMS_INVALID', 'Revisa los datos de garantía y cambios.');
  end if;
  begin
    if jsonb_typeof(p_fields->'warranty_months') = 'number' then terms.warranty_months := (p_fields->>'warranty_months')::smallint;
    elsif coalesce(jsonb_typeof(p_fields->'warranty_months'), 'null') <> 'null' then raise exception 'type'; end if;
    if jsonb_typeof(p_fields->'returns_days') = 'number' then terms.returns_days := (p_fields->>'returns_days')::smallint;
    elsif coalesce(jsonb_typeof(p_fields->'returns_days'), 'null') <> 'null' then raise exception 'type'; end if;
  exception when others then
    perform laria_private.raise_terms_error('STORE_TERMS_INVALID', 'Escribe la garantía en meses y los cambios en días, sin decimales.');
  end;
  if terms.warranty_months is not null and (terms.warranty_months < 0 or terms.warranty_months > 60) then
    perform laria_private.raise_terms_error('STORE_TERMS_WARRANTY_RANGE', 'La garantía va de 0 a 60 meses.');
  end if;
  if terms.returns_days is not null and (terms.returns_days < 0 or terms.returns_days > 30) then
    perform laria_private.raise_terms_error('STORE_TERMS_RETURNS_RANGE', 'El plazo para cambios va de 0 a 30 días.');
  end if;
  raw := nullif(btrim(coalesce(p_fields->>'warranty_provider', '')), '');
  if raw is not null and raw not in ('store', 'brand') then
    perform laria_private.raise_terms_error('STORE_TERMS_INVALID', 'Elige quién da la garantía.');
  end if;
  terms.warranty_provider := case when coalesce(terms.warranty_months, 0) > 0 then coalesce(raw, 'store') end;
  raw := nullif(regexp_replace(btrim(coalesce(p_fields->>'returns_note', '')), '\s+', ' ', 'g'), '');
  if raw is not null and char_length(raw) > 100 then
    perform laria_private.raise_terms_error('STORE_TERMS_NOTE_LENGTH', 'La condición para cambios tiene hasta 100 caracteres.');
  end if;
  terms.returns_note := case when coalesce(terms.returns_days, 0) > 0 then raw end;
  return terms;
end;
$$;

revoke all on function laria_private.read_store_terms(jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------------ owner functions

-- Saves (or, with nothing said, deletes) the policy of one condition group and applies it to every unsold listing of
-- the store that follows the policy. Returns the policy and how many listings changed.
create or replace function public.set_store_warranty_policy(p_condition_group text, p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  store_record public.stores := laria_private.terms_caller_store();
  terms public.store_warranty_policies;
  refreshed integer;
begin
  if p_condition_group is null or p_condition_group not in ('new', 'open_box', 'used') then
    perform laria_private.raise_terms_error('STORE_TERMS_INVALID', 'Elige para qué condición es esta política.');
  end if;
  terms := laria_private.read_store_terms(coalesce(p_fields, '{}'::jsonb));
  if terms.warranty_months is null and terms.returns_days is null then
    delete from public.store_warranty_policies where store_id = store_record.id and condition_group = p_condition_group;
  else
    insert into public.store_warranty_policies as current_policy
      (store_id, condition_group, warranty_months, warranty_provider, returns_days, returns_note, updated_at, updated_by)
    values (store_record.id, p_condition_group, terms.warranty_months, terms.warranty_provider, terms.returns_days,
      terms.returns_note, now(), auth.uid())
    on conflict (store_id, condition_group) do update set
      warranty_months = excluded.warranty_months, warranty_provider = excluded.warranty_provider,
      returns_days = excluded.returns_days, returns_note = excluded.returns_note,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  end if;
  refreshed := laria_private.refresh_store_terms(store_record.id, p_condition_group);
  return jsonb_build_object(
    'condition_group', p_condition_group,
    'policy', (select to_jsonb(p) - 'store_id' - 'updated_by' from public.store_warranty_policies p
               where p.store_id = store_record.id and p.condition_group = p_condition_group),
    'listings_updated', refreshed);
end;
$$;

revoke all on function public.set_store_warranty_policy(text, jsonb) from public, anon;
grant execute on function public.set_store_warranty_policy(text, jsonb) to authenticated;

-- One listing's terms. p_terms null (or {}) returns the listing to its store's policy; otherwise the four fields become
-- this listing's own terms. Only the store's owner, only an unsold store listing.
create or replace function public.set_listing_store_terms(p_listing_id uuid, p_terms jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  store_record public.stores := laria_private.terms_caller_store();
  listing_row public.listings;
  terms public.store_warranty_policies;
begin
  select * into listing_row from public.listings
  where id = p_listing_id and store_id = store_record.id and seller_type = 'store'
  for update;
  if listing_row.id is null then
    perform laria_private.raise_terms_error('STORE_TERMS_LISTING_NOT_OWNED', 'No puedes cambiar esta publicación.');
  end if;
  if listing_row.status = 'sold' then
    perform laria_private.raise_terms_error('STORE_TERMS_LISTING_SOLD', 'Una publicación vendida no se puede modificar.');
  end if;
  if p_terms is null or p_terms = '{}'::jsonb then
    update public.listings set store_terms_source = 'store_policy' where id = p_listing_id;
  else
    terms := laria_private.read_store_terms(p_terms);
    update public.listings set
      warranty_months = terms.warranty_months, warranty_provider = terms.warranty_provider,
      returns_days = terms.returns_days, returns_note = terms.returns_note,
      store_terms_source = 'listing'
    where id = p_listing_id;
  end if;
  return (select jsonb_build_object(
    'listing_id', l.id, 'source', coalesce(l.store_terms_source, 'store_policy'),
    'warranty_months', l.warranty_months, 'warranty_provider', l.warranty_provider,
    'returns_days', l.returns_days, 'returns_note', l.returns_note)
    from public.listings l where l.id = p_listing_id);
end;
$$;

revoke all on function public.set_listing_store_terms(uuid, jsonb) from public, anon;
grant execute on function public.set_listing_store_terms(uuid, jsonb) to authenticated;
