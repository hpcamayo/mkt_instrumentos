-- Effortless Laria, integration (docs/ux-effortless/integration.md): where two batches built the same thing, one rule.

-- ------------------------------------------------------------------------------ FIND 10 and list-05: price drops

-- A drop shown anywhere is the listing batch's real drop (20261102140000, list-05: at least 5% below a price held for
-- 7 days, shown for 30 days, kept by the trigger in previous_price_pen and price_dropped_at). This computed field gives
-- the "Bajaron de precio" order and the home's row (FIND 10) exactly the drops the cards and the listing page show as
-- "Antes S/". It reads only the row it is given, so it needs no extra rights.
create or replace function public.recent_price_drop_at(p_listing public.listings)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case
    when p_listing.status = 'approved'
      and p_listing.previous_price_pen > p_listing.price_pen
      and p_listing.price_dropped_at > now() - interval '30 days'
    then p_listing.price_dropped_at
  end
$$;

revoke all on function public.recent_price_drop_at(public.listings) from public;
grant execute on function public.recent_price_drop_at(public.listings) to anon, authenticated;
