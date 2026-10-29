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
    'cards', coalesce((
      select jsonb_agg(card || jsonb_build_object(
        'model', l.model, 'attributes', l.attributes, 'published_at', l.published_at,
        'view_count', l.view_count, 'region', l.region, 'seller_type', l.seller_type,
        'created_at', l.created_at, 'store_id', l.store_id,
        'previous_price_pen', l.previous_price_pen, 'price_dropped_at', l.price_dropped_at,
        'stores', case when s.id is null then null else jsonb_build_object(
          'name', s.name, 'slug', s.slug, 'status', s.status, 'is_verified', s.is_verified, 'district', s.district) end,
        'photo_count', (select count(*) from public.listing_photos where listing_id = l.id),
        'listing_photos', coalesce((select jsonb_agg(photo) from (
          select id, image_url, alt_text, sort_order from public.listing_photos where listing_id = l.id order by sort_order limit 1
        ) photo), '[]'::jsonb)
      ) order by l.id)
      from jsonb_array_elements(public.get_public_listing_cards(coalesce((select array_agg(id order by id) from page), '{}'::uuid[]))) card
      join public.listings l on l.id = (card->>'id')::uuid
      left join public.stores s on s.id = l.store_id
    ), '[]'::jsonb),
    'next', case when (select count(*) from candidates) > 100 then (select id from page order by id desc limit 1) else null end
  );
$$;
revoke all on function public.get_public_card_page(uuid) from public;
grant execute on function public.get_public_card_page(uuid) to anon, authenticated;
