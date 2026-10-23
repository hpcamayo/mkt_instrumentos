-- Effortless Laria, selling batch (docs/ux-effortless/selling.md):
--
-- SHOP 06  Store defaults for new listings: a condition and a standard text (warranty, hours, delivery arranged by the
--          store) that the publish form fills in. The marketplace rules are still accepted on every listing.
-- STOCK 09 A SKU remembers its listing details (brand, model, type, condition, description, specs; the category
--          already has its own column), from the import file, from the SKU page and from each listing published from
--          it, so publishing a SKU is a confirmation. This departs from STORE-2 default 2 ("the import changes
--          inventory only"): the import still changes no listing, but it now keeps the publication columns on the SKU
--          instead of dropping them with the staged rows after 30 days. Photos are not kept (see the write-up).
-- POST 14  The usual review wait, once Laria has enough reviews to say it honestly.
-- POST 02  Publishing a draft deletes it in the same transaction.

-- ------------------------------------------------------------------ SHOP 06

create table public.store_listing_defaults (
  store_id            uuid primary key references public.stores(id) on delete cascade,
  condition           text check (condition is null or condition in ('Nuevo', 'Usado - buen estado', 'Usado - con detalles')),
  description_footer  text not null default '' check (char_length(description_footer) <= 1000),
  updated_at          timestamptz not null default now()
);

create trigger store_listing_defaults_set_updated_at
before update on public.store_listing_defaults
for each row execute function public.set_updated_at();

alter table public.store_listing_defaults enable row level security;

create policy "Store owners read own listing defaults"
on public.store_listing_defaults for select to authenticated
using (public.is_store_owner(store_id) or public.is_admin());

create policy "Store owners create own listing defaults"
on public.store_listing_defaults for insert to authenticated
with check (public.is_store_owner(store_id));

create policy "Store owners update own listing defaults"
on public.store_listing_defaults for update to authenticated
using (public.is_store_owner(store_id))
with check (public.is_store_owner(store_id));

revoke all on public.store_listing_defaults from anon, authenticated;
grant select, insert, update on public.store_listing_defaults to authenticated;

-- ------------------------------------------------------------------ STOCK 09

alter table public.store_inventory_items
  add column listing_details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(listing_details) = 'object' and pg_column_size(listing_details) <= 16384);

comment on column public.store_inventory_items.listing_details is
  'What the publish form prefills for this SKU: brand, model, instrument_type, condition, description, attributes. '
  'Descriptive only; no stock, price or publication rule reads it.';

