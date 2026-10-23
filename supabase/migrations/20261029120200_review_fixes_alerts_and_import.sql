-- Review fixes A7, A8, A11 and the duplicate-SKU note (docs/store-operations/review-fixes.md; Codex review items 2 and 3,
-- Henri's walkthrough note n-dup).
--
-- A7. Price-drop and search-alert e-mails queued while a listing had stock were still sent after it ran out (design
--     §5.2). The claim now cancels them, drops such listings from pending daily digests, and cancels a digest left with
--     no listing instead of sending it empty. A restock does not bring them back (the first-public marker is unchanged).
-- A8. An import row that gives a never-stocked listing its first stock and a new price matched saved searches when the
--     stock landed, with the old price. Matching now waits until the row's stock and price are both applied.
-- A11. Changing the column mapping after some rows were applied reset them to pending (and broke the applied-row
--     check). Once any row is applied the mapping is final.
-- n-dup. A row that already had an error was left out of duplicate detection, so its twin went ahead alone. Every row
--     that shares a SKU or listing is flagged, whatever else is wrong with it.
--
-- commit_import_row is long, so it is rewritten from its current definition with exact old → new replacements (each
-- must match exactly once), as in 20261029120100_review_fixes_lock_order.sql.

create function pg_temp.review_fix(p_function regprocedure, variadic p_edits text[])
returns void
language plpgsql
as $$
declare
  definition text := pg_get_functiondef(p_function);
  edit integer;
begin
  if cardinality(p_edits) % 2 <> 0 then
    raise exception 'review_fix(%): edits come in old/new pairs', p_function;
  end if;
  for edit in 1 .. cardinality(p_edits) by 2 loop
    if (length(definition) - length(replace(definition, p_edits[edit], ''))) / length(p_edits[edit]) <> 1 then
      raise exception 'review_fix(%): expected exactly one occurrence of %', p_function, p_edits[edit];
    end if;
    definition := replace(definition, p_edits[edit], p_edits[edit + 1]);
  end loop;
  execute definition;
end;
$$;

-- ------------------------------------------------------------------ A7: no alert e-mails for a listing out of stock

alter table laria_private.search_alert_matches drop constraint search_alert_matches_suppression_reason_check;
alter table laria_private.search_alert_matches add constraint search_alert_matches_suppression_reason_check
  check (suppression_reason in ('alert_paused', 'alert_deleted', 'listing_out_of_stock'));

-- The claim below looks up a digest's matches by delivery on every run (as the e-mail payload already did per digest).
create index search_alert_matches_delivery_idx on laria_private.search_alert_matches (delivery_id) where delivery_id is not null;

-- Sprint 7's claim with one step added before it picks deliveries: queued listing e-mails whose listing is out of stock
-- now are cancelled, and so are digests whose every listing is.
create or replace function public.claim_marketplace_email_deliveries(p_worker_id uuid, p_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private, auth
as $$
declare result jsonb;
begin
  if auth.role() is distinct from 'service_role' or p_worker_id is null or p_limit not between 1 and 100 then
    raise exception using errcode = '42501', message = 'EMAIL_SERVICE_REQUIRED';
  end if;
  update laria_private.marketplace_email_deliveries
  set status = case when attempt_count >= 5 then 'failed' else 'retry' end,
      next_attempt_at = clock_timestamp(), locked_at = null, locked_by = null,
      failure_category = coalesce(failure_category, 'transport'),
      failure_code = coalesce(failure_code, 'stale_worker_lock')
  where status = 'processing' and locked_at < clock_timestamp() - interval '15 minutes';

  -- Review fix A7 (design §5.2): nothing about a listing that ran out of stock after its e-mail was queued.
  update laria_private.search_alert_matches match
  set delivery_id = null, suppressed_at = clock_timestamp(), suppression_reason = 'listing_out_of_stock'
  from laria_private.marketplace_email_deliveries delivery, public.listings listing
  where match.delivery_id = delivery.id and delivery.status in ('pending', 'retry')
    and delivery.event_type = 'search_alert_daily'
    and listing.id = match.listing_id and listing.stock_state = 'out_of_stock';
  update laria_private.marketplace_email_deliveries delivery
  set status = 'cancelled', failure_code = 'listing_out_of_stock'
  where delivery.status in ('pending', 'retry')
    and ((delivery.event_type in ('listing_price_drop', 'search_alert_immediate')
          and exists (select 1 from public.listings listing
                      where listing.id = delivery.listing_id and listing.stock_state = 'out_of_stock'))
      or (delivery.event_type = 'search_alert_daily'
          and not exists (select 1 from laria_private.search_alert_matches match where match.delivery_id = delivery.id)));

  with candidates as (
    select delivery.id
    from laria_private.marketplace_email_deliveries delivery
    left join public.saved_search_alerts alert on alert.id = delivery.search_alert_id
    where delivery.status in ('pending','retry')
      and delivery.next_attempt_at <= clock_timestamp()
      and delivery.attempt_count < 5
      and (delivery.search_alert_id is null or alert.status = 'active')
    order by delivery.created_at, delivery.id
    for update of delivery skip locked
    limit p_limit
  ), updated as (
    update laria_private.marketplace_email_deliveries delivery
    set status = 'processing', attempt_count = attempt_count + 1,
        last_attempt_at = clock_timestamp(), locked_at = clock_timestamp(), locked_by = p_worker_id,
        recipient_email = auth_user.email, failure_category = null, failure_code = null
    from candidates, auth.users auth_user
    where delivery.id = candidates.id and auth_user.id = delivery.recipient_user_id
    returning delivery.*
  )
  select coalesce(jsonb_agg(laria_private.marketplace_email_payload(updated) order by updated.created_at, updated.id), '[]'::jsonb)
  into result from updated;
  return result;
end;
$$;

-- ------------------------------------------------------------------ A8: first-public matching after the import's price

-- STORE-1a's capture with one change: while laria.defer_alert_capture is 'on' (set by commit_import_row for the row it
-- is applying), a first publication is noted instead of matched, and the row matches it once its price is applied too.
create or replace function laria_private.capture_listing_alert_publication()
returns trigger
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare public_at timestamptz := clock_timestamp(); inserted_id uuid;
begin
  if new.status <> 'approved'
    or new.stock_state is not distinct from 'out_of_stock'
    or not public.listing_is_public(new.id) then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.status = 'approved'
    and old.store_id is not distinct from new.store_id
    and old.stock_state is distinct from 'out_of_stock' then
    return new;
  end if;
  if coalesce(current_setting('laria.defer_alert_capture', true), '') = 'on' then
    perform set_config('laria.alert_capture_deferred', new.id::text, true);
    return new;
  end if;
  insert into laria_private.listing_alert_publications(listing_id, first_public_at)
  values(new.id, public_at)
  on conflict do nothing
  returning listing_id into inserted_id;
  if inserted_id is not null then perform laria_private.capture_saved_search_matches(new.id, public_at); end if;
  return new;
end;
$$;

-- The deferred half: the listing's state now (status, stock, public, price) decides, and the marker still makes it once.
create or replace function laria_private.capture_deferred_listing_publication(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare listing public.listings; public_at timestamptz := clock_timestamp(); inserted_id uuid;
begin
  select * into listing from public.listings where id = p_listing_id;
  if listing.id is null or listing.status <> 'approved' or listing.stock_state is not distinct from 'out_of_stock'
    or not public.listing_is_public(listing.id) then
    return;
  end if;
  insert into laria_private.listing_alert_publications(listing_id, first_public_at)
  values(listing.id, public_at)
  on conflict do nothing
  returning listing_id into inserted_id;
  if inserted_id is not null then perform laria_private.capture_saved_search_matches(listing.id, public_at); end if;
end;
$$;

select pg_temp.review_fix('laria_private.commit_import_row(public.store_import_sessions,public.store_import_rows,uuid)',
  E'  if plan.target_listing_id is not null then\n    select * into listing from public.listings where id = plan.target_listing_id;\n  end if;\n',
  E'  if plan.target_listing_id is not null then\n    select * into listing from public.listings where id = plan.target_listing_id;\n  end if;\n'
  || E'  -- Review fix A8: a listing this row makes public for the first time is matched against saved searches after its\n'
  || E'  -- stock and its price are both applied (below), not when the stock lands with the old price.\n'
  || E'  perform set_config(''laria.defer_alert_capture'', ''on'', true);\n'
  || E'  perform set_config(''laria.alert_capture_deferred'', '''', true);\n',
  E'  commit_status := ''applied'';\n',
  E'  perform set_config(''laria.defer_alert_capture'', '''', true);\n'
  || E'  if coalesce(current_setting(''laria.alert_capture_deferred'', true), '''') <> '''' then\n'
  || E'    perform laria_private.capture_deferred_listing_publication(current_setting(''laria.alert_capture_deferred'')::uuid);\n'
  || E'    perform set_config(''laria.alert_capture_deferred'', '''', true);\n'
  || E'  end if;\n'
  || E'  commit_status := ''applied'';\n');

-- ------------------------------------------------------------------ A11: the mapping is final once rows are applied

select pg_temp.review_fix('public.confirm_store_import_mapping(uuid,jsonb,integer,boolean)',
  E'  header_count := jsonb_array_length(session.headers);\n',
  E'  -- Review fix A11: replanning would turn applied rows back into pending ones; their inventory changes are done.\n'
  || E'  if exists (select 1 from public.store_import_rows where session_id = session.id and commit_status = ''applied'') then\n'
  || E'    perform laria_private.raise_import_error(''IMPORT_MAPPING_LOCKED'',\n'
  || E'      ''Algunas filas ya se aplicaron al inventario, así que las columnas ya no se pueden cambiar. Para otro orden de columnas, empieza una importación nueva.'');\n'
  || E'  end if;\n'
  || E'  header_count := jsonb_array_length(session.headers);\n');

-- ------------------------------------------------------------------ n-dup: rows with other errors count as duplicates

-- STORE-2's detection with two changes: rows already in error take part (an error row keeps its normalized SKU), and a
-- row that already carries the duplicate issue is not marked again, so the count is only of new duplicates
-- (start_store_import_commit treats any as a conflict).
create or replace function laria_private.mark_import_duplicates(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare marked integer;
begin
  with keyed as (
    select row_number, 'sku:' || sku_normalized as key
    from public.store_import_rows
    where session_id = p_session_id and planned_action is not null and sku_normalized is not null
    union all
    select row_number, 'listing:' || (parsed->>'listing_id')
    from public.store_import_rows
    where session_id = p_session_id and planned_action is not null and parsed->>'listing_id' is not null
    union all
    select row_number, 'item:' || target_item_id::text
    from public.store_import_rows
    where session_id = p_session_id and planned_action <> 'error' and target_item_id is not null
  ), groups as (
    select key, array_agg(distinct row_number order by row_number) as rows_in_group
    from keyed group by key having count(distinct row_number) > 1
  ), affected as (
    select row_number, min(groups.rows_in_group::text) as rows_text
    from groups, unnest(groups.rows_in_group) as row_number
    group by row_number
  )
  update public.store_import_rows r
  set planned_action = 'error', changes = '{}'::jsonb, target_item_id = null, target_item_version = null,
      issues = r.issues || jsonb_build_object('code', 'IMPORT_DUPLICATE_SKU', 'field', 'sku', 'severity', 'error',
        'message', 'El mismo SKU o publicación aparece en las filas '
          || replace(trim(both '{}' from affected.rows_text), ',', ', ') || '. Deja una sola fila.')
  from affected
  where r.session_id = p_session_id and r.row_number = affected.row_number and r.commit_status <> 'applied'
    and not r.issues @> '[{"code":"IMPORT_DUPLICATE_SKU"}]'::jsonb;
  get diagnostics marked = row_count;
  return marked;
end;
$$;

drop function pg_temp.review_fix(regprocedure, text[]);

revoke all on function laria_private.capture_deferred_listing_publication(uuid) from public, anon, authenticated;
