-- Selling tools batch of the feature ideas (docs/feature-ideas/selling-tools.md): the notification and e-mail types
-- that Mi equipo, offers from stores, consignment, price steps, private offers and gear reminders use. Additive only:
-- every list is extended, never rewritten, so other batches' types survive in any order.

-- A check constraint gains one more "or (...)" branch, once. p_marker is a piece of text only that branch contains.
create or replace function laria_private.feat_add_check_branch(p_table regclass, p_constraint text, p_marker text, p_branch text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  current_def text;
  inner_expr text;
begin
  select pg_catalog.pg_get_constraintdef(c.oid) into current_def
  from pg_catalog.pg_constraint c
  where c.conrelid = p_table and c.conname = p_constraint and c.contype = 'c';
  if current_def is null then
    raise exception 'Constraint % on % not found', p_constraint, p_table;
  end if;
  if position(p_marker in current_def) > 0 then
    return;
  end if;
  inner_expr := substring(current_def from '^CHECK \((.*)\)$');
  if inner_expr is null then
    raise exception 'Constraint % on % is not a plain check: %', p_constraint, p_table, current_def;
  end if;
  execute format('alter table %s drop constraint %I', p_table, p_constraint);
  execute format('alter table %s add constraint %I check ((%s) or (%s))', p_table, p_constraint, inner_expr, p_branch);
end;
$$;

revoke all on function laria_private.feat_add_check_branch(regclass, text, text, text) from public, anon, authenticated;

-- Notices about a person's own gear (Mi equipo, offers for it, reminders) point at no listing or store.
select laria_private.feat_add_check_branch(
  'public.notifications', 'notifications_target_check', 'gear\_%', 'event_type ~~ ''gear\_%''::text'
);

select laria_private.ux_extend_text_check('public.notifications', 'notifications_event_type_check', 'event_type', array[
  'listing_price_step',
  'listing_private_offer',
  'listing_consignment_update',
  'store_trade_request',
  'store_trade_update',
  'gear_trade_offer',
  'gear_trade_update',
  'gear_reminder_due'
]);

select laria_private.ux_extend_text_check('laria_private.marketplace_email_deliveries', 'marketplace_email_deliveries_event_type_check', 'event_type', array[
  'listing_private_offer',
  'listing_consignment_update',
  'store_trade_request',
  'store_trade_update',
  'gear_trade_offer',
  'gear_reminder_due'
]);

-- The e-mails above carry what they show in one context key, "selling" (an object built by the function that queues
-- them). Rebuilt the way the accounts migration did it: keep every key already allowed, add this one.
do $$
declare values_now text[];
begin
  values_now := laria_private.check_constraint_values('laria_private.marketplace_email_deliveries', 'marketplace_email_context_check', '(context - ');
  if values_now is null or not ('reason' = any(values_now)) then
    raise exception 'marketplace_email_context_check not readable';
  end if;
  if 'selling' = any(values_now) then
    return;
  end if;
  alter table laria_private.marketplace_email_deliveries drop constraint marketplace_email_context_check;
  execute format('alter table laria_private.marketplace_email_deliveries add constraint marketplace_email_context_check check (jsonb_typeof(context) = %L and octet_length(context::text) <= 8192 and (context - %L::text[]) = %L::jsonb)',
    'object', array(select distinct unnest(values_now || array['selling']) order by 1), '{}');
end $$;

-- Who a selling-tools notice or e-mail goes to is decided by the function that writes it; this one only writes.
create or replace function laria_private.selling_notify(
  p_user_id uuid,
  p_event_type text,
  p_message text,
  p_listing_id uuid default null,
  p_store_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare notification_id uuid;
begin
  if p_user_id is null then return null; end if;
  insert into public.notifications(user_id, event_type, message, listing_id, store_id)
  values (p_user_id, p_event_type, left(p_message, 500), p_listing_id, p_store_id)
  returning id into notification_id;
  return notification_id;
end;
$$;

revoke all on function laria_private.selling_notify(uuid, text, text, uuid, uuid) from public, anon, authenticated;

-- The store the signed-in person runs (one per owner, as get_own_store reads it).
create or replace function laria_private.selling_own_store_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id from public.stores s where auth.uid() is not null and s.owner_user_id = auth.uid() order by s.created_at limit 1;
$$;

revoke all on function laria_private.selling_own_store_id() from public, anon, authenticated;
