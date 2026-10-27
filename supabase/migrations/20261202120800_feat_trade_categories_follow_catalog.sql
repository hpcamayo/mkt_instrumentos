-- listing-details, sell-06: the categories a seller takes in trade are the catalog's own, so a new category
-- (discovery's "andean", 20261207120000) is accepted without touching this batch again. A category is the catalog's
-- when public.listing_taxonomy_is_valid accepts it with the type "other", as every category does.
--
-- Shared function rule (docs/feature-ideas/build-plan.md, rule 7): this file patches this batch's own writer
-- (20261202120200 laria_private.write_listing_sale_terms) and its own constraint, nothing else.

create or replace function laria_private.trade_categories_are_valid(p_categories text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(bool_and(public.listing_taxonomy_is_valid(category, 'other')), true)
  from unnest(coalesce(p_categories, '{}'::text[])) as given(category)
$$;

revoke all on function laria_private.trade_categories_are_valid(text[]) from public;
-- The constraint below runs it as whoever writes the row (a seller's own update, the service role's submission), so
-- every API role may execute it. It reads nothing and is not exposed: laria_private is not an API schema.
grant execute on function laria_private.trade_categories_are_valid(text[]) to anon, authenticated, service_role;

alter table public.listings drop constraint if exists listings_trade_categories_check;
alter table public.listings add constraint listings_trade_categories_check check (
  laria_private.trade_categories_are_valid(trade_categories)
  and cardinality(trade_categories) <= 12
  and (accepts_trades or cardinality(trade_categories) = 0));

do $$
declare
  definition text := pg_get_functiondef('laria_private.write_listing_sale_terms(uuid,jsonb)'::regprocedure);
  anchor text := $a$not v_categories <@ array['guitars', 'basses', 'keyboards', 'percussion', 'winds', 'strings', 'pedals', 'amplifiers',
      'microphones', 'audio']::text[] or cardinality(v_categories) > 10$a$;
begin
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'write_listing_sale_terms changed: the trade categories check was not found exactly once';
  end if;
  execute replace(definition, anchor, 'not laria_private.trade_categories_are_valid(v_categories) or cardinality(v_categories) > 12');
end $$;
