-- Feature ideas, accounts batch, safe-09: STAND-IN for the launch audit's A20 account anonymising.
--
-- A20 owns laria_private.anonymize_account(p_user_id uuid, p_reason text default null) returns jsonb (service role
-- only; public.admin_anonymize_account wraps it for Admin). Self-service deletion (safe-09) calls that exact
-- signature. Until A20 is merged, this file creates a stand-in with the same signature, and only if the function
-- does not exist yet, so it never replaces A20's routine. The integrator removes this file once A20 is in.
--
-- What the stand-in does, in one transaction:
--   * the profile keeps its id (verified transactions, reviews and reports point at it) but loses its name and phone;
--   * listings that are not sold are archived (sold listings are immutable history);
--   * favorites, shared lists, follows, alerts, drafts, e-mail preferences, notifications, push devices, check-ins
--     and unanswered public questions are deleted; answered questions stay under "Cuenta eliminada";
--   * analytics events lose the link to the account;
--   * the caller then soft-deletes the Supabase Auth user, which clears the e-mail and closes every session.

do $standin$
begin
  if to_regprocedure('laria_private.anonymize_account(uuid,text)') is not null then
    return;
  end if;
  execute $fn$
    create function laria_private.anonymize_account(p_user_id uuid, p_reason text default null)
    returns jsonb
    language plpgsql
    security definer
    set search_path = public, laria_private
    as $body$
    declare
      archived integer := 0;
      removed integer := 0;
      step integer;
    begin
      if auth.role() is distinct from 'service_role' then
        raise exception using errcode = '42501', message = 'ANONYMIZE_SERVICE_REQUIRED';
      end if;
      if not exists (select 1 from public.profiles where id = p_user_id) then
        raise exception 'ANONYMIZE_ACCOUNT_NOT_FOUND';
      end if;
      perform 1 from public.profiles where id = p_user_id for update;

      perform set_config('app.allow_listing_admin_fields', 'true', true);
      update public.listings set status = 'archived', archived_at = coalesce(archived_at, clock_timestamp())
      where owner_user_id = p_user_id and status in ('pending', 'approved', 'hidden', 'rejected', 'draft');
      get diagnostics archived = row_count;
      perform set_config('app.allow_listing_admin_fields', 'false', true);

      delete from public.favorites where user_id = p_user_id; get diagnostics step = row_count; removed := removed + step;
      delete from public.favorite_shares where user_id = p_user_id; get diagnostics step = row_count; removed := removed + step;
      delete from public.follows where user_id = p_user_id; get diagnostics step = row_count; removed := removed + step;
      delete from public.saved_search_alerts where user_id = p_user_id; get diagnostics step = row_count; removed := removed + step;
      delete from public.listing_drafts where owner_user_id = p_user_id; get diagnostics step = row_count; removed := removed + step;
      delete from public.email_preferences where user_id = p_user_id;
      delete from public.notifications where user_id = p_user_id;
      delete from laria_private.push_subscriptions where user_id = p_user_id;
      delete from public.purchase_checkins where buyer_user_id = p_user_id;
      delete from public.listing_questions where asker_user_id = p_user_id and answer is null;
      update public.marketplace_events set actor_user_id = null where actor_user_id = p_user_id;
      update public.marketplace_events set seller_user_id = null where seller_user_id = p_user_id;

      update public.profiles set full_name = 'Cuenta eliminada', phone = null, city = null
      where id = p_user_id;

      return jsonb_build_object('user_id', p_user_id, 'reason', p_reason, 'listings_archived', archived,
        'rows_removed', removed, 'standin', true);
    end;
    $body$
  $fn$;
  execute 'revoke all on function laria_private.anonymize_account(uuid, text) from public, anon, authenticated';
  execute 'grant execute on function laria_private.anonymize_account(uuid, text) to service_role';
end
$standin$;
