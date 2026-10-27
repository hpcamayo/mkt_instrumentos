-- EASE stores trust-05: Libro de Reclamaciones (supabase/migrations/20261106150000_ux_complaints_book.sql). Anon and
-- signed-in visitors file sheets through the RPC, numbers are correlative, nobody but admins reads entries, and the
-- length and format checks hold. Local/test database only. Every fixture is rolled back.
begin;

create function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_code in sqlerrm) = 1 then return; end if;
    raise exception 'Expected % from [%], got: % (%)', p_code, p_sql, sqlerrm, sqlstate;
  end;
  raise exception 'Expected % from [%], but it succeeded', p_code, p_sql;
end $$;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;

-- Files a sheet with valid defaults; p_override replaces any argument by name.
create function pg_temp.file(p_override jsonb default '{}'::jsonb) returns text language plpgsql as $$
declare
  a jsonb := jsonb_build_object(
    'name', 'María Quispe Torres', 'doc_type', 'dni', 'doc', '45678912', 'address', 'Av. Arequipa 1234, Lima',
    'phone', '987654321', 'email', 'maria.qa@example.invalid', 'minor', false, 'guardian', null, 'item_type', 'servicio',
    'amount', null, 'item', 'Servicio de publicación en Laria', 'slug', null, 'type', 'reclamo',
    'detail', 'Mi publicación fue ocultada sin explicación clara.', 'request', 'Que revisen la decisión.', 'declaration', true
  ) || p_override;
  result text;
begin
  select s.sheet_number into result from public.submit_complaints_book_entry(
    a->>'name', a->>'doc_type', a->>'doc', a->>'address', a->>'phone', a->>'email', (a->>'minor')::boolean,
    a->>'guardian', a->>'item_type', (a->>'amount')::numeric, a->>'item', a->>'slug', a->>'type', a->>'detail',
    a->>'request', (a->>'declaration')::boolean
  ) s;
  return result;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- A clean counter for this run's year, so the numbering assertions do not depend on earlier local data.
delete from public.complaints_book_entries;
delete from laria_private.complaints_book_counters;

-- ------------------------------------------------------------------ anon files a sheet; numbers are correlative

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare
  year_text text := extract(year from (now() at time zone 'America/Lima'))::integer::text;
  first_number text; second_number text; third_number text;
begin
  first_number := pg_temp.file();
  perform pg_temp.check(first_number = 'LR-' || year_text || '-000001', 'first sheet is 000001, got ' || first_number);
  second_number := pg_temp.file('{"type":"queja","email":"otra.qa@example.invalid","item_type":"producto","amount":"1500.50","slug":"guitarra-fender-qa"}');
  perform pg_temp.check(second_number = 'LR-' || year_text || '-000002', 'second sheet is 000002, got ' || second_number);
  -- A refused sheet consumes no number.
  perform pg_temp.expect_error($q$select pg_temp.file('{"detail":"corto"}')$q$, 'COMPLAINT_INVALID');
  third_number := pg_temp.file('{"minor":true,"guardian":"Rosa Torres Vda. de Quispe","doc_type":"ce","doc":"ab12345c"}');
  perform pg_temp.check(third_number = 'LR-' || year_text || '-000003', 'no gap after a refused sheet, got ' || third_number);
end $$;

-- ------------------------------------------------------------------ anon and authenticated cannot read entries

select pg_temp.expect_error('select count(*) from public.complaints_book_entries', 'permission denied');
select pg_temp.expect_error('insert into public.complaints_book_entries (sheet_year) values (2026)', 'permission denied');
select pg_temp.expect_error('select count(*) from laria_private.complaints_book_counters', 'permission denied');
select pg_temp.expect_error('select public.get_admin_complaints_book_page()', 'permission denied');
reset role;

