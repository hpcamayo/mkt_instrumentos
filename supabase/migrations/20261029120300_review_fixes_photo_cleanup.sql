-- Review fix A13, cleanup part (docs/store-operations/review-fixes.md; Codex review item 4, finding 3).
--
-- When an import closes or its staged rows are purged, its unreferenced photos are discarded; photos a listing uses
-- stay. If that listing later stops using one (the owner replaces its photos), nothing looked at it again, and the
-- file stayed in storage for good. The cleanup claim now first re-checks validated photos of closed or purged imports,
-- each at most once a day, and discards the ones nothing references, with the same lock-then-recheck protocol as
-- discard_import_photo_assets(): either an attachment that holds the photo commits first and the check sees it, or the
-- discard commits first and the attachment is refused.

alter table public.store_import_photo_assets add column reference_checked_at timestamptz;

create index store_import_photo_assets_reference_check_idx
on public.store_import_photo_assets (reference_checked_at nulls first, id)
where status = 'validated';

create or replace function laria_private.discard_detached_import_photos(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare candidates uuid[]; discarded uuid[];
begin
  select coalesce(array_agg(picked.id), '{}') into candidates
  from (
    select a.id
    from public.store_import_photo_assets a
    join public.store_import_sessions s on s.id = a.session_id
    where a.status = 'validated'
      and (s.rows_purged_at is not null or s.status in ('cancelled', 'expired', 'failed'))
      and (a.reference_checked_at is null or a.reference_checked_at < now() - interval '1 day')
    order by a.reference_checked_at nulls first, a.id
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
    for update of a skip locked
  ) picked;

  -- Its own statement after the lock: sees what an attachment that held a photo committed.
  with gone as (
    update public.store_import_photo_assets a
    set status = 'discarded', discarded_at = now()
    where a.id = any(candidates) and a.status = 'validated'
      and not laria_private.import_photo_url_referenced(laria_private.import_photo_url(a))
    returning a.id
  )
  select coalesce(array_agg(id), '{}') into discarded from gone;
  delete from public.store_import_photo_assignments where asset_id = any(discarded);
  update public.store_import_photo_assets set reference_checked_at = now() where id = any(candidates);
  return cardinality(discarded);
end;
$$;

-- STORE-3a's claim with one step added: the periodic sweep (no session given) first discards detached photos.
create or replace function public.claim_store_import_photo_deletions(p_limit integer default 100, p_session_id uuid default null)
returns table(bucket text, path text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if p_session_id is null then
    perform laria_private.discard_detached_import_photos(p_limit);
  end if;
  return query
  with claimed as (
    select a.id from public.store_import_photo_assets a
    where a.status in ('rejected', 'discarded') and a.deleted_at is null
      and (p_session_id is null or a.session_id = p_session_id)
      and (a.delete_claimed_at is null or a.delete_claimed_at < now() - interval '1 hour' or p_session_id is not null)
    order by a.request_order
    limit least(greatest(coalesce(p_limit, 100), 1), 100)
    for update skip locked
  )
  update public.store_import_photo_assets a set delete_claimed_at = now()
  from claimed where a.id = claimed.id
  returning 'store-import-photos'::text, a.object_path;
end;
$$;

revoke all on function laria_private.discard_detached_import_photos(integer) from public, anon, authenticated;
