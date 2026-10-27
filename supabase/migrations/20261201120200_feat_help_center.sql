-- Feature ideas, accounts batch (docs/feature-ideas/accounts.md), safe-10: "¿No encontraste tu respuesta?" tickets.
--
--   * public.help_tickets holds each question sent from the help center. RLS is on and no policy grants a direct read
--     or write: anyone sends one through submit_help_ticket (SECURITY DEFINER) and gets back its code; a signed-in
--     person reads their own through my_help_tickets; Admin reads and answers through the admin functions.
--   * Light abuse limits: five tickets per e-mail address and per account in 24 hours, ten per browser fingerprint
--     (a hash of the client address the server passes) per hour.
--   * An answer to a ticket sent while signed in also goes out by e-mail (help_ticket_answered) and shows in
--     "Mis consultas". A ticket sent without an account is answered by Admin from their own mailbox: the Admin page
--     offers the address.
-- New objects only.

create table public.help_tickets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^AY-[0-9A-F]{8}$'),
  user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) <= 254 and email ~ '^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$'),
  topic text not null check (topic in ('comprar', 'vender', 'tiendas', 'cuenta', 'seguridad', 'robo', 'otro')),
  message text not null check (char_length(message) between 10 and 3000),
  page_path text check (page_path is null or (char_length(page_path) <= 300 and page_path ~ '^/[A-Za-z0-9/_.?=&%-]*$')),
  client_hash text check (client_hash is null or client_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'abierto' check (status in ('abierto', 'respondido', 'cerrado')),
  answer text check (answer is null or char_length(answer) between 3 and 4000),
  answered_at timestamptz,
  answered_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint help_tickets_answered_check check ((answer is null) = (answered_at is null))
);
create index help_tickets_status_idx on public.help_tickets (status, created_at desc);
create index help_tickets_email_idx on public.help_tickets (lower(email), created_at desc);
create index help_tickets_user_idx on public.help_tickets (user_id, created_at desc) where user_id is not null;
create index help_tickets_client_idx on public.help_tickets (client_hash, created_at desc) where client_hash is not null;

alter table public.help_tickets enable row level security;
-- No policies: only the SECURITY DEFINER functions below touch the table.
revoke all on table public.help_tickets from public, anon, authenticated;

create or replace function public.submit_help_ticket(
  p_name text,
  p_email text,
  p_topic text,
  p_message text,
  p_page_path text default null,
  p_client_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean_email text := lower(nullif(trim(coalesce(p_email, '')), ''));
  sent timestamptz := clock_timestamp();
  saved public.help_tickets;
begin
  if clean_email is null and uid is not null then
    select lower(email) into clean_email from auth.users where id = uid;
  end if;
  if clean_email is null or char_length(trim(coalesce(p_name, ''))) < 2 or char_length(trim(coalesce(p_message, ''))) < 10 then
    raise exception 'HELP_TICKET_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('help_tickets:' || clean_email, 0));
  if (select count(*) from public.help_tickets where lower(email) = clean_email and created_at > sent - interval '24 hours') >= 5
    or (uid is not null and (select count(*) from public.help_tickets where user_id = uid and created_at > sent - interval '24 hours') >= 5)
    or (p_client_hash is not null and (select count(*) from public.help_tickets where client_hash = p_client_hash and created_at > sent - interval '1 hour') >= 10) then
    raise exception 'HELP_TICKET_RATE_LIMITED';
  end if;
  insert into public.help_tickets (code, user_id, name, email, topic, message, page_path, client_hash)
  values (
    'AY-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8)),
    uid, trim(p_name), clean_email, p_topic, trim(p_message), nullif(trim(coalesce(p_page_path, '')), ''), p_client_hash
  )
  returning * into saved;
  return jsonb_build_object('code', saved.code, 'created_at', saved.created_at);
exception
  when check_violation then raise exception 'HELP_TICKET_INVALID';
end;
$$;
revoke all on function public.submit_help_ticket(text, text, text, text, text, text) from public;
grant execute on function public.submit_help_ticket(text, text, text, text, text, text) to anon, authenticated;

create or replace function public.my_help_tickets()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'HELP_AUTH_REQUIRED'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'code', t.code, 'topic', t.topic, 'message', t.message, 'status', t.status, 'answer', t.answer,
      'answered_at', t.answered_at, 'created_at', t.created_at) order by t.created_at desc), '[]'::jsonb)
    from (select * from public.help_tickets where user_id = auth.uid() order by created_at desc limit 50) t);
