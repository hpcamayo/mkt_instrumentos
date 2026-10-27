-- Feature ideas, integration (docs/feature-ideas/build-plan.md, "Wiring to do at integration"): the serials in
-- selling-tools' "Mi equipo" (public.gear_items.serial, compared as serial_key) join the accounts batch's stolen-gear
-- matching (safe-02).
--
--   * Saving an item with a serial, or changing its serial, checks it against the active reports through
--     laria_private.flag_serial_against_stolen_reports with source 'gear', passing the item's owner so a reporter's
--     own gear never matches. Nothing changes on the item and its owner is never told; the match waits for Admin.
--   * A match stays when the item or its serial changes later, like a listing's: it is Admin's record.
--   * The other direction (a new report scanning Mi equipo) is in 20261210120100, which redefines
--     laria_private.match_new_stolen_report alone; Admin's view of a gear match is in 20261210120200.
-- New objects only.

create or replace function laria_private.flag_gear_serial()
returns trigger
language plpgsql
security definer
set search_path = public, laria_private
as $$
begin
  if new.serial_key is null or (tg_op = 'UPDATE' and new.serial_key is not distinct from old.serial_key) then
    return new;
  end if;
  perform laria_private.flag_serial_against_stolen_reports(new.serial, 'gear', new.id, new.user_id);
  return new;
end;
$$;
revoke all on function laria_private.flag_gear_serial() from public, anon, authenticated;

create trigger gear_items_flag_stolen
  after insert or update of serial on public.gear_items
  for each row execute function laria_private.flag_gear_serial();