-- Keeps only the known keys with sane values; anything else is dropped rather than refused, because the sources (an
-- import file, a published listing) were already validated for their own purpose.
create or replace function laria_private.sanitize_listing_details(p_value jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(case when jsonb_typeof(p_value) = 'object' then p_value else '{}'::jsonb end)
  where (key in ('brand', 'model') and jsonb_typeof(value) = 'string'
           and char_length(btrim(value #>> '{}')) between 1 and 80)
     or (key = 'instrument_type' and jsonb_typeof(value) = 'string' and (value #>> '{}') ~ '^[a-z_]{2,40}$')
     or (key = 'condition' and (value #>> '{}') in ('Nuevo', 'Usado - buen estado', 'Usado - con detalles'))
     or (key = 'description' and jsonb_typeof(value) = 'string'
           and char_length(btrim(value #>> '{}')) between 1 and 10000)
     or (key = 'attributes' and jsonb_typeof(value) = 'object' and value <> '{}'::jsonb
           and pg_column_size(value) <= 4096);
$$;

-- Merges new details over the SKU's. Called with the SKU already locked by the caller (publication, import commit).
create or replace function laria_private.remember_sku_listing_details(p_item_id uuid, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean jsonb := laria_private.sanitize_listing_details(p_details);
begin
  update public.store_inventory_items
  set listing_details = listing_details || clean,
      category = case when public.listing_taxonomy_is_valid(p_details->>'category', 'other')
                      then p_details->>'category' else category end
  where id = p_item_id
    and (listing_details is distinct from listing_details || clean
         or (public.listing_taxonomy_is_valid(p_details->>'category', 'other')
             and category is distinct from p_details->>'category'));
end;
$$;

-- The SKU page's "Datos para publicar" (components/inventory/sku-listing-details.tsx). Same write checks as every
-- owner inventory function; replaces the details with what the owner saw and edited; logged as a 'details' change.
create or replace function public.update_inventory_listing_details(p_item_id uuid, p_details jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_store_id uuid := laria_private.inventory_item_store_for_write(p_item_id);
  item public.store_inventory_items;
  clean jsonb := laria_private.sanitize_listing_details(p_details);
  next_category text := case when public.listing_taxonomy_is_valid(p_details->>'category', 'other')
                             then p_details->>'category' end;
begin
  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    perform laria_private.raise_inventory_error('INVENTORY_FIELD_INVALID', 'Los datos del SKU no son válidos.');
  end if;
  item := laria_private.lock_inventory_item(p_item_id);
  if item.store_id <> owner_store_id then
    perform laria_private.raise_inventory_error('INVENTORY_ITEM_NOT_OWNED', 'No puedes administrar este inventario.');
  end if;
  if item.listing_details = clean and item.category is not distinct from coalesce(next_category, item.category) then
    return jsonb_build_object('changed', false, 'listing_details', item.listing_details, 'category', item.category);
  end if;
  update public.store_inventory_items
  set listing_details = clean, category = coalesce(next_category, category)
  where id = item.id;
  perform laria_private.record_inventory_change(item, 'details',
    jsonb_build_object('listing_details', item.listing_details, 'category', item.category),
    jsonb_build_object('listing_details', clean, 'category', coalesce(next_category, item.category)),
    auth.uid(), 'owner', null);
  return jsonb_build_object('changed', true, 'listing_details', clean, 'category', coalesce(next_category, item.category));
end;
$$;

revoke all on function public.update_inventory_listing_details(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.update_inventory_listing_details(uuid, jsonb) to authenticated;
revoke all on function laria_private.remember_sku_listing_details(uuid, jsonb) from public, anon, authenticated;

-- An applied import row leaves its publication columns on the SKU (the file is the latest word, like name and price).
-- Same shape as store_import_rows_record_item_category: the commit holds the SKU's row lock already.
create or replace function laria_private.import_row_remember_listing_details()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.store_inventory_items where id = new.applied_item_id and store_id = new.store_id) then
    perform laria_private.remember_sku_listing_details(new.applied_item_id,
      jsonb_strip_nulls(jsonb_build_object(
        'brand', new.parsed->'brand', 'model', new.parsed->'model', 'instrument_type', new.parsed->'instrument_type',
        'condition', new.parsed->'condition', 'description', new.parsed->'description',
        'attributes', new.parsed->'attributes')));
  end if;
  return null;
end;
$$;

create trigger store_import_rows_remember_listing_details
after update of commit_status on public.store_import_rows
for each row
when (new.commit_status = 'applied' and old.commit_status is distinct from 'applied' and new.applied_item_id is not null)
execute function laria_private.import_row_remember_listing_details();

-- ------------------------------------------------------------------ publication: drafts and SKU details

create function pg_temp.selling_fix(p_function regprocedure, variadic p_edits text[])
returns void
language plpgsql
as $$
declare
  definition text := pg_get_functiondef(p_function);
  edit integer;
begin
  for edit in 1 .. cardinality(p_edits) by 2 loop
    if (length(definition) - length(replace(definition, p_edits[edit], ''))) / length(p_edits[edit]) <> 1 then
      raise exception 'selling_fix(%): expected exactly one occurrence of %', p_function, p_edits[edit];
    end if;
    definition := replace(definition, p_edits[edit], p_edits[edit + 1]);
  end loop;
  execute definition;
end;
$$;

-- A store listing published from a SKU (the form or the import) leaves its details on the SKU.
select pg_temp.selling_fix('laria_private.insert_store_listing(uuid,public.stores,jsonb,jsonb)',
  E'      perform laria_private.link_new_store_listing(p_id, inventory_item_id, p_store.id, p_store.owner_user_id);\n',
  E'      perform laria_private.link_new_store_listing(p_id, inventory_item_id, p_store.id, p_store.owner_user_id);\n'
  || E'      perform laria_private.remember_sku_listing_details(inventory_item_id, p_fields);\n');

-- Publishing a draft removes it (POST 02).
select pg_temp.selling_fix('public.complete_public_submission(uuid,text,jsonb,jsonb)',
  E'    raise exception ''Invalid submission kind'';\n  end if;\n\n  return p_id;',
  E'    raise exception ''Invalid submission kind'';\n  end if;\n\n'
  || E'  delete from public.listing_drafts where id = p_id;\n\n  return p_id;');
drop function pg_temp.selling_fix(regprocedure, text[]);

-- ------------------------------------------------------------------ POST 14

-- The median time from sending to publication of Particular listings approved in the last 60 days, in minutes, or
-- null while there are fewer than 20 of them: the confirmation only shows a usual wait Laria can back up.
create or replace function public.listing_review_wait_minutes()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when count(*) >= 20 then
    ceil(percentile_cont(0.5) within group (order by extract(epoch from (published_at - created_at)) / 60))::integer
  end
  from public.listings
  where store_id is null
    and published_at is not null
    and published_at >= created_at
    and published_at > now() - interval '60 days';
$$;

revoke all on function public.listing_review_wait_minutes() from public, anon;
grant execute on function public.listing_review_wait_minutes() to authenticated;
