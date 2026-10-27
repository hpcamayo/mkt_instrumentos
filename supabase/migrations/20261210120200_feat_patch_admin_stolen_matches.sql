-- Feature ideas, integration: Admin's match queue says what a "Mi equipo" item is (its title, and the listing it became
-- if its owner put it on sale), so a gear match can be judged like a listing's. The owner stays unnamed.
-- Redefines public.admin_stolen_matches from 20261201120400_feat_stolen_gear.sql (accounts batch), alone in this
-- migration as the build plan asks; the body is that one plus the gear_item field and its join.

create or replace function public.admin_stolen_matches(p_status text default 'pending', p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, laria_private
as $$
begin
  perform laria_private.assert_admin();
  if p_status not in ('pending', 'confirmed', 'dismissed') then raise exception 'STOLEN_STATUS_INVALID'; end if;
  return jsonb_build_object(
    'counts', (select coalesce(jsonb_object_agg(status, total), '{}'::jsonb) from (
      select status, count(*) as total from public.stolen_report_matches group by status) counted),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'source', m.source, 'ref_id', m.ref_id, 'detail', m.detail, 'status', m.status,
        'admin_note', m.admin_note, 'reviewed_at', m.reviewed_at, 'reporter_notified_at', m.reporter_notified_at,
        'created_at', m.created_at,
        'report', jsonb_build_object('id', r.id, 'code', r.code, 'brand', r.brand, 'model', r.model,
          'description', r.description, 'serial', r.serial_raw, 'stolen_on', r.stolen_on, 'place', r.place,
          'police_report', r.police_report, 'police_station', r.police_station, 'status', r.status,
          'reporter', coalesce(rp.full_name, 'Sin nombre'), 'reporter_email', ru.email,
          'photos', (select coalesce(jsonb_agg(p.storage_path order by p.sort_order), '[]'::jsonb)
                     from public.stolen_gear_report_photos p where p.report_id = r.id)),
        'listing', case when l.id is null then null else jsonb_build_object('id', l.id, 'title', l.title, 'slug', l.slug,
          'status', l.status, 'seller', coalesce(s.name, lp.full_name, l.contact_name),
          'photo', (select image_url from public.listing_photos where listing_id = l.id order by sort_order limit 1)) end,
        'inventory_item', case when i.id is null then null else jsonb_build_object('id', i.id, 'sku', i.merchant_sku,
          'name', i.product_name, 'store', si.name) end,
        -- Integration: a Mi equipo item shows what it is, never who owns it, and the listing it became through
        -- "Vender esto" while that listing is live, pending or hidden; null once its owner removed the item.
        'gear_item', case when g.id is null then null else jsonb_build_object('title', g.title,
          'sale_listing_id', (select gl.id from public.listings gl where gl.id = g.sale_listing_id
            and gl.owner_user_id = g.user_id and gl.status in ('pending', 'approved', 'hidden'))) end
      ) order by m.created_at desc), '[]'::jsonb)
      from (select * from public.stolen_report_matches where status = p_status
            order by created_at desc limit greatest(1, least(coalesce(p_limit, 50), 200))) m
      join public.stolen_gear_reports r on r.id = m.report_id
      left join public.profiles rp on rp.id = r.reporter_id
      left join auth.users ru on ru.id = r.reporter_id
      left join public.listings l on l.id = m.listing_id
      left join public.stores s on s.id = l.store_id
      left join public.profiles lp on lp.id = l.owner_user_id
      left join public.store_inventory_items i on i.id = m.inventory_item_id
      left join public.stores si on si.id = i.store_id
      left join public.gear_items g on m.source = 'gear' and g.id = m.ref_id));
end;
$$;
revoke all on function public.admin_stolen_matches(text, integer) from public, anon;
grant execute on function public.admin_stolen_matches(text, integer) to authenticated;
