-- BIG 01 / EASE-028: every device reads the same public card pages. The history,
-- order and local matching never become request parameters or server-side state.
create or replace function public.get_public_card_page(p_after uuid default null)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with candidates as (
    select l.id from public.listings l
    left join public.stores s on s.id = l.store_id
    where (p_after is null or l.id > p_after)
      and l.published_at is not null
      and (public.listing_is_public(l.id) or (l.status = 'sold' and (l.store_id is null or s.status = 'active')))
    order by l.id limit 101
  ), page as (select id from candidates order by id limit 100)
  select jsonb_build_object(
    'cards', public.get_public_listing_cards(coalesce((select array_agg(id order by id) from page), '{}'::uuid[])),
    'next', case when (select count(*) from candidates) > 100 then (select id from page order by id desc limit 1) else null end
  );
$$;
revoke all on function public.get_public_card_page(uuid) from public;
grant execute on function public.get_public_card_page(uuid) to anon, authenticated;
