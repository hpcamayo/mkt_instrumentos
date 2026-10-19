-- Effortless Laria, batch "listing" (docs/ux-effortless/listing.md): the shared type registries this batch adds to.
--
-- Several batches add notification and e-mail types in parallel. A plain `drop constraint … add constraint … in (…)`
-- written against today's list would silently drop another batch's new values, depending on migration order. So the
-- allowed values are extended in place: laria_private.ux_extend_text_check reads the values the constraint allows
-- right now, adds the new ones and recreates it. Running it twice, or in any order with other batches, is harmless.
-- Every Effortless Laria batch extends these lists with it (docs/ux-effortless/integration.md, UXD-integration-3).

create or replace function laria_private.ux_extend_text_check(
  p_table regclass,
  p_constraint text,
  p_column text,
  p_values text[]
) returns void
language plpgsql
as $$
declare
  current_def text;
  list_expr text;
  allowed text[];
begin
  select pg_get_expr(conbin, conrelid) into current_def
  from pg_constraint
  where conrelid = p_table and conname = p_constraint and contype = 'c';

  if current_def is null then
    raise exception 'Constraint % on % not found', p_constraint, p_table;
  end if;

  -- "(column = ANY (<list>))". Postgres prints the list as ARRAY['a'::text, …] or, once rewritten from a text[]
  -- literal, as '{a,…}'::text[]. Evaluating the list reads both the same way; a pattern over the text reads the second
  -- form as one value and would drop every other type.
  list_expr := substring(current_def from '^\(\w+ = ANY \((.*)\)\)$');
  if list_expr is null then
    raise exception 'Constraint % on % is not a list of values: %', p_constraint, p_table, current_def;
  end if;
  execute format('select (%s)::text[]', list_expr) into allowed;

  select array_agg(distinct value order by value) into allowed from unnest(allowed || p_values) value;

  execute format('alter table %s drop constraint %I', p_table, p_constraint);
  execute format('alter table %s add constraint %I check (%I = any (%L::text[]))', p_table, p_constraint, p_column, allowed);
end;
$$;

revoke all on function laria_private.ux_extend_text_check(regclass, text, text, text[]) from public, anon, authenticated;

-- In-app notifications this batch creates. Every one starts with "listing_", so notifications_target_check already
-- requires a listing_id for them.
--   listing_back_in_stock      list-11: a listing the buyer asked about is available again.
--   listing_question_asked     big-11: someone asked a public question on the seller's listing.
--   listing_question_answered  big-11: the seller answered the buyer's question.
select laria_private.ux_extend_text_check(
  'public.notifications', 'notifications_event_type_check', 'event_type',
  array['listing_back_in_stock', 'listing_question_asked', 'listing_question_answered']
);

-- E-mails: only the restock the buyer explicitly asked for, and a new question for the seller (who answers it on the
-- listing). An answer reaches the asker in the app; no e-mail.
select laria_private.ux_extend_text_check(
  'laria_private.marketplace_email_deliveries', 'marketplace_email_deliveries_event_type_check', 'event_type',
  array['listing_back_in_stock', 'listing_question_asked']
);
