-- UX-Effortless maybes, stock-24 and big-07 (docs/ux-effortless/maybes-ai.md): a log of the AI helpers' calls.
--
-- Before: nothing in Laria called an AI model.
--
-- After: "Pregúntale a tu tienda" (Mi tienda and its Inventario) and "Completar con IA" (the sell form) call
-- Anthropic's API from two server routes, app/api/store/ask and app/api/listing-assist. Both stay off unless the
-- server has ANTHROPIC_API_KEY and LARIA_AI_HELPERS=1. Each call that reaches the API leaves one row in
-- laria_private.ai_requests without its content: the feature, the account, the store (questions only), the model that
-- answered, the input and output tokens, the outcome and the time. Never the question, the photos or the answer.
-- public.record_ai_request, for the service role only, writes it; no API role reads or writes the table. Rows go after
-- 90 days (pg_cron ai-request-retention, daily at 09:55 UTC), and an anonymized account's rows lose the account at
-- once, through a trigger on laria_private.account_anonymizations as laria_private.listing_impression_days does; a
-- call that was already running when the account was anonymized is written without it. The daily limits (50 questions
-- per store, 20 photo assists per account, a site-wide cap) are counted by public.consume_rate_limit, which needs
-- nothing new.
--
-- Compatibility: new objects only; the app before this change calls none of them.
-- Locks: creating the trigger takes a SHARE ROW EXCLUSIVE lock on laria_private.account_anonymizations for an instant
-- (an anonymization running at that moment is waited for); nothing else is locked.
-- Rollback: select cron.unschedule('ai-request-retention'); drop trigger account_anonymizations_unlink_ai_requests on
-- laria_private.account_anonymizations; then drop the three functions and laria_private.ai_requests.

set lock_timeout = '10s';

create table if not exists laria_private.ai_requests (
  id bigint generated always as identity primary key,
  feature text not null check (feature in ('store_question', 'listing_assist')),
  user_id uuid references public.profiles(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  model text not null check (model ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  outcome text not null check (outcome in ('answered', 'no_match', 'refused', 'invalid', 'failed')),
  created_at timestamptz not null default now()
);
create index if not exists ai_requests_user_idx on laria_private.ai_requests(user_id) where user_id is not null;
create index if not exists ai_requests_store_idx on laria_private.ai_requests(store_id) where store_id is not null;
create index if not exists ai_requests_created_at_idx on laria_private.ai_requests(created_at);
alter table laria_private.ai_requests enable row level security;
revoke all on laria_private.ai_requests from public, anon, authenticated;

-- One call to the API. The outcome is answered (used), no_match (a valid answer that found nothing to use), refused
-- (the model declined), invalid (an answer that didn't parse or failed the site's own checks) or failed (no answer:
-- network, timeout, an API error). A model name outside the usual spelling reads unknown; tokens below zero read 0.
create or replace function public.record_ai_request(
  p_feature text,
  p_user_id uuid,
  p_store_id uuid,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_outcome text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_feature is null or p_feature not in ('store_question', 'listing_assist')
    or p_outcome is null or p_outcome not in ('answered', 'no_match', 'refused', 'invalid', 'failed') then
    raise exception using errcode = '22023', message = 'AI_REQUEST_INVALID';
  end if;
  insert into laria_private.ai_requests (feature, user_id, store_id, model, input_tokens, output_tokens, outcome)
  values (
    p_feature,
    case when p_user_id is not null
      and not exists (select 1 from laria_private.account_anonymizations a where a.user_id = p_user_id)
      then p_user_id end,
    p_store_id,
    case when p_model ~ '^[a-z0-9][a-z0-9._-]{0,79}$' then p_model else 'unknown' end,
    greatest(coalesce(p_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0),
    p_outcome
  );
end;
$$;
revoke all on function public.record_ai_request(text, uuid, uuid, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.record_ai_request(text, uuid, uuid, text, integer, integer, text) to service_role;

create or replace function laria_private.run_ai_request_retention()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from laria_private.ai_requests where created_at < now() - interval '90 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- Launch audit A20's anonymization records each run in laria_private.account_anonymizations; the account's calls lose
-- it then.
create or replace function laria_private.unlink_anonymized_ai_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update laria_private.ai_requests set user_id = null where user_id = new.user_id;
  return null;
end;
$$;
revoke all on function laria_private.run_ai_request_retention(), laria_private.unlink_anonymized_ai_requests()
from public, anon, authenticated;

drop trigger if exists account_anonymizations_unlink_ai_requests on laria_private.account_anonymizations;
create trigger account_anonymizations_unlink_ai_requests
after insert or update on laria_private.account_anonymizations
for each row execute function laria_private.unlink_anonymized_ai_requests();

-- Daily at 09:55 UTC (04:55 Lima). cron.schedule() with a job name replaces the job of that name.
select cron.schedule('ai-request-retention', '55 9 * * *', $$select laria_private.run_ai_request_retention()$$);

reset lock_timeout;
