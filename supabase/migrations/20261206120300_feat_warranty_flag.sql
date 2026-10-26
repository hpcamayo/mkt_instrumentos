-- Feature ideas, store-floor batch (docs/feature-ideas/store-floor.md): reach-09 "Con garantía", the filter.
--
-- A listing whose store gives a warranty (warranty_months above 0, from the store's policy or the listing's own terms)
-- carries the listing flag 'con_garantia', so buyers can add "Con garantía" to any search and saved alert. It uses
-- the listing flag registry of the listing-details batch (20261202120100): one row in
-- laria_private.listing_flag_filters and one listings_flags_<batch> trigger. No shared function is redefined.
--
-- Trigger order (Postgres fires BEFORE triggers by name): listings_a_store_terms fills the terms, then
-- listings_flags_a_reset empties listing_flags, then listings_flags_store_floor appends this flag. No backfill: no
-- listing carries a warranty before this batch.

insert into laria_private.listing_flag_filters (flag, label, sort_order)
values ('con_garantia', 'Con garantía', 40)
on conflict (flag) do update set label = excluded.label, sort_order = excluded.sort_order;

create or replace function laria_private.listing_flags_store_floor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.warranty_months, 0) > 0 then
    new.listing_flags := array_append(new.listing_flags, 'con_garantia');
  end if;
  return new;
end;
$$;

revoke all on function laria_private.listing_flags_store_floor() from public, anon, authenticated;

drop trigger if exists listings_flags_store_floor on public.listings;
create trigger listings_flags_store_floor
before insert or update on public.listings
for each row execute function laria_private.listing_flags_store_floor();
