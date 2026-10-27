-- Launch audit A19, follow-up to 20261113130000_launch_audit_page_refresh.sql: Supabase loads pg_safeupdate for API
-- connections, which refuses an UPDATE or DELETE without a WHERE clause, the statements of the functions an API call
-- runs included. The claim of the page refresh job put its claim on every waiting row with an update that had none, so
-- since the deploy of 27 Oct 2026 every run of the job failed ("UPDATE requires a WHERE clause") and rolled back, and
-- the cached pages relied on their own refresh (a minute for the home and listing pages). This is the same function
-- with `where true` added to that update; the scan in tests/api-safeupdate.integration.cjs found no other function
-- with such a statement.
-- Compatibility: the job of the deployed app calls the same function with the same arguments and works from the next
-- run; the rows recorded meanwhile are claimed then, and their pages cleared.
-- Locks: replacing a function locks no table.
-- Rollback: none needed; the earlier version never works through the API.

create or replace function public.claim_public_page_changes(p_deployment text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claim uuid := gen_random_uuid();
  claimed timestamptz;
  looked timestamptz;
  looking timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if length(p_deployment) between 1 and 200 then
    insert into laria_private.public_page_deployment as d (id, deployment)
    values (true, p_deployment)
    on conflict (id) do update set deployment = excluded.deployment, seen_at = now()
    where d.deployment <> excluded.deployment;
    if found then
      insert into laria_private.public_page_changes default values;
    end if;
  end if;
  -- Locked, so runs at the same time look at the span between them once.
  select checked_at into looked from laria_private.public_page_clock where id for update;
  if not found then
    insert into laria_private.public_page_clock (id, checked_at) values (true, looking) on conflict (id) do nothing;
  elsif looked < looking then
    if exists (
      select 1 from public.verified_transactions t
      where t.review_deadline > looked and t.review_deadline <= looking
        and exists (select 1 from public.transaction_reviews r where r.transaction_id = t.id)
    ) or exists (
      -- The listing page counts a listing paused while paused_until is after today in Lima.
      select 1 from public.listings l
      where l.paused_until between (looked at time zone 'America/Lima')::date and (looking at time zone 'America/Lima')::date
        and (l.paused_until::timestamp at time zone 'America/Lima') > looked
        and (l.paused_until::timestamp at time zone 'America/Lima') <= looking
        and laria_private.listing_row_is_shown(l.status, l.seller_type, l.store_id)
    ) then
      insert into laria_private.public_page_changes default values;
    end if;
    update laria_private.public_page_clock set checked_at = looking where id;
  end if;
  -- Every waiting row, including those of a run that never reported back. Supabase refuses an update without a
  -- where clause on API calls (pg_safeupdate), so it says so.
  update laria_private.public_page_changes set claim_id = claim where true;
  if not found then
    return null;
  end if;
  -- Read after the update's snapshot, so every row it took was committed before this time.
  claimed := clock_timestamp();
  update laria_private.public_page_changes
  set claimed_at = claimed, first_claimed_at = coalesce(first_claimed_at, claimed)
  where claim_id = claim;
  -- Rows armed with the same nonce in the same deployment, or not armed yet and first claimed by the same run, wait
  -- for the same thing, so one stands for all.
  delete from laria_private.public_page_changes c
  using (
    select id, row_number() over (
      partition by armed_deployment, armed_nonce, case when armed_nonce is null then first_claimed_at end
      order by id desc
    ) as rank
    from laria_private.public_page_changes
    where claim_id = claim
  ) r
  where c.id = r.id and r.rank > 1;
  return claim;
end;
$$;