-- The signed-in user's id is recorded; the user still cannot read the table or the admin page.
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('c5000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'lr-user@example.invalid', now(), '{}', '{"account_type":"seller","full_name":"Usuario LR","phone":"51999990001","city":"Lima","region":"Lima"}'),
  ('c5000000-0000-4000-8000-000000000099', 'authenticated', 'authenticated', 'lr-admin@example.invalid', now(), '{"role":"admin"}', '{"account_type":"seller","full_name":"Admin LR","phone":"51999990099","city":"Lima","region":"Lima"}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c5000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.check(pg_temp.file('{"email":"lr-user@example.invalid"}') like 'LR-%-000004', 'signed-in user files the fourth sheet');
select pg_temp.expect_error('select count(*) from public.complaints_book_entries', 'permission denied');
select pg_temp.expect_error('select public.get_admin_complaints_book_page()', 'ADMIN_REQUIRED');
select pg_temp.expect_error($q$select public.answer_complaints_book_entry(gen_random_uuid(), 'Respuesta de prueba')$q$, 'ADMIN_REQUIRED');
reset role;
select pg_temp.check((select user_id from public.complaints_book_entries where sheet_sequence = 4) = 'c5000000-0000-4000-8000-000000000001', 'user id recorded');
select pg_temp.check((select user_id from public.complaints_book_entries where sheet_sequence = 1) is null, 'anon sheet has no user id');
select pg_temp.check((select document_number from public.complaints_book_entries where sheet_sequence = 3) = 'AB12345C', 'document number normalized');
select pg_temp.check((select claimed_amount from public.complaints_book_entries where sheet_sequence = 2) = 1500.50, 'amount stored');

-- ------------------------------------------------------------------ length and format checks

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect_error($q$select pg_temp.file('{"declaration":false}')$q$, 'COMPLAINT_DECLARATION_REQUIRED');
select pg_temp.expect_error($q$select pg_temp.file('{"email":""}')$q$, 'COMPLAINT_INVALID');
select pg_temp.expect_error($q$select pg_temp.file('{"email":"sin-arroba"}')$q$, 'COMPLAINT_INVALID');
select pg_temp.expect_error($q$select pg_temp.file('{"doc":"1234567"}')$q$, 'COMPLAINT_INVALID');
select pg_temp.expect_error($q$select pg_temp.file('{"doc_type":"ruc","doc":"45678912"}')$q$, 'COMPLAINT_INVALID');
select pg_temp.expect_error($q$select pg_temp.file('{"doc_type":"licencia"}')$q$, 'COMPLAINT_INVALID');
select pg_temp.expect_error($q$select pg_temp.file('{"type":"sugerencia"}')$q$, 'COMPLAINT_INVALID');
select pg_temp.expect_error($q$select pg_temp.file('{"item_type":"otro"}')$q$, 'COMPLAINT_INVALID');
select pg_temp.expect_error($q$select pg_temp.file('{"minor":true}')$q$, 'COMPLAINT_INVALID');
select pg_temp.expect_error($q$select pg_temp.file('{"amount":"-1"}')$q$, 'COMPLAINT_INVALID');
select pg_temp.expect_error($q$select pg_temp.file('{"slug":"No Valido"}')$q$, 'COMPLAINT_INVALID');
select pg_temp.expect_error($q$select pg_temp.file('{"phone":"abc"}')$q$, 'COMPLAINT_INVALID');
select pg_temp.expect_error(format($q$select pg_temp.file('{"name":"%s"}')$q$, repeat('a', 161)), 'COMPLAINT_INVALID');
select pg_temp.expect_error(format($q$select pg_temp.file('{"detail":"%s"}')$q$, repeat('a', 3001)), 'COMPLAINT_INVALID');
select pg_temp.expect_error(format($q$select pg_temp.file('{"request":"%s"}')$q$, repeat('a', 2001)), 'COMPLAINT_INVALID');
select pg_temp.expect_error(format($q$select pg_temp.file('{"item":"%s"}')$q$, repeat('a', 1001)), 'COMPLAINT_INVALID');
select pg_temp.expect_error(format($q$select pg_temp.file('{"address":"%s"}')$q$, repeat('a', 301)), 'COMPLAINT_INVALID');

-- ------------------------------------------------------------------ light rate limit: 5 per e-mail in 24 hours

select pg_temp.file('{"email":"limite.qa@example.invalid"}') from generate_series(1, 5);
select pg_temp.expect_error($q$select pg_temp.file('{"email":"LIMITE.qa@example.invalid"}')$q$, 'COMPLAINT_RATE_LIMITED');
reset role;
select pg_temp.check((select max(sheet_sequence) from public.complaints_book_entries) = 9, 'rate-limited sheet took no number');
select pg_temp.check((select count(*) = count(distinct sheet_sequence) and max(sheet_sequence) = count(*) from public.complaints_book_entries), 'numbering has no gaps');

-- ------------------------------------------------------------------ admin reads pages and answers once

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c5000000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal2","app_metadata":{"role":"admin"}}', true);
do $$
declare page jsonb; entry uuid; answered jsonb;
begin
  page := public.get_admin_complaints_book_page(null, 1, 4);
  perform pg_temp.check((page->>'total')::integer = 9, 'admin sees every sheet');
  perform pg_temp.check(jsonb_array_length(page->'items') = 4, 'page size respected');
  perform pg_temp.check(page #>> '{items,0,sheet_number}' like '%-000009', 'newest first');
  page := public.get_admin_complaints_book_page(null, 3, 4);
  perform pg_temp.check(jsonb_array_length(page->'items') = 1, 'last page');
  entry := (page #>> '{items,0,id}')::uuid;
  answered := public.answer_complaints_book_entry(entry, 'Revisamos tu caso y restablecimos la publicación.');
  perform pg_temp.check(answered->>'status' = 'answered', 'answer recorded');
  perform pg_temp.expect_error(format('select public.answer_complaints_book_entry(%L, %L)', entry, 'Otra vez'), 'COMPLAINT_NOT_ANSWERABLE');
  perform pg_temp.expect_error(format('select public.answer_complaints_book_entry(%L, %L)', entry, 'x'), 'COMPLAINT_ANSWER_INVALID');
  page := public.get_admin_complaints_book_page('answered', 1, 20);
  perform pg_temp.check((page->>'total')::integer = 1, 'status filter');
  perform pg_temp.expect_error($q$select public.get_admin_complaints_book_page('cerrado', 1, 20)$q$, 'ADMIN_PAGINATION_INVALID');
  perform pg_temp.expect_error($q$select public.get_admin_complaints_book_page(null, 1, 51)$q$, 'ADMIN_PAGINATION_INVALID');
end $$;
reset role;

rollback;
