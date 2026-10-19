-- Effortless Laria, batch "listing", big-11 (docs/ux-effortless/listing.md): public questions on a listing.
--
-- A signed-in buyer asks a short public question on a published listing; the seller answers it once and the answer
-- stays for every later visitor. No pre-moderation: a question shows at once, after the same contact-detail filter
-- PAY-1 applies to payment-method notes (no runs of 6+ digits, links or e-mails), so the Q&A never becomes a way to
-- move the conversation off the WhatsApp button. Anyone can report a question; an admin can hide or restore it.
--
-- Everything goes through security-definer functions: the browser roles have no direct access to the table.
--   get_listing_questions(listing)          anon + authenticated  visible Q&A, newest first, plus the caller's flags
--   ask_listing_question(listing, body)     authenticated         notifies the seller (in-app + e-mail)
--   answer_listing_question(question, txt)  authenticated         seller only, once; notifies the asker (in-app)
--   hide_listing_question(question, why)    authenticated         admin only
--   restore_listing_question(question, why) authenticated         admin only
-- Errors read 'QUESTION_CODE: mensaje en español' so the interface can show the message as it is.

-- ------------------------------------------------------------------ table

create table public.listing_questions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  asker_user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  answer text,
  answered_at timestamptz,
  answered_by uuid references public.profiles(id) on delete set null,
  status text not null default 'visible',
  hidden_reason text,
  hidden_at timestamptz,
  hidden_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  constraint listing_questions_body_check check (char_length(body) between 5 and 300 and body = btrim(body)),
  constraint listing_questions_answer_check check (
    (answer is null and answered_at is null)
    or (answer is not null and answered_at is not null and char_length(answer) between 2 and 600 and answer = btrim(answer))
  ),
  constraint listing_questions_status_check check (status in ('visible', 'hidden')),
  -- A hidden question carries why and when; restoring it clears both (the admin audit keeps the history).
  constraint listing_questions_hidden_check check (
    (status = 'visible' and hidden_reason is null and hidden_at is null and hidden_by is null)
    or (status = 'hidden' and hidden_at is not null and char_length(btrim(coalesce(hidden_reason, ''))) between 3 and 500)
  )
);

comment on table public.listing_questions is
  'big-11: public questions on a listing and the seller''s one answer. Written only through the *_listing_question RPCs.';

create index listing_questions_listing_created_idx on public.listing_questions(listing_id, created_at desc, id desc);
create index listing_questions_asker_created_idx on public.listing_questions(asker_user_id, created_at desc);

alter table public.listing_questions enable row level security;
revoke all on public.listing_questions from anon, authenticated;

-- ------------------------------------------------------------------ internal helpers

create or replace function laria_private.raise_question_error(p_code text, p_message text)
returns void
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001', message = p_code || ': ' || p_message;
end;
$$;

revoke all on function laria_private.raise_question_error(text, text) from public, anon, authenticated;

-- The PAY-1 contact-detail filter (laria_private.payment_method_text), as a test: a run of 6+ digits once spaces, dots
-- and dashes are ignored (phone, account or card numbers), a link, or an e-mail address. lib/listing-questions.ts
-- mirrors it for instant feedback; keep both in step.
create or replace function laria_private.text_has_contact_details(p_value text)
returns boolean
language sql
immutable
as $$
  select regexp_replace(coalesce(p_value, ''), '[[:space:].-]', '', 'g') ~ '[0-9]{6,}'
    or coalesce(p_value, '') ~* '(https?://|www\.|\.(com|pe|net|org|io|me|link|ly|app)(/|\s|$))'
    or coalesce(p_value, '') ~ '[^\s@]+@[^\s@]+\.[^\s@]+';
$$;

revoke all on function laria_private.text_has_contact_details(text) from public, anon, authenticated;

-- Trimmed text with every run of whitespace as one space, checked for length and contact details.
create or replace function laria_private.question_text(p_value text, p_min integer, p_max integer, p_length_code text, p_length_message text)
returns text
language plpgsql
immutable
as $$
declare
  value text := btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g'));
begin
  if char_length(value) < p_min or char_length(value) > p_max then
    perform laria_private.raise_question_error(p_length_code, p_length_message);
  end if;
  if laria_private.text_has_contact_details(value) then
    perform laria_private.raise_question_error('QUESTION_CONTACT_DETAILS',
      'No escribas números de teléfono, enlaces ni correos. Las preguntas y respuestas son públicas; para hablar con quien vende, usa el botón de contacto.');
  end if;
  return value;
