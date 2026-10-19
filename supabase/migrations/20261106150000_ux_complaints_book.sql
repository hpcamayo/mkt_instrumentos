-- EASE stores trust-05: Libro de Reclamaciones virtual (Ley 29571, Código de Protección y Defensa del Consumidor, and
-- its Reglamento del Libro de Reclamaciones, D.S. 011-2011-PCM and amendments).
-- PENDIENTE DE REVISIÓN LEGAL ANTES DE PRODUCCIÓN: the fields follow the Indecopi sheet (Anexo I); legal confirms the
-- answer term, the e-mail copy and the retention period before go-live.
--
--   * public.complaints_book_entries holds each sheet. RLS is on and no policy grants anon or authenticated a direct
--     read or write: a visitor files through submit_complaints_book_entry (SECURITY DEFINER) and gets back only the
--     number and date of the sheet they just filed; admins read and answer through the admin RPCs.
--   * Sheet numbers are correlative per year ("LR-2026-000123") from a counter row locked in the filing transaction,
--     not from a sequence: a sequence skips values when a transaction rolls back, and the book must not have gaps.
--   * Light abuse limit: at most 5 sheets per e-mail address (and per signed-in account) in 24 hours.
--   * No automatic deletion: the Reglamento requires keeping sheets (legal confirms the period).

create table public.complaints_book_entries (
  id uuid primary key default gen_random_uuid(),
  sheet_year integer not null,
  sheet_sequence integer not null check (sheet_sequence > 0),
  sheet_number text not null unique check (sheet_number ~ '^LR-[0-9]{4}-[0-9]{6,}$'),
  -- 1. Identificación del consumidor reclamante
  consumer_name text not null check (char_length(consumer_name) between 3 and 160),
  document_type text not null check (document_type in ('dni', 'ce', 'pasaporte', 'ruc')),
  document_number text not null check (
    (document_type = 'dni' and document_number ~ '^[0-9]{8}$')
    or (document_type = 'ruc' and document_number ~ '^[0-9]{11}$')
    or (document_type in ('ce', 'pasaporte') and document_number ~ '^[A-Z0-9]{6,12}$')
  ),
  address text not null check (char_length(address) between 5 and 300),
  phone text not null check (phone ~ '^[0-9+ ]{6,20}$'),
  email text not null check (char_length(email) <= 254 and email ~ '^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$'),
  is_minor boolean not null default false,
  guardian_name text check (guardian_name is null or char_length(guardian_name) between 3 and 160),
  -- 2. Identificación del bien contratado
  item_type text not null check (item_type in ('producto', 'servicio')),
  claimed_amount numeric(12, 2) check (claimed_amount is null or claimed_amount between 0 and 9999999999.99),
  item_description text not null check (char_length(item_description) between 3 and 1000),
  listing_slug text check (listing_slug is null or listing_slug ~ '^[a-z0-9-]{1,200}$'),
  -- 3. Detalle de la reclamación y pedido del consumidor
  complaint_type text not null check (complaint_type in ('reclamo', 'queja')),
  detail text not null check (char_length(detail) between 10 and 3000),
  request text not null check (char_length(request) between 3 and 2000),
  declaration_accepted boolean not null check (declaration_accepted),
  user_id uuid references auth.users(id) on delete set null,
  -- 4. Observaciones y acciones adoptadas por el proveedor
  status text not null default 'received' check (status in ('received', 'answered')),
  answer_text text check (answer_text is null or char_length(answer_text) between 3 and 4000),
  answered_at timestamptz,
  answered_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  unique (sheet_year, sheet_sequence),
  constraint complaints_book_guardian_check check (is_minor = (guardian_name is not null)),
  constraint complaints_book_answer_check check (
    (status = 'received' and answer_text is null and answered_at is null)
    or (status = 'answered' and answer_text is not null and answered_at is not null)
  )
);

create index complaints_book_entries_created_idx on public.complaints_book_entries (created_at desc);
create index complaints_book_entries_email_idx on public.complaints_book_entries (lower(email), created_at desc);
create index complaints_book_entries_user_idx on public.complaints_book_entries (user_id, created_at desc) where user_id is not null;

alter table public.complaints_book_entries enable row level security;
-- No policies: only the SECURITY DEFINER functions below touch the table.
revoke all on table public.complaints_book_entries from public, anon, authenticated;

create table laria_private.complaints_book_counters (
  sheet_year integer primary key,
  last_sequence integer not null check (last_sequence >= 0)
);
revoke all on table laria_private.complaints_book_counters from public, anon, authenticated;

