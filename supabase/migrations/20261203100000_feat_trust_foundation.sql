-- Deal-trust batch, foundation (docs/feature-ideas/deal-trust.md). Two helpers the later migrations of this batch use
-- to extend shared objects in place instead of copying them, and the notification types the batch sends.
--
-- extend_or_check adds one OR branch to a check constraint, once. patch_function_text swaps exact pieces of an
-- existing function's body and fails unless each piece occurs exactly once, so a later change to that function by
-- another migration stops the patch loudly instead of being overwritten silently (FD-deal-trust-1).

create or replace function laria_private.extend_or_check(p_table regclass, p_constraint text, p_branch text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  current_def text;
  branch_def text;
begin
  select pg_get_expr(conbin, conrelid) into current_def
  from pg_constraint
  where conrelid = p_table and conname = p_constraint and contype = 'c';
  if current_def is null then
    raise exception 'Constraint % on % not found', p_constraint, p_table;
  end if;

  -- Postgres prints the branch the way it will print it inside the constraint, so the "already there" test compares
  -- like with like. The scratch constraint is never validated and is dropped right away.
  execute format('alter table %s add constraint extend_or_check_scratch check (%s) not valid', p_table, p_branch);
  select pg_get_expr(conbin, conrelid) into branch_def
  from pg_constraint
  where conrelid = p_table and conname = 'extend_or_check_scratch';
  execute format('alter table %s drop constraint extend_or_check_scratch', p_table);

  if position(branch_def in current_def) > 0 then
    return;
  end if;
  execute format('alter table %s drop constraint %I', p_table, p_constraint);
  execute format('alter table %s add constraint %I check (%s or %s)', p_table, p_constraint, current_def, branch_def);
end;
$$;

revoke all on function laria_private.extend_or_check(regclass, text, text) from public, anon, authenticated;

create or replace function laria_private.patch_function_text(p_function regprocedure, p_old text[], p_new text[])
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  definition text := pg_get_functiondef(p_function);
  hits integer;
  piece integer;
begin
  if coalesce(array_length(p_old, 1), 0) = 0 or array_length(p_old, 1) is distinct from array_length(p_new, 1) then
    raise exception 'patch_function_text needs pairs of texts for %', p_function;
  end if;
  for piece in 1 .. array_length(p_old, 1) loop
    -- Applied before (the migration ran twice): leave it.
    if position(p_new[piece] in definition) > 0 then
      continue;
    end if;
    hits := (length(definition) - length(replace(definition, p_old[piece], ''))) / length(p_old[piece]);
    if hits <> 1 then
      raise exception 'Patch % of % matched % times; the function changed since this patch was written', piece, p_function, hits;
    end if;
    definition := replace(definition, p_old[piece], p_new[piece]);
  end loop;
  -- pg_get_functiondef returns a complete "create or replace function", which keeps the owner and the grants.
  execute definition;
end;
$$;

revoke all on function laria_private.patch_function_text(regprocedure, text[], text[]) from public, anon, authenticated;

-- Notification types (in-app and push only; none of them is in the e-mail list).
--   store_counter_*: the counter sale QR (reach-11). The store and the customer both get them; transaction_id opens the
--     transaction, so the "store_" prefix (which needs store_id) fits both.
--   store_level_* / seller_level_*: the «Vendedor destacado» mark was earned or lapsed (sell-08).
--   store_safe_spot_disabled: Admin turned a store's «Punto seguro» off (safe-03).
select laria_private.ux_extend_text_check('public.notifications', 'notifications_event_type_check', 'event_type', array[
  'store_counter_purchase_confirmed',
  'store_counter_review_revealed',
  'store_counter_review_reminder',
  'store_level_earned',
  'store_level_lapsed',
  'store_safe_spot_disabled',
  'seller_level_earned',
  'seller_level_lapsed'
]);

-- A Particular's mark belongs to the account, not to a listing or a store.
select laria_private.extend_or_check('public.notifications', 'notifications_target_check',
  $$event_type = any (array['seller_level_earned', 'seller_level_lapsed']) and listing_id is null and store_id is null$$);

-- One notification per key, without e-mail (ux_notify_once also queues an e-mail, which these types have no template
-- for). Reuses the reminder ledger so a key never fires twice.
create or replace function laria_private.trust_notify_once(
  p_key text,
  p_user_id uuid,
  p_event_type text,
  p_message text,
  p_store_id uuid default null,
  p_transaction_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public, laria_private
as $$
begin
  if p_user_id is null then return false; end if;
  insert into laria_private.ux_reminders_sent(reminder_key) values ('trust:' || p_key) on conflict do nothing;
  if not found then return false; end if;
  insert into public.notifications(user_id, event_type, message, store_id, transaction_id)
  values (p_user_id, p_event_type, p_message, p_store_id, p_transaction_id);
  return true;
end;
$$;

revoke all on function laria_private.trust_notify_once(text, uuid, text, text, uuid, uuid) from public, anon, authenticated;

-- First name only, for every public trust surface of this batch (seller page, buyer card, counter sale screens).
create or replace function laria_private.trust_first_name(p_full_name text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(split_part(btrim(coalesce(p_full_name, '')), ' ', 1), ''), 'Usuario de Laria')
$$;