end;
$$;

revoke all on function laria_private.question_text(text, integer, integer, text, text) from public, anon, authenticated;

-- Who answers a listing's questions: its owner, or the store's owner for a store listing. Null when nobody can.
create or replace function laria_private.listing_question_seller(p_listing_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when l.store_id is not null then s.owner_user_id else l.owner_user_id end
  from public.listings l
  left join public.stores s on s.id = l.store_id
  where l.id = p_listing_id;
$$;

revoke all on function laria_private.listing_question_seller(uuid) from public, anon, authenticated;

-- A listing whose Q&A visitors may read: published, or sold and still shown (the same rule as reporting a sold listing).
create or replace function laria_private.listing_questions_readable(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.listing_is_public(p_listing_id) or exists (
    select 1
    from public.listings l
    left join public.stores s on s.id = l.store_id
    where l.id = p_listing_id
      and l.status = 'sold'
      and (
        (l.seller_type = 'individual' and l.store_id is null)
        or (l.seller_type = 'store' and l.store_id is not null and s.status = 'active')
      )
  );
$$;

revoke all on function laria_private.listing_questions_readable(uuid) from public, anon, authenticated;

-- "Rodrigo C.": the first name and the initial of the next word, as lib/listing-page.ts reviewerDisplayName prints a
-- reviewer. The full name never leaves the database.
create or replace function laria_private.question_display_name(p_full_name text)
returns text
language plpgsql
immutable
as $$
declare
  words text[] := regexp_split_to_array(btrim(coalesce(p_full_name, '')), '\s+');
begin
  if coalesce(words[1], '') = '' then return 'Usuario de Laria'; end if;
  if array_length(words, 1) < 2 then return words[1]; end if;
  return words[1] || ' ' || upper(left(words[2], 1)) || '.';
end;
$$;

revoke all on function laria_private.question_display_name(text) from public, anon, authenticated;

-- "Pedal Boss DS-1", cut to fit a notification line.
create or replace function laria_private.question_snippet(p_value text, p_max integer)
returns text
language sql
immutable
as $$
  select case when char_length(p_value) > p_max then rtrim(left(p_value, p_max - 1)) || '…' else p_value end;
$$;

revoke all on function laria_private.question_snippet(text, integer) from public, anon, authenticated;

-- ------------------------------------------------------------------ read

-- The listing's Q&A for the caller, newest first (up to 100): visible questions for everyone, hidden ones too for an
-- admin (marked, so they can be restored). Flags: signed_in, can_ask (signed in, not the seller, listing published),
-- can_answer (the seller, listing published), is_admin, accepting (the listing takes new questions).
create or replace function public.get_listing_questions(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  admin boolean := coalesce(public.is_admin(), false);
  seller uuid;
  readable boolean;
  accepting boolean;
  is_seller boolean;
  items jsonb;
begin
  if p_listing_id is null then
    return jsonb_build_object('signed_in', caller is not null, 'can_ask', false, 'can_answer', false,
      'is_admin', admin, 'accepting', false, 'questions', '[]'::jsonb);
  end if;
  seller := laria_private.listing_question_seller(p_listing_id);
  is_seller := caller is not null and seller is not distinct from caller;
  readable := laria_private.listing_questions_readable(p_listing_id) or admin or is_seller;
  accepting := public.listing_is_public(p_listing_id);

  if readable then
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', q.id,
        'body', q.body,
        'asker_name', laria_private.question_display_name(p.full_name),
        'created_at', q.created_at,
        'answer', q.answer,
        'answered_at', q.answered_at,
        'status', q.status,
        'hidden_reason', case when admin then q.hidden_reason end,
        'is_mine', caller is not null and q.asker_user_id = caller
      ) order by q.created_at desc, q.id desc), '[]'::jsonb)
    into items
    from (
      select * from public.listing_questions
      where listing_id = p_listing_id and (status = 'visible' or admin)
      order by created_at desc, id desc
      limit 100
    ) q
    left join public.profiles p on p.id = q.asker_user_id;
  end if;

  return jsonb_build_object(
    'signed_in', caller is not null,
    'can_ask', caller is not null and accepting and not is_seller,
    'can_answer', is_seller and accepting,
    'is_admin', admin,
    'accepting', accepting,
    'questions', coalesce(items, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_listing_questions(uuid) from public;
grant execute on function public.get_listing_questions(uuid) to anon, authenticated;

-- ------------------------------------------------------------------ ask

-- Limits: 3 unanswered visible questions per asker and listing, and 20 questions per asker in any 24 hours. A
-- transaction-scoped lock per asker keeps two quick submits from both passing the limits.
create or replace function public.ask_listing_question(p_listing_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  caller uuid := auth.uid();
  seller uuid;
  listing_title text;
  clean_body text;
  question_record public.listing_questions;
  notification_uuid uuid;
begin
  if caller is null then
    perform laria_private.raise_question_error('QUESTION_AUTH_REQUIRED', 'Ingresa para hacer una pregunta.');
  end if;
  if p_listing_id is null or not public.listing_is_public(p_listing_id) then
    perform laria_private.raise_question_error('QUESTION_LISTING_UNAVAILABLE', 'Esta publicación ya no recibe preguntas.');
  end if;
  seller := laria_private.listing_question_seller(p_listing_id);
  if seller is null then
    perform laria_private.raise_question_error('QUESTION_LISTING_UNAVAILABLE', 'Esta publicación ya no recibe preguntas.');
  end if;
  if seller = caller then
    perform laria_private.raise_question_error('QUESTION_OWN_LISTING', 'No puedes preguntar en tu propia publicación.');
  end if;

  clean_body := laria_private.question_text(p_body, 5, 300, 'QUESTION_LENGTH', 'La pregunta debe tener entre 5 y 300 caracteres.');

  perform pg_advisory_xact_lock(hashtextextended('listing_question:' || caller::text, 0));
  if (select count(*) from public.listing_questions
      where listing_id = p_listing_id and asker_user_id = caller and answer is null and status = 'visible') >= 3 then
    perform laria_private.raise_question_error('QUESTION_PENDING_LIMIT',
      'Ya tienes 3 preguntas sin responder en esta publicación. Espera una respuesta antes de hacer otra.');
  end if;
  if (select count(*) from public.listing_questions
      where asker_user_id = caller and created_at > now() - interval '24 hours') >= 20 then
    perform laria_private.raise_question_error('QUESTION_DAILY_LIMIT',
      'Llegaste al límite de 20 preguntas por día. Vuelve a intentarlo mañana.');
  end if;

  insert into public.listing_questions(listing_id, asker_user_id, body)
  values (p_listing_id, caller, clean_body)
  returning * into question_record;

  select title into listing_title from public.listings where id = p_listing_id;

  -- The seller hears about it in the app and by e-mail. The e-mail is queued here, not by the notifications trigger
  -- (laria_private.enqueue_notification_marketplace_email does not handle this type); the dedupe key is per question.
  insert into public.notifications(user_id, event_type, listing_id, message)
  values (seller, 'listing_question_asked', p_listing_id,
    'Te preguntaron en “' || laria_private.question_snippet(listing_title, 80) || '”: “'
      || laria_private.question_snippet(clean_body, 120) || '”')
  returning id into notification_uuid;

  perform laria_private.enqueue_marketplace_email(
    'listing_question_asked', seller, 'listing_question:' || question_record.id::text, notification_uuid, p_listing_id
  );

  return jsonb_build_object('id', question_record.id, 'created_at', question_record.created_at);
end;
$$;

revoke all on function public.ask_listing_question(uuid, text) from public, anon;
grant execute on function public.ask_listing_question(uuid, text) to authenticated;

-- ------------------------------------------------------------------ answer

-- The seller answers a visible question once, while the listing is published. The asker is told in the app only.
create or replace function public.answer_listing_question(p_question_id uuid, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  caller uuid := auth.uid();
  question_record public.listing_questions;
  clean_answer text;
  listing_title text;
begin
  if caller is null then
    perform laria_private.raise_question_error('QUESTION_AUTH_REQUIRED', 'Ingresa para responder.');
  end if;

  select * into question_record from public.listing_questions where id = p_question_id for update;
  if question_record.id is null or question_record.status <> 'visible' then
    perform laria_private.raise_question_error('QUESTION_NOT_FOUND', 'Esta pregunta ya no está disponible.');
  end if;
  if laria_private.listing_question_seller(question_record.listing_id) is distinct from caller then
    perform laria_private.raise_question_error('QUESTION_ANSWER_FORBIDDEN', 'Solo quien vende puede responder esta pregunta.');
  end if;
  if not public.listing_is_public(question_record.listing_id) then
    perform laria_private.raise_question_error('QUESTION_LISTING_UNAVAILABLE', 'Esta publicación ya no recibe respuestas.');
  end if;
  if question_record.answer is not null then
    perform laria_private.raise_question_error('QUESTION_ALREADY_ANSWERED', 'Esta pregunta ya tiene respuesta.');
  end if;

  clean_answer := laria_private.question_text(p_answer, 2, 600, 'QUESTION_ANSWER_LENGTH', 'La respuesta debe tener entre 2 y 600 caracteres.');

  update public.listing_questions
  set answer = clean_answer, answered_at = clock_timestamp(), answered_by = caller
  where id = p_question_id
  returning * into question_record;

  select title into listing_title from public.listings where id = question_record.listing_id;
  insert into public.notifications(user_id, event_type, listing_id, message)
  values (question_record.asker_user_id, 'listing_question_answered', question_record.listing_id,
    'Respondieron tu pregunta sobre “' || laria_private.question_snippet(listing_title, 80) || '”.');

  return jsonb_build_object('id', question_record.id, 'answered_at', question_record.answered_at);
end;
$$;

revoke all on function public.answer_listing_question(uuid, text) from public, anon;
grant execute on function public.answer_listing_question(uuid, text) to authenticated;

-- ------------------------------------------------------------------ moderation

-- The admin audit accepts a question as a target (extended in place, as the registry migration does for other lists).
select laria_private.ux_extend_text_check(
  'public.admin_audit_actions', 'admin_audit_actions_target_type_check', 'target_type', array['question']
);

create or replace function public.hide_listing_question(p_question_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  clean_reason text := btrim(coalesce(p_reason, ''));
  question_record public.listing_questions;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    perform laria_private.raise_question_error('QUESTION_ADMIN_REQUIRED', 'Solo moderación puede ocultar preguntas.');
  end if;
  if char_length(clean_reason) not between 3 and 500 then
    perform laria_private.raise_question_error('QUESTION_REASON_REQUIRED', 'Escribe un motivo de entre 3 y 500 caracteres.');
  end if;
  select * into question_record from public.listing_questions where id = p_question_id for update;
  if question_record.id is null then
    perform laria_private.raise_question_error('QUESTION_NOT_FOUND', 'Esta pregunta ya no está disponible.');
  end if;
  if question_record.status = 'hidden' then
    perform laria_private.raise_question_error('QUESTION_STATUS_UNCHANGED', 'La pregunta ya está oculta.');
  end if;

  update public.listing_questions
  set status = 'hidden', hidden_reason = clean_reason, hidden_at = now(), hidden_by = auth.uid()
  where id = p_question_id;
  perform laria_private.record_admin_audit('question_hidden', 'question', p_question_id,
    jsonb_build_object('reason', clean_reason, 'listing_id', question_record.listing_id));
  return jsonb_build_object('id', p_question_id, 'status', 'hidden');
end;
$$;

revoke all on function public.hide_listing_question(uuid, text) from public, anon;
grant execute on function public.hide_listing_question(uuid, text) to authenticated;

create or replace function public.restore_listing_question(p_question_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  clean_reason text := btrim(coalesce(p_reason, ''));
  question_record public.listing_questions;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    perform laria_private.raise_question_error('QUESTION_ADMIN_REQUIRED', 'Solo moderación puede mostrar preguntas ocultas.');
  end if;
  if char_length(clean_reason) not between 3 and 500 then
    perform laria_private.raise_question_error('QUESTION_REASON_REQUIRED', 'Escribe un motivo de entre 3 y 500 caracteres.');
  end if;
  select * into question_record from public.listing_questions where id = p_question_id for update;
  if question_record.id is null then
    perform laria_private.raise_question_error('QUESTION_NOT_FOUND', 'Esta pregunta ya no está disponible.');
  end if;
  if question_record.status = 'visible' then
    perform laria_private.raise_question_error('QUESTION_STATUS_UNCHANGED', 'La pregunta ya está visible.');
  end if;

  update public.listing_questions
  set status = 'visible', hidden_reason = null, hidden_at = null, hidden_by = null
  where id = p_question_id;
  perform laria_private.record_admin_audit('question_restored', 'question', p_question_id,
    jsonb_build_object('reason', clean_reason, 'previous_reason', question_record.hidden_reason, 'listing_id', question_record.listing_id));
  return jsonb_build_object('id', p_question_id, 'status', 'visible');
end;
$$;

revoke all on function public.restore_listing_question(uuid, text) from public, anon;
grant execute on function public.restore_listing_question(uuid, text) to authenticated;

-- ------------------------------------------------------------------ reports

-- A question is a report target, through the same submit_content_report call as listings, stores and reviews.
alter table public.reports
  add column question_id uuid references public.listing_questions(id) on delete restrict;

select laria_private.ux_extend_text_check(
  'public.reports', 'reports_target_type_check', 'target_type', array['question']
);

-- The listing, store and review branches are unchanged; the question branch is new.
alter table public.reports drop constraint reports_target_check;
alter table public.reports add constraint reports_target_check check (
  (target_type = 'listing' and listing_id is not null and store_id is null and review_id is null)
  or (target_type = 'store' and store_id is not null and listing_id is null and review_id is null)
  or (target_type = 'review' and review_id is not null and listing_id is null and store_id is null)
  or (target_type = 'question' and question_id is not null and listing_id is null and store_id is null and review_id is null)
);
-- And only a question report names a question.
alter table public.reports add constraint reports_question_target_check check (question_id is null or target_type = 'question');

create unique index reports_one_open_question_per_reporter_idx
  on public.reports(reporter_user_id, question_id)
  where status = 'open' and target_type = 'question';
create index reports_question_idx on public.reports(question_id, status) where question_id is not null;

-- submit_content_report as in sprint 8, with the question branch: a visible question on a listing visitors can read,
-- never one's own. (The seller may report a question on their listing.)
create or replace function public.submit_content_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_detail text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  report_uuid uuid;
  clean_detail text;
  target_owner uuid;
  target_reporter uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'REPORT_AUTH_REQUIRED';
  end if;
  if p_target_type is null or p_target_type not in ('listing', 'store', 'review', 'question') then
    raise exception 'REPORT_TARGET_UNAVAILABLE';
  end if;
  if p_target_id is null then
    raise exception 'REPORT_TARGET_UNAVAILABLE';
  end if;
  if p_reason is null or p_reason not in (
    'acoso', 'contenido_inapropiado', 'informacion_falsa',
    'posible_estafa', 'articulo_prohibido', 'spam', 'otro'
  ) then
    raise exception 'REPORT_REASON_INVALID';
  end if;

  clean_detail := nullif(trim(coalesce(p_detail, '')), '');
  if clean_detail is not null and length(clean_detail) > 1000 then
    raise exception 'REPORT_DETAIL_TOO_LONG';
  end if;

  if p_target_type = 'listing' then
    select coalesce(l.owner_user_id, s.owner_user_id) into target_owner
    from public.listings l
    left join public.stores s on s.id = l.store_id
    where l.id = p_target_id
      and (
        public.listing_is_public(l.id)
        or (
          l.status = 'sold'
          and (
            (l.seller_type = 'individual' and l.store_id is null)
            or (l.seller_type = 'store' and l.store_id is not null and s.status = 'active')
          )
        )
      );
    if not found or target_owner is not distinct from auth.uid() then
      raise exception 'REPORT_TARGET_UNAVAILABLE';
    end if;
  elsif p_target_type = 'store' then
    select owner_user_id into target_owner
    from public.stores
    where id = p_target_id and status = 'active';
    if not found or target_owner is not distinct from auth.uid() then
      raise exception 'REPORT_TARGET_UNAVAILABLE';
    end if;
  elsif p_target_type = 'review' then
    select reviewer_user_id into target_reporter
    from public.transaction_reviews
    where id = p_target_id and laria_private.review_is_visible(id);
    if not found or target_reporter is not distinct from auth.uid() then
      raise exception 'REPORT_TARGET_UNAVAILABLE';
    end if;
  else
    select asker_user_id into target_reporter
    from public.listing_questions
    where id = p_target_id and status = 'visible' and laria_private.listing_questions_readable(listing_id);
    if not found or target_reporter is not distinct from auth.uid() then
      raise exception 'REPORT_TARGET_UNAVAILABLE';
    end if;
  end if;

  insert into public.reports(
    reporter_user_id,
    target_type,
    listing_id,
    store_id,
    review_id,
    question_id,
    reason,
    detail
  )
  values(
    auth.uid(),
    p_target_type,
    case when p_target_type = 'listing' then p_target_id end,
    case when p_target_type = 'store' then p_target_id end,
    case when p_target_type = 'review' then p_target_id end,
    case when p_target_type = 'question' then p_target_id end,
    p_reason,
    clean_detail
  )
  returning id into report_uuid;

  return report_uuid;
exception
  when unique_violation then
    raise exception 'REPORT_ALREADY_SUBMITTED';
end;
$$;