end;
$$;
revoke all on function public.my_help_tickets() from public, anon;
grant execute on function public.my_help_tickets() to authenticated;

create or replace function public.admin_help_tickets(p_status text default 'abierto', p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform laria_private.assert_admin();
  if p_status is not null and p_status not in ('abierto', 'respondido', 'cerrado') then raise exception 'HELP_STATUS_INVALID'; end if;
  return jsonb_build_object(
    'counts', (select jsonb_object_agg(status, total) from (
      select status, count(*) as total from public.help_tickets group by status) counted),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'code', t.code, 'name', t.name, 'email', t.email, 'has_account', t.user_id is not null,
      'topic', t.topic, 'message', t.message, 'page_path', t.page_path, 'status', t.status, 'answer', t.answer,
      'answered_at', t.answered_at, 'created_at', t.created_at) order by t.created_at), '[]'::jsonb)
      from (select * from public.help_tickets
            where p_status is null or status = p_status
            order by created_at limit greatest(1, least(coalesce(p_limit, 50), 200))) t)
  );
end;
$$;
revoke all on function public.admin_help_tickets(text, integer) from public, anon;
grant execute on function public.admin_help_tickets(text, integer) to authenticated;

-- Saves the answer. A ticket sent while signed in gets it by e-mail too; otherwise the caller gets the address to
-- answer from their own mailbox.
create or replace function public.admin_answer_help_ticket(p_ticket_id uuid, p_answer text, p_close boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  ticket public.help_tickets;
  emailed boolean := false;
begin
  perform laria_private.assert_admin();
  if char_length(trim(coalesce(p_answer, ''))) < 3 then raise exception 'HELP_ANSWER_INVALID'; end if;
  update public.help_tickets
  set answer = trim(p_answer), answered_at = clock_timestamp(), answered_by = auth.uid(),
    status = case when p_close then 'cerrado' else 'respondido' end, updated_at = clock_timestamp()
  where id = p_ticket_id
  returning * into ticket;
  if not found then raise exception 'HELP_TICKET_NOT_FOUND'; end if;
  if ticket.user_id is not null and exists (select 1 from public.profiles where id = ticket.user_id) then
    perform laria_private.enqueue_marketplace_email(
      'help_ticket_answered', ticket.user_id,
      'help_ticket_answered:' || ticket.id::text || ':' || to_char(ticket.answered_at, 'YYYYMMDDHH24MISSUS'),
      p_context => jsonb_build_object('ticket_code', ticket.code, 'answer', left(ticket.answer, 2000)));
    emailed := true;
  end if;
  return jsonb_build_object('code', ticket.code, 'status', ticket.status, 'emailed', emailed,
    'email', case when emailed then null else ticket.email end);
exception
  when check_violation then raise exception 'HELP_ANSWER_INVALID';
end;
$$;
revoke all on function public.admin_answer_help_ticket(uuid, text, boolean) from public, anon;
grant execute on function public.admin_answer_help_ticket(uuid, text, boolean) to authenticated;

create or replace function public.admin_set_help_ticket_status(p_ticket_id uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare saved text;
begin
  perform laria_private.assert_admin();
  if p_status not in ('abierto', 'cerrado') then raise exception 'HELP_STATUS_INVALID'; end if;
  update public.help_tickets set status = p_status, updated_at = clock_timestamp()
  where id = p_ticket_id
  returning status into saved;
  if saved is null then raise exception 'HELP_TICKET_NOT_FOUND'; end if;
  return saved;
end;
$$;
revoke all on function public.admin_set_help_ticket_status(uuid, text) from public, anon;
grant execute on function public.admin_set_help_ticket_status(uuid, text) to authenticated;
