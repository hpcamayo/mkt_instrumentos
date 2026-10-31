-- Feature ideas, integration: a new (or reopened) stolen-gear report also looks for its serial among the "Mi equipo"
-- items of selling-tools (public.gear_items.serial_key), besides listings and store SKUs.
-- Redefines laria_private.match_new_stolen_report from 20261201120400_feat_stolen_gear.sql (accounts batch), alone in
-- this migration as the build plan asks; the body is that one plus the gear scan at the end. The trigger
-- stolen_gear_reports_match keeps calling it.

create or replace function laria_private.match_new_stolen_report()
returns trigger
language plpgsql
security definer
set search_path = public, laria_private
as $$
begin
  if new.status <> 'active' or new.serial_norm is null then return new; end if;
  insert into public.stolen_report_matches (report_id, source, ref_id, listing_id, detail)
  select new.id, 'listing', ls.listing_id, ls.listing_id, jsonb_build_object('serial', ls.serial_norm)
  from public.listing_serials ls
  join public.listings l on l.id = ls.listing_id
  left join public.stores s on s.id = l.store_id
  where ls.serial_norm = new.serial_norm and coalesce(l.owner_user_id, s.owner_user_id) is distinct from new.reporter_id
  on conflict (report_id, source, ref_id) do nothing;
  insert into public.stolen_report_matches (report_id, source, ref_id, listing_id, inventory_item_id, detail)
  select new.id, 'inventory', i.id, i.listing_id, i.id, jsonb_build_object('serial', iss.serial_norm)
  from public.inventory_item_serials iss
  join public.store_inventory_items i on i.id = iss.item_id
  join public.stores s on s.id = i.store_id
  where iss.serial_norm = new.serial_norm and s.owner_user_id is distinct from new.reporter_id
  on conflict (report_id, source, ref_id) do nothing;
  -- Integration: the serials in Mi equipo (selling-tools), never the reporter's own.
  insert into public.stolen_report_matches (report_id, source, ref_id, detail)
  select new.id, 'gear', g.id, jsonb_build_object('serial', g.serial_key)
  from public.gear_items g
  where g.serial_key = new.serial_norm and g.user_id is distinct from new.reporter_id
  on conflict (report_id, source, ref_id) do nothing;
  return new;
end;
$$;
revoke all on function laria_private.match_new_stolen_report() from public, anon, authenticated;