create or replace function public.submit_complaints_book_entry(
  p_consumer_name text,
  p_document_type text,
  p_document_number text,
  p_address text,
  p_phone text,
  p_email text,
  p_is_minor boolean,
  p_guardian_name text,
  p_item_type text,
  p_claimed_amount numeric,
  p_item_description text,
  p_listing_slug text,
  p_complaint_type text,
  p_detail text,
  p_request text,
  p_declaration_accepted boolean
)
returns table (sheet_number text, filed_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_email text := lower(nullif(trim(coalesce(p_email, '')), ''));
  clean_guardian text := nullif(trim(coalesce(p_guardian_name, '')), '');
  clean_slug text := nullif(trim(coalesce(p_listing_slug, '')), '');
  filed timestamptz := clock_timestamp();
  year_value integer := extract(year from (clock_timestamp() at time zone 'America/Lima'))::integer;
  next_sequence integer;
  number_text text;
begin
  if p_declaration_accepted is not true then
    raise exception 'COMPLAINT_DECLARATION_REQUIRED';
  end if;
  if clean_email is null then
    raise exception 'COMPLAINT_INVALID';
  end if;
  if (select count(*) from public.complaints_book_entries e
      where lower(e.email) = clean_email and e.created_at > filed - interval '24 hours') >= 5
    or (auth.uid() is not null and (select count(*) from public.complaints_book_entries e
      where e.user_id = auth.uid() and e.created_at > filed - interval '24 hours') >= 5) then
    raise exception 'COMPLAINT_RATE_LIMITED';
  end if;

  insert into laria_private.complaints_book_counters as c (sheet_year, last_sequence)
  values (year_value, 1)
  on conflict (sheet_year) do update set last_sequence = c.last_sequence + 1
  returning c.last_sequence into next_sequence;
  number_text := 'LR-' || year_value || '-' || lpad(next_sequence::text, 6, '0');

  begin
    insert into public.complaints_book_entries (
      sheet_year, sheet_sequence, sheet_number, consumer_name, document_type, document_number, address, phone, email,
      is_minor, guardian_name, item_type, claimed_amount, item_description, listing_slug, complaint_type, detail,
      request, declaration_accepted, user_id, created_at
    ) values (
      year_value, next_sequence, number_text, trim(p_consumer_name), p_document_type,
      upper(regexp_replace(coalesce(p_document_number, ''), '\s', '', 'g')), trim(p_address), trim(p_phone), clean_email,
      coalesce(p_is_minor, false), case when coalesce(p_is_minor, false) then clean_guardian end, p_item_type,
      p_claimed_amount, trim(p_item_description), clean_slug, p_complaint_type, trim(p_detail), trim(p_request), true,
      auth.uid(), filed
    );
  exception when check_violation or not_null_violation or foreign_key_violation then
    -- The counter update rolls back with this exception, so a refused sheet never consumes a number.
    raise exception 'COMPLAINT_INVALID';
  end;

  return query select number_text, filed;
end;
$$;

revoke all on function public.submit_complaints_book_entry(text, text, text, text, text, text, boolean, text, text, numeric, text, text, text, text, text, boolean) from public;
grant execute on function public.submit_complaints_book_entry(text, text, text, text, text, text, boolean, text, text, numeric, text, text, text, text, text, boolean) to anon, authenticated;

-- Admin read: newest first, optional status filter, pages of up to 50.
create or replace function public.get_admin_complaints_book_page(
  p_status text default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  total bigint;
  items jsonb;
begin
  perform laria_private.assert_admin();
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size not between 1 and 50
    or (p_status is not null and p_status not in ('received', 'answered')) then
    raise exception 'ADMIN_PAGINATION_INVALID';
  end if;
  select count(*) into total from public.complaints_book_entries e where p_status is null or e.status = p_status;
  select coalesce(jsonb_agg(to_jsonb(page) order by page.created_at desc, page.sheet_number desc), '[]'::jsonb) into items
  from (
    select e.id, e.sheet_number, e.created_at, e.consumer_name, e.document_type, e.document_number, e.address, e.phone,
      e.email, e.is_minor, e.guardian_name, e.item_type, e.claimed_amount, e.item_description, e.listing_slug,
      e.complaint_type, e.detail, e.request, e.user_id, e.status, e.answer_text, e.answered_at, e.answered_by
    from public.complaints_book_entries e
    where p_status is null or e.status = p_status
    order by e.created_at desc, e.sheet_number desc
    limit p_page_size offset (p_page - 1) * p_page_size
  ) page;
  return jsonb_build_object('items', items, 'total', total, 'page', p_page, 'page_size', p_page_size);
end;
$$;

revoke all on function public.get_admin_complaints_book_page(text, integer, integer) from public, anon;
grant execute on function public.get_admin_complaints_book_page(text, integer, integer) to authenticated;

-- Admin answer: records the provider's observations and actions (section 4 of the sheet) once.
create or replace function public.answer_complaints_book_entry(p_entry_id uuid, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  answered public.complaints_book_entries;
begin
  perform laria_private.assert_admin();
  if p_answer is null or char_length(trim(p_answer)) not between 3 and 4000 then
    raise exception 'COMPLAINT_ANSWER_INVALID';
  end if;
  update public.complaints_book_entries
  set status = 'answered', answer_text = trim(p_answer), answered_at = clock_timestamp(), answered_by = auth.uid()
  where id = p_entry_id and status = 'received'
  returning * into answered;
  if answered.id is null then
    raise exception 'COMPLAINT_NOT_ANSWERABLE';
  end if;
  return jsonb_build_object('id', answered.id, 'sheet_number', answered.sheet_number, 'status', answered.status, 'answered_at', answered.answered_at);
end;
$$;

revoke all on function public.answer_complaints_book_entry(uuid, text) from public, anon;
grant execute on function public.answer_complaints_book_entry(uuid, text) to authenticated;
