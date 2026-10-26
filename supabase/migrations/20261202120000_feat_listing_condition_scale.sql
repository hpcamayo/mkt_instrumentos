-- Feature ideas, batch listing-details (docs/feature-ideas/listing-details.md), sell-10 "Estado detallado".
--
-- The three conditions (Nuevo, Usado - buen estado, Usado - con detalles) become a gear scale, after Reverb's:
--   Nuevo · Como nuevo · Excelente · Muy bueno · Bueno · Regular · Para reparar,
-- and, for stores only, "Exhibición o caja abierta". Values stay Spanish text in listings.condition, as before.
--
-- Old values map across (FD-listing-details-1):
--   a listing, revision, draft or store default:  Usado - buen estado → Muy bueno, Usado - con detalles → Bueno.
--   a search (saved alert, old link):              Usado - buen estado → Exhibición o caja abierta, Como nuevo,
--                                                  Excelente, Muy bueno; Usado - con detalles → Bueno, Regular,
--                                                  Para reparar. Nuevo stays Nuevo.
-- A search keeps finding everything it found before (the mapped listing value is inside the mapped search set).
--
-- From now on a listing's condition is checked in the database: on insert, and whenever it changes, it must be on
-- the scale, and "Exhibición o caja abierta" only on a store listing. An old value written by any path (an open
-- import, a cached page, a SKU's remembered details) is mapped on the way in instead of refused.
--
-- Nothing here changes a listing's status, dates or "Actualizado" line: the relabel runs with the content-change
-- trigger off.

-- ------------------------------------------------------------------ the scale

create or replace function public.listing_condition_is_valid(p_condition text, p_store boolean default false)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_condition in ('Nuevo', 'Como nuevo', 'Excelente', 'Muy bueno', 'Bueno', 'Regular', 'Para reparar')
    or (coalesce(p_store, false) and p_condition = 'Exhibición o caja abierta');
$$;

comment on function public.listing_condition_is_valid(text, boolean) is
  'sell-10: the condition scale. "Exhibición o caja abierta" is valid only for a store listing (p_store).';

-- An old stored value as today's single value (listings, revisions, drafts, store defaults).
create or replace function laria_private.current_condition(p_condition text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_condition
    when 'Usado - buen estado' then 'Muy bueno'
    when 'Usado - con detalles' then 'Bueno'
    else p_condition
  end;
$$;

-- An old search value as today's set of values (saved alerts and old links keep their meaning).
create or replace function laria_private.condition_search_values(p_condition text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case p_condition
    when 'Usado - buen estado' then array['Exhibición o caja abierta', 'Como nuevo', 'Excelente', 'Muy bueno']
    when 'Usado - con detalles' then array['Bueno', 'Regular', 'Para reparar']
    else array[p_condition]
  end;
$$;

-- A saved search's condition (one string or a list) with old values expanded; null when nothing is left. One value
-- stays a string and several a sorted list, the shape laria_private.saved_search_text_values gives.
create or replace function laria_private.expand_search_conditions(p_value jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  with items as (
    select distinct mapped.value
    from jsonb_array_elements_text(case jsonb_typeof(p_value)
      when 'array' then p_value when 'string' then jsonb_build_array(p_value) else '[]'::jsonb end) as original(condition),
      unnest(laria_private.condition_search_values(original.condition)) as mapped(value)
  )
  select case
    when (select count(*) from items) = 0 then null
    when (select count(*) from items) = 1 then (select to_jsonb(value) from items)
    else (select to_jsonb(array_agg(value order by value)) from items)
  end;
$$;

revoke all on function laria_private.current_condition(text) from public, anon, authenticated;
revoke all on function laria_private.condition_search_values(text) from public, anon, authenticated;
revoke all on function laria_private.expand_search_conditions(jsonb) from public, anon, authenticated;
grant execute on function public.listing_condition_is_valid(text, boolean) to anon, authenticated, service_role;

-- ------------------------------------------------------------------ the rule on listings and revisions

create or replace function laria_private.check_listing_condition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.condition := laria_private.current_condition(new.condition);
  if new.condition is not null
    and (tg_op = 'INSERT' or new.condition is distinct from old.condition or new.seller_type is distinct from old.seller_type)
    and not public.listing_condition_is_valid(new.condition, new.seller_type = 'store') then
    raise exception using errcode = 'P0001',
      message = 'LISTING_CONDITION_INVALID: Elige una condición de la escala.';
  end if;
  return new;
end;
$$;

drop trigger if exists listings_check_condition on public.listings;
create trigger listings_check_condition
before insert or update of condition, seller_type on public.listings
for each row execute function laria_private.check_listing_condition();

-- A revision proposes a condition for its listing; the listing's own rule applies when it is approved.
create or replace function laria_private.map_revision_condition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.condition := laria_private.current_condition(new.condition);
  return new;
end;
$$;

drop trigger if exists listing_revisions_map_condition on public.listing_revisions;
create trigger listing_revisions_map_condition
before insert or update of condition on public.listing_revisions
for each row execute function laria_private.map_revision_condition();

revoke all on function laria_private.check_listing_condition() from public, anon, authenticated;
revoke all on function laria_private.map_revision_condition() from public, anon, authenticated;

-- ------------------------------------------------------------------ the data

-- Listings, sold ones included (a sold page reads the same scale). Controlled-field and content-change checks are
-- for people's edits, not for this relabel.
select set_config('app.allow_listing_admin_fields', 'true', true);
alter table public.listings disable trigger listings_track_content_change;
update public.listings
set condition = laria_private.current_condition(condition)
where condition in ('Usado - buen estado', 'Usado - con detalles');
alter table public.listings enable trigger listings_track_content_change;
select set_config('app.allow_listing_admin_fields', '', true);

update public.listing_revisions
set condition = laria_private.current_condition(condition)
where condition in ('Usado - buen estado', 'Usado - con detalles');

update public.listing_drafts
set form = jsonb_set(form, '{condition}', to_jsonb(laria_private.current_condition(form->>'condition')))
where form->>'condition' in ('Usado - buen estado', 'Usado - con detalles');

-- A SKU's remembered details prefill the publish form.
update public.store_inventory_items
set listing_details = jsonb_set(listing_details, '{condition}', to_jsonb(laria_private.current_condition(listing_details->>'condition')))
where listing_details->>'condition' in ('Usado - buen estado', 'Usado - con detalles');

-- A store's default condition: the scale, "Exhibición o caja abierta" included.
alter table public.store_listing_defaults drop constraint if exists store_listing_defaults_condition_check;
update public.store_listing_defaults
set condition = laria_private.current_condition(condition)
where condition in ('Usado - buen estado', 'Usado - con detalles');
alter table public.store_listing_defaults
  add constraint store_listing_defaults_condition_check
  check (condition is null or public.listing_condition_is_valid(condition, true));

-- Saved alerts keep finding what they found. A remapped alert identical to another of the same person is ended, as
-- 20261022120000_marketplace_categories.sql did for moved categories (mapping old sets to new ones is one-to-one, so
-- this is defensive).
create temporary table condition_mapped_alerts on commit drop as
select alert.id, alert.user_id, alert.created_at, alert.deleted_at,
  case when laria_private.expand_search_conditions(alert.search_filters->'condition') is null
    then alert.search_filters - 'condition'
    else jsonb_set(alert.search_filters, '{condition}', laria_private.expand_search_conditions(alert.search_filters->'condition'))
  end as filters
from public.saved_search_alerts alert
where exists (
  select 1 from jsonb_array_elements_text(case jsonb_typeof(alert.search_filters->'condition')
    when 'array' then alert.search_filters->'condition'
    when 'string' then jsonb_build_array(alert.search_filters->'condition') else '[]'::jsonb end) value
  where value in ('Usado - buen estado', 'Usado - con detalles')
);

create temporary table condition_duplicate_alerts on commit drop as
select ranked.id
from (
  select mapped.id,
    row_number() over (partition by mapped.user_id, laria_private.saved_search_hash(mapped.filters)
      order by mapped.created_at, mapped.id) as copy_number,
    exists (
      select 1 from public.saved_search_alerts other
      where other.user_id = mapped.user_id and other.deleted_at is null
        and other.id not in (select id from condition_mapped_alerts)
        and other.search_hash = laria_private.saved_search_hash(mapped.filters)
    ) as already_saved
  from condition_mapped_alerts mapped
  where mapped.deleted_at is null
) ranked
where ranked.copy_number > 1 or ranked.already_saved;

update public.saved_search_alerts
set status = 'deleted', deleted_at = clock_timestamp(), paused_at = coalesce(paused_at, clock_timestamp()), updated_at = clock_timestamp()
where id in (select id from condition_duplicate_alerts);

update public.saved_search_alerts alert
set search_filters = mapped.filters,
    search_hash = laria_private.saved_search_hash(mapped.filters),
    updated_at = clock_timestamp()
from condition_mapped_alerts mapped
where alert.id = mapped.id;
